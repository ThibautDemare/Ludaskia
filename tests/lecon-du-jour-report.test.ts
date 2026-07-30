/* ============================================================
   Leçon du jour — SÉLECTION avec avancement assoupli et report (#485).
   ------------------------------------------------------------
   Règle métier éprouvée ici (attendus dérivés de la règle, pas relus dans le code) :
   - une leçon réussie à au moins 70 % en mode leçon fait avancer le fil, sans étoile ;
   - une leçon mise de côté sort du fil et y revient d'elle-même à l'échéance ;
   - une leçon mise de côté compte comme de l'AVANCEMENT pour l'alternance : la matière
     qui vient d'écarter une leçon passe derrière l'autre (l'enfant va travailler
     ailleurs au lieu d'escalader des prérequis durs) ;
   - au plus 2 leçons écartées par MATIÈRE en même temps ; au-delà, la plus
     anciennement écartée revient, même si son délai court ;
   - si tout ce qui reste est écarté, on repropose quand même — la plus anciennement
     écartée d'abord (un fil vide voudrait dire « programme terminé ») ;
   - le report ne verrouille rien : relancée depuis le catalogue, la leçon compte
     normalement (étoile, stats, révision espacée).

   Complète `lecon-du-jour.test.ts` (alternance par les étoiles, #484) et
   `report-lecon.test.ts` (machine à états et persistance du report).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ordreLecons } from '../src/core/ordre';
import { leconDuJour, leconSuivante, sequenceLeconDuJour } from '../src/core/lecon-du-jour';
import type { EtatReport } from '../src/core/report-lecon';
import { enReport } from '../src/core/report-lecon';
import {
	loadLessonReports,
	loadLessonRevisions,
	loadLessonStats,
	loadStars,
	recordEssaiLecon,
} from '../src/core/progress';
import { recordLessonRun } from '../src/core/lesson-run';
import { initProfiles, setNiveauReference, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	setNiveauReference('ce2');
});

const JOUR = 86_400_000;
const SEUIL = 70; // « réussie à au moins 70 % » → fait avancer le fil
const MAX_ECARTEES = 2; // par matière, en même temps
const M = ordreLecons('math', 'ce2');
const F = ordreLecons('francais', 'ce2');
const TOUT = [...M, ...F];
/* Instant fixe, heure locale, hors bascule d'heure d'été (29 mars 2026). */
const T = new Date(2026, 2, 15, 10, 0).getTime();

const etoilesDe = (ids: string[]): Record<string, number> => {
	const out: Record<string, number> = {};
	for (const id of ids) out[id] = 1;
	return out;
};
/* Leçon écartée depuis `depuis`, de retour dans `dureeJours` jours. */
const ecartee = (depuis: number, dureeJours: number): EtatReport => ({
	jours: 2,
	dernierJour: '2026-03-14',
	reporteLe: depuis,
	reprendreLe: depuis + dureeJours * JOUR,
	meilleurPct: 30,
});
/* Leçon franchie par le score seul (pas d'étoile). */
const franchieParLeScore = (pct = SEUIL): EtatReport => ({
	jours: 1,
	dernierJour: '2026-03-14',
	reporteLe: 0,
	reprendreLe: 0,
	meilleurPct: pct,
});

const fil = (
	stars: Record<string, number> = {},
	reports: Record<string, EtatReport> = {},
	now = T,
): string[] => sequenceLeconDuJour(stars, reports, now).map((l) => l.id);
/* Fil calculé sur l'état PERSISTÉ (chemin réel : étoiles + reports du profil). */
const filReel = (now: number): string[] =>
	sequenceLeconDuJour(loadStars(), loadLessonReports(), now).map((l) => l.id);
const premierDe = (ids: string[], sousEnsemble: string[]): string | undefined =>
	ids.find((id) => sousEnsemble.includes(id));

