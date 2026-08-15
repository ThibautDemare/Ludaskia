/* ============================================================
   Numération — valeur de position et décomposition (NUM1/5/6/10, #94 ;
   grands nombres CM1, #240).
   Leçons à réponse NUMÉRIQUE unique, rendues via le chemin « math moderne »
   du catalogue (item `num`). Moteur partagé, paramétré par les bornes.

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

   Extension CM1 (#240) — plafond = LE MILLION (max 9 999 999) :
   - valeur de position calibrée sur de grands nombres (rangs jusqu'au
     million) ; les nombres affichés sont groupés (formatNombre) ; la
     SAISIE reste 1 chiffre (« chiffre des ») ou un nombre ≤ 6 chiffres.
   - décomposition « en rangs » étendue aux grands nombres (rang troué
     dominant ⇒ réponse = 1 chiffre, conforme à la contrainte de saisie).
   - décomposition MULTIPLICATIVE = NOUVELLE leçon CM1, distincte (forme
     « chiffre × valeur de rang », sens « décomposer » dominant).
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts } from '../../core/exercise';
import type { LessonInput } from '../_shared';
import type { SchoolLevel } from '../../core/catalog';
import { calibrated } from '../../core/level-combinators';
import { rnd } from '../../core/utils';
import { formatNombre } from '../../core/nombres';
import { checkNumerique } from '../../core/check-helpers';

/* Rangs du plus petit au plus grand (#240 : étendus jusqu'au million). */
const RANGS = [
	{ mot: 'unité', place: 1 },
	{ mot: 'dizaine', place: 10 },
	{ mot: 'centaine', place: 100 },
	{ mot: 'millier', place: 1000 },
	{ mot: 'dizaine de mille', place: 10000 },
	{ mot: 'centaine de mille', place: 100000 },
	{ mot: 'million', place: 1000000 },
];

const digitAt = (n: number, place: number) => Math.floor(n / place) % 10;
const countOf = (n: number, place: number) => Math.floor(n / place);
/* Pluriel français : « 0 dizaine », « 1 dizaine », « 2 dizaines ». « mille »
   est invariable, donc « dizaines de mille » / « centaines de mille » ne varient
   que sur le 1ᵉʳ mot ; ce pluriel s'applique sur le libellé court (mot du rang). */
const pluriel = (mot: string, k: number) => {
	if (k <= 1) return mot;
	// « dizaine de mille » → « dizaines de mille » : pluralise le premier mot seulement.
	if (mot.includes(' de mille')) return mot.replace(/^(\w+)/, '$1s');
	return mot + 's';
};

function ex(question: string, answer: number): Exercise {
	return { type: 'text', question, answer: String(answer) };
}

/* ---------- Leçon 1 : « La valeur des chiffres » ----------
   `maxRang` = indice du rang le plus haut autorisé (2 ≈ centaines pour CE2,
   6 ≈ million pour CM1). */
function valeurPositionFact(maxRang: number): Exercise {
	// Taille du nombre : on tire un rang le plus haut « présent » ≤ maxRang.
	const haut = rnd(maxRang <= 3 ? 2 : 4, maxRang); // CE2 surtout 3-4 chiffres ; CM1 5-7
	const minN = 10 ** haut;
	const maxN = 10 ** (haut + 1) - 1;
	const n = rnd(minN, maxN);
	if (rnd(1, 10) <= 7) {
		// « chiffre des X » : un seul symbole (tous rangs, unités comprises).
		const r = RANGS[rnd(0, haut)];
		return ex(
			`Dans ${formatNombre(n)}, quel est le chiffre des ${pluriel(r.mot, 2)} ? @`,
			digitAt(n, r.place),
		);
	}
	// « combien de X en tout » : la quantité totale. On exclut DEUX rangs dégénérés :
	// les unités (countOf = le nombre entier) ET le rang le plus haut du nombre (rnd
	// jusqu'à haut-1) — sur ce dernier, countOf = le CHIFFRE du rang (ex. « dizaines de
	// mille en tout » de 71 347 = 7 = le chiffre), « en tout » ne distingue alors plus
	// rien et l'item est trompeur. Borne basse rangMin → réponse ≤ 6 chiffres (UX #240).
	const rangMin = Math.max(1, haut - 4); // garantit countOf ≤ 5 chiffres
	const r = RANGS[rnd(rangMin, haut - 1)];
	return ex(
		`Dans ${formatNombre(n)}, combien y a-t-il de ${pluriel(r.mot, 2)} en tout ? @`,
		countOf(n, r.place),
	);
}

