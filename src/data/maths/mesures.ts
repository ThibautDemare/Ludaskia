/* ============================================================
   Grandeurs et mesures — conversions d'unités (MES 1/3/4/8, #89).
   Moteur de génération PARTAGÉ par quatre leçons : longueurs,
   masses, contenances, durées. Une question = une valeur dans une
   unité, l'enfant écrit la valeur dans l'autre unité (réponse
   numérique, vérifiée par checkItemAnswer en mode `num`).

   Calibrage pédagogique CE2 (avis pedagogue-primaire) :
   - longueurs m↔cm (×100) et km↔m (×1000), masses kg↔g (×1000),
     contenances L↔cL (×100). Le mL (L↔mL) relève du CM1 : écarté.
   - durées : h↔min limité aux cas simples (1/2/3 h) + fractions
     culturelles (½, ¼, ¾ d'heure). La conversion min↔s « libre »
     (×60 à variable) dépasse l'automatisme CE2 : écartée.
   - facteur grande→petite borné à ≤ 9 ; sens inverse (petite→grande)
     uniquement sur des multiples EXACTS du facteur → réponse entière.
   - pondération ~60/40 en faveur du sens grande→petite (× plus sûr
     que ÷ à cet âge) ; le trou alterne à gauche/à droite pour varier
     la lecture sans changer le calcul. L'unité attendue est toujours
     affichée juste à côté du champ.
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import { rnd, choice } from '../../core/utils';

/* Une relation « 1 grande unité = facteur petites unités ». `maxBig` borne la
   valeur tirée côté grande unité (défaut 9 ; réduit pour les durées en ×60). */
interface Conversion {
	big: string; // unité grande (ex. 'm', 'km', 'kg', 'L', 'h')
	small: string; // unité petite (ex. 'cm', 'm', 'g', 'cL', 'min')
	factor: number; // 1 big = factor small
	maxBig?: number; // valeur max côté grande unité (défaut 9)
}

/* Un « fait » mémorisé (toujours dans le sens grande→petite), pour les repères
   culturels que le CE2 connaît sans les calculer (½ h = 30 min…). */
interface Fact {
	left: string; // membre connu, ex. 'une demi-heure'
	answerUnit: string; // unité du champ, ex. 'min'
	answer: number; // valeur attendue
}

interface MesureConfig {
	conversions: Conversion[];
	facts?: Fact[]; // tirés ~1 fois sur 4 quand présents
}

/* Construit la question texte (avec le `@` = emplacement du champ) en plaçant
   le trou à gauche ou à droite, l'unité attendue restant collée au champ. */
function buildQuestion(knownValue: number, knownUnit: string, answerUnit: string): string {
	const known = `${knownValue} ${knownUnit}`;
	// 50/50 : « known = @ unité » ou « @ unité = known ».
	return rnd(0, 1) === 0 ? `${known} = @ ${answerUnit}` : `@ ${answerUnit} = ${known}`;
}

function generateConversion(conversions: Conversion[]): Exercise {
	const c = choice(conversions);
	const maxBig = c.maxBig ?? 9;
	// ~60 % grande→petite (×, plus intuitif), ~40 % petite→grande (÷, exact).
	if (rnd(1, 10) <= 6) {
		const v = rnd(1, maxBig); // valeur dans la grande unité
		return {
			type: 'text',
			question: buildQuestion(v, c.big, c.small),
			answer: String(v * c.factor),
		};
	}
	const k = rnd(1, maxBig); // sens inverse : on part d'un multiple EXACT du facteur
	return {
		type: 'text',
		question: buildQuestion(k * c.factor, c.small, c.big),
		answer: String(k),
	};
}

/* Fabrique l'ExerciseType d'une leçon de conversion. Mono-mode (pas de QCM) :
   le catalogue le rend en item numérique via genLessonItem. */
export function conversionType(config: MesureConfig): ExerciseType {
	const facts = config.facts ?? [];
	return {
		// Consigne d'action (#265) : l'énoncé « 3 m = @ cm » est une égalité sans verbe
		// (« faut-il convertir ? compléter ? »). Affichée en fiche et propagée en révision.
		consigne: 'Complète : écris le bon nombre.',
		generate(): Exercise {
			if (facts.length && rnd(1, 4) === 1) {
				const f = choice(facts);
				return {
					type: 'text',
					question: `${f.left} = @ ${f.answerUnit}`,
					answer: String(f.answer),
				};
			}
			return generateConversion(config.conversions);
		},
		check(exercise: Exercise, input: string): boolean {
			return (
				'answer' in exercise && Number(input.trim().replace(',', '.')) === Number(exercise.answer)
			);
		},
	};
}

/* ---------- Descripteurs des quatre leçons (#89) ---------- */

export interface MesureLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const MESURE_LESSONS: MesureLessonDef[] = [
	{
		id: 'mes-longueurs',
		label: 'Je mesure en mètres et en centimètres',
		exerciseType: conversionType({
			conversions: [
				{ big: 'm', small: 'cm', factor: 100 },
				{ big: 'km', small: 'm', factor: 1000 },
			],
		}),
	},
	{
		id: 'mes-masses',
		label: 'Je pèse en kilos et en grammes',
		exerciseType: conversionType({
			conversions: [{ big: 'kg', small: 'g', factor: 1000 }],
		}),
	},
	{
		id: 'mes-contenances',
		label: 'Je verse en litres et en centilitres',
		exerciseType: conversionType({
			// L↔cL seulement : le mL (L↔mL) relève du CM1 (avis pédagogique).
			conversions: [{ big: 'L', small: 'cL', factor: 100 }],
		}),
	},
	{
		id: 'mes-durees',
		label: 'Je compte les heures et les minutes',
		exerciseType: conversionType({
			// h↔min limité à 1/2/3 h (×60 mémorisable), + fractions culturelles.
			conversions: [{ big: 'h', small: 'min', factor: 60, maxBig: 3 }],
			facts: [
				{ left: 'une demi-heure', answerUnit: 'min', answer: 30 },
				{ left: "un quart d'heure", answerUnit: 'min', answer: 15 },
				{ left: "trois quarts d'heure", answerUnit: 'min', answer: 45 },
			],
		}),
	},
];
