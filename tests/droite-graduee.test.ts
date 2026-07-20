/* ============================================================
   Droite graduée CM1 (#256) — logique pure.
   ------------------------------------------------------------
   Deux volets :
   1. Helpers géométriques PURS (src/core/figures/droite.ts) : nbIntervalles,
      valeursGraduations, xDeValeur, indexDepuisX (aimantation + aller-retour),
      repereMarkup (tige/tête, creuse vs pleine, couleurs d'état) et les deux
      rendus SVG (statique role="img" / interactif role="radiogroup").
   2. Générateurs de leçons (via le catalogue) : invariants pédagogiques éprouvés
      PAR ÉCHANTILLON — la cible est une graduation NON numérotée, 3 bornes
      {min, milieu, max}, fenêtre de 10 intervalles, libellés dérivés
      INDÉPENDAMMENT (entiers via formatNombre, décimaux via une écriture à
      virgule recalculée à la main), déterminisme par `withSeed`.
   3. Repli LECTURE du catalogue (genLessonItem) : item `num`, réponse = cibleLabel,
      figure avec repère, tolérance numérique (« 3,40 » = « 3,4 »), cran voisin rejeté.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	nbIntervalles,
	valeursGraduations,
	xDeValeur,
	indexDepuisX,
	repereMarkup,
	DROITE_GEOM,
	renderDroiteGraduee,
	renderDroiteGradueeInteractif,
} from '../src/core/figures/droite';
import { renderFigure } from '../src/core/figures';
import { getLessonById, genLessonItem, isDroiteGradueeLesson } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { withSeed } from '../src/core/utils';
import { formatNombre } from '../src/core/nombres';
import type { Exercise, ExerciseType } from '../src/core/exercise';

const ENTIERS = 'num-droite-entiers';
const DECIMAUX = 'num-droite-decimaux';

type DGEx = Extract<Exercise, { type: 'droiteGraduee' }>;

/* Narrowing utilitaire : force le variant attendu ou lève (jamais de `as`). */
function asDG(ex: Exercise): DGEx {
	if (ex.type !== 'droiteGraduee') throw new Error(`attendu droiteGraduee, reçu ${ex.type}`);
	return ex;
}

