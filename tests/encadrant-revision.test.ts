/* ============================================================
   Récap du mode Révision espacée (#423) — vue ENCADRANT de la file.
   ------------------------------------------------------------
   Cible : les fonctions PURES ajoutées en bas de encadrant-stats.ts
   (libellePalier, echelleRevisionLabels, libelleEcheanceRevision,
   revisionProfil). Les attendus sont DÉRIVÉS de la sémantique #45
   (REVISION_INTERVALLES = [1, 3, 7, 16, 35, 75] jours ; PALIER_ACQUIS = 6)
   et recalculés à la main — jamais recopiés de l'implémentation.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	libellePalier,
	echelleRevisionLabels,
	libelleEcheanceRevision,
	revisionProfil,
} from '../src/core/encadrant-stats';
import {
	initProfiles,
	activeProfile,
	addProfile,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import { LESSON_REVISION_KEY } from '../src/core/progress';
import { ORTHO_KEY, emptyOrthoState } from '../src/core/orthographe/store';
import { ORTHO_CATEGORY_ID, getLessonsByCategory, getLessonById } from '../src/core/catalog';
import { JOUR, PALIER_ACQUIS } from '../src/core/revision';
import type { EtatRevision, MotOrtho, OrthoState } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- libellePalier : intervalle courant, dérivé des intervalles ----------
   REVISION_INTERVALLES (jours) = [1, 3, 7, 16, 35, 75] ; règle du code de conversion
   jours→libellé : < 7 j → « N jour(s) » ; < 30 j → semaines arrondies ; sinon mois
   arrondis ; palier ≥ 6 → ''. Je recalcule chaque libellé indépendamment. */
describe('libellePalier', () => {
	it('phase rapprochée exprimée en jours (paliers 0 et 1)', () => {
		expect(libellePalier(0)).toBe('1 jour'); // 1 j → singulier
		expect(libellePalier(1)).toBe('3 jours'); // 3 j → pluriel
	});
	it('espacement moyen exprimé en semaines (paliers 2 et 3)', () => {
		expect(libellePalier(2)).toBe('1 semaine'); // 7 j → 7/7 = 1 sem
		expect(libellePalier(3)).toBe('2 semaines'); // 16 j → round(16/7)=2 sem
	});
	it('espacement long exprimé en mois (paliers 4 et 5)', () => {
		expect(libellePalier(4)).toBe('1 mois'); // 35 j → round(35/30)=1 mois
		expect(libellePalier(5)).toBe('3 mois'); // 75 j → round(2,5)=3 mois (arrondi au sup.)
	});
	it('palier acquis (≥ 6) → libellé vide', () => {
		expect(libellePalier(6)).toBe('');
		expect(libellePalier(7)).toBe(''); // au-delà de l'escalier
		expect(libellePalier(PALIER_ACQUIS)).toBe('');
	});
});

describe('echelleRevisionLabels', () => {
	it('escalier complet : 6 intervalles + « acquis » (longueur 7)', () => {
		expect(echelleRevisionLabels()).toEqual([
			'1 jour',
			'3 jours',
			'1 semaine',
			'2 semaines',
			'1 mois',
			'3 mois',
			'acquis',
		]);
		expect(echelleRevisionLabels()).toHaveLength(7);
	});
});

/* ---------- libelleEcheanceRevision : différence en jours CALENDAIRES ----------
   Attention : c'est un arrondi de début-de-jour à début-de-jour (pas une soustraction
   de ms brute). Je construis des Date locales explicites pour maîtriser le jour
   calendaire indépendamment du fuseau (juin → pas de bascule d'heure d'été). */
