/* ============================================================
   Étagère de jeux (#661) — le MOTEUR du 2048 (critère 15).

   Jeu-refuge : il ne déclare aucune compétence et ignore le niveau scolaire
   (critère 16). Rien ici ne doit dépendre de la classe de l'enfant.

   La règle qui fait tout le jeu, et qu'on rate une fois sur deux : une tuile
   née d'une fusion est VERROUILLÉE pour le reste du coup. `[2,2,4]` glissé à
   gauche rend `[4,4]`, jamais `[8]` — sinon une seule poussée suffirait à
   traverser la grille, et le jeu n'aurait plus de tension. C'est le cas
   d'échec écrit noir sur blanc dans le critère 15.

   Tout est pur : `glisser` et `ajouterTuile` rendent une grille NEUVE et ne
   touchent pas celle qu'on leur passe. L'aléa est injecté, sans quoi on ne peut
   pas prouver qu'aucune case n'est un coin mort.
   ============================================================ */

/** 4 lignes de 4 colonnes, indexées `[y][x]`. `0` = case vide. */
export type Grille = number[][];
export type Direction = 'haut' | 'bas' | 'gauche' | 'droite';

export interface Coup {
	grille: Grille;
	/** `false` si le coup ne change rien — il ne doit alors pas faire apparaître
	    de tuile, sinon la grille se remplit sans que l'enfant ait joué. */
	bouge: boolean;
	/** Points marqués par les fusions de CE coup (somme des tuiles nées). */
	gain: number;
}

export const COTE = 4;

export function grilleVide(): Grille {
	return [...Array(COTE)].map(() => Array<number>(COTE).fill(0));
}

/* Compacte une ligne vers l'INDEX 0 et fusionne les paires adjacentes.

   `i += 2` après une fusion : c'est ce seul détail qui verrouille la tuile née.
   Sans lui, `[2,2,4]` continuerait de fusionner et rendrait `[8]`. */
function glisserLigne(ligne: number[]): { ligne: number[]; gain: number } {
	const pleines = ligne.filter((v) => v !== 0);
	const sortie: number[] = [];
	let gain = 0;
	for (let i = 0; i < pleines.length; i++) {
		if (i + 1 < pleines.length && pleines[i] === pleines[i + 1]) {
			const fusion = pleines[i] * 2;
			sortie.push(fusion);
			gain += fusion;
			i++;
		} else {
			sortie.push(pleines[i]);
		}
	}
	while (sortie.length < ligne.length) sortie.push(0);
	return { ligne: sortie, gain };
}

/* Lit la grille comme un paquet de lignes orientées vers le bord VISÉ : la case
   la plus proche du bord vient en premier. Une seule règle de compactage sert
   alors les quatre directions. */
function lire(g: Grille, dir: Direction): number[][] {
	switch (dir) {
		case 'gauche':
			return g.map((l) => [...l]);
		case 'droite':
			return g.map((l) => [...l].reverse());
		case 'haut':
			return [...Array(COTE)].map((_, x) => g.map((l) => l[x]));
		case 'bas':
			return [...Array(COTE)].map((_, x) => g.map((l) => l[x]).reverse());
	}
}

/* Réécrit la grille depuis ces mêmes lignes orientées. Exactement l'inverse de
   `lire` — les deux se relisent ensemble. */
function ecrire(lignes: number[][], dir: Direction): Grille {
	const g = grilleVide();
	for (let i = 0; i < COTE; i++) {
		for (let k = 0; k < COTE; k++) {
			const v = lignes[i][k];
			switch (dir) {
				case 'gauche':
					g[i][k] = v;
					break;
				case 'droite':
					g[i][COTE - 1 - k] = v;
					break;
				case 'haut':
					g[k][i] = v;
					break;
				case 'bas':
					g[COTE - 1 - k][i] = v;
					break;
			}
		}
	}
	return g;
}

/** Un glissement complet. Rend une grille neuve, la grille reçue est intacte. */
export function glisser(g: Grille, dir: Direction): Coup {
	let gain = 0;
	const lignes = lire(g, dir).map((l) => {
		const r = glisserLigne(l);
		gain += r.gain;
		return r.ligne;
	});
	const grille = ecrire(lignes, dir);
	const bouge = grille.some((l, y) => l.some((v, x) => v !== g[y][x]));
	return bouge ? { grille, bouge, gain } : { grille: g.map((l) => [...l]), bouge: false, gain: 0 };
}

/** Fait apparaître une tuile sur une case vide. Grille neuve, aléa injecté.

    Un 4 une fois sur dix : assez rare pour que la grille reste jouable
    longtemps, assez fréquent pour que la partie ne soit pas une routine. */
export function ajouterTuile(g: Grille, r: () => number): Grille {
	const vides: [number, number][] = [];
	for (let y = 0; y < COTE; y++) {
		for (let x = 0; x < COTE; x++) if (g[y][x] === 0) vides.push([y, x]);
	}
	const grille = g.map((l) => [...l]);
	if (!vides.length) return grille;
	const [y, x] = vides[Math.min(vides.length - 1, Math.floor(r() * vides.length))];
	grille[y][x] = r() < 0.9 ? 2 : 4;
	return grille;
}

/** La partie est finie : plus une case vide, et plus une fusion possible.

    Équivaut à « aucune des quatre directions ne bouge » dès qu'il reste au
    moins une tuile, mais se lit d'un coup d'œil au lieu de simuler quatre
    coups. */
export function partieFinie(g: Grille): boolean {
	for (let y = 0; y < COTE; y++) {
		for (let x = 0; x < COTE; x++) {
			if (g[y][x] === 0) return false;
			if (x + 1 < COTE && g[y][x] === g[y][x + 1]) return false;
			if (y + 1 < COTE && g[y][x] === g[y + 1][x]) return false;
		}
	}
	return true;
}
