/* ============================================================
   Grammaire CM1 — « Repérer le groupe nominal dans une phrase » (#716).
   ------------------------------------------------------------
   SPÉCIFICATION ÉCRITE AVANT LE CODE. À la livraison de ce fichier, le module
   `src/data/francais/grammaire-groupe-nominal.ts` n'existe pas : TOUS les tests
   sont rouges, et c'est l'état attendu. Ils décrivent ce que l'implémentation
   devra tenir, pas ce qu'elle fait.

   Les attendus sont DÉRIVÉS de l'issue #716 et du programme CM1 (§5.1 « Analyser
   le groupe nominal » : Dét + Nom ; Dét + Nom + Adj ; Dét + Adj + Nom), jamais
   relus d'une implémentation. Les lexiques ci-dessous (déterminants autorisés,
   pronoms, prépositions, adjectifs, adverbes) sont RE-ÉCRITS À LA MAIN pour que
   ces tests attrapent un item hors périmètre au lieu de figer celui du code.

   Ce que ce fichier NE couvre pas (→ `auteur-tests-e2e`) : le geste de sélection
   d'un segment (critère 3 côté interaction), l'affichage du groupe attendu après
   erreur (critère 6 côté écran), la remontée au journal encadrant (critère 7).
   Ici on tient la moitié LOGIQUE de ces critères : la donnée rend-elle le geste
   possible (cible contiguë, drapeau `segment`), l'explication contient-elle le
   groupe entier, la cible est-elle exploitable par le journal.

   Organisation : chaque garde de banque est un DÉTECTEUR pur (`(p) => string | null`),
   appliqué (a) à la banque réelle — qui doit être indemne — et (b) à des témoins
   FABRIQUÉS portant exactement la violation annoncée, plus des témoins sains qui ne
   doivent PAS être signalés. Sans ce second volet, un détecteur devenu trop
   permissif laisserait la banque verte en silence (cf. tests/README.md).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	gn,
	CONSIGNE_GN,
	CIBLE_GN,
	PHRASES_GN,
	type PatronGN,
} from '../src/data/francais/grammaire-groupe-nominal';
import {
	PHRASES_NOYAU,
	cibleContigue,
	estPonctuation,
	joindrePhrase,
	libelleCible,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';
import { getLessonById, genLessonItem, isClicMotLesson } from '../src/core/catalog';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';
import { withSeed } from '../src/core/utils';

const LECON = 'fr-gram-groupe-nominal';
const lc = (s: string): string => s.toLowerCase();

/* ============================================================
   Lexiques RE-DÉRIVÉS (programme CM1 + grammaire), pas importés du code.
   ============================================================ */

/* Critère 13 — les seuls déterminants que le programme CM1 nomme : article,
   possessif, démonstratif. Volontairement SANS les indéfinis de quantité
   (« plusieurs », « chaque », « quelques ») ni les numéraux, qui sont l'exemple
   d'échec écrit dans l'issue. */
const DET_AUTORISES = new Set([
	// articles
	'le',
	'la',
	'les',
	'un',
	'une',
	'des',
	// possessifs
	'mon',
	'ma',
	'mes',
	'ton',
	'ta',
	'tes',
	'son',
	'sa',
	'ses',
	'notre',
	'nos',
	'votre',
	'vos',
	'leur',
	'leurs',
	// démonstratifs
	'ce',
	'cet',
	'cette',
	'ces',
]);

/* Déterminants au PLURIEL parmi les précédents (critère 4). */
const DET_PLURIELS = new Set(['les', 'des', 'mes', 'tes', 'ses', 'nos', 'vos', 'leurs', 'ces']);

/* Critère 10 — pronoms. `le`/`la`/`les`/`leur` sont EXCLUS de ce jeu : ce sont des
   homographes de déterminants, et en tête de groupe ils en sont un. */
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
]);

/* Critère 8 — prépositions. Détection VOLONTAIREMENT plus large que le critère :
   celui-ci vise le complément du nom (« le chat DE la voisine »), on bannit ici
   TOUTE préposition de la phrase, y compris un circonstanciel (« dans la cour »).
   Raison : le garde-fou du constructeur ne regarde que les BORDS du groupe, alors
   qu'un groupe prépositionnel posé ailleurs dans la phrase est précisément ce qui
   rend « où finit le groupe ? » discutable. Limite assumée : une préposition écrite
   autrement (locution « à côté de », « au-dessus de ») n'est vue que par son premier
   mot, et « des » n'est pas bannissable (article pluriel légitime) — un « des »
   contracté (« la porte des voisins ») passerait donc à travers. */
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
/* Formes ÉLIDÉES : le tokeniseur maison colle l'apostrophe (« d'un » = un seul
   token), d'où une détection par préfixe. */
const PREFIXES_PREPOSITION = ["d'", "jusqu'"];

/* Critère 9 — adverbes qui modifient un adjectif (« un TRÈS grand chat »). */
const ADVERBES_DEGRE = new Set([
	'très',
	'trop',
	'assez',
	'si',
	'tout',
	'toute',
	'bien',
	'plus',
	'moins',
	'fort',
	'vraiment',
	'extrêmement',
	'plutôt',
	'peu',
	'presque',
	'aussi',
	'tellement',
	'drôlement',
]);

/* Critère 4 — adverbes susceptibles de suivre immédiatement un groupe nominal.
   Deux voies : liste explicite, ou suffixe « -ment », avec la liste des NOMS en
   « -ment » qui ferait sinon un faux positif. */
const ADVERBES_EXPLICITES = new Set([
	'vite',
	'bien',
	'mal',
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
	'dehors',
	'fort',
	'hier',
	'demain',
]);
const NOMS_EN_MENT = new Set([
	'moment',
	'ciment',
	'vêtement',
	'appartement',
	'bâtiment',
	'monument',
	'aliment',
	'document',
	'instrument',
	'élément',
	'sentiment',
	'mouvement',
	'changement',
	'gouvernement',
	'logement',
	'jugement',
	'événement',
	'environnement',
	'enseignement',
	'paiement',
	'campement',
	'vêtements',
]);

