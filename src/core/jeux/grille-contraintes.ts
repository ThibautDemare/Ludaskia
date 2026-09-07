/* ============================================================
   Sudoku (#666) — le MOTEUR DE GRILLE À CONTRAINTES, générique.

   Ce module ne connaît pas le sudoku. Il connaît une grille carrée, ses zones
   (lignes, colonnes, régions) et un jeu de contraintes ENFICHABLES. Le sudoku
   n'est qu'un assemblage : trois contraintes d'unicité. Le calcudoku de #667
   ajoutera ses cages arithmétiques sans toucher à ce fichier (critère 25,
   arbitré le 2026-09-07 : conception pour deux clients dès maintenant).

   ── Deux invariants qui ont l'air décoratifs et ne le sont pas ───────────────

   **La case vide n'est pas une valeur.** Une grille 4×4 vide contient quatre
   fois « 0 » par ligne : une unicité naïve y verrait seize cases en conflit, et
   le jeu s'ouvrirait tout allumé. Tout parcours saute donc les zéros.

   **Rien ne mute la grille reçue.** Le générateur creuse en essayant puis en
   revenant en arrière, et le runner garde l'état courant : une fonction qui
   écrirait dans le tableau qu'on lui passe corromprait l'un ou l'autre sans
   rien lever. Toutes les fonctions d'ici travaillent sur une copie.

   ── Le couple des deux solveurs ─────────────────────────────────────────────

   `compterSolutions` juge le critère 3, `resoudreParDeductionElementaire` juge
   le critère 4, et le second implique le premier : si chaque étape est FORCÉE,
   la solution atteinte est nécessairement unique. Le générateur n'a donc qu'une
   garantie à tenir, pas deux.

   Mesure établie par l'auteur des tests, à connaître avant de faire confiance à
   un échantillon : **en 4×4, une grille à solution unique est TOUJOURS résoluble
   par déduction élémentaire** (vérifié exhaustivement sur les 2^16
   sous-ensembles de trois grilles solutions, zéro contre-exemple). Le critère 4
   n'a donc de mordant QUE sur le 6×6. Un échantillonnage limité au 4×4 serait
   vert quoi qu'on écrive ici.
   ============================================================ */

/** Case vide = 0. Les symboles sont numérotés à partir de 1. */
export type Valeur = number;

/** Grille en ligne-major, de longueur `cotes * cotes`. */
export type Valeurs = Valeur[];

export interface Geometrie {
	cotes: number;
	regionLargeur: number;
	regionHauteur: number;
}

/** Un groupe de cases (indices) qu'une contrainte considère ensemble. */
export type Zone = number[];

export interface Contrainte {
	/** Nom stable : sert aux messages et aux tests. */
	id: string;
	/** Les cases en conflit dans cette grille. TOUTES les cases en cause, jamais
	    une seule d'entre elles (critère 13) : le moteur ne sait pas laquelle est
	    « la mauvaise », et prétendre le savoir serait un verdict. */
	conflits(geo: Geometrie, v: Valeurs): Set<number>;
	/** Les valeurs que cette contrainte interdit à la case `index`. La valeur
	    éventuellement posée sur `index` ne s'interdit pas elle-même. */
	interdits(geo: Geometrie, v: Valeurs, index: number): Set<Valeur>;
}

export function lignes(geo: Geometrie): Zone[] {
	const zs: Zone[] = [];
	for (let y = 0; y < geo.cotes; y++) {
		const z: Zone = [];
		for (let x = 0; x < geo.cotes; x++) z.push(y * geo.cotes + x);
		zs.push(z);
	}
	return zs;
}

export function colonnes(geo: Geometrie): Zone[] {
	const zs: Zone[] = [];
	for (let x = 0; x < geo.cotes; x++) {
		const z: Zone = [];
		for (let y = 0; y < geo.cotes; y++) z.push(y * geo.cotes + x);
		zs.push(z);
	}
	return zs;
}

/** Les régions, RECTANGLES CONTIGUS de `regionLargeur` × `regionHauteur`.

    Pas « des groupes de `cotes` cases » : un découpage qui prendrait `cotes`
    cases n'importe où partitionnerait bien la grille sans être un sudoku, et
    l'enfant n'aurait aucun moyen de voir la contrainte. */
export function regions(geo: Geometrie): Zone[] {
	const zs: Zone[] = [];
	for (let ry = 0; ry + geo.regionHauteur <= geo.cotes; ry += geo.regionHauteur) {
		for (let rx = 0; rx + geo.regionLargeur <= geo.cotes; rx += geo.regionLargeur) {
			const z: Zone = [];
			for (let dy = 0; dy < geo.regionHauteur; dy++) {
				for (let dx = 0; dx < geo.regionLargeur; dx++) {
					z.push((ry + dy) * geo.cotes + rx + dx);
				}
			}
			zs.push(z);
		}
	}
	return zs;
}

/** « Chaque valeur au plus une fois par zone ».

    `zones` peut rendre une famille qui ne PARTITIONNE PAS la grille : une
    diagonale, une cage. C'est une exigence du critère 25, pas une tolérance —
    une implémentation écrite sur « la zone d'une case », au singulier,
    marcherait pour le sudoku et casserait #667. */
