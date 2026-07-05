/* ============================================================
   Nombres décimaux CM1 (#246) — premier contact avec le nombre décimal général.
   Leçons à `levels: ['cm1']` UNIQUEMENT (le CE2 ne connaît le décimal que via la
   monnaie ; il ne bouge pas). Module PUR (aucun DOM, aucun effet de bord à l'import).

   Contraintes de fond (programme 2025, docs/reference/programmes/cm1-maths.md §1.3,
   tranchées par pedagogue-primaire) :
   - BORNE DURE : centièmes AU PLUS (« au plus deux chiffres après la virgule »).
     Le générateur ne produit JAMAIS de nombre à 3+ décimales (les millièmes sont
     CM2). Un décimal est représenté en CENTIÈMES (entier) → impossible d'excéder.
   - entrée « douce » : on commence par la numération de position (chiffre des
     dixièmes/centièmes, rôle du zéro) AVANT le drill de comparaison.

   Représentation : un décimal = sa valeur en CENTIÈMES (entier `c`) + le nombre de
   décimales AFFICHÉES (`dec`, 1 ou 2). `dec` porte l'écriture (« 3,4 » vs « 3,40 »),
   pas la valeur. La valeur numérique se compare donc toujours sur `c` (entier), ce
   qui rend « 3,4 » = « 3,40 » (même `c` = 340) mais « 3,4 » ≠ « 3,04 » (340 ≠ 304).

   Correction : aucune leçon ne fait TAPER un décimal — les réponses sont un signe
   (<,=,>), un chiffre de rang (0-9) ou un entier (encadrement). On réutilise donc
   les helpers #346 sans réécrire la correction : `checkNumerique` (chiffre, tolérant
   virgule/point), `checkNumeriqueOuTexte` (comparer/encadrer : entier → numérique,
   signe → égalité de texte normalisée) et `checkAnswer` (QCM oui/non, suite rangée).
   La lecture TTS des décimaux (épellation de la partie décimale) vit dans
   core/tts-text.ts (partagée).

   Cinq leçons, dans l'ordre pédagogique (position → rôle du zéro → comparer →
   encadrer → ranger), toutes en Numération, sous la rubrique « Nombres décimaux ».
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { LessonInput } from '../_shared';
import { MODE_QCM_POINT } from '../_shared';
import { rnd, choice, sample } from '../../core/utils';
import { checkNumerique, checkNumeriqueOuTexte } from '../../core/check-helpers';

/* ---------- Représentation d'un décimal ---------- */

/* Un décimal = sa valeur en CENTIÈMES (`c`, entier) + le nombre de décimales
   AFFICHÉES (`dec`). `dec: 1` n'est légitime que si `c % 10 === 0` (le rang des
   centièmes est nul) ; la génération le garantit. */
interface Dec {
	c: number; // valeur en centièmes (« 3,04 » → 304 ; « 3,4 » = « 3,40 » → 340)
	dec: 1 | 2; // décimales affichées (1 → « 3,4 » ; 2 → « 3,04 » / « 3,40 »)
}

/* Écriture à virgule (jamais de point : convention française). */
function affiche(d: Dec): string {
	const ent = Math.floor(d.c / 100);
	const frac = d.c % 100;
	if (d.dec === 1) return `${ent},${Math.round(frac / 10)}`;
	return `${ent},${String(frac).padStart(2, '0')}`;
}

/* Chiffres de rang. `unite` reste < 100 ici (nombres décimaux « premier contact »
   à partie entière modeste), donc le chiffre des unités suffit côté partie entière. */
const chiffreUnite = (d: Dec) => Math.floor(d.c / 100) % 10;
const chiffreDixieme = (d: Dec) => Math.floor((d.c % 100) / 10);
const chiffreCentieme = (d: Dec) => d.c % 10;

/* Signe de comparaison, calculé sur la VALEUR (centièmes) → « 3,4 » = « 3,40 ». */
const signe = (a: number, b: number): string => (a < b ? '<' : a > b ? '>' : '=');

