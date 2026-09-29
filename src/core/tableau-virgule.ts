/* ============================================================
   Frontières de colonne du tableau de conversion, côté virgule (#711 lot 4).

   Le tableau se remplit en cases, liste PLATE — une colonne de tête peut en fournir deux,
   parce que la tranche fixe doit encaisser les valeurs jusqu'à 20. La virgule, elle, se
   pose entre deux COLONNES. Ces trois fonctions font la traduction, et elles sont les
   seules à la faire : `virguleApres` est un index de COLONNE, la position retenue par le
   runner un index de CASE, et les confondre décale la virgule d'un rang — uniquement sur
   les leçons à tête double, donc un bug qui ne se voit que sur « 12 km » et jamais sur
   « 3 km ». C'est précisément pour ce cas-là que la logique vit ici, dans `core/`, où un
   test peut la jouer sur un tableau fabriqué au lieu d'attendre qu'un tirage aléatoire
   veuille bien le produire.

   Pur, sans DOM : la géométrie du tableau est entièrement portée par `colonnes`.
   ============================================================ */
import type { Exercise } from './exercise';

type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;

/** Géométrie minimale dont ces fonctions ont besoin : le nombre de chiffres par colonne.
 *  Volontairement plus étroit qu'un `Tableau` complet — un test n'a pas à fabriquer un
 *  énoncé ni une réponse pour éprouver un découpage de colonnes. */
export interface GeometrieTableau {
	colonnes: { chiffres: string }[];
	virguleApres?: number;
}

/** Index de la dernière case de la colonne `col` (= la frontière « après cette colonne »).
 *  C'est la SEULE position où une virgule se pose : jamais entre les deux chiffres d'une
 *  tête, qui est un artefact de la tranche fixe et pas un objet de classe. */
export function derniereCaseDe(ex: GeometrieTableau, col: number): number {
	return ex.colonnes.slice(0, col + 1).reduce((n, c) => n + c.chiffres.length, 0) - 1;
}

/** Index de la colonne à laquelle appartient la case `i`.
 *
 *  DOMAINE, et il est borné des DEUX côtés — l'oubli du bas est ce qui rend ces fonctions
 *  piégeuses à composer :
 *  - au-delà de la dernière case, on retombe sur la dernière colonne. L'appelant est le
 *    runner, dont la case active est toujours dans les bornes, et rendre -1 propagerait
 *    silencieusement une position de virgule invalide au lieu d'échouer près de la cause ;
 *  - **en dessous de zéro, on retombe sur la première colonne**, et c'est écrit ici parce
 *    que c'était jusqu'alors un accident de la comparaison `i < n`. Le piège à connaître :
 *    `caseVirguleAttendue` rend -1 quand l'exercice ne demande PAS de virgule, donc
 *    composer les deux sans écarter ce cas répond « après la première colonne » là où la
 *    réponse est « il n'y en a pas ». Ne jamais enchaîner les deux sans garde. */
export function colonneDeCase(ex: GeometrieTableau, i: number): number {
	if (i < 0) return 0;
	let n = 0;
	for (let c = 0; c < ex.colonnes.length; c++) {
		n += ex.colonnes[c].chiffres.length;
		if (i < n) return c;
	}
	return ex.colonnes.length - 1;
}

/** Où la virgule est ATTENDUE, en index de case. `-1` quand l'exercice n'en demande pas
 *  (mode `tableau` sur une conversion entière) — jamais une case valide, donc une position
 *  choisie par l'enfant ne peut pas y être déclarée juste par accident. */
export function caseVirguleAttendue(ex: GeometrieTableau): number {
	return ex.virguleApres === undefined ? -1 : derniereCaseDe(ex, ex.virguleApres);
}

export type { Tableau as TableauConversion };
