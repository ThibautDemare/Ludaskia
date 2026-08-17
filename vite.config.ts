import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Version du build : SHA court du commit en CI (GitHub Actions fournit GITHUB_SHA),
// sinon un horodatage local. Injectée dans l'app (`__APP_VERSION__`) pour l'affichage,
// le diagnostic et l'anti-boucle de l'auto-actualisation.
// Ce n'est PLUS le déclencheur de la mise à jour : depuis #306, c'est le service worker
// qui signale une nouvelle version (une version installée reste « en attente » jusqu'à
// ce que l'app la laisse prendre la main). Le `version.json` publié et son sondage ont
// disparu avec lui — les garder aurait recréé deux mécanismes de mise à jour
// concurrents (cf. src/ui/pwa.ts et src/ui/mise-a-jour.ts).
const buildVersion = process.env.GITHUB_SHA?.slice(0, 12) || `dev-${Date.now()}`;

/* Service worker (#306) — DÉSACTIVÉ par défaut hors production.
   Un SW enregistré en dev/preview empoisonne la suite e2e : il sert d'un test à
   l'autre des assets mis en cache par le précédent, et les échecs qui en découlent
   sont différés et incompréhensibles. On ne l'active donc que si on le demande
   explicitement (`LUDASKIA_PWA_DEV=1`), ce dont se sert la seule spec qui teste
   l'hors-ligne. En `vite build`, il est toujours produit. */
const pwaEnDev = process.env.LUDASKIA_PWA_DEV === '1';

export default defineConfig({
	base: '/Ludaskia/',
	build: {
		outDir: 'dist',
		// Build multi-page (#271) : `index.html` = page vitrine (atterrissage public),
		// `app.html` = l'application elle-même (que l'utilisateur régulier met en favori),
		// `guide.html` = le mode d'emploi destiné aux parents (#562), page statique et
		// partageable, lisible AVANT d'avoir essayé l'application.
		// Vite émet les trois pages ; les chemins absolus restent préfixés par `base`.
		rollupOptions: {
			input: {
				main: fileURLToPath(new URL('./index.html', import.meta.url)),
				app: fileURLToPath(new URL('./app.html', import.meta.url)),
				guide: fileURLToPath(new URL('./guide.html', import.meta.url)),
			},
		},
	},
	define: { __APP_VERSION__: JSON.stringify(buildVersion) },
	plugins: [
		VitePWA({
			// `injectManifest` (et non `generateSW`) : le service worker est ÉCRIT à la main
			// (`src/sw.ts`), Workbox n'y injecte que la liste des fichiers du build. C'est
			// nécessaire ici — la stratégie de #306 n'est pas une recette Workbox standard :
			// précache immédiat restreint, réchauffement de fond piloté par le client,
			// récupération à la demande, et surtout AUCUN `skipWaiting` automatique (la
			// bascule de version reste soumise aux règles de politesse de l'app).
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'sw.ts',
			// L'enregistrement est fait par l'app (`src/ui/pwa.ts`) via `workbox-window`,
			// pour brancher l'événement `waiting` sur la logique de politesse existante.
			injectRegister: null,
			registerType: 'prompt',
			devOptions: { enabled: pwaEnDev, type: 'module', navigateFallback: 'app.html' },
			injectManifest: {
				// TOUT le build entre dans le manifeste, y compris les 26 shards de verbes
				// (~850 Ko) : le SW a besoin de la liste COMPLÈTE pour savoir ce qui manque.
				// Ce n'est pas pour autant ce qu'il précache à l'installation — c'est lui qui
				// partitionne « immédiat » / « différé » (cf. src/core/pwa-cache.ts).
				globPatterns: ['**/*.{js,css,html,woff2,svg,png,json,ico}'],
				// Les shards de verbes dépassent la limite par défaut (2 Mio) une fois cumulés
				// mais restent petits à l'unité ; on relève la borne par fichier pour que le
				// bundle principal ne soit pas exclu du manifeste sans bruit.
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
			},
			manifest: {
				id: '/Ludaskia/',
				name: "Ludaskia — s'exercer en s'amusant",
				short_name: 'Ludaskia',
				description:
					"Jeu d'entraînement gratuit en maths et en français pour le CE2 et le CM1 : exercices variés, corrigés tout de suite. Sans compte ni publicité.",
				lang: 'fr',
				dir: 'ltr',
				// L'installation doit ouvrir l'APPLICATION, pas la page vitrine : quelqu'un qui
				// pose l'icône sur son écran d'accueil veut jouer, pas relire l'argumentaire.
				start_url: 'app.html',
				scope: '/Ludaskia/',
				display: 'standalone',
				orientation: 'any',
				background_color: '#ffffff', // --paper
				theme_color: '#2f7d52', // --accent (barre d'outils)
				categories: ['education', 'kids'],
				icons: [
					{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					// `maskable` = icône que le système RECADRE à sa propre forme ; son gabarit
					// garde le motif dans la zone sûre (cf. tools/pwa-icons/generate.mjs).
					{
						src: 'pwa-maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					},
				],
			},
		}),
	],
	// Vitest = logique pure (dossier tests/). Les specs Playwright (e2e/) ont
	// leur propre runner : on restreint l'include pour ne pas les ramasser ici.
	test: {
		environment: 'happy-dom',
		include: ['tests/**/*.{test,spec}.ts'],
		// Les tests d'invariant échantillonnent LARGEMENT (boucles de 3000+ tirages,
		// « bornes dures par échantillon » : décimaux, fractions, accords, verbes…).
		// Corrects et rapides au repos, ils peuvent dépasser le testTimeout par défaut
		// (5 s) quand la machine est SATURÉE — typiquement le hook pre-push lancé pendant
		// que plusieurs agents tournent, ou un runner CI contendu (échecs de timeout
		// intermittents, jamais d'assertion fausse). On élargit le timeout pour éliminer
		// ces faux échecs SANS réduire l'échantillonnage ; un vrai blocage échoue toujours.
		testTimeout: 30000,
	},
});
