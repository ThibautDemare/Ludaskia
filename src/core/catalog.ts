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
import { CONJ_META_LESSONS } from '../data/francais/conjugaison-meta';
import { VOCAB_LESSONS } from '../data/francais/vocabulaire';
import { SENS_FIGURE_LESSONS } from '../data/francais/sens-figure';
import { HOMONYMIE_LESSONS } from '../data/francais/homonymie';
import { SENS_LESSONS } from '../data/francais/synonymes-contraires';
import { FAMILLES_LESSONS } from '../data/francais/familles';
import { CHAMPS_LESSONS } from '../data/francais/champs-lexicaux';
import { GRAMMAIRE_SUJET_LESSONS } from '../data/francais/grammaire-sujet';
import { CLASSES_LESSONS } from '../data/francais/classes-mots';
import { CLIC_MOT_LESSONS, joindrePhrase, libelleCible } from '../data/francais/grammaire-clic-mot';
import { PHRASES_LESSONS } from '../data/francais/phrases';
import { ACCORD_LESSONS, ACCORD_CM1_LESSONS } from '../data/francais/accords';
import { ACCORD_GN_LESSONS } from '../data/francais/accord-groupe-nominal';
import { PARTICIPE_LESSONS } from '../data/francais/participe-passe-etre';
import { HOMOPHONE_LESSONS } from '../data/francais/homophones';
import { MBP_LESSONS } from '../data/francais/mbp';
import { MESURE_LESSONS } from '../data/maths/mesures';
import { DUREE_ECOULEE_LESSONS } from '../data/maths/duree-ecoulee';
import { MONNAIE_LESSONS } from '../data/maths/monnaie';
import { HEURE_LESSONS } from '../data/maths/heure';
import { PERIMETRE_LESSONS } from '../data/maths/perimetre';
import { AIRE_PERIMETRE_LESSONS } from '../data/maths/aire-perimetre';
import { NUMERATION_LESSONS, answerEstNumerique } from '../data/maths/numeration';
// Réexposé pour les vues qui décident d'un rendu numérique vs texte (ex. révision,
// #186) sans importer directement un module de données maths.
export { answerEstNumerique };
import { POSITION_LESSONS } from '../data/maths/position';
import { DECIMAUX_LESSONS } from '../data/maths/decimaux';
import { DROITE_GRADUEE_LESSONS } from '../data/maths/droite-graduee';
import { DONNEES_LESSONS } from '../data/maths/donnees';
import { renderFigure } from './figures';
import { DECIMAUX_ECRITURES_LESSONS } from '../data/maths/decimaux-ecritures';
import { FRACTIONS_LESSONS } from '../data/maths/fractions';
import { POSEE_LESSONS } from '../data/maths/posee';
import { GEOMETRIE_LESSONS } from '../data/maths/geometrie';
import { CERCLE_LESSONS } from '../data/maths/cercle';
import { SOLIDE_LESSONS } from '../data/maths/solides';
import { GEOMETRIE_CM1_LESSONS } from '../data/maths/geometrie-cm1';
import { FIGURES_PROPRIETES_LESSONS } from '../data/maths/figures-proprietes';
import { SYMETRIE_LESSONS } from '../data/maths/symetrie-axiale';
import { ANGLES_LESSONS } from '../data/maths/angles';
import { PROBLEMES_LESSONS } from '../data/maths/problemes';
import { DIVISION_LESSONS, DIVISION_EUCLIDIENNE_LESSONS } from '../data/maths/division';
import { DIVISIBILITE_LESSONS } from '../data/maths/divisibilite';
import { ORDRE_GRANDEUR_LESSONS } from '../data/maths/ordre-grandeur';
import type { LessonInput } from '../data/_shared';
import { trierParOrdre } from './ordre';

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
	// Niveaux scolaires supportés par la leçon (#225). Ensemble explicite : la
	// plupart restent CE2-only (`['ce2']`) ; une leçon multi-niveaux liste tous
	// les niveaux qu'elle couvre. Résolu via `effectiveLevel` (core/levels.ts).
	levels: SchoolLevel[];
	exerciseType: ExerciseType;
	// Rubrique facultative : sous-section au sein d'une catégorie (#109). Sert à
	// regrouper les leçons à l'écran (ex. conjugaison par temps, orthographe
	// « Les accords »). Une leçon sans rubrique s'affiche à plat.
	rubrique?: string;
	// Exclue du sprint chronométré (#104) : leçons « découverte » à figure / lecture
	// d'énoncé, incompatibles avec la pression du chrono (en plus des posées/tuiles/
	// problèmes déjà écartées par leur type).
	excludeFromSprint?: boolean;
	// Repère de difficulté affiché sur la carte de leçon (#205) : signale une leçon
	// plus exigeante (charge cognitive élevée, notion vue en avance). La navigation
	// pose un badge « plus dur » ; n'influe pas sur la génération.
	repere?: 'plus-difficile';
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

/* ---------- Fabrique de LessonDef (#373) ----------
   Une vingtaine de familles de leçons partageaient la MÊME construction
   `LessonInput -> LessonDef` : recopier id/label/exerciseType, fixer subject et
   category, poser levels puis les champs optionnels. `LessonInput` (#347) avait
   centralisé l'ENTRÉE, pas cette SORTIE. `toLessonDefs` factorise le mapping et
   supprime le risque d'oubli d'un champ à l'ajout d'une famille.

   Chaque champ variable est soit une valeur FIXE (commune à toute la famille),
   soit une fonction `(input) => valeur` quand il DÉRIVE de la donnée (niveaux
   d'un moteur calibré, rubrique portée par l'entrée, exclusion du sprint…). Les
   champs optionnels résolus à `undefined` sont OMIS — sortie identique, champ par
   champ, à l'écriture manuelle précédente. */
type Resolvable<T, I> = T | ((input: I) => T);

interface LessonDefOptions<I extends LessonInput> {
	subject: SubjectId;
	category: CategoryId;
	levels?: Resolvable<SchoolLevel[], I>; // défaut ['ce2'] (le cas courant)
	rubrique?: Resolvable<string | undefined, I>;
	excludeFromSprint?: Resolvable<boolean | undefined, I>;
	repere?: Resolvable<'plus-difficile' | undefined, I>;
}

