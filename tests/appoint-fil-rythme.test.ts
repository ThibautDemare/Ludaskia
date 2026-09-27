/* ============================================================
   Appoint de la classe précédente dans « Ta prochaine leçon » (#724) :
   rythme 1 sur 4 (critère 7) et neutralité vis-à-vis de l'avancement (critère 8).
   Tests écrits AVANT l'implémentation, depuis les critères numérotés de l'issue.
   Attendus dérivés du contrat, jamais du code.

   Scénario maison : maths en CM1, français au CP (aucune leçon, donc fil 100 %
   maths). L'enfant prend la tête du fil, la franchit, recommence (`derouler`).
   Les franchissements passent par `recordEssaiLecon` à `t` strictement croissant :
   c'est ce chemin qui les date, et le fil lit leur ORDRE.

   Fixtures : ids réels du catalogue. Leurs propriétés (CE2 seule, absente de
   `PREREQUIS`) sont des PRÉMISSES vérifiées en tête : un changement de catalogue
   fait échouer la prémisse, pas un critère.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { leconDuJour, tourMatiereFait } from '../src/core/lecon-du-jour';
import { consolidationBasNiveau } from '../src/core/consolidation-bas-niveau';
import { ordreLecons } from '../src/core/ordre';
import { getLessonById } from '../src/core/catalog';
import { PREREQUIS, type ExigencePrerequis } from '../src/data/ordre-pedagogique';
import {
	STARS_KEY,
	loadCartesBrutes,
	recordEssaiLecon,
	recordLessonStats,
} from '../src/core/progress';
import { initProfiles, setNiveauMatiere, touchActiveProfile } from '../src/core/profiles';
import { lsGet, lsSet, setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	setNiveauMatiere('math', 'cm1');
	setNiveauMatiere('francais', 'cp'); // aucune leçon au CP : fil 100 % maths
});

const T = new Date(2026, 8, 15, 10, 0).getTime();
const M1 = ordreLecons('math', 'cm1');
const estCe2Seule = (id: string) => {
	const l = getLessonById(id)!;
	return l.levels.length === 1 && l.levels[0] === 'ce2';
};
function etoiler(ids: string[], niveau: 'ce2' | 'cm1') {
	const s = lsGet(STARS_KEY, {}) as Record<string, number>;
	for (const id of ids) s[`${id}@${niveau}`] = 1;
	lsSet(STARS_KEY, s);
}
/** Travailler (≥ 1 question) : pour une CE2-only, maths en CM1, écrit sous `@ce2`. */
const travailler = (id: string, ok: number, total: number) =>
	recordLessonStats({ [id]: { ok, total } }, 'sprint');
/** Simule l'enfant : prend la tête du fil, la franchit, recommence. Renvoie les ids proposés. */
function derouler(n: number, t0 = T): string[] {
	const out: string[] = [];
	let t = t0;
	for (let i = 0; i < n; i++) {
		const l = leconDuJour(undefined, undefined, t);
		if (!l) break;
		out.push(l.id);
		recordEssaiLecon(l.id, 100, t);
		t += 60_000;
	}
	return out;
}

/* ---------- Outils d'analyse d'une séquence proposée ---------- */

const aplatir = (e: readonly ExigencePrerequis[]): string[] =>
	e.flatMap((x) => (typeof x === 'string' ? [x] : [...x]));
/** Toute leçon citée comme prérequis d'au moins une entrée de `PREREQUIS`. */
const TOUS_PREREQUIS = new Set(Object.values(PREREQUIS).flatMap(aplatir));
/** CE2 seules, prérequis d'aucune entrée : purement « appoint ». */
const CANDIDATS = [
	'math-complements',
	'math-doubles',
	'math-moities',
	'calc-addition-posee',
	'num-decompose-100',
];
const idsFragiles = () =>
	consolidationBasNiveau('math', 'cm1', loadCartesBrutes())!.fragiles.map((f) => f.lesson.id);

/** Paires de CE2 consécutives NON admises. Seule exception : des prérequis successifs
    de la même tête CM1 (critère 3, « plusieurs prérequis dans l'ordre pédagogique »),
    traités comme un bloc. */
