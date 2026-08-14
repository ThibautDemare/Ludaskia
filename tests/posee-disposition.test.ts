/* ============================================================
   Disposition d'une opération posée (`dispositionPosee`, extraite en #490).
   ------------------------------------------------------------
   La même disposition est rendue DEUX fois : la grille jouable (champs corrigés
   cellule par cellule, déjà couverte par `logic.test.ts` — « Calcul : opérations
   posées ») et la grille de DÉMONSTRATION du panneau d'étayage, remplie une colonne
   à la fois. Ce fichier éprouve donc la disposition elle-même, sans une ligne de HTML :
   c'est elle qui garantit que les deux grilles s'alignent à l'identique — un enfant en
   difficulté ne doit pas réapprendre un format visuel en plus de la méthode.

   Attendus dérivés de la façon de POSER une opération à l'école (alignement à droite
   sur les unités, retenues au-dessus, trait, résultat en dessous ; pour un
   multiplicateur à deux chiffres : deux produits partiels, le 0 du décalage FOURNI, une
   seule rangée de retenues), calculés à la main opération par opération.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	dispositionPosee,
	type CellulePosee,
	type DispositionPosee,
	type PosedSpec,
	type RangeePosee,
} from '../src/core/items';

/* ---------- Outils de lecture ---------- */
const roles = (r: RangeePosee): string[] => r.cellules.map((c) => c.role);

/** Ce que la cellule AFFICHE (chiffre donné, chiffre à trouver, signe, 0 du décalage). */
function texte(c: CellulePosee): string {
	switch (c.role) {
		case 'chiffre':
		case 'saisie':
			return c.chiffre;
		case 'signe':
			return c.texte;
		case 'zeroDecalage':
			return '0';
		default:
			return '';
	}
}
const ligneTexte = (r: RangeePosee): string => r.cellules.map(texte).join('');

/** Les chiffres à trouver d'une rangée, de gauche à droite. */
const saisies = (r: RangeePosee): string =>
	r.cellules
		.filter((c) => c.role === 'saisie')
		.map(texte)
		.join('');

/** Les cellules du RÉSULTAT final (les seules taguées pour le journal d'erreurs),
    relues dans l'ordre de leurs positions. */
function resultatAssemble(d: DispositionPosee): string {
	const cells: { pos: number; chiffre: string }[] = [];
	for (const r of d.rangees)
		for (const c of r.cellules)
			if (c.role === 'saisie' && c.resultat)
				cells.push({ pos: c.resultat.pos, chiffre: c.chiffre });
	return cells
		.sort((a, b) => a.pos - b.pos)
		.map((c) => c.chiffre)
		.join('');
}

const rangeesDeSaisie = (d: DispositionPosee): RangeePosee[] =>
	d.rangees.filter((r) => r.cellules.some((c) => c.role === 'saisie'));
const compteRole = (d: DispositionPosee, role: CellulePosee['role']): number =>
	d.rangees.reduce((n, r) => n + r.cellules.filter((c) => c.role === role).length, 0);
const nb = (s: PosedSpec) => `${s.a} ${s.op} ${s.b}`;

/* ============================================================
   1. ADDITION / SOUSTRACTION / MULTIPLICATION PAR UN CHIFFRE
   ============================================================ */
