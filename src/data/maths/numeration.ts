/* ============================================================
   Numération — situer un nombre (NUM7/8/11, #98).
   Trois leçons : comparer, encadrer/intercaler, et la même chose
   jusqu'à 10 000. Chaque leçon expose DEUX modes (#69) :
   - `saisie` (conseillé, compatible fiche imprimable & bilans) :
     l'enfant tape le signe (<, =, >) ou le nombre ;
   - `tuiles` : l'enfant déplace la bonne tuile (signe ou nombre)
     parmi des distracteurs vers l'emplacement `@` (runner dédié,
     hors impression).
   Les deux modes partagent le même « fait » généré (même question,
   même réponse) : seul le moyen de répondre change.

   Calibrage pédagogique CE2 (avis pedagogue-primaire) :
   - comparer : nombres à 3 chiffres (jusqu'à 9999 pour la leçon 3),
     ~18 % d'égalités, ~30 % de longueurs différentes (cas charnière
     99/100, 999/1000), le reste à chiffres de tête égaux (vraie
     comparaison rang par rang).
   - encadrer : « la dizaine / centaine / millier juste avant / juste
     après » (une borne à la fois → réponse unique) ; jamais l'arrondi.
   - intercaler : bornes serrées de 2 (entre 456 et 458 → 457 unique).
   - tuiles : 3 à 4 tuiles, distracteurs = erreurs typiques (avant/après
     confondus, saut de rang, nombre non arrondi, recopie d'une borne).
   ============================================================ */
import type { Exercise, ExerciseType, ExerciseMode, ModeOption } from '../../core/exercise';
import { rnd, choice, sample } from '../../core/utils';

/* Deux modes communs à toutes les leçons de numération. */
const MODES: ModeOption[] = [
	{
		id: 'saisie',
		label: "J'écris la réponse",
		hint: 'au clavier',
		icon: 'keyboard',
		recommended: true,
	},
	{
		id: 'tuiles',
		label: 'Je déplace les tuiles',
		hint: 'glisse la bonne tuile',
		icon: 'puzzle-piece',
	},
];

/* Un « fait » : un énoncé (avec `@` = emplacement de réponse), la bonne réponse,
   et le jeu de tuiles (réponse + distracteurs) pour le mode tuiles. */
interface Fact {
	question: string;
	answer: string;
	tuiles: string[];
	parle?: string; // texte lu si l'énoncé affiché est symbolique (#42 ; ex. « 34 @ 56 »)
}

function signe(a: number, b: number): string {
	return a < b ? '<' : a > b ? '>' : '=';
}

/* Tuiles distinctes (chaînes), réponse incluse, mélangées, plafonnées à 4. */
function tuilesParmi(valeurs: number[], answer: number): string[] {
	const uniques = [...new Set([answer, ...valeurs].filter((v) => v > 0))];
	const distracteurs = uniques.filter((v) => v !== answer);
	const choisis = [answer, ...sample(distracteurs, Math.min(3, distracteurs.length))];
	return sample(choisis, choisis.length).map(String);
}

/* ---------- Comparer ---------- */
// Un nombre « à chiffres de tête égaux » à `a` : on garde tout sauf les deux
// derniers chiffres → force la comparaison rang par rang (dizaines/unités).
function memeTete(a: number): number {
	return a - (a % 100) + rnd(0, 99);
}

function compareFact(max: number): Fact {
	let a: number, b: number;
	const r = rnd(1, 100);
	if (r <= 18) {
		// égalité (≈18 %)
		a = rnd(100, max);
		b = a;
	} else if (r <= 45) {
		// longueurs différentes / cas charnière (≈27 %)
		const petit = choice([rnd(80, 99), rnd(900, 999)]);
		const grand = petit < 100 ? rnd(100, 140) : rnd(1000, Math.max(1001, max));
		[a, b] = rnd(0, 1) === 0 ? [petit, grand] : [grand, petit];
	} else {
		// même longueur, chiffres de tête souvent égaux (vraie comparaison)
		a = rnd(100, max);
		b = rnd(0, 1) === 0 ? memeTete(a) : rnd(100, max);
	}
	// Texte lu (#42) : « 34 @ 56 » est illisible à voix haute ; on nomme la tâche
	// sans donner le signe (la réponse).
	return {
		question: `${a} @ ${b}`,
		answer: signe(a, b),
		tuiles: ['<', '=', '>'],
		parle: `Compare ${a} et ${b}.`,
	};
}

