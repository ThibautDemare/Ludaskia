/* ============================================================
   Smoke e2e — Verbes dans « Mes listes » (#261).
   On vérifie : (1) la détection d'un verbe à la saisie déplie le panneau de
   paramétrage (chips pronoms/temps + complément + aperçu), et l'enregistrement ;
   (2) au lancement, le verbe est résolu via le lexique (chargement paresseux) et
   joué dans une phrase à trou affichée. Stub TTS comme les autres specs ortho.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Crée une liste contenant un verbe configuré et l'enregistre. Renvoie le label. */
async function creerListeAvecVerbe(page: import('@playwright/test').Page, label: string) {
	await gotoHash(page, 'ortho-new');
	const firstMot = page.locator('.ortho-mot').first();
	await firstMot.waitFor();
	await firstMot.fill('manger');
	// Détection au repos : la barre « est un verbe » apparaît (lookup async).
	const suggest = page.locator('.ortho-verbe-suggest').first();
	await expect(suggest).toBeVisible();
	await suggest.click();
	// Panneau verbe déplié : chips pronoms (6) + temps (1) + complément + aperçu.
	const panneau = page.locator('.ortho-verbe').first();
	await expect(panneau).toBeVisible();
	await expect(panneau.locator('.ortho-chip-pronom')).toHaveCount(6);
	await expect(panneau.locator('.ortho-chip-temps')).toHaveCount(1);
	await panneau.locator('.ortho-complement').fill('une pomme');
	await page.locator('#orthoLabel').fill(label);
	await page.locator('#orthoSave').click();
	await expect(page.locator('.cat-rubrique').first()).toBeVisible();
}

test('éditeur : détecter un verbe déplie le paramétrage et génère un aperçu', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'ortho-new');
	const firstMot = page.locator('.ortho-mot').first();
	await firstMot.waitFor();
	await firstMot.fill('manger');
	const suggest = page.locator('.ortho-verbe-suggest').first();
	await expect(suggest).toBeVisible();
	await suggest.click();
	const panneau = page.locator('.ortho-verbe').first();
	await expect(panneau).toBeVisible();
	// Garde-fou « au moins un pronom » : on peut décocher « tu » (2e chip).
	const tu = panneau.locator('.ortho-chip-pronom').nth(1);
	await expect(tu).toHaveAttribute('aria-pressed', 'true');
	await tu.click();
	await expect(tu).toHaveAttribute('aria-pressed', 'false');
	// Aperçu vivant : la phrase générée pour un pronom coché contient la forme.
	await panneau.locator('.ortho-complement').fill('une pomme');
	await expect(panneau.locator('.ortho-verbe-apercu')).toContainText('mange');
	expect(errors).toEqual([]);
});

test('un mot non-verbe ne propose pas de paramétrage de conjugaison', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'ortho-new');
	const firstMot = page.locator('.ortho-mot').first();
	await firstMot.waitFor();
	await firstMot.fill('maison');
	// Laisse le temps à la détection (debounce + lookup) de s'exécuter.
	await page.waitForTimeout(900);
	await expect(page.locator('.ortho-verbe-suggest').first()).toBeHidden();
	expect(errors).toEqual([]);
});

test('jouer une liste de verbe : la phrase à trou s’affiche', async ({ page }) => {
	const errors = watchErrors(page);
	await creerListeAvecVerbe(page, 'Verbe test');
	// Lance la liste créée (carte « Mes listes »).
	await page.locator('[data-ortho]').filter({ hasText: 'Verbe test' }).first().click();
	// Le verbe est résolu (shard chargé) et joué dans une phrase à trou.
	await expect(page.locator('.ortho-contexte').first()).toBeVisible();
	await expect(page.locator('.ortho-trou').first()).toBeVisible();
	await expect(page.locator('.ortho-contexte').first()).toContainText('pomme');
	expect(errors).toEqual([]);
});
