/* ============================================================
   Géométrie — Les angles (#202, variété des énoncés #288, extension CM1 #252).
   Cliente du moteur de figures SVG (core/figures/, `renderAngle` / `renderAnglePair` /
   `renderAngleNomme`).
   Une leçon `geo-angles`, QCM mono-mode, CALIBRÉE par niveau (#225) : le CE2 reconnaît
   et compare À L'ANGLE DROIT (6 familles ci-dessous, INCHANGÉES) ; le CM1 ajoute la
   comparaison de DEUX angles entre eux (cf. familles CM1, `genAngleCM1`, en bas).
   #288 enrichit les ÉNONCÉS CE2 pour casser l'impression de « toujours la même
   question », SANS changer la notion ni les plages.

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
import type { AngleSpec } from '../../core/figures';
import { calibrated } from '../../core/level-combinators';
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

/* ============================================================
   Familles CM1 (#252) — COMPARER DEUX ANGLES ENTRE EUX.
   Le CE2 ne compare qu'à l'angle droit ; la vraie nouveauté CM1 est de comparer
   DEUX angles l'un à l'autre (cœur du programme). Deux angles s'affichent côte à
   côte (moteur `renderAnglePair`), étiquetés A / B.

   Piège pédagogique intégré (avis pedagogue) : la LONGUEUR des demi-droites varie
   d'un angle à l'autre, de sorte que le plus ouvert ait PARFOIS les traits les plus
   courts — « la taille du trait n'est pas l'ouverture » (erreur classique CM1).

   Loyauté à l'œil (sans rapporteur, comme le CE2 bannit la zone 80–100°) : ouvertures
   dans une plage franche, et écart NET (≥ CM1_ECART_MIN) garanti dès que la réponse
   dépend de l'écart. La bonne réponse est CALCULÉE puis STOCKÉE (jamais recalculée).

   Notation « angle AÔB » (#252, B.O. 2025 §2.5) : famille `notation` — un angle aux
   trois points nommés (`renderAngleNomme`), l'enfant DÉSIGNE le sommet (la lettre du
   milieu, coiffée du circonflexe). En QCM il n'a pas à taper le Ô.

   Pondération (avis gamification-enfant, esprit du cadrage #252) : `plusOuvert`
   MAJORITAIRE (objectif du niveau), puis `egaux`, puis `notation` et `nommer` en appoint
   (consolidation de la classification aigu/droit/obtus, réutilise `genNommer`). */
const CM1_OUV_MIN = 20; // ouverture minimale (jamais un angle « pointu » indécidable)
const CM1_OUV_MAX = 160; // ouverture maximale (jamais un quasi-plat)
const CM1_ECART_MIN = 25; // écart net entre deux ouvertures jugées différentes
// Deux longueurs de demi-droites franchement distinctes (< 100 = demi-canevas : jamais
// hors cadre), tirées PAR angle pour dissocier la longueur du trait de l'ouverture.
const CM1_RAY_COURT = 50;
const CM1_RAY_LONG = 82;

/** Famille d'énoncé CM1 (identifiant STABLE, pour le routage et les invariants de test). */
export type FamilleCM1 = 'plusOuvert' | 'egaux' | 'notation' | 'nommer';

/** Un tirage CM1 : l'exercice + sa famille (exposés pour les tests ; le runner n'utilise
    que `.ex`). Pas de `cat` : `plusOuvert`/`egaux` montrent DEUX angles, pas un seul. */
export interface AngleCM1Tirage {
	ex: Exercise;
	famille: FamilleCM1;
}

const rayonAleatoire = (): number => choice([CM1_RAY_COURT, CM1_RAY_LONG]);

/* Deux ouvertures avec écart NET (≥ CM1_ECART_MIN) dans [CM1_OUV_MIN, CM1_OUV_MAX]. */
function deuxOuverturesDistinctes(): [number, number] {
	const o1 = rnd(CM1_OUV_MIN, CM1_OUV_MAX);
	let o2 = rnd(CM1_OUV_MIN, CM1_OUV_MAX);
	while (Math.abs(o1 - o2) < CM1_ECART_MIN) o2 = rnd(CM1_OUV_MIN, CM1_OUV_MAX);
	return [o1, o2];
}

/* ---------- plusOuvert — « Quel angle est le plus ouvert ? » (QCM A / B). ---------- */
function genPlusOuvert(): AngleCM1Tirage {
	const [oA, oB] = deuxOuverturesDistinctes();
	const a: AngleSpec = { opening: oA, bisector: bissectrice(), ray: rayonAleatoire() };
	const b: AngleSpec = { opening: oB, bisector: bissectrice(), ray: rayonAleatoire() };
	const answer = oA > oB ? 'Angle A' : 'Angle B'; // réponse STOCKÉE (jamais recalculée au check)
	return {
		ex: {
			type: 'qcm',
			question: 'Quel angle est le plus ouvert ?',
			answer,
			choices: sample(['Angle A', 'Angle B'], 2),
			figure: renderFigure({ kind: 'anglePair', a, b }),
			explication: "On compare l'ouverture des deux angles, pas la longueur des traits.",
		},
		famille: 'plusOuvert',
	};
}

