/* ============================================================
   Frise d'évolution (#397) — journal daté des paliers franchis + agrégation hebdo.
   Deux volets :
   - recordMonteesPalier : ce qui est loggué (modèle « premier franchissement » monotone,
     « en cours »/« acquis » seulement, pas d'oscillation, saut direct = 1 marche) ;
   - frisesParMatiere : bucketing hebdomadaire, dédoublonnage par semaine, seuil de recul.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSetRaw } from '../src/core/storage';
import {
	recordLessonStats,
	recordLessonResult,
	recordMonteesPalier,
	LESSON_PALIERS_KEY,
	type PaliersNotion,
} from '../src/core/progress';
import { frisesParMatiere, progressionProfil } from '../src/core/encadrant-stats';

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
		recordMonteesPalier(['math-moities'], T + 5 * 86400000);
		expect(journal()['math-moities@ce2']).toEqual({ enCours: T, acquis: T + 5 * 86400000 });
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
});

const SEMAINE = 7 * 86400000;

describe('frisesParMatiere (agrégation hebdomadaire par matière)', () => {
	it('trop récent (< 3 semaines de recul) → matière masquée', () => {
		const profile = activeProfile();
		const paliers = { 'math-complements@ce2': { enCours: T - 1 * SEMAINE } };
		expect(frisesParMatiere(paliers, profile, T)).toEqual([]);
	});

	it('assez de recul → frise math avec le bon comptage par semaine', () => {
		const profile = activeProfile();
		const paliers: Record<string, PaliersNotion> = {
			'math-complements@ce2': { enCours: T - 5 * SEMAINE },
			'math-doubles@ce2': { enCours: T - 1 * SEMAINE },
			'math-moities@ce2': { acquis: T - 2 * SEMAINE },
		};
		const frises = frisesParMatiere(paliers, profile, T);
		expect(frises.length).toBe(1);
		const math = frises[0];
		expect(math.subject).toBe('math');
		expect(math.semaines.length).toBe(12);
		expect(math.total).toBe(3);
		// Index 11 = semaine courante ; marches à 5/2/1 semaines → index 6/9/10.
		expect(math.semaines[6]).toBe(1);
		expect(math.semaines[9]).toBe(1);
		expect(math.semaines[10]).toBe(1);
		expect(math.semaines.reduce((s, x) => s + x, 0)).toBe(3);
	});

	it('une notion franchissant deux caps la MÊME semaine ne compte qu’une fois', () => {
		const profile = activeProfile();
		const paliers = {
			'math-complements@ce2': { enCours: T - 4 * SEMAINE, acquis: T - 4 * SEMAINE },
		};
		const frises = frisesParMatiere(paliers, profile, T);
		expect(frises.length).toBe(1);
		expect(frises[0].total).toBe(1);
		expect(frises[0].semaines.reduce((s, x) => s + x, 0)).toBe(1);
	});

	it('marche antérieure à la fenêtre (12 sem.) → matière masquée (rien à tracer)', () => {
		const profile = activeProfile();
		const paliers = { 'math-complements@ce2': { enCours: T - 20 * SEMAINE } };
		expect(frisesParMatiere(paliers, profile, T)).toEqual([]);
	});

	it('scoping par niveau : une marche @cm1 est ignorée pour un profil CE2', () => {
		const profile = activeProfile(); // niveau par défaut = CE2
		const paliers = {
			'math-complements@cm1': { enCours: T - 5 * SEMAINE },
			'math-doubles@cm1': { acquis: T - 2 * SEMAINE },
		};
		expect(frisesParMatiere(paliers, profile, T)).toEqual([]); // clés hors niveau → rien
	});
});

describe('progressionProfil : intègre la frise (lecture par UUID)', () => {
	it('expose recap.frises calculé depuis le journal du profil consulté', () => {
		const a = activeProfile();
		lsSetRaw(
			a.uuid + '/' + LESSON_PALIERS_KEY,
			JSON.stringify({
				'math-complements@ce2': { enCours: T - 5 * SEMAINE },
				'math-doubles@ce2': { acquis: T - 1 * SEMAINE },
			}),
		);
		const recap = progressionProfil(a, T);
		const math = recap.frises.find((f) => f.subject === 'math');
		expect(math).toBeTruthy();
		expect(math!.total).toBe(2);
	});
});
