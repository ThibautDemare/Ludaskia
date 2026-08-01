/* ============================================================
   Numération — situer un nombre (NUM7/8/11, #98 ; grands nombres CM1, #240).
   Trois leçons : comparer, encadrer/intercaler, et la même chose
   jusqu'à 10 000 (CE2) / jusqu'au million (CM1). Chaque leçon expose
   DEUX modes (#69) :
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
   - intercaler (#446) : écarts VARIÉS mélangés dans la même leçon et
     correction PAR INTERVALLE (relation d'ordre OUVERTE a < x < b, comme au
     CM1) — ~18 % serré (2-4, échauffement successeur/prédécesseur), ~50 %
     moyen (6-30, le plus formateur, dont la moitié en « charnière » : les
     bornes traversent une centaine — 396 → 405 — voire un millier sur la
     plage 4 chiffres), ~32 % large (100 à 900, plafonné par la plage).
     Tirée par les DEUX leçons qui couvrent une plage (999 et 9999) : le
     programme CE2 associe comparer/encadrer/intercaler sur toute la plage.
   - tuiles : 3 à 4 tuiles, distracteurs = erreurs typiques (avant/après
     confondus, saut de rang, nombre non arrondi, recopie d'une borne).

   Extension CM1 « grands nombres » (#240) — plafond = LE MILLION
   (7 chiffres, max 9 999 999 ; le milliard est réservé au CM2) :
   - les plages CE2 sont GELÉES (invariant absolu) ; seule la clé `cm1`
     des tables `calibrated` est ajoutée. `levels` se dérive des clés.
   - la génération CM1 couvre un MÉLANGE de 5, 6 et 7 chiffres (pas que
     des 7-chiffres « pleins »), avec pondération vers les cas formateurs
     (zéros intercalaires, passages de classe), cf. grandFact.
   - tous les grands nombres AFFICHÉS sont groupés par classes de 3 via
     `formatNombre` (espace fine insécable U+202F) ; jamais de virgule.
   - SAISIE : on ne fait jamais TAPER un nombre > 6 chiffres. La comparaison
     est un signe ; l'encadrement vise des multiples ronds du rang ;
     l'intercalation passe à un CHECK PAR INTERVALLE (toute valeur dans
     l'intervalle, le nombre rond du milieu reste ≤ 6 chiffres en saisie).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption, GenerateOpts } from '../../core/exercise';
import type { LessonInput } from '../_shared';
import type { SchoolLevel } from '../../core/catalog';
import { calibrated } from '../../core/level-combinators';
import { rnd, choice, sample } from '../../core/utils';
import { formatNombre, nettoyerSaisieNombre } from '../../core/nombres';
import { intervalleAPlusieursReponses } from '../../core/items';

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
   et le jeu de tuiles (réponse + distracteurs) pour le mode tuiles. Pour
   l'intercalation aux grandes plages (#240), `intervalle` porte les bornes
   exclues : la correction (saisie) accepte alors toute valeur strictement dedans. */
interface Fact {
	question: string;
	answer: string;
	tuiles: string[];
	parle?: string; // texte lu si l'énoncé affiché est symbolique (#42 ; ex. « 34 @ 56 »)
	intervalle?: [number, number];
	// Intercaler (#446) : vrai quand l'intervalle ouvert admet PLUSIEURS réponses au sens du
	// langage (au moins trois entiers, écart ≥ 4 — seuil partagé par le cœur, cf.
	// `intervalleAPlusieursReponses` : « plusieurs » pour deux valeurs serait impropre). Le
	// suffixe « (plusieurs réponses possibles) » n'est PAS concaténé ici : il est recomposé
	// sur la consigne AFFICHÉE, en SAISIE seulement, par numerationType.generate() — jamais
	// en tuiles, où une seule tuile est valide (le runner tuiles ajoute, lui, une mention
	// « d'autres nombres auraient aussi convenu » APRÈS la réponse).
	plusieurs?: boolean;
}

function signe(a: number, b: number): string {
	return a < b ? '<' : a > b ? '>' : '=';
}

/* Tuiles distinctes (chaînes), réponse incluse, mélangées, plafonnées à 4. Les
   valeurs sont formatées (groupes de 3) pour un affichage cohérent avec l'énoncé. */
