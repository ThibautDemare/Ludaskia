/* ============================================================
   Smoke tests d'impression (#290) : rendu de l'opération posée
   et masquage de la bulle d'aide des angles sous @media print.

   Vérifie via `page.emulateMedia({ media: 'print' })` (même pattern
   que font.spec.ts) que les corrections CSS de print.scss sont actives :
   1. `.posee-rule` a un border-top visible (fond var(--ink) ne s'imprime
      pas ; on le remplace par une bordure).
   2. `.posee-input` conserve une bordure sur ses 4 côtés (la règle générique
      `.ans { border-bottom }` ne l'aplatit pas).
   3. `.angle-aide.screen-only` est visible à l'écran et `display:none` à
      l'impression.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* --- Opération posée -------------------------------------------------- */

test('impression : .posee-rule a un border-top non nul (remplace le fond var(--ink))', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	// Attendre la grille posée (rendu synchrone dès le chargement de la leçon).
	await expect(page.locator('.posee-rule').first()).toBeVisible();

	await page.emulateMedia({ media: 'print' });

	const borderTopWidth = await page
		.locator('.posee-rule')
		.first()
		.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
	// border-top: 2px solid #333 → doit être ≥ 1px
	expect(borderTopWidth).toBeGreaterThanOrEqual(1);

	// Le fond doit être transparent (plus de var(--ink) sur papier).
	const bg = await page
		.locator('.posee-rule')
		.first()
		.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(bg).toBe('rgba(0, 0, 0, 0)'); // transparent

	expect(errors).toEqual([]);
});

test('impression : .posee-input garde un cadre carré (border-top non nul, pas seulement border-bottom)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	await expect(page.locator('.posee-input').first()).toBeVisible();

	await page.emulateMedia({ media: 'print' });

	const cell = page.locator('.posee-input').first();

	// Règle CSS : border: 1.5px solid #333 → les 4 côtés doivent être non nuls.
	const borderTopWidth = await cell.evaluate((el) =>
		parseFloat(getComputedStyle(el).borderTopWidth),
	);
	const borderBottomWidth = await cell.evaluate((el) =>
		parseFloat(getComputedStyle(el).borderBottomWidth),
	);
	expect(borderTopWidth).toBeGreaterThanOrEqual(1);
	expect(borderBottomWidth).toBeGreaterThanOrEqual(1);

	// Fond transparent (pas de couleur d'interface sur papier).
	const bg = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(bg).toBe('rgba(0, 0, 0, 0)');

	expect(errors).toEqual([]);
});

/* --- Bulle d'aide des angles ------------------------------------------ */

/* La bulle `.angle-aide` ne figure que dans les questions de « temps 3 »
   (≈ 25 % des tirages). On itère sur les questions de la leçon QCM jusqu'à
   en trouver une (max 3 passages × 8 questions = 24 tirages → probabilité
   d'échec < 0,2 %). Si la bulle reste absente après toutes les tentatives, on
   signale l'anomalie plutôt que de passer silencieusement. */
test(".angle-aide.screen-only : visible à l'écran, display:none à l'impression", async ({
	page,
}) => {
	const errors = watchErrors(page);

	/** Charge la leçon et retourne vrai si au moins une question de la série
	    affiche la bulle d'aide (en avançant dans le QCM si nécessaire). */
	async function trouverBulle(): Promise<boolean> {
		await gotoHash(page, 'lecon-geo-angles');
		await expect(page.locator('.sprint-choice').first()).toBeVisible();

		// Parcourt toutes les questions d'une série (NB_QUESTIONS = 8).
		for (let i = 0; i < 8; i++) {
			if (await page.locator('.angle-aide').isVisible()) return true;
			// Répond au hasard (1er choix) pour passer à la question suivante.
			const btn = page.locator('.sprint-choice').first();
			if (!(await btn.isVisible())) break;
			await btn.click();
			// Attend le bouton "Continuer" ou la fin de série.
			const next = page.locator('#lqcmNext');
			try {
				await next.waitFor({ timeout: 2000 });
				// Vérifie si c'est la dernière question avant de cliquer.
				const label = await next.textContent();
				if (label?.includes('résultat')) break; // fin de série sans bulle trouvée
				await next.click();
			} catch {
				break;
			}
		}
		return false;
	}

	// Tente jusqu'à 3 séries de questions.
	let trouve = false;
	for (let tentative = 0; tentative < 3 && !trouve; tentative++) {
		trouve = await trouverBulle();
	}

	expect(
		trouve,
		'Aucune question de temps 3 (avec .angle-aide) trouvée après 3 séries — vérifier angles.ts',
	).toBe(true);

	// À l'écran : la bulle doit être visible (pas de display:none hors media print).
	const aide = page.locator('.angle-aide').first();
	await expect(aide).toBeVisible();

	// En média print : la classe .screen-only doit masquer la bulle.
	await page.emulateMedia({ media: 'print' });
	const displayPrint = await aide.evaluate((el) => getComputedStyle(el).display);
	expect(displayPrint).toBe('none');

	expect(errors).toEqual([]);
});
