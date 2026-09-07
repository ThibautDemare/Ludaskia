/* ============================================================
   Sudoku (#666) — le MOTEUR DE GRILLE À CONTRAINTES, éprouvé pour lui-même.

   Écrit AVANT l'implémentation, d'après les critères de l'issue #666. Le module
   testé est un squelette dont chaque fonction lève « non implémenté » : ces
   tests sont donc ROUGES par construction, et c'est le contrat.

   Ce fichier porte le critère 25 (moteur séparé, contraintes ENFICHABLES) et les
   deux solveurs sur lesquels reposent les critères 3 et 4. Le point important :
   `tests/sudoku.test.ts` prouve que TOUTE grille servie a une solution unique
   (3) et se résout par déduction élémentaire (4) EN SE SERVANT de
   `compterSolutions` et de `resoudreParDeductionElementaire`. Si ces deux-là
   sont faux, l'échantillonnage du critère 3-4 passerait à vide — un
   `compterSolutions` qui rendrait toujours 1 le rendrait complaisant. D'où les
   fixtures ci-dessous, dont les valeurs attendues ont été calculées par un
   solveur INDÉPENDANT écrit pour l'occasion, hors du dépôt :

   • une grille 4×4 vide a exactement 288 solutions (nombre connu des « shidoku »,
     recalculé ici pour ne pas le prendre sur parole) ;
   • la même grille, plus une contrainte diagonale, n'en a plus que 48 ;
   • `P6_PAIRE` a UNE solution mais exige de raisonner sur une paire de
     candidats : c'est exactement la grille qu'un enfant de 8 ans ne peut pas
     finir, donc celle que le solveur du critère 4 doit refuser.

   MESURE À CONNAÎTRE, trouvée en fabriquant ces fixtures : en 4×4, une grille à
   solution unique est TOUJOURS résoluble par déduction élémentaire (vérifié
   exhaustivement sur les 2^16 sous-ensembles de trois grilles solutions :
   zéro contre-exemple). Le critère 4 n'a donc de mordant QUE sur le 6×6 — un
   échantillonnage limité au 4×4 serait vert quoi qu'on fasse.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	colonnes,
	compterSolutions,
	contrainteUnicite,
	creerMoteur,
	lignes,
	regions,
	resoudreParDeductionElementaire,
	type Contrainte,
	type Geometrie,
	type Valeur,
	type Valeurs,
	type Zone,
} from '../src/core/jeux/grille-contraintes';

/* ---------- géométries d'essai ----------
   Explicites, jamais reprises de `geometrieSudoku` : le moteur est GÉNÉRIQUE
   (critère 25), donc il doit tenir des géométries que le sudoku n'utilise pas,
   et les fixtures 6×6 ci-dessous ne dépendent pas de l'orientation de région
   que le jeu, lui, choisira. */
const GEO4: Geometrie = { cotes: 4, regionLargeur: 2, regionHauteur: 2 };
const GEO6_LARGE: Geometrie = { cotes: 6, regionLargeur: 3, regionHauteur: 2 };
const GEO6_HAUTE: Geometrie = { cotes: 6, regionLargeur: 2, regionHauteur: 3 };

/* ---------- fixtures 4×4 (régions 2×2) ---------- */
const VIDE4: Valeurs = new Array(16).fill(0);
/** Grille complète et valide. NE respecte PAS les diagonales (1,4,4,1) : c'est
    ce qui sert à prouver qu'une contrainte ajoutée voit ce que le sudoku ignore. */
const SOL4: Valeurs = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
/** 4 données, solution unique, résoluble par déduction élémentaire. */
const P4_UNIQUE: Valeurs = [1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0, 0, 3, 0, 0];
/** 8 données, exactement DEUX solutions : la grille qu'un générateur ne doit
    jamais servir (critère 3). */
const P4_DEUX: Valeurs = [1, 2, 3, 4, 3, 4, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0];
/** Aucune case posée n'est en conflit, et pourtant la case 0 n'a plus aucun
    candidat (sa ligne prend 2,3,4 et sa colonne prend 1). Zéro solution. */
