/* ============================================================
   Données statiques des leçons d'orthographe prédéfinies (CE2).
   Mots invariables et mots irréguliers, découpés en leçons courtes
   et numérotées (pour éviter les listes-fleuves). Proposés en
   complément des listes saisies par le parent.
   ------------------------------------------------------------
   NB : jeu de départ volontairement court ; une liste complète
   sera fournie ultérieurement. Apostrophe droite (') = celle tapée
   au clavier (la vérification est stricte, trim + NFC).
   ============================================================ */
import type { SchoolLevel } from '../../core/catalog';
import type { MotInput } from '../../core/orthographe/types';

export interface LeconOrthoPredef {
  id: string; // ex. 'fr-ortho-invariables-1'
  label: string;
  niveau: SchoolLevel;
  mots: MotInput[];
}

export const ORTHO_PREDEF: LeconOrthoPredef[] = [
  {
    id: 'fr-ortho-invariables-1',
    label: 'Mots invariables (1)',
    niveau: 'ce2',
    mots: [
      { mot: "aujourd'hui" },
      { mot: 'beaucoup' },
      { mot: 'toujours' },
      { mot: 'longtemps' },
      { mot: 'pendant' },
      { mot: 'maintenant' },
      { mot: 'parfois' },
      { mot: 'bientôt' },
    ],
  },
  {
    id: 'fr-ortho-invariables-2',
    label: 'Mots invariables (2)',
    niveau: 'ce2',
    mots: [
      { mot: 'quelquefois' },
      { mot: 'tellement' },
      { mot: 'autrefois' },
      { mot: 'presque' },
      { mot: 'ensemble' },
      { mot: 'autour' },
      { mot: 'plusieurs' },
      { mot: 'malgré' },
    ],
  },
  {
    id: 'fr-ortho-irreguliers-1',
    label: 'Mots irréguliers (1)',
    niveau: 'ce2',
    mots: [
      { mot: 'femme' },
      { mot: 'monsieur' },
      { mot: 'fille' },
      { mot: 'temps' },
      { mot: 'automne' },
      { mot: 'sept' },
      { mot: 'doigt' },
      { mot: 'clé' },
    ],
  },
];
