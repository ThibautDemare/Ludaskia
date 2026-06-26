/* ============================================================
   Pied de page global (#336) — rendu et clin d'œil « pluie de cookies ».

   Module PARTAGÉ par l'app (app.html / main.ts) ET la vitrine (index.html /
   vitrine.ts). Il NE dépend donc PAS de la couche stockage / profils / eggs
   (la vitrine est volontairement statique, sans moteur) : la pluie de cookies
   est un pur jouet DOM, gratuit, et c'est l'appelant (l'app) qui décide, via le
   callback `onTrigger`, de ranger le souvenir dans l'album des eggs.

   « Pas de cookies… sauf les bons ! » : l'icône cookie du pied de page est un
   déclencheur VISIBLE et assumé (contrairement aux eggs cachés de #331). Un clic
   fait tomber une averse BORNÉE de cookies qui se posent en bas et s'y arrêtent ;
   l'enfant peut en croquer un à un (ils éclatent en miettes), ou les ignorer (ils
   s'effacent seuls). Aucun score, aucun compteur, aucun « tout nettoyé ! » : un
   jouet jetable, pas une tâche à accomplir.

   Garde-fous (cf. #336 / #331) : strictement gratuit ; couche décorative
   `aria-hidden`, jamais de vol de focus, jamais bloquante (cookies seuls
   cliquables, sous les modales) ; DOUBLE garde mouvement réduit (préférence
   système `prefers-reduced-motion` OU réglage profil `html.anim-reduced`) →
   pas de chute animée, mais le clic reste récompensé (le cookie disparaît) ;
   pas de clignotement.
   ============================================================ */

// Mouvement réduit : lu UNIQUEMENT dans le DOM (classe posée par les préférences
// + média système), pour rester indépendant de la couche profils (la vitrine ne
// la charge pas). `html.anim-reduced` reflète le réglage in-app du profil actif.
function mouvementReduit(): boolean {
	return (
		(typeof document !== 'undefined' &&
			document.documentElement.classList.contains('anim-reduced')) ||
		(typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)
	);
}

const COOKIE_EMOJI = '🍪';
const COOKIE_COUNT = 14; // averse BORNÉE (une seule vague, fin claire)
const COOKIE_COUNT_REDUIT = 5; // version posée, sans chute (mouvement réduit)

/* Déclenche une averse de cookies. Idempotent tant qu'une averse est en cours :
   recliquer ne réempile PAS dix pluies (hygiène de rendu, pas un rationnement). */
export function cookieRain(): void {
	if (typeof document === 'undefined') return;
	if (document.querySelector('.cookie-rain-layer')) return; // déjà une averse en cours
	const reduit = mouvementReduit();
	const layer = document.createElement('div');
	layer.className = 'cookie-rain-layer';
	layer.setAttribute('aria-hidden', 'true');

	const n = reduit ? COOKIE_COUNT_REDUIT : COOKIE_COUNT;
	for (let i = 0; i < n; i++) layer.appendChild(makeCookie(i, n, reduit));
	document.body.appendChild(layer);

	// Nettoyage automatique : les cookies non croqués s'effacent d'eux-mêmes
	// (cliquer reste optionnel ; la scène se finit pareil si on ne touche rien).
	window.setTimeout(() => layer.remove(), reduit ? 6000 : 9000);
}

function makeCookie(i: number, n: number, reduit: boolean): HTMLElement {
	const c = document.createElement('span');
	c.className = 'cookie-rain-item';
	c.textContent = COOKIE_EMOJI;
	// Étalement horizontal : une case par cookie + un peu de jeu, borné aux marges.
	const base = ((i + 0.5) / n) * 100;
	const left = Math.min(96, Math.max(3, base + (Math.random() * 16 - 8)));
	c.style.left = `${left}%`;
	if (!reduit) {
		// Cascade (pas tous d'un bloc) + durée et rotation variées : ça « pleut ».
		c.style.setProperty('--fall', `${(2.6 + Math.random() * 0.9).toFixed(2)}s`);
		c.style.setProperty('--spin', `${Math.round(Math.random() * 40 - 20)}deg`);
		c.style.animationDelay = `${Math.round(i * 90 + Math.random() * 120)}ms`;
	}
	c.addEventListener('click', () => croquer(c, reduit));
	return c;
}

// Croquer un cookie : il éclate en miettes (qui s'effacent), puis disparaît.
// Idempotent (un cookie déjà croqué ne refait rien).
function croquer(c: HTMLElement, reduit: boolean): void {
	if (c.dataset.eaten) return;
	c.dataset.eaten = '1';
	if (!reduit) {
		semerMiettes(c);
		c.classList.add('cookie-rain-eaten');
		window.setTimeout(() => c.remove(), 340);
	} else {
		// Mouvement réduit : pas d'animation ni de miettes, mais le clic est quand
		// même récompensé — le cookie disparaît.
		c.remove();
	}
}

function semerMiettes(c: HTMLElement): void {
	const layer = c.parentElement;
	if (!layer) return;
	const r = c.getBoundingClientRect();
	const cx = r.left + r.width / 2;
	const cy = r.top + r.height / 2;
	for (let i = 0; i < 4; i++) {
		const m = document.createElement('span');
		m.className = 'cookie-crumb';
		m.style.left = `${cx}px`;
		m.style.top = `${cy}px`;
		m.style.setProperty('--cx', `${(i % 2 ? 1 : -1) * (6 + i * 5)}px`);
		layer.appendChild(m);
		window.setTimeout(() => m.remove(), 650);
	}
}

/* Renseigne l'année courante du copyright dans tous les `[data-footer-year]`
   (le markup porte une année de repli statique, mise à jour ici au chargement). */
export function fillFooterYear(): void {
	if (typeof document === 'undefined') return;
	const annee = String(new Date().getFullYear());
	document
		.querySelectorAll<HTMLElement>('[data-footer-year]')
		.forEach((el) => (el.textContent = annee));
}

/* Câble le bouton cookie du pied de page. `onTrigger` (optionnel) est invoqué à
   chaque déclenchement AVANT la pluie : l'app y range le souvenir dans l'album
   (idempotent côté eggs) ; la vitrine ne passe rien (pur jouet sans album). */
export function initFooterCookie(onTrigger?: () => void): void {
	if (typeof document === 'undefined') return;
	document.getElementById('footerCookie')?.addEventListener('click', () => {
		onTrigger?.();
		cookieRain();
	});
}
