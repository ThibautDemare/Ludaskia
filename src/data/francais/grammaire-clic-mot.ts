/* ============================================================
   Grammaire — « Clique sur le mot » (#259, #437).
   ------------------------------------------------------------
   Brique d'interaction « clique sur le mot » : l'enfant lit une phrase rendue MOT
   PAR MOT et sélectionne le(s) mot(s) répondant à la consigne. Le runner d'écran
   (ui/lecon-clic-mot.ts) est AGNOSTIQUE de la notation grammaticale ciblée : il
   consomme `consigne`, `explication`, `cibleIndices` (et le libellé `cibleLabel`)
   et corrige par ÉGALITÉ D'ENSEMBLES exacte (cibles multi-mots, y compris NON
   adjacentes).

   Leçons branchées ici :
   - « Clique sur le verbe » (#259) — verbe conjugué (CE2 + CM1) ; 1 mot aux temps
     simples, 2 mots adjacents au passé composé (auxiliaire + participe).
   - « Clique sur le déterminant » (#437 CM1, #436 CE2) — au CM1 article / possessif /
     démonstratif (consigne et cibleLabel PAR ITEM) ; au CE2 les déterminants EN BLOC,
     cible PLURIELLE (tous ceux de la phrase).
   - « Clique sur la conjonction » (#437, CM1) — conjonction de coordination
     (mais / ou / et / donc / or / ni / car ; ni…ni = cible DOUBLE non adjacente).
   - « Clique sur le pronom » (#437 CM1, #436 CE2) — au CM1 pronom personnel sujet vs
     complément (consigne et cibleLabel PAR ITEM) ; au CE2 le seul pronom personnel
     SUJET (aucun pronom complément dans la banque).
   - « Clique sur le nom » (#437 CM1, #436 CE2) — au CM1 le nom noyau d'un GN
     développé ; au CE2 TOUS les noms de la phrase (cible PLURIELLE).
   - « Clique sur l'adjectif » (#436, CE2) — l'unique adjectif qualificatif de la phrase.
   - « Clique sur le sujet » (#437, CM1) — noyau(x) du groupe sujet, sujet composé
     de deux noms propres compris (cible DOUBLE non adjacente, « Paul … Léa »).

   Une leçon servie à DEUX NIVEAUX porte une banque et une consigne par niveau (variante
   `ce2` de `clicMotType`, patron de `clicVerbeType`) : les attendus CE2 et CM1 diffèrent
   (au CE2 les classes se nomment en bloc, sans sous-catégorie).

   Modèle de données : chaque phrase est AUTORÉE (texte + mot(s)-cible) puis découpée
   en TOKENS (mots + ponctuation) ; l'ensemble des indices-cibles est CALCULÉ UNE FOIS
   À LA CONSTRUCTION de la banque. L'item généré porte ces indices STOCKÉS ; le runner
   ne recalcule rien. Garde-fous d'unicité : chaque mot-cible doit apparaître le bon
   nombre de fois (sinon erreur de construction) — un cran contre les cibles ambiguës.

   Garde-fous pédagogiques (design arrêté 2025 §5.1, relus par le rédacteur FR) :
   - UNE seule réponse indiscutable par phrase (l'ENSEMBLE des mots quand la cible est
     plurielle : tous les noms, tous les déterminants) ;
   - lexique et longueur du niveau (6-10 mots), phrases naturelles, apostrophe DROITE `'` ;
   - interdits d'ambiguïté propres à chaque leçon (homographes/homophones exclus)
     documentés au fil des banques ci-dessous.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { choice, enumererFr } from '../../core/utils';
import { LEVEL_ORDER, closestSupported } from '../../core/levels';
import type { LessonInput } from '../_shared';

/** Une phrase annotée prête à jouer. `tokens` = la phrase mot à mot (mots +
    ponctuation) ; `cibleIndices` = l'ensemble EXACT des indices attendus (1, 2 ou
    plus — adjacents ou non) ; `explication` = justification courte affichée après
    « Vérifier ». `consigne`/`cibleLabel` (#437) surchargent, PAR PHRASE, les valeurs
    par défaut du type d'exercice (leçons « déterminant »/« pronom » où la tâche varie
    d'un item à l'autre). Absents ⇒ valeurs par défaut du type. */
export interface PhraseClicMot {
	tokens: string[];
	cibleIndices: number[];
	explication: string;
	consigne?: string;
	cibleLabel?: string;
	/** L'`explication` ÉNONCE DÉJÀ le(s) mot(s)-cible (#436) : l'annonce générique « La
	    bonne réponse : … » de la région live la répéterait alors mot pour mot — deux
	    énumérations d'affilée pour un enfant au lecteur d'écran. Drapeau porté par la
	    DONNÉE (jamais deviné en comparant des textes) ; absent ⇒ la bonne réponse est
	    annoncée, comportement par défaut (ne JAMAIS se taire sur la réponse). */
	explicationNommeCible?: boolean;
}

/* Découpage : une suite de lettres/chiffres (avec apostrophe droite ou trait
   d'union internes : « l'oiseau », « grand-mère ») OU un signe de ponctuation
   isolé. L'apostrophe retenue est la DROITE (choix d'accessibilité clavier). */
const TOKEN_RE = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[.,;:!?…«»]/gu;
const PONCT_RE = /^[.,;:!?…«»]+$/u;
/* Ponctuation « haute » précédée d'une espace en typographie française. */
const PONCT_ESPACE_AVANT = new Set([';', ':', '!', '?']);

/** Un token est-il de la ponctuation (donc NON cliquable dans le runner) ? */
export function estPonctuation(token: string): boolean {
	return PONCT_RE.test(token);
}

/** Recompose la phrase lisible depuis ses tokens (colle la ponctuation au mot qui
    précède, espace française avant « ; : ! ? »). Sert au texte LU (TTS) et au repli
    non interactif (bilan/révision). */
export function joindrePhrase(tokens: string[]): string {
	let out = '';
	for (const t of tokens) {
		if (out === '') out = t;
		else if (estPonctuation(t)) out += (PONCT_ESPACE_AVANT.has(t) ? ' ' : '') + t;
		else out += ' ' + t;
	}
	return out;
}

function tokeniser(texte: string): string[] {
	return texte.match(TOKEN_RE) ?? [];
}

/** Énumération à la française (« a », « a et b », « a, b et c ») — RÉ-EXPORT de la règle
    du cœur (`core/utils`), surtout pas une seconde implémentation : les deux se seraient
    désynchronisées. Ré-exportée ici parce que c'est la règle que les consommateurs de ce
    module attendent (libellé lu, explications). */
export { enumererFr };

/** La cible forme-t-elle UN SEUL groupe de mots (indices consécutifs) ? Règle UNIQUE de
    la contiguïté d'une cible : le verbe au passé composé (« a mangé ») est un groupe,
    alors qu'un sujet composé (« Paul … Léa »), « ni … ni » ou tous les noms d'une phrase
    sont des mots SÉPARÉS. Départage la façon de les énoncer (`libelleCible`) ET la
    tolérance de recopie du repli fiche/bilan (`Item.motsAttendus`, posé par le catalogue) :
    les deux doivent trancher pareil, d'où le prédicat partagé plutôt que deux `every`. */
export function cibleContigue(cibleIndices: number[]): boolean {
	return cibleIndices.every((v, k) => k === 0 || v === cibleIndices[k - 1] + 1);
}

/** Libellé LU / RECOPIÉ des mots-cibles d'un item (joint les tokens ciblés). Cible
    CONTIGUË (verbe « a mangé ») → espace, c'est UN groupe de mots ; cible NON contiguë
    (sujet composé « Paul … Léa », « ni … ni », tous les noms d'une phrase) → énumération
    française (`enumererFr`), pour ne produire ni « Paul Léa », ni « ni ni », ni « cour et
    enfants et ballon ». SOURCE UNIQUE de cette jointure, partagée par le widget (annonce
    live), le repli non interactif du catalogue (réponse STOCKÉE du bilan/fiche) et le
    journal d'erreurs : tous les consommateurs de `cibleIndices` doivent énoncer la même
    chose. */
export function libelleCible(tokens: string[], cibleIndices: number[]): string {
	const mots = cibleIndices.map((i) => tokens[i]);
	return cibleContigue(cibleIndices) ? mots.join(' ') : enumererFr(mots);
}

/* Toutes les positions de départ où la suite `mots` apparaît dans `tokens`
   (comparaison insensible à la casse — le mot-cible peut ouvrir la phrase en
   majuscule, ex. un impératif ou un nom propre). Sert au garde-fou d'unicité. */
function positionsSuite(tokens: string[], mots: string[]): number[] {
	const out: number[] = [];
	for (let i = 0; i + mots.length <= tokens.length; i++) {
		let ok = true;
		for (let k = 0; k < mots.length; k++) {
			if (tokens[i + k].toLowerCase() !== mots[k].toLowerCase()) {
				ok = false;
				break;
			}
		}
		if (ok) out.push(i);
	}
	return out;
}

/* Construit une phrase annotée depuis (texte, verbe) — cible CONTIGUË (1 mot aux
   temps simples, 2 au passé composé). L'explication est dérivée du nombre de mots.
   Erreur de construction si le verbe ne se trouve PAS exactement une fois : garde-fou
   contre une cible ambiguë (deux occurrences) ou une faute de frappe (zéro).
   Exportée (comme `phraseMots`/`det`/`pron`) pour tester DIRECTEMENT son chemin `throw`. */
export function phrase(texte: string, verbe: string): PhraseClicMot {
	const tokens = tokeniser(texte);
	const motsVerbe = tokeniser(verbe);
	const positions = positionsSuite(tokens, motsVerbe);
	if (positions.length !== 1) {
		throw new Error(
			`grammaire-clic-mot : « ${verbe} » doit apparaître exactement une fois dans ` +
				`« ${texte} » (trouvé ${positions.length}×).`,
		);
	}
	const start = positions[0];
	const cibleIndices = motsVerbe.map((_, k) => start + k);
	const texteVerbe = cibleIndices.map((i) => tokens[i]).join(' ');
	const explication =
		cibleIndices.length > 1
			? `Le verbe conjugué est en deux mots : « ${texteVerbe} » (l'auxiliaire et le participe passé).`
			: `Le verbe, c'est le mot qui dit l'action ou l'état : ici « ${texteVerbe} ».`;
	return { tokens, cibleIndices, explication };
}

/** Construit une phrase annotée en ciblant un ENSEMBLE de mots ISOLÉS, éventuellement
    NON ADJACENTS (sujet composé « Paul … Léa » en sautant « et » ; « ni … ni »). Chaque
    entrée de `cibles` est UN mot (un token) ; un même mot répété volontairement dans
    `cibles` (« ni », « ni ») cible TOUTES ses occurrences (autant que de répétitions).
    Garde-fou d'unicité : chaque mot doit apparaître EXACTEMENT autant de fois qu'il est
    listé (sinon erreur de construction — cible ambiguë). L'ensemble d'indices peut
    « sauter » un mot (le runner corrige par égalité d'ensembles, pas par contiguïté). */
export function phraseMots(
	texte: string,
	cibles: string[],
	opts: {
		explication: string;
		consigne?: string;
		cibleLabel?: string;
		explicationNommeCible?: boolean;
	},
): PhraseClicMot {
	const tokens = tokeniser(texte);
	// Multiplicité attendue par mot (insensible à la casse).
	const attendu = new Map<string, number>();
	for (const c of cibles) {
		const mots = tokeniser(c);
		if (mots.length !== 1) {
			throw new Error(
				`grammaire-clic-mot : « ${c} » doit être UN seul mot (phraseMots cible des mots isolés).`,
			);
		}
		const cle = mots[0].toLowerCase();
		attendu.set(cle, (attendu.get(cle) ?? 0) + 1);
	}
	const cibleIndices: number[] = [];
	for (const [mot, n] of attendu) {
		const positions: number[] = [];
		tokens.forEach((t, i) => {
			if (t.toLowerCase() === mot) positions.push(i);
		});
		if (positions.length !== n) {
			throw new Error(
				`grammaire-clic-mot : « ${mot} » doit apparaître exactement ${n} fois dans ` +
					`« ${texte} » (trouvé ${positions.length}).`,
			);
		}
		cibleIndices.push(...positions);
	}
	cibleIndices.sort((a, b) => a - b);
	return {
		tokens,
		cibleIndices,
		explication: opts.explication,
		consigne: opts.consigne,
		cibleLabel: opts.cibleLabel,
		explicationNommeCible: opts.explicationNommeCible,
	};
}

