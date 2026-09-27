/* #724 — insertion de PRÉREQUIS de la classe précédente dans « Ta prochaine leçon »
   (le fil de la leçon du jour). Tests écrits AVANT l'implémentation, depuis les critères
   de l'issue : les critères positifs (3, 4, 5-retour) sont rouges tant que le fil ignore
   la classe précédente ; les critères négatifs (5-report, 6, 14, 15, 16, 17) passent
   déjà et gardent ce que l'implémentation ne doit PAS faire. La cadence « appoint 1 sur 4 »
   (autres leçons CE2 fragiles) est tenue ailleurs (`appoint-fil-rythme.test.ts`) : ici on
   ne travaille en CE2 QUE les prérequis visés. */
import { beforeEach, describe, it, expect } from 'vitest';
import { leconDuJour, leconSuivante, sequenceLeconDuJour } from '../src/core/lecon-du-jour';
import { ordreLecons } from '../src/core/ordre';
import { getLessonById } from '../src/core/catalog';
import { PREREQUIS } from '../src/data/ordre-pedagogique';
import {
	LESSON_REPORT_KEY,
	LESSON_STATS_KEY,
	STARS_KEY,
	loadLessonReports,
	loadStars,
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
	setNiveauMatiere('francais', 'cp'); // aucune leçon au CP : le fil ne contient que des maths
});
const JOUR = 86_400_000;
const T = new Date(2026, 8, 15, 10, 0).getTime(); // heure locale, hors bascule d'heure
const M1 = ordreLecons('math', 'cm1');
const TABLES = 'math-tables-multiplication',
	X10 = 'math-multiplier-10-100',
	RESTE = 'math-div-reste';
const OG = 'math-ordre-grandeur-produit',
	DIV = 'math-division-euclidienne';
const estCe2Seule = (id: string) => {
	const l = getLessonById(id)!;
	return l.levels.length === 1 && l.levels[0] === 'ce2';
};
/** Étoiles posées à la main (historique ANTÉRIEUR, non daté). */
function etoiler(ids: string[], niveau: 'ce2' | 'cm1') {
	const s = lsGet(STARS_KEY, {}) as Record<string, number>;
	for (const id of ids) s[`${id}@${niveau}`] = 1;
	lsSet(STARS_KEY, s);
}
/** Travailler une leçon (au moins une question) : pour une CE2-only, maths en CM1, écrit sous `@ce2`. */
const travailler = (id: string, ok: number, total: number) =>
	recordLessonStats({ [id]: { ok, total } }, 'sprint');
/** Essai COMPLET en mode leçon, daté `t` (≥ 70 % franchit ; < 70 % deux jours civils distincts = mise de côté). */
const essai = (id: string, pct: number, t: number) => recordEssaiLecon(id, pct, t);
const fil = (t: number) => sequenceLeconDuJour(undefined, undefined, t).map((l) => l.id);
/** Stat brute d'une leçon travaillée à 40 % (4/10), posée à la main sous une clé de niveau. */
const STAT_40 = { attempts: 1, correct: 4, questions: 10, bestPct: 40, lastPct: 40 };
/** Leçon OUVERTE mais sans aucune question répondue : ce n'est pas « travaillée ». */
const STAT_VIDE = { attempts: 1, correct: 0, questions: 0, bestPct: 0, lastPct: 0 };
const poserStats = (stats: Record<string, object>) => lsSet(LESSON_STATS_KEY, stats);
const aplatir = (id: string) =>
	(PREREQUIS[id] ?? []).flatMap((e) => (typeof e === 'string' ? [e] : [...e]));
const occurrences = (ids: string[], id: string) => ids.filter((x) => x === id).length;
const mettreEnTete = (id: string) => etoiler(M1.slice(0, M1.indexOf(id)), 'cm1');

describe('#724 prérequis — prémisses du scénario', () => {
	it('les prérequis visés sont bien déclarés, CE2-only, et dans cet ordre CE2', () => {
		expect(aplatir(OG)).toEqual(expect.arrayContaining([TABLES, X10]));
		expect(aplatir(DIV)).toEqual(expect.arrayContaining([RESTE, TABLES]));
		for (const id of [TABLES, X10, RESTE]) expect(estCe2Seule(id)).toBe(true);
		expect(estCe2Seule('num-comparer')).toBe(false);
		const c2 = ordreLecons('math', 'ce2');
		expect(c2.indexOf(TABLES)).toBeLessThan(c2.indexOf(X10));
		expect(c2.indexOf(X10)).toBeLessThan(c2.indexOf(RESTE));
		expect(M1.indexOf(OG)).toBe(6);
		expect(M1.indexOf(DIV)).toBe(7);
	});

	it('sans rien travailler en CE2, étoiler le début du parcours CM1 met OG puis DIV en tête', () => {
		etoiler(M1.slice(0, 6), 'cm1');
		expect(fil(T)[0]).toBe(OG);
		localStorage.clear();
		initProfiles();
		setNiveauMatiere('math', 'cm1');
		setNiveauMatiere('francais', 'cp');
		etoiler(M1.slice(0, 7), 'cm1');
		expect(fil(T)[0]).toBe(DIV);
		expect(fil(T).every((id) => M1.includes(id))).toBe(true);
	});
});

