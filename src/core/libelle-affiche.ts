/* ============================================================
   Libellé d'une leçon TEL QUE L'ENFANT LE VOIT (#718, #722).
   ------------------------------------------------------------
   Jusqu'à #722, deux noms coexistaient pour les 17 leçons de calcul mental du moteur
   historique : le `label` du catalogue (« × 4, × 8 », « Décompo. de 60 », court, pensé pour
   les en-têtes de fiche) et le `title` de `core/lessons.ts` (« Multiplier par 4, par 8 »),
   que l'écran de catégorie affichait à l'enfant — et l'adulte, lui, lisait le nom court
   partout. Depuis #722 il n'y a plus qu'UN nom : le `label` du catalogue EST le titre de
   la carte, et `tests/libelle-affiche.test.ts` tient l'égalité (une leçon dont le catalogue
   et `lessons.ts` diraient deux choses fait échouer `npm test`).

   Cette fonction reste le SEUL point qui dit « voilà ce que l'enfant lit » : l'écran de
   catégorie, la recherche enfant et le sélecteur adulte l'appellent. Elle vaut aujourd'hui
   `labelLecon` (libellé résolu au niveau, #436) ; garder ce nom-là aux trois appelants,
   c'est garder l'endroit où intervenir si un jour un libellé d'affichage devait à nouveau
   diverger du catalogue — plutôt que de le retrouver, comme avant, dans un `find` local.
   Pur : sans DOM ni stockage.
   ============================================================ */
import type { LessonDef, SchoolLevel } from './catalog';
import { labelLecon } from './levels';

export function libelleAffiche(lesson: LessonDef, niveau: SchoolLevel): string {
	return labelLecon(lesson, niveau);
}
