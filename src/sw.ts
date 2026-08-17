/// <reference lib="webworker" />
/* ============================================================
   Service worker (#306) — le hors-ligne, pour de vrai.
   ------------------------------------------------------------
   Écrit à la main (mode `injectManifest` de vite-plugin-pwa) : Workbox n'injecte
   que `self.__WB_MANIFEST`, la liste des fichiers du build avec leur révision.
   Aucune recette Workbox ne correspond à ce qu'on veut ici :

   1. INSTALLATION — on ne met en cache que la coquille (les trois pages, le
      bundle, la CSS, la police, les images). Les 26 shards de verbes (~850 Ko)
      en sont exclus : les imposer à la première visite serait payer une longue
      attente pour un contenu dont on n'a pas encore besoin.
   2. RÉCHAUFFEMENT — le reste arrive plus tard, par petites tranches, à la
      demande du CLIENT (`src/ui/pwa.ts`), qui est le seul à savoir si
      l'application est calme et si quelqu'un s'en sert vraiment. Le SW, lui, est
      le seul à savoir ce qui MANQUE : il interroge son cache et ne récupère que
      les absents. C'est aussi ce qui reconstitue la couverture après une purge
      du navigateur, sans rien retélécharger d'inutile.
   3. À LA DEMANDE — tant que la couverture est incomplète, une ressource
      réclamée mais pas encore en cache est récupérée du réseau et rangée dans le
      même cache. Un enfant qui explore le catalogue se sert donc lui-même.
   4. MISE À JOUR — JAMAIS de `skipWaiting()` automatique. Un nouveau déploiement
      laisse ce worker en attente et c'est l'app qui décide du moment de la
      bascule (écran calme, hors sprint ou révision — cf. `core/version.ts`).
      Recharger sous les doigts d'un enfant en plein exercice serait exactement
      ce que la logique de politesse existante évite depuis toujours.

   L'arithmétique (clés, partition, manques, obsolètes) vit dans
   `core/pwa-cache.ts` : pure, donc testable sans service worker.
   ============================================================ */
import {
	cleCache,
	couverture,
	manques,
	obsoletes,
	partitionner,
	normaliserManifeste,
	type EntreePrecache,
} from './core/pwa-cache';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: EntreePrecache[] };

/* Nom de cache STABLE (non versionné par build) : les fichiers de Vite sont hachés,
   donc une entrée inchangée d'un déploiement à l'autre doit SURVIVRE. Un cache
   versionné forcerait à retélécharger les 850 Ko de verbes à chaque mise en ligne.
   Le tri se fait par purge des clés qui ne sont plus au manifeste (cf. `obsoletes`). */
const CACHE = 'ludaskia-offline-v1';

/* Base de publication (`/Ludaskia/`), déduite du scope du worker plutôt que codée
   en dur : elle change entre GitHub Pages et un serveur local. */
const BASE = new URL(self.registration.scope).pathname;

const MANIFESTE: EntreePrecache[] = normaliserManifeste(self.__WB_MANIFEST ?? [], BASE);
const { immediat, differe } = partitionner(MANIFESTE);

/* Index url → entrée : le fetch reçoit une URL nue et doit retrouver la clé de cache
   correspondante (qui, pour un fichier à nom stable, porte la révision). */
const PAR_URL = new Map(MANIFESTE.map((e) => [e.url, e]));

/* Messages échangés avec l'app (cf. src/ui/pwa.ts).
   `SKIP_WAITING` n'est pas de notre cru : c'est le message que `workbox-window`
   envoie quand l'app décide enfin de laisser la nouvelle version prendre la main.
   Ne pas le reconnaître donnerait un mécanisme silencieusement inerte — le voile
   s'afficherait, et la page ne basculerait jamais. */
const MSG_BASCULER = 'SKIP_WAITING';
const MSG_RECHAUFFER = 'ludaskia-rechauffer'; // « récupère quelques manques »
const MSG_ETAT = 'ludaskia-etat'; // « où en est la couverture ? »

/* ---------- Cache ---------- */

/** Clés (url + révision) actuellement présentes dans notre cache. */
async function clesPresentes(cache: Cache): Promise<Set<string>> {
	const reqs = await cache.keys();
	return new Set(reqs.map((r) => new URL(r.url).pathname + new URL(r.url).search));
}

/** Range une entrée du manifeste dans le cache. Renvoie false si le réseau a échoué. */
async function mettreEnCache(cache: Cache, e: EntreePrecache): Promise<boolean> {
	const cle = cleCache(e);
	try {
		// `cache: 'reload'` : on veut l'octet publié, pas une copie du cache HTTP du
		// navigateur qui pourrait être celle d'un déploiement précédent.
		const res = await fetch(new Request(e.url, { cache: 'reload', credentials: 'same-origin' }));
		if (!res.ok) return false;
		await cache.put(cle, res);
		return true;
	} catch {
		return false; // hors ligne / réseau capricieux : on réessaiera au prochain tour
	}
}

