/* ============================================================
   Division par le sens (#104, #95) — Calcul mental CE2.
   Au CE2, la division s'aborde par le SENS (partage équitable et groupement),
   jamais en technique posée (= CM1). Elle s'adosse aux tables (réciproque de la
   multiplication) ; le signe ÷ n'apparaît JAMAIS seul, toujours précédé d'une
   phrase qui décrit la situation. La découverte du RESTE (#95) est un attendu
   CE2 (quotient + reste en calcul réfléchi) ; seule la division POSÉE reste CM1.
   Conception pédagogique : avis pedagogue-primaire (#104, #95).

   Trois leçons :
   1. « Moitié et quart d'une collection » — fraction-opérateur (dénominateurs 2
      et 4), résultat entier garanti. Pas de signe ÷, pas de figure. Calibrée par
      niveau (#287) : CE2 moitié X ≤ 50 / quart X ≤ 48, CM1 jusqu'à X ≤ 100.
   2. « Je partage » — division EXACTE (reste nul) dans les tables, DEUX sens
      (partage / groupement) contrastés, signe ÷ adossé à la situation. Figure
      « situation de départ » (jetons + paniers vides) sur une minorité d'items
      de découverte (total ≤ 12) — exclue du sprint (cf. catalog).
   3. « Je découvre le reste » (#95) — partages/groupements AVEC reste : l'enfant
      donne le résultat du partage ET le reste. Deux modes : saisie (runner
      « problème » → feedback par champ, réussite tout-ou-rien) et QCM (accessible).
      Exclue du sprint.
   ============================================================ */
import { choice, rnd, sample } from '../../core/utils';
import { checkAnswer } from '../../core/exercise';
import { checkNumerique } from '../../core/check-helpers';
import type { Exercise, ExerciseType } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';
import { calibrated } from '../../core/level-combinators';
import { renderFigure } from '../../core/figures';

/* ---------- Leçon 1 : Moitié et quart d'une collection ---------- */
// Fraction-opérateur (« prendre la moitié / le quart de »), distincte du signe ÷
// (leçon 2). Résultat entier garanti par tirage d'un multiple ; quotient ≥ 2.
// Calibrée par niveau (#287) : seules les bornes du quotient (donc du dividende X)
// changent. CE2 : moitié X ≤ 50 (quotient 2–25), quart X ≤ 48 (quotient 2–12) ;
// CM1 : moitié ET quart jusqu'à X ≤ 100 (quotient 2–50 / 2–25). Le CM1 reste prêt
// derrière le paramètre `level` (non surfacé au catalogue, déploiement séparé).
interface MoitieQuartConfig {
	moitieQuotientMax: number; // borne max du résultat de « la moitié de X » (X = 2·q)
	quartQuotientMax: number; // borne max du résultat de « le quart de X » (X = 4·q)
}

function moitieQuartType(config: MoitieQuartConfig): ExerciseType {
	return {
		generate(): Exercise {
			if (rnd(0, 1) === 0) {
				const q = rnd(2, config.moitieQuotientMax); // résultat 2..max (X = 2·q)
				return { type: 'text', question: `La moitié de ${q * 2} = @`, answer: String(q) };
			}
			const q = rnd(2, config.quartQuotientMax); // résultat 2..max (X = 4·q)
			return { type: 'text', question: `Le quart de ${q * 4} = @`, answer: String(q) };
		},
		check: checkNumerique,
	};
}

/* ---------- Leçon 2 : Je partage ---------- */
// Diviseur privilégié au début : tables solides (2, 5, 10) puis 3, 4, puis le
// reste — pondération par répétition dans le pool (avis pédagogue).
const POOL_DIVISEUR = [2, 2, 2, 5, 5, 5, 10, 10, 3, 3, 4, 4, 6, 7, 8, 9];