/* ---------- Modes ---------- */

/* Deux modes (saisie/tuiles) pour comparer et encadrer, calqués sur la numération
   des entiers (#98) : la SAISIE reste la référence (fiche/bilan/sprint), les TUILES
   sont un runner d'écran dédié. */
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

/* ---------- Leçon 1 : numération de position décimale + rôle du zéro ----------
   Saisie mono-mode (comme la valeur de position des entiers) : « chiffre au rang »,
   réponse = UN chiffre (0-9). Discrimine le zéro (« Dans 3,04, chiffre des dixièmes ? »
   → 0), là où une saisie libre « écris le nombre » ne le pourrait pas (3,4 = 3,40). */
const RANGS_DEC: { mot: string; chiffre: (d: Dec) => number }[] = [
	{ mot: 'unité', chiffre: chiffreUnite },
	{ mot: 'dixième', chiffre: chiffreDixieme },
	{ mot: 'centième', chiffre: chiffreCentieme },
];

function positionDecimaleFact(): Exercise {
	const ent = rnd(0, 19);
	const deuxDec = rnd(1, 10) <= 8; // majorité à 2 décimales (le rang des centièmes existe)
	let frac: number;
	if (deuxDec) {
		if (rnd(1, 10) <= 5) {
			// Cas formateur du rôle du zéro : un zéro au dixième (« 3,04 ») OU au centième
			// (« 3,40 »). rnd(1,9) → dixième nul ; rnd(1,9)*10 → centième nul.
			frac = rnd(0, 1) === 0 ? rnd(1, 9) : rnd(1, 9) * 10;
		} else {
			frac = rnd(1, 99);
		}
	} else {
		frac = rnd(1, 9) * 10; // 1 décimale : centièmes nuls
	}
	const d: Dec = { c: ent * 100 + frac, dec: deuxDec ? 2 : 1 };
	// Domine sur les rangs DÉCIMAUX (dixièmes/centièmes) ; l'unité en appoint (~20 %).
	const rangsDispo = deuxDec ? RANGS_DEC : RANGS_DEC.slice(0, 2);
	const r = rnd(1, 10) <= 2 ? RANGS_DEC[0] : choice(rangsDispo.slice(1));
	return {
		type: 'text',
		question: `Dans ${affiche(d)}, quel est le chiffre des ${r.mot}s ? @`,
		answer: String(r.chiffre(d)),
	};
}

function positionType(): ExerciseType {
	return {
		generate: () => positionDecimaleFact(),
		check: checkNumerique, // réponse = un chiffre (0-9)
	};
}

/* ---------- Leçon 2 : « le même nombre ? » (rôle du zéro, QCM oui/non) ----------
   Vrai/Faux ciblé sur le zéro : deux écritures désignent-elles la même valeur ?
   - MÊME nombre : zéro FINAL (« 3,4 » vs « 3,40 ») ;
   - nombres DIFFÉRENTS : zéro MÉDIAN trompeur (« 3,4 » vs « 3,04 »).
   Les deux options (Oui/Non) sont de vraies réponses (aucune faute affichée). */
function egalesFact(): Exercise {
	const ent = rnd(0, 12);
	const dix = rnd(1, 9); // dixième non nul → « 3,4 » a un sens (pas « 3,0 »)
	const meme = rnd(0, 1) === 0;
	const a: Dec = { c: ent * 100 + dix * 10, dec: 1 }; // « 3,4 »
	const b: Dec = meme
		? { c: ent * 100 + dix * 10, dec: 2 } // « 3,40 » (même valeur, zéro final)
		: { c: ent * 100 + dix, dec: 2 }; // « 3,04 » (valeur différente, zéro médian)
	const [x, y] = rnd(0, 1) === 0 ? [a, b] : [b, a];
	const memes = x.c === y.c;
	return {
		type: 'qcm',
		question: `« ${affiche(x)} » et « ${affiche(y)} », est-ce le même nombre ?`,
		answer: memes ? 'Oui' : 'Non',
		choices: ['Oui', 'Non'],
		explication: memes
			? `${affiche(x)} = ${affiche(y)} : un zéro tout à la fin ne change pas le nombre.`
			: `${affiche(x)} n'est pas égal à ${affiche(y)} : un zéro qui n'est pas à la fin change le nombre.`,
		consigne: 'Ces deux écritures désignent-elles le même nombre ?',
		// Lu à voix haute : les décimales sont épelées (core/tts-text) → le zéro médian
		// s'entend (« 3 virgule zéro quatre »), ce qu'un « écris le nombre » masquerait.
		parle: `${affiche(x)} et ${affiche(y)}, est-ce le même nombre ?`,
	};
}

