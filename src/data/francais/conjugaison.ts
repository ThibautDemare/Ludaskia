/* ============================================================
   Données de conjugaison française (CE2) + ConjugationExerciseType.
   ------------------------------------------------------------
   Chaque verbe porte ses formes pour les temps couverts, dans
   l'ordre des personnes : je, tu, il, nous, vous, ils.
   Temps couverts : présent, futur, imparfait, passé composé.
   Pour le passé composé, la forme stockée inclut l'auxiliaire
   conjugué (ex. « ai aimé », « suis allé ») ; l'accord des verbes
   en « être » suit le masculin (singulier / pluriel).
   La génération tire une personne au hasard ; la vérification est
   stricte (trim + NFC) : accents et apostrophes exigés.
   NB : dossier `francais` sans cédille pour des chemins d'import
   ASCII portables ; le libellé affiché reste « Français ».
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption, GenerateOpts } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { rnd, sample } from '../../core/utils';
import type { SchoolLevel } from '../../core/catalog';
import { MODE_QCM_CHECK } from '../_shared';

export type Tense = 'present' | 'futur' | 'imparfait' | 'passe_compose';

export interface VerbDef {
	id: string;
	infinitif: string;
	forms: Record<Tense, [string, string, string, string, string, string]>;
}

/* Verbes couverts (CE2) : auxiliaires, 1er et 2e groupe (modèles
   aimer / finir) et verbes fréquents du 3e groupe. Les formes du
   passé composé incluent l'auxiliaire conjugué. */
