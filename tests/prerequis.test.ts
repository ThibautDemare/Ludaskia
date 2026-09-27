/* ============================================================
   Prérequis inter-niveaux (#724).
   Une leçon propre au CM1 → les leçons propres au CE2 sans lesquelles l'enfant y échoue
   pour une raison étrangère à ce qu'elle enseigne. Attendus dérivés des critères de
   l'issue (numérotés dans les noms), jamais de l'implémentation.

   Fixtures : vrai catalogue, vraie table, ids réels (prémisses vérifiées en tête de
   fichier, pour qu'un changement de catalogue fasse échouer la PRÉMISSE et pas un
   critère). Cartes brutes fabriquées à la main, clés `lessonId@niveau` (fabriques
   reprises de `consolidation-bas-niveau.test.ts`).

   Les critères négatifs (« rien n'est ouvert ») portent un TÉMOIN dans le même test :
   les mêmes cartes, dans la situation où le prérequis DOIT s'ouvrir. Sans lui, un
   `return []` passerait le critère sans rien tenir.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import type { CartesBrutes } from '../src/core/consolidation-bas-niveau';
import { anomaliesPrerequis, prerequisOuverts, type PrerequisOuvert } from '../src/core/prerequis';
import { leconAvant, leconPrerequise } from '../src/core/etayage';
import { getLessonById, type LessonDef, type SchoolLevel } from '../src/core/catalog';
import { LEVEL_ORDER, niveauInferieurImmediat } from '../src/core/levels';
import { ordreLecons } from '../src/core/ordre';
import { PREREQUIS, type ExigencePrerequis } from '../src/data/ordre-pedagogique';
import type { LessonStat } from '../src/core/maitrise';
import type { EtatReport } from '../src/core/report-lecon';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Fabriques (reprises de consolidation-bas-niveau.test.ts) ---------- */
const T = 1_699_000_000_000;

/** Stat d'une leçon : `essais` = fenêtre récente, un couple [bonnes, questions] par essai.
    `bestPct` (meilleur % TOUS modes) est réglable à part : il ne doit pas franchir. */
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
/** Clé de stockage d'une leçon à un niveau (le CE2 par défaut : c'est là que vivent les prérequis). */
const k = (id: string, niveau: SchoolLevel = 'ce2') => `${id}@${niveau}`;

function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
}
/** Ids rangés dans l'ordre pédagogique CE2 de leur matière : lu dans la DONNÉE d'ordre. */
function dansOrdreCe2(ids: readonly string[]): string[] {
	const ordre = ordreLecons(lecon(ids[0]).subject, 'ce2');
	return [...ids].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
}
const resume = (r: PrerequisOuvert[]) =>
	r.map((p) => ({ id: p.lesson.id, niveau: p.niveau, travaillee: p.travaillee }));
const ouverts = (id: string, niveauActif: SchoolLevel, c: CartesBrutes) =>
	resume(prerequisOuverts(lecon(id), niveauActif, c));
const avant = (r: { lesson: LessonDef; niveau: SchoolLevel } | undefined) =>
	r && { id: r.lesson.id, niveau: r.niveau };
const regleActuelle = (id: string, niveau: SchoolLevel) => {
	const p = leconPrerequise(lecon(id), niveau);
	return p && { id: p.id, niveau };
};

/* ---------- Ids réels ---------- */
const DIV_EUCL = 'math-division-euclidienne'; // CM1 → DIV_RESTE + TABLES
const ORDRE_GRANDEUR = 'math-ordre-grandeur-produit'; // CM1 → TABLES + MULT_10
const DIV_RESTE = 'math-div-reste'; // CE2
const TABLES = 'math-tables-multiplication'; // CE2
const ACCORDS_CM1 = 'fr-accords-cm1'; // CM1 → ACCORDS_REG, ouvre sa catégorie au CM1
const ACCORDS_REG = 'fr-accords-reguliers'; // CE2
const FAMILLES_CM1 = 'fr-vocab-familles-cm1'; // CM1 → groupe [FAMILLES, FAMILLES_RELIER]
const AFFIXES_CM1 = 'fr-vocab-affixes-cm1'; // CM1 → FAMILLES seul
const FAMILLES = 'fr-vocab-familles'; // CE2
const FAMILLES_RELIER = 'fr-vocab-familles-relier'; // CE2
const COMPARER = 'num-comparer'; // CE2 + CM1
const HORS_TABLE = 'math-diviser-10-100'; // CM1 seul, absente de la table

