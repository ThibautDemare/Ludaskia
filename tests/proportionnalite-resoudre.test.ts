/* ============================================================
   Proportionnalité CM1 — leçon B « Problèmes de proportionnalité » (#258, résoudre).
   Écrits AVANT l'implémentation, à partir des critères 5 à 9 et 11 à 15 de l'issue et du
   contrat d'API fixé au cadrage (module `src/data/maths/proportionnalite.ts`) : aucun
   attendu n'est recopié d'un code existant. Chaque `it` nomme le critère qu'il tient.

   Le premier bloc est un garde-fou des DÉTECTEURS du test lui-même : il prouve que les
   stratégies fausses du critère 6, la reconnaissance des procédures (5, 7) et les
   formulations interdites (13) attrapent ce qu'elles prétendent attraper, et laissent
   passer un cas sain. Sans lui, un détecteur muet rendrait le gate vert pour de
   mauvaises raisons.

   La banque est une donnée statique : les invariants sont vérifiés sur TOUS ses items
   (plus fort qu'un échantillon). Le tirage, lui, passe par `withSeed` (reproductible).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { withSeed } from '../src/core/utils';
import { genLessonItem, getLessonById } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import type { Exercise } from '../src/core/exercise';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';
import { BANQUE_RESOUDRE, exerciceResoudre } from '../src/data/maths/proportionnalite';
import type { ItemResoudre } from '../src/data/maths/proportionnalite';

const ID = 'math-prob-proportion-resoudre';
const ID_IDENTIFIER = 'math-prob-proportion-identifier';
const SEED = 258258;
const N_TIRAGES = 400;

/* Bornes du critère 7 (« entiers et simples, ce qu'un CM1 calcule de tête ou au
   brouillon »), fixées ici faute de chiffre dans l'issue :
   - rapport k ≤ 10 : multiplier ou diviser par un nombre des tables, rien au-delà ;
   - tout nombre (données et réponse) ≤ 1000 : un nombre à trois chiffres multiplié par
     un chiffre tient en une ligne de brouillon. */
const K_MAX = 10;
const NOMBRE_MAX = 1000;
// Plancher arbitraire : une procédure « visée » (critère 5) doit être travaillée, pas
// représentée par deux items alibis.
const PART_MIN_PROCEDURE = 0.2;

type ProbEx = Extract<Exercise, { type: 'probleme' }>;
type Couple = { quantite: number; valeur: number };
type Donnees = { connus: Couple[]; demande: number; reponse: number };

/* ---------------------------------------------------------------
   Outils purs (indépendants du module à venir)
   --------------------------------------------------------------- */

/** Rapport ENTIER k entre la quantité connue et la quantité demandée, dans un sens ou
    dans l'autre (×k ou ÷k) ; `undefined` s'il n'est pas entier. */
function rapportEntier(quantite: number, demande: number): number | undefined {
	if (demande % quantite === 0) return demande / quantite;
	if (quantite % demande === 0) return quantite / demande;
	return undefined;
}

/** Réponse recalculée par la SEULE procédure annoncée, depuis les données, sans facteur
    supplémentaire ; `undefined` si cette procédure ne suffit pas (procédure mixte,
    rapport non entier, nombre de couples incohérent avec la procédure). */
function reponseParLaProcedure(it: Donnees & { procedure: string }): number | undefined {
	if (it.procedure === 'multiplicative') {
		if (it.connus.length !== 1) return undefined;
		const [c] = it.connus;
		if (it.demande % c.quantite === 0) return c.valeur * (it.demande / c.quantite);
		if (c.quantite % it.demande === 0) {
			const k = c.quantite / it.demande;
			return c.valeur % k === 0 ? c.valeur / k : undefined;
		}
		return undefined;
	}
	if (it.procedure === 'additive') {
		if (it.connus.length !== 2) return undefined;
		const [a, b] = it.connus;
		if (it.demande === a.quantite + b.quantite) return a.valeur + b.valeur;
		if (it.demande === Math.abs(a.quantite - b.quantite))
			return a.quantite > b.quantite ? a.valeur - b.valeur : b.valeur - a.valeur;
		return undefined;
	}
	return undefined;
}

