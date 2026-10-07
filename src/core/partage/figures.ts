/* ============================================================
   Séance partagée (#734) — schéma de chaque FIGURE dans un lien.

   Une figure ne voyage jamais en SVG : elle voyage en `FigureSpec`, et c'est
   l'application qui la redessine à l'arrivée. Les paramètres sont des nombres
   FINIS et BORNÉS (critère 40) — bornés, parce qu'un quadrillage de 10⁷ colonnes
   est un nombre fini qui gèlerait quand même l'onglet de l'enfant. Les bornes sont
   larges devant le contenu réel (le gate d'aller-retour du catalogue le vérifie) :
   elles arrêtent l'absurde, pas une évolution raisonnable d'une leçon.

   Même gate que les exercices : la table est typée sur `FigureSpec['kind']`.
   ============================================================ */
import type { FigureSpec } from '../figures';
import type { AngleSpec, DroiteGraduation, DroiteRepere, QuadFig } from '../figures';
import {
	booleen,
	entier,
	facultatif,
	liste,
	nombre,
	objet,
	parmi,
	refuser,
	tuple,
	union,
	type Schema,
} from './schema';
import { texteFigure } from './textes';

export type SchemasFigure = {
	[K in FigureSpec['kind']]: Schema<Extract<FigureSpec, { kind: K }>>;
};

type Spec<K extends FigureSpec['kind']> = Extract<FigureSpec, { kind: K }>;

/* ---------- Pièces communes ---------- */

const coord = nombre(-1000, 1000);
const point = tuple<[number, number]>(coord, coord);
const libelleFigure = texteFigure(40);
const descFigure = texteFigure(300);
const rotation = nombre(-720, 720);

const fraction = (max = 100) => tuple<[number, number]>(entier(0, max), entier(1, max));

/** Une valeur de droite graduée est en unité INTERNE (centièmes entiers pour les
 *  décimaux) : elle peut être grande, d'où une borne large. */
const valeurDroite = nombre(-1e12, 1e12);

const quadFig = objet<QuadFig>(
	{
		cols: entier(1, 30),
		rows: entier(1, 30),
		cells: liste(tuple<[number, number]>(entier(0, 29), entier(0, 29)), { max: 900 }),
	},
	cellulesDansLaGrille,
);

const modeQuadrillage = facultatif(parmi('perimetre', 'aire'));

const angleSpec = objet<AngleSpec>({
	opening: nombre(0, 360),
	bisector: rotation,
	ray: facultatif(nombre(1, 500)),
});

const formePlane = parmi(
	'carre',
	'rectangle',
	'triangle',
	'triangleRectangle',
	'triangleEquilateral',
	'triangleIsocele',
	'triangleQuelconque',
	'losange',
	'cercle',
	'parallelogramme',
	'quadrilatereQuelconque',
);

const formeSym = parmi(
	'carre',
	'rectangle',
	'triangleIso',
	'losange',
	'papillon',
	'coeur',
	'lettreA',
	'lettreH',
	'lettreT',
	'triangleScalene',
	'fanion',
	'lettreF',
	'lettreL',
);
const motifSym = parmi('drapeau', 'botte', 'lettreF', 'poisson', 'chaussure');
const axeHV = parmi('v', 'h');

/* ---------- La table ---------- */

