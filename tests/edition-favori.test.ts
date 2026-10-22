/* ============================================================
   Édition d'un bilan favori depuis l'espace encadrant (#778) — logique pure.

   Auteur des tests DISTINCT de l'auteur du code, écrits AVANT l'implémentation : au moment
   où ce fichier est écrit, aucune des fonctions importées ci-dessous n'existe. Le fichier est
   donc rouge par construction ; il décrit le contrat fixé par l'orchestrateur à partir des
   critères de l'issue, pas un code existant.

   Critères couverts (versant donnée) :
   - 6  : « Enregistrer » écrit dans le profil PROPRIÉTAIRE, sous le même id, quel que soit le
          profil actif ; jamais de doublon chez le profil actif.
   - 7  : le rattachement à une catégorie est RECALCULÉ depuis les leçons.
   - 9  : seul un changement de CONTENU (ensemble des leçons, mode effectif, questions par
          leçon) abandonne la reprise ; un renommage la garde. Reprise adressée par uuid.
   - 12 : un favori Sprint doit contenir au moins une leçon jouable en sprint.
   - 15 : (négatif) un favori de même id chez un autre profil n'est pas touché.
   Le rendu (crayon, pleine page, repères, messages) est visuel → e2e.

   Modèle : tests/bilans-par-profil.test.ts (fraîcheur, deux profils, semis par le chemin
   réel : l'enfant compose ses favoris et joue ses bilans en étant le profil ACTIF).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	loadBilans,
	saveBilan,
	loadBilansFor,
	modifierBilanFor,
	contenuFavoriChange,
} from '../src/core/bilans';
import {
	upsertResume,
	hasResume,
	bilanFavoriKey,
	hasResumeFor,
	removeResumeFor,
	RESUME_VERSION,
	RESUME_TTL_MS,
} from '../src/core/resume';
import type { ResumeGrille } from '../src/core/resume';
import {
	getAllLessons,
	getLessonById,
	estEligibleSprintHorsNiveau,
	isProblemeLesson,
	isPosedLesson,
	isClicMotLesson,
	sprintJouable,
} from '../src/core/catalog';
import type { BilanConfig, LessonDef } from '../src/core/catalog';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	touchActiveProfile,
	loadProfilesMeta,
} from '../src/core/profiles';
import { setOnDataWrite, lsSet, PROFILES_KEY } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Leçons RÉELLES ----------
   Le rattachement de catégorie (critère 7) et l'éligibilité sprint (critère 12) se lisent
   dans le catalogue : des ids inventés rendraient ces tests vides. Les leçons sont choisies
   par leur CATÉGORIE ou leur FORMAT, puis vérifiées par des gardes, pour que le test reste
   lisible si le catalogue bouge. */