/* Stratégies FAUSSES du critère 6 : des procédures qu'un enfant applique sans avoir
   compris la proportionnalité. Si l'une tombe juste sur un item, cet item valide une
   non-compréhension sans pouvoir la distinguer (échec explicite de l'issue).
   - écart constant : reporter sur les valeurs l'écart entre les quantités (« 4 → 6, donc
     8 → 10 »). C'est l'erreur additive classique de la proportionnalité. Elle tombe juste
     si et seulement si valeur = quantité, car v + (d − q) = v·d/q ⇔ (d − q)(v − q) = 0.
   - addition répétée (v + v) : l'« addition répétée fausse » que nomme l'issue ; sur un
     rapport ×2 elle donne exactement le même nombre que la multiplication juste.
   - moitié (v ÷ 2) : le même réflexe lu dans l'autre sens ; tombe juste sur un ÷2. */
const STRATEGIES_FAUSSES: { nom: string; applique: (c: Couple, demande: number) => number }[] = [
	{ nom: 'écart constant', applique: (c, d) => c.valeur + (d - c.quantite) },
	{ nom: 'addition répétée v + v', applique: (c) => c.valeur + c.valeur },
	{ nom: 'moitié v ÷ 2', applique: (c) => c.valeur / 2 },
];

function strategiesFaussesQuiTombentJuste(it: Donnees): string[] {
	const out: string[] = [];
	for (const c of it.connus)
		for (const s of STRATEGIES_FAUSSES)
			if (s.applique(c, it.demande) === it.reponse)
				out.push(`${s.nom} depuis (${c.quantite} → ${c.valeur})`);
	return out;
}

// Nombres écrits en lettres acceptés pour les petites quantités (« trois cahiers »).
const MOTS_NOMBRES: Record<number, string> = {
	2: 'deux',
	3: 'trois',
	4: 'quatre',
	5: 'cinq',
	6: 'six',
	7: 'sept',
	8: 'huit',
	9: 'neuf',
	10: 'dix',
	11: 'onze',
	12: 'douze',
	13: 'treize',
	14: 'quatorze',
	15: 'quinze',
	16: 'seize',
	17: 'dix-sept',
	18: 'dix-huit',
	19: 'dix-neuf',
	20: 'vingt',
};

/** Nombres écrits en chiffres dans un texte (séparateur de milliers toléré). */
function nombresEnChiffres(texte: string): number[] {
	const sansSeparateur = texte.replace(/(\d)[\s\u00a0\u202f](?=\d{3}(?!\d))/g, '$1');
	return (sansSeparateur.match(/\d+/g) ?? []).map(Number);
}

function mentionne(texte: string, n: number): boolean {
	if (nombresEnChiffres(texte).includes(n)) return true;
	const mot = MOTS_NOMBRES[n];
	return mot !== undefined && new RegExp(`(?<![\\p{L}-])${mot}(?![\\p{L}-])`, 'iu').test(texte);
}

/** Toutes les chaînes d'une structure (titre, règle, étapes, exemple déroulé…). */
function textes(v: unknown): string[] {
	if (typeof v === 'string') return [v];
	if (Array.isArray(v)) return v.flatMap(textes);
	if (v !== null && typeof v === 'object') return Object.values(v).flatMap(textes);
	return [];
}

