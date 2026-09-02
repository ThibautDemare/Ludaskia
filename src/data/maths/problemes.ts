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

   Extension CM1 (#255) : quatre structures (composition, transformation, comparaison,
   multiplication) sont rouvertes au CM1 avec des NOMBRES DÉCIMAUX « à une étape »,
   sans nouvelle leçon (mêmes id/libellés). Le générateur branche sur `opts.level` :
   level absent/'ce2' → chemin CE2 STRICTEMENT inchangé (byte-identité) ; level 'cm1'
   → un MIX ~50 % entiers (chemin CE2, pièges compris) + ~50 % décimaux LOYAUX (aucun
   piège « mots-clés » sur le décimal). Contextes décimaux : ARGENT (centimes) et
   MESURES au dixième (dixièmes). Robustesse flottante : toute l'arithmétique est
   ENTIÈRE (centimes / dixièmes), on ne divise par 100 ou 10 qu'au tout dernier moment
   pour la réponse `number` (cf. decimaux.ts). Partage (quotient décimal → CM2) et
   « deux étapes » (hors « à une étape ») restent CE2-only.
   ============================================================ */
import { choice, rnd, sample } from '../../core/utils';
import { formatEuros } from '../../core/nombres';
import type { Exercise, ExerciseType, GenerateOpts, ProblemeEtape } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import type { LessonInput } from '../_shared';

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
/* Élision devant une voyelle : « de billes », mais « d'images ». Deux objets de la liste
   ci-dessous commencent par une voyelle, et les sous-questions écrivaient « de images » /
   « de autocollants » — visible à l'écrit, et audible depuis que l'étayage (#490) relit ces
   intitulés à voix haute. */
const deObjet = (mot: string) => (/^[aeiouâêîôûéèh]/i.test(mot) ? `d'${mot}` : `de ${mot}`);

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
   (`parle`) = contexte + intitulés des sous-questions (jamais les réponses).
   `parleEnonce` (#255) : version PARLÉE de l'énoncé, quand l'affiché contient une
   unité que le TTS ne lit pas seule (« 3,5 m » → « 3,5 mètres ») ; absent = énoncé
   affiché lu tel quel (cas CE2 et argent, où « € » est déjà géré par core/tts-text). */
function probleme(enonce: string, etapes: ProblemeEtape[], parleEnonce?: string): Exercise {
	const parle = [parleEnonce ?? enonce, ...etapes.map((e) => e.question)].join(' ');
	return { type: 'probleme', enonce, etapes, parle };
}

/* Aiguillage CM1 (#255) : à CM1, un item sur deux bascule en décimal (`dec`), sinon on
   garde le générateur entier CE2 (`ent`). Le `&&` court-circuite AVANT tout tirage sur le
   chemin CE2 (level absent/'ce2') → suite RNG CE2 strictement identique (byte-identité
   impérative). Centralisé pour que tout nouveau générateur décimal hérite du même contrat
   sans le recopier (ordre des opérandes du `&&` à ne pas inverser). */
function mixCM1(
	opts: GenerateOpts | undefined,
	dec: () => Exercise,
	ent: () => Exercise,
): Exercise {
	return opts?.level === 'cm1' && rnd(0, 1) === 0 ? dec() : ent();
}

/* ---------- Leçon : Composition (parties / tout) ---------- */
// CM1 (#255) : ~50 % d'items entiers (chemin CE2 inchangé) + ~50 % décimaux loyaux (argent / mesures).
function genComposition(opts?: GenerateOpts): Exercise {
	return mixCM1(opts, genCompositionDec, genCompositionEnt);
}
// Structure statique parties↔tout, sans transformation. La plus simple.
function genCompositionEnt(): Exercise {
	const lieu = choice(LIEUX);
	const obj = choice(OBJETS_COLORES);
	const [c1, c2] = sample(COULEURS, 2);
	if (rnd(0, 1) === 0) {
		// 3A — recherche du tout : deux parts explicites → addition (loyal).
		const a = rnd(5, 50),
			b = rnd(5, 50);
		return probleme(`Dans ${lieu}, il y a ${a} ${obj} ${c1} et ${b} ${obj} ${c2}.`, [
			{
				question: `Combien y a-t-il ${deObjet(obj)} en tout ?`,
				answer: a + b,
				calcul: { op: '+', a, b },
			},
		]);
	}
	// 3B — recherche d'une partie : on ÉTABLIT qu'il n'y a que DEUX sortes (sinon
	// « combien sont c2 ? » serait indécidable). « en tout » présent → soustraction.
	const t = rnd(20, 90),
		a = rnd(5, t - 5);
	return probleme(`Dans ${lieu}, il y a ${t} ${obj} : des ${c1} et des ${c2}. ${a} sont ${c1}.`, [
		{ question: `Combien sont ${c2} ?`, answer: t - a, calcul: { op: '-', a: t, b: a } },
	]);
}

/* ---------- Leçon : Transformation (gagner / perdre) ---------- */
// CM1 (#255) : ~50 % entiers (CE2) + ~50 % décimaux ARGENT loyaux (dépense « reste »,
// recette « donne », recherche du coût entre deux états). Piège « état initial » CE2 non repris.
function genTransformation(opts?: GenerateOpts): Exercise {
	return mixCM1(opts, genTransformationDec, genTransformationEnt);
}
function genTransformationEnt(): Exercise {
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
				question: `Combien ${p.nom} a-t-${il(p.genre)} ${deObjet(obj)} maintenant ?`,
				answer: gain ? a + b : a - b,
				calcul: { op: gain ? '+' : '-', a, b },
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
				// L'écart entre les deux états : on retire toujours le plus petit du plus grand.
				calcul: { op: '-', a: Math.max(a, c), b: Math.min(a, c) },
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
			// PIÈGE LOYAL : « gagné » se remonte en RETIRANT, « donné » en AJOUTANT.
			calcul: gain ? { op: '-', a: c, b } : { op: '+', a: c, b },
		},
	]);
}