const P4_SANS_ISSUE: Valeurs = [0, 2, 3, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
/** Deux 1 sur la première ligne : conflit posé, zéro solution. */
const P4_CONFLIT: Valeurs = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/* ---------- fixtures 6×6, régions 3 de large sur 2 de haut ---------- */
const SOL6: Valeurs = [
	5, 6, 3, 2, 1, 4, 4, 1, 2, 3, 5, 6, 6, 2, 4, 1, 3, 5, 3, 5, 1, 6, 4, 2, 2, 3, 5, 4, 6, 1, 1, 4, 6,
	5, 2, 3,
];
/** UNE seule solution (`SOL6`), mais aucune case n'a jamais de candidat unique
    au départ : il faut raisonner sur une paire. La grille du critère 4. */
const P6_PAIRE: Valeurs = [
	5, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 5, 1, 0, 0, 0, 0, 0, 0, 4, 0, 0, 1, 0, 6,
	0, 0, 0,
];

/* ---------- outils de comparaison ---------- */
/** Les zones d'une famille, chacune triée, la liste triée : l'ordre de sortie
    n'est pas un contrat, le découpage l'est. */
const canonique = (zs: Zone[]): string[] =>
	zs.map((z) => [...z].sort((a, b) => a - b).join(',')).sort();

const zoneDe = (zs: Zone[], index: number): number[] => {
	const z = zs.find((zz) => zz.includes(index));
	return z ? [...z].sort((a, b) => a - b) : [];
};

const tri = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);

/* ---------- le sudoku « à la main », pour les essais du moteur ----------
   Trois unicités assemblées ICI et non reprises de `moteurSudoku` : ce fichier
   éprouve le moteur, pas le jeu. */
const unicites = (): Contrainte[] => [
	contrainteUnicite('ligne', lignes),
	contrainteUnicite('colonne', colonnes),
	contrainteUnicite('region', regions),
];

/* ---------- deux contraintes AJOUTÉES, écrites hors du module (critère 25) ----------
   Le cas d'échec du critère 25 est littéralement celui-ci : « un test qui
   enregistre une contrainte supplémentaire sur une grille ne la voit pas
   appliquée ». La diagonale est une contrainte d'unicité sur des zones que le
   moteur ne fabrique pas ; la cage, elle, n'est PAS une unicité du tout —
   c'est le brouillon de ce que #667 branchera. */
const diagonalesDe = (geo: Geometrie): Zone[] => {
	const n = geo.cotes;
	const haut: Zone = [];
	const bas: Zone = [];
	for (let i = 0; i < n; i++) {
		haut.push(i * n + i);
		bas.push(i * n + (n - 1 - i));
	}
	return [haut, bas];
};

/* Écrite À LA MAIN, et pas avec `contrainteUnicite` : les tests du critère 25 ne
   doivent rien devoir à la commodité du moteur, sinon ils ne prouveraient que
   sa capacité à se rebrancher sur lui-même. */
const CONTRAINTE_DIAGONALE: Contrainte = {
	id: 'diagonale',
	conflits(geo, v) {
		const out = new Set<number>();
		for (const zone of diagonalesDe(geo)) {
			const parValeur = new Map<Valeur, number[]>();
			for (const i of zone) {
				if (v[i] === 0) continue;
				const l = parValeur.get(v[i]) ?? [];
				l.push(i);
				parValeur.set(v[i], l);
			}
			for (const l of parValeur.values()) if (l.length > 1) for (const i of l) out.add(i);
		}
		return out;
	},
	interdits(geo, v, index) {
		const out = new Set<Valeur>();
		for (const zone of diagonalesDe(geo)) {
			if (!zone.includes(index)) continue;
			for (const i of zone) if (i !== index && v[i] !== 0) out.add(v[i]);
		}
		return out;
	},
};

/** « Ces deux cases-là font `somme` » — la cage du calcudoku, en miniature. */
const cage = (id: string, cases: number[], somme: number): Contrainte => ({
	id,
	conflits(_geo, v) {
		const out = new Set<number>();
		if (cases.some((i) => v[i] === 0)) return out;
		if (cases.reduce((s, i) => s + v[i], 0) !== somme) for (const i of cases) out.add(i);
		return out;
	},
	interdits(geo, v, index) {
		const out = new Set<Valeur>();
		if (!cases.includes(index)) return out;
		const autres = cases.filter((i) => i !== index);
		if (autres.some((i) => v[i] === 0)) return out;
		const reste = somme - autres.reduce((s, i) => s + v[i], 0);
		for (let k = 1; k <= geo.cotes; k++) if (k !== reste) out.add(k);
		return out;
	},
});

