/* ============================================================
   Grammaire CM1 — « Nommer les constituants du groupe nominal » (#731).
   ------------------------------------------------------------
   SPÉCIFICATION ÉCRITE AVANT LE CODE. À la livraison de ce fichier, la leçon
   `fr-gram-gn-nommer` n'existe pas : la quasi-totalité de ces tests sont ROUGES, et
   c'est l'état attendu. Ils décrivent ce que l'implémentation devra tenir, pas ce
   qu'elle fait. (Les seuls verts d'emblée sont le verrou du critère 14 — la banque de
   #716, déjà livrée, ne doit pas bouger — et les témoins qui prouvent que les oracles
   de ce fichier mordent ; les deux viennent avec leur mutation, jouée ici même.)

   Les attendus sont DÉRIVÉS des critères de l'issue #731 et du programme CM1 (§5.1
   « Analyser le groupe nominal » : Dét + Nom ; Dét + Nom + Adj ; Dét + Adj + Nom),
   jamais relus d'une implémentation.

   ── Pourquoi tout passe par le CATALOGUE et par le TIRAGE ────────────────────
   Ce fichier n'importe AUCUN module de la nouvelle leçon : il n'en connaît que l'id
   (`fr-gram-gn-nommer`, arrêté au cadrage) et le format (`appariement`). Deux raisons.
   D'abord il n'impose pas au développeur un chemin de fichier ni des noms d'export :
   un test rouge doit dire qu'une EXIGENCE manque, pas qu'un module n'a pas le nom
   qu'on avait imaginé. Ensuite la banque réellement SERVIE est ce que l'enfant
   rencontre — c'est elle qu'il faut compter, pas un tableau qui pourrait très bien
   n'être branché nulle part.
   La banque est donc ÉNUMÉRÉE par un tirage large sous graines (`withSeed`), avec un
   contrôle de SATURATION (le nombre d'items distincts ne bouge plus entre la moitié et
   la totalité du tirage) : sans lui, un comptage sur un tirage partiel serait un
   comptage aléatoire déguisé en invariant.

   ── Ce que ce fichier NE couvre pas ─────────────────────────────────────────
   Critère 7 (l'enfant VOIT l'appariement juste après son erreur) et critère 8 (la
   remontée au journal encadrant) : ce sont des écrans et un geste → `auteur-tests-e2e`.
   Critère 1 (la tâche va du mot vers l'étiquette) ne se mécanise ici qu'à moitié : la
   moitié logique est que chaque mot du groupe porte sa propre étiquette et qu'AUCUNE
   consigne ne nomme une classe cible à chercher ; la moitié « geste » est e2e.

   ── Les oracles, et pourquoi ils sont écrits à la main ───────────────────────
   Le cœur de la leçon est une AFFIRMATION sur le français : « petit » est un adjectif,
   « chien » un nom. Un test qui lirait l'étiquette servie pour décider de quoi il
   s'agit ne vérifierait rien — il recopierait la réponse. Les lexiques ci-dessous sont
   donc écrits ici, indépendamment de la donnée, et le déterminant est lu depuis
   `DET_SETS` (vocabulaire PARTAGÉ du moteur, pas une liste de la nouvelle leçon : deux
   listes de déterminants qui divergent, c'est un garde-fou qui accepte ici ce qu'il
   refuse ailleurs).
   Limite assumée, et rendue BRUYANTE : la liste d'adjectifs est finie. Un groupe de
   trois mots dont aucun n'est reconnu fait ÉCHOUER le test avec un message qui demande
   d'étendre la liste — le trou ne peut pas rester muet. Voir le compte rendu : la
   bonne sortie à terme est que la DONNÉE déclare le rôle de chaque mot (le générateur
   en a besoin de toute façon pour fabriquer les paires), l'oracle d'ici servant alors à
   confronter une déclaration au lieu de l'inventer.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, genLessonItem, type LessonDef } from '../src/core/catalog';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';
import { withSeed } from '../src/core/utils';
import { consignePourNiveau, type Exercise } from '../src/core/exercise';
import { DET_SETS, type SousCatDet } from '../src/data/francais/grammaire-clic-mot-moteur';
import { PHRASES_GN } from '../src/data/francais/grammaire-groupe-nominal';
import {
	joindrePhrase,
	libelleCible,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';

const LECON = 'fr-gram-gn-nommer';
const LECON_716 = 'fr-gram-groupe-nominal';
const lc = (s: string): string => s.toLowerCase();

/* ============================================================
   1. Lexiques RE-DÉRIVÉS (programme CM1 + grammaire), jamais importés d'une banque.
   ============================================================ */

/* Déterminants : union des trois sous-catégories nommées par le programme CM1,
   LUE du vocabulaire partagé du moteur (cf. en-tête). */
const DETERMINANTS = new Set<string>([
	...DET_SETS.article,
	...DET_SETS.possessif,
	...DET_SETS.demonstratif,
]);

/* Adjectifs reconnus par CE fichier. Liste finie, donc faillible — d'où le message
   d'échec explicite quand un groupe de trois mots n'en contient aucun de reconnu. */
