/* ============================================================
   Numération — Fractions (#200, programme cycle 2 rénové 2025).
   ------------------------------------------------------------
   Six leçons (rubrique « Fractions »), fractions TOUJOURS < 1
   (numérateur < dénominateur), dénominateur ≤ 12.

   Ordre d'apprentissage (avis pedagogue-primaire) : on installe le
   SENS (fraction d'un tout, puis d'une collection), puis le modèle
   LINÉAIRE (bande graduée), AVANT les égalités, la comparaison et
   l'addition qui s'appuient dessus.
   1. Sens — fraction d'un tout (QCM, barre divisée).
   2. Fraction d'une collection (saisie numérique, jetons groupés).
   3. Fraction sur une bande graduée (QCM, bande 0→1).
   4. Fractions égales (QCM oui/non, deux barres).
   5. Comparer des fractions (QCM, deux barres).
   6. Additionner des fractions de même dénominateur (QCM, deux barres) —
      attendu de fin de CE2 2025 (« additionner et soustraire des
      fractions de même dénominateur »).

   Multi-niveaux (#287) : trois leçons (collection, bande, addition) sont
   `calibrated` par une table { ce2, cm1 } ; le CE2 reste calibré à l'identique
   (sauf rééquilibrages décrits ci-dessous), le CM1 élargit les plages de
   dénominateurs. Le CM1 reste « derrière le paramètre `level` » (le catalogue
   garde `levels: ['ce2']`, cf. catalog.ts) : on le rend juste calibré et
   testable via `generate({ level: 'cm1' })`. La leçon 1 (sens, barre divisée)
   N'est PAS calibrée : elle est purement visuelle et la barre plafonne à 8
   parts (voir DENS_SENS) ; ouvrir le CM1 n'y ajouterait que du verbal sans la
   figure, hors périmètre #287.

   Calibrage (avis pedagogue-primaire) :
   - dénominateurs 2,3,4 d'abord, puis 5,6,8 ; figure plafonnée à 8
     parts pour rester lisible (10/12 réservés au verbal/futur) ;
   - leçon 2 (collection) : le dénominateur DIVISE la collection (résultat
     entier). On NE force PLUS le numérateur 1 dominant : le pédagogue (#287)
     recommande de faire monter les numérateurs > 1 (« deux tiers de », « trois
     quarts de »), pas seulement le partitif pur. On vise ~40 % de num = 1
     (contre ~60 % auparavant) — cf. genCollection ;
   - leçon 4 : égalités à facteur entier simple (×2, ×3), visuellement
     évidentes ; jamais de quasi-égalités comme distracteurs ;
   - leçon 5 : comparaison à appui visuel. Même dénominateur (plus de
     parts = plus grand) OU même numérateur (plus on partage, plus les
     parts sont petites) OU dén/num différents SI l'écart visuel est
     FRANC (≥ ~1/6) — légitime au CE2 avec figure, contrairement à la
     comparaison PAR LE CALCUL (dénominateur commun = CM1). On exclut
     les écarts trop fins (2/5 vs 3/8), pièges injustes sans calcul.

   Le libellé VERBAL (« un demi », « trois quarts »…) est produit par
   `nomFraction` et stocké dans chaque énoncé (`parle`) / explication,
   pour le TTS (#42) — on ne dira jamais « deux sur quatre ».
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';
import { checkAnswer } from '../../core/exercise';
import { checkNumerique } from '../../core/check-helpers';
import { calibrated } from '../../core/level-combinators';
import { rnd, choice, sample } from '../../core/utils';
import { renderFigure } from '../../core/figures';
// Libellé verbal (#42) défini en core (utilitaire nombre→mots, réutilisé par le
// rendu empilé des fractions). Réexposé ici pour les imports/tests existants.
import { nomFraction, nomDenominateur, fractionChoiceViews } from '../../core/fraction-text';
export { nomFraction };

/* ---------- Notation et distracteurs ----------
   `frac()` produit la CLÉ PLATE « num/den » (réponse + comparaison QCM) ; l'affichage
   empilé (barre horizontale, attendu au CE2) est appliqué au rendu par `mathInline`
   (core/fraction-text). On ne stocke donc jamais de HTML dans la donnée. */

