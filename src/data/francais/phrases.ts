/* ============================================================
   Grammaire — les phrases : ponctuation finale & types (#204).
   ------------------------------------------------------------
   Deux leçons QCM, dans cet ordre (rubrique « Les phrases ») :
   1. F1 « Quel point à la fin ? » — choisir « . », « ? » ou « ! ».
      Variante de PRÉSENTATION 'ponctuation' (cf. ui/lecon-qcm.ts) :
      boutons-symboles (glyphe + mot), trou final en cadre pointillé,
      réinjection du signe après la réponse. Le bouton « Écouter » lit la
      phrase SANS la ponctuation finale (le « @ » est retiré par texteParle,
      #42) — la lire avec la bonne intonation donnerait la réponse.
   2. F2 « Quel type de phrase ? » — identifier le type (3 types officiels :
      déclaratif / interrogatif / impératif ; l'exclamative est une FORME,
      pas un type, traitée via « ! » dans F1, jamais proposée ici).

   Banques relues par l'agent pédagogue (programme CE2) :
   - F1 : chaque phrase porte un MARQUEUR EXPLICITE (mot interrogatif/inversion
     pour « ? », « Quel(le)… »/« Comme… »/interjection pour « ! », rien pour le
     point neutre). Règle d'or : si un adulte hésite, l'item est exclu.
   - F2 : mélange VOLONTAIRE point ≠ type (impératifs au point, déclaratifs au
     « ! ») pour forcer l'enfant à raisonner sur le SENS, pas sur le symbole.
   - Explications : citent toujours le marqueur de sens, jamais l'intonation.
   Apostrophe droite « ' » (convention projet, accessibilité clavier).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';

/** Ponctuation finale possible (la palette de boutons de F1). */
export type Ponctuation = '.' | '?' | '!';

/** Type de phrase officiel CE2 (l'exclamative est une forme, pas un type). */
export type TypePhrase = 'declaratif' | 'interrogatif' | 'imperatif';

/** Un item de F1 : la phrase SANS sa ponctuation finale + le bon signe. */
export interface PhrasePonct {
	phrase: string; // ex. « Est-ce que tu viens jouer » (le « @ » du trou est ajouté à la génération)
	point: Ponctuation;
	explication: string; // cite le marqueur, jamais l'intonation
}

/** Un item de F2 : la phrase COMPLÈTE (ponctuation comprise) + son type. */
export interface PhraseType {
	phrase: string; // ex. « Range ta chambre. »
	type: TypePhrase;
	explication: string; // cite le marqueur de sens
}

const MODE_QCM: ModeOption[] = [
	{ id: 'qcm', label: 'Je choisis la bonne réponse', icon: 'check-circle', recommended: true },
];

