/* ============================================================
   Nombres décimaux CM1 (#247) — écritures équivalentes.
   Poursuit la rubrique « Nombres décimaux » (#246) : on relie les trois écritures
   d'un décimal — FRACTION DÉCIMALE (n/10, n/100), ÉCRITURE À VIRGULE (0,4 ; 3,42) et
   DÉCOMPOSITION (42 + 4/10 + 8/100). Leçons à `levels: ['cm1']` UNIQUEMENT (le CE2 ne
   bouge pas). Module PUR (aucun DOM, aucun effet de bord à l'import).

   Contraintes de fond (programme 2025, docs/reference/programmes/cm1-maths.md §1.2/§1.3,
   cadrées par pedagogue-primaire) :
   - BORNE DURE : centièmes AU PLUS (« au plus deux chiffres après la virgule »). Aucune
     écriture produite ne dépasse 2 décimales ; aucun dénominateur > 100.
   - la VIRGULE est le séparateur décimal (jamais le point) ; aucune écriture n'a de zéro
     final qui ferait coexister deux écritures d'un même nombre (« 0,7 » et « 0,70 » ne
     sont jamais deux choix d'un même QCM — cohérence avec « le même nombre ? » de #246).

   La représentation des décimaux de #246 (decimaux.ts) n'est PAS réutilisée, à dessein :
   #246 AUTORISE le zéro final (« 3,4 » = « 3,40 » EST sa leçon « le même nombre ? »), là où
   #247 l'ÉLIMINE (écritures canoniques, choix distincts EN VALEUR). Ces invariants sont
   opposés — une représentation partagée mêlerait les deux. On garde donc ici des écritures
   locales (`ecritureFrac`, `ecritureDecimal`).

   Correction : on RÉUTILISE les helpers #346 sans réécrire de correction —
   `checkAnswer` (QCM : écritures/fractions comparées comme du texte) et `checkNumerique`
   (décomposition : réponse = un entier, tolérant virgule/point). Les décimaux ne sont
   JAMAIS TAPÉS (comme #246) : ils apparaissent en énoncé ou en choix de QCM, où la
   virgule est maîtrisée — un décimal saisi puis révélé s'afficherait avec un point (item
   numérique), contraire à la convention française. Le sens « composer » (somme de
   fractions décimales → écriture à virgule) est donc un QCM (leçon 4), symétrique de la
   leçon 3 « décomposer » (un terme troué, saisie d'un entier, modèle de position.ts).

   Quatre leçons, dans l'ordre pédagogique : correspondance fraction ↔ virgule (grille
   10×10) → fractions décimales > 1 → décomposition (décomposer) → recomposition (composer).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { LessonInput } from '../_shared';
import { MODE_QCM_POINT } from '../_shared';
import { rnd, sample } from '../../core/utils';
import { checkNumerique } from '../../core/check-helpers';
import { nomFraction, fractionChoiceViews } from '../../core/fraction-text';
import { renderFigure } from '../../core/figures';

/* ---------- Écritures et distracteurs ---------- */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/* Écriture à virgule d'une fraction décimale num/den (den = 10 → 1 décimale ; den = 100
   → 2 décimales). Ex. 42/10 → « 4,2 » ; 305/100 → « 3,05 » ; 342/100 → « 3,42 ». */
function ecritureFrac(num: number, den: number): string {
	if (den === 10) return `${Math.floor(num / 10)},${num % 10}`;
	return `${Math.floor(num / 100)},${pad2(num % 100)}`;
}

/* Écriture à virgule CANONIQUE d'un décimal « ent,(dix)(cent) », sans zéro final : « 3,05 »
   (dixième nul), « 42,4 » (centième nul), « 42,48 », « 3 » (les deux rangs nuls). `cent`
   peut dépasser 9 (distracteur « numérateurs additionnés » : d+c) — reste ≤ 2 décimales. */
function ecritureDecimal(ent: number, dix: number, cent: number): string {
	const cents = dix * 10 + cent;
	if (cents === 0) return `${ent}`;
	if (cents % 10 === 0) return `${ent},${cents / 10}`;
	return `${ent},${pad2(cents)}`;
}

/* Valeur numérique comparable d'une écriture — fraction « n/d » ou décimale « 0,05 ».
   Sert à garantir que deux choix ne désignent JAMAIS le même nombre. */
