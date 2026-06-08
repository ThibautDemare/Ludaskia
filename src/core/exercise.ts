/* ============================================================
   Abstraction d'exercice : type générique + interface de génération/vérification.
   Utilisé par tous les types d'exercices (math, conjugaison, QCM, orthographe…).
   ============================================================ */

export type Exercise =
  | { type: 'text'; question: string; answer: string; answers?: string[] }
  | { type: 'qcm'; question: string; answer: string; choices: string[] }
  // Orthographe — interactions réutilisables (vérifiées comme du texte) :
  | { type: 'motCache'; answer: string } // affiche/masque le mot puis saisie
  | { type: 'tuiles'; answer: string; lettres: string[] } // lettres mélangées à ordonner
  | { type: 'dictee'; answer: string; commeDans?: string }; // rien d'affiché, lu en TTS

/** Mode d'entraînement, pour les types d'exercices qui en proposent plusieurs. */
export type ExerciseMode = string;

export interface ExerciseType {
  /** Modes proposés (optionnel ; un type mono-mode l'ignore). */
  modes?: ExerciseMode[];
  generate(mode?: ExerciseMode): Exercise;
  check(exercise: Exercise, input: string): boolean;
}

/* Vérification générique pour les exercices texte (hors math).
   Normalisation : trim + NFC uniquement. Accents et apostrophes exigés.
   Couvre tous les types : comparaison à `answer` (+ variantes `answers` pour 'text'). */
export function checkAnswer(exercise: Exercise, input: string): boolean {
  const norm = (s: string) => s.trim().normalize('NFC');
  const normalized = norm(input);
  if (normalized === norm(exercise.answer)) return true;
  if (exercise.type === 'text') {
    return (exercise.answers ?? []).some((a) => norm(a) === normalized);
  }
  return false;
}
