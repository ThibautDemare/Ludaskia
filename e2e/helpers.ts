/* ============================================================
   Helpers partagés des smoke tests e2e (#129).
   ============================================================ */
import type { Page } from '@playwright/test';

/* Messages de console à ignorer (bruits navigateur sans rapport avec l'app :
   favicon manquant, ressources annexes…). */
const BENIGN = [/favicon/i, /manifest/i, /net::ERR/i, /Failed to load resource/i];

/* Pose un collecteur d'erreurs : exceptions non rattrapées (`pageerror`) — le
   signal d'un crash de rendu/navigation — et `console.error` applicatifs (hors
   bruits annexes). Les tests vérifient ensuite que le tableau est vide. */
export function watchErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() !== 'error') return;
		const text = m.text();
		if (!BENIGN.some((re) => re.test(text))) errors.push(`console.error: ${text}`);
	});
	return errors;
}

/* Navigue vers une vue routée par hash (#accueil, #categorie-..., #lecon-...).
   Le `#hash` est résolu contre la baseURL (…/Ludaskia/). */
export async function gotoHash(page: Page, hash: string): Promise<void> {
	await page.goto(`#${hash}`, { waitUntil: 'networkidle' });
}
