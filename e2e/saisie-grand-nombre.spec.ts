/* ============================================================
   Saisie d'un GRAND NOMBRE (retour terrain, novembre 2026).
   Règle : un champ numérique dont la réponse attendue vaut au moins 10 000 groupe les
   chiffres à la frappe (espace fine U+202F, « 1 400 000 ») et a la place de
   « 9 999 999 ». Vrai de longue date sur la fiche (`.ans-grand`, cf. grands-nombres.spec.ts),
   désormais aussi en révision (`#revInput`) et dans le bilan guidé (`#bpInput`), par la
   classe `.saisie-groupee`. Un champ dont la réponse vaut moins de 10 000 ne porte PAS la
   classe (critère négatif).

   Matériau : `num-encadrer-intercaler` en CM1 (réponses toujours à 5 chiffres et plus) pour
   le côté positif ; `num-decompose-multiplicative` (réponses : un chiffre, sauf le sens
   « composer ») pour le négatif.
   Le tirage est aléatoire : la fiche et le bilan lisent `data-answer` ; la révision n'expose
   pas la réponse, on la déduit donc de l'énoncé « Place un nombre entre A et B » (le milieu
   convient à la correction par intervalle) et on relance la séance jusqu'à ce tirage,
   avec une borne.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue, seedAideVueScript } from './helpers';

const U202F = String.fromCharCode(0x202f);
const LECON_GRANDE = 'num-encadrer-intercaler';
const LECON_PETITE = 'num-decompose-multiplicative';

const valeur = (s: string | null): number =>
	Number((s ?? '').replace(/[\s\u202F\u00A0]/g, '').replace(',', '.'));
const tient = (page: Page, sel: string) =>
	page.locator(sel).evaluate((el) => (el as HTMLInputElement).scrollWidth <= el.clientWidth);

function profilCm1(uuid: string): string {
	return `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${uuid}', name: 'Test', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: '${uuid}' }));`;
}

/* ---------------- Fiche ---------------- */

test.describe('fiche', () => {
	test.beforeEach(async ({ page }) => {
		await seedAideVue(page);
		await page.addInitScript(profilCm1('e2e'));
	});

	test('réponse ≥ 10 000 : champ groupé à la frappe, valeur contenue, réponse juste validée', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoHash(page, `lecon-${LECON_GRANDE}`);
		const champ = page.locator('.ans-grand').first();
		await champ.waitFor({ state: 'attached' });
		const chiffres = ((await champ.getAttribute('data-answer')) ?? '').replace(/\D/g, '');
		expect(chiffres.length).toBeGreaterThanOrEqual(5);
		await champ.focus();
		await champ.pressSequentially(chiffres);
		expect(await champ.inputValue()).toContain(U202F);
		expect(
			await champ.evaluate((el) => (el as HTMLInputElement).scrollWidth <= el.clientWidth),
		).toBe(true);
		await page.locator('#btnVerify').click();
		await expect(
			champ.locator('xpath=following-sibling::span[contains(@class,"mark")]'),
		).toHaveClass(/correct/);
		expect(errors).toEqual([]);
	});

	test('critère négatif : un champ dont la réponse est < 10 000 n’est pas un champ à grand nombre', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoHash(page, `lecon-${LECON_PETITE}`);
		await page.locator('input.ans').first().waitFor();
		const lignes = await page
			.locator('input.ans')
			.evaluateAll((els) =>
				els.map((e) => [e.getAttribute('data-answer'), e.classList.contains('ans-grand')] as const),
			);
		const petits = lignes.filter(([a]) => valeur(a) < 10000);
		expect(petits.length, 'aucun champ à petite réponse sur cette fiche').toBeGreaterThan(0);
		for (const [, grand] of petits) expect(grand).toBe(false);
		for (const [a, grand] of lignes) if (valeur(a) >= 10000) expect(grand).toBe(true);
		expect(errors).toEqual([]);
	});
});

/* ---------------- Révision ---------------- */

const UUID_REV = 'e2e-saisie-groupee-rev';
const seedRevision = (lecon: string) =>
	profilCm1(UUID_REV) +
	`localStorage.setItem('${UUID_REV}/ludaskia_lessonRevision', JSON.stringify({ '${lecon}@cm1': { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: null } }));` +
	seedAideVueScript(UUID_REV);