/* ---------- Leçon : Multiplication (groupes égaux) ---------- */
// CM1 (#255) : ~50 % entiers (CE2) + ~50 % décimal × entier < 10 — cas CANONIQUE du
// programme (« n objets à P € chacun »), prix décimal × quantité entière.
function genMultiplication(opts?: GenerateOpts): Exercise {
	return mixCM1(opts, genMultiplicationDec, genMultiplicationEnt);
}
function genMultiplicationEnt(): Exercise {
	const n = rnd(2, 9),
		m = rnd(2, Math.min(9, Math.floor(100 / n))); // produit ≤ ~100, facteurs ≤ 9
	const obj = choice(OBJETS);
	if (rnd(0, 1) === 0) {
		// 4A — paquets.
		const p = prenom();
		const ct = choice(CONTENANTS);
		return probleme(`${p.nom} a ${n} ${ct.p}. Dans chaque ${ct.s}, il y a ${m} ${obj}.`, [
			{
				question: `Combien y a-t-il ${deObjet(obj)} en tout ?`,
				answer: n * m,
				calcul: { op: 'x', a: n, b: m },
			},
		]);
	}
	// 4B — configuration en rangées (même opération, image « addition réitérée »).
	return probleme(`Il y a ${n} rangées de ${m} ${obj}.`, [
		{
			question: `Combien y a-t-il ${deObjet(obj)} en tout ?`,
			answer: n * m,
			calcul: { op: 'x', a: n, b: m },
		},
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
			{
				question: `Combien chaque enfant reçoit-il ${deObjet(obj)} ?`,
				answer: q,
				calcul: { op: ':', a: t, b: d },
			},
		]);
	}
	// 5B — groupement : recherche du nombre de groupes.
	const ct = choice(CONTENANTS);
	return probleme(
		`${p.nom} a ${t} ${obj}. ${cap(il(p.genre))} les range par ${d} dans des ${ct.p}.`,
		[
			{
				question: `Combien de ${ct.p} ${p.nom} remplit-${il(p.genre)} ?`,
				answer: q,
				calcul: { op: ':', a: t, b: d },
			},
		],
	);
}

