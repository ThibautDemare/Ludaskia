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
export function openDrawer() {
	const d = document.getElementById('toolbarDrawer');
	const burger = document.getElementById('toolbarBurger');
	if (!d || !burger) return;
	// Le tiroir et le voile démarrent SOUS la barre : on mesure sa hauteur réelle
	// (variable selon l'état : menu vs exercice) et on la pose en variable CSS.
	const tb = document.querySelector('.toolbar') as HTMLElement | null;
	if (tb) {
		document.documentElement.style.setProperty(
			'--toolbar-h',
			`${Math.round(tb.getBoundingClientRect().height)}px`,
		);
	}
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