/* ---------- F1 — banque « Quel point à la fin ? » ---------- */
// Équilibre : 14 « . » / 13 « ? » / 13 « ! ». Aucun item ambigu (deux items
// « limite » signalés par le pédagogue remplacés par des exclamatives en
// « Quelle/Comme », sans interjection à double lecture). Banque étoffée (#285)
// pour casser la répétition : +6 phrases par signe, mêmes règles d'or.
export const PHRASES_PONCT: PhrasePonct[] = [
	// « . » — déclaratives neutres, AUCUN marqueur.
	{
		phrase: 'Le chat dort sur le canapé',
		point: '.',
		explication: "On raconte quelque chose, sans question ni surprise : c'est un point.",
	},
	{
		phrase: 'Nous mangeons des pâtes ce midi',
		point: '.',
		explication: "La phrase raconte ce qu'on fait, tout simplement : c'est un point.",
	},
	{
		phrase: 'Maman lit une histoire le soir',
		point: '.',
		explication: "On donne une information calmement : c'est un point.",
	},
	{
		phrase: 'Les oiseaux volent dans le ciel',
		point: '.',
		explication: "C'est une phrase qui raconte : on met un point.",
	},
	{
		phrase: "Je range mes jouets après l'école",
		point: '.',
		explication: "On dit ce qu'on fait, sans surprise : c'est un point.",
	},
	{
		phrase: 'Le train arrive à huit heures',
		point: '.',
		explication: "On donne une information : c'est un point.",
	},
	{
		phrase: 'Mon frère joue dans le jardin',
		point: '.',
		explication: 'La phrase raconte quelque chose : on met un point.',
	},
	{
		phrase: 'La maîtresse écrit au tableau',
		point: '.',
		explication: "On raconte une scène, calmement : c'est un point.",
	},
	// « ? » — marqueur interrogatif explicite (mot interrogatif ou inversion).
	{
		phrase: 'Est-ce que tu viens jouer',
		point: '?',
		explication: "« Est-ce que » annonce une question : on met un point d'interrogation.",
	},
	{
		phrase: 'Où sont mes chaussures',
		point: '?',
		explication: "« Où » pose une question : c'est un point d'interrogation.",
	},
	{
		phrase: 'Quand part-on en vacances',
		point: '?',
		explication: "« Quand » pose une question : on met un point d'interrogation.",
	},
	{
		phrase: 'Pourquoi pleures-tu',
		point: '?',
		explication: "« Pourquoi » demande une explication : c'est un point d'interrogation.",
	},
	{
		phrase: "Comment vas-tu aujourd'hui",
		point: '?',
		explication: "« Comment » pose une question : on met un point d'interrogation.",
	},
	{
		phrase: 'As-tu fini ton dessin',
		point: '?',
		explication: "Le verbe est placé avant « tu » : c'est un point d'interrogation.",
	},
	{
		phrase: 'Qui a mangé le gâteau',
		point: '?',
		explication: "« Qui » demande une réponse : c'est un point d'interrogation.",
	},
	// « ! » — interjection ou exclamation lexicalement marquée (« Quel(le)… », « Comme… »).
	{
		phrase: 'Quelle belle journée',
		point: '!',
		explication: "« Quelle » montre qu'on est étonné ou content : c'est un point d'exclamation.",
	},
	{
		phrase: "Comme c'est joli",
		point: '!',
		explication: "« Comme » dit une surprise : on met un point d'exclamation.",
	},
	{
		phrase: 'Quelle bonne surprise',
		point: '!',
		explication: "« Quelle » dit qu'on a une bonne surprise : c'est un point d'exclamation.",
	},
	{
		phrase: 'Quel beau cadeau',
		point: '!',
		explication: "« Quel » dit qu'on est émerveillé : c'est un point d'exclamation.",
	},
	{
		phrase: 'Attention, ça glisse',
		point: '!',
		explication: "« Attention » avertit fort : on met un point d'exclamation.",
	},
	{
		phrase: 'Comme tu cours vite',
		point: '!',
		explication: "« Comme » marque l'étonnement : c'est un point d'exclamation.",
	},
	{
		phrase: 'Comme ce gâteau est bon',
		point: '!',
		explication: "« Comme » marque l'étonnement : c'est un point d'exclamation.",
	},
	// ----- Ajouts #285 (variété anti-répétition) : +6 par signe, équilibre conservé. -----
	// « . » — déclaratives neutres, AUCUN marqueur.
	{
		phrase: 'La pluie tombe sur les toits',
		point: '.',
		explication: "On raconte ce qui se passe dehors : c'est un point.",
	},
	{
		phrase: 'Les élèves rangent leurs cartables',
		point: '.',
		explication: "La phrase dit ce qu'on fait : on met un point.",
	},
	{
		phrase: 'Le boulanger prépare le pain chaud',
		point: '.',
		explication: "On donne une information : c'est un point.",
	},
	{
		phrase: 'Mon chat ronronne sur le coussin',
		point: '.',
		explication: "La phrase raconte une scène calme : c'est un point.",
	},
	{
		phrase: 'Nous plantons des tomates au jardin',
		point: '.',
		explication: "On dit ce qu'on fait, sans surprise : c'est un point.",
	},
	{
		phrase: 'Le voilier avance sur la mer',
		point: '.',
		explication: 'La phrase raconte quelque chose : on met un point.',
	},
	// « ? » — marqueur interrogatif explicite (mot interrogatif ou inversion).
	{
		phrase: 'Combien de bonbons veux-tu',
		point: '?',
		explication: "« Combien » demande un nombre : c'est un point d'interrogation.",
	},
	{
		phrase: 'Aimes-tu les fraises',
		point: '?',
		explication: "Le verbe est placé avant « tu » : c'est un point d'interrogation.",
	},
	{
		phrase: 'Quand reviens-tu de vacances',
		point: '?',
		explication: "« Quand » demande un moment : on met un point d'interrogation.",
	},
	{
		phrase: 'Veux-tu jouer avec moi',
		point: '?',
		explication: "Le verbe est placé avant « tu » : c'est un point d'interrogation.",
	},
	{
		phrase: 'Comment fais-tu ce tour de magie',
		point: '?',
		explication: "« Comment » pose une question : on met un point d'interrogation.",
	},
	{
		phrase: 'Qui a pris mon crayon rouge',
		point: '?',
		explication: "« Qui » demande une personne : c'est un point d'interrogation.",
	},
	// « ! » — interjection ou exclamation lexicalement marquée (« Quel(le)… », « Comme… »).
	{
		phrase: 'Quelle jolie surprise tu me fais',
		point: '!',
		explication: "« Quelle » montre qu'on est content : c'est un point d'exclamation.",
	},
	{
		phrase: 'Bravo pour ce beau dessin',
		point: '!',
		explication: "« Bravo » félicite très fort : c'est un point d'exclamation.",
	},
	{
		phrase: 'Quel joli château de sable',
		point: '!',
		explication: "« Quel » montre qu'on est émerveillé : c'est un point d'exclamation.",
	},
	{
		phrase: 'Comme cette fleur sent bon',
		point: '!',
		explication: "« Comme » marque la surprise : c'est un point d'exclamation.",
	},
	{
		phrase: 'Attention à la marche',
		point: '!',
		explication: "« Attention » avertit fort : on met un point d'exclamation.",
	},
	{
		phrase: 'Quel magnifique arc-en-ciel',
		point: '!',
		explication: "« Quel » montre qu'on est émerveillé : c'est un point d'exclamation.",
	},
];