/* ---------- Leçon : Comparaison (la plus abstraite) ---------- */
// CM1 (#255) : ~50 % entiers (CE2) + ~50 % décimaux loyaux (écart « de plus », état à
// partir d'un « de plus » non trompeur), argent ou mesures. Piège « comparaison inversée »
// CE2 non repris sur le décimal.
function genComparaison(opts?: GenerateOpts): Exercise {
	return mixCM1(opts, genComparaisonDec, genComparaisonEnt);
}
function genComparaisonEnt(): Exercise {
	const [p1, p2] = deuxPrenoms();
	const obj = choice(OBJETS);
	const r = rnd(0, 99);
	if (r < 45) {
		// 2A — recherche de l'écart (le plus accessible de cette leçon).
		const a = rnd(25, 95),
			b = rnd(5, a - 5);
		return probleme(`${p1.nom} a ${a} ${obj}. ${p2.nom} a ${b} ${obj}.`, [
			{
				question: `Combien ${p1.nom} a-t-${il(p1.genre)} ${deObjet(obj)} de plus que ${p2.nom} ?`,
				answer: a - b,
				calcul: { op: '-', a, b },
			},
		]);
	}
	if (r < 80) {
		// 2B — « de plus » = addition (loyal, non piège).
		const a = rnd(15, 80),
			d = rnd(5, 40);
		return probleme(`${p1.nom} a ${a} ${obj}. ${p2.nom} a ${d} ${obj} de plus que ${p1.nom}.`, [
			{
				question: `Combien ${p2.nom} a-t-${il(p2.genre)} ${deObjet(obj)} ?`,
				answer: a + d,
				calcul: { op: '+', a, b: d },
			},
		]);
	}
	// 2C — comparaison inversée (PIÈGE DUR, minoritaire, tardif) : « de plus » → soustraction.
	const a = rnd(25, 95),
		d = rnd(5, a - 5);
	return probleme(`${p1.nom} a ${a} ${obj}. ${p1.nom} a ${d} ${obj} de plus que ${p2.nom}.`, [
		{
			question: `Combien ${p2.nom} a-t-${il(p2.genre)} ${deObjet(obj)} ?`,
			answer: a - d,
			// PIÈGE DUR : « de plus » désigne ici l'AUTRE enfant → soustraction.
			calcul: { op: '-', a, b: d },
		},
	]);
}

/* ============================================================
   Habillage DÉCIMAL CM1 (#255) — argent (centimes) et mesures au dixième.
   TOUTE l'arithmétique est ENTIÈRE ; la division par 100 (argent) ou par 10 (mesures)
   n'a lieu qu'au TOUT DERNIER moment, pour que la réponse `number` vaille exactement
   k/100 (ou k/10) et matche la saisie décimale de l'enfant (runner : comparaison
   numérique, virgule tolérée). Seules des variantes LOYALES ici (aucun piège « mots-clés »).
   ============================================================ */

// Écriture à virgule d'un montant en CENTIMES (« 750 » → « 7,50 » ; « 600 » → « 6 »).
// Affichage seulement ; la valeur reste calculée en entier. La RÈGLE, elle, vit dans
// core/nombres.ts (#542) : ce module en gardait une copie, la leçon de monnaie une autre,
// et la révélation d'une réponse une troisième qui perdait les centimes. Une seule
// désormais, donc l'énoncé et la case révélée ne peuvent plus se contredire.
const euros = (centimes: number): string => formatEuros(centimes / 100);
// Centimes « jolis » au pas de 5 (jamais un centième arbitraire type 7,63 €), non nuls.
const CENTIMES_PRIX = [50, 25, 75, 20, 90, 10, 40, 60, 30, 80, 95, 45, 15, 5];
// Prix raisonnable : partie entière dans [euMin, euMax] €, partie décimale au pas de 5 c.
function prixCentimes(euMin: number, euMax: number): number {
	return rnd(euMin, euMax) * 100 + choice(CENTIMES_PRIX);
}

