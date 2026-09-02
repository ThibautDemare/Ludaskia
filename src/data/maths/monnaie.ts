/* ============================================================
   Grandeurs et mesures — la monnaie (MES 5/6, #96 ; plages par niveau #287).
   Deux leçons à réponse NUMÉRIQUE unique, rendues via le chemin
   « math moderne » du catalogue (item `num`).

   Calibrage pédagogique CE2 (avis pedagogue-primaire) :
   - réponse TOUJOURS entière, avec l'unité (€ ou c) collée au champ ;
     jamais de double champ, jamais d'écriture décimale « 1,60 » (le
     décimal n'est pas installé en CE2), jamais de mélange €/c qui
     franchit l'euro.
   - euros entiers ≤ 20 € ; centimes par pas de 10 c et sous 1 € (les
     deux sommes < 1 €) ; billets réels 5/10/20 € + 50 € (#287).
   - types au programme : prix total (+), reste/rendu de monnaie (−).
     « Composer une somme avec des pièces » est écarté (pas de réponse
     numérique unique).

   Multi-niveaux (#225/#287) : « Je rends la monnaie » est `calibrated`
   par une table { ce2, cm1 } ; le CM1 introduit des PRIX DÉCIMAUX (ex.
   1,50 €), donc le franchissement de l'euro — proscrit au CE2. La règle
   d'or reste : JAMAIS de décimal au CE2 (franchir l'euro = CM1). Le CM1
   reste prêt derrière le paramètre `level` (non surfacé au catalogue,
   déploiement du cursus séparé). « Je calcule avec les euros » reste
   mono-niveau (CE2), inchangée.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts } from '../../core/exercise';
import { etayageRedige, type LessonInput } from '../_shared';
import { checkNumerique } from '../../core/check-helpers';
import { calibrated } from '../../core/level-combinators';
import { rnd, choice } from '../../core/utils';
/* La graphie des montants vit dans core/nombres.ts (#542) : la leçon de monnaie et les
   problèmes d'argent l'écrivaient chacun de leur côté, et la révélation d'une réponse une
   troisième fois — en perdant les centimes. */
import { formatEuros } from '../../core/nombres';

const OBJETS = ['livre', 'jouet', 'ballon', 'stylo', 'cahier', 'jeu', 'gâteau', 'cadeau', 'crayon'];
const obj = () => choice(OBJETS);

function ex(question: string, answer: number): Exercise {
	return { type: 'text', question, answer: String(answer) };
}

/* ---------- Leçon 1 : « Je calcule avec les euros » ----------
   Quatre situations ; aucun mélange €/c dans un même item ; l'unité du
   champ (€ ou c) correspond toujours à l'unité de la réponse entière. */
function euroTotal(): Exercise {
	const a = rnd(1, 12);
	const b = rnd(1, 20 - a); // a + b ≤ 20 €
	return ex(
		`Un ${obj()} coûte ${a} € et un ${obj()} coûte ${b} €. Combien coûtent-ils en tout ? @ €`,
		a + b,
	);
}
function euroReste(): Exercise {
	const h = rnd(5, 20);
	const p = rnd(1, h - 1);
	return ex(`Tu as ${h} €. Tu achètes un ${obj()} à ${p} €. Combien te reste-t-il ? @ €`, h - p);
}
function centTotal(): Exercise {
	const a = rnd(1, 8) * 10; // 10..80 c
	const b = rnd(1, 9 - a / 10) * 10; // a + b ≤ 90 c (sous 1 €)
	return ex(`Tu as ${a} c et ${b} c. Combien as-tu en tout ? @ c`, a + b);
}
function centReste(): Exercise {
	const h = rnd(3, 9) * 10; // 30..90 c
	const p = rnd(1, h / 10 - 1) * 10;
	return ex(`Tu as ${h} c. Tu donnes ${p} c. Combien te reste-t-il ? @ c`, h - p);
}

/* ---------- Leçon 2 : « Je rends la monnaie » ----------
   Complément « prix → billet ». Calibrée par niveau (#287) :
   - CE2 : prix ENTIER, billets réels 5/10/20/50 € (ajout du 50 €).
   - CM1 : prix DÉCIMAL (centimes par pas de 5 c, ex. 1,50 €), donc le
     franchissement de l'euro — proscrit au CE2.
   `decimal` bascule le mode ; les billets sont fournis par la config. */
