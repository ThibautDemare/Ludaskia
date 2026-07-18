/* ============================================================
   Vocabulaire CM1 — les homonymes (homographes) (#254).
   ------------------------------------------------------------
   Jumeau de « Sens propre / sens figuré » (sens-figure.ts), mais en banque
   taguée par niveau (`bankByLevel`, comme maths/ordre-grandeur.ts) : chaque mot
   porte `levels: ['cm1']` et le catalogue dérive `LessonDef.levels` de la banque.

   QCM : une courte phrase + « Ici, « X » veut dire : ? ». Le nombre d'options
   = le nombre de SENS RÉELS du mot (2 ou 3). CONTRAINTE DURE : toutes les options
   sont de VRAIS sens du mot — jamais une définition inventée ni un distracteur
   plausible. (Différence assumée avec sens-figure.ts, qui ajoute, lui, un 3e sens
   « distracteur » inventé : ici on ne reproduit PAS ce procédé.)

   PÉRIMÈTRE (#254) : HOMOGRAPHES uniquement (même graphie, plusieurs sens ;
   glace, carte, pièce…). Les homophones à graphie DIFFÉRENTE (ver / verre / vert)
   sont DIFFÉRÉS hors #254 (attendu plutôt CM2 selon les repères 2018) : dans un QCM
   texte-seul, l'orthographe écrite trahirait la réponse, l'exercice serait trivial.
   → candidat pour une future leçon CM2, sur un autre format (audio / dictée).

   TTS : contrairement à homophones.ts (qui NE lit PAS la phrase pour ne pas trahir
   la réponse par l'intonation), la prononciation d'un homographe est IDENTIQUE quel
   que soit le sens — on peut donc laisser lire la phrase. On suit sens-figure.ts :
   pas de `parle` explicite, la lecture dérive de l'énoncé affiché (core/tts-text).

   INVARIANT PROJET : `answer` et `choices` sont CONSTRUITS à la génération et rangés
   dans l'Exercise ; le `check` (=`checkAnswer`) compare au stocké, jamais de recalcul.

   Formulation : les libellés de sens servent de TEXTE des choix (courts, enfantins).
   Quelques libellés du cadrage pédagogique ont été lissés pour de meilleurs boutons
   de QCM, SANS changer le périmètre ni inventer de sens (parenthèses/slashs retirés,
   désambiguïsation) : « mine (extraction) » → « lieu où l'on creuse », « avoir bonne/
   mauvaise mine » → « air du visage », « note écrite (petit message) » → « petit
   message écrit », « métier (justice) » → « métier de la justice », « informatique »
   → « souris d'ordinateur », « arbre »/« papier » → « feuille d'arbre »/« feuille de
   papier », « pile/accumulateur » → « pile électrique », « délit » → « vol d'un objet ».
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { bankByLevel, pickFromBank } from '../../core/level-combinators';
import { choice, sample } from '../../core/utils';
import { MODE_QCM_CHECK } from '../_shared';
import type { LessonInput } from '../_shared';

const NIVEAUX: SchoolLevel[] = ['cm1'];

/* Un sens réel d'un homographe : son `libelle` (texte du choix / réponse) et deux
   `phrases` où le mot est employé DANS ce sens. */
export interface SensHomographe {
	libelle: string;
	phrases: string[];
}

/* Un mot homographe et ses 2 ou 3 sens réels. `levels` tague l'item pour la banque. */
export interface MotHomographe {
	mot: string;
	sens: SensHomographe[];
	levels: SchoolLevel[];
}

/* Données validées par le pédagogue (#254) : 15 homographes, 2 phrases par sens.
   Exporté pour les tests (banque + vérification des sens réels / du nombre d'options). */