describe('dispositionPosee — opération à une seule ligne', () => {
	it('addition : retenues, les deux termes, le trait, le résultat à trouver', () => {
		// 347 + 285 = 632 → 3 colonnes de chiffres (+ la colonne du signe).
		const d = dispositionPosee({ op: '+', a: 347, b: 285 });
		expect(d.colonnes).toBe(3);
		expect(d.operation).toBe('347 + 285');
		expect(d.resultat).toBe(632);
		expect(d.rangees.length).toBe(5);
		// Ordre des rangées : les retenues AU-DESSUS des termes, le trait avant le résultat.
		expect(d.rangees[0].cellules.every((c, i) => c.role === (i === 0 ? 'vide' : 'retenue'))).toBe(
			true,
		);
		expect(roles(d.rangees[1])).toEqual(['vide', 'chiffre', 'chiffre', 'chiffre']);
		expect(ligneTexte(d.rangees[1])).toBe('347'); // le 1er terme est DONNÉ
		expect(roles(d.rangees[2])).toEqual(['signe', 'chiffre', 'chiffre', 'chiffre']);
		expect(ligneTexte(d.rangees[2])).toBe('+285');
		expect(d.rangees[3].barre).toBe(true);
		expect(d.rangees[3].cellules).toEqual([]);
		expect(roles(d.rangees[4])).toEqual(['vide', 'saisie', 'saisie', 'saisie']);
		expect(saisies(d.rangees[4])).toBe('632');
		// Une seule rangée de retenues dans toute la grille.
		expect(compteRole(d, 'retenue')).toBe(3);
		expect(compteRole(d, 'zeroDecalage')).toBe(0);
	});

	it('les cellules du résultat portent leur position, 0 = le chiffre le plus à GAUCHE', () => {
		const d = dispositionPosee({ op: '+', a: 347, b: 285 });
		const cells = d.rangees[4].cellules.filter((c) => c.role === 'saisie');
		expect(cells.map((c) => (c.role === 'saisie' ? c.resultat?.pos : undefined))).toEqual([
			0, 1, 2,
		]);
		expect(resultatAssemble(d)).toBe('632');
	});

	it('une retenue finale élargit la grille d’une colonne', () => {
		// 999 + 999 = 1998 : 4 colonnes alors que les deux termes n'en ont que 3 → les termes
		// sont alignés à DROITE, la colonne de gauche reste vide chez eux.
		const d = dispositionPosee({ op: '+', a: 999, b: 999 });
		expect(d.colonnes).toBe(4);
		expect(roles(d.rangees[1])).toEqual(['vide', 'vide', 'chiffre', 'chiffre', 'chiffre']);
		expect(ligneTexte(d.rangees[1])).toBe('999');
		expect(saisies(d.rangees[4])).toBe('1998');
		expect(resultatAssemble(d)).toBe('1998');
	});

	it('soustraction : le signe « − » typographique et 3 colonnes', () => {
		// 503 − 287 = 216.
		const d = dispositionPosee({ op: '-', a: 503, b: 287 });
		expect(d.colonnes).toBe(3);
		expect(d.operation).toBe('503 − 287');
		expect(ligneTexte(d.rangees[2])).toBe('−287');
		expect(saisies(d.rangees[4])).toBe('216');
	});

	it('résultat plus court que le haut : seules les colonnes du résultat ont une case', () => {
		// 105 − 100 = 5 : la grille garde 3 colonnes (les opérandes), mais le résultat n'a
		// qu'UNE case, dans la colonne des unités — pas de zéros de tête à faire écrire.
		const d = dispositionPosee({ op: '-', a: 105, b: 100 });
		expect(d.colonnes).toBe(3);
		expect(roles(d.rangees[4])).toEqual(['vide', 'vide', 'vide', 'saisie']);
		expect(saisies(d.rangees[4])).toBe('5');
		expect(compteRole(d, 'saisie')).toBe(1);
		expect(resultatAssemble(d)).toBe('5');
	});

	it('multiplication par un chiffre : même forme, signe « × », une seule ligne à trouver', () => {
		// 123 × 4 = 492.
		const d = dispositionPosee({ op: 'x', a: 123, b: 4 });
		expect(d.colonnes).toBe(3);
		expect(d.operation).toBe('123 × 4');
		expect(d.rangees.length).toBe(5);
		expect(ligneTexte(d.rangees[2])).toBe('×4');
		expect(roles(d.rangees[2])).toEqual(['signe', 'vide', 'vide', 'chiffre']);
		expect(saisies(d.rangees[4])).toBe('492');
		expect(rangeesDeSaisie(d).length).toBe(1);
		expect(compteRole(d, 'zeroDecalage')).toBe(0);
	});
});

/* ============================================================
   2. MULTIPLICATION PAR UN NOMBRE À DEUX CHIFFRES
   ============================================================ */
