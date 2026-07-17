/* ============================================================
   Géométrie CM1 — Reconnaître une figure par ses propriétés (#253).
   ------------------------------------------------------------
   Contenu ADDITIF tagué CM1 (le CE2 est gelé). On montre une figure NON NOMMÉE avec
   son CODAGE visible (angles droits marqués, côtés marqués égaux) et on juge des
   propriétés DIRECTEMENT LISIBLES sur ce codage. Clientes du moteur de figures SVG
   (core/figures.ts), figures issues du répertoire codé partagé (`codage: true`, #326).

   INVARIANTS (déjà tranchés — pedagogue-primaire) :
   - JAMAIS de nom de figure dans un énoncé ou une proposition (« est un carré /
     rectangle / losange » = INTERDIT : ce serait réintroduire l'inclusion, écartée
     deux fois dans le projet). On ne parle QUE de propriétés (angles, côtés).
   - JAMAIS de propriété NON codée sur la figure. On se limite donc aux faits que le
     codage `#326` rend explicites (angle droit = carré de codage ; longueurs de côtés =
     tirets ; parallélisme des côtés opposés = chevrons, #253) et au NOMBRE de côtés
     (toujours directement dénombrable). Les diagonales (hors codage, hors programme CM1)
     sont EXCLUES.
   - Pas de double négation : toutes les affirmations sont POSITIVES.

   PARALLÉLISME (#253, ajouté sur décision du mainteneur) : propriété « Les côtés opposés
   sont parallèles », codée par des CHEVRONS (marqueParallele / SHAPE_MARQUES_PARALLELES,
   quadrilatères uniquement — une paire = chevron simple, l'autre = chevron double). Le
   `quadrilatereQuelconque` (aucune marque) fournit le contre-exemple FAUX indispensable :
   sans lui, la propriété serait TOUJOURS vraie sur le pool carré/rectangle/losange/
   parallélogramme et ne discriminerait rien. Le trapèze est EXCLU (hors périmètre CM1 et
   ambiguïté « une paire / deux paires »). Rectangle et parallélogramme portent désormais
   deux marques par côté (tiret d'égalité + chevron).

   DEUX MODES (ExerciseType.modes) :
   - `qcm` (RECOMMANDÉ, défaut) : Vrai / Faux mono-propriété, sur le runner QCM existant.
   - `coche` : multi-sélection « coche toutes les propriétés qui s'appliquent » (exactement
     4 propositions, ≥ 1 vraie ET ≥ 1 fausse), sur le runner dédié ui/lecon-qcm-multi.ts,
     correction TOUT-OU-RIEN. NON recommandé (inversion assumée : ne pas rendre l'étoile
     plus dure par défaut).
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import type { LessonInput } from '../_shared';
import type { PlaneShape } from '../../core/figures';
import { renderFigure } from '../../core/figures';
import { choice, sample } from '../../core/utils';

const NIVEAUX: SchoolLevel[] = ['cm1'];

/* ---------- Répertoire des propriétés codées ---------- */

/* Identifiants des propriétés jugeables. Chaque texte est une affirmation POSITIVE,
   sans nom de figure. `deuxEgaux` = « au moins deux côtés de même longueur » (distinct de
   `tousEgaux`, pour ne jamais dépendre d'une lecture « exactement 2 » ambiguë). */
type PropId =
	| 'angleDroit'
	| 'quatreAnglesDroits'
	| 'tousEgaux'
	| 'deuxEgaux'
	| 'longueursDiff'
	| 'opposesParalleles'
	| 'troisCotes'
	| 'quatreCotes';

const PROP_TEXTE: Record<PropId, string> = {
	angleDroit: 'Cette figure a au moins un angle droit.',
	quatreAnglesDroits: 'Cette figure a quatre angles droits.',
	tousEgaux: 'Tous les côtés ont la même longueur.',
	deuxEgaux: 'Au moins deux côtés ont la même longueur.',
	longueursDiff: 'Cette figure a au moins deux côtés de longueurs différentes.',
	// Parallélisme (#253) : réservé aux quadrilatères (jamais posé sur un triangle). Codé
	// par des chevrons sur les côtés opposés.
	opposesParalleles: 'Les côtés opposés sont parallèles.',
	troisCotes: 'Cette figure a trois côtés.',
	quatreCotes: 'Cette figure a quatre côtés.',
};

/* Le couple angle droit / quatre angles droits est REDONDANT (l'un implique/exclut
   l'autre à l'œil) : en multi-sélection on n'en garde qu'UN par question. */
const GROUPE_ANGLE: PropId[] = ['angleDroit', 'quatreAnglesDroits'];

interface FigureCodee {
	shape: PlaneShape;
	// Faits UNIQUEMENT ceux que le codage `#326` de la forme rend explicites (pas de
	// propriété non codée). La réponse est ainsi lisible sans deviner.
	faits: Partial<Record<PropId, boolean>>;
}