function valeurEcriture(s: string): number {
	if (s.includes('/')) {
		const [n, d] = s.split('/').map(Number);
		return n / d;
	}
	return Number(s.replace(',', '.'));
}

/* 4 choix de QCM : la réponse + 3 distracteurs de VALEURS toutes distinctes (candidats
   CIBLÉS d'abord — confusion de rang, oubli du zéro de cadrage —, puis un fonds de
   secours pour toujours atteindre 4). La distinction par VALEUR interdit qu'un même
   nombre apparaisse sous deux écritures (« 0,7 » et « 0,70 »). */
function choix4(reponse: string, candidats: string[], secours: string[]): string[] {
	const out = [reponse];
	const vues = new Set<number>([valeurEcriture(reponse)]);
	for (const c of [...candidats, ...secours]) {
		if (out.length >= 4) break;
		const v = valeurEcriture(c);
		if (vues.has(v)) continue;
		vues.add(v);
		out.push(c);
	}
	return sample(out, out.length);
}

/* ---------- Leçon 1 : une fraction, une écriture à virgule (QCM, grille 10×10) ----------
   La grille montre `parts` cases coloriées. On demande soit la FRACTION (n/10 ou n/100),
   soit l'ÉCRITURE à virgule (0,n / 0,0n). ~50 % dixième-seul (lignes pleines, multiples
   de 10 cases), ~50 % centième-seul (1..9 cases) — pas de mélange dixième + centième à ce
   stade (c'est le rôle de la leçon 3). C'est ici que vivent le piège du zéro (4/100 → 0,04
   et non 0,4 : « oubli du zéro de cadrage ») et la confusion de rang (n/100 lu n/10). */
function grilleFact(): Exercise {
	const centieme = rnd(0, 1) === 0;
	const chiffre = rnd(1, 9);
	const voisin = (chiffre % 9) + 1; // 1..9, ≠ chiffre
	const parts = centieme ? chiffre : chiffre * 10;
	const den = centieme ? 100 : 10;
	const autreDen = centieme ? 10 : 100;
	const frac = `${chiffre}/${den}`;
	const ecriture = centieme ? `0,0${chiffre}` : `0,${chiffre}`;
	const figure = renderFigure({ kind: 'grilleCentiemes', parts });
	const casesTexte = `${parts} ${parts > 1 ? 'cases coloriées' : 'case coloriée'} sur 100`;
	const explication = `${casesTexte} → ${nomFraction(chiffre, den)} (${frac}) = ${ecriture}.`;
	if (rnd(0, 1) === 0) {
		// Question FRACTION : distracteur de RANG (n sur l'autre dénominateur) + voisins.
		const choices = choix4(
			frac,
			[`${chiffre}/${autreDen}`, `${voisin}/${den}`, `${voisin}/${autreDen}`],
			['1/10', '3/10', '1/100', '7/100'],
		);
		return {
			type: 'qcm',
			question: 'Quelle fraction est coloriée ?',
			answer: frac,
			choices,
			choicesView: fractionChoiceViews(choices),
			figure,
			explication,
			parle: 'Quelle fraction est coloriée ?',
		};
	}
	// Question ÉCRITURE : distracteur « oubli du zéro de cadrage » (0,0n ↔ 0,n) + voisins.
	const rang = centieme ? `0,${chiffre}` : `0,0${chiffre}`;
	const voisinMeme = centieme ? `0,0${voisin}` : `0,${voisin}`;
	const voisinAutre = centieme ? `0,${voisin}` : `0,0${voisin}`;
	const choices = choix4(ecriture, [rang, voisinMeme, voisinAutre], ['0,1', '0,2', '0,05', '0,07']);
	return {
		type: 'qcm',
		question: 'Quelle écriture à virgule correspond ?',
		answer: ecriture,
		choices,
		figure,
		explication,
		parle: 'Quelle écriture à virgule correspond ?',
	};
}

/* ---------- Leçon 2 : une fraction décimale plus grande que 1 (QCM, deux sens) ----------
   Conversion fraction décimale > 1 ↔ écriture à virgule (42/10 = 4,2 ; 342/100 = 3,42),
   DANS LES DEUX SENS. Centièmes au plus. Distracteur ciblé : la confusion de RANG (même
   numérateur sur l'autre dénominateur : 342/100 vs 342/10) ; voisins = même partie
   décimale, partie entière décalée. Symbolique (pas de figure). */