const ADJECTIFS = new Set([
	'petit',
	'petite',
	'petits',
	'petites',
	'grand',
	'grande',
	'grands',
	'grandes',
	'gros',
	'grosse',
	'grosses',
	'joli',
	'jolie',
	'jolis',
	'jolies',
	'beau',
	'bel',
	'belle',
	'beaux',
	'belles',
	'vieux',
	'vieille',
	'vieilles',
	'jeune',
	'jeunes',
	'neuf',
	'neuve',
	'ancien',
	'ancienne',
	'anciens',
	'anciennes',
	'noir',
	'noire',
	'noirs',
	'noires',
	'blanc',
	'blanche',
	'blancs',
	'blanches',
	'rouge',
	'rouges',
	'bleu',
	'bleue',
	'bleus',
	'bleues',
	'vert',
	'verte',
	'verts',
	'vertes',
	'jaune',
	'jaunes',
	'gris',
	'grise',
	'grises',
	'brun',
	'brune',
	'doré',
	'dorée',
	'dorés',
	'dorées',
	'coloré',
	'colorée',
	'colorés',
	'colorées',
	'haut',
	'haute',
	'hauts',
	'hautes',
	'long',
	'longue',
	'longs',
	'longues',
	'court',
	'courte',
	'courts',
	'courtes',
	'large',
	'larges',
	'étroit',
	'étroite',
	'étroits',
	'étroites',
	'profond',
	'profonde',
	'profondes',
	'épais',
	'épaisse',
	'épaisses',
	'fin',
	'fine',
	'fins',
	'fines',
	'rond',
	'ronde',
	'ronds',
	'rondes',
	'carré',
	'carrée',
	'carrés',
	'carrées',
	'immense',
	'immenses',
	'énorme',
	'énormes',
	'minuscule',
	'minuscules',
	'lourd',
	'lourde',
	'lourds',
	'lourdes',
	'léger',
	'légère',
	'légers',
	'légères',
	'chaud',
	'chaude',
	'chauds',
	'chaudes',
	'froid',
	'froide',
	'froids',
	'froides',
	'doux',
	'douce',
	'douces',
	'dur',
	'dure',
	'durs',
	'dures',
	'sec',
	'sèche',
	'sèches',
	'humide',
	'humides',
	'propre',
	'propres',
	'sale',
	'sales',
	'sombre',
	'sombres',
	'clair',
	'claire',
	'clairs',
	'claires',
	'brillant',
	'brillante',
	'brillants',
	'brillantes',
	'rapide',
	'rapides',
	'lent',
	'lente',
	'lents',
	'lentes',
	'calme',
	'calmes',
	'tranquille',
	'tranquilles',
	'sage',
	'sages',
	'gentil',
	'gentille',
	'gentils',
	'gentilles',
	'méchant',
	'méchante',
	'poli',
	'polie',
	'timide',
	'timides',
	'courageux',
	'courageuse',
	'courageuses',
	'curieux',
	'curieuse',
	'curieuses',
	'joyeux',
	'joyeuse',
	'joyeuses',
	'heureux',
	'heureuse',
	'heureuses',
	'délicieux',
	'délicieuse',
	'délicieuses',
	'silencieux',
	'silencieuse',
	'bruyant',
	'bruyante',
	'bruyants',
	'bruyantes',
	'passionnant',
	'passionnante',
	'amusant',
	'amusante',
	'amusants',
	'amusantes',
	'fatigué',
	'fatiguée',
	'cassé',
	'cassée',
	'cassés',
	'cassées',
	'rempli',
	'remplie',
	'remplis',
	'remplies',
	'mûr',
	'mûre',
	'mûrs',
	'mûres',
	'salé',
	'salée',
	'sucré',
	'sucrée',
	'sucrés',
	'sucrées',
	'fort',
	'forte',
	'forts',
	'fortes',
	'faible',
	'faibles',
	'nouveau',
	'nouvel',
	'nouvelle',
	'nouveaux',
	'nouvelles',
	'magnifique',
	'magnifiques',
	'superbe',
	'superbes',
	'étrange',
	'étranges',
	'pointu',
	'pointue',
	'pointus',
	'pointues',
	'plat',
	'plate',
	'plats',
	'plates',
	'mouillé',
	'mouillée',
	'vide',
	'vides',
	'plein',
	'pleine',
	'pleins',
	'pleines',
	'drôle',
	'drôles',
	'solide',
	'solides',
	'fragile',
	'fragiles',
	'sauvage',
	'sauvages',
	'savoureux',
	'savoureuse',
	'utile',
	'utiles',
	'triste',
	'tristes',
	'gourmand',
	'gourmande',
	'gourmands',
	'gourmandes',
	'souriant',
	'souriante',
	'bavard',
	'bavarde',
	'bavards',
	'bavardes',
	'rugueux',
	'rugueuse',
	'lisse',
	'lisses',
	'pointilleux',
	'maladroit',
	'maladroite',
	'adroit',
	'adroite',
]);

/* Mots qui ne peuvent PAS entrer dans un groupe nominal du programme CM1 : ils
   signaleraient un mot pris hors du groupe (critère 12). `le`/`la`/`les`/`leur` sont
   volontairement absents de la liste des pronoms : en tête de groupe, ce sont des
   déterminants. */
const PRONOMS = new Set([
	'je',
	'tu',
	'il',
	'elle',
	'on',
	'nous',
	'vous',
	'ils',
	'elles',
	'me',
	'te',
	'se',
	'lui',
	'eux',
	'moi',
	'toi',
	'y',
	'en',
	'celui',
	'celle',
	'ceux',
	'celles',
	'qui',
	'que',
	'dont',
	'où',
]);

const PREPOSITIONS = new Set([
	'de',
	'du',
	'à',
	'au',
	'aux',
	'en',
	'dans',
	'sur',
	'sous',
	'avec',
	'sans',
	'pour',
	'par',
	'chez',
	'vers',
	'contre',
	'entre',
	'près',
	'depuis',
	'devant',
	'derrière',
	'pendant',
	'malgré',
	'selon',
	'parmi',
]);
const PREFIXES_PREPOSITION = ["d'", "jusqu'"];

/* Déterminant ÉLIDÉ : le tokeniseur maison colle l'apostrophe au nom, si bien que
   « l'oiseau » est UN mot. Le groupe ne se découpe alors plus en 2 ou 3 morceaux
   étiquetables — l'enfant ne pourrait pas nommer le déterminant à part. */
const estElide = (t: string): boolean => lc(t).startsWith("l'");

