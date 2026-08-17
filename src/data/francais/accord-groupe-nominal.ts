/* ============================================================
   Orthographe grammaticale — accord dans le groupe nominal (#243, CM1).
   ------------------------------------------------------------
   QCM RIGOUREUX calqué sur l'accord du participe passé (participe-passe-etre.ts) :
   on montre un groupe nominal court au singulier, on demande de le mettre au
   pluriel (ou au féminin), et l'enfant choisit le groupe ENTIÈREMENT bien accordé
   parmi 3 propositions. Chaque distracteur casse EXACTEMENT UNE marque d'accord
   (déterminant, OU adjectif, OU nom) : on laisse un constituant à sa forme de
   départ pendant que les autres prennent la marque. Tous les mots affichés sont
   de VRAIES formes stockées ; seul l'accord diffère (jamais une faute inventée).

   Décision actée (designer + spécialiste dys + archi) : pas de saisie multi-champs,
   pas de nouveau runner — on réutilise le runner QCM (routage par `type: 'qcm'`).

   Modèle de données (cf. `GroupeNominal`) : on stocke pour chaque constituant ses
   formes RÉELLES (départ + cible). La bonne réponse et les distracteurs sont
   DÉRIVÉS programmatiquement par assemblage de ces formes — JAMAIS un groupe mal
   accordé tapé en chaîne brute.

   Progression (charge cognitive, avis spécialiste) : items à 2 marques
   (déterminant + nom : « le chat » → « les chats ») ET à 3 marques (déterminant +
   adjectif + nom : « le petit chat » → « les petits chats »). Borne : 3
   constituants max, adjectif antéposé OU postposé (pas les deux). Accords
   RÉGULIERS uniquement (suffixe -s / -e ; déterminants le/les, la/les, un/des,
   une/des, de/des) — les pluriels et féminins irréguliers relèvent des leçons
   d'accords sur mots isolés (#109/#243), pas du GN.

   UX (avis designer) :
   - marque d'accord SURLIGNÉE pour CHAQUE constituant variable, UNIFORMÉMENT sur
     tous les choix (bonne réponse ET distracteurs), sinon le surlignage trahirait
     la réponse. Déterminant : le mot entier ; adjectif/nom : le SUFFIXE (préfixe
     commun forme de départ / forme cible, le reste entouré d'un `<span class="term">`).
   - 3 options EMPILÉES (formes quasi-homophones : petit/petits) ;
   - PAS de TTS (`parle: ''`) : petit/petits sont homophones → l'oral trahirait.
   ============================================================ */