describe('dispositionPosee — multiplication à deux produits partiels', () => {
	// 47 × 26 = 1222 ; pp1 = 47 × 6 = 282 ; pp2 = 47 × 2 = 94 (suivi du 0 du décalage).
	const spec: PosedSpec = { op: 'x', a: 47, b: 26 };
	const d = dispositionPosee(spec);

	it('largeur = celle du résultat, et deux traits', () => {
		expect(d.colonnes).toBe(4);
		expect(d.resultat).toBe(1222);
		expect(d.rangees.filter((r) => r.barre).length).toBe(2);
		expect(d.rangees.length).toBe(8);
	});

	it('ordre des rangées : opérandes, trait, retenues, les deux produits partiels, trait, somme', () => {
		expect(ligneTexte(d.rangees[0])).toBe('47');
		expect(ligneTexte(d.rangees[1])).toBe('×26');
		expect(d.rangees[2].barre).toBe(true);
		// #307 : la rangée de retenues est celle de l'ADDITION finale, donc AU-DESSUS de ses
		// opérandes (les produits partiels), pas juste avant la somme.
		expect(roles(d.rangees[3])).toEqual(['vide', 'retenue', 'retenue', 'retenue', 'retenue']);
		expect(saisies(d.rangees[4])).toBe('282');
		expect(saisies(d.rangees[5])).toBe('94');
		expect(d.rangees[6].barre).toBe(true);
		expect(saisies(d.rangees[7])).toBe('1222');
		// Une seule rangée de retenues pour toute la grille (celles des produits partiels se
		// gardent dans la tête, les multiplicateurs étant calibrés doux).
		expect(d.rangees.filter((r) => r.cellules.some((c) => c.role === 'retenue')).length).toBe(1);
		expect(compteRole(d, 'retenue')).toBe(4);
	});

	it('le 0 du décalage est FOURNI, dans la colonne des unités du 2ᵉ produit partiel', () => {
		expect(compteRole(d, 'zeroDecalage')).toBe(1);
		const pp2 = d.rangees[5];
		expect(roles(pp2)).toEqual(['signe', 'vide', 'saisie', 'saisie', 'zeroDecalage']);
		// Dernière cellule de la rangée = colonne des unités : c'est ce 0 qui décale la ligne.
		expect(pp2.cellules[pp2.cellules.length - 1].role).toBe('zeroDecalage');
		// Le « + » devant le 2ᵉ produit partiel signale l'addition des deux lignes (#300/#307).
		expect(texte(pp2.cellules[0])).toBe('+');
	});

	it('seules les cellules du RÉSULTAT sont taguées (journal d’erreurs #391)', () => {
		const taguees = (r: RangeePosee) =>
			r.cellules.filter((c) => c.role === 'saisie' && c.resultat).length;
		expect(taguees(d.rangees[4])).toBe(0); // produit partiel : à trouver, mais pas agrégé
		expect(taguees(d.rangees[5])).toBe(0);
		expect(taguees(d.rangees[7])).toBe(4);
		expect(resultatAssemble(d)).toBe('1222');
		expect(compteRole(d, 'saisie')).toBe(3 + 2 + 4); // 282 + 94 + 1222
	});

	it('les produits partiels, replacés par le décalage, font le résultat', () => {
		const pp1 = Number(saisies(d.rangees[4]));
		const pp2 = Number(saisies(d.rangees[5]));
		expect(pp1 + pp2 * 10).toBe(d.resultat); // 282 + 940 = 1222
	});

	it('multiplicateur en 1x : le 2ᵉ produit partiel occupe toute la largeur', () => {
		// 24 × 13 = 312 ; pp1 = 72, pp2 = 24 + le 0 fourni → la rangée est pleine.
		const petit = dispositionPosee({ op: 'x', a: 24, b: 13 });
		expect(petit.colonnes).toBe(3);
		expect(roles(petit.rangees[5])).toEqual(['signe', 'saisie', 'saisie', 'zeroDecalage']);
		expect(saisies(petit.rangees[4])).toBe('72');
		expect(saisies(petit.rangees[5])).toBe('24');
		expect(saisies(petit.rangees[7])).toBe('312');
		expect(Number(saisies(petit.rangees[4])) + Number(saisies(petit.rangees[5])) * 10).toBe(312);
	});
});

/* ============================================================
   3. INVARIANTS DE FORME (toutes les opérations du calibrage)
   ============================================================ */