/* Adjectifs reconnus par CE fichier. Liste FINIE, donc faillible : un adjectif
   absent d'ici serait invisible pour les détecteurs 9 et pour la reconnaissance du
   patron. D'où le garde-fou `detAdjectifDuGroupe` : un groupe de trois mots dont
   NI la 2ᵉ NI la 3ᵉ position n'est reconnue fait échouer le test avec un message
   qui demande d'étendre la liste — le trou devient bruyant au lieu d'être muet. */
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
	'coloré',
	'colorée',
	'colorés',
	'colorées',
	'haut',
	'haute',
	'hautes',
	'long',
	'longue',
	'longues',
	'court',
	'courte',
	'courtes',
	'large',
	'larges',
	'étroit',
	'étroite',
	'étroites',
	'profond',
	'profonde',
	'profondes',
	'épais',
	'épaisse',
	'fin',
	'fine',
	'fines',
	'rond',
	'ronde',
	'rondes',
	'carré',
	'carrée',
	'immense',
	'immenses',
	'énorme',
	'énormes',
	'minuscule',
	'minuscules',
	'lourd',
	'lourde',
	'lourdes',
	'léger',
	'légère',
	'légères',
	'chaud',
	'chaude',
	'chaudes',
	'froid',
	'froide',
	'froides',
	'doux',
	'douce',
	'douces',
	'dur',
	'dure',
	'dures',
	'sec',
	'sèche',
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
	'claires',
	'brillant',
	'brillante',
	'rapide',
	'rapides',
	'lent',
	'lente',
	'lentes',
	'calme',
	'calmes',
	'tranquille',
	'tranquilles',
	'sage',
	'sages',
	'gentil',
	'gentille',
	'méchant',
	'méchante',
	'poli',
	'polie',
	'timide',
	'timides',
	'courageux',
	'courageuse',
	'curieux',
	'curieuse',
	'joyeux',
	'joyeuse',
	'heureux',
	'heureuse',
	'délicieux',
	'délicieuse',
	'silencieux',
	'silencieuse',
	'bruyant',
	'bruyante',
	'passionnant',
	'passionnante',
	'amusant',
	'amusante',
	'fatigué',
	'fatiguée',
	'cassé',
	'cassée',
	'rempli',
	'remplie',
	'mûr',
	'mûre',
	'mûres',
	'salé',
	'salée',
	'sucré',
	'sucrée',
	'fort',
	'forte',
	'fortes',
	'faible',
	'faibles',
	'nouveau',
	'nouvelle',
	'nouvelles',
	'magnifique',
	'magnifiques',
	'superbe',
	'superbes',
	'étrange',
	'étranges',
	'pointu',
	'pointue',
	'plat',
	'plate',
	'mouillé',
	'mouillée',
	'vide',
	'vides',
	'plein',
	'pleine',
	'pleines',
]);

const estAdjectif = (t: string): boolean => ADJECTIFS.has(lc(t));
const estDeterminant = (t: string): boolean => DET_AUTORISES.has(lc(t));
const estPreposition = (t: string): boolean =>
	PREPOSITIONS.has(lc(t)) || PREFIXES_PREPOSITION.some((p) => lc(t).startsWith(p));
const estAdverbe = (t: string): boolean => {
	const m = lc(t);
	if (ADVERBES_EXPLICITES.has(m)) return true;
	return m.endsWith('ment') && m.length > 5 && !NOMS_EN_MENT.has(m);
};
/* Élision du déterminant : « l'oiseau » est UN token, donc le groupe ne compte plus
   ses 2 ou 3 mots et le déterminant n'est plus un morceau désignable à part. */
const estElide = (t: string): boolean => lc(t).startsWith("l'");

/* ============================================================
   Outils de lecture d'un item.
   ============================================================ */
const motsCible = (p: PhraseClicMot): string[] => p.cibleIndices.map((i) => p.tokens[i]);
const texteCible = (p: PhraseClicMot): string => motsCible(p).join(' ');
const ou = (p: PhraseClicMot): string => `« ${joindrePhrase(p.tokens)} » [${texteCible(p)}]`;

/** Le NOM du groupe = le seul mot du groupe qui n'est ni son déterminant de tête ni
    un adjectif reconnu. `null` si on n'en trouve pas exactement un. */
function nomDuGroupe(p: PhraseClicMot): string | null {
	const restes = motsCible(p)
		.slice(1)
		.filter((t) => !estAdjectif(t));
	return restes.length === 1 ? restes[0] : null;
}

/** Le token qui SUIT immédiatement le groupe (`null` en fin de phrase). */
function motApres(p: PhraseClicMot): string | null {
	const fin = Math.max(...p.cibleIndices);
	return fin + 1 < p.tokens.length ? p.tokens[fin + 1] : null;
}

/* ============================================================
   Détecteurs de banque (un par exigence). Chacun rend un message ou `null`.
   ============================================================ */
type Detecteur = (p: PhraseClicMot) => string | null;

/* Critères 2, 3 et 12 : la cible est UN segment de 2 ou 3 mots. Un mot isolé
   ramènerait l'exercice au CE2 (« nomme la classe de ce mot ») ; des indices non
   consécutifs diraient que le groupe n'est pas un bloc. */
const detSegment: Detecteur = (p) => {
	const n = p.cibleIndices.length;
	if (n < 2 || n > 3) return `cible de ${n} mot(s) : les patrons CM1 en font 2 (DN) ou 3 (DNA/DAN)`;
	if (!cibleContigue(p.cibleIndices)) return `cible non contiguë (${p.cibleIndices.join(',')})`;
	if (p.segment !== true) return 'drapeau `segment` absent : le geste ne serait pas contraint';
	for (const i of p.cibleIndices) {
		if (!Number.isInteger(i) || i < 0 || i >= p.tokens.length) return `indice hors bornes : ${i}`;
		if (estPonctuation(p.tokens[i])) return `ponctuation ciblée : « ${p.tokens[i]} »`;
	}
	return null;
};

