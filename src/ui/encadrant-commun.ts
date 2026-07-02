/* ============================================================
   Espace encadrant (#234, découpage #354) — module COMMUN aux sections.
   ------------------------------------------------------------
   Module FEUILLE : il n'importe AUCUN autre module `encadrant-*`. Il porte donc
   l'état de vue transverse à toutes les sections (conteneur DOM, profil consulté)
   et le registre des fonctions de re-rendu, ce qui casse le cycle qui existerait
   sinon entre l'orchestrateur (`encadrant.ts`, qui COMPOSE le rendu de l'espace) et
   les modules de section (pin / progression / réglages / profils, qui DÉCLENCHENT un
   re-rendu). L'orchestrateur enregistre ses fonctions via `initEncadrantCommun` ;
   les sections appellent `rerender()` / `renderEspace()` sans importer l'orchestrateur.
   Il héberge aussi `telechargerBlob`, utilitaire de téléchargement partagé par pin
   (clé de récupération) et profils (export) — placé ici, module déjà commun aux deux,
   pour éviter un import croisé pin ↔ profils. ============================================================ */

let conteneur: HTMLElement | null = null;
let consulte: string | null = null; // profil CONSULTÉ (≠ forcément l'actif)
let rerenderFn: () => void = () => {};
let renderEspaceFn: () => void = () => {};

/* Enregistre le conteneur et les fonctions de rendu de l'orchestrateur (appelé une
   fois par `enterEncadrant`). `rerender` re-rend la vue courante (porte, récupération
   ou espace) ; `renderEspace` re-rend directement l'espace (raccourci des sections qui
   savent y être). */
export function initEncadrantCommun(
	el: HTMLElement,
	rerender: () => void,
	renderEspace: () => void,
): void {
	conteneur = el;
	rerenderFn = rerender;
	renderEspaceFn = renderEspace;
}

export function container(): HTMLElement | null {
	return conteneur;
}
export function consulteUuid(): string | null {
	return consulte;
}
export function setConsulteUuid(uuid: string | null): void {
	consulte = uuid;
}
export function rerender(): void {
	rerenderFn();
}
export function renderEspace(): void {
	renderEspaceFn();
}

/* Déclenche le téléchargement d'un blob (export des profils, clé de récupération…).
   Utilitaire transverse partagé par les modules pin (clé .txt) et profils (export JSON). */
export function telechargerBlob(nom: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = nom;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
