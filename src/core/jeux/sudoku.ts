/* ============================================================
   Sudoku (#666) — le JEU, assemblé sur le moteur générique.

   Aucune règle n'est écrite en dur ici : le sudoku est trois contraintes
   d'unicité posées sur une géométrie (critère 25). C'est ce qui permettra au
   calcudoku de #667 d'ajouter ses cages sans toucher ni à ce fichier ni au
   moteur.

   ── Le générateur, et pourquoi il n'a qu'une garantie à tenir ────────────────

   On part d'une solution complète, puis on retire les cases une à une dans un
   ordre tiré, en ne gardant un trou que si le solveur FAIBLE termine encore la
   grille. Le critère 4 implique alors le critère 3 : chaque étape étant forcée,
   la solution atteinte est nécessairement unique. Il n'y a donc pas deux
   propriétés à vérifier, mais une seule à respecter par construction.

   Mesuré sur 300 graines par taille avant d'écrire la première ligne : le 4×4
   laisse 11 à 12 trous sur 16, le 6×6 en laisse 23 à 27 sur 36, pour 20 ms et
   119 ms respectivement.

   ⚠️ À savoir avant de faire confiance à un échantillon vert : **en 4×4, une
   grille à solution unique est TOUJOURS résoluble par déduction élémentaire**
   (établi exhaustivement par l'auteur des tests sur les 2^16 sous-ensembles de
   trois grilles solutions). Le critère 4 n'a de mordant QUE sur le 6×6.

   Autre fait arithmétique utile : un sudoku 4×4 n'a que 288 grilles complètes
   possibles. La répétition y est structurellement inévitable — ce n'est pas un
   défaut du tirage, et c'est ce qui donne raison à `gamification-enfant` quand
   il dit qu'une taille unique s'épuise vite.
   ============================================================ */
import {
	colonnes,
	contrainteUnicite,
	creerMoteur,
	lignes,
	regions,
	resoudreParDeductionElementaire,
	type Geometrie,
	type MoteurGrille,
	type Valeur,
	type Valeurs,
} from './grille-contraintes';

/** Deux tailles, et pas de 9×9 : hors périmètre, trois raisons dans l'issue
    (28-30 px la case sur un téléphone de 360 px, pense-bêtes pas automatiques
    avant 10-11 ans, durée au-delà du plafond quotidien). */
export type TailleSudoku = 4 | 6;

export const TAILLES: readonly TailleSudoku[] = [4, 6];

/** Les silhouettes, indexées PAR LA VALEUR. L'entrée 0 est un trou : 0 est la
    case vide, jamais un symbole, et un rendu qui indexerait `SYMBOLES[valeur]`
    sans traiter le 0 dessinerait une forme dans les cases vides.

    Ce sont des NOMS, pas des dessins, et la frontière est celle que le dépôt
    tient déjà entre `core/icon-names.ts` (pur, le rôle) et `ui/icon.ts` (le
    SVG) : `core` ne rend rien. Le runner associe chaque nom à sa silhouette
    Phosphor pleine.

    Une forme par FAMILLE VISUELLE (critère 8) : les paires carré/losange,
    triangle haut/bas et étoile/croix se confondent à 35-40 px, taille mesurée
    sur la grille à 6 colonnes du Motus déjà en production. Les quatre premières
    servent le 4×4 et sont les plus distinctes entre elles.

    ── Ce sextuor est arbitré, pas improvisé (`designer-ux-enfant`, 2026-09-07) ──

    Le critère de choix n'est PAS « ces deux tracés se ressemblent-ils ». C'est :
    **la forme a-t-elle un ancrage structurel qu'un enfant peut nommer d'un coup
    d'œil répété** — un nombre de sommets, une symétrie. Le cercle en a zéro, le
    carré quatre, le triangle trois, l'étoile est hérissée : quatre compteurs
    distincts, d'où le quatuor du 4×4, la grille du plus jeune public. Un sudoku
    force à comparer des cases entre elles en continu, pas à reconnaître une
    icône isolée, et c'est ce scan répété qui rend l'ancrage décisif.

    Trois écarts au jeu classique, chacun pour une raison :
    • **la lune est retirée, pas le cœur.** Ni l'une ni l'autre n'a de compteur
      de sommets, donc les deux tombent dans la même case mentale (« le truc
      rond bizarre ») ; il ne peut y en avoir qu'une. Le cœur est acquis plus
      tôt. Et surtout, **lune + étoile dans la même grille** dessinerait un
      croissant-et-étoile, symbole religieux et national, sans que personne
      l'ait voulu ;
    • **pentagone plutôt qu'hexagone.** Au-delà de six côtés l'œil arrondit :
      un hexagone posé à côté du cercle recrée deux formes rondes. Le pentagone
      a une pointe unique et saillante qui casse l'effet ;
    • **soleil, fleur, papillon, nuage écartés** — trop de détail pour survivre
      à la réduction (les rayons fins du soleil se noient dans l'antialiasing) ;
      **trèfle et pique** aussi, chargés de l'univers du jeu d'argent.

    À vérifier sur un téléphone d'entrée de gamme avant de figer : l'avis
    s'appuie sur les tracés SVG et la théorie de la reconnaissance de forme, pas
    sur un test avec un enfant (Notes de l'issue). */
