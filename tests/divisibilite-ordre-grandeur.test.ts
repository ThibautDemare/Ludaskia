/* ============================================================
   Calcul mental CM1 (#250) — logique pure des deux leçons de banque :
   - critères de divisibilité par 2/5/10 (QCM oui/non) ;
   - ordre de grandeur d'un produit (QCM 3 classes espacées ×10).

   Auteur des tests DISTINCT de l'auteur du code : les attendus sont DÉRIVÉS
   indépendamment (définition de la divisibilité, critères du chiffre des unités,
   « plus grande puissance de 10 ≤ x », arrondi au chiffre significatif) — jamais
   recopiés de l'implémentation. On éprouve : les invariants de banque (réponse
   STOCKÉE cohérente et jamais recalculée au check, équilibre, cas frontière), la
   justesse du corrigé de divisibilité (les trois critères, sans contre-sens), la
   règle d'admissibilité de l'ordre de grandeur (le piège 32×32), le multi-niveau
   (CM1-only), le déterminisme de construction et le branchement catalogue.

   Les invariants STRUCTURELS communs (QCM ≥ 2 choix contenant la réponse, sans
   doublon, round-trip de correction, générateur non figé) sont déjà éprouvés
   génériquement par `catalogue-invariants.test.ts` — on ne les redouble pas ici.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	estDivisible,
	explicationDivisibilite,
	construireBanqueDivisibilite,
	BANQUE_DIVISIBILITE,
	exerciceDivisibilite,
	DIVISIBILITE_LESSONS,
} from '../src/data/maths/divisibilite';
import type { Diviseur, ItemDivisibilite } from '../src/data/maths/divisibilite';
import {
	arrondiChiffreSignificatif,
	ordreDeGrandeur,
	ordreGrandeurProduit,
	construireBanqueOrdreGrandeur,
	BANQUE_ORDRE_GRANDEUR,
	exerciceOrdreGrandeur,
	ORDRE_GRANDEUR_LESSONS,
} from '../src/data/maths/ordre-grandeur';
import type { ItemOrdreGrandeur } from '../src/data/maths/ordre-grandeur';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { formatNombre } from '../src/core/nombres';
import type { Exercise } from '../src/core/exercise';

/* Narrowing : on ne teste que des QCM ici. */
function qcm(ex: Exercise): Extract<Exercise, { type: 'qcm' }> {
	if (ex.type !== 'qcm') throw new Error(`attendu un QCM, reçu « ${ex.type} »`);
	return ex;
}

const DIVISEURS: Diviseur[] = [2, 5, 10];

/* =====================================================================
   LEÇON 1 — Critères de divisibilité par 2, 5 et 10 (#250)
   ===================================================================== */

describe('Divisibilité — estDivisible (définition : reste nul)', () => {
	it('cas nets dérivés à la main (0, unités paires/impaires, finit par 5 / par 0)', () => {
		// 0 est divisible par tout (0 = 0 × d).
		expect(estDivisible(0, 2)).toBe(true);
		expect(estDivisible(0, 5)).toBe(true);
		expect(estDivisible(0, 10)).toBe(true);
		// Finit par 0 → par 2, 5 et 10.
		expect(estDivisible(40, 2)).toBe(true);
		expect(estDivisible(40, 5)).toBe(true);
		expect(estDivisible(40, 10)).toBe(true);
		// Finit par 5 (piège) → par 5 SEUL.
		expect(estDivisible(45, 5)).toBe(true);
		expect(estDivisible(45, 2)).toBe(false);
		expect(estDivisible(45, 10)).toBe(false);
		// Pair non nul → par 2 seul.
		expect(estDivisible(48, 2)).toBe(true);
		expect(estDivisible(48, 5)).toBe(false);
		expect(estDivisible(48, 10)).toBe(false);
		// Impair ≠ 5 → aucun.
		expect(estDivisible(53, 2)).toBe(false);
		expect(estDivisible(53, 5)).toBe(false);
		expect(estDivisible(53, 10)).toBe(false);
		// Grand nombre : le critère tient (dépend du seul chiffre des unités).
		expect(estDivisible(603180, 10)).toBe(true);
		expect(estDivisible(275095, 5)).toBe(true);
		expect(estDivisible(275095, 10)).toBe(false);
	});

	it('coïncide avec « reste nul » sur un large balayage (0..9999 + grands nombres)', () => {
		for (const d of DIVISEURS) {
			for (let n = 0; n <= 9999; n++) {
				expect(estDivisible(n, d)).toBe(n % d === 0);
			}
			for (const n of [12400, 35715, 48060, 275090, 603185, 999990, 999995]) {
				expect(estDivisible(n, d)).toBe(n % d === 0);
			}
		}
	});
});