describe('#666 — les zones d’une géométrie', () => {
	it('découpe les lignes en ligne-major', () => {
		expect(canonique(lignes(GEO4))).toEqual(
			canonique([
				[0, 1, 2, 3],
				[4, 5, 6, 7],
				[8, 9, 10, 11],
				[12, 13, 14, 15],
			]),
		);
		expect(zoneDe(lignes(GEO6_LARGE), 8)).toEqual([6, 7, 8, 9, 10, 11]);
	});

	it('découpe les colonnes', () => {
		expect(zoneDe(colonnes(GEO4), 0)).toEqual([0, 4, 8, 12]);
		expect(zoneDe(colonnes(GEO4), 15)).toEqual([3, 7, 11, 15]);
		expect(zoneDe(colonnes(GEO6_LARGE), 2)).toEqual([2, 8, 14, 20, 26, 32]);
	});

	it('découpe les régions 2×2 du 4×4', () => {
		// Seule géométrie du jeu où le découpage est sans ambiguïté possible.
		expect(canonique(regions(GEO4))).toEqual(
			canonique([
				[0, 1, 4, 5],
				[2, 3, 6, 7],
				[8, 9, 12, 13],
				[10, 11, 14, 15],
			]),
		);
	});

	it('découpe les régions en rectangles de la taille annoncée, dans les deux orientations', () => {
		/* Une région n'est pas « un groupe de `cotes` cases » : c'est un RECTANGLE
		   contigu de `regionLargeur` × `regionHauteur`. Un découpage qui prendrait
		   `cotes` cases n'importe où passerait le test de partition ci-dessous sans
		   être un sudoku. */
		for (const geo of [GEO4, GEO6_LARGE, GEO6_HAUTE]) {
			for (const zone of regions(geo)) {
				const lig = zone.map((i) => Math.floor(i / geo.cotes));
				const col = zone.map((i) => i % geo.cotes);
				const hauteur = new Set(lig);
				const largeur = new Set(col);
				expect({ geo, largeur: largeur.size, hauteur: hauteur.size }).toEqual({
					geo,
					largeur: geo.regionLargeur,
					hauteur: geo.regionHauteur,
				});
				// contiguïté : les lignes et les colonnes touchées se suivent
				expect(Math.max(...lig) - Math.min(...lig)).toBe(geo.regionHauteur - 1);
				expect(Math.max(...col) - Math.min(...col)).toBe(geo.regionLargeur - 1);
			}
		}
	});

	it('partitionne la grille : chaque case dans une zone et une seule, par famille', () => {
		for (const geo of [GEO4, GEO6_LARGE, GEO6_HAUTE]) {
			for (const famille of [lignes, colonnes, regions]) {
				const zs = famille(geo);
				expect(zs.length).toBe(geo.cotes);
				for (const z of zs) expect(z.length).toBe(geo.cotes);
				const plat = zs.flat().sort((a, b) => a - b);
				expect(plat).toEqual([...Array(geo.cotes * geo.cotes).keys()]);
			}
		}
	});
});

