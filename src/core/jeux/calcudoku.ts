/* ============================================================
   Calcudoku (#667) — le JEU : des cages arithmétiques posées sur le moteur de
   grille de #666, sans qu'une ligne de ce moteur bouge (critère 41). La cage
   n'est rien de plus qu'une `Contrainte` de plus : `conflits` + `interdits`.

   ── Une seule taille, et aucune région ──────────────────────────────────────

   4×4, valeurs 1 à 4, et la contrainte de région n'est PAS enregistrée : seules
   la ligne, la colonne et la cage contraignent (critères 1 et 2). `Geometrie`
   oblige pourtant à renseigner `regionLargeur` et `regionHauteur` — c'est un
   frottement connu et assumé du moteur générique. Les valeurs posées ici n'ont
   AUCUNE signification pour le calcudoku ; 1 × 1 est choisi exprès, pour qu'un
   appelant qui enregistrerait `regions` par erreur obtienne seize régions d'une
   case, donc une contrainte inerte, au lieu d'un blocage silencieux.

   ── La lecture CAGE-LOCALE, et pourquoi elle reste volontairement faible ─────

   `interdits` reçoit la grille entière, donc il aurait les moyens de croiser les
   complétions d'une cage avec l'unicité de ligne et de colonne. Il ne le fait
   pas : une cage ne connaît QUE ses propres cases, et les répétitions y sont
   admises tant que la ligne et la colonne les autorisent par ailleurs.

   C'est délibéré (hors-périmètre de l'issue). Le solveur qui garantit les
   grilles servies doit rester PLUS FAIBLE que l'enfant : celui-ci voit que deux
   cases d'une cage « 4+ » sont sur une même ligne et écarte le couple 2 et 2.
   Un solveur plus fort que l'enfant rendrait la garantie du critère 5 creuse —
   il certifierait des grilles que l'enfant, lui, ne saurait pas finir.

   ── Les deux garanties, et le fait qu'il n'y en a qu'une à vérifier ──────────

   Toute grille servie a une solution unique (critère 4) et se termine par
   déduction élémentaire seule (critère 5). Le second implique le premier : si
   chaque case posée est FORCÉE, la solution atteinte est nécessairement unique.
   Le générateur n'a donc qu'une propriété à contrôler, `resoudreParDeduction-
   Elementaire` non nul, et il tire avec REJET jusqu'à l'obtenir.

   Mesuré au cadrage : à six cages et deux cases pré-remplies, environ 19 % des
   découpages tirés tiennent les deux garanties — cinq essais en moyenne. Le
   budget d'essais est donc large et, une fois épuisé, `tirerGrille` rend `null`
   (critère 7) : le runner affiche une panne plutôt qu'une grille non garantie.
   ============================================================ */
import {
	colonnes,
	contrainteUnicite,
	creerMoteur,
	lignes,
	resoudreParDeductionElementaire,
	type Contrainte,
	type Geometrie,
	type MoteurGrille,
	type Valeur,
	type Valeurs,
} from './grille-contraintes';

/** Une seule taille, et aucun paramètre de taille nulle part (critère 1). */
export const COTE = 4;

const TOTAL = COTE * COTE;

export type Operation = 'somme' | 'difference' | 'produit';

/** Jamais de division (critère 11) : elle n'est pas au programme du CE2 sous la
    forme qu'un calcudoku en demanderait. */
export const OPERATIONS: readonly Operation[] = ['somme', 'difference', 'produit'];

export interface Cage {
	/** Indices des cases, contiguës (voisines orthogonales), 2 à 4 d'entre elles. */
	cases: number[];
	operation: Operation;
	objectif: number;
}

export interface Partie {
	cages: Cage[];
	/** Les cases données au départ, 0 ailleurs. Ne change jamais. */
	enonce: Valeurs;
	/** L'état courant, énoncé compris. */
	valeurs: Valeurs;
}