/* ---------- Fait « situer » (comparer / encadrer), 2 modes ---------- */
interface DecFact {
	question: string;
	answer: string;
	tuiles: string[];
	parle?: string;
}

/* Tuiles ENTIÈRES (réponse incluse) : dédupliquées, mélangées, plafonnées à 4.
   Contrairement aux entiers (numeration.ts), on GARDE le 0 (l'entier « juste avant »
   d'un décimal de [0,1[ vaut 0, ex. « juste avant 0,45 » → 0) ; on écarte seulement
   les valeurs négatives. */
function tuilesEntiers(distracteurs: number[], answer: number): string[] {
	const uniques = [...new Set([answer, ...distracteurs])].filter((v) => v >= 0);
	const autres = uniques.filter((v) => v !== answer);
	const choisis = [answer, ...sample(autres, Math.min(3, autres.length))];
	return sample(choisis, choisis.length).map(String);
}

/* ---------- Leçon 3 : comparer les décimaux ----------
   Réponse = un signe (<,=,>). Distracteurs pédagogiques (les deux erreurs
   formatrices), la famille 1 sur-représentée :
   1. parties entières DIFFÉRENTES + décimales trompeuses (le plus petit entier
      porte les plus grandes décimales : « 13,44 » vs « 14,1 ») ;
   2. MÊMES parties entières, décimales de longueurs différentes (« 3,8 » vs « 3,45 »).
   ~18 % d'égalités, CIBLÉES sur des paires à zéro final (« 3,4 » = « 3,40 »). */
function compareDecFact(): DecFact {
	let a: Dec, b: Dec;
	const r = rnd(1, 100);
	if (r <= 18) {
		// Égalité ciblée : zéro final → « = ».
		const ent = rnd(0, 12);
		const dix = rnd(1, 9);
		const c = ent * 100 + dix * 10;
		a = { c, dec: 1 };
		b = { c, dec: 2 };
	} else if (r <= 65) {
		// Famille 1 (sur-représentée) : parties entières différentes, décimales trompeuses.
		const e1 = rnd(0, 11);
		let e2 = rnd(0, 11);
		while (e1 === e2) e2 = rnd(0, 11);
		const petitEnt = Math.min(e1, e2);
		const grandEnt = Math.max(e1, e2);
		// Le plus PETIT entier reçoit de GROSSES décimales, le plus GRAND de petites :
		// l'enfant qui compare « 44 » à « 1 » se trompe en oubliant que 14 > 13.
		a = { c: petitEnt * 100 + rnd(41, 99), dec: 2 }; // ex. 13,44
		b = { c: grandEnt * 100 + rnd(1, 3) * 10, dec: 1 }; // ex. 14,1
	} else {
		// Famille 2 : mêmes parties entières, décimales de longueurs différentes.
		const ent = rnd(0, 12);
		const dix = rnd(1, 9); // « 3,8 » → 380 centièmes (1 décimale)
		let cent = rnd(1, 99); // « 3,45 » → 345 centièmes (2 décimales)
		if (cent === dix * 10) cent = (cent % 99) + 1; // éviter l'égalité fortuite
		a = { c: ent * 100 + dix * 10, dec: 1 };
		b = { c: ent * 100 + cent, dec: 2 };
	}
	const [x, y] = rnd(0, 1) === 0 ? [a, b] : [b, a];
	return {
		question: `Compare : ${affiche(x)} @ ${affiche(y)}`,
		answer: signe(x.c, y.c),
		tuiles: ['<', '=', '>'],
		parle: `Compare ${affiche(x)} et ${affiche(y)}.`,
	};
}