describe('libelleEcheanceRevision', () => {
	const ts = (y: number, mo: number, d: number, h: number, mi = 0) =>
		new Date(y, mo, d, h, mi, 0, 0).getTime();
	const NOW = ts(2026, 5, 15, 12); // 15 juin 2026, 12:00 local

	it('échéance inconnue (null) → chaîne vide', () => {
		expect(libelleEcheanceRevision(null, NOW)).toBe('');
	});
	it('même jour calendaire, heure PLUS TARD → « aujourd’hui » (pas « demain »)', () => {
		expect(libelleEcheanceRevision(ts(2026, 5, 15, 21), NOW)).toBe("à réviser aujourd'hui");
	});
	it('même jour calendaire, heure PLUS TÔT → « aujourd’hui » (pas « en retard »)', () => {
		// L'échéance est passée de quelques heures MAIS reste aujourd'hui : pas de retard.
		expect(libelleEcheanceRevision(ts(2026, 5, 15, 8), ts(2026, 5, 15, 15))).toBe(
			"à réviser aujourd'hui",
		);
	});
	it('lendemain → « demain »', () => {
		expect(libelleEcheanceRevision(ts(2026, 5, 16, 7), NOW)).toBe('à réviser demain');
	});
	it('dans plusieurs jours → « dans N jours »', () => {
		expect(libelleEcheanceRevision(ts(2026, 5, 18, 12), NOW)).toBe('à réviser dans 3 jours');
	});
	it('en retard d’un jour → singulier', () => {
		expect(libelleEcheanceRevision(ts(2026, 5, 14, 20), ts(2026, 5, 15, 10))).toBe(
			'en retard de 1 jour',
		);
	});
	it('en retard de plusieurs jours → pluriel', () => {
		expect(libelleEcheanceRevision(ts(2026, 5, 13, 12), NOW)).toBe('en retard de 2 jours');
	});
	// Passage de minuit : ~1 h d'écart réel mais de part et d'autre de minuit → c'est le
	// JOUR CALENDAIRE qui tranche, pas les millisecondes (une soustraction de ms dirait « aujourd'hui »).
	it('passage de minuit vers l’avant → « demain » malgré ~1 h d’écart', () => {
		expect(libelleEcheanceRevision(ts(2026, 5, 16, 0, 30), ts(2026, 5, 15, 23, 30))).toBe(
			'à réviser demain',
		);
	});
	it('passage de minuit vers l’arrière → « en retard de 1 jour » malgré ~1 h d’écart', () => {
		expect(libelleEcheanceRevision(ts(2026, 5, 15, 23, 30), ts(2026, 5, 16, 0, 30))).toBe(
			'en retard de 1 jour',
		);
	});
});

/* ---------- revisionProfil : projection de la file par profil (UUID) ---------- */
const H = 3_600_000;

function etat(palier: number, prochaineRevision: number | null): EtatRevision {
	return { palier, prochaineRevision, reussites: palier, dernierTest: null };
}
function etatAcquis(): EtatRevision {
	return {
		palier: PALIER_ACQUIS,
		prochaineRevision: null,
		reussites: PALIER_ACQUIS,
		dernierTest: null,
	};
}
function motOrtho(id: string, mot: string, revision: EtatRevision): MotOrtho {
	return {
		id,
		mot,
		entourage: [],
		atelierFait: false,
		validation: { motCache: false, tuiles: false, dictee: false },
		revision,
		origine: 'liste',
	};
}
/* Écriture BRUTE dans le profil ciblé (clé `uuid/KEY`), sur le modèle de l'espace encadrant. */
function seed(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}

/* Scénario multi-catégories / multi-natures, calé sur un `now` fixe. Les paliers et
   échéances sont choisis pour que chaque flag et chaque position de tri soit prédictible :
   - math-numeration : 1 leçon future (+10 j)
   - math-calcul-mental : en retard 2 j / dû aujourd'hui / dans 4 j / acquis
   - fr-orthographe (mots) : en retard 5 j / acquis / 2 × dans 2 j (test d'égalité alpha)
   - `zzz@ce2` : leçon hors catalogue → doit être ignorée. */
function scenario(now: number) {
	const p = activeProfile();
	const numLesson = getLessonsByCategory('math-numeration', 'ce2')[0];
	if (!numLesson) throw new Error('catalogue sans leçon de numération ce2 : test à réviser');

	seed(p.uuid, LESSON_REVISION_KEY, {
		'math-complements@ce2': etat(1, now - 2 * JOUR), // en retard 2 j
		'math-doubles@ce2': etat(0, now - 3 * H), // dû aujourd'hui (échu ce matin)
		'math-moities@ce2': etat(2, now + 4 * JOUR), // dans 4 j
		'math-tables-addition@ce2': etatAcquis(), // acquis
		[numLesson.id + '@ce2']: etat(4, now + 10 * JOUR), // dans 10 j (catégorie numération)
		'zzz@ce2': etat(1, now + JOUR), // hors catalogue → ignorée
	});
	const ortho: OrthoState = {
		...emptyOrthoState(),
		banque: {
			w1: motOrtho('w1', 'chateau', etat(3, now - 5 * JOUR)), // en retard 5 j
			w2: motOrtho('w2', 'abricot', etatAcquis()), // acquis
			w3: motOrtho('w3', 'avion', etat(1, now + 2 * JOUR)), // dans 2 j
			w4: motOrtho('w4', 'zebre', etat(1, now + 2 * JOUR)), // dans 2 j (égalité avec avion)
		},
	};
	seed(p.uuid, ORTHO_KEY, ortho);

	return { p, numLesson, recap: revisionProfil(p, now) };
}

