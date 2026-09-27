/* ============================================================
   Appoint de la classe précédente dans le sprint (#724) — logique pure.
   Tests écrits AVANT l'implémentation, depuis les critères numérotés de l'issue
   (numéros dans les noms). Attendus dérivés du contrat, jamais du code.

   - `partAppointSprint(k, n)` = 0 si k = 0, sinon min(15 %, k/(n+k)) ;
   - `fragilesSprint(filtre, cartes)` = leçons de la classe précédente, fragiles au
     sens de la consolidation (#723), éligibles au sprint, restreintes au filtre ;
   - `tirerAppoint(r, n, fragiles)` = une fragile avec la probabilité ci-dessus.

   Fixtures : vrai catalogue, ids réels. Leurs propriétés sont des PRÉMISSES
   vérifiées en tête de fichier : un changement de catalogue fait échouer la
   prémisse, pas un critère. Cartes brutes fabriquées, clés `lessonId@niveau`.
   Les critères « absente » portent tous un TÉMOIN présent dans le même appel :
   sans lui, une fonction qui renvoie toujours [] les passerait.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	PART_APPOINT_SPRINT_MAX,
	fragilesSprint,
	partAppointSprint,
	tirerAppoint,
} from '../src/core/appoint-sprint';
import { consolidationBasNiveau, type CartesBrutes } from '../src/core/consolidation-bas-niveau';
import {
	SUBJECTS,
	estEligibleSprintHorsNiveau,
	getAllLessons,
	getLessonById,
	type LessonDef,
} from '../src/core/catalog';
import type { LessonStat } from '../src/core/maitrise';
import type { EtatReport } from '../src/core/report-lecon';
import {
	initProfiles,
	setNiveauMatiere,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { loadCartesBrutes, recordLessonStats } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Fabriques (calquées sur consolidation-bas-niveau.test.ts) ---------- */
const T = 1_699_000_000_000;

/** Stat d'une leçon : `essais` = fenêtre récente, un couple [bonnes, questions] par essai. */
function stat(essais: Array<[number, number]>, bestPct?: number): LessonStat {
	const pcts = essais.map(([ok, total]) => Math.round((100 * ok) / total));
	return {
		attempts: essais.length,
		correct: essais.reduce((s, [ok]) => s + ok, 0),
		questions: essais.reduce((s, [, total]) => s + total, 0),
		bestPct: bestPct ?? Math.max(...pcts),
		lastPct: pcts[pcts.length - 1],
		recents: essais.map(([ok, total]) => ({ ok, total })),
		lastAt: T,
	};
}
/** Stat « jamais travaillée » : une entrée existe, mais aucune question posée. */
const STAT_VIDE: LessonStat = { attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 };

/** État de report : `meilleurPct` = meilleur score sur un essai COMPLET en mode leçon. */
function report(meilleurPct: number): EtatReport {
	return { jours: 1, dernierJour: '2023-11-14', reporteLe: 0, reprendreLe: 0, meilleurPct };
}
function cartes(c: Partial<CartesBrutes>): CartesBrutes {
	return { stars: {}, stats: {}, reports: {}, ...c };
}
/** Leçons travaillées à 40 % au CE2 (clé `id@ce2`), ni étoilées ni reportées. */
function fragilesCe2(...ids: string[]): Record<string, LessonStat> {
	return Object.fromEntries(ids.map((id) => [`${id}@ce2`, stat([[4, 10]])]));
}
function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
}
const idsDe = (ls: readonly LessonDef[]) => ls.map((l) => l.id);

