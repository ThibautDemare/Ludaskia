/* ============================================================
   Révision espacée — sélection des éléments « dus », regroupés par
   catégorie (issue #45). Pur et testable : `now` passé en paramètre.
   Combine deux sources d'état :
     - mots d'orthographe (OrthoState.banque[].revision) ;
     - leçons maths/conjugaison (Record<lessonId, EtatRevision>).
   ============================================================ */
import {
	estDu,
	PALIER_ACQUIS,
	REVISION_PLAFOND,
	REVISION_SEUIL_SOURCE_VIDABLE,
	REVISION_MAX_VIDAGES_SOURCES,
} from './revision';
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

/* Date (ms) du prochain re-test À VENIR parmi les éléments en rotation (mots +
   leçons non acquis), ou `null` si rien n'est programmé : banque vierge, ou tout
   acquis. Sert à l'état « rien à réviser » de l'accueil pour annoncer l'échéance.
   Les éléments déjà dus (échéance passée) sont ignorés ici — ils relèvent de
   `countDue`. Les leçons orphelines (id absent du catalogue) sont écartées, comme
   dans la sélection. */
export function prochaineEcheance(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
): number | null {
	let min: number | null = null;
	const consider = (e: EtatRevision | undefined | null) => {
		if (!e || e.palier >= PALIER_ACQUIS || e.prochaineRevision == null) return;
		if (e.prochaineRevision <= now) return; // déjà dû
		if (min == null || e.prochaineRevision < min) min = e.prochaineRevision;
	};
	for (const id in ortho.banque) consider(ortho.banque[id].revision);
	for (const id in lessonRevisions) {
		if (getLessonById(id)) consider(lessonRevisions[id]);
	}
	return min;
}

/* Y a-t-il au moins un élément en rotation (mot ou leçon connue avec un état SR) ?
   Distingue « profil neuf, rien d'appris » de « tout est à jour / acquis ». */
export function aDesRevisions(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
): boolean {
	for (const id in ortho.banque) if (ortho.banque[id].revision) return true;
	for (const id in lessonRevisions) if (getLessonById(id)) return true;
	return false;
}

/* Nombre total d'éléments dus (pour la carte d'accueil ; non plafonné). */
export function countDue(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
): number {
	return collectDue(ortho, lessonRevisions, now).length;
}

/* Sélection plafonnée et équilibrée entre SOURCES (= `categoryId` : une catégorie
   de leçon, ou l'orthographe entière). On évite qu'une source surreprésentée
   monopolise la session : d'abord on vide jusqu'à REVISION_MAX_VIDAGES_SOURCES
   petites sources (≤ REVISION_SEUIL_SOURCE_VIDABLE éléments dus), les plus en
   retard d'abord ; puis on partage les slots restants en round-robin entre les
   sources restantes (grosses + petites non vidées), chacune cédant son élément le
   plus en retard à tour de rôle. Plafonner le vidage à 2 sources garantit qu'il
   reste toujours des slots pour le round-robin : aucune source n'est affamée.
   L'entrée `due` est déjà triée par retard (donc chaque source l'est aussi) ; le
   résultat ne l'est PAS globalement (vidage puis round-robin) → le call-site
   re-trie pour l'affichage. */
function selectionEquilibree(due: DueItem[], plafond: number): DueItem[] {
	const parSource = new Map<string, DueItem[]>();
	for (const it of due) {
		const file = parSource.get(it.categoryId);
		if (file) file.push(it);
		else parSource.set(it.categoryId, [it]);
	}
	// Sources triées par urgence (retard de leur élément le plus en retard = le 1er).
	const sources = [...parSource.values()].sort((a, b) => a[0].due - b[0].due);
	const petites = sources.filter((s) => s.length <= REVISION_SEUIL_SOURCE_VIDABLE);
	const grosses = sources.filter((s) => s.length > REVISION_SEUIL_SOURCE_VIDABLE);

	const picked: DueItem[] = [];
	// Phase 1 — vidage : au plus N petites sources, intégralement, les plus urgentes.
	const aVider = petites.slice(0, REVISION_MAX_VIDAGES_SOURCES);
	for (const s of aVider) {
		for (const it of s) {
			if (picked.length >= plafond) return picked;
			picked.push(it);
		}
	}
	// Phase 2 — round-robin sur les sources restantes (grosses + petites non vidées).
	const files = [...grosses, ...petites.slice(REVISION_MAX_VIDAGES_SOURCES)].sort(
		(a, b) => a[0].due - b[0].due,
	);
	const curseur = files.map(() => 0);
	let progres = true;
	while (picked.length < plafond && progres) {
		progres = false;
		for (let i = 0; i < files.length; i++) {
			if (curseur[i] < files[i].length) {
				picked.push(files[i][curseur[i]]);
				curseur[i]++;
				progres = true;
				if (picked.length >= plafond) break;
			}
		}
	}
	return picked;
}

/* Sélection plafonnée et regroupée par catégorie (ordre d'apparition) : on
   révise une catégorie avant de passer à la suivante, jamais en alternance. La
   composition est équilibrée entre sources (cf. selectionEquilibree) ; l'ordre
   d'affichage reste « le plus en retard d'abord ». */
export function selectDueGroups(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
	plafond = REVISION_PLAFOND,
): DueGroup[] {
	// Re-tri par retard : selectionEquilibree ne garantit pas l'ordre global.
	const capped = selectionEquilibree(collectDue(ortho, lessonRevisions, now), plafond).sort(
		(a, b) => a.due - b.due,
	);
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
