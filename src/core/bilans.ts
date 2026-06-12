/* ============================================================
   Persistance des BilanConfig sauvegardés (« favoris »).
   ============================================================ */
import { lsGet, lsSet } from './storage';
import { commonCategoryId } from './catalog';
import type { BilanConfig } from './catalog';

export const BILANS_KEY = 'ludaskia_bilans';

/* Rattachement à une catégorie pour un favori antérieur à #65 : déduit de ses
   leçons déjà enregistrées (mono-catégorie → cette catégorie). Dérivé à la
   lecture, sans réécrire le stockage ; un favori multi-catégories reste sans
   `categoryId` (accueil seul). On ne touche pas à un `categoryId` déjà présent. */
function backfillCategory(b: BilanConfig): BilanConfig {
	if (b.categoryId !== undefined) return b;
	const categoryId = commonCategoryId(b.lessonIds);
	return categoryId ? { ...b, categoryId } : b;
}

export function loadBilans(): BilanConfig[] {
	return (lsGet(BILANS_KEY, []) as BilanConfig[]).map(backfillCategory);
}

export function saveBilan(config: BilanConfig): void {
	const bilans = loadBilans();
	const idx = bilans.findIndex((b) => b.id === config.id);
	if (idx >= 0) bilans[idx] = config;
	else bilans.push(config);
	lsSet(BILANS_KEY, bilans);
}

export function deleteBilan(id: string): void {
	lsSet(
		BILANS_KEY,
		loadBilans().filter((b) => b.id !== id),
	);
}