// Écriture à virgule d'une mesure en DIXIÈMES (« 35 » → « 3,5 » ; « 60 » → « 6 »).
function dixiemesTexte(d: number): string {
	const e = Math.floor(d / 10);
	const u = d % 10;
	return u === 0 ? `${e}` : `${e},${u}`;
}
// Mesure au dixième : partie entière dans [entMin, entMax], dixième NON nul (1..9) —
// la valeur « a une virgule » ; le centième reste pour plus tard (cf. #246).
function mesureDixiemes(entMin: number, entMax: number): number {
	return rnd(entMin, entMax) * 10 + rnd(1, 9);
}

// Famille de mesure : symbole affiché + nom LU (le TTS ne sait pas lire « m », « L »,
// « kg » seuls → on façonne le `parle` avec le mot plein, cf. probleme()). Deux formes
// pour l'accord : un nom précédé d'un nombre INFÉRIEUR à 2 reste au SINGULIER
// (« 1,2 mètre »), le pluriel n'apparaît qu'à partir de 2 (« 3,5 mètres ») — règle
// française du nom après un nombre fractionnaire (BDL/OQLF, Antidote).
interface Mesure {
	sym: string;
	motSg: string; // < 2 : « mètre »
	motPl: string; // ≥ 2 : « mètres »
}
const LONGUEUR: Mesure = { sym: 'm', motSg: 'mètre', motPl: 'mètres' };
const MASSE: Mesure = { sym: 'kg', motSg: 'kilogramme', motPl: 'kilogrammes' };
const CONTENANCE: Mesure = { sym: 'L', motSg: 'litre', motPl: 'litres' };

/* Fabrique un problème de MESURE : l'énoncé est bâti DEUX fois par le même gabarit
   `build`, une fois avec le symbole (affiché : « 3,5 m ») et une fois avec le mot
   (parlé : « 3,5 mètres ») — même valeurs, seule l'unité change. */
function mesureProbleme(
	m: Mesure,
	build: (u: (d: number) => string) => string,
	etapes: ProblemeEtape[],
): Exercise {
	const enonce = build((d) => `${dixiemesTexte(d)} ${m.sym}`);
	// Accord du nom d'unité LU : singulier si la valeur < 2 (dixièmes < 20), sinon pluriel.
	const parleEnonce = build((d) => `${dixiemesTexte(d)} ${d < 20 ? m.motSg : m.motPl}`);
	return probleme(enonce, etapes, parleEnonce);
}

/* ---------- Composition décimale (parties / tout) ---------- */
// Situations additives « deux parts → un tout » par famille de mesure (recherche du
// tout, addition). `deux` : la phrase des deux parts (u = rendu d'une valeur + unité).
const COMPO_MESURE: {
	m: Mesure;
	deux: (u: (d: number) => string, a: number, b: number, p: string) => string;
	tout: string;
	entMin: number;
	entMax: number;
}[] = [
	{
		m: LONGUEUR,
		deux: (u, a, b, p) => `${p} attache bout à bout un ruban de ${u(a)} et un ruban de ${u(b)}.`,
		tout: 'Quelle est la longueur totale du ruban ?',
		entMin: 1,
		entMax: 5,
	},
	{
		m: MASSE,
		deux: (u, a, b, p) => `${p} met ${u(a)} de farine et ${u(b)} de sucre dans un saladier.`,
		tout: 'Combien pèse le mélange ?',
		entMin: 1,
		entMax: 4,
	},
	{
		m: CONTENANCE,
		deux: (u, a, b, p) => `${p} verse ${u(a)} d'eau et ${u(b)} de jus dans un bidon.`,
		tout: 'Combien y a-t-il de boisson en tout ?',
		entMin: 1,
		entMax: 5,
	},
];

function compositionMesureTout(): Exercise {
	const s = choice(COMPO_MESURE);
	const p = prenom();
	const a = mesureDixiemes(s.entMin, s.entMax);
	const b = mesureDixiemes(s.entMin, s.entMax);
	return mesureProbleme(s.m, (u) => s.deux(u, a, b, p.nom), [
		{ question: s.tout, answer: (a + b) / 10, calcul: { op: '+', a: a / 10, b: b / 10 } },
	]);
}