function typeDe(id: string): ExerciseType {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente : ${id}`);
	return l.exerciseType;
}

function genDG(id: string): DGEx {
	return asDG(typeDe(id).generate({ level: 'cm1' }));
}

/* Écriture à virgule d'une valeur en CENTIÈMES, dérivée INDÉPENDAMMENT du code testé
   (strip du zéro final par regex, pas la branche frac%10 de la source) :
   300 → « 3 », 340 → « 3,4 », 347 → « 3,47 », 5 → « 0,05 », 90 → « 0,9 ». */
function labelDecimalAttendu(centiemes: number): string {
	const ent = Math.trunc(centiemes / 100);
	const cent = centiemes % 100; // 0..99 (valeurs ≥ 0 ici)
	if (cent === 0) return String(ent);
	const deux = String(cent).padStart(2, '0'); // « 40 », « 47 », « 05 »
	return `${ent},${deux.replace(/0$/, '')}`; // « 4 », « 47 », « 05 »
}

/* Toutes les chaînes « visibles » d'un exercice droite graduée (labels + textes). */
function textesDe(ex: DGEx): string[] {
	return [
		...ex.graduations.map((g) => g.label),
		...ex.bornes.map((b) => b.label),
		ex.cibleLabel,
		ex.consigne,
		ex.explication,
		ex.parle,
	];
}

/* =========================================================================
   1. HELPERS GÉOMÉTRIQUES PURS
   ========================================================================= */

describe('nbIntervalles : compte robuste au flottant', () => {
	it('cas nominaux (exemples #256)', () => {
		expect(nbIntervalles(340, 350, 1)).toBe(10);
		expect(nbIntervalles(300, 400, 10)).toBe(10);
		expect(nbIntervalles(45000, 46000, 100)).toBe(10);
		expect(nbIntervalles(230000, 240000, 1000)).toBe(10);
	});

	it('un seul intervalle et division exacte', () => {
		expect(nbIntervalles(0, 1, 1)).toBe(1);
		expect(nbIntervalles(5, 5, 1)).toBe(0); // collection dégénérée : borne = borne
	});

	it('résiste aux pas fractionnaires (0,1 non représentable exactement)', () => {
		// 1/0.1 = 9.999…998 en flottant ; Math.round rattrape → 10 (pas 9).
		expect(nbIntervalles(0, 1, 0.1)).toBe(10);
		// 0.3/0.1 = 2.999…996 → 3.
		expect(nbIntervalles(3, 3.3, 0.1)).toBe(3);
		expect(nbIntervalles(0, 0.07, 0.01)).toBe(7);
	});
});

describe('valeursGraduations : liste ordonnée [min … max]', () => {
	it('longueur = nbIntervalles+1, premier = min, dernier = max, pas constant', () => {
		const cas: Array<[number, number, number]> = [
			[340, 350, 1],
			[300, 400, 10],
			[45000, 46000, 100],
			[0, 10, 1],
		];
		for (const [min, max, pas] of cas) {
			const n = nbIntervalles(min, max, pas);
			const vals = valeursGraduations(min, max, pas);
			expect(vals.length).toBe(n + 1);
			expect(vals[0]).toBe(min);
			expect(vals[vals.length - 1]).toBe(max);
			// Croissance stricte et pas constant.
			for (let i = 1; i < vals.length; i++) {
				expect(vals[i] - vals[i - 1]).toBe(pas);
			}
		}
	});
});

describe('xDeValeur : projection monotone bornée à l’axe', () => {
	it('x(min) = X0, x(max) = X1, milieu au centre de l’axe', () => {
		const cas: Array<[number, number]> = [
			[340, 350],
			[45000, 46000],
			[0, 10],
		];
		for (const [min, max] of cas) {
			expect(xDeValeur(min, min, max)).toBe(DROITE_GEOM.X0);
			expect(xDeValeur(max, min, max)).toBe(DROITE_GEOM.X1);
			const centre = (DROITE_GEOM.X0 + DROITE_GEOM.X1) / 2;
			expect(xDeValeur((min + max) / 2, min, max)).toBeCloseTo(centre, 9);
		}
	});

	it('strictement croissante', () => {
		const [min, max] = [1000, 1100];
		let prev = -Infinity;
		for (let v = min; v <= max; v += 10) {
			const x = xDeValeur(v, min, max);
			expect(x).toBeGreaterThan(prev);
			prev = x;
		}
	});
});

describe('indexDepuisX : aimantation + aller-retour', () => {
	const [min, max, pas] = [0, 10, 1];
	const n = nbIntervalles(min, max, pas);

	it('un x exactement sur une graduation renvoie son index', () => {
		for (let i = 0; i <= n; i++) {
			const v = min + i * pas;
			expect(indexDepuisX(xDeValeur(v, min, max), min, max, pas)).toBe(i);
		}
	});

	it('un x entre deux graduations renvoie la PLUS PROCHE', () => {
		// index 3 est à x=105.6, index 4 à x=132.8 ; 110 est nettement plus près de 3.
		expect(indexDepuisX(110, min, max, pas)).toBe(3);
		// à +5 px de l'index 7 (x≈190.4+24) → toujours 7.
		expect(indexDepuisX(xDeValeur(7, min, max) + 5, min, max, pas)).toBe(7);
	});

	it('borné à [0, n] : un x hors axe est ramené aux extrémités', () => {
		expect(indexDepuisX(-500, min, max, pas)).toBe(0);
		expect(indexDepuisX(5000, min, max, pas)).toBe(n);
		expect(indexDepuisX(DROITE_GEOM.X0 - 1, min, max, pas)).toBe(0);
		expect(indexDepuisX(DROITE_GEOM.X1 + 1, min, max, pas)).toBe(n);
	});

	it('aller-retour indexDepuisX(xDeValeur(v)) = index de v, sur des fenêtres variées', () => {
		const cas: Array<[number, number, number]> = [
			[340, 350, 1],
			[45000, 46000, 100],
			[230000, 240000, 1000],
			[300, 400, 10],
		];
		for (const [mn, mx, ps] of cas) {
			const vals = valeursGraduations(mn, mx, ps);
			vals.forEach((v, i) => {
				expect(indexDepuisX(xDeValeur(v, mn, mx), mn, mx, ps)).toBe(i);
			});
		}
	});
});

describe('repereMarkup : tige + tête, forme et couleur selon l’état', () => {
	const x = 160;

	it('toujours une tige (line) ET une tête (circle) posée à cy=42', () => {
		const m = repereMarkup(x, 'neutre');
		expect(m).toContain('<line');
		expect(m).toContain('<circle');
		expect(m).toContain('cy="42"'); // axisY(74) - tige(32)
	});

	it('état « faux » → tête CREUSE (fond papier + contour rouge)', () => {
		const m = repereMarkup(x, 'faux');
		expect(m).toContain('fill="var(--paper)"'); // tête creuse
		expect(m).toContain('var(--ko)'); // contour rouge (double codage forme/couleur)
		expect(m).not.toContain('var(--ok)');
	});

	it('état « correct » → tête PLEINE verte (jamais fond papier)', () => {
		const m = repereMarkup(x, 'correct');
		expect(m).toContain('fill="var(--ok)"');
		expect(m).not.toContain('var(--paper)');
	});

	it('état « neutre » (défaut) → corail (--clock-min), tête pleine', () => {
		expect(repereMarkup(x)).toContain('var(--clock-min)');
		expect(repereMarkup(x, 'neutre')).toContain('fill="var(--clock-min)"');
		expect(repereMarkup(x, 'neutre')).not.toContain('var(--paper)');
	});
});

describe('renderDroiteGraduee : figure statique role="img"', () => {
	const spec = {
		min: 0,
		max: 10,
		pas: 1,
		bornes: [
			{ valeur: 0, label: '0' },
			{ valeur: 5, label: '5' },
			{ valeur: 10, label: '10' },
		],
		reperes: [{ valeur: 7 }],
		desc: 'Une droite graduée avec un repère à lire.',
	};

	it('porte role="img" et un <title>', () => {
		const svg = renderDroiteGraduee(spec);
		expect(svg).toContain('role="img"');
		expect(svg).toContain('<title>Droite graduée</title>');
		expect(svg).not.toContain('role="radiogroup"');
	});

	it('le repère est dessiné (tige + tête corail) mais la valeur repérée n’est PAS dans le <desc>', () => {
		const svg = renderDroiteGraduee(spec);
		expect(svg).toContain('var(--clock-min)'); // repère neutre (à lire)
		const desc = svg.match(/<desc>(.*?)<\/desc>/)?.[1] ?? '';
		expect(desc).toBe('Une droite graduée avec un repère à lire.');
		expect(desc).not.toContain('7'); // la position à lire ne fuit pas
	});
});

describe('renderDroiteGradueeInteractif : coquille role="radiogroup"', () => {
	// Construit une coquille à partir d'un vrai exercice (11 graduations).
	const ex = withSeed(1, () => genDG(DECIMAUX));
	const svg = renderDroiteGradueeInteractif({
		min: ex.min,
		max: ex.max,
		pas: ex.pas,
		graduations: ex.graduations,
		bornes: ex.bornes,
		ariaLabel: ex.consigne,
	});

	const compte = (re: RegExp) => (svg.match(re) ?? []).length;

	it('porte role="radiogroup" (jamais role="img") + aria-label = consigne', () => {
		expect(svg).toContain('role="radiogroup"');
		expect(svg).not.toContain('role="img"');
		expect(svg).toContain(`aria-label="${ex.consigne}"`);
	});

	it('autant de .dg-hit role="radio" que de graduations', () => {
		const nbGrad = ex.graduations.length;
		expect(nbGrad).toBe(nbIntervalles(ex.min, ex.max, ex.pas) + 1);
		expect(compte(/role="radio"/g)).toBe(nbGrad);
		expect(compte(/class="dg-hit"/g)).toBe(nbGrad);
		expect(compte(/data-index="/g)).toBe(nbGrad);
		expect(compte(/data-valeur="/g)).toBe(nbGrad);
		expect(compte(/data-label="/g)).toBe(nbGrad);
	});

	it('un SEUL radio focalisable (tabindex="0" = index 0), les autres tabindex="-1"', () => {
		expect(compte(/tabindex="0"/g)).toBe(1);
		expect(compte(/tabindex="-1"/g)).toBe(ex.graduations.length - 1);
		// L'index 0 porte bien la valeur min et est le focalisable.
		expect(svg).toContain(`data-index="0" data-valeur="${ex.min}"`);
	});

	it('expose la fenêtre (data-min/max/pas/n) et un groupe repère vide', () => {
		expect(svg).toContain(`data-min="${ex.min}"`);
		expect(svg).toContain(`data-max="${ex.max}"`);
		expect(svg).toContain(`data-pas="${ex.pas}"`);
		expect(svg).toContain(`data-n="${nbIntervalles(ex.min, ex.max, ex.pas)}"`);
		expect(svg).toContain('<g class="dg-repere"></g>');
	});
});

/* =========================================================================
   2. GÉNÉRATEURS DE LEÇONS (par échantillon)
   ========================================================================= */

describe('Branchement catalogue (#256)', () => {
	it('les 2 leçons existent, CM1-only, en Numération, exerciseKind droiteGraduee', () => {
		for (const id of [ENTIERS, DECIMAUX]) {
			const l = getLessonById(id);
			expect(l, `leçon ${id}`).toBeDefined();
			expect(l!.levels).toEqual(['cm1']);
			expect(l!.category).toBe('math-numeration');
			expect(l!.exerciseType.exerciseKind).toBe('droiteGraduee');
			expect(l!.exerciseType.levels).toEqual(['cm1']);
		}
		// La leçon décimaux poursuit la rubrique « Nombres décimaux » ; l'entière reste à plat.
		expect(getLessonById(DECIMAUX)!.rubrique).toBe('Nombres décimaux');
		expect(getLessonById(ENTIERS)!.rubrique).toBeUndefined();
	});

	it('isDroiteGradueeLesson : vrai pour les 2 leçons, faux pour une autre leçon de numération', () => {
		expect(isDroiteGradueeLesson(getLessonById(ENTIERS)!)).toBe(true);
		expect(isDroiteGradueeLesson(getLessonById(DECIMAUX)!)).toBe(true);
		// Une leçon de numération « classique » (situer un grand nombre) n'est PAS une droite graduée.
		expect(isDroiteGradueeLesson(getLessonById('num-situer-10000')!)).toBe(false);
	});
});

describe('Dispatch FigureSpec : renderFigure({ kind: "droiteGraduee" })', () => {
	// Spec simple dérivée à la main : fenêtre [0 ; 10], pas 1, bornes 0/5/10, repère à 7.
	const spec = {
		min: 0,
		max: 10,
		pas: 1,
		bornes: [
			{ valeur: 0, label: '0' },
			{ valeur: 5, label: '5' },
			{ valeur: 10, label: '10' },
		],
		reperes: [{ valeur: 7 }],
	};

	it('produit EXACTEMENT la même sortie qu’un appel direct à renderDroiteGraduee', () => {
		const viaDispatch = renderFigure({ kind: 'droiteGraduee', ...spec });
		const direct = renderDroiteGraduee(spec);
		expect(viaDispatch).toBe(direct);
	});

	it('SVG statique attendu : role="img", axe complet, repère à la position calculée à la main', () => {
		const svg = renderFigure({ kind: 'droiteGraduee', ...spec });
		expect(svg).toContain('role="img"');
		// Axe horizontal de X0(24) à X1(296) à l'ordonnée axisY(74).
		expect(svg).toContain('x1="24" y1="74" x2="296" y2="74"');
		// Repère à la valeur 7 : x = 24 + 7 × (296−24) / 10 = 24 + 190,4 = 214,4 (tête à cy=42).
		expect(svg).toContain('cx="214.4" cy="42" r="7"');
		expect(svg).toContain('x1="214.4" y1="74" x2="214.4" y2="42"');
		expect(svg).toContain('var(--clock-min)'); // repère neutre (à lire)
	});
});

describe('Invariants communs aux deux leçons (échantillon)', () => {
	for (const id of [ENTIERS, DECIMAUX]) {
		it(`${id} : type droiteGraduee, check() TOUJOURS false, cible = graduation NON numérotée`, () => {
			const t = typeDe(id);
			for (let i = 0; i < 500; i++) {
				const ex = asDG(t.generate({ level: 'cm1' }));
				expect(ex.type).toBe('droiteGraduee');

				// check() ne valide jamais (correction déléguée au runner).
				expect(t.check(ex, ex.cibleLabel)).toBe(false);
				expect(t.check(ex, 'peu importe')).toBe(false);

				const grads = valeursGraduations(ex.min, ex.max, ex.pas);
				const bornesVals = ex.bornes.map((b) => b.valeur);

				// La cible EST une graduation…
				expect(grads).toContain(ex.cible);
				// …mais JAMAIS une borne numérotée (l'enfant compte des crans).
				expect(bornesVals).not.toContain(ex.cible);
				// Formulé autrement : son index n'est ni 0, ni 5, ni 10.
				expect([0, 5, 10]).not.toContain(grads.indexOf(ex.cible));

				// Exactement 3 bornes = {min, milieu, max}, milieu = graduation d'indice 5.
				expect(ex.bornes.length).toBe(3);
				const milieu = (ex.min + ex.max) / 2;
				expect([...bornesVals].sort((a, b) => a - b)).toEqual([ex.min, milieu, ex.max]);
				expect(grads.indexOf(milieu)).toBe(5);
				expect((milieu - ex.min) % ex.pas).toBe(0); // le milieu tombe sur un cran

				// Fenêtre « d'une dizaine d'intervalles ».
				expect(nbIntervalles(ex.min, ex.max, ex.pas)).toBe(10);

				// cibleLabel = le label de la graduation cible.
				const gradCible = ex.graduations.find((g) => g.valeur === ex.cible);
				expect(gradCible?.label).toBe(ex.cibleLabel);
			}
		});
	}
});

describe('ENTIERS (num-droite-entiers)', () => {
	it('les 3 ordres de grandeur apparaissent, cible entière, libellés = entiers formatés', () => {
		const t = typeDe(ENTIERS);
		const gabarits = new Set<string>();
		for (let i = 0; i < 800; i++) {
			const ex = asDG(t.generate({ level: 'cm1' }));
			const largeur = ex.max - ex.min;
			gabarits.add(`${ex.pas}/${largeur}`);

			// Cible et bornes entières (pas de virgule dans un grand nombre).
			expect(Number.isInteger(ex.cible)).toBe(true);

			// Chaque libellé est l'entier formaté « à la française » (formatNombre).
			for (const g of ex.graduations) {
				expect(Number.isInteger(g.valeur)).toBe(true);
				expect(g.label).toBe(formatNombre(g.valeur));
			}
			expect(ex.cibleLabel).toBe(formatNombre(ex.cible));
			// Jamais de séparateur décimal dans un énoncé entier.
			expect(ex.cibleLabel).not.toMatch(/[.,]/);
		}
		// Les 3 gabarits d'échelle sont bien tirés sur l'échantillon.
		expect(gabarits).toEqual(new Set(['10/100', '100/1000', '1000/10000']));
	});

	it('fenêtres bien positionnées (bornes multiples de la largeur)', () => {
		const t = typeDe(ENTIERS);
		for (let i = 0; i < 300; i++) {
			const ex = asDG(t.generate({ level: 'cm1' }));
			const largeur = ex.max - ex.min;
			expect(ex.min % largeur).toBe(0); // min = k × largeur
		}
	});
});

describe('DÉCIMAUX (num-droite-decimaux)', () => {
	it('valeurs internes en centièmes entiers ; deux familles (dixièmes / centièmes)', () => {
		const t = typeDe(DECIMAUX);
		const familles = new Set<number>();
		for (let i = 0; i < 800; i++) {
			const ex = asDG(t.generate({ level: 'cm1' }));
			familles.add(ex.pas);
			// Représentation en CENTIÈMES ENTIERS : tout est entier (min/max/pas/cible/graduations).
			expect(Number.isInteger(ex.min)).toBe(true);
			expect(Number.isInteger(ex.max)).toBe(true);
			expect(Number.isInteger(ex.pas)).toBe(true);
			expect(Number.isInteger(ex.cible)).toBe(true);
			for (const g of ex.graduations) expect(Number.isInteger(g.valeur)).toBe(true);
		}
		// Dixièmes : pas de 10 centièmes ; centièmes : pas de 1 centième.
		expect(familles).toEqual(new Set([10, 1]));
	});

	it('libellés à virgule corrects (dérivés indépendamment), jamais 3+ décimales ni point', () => {
		const t = typeDe(DECIMAUX);
		// Repères de dérivation manuelle (échantillon nommé, hors code testé).
		expect(labelDecimalAttendu(340)).toBe('3,4');
		expect(labelDecimalAttendu(347)).toBe('3,47');
		expect(labelDecimalAttendu(300)).toBe('3');
		expect(labelDecimalAttendu(995)).toBe('9,95');

		for (let i = 0; i < 800; i++) {
			const ex = asDG(t.generate({ level: 'cm1' }));
			// Chaque label de graduation = l'écriture à virgule que JE recalcule.
			for (const g of ex.graduations) {
				expect(g.label).toBe(labelDecimalAttendu(g.valeur));
			}
			expect(ex.cibleLabel).toBe(labelDecimalAttendu(ex.cible));

			// Borne dure : jamais 3+ décimales, jamais de point décimal, dans AUCUN texte.
			for (const s of textesDe(ex)) {
				expect(s).not.toMatch(/\d,\d{3,}/);
				expect(s).not.toMatch(/\d\.\d/);
			}
		}
	});

	it('les bornes numérotées portent bien une écriture à virgule correcte', () => {
		const t = typeDe(DECIMAUX);
		for (let i = 0; i < 200; i++) {
			const ex = asDG(t.generate({ level: 'cm1' }));
			for (const b of ex.bornes) {
				expect(b.label).toBe(labelDecimalAttendu(b.valeur));
			}
		}
	});
});

describe('Déterminisme du tirage (générateur `r` injecté)', () => {
	for (const id of [ENTIERS, DECIMAUX]) {
		it(`${id} : même graine ⇒ exercice identique`, () => {
			for (const seed of [1, 7, 42, 256, 2024]) {
				const a = withSeed(seed, () => typeDe(id).generate({ level: 'cm1' }));
				const b = withSeed(seed, () => typeDe(id).generate({ level: 'cm1' }));
				expect(b).toEqual(a);
			}
		});

		it(`${id} : générateur non figé ⇒ des graines variées donnent des tirages variés`, () => {
			const vus = new Set<string>();
			for (let seed = 1; seed <= 20; seed++) {
				const ex = withSeed(seed, () => genDG(id));
				vus.add(`${ex.min}|${ex.max}|${ex.pas}|${ex.cible}`);
			}
			expect(vus.size).toBeGreaterThan(1);
		});
	}
});

/* =========================================================================
   3. REPLI LECTURE DU CATALOGUE (genLessonItem)
   ========================================================================= */

describe('Repli catalogue : lire le nombre repéré (genLessonItem)', () => {
	for (const id of [ENTIERS, DECIMAUX]) {
		it(`${id} : item num, réponse = cibleLabel, figure + énoncé « Quel nombre est repéré »`, () => {
			const lesson = getLessonById(id)!;
			for (const seed of [1, 5, 17, 99, 314, 777]) {
				// Même graine : l'item du repli et l'exercice sous-jacent s'alignent.
				const ex = withSeed(seed, () => asDG(lesson.exerciseType.generate({ level: 'cm1' })));
				const item = withSeed(seed, () => genLessonItem(lesson, 'cm1'));

				expect(item.kind).toBe('num');
				expect(item.answer).toBe(ex.cibleLabel);
				expect(item.text).toContain('Quel nombre est repéré');
				// Figure statique présente (role="img"), sans fuite de la valeur dans le <desc>.
				expect(item.figure).toBeTruthy();
				expect(item.figure!).toContain('role="img"');
				const desc = item.figure!.match(/<desc>(.*?)<\/desc>/)?.[1] ?? '';
				expect(desc).not.toContain(ex.cibleLabel);

				// La bonne réponse est acceptée…
				expect(checkItemAnswer(item, ex.cibleLabel)).toBe(true);
				// …et un cran voisin (mauvaise valeur) est refusé.
				const grads = ex.graduations;
				const idx = grads.findIndex((g) => g.valeur === ex.cible);
				const voisin = grads[idx - 1] ?? grads[idx + 1];
				expect(voisin.valeur).not.toBe(ex.cible);
				expect(checkItemAnswer(item, voisin.label)).toBe(false);
			}
		});
	}

	it('DÉCIMAUX : tolérance numérique — « 3,40 » accepté pour une cible « 3,4 »', () => {
		const lesson = getLessonById(DECIMAUX)!;
		let vuUnDecimal = false;
		for (let seed = 1; seed <= 200; seed++) {
			const item = withSeed(seed, () => genLessonItem(lesson, 'cm1'));
			const label = String(item.answer);

			// La bonne réponse et sa forme « à zéro final » sont toutes deux acceptées
			// (égalité numérique via parseNombreFr) : « 3,4 » → « 3,40 », « 3,47 » → « 3,470 ».
			expect(checkItemAnswer(item, label)).toBe(true);
			expect(checkItemAnswer(item, `${label}0`)).toBe(true);

			if (/^\d+,\d$/.test(label)) {
				// Cas exact demandé : cible à UNE décimale (« 3,4 ») acceptée écrite « 3,40 ».
				vuUnDecimal = true;
				expect(checkItemAnswer(item, `${label}0`)).toBe(true);
				// Un centième différent (valeur voisine) reste refusé.
				const voisinFaux = `${label}5`; // « 3,4 » → « 3,45 » ≠ 3,4
				expect(checkItemAnswer(item, voisinFaux)).toBe(false);
			}
		}
		// Sanity : on a bien éprouvé au moins une cible à une décimale.
		expect(vuUnDecimal).toBe(true);
	});
});
