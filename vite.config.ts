import { defineConfig } from 'vitest/config';
export default defineConfig({
	base: '/Ludaskia/',
	build: { outDir: 'dist' },
	// Vitest = logique pure (dossier tests/). Les specs Playwright (e2e/) ont
	// leur propre runner : on restreint l'include pour ne pas les ramasser ici.
	test: { environment: 'happy-dom', include: ['tests/**/*.{test,spec}.ts'] },
});