const frac = (num: number, den: number): string => `${num}/${den}`;

// Candidat de distracteur : [numérateur, dénominateur, impropreOk?]. `impropreOk`
// autorise une fraction ≥ 1 (réservé à l'inversion numérateur/dénominateur).
type Candidat = [number, number] | [number, number, boolean];

/* Retient les 3 PREMIERS candidats valides, distincts et ≠ réponse (fractions propres,
   sauf candidat marqué impropre). Le fonds générique en fin de liste garantit qu'on
   atteint toujours 3 distracteurs, même dans les cas étroits (ex. 1/2). */
function collecteDistracteurs(ans: string, candidats: Candidat[]): string[] {
	const out: string[] = [];
	for (const [n, d, impropreOk] of candidats) {
		if (out.length >= 3) break;
		if (n < 1 || d < 2 || (!impropreOk && n >= d)) continue;
		const c = frac(n, d);
		if (c === ans || out.includes(c)) continue;
		out.push(c);
	}
	return out;
}

// Petites fractions propres ajoutées en dernier recours (cas étroits).
const FONDS_GENERIQUE: Candidat[] = [
	[1, 3],
	[1, 4],
	[2, 3],
	[3, 4],
	[1, 5],
	[2, 5],
];

/* Distracteurs de NOTATION (avis pédagogique : parts non coloriées, confusion
   numérateur/dénominateur). */
function distracteurs(num: number, den: number): string[] {
	return collecteDistracteurs(frac(num, den), [
		[den - num, den], // les parts NON coloriées
		[den, num, true], // numérateur et dénominateur inversés
		[num, den - num], // coloriées sur non-coloriées (écartée si impropre)
		[num + 1, den], // mauvais comptage d'une part, en haut ou en bas
		[num - 1, den],
		[num, den + 1],
		[num, den - 1],
		...FONDS_GENERIQUE,
	]);
}

/* QCM à 4 choix : réponse + 3 distracteurs, mélangés. */
function qcmChoices(num: number, den: number): string[] {
	return sample([frac(num, den), ...distracteurs(num, den)], 4);
}

/* ---------- Leçon 1 : sens — fraction d'un tout ----------
   NON calibrée par niveau (#287) : leçon purement VISUELLE (barre divisée), dont
   la lisibilité plafonne à 8 parts (10/12 illisibles à l'œil). Élargir au CM1 ne
   pourrait être que verbal — sans la figure, donc hors esprit de cette leçon. On
   la laisse CE2-only (le catalogue garde `levels: ['ce2']`). */
// Dénominateurs pondérés vers les petits ; plafonnés à 8 (lisibilité de la barre).
const DENS_SENS = [2, 2, 3, 3, 4, 4, 5, 6, 8];

function genSens(): Exercise {
	const den = choice(DENS_SENS);
	const num = rnd(1, den - 1);
	const parts = num > 1 ? 'parts coloriées' : 'part coloriée';
	const choices = qcmChoices(num, den);
	return {
		type: 'qcm',
		question: 'Quelle fraction est coloriée ?',
		answer: frac(num, den),
		choices,
		choicesView: fractionChoiceViews(choices),
		figure: renderFigure({ kind: 'fractionBarre', num, den }),
		explication: `${num} ${parts} sur ${den} parts égales → ${nomFraction(num, den)} (${frac(num, den)}).`,
		parle: 'Quelle fraction est coloriée ?',
	};
}

/* ---------- Leçon 2 : fraction d'une collection (saisie numérique) ----------
   Calibrée par niveau (#287). `totalMax` borne la taille de la collection (le
   dénominateur DIVISE le total → résultat entier) ; `parGroupe` est tiré entre 2
   et le plus grand entier ≤ 6 tel que den × parGroupe ≤ totalMax (donc ≥ 2 pour
   tous les dénominateurs des deux niveaux). */
interface CollectionConfig {
	dens: number[];
	totalMax: number;
}

// CE2 : dénominateurs 2–6, collection ≤ 36.
const COLLECTION_CE2: CollectionConfig = { dens: [2, 3, 4, 5, 6], totalMax: 36 };
// CM1 : + dénominateurs 8 et 10, collection ≤ 60.
const COLLECTION_CM1: CollectionConfig = { dens: [2, 3, 4, 5, 6, 8, 10], totalMax: 60 };