// Bornes de mot sur lettres ET chiffres (« pour 1 » ne doit pas matcher « pour 12 »).
const motif = (s: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${s}(?![\\p{L}\\p{N}])`, 'iu');

/* Critère 13 : procédures postérieures au CM1 ou non visées, à ne jamais nommer comme
   méthode. Passage par l'unité (sous ses formulations d'élève), coefficient, produit en
   croix, règle de trois. Et le tableau (critère 12 : « ni à remplir ni à lire »). */
const FORMULATIONS_INTERDITES: { nom: string; re: RegExp }[] = [
	{ nom: 'passage par l’unité : « un seul »', re: motif('une?\\s+seule?') },
	{ nom: 'passage par l’unité : « pour 1 »', re: motif('pour\\s+1') },
	{ nom: 'passage par l’unité : « prix d’un »', re: motif("prix\\s+d['’]une?") },
	{
		nom: 'passage par l’unité : « combien coûte un »',
		re: motif('combien\\s+(?:coûte|vaut|pèse|mesure|contient)\\s+une?'),
	},
	// « par l'unité », « à l'unité », « par unité » ; pas « n'oublie pas l'unité » (mesure).
	{ nom: 'passage par l’unité nommé', re: motif("(?:par|à)\\s+(?:l['’])?unité") },
	{ nom: 'prix unitaire', re: motif('unitaire') },
	{ nom: 'coefficient', re: motif('coefficients?') },
	{ nom: 'produit en croix', re: motif('produits?\\s+en\\s+croix') },
	{ nom: 'règle de trois', re: motif('règle\\s+de\\s+trois') },
	{ nom: 'tableau (critère 12)', re: motif('tableaux?') },
];

function formulationsInterdites(texte: string): string[] {
	return FORMULATIONS_INTERDITES.filter((f) => f.re.test(texte)).map(
		(f) => `${f.nom} dans « ${texte} »`,
	);
}

/** Calculs qui expriment la procédure de LINÉARITÉ de l'item (critère 13 : jamais un
    calcul par la valeur unitaire, ni dans la révélation ni dans le déroulé d'étayage). */
function calculsDeLinearite(it: Donnees & { procedure: string }): string[] {
	const ok: string[] = [];
	if (it.procedure === 'multiplicative') {
		const [c] = it.connus;
		if (it.demande % c.quantite === 0) {
			const k = it.demande / c.quantite;
			ok.push(`${c.valeur} x ${k}`, `${k} x ${c.valeur}`);
		} else {
			ok.push(`${c.valeur} : ${c.quantite / it.demande}`);
		}
	} else {
		const [a, b] = it.connus;
		ok.push(`${a.valeur} + ${b.valeur}`, `${b.valeur} + ${a.valeur}`);
		const [grand, petit] = a.quantite > b.quantite ? [a, b] : [b, a];
		ok.push(`${grand.valeur} - ${petit.valeur}`);
	}
	return ok;
}

function enProbleme(ex: Exercise): ProbEx {
	if (ex.type !== 'probleme') throw new Error(`type d'exercice inattendu « ${ex.type} »`);
	return ex;
}

const texteComplet = (it: ItemResoudre): string => `${it.enonce} ${it.question}`;
const donneesAffichees = (it: ItemResoudre): number[] => [
	...it.connus.flatMap((c) => [c.quantite, c.valeur]),
	it.demande,
];

/* ---------------------------------------------------------------
   0. Garde-fou des détecteurs (tourne sans le module)
   --------------------------------------------------------------- */