function resolve<T, I>(r: Resolvable<T, I> | undefined, input: I): T | undefined {
	// Le cast est nécessaire (pas un raccourci masquant un bug) : `T` étant générique,
	// TS ne peut pas restreindre `T | ((input: I) => T)` via `typeof === 'function'`
	// (il ne sait pas prouver que `T` n'est jamais lui-même un type fonction). C'est
	// sûr tant que les champs résolus restent non-fonctions (levels/rubrique/
	// excludeFromSprint/repere) ; un futur champ résolvable de type fonction romprait
	// cette disambiguation et imposerait un discriminant explicite.
	return typeof r === 'function' ? (r as (input: I) => T)(input) : r;
}

function toLessonDefs<I extends LessonInput>(inputs: I[], opts: LessonDefOptions<I>): LessonDef[] {
	return inputs.map((input) => {
		const def: LessonDef = {
			id: input.id,
			label: input.label,
			subject: opts.subject,
			category: opts.category,
			levels: resolve(opts.levels, input) ?? ['ce2'],
			exerciseType: input.exerciseType,
		};
		const rubrique = resolve(opts.rubrique, input);
		if (rubrique !== undefined) def.rubrique = rubrique;
		const excludeFromSprint = resolve(opts.excludeFromSprint, input);
		if (excludeFromSprint !== undefined) def.excludeFromSprint = excludeFromSprint;
		const repere = resolve(opts.repere, input);
		if (repere !== undefined) def.repere = repere;
		return def;
	});
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
	// Calcul mental CM1 (#241) : numéros bilanQ prolongeant la série CE2.
	'math-multiples-50': 16,
	'math-diviser-10-100': 17,
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
	{ id: 'math-problemes', label: 'Résolution de problèmes', subject: 'math', icon: 'lightbulb' },
	// Organisation et gestion de données (#257) : lecture de tableaux / diagrammes en
	// barres. N'a de leçons qu'en CM1 → affiche « Bientôt disponible » sous un profil CE2
	// (automatique, catalogue vide). Icône `table` (pas de picto « graphique » dans la
	// famille Phosphor actuelle ; `table` évoque au plus près l'organisation de données).
	{
		id: 'math-donnees',
		label: 'Organisation et gestion de données',
		subject: 'math',
		icon: 'table',
	},
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
		levels: ['ce2'],
		exerciseType: mathType(1),
	},
	{
		id: 'math-complements',
		label: 'Complément à 10/100/1000',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(2),
	},
	{
		id: 'math-doubles',
		label: 'Doubles',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(3),
	},
	{
		id: 'math-moities',
		label: 'Moitiés',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(4),
	},
	{
		id: 'math-ajouter-9-19-29',
		label: 'Ajouter 9, 19...',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(5),
	},
	{
		id: 'math-soustraire-9-19-29',
		label: 'Soustraire 9, 19...',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(6),
	},
	{
		id: 'math-tables-multiplication',
		label: 'Table de ×',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(7),
	},
	{
		id: 'math-moitie-pair',
		label: 'Moitié (pair)',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(8),
	},
	{
		id: 'math-multiples-25',
		label: 'Multiples de 25',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(9),
	},
	{
		id: 'math-decompo-60',
		label: 'Décompo. de 60',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(10),
	},
	{
		id: 'math-dizaines-centaines',
		label: 'Dizaines/centaines',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(11),
	},
	{
		id: 'math-multiplier-10-100',
		label: '× 10, × 100',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(12),
	},
	{
		id: 'math-multiplier-4-8',
		label: '× 4, × 8',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(13),
	},
	{
		id: 'math-multiplier-20-30-40',
		label: '× 20, 30, 40',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(14),
	},
	{
		id: 'math-decomposer-multiplication',
		label: 'Décomposer',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['ce2'],
		exerciseType: mathType(15),
	},
];

/* ---------- Calcul mental CM1 (#241) ----------
   Deux leçons CM1 sur le moteur historique (bilanQ) : « Les multiples de 50 »
   (clone CM1 des multiples de 25) et « Diviser par 10, par 100 » (symétrique de
   « Multiplier par 10, par 100 », quotients ENTIERS uniquement). Distinctes des
   leçons CE2 (numéros bilanQ 16/17), taguées CM1 — visibles quand la classe est CM1. */
const MATH_LESSONS_CM1: LessonDef[] = [
	{
		id: 'math-multiples-50',
		label: 'Multiples de 50',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['cm1'],
		exerciseType: mathType(16),
	},
	{
		id: 'math-diviser-10-100',
		label: '÷ 10, ÷ 100',
		subject: 'math',
		category: 'math-calcul-mental',
		levels: ['cm1'],
		exerciseType: mathType(17),
	},
];

/* ---------- Catalogue des leçons « Grandeurs et mesures » (#89, #96) ----------
   Moteur moderne (ExerciseType), hors du pipeline bilanQ : le rendu passe par
   genLessonItem (item numérique) et buildLessonFiche (liste générique).
   Conversions d'unités (#89) + monnaie (#96). */
const GRANDEURS_LESSONS: LessonDef[] = [
	// Conversions d'unités (#89) : niveaux DÉRIVÉS du moteur calibré (#225/#287). Le CM1
	// est désormais surfacé (#248 : les conversions y ajoutent les résultats décimaux, plus
	// les unités CM1 déjà calibrées) → CE2 + CM1. Cf. ordre pédagogique math.cm1 (#208).
	...toLessonDefs(MESURE_LESSONS, {
		subject: 'math',
		category: 'math-grandeurs-mesures',
		levels: (d) => d.exerciseType.levels ?? ['ce2'],
	}),
	// Durée écoulée (#252) : leçon CM1-only, hors sprint (deux champs + lecture d'énoncé),
	// sur le runner « problème ». Niveaux dérivés du moteur (['cm1']).
	...toLessonDefs(DUREE_ECOULEE_LESSONS, {
		subject: 'math',
		category: 'math-grandeurs-mesures',
		levels: (d) => d.exerciseType.levels ?? ['cm1'],
		excludeFromSprint: (d) => d.excludeFromSprint,
	}),
	// Monnaie (#96), lecture de l'heure (#88) et périmètre : CM1 non surfacé (relève du
	// déploiement CM1 de ces notions) → `levels: ['ce2']` (défaut).
	...toLessonDefs([...MONNAIE_LESSONS, ...HEURE_LESSONS, ...PERIMETRE_LESSONS], {
		subject: 'math',
		category: 'math-grandeurs-mesures',
	}),
	// Aire et périmètre (#253) : leçon CM1-only, 100 % comptage sur quadrillage. Mappée
	// SÉPARÉMENT (levels ['cm1'] explicites) pour ne pas surfacer de niveau CM1 sur les
	// leçons CE2 voisines. Exclue du sprint (comptage soigné + vrai/faux devinables).
	...toLessonDefs(AIRE_PERIMETRE_LESSONS, {
		subject: 'math',
		category: 'math-grandeurs-mesures',
		levels: ['cm1'],
		excludeFromSprint: (d) => d.excludeFromSprint,
	}),
];

