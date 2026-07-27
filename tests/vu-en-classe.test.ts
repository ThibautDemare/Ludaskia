/* ============================================================
   « Leçon vue en classe » (#478) — déclaration hors application.
   ------------------------------------------------------------
   Attendus DÉRIVÉS de la spécification de l'issue, pas de l'implémentation :
   - carte DÉDIÉE `ludaskia_lessonVuAilleurs`, par UUID, clés `lessonId@niveau` ;
   - déclarer = entrée en rotation de révision au comportement STANDARD d'entrée
     (état neuf : palier 0, premier re-test à J+1 = +24 h — sémantique #45) ;
   - annuler ne détruit JAMAIS un état de révision issu d'un vrai passage ;
   - union « joué ∪ déclaré » UNIQUEMENT dans sprint-scope ;
   - aucun effet sur les compteurs de NOUVEAUTÉ (objectif « nouvelle leçon »,
     « notions maîtrisées récemment ») ;
   - cloisonnement strict par niveau scolaire.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	VU_AILLEURS_KEY,
	declarerVuAilleursFor,
	loadVuAilleursFor,
	loadVuAilleurs,
	estVuAilleurs,
	categoriesDeclarables,
	type LeconNiveau,
} from '../src/core/vu-ailleurs';
import {
	LESSON_FIRST_SEEN_KEY,
	LESSON_REVISION_KEY,
	LESSON_STATS_KEY,
	STARS_KEY,
	countNewLessonsSince,
	loadLessonFirstSeen,
	markLessonsFirstSeen,
	type LessonStat,
} from '../src/core/progress';
import {
	estRencontree,
	loadRencontrees,
	appliquerScope,
	scopeParDefaut,
	perimetreChoisissable,
} from '../src/core/sprint-scope';
import {
	initProfiles,
	activeProfile,
	addProfile,
	touchActiveProfile,
	setNiveauReference,
	setNiveauMatiere,
	exportProfiles,
	type Profile,
} from '../src/core/profiles';
import { progressionProfil } from '../src/core/encadrant-stats';
import { getLessonById, getLessonsByCategory } from '../src/core/catalog';
import type { SchoolLevel, SubjectId } from '../src/core/catalog';
import { setOnDataWrite, lsGetRaw, lsSetRaw } from '../src/core/storage';
import type { EtatRevision } from '../src/core/orthographe/types';

/* Un jour en ms, recalculé ici (l'attendu « J+1 » ne doit pas venir du code testé). */
const JOUR = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime(); // 15 juin 2026, midi

/* Leçons témoins (pré-conditions vérifiées plus bas) : trois CE2 seulement,
   une multi-niveaux CE2+CM1 pour le cloisonnement. */
const CALC_A = 'math-tables-addition'; // math-calcul-mental, ce2
const CALC_B = 'math-doubles'; // math-calcul-mental, ce2
const CALC_C = 'math-moities'; // math-calcul-mental, ce2
const FR_A = 'fr-gram-ponctuation'; // français, ce2
const BI = 'num-comparer'; // math-numeration, ce2 + cm1

/* ---------- Accès bruts au stockage d'un profil (clé RÉELLE `uuid/clé`) ----------
   On lit/écrit les cartes voisines à la main : c'est l'état que la déclaration doit
   respecter (ou ne pas toucher). */
function ecrire(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}
function lire(uuid: string, key: string): unknown {
	return lsGetRaw(uuid + '/' + key, null);
}
function revisions(uuid: string): Record<string, EtatRevision> {
	return lsGetRaw(uuid + '/' + LESSON_REVISION_KEY, {}) as Record<string, EtatRevision>;
}
function stat(questions: number): LessonStat {
	return { attempts: 1, correct: questions, questions, bestPct: 100, lastPct: 100 };
}
/* État de révision déjà AVANCÉ (re-testé au moins une fois) : ce que produit un vrai
   passage en mode Révision — ce que l'annulation ne doit jamais effacer. */
