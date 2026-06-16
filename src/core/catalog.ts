/* ============================================================
   Catalogue des matières, catégories et leçons.
   Hiérarchie : Subject → Category → LessonDef
   Chaque LessonDef porte un ExerciseType qui encapsule la
   génération et la vérification d'un exercice.
   ============================================================ */
import type { ExerciseType, Exercise } from './exercise';
import type { IconName } from './icon-names';
import type { Item } from './items';
import { bilanQ } from './lessons';
import { CONJ_LESSONS, conjugationType } from '../data/francais/conjugaison';
import { VOCAB_LESSONS } from '../data/francais/vocabulaire';
import { SENS_FIGURE_LESSONS } from '../data/francais/sens-figure';
import { FAMILLES_LESSONS } from '../data/francais/familles';
import { CHAMPS_LESSONS } from '../data/francais/champs-lexicaux';
import { GRAMMAIRE_SUJET_LESSONS } from '../data/francais/grammaire-sujet';
import { CLASSES_LESSONS } from '../data/francais/classes-mots';
import { ACCORD_LESSONS } from '../data/francais/accords';
import { HOMOPHONE_LESSONS } from '../data/francais/homophones';
import { MBP_LESSONS } from '../data/francais/mbp';
import { MESURE_LESSONS } from '../data/maths/mesures';
import { MONNAIE_LESSONS } from '../data/maths/monnaie';
import { HEURE_LESSONS } from '../data/maths/heure';
import { PERIMETRE_LESSONS } from '../data/maths/perimetre';
import { NUMERATION_LESSONS, answerEstNumerique } from '../data/maths/numeration';
import { POSITION_LESSONS } from '../data/maths/position';
import { POSEE_LESSONS } from '../data/maths/posee';
import { GEOMETRIE_LESSONS } from '../data/maths/geometrie';
import { CERCLE_LESSONS } from '../data/maths/cercle';
import { SOLIDE_LESSONS } from '../data/maths/solides';

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
	icon?: IconName; // pictogramme de la carte de catégorie (rendu par ui/icon.ts)
}

export interface LessonDef {
	id: string;
	label: string;
	subject: SubjectId;
	category: CategoryId;
	level: SchoolLevel;
	exerciseType: ExerciseType;
	// Rubrique facultative : sous-section au sein d'une catégorie (#109). Sert à
	// regrouper les leçons à l'écran (ex. conjugaison par temps, orthographe
	// « Les accords »). Une leçon sans rubrique s'affiche à plat.
	rubrique?: string;
}

export interface BilanConfig {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	// Mode de lancement d'une sélection de leçons (#64) : un bilan « papier/écran »
	// à son rythme, ou un sprint chronométré de 5 min alimenté par ces leçons.
	// Champ optionnel : un favori enregistré avant #64 (sans `mode`) est un bilan.
	mode?: 'bilan' | 'sprint';
	// Catégorie de rattachement d'un favori (#65) : renseignée quand toutes les
	// leçons cochées appartiennent à une même catégorie (composeur scopé OU
	// sélection mono-catégorie depuis l'accueil). Le favori s'affiche alors dans
	// cette catégorie en plus de l'accueil. Absente = bilan multi-catégories
	// (ou favori antérieur à #65) → accueil seulement.
	categoryId?: CategoryId;
}

/* Mode effectif d'un BilanConfig (favori legacy sans `mode` = bilan). */
export function bilanMode(config: BilanConfig): 'bilan' | 'sprint' {
	return config.mode ?? 'bilan';
}

/* ---------- Helpers math ---------- */

