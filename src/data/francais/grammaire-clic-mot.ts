/* ============================================================
   Grammaire — « Clique sur le mot » (#259, #437) : ENTRÉE de la famille.
   ------------------------------------------------------------
   Brique d'interaction « clique sur le mot » : l'enfant lit une phrase rendue MOT
   PAR MOT et sélectionne le(s) mot(s) répondant à la consigne. Le runner d'écran
   (ui/lecon-clic-mot.ts) est AGNOSTIQUE de la notation grammaticale ciblée : il
   consomme `consigne`, `explication`, `cibleIndices` (et le libellé `cibleLabel`)
   et corrige par ÉGALITÉ D'ENSEMBLES exacte (cibles multi-mots, y compris NON
   adjacentes).

   Ce module reste le POINT D'ENTRÉE unique de la famille (le catalogue, l'UI et les
   tests importent d'ici) ; depuis #530 il ne porte plus que les étayages, les entrées
   de catalogue, et le ré-export de l'API publique des quatre modules qui font le
   travail :
   - `grammaire-clic-mot-moteur.ts` — modèle de données, tokenisation, garde-fous
     génériques, fabrique d'`ExerciseType`, et le VOCABULAIRE grammatical partagé
     entre classes (`DET_SETS`, `PRON_SUJET`…) ;
   - `grammaire-clic-mot-verbe.ts` — « Clique sur le verbe », la seule leçon dont la
     banque CM1 contient celle du CE2 ;
   - `grammaire-clic-mot-cm1.ts` — les cinq natures du CM1 (#437) ;
   - `grammaire-clic-mot-ce2.ts` — les quatre natures du CE2 (#436).

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
     documentés au fil des banques, dans le module de leur classe.
   ============================================================ */
import type { SchoolLevel } from '../../core/catalog';
import { etayageRedige, type LessonInput } from '../_shared';
import { clicMotType } from './grammaire-clic-mot-moteur';
import { clicVerbeType } from './grammaire-clic-mot-verbe';
import {
	CONSIGNE_CONJ,
	CIBLE_CONJ,
	CONSIGNE_DET,
	CONSIGNE_PRON,
	CONSIGNE_NOYAU,
	CIBLE_NOYAU,
	CONSIGNE_SUJET,
	CIBLE_SUJET,
	PHRASES_CONJ,
	PHRASES_DET,
	PHRASES_PRON,
	PHRASES_NOYAU,
	PHRASES_SUJET,
} from './grammaire-clic-mot-cm1';
import {
	CONSIGNE_NOM_CE2,
	CIBLE_NOM_CE2,
	CONSIGNE_DET_CE2,
	CIBLE_DET_CE2,
	CONSIGNE_ADJ_CE2,
	CIBLE_ADJ_CE2,
	CONSIGNE_PRON_CE2,
	CIBLE_PRON_CE2,
	PHRASES_NOM_CE2,
	PHRASES_DET_CE2,
	PHRASES_ADJ_CE2,
	PHRASES_PRON_CE2,
} from './grammaire-clic-mot-ce2';

/* API PUBLIQUE de la famille, ré-exportée depuis ce module (#530) : le découpage est
   INTERNE, donc l'UI (`ui/lecon-clic-mot.ts`, `ui/clic-mot-interaction.ts`,
   `ui/revision.ts`), le catalogue et les tests continuent d'importer d'ici — un
   changement de découpage ne doit pas se propager en cascade de chemins d'import.
   Les constructeurs de phrase (`phrase`, `phraseMots`, `det`, `pron`, `nomsCE2`,
   `detsCE2`, `adjCE2`, `pronSujetCE2`) sont exposés parce que leurs chemins `throw`
   sont testés directement : un garde-fou de construction qu'aucun test n'exécute ne
   protège rien. */
export {
	cibleContigue,
	clicMotType,
	enumererFr,
	estPonctuation,
	joindrePhrase,
	libelleCible,
	phrase,
	phraseMots,
	type PhraseClicMot,
	type RolePron,
	type SousCatDet,
	type VarianteClicMot,
} from './grammaire-clic-mot-moteur';
export { PHRASES_CE2, PHRASES_CM1, clicVerbeType } from './grammaire-clic-mot-verbe';
export {
	det,
	pron,
	PHRASES_CONJ,
	PHRASES_DET,
	PHRASES_PRON,
	PHRASES_NOYAU,
	PHRASES_SUJET,
} from './grammaire-clic-mot-cm1';
export {
	adjCE2,
	detsCE2,
	nomsCE2,
	pronSujetCE2,
	PHRASES_NOM_CE2,
	PHRASES_DET_CE2,
	PHRASES_ADJ_CE2,
	PHRASES_PRON_CE2,
} from './grammaire-clic-mot-ce2';