/* ---------- Catalogue des leçons « Numération » (#98, #94) ----------
   Situer un nombre (#98 : comparer/encadrer/intercaler, modes saisie/tuiles) et
   valeur de position / décomposition (#94 : mono-mode saisie). Le rendu
   fiche/bilan/sprint utilise le mode saisie (item texte ou numérique) ; le mode
   tuiles (#98) est un runner d'écran dédié (ui/lecon-tuiles.ts). */
const NUMERATION_LESSONS_DEFS: LessonDef[] = toLessonDefs(
	[...NUMERATION_LESSONS, ...POSITION_LESSONS],
	{
		subject: 'math',
		category: 'math-numeration',
		// Niveaux dérivés du moteur (#225) : une leçon « calibrée » (combinateur
		// `calibrated`) expose ses niveaux ; sinon le `levels` explicite du descripteur
		// (ex. la décompo multiplicative CM1-only, #240) ; à défaut CE2.
		levels: (d) => d.exerciseType.levels ?? d.levels ?? ['ce2'],
	},
);

/* ---------- Catalogue des leçons « Numération » — Nombres décimaux (#246, CM1) ----------
   Premier contact avec le nombre décimal général (au-delà de la monnaie du CE2) :
   numération de position décimale + rôle du zéro, puis comparer / encadrer / ranger.
   Toutes CM1-only (le CE2 ne bouge pas), regroupées sous la rubrique « Nombres
   décimaux ». Borne dure = centièmes (jamais de millièmes). */
const DECIMAUX_LESSONS_DEFS: LessonDef[] = toLessonDefs(DECIMAUX_LESSONS, {
	subject: 'math',
	category: 'math-numeration',
	levels: ['cm1'],
	rubrique: 'Nombres décimaux',
});

/* ---------- Numération — Nombres décimaux : écritures équivalentes (#247, CM1) ----------
   Poursuit la rubrique « Nombres décimaux » (#246) : correspondance fraction décimale ↔
   écriture à virgule (grille 10×10), fractions décimales > 1, décomposition. CM1-only. */
const DECIMAUX_ECRITURES_LESSONS_DEFS: LessonDef[] = toLessonDefs(DECIMAUX_ECRITURES_LESSONS, {
	subject: 'math',
	category: 'math-numeration',
	levels: ['cm1'],
	rubrique: 'Nombres décimaux',
});

/* ---------- Numération — Droite graduée (#256, CM1) ----------
   Placer un nombre sur une portion de droite graduée (brique interactive, runner dédié
   ui/lecon-droite-graduee.ts). Deux leçons CM1-only : ENTIERS (grands nombres) à plat, et
   DÉCIMAUX sous la rubrique « Nombres décimaux » (poursuit le fil #246/#247). Hors sprint
   (runner dédié, cf. isDroiteGradueeLesson). */
const DROITE_GRADUEE_LESSONS_DEFS: LessonDef[] = toLessonDefs(DROITE_GRADUEE_LESSONS, {
	subject: 'math',
	category: 'math-numeration',
	levels: ['cm1'],
	rubrique: (d) => d.rubrique,
});

/* ---------- Organisation et gestion de données (#257, CM1) ----------
   Deux leçons CM1-only de LECTURE de données, en saisie chiffrée : lire une barre sur un axe
   gradué, lire une cellule d'un tableau à double entrée. Ce sont de simples exercices `text`
   portant une `figure` (diagramme SVG / tableau HTML), corrigés par le chemin de saisie
   générique (pas de runner ni d'exerciseKind dédiés). EXCLUES du sprint (`excludeFromSprint`,
   comme aire-perimetre / divisibilité) : lecture d'une figure + d'un énoncé, incompatible avec
   la pression du chrono « une réponse à la fois ». */
const DONNEES_LESSONS_DEFS: LessonDef[] = toLessonDefs(DONNEES_LESSONS, {
	subject: 'math',
	category: 'math-donnees',
	levels: ['cm1'],
	excludeFromSprint: true,
});

/* ---------- Catalogue des leçons « Numération » — Fractions (#200, CM1 #249) ----------
   Programme cycle 2 rénové 2025 : au CE2 fractions < 1, dénominateur ≤ 12. Sens, collection,
   bande graduée, égalités, comparaison et addition (même dénominateur). Regroupées sous la
   rubrique « Fractions » (les autres leçons de Numération restent à plat).
   Multi-niveaux (#249) : les 6 leçons de base sont ouvertes au CM1 (dérivées du moteur pour
   les calibrées collection/bande/addition, défaut ['ce2','cm1'] pour les autres), et trois
   leçons « fractions comme nombres » (impropres, décomposition, encadrement) sont CM1-only
   (`cm1Only` → levels ['cm1']). Le CE2 reste borné à < 1. */
const FRACTIONS_LESSONS_DEFS: LessonDef[] = toLessonDefs(FRACTIONS_LESSONS, {
	subject: 'math',
	category: 'math-numeration',
	levels: (d) => d.exerciseType.levels ?? ['ce2', 'cm1'],
	rubrique: 'Fractions',
});

/* ---------- Catalogue des leçons « Résolution de problèmes » (#199, CM1 #255) ----------
   Énoncés générés par gabarits (structures de Vergnaud). Runner dédié, un
   problème à la fois ; réponse numérique. Exclus du sprint chronométré.
   Niveaux DÉRIVÉS du moteur (`exerciseType.levels`, comme les leçons multi-niveaux) :
   quatre structures sont ouvertes au CM1 en décimal (#255) et déclarent ['ce2','cm1'] ;
   les autres restent CE2-only (défaut ['ce2']). */