const CONJONCTIONS = new Set(['et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'quand', 'comme']);

/* Adverbes : liste explicite + suffixe « -ment », avec les noms en « -ment » qui
   feraient sinon un faux positif (« un monument », « ses vêtements »). */
const ADVERBES_EXPLICITES = new Set([
	'très',
	'trop',
	'assez',
	'si',
	'bien',
	'mal',
	'plus',
	'moins',
	'vite',
	'souvent',
	'toujours',
	'parfois',
	'partout',
	'beaucoup',
	'ensemble',
	'longtemps',
	'tôt',
	'tard',
	'encore',
	'ici',
	'là',
	'dehors',
	'hier',
	'demain',
	'vraiment',
	'presque',
	'aussi',
	'tellement',
	'peu',
	'plutôt',
]);
const NOMS_EN_MENT = new Set([
	'moment',
	'moments',
	'ciment',
	'ciments',
	'vêtement',
	'vêtements',
	'appartement',
	'appartements',
	'bâtiment',
	'bâtiments',
	'monument',
	'monuments',
	'aliment',
	'aliments',
	'document',
	'documents',
	'instrument',
	'instruments',
	'élément',
	'éléments',
	'sentiment',
	'sentiments',
	'mouvement',
	'mouvements',
	'changement',
	'changements',
	'gouvernement',
	'logement',
	'logements',
	'jugement',
	'événement',
	'événements',
	'environnement',
	'enseignement',
	'paiement',
	'campement',
	'régiment',
	'segment',
	'fragment',
	'firmament',
]);

const estDeterminant = (t: string): boolean => DETERMINANTS.has(lc(t));
const estAdjectif = (t: string): boolean => ADJECTIFS.has(lc(t));
const estPronom = (t: string): boolean => PRONOMS.has(lc(t));
const estConjonction = (t: string): boolean => CONJONCTIONS.has(lc(t));
const estPreposition = (t: string): boolean =>
	PREPOSITIONS.has(lc(t)) || PREFIXES_PREPOSITION.some((p) => lc(t).startsWith(p));
const estAdverbe = (t: string): boolean => {
	const m = lc(t);
	if (ADVERBES_EXPLICITES.has(m)) return true;
	return m.endsWith('ment') && m.length > 5 && !NOMS_EN_MENT.has(m);
};

/** Sous-catégorie de déterminant (critère 5), ou `null` si le mot n'en est pas un. */
function sousCatDeterminant(t: string): SousCatDet | null {
	const m = lc(t);
	for (const cat of Object.keys(DET_SETS) as SousCatDet[]) {
		if (DET_SETS[cat].has(m)) return cat;
	}
	return null;
}

/* ============================================================
   2. Vocabulaire PROSCRIT (critères 9, 10 et 13).
   ------------------------------------------------------------
   Détecteur appliqué à TOUT ce que l'enfant peut lire : libellé de la leçon,
   mots-clés, étayage, consigne, énoncé de chaque item, et chaque étiquette servie.
   On teste la RÈGLE, pas la graphie : « noyau » est proscrit quelle que soit la
   formulation qui le porte.
   ============================================================ */
const PROSCRITS: Array<[string, RegExp]> = [
	// Critère 10 — « nom noyau » : dans un groupe de 2 ou 3 mots il n'y a qu'un nom.
	['critère 10 : « noyau »', /noyau/i],
	// Critère 13 — la leçon demande la NATURE, jamais la FONCTION.
	['critère 13 : fonction « épithète »', /[ée]pith[èe]te/i],
	['critère 13 : fonction « sujet »', /\bsujets?\b/i],
	['critère 13 : fonction « complément »', /\bcompl[ée]ments?\b/i],
	['critère 13 : fonction « attribut »', /\battributs?\b/i],
	['critère 13 : fonction « C.O.D. / C.O.I. »', /\bc\.?\s?o\.?\s?[di]\b/i],
	// Critère 9 — les trois patrons sont un outil d'auteur, pas un objectif d'élève.
	['critère 9 : notation de patron (« Dét + … »)', /d[ée]t\s*\.?\s*\+/i],
	['critère 9 : notation de patron (« … + Nom »)', /\+\s*nom\b/i],
	['critère 9 : sigle de patron (DN / DNA / DAN)', /\b(?:DN|DNA|DAN)\b/],
	['critère 9 : le mot « patron »', /\bpatrons?\b/i],
	['critère 9 : le mot « modèle » appliqué au groupe', /mod[èe]le\s+d[eu]\s+groupe/i],
];

/** Liste des règles de vocabulaire violées par un texte lu par l'enfant. */
function motsProscrits(texte: string): string[] {
	return PROSCRITS.filter(([, re]) => re.test(texte)).map(([nom]) => nom);
}

/* ============================================================
   3. Accès à la leçon et à la banque SERVIE.
   ============================================================ */
type Manche = Extract<Exercise, { type: 'appariement' }>;

function lecon(): LessonDef {
	const def = getLessonById(LECON);
	if (!def) {
		throw new Error(
			`Leçon « ${LECON} » absente du catalogue : l'enfant ne peut pas nommer les ` +
				'constituants du groupe nominal (#731).',
		);
	}
	return def;
}

function tirer(seed: number): Manche {
	const ex = withSeed(seed, () => lecon().exerciseType.generate({ level: 'cm1' }));
	if (ex.type !== 'appariement') {
		throw new Error(
			`graine ${seed} : format « ${ex.type} » servi au lieu de « appariement » — l'enfant ` +
				'ne peut pas relier chaque mot à son étiquette.',
		);
	}
	return ex;
}

/** Clé d'identité d'un item servi : l'énoncé + l'ensemble des mots à étiqueter. */
const cleManche = (m: Manche): string =>
	`${m.question}##${m.paires
		.map((p) => lc(p.gauche))
		.sort()
		.join('|')}`;

/* Taille du tirage d'énumération. Avec une banque de l'ordre de la cinquantaine
   d'items tirés uniformément, la probabilité qu'un item échappe à 4 000 tirages est
   de l'ordre de 50·e^(-80) : l'énumération est exhaustive en pratique, et le test de
   SATURATION plus bas le CONSTATE au lieu de le supposer. */
const TIRAGES = 4000;

let cacheBanque: Manche[] | null = null;

/** La banque telle qu'elle est SERVIE : items distincts rencontrés sur un tirage large
    et reproductible. C'est sur elle que portent les comptages des critères 4, 5 et 6. */
function banqueServie(): Manche[] {
	if (cacheBanque) return cacheBanque;
	const vus = new Map<string, Manche>();
	for (let seed = 0; seed < TIRAGES; seed++) {
		const m = tirer(seed);
		const cle = cleManche(m);
		if (!vus.has(cle)) vus.set(cle, m);
	}
	cacheBanque = [...vus.values()];
	return cacheBanque;
}

/* ============================================================
   4. Analyse INDÉPENDANTE d'un item : qui est le déterminant, l'adjectif, le nom,
      et dans quel ordre. Jamais lue des étiquettes servies — c'est justement elles
      qu'on vérifiera ensuite.
   ============================================================ */
interface Groupe {
	mots: string[];
	det: string;
	adj: string | null;
	nom: string;
	sousCat: SousCatDet;
	/** « DAN » = l'adjectif précède le nom (« un grand tableau »), le piège du critère 4. */
	patron: 'DN' | 'DNA' | 'DAN';
}

type Analyse = { ok: true; g: Groupe } | { ok: false; raison: string };

/** Occurrences de `mot` dans `texte`, en MOT ENTIER (insensible à la casse) : « le »
    ne doit pas se trouver dans « leçon », ni « nom » dans « pronom ». */
function occurrences(texte: string, mot: string): number[] {
	const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`(?<![\\p{L}\\p{N}'-])${echappe}(?![\\p{L}\\p{N}'-])`, 'giu');
	const out: number[] = [];
	for (let m = re.exec(texte); m !== null; m = re.exec(texte)) out.push(m.index);
	return out;
}

function analyser(m: Manche): Analyse {
	const ou = `« ${m.question} »`;
	const mots = m.paires.map((p) => p.gauche);

	if (mots.length < 2 || mots.length > 3) {
		return {
			ok: false,
			raison: `${ou} : ${mots.length} mot(s) à étiqueter — un groupe du programme CM1 en fait 2 (Dét + Nom) ou 3`,
		};
	}
	if (new Set(mots.map(lc)).size !== mots.length) {
		return { ok: false, raison: `${ou} : le même mot est proposé deux fois (${mots.join(', ')})` };
	}
	// Critère 1/2 : le groupe est MONTRÉ, déjà délimité, dans l'énoncé.
	const absents = mots.filter((t) => occurrences(m.question, t).length === 0);
	if (absents.length) {
		return {
			ok: false,
			raison: `${ou} : le(s) mot(s) ${absents.map((t) => `« ${t} »`).join(', ')} ne figurent pas dans l'énoncé — l'enfant étiquette un groupe qu'il ne voit pas`,
		};
	}

	const elides = mots.filter(estElide);
	if (elides.length) {
		return {
			ok: false,
			raison: `${ou} : ${elides.map((t) => `« ${t} »`).join(', ')} colle le déterminant au nom — l'enfant ne peut pas étiqueter l'un sans l'autre`,
		};
	}

	const dets = mots.filter(estDeterminant);
	if (dets.length === 0) {
		return {
			ok: false,
			raison: `${ou} : aucun déterminant parmi ${mots.join(', ')} — ce n'est pas un groupe nominal du programme CM1`,
		};
	}
	if (dets.length > 1) {
		return {
			ok: false,
			raison: `${ou} : deux déterminants (${dets.join(', ')}) — groupe emboîté, interdit par le critère 11`,
		};
	}
	const det = dets[0];
	const sousCat = sousCatDeterminant(det);
	if (!sousCat) return { ok: false, raison: `${ou} : sous-catégorie de « ${det} » introuvable` };

	const autres = mots.filter((t) => !estDeterminant(t));
	const intrus = autres.filter(
		(t) => estPronom(t) || estPreposition(t) || estAdverbe(t) || estConjonction(t),
	);
	if (intrus.length) {
		return {
			ok: false,
			raison: `${ou} : ${intrus.map((t) => `« ${t} »`).join(', ')} n'est pas un constituant du groupe nominal (pronom, préposition, adverbe ou conjonction) — critères 11 et 12`,
		};
	}

	if (mots.length === 2) {
		return { ok: true, g: { mots, det, adj: null, nom: autres[0], sousCat, patron: 'DN' } };
	}

	const adjs = autres.filter(estAdjectif);
	if (adjs.length === 0) {
		return {
			ok: false,
			raison: `${ou} : aucun adjectif reconnu dans « ${mots.join(' ')} » — soit le groupe n'est pas un des trois patrons du programme, soit le lexique ADJECTIFS de ce test est à étendre`,
		};
	}
	if (adjs.length > 1) {
		return {
			ok: false,
			raison: `${ou} : deux adjectifs épithètes (${adjs.join(', ')}) pour un seul nom — interdit par le critère 11`,
		};
	}
	const adj = adjs[0];
	const nom = autres.find((t) => lc(t) !== lc(adj));
	if (nom === undefined) return { ok: false, raison: `${ou} : nom du groupe introuvable` };

	// Ordre lu dans l'ÉNONCÉ (pas dans l'ordre des paires, que le format mélange).
	const pAdj = occurrences(m.question, adj);
	const pNom = occurrences(m.question, nom);
	if (pAdj.length !== 1 || pNom.length !== 1) {
		return {
			ok: false,
			raison: `${ou} : « ${adj} » (${pAdj.length}×) et « ${nom} » (${pNom.length}×) doivent figurer UNE SEULE fois dans l'énoncé, sinon le groupe montré est ambigu`,
		};
	}
	return {
		ok: true,
		g: { mots, det, adj, nom, sousCat, patron: pAdj[0] < pNom[0] ? 'DAN' : 'DNA' },
	};
}

/** Les groupes de la banque servie dont l'analyse aboutit. Les autres sont signalés
    par le test dédié (« tout item servi est analysable »). */
function groupesServis(): Array<{ m: Manche; g: Groupe }> {
	const out: Array<{ m: Manche; g: Groupe }> = [];
	for (const m of banqueServie()) {
		const a = analyser(m);
		if (a.ok) out.push({ m, g: a.g });
	}
	return out;
}

/* ============================================================
   5. Étiquettes : à quelle CLASSE renvoie une étiquette servie ?
      Les libellés exacts ne sont pas arrêtés : on ne teste pas leur graphie, on teste
      qu'ils NOMMENT une et une seule des trois classes du programme.
   ============================================================ */
type Classe = 'determinant' | 'nom' | 'adjectif';

const RACINES: Array<[Classe, RegExp]> = [
	['determinant', /d[ée]termin/i],
	['adjectif', /adjectif/i],
	// Mot entier : « pronom » ne doit pas passer pour « nom ».
	['nom', /(?<![\p{L}\p{N}])noms?(?![\p{L}\p{N}])/iu],
];

/** Classe nommée par une étiquette, ou `null` si elle n'en nomme aucune / plusieurs. */
function classeEtiquette(label: string): Classe | null {
	const trouvees = RACINES.filter(([, re]) => re.test(label)).map(([c]) => c);
	return trouvees.length === 1 ? trouvees[0] : null;
}

/** Classe ATTENDUE d'un mot du groupe, d'après l'analyse indépendante. */
function classeAttendue(g: Groupe, mot: string): Classe {
	if (lc(mot) === lc(g.det)) return 'determinant';
	if (g.adj !== null && lc(mot) === lc(g.adj)) return 'adjectif';
	return 'nom';
}

/* ============================================================
   6. Catalogue et branchement.
   ============================================================ */
describe('Catalogue — fr-gram-gn-nommer (#731)', () => {
	it('la leçon existe, en grammaire française, au CM1 seulement', () => {
		const def = lecon();
		expect(def.subject).toBe('francais');
		expect(def.category).toBe('fr-grammaire');
		expect(def.levels).toEqual(['cm1']);
		expect(def.levels, 'notion du programme CM1, hors périmètre au CE2').not.toContain('ce2');
	});

	it('format « appariement » : relier chaque mot à son étiquette', () => {
		expect(lecon().exerciseType.exerciseKind).toBe('appariement');
	});

	it('mode unique, au libellé non vide', () => {
		const modes = lecon().exerciseType.modes ?? [];
		expect(modes.length, 'un seul geste : relier').toBe(1);
		expect(modes[0].label.trim().length, 'libellé de mode vide').toBeGreaterThan(0);
	});

	it('la leçon suit immédiatement « Repère le groupe nominal » dans l’ordre pédagogique', () => {
		// L'arc entre les deux leçons du groupe nominal est porté par l'ordre pédagogique
		// (section « Hors périmètre » de l'issue : pas de second mode sur #716).
		const ordre = ORDRE_LECONS.francais?.cm1 ?? [];
		expect(ordre, `${LECON} absent de ORDRE_LECONS.francais.cm1`).toContain(LECON);
		const iRepere = ordre.indexOf(LECON_716);
		expect(iRepere, `${LECON_716} absent de l'ordre pédagogique`).toBeGreaterThanOrEqual(0);
		expect(
			ordre[iRepere + 1],
			'délimiter le groupe doit précéder immédiatement le fait d’en nommer les mots',
		).toBe(LECON);
	});

	it('tirage DÉTERMINISTE sous graine, et non figé d’une graine à l’autre', () => {
		for (const seed of [3, 17, 42, 128, 999]) {
			expect(tirer(seed), `graine ${seed}`).toEqual(tirer(seed));
		}
		const vus = new Set(Array.from({ length: 25 }, (_, k) => cleManche(tirer(k + 1))));
		expect(vus.size, 'générateur figé : toujours le même groupe').toBeGreaterThan(1);
	});

	it('la correction appartient au runner : `check` ne valide jamais', () => {
		const type = lecon().exerciseType;
		const ex = tirer(7);
		expect(type.check(ex, ex.paires[0].droite)).toBe(false);
		expect(type.check(ex, 'nimporte quoi')).toBe(false);
	});
});

/* ============================================================
   7. Structure d'un item servi — critères 2, 3 et 12.
   ============================================================ */
describe('Structure d’un item — critères 2, 3 et 12 (#731)', () => {
	it('l’énumération de la banque est SATURÉE (les comptages qui suivent portent bien sur la banque)', () => {
		const moitie = new Set<string>();
		for (let seed = 0; seed < TIRAGES / 2; seed++) moitie.add(cleManche(tirer(seed)));
		expect(
			banqueServie().length,
			'de nouveaux items apparaissent encore dans la seconde moitié du tirage : l’énumération n’est pas exhaustive, les comptages de composition seraient aléatoires',
		).toBe(moitie.size);
	});

	it('tout item servi est analysable : groupe de 2 ou 3 mots, un déterminant en tête, rien d’étranger', () => {
		const fautes = banqueServie()
			.map((m) => analyser(m))
			.filter((a): a is { ok: false; raison: string } => !a.ok)
			.map((a) => a.raison);
		expect(fautes, `${fautes.length} item(s) hors du contrat de la leçon`).toEqual([]);
	});

	it('critère 3 : AUCUN intrus — jamais une étiquette en trop à écarter', () => {
		const fautes = banqueServie()
			.filter((m) => (m.intrus ?? []).length > 0)
			.map((m) => `« ${m.question} » → intrus ${(m.intrus ?? []).join(', ')}`);
		expect(
			fautes,
			'une étiquette sans mot correspondant : l’enfant doit en écarter une, ce n’est plus une classification exhaustive',
		).toEqual([]);
	});

	it('critère 3 : autant d’étiquettes que de mots, et toutes différentes — ni emplacement vide ni doublon', () => {
		const fautes: string[] = [];
		for (const m of banqueServie()) {
			const labels = m.paires.map((p) => p.droite);
			if (new Set(labels.map(lc)).size !== labels.length) {
				fautes.push(
					`« ${m.question} » : la même étiquette est proposée deux fois (${labels.join(', ')})`,
				);
			}
			if (labels.some((l) => l.trim().length === 0)) {
				fautes.push(`« ${m.question} » : étiquette vide`);
			}
		}
		expect(fautes).toEqual([]);
	});

	it('critère 2 : chaque mot du groupe porte SA paire — aucun mot laissé sans réponse', () => {
		const fautes: string[] = [];
		for (const { m, g } of groupesServis()) {
			const gauches = m.paires.map((p) => lc(p.gauche)).sort();
			const attendus = g.mots.map(lc).sort();
			if (gauches.join('|') !== attendus.join('|')) {
				fautes.push(`« ${m.question} » : ${gauches.join(', ')} ≠ ${attendus.join(', ')}`);
			}
			if (m.paires.length !== g.mots.length) {
				fautes.push(
					`« ${m.question} » : ${m.paires.length} paire(s) pour ${g.mots.length} mot(s) du groupe`,
				);
			}
		}
		expect(fautes, 'un mot du groupe reste sans étiquette à poser').toEqual([]);
	});

	it('critère 1 : la consigne décrit le GESTE, elle ne nomme jamais une classe à chercher', () => {
		// Tâche inverse (déjà couverte par #436/#437) : « clique sur le déterminant ».
		// Ici, aucune classe ne doit être désignée comme CIBLE d'une recherche.
		const consigne = consignePourNiveau(lecon().exerciseType, 'cm1') ?? '';
		expect(consigne.trim().length, 'consigne vide').toBeGreaterThan(0);
		expect(
			/\b(?:clique|montre|touche|trouve|cherche|d[ée]signe)\b[^.!?]*\b(?:d[ée]terminant|adjectif|nom)\b/i.test(
				consigne,
			),
			`la consigne « ${consigne} » fait CHERCHER une classe : c'est la tâche inverse de #731`,
		).toBe(false);
		expect(consigne, 'apostrophe typographique (choix acté : apostrophe droite)').not.toContain(
			'’',
		);
	});
});

/* ============================================================
   8. Le cœur : les étiquettes servies disent le VRAI.
      Comparaison de l'étiquette servie à l'analyse indépendante du § 4.
   ============================================================ */
describe('Justesse des étiquettes (#731)', () => {
	it('la banque n’emploie que TROIS étiquettes, une par classe du programme', () => {
		const labels = new Set<string>();
		for (const m of banqueServie()) for (const p of m.paires) labels.add(p.droite);
		const classes = new Map<Classe, string[]>();
		const inconnues: string[] = [];
		for (const l of labels) {
			const c = classeEtiquette(l);
			if (!c) inconnues.push(l);
			else classes.set(c, [...(classes.get(c) ?? []), l]);
		}
		expect(
			inconnues,
			'étiquette qui ne nomme pas exactement une classe grammaticale (déterminant / nom / adjectif)',
		).toEqual([]);
		expect(
			[...classes.keys()].sort(),
			'les trois classes du programme doivent être servies',
		).toEqual(['adjectif', 'determinant', 'nom']);
		for (const [c, formes] of classes) {
			expect(
				formes,
				`la classe « ${c} » est nommée de plusieurs façons : l'enfant croirait à des étiquettes différentes`,
			).toHaveLength(1);
		}
	});

	it('chaque mot reçoit l’étiquette de SA classe (déterminant, nom, adjectif)', () => {
		const fautes: string[] = [];
		for (const { m, g } of groupesServis()) {
			for (const p of m.paires) {
				const attendue = classeAttendue(g, p.gauche);
				const servie = classeEtiquette(p.droite);
				if (servie !== attendue) {
					fautes.push(
						`« ${m.question} » : « ${p.gauche} » est étiqueté « ${p.droite} » alors que c'est un(e) ${attendue}`,
					);
				}
			}
		}
		expect(fautes, 'la leçon enseignerait une analyse fausse').toEqual([]);
	});

	it('un groupe de trois mots a exactement un adjectif et un nom ; un groupe de deux n’a pas d’adjectif', () => {
		const fautes: string[] = [];
		for (const { m, g } of groupesServis()) {
			const compte = (c: Classe): number =>
				m.paires.filter((p) => classeEtiquette(p.droite) === c).length;
			if (compte('determinant') !== 1) {
				fautes.push(`« ${m.question} » : ${compte('determinant')} déterminant(s)`);
			}
			if (compte('nom') !== 1) fautes.push(`« ${m.question} » : ${compte('nom')} nom(s)`);
			const adjAttendus = g.patron === 'DN' ? 0 : 1;
			if (compte('adjectif') !== adjAttendus) {
				fautes.push(
					`« ${m.question} » : ${compte('adjectif')} adjectif(s) pour un groupe ${g.patron}`,
				);
			}
		}
		expect(fautes).toEqual([]);
	});
});

/* ============================================================
   9. Composition de la banque — critères 4, 5 et 6.
      Comptages sur la BANQUE (items distincts), pas sur un tirage : un « au moins
      aussi nombreux » mesuré sur des tirages serait un pile ou face quand le rapport
      est proche de 1.
   ============================================================ */
describe('Composition de la banque — critères 4, 5 et 6 (#731)', () => {
	it('critère 4 : le piège Dét + Adj + Nom est au moins aussi nombreux que Dét + Nom + Adj', () => {
		const g = groupesServis().map((x) => x.g);
		const dan = g.filter((x) => x.patron === 'DAN');
		const dna = g.filter((x) => x.patron === 'DNA');
		expect(
			dan.length,
			'aucun « un grand tableau » : l’enfant n’affronte jamais l’erreur visée (étiqueter comme nom le mot qui suit le déterminant)',
		).toBeGreaterThan(0);
		expect(
			dan.length,
			`${dan.length} Dét + Adj + Nom pour ${dna.length} Dét + Nom + Adj : le patron où l'erreur se produit est sous-représenté`,
		).toBeGreaterThanOrEqual(dna.length);
	});

	it('critère 4 : le patron Dét + Nom est servi lui aussi (les trois patrons du programme)', () => {
		const patrons = new Set(groupesServis().map((x) => x.g.patron));
		expect([...patrons].sort(), 'un patron du programme CM1 ne sort jamais').toEqual([
			'DAN',
			'DN',
			'DNA',
		]);
	});

	it('critère 5 : article, possessif et démonstratif sont tous servis en tête de groupe', () => {
		const vues = new Set(groupesServis().map((x) => x.g.sousCat));
		for (const cat of ['article', 'possessif', 'demonstratif'] as SousCatDet[]) {
			expect(
				vues.has(cat),
				`aucun déterminant ${cat} : l'enfant n'a jamais à reconnaître cette sous-catégorie du programme`,
			).toBe(true);
		}
	});

	it('critère 6 : la banque MÊLE des groupes repris de #716 et un lot neuf, tous deux non vides', () => {
		const repris = groupesServis().filter((x) => GROUPES_716.has(cleGroupe(x.g.mots)));
		const neufs = groupesServis().filter((x) => !GROUPES_716.has(cleGroupe(x.g.mots)));
		expect(
			repris.map((x) => x.g.mots.join(' ')),
			'aucun groupe repris de « Repère le groupe nominal » : l’enfant ne retrouve rien de la leçon précédente',
		).not.toEqual([]);
		expect(
			neufs.map((x) => x.g.mots.join(' ')),
			'la banque est la copie de celle de #716 : aucun groupe neuf',
		).not.toEqual([]);
	});

	it('critère 6 : le LOT NEUF porte le piège Dét + Adj + Nom et les déterminants possessif et démonstratif', () => {
		const neufs = groupesServis()
			.map((x) => x.g)
			.filter((g) => !GROUPES_716.has(cleGroupe(g.mots)));
		expect(
			neufs.filter((g) => g.patron === 'DAN').map((g) => g.mots.join(' ')),
			'le lot neuf n’apporte aucun « un grand tableau »',
		).not.toEqual([]);
		for (const cat of ['possessif', 'demonstratif'] as SousCatDet[]) {
			expect(
				neufs.filter((g) => g.sousCat === cat).map((g) => g.mots.join(' ')),
				`le lot neuf n’apporte aucun déterminant ${cat}`,
			).not.toEqual([]);
		}
	});
});

/* ============================================================
   10. Vocabulaire et périmètre — critères 9, 10, 12 et 13.
   ============================================================ */
describe('Vocabulaire et périmètre — critères 9, 10 et 13 (#731)', () => {
	it('rien de ce que l’enfant LIT n’emploie « noyau », une fonction ou un nom de patron', () => {
		const def = lecon();
		const textes: Array<[string, string]> = [
			['libellé de la leçon', def.label],
			['mots-clés', (def.motsCles ?? []).join(' ')],
			['étayage', JSON.stringify(def.etayage ?? [])],
			['consigne', consignePourNiveau(def.exerciseType, 'cm1') ?? ''],
			['libellé par niveau', Object.values(def.labelNiveau ?? {}).join(' ')],
		];
		for (const m of banqueServie()) {
			textes.push(['énoncé', m.question]);
			for (const p of m.paires) textes.push(['étiquette', p.droite]);
		}
		const fautes: string[] = [];
		for (const [ou, texte] of textes) {
			for (const regle of motsProscrits(texte)) {
				fautes.push(`${ou} — ${regle} : « ${texte} »`);
			}
		}
		expect([...new Set(fautes)], 'vocabulaire hors périmètre de #731').toEqual([]);
	});

	it('critère 12 : aucun mot à étiqueter n’est un verbe, un adverbe ou un pronom de la phrase', () => {
		// Déjà couvert par l'analyse, mais isolé ici parce que c'est l'exemple d'échec
		// nommé par l'issue : « un item propose d'étiqueter le verbe ou un adverbe ».
		const fautes: string[] = [];
		for (const m of banqueServie()) {
			for (const p of m.paires) {
				if (estAdverbe(p.gauche) || estPronom(p.gauche) || estConjonction(p.gauche)) {
					fautes.push(`« ${m.question} » : « ${p.gauche} » n'appartient pas au groupe nominal`);
				}
			}
		}
		expect(fautes).toEqual([]);
	});

	it('repli non interactif (fiche / bilan) : le groupe entier reste lisible dans la question', () => {
		// Le repli partagé des appariements pose « Quel mot va avec « X » ? ». Pour CETTE
		// leçon, « X » seul est insuffisant : « le » hors de son groupe peut être un
		// pronom, et l'enfant ne peut pas répondre. Le critère 1 (« le groupe est montré
		// déjà délimité ») vaut aussi hors du runner.
		const def = lecon();
		const fautes: string[] = [];
		for (const seed of [1, 9, 55, 210, 777]) {
			const item = withSeed(seed, () => genLessonItem(def, 'cm1'));
			const m = tirer(seed);
			for (const p of m.paires) {
				if (occurrences(item.text, p.gauche).length === 0) {
					fautes.push(`graine ${seed} : « ${p.gauche} » absent de « ${item.text} »`);
				}
			}
			if (String(item.answer).trim().length === 0) {
				fautes.push(`graine ${seed} : réponse stockée vide`);
			}
		}
		expect(
			fautes,
			'le repli montre un mot sans son groupe : la question n’a plus de réponse',
		).toEqual([]);
	});
});

/* ============================================================
   11. Critère 14 — la banque de #716 est réutilisée EN LECTURE SEULE.
   ------------------------------------------------------------
   La tentation est de retoucher `PHRASES_GN` pour l'ajuster à la nouvelle leçon
   (supprimer un groupe qui n'intéresse pas, changer un adjectif, déplacer une
   frontière). Ces tests sont VERTS aujourd'hui : leur falsifiabilité est démontrée
   plus bas, sur des copies mutées de la banque réelle.
   Ce qui NE doit PAS les faire rougir : l'ajout d'un champ à `PhraseClicMot` (le
   `patron` retenu, cf. note d'implémentation de #731) — ce n'est pas un changement de
   comportement, et l'empreinte ci-dessous ne porte que sur ce que l'enfant lit.
   ============================================================ */
const TAILLE_716 = 49;

/* Les 49 groupes de #716, tels que l'auteur de la banque les a écrits. */
const GROUPES_716_ATTENDUS = [
	'ce train',
	'ces fleurs',
	'ces fleurs blanches',
	'ces élèves curieux',
	'cette belle journée',
	'cette histoire',
	'cette voiture rouge',
	'des feuilles',
	'la fermière',
	'la leçon',
	'la lune',
	'la porte',
	'la télévision',
	'le boulanger',
	'le bus',
	'le chat noir',
	'le facteur',
	'le petit chien',
	'les branches',
	'les croissants',
	'les nuages',
	'les oiseaux',
	'les oiseaux',
	'ma cousine',
	'mes affaires',
	'mes vieilles chaussures',
	'mon frère',
	'mon poisson',
	'mon vélo rouge',
	'sa trottinette',
	'ses tomates',
	'ses vêtements',
	'son vélo',
	'ta petite voisine',
	'ton cartable',
	'un beau chapeau',
	'un chemin étroit',
	'un grand cheval',
	'un grand tableau',
	'un manteau chaud',
	'un papillon coloré',
	'une belle chanson',
	'une boîte vide',
	'une histoire amusante',
	'une jolie fleur',
	'une longue histoire',
	'une nappe blanche',
	'une pomme mûre',
	'vos clés',
];

/* Quelques couples (phrase, groupe) nommément épinglés : un groupe déplacé d'un mot
   dans sa phrase est invisible d'un simple décompte. */
const COUPLES_716: Array<[string, string]> = [
	['La lune brille doucement.', 'La lune'],
	['Elle dessine un grand tableau.', 'un grand tableau'],
	['Il ferme la porte doucement.', 'la porte'],
	['Mes vieilles chaussures craquent encore.', 'Mes vieilles chaussures'],
	['Ces élèves curieux écoutent la maîtresse.', 'Ces élèves curieux'],
];

/** Ce qui a changé dans la banque de #716 (liste vide = banque intacte). */
function diff716(banque: readonly PhraseClicMot[]): string[] {
	const pbs: string[] = [];
	if (banque.length !== TAILLE_716) {
		pbs.push(
			`PHRASES_GN compte ${banque.length} item(s) au lieu de ${TAILLE_716} : la banque de « Repère le groupe nominal » a été amputée ou enrichie`,
		);
	}
	const servis = banque.map((p) => lc(libelleCible(p.tokens, p.cibleIndices))).sort();
	const attendus = [...GROUPES_716_ATTENDUS].sort();
	if (servis.join(' / ') !== attendus.join(' / ')) {
		// Différence de MULTI-ENSEMBLE (« les oiseaux » figure deux fois dans la banque).
		const reste = [...servis];
		const disparus: string[] = [];
		for (const g of attendus) {
			const i = reste.indexOf(g);
			if (i === -1) disparus.push(g);
			else reste.splice(i, 1);
		}
		pbs.push(
			`les groupes de PHRASES_GN ont changé — disparus : ${disparus.map((g) => `« ${g} »`).join(', ') || '(aucun)'} ; apparus : ${reste.map((g) => `« ${g} »`).join(', ') || '(aucun)'}`,
		);
	}
	const table = new Map(
		banque.map((p) => [joindrePhrase(p.tokens), libelleCible(p.tokens, p.cibleIndices)]),
	);
	for (const [texte, groupe] of COUPLES_716) {
		const vu = table.get(texte);
		if (vu !== groupe) {
			pbs.push(
				`« ${texte} » : groupe attendu « ${groupe} », trouvé « ${vu ?? '(phrase absente)'} »`,
			);
		}
	}
	for (const p of banque) {
		const ou = `« ${joindrePhrase(p.tokens)} »`;
		if (p.segment !== true) pbs.push(`${ou} : drapeau \`segment\` perdu — le geste de #716 change`);
		if (!p.explication.trim()) pbs.push(`${ou} : explication vidée`);
	}
	return pbs;
}

/** Clé d'un groupe, insensible à la casse et à l'ordre (critère 6). */
const cleGroupe = (mots: string[]): string => mots.map(lc).sort().join('|');
const GROUPES_716 = new Set(
	PHRASES_GN.map((p) => cleGroupe(p.cibleIndices.map((i) => p.tokens[i]))),
);

describe('Critère 14 — PHRASES_GN réutilisée en lecture seule (#731)', () => {
	it('la banque de « Repère le groupe nominal » est intacte', () => {
		expect(diff716(PHRASES_GN), 'une leçon déjà livrée a changé de comportement').toEqual([]);
	});

	it('la leçon de #716 sert toujours le même format et le même geste', () => {
		const def = getLessonById(LECON_716);
		expect(def, `${LECON_716} introuvable`).toBeDefined();
		expect(def!.levels).toEqual(['cm1']);
		expect(def!.exerciseType.exerciseKind).toBe('clicMot');
		expect((def!.exerciseType.modes ?? []).map((m) => m.id)).toEqual(['segment']);
	});

	it('le verrou MORD : amputation, ajout, groupe déplacé, drapeau perdu', () => {
		// Mutations jouées sur des COPIES (jamais sur la donnée réelle).
		expect(diff716(PHRASES_GN.slice(0, -1)), 'amputation non vue').not.toEqual([]);
		expect(diff716([...PHRASES_GN, PHRASES_GN[0]]), 'ajout non vu').not.toEqual([]);
		const frontiereDeplacee = PHRASES_GN.map((p, i) =>
			i === 1 ? { ...p, cibleIndices: p.cibleIndices.slice(0, 1) } : p,
		);
		expect(diff716(frontiereDeplacee), 'groupe tronqué non vu').not.toEqual([]);
		const sansSegment = PHRASES_GN.map((p, i) => (i === 0 ? { ...p, segment: undefined } : p));
		expect(diff716(sansSegment), 'drapeau `segment` perdu non vu').not.toEqual([]);
		const sansExplication = PHRASES_GN.map((p, i) => (i === 2 ? { ...p, explication: '  ' } : p));
		expect(diff716(sansExplication), 'explication vidée non vue').not.toEqual([]);
	});
});

/* ============================================================
   12. Les oracles de CE fichier mordent.
   ------------------------------------------------------------
   Sans ce bloc, un lexique devenu permissif ou un détecteur devenu aveugle
   laisserait toute la suite verte en silence : la donnée réelle respecte déjà les
   règles, donc rien ne les éprouve.
   ============================================================ */
describe('Les oracles de ce fichier mordent', () => {
	it('les lexiques ne disent pas oui à tout', () => {
		expect(estDeterminant('ces')).toBe(true);
		expect(estDeterminant('ma')).toBe(true);
		expect(estDeterminant('plusieurs'), '« plusieurs » hors programme CM1').toBe(false);
		expect(estDeterminant('chien')).toBe(false);
		expect(estAdjectif('grand')).toBe(true);
		expect(estAdjectif('vieilles')).toBe(true);
		expect(estAdjectif('chien')).toBe(false);
		expect(estAdverbe('doucement')).toBe(true);
		expect(estAdverbe('souvent')).toBe(true);
		expect(estAdverbe('vêtements'), 'nom en -ment pris pour un adverbe').toBe(false);
		expect(estAdverbe('chien')).toBe(false);
		expect(estPronom('elle')).toBe(true);
		expect(estPronom('les'), '« les » en tête de groupe est un déterminant').toBe(false);
		expect(estPreposition("d'ardoise")).toBe(true);
		expect(estPreposition('des'), '« des » article ne doit pas être banni').toBe(false);
	});

	it('sousCatDeterminant départage les trois sous-catégories', () => {
		expect(sousCatDeterminant('les')).toBe('article');
		expect(sousCatDeterminant('Mes')).toBe('possessif');
		expect(sousCatDeterminant('cette')).toBe('demonstratif');
		expect(sousCatDeterminant('chien')).toBeNull();
	});

	it('classeEtiquette lit la classe sans figer la graphie, et refuse l’ambigu', () => {
		expect(classeEtiquette('déterminant')).toBe('determinant');
		expect(classeEtiquette('un déterminant')).toBe('determinant');
		expect(classeEtiquette('Déterminants')).toBe('determinant');
		expect(classeEtiquette('nom')).toBe('nom');
		expect(classeEtiquette('le nom')).toBe('nom');
		expect(classeEtiquette('adjectif')).toBe('adjectif');
		expect(classeEtiquette("l'adjectif qualificatif")).toBe('adjectif');
		expect(classeEtiquette('pronom'), '« pronom » n’est pas « nom »').toBeNull();
		expect(classeEtiquette('verbe'), 'classe hors périmètre').toBeNull();
		expect(classeEtiquette('nom ou adjectif'), 'étiquette ambiguë').toBeNull();
	});

	it('motsProscrits attrape « noyau », les fonctions et les notations de patron', () => {
		expect(motsProscrits('Clique sur le nom noyau.')).not.toEqual([]);
		expect(motsProscrits('épithète')).not.toEqual([]);
		expect(motsProscrits('Quel est le sujet ?')).not.toEqual([]);
		expect(motsProscrits('complément du nom')).not.toEqual([]);
		expect(motsProscrits('Ce groupe suit le modèle Dét + Nom + Adj.')).not.toEqual([]);
		expect(motsProscrits('Patron du groupe : DAN')).not.toEqual([]);
		// Témoins SAINS : le vocabulaire légitime de la leçon ne doit pas être signalé.
		expect(motsProscrits('déterminant'), 'étiquette légitime signalée').toEqual([]);
		expect(motsProscrits('nom'), 'étiquette légitime signalée').toEqual([]);
		expect(motsProscrits('adjectif'), 'étiquette légitime signalée').toEqual([]);
		expect(
			motsProscrits('Dis ce qu’est chaque mot de ce groupe : le petit chien.'),
			'énoncé légitime signalé',
		).toEqual([]);
	});

	it('la table des groupes de #716 reconnaît une reprise, et pas un groupe neuf (critère 6)', () => {
		// Sans ce témoin, une clé mal formée rangerait TOUT dans le « lot neuf » et le
		// critère 6 passerait au vert sur une banque qui ne reprend rien.
		expect(GROUPES_716.size, 'table des reprises vide ou tronquée').toBeGreaterThan(40);
		expect(GROUPES_716.has(cleGroupe(['Le', 'petit', 'chien'])), 'reprise non reconnue').toBe(true);
		expect(
			GROUPES_716.has(cleGroupe(['chien', 'LE', 'petit'])),
			'la clé doit ignorer la casse et l’ordre',
		).toBe(true);
		expect(
			GROUPES_716.has(cleGroupe(['un', 'vieux', 'coffre'])),
			'groupe neuf pris pour une reprise',
		).toBe(false);
	});

	it('occurrences compte des MOTS ENTIERS', () => {
		expect(occurrences('la leçon commence', 'le')).toEqual([]);
		expect(occurrences('le petit chien', 'le')).toHaveLength(1);
		expect(occurrences('Le petit chien', 'le'), 'casse').toHaveLength(1);
		expect(occurrences('le chat et le chien', 'le')).toHaveLength(2);
		expect(occurrences('un bébé', 'bébé')).toHaveLength(1);
	});

	it('analyser refuse ce qui n’est pas un groupe nominal du programme, et accepte ce qui l’est', () => {
		const fab = (question: string, paires: Array<[string, string]>): Manche => ({
			type: 'appariement',
			question,
			paires: paires.map(([gauche, droite]) => ({ gauche, droite })),
		});

		// Témoins SAINS, et l'ordre lu dans l'énoncé.
		const dn = analyser(
			fab('la lune', [
				['la', 'déterminant'],
				['lune', 'nom'],
			]),
		);
		expect(dn.ok && dn.g.patron, 'Dét + Nom non reconnu').toBe('DN');
		const dan = analyser(
			fab('un grand tableau', [
				['un', 'déterminant'],
				['grand', 'adjectif'],
				['tableau', 'nom'],
			]),
		);
		expect(dan.ok && dan.g.patron, 'adjectif AVANT le nom non reconnu').toBe('DAN');
		expect(dan.ok && dan.g.nom).toBe('tableau');
		const dna = analyser(
			fab('le chat noir', [
				['noir', 'adjectif'],
				['le', 'déterminant'],
				['chat', 'nom'],
			]),
		);
		expect(dna.ok && dna.g.patron, 'l’ordre des paires ne doit pas décider du patron').toBe('DNA');
		expect(dna.ok && dna.g.sousCat).toBe('article');

		// Témoins FAUTIFS.
		expect(analyser(fab('la lune', [['lune', 'nom']])).ok, 'un seul mot').toBe(false);
		expect(
			analyser(
				fab('Le chien aboie fort', [
					['Le', 'déterminant'],
					['chien', 'nom'],
					['aboie', 'verbe'],
				]),
			).ok,
			'mot hors du groupe (critère 12)',
		).toBe(false);
		expect(
			analyser(
				fab('le grand chat noir', [
					['le', 'déterminant'],
					['grand', 'adjectif'],
					['chat', 'nom'],
					['noir', 'adjectif'],
				]),
			).ok,
			'quatre mots / deux épithètes (critère 11)',
		).toBe(false);
		expect(
			analyser(
				fab('la voisine', [
					['la', 'déterminant'],
					['voisine', 'nom'],
				]),
			).ok,
			'témoin sain refusé',
		).toBe(true);
		expect(
			analyser(
				fab('le chat de la voisine', [
					['le', 'déterminant'],
					['chat', 'nom'],
					['de', 'préposition'],
				]),
			).ok,
			'complément du nom prépositionnel (critère 11)',
		).toBe(false);
		expect(
			analyser(
				fab('plusieurs élèves', [
					['plusieurs', 'déterminant'],
					['élèves', 'nom'],
				]),
			).ok,
			'déterminant hors programme CM1',
		).toBe(false);
		expect(
			analyser(
				fab('Relie chaque mot : le chien', [
					['le', 'déterminant'],
					['chien', 'nom'],
					['mot', 'nom'],
				]),
			).ok,
			'mot absent du groupe montré',
		).toBe(false);
		expect(
			analyser(
				fab('le petit chien', [
					['le', 'déterminant'],
					['zzzz', 'adjectif'],
					['chien', 'nom'],
				]),
			).ok,
			'mot du groupe absent de l’énoncé',
		).toBe(false);
	});
});
