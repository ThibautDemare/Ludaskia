/* ============================================================
   LE GÉNÉRATEUR DÉTERMINISTE DES TESTS — sa propre spec.

   `tests/aleatoire.ts` remplace un LCG recopié dans huit fichiers, dont la
   première sortie était une fonction AFFINE de la graine (corrélation r = 1,0000
   sur les graines 1 à 1000). L'en-tête du helper raconte le diagnostic ; ce
   fichier-ci le MESURE, pour que la prochaine personne n'ait pas à le refaire à
   la main et pour qu'un remplacement futur du générateur ne puisse pas ramener
   le défaut sans faire rougir la suite.

   Deux précautions de méthode :

   1. **Le mélange vient de `src/`**, pas d'une copie locale. Ce qu'on veut
      garantir n'est pas « ce générateur a de bonnes propriétés dans l'absolu »,
      c'est « le mélange RÉELLEMENT employé par le dépôt, alimenté par ce
      générateur, atteint toutes ses permutations ». Une réimplémentation locale
      de Fisher-Yates prouverait la première phrase et pas la seconde.

   2. **Le LCG d'avant est gardé comme TÉMOIN**, et on exige qu'il ÉCHOUE aux
      mêmes contrôles. Sans lui, rien n'empêcherait d'affaiblir un seuil jusqu'à
      ce qu'il ne discrimine plus rien : un test de qualité d'aléa qui accepte
      tout est vert pour toujours et ne garde rien. Le témoin n'est pas là pour
      figer le défaut, il est là pour prouver que la mesure le voit.

   Le χ² est calculé sur 10 paniers, donc 9 degrés de liberté : le seuil à 0,1 %
   vaut 27,88. Toutes les valeurs sont DÉTERMINISTES (graines fixes), donc ces
   contrôles ne peuvent pas devenir intermittents.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { tirage } from './aleatoire';
import { melanger } from '../src/core/jeux/grille-mots';

/** Le LCG que huit fichiers recopiaient. Gardé ICI et nulle part ailleurs, au
    seul titre de contre-exemple mesuré. */
