/* ============================================================
   Journal daté des paliers franchis (#397) — `recordMonteesPalier`.
   ------------------------------------------------------------
   Ce journal est la SEULE source datée de l'évolution d'une notion : c'est lui qui
   alimente la frise d'états par leçon de l'espace encadrant (#521, éprouvée dans
   frise-etats.test.ts). On verrouille donc ici son modèle : « premier franchissement »
   seulement, monotone, « en cours »/« acquis » uniquement (« à renforcer » n'est pas un
   progrès), pas d'oscillation, saut direct = une seule marche, et dates JAMAIS réécrites
   (une date qui bouge décalerait toute la frise et le « depuis le … » lu par le parent).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsGet } from '../src/core/storage';
import {
	recordLessonStats,
	recordLessonResult,
	recordMonteesPalier,
	LESSON_PALIERS_KEY,
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

const T = 1_700_000_000_000; // instant de référence
const JOUR = 86_400_000;

describe('recordMonteesPalier (journal des franchissements)', () => {
	it('« en cours » atteint → une marche datée « enCours »', () => {
		recordLessonStats({ 'math-complements': { ok: 8, total: 10 } }); // 80 % → en cours
		recordMonteesPalier(['math-complements'], T);
		expect(journal()['math-complements@ce2']).toEqual({ enCours: T });
	});

	it('« à renforcer » (< 40 %) n’est PAS un palier franchi → rien', () => {
		recordLessonStats({ 'math-complements': { ok: 2, total: 10 } }); // 20 % → à renforcer
		recordMonteesPalier(['math-complements'], T);
		expect(journal()['math-complements@ce2']).toBeUndefined();
	});

	it('« acquis » direct (étoile au 1er coup) → UNE seule marche « acquis », pas « enCours »', () => {
		recordLessonResult('math-doubles', true); // étoile → acquis
		recordMonteesPalier(['math-doubles'], T);
		expect(journal()['math-doubles@ce2']).toEqual({ acquis: T });
	});

	it('« en cours » puis « acquis » → deux marches, la date de « enCours » est préservée', () => {
		recordLessonStats({ 'math-moities': { ok: 8, total: 10 } }); // en cours
		recordMonteesPalier(['math-moities'], T);
		recordLessonResult('math-moities', true); // étoile → acquis
		recordMonteesPalier(['math-moities'], T + 5 * JOUR);
		expect(journal()['math-moities@ce2']).toEqual({ enCours: T, acquis: T + 5 * JOUR });
	});

	it('oscillation autour du seuil : ne re-loggue PAS une remontée déjà franchie', () => {
		recordLessonStats({ 'math-moities': { ok: 8, total: 10 } }); // en cours
		recordMonteesPalier(['math-moities'], T);
		recordLessonStats({ 'math-moities': { ok: 1, total: 10 } }); // rechute (< 40 %)
		recordMonteesPalier(['math-moities'], T + 1000);
		recordLessonStats({ 'math-moities': { ok: 9, total: 10 } }); // remonte « en cours »
		recordMonteesPalier(['math-moities'], T + 2000);
		// La date d'« enCours » reste la 1re (pas de bruit d'oscillation).
		expect(journal()['math-moities@ce2']).toEqual({ enCours: T });
	});

	it('dates FIGÉES : rejouer une leçon déjà acquise ne rajeunit aucune marche', () => {
		// Sans ce verrou, la frise et le « acquis depuis le … » de l'espace encadrant se
		// décaleraient à chaque nouvelle session réussie de la même leçon.
		recordLessonStats({ 'math-moities': { ok: 8, total: 10 } });
		recordMonteesPalier(['math-moities'], T);
		recordLessonResult('math-moities', true); // étoile
		recordMonteesPalier(['math-moities'], T + JOUR);
		const avant = journal()['math-moities@ce2'];
		recordLessonResult('math-moities', true); // re-réussie 3 semaines plus tard
		recordMonteesPalier(['math-moities'], T + 22 * JOUR);
		expect(journal()['math-moities@ce2']).toEqual(avant);
	});
});