// Tire (diviseur, quotient) : division exacte, diviseur ≥ 2, quotient ≥ 2,
// dividende = diviseur × quotient ≤ 100, le tout dans les tables (≤ 10).
function tirePartition(): { diviseur: number; quotient: number; total: number } {
	const diviseur = choice(POOL_DIVISEUR);
	const quotient = rnd(2, Math.min(10, Math.floor(100 / diviseur)));
	return { diviseur, quotient, total: diviseur * quotient };
}

function partageType(): ExerciseType {
	return {
		generate(): Exercise {
			const { diviseur, quotient, total } = tirePartition();
			const groupement = rnd(0, 1) === 0;

			if (groupement) {
				// GROUPEMENT (quotition) : on connaît la TAILLE d'un paquet, on cherche le
				// NOMBRE de paquets. Marqueurs : « par paquets de … » → « combien de … ».
				// (taille = quotient, nombre de paquets = diviseur → réponse = diviseur)
				const taille = quotient;
				const nbPaquets = diviseur;
				const phrase = `On range ${total} jetons par paquets de ${taille}.`;
				// Variante « question en mots » (parallèle à la découverte du partage) :
				// l'inconnue est nommée, le ÷ n'est introduit que sur les autres items.
				const enMots = rnd(0, 9) < 4;
				return {
					type: 'text',
					question: enMots
						? `${phrase} Combien de paquets ? @`
						: `${phrase} ${total} ÷ ${taille} = @`,
					answer: String(nbPaquets),
				};
			}

			// PARTAGE (partition) : on connaît le NOMBRE de parts, on cherche la VALEUR
			// d'une part. Marqueurs : « partager en … » → « dans chaque … ».
			// Figure « situation de départ » sur une minorité d'items de découverte
			// (total ≤ 12) : jetons en vrac + paniers VIDES, sans donner la réponse.
			const decouverte = total <= 12 && rnd(0, 9) < 4;
			if (decouverte) {
				return {
					type: 'text',
					question: `On partage ${total} jetons en ${diviseur} paniers égaux. Combien de jetons dans chaque panier ? @`,
					answer: String(quotient),
					figure: renderFigure({ kind: 'groupes', paniers: diviseur, total }),
				};
			}
			return {
				type: 'text',
				question: `On partage ${total} jetons en ${diviseur} paniers égaux. ${total} ÷ ${diviseur} = @`,
				answer: String(quotient),
			};
		},
		check: checkNumerique,
	};
}

/* ---------- Leçon 3 : Je découvre le reste (#95) ----------
   Division euclidienne par le SENS : partages/groupements où il RESTE des objets.
   L'enfant donne deux réponses (le résultat du partage ET le reste). Calcul réfléchi
   adossé aux tables, JAMAIS la division posée (= CM1). Invariants garantis :
   reste < diviseur, diviseur ≤ 9 (tables), total ≤ 81. Restes nuls mélangés (~1/3,
   jamais < ~30 % — « reste 0 » est un cas parmi d'autres ; une rampe adaptative
   pourra venir plus tard, cf. #95). */
const POOL_DIVISEUR_RESTE = [2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9];

function tirePartitionReste(): {
	diviseur: number;
	quotient: number;
	reste: number;
	total: number;
} {
	const diviseur = choice(POOL_DIVISEUR_RESTE);
	// q borné pour garder total (= d·q + reste, reste ≤ d−1) ≤ 81, et q ≤ 9 (tables).
	const quotient = rnd(2, Math.min(9, Math.floor((81 - (diviseur - 1)) / diviseur)));
	// ~1/3 de restes nuls : la division exacte reste un cas parmi d'autres.
	const reste = rnd(0, 2) === 0 ? 0 : rnd(1, diviseur - 1);
	return { diviseur, quotient, reste, total: diviseur * quotient + reste };
}