describe('Divisibilité — corrigé explicationDivisibilite (les 3 critères, sans contre-sens)', () => {
	/* Vrais diviseurs de n parmi {2,5,10} — dérivés de la définition. */
	const vraisDiviseurs = (n: number): Set<Diviseur> =>
		new Set(DIVISEURS.filter((d) => n % d === 0));

	/* Ensemble des diviseurs AFFIRMÉS par le corrigé (sens « est divisible par »).
	   Extraction sémantique : « ni divisible » ouvre le cas « aucun » ; sinon on lit
	   la partie AVANT « mais pas » (la restriction éventuelle). But : éprouver le SENS
	   du corrigé, pas recopier sa formule. À revoir si la formulation change. */
	const diviseursAffirmes = (e: string): Set<Diviseur> => {
		if (e.includes('ni divisible')) return new Set();
		const affirmatif = e.split('mais pas')[0];
		return new Set(DIVISEURS.filter((d) => affirmatif.includes(`par ${d}`)));
	};

	it('nomme TOUJOURS les trois diviseurs et affirme exactement les vrais (banque + balayage)', () => {
		const nombres = new Set<number>(construireBanqueDivisibilite().map((it) => it.n));
		// Complète avec des représentants de chaque classe de dernier chiffre.
		for (const n of [0, 5, 10, 45, 48, 53, 100, 1000, 12345, 603180, 999999]) nombres.add(n);
		for (const n of nombres) {
			const e = explicationDivisibilite(n);
			for (const d of DIVISEURS) expect(e).toContain(`par ${d}`);
			expect(diviseursAffirmes(e)).toEqual(vraisDiviseurs(n));
			// Le nombre concerné (mis en forme #240) est bien celui du corrigé.
			expect(e).toContain(formatNombre(n));
		}
	});

	it('finit par 0 → divisible par 2, 5 ET 10 (aucune restriction)', () => {
		const e = explicationDivisibilite(40);
		expect(diviseursAffirmes(e)).toEqual(new Set([2, 5, 10]));
		expect(e).not.toContain('pas'); // aucune négation dans ce cas
	});

	it('finit par 5 → par 5 SEUL, jamais « divisible par 2 » ni « par 10 »', () => {
		const e = explicationDivisibilite(45);
		expect(e).toContain('divisible par 5');
		// Contre-sens interdits (le piège classique) : pas d'affirmation de 2 ou 10.
		expect(e).not.toContain('divisible par 2');
		expect(e).not.toContain('divisible par 10');
		expect(diviseursAffirmes(e)).toEqual(new Set([5]));
	});

	it('pair non nul → par 2 SEUL (ni 5 ni 10)', () => {
		const e = explicationDivisibilite(48);
		expect(e).toContain('divisible par 2');
		expect(e).not.toContain('divisible par 5');
		expect(e).not.toContain('divisible par 10');
		expect(diviseursAffirmes(e)).toEqual(new Set([2]));
	});

	it('impair ≠ 5 → aucun (corrigé en « ni divisible »)', () => {
		const e = explicationDivisibilite(53);
		expect(e).toContain('ni divisible');
		expect(diviseursAffirmes(e)).toEqual(new Set());
	});
});

