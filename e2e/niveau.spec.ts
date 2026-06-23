/* ============================================================
   Niveau scolaire (#225) — popup de choix de classe + filtrage du
   catalogue par niveau. Navigation DIRECTE (pas gotoHash, qui écarte
   la popup) : on amorce un profil neuf sans classe choisie pour que la
   popup s'affiche (le catalogue expose CE2 et CM1).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Profil neuf SANS niveau de référence → popup de choix de classe au démarrage. */
const SEED_SANS_NIVEAU = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1 }], active: 'e2e' }));`;

/* Profil en CM1 ayant déjà l'étoile CE2 de « comparer » (clé namespacée @ce2). */
const SEED_CM1_AVEC_CE2 =
	`localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));` +
	`localStorage.setItem('e2e/ludaskia_stars', JSON.stringify({ 'num-comparer@ce2': 1 }));`;

test('la popup de choix de classe s’affiche pour un profil neuf', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SANS_NIVEAU);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	const popup = page.locator('#onboardingNiveau');
	await expect(popup).toBeVisible();
	await expect(popup.locator('[data-niveau="ce2"]')).toBeVisible();
	await expect(popup.locator('[data-niveau="cm1"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('choisir CM1 filtre le catalogue sur le niveau CM1', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SANS_NIVEAU);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await page.locator('#onboardingNiveau [data-niveau="cm1"]').click();
	await expect(page.locator('#onboardingNiveau')).toHaveCount(0);
	// Catégorie Numération : la leçon multi-niveau « comparer » (CE2+CM1) reste,
	// une leçon restée CE2-only disparaît du catalogue CM1.
	await page.goto('app.html#categorie-math-numeration', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="num-comparer"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-encadrer-intercaler"]')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('le catalogue CE2 reste complet après choix de la classe CE2', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SANS_NIVEAU);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await page.locator('#onboardingNiveau [data-niveau="ce2"]').click();
	await page.goto('app.html#categorie-math-numeration', { waitUntil: 'networkidle' });
	// CE2 : les deux leçons sont présentes (aucun filtrage visible).
	await expect(page.locator('.lesson-item[data-id="num-comparer"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-encadrer-intercaler"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('badge « déjà maîtrisée en CE2 » sur une leçon retrouvée au CM1', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1_AVEC_CE2);
	await page.goto('app.html#categorie-math-numeration', { waitUntil: 'networkidle' });
	const card = page.locator('.lesson-item[data-id="num-comparer"]');
	await expect(card).toBeVisible();
	await expect(card.locator('.lz-prev')).toContainText('CE2');
	expect(errors).toEqual([]);
});

test('réglage parent : ajuster le niveau d’une matière filtre son catalogue (Lot 4)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// gotoHash amorce niveauReference=CE2 (pas de popup) ; le bloc parent s'affiche.
	await gotoHash(page, 'profils');
	const mathSelect = page.locator('select[data-act="set-niveau-matiere"][data-subject="math"]');
	await expect(mathSelect).toBeVisible();
	await mathSelect.selectOption('cm1');
	// Maths passées en CM1 → la Numération ne montre que les leçons disponibles en CM1.
	await gotoHash(page, 'categorie-math-numeration');
	await expect(page.locator('.lesson-item[data-id="num-comparer"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-encadrer-intercaler"]')).toHaveCount(0);
	expect(errors).toEqual([]);
});
