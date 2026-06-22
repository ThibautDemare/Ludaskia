/* ============================================================
   Symétrie axiale — « Le miroir magique » (GEOM3, #201).
   Cliente du moteur de figures SVG (core/figures.ts). UNE leçon mêlant
   trois formats de question, tous en RECONNAISSANCE (attendu CE2 : on
   reconnaît un axe, on ne trace pas). Ratios validés (gamification-enfant) :
   - cœur (~60 %) : format 3 « quel est le vrai reflet ? » → désigner parmi
     trois images A/B/C (la réussite au hasard tombe à 1/3, le geste devient
     actif) ;
   - variété (~25 %) : format 2 « ce trait est-il un axe ? » → oui/non, avec
     le piège classique « la diagonale d'un rectangle n'est pas un axe » ;
   - amorce (~15 %) : format 1 « cette figure a-t-elle un axe ? » → oui/non.

   Distracteurs du format 3 (avis pedagogue-primaire) : une image « glissée »
   (translation, même sens) et une image « tournée » (demi-tour), à distinguer
   du reflet (retourné). Ce sont de VRAIES confusions à corriger, pas des pièges
   métriques invisibles. Explications toujours renvoyées au geste de pliage /
   au miroir (seul outil de vérification d'un CE2). Mono-mode QCM ; exclue du
   sprint chronométré (tâche visuo-spatiale, pas de course contre la montre).
   ============================================================ */