/** Table validée par le pédagogue (critère 1), recopiée de l'issue. */
const TABLE_ATTENDUE: Record<string, readonly ExigencePrerequis[]> = {
	[DIV_EUCL]: [DIV_RESTE, TABLES],
	[ORDRE_GRANDEUR]: [TABLES, 'math-multiplier-10-100'],
	'geo-cm1-solides-comptage': ['geo-solides-proprietes'],
	'mes-aire-perimetre': ['mes-perimetre-quadrillage'],
	'mes-duree-ecoulee': ['mes-lecture-heure'],
	[ACCORDS_CM1]: [ACCORDS_REG],
	'fr-accords-groupe-nominal': [ACCORDS_REG],
	[AFFIXES_CM1]: [FAMILLES],
	[FAMILLES_CM1]: [[FAMILLES, FAMILLES_RELIER]],
};
const membres = (table: Record<string, readonly ExigencePrerequis[]>) =>
	Object.values(table).flatMap((exigences) =>
		exigences.flatMap((e) => (typeof e === 'string' ? [e] : e)),
	);
/** Forme canonique : l'ordre des exigences et des membres d'un groupe n'a pas de sens,
    la distinction « id seul » / « groupe » en a un (deux ids = deux exigences). */
const canonique = (table: Record<string, readonly ExigencePrerequis[]>) =>
	Object.fromEntries(
		Object.entries(table).map(([dep, exigences]) => [
			dep,
			exigences
				.map((e) => (typeof e === 'string' ? e : `groupe(${[...e].sort().join('|')})`))
				.sort(),
		]),
	);

/* ============================================================ */

describe('prémisses (vrai catalogue)', () => {
	it('les dépendantes attendues existent et sont propres au CM1', () => {
		for (const id of Object.keys(TABLE_ATTENDUE)) expect(lecon(id).levels, id).toEqual(['cm1']);
	});

	it("les prérequis attendus sont propres au CE2 et placés dans l'ordre pédagogique CE2", () => {
		for (const id of membres(TABLE_ATTENDUE)) {
			const l = lecon(id);
			expect(l.levels, id).toEqual(['ce2']);
			expect(ordreLecons(l.subject, 'ce2'), id).toContain(id);
		}
	});

	it('num-comparer existe au CE2 et au CM1', () => {
		expect([...lecon(COMPARER).levels].sort()).toEqual(['ce2', 'cm1']);
	});

	it('la leçon hors table est propre au CM1, absente de la table, et a une précédente', () => {
		expect(lecon(HORS_TABLE).levels).toEqual(['cm1']);
		expect(Object.keys(PREREQUIS)).not.toContain(HORS_TABLE);
		expect(leconPrerequise(lecon(HORS_TABLE), 'cm1')).toBeDefined();
	});

	it("pour la division euclidienne, l'ordre CE2 diffère de l'ordre de la table (sinon le tri serait invisible)", () => {
		expect(dansOrdreCe2([DIV_RESTE, TABLES])).not.toEqual([DIV_RESTE, TABLES]);
	});

	it('règle actuelle : la division euclidienne a une précédente au CM1, fr-accords-cm1 aucune', () => {
		expect(leconPrerequise(lecon(DIV_EUCL), 'cm1')).toBeDefined();
		expect(leconPrerequise(lecon(ACCORDS_CM1), 'cm1')).toBeUndefined();
	});
});

