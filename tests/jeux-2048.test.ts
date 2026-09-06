/* ============================================================
   Étagère de jeux (#661) — le moteur de grille du 2048.
   Couvre le critère 15 : glissement dans les quatre directions, fusion de deux
   tuiles identiques en leur double, PAS de fusion en chaîne dans un seul
   mouvement, et fin de partie quand aucun coup n'est possible.

   Les attendus sont dérivés de la règle du jeu, pas du code : dans un coup vers
   la gauche, on traite la ligne depuis la gauche, chaque tuile ne fusionne
   qu'UNE fois, et la tuile issue d'une fusion est verrouillée jusqu'au coup
   suivant. C'est le bug classique du genre : [2,2,4] doit rendre [4,4], jamais
   [8].
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	glisser,
	ajouterTuile,
	partieFinie,
	grilleVide,
} from '../src/core/jeux/deux-mille-quarante-huit';
import type { Grille, Direction } from '../src/core/jeux/deux-mille-quarante-huit';

const DIRECTIONS: Direction[] = ['haut', 'bas', 'gauche', 'droite'];

/* Tirage déterministe (LCG), pattern de fenetre-ponderee.test.ts. */
function tirage(graine: number): () => number {
	let s = graine >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

const G = (...lignes: number[][]): Grille => lignes.map((l) => [...l]);
const somme = (g: Grille): number => g.reduce((a, l) => a + l.reduce((x, y) => x + y, 0), 0);
const tuiles = (g: Grille): number[] => g.flat().filter((v) => v !== 0);

/* Grille aléatoire plausible (beaucoup de cases vides et de doublons, pour provoquer
   les fusions). */
function grilleAleatoire(r: () => number): Grille {
	const valeurs = [0, 0, 2, 2, 4, 4, 8, 16];
	return [...Array(4)].map(() =>
		[...Array(4)].map(() => valeurs[Math.floor(r() * valeurs.length)]),
	);
}

describe('glisser — compactage et fusion (critère 15)', () => {
	it('colle les tuiles contre le bord sans rien fusionner quand elles diffèrent', () => {
		const c = glisser(G([0, 2, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'gauche');
		expect(c.grille[0]).toEqual([2, 4, 0, 0]);
		expect(c.bouge).toBe(true);
		expect(c.gain).toBe(0);
	});

	it('fusionne deux tuiles identiques en leur double', () => {
		const c = glisser(G([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'gauche');
		expect(c.grille[0]).toEqual([4, 0, 0, 0]);
		expect(c.gain).toBe(4);
	});

	it('fusionne par-dessus un trou', () => {
		const c = glisser(G([2, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'gauche');
		expect(c.grille[0]).toEqual([4, 0, 0, 0]);
		expect(c.gain).toBe(4);
	});

	it('NE FUSIONNE PAS EN CHAÎNE : [2,2,4] rend [4,4], jamais [8]', () => {
		// Le cas d'échec écrit dans le critère 15. La tuile 4 née de 2+2 est verrouillée
		// pour ce coup : elle ne se marie pas avec le 4 qui la suit.
		const c = glisser(G([2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'gauche');
		expect(c.grille[0]).toEqual([4, 4, 0, 0]);
		expect(c.gain).toBe(4); // 4 marqués, pas 12
	});

	it('ne fusionne pas non plus vers une tuile déjà en place : [4,2,2] rend [4,4]', () => {
		const c = glisser(G([4, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'gauche');
		expect(c.grille[0]).toEqual([4, 4, 0, 0]);
		expect(c.gain).toBe(4);
	});

	it('fait DEUX fusions distinctes sur une ligne de quatre tuiles égales', () => {
		const c = glisser(G([2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'gauche');
		expect(c.grille[0]).toEqual([4, 4, 0, 0]); // et surtout pas [8, 0, 0, 0]
		expect(c.gain).toBe(8); // 4 + 4
	});

	it('fusionne la paire la plus proche du bord visé', () => {
		// Vers la gauche, [2,2,2] fusionne les deux premières.
		expect(
			glisser(G([2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'gauche').grille[0],
		).toEqual([4, 2, 0, 0]);
		// Vers la droite, la même ligne fusionne les deux dernières.
		expect(
			glisser(G([0, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'droite').grille[0],
		).toEqual([0, 0, 2, 4]);
	});

	it('applique les mêmes règles en colonne (haut et bas)', () => {
		const colonne = G([2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]);
		const haut = glisser(colonne, 'haut');
		expect(haut.grille.map((l) => l[0])).toEqual([4, 4, 0, 0]);
		expect(haut.gain).toBe(4);

		const bas = glisser(G([0, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0]), 'bas');
		expect(bas.grille.map((l) => l[0])).toEqual([0, 0, 2, 4]);
		expect(bas.gain).toBe(4);
	});

	it('additionne les gains de toutes les lignes d’un même coup', () => {
		const c = glisser(G([2, 2, 0, 0], [4, 4, 0, 0], [0, 0, 0, 0], [8, 8, 0, 0]), 'gauche');
		expect(c.gain).toBe(4 + 8 + 16);
	});

	it('signale « ne bouge pas » quand le coup ne change rien', () => {
		const bloquee = G([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]);
		const c = glisser(bloquee, 'gauche');
		expect(c.bouge).toBe(false);
		expect(c.gain).toBe(0);
		expect(c.grille).toEqual(bloquee);
	});

	it('signale « ne bouge pas » sur une grille vide', () => {
		for (const dir of DIRECTIONS) {
			expect(glisser(grilleVide(), dir).bouge).toBe(false);
		}
	});

	it('ne modifie pas la grille reçue', () => {
		const g = G([2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
		const copie = G(...g);
		glisser(g, 'gauche');
		expect(g).toEqual(copie);
	});
});

describe('glisser — invariants sur un grand échantillon', () => {
	it('conserve la somme des tuiles (une fusion ne crée ni ne perd de points)', () => {
		// 2 + 2 = 4 : la somme des valeurs est inchangée par un glissement. Une somme qui
		// bouge trahit une tuile perdue ou dupliquée.
		const r = tirage(4242);
		for (let i = 0; i < 400; i++) {
			const g = grilleAleatoire(r);
			for (const dir of DIRECTIONS) {
				expect(somme(glisser(g, dir).grille)).toBe(somme(g));
			}
		}
	});

	it('ne crée jamais de valeur hors puissances de deux, et ne perd jamais de tuile en trop', () => {
		const r = tirage(31);
		for (let i = 0; i < 400; i++) {
			const g = grilleAleatoire(r);
			for (const dir of DIRECTIONS) {
				const apres = glisser(g, dir).grille;
				expect(apres.length).toBe(4);
				for (const ligne of apres) expect(ligne.length).toBe(4);
				for (const v of tuiles(apres)) {
					expect(v).toBeGreaterThanOrEqual(2);
					expect(Number.isInteger(Math.log2(v))).toBe(true);
				}
				// Un coup ne peut que réduire le nombre de tuiles (fusions), jamais l'augmenter :
				// l'apparition d'une nouvelle tuile est le rôle d'ajouterTuile.
				expect(tuiles(apres).length).toBeLessThanOrEqual(tuiles(g).length);
			}
		}
	});

	it('compacte toujours contre le bord visé (aucun trou avant une tuile)', () => {
		const r = tirage(7);
		for (let i = 0; i < 200; i++) {
			const g = grilleAleatoire(r);
			const gauche = glisser(g, 'gauche').grille;
			for (const ligne of gauche) {
				const premierVide = ligne.indexOf(0);
				if (premierVide >= 0) {
					expect(ligne.slice(premierVide).every((v) => v === 0)).toBe(true);
				}
			}
			const droite = glisser(g, 'droite').grille;
			for (const ligne of droite) {
				const dernierVide = ligne.lastIndexOf(0);
				if (dernierVide >= 0) {
					expect(ligne.slice(0, dernierVide + 1).every((v) => v === 0)).toBe(true);
				}
			}
		}
	});

	it('« bouge » dit exactement si la grille a changé', () => {
		const r = tirage(555);
		for (let i = 0; i < 400; i++) {
			const g = grilleAleatoire(r);
			for (const dir of DIRECTIONS) {
				const c = glisser(g, dir);
				expect(c.bouge).toBe(JSON.stringify(c.grille) !== JSON.stringify(g));
			}
		}
	});
});

describe('partieFinie (critère 15 : la partie se termine)', () => {
	it('est vraie quand la grille est pleine et qu’aucune fusion n’est possible', () => {
		expect(partieFinie(G([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]))).toBe(true);
	});

	it('est fausse tant qu’il reste une case vide', () => {
		// Une seule case libre suffit : au moins une direction fait glisser une tuile dedans.
		// (La grille ENTIÈREMENT vide est un état dégénéré qui n'existe pas en jeu — une
		// tuile apparaît à chaque coup — et l'issue ne le tranche pas : non asservi ici.)
		expect(partieFinie(G([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]))).toBe(false);
		expect(partieFinie(G([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 0, 4], [4, 2, 4, 2]))).toBe(false);
	});

	it('est fausse si une fusion reste possible, en ligne comme en colonne', () => {
		// Deux 2 côte à côte sur la dernière ligne.
		expect(partieFinie(G([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 2, 2]))).toBe(false);
		// Deux 4 l'un sous l'autre en première colonne.
		expect(partieFinie(G([4, 2, 4, 2], [4, 4, 2, 4], [2, 2, 4, 2], [4, 4, 2, 4]))).toBe(false);
	});

	it('équivaut à « aucune des quatre directions ne bouge »', () => {
		const r = tirage(2048);
		for (let i = 0; i < 300; i++) {
			const g = grilleAleatoire(r);
			if (tuiles(g).length === 0) continue; // état dégénéré, hors jeu (voir plus haut)
			const bloquee = DIRECTIONS.every((d) => !glisser(g, d).bouge);
			expect(partieFinie(g)).toBe(bloquee);
		}
	});
});

describe('ajouterTuile (critère 15 : une tuile apparaît à chaque coup)', () => {
	it('ajoute exactement une tuile, de valeur 2 ou 4, sur une case vide', () => {
		const r = tirage(9);
		for (let i = 0; i < 300; i++) {
			const g = G([2, 0, 4, 0], [0, 8, 0, 0], [0, 0, 16, 0], [4, 0, 0, 2]);
			const apres = ajouterTuile(g, r);
			expect(tuiles(apres).length).toBe(tuiles(g).length + 1);
			// La case ajoutée était vide, et rien d'autre n'a bougé.
			let ajoutees = 0;
			for (let y = 0; y < 4; y++) {
				for (let x = 0; x < 4; x++) {
					if (g[y][x] !== apres[y][x]) {
						ajoutees++;
						expect(g[y][x]).toBe(0);
						expect([2, 4]).toContain(apres[y][x]);
					}
				}
			}
			expect(ajoutees).toBe(1);
		}
	});

	it('ne modifie pas la grille reçue', () => {
		const g = grilleVide();
		const copie = G(...g);
		ajouterTuile(g, tirage(3));
		expect(g).toEqual(copie);
	});

	it('peut atteindre n’importe quelle case vide (aucun coin mort)', () => {
		const r = tirage(1);
		const vues = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			const apres = ajouterTuile(grilleVide(), r);
			for (let y = 0; y < 4; y++) {
				for (let x = 0; x < 4; x++) if (apres[y][x] !== 0) vues.add(`${y},${x}`);
			}
		}
		expect(vues.size).toBe(16);
	});
});

describe('grilleVide', () => {
	it('rend 4 lignes de 4 cases vides', () => {
		const g = grilleVide();
		expect(g.length).toBe(4);
		for (const ligne of g) expect(ligne).toEqual([0, 0, 0, 0]);
	});

	it('rend une grille NEUVE à chaque appel (pas une constante partagée)', () => {
		const a = grilleVide();
		a[0][0] = 2;
		expect(grilleVide()[0][0]).toBe(0);
	});
});