function etatRevise(palier: number, now: number): EtatRevision {
	return {
		palier,
		prochaineRevision: now + 3 * JOUR,
		reussites: palier,
		dernierTest: now - JOUR,
	};
}
/* État NEUF (jamais re-testé), tel qu'une entrée en rotation le pose. */
function etatNeufAttendu(now: number): EtatRevision {
	return { palier: 0, prochaineRevision: now + JOUR, reussites: 0, dernierTest: null };
}
function decl(lessonId: string, niveau: SchoolLevel = 'ce2'): LeconNiveau {
	return { lessonId, niveau };
}

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	setNiveauReference('ce2');
});

describe('pré-conditions de catalogue (les témoins sont bien ceux qu’on croit)', () => {
	it('les leçons témoins existent aux niveaux attendus', () => {
		for (const id of [CALC_A, CALC_B, CALC_C]) {
			const l = getLessonById(id)!;
			expect(l.category).toBe('math-calcul-mental');
			expect(l.levels).toEqual(['ce2']);
		}
		expect(getLessonById(FR_A)!.levels).toContain('ce2');
		const bi = getLessonById(BI)!;
		expect(bi.category).toBe('math-numeration');
		expect(bi.levels).toContain('ce2');
		expect(bi.levels).toContain('cm1');
	});
});

/* ============================================================
   1) La carte de déclaration : dédiée, par UUID, namespacée par niveau
   ============================================================ */
describe('carte « vu en classe » : stockage dédié', () => {
	it('écrit sous la clé dédiée `ludaskia_lessonVuAilleurs`, distincte du 1er passage', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);

		// Nom de clé attendu par la spec, écrit littéralement (pas repris de la constante).
		expect(lire(uuid, 'ludaskia_lessonVuAilleurs')).toEqual({ [`${CALC_B}@ce2`]: true });
		expect(VU_AILLEURS_KEY).toBe('ludaskia_lessonVuAilleurs');
		expect(VU_AILLEURS_KEY).not.toBe(LESSON_FIRST_SEEN_KEY);
		// La carte de 1er passage n'a même pas été créée.
		expect(lire(uuid, LESSON_FIRST_SEEN_KEY)).toBeNull();
	});

	it('la clé porte le niveau : `lessonId@niveau`', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(BI, 'cm1')], true, NOW);
		const carte = loadVuAilleursFor(uuid);
		expect(Object.keys(carte)).toEqual([`${BI}@cm1`]);
		expect(estVuAilleurs(carte, decl(BI, 'cm1'))).toBe(true);
		expect(estVuAilleurs(carte, decl(BI, 'ce2'))).toBe(false); // autre niveau = autre entrée
	});

	it('écrit sur le profil CONSULTÉ sans changer le profil actif', () => {
		const a = activeProfile();
		const b = addProfile('Profil B'); // devient actif
		declarerVuAilleursFor(a.uuid, [decl(CALC_B)], true, NOW);

		expect(activeProfile().uuid).toBe(b.uuid); // aucune bascule
		expect(loadVuAilleursFor(a.uuid)).toEqual({ [`${CALC_B}@ce2`]: true });
		expect(loadVuAilleursFor(b.uuid)).toEqual({}); // l'autre profil est intact
		expect(revisions(b.uuid)).toEqual({}); // ni sa rotation de révision
	});

	it('déclarer puis annuler laisse la carte comme au départ (idempotent des deux côtés)', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW + JOUR); // 2e déclaration : sans effet
		expect(loadVuAilleursFor(uuid)).toEqual({ [`${CALC_B}@ce2`]: true });

		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + 2 * JOUR);
		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + 3 * JOUR); // 2e annulation : sans effet
		expect(loadVuAilleursFor(uuid)).toEqual({});
	});

	it('un lot mixte ne déclare que ce qui manque et laisse le reste en place', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_A)], true, NOW);
		declarerVuAilleursFor(uuid, [decl(CALC_A), decl(CALC_B), decl(CALC_C)], true, NOW);
		expect(Object.keys(loadVuAilleursFor(uuid)).sort()).toEqual(
			[`${CALC_A}@ce2`, `${CALC_B}@ce2`, `${CALC_C}@ce2`].sort(),
		);
	});
});