/* ---------- Encadrer ---------- */
const RANG_MOT: Record<number, string> = { 10: 'dizaine', 100: 'centaine', 1000: 'millier' };

function encadreFact(max: number, rangs: number[]): Fact {
	const rang = choice(rangs);
	let n = rnd(rang + 1, max);
	while (n % rang === 0) n = rnd(rang + 1, max); // n strictement entre deux multiples
	const inf = Math.floor(n / rang) * rang;
	const sup = inf + rang;
	const apres = rnd(0, 1) === 0;
	const answer = apres ? sup : inf;
	const mot = RANG_MOT[rang];
	const article = rang === 1000 ? 'Le' : 'La';
	const question = `${article} ${mot} juste ${apres ? 'après' : 'avant'} ${n} : @`;
	// Distracteurs : l'autre borne (confusion avant/après), un saut de rang, et le
	// nombre lui-même (resté « collé », pas arrondi au rang entier).
	const tuiles = tuilesParmi([apres ? inf : sup, answer + (apres ? rang : -rang), n], answer);
	return { question, answer: String(answer), tuiles };
}

/* ---------- Intercaler ---------- */
function intercaleFact(max: number): Fact {
	const m = rnd(101, max - 1);
	const a = m - 1,
		b = m + 1;
	// Distracteurs : les bornes recopiées, et un voisin hors intervalle.
	const tuiles = tuilesParmi([a, b, m + 2], m);
	return { question: `Place un nombre entre ${a} et ${b} : @`, answer: String(m), tuiles };
}

/* Vrai si la réponse d'un fait est numérique (encadrer/intercaler) plutôt qu'un
   signe (comparer). Sert au catalogue à choisir kind 'num' vs 'text'. */
export function answerEstNumerique(answer: string): boolean {
	return answer.trim() !== '' && !Number.isNaN(Number(answer.replace(',', '.')));
}

/* Fabrique l'ExerciseType d'une leçon : `genFact` tire le type de question. */
function numerationType(genFact: () => Fact): ExerciseType {
	return {
		modes: MODES,
		generate(mode?: ExerciseMode): Exercise {
			const f = genFact();
			if (mode === 'tuiles') {
				return {
					type: 'tuilesNombre',
					question: f.question,
					answer: f.answer,
					tuiles: f.tuiles,
					parle: f.parle,
				};
			}
			return { type: 'text', question: f.question, answer: f.answer, parle: f.parle };
		},
		check(exercise: Exercise, input: string): boolean {
			if (!('answer' in exercise)) return false;
			const a = exercise.answer;
			return answerEstNumerique(a)
				? Number(input.trim().replace(',', '.')) === Number(a)
				: input.trim() === a;
		},
	};
}

export interface NumerationLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const NUMERATION_LESSONS: NumerationLessonDef[] = [
	{
		id: 'num-comparer',
		label: 'Je compare les nombres',
		exerciseType: numerationType(() => compareFact(999)),
	},
	{
		id: 'num-encadrer-intercaler',
		label: "J'encadre et j'intercale",
		exerciseType: numerationType(() =>
			rnd(1, 10) <= 6 ? encadreFact(999, [10, 100]) : intercaleFact(999),
		),
	},
	{
		id: 'num-situer-10000',
		label: "Je compare et j'encadre jusqu'à 10 000",
		// 4 chiffres réservés à cette leçon ; encadrement aussi au millier.
		exerciseType: numerationType(() =>
			rnd(0, 1) === 0 ? compareFact(9999) : encadreFact(9999, [10, 100, 1000]),
		),
	},
];
