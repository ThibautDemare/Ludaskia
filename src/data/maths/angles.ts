/* ============================================================
   Géométrie — Les angles (#202, variété des énoncés #288).
   Cliente du moteur de figures SVG (core/figures.ts, `renderAngle`).
   Une leçon `geo-angles`, QCM mono-mode. La figure (ouverture + orientation)
   est déjà très variée ; #288 enrichit les ÉNONCÉS pour casser l'impression de
   « toujours la même question », SANS changer la notion ni les plages.

   SIX familles d'énoncés (identifiant STABLE `Famille`, indépendant de la
   tournure affichée : chaque famille tire au hasard parmi ses variantes de
   surface, à coût de difficulté nul) :
   - estDroit   — « Cet angle est-il un angle droit ? » (Oui/Non, droit détecté
     à son carré de codage) ;
   - poserCarre — « Peux-tu poser le petit carré dans le coin ? » (Oui/Non, loyal
     car le carré n'apparaît que sur un vrai angle droit) ;
   - coinReel   — « Cet angle est-il comme le coin d'une feuille ? » (Oui/Non ;
     ancrage concret, objet FIXE « feuille » — avis specialiste-troubles : un
     étalon mental ne marche que constant ; même formule que l'explication) ;
   - aiguOuiNon — « Cet angle est-il un angle aigu ? » (Oui/Non ; palier-pont vers
     le nommage : introduit « aigu » en binaire. Avis specialiste-troubles :
     « aigu » plutôt qu'« obtus » (mot plus ancrable, idée « pointu » visible) ;
     le « Non » mélange droit ET obtus ; aide RÉDUITE à un seul terme) ;
   - comparer   — « Compare cet angle à l'angle droit. » (plus petit / égal / plus grand) ;
   - nommer     — « Cet angle est-il aigu, droit ou obtus ? » (Aigu / Droit / Obtus).

   Pondération (avis gamification-enfant, #288, dans l'esprit 40/35/25 du pédagogue) :
   Oui/Non total plafonné à 45 % (binaire = accroche, pas le plat principal), 3
   termes ≥ 55 % (vrai jugement de l'angle). Bornes : estDroit 16 · poserCarre 10 ·
   coinReel 10 · aiguOuiNon 9 · comparer 35 · nommer 20. Le Temps 2 (comparaison,
   pièce maîtresse) reste à 35 %.

   Calibrage CE2 (programme 2025, avis pedagogue) : on reconnaît À L'ŒIL et on
   compare à l'angle droit, SANS degrés ni « 90° ». Aigu ~30–60°, droit 90° (avec
   le carré de codage, posé d'office par le renderer), obtus ~115–150° ; la zone
   indécidable (~80–100°) et les quasi-plats (>170°) sont bannis ; orientations
   variées. La mesure au rapporteur relève du CM1 (future leçon).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';
import { renderFigure } from '../../core/figures';
import { rnd, choice, sample } from '../../core/utils';

const MODES: ModeOption[] = [MODE_QCM_POINT];

type Categorie = 'aigu' | 'droit' | 'obtus';

/** Famille d'énoncé : identifiant STABLE de la tâche, indépendant de la tournure
    affichée. Sert au routage de la génération ET aux invariants de test (on ne
    classe jamais par la chaîne de l'énoncé, qui a plusieurs variantes). */
export type Famille = 'estDroit' | 'poserCarre' | 'coinReel' | 'aiguOuiNon' | 'comparer' | 'nommer';

/** Variantes de SURFACE par famille (tirage uniforme) : même tâche cognitive,
    formulation différente → anti-lassitude à coût de difficulté nul (#288). */
export const ENONCES: Record<Famille, string[]> = {
	estDroit: [
		'Cet angle est-il un angle droit ?',
		'Est-ce un angle droit ?',
		'Vois-tu un angle droit ?',
	],
	poserCarre: ['Peux-tu poser le petit carré dans le coin de cet angle ?'],
	// Objet FIXE « feuille » (avis specialiste-troubles) — même formule que l'explication.
	coinReel: ["Cet angle est-il comme le coin d'une feuille ?"],
	aiguOuiNon: ['Cet angle est-il un angle aigu ?'],
	comparer: [
		"Compare cet angle à l'angle droit.",
		"Comment est cet angle par rapport à l'angle droit ?",
	],
	nommer: [
		'Cet angle est-il aigu, droit ou obtus ?',
		'Quel est le nom de cet angle ?',
		'Choisis le nom de cet angle.',
	],
};

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

/* Bulles d'aide (apostrophe droite — convention projet ; `screen-only` : retirées
   à l'impression #290, sinon elles fuiteraient la réponse sur un bilan). */
// Nommage (temps 3) : les deux termes, ancrés sur la comparaison à l'angle droit.
const AIDE_NOMMER =
	'<p class="angle-aide screen-only">plus petit que l\'angle droit → aigu · plus grand → obtus</p>';
// Oui/Non « aigu » : aide RÉDUITE à UN seul terme (avis specialiste-troubles : ne
// pas nommer « obtus » ici, la marche binaire ne porte qu'un mot neuf à la fois).
const AIDE_AIGU = '<p class="angle-aide screen-only">aigu = plus petit que l\'angle droit</p>';

/* ---------- Familles Oui/Non « est-ce un angle droit ? » (estDroit / poserCarre /
   coinReel) : 50 % droit (sinon aigu ou obtus) pour ne pas récompenser un « Non »
   systématique. Chaque famille cite SON marqueur dans l'explication. ---------- */
type FamilleDroit = 'estDroit' | 'poserCarre' | 'coinReel';

