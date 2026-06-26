/* ============================================================
   Easter eggs (#331) — rendu et déclencheurs (DOM).

   Trois eggs « cœur sûr », tous ancrés sur l'ACCUEIL (jamais pendant un
   exercice, un sprint chronométré ou une saisie — la seule façon de les
   déclencher est de toucher des zones de l'accueil / d'y voir passer la
   luciole) :
   - A « L'oiseau rieur » : chatouiller la mascotte (taps répétés) → rigolade.
   - B « L'écureuil curieux » : toucher un recoin de la bande forêt → un animal
     se montre. (Hotspot superposé, indépendant du SVG décoratif.)
   - C « La luciole du soir » : apparition AMBIANTE rare qui traverse l'écran ;
     la toucher au vol la range dans l'album. Soumise au réglage « apparitions
     surprises » (encadrant) ET coupée si l'enfant a réduit les animations.

   Garde-fous (cf. #331) : strictement gratuit (aucune XP/étoile/graine) ; les
   visuels sont décoratifs (`aria-hidden`, jamais de vol de focus) ; sous
   animations réduites, les eggs d'exploration deviennent un simple changement
   d'état (pas de particules) et l'ambiant ne se déclenche pas. L'album, lui,
   reste un artefact ACCESSIBLE (vrais boutons).
   ============================================================ */
import { activateModal } from './modal-a11y';
import { animationsReduites } from './preferences';
import { apparitionsSurprises } from '../core/profiles';
import { foundEggs, markEggFound, decideAmbient, type EggDef } from '../core/eggs';
import { escapeHTML } from '../core/utils';

/* ---------- Garde-fous d'animation ---------- */
// Mouvement réduit : réglage in-app du profil OU préférence système. Les eggs
// ambiants sont coupés et les eggs d'exploration jouent leur version statique.
function mouvementReduit(): boolean {
	return (
		animationsReduites() ||
		(typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)
	);
}
// La luciole (ambiant) peut-elle apparaître ? Non si l'adulte a coupé les
// apparitions surprises, non si le mouvement est réduit.
function ambiantAutorise(): boolean {
	return apparitionsSurprises() && !mouvementReduit();
}

function homeEl(): HTMLElement | null {
	return document.getElementById('home');
}

// Rejoue une animation portée par une classe : on la retire, on force un reflow,
// on la remet, puis on la retire après `ms` (pour pouvoir la rejouer au tap suivant).
function replayClass(el: HTMLElement, cls: string, ms: number): void {
	el.classList.remove(cls);
	void el.offsetWidth; // reflow : indispensable pour redéclencher l'animation
	el.classList.add(cls);
	window.setTimeout(() => el.classList.remove(cls), ms);
}

/* ---------- Egg A : chatouiller la mascotte ---------- */
const TAP_FENETRE = 1500; // ms : délai max pour enchaîner les taps
const TAP_CIBLE = 3; // nombre de taps pour chatouiller
let mascTaps = 0;
let mascDernierTap = 0;

function onProgressionClick(e: Event): void {
	const masc = (e.target as HTMLElement).closest<HTMLElement>('.mascotte');
	if (!masc) return;
	const now = Date.now();
	if (now - mascDernierTap > TAP_FENETRE) mascTaps = 0;
	mascDernierTap = now;
	mascTaps += 1;
	if (mascTaps >= TAP_CIBLE) {
		mascTaps = 0;
		declencherMascotte(masc);
	}
}

function declencherMascotte(masc: HTMLElement): void {
	replayClass(masc, 'egg-giggle', 700);
	if (!mouvementReduit()) burstPlumes(masc);
	// Première découverte → la trouvaille se range dans l'album (bouton qui apparaît).
	if (markEggFound('mascotte-rieuse')) renderEggAlbumNav();
}

function burstPlumes(ancre: HTMLElement): void {
	const home = homeEl();
	if (!home) return;
	const r = ancre.getBoundingClientRect();
	const layer = document.createElement('div');
	layer.className = 'egg-plume-layer';
	layer.setAttribute('aria-hidden', 'true');
	for (let i = 0; i < 4; i++) {
		const f = document.createElement('span');
		f.className = 'egg-plume';
		f.textContent = '🪶';
		f.style.left = `${r.left + r.width / 2}px`;
		f.style.top = `${r.top}px`;
		f.style.setProperty('--dx', `${(i % 2 ? 1 : -1) * (14 + i * 9)}px`);
		f.style.animationDelay = `${i * 60}ms`;
		layer.appendChild(f);
	}
	home.appendChild(layer);
	window.setTimeout(() => layer.remove(), 1700);
}

/* ---------- Egg B : l'animal de la forêt ----------
   Le SVG de la bande forêt est purement décoratif et généré : on ne dépend PAS
   de sa structure interne. On superpose un petit hotspot tactile (zone sans
   fonction) au-dessus d'un arbre ; le toucher fait surgir un animal. */
export function mountForestEgg(): void {
	const foret = document.getElementById('homeForet');
	if (!foret || foret.querySelector('.egg-foret-spot')) return;
	const spot = document.createElement('span');
	spot.className = 'egg-foret-spot';
	spot.setAttribute('aria-hidden', 'true');
	const animal = document.createElement('span');
	animal.className = 'egg-animal';
	animal.textContent = '🐿️';
	spot.appendChild(animal);
	spot.addEventListener('click', () => {
		replayClass(animal, 'egg-animal-show', 1800);
		if (markEggFound('ecureuil-foret')) renderEggAlbumNav();
	});
	foret.appendChild(spot);
}

