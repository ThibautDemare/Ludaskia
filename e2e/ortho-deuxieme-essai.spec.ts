/* ============================================================
   Orthographe : la saisie FAUSSE est conservée au 1er essai raté (branche
   fix/ortho-garder-saisie-2e-essai), écrite AVANT le correctif depuis les
   critères gelés :

   - critère 1 : dictée, parcours — après un 1er essai faux validé au clic, #orthoInput
     garde la saisie, n'est pas readonly, a le focus, curseur en fin de mot.
   - critère 2 : idem en « affiche/masque » (après « Cacher et écrire → »).
   - critère 3 (révisé) : une revalidation de la saisie INCHANGÉE est ignorée UNE fois, si elle
     arrive < 1000 ms après l'échec (performance.now) ; 3a clic ignoré (pas d'atelier, saisie,
     focus, « Presque »), 3b 2e revalidation (Entrée) comptée, 3c revalidation après 1 s
     comptée, 3d saisie modifiée fausse → correction guidée. Horloge pilotée (page.clock).
   - critère 4 (NÉGATIF) : le journal d'erreurs ne compte qu'UNE entrée pour le mot
     après ce scénario complet.
   - critère 5 (NÉGATIF) : le critère 1 tient sous l'UA Firefox Android tactile, où le
     focus rendu passe par un remasquage password → text.

   « Presque ! » est le libellé INCHANGÉ par le correctif : il sert ici de témoin du
   message du 1er essai (même repère que revision-ortho.spec.ts), pas d'objet de test.
   Hors périmètre : révision espacée, tuiles.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { STUB_VOIX_FR } from './journal-couverture';

const LESSON_ID = 'l-e2e-deuxieme-essai';
const MOT = 'bonjour';
const FAUX_1 = 'bonjoru';
const FAUX_2 = 'bonjoor';

const UA_FIREFOX_ANDROID_TABLETTE =
	'Mozilla/5.0 (Android 14; Tablet; rv:131.0) Gecko/131.0 Firefox/131.0';

const ORTHO_SEED = {
	banque: {
		w1: {
			id: 'w1',
			mot: MOT,
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{ id: LESSON_ID, label: 'Test deuxième essai', motIds: ['w1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { [MOT]: 'w1' },
};

type Mode = 'dictee' | 'motCache';

async function ouvrir(page: Page, mode: Mode): Promise<void> {
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, ORTHO_SEED);
	await seedAideVue(page);
	await gotoHash(page, 'ortho-mode-' + LESSON_ID);
	await page.locator(`.mode-btn[data-mode="${mode}"]`).click();
	if (mode === 'motCache') await page.locator('#btnCacher').click();
	await expect(page.locator('#orthoInput')).toBeVisible();
	await expect(page.locator('#orthoInput')).toBeFocused();
}

/** 1er essai faux, validé au clic. */
async function premierEchec(page: Page): Promise<void> {
	await page.locator('#orthoInput').fill(FAUX_1);
	await page.locator('#btnVerifMot').click();
	await expect(page.locator('body')).toContainText('Presque');
}

/** Attend deux rendus : laisse au code le temps de réagir à un geste dont on attend l'ABSENCE d'effet. */
async function apresRendus(page: Page): Promise<void> {
	await page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
	);
}

/* Horloge de la page figée à t=1000 ms dès l'init (AVANT gotoHash) : performance.now, rAF et
   timers n'avancent plus que par `avancer`. Les clics Playwright ne dépendent pas de cette
   horloge ; en revanche `apresRendus` (rAF) y bloquerait : ne pas l'utiliser ici. */
async function figerHorloge(page: Page): Promise<void> {
	await page.clock.install({ time: 0 });
	await page.clock.pauseAt(1000);
}

async function avancer(page: Page, ms: number): Promise<void> {
	await page.clock.runFor(ms);
}

