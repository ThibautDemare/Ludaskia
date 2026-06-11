/* ============================================================
   Reprise de l'historique vers la révision espacée (#45).
   ------------------------------------------------------------
   Le mode Révision n'inscrit un élément en rotation qu'au moment où on le
   RENCONTRE après son arrivée (leçon terminée → `recordLessonStats` ; mot créé
   → `addOrGetMot`). L'activité antérieure (sprints, listes, leçons jouées avant
   la fonctionnalité) n'avait donc aucun état SR et restait invisible.

   On rattrape ça à l'activation d'un profil : leçons déjà notées et mots déjà en
   banque entrent en rotation, datés de J-1 → leur 1er re-test (J+1) est échu, ils
   sont dus DÈS AUJOURD'HUI. Le plafond de session (REVISION_PLAFOND) lisse la
   première vague. Idempotent : on ne complète que ce qui manque.
   ============================================================ */
import { JOUR } from './revision';
import { backfillLessonRevisions } from './progress';
import { loadOrtho, saveOrtho, backfillMotRevisions } from './orthographe/store';

export function migrateRevisions(now: number): void {
	const j1 = now - JOUR; // état neuf daté d'hier → dû dès aujourd'hui
	backfillLessonRevisions(j1);
	const ortho = loadOrtho();
	if (backfillMotRevisions(ortho, j1)) saveOrtho(ortho);
}