/* ============================================================
   2) Entrée en rotation de révision espacée
   ============================================================ */
describe('déclaration → entrée en révision espacée', () => {
	it('pose un état NEUF : palier 0, premier re-test le lendemain, jamais testé', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);

		const r = revisions(uuid);
		expect(Object.keys(r)).toEqual([`${CALC_B}@ce2`]);
		expect(r[`${CALC_B}@ce2`]).toEqual(etatNeufAttendu(NOW));
		// Pas dû immédiatement (sinon la déclaration remplirait la session du jour) :
		// l'échéance est bien postérieure à l'instant de déclaration.
		expect(r[`${CALC_B}@ce2`].prochaineRevision!).toBeGreaterThan(NOW);
	});

	it('un lot entier entre en rotation, chaque leçon à sa clé de niveau', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_A), decl(CALC_B), decl(BI, 'cm1')], true, NOW);
		const r = revisions(uuid);
		expect(Object.keys(r).sort()).toEqual([`${CALC_A}@ce2`, `${CALC_B}@ce2`, `${BI}@cm1`].sort());
		expect(r[`${BI}@cm1`]).toEqual(etatNeufAttendu(NOW));
	});

	it('re-déclarer ne réarme PAS l’échéance déjà posée', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW + 10 * JOUR);
		expect(revisions(uuid)[`${CALC_B}@ce2`]).toEqual(etatNeufAttendu(NOW));
	});

	it('ne réinitialise pas un état de révision déjà avancé', () => {
		const uuid = activeProfile().uuid;
		const avance = etatRevise(3, NOW);
		ecrire(uuid, LESSON_REVISION_KEY, { [`${CALC_B}@ce2`]: avance });
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW + JOUR);
		expect(revisions(uuid)[`${CALC_B}@ce2`]).toEqual(avance); // progrès intact
	});

	it('la rotation de révision est écrite sur le profil consulté, pas sur l’actif', () => {
		const a = activeProfile();
		const b = addProfile('Profil B');
		declarerVuAilleursFor(a.uuid, [decl(CALC_B)], true, NOW);
		expect(Object.keys(revisions(a.uuid))).toEqual([`${CALC_B}@ce2`]);
		expect(revisions(b.uuid)).toEqual({});
	});
});

/* ============================================================
   3) Annulation : ne jamais détruire un état de révision réel
   ============================================================ */
