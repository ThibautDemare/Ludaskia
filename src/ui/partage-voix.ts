/* ============================================================
   Séance partagée (#734) — la VOIX d'une dictée reçue par lien (critère 12).

   Une dictée sans voix française ne se joue pas : la voix EST l'exercice. Les écrans
   d'entrée (accueil, « déjà fait ») le disent au lieu d'offrir de commencer, et se
   refont quand la disponibilité change : les voix arrivent souvent APRÈS le premier
   rendu (`voiceschanged`), et la connexion peut revenir. Un seul abonnement à la fois,
   retiré au départ de l'écran (`oublierVoix`).

   Le re-rendu se DIT (région `#partageVoixStatut`, vide au rendu et remplie après, une
   région née remplie n'étant pas annoncée de façon fiable), et ne reprend pas un focus
   posé hors de l'écran (relecture a11y).

   Extrait de `partage-seance.ts`, qui gardait le reste de la séance.
   ============================================================ */
import { html, VIDE, type SafeHtml } from '../core/html';
import { icon } from './icon';
import { annoncer } from './lien-partage';
import { dicteeDisponible, messageSansVoix, raisonSansVoix, surChangementVoix } from './tts';

let desabonner: (() => void) | null = null;
/* Le focus était-il hors de l'écran quand la voix a changé ? Lu une fois par re-rendu. */
let focusAilleurs = false;

/** Retire l'écoute des voix (départ de l'écran, début de la séance). */
export function oublierVoix(): void {
	desabonner?.();
	desabonner = null;
}

/** Une dictée sans voix utilisable sur cet appareil. */
export const sansVoix = (dictee: boolean): boolean => dictee && !dicteeDisponible();

/** Refait l'écran `el` d'une dictée quand la voix arrive ou part. Sans effet hors dictée. */
export function surveillerVoix(
	el: HTMLElement,
	dictee: boolean,
	refaire: (dispo: boolean) => void,
): void {
	oublierVoix();
	if (!dictee) return;
	let dispo = dicteeDisponible();
	desabonner = surChangementVoix(() => {
		const maintenant = dicteeDisponible();
		if (maintenant === dispo) return;
		dispo = maintenant;
		focusAilleurs = !focusDansEcran(el);
		refaire(maintenant);
	});
}

function focusDansEcran(el: HTMLElement): boolean {
	const actif = document.activeElement;
	return !actif || actif === document.body || el.contains(actif);
}

/** La région qui dira le changement : seulement sur un écran de dictée. */
export function statutVoixHTML(dictee: boolean): SafeHtml {
	return dictee
		? html`<p id="partageVoixStatut" class="sr-only" role="status" aria-live="polite"></p>`
		: VIDE;
}

/** Après le rendu d'un écran d'entrée : faut-il remettre le focus sur son titre ? Oui,
 *  sauf s'il a été refait par un changement de voix pendant que le focus était ailleurs. */
export function focusRepris(annonce?: string): boolean {
	const oui = !annonce || !focusAilleurs;
	focusAilleurs = false;
	return oui;
}

/** Dit le changement de voix qui a refait l'écran. */
export function annoncerVoix(el: HTMLElement, annonce?: string): void {
	const region = el.querySelector<HTMLElement>('#partageVoixStatut');
	if (annonce && region) annoncer(region, annonce);
}

/** La cause, dite comme ailleurs dans l'appli (`messageSansVoix`). Une voix listée qui ne
 *  parle pas (énoncé en échec) n'a pas de cause connue : le message générique dirait le
 *  contraire (« disponible »). */
export function causeSansVoix(): string {
	return raisonSansVoix() ? messageSansVoix() : 'La voix de cet appareil ne répond pas.';
}

/** L'encart d'un écran d'entrée sans voix. */
export function sansVoixHTML(suite: string): SafeHtml {
	return html`<p id="partageSansVoix" class="partage-encart partage-encart-alerte">${icon('speaker')}<span>Cette dictée a besoin du son. ${causeSansVoix()} ${suite}</span></p>`;
}
