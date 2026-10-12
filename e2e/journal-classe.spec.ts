/* ============================================================
   Journal d'erreurs et file « à revoir » scopés par classe (#573) — espace encadrant.
   Une même leçon (`fr-gram-clic-noyau`) existe en CE2 (« Clique sur le nom ») et en CM1
   (« Clique sur le nom noyau ») : le journal ne doit pas les fondre, ni masquer l'erreur
   CE2 d'un enfant désormais suivi en CM1. Les libellés de leçon sont ici l'objet du test
   (ils distinguent les deux classes), donc cités au mot près.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;
const LECON = 'fr-gram-clic-noyau';

/* Profil suivi en CM1 en français : semé AVANT gotoHash, qui ne touche pas à une méta existante. */
const PROFIL_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2', niveauParMatiere: { francais: 'cm1' } }], active: 'e2e' }));`;

const err = (lessonId: string, niveau: string | undefined, dt: number, q: string) =>
	`{ ts: now - ${dt}, lessonId: '${lessonId}', mode: 'lecon', question: '${q}', donnee: 'a', attendue: 'b'${niveau ? `, niveau: '${niveau}'` : ''} }`;

const seedErreurs = (items: string[]) =>
	`(() => { const now = Date.now(); localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify([${items.join(',')}])); })();`;

const SEED_TROIS = seedErreurs([
	err(LECON, 'ce2', 0, 'q1'),
	err(LECON, 'cm1', 1000, 'q2'),
	err(LECON, undefined, 2000, 'q3'), // d'avant #573 : lue comme CE2
]);

async function ouvrir(page: Page, ...scripts: string[]) {
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(PROFIL_CM1);
	for (const s of scripts) await page.addInitScript(s);
	await gotoHash(page, 'encadrant');
	await page.locator('.enc-act-mode[data-act="erreurs-periode"][data-periode="tout"]').click();
}

const revoir = (page: Page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem('e2e/ludaskia_revoir') || '[]'));

test("critères 1-4, 16 : deux groupes distincts, l'erreur CE2 reste visible en CM1", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, SEED_TROIS);

	await expect(page.locator('.enc-err-lecon')).toHaveCount(2);
	const ce2 = page.locator('.enc-err-lecon[data-niveau="ce2"]');
	const cm1 = page.locator('.enc-err-lecon[data-niveau="cm1"]');
	await expect(ce2.locator('.enc-err-lecon-lab')).toHaveText('Clique sur le nom');
	await expect(ce2.locator('.enc-classe-origine')).toHaveText(/CE2/);
	await expect(ce2.locator('.enc-err-count')).toContainText('2 erreurs');
	await expect(cm1.locator('.enc-err-lecon-lab')).toHaveText('Clique sur le nom noyau');
	await expect(cm1.locator('.enc-classe-origine')).toHaveText(/CM1/);
	await expect(cm1.locator('.enc-err-count')).toContainText('1 erreur');
	expect(errors).toEqual([]);
});

test("critère 6 : épingler un groupe n'épingle que sa classe", async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrir(page, SEED_TROIS);

	const ce2 = page.locator('.enc-err-lecon[data-niveau="ce2"]');
	const cm1 = page.locator('.enc-err-lecon[data-niveau="cm1"]');
	const bCe2 = ce2.locator('[data-act="epingler"]');
	const bCm1 = cm1.locator('[data-act="epingler"]');
	// Le re-rendu qui suit un épinglage replie les groupes : on rouvre avant chaque lecture.
	const ouvrirTout = async () => {
		for (const g of [ce2, cm1]) {
			if (!(await g.evaluate((el) => (el as HTMLDetailsElement).open)))
				await g.locator('.enc-err-sum').click();
		}
	};

	await ouvrirTout();
	await bCe2.click();
	await ouvrirTout();
	await expect(bCe2).toHaveText('Retirer');
	await expect(bCm1).toHaveText('Épingler');
	expect(await revoir(page)).toEqual([`${LECON}@ce2`]);

	await bCm1.click();
	await ouvrirTout();
	await expect(bCe2).toHaveText('Retirer');
	await expect(bCm1).toHaveText('Retirer');
	expect(await revoir(page)).toHaveLength(2);

	await bCe2.click();
	await ouvrirTout();
	await expect(bCe2).toHaveText('Épingler');
	await expect(bCm1).toHaveText('Retirer');
	expect(errors).toEqual([]);
});

test("critère 12 : retrait automatique explique que la version suivie n'est pas réussie", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(PROFIL_CM1);
	await page.addInitScript(
		`localStorage.setItem('e2e/ludaskia_revoirAuto', JSON.stringify([{ id: '${LECON}@ce2', kind: 'lecon', label: 'Clique sur le nom', at: Date.now(), motif: 'version-suivie', versionSuivie: { niveau: 'cm1', label: 'Clique sur le nom noyau', reussie: false } }]));`,
	);
	await gotoHash(page, 'encadrant');
	await page.locator('.enc-tab[data-tab="programme"]').click();

	const ligne = page.locator('.enc-revoir-item').filter({ hasText: 'Clique sur le nom' });
	await expect(ligne).toHaveCount(1);
	const meta = ligne.locator('.enc-detail-meta');
	await expect(meta).toContainText('Clique sur le nom noyau');
	await expect(meta).toContainText('CM1');
	await expect(meta).toContainText('pas encore');
	await expect(meta).toContainText('ne sera pas reproposée');
	expect(errors).toEqual([]);
});

test('critère 5 : une liste hors catalogue ignore la classe du journal', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrir(
		page,
		seedErreurs([
			err('liste-mots-semaine', 'ce2', 0, 'q1'),
			err('liste-mots-semaine', 'cm1', 1000, 'q2'),
		]),
	);

	await expect(page.locator('.enc-err-lecon')).toHaveCount(1);
	await expect(page.locator('.enc-err-lecon[data-niveau]')).toHaveCount(0);
	await expect(page.locator('.enc-err-lecon .enc-classe-origine')).toHaveCount(0);
	expect(errors).toEqual([]);
});