/* Chaque forme avec ses faits codés (cf. SHAPE_MARQUES_COTES / SHAPE_ANGLES_DROITS de
   core/figures/polygones.ts). Le triangle rectangle a deux côtés égaux (isocèle
   rectangle par construction) mais NON marqués de tirets → `deuxEgaux` est OMIS pour lui
   (propriété non codée). Exportée pour permettre aux tests d'épingler la table de vérité
   forme par forme (« carré → parallèles = Vrai »), pas seulement par ses conséquences. */
export const FIGURES: FigureCodee[] = [
	{
		shape: 'carre',
		faits: {
			angleDroit: true,
			quatreAnglesDroits: true,
			tousEgaux: true,
			deuxEgaux: true,
			longueursDiff: false,
			opposesParalleles: true,
			troisCotes: false,
			quatreCotes: true,
		},
	},
	{
		shape: 'rectangle',
		faits: {
			angleDroit: true,
			quatreAnglesDroits: true,
			tousEgaux: false,
			deuxEgaux: true,
			longueursDiff: true,
			opposesParalleles: true,
			troisCotes: false,
			quatreCotes: true,
		},
	},
	{
		shape: 'losange',
		faits: {
			angleDroit: false,
			quatreAnglesDroits: false,
			tousEgaux: true,
			deuxEgaux: true,
			longueursDiff: false,
			opposesParalleles: true,
			troisCotes: false,
			quatreCotes: true,
		},
	},
	{
		shape: 'parallelogramme',
		faits: {
			angleDroit: false,
			quatreAnglesDroits: false,
			tousEgaux: false,
			deuxEgaux: true,
			longueursDiff: true,
			opposesParalleles: true,
			troisCotes: false,
			quatreCotes: true,
		},
	},
	{
		shape: 'triangleEquilateral',
		faits: {
			angleDroit: false,
			tousEgaux: true,
			deuxEgaux: true,
			longueursDiff: false,
			troisCotes: true,
			quatreCotes: false,
		},
	},
	{
		shape: 'triangleIsocele',
		faits: {
			angleDroit: false,
			tousEgaux: false,
			deuxEgaux: true,
			longueursDiff: true,
			troisCotes: true,
			quatreCotes: false,
		},
	},
	{
		shape: 'triangleRectangle',
		faits: {
			angleDroit: true,
			tousEgaux: false,
			longueursDiff: true,
			troisCotes: true,
			quatreCotes: false,
		},
	},
	{
		shape: 'triangleQuelconque',
		faits: {
			angleDroit: false,
			tousEgaux: false,
			deuxEgaux: false,
			longueursDiff: true,
			troisCotes: true,
			quatreCotes: false,
		},
	},
	// Quadrilatère quelconque (#253) : le contre-exemple INDISPENSABLE de « côtés opposés
	// parallèles » (sans lui, la propriété serait toujours vraie sur le pool). Aucune marque
	// de codage (aucun angle droit, aucun côté égal, aucun côté parallèle).
	{
		shape: 'quadrilatereQuelconque',
		faits: {
			angleDroit: false,
			quatreAnglesDroits: false,
			tousEgaux: false,
			deuxEgaux: false,
			longueursDiff: true,
			opposesParalleles: false,
			troisCotes: false,
			quatreCotes: true,
		},
	},
];

/* Rotation par forme (avis designer #242, repris) : on varie l'orientation sans rendre
   le codage illisible. Jamais 45° pour le carré (indécidable vs losange) ; pas de vraie
   rotation du parallélogramme. */
function rotationFigure(shape: PlaneShape): number {
	switch (shape) {
		case 'carre':
			return choice([0, 0, 30, 35]);
		case 'rectangle':
			return choice([0, 0, 15, -15]);
		case 'losange':
			return choice([0, 0, 90]);
		case 'parallelogramme':
			return 0;
		case 'triangleEquilateral':
			return choice([0, 0, 180, 20, -20]);
		case 'triangleIsocele':
			return choice([0, 0, 180, 15, -15]);
		case 'triangleRectangle':
			return choice([0, 90, 180, 270]);
		case 'quadrilatereQuelconque':
			return choice([0, 0, 15, -15]);
		default:
			return choice([0, 0, 20, -20]);
	}
}

function figureSvg(shape: PlaneShape): string {
	return renderFigure({
		kind: 'figurePlane',
		shape,
		rotation: rotationFigure(shape),
		codage: true,
		// Chevrons de parallélisme (#253) : le renderer ne les dessine que sur les
		// quadrilatères réguliers (table SHAPE_MARQUES_PARALLELES) ; sans effet sur les
		// triangles et le quadrilatère quelconque.
		parallelisme: true,
	});
}