function tuilesParmi(valeurs: number[], answer: number): string[] {
	const uniques = [...new Set([answer, ...valeurs].filter((v) => v > 0))];
	const distracteurs = uniques.filter((v) => v !== answer);
	const choisis = [answer, ...sample(distracteurs, Math.min(3, distracteurs.length))];
	return sample(choisis, choisis.length).map(formatNombre);
}

/* ---------- Génération d'un grand nombre CM1 (#240) ----------
   Cible les cas formateurs plutôt que des 7-chiffres « pleins » : un mélange de
   5, 6 et 7 chiffres, avec sur-représentation des zéros intercalaires et des
   « pleines » comparaisons rang par rang. Évite les nombres ronds (réservés aux
   bornes d'encadrement). Plafond strict : 9 999 999.
   Pondération visée : ~40 % zéro(s) intercalaire(s), ~25 % charnières de classe,
   ~25 % comparaison « pleine », ~10 % nombres ronds. */
function tailleAleatoire(): 5 | 6 | 7 {
	return choice<5 | 6 | 7>([5, 6, 7]);
}

/* Nombre « plein » à `chiffres` chiffres, chaque rang tiré (1ᵉʳ chiffre ≥ 1). */
function nombrePlein(chiffres: number): number {
	let n = rnd(1, 9);
	for (let i = 1; i < chiffres; i++) n = n * 10 + rnd(0, 9);
	return n;
}

/* Nombre à `chiffres` chiffres avec une ou plusieurs CLASSES nulles au milieu
   (zéro intercalaire formateur : « 1 002 050 », « 3 000 047 »). On part d'un
   nombre plein puis on annule des rangs intermédiaires. */
function nombreZeroIntercalaire(chiffres: number): number {
	const ch = ('' + nombrePlein(chiffres)).split('');
	// Annule 1 à 2 rangs internes (ni le 1ᵉʳ, qui doit rester ≥ 1, ni forcément le dernier).
	const interne = ch.length - 1; // indices 1..interne-1 sont « au milieu »
	const combien = rnd(1, 2);
	for (let k = 0; k < combien; k++) {
		const i = rnd(1, Math.max(1, interne));
		ch[i] = '0';
	}
	return Number(ch.join(''));
}

/* Nombre rond (multiple d'une classe) : utile en bornes, peu ailleurs. */
function nombreRond(chiffres: number): number {
	const classe = choice([1000, 10000, 100000]);
	const haut = nombrePlein(chiffres);
	return Math.max(classe, Math.floor(haut / classe) * classe);
}

/* Tire un grand nombre CM1 selon la pondération formatrice (hors charnières,
   gérées au cas par cas par compareFact). Plafonné à 9 999 999. */
function grandNombre(): number {
	const r = rnd(1, 100);
	const chiffres = tailleAleatoire();
	let n: number;
	if (r <= 45)
		n = nombreZeroIntercalaire(chiffres); // zéro(s) intercalaire(s) — formateur
	else if (r <= 88)
		n = nombrePlein(chiffres); // comparaison « pleine »
	else n = nombreRond(chiffres); // nombres ronds (minoritaires)
	return Math.min(9_999_999, Math.max(10_000, n));
}

/* ---------- Comparer ---------- */
// Un nombre « à chiffres de tête égaux » à `a` : on garde tout sauf les deux
// derniers chiffres → force la comparaison rang par rang (dizaines/unités).
function memeTete(a: number): number {
	return a - (a % 100) + rnd(0, 99);
}

/* Comparaison CE2 : nombres ≤ max (3-4 chiffres). Plages GELÉES. */
function compareFactPetit(max: number): Fact {
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
	return makeCompareFact(a, b);
}

/* Comparaison CM1 « grands nombres » (#240) : mélange de tailles, avec charnières
   de classe (99 999/100 000, 999 999/1 000 000) et comparaisons « pleines ». */
function compareFactGrand(): Fact {
	let a: number, b: number;
	const r = rnd(1, 100);
	if (r <= 18) {
		// égalité
		a = grandNombre();
		b = a;
	} else if (r <= 43) {
		// charnière de classe : 99 999/100 000 ou 999 999/1 000 000 (longueurs ≠)
		const charniere = choice([100_000, 1_000_000]);
		const petit = charniere - rnd(1, 9999) - 1; // un cran sous la barre, longueur inférieure
		const grand = charniere + rnd(0, 9999);
		[a, b] = rnd(0, 1) === 0 ? [petit, grand] : [grand, petit];
	} else {
		// comparaison « pleine » rang par rang (souvent tête égale)
		a = grandNombre();
		b = rnd(0, 1) === 0 ? memeTeteGrand(a) : grandNombre();
	}
	return makeCompareFact(a, b);
}