describe('#258 — les détecteurs du test attrapent ce qu’ils doivent attraper', () => {
	it('critère 6 : un rapport ×2 est trahi par l’addition répétée', () => {
		const x2 = { connus: [{ quantite: 3, valeur: 7 }], demande: 6, reponse: 14 };
		expect(strategiesFaussesQuiTombentJuste(x2)).toContain('addition répétée v + v depuis (3 → 7)');
	});
	it('critère 6 : un rapport ÷2 est trahi par la moitié', () => {
		const sur2 = { connus: [{ quantite: 6, valeur: 14 }], demande: 3, reponse: 7 };
		expect(strategiesFaussesQuiTombentJuste(sur2)).toContain('moitié v ÷ 2 depuis (6 → 14)');
	});
	it('critère 6 : un taux de 1 (valeur = quantité) est trahi par l’écart constant', () => {
		const taux1 = { connus: [{ quantite: 4, valeur: 4 }], demande: 12, reponse: 12 };
		expect(strategiesFaussesQuiTombentJuste(taux1)).toContain('écart constant depuis (4 → 4)');
	});
	it('critère 6 : un additif dont la demande vaut le double d’une quantité est trahi', () => {
		// 4 = 6 − 2, mais aussi 2 × 2 : la réponse 10 = 5 + 5.
		const piege = {
			connus: [
				{ quantite: 2, valeur: 5 },
				{ quantite: 6, valeur: 15 },
			],
			demande: 4,
			reponse: 10,
		};
		expect(strategiesFaussesQuiTombentJuste(piege)).toContain(
			'addition répétée v + v depuis (2 → 5)',
		);
	});
	it('contrôle négatif : un item sain (×3, taux 3/2) ne déclenche aucune stratégie fausse', () => {
		const sain = { connus: [{ quantite: 4, valeur: 6 }], demande: 12, reponse: 18 };
		expect(strategiesFaussesQuiTombentJuste(sain)).toEqual([]);
	});
	it('critère 5 : une procédure mixte (2 × q1 + q2) n’est pas reconnue comme additive', () => {
		const mixte = {
			procedure: 'additive',
			connus: [
				{ quantite: 2, valeur: 3 },
				{ quantite: 4, valeur: 6 },
			],
			demande: 8,
			reponse: 12,
		};
		expect(reponseParLaProcedure(mixte)).toBeUndefined();
		expect(reponseParLaProcedure({ ...mixte, demande: 6, reponse: 9 })).toBe(9);
		expect(reponseParLaProcedure({ ...mixte, demande: 2, reponse: 3 })).toBe(3);
	});
	it('critère 7 : un rapport non entier n’est pas reconnu comme multiplicatif', () => {
		const nonEntier = {
			procedure: 'multiplicative',
			connus: [{ quantite: 4, valeur: 6 }],
			demande: 6,
			reponse: 9,
		};
		expect(reponseParLaProcedure(nonEntier)).toBeUndefined();
		expect(rapportEntier(4, 6)).toBeUndefined();
		expect(rapportEntier(12, 4)).toBe(3);
	});
	it('critère 13 : les formulations interdites sont repérées, pas les voisines légitimes', () => {
		expect(formulationsInterdites('Cherche d’abord le prix d’un seul cahier.')).not.toEqual([]);
		expect(formulationsInterdites('Combien coûte un cahier ?')).not.toEqual([]);
		expect(formulationsInterdites('Calcule pour 1 objet.')).not.toEqual([]);
		expect(formulationsInterdites('On repasse par l’unité.')).not.toEqual([]);
		expect(formulationsInterdites('Trouve le coefficient.')).not.toEqual([]);
		expect(formulationsInterdites('Fais un produit en croix.')).not.toEqual([]);
		expect(formulationsInterdites('Pour 12 objets, il en faut 3 fois plus.')).toEqual([]);
		expect(formulationsInterdites('Combien coûtent 9 cahiers ?')).toEqual([]);
		expect(formulationsInterdites('N’oublie pas l’unité : les euros.')).toEqual([]);
	});
	it('les données sont lues en chiffres ou en lettres, jamais « dix » dans « dix-sept »', () => {
		expect(mentionne('Trois cahiers coûtent 1 000 g.', 3)).toBe(true);
		expect(mentionne('Trois cahiers coûtent 1 000 g.', 1000)).toBe(true);
		expect(mentionne('dix-sept billes', 10)).toBe(false);
		expect(mentionne('12 billes', 1)).toBe(false);
	});
});

/* ---------------------------------------------------------------
   Blocs dépendant du module à venir
   --------------------------------------------------------------- */
