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

/* Onboarding niveau (#225) : un profil neuf face à plusieurs niveaux voit une popup
   de choix de classe FORCÉE (overlay bloquant) au chargement. Les smoke tests du
   catalogue se déroulent sur le niveau par défaut → on fixe `niveauReference: 'ce2'`
   AVANT le chargement (catalogue CE2 = toutes les leçons) pour que la popup ne
   s'affiche pas. On préserve une méta déjà seedée par un test (ex. révision) en y
   ajoutant seulement le niveau. La spec dédiée (niveau.spec.ts) teste la popup
   elle-même via une navigation directe, sans cet amorçage. */
const ENSURE_NIVEAU = `(() => {
	const KEY = 'ludaskia_profiles';
	let m = null;
	try { m = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
	if (!m || !Array.isArray(m.list) || !m.list.length) {
		m = { list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'ce2' }], active: 'e2e' };
	} else {
		m.list.forEach((p) => { if (!p.niveauReference) p.niveauReference = 'ce2'; });
	}
	localStorage.setItem(KEY, JSON.stringify(m));
})();`;

/* Navigue vers une vue routée par hash (#accueil, #categorie-..., #lecon-...).
   Le `#hash` est résolu contre la baseURL (…/Ludaskia/). */
export async function gotoHash(page: Page, hash: string): Promise<void> {
	await page.addInitScript(ENSURE_NIVEAU);
	await page.goto(`#${hash}`, { waitUntil: 'networkidle' });
}