const PROBLEMES_LESSONS_DEFS: LessonDef[] = toLessonDefs(PROBLEMES_LESSONS, {
	subject: 'math',
	category: 'math-problemes',
	levels: (d) => d.exerciseType.levels ?? ['ce2'],
});

/* ---------- Catalogue des leçons « Division par le sens » (#104) ----------
   Moteur moderne (ExerciseType) : moitié/quart d'une collection + « Je partage »
   (deux sens, signe ÷, figure de découverte). Rattachées au Calcul mental.
   « Je partage » est exclue du sprint (figure + lecture d'énoncé). */
const DIVISION_LESSONS_DEFS: LessonDef[] = toLessonDefs(DIVISION_LESSONS, {
	subject: 'math',
	category: 'math-calcul-mental',
	// CM1 prêt derrière `level` (#287), surfacé au déploiement CM1 → levels par défaut ['ce2'].
	excludeFromSprint: (d) => d.excludeFromSprint,
});

/* ---------- Calcul mental CM1 — divisibilité, ordre de grandeur (#250), division
   euclidienne (#251) ----------
   Leçons CM1-only rattachées au calcul mental : deux QCM sur banque (`bankByLevel`,
   premier usage réel #225) — critères de divisibilité par 2/5/10 (oui/non) et ordre
   de grandeur d'un produit (choix parmi 3 puissances de 10) — et la division
   euclidienne (quotient + reste), générative sur le runner « problème » à deux
   sous-questions (leçon distincte du CE2 `math-div-reste`, registre abstrait-numérique).
   Niveaux DÉRIVÉS du moteur (`exerciseType.levels`, exposé par les banques et par la
   fabrique de la division euclidienne), comme les leçons `calibrated` — défaut ['cm1']. */
/* Entrées groupées, typées avec l'exclusion sprint optionnelle (portée par la
   divisibilité et la division euclidienne ; l'ordre de grandeur, QCM à 3 choix, reste
   dans le sprint). */
const CALCUL_MENTAL_CM1_INPUTS: (LessonInput & { excludeFromSprint?: boolean })[] = [
	...DIVISIBILITE_LESSONS,
	...ORDRE_GRANDEUR_LESSONS,
	...DIVISION_EUCLIDIENNE_LESSONS,
];
const CALCUL_MENTAL_CM1_LESSONS_DEFS: LessonDef[] = toLessonDefs(CALCUL_MENTAL_CM1_INPUTS, {
	subject: 'math',
	category: 'math-calcul-mental',
	levels: (d) => d.exerciseType.levels ?? ['cm1'],
	excludeFromSprint: (d) => d.excludeFromSprint,
});

/* ---------- Catalogue des leçons français (conjugaison) ----------
   Seule famille hors `toLessonDefs` : l'exerciseType n'est pas porté par l'entrée
   mais CALCULÉ (`conjugationType(verbId, tense)`) — le descripteur `ConjLessonDesc`
   n'est donc pas un `LessonInput`. Le `.map` reste explicite ici. */
const FRENCH_LESSONS: LessonDef[] = CONJ_LESSONS.map((d) => ({
	id: d.id,
	label: d.label,
	subject: 'francais',
	category: 'fr-conjugaison',
	levels: d.levels,
	exerciseType: conjugationType(d.verbId, d.tense),
	rubrique: d.rubrique, // regroupement par temps (#109)
}));

/* ---------- Conjugaison CE2/CM1 — trois QCM « méta » (#239) ----------
   Reconnaissance (QCM mono-mode) : temps simple/composé, groupe d'un verbe,
   infinitif d'une forme conjuguée. Taguées CE2 + CM1 : ces notions sont aussi vues au
   CE2 (le re-tag corrige une incohérence — le corpus verbe×temps est déjà ce2+cm1).
   « groupe » est posé en FIN de programme CE2 (ordre-pedagogique) et signalé « plus dur »
   (la notion de groupe est en retrait au cycle 2, le 2e groupe « finir » y est piégeux ;
   une variante CE2 dédiée pourra venir plus tard). Regroupées sous la rubrique
   « Reconnaître les verbes » ; énoncés courts à lire + QCM → exclues du sprint chronométré. */
const CONJ_META_LESSONS_DEFS: LessonDef[] = toLessonDefs(CONJ_META_LESSONS, {
	subject: 'francais',
	category: 'fr-conjugaison',
	levels: ['ce2', 'cm1'],
	rubrique: 'Reconnaître les verbes',
	excludeFromSprint: true,
	repere: (d) => (d.id === 'fr-conj-groupe' ? 'plus-difficile' : undefined),
});

/* ---------- Catalogue des leçons « Orthographe » sur moteur LessonDef (#109) ----------
   Accords (pluriel & féminin) : exercices de transformation saisie/QCM, dans la
   catégorie Orthographe sous la rubrique « Les accords » (à côté des dictées de
   mots, qui passent, elles, par le runner dédié). */
const ACCORD_LESSONS_DEFS: LessonDef[] = toLessonDefs(ACCORD_LESSONS, {
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	rubrique: (d) => d.rubrique,
});

/* ---------- Orthographe — accords CM1 (#243) ----------
   Même moteur de transformation (saisie/QCM) que le CE2, banque plus exigeante
   (terminaisons -er/-ère, -f/-ve, -et/-ète, -eur/-trice, -al/-aux). Taguée CM1. */
const ACCORD_CM1_LESSONS_DEFS: LessonDef[] = toLessonDefs(ACCORD_CM1_LESSONS, {
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	levels: ['cm1'],
	rubrique: (d) => d.rubrique,
});

/* ---------- Orthographe — accord du participe passé avec « être » (#205) ----------
   Transformation guidée + QCM 3 options (rubrique « Les accords »). Sensibilisation
   CE2 à charge cognitive élevée → signalée « plus difficile » et exclue du sprint
   chronométré (la réflexion sur le genre/nombre du sujet ne se fait pas dans l'urgence). */
const PARTICIPE_LESSONS_DEFS: LessonDef[] = toLessonDefs(PARTICIPE_LESSONS, {
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	rubrique: (d) => d.rubrique,
	excludeFromSprint: true,
	repere: 'plus-difficile',
});

