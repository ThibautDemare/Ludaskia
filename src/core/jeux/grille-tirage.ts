/* ============================================================
   Ce que le SUDOKU (#666) et le CALCUDOKU (#667) partagent VRAIMENT.

   Trois fonctions, pas une de plus, et c'est le sujet de cet en-tête.

   ── CE QU'IL Y A DEDANS, ET POURQUOI CES TROIS-LÀ ───────────────────────────

   Le critère d'entrée n'est pas « ça se ressemble », c'est **deux clients réels
   et vérifiés, qui appellent le MÊME code avec les mêmes attendus** :

   • `melanger` — Fisher-Yates avec la garde `Math.min`. Les deux copies étaient
     identiques au caractère près, commentaire compris. Une divergence entre
     elles n'aurait eu aucune chance d'être remarquée, puisque les deux jeux
     tirent séparément ;
   • `solutionComplete` — le remplissage par retour arrière d'une grille vide,
     qui ne connaît du jeu que son `MoteurGrille`. La version du sudoku prenait
     déjà son moteur en paramètre ; celle du calcudoku se fermait sur le sien,
     ce qui la rendait impossible à réutiliser sans la réécrire ;
   • `casesLieesDans` — les cases contraintes par une case, pour le déchargement
     de repérage. Les deux ne différaient QUE par les familles de zones
     parcourues : ligne et colonne pour le calcudoku, plus la région pour le
     sudoku. Un paramètre a suffi.

   ── CE QU'IL N'Y A PAS DEDANS, ET POURQUOI IL NE FAUT PAS L'Y VERSER ────────

   `poser`, `grilleTerminee`, `grilleValide` SE RESSEMBLENT sans être la même
   chose : les deux jeux n'ont pas la même `Partie` (l'un porte une taille,
   l'autre des cages), donc les fusionner demanderait des rappels ou des
   génériques pour gagner trois lignes de corps. Le coût de lecture dépasserait
   le gain, et le résultat serait une abstraction que personne ne saurait
   appeler sans relire les deux jeux d'abord.

   Cette prudence n'est pas théorique, elle est PAYÉE. `grille-mots.ts`,
   factorisé lors de #664, s'est révélé générique à moitié seulement : neuf de
   ses exports n'ont jamais eu qu'un seul client. Il a fallu lui écrire un
   en-tête avertissant le lecteur que la moitié du fichier ne concerne qu'un jeu,
   et retirer de la documentation d'architecture une promesse de réutilisation
   déjà propagée. Le module coûtait alors plus cher à comprendre qu'il ne faisait
   économiser.

   Donc, avant d'ajouter quoi que ce soit ici : **deux appelants existants, qui
   passent par la même signature, sans paramètre ajouté pour les départager**.
   Un paramètre de plus par client est le signe qu'il s'agit de deux fonctions,
   pas d'une.

   Une exception assumée au nom du fichier : `casesLieesDans` ne sert pas le
   tirage, mais l'affichage (le jeu lui demande quoi surligner). Elle est ici
   parce qu'elle parle la même langue que les deux autres — une `Geometrie`, des
   `Zone`s, aucun DOM — et qu'un quatrième module pour une fonction de quinze
   lignes coûterait plus qu'il ne rangerait.

   Le moteur, lui, ne bouge pas. `grille-contraintes.ts` est figé par empreinte
   (critère 41 de #667) : ce fichier-ci est un module NEUF posé à côté, jamais un
   élargissement de celui-là.
   ============================================================ */
import type { Geometrie, MoteurGrille, Valeurs, Zone } from './grille-contraintes';

/** Mélange de Fisher-Yates, sur une COPIE : la source n'est jamais mutée.

    La garde `Math.min` n'est pas de la décoration. Un générateur importé ou
    bricolé qui rendrait exactement 1 produirait `Math.floor(1 × (i + 1))`, donc
    un index hors tableau, donc un `undefined` glissé dans la permutation — une
    grille avec un trou, sans la moindre exception pour le signaler. */
export function melanger<T>(source: readonly T[], r: () => number): T[] {
	const a = [...source];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.min(i, Math.floor(r() * (i + 1)));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Une grille complète et valide pour ce moteur, tirée : retour arrière case par
    case, les candidats étant essayés dans un ordre mélangé.

    Ne connaît du jeu que son `MoteurGrille` — c'est ce qui la rend commune au
    carré latin du calcudoku et à la grille à régions du sudoku.

    Rend la grille telle qu'elle a été remplie, sans jamais lever : une géométrie
    qui n'admettrait AUCUNE grille complète rendrait donc un tableau encore
    troué. Les deux appelants s'en remettent ensuite à leur propre garantie
    (déduction élémentaire sur l'énoncé), qui refuse ce cas comme elle refuserait
    n'importe quelle grille non finissable. */
export function solutionComplete(m: MoteurGrille, r: () => number): Valeurs {
	const total = m.geometrie.cotes * m.geometrie.cotes;
	const v: Valeurs = new Array<number>(total).fill(0);
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

/** Les cases contraintes par la case `index` dans les familles de zones données,
    elle-même EXCLUE. Sert le déchargement de repérage : l'enfant n'a plus à
    calculer quelles cases comptent avant de chercher un conflit, mais la
    déduction, elle, reste entière.

    Les familles sont le seul paramètre qui distingue les deux jeux : ligne et
    colonne pour une grille sans région, plus la région quand il y en a une. Un
    index hors grille rend un ensemble VIDE plutôt que de lever — un doigt qui
    glisse sur un bord ne doit pas casser l'écran. */
export function casesLieesDans(
	geo: Geometrie,
	familles: readonly ((geo: Geometrie) => Zone[])[],
	index: number,
): Set<number> {
	const out = new Set<number>();
	const total = geo.cotes * geo.cotes;
	if (!Number.isInteger(index) || index < 0 || index >= total) return out;
	for (const famille of familles) {
		for (const zone of famille(geo)) {
			if (!zone.includes(index)) continue;
			for (const i of zone) if (i !== index) out.add(i);
		}
	}
	return out;
}