describe('revisionProfil', () => {
	const NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();

	it('regroupe par catégorie dans l’ordre du catalogue, mots rattachés à l’orthographe', () => {
		const { recap } = scenario(NOW);
		// Numération (idx 0) < Calcul mental (idx 2) < Orthographe (idx 8) dans CATEGORIES.
		expect(recap.groupes.map((g) => g.categoryId)).toEqual([
			'math-numeration',
			'math-calcul-mental',
			ORTHO_CATEGORY_ID,
		]);
		const ortho = recap.groupes.find((g) => g.categoryId === ORTHO_CATEGORY_ID)!;
		expect(ortho.subject).toBe('francais');
		expect(ortho.entrees.every((e) => e.nature === 'mot')).toBe(true);
		expect(ortho.entrees.map((e) => e.cle)).toContain('mot:w1');
	});

	it('positionne chaque entrée : palier, libellé d’intervalle, échéance, flags', () => {
		const { recap, numLesson } = scenario(NOW);
		const e = (cle: string) => recap.parUrgence.find((x) => x.cle === cle)!;

		expect(e('math-complements@ce2')).toMatchObject({
			nature: 'lecon',
			categoryId: 'math-calcul-mental',
			palier: 1,
			palierLabel: '3 jours',
			echeance: 'en retard de 2 jours',
			acquis: false,
			du: true,
			joursRestants: -2,
		});
		expect(e('math-doubles@ce2')).toMatchObject({
			palier: 0,
			palierLabel: '1 jour',
			echeance: "à réviser aujourd'hui",
			acquis: false,
			du: true, // échéance aujourd'hui (jours restants 0) → dû
			joursRestants: 0,
		});
		expect(e('math-moities@ce2')).toMatchObject({
			palier: 2,
			palierLabel: '1 semaine',
			echeance: 'à réviser dans 4 jours',
			du: false,
			joursRestants: 4,
		});
		expect(e('math-tables-addition@ce2')).toMatchObject({
			palier: PALIER_ACQUIS,
			palierLabel: '', // acquis → pas d'intervalle
			echeance: '', // acquis → pas d'échéance
			acquis: true,
			du: false,
			joursRestants: null,
			prochaineRevision: null,
		});
		expect(e(numLesson.id + '@ce2')).toMatchObject({
			categoryId: 'math-numeration',
			palier: 4,
			palierLabel: '1 mois',
			echeance: 'à réviser dans 10 jours',
			joursRestants: 10,
		});
		expect(e('mot:w1')).toMatchObject({
			nature: 'mot',
			label: 'chateau',
			categoryId: ORTHO_CATEGORY_ID,
			palier: 3,
			palierLabel: '2 semaines',
			echeance: 'en retard de 5 jours',
			du: true,
			joursRestants: -5,
		});
		expect(e('mot:w2')).toMatchObject({ acquis: true, du: false, echeance: '' });
	});

	it('trie parUrgence : plus en retard d’abord, futures ensuite, acquises en dernier ; égalité → alpha', () => {
		const { recap, numLesson } = scenario(NOW);
		// Attendu recalculé à la main par jours restants croissants (acquises rejetées en fin,
		// classées entre elles alphabétiquement : « abricot » avant « Tables d'addition »).
		expect(recap.parUrgence.map((e) => e.label)).toEqual([
			'chateau', // -5
			'Complément à 10/100/1000', // -2
			'Doubles', // 0
			'avion', // +2  (avion < zebre)
			'zebre', // +2
			'Moitiés', // +4
			numLesson.label, // +10
			'abricot', // acquis
			"Tables d'addition", // acquis
		]);
	});

	it('trie chaque groupe indépendamment (dues d’abord, acquises en fin)', () => {
		const { recap } = scenario(NOW);
		const cm = recap.groupes.find((g) => g.categoryId === 'math-calcul-mental')!;
		expect(cm.entrees.map((e) => e.cle)).toEqual([
			'math-complements@ce2', // -2
			'math-doubles@ce2', // 0
			'math-moities@ce2', // +4
			'math-tables-addition@ce2', // acquis en dernier
		]);
		const ortho = recap.groupes.find((g) => g.categoryId === ORTHO_CATEGORY_ID)!;
		expect(ortho.entrees.map((e) => e.label)).toEqual(['chateau', 'avion', 'zebre', 'abricot']);
	});

	it('compte total / enRotation / acquises / dues de façon cohérente entre eux', () => {
		const { recap } = scenario(NOW);
		expect(recap.total).toBe(9); // 5 leçons valides + 4 mots (zzz exclu)
		expect(recap.acquises).toBe(2); // math-tables-addition + abricot
		expect(recap.enRotation).toBe(7); // les 7 non acquises
		expect(recap.dues).toBe(3); // complements (retard), doubles (aujourd'hui), chateau (retard)

		// Invariants d'inclusion : dues ⊆ enRotation ⊆ total ; acquis + rotation = total.
		expect(recap.dues).toBeLessThanOrEqual(recap.enRotation);
		expect(recap.enRotation).toBeLessThanOrEqual(recap.total);
		expect(recap.enRotation + recap.acquises).toBe(recap.total);

		// Cohérence groupes ↔ totaux globaux.
		const sum = (f: (g: (typeof recap.groupes)[number]) => number) =>
			recap.groupes.reduce((n, g) => n + f(g), 0);
		expect(sum((g) => g.entrees.length)).toBe(recap.total);
		expect(sum((g) => g.enRotation)).toBe(recap.enRotation);
		expect(sum((g) => g.acquises)).toBe(recap.acquises);
		expect(sum((g) => g.dues)).toBe(recap.dues);

		// Par groupe.
		const cm = recap.groupes.find((g) => g.categoryId === 'math-calcul-mental')!;
		expect([cm.enRotation, cm.acquises, cm.dues]).toEqual([3, 1, 2]);
		const ortho = recap.groupes.find((g) => g.categoryId === ORTHO_CATEGORY_ID)!;
		expect([ortho.enRotation, ortho.acquises, ortho.dues]).toEqual([3, 1, 1]);
	});

	it('ignore une leçon absente du catalogue (ni compteur ni groupe)', () => {
		const { recap } = scenario(NOW);
		expect(recap.parUrgence.some((e) => e.cle === 'zzz@ce2')).toBe(false);
		expect(recap.groupes.some((g) => g.entrees.some((e) => e.cle === 'zzz@ce2'))).toBe(false);
	});

	it('ignore les états malformés (null, palier non numérique)', () => {
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-complements@ce2': etat(0, NOW), // seule entrée valide
			'math-doubles@ce2': null, // état absent → ignoré
			'math-moities@ce2': { palier: 'x', prochaineRevision: null, reussites: 0, dernierTest: null }, // palier non numérique → ignoré
		});
		const recap = revisionProfil(p, NOW);
		expect(recap.total).toBe(1);
		expect(recap.parUrgence[0].cle).toBe('math-complements@ce2');
	});

	it('profil sans aucune donnée → récap vide', () => {
		const recap = revisionProfil(activeProfile(), NOW);
		expect(recap.total).toBe(0);
		expect(recap.enRotation).toBe(0);
		expect(recap.acquises).toBe(0);
		expect(recap.dues).toBe(0);
		expect(recap.groupes).toEqual([]);
		expect(recap.parUrgence).toEqual([]);
	});

	it('INVARIANT : consulter un profil par UUID ne bascule pas le profil actif', () => {
		const a = activeProfile();
		seed(a.uuid, LESSON_REVISION_KEY, { 'math-doubles@ce2': etat(0, NOW) });
		const b = addProfile('Profil B'); // devient actif
		const recap = revisionProfil(a, NOW); // on consulte A, pas l'actif
		expect(recap.total).toBe(1); // les données de A sont bien lues par UUID
		expect(activeProfile().uuid).toBe(b.uuid); // l'actif reste B
	});
});