/** PRNG déterministe à graine (mulberry32) : un tirage reproductible, sans Math.random. */
function mulberry32(graine: number): () => number {
	let a = graine >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* ---------- Ids (propriétés vérifiées dans « prémisses ») ---------- */
const TABLES = 'math-tables-multiplication'; // CE2 seul, calcul mental, éligible
const COMPLEMENTS = 'math-complements'; // CE2 seul, calcul mental, éligible
const DOUBLES = 'math-doubles'; // CE2 seul, calcul mental, éligible
const DECOMPOSE = 'num-decompose-100'; // CE2 seul, éligible, HORS calcul mental
const DIV_RESTE = 'math-div-reste'; // CE2 seul, excludeFromSprint
const ADD_POSEE = 'calc-addition-posee'; // CE2 seul, posée (exclue sans le drapeau)
const COMPARER = 'num-comparer'; // CE2 + CM1, éligible
const FR = 'fr-mbp'; // français, CE2 seul, éligible
const CALCUL_MENTAL = 'math-calcul-mental';

describe("prémisses du catalogue (un échec ici = changer d'id, pas de critère)", () => {
	it.each([TABLES, COMPLEMENTS, DOUBLES])(
		'%s : maths, CE2 seul, calcul mental, éligible au sprint',
		(id) => {
			const l = lecon(id);
			expect(l.subject).toBe('math');
			expect(l.levels).toEqual(['ce2']);
			expect(l.category).toBe(CALCUL_MENTAL);
			expect(estEligibleSprintHorsNiveau(l)).toBe(true);
		},
	);
	it(`${DECOMPOSE} : maths, CE2 seul, éligible, dans une autre catégorie que le calcul mental`, () => {
		const l = lecon(DECOMPOSE);
		expect(l.subject).toBe('math');
		expect(l.levels).toEqual(['ce2']);
		expect(l.category).not.toBe(CALCUL_MENTAL);
		expect(estEligibleSprintHorsNiveau(l)).toBe(true);
	});
	it(`${DIV_RESTE} : maths, CE2 seul, exclue du sprint par excludeFromSprint`, () => {
		const l = lecon(DIV_RESTE);
		expect(l.subject).toBe('math');
		expect(l.levels).toEqual(['ce2']);
		expect(l.excludeFromSprint).toBe(true);
		expect(estEligibleSprintHorsNiveau(l)).toBe(false);
	});
	it(`${ADD_POSEE} : maths, CE2 seul, exclue du sprint SANS le drapeau (leçon posée)`, () => {
		const l = lecon(ADD_POSEE);
		expect(l.subject).toBe('math');
		expect(l.levels).toEqual(['ce2']);
		expect(l.excludeFromSprint).not.toBe(true);
		expect(estEligibleSprintHorsNiveau(l)).toBe(false);
	});
	it(`${COMPARER} : maths, CE2 + CM1, éligible au sprint`, () => {
		const l = lecon(COMPARER);
		expect(l.subject).toBe('math');
		expect([...l.levels].sort()).toEqual(['ce2', 'cm1']);
		expect(estEligibleSprintHorsNiveau(l)).toBe(true);
	});
	it(`${FR} : français, CE2 seul, éligible au sprint`, () => {
		const l = lecon(FR);
		expect(l.subject).toBe('francais');
		expect(l.levels).toEqual(['ce2']);
		expect(estEligibleSprintHorsNiveau(l)).toBe(true);
	});
	it('les exclues du sprint SONT fragiles pour la consolidation : leur absence viendra du filtre sprint', () => {
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({ stats: fragilesCe2(TABLES, DIV_RESTE, ADD_POSEE, COMPARER) }),
		);
		const ids = r?.fragiles.map((f) => f.lesson.id) ?? [];
		expect(ids).toEqual(expect.arrayContaining([TABLES, DIV_RESTE, ADD_POSEE]));
		expect(ids).not.toContain(COMPARER);
	});
	it('30 leçons distinctes sont disponibles pour les tirages', () => {
		expect(new Set(idsDe(getAllLessons().slice(0, 30))).size).toBe(30);
	});
});