function compositionArgent(): Exercise {
	const p = prenom();
	const [a1, a2] = sample(ACHATS, 2);
	const c1 = prixCentimes(2, 15);
	const c2 = prixCentimes(1, 12);
	if (rnd(1, 10) <= 6) {
		// Recherche du tout (addition) : deux prix → total payé.
		return probleme(`${p.nom} achète un ${a1.s} à ${euros(c1)} € et un ${a2.s} à ${euros(c2)} €.`, [
			{
				question: `Combien ${p.nom} paie-t-${il(p.genre)} en tout ?`,
				answer: (c1 + c2) / 100,
				unite: 'euro',
				calcul: { op: '+', a: c1 / 100, b: c2 / 100, uniteA: 'euro', uniteB: 'euro' },
			},
		]);
	}
	// Recherche d'une partie (soustraction) : total et un prix connus → l'autre prix.
	const total = c1 + c2;
	return probleme(
		`${p.nom} paie ${euros(total)} € pour un ${a1.s} et un ${a2.s}. Le ${a1.s} coûte ${euros(c1)} €.`,
		[
			{
				question: `Combien coûte le ${a2.s} ?`,
				answer: c2 / 100,
				unite: 'euro',
				calcul: { op: '-', a: total / 100, b: c1 / 100, uniteA: 'euro', uniteB: 'euro' },
			},
		],
	);
}

function genCompositionDec(): Exercise {
	return rnd(0, 1) === 0 ? compositionArgent() : compositionMesureTout();
}

/* ---------- Transformation décimale (ARGENT) ---------- */
function genTransformationDec(): Exercise {
	const p = prenom();
	const art = choice(ACHATS);
	const cas = rnd(1, 10);
	if (cas <= 4) {
		// État final — dépense (soustraction). Montants construits pour un reste > 0.
		const prix = prixCentimes(2, 12);
		const reste = prixCentimes(1, 15);
		const avoir = prix + reste;
		return probleme(
			`${p.nom} a ${euros(avoir)} €. ${cap(il(p.genre))} achète un ${art.s} à ${euros(prix)} €.`,
			// « rester » est impersonnel → toujours « il » (jamais accordé au prénom).
			[
				{
					question: `Combien lui reste-t-il ?`,
					answer: reste / 100,
					unite: 'euro',
					calcul: { op: '-', a: avoir / 100, b: prix / 100, uniteA: 'euro', uniteB: 'euro' },
				},
			],
		);
	}
	if (cas <= 7) {
		// État final — recette (addition) : « on lui donne ».
		const avoir = prixCentimes(2, 20);
		const don = prixCentimes(1, 15);
		return probleme(
			`${p.nom} a ${euros(avoir)} € dans sa tirelire. On lui donne ${euros(don)} €.`,
			[
				{
					question: `Combien a-t-${il(p.genre)} maintenant ?`,
					answer: (avoir + don) / 100,
					unite: 'euro',
					calcul: { op: '+', a: avoir / 100, b: don / 100, uniteA: 'euro', uniteB: 'euro' },
				},
			],
		);
	}
	// Recherche de la transformation (soustraction) : deux états connus → le coût.
	const cout = prixCentimes(2, 12);
	const apres = prixCentimes(1, 10);
	const avant = cout + apres;
	return probleme(
		`${p.nom} avait ${euros(avant)} €. Après avoir acheté un ${art.s}, il lui reste ${euros(apres)} €.`,
		[
			{
				question: `Combien a coûté le ${art.s} ?`,
				answer: cout / 100,
				unite: 'euro',
				calcul: { op: '-', a: avant / 100, b: apres / 100, uniteA: 'euro', uniteB: 'euro' },
			},
		],
	);
}

