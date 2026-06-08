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

/** Valide un mode après une réussite (v1 : une réussite suffit). */
export function validerMode(mot: MotOrtho, mode: ModeOrtho): void {
  mot.validation[mode] = true;
}

/** Une liste est étoilée quand tous ses mots sont « maîtrisés ». */
export function listeEtoilee(mots: MotOrtho[], dicteeDispo: boolean): boolean {
  return mots.length > 0 && mots.every((m) => statutMot(m, dicteeDispo) === 'maitrise');
}
