/* ============================================================
   Helpers de correction réutilisables (#346) — logique PURE (sans DOM).

   Centralise la correction NUMÉRIQUE et le cas HYBRIDE « numérique ou texte »
   jusqu'ici recopiés dans une dizaine de fabriques `src/data/maths/`. Une seule
   définition = un seul endroit où corriger un bug de normalisation (virgule/point,
   espaces de groupement) et un comportement identique partout.

   La correction TEXTE normalisée (trim + espaces réduits + NFC, accents exigés,
   variantes `answers`) vit déjà dans `checkAnswer` (core/exercise.ts) : on la
   réutilise telle quelle plutôt que d'en créer une copie.
   ============================================================ */
import type { Exercise } from './exercise';
import { checkAnswer } from './exercise';
import { nettoyerSaisieNombre } from './nombres';

/** Correction NUMÉRIQUE : compare la saisie à `answer` comme des nombres.
 *  Tolère la virgule décimale française (« 1,5 » == « 1.5 ») et les espaces de
 *  groupement (« 1 002 » == « 1002 », via `nettoyerSaisieNombre`) pour ne pas
 *  pénaliser un enfant qui recopie un nombre groupé affiché. Plus permissif que
 *  l'ancien `.trim()` recopié partout (qui rejetait les espaces internes) :
 *  comportement unifié voulu (#346). Faux si l'exercice n'a pas de réponse unique
 *  (`answer`) ou si la saisie n'est pas un nombre. */
export function checkNumerique(exercise: Exercise, input: string): boolean {
	if (!('answer' in exercise)) return false;
	return Number(nettoyerSaisieNombre(input).replace(',', '.')) === Number(exercise.answer);
}

/** Correction HYBRIDE : numérique quand la réponse est un entier (côtés, angles,
 *  comptages), sinon texte normalisé (nom de figure/solide). Couvre les leçons de
 *  géométrie dont la réponse est tantôt un nombre, tantôt un mot. Délègue à
 *  `checkNumerique` ou `checkAnswer` selon la forme de `answer`. */
export function checkNumeriqueOuTexte(exercise: Exercise, input: string): boolean {
	if (!('answer' in exercise)) return false;
	return /^\d+$/.test(exercise.answer)
		? checkNumerique(exercise, input)
		: checkAnswer(exercise, input);
}
