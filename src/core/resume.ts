/* ============================================================
   Reprise d'un exercice en cours (issue #63, étendue #498) — brique PURE.
   ------------------------------------------------------------
   On sauvegarde l'état d'un exercice pour pouvoir le quitter et le reprendre
   plus tard, par profil. Ce module ne touche pas au DOM : il ne fait que
   stocker/valider/purger des instantanés. La capture et la restauration
   vivent côté UI.

   DEUX NATURES d'instantané (#498), parce que les exercices n'ont pas tous la
   même mémoire :
   - `grille` (#63) : fiche en saisie et bilans. Tout l'état tient dans le DOM
     (des champs remplis), on rejoue donc le rendu exact ;
   - `runner` (#498) : les écrans « une question à la fois » (QCM, tri, ordre,
     tuiles, tableau, appariement, clic-mot, droite graduée, problème…). Leur
     état vit en mémoire, pas dans le DOM : les questions DÉJÀ TIRÉES, l'index
     courant et le score. On rejoue donc l'ÉTAT LOGIQUE et c'est le runner qui
     re-rend l'écran. Granularité : le début de la question courante — l'enfant
     refait la question entamée, jamais celles déjà validées.
     Sans ça, ces dix runners n'avaient aucune reprise : une leçon interrompue
     y était perdue, alors que la fiche en saisie, elle, se reprenait.

   Décisions (cf. issue #63 + avis pédago/UX) :
   - périmètre : les exercices de leçon et les bilans (sprint et révision
     espacée exclus — pas de reprise à mi-chrono ; ortho déjà persistée) ;
   - une reprise par « identité » d'exercice (clé stable) : relancer le
     même exercice écrase la reprise précédente ;
   - expiration silencieuse au bout de RESUME_TTL_MS (contexte perdu) ;
   - plafond de stockage de sécurité (RESUME_MAX_STORED) ;
   - format versionné : un instantané d'une autre version (ou mal formé)
     est ignoré proprement plutôt que de planter. Un instantané d'AVANT #498
     n'a pas de champ `kind` : il est lu comme une `grille`, donc aucune reprise
     en cours n'est perdue à la mise à jour.
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

/** Les 4 modes reprenables (mode d'ENREGISTREMENT de l'essai, pas de rendu). */
export type ResumeMode = 'lecon' | 'complet' | 'express' | 'custom';

/** De quoi relancer un exercice « à neuf » (bouton « Recommencer »). */
export type ResumeRelaunch =
	{ type: 'lecon'; lessonId: string } | { type: 'bilan'; config: BilanConfig };

/** Ce que les deux natures d'instantané ont en commun : l'identité, de quoi rendre la
    carte « À continuer » et de quoi relancer à neuf. `total`/`answered` portent la
    progression sous une forme unique (champs remplis pour une grille, questions validées
    pour un runner), ce qui laisse le rendu de la carte indifférent à la nature. */
interface ResumeCommun {
	key: string; // identité stable de l'exercice (dédup)
	version: number;
	savedAt: number; // ms (passé en paramètre — ce module ne lit pas l'horloge)
	mode: ResumeMode;
	label: string; // libellé affiché sur la carte
	icon: string; // nom d'icône Phosphor (matière pour une leçon, type pour un bilan), rendu via iconOr()
	categoryId: string | null; // pour filtrer la carte sur l'écran de catégorie
	relaunch: ResumeRelaunch; // pour « Recommencer »
	total: number; // nombre d'unités à faire
	answered: number; // nombre d'unités déjà faites (pour la progression)
}

/** Exercice « grille » (#63) : tout l'état utile est dans le DOM, on le rejoue tel quel. */
export interface ResumeGrille extends ResumeCommun {
	kind: 'grille';
	sheetsHTML: string; // rendu exact de #sheets (préserve la mise en page riche)
	items: Record<string, Item>; // sessionItems (id de champ -> Item) pour la correction
	answers: Record<string, string>; // réponses saisies (id de champ -> valeur)
	activeId: string | null; // champ ayant le focus (calcul « courant »)
	elapsedMs: number; // temps actif déjà écoulé
}

