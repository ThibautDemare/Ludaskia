/* ============================================================
   Grammaire — les phrases : ponctuation finale, types & formes (#204 ; CM1 #245).
   ------------------------------------------------------------
   Au CE2, deux leçons QCM (rubrique « Les phrases ») ; au CM1 (#245), le « type »
   s'ouvre (3 types inchangés — B.O. 2025 garde l'exclamative comme FORME, pas un 4e
   type) et DEUX leçons sur l'axe FORME s'ajoutent : F3 « Affirmative ou négative ? »
   (identification) et F4 « Mets à la forme négative » (transformation « ne… pas » en
   QCM à clé unique, jamais en saisie libre). Type et forme ne sont JAMAIS mêlés dans
   une même question (axes orthogonaux — avis pedagogue).

   Les leçons CE2, dans cet ordre (rubrique « Les phrases ») :
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
import type { SchoolLevel } from '../../core/catalog';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';
import { etayageRedige, MODE_QCM_CHECK } from '../_shared';
import type { LessonInput } from '../_shared';

/** Ponctuation finale possible (la palette de boutons de F1). */
export type Ponctuation = '.' | '?' | '!';

/** Type de phrase officiel CE2 (l'exclamative est une forme, pas un type). */
export type TypePhrase = 'declaratif' | 'interrogatif' | 'imperatif';

/** Forme de phrase (CM1, #245) : axe ORTHOGONAL au type (une phrase de n'importe
 *  quel type peut être affirmative ou négative). On s'en tient à l'axe BINAIRE
 *  affirmative/négative (avis pedagogue + B.O. 2025) : l'exclamative reste traitée
 *  par le « ! » de la leçon « Quel point à la fin ? », jamais mêlée à cet axe. */
export type FormePhrase = 'affirmative' | 'negative';

/** Un item d'identification de la forme : la phrase complète + sa forme. */
export interface PhraseForme {
	phrase: string;
	forme: FormePhrase;
	explication: string; // cite le mot de négation (« ne… pas »…), jamais l'intonation
}

/** Un item de transformation (CM1) : une phrase affirmative, sa forme négative
 *  CORRECTE (« ne… pas » seul → réponse UNIQUE) et des distracteurs FRANCS (négation
 *  mal placée, orpheline, ou élision oubliée). Les formes sont STOCKÉES (jamais
 *  dérivées), comme tout le moteur QCM : aucune négation calculée à la volée. */
export interface PhraseTransfo {
	affirmative: string;
	negative: string;
	distracteurs: string[];
}

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

const MODE_QCM: ModeOption[] = [MODE_QCM_CHECK];

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

