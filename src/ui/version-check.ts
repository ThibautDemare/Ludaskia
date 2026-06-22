/* ============================================================
   Auto-actualisation : recharge la page quand un nouveau déploiement est
   en ligne, pour un enfant qui garde l'onglet ouvert et ne pense pas à
   rafraîchir. On interroge `version.json` (sondage périodique + au retour
   sur l'onglet) ; si la version diffère de celle embarquée, on recharge —
   mais SEULEMENT à un moment sûr (cf. `core/version.ts` : écran calme, hors
   exercice, après un court délai), une seule fois par version (anti-boucle).
   Juste avant le reload, un voile aux couleurs de l'app + la mascotte (« je
   me mets à jour… ») masque le flash blanc, lu à voix haute (TTS) en appui
   pour les lecteurs lents. Avis UX enfant + troubles/attention pris en compte.
   ============================================================ */
import { APP_VERSION, isNewerVersion, canReloadNow } from '../core/version';
import type { ReloadThresholds } from '../core/version';
import { isSprintRunning } from './sprint';
import { isRevisionRunning } from './revision';
import { mascotteBulleHTML } from './unlocks-view';
import { dicter } from './tts';
import { activateModal } from './modal-a11y';

// Message porté par la mascotte (1re personne, concret, annonce le « flash »).
// « version » évité (mot d'adulte) ; ton « bonne nouvelle », pas alerte.
const MESSAGE = 'Je me mets à jour… je reviens tout de suite !';

const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;
const POLL_MS = 5 * 60 * 1000; // sondage périodique (petit JSON)
const MIN_CHECK_INTERVAL_MS = 30_000; // anti-rafale (bascules d'onglet répétées)
const INITIAL_DELAY_MS = 1500; // 1re vérif après le chargement
const TICK_MS = 1000; // cadence de la « surveillance de reload »
const RELOAD_DELAY_MS = 2400; // durée d'affichage du voile avant reload
const THRESHOLDS: ReloadThresholds = { minIdleMs: 4000, minVisibleMs: 1500 };
const STORAGE_KEY = 'ludaskia_update_reloaded'; // anti-boucle (par onglet)

// Écrans « menu » (pas un exercice) : seul un de ceux-là visible = écran calme.
const MENU_IDS = [
	'home',
	'lessons',
	'profils',
	'bilan-custom',
	'sprint-config',
	'matieres',
	'categories',
	'categorie',
	'ortho-liste',
];

let initialized = false;
let updatePending = false;
let latest: string | null = null;
let reloading = false;
let lastActivity = 0;
let lastVisible = 0;
let lastCheckAt = 0;
let watcher: ReturnType<typeof setInterval> | null = null;

const now = () => Date.now();

/** Récupère la version publiée (sans cache), ou `null` si indisponible. */
async function fetchLatest(): Promise<string | null> {
	try {
		const res = await fetch(`${VERSION_URL}?t=${now()}`, { cache: 'no-store' });
		if (!res.ok) return null;
		const data: unknown = await res.json();
		const v = (data as { version?: unknown } | null)?.version;
		return typeof v === 'string' ? v : null;
	} catch {
		// Hors-ligne, 404 en dev, JSON cassé… : pas de mise à jour détectable.
		return null;
	}
}

/** Un écran « menu » est-il affiché (donc pas un exercice en cours) ? */
function calmScreen(): boolean {
	return MENU_IDS.some((id) => {
		const e = document.getElementById(id);
		return !!e && e.style.display !== 'none';
	});
}

/** A-t-on déjà rechargé pour CETTE version (dans cet onglet) ? */
function alreadyReloaded(): boolean {
	try {
		return latest !== null && sessionStorage.getItem(STORAGE_KEY) === latest;
	} catch {
		return false;
	}
}

/** Interroge le serveur (débridé anti-rafale) et arme la mise à jour si besoin. */
function maybeCheck(): void {
	const t = now();
	if (updatePending || reloading || t - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
	lastCheckAt = t;
	void fetchLatest().then((v) => {
		if (isNewerVersion(APP_VERSION, v)) {
			latest = v;
			updatePending = true;
			startWatcher();
		}
	});
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

/** Recharge si, et seulement si, le moment est sûr (cf. `canReloadNow`). */
function tryReload(): void {
	if (reloading || !updatePending) return;
	const ok = canReloadNow(
		{
			updatePending,
			calmScreen: calmScreen(),
			busy: isSprintRunning() || isRevisionRunning(),
			alreadyReloaded: alreadyReloaded(),
			idleMs: now() - lastActivity,
			visibleMs: document.visibilityState === 'visible' ? now() - lastVisible : 0,
		},
		THRESHOLDS,
	);
	if (ok) doReload();
}

function doReload(): void {
	reloading = true;
	stopWatcher();
	// Anti-boucle : on note la version cible AVANT de recharger. Si le reload ne
	// suffit pas (cache CDN servant un index.html périmé), on ne réessaiera pas
	// en boucle pour cette même version.
	try {
		if (latest !== null) sessionStorage.setItem(STORAGE_KEY, latest);
	} catch {
		// sessionStorage indisponible : tant pis pour l'anti-boucle (cas rare).
	}
	showOverlay();
	try {
		dicter(MESSAGE); // lecture audio best-effort (TTS), en appui du texte
	} catch {
		// TTS indisponible : le message reste lisible à l'écran.
	}
	setTimeout(() => location.reload(), RELOAD_DELAY_MS);
}

/** Voile + mascotte pour masquer le flash blanc du rechargement. */
function showOverlay(): void {
	if (document.getElementById('updateOverlay')) return;
	const el = document.createElement('div');
	el.id = 'updateOverlay';
	el.className = 'update-overlay';
	el.setAttribute('role', 'status');
	el.setAttribute('aria-live', 'polite');
	el.innerHTML = `<div class="update-card">${mascotteBulleHTML(MESSAGE)}</div>`;
	document.body.appendChild(el);
	// Le voile masque l'app juste avant le rechargement : on rend l'arrière-plan
	// inerte (Tab et lecteurs d'écran ne s'y promènent plus). Pas de fermeture par
	// Échap (une mise à jour ne s'annule pas) ni de restauration du focus (reload
	// imminent) → on ignore la fonction `release` rendue (#235).
	activateModal(el);
	void el.offsetWidth; // reflow → la transition d'opacité joue
	el.classList.add('show');
}

function markActivity(): void {
	lastActivity = now();
}

/** À appeler une fois au démarrage (depuis `main.ts`). */
export function initVersionCheck(): void {
	if (initialized) return;
	initialized = true;
	lastActivity = now();
	lastVisible = now();
	// Interactions réelles de l'enfant (capture : ne gêne pas les autres handlers).
	document.addEventListener('pointerdown', markActivity, true);
	document.addEventListener('keydown', markActivity, true);
	document.addEventListener('touchstart', markActivity, true);
	// Retour sur l'onglet (l'enfant revient jouer) : moment clé pour vérifier.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			lastVisible = now();
			maybeCheck();
		}
	});
	setInterval(maybeCheck, POLL_MS); // sondage périodique pendant que l'app tourne
	setTimeout(maybeCheck, INITIAL_DELAY_MS); // rattrape un déploiement pendant le chargement
}
