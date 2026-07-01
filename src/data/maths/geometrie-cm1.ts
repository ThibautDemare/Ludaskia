/* ============================================================
   Géométrie CM1 (#242) — contenu ADDITIF, tagué CM1.
   Cliente du moteur de figures SVG (core/figures.ts). Le CE2 est GELÉ : ces
   leçons sont distinctes (nouveaux ids `geo-cm1-*`), elles ne touchent pas les
   banques / plages CE2 de `geometrie.ts` et `solides.ts`.

   Cadrage (déjà tranché — pedagogue-primaire + designer-ux-enfant) :
   FIGURES PLANES
   - triangles particuliers : équilatéral (3 côtés égaux, marqués), isocèle FRANC
     (2 côtés égaux marqués, jamais quasi-équilatéral), rectangle (1 angle droit) et
     quelconque/scalène (contre-exemple, aucune marque). Les tracés portent une marque
     de côté égal CONCORDANTE (la distinction ne repose pas sur le seul coup d'œil).
   - INVARIANT : jamais « équilatéral » ET « isocèle » donnés comme DEUX bonnes
     réponses sur une même figure (on n'enseigne pas l'inclusion au CM1). Quand la
     réponse est « isocèle », on dessine un isocèle franchement NON équilatéral.
   - quadrilatères : le parallélogramme devient une réponse de reconnaissance à part
     entière (côtés opposés parallèles/égaux). PAS d'inclusion (jamais « un carré /
     rectangle est un parallélogramme »).
   - CODAGE des figures (#326, attendu CM1 « coder un angle droit, des longueurs égales »)
     activé via `codage: true` : carré/rectangle = 4 carrés d'angle droit (+ tirets de côté :
     carré 4 égaux, rectangle longueurs/largeurs distinguées par un double tiret) ; losange =
     4 côtés égaux, sans angle droit ; parallélogramme = côtés opposés égaux (simple/double
     tiret), sans angle droit ; triangle rectangle = 1 carré d'angle droit. Rend la
     reconnaissance ÉQUITABLE (losange vs parallélogramme, carré vs losange) sans curer les
     distracteurs. Le CE2 partage le moteur mais reste NON codé (codage opt-in).
   SOLIDES
   - reconnaissance des solides dessinables, dont le PRISME droit (nouveau renderer) ;
   - QCM polyèdre / non-polyèdre (contenu le plus structurant du cycle 3) ;
   - comptage faces/arêtes/sommets DE MÉMOIRE, uniquement sur les polyèdres (cube,
     pavé, pyramide, prisme) — jamais « compte sur le dessin » (arêtes cachées).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption, GenerateOpts } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';
import type { PropQ } from './_shared';
import { checkNumerique, checkNumeriqueOuTexte } from '../../core/check-helpers';
import type { PlaneShape, Solid, SolidOrient } from '../../core/figures';
import { renderFigure } from '../../core/figures';
import { choice, sample, rnd } from '../../core/utils';

/* ---------- Modes communs ---------- */

const MODES_RECO: ModeOption[] = [
	{ ...MODE_QCM_POINT, hint: 'parmi 4' },
	{ id: 'saisie', label: "J'écris le nom", hint: 'au clavier', icon: 'keyboard' },
];
const MODE_QCM_SEUL: ModeOption[] = [MODE_QCM_POINT];

/* ---------- Triangles particuliers : reconnaissance ---------- */

// Type de triangle reconnaissable au CM1 → forme à dessiner + nom de référence.
type TriType = 'equilateral' | 'isocele' | 'rectangle' | 'quelconque';
const TRI_SHAPE: Record<TriType, PlaneShape> = {
	equilateral: 'triangleEquilateral',
	isocele: 'triangleIsocele',
	rectangle: 'triangleRectangle',
	quelconque: 'triangleQuelconque',
};
const TRI_NOM: Record<TriType, string> = {
	equilateral: 'triangle équilatéral',
	isocele: 'triangle isocèle',
	rectangle: 'triangle rectangle',
	quelconque: 'triangle quelconque',
};
// Formes de saisie acceptées en plus du nom de référence (l'enfant peut écrire le
// seul adjectif). Le QCM, lui, propose toujours le libellé complet « triangle … ».
const TRI_ACCEPTE: Record<TriType, string[]> = {
	equilateral: ['triangle équilatéral', 'équilatéral'],
	isocele: ['triangle isocèle', 'isocèle'],
	rectangle: ['triangle rectangle', 'rectangle'],
	quelconque: ['triangle quelconque', 'quelconque'],
};
const TRI_TOUS: TriType[] = ['equilateral', 'isocele', 'rectangle', 'quelconque'];

