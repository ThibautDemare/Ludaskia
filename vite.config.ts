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
	build: { outDir: 'dist' },
	define: { __APP_VERSION__: JSON.stringify(buildVersion) },
	plugins: [emitVersionFile()],
	// Vitest = logique pure (dossier tests/). Les specs Playwright (e2e/) ont
	// leur propre runner : on restreint l'include pour ne pas les ramasser ici.
	test: { environment: 'happy-dom', include: ['tests/**/*.{test,spec}.ts'] },
});
