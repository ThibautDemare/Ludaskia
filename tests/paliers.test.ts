/* ============================================================
   Journal daté des paliers franchis (#397) — `recordMonteesPalier`.
   ------------------------------------------------------------
   Ce journal est la SEULE source datée de l'évolution d'une notion : c'est lui qui
   alimente la frise d'états par leçon de l'espace encadrant (#521, éprouvée dans
   frise-etats.test.ts). On verrouille donc ici son modèle : « premier franchissement »
   seulement, monotone, « en cours »/« acquis » uniquement (« à renforcer » n'est pas un
   progrès), pas d'oscillation, saut direct = une seule marche, et dates JAMAIS réécrites
   (une date qui bouge décalerait toute la frise et le « depuis le … » lu par le parent).
   Plus la borne de MISE EN SERVICE du journal (second describe, en bas de fichier), qui dit
   à partir de quand un horodatage ABSENT veut dire quelque chose.

   PÉRIMÈTRE, depuis que `recordLessonStats` reporte ses franchissements lui-même : ce fichier
   éprouve la RÈGLE, `recordMonteesPalier` appelé directement avec un `now` maîtrisé (la
   fonction reste exportée pour ça). Le CÂBLAGE — une session réellement enregistrée écrit la
   borne et ses marches d'elle-même, dans le bon ordre — est éprouvé dans
   `paliers-cablage.test.ts`, avec la frise de bout en bout.
   CONVENTION assumée ici : les fixtures de % passent par `recordLessonStats`, donc par une
   vraie fin de session — laquelle pose la borne SYNCHRONIQUEMENT et reporte ses propres
   franchissements en MICROTÂCHE. On les DATE (`auMoment`) à l'instant de la marche testée : la
   session ne peut alors ni contredire l'attendu (même instant, même borne), ni dispenser la
   règle d'être appelée (son report n'a pas encore tourné quand le test observe). Le fait
   « rien n'est écrit avant le flush » — vrai des franchissements, faux de la borne — est
   épinglé dans `paliers-cablage.test.ts`.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
	initProfiles,
	addProfile,
	setActiveProfile,
	activeProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, lsGet } from '../src/core/storage';
import {
	recordLessonStats,
	recordLessonResult,
	recordMonteesPalier,
	recordSessionActivity,
	markLessonsFirstSeen,
	LESSON_PALIERS_KEY,
	PALIERS_DEBUT_KEY,
	type PaliersNotion,
} from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Journal des paliers du profil ACTIF (clés `lessonId@niveau`). */
function journal(): Record<string, PaliersNotion> {
	return lsGet(LESSON_PALIERS_KEY, {});
}
/* Borne de mise en service du journal pour le profil ACTIF (horodatage scalaire). */
function borne(): number | null {
	return lsGet(PALIERS_DEBUT_KEY, null);
}
/* Fin de la tâche courante : laisse tourner l'éventuel report de franchissements d'une session
   (microtâche). Indispensable dès qu'un test affirme une ABSENCE de marche — sans quoi il
   constaterait seulement que le report n'a pas encore eu lieu. */
const finDeTache = (): Promise<void> => Promise.resolve();
/* Session (ou geste) datée à un instant FIGÉ : une vraie fin de session lit l'horloge, or les
   attendus d'ici sont écrits à la milliseconde. Pattern d'encadrant-banque.test.ts. */
function auMoment<T>(t: number, geste: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return geste();
	} finally {
		spy.mockRestore();
	}
}

const T = 1_700_000_000_000; // instant de référence
const JOUR = 86_400_000;

