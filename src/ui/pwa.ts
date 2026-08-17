/* ============================================================
   Service worker, côté application (#306).
   ------------------------------------------------------------
   Enregistre le worker et fait le lien entre lui et l'app.

   MISE À JOUR — une nouvelle version installée reste « en attente » (le worker ne
   prend jamais la main tout seul). On relaie ce signal à `mise-a-jour.ts`, qui
   applique les règles de politesse existantes (écran calme, hors sprint ou
   révision) avant de laisser la bascule se faire. C'est le remplacement exact de
   l'ancien sondage de `version.json` : même comportement, autre déclencheur.

   L'enregistrement n'a lieu que depuis l'application (`main.ts`), pas depuis la
   vitrine ni le guide : quelqu'un qui lit une page publique et ne revient jamais
   n'a aucune raison de se voir installer un worker. Une fois posé, celui-ci
   couvre tout le site (son scope est la base de publication), les trois pages
   comprises.
   ============================================================ */
import { registerSW } from 'virtual:pwa-register';
import { onRetourSurOnglet } from './app-calme';
import { signalerVersionEnAttente } from './mise-a-jour';

const RECHECK_MS = 30 * 60 * 1000; // re-vérification d'un nouveau déploiement
const SECOURS_MS = 4000; // filet : on recharge même si la bascule n'aboutit pas

let registration: ServiceWorkerRegistration | undefined;
let rechargement = false;

/* On pilote le rechargement NOUS-MÊMES plutôt que de laisser `registerSW` s'en
   charger : son rechargement interne est conditionné à `isUpdate`, qui vaut faux
   quand la page n'était pas encore contrôlée au chargement — c'est-à-dire au tout
   premier passage. Un déploiement pendant cette première visite afficherait alors
   le voile « je me mets à jour… » sans jamais le lever. Le filet de sécurité couvre
   le symétrique : une bascule qui n'aboutit pas (worker tué, message perdu). Mieux
   vaut une page rechargée pour rien qu'un voile qui ne se lève jamais. */
function rechargerUneFois(): void {
	if (rechargement) return;
	rechargement = true;
	location.reload();
}

/** À appeler une fois au démarrage (depuis `main.ts`, après `initAppCalme`). */
export function initPwa(): void {
	if (!('serviceWorker' in navigator)) return;

	const demarrer = (): void => {
		const majSW = registerSW({
			immediate: true,
			// `waiting` de workbox-window : une nouvelle version est installée mais
			// n'a pas pris la main. On ne décide pas ici du moment de la bascule.
			onNeedRefresh() {
				signalerVersionEnAttente(() => {
					navigator.serviceWorker.addEventListener('controllerchange', rechargerUneFois, {
						once: true,
					});
					void majSW(true);
					setTimeout(rechargerUneFois, SECOURS_MS);
				});
			},
			onRegisteredSW(_url, r) {
				registration = r;
			},
		});

		// Un onglet resté ouvert longtemps ne re-télécharge pas le worker tout seul :
		// on le lui demande, périodiquement et au retour sur l'onglet (l'enfant qui
		// revient jouer est le bon moment pour découvrir un nouveau déploiement).
		const verifier = (): void => void registration?.update().catch(() => {});
		setInterval(verifier, RECHECK_MS);
		onRetourSurOnglet(verifier);
	};

	// L'installation du worker télécharge toute la coquille : on ne la met pas en
	// concurrence avec le premier rendu de la page.
	if (document.readyState === 'complete') demarrer();
	else window.addEventListener('load', demarrer, { once: true });
}