describe('critère 1 : contenu de la table', () => {
	it('critère 1 : la table porte exactement les neuf paires validées', () => {
		expect(canonique(PREREQUIS)).toEqual(canonique(TABLE_ATTENDUE));
	});

	it("critère 1 : fr-vocab-familles-cm1 porte UN groupe (l'un OU l'autre), pas deux exigences", () => {
		const exigences = PREREQUIS[FAMILLES_CM1];
		expect(exigences).toHaveLength(1);
		expect(Array.isArray(exigences[0])).toBe(true);
		expect([...exigences[0]].sort()).toEqual([FAMILLES, FAMILLES_RELIER].sort());
	});
});

describe('critère 16 : aucune leçon à deux niveaux dans la vraie table', () => {
	it('critère 16 : dépendantes et prérequis de la table existent chacun à un seul niveau', () => {
		for (const id of [...Object.keys(PREREQUIS), ...membres(PREREQUIS)])
			expect(lecon(id).levels, id).toHaveLength(1);
	});
});

describe('critère 2 : le gate de la table', () => {
	const refuse = (table: Record<string, readonly ExigencePrerequis[]>, coupable: string) => {
		const a = anomaliesPrerequis(table);
		expect(a.length, `table ${JSON.stringify(table)} acceptée`).toBeGreaterThan(0);
		expect(a.join('\n'), "l'anomalie doit nommer le coupable").toContain(coupable);
	};

	it('critère 2 : la vraie table ne présente aucune anomalie', () => {
		expect(anomaliesPrerequis()).toEqual([]);
		expect(anomaliesPrerequis(PREREQUIS)).toEqual([]);
	});

	it('critère 2 : témoin — une table factice saine (id seul et groupe) passe', () => {
		expect(
			anomaliesPrerequis({
				[DIV_EUCL]: [DIV_RESTE],
				[FAMILLES_CM1]: [[FAMILLES, FAMILLES_RELIER]],
			}),
		).toEqual([]);
	});

	it('critère 2 : refuse un prérequis vers num-comparer (leçon CE2 + CM1)', () => {
		refuse({ [DIV_EUCL]: [COMPARER] }, COMPARER);
		refuse({ [DIV_EUCL]: [[DIV_RESTE, COMPARER]] }, COMPARER);
	});

	it('critère 2 : refuse un id inconnu, en prérequis, dans un groupe ou en dépendante', () => {
		refuse({ [DIV_EUCL]: ['math-lecon-fantome'] }, 'math-lecon-fantome');
		refuse({ [FAMILLES_CM1]: [[FAMILLES, 'fr-lecon-fantome']] }, 'fr-lecon-fantome');
		refuse({ 'math-dependante-fantome': [DIV_RESTE] }, 'math-dependante-fantome');
	});

	it("critère 2 : refuse un prérequis d'une autre matière", () => {
		refuse({ [DIV_EUCL]: [ACCORDS_REG] }, ACCORDS_REG);
	});

	it('critère 2 : refuse un prérequis de même classe (CM1 → CM1), y compris dans un groupe', () => {
		refuse({ [DIV_EUCL]: [ORDRE_GRANDEUR] }, ORDRE_GRANDEUR);
		refuse({ [FAMILLES_CM1]: [[FAMILLES, AFFIXES_CM1]] }, AFFIXES_CM1);
	});

	it('critère 2 : refuse une dépendance vers le haut, une boucle et un cycle', () => {
		refuse({ [DIV_RESTE]: [DIV_EUCL] }, DIV_EUCL);
		refuse({ [DIV_EUCL]: [DIV_EUCL] }, DIV_EUCL);
		refuse({ [DIV_EUCL]: [DIV_RESTE], [DIV_RESTE]: [DIV_EUCL] }, DIV_EUCL);
	});

	it('critère 2 : une anomalie par violation (deux violations indépendantes, deux anomalies)', () => {
		const a = anomaliesPrerequis({
			[DIV_EUCL]: ['math-lecon-fantome'],
			[ACCORDS_CM1]: [TABLES],
		});
		expect(a.length).toBeGreaterThanOrEqual(2);
	});

	it('critère 16 : refuse une dépendante qui existe à deux niveaux', () => {
		refuse({ [COMPARER]: [DIV_RESTE] }, COMPARER);
	});
});