function lcgHistorique(graine: number): () => number {
	let s = graine >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** Seuil du χ² à 9 degrés de liberté, risque 0,1 %. Volontairement très
    permissif : on cherche un générateur CASSÉ, pas un défaut statistique fin. */
const SEUIL_CHI2 = 27.88;

/** Combien de tirages tombent dans chacun des dix déciles de [0, 1[. */
function deciles(valeurs: readonly number[]): number[] {
	const paniers = new Array<number>(10).fill(0);
	for (const v of valeurs) paniers[Math.min(9, Math.floor(v * 10))]++;
	return paniers;
}

function chi2(paniers: readonly number[], total: number): number {
	const attendu = total / paniers.length;
	return paniers.reduce((s, c) => s + (c - attendu) ** 2 / attendu, 0);
}

/** La k-ième sortie (k = 1 pour la première) de chaque graine de 1 à `graines`. */
function kiemeSortie(gen: (g: number) => () => number, k: number, graines: number): number[] {
	const out: number[] = [];
	for (let g = 1; g <= graines; g++) {
		const r = gen(g);
		let v = 0;
		for (let i = 0; i < k; i++) v = r();
		out.push(v);
	}
	return out;
}

interface CouvertureMelange {
	permutations: number;
	attendues: number;
	tetes: number[];
	chaqueElementPasseParToutesLesPositions: boolean;
}

/** Ce que `melanger` produit sur une liste de `n` éléments, pour les graines 1 à
    `graines` : combien de permutations distinctes, qui se retrouve en tête, et
    si chaque élément atteint chaque position. */
function couverture(
	gen: (g: number) => () => number,
	n: number,
	graines: number,
): CouvertureMelange {
	const source = Array.from({ length: n }, (_, i) => i);
	const vues = new Set<string>();
	const tetes = new Array<number>(n).fill(0);
	const positions = Array.from({ length: n }, () => new Set<number>());
	for (let g = 1; g <= graines; g++) {
		const p = melanger(source, gen(g));
		vues.add(p.join(','));
		tetes[p[0]]++;
		p.forEach((x, i) => positions[x].add(i));
	}
	const attendues = Array.from({ length: n }, (_, i) => i + 1).reduce((a, b) => a * b, 1);
	return {
		permutations: vues.size,
		attendues,
		tetes,
		chaqueElementPasseParToutesLesPositions: positions.every((s) => s.size === n),
	};
}

describe('tirage — déterminisme, ce pour quoi il est injecté', () => {
	it('rend la même suite pour la même graine', () => {
		// Sans ça, plus aucun invariant échantillonné n'est rejouable : un échec sur
		// le tirage 137 resterait un échec qu'on ne sait pas reproduire.
		const a = Array.from({ length: 30 }, tirage(4242));
		const suite = tirage(4242);
		expect(Array.from({ length: 30 }, () => suite())).toEqual(a);
	});

	it('donne des suites DIFFÉRENTES à des graines différentes, même voisines', () => {
		/* Le défaut du LCG était exactement là : des graines voisines donnaient des
		   premières sorties voisines. On prend les 5 premières sorties de 5000
		   graines consécutives — aucune collision. */
		const vues = new Set<string>();
		for (let g = 1; g <= 5000; g++) {
			const r = tirage(g);
			vues.add([r(), r(), r(), r(), r()].join('|'));
		}
		expect(vues.size).toBe(5000);
	});

	it('reste dans [0, 1[ sur 200 000 tirages', () => {
		/* La borne haute compte pour de vrai : `melanger` doit border un générateur
		   qui rendrait 1 (sinon l'index sort du tableau), mais un générateur qui
		   rend 1 est un générateur cassé, pas un cas à rattraper. */
		const r = tirage(1);
		let min = 1;
		let max = 0;
		for (let i = 0; i < 200_000; i++) {
			const v = r();
			if (v < min) min = v;
			if (v > max) max = v;
		}
		expect(min).toBeGreaterThanOrEqual(0);
		expect(max).toBeLessThan(1);
	});
});

describe('tirage — la PREMIÈRE sortie balaie tout l’intervalle', () => {
	/* Le cœur du défaut corrigé. Fisher-Yates décide la DERNIÈRE position sur le
	   tout premier appel : une première sortie coincée dans un cinquième de
	   l'intervalle effondre la permutation, quelle que soit la qualité des sorties
	   suivantes. */

	it('occupe les dix déciles sur les graines 1 à 200', () => {
		const paniers = deciles(kiemeSortie(tirage, 1, 200));
		expect(
			paniers.filter((c) => c === 0),
			`déciles vides : ${paniers.join(',')}`,
		).toEqual([]);
		expect(chi2(paniers, 200)).toBeLessThan(SEUIL_CHI2);
	});

	it('n’est pas corrélée à la graine', () => {
		// Pearson entre la graine et sa première sortie, graines 1 à 1000. Le LCG
		// donnait exactement 1 : sa première sortie ÉTAIT la graine, translatée.
		const n = 1000;
		const y = kiemeSortie(tirage, 1, n);
		let sx = 0;
		let sy = 0;
		let sxy = 0;
		let sxx = 0;
		let syy = 0;
		for (let i = 0; i < n; i++) {
			const x = i + 1;
			sx += x;
			sy += y[i];
			sxy += x * y[i];
			sxx += x * x;
			syy += y[i] * y[i];
		}
		const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
		expect(Math.abs(r)).toBeLessThan(0.1);
	});

	it('et les douze premières sorties se valent toutes', () => {
		// Pas seulement la première : un générateur qui « démarre mal » sur trois
		// tirages casserait un mélange de quatre éléments tout autant.
		for (let k = 1; k <= 12; k++) {
			const paniers = deciles(kiemeSortie(tirage, k, 200));
			expect(chi2(paniers, 200), `sortie n° ${k} : ${paniers.join(',')}`).toBeLessThan(SEUIL_CHI2);
		}
	});

	it('tient aussi sur un flux long', () => {
		const r = tirage(1);
		const paniers = deciles(Array.from({ length: 100_000 }, () => r()));
		expect(chi2(paniers, 100_000)).toBeLessThan(SEUIL_CHI2);
	});
});

describe('tirage — le mélange du dépôt atteint TOUTES ses permutations', () => {
	/* Les tailles testées sont celles que le dépôt mélange vraiment : les motifs
	   d'une taille de mots casés (3 et 4), les jeux éligibles d'un type (4 à 5).
	   Au-delà, la couverture complète relève du collectionneur de vignettes et
	   pas du générateur — en 6 éléments, 5000 graines laissent en moyenne 0,7
	   permutation dehors, ce qui ne dit rien de la qualité de l'aléa. */
	const CAS: [number, number][] = [
		[2, 200],
		[3, 200],
		[4, 200],
		[5, 1000],
	];

	it.each(CAS)('liste de %i éléments : les %i graines les couvrent toutes', (n, graines) => {
		const c = couverture(tirage, n, graines);
		expect(c.permutations, `${c.permutations} permutations sur ${c.attendues}`).toBe(c.attendues);
	});

	it.each(CAS)('liste de %i éléments : chaque élément passe par chaque position', (n, graines) => {
		/* Formulation la plus proche de l'usage réel : un appelant qui prend la TÊTE
		   du mélange (`choisirRemplissage`) ou ses `k` premiers (`proposerJeux`) ne
		   doit jamais avoir d'élément inatteignable. Avec le LCG, le premier élément
		   d'une liste de trois ne se retrouvait jamais en tête — donc un motif sur
		   trois n'était jamais servi. */
		const c = couverture(tirage, n, graines);
		expect(c.chaqueElementPasseParToutesLesPositions, `têtes : ${c.tetes.join(',')}`).toBe(true);
		expect(
			c.tetes.filter((t) => t === 0),
			`têtes : ${c.tetes.join(',')}`,
		).toEqual([]);
	});
});

describe('témoin — le LCG d’avant échoue à ces mêmes mesures', () => {
	/* Ce bloc ne garde pas le défaut, il garde la MESURE : il prouve que les
	   contrôles ci-dessus discriminent. Si quelqu'un remplace un jour le
	   générateur et desserre un seuil au passage, ces trois attentes tombent — et
	   c'est le signal qu'on ne mesure plus rien. */

	it('sa première sortie tient dans deux déciles sur dix (χ² ≈ 1210)', () => {
		const valeurs = kiemeSortie(lcgHistorique, 1, 200);
		const paniers = deciles(valeurs);
		expect(Math.min(...valeurs)).toBeGreaterThan(0.23);
		expect(Math.max(...valeurs)).toBeLessThan(0.32);
		expect(paniers.filter((c) => c > 0)).toHaveLength(2);
		expect(chi2(paniers, 200)).toBeGreaterThan(SEUIL_CHI2);
	});

	it('mélanger deux éléments donne toujours la même permutation', () => {
		const c = couverture(lcgHistorique, 2, 200);
		expect(c.permutations).toBe(1);
	});

	it('et sur trois éléments, le premier n’arrive jamais en tête', () => {
		const c = couverture(lcgHistorique, 3, 200);
		expect(c.tetes[0]).toBe(0);
		expect(c.permutations).toBeLessThan(6);
	});
});
