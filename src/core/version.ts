/* ============================================================
   Version de l'application & règles du « moment sûr » (PURES).
   ------------------------------------------------------------
   L'app est déployée très souvent (GitHub Pages). Un enfant qui garde l'onglet
   ouvert ne pense pas à rafraîchir : quand le service worker signale qu'une
   nouvelle version est installée et attend (#306), on bascule tout seul — mais
   seulement à un MOMENT SÛR (écran calme, hors exercice, après un court délai
   d'inactivité), une seule fois par version (anti-boucle).

   `canReloadNow` est devenue la définition partagée de « l'application est
   calme » : la mise à jour s'en sert pour recharger, le réchauffement du cache
   hors-ligne pour télécharger en fond, le rappel de sauvegarde pour s'afficher.
   Ce module ne porte que la décision PURE ; l'observation (écran affiché,
   inactivité, visibilité de l'onglet) est dans `src/ui/app-calme.ts`, et
   l'orchestration dans `src/ui/mise-a-jour.ts` et `src/ui/pwa.ts`.
   ============================================================ */

// Injectée par Vite (`define`). `typeof` protège les contextes où le
// remplacement n'a pas lieu (sans `ReferenceError`).
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Photo de l'état observable au moment d'une tentative de rechargement. */
export interface ReloadState {
	/** une nouvelle version a été détectée */
	updatePending: boolean;
	/** on est sur un écran « menu » (accueil, navigation), pas un exercice */
	calmScreen: boolean;
	/** sprint / révision en cours : recharger perdrait la progression */
	busy: boolean;
	/** on a DÉJÀ rechargé pour cette version (garde-fou anti-boucle) */
	alreadyReloaded: boolean;
	/** temps (ms) depuis la dernière interaction de l'enfant */
	idleMs: number;
	/** temps (ms) depuis que l'onglet est (re)devenu visible */
	visibleMs: number;
}

export interface ReloadThresholds {
	/** ne pas couper une interaction qui vient d'avoir lieu */
	minIdleMs: number;
	/** laisser un court instant après le retour sur l'onglet (anti-surprise) */
	minVisibleMs: number;
}

/** Peut-on recharger MAINTENANT, sans surprendre ni pénaliser l'enfant ? */
export function canReloadNow(s: ReloadState, t: ReloadThresholds): boolean {
	return (
		s.updatePending &&
		s.calmScreen &&
		!s.busy &&
		!s.alreadyReloaded &&
		s.idleMs >= t.minIdleMs &&
		s.visibleMs >= t.minVisibleMs
	);
}