/* ============================================================
   Étayage de la notion (#490) — les sept natures.
   ------------------------------------------------------------
   Ces leçons demandent de RECONNAÎTRE une classe de mots : rien à dérouler, donc du
   texte rédigé (`etayageRedige`). Chaque panneau donne la MANIPULATION qui identifie
   la classe (changer le moment pour le verbe, supprimer l'adjectif, poser « qui
   est-ce qui » pour le sujet), jamais un mot de la banque : les phrases sont écrites
   une à une et un exemple emprunté ici servirait de réponse à un tirage futur.

   Les quatre leçons servies aux DEUX niveaux portent DEUX entrées, parce que la
   TÂCHE change avec la classe et pas seulement sa difficulté : au CE2 on clique sur
   TOUS les noms / TOUS les déterminants d'une phrase, au CM1 sur le seul nom noyau
   ou sur la sous-catégorie demandée ; le verbe gagne au CM1 le passé composé (cible
   en deux mots) et le pronom, la distinction sujet / complément. Un panneau CE2
   servi à un CM1 décrirait donc un autre exercice.

   Classes FERMÉES énoncées en toutes lettres (les sept conjonctions de coordination,
   les neuf pronoms personnels sujets) : c'est la notion elle-même, celle que l'école
   fait apprendre par cœur, pas un item de la banque. Les taire rendrait le panneau
   creux.

   Deux formulations sont CONTRAINTES et ne se retouchent pas isolément :
   - la définition du nom reprend mot pour mot celle de `ROLE_CLASSE` (classes-mots.ts),
     déjà alignée sur cette leçon par #436 — « une idée » comprise, sans quoi les noms
     abstraits de la banque passeraient pour des contre-exemples ;
   - la définition du verbe reprend celle des `explication` de `phrase()` ci-dessus.
   Un enfant qui croise deux leçons ne doit pas y lire deux définitions différentes.

   Le « toujours » des deux leçons CE2 à cible plurielle (tous les noms, tous les
   déterminants) n'est pas une facilité de rédaction : les deux banques l'imposent à la
   CONSTRUCTION (`nomsCE2` lève en dessous de deux noms, la fabrique des déterminants en
   dessous de deux déterminants). Si ces garde-fous tombaient, ces deux étapes
   deviendraient fausses.

   Les tests proposés valent pour TOUTE la banque de leur leçon, ce qui a écarté deux
   grands classiques : le changement de temps (« hier… demain… ») ne marche pas sur les
   impératifs, nombreux au CE2, d'où l'encadrement par « ne… pas » ; et la suppression
   de l'adjectif casse la phrase quand il est attribut (« le ciel est bleu »), d'où un
   repère de POSITION à la place.
   ============================================================ */
const ETAYAGE_VERBE_CE2 = etayageRedige(
	'Comment reconnaître le verbe ?',
	"Le verbe, c'est le mot qui dit l'action ou l'état : ce qu'on fait, ou ce qui se passe.",
	[
		'Lis toute la phrase et demande-toi ce qui se passe.',
		"Encadre le mot que tu soupçonnes par « ne… pas » : ça ne marche qu'avec le verbe.",
		'Cherche partout : le verbe peut être au début, au milieu ou à la fin de la phrase.',
	],
	'ce2',
);

const ETAYAGE_VERBE_CM1 = etayageRedige(
	'Comment reconnaître le verbe ?',
	"Le verbe, c'est le mot qui dit l'action ou l'état : ce qu'on fait, ou ce qui se passe.",
	[
		"Encadre le mot que tu soupçonnes par « ne… pas » : ça ne marche qu'avec le verbe.",
		'Au passé composé, le verbe est en deux mots : le petit mot placé devant en fait partie.',
		'Cherche partout : le verbe peut être au début, au milieu ou à la fin de la phrase.',
	],
	'cm1',
);

const ETAYAGE_DET_CE2 = etayageRedige(
	'Comment reconnaître un déterminant ?',
	"Le déterminant est le petit mot placé devant le nom : il l'accompagne partout.",
	[
		'Repère les petits mots comme le, la, les, un, une, des, mon, ta, ce.',
		"Vérifie que chacun annonce un nom, même si un mot s'est glissé entre les deux.",
		"N'en oublie aucun : la phrase en contient toujours plusieurs.",
	],
	'ce2',
);

const ETAYAGE_DET_CM1 = etayageRedige(
	'Article, possessif ou démonstratif ?',
	"Tous les déterminants accompagnent un nom ; ce qui les sépare, c'est ce qu'ils ajoutent.",
	[
		"L'article accompagne le nom sans rien dire de plus.",
		"Le déterminant possessif dit à qui c'est.",
		'Le déterminant démonstratif sert à montrer de quel nom on parle.',
	],
	'cm1',
);

