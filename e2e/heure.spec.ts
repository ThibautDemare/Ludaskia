/* ============================================================
   Tests e2e de la leçon « Lire l'heure » (#88) : premier client du
   moteur de figures SVG. On vérifie que l'horloge SVG se rend et que
   les deux modes (saisie / QCM) fonctionnent.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test("Lire l'heure (saisie) : l'horloge s'affiche et la bonne réponse est validée", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-mes-lecture-heure'); // accès direct → mode conseillé (saisie)
	// L'horloge SVG accompagne la question.
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const heures = page.locator('.heure-h').first();
	await heures.waitFor();
	// La réponse canonique « H h MM » est portée par le champ des heures ; on remplit
	// les deux champs séparément (heures / minutes).
	const good = (await heures.getAttribute('data-answer')) ?? '';
	const m = good.match(/^(\d{1,2}) h (\d{2})$/);
	await heures.fill(m?.[1] ?? '');
	await page
		.locator('.heure-min')
		.first()
		.fill(m?.[2] ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test("Lire l'heure (QCM) : l'horloge s'affiche et un choix donne un retour", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-lecture-heure'); // écran de choix de mode
	await page.locator('.mode-btn[data-mode="qcm"]').click();
	await expect(page.locator('.figure svg').first()).toBeVisible();
	await expect(page.locator('.sprint-choice')).toHaveCount(4);
	await page.locator('.sprint-choice').first().click(); // feedback immédiat
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('#lqcmActions button')).toBeVisible();
	// Le feedback et « Continuer » sont des FRÈRES du bloc de choix (empilés
	// dessous), pas imbriqués dans la grille flex des choix (sinon ils s'alignent
	// avec les boutons — bug du `</div>` manquant corrigé dans lecon-qcm.ts).
	await expect(page.locator('#lqcmChoices #lqcmFeedback')).toHaveCount(0);
	await expect(page.locator('#lqcmChoices #lqcmActions')).toHaveCount(0);
	expect(errors).toEqual([]);
});