describe("critère 9 — part de l'appoint : min(15 %, k/(n+k)), 0 sans fragile", () => {
	it('le plafond vaut 15 %', () => {
		expect(PART_APPOINT_SPRINT_MAX).toBe(0.15);
	});
	it('sans fragile (k = 0) → 0, y compris pool vide (pas de NaN)', () => {
		expect(partAppointSprint(0, 50)).toBe(0);
		expect(partAppointSprint(0, 1)).toBe(0);
		expect(partAppointSprint(0, 0)).toBe(0);
	});
	it('sous le plafond → k/(n+k)', () => {
		expect(partAppointSprint(1, 50)).toBeCloseTo(1 / 51, 12);
		expect(partAppointSprint(2, 98)).toBeCloseTo(0.02, 12);
		expect(partAppointSprint(5, 45)).toBeCloseTo(0.1, 12);
	});
	it('au plafond et au-delà → 15 %', () => {
		expect(partAppointSprint(3, 17)).toBeCloseTo(0.15, 12); // k/(n+k) = 0,15 pile
		expect(partAppointSprint(4, 16)).toBeCloseTo(0.15, 12); // 0,2 plafonné
		expect(partAppointSprint(30, 50)).toBeCloseTo(0.15, 12); // 0,375 plafonné
		expect(partAppointSprint(1, 0)).toBeCloseTo(0.15, 12); // pool actif vide : 1 plafonné
	});
});

describe("critère 9 — tirage de l'appoint, 2 000 tirages à graine fixe", () => {
	const GRAINE = 724;
	const TIRAGES = 2000;
	const N = 50;
	const FRAGILES_30 = getAllLessons().slice(0, 30);
	function tirages(graine: number, n: number, fragiles: readonly LessonDef[]) {
		const r = mulberry32(graine);
		return Array.from({ length: TIRAGES }, () => tirerAppoint(r, n, fragiles));
	}
	const nonNuls = (t: Array<LessonDef | null>) => t.filter((x) => x !== null);

	it("k = 30, n = 50 : entre 10 % et 20 % de tirages d'appoint", () => {
		const part = nonNuls(tirages(GRAINE, N, FRAGILES_30)).length / TIRAGES;
		expect(part).toBeGreaterThanOrEqual(0.1);
		expect(part).toBeLessThanOrEqual(0.2);
	});
	it("k = 1, n = 50 : au plus 5 % de tirages d'appoint, mais pas aucun", () => {
		const part = nonNuls(tirages(GRAINE, N, FRAGILES_30.slice(0, 1))).length / TIRAGES;
		// Part attendue 1/51 ≈ 2 % : ~39 tirages sur 2 000, jamais 0 en pratique.
		expect(part).toBeGreaterThan(0);
		expect(part).toBeLessThanOrEqual(0.05);
	});
	it("k = 0 : aucun tirage d'appoint (null strict), pool actif vide compris", () => {
		for (const n of [N, 0]) {
			for (const t of tirages(GRAINE, n, [])) expect(t).toBeNull();
		}
	});
	it('une leçon tirée appartient toujours aux fragiles, et le tirage ne se fige pas sur une seule', () => {
		const fragiles = new Set(idsDe(FRAGILES_30));
		const tirees = nonNuls(tirages(GRAINE, N, FRAGILES_30));
		expect(tirees.length).toBeGreaterThan(0);
		for (const l of tirees) expect(fragiles.has(l.id)).toBe(true);
		expect(new Set(idsDe(tirees)).size).toBeGreaterThan(1);
	});
	it('même graine → même suite de tirages (le générateur injecté est le seul aléa)', () => {
		const suite = (t: Array<LessonDef | null>) => t.map((x) => x?.id ?? null);
		const a = suite(tirages(GRAINE, N, FRAGILES_30));
		expect(a.some((x) => x !== null)).toBe(true);
		expect(suite(tirages(GRAINE, N, FRAGILES_30))).toEqual(a);
	});
});

