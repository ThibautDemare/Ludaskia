import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

// Version du build : SHA court du commit en CI (GitHub Actions fournit GITHUB_SHA),
// sinon un horodatage local. Sert à l'auto-actualisation (cf. src/ui/version-check.ts) :
// la valeur est injectée dans l'app (__APP_VERSION__) ET écrite dans un petit
// version.json publié à la racine du site, que l'app interroge pour se savoir périmée.
const buildVersion = process.env.GITHUB_SHA?.slice(0, 12) || `dev-${Date.now()}`;

// Émet dist/version.json à côté du bundle (interrogé à l'exécution, sans cache).
function emitVersionFile(): Plugin {
	return {
		name: 'ludaskia-version-file',
		generateBundle() {
			this.emitFile({
				type: 'asset',
				fileName: 'version.json',
				source: JSON.stringify({ version: buildVersion }) + '\n',
			});
		},
	};
}

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
	plugins: [emitVersionFile()],
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
