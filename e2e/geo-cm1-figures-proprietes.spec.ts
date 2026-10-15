/* ============================================================
   Smoke e2e — Géométrie CM1 « Reconnaître une figure par ses propriétés » (#253).
   Leçon CM1-only à DEUX modes : Vrai/Faux mono-propriété (runner QCM existant,
   ui/lecon-qcm.ts, `.sprint-choice`) et Coche « toutes les propriétés qui
   s'appliquent » (NOUVEAU runner multi-sélection, ui/lecon-qcm-multi.ts,
   `.lqcm-multi-choice` + validation tout-ou-rien `#lqmValider`).
   Le mode Coche est le cœur de ce smoke (nouveau runner) : bouton de validation
   désactivé tant qu'aucune case n'est cochée, feedback tout-ou-rien + badge,
   boutons désactivés après validation (garde anti double-clic), enchaînement
   jusqu'à l'écran de résultat. Le mode Vrai/Faux reste un simple smoke (runner
   déjà couvert ailleurs, ex. angles-cm1.spec.ts / divisibilite-ordre-grandeur.spec.ts).
   Quelle que soit la figure tirée (carré, losange, triangle…), une figure SVG
   codée est toujours présente — on ne dépend d'aucune figure précise (aléatoire).
   Profil CM1 seedé (comme angles-cm1.spec.ts) avec les drapeaux « déjà vu » du
   tour enfant / mot aux parents, pour que l'onboarding ne bloque pas le clic.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

const SEED_CM1 = `(() => {
	localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));
	localStorage.setItem('e2e/ludaskia_tour_seen', 'true');
	localStorage.setItem('e2e/ludaskia_parents_seen', 'true');
})();`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

test('CM1 « Reconnaître une figure par ses propriétés » propose 2 modes', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-geo-cm1-figures-proprietes', { waitUntil: 'networkidle' });
	await expect(page.locator('.mode-btn')).toHaveCount(2);
	await expect(page.locator('.mode-btn[data-mode="qcm"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="coche"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('mode Coche : 4 propositions, « Vérifier » désactivé sans coche, feedback tout-ou-rien, jusqu’au résultat', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-geo-cm1-figures-proprietes', { waitUntil: 'networkidle' });
	await page.locator('.mode-btn[data-mode="coche"]').click();

	const choices = page.locator('.lqcm-multi-choice');
	await expect(choices).toHaveCount(4);
	// Figure codée toujours présente, quelle que soit la forme tirée.
	await expect(page.locator('.figure svg').first()).toBeVisible();

	const validate = page.locator('#lqmValider');
	await expect(validate).toBeDisabled(); // rien coché → « Vérifier » inactif
	await choices.first().click();
	await expect(validate).toBeEnabled(); // une case cochée → actif

	await validate.click();
	await expect(page.locator('.lqm-badge')).toBeVisible(); // feedback tout-ou-rien + badge
	await expect(page.locator('.lqcm-multi-choice:disabled')).toHaveCount(4); // garde anti double-clic

	// Enchaîne les 5 questions restantes (tour de 6) jusqu'à l'écran de résultat.
	for (let i = 1; i < 6; i++) {
		await page.locator('#lqmActions button').click();
		await expect(choices).toHaveCount(4);
		await choices.first().click();
		await page.locator('#lqmValider').click();
		await expect(page.locator('.lqm-badge')).toBeVisible();
	}
	await page.locator('#lqmActions button').click();
	await expect(page.locator('#leconAgain')).toBeVisible(); // écran de résultat

	expect(errors).toEqual([]);
});

test('mode Vrai/Faux (smoke) : figure rendue, un choix donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-geo-cm1-figures-proprietes', { waitUntil: 'networkidle' });
	await page.locator('.mode-btn[data-mode="qcm"]').click();

	await expect(page.locator('.figure svg').first()).toBeVisible();
	const choices = page.locator('.sprint-choice');
	await expect(choices).toHaveCount(2); // Vrai / Faux
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------
   Verdicts lus au lecteur d'écran après « Valider » (#543). Chaque proposition porte un
   `<span class="sr-only">` qui dit l'état coché AVANT le jugement, sans participe accordé
   (le texte lu est celui de la proposition, de genre variable). Les libellés sont ICI
   l'objet du test (apostrophe droite) : on les fige au mot près.
   Les bonnes réponses ne sont pas connues d'avance (tirage aléatoire) : on coche toujours
   les deux premières propositions, puis on lit le marquage visuel (`.is-hit`, `.is-missed`,
   `.is-false`) pour savoir ce qu'elles étaient. On rejoue des tirages jusqu'à une question
   qui présente les QUATRE cas (une bonne cochée, une bonne laissée, une fausse cochée, une
   fausse laissée).
   ------------------------------------------------------------------ */
test('mode Coche : le verdict lu de chaque proposition dit l’état coché, dans les quatre cas', async ({
	page,
}) => {
	test.setTimeout(120_000); // tirages rejoués jusqu'aux quatre cas
	const errors = watchErrors(page);
	const choices = page.locator('.lqcm-multi-choice');
	const ANCIENS = /correcte|oubliée|à ne pas cocher/i;
	let quatreCas = false;

	for (let essai = 0; essai < 25 && !quatreCas; essai++) {
		await page.goto('app.html#mode-geo-cm1-figures-proprietes', { waitUntil: 'networkidle' });
		await page.locator('.mode-btn[data-mode="coche"]').click();
		for (let q = 0; q < 6 && !quatreCas; q++) {
			await expect(choices).toHaveCount(4);
			await choices.nth(0).click();
			await choices.nth(1).click();
			await page.locator('#lqmValider').click();
			await page.locator('#lqmActions button').waitFor();

			const lignes = await choices.evaluateAll((btns) =>
				btns.map((b) => ({
					cls: ['is-hit', 'is-missed', 'is-false'].find((c) => b.classList.contains(c)) ?? 'neutre',
					sr: Array.from(b.querySelectorAll('.sr-only')).map((e) => (e.textContent ?? '').trim()),
				})),
			);
			const verdicts: Record<string, string[]> = {
				'is-hit': ["(tu as coché, c'est juste)"], // bonne + cochée
				'is-missed': ['(pas coché, il fallait cocher)'], // bonne + non cochée
				'is-false': ["(tu as coché, c'est faux)"], // fausse + cochée
				neutre: [], // fausse + non cochée : silence voulu
			};
			lignes.forEach((l, i) => {
				expect(l.sr, `proposition ${i} (${l.cls})`).toEqual(verdicts[l.cls]);
				for (const t of l.sr) expect(t).not.toMatch(ANCIENS);
				// L'état coché annoncé est celui que l'enfant a posé (0 et 1 cochées, 2 et 3 non).
				const cochee = l.cls === 'is-hit' || l.cls === 'is-false';
				expect(cochee, `proposition ${i} cochée`).toBe(i < 2);
			});

			quatreCas = new Set(lignes.map((l) => l.cls)).size === 4;
			if (!quatreCas && q < 5) await page.locator('#lqmActions button').click();
		}
	}

	expect(quatreCas, 'aucune question tirée ne présentait les quatre cas').toBe(true);
	expect(errors).toEqual([]);
});