/* Bornes de rotation par triangle (avis designer #242) : on varie l'orientation sans
   rendre la figure illisible. Isocèle : ±15° ou demi-tour ; équilatéral : ±20° ou
   demi-tour ; quelconque : ±20° ; rectangle : multiples de 90° (l'angle droit reste net). */
function rotationTriangle(t: TriType): number {
	switch (t) {
		case 'isocele':
			return choice([0, 0, 180, 15, -15]);
		case 'equilateral':
			return choice([0, 0, 180, 20, -20]);
		case 'quelconque':
			return choice([0, 0, 20, -20]);
		case 'rectangle':
			return choice([0, 90, 180, 270]);
	}
}

function triangleRecoExercise(mode: string | undefined): Exercise {
	// Pondération douce : équilatéral et isocèle (cœur de la notion) un peu plus fréquents.
	const t = choice<TriType>([
		'equilateral',
		'equilateral',
		'isocele',
		'isocele',
		'rectangle',
		'quelconque',
	]);
	const answer = TRI_NOM[t];
	// Figure tirée DE LA forme correspondant à la réponse : quand la réponse est
	// « isocèle », on dessine `triangleIsocele` (franchement non équilatéral par
	// construction) → jamais d'ambiguïté équilatéral/isocèle.
	const figure = renderFigure({
		kind: 'figurePlane',
		shape: TRI_SHAPE[t],
		rotation: rotationTriangle(t),
		codage: true, // #326 : codage des côtés égaux / angle droit (attendu CM1)
	});
	if (mode === 'qcm') {
		const distract = sample(
			TRI_TOUS.map((x) => TRI_NOM[x]).filter((n) => n !== answer),
			3,
		);
		return {
			type: 'qcm',
			question: 'Quel est ce triangle ?',
			answer,
			choices: sample([answer, ...distract], 4),
			figure,
		};
	}
	return {
		type: 'text',
		question: 'Quel est ce triangle ? @',
		answer,
		answers: TRI_ACCEPTE[t],
		figure,
	};
}

function trianglesRecoType(): ExerciseType {
	return {
		modes: MODES_RECO,
		consigne: 'Nomme le triangle (équilatéral, isocèle, rectangle ou quelconque).',
		generate(opts?: GenerateOpts): Exercise {
			return triangleRecoExercise(opts?.mode);
		},
		check: checkNumeriqueOuTexte,
	};
}

/* ---------- Triangles particuliers : propriété caractéristique (QCM textuel) ----------
   Chaque question a UNE bonne réponse tranchée. INVARIANT respecté : on ne propose
   jamais à la fois « équilatéral » et « isocèle » quand l'un répond à une propriété
   que l'autre vérifie aussi (ex. « 2 côtés égaux ») — les choix sont curés pour ça. */
const TRI_PROPRIETES: PropQ[] = [
	// Caractéristiques « côtés » : le distracteur « isocèle » est ABSENT quand la réponse
	// est « équilatéral » sur une propriété de côtés égaux (et réciproquement), pour ne
	// jamais suggérer l'inclusion.
	{
		q: 'Quel triangle a ses 3 côtés égaux ?',
		a: 'le triangle équilatéral',
		choices: [
			'le triangle équilatéral',
			'le triangle rectangle',
			'le triangle quelconque',
			'aucun triangle',
		],
	},
	{
		q: 'Quel triangle a exactement 2 côtés égaux ?',
		a: 'le triangle isocèle',
		choices: [
			'le triangle isocèle',
			'le triangle rectangle',
			'le triangle quelconque',
			'aucun triangle',
		],
	},
	{
		q: 'Quel triangle a un angle droit ?',
		a: 'le triangle rectangle',
		choices: [
			'le triangle rectangle',
			'le triangle équilatéral',
			'le triangle isocèle',
			'le triangle quelconque',
		],
	},
	{
		q: 'Quel triangle a tous ses côtés de longueurs différentes ?',
		a: 'le triangle quelconque',
		choices: [
			'le triangle quelconque',
			'le triangle équilatéral',
			'le triangle isocèle',
			'le triangle rectangle',
		],
	},
	{
		q: 'Combien de côtés égaux a un triangle équilatéral ?',
		a: '3',
		choices: ['0', '1', '2', '3'],
	},
	{
		q: 'Combien de côtés égaux a un triangle isocèle ?',
		a: '2',
		choices: ['0', '1', '2', '4'],
	},
	{
		q: "Combien d'angles droits a un triangle rectangle ?",
		a: '1',
		choices: ['0', '1', '2', '3'],
	},
	{
		q: 'Le triangle équilatéral a tous ses angles…',
		a: 'égaux',
		choices: ['égaux', 'différents', 'droits', 'plats'],
	},
	{
		q: 'Combien de côtés a un triangle ?',
		a: '3',
		choices: ['2', '3', '4', '5'],
	},
];

