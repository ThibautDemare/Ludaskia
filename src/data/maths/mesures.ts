/* ============================================================
   Grandeurs et mesures — conversions d'unités (MES 1/3/4/8, #89 ; plages
   par niveau #287). Moteur de génération PARTAGÉ par quatre leçons :
   longueurs, masses, contenances, durées. Une question = une valeur dans une
   unité, l'enfant écrit la valeur dans l'autre unité (réponse numérique,
   vérifiée par checkItemAnswer en mode `num`).

   Multi-niveaux (#225/#287) : chaque leçon est `calibrated` par une table
   { ce2, cm1 } ; CE2 reste calibré à l'identique, le CM1 élargit les plages et
   ajoute des unités. Le vrai levier de variété n'est PAS d'élargir 1–9, mais
   d'ajouter des unités DÉJÀ au programme du niveau.

   Calibrage pédagogique (avis pedagogue-primaire) :
   - longueurs : CE2 m↔cm (×100), km↔m (×1000) ET cm↔mm (×10), m↔mm (×1000) —
     le mm de LONGUEUR est au programme CE2 2025 (1 cm = 10 mm, 1 m = 1000 mm) ;
     CM1 élargit à 1–20 et ajoute le dm.
   - masses : CE2 kg↔g (×1000) ; CM1 1–20 + g↔mg + le demi-kilo (500 g).
   - contenances : CE2 L↔cL (×100) ET L↔dL (×10) ; le mL (L↔mL, ×1000) relève du
     CM1 (franchir le millier), pas le dL.
   - durées : CE2 h↔min (×60, jusqu'à 4 h) + repères culturels (½, ¼, ¾ h, 1 h 30,
     1 h 15) ; le min↔s « libre » relève du CM1 (jamais ouvert au CE2).
   - facteur grande→petite borné par `maxBig` ; sens inverse (petite→grande)
     uniquement sur des multiples EXACTS du facteur → réponse entière.
   - pondération ~60/40 en faveur du sens grande→petite (× plus sûr que ÷) ;
     le trou alterne à gauche/à droite. L'unité attendue est collée au champ.
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import type { LessonInput } from '../_shared';
import { checkNumerique } from '../../core/check-helpers';
import { calibrated } from '../../core/level-combinators';
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
   culturels que l'enfant connaît sans les calculer (½ h = 30 min…). */
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

/* Fabrique l'ExerciseType d'une leçon de conversion (un jeu de paramètres = un
   niveau). Mono-mode (pas de QCM) : le catalogue le rend en item numérique via
   genLessonItem. Utilisée telle quelle comme `build` du combinateur `calibrated`. */
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
		check: checkNumerique,
	};
}

/* ---------- Configurations par niveau (#287) ---------- */

/* Repères culturels de durée, communs CE2/CM1 (mémorisés, pas calculés). */
const DUREE_FACTS: Fact[] = [
	{ left: 'une demi-heure', answerUnit: 'min', answer: 30 },
	{ left: "un quart d'heure", answerUnit: 'min', answer: 15 },
	{ left: "trois quarts d'heure", answerUnit: 'min', answer: 45 },
	{ left: 'une heure et demie', answerUnit: 'min', answer: 90 },
	{ left: 'une heure et quart', answerUnit: 'min', answer: 75 },
];

/* ---------- Descripteurs des quatre leçons (#89) ---------- */

export const MESURE_LESSONS: LessonInput[] = [
	{
		id: 'mes-longueurs',
		label: 'Je mesure en mètres et en centimètres',
		exerciseType: calibrated<MesureConfig>(
			{
				// CE2 : m↔cm, km↔m, ET cm↔mm / m↔mm (mm de longueur = CE2).
				ce2: {
					conversions: [
						{ big: 'm', small: 'cm', factor: 100 },
						{ big: 'km', small: 'm', factor: 1000 },
						{ big: 'cm', small: 'mm', factor: 10 },
						{ big: 'm', small: 'mm', factor: 1000 },
					],
				},
				// CM1 : mêmes unités en 1–20, + le dm (m↔dm, dm↔cm).
				cm1: {
					conversions: [
						{ big: 'm', small: 'cm', factor: 100, maxBig: 20 },
						{ big: 'km', small: 'm', factor: 1000, maxBig: 20 },
						{ big: 'cm', small: 'mm', factor: 10, maxBig: 20 },
						{ big: 'm', small: 'mm', factor: 1000, maxBig: 20 },
						{ big: 'dm', small: 'cm', factor: 10, maxBig: 20 },
						{ big: 'm', small: 'dm', factor: 10, maxBig: 20 },
					],
				},
			},
			conversionType,
		),
	},
	{
		id: 'mes-masses',
		label: 'Je pèse en kilos et en grammes',
		exerciseType: calibrated<MesureConfig>(
			{
				ce2: { conversions: [{ big: 'kg', small: 'g', factor: 1000 }] },
				// CM1 : 1–20, + g↔mg, + le demi-kilo (500 g).
				cm1: {
					conversions: [
						{ big: 'kg', small: 'g', factor: 1000, maxBig: 20 },
						{ big: 'g', small: 'mg', factor: 1000, maxBig: 20 },
					],
					facts: [{ left: 'un demi-kilogramme', answerUnit: 'g', answer: 500 }],
				},
			},
			conversionType,
		),
	},
	{
		id: 'mes-contenances',
		label: 'Je verse en litres et en centilitres',
		exerciseType: calibrated<MesureConfig>(
			{
				// CE2 : L↔cL ET L↔dL (le dL est au programme) ; PAS le mL (CM1).
				ce2: {
					conversions: [
						{ big: 'L', small: 'cL', factor: 100, maxBig: 12 },
						{ big: 'L', small: 'dL', factor: 10, maxBig: 12 },
					],
				},
				// CM1 : 1–20, + L↔mL (×1000, franchit le millier).
				cm1: {
					conversions: [
						{ big: 'L', small: 'cL', factor: 100, maxBig: 20 },
						{ big: 'L', small: 'dL', factor: 10, maxBig: 20 },
						{ big: 'L', small: 'mL', factor: 1000, maxBig: 20 },
					],
				},
			},
			conversionType,
		),
	},
	{
		id: 'mes-durees',
		label: 'Je compte les heures et les minutes',
		exerciseType: calibrated<MesureConfig>(
			{
				// CE2 : h↔min jusqu'à 4 h + repères culturels. JAMAIS min↔s.
				ce2: {
					conversions: [{ big: 'h', small: 'min', factor: 60, maxBig: 4 }],
					facts: DUREE_FACTS,
				},
				// CM1 : h↔min jusqu'à 10 h + min↔s (×60, 1–5 min).
				cm1: {
					conversions: [
						{ big: 'h', small: 'min', factor: 60, maxBig: 10 },
						{ big: 'min', small: 's', factor: 60, maxBig: 5 },
					],
					facts: DUREE_FACTS,
				},
			},
			conversionType,
		),
	},
];
