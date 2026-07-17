/* ============================================================
   Charpente PARTAGÉE « problème à deux sous-questions » (#95, #251, #252).
   Runner « problème » (ui/lecon-probleme.ts) à DEUX champs numériques corrigés
   INDÉPENDAMMENT ; mode saisie (recommandé) + variante QCM accessible (choix
   combiné). Extraite de division.ts (division euclidienne #251 / reste par le sens
   #95) pour être réutilisée telle quelle par la durée écoulée CM1 (#252) : mêmes deux
   modes, vocabulaire « calcul » sans badge « Étape » (les deux champs sont nommés),
   et `checkAnswer` — qui renvoie false pour un item `probleme` : le runner corrige
   champ par champ en lisant `etapes[].answer` (cf. #199/#348). Seuls le libellé de
   saisie, les deux générateurs et le(s) niveau(x) distinguent une leçon d'une autre.

   Format « problème » par défaut (#199/#348) : `generate()` sans mode produit un item
   `probleme` (le QCM est une variante) → la leçon est classée et exclue du sprint.
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { MODE_QCM_POINT } from '../_shared';

export function deuxSousQuestionsType(opts: {
	labelSaisie: string;
	generateProbleme: () => Exercise;
	generateQcm: () => Exercise;
	levels?: SchoolLevel[];
}): ExerciseType {
	return {
		...(opts.levels ? { levels: opts.levels } : {}),
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