/* Vérifie une réponse numérique (accepte la virgule comme séparateur décimal). */
function checkMath(_exercise: Exercise, input: string): boolean {
	if (!('answer' in _exercise)) return false; // jamais 'posed' ici (garde de type)
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

/* Catégorie d'orthographe : ses « leçons » sont dynamiques (leçons prédéfinies +
   listes du profil) et ne passent pas par le pipeline LessonDef/generate. */
export const ORTHO_CATEGORY_ID = 'fr-orthographe';

export const CATEGORIES: Category[] = [
	// Mathématiques — découpage des 4 grandes catégories du manuel CE2 (#92),
	// complété par le « Calcul mental » historique. ⚠ « Calcul » (math-calcul,
	// opérations posées) est distinct du « Calcul mental » (math-calcul-mental).
	// Les nouvelles catégories arrivent vides : leurs leçons suivront par issue.
	{ id: 'math-numeration', label: 'Numération', subject: 'math', icon: 'list-numbers' },
	{ id: 'math-calcul', label: 'Calcul', subject: 'math', icon: 'plus-minus' },
	{ id: 'math-calcul-mental', label: 'Calcul mental', subject: 'math', icon: 'brain' },
	{ id: 'math-grandeurs-mesures', label: 'Grandeurs et mesures', subject: 'math', icon: 'ruler' },
	{ id: 'math-geometrie', label: 'Géométrie', subject: 'math', icon: 'shapes' },
	// Français — 4 catégories du manuel CE2, dans l'ordre canonique. Grammaire et
	// Vocabulaire (FR-A, #107) sont le prérequis structurel des futures leçons de
	// contenu : elles arrivent VIDES (la navigation affiche « Bientôt disponible »,
	// aucun trophée ni bilan n'est généré tant qu'elles n'ont pas de leçon).
	{ id: 'fr-grammaire', label: 'Grammaire', subject: 'francais', icon: 'text' },
	{ id: 'fr-conjugaison', label: 'Conjugaison', subject: 'francais', icon: 'clock-clockwise' },
	{ id: ORTHO_CATEGORY_ID, label: 'Orthographe', subject: 'francais', icon: 'pencil' },
	{ id: 'fr-vocabulaire', label: 'Vocabulaire', subject: 'francais', icon: 'translate' },
];

/* ---------- Catalogue des leçons math ---------- */

const MATH_LESSONS: LessonDef[] = [
	{
		id: 'math-tables-addition',
		label: "Tables d'addition",
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(1),
	},
	{
		id: 'math-complements',
		label: 'Complément à 10/100',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(2),
	},
	{
		id: 'math-doubles',
		label: 'Doubles',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(3),
	},
	{
		id: 'math-moities',
		label: 'Moitiés',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(4),
	},
	{
		id: 'math-ajouter-9-19-29',
		label: 'Ajouter 9, 19...',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(5),
	},
	{
		id: 'math-soustraire-9-19-29',
		label: 'Soustraire 9, 19...',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(6),
	},
	{
		id: 'math-tables-multiplication',
		label: 'Table de ×',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(7),
	},
	{
		id: 'math-moitie-pair',
		label: 'Moitié (pair)',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(8),
	},
	{
		id: 'math-multiples-25',
		label: 'Multiples de 25',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(9),
	},
	{
		id: 'math-decompo-60',
		label: 'Décompo. de 60',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(10),
	},
	{
		id: 'math-dizaines-centaines',
		label: 'Dizaines/centaines',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(11),
	},
	{
		id: 'math-multiplier-10-100',
		label: '× 10, × 100',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(12),
	},
	{
		id: 'math-multiplier-4-8',
		label: '× 4, × 8',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(13),
	},
	{
		id: 'math-multiplier-20-30-40',
		label: '× 20, 30, 40',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(14),
	},
	{
		id: 'math-decomposer-multiplication',
		label: 'Décomposer',
		subject: 'math',
		category: 'math-calcul-mental',
		level: 'ce2',
		exerciseType: mathType(15),
	},
];

/* ---------- Catalogue des leçons « Grandeurs et mesures » (#89, #96) ----------
   Moteur moderne (ExerciseType), hors du pipeline bilanQ : le rendu passe par
   genLessonItem (item numérique) et buildLessonFiche (liste générique).
   Conversions d'unités (#89) + monnaie (#96). */
const GRANDEURS_LESSONS: LessonDef[] = [
	...MESURE_LESSONS,
	...MONNAIE_LESSONS,
	...HEURE_LESSONS,
	...PERIMETRE_LESSONS,
].map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'math',
	category: 'math-grandeurs-mesures',
	level: 'ce2',
	exerciseType: d.exerciseType,
}));

/* ---------- Catalogue des leçons « Numération » (#98, #94) ----------
   Situer un nombre (#98 : comparer/encadrer/intercaler, modes saisie/tuiles) et
   valeur de position / décomposition (#94 : mono-mode saisie). Le rendu
   fiche/bilan/sprint utilise le mode saisie (item texte ou numérique) ; le mode
   tuiles (#98) est un runner d'écran dédié (ui/lecon-tuiles.ts). */
