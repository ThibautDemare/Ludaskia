/* ============================================================
   Les 15 leçons — chaque entrée est constructible isolément,
   ce qui permet de jouer une leçon seule OU le bilan complet.
   build() régénère des items frais à chaque appel.
   ============================================================ */
import { rnd, choice, sample, commKey, escapeHTML, withSeed, randomSeed } from './utils';
import { uniqueComm, uniqueExact } from './utils';
import {
	add,
	sub,
	mul,
	div,
	dbl,
	half,
	comp,
	facteur,
	renderItem,
	gridHTML,
	ficheHTML,
	lessonAttr,
	estItemQcm,
	nextInputId,
	ariaChamp,
	createRenderContext,
	withLessonId,
} from './items';
import type { Item, RenderContext } from './items';
import type { SchoolLevel } from './catalog';
// Import « tardif » (utilisé seulement dans des corps de fonction) du pipeline
// générique : dépendance circulaire build ↔ lessons sans effet de bord au chargement.
import { buildLessonFiche, bilanBlocksForIds } from './build';

/* ============================================================
   Plages partagées fiche ⇄ bilanQ (anti-répétition, #287)
   ------------------------------------------------------------
   Les leçons de calcul mental vivent à DEUX endroits qui doivent rester
   COHÉRENTS : la fiche imprimable (build() ci-dessous) et la génération
   interactive (bilanQ). Pour les cibles qui ne sont pas de simples bornes
   numériques (moitiés, décomposition multiplicative), on centralise la plage
   ICI afin que fiche et entraînement tirent dans le MÊME ensemble.

   ⚠ Périmètre CE2 uniquement (#287) : le système fiche/bilanQ n'a pas de
   paramètre `level`. Le calibrage CM1 de ces leçons est DIFFÉRÉ au déploiement
   du CM1 du calcul mental (le rendre multi-niveau dépasse cette issue).
   ============================================================ */

/* « Les moitiés » (leçon 4) : la moitié doit toujours être ENTIÈRE. ~30 cibles
   = pairs ≤ 20, dizaines entières ≤ 100 (20,30,…,100) et deux centaines rondes
   (200, 400). Générateur figé en constante (mêmes valeurs fiche et bilan). */
export const CIBLES_MOITIES: number[] = (() => {
	const cibles: number[] = [];
	for (let n = 2; n <= 20; n += 2) cibles.push(n); // pairs ≤ 20 (dont 10, 20)
	for (let d = 30; d <= 100; d += 10) cibles.push(d); // dizaines entières (30 → 100)
	cibles.push(200, 400); // quelques centaines rondes
	return cibles;
})();

/* « La moitié d'un nombre pair » (leçon 8) : pairs 22–98, en EXCLUANT les
   multiples de 10 ET les valeurs déjà couvertes par « Les moitiés » (pas de
   doublon entre les deux leçons). ~35 cibles. Reste dans les bornes CE2 :
   « moitié de 74 » / « moitié de 98 » (décomposition dizaines/unités) est le
   seuil de charge maximal validé pour la classe (#287). */
export const CIBLES_MOITIE_PAIR: number[] = (() => {
	const dejaVues = new Set(CIBLES_MOITIES);
	const cibles: number[] = [];
	for (let n = 22; n <= 98; n += 2) {
		if (n % 10 === 0) continue; // pas de multiple de 10 (trivial)
		if (dejaVues.has(n)) continue; // pas de doublon avec « Les moitiés »
		cibles.push(n);
	}
	return cibles;
})();

/* « Décomposer pour calculer une multiplication » (leçon 15) : b à 2 chiffres
   décomposable en dizaines + unités → {12–19} ∪ {21–29 hors multiples de 10}
   (#287, élargi depuis la petite liste figée). ~17 valeurs ; a tiré dans 3–9. */
export const CIBLES_DECOMPO_MULT: number[] = (() => {
	const cibles: number[] = [];
	for (let b = 12; b <= 19; b++) cibles.push(b); // 12 → 19
	for (let b = 21; b <= 29; b++) cibles.push(b); // 21 → 29 (tous non multiples de 10)
	return cibles;
})();