function trianglesProprietesType(): ExerciseType {
	return {
		modes: MODE_QCM_SEUL,
		generate(): Exercise {
			const p = choice(TRI_PROPRIETES);
			return {
				type: 'qcm',
				question: p.q,
				answer: p.a,
				choices: sample(p.choices, p.choices.length),
			};
		},
		check: checkNumeriqueOuTexte,
	};
}

/* ---------- Quadrilatères : reconnaissance (dont parallélogramme) ----------
   Le parallélogramme est une réponse à part entière. PAS d'inclusion : on ne dit
   jamais qu'un carré/rectangle EST un parallélogramme, et on ne l'oppose pas à un
   rectangle « légèrement penché ». Rotation 0° pour le parallélogramme (une symétrie
   gauche/droite tolérée, jamais de vraie rotation). */
type QuadType = 'carre' | 'rectangle' | 'losange' | 'parallelogramme';
const QUAD_SHAPE: Record<QuadType, PlaneShape> = {
	carre: 'carre',
	rectangle: 'rectangle',
	losange: 'losange',
	parallelogramme: 'parallelogramme',
};
const QUAD_NOM: Record<QuadType, string> = {
	carre: 'carré',
	rectangle: 'rectangle',
	losange: 'losange',
	parallelogramme: 'parallélogramme',
};
const QUAD_TOUS: QuadType[] = ['carre', 'rectangle', 'losange', 'parallelogramme'];

function rotationQuad(q: QuadType): number {
	switch (q) {
		case 'carre':
			return choice([0, 30, 35, 40]); // jamais 45° (indécidable vs losange)
		case 'rectangle':
			return choice([0, 0, 15, -15]);
		case 'losange':
			return choice([0, 0, 90]);
		case 'parallelogramme':
			return 0; // pas de rotation (le miroir gauche/droite vient de la donnée, plus bas)
	}
}

function quadRecoExercise(mode: string | undefined): Exercise {
	const q = choice<QuadType>([
		'carre',
		'rectangle',
		'losange',
		'parallelogramme',
		'parallelogramme', // un peu plus fréquent : c'est la nouveauté de la leçon
	]);
	const answer = QUAD_NOM[q];
	const figure = renderFigure({
		kind: 'figurePlane',
		shape: QUAD_SHAPE[q],
		rotation: rotationQuad(q),
		codage: true, // #326 : codage des côtés égaux / angles droits (rend la reco équitable)
	});
	if (mode === 'qcm') {
		const distract = sample(
			QUAD_TOUS.map((x) => QUAD_NOM[x]).filter((n) => n !== answer),
			3,
		);
		return {
			type: 'qcm',
			question: 'Quel est ce quadrilatère ?',
			answer,
			choices: sample([answer, ...distract], 4),
			figure,
		};
	}
	return {
		type: 'text',
		question: 'Quel est ce quadrilatère ? @',
		answer,
		answers: [answer],
		figure,
	};
}

const QUAD_PROPRIETES: PropQ[] = [
	{
		q: 'Quel quadrilatère a ses côtés opposés parallèles, mais aucun angle droit ?',
		a: 'le parallélogramme',
		choices: ['le parallélogramme', 'le carré', 'le rectangle', 'le triangle'],
	},
	{
		q: 'Le parallélogramme a ses côtés opposés…',
		a: 'parallèles et égaux',
		choices: ['parallèles et égaux', 'tous égaux', 'tous différents', 'courbes'],
	},
	{
		q: 'Combien de côtés a un parallélogramme ?',
		a: '4',
		choices: ['3', '4', '5', '6'],
	},
];

function quadrilateresRecoType(): ExerciseType {
	return {
		modes: MODES_RECO,
		consigne: 'Nomme le quadrilatère (carré, rectangle, losange ou parallélogramme).',
		generate(opts?: GenerateOpts): Exercise {
			// ~30 % des tirages : une question de propriété textuelle (sans figure) ;
			// sinon reconnaissance d'une figure.
			if (opts?.mode === 'qcm' && rnd(1, 100) <= 30) {
				const p = choice(QUAD_PROPRIETES);
				return {
					type: 'qcm',
					question: p.q,
					answer: p.a,
					choices: sample(p.choices, p.choices.length),
				};
			}
			return quadRecoExercise(opts?.mode);
		},
		check: checkNumeriqueOuTexte,
	};
}

