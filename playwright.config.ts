import { defineConfig, devices } from '@playwright/test';

/* ============================================================
   Configuration des tests e2e Playwright (#129).
   Smoke tests de navigation/rendu, complémentaires aux tests
   Vitest de logique pure. Serveur de dev Vite sur un port FIXE
   (l'app est servie sous le sous-chemin /Ludaskia/).
   ============================================================ */
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/Ludaskia/`;

/* Second serveur (#306) : le BUILD DE PRODUCTION servi par `vite preview`.
   Le service worker est volontairement DÉSACTIVÉ sous le serveur de dev — un SW
   enregistré y sert d'un test à l'autre les assets mis en cache par le précédent,
   et les échecs qui en découlent sont différés et incompréhensibles. La spec
   hors-ligne a pourtant besoin d'un vrai worker : elle vise donc ce second port,
   où elle exerce le VRAI précache (celui du build), et non une approximation. */
const PORT_PROD = 4174;
export const PROD_URL = `http://localhost:${PORT_PROD}/Ludaskia/`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	// Snapshots visuels (#412) : ne JAMAIS écrire une baseline manquante lors d'un run
	// de comparaison (sinon un run sur une branche sans baseline passerait au vert après
	// retry, faux positif). Une baseline manquante DOIT faire échouer. La (re)génération
	// est explicite, réservée au workflow `update-snapshots.yml` (`--update-snapshots`).
	updateSnapshots: 'none',
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
	},
	// Cœur de cible : tablette/smartphone → on pilote un profil mobile Chromium.
	projects: [{ name: 'chromium-mobile', use: { ...devices['Pixel 5'] } }],
	webServer: [
		{
			command: `npm run dev -- --port ${PORT} --strictPort`,
			url: BASE_URL,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
		{
			command: `npm run build && npm run preview -- --port ${PORT_PROD} --strictPort`,
			url: PROD_URL,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000, // build + preview
		},
	],
});
