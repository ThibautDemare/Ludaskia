/* ============================================================
   Version de l'application & règles d'auto-actualisation (PURES).
   ------------------------------------------------------------
   L'app est déployée très souvent (GitHub Pages). Un enfant qui garde
   l'onglet ouvert ne pense pas à rafraîchir : on détecte qu'un nouveau
   déploiement est en ligne en comparant la version embarquée
   (`__APP_VERSION__`, injectée au build) au `version.json` publié à côté,
   et on recharge — mais seulement à un MOMENT SÛR (écran calme, hors
   exercice, après un court délai d'inactivité), une seule fois par version
   (anti-boucle). Ce module ne porte que la logique PURE (comparaison +
   décision) ; l'orchestration DOM/réseau est dans `src/ui/version-check.ts`.
   ============================================================ */

// Injectée par Vite (`define`). `typeof` protège les contextes où le
// remplacement n'a pas lieu (sans `ReferenceError`).
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Une version distante valide et DIFFÉRENTE de la version embarquée ? */
export function isNewerVersion(current: string, latest: unknown): latest is string {
	return typeof latest === 'string' && latest.length > 0 && latest !== current;
}

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
