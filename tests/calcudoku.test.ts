/* ============================================================
   Calcudoku (#667) — le JEU : tirage, cages, phrases, signalement, cas-pivot.

   Écrit AVANT l'implémentation, d'après les critères numérotés de l'issue #667.
   Le module n'existe pas encore : ce fichier est ROUGE par construction, et il
   doit l'être pour cette raison-là (import introuvable), pas pour une faute de
   syntaxe.

   Critères portés ici : 1 (une seule taille), 2 (aucune région), 4 et 5
   (solution unique et déduction élémentaire, par ÉCHANTILLON LARGE), 6 (cases
   pré-remplies non modifiables), 7 (panne plutôt que grille non garantie),
   8 (tirage pur et déterministe), 9 (cages contiguës), 10 (nombre et taille des
   cages), 11 (trois opérations, jamais la division), 12 (différence et produit à
   deux cases), 13 (étiquette de 2 à 3 caractères, même grammaire), 14 (ni « − »
   ni « ± »), 15 à 17 (`cageDe`, `phraseCage`, `PHRASE_DEFAUT`), 19 et 22
   (`poser` : effacement, et le signalement ne bloque pas la pose), 21 (ligne et
   colonne d'un côté, cage de l'autre), 22 à 24 (le signalement), 25 (rien n'est
   marqué avant d'être posé), 32 et 33 (le cas-pivot de la première grille),
   41 (la cage s'enfiche comme une `Contrainte` de plus).

   ── L'ORACLE EST ÉCRIT ICI, ET C'EST TOUT L'INTÉRÊT DU FICHIER ──────────────

   Les critères 4 et 5 se jugent avec un compteur de solutions et un solveur
   faible. Le moteur de #666 en fournit deux (`compterSolutions`,
   `resoudreParDeductionElementaire`), et ils ne sont PAS employés ici : tous
   deux prennent un `MoteurGrille`, donc la contrainte de cage écrite par
   l'implémenteur. S'en servir reviendrait à juger cette contrainte avec
   elle-même — une cage dont le calcul serait faux passerait les deux critères
   sans broncher, puisque le générateur et le juge partageraient l'erreur.

   L'oracle d'ici ne dépend de rien du jeu : il énumère les 576 carrés latins
   d'ordre 4 (24 permutations par ligne, filtrées sur les colonnes) et filtre par
   l'énoncé puis par les cages. C'est exhaustif, donc « exactement une solution »
   est une certitude et pas une estimation. `LATINS.length === 576` est vérifié
   comme premier test du fichier : si ce nombre bouge, l'oracle est cassé et tout
   le reste ne vaut rien.

   ── LA LECTURE « CAGE LOCALE », ET POURQUOI ─────────────────────────────────

   Le critère 5 dit « compte tenu de sa ligne, de sa colonne et de sa cage ».
   « De sa cage » se lit de deux façons : les complétions d'une cage peuvent
   croiser l'unicité de ligne et de colonne, ou non. L'issue tranche dans son
   hors-périmètre — « l'extension […] pour que la recherche de complétions d'une
   cage croise aussi l'unicité de ligne et de colonne » est écartée du lot, et
   les taux mesurés au cadrage (18,7 %) en découlent. L'oracle d'ici prend donc
   la lecture LOCALE : une cage ne connaît que ses propres cases, les répétitions
   y sont admises tant que la ligne et la colonne les autorisent par ailleurs.

   C'est la lecture EXIGEANTE : un solveur cage-locale réussit MOINS souvent
   qu'un solveur croisé, donc une grille qui passe le critère 5 ici passerait
   aussi la lecture croisée. L'inverse est faux. Ce test ne peut donc pas rougir
   à tort parce que l'implémentation serait plus fine que l'oracle.

   ── UNE CONTRADICTION DE L'ISSUE, ARBITRÉE ICI ──────────────────────────────

   Le critère 24 demande qu'une cage devenue impossible soit signalée « de la
   même façon » que le critère 23, c'est-à-dire « sur toutes ses cases ». Une
   cage INCOMPLÈTE a par définition des cases vides. Le critère 25, lu sur la
   surface publique, interdit à `conflitsCalcudoku` de rendre l'index d'une case
   vide. Pris à la lettre, les deux ne sont pas simultanément satisfiables.

   Arbitrage retenu, et il se lit dans la répartition des tests : le critère 24
   est éprouvé sur ce qui n'est pas contestable — la cage condamnée N'EST PAS
   MUETTE, et chacune de ses cases qui PORTE une valeur est signalée. La partie
   contestée (les cases VIDES de cette cage) n'est affirmée que dans le describe
   du critère 25, d'un seul côté, pour qu'un désaccord fasse tomber un test et
   pas dix. À remonter au mainteneur.

   ── UNE BRANCHE MORTE DU CRITÈRE 10, POUR MÉMOIRE ───────────────────────────

   « Au plus 7 cages […] de taille moyenne au moins 2,3 » : 7 × 2,3 = 16,1 cases
   minimum, pour une grille qui en compte 16. Le cas « 8 cages » de la clause
   *Violé si* est donc déjà interdit par la moyenne, et le plafond effectif est
   6 cages (6 × 2,3 = 13,8, atteignable). Les trois bornes sont testées telles
   quelles — aucune n'est fausse, l'une est simplement inatteignable.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
	COTE,
	PHRASE_DEFAUT,
	SYMBOLES,
	cageDe,
	casesLiees,
	conflitsCalcudoku,
	contrainteCages,
	estFixe,
	geometrieCalcudoku,
	grilleTerminee,
	moteurCalcudoku,
	phraseCage,
	poser,
	tirerGrille,
	type Cage,
	type Operation,
	type Partie,
} from '../src/core/jeux/calcudoku';
import { creerMoteur, type Valeur, type Valeurs } from '../src/core/jeux/grille-contraintes';
import { addProfile, initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { tirage } from './aleatoire';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ── L'ORACLE, indépendant du jeu ────────────────────────────────────────── */

/** Le côté attendu, écrit en dur : l'oracle ne SUIT pas `COTE`, il le juge. Un
    oracle bâti sur la constante du module serait d'accord avec elle quoi qu'elle
    vaille. */
const C = 4;
const N = C * C;

const OPERATIONS: Operation[] = ['somme', 'difference', 'produit'];

function permutations(xs: readonly number[]): number[][] {
	if (xs.length <= 1) return [[...xs]];
	const out: number[][] = [];
	for (let i = 0; i < xs.length; i++) {
		const reste = [...xs.slice(0, i), ...xs.slice(i + 1)];
		for (const p of permutations(reste)) out.push([xs[i], ...p]);
	}
	return out;
}

/** Les 576 carrés latins d'ordre 4, en ligne-major : empilement de permutations
    avec élagage sur les colonnes déjà posées. */
const LATINS: Valeurs[] = (() => {
	const perms = permutations([1, 2, 3, 4]);
	const out: Valeurs[] = [];
	const g: number[] = new Array<number>(N).fill(0);
	const empiler = (y: number): void => {
		if (y === C) {
			out.push(g.slice());
			return;
		}
		for (const p of perms) {
			let ok = true;
			for (let x = 0; x < C && ok; x++) {
				for (let yy = 0; yy < y; yy++) {
					if (g[yy * C + x] === p[x]) {
						ok = false;
						break;
					}
				}
			}
			if (!ok) continue;
			for (let x = 0; x < C; x++) g[y * C + x] = p[x];
			empiler(y + 1);
		}
	};
	empiler(0);
	return out;
})();

/** Un carré latin vérifié à la main : sert à prouver que l'énumération contient
    bien une grille connue, et de support aux cas construits à la main. */
const SOL4: Valeurs = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];