export const SCHEMAS_FIGURE: SchemasFigure = {
	horloge: objet<Spec<'horloge'>>({
		kind: parmi('horloge'),
		heures: entier(0, 23),
		minutes: entier(0, 59),
	}),
	polygoneCote: objet<Spec<'polygoneCote'>>({
		kind: parmi('polygoneCote'),
		points: liste(point, { min: 3, max: 12 }),
		labels: liste(libelleFigure, { max: 12 }),
	}),
	quadrillage: objet<Spec<'quadrillage'>>(
		{
			kind: parmi('quadrillage'),
			cols: entier(1, 30),
			rows: entier(1, 30),
			cells: liste(tuple<[number, number]>(entier(0, 29), entier(0, 29)), { max: 900 }),
			mode: modeQuadrillage,
		},
		cellulesDansLaGrille,
	),
	quadrillagePaire: objet<Spec<'quadrillagePaire'>>({
		kind: parmi('quadrillagePaire'),
		a: quadFig,
		b: quadFig,
		mode: modeQuadrillage,
		labels: facultatif(tuple<[string, string]>(libelleFigure, libelleFigure)),
	}),
	figurePlane: objet<Spec<'figurePlane'>>({
		kind: parmi('figurePlane'),
		shape: formePlane,
		rotation: facultatif(rotation),
		codage: facultatif(booleen),
		parallelisme: facultatif(booleen),
	}),
	sceneFigures: objet<Spec<'sceneFigures'>>({
		kind: parmi('sceneFigures'),
		cells: liste(objet({ shape: formePlane, rotation: facultatif(rotation) }), { min: 1, max: 12 }),
	}),
	cercle: objet<Spec<'cercle'>>({
		kind: parmi('cercle'),
		segment: facultatif(parmi('rayon', 'diametre')),
		label: facultatif(libelleFigure),
	}),
	solide: objet<Spec<'solide'>>({
		kind: parmi('solide'),
		solid: parmi('cube', 'pave', 'cylindre', 'cone', 'pyramide', 'boule', 'prisme'),
		orient: facultatif(objet({ mirror: facultatif(booleen), lean: facultatif(parmi(0, 1, 2)) })),
	}),
	groupes: objet<Spec<'groupes'>>({
		kind: parmi('groupes'),
		paniers: entier(1, 20),
		total: entier(0, 200),
	}),
	fractionBarre: objet<Spec<'fractionBarre'>>({
		kind: parmi('fractionBarre'),
		num: entier(0, 100),
		den: entier(1, 100),
	}),
	fractionBande: objet<Spec<'fractionBande'>>({
		kind: parmi('fractionBande'),
		num: entier(0, 100),
		den: entier(1, 100),
	}),
	fractionDemiDroite: objet<Spec<'fractionDemiDroite'>>({
		kind: parmi('fractionDemiDroite'),
		num: entier(0, 100),
		den: entier(1, 100),
		unites: entier(1, 10),
	}),
	fractionPaire: objet<Spec<'fractionPaire'>>({
		kind: parmi('fractionPaire'),
		haut: fraction(),
		bas: fraction(),
	}),
	fractionSomme: objet<Spec<'fractionSomme'>>({
		kind: parmi('fractionSomme'),
		a: fraction(),
		b: fraction(),
	}),
	fractionSuperieure: objet<Spec<'fractionSuperieure'>>({
		kind: parmi('fractionSuperieure'),
		num: entier(0, 100),
		den: entier(1, 100),
	}),
	fractionCollection: objet<Spec<'fractionCollection'>>({
		kind: parmi('fractionCollection'),
		num: entier(0, 100),
		den: entier(1, 100),
		parGroupe: entier(1, 20),
	}),
	grilleCentiemes: objet<Spec<'grilleCentiemes'>>({
		kind: parmi('grilleCentiemes'),
		parts: entier(0, 100),
	}),
	droiteGraduee: objet<Spec<'droiteGraduee'>>(
		{
			kind: parmi('droiteGraduee'),
			min: valeurDroite,
			max: valeurDroite,
			pas: nombre(1e-6, 1e12),
			bornes: liste(objet<DroiteGraduation>({ valeur: valeurDroite, label: libelleFigure }), {
				max: 60,
			}),
			reperes: facultatif(
				liste(
					objet<DroiteRepere>({
						valeur: valeurDroite,
						etat: facultatif(parmi('neutre', 'correct', 'faux')),
					}),
					{ max: 10 },
				),
			),
			desc: facultatif(descFigure),
		},
		axeRaisonnable,
	),
	symJuger: objet<Spec<'symJuger'>>({
		kind: parmi('symJuger'),
		shape: formeSym,
		axis: facultatif(parmi('v', 'h', 'd1', 'd2')),
	}),
	symMiroir: objet<Spec<'symMiroir'>>({
		kind: parmi('symMiroir'),
		motif: motifSym,
		axis: axeHV,
	}),
	symImage: objet<Spec<'symImage'>>({
		kind: parmi('symImage'),
		motif: motifSym,
		axis: axeHV,
		t: parmi('reflet', 'glisse', 'tourne'),
	}),
	angle: objet<Spec<'angle'>>({
		kind: parmi('angle'),
		opening: nombre(0, 360),
		bisector: rotation,
	}),
	anglePair: objet<Spec<'anglePair'>>({
		kind: parmi('anglePair'),
		a: angleSpec,
		b: angleSpec,
		labels: facultatif(tuple<[string, string]>(libelleFigure, libelleFigure)),
	}),
	angleNomme: objet<Spec<'angleNomme'>>({
		kind: parmi('angleNomme'),
		spec: angleSpec,
		points: tuple<[string, string, string]>(texteFigure(3), texteFigure(3), texteFigure(3)),
	}),
	diagrammeBarres: objet<Spec<'diagrammeBarres'>>(
		{
			kind: parmi('diagrammeBarres'),
			titre: libelleFigure,
			barres: liste(objet({ label: libelleFigure, valeur: nombre(0, 1e6) }), { min: 1, max: 12 }),
			pas: nombre(1e-3, 1e6),
			max: nombre(0, 1e6),
			desc: facultatif(descFigure),
		},
		(s, chemin) => {
			if (s.max / s.pas > 100) refuser(chemin, 'trop de graduations');
		},
	),
	tableauDonnees: objet<Spec<'tableauDonnees'>>(
		{
			kind: parmi('tableauDonnees'),
			caption: libelleFigure,
			colonnes: liste(libelleFigure, { min: 1, max: 8 }),
			lignes: liste(
				objet({ entete: libelleFigure, valeurs: liste(nombre(-1e9, 1e9), { max: 8 }) }),
				{ min: 1, max: 8 },
			),
			coinLabel: facultatif(libelleFigure),
		},
		(s, chemin) => {
			if (s.lignes.some((l) => l.valeurs.length !== s.colonnes.length))
				refuser(chemin, 'ligne qui ne suit pas les colonnes');
		},
	),
};

export const schemaFigure: Schema<FigureSpec> = union<'kind', FigureSpec>('kind', SCHEMAS_FIGURE);

/* ---------- Invariants entre champs ---------- */

function cellulesDansLaGrille(s: QuadFig, chemin: string): void {
	if (s.cells.some(([c, r]) => c >= s.cols || r >= s.rows))
		refuser(chemin, 'case hors de la grille');
}

/** Une droite dont l'axe s'étire au-delà de quelques centaines de graduations ne se dessine
 *  plus (et ferait boucler le rendu) : refusée. */
function axeRaisonnable(s: Spec<'droiteGraduee'>, chemin: string): void {
	if (!(s.max > s.min)) refuser(chemin, 'axe vide ou inversé');
	if ((s.max - s.min) / s.pas > 400) refuser(chemin, 'trop de graduations');
}