/** Un symbole d'UN caractère par opération, jamais un chiffre — il se confondrait
    avec le nombre qui le précède dans l'étiquette.

    « ↔ » plutôt que « − » ou « ± » pour la différence (critère 14) : le problème
    n'est pas le point de code, c'est la FAMILIARITÉ du signe. Un enfant qui lit
    « 3- » file sur son a priori d'ordre imposé (le grand d'abord) alors qu'une
    différence entre deux nombres n'appelle pas la question « lequel en
    premier ». La double flèche ne porte pas cet a priori. Glyphe contestable et
    non éprouvé sur un enfant réel : à ré-arbitrer après essai, sans que rien
    d'autre n'ait à bouger. */
export const SYMBOLES: Readonly<Record<Operation, string>> = {
	somme: '+',
	difference: '↔',
	produit: '×',
};

/** La zone d'explication n'est jamais vide au montage (critère 16), et sa phrase
    ne peut se confondre avec l'objectif d'une cage. */
export const PHRASE_DEFAUT = 'Touche une case pour voir son objectif.';

/** L'étiquette du coin de cage : le nombre D'ABORD, le symbole ensuite, donc 2 à
    3 caractères (critère 13). Même grammaire pour les trois opérations — aucune
    ne reçoit un bandeau ou un mot là où les autres ont un badge. */
export function libelleCage(c: Cage): string {
	return `${c.objectif}${SYMBOLES[c.operation]}`;
}

/** L'objectif dit en toutes lettres (critère 17). Le symbole seul ne s'explique
    pas de lui-même, et « ↔ » moins que les autres. */
export function phraseCage(c: Cage): string {
	if (c.operation === 'somme') {
		return `Dans cette cage, additionne les nombres pour trouver ${c.objectif}.`;
	}
	if (c.operation === 'produit') {
		return `Dans cette cage, multiplie les nombres pour trouver ${c.objectif}.`;
	}
	return `Dans cette cage, trouve deux nombres qui ont ${c.objectif} de différence.`;
}

/** Voir l'en-tête pour `regionLargeur` et `regionHauteur` : valeurs SANS
    SIGNIFICATION, imposées par le type du moteur et jamais employées, puisque la
    contrainte de région n'est pas enregistrée (critère 2). */
export function geometrieCalcudoku(): Geometrie {
	return { cotes: COTE, regionLargeur: 1, regionHauteur: 1 };
}

/* ── LA CAGE COMME CONTRAINTE ────────────────────────────────────────────── */

/** La cage peut-elle ENCORE atteindre son objectif, compte tenu de ce qui y est
    déjà posé ? Lecture CAGE-LOCALE (cf. en-tête) : chaque case vide prend
    n'importe quelle valeur de 1 à `max`, indépendamment des autres.

    Une cage PLEINE y répond « non » exactement quand son calcul ne tombe pas sur
    l'objectif : le même prédicat sert donc le critère 23 (cage fausse) et le
    critère 24 (cage incomplète devenue impossible), et il n'y a pas deux règles
    à tenir d'accord.

    L'addition se décide par un encadrement plutôt que par énumération : c'est la
    seule opération qui va jusqu'à quatre cases, donc la seule où l'énumération
    coûterait (4³ complétions à chaque candidat de chaque case, sur des dizaines
    de milliers d'appels au tirage). */
function cagePeutAtteindre(c: Cage, valeurs: readonly number[], max: number): boolean {
	let vides = 0;
	for (const x of valeurs) if (!x) vides++;
	if (c.operation === 'somme') {
		const pose = valeurs.reduce((a, b) => a + b, 0);
		const reste = c.objectif - pose;
		return vides === 0 ? reste === 0 : reste >= vides && reste <= vides * max;
	}
	// La différence n'a pas de sens univoque hors de deux termes : une cage qui en
	// porte un autre nombre est insoluble, et se signale comme telle.
	if (c.operation === 'difference' && valeurs.length !== 2) return false;
	const essai = valeurs.slice();
	const trous: number[] = [];
	for (let k = 0; k < essai.length; k++) if (!essai[k]) trous.push(k);
	const juste = (): boolean =>
		c.operation === 'produit'
			? essai.reduce((a, b) => a * b, 1) === c.objectif
			: Math.abs(essai[0] - essai[1]) === c.objectif;
	const rec = (k: number): boolean => {
		if (k === trous.length) return juste();
		for (let s = 1; s <= max; s++) {
			essai[trous[k]] = s;
			if (rec(k + 1)) return true;
		}
		essai[trous[k]] = 0;
		return false;
	};
	return rec(0);
}