const ligneDe = (i: number): number => Math.floor(i / C);
const colonneDe = (i: number): number => i % C;

/** Le résultat d'une cage à partir de la LISTE de ses valeurs, ou `null` si elle
    ne s'évalue pas : une case vide, ou une différence qui n'a pas exactement
    deux termes — auquel cas le critère 12 est déjà enfreint et le dira. */
function evalueValeurs(c: Cage, vals: readonly number[]): number | null {
	if (vals.some((x) => !x)) return null;
	if (c.operation === 'somme') return vals.reduce((a, b) => a + b, 0);
	if (c.operation === 'produit') return vals.reduce((a, b) => a * b, 1);
	if (vals.length !== 2) return null;
	return Math.abs(vals[0] - vals[1]);
}

const valeursDe = (c: Cage, v: Valeurs): number[] => c.cases.map((i) => v[i] ?? 0);

const evalueCage = (c: Cage, v: Valeurs): number | null => evalueValeurs(c, valeursDe(c, v));

const respecteCages = (cages: readonly Cage[], v: Valeurs): boolean =>
	cages.every((c) => evalueCage(c, v) === c.objectif);

/** La cage peut-elle ENCORE atteindre son objectif ? Lecture LOCALE (cf.
    en-tête) : les cases vides prennent n'importe quelle valeur de 1 à 4,
    indépendamment les unes des autres. */
function cagePossibleAvec(c: Cage, vals: number[]): boolean {
	const vides: number[] = [];
	for (let k = 0; k < vals.length; k++) if (!vals[k]) vides.push(k);
	const essai = vals.slice();
	const rec = (k: number): boolean => {
		if (k === vides.length) return evalueValeurs(c, essai) === c.objectif;
		for (let s = 1; s <= C; s++) {
			essai[vides[k]] = s;
			if (rec(k + 1)) return true;
		}
		essai[vides[k]] = 0;
		return false;
	};
	return rec(0);
}

const cagePossible = (c: Cage, v: Valeurs): boolean => cagePossibleAvec(c, valeursDe(c, v));

const cageOracle = (cages: readonly Cage[], i: number): Cage | undefined =>
	cages.find((c) => c.cases.includes(i));

/** Les valeurs encore possibles pour une case. `cages` à `null` = la SEULE
    logique de ligne et de colonne, ce que mesure le critère 32. */
function candidatsOracle(cages: readonly Cage[] | null, v: Valeurs, i: number): Set<Valeur> {
	const out = new Set<Valeur>();
	const y = ligneDe(i);
	const x = colonneDe(i);
	const c = cages ? cageOracle(cages, i) : undefined;
	for (let s = 1; s <= C; s++) {
		let ok = true;
		for (let k = 0; k < C; k++) {
			if (k !== x && v[y * C + k] === s) ok = false;
			if (k !== y && v[k * C + x] === s) ok = false;
		}
		if (ok && c)
			ok = cagePossibleAvec(
				c,
				c.cases.map((j) => (j === i ? s : (v[j] ?? 0))),
			);
		if (ok) out.add(s);
	}
	return out;
}

/** Ne pose que les cases dont UNE seule valeur reste possible, en boucle, et
    rend le point fixe (rempli ou non). C'est le solveur du critère 5, réécrit
    d'après son énoncé. */
function deduire(cages: readonly Cage[] | null, v: Valeurs): Valeurs {
	const g = v.slice();
	for (;;) {
		let pose = false;
		for (let i = 0; i < N; i++) {
			if (g[i]) continue;
			const cand = candidatsOracle(cages, g, i);
			if (cand.size === 1) {
				g[i] = [...cand][0];
				pose = true;
			}
		}
		if (!pose) return g;
	}
}

const estRemplie = (v: Valeurs): boolean =>
	v.length === N && v.every((x) => Number.isInteger(x) && x >= 1 && x <= C);

const accordeAvec = (enonce: Valeurs, s: Valeurs): boolean => {
	for (let i = 0; i < N; i++) if (enonce[i] && enonce[i] !== s[i]) return false;
	return true;
};

function compteSolutions(cages: readonly Cage[], enonce: Valeurs, max: number): number {
	let n = 0;
	for (const s of LATINS) {
		if (!accordeAvec(enonce, s) || !respecteCages(cages, s)) continue;
		if (++n >= max) break;
	}
	return n;
}

function solutionUnique(cages: readonly Cage[], enonce: Valeurs): Valeurs | null {
	let trouvee: Valeurs | null = null;
	for (const s of LATINS) {
		if (!accordeAvec(enonce, s) || !respecteCages(cages, s)) continue;
		if (trouvee) return null;
		trouvee = s.slice();
	}
	return trouvee;
}

/** Les cases d'une cage sont-elles toutes reliées par des voisines orthogonales ? */
function contigue(cases: readonly number[]): boolean {
	if (cases.length === 0) return false;
	const dans = new Set(cases);
	const vus = new Set<number>([cases[0]]);
	const pile: number[] = [cases[0]];
	for (;;) {
		const i = pile.pop();
		if (i === undefined) break;
		const y = ligneDe(i);
		const x = colonneDe(i);
		for (const [dy, dx] of [
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1],
		]) {
			const ny = y + dy;
			const nx = x + dx;
			if (ny < 0 || ny >= C || nx < 0 || nx >= C) continue;
			const j = ny * C + nx;
			if (dans.has(j) && !vus.has(j)) {
				vus.add(j);
				pile.push(j);
			}
		}
	}
	return vus.size === cases.length;
}

const voisines = (a: number, b: number): boolean =>
	Math.abs(ligneDe(a) - ligneDe(b)) + Math.abs(colonneDe(a) - colonneDe(b)) === 1;

/** Exécute sans laisser passer d'exception : « refuser en silence » se teste par
    ce qui est RENDU, et une exception doit se lire comme telle dans l'échec. */
function sansLever<T>(f: () => T): { valeur: T | null; leve: boolean } {
	try {
		return { valeur: f(), leve: false };
	} catch {
		return { valeur: null, leve: true };
	}
}

/* ── FABRIQUE DE PARTIES À LA MAIN ───────────────────────────────────────── */

const vide = (): Valeurs => new Array<number>(N).fill(0);

function avec(...poses: [number, Valeur][]): Valeurs {
	const v = vide();
	for (const [i, s] of poses) v[i] = s;
	return v;
}

const partie = (cages: Cage[], enonce: Valeurs, valeurs?: Valeurs): Partie => ({
	cages: cages.map((c) => ({ ...c, cases: [...c.cases] })),
	enonce: [...enonce],
	valeurs: [...(valeurs ?? enonce)],
});

const tri = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);

/** Une cage garée loin des cas testés, ni pleine ni condamnée : elle évite de
    tester le signalement sur une liste de cages VIDE, forme qu'aucune grille
    servie n'a jamais. */
const CAGE_TEMOIN: Cage = { cases: [12, 13], operation: 'difference', objectif: 1 };

/* ── LES ÉCHANTILLONS ────────────────────────────────────────────────────── */

const N_ORDINAIRES = 150;
const N_PREMIERES = 50;

interface Echantillon {
	parties: Partie[];
	pannes: number[];
}

function tirerN(n: number, premiere: boolean): Echantillon {
	const parties: Partie[] = [];
	const pannes: number[] = [];
	for (let graine = 1; graine <= n; graine++) {
		// Le cas ordinaire appelle `tirerGrille` SANS second argument : c'est la
		// forme que le runner emploiera, et elle doit marcher par défaut.
		const p = premiere ? tirerGrille(tirage(graine), true) : tirerGrille(tirage(graine));
		if (p) parties.push(p);
		else pannes.push(graine);
	}
	return { parties, pannes };
}