/* Numérateur de la collection. On NE force PLUS systématiquement num = 1 (#287) :
   le pédagogue veut faire monter les numérateurs > 1. On garde num = 1 ~1 fois sur
   4 quand le dénominateur le permet (den ≥ 3) ; sinon num est tiré dans 2..den-1.
   Avec les dénominateurs CE2 [2,3,4,5,6] (équiprobables), den = 2 impose num = 1 :
   la part globale de num = 1 ressort à ~40 % (0,2 × 1 + 0,8 × 0,25), contre ~60 %
   auparavant. */
function numCollection(den: number): number {
	if (den === 2) return 1; // 2 → seule fraction propre : un demi
	return rnd(1, 4) === 1 ? 1 : rnd(2, den - 1);
}

function genCollection(config: CollectionConfig): Exercise {
	const den = choice(config.dens);
	// parGroupe entre 2 et le plus grand entier ≤ 6 gardant den × parGroupe ≤ totalMax.
	const parGroupeMax = Math.min(6, Math.floor(config.totalMax / den));
	const parGroupe = rnd(2, parGroupeMax);
	const total = den * parGroupe; // résultat entier garanti (den divise total)
	const num = numCollection(den);
	const res = num * parGroupe;
	return {
		type: 'text',
		question: `Combien font ${frac(num, den)} de ${total} ? @`,
		answer: String(res),
		figure: renderFigure({ kind: 'fractionCollection', num, den, parGroupe }),
		parle: `Combien font ${nomFraction(num, den)} de ${total} ?`,
	};
}

/* ---------- Leçon 3 : fraction sur une bande graduée ----------
   Calibrée par niveau (#287). La bande graduée reste lisible bien au-delà de la
   barre divisée (graduations fines), donc on peut monter jusqu'à 10. */
// CE2 : {2, 3, 4, 6, 8} + 5.
const DENS_BANDE_CE2 = [2, 3, 4, 5, 6, 8];
// CM1 : + 10.
const DENS_BANDE_CM1 = [2, 3, 4, 5, 6, 8, 10];

function genBande(dens: number[]): Exercise {
	const den = choice(dens);
	const num = rnd(1, den - 1);
	const parts = num > 1 ? 'parts' : 'part';
	const choices = qcmChoices(num, den);
	return {
		type: 'qcm',
		question: 'Quelle fraction est marquée sur la bande ?',
		answer: frac(num, den),
		choices,
		choicesView: fractionChoiceViews(choices),
		figure: renderFigure({ kind: 'fractionBande', num, den }),
		explication: `Le repère tombe sur ${nomFraction(num, den)} : ${num} ${parts} sur ${den} (${frac(num, den)}).`,
		parle: 'Quelle fraction est marquée sur la bande ?',
	};
}

/* ---------- Leçon 4 : fractions égales (QCM oui/non, deux barres) ---------- */
type Paire = [[number, number], [number, number]];

// Égalités à facteur entier simple (×2, ×3), visuellement évidentes.
const EGALITES: Paire[] = [
	[
		[1, 2],
		[2, 4],
	],
	[
		[1, 2],
		[3, 6],
	],
	[
		[1, 2],
		[4, 8],
	],
	[
		[1, 3],
		[2, 6],
	],
	[
		[2, 3],
		[4, 6],
	],
	[
		[1, 4],
		[2, 8],
	],
	[
		[3, 4],
		[6, 8],
	],
	[
		[2, 4],
		[4, 8],
	],
	// ----- Ajouts #285 (variété) : égalités évidentes, dénominateur ≤ 8 (CE2). -----
	[
		[2, 4],
		[3, 6],
	],
	[
		[3, 6],
		[4, 8],
	],
	[
		[2, 6],
		[1, 3],
	],
	[
		[4, 6],
		[2, 3],
	],
	[
		[6, 8],
		[3, 4],
	],
];
// Inégalités franches (jamais de quasi-égalité, qui serait un piège injuste).
const INEGALITES: Paire[] = [
	[
		[1, 2],
		[1, 3],
	],
	[
		[1, 2],
		[1, 4],
	],
	[
		[2, 3],
		[1, 3],
	],
	[
		[3, 4],
		[2, 4],
	],
	[
		[1, 4],
		[3, 4],
	],
	[
		[2, 6],
		[1, 2],
	],
	[
		[1, 3],
		[1, 2],
	],
	[
		[3, 8],
		[1, 2],
	],
	// ----- Ajouts #285 (variété) : inégalités à écart visuel franc, dénominateur ≤ 8. -----
	[
		[3, 4],
		[1, 4],
	],
	[
		[1, 2],
		[1, 6],
	],
	[
		[2, 3],
		[1, 6],
	],
	[
		[5, 6],
		[1, 2],
	],
	[
		[3, 8],
		[3, 4],
	],
	[
		[7, 8],
		[1, 4],
	],
];

