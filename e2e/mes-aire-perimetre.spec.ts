/* ============================================================
   Smoke e2e — Grandeurs et mesures CM1 « Aire et périmètre » (#253).
   Leçon CM1-only, mono-mode QCM (runner existant ui/lecon-qcm.ts) sur figure
   quadrillage. Quatre sous-types tirés au hasard (aire seule / périmètre seul /
   vrai-faux / comparaison de deux figures A-B), la comparaison n'arrivant
   qu'~25 % du temps (core/figures : renderQuadrillagePaire, `.quad-pair`).
   Sélecteurs stables : .figure svg, .sprint-choice, #lqcmFeedback, .quad-pair,
   .quad-pair-item, #bcRun/#bcSelectNone, #bpStage/#bpPasser (parcours, #777).

   ⚠ Leçon taguée CM1 (comme geometrie-cm1.spec.ts) : on amorce un profil CM1 et
   on navigue DIRECTEMENT sur la route finale `#lecon-...` (pas `gotoHash`, qui
   forcerait CE2 via ENSURE_NIVEAU) ; aucun redirect interne sur cette route
   (contrairement à `#mode-...` en mono-mode) → pas besoin de seeder l'onboarding.
   Le 2ᵉ test (composeur de bilan) reste sur `gotoHash` (CE2) : `getLessonsByCategory`
   n'y filtre pas par niveau (#64), la leçon CM1 y apparaît quel que soit le profil.

   Comparaison forcée via le composeur de bilan « Tranquille » (bilan, PAS sprint) :
   `mes-aire-perimetre` est explicitement `excludeFromSprint` (comptage soigné +
   vrai/faux devinables, incompatibles avec le chrono, cf. aire-perimetre.ts) — un
   sprint personnalisé scopé à cette seule leçon retombe sur un pool VIDE et
   redirige silencieusement à l'accueil (`sprint.ts#lessonsForFilter` filtre les
   leçons `excludeFromSprint`, y compris pour un sprint personnalisé). Le mode
   « Tranquille » n'a pas ce filtre : on y génère « Beaucoup » (10) questions
   (#777 : parcours, une question par écran, chacune passée), avec ~94 % de
   chances qu'au moins l'une soit la comparaison (~25 %/tirage). Bornée à 5
   tentatives (re-composition fraîche), la probabilité résiduelle d'échec tombe
   à ~5×10⁻⁷ — négligeable, sans dépendre d'un seed applicatif inexistant ici. */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test('CM1 « Aire et périmètre » (QCM mono-mode) : quadrillage rendu, un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	await page.goto('app.html#lecon-mes-aire-perimetre', { waitUntil: 'networkidle' }); // mono-mode QCM → direct

	await expect(page.locator('.figure svg').first()).toBeVisible();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	const n = await choices.count();
	expect([2, 4]).toContain(n); // 2 (vrai/faux, oui/non) ou 4 (aire/périmètre)
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();

	expect(errors).toEqual([]);
});

/* Compose un bilan « Tranquille » scopé à la SEULE leçon, 10 questions (composeur de
   bilan, #64, cf. pave-signes.spec.ts), le joue en PARCOURS (#777 : une question par
   écran, plus de page unique) en passant chaque question, et dit si la comparaison
   (`.quad-pair`) est apparue ; si oui, vérifie sur l'écran même ses deux figures A/B.
   Le radio « Beaucoup » (`.bc-nbq-radio`) est visuellement masqué (carte cliquable,
   cf. bilan.scss) → on clique la carte `.bc-nbq-item` qui le contient. */
async function composeBilanTranquille(page: Page): Promise<boolean> {
	await gotoHash(page, 'bilan-cat-math-grandeurs-mesures');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="mes-aire-perimetre"]').check();
	await page.locator('.bc-nbq-item:has(.bc-nbq-radio[value="10"])').click();
	await page.locator('#bcRun').click();
	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
	for (let garde = 0; garde < 40; garde++) {
		await page.locator('#bpStage, .bp-fin-partie, .bp-recap').first().waitFor({ state: 'visible' });
		if (await page.locator('.bp-fin-partie, .bp-recap').first().isVisible()) return false;
		const paires = await page.locator('#bpStage .quad-pair').count();
		if (paires > 0) {
			// Chaque comparaison affiche exactement 2 figures (A et B) côte à côte.
			await expect(page.locator('#bpStage .quad-pair-item')).toHaveCount(paires * 2);
			return true;
		}
		const avant = await page.locator('.bp-question-num').innerText();
		await page.locator('#bpPasser').click();
		await page.waitForFunction(
			(a) =>
				!document.querySelector('#bpStage') ||
				document.querySelector('.bp-question-num')?.textContent !== a,
			avant,
		);
	}
	return false;
}

test('sous-type comparaison : deux quadrillages A/B se rendent côte à côte (#777 : dans le parcours)', async ({
	page,
}) => {
	test.setTimeout(90_000);
	const errors = watchErrors(page);

	let found = false;
	for (let attempt = 0; attempt < 5 && !found; attempt++) {
		found = await composeBilanTranquille(page);
	}
	expect(found).toBe(true);

	expect(errors).toEqual([]);
});
