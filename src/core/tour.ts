/* ============================================================
   Guide de première visite (#330) — module PUR (aucun accès DOM).
   Porte le CONTENU du tour enfant (étapes : bloc ciblé + titre + texte court)
   et la MÉMOIRE « déjà vu » par profil (via lsGet/lsSet, jamais localStorage
   direct) — pour le mot aux parents ET le tour enfant, indépendamment.

   Le RENDU (encart mascotte, surlignage du bloc, mot aux parents) vit dans
   ui/tour.ts. Rédaction dans l'esprit des aides (core/aide.ts) : tutoiement,
   une idée par phrase, ton « invitation ». Enchaînement au 1er lancement :
   choix de classe → mot aux parents → tour enfant (3 grands repères).
   ============================================================ */
import { lsGet, lsSet } from './storage';

export interface TourEtape {
	/** Sélecteur CSS du bloc d'accueil à surligner (id / classe stable). */
	cible: string;
	/** Titre court de l'étape (ton « invitation », jamais « problème »). */
	titre: string;
	/** Explication : une idée, une phrase, tutoiement. */
	texte: string;
}

/** Les 3 grands repères de l'accueil — par où jouer / mes progrès / mes
    récompenses. Volontairement court : le reste (objectifs, podium, favoris…)
    se découvre en jouant, plutôt que d'être expliqué d'avance. */
export const TOUR_ETAPES: TourEtape[] = [
	{
		cible: '.cards',
		titre: 'Par où commencer ?',
		texte: "Choisis un jeu ici pour t'entraîner. Touche une carte, et c'est parti !",
	},
	{
		cible: '#progression',
		titre: 'Tes progrès',
		texte: 'Là, tu vois ton niveau, tes points et ton défi du jour.',
	},
	{
		cible: '#rewardNav',
		titre: 'Tes récompenses',
		texte: 'Tes médailles et tes trophées sont ici. Joue pour les gagner !',
	},
];

/** Texte lu à voix haute pour une étape (titre puis explication, ponctués pour
    une pause naturelle). Chaîne vide si l'index est hors bornes. */
export function texteTtsEtape(i: number): string {
	const e = TOUR_ETAPES[i];
	return e ? `${e.titre} ${e.texte}` : '';
}

/* ---------- Mémoire « déjà vu », par profil ----------
   Deux drapeaux booléens indépendants, sous clés préfixées profil (storage.ts) :
   l'enchaînement automatique du 1er lancement ne se déclenche qu'UNE fois par
   enfant. Le bouton « ? » de l'accueil rejoue le tour à volonté, SANS toucher
   ces clés (rejeu ≠ première visite). */
export const TOUR_VU_KEY = 'ludaskia_tour_seen';
export const MOT_PARENTS_VU_KEY = 'ludaskia_parents_seen';

/** Le tour enfant a-t-il déjà été vu OU sauté par ce profil ? */
export function tourVu(): boolean {
	return lsGet(TOUR_VU_KEY, false) === true;
}
/** Marque le tour comme « déjà vu » pour ce profil (idempotent). */
export function marquerTourVu(): void {
	lsSet(TOUR_VU_KEY, true);
}
/** Le mot aux parents a-t-il déjà été affiché à ce profil ? */
export function motParentsVu(): boolean {
	return lsGet(MOT_PARENTS_VU_KEY, false) === true;
}
/** Marque le mot aux parents comme « déjà vu » pour ce profil (idempotent). */
export function marquerMotParentsVu(): void {
	lsSet(MOT_PARENTS_VU_KEY, true);
}
