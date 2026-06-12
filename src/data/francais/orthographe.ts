/* ============================================================
   Données statiques des leçons d'orthographe prédéfinies (CE2).
   Mots invariables et nombres en lettres, découpés en leçons courtes
   et numérotées. Proposés en complément des listes du parent.
   ------------------------------------------------------------
   Conventions : mots en MINUSCULES (on les écrit ainsi dans une
   phrase ; la vérification est stricte, trim + NFC). Apostrophe
   DROITE (') = celle tapée au clavier.
   ============================================================ */
import type { SchoolLevel } from '../../core/catalog';
import type { MotInput } from '../../core/orthographe/types';

export interface LeconOrthoPredef {
	id: string;
	label: string;
	niveau: SchoolLevel;
	mots: MotInput[];
}

/** Raccourci : liste de mots -> MotInput[]. */
const m = (...mots: string[]): MotInput[] => mots.map((mot) => ({ mot }));

/** Mot homophone : la dictée doit lire une phrase d'exemple pour lever l'ambiguïté. */
const h = (mot: string, commeDans: string): MotInput => ({ mot, commeDans, homophone: true });

/** Mot accompagné d'une phrase d'exemple en dictée (sans drapeau homophone). */
const c = (mot: string, commeDans: string): MotInput => ({ mot, commeDans });