/* Fabrique l'Exercise « clique sur le mot » depuis une phrase annotée. `consigne` et
   `cibleLabel` de la PHRASE priment sur les valeurs par défaut du type (leçons à tâche
   variable). Partagé par toutes les fabriques ci-dessous (verbe + 5 natures #437). */
function itemClicMot(
	p: PhraseClicMot,
	consigneDefaut: string,
	cibleLabelDefaut?: string,
): Exercise {
	return {
		type: 'clicMot',
		tokens: [...p.tokens],
		cibleIndices: [...p.cibleIndices],
		consigne: p.consigne ?? consigneDefaut,
		explication: p.explication,
		parle: joindrePhrase(p.tokens),
		cibleLabel: p.cibleLabel ?? cibleLabelDefaut,
		explicationNommeCible: p.explicationNommeCible,
	};
}

/* ============================================================
   Leçon « Clique sur le verbe » (#259) — verbe conjugué, CE2 + CM1.
   ============================================================ */

/* ---------- Banque CE2 : temps simples uniquement (cible = 1 mot) ----------
   Sujets variés (pronom, nom propre, GN simple), lexique CE2, position du verbe
   volontairement dispersée (impératif en tête, verbe en fin, etc.). */
export const PHRASES_CE2: PhraseClicMot[] = [
	// Présent
	phrase('Le chat dort tranquillement sur le canapé.', 'dort'),
	phrase('Les oiseaux chantent dans le grand jardin.', 'chantent'),
	phrase('Ma sœur dessine un joli bateau bleu.', 'dessine'),
	phrase('Le boulanger prépare de bons croissants chauds.', 'prépare'),
	phrase('Nous jouons au ballon dans la cour.', 'jouons'),
	phrase('Tu ranges tes affaires dans le tiroir.', 'ranges'),
	phrase('Le vent souffle très fort ce soir.', 'souffle'),
	phrase('Les élèves écoutent bien la maîtresse.', 'écoutent'),
	phrase('Papa lave la voiture devant la maison.', 'lave'),
	phrase('Le train arrive enfin à la gare.', 'arrive'),
	phrase('Mon petit frère pleure dans sa chambre.', 'pleure'),
	phrase('Le ciel est tout gris ce matin.', 'est'),
	phrase('La maîtresse écrit la date au tableau.', 'écrit'),
	phrase('Les poissons nagent dans le grand aquarium.', 'nagent'),
	phrase('Le facteur apporte une lettre très importante.', 'apporte'),
	phrase('Le chat du gardien miaule à la fenêtre.', 'miaule'),
	phrase('Le grand chien noir du voisin aboie.', 'aboie'),
	phrase('La petite fille aux cheveux blonds sourit.', 'sourit'),
	phrase('Chaque joueur de cette équipe court vite.', 'court'),
	// Imparfait
	phrase('Le petit garçon jouait dans le sable.', 'jouait'),
	phrase('Les enfants regardaient un beau film hier.', 'regardaient'),
	phrase('Grand-mère tricotait un pull bien chaud.', 'tricotait'),
	phrase('Le chien aboyait très fort hier soir.', 'aboyait'),
	phrase('Nous marchions vite vers la vieille école.', 'marchions'),
	phrase("Tu chantais une jolie chanson tout l'été.", 'chantais'),
	phrase('La rivière coulait au fond de la vallée.', 'coulait'),
	phrase('Le vieux marin racontait de belles histoires.', 'racontait'),
	// Futur
	phrase('Nous irons à la piscine demain matin.', 'irons'),
	phrase('Les grandes vacances commenceront dans deux jours.', 'commenceront'),
	phrase('Tu grandiras très vite cette année.', 'grandiras'),
	phrase('Le soleil brillera bientôt sur la plage.', 'brillera'),
	phrase('Mes amis viendront à mon anniversaire.', 'viendront'),
	phrase('Je finirai bientôt mon très beau dessin.', 'finirai'),
	phrase('Le fermier plantera des salades au printemps.', 'plantera'),
	phrase('Les feuilles tomberont bientôt des grands arbres.', 'tomberont'),
	// Impératif (verbe en tête)
	phrase('Range ta chambre avant le dîner.', 'Range'),
	phrase('Ferme doucement la porte du salon.', 'Ferme'),
	phrase('Écoute bien la consigne de la maîtresse.', 'Écoute'),
	phrase('Regarde ce magnifique château de sable.', 'Regarde'),
	phrase('Mange tes légumes avant le bon dessert.', 'Mange'),
	phrase("Prends ton manteau bleu dans l'armoire.", 'Prends'),
	phrase('Ouvre ton cahier à la bonne page.', 'Ouvre'),
	phrase('Ferme le robinet après le brossage des dents.', 'Ferme'),
	// Interrogative (intonation, ordre sujet-verbe)
	phrase('Tu pars en vacances la semaine prochaine ?', 'pars'),
	phrase('Vous aimez les fraises du jardin ?', 'aimez'),
	phrase('Le spectacle commence à quelle heure ?', 'commence'),
	phrase('Elle habite dans ce grand immeuble ?', 'habite'),
];

/* ---------- Banque CM1 : temps simples (revus) + passé composé + structures
   plus riches ----------
   La banque CM1 REPREND les phrases CE2 (temps simples, tous revus au CM1) et y
   AJOUTE : le passé composé (cible = 2 mots : auxiliaire + participe), l'inversion
   nominale du sujet (interrogative sans trait d'union) et le complément
   circonstanciel en tête (verbe rejeté plus loin). */
const CM1_EXTRAS: PhraseClicMot[] = [
	// Passé composé — cible = 2 mots (auxiliaire + participe, adjacents)
	phrase('Léa a mangé une pomme bien mûre.', 'a mangé'),
	phrase('Les enfants ont fini tous leurs devoirs.', 'ont fini'),
	phrase('Le chat a attrapé une petite souris grise.', 'a attrapé'),
	phrase('Nous avons visité un très beau château fort.', 'avons visité'),
	phrase('Tu as trouvé la bonne réponse tout seul.', 'as trouvé'),
	phrase('Elle est partie très tôt ce matin.', 'est partie'),
	phrase("Mon grand frère est tombé dans l'escalier.", 'est tombé'),
	phrase('Les oiseaux sont revenus au début du printemps.', 'sont revenus'),
	phrase('Le maître a expliqué la nouvelle leçon.', 'a expliqué'),
	phrase('Paul et Léa ont gagné le grand match.', 'ont gagné'),
	phrase('Le vent a cassé une grosse branche.', 'a cassé'),
	phrase('La cuisinière a préparé un très bon gâteau.', 'a préparé'),
	phrase('Les pompiers ont éteint le grand feu.', 'ont éteint'),
	// Interrogative à inversion nominale du sujet (verbe en position 1, sans trait d'union)
	phrase('Que mange le petit lapin gris ?', 'mange'),
	phrase('Où va ce train de marchandises ?', 'va'),
	phrase('Quand part le bus pour la ville ?', 'part'),
	phrase('Comment vont les enfants ce matin ?', 'vont'),
	phrase('Que dessine cette petite fille ?', 'dessine'),
	// Complément circonstanciel en tête (verbe rejeté plus loin dans la phrase)
	phrase('Chaque matin, le chat boit du lait.', 'boit'),
	phrase('Pendant les vacances, nous visiterons Paris.', 'visiterons'),
	phrase('Le soir, les étoiles brillent dans le ciel.', 'brillent'),
	phrase('Autrefois, les chevaliers portaient une lourde armure.', 'portaient'),
	phrase('Dès le matin, le coq chante très fort.', 'chante'),
	// Sujets plus étoffés (verbe au milieu / en fin)
	phrase("Les joueurs de l'équipe adverse courent très vite.", 'courent'),
	phrase('Mon oncle et ma tante habitent à Lyon.', 'habitent'),
	phrase('La lumière du vieux phare guidait les bateaux.', 'guidait'),
	phrase('Le champion de la course franchit la ligne.', 'franchit'),
];

export const PHRASES_CM1: PhraseClicMot[] = [...PHRASES_CE2, ...CM1_EXTRAS];

/* Consignes PERSISTANTES (affichées pendant toute la recherche). Au CM1, un
   micro-indice signale que le verbe peut être en plusieurs mots (passé composé). */
const CONSIGNE_CE2 = 'Clique sur le verbe conjugué de la phrase.';
const CONSIGNE_CM1 =
	'Clique sur le verbe conjugué. Au passé composé, il est en deux mots (exemple : a mangé) : clique sur les deux !';

/* Mode unique (comme l'appariement / le tri) : lancement direct du runner dédié,
   pas d'écran de choix de mode (#69). Le libellé du mode reste invisible (mono-mode :
   pas d'écran de choix) — il est neutre pour être réutilisé par les 5 natures. */
const MODE_CLIC: ModeOption[] = [{ id: 'clic', label: 'Clique sur le mot', recommended: true }];

/** Ce qu'un niveau apporte à une leçon « clique sur le mot » : sa banque, sa consigne et
    le nom de sa cible. Une leçon mono-niveau n'en a qu'une. */
export interface VarianteClicMot {
	banque: PhraseClicMot[];
	consigne: string;
	cibleLabel?: string;
}

/* Fabrique de la leçon « verbe ». `generate` se branche sur `opts.level` (banque CE2
   ou CM1) et STOCKE l'ensemble cible ; `check` renvoie toujours false (le runner
   ui/lecon-clic-mot.ts corrige lui-même par égalité d'ensembles). La consigne de FICHE
   (#42) est exposée sous sa forme FONCTION (#436) : c'est la MÊME variante qui alimente
   l'exercice joué et la fiche imprimée, sinon le CM1 lisait la consigne CE2 sur sa fiche. */
export function clicVerbeType(): ExerciseType {
	const niveaux: SchoolLevel[] = ['ce2', 'cm1'];
	const variante = (level?: SchoolLevel): VarianteClicMot => {
		// Niveau résolu par le MÉCANISME DU MOTEUR (`closestSupported` : niveau demandé,
		// sinon plus haut supporté en-dessous, sinon clamp) et non par un `=== 'cm1'` ad hoc.
		// Sans ça, un niveau non déclaré (CM2) recevrait le contenu CE2 pendant que
		// `labelLecon`/`effectiveLevel` résoudraient, eux, vers le CM1 : titre d'un niveau
		// au-dessus d'un contenu de l'autre.
		const niveau = closestSupported(niveaux, level ?? niveaux[0]);
		return niveau === 'cm1'
			? { banque: PHRASES_CM1, consigne: CONSIGNE_CM1, cibleLabel: 'le verbe conjugué' }
			: { banque: PHRASES_CE2, consigne: CONSIGNE_CE2, cibleLabel: 'le verbe conjugué' };
	};
	return {
		modes: MODE_CLIC,
		consigne: (level) => variante(level).consigne,
		exerciseKind: 'clicMot',
		levels: niveaux,
		generate(opts?: GenerateOpts): Exercise {
			const v = variante(opts?.level);
			return itemClicMot(choice(v.banque), v.consigne, v.cibleLabel);
		},
		check: () => false,
	};
}

