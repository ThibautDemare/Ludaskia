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

	it('lastAt = date de la dernière session, et avance à chaque session (#suivi encadrant)', () => {
		const avant = Date.now();
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } });
		const s1 = loadLessonStats()['math-doubles'];
		expect(s1.lastAt).toBeGreaterThanOrEqual(avant);
		// Une 2e session ne fait jamais reculer la date.
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } });
		const s2 = loadLessonStats()['math-doubles'];
		expect(s2.lastAt!).toBeGreaterThanOrEqual(s1.lastAt!);
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

/* ============================================================
   RÉFÉRENCE de la session (#498) — le journal dit désormais QUOI a été travaillé.
   Sans elle, le programme du jour ne peut attribuer une étape que par TYPE, donc il
   ignore le travail fait depuis une autre porte que ses tuiles (cf. core/seance.ts).
   Contrat éprouvé : la référence n'existe que pour une session à cible UNIQUE (une leçon,
   une liste de dictée) ; un bilan, un sprint ou un tour de révision espacée en couvrent
   plusieurs et n'en portent donc aucune — « pas de cible » se lit à l'ABSENCE de la clé.
   ============================================================ */
describe('référence de la session journalisée (#498)', () => {
	/** Dernière entrée du journal (celle que la session vient d'écrire). */
	function derniere() {
		const j = loadActivity();
		return j[j.length - 1];
	}
	it('recordLessonStats : la cible fournie est journalisée telle quelle', () => {
		const avant = Date.now();
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } }, 'lecon', 'math-doubles');
		expect(Object.keys(derniere()).sort()).toEqual(['k', 'ref', 't']);
		expect(derniere()).toMatchObject({ k: 'lecon', ref: 'math-doubles' });
		expect(derniere().t).toBeGreaterThanOrEqual(avant);
	});
	it('recordLessonStats sans cible (défaut, bilan, sprint) : AUCUNE clé `ref`', () => {
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } }); // défaut → lecon, sans cible
		expect('ref' in derniere()).toBe(false);
		recordLessonStats(
			{ 'math-doubles': { ok: 5, total: 10 }, 'math-moities': { ok: 2, total: 4 } },
			'bilan',
		);
		expect('ref' in derniere()).toBe(false);
		recordLessonStats({ 'math-doubles': { ok: 5, total: 10 } }, 'sprint');
		expect('ref' in derniere()).toBe(false);
	});
	it('recordSessionActivity : cible portée pour une dictée, absente pour la révision espacée', () => {
		recordSessionActivity('dictee', 'fr-ortho-invariables-1');
		expect(derniere()).toMatchObject({ k: 'dictee', ref: 'fr-ortho-invariables-1' });
		recordSessionActivity('revision'); // rejoue des items de plusieurs origines
		expect('ref' in derniere()).toBe(false);
	});
	it('recordLessonRun : la leçon jouée est référencée en mode « leçon », jamais en bilan', () => {
		const base = {
			ok: 4,
			questionCount: 8,
			ms: 500,
			perLesson: { 'math-doubles': { ok: 4, total: 8 } },
		};
		recordLessonRun({ ...base, mode: 'lecon', lessonId: 'math-doubles' });
		expect(derniere()).toMatchObject({ k: 'lecon', ref: 'math-doubles' });
		recordLessonRun({
			...base,
			mode: 'express',
			lessonId: null,
			perLesson: { 'math-doubles': { ok: 4, total: 8 }, 'math-moities': { ok: 1, total: 2 } },
		});
		expect(derniere().k).toBe('bilan');
		expect('ref' in derniere()).toBe(false);
	});
	it('la borne du journal (200 entrées) conserve les références des plus récentes', () => {
		for (let i = 0; i < 205; i++) recordSessionActivity('dictee', 'liste-' + i);
		const j = loadActivity();
		expect(j).toHaveLength(200);
		expect(j[0].ref).toBe('liste-5'); // FIFO : les 5 premières ont sauté
		expect(j[199].ref).toBe('liste-204');
	});
});

describe('normalizeActivity et la référence (#498)', () => {
	it('conserve une ref textuelle, ÉCARTE une ref vide ou non textuelle', () => {
		const out = normalizeActivity([
			{ t: 100, k: 'lecon', ref: 'math-doubles' },
			{ t: 200, k: 'dictee', ref: 'fr-ortho-invariables-1' },
			{ t: 300, k: 'lecon', ref: '' }, // vide → pas de cible
			{ t: 400, k: 'lecon', ref: 42 }, // non textuelle → pas de cible
			{ t: 500, k: 'lecon', ref: null },
			{ t: 600, k: 'bilan' }, // multi-cibles : pas de clé du tout
			700, // ancien format : horodatage nu
		]);
		expect(out).toEqual([
			{ t: 100, k: 'lecon', ref: 'math-doubles' },
			{ t: 200, k: 'dictee', ref: 'fr-ortho-invariables-1' },
			{ t: 300, k: 'lecon' },
			{ t: 400, k: 'lecon' },
			{ t: 500, k: 'lecon' },
			{ t: 600, k: 'bilan' },
			{ t: 700, k: 'inconnu' },
		]);
		// « Pas de cible » = clé ABSENTE (un seul cas à traiter côté attribution).
		for (const e of out.slice(2)) expect('ref' in e).toBe(false);
	});
	it('une ref survit à un type inconnu, mais sans son type (héritage lisible)', () => {
		expect(normalizeActivity([{ t: 100, k: 'zzz', ref: 'math-doubles' }])).toEqual([
			{ t: 100, k: 'inconnu', ref: 'math-doubles' },
		]);
	});
	it('rétrocompat : un journal d’AVANT #498 reste lisible, simplement sans cible', () => {
		lsSet(ACTIVITY_KEY, [
			{ t: 100, k: 'lecon' },
			{ t: 200, k: 'dictee' },
		]);
		const j = loadActivity();
		expect(j.map((e) => e.k)).toEqual(['lecon', 'dictee']);
		expect(j.every((e) => !('ref' in e))).toBe(true);
		// Une session neuve s'ajoute avec SA cible, sans réécrire l'héritage.
		recordSessionActivity('dictee', 'fr-ortho-invariables-1');
		const j2 = loadActivity();
		expect(j2).toHaveLength(3);
		expect(j2[2].ref).toBe('fr-ortho-invariables-1');
		expect('ref' in j2[0]).toBe(false);
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
