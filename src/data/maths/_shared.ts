/* ============================================================
   Déclarations mutualisées des fichiers de données « maths » (#347).
   ============================================================ */

/** Question fermée à choix multiples d'une propriété (géométrie, solides) :
 *  l'énoncé, la bonne réponse et les propositions affichées. Recopiée à
 *  l'identique dans plusieurs fichiers auparavant, centralisée ici. */
export interface PropQ {
	q: string;
	a: string;
	choices: string[];
}