let cacheOrdinaires: Echantillon | null = null;
let cachePremieres: Echantillon | null = null;
const ordinaires = (): Echantillon => (cacheOrdinaires ??= tirerN(N_ORDINAIRES, false));
const premieres = (): Echantillon => (cachePremieres ??= tirerN(N_PREMIERES, true));

/** Les deux échantillons ensemble : une grille de tutoriel reste une grille
    SERVIE, donc tenue par les critères 4 à 13 comme les autres. */
const servies = (): Partie[] => [...ordinaires().parties, ...premieres().parties];

/* ── L'ORACLE SE JUGE LUI-MÊME D'ABORD ───────────────────────────────────── */

describe('l’oracle de ce fichier', () => {
	it('énumère exactement les 576 carrés latins d’ordre 4', () => {
		// Si ce nombre bouge, aucun des critères 4, 5, 32 et 33 ne veut plus rien
		// dire : ils se jugent tous sur cette énumération.
		expect(LATINS.length).toBe(576);
	});

	it('en contient un vérifié à la main', () => {
		expect(LATINS.some((g) => g.every((x, i) => x === SOL4[i]))).toBe(true);
	});

	it('sait reconnaître une cage juste, une cage fausse et une cage condamnée', () => {
		const somme: Cage = { cases: [0, 1], operation: 'somme', objectif: 5 };
		expect(evalueCage(somme, avec([0, 1], [1, 4]))).toBe(5);
		expect(evalueCage(somme, avec([0, 1], [1, 2]))).toBe(3);
		expect(cagePossible(somme, avec([0, 1]))).toBe(true);
		expect(cagePossible({ ...somme, objectif: 3 }, avec([0, 4]))).toBe(false);
	});
});

/* ── LA GRILLE ET SA GÉNÉRATION ──────────────────────────────────────────── */

describe('#667 critères 1 et 2 — une seule taille, et aucune région', () => {
	it('critère 1 : le module n’expose qu’un 4×4, sans paramètre de taille', () => {
		expect(COTE).toBe(4);
		expect(geometrieCalcudoku.length).toBe(0);
		expect(geometrieCalcudoku().cotes).toBe(4);
	});

	it('critère 2 : `casesLiees` ne relie qu’une ligne et une colonne, jamais un bloc', () => {
		/* Cas d'échec : « la contrainte de région est enregistrée au moteur ». En 4×4
		   un bloc 2×2 collerait les cases 0 et 5, qui ne partagent ni ligne ni
		   colonne. Six cases liées, pas huit. C'est aussi la moitié logique du
		   critère 21 : la ligne et la colonne d'un côté (le fond plat), la cage de
		   l'autre (le trait) — `casesLiees` ne prend d'ailleurs pas de `Partie`, donc
		   elle ne PEUT pas connaître les cages. */
		for (let i = 0; i < N; i++) {
			const attendu = new Set<number>();
			for (let k = 0; k < C; k++) {
				const l = ligneDe(i) * C + k;
				const c = k * C + colonneDe(i);
				if (l !== i) attendu.add(l);
				if (c !== i) attendu.add(c);
			}
			expect(tri(casesLiees(i)), `case ${i}`).toEqual(tri(attendu));
			expect(casesLiees(i).size, `case ${i}`).toBe(6);
		}
		expect(casesLiees(0).has(5)).toBe(false);
		expect(casesLiees(0).has(0)).toBe(false);
	});

	it('critère 2 : le moteur sans cage n’interdit que la ligne et la colonne', () => {
		/* La preuve par le comportement : un 1 posé en 0 doit rester possible en 5
		   (même bloc 2×2, ligne et colonne différentes). Une contrainte de région
		   enregistrée le supprimerait. */
		const m = moteurCalcudoku([]);
		const v = avec([0, 1]);
		expect([...m.candidats(v, 5)].sort()).toEqual([1, 2, 3, 4]);
		expect([...m.candidats(v, 1)].sort()).toEqual([2, 3, 4]);
		expect([...m.candidats(v, 4)].sort()).toEqual([2, 3, 4]);
	});
});

describe('#667 critères 4 et 5 — solution unique, et déduction élémentaire seule', () => {
	it('critère 4 : chaque grille servie a EXACTEMENT une solution', () => {
		/* Énumération exhaustive des 576 carrés latins : « exactement une » est ici
		   une certitude, pas une estimation. Deux solutions, et l'enfant peut remplir
		   la grille autrement puis se voir refuser ; zéro, et il ne finira jamais. */
		const fautives = servies()
			.map((p, n) => ({ n, solutions: compteSolutions(p.cages, p.enonce, 2) }))
			.filter((x) => x.solutions !== 1);
		expect(fautives).toEqual([]);
	});

	it('critère 5 : chaque grille servie se termine par déduction élémentaire seule', () => {
		/* Cas d'échec littéral : « un solveur qui n'applique que cette règle reste
		   bloqué ». Une grille qui bloque laisse l'enfant tourner sur les cases
		   restantes sans qu'aucun coup ne progresse, et sans que rien ne lui dise que
		   ce n'est pas sa faute. */
		const bloquees = servies()
			.map((p, n) => ({ n, restantes: deduire(p.cages, p.enonce).filter((x) => !x).length }))
			.filter((x) => x.restantes > 0);
		expect(bloquees).toEqual([]);
	});

	it('critère 5 : la déduction tombe sur la solution, pas sur une autre grille', () => {
		// Un solveur qui ne pose que du forcé DOIT atteindre la solution unique du
		// critère 4. Si les deux divergent, l'un des deux ment.
		for (const p of servies()) {
			const attendue = solutionUnique(p.cages, p.enonce);
			expect(attendue).not.toBeNull();
			if (attendue) expect(deduire(p.cages, p.enonce)).toEqual(attendue);
		}
	});
});

describe('#667 critère 6 — au moins deux cases pré-remplies, non modifiables', () => {
	it('critère 6 : aucune grille n’est servie avec moins de deux données', () => {
		// Cas d'échec littéral : « une grille est servie entièrement vide ». Mesuré au
		// cadrage, un 4×4 sans donnée ne satisfait JAMAIS le critère 5.
		const maigres = servies()
			.map((p, n) => ({ n, donnees: p.enonce.filter((x) => x !== 0).length }))
			.filter((x) => x.donnees < 2);
		expect(maigres).toEqual([]);
	});

	it('critère 6 : l’énoncé est fait de valeurs jouables, et laisse à faire', () => {
		for (const p of servies()) {
			expect(p.enonce.length).toBe(N);
			for (const x of p.enonce) expect(Number.isInteger(x) && x >= 0 && x <= C).toBe(true);
			expect(p.enonce.filter((x) => x === 0).length).toBeGreaterThanOrEqual(2);
		}
	});

	it('critère 6 : une grille neuve ne porte que ses données', () => {
		// Rien n'est posé au tirage : l'état courant PART de l'énoncé.
		for (const p of servies()) expect(p.valeurs).toEqual(p.enonce);
	});

	it('critère 6 : `estFixe` désigne exactement les cases pré-remplies', () => {
		for (const p of servies()) {
			for (let i = 0; i < N; i++) expect(estFixe(p, i), `case ${i}`).toBe(p.enonce[i] !== 0);
		}
	});

	it('critère 6 : une case pré-remplie refuse la saisie, sans lever', () => {
		/* Cas d'échec littéral : « une case pré-remplie accepte une saisie ». Le refus
		   est SILENCIEUX : une exception serait une panne pour l'enfant. */
		const p = ordinaires().parties[0];
		expect(p).toBeDefined();
		const donnee = p.enonce.findIndex((x) => x !== 0);
		expect(donnee).toBeGreaterThanOrEqual(0);
		const autre = ((p.enonce[donnee] % C) + 1) as Valeur;
		const ecrase = sansLever(() => poser(p, donnee, autre));
		expect(ecrase.leve).toBe(false);
		expect(ecrase.valeur?.valeurs).toEqual(p.valeurs);
		const efface = sansLever(() => poser(p, donnee, 0));
		expect(efface.leve).toBe(false);
		expect(efface.valeur?.valeurs).toEqual(p.valeurs);
	});
});