/* ---------- F2 — banque « Quel type de phrase ? » ---------- */
// Équilibre : 13 déclaratifs / 13 interrogatifs / 13 impératifs. Mélange VOULU :
// impératifs au point + déclaratifs au « ! » → l'enfant ne peut pas se fier au
// seul symbole, il doit lire la structure (avis pédagogue). Banque étoffée
// (#285) : +6 phrases par type, équilibre et mélange conservés.
export const PHRASES_TYPE: PhraseType[] = [
	// Déclaratif — on raconte / on dit (dont 2 au « ! » : le « ! » ne dit pas « ordre »).
	{
		phrase: 'Le soleil brille ce matin.',
		type: 'declaratif',
		explication: "La phrase raconte quelque chose : c'est une phrase qui dit.",
	},
	{
		phrase: 'Nous partons à la mer demain.',
		type: 'declaratif',
		explication: 'On dit ce qui va se passer : la phrase raconte.',
	},
	{
		phrase: 'Mon chien adore les promenades.',
		type: 'declaratif',
		explication: 'La phrase donne une information : elle raconte.',
	},
	{
		phrase: "Il fait très chaud aujourd'hui !",
		type: 'declaratif',
		explication: "Même avec un « ! », la phrase raconte un fait : c'est une phrase qui dit.",
	},
	{
		phrase: "J'ai adoré ce film !",
		type: 'declaratif',
		explication:
			"Le « ! » montre qu'on est content, mais la phrase raconte un fait : c'est une phrase qui dit.",
	},
	{
		phrase: 'Les vacances commencent samedi.',
		type: 'declaratif',
		explication: 'On donne une information : la phrase raconte.',
	},
	{
		phrase: 'La tour Eiffel est à Paris.',
		type: 'declaratif',
		explication: 'La phrase nous apprend quelque chose : elle raconte.',
	},
	// Interrogatif — on pose une question.
	{
		phrase: 'Est-ce que tu as faim ?',
		type: 'interrogatif',
		explication: "« Est-ce que » pose une question : c'est une phrase qui demande.",
	},
	{
		phrase: 'Où habites-tu ?',
		type: 'interrogatif',
		explication: "« Où » demande un endroit : c'est une phrase qui pose une question.",
	},
	{
		phrase: 'Pourquoi ris-tu ?',
		type: 'interrogatif',
		explication: "« Pourquoi » attend une réponse : c'est une phrase qui demande.",
	},
	{
		phrase: "Veux-tu un peu d'eau ?",
		type: 'interrogatif',
		explication: "Le verbe est placé avant « tu » et on attend une réponse : c'est une question.",
	},
	{
		phrase: 'Quand revient ta sœur ?',
		type: 'interrogatif',
		explication: "« Quand » demande un moment : c'est une phrase qui pose une question.",
	},
	{
		phrase: "Comment s'appelle ton chat ?",
		type: 'interrogatif',
		explication: "« Comment » demande une réponse : c'est une question.",
	},
	{
		phrase: 'As-tu vu mon stylo ?',
		type: 'interrogatif',
		explication: "On attend une réponse oui ou non : c'est une question.",
	},
	// Impératif — on donne un ordre / un conseil (dont la plupart au point).
	{
		phrase: 'Range ta chambre.',
		type: 'imperatif',
		explication: "La phrase commande de faire quelque chose : c'est un ordre.",
	},
	{
		phrase: "Ferme la porte, s'il te plaît.",
		type: 'imperatif',
		explication: "On demande de faire quelque chose : c'est un ordre (poli).",
	},
	{
		phrase: 'Écoute bien la consigne.',
		type: 'imperatif',
		explication: "La phrase dit de faire quelque chose : c'est un ordre.",
	},
	{
		phrase: 'Fais attention en traversant.',
		type: 'imperatif',
		explication: "La phrase donne le conseil de faire quelque chose : c'est un ordre.",
	},
	{
		phrase: 'Ne cours pas dans le couloir.',
		type: 'imperatif',
		explication: "La phrase dit de ne pas faire quelque chose : c'est un ordre.",
	},
	{
		phrase: 'Prends ton manteau !',
		type: 'imperatif',
		explication: "La phrase commande de faire quelque chose : c'est un ordre.",
	},
	{
		phrase: 'Mange tes légumes.',
		type: 'imperatif',
		explication: "La phrase dit de faire quelque chose : c'est un ordre.",
	},
	// ----- Ajouts #285 (variété anti-répétition) : +6 par type, mélange point ≠ type conservé. -----
	// Déclaratif — on raconte / on dit (dont 1 au « ! » : le « ! » ne dit pas « ordre »).
	{
		phrase: 'Le facteur apporte une lettre.',
		type: 'declaratif',
		explication: 'La phrase donne une information : elle raconte.',
	},
	{
		phrase: 'Les abeilles butinent les fleurs.',
		type: 'declaratif',
		explication: 'On raconte ce que font les abeilles : la phrase raconte.',
	},
	{
		phrase: 'Mon grand frère joue de la guitare.',
		type: 'declaratif',
		explication: 'La phrase raconte quelque chose : elle dit.',
	},
	{
		phrase: 'La neige recouvre tout le village.',
		type: 'declaratif',
		explication: "On décrit ce qu'on voit : la phrase raconte.",
	},
	{
		phrase: 'Ce gâteau au chocolat est vraiment délicieux !',
		type: 'declaratif',
		explication:
			"Le « ! » montre qu'on se régale, mais la phrase raconte un fait : c'est une phrase qui dit.",
	},
	{
		phrase: 'Le train pour Paris part à midi.',
		type: 'declaratif',
		explication: 'On donne une information : la phrase raconte.',
	},
	// Interrogatif — on pose une question.
	{
		phrase: 'Veux-tu venir à mon anniversaire ?',
		type: 'interrogatif',
		explication: "Le verbe est placé avant « tu » et on attend une réponse : c'est une question.",
	},
	{
		phrase: 'Pourquoi le ciel est-il bleu ?',
		type: 'interrogatif',
		explication: "« Pourquoi » attend une explication : c'est une phrase qui demande.",
	},
	{
		phrase: 'Combien de pommes reste-t-il ?',
		type: 'interrogatif',
		explication: "« Combien » demande un nombre : c'est une phrase qui pose une question.",
	},
	{
		phrase: 'As-tu rangé tes affaires ?',
		type: 'interrogatif',
		explication: "On attend une réponse oui ou non : c'est une question.",
	},
	{
		phrase: 'Où as-tu trouvé ce caillou ?',
		type: 'interrogatif',
		explication: "« Où » demande un endroit : c'est une phrase qui pose une question.",
	},
	{
		phrase: "Comment s'appelle ta maîtresse ?",
		type: 'interrogatif',
		explication: "« Comment » demande une réponse : c'est une question.",
	},
	// Impératif — on donne un ordre / un conseil (dont la plupart au point).
	{
		phrase: 'Range tes affaires avant de partir.',
		type: 'imperatif',
		explication: "La phrase dit de faire quelque chose : c'est un ordre.",
	},
	{
		phrase: 'Lave-toi les mains avant le repas.',
		type: 'imperatif',
		explication: "La phrase commande de faire quelque chose : c'est un ordre.",
	},
	{
		phrase: 'Ne touche pas à ce vase.',
		type: 'imperatif',
		explication: "La phrase dit de ne pas faire quelque chose : c'est un ordre.",
	},
	{
		phrase: 'Ferme bien la fenêtre.',
		type: 'imperatif',
		explication: "La phrase commande de faire quelque chose : c'est un ordre.",
	},
	{
		phrase: "Aide ton petit frère, s'il te plaît.",
		type: 'imperatif',
		explication: "On demande de faire quelque chose : c'est un ordre (poli).",
	},
	{
		phrase: "Viens vite, on t'attend !",
		type: 'imperatif',
		explication: "Même avec un « ! », la phrase commande de faire quelque chose : c'est un ordre.",
	},
];

