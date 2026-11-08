/* ============================================================
   Retour terrain (novembre 2026) : « Précédent » PENDANT une modale de récompense.
   Une leçon lancée depuis le programme du jour se réussit ; la modale de célébration
   (`#celebrate`) s'ouvre ; l'enfant appuie sur le bouton retour du système (Android) ;
   puis il ferme la modale. L'arrière-plan restait INERTE (`inert` laissé sur les enfants
   de <body>) : plus rien n'était cliquable, `#btnHome` compris.

   Exigence testée : une fois les modales fermées, rien n'est inerte et l'enfant peut
   rentrer à l'accueil. Deux variantes :
   - B : célébration seule (assez d'XP pour ne PAS changer de niveau) ;
   - A : niveau gagné (`#levelup`) PUIS célébration, Précédent pendant la modale de niveau.
   Mise en place du programme par la vraie UI encadrant (comme retour-programme.spec.ts).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue, estAtteignable } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;
const LECON = 'math-tables-addition';

/* Programme du jour : UNE étape « leçon précise » ×1, tous les jours de la semaine. */
async function creerProgramme(page: Page): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('lecon');
	await page.locator('[data-act="seance-cible-ouvrir"][data-def="d1"][data-etape="e1"]').click();
	await page.evaluate(() => {
		document
			.querySelectorAll<HTMLDetailsElement>('.enc-seance-selecteur .enc-sel-d')
			.forEach((d) => (d.open = true));
	});
	await page.locator(`[data-act="seance-cible-choisir"][data-lesson="${LECON}"]`).click();
	for (let jour = 1; jour <= 7; jour++)
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
}

/* Programme composé, leçon lancée depuis #seance, réussie : la première modale est ouverte. */
async function reussirLeconDuProgramme(page: Page): Promise<void> {
	await creerProgramme(page);
	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();
	await page.locator('#cardProgramme').click();
	await expect(page).toHaveURL(/#seance$/);
	await page.locator('.programme-tuile[data-act="lancer"]').first().click();
	await expect(page).toHaveURL(new RegExp(`#lecon-${LECON}$`));
	const champs = page.locator('#sheets .ans');
	await champs.first().waitFor();
	const n = await champs.count();
	for (let i = 0; i < n; i++)
		await champs.nth(i).fill((await champs.nth(i).getAttribute('data-answer')) ?? '');
	await page.locator('#btnVerify').click();
}

/* Sur mobile (Pixel 5), « Accueil » vit dans le tiroir de la barre d'outils : on l'ouvre. */
async function allerALAccueil(page: Page): Promise<void> {
	await page.locator('#toolbarBurger').click({ timeout: 5000 });
	await page.locator('#btnHome').click({ timeout: 5000 });
}

const enfantsInertes = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll('body > [inert]')].map((e) => e.id || e.className),
	);

/* Ferme toutes les modales de récompense, dans l'ordre où elles se présentent. */
async function fermerLesModales(page: Page): Promise<void> {
	for (let tour = 0; tour < 4; tour++) {
		// On identifie QUEL bouton est réellement au-dessus : après Précédent, le programme
		// rejoué peut ouvrir la célébration PAR-DESSUS la modale de niveau (les deux visibles),
		// et fermer l'une peut en ouvrir une autre. On clique celui qu'un doigt toucherait.
		const id = (await estAtteignable(page, '#celebrateOk'))
			? '#celebrateOk'
			: (await estAtteignable(page, '#levelupOk'))
				? '#levelupOk'
				: null;
		if (!id) return;
		await page.locator(id).click({ timeout: 3000 });
		await expect(page.locator(id)).toBeHidden();
	}
}

test('B : Précédent pendant la célébration, puis « Super ! » : rien d’inerte, #btnHome ramène à l’accueil', async ({
	page,
}) => {
	test.setTimeout(90_000);
	const errors = watchErrors(page);
	await seedAideVue(page);
	// Assez d'XP pour que la leçon ne fasse PAS franchir de niveau : pas de #levelup.
	await page.addInitScript(`localStorage.setItem('e2e/ludaskia_xp', '2000');`);
	await reussirLeconDuProgramme(page);

	await expect(page.locator('#celebrate')).toBeVisible();
	await expect(page.locator('#levelup')).toBeHidden();

	await page.goBack();
	await page.locator('#celebrateOk').click();
	await expect(page.locator('#celebrate')).toBeHidden();

	expect(await enfantsInertes(page)).toEqual([]);
	await allerALAccueil(page);
	await expect(page.locator('#home')).toBeVisible();
	expect(errors).toEqual([]);
});

test('A : Précédent pendant la modale de niveau : les boutons restent cliquables, #btnHome fonctionne ensuite', async ({
	page,
}) => {
	test.setTimeout(90_000);
	const errors = watchErrors(page);
	await seedAideVue(page);
	await reussirLeconDuProgramme(page);

	// Le profil neuf gagne un niveau avec cette leçon : la modale de niveau s'ouvre.
	await expect(page.locator('#levelup')).toBeVisible();

	await page.goBack();
	// Les modales restent utilisables : le bouton visible se clique réellement (un arrière-plan
	// ou une modale inerte ferait échouer ce clic, d'où le délai court).
	await fermerLesModales(page);
	await expect(page.locator('#levelup')).toBeHidden();
	await expect(page.locator('#celebrate')).toBeHidden();

	expect(await enfantsInertes(page)).toEqual([]);
	await allerALAccueil(page);
	await expect(page.locator('#home')).toBeVisible();
	expect(errors).toEqual([]);
});