describe('critères 3 et 15 : prerequisOuverts', () => {
	it('critère 3 : travaillé à 40 %, sans essai complet réussi → ouvert, travaillé', () => {
		const c = cartes({
			stats: { [k(DIV_RESTE)]: stat([[4, 10]]) },
			reports: { [k(DIV_RESTE)]: report(40) },
			stars: { [k(TABLES)]: 1 },
		});
		expect(ouverts(DIV_EUCL, 'cm1', c)).toEqual([
			{ id: DIV_RESTE, niveau: 'ce2', travaillee: true },
		]);
	});

	it('critère 15 : jamais travaillé → ouvert quand même, non travaillé (entrée de stat vide comprise)', () => {
		const attendu = [{ id: DIV_RESTE, niveau: 'ce2', travaillee: false }];
		expect(ouverts(DIV_EUCL, 'cm1', cartes({ stars: { [k(TABLES)]: 1 } }))).toEqual(attendu);
		expect(
			ouverts(
				DIV_EUCL,
				'cm1',
				cartes({ stars: { [k(TABLES)]: 1 }, stats: { [k(DIV_RESTE)]: STAT_VIDE } }),
			),
		).toEqual(attendu);
	});

	it('critère 3 : une étoile > 0 franchit (prérequis absent), une étoile à 0 non', () => {
		expect(ouverts(DIV_EUCL, 'cm1', cartes({ stars: { [k(DIV_RESTE)]: 2 } }))).toEqual([
			{ id: TABLES, niveau: 'ce2', travaillee: false },
		]);
		expect(
			ouverts(DIV_EUCL, 'cm1', cartes({ stars: { [k(DIV_RESTE)]: 0, [k(TABLES)]: 1 } })),
		).toEqual([{ id: DIV_RESTE, niveau: 'ce2', travaillee: false }]);
	});

	it('critère 3 : un score de leçon complète ≥ 70 franchit (70 oui, 69 non)', () => {
		const avecReport = (pct: number) =>
			cartes({
				stats: { [k(DIV_RESTE)]: stat([[7, 10]]) },
				reports: { [k(DIV_RESTE)]: report(pct) },
				stars: { [k(TABLES)]: 1 },
			});
		expect(ouverts(DIV_EUCL, 'cm1', avecReport(70))).toEqual([]);
		expect(ouverts(DIV_EUCL, 'cm1', avecReport(69))).toEqual([
			{ id: DIV_RESTE, niveau: 'ce2', travaillee: true },
		]);
	});

	it('critère 3 : un bestPct à 100 (sprint) sans report ≥ 70 laisse le prérequis ouvert', () => {
		const c = cartes({
			stats: { [k(DIV_RESTE)]: stat([[4, 10]], 100) },
			reports: { [k(DIV_RESTE)]: report(50) },
			stars: { [k(TABLES)]: 1 },
		});
		expect(ouverts(DIV_EUCL, 'cm1', c)).toEqual([
			{ id: DIV_RESTE, niveau: 'ce2', travaillee: true },
		]);
	});

	it('critère 3 : seules les clés du niveau du prérequis (@ce2) comptent, pas celles du niveau actif', () => {
		const c = cartes({
			stars: { [k(DIV_RESTE, 'cm1')]: 3 },
			reports: { [k(TABLES, 'cm1')]: report(90) },
			stats: { [k(DIV_RESTE, 'cm1')]: stat([[9, 10]]), [k(TABLES, 'cm1')]: stat([[9, 10]]) },
		});
		expect(ouverts(DIV_EUCL, 'cm1', c)).toEqual(
			dansOrdreCe2([DIV_RESTE, TABLES]).map((id) => ({ id, niveau: 'ce2', travaillee: false })),
		);
	});

	it("critère 3 : plusieurs prérequis ouverts → ordre pédagogique CE2, pas celui de la table ni « travaillés d'abord »", () => {
		const ordre = dansOrdreCe2([DIV_RESTE, TABLES]);
		expect(ouverts(DIV_EUCL, 'cm1', cartes({})).map((p) => p.id)).toEqual(ordre);
		// Seul le DERNIER dans l'ordre est travaillé : il ne remonte pas pour autant.
		const c = cartes({ stats: { [k(ordre[1])]: stat([[4, 10]]) } });
		expect(ouverts(DIV_EUCL, 'cm1', c)).toEqual([
			{ id: ordre[0], niveau: 'ce2', travaillee: false },
			{ id: ordre[1], niveau: 'ce2', travaillee: true },
		]);
	});

	it('leçon absente de la table (CM1 hors table, ou prérequis CE2 lui-même) → []', () => {
		const c = cartes({});
		expect(ouverts(DIV_EUCL, 'cm1', c), 'témoin : leçon de la table').not.toEqual([]);
		expect(ouverts(HORS_TABLE, 'cm1', c)).toEqual([]);
		expect(ouverts(DIV_RESTE, 'cm1', c)).toEqual([]);
	});
});

