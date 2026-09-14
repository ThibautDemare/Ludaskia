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
	// Mots croisés (#665). Type C, contrairement à son voisin d'étagère : ici
	// l'enfant RETROUVE le mot à partir de son sens, il ne le reçoit pas écrit.
	// C'est la différence exacte entre les deux jeux, et c'est ce que la
	// compétence dit à l'espace encadrant — elle reste invisible côté enfant.
	//
	// Aucun `levels` : les séries du vivier sont toutes de niveau CE2 et la banque
	// de définitions n'a pas de variante CM1, donc la question du cumul ne se pose
	// pas encore. `levels` absent, et non `['ce2','cm1']` : c'est la façon d'écrire
	// « ce jeu ignore le niveau scolaire » sans y revenir à chaque classe.
	//
	// Le libellé nomme le genre, que « Mots à caser » évitait justement parce que
	// l'enfant ne le connaît pas : celui-ci, il le connaît, et c'est ce qui met
	// cinq caractères entre les deux étiquettes de l'étagère.
	{
		id: 'mots-croises',
		label: 'Mots croisés',
		icone: '✏️',
		type: 'C',
		competence: 'vocabulaire : retrouver un mot à partir de sa définition',
	},
	// Calcudoku (#667). Type C, et le premier de l'étagère en mathématiques : la
	// compétence EST la mécanique, puisqu'on ne remplit une cage qu'en calculant.
	// Chaque mot de l'intitulé est daté — « sommes » et « différences » sont le
	// vocabulaire du programme, et « tables de multiplication » se tient
	// volontairement en deçà de « facteurs et multiples », ce que la limitation
	// des produits à deux cases rend honnête. Il ne dit ni « déduction » ni
	// « logique » : ce sont des capacités méthodologiques transversales, que le
	// socle range hors des attendus disciplinaires. Et il reste invisible côté
	// enfant.
	//
	// Aucun `levels` : le jeu est strictement identique à toutes les classes (une
	// seule taille, valeurs de 1 à 4), donc rien à énumérer ni à reprendre quand
	// une classe s'ajoutera.
	//
	// Le libellé nomme ce que l'enfant VOIT — des nombres enfermés dans des cages
	// — et jamais ce qu'il travaille : « Calculs en grille » aurait retransformé
	// le cadeau en exercice déguisé, et la tentation est neuve puisque c'est le
	// premier jeu de maths de l'étagère. Le mot « cage » n'est pas un jargon
	// gratuit : c'est celui qu'emploient la règle du jeu et la zone de phrase, qui
	// le définissent en situation dès le premier appui.
	//
	// L'icône est un quadrillage de cases encadrées, distinct des voisines de
	// l'étagère (🔷 le sudoku, 🧩 les mots à caser) et muette sur l'opération.
	{
		id: 'calcudoku',
		label: 'Cages à nombres',
		icone: '🪟',
		type: 'C',
		competence: 'sommes, différences et tables de multiplication',
	},
];

export function jeuParId(id: string): JeuDef | undefined {
	return JEUX.find((j) => j.id === id);
}

/** Les jeux jouables à cette classe. Un jeu sans `levels` passe partout. */
export function jeuxDisponibles(niveau: SchoolLevel): JeuDef[] {
	return JEUX.filter((j) => !j.levels || j.levels.includes(niveau));
}
