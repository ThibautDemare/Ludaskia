/* ============================================================
   Données de conjugaison française (CE2) + ConjugationExerciseType.
   ------------------------------------------------------------
   Chaque verbe porte ses formes pour les temps couverts, dans
   l'ordre des personnes : je, tu, il, nous, vous, ils.
   La génération tire une personne au hasard ; la vérification est
   stricte (trim + NFC) : accents et apostrophes exigés.
   NB : dossier `francais` sans cédille pour des chemins d'import
   ASCII portables ; le libellé affiché reste « Français ».
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { rnd } from '../../core/utils';
import type { SchoolLevel } from '../../core/catalog';

export type Tense = 'present' | 'futur';

export interface VerbDef {
  id: string;
  infinitif: string;
  forms: Record<Tense, [string, string, string, string, string, string]>;
}

/* Verbes couverts (périmètre minimal CE2) : auxiliaires, 1er et 2e
   groupe (modèles aimer / finir), et deux verbes du 3e groupe
   fréquents (aller, faire). */
export const VERBS: VerbDef[] = [
  {
    id: 'etre',
    infinitif: 'être',
    forms: {
      present: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
      futur: ['serai', 'seras', 'sera', 'serons', 'serez', 'seront'],
    },
  },
  {
    id: 'avoir',
    infinitif: 'avoir',
    forms: {
      present: ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
      futur: ['aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront'],
    },
  },
  {
    id: 'aimer',
    infinitif: 'aimer',
    forms: {
      present: ['aime', 'aimes', 'aime', 'aimons', 'aimez', 'aiment'],
      futur: ['aimerai', 'aimeras', 'aimera', 'aimerons', 'aimerez', 'aimeront'],
    },
  },
  {
    id: 'finir',
    infinitif: 'finir',
    forms: {
      present: ['finis', 'finis', 'finit', 'finissons', 'finissez', 'finissent'],
      futur: ['finirai', 'finiras', 'finira', 'finirons', 'finirez', 'finiront'],
    },
  },
  {
    id: 'aller',
    infinitif: 'aller',
    forms: {
      present: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'],
      futur: ['irai', 'iras', 'ira', 'irons', 'irez', 'iront'],
    },
  },
  {
    id: 'faire',
    infinitif: 'faire',
    forms: {
      present: ['fais', 'fais', 'fait', 'faisons', 'faites', 'font'],
      futur: ['ferai', 'feras', 'fera', 'ferons', 'ferez', 'feront'],
    },
  },
];

const TENSE_LABEL: Record<Tense, string> = { present: 'présent', futur: 'futur' };
const PRONOUNS = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];

/* Pronom affiché : élision « je » → « j' » devant une voyelle ou un h muet
   (le contenu tapé reste la seule forme verbale, ex. « ai » → « j'ai »). */
export function displayPronoun(person: number, form: string): string {
  if (person === 0 && /^[aeiouàâäéèêëîïôöùûüh]/i.test(form)) return "j'";
  return PRONOUNS[person] + ' ';
}

export function getVerb(verbId: string): VerbDef | undefined {
  return VERBS.find((v) => v.id === verbId);
}

/* Fabrique un ExerciseType pour un verbe à un temps donné. */
export function conjugationType(verbId: string, tense: Tense): ExerciseType {
  const verb = getVerb(verbId)!;
  return {
    generate(): Exercise {
      const person = rnd(0, 5);
      const form = verb.forms[tense][person];
      const pron = displayPronoun(person, form);
      return {
        type: 'text',
        question: `${verb.infinitif} · ${TENSE_LABEL[tense]} — ${pron}@`,
        answer: form,
      };
    },
    check: (exercise, input) => checkAnswer(exercise, input),
  };
}

/* Descripteurs de leçons : une leçon par (verbe × temps). */
export interface ConjLessonDesc {
  id: string;
  label: string;
  verbId: string;
  tense: Tense;
  level: SchoolLevel;
}

const LESSON_LABEL: Record<string, string> = {
  etre: "L'auxiliaire être",
  avoir: "L'auxiliaire avoir",
  aimer: 'Verbes du 1er groupe (aimer)',
  finir: 'Verbes du 2e groupe (finir)',
  aller: 'Aller',
  faire: 'Faire',
};

export const CONJ_LESSONS: ConjLessonDesc[] = VERBS.flatMap((v) =>
  (['present', 'futur'] as Tense[]).map((tense) => ({
    id: `fr-conj-${v.id}-${tense}`,
    label: `${LESSON_LABEL[v.id]} au ${TENSE_LABEL[tense]}`,
    verbId: v.id,
    tense,
    level: 'ce2' as SchoolLevel,
  })),
);