const OUI = 'Oui, elles sont égales';
const NON = 'Non, elles sont différentes';

function genEgalites(): Exercise {
	const egal = rnd(0, 1) === 0;
	const [a, b] = choice(egal ? EGALITES : INEGALITES);
	const meme = egal
		? 'la même longueur : elles sont égales'
		: 'pas la même longueur : elles sont différentes';
	return {
		type: 'qcm',
		question: 'Les deux barres coloriées montrent-elles la même fraction ?',
		answer: egal ? OUI : NON,
		choices: sample([OUI, NON], 2),
		figure: renderFigure({ kind: 'fractionPaire', haut: a, bas: b }),
		explication: `${frac(a[0], a[1])} et ${frac(b[0], b[1])} colorient ${meme}.`,
		parle: 'Les deux barres coloriées montrent-elles la même fraction ?',
	};
}

/* ---------- Leçon 5 : comparer deux fractions (QCM, deux barres) ----------
   Comparaison à APPUI VISUEL (légitime au CE2). Trois cas, tous à écart visuel
   franc : même dénominateur, même numérateur, ou dén/num différents avec un écart
   de valeur ≥ ~1/6 (on exclut les quasi-égalités type 2/5 vs 3/8, qui exigeraient
   un dénominateur commun — comparaison PAR LE CALCUL, qui relève du CM1). */
const DENS_COMP = [3, 4, 5, 6, 8];
const ECART_MIN = 1 / 6; // écart de valeur minimal pour une comparaison lisible à l'œil

/* Tire une paire candidate selon le mode (1 = même dén, 2 = même num, 3 = dén ET
   num différents). Ne garantit pas l'écart : c'est l'appelant qui filtre. */
function paireComparaison(mode: number): Paire {
	if (mode === 1) {
		const den = choice(DENS_COMP);
		const n1 = rnd(1, den - 1);
		let n2 = rnd(1, den - 1);
		while (n2 === n1) n2 = rnd(1, den - 1);
		return [
			[n1, den],
			[n2, den],
		];
	}
	if (mode === 2) {
		const num = rnd(1, 2); // numérateur commun petit (< dénominateurs)
		const [d1, d2] = sample(
			DENS_COMP.filter((d) => d > num),
			2,
		);
		return [
			[num, d1],
			[num, d2],
		];
	}
	const [d1, d2] = sample(DENS_COMP, 2);
	return [
		[rnd(1, d1 - 1), d1],
		[rnd(1, d2 - 1), d2],
	];
}

const ecartFranc = ([a, b]: Paire): boolean => Math.abs(a[0] / a[1] - b[0] / b[1]) >= ECART_MIN;

function genComparaison(): Exercise {
	const mode = rnd(1, 3);
	// Repli d'écart franc GARANTI (1/2 vs 1/4 = 1/4 ≥ 1/6) : n'est écrasé que par une
	// paire validée, donc l'invariant « écart ≥ 1/6 » tient même si tous les tirages
	// échouent (cas extrême). La garantie est structurelle, pas seulement statistique.
	let a: [number, number] = [1, 2];
	let b: [number, number] = [1, 4];
	for (let essai = 0; essai < 40; essai++) {
		const paire = paireComparaison(mode);
		if (ecartFranc(paire)) {
			[a, b] = paire;
			break;
		}
	}
	const grande = a[0] / a[1] > b[0] / b[1] ? a : b;
	const memeNum = a[0] === b[0];
	const explication = memeNum
		? `Plus il y a de parts, plus chaque part est petite : ${frac(grande[0], grande[1])} est la plus grande.`
		: `Sur la barre, ${frac(grande[0], grande[1])} colorie la plus grande longueur : c'est la plus grande.`;
	const choices = sample([frac(a[0], a[1]), frac(b[0], b[1])], 2);
	return {
		type: 'qcm',
		question: 'Quelle est la plus grande fraction ?',
		answer: frac(grande[0], grande[1]),
		choices,
		choicesView: fractionChoiceViews(choices),
		figure: renderFigure({ kind: 'fractionPaire', haut: a, bas: b }),
		explication,
		parle: 'Quelle est la plus grande fraction ?',
	};
}

