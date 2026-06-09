/* ============================================================
   Données de conjugaison française (CE2) + ConjugationExerciseType.
   ------------------------------------------------------------
   Chaque verbe porte ses formes pour les temps couverts, dans
   l'ordre des personnes : je, tu, il, nous, vous, ils.
   Temps couverts : présent, futur, imparfait, passé composé.
   Pour le passé composé, la forme stockée inclut l'auxiliaire
   conjugué (ex. « ai aimé », « suis allé ») ; l'accord des verbes
   en « être » suit le masculin (singulier / pluriel).
   La génération tire une personne au hasard ; la vérification est
   stricte (trim + NFC) : accents et apostrophes exigés.
   NB : dossier `francais` sans cédille pour des chemins d'import
   ASCII portables ; le libellé affiché reste « Français ».
   ============================================================ */
import type { Exercise, ExerciseType, ExerciseMode } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { rnd, sample } from '../../core/utils';
import type { SchoolLevel } from '../../core/catalog';

export type Tense = 'present' | 'futur' | 'imparfait' | 'passe_compose';

export interface VerbDef {
  id: string;
  infinitif: string;
  forms: Record<Tense, [string, string, string, string, string, string]>;
}

/* Verbes couverts (CE2) : auxiliaires, 1er et 2e groupe (modèles
   aimer / finir) et verbes fréquents du 3e groupe. Les formes du
   passé composé incluent l'auxiliaire conjugué. */
