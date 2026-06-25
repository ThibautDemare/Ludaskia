/* ============================================================
   Primitive d'accessibilité des modales (#235) — focus-trap, arrière-plan
   inerte, verrou de défilement et restauration du focus, EXTRAITS de
   `ui-modal.ts` (#230) pour devenir LA mécanique unique réutilisée par TOUTES
   les modales de l'app — y compris les modales « statiques » à contenu
   sur-mesure (récompenses, trophées, passage de niveau, célébration, choix de
   classe, voile de mise à jour) qui ne passent pas par le constructeur
   générique de `ui-modal.ts`.

   Séparation des préoccupations : ce module ne connaît QUE la mécanique a11y
   (aucune dépendance au contenu ni au TTS). `activateModal(overlay, opts)`
   s'applique sur une modale DÉJÀ présente dans le DOM et renvoie une fonction
   `release()` à appeler à la fermeture (retire les écouteurs, libère
   l'arrière-plan, restaure le focus). Une seule implémentation du piège de
   focus pour toute l'app.
   ============================================================ */

/** Sélecteur des éléments naturellement focusables (hors `tabindex="-1"`). */
export const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ---------- Arrière-plan inerte + verrou de défilement ---------- */
/* Rend tout le reste du <body> non focusable / non lu par les technologies
   d'assistance, et bloque le défilement de la page derrière la modale.
   PRÉCONDITION : `overlay` est un enfant DIRECT de <body> (cas de toutes les
   modales de l'app) — on rend `inert` ses frères, jamais lui-même. Limite
   assumée : une live-region globale (ex. toast `.ui-toast`, enfant de <body>)
   présente AU MOMENT de l'ouverture est inertée donc rendue muette tant que la
   modale est ouverte ; rare en pratique (toast et modale rarement simultanés). */
function lockBackground(overlay: HTMLElement, lockScroll: boolean): () => void {
	const inerted: HTMLElement[] = [];
	for (const child of Array.from(document.body.children)) {
		if (child === overlay) continue;
		const el = child as HTMLElement;
		if (el.hasAttribute('inert')) continue; // ne pas « libérer » plus tard ce qui l'était déjà
		el.setAttribute('inert', '');
		inerted.push(el);
	}
	// Le verrou de défilement est OPTIONNEL : le guide de première visite (ui/tour)
	// doit pouvoir amener chaque bloc à l'écran (scrollIntoView) tout en gardant le
	// focus-trap + l'arrière-plan inerte. `inert` n'empêche pas le défilement
	// programmatique, seul `overflow:hidden` le ferait — d'où ce drapeau.
	const prevOverflow = document.body.style.overflow;
	if (lockScroll) document.body.style.overflow = 'hidden';
	return () => {
		inerted.forEach((el) => el.removeAttribute('inert'));
		if (lockScroll) document.body.style.overflow = prevOverflow;
	};
}

/* ---------- Focus ---------- */
/* Focusables réellement visibles. `offsetParent !== null` écarte ce qui est
   masqué (display:none, ancêtre caché). On garde malgré tout l'élément
   actuellement focalisé (`=== document.activeElement`) : son `offsetParent` peut
   être `null` (ex. `position:fixed`) sans qu'il faille l'exclure du bouclage. */
function visibleFocusables(root: HTMLElement): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(el) => el.offsetParent !== null || el === document.activeElement,
	);
}

/* Boucle le focus à l'intérieur de la modale (Tab depuis le dernier → premier,
   Shift+Tab depuis le premier → dernier). */
function trapTab(e: KeyboardEvent, root: HTMLElement): void {
	const items = visibleFocusables(root);
	if (!items.length) {
		e.preventDefault();
		return;
	}
	const first = items[0];
	const last = items[items.length - 1];
	const active = document.activeElement as HTMLElement | null;
	if (e.shiftKey && (active === first || !root.contains(active))) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && (active === last || !root.contains(active))) {
		e.preventDefault();
		first.focus();
	}
}

/* Rend le focus au déclencheur ; s'il a disparu (re-rendu, profil supprimé),
   repli explicite fourni par l'appelant — jamais <body> (qui ferait perdre le
   contexte au lecteur d'écran). */
function restoreFocus(trigger: HTMLElement | null, fallback?: () => HTMLElement | null): void {
	if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
		trigger.focus();
		return;
	}
	fallback?.()?.focus?.();
}

export interface ModalA11yOptions {
	/** Déclencheur dont le focus est restauré à la fermeture. Défaut : l'élément
	    actif au moment de l'activation. */
	trigger?: HTMLElement | null;
	/** Appelé quand Échap est pressé. OMETTRE pour un choix forcé (Échap ignoré,
	    la modale reste ouverte) — le focus-trap s'applique quand même. */
	onEscape?: () => void;
	/** Repli de focus si le déclencheur a disparu (re-rendu, profil supprimé…). */
	restoreFocusTo?: () => HTMLElement | null;
	/** Élément à focuser à l'ouverture. Défaut : 1er focusable de la modale. */
	initialFocus?: HTMLElement | null;
	/** Verrouiller le défilement de la page (`overflow:hidden`) ? Défaut : `true`
	    (toutes les modales). Passer `false` pour un overlay qui doit faire défiler
	    la page (guide de première visite : scrollIntoView vers le bloc surligné). */
	lockScroll?: boolean;
}

/** Active focus-trap + arrière-plan inerte + scroll-lock sur une modale déjà
    présente dans le DOM (`overlay` = le `.modal-overlay` plein écran, enfant
    direct de <body>). Renvoie `release()` : retire les écouteurs, libère
    l'arrière-plan et restaure le focus au déclencheur. `release()` est
    idempotent (appels multiples sans effet après le premier). */
export function activateModal(overlay: HTMLElement, opts: ModalA11yOptions = {}): () => void {
	const trigger = opts.trigger ?? (document.activeElement as HTMLElement | null);
	const unlock = lockBackground(overlay, opts.lockScroll !== false);

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			if (!opts.onEscape) return; // choix forcé : on n'intercepte pas Échap
			// On consomme l'événement : sinon le handler ESC global (main.ts) se
			// déclencherait aussi (fermeture d'autres modales, tiroir, menu profil…).
			e.preventDefault();
			e.stopPropagation();
			opts.onEscape();
		} else if (e.key === 'Tab') {
			trapTab(e, overlay);
		}
	}
	// Capture (true) pour passer AVANT le handler ESC global de main.ts.
	document.addEventListener('keydown', onKeydown, true);

	// Focus initial : l'élément désigné, sinon le 1er focusable de la modale.
	(opts.initialFocus ?? overlay.querySelector<HTMLElement>(FOCUSABLE))?.focus();

	let released = false;
	return function release(): void {
		if (released) return;
		released = true;
		document.removeEventListener('keydown', onKeydown, true);
		unlock();
		restoreFocus(trigger, opts.restoreFocusTo);
	};
}