describe('#666 — contrainteUnicite : « chaque valeur au plus une fois par zone »', () => {
	it('garde l’id qu’on lui donne', () => {
		expect(contrainteUnicite('ligne', lignes).id).toBe('ligne');
	});

	it('ne voit AUCUN conflit dans une grille vide', () => {
		/* Le piège du 0. Une grille 4×4 vide contient quatre fois « 0 » par ligne :
		   une unicité naïve y verrait seize cases en conflit et le jeu s'ouvrirait
		   tout allumé. La case vide n'est pas une valeur. */
		for (const c of unicites()) expect(tri(c.conflits(GEO4, VIDE4))).toEqual([]);
	});

	it('ne voit aucun conflit dans une grille complète et valide', () => {
		for (const c of unicites()) expect(tri(c.conflits(GEO4, SOL4))).toEqual([]);
	});

	it('rend LES DEUX cases en cause, jamais une seule (critère 13)', () => {
		const v = [...VIDE4];
		v[0] = 3;
		v[2] = 3; // même ligne
		expect(tri(contrainteUnicite('ligne', lignes).conflits(GEO4, v))).toEqual([0, 2]);
	});

	it('rend LES TROIS cases quand la valeur apparaît trois fois', () => {
		const v = [...VIDE4];
		v[0] = 2;
		v[4] = 2;
		v[8] = 2; // même colonne
		expect(tri(contrainteUnicite('colonne', colonnes).conflits(GEO4, v))).toEqual([0, 4, 8]);
	});

	it('ne parle que de sa propre famille de zones', () => {
		// Deux 3 dans la même COLONNE : la contrainte de ligne n'a rien à dire.
		const v = [...VIDE4];
		v[0] = 3;
		v[8] = 3;
		expect(tri(contrainteUnicite('ligne', lignes).conflits(GEO4, v))).toEqual([]);
		expect(tri(contrainteUnicite('colonne', colonnes).conflits(GEO4, v))).toEqual([0, 8]);
		// … et la région, non plus : 0 et 8 ne partagent pas de région 2×2.
		expect(tri(contrainteUnicite('region', regions).conflits(GEO4, v))).toEqual([]);
	});

	it('signale un conflit de région même sans conflit de ligne ni de colonne', () => {
		// 0 et 5 : régions communes, ni ligne ni colonne. La contrainte la plus
		// oubliée du sudoku (critère 9), donc celle qu'il faut vérifier seule.
		const v = [...VIDE4];
		v[0] = 4;
		v[5] = 4;
		expect(tri(contrainteUnicite('region', regions).conflits(GEO4, v))).toEqual([0, 5]);
		expect(tri(contrainteUnicite('ligne', lignes).conflits(GEO4, v))).toEqual([]);
		expect(tri(contrainteUnicite('colonne', colonnes).conflits(GEO4, v))).toEqual([]);
	});

	it('interdit à une case vide les valeurs déjà présentes dans ses zones', () => {
		const v = [...VIDE4];
		v[1] = 2; // même ligne que 0
		v[4] = 3; // même colonne que 0
		v[5] = 4; // même région que 0
		expect(tri(contrainteUnicite('ligne', lignes).interdits(GEO4, v, 0))).toEqual([2]);
		expect(tri(contrainteUnicite('colonne', colonnes).interdits(GEO4, v, 0))).toEqual([3]);
		expect(tri(contrainteUnicite('region', regions).interdits(GEO4, v, 0))).toEqual([2, 3, 4]);
	});

	it('n’interdit rien dans une grille vide', () => {
		for (const c of unicites()) expect(tri(c.interdits(GEO4, VIDE4, 5))).toEqual([]);
	});

	it('accepte une famille de zones qui ne partitionne PAS la grille', () => {
		/* Rien dans le contrat n'exige que les zones couvrent toute la grille : les
		   lignes, colonnes et régions le font, les diagonales d'un sudoku-X ou les
		   cages d'un calcudoku, non. Une implémentation qui supposerait une
		   partition (« la zone d'une case », au singulier) rendrait la fabrique
		   inutilisable pour tout autre client que le sudoku, et manquerait le
		   critère 25. Ici seules 8 des 16 cases appartiennent à une zone. */
		const c = contrainteUnicite('diagonale', diagonalesDe);
		expect(tri(c.conflits(GEO4, SOL4))).toEqual([0, 3, 5, 6, 9, 10, 12, 15]);
		const v = [...VIDE4];
		v[15] = 2;
		expect(tri(c.interdits(GEO4, v, 0))).toEqual([2]);
		// une case hors de toute zone n'est contrainte par rien
		expect(tri(c.interdits(GEO4, SOL4, 1))).toEqual([]);
	});

	it('ne modifie pas la grille qu’on lui passe', () => {
		const v = [...SOL4];
		for (const c of unicites()) {
			c.conflits(GEO4, v);
			c.interdits(GEO4, v, 0);
		}
		expect(v).toEqual(SOL4);
	});
});