describe('fil — franchissement par le score (sans étoile)', () => {
	it('une leçon réussie à 70 % sort du fil et fait avancer sa matière', () => {
		const reports = { [M[0]]: franchieParLeScore(SEUIL) };
		const seq = fil({}, reports);
		expect(seq).not.toContain(M[0]);
		expect(seq).toHaveLength(TOUT.length - 1);
		// Maths : 1 franchie ↔ français : 0 → le français, moins avancé, ouvre le fil.
		expect(seq[0]).toBe(F[0]);
		expect(leconDuJour({}, reports, T)?.id).toBe(F[0]);
	});

	it('69 % laisse la leçon en tête du fil', () => {
		const reports = { [M[0]]: franchieParLeScore(SEUIL - 1) };
		expect(fil({}, reports)).toHaveLength(TOUT.length);
		expect(leconDuJour({}, reports, T)?.id).toBe(M[0]);
	});
});

describe('fil — une leçon écartée sort du fil et revient à échéance', () => {
	it('absente pendant le délai, de retour dès qu’il est écoulé', () => {
		const reports = { [M[0]]: ecartee(T, 1) };
		const retour = reports[M[0]].reprendreLe;
		expect(fil({}, reports, T)).not.toContain(M[0]);
		expect(fil({}, reports, retour - 1)).not.toContain(M[0]);
		const seq = fil({}, reports, retour);
		expect(seq).toContain(M[0]);
		// De retour, elle n'est plus comptée comme un avancement : égalité 0 ↔ 0 →
		// l'ordre du catalogue rend la main aux maths, sur cette leçon même.
		expect(seq[0]).toBe(M[0]);
	});

	it('elle reste dans le programme : rien n’est perdu, juste masqué', () => {
		const reports = { [M[3]]: ecartee(T, 7) };
		const seq = fil({}, reports, T);
		expect(seq).toHaveLength(TOUT.length - 1);
		expect(new Set(seq).size).toBe(seq.length);
		expect(fil({}, reports, T + 7 * JOUR)).toHaveLength(TOUT.length);
	});
});

describe('fil — l’alternance des matières tient compte du report (chemin réel)', () => {
	// 50 % = bloqué sans être « franchement bas » (< 40 %) : délais de l'escalier nu.
	it('1er jour de blocage : la leçon reste proposée (aucun report)', () => {
		recordEssaiLecon(M[0], 50, T);
		expect(loadLessonReports()[M[0]].jours).toBe(1);
		expect(filReel(T)[0]).toBe(M[0]);
	});

	it('2e jour : la leçon est écartée ET la matière passe derrière l’autre', () => {
		recordEssaiLecon(M[0], 50, T);
		recordEssaiLecon(M[0], 50, T + JOUR);
		const apres = T + JOUR + 3600_000;
		const seq = filReel(apres);
		expect(seq).not.toContain(M[0]);
		// Sans la règle « une écartée compte comme un avancement », la tête serait M[1]
		// (égalité 0 ↔ 0 → maths) : l'enfant escaladerait la séquence de maths.
		expect(seq[0]).toBe(F[0]);
		expect(premierDe(seq, M)).toBe(M[1]);
	});

	it('à l’échéance, la matière retrouve sa place dans l’alternance', () => {
		recordEssaiLecon(M[0], 50, T);
		recordEssaiLecon(M[0], 50, T + JOUR);
		const retour = loadLessonReports()[M[0]].reprendreLe;
		expect(retour).toBe(T + 2 * JOUR); // 2e jour de blocage → 1 jour de report
		expect(filReel(retour)[0]).toBe(M[0]);
	});

	it('un 2e jour à moins de 40 % écarte la leçon plus longtemps (cran suivant)', () => {
		recordEssaiLecon(M[0], 30, T);
		recordEssaiLecon(M[0], 30, T + JOUR);
		const retour = loadLessonReports()[M[0]].reprendreLe;
		expect(retour).toBe(T + JOUR + 3 * JOUR); // cran suivant de l'escalier : 3 jours
		expect(filReel(retour - 1)).not.toContain(M[0]);
		expect(filReel(retour)).toContain(M[0]);
	});

	it('chaque matière écarte la sienne : l’alternance repart d’une égalité', () => {
		for (const id of [M[0], F[0]]) {
			recordEssaiLecon(id, 50, T);
			recordEssaiLecon(id, 50, T + JOUR);
		}
		const apres = T + JOUR + 3600_000;
		const seq = filReel(apres);
		expect(seq).not.toContain(M[0]);
		expect(seq).not.toContain(F[0]);
		expect(seq[0]).toBe(M[1]); // 1 ↔ 1 → égalité → ordre du catalogue
		expect(seq[1]).toBe(F[1]);
	});
});