export const VERBS: VerbDef[] = [
  {
    id: 'etre',
    infinitif: 'être',
    forms: {
      present: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
      futur: ['serai', 'seras', 'sera', 'serons', 'serez', 'seront'],
      imparfait: ['étais', 'étais', 'était', 'étions', 'étiez', 'étaient'],
      passe_compose: ['ai été', 'as été', 'a été', 'avons été', 'avez été', 'ont été'],
    },
  },
  {
    id: 'avoir',
    infinitif: 'avoir',
    forms: {
      present: ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
      futur: ['aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront'],
      imparfait: ['avais', 'avais', 'avait', 'avions', 'aviez', 'avaient'],
      passe_compose: ['ai eu', 'as eu', 'a eu', 'avons eu', 'avez eu', 'ont eu'],
    },
  },
  {
    id: 'aimer',
    infinitif: 'aimer',
    forms: {
      present: ['aime', 'aimes', 'aime', 'aimons', 'aimez', 'aiment'],
      futur: ['aimerai', 'aimeras', 'aimera', 'aimerons', 'aimerez', 'aimeront'],
      imparfait: ['aimais', 'aimais', 'aimait', 'aimions', 'aimiez', 'aimaient'],
      passe_compose: ['ai aimé', 'as aimé', 'a aimé', 'avons aimé', 'avez aimé', 'ont aimé'],
    },
  },
  {
    id: 'finir',
    infinitif: 'finir',
    forms: {
      present: ['finis', 'finis', 'finit', 'finissons', 'finissez', 'finissent'],
      futur: ['finirai', 'finiras', 'finira', 'finirons', 'finirez', 'finiront'],
      imparfait: ['finissais', 'finissais', 'finissait', 'finissions', 'finissiez', 'finissaient'],
      passe_compose: ['ai fini', 'as fini', 'a fini', 'avons fini', 'avez fini', 'ont fini'],
    },
  },
  {
    id: 'aller',
    infinitif: 'aller',
    forms: {
      present: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'],
      futur: ['irai', 'iras', 'ira', 'irons', 'irez', 'iront'],
      imparfait: ['allais', 'allais', 'allait', 'allions', 'alliez', 'allaient'],
      passe_compose: [
        'suis allé',
        'es allé',
        'est allé',
        'sommes allés',
        'êtes allés',
        'sont allés',
      ],
    },
  },
  {
    id: 'faire',
    infinitif: 'faire',
    forms: {
      present: ['fais', 'fais', 'fait', 'faisons', 'faites', 'font'],
      futur: ['ferai', 'feras', 'fera', 'ferons', 'ferez', 'feront'],
      imparfait: ['faisais', 'faisais', 'faisait', 'faisions', 'faisiez', 'faisaient'],
      passe_compose: ['ai fait', 'as fait', 'a fait', 'avons fait', 'avez fait', 'ont fait'],
    },
  },
  {
    id: 'venir',
    infinitif: 'venir',
    forms: {
      present: ['viens', 'viens', 'vient', 'venons', 'venez', 'viennent'],
      futur: ['viendrai', 'viendras', 'viendra', 'viendrons', 'viendrez', 'viendront'],
      imparfait: ['venais', 'venais', 'venait', 'venions', 'veniez', 'venaient'],
      passe_compose: [
        'suis venu',
        'es venu',
        'est venu',
        'sommes venus',
        'êtes venus',
        'sont venus',
      ],
    },
  },
  {
    id: 'voir',
    infinitif: 'voir',
    forms: {
      present: ['vois', 'vois', 'voit', 'voyons', 'voyez', 'voient'],
      futur: ['verrai', 'verras', 'verra', 'verrons', 'verrez', 'verront'],
      imparfait: ['voyais', 'voyais', 'voyait', 'voyions', 'voyiez', 'voyaient'],
      passe_compose: ['ai vu', 'as vu', 'a vu', 'avons vu', 'avez vu', 'ont vu'],
    },
  },
  {
    id: 'dire',
    infinitif: 'dire',
    forms: {
      present: ['dis', 'dis', 'dit', 'disons', 'dites', 'disent'],
      futur: ['dirai', 'diras', 'dira', 'dirons', 'direz', 'diront'],
      imparfait: ['disais', 'disais', 'disait', 'disions', 'disiez', 'disaient'],
      passe_compose: ['ai dit', 'as dit', 'a dit', 'avons dit', 'avez dit', 'ont dit'],
    },
  },
  {
    id: 'pouvoir',
    infinitif: 'pouvoir',
    forms: {
      present: ['peux', 'peux', 'peut', 'pouvons', 'pouvez', 'peuvent'],
      futur: ['pourrai', 'pourras', 'pourra', 'pourrons', 'pourrez', 'pourront'],
      imparfait: ['pouvais', 'pouvais', 'pouvait', 'pouvions', 'pouviez', 'pouvaient'],
      passe_compose: ['ai pu', 'as pu', 'a pu', 'avons pu', 'avez pu', 'ont pu'],
    },
  },
  {
    id: 'vouloir',
    infinitif: 'vouloir',
    forms: {
      present: ['veux', 'veux', 'veut', 'voulons', 'voulez', 'veulent'],
      futur: ['voudrai', 'voudras', 'voudra', 'voudrons', 'voudrez', 'voudront'],
      imparfait: ['voulais', 'voulais', 'voulait', 'voulions', 'vouliez', 'voulaient'],
      passe_compose: ['ai voulu', 'as voulu', 'a voulu', 'avons voulu', 'avez voulu', 'ont voulu'],
    },
  },
  {
    id: 'prendre',
    infinitif: 'prendre',
    forms: {
      present: ['prends', 'prends', 'prend', 'prenons', 'prenez', 'prennent'],
      futur: ['prendrai', 'prendras', 'prendra', 'prendrons', 'prendrez', 'prendront'],
      imparfait: ['prenais', 'prenais', 'prenait', 'prenions', 'preniez', 'prenaient'],
      passe_compose: ['ai pris', 'as pris', 'a pris', 'avons pris', 'avez pris', 'ont pris'],
    },
  },
  {
    id: 'naitre',
    infinitif: 'naître',
    forms: {
      present: ['nais', 'nais', 'naît', 'naissons', 'naissez', 'naissent'],
      futur: ['naîtrai', 'naîtras', 'naîtra', 'naîtrons', 'naîtrez', 'naîtront'],
      imparfait: ['naissais', 'naissais', 'naissait', 'naissions', 'naissiez', 'naissaient'],
      passe_compose: ['suis né', 'es né', 'est né', 'sommes nés', 'êtes nés', 'sont nés'],
    },
  },
];