const EXPL_DROIT_OUI: Record<FamilleDroit, string> = {
	estDroit: "Oui : le petit carré marque l'angle droit.",
	poserCarre: "Oui : le petit carré se pose pile dans le coin, c'est un angle droit.",
	coinReel: "Oui : cet angle est comme le coin d'une feuille, c'est un angle droit.",
};
const EXPL_DROIT_NON: Record<FamilleDroit, string> = {
	estDroit: "Non : cet angle n'est pas comme le coin d'une feuille.",
	poserCarre: 'Non : le petit carré ne se pose pas dans le coin.',
	coinReel: "Non : cet angle n'est pas comme le coin d'une feuille.",
};

function genDroit(famille: FamilleDroit): { ex: Exercise; cat: Categorie } {
	const estDroit = rnd(1, 2) === 1;
	const cat: Categorie = estDroit ? 'droit' : choice(['aigu', 'obtus']);
	return {
		ex: {
			type: 'qcm',
			question: choice(ENONCES[famille]),
			answer: estDroit ? 'Oui' : 'Non',
			choices: sample(['Oui', 'Non'], 2),
			figure: figureAngle(cat),
			explication: estDroit ? EXPL_DROIT_OUI[famille] : EXPL_DROIT_NON[famille],
		},
		cat,
	};
}

/* ---------- aiguOuiNon — palier-pont : « est-ce un angle aigu ? » (Oui/Non). Le
   « Non » mélange droit ET obtus (avis specialiste-troubles : éviter le raccourci
   « pas aigu = obtus »). Aide réduite à un terme. ---------- */
function genAiguOuiNon(): { ex: Exercise; cat: Categorie } {
	const estAigu = rnd(1, 2) === 1;
	const cat: Categorie = estAigu ? 'aigu' : choice(['droit', 'obtus']);
	return {
		ex: {
			type: 'qcm',
			question: choice(ENONCES.aiguOuiNon),
			answer: estAigu ? 'Oui' : 'Non',
			choices: sample(['Oui', 'Non'], 2),
			figure: figureAngle(cat) + AIDE_AIGU,
			explication: estAigu
				? "Oui : il est plus petit que l'angle droit, c'est un angle aigu."
				: "Non : il n'est pas plus petit que l'angle droit.",
		},
		cat,
	};
}

/* ---------- comparer — comparer à l'angle droit (sans le nommer). « égal » reste
   loyal : l'angle droit porte son carré de codage. ---------- */
function genComparer(): { ex: Exercise; cat: Categorie } {
	const cat: Categorie = choice(['aigu', 'droit', 'obtus']);
	const answer = cat === 'aigu' ? 'plus petit' : cat === 'droit' ? 'égal' : 'plus grand';
	return {
		ex: {
			type: 'qcm',
			question: choice(ENONCES.comparer),
			answer,
			choices: sample(['plus petit', 'égal', 'plus grand'], 3),
			figure: figureAngle(cat),
			explication:
				cat === 'aigu'
					? "Cet angle est plus petit que l'angle droit."
					: cat === 'droit'
						? "Cet angle est égal à l'angle droit : le petit carré le montre."
						: "Cet angle est plus grand que l'angle droit.",
		},
		cat,
	};
}

/* ---------- nommer — nommer (aigu / droit / obtus), avec la bulle d'aide. ---------- */
function genNommer(): { ex: Exercise; cat: Categorie } {
	const cat: Categorie = choice(['aigu', 'droit', 'obtus']);
	const answer = cat === 'aigu' ? 'Aigu' : cat === 'droit' ? 'Droit' : 'Obtus';
	return {
		ex: {
			type: 'qcm',
			question: choice(ENONCES.nommer),
			answer,
			choices: sample(['Aigu', 'Droit', 'Obtus'], 3),
			figure: figureAngle(cat) + AIDE_NOMMER,
			explication:
				cat === 'aigu'
					? "Plus petit que l'angle droit, c'est un angle aigu."
					: cat === 'droit'
						? "Avec le petit carré, c'est un angle droit."
						: "Plus grand que l'angle droit, c'est un angle obtus.",
		},
		cat,
	};
}

/** Un tirage complet : l'exercice + sa famille + la catégorie d'angle montrée
    (exposés pour les invariants de test ; le runner n'utilise que `.ex`). */
export interface AngleTirage {
	ex: Exercise;
	famille: Famille;
	cat: Categorie;
}

/* Tirage pondéré (#288, avis gamification-enfant). Bornes sur rnd(1,100) :
   1–16 estDroit · 17–26 poserCarre · 27–36 coinReel · 37–45 aiguOuiNon ·
   46–80 comparer · 81–100 nommer. → Oui/Non = 45 %, 3 termes = 55 %. */
export function genAngle(): AngleTirage {
	const r = rnd(1, 100);
	if (r <= 16) return { ...genDroit('estDroit'), famille: 'estDroit' };
	if (r <= 26) return { ...genDroit('poserCarre'), famille: 'poserCarre' };
	if (r <= 36) return { ...genDroit('coinReel'), famille: 'coinReel' };
	if (r <= 45) return { ...genAiguOuiNon(), famille: 'aiguOuiNon' };
	if (r <= 80) return { ...genComparer(), famille: 'comparer' };
	return { ...genNommer(), famille: 'nommer' };
}

function anglesType(): ExerciseType {
	return {
		modes: MODES,
		generate(): Exercise {
			return genAngle().ex;
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export const ANGLES_LESSONS: LessonInput[] = [
	{
		id: 'geo-angles',
		label: 'Les angles',
		exerciseType: anglesType(),
	},
];