interface RenduConfig {
	billets: number[];
	decimal: boolean; // CM1 : prix au centime près (franchit l'euro)
}

function rendreMonnaie(config: RenduConfig): Exercise {
	const billet = choice(config.billets);
	if (!config.decimal) {
		// CE2 : prix entier, rendu entier.
		const p = rnd(1, billet - 1); // prix strictement inférieur au billet
		return ex(
			`Un ${obj()} coûte ${formatEuros(p)} €. Tu paies avec un billet de ${billet} €. Combien te rend-on ? @ €`,
			billet - p,
		);
	}
	// CM1 : prix décimal au pas de 5 c (montants réalistes, ex. 1,50 € ou 3,75 €).
	// On travaille en centimes pour rester exact, puis on reformate en euros.
	const billetC = billet * 100;
	const prixC = rnd(1, billetC / 5 - 1) * 5; // 0,05 € .. (billet − 0,05 €), pas de 5 c
	const renduC = billetC - prixC;
	return ex(
		`Un ${obj()} coûte ${formatEuros(prixC / 100)} €. Tu paies avec un billet de ${billet} €. Combien te rend-on ? @ €`,
		renduC / 100,
	);
}

/* Fabrique un ExerciseType mono-mode qui tire au hasard parmi ses situations. */
function monnaieType(situations: Array<() => Exercise>): ExerciseType {
	return {
		generate: () => choice(situations)(),
		check: checkNumerique,
	};
}

/* Fabrique l'ExerciseType « Je rends la monnaie » pour un jeu de paramètres
   (un niveau). Utilisée comme `build` du combinateur `calibrated`. */
function renduType(config: RenduConfig): ExerciseType {
	return {
		generate: (_opts?: GenerateOpts) => rendreMonnaie(config),
		check: checkNumerique,
	};
}

export const MONNAIE_LESSONS: LessonInput[] = [
	{
		id: 'mes-monnaie-calcul',
		label: 'Je calcule avec les euros',
		exerciseType: monnaieType([euroTotal, euroReste, centTotal, centReste]),
		// La difficulté n'est pas le calcul (des additions et soustractions déjà sues) mais
		// le CHOIX de l'opération à partir de l'énoncé : les deux pas centraux donnent donc
		// les deux formulations telles qu'elles apparaissent dans les questions.
		etayage: [
			etayageRedige(
				'Calculer avec les euros',
				'Un prix se calcule comme un nombre ordinaire : ce sont les mots de la question qui disent quelle opération faire.',
				[
					'« Combien en tout ? » demande une addition : 3 € + 15 € = 18 €.',
					'« Combien te reste-t-il ? » demande une soustraction : 13 € - 2 € = 11 €.',
					"N'additionne que ce qui va ensemble : des euros avec des euros, des centimes avec des centimes.",
				],
			),
		],
	},
	{
		id: 'mes-monnaie-rendu',
		label: 'Je rends la monnaie',
		exerciseType: calibrated<RenduConfig>(
			{
				// CE2 : prix entier, billets réels 5/10/20 € + le 50 € (#287). Jamais de décimal.
				ce2: { billets: [5, 10, 20, 50], decimal: false },
				// CM1 : prix décimaux (franchissement de l'euro), mêmes billets.
				cm1: { billets: [5, 10, 20, 50], decimal: true },
			},
			renduType,
		),
		// « Compter en avançant » plutôt que « poser 20 - 17 » : c'est le geste réel du
		// commerçant, il évite la soustraction à retenue, et il se vérifie tout seul (le
		// 3ᵉ pas). Vrai aux deux niveaux, y compris quand le prix devient décimal au CM1.
		etayage: [
			etayageRedige(
				'Rendre la monnaie',
				"Rendre la monnaie, c'est chercher ce qui MANQUE entre le prix et le billet donné.",
				[
					'Repère les deux nombres : le prix (17 €) et le billet (20 €).',
					'Compte en avançant à partir du prix : de 17 à 20, il y a 3.',
					'Vérifie en ajoutant : 17 + 3 = 20, on te rend donc 3 €.',
				],
			),
		],
	},
];