describe('critère 9 — ensemble des fragiles tirables, maths en CM1', () => {
	beforeEach(() => setNiveauMatiere('math', 'cm1'));

	it('une CE2 seule éligible, travaillée à 40 % et non franchie, est proposée', () => {
		const f = fragilesSprint({ subject: 'math' }, cartes({ stats: fragilesCe2(TABLES) }));
		expect(idsDe(f)).toContain(TABLES);
	});
	it('franchie (report à 70 % ou étoile) → absente ; à 69 % elle reste proposée', () => {
		const c = cartes({
			stats: fragilesCe2(TABLES, COMPLEMENTS, DOUBLES),
			reports: { [`${TABLES}@ce2`]: report(69), [`${COMPLEMENTS}@ce2`]: report(70) },
			stars: { [`${DOUBLES}@ce2`]: 1 },
		});
		const ids = idsDe(fragilesSprint({ subject: 'math' }, c));
		expect(ids).toContain(TABLES);
		expect(ids).not.toContain(COMPLEMENTS);
		expect(ids).not.toContain(DOUBLES);
	});
	it('critère 15 — jamais travaillée (aucune entrée, ou entrée sans question) → absente', () => {
		const c = cartes({ stats: { ...fragilesCe2(TABLES), [`${COMPLEMENTS}@ce2`]: STAT_VIDE } });
		const ids = idsDe(fragilesSprint({ subject: 'math' }, c));
		expect(ids).toContain(TABLES); // témoin
		expect(ids).not.toContain(COMPLEMENTS); // entrée à 0 question
		expect(ids).not.toContain(DOUBLES); // aucune entrée
	});
	it('exclue du sprint (excludeFromSprint, ou leçon posée) → absente même fragile', () => {
		const c = cartes({ stats: fragilesCe2(TABLES, DIV_RESTE, ADD_POSEE) });
		const ids = idsDe(fragilesSprint({ subject: 'math' }, c));
		expect(ids).toContain(TABLES); // témoin
		expect(ids).not.toContain(DIV_RESTE);
		expect(ids).not.toContain(ADD_POSEE);
	});
	it('critère 16 — une leçon CE2 + CM1 fragile à @ce2 → absente', () => {
		const c = cartes({ stats: fragilesCe2(TABLES, COMPARER) });
		const ids = idsDe(fragilesSprint({ subject: 'math' }, c));
		expect(ids).toContain(TABLES); // témoin
		expect(ids).not.toContain(COMPARER);
	});
	it("filtre subject 'francais' → aucune leçon de maths, la fragile de français oui", () => {
		setNiveauMatiere('francais', 'cm1');
		const f = fragilesSprint({ subject: 'francais' }, cartes({ stats: fragilesCe2(TABLES, FR) }));
		expect(idsDe(f)).toContain(FR);
		expect(f.filter((l) => l.subject === 'math')).toEqual([]);
	});
	it("filtre subject 'math' → aucune leçon de français, même fragile en CM1", () => {
		setNiveauMatiere('francais', 'cm1');
		const f = fragilesSprint({ subject: 'math' }, cartes({ stats: fragilesCe2(TABLES, FR) }));
		expect(idsDe(f)).toContain(TABLES);
		expect(f.filter((l) => l.subject !== 'math')).toEqual([]);
	});
	it('sans filtre → toutes les matières', () => {
		setNiveauMatiere('francais', 'cm1');
		const ids = idsDe(fragilesSprint({}, cartes({ stats: fragilesCe2(TABLES, FR) })));
		expect(ids).toEqual(expect.arrayContaining([TABLES, FR]));
	});
	it('filtre category → seulement cette catégorie (matière déduite ou donnée)', () => {
		setNiveauMatiere('francais', 'cm1');
		const c = cartes({ stats: fragilesCe2(TABLES, DECOMPOSE, FR) });
		for (const filtre of [
			{ category: CALCUL_MENTAL },
			{ subject: 'math', category: CALCUL_MENTAL },
		]) {
			const f = fragilesSprint(filtre, c);
			expect(idsDe(f)).toContain(TABLES);
			expect(f.filter((l) => l.category !== CALCUL_MENTAL)).toEqual([]);
		}
		const catFr = lecon(FR).category;
		const f = fragilesSprint({ category: catFr }, c);
		expect(idsDe(f)).toContain(FR);
		expect(f.filter((l) => l.category !== catFr)).toEqual([]);
	});
});