test.describe('révision', () => {
	test('réponse ≥ 10 000 : #revInput groupé à la frappe, valeur contenue, réponse juste validée', async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const errors = watchErrors(page);
		await page.addInitScript(seedRevision(LECON_GRANDE));
		await gotoHash(page, 'revision-espacee');
		// Relance la séance jusqu'à une question « Place un nombre entre A et B ».
		let milieu: number | null = null;
		for (let essai = 0; essai < 30 && milieu === null; essai++) {
			await page.locator('#revInput').waitFor();
			const enonce = await page.locator('.rev-q').innerText();
			if (/entre/.test(enonce)) {
				const nombres = [...enonce.matchAll(/\d[\d\s\u202F\u00A0]*/g)].map((m) => valeur(m[0]));
				if (nombres.length >= 2) milieu = (nombres[0] + nombres[1]) / 2;
			}
			if (milieu === null) await gotoHash(page, 'revision-espacee');
		}
		expect(milieu, 'aucune question d’intercalation en 30 tirages').not.toBeNull();

		const champ = page.locator('#revInput');
		await expect(champ).toHaveClass(/saisie-groupee/);
		await champ.focus();
		await champ.pressSequentially(String(milieu));
		expect(await champ.inputValue()).toContain(U202F);
		expect(await tient(page, '#revInput')).toBe(true);
		await page.locator('#revValidate').click();
		await expect(page.locator('.rev-feedback.ok')).toBeVisible();
		expect(errors).toEqual([]);
	});

	test('critère négatif : une réponse < 10 000 ne donne pas #revInput la classe', async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const errors = watchErrors(page);
		await page.addInitScript(seedRevision(LECON_PETITE));
		await gotoHash(page, 'revision-espacee');
		// Le sens « composer » (minoritaire) a une réponse à 4-6 chiffres : on veut le sens
		// « décomposer », dont la réponse est UN chiffre.
		for (let essai = 0; essai < 15; essai++) {
			await page.locator('#revInput').waitFor();
			if ((await page.locator('.decompo--composer').count()) === 0) break;
			await gotoHash(page, 'revision-espacee');
		}
		await expect(page.locator('.decompo--composer')).toHaveCount(0);
		await expect(page.locator('#revInput')).toBeVisible();
		await expect(page.locator('#revInput')).not.toHaveClass(/saisie-groupee/);
		expect(errors).toEqual([]);
	});
});

/* ---------------- Bilan guidé ---------------- */

const UUID_BILAN = 'e2e';
async function lancerBilan(page: Page, lecon: string, nbq: number): Promise<void> {
	await seedAideVue(page);
	await page.addInitScript(profilCm1(UUID_BILAN));
	await page.addInitScript(
		(json) => localStorage.setItem('e2e/ludaskia_bilans', json),
		JSON.stringify([
			{
				id: 'fav-saisie',
				label: 'Grands nombres',
				lessonIds: [lecon],
				questionsPerLesson: nbq,
				mode: 'bilan',
				categoryId: 'math-numeration',
			},
		]),
	);
	await gotoHash(page, 'accueil');
	await page.locator('.favori-btn-run').first().click();
	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
}

/* Avance d'un écran : `agir` joue la question affichée, puis on attend un autre écran. */
async function parcourir(
	page: Page,
	surQuestion: (i: number) => Promise<'valider' | 'passer'>,
): Promise<void> {
	for (let i = 0; i < 40; i++) {
		await page.locator('#bpStage, .bp-fin-partie, .bp-recap').first().waitFor({ state: 'visible' });
		if (await page.locator('.bp-recap').isVisible()) return;
		if (await page.locator('.bp-fin-partie').isVisible()) {
			await page.locator('#bpPartieSuivante, #bpVoirBilan').first().click();
			continue;
		}
		const avant = `${await page.locator('.bp-partie-num').innerText()}|${await page.locator('.bp-question-num').innerText()}`;
		const geste = await surQuestion(i);
		await page.locator(geste === 'valider' ? '#bpValider' : '#bpPasser').click();
		await page.waitForFunction((a) => {
			if (!document.querySelector('#bpStage') || document.querySelector('.bp-fin-partie'))
				return true;
			const p = document.querySelector('.bp-partie-num')?.textContent?.trim();
			const q = document.querySelector('.bp-question-num')?.textContent?.trim();
			return `${p}|${q}` !== a;
		}, avant);
	}
	throw new Error('Le parcours ne se termine pas');
}

test.describe('bilan guidé', () => {
	test('réponse ≥ 10 000 : #bpInput groupé à la frappe, valeur contenue, bilan réussi', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await lancerBilan(page, LECON_GRANDE, 3);
		let verifie = false;
		await parcourir(page, async () => {
			const champ = page.locator('#bpInput');
			await expect(champ).toHaveClass(/saisie-groupee/);
			const chiffres = ((await champ.getAttribute('data-answer')) ?? '').replace(/\D/g, '');
			expect(chiffres.length).toBeGreaterThanOrEqual(5);
			await champ.focus();
			await champ.pressSequentially(chiffres);
			expect(await champ.inputValue()).toContain(U202F);
			expect(await tient(page, '#bpInput')).toBe(true);
			verifie = true;
			return 'valider';
		});
		expect(verifie).toBe(true);
		await expect(
			page.locator(`.bp-recap .bp-lecon[data-lesson="${LECON_GRANDE}"]`),
		).toHaveAttribute('data-verdict', 'reussi');
		expect(errors).toEqual([]);
	});

	test('critère négatif : la classe suit exactement la règle « réponse ≥ 10 000 »', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await lancerBilan(page, LECON_PETITE, 8);
		let petits = 0;
		await parcourir(page, async () => {
			const champ = page.locator('#bpInput');
			const attendue = valeur(await champ.getAttribute('data-answer'));
			const groupee = await champ.evaluate((el) => el.classList.contains('saisie-groupee'));
			expect(groupee, `réponse attendue ${attendue}`).toBe(attendue >= 10000);
			if (attendue < 10000) petits++;
			return 'passer';
		});
		expect(petits, 'aucune question à petite réponse tirée').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});
});