function pairesCe2Consecutives(out: string[]): string[][] {
	const fautives: string[][] = [];
	for (let i = 0; i + 1 < out.length; i++) {
		const a = out[i];
		const b = out[i + 1];
		if (!estCe2Seule(a) || !estCe2Seule(b)) continue;
		const tete = out.slice(i + 2).find((id) => !estCe2Seule(id));
		const pre = tete ? aplatir(PREREQUIS[tete] ?? []) : [];
		if (pre.includes(a) && pre.includes(b)) continue;
		fautives.push([a, b]);
	}
	return fautives;
}
/** Débuts des fenêtres glissantes de 4 qui ne contiennent pas exactement une CE2. */
function fenetresFautives(out: string[]): number[] {
	const fautives: number[] = [];
	for (let i = 0; i + 4 <= out.length; i++) {
		if (out.slice(i, i + 4).filter(estCe2Seule).length !== 1) fautives.push(i);
	}
	return fautives;
}
/** Débuts des tronçons de 8 propositions sans CE2 alors qu'il restait une fragile. */
function tronconsSansCe2(out: string[], nFragiles: number): number[] {
	const fautifs: number[] = [];
	for (let i = 0; i + 8 <= out.length; i++) {
		if (out.slice(0, i).filter(estCe2Seule).length >= nFragiles) break;
		if (!out.slice(i, i + 8).some(estCe2Seule)) fautifs.push(i);
	}
	return fautifs;
}

describe('prémisses (catalogue réel : échouent si le catalogue change)', () => {
	it("les candidats d'appoint sont des CE2 seules, prérequis d'aucune entrée", () => {
		for (const id of CANDIDATS) {
			expect(estCe2Seule(id), id).toBe(true);
			expect(TOUS_PREREQUIS.has(id), id).toBe(false);
			expect(id in PREREQUIS, id).toBe(false);
		}
	});
	it("l'ordre CM1 de maths est assez long pour les déroulés", () => {
		expect(M1.length).toBeGreaterThanOrEqual(5 + 20 + 3);
		expect(M1.every((id) => !estCe2Seule(id))).toBe(true);
	});
});

