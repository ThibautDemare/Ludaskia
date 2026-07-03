/* ============================================================
   Déclarations mutualisées des fichiers de données « maths » (#347, #372).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { MODE_QCM_POINT } from '../_shared';
import { checkNumeriqueOuTexte } from '../../core/check-helpers';
import { choice, sample } from '../../core/utils';

/** Question fermée à choix multiples d'une propriété (géométrie, solides) :
 *  l'énoncé, la bonne réponse et les propositions affichées. Recopiée à
 *  l'identique dans plusieurs fichiers auparavant, centralisée ici. */
export interface PropQ {
	q: string;
	a: string;
	choices: string[];
}

/** Tire une question de propriété (`PropQ`) de la banque en un exercice QCM,
 *  propositions mélangées. Brique partagée par `propQType` et les générateurs
 *  qui intègrent une part de questions « propriété » sans être eux-mêmes de purs
 *  QCM de propriétés (ex. reconnaissance des quadrilatères CM1, #242). */
export function propQExercise(banque: PropQ[]): Exercise {
	const p = choice(banque);
	return {
		type: 'qcm',
		question: p.q,
		answer: p.a,
		choices: sample(p.choices, p.choices.length),
	};
}

/** Fabrique d'`ExerciseType` pour une banque de questions « propriété » (nombre
 *  de côtés, angles droits, vocabulaire des figures/solides) : QCM textuel,
 *  vérification tolérante « nombre ou texte ». Recopiée à l'identique dans
 *  geometrie / solides / geometrie-cm1 avant #372 ; seule la banque changeait. */
export function propQType(banque: PropQ[], modes: ModeOption[] = [MODE_QCM_POINT]): ExerciseType {
	return {
		modes,
		generate: () => propQExercise(banque),
		check: checkNumeriqueOuTexte,
	};
}
