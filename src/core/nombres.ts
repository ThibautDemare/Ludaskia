/* ============================================================
   Formatage des nombres entiers (#240) — logique PURE (sans DOM).

   Une SEULE fonction de mise en forme des grands nombres, réutilisée partout
   où un nombre s'affiche dans un énoncé, une comparaison, un encadrement, un
   écho de saisie ou une correction. But : un formatage IDENTIQUE partout, et
   conforme à la convention française.

   Convention française (CM1 « grands nombres », millions) : les chiffres sont
   groupés par classes de 3 à partir du millier, séparés par une ESPACE FINE
   INSÉCABLE U+202F — JAMAIS une virgule ni un point (la virgule est le
   séparateur DÉCIMAL en français ; un point induirait l'écriture anglo-saxonne).
   `Intl.NumberFormat('fr-FR')` produit exactement ce séparateur : on s'appuie
   dessus (instance unique, réutilisée) plutôt que de réimplémenter le découpage.

   Le groupement ne commence qu'à 5 chiffres (≥ 10 000). En deçà (≤ 9 999, plage
   CE2), le nombre est rendu SANS séparateur : on ne modifie pas l'affichage CE2
   existant, et c'est la graphie scolaire usuelle (le séparateur de milliers
   s'introduit AVEC les grands nombres, pas sur les nombres à 4 chiffres).

   Note d'implémentation : on n'écrit JAMAIS le caractère U+202F en clair dans ce
   source (invisible, fragile à l'édition) ; on le désigne par son échappement
   `\u202F` (et U+00A0 par `\u00A0`).
   ============================================================ */

/** Espace fine insécable (U+202F) : séparateur de milliers français. Exporté
 *  pour les tests et pour neutraliser la saisie (un enfant peut taper le nombre
 *  groupé : « 1 002 050 »). */
export const ESPACE_FINE = '\u202F';

/* Instance unique réutilisée (créer un NumberFormat à chaque appel serait coûteux). */
const FORMAT_FR = new Intl.NumberFormat('fr-FR');

/** Met en forme un entier à la française : groupes de 3 séparés par U+202F, mais
 *  SEULEMENT à partir de 5 chiffres (≥ 10 000). En deçà (plage CE2), le nombre est
 *  rendu sans séparateur — l'affichage CE2 reste inchangé.
 *  Ex. 1002050 → « 1 002 050 », 12000 → « 12 000 », 1234 → « 1234 », 999 → « 999 ». */
export function formatNombre(n: number): string {
	if (Math.abs(n) < 10000) return String(n);
	return FORMAT_FR.format(n);
}

/** Retire tout séparateur d'une saisie numérique avant correction : espaces
 *  ordinaires (\s), fines insécables (U+202F) et insécables (U+00A0). Permet
 *  d'accepter « 1 002 050 » comme « 1002050 » (l'enfant peut recopier le nombre
 *  groupé affiché). Ne touche NI la virgule NI le point (séparateur décimal). */
export function nettoyerSaisieNombre(saisie: string): string {
	return saisie.replace(/[\s\u202F\u00A0]/g, '');
}

/* Un nombre GROUPÉ (≥ 10 000) repéré par sa séquence « classes de 3 » séparées par
   l'espace fine insécable U+202F — caractère qu'on n'introduit QUE via formatNombre,
   donc marqueur fiable et sans effet de bord ailleurs dans un énoncé. */
const NOMBRE_GROUPE = /\d{1,3}(?:\u202F\d{3})+/g;

/** Enveloppe les grands nombres groupés d'un texte DÉJÀ échappé dans un
 *  `<span class="bignum">` (rendu typographique unique : tabular-nums, nowrap,
 *  clamp — cf. lessons.scss). Les petits nombres (< 10 000, sans séparateur) sont
 *  laissés intacts. Appelé par core/items.ts → enonceTexte, donc partagé par tous
 *  les rendus (fiche, sprint, révision, impression). */
export function wrapGrandsNombres(escaped: string): string {
	return escaped.replace(NOMBRE_GROUPE, (m) => `<span class="bignum">${m}</span>`);
}