const ETAYAGE_ADJ = etayageRedige(
	'Comment reconnaître un adjectif ?',
	"L'adjectif dit comment est le nom : il le décrit.",
	[
		'Trouve le nom de la phrase.',
		'Demande-toi quel mot dit comment il est.',
		'Il peut être collé au nom, ou séparé de lui juste après le verbe être.',
	],
);

const ETAYAGE_CONJ = etayageRedige(
	'Comment reconnaître une conjonction de coordination ?',
	'Une conjonction de coordination relie deux mots, deux groupes ou deux phrases.',
	[
		"Cherche l'endroit où la phrase se coupe en deux morceaux.",
		'Le petit mot qui fait la jonction est la conjonction.',
		'Elles ne sont que sept : mais, ou, et, donc, or, ni, car.',
	],
);

const ETAYAGE_PRON_CE2 = etayageRedige(
	'Comment reconnaître le pronom sujet ?',
	"Le pronom personnel sujet remplace le nom de celui qui fait l'action.",
	[
		'Trouve le verbe conjugué.',
		"Demande-toi qui fait l'action.",
		'Les pronoms sujets sont : je, tu, il, elle, on, nous, vous, ils, elles.',
	],
	'ce2',
);

const ETAYAGE_PRON_CM1 = etayageRedige(
	'Pronom sujet ou pronom complément ?',
	"Le pronom sujet fait l'action ; le pronom complément la reçoit.",
	[
		'Trouve le verbe conjugué.',
		"Demande-toi qui fait l'action : ce pronom-là est le sujet.",
		'Demande-toi ensuite à qui elle est faite : ce pronom-là est le complément.',
	],
	'cm1',
);

const ETAYAGE_NOM_CE2 = etayageRedige(
	'Comment reconnaître un nom ?',
	'Le nom désigne une personne, un animal, une chose ou une idée.',
	[
		'Cherche les petits mots comme le, la, les, un, une, mon, ce — ou un prénom, qui est un nom tout seul.',
		'Le nom vient juste après, parfois derrière un ou deux mots qui le décrivent.',
		"N'en oublie aucun : la phrase en contient toujours plusieurs.",
	],
	'ce2',
);

const ETAYAGE_NOYAU_CM1 = etayageRedige(
	'Comment trouver le nom noyau ?',
	"Le nom noyau est le nom principal du groupe : c'est de lui qu'on parle.",
	[
		'Repère le groupe de mots qui commence par un déterminant.',
		'Enlève les mots qui décrivent : il reste le nom noyau.',
		'Vérifie : sans lui, le groupe ne veut plus rien dire.',
	],
	'cm1',
);

const ETAYAGE_SUJET = etayageRedige(
	'Comment trouver le sujet ?',
	"Le sujet, c'est qui fait l'action du verbe.",
	[
		'Trouve le verbe conjugué.',
		'Pose la question « qui est-ce qui » juste devant lui.',
		'Clique sur le nom principal de la réponse ; si le sujet en compte deux, clique sur les deux.',
	],
);

/** Entrée de leçon « clique sur le mot » : une leçon servie à deux niveaux peut se NOMMER
    différemment selon la classe (#436, cf. `LessonDef.labelNiveau`). Le catalogue reporte
    `labelNiveau` tel quel ; les autres familles de leçons n'ont rien à déclarer. */
export interface ClicMotLessonInput extends LessonInput {
	labelNiveau?: Partial<Record<SchoolLevel, string>>;
}

export const CLIC_MOT_LESSONS: ClicMotLessonInput[] = [
	{
		id: 'fr-gram-clic-verbe',
		label: 'Clique sur le verbe',
		exerciseType: clicVerbeType(),
		etayage: [ETAYAGE_VERBE_CE2, ETAYAGE_VERBE_CM1],
	},
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
		etayage: [ETAYAGE_DET_CE2, ETAYAGE_DET_CM1],
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
		etayage: [ETAYAGE_ADJ],
	},
	{
		id: 'fr-gram-clic-conj',
		label: 'Clique sur la conjonction',
		exerciseType: clicMotType({
			banque: PHRASES_CONJ,
			consigne: CONSIGNE_CONJ,
			cibleLabel: CIBLE_CONJ,
		}),
		etayage: [ETAYAGE_CONJ],
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
		etayage: [ETAYAGE_PRON_CE2, ETAYAGE_PRON_CM1],
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
		etayage: [ETAYAGE_NOM_CE2, ETAYAGE_NOYAU_CM1],
	},
	{
		id: 'fr-gram-clic-sujet',
		label: 'Clique sur le sujet',
		exerciseType: clicMotType({
			banque: PHRASES_SUJET,
			consigne: CONSIGNE_SUJET,
			cibleLabel: CIBLE_SUJET,
		}),
		etayage: [ETAYAGE_SUJET],
	},
];
