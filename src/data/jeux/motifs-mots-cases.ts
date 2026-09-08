/* ============================================================
   Les MOTIFS de grille des mots casés (#664) — de la donnée, rien d'autre.

   Un motif est un dessin : des emplacements horizontaux et verticaux. Les
   croisements ne sont pas écrits ici, le moteur les DÉDUIT de la géométrie
   (`core/jeux/grille-mots.ts`) — une liste de croisements tenue en parallèle
   finirait par mentir. Seul le REMPLISSAGE est calculé, au lancement de la
   partie ; le dessin, lui, est écrit à la main et relu à l'œil.

   Chaque motif porte le dessin ASCII dont ses coordonnées sont issues : c'est
   la seule forme sous laquelle un motif se relit vraiment. Les coordonnées
   seules ne se vérifient pas, elles se recopient.

   ── Les cinq règles que tout motif d'ici respecte ───────────────────────────

   1. **Aucun emplacement isolé** (critère 6) : un mot qui ne croise rien se
      pose au hasard parmi ceux de sa longueur, et l'enfant n'a aucun moyen de
      savoir s'il a raison.
   2. **Au moins deux emplacements de même longueur** (critère 8), et en
      pratique PLUSIEURS couples. C'est le socle du critère 10 : tant qu'il
      reste un couple de même longueur qu'on ne peut pas échanger sans casser un
      croisement, la grille ne se finit pas en comptant des cases. Mesuré sur
      1000 tirages : un couple qui ne tient qu'à un seul croisement laisse
      passer 6,7 % de grilles entièrement échangeables ; plusieurs couples
      rendent la coïncidence simultanée introuvable.
   3. **Deux emplacements qui se CROISENT n'ont jamais la même longueur.** Ce
      n'est pas une exigence de l'issue, c'est ce qui rend le geste du critère 14
      non ambigu : la case d'un croisement appartient à deux mots, donc y poser
      le mot en main demanderait d'arbitrer entre l'horizontal et le vertical.
      Des longueurs distinctes tranchent toutes seules — un seul des deux
      emplacements peut accueillir le mot.
   4. **Aucun emplacement de moins de quatre lettres.** Le vivier ne compte que
      3 mots de 3 lettres : un tel emplacement servirait éternellement les mêmes.
      Ni de plus de huit, où le vivier redevient maigre (20 mots de 9 lettres).
   5. **Six colonnes au plus pour la « petite »** — plus strict que les huit du
      critère 19, et pour une raison mesurable : sur un écran de 360 px,
      l'écran de jeu vit dans `.home` qui prend 20 px de marge de chaque côté, et
      une barre de défilement peut manger 15 px de plus. Il reste 305 px, soit
      50 px par case à six colonnes — contre 43 px à sept, sous le plancher de
      44 px. La « grande » monte à dix colonnes : 305 / 10 = 30 px, largement
      au-dessus de son plancher de 24 px.

   ── Pourquoi la taille est une propriété DU motif ───────────────────────────

   Un 6×7 est petit par nature. Deux listes séparées auraient permis de ranger le
   même dessin des deux côtés ; une seule liste rend `motifsDe` trivial et le
   choix de l'enfant vérifiable. Le type de taille vit ICI et pas dans le jeu :
   `mots-cases.ts` importe les motifs, l'inverse ferait un cycle.
   ============================================================ */
import type { Emplacement, Motif } from '../../core/jeux/grille-mots';

export type TailleMotsCases = 'petite' | 'grande';

export const TAILLES_MOTS_CASES: readonly TailleMotsCases[] = ['petite', 'grande'];

export interface MotifMotsCases extends Motif {
	taille: TailleMotsCases;
}

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

export const MOTIFS_MOTS_CASES: readonly MotifMotsCases[] = [
	{
		id: 'echelle',
		taille: 'petite',
		largeur: 6,
		hauteur: 7,
		/* Le plus léger des quatre : 5 mots, 19 cases, 4 croisements. C'est la
		   grille d'entrée, celle qui se finit en une session courte.
		   #####.
		   ...#..
		   ...#..
		   .#####
		   .#....
		   .#....
		   .##### */
		emplacements: [h(0, 0, 5), h(3, 1, 5), h(6, 1, 5), v(3, 1, 4), v(0, 3, 4)],
	},
	{
		id: 'tour',
		taille: 'petite',
		largeur: 6,
		hauteur: 7,
		/* .#####
		   ..#...
		   ..#...
		   ######
		   #....#
		   #....#
		   ###### */
		emplacements: [h(0, 1, 5), h(3, 0, 6), h(6, 0, 6), v(3, 0, 4), v(0, 2, 4), v(3, 5, 4)],
	},
	{
		id: 'cadre',
		taille: 'petite',
		largeur: 6,
		hauteur: 8,
		/* ######
		   #....#
		   #....#
		   #....#
		   ######
		   ...#..
		   ...#..
		   .##### */
		emplacements: [h(0, 0, 6), h(4, 0, 6), h(7, 1, 5), v(0, 0, 5), v(4, 3, 4), v(0, 5, 5)],
	},
	{
		id: 'barres',
		taille: 'petite',
		largeur: 6,
		hauteur: 7,
		/* Six croisements pour cinq mots : la plus dense des petites, et la seule
		   où chaque mot en croise deux autres.
		   ######
		   .#..#.
		   .#..#.
		   ######
		   .#..#.
		   .#..#.
		   ###### */
		emplacements: [h(0, 0, 6), h(3, 0, 6), h(6, 0, 6), v(0, 1, 7), v(0, 4, 7)],
	},
	{
		id: 'double',
		taille: 'grande',
		largeur: 9,
		hauteur: 8,
		/* #######..
		   #.....#..
		   #.....#..
		   #.....#..
		   #######..
		   ..#...#..
		   ..#...#..
		   ..#####.. */
		emplacements: [h(0, 0, 7), h(4, 0, 7), h(7, 2, 5), v(0, 0, 5), v(4, 2, 4), v(0, 6, 8)],
	},
	{
		id: 'brique',
		taille: 'grande',
		largeur: 10,
		hauteur: 7,
		/* ########..
		   #......#..
		   #......#..
		   ########..
		   ..#....#..
		   ..#....#..
		   ..######## */
		emplacements: [h(0, 0, 8), h(3, 0, 8), h(6, 2, 8), v(0, 0, 4), v(3, 2, 4), v(0, 7, 7)],
	},
	{
		id: 'peigne',
		taille: 'grande',
		largeur: 10,
		hauteur: 8,
		/* La plus fournie : 7 mots, 33 cases, 8 croisements. Elle occupe les deux
		   sessions d'affilée que le plafond quotidien laisse — d'où la reprise
		   (critère 33), qui n'est pas un confort sur cette grille-là.
		   ########..
		   .#....#...
		   .#....#...
		   .#....#...
		   .########.
		   .....#..#.
		   .....#..#.
		   ..#######. */
		emplacements: [
			h(0, 0, 8),
			h(4, 1, 8),
			h(7, 2, 7),
			v(0, 1, 5),
			v(4, 5, 4),
			v(0, 6, 5),
			v(4, 8, 4),
		],
	},
];
