/* ============================================================
   Persistance des BilanConfig sauvegardés (« favoris »).
   ============================================================ */
import { lsGet, lsSet, lsGetRaw, lsSetRaw } from './storage';
import { bilanMode, commonCategoryId } from './catalog';
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

/* ---------- Édition d'un favori depuis l'espace encadrant (#778) ---------- */

/** Remplace un favori EXISTANT d'un profil désigné par son UUID, à la même place et sous le
    même id : une étape de programme qui le visait le vise toujours. Écrit chez CE profil
    seulement, quel que soit le profil actif (l'adulte a pu en changer pendant l'édition).

    Le rattachement de catégorie (#65) est RECALCULÉ depuis les leçons, jamais repris de
    `config` : le composeur pré-rempli renvoie volontiers l'ancien, et un favori devenu
    multi-catégories resterait alors affiché dans sa catégorie d'origine.

    Ne crée jamais : un id absent chez ce profil (ou un profil inconnu) renvoie `false` sans
    rien écrire. Les AUTRES favoris sont recopiés tels qu'ils sont stockés (sans le
    `backfillCategory` de la lecture) : modifier l'un ne réécrit pas les autres. */
export function modifierBilanFor(uuid: string, config: BilanConfig): boolean {
	const brut: unknown = lsGetRaw(uuid + '/' + BILANS_KEY, []);
	if (!Array.isArray(brut)) return false;
	const stockes = brut as BilanConfig[];
	const idx = stockes.findIndex((b) => !!b && b.id === config.id);
	if (idx < 0) return false;
	const neuf: BilanConfig = { ...config };
	delete neuf.categoryId;
	const categoryId = commonCategoryId(config.lessonIds);
	if (categoryId) neuf.categoryId = categoryId;
	stockes[idx] = neuf;
	lsSetRaw(uuid + '/' + BILANS_KEY, JSON.stringify(stockes));
	touchProfile(uuid);
	return true;
}

/** Le CONTENU d'un favori a-t-il changé entre deux versions (#778) ? Ce qui se joue :
    l'ensemble des leçons (l'ordre ne compte pas), le mode effectif (un favori sans `mode`
    est un bilan) et le nombre de questions par leçon. Ni le nom ni la catégorie : un bilan
    commencé reste le même bilan après un renommage, et sa reprise doit survivre. */
export function contenuFavoriChange(avant: BilanConfig, apres: BilanConfig): boolean {
	if (bilanMode(avant) !== bilanMode(apres)) return true;
	if (avant.questionsPerLesson !== apres.questionsPerLesson) return true;
	const a = new Set(avant.lessonIds);
	const b = new Set(apres.lessonIds);
	return a.size !== b.size || [...a].some((id) => !b.has(id));
}
