/* ============================================================
   Écho groupé des grands nombres à la frappe (#327).

   Les champs `.ans-grand` (réponses numériques ≥ 5 chiffres des leçons « millions »
   CM1, #240) reformatent leur contenu EN TEMPS RÉEL : à chaque frappe, les chiffres
   sont regroupés par classes de 3 séparées par une espace fine insécable U+202F
   (« 1 400 000 ») — la graphie française des grands nombres. Lisibilité accrue, et
   l'enfant relit sa réponse comme l'énoncé l'affiche.

   La correction n'est PAS affectée : `nettoyerSaisieNombre` (core/items.ts →
   checkItemAnswer) neutralise déjà tout séparateur avant comparaison. La valeur
   affichée groupée est donc acceptée telle quelle.

   Installation unique (un écouteur `input` délégué sur le document), sur le modèle de
   `installVisiblePasswordReveal` : les vues sont rendues par innerHTML un peu partout,
   un écouteur délégué couvre tous les champs présents et futurs en un seul point.

   Point délicat = la POSITION DU CURSEUR. Reformater décale les positions (séparateurs
   insérés/retirés) ; on la restitue en raisonnant en NOMBRE DE CHIFFRES à gauche du
   curseur (invariant stable à travers le reformatage), pas en index brut.
   ============================================================ */
import { grouperChiffresSaisis, ESPACE_FINE } from '../core/nombres';

/** Nombre de chiffres (0-9) dans `s`. Sert à exprimer la position du curseur de façon
 *  insensible aux séparateurs : « le curseur est après N chiffres ». */
function compterChiffres(s: string): number {
	let n = 0;
	for (const c of s) if (c >= '0' && c <= '9') n++;
	return n;
}

/** Pose la valeur et le curseur (exprimé en chiffres à gauche), valeur regroupée. */
function poser(el: HTMLInputElement, chiffres: string, chiffresAGauche: number): void {
	const groupe = grouperChiffresSaisis(chiffres);
	el.value = groupe;
	const pos = indexApresChiffres(groupe, chiffresAGauche);
	el.setSelectionRange(pos, pos);
}

/** Index dans `texte` situé juste APRÈS le `nbChiffres`-ième chiffre (0 → début).
 *  Permet de replacer le curseur après reformatage en conservant « N chiffres à gauche ». */
function indexApresChiffres(texte: string, nbChiffres: number): number {
	if (nbChiffres <= 0) return 0;
	let vus = 0;
	for (let i = 0; i < texte.length; i++) {
		if (texte[i] >= '0' && texte[i] <= '9') {
			vus++;
			if (vus === nbChiffres) return i + 1;
		}
	}
	return texte.length;
}

/** Reformate la valeur d'un champ `.ans-grand` en place, curseur préservé. */
function reformater(el: HTMLInputElement): void {
	const valeur = el.value;
	// Garde-fou : on ne groupe QUE des entiers. Si l'enfant a tapé un séparateur décimal
	// (virgule/point — cas hors leçons « millions », par prudence), on ne touche à rien.
	if (valeur.includes(',') || valeur.includes('.')) return;
	const chiffres = valeur.replace(/\D/g, '');
	if (grouperChiffresSaisis(chiffres) === valeur) return; // déjà au format : ne pas bouger le curseur
	// Position courante exprimée en chiffres à gauche, stable au reformatage.
	poser(el, chiffres, compterChiffres(valeur.slice(0, el.selectionStart ?? valeur.length)));
}

/** Cible-t-on un champ `.ans-grand` ? */
function estChampGrand(el: EventTarget | null): el is HTMLInputElement {
	return el instanceof HTMLInputElement && el.classList.contains('ans-grand');
}

/** Supprime un caractère qui « tombe » sur un séparateur (Retour arrière / Suppr), en
 *  effaçant le CHIFFRE voisin plutôt que l'espace — sinon la touche paraît morte (le
 *  séparateur se réinsère aussitôt). Renvoie true si le cas a été pris en charge. */
function gererSuppressionSeparateur(el: HTMLInputElement, arriere: boolean): boolean {
	const valeur = el.value;
	if (valeur.includes(',') || valeur.includes('.')) return false; // hors entiers : laisser faire
	const sel = el.selectionStart ?? 0;
	if (sel !== (el.selectionEnd ?? sel)) return false; // sélection non vide : suppression normale
	// Le caractère que la touche s'apprête à effacer (à gauche pour Retour arrière, à droite
	// pour Suppr) est-il un séparateur ? Sinon, comportement normal.
	const cible = arriere ? valeur[sel - 1] : valeur[sel];
	if (cible !== ESPACE_FINE) return false;
	const chiffres = valeur.replace(/\D/g, '');
	const chiffresAGauche = compterChiffres(valeur.slice(0, sel));
	// Retour arrière : efface le chiffre juste avant le séparateur (index chiffresAGauche-1) ;
	// Suppr : efface le chiffre juste après (index chiffresAGauche).
	const idx = arriere ? chiffresAGauche - 1 : chiffresAGauche;
	if (idx < 0 || idx >= chiffres.length) return false;
	const restant = chiffres.slice(0, idx) + chiffres.slice(idx + 1);
	poser(el, restant, arriere ? chiffresAGauche - 1 : chiffresAGauche);
	return true;
}

/** Installe l'écho groupé des grands nombres (à appeler une fois, après `document.body`).
 *  Deux écouteurs délégués, ne réagissant qu'aux champs `.ans-grand` :
 *  - `beforeinput` intercepte Retour arrière / Suppr quand ils visent un séparateur, pour
 *    effacer le chiffre voisin (évite l'effet « touche morte ») ;
 *  - `input` regroupe la valeur après toute autre frappe (saisie, collage…).
 *  Affecter `el.value` par programme NE redéclenche PAS `input` → pas de boucle. */
export function installGroupedNumberEcho(): void {
	document.addEventListener('beforeinput', (e) => {
		const el = e.target;
		if (!estChampGrand(el)) return;
		const type = (e as InputEvent).inputType;
		if (type !== 'deleteContentBackward' && type !== 'deleteContentForward') return;
		if (gererSuppressionSeparateur(el, type === 'deleteContentBackward')) e.preventDefault();
	});
	document.addEventListener('input', (e) => {
		if (estChampGrand(e.target)) reformater(e.target);
	});
}