// Item « problème » à deux sous-questions (résultat du partage puis reste), corrigé
// CHAMP PAR CHAMP par le runner. Deux sens contrastés ; le signe ÷ (~moitié des
// items) n'apparaît jamais seul, toujours après la phrase de situation.
function genResteProbleme(): Exercise {
	const { diviseur, quotient, reste, total } = tirePartitionReste();
	const groupement = rnd(0, 1) === 0;
	const avecSigne = rnd(0, 1) === 0;

	if (groupement) {
		// GROUPEMENT : paquets de taille `diviseur` ; on cherche le NOMBRE de paquets
		// complets (= quotient) et ce qu'il reste. reste < taille d'un paquet.
		let enonce = `On range ${total} jetons par paquets de ${diviseur}.`;
		if (avecSigne) enonce += ` On calcule ${total} ÷ ${diviseur}.`;
		return {
			type: 'probleme',
			enonce,
			etapes: [
				{ question: 'Combien de paquets complets peut-on faire ?', answer: quotient },
				{ question: 'Combien de jetons reste-t-il ?', answer: reste },
			],
			parle: `On range ${total} jetons par paquets de ${diviseur}. Combien de paquets complets peut-on faire ? Et combien de jetons reste-t-il ?`,
			// Pas de figure en groupement : renderGroupes illustre un partage (paniers).
		};
	}

	// PARTAGE : `diviseur` paniers égaux ; on cherche la part d'UN panier (= quotient)
	// et ce qu'il reste. reste < nombre de paniers. Figure de découverte (jetons +
	// paniers vides) sur une minorité de petits nombres, comme « Je partage ».
	const figure =
		total <= 12 && diviseur <= 6 && rnd(0, 9) < 4
			? renderFigure({ kind: 'groupes', paniers: diviseur, total })
			: undefined;
	let enonce = `On partage ${total} jetons en ${diviseur} paniers égaux.`;
	if (avecSigne) enonce += ` On calcule ${total} ÷ ${diviseur}.`;
	return {
		type: 'probleme',
		enonce,
		etapes: [
			{ question: 'Combien de jetons dans chaque panier ?', answer: quotient },
			{ question: 'Combien de jetons reste-t-il ?', answer: reste },
		],
		parle: `On partage ${total} jetons en ${diviseur} paniers égaux. Combien de jetons dans chaque panier ? Et combien de jetons reste-t-il ?`,
		figure,
	};
}

// Réponse QCM combinée « résultat + reste » (chaîne comparée telle quelle).
const fmtQR = (q: number, r: number): string => `${q} et il reste ${r}`;

// Variante QCM (mode accessible) : une question, 4 choix. Distracteurs = erreurs
// classiques (résultat ±1, reste ±1, et surtout « reste ≥ diviseur » : on aurait pu
// continuer le partage).
function genResteQcm(): Exercise {
	const { diviseur, quotient, reste, total } = tirePartitionReste();
	const groupement = rnd(0, 1) === 0;
	const question = groupement
		? `On range ${total} jetons par paquets de ${diviseur}. Combien de paquets complets peut-on faire ? Et combien de jetons reste-t-il ?`
		: `On partage ${total} jetons en ${diviseur} paniers égaux. Combien de jetons dans chaque panier ? Et combien de jetons reste-t-il ?`;
	const parle = question; // énoncé déjà complet et sans symbole : lu tel quel par le TTS
	const correct = fmtQR(quotient, reste);
	const candidats = [
		fmtQR(quotient + 1, reste),
		quotient > 1 ? fmtQR(quotient - 1, reste) : fmtQR(quotient + 2, reste),
		fmtQR(quotient, reste + 1), // reste+1 : peut atteindre le diviseur → erreur typique
		reste > 0 ? fmtQR(quotient, reste - 1) : fmtQR(quotient + 2, reste),
		fmtQR(quotient > 1 ? quotient - 1 : quotient, reste + diviseur), // reste ≥ diviseur
	].filter((c) => c !== correct);
	const distracteurs = sample([...new Set(candidats)], 3);
	return {
		type: 'qcm',
		question,
		answer: correct,
		choices: sample([correct, ...distracteurs], distracteurs.length + 1),
		parle,
	};
}

