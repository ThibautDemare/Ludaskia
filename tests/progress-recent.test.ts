/* ============================================================
   #234 — performance RÉCENTE (recentPct) et journal d'activité.
   recentPct = fenêtre glissante des derniers essais (base de « à revoir » et de
   l'état d'acquisition) ; le journal d'activité date CHAQUE session finalisée
   (toutes, pas seulement les bilans/sprints).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	recordLessonStats,
	recentAvgPct,
	loadLessonStats,
	loadActivity,
} from '../src/core/progress';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('recentPct (fenêtre glissante)', () => {
	it('ne conserve que les 5 derniers essais', () => {
		// 7 sessions de math-doubles, pct = 0,10,20,…,60 (ok = i sur 10).
		for (let i = 0; i <= 6; i++) recordLessonStats({ 'math-doubles': { ok: i, total: 10 } });
		const stat = loadLessonStats()['math-doubles'];
		expect(stat.recentPct).toEqual([20, 30, 40, 50, 60]); // les 5 derniers
		expect(stat.attempts).toBe(7); // le cumul, lui, garde tout
	});

	it('recentAvgPct = moyenne des derniers ; null sans historique', () => {
		recordLessonStats({ 'math-doubles': { ok: 8, total: 10 } });
		recordLessonStats({ 'math-doubles': { ok: 6, total: 10 } });
		expect(recentAvgPct(loadLessonStats()['math-doubles'])).toBe(70); // (80+60)/2
		expect(
			recentAvgPct({ attempts: 1, correct: 5, questions: 10, bestPct: 50, lastPct: 50 }),
		).toBeNull();
		expect(recentAvgPct(undefined)).toBeNull();
	});
});

describe('journal d’activité', () => {
	it('un point par session finalisée (toutes, pas que bilans/sprints)', () => {
		expect(loadActivity().length).toBe(0);
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } }); // leçon seule
		recordLessonStats({
			'math-complements': { ok: 3, total: 10 },
			'math-moities': { ok: 4, total: 6 },
		}); // bilan 2 leçons = 1 session
		expect(loadActivity().length).toBe(2);
	});

	it('une session sans question (total 0) n’est pas journalisée', () => {
		recordLessonStats({ 'math-doubles': { ok: 0, total: 0 } });
		expect(loadActivity().length).toBe(0);
	});
});
