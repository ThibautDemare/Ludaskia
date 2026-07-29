/* ============================================================
   Smoke e2e — carte « leçon du jour » (#208).
   La carte de l'accueil (rangée `.cards`, #leconDuJour) : rendu, lancement de la
   leçon proposée, et contournement « Voir une autre leçon ». Profil neuf (CE2 via
   helpers) → la 1re leçon de l'ordre est `num-comparer`. Un dernier test couvre la
   régression #484 (alternance des matières invisible tant que les maths ne sont
   pas épuisées) sur un profil ayant déjà étoilé cette 1re leçon de maths.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Profil CE2 (niveauReference explicite, cohérent avec l'amorçage de gotoHash)
   ayant déjà une étoile sur la 1re leçon de maths de l'ordre pédagogique
   (`num-comparer`, cf. src/data/ordre-pedagogique.ts). Reprend le pattern de
   seed direct de localStorage utilisé par niveau.spec.ts (clé namespacée par
   profil et par niveau : 'ludaskia_stars' → { 'num-comparer@ce2': 1 }). */
const SEED_ETOILE_MATH =
	`localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' }], active: 'e2e' }));` +
	`localStorage.setItem('e2e/ludaskia_stars', JSON.stringify({ 'num-comparer@ce2': 1 }));`;

test('la carte leçon du jour propose la 1re leçon de l’ordre', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	const carte = page.locator('#leconDuJour');
	await expect(carte).toBeVisible();
	// Profil neuf CE2 → tête de l'ordre maths = « Je compare les nombres ».
	await expect(carte).toHaveAttribute('data-lesson', 'num-comparer');
	await expect(carte.locator('.lj-title')).toHaveText('Je compare les nombres');
	expect(errors).toEqual([]);
});

test('cliquer la carte lance la leçon proposée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	await page.locator('#leconDuJour .lj-title').click();
	// startLecon route vers la leçon (mono-mode) ou l'écran de choix de mode.
	await expect(page).toHaveURL(/#(mode|lecon)-num-comparer/);
	expect(errors).toEqual([]);
});

test('« Voir une autre leçon » propose la suivante du fil', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	const carte = page.locator('#leconDuJour');
	await expect(carte).toHaveAttribute('data-lesson', 'num-comparer');
	await page.locator('#leconDuJour .lj-autre').click();
	// Entrelacement 1:1 maths/français → la suivante est la 1re leçon de français.
	await expect(carte).toHaveAttribute('data-lesson', 'fr-gram-ponctuation');
	expect(errors).toEqual([]);
});

test('une étoile sur la 1re leçon de maths bascule la tête du fil sur le français (#484)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_ETOILE_MATH);
	await gotoHash(page, 'accueil');
	const carte = page.locator('#leconDuJour');
	await expect(carte).toBeVisible();
	// Maths acquises = 1, français = 0 → le français (moins avancé) prend la tête
	// du fil dès la 1re étoile, sans attendre l'épuisement des maths (régression #484).
	await expect(carte).toHaveAttribute('data-lesson', 'fr-gram-ponctuation');
	expect(errors).toEqual([]);
});