const NUMERATION_LESSONS_DEFS: LessonDef[] = [...NUMERATION_LESSONS, ...POSITION_LESSONS].map(
	(d) => ({
		id: d.id,
		label: d.label,
		subject: 'math',
		category: 'math-numeration',
		level: 'ce2',
		exerciseType: d.exerciseType,
	}),
);

/* ---------- Catalogue des leçons français (conjugaison) ---------- */

const FRENCH_LESSONS: LessonDef[] = CONJ_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: 'fr-conjugaison',
	level: d.level,
	exerciseType: conjugationType(d.verbId, d.tense),
	rubrique: d.rubrique, // regroupement par temps (#109)
}));

/* ---------- Catalogue des leçons « Orthographe » sur moteur LessonDef (#109) ----------
   Accords (pluriel & féminin) : exercices de transformation saisie/QCM, dans la
   catégorie Orthographe sous la rubrique « Les accords » (à côté des dictées de
   mots, qui passent, elles, par le runner dédié). */
const ACCORD_LESSONS_DEFS: LessonDef[] = ACCORD_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	level: 'ce2',
	exerciseType: d.exerciseType,
	rubrique: d.rubrique,
}));

/* ---------- Catalogue des leçons « Orthographe » — homophones (#110) ----------
   5 paires (a/à, et/est, on/ont, son/sont, ou/où), une leçon par paire, QCM
   2 options dans la catégorie Orthographe, rubrique « Les homophones ». */
const HOMOPHONE_LESSONS_DEFS: LessonDef[] = HOMOPHONE_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	level: 'ce2',
	exerciseType: d.exerciseType,
	rubrique: d.rubrique,
}));

/* ---------- Catalogue des leçons « Orthographe » — règle m/m,b,p (#111) ----------
   Leçon unique « m ou n ? » (QCM 2 options), tirage pondéré (exceptions
   sur-pondérées), rubrique « Les règles ». */
const MBP_LESSONS_DEFS: LessonDef[] = MBP_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	level: 'ce2',
	exerciseType: d.exerciseType,
	rubrique: d.rubrique,
}));

/* ---------- Catalogue des leçons « Vocabulaire » (#108) ----------
   Ordre alphabétique : l'enfant range une suite de mots (interaction tuiles,
   runner ui/lecon-ordre.ts). Mono-mode ; le repli texte (fiche/bilan/révision)
   est produit par genLessonItem, et le sprint les exclut (cf. isOrderingLesson). */
const VOCAB_LESSONS_DEFS: LessonDef[] = VOCAB_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: 'fr-vocabulaire',
	level: 'ce2',
	exerciseType: d.exerciseType,
}));

/* ---------- Catalogue des leçons « Vocabulaire » — sens propre/figuré (#112) ----------
   Leçon QCM (3 options) : sens d'un mot selon le contexte. */
const SENS_FIGURE_LESSONS_DEFS: LessonDef[] = SENS_FIGURE_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: 'fr-vocabulaire',
	level: 'ce2',
	exerciseType: d.exerciseType,
}));

/* ---------- Vocabulaire — familles de mots, préfixes, suffixes (#113) ----------
   QCM de reconnaissance (3 options). */
const FAMILLES_LESSONS_DEFS: LessonDef[] = FAMILLES_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: 'fr-vocabulaire',
	level: 'ce2',
	exerciseType: d.exerciseType,
}));

/* ---------- Vocabulaire — champs lexicaux (#114) ----------
   Deux leçons sous la rubrique « Champs lexicaux » : « Le mot juste » (QCM 4
   options : définition → mot + intrus) et « Ranger par thème » (tri de tuiles
   dans deux thèmes, runner ui/lecon-tri.ts). */
const CHAMPS_LESSONS_DEFS: LessonDef[] = CHAMPS_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: 'fr-vocabulaire',
	level: 'ce2',
	exerciseType: d.exerciseType,
	rubrique: 'Champs lexicaux',
}));

/* ---------- Grammaire — pronom sujet & accord sujet-verbe (#115) ----------
   2 leçons QCM ; les formes sont lues depuis la base de conjugaison. */
const GRAMMAIRE_SUJET_LESSONS_DEFS: LessonDef[] = GRAMMAIRE_SUJET_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: 'fr-grammaire',
	level: 'ce2',
	exerciseType: d.exerciseType,
}));