/* ---------- Filtrage par niveau actif de la matière (#423, non-régression) ----------
   Les clés de `ludaskia_lessonRevision` sont namespacées `lessonId@niveau`. Le moteur
   ne révise que le niveau ACTIF de la matière (scopeActif). Une leçon révisée aux deux
   niveaux (ou une clé restée après changement de classe) doit donc n'apparaître qu'UNE
   fois dans le récap, au niveau actif — sinon doublon / entrée « fantôme » jamais
   reproposable. Les mots d'ortho ne sont pas namespacés → hors périmètre du filtre. */
describe('revisionProfil : filtre par niveau actif de la matière (#423)', () => {
	const NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();
	const BI = 'num-comparer'; // leçon maths multi-niveaux (numération)

	it('pré-condition : num-comparer déclare bien ce2 ET cm1', () => {
		const lesson = getLessonById(BI)!;
		expect(lesson.subject).toBe('math');
		expect(lesson.category).toBe('math-numeration');
		expect(lesson.levels).toContain('ce2');
		expect(lesson.levels).toContain('cm1');
	});

	it('leçon révisée aux DEUX niveaux → une seule entrée, celle du niveau actif (cm1)', () => {
		const a = activeProfile();
		const profilCm1: Profile = { ...a, niveauParMatiere: { math: 'cm1' } };
		seed(a.uuid, LESSON_REVISION_KEY, {
			[BI + '@ce2']: etat(1, NOW - 2 * JOUR), // clé DORMANTE (ancien niveau) = fantôme à écarter
			[BI + '@cm1']: etat(3, NOW + 4 * JOUR), // niveau actif = seule à garder
		});
		const recap = revisionProfil(profilCm1, NOW);

		expect(recap.total).toBe(1); // pas de doublon
		expect(recap.parUrgence.map((e) => e.cle)).toEqual([BI + '@cm1']);
		// C'est bien l'entrée @cm1 (palier 3 → « 2 semaines », dans 4 j) qui survit, pas la
		// @ce2 (palier 1, en retard) : le filtre garde le niveau actif, pas le premier venu.
		expect(recap.parUrgence[0]).toMatchObject({
			palier: 3,
			palierLabel: '2 semaines',
			echeance: 'à réviser dans 4 jours',
		});
		expect(recap.parUrgence.some((e) => e.cle === BI + '@ce2')).toBe(false);
		expect(recap.groupes).toHaveLength(1);
		expect(recap.groupes[0].categoryId).toBe('math-numeration');
		expect(recap.groupes[0].entrees.map((e) => e.cle)).toEqual([BI + '@cm1']);
	});

	it('leçon présente uniquement à l’ANCIEN niveau (@cm1) sous un profil ce2 → exclue', () => {
		const a = activeProfile(); // niveau maths par défaut = ce2
		seed(a.uuid, LESSON_REVISION_KEY, { [BI + '@cm1']: etat(2, NOW - JOUR) });
		const recap = revisionProfil(a, NOW);
		expect(recap.total).toBe(0);
		expect(recap.groupes).toEqual([]);
		expect(recap.parUrgence).toEqual([]);
	});

	it('le filtre par niveau n’affecte PAS les mots d’orthographe (non namespacés)', () => {
		const a = activeProfile();
		const profilCm1: Profile = { ...a, niveauParMatiere: { math: 'cm1' } };
		seed(a.uuid, LESSON_REVISION_KEY, { [BI + '@ce2']: etat(1, NOW - JOUR) }); // leçon @ce2 dormante → écartée
		const ortho: OrthoState = {
			...emptyOrthoState(),
			banque: { w1: motOrtho('w1', 'chateau', etat(2, NOW + JOUR)) },
		};
		seed(a.uuid, ORTHO_KEY, ortho);
		const recap = revisionProfil(profilCm1, NOW);

		expect(recap.total).toBe(1); // leçon @ce2 filtrée, mot conservé
		expect(recap.parUrgence.map((e) => e.cle)).toEqual(['mot:w1']);
		expect(recap.groupes.map((g) => g.categoryId)).toEqual([ORTHO_CATEGORY_ID]);
	});
});
