/* ============================================================
   Cadrage du tableau de conversion sur la question posée (#711 lot 5).

   Le tableau s'ouvre sur sa première colonne et ne bouge ensuite qu'au fil de la saisie.
   Mesuré à 393 px de large : le défilement vaut 0 à l'apparition de CHAQUE question, et
   sur « 3,2 cm = ? mm » l'enfant lit une question sur les centimètres devant les colonnes
   des kilomètres. Ce module calcule où ouvrir le cadre.

   Pur, sans DOM : le runner mesure (`offsetLeft`, `clientWidth`), ce module décide. C'est
   ce qui permet d'éprouver les cas que le navigateur ne produit qu'au prix d'un viewport
   exotique — un intervalle plus large que le cadre, une conversion vers la gauche, un
   tableau qui ne déborde pas du tout.
   ============================================================ */

/** Bords gauche et droit d'un segment, en pixels, dans le repère du tableau (donc
 *  indépendants du défilement courant). */
export interface Segment {
	debut: number;
	fin: number;
}

/** Défilement horizontal à appliquer au cadre pour ouvrir le tableau sur la question.
 *
 *  `donnee` et `demandee` sont les segments des deux colonnes de la question. Le résultat
 *  est un `scrollLeft`, donc toujours dans `[0, largeurTotale - largeurVisible]`.
 *
 *  `marge` : respiration laissée entre le bord du cadre et la colonne sur laquelle il
 *  s'aligne, pour qu'elle ne colle pas au bord. */
export function scrollPourCadrer(
	donnee: Segment,
	demandee: Segment,
	largeurVisible: number,
	largeurTotale: number,
	marge = 8,
): number {
	const debut = Math.min(donnee.debut, demandee.debut);
	const fin = Math.max(donnee.fin, demandee.fin);
	// Le SENS du remplissage, et non « qui est à gauche » : c'est lui qui décide du bord du
	// cadre qui se pose sur la colonne donnée.
	const versLaDroite = donnee.debut <= demandee.debut;
	let x = versLaDroite ? donnee.debut - marge : donnee.fin + marge - largeurVisible;
	/* La respiration CÈDE devant le critère 21. Poser la marge puis borner la prendrait sur
	   la question : dès que l'intervalle remplit le cadre à moins de `marge` près, le bout de
	   la colonne demandée sortirait de l'écran. On ramène donc la position dans la plage des
	   fenêtres qui contiennent tout l'intervalle — plage non vide précisément quand il tient. */
	if (fin - debut <= largeurVisible) x = Math.min(Math.max(x, fin - largeurVisible), debut);
	return Math.min(Math.max(x, 0), Math.max(0, largeurTotale - largeurVisible));
}