describe('#666 — creerMoteur : l’assemblage', () => {
	it('expose la géométrie et les contraintes reçues', () => {
		const cs = unicites();
		const m = creerMoteur(GEO4, cs);
		expect(m.geometrie).toEqual(GEO4);
		expect(m.contraintes.map((c) => c.id)).toEqual(['ligne', 'colonne', 'region']);
	});

	it('unit les conflits de toutes ses contraintes', () => {
		/* Une case peut être en cause par sa ligne ET par sa région ; une autre par
		   sa seule colonne. Le moteur doit rendre les deux ensembles réunis — c'est
		   « toutes les cases en cause à la fois » du critère 13. */
		const v = [...VIDE4];
		v[0] = 1;
		v[1] = 1; // ligne + région
		v[8] = 2;
		v[12] = 2; // colonne seulement
		expect(tri(creerMoteur(GEO4, unicites()).conflits(v))).toEqual([0, 1, 8, 12]);
	});

	it('sans aucune contrainte, ne voit ni conflit ni interdit', () => {
		// Le moteur ne connaît pas le sudoku : la règle vient des contraintes qu'on
		// lui donne, et de rien d'autre (critère 25).
		const m = creerMoteur(GEO4, []);
		expect(tri(m.conflits([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]))).toEqual([]);
		expect(tri(m.candidats(VIDE4, 0))).toEqual([1, 2, 3, 4]);
	});

	it('candidats d’une case vide : toutes les valeurs, moins ce que les contraintes interdisent', () => {
		const m = creerMoteur(GEO4, unicites());
		expect(tri(m.candidats(VIDE4, 0))).toEqual([1, 2, 3, 4]);
		const v = [...VIDE4];
		v[1] = 2;
		v[4] = 3;
		expect(tri(m.candidats(v, 0))).toEqual([1, 4]);
	});

	it('candidats reste dans 1..cotes, et n’offre jamais la case vide comme valeur', () => {
		const m = creerMoteur(GEO6_LARGE, unicites());
		for (let i = 0; i < 36; i++) {
			for (const k of m.candidats(P6_PAIRE, i)) {
				expect(k).toBeGreaterThanOrEqual(1);
				expect(k).toBeLessThanOrEqual(6);
			}
		}
	});

	it('complete : faux sur une grille vide, faux sur une grille entamée, vrai sur une grille remplie et valide', () => {
		const m = creerMoteur(GEO4, unicites());
		expect(m.complete(VIDE4)).toBe(false);
		expect(m.complete(P4_UNIQUE)).toBe(false);
		expect(m.complete(SOL4)).toBe(true);
	});

	it('ne modifie pas la grille qu’on lui passe', () => {
		const m = creerMoteur(GEO4, unicites());
		const v = [...P4_UNIQUE];
		m.conflits(v);
		m.candidats(v, 1);
		m.complete(v);
		expect(v).toEqual(P4_UNIQUE);
	});
});

