/* ============================================================
   Étagère de jeux (#661) — le CATALOGUE.

   Un jeu n'est pas une leçon : il ne corrige rien, ne note rien, n'alimente
   aucun compteur. Ce fichier ne décrit donc que ce qui sert à le PROPOSER —
   son libellé côté enfant, son type de vivier, et deux informations qui ne
   sortent jamais de l'espace encadrant.

   Deux règles à ne pas relâcher :
   - `competence` est INVISIBLE côté enfant (critères 3, 14 et 16). L'étagère est
     une liste de jeux, pas un sommaire de matières : un libellé qui nommerait la
     compétence retransformerait le cadeau en exercice déguisé.
   - `levels` ABSENT veut dire « à toutes les classes » (critère 16). C'est la
     façon d'écrire « ce jeu ignore le niveau scolaire » sans énumérer les
     classes, donc sans avoir à y revenir quand une classe s'ajoute.
   ============================================================ */
import type { SchoolLevel } from '../catalog';

/** `C` = jeu-compétence (une compétence scolaire EST la mécanique) ;
    `R` = jeu-refuge (aucun lien au programme, la pause assumée). */
export type TypeJeu = 'C' | 'R';

export interface JeuDef {
	/** Stable : sert de clé de stockage et de fragment de route. */
	id: string;
	/** Libellé vu par l'enfant. Ne nomme JAMAIS la compétence (critère 3). */
	label: string;
	/** Emoji, comme les `.reward-btn` voisins — pas une icône Phosphor. */
	icone: string;
	type: TypeJeu;
	/** Visible UNIQUEMENT dans l'espace encadrant (critères 14 et 16). */
	competence?: string;
	/** Classes où le jeu existe. ABSENT = toutes (critère 16). */
	levels?: SchoolLevel[];
}

export const JEUX: JeuDef[] = [
	{
		id: 'motus',
		label: 'Le mot caché',
		icone: '🔤',
		type: 'C',
		competence: 'orthographe lexicale',
		levels: ['ce2', 'cm1'],
	},
	{ id: '2048', label: '2048', icone: '🔢', type: 'R' },
	// Sudoku à silhouettes (#666). Type R, donc ni `competence` ni `levels`
	// (critère 20) : il n'est adossé à aucun attendu du programme — vérifié dans
	// `docs/reference/programmes/`, il n'y apparaît nulle part — et sa valeur est
	// méthodologique, pas curriculaire.
	{ id: 'sudoku', label: 'Sudoku des formes', icone: '🔷', type: 'R' },
	// Mots casés (#664). Type R, donc ni `competence` ni `levels` : le cadrage a
	// établi que le format « fill-in » n'entraîne ni lecture, ni orthographe
	// produite, ni vocabulaire — le mot est donné en entier, l'enfant ne le
	// rappelle jamais de mémoire et peut boucler la grille en comptant des cases.
	// Lui attribuer une compétence ferait mentir le bilan destiné aux parents.
	//
	// Le libellé dit « à caser » et non « casés », alors que « mots casés » est le
	// vrai nom du genre : les mots croisés de #665 arriveront sur CETTE étagère, et
	// un CE2 qui lit vite confondrait deux libellés quasi homophones dont il ne
	// connaît que le second. L'infinitif nomme l'action au lieu d'un genre qu'il
	// n'a pas encore. L'`id` et les clés de stockage, eux, ne bougent pas.
	{ id: 'mots-cases', label: 'Mots à caser', icone: '🧩', type: 'R' },
];

export function jeuParId(id: string): JeuDef | undefined {
	return JEUX.find((j) => j.id === id);
}

/** Les jeux jouables à cette classe. Un jeu sans `levels` passe partout. */
export function jeuxDisponibles(niveau: SchoolLevel): JeuDef[] {
	return JEUX.filter((j) => !j.levels || j.levels.includes(niveau));
}