describe('#667 critère 7 — une panne plutôt qu’une grille non garantie', () => {
	it('critère 7 : le tirage aboutit sur des graines ordinaires', () => {
		/* Mesuré au cadrage : 18,7 % de grilles servables à six cages, donc cent
		   essais échouent avec une probabilité de l'ordre de 10⁻⁹. Un `null` ici ne
		   serait pas de la malchance, ce serait un générateur qui ne trouve pas. */
		expect(ordinaires().pannes).toEqual([]);
		expect(premieres().pannes).toEqual([]);
	});

	it('critère 7 : un générateur dégénéré rend une panne, ou une grille GARANTIE', () => {
		/* Cas d'échec littéral : « une grille est servie sans avoir passé les trois »
		   (critères 4, 5 et 6). On enferme le générateur dans des régimes où un
		   tirage avec rejet ne peut plus varier : ce qui en sort doit être `null`, ou
		   une grille qui tient quand même les trois garanties. Et rien ne doit lever —
		   le runner attend une valeur pour afficher sa panne, pas une exception. */
		const degeneres: [string, () => number][] = [
			['toujours 0', () => 0],
			['toujours presque 1', () => 0.9999999],
			['toujours 0,5', () => 0.5],
			[
				'alternance 0 / presque 1',
				(() => {
					let k = 0;
					return () => (k++ % 2 === 0 ? 0 : 0.9999999);
				})(),
			],
		];
		for (const [nom, r] of degeneres) {
			const essai = sansLever(() => tirerGrille(r));
			expect(essai.leve, nom).toBe(false);
			const servie = essai.valeur;
			if (!servie) continue;
			expect(compteSolutions(servie.cages, servie.enonce, 2), nom).toBe(1);
			expect(deduire(servie.cages, servie.enonce).filter((x) => !x).length, nom).toBe(0);
			expect(servie.enonce.filter((x) => x !== 0).length, nom).toBeGreaterThanOrEqual(2);
		}
	});
});

describe('#667 critère 8 — le tirage est pur et déterministe', () => {
	it('critère 8 : deux appels de même graine rendent la MÊME grille', () => {
		// Cas d'échec littéral : « deux appels de mêmes entrées rendent des grilles
		// différentes ». Sans cela, aucun invariant de ce fichier n'est rejouable.
		for (const graine of [1, 7, 42, 1234]) {
			expect(tirerGrille(tirage(graine)), `graine ${graine}`).toEqual(tirerGrille(tirage(graine)));
			expect(tirerGrille(tirage(graine), true), `graine ${graine}, première`).toEqual(
				tirerGrille(tirage(graine), true),
			);
		}
	});

	it('critère 8 : deux graines différentes ne rendent pas la même grille', () => {
		// L'autre bord : un tirage figé serait déterministe ET inutile.
		const distinctes = new Set(ordinaires().parties.map((p) => JSON.stringify(p.enonce)));
		expect(distinctes.size).toBeGreaterThan(N_ORDINAIRES / 2);
	});

	it('critère 8 : le tirage n’appelle jamais `Math.random`', () => {
		const espion = vi.spyOn(Math, 'random');
		tirerGrille(tirage(3));
		tirerGrille(tirage(4), true);
		expect(espion).not.toHaveBeenCalled();
		espion.mockRestore();
	});

	it('critère 8 : le tirage ne dépend ni du profil ni du stockage', () => {
		/* Cas d'échec littéral : « la fonction lit le stockage ». On le prend par la
		   conséquence observable : deux profils, même graine, même grille. Un module
		   qui lirait une préférence ou une partie en cours dériverait. */
		const avant = tirerGrille(tirage(11));
		addProfile('Cadette');
		expect(tirerGrille(tirage(11))).toEqual(avant);
	});
});

/* ── LES CAGES ───────────────────────────────────────────────────────────── */

describe('#667 critère 9 — toute cage est contiguë', () => {
	it('critère 9 : aucune cage servie n’a deux cases que ne relie aucun chemin', () => {
		/* C'est le critère qui porte toute la mesure du cadrage : sans contiguïté, une
		   cage de deux cases peut tomber sur deux cases sans ligne ni colonne
		   commune, donc de valeurs éventuellement ÉGALES — et les cibles
		   multiplicatives « jamais ambiguës » du contexte redeviennent ambiguës. */
		const fautives: { grille: number; cases: number[] }[] = [];
		servies().forEach((p, grille) => {
			for (const c of p.cages) if (!contigue(c.cases)) fautives.push({ grille, cases: c.cases });
		});
		expect(fautives).toEqual([]);
	});

	it('critère 9 : les deux cases d’une cage de deux sont voisines, donc de valeurs différentes', () => {
		// La conséquence que le contexte de l'issue fait porter à ce critère.
		for (const p of servies()) {
			for (const c of p.cages) {
				if (c.cases.length !== 2) continue;
				expect(voisines(c.cases[0], c.cases[1]), JSON.stringify(c)).toBe(true);
			}
		}
		for (const p of servies()) {
			const s = solutionUnique(p.cages, p.enonce);
			if (!s) continue;
			for (const c of p.cages) {
				if (c.cases.length === 2) expect(s[c.cases[0]]).not.toBe(s[c.cases[1]]);
			}
		}
	});

	it('critère 9 : les cases d’une cage sont des index valides et distincts', () => {
		for (const p of servies()) {
			for (const c of p.cages) {
				expect(new Set(c.cases).size, JSON.stringify(c)).toBe(c.cases.length);
				for (const i of c.cases) {
					expect(Number.isInteger(i) && i >= 0 && i < N, `index ${i}`).toBe(true);
				}
			}
		}
	});
});

describe('#667 critère 10 — au plus 7 cages, de 2 à 4 cases, de moyenne au moins 2,3', () => {
	it('critère 10 : le nombre de cages ne dépasse jamais 7', () => {
		for (const p of servies()) expect(p.cages.length).toBeLessThanOrEqual(7);
	});

	it('critère 10 : aucune cage de 1 ni de 5 cases', () => {
		for (const p of servies()) {
			for (const c of p.cages) {
				expect(c.cases.length, JSON.stringify(c)).toBeGreaterThanOrEqual(2);
				expect(c.cases.length, JSON.stringify(c)).toBeLessThanOrEqual(4);
			}
		}
	});

	it('critère 10 : la taille moyenne des cages atteint 2,3', () => {
		const maigres = servies()
			.map((p, n) => ({
				n,
				moyenne: p.cages.reduce((a, c) => a + c.cases.length, 0) / Math.max(1, p.cages.length),
			}))
			.filter((x) => x.moyenne < 2.3);
		expect(maigres).toEqual([]);
	});

	it('critère 10 : deux cages ne se partagent jamais une case', () => {
		// `cageDe` rend UNE cage : une case appartenant à deux cages ferait mentir la
		// phrase du critère 15 une fois sur deux.
		for (const p of servies()) {
			const vues = new Set<number>();
			for (const c of p.cages) {
				for (const i of c.cases) {
					expect(vues.has(i), `case ${i} dans deux cages`).toBe(false);
					vues.add(i);
				}
			}
		}
	});
});