export function contrainteUnicite(id: string, zones: (geo: Geometrie) => Zone[]): Contrainte {
	return {
		id,
		conflits(geo, v) {
			const out = new Set<number>();
			for (const zone of zones(geo)) {
				const parValeur = new Map<Valeur, number[]>();
				for (const i of zone) {
					const val = v[i];
					if (!val) continue;
					const l = parValeur.get(val);
					if (l) l.push(i);
					else parValeur.set(val, [i]);
				}
				for (const l of parValeur.values()) {
					if (l.length > 1) for (const i of l) out.add(i);
				}
			}
			return out;
		},
		interdits(geo, v, index) {
			const out = new Set<Valeur>();
			for (const zone of zones(geo)) {
				if (!zone.includes(index)) continue;
				for (const i of zone) {
					if (i === index) continue;
					const val = v[i];
					if (val) out.add(val);
				}
			}
			return out;
		},
	};
}

export interface MoteurGrille {
	geometrie: Geometrie;
	contraintes: Contrainte[];
	/** Union des conflits de toutes les contraintes. */
	conflits(v: Valeurs): Set<number>;
	/** Les valeurs encore possibles pour une case. */
	candidats(v: Valeurs, index: number): Set<Valeur>;
	/** La grille est-elle REMPLIE ? Structurel, et volontairement muet sur la
	    justesse : le critère 13 rend « remplie mais fausse » atteignable, puisque
	    le conflit ne bloque pas la pose. C'est `grilleTerminee`, côté jeu, qui
	    exige remplie ET sans conflit. Ambiguïté relevée par l'auteur des tests. */
	complete(v: Valeurs): boolean;
}

export function creerMoteur(geo: Geometrie, contraintes: Contrainte[]): MoteurGrille {
	const total = geo.cotes * geo.cotes;
	return {
		geometrie: geo,
		contraintes,
		conflits(v) {
			const out = new Set<number>();
			for (const c of contraintes) for (const i of c.conflits(geo, v)) out.add(i);
			return out;
		},
		candidats(v, index) {
			const interdits = new Set<Valeur>();
			for (const c of contraintes) {
				for (const val of c.interdits(geo, v, index)) interdits.add(val);
			}
			const out = new Set<Valeur>();
			for (let s = 1; s <= geo.cotes; s++) if (!interdits.has(s)) out.add(s);
			return out;
		},
		complete(v) {
			if (v.length !== total) return false;
			for (let i = 0; i < total; i++) if (!v[i]) return false;
			return true;
		},
	};
}

/** Ne pose que les cases dont UNE seule valeur reste possible, en boucle. Rend
    la grille remplie, ou `null` si elle bloque avant.

    C'est le solveur du critère 4, et il est volontairement faible : s'il bloque,
    c'est que la grille exige de raisonner sur une paire de candidats, technique
    hors de portée avant 10-11 ans. Une grille qu'il ne finit pas ne doit pas
    être servie à un enfant, qui tournerait sur les cases restantes sans qu'aucun
    coup ne progresse et sans que rien ne lui dise que ce n'est pas sa faute.

    Une grille déjà contradictoire est refusée d'emblée. Sans ce test préalable,
    un conflit posé ne se remarquerait qu'indirectement, quand une case finirait
    par n'avoir plus aucun candidat — ce qui n'arrive pas toujours. */
export function resoudreParDeductionElementaire(m: MoteurGrille, v: Valeurs): Valeurs | null {
	if (m.conflits(v).size > 0) return null;
	const g = v.slice();
	for (;;) {
		let pose = false;
		for (let i = 0; i < g.length; i++) {
			if (g[i]) continue;
			const c = m.candidats(g, i);
			if (c.size === 0) return null;
			if (c.size === 1) {
				g[i] = [...c][0];
				pose = true;
			}
		}
		if (!pose) break;
	}
	return m.complete(g) ? g : null;
}

/** Compte les solutions en s'arrêtant à `max` : 2 suffit à prouver l'unicité.

    Explore la case la plus contrainte d'abord. Ce n'est pas de l'optimisation
    gratuite : sur une grille 4×4 vide (288 solutions) et sur les échantillons
    larges des critères 3 et 4, un parcours dans l'ordre des index paie
    l'exploration de branches mortes que ce choix coupe d'entrée. */
export function compterSolutions(m: MoteurGrille, v: Valeurs, max: number): number {
	if (max <= 0) return 0;
	if (m.conflits(v).size > 0) return 0;
	const g = v.slice();
	let n = 0;
	const explorer = (): void => {
		let cible = -1;
		let choix: Valeur[] | null = null;
		for (let i = 0; i < g.length; i++) {
			if (g[i]) continue;
			const c = [...m.candidats(g, i)];
			if (c.length === 0) return;
			if (!choix || c.length < choix.length) {
				cible = i;
				choix = c;
				if (c.length === 1) break;
			}
		}
		if (cible < 0 || !choix) {
			n++;
			return;
		}
		for (const s of choix) {
			g[cible] = s;
			explorer();
			g[cible] = 0;
			if (n >= max) return;
		}
	};
	explorer();
	return Math.min(n, max);
}