/* Critère 13 : le groupe s'ouvre sur un déterminant article / possessif /
   démonstratif. Interdit du même coup « plusieurs élèves », « chaque enfant »,
   « trois chats » — et un pronom en tête (critère 10). */
const detDeterminantEnTete: Detecteur = (p) => {
	const tete = motsCible(p)[0];
	if (tete === undefined) return 'cible vide';
	if (estElide(tete))
		return `déterminant élidé « ${tete} » : le groupe ne se découpe plus en 2 ou 3 mots`;
	if (!estDeterminant(tete))
		return `« ${tete} » n'est pas un déterminant article/possessif/démonstratif`;
	return null;
};

/* Critère 10 : aucun pronom dans la cible. Un pronom REMPLACE un groupe nominal,
   il n'en est pas un exemple. */
const detPasDePronom: Detecteur = (p) => {
	for (const t of motsCible(p)) {
		if (PRONOMS.has(lc(t))) return `pronom « ${t} » dans la cible`;
	}
	return null;
};

/* Critère 11 : pas de nom propre dans la cible. La majuscule du PREMIER mot de la
   phrase n'est pas un indice de nom propre — mais on ne l'exempte que si ce mot est
   un déterminant. Sans cette réserve, l'exemple d'échec de l'issue (« Paul » comme
   réponse attendue) passerait au travers, puisqu'il ouvre la phrase : le témoin
   fabriqué plus bas a précisément attrapé ce trou. */
const detPasDeNomPropre: Detecteur = (p) => {
	for (const i of p.cibleIndices) {
		if (i === 0 && estDeterminant(p.tokens[0])) continue;
		if (/^\p{Lu}/u.test(p.tokens[i])) return `nom propre « ${p.tokens[i]} » dans la cible`;
	}
	return null;
};

/* Critère 8 : aucune préposition dans la phrase (cf. commentaire du lexique). */
const detPasDePreposition: Detecteur = (p) => {
	for (const t of p.tokens) {
		if (estPreposition(t)) return `préposition « ${t} » : risque de complément du nom / GN emboîté`;
	}
	return null;
};

/* Critère 9, versant « deux épithètes » : le mot qui SUIT le groupe ne peut pas être
   un adjectif. S'il l'est, ou bien la phrase empile deux épithètes, ou bien la
   frontière annotée coupe le groupe trop tôt — les deux sont fautifs. */
const detPasDAdjectifApres: Detecteur = (p) => {
	const apres = motApres(p);
	if (apres && estAdjectif(apres))
		return `adjectif « ${apres} » juste après le groupe (épithète empilée ou frontière tronquée)`;
	return null;
};

/* Critère 9, versant « adverbe sur l'adjectif » : « un très grand chat ». */
const detPasDAdverbeSurAdjectif: Detecteur = (p) => {
	for (let i = 0; i + 1 < p.tokens.length; i++) {
		if (ADVERBES_DEGRE.has(lc(p.tokens[i])) && estAdjectif(p.tokens[i + 1]))
			return `adverbe « ${p.tokens[i]} » devant l'adjectif « ${p.tokens[i + 1]} »`;
	}
	return null;
};

/* Un groupe de trois mots doit porter EXACTEMENT un adjectif reconnu, en 2ᵉ (DAN)
   ou 3ᵉ position (DNA). Zéro ⇒ soit la liste `ADJECTIFS` est trop courte, soit le
   groupe n'est pas un des trois patrons du programme. Deux ⇒ deux épithètes. */
const detAdjectifDuGroupe: Detecteur = (p) => {
	const mots = motsCible(p);
	if (mots.length !== 3) return null;
	const adjs = mots.slice(1).filter(estAdjectif);
	if (adjs.length === 0)
		return `aucun adjectif reconnu dans « ${mots.join(' ')} » (patron hors programme, ou lexique ADJECTIFS de ce test à étendre)`;
	if (adjs.length > 1) return `deux adjectifs dans « ${mots.join(' ')} »`;
	return null;
};

/* Critère 5 : une phrase qui porte DEUX groupes nominaux doit désigner NOMMÉMENT
   celui qu'on attend. Détection du « deux groupes » : au moins deux têtes de groupe
   dans la phrase, une tête étant un déterminant OU une forme élidée (« l'oiseau »,
   qui ouvre bien un second groupe même si la cible, elle, n'a pas le droit d'être
   élidée). Limite : un « leur » PRONOM serait compté comme déterminant, donc la garde
   peut réclamer une consigne là où la phrase n'a qu'un groupe — excès de prudence,
   jamais un trou. */
const detDeuxGroupesDesambiguises: Detecteur = (p) => {
	const dets = p.tokens.filter((t) => estDeterminant(t) || estElide(t));
	if (dets.length < 2) return null;
	const consigne = p.consigne?.trim();
	if (!consigne) return `deux groupes (${dets.join(', ')}) sans consigne propre : cible ambiguë`;
	const nom = nomDuGroupe(p);
	if (!nom) return `deux groupes et nom du groupe indéterminable dans « ${texteCible(p)} »`;
	if (!lc(consigne).includes(lc(nom)))
		return `la consigne ne nomme pas « ${nom} » : deux réponses restent défendables`;
	return null;
};

/* Critère 6, versant logique : le groupe attendu est énoncé EN ENTIER dans
   l'explication, sinon l'enfant qui s'est trompé de frontière ne voit pas la bonne.
   (Le fait qu'il soit MONTRÉ à l'écran relève du smoke e2e.) */