function fracSuperieureFact(): Exercise {
	const den = rnd(0, 1) === 0 ? 10 : 100;
	const autreDen = den === 10 ? 100 : 10;
	const ent = rnd(1, 9);
	let num: number;
	if (den === 10) {
		num = ent * 10 + rnd(1, 9); // décimale non nulle → 1 décimale « pleine »
	} else {
		let r = rnd(1, 99);
		if (r % 10 === 0) r += 1; // dernier chiffre non nul → 2 décimales sans zéro final
		num = ent * 100 + r; // r < 10 garde un zéro au dixième (« 3,05 ») : rôle du zéro
	}
	const ecriture = ecritureFrac(num, den);
	const frac = `${num}/${den}`;
	if (rnd(0, 1) === 0) {
		// Sens FRACTION → écriture à virgule (choix = écritures décimales).
		const choices = choix4(
			ecriture,
			[ecritureFrac(num, autreDen), ecritureFrac(num + den, den), ecritureFrac(num + 2 * den, den)],
			['1,5', '2,4', '3,25', '5,7'],
		);
		return {
			type: 'qcm',
			question: `Quelle écriture à virgule est égale à ${frac} ?`,
			answer: ecriture,
			choices,
			explication: `${frac} = ${ecriture}.`,
			parle: `Quelle écriture à virgule est égale à ${nomFraction(num, den)} ?`,
		};
	}
	// Sens écriture à virgule → FRACTION décimale (choix = fractions empilées).
	const choices = choix4(
		frac,
		[`${num}/${autreDen}`, `${num + den}/${den}`, `${num + 2 * den}/${den}`],
		['15/10', '24/10', '325/100', '57/10'],
	);
	return {
		type: 'qcm',
		question: `Quelle fraction décimale est égale à ${ecriture} ?`,
		answer: frac,
		choices,
		choicesView: fractionChoiceViews(choices),
		explication: `${ecriture} = ${frac}.`,
		parle: `Quelle fraction décimale est égale à ${ecriture} ?`,
	};
}

/* ---------- Leçon 3 : je décompose un nombre décimal (saisie, un terme troué) ----------
   Décomposition « E + d/10 + c/100 » d'un décimal E,dc (centièmes au plus), sur le modèle
   de la décomposition des entiers (position.ts : un terme troué, réponse = un entier). On
   troue SURTOUT un rang décimal (dixième/centième, cœur de la notion) ; l'entier en
   appoint. Un rang à zéro est formateur (rôle du zéro : « 42,08 = 42 + @/10 + 8/100 » → 0).
   Réponse TOUJOURS un entier (jamais taper un décimal) → checkNumerique. */
function decompo(question: string, answer: number, parle: string): Exercise {
	return { type: 'text', question, answer: String(answer), parle };
}

function decomposeDecFact(): Exercise {
	const ent = rnd(1, 99);
	const d = rnd(0, 9);
	let c = rnd(0, 9);
	if (d === 0 && c === 0) c = rnd(1, 9); // partie décimale non nulle (« 42,00 » dégénéré)
	const ecriture = `${ent},${d}${c}`;
	const termeD = `${d}/10`;
	const termeC = `${c}/100`;
	// `parle` DIFFÉRENCIÉ par rang (à l'audio seul, on doit savoir quel rang est demandé),
	// sur le phrasé déjà validé en #246 (decimaux.ts).
	const r = rnd(1, 8);
	if (r <= 2) {
		// Trou sur l'ENTIER (appoint ~25 %).
		return decompo(
			`${ecriture} = @ + ${termeD} + ${termeC}`,
			ent,
			`Dans ${ecriture}, quel est le nombre entier ?`,
		);
	}
	if (r <= 5) {
		// Trou sur le DIXIÈME (numérateur).
		return decompo(
			`${ecriture} = ${ent} + @/10 + ${termeC}`,
			d,
			`Dans ${ecriture}, quel est le chiffre des dixièmes ?`,
		);
	}
	// Trou sur le CENTIÈME (numérateur).
	return decompo(
		`${ecriture} = ${ent} + ${termeD} + @/100`,
		c,
		`Dans ${ecriture}, quel est le chiffre des centièmes ?`,
	);
}

