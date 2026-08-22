/* ============================================================
   Auto-actualisation : bascule vers un nouveau déploiement, POLIMENT.
   ------------------------------------------------------------
   Un enfant qui garde l'onglet ouvert ne pense pas à rafraîchir. Quand une
   nouvelle version est en ligne, on passe donc dessus tout seul — mais jamais
   n'importe quand : seulement à un moment sûr (cf. `core/version.ts` : écran
   calme, hors sprint ou révision, après un court délai d'inactivité), une seule
   fois par version (anti-boucle). Juste avant, un voile aux couleurs de l'app +
   la mascotte (« je me mets à jour… ») masque le flash blanc, lu à voix haute
   (TTS) en appui pour les lecteurs lents. Avis UX enfant + troubles/attention
   pris en compte.

   Ce qui a changé avec #306 : le DÉCLENCHEUR, et lui seul. Avant, un sondage
   périodique de `version.json` comparait la version publiée à celle embarquée.
   Depuis, c'est le service worker qui le dit — une nouvelle version installée
   reste « en attente », et c'est ce module qui décide quand lui donner la main
   (cf. `pwa.ts`). Garder les deux mécanismes aurait créé exactement la double
   logique de mise à jour qu'on cherche à éviter : le fichier `version.json` et
   son sondage ont donc disparu. Tout le comportement, lui, est intact.
   ============================================================ */
import { APP_VERSION } from '../core/version';
import type { SeuilsCalme } from './app-calme';
import { momentCalme } from './app-calme';
import { mascotteBulleHTML } from './unlocks-view';
import { dicter } from './tts';
import { activateModal } from './modal-a11y';
import { html } from '../core/html';

// Message porté par la mascotte (1re personne, concret, annonce le « flash »).
// « version » évité (mot d'adulte) ; ton « bonne nouvelle », pas alerte.
const MESSAGE = 'Je me mets à jour… je reviens tout de suite !';

const TICK_MS = 1000; // cadence de la « surveillance de reload »
const RELOAD_DELAY_MS = 2400; // durée d'affichage du voile avant la bascule
const THRESHOLDS: SeuilsCalme = { minIdleMs: 4000, minVisibleMs: 1500 };
const STORAGE_KEY = 'ludaskia_update_reloaded'; // anti-boucle (par onglet)

let updatePending = false;
let basculer: (() => void) | null = null;
let reloading = false;
let watcher: ReturnType<typeof setInterval> | null = null;

/* A-t-on DÉJÀ tenté de quitter cette version dans cet onglet ? On mémorise la
   version qu'on quitte (et non celle qu'on vise) : au retour, la page tourne sur
   une autre version et le garde-fou se relâche de lui-même. Si la bascule n'a rien
   changé (cache CDN servant une page périmée), il tient et évite la boucle. */
function dejaBascule(): boolean {
	try {
		return sessionStorage.getItem(STORAGE_KEY) === APP_VERSION;
	} catch {
		return false;
	}
}

function startWatcher(): void {
	if (watcher !== null) return;
	tryReload();
	watcher = setInterval(tryReload, TICK_MS);
}
function stopWatcher(): void {
	if (watcher !== null) {
		clearInterval(watcher);
		watcher = null;
	}
}

/** Bascule si, et seulement si, le moment est sûr (cf. `momentCalme`). */
function tryReload(): void {
	if (reloading || !updatePending) return;
	if (momentCalme(THRESHOLDS, updatePending, dejaBascule())) doReload();
}

function doReload(): void {
	reloading = true;
	stopWatcher();
	// Anti-boucle : on note la version quittée AVANT de basculer.
	try {
		sessionStorage.setItem(STORAGE_KEY, APP_VERSION);
	} catch {
		// sessionStorage indisponible : tant pis pour l'anti-boucle (cas rare).
	}
	showOverlay();
	try {
		dicter(MESSAGE); // lecture audio best-effort (TTS), en appui du texte
	} catch {
		// TTS indisponible : le message reste lisible à l'écran.
	}
	const suite = basculer;
	setTimeout(() => suite?.(), RELOAD_DELAY_MS);
}

/** Voile + mascotte pour masquer le flash blanc du rechargement. */
function showOverlay(): void {
	if (document.getElementById('updateOverlay')) return;
	const el = document.createElement('div');
	el.id = 'updateOverlay';
	el.className = 'update-overlay';
	el.setAttribute('role', 'status');
	el.setAttribute('aria-live', 'polite');
	el.innerHTML = html`<div class="update-card">${mascotteBulleHTML(MESSAGE)}</div>`.balisage;
	document.body.appendChild(el);
	// Le voile masque l'app juste avant le rechargement : on rend l'arrière-plan
	// inerte (Tab et lecteurs d'écran ne s'y promènent plus). Pas de fermeture par
	// Échap (une mise à jour ne s'annule pas) ni de restauration du focus (reload
	// imminent) → on ignore la fonction `release` rendue (#235).
	activateModal(el);
	void el.offsetWidth; // reflow → la transition d'opacité joue
	el.classList.add('show');
}

/* Une nouvelle version est installée et attend. `bascule` est ce qu'il faut
   appeler pour lui donner la main (côté service worker : `skipWaiting` puis
   rechargement) ; ce module choisit seulement QUAND. Appelé par `pwa.ts`. */
export function signalerVersionEnAttente(bascule: () => void): void {
	if (reloading) return;
	basculer = bascule;
	updatePending = true;
	startWatcher();
}