describe('#667 critères 11 et 12 — les opérations, et le nombre de cases qu’elles admettent', () => {
	it('critère 11 : aucune cage ne porte autre chose que somme, différence ou produit', () => {
		for (const p of servies()) {
			for (const c of p.cages) expect(OPERATIONS).toContain(c.operation);
		}
	});

	it('critère 11 : aucun symbole n’est un signe de division', () => {
		// Cas d'échec littéral : « un objectif de cage porte une division ».
		for (const o of OPERATIONS) expect(SYMBOLES[o], `symbole ${o}`).not.toMatch(/[÷/:]/);
	});

	it('critère 11 : aucune phrase ne parle de diviser ni de partager en parts égales', () => {
		const textes = [
			PHRASE_DEFAUT,
			...OPERATIONS.map((o) => phraseCage({ cases: [0, 1], operation: o, objectif: 2 })),
		];
		for (const t of textes) {
			expect(t.toLowerCase(), t).not.toContain('divis');
			expect(t, t).not.toContain('÷');
		}
	});

	it('critère 12 : une cage de différence porte exactement 2 cases', () => {
		// La différence n'a pas de sens univoque à trois termes.
		for (const p of servies()) {
			for (const c of p.cages) {
				if (c.operation === 'difference') expect(c.cases.length, JSON.stringify(c)).toBe(2);
			}
		}
	});

	it('critère 12 : une cage de multiplication porte exactement 2 cases', () => {
		// Les deux raisons mesurées du contexte : un produit à trois facteurs est un
		// calcul composé, et l'ambiguïté y devient majoritaire (8 = 1×2×4 = 2×2×2).
		for (const p of servies()) {
			for (const c of p.cages) {
				if (c.operation === 'produit') expect(c.cases.length, JSON.stringify(c)).toBe(2);
			}
		}
	});

	it('critère 12 : seule l’addition va jusqu’à 3 ou 4 cases', () => {
		for (const p of servies()) {
			for (const c of p.cages) {
				if (c.cases.length > 2) expect(c.operation, JSON.stringify(c)).toBe('somme');
			}
		}
	});

	it('critères 9 et 12 : les cibles servies sont celles que deux cases voisines permettent', () => {
		/* Conséquence arithmétique des deux critères réunis, écrite dans le contexte
		   de l'issue : deux cases voisines portent des valeurs différentes de 1 à 4,
		   donc les produits possibles sont 2, 3, 4, 6, 8 et 12, et les différences 1,
		   2 et 3. Une cible hors de ces listes est une cage insoluble. */
		for (const p of servies()) {
			for (const c of p.cages) {
				const ou = JSON.stringify(c);
				if (c.operation === 'produit') expect([2, 3, 4, 6, 8, 12], ou).toContain(c.objectif);
				if (c.operation === 'difference') expect([1, 2, 3], ou).toContain(c.objectif);
				if (c.operation === 'somme') expect(c.objectif, ou).toBeGreaterThanOrEqual(3);
			}
		}
	});
});

describe('#667 critères 13 et 14 — l’étiquette de cage', () => {
	it('critère 13 : les trois opérations ont la même grammaire d’étiquette', () => {
		/* Cas d'échec littéral : « une opération reçoit un bandeau ou un mot là où les
		   autres ont un badge ». Sur la surface logique, cela se mesure : un symbole
		   par opération, d'UN seul caractère, tous distincts, et aucun qui soit un
		   chiffre — il se confondrait avec le nombre qui le précède. */
		expect(new Set(Object.keys(SYMBOLES))).toEqual(new Set(OPERATIONS));
		const symboles = OPERATIONS.map((o) => SYMBOLES[o]);
		for (const s of symboles) {
			expect([...s].length, `symbole ${JSON.stringify(s)}`).toBe(1);
			expect(s, `symbole ${JSON.stringify(s)}`).not.toMatch(/[\s0-9]/);
		}
		expect(new Set(symboles).size).toBe(3);
	});

	it('critère 13 : l’étiquette servie tient en 2 ou 3 caractères', () => {
		// « Le nombre d'abord », donc la longueur vaut celle du nombre plus celle du
		// symbole. Une cible à trois chiffres déborderait du coin de la case.
		for (const p of servies()) {
			for (const c of p.cages) {
				const etiquette = `${c.objectif}${SYMBOLES[c.operation]}`;
				expect([...etiquette].length, etiquette).toBeGreaterThanOrEqual(2);
				expect([...etiquette].length, etiquette).toBeLessThanOrEqual(3);
			}
		}
	});

	it('critère 14 : aucun symbole n’est un signe moins ni un plus-ou-moins', () => {
		/* Cas d'échec littéral : « le signe moins ou le signe plus-ou-moins apparaît
		   dans une étiquette de cage ». Le tiret ASCII est banni avec les autres : le
		   problème est la FAMILIARITÉ du signe, pas son point de code — un enfant qui
		   lit « 3- » file sur son a priori d'ordre imposé, quel que soit le tiret
		   employé. Le « + » de l'addition n'est évidemment pas concerné.

		   NOTE. L'issue retient « ↔ » pour la différence. Ce glyphe n'est
		   volontairement PAS verrouillé ici : les notes de l'issue le disent
		   contestable et non éprouvé sur un enfant réel, et la clause *Violé si* du
		   critère porte sur l'absence des deux signes, pas sur la présence de
		   celui-là. Un test qui figerait « ↔ » rougirait le jour d'un essai
		   concluant, sans que rien ne soit cassé. */
		const interdits = /[-−–—±]/;
		for (const o of OPERATIONS) {
			expect(SYMBOLES[o], `symbole ${o} = ${JSON.stringify(SYMBOLES[o])}`).not.toMatch(interdits);
		}
		for (const p of servies()) {
			for (const c of p.cages) {
				const etiquette = `${c.objectif}${SYMBOLES[c.operation]}`;
				expect(etiquette, etiquette).not.toMatch(interdits);
			}
		}
	});

	it('critère 14 : aucune phrase ne ramène le signe moins ou le plus-ou-moins', () => {
		/* Sur les phrases on ne bannit que les deux signes NOMMÉS par le critère : un
		   tiret ASCII peut légitimement servir de trait d'union dans une phrase
		   française, « − » et « ± » jamais. */
		const textes = [
			PHRASE_DEFAUT,
			...OPERATIONS.flatMap((o) =>
				[1, 2, 3, 12].map((n) => phraseCage({ cases: [0, 1], operation: o, objectif: n })),
			),
		];
		for (const t of textes) expect(t, JSON.stringify(t)).not.toMatch(/[−±]/);
	});
});

/* ── LA PHRASE D'EXPLICATION ─────────────────────────────────────────────── */

