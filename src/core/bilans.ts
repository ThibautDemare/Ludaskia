/* ============================================================
   Persistance des BilanConfig sauvegardés (« favoris »).
   ============================================================ */
import { lsGet, lsSet, lsGetRaw, lsSetRaw } from './storage';
import { commonCategoryId } from './catalog';
import { touchProfile } from './profiles';
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

/* ---------- Accès par UUID (#636) ----------
   `loadBilans`/`deleteBilan` passent par `lsGet`/`lsSet`, donc par le préfixe du profil
   ACTIF. L'espace encadrant, lui, travaille sur le profil CONSULTÉ sans jamais basculer
   l'actif : il lui faut les mêmes lectures adressées par UUID, sur le modèle de
   `chargerSeancesFor`/`enregistrerSeancesFor` (`core/seance.ts`). */

/** Favoris d'un profil désigné par son UUID. Applique le MÊME `backfillCategory` que
    `loadBilans` : sans ça l'espace encadrant afficherait une liste subtilement différente
    de celle que l'enfant voit sur son accueil (#65), et l'écart ne se remarquerait que sur
    un favori ancien. Invariant à tenir : `loadBilansFor(uuidActif)` = `loadBilans()`. */
export function loadBilansFor(uuid: string): BilanConfig[] {
	return (lsGetRaw(uuid + '/' + BILANS_KEY, []) as BilanConfig[]).map(backfillCategory);
}

/** Supprime un favori d'un profil désigné par son UUID, et marque le profil comme modifié
    (fusion par récence de l'export/import, comme `enregistrerSeancesFor`). N'écrit QUE la
    clé de ce profil : un favori de même id chez un autre enfant n'est pas touché. */
export function deleteBilanFor(uuid: string, id: string): void {
	const restants = loadBilansFor(uuid).filter((b) => b.id !== id);
	lsSetRaw(uuid + '/' + BILANS_KEY, JSON.stringify(restants));
	touchProfile(uuid);
}
