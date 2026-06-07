/* ============================================================
   Catalogue des matières, catégories et leçons.
   Hiérarchie : Subject → Category → LessonDef
   Chaque LessonDef porte un ExerciseType qui encapsule la
   génération et la vérification d'un exercice.
   ============================================================ */
import type { ExerciseType, Exercise } from './exercise';
import type { Item } from './items';
import { bilanQ } from './lessons';
import { CONJ_LESSONS, conjugationType } from '../data/francais/conjugaison';

/* ---------- Types ---------- */

export type SchoolLevel = 'cp' | 'ce1' | 'ce2' | 'cm1' | 'cm2' | '6e';
export type SubjectId = string;
export type CategoryId = string;

export interface Subject {
  id: SubjectId;
  label: string;
}

export interface Category {
  id: CategoryId;
  label: string;
  subject: SubjectId;
}

export interface LessonDef {
  id: string;
  label: string;
  subject: SubjectId;
  category: CategoryId;
  level: SchoolLevel;
  exerciseType: ExerciseType;
}

export interface BilanConfig {
  id: string;
  label: string;
  lessonIds: string[];
  questionsPerLesson: number | 'all';
}

/* ---------- Helpers math ---------- */

/* Vérifie une réponse numérique (accepte la virgule comme séparateur décimal). */
function checkMath(_exercise: Exercise, input: string): boolean {
  const norm = (s: string) => s.trim().replace(',', '.');
  return Number(norm(input)) === Number(norm(_exercise.answer));
}

/* Fabrique un ExerciseType pour une leçon math (wrapping de bilanQ). */
function mathType(num: number): ExerciseType {
  return {
    generate(): Exercise {
      const item = bilanQ(num)!;
      return { type: 'text', question: item.text, answer: String(item.answer) };
    },
    check: checkMath,
  };
}

/* Mapping string ID → numéro interne bilanQ (utilisé par le sprint). */
export const MATH_LESSON_NUM: Record<string, number> = {
  'math-tables-addition': 1,
  'math-complements': 2,
  'math-doubles': 3,
  'math-moities': 4,
  'math-ajouter-9-19-29': 5,
  'math-soustraire-9-19-29': 6,
  'math-tables-multiplication': 7,
  'math-moitie-pair': 8,
  'math-multiples-25': 9,
  'math-decompo-60': 10,
  'math-dizaines-centaines': 11,
  'math-multiplier-10-100': 12,
  'math-multiplier-4-8': 13,
  'math-multiplier-20-30-40': 14,
  'math-decomposer-multiplication': 15,
};

/* ---------- Sujets et catégories ---------- */

export const SUBJECTS: Subject[] = [
  { id: 'math', label: 'Mathématiques' },
  { id: 'francais', label: 'Français' },
];

export const CATEGORIES: Category[] = [
  { id: 'math-calcul', label: 'Calcul mental', subject: 'math' },
  { id: 'fr-conjugaison', label: 'Conjugaison', subject: 'francais' },
];

/* ---------- Catalogue des leçons math ---------- */

const MATH_LESSONS: LessonDef[] = [
  {
    id: 'math-tables-addition',
    label: "Tables d'addition",
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(1),
  },
  {
    id: 'math-complements',
    label: 'Complément à 10/100',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(2),
  },
  {
    id: 'math-doubles',
    label: 'Doubles',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(3),
  },
  {
    id: 'math-moities',
    label: 'Moitiés',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(4),
  },
  {
    id: 'math-ajouter-9-19-29',
    label: 'Ajouter 9, 19...',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(5),
  },
  {
    id: 'math-soustraire-9-19-29',
    label: 'Soustraire 9, 19...',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(6),
  },
  {
    id: 'math-tables-multiplication',
    label: 'Table de ×',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(7),
  },
  {
    id: 'math-moitie-pair',
    label: 'Moitié (pair)',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(8),
  },
  {
    id: 'math-multiples-25',
    label: 'Multiples de 25',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(9),
  },
  {
    id: 'math-decompo-60',
    label: 'Décompo. de 60',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(10),
  },
  {
    id: 'math-dizaines-centaines',
    label: 'Dizaines/centaines',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(11),
  },
  {
    id: 'math-multiplier-10-100',
    label: '× 10, × 100',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(12),
  },
  {
    id: 'math-multiplier-4-8',
    label: '× 4, × 8',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(13),
  },
  {
    id: 'math-multiplier-20-30-40',
    label: '× 20, 30, 40',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(14),
  },
  {
    id: 'math-decomposer-multiplication',
    label: 'Décomposer',
    subject: 'math',
    category: 'math-calcul',
    level: 'ce2',
    exerciseType: mathType(15),
  },
];

/* ---------- Catalogue des leçons français (conjugaison) ---------- */

const FRENCH_LESSONS: LessonDef[] = CONJ_LESSONS.map((d) => ({
  id: d.id,
  label: d.label,
  subject: 'francais',
  category: 'fr-conjugaison',
  level: d.level,
  exerciseType: conjugationType(d.verbId, d.tense),
}));

/* ---------- Registre global ---------- */

const ALL_LESSONS: LessonDef[] = [...MATH_LESSONS, ...FRENCH_LESSONS];

export function getAllLessons(): LessonDef[] {
  return ALL_LESSONS;
}

/* Génère un Item prêt à rendre pour n'importe quelle leçon du catalogue.
   - math : on réutilise le générateur numérique existant (bilanQ)
   - autres matières : on convertit l'Exercise produit par l'ExerciseType
     en Item « texte » (corrigé par comparaison de chaîne). */
export function genLessonItem(lesson: LessonDef): Item {
  if (lesson.subject === 'math') {
    const item = bilanQ(MATH_LESSON_NUM[lesson.id])!;
    item._lesson = lesson.id;
    return item;
  }
  const ex = lesson.exerciseType.generate();
  return {
    text: ex.question,
    answer: ex.answer,
    answers: ex.type === 'text' ? ex.answers : undefined,
    kind: 'text',
    _lesson: lesson.id,
  };
}

export function getLessonById(id: string): LessonDef | undefined {
  return ALL_LESSONS.find((l) => l.id === id);
}

export function getLessonsBySubject(subjectId: SubjectId): LessonDef[] {
  return ALL_LESSONS.filter((l) => l.subject === subjectId);
}

export function getLessonsByCategory(categoryId: CategoryId): LessonDef[] {
  return ALL_LESSONS.filter((l) => l.category === categoryId);
}