/* ---------- F3 (CM1, #245) — banque « Affirmative ou négative ? » ---------- */
// Axe FORME, distinct du TYPE. Équilibre ~moitié/moitié. Les négatives portent un
// marqueur EXPLICITE (« ne… pas » majoritaire ; quelques « ne… plus/jamais/rien »
// pour l'IDENTIFICATION, où la variété ne crée pas d'ambiguïté — la transformation,
// elle, reste sur « ne… pas »). Les affirmatives n'ont AUCUN mot de négation.
// L'explication cite le marqueur, jamais l'intonation (règle d'or de F1/F2).
export const PHRASES_FORME: PhraseForme[] = [
	// Affirmatives — aucun mot de négation.
	{
		phrase: 'Le chat dort sur le canapé.',
		forme: 'affirmative',
		explication: "Il n'y a pas de mot comme « ne… pas » : la phrase dit oui, elle est affirmative.",
	},
	{
		phrase: 'Nous mangeons des pâtes ce midi.',
		forme: 'affirmative',
		explication: 'La phrase dit oui, sans mot de négation : elle est affirmative.',
	},
	{
		phrase: 'Les enfants jouent dans la cour.',
		forme: 'affirmative',
		explication: 'Aucun mot de négation : la phrase dit oui, elle est affirmative.',
	},
	{
		phrase: 'Papa prépare le dîner.',
		forme: 'affirmative',
		explication: 'La phrase dit oui, sans « ne… pas » : elle est affirmative.',
	},
	{
		phrase: 'Le train arrive à huit heures.',
		forme: 'affirmative',
		explication: 'Aucun mot de négation : la phrase est affirmative.',
	},
	{
		phrase: 'Elle lit un beau livre.',
		forme: 'affirmative',
		explication: 'La phrase dit oui, sans mot de négation : elle est affirmative.',
	},
	{
		phrase: 'Mon frère aime le chocolat.',
		forme: 'affirmative',
		explication: 'Aucun mot de négation : la phrase dit oui, elle est affirmative.',
	},
	{
		phrase: 'Les oiseaux chantent au printemps.',
		forme: 'affirmative',
		explication: 'La phrase dit oui, sans « ne… pas » : elle est affirmative.',
	},
	{
		phrase: 'Tu ranges ta chambre le samedi.',
		forme: 'affirmative',
		explication: 'Aucun mot de négation : la phrase est affirmative.',
	},
	{
		phrase: 'Le soleil brille ce matin.',
		forme: 'affirmative',
		explication: 'La phrase dit oui, sans mot de négation : elle est affirmative.',
	},
	// Négatives — marqueur explicite.
	{
		phrase: 'Le chat ne dort pas sur le canapé.',
		forme: 'negative',
		explication: '« ne… pas » entoure le verbe : la phrase dit non, elle est négative.',
	},
	{
		phrase: 'Nous ne mangeons pas de pâtes ce midi.',
		forme: 'negative',
		explication: '« ne… pas » entoure le verbe : la phrase dit non, elle est négative.',
	},
	{
		phrase: 'Je ne comprends pas la consigne.',
		forme: 'negative',
		explication: '« ne… pas » entoure le verbe : la phrase est négative.',
	},
	{
		phrase: 'Les élèves ne bavardent pas en classe.',
		forme: 'negative',
		explication: '« ne… pas » entoure le verbe : la phrase dit non, elle est négative.',
	},
	{
		phrase: 'Elle ne regarde jamais la télévision.',
		forme: 'negative',
		explication: '« ne… jamais » dit non : la phrase est négative.',
	},
	{
		phrase: 'Tu ne veux plus de dessert.',
		forme: 'negative',
		explication: '« ne… plus » dit non : la phrase est négative.',
	},
	{
		phrase: "Il n'y a rien dans le tiroir.",
		forme: 'negative',
		explication: '« ne… rien » dit non : la phrase est négative.',
	},
	{
		phrase: "Nous n'aimons pas les épinards.",
		forme: 'negative',
		explication:
			"Devant une voyelle, « ne » devient « n' » : « n'… pas » entoure le verbe, la phrase est négative.",
	},
	{
		phrase: 'Le magasin ne ferme pas le dimanche.',
		forme: 'negative',
		explication: '« ne… pas » entoure le verbe : la phrase dit non, elle est négative.',
	},
	{
		phrase: 'On ne sort pas sous la pluie.',
		forme: 'negative',
		explication: '« ne… pas » entoure le verbe : la phrase est négative.',
	},
];

/** Libellés enfant de la forme (CM1) : concret d'abord (« dit oui/non »), le terme
 *  grammatical glosé entre parenthèses. Réutilisés comme options ET réponse. */
export const FORME_LABELS: Record<FormePhrase, string> = {
	affirmative: 'Elle dit oui (affirmative)',
	negative: 'Elle dit non (négative)',
};