/* ---------- Fabrique GÉNÉRIQUE des natures « clique sur le mot » (#437, #436) ----------
   Une banque par défaut + une `consigne`/`cibleLabel` par défaut, chaque phrase pouvant
   les surcharger. Paramétrise proprement les leçons de natures (déterminant, conjonction,
   pronom, nom noyau, sujet, adjectif) sans dupliquer la mécanique. `check` renvoie toujours
   false (le runner corrige).

   Leçon SERVIE À DEUX NIVEAUX (#436) : `ce2` porte la variante CE2 (banque + consigne +
   `cibleLabel` PROPRES — au CE2 on nomme les classes en bloc, sans les sous-catégoriser),
   la banque par défaut restant celle du CM1. Même patron que `clicVerbeType` : branchement
   INLINE sur le niveau, repli sur le CE2 quand le niveau n'est pas transmis (on ne sert
   jamais du contenu CM1 à un CE2 par défaut), et consigne de FICHE exposée sous sa forme
   FONCTION pour que la fiche du niveau parle comme l'exercice joué à ce niveau. */
export function clicMotType(opts: {
	banque: PhraseClicMot[];
	consigne: string;
	cibleLabel?: string;
	levels?: SchoolLevel[];
	ce2?: VarianteClicMot;
}): ExerciseType {
	const { banque, consigne, cibleLabel, ce2, levels = ['cm1'] } = opts;
	const defaut: VarianteClicMot = { banque, consigne, cibleLabel };
	// Niveaux triés par ordre scolaire (comme `calibrated`) : `niveaux[0]` est le plus bas
	// déclaré, c'est le repli quand aucun niveau n'est transmis.
	const niveaux = LEVEL_ORDER.filter((l) => levels.includes(l));
	const variante = (level?: SchoolLevel): VarianteClicMot => {
		if (!ce2) return defaut;
		// Résolution par le MÉCANISME DU MOTEUR (`closestSupported`), le même que
		// `effectiveLevel`/`labelLecon` : un niveau non déclaré (CM2) doit recevoir la
		// variante du niveau vers lequel le catalogue le replie, sinon le titre de la leçon
		// (résolu, lui, par `labelLecon`) contredirait le contenu servi.
		return closestSupported(niveaux, level ?? niveaux[0]) === 'ce2' ? ce2 : defaut;
	};
	return {
		modes: MODE_CLIC,
		consigne: (level) => variante(level).consigne,
		exerciseKind: 'clicMot',
		levels,
		generate(gen?: GenerateOpts): Exercise {
			const v = variante(gen?.level);
			return itemClicMot(choice(v.banque), v.consigne, v.cibleLabel);
		},
		check: () => false,
	};
}

/* ============================================================
   Leçon A — Conjonctions de coordination (#437, CM1).
   ------------------------------------------------------------
   Cible = la conjonction de coordination (mais / ou / et / donc / or / ni / car).
   Interdits d'ambiguïté (garde-fous, pas des détails) :
   - jamais « car » (le bus) ni « or » (le métal) comme NOM dans cette banque —
     seuls les emplois CONJONCTION apparaissent ;
   - « ou » ne côtoie jamais « où » (homophones fragiles en TTS) : « où » est ABSENT ;
   - « ni » s'emploie en PAIRE → cible DOUBLE non adjacente (les deux « ni ») ;
   - « or » (le plus abstrait) : peu de phrases, contextes limpides.
   ============================================================ */
const CONSIGNE_CONJ = 'Clique sur la conjonction de coordination de la phrase.';
const CIBLE_CONJ = 'la conjonction de coordination';

function conj(texte: string, conjonction: string): PhraseClicMot {
	return phraseMots(texte, [conjonction], {
		explication: `« ${conjonction} » relie deux mots, deux groupes ou deux phrases : c'est une conjonction de coordination.`,
	});
}
/* ni…ni : les DEUX « ni » forment la cible (non adjacente). */
function conjNi(texte: string): PhraseClicMot {
	return phraseMots(texte, ['ni', 'ni'], {
		explication:
			"« ni … ni » relie deux mots ou deux groupes en les niant : c'est une conjonction de coordination.",
	});
}

export const PHRASES_CONJ: PhraseClicMot[] = [
	// mais (opposition)
	conj('Il pleut, mais nous sortons quand même.', 'mais'),
	conj('Le gâteau est petit, mais il est délicieux.', 'mais'),
	conj('Je suis fatigué, mais je termine mon travail.', 'mais'),
	conj('Elle court vite, mais son frère court plus vite.', 'mais'),
	conj('Ce livre est ancien, mais il reste passionnant.', 'mais'),
	conj('Nous voulions partir, mais la voiture est cassée.', 'mais'),
	conj('Le film était long, mais vraiment intéressant.', 'mais'),
	// et (addition)
	conj('Paul mange une pomme et une banane.', 'et'),
	conj('Le chat et le chien dorment près du feu.', 'et'),
	conj('Nous chantons et nous dansons à la fête.', 'et'),
	conj('Elle range sa chambre et fait ses devoirs.', 'et'),
	conj('Le ciel est bleu et le soleil brille.', 'et'),
	conj('Il achète du pain et des fruits au marché.', 'et'),
	conj('Les enfants rient et jouent dans la cour.', 'et'),
	// ou (choix)
	conj('Tu préfères le thé ou le café ?', 'ou'),
	conj('Nous irons à la mer ou à la montagne.', 'ou'),
	conj('Veux-tu une glace ou un gâteau ?', 'ou'),
	conj('Il viendra samedi ou dimanche prochain.', 'ou'),
	conj('On peut jouer dehors ou rester au chaud.', 'ou'),
	conj('Elle prendra le train ou le bus.', 'ou'),
	// donc (conséquence)
	conj('Il est tard, donc nous rentrons.', 'donc'),
	conj('Il a beaucoup plu, donc le jardin est trempé.', 'donc'),
	conj('Tu as bien travaillé, donc tu peux te reposer.', 'donc'),
	conj('La route est fermée, donc nous faisons un détour.', 'donc'),
	conj("Je n'ai plus faim, donc je m'arrête de manger.", 'donc'),
	conj('Le magasin est fermé, donc nous reviendrons demain.', 'donc'),
	// car (cause)
	conj('Elle est fatiguée, car elle a couru longtemps.', 'car'),
	conj('Nous restons à la maison, car il neige beaucoup.', 'car'),
	conj('Le bébé pleure, car il a très faim.', 'car'),
	conj("J'allume la lampe, car la nuit tombe.", 'car'),
	conj('Il met son manteau, car il fait très froid.', 'car'),
	conj('Les fleurs se fanent, car personne ne les arrose.', 'car'),
	// or (opposition abstraite, contextes limpides)
	conj('Je croyais avoir raison, or je me trompais.', 'or'),
	conj("Il promettait de venir, or il n'est jamais arrivé.", 'or'),
	conj("Tout semblait calme, or l'orage approchait.", 'or'),
	conj('Elle cherchait ses clés, or elles étaient sur la table.', 'or'),
	// ni…ni (cible double non adjacente)
	conjNi('Il ne mange ni viande ni poisson.'),
	conjNi('Je ne veux ni pleurer ni me plaindre.'),
	conjNi("Elle n'aime ni le froid ni la pluie."),
	conjNi("Ce chien n'est ni méchant ni bruyant."),
	conjNi("Nous n'avons ni faim ni soif."),
];

/* ============================================================
   Leçon B — Sous-catégories de déterminant (#437, CM1).
   ------------------------------------------------------------
   Distinguer article / possessif / démonstratif. Consigne + cibleLabel PAR ITEM.
   Idée forte (pédagogue) : une même phrase réunit les sous-catégories comme
   distracteurs mutuels, la consigne variant d'un item à l'autre (banque PLATE :
   plusieurs items d'une même phrase, un par sous-catégorie visée).
   Interdits d'ambiguïté :
   - « ce » seulement IMMÉDIATEMENT devant un nom (jamais pronom « Ce sont… », « C'est… ») ;
   - « leur/leurs » seulement devant un nom (jamais pronom « Je leur parle ») ;
   - PAS de partitifs (du / de la) ni de contractés (au / aux / du) — ambigus/hors périmètre ;
   - PAS d'article élidé « l' » (soudé au nom → non cliquable séparément).
   Garde-fou de construction : la phrase doit contenir EXACTEMENT un déterminant de la
   sous-catégorie visée, et ce doit être la cible (sinon erreur — cible ambiguë).
   ============================================================ */
export type SousCatDet = 'article' | 'possessif' | 'demonstratif';

const DET_SETS: Record<SousCatDet, Set<string>> = {
	article: new Set(['le', 'la', 'les', 'un', 'une', 'des']),
	possessif: new Set([
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
	]),
	demonstratif: new Set(['ce', 'cet', 'cette', 'ces']),
};
const DET_LABEL: Record<SousCatDet, string> = {
	article: "l'article",
	possessif: 'le déterminant possessif',
	demonstratif: 'le déterminant démonstratif',
};
const DET_CONSIGNE: Record<SousCatDet, string> = {
	article: "Clique sur l'article de la phrase.",
	possessif: 'Clique sur le déterminant possessif de la phrase.',
	demonstratif: 'Clique sur le déterminant démonstratif de la phrase.',
};
const DET_EXPL: Record<SousCatDet, (m: string) => string> = {
	article: (m) => `« ${m} » accompagne le nom sans dire à qui c'est : c'est un article.`,
	possessif: (m) => `« ${m} » montre à qui c'est : c'est un déterminant possessif.`,
	demonstratif: (m) =>
		`« ${m} » sert à montrer de quel nom on parle : c'est un déterminant démonstratif.`,
};

export function det(texte: string, cible: string, cat: SousCatDet): PhraseClicMot {
	const tokens = tokeniser(texte);
	const membres = tokens.filter((t) => DET_SETS[cat].has(t.toLowerCase()));
	if (membres.length !== 1 || membres[0].toLowerCase() !== cible.toLowerCase()) {
		throw new Error(
			`grammaire-clic-mot (det ${cat}) : « ${texte} » doit contenir exactement un ${cat} ` +
				`et ce doit être « ${cible} » (trouvé ${membres.length} : ${membres.join(', ')}).`,
		);
	}
	return phraseMots(texte, [cible], {
		explication: DET_EXPL[cat](cible),
		consigne: DET_CONSIGNE[cat],
		cibleLabel: DET_LABEL[cat],
	});
}
/* Expanse une phrase en plusieurs items (un par sous-catégorie ciblée). */
function detItems(texte: string, specs: [string, SousCatDet][]): PhraseClicMot[] {
	return specs.map(([cible, cat]) => det(texte, cible, cat));
}

const CONSIGNE_DET = 'Clique sur le déterminant demandé.';