const cageDesCases = (cages: readonly Cage[], index: number): Cage | undefined =>
	cages.find((c) => c.cases.includes(index));

/** Les cages, vues comme UNE contrainte enfichable de plus (critère 41).

    `conflits` ne rend que les cases qui PORTENT une valeur, jamais une case vide
    (critère 25) : signaler ce que l'enfant a posé est un fait sur son geste,
    signaler ce qu'il pourrait poser serait lui donner la réponse. Une cage
    pleine et fausse a toutes ses cases valuées, donc toutes marquées ; une cage
    condamnée alors qu'elle est encore incomplète n'est pas muette pour autant,
    mais ne parle que de ce qui la condamne. */
export function contrainteCages(cages: readonly Cage[]): Contrainte {
	return {
		id: 'cages',
		conflits(geo, v) {
			const out = new Set<number>();
			for (const c of cages) {
				const valeurs = c.cases.map((i) => v[i] ?? 0);
				if (cagePeutAtteindre(c, valeurs, geo.cotes)) continue;
				for (let k = 0; k < c.cases.length; k++) if (valeurs[k]) out.add(c.cases[k]);
			}
			return out;
		},
		interdits(geo, v, index) {
			const out = new Set<Valeur>();
			const c = cageDesCases(cages, index);
			if (!c) return out;
			const valeurs = c.cases.map((i) => v[i] ?? 0);
			const place = c.cases.indexOf(index);
			for (let s = 1; s <= geo.cotes; s++) {
				const essai = valeurs.slice();
				essai[place] = s;
				if (!cagePeutAtteindre(c, essai, geo.cotes)) out.add(s);
			}
			return out;
		},
	};
}

/** Ligne, colonne, cages. Pas de région (critère 2). */
export function moteurCalcudoku(cages: readonly Cage[]): MoteurGrille {
	return creerMoteur(geometrieCalcudoku(), [
		contrainteUnicite('ligne', lignes),
		contrainteUnicite('colonne', colonnes),
		contrainteCages(cages),
	]);
}

/* Le moteur sans aucune cage : sert à tirer une solution complète, et à mesurer
   ce que la ligne et la colonne SEULES savent déduire (critère 32). */
const MOTEUR_NU = moteurCalcudoku([]);

/* ── L'ÉTAT D'UNE PARTIE ─────────────────────────────────────────────────── */

/** Les cases contraintes par `index` — sa ligne et sa colonne, elle-même exclue,
    donc six. Jamais un bloc : la grille n'a pas de région, et coller les cases 0
    et 5 ferait chercher l'enfant là où aucune règle ne s'applique.

    Ne prend pas de `Partie` : c'est la moitié « fond plat » du critère 21, celle
    que la cage ne concerne pas. La cage se signale par son trait, à part. */
export function casesLiees(index: number): Set<number> {
	const out = new Set<number>();
	if (!Number.isInteger(index) || index < 0 || index >= TOTAL) return out;
	const geo = geometrieCalcudoku();
	for (const famille of [lignes, colonnes]) {
		for (const zone of famille(geo)) {
			if (!zone.includes(index)) continue;
			for (const i of zone) if (i !== index) out.add(i);
		}
	}
	return out;
}

/** La cage d'une case, ou `undefined` — y compris sur un index hors grille, qui
    ne lève pas : un doigt qui glisse sur un bord ne doit pas casser l'écran. */
export function cageDe(p: Partie, index: number): Cage | undefined {
	if (!Number.isInteger(index) || index < 0 || index >= TOTAL) return undefined;
	return cageDesCases(p.cages, index);
}

export function conflitsCalcudoku(p: Partie): Set<number> {
	return moteurCalcudoku(p.cages).conflits(p.valeurs);
}