/* Fabrique commune aux deux leçons « quotient + reste » (CE2 « Je découvre le reste »
   et CM1 « division euclidienne ») : même charpente de runner « problème » à deux
   sous-questions — mode saisie recommandé + variante QCM accessible, vocabulaire
   « calcul » sans badge « Étape » (les deux champs sont nommés), et `checkAnswer` (qui
   renvoie false pour un item `probleme` : le runner corrige champ par champ en lisant
   `etapes[].answer`, cf. #199/#348). Seuls le libellé de saisie, les deux générateurs
   et le(s) niveau(x) distinguent une leçon de l'autre. */
function deuxSousQuestionsType(opts: {
	labelSaisie: string;
	generateProbleme: () => Exercise;
	generateQcm: () => Exercise;
	levels?: SchoolLevel[];
}): ExerciseType {
	return {
		...(opts.levels ? { levels: opts.levels } : {}),
		// Format « problème » par défaut (#199/#348) : generate() sans mode produit un
		// item `probleme` (le QCM est une variante) → classé et exclu du sprint.
		exerciseKind: 'probleme',
		modes: [
			{
				id: 'saisie',
				label: opts.labelSaisie,
				hint: 'deux réponses',
				icon: 'pencil',
				recommended: true,
			},
			{ ...MODE_QCM_POINT, hint: 'parmi 4', recommended: false },
		],
		probLexique: { nom: 'Calcul', nomPluriel: 'calculs', badgeEtape: false },
		generate: (o) => (o?.mode === 'qcm' ? opts.generateQcm() : opts.generateProbleme()),
		check: checkAnswer,
	};
}

function resteType(): ExerciseType {
	return deuxSousQuestionsType({
		labelSaisie: "J'écris le résultat et le reste",
		generateProbleme: genResteProbleme,
		generateQcm: genResteQcm,
	});
}

/* ---------- Leçon 4 : Division euclidienne — quotient et reste (CM1, #251) ----------
   Registre ABSTRAIT-NUMÉRIQUE (cœur de la différence avec le CE2 « Je découvre le
   reste ») : on entraîne le RÉSULTAT de la division euclidienne (le quotient ET le
   reste) en calcul réfléchi, JAMAIS le geste de la division posée. Trois formes
   d'énoncé, sans figure ni narration lourde :
   - « Dans 58, combien de fois 7 ? Et combien reste-t-il ? » (cœur) ;
   - égalité à trous « 58 = 7 × ? + ? » (le lien structurel dividende = d·q + r) ;
   - un contexte court d'appoint (minorité), sans jetons/paniers scalés du CE2.

   Runner « problème » à DEUX sous-questions (quotient puis reste), corrigé CHAMP
   PAR CHAMP (les deux champs visibles à la fois → aucun libellé ne révèle l'autre
   réponse). Variante QCM accessible : distracteurs = erreurs classiques, en TÊTE le
   piège « reste ≥ diviseur » (l'enfant qui aurait pu continuer à diviser).

   Plage : diviseur ∈ [2, 9] ; dividende à 2 chiffres (10..99, JAMAIS 3 chiffres =
   territoire du posé). Le quotient PEUT dépasser 9 (2 chiffres) — marqueur CM1 :
   ~40 % des items le forcent quand c'est possible. Restes : ~1/3 nuls (comme au CE2),
   sinon uniforme dans [1, diviseur−1] (couvre le cas-frontière reste = diviseur−1).
   Invariant 0 ≤ reste < diviseur garanti par construction.

   INVARIANT PROJET : (quotient, reste) sont CALCULÉS à la génération puis STOCKÉS
   (`etapes[].answer` en saisie, chaîne `answer` en QCM), jamais recalculés au `check`.
   CM1-only ; exclue du sprint (deux champs + lecture d'énoncé). */
const POOL_DIVISEUR_EUCLIDIENNE = [2, 3, 4, 5, 6, 7, 8, 9];
const PLAFOND_EUCLIDIENNE = 99; // dividende à 2 chiffres (jamais 3 = territoire du posé)
// Objets masculins pluriels à initiale CONSONNE : la forme « contexte court » les
// insère après « de/des » sans élision (« de gâteaux », « de timbres ») et « restants »
// s'accorde de la même façon pour tous.
const OBJETS_EUCLIDIENNE = ['bonbons', 'crayons', 'gâteaux', 'timbres'];

