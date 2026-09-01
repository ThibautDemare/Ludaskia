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

import { brut, html, type SafeHtml } from './html';

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

/* Séparateur de milliers ENTRE DEUX CHIFFRES : U+202F, et U+00A0 que des contenus plus
   anciens emploient encore. Le motif exige un chiffre de chaque côté, donc il ne touche
   pas aux espaces d'une phrase — il s'applique à un texte entier sans le mutiler. Les
   deux caractères sont désignés par leur CODE, jamais écrits en clair (cf. en-tête). */
const SEP_MILLIERS = new RegExp('([0-9])[' + String.fromCharCode(0x202f, 0x00a0) + ']([0-9])', 'g');

/** Le même texte, ses grands nombres RECOLLÉS (« 1 002 050 » → « 1002050 ») : la forme à
 *  donner à qui LIT le texte à voix haute plutôt qu'à qui le regarde. Deux canaux en
 *  dépendent, et c'est pourquoi la règle vit ici plutôt que dans l'un des deux :
 *  - la synthèse vocale du bouton « Écouter » (core/tts-text.ts) : sans la colle, le
 *    moteur ÉPELLE les groupes au lieu de lire un entier (#240) ;
 *  - les régions live (role=\"status\") — annonce d'un verdict, correction du sprint —,
 *    lues par le lecteur d'écran de l'enfant, une pipeline que le projet ne maîtrise pas
 *    et où le séparateur n'a donc rien à faire (avis relecteur-accessibilite, #501).
 *
 *  La graphie AFFICHÉE, elle, reste groupée : seul ce qui part à l'oreille est recollé. */
export function sansSeparateurMilliers(texte: string): string {
	return texte.replace(SEP_MILLIERS, '$1$2');
}

/** Retire tout séparateur d'une saisie numérique avant correction : espaces
 *  ordinaires (\s), fines insécables (U+202F) et insécables (U+00A0). Permet
 *  d'accepter « 1 002 050 » comme « 1002050 » (l'enfant peut recopier le nombre
 *  groupé affiché). Ne touche NI la virgule NI le point (séparateur décimal). */
export function nettoyerSaisieNombre(saisie: string): string {
	return saisie.replace(/[\s\u202F\u00A0]/g, '');
}

/** Parse un nombre en tolérant les conventions FRANÇAISES : virgule décimale
 *  (« 1,5 » → 1.5) et espaces de groupement (« 1 002 » → 1002). Utilisé
 *  SYMÉTRIQUEMENT sur la saisie ET sur la réponse stockée par la correction
 *  numérique (checkNumerique, checkItemAnswer) : une réponse stockée en virgule
 *  (« 4,56 », conversions décimales #248) se compare correctement — sans ça,
 *  `Number("4,56")` = NaN → jamais validée — tout en gardant l'AFFICHAGE du
 *  corrigé en virgule française. Les entiers sont inchangés (« 300 » → 300). */
export function parseNombreFr(valeur: string): number {
	return Number(nettoyerSaisieNombre(valeur).replace(',', '.'));
}

/** La saisie est-elle un NOMBRE exploitable ? Sert aux runners à REFUSER une réponse
 *  illisible (« 3- », un caractère parasite du pavé numérique d'Android) au lieu de la
 *  compter fausse : ce n'est pas une erreur de calcul, c'est une erreur de format.
 *
 *  Le critère est volontairement calé sur `parseNombreFr`, l'unique parse de la
 *  correction numérique : est un nombre exactement ce que la correction sait comparer.
 *  C'est cet alignement qui garantit qu'aucune réponse acceptée aujourd'hui ne devient
 *  refusée demain — « 3,5 », « ,5 », « 03 », « 1 002 050 » passent tous. Seul ce qui
 *  vaut NaN, donc ce qui était de toute façon compté faux, est écarté. Ne PAS durcir en
 *  expression régulière « stricte » : on refuserait des saisies aujourd'hui justes.
 *
 *  Une saisie vide n'est pas un nombre : `Number('')` vaut 0, sans ce garde-fou un champ
 *  vide serait déclaré numérique et comparé à 0. */
export function saisieEstNombre(saisie: string): boolean {
	return nettoyerSaisieNombre(saisie) !== '' && Number.isFinite(parseNombreFr(saisie));
}

/* Un nombre GROUPÉ (≥ 10 000) repéré par sa séquence « classes de 3 » séparées par
   l'espace fine insécable U+202F — caractère qu'on n'introduit QUE via formatNombre,
   donc marqueur fiable et sans effet de bord ailleurs dans un énoncé. */
const NOMBRE_GROUPE = /\d{1,3}(?:\u202F\d{3})+/g;