/* ---------- Leçon 6 : additionner des fractions de même dénominateur ----------
   Attendu de fin de CE2 2025. On garde le dénominateur, on additionne les
   numérateurs ; résultat < 1 (somme des numérateurs < dénominateur), pour rester
   dans l'invariant « fraction < 1 ». Distracteur central = l'erreur classique
   « on additionne aussi les dénominateurs » (1/4 + 2/4 → 3/8).
   Calibrée par niveau (#287) — l'addition ne dépend d'aucune figure plafonnée, on
   peut monter le dénominateur sans souci de lisibilité. */
// CE2 : {3, 4, 5, 6, 8} + 10.
const DENS_SOMME_CE2 = [3, 4, 5, 6, 8, 10];
// CM1 : + 12.
const DENS_SOMME_CM1 = [3, 4, 5, 6, 8, 10, 12];

function distracteursSomme(n1: number, n2: number, den: number): string[] {
	const somme = n1 + n2;
	return collecteDistracteurs(frac(somme, den), [
		[somme, den + den], // a additionné AUSSI les dénominateurs (erreur classique)
		[somme - 1, den], // numérateur mal additionné
		[somme + 1, den],
		[Math.max(n1, n2), den], // n'a gardé qu'un seul terme
		...FONDS_GENERIQUE,
	]);
}

function genSomme(dens: number[]): Exercise {
	const den = choice(dens);
	const n1 = rnd(1, den - 2);
	const n2 = rnd(1, den - 1 - n1); // n1 + n2 ≤ den - 1 → résultat < 1
	const somme = n1 + n2;
	const choices = sample([frac(somme, den), ...distracteursSomme(n1, n2, den)], 4);
	return {
		type: 'qcm',
		question: `Combien font ${frac(n1, den)} + ${frac(n2, den)} ?`,
		answer: frac(somme, den),
		choices,
		choicesView: fractionChoiceViews(choices),
		figure: renderFigure({ kind: 'fractionSomme', a: [n1, den], b: [n2, den] }),
		explication: `On garde le dénominateur et on additionne les numérateurs : ${n1} + ${n2} = ${somme} → ${frac(somme, den)} (${nomFraction(somme, den)}).`,
		parle: `Combien font ${nomFraction(n1, den)} plus ${nomFraction(n2, den)} ?`,
	};
}

/* ============================================================
   Fractions comme NOMBRES (#249, CM1) — fractions ≥ 1 (impropres), décomposition
   (entier + fraction < 1) et statut de nombre (encadrement entre deux entiers sur une
   demi-droite). Notions du programme 2025 (§1.2), CM1-only : le CE2 reste borné à < 1.
   Dénominateurs pris dans la famille de l'app {2,3,4,5,6,8,(10)} — au-delà les figures
   « plusieurs unités » deviennent illisibles (avis pedagogue-primaire + designer #249).
   Plafond figure : ≤ 2 unités entières (num < 3·den) → barre empilée ≤ 3 barres. ============================================================ */

// Fraction impropre à figure : entier ∈ {1,2} (plafond de la barre empilée), reste ≠ 0.
function fractionImpropre(dens: number[]): [number, number] {
	const den = choice(dens);
	const entier = rnd(1, 2);
	const reste = rnd(1, den - 1); // partie fractionnaire jamais nulle (vraie impropre)
	return [entier * den + reste, den];
}

/* ---------- Leçon 7 : une fraction plus grande que 1 (QCM, aire itérée) ----------
   Lire une fraction impropre sur la figure « plusieurs unités » (barres pleines + reste).
   Distracteurs = erreurs classiques du passage à l'impropre : n'avoir lu que la partie
   fractionnaire (oubli des unités), une unité / une part en trop ou en moins, n'avoir lu
   qu'UNE unité (quand il y en a deux). */
