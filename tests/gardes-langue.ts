/* ============================================================
   Détecteurs de LANGUE partagés par les gates rédactionnels.

   Module NON collecté par Vitest — son nom ne finit ni par `.test.ts` ni par `.spec.ts`,
   les deux seuls suffixes de l'`include` : c'est la forme maison d'une garde appliquée par
   plusieurs specs (cf. `gardes-affixes.ts`).
   Il est ici parce que deux gates au moins appliquent les mêmes deux règles à des
   SURFACES différentes — les panneaux d'étayage (`etayage-redige.test.ts`) et tout le
   vocabulaire d'interface lu par l'enfant (`langue-enfant.test.ts`) — et qu'une règle de
   langue recopiée dans deux fichiers finit par diverger : on corrigerait un faux positif
   d'un côté, et la même phrase resterait signalée de l'autre.

   Les deux détecteurs sont éprouvés sur des phrases FABRIQUÉES dans
   `gardes-langue.test.ts` : ce qu'ils doivent attraper, et — ce qui compte autant — ce
   qu'ils ne doivent PAS signaler. Sans ces témoins, un détecteur devenu trop permissif
   laisserait toutes les surfaces vertes en silence, puisque le contenu réel les respecte
   déjà.
   ============================================================ */

/* ---------- Tutoiement : « vous » est aussi une PERSONNE GRAMMATICALE ----------
   Interdire le mot « vous » revient à interdire de parler de la 2e personne du pluriel,
   c'est-à-dire l'objet même de plusieurs leçons (le pronom sujet, l'accord du verbe, le
   « vous » atypique de « faire » et « dire »). Le vouvoiement ne se reconnaît donc pas au
   MOT mais à son EMPLOI : l'appli qui s'adresse à l'adulte met « vous » en syntaxe
   courante (« vous pouvez », « aidez-vous de », « votre enfant »), tandis qu'un texte
   qui parle de la langue le CITE. Deux façons de citer, et deux seulement :
   - entre guillemets — « vous », comme tous les mots dont le contenu parle ;
   - dans une ÉNUMÉRATION de personnes (« … nous ou vous », « nous, vous, ils »), où le
     voisin immédiat est lui-même une forme de personne.
   Tout le reste est du vouvoiement. Deux limites connues et assumées, symétriques : une
   phrase qui ouvrirait par une énumération avant de vouvoyer (« Nous, vous devez… »)
   passerait, et une énumération relâchée par une préposition (« avec nous, ou avec vous »)
   serait signalée à tort. C'est le prix d'une règle qui tient sur un VOISIN immédiat ; la
   sortie de secours, dans ce dernier cas, est de mettre le mot cité entre guillemets —
   ce que le contenu fait déjà partout ailleurs. */
const FORMES_PERSONNE = [
	'je',
	'tu',
	'il',
	'elle',
	'on',
	'nous',
	'vous',
	'ils',
	'elles',
	'me',
	'te',
	'se',
	'moi',
	'toi',
	'lui',
	'eux',
	'leur',
	'mon',
	'ma',
	'mes',
	'ton',
	'ta',
	'tes',
	'son',
	'sa',
	'ses',
	'notre',
	'nos',
	'votre',
	'vos',
].join('|');

/* Séparateur d'énumération à la française : virgule, « ou », « et ». */
const LIEN = String.raw`(?:,|\bou\b|\bet\b)`;
const PERSONNE_AVANT = new RegExp(`(?:^|[^\\p{L}])(?:${FORMES_PERSONNE})\\s*${LIEN}\\s*$`, 'u');
const PERSONNE_APRES = new RegExp(`^\\s*${LIEN}\\s*(?:${FORMES_PERSONNE})(?:[^\\p{L}]|$)`, 'u');

/** L'occurrence est-elle entre guillemets ? Le dernier chevron ouvert avant elle n'est
    pas encore refermé. */
function dansGuillemets(texte: string, i: number): boolean {
	return texte.lastIndexOf('«', i) > texte.lastIndexOf('»', i);
}

/** Les occurrences de « vous / votre / vos » qui S'ADRESSENT au lecteur (donc à un adulte)
    plutôt que de citer la personne grammaticale. Chaîne rendue avec son contexte, pour que
    l'échec montre la phrase fautive et non le seul mot. */
export function vouvoiements(texte: string): string[] {
	const fautes: string[] = [];
	for (const m of texte.matchAll(/\b(?:vous|votre|vos)\b/giu)) {
		const i = m.index;
		if (dansGuillemets(texte, i)) continue;
		const fin = i + m[0].length;
		if (PERSONNE_AVANT.test(texte.slice(Math.max(0, i - 30), i))) continue;
		if (PERSONNE_APRES.test(texte.slice(fin, fin + 30))) continue;
		fautes.push(texte.slice(Math.max(0, i - 20), fin + 20).trim());
	}
	return fautes;
}

/* ---------- Apostrophe droite (convention projet) ----------
   `normalizeText` (src/core/utils.ts) normalise en NFC mais ne replie PAS `’` (U+2019)
   vers `'` : l'apostrophe du projet est celle du clavier de l'enfant. Le gate des
   réponses attendues (#578, `catalogue-invariants.test.ts`) tient la surface où le
   mélange CASSE la correction ; celui-ci tient la surface où il se VOIT — deux
   apostrophes différentes dans un même écran, voire dans une phrase et sa reprise
   ailleurs.

   Détecteur volontairement littéral (pas de regex à contexte) : contrairement au
   vouvoiement, il n'y a pas d'emploi légitime à distinguer d'un emploi fautif. Ce qui
   demande du jugement, c'est la SURFACE à laquelle on l'applique — d'où sa place chez
   l'appelant, qui déclare ce qu'il balaie. */
export function apostrophesCourbes(texte: string): string[] {
	const fautes: string[] = [];
	for (const m of texte.matchAll(/’/gu))
		fautes.push(texte.slice(Math.max(0, m.index - 20), m.index + 21).trim());
	return fautes;
}