/* ---------- Grammaire — classes de mots, articles, adverbes (#116) ----------
   Leçon QCM d'étiquetage (banque interne étiquetée, hors listes du parent). */
const CLASSES_LESSONS_DEFS: LessonDef[] = CLASSES_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: 'fr-grammaire',
	level: 'ce2',
	exerciseType: d.exerciseType,
}));

/* ---------- Catalogue des leçons « Calcul » (opérations posées, #97) ----------
   Items `kind: 'posed'` : la grille (cellules-chiffres notées une à une) est
   rendue par renderItem. Passent par les bilans/impression/révision ; exclues du
   sprint (une grille multi-cellules ne se joue pas « une réponse à la fois »). */
const CALCUL_LESSONS_DEFS: LessonDef[] = POSEE_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'math',
	category: 'math-calcul',
	level: 'ce2',
	exerciseType: d.exerciseType,
}));

/* ---------- Catalogue des leçons « Géométrie » (figures planes, #100) ----------
   Clientes du moteur de figures SVG : reconnaissance visuelle (modes QCM/saisie)
   et propriétés/vocabulaire (QCM textuel). */
const GEOMETRIE_LESSONS_DEFS: LessonDef[] = [
	...GEOMETRIE_LESSONS,
	...CERCLE_LESSONS,
	...SOLIDE_LESSONS,
].map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'math',
	category: 'math-geometrie',
	level: 'ce2',
	exerciseType: d.exerciseType,
}));

/* ---------- Registre global ---------- */

const ALL_LESSONS: LessonDef[] = [
	...MATH_LESSONS,
	...NUMERATION_LESSONS_DEFS,
	...CALCUL_LESSONS_DEFS,
	...GRANDEURS_LESSONS,
	...GEOMETRIE_LESSONS_DEFS,
	...FRENCH_LESSONS,
	...ACCORD_LESSONS_DEFS,
	...HOMOPHONE_LESSONS_DEFS,
	...MBP_LESSONS_DEFS,
	...VOCAB_LESSONS_DEFS,
	...SENS_FIGURE_LESSONS_DEFS,
	...FAMILLES_LESSONS_DEFS,
	...CHAMPS_LESSONS_DEFS,
	...GRAMMAIRE_SUJET_LESSONS_DEFS,
	...CLASSES_LESSONS_DEFS,
];

/* Une opération posée (#97) se rend en grille multi-cellules : incompatible avec
   le sprint (« une réponse à la fois »), qui les exclut de son tirage. */
export function isPosedLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.generate().type === 'posed';
}

/* Une leçon « ranger une suite » (#108, ordre alphabétique) se joue en déplaçant
   plusieurs tuiles : interaction d'écran dédiée (ui/lecon-ordre.ts), incompatible
   avec le sprint « une réponse à la fois » → exclue de son tirage (comme la posée).
   Reste jouable en bilan/fiche/révision via le repli texte de genLessonItem. */
export function isOrderingLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.generate().type === 'tuilesOrdre';
}

/* Une leçon « ranger par thème » (#114, champs lexicaux) se joue en triant
   plusieurs tuiles dans deux colonnes : interaction d'écran dédiée
   (ui/lecon-tri.ts), incompatible avec le sprint « une réponse à la fois » →
   exclue de son tirage. Reste jouable en bilan/fiche/révision via le repli
   texte de genLessonItem (une tuile → « dans quel thème ? »). */
export function isTriLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.generate().type === 'tuilesTri';
}

/* Une leçon math « héritée » est branchée sur le générateur numérique bilanQ
   (calcul mental, via MATH_LESSON_NUM). Les autres leçons math (moteurs
   modernes : conversions #89, etc.) produisent leur item via leur ExerciseType. */
export function isLegacyMathLesson(lesson: LessonDef): boolean {
	return lesson.subject === 'math' && lesson.id in MATH_LESSON_NUM;
}

export function getAllLessons(): LessonDef[] {
	return ALL_LESSONS;
}

/* Génère un Item prêt à rendre pour n'importe quelle leçon du catalogue.
   - math hérité (calcul mental) : générateur numérique existant (bilanQ) ;
   - math moderne (conversions #89, monnaie #96, numération #98…) : item depuis
     l'ExerciseType (le `@` de la question marque l'emplacement du champ) ; le
     `kind` suit la réponse — numérique (nombre) ou texte (signe <, =, >) ;
   - autres matières : item TEXTE (corrigé par comparaison de chaîne). */