/* ---------- Comparaison décimale (écart / « de plus ») ---------- */
function genComparaisonDec(): Exercise {
	const [p1, p2] = deuxPrenoms();
	const argent = rnd(0, 1) === 0;
	if (rnd(1, 10) <= 6) {
		// Écart : « combien de plus ? » (soustraction, retenue fréquente). Loyal.
		if (argent) {
			const petit = prixCentimes(2, 15);
			const ecart = prixCentimes(1, 12);
			const grand = petit + ecart;
			return probleme(`${p1.nom} a ${euros(grand)} €. ${p2.nom} a ${euros(petit)} €.`, [
				{
					question: `Combien ${p1.nom} a-t-${il(p1.genre)} d'argent de plus que ${p2.nom} ?`,
					answer: ecart / 100,
					unite: 'euro',
					calcul: { op: '-', a: grand / 100, b: petit / 100, uniteA: 'euro', uniteB: 'euro' },
				},
			]);
		}
		const petit = mesureDixiemes(1, 4);
		const ecart = mesureDixiemes(1, 3);
		const grand = petit + ecart;
		return mesureProbleme(
			MASSE,
			(u) => `Le sac de ${p1.nom} pèse ${u(grand)}. Celui de ${p2.nom} pèse ${u(petit)}.`,
			[
				{
					question: `Combien le sac de ${p1.nom} pèse-t-il de plus ?`,
					answer: ecart / 10,
					calcul: { op: '-', a: grand / 10, b: petit / 10 },
				},
			],
		);
	}
	// « de plus » loyal (addition) : on connaît une valeur et l'écart, on cherche l'autre.
	if (argent) {
		const base = prixCentimes(2, 15);
		const deplus = prixCentimes(1, 10);
		return probleme(
			`${p1.nom} a ${euros(base)} €. ${p2.nom} a ${euros(deplus)} € de plus que ${p1.nom}.`,
			[
				{
					question: `Combien ${p2.nom} a-t-${il(p2.genre)} d'argent ?`,
					answer: (base + deplus) / 100,
					unite: 'euro',
					calcul: { op: '+', a: base / 100, b: deplus / 100, uniteA: 'euro', uniteB: 'euro' },
				},
			],
		);
	}
	const base = mesureDixiemes(1, 4);
	const deplus = mesureDixiemes(1, 3);
	return mesureProbleme(
		LONGUEUR,
		(u) =>
			`Le ruban de ${p1.nom} mesure ${u(base)}. Celui de ${p2.nom} mesure ${u(deplus)} de plus.`,
		[
			{
				question: `Quelle est la longueur du ruban de ${p2.nom} ?`,
				answer: (base + deplus) / 10,
				calcul: { op: '+', a: base / 10, b: deplus / 10 },
			},
		],
	);
}