describe('#667 critères 15 à 17 — la phrase qui dit l’objectif en toutes lettres', () => {
	it('critère 17 : les trois phrases sont exactement celles de l’issue', () => {
		expect(phraseCage({ cases: [0, 1, 2], operation: 'somme', objectif: 9 })).toBe(
			'Dans cette cage, additionne les nombres pour trouver 9.',
		);
		expect(phraseCage({ cases: [0, 1], operation: 'produit', objectif: 12 })).toBe(
			'Dans cette cage, multiplie les nombres pour trouver 12.',
		);
		expect(phraseCage({ cases: [0, 1], operation: 'difference', objectif: 2 })).toBe(
			'Dans cette cage, trouve deux nombres qui ont 2 de différence.',
		);
	});

	it('critère 17 : aucune phrase servie ne dépasse le budget de 90 caractères', () => {
		for (const p of servies()) {
			for (const c of p.cages) {
				const phrase = phraseCage(c);
				expect([...phrase].length, phrase).toBeLessThanOrEqual(90);
				expect(phrase, JSON.stringify(c)).toContain(String(c.objectif));
			}
		}
	});

	it('critère 16 : une phrase par défaut existe, et n’est l’objectif d’aucune cage', () => {
		/* Cas d'échec littéral : « la zone est vide au montage ». Et la phrase par
		   défaut doit se distinguer d'une phrase de cage, sinon l'enfant croit lire un
		   objectif alors que rien n'est sélectionné. */
		expect(PHRASE_DEFAUT.trim()).not.toBe('');
		expect([...PHRASE_DEFAUT].length).toBeLessThanOrEqual(90);
		for (const o of OPERATIONS) {
			for (let n = 1; n <= 14; n++) {
				expect(PHRASE_DEFAUT).not.toBe(phraseCage({ cases: [0, 1], operation: o, objectif: n }));
			}
		}
	});

	it('critères 15 et 21 : `cageDe` rend la cage de la case, et rien pour les autres', () => {
		/* La phrase du critère 15 vient de là, et la mise en évidence par le trait du
		   critère 21 aussi. Une case hors cage (une donnée du critère 6) n'a aucun
		   objectif à annoncer. */
		for (const p of servies()) {
			const enCage = new Set<number>();
			for (const c of p.cages) {
				for (const i of c.cases) {
					enCage.add(i);
					const rendue = cageDe(p, i);
					expect(rendue, `case ${i}`).toBeDefined();
					expect(rendue?.cases, `case ${i}`).toEqual(c.cases);
					expect(rendue?.operation, `case ${i}`).toBe(c.operation);
					expect(rendue?.objectif, `case ${i}`).toBe(c.objectif);
				}
			}
			for (let i = 0; i < N; i++) {
				if (!enCage.has(i)) expect(cageDe(p, i), `case ${i}`).toBeUndefined();
			}
		}
	});

	it('critère 15 : `cageDe` ne lève pas sur un index hors grille', () => {
		const p = partie([CAGE_TEMOIN], vide());
		for (const i of [-1, N, 99, 1.5, Number.NaN]) {
			const essai = sansLever(() => cageDe(p, i));
			expect(essai.leve, `index ${i}`).toBe(false);
			expect(essai.valeur, `index ${i}`).toBeFalsy();
		}
	});
});

/* ── LE GESTE ────────────────────────────────────────────────────────────── */

describe('#667 critères 19 et 22 — poser, effacer, et ne jamais bloquer', () => {
	const base = (): Partie => partie([CAGE_TEMOIN], vide());

	it('critère 22 : poser ne mute pas la partie reçue', () => {
		/* Le générateur revient en arrière et le runner garde l'état courant : une
		   fonction qui écrirait dans le tableau reçu corromprait l'un ou l'autre sans
		   rien lever. */
		const p = base();
		const copie = JSON.parse(JSON.stringify(p)) as Partie;
		const apres = poser(p, 0, 3);
		expect(p).toEqual(copie);
		expect(apres).not.toBe(p);
		expect(apres.valeurs).not.toBe(p.valeurs);
		expect(apres.enonce).toEqual(p.enonce);
		expect(apres.cages).toEqual(p.cages);
		expect(apres.valeurs[0]).toBe(3);
	});

	it('critère 19 : poser 0 efface la case', () => {
		// L'effacement passe par un bouton explicite, jamais par un geste modifié :
		// côté logique, c'est une pose de la valeur 0, pas une fonction à part.
		const p = poser(base(), 5, 4);
		expect(p.valeurs[5]).toBe(4);
		expect(poser(p, 5, 0).valeurs[5]).toBe(0);
	});

	it('critère 22 : poser une valeur qui crée un conflit n’est pas refusé', () => {
		/* Cas d'échec littéral : le signalement « empêche de poser ». L'enfant doit
		   pouvoir poser, voir, et défaire lui-même. */
		let p = poser(base(), 0, 2);
		p = poser(p, 2, 2);
		expect(p.valeurs[2]).toBe(2);
		expect(tri(conflitsCalcudoku(p))).toEqual([0, 2]);
	});

	it('poser refuse en silence ce qui n’a pas de sens', () => {
		/* Une exception serait une panne pour l'enfant : un doigt qui glisse sur un
		   bord ne doit pas casser l'écran. Le refus est donc MUET — la partie rendue
		   porte les mêmes valeurs. */
		const p = poser(base(), 0, 1);
		for (const i of [-1, N, 99, 1.5, Number.NaN]) {
			const essai = sansLever(() => poser(p, i, 3));
			expect(essai.leve, `index ${i}`).toBe(false);
			expect(essai.valeur?.valeurs, `index ${i}`).toEqual(p.valeurs);
		}
		for (const s of [5, -1, 1.5, Number.NaN, 99]) {
			const essai = sansLever(() => poser(p, 5, s));
			expect(essai.leve, `valeur ${s}`).toBe(false);
			expect(essai.valeur?.valeurs, `valeur ${s}`).toEqual(p.valeurs);
		}
	});
});

/* ── LE SIGNALEMENT ──────────────────────────────────────────────────────── */

describe('#667 critère 22 — le doublon de ligne ou de colonne', () => {
	const base = (valeurs: Valeurs): Partie => partie([CAGE_TEMOIN], vide(), valeurs);

	it('critère 22 : un doublon de ligne marque LES DEUX cases en cause', () => {
		// « Sur toutes les cases en cause à la fois » : le moteur ne sait pas laquelle
		// est « la mauvaise », et prétendre le savoir serait un verdict.
		expect(tri(conflitsCalcudoku(base(avec([0, 2], [2, 2]))))).toEqual([0, 2]);
	});

	it('critère 22 : un doublon de colonne aussi', () => {
		expect(tri(conflitsCalcudoku(base(avec([1, 3], [9, 3]))))).toEqual([1, 9]);
	});

	it('critère 22 : trois cases identiques sont marquées toutes les trois', () => {
		expect(tri(conflitsCalcudoku(base(avec([4, 4], [5, 4], [6, 4]))))).toEqual([4, 5, 6]);
	});

	it('critère 22 : une ligne sans doublon reste muette', () => {
		expect(tri(conflitsCalcudoku(base(avec([0, 1], [1, 2], [2, 3], [3, 4]))))).toEqual([]);
	});

	it('critère 22 : deux cases égales sans ligne ni colonne commune ne sont pas un doublon', () => {
		// La grille n'a aucune région : 0 et 5 partagent un bloc 2×2 et rien d'autre.
		expect(tri(conflitsCalcudoku(base(avec([0, 2], [5, 2]))))).toEqual([]);
	});
});