export const VERBS: VerbDef[] = [
	{
		id: 'etre',
		infinitif: 'être',
		forms: {
			present: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
			futur: ['serai', 'seras', 'sera', 'serons', 'serez', 'seront'],
			imparfait: ['étais', 'étais', 'était', 'étions', 'étiez', 'étaient'],
			passe_compose: ['ai été', 'as été', 'a été', 'avons été', 'avez été', 'ont été'],
		},
	},
	{
		id: 'avoir',
		infinitif: 'avoir',
		forms: {
			present: ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
			futur: ['aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront'],
			imparfait: ['avais', 'avais', 'avait', 'avions', 'aviez', 'avaient'],
			passe_compose: ['ai eu', 'as eu', 'a eu', 'avons eu', 'avez eu', 'ont eu'],
		},
	},
	{
		id: 'aimer',
		infinitif: 'aimer',
		forms: {
			present: ['aime', 'aimes', 'aime', 'aimons', 'aimez', 'aiment'],
			futur: ['aimerai', 'aimeras', 'aimera', 'aimerons', 'aimerez', 'aimeront'],
			imparfait: ['aimais', 'aimais', 'aimait', 'aimions', 'aimiez', 'aimaient'],
			passe_compose: ['ai aimé', 'as aimé', 'a aimé', 'avons aimé', 'avez aimé', 'ont aimé'],
		},
	},
	{
		id: 'finir',
		infinitif: 'finir',
		forms: {
			present: ['finis', 'finis', 'finit', 'finissons', 'finissez', 'finissent'],
			futur: ['finirai', 'finiras', 'finira', 'finirons', 'finirez', 'finiront'],
			imparfait: ['finissais', 'finissais', 'finissait', 'finissions', 'finissiez', 'finissaient'],
			passe_compose: ['ai fini', 'as fini', 'a fini', 'avons fini', 'avez fini', 'ont fini'],
		},
	},
	{
		id: 'aller',
		infinitif: 'aller',
		forms: {
			present: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'],
			futur: ['irai', 'iras', 'ira', 'irons', 'irez', 'iront'],
			imparfait: ['allais', 'allais', 'allait', 'allions', 'alliez', 'allaient'],
			passe_compose: [
				'suis allé',
				'es allé',
				'est allé',
				'sommes allés',
				'êtes allés',
				'sont allés',
			],
		},
	},
	{
		id: 'faire',
		infinitif: 'faire',
		forms: {
			present: ['fais', 'fais', 'fait', 'faisons', 'faites', 'font'],
			futur: ['ferai', 'feras', 'fera', 'ferons', 'ferez', 'feront'],
			imparfait: ['faisais', 'faisais', 'faisait', 'faisions', 'faisiez', 'faisaient'],
			passe_compose: ['ai fait', 'as fait', 'a fait', 'avons fait', 'avez fait', 'ont fait'],
		},
	},
	{
		id: 'venir',
		infinitif: 'venir',
		forms: {
			present: ['viens', 'viens', 'vient', 'venons', 'venez', 'viennent'],
			futur: ['viendrai', 'viendras', 'viendra', 'viendrons', 'viendrez', 'viendront'],
			imparfait: ['venais', 'venais', 'venait', 'venions', 'veniez', 'venaient'],
			passe_compose: [
				'suis venu',
				'es venu',
				'est venu',
				'sommes venus',
				'êtes venus',
				'sont venus',
			],
		},
	},
	{
		id: 'voir',
		infinitif: 'voir',
		forms: {
			present: ['vois', 'vois', 'voit', 'voyons', 'voyez', 'voient'],
			futur: ['verrai', 'verras', 'verra', 'verrons', 'verrez', 'verront'],
			imparfait: ['voyais', 'voyais', 'voyait', 'voyions', 'voyiez', 'voyaient'],
			passe_compose: ['ai vu', 'as vu', 'a vu', 'avons vu', 'avez vu', 'ont vu'],
		},
	},
	{
		id: 'dire',
		infinitif: 'dire',
		forms: {
			present: ['dis', 'dis', 'dit', 'disons', 'dites', 'disent'],
			futur: ['dirai', 'diras', 'dira', 'dirons', 'direz', 'diront'],
			imparfait: ['disais', 'disais', 'disait', 'disions', 'disiez', 'disaient'],
			passe_compose: ['ai dit', 'as dit', 'a dit', 'avons dit', 'avez dit', 'ont dit'],
		},
	},
	{
		id: 'pouvoir',
		infinitif: 'pouvoir',
		forms: {
			present: ['peux', 'peux', 'peut', 'pouvons', 'pouvez', 'peuvent'],
			futur: ['pourrai', 'pourras', 'pourra', 'pourrons', 'pourrez', 'pourront'],
			imparfait: ['pouvais', 'pouvais', 'pouvait', 'pouvions', 'pouviez', 'pouvaient'],
			passe_compose: ['ai pu', 'as pu', 'a pu', 'avons pu', 'avez pu', 'ont pu'],
		},
	},
	{
		id: 'vouloir',
		infinitif: 'vouloir',
		forms: {
			present: ['veux', 'veux', 'veut', 'voulons', 'voulez', 'veulent'],
			futur: ['voudrai', 'voudras', 'voudra', 'voudrons', 'voudrez', 'voudront'],
			imparfait: ['voulais', 'voulais', 'voulait', 'voulions', 'vouliez', 'voulaient'],
			passe_compose: ['ai voulu', 'as voulu', 'a voulu', 'avons voulu', 'avez voulu', 'ont voulu'],
		},
	},
	{
		id: 'prendre',
		infinitif: 'prendre',
		forms: {
			present: ['prends', 'prends', 'prend', 'prenons', 'prenez', 'prennent'],
			futur: ['prendrai', 'prendras', 'prendra', 'prendrons', 'prendrez', 'prendront'],
			imparfait: ['prenais', 'prenais', 'prenait', 'prenions', 'preniez', 'prenaient'],
			passe_compose: ['ai pris', 'as pris', 'a pris', 'avons pris', 'avez pris', 'ont pris'],
		},
	},
	{
		id: 'naitre',
		infinitif: 'naître',
		forms: {
			present: ['nais', 'nais', 'naît', 'naissons', 'naissez', 'naissent'],
			futur: ['naîtrai', 'naîtras', 'naîtra', 'naîtrons', 'naîtrez', 'naîtront'],
			imparfait: ['naissais', 'naissais', 'naissait', 'naissions', 'naissiez', 'naissaient'],
			passe_compose: ['suis né', 'es né', 'est né', 'sommes nés', 'êtes nés', 'sont nés'],
		},
	},
];

const TENSE_LABEL: Record<Tense, string> = {
	present: 'présent',
	futur: 'futur',
	imparfait: 'imparfait',
	passe_compose: 'passé composé',
};