/* ---------- F4 (CM1, #245) — banque « Mets à la forme négative » ---------- */
// Transformation affirmative → négative, « ne… pas » SEULEMENT (réponse unique).
// Phrases simples (sujet + verbe + complément à article défini : pas de « du/de la »
// qui changerait, pas de « déjà/encore/toujours » qui appellerait « ne… plus/jamais »).
// La négative correcte et les distracteurs sont STOCKÉS. Distracteurs francs : « ne »
// mal placé après le verbe, « pas » orphelin en fin, ou élision « n' » oubliée.
export const PHRASES_TRANSFO: PhraseTransfo[] = [
	{
		affirmative: 'Je vois la mer.',
		negative: 'Je ne vois pas la mer.',
		distracteurs: ['Je vois ne pas la mer.', 'Je vois la mer pas.'],
	},
	{
		affirmative: 'Tu fermes la porte.',
		negative: 'Tu ne fermes pas la porte.',
		distracteurs: ['Tu fermes ne pas la porte.', 'Tu fermes la porte pas.'],
	},
	{
		affirmative: 'Le chien aboie.',
		negative: "Le chien n'aboie pas.",
		distracteurs: ['Le chien ne aboie pas.', 'Le chien aboie pas.'],
	},
	{
		affirmative: 'Nous regardons la télévision.',
		negative: 'Nous ne regardons pas la télévision.',
		distracteurs: ['Nous regardons ne pas la télévision.', 'Nous regardons la télévision pas.'],
	},
	{
		affirmative: 'Elle aime les carottes.',
		negative: "Elle n'aime pas les carottes.",
		distracteurs: ['Elle ne aime pas les carottes.', 'Elle aime pas les carottes.'],
	},
	{
		affirmative: 'Vous parlez fort.',
		negative: 'Vous ne parlez pas fort.',
		distracteurs: ['Vous parlez ne pas fort.', 'Vous parlez fort pas.'],
	},
	{
		affirmative: 'Le bébé dort.',
		negative: 'Le bébé ne dort pas.',
		distracteurs: ['Le bébé ne dort.', 'Le bébé dort pas.'],
	},
	{
		affirmative: 'Tu ranges les jouets.',
		negative: 'Tu ne ranges pas les jouets.',
		distracteurs: ['Tu ranges ne pas les jouets.', 'Tu ranges les jouets pas.'],
	},
	{
		affirmative: 'Il regarde le film.',
		negative: 'Il ne regarde pas le film.',
		distracteurs: ['Il regarde ne pas le film.', 'Il regarde le film pas.'],
	},
	{
		affirmative: 'Nous écoutons la musique.',
		negative: "Nous n'écoutons pas la musique.",
		distracteurs: ['Nous ne écoutons pas la musique.', 'Nous écoutons pas la musique.'],
	},
	{
		affirmative: 'Je connais la réponse.',
		negative: 'Je ne connais pas la réponse.',
		distracteurs: ['Je connais ne pas la réponse.', 'Je connais la réponse pas.'],
	},
	{
		affirmative: 'Tu trouves la sortie.',
		negative: 'Tu ne trouves pas la sortie.',
		distracteurs: ['Tu trouves ne pas la sortie.', 'Tu trouves la sortie pas.'],
	},
];

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

