/* ============================================================
   Grammaire — « Clique sur le mot » : MOTEUR + vocabulaire partagé (#259, #437, #530).
   ------------------------------------------------------------
   Module FEUILLE de la famille `grammaire-clic-mot-*` : il n'importe aucune banque, et
   toutes les banques l'importent. Il porte ce qui ne dépend d'AUCUNE nature :

   - le modèle de données (`PhraseClicMot`) et la tokenisation (`tokeniser`,
     `estPonctuation`, `joindrePhrase`) ;
   - les constructeurs de phrase à GARDE-FOU générique (`phrase` pour une cible
     contiguë, `phraseMots` pour un ensemble de mots isolés) : ce sont eux qui refusent
     à la CONSTRUCTION une cible ambiguë ou introuvable ;
   - la façon d'énoncer une cible (`cibleContigue`, `libelleCible`), source unique
     partagée par le widget, le repli fiche/bilan et le journal d'erreurs ;
   - la fabrique d'`ExerciseType` (`clicMotType`, `itemClicMot`, `MODE_CLIC`,
     `VarianteClicMot`) ;
   - le VOCABULAIRE grammatical partagé entre classes (`DET_SETS`, `PRON_SUJET` &
     compagnie, en bas de fichier).

   Pourquoi le vocabulaire vit ICI et pas dans la banque qui l'a introduit (#530) : les
   leçons CE2 (« tous les déterminants », « le pronom sujet ») se définissent sur les
   MÊMES ensembles de mots que les leçons CM1 (« l'article / le possessif / le
   démonstratif », « sujet vs complément »). Tant que tout tenait dans un seul fichier,
   les fonctions CE2 lisaient simplement les constantes déclarées dans la section CM1 ;
   à la découpe, ce couplage aurait forcé soit un import de banque à banque, soit une
   COPIE des ensembles dans chaque module — et deux listes de déterminants qui divergent
   se traduisent par un garde-fou qui accepte au CE2 ce qu'il refuse au CM1. Le
   vocabulaire est donc un tiers dont les deux dépendent, jamais l'inverse.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { choice, enumererFr } from '../../core/utils';
import { LEVEL_ORDER, closestSupported } from '../../core/levels';

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
	    annoncée, comportement par défaut (ne JAMAIS se taire sur la réponse).
	    #529 l'a généralisé : posé en #436 sur les deux seules banques livrées alors (nom
	    et déterminant, à cible plurielle), il manquait sur TOUTES les autres, qui citent
	    pourtant la cible elles aussi — verbe, conjonction, déterminant, pronom, nom
	    noyau, sujet, adjectif, pronom sujet. La redondance qu'il corrige subsistait donc
	    partout sauf aux deux endroits où on l'avait vue.
	    C'est ce qui rend un drapeau manuel fragile : rien ne relie l'explication qu'on
	    rédige au drapeau qu'on oublie de poser. La cohérence des deux est désormais
	    VÉRIFIÉE — si une explication cite ses mots-cibles sans porter le drapeau (ou
	    l'inverse), `npm test` échoue. Écrire l'explication suffit ; le test réclame le
	    drapeau. */
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

export function tokeniser(texte: string): string[] {
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
	// Les deux formulations CITENT le verbe : la région live n'a pas à le redire (#529).
	return { tokens, cibleIndices, explication, explicationNommeCible: true };
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
   variable). Partagé par toutes les fabriques de la famille (`clicMotType` ici,
   `clicVerbeType` dans le module « verbe »). */
export function itemClicMot(
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

/* Mode unique (comme l'appariement / le tri) : lancement direct du runner dédié,
   pas d'écran de choix de mode (#69). Le libellé du mode reste invisible (mono-mode :
   pas d'écran de choix) — il est neutre pour être réutilisé par les 5 natures. */
export const MODE_CLIC: ModeOption[] = [
	{ id: 'clic', label: 'Clique sur le mot', recommended: true },
];

/** Ce qu'un niveau apporte à une leçon « clique sur le mot » : sa banque, sa consigne et
    le nom de sa cible. Une leçon mono-niveau n'en a qu'une. */
export interface VarianteClicMot {
	banque: PhraseClicMot[];
	consigne: string;
	cibleLabel?: string;
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
   Vocabulaire grammatical PARTAGÉ entre classes (#530).
   ------------------------------------------------------------
   Les ensembles de mots ci-dessous sont lus par des banques de DEUX classes (cf. l'en-tête
   de ce module) : ils appartiennent donc au moteur, pas à la première leçon qui les a
   introduits. Ce sont des ensembles de FORMES, sans consigne ni libellé — ceux-là restent
   dans la banque de la nature concernée, où ils se lisent avec ses garde-fous.
   ============================================================ */

/* Sous-catégories de déterminant demandées au CM1 (#437). Le CE2, lui, travaille les
   déterminants EN BLOC (#436) : il lit l'UNION de ces trois ensembles (`DET_CE2`). */
export type SousCatDet = 'article' | 'possessif' | 'demonstratif';

export const DET_SETS: Record<SousCatDet, Set<string>> = {
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

/* Rôles de pronom personnel distingués au CM1 (#437). Au CE2 (#436), seul le rôle SUJET
   est travaillé, mais `PRON_SUJET` sert aux DEUX classes — et même à une troisième leçon :
   le garde-fou des déterminants CE2 s'en sert pour écarter le « leur » PRONOM (« je leur
   parle ») du « leur » DÉTERMINANT (« leur maison »). */
export type RolePron = 'sujet' | 'complement';

export const PRON_SUJET = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles']);
export const PRON_COMPL = new Set(['me', 'te', 'lui', 'leur', 'se', 'nous', 'vous']);
/* Formes NON ambiguës (un seul rôle) — nous/vous exclus (partagés par les deux rôles). */
export const PRON_SUJET_STRICT = new Set(['je', 'tu', 'il', 'elle', 'on', 'ils', 'elles']);
export const PRON_COMPL_STRICT = new Set(['me', 'te', 'lui', 'leur', 'se']);