describe('#666 — compterSolutions : le juge du critère 3', () => {
	const m4 = creerMoteur(GEO4, unicites());

	it('compte 1 sur une grille déjà remplie et valide', () => {
		expect(compterSolutions(m4, SOL4, 2)).toBe(1);
	});

	it('compte 288 sur une grille 4×4 vide', () => {
		// Valeur recalculée par un solveur indépendant, hors du dépôt. C'est le
		// contrôle qui empêche un `compterSolutions` complaisant de rendre 1 partout.
		expect(compterSolutions(m4, VIDE4, 1000)).toBe(288);
	});

	it('s’arrête à `max` au lieu de tout énumérer', () => {
		expect(compterSolutions(m4, VIDE4, 2)).toBe(2);
		expect(compterSolutions(m4, VIDE4, 1)).toBe(1);
		// `max` à 0 : rien à compter, et surtout pas de compte négatif ni de
		// parcours complet de l'arbre.
		expect(compterSolutions(m4, VIDE4, 0)).toBe(0);
	});

	it('compte 1 sur une grille à solution unique, 2 sur une grille ambiguë', () => {
		expect(compterSolutions(m4, P4_UNIQUE, 2)).toBe(1);
		expect(compterSolutions(m4, P4_DEUX, 3)).toBe(2);
	});

	it('compte 0 sur une grille contradictoire, conflit visible ou non', () => {
		expect(compterSolutions(m4, P4_CONFLIT, 2)).toBe(0);
		// Aucune case posée n'est en conflit, et pourtant la grille est morte : la
		// case 0 n'a plus aucun candidat. Un compteur qui ne regarderait que les
		// conflits posés la déclarerait jouable.
		expect(tri(m4.conflits(P4_SANS_ISSUE))).toEqual([]);
		expect(compterSolutions(m4, P4_SANS_ISSUE, 2)).toBe(0);
	});

	it('compte 1 sur la grille 6×6 à solution unique, dans une géométrie non carrée', () => {
		/* La région 3×2 n'est pas carrée : c'est là que se cassent les calculs
		   d'index écrits pour un `sqrt(cotes)`. `SOL6` est bien la solution de
		   `P6_PAIRE`, ce qui vérifie du même coup que le compteur explore la bonne
		   grille. */
		const m6 = creerMoteur(GEO6_LARGE, unicites());
		expect(tri(m6.conflits(SOL6))).toEqual([]);
		expect(m6.complete(SOL6)).toBe(true);
		expect(compterSolutions(m6, SOL6, 3)).toBe(1);
		expect(compterSolutions(m6, P6_PAIRE, 3)).toBe(1);
		for (let i = 0; i < 36; i++) if (P6_PAIRE[i] !== 0) expect(SOL6[i]).toBe(P6_PAIRE[i]);
	});

	it('ne modifie pas la grille qu’on lui passe', () => {
		const v = [...P4_UNIQUE];
		compterSolutions(m4, v, 2);
		expect(v).toEqual(P4_UNIQUE);
	});
});

describe('#666 — resoudreParDeductionElementaire : le juge du critère 4', () => {
	const m4 = creerMoteur(GEO4, unicites());
	const m6 = creerMoteur(GEO6_LARGE, unicites());

	it('rend telle quelle une grille déjà remplie', () => {
		expect(resoudreParDeductionElementaire(m4, SOL4)).toEqual(SOL4);
	});

	it('finit une grille dont chaque étape offre une case à candidat unique', () => {
		expect(resoudreParDeductionElementaire(m4, P4_UNIQUE)).toEqual(SOL4);
	});

	it('BLOQUE sur une grille à solution unique qui exige de raisonner sur une paire', () => {
		/* Le cœur du critère 4. `P6_PAIRE` a bien UNE solution (test ci-dessus) et
		   pourtant aucune case n'y a de candidat unique : la finir demande de
		   repérer une paire, technique hors de portée avant 10-11 ans. Un solveur
		   qui la termine est trop FORT, et le générateur pourrait alors servir des
		   grilles où l'enfant tourne en rond sans que rien ne le lui dise. */
		expect(resoudreParDeductionElementaire(m6, P6_PAIRE)).toBeNull();
	});

	it('bloque sur une grille vide : aucune case n’y a de candidat unique', () => {
		expect(resoudreParDeductionElementaire(m4, VIDE4)).toBeNull();
	});

	it('bloque sur une grille contradictoire', () => {
		expect(resoudreParDeductionElementaire(m4, P4_CONFLIT)).toBeNull();
		expect(resoudreParDeductionElementaire(m4, P4_SANS_ISSUE)).toBeNull();
	});

	it('quand il rend une grille, elle est remplie et sans conflit', () => {
		const r = resoudreParDeductionElementaire(m4, P4_UNIQUE);
		expect(r).not.toBeNull();
		if (!r) return;
		expect(r.length).toBe(16);
		expect(r.every((x) => x >= 1 && x <= 4)).toBe(true);
		expect(tri(m4.conflits(r))).toEqual([]);
		expect(m4.complete(r)).toBe(true);
	});

	it('n’écrase pas les cases données', () => {
		const r = resoudreParDeductionElementaire(m4, P4_UNIQUE);
		expect(r).not.toBeNull();
		if (!r) return;
		for (let i = 0; i < 16; i++) if (P4_UNIQUE[i] !== 0) expect(r[i]).toBe(P4_UNIQUE[i]);
	});

	it('ne modifie pas la grille qu’on lui passe', () => {
		const v = [...P4_UNIQUE];
		resoudreParDeductionElementaire(m4, v);
		expect(v).toEqual(P4_UNIQUE);
	});
});