/* ---------- Décomposition « en rangs » ----------
   maxIdx : indice du rang le plus haut (1 ≤ 100, 2 ≤ 1000, 3 ≤ 10000 ; CM1 : 6). */
function decomposeFact(maxIdx: number): Exercise {
	const min = RANGS[maxIdx].place; // garantit le bon nombre de rangs
	const n = rnd(min, min * 10 - 1);
	// Termes du plus grand rang au plus petit, avec accord singulier/pluriel.
	const terme = (idx: number) => {
		const d = digitAt(n, RANGS[idx].place);
		return `${d} ${pluriel(RANGS[idx].mot, d)}`;
	};
	if (rnd(1, 10) <= 3 && min * 10 - 1 <= 999999) {
		// Composer : rangs → nombre (plus facile). Réservé aux plages où le nombre
		// formé reste ≤ 6 chiffres saisis (contrainte UX #240).
		const termes = [];
		for (let i = maxIdx; i >= 0; i--) termes.push(terme(i));
		return ex(`${termes.join(' + ')} = @`, n);
	}
	// Décomposer (dominant) : un rang troué (varié), réponse = son chiffre (1 caractère).
	const blank = rnd(0, maxIdx);
	const termes = [];
	for (let i = maxIdx; i >= 0; i--) {
		termes.push(i === blank ? `@ ${pluriel(RANGS[i].mot, 2)}` : terme(i));
	}
	return ex(`${formatNombre(n)} = ${termes.join(' + ')}`, digitAt(n, RANGS[blank].place));
}

/* ---------- Décomposition MULTIPLICATIVE (nouvelle leçon CM1, #240) ----------
   Forme « chiffre × valeur de rang » (le pédagogue préfère `chiffre × valeur` —
   « 4 paquets de mille » — à `valeur × chiffre`) :
     4 × 1000000 + 5 × 100000 + 3 × 10000 + 8 × 1000 + …
   Sens « décomposer » dominant : un FACTEUR/chiffre troué → réponse = le chiffre
   du rang (1 caractère, conforme à la contrainte de saisie). Sens « composer »
   seulement quand le nombre à taper reste ≤ 6 chiffres. */
function decomposeMultiplicativeFact(): Exercise {
	// 5 à 7 chiffres (rangs jusqu'au million, idx 4..6).
	const maxIdx = rnd(4, 6);
	const min = RANGS[maxIdx].place;
	const n = rnd(min, Math.min(9_999_999, min * 10 - 1));
	const terme = (idx: number) => {
		const d = digitAt(n, RANGS[idx].place);
		return `${d} × ${formatNombre(RANGS[idx].place)}`;
	};
	if (rnd(1, 10) <= 2 && n <= 999999) {
		// Composer (minoritaire) : produit-somme → nombre, seulement si ≤ 6 chiffres.
		const termes = [];
		for (let i = maxIdx; i >= 0; i--) termes.push(terme(i));
		return ex(`${termes.join(' + ')} = @`, n);
	}
	// Décomposer (dominant) : un facteur troué, réponse = le chiffre du rang.
	const blank = rnd(0, maxIdx);
	const termes = [];
	for (let i = maxIdx; i >= 0; i--) {
		termes.push(i === blank ? `@ × ${formatNombre(RANGS[i].place)}` : terme(i));
	}
	return ex(`${formatNombre(n)} = ${termes.join(' + ')}`, digitAt(n, RANGS[blank].place));
}

/* ExerciseType mono-mode (rendu fiche/bilan/sprint via le chemin saisie). Le check
   tolère les espaces de groupement de la saisie (« 1 002 050 », #240). */
function positionType(gen: (opts?: GenerateOpts) => Exercise): ExerciseType {
	return {
		generate: (opts?: GenerateOpts) => gen(opts),
		check: checkNumerique,
	};
}

export interface PositionLessonDef extends LessonInput {
	levels?: SchoolLevel[];
}

/* ---------- Étayage de la notion (#490) ----------
   ⚠ Ces leçons montrent leur exemple CANONIQUE, jamais l'item que l'enfant vient de rater,
   et c'est structurel : `genFact` ne rend qu'une chaîne déjà formatée (« 3 472 = 3 milliers
   + @ centaines + … ») — ni le nombre, ni le rang troué, ni même LEQUEL des quatre gestes
   était demandé n'en ressortent. Reconstruire tout ça en relisant l'énoncé serait fragile
   au premier changement de formulation, et se tromper de geste ferait expliquer la mauvaise
   méthode. On préfère un exemple juste à un item deviné.

   Les nombres choisis ne sont pas neutres : `305` porte un zéro intercalaire (le point dur
   du rang vide), `3 472` a quatre rangs distincts, et l'exemple de « la valeur des chiffres »
   déroule le geste « combien EN TOUT » — celui qu'on rate — en le confrontant explicitement
   au « chiffre des », que les enfants lui substituent. */