/* Variante « même tête » pour les grands nombres : garde tout sauf les 3 derniers
   chiffres → force la comparaison sur la dernière classe. */
function memeTeteGrand(a: number): number {
	return a - (a % 1000) + rnd(0, 999);
}

function makeCompareFact(a: number, b: number): Fact {
	// Texte lu (#42) : « 34 @ 56 » est illisible à voix haute ; on nomme la tâche
	// sans donner le signe (la réponse). Les nombres sont groupés (formatNombre).
	return {
		// Consigne d'action dans l'énoncé (#265) : « Compare : » dit quoi faire et marche
		// en saisie (on tape le signe) ET en tuiles (on glisse <, =, >) ; « {a} @ {b} »
		// seul était muet (ni verbe, ni indice de ce qu'on attend dans le trou).
		question: `Compare : ${formatNombre(a)} @ ${formatNombre(b)}`,
		answer: signe(a, b),
		tuiles: ['<', '=', '>'],
		parle: `Compare ${a} et ${b}.`,
	};
}

/* ---------- Encadrer ---------- */
// Rangs nommés (#240 : étendus à la dizaine/centaine de mille et au million).
// « mille » est invariable ; les accords du pluriel sont gérés à l'affichage.
const RANG_MOT: Record<number, string> = {
	10: 'dizaine',
	100: 'centaine',
	1000: 'millier',
	10000: 'dizaine de mille',
	100000: 'centaine de mille',
	1000000: 'million',
};

// Article du rang (« le millier / le million » vs « la dizaine / la centaine »).
function articleRang(rang: number): string {
	return rang === 1000 || rang === 1000000 ? 'Le' : 'La';
}

/* Encadrement : « la dizaine / centaine / ... juste avant / après n », réponse
   unique = le multiple du rang juste avant ou après. Le(s) rang(s) demandé(s)
   sont fournis par la leçon, indexés sur la taille du nombre (#240). */
function encadreFact(max: number, rangs: number[]): Fact {
	const rang = choice(rangs);
	let n = rnd(rang + 1, max);
	while (n % rang === 0) n = rnd(rang + 1, max); // n strictement entre deux multiples
	const inf = Math.floor(n / rang) * rang;
	const sup = inf + rang;
	const apres = rnd(0, 1) === 0;
	const answer = apres ? sup : inf;
	const mot = RANG_MOT[rang];
	const article = articleRang(rang);
	const question = `${article} ${mot} juste ${apres ? 'après' : 'avant'} ${formatNombre(n)} : @`;
	// Distracteurs : l'autre borne (confusion avant/après), un saut de rang, et le
	// nombre lui-même (resté « collé », pas arrondi au rang entier).
	const tuiles = tuilesParmi([apres ? inf : sup, answer + (apres ? rang : -rang), n], answer);
	return { question, answer: String(answer), tuiles };
}

/* Rangs d'encadrement selon le nombre de chiffres (#240) :
   - ≤ 4 chiffres (CE2) : pilotés par la leçon (dizaine/centaine/millier) ;
   - 5 chiffres : millier & dizaine de mille ;
   - 6 chiffres : dizaine de mille & centaine de mille ;
   - 7 chiffres : centaine de mille & million. */
function rangsEncadrePour(chiffres: number): number[] {
	if (chiffres <= 4) return [10, 100, 1000];
	if (chiffres === 5) return [1000, 10000];
	if (chiffres === 6) return [10000, 100000];
	return [100000, 1000000];
}

/* Encadrement CM1 « grands nombres » : on tire d'abord une taille, puis les rangs
   adaptés ; le nombre encadré a bien cette taille (rng dans [10^(c-1), 10^c-1]). On
   plafonne la borne SUPÉRIEURE de l'encadrement à 9 999 999 (le « million juste
   après » d'un nombre proche de 10 000 000 sortirait sinon de la plage CM1, #240) :
   on borne n à 9 999 999 − rang pour que sup = inf + rang reste dans la plage. */