describe('annulation d’une déclaration : protection de la révision réelle', () => {
	it('retire l’état de révision que la déclaration avait créé', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + JOUR);
		expect(revisions(uuid)).toEqual({});
		expect(loadVuAilleursFor(uuid)).toEqual({});
	});

	it('PROTECTION 1 — garde un état déjà re-testé (dernierTest renseigné)', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		// L'enfant a réellement révisé la leçon depuis : l'état porte un dernierTest.
		const apresRevision = etatRevise(1, NOW + 2 * JOUR);
		ecrire(uuid, LESSON_REVISION_KEY, { [`${CALC_B}@ce2`]: apresRevision });

		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + 3 * JOUR);
		expect(revisions(uuid)[`${CALC_B}@ce2`]).toEqual(apresRevision); // progrès conservé
		expect(loadVuAilleursFor(uuid)).toEqual({}); // la déclaration, elle, est bien retirée
	});

	it('PROTECTION 2 — garde l’état d’une leçon travaillée dans l’appli (statistiques)', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		// L'enfant a joué la leçon depuis la déclaration : stats présentes, mais l'état SR
		// n'a pas encore été re-testé (dernierTest null) → seule la stat le protège.
		ecrire(uuid, LESSON_STATS_KEY, { [`${CALC_B}@ce2`]: stat(8) });

		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + JOUR);
		expect(revisions(uuid)[`${CALC_B}@ce2`]).toEqual(etatNeufAttendu(NOW));
		expect(loadVuAilleursFor(uuid)).toEqual({});
	});

	it('une stat VIDE (0 question) ne protège pas : l’état déclaré est bien retiré', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		ecrire(uuid, LESSON_STATS_KEY, { [`${CALC_B}@ce2`]: stat(0) });
		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + JOUR);
		expect(revisions(uuid)).toEqual({});
	});

	it('décocher une leçon JAMAIS déclarée ne touche à rien', () => {
		const uuid = activeProfile().uuid;
		// État SR neuf venu d'un vrai passage (aucune stat, aucun re-test) : rien ne le
		// protège… sauf le fait qu'aucune déclaration n'a jamais existé pour cette leçon.
		const neuf = etatNeufAttendu(NOW);
		ecrire(uuid, LESSON_REVISION_KEY, { [`${CALC_B}@ce2`]: neuf });

		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + JOUR);
		expect(revisions(uuid)[`${CALC_B}@ce2`]).toEqual(neuf);
		expect(loadVuAilleursFor(uuid)).toEqual({});
	});

	it('annulation d’un lot : la protection s’applique leçon par leçon', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_A), decl(CALC_B)], true, NOW);
		// CALC_C n'a jamais été déclarée mais est en rotation (vrai passage).
		const r0 = revisions(uuid);
		const neufC = etatNeufAttendu(NOW - 5 * JOUR);
		ecrire(uuid, LESSON_REVISION_KEY, { ...r0, [`${CALC_C}@ce2`]: neufC });
		// CALC_A a été révisée pour de vrai depuis.
		const reviseA = etatRevise(2, NOW + JOUR);
		ecrire(uuid, LESSON_REVISION_KEY, {
			...revisions(uuid),
			[`${CALC_A}@ce2`]: reviseA,
		});

		declarerVuAilleursFor(uuid, [decl(CALC_A), decl(CALC_B), decl(CALC_C)], false, NOW + 2 * JOUR);

		const r = revisions(uuid);
		expect(r[`${CALC_A}@ce2`]).toEqual(reviseA); // protégée (re-testée)
		expect(r[`${CALC_B}@ce2`]).toBeUndefined(); // créée par la déclaration → retirée
		expect(r[`${CALC_C}@ce2`]).toEqual(neufC); // jamais déclarée → intouchée
		expect(loadVuAilleursFor(uuid)).toEqual({});
	});

	it('annuler n’efface jamais les statistiques ni les autres cartes', () => {
		const uuid = activeProfile().uuid;
		const stats = { [`${CALC_B}@ce2`]: stat(12) };
		ecrire(uuid, LESSON_STATS_KEY, stats);
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + JOUR);
		expect(lire(uuid, LESSON_STATS_KEY)).toEqual(stats);
	});
});

/* ============================================================
   4) Modèle de l'écran adulte : categoriesDeclarables
   ============================================================ */
