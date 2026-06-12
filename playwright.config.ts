import { defineConfig, devices } from '@playwright/test';

/* ============================================================
   Configuration des tests e2e Playwright (#129).
   Smoke tests de navigation/rendu, complémentaires aux tests
   Vitest de logique pure. Serveur de dev Vite sur un port FIXE
   (l'app est servie sous le sous-chemin /Ludaskia/).
   ============================================================ */
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/Ludaskia/`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
	},
	// Cœur de cible : tablette/smartphone → on pilote un profil mobile Chromium.
	projects: [{ name: 'chromium-mobile', use: { ...devices['Pixel 5'] } }],
	webServer: {
		command: `npm run dev -- --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