function encadreFactGrand(): Fact {
	const chiffres = tailleAleatoire();
	const rangs = rangsEncadrePour(chiffres);
	const minN = 10 ** (chiffres - 1);
	const rang = choice(rangs);
	const maxN = Math.min(10 ** chiffres - 1, 9_999_999 - rang);
	let n = rnd(minN, maxN);
	while (n % rang === 0) n = rnd(minN, maxN);
	const inf = Math.floor(n / rang) * rang;
	const sup = inf + rang;
	const apres = rnd(0, 1) === 0;
	const answer = apres ? sup : inf;
	const mot = RANG_MOT[rang];
	const article = articleRang(rang);
	const question = `${article} ${mot} juste ${apres ? 'après' : 'avant'} ${formatNombre(n)} : @`;
	const tuiles = tuilesParmi([apres ? inf : sup, answer + (apres ? rang : -rang), n], answer);
	return { question, answer: String(answer), tuiles };
}

/* ---------- Intercaler ---------- */
/* Un exemple de réponse SIMPLE strictement à l'intérieur de ]a ; b[ : le 1ᵉʳ multiple
   rond (centaine puis dizaine) qui y tombe, sinon le milieu entier (toujours interne
   dès que l'écart ≥ 2). Sert au mode tuiles (bonne tuile) et à la révélation. */
function exempleInterne(a: number, b: number): number {
	for (const pas of [100, 10]) {
		const cand = Math.floor(a / pas) * pas + pas; // 1ᵉʳ multiple de `pas` strictement > a
		if (cand < b) return cand;
	}
	return Math.floor((a + b) / 2);
}

/* Fait « intercaler » COMMUN aux deux niveaux (#446) — mutualise la mise en forme entre
   le CE2 (intercaleFact) et le CM1 (intercaleFactGrand). Question de BASE, sans le suffixe
   « (plusieurs réponses possibles) » : ce suffixe est recomposé PAR MODE dans
   numerationType.generate() (saisie seulement). Correction PAR INTERVALLE ouvert (champ
   `intervalle`) ; `plusieurs` vrai quand l'intervalle admet plus d'un entier (écart ≥ 3).
   `answer` = un exemple valide (révélation + mode tuiles). */
function makeIntercaleFact(a: number, b: number, exemple: number, tuiles: string[]): Fact {
	return {
		question: `Place un nombre entre ${formatNombre(a)} et ${formatNombre(b)} : @`,
		answer: String(exemple),
		tuiles,
		intervalle: [a, b],
		plusieurs: intervalleAPlusieursReponses([a, b]),
	};
}

/* Borne basse d'un cas « CHARNIÈRE » (#446, avis pedagogue-primaire) : les deux bornes
   encadrent un multiple de `pas`, si bien que l'enfant doit franchir un rang (396 → 405,
   3 987 → 4 002) au lieu de répondre mécaniquement « borne basse + 1 ». C'est le cas
   classique des manuels CE2, jusqu'ici laissé au hasard.
   On tire la charnière `c` (multiple de `pas` strictement entre les bornes possibles), puis
   on décale la borne basse de `d` sous elle, avec d ≤ écart−1 pour que la borne haute passe
   au-dessus de `c`. Renvoie null si aucun placement ne tient dans [100 ; max] (repli sur un
   tirage libre par l'appelant) — jamais en pratique aux plages CE2. */
function borneAvantCharniere(pas: number, ecart: number, max: number): number | null {
	// c > a ≥ 100 → c ≥ 101 ; c < b ≤ max → c ≤ max − 1.
	const kMin = Math.ceil(101 / pas);
	const kMax = Math.floor((max - 1) / pas);
	if (kMin > kMax) return null;
	const c = rnd(kMin, kMax) * pas;
	const dMin = Math.max(1, c + ecart - max); // b = a + écart ≤ max
	const dMax = Math.min(ecart - 1, c - 100); // b > c, et a ≥ 100
	if (dMin > dMax) return null;
	return c - rnd(dMin, dMax);
}

/* Rang traversé par un cas « charnière » : la CENTAINE, et le MILLIER dès que la plage de
   la leçon le permet (num-situer-10000). Pas la dizaine : un écart moyen (6-30) en traverse
   déjà une presque toujours (systématiquement dès 10) — la difficulté est ailleurs. */
function pasCharniere(max: number): number {
	return max >= 1000 ? choice([100, 1000]) : 100;
}