describe('critère 6 : un franchissement ne se reperd pas', () => {
	it('critère 6 : franchi par un report à 80, il ne revient pas même avec une stat récente à 20 %', () => {
		const c = cartes({
			stats: {
				[k(DIV_RESTE)]: stat(
					[
						[8, 10],
						[2, 10],
					],
					80,
				),
			},
			reports: { [k(DIV_RESTE)]: report(80) },
		});
		expect(ouverts(DIV_EUCL, 'cm1', c)).toEqual([{ id: TABLES, niveau: 'ce2', travaillee: false }]);
	});
});

describe('critère 6 : groupes (même notion sous deux formats)', () => {
	const [PREMIER, SECOND] = dansOrdreCe2([FAMILLES, FAMILLES_RELIER]);

	it('critère 6 : un membre franchi (étoile ou score) satisfait tout le groupe', () => {
		expect(ouverts(FAMILLES_CM1, 'cm1', cartes({})), 'témoin : rien de franchi').toHaveLength(1);
		expect(ouverts(FAMILLES_CM1, 'cm1', cartes({ stars: { [k(SECOND)]: 1 } }))).toEqual([]);
		expect(ouverts(FAMILLES_CM1, 'cm1', cartes({ reports: { [k(PREMIER)]: report(75) } }))).toEqual(
			[],
		);
	});

	it("groupe non satisfait : UNE entrée, représentée par son premier membre dans l'ordre CE2 si aucun n'est travaillé", () => {
		expect(ouverts(FAMILLES_CM1, 'cm1', cartes({}))).toEqual([
			{ id: PREMIER, niveau: 'ce2', travaillee: false },
		]);
	});

	it("critère 6 : si seul le second membre (ordre CE2) est travaillé, c'est lui le représentant", () => {
		const c = cartes({
			stats: { [k(SECOND)]: stat([[4, 10]]) },
			reports: { [k(SECOND)]: report(40) },
		});
		expect(ouverts(FAMILLES_CM1, 'cm1', c)).toEqual([
			{ id: SECOND, niveau: 'ce2', travaillee: true },
		]);
	});

	it("les deux membres travaillés : le premier dans l'ordre CE2 représente le groupe", () => {
		const c = cartes({
			stats: { [k(PREMIER)]: stat([[3, 10]]), [k(SECOND)]: stat([[5, 10]]) },
		});
		expect(ouverts(FAMILLES_CM1, 'cm1', c)).toEqual([
			{ id: PREMIER, niveau: 'ce2', travaillee: true },
		]);
	});

	it("l'équivalence est propre au groupe : franchir fr-vocab-familles-relier ne satisfait pas fr-vocab-affixes-cm1", () => {
		const c = cartes({ stars: { [k(FAMILLES_RELIER)]: 1 } });
		expect(ouverts(AFFIXES_CM1, 'cm1', c)).toEqual([
			{ id: FAMILLES, niveau: 'ce2', travaillee: false },
		]);
		expect(ouverts(FAMILLES_CM1, 'cm1', c)).toEqual([]);
	});
});