describe('#724 critère 3 — un prérequis travaillé en CE2 sans être franchi passe en tête du fil', () => {
	it("critère 3 (cas d'échec nommé) : TABLES travaillée à 40 %, DIV en tête → la carte propose TABLES", () => {
		mettreEnTete(DIV);
		travailler(TABLES, 4, 10);
		// Prémisse : la stat est bien rangée sous la clé CE2 (classe précédente).
		expect(Object.keys(lsGet(LESSON_STATS_KEY, {}) as object)).toContain(`${TABLES}@ce2`);
		expect(leconDuJour(undefined, undefined, T)?.id).toBe(TABLES);
		expect(fil(T).slice(0, 2)).toEqual([TABLES, DIV]);
	});

	it('critère 3 : deux prérequis travaillés (TABLES, X10), OG en tête → [TABLES, X10, OG] en tête du fil', () => {
		mettreEnTete(OG);
		travailler(X10, 3, 10); // travaillé AVANT TABLES : l'ordre du fil ne suit pas celui du travail
		travailler(TABLES, 4, 10);
		expect(fil(T).slice(0, 3)).toEqual([TABLES, X10, OG]);
	});

	it("critère 3 : l'ordre suit le parcours CE2, pas l'ordre de déclaration des prérequis (DIV déclare RESTE avant TABLES)", () => {
		// Prémisse : la liste PREREQUIS de DIV est dans l'ordre inverse du parcours CE2.
		expect(aplatir(DIV).indexOf(RESTE)).toBeLessThan(aplatir(DIV).indexOf(TABLES));
		mettreEnTete(DIV);
		travailler(RESTE, 4, 10);
		travailler(TABLES, 4, 10);
		expect(fil(T).slice(0, 3)).toEqual([TABLES, RESTE, DIV]);
	});
});

describe('#724 critère 4 — pas de verrou : le prérequis inséré se contourne', () => {
	beforeEach(() => {
		mettreEnTete(DIV);
		travailler(TABLES, 4, 10);
	});

	it('critère 4 : « voir une autre leçon » depuis TABLES ne renvoie pas TABLES', () => {
		// Prémisse : TABLES est bien dans le fil (sinon leconSuivante repart de la tête et
		// l'assertion ne garde rien).
		expect(fil(T)).toContain(TABLES);
		const suivante = leconSuivante(TABLES, undefined, undefined, T);
		expect(suivante).not.toBeNull();
		expect(suivante?.id).not.toBe(TABLES);
	});

	it("critère 4 : DIV reste dans le fil et le contournement cyclique depuis TABLES l'atteint en moins de fil.length pas", () => {
		const f = fil(T);
		expect(f).toContain(TABLES);
		expect(f).toContain(DIV);
		let courant = TABLES;
		let pas = 0;
		while (courant !== DIV && pas < f.length) {
			const s = leconSuivante(courant, undefined, undefined, T);
			if (!s) break;
			courant = s.id;
			pas++;
		}
		expect(courant).toBe(DIV);
		expect(pas).toBeLessThan(f.length);
	});

	it("critère 4 : TABLES n'apparaît qu'une fois dans le fil", () => {
		expect(occurrences(fil(T), TABLES)).toBe(1);
	});
});

describe("#724 critère 5 — un prérequis mis de côté n'est pas proposé pendant son report", () => {
	let reprendreLe = 0;
	beforeEach(() => {
		mettreEnTete(DIV);
		travailler(TABLES, 4, 10);
		essai(TABLES, 30, T);
		essai(TABLES, 30, T + JOUR);
		const brut = lsGet(LESSON_REPORT_KEY, {}) as Record<string, { reprendreLe: number }>;
		reprendreLe = brut[`${TABLES}@ce2`]?.reprendreLe ?? 0;
	});

	it('prémisse : deux jours civils de blocage reportent TABLES au-delà de T + 1 jour (clé @ce2)', () => {
		expect(reprendreLe).toBeGreaterThan(T + JOUR);
	});

	it('critère 5 : pendant le report, la carte propose DIV et TABLES est absente du fil', () => {
		expect(leconDuJour(undefined, undefined, T + JOUR + 1)?.id).toBe(DIV);
		expect(fil(T + JOUR + 1)).not.toContain(TABLES);
	});

	it('critère 5 : le report échu, TABLES revient en tête du fil', () => {
		expect(leconDuJour(undefined, undefined, reprendreLe + 1)?.id).toBe(TABLES);
	});
});