import type { ChoiceView, Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, escapeHTML, sample } from '../../core/utils';
import { etayageRedige, MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';

/** Sens de la transformation demandée à l'enfant. */
export type SensGN = 'pluriel' | 'feminin';

/** Un constituant du groupe nominal (déterminant, adjectif ou nom). `depart` est
    la forme du groupe SOURCE (au singulier, ou au masculin pour le féminin),
    `cible` la forme une fois accordée. Pour le déterminant, on surligne le mot
    entier ; pour l'adjectif et le nom, on surligne le suffixe d'accord (calculé
    par préfixe commun). Toujours de VRAIES formes orthographiées. */
interface Constituant {
	depart: string;
	cible: string;
	/** Type de surlignage : 'mot' (déterminant entier) ou 'suffixe' (adjectif/nom). */
	marque: 'mot' | 'suffixe';
}

/** Un groupe nominal et sa transformation. Les constituants sont listés dans
    l'ORDRE D'AFFICHAGE (déterminant, puis adjectif antéposé / nom / adjectif
    postposé selon le groupe). Toujours 2 ou 3 constituants : déterminant + nom,
    éventuellement + un adjectif (antéposé OU postposé). */
export interface GroupeNominal {
	id: string;
	sens: SensGN;
	constituants: Constituant[];
}

/* Banque de groupes nominaux (#243). Animaux / objets / lieux familiers, mélange
   2 et 3 marques, pluriel majoritaire + quelques féminins. Accords réguliers :
   nom et adjectif prennent -s au pluriel, -e au féminin ; déterminants réguliers.
   Le pluriel d'un GN indéfini avec adjectif antéposé prend « de » (de grandes
   maisons) — forme stockée, pas une règle déduite. */
export const GROUPES_NOMINAUX: GroupeNominal[] = [
	// ----- Pluriel, 2 marques (déterminant + nom) -----
	{
		id: 'le-chat',
		sens: 'pluriel',
		constituants: [
			{ depart: 'le', cible: 'les', marque: 'mot' },
			{ depart: 'chat', cible: 'chats', marque: 'suffixe' },
		],
	},
	{
		id: 'la-fleur',
		sens: 'pluriel',
		constituants: [
			{ depart: 'la', cible: 'les', marque: 'mot' },
			{ depart: 'fleur', cible: 'fleurs', marque: 'suffixe' },
		],
	},
	{
		id: 'un-livre',
		sens: 'pluriel',
		constituants: [
			{ depart: 'un', cible: 'des', marque: 'mot' },
			{ depart: 'livre', cible: 'livres', marque: 'suffixe' },
		],
	},
	{
		id: 'une-route',
		sens: 'pluriel',
		constituants: [
			{ depart: 'une', cible: 'des', marque: 'mot' },
			{ depart: 'route', cible: 'routes', marque: 'suffixe' },
		],
	},
	{
		id: 'le-jardin',
		sens: 'pluriel',
		constituants: [
			{ depart: 'le', cible: 'les', marque: 'mot' },
			{ depart: 'jardin', cible: 'jardins', marque: 'suffixe' },
		],
	},
	// ----- Pluriel, 3 marques (déterminant + adjectif antéposé + nom) -----
	{
		id: 'le-petit-chat',
		sens: 'pluriel',
		constituants: [
			{ depart: 'le', cible: 'les', marque: 'mot' },
			{ depart: 'petit', cible: 'petits', marque: 'suffixe' },
			{ depart: 'chat', cible: 'chats', marque: 'suffixe' },
		],
	},
	{
		id: 'le-grand-arbre',
		sens: 'pluriel',
		constituants: [
			{ depart: 'le', cible: 'les', marque: 'mot' },
			{ depart: 'grand', cible: 'grands', marque: 'suffixe' },
			{ depart: 'arbre', cible: 'arbres', marque: 'suffixe' },
		],
	},
	{
		id: 'le-joli-oiseau',
		sens: 'pluriel',
		constituants: [
			{ depart: 'le', cible: 'les', marque: 'mot' },
			{ depart: 'joli', cible: 'jolis', marque: 'suffixe' },
			{ depart: 'oiseau', cible: 'oiseaux', marque: 'suffixe' },
		],
	},
	// ----- Pluriel, 3 marques (déterminant + nom + adjectif postposé) -----
	{
		id: 'le-chien-noir',
		sens: 'pluriel',
		constituants: [
			{ depart: 'le', cible: 'les', marque: 'mot' },
			{ depart: 'chien', cible: 'chiens', marque: 'suffixe' },
			{ depart: 'noir', cible: 'noirs', marque: 'suffixe' },
		],
	},
	{
		id: 'la-voiture-bleue',
		sens: 'pluriel',
		constituants: [
			{ depart: 'la', cible: 'les', marque: 'mot' },
			{ depart: 'voiture', cible: 'voitures', marque: 'suffixe' },
			{ depart: 'bleue', cible: 'bleues', marque: 'suffixe' },
		],
	},
	{
		id: 'le-mur-vert',
		sens: 'pluriel',
		constituants: [
			{ depart: 'le', cible: 'les', marque: 'mot' },
			{ depart: 'mur', cible: 'murs', marque: 'suffixe' },
			{ depart: 'vert', cible: 'verts', marque: 'suffixe' },
		],
	},
	// ----- Pluriel indéfini avec adjectif antéposé : « un/une … » → « de … » -----
	{
		id: 'une-grande-maison',
		sens: 'pluriel',
		constituants: [
			{ depart: 'une', cible: 'de', marque: 'mot' },
			{ depart: 'grande', cible: 'grandes', marque: 'suffixe' },
			{ depart: 'maison', cible: 'maisons', marque: 'suffixe' },
		],
	},
	{
		id: 'un-petit-village',
		sens: 'pluriel',
		constituants: [
			{ depart: 'un', cible: 'de', marque: 'mot' },
			{ depart: 'petit', cible: 'petits', marque: 'suffixe' },
			{ depart: 'village', cible: 'villages', marque: 'suffixe' },
		],
	},
	// ----- Féminin (déterminant + adjectif + nom au féminin) -----
	{
		id: 'un-grand-ami',
		sens: 'feminin',
		constituants: [
			{ depart: 'un', cible: 'une', marque: 'mot' },
			{ depart: 'grand', cible: 'grande', marque: 'suffixe' },
			{ depart: 'ami', cible: 'amie', marque: 'suffixe' },
		],
	},
	{
		id: 'le-petit-voisin',
		sens: 'feminin',
		constituants: [
			{ depart: 'le', cible: 'la', marque: 'mot' },
			{ depart: 'petit', cible: 'petite', marque: 'suffixe' },
			{ depart: 'voisin', cible: 'voisine', marque: 'suffixe' },
		],
	},
	{
		id: 'un-client-poli',
		sens: 'feminin',
		constituants: [
			{ depart: 'un', cible: 'une', marque: 'mot' },
			{ depart: 'client', cible: 'cliente', marque: 'suffixe' },
			{ depart: 'poli', cible: 'polie', marque: 'suffixe' },
		],
	},
];

/* Préfixe commun à deux formes (départ / cible) : la partie INCHANGÉE par l'accord.
   « chat » / « chats » → « chat » ; « grande » / « grandes » → « grande ». Le suffixe
   d'accord SURLIGNÉ d'une forme donnée est ce qui suit ce préfixe commun. */
function prefixeCommun(a: string, b: string): string {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return a.slice(0, i);
}

/* Vue riche d'un constituant À LA FORME affichée `valeur` (départ ou cible) : on
   surligne la marque d'accord. Pour le déterminant (`marque: 'mot'`), le mot
   entier ; pour l'adjectif / le nom (`marque: 'suffixe'`), le suffixe qui suit le
   préfixe commun départ/cible (le radical reste nu). Échappe le HTML (#200). On
   surligne UNIFORMÉMENT sur tous les choix : un suffixe vide (forme de départ
   laissée non accordée) garde un `<span class="term">` vide, donc le surlignage ne
   trahit pas la bonne réponse. */
function vueConstituant(c: Constituant, valeur: string): string {
	if (c.marque === 'mot') {
		return `<span class="term">${escapeHTML(valeur)}</span>`;
	}
	const racine = prefixeCommun(c.depart, c.cible);
	// `valeur` commence toujours par la racine (départ et cible la partagent).
	const suffixe = valeur.slice(racine.length);
	return `${escapeHTML(racine)}<span class="term">${escapeHTML(suffixe)}</span>`;
}

/* Une proposition de QCM : la valeur nue (clé de correction) et sa vue riche. Une
   proposition assemble, pour chaque constituant, soit sa forme cible (constituant
   accordé), soit sa forme de départ (constituant laissé non accordé). */
interface Proposition {
	valeur: string;
	vue: ChoiceView;
}

/* Assemble une proposition : `accordes[i]` indique si le constituant i prend sa
   forme cible. La bonne réponse a tous les constituants accordés ; un distracteur
   en laisse exactement un à sa forme de départ (une seule marque cassée). */
function proposition(g: GroupeNominal, accordes: boolean[]): Proposition {
	const valeurs = g.constituants.map((c, i) => (accordes[i] ? c.cible : c.depart));
	const vues = g.constituants.map((c, i) => vueConstituant(c, valeurs[i]));
	return {
		valeur: valeurs.join(' '),
		vue: { html: vues.join(' '), label: valeurs.join(' ') },
	};
}

/* Phrase source (groupe au singulier / masculin) pour l'énoncé de transformation. */
function source(g: GroupeNominal): string {
	return g.constituants.map((c) => c.depart).join(' ');
}

/* Consigne d'action courte, selon le sens. */
function consigneSens(sens: SensGN): string {
	return sens === 'pluriel' ? 'Mets au pluriel.' : 'Mets au féminin.';
}

/* Explication unique de la CHAÎNE d'accord (le feedback par-distracteur exigerait
   de modifier le runner → hors périmètre). Cite la bonne réponse. L'énumération
   s'adapte à la composition : un groupe à 2 constituants n'a PAS d'adjectif. */
function explicationGN(g: GroupeNominal, reponse: string): string {
	const elements =
		g.constituants.length === 3
			? "le déterminant, l'adjectif et le nom"
			: 'le déterminant et le nom';
	const cadre = g.sens === 'pluriel' ? 'Au pluriel' : 'Au féminin';
	const marque = g.sens === 'pluriel' ? 'du pluriel' : 'du féminin';
	return `${cadre}, TOUT le groupe s'accorde : ${elements} prennent la marque ${marque} → « ${reponse} ».`;
}

/* Indices des constituants VARIABLES (forme de départ ≠ forme cible). Dans cette
   banque, tous les constituants varient ; on le calcule pour rester robuste si une
   forme stockée devenait identique (et garantir « une seule marque cassée »). */
function indicesVariables(g: GroupeNominal): number[] {
	return g.constituants.map((c, i) => (c.depart !== c.cible ? i : -1)).filter((i) => i >= 0);
}

/* Un item « transformation guidée » : groupe source au singulier (ou masculin) →
   trou `@` à compléter au QCM. La bonne réponse est le groupe ENTIÈREMENT accordé ;
   les 2 distracteurs cassent chacun une marque DIFFÉRENTE (variété d'un item à
   l'autre via le tirage des constituants laissés non accordés). */
export function genItem(): Exercise {
	const g = choice(GROUPES_NOMINAUX);
	const n = g.constituants.length;
	const tousAccordes = Array.from({ length: n }, () => true);
	const bonne = proposition(g, tousAccordes);

	// 2 distracteurs : on choisit 2 constituants variables distincts à laisser à
	// leur forme de départ (chaque distracteur ne casse qu'UNE marque).
	const variables = sample(indicesVariables(g), 2);
	// Garde-fou : chaque groupe de la banque a ≥ 2 constituants variables (test
	// structurel). On échoue tôt si ce n'était plus le cas (sinon < 3 choix générés).
	if (variables.length < 2) {
		throw new Error(
			`accord-groupe-nominal : le groupe « ${g.id} » a moins de 2 constituants variables.`,
		);
	}
	const distracteurs = variables.map((idx) => {
		const accordes = Array.from({ length: n }, () => true);
		accordes[idx] = false; // un seul constituant non accordé
		return proposition(g, accordes);
	});

	const propositions = sample([bonne, ...distracteurs], 3);
	return {
		type: 'qcm',
		question: `${source(g)} → @`,
		answer: bonne.valeur,
		choices: propositions.map((p) => p.valeur),
		choicesView: propositions.map((p) => p.vue),
		choicesEmpilees: true,
		explication: explicationGN(g, bonne.valeur),
		// Consigne d'action visible (#265) : l'énoncé « le chat → @ » est muet sur la tâche.
		consigne: consigneSens(g.sens),
		// PAS de TTS : petit/petits sont homophones → l'oral trahirait ou n'aiderait pas.
		parle: '',
	};
}

const MODE_QCM: ModeOption[] = [{ ...MODE_QCM_POINT, label: 'Je choisis le bon groupe' }];

function accordGNType(): ExerciseType {
	return { modes: MODE_QCM, generate: genItem, check: (ex, input) => checkAnswer(ex, input) };
}

export interface AccordGNLessonDef extends LessonInput {
	rubrique: string;
}

/* Leçon unique, rubrique « Les accords » (à côté des autres leçons d'accords). */
/* ---------- Étayage de la notion (#490) ----------
   Chaque distracteur casse EXACTEMENT UNE marque en laissant les autres correctes :
   l'enfant qui répond au premier coup d'œil « ça a l'air accordé » se fait prendre à
   tous les coups. L'étape 3 vise donc précisément ce piège (relire le groupe ENTIER),
   plutôt que de répéter la règle de l'étape 1. */
const ETAYAGE_ACCORD_GN = etayageRedige(
	'Accorder tout le groupe nominal',
	"Dans un groupe nominal, tous les mots s'accordent avec le nom : aucun ne reste en arrière.",
	[
		"Repère le nom : c'est lui qui donne le genre et le nombre.",
		"Accorde le déterminant, puis le nom, puis l'adjectif s'il y en a un.",
		"Relis le groupe en entier : il suffit qu'un seul mot ait oublié sa marque pour que ce soit faux.",
	],
);

export const ACCORD_GN_LESSONS: AccordGNLessonDef[] = [
	{
		id: 'fr-accords-groupe-nominal',
		label: 'Accorder tout le groupe',
		rubrique: 'Les accords',
		exerciseType: accordGNType(),
		etayage: [ETAYAGE_ACCORD_GN],
	},
];
