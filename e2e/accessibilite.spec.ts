/* ============================================================
   Accessibilité (#42) : confort de lecture + réglages de lecture vocale.
   Le BOUTON « Écouter » dépend d'une voix FR de l'appareil — absente en
   Chromium headless (dicteeDisponible() faux → pas de bouton). On teste donc
   le déterministe : le confort de lecture (classe + espacement, persistance) et
   le bloc Préférences (réglage auto + statut de la lecture vocale).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Confort de lecture : classe, espacement et persistance', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');

	const toggle = page.locator('#prefConfort');
	await expect(toggle).toBeVisible();
	await expect(page.locator('html')).not.toHaveClass(/confort-lecture/);

	await toggle.check();
	await expect(page.locator('html')).toHaveClass(/confort-lecture/);
	// L'espacement inter-lettres devient non nul (Nunito gardée, juste aérée).
	const ls = await page
		.locator('body')
		.evaluate((el) => parseFloat(getComputedStyle(el).letterSpacing) || 0);
	expect(ls).toBeGreaterThan(0);

	// Réglage rangé dans la méta de profil → survit au rechargement.
	await gotoHash(page, 'profils');
	await expect(page.locator('html')).toHaveClass(/confort-lecture/);
	await expect(page.locator('#prefConfort')).toBeChecked();

	expect(errors).toEqual([]);
});

test('Consigne de conjugaison : nomme la tâche, et le texte lu est une phrase', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-conj-etre-present'); // fiche en saisie
	const consigne = page.locator('.consigne-line').first();
	await consigne.waitFor();
	// Affichage : la consigne nomme le verbe à conjuguer et le temps (plus de
	// « Écris la forme correcte. » générique).
	await expect(consigne).toContainText('Conjugue');
	await expect(consigne).toContainText('présent');
	// Texte lu (dissociation #42) : présent dans l'attribut data-tts (indépendant de
	// la disponibilité d'une voix), et c'est une vraie phrase (pas le `@` télégraphique).
	const lu = await consigne.getAttribute('data-tts');
	expect(lu).toBeTruthy();
	expect(lu).toContain('Conjugue');
	expect(lu).not.toContain('@');
	expect(errors).toEqual([]);
});

test('Champs de conjugaison : chaque saisie a un nom accessible, et ils diffèrent', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-conj-etre-present');
	const champs = page.locator('#sheets input.ans');
	await champs.first().waitFor();

	// Sans nom accessible, un lecteur d'écran annonçait six fois « zone de saisie »
	// sans dire de quelle personne il s'agissait (#577, axe : règle `label`, critical).
	const noms = await champs.evaluateAll((els) =>
		els.map((el) => el.getAttribute('aria-label') ?? ''),
	);
	expect(noms.length).toBeGreaterThanOrEqual(6);
	for (const nom of noms) expect(nom).toContain('Conjugue');

	// Et surtout : ils se DISTINGUENT. Six noms identiques satisferaient axe sans rien
	// résoudre — c'est le pronom qui manquait, pas l'attribut.
	expect(new Set(noms.slice(0, 6)).size).toBe(6);
	expect(errors).toEqual([]);
});

test('Aménagements (espace encadrants) : lecture auto + statut de la lecture vocale', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// La lecture auto des consignes est devenue un aménagement posé par l'adulte (#234),
	// réglable dans l'onglet Réglages (#459).
	await gotoHash(page, 'encadrant/reglages');

	await expect(
		page.locator('[data-act="set-amenagement"][data-pref="lectureConsigneAuto"]'),
	).toHaveCount(1);
	// Le statut de la lecture vocale sur l'appareil est affiché.
	await expect(page.getByText(/Lecture vocale/)).toBeVisible();

	expect(errors).toEqual([]);
});
