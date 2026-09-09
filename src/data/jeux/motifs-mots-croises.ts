/* ============================================================
   Les MOTIFS de grille des mots croisés (#665) — de la donnée, rien d'autre.

   Un motif est un dessin : des emplacements horizontaux et verticaux. Les
   croisements ne sont pas écrits ici, le moteur les DÉDUIT de la géométrie
   (`core/jeux/grille-mots.ts`) — une liste tenue en parallèle finirait par
   mentir. Seul le REMPLISSAGE se calcule, au lancement de la partie ; le dessin,
   lui, s'écrit à la main et se relit à l'œil.

   Chaque motif porte le dessin ASCII dont ses coordonnées sont issues : c'est la
   seule forme sous laquelle un motif se relit vraiment. Les coordonnées seules
   ne se vérifient pas, elles se recopient.

   ── Une liste PROPRE à ce jeu, et pas celle des mots casés ──────────────────

   Les deux jeux partagent le moteur, jamais les dessins. Quatre des sept motifs
   de #664 sortent des bornes ci-dessous, et deux ne se remplissent pas avec la
   banque de définitions (mesuré : 0 fois sur 200, même à 64 fois le budget du
   solveur). Les importer ferait entrer par la porte ce que les critères 14 et 16
   refusent par la fenêtre.

   ── Les deux bornes de taille, et d'où elles viennent ───────────────────────

   • **Sept lignes au plus** : c'est le critère 14.
   • **Six colonnes au plus** : c'est la condition NÉCESSAIRE du critère 36 (une
     case d'au moins 44 px sur un écran de 360). L'écran de jeu vit dans `.home`,
     qui prend 20 px de marge de chaque côté, et une barre de défilement peut
     manger 15 px de plus : il reste 305 px, soit 50 px par case à six colonnes et
     43,6 px à sept. Une septième colonne ne rend pas le critère difficile, elle
     le rend inatteignable — aucune feuille de style ne rattrape ça.

   Conséquence directe, et elle façonne tous les dessins d'ici : un mot horizontal
   fait six lettres au plus, un mot vertical sept. Les mots de huit lettres et
   plus de la banque n'entrent dans AUCUNE grille de ce jeu.

   ── Les quatre règles que tout motif d'ici respecte ─────────────────────────

   1. **Aucun emplacement isolé** (critère 15), et même aucun BLOC détaché : un
      mot qui ne croise rien ne reçoit jamais une lettre de son voisin, donc
      l'enfant le remplit à l'aveugle sur la seule foi de sa définition.
   2. **Chaque emplacement garde au moins une case à lui**, que personne ne
      traverse. Sans elle, un mot court très croisé se déduit lettre à lettre
      sans lire sa définition — ce qui est exactement le contraire du jeu.
   3. **Quatre lettres au moins, sept au plus.** Sous quatre, la banque de
      définitions n'a presque rien ; au-delà de sept, le dessin ne tient plus dans
      les bornes ci-dessus.
   4. **Cinq ou six emplacements, pour quatre à six croisements.** C'est la
      densité MESURÉE comme sûre sur les 231 mots définis : 200 remplissages sur
      200. À huit croisements pour sept emplacements, on tombe à 0 sur 200, et
      multiplier le budget par 64 n'y change rien — ce n'est pas une recherche qui
      s'épuise, c'est une grille qui n'existe pas. Un motif ajouté ici se mesure
      (`tests/mots-croises.test.ts` en exige 18 sur 20) avant d'être livré.

   Pas de « taille » jouable, contrairement aux mots casés : l'issue #665 ne
   propose aucun choix de format à l'enfant, et sa seule porte de sortie est
   « Nouvelle grille ». Une propriété de plus serait une fonctionnalité inventée,
   avec la clé de stockage qui va avec — que le critère 43 refuse.
   ============================================================ */
import type { Emplacement, Motif } from '../../core/jeux/grille-mots';

/** Abréviations d'écriture : un emplacement horizontal, un vertical. Elles ne
    FABRIQUENT rien — chaque appel est une ligne de donnée écrite à la main. */