describe('categoriesDeclarables (modèle de l’écran encadrant)', () => {
	const toutCe2 = (): SchoolLevel => 'ce2';
	const CAT = 'math-calcul-mental';
	const cat = (cats: ReturnType<typeof categoriesDeclarables>, id: string) =>
		cats.find((c) => c.categoryId === id)!;

	it('liste toutes les leçons du niveau, dans l’ordre du catalogue, rien de déclaré', () => {
		const uuid = activeProfile().uuid;
		const attendues = getLessonsByCategory(CAT, 'ce2');
		const c = cat(categoriesDeclarables(uuid, toutCe2), CAT);

		expect(c.subject).toBe('math');
		expect(c.lecons.map((l) => l.lessonId)).toEqual(attendues.map((l) => l.id));
		expect(c.lecons.map((l) => l.label)).toEqual(attendues.map((l) => l.label));
		expect(c.lecons.every((l) => l.niveau === 'ce2')).toBe(true);
		expect(c.lecons.every((l) => !l.declaree && !l.jouee)).toBe(true);
		expect(c.declarables).toBe(attendues.length);
		expect(c.declarees).toBe(0);
		expect(c.rencontrees).toBe(0);
	});

	it('une leçon déclarée est comptée dans declarees ET rencontrees', () => {
		const uuid = activeProfile().uuid;
		const total = getLessonsByCategory(CAT, 'ce2').length;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);

		const c = cat(categoriesDeclarables(uuid, toutCe2), CAT);
		expect(c.lecons.find((l) => l.lessonId === CALC_B)).toMatchObject({
			declaree: true,
			jouee: false,
		});
		expect(c.declarables).toBe(total); // pas encore jouée → toujours déclarable
		expect(c.declarees).toBe(1);
		expect(c.rencontrees).toBe(1);
	});

	it('une leçon déjà jouée dans l’appli n’est pas « déclarable » mais reste rencontrée', () => {
		const uuid = activeProfile().uuid;
		const total = getLessonsByCategory(CAT, 'ce2').length;
		ecrire(uuid, LESSON_FIRST_SEEN_KEY, { [`${CALC_A}@ce2`]: NOW - 30 * JOUR });

		const c = cat(categoriesDeclarables(uuid, toutCe2), CAT);
		expect(c.lecons.find((l) => l.lessonId === CALC_A)).toMatchObject({
			jouee: true,
			declaree: false,
		});
		expect(c.declarables).toBe(total - 1);
		expect(c.declarees).toBe(0);
		expect(c.rencontrees).toBe(1);
	});

	it('jouée ET déclarée : comptée une seule fois, et hors du décompte des déclarables', () => {
		const uuid = activeProfile().uuid;
		const total = getLessonsByCategory(CAT, 'ce2').length;
		declarerVuAilleursFor(uuid, [decl(CALC_A), decl(CALC_B)], true, NOW);
		ecrire(uuid, LESSON_FIRST_SEEN_KEY, { [`${CALC_A}@ce2`]: NOW - JOUR });

		const c = cat(categoriesDeclarables(uuid, toutCe2), CAT);
		expect(c.lecons.find((l) => l.lessonId === CALC_A)).toMatchObject({
			jouee: true,
			declaree: true,
		});
		expect(c.declarables).toBe(total - 1); // A jouée → plus déclarable
		expect(c.declarees).toBe(1); // seule B compte
		expect(c.rencontrees).toBe(2); // A comptée UNE fois
		expect(c.rencontrees).toBeLessThanOrEqual(c.lecons.length);
	});

	it('invariants de comptage sur toutes les catégories : declarees ≤ declarables ≤ total', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B), decl(FR_A)], true, NOW);
		ecrire(uuid, LESSON_FIRST_SEEN_KEY, { [`${CALC_A}@ce2`]: NOW });
		for (const c of categoriesDeclarables(uuid, toutCe2)) {
			expect(c.lecons.length).toBeGreaterThan(0); // aucune catégorie vide listée
			expect(c.declarees).toBeLessThanOrEqual(c.declarables);
			expect(c.declarables).toBeLessThanOrEqual(c.lecons.length);
			expect(c.rencontrees).toBeLessThanOrEqual(c.lecons.length);
			// rencontrées = jouées ∪ déclarées, recompté à la main depuis le détail.
			expect(c.rencontrees).toBe(c.lecons.filter((l) => l.jouee || l.declaree).length);
			expect(c.declarables).toBe(c.lecons.filter((l) => !l.jouee).length);
		}
	});

	it('écarte les catégories vides au niveau demandé (données : CM1 seulement)', () => {
		const uuid = activeProfile().uuid;
		expect(getLessonsByCategory('math-donnees', 'ce2')).toHaveLength(0); // pré-condition
		expect(getLessonsByCategory('math-donnees', 'cm1').length).toBeGreaterThan(0);

		const ids = (n: SchoolLevel) => categoriesDeclarables(uuid, () => n).map((c) => c.categoryId);
		expect(ids('ce2')).not.toContain('math-donnees');
		expect(ids('cm1')).toContain('math-donnees');
	});

	it('le niveau est résolu MATIÈRE PAR MATIÈRE (profil consulté)', () => {
		const uuid = activeProfile().uuid;
		const parMatiere = (s: SubjectId): SchoolLevel => (s === 'math' ? 'cm1' : 'ce2');
		declarerVuAilleursFor(uuid, [decl(BI, 'ce2')], true, NOW); // déclaré au CE2

		const cats = categoriesDeclarables(uuid, parMatiere);
		const num = cat(cats, 'math-numeration');
		expect(num.lecons.map((l) => l.lessonId)).toEqual(
			getLessonsByCategory('math-numeration', 'cm1').map((l) => l.id),
		);
		expect(num.lecons.every((l) => l.niveau === 'cm1')).toBe(true);
		// La déclaration CE2 ne « fuit » pas sur la ligne CM1 de la même leçon.
		expect(num.lecons.find((l) => l.lessonId === BI)!.declaree).toBe(false);
		expect(num.declarees).toBe(0);

		const gram = cat(cats, 'fr-grammaire');
		expect(gram.lecons.every((l) => l.niveau === 'ce2')).toBe(true);
	});

	it('lit le profil consulté sans changer l’actif', () => {
		const a = activeProfile();
		declarerVuAilleursFor(a.uuid, [decl(CALC_B)], true, NOW);
		const b = addProfile('Profil B'); // devient actif
		const catsA = categoriesDeclarables(a.uuid, toutCe2);
		const catsB = categoriesDeclarables(b.uuid, toutCe2);

		expect(cat(catsA, CAT).declarees).toBe(1);
		expect(cat(catsB, CAT).declarees).toBe(0);
		expect(activeProfile().uuid).toBe(b.uuid);
	});
});