/* Connecteur grammatical pour les libellés de leçons : « au présent »
   mais « à l'imparfait ». */
const TENSE_PHRASE: Record<Tense, string> = {
	present: 'au présent',
	futur: 'au futur',
	imparfait: "à l'imparfait",
	passe_compose: 'au passé composé',
};

/* Liste ordonnée des temps couverts (sert à la génération des leçons). */
export const TENSES: Tense[] = ['present', 'futur', 'imparfait', 'passe_compose'];

/* Pronoms personnels sujets, dans l'ordre des personnes 0..5 (réutilisé par les
   cibles verbe des listes d'orthographe, #261). « il » / « ils » couvrent les 3es
   personnes ; pas de « elle/elles » (accords de genre, cf. #261). */
export const PRONOUNS = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];

/* Pronom affiché : élision « je » → « j' » devant une voyelle ou un h muet
   (le contenu tapé reste la seule forme verbale, ex. « ai » → « j'ai »). */
export function displayPronoun(person: number, form: string): string {
	if (person === 0 && /^[aeiouàâäéèêëîïôöùûüh]/i.test(form)) return "j'";
	return PRONOUNS[person] + ' ';
}

export function getVerb(verbId: string): VerbDef | undefined {
	return VERBS.find((v) => v.id === verbId);
}

/* Modes de réponse d'un exercice de conjugaison :
   - 'saisie' : l'enfant écrit la forme (production, mode par défaut) ;
   - 'qcm'    : l'enfant choisit parmi plusieurs formes (reconnaissance,
                utilisé en sprint où la frappe pénaliserait la vitesse). */
export type ConjMode = 'saisie' | 'qcm';
export const CONJ_MODES: readonly ConjMode[] = ['saisie', 'qcm'];

/* Modes présentables à l'enfant : la saisie (production) est le mode conseillé,
   le QCM (reconnaissance) un allègement assumé pour démarrer. Ordre d'affichage :
   conseillé d'abord. Voir issue #69. */
export const CONJ_MODE_OPTIONS: ModeOption[] = [
	{ id: 'saisie', label: "J'écris le verbe", icon: 'pencil', recommended: true },
	{ ...MODE_QCM_CHECK, hint: 'plus facile pour commencer', recommended: false },
];

/* Nombre total de propositions d'un QCM (1 bonne réponse + distracteurs). */
const QCM_CHOICES = 4;

/* Distracteurs d'un QCM de conjugaison, dérivés du paradigme du verbe.
   Toutes les propositions sont de VRAIES formes correctement orthographiées
   (jamais une faute affichée), par ordre de pertinence pédagogique :
     1. autres personnes au même temps  → teste l'accord de la personne ;
     2. même personne aux autres temps   → teste la reconnaissance du temps ;
     3. repli : n'importe quelle autre forme du verbe.
   Déduplication par forme (NFC ; ex. « je/tu étais » sont identiques) ;
   la bonne réponse est exclue des distracteurs. */
function qcmDistractors(verb: VerbDef, tense: Tense, person: number, correct: string): string[] {
	const norm = (s: string) => s.normalize('NFC');
	const seen = new Set<string>([norm(correct)]);
	const picked: string[] = [];
	const addAll = (formes: string[]) => {
		for (const f of sample(formes, formes.length)) {
			const n = norm(f);
			if (!seen.has(n)) {
				seen.add(n);
				picked.push(f);
			}
		}
	};
	addAll(verb.forms[tense].filter((_, i) => i !== person)); // 1.
	addAll(TENSES.filter((t) => t !== tense).map((t) => verb.forms[t][person])); // 2.
	addAll(TENSES.flatMap((t) => verb.forms[t])); // 3.
	return picked.slice(0, QCM_CHOICES - 1);
}