/* ---------- egaux — « Ces deux angles sont-ils égaux ? » (Oui/Non). Sur « Non », on
   garde un écart NET pour rester loyal à l'œil ; sur « Oui », orientations et longueurs
   de traits différentes → l'enfant reconnaît l'ÉGALITÉ des ouvertures malgré l'apparence. */
function genEgaux(): AngleCM1Tirage {
	const egaux = rnd(1, 2) === 1;
	const oA = rnd(CM1_OUV_MIN, CM1_OUV_MAX);
	let oB = oA;
	if (!egaux) {
		oB = rnd(CM1_OUV_MIN, CM1_OUV_MAX);
		while (Math.abs(oA - oB) < CM1_ECART_MIN) oB = rnd(CM1_OUV_MIN, CM1_OUV_MAX);
	}
	const a: AngleSpec = { opening: oA, bisector: bissectrice(), ray: rayonAleatoire() };
	const b: AngleSpec = { opening: oB, bisector: bissectrice(), ray: rayonAleatoire() };
	return {
		ex: {
			type: 'qcm',
			question: 'Ces deux angles sont-ils égaux ?',
			answer: egaux ? 'Oui' : 'Non',
			choices: sample(['Oui', 'Non'], 2),
			figure: renderFigure({ kind: 'anglePair', a, b }),
			explication: egaux
				? "Oui : les deux angles ont la même ouverture, même si les traits n'ont pas la même longueur."
				: "Non : un angle est plus ouvert que l'autre (regarde l'ouverture, pas la longueur des traits).",
		},
		famille: 'egaux',
	};
}

/* ---------- notation — « Quel point est le sommet de l'angle XŶZ ? » (#252, B.O. §2.5).
   Le sommet est tiré parmi les VOYELLES (formes précomposées Â/Ê/Î/Ô/Û — robustes, pas
   de diacritique combiné qui rendrait mal) ; les deux points extérieurs parmi un pool
   DISJOINT de consonnes. La notation coiffe le sommet, placé au MILIEU (convention). En
   QCM l'enfant DÉSIGNE la lettre du sommet (il n'a pas à taper le Ô). ---------- */
const CM1_SOMMETS: Array<[string, string]> = [
	['A', 'Â'],
	['E', 'Ê'],
	['I', 'Î'],
	['O', 'Ô'],
	['U', 'Û'],
];
const CM1_POINTS_EXT = ['B', 'C', 'D', 'F', 'G', 'H', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T'];

function genNotation(): AngleCM1Tirage {
	const [sommet, sommetChapeau] = choice(CM1_SOMMETS);
	const [p1, p2] = sample(CM1_POINTS_EXT, 2); // pool disjoint des voyelles → jamais de collision
	const spec: AngleSpec = { opening: rnd(35, 140), bisector: bissectrice(), ray: 64 };
	const notation = `${p1}${sommetChapeau}${p2}`; // sommet coiffé, AU MILIEU
	return {
		ex: {
			type: 'qcm',
			question: `Quel point est le sommet de l'angle ${notation} ?`,
			answer: sommet, // la lettre PLAINE du sommet (STOCKÉE)
			choices: sample([p1, sommet, p2], 3),
			figure: renderFigure({ kind: 'angleNomme', spec, points: [p1, sommet, p2] }),
			// TTS (#42) : le circonflexe — qui désigne le sommet — est INAUDIBLE si on lit
			// « BÂD » tel quel. On verbalise l'accent SANS nommer le sommet, pour laisser
			// l'enfant à l'oreille faire le MÊME raisonnement que l'enfant voyant.
			parle: `Quel point est le sommet de l'angle ${p1}, ${sommet} avec un accent circonflexe, ${p2} ?`,
			explication:
				"Dans la notation d'un angle, la lettre du milieu, coiffée d'un accent circonflexe (un petit chapeau), désigne le sommet.",
		},
		famille: 'notation',
	};
}

/* Tirage pondéré CM1 (#252). Bornes sur rnd(1,100) : 1–45 plusOuvert · 46–70 egaux ·
   71–85 notation · 86–100 nommer → comparaison de deux angles = 70 %, notation et
   classification en appoint = 15 % chacune. */
export function genAngleCM1(): AngleCM1Tirage {
	const r = rnd(1, 100);
	if (r <= 45) return genPlusOuvert();
	if (r <= 70) return genEgaux();
	if (r <= 85) return genNotation();
	return { ex: genNommer().ex, famille: 'nommer' }; // consolidation aigu/droit/obtus
}

/* Générateur d'exercice par niveau (paramètre du combinateur `calibrated`, #225) :
   CE2 = 6 familles historiques (byte-identique), CM1 = comparer deux angles + nommer. */
interface AngleConfig {
	gen: () => Exercise;
}

function anglesType(config: AngleConfig): ExerciseType {
	return {
		modes: MODES,
		generate(): Exercise {
			return config.gen();
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export const ANGLES_LESSONS: LessonInput[] = [
	{
		id: 'geo-angles',
		label: 'Les angles',
		// Calibré par niveau (#225/#252) : le CE2 reste inchangé ; le CM1 ajoute la
		// comparaison de deux angles. `levels` (dérivé par le catalogue) devient CE2+CM1.
		exerciseType: calibrated<AngleConfig>(
			{
				ce2: { gen: () => genAngle().ex },
				cm1: { gen: () => genAngleCM1().ex },
			},
			anglesType,
		),
	},
];