describe('Divisibilité — exerciceDivisibilite (contrat QCM, réponse STOCKÉE)', () => {
	it('choix TOUJOURS exactement [Oui, Non] (positions stables) sur toute la banque', () => {
		for (const item of construireBanqueDivisibilite()) {
			const ex = qcm(exerciceDivisibilite(item));
			expect(ex.choices).toEqual(['Oui', 'Non']);
			expect(ex.choices).toContain(ex.answer);
			expect(ex.explication).toBe(explicationDivisibilite(item.n));
		}
	});

	it('la réponse SUIT le drapeau stocké `divisible` — pas de recalcul au moment du QCM', () => {
		// Item volontairement INCOHÉRENT (divisible faux alors que 10 % 2 === 0) : si
		// l'exercice recalculait, il répondrait « Oui » ; il doit suivre le stocké → « Non ».
		const menteurNon: ItemDivisibilite = {
			n: 10,
			d: 2,
			divisible: false,
			cote: 'nombre',
			levels: ['cm1'],
		};
		expect(qcm(exerciceDivisibilite(menteurNon)).answer).toBe('Non');
		// Symétrique : divisible=true sur un cas faux (11 non divisible par 2) → « Oui ».
		const menteurOui: ItemDivisibilite = {
			n: 11,
			d: 2,
			divisible: true,
			cote: 'nombre',
			levels: ['cm1'],
		};
		expect(qcm(exerciceDivisibilite(menteurOui)).answer).toBe('Oui');
	});

	it('la formulation suit `cote` (« divisible par » vs « diviseur de »)', () => {
		const surN = qcm(
			exerciceDivisibilite({ n: 30, d: 5, divisible: true, cote: 'nombre', levels: ['cm1'] }),
		);
		const surD = qcm(
			exerciceDivisibilite({ n: 30, d: 5, divisible: true, cote: 'diviseur', levels: ['cm1'] }),
		);
		expect(surN.question).toContain('est-il divisible par 5');
		expect(surD.question).toContain('est-il un diviseur de');
	});
});

describe('Divisibilité — équilibre et cas frontière de la banque', () => {
	const banque = construireBanqueDivisibilite();

	it('banque non triviale ; réponse stockée toujours cohérente avec la définition', () => {
		expect(banque.length).toBeGreaterThanOrEqual(48);
		for (const it of banque) {
			expect(it.divisible).toBe(it.n % it.d === 0);
			expect(qcm(exerciceDivisibilite(it)).answer).toBe(it.divisible ? 'Oui' : 'Non');
		}
	});

	it('~1/3 par diviseur, ~50/50 oui/non global ET par diviseur', () => {
		const parDiv = (d: Diviseur) => banque.filter((it) => it.d === d);
		// Les trois diviseurs sont présents et équilibrés (part ≈ 1/3).
		for (const d of DIVISEURS) {
			const part = parDiv(d).length / banque.length;
			expect(part).toBeGreaterThan(0.28);
			expect(part).toBeLessThan(0.4);
		}
		// 50/50 global.
		const oui = banque.filter((it) => it.divisible).length;
		expect(oui).toBe(banque.length - oui);
		// 50/50 par diviseur.
		for (const d of DIVISEURS) {
			const g = parDiv(d);
			const gOui = g.filter((it) => it.divisible).length;
			expect(gOui).toBe(g.length - gOui);
		}
	});

	it('les 4 classes de dernier chiffre sont présentes (dont le piège « finit par 5 »)', () => {
		const parUnite = (test: (u: number) => boolean) =>
			banque.filter((it) => test(it.n % 10)).length;
		expect(parUnite((u) => u === 0)).toBeGreaterThan(0); // ÷2,5,10
		expect(parUnite((u) => u === 5)).toBeGreaterThan(0); // ÷5 seul (piège)
		expect(parUnite((u) => u !== 0 && u % 2 === 0)).toBeGreaterThan(0); // pair non nul → ÷2 seul
		expect(parUnite((u) => u % 2 === 1 && u !== 5)).toBeGreaterThan(0); // impair ≠5 → aucun
	});

	it('quota de grands nombres (5-6 chiffres), dont du 6-chiffres', () => {
		const grands = banque.filter((it) => it.n >= 10000);
		expect(grands.length).toBeGreaterThanOrEqual(8);
		expect(grands.length).toBeLessThan(banque.length / 2); // reste minoritaire
		expect(banque.some((it) => it.n >= 100000)).toBe(true); // au moins un 6-chiffres
	});

	it('minorité formulée côté diviseur (pont de vocabulaire), majorité côté nombre', () => {
		const cote = (c: 'nombre' | 'diviseur') => banque.filter((it) => it.cote === c).length;
		expect(cote('diviseur')).toBeGreaterThan(0);
		expect(cote('diviseur')).toBeLessThan(cote('nombre'));
		// Les deux formulations apparaissent bien dans les énoncés produits.
		const questions = banque.map((it) => qcm(exerciceDivisibilite(it)).question);
		expect(questions.some((q) => q.includes('est-il divisible par'))).toBe(true);
		expect(questions.some((q) => q.includes('est-il un diviseur de'))).toBe(true);
	});

	it('nombres majoritairement distincts (pas de doublon massif)', () => {
		const distincts = new Set(banque.map((it) => it.n)).size;
		expect(distincts).toBeGreaterThanOrEqual(Math.floor(banque.length * 0.7));
	});
});