/* ---------- Orthographe — accord dans le groupe nominal (#243, CM1) ----------
   QCM rigoureux (calqué sur le participe passé) : on montre un groupe nominal
   court au singulier, l'enfant choisit le groupe ENTIÈREMENT accordé parmi 3
   propositions dont chaque distracteur casse exactement une marque. Notion à
   charge cognitive élevée → exclue du sprint et signalée « plus difficile ». */
const ACCORD_GN_LESSONS_DEFS: LessonDef[] = toLessonDefs(ACCORD_GN_LESSONS, {
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	levels: ['cm1'],
	rubrique: (d) => d.rubrique,
	excludeFromSprint: true,
	repere: 'plus-difficile',
});

/* ---------- Catalogue des leçons « Orthographe » — homophones (#110) ----------
   5 paires (a/à, et/est, on/ont, son/sont, ou/où), une leçon par paire, QCM
   2 options dans la catégorie Orthographe, rubrique « Les homophones ». */
const HOMOPHONE_LESSONS_DEFS: LessonDef[] = toLessonDefs(HOMOPHONE_LESSONS, {
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	rubrique: (d) => d.rubrique,
});

/* ---------- Catalogue des leçons « Orthographe » — règle m/m,b,p (#111) ----------
   Leçon unique « m ou n ? » (QCM 2 options), tirage pondéré (exceptions
   sur-pondérées), rubrique « Les règles ». */
const MBP_LESSONS_DEFS: LessonDef[] = toLessonDefs(MBP_LESSONS, {
	subject: 'francais',
	category: ORTHO_CATEGORY_ID,
	rubrique: (d) => d.rubrique,
});

/* ---------- Catalogue des leçons « Vocabulaire » (#108) ----------
   Ordre alphabétique : l'enfant range une suite de mots (interaction tuiles,
   runner ui/lecon-ordre.ts). Mono-mode ; le repli texte (fiche/bilan/révision)
   est produit par genLessonItem, et le sprint les exclut (cf. isOrderingLesson). */
const VOCAB_LESSONS_DEFS: LessonDef[] = toLessonDefs(VOCAB_LESSONS, {
	subject: 'francais',
	category: 'fr-vocabulaire',
});

/* ---------- Catalogue des leçons « Vocabulaire » — sens propre/figuré (#112) ----------
   Leçon QCM (3 options) : sens d'un mot selon le contexte.
   Exclue du sprint (correctif #254) : même tâche de JUGEMENT DE SENS que les contraires
   (#203) et l'homonymie — elle y figurait par oubli, pas par exception justifiée.
   Alignée sur la politique « automatisme chronométrable » vs « jugement de sens ». */
const SENS_FIGURE_LESSONS_DEFS: LessonDef[] = toLessonDefs(SENS_FIGURE_LESSONS, {
	subject: 'francais',
	category: 'fr-vocabulaire',
	excludeFromSprint: true,
});

/* ---------- Vocabulaire — les homonymes (homographes) CM1 (#254) ----------
   Leçon QCM sur banque (`bankByLevel`) : sens d'un homographe selon le contexte,
   options = les SENS RÉELS du mot (2 ou 3, jamais un sens inventé). CM1-only ;
   niveaux DÉRIVÉS de la banque (`exerciseType.levels`), comme ordre-grandeur.
   Exclue du sprint (comme les contraires #203) : c'est un JUGEMENT DE SENS (lire la
   phrase entière, choisir un sens parmi des idées distinctes), pas un automatisme à
   chronométrer — le chrono pousserait à deviner au 1er indice au lieu de relire le
   contexte, et pénaliserait la vitesse de lecture plutôt que le vocabulaire visé. */
const HOMONYMIE_LESSONS_DEFS: LessonDef[] = toLessonDefs(HOMONYMIE_LESSONS, {
	subject: 'francais',
	category: 'fr-vocabulaire',
	levels: (d) => d.exerciseType.levels ?? ['cm1'],
	excludeFromSprint: true,
});

/* ---------- Vocabulaire — familles de mots, préfixes, suffixes (#113, #244) ----------
   QCM de reconnaissance (3 options). Niveaux portés par la donnée (#244) : la leçon
   « familles, préfixes et suffixes » reste CE2 ; deux leçons CM1 séparent familles
   et affixes (préfixes savants + suffixes nominaux). */
const FAMILLES_LESSONS_DEFS: LessonDef[] = toLessonDefs(FAMILLES_LESSONS, {
	subject: 'francais',
	category: 'fr-vocabulaire',
	levels: (d) => d.levels,
});

/* ---------- Vocabulaire — champs lexicaux (#114) ----------
   Deux leçons sous la rubrique « Champs lexicaux » : « Le mot juste » (QCM 4
   options : définition → mot + intrus) et « Ranger par thème » (tri de tuiles
   dans deux thèmes, runner ui/lecon-tri.ts). */
const CHAMPS_LESSONS_DEFS: LessonDef[] = toLessonDefs(CHAMPS_LESSONS, {
	subject: 'francais',
	category: 'fr-vocabulaire',
	rubrique: 'Champs lexicaux',
});

/* ---------- Vocabulaire — contraires & mots de sens proche (#203, #244) ----------
   Leçons QCM (3 options) sous la rubrique « Synonymes et contraires », dans
   l'ordre pédagogique : contraires d'abord, puis sens proche. Mot-cible en gras
   dans une phrase courte ; consigne renforcée (picto ↔ / =) ; TTS mot-cible +
   options. Exclues du sprint (lecture d'une phrase + pression du chrono déconseillée
   pour les profils dys) : jouées en mode leçon/bilan/révision. Niveaux portés par
   la donnée (#244) : deux leçons CE2 + deux leçons CM1 (lexique plus exigeant). */
const SENS_LESSONS_DEFS: LessonDef[] = toLessonDefs(SENS_LESSONS, {
	subject: 'francais',
	category: 'fr-vocabulaire',
	levels: (d) => d.levels,
	rubrique: 'Synonymes et contraires',
	excludeFromSprint: true,
});

/* ---------- Grammaire — pronom sujet & accord sujet-verbe (#115) ----------
   2 leçons QCM ; les formes sont lues depuis la base de conjugaison. */
const GRAMMAIRE_SUJET_LESSONS_DEFS: LessonDef[] = toLessonDefs(GRAMMAIRE_SUJET_LESSONS, {
	subject: 'francais',
	category: 'fr-grammaire',
});