describe('#667 critère 23 — la cage pleine dont le calcul ne tombe pas juste', () => {
	const p = (cage: Cage, valeurs: Valeurs): Partie => partie([cage, CAGE_TEMOIN], vide(), valeurs);

	it('critère 23 : une somme fausse marque toutes les cases de la cage', () => {
		const cage: Cage = { cases: [0, 1], operation: 'somme', objectif: 5 };
		expect(tri(conflitsCalcudoku(p(cage, avec([0, 1], [1, 2]))))).toEqual([0, 1]);
	});

	it('critère 23 : la même somme juste reste muette', () => {
		const cage: Cage = { cases: [0, 1], operation: 'somme', objectif: 5 };
		expect(tri(conflitsCalcudoku(p(cage, avec([0, 1], [1, 4]))))).toEqual([]);
	});

	it('critère 23 : une somme à trois et à quatre cases se juge pareil', () => {
		const trois: Cage = { cases: [0, 1, 2], operation: 'somme', objectif: 9 };
		expect(tri(conflitsCalcudoku(p(trois, avec([0, 2], [1, 3], [2, 4]))))).toEqual([]);
		expect(tri(conflitsCalcudoku(p(trois, avec([0, 1], [1, 2], [2, 3]))))).toEqual([0, 1, 2]);
		const quatre: Cage = { cases: [0, 1, 4, 5], operation: 'somme', objectif: 10 };
		expect(tri(conflitsCalcudoku(p(quatre, avec([0, 1], [1, 2], [4, 3], [5, 4]))))).toEqual([]);
		expect(
			tri(conflitsCalcudoku(p({ ...quatre, objectif: 11 }, avec([0, 1], [1, 2], [4, 3], [5, 4])))),
		).toEqual([0, 1, 4, 5]);
	});

	it('critère 23 : un produit faux marque la cage, le bon la laisse muette', () => {
		const cage: Cage = { cases: [0, 1], operation: 'produit', objectif: 6 };
		expect(tri(conflitsCalcudoku(p(cage, avec([0, 2], [1, 3]))))).toEqual([]);
		expect(tri(conflitsCalcudoku(p(cage, avec([0, 3], [1, 2]))))).toEqual([]);
		expect(tri(conflitsCalcudoku(p(cage, avec([0, 2], [1, 4]))))).toEqual([0, 1]);
	});

	it('critère 23 : une différence se juge SANS ordre imposé', () => {
		/* C'est la raison d'être du mot « différence » au critère 17 : « une
		   différence entre deux nombres n'appelle pas la question lequel en
		   premier ». Les deux ordres doivent donc être justes. */
		const cage: Cage = { cases: [0, 1], operation: 'difference', objectif: 2 };
		expect(tri(conflitsCalcudoku(p(cage, avec([0, 1], [1, 3]))))).toEqual([]);
		expect(tri(conflitsCalcudoku(p(cage, avec([0, 3], [1, 1]))))).toEqual([]);
		expect(tri(conflitsCalcudoku(p(cage, avec([0, 1], [1, 2]))))).toEqual([0, 1]);
	});

	it('critère 23 : une cage fausse dans une grille PLEINE est bien marquée', () => {
		// Le bord du critère 23 croisé avec le 22 : aucune ligne, aucune colonne n'est
		// en faute, et la grille est pourtant fausse.
		const cage: Cage = { cases: [0, 1], operation: 'somme', objectif: 99 };
		expect(tri(conflitsCalcudoku(partie([cage], vide(), SOL4)))).toEqual([0, 1]);
	});
});

describe('#667 critère 24 — la cage incomplète devenue impossible', () => {
	const p = (cage: Cage, valeurs: Valeurs): Partie => partie([cage, CAGE_TEMOIN], vide(), valeurs);

	/* Ce qui est affirmé ici est la moitié NON contestable du critère : la cage
	   condamnée n'est pas muette, et ce qui la condamne est signalé. Voir
	   l'en-tête pour la contradiction avec le critère 25 sur les cases VIDES de
	   cette cage : elle est tranchée dans le describe du critère 25, pas ici. */

	it('critère 24 : une somme à deux cases devenue hors d’atteinte est signalée', () => {
		// 4 posé dans une cage « 3+ » : la case restante devrait valoir −1.
		const cage: Cage = { cases: [0, 1], operation: 'somme', objectif: 3 };
		expect(conflitsCalcudoku(p(cage, avec([0, 4]))).has(0)).toBe(true);
	});

	it('critère 24 : une différence devenue hors d’atteinte est signalée', () => {
		// 2 posé dans une cage de différence 3 : il faudrait 5 ou −1.
		const cage: Cage = { cases: [0, 1], operation: 'difference', objectif: 3 };
		expect(conflitsCalcudoku(p(cage, avec([0, 2]))).has(0)).toBe(true);
	});

	it('critère 24 : un produit devenu hors d’atteinte est signalé', () => {
		// 4 posé dans une cage « 6× » : il faudrait 1,5.
		const cage: Cage = { cases: [0, 1], operation: 'produit', objectif: 6 };
		expect(conflitsCalcudoku(p(cage, avec([0, 4]))).has(0)).toBe(true);
	});

	it('critère 24 : une cage de trois cases se condamne dès la première valeur', () => {
		/* C'est là que se joue l'invalidation différée que le critère veut couper :
		   1 posé dans une cage « 12+ » de trois cases laisse 11 à faire en deux cases,
		   donc plus de 8. L'erreur ne doit pas attendre le remplissage. */
		const cage: Cage = { cases: [0, 1, 2], operation: 'somme', objectif: 12 };
		expect(conflitsCalcudoku(p(cage, avec([0, 1]))).has(0)).toBe(true);
		const deux = conflitsCalcudoku(p(cage, avec([0, 1], [1, 2])));
		expect(deux.has(0)).toBe(true);
		expect(deux.has(1)).toBe(true);
	});

	it('critère 24 : une cage seulement INCOMPLÈTE reste muette', () => {
		/* Le contrôle inverse, et il compte autant : signaler une cage encore
		   atteignable transformerait le signalement en bruit de fond, et l'enfant
		   cesserait de le lire. */
		const somme: Cage = { cases: [0, 1, 2], operation: 'somme', objectif: 9 };
		expect(tri(conflitsCalcudoku(p(somme, avec([0, 1]))))).toEqual([]);
		const diff: Cage = { cases: [0, 1], operation: 'difference', objectif: 1 };
		expect(tri(conflitsCalcudoku(p(diff, avec([0, 1]))))).toEqual([]);
		const prod: Cage = { cases: [0, 1], operation: 'produit', objectif: 12 };
		expect(tri(conflitsCalcudoku(p(prod, avec([0, 3]))))).toEqual([]);
	});

	it('critère 24 : une cage entièrement vide reste muette', () => {
		const cage: Cage = { cases: [0, 1], operation: 'difference', objectif: 3 };
		expect(tri(conflitsCalcudoku(p(cage, vide())))).toEqual([]);
	});
});

describe('#667 critère 25 — rien n’est marqué avant d’être posé', () => {
	it('critère 25 : `conflitsCalcudoku` ne rend jamais l’index d’une case VIDE', () => {
		/* Formulation du critère sur la surface publique. « Signaler ce que l'enfant
		   A POSÉ est un fait sur son geste ; signaler ce qu'il POURRAIT poser est la
		   réponse. » Une case vide marquée dit à l'enfant qu'une valeur y est déjà
		   exclue, c'est-à-dire l'indice que le critère refuse.

		   C'EST ICI, ET NULLE PART AILLEURS, que se joue la contradiction avec le
		   critère 24 relevée en en-tête : si l'implémentation marque aussi les cases
		   vides d'une cage condamnée, c'est ce test-là qui tombe, et lui seul. */
		const cage: Cage = { cases: [0, 1], operation: 'somme', objectif: 3 };
		const p = partie([cage, CAGE_TEMOIN], vide(), avec([0, 4]));
		for (const i of conflitsCalcudoku(p)) expect(p.valeurs[i], `case ${i} est vide`).not.toBe(0);
	});

	it('critère 25 : une grille fraîchement servie n’a aucun conflit', () => {
		for (const p of servies()) expect(tri(conflitsCalcudoku(p))).toEqual([]);
	});

	it('critère 25 : sur un large échantillon de poses, aucun conflit ne tombe sur une case vide', () => {
		/* L'invariant en régime réel : on pose n'importe quoi, n'importe où, y
		   compris des valeurs fausses, et le signalement ne doit jamais déborder sur
		   ce que l'enfant n'a pas touché. */
		const r = tirage(4242);
		for (const depart of ordinaires().parties) {
			let p = depart;
			for (let k = 0; k < 8; k++) {
				const libres: number[] = [];
				for (let i = 0; i < N; i++) if (!estFixe(p, i)) libres.push(i);
				if (!libres.length) break;
				const i = libres[Math.floor(r() * libres.length)];
				p = poser(p, i, (1 + Math.floor(r() * C)) as Valeur);
				for (const j of conflitsCalcudoku(p)) {
					expect(p.valeurs[j], `case ${j} vide et pourtant signalée`).not.toBe(0);
				}
			}
		}
	});
});

