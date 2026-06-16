/* ============================================================
   Reprise d'un exercice en cours (issue #63) — brique PURE.
   ------------------------------------------------------------
   On sauvegarde l'état d'un exercice « grille » (leçon, bilans
   express/complet/personnalisé) pour pouvoir le quitter et le
   reprendre plus tard, par profil. Ce module ne touche pas au DOM :
   il ne fait que stocker/valider/purger des instantanés. La capture
   (lecture du DOM) et la restauration (réinjection) vivent côté UI.

   Décisions (cf. issue #63 + avis pédago/UX) :
   - périmètre : 4 modes grille seulement (sprint et révision espacée
     exclus, ortho déjà persistée) ;
   - une reprise par « identité » d'exercice (clé stable) : relancer le
     même exercice écrase la reprise précédente ;
   - expiration silencieuse au bout de RESUME_TTL_MS (contexte perdu) ;
   - plafond de stockage de sécurité (RESUME_MAX_STORED) ;
   - format versionné : un instantané d'une autre version (ou mal formé)
     est ignoré proprement plutôt que de planter.
   ============================================================ */
import { lsGet, lsSet } from './storage';
import type { Item } from './items';
import type { BilanConfig } from './catalog';

export const RESUME_KEY = 'ludaskia_resume';
export const RESUME_VERSION = 1;
/** Au-delà, une reprise oubliée disparaît toute seule (7 jours). */
export const RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Plafond de stockage (garde-fou anti-croissance ; l'UI n'en montre que 3). */
export const RESUME_MAX_STORED = 12;

/** Les 4 modes « grille » reprenables. */
export type ResumeMode = 'lecon' | 'complet' | 'express' | 'custom';

/** De quoi relancer un exercice « à neuf » (bouton « Recommencer »). */
export type ResumeRelaunch =
	| { type: 'lecon'; lessonId: string }
	| { type: 'bilan'; config: BilanConfig };

export interface ResumeSnapshot {
	key: string; // identité stable de l'exercice (dédup)
	version: number;
	savedAt: number; // ms (passé en paramètre — ce module ne lit pas l'horloge)
	mode: ResumeMode;
	label: string; // libellé affiché sur la carte
	icon: string; // nom d'icône Phosphor (matière pour une leçon, type pour un bilan), rendu via iconOr()
	categoryId: string | null; // pour filtrer la carte sur l'écran de catégorie
	relaunch: ResumeRelaunch; // pour « Recommencer »
	// État de restauration (exercice « grille ») :
	sheetsHTML: string; // rendu exact de #sheets (préserve la mise en page riche)
	items: Record<string, Item>; // sessionItems (id de champ -> Item) pour la correction
	answers: Record<string, string>; // réponses saisies (id de champ -> valeur)
	activeId: string | null; // champ ayant le focus (calcul « courant »)
	elapsedMs: number; // temps actif déjà écoulé
	total: number; // nombre de champs
	answered: number; // nombre de champs renseignés (pour la progression)
}

/* ---------- Clés stables (une reprise par identité d'exercice) ---------- */
export const leconKey = (lessonId: string) => `lecon-${lessonId}`;
/** Bilan de catégorie (express/complet) : un slot par catégorie × type. */
export const bilanCategoryKey = (mode: 'express' | 'complet', categoryId: string) =>
	`bilan-${mode}-${categoryId}`;
/** Bilan personnalisé : un slot global, ou un par catégorie s'il est scopé. */
export const bilanCustomKey = (categoryId?: string | null) =>
	categoryId ? `bilan-custom-${categoryId}` : 'bilan-custom';

/* ---------- Validation / lecture ---------- */
function isValid(s: unknown): s is ResumeSnapshot {
	if (!s || typeof s !== 'object') return false;
	const o = s as Record<string, unknown>;
	return (
		o.version === RESUME_VERSION &&
		typeof o.key === 'string' &&
		typeof o.savedAt === 'number' &&
		typeof o.sheetsHTML === 'string' &&
		typeof o.elapsedMs === 'number' &&
		typeof o.total === 'number' &&
		!!o.items &&
		typeof o.items === 'object' &&
		!!o.answers &&
		typeof o.answers === 'object' &&
		!!o.relaunch &&
		typeof o.relaunch === 'object'
	);
}

/** Toutes les reprises valides et non expirées, les plus récentes d'abord.
   Effet de bord : purge silencieusement le stockage si des entrées ont sauté
   (format obsolète, expiration), pour ne pas les retraîner. */
export function loadResumes(now: number): ResumeSnapshot[] {
	const raw = lsGet(RESUME_KEY, []);
	const list: ResumeSnapshot[] = Array.isArray(raw) ? raw.filter(isValid) : [];
	const fresh = list
		.filter((s) => now - s.savedAt < RESUME_TTL_MS)
		.sort((a, b) => b.savedAt - a.savedAt);
	// Réécrit si on a éliminé des entrées (obsolètes/expirées/mal formées).
	if (!Array.isArray(raw) || fresh.length !== raw.length) lsSet(RESUME_KEY, fresh);
	return fresh;
}

export function getResume(key: string, now: number): ResumeSnapshot | null {
	return loadResumes(now).find((s) => s.key === key) ?? null;
}

export function hasResume(key: string, now: number): boolean {
	return loadResumes(now).some((s) => s.key === key);
}

/* ---------- Écriture ---------- */
/** Insère ou remplace la reprise de même `key`, applique le plafond. */
export function upsertResume(snapshot: ResumeSnapshot): void {
	const others = loadResumes(snapshot.savedAt).filter((s) => s.key !== snapshot.key);
	const next = [snapshot, ...others] // le plus récent d'abord
		.sort((a, b) => b.savedAt - a.savedAt)
		.slice(0, RESUME_MAX_STORED);
	lsSet(RESUME_KEY, next);
}

export function removeResume(key: string): void {
	const raw = lsGet(RESUME_KEY, []);
	const list: ResumeSnapshot[] = Array.isArray(raw) ? raw.filter(isValid) : [];
	lsSet(
		RESUME_KEY,
		list.filter((s) => s.key !== key),
	);
}

export function clearResumes(): void {
	lsSet(RESUME_KEY, []);
}
