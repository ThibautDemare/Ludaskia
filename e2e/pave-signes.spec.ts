/* ============================================================
   Pavé de signes « < = > » (#380) — smoke e2e.
   Fiche/bilan en saisie : un champ `.ans-signe` est co-localisé avec un pavé
   de 3 boutons `.pave-signe` (comportement délégué, src/ui/pave-signes.ts) ;
   sprint : la même réponse (signe) est posée en QCM à 3 choix `.sprint-choice`
   (src/ui/sprint.ts). Testé sur `num-comparer` (CE2, mode saisie par défaut) :
   toutes ses questions ont une réponse signe, ce qui rend le tirage sprint
   déterministe une fois le sprint filtré sur cette seule leçon (composeur de
   bilan personnalisé, #64 — cf. lessonsForFilter({ type: 'lessons' })).
   Sélecteurs stables : .ans, .pave-signe[data-for/data-signe], .mark[data-for],
   .sprint-choice, .lqcm-choices-sym, #btnVerify, #bcRun, #bcSelectNone.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const SIGNES = ['<', '=', '>'] as const;
const SIGNE_LABELS: Record<string, string> = {
	'<': 'plus petit que',
	'=': 'égal à',
	'>': 'plus grand que',
};

test('comparer (pavé) : cliquer le bon signe remplit le champ, aria-pressed bascule, validation OK', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer'); // mode par défaut = saisie
	const field = page.locator('.ans').first();
	await field.waitFor();
	const id = await field.getAttribute('id');
	const expected = await field.getAttribute('data-answer');
	expect(SIGNES).toContain(expected);

	const boutons = page.locator(`.pave-signe[data-for="${id}"]`);
	await expect(boutons).toHaveCount(3);
	const bonBouton = page.locator(`.pave-signe[data-for="${id}"][data-signe="${expected}"]`);
	await bonBouton.click();

	await expect(field).toHaveValue(expected ?? '');
	await expect(bonBouton).toHaveAttribute('aria-pressed', 'true');
	const autres = page.locator(`.pave-signe[data-for="${id}"]:not([data-signe="${expected}"])`);
	await expect(autres).toHaveCount(2);
	await expect(autres.nth(0)).toHaveAttribute('aria-pressed', 'false');
	await expect(autres.nth(1)).toHaveAttribute('aria-pressed', 'false');

	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('comparer (pavé) : changer d’avis ne laisse qu’un seul bouton actif', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer');
	const field = page.locator('.ans').first();
	await field.waitFor();
	const id = await field.getAttribute('id');
	const boutons = page.locator(`.pave-signe[data-for="${id}"]`);

	await boutons.nth(0).click();
	await boutons.nth(1).click(); // changement d'avis : un autre signe
	const secondSigne = await boutons.nth(1).getAttribute('data-signe');

	await expect(field).toHaveValue(secondSigne ?? '');
	await expect(boutons.nth(1)).toHaveAttribute('aria-pressed', 'true');
	await expect(boutons.nth(0)).toHaveAttribute('aria-pressed', 'false');
	await expect(boutons.nth(2)).toHaveAttribute('aria-pressed', 'false');
	expect(errors).toEqual([]);
});

test('comparer (pavé) : corriger une mauvaise réponse efface le marquage ✗', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer');
	const field = page.locator('.ans').first();
	await field.waitFor();
	const id = await field.getAttribute('id');
	const expected = await field.getAttribute('data-answer');
	const wrong = SIGNES.find((s) => s !== expected);

	await page.locator(`.pave-signe[data-for="${id}"][data-signe="${wrong}"]`).click();
	await page.locator('#btnVerify').click();
	const mark = page.locator(`.mark[data-for="${id}"]`);
	await expect(mark).toHaveClass(/wrong/);

	// Comme à la frappe : reposer le bon signe via le pavé efface le marquage.
	await page.locator(`.pave-signe[data-for="${id}"][data-signe="${expected}"]`).click();
	await expect(mark).not.toHaveClass(/wrong/);
	await expect(mark).not.toHaveClass(/correct/);
	await expect(field).toHaveValue(expected ?? '');
	expect(errors).toEqual([]);
});

test('sprint : une question de comparaison se pose en QCM à 3 choix, pas en champ texte', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Compose un sprint restreint à la SEULE leçon « num-comparer » (100 % réponses
	// signe) via le composeur de bilan personnalisé, scopé à la catégorie Numération
	// (#64) : le tirage sprint devient déterministe (une seule leçon éligible).
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-comparer"]').check();
	await page.locator('.bc-mode-radio[value="sprint"]').check();
	await page.locator('#bcRun').click();

	await expect(page.locator('#sprintTime')).toBeVisible();
	await expect(page.locator('#sprintInput')).toHaveCount(0); // pas de champ texte
	const choices = page.locator('.sprint-choice');
	await expect(choices).toHaveCount(3);
	await expect(page.locator('.sprint-choices.lqcm-choices-sym')).toBeVisible();

	// Déduit le bon signe depuis l'énoncé, comme le test tuiles de numeration.spec.ts.
	const enonce = await page.locator('.sprint-q-qcm').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]),
		b = Number(m![2]);
	const signe = a < b ? '<' : a > b ? '>' : '=';
	await page.locator(`.sprint-choice[aria-label="${SIGNE_LABELS[signe]}"]`).click();
	await expect(page.locator('.sprint-check')).toBeVisible(); // feedback positif immédiat
	expect(errors).toEqual([]);
});
