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

   Le même module câble le bouton « Arrêter le décor » (#785), sur le même principe
   d'indépendance : voir `initFooterDecor`.
   ============================================================ */
import pauseSvg from '@phosphor-icons/core/assets/bold/pause-bold.svg?raw';
import playSvg from '@phosphor-icons/core/assets/bold/play-bold.svg?raw';
import { brut, type SafeHtml } from '../core/html';

// Mouvement réduit : lu UNIQUEMENT dans le DOM (classe posée par les préférences
// + média système), pour rester indépendant de la couche profils (la vitrine ne
// la charge pas). `html.anim-reduced` reflète le réglage in-app du profil actif.
const MEDIA_MOUVEMENT_REDUIT = '(prefers-reduced-motion: reduce)';
/* La moitié « appareil » seule : les Préférences de l'appli doivent pouvoir dire
   laquelle des deux fige le décor (#785, case « Figer le décor »). */
export function mouvementReduitSysteme(): boolean {
	return (
		typeof window !== 'undefined' && window.matchMedia?.(MEDIA_MOUVEMENT_REDUIT).matches === true
	);
}
/* Changement de cette préférence en cours de visite : UN seul écouteur sur la requête
   média, qui prévient chaque abonné dans l'ordre d'inscription (le bouton du pied de page
   ici, la case des Préférences dans `main.ts`). */
const abonnesMouvementReduit: Array<() => void> = [];
export function surMouvementReduitChange(rappel: () => void): void {
	if (typeof window === 'undefined') return;
	if (abonnesMouvementReduit.length === 0)
		window
			.matchMedia?.(MEDIA_MOUVEMENT_REDUIT)
			.addEventListener?.('change', () => abonnesMouvementReduit.forEach((f) => f()));
	abonnesMouvementReduit.push(rappel);
}
function mouvementReduit(): boolean {
	return (
		(typeof document !== 'undefined' &&
			document.documentElement.classList.contains('anim-reduced')) ||
		mouvementReduitSysteme()
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

/* ---------- Bouton « Arrêter le décor » (#785) ----------
   Fige la forêt et le décor de saison (classe `decor-fige` sur <html>, lue par les
   feuilles), et seulement eux : la pluie de cookies, l'aide animée et les effets de
   réussite continuent (critère 25).
   Comme pour les cookies, ce module ne sait pas OÙ le réglage est mémorisé : l'appli le
   range dans le profil actif (critère 4), la vitrine et le guide sur l'appareil
   (critère 5). C'est l'appelant qui fournit la lecture et l'écriture. */
export interface ReglageDecor {
	lire(): boolean;
	ecrire(fige: boolean): void;
}

/* Libellés : c'est le TEXTE qui porte l'état, pas la couleur ni l'icône (critère 2). Le
   nom accessible est ce texte même, sans `aria-pressed` en plus : avec un libellé qui
   change, l'annonce deviendrait une double négation (avis `designer-ux-enfant`).
   « Arrêter » plutôt que « Figer » : plus concret pour un enfant de CE2. */
const LIBELLE_ARRETER = 'Arrêter le décor';
const LIBELLE_RELANCER = 'Relancer le décor';

/* Icônes Phosphor pause / lecture, importées seules : `icon.ts` embarquerait toute sa
   table d'icônes dans la vitrine et le guide, qui n'en utilisent que ces deux-là. */
function iconeDecor(svg: string): SafeHtml {
	return brut(svg.replace('<svg ', '<svg class="ph-icon" focusable="false" aria-hidden="true" '));
}
const ICONE_PAUSE = iconeDecor(pauseSvg);
const ICONE_LECTURE = iconeDecor(playSvg);

let reglageDecor: ReglageDecor | null = null;

/* Message d'état annoncé après un clic. Le nouveau libellé du bouton ne suffit pas : selon
   le lecteur d'écran, le changement de nom d'un bouton qui a déjà le focus n'est pas relu.
   La région est posée À VIDE dès l'initialisation (une région live créée en même temps que
   son texte n'est pas annoncée), et seul le clic l'alimente : ni le chargement ni un
   changement de profil ne parlent. */
const ETAT_ARRETE = 'Décor arrêté.';
const ETAT_RELANCE = 'Décor relancé.';

/* Câble le bouton `#footerDecor` et applique l'état mémorisé. Le bouton est livré
   `hidden` dans le balisage : sans JS, il ne promet rien qu'il ne pourrait tenir. */
export function initFooterDecor(reglage: ReglageDecor): void {
	if (typeof document === 'undefined') return;
	reglageDecor = reglage;
	const bouton = document.getElementById('footerDecor');
	if (bouton) {
		const etat = document.createElement('span');
		etat.className = 'footer-decor-etat';
		etat.setAttribute('role', 'status');
		bouton.after(etat);
		bouton.addEventListener('click', () => {
			const fige = !reglage.lire();
			reglage.ecrire(fige);
			rafraichirDecor();
			// Vider puis écrire au frame suivant : deux clics identiques de suite sont tous
			// deux annoncés (un texte inchangé ne déclencherait rien).
			etat.textContent = '';
			requestAnimationFrame(() => (etat.textContent = fige ? ETAT_ARRETE : ETAT_RELANCE));
		});
	}
	// L'appareil peut changer de préférence en cours de visite : le bouton suit.
	surMouvementReduitChange(rafraichirDecor);
	rafraichirDecor();
}

/* Remet <html> et le bouton d'accord avec le réglage. À rappeler quand il change
   ailleurs (case des Préférences, changement de profil, « Réduire les animations »).
   Ne recrée rien : seuls le texte et l'icône changent, donc le focus reste sur le bouton
   et le lecteur d'écran lit le nouveau libellé. */
export function rafraichirDecor(): void {
	if (typeof document === 'undefined' || !reglageDecor) return;
	const fige = reglageDecor.lire();
	document.documentElement.classList.toggle('decor-fige', fige);
	const bouton = document.getElementById('footerDecor');
	if (!bouton) return;
	// Animations réduites : le décor est déjà immobile, le bouton n'aurait rien à faire
	// (critère 7). Le réglage, lui, est gardé tel quel pour le jour où elles reviennent.
	bouton.hidden = mouvementReduit();
	const texte = bouton.querySelector('.footer-decor-texte');
	if (texte) texte.textContent = fige ? LIBELLE_RELANCER : LIBELLE_ARRETER;
	const icone = bouton.querySelector('.footer-decor-icone');
	if (icone) icone.innerHTML = (fige ? ICONE_LECTURE : ICONE_PAUSE).balisage;
}
