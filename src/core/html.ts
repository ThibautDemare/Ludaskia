import { escapeHTML } from './utils';

/* ============================================================
   Échappement HTML PAR CONSTRUCTION (#614).

   Le problème que ce module ferme n'est pas une faille : c'est le fait que la
   sûreté de l'échappement reposait sur la MÉMOIRE de l'auteur. Rien, ni dans le
   type ni dans le linter, ne distinguait une chaîne de texte d'un fragment de
   balisage — les deux sont `string`. Un `${}` oublié passait la relecture sans
   que rien ne rougisse, et le jour où il passe, la valeur concernée est du texte
   saisi par un enfant (nom de profil, réponse tapée) ou un libellé venu d'une
   sauvegarde JSON importée. Le défaut ne casse aucun test et n'apparaît qu'à
   l'exécution.

   Trois pièces :

   1. `SafeHtml` — un objet ENVELOPPE, pas une chaîne marquée. C'est ce qui rend
      la distinction sûre À L'EXÉCUTION : `html` doit pouvoir dire, en recevant
      une valeur, si c'est du balisage qu'il a lui-même produit (à laisser passer)
      ou du texte (à échapper). Une chaîne primitive ne porte aucune marque ; la
      marquer dans un registre fuirait (rien ne permet de tenir faiblement une
      chaîne), et la déguiser en `string` mentirait au typechecker — un fragment
      VIDE deviendrait truthy, `frag === 'x'` toujours faux.
   2. `html` — le gabarit balisé. Il échappe les `string`, laisse passer les
      `SafeHtml`, et surtout il échappe SELON LA POSITION d'insertion.
   3. `brut` — la porte de sortie, explicite et cherchable (`grep 'brut('`).
      Chaque appel doit dire EN COMMENTAIRE d'où vient la confiance.

   ── Pourquoi « selon la position » et pas `escapeHTML` partout ────────────────
   `escapeHTML` échappe les cinq caractères du contexte TEXTE. C'est insuffisant
   dans deux positions que ce dépôt produit réellement :

   - **valeur d'attribut NON QUOTÉE** (`<i class=${c}>`) : `escapeHTML` laisse
     passer l'espace, donc une valeur peut ajouter un SECOND attribut
     (`a onmouseover=…`) sans le moindre chevron ni guillemet ;
   - **URL** (`href`, `src`…) : aucun échappement ne rend `javascript:alert(1)`
     inoffensif, parce que le danger n'est pas dans les caractères mais dans le
     SCHÉMA. Une valeur portant `javascript:` / `data:` est donc REFUSÉE, pas
     échappée en silence.

   ── Ce que ce module ne prétend pas être ──────────────────────────────────────
   Pas un assainisseur de HTML riche : l'application n'accepte de balisage
   utilisateur nulle part, et `SafeHtml` ne promet pas de nettoyer un fragment
   arbitraire — il promet que ce qui porte le type a été construit ici.

   L'analyse de contexte est un automate volontairement petit, taillé sur le
   balisage que ce dépôt écrit (ce n'est pas un parseur HTML5). Il REFUSE ce
   qu'il ne sait pas trancher — interpolation dans un `<script>`/`<style>`, dans
   un nom d'attribut, dans un commentaire — plutôt que de deviner. Un refus est
   bruyant à la première exécution ; une devinette serait silencieuse pour
   toujours.
   ============================================================ */

/** Fragment de balisage construit ici (ou déclaré de confiance via `brut`).
 *  Le balisage se lit par `.balisage` — c'est cette forme que la règle ESLint exige
 *  à droite de toute affectation à `.innerHTML`, ce qui rend la provenance
 *  vérifiable mécaniquement et pas seulement à la relecture.
 *
 *  Pas de `toString()` volontairement : interpoler un fragment dans un gabarit
 *  NON balisé (un simple `` `…${frag}…` ``) rendrait « [object Object] » à
 *  l'écran. C'est laid, donc repérable — là où un `toString()` complaisant
 *  ferait « marcher » un chemin qui a justement perdu son échappement. */