const TENSE_LABEL: Record<Tense, string> = {
  present: 'présent',
  futur: 'futur',
  imparfait: 'imparfait',
  passe_compose: 'passé composé',
};

/* Connecteur grammatical pour les libellés de leçons : « au présent »
   mais « à l'imparfait ». */
const TENSE_PHRASE: Record<Tense, string> = {
  present: 'au présent',
  futur: 'au futur',
  imparfait: "à l'imparfait",
  passe_compose: 'au passé composé',
};

/* Liste ordonnée des temps couverts (sert à la génération des leçons). */
export const TENSES: Tense[] = ['present', 'futur', 'imparfait', 'passe_compose'];

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

/* Modes de réponse d'un exercice de conjugaison :
   - 'saisie' : l'enfant écrit la forme (production, mode par défaut) ;
   - 'qcm'    : l'enfant choisit parmi plusieurs formes (reconnaissance,
                utilisé en sprint où la frappe pénaliserait la vitesse). */
export type ConjMode = 'saisie' | 'qcm';
export const CONJ_MODES: readonly ConjMode[] = ['saisie', 'qcm'];

/* Nombre total de propositions d'un QCM (1 bonne réponse + distracteurs). */
const QCM_CHOICES = 4;

/* Distracteurs d'un QCM de conjugaison, dérivés du paradigme du verbe.
   Toutes les propositions sont de VRAIES formes correctement orthographiées
   (jamais une faute affichée), par ordre de pertinence pédagogique :
     1. autres personnes au même temps  → teste l'accord de la personne ;
     2. même personne aux autres temps   → teste la reconnaissance du temps ;
     3. repli : n'importe quelle autre forme du verbe.
   Déduplication par forme (NFC ; ex. « je/tu étais » sont identiques) ;
   la bonne réponse est exclue des distracteurs. */
function qcmDistractors(verb: VerbDef, tense: Tense, person: number, correct: string): string[] {
  const norm = (s: string) => s.normalize('NFC');
  const seen = new Set<string>([norm(correct)]);
  const picked: string[] = [];
  const addAll = (formes: string[]) => {
    for (const f of sample(formes, formes.length)) {
      const n = norm(f);
      if (!seen.has(n)) {
        seen.add(n);
        picked.push(f);
      }
    }
  };
  addAll(verb.forms[tense].filter((_, i) => i !== person)); // 1.
  addAll(TENSES.filter((t) => t !== tense).map((t) => verb.forms[t][person])); // 2.
  addAll(TENSES.flatMap((t) => verb.forms[t])); // 3.
  return picked.slice(0, QCM_CHOICES - 1);
}

/* Fabrique un ExerciseType pour un verbe à un temps donné. */
export function conjugationType(verbId: string, tense: Tense): ExerciseType {
  const verb = getVerb(verbId)!;
  return {
    modes: [...CONJ_MODES],
    generate(mode?: ExerciseMode): Exercise {
      const person = rnd(0, 5);
      const form = verb.forms[tense][person];
      const pron = displayPronoun(person, form);
      const question = `${verb.infinitif} · ${TENSE_LABEL[tense]} — ${pron}@`;
      if (mode === 'qcm') {
        const distractors = qcmDistractors(verb, tense, person, form);
        return {
          type: 'qcm',
          question,
          answer: form,
          choices: sample([form, ...distractors], QCM_CHOICES),
        };
      }
      return { type: 'text', question, answer: form };
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
  venir: 'Venir',
  voir: 'Voir',
  dire: 'Dire',
  pouvoir: 'Pouvoir',
  vouloir: 'Vouloir',
  prendre: 'Prendre',
  naitre: 'Naître',
};

export const CONJ_LESSONS: ConjLessonDesc[] = VERBS.flatMap((v) =>
  TENSES.map((tense) => ({
    id: `fr-conj-${v.id}-${tense}`,
    label: `${LESSON_LABEL[v.id]} ${TENSE_PHRASE[tense]}`,
    verbId: v.id,
    tense,
    level: 'ce2' as SchoolLevel,
  })),
);