const detExplicationMontreLeGroupe: Detecteur = (p) => {
	const attendu = libelleCible(p.tokens, p.cibleIndices);
	if (!p.explication.trim()) return 'explication vide';
	if (!lc(p.explication).includes(lc(attendu)))
		return `l'explication ne cite pas le groupe « ${attendu} »`;
	return null;
};

const DETECTEURS: Array<[string, Detecteur]> = [
	['segment (critères 2/3/12)', detSegment],
	['déterminant en tête (critère 13)', detDeterminantEnTete],
	['pas de pronom (critère 10)', detPasDePronom],
	['pas de nom propre (critère 11)', detPasDeNomPropre],
	['pas de préposition (critère 8)', detPasDePreposition],
	['pas d’adjectif après le groupe (critère 9)', detPasDAdjectifApres],
	['pas d’adverbe sur l’adjectif (critère 9)', detPasDAdverbeSurAdjectif],
	['un seul adjectif dans un groupe de 3 (critère 9)', detAdjectifDuGroupe],
	['deux groupes désambiguïsés (critère 5)', detDeuxGroupesDesambiguises],
	['explication montre le groupe (critère 6)', detExplicationMontreLeGroupe],
];

/* ============================================================
   1. Garde-fous de CONSTRUCTION — chaque `throw` annoncé est franchi.
   ============================================================ */
describe('gn() — garde-fous de construction (#716)', () => {
	it('refuse un groupe absent de la phrase', () => {
		expect(() => gn('Le chat noir dort profondément.', 'le chien noir', 'DNA')).toThrow();
	});

	it('refuse un groupe présent DEUX fois (cible ambiguë)', () => {
		expect(() => gn('Le chat dort et le chat ronfle.', 'le chat', 'DN')).toThrow();
	});

	it('refuse un nombre de mots incompatible avec le patron annoncé', () => {
		// DN = 2 mots exactement.
		expect(() => gn('Les fleurs poussent vite.', 'Les fleurs poussent', 'DN')).toThrow();
		expect(() => gn('Le chat noir dort.', 'Le chat noir', 'DN')).toThrow();
		// DNA / DAN = 3 mots exactement.
		expect(() => gn('Le chat dort profondément.', 'Le chat', 'DNA')).toThrow();
		expect(() => gn('Un grand tableau brille.', 'Un grand', 'DAN')).toThrow();
		// Quatre mots : « Le petit chat noir » (deux épithètes) n'entre dans aucun patron.
		expect(() => gn('Le petit chat noir dort.', 'Le petit chat noir', 'DNA')).toThrow();
	});

	it('refuse un déterminant hors programme CM1 (critère 13)', () => {
		expect(() =>
			gn('Plusieurs élèves écoutent attentivement.', 'Plusieurs élèves', 'DN'),
		).toThrow();
		expect(() => gn('Chaque enfant travaille sérieusement.', 'Chaque enfant', 'DN')).toThrow();
		expect(() => gn('Trois chats dorment paisiblement.', 'Trois chats', 'DN')).toThrow();
		expect(() => gn('Quelques fleurs poussent doucement.', 'Quelques fleurs', 'DN')).toThrow();
	});

	it('refuse un pronom en tête de « groupe » (critère 10)', () => {
		expect(() => gn('Elle chante gaiement.', 'Elle chante', 'DN')).toThrow();
	});

	it('refuse une préposition collée au groupe, avant comme après (critère 8)', () => {
		// « de » juste AVANT le groupe.
		expect(() => gn('Le chien de la voisine aboie.', 'la voisine', 'DN')).toThrow();
		// « du » juste APRÈS le groupe.
		expect(() => gn('La porte du garage grince.', 'La porte', 'DN')).toThrow();
	});
});

describe('gn() — construction valide (#716)', () => {
	it('DNA : la cible couvre EXACTEMENT les mots du groupe, ni avant ni après', () => {
		const p = gn('Le chat noir dort profondément.', 'Le chat noir', 'DNA');
		expect(p.tokens).toEqual(['Le', 'chat', 'noir', 'dort', 'profondément', '.']);
		expect(p.cibleIndices).toEqual([0, 1, 2]);
		expect(p.segment).toBe(true);
	});

	it('groupe au MILIEU de la phrase : ni le mot d’avant ni celui d’après n’entrent', () => {
		const p = gn('Il répare une voiture rouge.', 'une voiture rouge', 'DNA');
		expect(p.tokens).toEqual(['Il', 'répare', 'une', 'voiture', 'rouge', '.']);
		expect(p.cibleIndices).toEqual([2, 3, 4]);
		expect(p.cibleIndices).not.toContain(1); // « répare »
		expect(p.cibleIndices).not.toContain(5); // « . »
	});

	it('DN et DAN se construisent aussi, cible contiguë et longueur conforme', () => {
		const dn = gn('Les oiseaux chantent joyeusement.', 'Les oiseaux', 'DN');
		expect(dn.cibleIndices).toEqual([0, 1]);
		expect(cibleContigue(dn.cibleIndices)).toBe(true);

		const dan = gn('Tu admires un grand tableau.', 'un grand tableau', 'DAN');
		expect(dan.cibleIndices).toEqual([2, 3, 4]);
		expect(cibleContigue(dan.cibleIndices)).toBe(true);
	});

	it('la casse du groupe écrit par l’auteur n’a pas à suivre celle de la phrase', () => {
		// Le groupe ouvre la phrase (majuscule) mais l'auteur l'écrit en minuscules.
		const p = gn('Les grandes fleurs poussent vite.', 'les grandes fleurs', 'DAN');
		expect(p.cibleIndices).toEqual([0, 1, 2]);
		expect(p.tokens[0]).toBe('Les'); // casse de la PHRASE préservée
	});

	it('l’explication cite le groupe entier (critère 6, versant logique)', () => {
		const p = gn('Le chat noir dort profondément.', 'Le chat noir', 'DNA');
		expect(detExplicationMontreLeGroupe(p), 'explication muette sur le groupe').toBeNull();
	});

	it('`ancre` : la consigne produite nomme le groupe demandé (critère 5)', () => {
		const p = gn('Le chat regarde les oiseaux.', 'les oiseaux', 'DN', { ancre: 'oiseaux' });
		expect(p.consigne, 'consigne absente malgré l’ancre').toBeTruthy();
		expect(lc(p.consigne ?? '')).toContain('oiseaux');
		expect(detDeuxGroupesDesambiguises(p)).toBeNull();
	});

	it('tous les patrons sont acceptés par la signature', () => {
		const cas: Array<[string, string, PatronGN]> = [
			['Les oiseaux chantent joyeusement.', 'Les oiseaux', 'DN'],
			['Il répare une voiture rouge.', 'une voiture rouge', 'DNA'],
			['Tu admires un grand tableau.', 'un grand tableau', 'DAN'],
		];
		for (const [texte, groupe, patron] of cas) {
			const p = gn(texte, groupe, patron);
			expect(detSegment(p), `${texte} / ${patron}`).toBeNull();
			expect(detDeterminantEnTete(p), `${texte} / ${patron}`).toBeNull();
		}
	});
});