export const MOTS_HOMOGRAPHES: MotHomographe[] = [
	{
		mot: 'glace',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'crème glacée',
				phrases: ['Il mange une glace à la vanille.', 'En été, on adore les glaces au chocolat.'],
			},
			{
				libelle: 'miroir',
				phrases: [
					'Elle se regarde dans la glace avant de sortir.',
					'Papa se rase devant la glace tous les matins.',
				],
			},
			{
				libelle: 'eau gelée',
				phrases: [
					'Le lac est recouvert de glace en hiver.',
					'Attention, le trottoir est couvert de glace, ça glisse.',
				],
			},
		],
	},
	{
		mot: 'carte',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'carte de géographie',
				phrases: [
					'Le marin regarde la carte pour retrouver sa route.',
					'Sur la carte, je cherche le nom de mon pays.',
				],
			},
			{
				libelle: 'carte à jouer',
				phrases: [
					'Il distribue les cartes pour la partie.',
					'Elle gagne la partie avec sa dernière carte.',
				],
			},
			{
				libelle: "carte que l'on envoie",
				phrases: [
					'Elle poste une carte de vœux pour Noël.',
					"Il offre une carte d'anniversaire à sa copine.",
				],
			},
		],
	},
	{
		mot: 'pièce',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'pièce de monnaie',
				phrases: ["Il trouve une pièce d'un euro par terre.", 'Le distributeur rend deux pièces.'],
			},
			{
				libelle: 'pièce de la maison',
				phrases: [
					'Le salon est la pièce où toute la famille se retrouve le soir.',
					'Chaque enfant a sa propre pièce pour dormir.',
				],
			},
			{
				libelle: 'pièce de théâtre',
				phrases: [
					'Les comédiens jouent une pièce devant tout le public.',
					'Les acteurs répètent leur pièce.',
				],
			},
		],
	},
	{
		mot: 'mine',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'mine de crayon',
				phrases: [
					"La mine s'est cassée, je ne peux plus écrire.",
					'Cette mine est bien trop épaisse.',
				],
			},
			{
				libelle: "lieu où l'on creuse",
				phrases: [
					'Les mineurs travaillent au fond de la mine.',
					'On extrait du charbon dans cette mine.',
				],
			},
			{
				libelle: 'air du visage',
				phrases: ["Tu as bonne mine aujourd'hui !", "Il a mauvaise mine depuis qu'il est malade."],
			},
		],
	},
	{
		mot: 'note',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'note de musique',
				phrases: [
					'Le pianiste joue une fausse note.',
					'Elle apprend à lire les notes sur la portée.',
				],
			},
			{
				libelle: 'note scolaire',
				phrases: [
					'Léa a eu une bonne note à son contrôle.',
					'Le maître corrige les notes du devoir.',
				],
			},
			{
				libelle: 'petit message écrit',
				phrases: [
					'Maman a laissé une note sur le frigo.',
					'Il griffonne une note pour ne pas oublier.',
				],
			},
		],
	},
	{
		mot: 'avocat',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'fruit',
				phrases: ['Léa coupe un avocat pour la salade.', "L'avocat est mûr et bien vert."],
			},
			{
				libelle: 'métier de la justice',
				phrases: ["L'avocat plaide devant le juge.", 'Mon oncle est avocat au tribunal.'],
			},
		],
	},
	{
		mot: 'addition',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'opération mathématique',
				phrases: [
					'Léa apprend à faire une addition en classe.',
					"Il pose l'addition dans son cahier.",
				],
			},
			{
				libelle: 'note à payer au restaurant',
				phrases: ["Papa demande l'addition au serveur.", "La famille partage l'addition du repas."],
			},
		],
	},
	{
		mot: 'souris',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'animal',
				phrases: ['La souris grignote un morceau de fromage.', 'Le chat guette la souris.'],
			},
			{
				libelle: "souris d'ordinateur",
				phrases: [
					"Il déplace la souris pour cliquer sur l'écran.",
					'La souris ne fonctionne plus, il faut la changer.',
				],
			},
		],
	},
	{
		mot: 'feuille',
		levels: NIVEAUX,
		sens: [
			{
				libelle: "feuille d'arbre",
				phrases: [
					'Le vent fait tomber les feuilles du vieux chêne du jardin.',
					'En automne, les feuilles deviennent rousses.',
				],
			},
			{
				libelle: 'feuille de papier',
				phrases: [
					'Il écrit son nom sur une feuille blanche.',
					'Prends une feuille pour le contrôle.',
				],
			},
		],
	},
	{
		mot: 'bureau',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'meuble',
				phrases: ['Il range ses stylos sur son bureau.', 'La lampe est posée sur le bureau.'],
			},
			{
				libelle: 'lieu de travail',
				phrases: [
					'Mon père part travailler à son bureau.',
					'Elle a une réunion à son bureau ce matin.',
				],
			},
		],
	},
	{
		mot: 'argent',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'métal précieux',
				phrases: ['Le bracelet est fait en argent.', "La médaille d'argent brille au soleil."],
			},
			{
				libelle: 'monnaie',
				phrases: ['Elle économise son argent de poche.', "Il n'a plus assez d'argent pour le jeu."],
			},
		],
	},
	{
		mot: 'batterie',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'instrument de musique',
				phrases: [
					'Mon frère joue de la batterie dans un groupe.',
					"Il s'entraîne à la batterie tous les mercredis.",
				],
			},
			{
				libelle: 'pile électrique',
				phrases: [
					'La batterie du téléphone est déchargée.',
					'Il faut recharger la batterie de la tablette.',
				],
			},
		],
	},
	{
		mot: 'règle',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'instrument de mesure',
				phrases: [
					'Trace un trait avec ta règle.',
					'Il vérifie la longueur de la feuille avec sa règle.',
				],
			},
			{
				libelle: 'consigne à respecter',
				phrases: [
					'Chacun doit suivre la règle du jeu.',
					'La maîtresse rappelle une règle de classe.',
				],
			},
		],
	},
	{
		mot: 'vol',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'vol dans les airs',
				phrases: ['Il observe le vol des oiseaux.', "Le vol de l'avion dure deux heures."],
			},
			{
				libelle: "vol d'un objet",
				phrases: [
					'La police enquête sur un vol de bijoux.',
					"Il a été victime d'un vol dans le bus.",
				],
			},
		],
	},
	{
		mot: 'cours',
		levels: NIVEAUX,
		sens: [
			{
				libelle: 'leçon',
				phrases: [
					'Léa suit un cours de calcul mental.',
					'Le cours de français commence à 9 heures.',
				],
			},
			{
				libelle: "cours d'eau",
				phrases: ['Le cours de la rivière est rapide.', 'La barque descend le cours du fleuve.'],
			},
		],
	},
];

