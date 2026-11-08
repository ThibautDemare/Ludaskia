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
   modales de l'app) — on rend `inert` ses frères, jamais lui-même.

   EXCEPTION, `data-annonce-persistante` : une région vivante ainsi marquée n'est jamais
   inertée. Sans elle, une région enfant de <body> présente à l'ouverture devient MUETTE
   pour toute la durée de la modale — et c'est précisément le cas du verdict de correction
   (#717) : valider une fiche sans faute ouvre une modale de récompense, qui avalait
   l'annonce du score au moment le plus flatteur. La parade a d'abord été de RETARDER la
   modale ; c'était pire, l'enfant pouvait cliquer un lien de la fiche pendant le sursis et
   voir la modale lui sauter dessus (constat : `e2e/etayage.spec.ts` est tombé dessus).
   On lève donc l'inertage plutôt que de décaler l'interface. Aucun risque de fuite du
   piège à focus : ce qu'on exempte est un texte `sr-only` non focusable — à n'accorder
   qu'à ça, jamais à un conteneur qui porte des contrôles.

   RÉENTRANT (retour terrain, nov. 2026) : deux modales peuvent être ouvertes à la fois
   (une célébration rouverte par une navigation sous la première, une célébration par-dessus
   le passage de niveau). L'ancienne règle, « déjà inerte = pas à moi, je n'y touche pas »,
   faisait que la 2e ouverture ne tenait RIEN. Si la 1re libération se perdait, toute la page
   restait inerte jusqu'au rechargement : plus un bouton ne répondait, Accueil compris. Et
   la 2e modale, frère de la 1re, restait elle-même inerte, donc incliquable. D'où :
   - un COMPTE de verrous par élément, tenu par les modales seules : l'élément redevient
     actif quand le dernier verrou tombe, quel que soit l'ordre de fermeture. Un élément
     inerte AVANT toute modale (posé par un tiers) n'est jamais compté, donc jamais libéré ;
   - la modale qu'on ouvre est libérée le temps de sa vie, même si une modale déjà ouverte
     la tenait ; elle lui est rendue à la fermeture ;
   - le verrou de défilement est compté de même : la valeur d'origine revient quand la
     DERNIÈRE modale qui le demandait se ferme. Un tiers qui modifierait
     `body.style.overflow` pendant qu'une modale est ouverte serait écrasé à la dernière
     fermeture : aucun ne le fait aujourd'hui.
   ÉCARTÉ (relecture qualité) : rendre la fonction rendue par `lockBackground` idempotente.
   Elle n'est pas exportée, et son seul appelant, `release()` d'`activateModal`, l'est déjà
   (`released`) : un double décompte est impossible par construction. */
const verrous = new WeakMap<Element, number>();
let verrousDefilement = 0;
let overflowOrigine = '';

function lockBackground(overlay: HTMLElement, lockScroll: boolean): () => void {
	const tenus: HTMLElement[] = [];
	for (const child of Array.from(document.body.children)) {
		if (child === overlay) continue;
		const el = child as HTMLElement;
		if (el.hasAttribute('data-annonce-persistante')) continue; // cf. en-tête
		const n = verrous.get(el) ?? 0;
		if (n === 0 && el.hasAttribute('inert')) continue; // inerte hors de nos verrous : pas à nous
		verrous.set(el, n + 1);
		el.setAttribute('inert', '');
		tenus.push(el);
	}
	if ((verrous.get(overlay) ?? 0) > 0) overlay.removeAttribute('inert');
	// Le verrou de défilement est OPTIONNEL : le guide de première visite (ui/tour)
	// doit pouvoir amener chaque bloc à l'écran (scrollIntoView) tout en gardant le
	// focus-trap + l'arrière-plan inerte. `inert` n'empêche pas le défilement
	// programmatique, seul `overflow:hidden` le ferait — d'où ce drapeau.
	if (lockScroll) {
		if (verrousDefilement === 0) {
			overflowOrigine = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
		}
		verrousDefilement++;
	}
	return () => {
		for (const el of tenus) {
			const n = (verrous.get(el) ?? 1) - 1;
			if (n > 0) verrous.set(el, n);
			else {
				verrous.delete(el);
				el.removeAttribute('inert');
			}
		}
		// Encore tenue par une autre modale ouverte : on la lui rend.
		if ((verrous.get(overlay) ?? 0) > 0) overlay.setAttribute('inert', '');
		if (lockScroll && verrousDefilement > 0) {
			verrousDefilement--;
			if (verrousDefilement === 0) document.body.style.overflow = overflowOrigine;
		}
	};
}

/* Pile des modales ouvertes, la dernière au DESSUS. Chaque modale garde son écouteur
   `keydown` en capture sur `document` : sans arbitrage, deux modales ouvertes réagissaient
   toutes deux. Le piège Tab de celle du dessous annulait un Tab au milieu de celle du
   dessus (focus figé), et un seul Échap fermait les deux (`stopPropagation` n'arrête pas
   les autres écouteurs du même nœud). Relecture a11y, retour terrain nov. 2026. */
const pileModales: object[] = [];

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
		// « Encore dans le DOM » ne veut pas dire « focalisable » : un déclencheur MASQUÉ
		// (display:none, ancêtre masqué) refuse le focus sans bruit, et l'on finissait sur
		// <body> sans jamais tenter le repli (relectures qualité et a11y, nov. 2026). On juge
		// donc au RÉSULTAT. Cas d'origine : une modale ouverte depuis un bouton d'une autre
		// modale, fermée entre-temps. Spec : e2e/modale-repli-focus.spec.ts (vrai navigateur ;
		// happy-dom accepte le focus sur un élément masqué).
		if (document.activeElement === trigger) return;
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
	const jeton = {};
	pileModales.push(jeton);

	function onKeydown(e: KeyboardEvent): void {
		// Seule la modale du DESSUS pilote le clavier (cf. `pileModales`).
		if (pileModales[pileModales.length - 1] !== jeton) return;
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
	// `preventScroll` : donner le focus fait normalement défiler le navigateur jusqu'à
	// l'élément. Sur une modale plus haute que l'écran dont le focus initial est en bas de
	// carte (le panneau d'étayage vise son bouton de sortie), elle s'ouvrait donc DÉJÀ
	// défilée à son pied — texte passé, et croix de fermeture sortie de l'écran, au point
	// d'être injoignable au doigt comme à la souris (échec intermittent de
	// `e2e/etayage-redige.spec.ts`). Une modale est déjà positionnée là où on veut la lire :
	// elle n'a aucune raison de bouger à l'ouverture. On ne le met QUE sur le focus initial ;
	// les focus de la boucle Tab, eux, doivent bien amener l'élément à l'écran.
	(opts.initialFocus ?? overlay.querySelector<HTMLElement>(FOCUSABLE))?.focus({
		preventScroll: true,
	});

	let released = false;
	return function release(): void {
		if (released) return;
		released = true;
		document.removeEventListener('keydown', onKeydown, true);
		const auDessus = pileModales[pileModales.length - 1] === jeton;
		const rang = pileModales.indexOf(jeton);
		// `splice(-1, 1)` retirerait la modale du DESSUS : jamais sans le jeton trouvé.
		if (rang >= 0) pileModales.splice(rang, 1);
		unlock();
		// Recouverte par une autre modale encore ouverte : le focus est dans celle-ci et doit
		// y rester. Le déclencheur est de toute façon inerte tant qu'elle est ouverte.
		if (auDessus) restoreFocus(trigger, opts.restoreFocusTo);
	};
}