function etayagePosition(
	titre: string,
	regle: string,
	spec: { genre: 'chiffre' | 'entout' | 'rangs' | 'multiplicative'; n: number; rang: number },
	niveau?: SchoolLevel,
): NonNullable<LessonInput['etayage']>[number] {
	return {
		...(niveau ? { niveau } : {}),
		contenu: { titre, regle, exemple: { moteur: 'position', spec } },
	};
}

const REGLE_RANGS =
	'Chaque chiffre vaut selon sa place : dans 3 472, le 4 ne vaut pas 4, il vaut 4 centaines.';

export const POSITION_LESSONS: PositionLessonDef[] = [
	{
		id: 'num-valeur-position',
		label: 'La valeur des chiffres',
		// CE2 : rangs jusqu'aux centaines/milliers ; CM1 (#240) : jusqu'au million.
		levels: ['ce2', 'cm1'],
		exerciseType: calibrated<number>({ ce2: 3, cm1: 6 }, (maxRang) =>
			positionType(() => valeurPositionFact(maxRang)),
		),
		etayage: [
			etayagePosition(
				'Le chiffre des centaines, et les centaines en tout',
				'« Le chiffre des centaines » est UNE case. « Combien de centaines en tout » compte tous les paquets de cent du nombre.',
				{ genre: 'entout', n: 3472, rang: 2 },
			),
		],
	},
	{
		id: 'num-decompose-100',
		label: 'Je décompose jusqu’à 100',
		exerciseType: positionType(() => decomposeFact(1)),
		etayage: [
			etayagePosition('Décomposer un nombre à deux chiffres', REGLE_RANGS, {
				genre: 'rangs',
				n: 47,
				rang: 1,
			}),
		],
	},
	{
		id: 'num-decompose-1000',
		label: 'Je décompose jusqu’à 1 000',
		exerciseType: positionType(() => decomposeFact(2)),
		// 305 : le zéro intercalaire, point dur de la décomposition (« il n'y a rien » n'est
		// pas « il n'y a pas de rang »).
		etayage: [
			etayagePosition('Décomposer un nombre à trois chiffres', REGLE_RANGS, {
				genre: 'rangs',
				n: 305,
				rang: 2,
			}),
		],
	},
	{
		id: 'num-decompose-10000',
		label: 'Je décompose jusqu’à 10 000',
		// CE2 : décomposition « en rangs » jusqu'à 10 000 ; CM1 (#240) : jusqu'au million.
		levels: ['ce2', 'cm1'],
		exerciseType: calibrated<number>({ ce2: 3, cm1: 6 }, (maxIdx) =>
			positionType(() => decomposeFact(maxIdx)),
		),
		// Deux entrées : la leçon change de plage selon la classe (4 chiffres au CE2, jusqu'au
		// million au CM1), et un exemple à 4 chiffres n'apprendrait rien à un CM1 qui bute sur
		// les dizaines de mille. C'est exactement ce que la dimension `niveau` sert à faire.
		etayage: [
			etayagePosition('Décomposer un nombre à quatre chiffres', REGLE_RANGS, {
				genre: 'rangs',
				n: 3472,
				rang: 2,
			}),
			etayagePosition(
				'Décomposer un grand nombre',
				'Chaque chiffre vaut selon sa place, y compris au-delà du millier : dizaines de mille, centaines de mille, millions.',
				{ genre: 'rangs', n: 48205, rang: 3 },
				'cm1',
			),
		],
	},
	{
		// Nouvelle leçon CM1 (#240) : décomposition MULTIPLICATIVE « chiffre × valeur
		// de rang ». Distincte de la décompo « en rangs » (CE2). CM1 uniquement.
		id: 'num-decompose-multiplicative',
		label: 'Je décompose avec les multiplications',
		levels: ['cm1'],
		exerciseType: positionType(decomposeMultiplicativeFact),
		etayage: [
			etayagePosition(
				'Décomposer avec des multiplications',
				"Un chiffre vaut sa valeur multipliée par son rang : le 4 des centaines, c'est 4 × 100.",
				{ genre: 'multiplicative', n: 48205, rang: 3 },
			),
		],
	},
];
