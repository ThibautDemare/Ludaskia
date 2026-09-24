/* ============================================================
   Libellé d'une leçon TEL QUE L'ENFANT LE VOIT (#718).
   ------------------------------------------------------------
   Deux sources de libellé coexistent pour les 17 leçons de calcul mental du moteur
   historique : le `label` du catalogue (« × 4, × 8 », « Décompo. de 60 » — court, pensé
   pour les en-têtes de fiche) et le `title` de `core/lessons.ts` (« Multiplier par 4,
   par 8 »), que l'écran de catégorie affiche à l'enfant. Partout ailleurs, `labelLecon`
   (libellé résolu au niveau, #436) est ce qui s'affiche.

   Ce module est le SEUL point qui dit « voilà ce que l'enfant lit » : l'écran de
   catégorie ET la recherche l'appellent, donc ce que la recherche indexe est, par
   construction, ce que l'enfant a sous les yeux (critère 3 de #718). Une leçon qu'on
   cherche par le texte de sa carte doit se trouver, quelle que soit la source du texte.
   Pur : sans DOM ni stockage.
   ============================================================ */
import type { LessonDef, SchoolLevel } from './catalog';
import { labelLecon } from './levels';
import { LESSONS_CALCUL_MENTAL } from './lessons';

export function libelleAffiche(lesson: LessonDef, niveau: SchoolLevel): string {
	return LESSONS_CALCUL_MENTAL.find((l) => l.id === lesson.id)?.title ?? labelLecon(lesson, niveau);
}