/* ============================================================
   5) sprint-scope : union « joué ∪ déclaré »
   ============================================================ */
describe('périmètre du sprint : une leçon déclarée compte comme rencontrée', () => {
	const pool = () => [getLessonById(CALC_A)!, getLessonById(CALC_B)!, getLessonById(CALC_C)!];

	it('estRencontree / loadRencontrees : vrai sans le moindre passage dans l’appli', () => {
		const uuid = activeProfile().uuid;
		expect(estRencontree(CALC_B)).toBe(false);
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);

		expect(estRencontree(CALC_B)).toBe(true);
		expect(Object.keys(loadRencontrees())).toEqual([CALC_B]); // clé « nue », sans niveau
		expect(estRencontree(CALC_A)).toBe(false);
		// … et toujours aucune date de 1er passage.
		expect(loadLessonFirstSeen()).toEqual({});
	});

	it('l’union additionne les deux sources sans doublon', () => {
		const uuid = activeProfile().uuid;
		markLessonsFirstSeen([CALC_A], NOW); // joué
		declarerVuAilleursFor(uuid, [decl(CALC_A), decl(CALC_B)], true, NOW); // dont un déjà joué

		expect(Object.keys(loadRencontrees()).sort()).toEqual([CALC_A, CALC_B].sort());
		expect(appliquerScope(pool(), 'seen').map((l) => l.id)).toEqual([CALC_A, CALC_B]);
	});

	it('appliquerScope « seen » garde les déclarées, « all » reste inchangé', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_C)], true, NOW);
		expect(appliquerScope(pool(), 'seen').map((l) => l.id)).toEqual([CALC_C]);
		expect(appliquerScope(pool(), 'all')).toHaveLength(3);
	});

	it('scopeParDefaut / perimetreChoisissable suivent l’union', () => {
		const uuid = activeProfile().uuid;
		const p = pool();
		expect(scopeParDefaut(p)).toBe('all'); // rien de rencontré
		expect(perimetreChoisissable(p)).toBe(false);

		declarerVuAilleursFor(uuid, [decl(CALC_A)], true, NOW);
		expect(scopeParDefaut(p)).toBe('seen'); // mélange vu / pas vu
		expect(perimetreChoisissable(p)).toBe(true);

		declarerVuAilleursFor(uuid, [decl(CALC_B), decl(CALC_C)], true, NOW);
		expect(scopeParDefaut(p)).toBe('all'); // tout rencontré → les deux périmètres se valent
		expect(perimetreChoisissable(p)).toBe(false);
	});

	it('annuler la déclaration fait ressortir la leçon du périmètre « déjà vues »', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		declarerVuAilleursFor(uuid, [decl(CALC_B)], false, NOW + JOUR);
		expect(estRencontree(CALC_B)).toBe(false);
		expect(appliquerScope(pool(), 'seen')).toHaveLength(0);
	});
});