/** Runner « une question à la fois » (#498) : l'état vit en mémoire, pas dans le DOM.
    `questions` est la liste DÉJÀ TIRÉE (données pures, sérialisables) — on la conserve
    telle quelle pour que l'enfant retrouve exactement ses questions, et non un nouveau
    tirage qui rendrait sa progression absurde. Le runner qui restaure connaît seul la
    forme de ses questions, d'où le `unknown[]` : ce module ne fait que transporter. */
export interface ResumeRunner extends ResumeCommun {
	kind: 'runner';
	// Toujours une leçon (les bilans sont des grilles) : on RESSERRE le type hérité, ce qui
	// évite à chaque runner de re-vérifier la nature avant de lire son `lessonId`.
	relaunch: { type: 'lecon'; lessonId: string };
	runner: string; // nom du runner (clé du registre de restauration, côté UI)
	exerciseMode: string | null; // mode d'exercice retenu (#69) ; null pour un type mono-mode
	questions: unknown[]; // questions déjà tirées, dans l'ordre
	idx: number; // index de la question courante (celle que l'enfant refera)
	score: number; // bonnes réponses accumulées avant `idx`
}

export type ResumeSnapshot = ResumeGrille | ResumeRunner;

/* ---------- Clés stables (une reprise par identité d'exercice) ---------- */
export const leconKey = (lessonId: string) => `lecon-${lessonId}`;
/** Bilan de catégorie (express/complet) : un slot par catégorie × type. */
export const bilanCategoryKey = (mode: 'express' | 'complet', categoryId: string) =>
	`bilan-${mode}-${categoryId}`;
/** Bilan personnalisé : un slot global, ou un par catégorie s'il est scopé. */
export const bilanCustomKey = (categoryId?: string | null) =>
	categoryId ? `bilan-custom-${categoryId}` : 'bilan-custom';

/* ---------- Validation / lecture ---------- */
/* Partie commune : sans elle, aucune carte « À continuer » n'est rendable. */
function communValide(o: Record<string, unknown>): boolean {
	return (
		o.version === RESUME_VERSION &&
		typeof o.key === 'string' &&
		typeof o.savedAt === 'number' &&
		typeof o.total === 'number' &&
		!!o.relaunch &&
		typeof o.relaunch === 'object'
	);
}
/* Valide un instantané brut et NORMALISE sa nature. Un instantané écrit avant #498 n'a
   pas de `kind` : c'est forcément une grille (seule nature qui existait), on le lit donc
   comme telle plutôt que de le jeter — une reprise en cours survit à la mise à jour. */
function normaliser(s: unknown): ResumeSnapshot | null {
	if (!s || typeof s !== 'object') return null;
	const o = s as Record<string, unknown>;
	if (!communValide(o)) return null;
	if (o.kind === 'runner') {
		if (
			typeof o.runner !== 'string' ||
			!Array.isArray(o.questions) ||
			typeof o.idx !== 'number' ||
			typeof o.score !== 'number'
		)
			return null;
		return o as unknown as ResumeRunner;
	}
	if (
		typeof o.sheetsHTML !== 'string' ||
		typeof o.elapsedMs !== 'number' ||
		!o.items ||
		typeof o.items !== 'object' ||
		!o.answers ||
		typeof o.answers !== 'object'
	)
		return null;
	return { ...(o as unknown as ResumeGrille), kind: 'grille' };
}

/** Toutes les reprises valides et non expirées, les plus récentes d'abord.
   Effet de bord : purge silencieusement le stockage si des entrées ont sauté
   (format obsolète, expiration), pour ne pas les retraîner. */
export function loadResumes(now: number): ResumeSnapshot[] {
	const raw = lsGet(RESUME_KEY, []);
	const list: ResumeSnapshot[] = Array.isArray(raw)
		? raw.map(normaliser).filter((s): s is ResumeSnapshot => s !== null)
		: [];
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
	const list: ResumeSnapshot[] = Array.isArray(raw)
		? raw.map(normaliser).filter((s): s is ResumeSnapshot => s !== null)
		: [];
	lsSet(
		RESUME_KEY,
		list.filter((s) => s.key !== key),
	);
}

export function clearResumes(): void {
	lsSet(RESUME_KEY, []);
}
