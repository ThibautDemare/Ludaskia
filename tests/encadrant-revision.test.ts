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
	niveauProfilMatiere,
	type RecapRevision,
	type EntreeRevision,
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
import {
	ORTHO_CATEGORY_ID,
	getLessonsByCategory,
	getLessonById,
	getAllLessons,
} from '../src/core/catalog';
import { JOUR, PALIER_ACQUIS } from '../src/core/revision';
import type { EtatRevision, MotOrtho, OrthoState } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Les six marches de l'escalier, EN CLAIR : recalculées à la main depuis
   REVISION_INTERVALLES = [1, 3, 7, 16, 35, 75] jours (cf. describe ci-dessous), pour servir
   de référence indépendante aux tests qui croisent libellé de ligne et en-tête d'étage. */
const MARCHES = ['1 jour', '3 jours', '1 semaine', '2 semaines', '1 mois', '3 mois'] as const;

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

	/* PALIERS CORROMPUS (import d'un profil, écriture concurrente) : le garde
	   `Number.isFinite` du récap les laisse passer jusqu'ici, donc ce libellé s'affiche tel
	   quel à l'adulte (« Palier : … » dans les vues Catégorie et Urgence). Ma dérivation du
	   contrat : sous l'escalier → la première marche (rien n'est moins ancré que le pied) ;
	   entre deux marches → la marche COMMENCÉE, celle du dessous (on n'est au 6e étage qu'une
	   fois arrivé) ; au niveau du sommet ou au-dessus → '' (acquis, badge dédié). */
	it('palier corrompu → toujours une marche de l’escalier (jamais de calcul sur du vide)', () => {
		expect(libellePalier(-3)).toBe('1 jour'); // sous l'escalier → pied
		expect(libellePalier(-0.5)).toBe('1 jour');
		expect(libellePalier(0.5)).toBe('1 jour'); // marche 0 commencée
		expect(libellePalier(2.4)).toBe('1 semaine'); // marche 2 (7 j), pas la 3
		expect(libellePalier(3.9)).toBe('2 semaines'); // marche 3 (16 j), pas la 4
		expect(libellePalier(5.5)).toBe('3 mois'); // dernière marche : PAS encore acquis
		expect(libellePalier(5.999)).toBe('3 mois');
		expect(libellePalier(6.7)).toBe(''); // au-delà du sommet → acquis
	});

	it('ÉCHANTILLON : aucun palier, même absurde, ne produit « NaN »', () => {
		const admissibles: string[] = [...MARCHES, ''];
		for (const p of [-1e6, -100, -7.5, -1, -0.001, 0, 0.999, 1.5, 4.5, 5.999, 6, 42, 1e6]) {
			const label = libellePalier(p);
			expect(label).not.toContain('NaN'); // « Palier : NaN mois » était affiché à l'adulte
			expect(admissibles).toContain(label);
		}
		// Et l'escalier de la légende reste exactement les 6 marches + le sommet nommé.
		expect(echelleRevisionLabels()).toEqual([...MARCHES, 'acquis']);
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

/* ---------- Filtrage par niveau de la matière (#423, étendu par #232) ----------
   Les clés de `ludaskia_lessonRevision` sont namespacées `lessonId@niveau`. Le récap doit
   montrer ce que le moteur RÉVISE VRAIMENT, ni plus ni moins :
     - le niveau ACTIF de la matière ;
     - depuis #232, le niveau immédiatement INFÉRIEUR, qu'une séance entretient à dose
       plafonnée (ces clés ne sont plus dormantes) — marquées par `niveauOrigine` ;
     - tout le reste (au-dessus du niveau suivi, ou à plus d'un niveau en dessous) reste
       masqué : ce sont de vrais fantômes, « en retard » à jamais et jamais reproposés.
   Les mots d'ortho ne sont pas namespacés → hors périmètre du filtre. */
describe('revisionProfil : filtre par niveau de la matière (#423 / #232)', () => {
	const NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();
	const BI = 'num-comparer'; // leçon maths multi-niveaux (numération)
	const NOYAU = 'fr-gram-clic-noyau'; // leçon FR multi-niveaux à libellé PAR NIVEAU (#436)

	it('pré-condition : num-comparer déclare bien ce2 ET cm1', () => {
		const lesson = getLessonById(BI)!;
		expect(lesson.subject).toBe('math');
		expect(lesson.category).toBe('math-numeration');
		expect(lesson.levels).toContain('ce2');
		expect(lesson.levels).toContain('cm1');
	});

	it('leçon révisée aux DEUX niveaux → deux entrées distinctes, dont l’entretien @ce2', () => {
		const a = activeProfile();
		const profilCm1: Profile = { ...a, niveauParMatiere: { math: 'cm1' } };
		seed(a.uuid, LESSON_REVISION_KEY, {
			[BI + '@ce2']: etat(1, NOW - 2 * JOUR), // niveau inférieur = entretenu (#232) → affiché
			[BI + '@cm1']: etat(3, NOW + 4 * JOUR), // niveau actif
		});
		const recap = revisionProfil(profilCm1, NOW);

		// Les deux entrées sont là (l'entretien n'est plus dormant), et restent distinguables :
		// même libellé de leçon, mais une seule porte un niveau d'origine.
		expect(recap.total).toBe(2);
		// Tri par urgence : l'entrée @ce2 est en retard de 2 j, la @cm1 est due dans 4 j.
		expect(recap.parUrgence.map((e) => e.cle)).toEqual([BI + '@ce2', BI + '@cm1']);
		expect(recap.parUrgence[0]).toMatchObject({
			palier: 1,
			palierLabel: '3 jours',
			echeance: 'en retard de 2 jours',
			du: true,
			niveauOrigine: 'ce2', // seule marque visible de l'entretien (côté adulte only)
		});
		expect(recap.parUrgence[1]).toMatchObject({
			palier: 3,
			palierLabel: '2 semaines',
			echeance: 'à réviser dans 4 jours',
			du: false,
		});
		expect(recap.parUrgence[1].niveauOrigine).toBeUndefined(); // niveau actif → pas de marque
		// Une seule catégorie : l'entretien se lit DANS le bloc de sa notion, comme en séance.
		expect(recap.groupes).toHaveLength(1);
		expect(recap.groupes[0].categoryId).toBe('math-numeration');
		expect(recap.groupes[0].entrees.map((e) => e.cle)).toEqual([BI + '@ce2', BI + '@cm1']);
		expect([recap.groupes[0].enRotation, recap.groupes[0].dues]).toEqual([2, 1]);
	});

	it('l’entretien porte le libellé de SON niveau, pas celui de la classe suivie', () => {
		// Le cas qui rend `niveauOrigine` indispensable : deux entrées de la même leçon dans
		// la même catégorie. Ici les libellés diffèrent (#436), ce qui lève l'ambiguïté.
		const lesson = getLessonById(NOYAU)!;
		expect(lesson.labelNiveau).toEqual({
			ce2: 'Clique sur le nom',
			cm1: 'Clique sur le nom noyau',
		});
		const a = activeProfile();
		const profilCm1: Profile = { ...a, niveauParMatiere: { francais: 'cm1' } };
		seed(a.uuid, LESSON_REVISION_KEY, {
			[NOYAU + '@ce2']: etat(0, NOW - JOUR), // entretien
			[NOYAU + '@cm1']: etat(2, NOW - 3 * JOUR), // niveau actif, plus en retard
		});
		const recap = revisionProfil(profilCm1, NOW);
		expect(recap.parUrgence.map((e) => [e.cle, e.label, e.niveauOrigine])).toEqual([
			[NOYAU + '@cm1', 'Clique sur le nom noyau', undefined],
			[NOYAU + '@ce2', 'Clique sur le nom', 'ce2'],
		]);
	});

	it('leçon présente uniquement à l’ANCIEN niveau (@cm1) sous un profil ce2 → exclue', () => {
		// Toujours vrai après #232 : on n'entretient QUE vers le bas. Une clé au-dessus du
		// niveau suivi (enfant redescendu en CE2) ne sera jamais reproposée → elle reste
		// masquée, sinon le parent verrait un « en retard » qu'il ne peut pas résorber.
		const a = activeProfile(); // niveau maths par défaut = ce2
		seed(a.uuid, LESSON_REVISION_KEY, { [BI + '@cm1']: etat(2, NOW - JOUR) });
		const recap = revisionProfil(a, NOW);
		expect(recap.total).toBe(0);
		expect(recap.groupes).toEqual([]);
		expect(recap.parUrgence).toEqual([]);
	});

	it('à plus d’UN niveau d’écart, la dette est abandonnée → entrée masquée', () => {
		const a = activeProfile();
		const profilCm2: Profile = { ...a, niveauParMatiere: { math: 'cm2' } };
		seed(a.uuid, LESSON_REVISION_KEY, {
			[BI + '@cm1']: etat(1, NOW - JOUR), // -1 niveau → entretenu
			[BI + '@ce2']: etat(1, NOW - 30 * JOUR), // -2 niveaux → abandonné, masqué
		});
		const recap = revisionProfil(profilCm2, NOW);
		expect(recap.parUrgence.map((e) => e.cle)).toEqual([BI + '@cm1']);
		expect(recap.parUrgence[0].niveauOrigine).toBe('cm1');
	});

	it('le filtre par niveau n’affecte PAS les mots d’orthographe (non namespacés)', () => {
		const a = activeProfile();
		const profilCm1: Profile = { ...a, niveauParMatiere: { math: 'cm1' } };
		const ortho: OrthoState = {
			...emptyOrthoState(),
			banque: { w1: motOrtho('w1', 'chateau', etat(2, NOW + JOUR)) },
		};
		seed(a.uuid, ORTHO_KEY, ortho);
		// Deux clés de leçon RÉELLEMENT dormantes (au-dessus du niveau suivi, et à 2 niveaux
		// en dessous) : le filtre les écarte, le mot n'est jamais concerné.
		seed(a.uuid, LESSON_REVISION_KEY, {
			[BI + '@cm2']: etat(1, NOW - JOUR),
			[BI + '@ce1']: etat(1, NOW - JOUR),
		});
		let recap = revisionProfil(profilCm1, NOW);
		expect(recap.total).toBe(1); // les 2 leçons filtrées, mot conservé
		expect(recap.parUrgence.map((e) => e.cle)).toEqual(['mot:w1']);
		expect(recap.groupes.map((g) => g.categoryId)).toEqual([ORTHO_CATEGORY_ID]);

		// Et le mot reste exactement le même quand une leçon d'entretien s'ajoute : lui seul
		// n'a pas de niveau, donc jamais de `niveauOrigine`.
		seed(a.uuid, LESSON_REVISION_KEY, { [BI + '@ce2']: etat(1, NOW - JOUR) });
		recap = revisionProfil(profilCm1, NOW);
		expect(recap.total).toBe(2);
		const mot = recap.parUrgence.find((e) => e.cle === 'mot:w1')!;
		expect(mot.niveauOrigine).toBeUndefined();
		expect(mot).toMatchObject({ nature: 'mot', label: 'chateau', du: false });
		expect(recap.parUrgence.find((e) => e.cle === BI + '@ce2')!.niveauOrigine).toBe('ce2');
	});
});

/* ---------- Vue « par palier » (#555) : les étages de l'escalier ----------
   Troisième projection de la MÊME file : un étage par palier, du moins ancré au sommet.
   Les attendus sont dérivés de la sémantique #45 (escalier 1 j → 3 j → 1 sem → 2 sem →
   1 mois → 3 mois → acquis, PALIER_ACQUIS = 6) et des paliers posés dans les scénarios,
   recalculés à la main — jamais lus dans l'implémentation. */
describe('revisionProfil : vue par palier (#555)', () => {
	const NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();

	/* L'INVARIANT le plus important du bloc : les trois vues décrivent la même file.
	   Une entrée qui disparaîtrait d'une vue — ou y serait comptée deux fois — rendrait
	   le suivi silencieusement faux (le parent croirait tout voir). */
	function memesEntreesDansLesTroisVues(recap: RecapRevision): void {
		const cles = (es: EntreeRevision[]) => es.map((e) => e.cle).sort();
		const desGroupes = recap.groupes.flatMap((g) => g.entrees);
		const desPaliers = recap.parPalier.flatMap((p) => p.entrees);
		expect(cles(desPaliers)).toEqual(cles(recap.parUrgence));
		expect(cles(desGroupes)).toEqual(cles(recap.parUrgence));
		// Aucun doublon : un étage ne « repêche » pas une entrée déjà classée ailleurs.
		expect(new Set(desPaliers.map((e) => e.cle)).size).toBe(desPaliers.length);
		expect(desPaliers).toHaveLength(recap.total);
		// Et les mêmes OBJETS d'entrée (mêmes champs), pas des copies recalculées à part.
		for (const e of desPaliers) expect(recap.parUrgence).toContain(e);
	}
	const sommeEtages = (
		recap: RecapRevision,
		f: (p: RecapRevision['parPalier'][number]) => number,
	) => recap.parPalier.reduce((n, p) => n + f(p), 0);

	it('un étage par palier PRÉSENT, du bas de l’escalier vers l’acquis ; étages vides omis', () => {
		const { recap } = scenario(NOW);
		// Paliers posés par le scénario : 0 (doubles), 1 (complements, avion, zebre),
		// 2 (moitiés), 3 (chateau), 4 (numération), 6 (2 acquises). Le palier 5 n'a
		// aucune entrée → pas d'étage émis (comme une catégorie sans entrée).
		expect(recap.parPalier.map((p) => p.palier)).toEqual([0, 1, 2, 3, 4, 6]);
		expect(recap.parPalier.map((p) => p.label)).toEqual([
			'1 jour',
			'3 jours',
			'1 semaine',
			'2 semaines',
			'1 mois',
			'acquis', // le sommet est NOMMÉ (libellePalier y rend '') : sinon en-tête vide
		]);
		expect(recap.parPalier.map((p) => p.acquis)).toEqual([false, false, false, false, false, true]);
		// Ordre strictement croissant (pas seulement « trié ») : un étage par palier, pas deux.
		const paliers = recap.parPalier.map((p) => p.palier);
		expect(paliers.every((v, i) => i === 0 || v > paliers[i - 1])).toBe(true);
	});

	it('à l’intérieur d’un étage : leçons et mots mélangés, tri par urgence, égalité → alpha', () => {
		const { recap } = scenario(NOW);
		const etage1 = recap.parPalier.find((p) => p.palier === 1)!;
		// Palier 1 = 1 leçon (en retard de 2 j) + 2 mots (dans 2 j) : le retard d'abord,
		// puis « avion » avant « zebre » à échéance égale. Les mots ne sont pas relégués
		// après les leçons : l'étage est une file unique, comme la vue par urgence.
		expect(etage1.entrees.map((e) => e.label)).toEqual([
			'Complément à 10/100/1000',
			'avion',
			'zebre',
		]);
		expect(etage1.entrees.map((e) => e.nature)).toEqual(['lecon', 'mot', 'mot']);
		// Et l'ordre relatif d'un étage est celui de la vue à plat, restreinte à cet étage.
		const attendu = recap.parUrgence.filter((e) => e.palier === 1).map((e) => e.cle);
		expect(etage1.entrees.map((e) => e.cle)).toEqual(attendu);
	});

	it('chaque entrée est rangée sur SON étage, dont elle porte le libellé d’intervalle', () => {
		const { recap } = scenario(NOW);
		for (const p of recap.parPalier) {
			for (const e of p.entrees) {
				expect(e.palier).toBe(p.palier);
				expect(e.acquis).toBe(p.acquis);
				// Non acquis : l'en-tête d'étage porte l'intervalle que la ligne affichait
				// dans les autres vues (l'UI masque alors le palier ligne à ligne).
				if (!p.acquis) expect(e.palierLabel).toBe(p.label);
				else expect(e.palierLabel).toBe(''); // acquis : plus d'intervalle courant
			}
		}
	});

	it('dues par étage = entrées échues, et les sommes recollent aux compteurs globaux', () => {
		const { recap } = scenario(NOW);
		// Échéances du scénario : doubles échu ce matin (étage 0), complements en retard
		// de 2 j (étage 1), chateau en retard de 5 j (étage 3). Les autres sont futures.
		expect(recap.parPalier.map((p) => [p.palier, p.dues])).toEqual([
			[0, 1],
			[1, 1],
			[2, 0],
			[3, 1],
			[4, 0],
			[6, 0], // un acquis n'est jamais « à réviser »
		]);
		expect(sommeEtages(recap, (p) => p.dues)).toBe(recap.dues);
		expect(sommeEtages(recap, (p) => p.entrees.length)).toBe(recap.total);
		// Rotation vs acquis : l'étage sommital porte exactement les acquises.
		const sommet = recap.parPalier.find((p) => p.acquis)!;
		expect(sommet.entrees).toHaveLength(recap.acquises);
		expect(sommeEtages(recap, (p) => (p.acquis ? 0 : p.entrees.length))).toBe(recap.enRotation);
		// Et chaque `dues` d'étage est bien un dénombrement de ses propres entrées.
		for (const p of recap.parPalier) expect(p.dues).toBe(p.entrees.filter((e) => e.du).length);
	});

	it('INVARIANT : les trois vues contiennent exactement les mêmes entrées', () => {
		const { recap } = scenario(NOW);
		memesEntreesDansLesTroisVues(recap);
	});

	/* Échantillon large : tout le catalogue jouable par le profil, chaque palier et chaque
	   position d'échéance représentés. C'est le filet qui attrape une entrée qui se
	   perdrait dans UNE seule vue (ex. une leçon dont la catégorie ne serait pas dans
	   CATEGORIES disparaîtrait de `groupes` sans que rien ne le signale). */
	it('ÉCHANTILLON (catalogue entier) : aucune entrée perdue ni dupliquée, 7 étages peuplés', () => {
		const p = activeProfile();
		const store: Record<string, EtatRevision> = {};
		let i = 0;
		for (const lesson of getAllLessons()) {
			const niveau = niveauProfilMatiere(p, lesson.subject);
			if (!lesson.levels.includes(niveau)) continue; // seules les clés que le moteur écrit
			const palier = i % (PALIER_ACQUIS + 1); // 0..6, tous les étages
			const decalage = ((i * 5) % 21) - 10; // -10..+10 j : retard, aujourd'hui, futur
			store[lesson.id + '@' + niveau] =
				palier >= PALIER_ACQUIS ? etatAcquis() : etat(palier, NOW + decalage * JOUR);
			i++;
		}
		expect(Object.keys(store).length).toBeGreaterThan(20); // échantillon significatif
		seed(p.uuid, LESSON_REVISION_KEY, store);

		const recap = revisionProfil(p, NOW);
		expect(recap.total).toBe(Object.keys(store).length); // aucune leçon du catalogue perdue
		memesEntreesDansLesTroisVues(recap);
		// Escalier complet et ordonné ; les en-têtes d'étages disent la même chose que la
		// légende affichée juste au-dessus dans le panneau.
		expect(recap.parPalier.map((x) => x.palier)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(recap.parPalier.map((x) => x.label)).toEqual(echelleRevisionLabels());
		expect(sommeEtages(recap, (x) => x.entrees.length)).toBe(recap.total);
		expect(sommeEtages(recap, (x) => x.dues)).toBe(recap.dues);
		// Chaque étage est trié comme la vue à plat restreinte à cet étage.
		for (const etage of recap.parPalier) {
			expect(etage.entrees.map((e) => e.cle)).toEqual(
				recap.parUrgence.filter((e) => e.palier === etage.palier).map((e) => e.cle),
			);
		}
	});

	/* États CORROMPUS : `Number.isFinite` laisse passer un palier négatif, hors escalier ou
	   non entier (import d'un profil, écriture concurrente, régression). L'exigence n'est
	   pas de les réparer, mais qu'ils ne fassent NI disparaître une entrée, NI ouvrir un
	   étage fantôme : l'escalier n'a que 7 marches. */
	it('palier corrompu (négatif, hors escalier, non entier) : atterrit sur un étage existant', () => {
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-complements@ce2': etat(-3, NOW - JOUR), // sous l'escalier → pied de l'escalier
			'math-doubles@ce2': etat(2.4, NOW + 3 * JOUR), // entre deux marches → une seule marche
			'math-moities@ce2': etat(9, NOW - 40 * JOUR), // au-dessus du sommet → déjà « acquis »
		});
		const recap = revisionProfil(p, NOW);

		expect(recap.total).toBe(3); // aucune n'est écartée
		memesEntreesDansLesTroisVues(recap);
		expect(recap.parPalier.map((x) => [x.palier, x.entrees.map((e) => e.cle)])).toEqual([
			[0, ['math-complements@ce2']],
			[2, ['math-doubles@ce2']],
			[PALIER_ACQUIS, ['math-moities@ce2']],
		]);
		expect(recap.parPalier.map((x) => x.label)).toEqual(['1 jour', '1 semaine', 'acquis']);
		// Un palier au-dessus du sommet est acquis pour le moteur (palier ≥ 6) : il sort de la
		// rotation, son retard de 40 j n'est plus une dette.
		expect(recap.acquises).toBe(1);
		expect(recap.enRotation).toBe(2);
		expect(recap.dues).toBe(1); // seule l'entrée en retard de 1 jour reste due
		expect(sommeEtages(recap, (x) => x.dues)).toBe(recap.dues);
		// Aucun étage hors de l'escalier, quoi qu'on lise dans le stockage.
		for (const x of recap.parPalier) {
			expect(Number.isInteger(x.palier)).toBe(true);
			expect(x.palier).toBeGreaterThanOrEqual(0);
			expect(x.palier).toBeLessThanOrEqual(PALIER_ACQUIS);
		}
	});

	/* FRONTIÈRE du sommet, de part et d'autre. Le moteur tranche « acquis » sur
	   `palier >= PALIER_ACQUIS` (revision.ts) : 5,5 est encore EN ROTATION (échéance, retard
	   possible), 6,7 est acquis. L'étage doit dire la MÊME chose que ce verdict, sinon
	   l'en-tête « Acquis » annonce « dont 1 à réviser » et la même entrée s'affiche
	   « Palier : 3 mois » dans la vue voisine. */
	it('frontière du sommet : 5,5 reste sur la dernière marche, 6,7 monte au sommet', () => {
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-complements@ce2': etat(5.5, NOW - JOUR), // en retard, mais pas acquis
			'math-doubles@ce2': etat(6.7, NOW - 40 * JOUR), // au-dessus du sommet → acquis
		});
		const recap = revisionProfil(p, NOW);
		memesEntreesDansLesTroisVues(recap);

		expect(recap.parPalier.map((x) => [x.palier, x.label, x.acquis, x.dues])).toEqual([
			[5, '3 mois', false, 1], // dernière marche : l'entrée y est encore due
			[PALIER_ACQUIS, 'acquis', true, 0], // sommet : plus aucune dette
		]);
		expect(recap.parPalier[0].entrees.map((e) => e.cle)).toEqual(['math-complements@ce2']);
		expect(recap.parPalier[0].entrees[0]).toMatchObject({
			acquis: false,
			du: true,
			palierLabel: '3 mois', // la ligne dit la même chose que son en-tête
		});
		expect(recap.parPalier[1].entrees[0]).toMatchObject({
			acquis: true,
			du: false,
			prochaineRevision: null, // le retard de 40 j n'est plus une dette
		});
		expect([recap.total, recap.enRotation, recap.acquises, recap.dues]).toEqual([2, 1, 1, 1]);
	});

	/* L'invariant qui verrouille l'équivalence étage sommital ↔ `estAcquis`, sur un
	   échantillon qui balaie les deux côtés de CHAQUE marche (valeurs corrompues comprises).
	   Sans lui, un simple arrondi suffit à ranger sous « Acquis » une notion encore en
	   rotation — le parent lit « acquis » là où l'enfant a encore du travail. */
	it('ÉCHANTILLON (paliers tordus) : sommet ⟺ acquis, et chaque ligne dit son en-tête', () => {
		// Ma dérivation, indépendante du code : ≥ sommet → sommet ; ≤ 0 → pied ; sinon la
		// marche commencée (partie entière).
		const etageAttendu = (palier: number) =>
			palier >= PALIER_ACQUIS ? PALIER_ACQUIS : palier <= 0 ? 0 : Math.trunc(palier);
		const TORDUS = [-5, -0.5, 0, 0.5, 1, 2.4, 3, 4.99, 5, 5.5, 5.999, 6, 6.7, 9];

		const p = activeProfile();
		const store: Record<string, EtatRevision> = {};
		const attendu: Record<string, number> = {}; // clé → étage que JE prédis
		let i = 0;
		for (const lesson of getAllLessons()) {
			const niveau = niveauProfilMatiere(p, lesson.subject);
			if (!lesson.levels.includes(niveau)) continue;
			const palier = TORDUS[i % TORDUS.length];
			const cle = lesson.id + '@' + niveau;
			store[cle] = etat(palier, NOW + (((i * 3) % 13) - 6) * JOUR); // retard / du jour / futur
			attendu[cle] = etageAttendu(palier);
			i++;
		}
		expect(i).toBeGreaterThan(TORDUS.length * 2); // chaque palier tordu tiré plusieurs fois
		seed(p.uuid, LESSON_REVISION_KEY, store);

		const recap = revisionProfil(p, NOW);
		memesEntreesDansLesTroisVues(recap);

		// 1. Chaque entrée est sur l'étage prédit — la répartition entière, pas un invariant mou.
		for (const etage of recap.parPalier) {
			for (const e of etage.entrees) expect([e.cle, etage.palier]).toEqual([e.cle, attendu[e.cle]]);
		}
		// 2. Sommet ⟺ acquis : l'étage sommital porte TOUTES les acquises et RIEN d'autre.
		const sommet = recap.parPalier.find((x) => x.acquis)!;
		expect(sommet.palier).toBe(PALIER_ACQUIS);
		expect(sommet.entrees).toHaveLength(recap.acquises);
		expect(sommet.entrees.every((e) => e.acquis)).toBe(true);
		expect(sommet.dues).toBe(0);
		for (const etage of recap.parPalier) {
			if (etage.acquis) continue;
			expect(etage.entrees.some((e) => e.acquis)).toBe(false); // aucune acquise ailleurs
			// 3. Cohérence ligne ↔ en-tête : hors sommet, la ligne affiche l'intervalle de
			//    son étage (l'UI masque le palier ligne à ligne en se fiant à cette égalité).
			expect(etage.label).toBe(MARCHES[etage.palier]);
			for (const e of etage.entrees) expect(e.palierLabel).toBe(etage.label);
		}
		// 4. Et au sommet, le libellé de ligne est vide (badge « acquis » à la place).
		expect(sommet.entrees.every((e) => e.palierLabel === '')).toBe(true);
		// 5. Aucun libellé dégradé nulle part.
		for (const e of recap.parUrgence) expect(e.palierLabel).not.toContain('NaN');
		expect(recap.parPalier.every((x) => x.label !== '')).toBe(true);
	});

	it('entrée en rotation SANS échéance : gardée sur son étage, en fin de file, pas due', () => {
		// État incohérent plausible (palier avancé mais `prochaineRevision` perdue) : elle ne
		// doit ni passer devant une entrée en retard, ni se faire compter comme à réviser.
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-complements@ce2': etat(2, NOW - JOUR), // en retard
			'math-doubles@ce2': etat(2, NOW + 3 * JOUR), // future
			'math-moities@ce2': etat(2, null), // sans échéance
		});
		const recap = revisionProfil(p, NOW);
		const etage = recap.parPalier[0];
		expect(recap.parPalier).toHaveLength(1);
		expect(etage.entrees.map((e) => e.cle)).toEqual([
			'math-complements@ce2',
			'math-doubles@ce2',
			'math-moities@ce2',
		]);
		expect(etage.dues).toBe(1);
		expect(etage.entrees[2]).toMatchObject({ echeance: '', du: false, joursRestants: null });
		expect(etage.acquis).toBe(false); // toujours en rotation, malgré l'absence d'échéance
	});

	it('égalité de palier ET d’échéance → ordre alphabétique français (les accents ne partent pas en fin)', () => {
		const p = activeProfile();
		const ortho: OrthoState = {
			...emptyOrthoState(),
			banque: {
				w1: motOrtho('w1', 'zebre', etat(1, NOW + 2 * JOUR)),
				w2: motOrtho('w2', 'école', etat(1, NOW + 2 * JOUR)),
				w3: motOrtho('w3', 'avion', etat(1, NOW + 2 * JOUR)),
			},
		};
		seed(p.uuid, ORTHO_KEY, ortho);
		const recap = revisionProfil(p, NOW);
		// Un tri sur les codes d'unité mettrait « école » APRÈS « zebre » (é > z en UTF-16).
		expect(recap.parPalier[0].entrees.map((e) => e.label)).toEqual(['avion', 'école', 'zebre']);
	});

	it('entretien du niveau inférieur (#232) : la même leçon se range sur DEUX étages distincts', () => {
		const a = activeProfile();
		const profilCm1: Profile = { ...a, niveauParMatiere: { math: 'cm1' } };
		seed(a.uuid, LESSON_REVISION_KEY, {
			'num-comparer@ce2': etat(4, NOW - JOUR), // entretenu, presque ancré
			'num-comparer@cm1': etat(0, NOW - JOUR), // niveau actif, encore au pied
		});
		const recap = revisionProfil(profilCm1, NOW);
		// Deux entrées de la MÊME leçon : la vue par palier est justement celle qui montre
		// qu'elles n'en sont pas au même point (là où la vue par catégorie les colle).
		expect(recap.parPalier.map((x) => [x.label, x.entrees.map((e) => e.cle)])).toEqual([
			['1 jour', ['num-comparer@cm1']],
			['1 mois', ['num-comparer@ce2']],
		]);
		expect(recap.parPalier[1].entrees[0].niveauOrigine).toBe('ce2');
		expect(recap.parPalier[0].entrees[0].niveauOrigine).toBeUndefined();
		expect(recap.parPalier.map((x) => x.dues)).toEqual([1, 1]);
		memesEntreesDansLesTroisVues(recap);
	});

	it('toutes les entrées sur le MÊME étage → un seul étage, leçons et mots réunis', () => {
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-complements@ce2': etat(3, NOW + JOUR),
			'math-doubles@ce2': etat(3, NOW + JOUR),
		});
		seed(p.uuid, ORTHO_KEY, {
			...emptyOrthoState(),
			banque: { w1: motOrtho('w1', 'chateau', etat(3, NOW + JOUR)) },
		} satisfies OrthoState);
		const recap = revisionProfil(p, NOW);
		expect(recap.parPalier).toHaveLength(1);
		expect(recap.parPalier[0]).toMatchObject({ palier: 3, label: '2 semaines', dues: 0 });
		expect(recap.parPalier[0].entrees).toHaveLength(3);
		expect(recap.groupes).toHaveLength(2); // 2 catégories, mais un seul étage
		memesEntreesDansLesTroisVues(recap);
	});

	it('profil sans aucune donnée → aucun étage (pas sept étages vides)', () => {
		const recap = revisionProfil(activeProfile(), NOW);
		expect(recap.parPalier).toEqual([]);
	});

	it('toutes les entrées acquises → un seul étage, celui du sommet', () => {
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-complements@ce2': etatAcquis(),
			'math-doubles@ce2': etatAcquis(),
		});
		const recap = revisionProfil(p, NOW);
		expect(recap.parPalier).toHaveLength(1);
		expect(recap.parPalier[0]).toMatchObject({
			palier: PALIER_ACQUIS,
			label: 'acquis',
			acquis: true,
			dues: 0,
		});
		expect(recap.enRotation).toBe(0);
	});
});