const h = (ligne: number, colonne: number, longueur: number): Emplacement => ({
	ligne,
	colonne,
	longueur,
	sens: 'h',
});

const v = (ligne: number, colonne: number, longueur: number): Emplacement => ({
	ligne,
	colonne,
	longueur,
	sens: 'v',
});

export const MOTIFS_MOTS_CROISES: readonly Motif[] = [
	{
		id: 'escalier',
		largeur: 6,
		hauteur: 7,
		/* Le plus léger : 5 mots, 4 croisements, et deux paliers qui descendent de
		   gauche à droite. C'est la grille d'entrée, celle qui se finit d'une
		   traite.
		   .#####
		   .#....
		   .#....
		   ######
		   ....#.
		   ....#.
		   ..#### */
		emplacements: [h(0, 1, 5), v(0, 1, 4), h(3, 0, 6), v(3, 4, 4), h(6, 2, 4)],
	},
	{
		id: 'fenetre',
		largeur: 6,
		hauteur: 7,
		/* La plus dense des six : 6 mots, 6 croisements. Chaque mot en croise deux,
		   sauf les deux du bas — ce qui laisse toujours un endroit par où entrer.
		   ######
		   #..#..
		   #..#.#
		   #..#.#
		   ######
		   .....#
		   ..#### */
		emplacements: [h(0, 0, 6), v(0, 0, 5), v(0, 3, 5), h(4, 0, 6), v(2, 5, 5), h(6, 2, 4)],
	},
	{
		id: 'echelle',
		largeur: 5,
		hauteur: 7,
		/* Cinq colonnes seulement : les cases y sont les plus grandes du lot
		   (61 px sur un écran de 360), au prix de mots plus courts.
		   #####
		   #...#
		   #...#
		   #####
		   ..#..
		   ..#..
		   ##### */
		emplacements: [h(0, 0, 5), v(0, 0, 4), v(0, 4, 4), h(3, 0, 5), v(3, 2, 4), h(6, 0, 5)],
	},
	{
		id: 'zigzag',
		largeur: 6,
		hauteur: 6,
		/* Le seul en six lignes : la grille la plus courte du lot. Quatre
		   croisements seulement, et deux longs mots horizontaux qui donnent
		   beaucoup de lettres à leurs voisins.

		   Son premier dessin, à cinq croisements, ne se remplissait JAMAIS
		   (0 sur 20, et 0 sur 5 à 64 fois le budget) : trois mots de quatre lettres
		   y étaient contraints deux fois chacun, or la banque n'en compte que 22 et
		   leurs finales se ressemblent toutes. Mesuré avant de livrer, comme le
		   demande la règle 4 de l'en-tête — le dessin a été refait, pas le seuil.
		   ####..
		   #.....
		   ######
		   #....#
		   #....#
		   #.#### */
		emplacements: [h(0, 0, 4), v(0, 0, 6), h(2, 0, 6), v(2, 5, 4), h(5, 2, 4)],
	},
	{
		id: 'poteau',
		largeur: 6,
		hauteur: 7,
		/* Un mot de sept lettres, le plus long qu'une grille de sept lignes puisse
		   porter, et il traverse les trois mots horizontaux.
		   .####.
		   .#..#.
		   .#..#.
		   ######
		   .#....
		   .#....
		   .##### */
		emplacements: [h(0, 1, 4), v(0, 1, 7), v(0, 4, 4), h(3, 0, 6), h(6, 1, 5)],
	},
	{
		id: 'lampadaire',
		largeur: 6,
		hauteur: 7,
		/* La symétrique du précédent : le long mot vertical est au centre, et les
		   trois horizontaux se décalent vers la droite en descendant.
		   #####.
		   ..#...
		   ..#...
		   ..####
		   ..#..#
		   ..#..#
		   ###### */
		emplacements: [h(0, 0, 5), v(0, 2, 7), h(3, 2, 4), v(3, 5, 4), h(6, 0, 6)],
	},
];