/* ============================================================
   2. La banque réelle passe TOUS les détecteurs.
   ============================================================ */
describe('PHRASES_GN — balayage intégral de la banque (#716)', () => {
	it('la banque n’est pas vide et ne contient pas deux fois le même couple (phrase, cible)', () => {
		expect(PHRASES_GN.length).toBeGreaterThan(0);
		const cles = PHRASES_GN.map((p) => `${joindrePhrase(p.tokens)}##${p.cibleIndices.join(',')}`);
		expect(new Set(cles).size, 'doublon dans PHRASES_GN').toBe(cles.length);
	});

	for (const [nom, det] of DETECTEURS) {
		it(`${nom} : aucun item de PHRASES_GN ne viole la règle`, () => {
			const fautes = PHRASES_GN.map((p) => {
				const m = det(p);
				return m === null ? null : `${ou(p)} → ${m}`;
			}).filter((m): m is string => m !== null);
			expect(fautes, `${fautes.length} item(s) en faute`).toEqual([]);
		});
	}
});

/* ============================================================
   3. Composition de la banque (critères 4 et 5) — les items OBLIGATOIRES
      existent, identifiés par une propriété vérifiable et non par un simple
      décompte.
   ============================================================ */
describe('PHRASES_GN — composition imposée par les critères 4 et 5 (#716)', () => {
	it('critère 4 : au moins un item où un ADVERBE suit immédiatement le groupe', () => {
		const avecAdverbe = PHRASES_GN.filter((p) => {
			const apres = motApres(p);
			return apres !== null && estAdverbe(apres);
		});
		expect(
			avecAdverbe.map(ou),
			'aucune phrase ne pose la frontière « groupe / adverbe »',
		).not.toEqual([]);
	});

	it('critère 4 : les TROIS patrons du programme sont représentés (DN, DNA, DAN)', () => {
		const dn = PHRASES_GN.filter((p) => p.cibleIndices.length === 2);
		const trois = PHRASES_GN.filter((p) => p.cibleIndices.length === 3);
		const dan = trois.filter((p) => estAdjectif(motsCible(p)[1]));
		const dna = trois.filter((p) => estAdjectif(motsCible(p)[2]));
		expect(dn.map(ou), 'aucun Dét + Nom').not.toEqual([]);
		expect(dna.map(ou), 'aucun Dét + Nom + Adj').not.toEqual([]);
		expect(dan.map(ou), 'aucun Dét + Adj + Nom (le patron rare du critère 4)').not.toEqual([]);
	});

	it('critère 4 : au moins un item dont le déterminant de tête est au PLURIEL', () => {
		const pluriels = PHRASES_GN.filter((p) => DET_PLURIELS.has(lc(motsCible(p)[0])));
		expect(pluriels.map(ou), 'aucun déterminant pluriel en tête de cible').not.toEqual([]);
	});

	it('critère 5 : au moins une phrase à DEUX groupes nominaux, et elle nomme sa cible', () => {
		const deux = PHRASES_GN.filter((p) => p.tokens.filter(estDeterminant).length >= 2);
		expect(deux.map(ou), 'palier 2 absent : aucune phrase à deux groupes').not.toEqual([]);
		// Le détecteur correspondant a déjà balayé la banque ; on vérifie ici que ces
		// items-là portent bien une consigne PROPRE (et non la consigne par défaut).
		for (const p of deux) {
			expect(p.consigne, `${ou(p)} : consigne propre absente`).toBeTruthy();
			expect(p.consigne, `${ou(p)} : consigne par défaut sur une phrase ambiguë`).not.toBe(
				CONSIGNE_GN,
			);
		}
	});

	it('critère 12 : aucun item ne se réduit à un mot isolé', () => {
		for (const p of PHRASES_GN) {
			expect(p.cibleIndices.length, ou(p)).toBeGreaterThanOrEqual(2);
		}
	});
});

/* ============================================================
   4. Les détecteurs MORDENT — témoins fabriqués (violation annoncée) et
      contre-témoins (sains, qui ne doivent PAS être signalés).
      Sans ce bloc, un détecteur devenu permissif laisserait la banque verte.
   ============================================================ */

/* Découpage local (indépendant du tokeniseur applicatif) : mots séparés par des
   espaces, ponctuation finale isolée. Les témoins sont parfois du français bancal :
   ils existent pour prouver qu'un détecteur mord, pas pour être lus. */
function decouper(texte: string): string[] {
	const out: string[] = [];
	for (const mot of texte.split(/\s+/).filter(Boolean)) {
		const m = /^(.*?)([.,;:!?]?)$/u.exec(mot);
		if (m?.[1]) out.push(m[1]);
		if (m?.[2]) out.push(m[2]);
	}
	return out;
}

