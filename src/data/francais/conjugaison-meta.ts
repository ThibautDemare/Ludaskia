/* ============================================================
   Conjugaison CE2/CM1 — trois QCM « méta » (#239 ; re-tag CE2 + « plus dur » sur groupe).
   ------------------------------------------------------------
   Trois leçons de RECONNAISSANCE (QCM mono-mode) qui prennent du recul sur
   le paradigme déjà travaillé verbe par verbe (CONJ_LESSONS) :
   - M1 « Temps simple ou composé ? » : à partir de l'INDICE OBSERVABLE (y a-t-il un
     auxiliaire « avoir »/« être » devant le verbe), sans nommer le temps abstrait ;
   - M2 « 1er, 2e ou 3e groupe ? » : à partir d'un INFINITIF (auxiliaires exclus :
     hors groupes) ; `aller` est gardé comme piège ENSEIGNÉ (en -er mais 3e groupe),
     avec une explication dédiée ;
   - M3 « Quel est l'infinitif ? » : à partir d'une forme conjuguée, retrouver
     l'infinitif parmi de VRAIS infinitifs du corpus (jamais une forme inventée).

   Les banques sont DÉRIVÉES du corpus VERBS (12 verbes × 4 temps × 6 personnes) :
   on n'écrit aucune forme en dur ici. Distracteurs = vraies étiquettes / vraies
   formes (invariant du moteur : jamais une faute affichée).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, rnd, sample } from '../../core/utils';
import { etayageRedige, MODE_QCM_CHECK } from '../_shared';
import type { LessonInput } from '../_shared';
import {
	VERBS,
	TENSES,
	VERB_GROUPE,
	displayPronoun,
	type VerbDef,
	type Tense,
} from './conjugaison';

/* Verbes du corpus méta : TOUT VERBS (#239 — tout le corpus de conjugaison est ouvert
   en CE2 + CM1, naître inclus). Le QCM groupe (M2) écarte ensuite les auxiliaires (hors
   groupes). */
const VERBS_META: VerbDef[] = VERBS;

/* Tous les QCM méta sont mono-mode reconnaissance (pas de saisie : on choisit une
   étiquette / une forme, pas de production). */
const MODE_QCM: ModeOption[] = [MODE_QCM_CHECK];

/* ------------------------------------------------------------
   M1 — « Temps simple ou composé ? »
   ------------------------------------------------------------
   Un temps COMPOSÉ se forme avec un AUXILIAIRE (avoir/être) DEVANT le verbe ; la forme
   stockée du passé composé contient une espace (« a mangé »). Un temps SIMPLE est
   le verbe TOUT SEUL (présent / futur / imparfait). On s'appuie sur l'AUXILIAIRE comme INDICE
   OBSERVABLE (et non le nombre de mots), pas sur l'étiquette abstraite « simple/composé ». */
const M1_COMPOSE = '« avoir » ou « être » + le verbe (temps composé)';
const M1_SIMPLE = 'le verbe tout seul (temps simple)';

/* Le seul temps COMPOSÉ du corpus est le passé composé (auxiliaire + participe ;
   sa forme stockée comporte d'ailleurs une espace, « a mangé »). On le reconnaît
   directement par le nom du temps. Si un autre temps composé entrait dans le corpus
   (plus-que-parfait au CM2…), il faudrait l'ajouter ici. */
function estCompose(tense: Tense): boolean {
	return tense === 'passe_compose';
}