describe('#666 — critère 25 : une contrainte enregistrée EN PLUS est vraiment appliquée', () => {
	/* Aucune de ces contraintes n'existe dans `src/core/jeux/` : elles sont écrites
	   ici, dans le test, exactement comme #667 écrira ses cages. Si le moteur les
	   ignorait, tous ces cas rendraient le résultat du sudoku nu. */
	const nu = creerMoteur(GEO4, unicites());
	const avecDiagonale = creerMoteur(GEO4, [...unicites(), CONTRAINTE_DIAGONALE]);

	it('voit un conflit que les règles du sudoku ne voient pas', () => {
		// SOL4 est un sudoku 4×4 parfaitement valide, mais ses deux diagonales
		// répètent leurs valeurs (1,4,4,1 et 4,1,1,4).
		expect(tri(nu.conflits(SOL4))).toEqual([]);
		expect(tri(avecDiagonale.conflits(SOL4))).toEqual([0, 3, 5, 6, 9, 10, 12, 15]);
	});

	it('restreint les candidats d’une case', () => {
		const v = [...VIDE4];
		v[15] = 2; // sur la diagonale de la case 0, mais ni sa ligne, ni sa colonne, ni sa région
		expect(tri(nu.candidats(v, 0))).toEqual([1, 2, 3, 4]);
		expect(tri(avecDiagonale.candidats(v, 0))).toEqual([1, 3, 4]);
	});

	it('réduit le nombre de solutions : 288 grilles 4×4, mais 48 seulement avec les diagonales', () => {
		// Les deux nombres viennent du solveur indépendant. Un moteur qui ignorerait
		// la contrainte ajoutée rendrait 288 deux fois.
		expect(compterSolutions(nu, VIDE4, 1000)).toBe(288);
		expect(compterSolutions(avecDiagonale, VIDE4, 1000)).toBe(48);
	});

	it('sert aussi le solveur élémentaire : une grille insoluble sans elle se termine avec elle', () => {
		/* La preuve la plus difficile à obtenir par accident. Sans la diagonale,
		   cette grille a six solutions et la déduction élémentaire cale tout de
		   suite ; avec elle, la solution est unique et se déduit case après case. */
		const v: Valeurs = [1, 2, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		expect(compterSolutions(nu, v, 100)).toBe(6);
		expect(resoudreParDeductionElementaire(nu, v)).toBeNull();

		expect(compterSolutions(avecDiagonale, v, 3)).toBe(1);
		expect(resoudreParDeductionElementaire(avecDiagonale, v)).toEqual([
			1, 2, 3, 4, 3, 4, 1, 2, 4, 3, 2, 1, 2, 1, 4, 3,
		]);
	});

	it('accepte une contrainte qui n’est PAS une unicité — la cage de #667', () => {
		/* `contrainteUnicite` est une COMMODITÉ, pas la seule forme de contrainte
		   admise. Si le moteur ne savait brancher que des unicités, le calcudoku
		   devrait le rouvrir, et le critère 25 serait manqué. */
		const avecCage = creerMoteur(GEO4, [...unicites(), cage('cage-3', [0, 1], 3)]);
		const bonne = [...VIDE4];
		bonne[0] = 1;
		bonne[1] = 2; // somme 3
		expect(tri(avecCage.conflits(bonne))).toEqual([]);

		const mauvaise = [...VIDE4];
		mauvaise[0] = 3;
		mauvaise[1] = 4; // somme 7 : les DEUX cases de la cage sont en cause
		expect(tri(avecCage.conflits(mauvaise))).toEqual([0, 1]);

		const amorce = [...VIDE4];
		amorce[1] = 2;
		expect(tri(avecCage.candidats(amorce, 0))).toEqual([1]);
		expect(tri(nu.candidats(amorce, 0))).toEqual([1, 3, 4]);
	});
});