export class SafeHtml {
	constructor(readonly balisage: string) {}
}

/** Valeurs interpolables. `false` / `null` / `undefined` rendent la chaîne vide,
 *  ce qui autorise `${condition && html\`…\`}` sans garde. */
export type ValeurHtml = string | number | SafeHtml | false | null | undefined | ValeurHtml[];

/** Déclare une chaîne de confiance. À n'utiliser QUE sur du balisage dont on
 *  contrôle la source — jamais sur une donnée saisie, importée ou lue dans le
 *  stockage. Chaque appel doit dire EN COMMENTAIRE d'où vient la confiance. */
export const brut = (s: string): SafeHtml => new SafeHtml(s);

/** Fragment vide, pour les branches qui ne rendent rien. */
export const VIDE = new SafeHtml('');

/* ---------- Positions d'insertion ---------- */

type Position =
	| 'texte' // <p>ICI</p>
	| 'attribut-quote' // <p class="ICI">
	| 'attribut-nu' // <p class=ICI>
	| 'url' // <a href="ICI">
	| 'balise' // <p ICI> (entre deux attributs)
	| 'interdit'; // <script>, <style>, nom d'attribut, commentaire

/** Attributs dont la valeur est une URL : le schéma y compte plus que les
 *  caractères. `formaction` et `xlink:href` sont inclus parce qu'ils naviguent
 *  eux aussi et qu'on les oublie systématiquement. */
const ATTRIBUTS_URL = new Set([
	'href',
	'src',
	'action',
	'formaction',
	'xlink:href',
	'data',
	'poster',
	'srcdoc',
	'ping',
]);

/** Schémas refusés en position d'URL : ils exécutent, ou embarquent de quoi
 *  exécuter. `data:` est refusé en bloc — distinguer `data:image/png` du reste
 *  demanderait une liste blanche de types MIME, et aucun appel n'en a besoin. */
const SCHEMAS_REFUSES = /^\s*(javascript|data|vbscript)\s*:/i;

type Etat =
	| 'texte'
	| 'balise'
	| 'nom-attribut'
	| 'avant-valeur'
	| 'valeur-double'
	| 'valeur-simple'
	| 'valeur-nue'
	| 'commentaire'
	| 'texte-brut';

/** Automate sur le balisage STATIQUE du gabarit : il rend, pour chaque
 *  interpolation, la position où elle atterrit. Il ne voit JAMAIS les valeurs —
 *  une valeur ne peut donc pas déplacer la frontière d'un contexte à l'autre. */
