/* ============================================================
   Abstraction d'exercice : type générique + interface de génération/vérification.
   Utilisé par tous les types d'exercices (math, conjugaison, QCM…).
   ============================================================ */

export type Exercise =
  | { type: 'text'; question: string; answer: string; answers?: string[] }
  | { type: 'qcm'; question: string; answer: string; choices: string[] };

export interface ExerciseType {
  generate(): Exercise;
  check(exercise: Exercise, input: string): boolean;
}

/* Vérification générique pour les exercices texte (hors math).
   Normalisation : trim + NFC uniquement. Accents et apostrophes exigés. */
export function checkAnswer(exercise: Exercise, input: string): boolean {
  const norm = (s: string) => s.trim().normalize('NFC');
  if (exercise.type === 'qcm') {
    return norm(input) === norm(exercise.answer);
  }
  const normalized = norm(input);
  if (normalized === norm(exercise.answer)) return true;
  return (exercise.answers ?? []).some((a) => norm(a) === normalized);
}