/* ---------- Leçon 4 : encadrer entre deux entiers consécutifs ----------
   « L'entier juste avant / juste après » un décimal → réponse = un ENTIER.
   Distracteurs : la borne inverse (avant/après confondus) ; un saut d'entier ; et,
   quand on demande « juste après » d'un nombre proche d'un rond (« 6,98 »), la borne
   inverse EST la partie entière recopiée (« 6 » au lieu de « 7 »). */
function encadreDecFact(): DecFact {
	const ent = rnd(0, 12);
	// ~40 % « proche d'un rond » (,9x) : renforce le piège de recopie de la partie entière.
	const frac = rnd(1, 10) <= 4 ? rnd(90, 99) : rnd(1, 99);
	const d: Dec = { c: ent * 100 + frac, dec: frac % 10 === 0 ? 1 : 2 };
	const inf = ent; // entier juste avant (partie entière)
	const sup = ent + 1; // entier juste après
	const apres = rnd(0, 1) === 0;
	const answer = apres ? sup : inf;
	const inverse = apres ? inf : sup; // borne inverse (avant/après confondus)
	const saut = apres ? sup + 1 : Math.max(0, inf - 1); // saut d'entier
	return {
		question: `L'entier juste ${apres ? 'après' : 'avant'} ${affiche(d)} : @`,
		answer: String(answer),
		tuiles: tuilesEntiers([inverse, saut], answer),
	};
}

/* Fabrique « situer » : SAISIE (fiche/bilan/sprint) ou TUILES (runner dédié). La
   correction distingue le signe (comparaison, texte exact) de l'entier (encadrement,
   correction numérique tolérante). */