function fab(
	texte: string,
	debut: number,
	longueur: number,
	extra: Partial<PhraseClicMot> = {},
): PhraseClicMot {
	const tokens = decouper(texte);
	const cibleIndices = Array.from({ length: longueur }, (_, k) => debut + k);
	const groupe = cibleIndices.map((i) => tokens[i]).join(' ');
	return {
		tokens,
		cibleIndices,
		explication: `Le groupe nominal, c'est « ${groupe} ».`,
		segment: true,
		explicationNommeCible: true,
		...extra,
	};
}

describe('Les détecteurs de ce fichier mordent (témoins fabriqués)', () => {
	it('detSegment : mot isolé, cible trouée, drapeau absent', () => {
		expect(detSegment(fab('Le chat dort.', 1, 1))).not.toBeNull();
		expect(detSegment(fab('Le chat noir dort.', 0, 3, { cibleIndices: [0, 2] }))).not.toBeNull();
		expect(detSegment(fab('Le chat noir dort.', 0, 3, { segment: undefined }))).not.toBeNull();
		expect(detSegment(fab('Le chat noir dort.', 0, 3)), 'témoin sain signalé').toBeNull();
	});

	it('detDeterminantEnTete : quantifieur, numéral, élision', () => {
		expect(detDeterminantEnTete(fab('Plusieurs élèves écoutent.', 0, 2))).not.toBeNull();
		expect(detDeterminantEnTete(fab('Chaque enfant travaille.', 0, 2))).not.toBeNull();
		expect(detDeterminantEnTete(fab('Trois chats dorment.', 0, 2))).not.toBeNull();
		expect(detDeterminantEnTete(fab("L'oiseau bleu chante.", 0, 2))).not.toBeNull();
		expect(detDeterminantEnTete(fab('Ces vieux arbres tombent.', 0, 3)), 'témoin sain').toBeNull();
		expect(detDeterminantEnTete(fab('Mes parents arrivent.', 0, 2)), 'témoin sain').toBeNull();
	});

	it('detPasDePronom : un pronom donné pour cible est signalé', () => {
		expect(detPasDePronom(fab('Elle chante joyeusement.', 0, 1))).not.toBeNull();
		expect(detPasDePronom(fab('Elle chante une belle chanson.', 2, 3)), 'témoin sain').toBeNull();
	});

	it('detPasDeNomPropre : un nom propre dans la cible est signalé', () => {
		expect(detPasDeNomPropre(fab('Paul chante joyeusement.', 0, 1))).not.toBeNull();
		expect(detPasDeNomPropre(fab('Il appelle son ami Paul.', 2, 3))).not.toBeNull();
		// La majuscule de PHRASE (mot 0) ne doit pas passer pour un nom propre.
		expect(detPasDeNomPropre(fab('Le chat noir dort.', 0, 3)), 'témoin sain').toBeNull();
		expect(detPasDeNomPropre(fab('Il appelle son ami.', 2, 2)), 'témoin sain').toBeNull();
	});

	it('detPasDePreposition : « de la voisine », « du garage »', () => {
		expect(detPasDePreposition(fab('Le chien de la voisine aboie.', 3, 2))).not.toBeNull();
		expect(detPasDePreposition(fab('La porte du garage grince.', 0, 2))).not.toBeNull();
		expect(detPasDePreposition(fab("Le toit d'ardoise brille.", 0, 2))).not.toBeNull();
		expect(detPasDePreposition(fab('Le chien noir aboie fort.', 0, 3)), 'témoin sain').toBeNull();
	});

	it('detPasDAdjectifApres : « le grand chat noir » (deux épithètes)', () => {
		expect(detPasDAdjectifApres(fab('Le grand chat noir dort.', 0, 3))).not.toBeNull();
		expect(detPasDAdjectifApres(fab('Le chat noir dort.', 0, 2))).not.toBeNull(); // frontière tronquée
		expect(detPasDAdjectifApres(fab('Le grand chat dort.', 0, 3)), 'témoin sain').toBeNull();
		expect(detPasDAdjectifApres(fab('Le chat noir dort.', 0, 3)), 'témoin sain').toBeNull();
	});

	it('detPasDAdverbeSurAdjectif : « un très grand chat »', () => {
		expect(detPasDAdverbeSurAdjectif(fab('Il caresse un très grand chat.', 2, 2))).not.toBeNull();
		expect(detPasDAdverbeSurAdjectif(fab('Le chien bien sage attend.', 0, 2))).not.toBeNull();
		expect(
			detPasDAdverbeSurAdjectif(fab('Il caresse un grand chat.', 2, 3)),
			'témoin sain',
		).toBeNull();
	});

	it('detAdjectifDuGroupe : zéro adjectif reconnu, ou deux', () => {
		expect(detAdjectifDuGroupe(fab('Le chat zzzz dort.', 0, 3))).not.toBeNull();
		expect(detAdjectifDuGroupe(fab('Le grand noir dort.', 0, 3))).not.toBeNull();
		expect(detAdjectifDuGroupe(fab('Le chat noir dort.', 0, 3)), 'témoin sain').toBeNull();
		expect(detAdjectifDuGroupe(fab('Le grand chat dort.', 0, 3)), 'témoin sain').toBeNull();
		// Un groupe de 2 mots n'est pas concerné.
		expect(detAdjectifDuGroupe(fab('Le chat dort.', 0, 2)), 'DN hors sujet').toBeNull();
	});

	it('detDeuxGroupesDesambiguises : sans consigne, ou consigne qui nomme l’AUTRE groupe', () => {
		const ambigu = fab('Le chat regarde les oiseaux.', 3, 2);
		expect(
			detDeuxGroupesDesambiguises(ambigu),
			'phrase à deux groupes sans consigne',
		).not.toBeNull();
		const mauvaiseAncre = fab('Le chat regarde les oiseaux.', 3, 2, {
			consigne: 'Clique sur le groupe nominal qui contient le nom « chat ».',
		});
		expect(
			detDeuxGroupesDesambiguises(mauvaiseAncre),
			'consigne nommant l’autre groupe',
		).not.toBeNull();
		const bonneAncre = fab('Le chat regarde les oiseaux.', 3, 2, {
			consigne: 'Clique sur le groupe nominal qui contient le nom « oiseaux ».',
		});
		expect(detDeuxGroupesDesambiguises(bonneAncre), 'témoin sain').toBeNull();
		// Second groupe à déterminant ÉLIDÉ : compte quand même pour deux groupes.
		expect(
			detDeuxGroupesDesambiguises(fab("Le chat regarde l'oiseau.", 0, 2)),
			'second groupe élidé non compté',
		).not.toBeNull();
		// Un seul groupe : aucune consigne propre n'est exigée.
		expect(
			detDeuxGroupesDesambiguises(fab('Il regarde les oiseaux.', 2, 2)),
			'témoin sain',
		).toBeNull();
	});

	it('detExplicationMontreLeGroupe : explication qui ne dit pas la bonne frontière', () => {
		expect(
			detExplicationMontreLeGroupe(fab('Le chat noir dort.', 0, 3, { explication: "C'est faux." })),
		).not.toBeNull();
		expect(
			detExplicationMontreLeGroupe(fab('Le chat noir dort.', 0, 3, { explication: '  ' })),
		).not.toBeNull();
		expect(detExplicationMontreLeGroupe(fab('Le chat noir dort.', 0, 3)), 'témoin sain').toBeNull();
	});

	it('les reconnaisseurs de lexique ne disent pas oui à tout', () => {
		expect(estAdverbe('profondément')).toBe(true);
		expect(estAdverbe('vite')).toBe(true);
		expect(estAdverbe('monument'), 'nom en -ment pris pour un adverbe').toBe(false);
		expect(estAdverbe('chat')).toBe(false);
		expect(estDeterminant('ces')).toBe(true);
		expect(estDeterminant('plusieurs')).toBe(false);
		expect(estAdjectif('noir')).toBe(true);
		expect(estAdjectif('chat')).toBe(false);
		expect(estPreposition("d'ardoise")).toBe(true);
		expect(estPreposition('des'), '« des » article ne doit pas être banni').toBe(false);
	});
});