describe('#667 critères 22 et 23 — « remplie » ne suffit pas à « terminée »', () => {
	it('la grille résolue est terminée', () => {
		for (const p of servies().slice(0, 40)) {
			const s = solutionUnique(p.cages, p.enonce);
			expect(s).not.toBeNull();
			if (!s) continue;
			expect(estRemplie(s)).toBe(true);
			expect(grilleTerminee({ ...p, valeurs: s })).toBe(true);
		}
	});

	it('une grille incomplète ne l’est pas', () => {
		for (const p of servies().slice(0, 40)) expect(grilleTerminee(p)).toBe(false);
	});

	it('une grille remplie mais avec un doublon ne l’est pas', () => {
		// Le signalement ne bloquant pas la pose (critère 22), « remplie et fausse »
		// est un état ATTEIGNABLE : il ne doit surtout pas compter pour une victoire.
		const fausse = SOL4.slice();
		fausse[1] = fausse[0];
		expect(grilleTerminee(partie([], vide(), fausse))).toBe(false);
	});

	it('une grille remplie mais avec une cage fausse ne l’est pas non plus', () => {
		const cage: Cage = { cases: [0, 1], operation: 'somme', objectif: 99 };
		expect(grilleTerminee(partie([cage], vide(), SOL4))).toBe(false);
	});
});

/* ── LE CAS-PIVOT DE LA PREMIÈRE GRILLE ──────────────────────────────────── */

describe('#667 critères 32 et 33 — la première grille est un cas-pivot', () => {
	it('critère 32 : la première grille ne se déduit PAS sans regarder une cage', () => {
		/* Cas d'échec littéral : « toutes les cases de la première grille se déduisent
		   sans regarder une seule cage ». L'enfant réussirait alors pour la mauvaise
		   raison et n'apprendrait rien du jeu. */
		const faciles = premieres()
			.parties.map((p, n) => ({ n, restantes: deduire(null, p.enonce).filter((x) => !x).length }))
			.filter((x) => x.restantes === 0);
		expect(faciles).toEqual([]);
	});

	it('critères 32 et 33 : une case ambiguë est résolue par une cage de différence de cible 1 ou 2', () => {
		/* La case doit avoir au moins DEUX candidats par la ligne et la colonne
		   seules, et EXACTEMENT UN une fois sa cage prise en compte — « résolue
		   seulement par sa cage ».

		   Le pivot est accepté à DEUX points de lecture : sur l'énoncé tel qu'il est
		   servi (c'est ce que le critère 34 demande de rendre visible d'emblée, par
		   la case présélectionnée), ou au point de blocage de la logique
		   ligne/colonne seule (c'est là que l'enfant se trouve quand il doit lever
		   les yeux vers une cage). Les deux sont fidèles au critère, et n'en retenir
		   qu'un ferait rougir une implémentation correcte pour un détail de calendrier.

		   ── DEUX MESURES FAITES EN ÉCRIVANT CE TEST, à connaître avant d'implémenter.

		   1. La lecture cage-locale (cf. en-tête) a une conséquence dure : une cage de
		      différence 1 ou 2 dont les DEUX cases sont vides n'interdit RIEN, puisque
		      tout chiffre de 1 à 4 y admet un partenaire (vérifié : seule la cible 3
		      interdit quelque chose à cages vides). Le partenaire du pivot doit donc
		      être CONNU au point de lecture — donné par l'énoncé, ou déduit avant lui.

		   2. Le taux d'un tirage avec rejet naïf, sur 300 grilles satisfaisant déjà
		      les critères 4 à 12 : **3,0 %** si les cases pré-remplies sont tenues
		      HORS des cages, **17,7 %** si une donnée peut habiter une cage. Les deux
		      restent servables (à 3 %, cent essais échouent avec une probabilité de
		      l'ordre de 10⁻¹³), mais l'écart est d'un facteur six, et l'issue ne
		      tranche pas : son critère 10 dit que les cases pré-remplies « ne sont pas
		      des cages », ce qui exclut la cage d'UNE case sans dire si une donnée
		      peut habiter une cage plus grande. Aucun test d'ici ne suppose l'un ou
		      l'autre. */
		const estPivot = (cages: readonly Cage[], g: Valeurs, i: number): boolean => {
			if (g[i]) return false;
			const c = cageOracle(cages, i);
			if (!c || c.operation !== 'difference') return false;
			if (c.objectif !== 1 && c.objectif !== 2) return false;
			if (candidatsOracle(null, g, i).size < 2) return false;
			return candidatsOracle(cages, g, i).size === 1;
		};
		const sansPivot: number[] = [];
		premieres().parties.forEach((p, n) => {
			const lectures = [p.enonce, deduire(null, p.enonce)];
			const trouve = lectures.some((g) => {
				for (let i = 0; i < N; i++) if (estPivot(p.cages, g, i)) return true;
				return false;
			});
			if (!trouve) sansPivot.push(n);
		});
		expect(sansPivot).toEqual([]);
	});

	it('critère 33 : la cible 3 ne ferait pas l’affaire, et c’est mesurable', () => {
		/* La justification du critère, rejouée pour qu'elle ne se perde pas : en 1 à
		   4, une différence de 3 n'a qu'une décomposition (1 et 4), donc la cage se
		   remplit sans qu'aucune ambiguïté soit mise en scène. Les cibles 1 et 2 en
		   ont trois et deux. */
		const decompositions = (t: number): number =>
			[1, 2, 3, 4].filter((a) => [1, 2, 3, 4].some((b) => a < b && b - a === t)).length;
		expect(decompositions(1)).toBe(3);
		expect(decompositions(2)).toBe(2);
		expect(decompositions(3)).toBe(1);
	});
});

/* ── LA CAGE COMME CONTRAINTE ENFICHABLE ─────────────────────────────────── */

describe('#667 critère 41 — la cage est une `Contrainte` de plus, rien d’autre', () => {
	it('`contrainteCages` s’enfiche dans le moteur générique sans le modifier', () => {
		/* La mise à l'épreuve de la promesse du critère 25 de #666 : l'interface
		   n'expose que `conflits` et `interdits`, et c'est assez pour une cage. Si
		   l'implémentation avait besoin d'autre chose, elle ne passerait pas ici. */
		const cage: Cage = { cases: [0, 1], operation: 'somme', objectif: 3 };
		const c = contrainteCages([cage]);
		expect(typeof c.id).toBe('string');
		expect(c.id).not.toBe('');
		const m = creerMoteur(geometrieCalcudoku(), [c]);
		// Sans unicité enregistrée, seule la cage parle : 4 posé en 0 la condamne.
		expect(m.conflits(avec([0, 4])).has(0)).toBe(true);
		// Et une cage « 3+ » interdit 3 et 4 en case 0 : il resterait 0 ou −1 à faire.
		expect([...m.candidats(vide(), 0)].sort()).toEqual([1, 2]);
	});

	it('le moteur du jeu n’autorise jamais une valeur que les règles refusent', () => {
		/* Soundness, du seul côté où un écart est un vrai défaut : tout ce que le
		   moteur propose doit être permis par la ligne, la colonne et la cage.
		   L'inverse (proposer moins) reste permis — l'issue écarte l'extension
		   croisée, mais un moteur plus fin ne servirait pas une grille fausse. */
		for (const p of servies().slice(0, 40)) {
			const m = moteurCalcudoku(p.cages);
			for (let i = 0; i < N; i++) {
				if (p.enonce[i]) continue;
				const permis = candidatsOracle(p.cages, p.enonce, i);
				for (const s of m.candidats(p.enonce, i)) {
					expect(permis.has(s), `case ${i}, valeur ${s}`).toBe(true);
				}
			}
		}
	});
});
