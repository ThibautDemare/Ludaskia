/* ============================================================
   Mode Révision (#45) sur mobile (#186) : les exercices à interaction
   « tuiles » (comparaison de nombres, ordre alphabétique) se rejouent
   AVEC leurs tuiles, sans clavier — et la consigne de la leçon s'affiche.
   On amorce un élément « dû » en localStorage (méta-profil à UUID fixe +
   état de révision échu) puis on ouvre la révision espacée.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const UUID = 'e2e-revision';

/* Amorce un profil de test et rend UNE leçon « due » dès maintenant. La clé de
   révision est préfixée par le profil actif (uuid + '/'), d'où l'amorçage conjoint
   de la méta-profil avec un UUID connu. */
function seedDueLesson(lessonId: string): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: UUID,
			}),
		)});
    localStorage.setItem('${UUID}/ludaskia_lessonRevision', JSON.stringify({
      ${JSON.stringify(lessonId)}: { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));
  `;
}

test('Révision : la comparaison se joue en tuiles (pas de clavier) + consigne', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('num-comparer'));
	await gotoHash(page, 'revision-espacee');

	// La consigne (libellé de la leçon) est affichée, et l'exercice est en tuiles.
	await expect(page.locator('.rev-consigne')).toContainText('compare');
	await expect(page.locator('#ltuiSlot')).toBeVisible();
	for (const signe of ['<', '=', '>']) {
		await expect(page.locator('.ltui-tuile', { hasText: signe })).toBeVisible();
	}

	// On déduit le bon signe des deux nombres de l'énoncé, on pose la tuile, on valide.
	const enonce = await page.locator('.ltui-enonce').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]);
	const b = Number(m![2]);
	const signe = a < b ? '<' : a > b ? '>' : '=';
	await page.locator('.ltui-tuile', { hasText: signe }).first().click();
	await expect(page.locator('#ltuiSlot')).toHaveText(signe);
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible(); // « ✓ Bravo ! »
	expect(errors).toEqual([]);
});

test('Révision : la touche Entrée valide puis enchaîne sur la suite', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('num-valeur-position'));
	await gotoHash(page, 'revision-espacee');

	// Question à saisie : on remplit puis on valide à la touche Entrée (pas de clic).
	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	await input.fill('0'); // peu importe la justesse : on teste l'enchaînement clavier
	await input.press('Enter');

	// Le verdict s'affiche, avec le bouton « Terminer » (un seul élément dû).
	await expect(page.locator('.rev-feedback')).toBeVisible();
	await expect(page.locator('#revNext')).toBeVisible();

	// Entrée enchaîne sur l'écran de fin sans cliquer le bouton.
	await page.locator('#revNext').press('Enter');
	await expect(page.locator('.rev-done')).toContainText('terminée');
	expect(errors).toEqual([]);
});

test("Révision : l'ordre alphabétique se joue en tuiles-mots", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-vocab-alpha-initiale'));
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('.lord-seq')).toBeVisible();
	const bac = page.locator('#lordBac .lord-tuile');
	const n = await bac.count();
	expect(n).toBeGreaterThanOrEqual(4);

	// Lit les mots, les range dans l'ordre alphabétique (français), puis valide.
	const mots: string[] = [];
	for (let i = 0; i < n; i++) mots.push((await bac.nth(i).innerText()).trim());
	const ordre = [...mots].sort((x, y) => x.localeCompare(y, 'fr'));
	for (const mot of ordre) {
		await page
			.locator('#lordBac .lord-tuile:not(.tuile-used)', { hasText: new RegExp(`^${mot}$`) })
			.first()
			.click();
	}
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();
	expect(errors).toEqual([]);
});