/* ============================================================
   5. Libellés partagés.
   ============================================================ */
describe('Consigne et libellé de cible (#716)', () => {
	it('CIBLE_GN nomme la cible au singulier avec son article', () => {
		expect(CIBLE_GN).toBe('le groupe nominal');
	});

	it('CONSIGNE_GN est une consigne d’action qui parle du groupe nominal', () => {
		// On ne fige PAS la formulation (relecture langue possible), seulement ce
		// qu'elle doit dire.
		expect(CONSIGNE_GN.trim().length).toBeGreaterThan(0);
		expect(lc(CONSIGNE_GN)).toContain('groupe nominal');
		expect(CONSIGNE_GN).not.toContain('’'); // apostrophe droite, choix acté du projet
	});
});

/* ============================================================
   6. Branchement catalogue.
   ============================================================ */
describe('Catalogue — fr-gram-groupe-nominal (#716)', () => {
	it('la leçon existe, en grammaire française, au CM1 SEULEMENT', () => {
		const def = getLessonById(LECON);
		expect(def, `${LECON} introuvable`).toBeDefined();
		expect(def!.subject).toBe('francais');
		expect(def!.category).toBe('fr-grammaire');
		expect(def!.levels).toEqual(['cm1']);
		expect(def!.levels, 'la notion est au programme du CM1, pas du CE2').not.toContain('ce2');
		expect(isClicMotLesson(def!)).toBe(true);
		expect(def!.exerciseType.exerciseKind).toBe('clicMot');
	});

	it('mode unique d’id « segment »', () => {
		const modes = getLessonById(LECON)!.exerciseType.modes ?? [];
		expect(modes.map((m) => m.id)).toEqual(['segment']);
		expect(modes[0].label.trim().length, 'libellé de mode vide').toBeGreaterThan(0);
	});

	it('la leçon est placée dans l’ordre pédagogique CM1 du français', () => {
		const ordre = ORDRE_LECONS.francais?.cm1 ?? [];
		expect(ordre, `${LECON} absent de ORDRE_LECONS.francais.cm1`).toContain(LECON);
	});

	it('200 tirages : clicMot segmenté, cible contiguë, item MEMBRE de la banque', () => {
		const type = getLessonById(LECON)!.exerciseType;
		const membres = new Set(
			PHRASES_GN.map((p) => `${joindrePhrase(p.tokens)}##${p.cibleIndices.join(',')}`),
		);
		for (let i = 0; i < 200; i++) {
			const ex = type.generate({ level: 'cm1' });
			expect(ex.type).toBe('clicMot');
			if (ex.type !== 'clicMot') continue;
			expect(ex.segment, 'le geste ne serait pas contraint au segment').toBe(true);
			expect(cibleContigue(ex.cibleIndices), 'cible non contiguë').toBe(true);
			expect([2, 3]).toContain(ex.cibleIndices.length);
			expect(ex.parle).toBe(joindrePhrase(ex.tokens));
			expect(ex.consigne.trim().length).toBeGreaterThan(0);
			expect(ex.cibleLabel).toBe(CIBLE_GN);
			expect(ex.explication.trim().length).toBeGreaterThan(0);
			expect(
				membres.has(`${joindrePhrase(ex.tokens)}##${ex.cibleIndices.join(',')}`),
				'item hors banque',
			).toBe(true);
			// Le runner corrige : `check` ne valide JAMAIS, même la bonne recopie.
			expect(type.check(ex, libelleCible(ex.tokens, ex.cibleIndices))).toBe(false);
			expect(type.check(ex, 'nimporte quoi')).toBe(false);
		}
	});

	it('la consigne servie est celle de l’item quand il en porte une (critère 5)', () => {
		const type = getLessonById(LECON)!.exerciseType;
		const parCle = new Map<string, PhraseClicMot>(
			PHRASES_GN.map((p) => [`${joindrePhrase(p.tokens)}##${p.cibleIndices.join(',')}`, p]),
		);
		for (let seed = 0; seed < 300; seed++) {
			const ex = withSeed(seed, () => type.generate({ level: 'cm1' }));
			if (ex.type !== 'clicMot') continue;
			const p = parCle.get(`${joindrePhrase(ex.tokens)}##${ex.cibleIndices.join(',')}`);
			expect(p, 'item hors banque').toBeDefined();
			expect(ex.consigne).toBe(p!.consigne ?? CONSIGNE_GN);
		}
	});

	it('tirage DÉTERMINISTE sous graine, et non figé d’une graine à l’autre', () => {
		const type = getLessonById(LECON)!.exerciseType;
		for (const seed of [3, 17, 42, 128, 999]) {
			const a = withSeed(seed, () => type.generate({ level: 'cm1' }));
			const b = withSeed(seed, () => type.generate({ level: 'cm1' }));
			expect(b, `graine ${seed}`).toEqual(a);
		}
		const vus = new Set<string>();
		for (let seed = 1; seed <= 25; seed++) {
			vus.add(withSeed(seed, () => JSON.stringify(type.generate({ level: 'cm1' }))));
		}
		expect(vus.size, 'générateur figé').toBeGreaterThan(1);
	});

	it('repli non interactif : la réponse stockée contient TOUS les mots du groupe', () => {
		// Critère 2 vu du bilan / de la révision : une réponse amputée du déterminant
		// serait une réponse fausse proposée comme correction.
		const lesson = getLessonById(LECON)!;
		for (const seed of [1, 9, 55, 210, 777]) {
			const item = withSeed(seed, () => genLessonItem(lesson, 'cm1'));
			const ex = withSeed(seed, () => lesson.exerciseType.generate({ level: 'cm1' }));
			if (ex.type !== 'clicMot') continue;
			const reponse = String(item.answer);
			expect(reponse.trim().length, `graine ${seed}`).toBeGreaterThan(0);
			for (const i of ex.cibleIndices) {
				expect(reponse, `« ${ex.tokens[i]} » absent de la réponse stockée`).toContain(ex.tokens[i]);
			}
			expect(reponse).toBe(libelleCible(ex.tokens, ex.cibleIndices));
		}
	});
});