export function simpleComposeType(): ExerciseType {
	return {
		modes: MODE_QCM,
		consigne: 'Ce verbe est-il tout seul, ou avec « avoir » ou « être » devant ?',
		generate(): Exercise {
			const verb = choice(VERBS_META);
			const tense = choice(TENSES);
			const p = rnd(0, 5);
			const form = verb.forms[tense][p];
			const pron = displayPronoun(p, form);
			const compose = estCompose(tense);
			const answer = compose ? M1_COMPOSE : M1_SIMPLE;
			// Pour un temps composé, le 1er mot de la forme stockée est l'auxiliaire
			// (« a mangé » → « a », « est parti » → « est ») : on le nomme dans le retour.
			const aux = form.split(' ')[0];
			const auxInf = ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'].includes(aux)
				? 'être'
				: 'avoir';
			return {
				type: 'qcm',
				question: `${pron}${form}`,
				answer,
				// Ordre des deux options fixé (palette stable, comme la ponctuation #204) :
				// composé d'abord, simple ensuite — lisibilité avant l'aléa.
				choices: [M1_COMPOSE, M1_SIMPLE],
				choicesEmpilees: true, // deux libellés longs → empilés (pleine largeur, #205)
				explication: compose
					? `« ${pron}${form} » : devant le verbe, il y a « ${aux} » — c'est le verbe « ${auxInf} », qu'on appelle l'auxiliaire. Avec un auxiliaire devant, c'est un temps composé.`
					: `« ${pron}${form} » : le verbe est tout seul, sans « avoir » ni « être » devant. C'est un temps simple.`,
				parle: `Le verbe « ${pron}${form} » est-il tout seul, ou avec « avoir » ou « être » devant ?`,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* ------------------------------------------------------------
   M2 — « 1er, 2e ou 3e groupe ? »
   ------------------------------------------------------------
   On montre un INFINITIF, on demande son groupe. Les AUXILIAIRES (être, avoir)
   sont EXCLUS : ils ne relèvent pas d'un groupe. `aller` est gardé comme piège
   ENSEIGNÉ (en -er mais 3e groupe), avec une explication dédiée. */
const GROUPES = ['1er groupe', '2e groupe', '3e groupe'] as const;
type Groupe = (typeof GROUPES)[number];

/* Verbes proposables au QCM groupe : noyau CM1 SANS les auxiliaires (hors groupes). */
const VERBS_GROUPE: VerbDef[] = VERBS_META.filter((v) => v.id !== 'etre' && v.id !== 'avoir');

/* Explication par verbe : règle générale, sauf `aller` (piège enseigné). */
function explicationGroupe(verb: VerbDef, groupe: Groupe): string {
	if (verb.id === 'aller') {
		return `« aller » se termine par -er mais c'est un verbe du 3e groupe (un verbe irrégulier) : attention au piège !`;
	}
	if (groupe === '1er groupe') {
		return `« ${verb.infinitif} » se termine par -er : c'est un verbe du 1er groupe.`;
	}
	if (groupe === '2e groupe') {
		return `« ${verb.infinitif} » se termine par -ir (comme « nous finissons ») : c'est un verbe du 2e groupe.`;
	}
	return `« ${verb.infinitif} » est un verbe du 3e groupe (les verbes irréguliers).`;
}

export function groupeType(): ExerciseType {
	return {
		modes: MODE_QCM,
		consigne: 'À quel groupe appartient ce verbe ?',
		generate(): Exercise {
			const verb = choice(VERBS_GROUPE);
			const groupe = VERB_GROUPE[verb.id] as Groupe;
			return {
				type: 'qcm',
				question: `« ${verb.infinitif} » : @`,
				answer: groupe,
				// Les 3 groupes, mélangés (3 vraies étiquettes : la bonne + 2 distracteurs).
				choices: sample([...GROUPES], 3),
				explication: explicationGroupe(verb, groupe),
				parle: `À quel groupe appartient le verbe « ${verb.infinitif} » : premier, deuxième ou troisième groupe ?`,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* ------------------------------------------------------------
   M3 — « Quel est l'infinitif ? »
   ------------------------------------------------------------
   On montre une forme conjuguée (pronom + forme), on demande l'infinitif. Les
   distracteurs sont de VRAIS infinitifs d'AUTRES verbes du corpus (jamais inventés).
   On évite les formes ambiguës (« a » seul, etc.) en gardant le pronom affiché. */
const QCM_INFINITIF_CHOICES = 4;

/* Tous les infinitifs du corpus méta (vivier de distracteurs). */
const INFINITIFS_META: string[] = VERBS_META.map((v) => v.infinitif);

export function infinitifType(): ExerciseType {
	return {
		modes: MODE_QCM,
		consigne: 'Retrouve la forme infinitive de ce verbe.',
		generate(): Exercise {
			const verb = choice(VERBS_META);
			const tense = choice(TENSES);
			const p = rnd(0, 5);
			const form = verb.forms[tense][p];
			const pron = displayPronoun(p, form);
			// Distracteurs : 3 autres infinitifs du corpus (vrais), jamais celui du verbe.
			const distractors = sample(
				INFINITIFS_META.filter((inf) => inf !== verb.infinitif),
				QCM_INFINITIF_CHOICES - 1,
			);
			return {
				type: 'qcm',
				question: `« ${pron}${form} » : @`,
				answer: verb.infinitif,
				choices: sample([verb.infinitif, ...distractors], QCM_INFINITIF_CHOICES),
				explication: `« ${pron}${form} » vient du verbe « ${verb.infinitif} ».`,
				parle: `Quel est l'infinitif du verbe « ${pron}${form} » ?`,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* ------------------------------------------------------------
   Descripteurs de leçons (branchés au catalogue par catalog.ts).
   ------------------------------------------------------------ */
/* ---------- Étayage de la notion (#490) ----------
   Trois panneaux qui donnent la MANIPULATION du manuel, et écartent au passage la
   fausse règle qui traîne sur chaque notion (avis `pedagogue-primaire`) :
   - le groupe ne se lit PAS sur la terminaison de l'infinitif (« venir » est en -ir et
     du 3e groupe) : le test est « nous » au présent, et l'entendre en -issons ;
   - l'infinitif se retrouve par « il faut + verbe », qui s'appuie sur l'oreille plutôt
     que sur une morphologie que l'enfant n'a pas ;
   - un temps composé, ce n'est pas « avoir/être devant » (« il est content » n'a rien
     d'un temps composé) mais avoir/être suivi d'un PARTICIPE PASSÉ.

   ⚠ Les exemples cités sont pris HORS CORPUS (chanter, rougir, dormir). Le corpus des
   trois QCM est fixe et énumérable — 13 verbes —, et le groupe ou l'infinitif d'un
   verbe n'est pas retiré à chaque tirage : nommer ici le groupe d'un verbe du corpus
   donnerait la réponse à TOUS ses tirages futurs, pas seulement à la question du jour.
   Même raison pour laquelle le piège enseigné du verbe en -er qui n'est pas du 1er
   groupe est signalé sans être nommé : c'est un item de la banque. */
const ETAYAGE_SIMPLE_COMPOSE = etayageRedige(
	'Temps simple ou temps composé ?',
	"Un temps composé s'écrit en deux morceaux : « avoir » ou « être », puis le participe passé du verbe.",
	[
		'Regarde si le verbe est tout seul : alors le temps est simple.',
		"Regarde s'il y a « avoir » ou « être » juste devant, suivi du participe passé (chanté, rougi, dormi).",
		"Attention : « avoir » ou « être » suivi d'un mot qui n'est pas un participe passé, ce n'est pas un temps composé.",
	],
);

const ETAYAGE_GROUPE = etayageRedige(
	'1er, 2e ou 3e groupe ?',
	"Le groupe ne se devine pas sur la fin de l'infinitif : il se trouve en conjuguant.",
	[
		'Conjugue le verbe avec « nous » au présent : si tu entends -issons (nous rougissons), il est du 2e groupe.',
		'Sinon, un infinitif en -er (chanter) est du 1er groupe.',
		'Sinon, choisis le 3e groupe. Attention : quelques verbes en -er ne suivent pas cette règle, apprends-les à part.',
	],
);

const ETAYAGE_INFINITIF = etayageRedige(
	"Comment retrouver l'infinitif ?",
	"L'infinitif, c'est le nom du verbe : sa forme dans le dictionnaire, avant d'être conjugué.",
	[
		"Redis la phrase avec « il faut » : le mot qui suit est l'infinitif (il chantait : il faut chanter).",
		"Vérifie qu'il ne porte aucune marque de personne ni de temps.",
		'Si tu ne reconnais pas le verbe, essaie chaque réponse avec « il faut » : une seule sonne juste.',
	],
);

export const CONJ_META_LESSONS: LessonInput[] = [
	{
		id: 'fr-conj-simple-compose',
		label: 'Temps simple ou composé ?',
		exerciseType: simpleComposeType(),
		etayage: [ETAYAGE_SIMPLE_COMPOSE],
	},
	{
		id: 'fr-conj-groupe',
		label: '1er, 2e ou 3e groupe ?',
		exerciseType: groupeType(),
		etayage: [ETAYAGE_GROUPE],
	},
	{
		id: 'fr-conj-infinitif',
		label: "Quel est l'infinitif ?",
		exerciseType: infinitifType(),
		etayage: [ETAYAGE_INFINITIF],
	},
];
