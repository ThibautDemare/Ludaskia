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
	normalizeActivity,
	recordSessionActivity,
	ACTIVITY_KEY,
} from '../src/core/progress';
import { recordLessonRun } from '../src/core/lesson-run';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsSet } from '../src/core/storage';

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

	it('journalise le TYPE de session (#319) ; défaut « lecon »', () => {
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } }); // défaut → lecon
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } }, 'bilan');
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } }, 'sprint');
		expect(loadActivity().map((e) => e.k)).toEqual(['lecon', 'bilan', 'sprint']);
		expect(loadActivity().every((e) => typeof e.t === 'number')).toBe(true);
	});

	it('migration : l’ANCIEN format (nombres) est lu en type « inconnu »', () => {
		lsSet(ACTIVITY_KEY, [111, 222]); // ancien journal = horodatages nus
		expect(loadActivity()).toEqual([
			{ t: 111, k: 'inconnu' },
			{ t: 222, k: 'inconnu' },
		]);
		// Une nouvelle session réécrit le journal au format objet (héritage conservé + typé).
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } }, 'sprint');
		const j = loadActivity();
		expect(j.length).toBe(3);
		expect(j[2].k).toBe('sprint');
	});
});

describe('type journalisé selon le mode (jointure recordLessonRun → journal, #319)', () => {
	const base = {
		ok: 5,
		questionCount: 10,
		ms: 1000,
		perLesson: { 'math-doubles': { ok: 5, total: 10 } },
	};
	it("mode 'lecon' → 'lecon' ; 'express'/'complet' → 'bilan'", () => {
		recordLessonRun({ ...base, mode: 'lecon', lessonId: 'math-doubles' });
		recordLessonRun({ ...base, mode: 'express', lessonId: null });
		recordLessonRun({ ...base, mode: 'complet', lessonId: null });
		expect(loadActivity().map((e) => e.k)).toEqual(['lecon', 'bilan', 'bilan']);
	});
	it("recordSessionActivity journalise les types hors recordLessonStats ('revision', 'dictee')", () => {
		recordSessionActivity('revision');
		recordSessionActivity('dictee');
		expect(loadActivity().map((e) => e.k)).toEqual(['revision', 'dictee']);
	});
});

describe('normalizeActivity (tolérance de format, #319)', () => {
	it('rejette les entrées invalides, conserve les valides', () => {
		const out = normalizeActivity([
			123, // ancien : horodatage → inconnu
			{ t: 456, k: 'lecon' },
			{ t: 600, k: 'revision' }, // nouveaux types acceptés (#319)
			{ t: 650, k: 'dictee' },
			{ t: 789, k: 'zzz' }, // type inconnu → 'inconnu'
			{ k: 'sprint' }, // sans horodatage → ignoré
			null,
			'x',
		]);
		expect(out).toEqual([
			{ t: 123, k: 'inconnu' },
			{ t: 456, k: 'lecon' },
			{ t: 600, k: 'revision' },
			{ t: 650, k: 'dictee' },
			{ t: 789, k: 'inconnu' },
		]);
	});
	it('entrée non tableau → []', () => {
		expect(normalizeActivity(undefined)).toEqual([]);
		expect(normalizeActivity({})).toEqual([]);
	});
});
