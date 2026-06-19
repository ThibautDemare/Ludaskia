/* ============================================================
   Atelier d'orthographe (#166) : un mot long ne doit pas déborder du cadre
   sur mobile. Le mot est en `white-space: nowrap` (pour caler les entourages
   SVG) et la police est rétrécie pour tenir dans la largeur de contenu.
   On parcourt la découverte d'une liste contenant « aujourd'hui » / « auparavant »
   et on vérifie qu'aucun mot ne dépasse le cadre de la page.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test("atelier : aucun mot ne déborde du cadre, même long (« aujourd'hui ») — #166", async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Aucune lettre n'est entourée → à chaque « J'ai fini », la modale custom (#230)
	// « Tu veux continuer sans rien entourer ? » s'ouvre ; on clique « Continuer quand
	// même » pour avancer (remplace l'ancien dialogue natif auto-accepté).
	// Liste prédéfinie « Mots invariables (1) » → profil neuf : découverte = atelier.
	await gotoHash(page, 'ortho-fr-ortho-invariables-1');

	const pageBox = page.locator('.page.ortho-run');
	const mot = page.locator('#atelierMot');
	let sawLongWord = false;

	for (let i = 0; i < 12; i++) {
		await expect(mot).toBeVisible();
		const text = (await mot.innerText()).replace(/\s+/g, ' ').trim();
		const mBox = await mot.boundingBox();
		const pBox = await pageBox.boundingBox();
		expect(mBox).not.toBeNull();
		expect(pBox).not.toBeNull();
		// Le mot tient dans le cadre de la page (pas de débordement horizontal, ±1 px).
		expect(mBox!.x).toBeGreaterThanOrEqual(pBox!.x - 1);
		expect(mBox!.x + mBox!.width).toBeLessThanOrEqual(pBox!.x + pBox!.width + 1);
		if (text.replace(/\s/g, '').length >= 10) sawLongWord = true;

		const done = page.locator('#btnAtelierDone');
		if (!(await done.isVisible())) break;
		await done.click();
		// La modale custom s'ouvre (rien d'entouré) → « Continuer quand même » pour avancer.
		const continuer = page.getByRole('button', { name: 'Continuer quand même' });
		if (await continuer.isVisible().catch(() => false)) await continuer.click();
		// Attendre le mot suivant (texte changé) ou la sortie de l'atelier.
		await page
			.waitForFunction((prev) => {
				const el = document.querySelector('#atelierMot');
				return !el || (el.textContent ?? '').replace(/\s+/g, ' ').trim() !== prev;
			}, text)
			.catch(() => {});
		if (!(await mot.isVisible())) break;
	}

	expect(sawLongWord).toBe(true); // on a bien éprouvé un mot long (≥ 10 lettres)
	expect(errors).toEqual([]);
});