describe('recordMonteesPalier (journal des franchissements)', () => {
	it('« en cours » atteint → une marche datée « enCours »', () => {
		auMoment(T, () => recordLessonStats({ 'math-complements': { ok: 8, total: 10 } })); // 80 %
		recordMonteesPalier(['math-complements'], T);
		expect(journal()['math-complements@ce2']).toEqual({ enCours: T });
	});

	it('« à renforcer » (< 40 %) n’est PAS un palier franchi → rien', () => {
		auMoment(T, () => recordLessonStats({ 'math-complements': { ok: 2, total: 10 } })); // 20 %
		recordMonteesPalier(['math-complements'], T);
		expect(journal()['math-complements@ce2']).toBeUndefined();
	});

	it('« acquis » direct (étoile au 1er coup) → UNE seule marche « acquis », pas « enCours »', () => {
		recordLessonResult('math-doubles', true); // étoile → acquis
		recordMonteesPalier(['math-doubles'], T);
		expect(journal()['math-doubles@ce2']).toEqual({ acquis: T });
	});

	it('« en cours » puis « acquis » → deux marches, la date de « enCours » est préservée', () => {
		auMoment(T, () => recordLessonStats({ 'math-moities': { ok: 8, total: 10 } })); // en cours
		recordMonteesPalier(['math-moities'], T);
		recordLessonResult('math-moities', true); // étoile → acquis
		recordMonteesPalier(['math-moities'], T + 5 * JOUR);
		expect(journal()['math-moities@ce2']).toEqual({ enCours: T, acquis: T + 5 * JOUR });
	});

	it('oscillation autour du seuil : ne re-loggue PAS une remontée déjà franchie', () => {
		auMoment(T, () => recordLessonStats({ 'math-moities': { ok: 8, total: 10 } })); // en cours
		recordMonteesPalier(['math-moities'], T);
		auMoment(T + 1000, () => recordLessonStats({ 'math-moities': { ok: 1, total: 10 } })); // rechute
		recordMonteesPalier(['math-moities'], T + 1000);
		auMoment(T + 2000, () => recordLessonStats({ 'math-moities': { ok: 9, total: 10 } })); // remonte
		recordMonteesPalier(['math-moities'], T + 2000);
		// La date d'« enCours » reste la 1re (pas de bruit d'oscillation).
		expect(journal()['math-moities@ce2']).toEqual({ enCours: T });
	});

	it('la borne de mise en service accompagne la marche, au même instant', () => {
		// La session pose la borne en écrivant ses stats, et la marche porte le même instant :
		// aucune marche ne peut donc précéder la borne du profil. Une borne POSTÉRIEURE
		// obligerait `debutSuiviPaliers` à la rattraper pour ne pas rendre 'inconnu' une semaine
		// déjà datée par un cap.
		auMoment(T, () => recordLessonStats({ 'math-complements': { ok: 8, total: 10 } }));
		recordMonteesPalier(['math-complements'], T);
		expect(borne()).toBe(T);
		expect(journal()['math-complements@ce2']).toEqual({ enCours: T });
	});

	it('dates FIGÉES : rejouer une leçon déjà acquise ne rajeunit aucune marche', () => {
		// Sans ce verrou, la frise et le « acquis depuis le … » de l'espace encadrant se
		// décaleraient à chaque nouvelle session réussie de la même leçon.
		auMoment(T, () => recordLessonStats({ 'math-moities': { ok: 8, total: 10 } }));
		recordMonteesPalier(['math-moities'], T);
		recordLessonResult('math-moities', true); // étoile
		recordMonteesPalier(['math-moities'], T + JOUR);
		const avant = journal()['math-moities@ce2'];
		recordLessonResult('math-moities', true); // re-réussie 3 semaines plus tard
		recordMonteesPalier(['math-moities'], T + 22 * JOUR);
		expect(journal()['math-moities@ce2']).toEqual(avant);
	});
});

/* ============================================================
   Borne de MISE EN SERVICE du journal (PALIERS_DEBUT_KEY).
   ------------------------------------------------------------
   Ce que cette borne date, c'est le journal qui TOURNE, pas un franchissement : passé elle,
   un horodatage absent veut dire « aucune montée observée » et la frise de l'espace encadrant
   peut déduire l'état d'une semaine ; avant elle, rien ne se déduit. D'où deux exigences
   contre-intuitives : elle est posée même quand la session ne franchit rien (c'est justement
   l'enfant qui débute qu'il faut pouvoir décrire), et elle n'est jamais réécrite (la déplacer
   rendrait 'inconnu' des semaines déjà éclairées). Et elle ne regarde pas le TYPE de session :
   une dictée, une révision espacée l'attestent comme une leçon.
   ============================================================ */