/* ---------- Egg C : la luciole de passage (ambiant) ----------
   Appelé à chaque affichage de l'accueil (écran de repos). La décision
   d'apparition est PURE (decideAmbient) : plancher anti-malchance + cooldown.
   Le compteur reste EN MÉMOIRE (éphémère) pour ne pas écrire en stockage — donc
   ne pas « bumper » la récence du profil — à chaque retour sur l'accueil. */
let ambientSince = 0;

// En mode DEV uniquement (`npm run dev`), la luciole apparaît à presque chaque
// retour sur l'accueil pour faciliter le test. En prod et en test (build /
// Vitest), MODE ≠ 'development' → la rareté normale (decideAmbient) s'applique.
const DEV_AMBIENT = import.meta.env.MODE === 'development';

export function maybeShowAmbient(): void {
	if (!ambiantAutorise()) return;
	const home = homeEl();
	if (!home || home.querySelector('.egg-luciole')) return; // déjà une en vol
	if (DEV_AMBIENT) {
		spawnLuciole(home); // test facilité : pas de tirage, on la montre
		return;
	}
	const { show, next } = decideAmbient(ambientSince, Math.random());
	ambientSince = next;
	if (show) spawnLuciole(home);
}

function spawnLuciole(home: HTMLElement): void {
	const l = document.createElement('span');
	l.className = 'egg-luciole';
	l.setAttribute('aria-hidden', 'true');
	l.textContent = '✨';
	// Léger décalage vertical de base (un peu de variété d'un vol à l'autre) ; la
	// grande trajectoire courbe est portée par l'animation egg-luciole-fly.
	l.style.top = `${Math.random() * 6}vh`;
	const vie = window.setTimeout(() => l.remove(), 24500); // traversée non attrapée → s'en va
	l.addEventListener('click', () => {
		window.clearTimeout(vie);
		if (markEggFound('luciole')) renderEggAlbumNav();
		// Fige la luciole à sa position visuelle courante avant le « pop » de capture :
		// sinon, en retirant l'animation de vol, left/transform reviendraient à leur
		// base (hors écran) et la capture serait invisible.
		const r = l.getBoundingClientRect();
		l.style.left = `${r.left}px`;
		l.style.top = `${r.top}px`;
		l.classList.add('egg-luciole-caught');
		window.setTimeout(() => l.remove(), 380);
	});
	home.appendChild(l);
}

/* ---------- Album de souvenirs ----------
   Affiche UNIQUEMENT les eggs trouvés (jamais de cases vides, jamais de
   compteur « X/Y »). Le bloc d'accès est masqué tant que rien n'a été trouvé. */
export function renderEggAlbumNav(): void {
	const el = document.getElementById('eggAlbumNav');
	if (!el) return;
	const eggs = foundEggs();
	el.innerHTML = eggs.length
		? `<button class="reward-btn egg-album-btn" data-act="open-egg-album">✨ Mon album de surprises</button>`
		: '';
}

function eggCardHTML(e: EggDef): string {
	// `data-egg` (id de l'egg) : sélecteur stable pour les tests e2e (cf. e2e/).
	return `<button type="button" class="egg-card" data-egg="${escapeHTML(e.id)}" title="Revoir cette surprise">
    <span class="egg-card-scene" aria-hidden="true">${e.emoji}</span>
    <span class="egg-card-title">${escapeHTML(e.titre)}</span>
  </button>`;
}

function albumContentHTML(): string {
	const cards = foundEggs().map(eggCardHTML).join('');
	return `<p class="rewards-sub">Les petites surprises que tu as découvertes.</p>
    <div class="egg-album-grid">${cards}</div>`;
}

let albumRelease: (() => void) | null = null;
export function openEggAlbum(): void {
	const content = document.getElementById('eggAlbumContent');
	if (content) content.innerHTML = albumContentHTML();
	const ov = document.getElementById('eggAlbum');
	if (!ov) return;
	ov.style.display = '';
	albumRelease?.();
	albumRelease = activateModal(ov, {
		onEscape: hideEggAlbum,
		initialFocus: document.getElementById('eggAlbumOk'),
	});
}
function hideEggAlbum(): void {
	albumRelease?.();
	albumRelease = null;
	const ov = document.getElementById('eggAlbum');
	if (ov) ov.style.display = 'none';
}

/* ---------- Câblage (appelé une fois au chargement) ---------- */
export function initEggs(): void {
	// Egg A : délégation sur le conteneur stable (#progression est re-rendu en
	// innerHTML, mais l'élément persiste).
	document.getElementById('progression')?.addEventListener('click', onProgressionClick);

	// Accès à l'album depuis la barre de l'accueil.
	document.getElementById('eggAlbumNav')?.addEventListener('click', (e) => {
		if ((e.target as HTMLElement).closest('[data-act="open-egg-album"]')) openEggAlbum();
	});

	// Album : replay d'une carte au tap (la découverte reste vivante et rejouable).
	document.getElementById('eggAlbumContent')?.addEventListener('click', (e) => {
		const card = (e.target as HTMLElement).closest<HTMLElement>('.egg-card');
		const scene = card?.querySelector<HTMLElement>('.egg-card-scene');
		if (scene && !mouvementReduit()) replayClass(scene, 'egg-card-play', 700);
	});

	// Album : fermetures (bouton, croix, fond ; Échap géré par le focus-trap).
	document.getElementById('eggAlbumOk')?.addEventListener('click', hideEggAlbum);
	document.getElementById('eggAlbumClose')?.addEventListener('click', hideEggAlbum);
	document.getElementById('eggAlbum')?.addEventListener('click', (e) => {
		if ((e.target as HTMLElement).id === 'eggAlbum') hideEggAlbum();
	});
}

// Appelé à chaque affichage de l'accueil (depuis renderHomeStats) : met à jour
// l'accès à l'album et tente une apparition ambiante.
export function onHomeShown(): void {
	renderEggAlbumNav();
	maybeShowAmbient();
}
