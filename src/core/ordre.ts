/* ============================================================
   Ordre pédagogique — logique pure (#208).
   ------------------------------------------------------------
   Consomme la table de données `ORDRE_LECONS` (data/ordre-pedagogique.ts) et
   l'expose au catalogue (tri d'affichage) et à la leçon du jour (séquence par
   matière). Sans DOM, testable seul.

   INVARIANT clé : `trierParOrdre` est TOTALE — une leçon absente de l'ordre de
   son niveau n'est jamais perdue, elle est reléguée en queue dans son ordre
   d'entrée (tri stable). L'affichage et la leçon du jour fonctionnent donc même
   si l'ordre n'a pas (encore) été mis à jour pour une nouvelle leçon.
   ============================================================ */
import type { LessonDef, SchoolLevel, SubjectId } from './catalog';
import { ORDRE_LECONS } from '../data/ordre-pedagogique';

/* Ordre de découverte des leçons d'une matière à un niveau (liste d'IDs).
   Vide si non renseigné → tri par ordre de déclaration (fallback). */
export function ordreLecons(subject: SubjectId, niveau: SchoolLevel): string[] {
	return ORDRE_LECONS[subject]?.[niveau] ?? [];
}

/* Position d'une leçon dans l'ordre de son niveau (Infinity si absente → queue). */
export function positionLecon(lesson: LessonDef, niveau: SchoolLevel): number {
	const i = ordreLecons(lesson.subject, niveau).indexOf(lesson.id);
	return i < 0 ? Infinity : i;
}

/* Trie des leçons selon l'ordre pédagogique du niveau. Stable : les leçons hors
   ordre gardent leur ordre d'entrée, reléguées en queue. Gère plusieurs matières
   (chaque leçon est positionnée dans l'ordre de SA matière). */
export function trierParOrdre<T extends LessonDef>(lessons: T[], niveau: SchoolLevel): T[] {
	const idxBySubject = new Map<string, Map<string, number>>();
	const idxFor = (subject: SubjectId): Map<string, number> => {
		let m = idxBySubject.get(subject);
		if (!m) {
			m = new Map(ordreLecons(subject, niveau).map((id, i) => [id, i] as const));
			idxBySubject.set(subject, m);
		}
		return m;
	};
	return lessons
		.map((l, i) => ({ l, i, p: idxFor(l.subject).get(l.id) ?? Infinity }))
		.sort((a, b) => a.p - b.p || a.i - b.i)
		.map((x) => x.l);
}
