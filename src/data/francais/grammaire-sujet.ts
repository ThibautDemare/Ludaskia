/* ============================================================
   Grammaire — pronom sujet & accord sujet-verbe (#115).
   ------------------------------------------------------------
   Deux leçons QCM, au PRÉSENT de l'indicatif (CE2) :
   1. Pronom sujet : « mes amis et moi » → quel pronom ? (nous)
   2. Accord sujet-verbe : « les oiseaux (voir) » → quelle forme ? (voient)

   Mécanique : chaque sujet textuel est mappé à une PERSONNE grammaticale
   (0 je … 5 ils) ; la forme conjuguée est LUE depuis la base de conjugaison
   existante (`VERBS`/`getVerb`), jamais codée en dur. Paires sujet+verbe
   curées (pas d'association incongrue). On n'utilise que des verbes déjà
   présents dans la base.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';
import { getVerb } from './conjugaison';

/** Personne grammaticale : index dans les formes de conjugaison (je…ils). */
export type Personne = 0 | 1 | 2 | 3 | 4 | 5;

export interface Sujet {
	texte: string; // groupe sujet affiché (ex. « les oiseaux »)
	personne: Personne; // 2 = il/elle (sing.), 5 = ils/elles (plur.), 3 = nous, 4 = vous
	pronom: string; // pronom personnel attendu (genré : il/elle/ils/elles)
	verbes: string[]; // verbes (de la base) plausibles avec ce sujet (accord)
}

// Verbes de la base de conjugaison utilisés ici (tous présents dans VERBS).
const ACTIONS = ['aimer', 'finir', 'aller', 'faire', 'voir', 'dire', 'prendre', 'venir'];
const TOUS = ['etre', 'avoir', ...ACTIONS];
// Pour les animaux, on évite les verbes « humains » (dire, finir ses devoirs…).
const ANIMAUX = ['etre', 'avoir', 'aimer', 'aller', 'venir', 'voir'];

export const SUJETS: Sujet[] = [
	{ texte: 'le chat', personne: 2, pronom: 'il', verbes: ANIMAUX },
	{ texte: 'le chien', personne: 2, pronom: 'il', verbes: ANIMAUX },
	{ texte: "l'oiseau", personne: 2, pronom: 'il', verbes: ANIMAUX },
	{ texte: 'la fille', personne: 2, pronom: 'elle', verbes: TOUS },
	{ texte: 'le garçon', personne: 2, pronom: 'il', verbes: TOUS },
	{ texte: 'mon ami', personne: 2, pronom: 'il', verbes: TOUS },
	{ texte: 'mon amie', personne: 2, pronom: 'elle', verbes: TOUS },
	{ texte: 'le maître', personne: 2, pronom: 'il', verbes: TOUS },
	{ texte: 'la maîtresse', personne: 2, pronom: 'elle', verbes: TOUS },
	{ texte: 'mon père', personne: 2, pronom: 'il', verbes: TOUS },
	{ texte: 'ma mère', personne: 2, pronom: 'elle', verbes: TOUS },
	{ texte: 'les oiseaux', personne: 5, pronom: 'ils', verbes: ANIMAUX },
	{ texte: 'les chats', personne: 5, pronom: 'ils', verbes: ANIMAUX },
	{ texte: 'les enfants', personne: 5, pronom: 'ils', verbes: TOUS },
	{ texte: 'les filles', personne: 5, pronom: 'elles', verbes: TOUS },
	{ texte: 'les élèves', personne: 5, pronom: 'ils', verbes: TOUS },
	{ texte: 'mes parents', personne: 5, pronom: 'ils', verbes: TOUS },
	{ texte: 'Léa et Marie', personne: 5, pronom: 'elles', verbes: TOUS },
	{ texte: 'Paul et Léa', personne: 5, pronom: 'ils', verbes: TOUS },
	{ texte: 'mes amis et moi', personne: 3, pronom: 'nous', verbes: TOUS },
	{ texte: 'ma sœur et moi', personne: 3, pronom: 'nous', verbes: TOUS },
	{ texte: 'toi et moi', personne: 3, pronom: 'nous', verbes: TOUS },
	{ texte: 'toi et ton frère', personne: 4, pronom: 'vous', verbes: TOUS },
	{ texte: 'Paul et toi', personne: 4, pronom: 'vous', verbes: TOUS },
];

/* Pronom attendu selon la personne (pour les distracteurs du QCM pronom). */
const POOL_PRONOMS = ['il', 'elle', 'ils', 'elles', 'nous', 'vous', 'je', 'tu'];

const MODE_QCM: ModeOption[] = [
	{ id: 'qcm', label: 'Je choisis la bonne réponse', icon: 'check-circle', recommended: true },
];

/* Majuscule initiale (le sujet ouvre la phrase de l'exercice d'accord). */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/* Leçon 1 — pronom personnel sujet. */
export function pronomSujetType(): ExerciseType {
	return {
		modes: MODE_QCM,
		generate(): Exercise {
			const s = choice(SUJETS);
			const distracteurs = sample(
				POOL_PRONOMS.filter((p) => p !== s.pronom),
				3,
			);
			return {
				type: 'qcm',
				question: `« ${s.texte} » → @`,
				answer: s.pronom,
				choices: sample([s.pronom, ...distracteurs], 4),
				explication: `On peut remplacer « ${s.texte} » par « ${s.pronom} ».`,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* Distracteurs d'accord = autres formes du même verbe au présent (vraies
   formes, jamais une faute), dédupliquées et excluant la bonne réponse. */
function distracteursAccord(verbId: string, correcte: string): string[] {
	const present = getVerb(verbId)!.forms.present;
	const seen = new Set<string>([correcte]);
	const out: string[] = [];
	for (const f of sample(present, present.length)) {
		if (!seen.has(f)) {
			seen.add(f);
			out.push(f);
		}
	}
	return out.slice(0, 3);
}

/* Leçon 2 — accord sujet-verbe (présent). La forme est lue depuis la base. */
export function accordSujetVerbeType(): ExerciseType {
	return {
		modes: MODE_QCM,
		generate(): Exercise {
			const s = choice(SUJETS);
			const verbId = choice(s.verbes);
			const verbe = getVerb(verbId)!;
			const correcte = verbe.forms.present[s.personne];
			const choices = sample([correcte, ...distracteursAccord(verbId, correcte)], 4);
			return {
				type: 'qcm',
				question: `${cap(s.texte)} (${verbe.infinitif}) → @`,
				answer: correcte,
				choices,
				explication: `Avec « ${s.texte} », « ${verbe.infinitif} » s'écrit « ${correcte} ».`,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export interface GrammaireLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const GRAMMAIRE_SUJET_LESSONS: GrammaireLessonDef[] = [
	{ id: 'fr-gram-pronom-sujet', label: 'Le pronom sujet', exerciseType: pronomSujetType() },
	{
		id: 'fr-gram-accord-sujet-verbe',
		label: 'L’accord du verbe avec le sujet',
		exerciseType: accordSujetVerbeType(),
	},
];