export function analyserPositions(parts: readonly string[]): Position[] {
	const positions: Position[] = [];
	let etat: Etat = 'texte';
	let attribut = ''; // nom de l'attribut courant, pour reconnaître une URL
	let baliseBrute = ''; // <script> / <style> en cours

	for (let p = 0; p < parts.length; p++) {
		const s = parts[p];
		for (let i = 0; i < s.length; i++) {
			const c = s[i];
			switch (etat) {
				case 'texte':
					if (c === '<') {
						if (s.startsWith('!--', i + 1)) {
							etat = 'commentaire';
							i += 3;
						} else {
							const nom = /^\/?([a-zA-Z][\w-]*)/.exec(s.slice(i + 1))?.[1]?.toLowerCase();
							etat = 'balise';
							attribut = '';
							baliseBrute = nom === 'script' || nom === 'style' ? nom : '';
						}
					}
					break;
				case 'commentaire':
					if (c === '-' && s.startsWith('->', i + 1)) {
						etat = 'texte';
						i += 2;
					}
					break;
				case 'balise':
					if (c === '>') etat = baliseBrute ? 'texte-brut' : 'texte';
					else if (/[a-zA-Z@:._-]/.test(c)) {
						etat = 'nom-attribut';
						attribut = c;
					}
					break;
				case 'nom-attribut':
					if (c === '=') etat = 'avant-valeur';
					else if (c === '>') etat = baliseBrute ? 'texte-brut' : 'texte';
					else if (/\s/.test(c)) etat = 'balise';
					else attribut += c;
					break;
				case 'avant-valeur':
					if (c === '"') etat = 'valeur-double';
					else if (c === "'") etat = 'valeur-simple';
					else if (c === '>') etat = baliseBrute ? 'texte-brut' : 'texte';
					else if (!/\s/.test(c)) etat = 'valeur-nue';
					break;
				case 'valeur-double':
					if (c === '"') etat = 'balise';
					break;
				case 'valeur-simple':
					if (c === "'") etat = 'balise';
					break;
				case 'valeur-nue':
					if (c === '>') etat = baliseBrute ? 'texte-brut' : 'texte';
					else if (/\s/.test(c)) etat = 'balise';
					break;
				case 'texte-brut':
					// On ne quitte `<script>` / `<style>` qu'à sa balise fermante.
					if (c === '<' && s.startsWith(`/${baliseBrute}`, i + 1)) {
						etat = 'balise';
						baliseBrute = '';
					}
					break;
			}
		}

		if (p === parts.length - 1) break; // rien à interpoler après le dernier morceau

		const estUrl = ATTRIBUTS_URL.has(attribut.toLowerCase());
		switch (etat) {
			case 'texte':
				positions.push('texte');
				break;
			case 'valeur-double':
			case 'valeur-simple':
				positions.push(estUrl ? 'url' : 'attribut-quote');
				break;
			case 'avant-valeur':
			case 'valeur-nue':
				// `<i class=${c}>` : la valeur n'est bornée par rien, une espace suffit
				// donc à ouvrir un second attribut. On échappe en conséquence.
				etat = 'valeur-nue';
				positions.push(estUrl ? 'url' : 'attribut-nu');
				break;
			case 'balise':
				positions.push('balise');
				break;
			default:
				positions.push('interdit');
		}
	}
	return positions;
}

/* Un `TemplateStringsArray` est créé une fois par SITE D'APPEL et réutilisé à
   chaque exécution : on mémorise donc l'analyse pour ne payer l'automate qu'au
   premier rendu. Sans ça, `html` retokeniserait le même gabarit à chaque frappe
   dans la banque de mots. */
const CACHE = new WeakMap<TemplateStringsArray, Position[]>();

/** Caractères qui TERMINENT une valeur d'attribut non quotée : les laisser
 *  passer laisserait la valeur ouvrir l'attribut suivant. Les références
 *  numériques sont bien décodées par l'analyseur HTML dans cette position. */
const ECHAPPEMENT_NU: Record<string, string> = {
	' ': '&#32;',
	'\t': '&#9;',
	'\n': '&#10;',
	'\r': '&#13;',
	'\f': '&#12;',
	'=': '&#61;',
	'`': '&#96;',
};