/* ---------- Grammaire — classes de mots, articles, adverbes (#116) ----------
   Leçon QCM d'étiquetage (banque interne étiquetée, hors listes du parent). */
const CLASSES_LESSONS_DEFS: LessonDef[] = toLessonDefs(CLASSES_LESSONS, {
	subject: 'francais',
	category: 'fr-grammaire',
});

/* ---------- Grammaire — « Clique sur le mot » (#259, #437) ----------
   Brique « clique sur le mot » : phrase rendue mot à mot, l'enfant sélectionne la
   cible d'une consigne. « Clique sur le verbe » (CE2 + CM1) plus 5 natures CM1
   (#437) : déterminant (article/possessif/démonstratif), conjonction de
   coordination, pronom personnel (sujet/complément), nom noyau du GN et sujet
   (composé compris). Runner d'écran dédié (ui/lecon-clic-mot.ts), hors sprint.
   Niveaux DÉRIVÉS du moteur (verbe ['ce2','cm1'], les 5 natures ['cm1']). */
const CLIC_MOT_LESSONS_DEFS: LessonDef[] = toLessonDefs(CLIC_MOT_LESSONS, {
	subject: 'francais',
	category: 'fr-grammaire',
	levels: (d) => d.exerciseType.levels ?? ['ce2'],
});

/* ---------- Grammaire — les phrases : ponctuation finale & types (#204) ----------
   2 leçons QCM regroupées sous la rubrique « Les phrases » : F1 « Quel point à la
   fin ? » (boutons-symboles `. ? !`) et F2 « Quel type de phrase ? ». Hors sprint
   (excludeFromSprint) : leur valeur tient au choix QCM / aux boutons-symboles et,
   pour F2, à des libellés multi-mots — pas à la saisie chronométrée. */
const PHRASES_LESSONS_DEFS: LessonDef[] = toLessonDefs(PHRASES_LESSONS, {
	subject: 'francais',
	category: 'fr-grammaire',
	// Niveaux portés par la donnée (#245) : ponctuation = CE2 ; « type » = CE2 + CM1 ;
	// « forme » et « transformation négative » = CM1. Défaut CE2 si non précisé.
	levels: (d) => d.levels ?? ['ce2'],
	rubrique: 'Les phrases',
	excludeFromSprint: true,
});

/* ---------- Catalogue des leçons « Calcul » (opérations posées, #97) ----------
   Items `kind: 'posed'` : la grille (cellules-chiffres notées une à une) est
   rendue par renderItem. Passent par les bilans/impression/révision ; exclues du
   sprint (une grille multi-cellules ne se joue pas « une réponse à la fois »). */
const CALCUL_LESSONS_DEFS: LessonDef[] = toLessonDefs(POSEE_LESSONS, {
	subject: 'math',
	category: 'math-calcul',
});

/* ---------- Catalogue des leçons « Géométrie » (figures planes, #100) ----------
   Clientes du moteur de figures SVG : reconnaissance visuelle (modes QCM/saisie)
   et propriétés/vocabulaire (QCM textuel). Figures planes / cercle / solides restent
   CE2 (défaut) ; « Les angles » est calibrée CE2+CM1 (#252, comparaison de deux angles
   au CM1) → ses niveaux sont DÉRIVÉS du moteur. On mappe les angles SÉPARÉMENT pour ne
   pas surfacer d'éventuels niveaux latents sur les autres leçons (ordre de déclaration
   préservé : figures → cercle → solides → angles). */
const GEOMETRIE_LESSONS_DEFS: LessonDef[] = [
	...toLessonDefs([...GEOMETRIE_LESSONS, ...CERCLE_LESSONS, ...SOLIDE_LESSONS], {
		subject: 'math',
		category: 'math-geometrie',
	}),
	...toLessonDefs(ANGLES_LESSONS, {
		subject: 'math',
		category: 'math-geometrie',
		levels: (d) => d.exerciseType.levels ?? ['ce2'],
	}),
];

/* ---------- Catalogue des leçons « Géométrie » CM1 (#242) ----------
   Contenu ADDITIF tagué CM1 (le CE2 est gelé) : triangles particuliers (reconnaissance +
   propriétés), quadrilatères dont le parallélogramme, solides dont le prisme,
   polyèdre/non-polyèdre et comptage faces/arêtes/sommets DE MÉMOIRE. Même traitement que
   les leçons de Géométrie CE2 (figures / QCM mono-réponse, compatibles bilan/sprint). */
const GEOMETRIE_CM1_LESSONS_DEFS: LessonDef[] = toLessonDefs(GEOMETRIE_CM1_LESSONS, {
	subject: 'math',
	category: 'math-geometrie',
	levels: ['cm1'],
});

/* ---------- Géométrie CM1 — Reconnaître une figure par ses propriétés (#253) ----------
   Figure NON nommée + codage visible ; on juge des propriétés lisibles (angle droit, côtés
   de même longueur, nombre de côtés). Deux modes : vrai/faux mono-propriété (runner QCM) et
   multi-sélection « coche toutes les propriétés » (runner dédié, tout-ou-rien). CM1-only,
   mappée SÉPARÉMENT (comme angles / durée écoulée) pour porter l'exclusion du sprint. */
const FIGURES_PROPRIETES_LESSONS_DEFS: LessonDef[] = toLessonDefs(FIGURES_PROPRIETES_LESSONS, {
	subject: 'math',
	category: 'math-geometrie',
	levels: ['cm1'],
	excludeFromSprint: (d) => d.excludeFromSprint,
});

/* ---------- Catalogue de la leçon « Symétrie axiale » (#201) ----------
   QCM mono-mode (oui/non + désigner le reflet A/B/C). Exclue du sprint
   chronométré : tâche visuo-spatiale de reconnaissance, sans pression de temps. */
const SYMETRIE_LESSONS_DEFS: LessonDef[] = toLessonDefs(SYMETRIE_LESSONS, {
	subject: 'math',
	category: 'math-geometrie',
	excludeFromSprint: (d) => d.excludeFromSprint,
});

/* ---------- Registre global ---------- */

