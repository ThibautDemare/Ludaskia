/* ============================================================
   Résolution de problèmes (#199) — structures de Vergnaud.
   Les problèmes sont générés par GABARITS (variables : prénoms, objets,
   quantités) et structurés par la STRUCTURE mathématique, pas par l'habillage.
   Réponse NUMÉRIQUE entière (jamais QCM « quelle opération »). Runner dédié,
   un problème à la fois (ui/lecon-probleme.ts) ; exclus du sprint chronométré.
   `parle` = énoncé complet lu à voix haute (jamais la réponse).

   Anti-piège mots-clés : on varie la POSITION DE L'INCONNUE et on inclut des
   énoncés où un mot-clé trompeur (« de plus », « en tout », « reste ») n'indique
   PAS l'opération à faire — minoritaires et tardifs (l'enfant doit raisonner, pas
   repérer un indice). Calibrage CE2 : additifs ≤ 1000, multiplicatifs dans les
   tables (≤ 10, produit ≤ ~100), division exacte (reste nul). Réponse entière.
   Conception pédagogique : avis pedagogue-primaire (typologie Vergnaud, 2025).
   ============================================================ */
import { choice, rnd, sample } from '../../core/utils';
import type { Exercise, ExerciseType, ProblemeEtape } from '../../core/exercise';

/* ---------- Briques de gabarit ---------- */

type Genre = 'm' | 'f';
interface Prenom {
	nom: string;
	genre: Genre;
}

// Prénoms variés (genre fixé pour garantir l'accord interne il/elle de l'énoncé).
const PRENOMS: Prenom[] = [
	{ nom: 'Léo', genre: 'm' },
	{ nom: 'Tom', genre: 'm' },
	{ nom: 'Hugo', genre: 'm' },
	{ nom: 'Jules', genre: 'm' },
	{ nom: 'Sam', genre: 'm' },
	{ nom: 'Adam', genre: 'm' },
	{ nom: 'Noé', genre: 'm' },
	{ nom: 'Ravi', genre: 'm' },
	{ nom: 'Léa', genre: 'f' },
	{ nom: 'Zoé', genre: 'f' },
	{ nom: 'Inès', genre: 'f' },
	{ nom: 'Lina', genre: 'f' },
	{ nom: 'Jade', genre: 'f' },
	{ nom: 'Nour', genre: 'f' },
	{ nom: 'Camille', genre: 'f' },
	{ nom: 'Sacha', genre: 'm' },
	{ nom: 'Maé', genre: 'f' },
	{ nom: 'Alix', genre: 'm' },
];

// Objets dénombrables, pluriel régulier, neutres.
const OBJETS = [
	'billes',
	'images',
	'cartes',
	'perles',
	'autocollants',
	'gâteaux',
	'bonbons',
	'timbres',
	'coquillages',
	'voitures',
	'ballons',
	'fleurs',
];
// Contenants (singulier / pluriel) pour les structures multiplicatives.
const CONTENANTS = [
	{ s: 'boîte', p: 'boîtes' },
	{ s: 'sachet', p: 'sachets' },
	{ s: 'panier', p: 'paniers' },
	{ s: 'paquet', p: 'paquets' },
];
const LIEUX = ['la boîte', 'le tiroir', 'le panier', 'la trousse', 'le sac', 'le carton'];
// Couleurs à pluriel INVARIABLE en genre (rouges/jaunes/roses/oranges) : évite tout
// problème d'accord de l'adjectif quel que soit le genre de l'objet.
const COULEURS = ['rouges', 'jaunes', 'roses', 'oranges'];
// Objets qui se déclinent naturellement en couleurs (composition par couleur).
const OBJETS_COLORES = ['billes', 'perles', 'ballons', 'fleurs', 'voitures', 'jetons', 'crayons'];
// Objets « achetables » pour les problèmes de monnaie (deux étapes).
const ACHATS = [
	{ s: 'livre', p: 'livres' },
	{ s: 'cahier', p: 'cahiers' },
	{ s: 'stylo', p: 'stylos' },
	{ s: 'jouet', p: 'jouets' },
];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const il = (g: Genre): string => (g === 'f' ? 'elle' : 'il');
const prenom = (): Prenom => choice(PRENOMS);
// Deux prénoms distincts (pour les comparaisons).
function deuxPrenoms(): [Prenom, Prenom] {
	const [a, b] = sample(PRENOMS, 2);
	return [a, b];
}

/* Fabrique l'Exercise à partir d'un énoncé et de ses étapes. Le texte LU
   (`parle`) = contexte + intitulés des sous-questions (jamais les réponses). */
function probleme(enonce: string, etapes: ProblemeEtape[]): Exercise {
	const parle = [enonce, ...etapes.map((e) => e.question)].join(' ');
	return { type: 'probleme', enonce, etapes, parle };
}