describe('Divisibilité — multi-niveau & déterminisme', () => {
	it('chaque item est tagué CM1 ; la banque est CM1-only', () => {
		for (const it of construireBanqueDivisibilite()) expect(it.levels).toEqual(['cm1']);
		expect(BANQUE_DIVISIBILITE.levels).toEqual(['cm1']);
		expect(BANQUE_DIVISIBILITE.at('cm1').length).toBe(construireBanqueDivisibilite().length);
		expect(BANQUE_DIVISIBILITE.at('ce2')).toEqual([]);
	});

	it('construction déterministe : deux appels rendent une banque identique', () => {
		expect(construireBanqueDivisibilite()).toEqual(construireBanqueDivisibilite());
	});
});

/* =====================================================================
   LEÇON 2 — Ordre de grandeur d'un produit (#250)
   ===================================================================== */

/* Références INDÉPENDANTES (premiers principes) pour dériver les attendus. */
// Plus grande puissance de 10 ≤ x (sans compter les chiffres via String).
const ordreRef = (x: number): number => {
	let p = 1;
	while (p * 10 <= x) p *= 10;
	return p;
};
// Arrondi au chiffre significatif de tête (ties → au-dessus, comme Math.round).
const arrondiRef = (n: number): number => {
	if (n < 10) return n;
	const p = ordreRef(n);
	return Math.round(n / p) * p;
};
// Admissible ssi ordre(produit) ≥ 100 ET l'estimation par arrondi reste la même classe.
const ogpRef = (a: number, b: number): number | null => {
	const og = ordreRef(a * b);
	if (og < 100) return null;
	if (ordreRef(arrondiRef(a) * arrondiRef(b)) !== og) return null;
	return og;
};
// Libellé de classe attendu (dérivé de la spec de l'issue, PAS du code).
const LIBELLE: Record<number, string> = {
	10: 'dans les dizaines (2 chiffres)',
	100: 'dans les centaines (3 chiffres)',
	1000: 'dans les milliers (4 chiffres)',
	10000: 'dans les dizaines de mille (5 chiffres)',
};

describe('Ordre de grandeur — arrondiChiffreSignificatif', () => {
	it('cas nets et frontières d’arrondi dérivés à la main', () => {
		// n < 10 inchangé.
		expect(arrondiChiffreSignificatif(6)).toBe(6);
		expect(arrondiChiffreSignificatif(5)).toBe(5);
		// 2 chiffres.
		expect(arrondiChiffreSignificatif(48)).toBe(50);
		expect(arrondiChiffreSignificatif(21)).toBe(20);
		expect(arrondiChiffreSignificatif(34)).toBe(30);
		expect(arrondiChiffreSignificatif(55)).toBe(60);
		expect(arrondiChiffreSignificatif(15)).toBe(20);
		expect(arrondiChiffreSignificatif(24)).toBe(20);
		expect(arrondiChiffreSignificatif(25)).toBe(30);
		// 3 chiffres et au-delà.
		expect(arrondiChiffreSignificatif(149)).toBe(100);
		expect(arrondiChiffreSignificatif(150)).toBe(200);
		expect(arrondiChiffreSignificatif(999)).toBe(1000);
	});

	it('coïncide avec l’arrondi de référence, et donne un seul chiffre significatif', () => {
		for (let n = 1; n <= 9999; n++) {
			const r = arrondiChiffreSignificatif(n);
			expect(r).toBe(arrondiRef(n));
			// Un chiffre significatif suivi de zéros (ex. « 50 », « 200 », « 1000 »).
			expect(String(r)).toMatch(/^[1-9]0*$/);
		}
	});
});

describe('Ordre de grandeur — ordreDeGrandeur (plus grande puissance de 10 ≤ x)', () => {
	it('cas dérivés à la main', () => {
		expect(ordreDeGrandeur(99)).toBe(10);
		expect(ordreDeGrandeur(100)).toBe(100);
		expect(ordreDeGrandeur(999)).toBe(100);
		expect(ordreDeGrandeur(1000)).toBe(1000);
		expect(ordreDeGrandeur(9999)).toBe(1000);
		expect(ordreDeGrandeur(204)).toBe(100);
		expect(ordreDeGrandeur(1008)).toBe(1000);
		expect(ordreDeGrandeur(5994)).toBe(1000);
	});

	it('propriété : og ≤ x < og×10 (donc = 10^(nb chiffres−1)) sur un balayage', () => {
		for (let x = 1; x <= 99999; x++) {
			const og = ordreDeGrandeur(x);
			expect(og).toBeLessThanOrEqual(x);
			expect(og * 10).toBeGreaterThan(x);
			expect(og).toBe(Math.pow(10, String(x).length - 1));
		}
	});
});