function situerDecType(genFact: () => DecFact): ExerciseType {
	return {
		modes: MODES,
		generate(opts?: GenerateOpts): Exercise {
			const f = genFact();
			if (opts?.mode === 'tuiles') {
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
		// Comparaison → réponse = signe (`^\d+$` faux → `checkAnswer` texte normalisé) ;
		// encadrement → réponse = entier (`^\d+$` vrai → `checkNumerique`). Le helper #346
		// route selon la forme de `answer` : même correction partout, aucune redite inline.
		check: checkNumeriqueOuTexte,
	};
}

/* ---------- Leçon 5 : ranger des décimaux (QCM) ----------
   « Quelle suite est rangée dans l'ordre croissant / décroissant ? » — 3 nombres
   (charge de mémoire de travail maîtrisée, avis spécialiste dys), PAS de
   glisser-déposer : on RÉUTILISE le QCM (aucune interaction motrice nouvelle). Les
   choix sont de VRAIES permutations (aucune faute affichée). Distracteurs : l'ordre
   « naïf » (partie décimale lue comme un entier, quelle que soit sa longueur) et
   l'ordre inverse du bon. La consigne d'action reste visible en permanence. */
function fracEcrite(d: Dec): number {
	return d.dec === 1 ? Math.round((d.c % 100) / 10) : d.c % 100;
}
/* Clé de tri « naïf » : partie entière, puis décimales LUES COMME UN ENTIER
   (« 3,8 » → 8, « 3,45 » → 45) — l'erreur classique. */
function cleNaive(d: Dec): number {
	return Math.floor(d.c / 100) * 1000 + fracEcrite(d);
}

/* Trois décimaux distincts (même partie entière), pensés pour que l'ordre par
   VALEUR diffère de l'ordre « naïf » (sinon le distracteur naïf serait correct). */
function tireNombresARanger(): Dec[] {
	for (let essai = 0; essai < 50; essai++) {
		const ent = rnd(0, 9);
		const cand: Dec[] = [];
		const vus = new Set<number>();
		while (cand.length < 3) {
			const deuxDec = rnd(0, 1) === 0;
			const frac = deuxDec ? rnd(1, 99) : rnd(1, 9) * 10;
			const c = ent * 100 + frac;
			if (vus.has(c)) continue; // valeurs distinctes (jamais « 3,4 » et « 3,40 » ensemble)
			vus.add(c);
			cand.push({ c, dec: deuxDec ? 2 : 1 });
		}
		const parValeur = [...cand]
			.sort((p, q) => p.c - q.c)
			.map((d) => d.c)
			.join(',');
		const parNaif = [...cand]
			.sort((p, q) => cleNaive(p) - cleNaive(q))
			.map((d) => d.c)
			.join(',');
		if (parValeur !== parNaif) return cand; // un vrai piège existe
	}
	// Repli sûr (piège connu) : 3,06 < 3,45 < 3,8 mais « 06 < 45 < 8 » naïvement faux.
	return [
		{ c: 306, dec: 2 },
		{ c: 345, dec: 2 },
		{ c: 380, dec: 1 },
	];
}

function rangerFact(): Exercise {
	const croissant = rnd(0, 1) === 0;
	const nombres = tireNombresARanger();
	const parValeur = [...nombres].sort((p, q) => p.c - q.c);
	const bonOrdre = croissant ? parValeur : [...parValeur].reverse();
	const naif = [...nombres].sort((p, q) => cleNaive(p) - cleNaive(q));
	const naifOrdre = croissant ? naif : [...naif].reverse();
	const inverseOrdre = [...bonOrdre].reverse();
	// Séparateur NEUTRE (« ; ») : on n'affiche aucune (in)égalité, donc aucune « faute »
	// ; l'enfant choisit la suite bien ordonnée, il ne valide pas un signe.
	const enSuite = (arr: Dec[]) => arr.map(affiche).join(' ; ');
	const bon = enSuite(bonOrdre);
	const set = new Set<string>([bon]);
	for (const cand of [naifOrdre, inverseOrdre]) {
		set.add(enSuite(cand));
		if (set.size >= 3) break;
	}
	let garde = 0;
	while (set.size < 3 && garde++ < 50) {
		set.add(enSuite(sample(bonOrdre, bonOrdre.length)));
	}
	return {
		type: 'qcm',
		question: `Quelle suite est rangée dans l'ordre ${croissant ? 'croissant' : 'décroissant'} ?`,
		answer: bon,
		choices: sample([...set], set.size),
		consigne: `Range du plus ${croissant ? 'petit au plus grand' : 'grand au plus petit'}.`,
	};
}

/* ---------- Fabriques QCM ---------- */
function qcmDecType(gen: () => Exercise, label: string): ExerciseType {
	return {
		modes: [{ ...MODE_QCM_POINT, label }],
		generate: () => gen(),
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* ---------- Catalogue des leçons ---------- */
export const DECIMAUX_LESSONS: LessonInput[] = [
	{
		id: 'num-dec-position',
		label: 'Le chiffre des dixièmes et des centièmes',
		exerciseType: positionType(),
	},
	{
		id: 'num-dec-egales',
		label: 'Le même nombre ?',
		exerciseType: qcmDecType(egalesFact, 'Je choisis oui ou non'),
	},
	{
		id: 'num-dec-comparer',
		label: 'Je compare les nombres décimaux',
		exerciseType: situerDecType(compareDecFact),
	},
	{
		id: 'num-dec-encadrer',
		label: "J'encadre entre deux entiers",
		exerciseType: situerDecType(encadreDecFact),
	},
	{
		id: 'num-dec-ranger',
		label: 'Je range les nombres décimaux',
		exerciseType: qcmDecType(rangerFact, 'Je choisis la bonne suite'),
	},
];