async function verifierSaisieConservee(page: Page): Promise<void> {
	const input = page.locator('#orthoInput');
	await expect(input).toHaveValue(FAUX_1);
	await expect(input).not.toHaveAttribute('readonly', /.*/);
	await expect(input).toBeFocused();
	// Curseur lu après rendus (cf. anti-suggestion-focus.spec.ts : un remasquage peut le remettre à 0).
	await apresRendus(page);
	expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(FAUX_1.length);
	// Une frappe s'ajoute à la fin.
	await page.keyboard.type('x');
	await expect(input).toHaveValue(FAUX_1 + 'x');
	await page.keyboard.press('Backspace');
	await expect(input).toHaveValue(FAUX_1);
}

async function journal(page: Page): Promise<unknown[]> {
	return JSON.parse(
		(await page.evaluate(() => localStorage.getItem('e2e/ludaskia_erreurs'))) ?? '[]',
	) as unknown[];
}

test.describe('voix disponible (STUB_VOIX_FR)', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_VOIX_FR);
	});

	test('critère 1 : dictée, 1er essai faux, la saisie reste, focalisée, curseur en fin', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await ouvrir(page, 'dictee');
		await premierEchec(page);
		await expect(page.locator('#atelierMot')).toHaveCount(0);
		await verifierSaisieConservee(page);
		expect(errors).toEqual([]);
	});

	/* Critère 3 (révisé) : une revalidation INCHANGÉE est ignorée UNE fois, et seulement si
	   elle arrive < 1000 ms après l'échec (performance.now). Horloge pilotée par page.clock,
	   figée dès le départ (cf. figerHorloge) : aucune dépendance au temps réel. */
	const MODES: { mode: Mode; nom: string }[] = [
		{ mode: 'dictee', nom: 'dictée' },
		{ mode: 'motCache', nom: 'affiche/masque' },
	];

	for (const { mode, nom } of MODES) {
		test(`critère 3a (${nom}) : revalidation inchangée par clic dans la seconde, ignorée (pas de correction guidée, saisie, focus et curseur gardés)`, async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await figerHorloge(page);
			await ouvrir(page, mode);
			await premierEchec(page);

			const input = page.locator('#orthoInput');
			await expect(input).toHaveValue(FAUX_1); // sans saisie conservée, le clic ne serait pas une revalidation
			await page.locator('#btnVerifMot').click();
			await avancer(page, 100);
			await expect(page.locator('#atelierMot')).toHaveCount(0);
			await expect(input).toHaveValue(FAUX_1);
			await expect(input).toBeFocused();
			await expect(page.locator('body')).toContainText('Presque');
			// Curseur lu après rendus simulés (horloge figée : `avancer`, pas `apresRendus`).
			await avancer(page, 100);
			expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(FAUX_1.length);

			expect(errors).toEqual([]);
		});

		test(`critère 3b (${nom}) : une 2e revalidation inchangée (Entrée), toujours dans la seconde, est comptée`, async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await figerHorloge(page);
			await ouvrir(page, mode);
			await premierEchec(page);

			const input = page.locator('#orthoInput');
			await expect(input).toHaveValue(FAUX_1);
			await page.locator('#btnVerifMot').click();
			await avancer(page, 100);
			await expect(page.locator('#atelierMot')).toHaveCount(0);

			await input.press('Enter');
			await avancer(page, 100);
			await expect(page.locator('#atelierMot')).toBeVisible();

			expect(errors).toEqual([]);
		});
	}

	test('critère 3c : revalidation inchangée après 1 s, comptée', async ({ page }) => {
		const errors = watchErrors(page);
		await figerHorloge(page);
		await ouvrir(page, 'dictee');
		await premierEchec(page);

		const input = page.locator('#orthoInput');
		await expect(input).toHaveValue(FAUX_1);
		await avancer(page, 1000);
		await page.locator('#btnVerifMot').click();
		await avancer(page, 100);
		await expect(page.locator('#atelierMot')).toBeVisible();

		expect(errors).toEqual([]);
	});

	test('critère 3d : saisie modifiée mais fausse, correction guidée', async ({ page }) => {
		const errors = watchErrors(page);
		await figerHorloge(page);
		await ouvrir(page, 'dictee');
		await premierEchec(page);

		await page.locator('#orthoInput').fill(FAUX_2);
		await page.locator('#btnVerifMot').click();
		await avancer(page, 100);
		await expect(page.locator('#atelierMot')).toBeVisible();

		expect(errors).toEqual([]);
	});

	test('critère 4 (négatif) : le journal ne compte qu’une entrée pour le mot après 1er échec + revalidation inchangée ignorée + 2e essai modifié faux', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await figerHorloge(page);
		await ouvrir(page, 'dictee');
		await premierEchec(page);

		const input = page.locator('#orthoInput');
		// Pas d'assertion sur la saisie ici (critères 1/3) : ce test ne garde que le journal.
		await page.locator('#btnVerifMot').click();
		await avancer(page, 100);
		await input.fill(FAUX_2);
		await page.locator('#btnVerifMot').click();
		await avancer(page, 100);
		await expect(page.locator('#atelierMot')).toBeVisible();

		const entrees = await journal(page);
		expect(entrees, 'une seule erreur ciblable pour ce mot').toHaveLength(1);
		expect(JSON.stringify(entrees[0])).toContain(MOT);

		expect(errors).toEqual([]);
	});

	/* Critère 6 : Entrée MAINTENUE. Le 1er appui valide ; les répétitions (keydown repeat:true)
	   ne valident rien. Le 1er `down` est un vrai nouvel appui (ignoré une fois par la garde du
	   double appui) ; ce sont les répétitions suivantes, étalées sur > 1 s d'horloge, qui
	   déborderaient la fenêtre et brûleraient le 2e essai sans le garde `e.repeat`. */
	// Paramétré sur les deux modes : chacun branche `brancherEntree` (cf. checklist de tests.md).
	for (const { mode, nom } of MODES)
		test(`critère 6 (${nom}) : Entrée maintenue (répétitions keydown), rien n’est validé : pas de correction guidée, saisie gardée`, async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await page.addInitScript(() => {
				const w = window as unknown as { __repeats: boolean[] };
				w.__repeats = [];
				document.addEventListener(
					'keydown',
					(e) => {
						if (e.key === 'Enter') w.__repeats.push(e.repeat);
					},
					true,
				);
			});
			await figerHorloge(page);
			await ouvrir(page, mode);

			const input = page.locator('#orthoInput');
			await input.fill(FAUX_1);
			await input.press('Enter');
			await expect(page.locator('body')).toContainText('Presque');

			await page.keyboard.down('Enter'); // nouvel appui, ignoré une fois (dans la seconde)
			for (let i = 0; i < 3; i++) {
				await avancer(page, 600);
				await page.keyboard.down('Enter'); // répétition : repeat:true
			}
			await page.keyboard.up('Enter');
			await avancer(page, 100);

			// Témoin : Playwright a bien émis des répétitions, sinon le test ne garderait rien.
			const flags = await page.evaluate(
				() => (window as unknown as { __repeats: boolean[] }).__repeats,
			);
			expect(flags.filter(Boolean).length, 'au moins 3 keydown repeat:true').toBeGreaterThanOrEqual(
				3,
			);

			await expect(page.locator('#atelierMot')).toHaveCount(0);
			await expect(input).toHaveValue(FAUX_1);
			await expect(page.locator('body')).toContainText('Presque');

			expect(errors).toEqual([]);
		});

	test.describe('UA Firefox Android tactile', () => {
		test.use({ userAgent: UA_FIREFOX_ANDROID_TABLETTE });

		test('critère 5 (négatif) : sous remasquage password → text, saisie conservée, type text, curseur en fin', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			expect(
				await page.evaluate(() => navigator.maxTouchPoints),
				'témoin : profil tactile requis pour engager le remasquage',
			).toBeGreaterThan(0);
			await ouvrir(page, 'dictee');
			await premierEchec(page);
			await expect(page.locator('#orthoInput')).toHaveAttribute('type', 'text');
			await verifierSaisieConservee(page);
			await expect(page.locator('#orthoInput')).toHaveAttribute('type', 'text');
			expect(errors).toEqual([]);
		});
	});
});

test('critère 2 : affiche/masque, 1er essai faux, la saisie reste, focalisée, curseur en fin', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, 'motCache');
	await premierEchec(page);
	await expect(page.locator('#atelierMot')).toHaveCount(0);
	await verifierSaisieConservee(page);
	expect(errors).toEqual([]);
});