/* ---------- Multiplication décimale (prix × quantité) ---------- */
function genMultiplicationDec(): Exercise {
	const p = prenom();
	const art = choice(ACHATS);
	const n = rnd(2, 5);
	// Prix unitaire petit (partie entière ≤ 5 €) → produit ≲ 25 € (décimal × entier < 10).
	const prix = prixCentimes(1, Math.min(5, Math.floor(20 / n)));
	return probleme(`${p.nom} achète ${n} ${art.p} à ${euros(prix)} € chacun.`, [
		{
			question: `Combien ${p.nom} paie-t-${il(p.genre)} en tout ?`,
			answer: (n * prix) / 100,
			unite: 'euro',
			// `a` est un NOMBRE D'ARTICLES : il n'a pas à s'écrire en euros (cf. CalculEtape).
			calcul: { op: 'x', a: n, b: prix / 100, uniteB: 'euro' },
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
			{
				question: `Combien coûtent les ${n} ${art.p} ?`,
				answer: cout,
				unite: 'euro',
				// `a` est un NOMBRE D'ARTICLES, `b` le prix unitaire (cf. CalculEtape).
				calcul: { op: 'x', a: n, b: m, uniteB: 'euro' },
			},
			{
				question: `Combien lui rend-on ?`,
				answer: billet - cout,
				unite: 'euro',
				// `deB: 0` : le coût n'est pas dans l'énoncé, c'est la réponse de la 1re
				// sous-question. C'est LE point que l'étayage (#490) sait expliquer d'un
				// problème à deux étapes, et il faut le lui dire — le deviner par égalité de
				// valeur tiendrait du hasard.
				calcul: { op: '-', a: billet, b: cout, deB: 0, uniteA: 'euro', uniteB: 'euro' },
			},
		],
	);
}

/* ---------- Catalogue des leçons ---------- */

// `levels` (#255) : facultatif — les types mono-niveau restent CE2 (défaut du catalogue) ;
// les structures ouvertes au CM1 le déclarent (['ce2','cm1']) pour que le catalogue en
// dérive `LessonDef.levels`. `generate` reçoit `opts` (mode + niveau, #225) : le runner
// « problème » le transmet, un générateur mono-niveau l'ignore (comportement identique).
const monoMode = (
	generate: (opts?: GenerateOpts) => Exercise,
	levels?: SchoolLevel[],
): ExerciseType => ({
	// Format « problème » (#199) : classé sans appeler generate() (#348), exclu du sprint.
	exerciseKind: 'probleme',
	...(levels ? { levels } : {}),
	generate,
	check: () => false, // corrigé par le runner dédié (étape par étape), jamais génériquement
});

// Ordre d'affichage calé sur l'acquisition des opérations (avis pédagogue) :
// composition → transformation (additif) → multiplication → partage (division) →
// comparaison (la plus abstraite) → deux étapes (la plus exigeante).
// Quatre structures ouvertes au CM1 en décimal (#255) → levels ['ce2','cm1']. Partage
// (quotient décimal = CM2) et « deux étapes » (hors « à une étape ») restent CE2-only.
const CE2_CM1: SchoolLevel[] = ['ce2', 'cm1'];

/* ---------- Étayage de la notion (#490) ----------
   Ces leçons n'ont PAS d'exemple canonique, et c'est délibéré : la difficulté d'un problème
   tient à SON énoncé, pas à une structure qu'un exemple figé illustrerait. Le déroulé se
   fait donc sur le problème que l'enfant vient de rater (le runner le passe au panneau) ; le
   bouton persistant, lui, n'ouvre que la règle — jamais l'énoncé en cours, dont il donnerait
   la réponse.

   La règle, elle, dit la STRUCTURE de la leçon, pas une recette de mots-clés : « de plus »
   n'annonce pas une addition, et c'est justement ce que la leçon « comparer » teste. */
function etayageProbleme(titre: string, regle: string): NonNullable<LessonInput['etayage']> {
	return [{ contenu: { titre, regle } }];
}

export const PROBLEMES_LESSONS: LessonInput[] = [
	{
		id: 'math-prob-composition',
		label: 'Parties et tout',
		exerciseType: monoMode(genComposition, CE2_CM1),
		etayage: etayageProbleme(
			'Parties et tout',
			'Si tu connais les parties, tu les ajoutes pour trouver le tout ; si tu connais le tout et une partie, tu retires.',
		),
	},
	{
		id: 'math-prob-transformation',
		label: 'Gagner ou perdre',
		exerciseType: monoMode(genTransformation, CE2_CM1),
		etayage: etayageProbleme(
			'Gagner ou perdre',
			"Ce qu'on gagne s'ajoute, ce qu'on perd se retire. Mais pour retrouver le DÉBUT, il faut faire le contraire.",
		),
	},
	{
		id: 'math-prob-multiplication',
		label: 'Des groupes égaux',
		exerciseType: monoMode(genMultiplication, CE2_CM1),
		etayage: etayageProbleme(
			'Des groupes égaux',
			'Quand tous les groupes ont la même taille, tu multiplies le nombre de groupes par ce que contient un groupe.',
		),
	},
	{
		id: 'math-prob-partage',
		label: 'Partager et grouper',
		exerciseType: monoMode(genPartage),
		etayage: etayageProbleme(
			'Partager et grouper',
			"Partager en parts égales et faire des paquets identiques, c'est la même opération : une division.",
		),
	},
	{
		id: 'math-prob-comparaison',
		label: 'Comparer (plus ou moins)',
		exerciseType: monoMode(genComparaison, CE2_CM1),
		etayage: etayageProbleme(
			'Comparer (plus ou moins)',
			'« De plus » ne veut pas toujours dire « on ajoute » : regarde bien de QUI on parle avant de choisir ton opération.',
		),
	},
	{
		id: 'math-prob-deux-etapes',
		label: 'Problèmes en deux étapes',
		exerciseType: monoMode(genDeuxEtapes),
		etayage: etayageProbleme(
			'Problèmes en deux étapes',
			"Tu réponds d'abord à la première question, puis tu te sers de son résultat pour répondre à la seconde.",
		),
	},
];
