/* ============================================================
   Mode Orthographe — cœur logique du runner (sans DOM).
   Statut d'un mot, choix de l'activité suivante, validation des
   modes, étoile d'une liste. Logique pure et testable.
   (La répétition espacée relève d'un mode dédié — issue séparée ;
   le rendu/écrans et la dictée TTS relèvent de la couche UI.)
   Voir docs/design-orthographe.md (§ Runner).
   ============================================================ */
import { choice } from '../utils';
import type { MotOrtho, ModeOrtho } from './types';

/** Ordre de déblocage des modes : tuiles → affiche/masque → dictée. */
export const ORDRE_MODES: readonly ModeOrtho[] = ['tuiles', 'motCache', 'dictee'];

export type Activite = 'atelier' | ModeOrtho;
export type StatutMot = 'nouveau' | 'enCours' | 'maitrise';

/** Modes requis pour l'étoile : tuiles + motCache, et dictée seulement si le TTS est dispo. */
export function modesRequis(dicteeDispo: boolean): ModeOrtho[] {
	return ORDRE_MODES.filter((m) => m !== 'dictee' || dicteeDispo);
}

export function statutMot(mot: MotOrtho, dicteeDispo: boolean): StatutMot {
	if (!mot.atelierFait) return 'nouveau';
	return modesRequis(dicteeDispo).every((m) => mot.validation[m]) ? 'maitrise' : 'enCours';
}

/* Phase de découverte : au moins un mot de la liste n'a pas encore eu son
   atelier. Tant qu'elle dure, le parcours ne propose QUE des ateliers, afin de
   découvrir TOUTE la liste avant de commencer à s'entraîner — l'enfant doit
   pouvoir voir tous ses mots vite (première dictée dès le lendemain). Voir #69. */
export function decouverteEnCours(mots: MotOrtho[]): boolean {
	return mots.some((m) => !m.atelierFait);
}

/** Prochain mode à valider, dans l'ordre (null si tous les modes requis le sont). */
export function prochainModeAValider(mot: MotOrtho, dicteeDispo: boolean): ModeOrtho | null {
	return modesRequis(dicteeDispo).find((m) => !mot.validation[m]) ?? null;
}

/** Prochaine activité d'un mot : atelier (découverte) → modes dans l'ordre →
    une fois tout validé, un mode aléatoire (entretien), jamais l'atelier. */
export function prochaineActivite(mot: MotOrtho, dicteeDispo: boolean): Activite {
	if (!mot.atelierFait) return 'atelier';
	return prochainModeAValider(mot, dicteeDispo) ?? choice(modesRequis(dicteeDispo));
}

export function marquerAtelierFait(mot: MotOrtho): void {
	mot.atelierFait = true;
}

/** Valide un mode après une réussite (v1 : une réussite suffit).
 *
 *  À SAVOIR si vous ajoutez un chemin qui appelle ceci : c'est ici qu'un mot progresse, donc
 *  qu'une LISTE peut franchir un cap. La fin de séance doit alors appeler `journaliserPaliersOrtho`
 *  (`orthographe/paliers.ts`), sinon la frise d'évolution de l'espace encadrant rate le
 *  franchissement — sans que rien ne le signale, et pour des semaines. Deux chemins le font
 *  aujourd'hui : la dictée (`ui/ortho-runner.ts`) et la révision espacée (`ui/revision.ts`).
 *  Ce rappel est ici, et pas seulement dans `paliers.ts`, parce qu'un futur auteur regarde
 *  l'endroit où l'état change, pas le module qui l'observe. Le pendant côté leçons, lui, est
 *  STRUCTUREL (`recordLessonStats` journalise de lui-même, cf. PR #540) ; ça ne l'est pas ici,
 *  faute de pouvoir décider sans `dicteeDispo`, que seule l'UI connaît. */
export function validerMode(mot: MotOrtho, mode: ModeOrtho): void {
	mot.validation[mode] = true;
}

/** Une liste est étoilée quand tous ses mots sont « maîtrisés ». */
export function listeEtoilee(mots: MotOrtho[], dicteeDispo: boolean): boolean {
	return mots.length > 0 && mots.every((m) => statutMot(m, dicteeDispo) === 'maitrise');
}