/* ============================================================
   7. Critère 14 — la leçon du NOM NOYAU ne bouge pas.
   ------------------------------------------------------------
   Verrou explicite : la tentation est de réutiliser `PHRASES_NOYAU`, dont les
   phrases ont exactement la bonne forme. La réutiliser en l'état est permis ; la
   RETOUCHER (ajouter un adverbe, changer une cible, supprimer un item pour éviter
   un doublon) casserait une leçon déjà livrée sans que rien ne le dise.
   Ce qui le ferait rougir : toute modification du contenu de PHRASES_NOYAU (nombre
   d'items, phrase, mot-cible) ou de ses libellés.
   ============================================================ */
describe('Critère 14 — fr-gram-clic-noyau inchangé (#716)', () => {
	it('PHRASES_NOYAU garde ses 41 items', () => {
		expect(PHRASES_NOYAU.length).toBe(41);
	});

	it('quelques couples (phrase, cible) de PHRASES_NOYAU sont intacts', () => {
		const table = new Map(
			PHRASES_NOYAU.map((p) => [joindrePhrase(p.tokens), libelleCible(p.tokens, p.cibleIndices)]),
		);
		const attendus: Array<[string, string]> = [
			['Le chien aboie bruyamment.', 'chien'],
			['Le petit chat noir dort profondément.', 'chat'],
			['Tu admires ce grand tableau ancien.', 'tableau'],
			['Elle regarde un grand oiseau bleu.', 'oiseau'],
			['Le petit lapin bondit joyeusement.', 'lapin'],
		];
		for (const [texte, cible] of attendus) {
			expect(table.get(texte), `phrase disparue ou modifiée : « ${texte} »`).toBe(cible);
		}
	});

	it('chaque item de PHRASES_NOYAU cible toujours UN SEUL mot (pas un segment)', () => {
		for (const p of PHRASES_NOYAU) {
			expect(p.cibleIndices.length, `« ${joindrePhrase(p.tokens)} »`).toBe(1);
			expect(p.segment, 'le nom noyau n’est pas un segment').toBeFalsy();
		}
	});

	it('la consigne et le libellé de cible du nom noyau sont inchangés', () => {
		// Lus sur l'item SERVI (pas sur une constante ré-exportée) : c'est ce que
		// l'enfant lit qui ne doit pas bouger.
		const type = getLessonById('fr-gram-clic-noyau')!.exerciseType;
		for (const seed of [4, 61, 500]) {
			const ex = withSeed(seed, () => type.generate({ level: 'cm1' }));
			if (ex.type !== 'clicMot') continue;
			expect(ex.consigne).toBe('Clique sur le nom noyau du groupe nominal.');
			expect(ex.cibleLabel).toBe('le nom noyau');
		}
	});

	it('la leçon du nom noyau reste servie au CE2 et au CM1', () => {
		const def = getLessonById('fr-gram-clic-noyau');
		expect(def).toBeDefined();
		expect(def!.levels).toEqual(['ce2', 'cm1']);
		expect((def!.exerciseType.modes ?? []).map((m) => m.id)).toEqual(['clic']);
	});
});
