/* ============================================================
   Diagnostic d'un SEGMENT mal délimité (#716).

   Un exercice où l'enfant désigne un morceau de phrase par ses deux bornes ne se
   trompe presque jamais « au milieu » : l'erreur est un BORD qui a glissé — un mot
   pris en trop au début, un mot oublié à la fin. Le marquage ✓/✗ mot par mot le
   MONTRE, mais ne le DIT pas ; or le critère 6 de #716 demande exactement que
   l'enfant sache « s'il a pris un mot de trop ou oublié le déterminant ».

   D'où cette fonction, volontairement en logique pure (aucun DOM, aucun vocabulaire
   de la notion travaillée) : elle compare deux intervalles et rend la phrase qui
   nomme l'écart. Elle ne dit jamais « le groupe nominal » — c'est le widget qui sait
   de quoi on parle, pas elle ; le jour où un autre exercice fera délimiter autre
   chose (une proposition, un groupe verbal), le diagnostic vaudra tel quel.

   REJET ÉCRIT (relecture langue, #716) : l'adresse mêlée « tu as pris un mot de trop
   au début » / « il manque un mot à la fin » a été signalée comme hétérogène, avec
   « tu as oublié un mot » pour la remplacer. Écarté, et pas par paresse : « il manque »
   CONSTATE une absence, « tu as oublié » impute une intention — or un enfant qui n'a
   pas fermé son bloc au bon endroit n'a rien oublié, il n'a pas encore vu la frontière.
   La phrase mixte (« Tu as pris un mot de trop au début et il manque un mot à la fin. »)
   est par ailleurs idiomatique. Ne pas re-remonter.

   REJET ÉCRIT (auteur des tests, #716) : quand les DEUX bords glissent dans le même
   sens, la phrase répète son verbe (« Il manque un mot au début et il manque 2 mots à
   la fin. ») là où le français factoriserait. Gardé tel quel : chaque proposition reste
   AUTOSUFFISANTE, donc applicable seule par un enfant qui reprend ses bornes une à une —
   et vérifiable seule par un test, qui rejoue chaque correction annoncée pour retrouver
   le segment attendu. L'ellipse gagnerait en élégance ce qu'elle coûterait en clarté,
   pour un lecteur de 9 ans. Ne pas re-remonter.
   ============================================================ */

/** Un segment de phrase, par les INDICES de ses deux bornes (incluses). */
export interface Intervalle {
	debut: number;
	fin: number;
}

/** L'intervalle couvert par un ensemble d'indices, ou `null` si l'ensemble est vide.
    Les indices n'ont pas à être contigus : on ne garde que les deux extrêmes, ce qui
    est précisément ce qu'un geste à deux bornes produit. */
export function intervalleDe(indices: readonly number[]): Intervalle | null {
	if (!indices.length) return null;
	return { debut: Math.min(...indices), fin: Math.max(...indices) };
}

/* Accord en nombre d'un compte de mots (« un mot » / « 3 mots »). « un » et pas « 1 » :
   le texte est lu par un enfant, et par une synthèse vocale qui dirait « un » de toute
   façon — autant que l'écrit et l'oral disent la même chose. */
function mots(n: number): string {
	return n === 1 ? 'un mot' : `${n} mots`;
}

/** Phrase qui nomme l'écart entre le segment `choisi` et le segment `attendu`, ou
    `null` quand les deux coïncident (rien à diagnostiquer) et quand rien n'a été
    choisi (il n'y a pas d'écart à décrire, il n'y a pas de réponse).

    Trois formes, dans cet ordre de priorité :
    - les deux segments ne se CHEVAUCHENT pas du tout → l'enfant a cherché ailleurs, et
      lui parler de bornes décalées n'aurait aucun sens ;
    - un seul bord a glissé → une proposition, qui dit le sens du glissement ;
    - les deux bords ont glissé → les deux propositions, jointes par « et ». */
export function ecartBornes(choisi: Intervalle | null, attendu: Intervalle): string | null {
	if (!choisi) return null;
	if (choisi.debut === attendu.debut && choisi.fin === attendu.fin) return null;
	if (choisi.fin < attendu.debut || choisi.debut > attendu.fin) {
		// Pas « Ce n'est pas au bon endroit » : l'appelant préfixe déjà le diagnostic par
		// « Ce n'est pas ça. », et les deux s'enchaînaient en bégayant à l'oral comme à l'écrit.
		return 'Il faut chercher ailleurs dans la phrase.';
	}
	const parts: string[] = [];
	if (choisi.debut < attendu.debut) {
		parts.push(`tu as pris ${mots(attendu.debut - choisi.debut)} de trop au début`);
	} else if (choisi.debut > attendu.debut) {
		parts.push(`il manque ${mots(choisi.debut - attendu.debut)} au début`);
	}
	if (choisi.fin > attendu.fin) {
		parts.push(`tu as pris ${mots(choisi.fin - attendu.fin)} de trop à la fin`);
	} else if (choisi.fin < attendu.fin) {
		parts.push(`il manque ${mots(attendu.fin - choisi.fin)} à la fin`);
	}
	// Majuscule sur la première proposition seulement : les deux se lisent comme UNE
	// phrase (« Tu as pris un mot de trop au début et il manque un mot à la fin. »).
	const phrase = parts.join(' et ');
	return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`;
}