export function genLessonItem(lesson: LessonDef): Item {
	if (isLegacyMathLesson(lesson)) {
		const item = bilanQ(MATH_LESSON_NUM[lesson.id])!;
		item._lesson = lesson.id;
		return item;
	}
	const ex = lesson.exerciseType.generate();
	// Ordre alphabétique (#108) : l'interaction tuiles vit dans son runner d'écran.
	// Ici (fiche/bilan/révision), repli TEXTE non interactif : on liste les mots
	// mélangés et on attend la suite rangée (séparée par des espaces ou virgules).
	if (ex.type === 'tuilesOrdre') {
		return {
			text: `${ex.question} (${ex.tuiles.join(', ')}) @`,
			answer: ex.ordre.join(' '),
			answers: [ex.ordre.join(', ')],
			kind: 'text',
			_lesson: lesson.id,
		};
	}
	// Tri par thème (#114) : l'interaction (deux colonnes) vit dans son runner.
	// Repli TEXTE non interactif pour fiche/bilan/révision : une tuile tirée au
	// sort de la question et son thème attendu (« la météo » / « la mer »).
	if (ex.type === 'tuilesTri') {
		const tuile = ex.mots[0]; // l'ordre des tuiles est déjà mélangé à la génération
		return {
			text: `Dans quel thème ranger « ${tuile.mot} » ? (${ex.categories[0]} / ${ex.categories[1]}) @`,
			answer: ex.categories[tuile.cat],
			kind: 'text',
			_lesson: lesson.id,
		};
	}
	// Calcul posé (#97) : item « conteneur » déployé en grille par renderItem.
	if (ex.type === 'posed') {
		const result = ex.op === '+' ? ex.a + ex.b : ex.op === '-' ? ex.a - ex.b : ex.a * ex.b;
		return {
			text: '',
			answer: result,
			kind: 'posed',
			posed: { op: ex.op, a: ex.a, b: ex.b },
			_lesson: lesson.id,
		};
	}
	const question =
		ex.type === 'text' || ex.type === 'qcm' || ex.type === 'tuilesNombre' ? ex.question : '';
	// Figure SVG éventuelle (#88) : portée par 'text'/'qcm', affichée par renderItem.
	const figure = ex.type === 'text' || ex.type === 'qcm' ? ex.figure : undefined;
	if (lesson.subject === 'math') {
		// Saisie de l'heure en 2 champs (#88) ; sinon numérique (calcul) ou texte (signe).
		const kind =
			ex.type === 'text' && ex.champHeure
				? 'heure'
				: answerEstNumerique(String(ex.answer))
					? 'num'
					: 'text';
		// `answers` (formes équivalentes acceptées, ex. « 10 h 15 » / « 10h15 ») est
		// aussi propagé pour les maths : la lecture de l'heure tolère plusieurs écritures.
		const answers = ex.type === 'text' ? ex.answers : undefined;
		return { text: question, answer: ex.answer, answers, kind, figure, _lesson: lesson.id };
	}
	return {
		text: question,
		answer: ex.answer,
		answers: ex.type === 'text' ? ex.answers : undefined,
		kind: 'text',
		figure,
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

/* Résout une liste d'identifiants en LessonDef du catalogue, dans l'ordre
   demandé et en ignorant les inconnus. Sert au sprint personnalisé (#64) :
   un favori peut référencer une leçon disparue du catalogue. */
export function lessonsForIds(ids: string[]): LessonDef[] {
	return ids
		.map((id) => ALL_LESSONS.find((l) => l.id === id))
		.filter((l): l is LessonDef => l !== undefined);
}

/* Catégorie commune à un ensemble de leçons (#65) : renvoie l'identifiant de
   catégorie si toutes les leçons connues partagent la même, sinon `undefined`
   (sélection multi-catégories ou vide). Sert à rattacher un favori à sa
   catégorie, qu'il soit composé depuis l'écran scopé ou depuis l'accueil. */
export function commonCategoryId(lessonIds: string[]): CategoryId | undefined {
	const cats = new Set(lessonsForIds(lessonIds).map((l) => l.category));
	return cats.size === 1 ? [...cats][0] : undefined;
}