/** Remplie ET sans conflit. Le signalement ne bloquant pas la pose (critère 22),
    « remplie mais fausse » est un état ATTEIGNABLE : c'est donc ici, et pas dans
    le `complete` structurel du moteur, que la victoire se décide. */
export function grilleTerminee(p: Partie): boolean {
	const m = moteurCalcudoku(p.cages);
	return m.complete(p.valeurs) && m.conflits(p.valeurs).size === 0;
}

export function estFixe(p: Partie, index: number): boolean {
	return (p.enonce[index] ?? 0) !== 0;
}

/** Rend une NOUVELLE partie : l'appelant ne mute rien.

    Refuse en SILENCE ce qui n'a pas de sens — index hors grille, valeur hors du
    jeu, case pré-remplie — plutôt que de lever : une exception serait une panne
    pour l'enfant. La valeur 0 est légitime, c'est l'effacement (critère 19). */
export function poser(p: Partie, index: number, valeur: Valeur): Partie {
	const valeurs = p.valeurs.slice();
	const indexOk = Number.isInteger(index) && index >= 0 && index < TOTAL;
	const valeurOk = Number.isInteger(valeur) && valeur >= 0 && valeur <= COTE;
	if (indexOk && valeurOk && !estFixe(p, index)) valeurs[index] = valeur;
	return { cages: p.cages, enonce: p.enonce.slice(), valeurs };
}

/* ── LE TIRAGE ───────────────────────────────────────────────────────────── */

/** Au plus 6 cages : les 16 cases étant partitionnées, 7 cages donneraient une
    taille moyenne de 2,29, sous le plancher de 2,3 du critère 10. Le plafond
    annoncé à 7 a donc une borne effective à 6, et rien à 6 ne coince. */
const CAGES_MAX = 6;
const TAILLE_MIN = 2;
const TAILLE_MAX = 4;

/** Deux cases pré-remplies (critère 6), pas moins : un 4×4 sans donnée ne se
    termine jamais par déduction élémentaire seule. Elles habitent les cages —
    les cages partitionnent la grille, donc il n'y a pas d'ailleurs où les mettre,
    et c'est le régime qui multiplie par six le rendement du cas-pivot. */
const DONNEES = 2;

/* Budgets d'essais du tirage avec rejet. À 19 % de réussite mesurée, 400 essais
   échouent avec une probabilité de l'ordre de 10⁻³⁷. La première grille cumule
   sa propre condition (17,7 % des grilles déjà valides), d'où un budget plus
   large pour un produit de taux autour de 3 %. */
const ESSAIS_ORDINAIRE = 400;
const ESSAIS_PREMIERE = 3000;

/* Mélange de Fisher-Yates avec la garde `Math.min` du dépôt : un générateur
   bricolé qui rendrait 1 produirait sinon un index hors tableau. */