describe('dispositionPosee — invariants de forme', () => {
	/* Bornes réelles de data/maths/posee.ts : 2-3 chiffres pour + et −, multiplicande
	   ≤ 3 chiffres par un chiffre, ≤ 2 chiffres par un multiplicateur à deux chiffres. */
	const specs: PosedSpec[] = [];
	for (let a = 10; a <= 999; a += 37) {
		for (let b = 10; b <= 999; b += 53) {
			specs.push({ op: '+', a, b });
			if (a >= b) specs.push({ op: '-', a, b });
		}
		for (let b = 2; b <= 9; b++) specs.push({ op: 'x', a, b });
		if (a <= 99)
			for (const b of [12, 13, 14, 15, 21, 23, 24, 25, 31, 32, 41, 51])
				specs.push({ op: 'x', a, b });
	}

	it('l’échantillon couvre les quatre formes de grille', () => {
		expect(specs.length).toBeGreaterThan(1000);
		expect(specs.some((s) => s.op === '+')).toBe(true);
		expect(specs.some((s) => s.op === '-')).toBe(true);
		expect(specs.some((s) => s.op === 'x' && s.b < 10)).toBe(true);
		expect(specs.some((s) => s.op === 'x' && s.b >= 10)).toBe(true);
	});

	it('chaque rangée occupe exactement la largeur de la grille (colonne du signe comprise)', () => {
		for (const spec of specs) {
			const d = dispositionPosee(spec);
			for (const r of d.rangees) {
				if (r.barre) expect(r.cellules, nb(spec)).toEqual([]);
				else expect(r.cellules.length, nb(spec)).toBe(d.colonnes + 1);
			}
			// La colonne du signe ne contient jamais un chiffre, et les chiffres ne débordent
			// jamais dans elle.
			for (const r of d.rangees.filter((x) => !x.barre)) {
				expect(['vide', 'signe'], nb(spec)).toContain(r.cellules[0].role);
			}
		}
	});

	it('exactement une rangée de retenues, pleine, et jamais de retenue ailleurs', () => {
		for (const spec of specs) {
			const d = dispositionPosee(spec);
			const rangees = d.rangees.filter((r) => r.cellules.some((c) => c.role === 'retenue'));
			expect(rangees.length, nb(spec)).toBe(1);
			expect(rangees[0].cellules.filter((c) => c.role === 'retenue').length, nb(spec)).toBe(
				d.colonnes,
			);
		}
	});

	it('les cellules du résultat recomposent le résultat, et lui seul est tagué', () => {
		for (const spec of specs) {
			const d = dispositionPosee(spec);
			const attendu =
				spec.op === '+' ? spec.a + spec.b : spec.op === '-' ? spec.a - spec.b : spec.a * spec.b;
			expect(d.resultat, nb(spec)).toBe(attendu);
			expect(resultatAssemble(d), nb(spec)).toBe(String(attendu));
			// Positions uniques et contiguës (0 = le plus à gauche) : le journal d'erreurs
			// réassemble la réponse de l'enfant dans cet ordre.
			const pos = d.rangees
				.flatMap((r) => r.cellules)
				.flatMap((c) => (c.role === 'saisie' && c.resultat ? [c.resultat.pos] : []));
			expect(
				[...pos].sort((x, y) => x - y),
				nb(spec),
			).toEqual(
				String(attendu)
					.split('')
					.map((_, i) => i),
			);
		}
	});

	it('les opérandes sont DONNÉS (jamais à trouver) et alignés à droite', () => {
		for (const spec of specs) {
			const d = dispositionPosee(spec);
			const chiffres = d.rangees.filter((r) => r.cellules.some((c) => c.role === 'chiffre'));
			expect(chiffres.length, nb(spec)).toBe(2);
			expect(ligneTexte(chiffres[0]), nb(spec)).toBe(String(spec.a));
			expect(ligneTexte(chiffres[1]).replace(/^[+−×]/, ''), nb(spec)).toBe(String(spec.b));
			// Alignés à droite : le dernier chiffre d'un opérande est dans la colonne des unités.
			for (const r of chiffres) {
				expect(r.cellules[r.cellules.length - 1].role, nb(spec)).toBe('chiffre');
			}
		}
	});

	it('le 0 du décalage n’existe QUE pour un multiplicateur à deux chiffres', () => {
		for (const spec of specs) {
			const d = dispositionPosee(spec);
			const deuxChiffres = spec.op === 'x' && spec.b >= 10;
			expect(compteRole(d, 'zeroDecalage'), nb(spec)).toBe(deuxChiffres ? 1 : 0);
			expect(rangeesDeSaisie(d).length, nb(spec)).toBe(deuxChiffres ? 3 : 1);
			expect(d.rangees.filter((r) => r.barre).length, nb(spec)).toBe(deuxChiffres ? 2 : 1);
			if (!deuxChiffres) continue;
			// Les deux produits partiels, remis à leur place, font le résultat.
			const [pp1, pp2] = rangeesDeSaisie(d).map((r) => Number(saisies(r)));
			expect(pp1 + pp2 * 10, nb(spec)).toBe(d.resultat);
			expect(pp1, nb(spec)).toBe(spec.a * (spec.b % 10));
			expect(pp2, nb(spec)).toBe(spec.a * Math.floor(spec.b / 10));
		}
	});
});