describe('critères 14 et 17 — pas de classe juste en dessous à consolider → vide', () => {
	it('critère 14 — maths passées en CM2 : les fragiles de CE2 ne sont plus proposées', () => {
		const c = cartes({ stats: fragilesCe2(TABLES, COMPLEMENTS) });
		setNiveauMatiere('math', 'cm1');
		expect(idsDe(fragilesSprint({ subject: 'math' }, c))).toContain(TABLES); // témoin : mêmes cartes
		setNiveauMatiere('math', 'cm2');
		expect(fragilesSprint({ subject: 'math' }, c)).toEqual([]);
		expect(fragilesSprint({ category: CALCUL_MENTAL }, c)).toEqual([]);
		expect(fragilesSprint({}, c).filter((l) => l.subject === 'math')).toEqual([]);
	});
	it('critère 17 — profil entièrement en CE2 → vide, même avec des états de CE2 fragiles', () => {
		const c = cartes({ stats: fragilesCe2(TABLES, FR) });
		for (const s of SUBJECTS) setNiveauMatiere(s.id, 'cm1');
		expect(idsDe(fragilesSprint({}, c))).toEqual(expect.arrayContaining([TABLES, FR])); // témoin
		for (const s of SUBJECTS) setNiveauMatiere(s.id, undefined);
		setNiveauReference('ce2');
		expect(fragilesSprint({}, c)).toEqual([]);
		expect(fragilesSprint({ subject: 'math' }, c)).toEqual([]);
		expect(fragilesSprint({ subject: 'francais' }, c)).toEqual([]);
		expect(fragilesSprint({ category: CALCUL_MENTAL }, c)).toEqual([]);
	});
});

describe("critère 10 — stockage d'un sprint (comportement existant, verrouillé)", () => {
	beforeEach(() => setNiveauMatiere('math', 'cm1'));

	it('maths en CM1 : une CE2 seule jouée en sprint est comptée sous @ce2, jamais sous @cm1', () => {
		recordLessonStats({ [TABLES]: { ok: 1, total: 2 } }, 'sprint');
		const stats = loadCartesBrutes().stats;
		expect(stats[`${TABLES}@ce2`]).toMatchObject({ correct: 1, questions: 2 });
		expect(stats[`${TABLES}@cm1`]).toBeUndefined();
		expect(Object.keys(stats).filter((k) => k.startsWith(`${TABLES}@`))).toEqual([`${TABLES}@ce2`]);
	});
	it('témoin du même sprint : une leçon CE2 + CM1 est comptée sous @cm1', () => {
		recordLessonStats({ [TABLES]: { ok: 1, total: 2 }, [COMPARER]: { ok: 2, total: 2 } }, 'sprint');
		const stats = loadCartesBrutes().stats;
		expect(stats[`${COMPARER}@cm1`]).toMatchObject({ correct: 2, questions: 2 });
		expect(stats[`${COMPARER}@ce2`]).toBeUndefined();
		expect(stats[`${TABLES}@ce2`]).toMatchObject({ correct: 1, questions: 2 });
	});
	it("l'essai de sprint enregistré (50 %) rend la leçon tirable en appoint", () => {
		recordLessonStats({ [TABLES]: { ok: 1, total: 2 } }, 'sprint');
		expect(idsDe(fragilesSprint({ subject: 'math' }, loadCartesBrutes()))).toContain(TABLES);
	});
});
