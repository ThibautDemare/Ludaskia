/* ============================================================
   Service worker, côté application (#306).
   ------------------------------------------------------------
   Enregistre le worker et fait le lien entre lui et l'app.

   MISE À JOUR — une nouvelle version installée reste « en attente » (le worker ne
   prend jamais la main tout seul). On relaie ce signal à `mise-a-jour.ts`, qui
   applique les règles de politesse existantes (écran calme, hors sprint ou
   révision) avant de laisser la bascule se faire. C'est le remplacement exact de
   l'ancien sondage de `version.json` : même comportement, autre déclencheur.

   RÉCHAUFFEMENT — l'objectif est que la TOTALITÉ du site soit récupérable avant
   la mise hors ligne, y compris ce que l'enfant n'a jamais visité. Pas en un gros
   téléchargement à l'installation (les 26 shards de verbes, ~850 Ko, rendraient
   la première visite lourde) mais par petites tranches, aux moments calmes,
   jusqu'à couverture complète. Le partage des rôles est net : le worker sait ce
   qui MANQUE (il interroge son cache), l'app sait QUAND c'est opportun. Chacun ne
   décide que de ce qu'il est seul à savoir.

   Trois garde-fous encadrent ce fond de tâche, et aucun n'est décoratif :

   - on attend un ENGAGEMENT RÉEL (cf. `core/engagement.ts`). Imposer 850 Ko à
     quelqu'un qui ouvre la page trente secondes et ne revient jamais est
     difficile à défendre sur un forfait mobile ;
   - on respecte `saveData` quand le navigateur l'expose ;
   - on n'agit que sur une application CALME, au même sens que la mise à jour.

   Quelqu'un qui parcourt le catalogue sans être « engagé » n'est pas pénalisé
   pour autant : ses chargements paresseux atterrissent dans le même cache par le
   chemin « à la demande » du worker. Les deux mécanismes se répartissent
   proprement.

   L'enregistrement n'a lieu que depuis l'application (`main.ts`), pas depuis la
   vitrine ni le guide : quelqu'un qui lit une page publique et ne revient jamais
   n'a aucune raison de se voir installer un worker. Une fois posé, celui-ci
   couvre tout le site (son scope est la base de publication), les trois pages
   comprises.
   ============================================================ */
import { registerSW } from 'virtual:pwa-register';
import { canReloadNow } from '../core/version';
import type { ReloadThresholds } from '../core/version';
import { etatCalme, onRetourSurOnglet } from './app-calme';
import { signalerVersionEnAttente } from './mise-a-jour';
import { engagementReel } from '../core/engagement';

/* Message du worker (cf. src/sw.ts). */
const MSG_RECHAUFFER = 'ludaskia-rechauffer';

const RECHECK_MS = 30 * 60 * 1000; // re-vérification d'un nouveau déploiement
const SECOURS_MS = 4000; // filet : on recharge même si la bascule n'aboutit pas

/* Cadence du réchauffement. Volontairement lente et par petites tranches : c'est
   du fond de tâche, il ne doit jamais se remarquer. Trois fichiers toutes les
   20 secondes couvrent le lexique entier en quelques minutes passées à l'accueil. */
const TRANCHE = 3;
const RECHAUFFE_MS = 20_000;
/* Seuils plus exigeants que ceux de la mise à jour (4 s / 1,5 s) : recharger est
   instantané, télécharger occupe le réseau un moment. On attend un écran
   franchement posé, pas une simple pause entre deux gestes. */
const SEUILS_RECHAUFFE: ReloadThresholds = { minIdleMs: 8000, minVisibleMs: 3000 };

let registration: ServiceWorkerRegistration | undefined;
let rechargement = false;
let couvertureComplete = false;
let rechauffeEnCours = false;
let persistanceDemandee = false;

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

/* L'utilisateur demande-t-il à économiser ses données ? `navigator.connection` est
   en pratique réservé à Chromium (absente de Safari, donc de l'iPad) : on la traite
   en BONUS, jamais en condition nécessaire. Là où elle existe et dit « économise »,
   on ne lui impose pas 850 Ko de fond — le chemin « à la demande » du worker le
   sert quand même, simplement au fil de ses besoins. */
function economieDeDonnees(): boolean {
	const c = (navigator as { connection?: { saveData?: boolean } }).connection;
	return c?.saveData === true;
}

/* Demande à ne pas être évincé du stockage. PUREMENT best-effort, et surtout PAS la
   parade à la purge WebKit : Safari ne l'implémente pas de façon utile, donc cela ne
   change rien sur iPad — là-bas, c'est l'installation sur l'écran d'accueil qui joue
   ce rôle (cf. `rappel-sauvegarde`). Utile sur Chromium (accordé selon l'engagement)
   et Firefox. Les deux leviers sont complémentaires, pas redondants ; on ne fait rien
   dépendre du succès de celui-ci. Demandé une fois l'engagement établi, moment où
   Chromium a le plus de chances d'accepter. */
function demanderPersistance(): void {
	if (persistanceDemandee) return;
	persistanceDemandee = true;
	void navigator.storage?.persist?.().catch(() => {});
}

/* Envoie un message au worker actif et attend sa réponse (canal dédié). */
function demander<T>(message: object): Promise<T | null> {
	const sw = navigator.serviceWorker.controller;
	if (!sw) return Promise.resolve(null);
	return new Promise<T | null>((resolve) => {
		const canal = new MessageChannel();
		// Le worker peut être arrêté entre deux messages : on ne reste pas suspendu.
		const minuteur = setTimeout(() => resolve(null), 60_000);
		canal.port1.onmessage = (e: MessageEvent) => {
			clearTimeout(minuteur);
			resolve(e.data as T);
		};
		sw.postMessage(message, [canal.port2]);
	});
}

/* Un tour de réchauffement. Le worker renvoie l'état APRÈS la tranche : dès qu'il
   annonce une couverture complète, on cesse de demander (rien ne sert de le
   réveiller pour s'entendre dire qu'il n'a rien à faire). Une purge du navigateur
   ne nous piège pas pour autant : elle emporte aussi le worker et son cache, donc
   la page suivante repart d'un état où la couverture est de nouveau à reconstituer. */
async function tourDeRechauffement(): Promise<void> {
	if (couvertureComplete || rechauffeEnCours) return;
	if (economieDeDonnees() || !engagementReel()) return;
	if (!canReloadNow(etatCalme(), SEUILS_RECHAUFFE)) return;
	demanderPersistance();
	rechauffeEnCours = true;
	try {
		const res = await demander<{ complet: boolean }>({ type: MSG_RECHAUFFER, budget: TRANCHE });
		if (res?.complet) couvertureComplete = true;
	} finally {
		rechauffeEnCours = false;
	}
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

		setInterval(() => void tourDeRechauffement(), RECHAUFFE_MS);
	};

	// L'installation du worker télécharge toute la coquille : on ne la met pas en
	// concurrence avec le premier rendu de la page.
	if (document.readyState === 'complete') demarrer();
	else window.addEventListener('load', demarrer, { once: true });
}