function melanger<T>(source: readonly T[], r: () => number): T[] {
	const a = [...source];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.min(i, Math.floor(r() * (i + 1)));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function choisir<T>(liste: readonly T[], r: () => number): T {
	return liste[Math.min(liste.length - 1, Math.floor(r() * liste.length))];
}

function voisinesDe(index: number): number[] {
	const y = Math.floor(index / COTE);
	const x = index % COTE;
	const out: number[] = [];
	if (y > 0) out.push(index - COTE);
	if (y < COTE - 1) out.push(index + COTE);
	if (x > 0) out.push(index - 1);
	if (x < COTE - 1) out.push(index + 1);
	return out.sort((a, b) => a - b);
}

/** Une grille complète et valide, tirée : un carré latin d'ordre 4. */
function solutionComplete(r: () => number): Valeurs | null {
	const v: Valeurs = new Array<number>(TOTAL).fill(0);
	const rec = (i: number): boolean => {
		if (i >= TOTAL) return true;
		for (const s of melanger([...MOTEUR_NU.candidats(v, i)], r)) {
			v[i] = s;
			if (rec(i + 1)) return true;
			v[i] = 0;
		}
		return false;
	};
	return rec(0) ? v : null;
}

/** Partitionne les 16 cases en groupes CONTIGUS de 2 à 4 cases, 6 au plus
    (critères 9 et 10). On fait pousser un groupe depuis une case tirée, en
    n'ajoutant que des voisines orthogonales encore libres.

    La taille visée n'est pas tirée librement : elle part d'un minimum calculé sur
    ce qu'il reste à couvrir et sur les groupes encore permis, sinon la grille
    s'émiette en huit paires et dépasse le plafond. Une case isolée en fin de
    parcours (toutes ses voisines déjà prises) est GREFFÉE sur une cage voisine
    non pleine plutôt que de faire échouer le découpage — la contiguïté est
    préservée par construction, puisqu'on ne greffe que sur une voisine. */
function decouperEnCages(r: () => number): number[][] | null {
	const restant = new Set<number>();
	for (let i = 0; i < TOTAL; i++) restant.add(i);
	const groupes: number[][] = [];
	while (restant.size > 0) {
		const depart = choisir([...restant], r);
		restant.delete(depart);
		const place = CAGES_MAX - groupes.length;
		let cible = 0;
		if (place > 0) {
			// Le plancher est celui de la FAISABILITÉ, pas de la moyenne : il ne
			// dit que « ce qui reste doit tenir dans les cages encore permises ».
			// Un plancher plus haut (la taille moyenne restante) suffirait à ne
			// jamais dépasser six cages, mais il étoufferait les cages de DEUX
			// cases — donc les différences et les produits, qui n'existent qu'à
			// cette taille (critère 12), et avec eux le cas-pivot du critère 33.
			const minimum = Math.max(TAILLE_MIN, restant.size + 1 - TAILLE_MAX * (place - 1));
			if (minimum > TAILLE_MAX) return null;
			cible = Math.min(TAILLE_MAX, minimum + Math.floor(r() * (TAILLE_MAX - minimum + 1)));
		}
		const groupe = [depart];
		while (groupe.length < cible) {
			const bord = new Set<number>();
			for (const i of groupe) for (const j of voisinesDe(i)) if (restant.has(j)) bord.add(j);
			if (bord.size === 0) break;
			const suivant = choisir(
				[...bord].sort((a, b) => a - b),
				r,
			);
			restant.delete(suivant);
			groupe.push(suivant);
		}
		if (groupe.length >= TAILLE_MIN && place > 0) {
			groupes.push(groupe.sort((a, b) => a - b));
			continue;
		}
		const proches = voisinesDe(depart);
		const hote = groupes.find((g) => g.length < TAILLE_MAX && g.some((j) => proches.includes(j)));
		if (!hote) return null;
		hote.push(depart);
		hote.sort((a, b) => a - b);
	}
	if (groupes.length > CAGES_MAX) return null;
	for (const g of groupes) {
		if (g.length < TAILLE_MIN || g.length > TAILLE_MAX) return null;
	}
	return groupes;
}

/** Donne son opération et son objectif à chaque groupe, d'après la solution.

    Différence et produit tiennent à DEUX cases (critère 12) : la différence n'a
    pas de sens univoque à trois termes, et un produit à trois facteurs est un
    calcul composé dont la cible devient ambiguë (8 = 1×2×4 = 2×2×2). Seule
    l'addition va jusqu'à trois ou quatre cases.

    Les cibles qui en sortent sont par construction celles que deux cases
    VOISINES permettent — donc de valeurs différentes : produits 2, 3, 4, 6, 8
    et 12, différences 1, 2 et 3, sommes au moins 3. */
function habillerCages(groupes: number[][], solution: Valeurs, r: () => number): Cage[] {
	return groupes.map((cases) => {
		const valeurs = cases.map((i) => solution[i]);
		if (cases.length > 2) {
			return { cases, operation: 'somme', objectif: valeurs.reduce((a, b) => a + b, 0) };
		}
		const operation = choisir(OPERATIONS, r);
		const objectif =
			operation === 'somme'
				? valeurs[0] + valeurs[1]
				: operation === 'produit'
					? valeurs[0] * valeurs[1]
					: Math.abs(valeurs[0] - valeurs[1]);
		return { cases, operation, objectif };
	});
}

/** Le point fixe de la déduction élémentaire, rempli ou non — là où
    `resoudreParDeductionElementaire` rend `null` dès qu'elle bloque. */
function deduireAuMieux(m: MoteurGrille, v: Valeurs): Valeurs {
	const g = v.slice();
	for (;;) {
		let pose = false;
		for (let i = 0; i < g.length; i++) {
			if (g[i]) continue;
			const c = m.candidats(g, i);
			if (c.size === 1) {
				g[i] = [...c][0];
				pose = true;
			}
		}
		if (!pose) return g;
	}
}

/** La toute première grille d'un profil est un CAS-PIVOT (critères 32 et 33) :
    elle ne se déduit pas sans regarder une cage, et elle contient une case
    ambiguë par la seule logique de ligne et de colonne (au moins deux candidats)
    que sa cage tranche à elle seule.

    Cette cage est une DIFFÉRENCE de cible 1 ou 2 : en 1 à 4, une différence de 3
    n'a qu'une décomposition (1 et 4), donc la cage se remplirait sans qu'aucune
    ambiguïté soit mise en scène ; les cibles 1 et 2 en ont trois et deux.

    Conséquence dure de la lecture cage-locale : une cage de différence 1 ou 2
    dont les DEUX cases sont vides n'interdit rien, puisque tout chiffre y admet
    un partenaire. Le partenaire du pivot doit donc être CONNU au point de
    lecture — d'où les deux lectures acceptées ici : l'énoncé tel qu'il est servi,
    et le point où la logique de ligne et de colonne cale. */
function aUnPivot(cages: readonly Cage[], enonce: Valeurs): boolean {
	const cale = deduireAuMieux(MOTEUR_NU, enonce);
	// Critère 32 : la ligne et la colonne seules ne doivent pas suffire à finir.
	if (cale.every((x) => x !== 0)) return false;
	const m = moteurCalcudoku(cages);
	for (const g of [enonce, cale]) {
		for (let i = 0; i < TOTAL; i++) {
			if (g[i]) continue;
			const c = cageDesCases(cages, i);
			if (!c || c.operation !== 'difference') continue;
			if (c.objectif !== 1 && c.objectif !== 2) continue;
			if (MOTEUR_NU.candidats(g, i).size < 2) continue;
			if (m.candidats(g, i).size === 1) return true;
		}
	}
	return false;
}

function tenterGrille(r: () => number, premiere: boolean): Partie | null {
	const solution = solutionComplete(r);
	if (!solution) return null;
	const groupes = decouperEnCages(r);
	if (!groupes) return null;
	const cages = habillerCages(groupes, solution, r);
	const enonce: Valeurs = new Array<number>(TOTAL).fill(0);
	for (const i of melanger([...Array(TOTAL).keys()], r).slice(0, DONNEES)) enonce[i] = solution[i];
	// L'UNIQUE contrôle des critères 4 et 5 : si la déduction élémentaire termine
	// la grille, chaque case y est forcée, donc la solution est unique.
	if (!resoudreParDeductionElementaire(moteurCalcudoku(cages), enonce)) return null;
	if (premiere && !aUnPivot(cages, enonce)) return null;
	return { cages, enonce, valeurs: enonce.slice() };
}

/** Tirage PUR et déterministe à `r` fixé (critère 8) : ne lit ni le stockage, ni
    l'horloge, ni le profil, et n'appelle jamais `Math.random`.

    Rend `null` quand le budget d'essais est épuisé (critère 7) : mieux vaut une
    panne affichée qu'une grille dont on ne peut pas garantir qu'elle se finit. */
export function tirerGrille(r: () => number, premiere = false): Partie | null {
	const budget = premiere ? ESSAIS_PREMIERE : ESSAIS_ORDINAIRE;
	for (let essai = 0; essai < budget; essai++) {
		const p = tenterGrille(r, premiere);
		if (p) return p;
	}
	return null;
}