export const SYMBOLES: readonly string[] = [
	'',
	'cercle',
	'carre',
	'triangle',
	'etoile',
	'coeur',
	'pentagone',
];

export function symbolesDe(taille: TailleSudoku): readonly string[] {
	return SYMBOLES.slice(1, taille + 1);
}

/** Régions 2×2 au 4×4, et 3 de large sur 2 de haut au 6×6.

    L'issue écrivait « régions 2×3 » sans trancher l'orientation, ce que
    l'auteur des tests a relevé : les deux pavent la grille et donnent 12 cases
    liées, mais elles dessinent des grilles différentes. Retenu 3×2, la forme
    standard du sudoku 6×6, et consigné par commentaire daté sur l'issue plutôt
    que choisi en silence. */
export function geometrieSudoku(taille: TailleSudoku): Geometrie {
	return taille === 4
		? { cotes: 4, regionLargeur: 2, regionHauteur: 2 }
		: { cotes: 6, regionLargeur: 3, regionHauteur: 2 };
}

/* Un moteur par taille, construit une fois. Les échantillons des critères 3 et
   4 en font des dizaines de milliers d'appels ; reconstruire les contraintes à
   chacun ne changerait rien au résultat et beaucoup au temps. */
const MOTEURS = new Map<TailleSudoku, MoteurGrille>();

export function moteurSudoku(taille: TailleSudoku): MoteurGrille {
	const connu = MOTEURS.get(taille);
	if (connu) return connu;
	const m = creerMoteur(geometrieSudoku(taille), [
		contrainteUnicite('ligne', lignes),
		contrainteUnicite('colonne', colonnes),
		contrainteUnicite('region', regions),
	]);
	MOTEURS.set(taille, m);
	return m;
}

export interface Partie {
	taille: TailleSudoku;
	/** Les cases données au départ, 0 ailleurs. Ne change jamais. */
	enonce: Valeurs;
	/** L'état courant, énoncé compris. */
	valeurs: Valeurs;
}

/* Mélange de Fisher-Yates avec la garde `Math.min` du dépôt : un générateur
   importé ou bricolé qui rendrait 1 produirait sinon un index hors tableau. */