const DENS_SUPERIEURE = [2, 3, 4, 5, 6, 8]; // lisibilité de la barre, comme la leçon « sens »

function distracteursImpropre(num: number, den: number): string[] {
	const reste = num % den;
	return collecteDistracteurs(frac(num, den), [
		[reste, den], // n'a lu que la partie fractionnaire (a oublié les unités entières)
		[num + den, den, true], // une unité de trop
		[num - den, den, true], // une unité de moins
		[num + 1, den, true], // une part de trop
		[num - 1, den, true], // une part de moins
		[den + reste, den, true], // n'a lu qu'UNE unité entière (quand il y en a deux)
		...FONDS_GENERIQUE,
	]);
}

function genSuperieure(): Exercise {
	const [num, den] = fractionImpropre(DENS_SUPERIEURE);
	const entier = Math.floor(num / den);
	const choices = sample([frac(num, den), ...distracteursImpropre(num, den)], 4);
	return {
		type: 'qcm',
		question: 'Quelle fraction est coloriée ?',
		answer: frac(num, den),
		choices,
		choicesView: fractionChoiceViews(choices),
		figure: renderFigure({ kind: 'fractionSuperieure', num, den }),
		explication: `${entier} ${entier > 1 ? 'unités entières' : 'unité entière'} et ${nomFraction(num % den, den)}, cela fait ${nomFraction(num, den)} (${frac(num, den)}).`,
		parle: 'Quelle fraction est coloriée ?',
	};
}

/* ---------- Leçon 8 : je décompose une fraction (saisie, un terme troué) ----------
   Écrire une fraction impropre comme entier + fraction < 1 (27/5 = 5 + 2/5). Sur le modèle
   de la décomposition décimale (#247, `decomposeDecFact`) : réponse TOUJOURS un entier
   (jamais taper une fraction) → checkNumerique. On troue alternativement la partie ENTIÈRE
   (« @ + 2/5 ») ou le NUMÉRATEUR du reste (« 5 + @/5 ») — les deux morceaux du mécanisme
   division/reste. Partie entière ≤ 6 (calcul dans les tables mémorisées) ; figure d'appui
   « aire itérée » tant que la partie entière tient dans le plafond (≤ 2). */
const DENS_DECOMPOSER = [2, 3, 4, 5, 6, 8, 10];

function genDecomposer(): Exercise {
	const den = choice(DENS_DECOMPOSER);
	const entier = rnd(1, 6);
	const reste = rnd(1, den - 1);
	const num = entier * den + reste;
	// Appui visuel seulement quand la figure reste lisible (≤ 2 unités entières) ; au-delà,
	// symbolique (le calcul division/reste s'automatise sur les grandes parties entières).
	const figure = entier <= 2 ? renderFigure({ kind: 'fractionSuperieure', num, den }) : undefined;
	const uniteMot = entier > 1 ? 'unités entières' : 'unité entière';
	if (rnd(0, 1) === 0) {
		// Trou sur la partie ENTIÈRE.
		return {
			type: 'text',
			question: `${frac(num, den)} = @ + ${frac(reste, den)}`,
			answer: String(entier),
			figure,
			parle: `Combien d'unités entières y a-t-il dans ${nomFraction(num, den)} ?`,
		};
	}
	// Trou sur le NUMÉRATEUR du reste (rendu empilé par items.ts, réponse = un chiffre).
	return {
		type: 'text',
		question: `${frac(num, den)} = ${entier} + @/${den}`,
		answer: String(reste),
		figure,
		parle: `Dans ${nomFraction(num, den)}, il y a ${entier} ${uniteMot} et combien de ${nomDenominateur(den, true)} ?`,
	};
}

/* ---------- Leçon 9 : encadrer une fraction (QCM, demi-droite étendue) ----------
   Statut de nombre : entre quels deux entiers CONSÉCUTIFS tombe la fraction ? Figure =
   demi-droite 0→3 (le repère à num/den, fraction dans (1,3)). Distracteurs : voisins
   immédiats (± une unité) et une paire NON consécutive (erreur sur le sens de l'encadrement).
   Aucune figure ne « souffle » : lire entre quels entiers tombe le repère EST la compétence. */