const ALL_LESSONS: LessonDef[] = [
	...MATH_LESSONS,
	...MATH_LESSONS_CM1,
	...CALCUL_MENTAL_CM1_LESSONS_DEFS,
	...NUMERATION_LESSONS_DEFS,
	...DECIMAUX_LESSONS_DEFS,
	...DECIMAUX_ECRITURES_LESSONS_DEFS,
	...DROITE_GRADUEE_LESSONS_DEFS,
	...DONNEES_LESSONS_DEFS,
	...FRACTIONS_LESSONS_DEFS,
	...CALCUL_LESSONS_DEFS,
	...GRANDEURS_LESSONS,
	...GEOMETRIE_LESSONS_DEFS,
	...GEOMETRIE_CM1_LESSONS_DEFS,
	...FIGURES_PROPRIETES_LESSONS_DEFS,
	...SYMETRIE_LESSONS_DEFS,
	...PROBLEMES_LESSONS_DEFS,
	...DIVISION_LESSONS_DEFS,
	...FRENCH_LESSONS,
	...CONJ_META_LESSONS_DEFS,
	...ACCORD_LESSONS_DEFS,
	...ACCORD_CM1_LESSONS_DEFS,
	...PARTICIPE_LESSONS_DEFS,
	...ACCORD_GN_LESSONS_DEFS,
	...HOMOPHONE_LESSONS_DEFS,
	...MBP_LESSONS_DEFS,
	...VOCAB_LESSONS_DEFS,
	...SENS_FIGURE_LESSONS_DEFS,
	...HOMONYMIE_LESSONS_DEFS,
	...SENS_LESSONS_DEFS,
	...FAMILLES_LESSONS_DEFS,
	...CHAMPS_LESSONS_DEFS,
	...GRAMMAIRE_SUJET_LESSONS_DEFS,
	...CLASSES_LESSONS_DEFS,
	...CLIC_MOT_LESSONS_DEFS,
	...PHRASES_LESSONS_DEFS,
];

/* Classification par format (#348) : les leçons à runner d'écran dédié portent une
   étiquette déclarative `exerciseKind` (posée, rangement, tri, problème), lue ici au
   lieu d'appeler `generate()` — pas de calcul ni d'aléatoire global consommé lors du
   filtrage du sprint. Ces quatre formats sont incompatibles avec le sprint « une
   réponse à la fois » et en sont écartés (cf. filtre de ui/sprint.ts). */

/* Une opération posée (#97) se rend en grille multi-cellules : incompatible avec
   le sprint (« une réponse à la fois »), qui les exclut de son tirage. */
export function isPosedLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.exerciseKind === 'posed';
}

/* Une leçon « ranger une suite » (#108, ordre alphabétique) se joue en déplaçant
   plusieurs tuiles : interaction d'écran dédiée (ui/lecon-ordre.ts), incompatible
   avec le sprint « une réponse à la fois » → exclue de son tirage (comme la posée).
   Reste jouable en bilan/fiche/révision via le repli texte de genLessonItem. */
export function isOrderingLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.exerciseKind === 'tuilesOrdre';
}

/* Une leçon « ranger par thème » (#114, champs lexicaux) se joue en triant
   plusieurs tuiles dans deux colonnes : interaction d'écran dédiée
   (ui/lecon-tri.ts), incompatible avec le sprint « une réponse à la fois » →
   exclue de son tirage. Reste jouable en bilan/fiche/révision via le repli
   texte de genLessonItem (une tuile → « dans quel thème ? »). */
export function isTriLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.exerciseKind === 'tuilesTri';
}

/* Une leçon « Résolution de problèmes » (#199) : énoncé à lire + réflexion, jouée
   dans un runner dédié un problème à la fois. Lecture et raisonnement sont
   incompatibles avec la pression du chrono → exclue du sprint (comme la posée). */
export function isProblemeLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.exerciseKind === 'probleme';
}

/* Une leçon « appariement » (#392, relier des paires) se joue en reliant plusieurs
   mots dans un diagramme à deux colonnes : interaction d'écran dédiée
   (ui/lecon-appariement.ts), incompatible avec le sprint « une réponse à la fois »
   → exclue de son tirage. Reste jouable en bilan/fiche/révision via le repli texte
   de genLessonItem (une paire → « quel mot va avec X ? »). */
export function isPairingLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.exerciseKind === 'appariement';
}

/* Une leçon « Clique sur le mot » (#259) se joue en sélectionnant des mots dans
   une phrase : interaction d'écran dédiée (ui/lecon-clic-mot.ts), incompatible
   avec le sprint « une réponse à la fois » → exclue de son tirage. Reste jouable
   en bilan/fiche/révision via le repli texte de genLessonItem (phrase → « quel est
   le verbe ? »). */
export function isClicMotLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.exerciseKind === 'clicMot';
}

/* Une leçon « Droite graduée » (#256) se joue en plaçant un repère sur une graduation :
   interaction d'écran dédiée (ui/lecon-droite-graduee.ts), incompatible avec le sprint
   « une réponse à la fois » → exclue de son tirage. Reste jouable en bilan/fiche/révision
   via le repli LECTURE de genLessonItem (lire le nombre repéré). */