describe('fil — plafond de leçons écartées par matière', () => {
	it('au-delà de 2 écartées, la plus ANCIENNEMENT écartée revient dans le fil', () => {
		// Deux leçons de maths écartées (délais encore en cours) : les deux sont masquées.
		const reports: Record<string, EtatReport> = {
			[M[0]]: ecartee(T - 2 * JOUR, 7),
			[M[1]]: ecartee(T - 1 * JOUR, 7),
		};
		let seq = fil({}, reports, T);
		expect(seq).not.toContain(M[0]);
		expect(seq).not.toContain(M[1]);
		expect(premierDe(seq, M)).toBe(M[2]);

		// Une 3e s'ajoute : le plafond de 2 tient, donc la plus ancienne (M[0]) rentre.
		reports[M[2]] = ecartee(T, 7);
		seq = fil({}, reports, T);
		expect(premierDe(seq, M)).toBe(M[0]);
		expect(seq).not.toContain(M[1]);
		expect(seq).not.toContain(M[2]);
		expect(seq).toHaveLength(TOUT.length - MAX_ECARTEES);
	});

	it('le plafond est par MATIÈRE, pas global : 2 + 2 leçons peuvent être écartées', () => {
		const reports: Record<string, EtatReport> = {
			[M[0]]: ecartee(T - 2 * JOUR, 7),
			[M[1]]: ecartee(T - 1 * JOUR, 7),
			[F[0]]: ecartee(T - 2 * JOUR, 7),
			[F[1]]: ecartee(T - 1 * JOUR, 7),
		};
		const seq = fil({}, reports, T);
		for (const id of [M[0], M[1], F[0], F[1]]) expect(seq).not.toContain(id);
		expect(seq).toHaveLength(TOUT.length - 4);
		expect(seq[0]).toBe(M[2]); // 2 ↔ 2 → égalité → ordre du catalogue
	});

	it('un report déjà échu ne consomme pas le plafond', () => {
		const reports: Record<string, EtatReport> = {
			[M[0]]: ecartee(T - 8 * JOUR, 7), // échu la veille
			[M[1]]: ecartee(T - 1 * JOUR, 7),
			[M[2]]: ecartee(T, 7),
		};
		const seq = fil({}, reports, T);
		expect(seq).toContain(M[0]); // revenue d'elle-même
		expect(seq).not.toContain(M[1]);
		expect(seq).not.toContain(M[2]);
		expect(premierDe(seq, M)).toBe(M[0]);
	});
});

describe('fil — repli « tout est écarté »', () => {
	it('on repropose quand même, la plus anciennement écartée d’abord', () => {
		const dernierM = M[M.length - 1];
		const dernierF = F[F.length - 1];
		const stars = etoilesDe(TOUT.filter((id) => id !== dernierM && id !== dernierF));
		const reports: Record<string, EtatReport> = {
			[dernierF]: ecartee(T - 5 * JOUR, 7), // écartée la première
			[dernierM]: ecartee(T - 1 * JOUR, 7),
		};
		const seq = fil(stars, reports, T);
		// Un fil VIDE dirait « programme terminé » à l'accueil : ce serait faux.
		expect(seq).toEqual([dernierF, dernierM]);
		expect(leconDuJour(stars, reports, T)?.id).toBe(dernierF);
		expect(enReport(reports[dernierF], T)).toBe(true); // proposée bien qu'écartée
	});

	it('tout est franchi → fil vide (là, le programme est vraiment terminé)', () => {
		const stars = etoilesDe(M);
		const reports: Record<string, EtatReport> = {};
		for (const id of F) reports[id] = franchieParLeScore(80); // franchies par le score
		expect(fil(stars, reports, T)).toEqual([]);
		expect(leconDuJour(stars, reports, T)).toBeNull();
	});
});