/* CE2 (#446) : écarts VARIÉS et correction PAR INTERVALLE (comme au CM1). Trois paliers
   mélangés dans la même leçon (pondération façon compareFactPetit) : ~18 % serré (2-4,
   échauffement), ~50 % moyen (6-30, le plus formateur), ~32 % large (100 à 900, plafonné
   par la plage — donc au plus 899 sur une plage de 999). Une moitié environ du palier moyen
   est tirée en « CHARNIÈRE » (bornes de part et d'autre d'une centaine, voire d'un millier
   sur la plage 4 chiffres) : sans ça, « borne basse + 1 » suffit toujours et l'ordre de
   grandeur n'est jamais interrogé. L'intervalle est OUVERT : la correction accepte TOUTE
   valeur strictement entre les bornes (champ `intervalle`, honoré par numerationType.check
   ET par checkItemAnswer côté fiche/sprint/révision). Bornes et réponse ≤ max. */
function intercaleFact(max: number): Fact {
	const r = rnd(1, 100);
	let ecart: number;
	let large = false;
	let charniere = false;
	if (r <= 18)
		ecart = rnd(2, 4); // serré : successeur/prédécesseur immédiat (échauffement)
	else if (r <= 68) {
		ecart = rnd(6, 30); // moyen : plusieurs réponses, même ordre de grandeur
		charniere = rnd(0, 1) === 0; // ~la moitié du palier : franchissement de rang garanti
	} else {
		large = true;
		ecart = rnd(100, Math.min(900, max - 100)); // large : franchit un rang par sa taille
	}
	// Borne basse : placée sous une charnière quand le palier moyen l'a tirée, sinon libre.
	const aCharniere = charniere ? borneAvantCharniere(pasCharniere(max), ecart, max) : null;
	const a = aCharniere ?? rnd(100, max - ecart); // borne basse (≥ 3 chiffres)
	const b = a + ecart; // borne haute (≤ max)
	const exemple = exempleInterne(a, b);
	// Distracteurs (mode tuiles) couvrant les erreurs typiques : une BORNE (intervalle
	// ouvert → exclue), une valeur HORS intervalle — au-DESSUS comme au-DESSOUS de la bande,
	// tirée au hasard, pour éprouver les deux sens de débordement (le dépassement par le haut
	// n'était jamais montré) — et, au palier large, un nombre au mauvais nombre de chiffres
	// (ordre de grandeur perdu). Toujours de VRAIES formes, et jamais au-delà de la plage.
	const k = rnd(1, 5);
	const hors = b + k <= max && rnd(0, 1) === 0 ? b + k : a - k; // a ≥ 100 ⇒ a − k > 0
	const distracteurs = large
		? [rnd(0, 1) === 0 ? a : b, hors, Math.floor(exemple / 10)]
		: [a, b, hors];
	return makeIntercaleFact(a, b, exemple, tuilesParmi(distracteurs, exemple));
}

/* CM1 « grands nombres » (#240) : intercaler entre deux multiples CONSÉCUTIFS du
   rang adapté (ex. 610 000 < ? < 620 000). La correction (saisie) accepte TOUTE
   valeur strictement dans l'intervalle (champ `intervalle`). `answer` = un exemple
   simple (le milieu rond, ≤ 6 chiffres saisis) pour la révélation / le mode tuiles.
   Comme le CE2, l'intervalle admet toujours plusieurs entiers (écart = rang ≥ 1000) :
   le suffixe « (plusieurs réponses possibles) » s'affiche donc en SAISIE (recomposé par
   generate() via `plusieurs`, calculé par makeIntercaleFact), jamais en tuiles (#446). */
function intercaleFactGrand(): Fact {
	const chiffres = tailleAleatoire();
	// On reste sur le rang « intermédiaire » de la taille pour que les bornes soient
	// des multiples ronds et que l'exemple à saisir tienne en ≤ 6 chiffres.
	const rang = chiffres === 5 ? 1000 : chiffres === 6 ? 10000 : 100000;
	const maxK = Math.floor((10 ** chiffres - 1) / rang) - 1;
	const k = rnd(1, Math.max(1, maxK));
	const a = k * rang; // borne basse (multiple rond)
	const b = a + rang; // borne haute (multiple rond consécutif)
	// Exemple de réponse : un nombre rond au milieu de l'intervalle (≤ 6 chiffres
	// saisis car le rang est ≥ 1000 → le « milieu » a peu de chiffres significatifs).
	const exemple = a + Math.floor(rang / 2);
	// Distracteurs tuiles : les bornes recopiées (hors intervalle ouvert) et un voisin
	// au-delà ; la bonne tuile (exemple) est bien dans l'intervalle.
	return makeIntercaleFact(a, b, exemple, tuilesParmi([a, b, b + rang], exemple));
}