/* ============================================================
   6) Non-régression : invisible pour tout ce qui mesure la NOUVEAUTÉ
   ============================================================ */
describe('non-régression : la déclaration ne crée aucune « nouvelle leçon »', () => {
	it('countNewLessonsSince ignore les déclarations (mais compte un vrai 1er passage)', () => {
		const uuid = activeProfile().uuid;
		const debutSemaine = NOW - 3 * JOUR;
		declarerVuAilleursFor(uuid, [decl(CALC_A), decl(CALC_B), decl(CALC_C)], true, NOW);
		expect(countNewLessonsSince(debutSemaine)).toBe(0);

		markLessonsFirstSeen([CALC_C], NOW); // contrôle : un VRAI passage compte, lui
		expect(countNewLessonsSince(debutSemaine)).toBe(1);
	});

	it('la carte de 1er passage reste vide (source unique d’« aLeconInedite »)', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_A), decl(CALC_B)], true, NOW);
		// `aLeconInedite` (render.ts) ne lit QUE loadLessonFirstSeen : tant que cette carte
		// est vide, l'objectif « nouvelle leçon » reste proposé à l'identique.
		expect(loadLessonFirstSeen()).toEqual({});
		expect(lire(uuid, LESSON_FIRST_SEEN_KEY)).toBeNull();
	});

	it('« notions maîtrisées récemment » (récap encadrant) ignore les déclarations', () => {
		const base = activeProfile();
		const profil: Profile = { ...base, niveauReference: 'ce2' };
		// Leçon étoilée mais SANS date de 1er passage (cas d'un import ancien), puis déclarée.
		ecrire(profil.uuid, STARS_KEY, { [`${CALC_B}@ce2`]: 1 });
		declarerVuAilleursFor(profil.uuid, [decl(CALC_B)], true, NOW);

		const recap = progressionProfil(profil, NOW);
		expect(recap.totalMaitrisees).toBe(1);
		expect(recap.nouvellesRecentes).toBe(0); // la déclaration ne date pas une découverte

		// Contrôle : une VRAIE date de 1er passage récente, elle, fait bouger le compteur.
		ecrire(profil.uuid, LESSON_FIRST_SEEN_KEY, { [`${CALC_B}@ce2`]: NOW - 2 * JOUR });
		expect(progressionProfil(profil, NOW).nouvellesRecentes).toBe(1);
	});
});

/* ============================================================
   6 bis) « Tout déclarer » / « tout retirer » sur le catalogue RÉEL
   Le lot complet est le pire cas de l'écran (plus de cent leçons) : il éprouve
   d'un coup la cohérence entre les clés produites par le modèle d'écran et
   celles écrites en stockage (un décalage de namespacing passerait inaperçu
   sur un cas unitaire).
   ============================================================ */