import type { ChoiceView, Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import type { SymAxis, SymMotif, SymShape, SymTransform } from '../../core/figures';
import { renderFigure } from '../../core/figures';
import { choice, normalizeText, rnd, sample } from '../../core/utils';

const MODES: ModeOption[] = [
	{ id: 'qcm', label: 'Je choisis la bonne réponse', icon: 'hand-pointing', recommended: true },
];

/* Axes de symétrie RÉELS de chaque figure (source de vérité des réponses).
   Le rectangle n'a que les médianes (v, h) — surtout PAS ses diagonales. */
const AXES: Record<SymShape, SymAxis[]> = {
	carre: ['v', 'h', 'd1', 'd2'],
	rectangle: ['v', 'h'],
	triangleIso: ['v'],
	losange: ['v', 'h'],
	papillon: ['v'],
	coeur: ['v'],
	lettreA: ['v'],
	lettreH: ['v', 'h'],
	lettreT: ['v'],
	triangleScalene: [],
	fanion: [],
	lettreF: [],
	lettreL: [],
};

interface Fait {
	base: string;
	answer: string;
	choices: string[];
	choicesView?: ChoiceView[]; // affichage riche des choix (figures-images du format 3)
	figure: string;
	explication: string;
	parle: string;
}

/* ---------- Format 1 : amorce « a-t-elle un axe de symétrie ? » ---------- */

const F1_OUI: SymShape[] = [
	'carre',
	'rectangle',
	'triangleIso',
	'losange',
	'papillon',
	'coeur',
	'lettreA',
	'lettreH',
	'lettreT',
];
const F1_NON: SymShape[] = ['triangleScalene', 'fanion', 'lettreF', 'lettreL'];

function faitAmorce(): Fait {
	const oui = rnd(1, 100) <= 55;
	const shape = oui ? choice(F1_OUI) : choice(F1_NON);
	return {
		base: 'Cette figure a-t-elle un axe de symétrie ?',
		answer: oui ? 'Oui' : 'Non',
		choices: ['Oui', 'Non'],
		figure: renderFigure({ kind: 'symJuger', shape }),
		parle: 'Cette figure a-t-elle un axe de symétrie ? Réponds par oui ou par non.',
		explication: oui
			? "On peut la plier en deux moitiés qui se posent l'une sur l'autre : elle a bien un axe de symétrie."
			: "On ne peut pas la plier en deux moitiés identiques : elle n'a pas d'axe de symétrie.",
	};
}

/* ---------- Format 2 : « ce trait est-il un axe de symétrie ? » ---------- */

interface Pair {
	shape: SymShape;
	axis: SymAxis;
	trap?: boolean; // piège « diagonale du rectangle »
}

const F2_OUI: Pair[] = [
	{ shape: 'rectangle', axis: 'v' },
	{ shape: 'rectangle', axis: 'h' },
	{ shape: 'carre', axis: 'v' },
	{ shape: 'carre', axis: 'd1' },
	{ shape: 'triangleIso', axis: 'v' },
	{ shape: 'papillon', axis: 'v' },
	{ shape: 'lettreH', axis: 'h' },
	{ shape: 'losange', axis: 'v' },
];
const F2_NON: Pair[] = [
	{ shape: 'rectangle', axis: 'd1', trap: true },
	{ shape: 'rectangle', axis: 'd2', trap: true },
	{ shape: 'triangleIso', axis: 'h' },
	{ shape: 'lettreA', axis: 'h' },
	{ shape: 'losange', axis: 'd1' },
	{ shape: 'triangleIso', axis: 'd1' },
];

/** Source de vérité de la correction du format 2 : ce trait est-il un axe de
    symétrie de cette figure ? (Exporté pour être testé — notamment le piège
    « diagonale du rectangle » → false.) */
export function axeEstDeSymetrie(shape: SymShape, axis: SymAxis): boolean {
	return AXES[shape].includes(axis);
}

function faitAxe(): Fait {
	const pair = rnd(1, 100) <= 50 ? choice(F2_OUI) : choice(F2_NON);
	// La réponse dérive TOUJOURS des axes réels (les listes ne sont qu'un cadrage).
	const ok = axeEstDeSymetrie(pair.shape, pair.axis);
	const explication = ok
		? "En pliant sur ce trait, les deux moitiés se posent l'une sur l'autre : c'est bien un axe de symétrie."
		: pair.trap
			? "Si on plie le rectangle sur sa diagonale, les deux morceaux ne se posent pas l'un sur l'autre : ce n'est pas un axe de symétrie."
			: "Si on plie sur ce trait, les deux côtés ne se posent pas l'un sur l'autre : ce n'est pas un axe de symétrie.";
	return {
		base: 'Le trait en pointillé est-il un axe de symétrie ?',
		answer: ok ? 'Oui' : 'Non',
		choices: ['Oui', 'Non'],
		figure: renderFigure({ kind: 'symJuger', shape: pair.shape, axis: pair.axis }),
		parle: 'Le trait en pointillé est-il un axe de symétrie ? Réponds par oui ou par non.',
		explication,
	};
}

/* ---------- Format 3 : « quel est le vrai reflet ? » (cœur) ---------- */

// #286 : 5 motifs chiraux (× 2 axes) pour casser la répétition visuelle du format 3.
const MOTIFS: SymMotif[] = ['drapeau', 'botte', 'lettreF', 'poisson', 'chaussure'];
// Valeurs (clé de correction) ET libellés parlés des choix : positionnels et neutres
// (ne soufflent pas la réponse). Les images sont rendues dans `choicesView`.
const POSITIONS = ['la première image', 'la deuxième image', 'la troisième image'];

function faitReflet(): Fait {
	const motif = choice(MOTIFS);
	const axis = choice<'v' | 'h'>(['v', 'v', 'h']); // vertical un peu plus fréquent (plus facile)
	const transforms = sample<SymTransform>(['reflet', 'glisse', 'tourne'], 3);
	// Chaque choix est une SCÈNE cliquable (figure de départ + miroir + image), pour
	// que l'enfant VÉRIFIE le pliage au lieu d'imaginer le reflet (avis pédagogue).
	// La valeur reste positionnelle (correction + récapitulatif).
	const choicesView: ChoiceView[] = transforms.map((t, i) => ({
		html: renderFigure({ kind: 'symImage', motif, axis, t }),
		label: POSITIONS[i].charAt(0).toUpperCase() + POSITIONS[i].slice(1),
	}));
	// `'reflet'` est toujours présent (sample des trois transformations) → indexOf ≥ 0.
	const answer = POSITIONS[transforms.indexOf('reflet')];
	return {
		// Énoncé NEUTRE en modalité (#289) : pas de verbe tactile (« Touche ») — la
		// fiche imprimée doit pouvoir se cocher au crayon, et la question marche aussi
		// bien à l'écran (l'enfant désigne l'image) que sur papier.
		base: 'Quelle image montre le vrai reflet de la figure dans le miroir ?',
		answer,
		choices: POSITIONS.slice(),
		choicesView,
		figure: renderFigure({ kind: 'symMiroir', motif, axis }),
		parle:
			'Observe la figure et son miroir. Parmi les trois images, laquelle montre le vrai reflet de la figure dans le miroir ?',
		explication: `Le bon reflet est ${answer} : la figure y est retournée, comme dans un vrai miroir. Dans les autres, elle est seulement glissée (déplacée sans être retournée) ou tournée.`,
	};
}

/* ---------- Type d'exercice ---------- */

function symetrieType(): ExerciseType {
	return {
		modes: MODES,
		generate(): Exercise {
			const r = rnd(1, 100);
			const f = r <= 15 ? faitAmorce() : r <= 40 ? faitAxe() : faitReflet();
			return {
				type: 'qcm',
				question: f.base,
				answer: f.answer,
				choices: f.choices,
				choicesView: f.choicesView,
				figure: f.figure,
				explication: f.explication,
				parle: f.parle,
			};
		},
		check(exercise: Exercise, input: string): boolean {
			if (exercise.type !== 'qcm') return false;
			return normalizeText(input) === normalizeText(exercise.answer);
		},
	};
}

/* ---------- Descripteur ---------- */

export interface SymetrieLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
	excludeFromSprint?: boolean;
}

export const SYMETRIE_LESSONS: SymetrieLessonDef[] = [
	{
		id: 'geo-symetrie-axiale',
		label: 'Le miroir magique (symétrie)',
		exerciseType: symetrieType(),
		excludeFromSprint: true,
	},
];