function tireEuclidienne(): {
	diviseur: number;
	quotient: number;
	reste: number;
	dividende: number;
} {
	const diviseur = choice(POOL_DIVISEUR_EUCLIDIENNE);
	// q borné pour un dividende à 2 chiffres : q·d ≥ 10 (min) et d·q + (d−1) ≤ 99 (max).
	const quotientMin = Math.max(2, Math.ceil(10 / diviseur));
	const quotientMax = Math.floor((PLAFOND_EUCLIDIENNE - (diviseur - 1)) / diviseur);
	// ~40 % d'items forcent un quotient à 2 chiffres (marqueur CM1 : le quotient PEUT
	// dépasser 9). quotientMax ≥ 10 pour tout diviseur de [2, 9] → toujours possible.
	const deuxChiffres = quotientMax >= 10 && rnd(0, 9) < 4;
	const quotient = deuxChiffres
		? rnd(Math.max(10, quotientMin), quotientMax)
		: rnd(quotientMin, quotientMax);
	// ~1/3 de restes nuls ; sinon uniforme dans [1, diviseur−1] (couvre reste = diviseur−1).
	const reste = rnd(0, 2) === 0 ? 0 : rnd(1, diviseur - 1);
	return { diviseur, quotient, reste, dividende: diviseur * quotient + reste };
}

// Item « problème » à deux sous-questions (quotient puis reste), corrigé champ par
// champ. Les deux champs sont affichés ensemble : aucun libellé ne cite la valeur de
// l'autre réponse. Trois formes contrastées (le contexte court reste minoritaire).
function genEuclidienneProbleme(): Exercise {
	const { diviseur, quotient, reste, dividende } = tireEuclidienne();
	const forme = rnd(0, 9); // 0-3 : « combien de fois » ; 4-6 : égalité ; 7-9 : contexte

	if (forme <= 3) {
		// Forme « combien de fois » (abstrait-numérique, cœur de la leçon).
		return {
			type: 'probleme',
			enonce: `Dans ${dividende}, combien de fois ${diviseur} ? Et combien reste-t-il ?`,
			etapes: [
				{ question: `Combien de fois ${diviseur} dans ${dividende} ?`, answer: quotient },
				{ question: 'Combien reste-t-il ?', answer: reste },
			],
			parle: `Dans ${dividende}, combien de fois ${diviseur} ? Et combien reste-t-il ?`,
		};
	}

	if (forme <= 6) {
		// Forme « égalité à trous » : dividende = diviseur × quotient + reste. Les libellés
		// ne citent pas les valeurs (les deux champs sont visibles) → aucune fuite.
		return {
			type: 'probleme',
			enonce: `Complète l'égalité : ${dividende} = ${diviseur} × ? + ?`,
			etapes: [
				{ question: 'Le quotient (× combien ?)', answer: quotient },
				{ question: 'Le reste (+ combien ?)', answer: reste },
			],
			parle: `${dividende} égale ${diviseur} multiplié par combien, plus combien ? Trouve d'abord le quotient, puis le reste.`,
		};
	}

	// Forme « contexte court » (appoint, minorité) : sans figure, sans narration lourde.
	// Groupement : boîtes de taille `diviseur` ; reste = ce qui ne remplit pas une boîte.
	const objet = choice(OBJETS_EUCLIDIENNE);
	return {
		type: 'probleme',
		enonce: `On range ${dividende} ${objet} dans des boîtes de ${diviseur}.`,
		etapes: [
			// Libellé identique au fragment lu par le TTS (comme la sœur CE2), pas de
			// divergence texte-vu / texte-entendu.
			{ question: 'Combien de boîtes pleines peut-on faire ?', answer: quotient },
			{ question: `Combien de ${objet} restants ?`, answer: reste },
		],
		parle: `On range ${dividende} ${objet} dans des boîtes de ${diviseur}. Combien de boîtes pleines peut-on faire ? Et combien de ${objet} restants ?`,
	};
}