describe('déclaration en masse (tout le niveau)', () => {
	const toutCe2 = (): SchoolLevel => 'ce2';

	it('tout déclarer rend tout rencontré, sans toucher au 1er passage', () => {
		const uuid = activeProfile().uuid;
		const cats = categoriesDeclarables(uuid, toutCe2);
		const entrees: LeconNiveau[] = cats.flatMap((c) =>
			c.lecons.filter((l) => !l.jouee).map((l) => decl(l.lessonId, l.niveau)),
		);
		expect(entrees.length).toBeGreaterThan(50); // le catalogue CE2 est bien fourni

		declarerVuAilleursFor(uuid, entrees, true, NOW);

		const apres = categoriesDeclarables(uuid, toutCe2);
		for (const c of apres) {
			expect(c.declarees).toBe(c.declarables);
			expect(c.rencontrees).toBe(c.lecons.length);
		}
		// Une entrée en rotation par leçon déclarée, ni plus ni moins, toutes à l'état neuf.
		const r = revisions(uuid);
		expect(Object.keys(r).sort()).toEqual(entrees.map((e) => `${e.lessonId}@${e.niveau}`).sort());
		expect(Object.values(r).every((e) => e.palier === 0 && e.dernierTest === null)).toBe(true);
		// Aucune découverte fabriquée.
		expect(loadLessonFirstSeen()).toEqual({});
		expect(countNewLessonsSince(NOW - 7 * JOUR)).toBe(0);
		// Le sprint « déjà vues » couvre alors tout le pool → plus de choix de périmètre.
		const pool = [getLessonById(CALC_A)!, getLessonById(CALC_B)!, getLessonById(FR_A)!];
		expect(appliquerScope(pool, 'seen')).toHaveLength(3);
		expect(perimetreChoisissable(pool)).toBe(false);
	});

	it('tout retirer revient exactement à l’état initial', () => {
		const uuid = activeProfile().uuid;
		const entrees: LeconNiveau[] = categoriesDeclarables(uuid, toutCe2).flatMap((c) =>
			c.lecons.map((l) => decl(l.lessonId, l.niveau)),
		);
		declarerVuAilleursFor(uuid, entrees, true, NOW);
		declarerVuAilleursFor(uuid, entrees, false, NOW + JOUR);

		expect(loadVuAilleursFor(uuid)).toEqual({});
		expect(revisions(uuid)).toEqual({}); // rien ne subsiste : aucun passage réel n'a eu lieu
		for (const c of categoriesDeclarables(uuid, toutCe2)) expect(c.rencontrees).toBe(0);
	});

	it('une déclaration part dans la sauvegarde du profil (export)', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(CALC_B)], true, NOW);
		const dump = exportProfiles([uuid]);
		const data = dump!.profiles[0].data;
		expect(JSON.parse(data[VU_AILLEURS_KEY])).toEqual({ [`${CALC_B}@ce2`]: true });
	});
});

/* ============================================================
   7) Cloisonnement par niveau scolaire
   ============================================================ */
describe('cloisonnement par niveau', () => {
	it('une déclaration CE2 ne rend pas la leçon rencontrée en CM1', () => {
		const uuid = activeProfile().uuid;
		setNiveauReference('ce2');
		declarerVuAilleursFor(uuid, [decl(BI, 'ce2')], true, NOW);
		expect(estRencontree(BI)).toBe(true);

		setNiveauReference('cm1'); // passage en classe supérieure
		expect(loadVuAilleurs()).toEqual({});
		expect(estRencontree(BI)).toBe(false);
	});

	it('réciproque : une déclaration CM1 ne compte pas pour un profil CE2', () => {
		const uuid = activeProfile().uuid;
		setNiveauReference('cm1');
		declarerVuAilleursFor(uuid, [decl(BI, 'cm1')], true, NOW);
		expect(estRencontree(BI)).toBe(true);

		setNiveauReference('ce2');
		expect(estRencontree(BI)).toBe(false);
	});

	it('les deux niveaux coexistent : revenir au CE2 retrouve sa déclaration', () => {
		const uuid = activeProfile().uuid;
		declarerVuAilleursFor(uuid, [decl(BI, 'ce2'), decl(BI, 'cm1')], true, NOW);
		expect(Object.keys(loadVuAilleursFor(uuid)).sort()).toEqual([`${BI}@ce2`, `${BI}@cm1`].sort());
		// Chaque niveau a sa propre entrée en rotation de révision.
		expect(Object.keys(revisions(uuid)).sort()).toEqual([`${BI}@ce2`, `${BI}@cm1`].sort());

		setNiveauReference('cm1');
		expect(estRencontree(BI)).toBe(true);
		setNiveauReference('ce2');
		expect(estRencontree(BI)).toBe(true);
	});

	it('le cloisonnement suit le niveau PAR MATIÈRE, pas la seule classe de référence', () => {
		const uuid = activeProfile().uuid;
		setNiveauReference('ce2');
		setNiveauMatiere('math', 'cm1'); // maths en avance, français au CE2
		declarerVuAilleursFor(uuid, [decl(BI, 'cm1'), decl(FR_A, 'ce2')], true, NOW);

		expect(estRencontree(BI)).toBe(true); // lue au niveau CM1 de la matière maths
		expect(estRencontree(FR_A)).toBe(true); // français resté au CE2
	});
});
