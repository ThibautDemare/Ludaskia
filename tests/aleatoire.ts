/* ============================================================
   LE GÉNÉRATEUR DÉTERMINISTE DES TESTS — un seul, ici, corrigé à la racine.

   Pas un fichier `.test.ts` : c'est un helper, et l'`include` de
   `vite.config.ts` ne ramasse sous `tests/` que les `.test.ts` et les
   `.spec.ts`. Ses PROPRIÉTÉS, elles, sont éprouvées dans
   `tests/aleatoire.test.ts` — le diagnostic ci-dessous se rejoue donc à chaque
   `npm test`, sans que personne ait à le refaire à la main.

   ── POURQUOI IL EXISTE : le LCG qu'il remplace était faux ───────────────────

   Huit fichiers de tests recopiaient à l'identique un LCG semé par de petits
   entiers :

       s = (s * 1664525 + 1013904223) mod 2^32 ;  sortie = s / 2^32

   Sa PREMIÈRE sortie est une fonction AFFINE de la graine : tant que le produit
   ne déborde pas sur 32 bits, elle croît strictement avec elle. Mesuré :

   • graines 1 à 200   → première sortie dans [0,2365 ; 0,3136]. Deux déciles
     occupés sur dix, χ² = 1209,6 à 9 degrés de liberté (le seuil à 0,1 % vaut
     27,88 — on en est à quarante fois le seuil) ;
   • graines 1 à 1000  → [0,2365 ; 0,6236], corrélation de Pearson entre la
     graine et la première sortie : r = 1,0000. Exactement 1, pas « proche ».

   À partir de la DEUXIÈME sortie tout rentre dans l'ordre (χ² = 1,6 puis 0,3),
   ce qui explique que le défaut ait survécu si longtemps : il ne se voit que
   sur les algorithmes dont une décision repose sur le tout premier appel.

   Fisher-Yates en est un, et c'est le mélange employé partout dans le dépôt
   (`src/core/jeux/tirage.ts`, `src/core/jeux/grille-mots.ts`) : sa boucle part
   de la FIN, donc la dernière position est décidée par le tout premier tirage.
   Avec une première sortie coincée dans un cinquième de l'intervalle, la
   permutation s'effondre. Mesuré sur les graines 1 à 200, avec `melanger` :

       taille de la liste     2       3       4        5
       LCG d'avant          1/2     2/6    12/24   24/120
       ce générateur        2/2     6/6    24/24   96/120

   Lire la colonne « 2 » : mélanger deux éléments donnait TOUJOURS la même
   permutation — l'échange, jamais l'identité. Et en 3 éléments, le premier de la
   liste ne se retrouvait JAMAIS en tête (0 fois sur 200), donc jamais choisi par
   un appelant qui prend la tête du mélange.

   Ce n'est pas théorique. Deux dégâts constatés dans ce dépôt :

   1. `src/core/jeux/mots-cases.ts` avait dû remplacer Fisher-Yates par un tri
      sur clé tirée pour contourner le symptôme — un motif « grande » sur trois
      n'était jamais servi en 200 tirages. C'était corriger l'étage du dessous :
      le mélange était juste, le générateur du test était faux.
   2. `src/core/jeux/tirage.ts` avait le même biais, invisible faute d'un test
      assez exigeant : sur 4 jeux éligibles et 500 tirages, seules 2 des 4
      combinaisons de 3 sortaient — deux jeux étaient proposés à TOUS les coups,
      les deux autres se partageaient la troisième place.

   ── CE QU'IL FAIT À LA PLACE ────────────────────────────────────────────────

   splitmix32 : un compteur avancé du nombre d'or, dont chaque valeur passe par
   deux multiplications-décalages avant d'être rendue. La différence de fond avec
   un LCG semé petit tient en une phrase : ici, la première sortie est DÉJÀ un
   brassage complet de la graine, alors que là-bas c'était la graine à peine
   translatée. Aucune sortie ne dépend de l'ORDRE DE GRANDEUR de la graine.

   Ce qui a été mesuré pour le valider (chiffres rejoués par `aleatoire.test.ts`) :

   • première sortie, graines 1 à 200 : les dix déciles occupés, χ² = 7,4 (seuil
     27,88). Idem pour les sorties 2 à 12 : χ² entre 4,9 et 19,7 ;
   • corrélation graine / première sortie sur 1..1000 : r = −0,062 ;
   • flux long depuis la graine 1, 100 000 tirages : χ² = 4,25 ;
   • 1 000 000 de tirages : min 9,0 × 10⁻⁸, max 0,9999988 — jamais 1, jamais
     négatif (`melanger` borne déjà le cas 1, mais mieux vaut ne pas l'atteindre) ;
   • graines 1 à 5000 : aucune paire de flux identiques sur les 5 premières
     sorties.

   Écarté au passage : brûler les premières sorties du LCG et brasser sa graine
   marchait aussi (χ² = 7,5), mais réglait le symptôme avec deux constantes de
   plus à justifier. Écarté aussi : réutiliser `mulberry32` de `src/core/utils.ts`
   — de qualité équivalente (χ² = 7,8), mais tester avec le générateur de
   l'application supprime l'indépendance qui fait tout l'intérêt d'un test.

   ── CE QUI NE CHANGE PAS ────────────────────────────────────────────────────

   La raison d'être d'un générateur injecté reste la même : une même graine rend
   la MÊME suite, donc un invariant qui casse une fois sur mille se rejoue à
   l'identique. Jamais de `Math.random` dans un test.
   ============================================================ */

/** Générateur déterministe dans [0, 1[ (splitmix32). Deux appels de même graine
    produisent la même suite ; deux graines voisines produisent des suites sans
    rapport — c'est la propriété que le LCG précédent n'avait pas. */
export function tirage(graine: number): () => number {
	let compteur = graine >>> 0;
	return () => {
		compteur = (compteur + 0x9e3779b9) | 0;
		let t = compteur ^ (compteur >>> 16);
		t = Math.imul(t, 0x21f0aaad);
		t = t ^ (t >>> 15);
		t = Math.imul(t, 0x735a2d97);
		t = t ^ (t >>> 15);
		return (t >>> 0) / 4294967296;
	};
}
