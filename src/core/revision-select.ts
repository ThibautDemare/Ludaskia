/* ============================================================
   Révision espacée — sélection des éléments « dus », regroupés par
   catégorie (issue #45). Pur et testable : `now` passé en paramètre.
   Combine deux sources d'état :
     - mots d'orthographe (OrthoState.banque[].revision) ;
     - leçons maths/conjugaison (Record<lessonId, EtatRevision>).
   ============================================================ */
import { estDu, REVISION_PLAFOND } from './revision';
import { getLessonById, CATEGORIES, ORTHO_CATEGORY_ID } from './catalog';
import type { OrthoState, EtatRevision } from './orthographe/types';

export type DueItem =
	| { kind: 'word'; id: string; label: string; categoryId: string; due: number }
	| { kind: 'lesson'; id: string; label: string; categoryId: string; due: number };

export interface DueGroup {
	categoryId: string;
	label: string;
	items: DueItem[];
}

/* Tous les éléments dus (mots + leçons), les plus en retard d'abord. */
function collectDue(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
): DueItem[] {
	const due: DueItem[] = [];
	for (const id in ortho.banque) {
		const m = ortho.banque[id];
		if (estDu(m.revision, now)) {
			due.push({
				kind: 'word',
				id,
				label: m.mot,
				categoryId: ORTHO_CATEGORY_ID,
				due: m.revision.prochaineRevision!,
			});
		}
	}
	for (const id in lessonRevisions) {
		const e = lessonRevisions[id];
		if (!estDu(e, now)) continue;
		const lesson = getLessonById(id);
		if (lesson) {
			due.push({
				kind: 'lesson',
				id,
				label: lesson.label,
				categoryId: lesson.category,
				due: e.prochaineRevision!,
			});
		}
	}
	return due.sort((a, b) => a.due - b.due);
}

/* Nombre total d'éléments dus (pour la carte d'accueil ; non plafonné). */
export function countDue(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
): number {
	return collectDue(ortho, lessonRevisions, now).length;
}

/* Sélection plafonnée et regroupée par catégorie (ordre d'apparition) : on
   révise une catégorie avant de passer à la suivante, jamais en alternance. */
export function selectDueGroups(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
	plafond = REVISION_PLAFOND,
): DueGroup[] {
	const capped = collectDue(ortho, lessonRevisions, now).slice(0, plafond);
	const groups: DueGroup[] = [];
	for (const it of capped) {
		let g = groups.find((x) => x.categoryId === it.categoryId);
		if (!g) {
			const cat = CATEGORIES.find((c) => c.id === it.categoryId);
			g = { categoryId: it.categoryId, label: cat?.label ?? it.categoryId, items: [] };
			groups.push(g);
		}
		g.items.push(it);
	}
	return groups;
}
