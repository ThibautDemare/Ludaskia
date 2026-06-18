/* ============================================================
   Géométrie — Les angles (#202).
   Cliente du moteur de figures SVG (core/figures.ts, `renderAngle`).
   Une leçon `geo-angles`, QCM mono-mode. Trois « temps » de difficulté
   croissante, tirés à chaque question selon une pondération CE2 (avis
   pedagogue : 40 / 35 / 25) :
   - Temps 1 — « Cet angle est-il un angle droit ? » (Oui / Non) ;
   - Temps 2 — « Compare cet angle à l'angle droit. » (plus petit / égal / plus grand) ;
   - Temps 3 — « Cet angle est-il aigu, droit ou obtus ? » (Aigu / Droit / Obtus).
   Le VOCABULAIRE (aigu / obtus) n'arrive qu'au temps 3, après comparaison ;
   une bulle d'aide l'ancre alors sur la comparaison (jamais sur une mesure).

   Calibrage CE2 (programme 2025, avis pedagogue) : on reconnaît À L'ŒIL et on
   compare à l'angle droit, SANS degrés ni « 90° ». Aigu ~30–60°, droit 90° (avec
   le carré de codage, posé d'office par le renderer), obtus ~115–150° ; la zone
   indécidable (~80–100°) et les quasi-plats (>170°) sont bannis ; orientations
   variées. La mesure au rapporteur relève du CM1 (future leçon).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { renderFigure } from '../../core/figures';
import { rnd, choice, sample, normalizeText } from '../../core/utils';

const MODES: ModeOption[] = [
	{ id: 'qcm', label: 'Je choisis la bonne réponse', icon: 'hand-pointing', recommended: true },
];

type Categorie = 'aigu' | 'droit' | 'obtus';

/* Ouverture (degrés, JAMAIS affichée) par catégorie : marge nette autour de
   l'angle droit pour que le jugement à l'œil reste loyal au CE2. */
function ouverture(cat: Categorie): number {
	if (cat === 'droit') return 90;
	if (cat === 'aigu') return rnd(30, 60);
	return rnd(115, 150); // obtus
}

/* Orientation : bissectrice tirée par pas de 15° sur tout le tour → l'angle droit
   n'est jamais réduit à « horizontal + vertical » (un CE2 confond droit/vertical). */
function bissectrice(): number {
	return rnd(0, 23) * 15;
}

function figureAngle(cat: Categorie): string {
	return renderFigure({ kind: 'angle', opening: ouverture(cat), bisector: bissectrice() });
}

/* Bulle d'aide du temps 3 : ancre le vocabulaire sur la comparaison à l'angle
   droit (apostrophe droite — convention projet ; flèche plutôt que `=` pour ne pas
   évoquer l'égalité d'angles). */
const AIDE_TEMPS3 =
	'<p class="angle-aide">plus petit que l\'angle droit → aigu · plus grand → obtus</p>';

/* Temps 1 — reconnaître l'angle droit (à son carré de codage). Oui/Non équilibrés
   (50 % droit, sinon aigu ou obtus) pour ne pas récompenser un « Non » systématique. */
function temps1(): Exercise {
	const estDroit = rnd(1, 2) === 1;
	const cat: Categorie = estDroit ? 'droit' : choice(['aigu', 'obtus']);
	return {
		type: 'qcm',
		question: 'Cet angle est-il un angle droit ?',
		answer: estDroit ? 'Oui' : 'Non',
		choices: sample(['Oui', 'Non'], 2),
		figure: figureAngle(cat),
		explication: estDroit
			? "Oui : le petit carré marque l'angle droit."
			: "Non : cet angle n'est pas comme le coin d'une feuille.",
	};
}

/* Temps 2 — comparer à l'angle droit (sans le nommer). « égal » reste une bonne
   réponse loyale : l'angle droit porte son carré de codage, qui rend l'égalité
   décidable à l'œil. */
function temps2(): Exercise {
	const cat: Categorie = choice(['aigu', 'droit', 'obtus']);
	const answer = cat === 'aigu' ? 'plus petit' : cat === 'droit' ? 'égal' : 'plus grand';
	return {
		type: 'qcm',
		question: "Compare cet angle à l'angle droit.",
		answer,
		choices: sample(['plus petit', 'égal', 'plus grand'], 3),
		figure: figureAngle(cat),
		explication:
			cat === 'aigu'
				? "Cet angle est plus petit que l'angle droit."
				: cat === 'droit'
					? "Cet angle est égal à l'angle droit : le petit carré le montre."
					: "Cet angle est plus grand que l'angle droit.",
	};
}

/* Temps 3 — nommer (aigu / droit / obtus), avec la bulle d'aide. */
function temps3(): Exercise {
	const cat: Categorie = choice(['aigu', 'droit', 'obtus']);
	const answer = cat === 'aigu' ? 'Aigu' : cat === 'droit' ? 'Droit' : 'Obtus';
	return {
		type: 'qcm',
		question: 'Cet angle est-il aigu, droit ou obtus ?',
		answer,
		choices: sample(['Aigu', 'Droit', 'Obtus'], 3),
		figure: figureAngle(cat) + AIDE_TEMPS3,
		explication:
			cat === 'aigu'
				? "Plus petit que l'angle droit, c'est un angle aigu."
				: cat === 'droit'
					? "Avec le petit carré, c'est un angle droit."
					: "Plus grand que l'angle droit, c'est un angle obtus.",
	};
}

function anglesType(): ExerciseType {
	return {
		modes: MODES,
		generate(): Exercise {
			const r = rnd(1, 100);
			return r <= 40 ? temps1() : r <= 75 ? temps2() : temps3(); // 40 / 35 / 25
		},
		check(exercise: Exercise, input: string): boolean {
			if (exercise.type !== 'qcm') return false;
			return normalizeText(input) === normalizeText(exercise.answer);
		},
	};
}

export interface AnglesLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const ANGLES_LESSONS: AnglesLessonDef[] = [
	{
		id: 'geo-angles',
		label: 'Les angles',
		exerciseType: anglesType(),
	},
];