/* ---------- Leçon : Composition (parties / tout) ---------- */
// Structure statique parties↔tout, sans transformation. La plus simple.
function genComposition(): Exercise {
	const lieu = choice(LIEUX);
	const obj = choice(OBJETS_COLORES);
	const [c1, c2] = sample(COULEURS, 2);
	if (rnd(0, 1) === 0) {
		// 3A — recherche du tout : deux parts explicites → addition (loyal).
		const a = rnd(5, 50),
			b = rnd(5, 50);
		return probleme(`Dans ${lieu}, il y a ${a} ${obj} ${c1} et ${b} ${obj} ${c2}.`, [
			{ question: `Combien y a-t-il de ${obj} en tout ?`, answer: a + b },
		]);
	}
	// 3B — recherche d'une partie : on ÉTABLIT qu'il n'y a que DEUX sortes (sinon
	// « combien sont c2 ? » serait indécidable). « en tout » présent → soustraction.
	const t = rnd(20, 90),
		a = rnd(5, t - 5);
	return probleme(`Dans ${lieu}, il y a ${t} ${obj} : des ${c1} et des ${c2}. ${a} sont ${c1}.`, [
		{ question: `Combien sont ${c2} ?`, answer: t - a },
	]);
}

/* ---------- Leçon : Transformation (gagner / perdre) ---------- */
function genTransformation(): Exercise {
	const p = prenom();
	const obj = choice(OBJETS);
	const gain = rnd(0, 1) === 0;
	const verbe = gain ? 'gagne' : 'donne';
	const verbePasse = gain ? 'gagné' : 'donné';
	const r = rnd(0, 99);
	if (r < 45) {
		// 1A — recherche de l'état final (le plus facile). Perte : b ≤ a (jamais négatif).
		const a = rnd(10, 90),
			b = gain ? rnd(5, 80) : rnd(5, a);
		return probleme(`${p.nom} a ${a} ${obj}. ${cap(il(p.genre))} en ${verbe} ${b}.`, [
			{
				question: `Combien ${p.nom} a-t-${il(p.genre)} de ${obj} maintenant ?`,
				answer: gain ? a + b : a - b,
			},
		]);
	}
	if (r < 75) {
		// 1B — recherche de la transformation (verbe cohérent avec le sens réel).
		const a = rnd(15, 95);
		const c = gain ? a + rnd(5, 80) : a - rnd(5, a - 1);
		return probleme(`${p.nom} avait ${a} ${obj}. Maintenant ${il(p.genre)} en a ${c}.`, [
			{
				question: `Combien ${p.nom} en a-t-${il(p.genre)} ${verbePasse} ?`,
				answer: Math.abs(c - a),
			},
		]);
	}
	// 1C — recherche de l'état initial (PIÈGE LOYAL, minoritaire, tardif) :
	// « gagné » → on soustrait, « donné » → on additionne.
	const b = rnd(5, 50);
	const c = gain ? rnd(b + 5, 99) : rnd(15, 95);
	return probleme(`${p.nom} a ${verbePasse} ${b} ${obj}. Maintenant ${il(p.genre)} en a ${c}.`, [
		{
			question: `Combien ${p.nom} en avait-${il(p.genre)} au début ?`,
			answer: gain ? c - b : c + b,
		},
	]);
}

/* ---------- Leçon : Multiplication (groupes égaux) ---------- */
function genMultiplication(): Exercise {
	const n = rnd(2, 9),
		m = rnd(2, Math.min(9, Math.floor(100 / n))); // produit ≤ ~100, facteurs ≤ 9
	const obj = choice(OBJETS);
	if (rnd(0, 1) === 0) {
		// 4A — paquets.
		const p = prenom();
		const ct = choice(CONTENANTS);
		return probleme(`${p.nom} a ${n} ${ct.p}. Dans chaque ${ct.s}, il y a ${m} ${obj}.`, [
			{ question: `Combien y a-t-il de ${obj} en tout ?`, answer: n * m },
		]);
	}
	// 4B — configuration en rangées (même opération, image « addition réitérée »).
	return probleme(`Il y a ${n} rangées de ${m} ${obj}.`, [
		{ question: `Combien y a-t-il de ${obj} en tout ?`, answer: n * m },
	]);
}