/* ---------- Solides : reconnaissance (dont prisme) ---------- */

const SOL_NOM: Record<Solid, string> = {
	cube: 'cube',
	pave: 'pavé droit',
	cylindre: 'cylindre',
	cone: 'cône',
	pyramide: 'pyramide',
	boule: 'boule',
	prisme: 'prisme',
};
// CM1 : les 6 solides du CE2 + le prisme droit.
const SOL_TOUS: Solid[] = ['cube', 'pave', 'cylindre', 'cone', 'pyramide', 'boule', 'prisme'];
const SOL_ACCEPTE: Partial<Record<Solid, string[]>> = {
	pave: ['pavé droit', 'pavé'],
	prisme: ['prisme', 'prisme droit'],
};

/* Orientation : cube/pavé/pyramide/prisme (polyèdres « à boîte ») varient un peu
   (miroir, angle de fuite) ; cylindre/cône/boule restent en vue unique lisible. */
function orientSolide(solid: Solid): SolidOrient {
	if (solid === 'cube' || solid === 'pave' || solid === 'prisme') {
		const r = rnd(1, 100);
		if (r <= 60) return { lean: 0, mirror: false };
		if (r <= 80) return { lean: 0, mirror: true };
		const lean: 1 | 2 = rnd(1, 2) === 1 ? 1 : 2;
		return { lean, mirror: rnd(1, 2) === 1 };
	}
	if (solid === 'pyramide') return { mirror: rnd(1, 100) > 60 };
	return {};
}

function solidesRecoType(): ExerciseType {
	return {
		modes: MODES_RECO,
		consigne: 'Nomme le solide dessiné en perspective.',
		generate(opts?: GenerateOpts): Exercise {
			const solid = choice(SOL_TOUS);
			const answer = SOL_NOM[solid];
			const figure = renderFigure({ kind: 'solide', solid, orient: orientSolide(solid) });
			if (opts?.mode === 'qcm') {
				const distract = sample(
					SOL_TOUS.map((s) => SOL_NOM[s]).filter((n) => n !== answer),
					3,
				);
				return {
					type: 'qcm',
					question: 'Quel est ce solide ?',
					answer,
					choices: sample([answer, ...distract], 4),
					figure,
				};
			}
			return {
				type: 'text',
				question: 'Quel est ce solide ? @',
				answer,
				answers: SOL_ACCEPTE[solid] ?? [answer],
				figure,
			};
		},
		check: checkNumeriqueOuTexte,
	};
}

/* ---------- Solides : polyèdre / non-polyèdre (QCM textuel) ----------
   Contenu le plus structurant de la tranche (attendu cycle 3). Un polyèdre n'a que
   des faces PLANES (polygones) : cube, pavé, pyramide, prisme. Le cône, le cylindre
   et la boule ont une surface courbe → ce ne sont PAS des polyèdres. Les banques
   ci-dessous sont curées (réponses justes vérifiées), pas générées. */
interface PolyedreQ {
	q: string;
	a: string;
	choices: string[];
}
const POLYEDRE_QUESTIONS: PolyedreQ[] = [
	{
		q: 'Parmi ces solides, lequel est un polyèdre ?',
		a: 'le cube',
		choices: ['le cube', 'la boule', 'le cylindre', 'le cône'],
	},
	{
		q: 'Parmi ces solides, lequel est un polyèdre ?',
		a: 'la pyramide',
		choices: ['la pyramide', 'la boule', 'le cylindre', 'le cône'],
	},
	{
		q: 'Parmi ces solides, lequel est un polyèdre ?',
		a: 'le prisme',
		choices: ['le prisme', 'la boule', 'le cône', 'le cylindre'],
	},
	{
		q: "Parmi ces solides, lequel n'est PAS un polyèdre ?",
		a: 'la boule',
		choices: ['la boule', 'le cube', 'le pavé droit', 'la pyramide'],
	},
	{
		q: "Parmi ces solides, lequel n'est PAS un polyèdre ?",
		a: 'le cylindre',
		choices: ['le cylindre', 'le cube', 'le prisme', 'la pyramide'],
	},
	{
		q: 'La boule est-elle un polyèdre ?',
		a: 'non',
		choices: ['non', 'oui'],
	},
	{
		q: 'Le cube est-il un polyèdre ?',
		a: 'oui',
		choices: ['oui', 'non'],
	},
	{
		q: 'Le cylindre est-il un polyèdre ?',
		a: 'non',
		choices: ['non', 'oui'],
	},
	{
		q: 'Le prisme est-il un polyèdre ?',
		a: 'oui',
		choices: ['oui', 'non'],
	},
	{
		q: 'Un polyèdre a toutes ses faces…',
		a: 'planes',
		choices: ['planes', 'rondes', 'courbes', 'pointues'],
	},
];