/* ---------- Mode 1 : Vrai / Faux mono-propriété (runner QCM existant) ----------
   Réponse ['Vrai','Faux'] à positions STABLES (accessibilité) ; la bonne réponse est LUE
   dans le fait stocké de la figure (jamais recalculée). */
export function figureVraiFauxExercise(): Exercise {
	const fig = choice(FIGURES);
	const ids = Object.keys(fig.faits) as PropId[];
	const id = choice(ids);
	const vrai = fig.faits[id] === true;
	return {
		type: 'qcm',
		question: `Vrai ou faux ? ${PROP_TEXTE[id]}`,
		answer: vrai ? 'Vrai' : 'Faux',
		choices: ['Vrai', 'Faux'],
		figure: figureSvg(fig.shape),
		parle: `Vrai ou faux ? ${PROP_TEXTE[id]}`,
	};
}

/* ---------- Mode 2 : multi-sélection « coche toutes les propriétés » ----------
   Exactement 4 propositions, ≥ 1 vraie ET ≥ 1 fausse ; le nombre de vraies varie de 1 à 3
   (viser ~2 en moyenne). L'ensemble des VRAIES est STOCKÉ (`correctes`), jamais recalculé
   au check. */
const NB_PROPS = 4;

/* Nombre de vraies parmi 4, borné par la disponibilité, pondéré vers 2. */
function choisirK(kMin: number, kMax: number): number {
	const candidats = [1, 2, 2, 3].filter((k) => k >= kMin && k <= kMax);
	return candidats.length ? choice(candidats) : kMin;
}

export function figureMultiExercise(): Exercise {
	const fig = choice(FIGURES);
	let ids = Object.keys(fig.faits) as PropId[];
	// Collapse du groupe « angle » : au plus UNE des deux affirmations d'angle droit.
	if (GROUPE_ANGLE.every((g) => fig.faits[g] !== undefined)) {
		const garde = choice(GROUPE_ANGLE);
		ids = ids.filter((i) => !GROUPE_ANGLE.includes(i) || i === garde);
	}
	const vrais = ids.filter((i) => fig.faits[i] === true);
	const faux = ids.filter((i) => fig.faits[i] === false);
	const kMin = Math.max(1, NB_PROPS - faux.length);
	const kMax = Math.min(3, vrais.length);
	const k = choisirK(kMin, kMax);
	const choisiesVraies = sample(vrais, k);
	const choisiesFausses = sample(faux, NB_PROPS - k);
	// Ordre d'affichage mélangé UNE fois à la génération, puis STABLE (le runner ne
	// réordonne jamais — plan moteur des enfants dyspraxiques).
	const propositions = sample([...choisiesVraies, ...choisiesFausses], NB_PROPS).map(
		(i) => PROP_TEXTE[i],
	);
	const correctes = choisiesVraies.map((i) => PROP_TEXTE[i]);
	return {
		type: 'qcmMulti',
		question: 'Coche toutes les propriétés qui sont vraies pour cette figure.',
		propositions,
		correctes,
		figure: figureSvg(fig.shape),
		parle: 'Coche toutes les propriétés qui sont vraies pour cette figure.',
	};
}

/* ---------- Modes + fabrique ---------- */

const MODE_VRAI_FAUX: ModeOption = {
	id: 'qcm',
	label: 'Vrai ou faux',
	hint: 'une propriété à la fois',
	icon: 'hand-pointing',
	recommended: true,
};
const MODE_MULTI: ModeOption = {
	id: 'coche',
	label: 'Coche les bonnes propriétés',
	hint: "toutes les propriétés d'un coup",
	icon: 'check-square',
	recommended: false,
};

function figuresProprietesType(): ExerciseType {
	return {
		levels: NIVEAUX,
		modes: [MODE_VRAI_FAUX, MODE_MULTI],
		consigne: 'Observe le codage de la figure (angles droits, côtés égaux, côtés parallèles).',
		generate(opts?: GenerateOpts): Exercise {
			// `coche` → multi-sélection ; sinon (défaut / genLessonItem / bilan) → vrai/faux.
			return opts?.mode === 'coche' ? figureMultiExercise() : figureVraiFauxExercise();
		},
		check: checkAnswer,
	};
}

/* Étend `LessonInput` pour porter l'exclusion du sprint (comme la divisibilité). */
export interface FigureLessonDef extends LessonInput {
	excludeFromSprint?: boolean;
}

export const FIGURES_PROPRIETES_LESSONS: FigureLessonDef[] = [
	{
		id: 'geo-cm1-figures-proprietes',
		label: 'Reconnaître une figure par ses propriétés',
		exerciseType: figuresProprietesType(),
		// Le mode par défaut est un vrai/faux devinable à 50 % : sous la pression du chrono,
		// le sprint récompenserait le spam → exclue du sprint (comme les QCM oui/non).
		excludeFromSprint: true,
	},
];