describe('fil — le report ne verrouille rien', () => {
	it('relancée depuis le catalogue pendant son report, la leçon compte normalement', () => {
		const now = Date.now(); // recordLessonRun date l'essai lui-même
		recordEssaiLecon(M[0], 50, now - JOUR);
		recordEssaiLecon(M[0], 50, now);
		expect(enReport(loadLessonReports()[M[0]], now)).toBe(true);
		expect(filReel(now)).not.toContain(M[0]);

		const out = recordLessonRun({
			mode: 'lecon',
			lessonId: M[0],
			ok: 10,
			questionCount: 10,
			ms: 0,
			perLesson: { [M[0]]: { ok: 10, total: 10 } },
		});
		// L'essai compte pleinement : étoile, stats et révision espacée.
		expect(out.starInfo?.newStar).toBe(true);
		expect(loadLessonStats()[M[0]].bestPct).toBe(100);
		expect(loadLessonRevisions()[M[0]]).toBeTruthy();
		// Et le report est levé : la leçon est franchie, donc sortie du fil.
		expect(loadLessonReports()[M[0]].reprendreLe).toBe(0);
		expect(filReel(now)).not.toContain(M[0]);
	});

	it('« voir une autre leçon » depuis une leçon qu’on vient d’écarter : repart de la tête', () => {
		const reports = { [M[0]]: ecartee(T, 1) };
		const suivante = leconSuivante(M[0], {}, reports, T);
		expect(suivante).not.toBeNull();
		expect(suivante!.id).not.toBe(M[0]); // jamais de cul-de-sac
		expect(suivante!.id).toBe(fil({}, reports, T)[0]);
	});
});

describe('fil — invariants sous états de report quelconques (échantillon large)', () => {
	it('jamais vide tant qu’il reste à franchir, ordre conservé, au plus 2 masquées par matière', () => {
		const entree = fc.record({
			idx: fc.nat({ max: TOUT.length - 1 }),
			depuisJ: fc.integer({ min: -20, max: 0 }), // écartée il y a n jours
			dureeJ: fc.integer({ min: -5, max: 40 }), // délai (négatif → déjà échu)
			meilleurPct: fc.integer({ min: 0, max: 100 }),
			jours: fc.integer({ min: 0, max: 9 }),
		});
		fc.assert(
			fc.property(
				fc.subarray(TOUT, { maxLength: 12 }),
				fc.array(entree, { maxLength: 12 }),
				(etoilees, entrees) => {
					const stars = etoilesDe(etoilees);
					const reports: Record<string, EtatReport> = {};
					for (const e of entrees) {
						reports[TOUT[e.idx]] = {
							jours: e.jours,
							dernierJour: '2026-03-14',
							reporteLe: T + e.depuisJ * JOUR,
							reprendreLe: T + (e.depuisJ + e.dureeJ) * JOUR,
							meilleurPct: e.meilleurPct,
						};
					}
					// Attendus recalculés depuis la RÈGLE : franchie = étoilée ou ≥ 70 %.
					const franchie = (id: string) =>
						(stars[id] ?? 0) > 0 || (reports[id]?.meilleurPct ?? 0) >= SEUIL;
					const restM = M.filter((id) => !franchie(id));
					const restF = F.filter((id) => !franchie(id));
					const seq = fil(stars, reports, T);

					// 1. Rien d'inventé, rien en double, rien de franchi.
					expect(new Set(seq).size).toBe(seq.length);
					expect(seq.every((id) => !franchie(id))).toBe(true);
					// 2. Le fil n'est vide QUE si le programme est entièrement franchi.
					expect(seq.length === 0).toBe(restM.length + restF.length === 0);
					// 3. Chaque matière garde son ordre pédagogique.
					expect(seq.filter((id) => restM.includes(id))).toEqual(
						restM.filter((id) => seq.includes(id)),
					);
					expect(seq.filter((id) => restF.includes(id))).toEqual(
						restF.filter((id) => seq.includes(id)),
					);
					// 4. Ce qui manque au fil est écarté à cet instant, et jamais plus de 2
					//    par matière (sauf repli, où rien n'est masqué).
					for (const rest of [restM, restF]) {
						const masquees = rest.filter((id) => !seq.includes(id));
						expect(masquees.length).toBeLessThanOrEqual(MAX_ECARTEES);
						expect(masquees.every((id) => enReport(reports[id], T))).toBe(true);
					}
					// 5. La carte d'accueil montre la tête du fil.
					expect(leconDuJour(stars, reports, T)?.id ?? null).toBe(seq[0] ?? null);
				},
			),
			{ numRuns: 250 },
		);
	});
});
