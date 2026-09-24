/* ============================================================
   Liste déroulante de profils (barre d'outils)
   ------------------------------------------------------------
   Extrait de l'ancien main.js : ces helpers sont utilisés par la
   navigation (closeProfileMenu dans setToolbar) et par le câblage
   d'événements de main.ts. Isolés ici pour éviter une dépendance
   circulaire lourde entre navigation et l'entrée.
   ============================================================ */
import { renderProfileMenu } from './render';
import { icon } from './icon';

/* ------------------------------------------------------------
   Tiroir latéral de la barre d'outils (mobile)
   ------------------------------------------------------------
   Sur mobile, les contrôles secondaires (niveau/XP, profil, Accueil,
   Imprimer) sont repliés dans #toolbarDrawer, ouvert par le hamburger.
   On garde dans la barre logo + chrono + score + Vérifier. */
/* Hauteur RÉELLE de la barre, posée en variable CSS `--toolbar-h` : le tiroir et son
   voile démarrent dessous, et depuis #718 le champ de recherche de l'écran des matières
   s'y colle aussi (`position: sticky; top: var(--toolbar-h)`). */
function poserHauteurBarre(): void {
	const tb = document.querySelector<HTMLElement>('.toolbar');
	if (!tb) return;
	document.documentElement.style.setProperty(
		'--toolbar-h',
		`${Math.round(tb.getBoundingClientRect().height)}px`,
	);
}

/** Tient `--toolbar-h` à jour EN CONTINU (appelé une fois au démarrage). Jusqu'à #718 la
    variable n'était posée qu'à l'ouverture du tiroir : tout autre consommateur vivait sur
    le repli CSS de 60 px, faux dès que la barre passe sur deux lignes (zoom texte 200 %,
    confort de lecture, titre long) — et la barre, au `z-index` supérieur, recouvrait alors
    le haut de ce qui se croyait collé dessous (relecture a11y : SC 2.4.11 / 1.4.10). Un
    `ResizeObserver` sur la barre corrige la cause pour tous les consommateurs, plutôt que
    de relever le repli chez chacun. Son premier appel est synchrone : la valeur est juste
    dès la première mise en page. */
export function surveillerHauteurBarre(): void {
	const tb = document.querySelector<HTMLElement>('.toolbar');
	if (!tb || typeof ResizeObserver === 'undefined') return;
	poserHauteurBarre();
	new ResizeObserver(poserHauteurBarre).observe(tb);
}

export function openDrawer() {
	const d = document.getElementById('toolbarDrawer');
	const burger = document.getElementById('toolbarBurger');
	if (!d || !burger) return;
	// Mesure ponctuelle conservée : la barre change d'état (menu vs exercice) juste avant
	// l'ouverture, et l'observer peut ne pas avoir encore rendu son tour.
	poserHauteurBarre();
	d.classList.add('open');
	const scrim = document.getElementById('toolbarScrim');
	if (scrim) scrim.hidden = false;
	burger.setAttribute('aria-expanded', 'true');
	burger.setAttribute('aria-label', 'Fermer le menu');
	burger.innerHTML = icon('x').balisage;
	document.body.classList.add('drawer-open');
}
export function closeDrawer() {
	const d = document.getElementById('toolbarDrawer');
	if (d) d.classList.remove('open');
	const scrim = document.getElementById('toolbarScrim');
	if (scrim) scrim.hidden = true;
	const burger = document.getElementById('toolbarBurger');
	if (burger) {
		burger.setAttribute('aria-expanded', 'false');
		burger.setAttribute('aria-label', 'Ouvrir le menu');
		burger.innerHTML = icon('list').balisage;
	}
	document.body.classList.remove('drawer-open');
	closeProfileMenu(); // le sous-menu profils ne survit pas à la fermeture du tiroir
}
export function toggleDrawer() {
	const d = document.getElementById('toolbarDrawer');
	if (!d) return;
	if (d.classList.contains('open')) closeDrawer();
	else openDrawer();
}

export function openProfileMenu() {
	const el = document.getElementById('profileMenu');
	if (!el) return;
	renderProfileMenu();
	el.hidden = false;
}
export function closeProfileMenu() {
	const el = document.getElementById('profileMenu');
	if (el) el.hidden = true;
}
export function toggleProfileMenu() {
	const el = document.getElementById('profileMenu');
	if (!el) return;
	if (el.hidden) openProfileMenu();
	else closeProfileMenu();
}