describe('#258 — leçon B « Problèmes de proportionnalité »', () => {
	const banque: ItemResoudre[] = BANQUE_RESOUDRE.at('cm1');

	const lecon = (): LessonDef => {
		const l = getLessonById(ID);
		if (!l) throw new Error(`leçon ${ID} introuvable au catalogue`);
		return l;
	};

	describe('banque', () => {
		it('critère 9 : 50 à 100 items, tous distincts pour l’enfant (énoncé + question)', () => {
			expect(banque.length).toBeGreaterThanOrEqual(50);
			expect(banque.length).toBeLessThanOrEqual(100);
			const vus = new Map<string, number>();
			for (const it of banque) vus.set(texteComplet(it), (vus.get(texteComplet(it)) ?? 0) + 1);
			const doublons = [...vus].filter(([, n]) => n > 1).map(([t]) => t);
			expect(doublons).toEqual([]);
		});

		it('niveau : banque CM1 seulement, rien au CE2', () => {
			expect(BANQUE_RESOUDRE.levels).toEqual(['cm1']);
			expect(BANQUE_RESOUDRE.at('ce2')).toEqual([]);
			for (const it of banque) expect(it.levels).toEqual(['cm1']);
		});
	});

	describe('cohérence des données', () => {
		it('le rapport valeur/quantité est le même pour chaque couple connu et pour la réponse', () => {
			const incoherents: string[] = [];
			for (const it of banque) {
				// Produits en croix entiers : pas de flottant, égalité exacte de rapports.
				for (const c of it.connus)
					if (it.reponse * c.quantite !== c.valeur * it.demande)
						incoherents.push(
							`${texteComplet(it)} [(${c.quantite} → ${c.valeur}) vs (${it.demande} → ${it.reponse})]`,
						);
			}
			expect(incoherents).toEqual([]);
		});

		it('la réponse stockée est celle que donne la procédure annoncée, recalculée ici', () => {
			const ecarts = banque
				.filter((it) => reponseParLaProcedure(it) !== it.reponse)
				.map(
					(it) =>
						`${texteComplet(it)} (stockée ${it.reponse}, recalculée ${String(reponseParLaProcedure(it))})`,
				);
			expect(ecarts).toEqual([]);
		});

		it('le texte porte toutes les données, jamais la réponse', () => {
			const fautifs: string[] = [];
			for (const it of banque) {
				const t = texteComplet(it);
				for (const n of donneesAffichees(it))
					if (!mentionne(t, n)) fautifs.push(`${n} absent de « ${t} »`);
				if (!donneesAffichees(it).includes(it.reponse) && nombresEnChiffres(t).includes(it.reponse))
					fautifs.push(`réponse ${it.reponse} écrite dans « ${t} »`);
			}
			expect(fautifs).toEqual([]);
		});

		it('la quantité demandée n’est pas déjà une quantité connue (sinon rien à chercher)', () => {
			const triviaux = banque
				.filter((it) => it.connus.some((c) => c.quantite === it.demande))
				.map(texteComplet);
			expect(triviaux).toEqual([]);
		});

		it('l’énoncé décrit la situation sans la question ; la question est une question', () => {
			for (const it of banque) {
				expect(it.enonce.trim().length, texteComplet(it)).toBeGreaterThan(0);
				expect(it.enonce, it.enonce).not.toContain('?');
				expect(it.question.trim().endsWith('?'), it.question).toBe(true);
			}
		});
	});

	describe('critère 5 — deux procédures, jamais combinées', () => {
		it('les deux procédures sont travaillées (chacune au moins 20 % de la banque)', () => {
			const mult = banque.filter((it) => it.procedure === 'multiplicative').length;
			const add = banque.filter((it) => it.procedure === 'additive').length;
			expect(mult + add).toBe(banque.length);
			expect(mult).toBeGreaterThanOrEqual(Math.ceil(PART_MIN_PROCEDURE * banque.length));
			expect(add).toBeGreaterThanOrEqual(Math.ceil(PART_MIN_PROCEDURE * banque.length));
		});

		it('multiplicative : un seul couple connu, rapport entier avec la quantité demandée', () => {
			const fautifs = banque
				.filter((it) => it.procedure === 'multiplicative')
				.filter(
					(it) =>
						it.connus.length !== 1 ||
						rapportEntier(it.connus[0].quantite, it.demande) === undefined,
				)
				.map(texteComplet);
			expect(fautifs).toEqual([]);
		});

		it('additive : deux couples distincts, demande = somme ou différence EXACTE des quantités', () => {
			const fautifs = banque
				.filter((it) => it.procedure === 'additive')
				.filter((it) => {
					if (it.connus.length !== 2) return true;
					const [a, b] = it.connus;
					if (a.quantite === b.quantite) return true;
					// Pas de procédure mixte : aucun facteur en plus (2 × a + b relève du CM2).
					return (
						it.demande !== a.quantite + b.quantite &&
						it.demande !== Math.abs(a.quantite - b.quantite)
					);
				})
				.map(texteComplet);
			expect(fautifs).toEqual([]);
		});
	});

	describe('critère 6 — aucune stratégie fausse ne tombe juste', () => {
		it('aucun item multiplicatif ne repose sur un rapport ×2 (ni ÷2)', () => {
			const x2 = banque
				.filter((it) => it.procedure === 'multiplicative')
				.filter((it) => rapportEntier(it.connus[0].quantite, it.demande) === 2)
				.map(texteComplet);
			expect(x2).toEqual([]);
		});

		it('sur toute la banque, écart constant, addition répétée et moitié ne donnent jamais la réponse', () => {
			const trahis = banque
				.map((it) => ({ t: texteComplet(it), s: strategiesFaussesQuiTombentJuste(it) }))
				.filter((x) => x.s.length > 0)
				.map((x) => `${x.t} → ${x.s.join(', ')}`);
			expect(trahis).toEqual([]);
		});
	});

	describe('critère 7 — nombres entiers, rapports simples', () => {
		it('rapport multiplicatif entier, au plus 10', () => {
			const hors = banque
				.filter((it) => it.procedure === 'multiplicative')
				.filter((it) => {
					const k = rapportEntier(it.connus[0].quantite, it.demande);
					return k === undefined || k > K_MAX;
				})
				.map(texteComplet);
			expect(hors).toEqual([]);
		});

		it('données et réponse : entiers strictement positifs, au plus 1000', () => {
			const hors: string[] = [];
			for (const it of banque)
				for (const n of [...donneesAffichees(it), it.reponse])
					if (!Number.isInteger(n) || n < 1 || n > NOMBRE_MAX)
						hors.push(`${n} dans « ${texteComplet(it)} »`);
			expect(hors).toEqual([]);
		});
	});

	describe('critère 13 — pas de passage par l’unité, ni requis ni enseigné', () => {
		it('aucune quantité ne vaut 1 : la valeur unitaire n’est ni donnée ni demandée', () => {
			const unitaires = banque
				.filter((it) => it.demande === 1 || it.connus.some((c) => c.quantite === 1))
				.map(texteComplet);
			expect(unitaires).toEqual([]);
		});

		it('l’étayage existe et ne nomme ni l’unité, ni coefficient, produit en croix, règle de trois, tableau', () => {
			const etayage = lecon().etayage ?? [];
			expect(etayage.length).toBeGreaterThan(0);
			expect(textes(etayage).flatMap(formulationsInterdites)).toEqual([]);
		});
	});

	describe('critères 12 et 14 — un problème du runner existant, sans tableau ni figure', () => {
		it('exerciceResoudre : type « probleme », une étape numérique = la réponse de l’item', () => {
			for (const it of banque) {
				const ex = enProbleme(exerciceResoudre(it));
				expect(ex.enonce).toBe(it.enonce);
				expect(ex.etapes).toHaveLength(1);
				expect(ex.etapes[0].question).toBe(it.question);
				expect(ex.etapes[0].answer).toBe(it.reponse);
				expect(ex.figure, texteComplet(it)).toBeUndefined();
				expect(ex.parle.trim().length).toBeGreaterThan(0);
				if (!donneesAffichees(it).includes(it.reponse))
					expect(nombresEnChiffres(ex.parle), `réponse lue : ${ex.parle}`).not.toContain(
						it.reponse,
					);
			}
		});

		it('aucun tableau : ni le mot, ni grille, ni texte sur plusieurs lignes', () => {
			const fautifs = banque
				.map(texteComplet)
				.filter((t) => /tableau/i.test(t) || /[|\n\t]/.test(t));
			expect(fautifs).toEqual([]);
		});

		it('critère 13 : si l’exercice porte un calcul ou une explication, c’est la linéarité', () => {
			const fautifs: string[] = [];
			for (const it of banque) {
				const ex = enProbleme(exerciceResoudre(it));
				const calcul = ex.etapes[0].calcul;
				if (calcul) {
					const ecrit = `${calcul.a} ${calcul.op} ${calcul.b}`;
					if (!calculsDeLinearite(it).includes(ecrit))
						fautifs.push(`calcul « ${ecrit} » hors linéarité pour « ${texteComplet(it)} »`);
				}
				if (ex.explication) fautifs.push(...formulationsInterdites(ex.explication));
			}
			expect(fautifs).toEqual([]);
		});
	});

	describe('branchement catalogue', () => {
		it('leçon CM1 de la catégorie Problèmes, sur le runner « probleme », avec mots-clés', () => {
			const l = lecon();
			expect(l.subject).toBe('math');
			expect(l.category).toBe('math-problemes');
			expect(l.levels).toEqual(['cm1']);
			expect(l.exerciseType.exerciseKind).toBe('probleme');
			expect(l.motsCles?.length ?? 0).toBeGreaterThan(0);
		});

		it('ordre pédagogique CM1 : après « identifier », absente du CE2', () => {
			const cm1 = ORDRE_LECONS.math.cm1 ?? [];
			const iIdentifier = cm1.indexOf(ID_IDENTIFIER);
			expect(iIdentifier).toBeGreaterThanOrEqual(0);
			expect(cm1.indexOf(ID)).toBeGreaterThan(iIdentifier);
			expect(ORDRE_LECONS.math.ce2 ?? []).not.toContain(ID);
		});

		it('generate CM1 : chaque tirage est un item de la banque, réponse comprise, les deux procédures sortent', () => {
			const l = lecon();
			const tirages = withSeed(SEED, () =>
				Array.from({ length: N_TIRAGES }, () =>
					enProbleme(l.exerciseType.generate({ level: 'cm1' })),
				),
			);
			const sources = new Set<ItemResoudre>();
			for (const ex of tirages) {
				expect(ex.etapes).toHaveLength(1);
				const source = banque.find(
					(b) => b.enonce === ex.enonce && b.question === ex.etapes[0].question,
				);
				expect(source, `hors banque : ${ex.enonce}`).toBeDefined();
				if (!source) continue;
				expect(ex.etapes[0].answer).toBe(source.reponse);
				sources.add(source);
			}
			const procedures = new Set([...sources].map((s) => s.procedure));
			expect(procedures).toEqual(new Set(['multiplicative', 'additive']));
			// 400 tirages sur ≥ 50 items : un tirage qui tourne sur une poignée d'items est un bug.
			expect(sources.size).toBeGreaterThanOrEqual(25);
		});

		it('repli texte (bilan, fiche) : la réponse de l’item est acceptée, une voisine refusée', () => {
			const l = lecon();
			withSeed(SEED, () => {
				for (let i = 0; i < 100; i++) {
					const item = genLessonItem(l, 'cm1');
					// Le plus SPÉCIFIQUE des items contenus : « 3 cahiers… » est aussi une
					// sous-chaîne de « 13 cahiers… ».
					const source = banque
						.filter((b) => item.text.includes(b.enonce) && item.text.includes(b.question))
						.sort((x, y) => texteComplet(y).length - texteComplet(x).length)[0];
					expect(source, `hors banque : ${item.text}`).toBeDefined();
					if (!source) continue;
					expect(checkItemAnswer(item, String(source.reponse))).toBe(true);
					expect(checkItemAnswer(item, String(source.reponse + 1))).toBe(false);
				}
			});
		});
	});
});
