/* ============================================================
   Smoke e2e — variante CM1 de « Les angles » (#252).
   Le CE2 compare un angle à l'angle droit (cf. angles.spec.ts, via gotoHash =
   profil CE2, INCHANGÉ). Le CM1 ajoute de NOUVELLES familles tirées au hasard
   (calibrated) : `plusOuvert`/`egaux` (deux angles côte à côte, figure
   `.angle-pair`) et `notation` (un angle à 3 points nommés, `<text>`) — en
   appoint de `nommer` (repris du CE2). Comme la famille est tirée au hasard,
   ce smoke reste ROBUSTE : il ne dépend d'AUCUNE famille précise, seulement
   du rendu général (figure + QCM jouable).
   Profil CM1 seedé (comme duree-ecoulee.spec.ts) : la leçon est mono-mode QCM,
   `#mode-geo-angles` redirige en interne vers le runner (showModeChoice → 1
   seul mode → startLecon → `location.hash = 'lecon-...'`, asynchrone). Le
   temps de ce relais, l'accueil reste la dernière vue rendue : sans les
   drapeaux « déjà vu » (cf. ENSURE_NIVEAU de helpers.ts), le mot aux parents
   s'ouvrirait par-dessus et bloquerait le clic QCM — on les seed donc ici
   aussi (bruit d'onboarding, hors sujet du test).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

const SEED_CM1 = `(() => {
	localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));
	localStorage.setItem('e2e/ludaskia_tour_seen', 'true');
	localStorage.setItem('e2e/ludaskia_parents_seen', 'true');
})();`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

test('CM1 : « Les angles » se rend sans erreur, figure présente, un choix QCM donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-geo-angles', { waitUntil: 'networkidle' });

	// Quelle que soit la famille tirée (CE2 historique ou nouvelles familles CM1),
	// une figure SVG d'angle est toujours présente.
	await expect(page.locator('.figure svg').first()).toBeVisible();

	const choices = page.locator('.sprint-choice');
	await expect(choices.first()).toBeVisible();
	expect(await choices.count()).toBeGreaterThanOrEqual(2);
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();

	expect(errors).toEqual([]);
});