function echapper(valeur: string, position: Position): string {
	switch (position) {
		case 'texte':
		case 'attribut-quote':
			return escapeHTML(valeur);
		case 'attribut-nu':
			return escapeHTML(valeur).replace(/[\s=`]/g, (c) => ECHAPPEMENT_NU[c] ?? c);
		case 'url':
			refuserSchema(valeur);
			return escapeHTML(valeur);
		case 'balise':
			throw new Error(
				`html : interpolation entre deux attributs (« ${apercu(valeur)} »). Une chaîne y ` +
					`ajouterait des attributs arbitraires, et l'échapper la rendrait inerte. ` +
					`Construire ce fragment avec html\`\` — ou brut(), justifié — pour qu'il porte ` +
					`le type SafeHtml.`,
			);
		default:
			throw new Error(
				`html : interpolation dans une position que le gabarit ne sait pas échapper ` +
					`(script, style, nom d'attribut ou commentaire) : « ${apercu(valeur)} ».`,
			);
	}
}

const apercu = (v: string) => (v.length > 40 ? `${v.slice(0, 40)}…` : v);

function refuserSchema(valeur: string): void {
	if (!SCHEMAS_REFUSES.test(valeur)) return;
	throw new Error(
		`html : schéma d'URL refusé dans « ${apercu(valeur)} ». Un « javascript: » ou un ` +
			`« data: » ne devient pas inoffensif en étant échappé — il exécute. Si cette URL ` +
			`est réellement de confiance, la déclarer avec brut() en disant d'où vient la confiance.`,
	);
}

function rendre(valeur: ValeurHtml, position: Position): string {
	if (valeur === false || valeur === null || valeur === undefined) return '';
	// La chaîne VIDE ne peut rien injecter, quelle que soit la position — y compris
	// entre deux attributs, où le gabarit refuse pourtant les chaînes. C'est la branche
	// « rien à ajouter » du motif `${condition ? drapeau('checked') : ''}`, et la
	// refuser n'apporterait aucune sûreté : elle ferait seulement du bruit.
	if (valeur === '') return '';
	if (Array.isArray(valeur)) return valeur.map((v) => rendre(v, position)).join('');
	// Déjà un fragment : construit ici (ou déclaré via brut), on ne le réécrit PAS.
	// C'est ce qui évite le DOUBLE ÉCHAPPEMENT — un `<strong>` réaffiché en clair à
	// l'enfant, qui ne casse ni la compilation ni les tests.
	if (valeur instanceof SafeHtml) {
		if (position === 'url') refuserSchema(valeur.balisage);
		return valeur.balisage;
	}
	if (typeof valeur === 'number') {
		if (!Number.isFinite(valeur)) throw new Error(`html : nombre non fini interpolé (${valeur}).`);
		return String(valeur);
	}
	if (typeof valeur !== 'string')
		throw new Error(`html : valeur de type « ${typeof valeur} » interpolée.`);
	return echapper(valeur, position);
}

/** Gabarit balisé : échappe chaque interpolation selon sa position d'insertion.
 *
 *  ```ts
 *  el.innerHTML = html`<p class="nom">${profil.name}</p>`.balisage;
 *  ```
 */
export function html(parts: TemplateStringsArray, ...valeurs: ValeurHtml[]): SafeHtml {
	let positions = CACHE.get(parts);
	if (!positions) {
		positions = analyserPositions(parts.raw);
		CACHE.set(parts, positions);
	}
	let sortie = parts[0];
	for (let i = 0; i < valeurs.length; i++)
		sortie += rendre(valeurs[i], positions[i]) + parts[i + 1];
	return new SafeHtml(sortie);
}

/** Attribut ` nom="valeur"` prêt à coller dans une balise, espace de tête comprise.
 *
 *  Pourquoi un helper plutôt qu'un `html\` nom="${v}"\`` : un gabarit commence
 *  toujours en position TEXTE, donc un fragment d'attribut ÉCRIT SEUL serait analysé
 *  hors contexte — l'échappement tomberait juste par chance (les deux contextes
 *  partagent `escapeHTML`) mais un `href` isolé perdrait son contrôle de schéma.
 *  Ici la position est posée explicitement, contrôle d'URL compris. */
export function attribut(nom: string, valeur: string | number): SafeHtml {
	if (!/^[a-zA-Z_:][\w:.-]*$/.test(nom))
		throw new Error(`html : nom d'attribut invalide « ${apercu(nom)} ».`);
	const position: Position = ATTRIBUTS_URL.has(nom.toLowerCase()) ? 'url' : 'attribut-quote';
	return new SafeHtml(` ${nom}="${echapper(String(valeur), position)}"`);
}

/** Attribut BOOLÉEN (` disabled`, ` hidden`…), sans valeur. Le nom est validé :
 *  c'est la seule chose à vérifier, puisqu'il n'y a pas de valeur à échapper. */
export function drapeau(nom: string): SafeHtml {
	if (!/^[a-zA-Z_:][\w:.-]*$/.test(nom))
		throw new Error(`html : nom d'attribut invalide « ${apercu(nom)} ».`);
	return new SafeHtml(` ${nom}`);
}

/** Joint des fragments déjà sûrs — équivalent typé de `.join('')`, pour les
 *  `map(…)` qui produisent une liste d'éléments. */
export const joindre = (fragments: SafeHtml[], separateur = ''): SafeHtml =>
	new SafeHtml(fragments.map((f) => f.balisage).join(separateur));