describe('critère 7 : une CE2 fragile sur quatre en tête du fil', () => {
	/** Travaille 4 candidats avec des perfs distinctes, dans l'ordre INVERSE du rang
	    pédagogique CE2 : la plus fragile est la dernière au programme. Une implémentation
	    qui servirait par ordre de programme au lieu de fragilité se trahit. */
	function quatreFragiles(): string[] {
		const rangCe2 = ordreLecons('math', 'ce2');
		const quatre = CANDIDATS.slice(0, 4).sort((a, b) => rangCe2.indexOf(a) - rangCe2.indexOf(b));
		const oks = [13, 11, 5, 3]; // sur 20 : 65 %, 55 % (en cours), 25 %, 15 % (non acquis)
		quatre.forEach((id, i) => travailler(id, oks[i], 20));
		const fragiles = consolidationBasNiveau('math', 'cm1', loadCartesBrutes())!.fragiles;
		// Prémisses : exactement ces 4, deux états représentés, ordre ≠ ordre du programme.
		expect(new Set(fragiles.map((f) => f.lesson.id))).toEqual(new Set(quatre));
		expect(new Set(fragiles.map((f) => f.etat))).toEqual(new Set(['non-acquis', 'en-cours']));
		const ordre = fragiles.map((f) => f.lesson.id);
		expect(ordre).not.toEqual(quatre);
		return ordre;
	}

	it("7a : pas deux CE2 d'affilée, une CE2 par fenêtre de 4, la plus fragile d'abord", () => {
		const ordre = quatreFragiles(); // calculé AVANT la boucle
		const out = derouler(16);
		expect(out).toHaveLength(16);
		const servies = out.filter(estCe2Seule);
		expect(servies.length, `CE2 servies dans ${out.join(', ')}`).toBeGreaterThanOrEqual(3);
		expect(pairesCe2Consecutives(out)).toEqual([]);
		expect(fenetresFautives(out), `fenêtres fautives dans ${out.join(', ')}`).toEqual([]);
		expect(servies).toEqual(ordre.slice(0, servies.length));
	});

	it.each([
		['sans historique', false],
		['avec un historique CM1 antérieur non daté', true],
	])("7b (%s) : jamais 8 franchies sans CE2 tant qu'il en reste", (_nom, historique) => {
		CANDIDATS.forEach((id, i) => travailler(id, 2 + 2 * i, 20));
		expect(idsFragiles()).toHaveLength(CANDIDATS.length);
		if (historique) etoiler(M1.slice(0, 5), 'cm1');
		const out = derouler(20);
		expect(out).toHaveLength(20);
		expect(tronconsSansCe2(out, CANDIDATS.length), out.join(', ')).toEqual([]);
	});

	it('7c : un prérequis inséré compte comme la CE2 de sa fenêtre', () => {
		const tete = 'math-ordre-grandeur-produit';
		const pre = 'math-tables-multiplication';
		// Prémisses : la tête est dans les 8 premières CM1, `pre` est son prérequis et
		// une CE2 seule ; l'autre prérequis (`math-multiplier-10-100`) reste jamais travaillé.
		expect(M1.indexOf(tete)).toBeGreaterThanOrEqual(0);
		expect(M1.indexOf(tete)).toBeLessThan(8);
		expect(aplatir(PREREQUIS[tete] ?? [])).toContain(pre);
		expect(estCe2Seule(pre)).toBe(true);
		travailler(pre, 8, 20); // 40 %
		travailler('math-complements', 2, 20); // 10 %
		travailler('math-doubles', 4, 20); // 20 %
		// Le prérequis est la MOINS fragile des trois : servi en appoint, il ne passerait
		// qu'après les deux autres, donc pas avant que sa tête n'arrive.
		expect(idsFragiles()).toEqual(['math-complements', 'math-doubles', pre]);

		const out = derouler(16);
		const i = out.indexOf(pre);
		expect(i, out.join(', ')).toBeGreaterThanOrEqual(0);
		// Scénario (critère 3) : le prérequis est servi quand sa tête arrive.
		expect(out[i + 1], out.join(', ')).toBe(tete);
		// Critère 7 : il tient lieu de CE2 de sa fenêtre → trois CM1 derrière lui.
		expect(out.slice(i + 1, i + 4).filter(estCe2Seule), out.join(', ')).toEqual([]);
		expect(out.slice(i + 1, i + 4)).toHaveLength(3);
		expect(pairesCe2Consecutives(out), out.join(', ')).toEqual([]);
	});

	it.each([
		['2 CM1 restantes, tout le reste étoilé', 2],
		['5 CM1 restantes : le rythme court encore puis doit cesser', 5],
	])("7d (%s) : moins de 3 CM1 à franchir, plus de CE2 d'appoint", (_nom, restantes) => {
		const reste = M1.slice(-restantes);
		// Prémisse : les deux dernières CM1 n'ont ni ne sont de prérequis. Pour les autres
		// restantes, aucune insertion n'est possible de toute façon : seuls des CANDIDATS
		// sont travaillés, et aucun n'est prérequis de quoi que ce soit (prémisse de tête).
		for (const id of M1.slice(-2)) {
			expect(id in PREREQUIS, id).toBe(false);
			expect(TOUS_PREREQUIS.has(id), id).toBe(false);
		}
		etoiler(M1.slice(0, -restantes), 'cm1');
		CANDIDATS.slice(0, 4).forEach((id, k) => travailler(id, 2 + 2 * k, 20));
		expect(idsFragiles()).toHaveLength(4);

		const out = derouler(restantes + 4);
		// Pour chaque proposition, combien de CM1 restaient à franchir AVANT elle.
		let restant = restantes;
		const fautes: string[] = [];
		for (const id of out) {
			if (restant > 0 && restant < 3 && estCe2Seule(id)) {
				fautes.push(`${id} (${restant} CM1 restantes)`);
			}
			if (!estCe2Seule(id)) restant--;
		}
		// Toutes les CM1 restantes ont bien été proposées (sinon le test ne dit rien).
		expect(out.filter((id) => !estCe2Seule(id))).toEqual(reste);
		expect(fautes, out.join(', ')).toEqual([]);
	});

	it('7e : fragiles épuisées, plus aucune CE2 sur 8 propositions', () => {
		travailler('math-complements', 4, 20);
		expect(idsFragiles()).toEqual(['math-complements']);
		const out = derouler(12);
		const i = out.indexOf('math-complements');
		// Une fenêtre de 4 contient une CE2 : la seule fragile arrive dans les 4 premières.
		expect(i, out.join(', ')).toBeGreaterThanOrEqual(0);
		expect(i).toBeLessThan(4);
		expect(idsFragiles()).toEqual([]); // franchie par le fil
		const apres = out.slice(i + 1);
		expect(apres.length).toBeGreaterThanOrEqual(8);
		expect(apres.filter(estCe2Seule), out.join(', ')).toEqual([]);
	});
});