const DENS_ENCADRER = [2, 3, 4, 5, 6, 8];
const ENCADRER_UNITES = 3; // demi-droite 0→3 (fraction impropre dans (1,3))

function genEncadrer(): Exercise {
	const [num, den] = fractionImpropre(DENS_ENCADRER); // entier ∈ {1,2} → fraction dans (1,3)
	const bas = Math.floor(num / den);
	const bornes = (b: number): string => `entre ${b} et ${b + 1}`;
	const answer = bornes(bas);
	const choices = sample(
		[answer, bornes(bas - 1), bornes(bas + 1), `entre ${bas} et ${bas + 2}`],
		4,
	);
	return {
		type: 'qcm',
		question: `Entre quels nombres entiers se trouve ${frac(num, den)} ?`,
		answer,
		choices,
		figure: renderFigure({ kind: 'fractionDemiDroite', num, den, unites: ENCADRER_UNITES }),
		explication: `${nomFraction(num, den)} vaut ${bas} et ${nomFraction(num % den, den)} : elle est ${answer}.`,
		parle: `Entre quels nombres entiers se trouve ${nomFraction(num, den)} ?`,
	};
}

/* ---------- Fabriques d'ExerciseType ---------- */

const MODE_QCM: ModeOption[] = [{ ...MODE_QCM_POINT, label: 'Je choisis la bonne fraction' }];

function qcmType(generate: () => Exercise): ExerciseType {
	return { modes: MODE_QCM, generate, check: checkAnswer };
}

/* Mono-mode saisie (rendu fiche/bilan via le chemin « math moderne » : item numérique). */
function saisieNumType(generate: () => Exercise): ExerciseType {
	return { generate, check: checkNumerique };
}

/* Marque un ExerciseType comme CM1-only (#249) : le catalogue en dérive `levels: ['cm1']`,
   donc la leçon n'apparaît PAS au CE2 (fractions ≥ 1 hors programme CE2). */
function cm1Only(base: ExerciseType): ExerciseType {
	return { ...base, levels: ['cm1'] };
}

export const FRACTIONS_LESSONS: LessonInput[] = [
	// Leçon 1 (sens) : NON calibrée — purement visuelle, barre ≤ 8 parts (cf. DENS_SENS).
	{ id: 'num-frac-sens', label: 'Lire une fraction', exerciseType: qcmType(genSens) },
	{
		id: 'num-frac-collection',
		label: "Fraction d'une collection",
		exerciseType: calibrated<CollectionConfig>(
			{ ce2: COLLECTION_CE2, cm1: COLLECTION_CM1 },
			(config) => saisieNumType(() => genCollection(config)),
		),
	},
	{
		id: 'num-frac-bande',
		label: 'Fraction sur une bande',
		exerciseType: calibrated<number[]>({ ce2: DENS_BANDE_CE2, cm1: DENS_BANDE_CM1 }, (dens) =>
			qcmType(() => genBande(dens)),
		),
	},
	{ id: 'num-frac-egalites', label: 'Fractions égales', exerciseType: qcmType(genEgalites) },
	{
		id: 'num-frac-comparaison',
		label: 'Comparer des fractions',
		exerciseType: qcmType(genComparaison),
	},
	{
		id: 'num-frac-addition',
		label: 'Additionner des fractions',
		exerciseType: calibrated<number[]>({ ce2: DENS_SOMME_CE2, cm1: DENS_SOMME_CM1 }, (dens) =>
			qcmType(() => genSomme(dens)),
		),
	},
	// ---- Fractions comme NOMBRES (#249) : CM1-only (fractions ≥ 1, hors programme CE2). ----
	{
		id: 'num-frac-superieure',
		label: 'Une fraction plus grande que 1',
		exerciseType: cm1Only(qcmType(genSuperieure)),
	},
	{
		id: 'num-frac-decomposer',
		label: 'Je décompose une fraction',
		exerciseType: cm1Only(saisieNumType(genDecomposer)),
	},
	{
		id: 'num-frac-encadrer',
		label: 'Encadrer une fraction',
		exerciseType: cm1Only(qcmType(genEncadrer)),
	},
];
