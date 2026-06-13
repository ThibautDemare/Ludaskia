/* ============================================================
   Numération — valeur de position et décomposition (NUM1/5/6/10, #94).
   Quatre leçons à réponse NUMÉRIQUE unique, rendues via le chemin
   « math moderne » du catalogue (item `num`). Moteur partagé,
   paramétré par les bornes (≤ 100, ≤ 1000, ≤ 10000).

   Calibrage pédagogique CE2 (avis pedagogue-primaire) :
   - « chiffre des X » (un symbole, ex. 4) et « nombre de X en tout »
     (ex. 34) sont distingués par le mot-clé « en tout » ; « en tout »
     n'est jamais demandé sur les unités (réponse = le nombre entier,
     déroutant). « chiffre des » domine, « en tout » est minoritaire.
   - décomposition : forme « en rangs » (centaines/dizaines/unités),
     PAS la forme additive (300+60+5) → on évite l'ambiguïté 6 vs 60.
     Sens « décomposer » (trou sur un rang) dominant, « composer »
     (rangs → nombre) en complément. Le rang troué varie.
   - le zéro intercalaire (305, 4070) est inclus naturellement : il est
     formateur (« il n'y a pas de dizaines »).
   - accords : « 1 dizaine », « 0 dizaine », « 2 dizaines ».
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import { rnd } from '../../core/utils';

/* Rangs du plus petit au plus grand. */
const RANGS = [
	{ mot: 'unité', place: 1 },
	{ mot: 'dizaine', place: 10 },
	{ mot: 'centaine', place: 100 },
	{ mot: 'millier', place: 1000 },
];

const digitAt = (n: number, place: number) => Math.floor(n / place) % 10;
const countOf = (n: number, place: number) => Math.floor(n / place);
/* Pluriel français : « 0 dizaine », « 1 dizaine », « 2 dizaines ». */
const pluriel = (mot: string, k: number) => mot + (k > 1 ? 's' : '');

function ex(question: string, answer: number): Exercise {
	return { type: 'text', question, answer: String(answer) };
}

/* ---------- Leçon 1 : « La valeur des chiffres » ---------- */
function valeurPositionFact(): Exercise {
	// Progressivité : surtout 3 chiffres, parfois 4 (introduit le millier).
	const n = rnd(1, 10) <= 6 ? rnd(100, 999) : rnd(1000, 9999);
	const maxIdx = n >= 1000 ? 3 : 2; // rang le plus haut présent
	if (rnd(1, 10) <= 7) {
		// « chiffre des X » : un seul symbole (tous rangs, unités comprises).
		const r = RANGS[rnd(0, maxIdx)];
		return ex(`Dans ${n}, quel est le chiffre des ${r.mot}s ? @`, digitAt(n, r.place));
	}
	// « combien de X en tout » : la quantité totale (jamais sur les unités).
	const r = RANGS[rnd(1, maxIdx)];
	return ex(`Dans ${n}, combien y a-t-il de ${r.mot}s en tout ? @`, countOf(n, r.place));
}

/* ---------- Leçons 2-4 : décomposition « en rangs » ----------
   maxIdx : 1 (≤ 100 : dizaines/unités), 2 (≤ 1000), 3 (≤ 10000). */
function decomposeFact(maxIdx: number): Exercise {
	const min = RANGS[maxIdx].place; // 10, 100 ou 1000 → garantit le bon nombre de rangs
	const n = rnd(min, min * 10 - 1);
	// Termes du plus grand rang au plus petit, avec accord singulier/pluriel.
	const terme = (idx: number) => {
		const d = digitAt(n, RANGS[idx].place);
		return `${d} ${pluriel(RANGS[idx].mot, d)}`;
	};
	if (rnd(1, 10) <= 3) {
		// Composer : rangs → nombre (plus facile, pour démarrer en confiance).
		const termes = [];
		for (let i = maxIdx; i >= 0; i--) termes.push(terme(i));
		return ex(`${termes.join(' + ')} = @`, n);
	}
	// Décomposer (dominant) : un rang troué (varié), réponse = son chiffre.
	const blank = rnd(0, maxIdx);
	const termes = [];
	for (let i = maxIdx; i >= 0; i--) {
		termes.push(i === blank ? `@ ${RANGS[i].mot}s` : terme(i));
	}
	return ex(`${n} = ${termes.join(' + ')}`, digitAt(n, RANGS[blank].place));
}

/* ExerciseType mono-mode (rendu fiche/bilan/sprint via le chemin saisie). */
function positionType(gen: () => Exercise): ExerciseType {
	return {
		generate: () => gen(),
		check: (exercise: Exercise, input: string): boolean =>
			Number(input.trim().replace(',', '.')) === Number(exercise.answer),
	};
}

export interface PositionLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const POSITION_LESSONS: PositionLessonDef[] = [
	{
		id: 'num-valeur-position',
		label: 'La valeur des chiffres',
		exerciseType: positionType(valeurPositionFact),
	},
	{
		id: 'num-decompose-100',
		label: 'Je décompose jusqu’à 100',
		exerciseType: positionType(() => decomposeFact(1)),
	},
	{
		id: 'num-decompose-1000',
		label: 'Je décompose jusqu’à 1 000',
		exerciseType: positionType(() => decomposeFact(2)),
	},
	{
		id: 'num-decompose-10000',
		label: 'Je décompose jusqu’à 10 000',
		exerciseType: positionType(() => decomposeFact(3)),
	},
];
