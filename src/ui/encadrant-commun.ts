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
import type { NiveauNotion } from '../core/encadrant-stats';

/* Onglets de l'espace (#459) : découpe la page en sections par INTENTION
   (observer / préparer / configurer / gérer). L'état vit ici — transverse à toutes
   les sections, comme le profil consulté — et non dans un module de section. */
export type EncTab = 'suivi' | 'programme' | 'reglages' | 'profils';

/* Mot affiché pour un niveau d'acquisition (échelle type LSU ; wording validé par
   pedagogue-primaire / redacteur-contenu-francais — la notion est qualifiée, pas l'enfant).
   Ici plutôt que dans une section : le suivi des notions (progression) et la banque de mots
   (#496) parlent la MÊME échelle, et un mot recopié dans deux modules divergerait. */
export const MOT_NIVEAU: Record<NiveauNotion, string> = {
	acquis: 'acquis',
	'en-cours': 'en cours',
	'non-acquis': 'à renforcer', // ≠ « à consolider » : éviter qu'il sonne plus avancé que « en cours » (avis pédago)
	'a-decouvrir': 'à découvrir',
};
/* Ordre de PROGRESSION (croissant) pour les légendes et les segments (avis pédago :
   l'échelle doit se lire comme une gradation, pas un ordre arbitraire). L'orthographe n'en
   utilise que 3 : la validation d'un mode est binaire, il n'y a pas de « à renforcer ». */
export const ORDRE_NIVEAUX: NiveauNotion[] = ['a-decouvrir', 'non-acquis', 'en-cours', 'acquis'];
export const ORDRE_NIVEAUX_ORTHO: NiveauNotion[] = ['a-decouvrir', 'en-cours', 'acquis'];

let conteneur: HTMLElement | null = null;
let consulte: string | null = null; // profil CONSULTÉ (≠ forcément l'actif)
let tab: EncTab = 'suivi'; // onglet affiché (#459)
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
/* Sections à prévenir quand on change de profil consulté. Une section qui garde un état de
   VUE (recherche, filtre, dépliage, minuteur en vol) doit le remettre à plat : cet état
   décrit le profil qu'on regardait, pas celui qu'on regarde. Un registre plutôt qu'un appel
   posé sur chaque site de `setConsulteUuid` — il y en a six, et le prochain ajouté oublierait
   silencieusement la remise à zéro (le symptôme, lui, est invisible : un filtre hérité fait
   simplement passer une liste tronquée pour la banque entière du nouvel enfant). */
const auChangementDeProfil: (() => void)[] = [];
export function onChangementProfilConsulte(fn: () => void): void {
	if (!auChangementDeProfil.includes(fn)) auChangementDeProfil.push(fn);
}

export function setConsulteUuid(uuid: string | null): void {
	const change = consulte !== uuid;
	consulte = uuid;
	if (change) for (const fn of auChangementDeProfil) fn();
}
export function activeTab(): EncTab {
	return tab;
}
export function setActiveTab(t: EncTab): void {
	tab = t;
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