/* ---------- Leçon 4 : je recompose un nombre décimal (QCM, composer) ----------
   Réciproque de la leçon 3 (programme §1.3 « … et réciproquement ») : on MONTRE une somme
   de fractions décimales (rangs séparés) et on demande l'écriture à virgule, en QCM (un
   décimal ne se tape pas proprement — cf. en-tête). Sommes à 3 termes, avec le zéro de
   cadrage EXPLICITE (« 3 + 0/10 + 5/100 »), ou — minorité facile — à 2 termes (le rang nul
   omis : « 3 + 5/100 »). Distracteurs CIBLÉS (erreurs classiques) : rang inversé (42,84),
   numérateurs additionnés au lieu d'être placés par rang (4 + 8 → 42,12), un rang oublié
   (42,4 / 42,08). Jamais une écriture ÉGALE à la réponse (choix distincts EN VALEUR). */
function recomposeDecFact(): Exercise {
	const ent = rnd(1, 99);
	const d = rnd(0, 9);
	let c = rnd(0, 9);
	if (d === 0 && c === 0) c = rnd(1, 9); // partie décimale non nulle
	const rangNul = d === 0 || c === 0;
	const deuxTermes = rangNul && rnd(1, 10) <= 5; // minorité facile : on omet le rang nul
	const termes: string[] = [`${ent}`];
	if (deuxTermes) {
		if (d > 0) termes.push(`${d}/10`);
		if (c > 0) termes.push(`${c}/100`);
	} else {
		termes.push(`${d}/10`, `${c}/100`); // 3 termes : zéro de cadrage montré (« 0/10 »)
	}
	const somme = termes.join(' + ');
	const reponse = ecritureDecimal(ent, d, c);
	// Distracteurs ciblés (écritures réelles), dédupliqués par valeur via choix4.
	const candidats: string[] = [];
	if (c !== d) candidats.push(ecritureDecimal(ent, c, d)); // rang inversé
	if (d > 0) candidats.push(ecritureDecimal(ent, 0, d + c)); // numérateurs additionnés
	if (c > 0) candidats.push(ecritureDecimal(ent, d, 0)); // centième oublié
	if (d > 0) candidats.push(ecritureDecimal(ent, 0, c)); // dixième oublié
	const choices = choix4(reponse, candidats, [`${ent},5`, `${ent},25`, `${ent + 1},1`, `${ent},7`]);
	// Lecture : les fractions sont nommées verbalement (« quatre dixièmes »), zéro compris.
	const nomRang = (n: number, den: number): string =>
		n === 0 ? `zéro ${den === 10 ? 'dixième' : 'centième'}` : nomFraction(n, den);
	const sommeParle = termes
		.map((term) => {
			if (!term.includes('/')) return term;
			const [n, den] = term.split('/').map(Number);
			return nomRang(n, den);
		})
		.join(' plus ');
	return {
		type: 'qcm',
		question: `${somme} = ?`,
		answer: reponse,
		choices,
		explication: `${somme} = ${reponse}.`,
		parle: `Quelle écriture à virgule est égale à ${sommeParle} ?`,
	};
}

/* ---------- Fabriques d'ExerciseType ---------- */

function qcmType(gen: () => Exercise): ExerciseType {
	const modes: ModeOption[] = [{ ...MODE_QCM_POINT, label: 'Je choisis la bonne réponse' }];
	return { modes, generate: () => gen(), check: checkAnswer };
}

/* ---------- Catalogue des leçons ---------- */
export const DECIMAUX_ECRITURES_LESSONS: LessonInput[] = [
	{
		id: 'num-dec-grille',
		label: 'Une fraction, une écriture à virgule',
		exerciseType: qcmType(grilleFact),
	},
	{
		id: 'num-dec-frac-superieure',
		label: 'Une fraction décimale plus grande que 1',
		exerciseType: qcmType(fracSuperieureFact),
	},
	{
		id: 'num-dec-decomposer',
		label: 'Je décompose un nombre décimal',
		// Mono-mode saisie (rendu fiche/bilan/sprint via le chemin « math moderne » :
		// item numérique). Réponse = un entier → checkNumerique.
		exerciseType: { generate: () => decomposeDecFact(), check: checkNumerique },
	},
	{
		id: 'num-dec-recomposer',
		label: 'Je recompose un nombre décimal',
		exerciseType: qcmType(recomposeDecFact),
	},
];