describe('recordMonteesPalier (borne de mise en service)', () => {
	it('toute session finalisée la pose, dictée et révision espacée comprises', async () => {
		// Ce qu'elle date, c'est le journal EN SERVICE, pas un type de session : sans ça, un enfant
		// qui ne fait que des dictées et de la révision espacée n'aurait aucune borne et l'espace
		// encadrant afficherait « aucun suivi » sur toutes ses leçons alors qu'il travaille (le
		// bénéfice, vu du parent, est éprouvé dans paliers-cablage.test.ts).
		// La déduction reste juste pour autant : ces chemins n'écrivent AUCUNE stat de leçon, et
		// l'étoile ne s'obtient que par celui qui en écrit — entre une telle borne et la première
		// session de leçon, aucun état n'a pu bouger. D'où le vrai invariant, vérifié ici : ils
		// posent la borne et ne journalisent JAMAIS de franchissement.
		auMoment(T, () => recordSessionActivity('dictee', 'fr-ortho-invariables-1'));
		expect(borne()).toBe(T);
		auMoment(T + 30 * JOUR, () => recordSessionActivity('revision'));
		await finDeTache(); // aucune marche, même passé le report
		expect(borne()).toBe(T); // et la 2de session ne réécrit pas la borne
		expect(journal()).toEqual({});
	});

	it('une étoile ou une 1re rencontre, seules, ne la posent pas : c’est la SESSION qui atteste', async () => {
		// Écritures internes d'une session, prises hors de toute session : elles n'attestent rien.
		// C'est ce qui laisse exister l'état « historique sans journal » des profils d'avant #521.
		recordLessonResult('math-doubles', true);
		markLessonsFirstSeen(['math-doubles'], T);
		await finDeTache(); // une absence ne s'affirme qu'au-delà du report différé
		expect(borne()).toBeNull();
		expect(journal()).toEqual({});
	});

	it('posée même quand la session ne franchit AUCUN palier', () => {
		auMoment(T, () => recordLessonStats({ 'math-complements': { ok: 2, total: 10 } })); // 20 %
		recordMonteesPalier(['math-complements'], T);
		expect(borne()).toBe(T);
		expect(journal()).toEqual({}); // et le journal reste vide
	});

	it('posée même sur une liste de leçons VIDE (sprint hors catalogue, session écourtée)', () => {
		recordMonteesPalier([], T);
		expect(borne()).toBe(T);
		expect(journal()).toEqual({});
	});

	it('JAMAIS réécrite : une borne qui avance rendrait « inconnues » des semaines déjà lues', () => {
		recordMonteesPalier([], T);
		recordLessonStats({ 'math-moities': { ok: 8, total: 10 } }); // vraie session, tout autre instant
		recordMonteesPalier(['math-moities'], T + 22 * JOUR);
		expect(borne()).toBe(T);
	});

	it('l’epoch (0) est une borne posée, pas une borne absente', () => {
		// Piège du falsy : un `if (!borne)` la reposerait à la session suivante, et la frise
		// perdrait tout ce qu'elle avait déduit.
		recordMonteesPalier([], 0);
		recordMonteesPalier([], T);
		expect(borne()).toBe(0);
	});

	it('une borne par PROFIL : la session de l’un ne date pas le journal de l’autre', () => {
		const a = activeProfile().uuid;
		recordMonteesPalier([], T);
		const b = addProfile('Cadette').uuid;
		setActiveProfile(b);
		expect(borne()).toBeNull(); // le nouveau profil n'hérite de rien
		recordMonteesPalier([], T + 30 * JOUR);
		expect(borne()).toBe(T + 30 * JOUR);
		setActiveProfile(a);
		expect(borne()).toBe(T); // inchangée
	});
});