/** Enveloppe les grands nombres groupés d'un fragment dans un
 *  `<span class="bignum">` (rendu typographique unique : tabular-nums, nowrap,
 *  clamp — cf. lessons.scss). Les petits nombres (< 10 000, sans séparateur) sont
 *  laissés intacts. Appelé par core/items.ts → enonceTexte, donc partagé par tous
 *  les rendus (fiche, sprint, révision, impression).
 *
 *  Prend et rend un `SafeHtml` (#614) : la fonction réinjecte du balisage AUTOUR
 *  de son entrée, elle ne peut donc travailler que sur du contenu déjà échappé.
 *  Avant, ce contrat vivait dans le NOM du paramètre (`escaped`) — rien n'empêchait
 *  de lui passer du texte brut. C'est désormais une erreur de compilation. */
export function wrapGrandsNombres(fragment: SafeHtml): SafeHtml {
	// Le motif ne capture que des chiffres et l'espace fine U+202F : rien à échapper
	// dans `m`, et le reste du fragment était déjà sûr en entrant.
	return brut(
		fragment.balisage.replace(
			NOMBRE_GROUPE,
			(m) => html`<span class="bignum">${m}</span>`.balisage,
		),
	);
}

/* Noms français des nombres pour la lecture verbale (#249 : numérateurs impropres > 9,
   ex. « vingt-sept cinquièmes »). Table 0-19 (mots pleins) + dizaines 20-60 ; les paliers
   irréguliers 70/80/90 sont composés à la volée (soixante-dix, quatre-vingts…). */
const UNITES_MOTS = [
	'zéro',
	'un',
	'deux',
	'trois',
	'quatre',
	'cinq',
	'six',
	'sept',
	'huit',
	'neuf',
	'dix',
	'onze',
	'douze',
	'treize',
	'quatorze',
	'quinze',
	'seize',
	'dix-sept',
	'dix-huit',
	'dix-neuf',
];
const DIZAINES_MOTS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** Écrit un entier de 0 à 99 en toutes lettres (français), conventions scolaires :
 *  « et » à 21/31/41/51/61 et 71, traits d'union ailleurs, « quatre-vingts » invariable
 *  suivi d'un nombre. Au-delà de 99, repli sur les chiffres (aucun appel dans ce cas :
 *  les numérateurs de fractions de l'app plafonnent à ~69). */
export function nombreEnMots(n: number): string {
	if (n < 0 || n > 99 || !Number.isInteger(n)) return String(n);
	if (n < 20) return UNITES_MOTS[n];
	if (n < 70) {
		const d = Math.floor(n / 10);
		const u = n % 10;
		if (u === 0) return DIZAINES_MOTS[d];
		if (u === 1) return `${DIZAINES_MOTS[d]} et un`;
		return `${DIZAINES_MOTS[d]}-${UNITES_MOTS[u]}`;
	}
	if (n < 80) {
		// 70-79 : « soixante » + 10-19 (« soixante et onze » pour 71).
		const u = n - 60;
		return u === 11 ? 'soixante et onze' : `soixante-${UNITES_MOTS[u]}`;
	}
	// 80-99 : « quatre-vingt(s) » + 0-19 (« quatre-vingts » pour 80, sinon trait d'union).
	const u = n - 80;
	return u === 0 ? 'quatre-vingts' : `quatre-vingt-${UNITES_MOTS[u]}`;
}

/** Noms des rangs de la numération décimale, du plus petit au plus grand : singulier,
 *  pluriel, GENRE. Une seule table pour toute l'appli — les moteurs d'étayage (#490)
 *  nomment les colonnes d'un calcul posé et les rangs d'un nombre décomposé, et deux tables
 *  auraient fini par diverger sur le pluriel de « dizaine de mille » (invariable sur
 *  « mille »). Le genre y figure pour la même raison : « aucune dizaine » mais « aucun
 *  millier », et un consommateur qui le redéduirait par index se tromperait au premier
 *  rang ajouté (milliard). */
export const NOMS_RANGS: readonly (readonly [string, string, 'm' | 'f'])[] = [
	['unité', 'unités', 'f'],
	['dizaine', 'dizaines', 'f'],
	['centaine', 'centaines', 'f'],
	['millier', 'milliers', 'm'],
	['dizaine de mille', 'dizaines de mille', 'f'],
	['centaine de mille', 'centaines de mille', 'f'],
	['million', 'millions', 'm'],
];

/** Genre grammatical du nom d'un rang, `undefined` au-delà de la table. */
export function genreRang(rang: number): 'm' | 'f' | undefined {
	return NOMS_RANGS[rang]?.[2];
}

/** Nom du rang `rang` (0 = les unités), au pluriel par défaut. `undefined` au-delà de la
 *  table : à l'appelant de décider ce qu'il dit d'un rang qu'aucun enfant n'a encore
 *  rencontré, plutôt que d'inventer un mot. */
export function nomRang(rang: number, pluriel = true): string | undefined {
	const noms = NOMS_RANGS[rang];
	return noms ? noms[pluriel ? 1 : 0] : undefined;
}