/* ============================================================
   Plages CM1 (issue #241) — calcul mental étendu au CM1.
   Ces leçons sont DISTINCTES des leçons CE2 (nouveaux id + nouveaux numéros
   bilanQ) ; elles ne touchent JAMAIS au calibrage des leçons CE2. Comme pour
   les CE2, fiche (LESSONS_CM1) et bilanQ partagent CES plages.
   ============================================================ */

/* « Multiples de 50 » (clone CM1 de « Les multiples de 25 ») : 50×2 → 50×12,
   soit 100 → 600. Même forme et même plage de multiplicateur que les 25. */
export const FACTEURS_MULTIPLES_50: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/* « Diviser par 10 » (quotients ENTIERS uniquement, #241) : dividendes multiples
   exacts de 10, quotient à 2 chiffres (20 → 990), en évitant le trivial 10÷10=1
   (quotient ≥ 2). Aucune virgule ni reste : le dividende FINIT toujours par 0. */
export const DIVIDENDES_DIV_10: number[] = (() => {
	const cibles: number[] = [];
	for (let q = 2; q <= 99; q++) cibles.push(q * 10); // 20, 30, … 990 (quotient 2 → 99)
	return cibles;
})();

/* « Diviser par 100 » (quotients ENTIERS uniquement, #241) : dividendes multiples
   exacts de 100, de 200 à 9900 (quotient à 2 chiffres, 2 → 99). Le dividende FINIT
   toujours par « 00 ». On VARIE volontairement le nombre de zéros FINAUX du dividende
   (200, 9000…) pour casser le réflexe faux « j'enlève deux zéros » : un quotient rond
   comme 4000÷100=40 (et non 400) côtoie un quotient « plein » comme 4700÷100=47. */
export const DIVIDENDES_DIV_100: number[] = (() => {
	const cibles: number[] = [];
	for (let q = 2; q <= 99; q++) cibles.push(q * 100); // 200, 300, … 9900 (quotient 2 → 99)
	return cibles;
})();