/* Fabrique un ExerciseType pour un verbe à un temps donné. */
export function conjugationType(verbId: string, tense: Tense): ExerciseType {
	const verb = getVerb(verbId)!;
	return {
		modes: CONJ_MODE_OPTIONS,
		// Consigne de la fiche en saisie : nomme la tâche (le temps figure dans
		// chaque énoncé « verbe · temps — pronom »). #42.
		consigne: `Conjugue chaque verbe ${TENSE_PHRASE[tense]}.`,
		generate(opts?: GenerateOpts): Exercise {
			const mode = opts?.mode;
			const person = rnd(0, 5);
			const form = verb.forms[tense][person];
			const pron = displayPronoun(person, form);
			const question = `${verb.infinitif} · ${TENSE_LABEL[tense]} — ${pron}@`;
			// Texte LU à voix haute (#42) : l'énoncé affiché est télégraphique, illisible
			// tel quel. On nomme la tâche en phrase, sans donner la forme attendue.
			const parle = `Conjugue le verbe ${verb.infinitif} ${TENSE_PHRASE[tense]}, avec ${PRONOUNS[person]}.`;
			if (mode === 'qcm') {
				const distractors = qcmDistractors(verb, tense, person, form);
				return {
					type: 'qcm',
					question,
					answer: form,
					choices: sample([form, ...distractors], QCM_CHOICES),
					parle,
				};
			}
			return { type: 'text', question, answer: form, parle };
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* Rubrique d'une leçon de conjugaison = le temps (regroupement par temps dans
   l'écran de catégorie, #109). Libellé capitalisé pour le titre de section. */
const TENSE_RUBRIQUE: Record<Tense, string> = {
	present: 'Présent',
	futur: 'Futur',
	imparfait: 'Imparfait',
	passe_compose: 'Passé composé',
};

/* Descripteurs de leçons : une leçon par (verbe × temps). */
export interface ConjLessonDesc {
	id: string;
	label: string;
	verbId: string;
	tense: Tense;
	levels: SchoolLevel[];
	rubrique: string;
}

/* Libellé dédié des auxiliaires : ils ne relèvent pas d'un groupe, donc ils
   gardent leur titre propre (les seuls à déroger au format uniforme ci-dessous). */
const AUXILIAIRE_LABEL: Record<string, string> = {
	etre: "L'auxiliaire être",
	avoir: "L'auxiliaire avoir",
};

/* Groupe de chaque verbe conjugué (hors auxiliaires) : 1er (aimer), 2e (finir),
   3e groupe pour les verbes irréguliers fréquents. Réutilisé par les QCM méta
   (#239, conjugaison-meta.ts) — d'où l'export. */
export const VERB_GROUPE: Record<string, string> = {
	aimer: '1er groupe',
	finir: '2e groupe',
	aller: '3e groupe',
	faire: '3e groupe',
	venir: '3e groupe',
	voir: '3e groupe',
	dire: '3e groupe',
	pouvoir: '3e groupe',
	vouloir: '3e groupe',
	prendre: '3e groupe',
	naitre: '3e groupe',
};

/* Partie « verbe » du titre, uniforme : « Verbe (Ne groupe) » (infinitif capitalisé
   + groupe), sauf les auxiliaires qui gardent leur libellé dédié. */
function verbeLabel(v: VerbDef): string {
	if (AUXILIAIRE_LABEL[v.id]) return AUXILIAIRE_LABEL[v.id];
	const cap = v.infinitif.charAt(0).toUpperCase() + v.infinitif.slice(1);
	return `${cap} (${VERB_GROUPE[v.id]})`;
}

/* Périmètre conjugaison CM1 (#239) : TOUT le corpus est ouvert au CM1 — les 13
   verbes (être, avoir, 1er/2e groupe, irréguliers fréquents du 3e + naître) × les
   4 temps présents dans le corpus (présent, futur, imparfait, passé composé). Tag
   CM1 ADDITIF : le CE2 n'est JAMAIS retiré (toutes les leçons restent CE2). Le passé
   simple et le plus-que-parfait (attendus CM2) ne sont pas dans le corpus, donc non
   concernés. Les 3 QCM méta CM1 (conjugaison-meta.ts) tirent dans tout VERBS. */
export const CONJ_LESSONS: ConjLessonDesc[] = VERBS.flatMap((v) =>
	TENSES.map((tense) => ({
		id: `fr-conj-${v.id}-${tense}`,
		label: `${verbeLabel(v)} ${TENSE_PHRASE[tense]}`,
		verbId: v.id,
		tense,
		levels: ['ce2', 'cm1'] as SchoolLevel[],
		rubrique: TENSE_RUBRIQUE[tense],
	})),
);