/** « 1 dizaine », « 7 dizaines » : une quantité et son unité de position, accordées.
 *  Repli sur le nombre seul au-delà de la table. */
export function quantiteRang(n: number, rang: number): string {
	const nom = nomRang(rang, n > 1);
	return nom ? `${n} ${nom}` : String(n);
}

/** Groupe une CHAÎNE DE CHIFFRES par classes de 3 depuis la droite, séparées par
 *  U+202F — pour l'écho de saisie en temps réel des grands nombres (#327, leçons
 *  « millions » CM1). Travaille sur les chiffres BRUTS (pas via `Number`) pour
 *  restituer EXACTEMENT ce qui est tapé — zéros de tête compris — et n'introduire
 *  QUE des séparateurs (aucune valeur n'est recalculée). Ne groupe qu'à partir de
 *  5 chiffres (≥ 10 000), comme `formatNombre` : la plage CE2 (≤ 9 999) reste sans
 *  séparateur. L'entrée doit être une suite de chiffres (l'appelant neutralise
 *  d'abord espaces et autres caractères). */
export function grouperChiffresSaisis(chiffres: string): string {
	// Seuil aligné sur formatNombre : on ne groupe pas la plage CE2 (≤ 4 chiffres), pour
	// un affichage IDENTIQUE partout (« 1400 » n'est jamais groupé, « 14 000 » l'est).
	if (chiffres.length <= 4) return chiffres;
	// `\B(?=(\d{3})+(?!\d))` insère un séparateur devant chaque groupe de 3 chiffres
	// aligné sur la droite : « 14000 » → « 14 000 », « 1400000 » → « 1 400 000 ».
	return chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE);
}

/* Ce qu'on accepte de mettre en forme dans une réponse RÉVÉLÉE : UN nombre, et rien
   d'autre — entier, ou décimal à séparateur point OU virgule. Le motif est ancré aux
   deux bouts et n'admet AUCUN espace, délibérément : « 104 100 98 94 » (réponse de la
   leçon « ranger des nombres ») est une SUITE de nombres, « 2 h 30 min » une durée,
   « 8/10 » une fraction, « 1er groupe » un rang. Neutraliser les espaces avant un
   `Number` — réflexe tentant, `nettoyerSaisieNombre` est juste au-dessus — fondrait la
   suite en un seul nombre géant (constat de l'auteur-tests-logique, #501). */
const REPONSE_NOMBRE = /^(-?)(\d+)(?:[.,](\d+))?$/;

/** Met en forme la réponse RÉVÉLÉE à un enfant (#501) : le marqueur ✗ de la grille de
 *  fiche, la correction du sprint, le verdict de révision, le corrigé imprimé et la
 *  réponse attendue du journal encadrant lisaient tous la valeur BRUTE — « → 2300000 » à
 *  deux lignes d'un encadrement groupé « 6 100 000 », et « → 3.5 » avec un point que
 *  l'école n'enseigne pas (avis pedagogue-primaire : l'écriture à virgule est un objectif
 *  d'apprentissage du cycle, pas une préférence de graphie).
 *
 *  Deux règles, et une seule autre issue possible : l'entrée rendue INCHANGÉE.
 *  - Entier → `formatNombre`, donc exactement la graphie des énoncés (groupé à partir de
 *    5 chiffres, espace fine insécable).
 *  - Décimal → virgule française, partie entière groupée. Les décimales sont RECOPIÉES
 *    caractère par caractère, jamais relues par un `Number` : « 3.60 » donne « 3,60 » et
 *    non « 3,6 », et aucune réponse ne peut être arrondie ni tronquée par son affichage.
 *
 *  Ne connaît PAS les unités : « 3,5 » ne devient pas « 3,50 » ici. La notation monétaire
 *  se déclare à la source, sur la sous-question (#542) — une fonction qui devinerait un
 *  prix au vu du nombre se tromperait sur la première mesure au dixième. */
export function formatReponseRevelee(valeur: string): string {
	const m = REPONSE_NOMBRE.exec(valeur.trim());
	if (!m) return valeur;
	const [, signe, entier, decimales] = m;
	if (decimales === undefined) {
		const n = Number(signe + entier);
		// Repli sur l'entrée quand le nombre ne se relit pas à l'identique : zéros de tête
		// (« 007 »), magnitude au-delà de la précision d'un `number` (9007199254740993
		// deviendrait …992), « -0 ». Mieux vaut une réponse non groupée qu'une réponse fausse.
		return Number.isSafeInteger(n) && String(n) === signe + entier ? formatNombre(n) : valeur;
	}
	// Groupement AU NIVEAU DES CHIFFRES : `grouperChiffresSaisis` n'insère que des
	// séparateurs, là où repasser par `Number` reperdrait les décimales significatives
	// qu'on vient de préserver.
	return `${signe}${grouperChiffresSaisis(entier)},${decimales}`;
}