export function isDroiteGradueeLesson(lesson: LessonDef): boolean {
	return lesson.exerciseType.exerciseKind === 'droiteGraduee';
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
export function genLessonItem(lesson: LessonDef, level?: SchoolLevel): Item {
	if (isLegacyMathLesson(lesson)) {
		const item = bilanQ(MATH_LESSON_NUM[lesson.id])!;
		item._lesson = lesson.id;
		return item;
	}
	const ex = lesson.exerciseType.generate({ level });
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
	// Résolution de problèmes (#199) : le runner dédié (ui/lecon-probleme.ts) gère
	// l'énoncé + ses sous-questions. Repli TEXTE pour bilan/révision : énoncé +
	// question finale en gras, réponse = dernière étape (les étapes intermédiaires
	// ne sont pas corrigées hors du runner dédié).
	if (ex.type === 'probleme') {
		const last = ex.etapes[ex.etapes.length - 1];
		return {
			text: `${ex.enonce} **${last.question}** @`,
			// Réponse en écriture à virgule française (#255 : les problèmes CM1 ont des
			// réponses décimales). `checkNumerique` tolère virgule/point des deux côtés ;
			// un entier est inchangé (« 42 ».replace('.',',') === « 42 »).
			answer: String(last.answer).replace('.', ','),
			kind: 'num',
			// Texte lu aligné sur l'AFFICHÉ du repli (énoncé + question finale), sans la
			// sous-question intermédiaire — absente de l'écran en bilan/révision.
			parle: `${ex.enonce} ${last.question}`,
			_lesson: lesson.id,
		};
	}
	// Appariement (#392) : l'interaction (relier deux colonnes) vit dans son runner
	// (ui/lecon-appariement.ts). Repli TEXTE non interactif pour fiche/bilan/révision :
	// une paire tirée au sort → « quel mot va avec X ? », réponse = le mot droite.
	if (ex.type === 'appariement') {
		const p = ex.paires[0]; // l'ordre des paires est déjà mélangé à la génération
		return {
			text: `Quel mot va avec « ${p.gauche} » ? @`,
			answer: p.droite,
			kind: 'text',
			_lesson: lesson.id,
		};
	}
	// « Clique sur le mot » (#259, #437) : l'interaction (sélectionner des mots dans une
	// phrase) vit dans son runner (ui/lecon-clic-mot.ts). Repli TEXTE non interactif pour
	// fiche/bilan/révision : on montre la phrase et on attend le(s) mot(s)-cible recopié(s)
	// (stockés, jamais recalculés). La consigne est NEUTRE (dérivée de `cibleLabel`, valable
	// pour toutes les natures et tous les genres : verbe, article, nom noyau, conjonction…).
	if (ex.type === 'clicMot') {
		// Jointure PARTAGÉE avec le runner (helper libelleCible) : « et » si la cible n'est pas
		// contiguë (sujet composé, ni…ni), sinon la réponse stockée serait « Emma Chloé »/« ni ni »
		// et une recopie naturelle (« Emma et Chloé ») serait comptée fausse en révision.
		const motsCible = libelleCible(ex.tokens, ex.cibleIndices);
		const quoi = ex.cibleLabel ?? 'le mot demandé';
		return {
			text: `Recopie ${quoi} : « ${joindrePhrase(ex.tokens)} » @`,
			answer: motsCible,
			kind: 'text',
			parle: `Recopie ${quoi}. ${ex.parle}`,
			_lesson: lesson.id,
		};
	}
	// Droite graduée (#256) : l'interaction (placer un repère) vit dans son runner
	// (ui/lecon-droite-graduee.ts). Repli LECTURE non interactif pour fiche/bilan/révision :
	// on montre la droite avec le repère POSÉ à la cible et on demande de LIRE le nombre
	// repéré (réponse = le libellé de la cible, stocké). La description SVG ne révèle pas la
	// valeur (position à lire) ; la réponse numérique tolère espaces/virgule (checkItemAnswer).
	if (ex.type === 'droiteGraduee') {
		// Passe par le dispatch FigureSpec (#256) plutôt que d'appeler le renderer en direct :
		// le variant `droiteGraduee` a ainsi un vrai consommateur (pas de généricité morte) et
		// tombe sous la couverture de tests du dispatch.
		const figure = renderFigure({
			kind: 'droiteGraduee',
			min: ex.min,
			max: ex.max,
			pas: ex.pas,
			bornes: ex.bornes,
			reperes: [{ valeur: ex.cible }],
			desc: 'Une droite graduée avec un repère à lire.',
		});
		return {
			text: 'Quel nombre est repéré sur la droite graduée ? @',
			answer: ex.cibleLabel,
			kind: 'num',
			figure,
			parle: 'Quel nombre est repéré sur la droite graduée ?',
			_lesson: lesson.id,
		};
	}
	// Multi-sélection (#253) : l'interaction (cocher plusieurs propriétés) vit dans son
	// runner (ui/lecon-qcm-multi.ts). Ce repli n'est normalement PAS atteint (le mode par
	// défaut de la leçon est le vrai/faux mono-réponse, qui produit un `qcm`) ; par sûreté
	// de type et pour un bilan éventuel, on retombe sur UNE proposition jugée vrai/faux
	// (justesse LUE dans `correctes`, jamais recalculée).
	if (ex.type === 'qcmMulti') {
		const prop = ex.propositions[0];
		return {
			text: `Vrai ou faux ? ${prop}`,
			answer: ex.correctes.includes(prop) ? 'Vrai' : 'Faux',
			kind: 'text',
			figure: ex.figure,
			parle: ex.parle,
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
	// Texte lu à voix haute (#42) si l'énoncé est télégraphique (cf. tts-text).
	const parle = 'parle' in ex ? ex.parle : undefined;
	// Choix d'un QCM (#289) : conservés pour le rendu PAPIER en cases à cocher (jetés
	// jusqu'ici). `choicesView` (vue riche : fraction empilée, terminaison, image) suit
	// `choices` par index. Le runner d'écran n'en dépend pas (il lit l'Exercise).
	const choices = ex.type === 'qcm' ? ex.choices : undefined;
	const choicesView = ex.type === 'qcm' ? ex.choicesView : undefined;
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
		return {
			text: question,
			answer: ex.answer,
			answers,
			kind,
			figure,
			parle,
			choices,
			choicesView,
			_lesson: lesson.id,
		};
	}
	return {
		text: question,
		answer: ex.answer,
		answers: ex.type === 'text' ? ex.answers : undefined,
		kind: 'text',
		figure,
		parle,
		choices,
		choicesView,
		_lesson: lesson.id,
	};
}

export function getLessonById(id: string): LessonDef | undefined {
	return ALL_LESSONS.find((l) => l.id === id);
}

/* Leçons d'une matière. Avec un niveau, le résultat est filtré ET trié selon
   l'ordre pédagogique de ce niveau (#208) ; sans niveau, ordre de déclaration. */
export function getLessonsBySubject(subjectId: SubjectId, niveau?: SchoolLevel): LessonDef[] {
	const lessons = ALL_LESSONS.filter(
		(l) => l.subject === subjectId && (!niveau || l.levels.includes(niveau)),
	);
	return niveau ? trierParOrdre(lessons, niveau) : lessons;
}

/* Leçons d'une catégorie. Avec un niveau, filtré ET trié selon l'ordre
   pédagogique (#208) ; sans niveau, ordre de déclaration (composeur/sprint). */
export function getLessonsByCategory(categoryId: CategoryId, niveau?: SchoolLevel): LessonDef[] {
	const lessons = ALL_LESSONS.filter(
		(l) => l.category === categoryId && (!niveau || l.levels.includes(niveau)),
	);
	return niveau ? trierParOrdre(lessons, niveau) : lessons;
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
