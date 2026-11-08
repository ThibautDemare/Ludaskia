/* ============================================================
   Espace encadrant — espacements collés (retour terrain, novembre 2026).
   Deux endroits où un bloc touchait le suivant, faute de marge :
   - onglet Programme : « Nouveau programme » (`[data-act="seance-add"]`) collé au bloc
     des bilans favoris (`.enc-seance-favoris-gestion`), 0 px avant correctif ;
   - onglet Profils : l'intertitre « Où vivent les données… » collé à la rangée
     Exporter / Importer (`.enc-actions`).
   On mesure l'EXIGENCE (un vide visible entre deux boîtes), pas une valeur de marge :
   les seuils (8 px, 12 px) sont des planchers de lisibilité, pas le CSS actuel.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

test('Programme : « Nouveau programme » est séparé du bloc suivant d’au moins 8 px', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');

	const bouton = page.locator('[data-act="seance-add"]');
	const suivant = page.locator('.enc-seance-favoris-gestion');
	await expect(bouton).toBeVisible();
	await expect(suivant).toBeVisible();

	const b = (await bouton.boundingBox())!;
	const s = (await suivant.boundingBox())!;
	// Le bloc suivant est bien APRÈS le bouton, sinon l'écart mesuré n'a pas de sens.
	expect(s.y).toBeGreaterThanOrEqual(b.y + b.height);
	expect(s.y - (b.y + b.height)).toBeGreaterThanOrEqual(8);

	expect(errors).toEqual([]);
});

test('Profils : l’intertitre « Où vivent les données » est séparé des boutons Exporter/Importer d’au moins 12 px', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/profils');

	// L'intertitre est repéré par sa position (le h3 qui suit la rangée d'actions), pas par
	// son libellé : le texte peut être reformulé sans que l'exigence change.
	const rangee = page.locator('.enc-actions:has([data-act="enc-export"])');
	const titre = page.locator('.enc-actions:has([data-act="enc-export"]) + .enc-h3');
	await expect(rangee).toBeVisible();
	await expect(titre).toBeVisible();

	const r = (await rangee.boundingBox())!;
	const t = (await titre.boundingBox())!;
	expect(t.y).toBeGreaterThanOrEqual(r.y + r.height);
	expect(t.y - (r.y + r.height)).toBeGreaterThanOrEqual(12);

	expect(errors).toEqual([]);
});
