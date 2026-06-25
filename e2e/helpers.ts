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
   elle-même via une navigation directe, sans cet amorçage.

   Guide de 1re visite (#330) : de même, on amorce les drapeaux « déjà vu » du tour
   enfant ET du mot aux parents (préfixés par le profil actif) pour que cet
   onboarding ne s'affiche pas sur l'accueil de toutes les specs. La spec dédiée
   (tour.spec.ts) navigue « à froid », sans cet amorçage, pour tester l'enchaînement. */
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
	localStorage.setItem(m.active + '/ludaskia_tour_seen', 'true');
	localStorage.setItem(m.active + '/ludaskia_parents_seen', 'true');
})();`;

/* Navigue vers une vue routée par hash (#accueil, #categorie-..., #lecon-...).
   L'application vit sur `app.html` (#271 : `index.html` est la page vitrine) ;
   le `#hash` est résolu contre la baseURL (…/Ludaskia/app.html). */
export async function gotoHash(page: Page, hash: string): Promise<void> {
	await page.addInitScript(ENSURE_NIVEAU);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

/* Aide contextuelle : masque l'auto-modale pour les 5 runners concernés.
   À appeler via `addInitScript` AVANT `gotoHash` dans les specs préexistantes
   qui exercent ces runners mais ne testent PAS l'aide elle-même.
   Clé préfixée par le profil e2e (uuid = 'e2e', préfixe = 'e2e/').
   Ne PAS utiliser dans aide-exercice.spec.ts (elle gère l'aide elle-même). */
export function seedAideVueScript(): string {
	return `localStorage.setItem('e2e/ludaskia_aide_vue', '{"tuiles":true,"ordre":true,"tri":true,"atelier":true,"lettres":true}');`;
}

/* Surcharge pratique : injecte directement le script sur la page.
   Appeler AVANT gotoHash (addInitScript s'exécute avant le chargement). */
export async function seedAideVue(page: Page): Promise<void> {
	await page.addInitScript(seedAideVueScript());
}