export const LESSONS = [
	{
		num: 1,
		id: 'math-tables-addition',
		title: "Les tables d'addition",
		sub: 'Additionner deux nombres de 1 à 9.',
		consigne: 'Calcule chaque addition.',
		build(ctx: RenderContext) {
			const items = uniqueComm(() => {
				let a = rnd(2, 9),
					b = rnd(2, 9);
				[a, b] = [Math.min(a, b), Math.max(a, b)];
				return add(a, b);
			}, 12);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 4, ctx));
		},
	},

	{
		num: 2,
		id: 'math-complements',
		title: 'Les compléments',
		sub: 'Trouver le nombre qui complète à 10, à 100 ou à 1000.',
		consigne: 'Complète chaque égalité.',
		build(ctx: RenderContext) {
			// Trois familles (#287) : compléments à 10, à 100 et à 1000 (centaines rondes).
			const pool10 = [];
			for (let a = 1; a <= 9; a++) pool10.push(comp(a, 10));
			const pool100 = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((a) => comp(a, 100));
			const pool1000 = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((a) => comp(a, 1000));
			const items = sample(
				[...sample(pool10, 4), ...sample(pool100, 4), ...sample(pool1000, 4)],
				12,
			);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 3,
		id: 'math-doubles',
		title: 'Les doubles',
		sub: "Le double, c'est deux fois le nombre.",
		consigne: 'Écris le double.',
		build(ctx: RenderContext) {
			// CE2 : n de 1 à 50 (#287, élargi depuis 1–39) pour varier les doubles.
			const items = sample(
				[...Array(50).keys()].map((i) => i + 1),
				12,
			).map(dbl);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 4,
		id: 'math-moities',
		title: 'Les moitiés',
		sub: "La moitié, c'est le nombre partagé en deux.",
		consigne: 'Écris la moitié.',
		build(ctx: RenderContext) {
			// Cibles partagées avec bilanQ (#287) : ~30 valeurs à moitié entière.
			const items = sample(CIBLES_MOITIES, 12).map(half);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 5,
		id: 'math-ajouter-9-19-29',
		title: 'Ajouter 9, 19, 29 / 8, 18, 28',
		sub: 'Astuce : +9 = +10 puis -1 · +8 = +10 puis -2.',
		consigne: "Calcule en utilisant l'astuce.",
		build(ctx: RenderContext) {
			const items = uniqueExact(() => add(rnd(20, 70), choice([8, 9, 18, 19, 28, 29])), 12);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 4, ctx));
		},
	},

	{
		num: 6,
		id: 'math-soustraire-9-19-29',
		title: 'Soustraire 9, 19, 29, 39 et un petit nombre',
		sub: 'Astuce : -9 = -10 puis +1.',
		consigne: 'Calcule chaque soustraction.',
		build(ctx: RenderContext) {
			const items = uniqueExact(() => sub(rnd(40, 90), choice([9, 19, 29, 39])), 8).concat(
				uniqueExact(() => sub(rnd(11, 20), rnd(2, 8)), 4),
			);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 4, ctx));
		},
	},

	{
		num: 7,
		id: 'math-tables-multiplication',
		title: 'Les tables de multiplication',
		sub: 'Tables de 2 à 9.',
		consigne: 'Calcule chaque produit.',
		build(ctx: RenderContext) {
			const items = uniqueComm(() => {
				let a = rnd(2, 9),
					b = rnd(2, 9);
				[a, b] = [Math.min(a, b), Math.max(a, b)];
				return mul(a, b);
			}, 12);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 4, ctx));
		},
	},

	{
		num: 8,
		id: 'math-moitie-pair',
		title: "La moitié d'un nombre pair",
		sub: 'Je sépare les dizaines et les unités si besoin.',
		consigne: 'Écris la moitié.',
		build(ctx: RenderContext) {
			// Cibles partagées avec bilanQ (#287) : pairs 22–98, hors multiples de 10 et
			// hors valeurs déjà vues dans « Les moitiés » (~35 valeurs, moitié entière).
			const items = sample(CIBLES_MOITIE_PAIR, 12).map(half);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 9,
		id: 'math-multiples-25',
		title: 'Les multiples de 25',
		sub: '25, 50, 75, 100... de 25 en 25.',
		consigne: 'Calcule.',
		build(ctx: RenderContext) {
			const items = sample([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 11).map((a) => mul(a, 25));
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 10,
		id: 'math-decompo-60',
		title: 'Décompositions multiplicatives de 60',
		sub: 'Quel nombre multiplié donne 60 ?',
		consigne: 'Complète.',
		build(ctx: RenderContext) {
			const fac = [
				[2, 30],
				[3, 20],
				[4, 15],
				[5, 12],
				[6, 10],
				[12, 5],
				[15, 4],
				[20, 3],
				[10, 6],
				[30, 2],
				[60, 1],
				[1, 60],
			];
			const items = sample(fac, 12).map(([a]) => facteur(a, 60));
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 11,
		id: 'math-dizaines-centaines',
		title: 'Ajouter, soustraire des dizaines et des centaines',
		sub: "J'ajoute ou je retire des paquets entiers.",
		consigne: 'Calcule.',
		build(ctx: RenderContext) {
			const items = uniqueExact(() => {
				const a = rnd(120, 500),
					op = choice(['+', '-']),
					b = choice([10, 20, 30, 40, 50]);
				return op === '+' ? add(a, b) : sub(a, b);
			}, 6)
				// Soustraction : le premier nombre doit rester ≥ au second (pas de résultat négatif au CE2).
				.concat(
					uniqueExact(() => {
						const b = choice([100, 200, 300]),
							op = choice(['+', '-']);
						const a = op === '-' ? rnd(b + 20, 640) : rnd(150, 600);
						return op === '+' ? add(a, b) : sub(a, b);
					}, 6),
				);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 12,
		id: 'math-multiplier-10-100',
		title: 'Multiplier par 10, par 100',
		sub: "×10 j'ajoute un zéro · ×100 j'ajoute deux zéros.",
		consigne: 'Calcule.',
		build(ctx: RenderContext) {
			const items = sample(
				[...Array(98).keys()].map((i) => i + 2),
				6,
			)
				.map((a) => mul(a, 10))
				.concat(
					sample(
						[...Array(39).keys()].map((i) => i + 2),
						6,
					).map((a) => mul(a, 100)),
				);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 13,
		id: 'math-multiplier-4-8',
		title: 'Multiplier par 4, par 8',
		sub: '×4 = double du double · ×8 = double du double du double.',
		consigne: 'Calcule.',
		build(ctx: RenderContext) {
			const items = sample(
				[...Array(23).keys()].map((i) => i + 3).filter((x) => x !== 8),
				6,
			)
				.map((a) => mul(a, 4))
				.concat(
					sample(
						[...Array(13).keys()].map((i) => i + 3).filter((x) => x !== 4),
						6,
					).map((a) => mul(a, 8)),
				);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 14,
		id: 'math-multiplier-20-30-40',
		title: 'Multiplier par 20, 30, 40',
		sub: 'Astuce : je multiplie par le chiffre, puis par 10.',
		consigne: 'Calcule.',
		build(ctx: RenderContext) {
			const items = uniqueComm(() => mul(rnd(2, 12), choice([20, 30, 40])), 12);
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 15,
		id: 'math-decomposer-multiplication',
		title: 'Décomposer pour calculer une multiplication',
		sub: 'Ex : 6 × 14 = (6×10) + (6×4) = 60 + 24 = 84.',
		consigne: 'Décompose puis calcule. Écris les étapes.',
		build(ctx: RenderContext) {
			const seen = new Set();
			const d = [];
			while (d.length < 6) {
				// a 3–9, b dans la plage élargie {12–19} ∪ {21–29 hors ×10} (#287).
				const a = rnd(3, 9),
					b = choice(CIBLES_DECOMPO_MULT);
				const k = a + 'x' + b;
				if (!seen.has(k)) {
					seen.add(k);
					d.push([a, b]);
				}
			}
			const lines = d
				.map(([a, b]) => {
					// Nom accessible de chaque case (#577) : cette leçon construit ses champs à la
					// main, hors `renderItem`, donc elle n'a pas hérité du nom que celui-ci pose.
					// Sans nom, un lecteur d'écran annonce SEPT « zone de saisie » par ligne, toutes
					// identiques, alors que la ligne écrite dit exactement où l'on est.
					// `(□ × □) + (□ × □) = □ + □`, dans l'ordre du rendu :
					const ETAPES = [
						'premier produit, premier nombre',
						'premier produit, second nombre',
						'second produit, premier nombre',
						'second produit, second nombre',
						'résultat du premier produit',
						'résultat du second produit',
					];
					let etape = 0;
					const free = () =>
						`<input class="ans-free" inputmode="numeric" autocomplete="off" aria-label="${a} × ${b} — ${ETAPES[etape++]}">`;
					const finalId = nextInputId(ctx);
					const item: Item = { text: `${a} × ${b} = @`, answer: a * b };
					ctx.items[finalId] = item;
					const finalField = `<input class="ans" id="${finalId}" data-answer="${a * b}"${lessonAttr(ctx)} inputmode="numeric" autocomplete="off"${ariaChamp(item)}><span class="mark" data-for="${finalId}"></span>`;
					return `<div class="op">${a} × ${b} = (${free()} × ${free()}) + (${free()} × ${free()}) = ${free()} + ${free()} = ${finalField}</div>`;
				})
				.join('');
			return ficheHTML(
				this.num,
				this.title,
				this.sub,
				this.consigne,
				`<div class="deco">${lines}</div>`,
			);
		},
	},
];

/* ============================================================
   Leçons de calcul mental CM1 (issue #241).
   ------------------------------------------------------------
   Tableau SÉPARÉ de LESSONS (qui reste l'ensemble CE2 « historique », consommé
   par les vues legacy « toutes les leçons » : buildFiches, bilanBlocks, bilanHTML,
   renderLessons). Les leçons CM1 sont surfacées par niveau via le catalogue
   (catalog.ts : levels=['cm1'] + ordre pédagogique math.cm1) et rendues par
   buildLessonFiche, qui les retrouve dans LESSONS_CALCUL_MENTAL (lookup combiné).
   Leur numéro bilanQ prolonge la numérotation CE2 (16, 17) ; jamais de
   recalibrage d'une leçon CE2.
   ============================================================ */
export const LESSONS_CM1 = [
	{
		num: 16,
		id: 'math-multiples-50',
		title: 'Les multiples de 50',
		sub: '50, 100, 150, 200... de 50 en 50.',
		consigne: 'Calcule.',
		build(ctx: RenderContext) {
			const items = sample(FACTEURS_MULTIPLES_50, 11).map((a) => mul(a, 50));
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},

	{
		num: 17,
		id: 'math-diviser-10-100',
		title: 'Diviser par 10, par 100',
		sub: '÷10 : combien de paquets de 10 · ÷100 : combien de paquets de 100.',
		consigne: 'Calcule.',
		build(ctx: RenderContext) {
			// Symétrique de « Multiplier par 10, par 100 » : 6 items ÷10 puis 6 items ÷100.
			// Quotients ENTIERS garantis (dividendes multiples exacts), à 2 chiffres.
			const items = sample(DIVIDENDES_DIV_10, 6)
				.map((a) => div(a, 10))
				.concat(sample(DIVIDENDES_DIV_100, 6).map((a) => div(a, 100)));
			return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3, ctx));
		},
	},
];

/* Lookup combiné pour le rendu d'une fiche de calcul mental (buildLessonFiche) :
   toutes les leçons « legacy » (CE2 + CM1), retrouvées par id. Les vues legacy
   « toutes les leçons » continuent d'itérer le seul tableau CE2 (LESSONS). */
export const LESSONS_CALCUL_MENTAL = [...LESSONS, ...LESSONS_CM1];

export function buildFiches() {
	// Chaque fiche a son propre contexte (compteur d'id repart de 0) : c'est un rendu
	// isolé « une leçon = une fiche », jamais assemblé dans un même document interactif.
	return LESSONS.map((l) => l.build(createRenderContext({ lessonId: l.id })));
}

/* ============================================================
   Bilans express (3 calculs par leçon)
   ============================================================ */
export const THEMES: Record<number, string> = {
	1: "Table d'addition",
	2: 'Complément à 10/100/1000',
	3: 'Doubles',
	4: 'Moitiés',
	5: 'Ajouter 9, 19...',
	6: 'Soustraire 9, 19...',
	7: 'Table de ×',
	8: 'Moitié (pair)',
	9: 'Multiples de 25',
	10: 'Décompo. de 60',
	11: 'Dizaines/centaines',
	12: '× 10, × 100',
	13: '× 4, × 8',
	14: '× 20, 30, 40',
	15: 'Décomposer',
	// CM1 (#241)
	16: 'Multiples de 50',
	17: '÷ 10, ÷ 100',
};
export function bilanQ(k: number): Item | undefined {
	switch (k) {
		case 1: {
			let a = rnd(2, 9),
				b = rnd(2, 9);
			[a, b] = [Math.min(a, b), Math.max(a, b)];
			return add(a, b);
		}
		case 2: {
			// Trois familles de compléments (#287) : à 10, à 100 et à 1000 (centaines
			// rondes). Élargir le pool casse la répétition de l'ancien duo 10/100
			// (9 + 9 valeurs). rnd/choice passent par randFloat (donc seedable) : le
			// corrigé imprimable correspond à la feuille (#41). Réponse calculée par comp().
			const f = rnd(1, 3);
			if (f === 1) return comp(rnd(1, 9), 10);
			if (f === 2) return comp(choice([10, 20, 30, 40, 50, 60, 70, 80, 90]), 100);
			return comp(choice([100, 200, 300, 400, 500, 600, 700, 800, 900]), 1000);
		}
		case 3:
			// Le double : n de 1 à 50 au CE2 (#287, élargi depuis 1–39).
			return dbl(rnd(1, 50));
		case 4:
			return half(choice(CIBLES_MOITIES));
		case 5:
			return add(rnd(20, 60), choice([8, 9, 18, 19, 28, 29]));
		case 6:
			return sub(rnd(40, 85), choice([9, 19, 29, 39]));
		case 7: {
			let a = rnd(2, 9),
				b = rnd(2, 9);
			[a, b] = [Math.min(a, b), Math.max(a, b)];
			return mul(a, b);
		}
		case 8:
			return half(choice(CIBLES_MOITIE_PAIR));
		case 9:
			return mul(rnd(2, 12), 25);
		case 10:
			return facteur(choice([2, 3, 4, 5, 6, 10, 12, 15, 20, 30]), 60);
		case 11: {
			const b = choice([10, 20, 30, 40, 100, 200, 300]),
				op = choice(['+', '-']);
			const a = op === '-' ? rnd(b + 20, 600) : rnd(120, 500);
			return op === '+' ? add(a, b) : sub(a, b);
		}
		case 12:
			return mul(rnd(2, 40), choice([10, 100]));
		case 13:
			return mul(rnd(3, 15), choice([4, 8]));
		case 14:
			return mul(rnd(2, 12), choice([20, 30, 40]));
		case 15:
			return mul(rnd(3, 9), choice(CIBLES_DECOMPO_MULT));
		// ---- CM1 (#241) ----
		case 16:
			// Multiples de 50 : 50×2 → 50×12 (clone CM1 des multiples de 25).
			return mul(choice(FACTEURS_MULTIPLES_50), 50);
		case 17:
			// Diviser par 10 OU par 100 : quotient ENTIER garanti (dividende = multiple
			// exact tiré dans la plage), jamais de reste ni de virgule.
			return choice([10, 100]) === 10
				? div(choice(DIVIDENDES_DIV_10), 10)
				: div(choice(DIVIDENDES_DIV_100), 100);
	}
}
export function bilanBlocks(nbQ: number) {
	const blocks: { num: number; id: string; theme: string; ops: Item[] }[] = [];
	for (const lesson of LESSONS) {
		const k: string[] = [],
			ops: Item[] = [];
		let t = 0;
		while (ops.length < nbQ && t < 300) {
			const o = bilanQ(lesson.num)!,
				key = commKey(o.text);
			if (!k.includes(key)) {
				k.push(key);
				ops.push(o);
			}
			t++;
		}
		blocks.push({ num: lesson.num, id: lesson.id, theme: THEMES[lesson.num], ops });
	}
	return blocks;
}
/* Les bilans personnalisés multi-matières (sélection libre de leçons) sont
   construits par src/core/build.ts (bilanBlocksForIds / buildFichesForIds),
   qui aiguille math vs autres matières. */
/* numero = libellé ; le bloc temps total est print-only */
export function bilanHTML(numero: number) {
	// Un seul contexte pour tout le document : le compteur d'id est partagé entre les
	// blocs (ids uniques dans la page) ; seule la leçon courante change bloc par bloc.
	const ctx = createRenderContext();
	const blocks = bilanBlocks(3);
	const cells = blocks
		.map((b) => {
			const ops = withLessonId(ctx, b.id, () =>
				b.ops.map((o) => `<div class="bop">${renderItem(o, ctx)}</div>`).join(''),
			);
			return `<div class="bloc"><span class="blab">M${b.num}.</span> <span class="btheme">${b.theme}</span>${ops}</div>`;
		})
		.join('');
	return `<div class="page">
    <p class="bilan-title">Bilan express ${numero} — toutes les leçons</p>
    <p class="bilan-sub">3 calculs par leçon · objectif : environ 15 minutes.
       <span class="print-only">Prénom : __________   Date : ________</span></p>
    <p class="bilan-temps print-only">Temps total : ______ min</p>
    <div class="bilan-grid">${cells}</div>
    <p class="foot print-only">Ludaskia</p>
  </div>`;
}

/* Pagination « écran » d'un ensemble de fiches (3 par bloc), utilisée par le
   bilan personnalisé interactif. L'impression a sa propre pagination
   (fichesPagesForIds, 2 par A4). */
export function fichesPagesHTML(fiches: string[]) {
	const perPage = 3;
	const pages = [];
	for (let i = 0; i < fiches.length; i += perPage) {
		pages.push(
			`<div class="page">${fiches.slice(i, i + perPage).join('')}<p class="foot print-only">Ludaskia</p></div>`,
		);
	}
	return pages.join('');
}

/* ============================================================
   Impression CONTEXTUELLE (issue #40)
   Un PrintScope décrit quoi imprimer ; buildPrintableDOM s'appuie sur le
   pipeline générique (buildLessonFiche / bilanBlocksForIds), donc TOUTES les
   matières (maths + conjugaison), pas seulement le calcul mental.
   ============================================================ */
export interface PrintScope {
	title: string; // titre de la page de garde
	lessonIds: string[]; // leçons à imprimer (toutes matières)
	kind: 'fiches' | 'bilan'; // entraînement vs évaluation
	nbQ?: number; // questions par leçon pour un bilan (défaut 3)
	corrige?: boolean; // #41 : ajouter un corrigé (mêmes items, réponses révélées)
	// #234 : niveau de calibrage forcé (impression au niveau d'un profil consulté par
	// l'encadrant). Absent = niveau effectif du profil/niveau ACTIF (comportement usuel).
	level?: SchoolLevel;
}

// Au-delà de ce volume, on prévient (gros PDF) et on suggère l'impression par catégorie.
const PRINT_PAGES_WARN = 20;
// Leçons à lignes longues : elles occupent leur propre page à l'impression.
const LONG_FICHE_LESSONS = new Set(['math-decompo-60', 'math-decomposer-multiplication']);

/* Page de garde dynamique : titre du périmètre, nombre réel de fiches/leçons,
   consigne générique (« je prends le temps qu'il me faut »). Pas de « 15
   ateliers » ni « je calcule de tête » codés en dur. */
export function coverHTML(scope: PrintScope): string {
	const n = scope.lessonIds.length;
	const sousTitre =
		scope.kind === 'bilan'
			? `Bilan · ${n} leçon${n > 1 ? 's' : ''}`
			: `Fiches d'entraînement · ${n} fiche${n > 1 ? 's' : ''}`;
	const warn =
		n >= PRINT_PAGES_WARN
			? `<p class="cover-warn">Beaucoup de pages : tu peux aussi imprimer une catégorie à la fois.</p>`
			: '';
	return `<div class="page cover print-only">
    <div class="big">Ludaskia</div>
    <div class="tagline">${escapeHTML(scope.title)}</div>
    <div class="cover-sub">${sousTitre}</div>
    <div class="idbox"><div>Prénom : ______________________</div><div>Date : ______________________</div></div>
    <p class="consigne">Je prends le temps qu'il me faut. Si je bloque, je passe et j'y reviens à la fin. Bon travail !</p>
    ${warn}
  </div>`;
}

/* Fiches paginées pour l'impression : 2 par A4, les leçons « longues » seules.
   `level` (optionnel) force le calibrage (impression au niveau d'un profil consulté, #234). */
function fichesPagesForIds(
	lessonIds: string[],
	level: SchoolLevel | undefined,
	ctx: RenderContext,
): string {
	const pages: string[] = [];
	let cur: string[] = [];
	const flush = () => {
		if (cur.length) {
			pages.push(`<div class="page">${cur.join('')}<p class="foot print-only">Ludaskia</p></div>`);
			cur = [];
		}
	};
	for (const id of lessonIds) {
		const fiche = buildLessonFiche(id, level, ctx);
		if (LONG_FICHE_LESSONS.has(id)) {
			flush();
			pages.push(`<div class="page">${fiche}<p class="foot print-only">Ludaskia</p></div>`);
			continue;
		}
		cur.push(fiche);
		if (cur.length >= 2) flush();
	}
	flush();
	return pages.join('');
}

/* Bilan imprimable multi-matières : nbQ questions par leçon, mise en page grille. */
function bilanPrintHTML(scope: PrintScope, ctx: RenderContext): string {
	const nbQ = scope.nbQ ?? 3;
	const blocks = bilanBlocksForIds(scope.lessonIds, nbQ, scope.level);
	const cells = blocks
		.map((b) => {
			const ops = withLessonId(ctx, b.id, () =>
				b.ops.map((o) => `<div class="bop">${renderItem(o, ctx)}</div>`).join(''),
			);
			// Bloc de QCM imprimé (#289) : consigne d'action « Coche… » sous le thème (le
			// bilan n'a pas de consigne par leçon, contrairement à la fiche).
			const isQcm = b.ops.some(estItemQcm);
			const action = isQcm ? `<span class="bloc-consigne">Coche la bonne réponse.</span>` : '';
			return `<div class="bloc"><span class="btheme">${escapeHTML(b.theme)}</span>${action}${ops}</div>`;
		})
		.join('');
	return `<div class="page">
    <p class="bilan-title">${escapeHTML(scope.title)}</p>
    <p class="bilan-sub">${nbQ} question${nbQ > 1 ? 's' : ''} par leçon · ${blocks.length} leçon${blocks.length > 1 ? 's' : ''}
       <span class="print-only">Prénom : __________   Date : ________</span></p>
    <div class="bilan-grid">${cells}</div>
    <p class="foot print-only">Ludaskia</p>
  </div>`;
}

/* Page de garde du corrigé (#41) : sépare nettement les réponses (copie du parent)
   de la feuille de l'enfant. Pas de cartouche prénom/date. */
function corrigeCoverHTML(scope: PrintScope): string {
	const n = scope.lessonIds.length;
	const sousTitre =
		scope.kind === 'bilan'
			? `Réponses du bilan · ${n} leçon${n > 1 ? 's' : ''}`
			: `Réponses des fiches · ${n} fiche${n > 1 ? 's' : ''}`;
	return `<div class="page cover cover-corrige print-only">
    <div class="big">Corrigé</div>
    <div class="tagline">${escapeHTML(scope.title)}</div>
    <div class="cover-sub">${sousTitre}</div>
    <p class="consigne">Les bonnes réponses sont indiquées. À garder par le parent pour la correction.</p>
  </div>`;
}

/* Document imprimable pour un périmètre donné. Page de garde dynamique, sauf
   pour une fiche d'une seule leçon. Jamais de bilan récap collé aux fiches :
   « fiches » et « bilan » sont deux documents distincts (kind).
   Chaque corps est rendu dans un contexte d'impression FRAIS et local (#352,
   printMode #289 : QCM en cases à cocher, zone-réponse garantie, consignes-crayon) :
   aucun état de module n'est posé ni à retirer, donc l'écran n'en hérite jamais. */
export function buildPrintableDOM(scope: PrintScope): string {
	const single = scope.lessonIds.length === 1;
	const cover = single ? '' : coverHTML(scope);
	// Un corps (fiches ou bilan) dans son contexte d'impression : compteur d'id à 0,
	// printMode actif, corrigeMode selon la passe. Les items sont régénérés à chaque appel.
	const renderBody = (corrige: boolean): string => {
		const ctx = createRenderContext({ printMode: true, corrigeMode: corrige });
		return scope.kind === 'bilan'
			? bilanPrintHTML(scope, ctx)
			: fichesPagesForIds(scope.lessonIds, scope.level, ctx);
	};
	if (!scope.corrige) return cover + renderBody(false);
	// Corrigé (#41) : on rend le corps DEUX fois — feuille vierge puis réponses révélées —
	// sur les MÊMES items. Le pipeline régénérant aléatoirement, on fixe une graine commune
	// (withSeed) pour que le corrigé corresponde à la feuille.
	const seed = randomSeed();
	const blank = withSeed(seed, () => renderBody(false));
	const corrige = withSeed(seed, () => corrigeCoverHTML(scope) + renderBody(true));
	return cover + blank + corrige;
}