describe('#724 critère 6 — un prérequis franchi en CE2 ne revient jamais, même après une mauvaise série', () => {
	it('critère 6 : essai CE2 à 80 %, puis un sprint à 20 % → TABLES jamais dans le fil, DIV en tête', () => {
		mettreEnTete(DIV);
		essai(TABLES, 80, T);
		travailler(TABLES, 2, 10);
		for (const t of [T, T + JOUR, T + 30 * JOUR]) {
			expect(fil(t)).not.toContain(TABLES);
			expect(fil(t)[0]).toBe(DIV);
		}
	});

	it('critère 6 : une étoile CE2 (historique non daté) vaut franchissement → TABLES travaillée à 40 % non insérée', () => {
		mettreEnTete(DIV);
		etoiler([TABLES], 'ce2');
		travailler(TABLES, 4, 10);
		expect(fil(T)).not.toContain(TABLES);
		expect(fil(T)[0]).toBe(DIV);
	});
});

describe('#724 critère 14 — seule la classe IMMÉDIATEMENT précédente est consultée', () => {
	it('critère 14 : maths en CM2, TABLES et RESTE à 40 % sous @ce2 → aucune CE2-only dans le fil', () => {
		// Limite connue : aucune leçon CM2 au catalogue, donc le fil est vide et ce test ne
		// garde, pour l'instant, qu'un repli qui irait chercher du CE2 faute de tête CM2.
		setNiveauMatiere('math', 'cm2');
		poserStats({ [`${TABLES}@ce2`]: STAT_40, [`${RESTE}@ce2`]: STAT_40 });
		const f = fil(T);
		expect(f.filter(estCe2Seule)).toEqual([]);
	});
});

describe("#724 critère 15 — un prérequis jamais travaillé n'est jamais inséré", () => {
	it('critère 15 : profil neuf en CM1, DIV en tête → aucune CE2-only dans le fil', () => {
		mettreEnTete(DIV);
		const f = fil(T);
		expect(f[0]).toBe(DIV);
		expect(f.filter(estCe2Seule)).toEqual([]);
	});

	it('critère 15 : une leçon CE2 ouverte sans aucune question répondue (questions: 0) ne compte pas comme travaillée', () => {
		mettreEnTete(DIV);
		poserStats({ [`${TABLES}@ce2`]: STAT_VIDE });
		const f = fil(T);
		expect(f[0]).toBe(DIV);
		expect(f.filter(estCe2Seule)).toEqual([]);
	});
});

describe("#724 critère 16 — une leçon commune CE2 + CM1 n'est jamais insérée comme prérequis", () => {
	it('critère 16 : num-comparer travaillée à 40 % sous @ce2, en tête CM1 → une seule occurrence, à sa place du parcours CM1', () => {
		const temoin = fil(T);
		expect(temoin[0]).toBe('num-comparer');
		poserStats({ 'num-comparer@ce2': STAT_40 });
		const f = fil(T);
		expect(occurrences(f, 'num-comparer')).toBe(1);
		expect(f.indexOf('num-comparer')).toBe(temoin.indexOf('num-comparer'));
		expect(f[1]).toBe(temoin[1]);
	});
});

describe('#724 critère 17 — sans classe précédente, le fil est inchangé', () => {
	it('critère 17 : profil tout CE2, des CE2 à 40 % → le fil ne dépend pas des cartes « du bas »', () => {
		setNiveauMatiere('math', 'ce2');
		setNiveauMatiere('francais', 'ce2');
		travailler(TABLES, 4, 10);
		travailler(RESTE, 4, 10);
		travailler(X10, 3, 10);
		// Aucune leçon CE2 n'a de PREREQUIS : l'insertion est inerte ici quoi qu'il arrive. Ce
		// test garde donc le CHARGEMENT des cartes du bas : si le CE2 se prenait pour sa propre
		// classe précédente, ses leçons à 40 % reviendraient en appoint et le fil changerait.
		const vide = { stars: {}, stats: {}, reports: {} };
		const sansBas = sequenceLeconDuJour(loadStars(), loadLessonReports(), T, vide).map((l) => l.id);
		expect(sansBas.length).toBeGreaterThan(0);
		expect(fil(T)).toEqual(sansBas);
	});
});