export const ORTHO_PREDEF: LeconOrthoPredef[] = [
	{
		id: 'fr-ortho-invariables-1',
		label: 'Mots invariables (1)',
		niveau: 'ce2',
		mots: m(
			'afin de',
			'ailleurs',
			'ainsi',
			'alors',
			'après',
			'assez',
			'à travers',
			"aujourd'hui",
			'auparavant',
			'auprès',
			'aussi',
			'aussitôt',
		),
	},
	{
		id: 'fr-ortho-invariables-2',
		label: 'Mots invariables (2)',
		niveau: 'ce2',
		mots: m(
			'autant',
			'autour',
			'autre',
			'autrefois',
			'autrement',
			'avant',
			'avec',
			'beaucoup',
			'bien',
			'bientôt',
			'car',
			'cependant',
		),
	},
	{
		id: 'fr-ortho-invariables-3',
		label: 'Mots invariables (3)',
		niveau: 'ce2',
		mots: m(
			'certes',
			"c'est-à-dire",
			'chaque',
			'chez',
			'combien',
			'comme',
			'comment',
			'contre',
			"d'abord",
			"d'accord",
			"d'ailleurs",
			'dans',
		),
	},
	{
		id: 'fr-ortho-invariables-4',
		label: 'Mots invariables (4)',
		niveau: 'ce2',
		mots: m(
			'davantage',
			'debout',
			'dedans',
			'dehors',
			'déjà',
			'demain',
			'depuis',
			'derrière',
			'dès',
			'désormais',
			'dessous',
			'devant',
		),
	},
	{
		id: 'fr-ortho-invariables-5',
		label: 'Mots invariables (5)',
		niveau: 'ce2',
		mots: m(
			'donc',
			'dont',
			'dorénavant',
			'durant',
			'en vain',
			'encore',
			'enfin',
			'ensuite',
			'entre',
			'envers',
			'exprès',
			'guère',
		),
	},
	{
		id: 'fr-ortho-invariables-6',
		label: 'Mots invariables (6)',
		niveau: 'ce2',
		mots: m(
			'hélas',
			'hier',
			'hors',
			'ici',
			'jadis',
			'jamais',
			"jusqu'à",
			'jusque',
			'là-bas',
			'la plupart',
			'loin',
			'longtemps',
		),
	},
	{
		id: 'fr-ortho-invariables-7',
		label: 'Mots invariables (7)',
		niveau: 'ce2',
		mots: m(
			'lorsque',
			'maintenant',
			'mais',
			'malgré',
			'mieux',
			'moins',
			'naguère',
			'néanmoins',
			'nonobstant',
			'or',
			'où',
			'parce que',
		),
	},
	{
		id: 'fr-ortho-invariables-8',
		label: 'Mots invariables (8)',
		niveau: 'ce2',
		mots: m(
			'parfois',
			'parmi',
			'partout',
			'pas',
			'pendant',
			'peut-être',
			'plus',
			'plusieurs',
			'plutôt',
			'pour',
			'pourquoi',
			'pourtant',
		),
	},
	{
		id: 'fr-ortho-invariables-9',
		label: 'Mots invariables (9)',
		niveau: 'ce2',
		mots: m(
			'pourvu que',
			'près',
			'presque',
			'puis',
			'puisque',
			'quand',
			'quelquefois',
			'quoi',
			'quoique',
			'rien',
			'sans',
			'sauf',
		),
	},
	{
		id: 'fr-ortho-invariables-10',
		label: 'Mots invariables (10)',
		niveau: 'ce2',
		mots: m(
			'selon',
			'seulement',
			'sinon',
			'sitôt',
			'soudain',
			'sous',
			'souvent',
			'suivant',
			'sur',
			'surtout',
			'tandis que',
			'tant',
		),
	},
	{
		id: 'fr-ortho-invariables-11',
		label: 'Mots invariables (11)',
		niveau: 'ce2',
		mots: m(
			'tant pis',
			'tantôt',
			'tard',
			'tellement',
			'tôt',
			'toujours',
			'tout à coup',
			'toutefois',
			'très',
			'trop',
			'vers',
			'via',
		),
	},
	{
		id: 'fr-ortho-invariables-12',
		label: 'Mots invariables (12)',
		niveau: 'ce2',
		mots: m('voici', 'voilà', 'volontiers', 'vraiment', 'vite', 'vu'),
	},
	{
		id: 'fr-ortho-nombres-1',
		label: 'Les nombres (0 à 10)',
		niveau: 'ce2',
		mots: m('zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'),
	},
	{
		id: 'fr-ortho-nombres-2',
		label: 'Les nombres (11 à 20)',
		niveau: 'ce2',
		mots: m(
			'onze',
			'douze',
			'treize',
			'quatorze',
			'quinze',
			'seize',
			'dix-sept',
			'dix-huit',
			'dix-neuf',
			'vingt',
		),
	},
	{
		id: 'fr-ortho-nombres-3',
		label: 'Les nombres (les dizaines)',
		niveau: 'ce2',
		mots: m(
			'trente',
			'quarante',
			'cinquante',
			'soixante',
			'soixante-dix',
			'quatre-vingts',
			'quatre-vingt-dix',
		),
	},
	{
		id: 'fr-ortho-nombres-4',
		label: 'Les nombres (centaines et mille)',
		niveau: 'ce2',
		mots: m(
			'cent',
			'deux-cents',
			'trois-cents',
			'trois-cent-cinquante-deux',
			'quatre-cents',
			'mille',
		),
	},
	/* ----------------------------------------------------------------
	   Mots « irréguliers » : l'orthographe ne reflète pas la
	   prononciation. Liste fournie par une orthophoniste, regroupée par
	   type de piège pour aider l'enfant à généraliser. Les mots déjà
	   présents ailleurs (cent, dix, sept, vingt → leçons « Les nombres »)
	   ne sont pas redonnés ici : un mot est unique dans toute la banque.
	   ---------------------------------------------------------------- */
	{
		id: 'fr-ortho-irreguliers-ch',
		label: 'Mots irréguliers — « ch » qui se prononce « k »',
		niveau: 'ce2',
		mots: [
			...m('chorale', 'chronomètre', 'orchidée', 'orchestre', 'technique'),
			c('choristes', 'les choristes chantent'),
		],
	},
	{
		id: 'fr-ortho-irreguliers-finale-1',
		label: 'Mots irréguliers — la lettre muette à la fin (1)',
		niveau: 'ce2',
		mots: [
			h('sang', 'le sang coule'),
			h('temps', "le temps qu'il fait dehors"),
			h('corps', 'les parties du corps'),
			h('cerf', 'le cerf a de grands bois'),
			h('paix', 'faire la paix avec un ami'),
			h('poids', 'le poids du cartable'),
			h('étang', "le canard nage dans l'étang"),
			...m('tronc', 'tabac', 'respect'),
		],
	},
	{
		id: 'fr-ortho-irreguliers-finale-2',
		label: 'Mots irréguliers — la lettre muette à la fin (2)',
		niveau: 'ce2',
		mots: [
			h('long', 'un train très long'),
			h('puits', "je tire de l'eau du puits"),
			...m('fusil', 'outil', 'bourg', 'héros', 'sirop', 'nid', 'escroc', 'galop'),
		],
	},
	{
		id: 'fr-ortho-irreguliers-interne',
		label: 'Mots irréguliers — la lettre cachée dans le mot',
		niveau: 'ce2',
		mots: [
			h('compter', "compter jusqu'à dix"),
			h('compteur', 'le compteur de vitesse'),
			h('fils', 'le fils de mes parents'),
			h('doigt', 'le doigt de la main'),
			...m('sculpture', 'baptême', 'automne', 'août'),
		],
	},
	{
		id: 'fr-ortho-irreguliers-sons',
		label: 'Mots irréguliers — les lettres qui changent de son',
		niveau: 'ce2',
		mots: [
			h('paon', 'le paon ouvre sa queue'),
			h('faon', 'le faon est le petit de la biche'),
			h('seconde', 'attends une seconde'),
			...m('ville', 'million', 'aiguille', 'oignon', 'sixième', 'crayon', 'acrobatie'),
		],
	},
	{
		id: 'fr-ortho-irreguliers-quotidien',
		label: 'Mots irréguliers — des mots-pièges de tous les jours',
		niveau: 'ce2',
		mots: [
			h('net', 'le ciel est net, sans nuage'),
			h('poêle', 'la poêle pour cuire les œufs'),
			...m('monsieur', 'femme', 'lycée', 'musée'),
		],
	},
	{
		id: 'fr-ortho-irreguliers-ailleurs',
		label: "Mots irréguliers — des mots venus d'ailleurs",
		niveau: 'ce2',
		mots: m('parfum', 'aquarelle', 'aquarium', 'podium', 'toast', 'cake', 'dolmen'),
	},
];