describe('Ordre de grandeur — ordreGrandeurProduit (règle d’admissibilité)', () => {
	it('exemples clés dérivés à la main', () => {
		expect(ordreGrandeurProduit(48, 21)).toBe(1000); // 1008, arrondi 50×20=1000 (canonique)
		expect(ordreGrandeurProduit(32, 32)).toBeNull(); // 1024 mais 30×30=900 → change de classe
		expect(ordreGrandeurProduit(6, 9)).toBeNull(); // 54 < 100 (condition 1)
		expect(ordreGrandeurProduit(13, 8)).toBeNull(); // 104 mais 10×8=80 → change de classe
		expect(ordreGrandeurProduit(12, 13)).toBe(100); // 156, arrondi 10×10=100 (admis)
	});

	it('balayage complet 2..99 : identique à la référence (admet ssi les 2 conditions)', () => {
		let nonNuls = 0;
		let nuls = 0;
		for (let a = 2; a <= 99; a++) {
			for (let b = 2; b <= 99; b++) {
				const got = ordreGrandeurProduit(a, b);
				const attendu = ogpRef(a, b);
				expect(got).toBe(attendu);
				if (got === null) {
					nuls++;
				} else {
					nonNuls++;
					// Les deux conditions tiennent explicitement.
					expect(got).toBeGreaterThanOrEqual(100);
					expect(ordreRef(arrondiRef(a) * arrondiRef(b))).toBe(got);
					// Produit ≤ 9801 → seuls 100 et 1000 sont possibles.
					expect([100, 1000]).toContain(got);
				}
			}
		}
		// Le balayage éprouve bien les deux issues (admis / écarté).
		expect(nonNuls).toBeGreaterThan(0);
		expect(nuls).toBeGreaterThan(0);
	});

	it('aucun couple violant la condition 2 n’est admis (revérif indépendante)', () => {
		for (let a = 2; a <= 99; a++) {
			for (let b = 2; b <= 99; b++) {
				const got = ordreGrandeurProduit(a, b);
				if (got !== null) {
					expect(ordreRef(arrondiRef(a) * arrondiRef(b))).toBe(ordreRef(a * b));
				}
			}
		}
	});
});

describe('Ordre de grandeur — exerciceOrdreGrandeur (QCM 3 classes, réponse STOCKÉE)', () => {
	const banque = construireBanqueOrdreGrandeur();

	it('énoncé, réponse et 3 choix cohérents pour toute la banque', () => {
		for (const item of banque) {
			const ex = qcm(exerciceOrdreGrandeur(item));
			expect(ex.question).toBe(`${item.a} × ${item.b}, le résultat sera…`);
			// Réponse = libellé de classe de l'ordre STOCKÉ (dérivé de la spec).
			expect(ex.answer).toBe(LIBELLE[item.ordre]);
			// Exactement 3 choix DISTINCTS, contenant la réponse.
			expect(ex.choices).toHaveLength(3);
			expect(new Set(ex.choices).size).toBe(3);
			expect(ex.choices).toContain(ex.answer);
			// Les deux autres = classes voisines (×10 / ÷10).
			const attendus = new Set([
				LIBELLE[item.ordre / 10],
				LIBELLE[item.ordre],
				LIBELLE[item.ordre * 10],
			]);
			expect(new Set(ex.choices)).toEqual(attendus);
		}
	});

	it('la réponse SUIT l’ordre stocké — pas de recalcul (item volontairement faux)', () => {
		// 48×21 vaut réellement l'ordre 1000 ; on stocke 100 → l'exercice doit suivre 100.
		const menteur: ItemOrdreGrandeur = { a: 48, b: 21, ordre: 100, levels: ['cm1'] };
		const ex = qcm(exerciceOrdreGrandeur(menteur));
		expect(ex.answer).toBe(LIBELLE[100]);
		expect(new Set(ex.choices)).toEqual(new Set([LIBELLE[10], LIBELLE[100], LIBELLE[1000]]));
	});
});