// Variante QCM (mode accessible) : une question, 4 choix. En TÊTE des distracteurs, le
// piège « reste ≥ diviseur » (on aurait pu continuer à diviser) ; les autres = quotient
// ±1 / reste ±1. Réponse combinée LUE dans l'item (jamais recalculée au check).
function genEuclidienneQcm(): Exercise {
	const { diviseur, quotient, reste, dividende } = tireEuclidienne();
	const question = `Dans ${dividende}, combien de fois ${diviseur} ? Et combien reste-t-il ?`;
	const correct = fmtQR(quotient, reste);
	// Distracteur PRIORITAIRE : quotient trop petit d'un cran, donc reste ≥ diviseur
	// (quotient ≥ 2 toujours → quotient − 1 ≥ 1). C'est l'erreur cible de la leçon.
	const piegeResteTropGrand = fmtQR(quotient - 1, reste + diviseur);
	const autres = [
		fmtQR(quotient + 1, reste),
		fmtQR(quotient - 1, reste),
		fmtQR(quotient, reste + 1), // reste + 1 peut atteindre le diviseur → autre forme d'erreur
		reste > 0 ? fmtQR(quotient, reste - 1) : fmtQR(quotient + 2, reste),
	].filter((c) => c !== correct && c !== piegeResteTropGrand);
	const distracteurs = [piegeResteTropGrand, ...sample([...new Set(autres)], 2)];
	return {
		type: 'qcm',
		question,
		answer: correct,
		choices: sample([correct, ...distracteurs], distracteurs.length + 1),
		parle: question,
	};
}

function euclidienneType(): ExerciseType {
	// CM1-only ; même charpente que la sœur CE2 (runner « problème » à deux champs).
	return deuxSousQuestionsType({
		levels: ['cm1'],
		labelSaisie: "J'écris le quotient et le reste",
		generateProbleme: genEuclidienneProbleme,
		generateQcm: genEuclidienneQcm,
	});
}

export interface DivisionLessonDef extends LessonInput {
	excludeFromSprint?: boolean;
}

export const DIVISION_LESSONS: DivisionLessonDef[] = [
	{
		id: 'math-div-moitie-quart',
		label: "Moitié et quart d'une collection",
		exerciseType: calibrated<MoitieQuartConfig>(
			{
				// CE2 : moitié X ≤ 50 (quotient 2–25), quart X ≤ 48 (quotient 2–12).
				ce2: { moitieQuotientMax: 25, quartQuotientMax: 12 },
				// CM1 : moitié ET quart jusqu'à X ≤ 100 (quotient 2–50 / 2–25).
				cm1: { moitieQuotientMax: 50, quartQuotientMax: 25 },
			},
			moitieQuartType,
		),
	},
	{
		id: 'math-div-partage',
		label: 'Je partage',
		exerciseType: partageType(),
		// Lecture d'énoncé + figure de découverte : incompatible avec le chrono.
		excludeFromSprint: true,
	},
	{
		id: 'math-div-reste',
		label: 'Je découvre le reste',
		exerciseType: resteType(),
		// Deux champs (résultat + reste) + lecture d'énoncé + figure : hors chrono.
		excludeFromSprint: true,
	},
];

/* Division euclidienne CM1 (#251) — leçon SÉPARÉE du CE2 (`math-div-reste` ne bouge
   pas). Câblée via le bloc « Calcul mental CM1 » du catalogue (levels dérivés
   ['cm1']), pas via DIVISION_LESSONS (qui défaut à ['ce2']). */
export const DIVISION_EUCLIDIENNE_LESSONS: DivisionLessonDef[] = [
	{
		id: 'math-division-euclidienne',
		label: 'Quotient et reste',
		exerciseType: euclidienneType(),
		// Deux champs (quotient + reste) + lecture d'énoncé : hors chrono.
		excludeFromSprint: true,
	},
];