/* Banque taguée par niveau (#225). Exportée pour les tests. */
export const BANQUE_HOMONYMES = bankByLevel(MOTS_HOMOGRAPHES);

/* ---------- Fabrique d'ExerciseType ---------- */

const MODES: ModeOption[] = [{ ...MODE_QCM_CHECK, label: 'Je choisis le bon sens' }];

/* Construit l'Exercise QCM pour un mot, un sens employé et l'une de ses phrases.
   `answer` = le libellé du sens employé ; `choices` = TOUS les sens réels du mot
   (2 ou 3), mélangés — jamais de sens inventé. Réponse STOCKÉE (le check compare
   au stocké). `phrase` doit appartenir à `sens.phrases`. Exporté pour les tests. */
export function exerciceHomonyme(
	mot: MotHomographe,
	sens: SensHomographe,
	phrase: string,
): Exercise {
	return {
		type: 'qcm',
		question: `${phrase} Ici, « ${mot.mot} » veut dire : @`,
		answer: sens.libelle,
		choices: sample(
			mot.sens.map((s) => s.libelle),
			mot.sens.length,
		),
		explication: `« ${mot.mot} » est un mot à plusieurs sens. Ici, il a le sens « ${sens.libelle} ».`,
		// Consigne d'action visible (#265) : « Quel est le sens… » évite l'écho avec
		// l'énoncé « … veut dire : @ ».
		consigne: 'Quel est le sens du mot dans cette phrase ?',
	};
}

function homonymieType(): ExerciseType {
	return {
		levels: BANQUE_HOMONYMES.levels,
		modes: MODES,
		generate(opts?: GenerateOpts): Exercise {
			const mot = pickFromBank(BANQUE_HOMONYMES, opts?.level);
			const sens = choice(mot.sens);
			const phrase = choice(sens.phrases);
			return exerciceHomonyme(mot, sens, phrase);
		},
		check: checkAnswer,
	};
}

export const HOMONYMIE_LESSONS: LessonInput[] = [
	{
		id: 'fr-vocab-homonymes-cm1',
		label: 'Les homonymes',
		exerciseType: homonymieType(),
	},
];
