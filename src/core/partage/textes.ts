/* ============================================================
   Séance partagée (#734) — LISTES BLANCHES des textes d'un lien (critère 39).

   Deux régimes, selon ce que le texte devient à l'écran :

   - les textes SAISIS PAR UN ADULTE et affichés à l'enfant (libellé de l'envoi, mots
     d'une dictée personnalisée) ou par un enfant et affichés à l'adulte (pseudo) :
     liste blanche STRICTE. Ce sont eux qu'un lien forgé viserait en premier, et leur
     forme légitime est étroite — un mot, un prénom, un intitulé court ;
   - les ÉNONCÉS d'exercices : texte libre (un signe `<` est une réponse valable en
     numération), protégé par l'échappement à l'affichage (#614) et la CSP (critère
     42). Seuls les contrôles et les forçages bidirectionnels y sont refusés
     (cf. `chaine` dans `schema.ts`).

   Les textes portés par une FIGURE sont un cas à part : le moteur de figures compose
   du SVG en chaîne et n'échappe pas toutes les valeurs d'attribut (`attrs`). Les
   caractères capables d'en sortir y sont donc refusés à l'entrée (`texteFigure`).
   ============================================================ */
import { LEVEL_ORDER } from '../levels';
import { CARACTERES_INTERDITS, chaine, parmi, refuser, valeurSimple, type Schema } from './schema';

/** Une chaîne bornée, sans espace de tête ni de queue, qui contient au moins un caractère
 *  « plein » (lettre ou chiffre selon la liste). */
function texteBorne(motif: RegExp, plein: RegExp, max: number): Schema<string> {
	const base = chaine({ min: 1, max, motif });
	return valeurSimple((v, chemin) => {
		const s = base.lire(v, chemin);
		if (s.trim() !== s) refuser(chemin, 'espace en tête ou en fin');
		if (!plein.test(s)) refuser(chemin, 'aucune lettre');
		return s;
	});
}

/** Niveau scolaire : la liste vient de `LEVEL_ORDER`, pour qu'un niveau ajouté au
 *  catalogue voyage sans qu'on pense à l'ajouter ici. */
export const niveauScolaire = parmi(...LEVEL_ORDER);

/** Contrôles qui SÉPARENT (tabulation, sauts de ligne) : remplacés par une espace et non
 *  retirés, sinon « 3<tab>4 » deviendrait « 34 » et changerait la réponse de l'enfant. */
// eslint-disable-next-line no-control-regex -- ces contrôles sont précisément ce qu'on traque
const BLANCS_DE_CONTROLE = /[\x09-\x0d\x85]/g;
const INTERDITS = new RegExp(CARACTERES_INTERDITS.source, 'g');

/** Ramène un texte LIBRE dans les bornes d'un champ texte libre : retire ce que `chaine`
 *  refuserait toujours (contrôles, forçages bidirectionnels) et tronque au plafond, avec
 *  « … ». Sert au résultat, où le texte vient d'une saisie d'enfant : sa séance est finie,
 *  son lien doit s'encoder quoi qu'il ait tapé ou collé. */
export function borner(texte: string, max: number): string {
	const propre = texte.replace(BLANCS_DE_CONTROLE, ' ').replace(INTERDITS, '');
	if (propre.length <= max) return propre;
	// Coupe sur une frontière de CARACTÈRE : un emoji tient sur deux unités UTF-16, et en
	// garder la première moitié afficherait « � » chez l'encadrant.
	let fin = max - 1;
	const code = propre.charCodeAt(fin - 1);
	if (code >= 0xd800 && code <= 0xdbff) fin--;
	return propre.slice(0, fin) + '…';
}

/** Lettres (accents compris), apostrophe, trait d'union, espace. */
export const MOTIF_MOT = /^[\p{L}\p{M}' -]+$/u;
/** Le même, chiffres en plus (pseudo, libellé). */
export const MOTIF_NOM = /^[\p{L}\p{M}0-9' -]+$/u;

export const LONGUEUR_MAX_MOT = 40;
export const LONGUEUR_MAX_PSEUDO = 30;
export const LONGUEUR_MAX_LIBELLE = 60;
export const NOMBRE_MAX_MOTS = 60;

export const motDictee = texteBorne(MOTIF_MOT, /\p{L}/u, LONGUEUR_MAX_MOT);
export const pseudo = texteBorne(MOTIF_NOM, /[\p{L}0-9]/u, LONGUEUR_MAX_PSEUDO);
export const libelle = texteBorne(MOTIF_NOM, /[\p{L}0-9]/u, LONGUEUR_MAX_LIBELLE);

/** « Comme dans… » d'une dictée : un bout de phrase, donc la ponctuation courante en plus. */
export const commeDans = texteBorne(/^[\p{L}\p{M}0-9' \u00a0\u202f,.;:!?…«»()-]+$/u, /\p{L}/u, 120);

/** Phrase à trou d'une cible verbe : un pronom avant (« j' », « nous »), un complément
 *  après (« une pomme », précédé de son espace). Peuvent être vides. */
export const avantVerbe = chaine({ max: 20, motif: /^[\p{L}\p{M}' ]*$/u });
export const apresVerbe = chaine({ max: 80, motif: /^[\p{L}\p{M}0-9' ,-]*$/u });

/** Texte porté par une figure (cote, titre, en-tête de tableau) : tout, sauf ce qui
 *  pourrait sortir d'une valeur d'attribut SVG ou ouvrir une balise. */
export const texteFigure = (max: number): Schema<string> =>
	chaine({ max, motif: /^[^<>"&`\\]*$/u });

/** Identifiant aléatoire (envoi, résultat) : 12 caractères base64url. */
export const identifiant = chaine({ min: 12, max: 12, motif: /^[A-Za-z0-9_-]+$/ });

/** Identifiant de leçon du catalogue (`fr-conj-naitre-passe_compose`). */
export const idLecon = chaine({ min: 1, max: 80, motif: /^[a-z0-9_-]+$/ });

/** Identifiant de mode (`qcm`, `saisie`, `tuiles`…). */
export const idMode = chaine({ min: 1, max: 40, motif: /^[A-Za-z0-9_-]+$/ });

/** Leçon citée par un RÉSULTAT : celle du catalogue, ou la liste d'orthographe qui a
 *  servi de dictée. Plus large qu'`idLecon`, mais sans rien qui sorte d'un attribut. */
export const idLeconResultat = chaine({ min: 1, max: 80, motif: /^[A-Za-z0-9_:.-]+$/ });
