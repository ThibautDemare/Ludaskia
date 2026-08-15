/* ============================================================
   Déroulé d'étayage (#490) — modèle COMMUN aux résolutions générées, logique pure.
   ------------------------------------------------------------
   La PR pilote n'avait qu'un moteur (le calcul posé) : son déroulé pouvait rester
   dans son module et le panneau le connaître de nom. Avec cinq moteurs, ce couplage
   ferait grossir le panneau d'un `if` par famille d'exercice. Ce module fixe donc le
   CONTRAT que chaque moteur remplit — le panneau ne connaît plus que lui.

   Ce qu'un déroulé décrit, et rien de plus :
   - une suite de PAS, chacun avec sa phrase (ce qu'on dit à l'enfant à ce moment-là) ;
   - ce que le pas ÉCRIT, désigné par des clés stables (`cible`), jamais par une
     géométrie d'écran. La géométrie appartient au rendu (ui/etayage-visuels.ts), qui
     seul sait qu'une case de retenue est au-dessus de sa colonne ou qu'un repère se
     pose sur une graduation. Un moteur pur reste ainsi testable sans DOM.

   Ce que ce modèle NE fait pas : il ne dit pas comment on dessine, ni quand on
   s'arrête de dessiner. Un moteur qui a besoin d'un état plus riche qu'une écriture
   (la droite graduée pose un repère, pas un chiffre) étend `PasEtayage` chez lui ;
   le panneau, lui, n'a jamais besoin d'en savoir plus.
   ============================================================ */

/** Ce qu'un pas écrit : une valeur, dans une case désignée par une clé stable. Les
    clés sont propres au moteur (« l0c2 », « km », « ret3 ») ; leur seule contrainte est
    d'être les mêmes des deux côtés — celui qui décrit et celui qui dessine. */
export interface EcritureEtayage {
	cible: string;
	texte: string;
}

/** Un pas du déroulé : ce qu'on dit, ce qu'on écrit, ce qu'on met en avant. */
export interface PasEtayage {
	/** Ce qu'on dit à l'enfant. Une idée par phrase, trois au plus (charte #272). */
	phrase: string;
	/** Les cases remplies à ce pas (cumulatives : le rendu rejoue depuis le début). */
	ecritures?: EcritureEtayage[];
	/** Les cases à SURLIGNER à ce pas — celles dont on parle. Vide = aucune. Toujours
	    doublé par le nom de la chose dans la phrase : jamais la couleur seule. */
	actifs?: string[];
}

/** Une résolution déroulable : son titre (l'opération, l'énoncé…) et ses pas. */
export interface DerouleEtayage {
	titre: string;
	pas: PasEtayage[];
}

/** Plafond de longueur d'une résolution générée (#490, point laissé à arbitrer).
    Ce que la charte des « trois étapes au maximum » borne, c'est le texte d'une RÈGLE ;
    la longueur d'une résolution, elle, est dictée par la donnée — on ne peut pas
    raconter une multiplication à deux chiffres en trois phrases sans sauter la moitié
    de la méthode. Deux réponses, et ce sont deux réponses différentes :
    - le VOLUME à l'écran est réglé par le déroulé pas à pas lui-même (une chose à la
      fois, au rythme de l'enfant), et non par un raccourci de la méthode ;
    - le NOMBRE de pas est borné ici, parce qu'un déroulé de vingt-cinq clics n'est plus
      une explication mais une épreuve d'endurance.
    Valeur : les résolutions réellement atteignables plafonnent à une dizaine de pas (la
    plus longue est la multiplication posée à deux chiffres, deux produits partiels plus
    leur addition). 12 laisse donc passer tout ce qui existe et n'arrête que ce qui
    dérive — un item hors calibrage, ou un futur moteur trop bavard. */
export const PAS_MAX = 12;

/** Le déroulé est-il montrable ? Un déroulé vide n'a rien à montrer ; un déroulé plus
    long que `PAS_MAX` est ABANDONNÉ en entier plutôt que tronqué. Couper au douzième pas
    laisserait l'enfant devant une méthode qui s'arrête au milieu — pire que la règle
    seule, qu'il reçoit à la place (dégradation propre, comme une leçon sans contenu). */
export function derouleMontrable(deroule: DerouleEtayage | undefined): boolean {
	return !!deroule && deroule.pas.length > 0 && deroule.pas.length <= PAS_MAX;
}