describe('Ordre de grandeur — cohérence, répartition, multi-niveau, déterminisme', () => {
	const banque = construireBanqueOrdreGrandeur();

	it('chaque item : ordre recalculé == stocké, ∈ {100,1000}, a ≤ b dans [2,99]', () => {
		for (const it of banque) {
			expect(ordreGrandeurProduit(it.a, it.b)).toBe(it.ordre);
			expect([100, 1000]).toContain(it.ordre);
			expect(it.a).toBeGreaterThanOrEqual(2);
			expect(it.b).toBeLessThanOrEqual(99);
			expect(it.a).toBeLessThanOrEqual(it.b);
		}
	});

	it('anti-régression du piège : aucun item ne change de classe par arrondi', () => {
		for (const it of banque) {
			expect(ordreRef(arrondiRef(it.a) * arrondiRef(it.b))).toBe(it.ordre);
		}
	});

	it('répartition ≈ 40/40 entre ordre 100 et 1000', () => {
		const cent = banque.filter((it) => it.ordre === 100).length;
		const mille = banque.filter((it) => it.ordre === 1000).length;
		expect(cent).toBeGreaterThanOrEqual(30);
		expect(mille).toBeGreaterThanOrEqual(30);
		expect(Math.abs(cent - mille)).toBeLessThanOrEqual(10);
	});

	it('chaque item CM1 ; banque CM1-only ; construction déterministe', () => {
		for (const it of banque) expect(it.levels).toEqual(['cm1']);
		expect(BANQUE_ORDRE_GRANDEUR.levels).toEqual(['cm1']);
		expect(BANQUE_ORDRE_GRANDEUR.at('cm1').length).toBe(banque.length);
		expect(BANQUE_ORDRE_GRANDEUR.at('ce2')).toEqual([]);
		expect(construireBanqueOrdreGrandeur()).toEqual(construireBanqueOrdreGrandeur());
	});
});

/* =====================================================================
   Branchement catalogue (#250)
   ===================================================================== */

describe('Branchement catalogue des deux leçons (#250)', () => {
	it('divisibilité : CM1-only, Calcul mental, exclue du sprint', () => {
		const l = getLessonById('math-divisibilite-2-5-10')!;
		expect(l).toBeDefined();
		expect(l.subject).toBe('math');
		expect(l.category).toBe('math-calcul-mental');
		expect(l.levels).toEqual(['cm1']);
		expect(l.excludeFromSprint).toBe(true);
		expect(DIVISIBILITE_LESSONS[0].id).toBe('math-divisibilite-2-5-10');
	});

	it('ordre de grandeur : CM1-only, Calcul mental, restant dans le sprint', () => {
		const l = getLessonById('math-ordre-grandeur-produit')!;
		expect(l).toBeDefined();
		expect(l.subject).toBe('math');
		expect(l.category).toBe('math-calcul-mental');
		expect(l.levels).toEqual(['cm1']);
		expect(l.excludeFromSprint).toBeUndefined();
		expect(ORDRE_GRANDEUR_LESSONS[0].id).toBe('math-ordre-grandeur-produit');
	});

	it('divisibilité : genLessonItem CM1 → QCM [Oui,Non], round-trip de correction', () => {
		const l = getLessonById('math-divisibilite-2-5-10')!;
		for (let i = 0; i < 200; i++) {
			const item = genLessonItem(l, 'cm1');
			expect(item.choices).toEqual(['Oui', 'Non']);
			expect(checkItemAnswer(item, String(item.answer))).toBe(true);
			const faux = item.answer === 'Oui' ? 'Non' : 'Oui';
			expect(checkItemAnswer(item, faux)).toBe(false);
		}
	});

	it('ordre de grandeur : genLessonItem CM1 → QCM 3 choix, round-trip de correction', () => {
		const l = getLessonById('math-ordre-grandeur-produit')!;
		for (let i = 0; i < 200; i++) {
			const item = genLessonItem(l, 'cm1');
			expect(item.choices).toHaveLength(3);
			expect(item.choices).toContain(item.answer);
			expect(checkItemAnswer(item, String(item.answer))).toBe(true);
			const faux = item.choices!.find((c) => c !== item.answer)!;
			expect(checkItemAnswer(item, faux)).toBe(false);
		}
	});
});