/* ---------- F3 (CM1) — fabrique « Affirmative ou négative ? » ---------- */
// QCM 2 options sur l'axe FORME. Mécanique calquée sur F2 (type), mais axe distinct :
// on ne mêle JAMAIS type et forme dans une même question (avis pedagogue, #245).
export function formePhraseType(): ExerciseType {
	const OPTIONS = [FORME_LABELS.affirmative, FORME_LABELS.negative];
	return {
		modes: MODE_QCM,
		consigne: 'Écris si chaque phrase dit oui (affirmative) ou non (négative).',
		generate(): Exercise {
			const p = choice(PHRASES_FORME);
			return {
				type: 'qcm',
				question: `« ${p.phrase} »`,
				answer: FORME_LABELS[p.forme],
				choices: sample(OPTIONS, OPTIONS.length), // 2 libellés, ordre mélangé
				explication: p.explication,
				consigne: 'Cette phrase dit-elle oui ou non ?',
				parle: `Cette phrase dit-elle oui, ou non ? ${p.phrase}`,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* ---------- F4 (CM1) — fabrique « Mets à la forme négative » ---------- */
// QCM 3 options (la négative correcte + 2 distracteurs francs STOCKÉS). On vérifie la
// PLACE de « ne… pas » (et l'élision « n' ») — la difficulté CM1 —, pas une saisie libre
// (ambiguë, donc injuste en auto-correction). « ne… pas » seulement.
export function transfoNegativeType(): ExerciseType {
	return {
		modes: MODE_QCM,
		consigne: 'Choisis la bonne phrase à la forme négative.',
		generate(): Exercise {
			const p = choice(PHRASES_TRANSFO);
			return {
				type: 'qcm',
				question: `« ${p.affirmative} »`,
				answer: p.negative,
				choices: sample([p.negative, ...p.distracteurs], p.distracteurs.length + 1),
				choicesEmpilees: true, // phrases longues → empilées (pleine largeur)
				explication: `Pour dire non, « ne… pas » entoure le verbe : « ${p.negative} ».`,
				consigne: 'Mets cette phrase à la forme négative.',
				parle: `Mets cette phrase à la forme négative : ${p.affirmative}`,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

// Niveaux supportés (#225/#245). Absent → CE2 par défaut (cf. catalog.ts).
export interface PhraseLessonDef extends LessonInput {
	levels?: SchoolLevel[];
}

// Ordre imposé par l'issue : la ponctuation d'abord, le type ensuite. CM1 (#245) :
// le « type » s'ouvre au CM1 (3 types inchangés, B.O. 2025) ; deux leçons CM1 sur l'axe
// FORME s'ajoutent (identification puis transformation négative).
/* ---------- Étayage de la notion (#490) ----------
   Quatre panneaux pour quatre tâches, alignés sur ce que les banques opposent
   RÉELLEMENT. Deux points méritent d'être notés, parce qu'ils viennent d'un choix de
   conception de ces banques et pas d'une préférence de rédaction :
   - « Quel type de phrase ? » mélange VOLONTAIRE point final et type (des impératifs
     au point, des déclaratives au « ! ») pour forcer le raisonnement sur le sens : sa
     règle dit donc explicitement de ne pas se fier au point ;
   - « Mets à la forme négative » a pour distracteurs une négation MAL PLACÉE, une
     négation ORPHELINE et une élision OUBLIÉE : les trois étapes traitent ces trois
     pièges, dans cet ordre.
   « Quel type de phrase ? » sert deux niveaux avec la MÊME tâche (les trois types ne
   bougent pas au CM1) : une seule entrée, sans `niveau`. */
const ETAYAGE_PONCTUATION = etayageRedige(
	'Quel point mettre à la fin ?',
	'Le point de la fin dit ce que fait la phrase.',
	[
		"Elle pose une question ? Mets un point d'interrogation.",
		"Elle montre une émotion forte ? Mets un point d'exclamation.",
		'Elle raconte simplement quelque chose ? Mets un point.',
	],
);

const ETAYAGE_TYPE_PHRASE = etayageRedige(
	'Quel type de phrase ?',
	"Ce qui donne le type, c'est ce que FAIT la phrase, jamais le point à la fin.",
	[
		'Elle raconte quelque chose : elle est déclarative.',
		'Elle demande quelque chose : elle est interrogative.',
		'Elle donne un ordre ou un conseil : elle est impérative.',
	],
);

const ETAYAGE_FORME = etayageRedige(
	'Affirmative ou négative ?',
	'Une phrase négative porte des mots de négation qui vont par deux, autour du verbe.',
	[
		"Cherche « ne » ou « n' » juste devant le verbe.",
		'Cherche son deuxième morceau juste après : pas, plus, jamais, rien, personne.',
		"Si tu n'en trouves pas, la phrase dit oui : elle est affirmative.",
	],
);

const ETAYAGE_TRANSFO_NEGATIVE = etayageRedige(
	'Comment mettre une phrase à la forme négative ?',
	'Pour dire non, on encadre le verbe conjugué avec « ne… pas ».',
	[
		'Trouve le verbe conjugué.',
		'Place « ne » juste devant lui, et « pas » juste après : les deux morceaux, jamais un seul.',
		"Devant une voyelle, « ne » devient « n' ».",
	],
);

export const PHRASES_LESSONS: PhraseLessonDef[] = [
	{
		id: 'fr-gram-ponctuation',
		label: 'Quel point à la fin ?',
		exerciseType: ponctuationType(),
		etayage: [ETAYAGE_PONCTUATION],
	},
	{
		id: 'fr-gram-type-phrase',
		label: 'Quel type de phrase ?',
		exerciseType: typePhraseType(),
		levels: ['ce2', 'cm1'],
		etayage: [ETAYAGE_TYPE_PHRASE],
	},
	{
		id: 'fr-gram-forme',
		label: 'Affirmative ou négative ?',
		exerciseType: formePhraseType(),
		levels: ['cm1'],
		etayage: [ETAYAGE_FORME],
	},
	{
		id: 'fr-gram-transfo-negative',
		label: 'Mets à la forme négative',
		exerciseType: transfoNegativeType(),
		levels: ['cm1'],
		etayage: [ETAYAGE_TRANSFO_NEGATIVE],
	},
];