/* ---------- Cycle de vie ---------- */

self.addEventListener('install', (event) => {
	// Pas de `skipWaiting()` : cette version attend le feu vert de l'app (cf. en-tête).
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			const presentes = await clesPresentes(cache);
			// En parallèle, mais SANS `Promise.all` strict : un fichier qui échoue ne doit
			// pas faire échouer l'installation entière (le réchauffement le rattrapera).
			await Promise.all(manques(immediat, presentes).map((e) => mettreEnCache(cache, e)));
		})(),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			// Purge des entrées d'un build précédent (anciennes pages, anciens chunks).
			// Seul mécanisme de bornage du cache : pas de durée de vie, arbitré (#306 §3).
			const perimees = obsoletes(MANIFESTE, await clesPresentes(cache));
			await Promise.all(perimees.map((k) => cache.delete(k)));
			// Caches d'un schéma antérieur (renommage éventuel) : on ne laisse pas traîner.
			const noms = await caches.keys();
			await Promise.all(
				noms.filter((n) => n.startsWith('ludaskia-') && n !== CACHE).map((n) => caches.delete(n)),
			);
			await self.clients.claim();
		})(),
	);
});

/* ---------- Service des requêtes ---------- */

/* Document servi pour une navigation. L'app est routée par hash : toute navigation
   vise l'une des trois pages du build, ou le dossier (→ la vitrine). */
function documentPour(url: URL): string {
	if (url.pathname.endsWith('/')) return `${url.pathname}index.html`;
	return url.pathname;
}

async function repondre(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(CACHE);
	const chemin = request.mode === 'navigate' ? documentPour(url) : url.pathname;
	const entree = PAR_URL.get(chemin);
	const cle = entree ? cleCache(entree) : chemin + url.search;

	const enCache = await cache.match(cle);
	if (enCache) return enCache;

	// Absent du cache : couverture encore incomplète (ou ressource hors manifeste).
	// On passe par le réseau ET on range la réponse — c'est le chemin « à la demande »
	// qui fait qu'un enfant qui explore se constitue son cache tout seul.
	try {
		const res = await fetch(request);
		if (res.ok && (entree || url.pathname.startsWith(BASE))) {
			await cache.put(cle, res.clone());
		}
		return res;
	} catch {
		// Hors ligne et rien en cache. Pour une navigation, mieux vaut servir la page
		// d'application déjà connue que l'erreur brute du navigateur.
		if (request.mode === 'navigate') {
			const repli = PAR_URL.get(`${BASE}app.html`);
			const page = repli ? await cache.match(cleCache(repli)) : undefined;
			if (page) return page;
		}
		return new Response('', { status: 504, statusText: 'Hors ligne' });
	}
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	// Uniquement notre propre site, sous la base de publication : on ne s'interpose
	// pas sur ce qui ne nous appartient pas.
	if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
	event.respondWith(repondre(request, url));
});

/* ---------- Dialogue avec l'application ---------- */

/** Couverture actuelle, immédiat et différé confondus. */
async function etat(): Promise<{ present: number; total: number; complet: boolean }> {
	const cache = await caches.open(CACHE);
	return couverture(MANIFESTE, await clesPresentes(cache));
}

/* Récupère au plus `budget` fichiers manquants. On sert d'abord les manques de la
   coquille (une purge du navigateur a pu l'emporter : elle prime sur le lexique),
   puis le différé. Renvoie l'état APRÈS la tranche pour que l'app sache s'il reste
   du travail — et donc s'il faut redemander au prochain moment calme. */
async function rechauffer(budget: number): Promise<{
	present: number;
	total: number;
	complet: boolean;
	recuperes: number;
}> {
	const cache = await caches.open(CACHE);
	const presentes = await clesPresentes(cache);
	const aFaire = [...manques(immediat, presentes), ...manques(differe, presentes)].slice(
		0,
		Math.max(0, budget),
	);
	let recuperes = 0;
	// En SÉRIE, volontairement : le réchauffement est du fond de tâche, il ne doit pas
	// entrer en concurrence avec ce que l'enfant charge au premier plan.
	for (const e of aFaire) if (await mettreEnCache(cache, e)) recuperes++;
	return { ...(await etat()), recuperes };
}

self.addEventListener('message', (event) => {
	const data = event.data as { type?: string; budget?: number } | null;
	if (!data || typeof data.type !== 'string') return;
	const repondreA = (charge: unknown): void => event.ports[0]?.postMessage(charge);

	if (data.type === MSG_BASCULER) {
		void self.skipWaiting();
		return;
	}
	if (data.type === MSG_ETAT) {
		event.waitUntil(etat().then(repondreA));
		return;
	}
	if (data.type === MSG_RECHAUFFER) {
		event.waitUntil(rechauffer(typeof data.budget === 'number' ? data.budget : 4).then(repondreA));
	}
});