/* Consigne d'intercalation AFFICHÉE en mode SAISIE (#446) : insère « (plusieurs réponses
   possibles) » avant le trou quand l'intervalle admet plus d'un entier (`plusieurs`).
   JAMAIS en tuiles (appelée seulement par la branche saisie de generate). Ne touche que
   les faits « intercaler » : `plusieurs` est absent des faits comparer/encadrer, qui sont
   donc renvoyés inchangés — l'ancrage ` : @` en fin de consigne cible le seul trou final. */
function consigneIntercaleSaisie(f: Fact): string {
	return f.plusieurs
		? f.question.replace(/ : @$/, ' (plusieurs réponses possibles) : @')
		: f.question;
}

/* Leçon « situer un nombre jusqu'à 10 000 » au CE2 : les TROIS gestes de la relation
   d'ordre, à parts égales sur la plage 4 chiffres. L'intercalation y manquait (#446) alors
   que l'attendu CE2 associe comparer / encadrer / intercaler sur toute la plage : l'enfant
   n'intercalait jamais un nombre à 4 chiffres, et jamais au-dessus d'un millier
   (3 987 → 4 002, garanti par le cas « charnière » du palier moyen). */
function situerFactPetit(): Fact {
	const r = rnd(1, 3);
	if (r === 1) return compareFactPetit(9999);
	if (r === 2) return encadreFact(9999, [10, 100, 1000]);
	return intercaleFact(9999);
}

/* Vrai si la réponse d'un fait est numérique (encadrer/intercaler) plutôt qu'un
   signe (comparer). Sert au catalogue à choisir kind 'num' vs 'text'. */
export function answerEstNumerique(answer: string): boolean {
	return answer.trim() !== '' && !Number.isNaN(Number(answer.replace(',', '.')));
}

/* Fabrique l'ExerciseType d'une leçon : `genFact` tire le type de question.
   Le `check` (partagé par tous les niveaux via `calibrated`, pris sur le plus bas
   niveau) :
   - tolère les espaces de groupement dans la saisie (« 1 002 050 ») via
     nettoyerSaisieNombre, pour ne pas pénaliser un enfant qui recopie le nombre
     groupé affiché ;
   - accepte TOUTE valeur strictement dans l'intervalle quand l'exercice en porte
     un (intercaler : #240 au CM1, #446 au CE2) ; sinon compare à `answer` (réponse
     unique : comparer, encadrer, valeur de position…). */
