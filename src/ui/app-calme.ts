/* ============================================================
   « Application calme » — l'observateur partagé (#306).
   ------------------------------------------------------------
   Trois mécanismes doivent savoir si le moment est opportun pour agir sans
   déranger l'enfant : l'auto-actualisation (`mise-a-jour.ts`, qui recharge la
   page), le réchauffement du cache hors-ligne (`pwa.ts`, qui télécharge en fond)
   et le rappel de sauvegarde (`rappel-sauvegarde.ts`, qui affiche un encart).
   C'est la MÊME question, et elle avait déjà sa réponse : `canReloadNow`
   (`core/version.ts`) — écran de menu, hors sprint ou révision, après un délai
   d'inactivité et un instant après le retour sur l'onglet.

   Ce module ne fait qu'observer (interactions, visibilité de l'onglet, écran
   affiché) et fabriquer l'état que `canReloadNow` attend. La décision, elle,
   reste dans la logique pure — chaque appelant y applique SES seuils.

   Pourquoi pas `navigator.connection` (`effectiveType`, `saveData`) pour savoir
   si le réseau est calme : cette API est en pratique réservée à Chromium, donc
   absente de Safari et de l'iPad, appareil très probable pour ce public. Le bon
   proxy n'est de toute façon pas « réseau calme » mais « application calme »,
   qui, lui, se mesure sans rien demander au navigateur. (`saveData` reste
   consulté, en bonus, là où il change quelque chose — cf. `pwa.ts`.)
   ============================================================ */
import { canReloadNow } from '../core/version';
import type { ReloadState, ReloadThresholds } from '../core/version';
import { isSprintRunning } from './sprint';
import { isRevisionRunning } from './revision';

/* Écrans « menu » (pas un exercice) : seul un de ceux-là visible = écran calme. */
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
let lastActivity = 0;
let lastVisible = 0;
const auRetourSurOnglet: (() => void)[] = [];

const now = (): number => Date.now();

/** Un écran « menu » est-il affiché (donc pas un exercice en cours) ? */
export function ecranCalme(): boolean {
	return MENU_IDS.some((id) => {
		const e = document.getElementById(id);
		return !!e && e.style.display !== 'none';
	});
}

/** Sprint ou révision en cours : interrompre coûterait la progression. */
export function occupe(): boolean {
	return isSprintRunning() || isRevisionRunning();
}

/** Temps écoulé depuis la dernière interaction réelle de l'enfant. */
export function inactifDepuisMs(): number {
	return now() - lastActivity;
}

/** Temps écoulé depuis que l'onglet est (re)devenu visible ; 0 s'il est caché. */
export function visibleDepuisMs(): number {
	return document.visibilityState === 'visible' ? now() - lastVisible : 0;
}

/* État observable à passer à `canReloadNow`. `enAttente` = « il y a quelque chose
   à faire » (une version qui attend, un manque à réchauffer, un rappel à montrer) ;
   `dejaFait` = le garde-fou anti-répétition propre à l'appelant. */
function etatCalme(enAttente = true, dejaFait = false): ReloadState {
	return {
		updatePending: enAttente,
		calmScreen: ecranCalme(),
		busy: occupe(),
		alreadyReloaded: dejaFait,
		idleMs: inactifDepuisMs(),
		visibleMs: visibleDepuisMs(),
	};
}

/* La question, posée dans le vocabulaire de CE module. `canReloadNow` et ses seuils
   viennent de l'époque où recharger était le seul usage : deux des trois appelants
   ne rechargent plus rien (l'un télécharge en fond, l'autre affiche un encart), et
   leur faire manipuler un `alreadyReloaded` les obligerait à traduire mentalement à
   chaque lecture. La décision reste la même — c'est la logique pure de
   `core/version.ts`, inchangée — seul le nom sous lequel on l'appelle change. */
export type SeuilsCalme = ReloadThresholds;

export function momentCalme(seuils: SeuilsCalme, enAttente = true, dejaFait = false): boolean {
	return canReloadNow(etatCalme(enAttente, dejaFait), seuils);
}

/** S'abonner au retour sur l'onglet (moment clé : l'enfant revient jouer). */
export function onRetourSurOnglet(fn: () => void): void {
	if (!auRetourSurOnglet.includes(fn)) auRetourSurOnglet.push(fn);
}

function markActivity(): void {
	lastActivity = now();
}

/** À appeler une fois au démarrage (depuis `main.ts`), avant ses consommateurs. */
export function initAppCalme(): void {
	if (initialized) return;
	initialized = true;
	lastActivity = now();
	lastVisible = now();
	// Interactions réelles de l'enfant (capture : ne gêne pas les autres handlers).
	document.addEventListener('pointerdown', markActivity, true);
	document.addEventListener('keydown', markActivity, true);
	document.addEventListener('touchstart', markActivity, true);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState !== 'visible') return;
		lastVisible = now();
		for (const fn of auRetourSurOnglet) fn();
	});
}