function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon de test introuvable : ${id}`);
	return l;
}
const MATH_1 = 'math-doubles';
const MATH_2 = 'math-moities';
const CAT_MATH = lecon(MATH_1).category;
/** Deux leçons d'une MÊME catégorie, autre que celle des leçons de maths ci-dessus. */
const [AUTRE_1, AUTRE_2] = (() => {
	const parCategorie = new Map<string, string[]>();
	for (const l of getAllLessons()) {
		if (l.category === CAT_MATH) continue;
		const liste = parCategorie.get(l.category) ?? [];
		liste.push(l.id);
		parCategorie.set(l.category, liste);
	}
	const paire = [...parCategorie.values()].find((ids) => ids.length >= 2);
	if (!paire) throw new Error('aucune autre catégorie à deux leçons');
	return [paire[0], paire[1]];
})();
const CAT_AUTRE = lecon(AUTRE_1).category;

function favori(id: string, label: string, extra: Partial<BilanConfig> = {}): BilanConfig {
	return { id, label, lessonIds: [MATH_1, MATH_2], questionsPerLesson: 3, ...extra };
}
/** Sème des favoris POUR un profil par le chemin réel (composés depuis l'écran de l'enfant,
    donc en étant le profil actif), puis rend la main au profil laissé actif. */
function semerFavoris(uuid: string, ...configs: BilanConfig[]): void {
	const avant = activeProfile().uuid;
	setActiveProfile(uuid);
	for (const c of configs) saveBilan(c);
	setActiveProfile(avant);
}
function ids(list: BilanConfig[]): string[] {
	return list.map((b) => b.id);
}
function trouver(uuid: string, id: string): BilanConfig | undefined {
	return loadBilansFor(uuid).find((b) => b.id === id);
}
/** Vieillit tous les profils, pour qu'un marquage « modifié » soit observable. */
function vieillirProfils(): void {
	const meta = loadProfilesMeta()!;
	for (const p of meta.list) p.updatedAt = 1_000;
	lsSet(PROFILES_KEY, meta);
}
function updatedAt(uuid: string): number {
	return loadProfilesMeta()!.list.find((p) => p.uuid === uuid)!.updatedAt;
}
/** Photographie du stockage, filtrée par clé. */
function instantane(garder: (cle: string) => boolean = () => true): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i)!;
		if (garder(k)) out[k] = localStorage.getItem(k)!;
	}
	return out;
}

/* ======================================================================================
   modifierBilanFor — critères 6, 7, 15
   ====================================================================================== */
describe('modifierBilanFor : remplace le favori chez son propriétaire (critère 6)', () => {
	it('le favori modifié garde son id et prend le nom, le mode, les leçons et le réglage neufs', () => {
		const a = activeProfile().uuid;
		semerFavoris(a, favori('f-1', 'Doubles et moitiés', { mode: 'bilan' }));

		const ok = modifierBilanFor(a, {
			id: 'f-1',
			label: 'Doubles en sprint',
			lessonIds: [MATH_1, MATH_2, AUTRE_1],
			questionsPerLesson: 'all',
			mode: 'sprint',
		});

		expect(ok).toBe(true);
		const lus = loadBilansFor(a);
		expect(ids(lus)).toEqual(['f-1']); // remplacé, pas ajouté
		const f = lus[0];
		expect(f.label).toBe('Doubles en sprint');
		expect(f.mode).toBe('sprint');
		expect(f.questionsPerLesson).toBe('all');
		expect([...f.lessonIds].sort()).toEqual([MATH_1, MATH_2, AUTRE_1].sort());
	});

	it('le favori garde sa place dans la liste (premier, milieu, dernier)', () => {
		const a = activeProfile().uuid;
		semerFavoris(a, favori('f-1', 'Un'), favori('f-2', 'Deux'), favori('f-3', 'Trois'));

		for (const id of ['f-1', 'f-2', 'f-3']) {
			modifierBilanFor(a, favori(id, `${id} renommé`, { questionsPerLesson: 5 }));
			expect(ids(loadBilansFor(a))).toEqual(['f-1', 'f-2', 'f-3']);
		}
		expect(loadBilansFor(a).map((b) => b.label)).toEqual([
			'f-1 renommé',
			'f-2 renommé',
			'f-3 renommé',
		]);
	});

	it('profil actif ≠ propriétaire : écrit chez le propriétaire, rien chez l’actif, aucun doublon', () => {
		// Le cas exact du critère 6 : l'adulte a changé de profil depuis la barre du composeur
		// pendant l'édition, puis enregistre. Le favori ne doit pas « atterrir » chez le profil
		// devenu actif, ni exister en double chez les deux.
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerFavoris(a, favori('f-a', 'Chez A'));
		semerFavoris(b, favori('f-b', 'Chez B'));
		setActiveProfile(b);
		const avantB = loadBilansFor(b);

		const ok = modifierBilanFor(a, favori('f-a', 'Chez A, modifié', { mode: 'sprint' }));

		expect(ok).toBe(true);
		expect(trouver(a, 'f-a')!.label).toBe('Chez A, modifié');
		expect(trouver(a, 'f-a')!.mode).toBe('sprint');
		expect(loadBilansFor(b)).toEqual(avantB);
		expect(trouver(b, 'f-a')).toBeUndefined();
		// L'enregistrement ne bascule pas le profil actif, et celui-ci lit toujours SA liste.
		expect(activeProfile().uuid).toBe(b);
		expect(ids(loadBilans())).toEqual(['f-b']);
	});

	it('modifier le favori du profil actif : l’enfant voit la nouvelle version sur son accueil', () => {
		// Invariant `loadBilansFor(uuidActif)` = `loadBilans()` : une écriture par uuid doit
		// viser la même donnée que celle que lit l'écran de l'enfant.
		const a = activeProfile().uuid;
		semerFavoris(a, favori('f-1', 'Avant'));
		modifierBilanFor(a, favori('f-1', 'Après', { questionsPerLesson: 6 }));
		const vu = loadBilans().find((b) => b.id === 'f-1')!;
		expect(vu.label).toBe('Après');
		expect(vu.questionsPerLesson).toBe(6);
	});

	it('un id absent chez ce profil : renvoie false et n’écrit RIEN (ne crée jamais)', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerFavoris(a, favori('f-a', 'Chez A'));
		semerFavoris(b, favori('f-b', 'Chez B'));
		vieillirProfils(); // sinon un marquage « modifié » à la même milliseconde passerait inaperçu
		const avant = instantane();

		// 'f-b' existe… mais chez B : on ne doit pas le créer chez A.
		expect(modifierBilanFor(a, favori('f-b', 'Intrus'))).toBe(false);
		// Uuid inconnu : rien à remplacer non plus.
		expect(modifierBilanFor('uuid-qui-n-existe-pas', favori('f-a', 'Intrus'))).toBe(false);

		expect(instantane()).toEqual(avant);
	});

	it('marque le profil propriétaire comme modifié, et lui seul (fusion par récence)', () => {
		// Même exigence que `deleteBilanFor` : sans ce marquage, l'import d'une sauvegarde plus
		// « récente » ramènerait l'ancienne version du favori.
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerFavoris(a, favori('f-a', 'Chez A'));
		setActiveProfile(b);
		vieillirProfils();

		modifierBilanFor(a, favori('f-a', 'Chez A, modifié'));

		expect(updatedAt(a)).toBeGreaterThan(1_000);
		expect(updatedAt(b)).toBe(1_000);
	});
});

describe('modifierBilanFor : un favori homonyme chez un autre profil reste intact (critère 15)', () => {
	it('même id chez A et chez B : modifier chez A ne change rien chez B', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerFavoris(a, favori('f-commun', 'Révisions du soir'));
		semerFavoris(b, favori('f-commun', 'Révisions du soir'));
		const avantB = loadBilansFor(b);

		// Profil actif = A, puis = B : aucun des deux ne doit déborder sur l'autre.
		for (const actif of [a, b]) {
			setActiveProfile(actif);
			modifierBilanFor(
				a,
				favori('f-commun', `Modifié (actif ${actif === a ? 'A' : 'B'})`, {
					lessonIds: [AUTRE_1],
					mode: 'sprint',
					questionsPerLesson: 'all',
				}),
			);
			expect(loadBilansFor(b)).toEqual(avantB);
		}
		expect(trouver(a, 'f-commun')!.label).toBe('Modifié (actif B)');
	});
});

describe('modifierBilanFor : rattachement de catégorie recalculé depuis les leçons (critère 7)', () => {
	it('garde-fou des données : les deux paires de leçons sont bien dans deux catégories distinctes', () => {
		expect(lecon(MATH_2).category).toBe(CAT_MATH);
		expect(lecon(AUTRE_2).category).toBe(CAT_AUTRE);
		expect(CAT_AUTRE).not.toBe(CAT_MATH);
	});

	it('devenu multi-catégories : le rattachement disparaît, même si la config transmise portait l’ancien', () => {
		const a = activeProfile().uuid;
		semerFavoris(a, favori('f-1', 'Maths', { categoryId: CAT_MATH }));
		expect(trouver(a, 'f-1')!.categoryId).toBe(CAT_MATH);

		// Le composeur pré-rempli peut très bien renvoyer l'ancien `categoryId` tel quel.
		modifierBilanFor(
			a,
			favori('f-1', 'Maths et autre', { lessonIds: [MATH_1, AUTRE_1], categoryId: CAT_MATH }),
		);

		expect(trouver(a, 'f-1')!.categoryId).toBeUndefined();
	});

	it('devenu mono-catégorie ailleurs : rattaché à la NOUVELLE catégorie, pas à l’ancienne', () => {
		const a = activeProfile().uuid;
		semerFavoris(a, favori('f-1', 'Maths', { categoryId: CAT_MATH }));

		modifierBilanFor(
			a,
			favori('f-1', 'Autre matière', { lessonIds: [AUTRE_1, AUTRE_2], categoryId: CAT_MATH }),
		);

		expect(trouver(a, 'f-1')!.categoryId).toBe(CAT_AUTRE);
	});

	it('multi-catégories redevenu mono-catégorie : il apparaît dans sa catégorie', () => {
		const a = activeProfile().uuid;
		semerFavoris(a, favori('f-1', 'Mélange', { lessonIds: [MATH_1, AUTRE_1] }));
		expect(trouver(a, 'f-1')!.categoryId).toBeUndefined();

		modifierBilanFor(a, favori('f-1', 'Maths seules', { lessonIds: [MATH_1, MATH_2] }));

		expect(trouver(a, 'f-1')!.categoryId).toBe(CAT_MATH);
	});
});

/* ======================================================================================
   contenuFavoriChange — critère 9
   ====================================================================================== */
describe('contenuFavoriChange : seul un changement de CONTENU abandonne la reprise (critère 9)', () => {
	const base: BilanConfig = {
		id: 'f-1',
		label: 'Révisions',
		lessonIds: [MATH_1, MATH_2, AUTRE_1],
		questionsPerLesson: 3,
		mode: 'bilan',
	};
	/** Le verdict ne doit pas dépendre du sens de la comparaison. */
	function change(avant: BilanConfig, apres: BilanConfig): boolean {
		const aller = contenuFavoriChange(avant, apres);
		expect(contenuFavoriChange(apres, avant)).toBe(aller);
		return aller;
	}

	it('config identique (copie) : pas de changement', () => {
		expect(change(base, { ...base, lessonIds: [...base.lessonIds] })).toBe(false);
	});

	it('renommage seul : pas de changement (la reprise est gardée)', () => {
		expect(change(base, { ...base, label: 'Révisions du mardi' })).toBe(false);
	});

	it('rattachement de catégorie seul (ajouté, retiré, changé) : pas de changement', () => {
		expect(change(base, { ...base, categoryId: CAT_MATH })).toBe(false);
		expect(change({ ...base, categoryId: CAT_MATH }, { ...base, categoryId: CAT_AUTRE })).toBe(
			false,
		);
	});

	it('mêmes leçons dans un autre ordre : pas de changement', () => {
		expect(change(base, { ...base, lessonIds: [AUTRE_1, MATH_2, MATH_1] })).toBe(false);
	});

	it('renommage + réordonnancement + catégorie à la fois : toujours pas de changement', () => {
		expect(
			change(base, {
				...base,
				label: 'Autre nom',
				lessonIds: [MATH_2, AUTRE_1, MATH_1],
				categoryId: CAT_AUTRE,
			}),
		).toBe(false);
	});

	it('une leçon ajoutée, retirée ou remplacée (même nombre) : changement', () => {
		expect(change(base, { ...base, lessonIds: [...base.lessonIds, AUTRE_2] })).toBe(true);
		expect(change(base, { ...base, lessonIds: [MATH_1, MATH_2] })).toBe(true);
		expect(change(base, { ...base, lessonIds: [MATH_1, MATH_2, AUTRE_2] })).toBe(true);
	});

	it('favori legacy sans `mode` comparé à `mode: "bilan"` : même mode effectif, pas de changement', () => {
		const legacy: BilanConfig = { ...base };
		delete legacy.mode;
		expect(change(legacy, base)).toBe(false);
	});

	it('bascule de mode (bilan → sprint, et legacy sans mode → sprint) : changement', () => {
		const legacy: BilanConfig = { ...base };
		delete legacy.mode;
		expect(change(base, { ...base, mode: 'sprint' })).toBe(true);
		expect(change(legacy, { ...base, mode: 'sprint' })).toBe(true);
	});

	it('questions par leçon : "all" ↔ nombre, et nombre ↔ autre nombre, sont des changements', () => {
		expect(change(base, { ...base, questionsPerLesson: 'all' })).toBe(true);
		expect(change(base, { ...base, questionsPerLesson: 5 })).toBe(true);
		const tout: BilanConfig = { ...base, questionsPerLesson: 'all' };
		expect(change(tout, { ...tout, label: 'Tout' })).toBe(false);
	});
});

/* ======================================================================================
   Reprise d'un favori, adressée par uuid — critère 9
   ====================================================================================== */
const NOW = 1_800_000_000_000;

function reprise(key: string, savedAt: number): ResumeGrille {
	return {
		key,
		version: RESUME_VERSION,
		savedAt,
		mode: 'custom',
		label: 'Bilan favori',
		icon: 'star',
		categoryId: null,
		relaunch: { type: 'bilan', config: favori('f-1', 'Bilan favori') },
		total: 6,
		answered: 2,
		kind: 'grille',
		sheetsHTML: '<div></div>',
		items: {},
		answers: { a: '12' },
		activeId: null,
		elapsedMs: 4_000,
	};
}
/** Sème une reprise POUR un profil par le chemin réel (l'enfant a commencé le bilan en
    étant le profil actif), puis rend la main au profil laissé actif. */
function semerReprise(uuid: string, key: string, savedAt: number = NOW): void {
	const avant = activeProfile().uuid;
	setActiveProfile(uuid);
	upsertResume(reprise(key, savedAt));
	setActiveProfile(avant);
}
/** Vérité de référence : la reprise telle que l'enfant la verrait en étant actif. */
function repriseVueParEnfant(uuid: string, key: string, now: number): boolean {
	const avant = activeProfile().uuid;
	setActiveProfile(uuid);
	const vu = hasResume(key, now);
	setActiveProfile(avant);
	return vu;
}

describe('bilanFavoriKey : la clé de reprise d’un favori', () => {
	it('vaut `bilan-favori-<id>`, la clé sous laquelle le bilan d’un favori est déjà repris', () => {
		expect(bilanFavoriKey('f-1')).toBe('bilan-favori-f-1');
		expect(bilanFavoriKey('1730000000000')).toBe('bilan-favori-1730000000000');
	});
});

describe('hasResumeFor : la reprise d’un profil désigné par uuid (critère 9)', () => {
	it('voit la reprise d’un autre profil sans basculer l’actif, et ne voit pas celle de l’actif', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		const kB = bilanFavoriKey('f-b');
		const kA = bilanFavoriKey('f-a');
		semerReprise(b, kB);
		semerReprise(a, kA);
		setActiveProfile(a);

		expect(hasResumeFor(b, kB, NOW + 1_000)).toBe(true);
		expect(hasResumeFor(b, kA, NOW + 1_000)).toBe(false); // existe… mais chez A
		expect(hasResumeFor(a, kB, NOW + 1_000)).toBe(false); // existe… mais chez B
		expect(activeProfile().uuid).toBe(a);
	});

	it('un uuid inconnu ou une clé absente : false, sans erreur', () => {
		expect(hasResumeFor('uuid-qui-n-existe-pas', bilanFavoriKey('f-1'), NOW)).toBe(false);
		expect(hasResumeFor(activeProfile().uuid, bilanFavoriKey('f-1'), NOW)).toBe(false);
	});

	it('reprise périmée (plus de 7 jours) : n’est plus vue, sur un profil non actif', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		const k = bilanFavoriKey('f-b');
		semerReprise(b, k, NOW);
		setActiveProfile(a);
		const septJours = 7 * 24 * 60 * 60 * 1000;

		expect(hasResumeFor(b, k, NOW + septJours - 60_000)).toBe(true); // 6 j 23 h 59
		expect(hasResumeFor(b, k, NOW + septJours + 60_000)).toBe(false); // 7 j 0 h 1
	});

	it.each([
		['bien avant la péremption', RESUME_TTL_MS - 60_000],
		['une ms avant', RESUME_TTL_MS - 1],
		['pile à la péremption', RESUME_TTL_MS],
		['une ms après', RESUME_TTL_MS + 1],
	])('même verdict que `hasResume` vu par l’enfant : %s', (_nom, ecart) => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		const k = bilanFavoriKey('f-b');
		semerReprise(b, k, NOW);
		setActiveProfile(a);

		const parUuid = hasResumeFor(b, k, NOW + ecart);
		expect(parUuid).toBe(repriseVueParEnfant(b, k, NOW + ecart));
	});

	it('la consultation ne touche pas aux données du profil actif', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerReprise(a, bilanFavoriKey('f-a'));
		semerReprise(b, bilanFavoriKey('f-b'));
		setActiveProfile(a);
		const horsB = (cle: string) => cle !== PROFILES_KEY && !cle.startsWith(b + '/');
		const avant = instantane(horsB);

		hasResumeFor(b, bilanFavoriKey('f-b'), NOW + 1_000);
		hasResumeFor(b, bilanFavoriKey('f-b'), NOW + RESUME_TTL_MS + 1); // périmée : purge éventuelle chez B seulement

		expect(instantane(horsB)).toEqual(avant);
	});
});

describe('removeResumeFor : abandonne une reprise chez un profil désigné par uuid (critère 9)', () => {
	it('deux reprises chez B : seule celle visée disparaît ; la même clé chez A (actif) reste', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		const k1 = bilanFavoriKey('f-1');
		const k2 = bilanFavoriKey('f-2');
		semerReprise(b, k1, NOW);
		semerReprise(b, k2, NOW + 10);
		semerReprise(a, k1, NOW); // même favori-id, autre enfant
		setActiveProfile(a);

		removeResumeFor(b, k1);

		const t = NOW + 1_000;
		expect(hasResumeFor(b, k1, t)).toBe(false);
		expect(hasResumeFor(b, k2, t)).toBe(true);
		expect(repriseVueParEnfant(b, k1, t)).toBe(false);
		expect(repriseVueParEnfant(b, k2, t)).toBe(true);
		expect(hasResume(k1, t)).toBe(true); // profil actif A : intact
		expect(activeProfile().uuid).toBe(a);
	});

	it('n’écrit rien hors du profil désigné (le profil actif garde ses données à l’octet près)', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		const k = bilanFavoriKey('f-commun');
		semerReprise(a, k);
		semerReprise(b, k);
		setActiveProfile(a);
		const horsB = (cle: string) => cle !== PROFILES_KEY && !cle.startsWith(b + '/');
		const avant = instantane(horsB);

		removeResumeFor(b, k);

		expect(instantane(horsB)).toEqual(avant);
	});

	it('clé absente : les reprises existantes du profil restent toutes', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerReprise(b, bilanFavoriKey('f-1'));
		setActiveProfile(a);

		removeResumeFor(b, bilanFavoriKey('f-inexistant'));

		expect(hasResumeFor(b, bilanFavoriKey('f-1'), NOW + 1_000)).toBe(true);
	});
});

describe('renommer un favori garde la reprise de l’enfant (critère 9, versant négatif)', () => {
	it('modifierBilanFor sur un simple renommage laisse la reprise du favori en place', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		const avant = favori('f-b', 'Ancien nom');
		semerFavoris(b, avant);
		semerReprise(b, bilanFavoriKey('f-b'));
		setActiveProfile(a);

		const apres = { ...avant, label: 'Nouveau nom' };
		expect(contenuFavoriChange(avant, apres)).toBe(false);
		modifierBilanFor(b, apres);

		expect(hasResumeFor(b, bilanFavoriKey('f-b'), NOW + 1_000)).toBe(true);
	});
});

/* ======================================================================================
   sprintJouable — critère 12
   ====================================================================================== */
describe('sprintJouable : un sprint doit tirer au moins une leçon (critère 12)', () => {
	const toutes = getAllLessons();
	/* Une leçon réelle par motif d'exclusion, choisie par son FORMAT (prédicats du catalogue)
	   ou son exclusion déclarée, pas par le code de la fonction testée. */
	const probleme = toutes.find(isProblemeLesson);
	const posee = toutes.find(isPosedLesson);
	const clicMot = toutes.find(isClicMotLesson);
	const exclue = toutes.find((l) => l.excludeFromSprint === true);
	const nonJouables = [probleme, posee, clicMot, exclue];

	it('garde-fou des données : chaque leçon choisie existe et ne se joue pas en sprint', () => {
		for (const l of nonJouables) {
			expect(l).toBeDefined();
			expect(estEligibleSprintHorsNiveau(l!)).toBe(false);
		}
		expect(estEligibleSprintHorsNiveau(lecon(MATH_1))).toBe(true);
	});

	it('liste vide : false', () => {
		expect(sprintJouable([])).toBe(false);
	});

	it('uniquement des ids inconnus du catalogue : false', () => {
		expect(sprintJouable(['lecon-qui-n-existe-pas', 'autre-fantome'])).toBe(false);
	});

	it('uniquement des leçons non jouables (problème, posée, clic-mot, exclue) : false', () => {
		// Le cas que l'issue décrit : un favori Sprint de leçons de problèmes renvoie
		// aujourd'hui à l'accueil sans message.
		expect(sprintJouable([probleme!.id])).toBe(false);
		expect(sprintJouable(nonJouables.map((l) => l!.id))).toBe(false);
	});

	it('non jouables + ids inconnus, sans aucune jouable : false', () => {
		expect(sprintJouable(['lecon-qui-n-existe-pas', posee!.id, exclue!.id])).toBe(false);
	});

	it('une seule leçon jouable suffit, quelle que soit sa place dans la liste : true', () => {
		expect(sprintJouable([MATH_1])).toBe(true);
		expect(sprintJouable([...nonJouables.map((l) => l!.id), 'fantome', MATH_1])).toBe(true);
		expect(sprintJouable([MATH_1, ...nonJouables.map((l) => l!.id)])).toBe(true);
	});

	it('sur tout le catalogue, une leçon seule est jouable exactement quand elle est éligible au sprint', () => {
		// Recoupe la fonction avec le prédicat du tirage sur les ~190 leçons réelles : une liste
		// d'exclusions recopiée à la main divergerait au premier format ajouté.
		const ecarts = toutes
			.filter((l) => sprintJouable([l.id]) !== estEligibleSprintHorsNiveau(l))
			.map((l) => l.id);
		expect(ecarts).toEqual([]);
	});
});