/** Libellés enfant des 3 types (validés par le pédagogue), réutilisés comme
 *  options de QCM ET comme réponse attendue. */
export const TYPE_LABELS: Record<TypePhrase, string> = {
	declaratif: 'Raconter ou dire',
	interrogatif: 'Poser une question',
	imperatif: 'Donner un ordre',
};

/* ---------- F1 — fabrique de l'ExerciseType ---------- */
export function ponctuationType(): ExerciseType {
	return {
		modes: MODE_QCM,
		// Repli fiche/bilan (saisie) : on nomme la tâche, le « @ » étant le trou.
		consigne: 'Écris le point qui va à la fin de chaque phrase : « . », « ? » ou « ! ».',
		generate(): Exercise {
			const p = choice(PHRASES_PONCT);
			return {
				type: 'qcm',
				// Le « @ » (trou final) est rendu en cadre pointillé par la variante, et
				// retiré à la lecture TTS → la phrase est lue SANS la ponctuation finale.
				question: `${p.phrase}@`,
				answer: p.point,
				choices: ['.', '?', '!'], // ordre fixe : palette stable (mémoire motrice, accessibilité)
				explication: p.explication,
				variante: 'ponctuation',
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* ---------- F2 — fabrique de l'ExerciseType ---------- */
export function typePhraseType(): ExerciseType {
	const OPTIONS = [TYPE_LABELS.declaratif, TYPE_LABELS.interrogatif, TYPE_LABELS.imperatif];
	return {
		modes: MODE_QCM,
		consigne:
			'Écris ce que fait chaque phrase : raconter ou dire, poser une question, donner un ordre.',
		generate(): Exercise {
			const p = choice(PHRASES_TYPE);
			return {
				type: 'qcm',
				question: `« ${p.phrase} »`,
				answer: TYPE_LABELS[p.type],
				choices: sample(OPTIONS, OPTIONS.length), // 3 libellés, ordre mélangé
				explication: p.explication,
				// Consigne d'action visible (#265) : « Que fait cette phrase ? » est plus concret
				// pour un CE2 que « le type de phrase » (abstrait) ; l'énoncé n'est plus que la phrase.
				consigne: 'Que fait cette phrase ?',
				// Lu à voix haute (#42) : on nomme la tâche et on lit la phrase (la
				// réponse — le type — n'est jamais prononcée).
				parle: `Que fait cette phrase ? ${p.phrase}`,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export interface PhraseLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

// Ordre imposé par l'issue : la ponctuation d'abord, le type ensuite.
export const PHRASES_LESSONS: PhraseLessonDef[] = [
	{ id: 'fr-gram-ponctuation', label: 'Quel point à la fin ?', exerciseType: ponctuationType() },
	{ id: 'fr-gram-type-phrase', label: 'Quel type de phrase ?', exerciseType: typePhraseType() },
];