export const PHRASES_DET: PhraseClicMot[] = [
	// Phrases « riches » : les 3 sous-catégories se font distracteurs mutuels.
	...detItems('Ce chien mange sa gamelle et un os.', [
		['Ce', 'demonstratif'],
		['sa', 'possessif'],
		['un', 'article'],
	]),
	...detItems('Cette fille montre son dessin à des amis.', [
		['Cette', 'demonstratif'],
		['son', 'possessif'],
		['des', 'article'],
	]),
	...detItems('Ces enfants rangent leurs jouets dans une boîte.', [
		['Ces', 'demonstratif'],
		['leurs', 'possessif'],
		['une', 'article'],
	]),
	...detItems('Mon frère répare ce vélo avec les outils.', [
		['Mon', 'possessif'],
		['ce', 'demonstratif'],
		['les', 'article'],
	]),
	...detItems('Cet oiseau protège ses petits dans le nid.', [
		['Cet', 'demonstratif'],
		['ses', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Ta sœur dessine cette maison avec un crayon.', [
		['Ta', 'possessif'],
		['cette', 'demonstratif'],
		['un', 'article'],
	]),
	// Phrases à deux sous-catégories.
	...detItems('Les oiseaux quittent leur nid en automne.', [
		['Les', 'article'],
		['leur', 'possessif'],
	]),
	...detItems('Mon voisin répare cette barrière.', [
		['Mon', 'possessif'],
		['cette', 'demonstratif'],
	]),
	...detItems('Ces montagnes cachent le soleil.', [
		['Ces', 'demonstratif'],
		['le', 'article'],
	]),
	...detItems('Cette histoire raconte une belle aventure.', [
		['Cette', 'demonstratif'],
		['une', 'article'],
	]),
	...detItems('Tes amis apportent des cadeaux.', [
		['Tes', 'possessif'],
		['des', 'article'],
	]),
	...detItems('Notre équipe gagne le match.', [
		['Notre', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Votre chien aboie dans le jardin.', [
		['Votre', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Ce boulanger prépare des croissants.', [
		['Ce', 'demonstratif'],
		['des', 'article'],
	]),
	...detItems('Nos cousins visitent cette ville.', [
		['Nos', 'possessif'],
		['cette', 'demonstratif'],
	]),
	...detItems('Cet acteur joue un rôle important.', [
		['Cet', 'demonstratif'],
		['un', 'article'],
	]),
	...detItems('Cette chanson me rappelle mes vacances.', [
		['Cette', 'demonstratif'],
		['mes', 'possessif'],
	]),
	...detItems('Range tes affaires dans ce tiroir.', [
		['tes', 'possessif'],
		['ce', 'demonstratif'],
	]),
	...detItems('Notre maîtresse corrige ce cahier.', [
		['Notre', 'possessif'],
		['ce', 'demonstratif'],
	]),
];

/* ============================================================
   Leçon C — Pronom personnel sujet vs complément (#437, CM1).
   ------------------------------------------------------------
   Consigne + cibleLabel PAR ITEM (sujet / complément).
   Sujets = je/tu/il/elle/on/nous/vous/ils/elles.
   Compléments = me/te/lui/leur/se/nous/vous.
   Interdits d'ambiguïté :
   - EXCLURE le/la/les comme compléments (homographes d'articles — leçon plus avancée) ;
   - JAMAIS la même forme (nous/vous) à la fois en sujet et en complément dans une phrase.
   Garde-fou de construction : un seul pronom du rôle visé est cliquable (formes non
   ambiguës comptées ; nous/vous gérés par leur unique occurrence — cf. interdit).
   ============================================================ */
export type RolePron = 'sujet' | 'complement';

const PRON_SUJET = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles']);
const PRON_COMPL = new Set(['me', 'te', 'lui', 'leur', 'se', 'nous', 'vous']);
/* Formes NON ambiguës (un seul rôle) — nous/vous exclus (partagés par les deux rôles). */
const PRON_SUJET_STRICT = new Set(['je', 'tu', 'il', 'elle', 'on', 'ils', 'elles']);
const PRON_COMPL_STRICT = new Set(['me', 'te', 'lui', 'leur', 'se']);
const PRON_LABEL: Record<RolePron, string> = {
	sujet: 'le pronom personnel sujet',
	complement: 'le pronom personnel complément',
};
const PRON_CONSIGNE: Record<RolePron, string> = {
	sujet: 'Clique sur le pronom personnel sujet de la phrase.',
	complement: 'Clique sur le pronom personnel complément de la phrase.',
};
const PRON_EXPL: Record<RolePron, (m: string) => string> = {
	sujet: (m) => `« ${m} » fait l'action : c'est un pronom personnel sujet.`,
	complement: (m) => `« ${m} » reçoit l'action : c'est un pronom personnel complément.`,
};

export function pron(texte: string, cible: string, role: RolePron): PhraseClicMot {
	const setRole = role === 'sujet' ? PRON_SUJET : PRON_COMPL;
	const strict = role === 'sujet' ? PRON_SUJET_STRICT : PRON_COMPL_STRICT;
	const cl = cible.toLowerCase();
	if (!setRole.has(cl)) {
		throw new Error(
			`grammaire-clic-mot (pron ${role}) : « ${cible} » n'est pas un pronom ${role}.`,
		);
	}
	const tokens = tokeniser(texte);
	// Un seul pronom du rôle visé doit être cliquable : les formes strictes de CE rôle,
	// plus l'occurrence de la cible (couvre nous/vous ciblés), doivent totaliser 1.
	const memes = tokens.filter((t) => {
		const b = t.toLowerCase();
		return strict.has(b) || b === cl;
	});
	if (memes.length !== 1) {
		throw new Error(
			`grammaire-clic-mot (pron ${role}) : « ${texte} » doit contenir un seul pronom ${role} ` +
				`(« ${cible} » ; trouvé ${memes.length} : ${memes.join(', ')}).`,
		);
	}
	return phraseMots(texte, [cible], {
		explication: PRON_EXPL[role](cible),
		consigne: PRON_CONSIGNE[role],
		cibleLabel: PRON_LABEL[role],
	});
}
function pronItems(texte: string, specs: [string, RolePron][]): PhraseClicMot[] {
	return specs.map(([cible, role]) => pron(texte, cible, role));
}

const CONSIGNE_PRON = 'Clique sur le pronom personnel demandé.';

export const PHRASES_PRON: PhraseClicMot[] = [
	// Paires sujet + complément (formes différentes).
	...pronItems('Il lui offre un joli cadeau.', [
		['Il', 'sujet'],
		['lui', 'complement'],
	]),
	...pronItems('Nous leur envoyons une longue lettre.', [
		['Nous', 'sujet'],
		['leur', 'complement'],
	]),
	...pronItems('Tu me racontes une belle histoire.', [
		['Tu', 'sujet'],
		['me', 'complement'],
	]),
	...pronItems('Elle te prête son beau vélo.', [
		['Elle', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems("Ils nous attendent devant l'école.", [
		['Ils', 'sujet'],
		['nous', 'complement'],
	]),
	...pronItems('Vous me montrez le chemin.', [
		['Vous', 'sujet'],
		['me', 'complement'],
	]),
	...pronItems('Je te donne ma part de gâteau.', [
		['Je', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('On lui propose un nouveau jeu.', [
		['On', 'sujet'],
		['lui', 'complement'],
	]),
	...pronItems('Elles se cachent derrière le rideau.', [
		['Elles', 'sujet'],
		['se', 'complement'],
	]),
	...pronItems('Il se lave soigneusement avant le repas.', [
		['Il', 'sujet'],
		['se', 'complement'],
	]),
	...pronItems('Nous vous remercions pour votre aide.', [
		['Nous', 'sujet'],
		['vous', 'complement'],
	]),
	...pronItems('Tu nous expliques la règle du jeu.', [
		['Tu', 'sujet'],
		['nous', 'complement'],
	]),
	...pronItems('Ils te suivent dans le couloir.', [
		['Ils', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('Elle leur lit une histoire du soir.', [
		['Elle', 'sujet'],
		['leur', 'complement'],
	]),
	...pronItems('Je vous invite à mon anniversaire.', [
		['Je', 'sujet'],
		['vous', 'complement'],
	]),
	...pronItems('Elle te répond gentiment.', [
		['Elle', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('Vous nous aidez souvent.', [
		['Vous', 'sujet'],
		['nous', 'complement'],
	]),
	// Sujet seul (aucun pronom complément).
	...pronItems('Demain, nous partirons à la campagne.', [['nous', 'sujet']]),
	...pronItems('Chaque matin, elle arrose ses fleurs.', [['elle', 'sujet']]),
	...pronItems("Pendant l'été, ils voyagent en train.", [['ils', 'sujet']]),
	// Complément seul (sujet = groupe nominal).
	...pronItems('Ma grande sœur me coiffe doucement.', [['me', 'complement']]),
	...pronItems('Le professeur lui explique la leçon.', [['lui', 'complement']]),
	...pronItems('Les parents leur préparent un goûter.', [['leur', 'complement']]),
	...pronItems('Le chien nous suit partout.', [['nous', 'complement']]),
];

/* ============================================================
   Leçon D — Nom noyau du groupe nominal (#437, CM1).
   ------------------------------------------------------------
   Cible = le nom principal du GN ; distracteurs = son déterminant + son/ses adjectif(s).
   Contrainte STRUCTURELLE ABSOLUE (garde-fou d'ambiguïté) : UN SEUL groupe nominal
   développé par phrase ; tout le reste = pronom sujet, verbe, adverbe — JAMAIS un
   deuxième nom (pas de CC nominal, pas de complément du nom, pas d'apposition, pas de
   nom propre cible). Patrons variés : Dét+Nom, Dét+Nom+Adj, Dét+Adj+Nom.
   ============================================================ */
const CONSIGNE_NOYAU = 'Clique sur le nom noyau du groupe nominal.';
const CIBLE_NOYAU = 'le nom noyau';

function noyau(texte: string, nom: string): PhraseClicMot {
	return phraseMots(texte, [nom], {
		explication: `Le nom noyau, c'est le nom principal du groupe : ici « ${nom} » (les autres mots le complètent).`,
	});
}

export const PHRASES_NOYAU: PhraseClicMot[] = [
	// Dét + Nom
	noyau('Le chien aboie bruyamment.', 'chien'),
	noyau('Elle observe les étoiles.', 'étoiles'),
	noyau('Nous écoutons la musique.', 'musique'),
	noyau('Le clown danse joyeusement.', 'clown'),
	noyau('La lune brille faiblement.', 'lune'),
	noyau('Le train roule vite.', 'train'),
	noyau('Le savant explique calmement.', 'savant'),
	noyau('Le boulanger travaille tôt.', 'boulanger'),
	// Dét + Nom + Adj
	noyau('Le petit chat noir dort profondément.', 'chat'),
	noyau('Elle regarde un grand oiseau bleu.', 'oiseau'),
	noyau('Il conduit une voiture rouge.', 'voiture'),
	noyau('Tu portes un manteau chaud.', 'manteau'),
	noyau('Nous admirons un château immense.', 'château'),
	noyau('Le gâteau délicieux refroidit doucement.', 'gâteau'),
	noyau('Il répare le vélo cassé.', 'vélo'),
	noyau('Nous regardons un film passionnant.', 'film'),
	noyau('Il mange une pomme mûre.', 'pomme'),
	noyau('Elle range un tiroir profond.', 'tiroir'),
	noyau('Elle chante une jolie mélodie.', 'mélodie'),
	noyau('Elle porte une robe légère.', 'robe'),
	noyau('Il pousse un chariot rempli.', 'chariot'),
	noyau('La rivière tranquille coule lentement.', 'rivière'),
	noyau('Nous suivons un chemin étroit.', 'chemin'),
	noyau('Elle observe un papillon coloré.', 'papillon'),
	// Dét + Adj + Nom
	noyau('Tu admires ce grand tableau ancien.', 'tableau'),
	noyau('La petite fille sourit gentiment.', 'fille'),
	noyau('Le vieux pont tremble légèrement.', 'pont'),
	noyau('Elle caresse un joli chaton.', 'chaton'),
	noyau('Il escalade une haute montagne.', 'montagne'),
	noyau('Elle cueille une belle fleur.', 'fleur'),
	noyau('Le grand arbre grandit lentement.', 'arbre'),
	noyau('Elle achète un joli chapeau.', 'chapeau'),
	noyau('Tu dessines une belle princesse.', 'princesse'),
	noyau('La lune ronde brille faiblement.', 'lune'),
	noyau('Le nageur courageux plonge rapidement.', 'nageur'),
	noyau('Tu construis une belle cabane.', 'cabane'),
	noyau('Il attrape un gros ballon.', 'ballon'),
	noyau('La vieille horloge sonne bruyamment.', 'horloge'),
	noyau('Nous plantons un jeune arbre.', 'arbre'),
	noyau('Tu ouvres une lourde porte.', 'porte'),
	noyau('Le petit lapin bondit joyeusement.', 'lapin'),
];

/* ============================================================
   Leçon E — Sujet = nom noyau du groupe sujet, composé compris (#437, CM1).
   ------------------------------------------------------------
   Deux formes :
   - sujet SIMPLE : un GN au nom noyau unique (mêmes contraintes que D — pas d'autre
     nom ailleurs) → cible 1 mot ;
   - sujet COMPOSÉ : NOMS PROPRES uniquement (« Paul et Léa ») → cible = les deux noms,
     en SAUTANT « et » (cible double non adjacente).
   Interdits : PAS de sujet composé de deux GN à déterminant (« le chat et le chien »,
   différé) ; PAS de mixte pronom + nom (« Toi et ton frère ») ; PAS de sujet à 3 éléments.
   ============================================================ */
const CONSIGNE_SUJET =
	'Clique sur le nom noyau du sujet. Parfois, le sujet est composé de deux noms : clique sur les deux !';
const CIBLE_SUJET = 'le nom noyau du sujet';

function sujetSimple(texte: string, nom: string): PhraseClicMot {
	return phraseMots(texte, [nom], {
		explication: `Le nom noyau du sujet, c'est qui fait l'action : « ${nom} » (les autres mots le complètent).`,
	});
}
function sujetCompose(texte: string, nom1: string, nom2: string): PhraseClicMot {
	return phraseMots(texte, [nom1, nom2], {
		explication: `Le sujet est composé de deux noms : « ${nom1} » et « ${nom2} ».`,
	});
}

export const PHRASES_SUJET: PhraseClicMot[] = [
	// Sujet simple (GN au nom noyau unique).
	sujetSimple('Le petit chien aboie joyeusement.', 'chien'),
	sujetSimple('La grande girafe mange lentement.', 'girafe'),
	sujetSimple('Le vieux pêcheur dort tranquillement.', 'pêcheur'),
	sujetSimple('Une jolie fleur pousse doucement.', 'fleur'),
	sujetSimple('Le gros nuage avance lentement.', 'nuage'),
	sujetSimple('La petite souris court vite.', 'souris'),
	sujetSimple('Le champion fatigué respire fortement.', 'champion'),
	sujetSimple('Mon frère travaille sérieusement.', 'frère'),
	sujetSimple('Cette chanteuse chante merveilleusement.', 'chanteuse'),
	sujetSimple('Le brave pompier intervient rapidement.', 'pompier'),
	sujetSimple('Une abeille butine tranquillement.', 'abeille'),
	sujetSimple('Le clown maladroit tombe souvent.', 'clown'),
	sujetSimple('Le gros ours dort paisiblement.', 'ours'),
	sujetSimple('Le boulanger commence tôt.', 'boulanger'),
	sujetSimple('Ma petite sœur dessine joliment.', 'sœur'),
	sujetSimple('Le petit écureuil grimpe rapidement.', 'écureuil'),
	sujetSimple('La vieille dame marche prudemment.', 'dame'),
	sujetSimple('Un grand cheval galope librement.', 'cheval'),
	sujetSimple('Le facteur pressé roule rapidement.', 'facteur'),
	sujetSimple('Cette élève répond poliment.', 'élève'),
	// Sujet composé (deux noms propres, « et » sauté).
	sujetCompose('Paul et Léa jouent ensemble.', 'Paul', 'Léa'),
	sujetCompose('Tom et Lucas courent vite.', 'Tom', 'Lucas'),
	sujetCompose('Emma et Chloé chantent gaiement.', 'Emma', 'Chloé'),
	sujetCompose('Nina et Sacha dansent joyeusement.', 'Nina', 'Sacha'),
	sujetCompose('Léo et Marie rient beaucoup.', 'Léo', 'Marie'),
	sujetCompose('Hugo et Jules travaillent sérieusement.', 'Hugo', 'Jules'),
	sujetCompose('Alice et Sarah nagent rapidement.', 'Alice', 'Sarah'),
	sujetCompose('Adam et Noé dessinent tranquillement.', 'Adam', 'Noé'),
	sujetCompose('Zoé et Manon sautent partout.', 'Zoé', 'Manon'),
	sujetCompose('Théo et Lina applaudissent fort.', 'Théo', 'Lina'),
];

/* ============================================================
   Leçons CE2 (#436) — nom, adjectif, déterminant, pronom personnel sujet.
   ------------------------------------------------------------
   Mêmes briques que les natures CM1 (même runner, même correction par égalité
   d'ensembles), mais des BANQUES et des CONSIGNES PROPRES AU CE2. Au CE2 on NOMME les
   classes de mots EN BLOC, sans les sous-catégoriser : ni article / possessif /
   démonstratif pour le déterminant, ni sujet / complément pour le pronom (ce sont des
   attendus CM1). Les banques CM1 restent intactes ; `generate` choisit la variante du
   niveau (patron de `clicVerbeType`).

   Cible PLURIELLE pour « nom » et « déterminant » (décision produit) : la consigne
   demande TOUS les noms / TOUS les déterminants de la phrase, et la réponse est
   l'ENSEMBLE de ces mots. Raison : au CE2 on ne peut pas exiger à la fois une cible
   UNIQUE et une position VARIÉE — varier la position suppose plusieurs groupes
   nominaux, donc plusieurs noms et plusieurs déterminants. Le runner corrige déjà un
   ensemble de mots non adjacents (cf. sujet composé « Paul … Léa »). « Adjectif » et
   « pronom personnel sujet » restent à cible UNIQUE.
   ============================================================ */

/* Énumération lisible des mots-cibles d'une explication (cible plurielle) :
   « chien » et « pomme » ; « la », « une » et « des ». Les mots sont CITÉS (guillemets),
   l'énumération elle-même est celle du cœur (`enumererFr`) — même règle que le libellé lu,
   donc aucune divergence possible entre l'explication et la réponse annoncée. */
function listeMots(mots: string[]): string {
	return enumererFr(mots.map((m) => `« ${m} »`));
}

/* Les déterminants du CE2, EN BLOC (articles + possessifs + démonstratifs) : la
   sous-catégorisation est un attendu CM1, on réutilise donc juste les ensembles de la
   leçon B pour ne pas tenir deux listes. */
const DET_CE2 = new Set<string>([
	...DET_SETS.article,
	...DET_SETS.possessif,
	...DET_SETS.demonstratif,
]);

/* Mots dont la présence ferait de la phrase un contre-exemple dans les banques CE2 à
   base de déterminants : partitifs/contractés (hors périmètre, comme au CM1), « leur »
   SINGULIER (homographe du pronom complément « je leur parle » — « leurs » reste, il
   n'a pas de pronom homographe), et les déterminants qui ne sont PAS nommés au CE2
   (indéfinis, numéraux) — s'ils étaient là, ils seraient des déterminants non ciblés,
   donc une réponse fausse enseignée. */
const DET_CE2_INTERDITS = new Set([
	'du',
	'au',
	'aux',
	'leur',
	'chaque',
	'quelques',
	'plusieurs',
	'certains',
	'certaines',
	'tout',
	'toute',
	'tous',
	'toutes',
	'quel',
	'quelle',
	'quels',
	'quelles',
	'deux',
	'trois',
	'quatre',
	'cinq',
	'six',
	'sept',
	'huit',
	'neuf',
	'dix',
]);

/* Formes d'être/avoir : « Ce sont… », « Ce n'est pas… » font de « ce » un PRONOM, pas
   un déterminant (interdit déjà acté au CM1). Garde-fou de construction. */
const ETRE_AVOIR_CE2 = new Set([
	'est',
	'sont',
	'était',
	'étaient',
	'sera',
	'seront',
	'a',
	'ont',
	'avait',
	'avaient',
]);

/* ---------- Leçon CE2 « Clique sur les noms » (banque du nom noyau CM1 étendue) ----------
   Cible = TOUS les noms de la phrase. SIMPLIFICATION ASSUMÉE (avis pédagogue) : le nom
   PROPRE compte comme un nom au même titre que le nom commun — au CE2 la classe « nom »
   se nomme en bloc, la distinction commun/propre est une autre leçon. L'explication le
   dit explicitement quand la phrase en contient un.
   Garde-fous de construction :
   - au moins DEUX noms par phrase (sinon la consigne au pluriel serait mensongère) ;
   - chaque nom ciblé est introduit par un déterminant (ou est un nom propre) ;
   - RÉCIPROQUE (le vrai risque) : tout introducteur de la phrase est suivi d'un nom
     CIBLÉ — un nom oublié dans l'annotation lève à la construction ;
   - aucun mot élidé « l'… » / « d'… » (le tokeniseur soude l'article au nom : le mot
     cliquable ne serait plus le nom seul).
   Écarté volontairement : les participes passés substantivés et les noms sans
   déterminant (« en classe », « à vélo ») — le garde-fou ci-dessus les refuse. */
const CONSIGNE_NOM_CE2 = 'Clique sur tous les noms de la phrase.';
const CIBLE_NOM_CE2 = 'les noms';

/* Mots qui INTRODUISENT un nom : déterminants du CE2, contractés/partitif et
   « chaque ». Ils ne sont pas cliquables ici (seul le nom l'est) : la liste sert au
   garde-fou « aucun nom oublié », pas à la pédagogie de la leçon. */
const NOM_INTRODUCTEURS = new Set<string>([...DET_CE2, 'au', 'aux', 'du', 'chaque']);
/* Fenêtre de recherche du nom après son introducteur : « un très beau dessin » place le
   nom 3 mots plus loin. */
const FENETRE_NOM = 3;

/* Exportée (comme `phrase`/`phraseMots`/`det`/`pron`) pour tester DIRECTEMENT ses chemins
   `throw` : un garde-fou de construction qu'aucun test n'exécute ne protège rien. */
export function nomsCE2(texte: string, noms: string[]): PhraseClicMot {
	if (noms.length < 2) {
		throw new Error(
			`grammaire-clic-mot (noms CE2) : « ${texte} » doit contenir au moins deux noms ` +
				`(consigne au pluriel), ${noms.length} annoncé(s).`,
		);
	}
	const tokens = tokeniser(texte);
	for (const t of tokens) {
		if (/^[ld]'/iu.test(t)) {
			throw new Error(
				`grammaire-clic-mot (noms CE2) : « ${t} » est élidé dans « ${texte} » ` +
					`(l'article soudé au nom empêche de cliquer le nom seul).`,
			);
		}
	}
	const cible = new Set<number>();
	// Positions attendues : mêmes règles que phraseMots (unicité vérifiée là-bas).
	tokens.forEach((t, i) => {
		if (noms.some((n) => n.toLowerCase() === t.toLowerCase())) cible.add(i);
	});
	for (const i of cible) {
		const propre = /^\p{Lu}/u.test(tokens[i]);
		const introduit = tokens
			.slice(Math.max(0, i - FENETRE_NOM), i)
			.some((t) => NOM_INTRODUCTEURS.has(t.toLowerCase()));
		if (!propre && !introduit) {
			throw new Error(
				`grammaire-clic-mot (noms CE2) : « ${tokens[i]} » n'est ni un nom propre ni introduit ` +
					`par un déterminant dans « ${texte} ».`,
			);
		}
	}
	tokens.forEach((t, j) => {
		if (!NOM_INTRODUCTEURS.has(t.toLowerCase())) return;
		const suivi = tokens.slice(j + 1, j + 1 + FENETRE_NOM).some((_, k) => cible.has(j + 1 + k));
		if (!suivi) {
			throw new Error(
				`grammaire-clic-mot (noms CE2) : « ${t} » n'introduit aucun nom CIBLÉ dans ` +
					`« ${texte} » (nom oublié dans l'annotation ?).`,
			);
		}
	});
	const ordonnes = [...cible].sort((a, b) => a - b).map((i) => tokens[i]);
	// Rappel « le nom propre est un nom » ACCORDÉ au nombre de noms propres cités : une
	// phrase peut en contenir deux (« Paul et Léa »), et un rappel figé au singulier
	// donnerait « Un nom propre (« Paul » et « Léa ») est un nom lui aussi ».
	const propres = ordonnes.filter((m) => /^\p{Lu}/u.test(m));
	const rappel = !propres.length
		? ''
		: propres.length === 1
			? ` Un nom propre (${listeMots(propres)}) est un nom lui aussi.`
			: ` Des noms propres (${listeMots(propres)}) sont des noms eux aussi.`;
	return phraseMots(texte, noms, {
		explication:
			`Les noms de la phrase sont ${listeMots(ordonnes)} : ils désignent une personne, ` +
			`un animal, une chose ou une idée.${rappel}`,
		consigne: CONSIGNE_NOM_CE2,
		cibleLabel: CIBLE_NOM_CE2,
		// L'explication énumère déjà les noms : la région live n'a pas à les redire (#436).
		explicationNommeCible: true,
	});
}

export const PHRASES_NOM_CE2: PhraseClicMot[] = [
	// Deux groupes nominaux : sujet + complément (le nom n'est jamais le 1er mot).
	nomsCE2('Le chien mange sa gamelle.', ['chien', 'gamelle']),
	nomsCE2('La fille dessine un bateau.', ['fille', 'bateau']),
	nomsCE2('Le boulanger prépare des croissants.', ['boulanger', 'croissants']),
	nomsCE2('Mon frère répare son vélo.', ['frère', 'vélo']),
	nomsCE2('La maîtresse écrit la date.', ['maîtresse', 'date']),
	nomsCE2('Le facteur apporte une lettre.', ['facteur', 'lettre']),
	nomsCE2('Le jardinier arrose les fleurs.', ['jardinier', 'fleurs']),
	nomsCE2('Ma sœur range ses affaires.', ['sœur', 'affaires']),
	nomsCE2('Le fermier nourrit ses poules.', ['fermier', 'poules']),
	nomsCE2('Le pêcheur attrape un poisson.', ['pêcheur', 'poisson']),
	nomsCE2('Le vent casse une branche.', ['vent', 'branche']),
	nomsCE2('La cuisinière prépare un gâteau.', ['cuisinière', 'gâteau']),
	nomsCE2('Le maçon construit une maison.', ['maçon', 'maison']),
	nomsCE2('Mon cousin cherche ses lunettes.', ['cousin', 'lunettes']),
	nomsCE2('Le peintre nettoie ses pinceaux.', ['peintre', 'pinceaux']),
	nomsCE2('La vendeuse compte les pièces.', ['vendeuse', 'pièces']),
	nomsCE2('Le chat griffe le fauteuil.', ['chat', 'fauteuil']),
	nomsCE2('Ma voisine promène son chien.', ['voisine', 'chien']),
	nomsCE2('Le vétérinaire soigne un lapin.', ['vétérinaire', 'lapin']),
	nomsCE2('Le berger surveille son troupeau.', ['berger', 'troupeau']),
	// Avec un adjectif : l'adjectif se glisse entre le déterminant et le nom (distracteur).
	nomsCE2('Le petit chat boit du lait.', ['chat', 'lait']),
	nomsCE2('La grande girafe mange des feuilles.', ['girafe', 'feuilles']),
	nomsCE2('Un gros nuage cache le soleil.', ['nuage', 'soleil']),
	nomsCE2('Le vieux pêcheur répare un filet.', ['pêcheur', 'filet']),
	nomsCE2('La jolie fleur parfume la chambre.', ['fleur', 'chambre']),
	nomsCE2('Le nouveau maître explique la leçon.', ['maître', 'leçon']),
	nomsCE2('Une abeille jaune butine les fleurs.', ['abeille', 'fleurs']),
	nomsCE2('Le grand arbre cache la lumière.', ['arbre', 'lumière']),
	nomsCE2('La petite souris grignote une croûte.', ['souris', 'croûte']),
	nomsCE2('Le chien noir garde la maison.', ['chien', 'maison']),
	nomsCE2('Le ciel est gris ce matin.', ['ciel', 'matin']),
	// Complément circonstanciel en tête : trois noms, aucun en position 1.
	nomsCE2('Dans la cour, les enfants jouent au ballon.', ['cour', 'enfants', 'ballon']),
	nomsCE2('Sur la table, un vase attend les fleurs.', ['table', 'vase', 'fleurs']),
	nomsCE2('Chaque matin, le coq réveille la ferme.', ['matin', 'coq', 'ferme']),
	nomsCE2('Pendant les vacances, ma famille visite un château.', [
		'vacances',
		'famille',
		'château',
	]),
	nomsCE2('Le soir, les étoiles brillent dans le ciel.', ['soir', 'étoiles', 'ciel']),
	nomsCE2('Derrière la maison, un chien creuse un trou.', ['maison', 'chien', 'trou']),
	nomsCE2('Au marché, le vendeur pèse les pommes.', ['marché', 'vendeur', 'pommes']),
	nomsCE2('Sous le lit, le chat cache une balle.', ['lit', 'chat', 'balle']),
	nomsCE2('Après la récréation, les élèves rangent leurs cahiers.', [
		'récréation',
		'élèves',
		'cahiers',
	]),
	nomsCE2('Devant le portail, une voiture attend le facteur.', ['portail', 'voiture', 'facteur']),
	// Noms propres (comptés comme noms) : en tête, au milieu, coordonnés.
	nomsCE2('Léa dessine un bateau.', ['Léa', 'bateau']),
	nomsCE2('Paul et Léa partagent un goûter.', ['Paul', 'Léa', 'goûter']),
	nomsCE2('Le chien de Julie aboie dans le jardin.', ['chien', 'Julie', 'jardin']),
	nomsCE2('Tom range ses jouets dans la boîte.', ['Tom', 'jouets', 'boîte']),
	nomsCE2('Emma apporte un cadeau à sa cousine.', ['Emma', 'cadeau', 'cousine']),
	nomsCE2('Lucas oublie son cartable dans la classe.', ['Lucas', 'cartable', 'classe']),
	nomsCE2('Ce matin, Marie promène le chien.', ['matin', 'Marie', 'chien']),
	nomsCE2('Nina et son frère préparent une surprise.', ['Nina', 'frère', 'surprise']),
	// Sujet pronom : les noms sont tous après le verbe.
	nomsCE2('Il range ses crayons dans une trousse.', ['crayons', 'trousse']),
	nomsCE2('Nous cherchons les clés de la voiture.', ['clés', 'voiture']),
	nomsCE2('Elle plante des tulipes dans le jardin.', ['tulipes', 'jardin']),
	nomsCE2('Tu portes un manteau et une écharpe.', ['manteau', 'écharpe']),
	nomsCE2('Vous écoutez une histoire dans la classe.', ['histoire', 'classe']),
	nomsCE2('Ils traversent la rue avec leurs parents.', ['rue', 'parents']),
];

/* ---------- Leçon CE2 « Clique sur les déterminants » ----------
   Cible = TOUS les déterminants de la phrase, articles / possessifs / démonstratifs
   CONFONDUS (pas de sous-catégorie au CE2). Les indices sont DÉRIVÉS de la phrase
   (tout token de `DET_CE2`), pas annotés à la main : impossible d'en oublier un.
   Garde-fous : au moins deux déterminants ; aucun mot de `DET_CE2_INTERDITS` ; aucun
   mot élidé « l'… » (l'article n'y est plus cliquable) ; « ce » jamais suivi d'être ou
   d'avoir (ce serait le PRONOM « Ce sont… ») ; aucun article collé derrière un pronom
   sujet (« je le vois » : « le » y est un pronom complément, pas un déterminant). */
const CONSIGNE_DET_CE2 = 'Clique sur tous les déterminants de la phrase.';
const CIBLE_DET_CE2 = 'les déterminants';

/* Exportée pour tester DIRECTEMENT ses chemins `throw` (cf. `nomsCE2`). */
export function detsCE2(texte: string): PhraseClicMot {
	const tokens = tokeniser(texte);
	for (const t of tokens) {
		const b = t.toLowerCase();
		if (DET_CE2_INTERDITS.has(b)) {
			throw new Error(
				`grammaire-clic-mot (déterminants CE2) : « ${t} » est hors périmètre CE2 dans ` +
					`« ${texte} » (partitif/contracté, « leur » pronom ou déterminant non nommé au CE2).`,
			);
		}
		if (b.startsWith("l'")) {
			throw new Error(
				`grammaire-clic-mot (déterminants CE2) : « ${t} » est élidé dans « ${texte} » ` +
					`(l'article soudé au nom n'est plus cliquable).`,
			);
		}
	}
	const indices: number[] = [];
	tokens.forEach((t, i) => {
		if (DET_CE2.has(t.toLowerCase())) indices.push(i);
	});
	if (indices.length < 2) {
		throw new Error(
			`grammaire-clic-mot (déterminants CE2) : « ${texte} » doit contenir au moins deux ` +
				`déterminants (consigne au pluriel), ${indices.length} trouvé(s).`,
		);
	}
	for (const i of indices) {
		const suivant = (tokens[i + 1] ?? '').toLowerCase();
		if (tokens[i].toLowerCase() === 'ce' && ETRE_AVOIR_CE2.has(suivant)) {
			throw new Error(
				`grammaire-clic-mot (déterminants CE2) : « ce ${suivant} » dans « ${texte} » — ` +
					`« ce » y est un pronom, pas un déterminant.`,
			);
		}
		const precedent = (tokens[i - 1] ?? '').toLowerCase();
		if (PRON_SUJET.has(precedent)) {
			throw new Error(
				`grammaire-clic-mot (déterminants CE2) : « ${precedent} ${tokens[i]} » dans ` +
					`« ${texte} » — « ${tokens[i]} » y est un pronom complément, pas un déterminant.`,
			);
		}
	}
	const mots = indices.map((i) => tokens[i]);
	return phraseMots(texte, mots, {
		explication: `Les déterminants de la phrase sont ${listeMots(mots)} : chacun est placé devant un nom.`,
		consigne: CONSIGNE_DET_CE2,
		cibleLabel: CIBLE_DET_CE2,
		// L'explication énumère déjà les déterminants : pas de double annonce (#436).
		explicationNommeCible: true,
	});
}

export const PHRASES_DET_CE2: PhraseClicMot[] = [
	// Deux déterminants : sujet + complément. Un déterminant OUVRE souvent la phrase :
	// la moitié de la banque commence donc par autre chose (mot d'introduction, verbe à
	// l'impératif, pronom sujet) pour que « le 1er mot » ne devienne pas une stratégie.
	detsCE2('Le chien mange sa gamelle.'),
	detsCE2("Aujourd'hui, la fille dessine un bateau."),
	detsCE2('Dans le garage, mon frère répare son vélo.'),
	detsCE2('Cette histoire raconte une aventure.'),
	detsCE2('Après la classe, ces enfants rangent leurs jouets.'),
	detsCE2('Ce matin, le facteur apporte une lettre.'),
	detsCE2('Depuis ce matin, ma sœur cherche ses lunettes.'),
	detsCE2('En hiver, ce garçon porte un manteau.'),
	detsCE2('En automne, les oiseaux quittent leurs nids.'),
	detsCE2('Souvent, notre équipe gagne le match.'),
	detsCE2('Votre chien aboie dans le jardin.'),
	detsCE2('Cet oiseau protège ses petits.'),
	detsCE2('Pour ton anniversaire, tes amis apportent des cadeaux.'),
	detsCE2('En été, nos cousins visitent cette ville.'),
	detsCE2('Le matin, le jardinier arrose les fleurs.'),
	detsCE2('Une abeille butine ces fleurs.'),
	detsCE2('Pour la fête, ta cousine prépare un gâteau.'),
	detsCE2('Mes parents rangent la cuisine.'),
	detsCE2('Après la récréation, le maître corrige nos cahiers.'),
	detsCE2('Cette dame promène son chien.'),
	detsCE2('Le petit chat boit son lait.'),
	detsCE2('La grande girafe mange des feuilles.'),
	detsCE2('Un gros nuage cache le soleil.'),
	detsCE2('À midi, ma voisine promène son chien.'),
	detsCE2('Cet acteur joue un rôle.'),
	detsCE2('Ces montagnes cachent le soleil.'),
	// Trois déterminants, complément circonstanciel en tête (aucun en position 1).
	detsCE2('Sur la table, un vase attend des fleurs.'),
	detsCE2('Dans le jardin, mes cousins plantent un arbre.'),
	detsCE2('Derrière la maison, ce chien creuse un trou.'),
	detsCE2('Pendant les vacances, ma famille visite un château.'),
	detsCE2('Ce matin, le coq réveille la ferme.'),
	detsCE2('Le soir, les étoiles brillent dans le ciel.'),
	detsCE2('Dans la classe, les élèves écoutent le maître.'),
	detsCE2('Sous le lit, mon chat cache une balle.'),
	detsCE2('Devant la porte, une voiture attend le facteur.'),
	detsCE2('Ce chien garde la maison de mes voisins.'),
	detsCE2('Mon cousin apporte ces bonbons à la fête.'),
	detsCE2('La vendeuse range les fruits dans une caisse.'),
	detsCE2('Le vent casse une branche de notre arbre.'),
	detsCE2('Cette fille montre son dessin à ses amies.'),
	detsCE2('Les pompiers éteignent le feu dans cette forêt.'),
	detsCE2('Notre maîtresse corrige ce cahier.'),
	// Impératif : la phrase ne commence pas par un déterminant.
	detsCE2('Range tes affaires dans ce tiroir.'),
	detsCE2('Ferme la porte de ta chambre.'),
	detsCE2('Regarde ce château et cette tour.'),
	detsCE2('Apporte mon cahier et une gomme.'),
	detsCE2('Écoute la chanson de ce chanteur.'),
	detsCE2('Prends ton manteau et tes bottes.'),
	// Sujet pronom : les déterminants sont tous après le verbe.
	detsCE2('Tu portes une écharpe et un bonnet.'),
	detsCE2('Nous cherchons les clés de la voiture.'),
	detsCE2('Elle plante des tulipes dans le jardin.'),
	detsCE2('Ils traversent la rue avec leurs parents.'),
	detsCE2('Vous écoutez une histoire dans la classe.'),
	detsCE2('Il range ses crayons dans une trousse.'),
];

/* ---------- Leçon CE2 « Clique sur l'adjectif » (leçon NEUVE) ----------
   Cible UNIQUE : l'adjectif est facultatif dans le groupe nominal, une phrase à un seul
   adjectif est donc naturelle. Positions variées : après le nom, avant le nom, attribut
   après « être ».
   Interdits d'ambiguïté (avis pédagogue) :
   - PARTICIPES PASSÉS à valeur adjectivale (« fatigué », « cassé », « fermé ») : trop
     proches d'un passé composé sans auxiliaire visible, piège classique au CE2 ;
   - formes NOM/ADJECTIF ambiguës (nationalités substantivées : « un Français ») ;
   - un adverbe en « -ment » du MÊME radical que l'adjectif visé (« lente » +
     « lentement ») ;
   - un DEUXIÈME adjectif dans la phrase (garde-fou : aucun autre mot de la phrase n'est
     une forme employée comme cible ailleurs dans la banque, ni un mot de même radical). */
const CONSIGNE_ADJ_CE2 = "Clique sur l'adjectif de la phrase.";
const CIBLE_ADJ_CE2 = "l'adjectif";

/* Garde-fou, pas une liste exhaustive : les formes qu'on refuse de voir apparaître dans
   cette banque (participes passés adjectivaux + nationalités substantivables). */
const ADJ_CE2_INTERDITS = new Set([
	'fatigué',
	'fatiguée',
	'fatigués',
	'fatiguées',
	'cassé',
	'cassée',
	'cassés',
	'cassées',
	'fermé',
	'fermée',
	'ouvert',
	'ouverte',
	'rempli',
	'remplie',
	'mouillé',
	'mouillée',
	'trempé',
	'trempée',
	'endormi',
	'endormie',
	'assis',
	'assise',
	'couché',
	'couchée',
	'allumé',
	'allumée',
	'éteint',
	'éteinte',
	'rangé',
	'rangée',
	'perdu',
	'perdue',
	'blessé',
	'blessée',
	'gelé',
	'gelée',
	'sucré',
	'sucrée',
	'salé',
	'salée',
	'coloré',
	'colorée',
	'doré',
	'dorée',
	'poli',
	'polie',
	'cuit',
	'cuite',
	'brûlé',
	'brûlée',
	'déchiré',
	'déchirée',
	'fané',
	'fanée',
	'français',
	'française',
	'anglais',
	'anglaise',
	'espagnol',
	'espagnole',
	'italien',
	'italienne',
	'chinois',
	'chinoise',
	'allemand',
	'allemande',
]);

/* Radical GROSSIER (minuscule, marque du pluriel puis du féminin retirées) : sert
   uniquement à repérer, dans une même phrase, deux mots de la même famille que
   l'adjectif visé (« grand » / « grande », « calme » / « calmement »). Heuristique
   assumée, pas une analyse morphologique. */
function radicalAdj(mot: string): string {
	let r = mot.toLowerCase();
	if (r.endsWith('s')) r = r.slice(0, -1);
	if (r.endsWith('e')) r = r.slice(0, -1);
	return r;
}

/* Banque AUTORÉE (phrase, adjectif) : les FORMES employées comme cibles servent ensuite
   de détecteur de second adjectif, d'où la construction en deux temps. */
const ADJ_CE2_ITEMS: [string, string][] = [
	// Adjectif APRÈS le nom
	['Ma sœur porte une robe rouge.', 'rouge'],
	['Le chat noir dort sur le canapé.', 'noir'],
	['Nous suivons un chemin étroit.', 'étroit'],
	['Elle cueille une fleur blanche.', 'blanche'],
	['Le facteur apporte une lettre importante.', 'importante'],
	['Tu portes un manteau vert.', 'vert'],
	['Le boulanger vend des croissants chauds.', 'chauds'],
	['Léa raconte une histoire drôle.', 'drôle'],
	['Il escalade une montagne immense.', 'immense'],
	['Nous regardons un film amusant.', 'amusant'],
	['Le clown lance une balle jaune.', 'jaune'],
	['Ma cousine cherche un livre passionnant.', 'passionnant'],
	['Le jardinier plante un arbre fruitier.', 'fruitier'],
	// « mûre » est aussi un NOM (le fruit) : homographe nom/adjectif que cette banque
	// s'interdit ailleurs, remplacé par une couleur.
	['Tom mange une pomme verte.', 'verte'],
	['Le maître écrit une phrase courte.', 'courte'],
	['Elle traverse une rue calme.', 'calme'],
	['Papa lave la voiture bleue.', 'bleue'],
	['Le pêcheur attrape un poisson énorme.', 'énorme'],
	['Nina dessine un papillon minuscule.', 'minuscule'],
	['Le berger surveille un troupeau paisible.', 'paisible'],
	// Adjectif AVANT le nom
	['Le petit chien aboie bruyamment.', 'petit'],
	['La grande girafe mange des feuilles.', 'grande'],
	['Un gros nuage cache le soleil.', 'gros'],
	['Le vieux pêcheur répare son filet.', 'vieux'],
	['Ma jolie cousine chante une chanson.', 'jolie'],
	['Le jeune chat grimpe sur le mur.', 'jeune'],
	['Une belle fleur pousse dans le jardin.', 'belle'],
	['Le nouveau maître explique la leçon.', 'nouveau'],
	['Nous visitons un magnifique château.', 'magnifique'],
	['Elle raconte une longue histoire.', 'longue'],
	['Tu ranges une grosse valise.', 'grosse'],
	['Le brave pompier arrose les flammes.', 'brave'],
	['Un joyeux oiseau chante sur la branche.', 'joyeux'],
	['La douce musique berce le bébé.', 'douce'],
	['Le méchant loup effraie les moutons.', 'méchant'],
	// Adjectif ATTRIBUT (après « être »)
	['Le ciel est gris ce matin.', 'gris'],
	['Cette histoire est très amusante.', 'amusante'],
	["Mon cartable est lourd aujourd'hui.", 'lourd'],
	['La piscine est profonde.', 'profonde'],
	['Ces exercices sont faciles.', 'faciles'],
	["Le chemin est long jusqu'au village.", 'long'],
	['Les fraises sont délicieuses.', 'délicieuses'],
	['La salle est vide.', 'vide'],
	['Mon chien est très gentil.', 'gentil'],
	["La rivière est calme aujourd'hui.", 'calme'],
	['Ce garçon est timide.', 'timide'],
	['Les rues sont étroites dans ce village.', 'étroites'],
	['Le chocolat est chaud.', 'chaud'],
	['La nuit est sombre.', 'sombre'],
	['Ces chaussures sont neuves.', 'neuves'],
	['Le gâteau est délicieux.', 'délicieux'],
	['Cette chanson est jolie.', 'jolie'],
	['Mes chaussons sont propres.', 'propres'],
	['Le sac est léger.', 'léger'],
	['Cette route est dangereuse.', 'dangereuse'],
	// Complément circonstanciel en tête (adjectif loin du début)
	['Dans le jardin, une abeille curieuse butine.', 'curieuse'],
	['Sur la table, un vase fragile attend des fleurs.', 'fragile'],
	['Chaque matin, le coq bruyant réveille la ferme.', 'bruyant'],
	['Pendant les vacances, ma famille visite un joli village.', 'joli'],
	['Le soir, les étoiles brillantes éclairent le ciel.', 'brillantes'],
];

const ADJ_CE2_FORMES = new Set(ADJ_CE2_ITEMS.map(([, a]) => a.toLowerCase()));

/* Exportée pour tester DIRECTEMENT ses chemins `throw` (cf. `nomsCE2`). Lit le lexique
   d'adjectifs de la banque (`ADJ_CE2_FORMES`), d'où la construction en deux temps. */
export function adjCE2(texte: string, adjectif: string): PhraseClicMot {
	const cible = adjectif.toLowerCase();
	if (ADJ_CE2_INTERDITS.has(cible)) {
		throw new Error(
			`grammaire-clic-mot (adjectif CE2) : « ${adjectif} » est un participe passé ou une ` +
				`forme nom/adjectif ambiguë — hors périmètre CE2.`,
		);
	}
	const p = phraseMots(texte, [adjectif], {
		explication: `« ${adjectif} » dit comment est le nom : c'est un adjectif.`,
		consigne: CONSIGNE_ADJ_CE2,
		cibleLabel: CIBLE_ADJ_CE2,
	});
	const rad = radicalAdj(adjectif);
	const cibleIdx = p.cibleIndices[0];
	p.tokens.forEach((t, k) => {
		if (k === cibleIdx) return;
		const b = t.toLowerCase();
		if (ADJ_CE2_INTERDITS.has(b)) {
			throw new Error(
				`grammaire-clic-mot (adjectif CE2) : « ${t} » (participe passé / forme ambiguë) ` +
					`ne doit pas apparaître dans « ${texte} ».`,
			);
		}
		if (ADJ_CE2_FORMES.has(b)) {
			throw new Error(
				`grammaire-clic-mot (adjectif CE2) : « ${texte} » contient un second adjectif ` +
					`(« ${t} ») — la cible ne serait plus unique.`,
			);
		}
		if (radicalAdj(b) === rad || (b.endsWith('ment') && b.startsWith(rad))) {
			throw new Error(
				`grammaire-clic-mot (adjectif CE2) : « ${t} » est de la même famille que ` +
					`« ${adjectif} » dans « ${texte} » (confusion adjectif / adverbe).`,
			);
		}
	});
	return p;
}

export const PHRASES_ADJ_CE2: PhraseClicMot[] = ADJ_CE2_ITEMS.map(([texte, a]) => adjCE2(texte, a));

/* ---------- Leçon CE2 « Clique sur le pronom personnel sujet » ----------
   Cible UNIQUE : je / tu / il / elle / on / nous / vous / ils / elles.
   Interdits d'ambiguïté (avis pédagogue) :
   - AUCUN pronom complément dans la phrase (« Il me regarde », « Elle lui parle ») : non
     enseigné au CE2, il ferait un distracteur illégitime ;
   - pas de « il » impersonnel (« il pleut », « il faut ») : ce « il » ne remplace personne ;
   - « on » avec modération, dans des phrases au sens limpide.
   Garde-fou : un SEUL pronom sujet cliquable par phrase, et c'est la cible. */
const CONSIGNE_PRON_CE2 = 'Clique sur le pronom personnel sujet de la phrase.';
const CIBLE_PRON_CE2 = 'le pronom personnel sujet';

/* Pronoms NON enseignés au CE2 dans ce cadre (compléments, toniques) : leur simple
   présence disqualifie la phrase. « leurs » (déterminant) reste autorisé. */
const PRON_CE2_INTERDITS = new Set(['me', 'te', 'se', 'lui', 'leur', 'moi', 'toi', 'eux', 'y']);
/* Verbes qui rendent « il » impersonnel. */
const VERBES_IMPERSONNELS = new Set([
	'pleut',
	'pleuvait',
	'neige',
	'neigeait',
	'faut',
	'fallait',
	'gèle',
	'fait',
	'fera',
	'ferait',
]);

/* Exportée pour tester DIRECTEMENT ses chemins `throw` (cf. `nomsCE2`). */
export function pronSujetCE2(texte: string, cible: string): PhraseClicMot {
	const cl = cible.toLowerCase();
	if (!PRON_SUJET.has(cl)) {
		throw new Error(
			`grammaire-clic-mot (pronom sujet CE2) : « ${cible} » n'est pas un pronom personnel sujet.`,
		);
	}
	const tokens = tokeniser(texte);
	for (const t of tokens) {
		if (PRON_CE2_INTERDITS.has(t.toLowerCase())) {
			throw new Error(
				`grammaire-clic-mot (pronom sujet CE2) : « ${t} » (pronom hors programme CE2) ` +
					`ne doit pas apparaître dans « ${texte} ».`,
			);
		}
	}
	const sujets = tokens.filter((t) => PRON_SUJET.has(t.toLowerCase()));
	if (sujets.length !== 1 || sujets[0].toLowerCase() !== cl) {
		throw new Error(
			`grammaire-clic-mot (pronom sujet CE2) : « ${texte} » doit contenir un seul pronom ` +
				`sujet (« ${cible} » ; trouvé ${sujets.length} : ${sujets.join(', ')}).`,
		);
	}
	const i = tokens.findIndex((t) => t.toLowerCase() === cl);
	const suivant = (tokens[i + 1] ?? '').toLowerCase();
	if (VERBES_IMPERSONNELS.has(suivant)) {
		throw new Error(
			`grammaire-clic-mot (pronom sujet CE2) : « ${cible} ${suivant} » dans « ${texte} » — ` +
				`ce « ${cible} » est impersonnel, il ne remplace personne.`,
		);
	}
	return phraseMots(texte, [cible], {
		explication: `« ${cible} » dit qui fait l'action : c'est un pronom personnel sujet.`,
		consigne: CONSIGNE_PRON_CE2,
		cibleLabel: CIBLE_PRON_CE2,
	});
}

export const PHRASES_PRON_CE2: PhraseClicMot[] = [
	// Les neuf pronoms, en tête de phrase.
	pronSujetCE2('Je range mes crayons dans la trousse.', 'Je'),
	pronSujetCE2('Tu colles une image dans ton cahier.', 'Tu'),
	pronSujetCE2('Il dessine un bateau sur son cahier.', 'Il'),
	pronSujetCE2('Elle arrose les fleurs du jardin.', 'Elle'),
	pronSujetCE2('Nous jouons au ballon dans la cour.', 'Nous'),
	pronSujetCE2('Vous écoutez la maîtresse.', 'Vous'),
	pronSujetCE2('Ils traversent la rue avec leurs parents.', 'Ils'),
	pronSujetCE2('Elles chantent une chanson joyeuse.', 'Elles'),
	pronSujetCE2('On range la classe avant la récréation.', 'On'),
	pronSujetCE2('Je cherche mes lunettes partout.', 'Je'),
	pronSujetCE2("Tu attends le bus devant l'école.", 'Tu'),
	pronSujetCE2('Il ferme la porte du garage.', 'Il'),
	pronSujetCE2('Elle prépare un gâteau au chocolat.', 'Elle'),
	pronSujetCE2('Nous plantons des tulipes dans le jardin.', 'Nous'),
	pronSujetCE2('Vous rangez vos affaires dans le placard.', 'Vous'),
	pronSujetCE2('Ils construisent une cabane dans la forêt.', 'Ils'),
	pronSujetCE2('Elles dessinent une belle maison.', 'Elles'),
	pronSujetCE2('On écoute une histoire avant la sieste.', 'On'),
	pronSujetCE2('Je porte mon cartable sur le dos.', 'Je'),
	pronSujetCE2('Tu mélanges la pâte avec une cuillère.', 'Tu'),
	pronSujetCE2('Il attrape le ballon avec ses mains.', 'Il'),
	pronSujetCE2('Elle recopie la phrase sans faute.', 'Elle'),
	pronSujetCE2('Nous partageons le gâteau en huit parts.', 'Nous'),
	pronSujetCE2('Vous chantez très fort dans la salle.', 'Vous'),
	pronSujetCE2('Ils gagnent le match contre notre équipe.', 'Ils'),
	pronSujetCE2('Elles rangent les livres sur les étagères.', 'Elles'),
	pronSujetCE2('On apporte des fruits pour le goûter.', 'On'),
	// Complément circonstanciel en tête : le pronom n'est plus le 1er mot.
	pronSujetCE2('Chaque matin, il promène son chien.', 'il'),
	pronSujetCE2('Le soir, elle lit une histoire.', 'elle'),
	pronSujetCE2('Pendant les vacances, nous visitons un château.', 'nous'),
	pronSujetCE2('Dans la cour, ils jouent au ballon.', 'ils'),
	pronSujetCE2('Demain, je finirai mon dessin.', 'je'),
	pronSujetCE2('Après le repas, tu ranges la table.', 'tu'),
	pronSujetCE2('Sur la plage, elles ramassent des coquillages.', 'elles'),
	pronSujetCE2('À la piscine, on nage longtemps.', 'on'),
	pronSujetCE2('Ce matin, vous arrivez en retard.', 'vous'),
	pronSujetCE2('Ce matin, je bois un chocolat chaud.', 'je'),
	pronSujetCE2('Dans le jardin, elle plante des salades.', 'elle'),
	pronSujetCE2('Le mercredi, nous allons à la piscine.', 'nous'),
	pronSujetCE2('Après la classe, ils rentrent à pied.', 'ils'),
	pronSujetCE2('Avant le dîner, tu mets la table.', 'tu'),
	pronSujetCE2('Le samedi, vous jouez au football.', 'vous'),
	pronSujetCE2('En hiver, elles portent un bonnet.', 'elles'),
	pronSujetCE2('Le dimanche, on visite nos grands-parents.', 'on'),
	pronSujetCE2('À midi, je mange à la cantine.', 'je'),
	// Deux propositions coordonnées : le pronom est au milieu de la phrase.
	pronSujetCE2('Le chien aboie et il court vers la porte.', 'il'),
	pronSujetCE2('La maîtresse explique et nous écoutons.', 'nous'),
	pronSujetCE2('Léa chante et elle danse.', 'elle'),
	pronSujetCE2('Papa cuisine pendant que je mets la table.', 'je'),
	pronSujetCE2('Les enfants rient et ils applaudissent.', 'ils'),
	pronSujetCE2('La cloche sonne et vous rentrez en classe.', 'vous'),
	pronSujetCE2('Le maître écrit et tu recopies la phrase.', 'tu'),
	pronSujetCE2('Tom range ses jouets et il ferme la boîte.', 'il'),
	pronSujetCE2('Mes cousins arrivent demain et ils apportent un cadeau.', 'ils'),
	pronSujetCE2('Le chat dort et il ronronne doucement.', 'il'),
	pronSujetCE2('Le maître pose une question et elles répondent.', 'elles'),
	pronSujetCE2('La pluie tombe et nous ouvrons les parapluies.', 'nous'),
	pronSujetCE2('Le four chauffe et tu attends le gâteau.', 'tu'),
	pronSujetCE2('Le spectacle commence et vous applaudissez très fort.', 'vous'),
	// Subordonnée en tête : le pronom sujet arrive après une proposition entière.
	pronSujetCE2('Quand la nuit tombe, je ferme les volets.', 'je'),
	pronSujetCE2('Dès que la récréation sonne, ils sortent dans la cour.', 'ils'),
	pronSujetCE2('Comme le bus est en retard, elle attend sur le trottoir.', 'elle'),
];

/** Entrée de leçon « clique sur le mot » : une leçon servie à deux niveaux peut se NOMMER
    différemment selon la classe (#436, cf. `LessonDef.labelNiveau`). Le catalogue reporte
    `labelNiveau` tel quel ; les autres familles de leçons n'ont rien à déclarer. */
export interface ClicMotLessonInput extends LessonInput {
	labelNiveau?: Partial<Record<SchoolLevel, string>>;
}

export const CLIC_MOT_LESSONS: ClicMotLessonInput[] = [
	{ id: 'fr-gram-clic-verbe', label: 'Clique sur le verbe', exerciseType: clicVerbeType() },
	{
		id: 'fr-gram-clic-det',
		label: 'Clique sur le déterminant',
		exerciseType: clicMotType({
			banque: PHRASES_DET,
			consigne: CONSIGNE_DET,
			levels: ['ce2', 'cm1'],
			ce2: {
				banque: PHRASES_DET_CE2,
				consigne: CONSIGNE_DET_CE2,
				cibleLabel: CIBLE_DET_CE2,
			},
		}),
	},
	{
		// Leçon NEUVE (#436), CE2 uniquement : au CM1 l'adjectif est déjà travaillé comme
		// distracteur du nom noyau et dans l'accord du groupe nominal.
		id: 'fr-gram-clic-adj',
		label: "Clique sur l'adjectif",
		exerciseType: clicMotType({
			banque: PHRASES_ADJ_CE2,
			consigne: CONSIGNE_ADJ_CE2,
			cibleLabel: CIBLE_ADJ_CE2,
			levels: ['ce2'],
		}),
	},
	{
		id: 'fr-gram-clic-conj',
		label: 'Clique sur la conjonction',
		exerciseType: clicMotType({
			banque: PHRASES_CONJ,
			consigne: CONSIGNE_CONJ,
			cibleLabel: CIBLE_CONJ,
		}),
	},
	{
		id: 'fr-gram-clic-pron',
		label: 'Clique sur le pronom',
		exerciseType: clicMotType({
			banque: PHRASES_PRON,
			consigne: CONSIGNE_PRON,
			levels: ['ce2', 'cm1'],
			ce2: {
				banque: PHRASES_PRON_CE2,
				consigne: CONSIGNE_PRON_CE2,
				cibleLabel: CIBLE_PRON_CE2,
			},
		}),
	},
	{
		// Libellé PAR NIVEAU (#436) : « noyau » est du vocabulaire CM1, que le CE2 ne doit
		// pas lire, mais que le CM1 doit garder (c'est le mot de son programme). `label`
		// porte la formulation NEUTRE (juste aux deux niveaux, servie aux rares écrans sans
		// niveau sous la main) et `labelNiveau` précise chaque classe.
		id: 'fr-gram-clic-noyau',
		label: 'Clique sur le nom',
		labelNiveau: { ce2: 'Clique sur le nom', cm1: 'Clique sur le nom noyau' },
		exerciseType: clicMotType({
			banque: PHRASES_NOYAU,
			consigne: CONSIGNE_NOYAU,
			cibleLabel: CIBLE_NOYAU,
			levels: ['ce2', 'cm1'],
			ce2: {
				banque: PHRASES_NOM_CE2,
				consigne: CONSIGNE_NOM_CE2,
				cibleLabel: CIBLE_NOM_CE2,
			},
		}),
	},
	{
		id: 'fr-gram-clic-sujet',
		label: 'Clique sur le sujet',
		exerciseType: clicMotType({
			banque: PHRASES_SUJET,
			consigne: CONSIGNE_SUJET,
			cibleLabel: CIBLE_SUJET,
		}),
	},
];