/* ---------- Leçon : Partage et groupement (division exacte) ---------- */
function genPartage(): Exercise {
	const q = rnd(2, 9),
		d = rnd(2, 9); // quotient et diviseur dans les tables
	const t = q * d; // dividende, division exacte garantie
	const obj = choice(OBJETS);
	const p = prenom();
	if (rnd(0, 1) === 0) {
		// 5A — partage équitable : recherche de la valeur d'une part.
		return probleme(`${p.nom} partage ${t} ${obj} entre ${d} enfants.`, [
			{ question: `Combien chaque enfant reçoit-il de ${obj} ?`, answer: q },
		]);
	}
	// 5B — groupement : recherche du nombre de groupes.
	const ct = choice(CONTENANTS);
	return probleme(
		`${p.nom} a ${t} ${obj}. ${cap(il(p.genre))} les range par ${d} dans des ${ct.p}.`,
		[{ question: `Combien de ${ct.p} ${p.nom} remplit-${il(p.genre)} ?`, answer: q }],
	);
}

/* ---------- Leçon : Comparaison (la plus abstraite) ---------- */
function genComparaison(): Exercise {
	const [p1, p2] = deuxPrenoms();
	const obj = choice(OBJETS);
	const r = rnd(0, 99);
	if (r < 45) {
		// 2A — recherche de l'écart (le plus accessible de cette leçon).
		const a = rnd(25, 95),
			b = rnd(5, a - 5);
		return probleme(`${p1.nom} a ${a} ${obj}. ${p2.nom} a ${b} ${obj}.`, [
			{
				question: `Combien ${p1.nom} a-t-${il(p1.genre)} de ${obj} de plus que ${p2.nom} ?`,
				answer: a - b,
			},
		]);
	}
	if (r < 80) {
		// 2B — « de plus » = addition (loyal, non piège).
		const a = rnd(15, 80),
			d = rnd(5, 40);
		return probleme(`${p1.nom} a ${a} ${obj}. ${p2.nom} a ${d} ${obj} de plus que ${p1.nom}.`, [
			{
				question: `Combien ${p2.nom} a-t-${il(p2.genre)} de ${obj} ?`,
				answer: a + d,
			},
		]);
	}
	// 2C — comparaison inversée (PIÈGE DUR, minoritaire, tardif) : « de plus » → soustraction.
	const a = rnd(25, 95),
		d = rnd(5, a - 5);
	return probleme(`${p1.nom} a ${a} ${obj}. ${p1.nom} a ${d} ${obj} de plus que ${p2.nom}.`, [
		{
			question: `Combien ${p2.nom} a-t-${il(p2.genre)} de ${obj} ?`,
			answer: a - d,
		},
	]);
}

/* ---------- Leçon : Problèmes à deux étapes (multi-@, #199) ---------- */
// Chaîne de deux opérations simples. Sous-questions affichées d'emblée
// (« chunking ») : étape 1 = résultat intermédiaire, étape 2 = réponse finale.
function genDeuxEtapes(): Exercise {
	const p = prenom();
	const art = choice(ACHATS);
	const n = rnd(2, 6),
		m = rnd(2, 8); // n articles à m € → coût ≤ 48
	const cout = n * m;
	const billet = choice([10, 20, 50].filter((b) => b > cout)) ?? 50;
	return probleme(
		`${p.nom} achète ${n} ${art.p} à ${m} € chacun. ${cap(il(p.genre))} paie avec un billet de ${billet} €.`,
		[
			{ question: `Combien coûtent les ${n} ${art.p} ?`, answer: cout },
			{ question: `Combien lui rend-on ?`, answer: billet - cout },
		],
	);
}

/* ---------- Catalogue des leçons ---------- */

const monoMode = (generate: () => Exercise): ExerciseType => ({
	// Format « problème » (#199) : classé sans appeler generate() (#348), exclu du sprint.
	exerciseKind: 'probleme',
	generate,
	check: () => false, // corrigé par le runner dédié (étape par étape), jamais génériquement
});

export interface ProblemeLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

// Ordre d'affichage calé sur l'acquisition des opérations (avis pédagogue) :
// composition → transformation (additif) → multiplication → partage (division) →
// comparaison (la plus abstraite) → deux étapes (la plus exigeante).
export const PROBLEMES_LESSONS: ProblemeLessonDef[] = [
	{ id: 'math-prob-composition', label: 'Parties et tout', exerciseType: monoMode(genComposition) },
	{
		id: 'math-prob-transformation',
		label: 'Gagner ou perdre',
		exerciseType: monoMode(genTransformation),
	},
	{
		id: 'math-prob-multiplication',
		label: 'Des groupes égaux',
		exerciseType: monoMode(genMultiplication),
	},
	{ id: 'math-prob-partage', label: 'Partager et grouper', exerciseType: monoMode(genPartage) },
	{
		id: 'math-prob-comparaison',
		label: 'Comparer (plus ou moins)',
		exerciseType: monoMode(genComparaison),
	},
	{
		id: 'math-prob-deux-etapes',
		label: 'Problèmes en deux étapes',
		exerciseType: monoMode(genDeuxEtapes),
	},
];