describe("critère 8 : l'appoint n'entre pas dans l'avancement de la matière", () => {
	/** Travaille puis franchit, hors fil, les 4 premiers candidats. */
	function franchirFragilesHorsFil(t0: number): void {
		const quatre = CANDIDATS.slice(0, 4);
		quatre.forEach((id, k) => travailler(id, 2 + 2 * k, 20));
		expect(idsFragiles()).toHaveLength(4);
		quatre.forEach((id, k) => recordEssaiLecon(id, 100, t0 + k * 60_000));
		expect(idsFragiles()).toEqual([]); // prémisse : bien franchies
	}

	it('8a : toutes les CM1 franchies, des CE2 fragiles en attente → tour fait, et le reste', () => {
		etoiler(M1, 'cm1');
		CANDIDATS.slice(0, 4).forEach((id, k) => travailler(id, 2 + 2 * k, 20));
		// Les fragiles en attente ne retiennent pas le tour (complétude CM1).
		expect(tourMatiereFait('math')).toBe(true);
		CANDIDATS.slice(0, 4).forEach((id, k) => recordEssaiLecon(id, 100, T + k * 60_000));
		expect(idsFragiles()).toEqual([]);
		expect(tourMatiereFait('math')).toBe(true);
	});

	it("8a : une CM1 restante → tour pas fait, et les CE2 franchies n'y changent rien", () => {
		etoiler(M1.slice(0, -1), 'cm1');
		expect(tourMatiereFait('math')).toBe(false);
		franchirFragilesHorsFil(T);
		expect(tourMatiereFait('math')).toBe(false);
		// Témoin : dans cet état, franchir la CM1 restante fait basculer le tour.
		recordEssaiLecon(M1[M1.length - 1], 100, T + 10 * 60_000);
		expect(tourMatiereFait('math')).toBe(true);
	});

	describe('8b : alternance entre matières', () => {
		const F1 = ordreLecons('francais', 'cm1');
		beforeEach(() => {
			setNiveauMatiere('francais', 'cm1');
			recordEssaiLecon(F1[0], 100, T); // français : 1 CM1 franchie ; maths : 0
		});

		it('prémisse : maths à 0, français à 1 → les maths passent devant', () => {
			expect(leconDuJour(undefined, undefined, T + 60_000)?.subject).toBe('math');
		});

		it.each([
			['appoint', 'math-complements', 'math-doubles'],
			['prérequis', 'math-tables-multiplication', 'math-div-reste'],
		])('2 CE2 de maths franchies (%s) : les maths restent devant le français', (_n, a, b) => {
			expect(estCe2Seule(a) && estCe2Seule(b)).toBe(true);
			travailler(a, 2, 20);
			travailler(b, 4, 20);
			expect(idsFragiles()).toEqual([a, b]);
			recordEssaiLecon(a, 100, T + 60_000);
			recordEssaiLecon(b, 100, T + 120_000);
			expect(idsFragiles()).toEqual([]); // aucune fragile restante
			expect(leconDuJour(undefined, undefined, T + 180_000)?.subject).toBe('math');
		});

		it('témoin : 2 CM1 de maths franchies font, elles, passer le français devant', () => {
			recordEssaiLecon(M1[0], 100, T + 60_000);
			recordEssaiLecon(M1[1], 100, T + 120_000);
			expect(leconDuJour(undefined, undefined, T + 180_000)?.subject).toBe('francais');
		});
	});
});
