/* ============================================================
   Grandeurs et mesures — la monnaie (MES 5/6, #96).
   Deux leçons à réponse NUMÉRIQUE unique, rendues via le chemin
   « math moderne » du catalogue (item `num`).

   Calibrage pédagogique CE2 (avis pedagogue-primaire) :
   - réponse TOUJOURS entière, avec l'unité (€ ou c) collée au champ ;
     jamais de double champ, jamais d'écriture décimale « 1,60 » (le
     décimal n'est pas installé en CE2), jamais de mélange €/c qui
     franchit l'euro.
   - euros entiers ≤ 20 € ; centimes par pas de 10 c et sous 1 € (les
     deux sommes < 1 €) ; billets réels 5/10/20 € (pas de 50 €).
   - types au programme : prix total (+), reste/rendu de monnaie (−).
     « Composer une somme avec des pièces » est écarté (pas de réponse
     numérique unique).
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import { rnd, choice } from '../../core/utils';

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
   Complément « prix → billet » : prix entier, billet réel 5/10/20 €. */
const BILLETS = [5, 10, 20];
function rendreMonnaie(): Exercise {
	const billet = choice(BILLETS);
	const p = rnd(1, billet - 1); // prix strictement inférieur au billet
	return ex(
		`Un ${obj()} coûte ${p} €. Tu paies avec un billet de ${billet} €. Combien te rend-on ? @ €`,
		billet - p,
	);
}

/* Fabrique un ExerciseType mono-mode qui tire au hasard parmi ses situations. */
function monnaieType(situations: Array<() => Exercise>): ExerciseType {
	return {
		generate: () => choice(situations)(),
		check: (exercise: Exercise, input: string): boolean =>
			Number(input.trim().replace(',', '.')) === Number(exercise.answer),
	};
}

export interface MonnaieLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const MONNAIE_LESSONS: MonnaieLessonDef[] = [
	{
		id: 'mes-monnaie-calcul',
		label: 'Je calcule avec les euros',
		exerciseType: monnaieType([euroTotal, euroReste, centTotal, centReste]),
	},
	{
		id: 'mes-monnaie-rendu',
		label: 'Je rends la monnaie',
		exerciseType: monnaieType([rendreMonnaie]),
	},
];