function melanger<T>(source: readonly T[], r: () => number): T[] {
	const a = [...source];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.min(i, Math.floor(r() * (i + 1)));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Une grille complète et valide, tirée. */
function solutionComplete(m: MoteurGrille, r: () => number): Valeurs {
	const total = m.geometrie.cotes * m.geometrie.cotes;
	const v: Valeurs = new Array(total).fill(0);
	const rec = (i: number): boolean => {
		if (i >= total) return true;
		for (const s of melanger([...m.candidats(v, i)], r)) {
			v[i] = s;
			if (rec(i + 1)) return true;
			v[i] = 0;
		}
		return false;
	};
	rec(0);
	return v;
}

/** Retire des cases tant que la grille reste finissable par déduction
    élémentaire. `cible` à 0 veut dire « autant que possible ». */
function creuser(m: MoteurGrille, plein: Valeurs, r: () => number, cible: number): Valeurs {
	const v = plein.slice();
	let trous = 0;
	for (const i of melanger([...Array(v.length).keys()], r)) {
		if (cible > 0 && trous >= cible) break;
		const garde = v[i];
		v[i] = 0;
		if (resoudreParDeductionElementaire(m, v)) trous++;
		else v[i] = garde;
	}
	return v;
}

/** Tirage PUR et déterministe à `r` fixé (critère 5) : ne lit ni le stockage,
    ni l'horloge, ni la classe du profil, et n'appelle jamais `Math.random`.

    `presqueComplete` sert la toute première grille d'un profil (critère 6) :
    l'enfant apprend la règle en posant sa première case, au lieu de lire trois
    contraintes énoncées d'un coup. Deux trous, pas un, pour que la première
    pose ne finisse pas la partie du même geste. */
export function tirerGrille(
	taille: TailleSudoku,
	r: () => number,
	presqueComplete?: boolean,
): Partie {
	const m = moteurSudoku(taille);
	const enonce = creuser(m, solutionComplete(m, r), r, presqueComplete ? 2 : 0);
	return { taille, enonce, valeurs: enonce.slice() };
}

export function conflitsSudoku(p: Partie): Set<number> {
	return moteurSudoku(p.taille).conflits(p.valeurs);
}

/** Les cases contraintes par la case `index` — sa ligne, sa colonne, sa région —
    elle-même exclue. Sert le déchargement de repérage du critère 16 : l'enfant
    n'a plus à calculer QUELLES cases comptent avant de chercher un conflit, mais
    la déduction, elle, reste entière.

    7 cases au 4×4, 12 au 6×6 (dans les deux orientations de région). */
export function casesLiees(taille: TailleSudoku, index: number): Set<number> {
	const out = new Set<number>();
	const geo = geometrieSudoku(taille);
	const total = geo.cotes * geo.cotes;
	if (!Number.isInteger(index) || index < 0 || index >= total) return out;
	for (const famille of [lignes, colonnes, regions]) {
		for (const zone of famille(geo)) {
			if (!zone.includes(index)) continue;
			for (const i of zone) if (i !== index) out.add(i);
		}
	}
	return out;
}

/** Remplie ET sans conflit. Le critère 13 rend « remplie mais fausse »
    atteignable, puisque le conflit ne bloque pas la pose : c'est donc ici, et
    pas dans le `complete` structurel du moteur, que la victoire se décide. */
export function grilleTerminee(p: Partie): boolean {
	const m = moteurSudoku(p.taille);
	return m.complete(p.valeurs) && m.conflits(p.valeurs).size === 0;
}

export function estFixe(p: Partie, index: number): boolean {
	return (p.enonce[index] ?? 0) !== 0;
}

/** Rend une NOUVELLE partie : l'appelant ne mute rien.

    Refuse en silence ce qui n'a pas de sens — case donnée, index hors grille,
    valeur hors du jeu de symboles — plutôt que de lever : un runner qui reçoit
    un appui sur une case fixe n'a rien à rattraper, et une exception y serait
    une panne pour l'enfant. La valeur 0 est légitime : c'est l'effacement. */
export function poser(p: Partie, index: number, valeur: Valeur): Partie {
	const geo = geometrieSudoku(p.taille);
	const total = geo.cotes * geo.cotes;
	const valeurs = p.valeurs.slice();
	const indexOk = Number.isInteger(index) && index >= 0 && index < total;
	const valeurOk = Number.isInteger(valeur) && valeur >= 0 && valeur <= geo.cotes;
	if (indexOk && valeurOk && !estFixe(p, index)) valeurs[index] = valeur;
	return { taille: p.taille, enonce: p.enonce.slice(), valeurs };
}
