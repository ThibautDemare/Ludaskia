/* ============================================================
   Pied de page global (#336) — rendu et clin d'œil « pluie de cookies ».

   Module PARTAGÉ par l'app (app.html / main.ts) ET la vitrine (index.html /
   vitrine.ts). Il NE dépend donc PAS de la couche stockage / profils / eggs
   (la vitrine est volontairement statique, sans moteur) : la pluie de cookies
   est un pur jouet DOM, gratuit, et c'est l'appelant (l'app) qui décide, via le
   callback `onTrigger`, de ranger le souvenir dans l'album des eggs.

   « Pas de cookies… sauf les bons ! » : l'icône cookie du pied de page est un
   déclencheur DISCRET (un simple emoji cliquable, pas un bouton-CTA) — un clin
   d'œil à dénicher, pas une invitation à cliquer à tout prix. Un clic fait tomber
   une averse BORNÉE de cookies qui se posent en bas et y RESTENT : ils ne
   s'effacent PAS tout seuls, c'est en les touchant qu'on les croque (ils éclatent
   en miettes). Aucun score, aucun compteur, aucun « tout nettoyé ! » : un jouet,
   pas une tâche à accomplir. Une fois tous croqués, l'averse se relance.

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
	// PAS de nettoyage automatique : les cookies RESTENT posés jusqu'à ce qu'on les
	// croque. La couche est retirée seulement quand le dernier a été croqué
	// (cleanupIfEmpty) — ce qui réarme le déclencheur (cf. le garde anti-empilement).
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

// Croquer un cookie : il éclate en miettes (projetées en gerbe), puis disparaît.
// Idempotent (un cookie déjà croqué ne refait rien).
function croquer(c: HTMLElement, reduit: boolean): void {
	if (c.dataset.eaten) return;
	c.dataset.eaten = '1';
	const layer = c.parentElement;
	if (!reduit) {
		semerMiettes(c);
		c.classList.add('cookie-rain-eaten');
		window.setTimeout(() => {
			c.remove();
			cleanupIfEmpty(layer);
		}, 340);
	} else {
		// Mouvement réduit : pas d'animation ni de miettes, mais le clic est quand
		// même récompensé — le cookie disparaît.
		c.remove();
		cleanupIfEmpty(layer);
	}
}

// Retire la couche quand le dernier cookie a été croqué (réarme le déclencheur).
// On attend la fin des miettes pour ne pas les couper net.
function cleanupIfEmpty(layer: HTMLElement | null): void {
	if (!layer || layer.querySelector('.cookie-rain-item')) return;
	window.setTimeout(() => {
		if (layer.parentElement && !layer.querySelector('.cookie-rain-item')) layer.remove();
	}, 680);
}

function semerMiettes(c: HTMLElement): void {
	const layer = c.parentElement;
	if (!layer) return;
	const r = c.getBoundingClientRect();
	const cx = r.left + r.width / 2;
	const cy = r.top + r.height / 2;
	const N = 6;
	for (let i = 0; i < N; i++) {
		const m = document.createElement('span');
		m.className = 'cookie-crumb';
		m.style.left = `${cx}px`;
		m.style.top = `${cy}px`;
		// Gerbe radiale franche : réparties tout autour + un peu de jeu, projetées
		// nettement (34-74 px) pour qu'on les voie vraiment gicler du cookie.
		const angle = (Math.PI * 2 * i) / N + (Math.random() * 0.8 - 0.4);
		const dist = 34 + Math.random() * 40;
		m.style.setProperty('--dx', `${Math.round(Math.cos(angle) * dist)}px`);
		m.style.setProperty('--dy', `${Math.round(Math.sin(angle) * dist)}px`);
		const taille = 5 + Math.round(Math.random() * 3); // 5-8 px, miettes variées
		m.style.width = `${taille}px`;
		m.style.height = `${taille}px`;
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