describe('critères 14 et 17 : seul le niveau juste au-dessus du CE2 ouvre des prérequis', () => {
	const nonFranchi = cartes({ stats: { [k(DIV_RESTE)]: stat([[4, 10]]) } });

	it("critère 14 : matière suivie en CM2 → aucun prérequis CE2 (deux classes d'écart)", () => {
		expect(ouverts(DIV_EUCL, 'cm1', nonFranchi), 'témoin : suivie en CM1').not.toEqual([]);
		expect(ouverts(DIV_EUCL, 'cm2', nonFranchi)).toEqual([]);
	});

	it('critère 17 : matière suivie en CE2 → aucun prérequis', () => {
		expect(ouverts(DIV_EUCL, 'cm1', nonFranchi), 'témoin : suivie en CM1').not.toEqual([]);
		expect(ouverts(DIV_EUCL, 'ce2', nonFranchi)).toEqual([]);
	});

	it('sur tous les niveaux : des prérequis ouverts si et seulement si le niveau inférieur immédiat est le CE2', () => {
		for (const n of LEVEL_ORDER) {
			const attenduOuvert = niveauInferieurImmediat(n) === 'ce2';
			expect(ouverts(DIV_EUCL, n, nonFranchi).length > 0, `niveau actif ${n}`).toBe(attenduOuvert);
		}
	});
});

describe("critère 12 : leconAvant (panneau d'étayage)", () => {
	it('critère 12 : un prérequis jamais travaillé est nommé, au niveau CE2', () => {
		expect(avant(leconAvant(lecon(DIV_EUCL), 'cm1', 'cm1', cartes({})))).toEqual({
			id: dansOrdreCe2([DIV_RESTE, TABLES])[0],
			niveau: 'ce2',
		});
	});

	it('critère 12 : un prérequis travaillé non franchi est nommé, au niveau CE2', () => {
		const c = cartes({
			stats: { [k(DIV_RESTE)]: stat([[4, 10]]) },
			stars: { [k(TABLES)]: 1 },
		});
		expect(avant(leconAvant(lecon(DIV_EUCL), 'cm1', 'cm1', c))).toEqual({
			id: DIV_RESTE,
			niveau: 'ce2',
		});
	});

	it('critère 12 : prérequis tous franchis → règle actuelle (leconPrerequise), undefined compris', () => {
		const franchis = cartes({ stars: { [k(DIV_RESTE)]: 1, [k(TABLES)]: 1, [k(ACCORDS_REG)]: 1 } });
		expect(avant(leconAvant(lecon(DIV_EUCL), 'cm1', 'cm1', cartes({}))), 'témoin').toEqual({
			id: dansOrdreCe2([DIV_RESTE, TABLES])[0],
			niveau: 'ce2',
		});
		expect(avant(leconAvant(lecon(DIV_EUCL), 'cm1', 'cm1', franchis))).toEqual(
			regleActuelle(DIV_EUCL, 'cm1'),
		);
		// fr-accords-cm1 ouvre sa catégorie au CM1 : règle actuelle = rien à nommer.
		expect(avant(leconAvant(lecon(ACCORDS_CM1), 'cm1', 'cm1', cartes({}))), 'témoin').toEqual({
			id: ACCORDS_REG,
			niveau: 'ce2',
		});
		expect(leconAvant(lecon(ACCORDS_CM1), 'cm1', 'cm1', franchis)).toBeUndefined();
	});

	it('critère 12 : leçon hors table → règle actuelle', () => {
		expect(avant(leconAvant(lecon(HORS_TABLE), 'cm1', 'cm1', cartes({})))).toEqual(
			regleActuelle(HORS_TABLE, 'cm1'),
		);
	});

	it('critère 14 côté étayage : matière suivie en CM2 → règle actuelle, même prérequis non franchi', () => {
		expect(avant(leconAvant(lecon(DIV_EUCL), 'cm1', 'cm1', cartes({}))), 'témoin').toEqual({
			id: dansOrdreCe2([DIV_RESTE, TABLES])[0],
			niveau: 'ce2',
		});
		expect(avant(leconAvant(lecon(DIV_EUCL), 'cm1', 'cm2', cartes({})))).toEqual(
			regleActuelle(DIV_EUCL, 'cm1'),
		);
	});
});