function numerationType(genFact: () => Fact): ExerciseType {
	return {
		modes: MODES,
		generate(opts?: GenerateOpts): Exercise {
			const mode = opts?.mode;
			const f = genFact();
			if (mode === 'tuiles') {
				// La bonne tuile porte le libellé FORMATÉ (groupes de 3) comme les autres
				// tuiles (tuilesParmi formate déjà) : le runner compare `placed === answer`
				// par libellé exact, donc l'answer tuiles doit être ce libellé formaté. Le
				// signe (<, =, >) de la comparaison n'est pas numérique → laissé tel quel.
				const answerTuile = answerEstNumerique(f.answer)
					? formatNombre(Number(f.answer))
					: f.answer;
				// Consigne NUE (question de base) : une seule TUILE est valide → pas de suffixe
				// « plusieurs réponses possibles » avant de répondre, qui ferait chercher une
				// seconde tuile juste (#446, avis designer-ux-enfant). L'intervalle est tout de
				// même transmis, INFORMATIF : le runner de tuiles dit APRÈS coup que d'autres
				// nombres auraient convenu, et journalise la bande pour le parent.
				return {
					type: 'tuilesNombre',
					question: f.question,
					answer: answerTuile,
					tuiles: f.tuiles,
					parle: f.parle,
					intervalle: f.intervalle,
				};
			}
			return {
				type: 'text',
				// SAISIE : on recompose le suffixe « (plusieurs réponses possibles) » quand
				// l'intervalle admet plusieurs réponses (#446). `parle` restant absent, le TTS
				// dérive de cette consigne affichée → audio cohérent avec l'écrit, par mode.
				question: consigneIntercaleSaisie(f),
				answer: f.answer,
				parle: f.parle,
				intervalle: f.intervalle,
			};
		},
		check(exercise: Exercise, input: string): boolean {
			if (!('answer' in exercise)) return false;
			// `answer` peut être groupé (mode tuiles : « 1 000 ») : on le déspatialise
			// aussi avant test, comme la saisie, pour rester robuste quel que soit le mode.
			const aBrut = nettoyerSaisieNombre(exercise.answer);
			if (!answerEstNumerique(aBrut)) {
				// Comparaison : un signe (<, =, >), comparé tel quel.
				return input.trim() === exercise.answer;
			}
			const saisi = Number(nettoyerSaisieNombre(input).replace(',', '.'));
			if (Number.isNaN(saisi)) return false;
			// Intercaler en SAISIE (#240 CM1, #446 CE2) : toute valeur STRICTEMENT dans
			// l'intervalle. En TUILES, l'intervalle n'est qu'informatif : une seule tuile
			// est valide (les autres sont hors bande) → comparaison de libellés ci-dessous.
			if (exercise.type === 'text' && exercise.intervalle) {
				const [min, max] = exercise.intervalle;
				return saisi > min && saisi < max;
			}
			// Sinon réponse unique (encadrer, comparer, valeur de position…) ou tuile posée.
			return saisi === Number(aBrut);
		},
	};
}

export interface NumerationLessonDef extends LessonInput {
	levels?: SchoolLevel[];
}

export const NUMERATION_LESSONS: NumerationLessonDef[] = [
	{
		id: 'num-comparer',
		label: 'Je compare les nombres',
		// Multi-niveaux « calibré » (#225) : CE2 compare jusqu'à 999 (3 chiffres),
		// CM1 jusqu'au million (#240). Même leçon, même id, génération recalibrée.
		levels: ['ce2', 'cm1'],
		exerciseType: calibrated<'petit' | 'grand'>({ ce2: 'petit', cm1: 'grand' }, (taille) =>
			numerationType(() => (taille === 'grand' ? compareFactGrand() : compareFactPetit(999))),
		),
	},
	{
		id: 'num-encadrer-intercaler',
		label: "J'encadre et j'intercale",
		// CE2 : encadrement dizaine/centaine + intercalation à écarts variés, corrigée par
		// intervalle ouvert (#446). CM1 (#240) : grandes plages — encadrement au rang adapté,
		// intercalation entre deux multiples ronds consécutifs.
		levels: ['ce2', 'cm1'],
		exerciseType: calibrated<'petit' | 'grand'>({ ce2: 'petit', cm1: 'grand' }, (taille) =>
			numerationType(() =>
				taille === 'grand'
					? rnd(1, 10) <= 6
						? encadreFactGrand()
						: intercaleFactGrand()
					: rnd(1, 10) <= 6
						? encadreFact(999, [10, 100])
						: intercaleFact(999),
			),
		),
	},
	{
		id: 'num-situer-10000',
		// Libellé (#446) : les TROIS verbes du programme (« Comparer, encadrer, intercaler des
		// nombres entiers », cf. docs/reference/programmes/ce2-maths.md) — « Je compare et
		// j'encadre… » en annonçait deux sur trois. Pas de verbe chapeau (« je situe ») : il
		// inventerait un 4ᵉ terme et ferait lire une compétence nouvelle, là où cette leçon
		// est la SUITE des deux précédentes (mêmes gestes, nombres plus grands). 1ʳᵉ personne
		// comme ses voisines : une série homogène se survole plus vite.
		label: "Je compare, j'encadre, j'intercale jusqu'à 10 000",
		// CE2 : 4 chiffres réservés à cette leçon ; encadrement aussi au millier.
		// CM1 (#240) : grandes plages (comparer/encadrer jusqu'au million).
		levels: ['ce2', 'cm1'],
		exerciseType: calibrated<'petit' | 'grand'>({ ce2: 'petit', cm1: 'grand' }, (taille) =>
			numerationType(() =>
				taille === 'grand'
					? rnd(0, 1) === 0
						? compareFactGrand()
						: encadreFactGrand()
					: situerFactPetit(),
			),
		),
	},
];