function polyedreType(): ExerciseType {
	return {
		modes: MODE_QCM_SEUL,
		generate(): Exercise {
			const p = choice(POLYEDRE_QUESTIONS);
			return {
				type: 'qcm',
				question: p.q,
				answer: p.a,
				choices: sample(p.choices, p.choices.length),
			};
		},
		check: checkAnswer,
	};
}

/* ---------- Solides : compter faces / arêtes / sommets DE MÉMOIRE ----------
   UNIQUEMENT sur les polyèdres (cube, pavé, pyramide à base carrée, prisme droit à
   base triangulaire). La question ne demande JAMAIS de compter « sur le dessin » : les
   solides sont dessinés sans arêtes cachées, on récite une propriété mémorisée. Aucune
   figure (un schéma 3D inviterait au comptage des seules arêtes visibles). */
interface ComptageEntree {
	nom: string; // « un cube », « une pyramide à base carrée »…
	faces: number;
	aretes: number;
	sommets: number;
}
const COMPTAGE: ComptageEntree[] = [
	{ nom: 'un cube', faces: 6, aretes: 12, sommets: 8 },
	{ nom: 'un pavé droit', faces: 6, aretes: 12, sommets: 8 },
	{ nom: 'une pyramide à base carrée', faces: 5, aretes: 8, sommets: 5 },
	// Prisme droit à base TRIANGULAIRE : 2 triangles + 3 rectangles = 5 faces, 9 arêtes,
	// 6 sommets (le solide effectivement dessiné par `renderSolide('prisme')`).
	{ nom: 'un prisme droit à base triangulaire', faces: 5, aretes: 9, sommets: 6 },
];
type Caracteristique = 'faces' | 'aretes' | 'sommets';
const CARAC_LABEL: Record<Caracteristique, string> = {
	faces: 'faces',
	aretes: 'arêtes',
	sommets: 'sommets',
};

/* Choix numériques plausibles autour de la bonne réponse (valeurs voisines réelles
   d'autres polyèdres), distincts, positifs, incluant la bonne. */
function choixComptage(bon: number): string[] {
	const candidats = [bon, bon - 2, bon - 1, bon + 1, bon + 2, bon + 3].filter((n) => n >= 3);
	const uniques = [...new Set(candidats)];
	const autres = uniques.filter((n) => n !== bon);
	return sample(
		[bon, ...sample(autres, Math.min(3, autres.length))],
		Math.min(4, autres.length + 1),
	).map(String);
}

function comptageType(): ExerciseType {
	return {
		modes: MODE_QCM_SEUL,
		generate(): Exercise {
			const e = choice(COMPTAGE);
			const carac = choice<Caracteristique>(['faces', 'aretes', 'sommets']);
			const bon = e[carac];
			// Formulation « de mémoire » : on demande le nombre de … d'un solide NOMMÉ,
			// jamais « sur le dessin » (pas de figure jointe). Élision « de » → « d' »
			// devant voyelle (« d'arêtes », mais « de faces » / « de sommets »).
			const mot = CARAC_LABEL[carac];
			const de = /^[aeiouàâäéèêëïîôöùûüyh]/i.test(mot) ? "d'" : 'de ';
			const question = `Combien ${de}${mot} a ${e.nom} ?`;
			return {
				type: 'qcm',
				question,
				answer: String(bon),
				choices: choixComptage(bon),
			};
		},
		check: checkNumerique,
	};
}

/* ---------- Descripteurs ---------- */

export const GEOMETRIE_CM1_LESSONS: LessonInput[] = [
	{
		id: 'geo-cm1-triangles',
		label: 'Je reconnais les triangles',
		exerciseType: trianglesRecoType(),
	},
	{
		id: 'geo-cm1-triangles-prop',
		label: 'Les propriétés des triangles',
		exerciseType: trianglesProprietesType(),
	},
	{
		id: 'geo-cm1-quadrilateres',
		label: 'Je reconnais les quadrilatères',
		exerciseType: quadrilateresRecoType(),
	},
	{
		id: 'geo-cm1-solides',
		label: 'Je reconnais les solides',
		exerciseType: solidesRecoType(),
	},
	{
		id: 'geo-cm1-polyedre',
		label: 'Polyèdre ou non ?',
		exerciseType: polyedreType(),
	},
	{
		id: 'geo-cm1-solides-comptage',
		label: 'Compter faces, arêtes et sommets',
		exerciseType: comptageType(),
	},
];
