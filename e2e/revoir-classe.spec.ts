/* ============================================================
   File « à revoir » scopée par classe (#573), côté enfant.
   Les libellés de la leçon témoin (CE2 « Clique sur le nom » / CM1 « Clique sur le nom
   noyau ») et leurs consignes sont ici l'objet du test : ils distinguent les deux classes.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const LECON = 'fr-gram-clic-noyau';
const PROFIL_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2', niveauParMatiere: { francais: 'cm1' } }], active: 'e2e' }));`;
const set = (cle: string, valeur: unknown) =>
	`localStorage.setItem('e2e/ludaskia_${cle}', ${JSON.stringify(JSON.stringify(valeur))});`;

const CONSIGNE_CE2 = 'Clique sur tous les noms de la phrase.';
const CONSIGNE_CM1 = 'Clique sur le nom noyau du groupe nominal.';

async function ouvrir(page: Page, ...scripts: string[]) {
	await page.addInitScript(PROFIL_CM1);
	await page.addInitScript(seedAideVueScript('e2e'));
	for (const s of scripts) await page.addInitScript(s);
	await gotoHash(page, 'accueil');
	await expect(page.locator('#aRevoir')).toBeVisible();
}

/* Structure de la carte : balises + classes des descendants, attributs de #aRevoir hors data-lesson/data-entry. */
const structure = (page: Page) =>
	page.locator('#aRevoir').evaluate((el) => ({
		desc: [el, ...Array.from(el.querySelectorAll('*'))].map(
			(e) => e.tagName + '.' + e.getAttribute('class'),
		),
		attrs: Array.from(el.attributes)
			.filter((a) => a.name !== 'data-lesson' && a.name !== 'data-entry')
			.map((a) => `${a.name}=${a.value}`),
	}));

test('critère 7 : épingle @ce2 → leçon rejouée en CE2, erreur journalisée en ce2', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, set('revoir', [`${LECON}@ce2`]));
	await expect(page.locator('#aRevoir .lj-title')).toHaveText('Clique sur le nom');
	await page.locator('#aRevoir .go').click();
	await expect(page).toHaveURL(new RegExp(`#(lecon|mode)-${LECON}@ce2$`));
	await expect(page.locator('.sprint-lesson')).toContainText('Clique sur le nom');
	await expect(page.locator('.sprint-lesson')).not.toContainText('noyau');
	await expect(page.locator('.lclic-consigne')).toContainText(CONSIGNE_CE2);
	// Tous les mots cliqués : forcément faux (les déterminants ne sont pas des noms).
	const mots = page.locator('.lclic-mot');
	const n = await mots.count();
	expect(n).toBeGreaterThan(1);
	for (let i = 0; i < n; i++) await mots.nth(i).click();
	await page.locator('#lclicVerif').click();
	await expect(page.locator('.lqcm-ko')).toBeVisible();
	const journal = await page.evaluate(() =>
		JSON.parse(localStorage.getItem('e2e/ludaskia_erreurs') || '[]'),
	);
	expect(journal.length).toBeGreaterThan(0);
	const derniere = journal[journal.length - 1];
	expect(derniere.lessonId).toBe(LECON);
	expect(derniere.niveau).toBe('ce2');
	expect(errors).toEqual([]);
});

test("critère 8 : id nu d'avant #573 → leçon au niveau ordinaire, hash sans @", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, set('revoir', [LECON]));
	await expect(page.locator('#aRevoir .lj-title')).toHaveText('Clique sur le nom noyau');
	await page.locator('#aRevoir .go').click();
	await expect(page).toHaveURL(new RegExp(`#(lecon|mode)-${LECON}$`));
	await expect(page.locator('.lclic-consigne')).toContainText(CONSIGNE_CM1);
	expect(errors).toEqual([]);
});

test('critère 14 (négatif) : la carte a le même rendu pour @ce2 et @cm1, sans mention de classe', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, set('revoir', [`${LECON}@ce2`]));
	const a = await structure(page);
	const texteA = await page.locator('#aRevoir').innerText();
	const titreA = await page.locator('#aRevoir .lj-title').innerText();
	const page2 = await page.context().newPage();
	const errors2 = watchErrors(page2);
	await ouvrir(page2, set('revoir', [`${LECON}@cm1`]));
	const b = await structure(page2);
	const texteB = await page2.locator('#aRevoir').innerText();
	const titreB = await page2.locator('#aRevoir .lj-title').innerText();

	expect(titreA).not.toBe(titreB); // garde : les deux cartes sont bien distinctes
	expect(b).toEqual(a);
	for (const t of [texteA, texteB]) expect(t).not.toMatch(/CE2|CM1/i);
	expect(errors).toEqual([]);
	expect(errors2).toEqual([]);
});

test('critère 11 : version CE2 réussie et marquée fragile → on propose la version CM1', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(
		page,
		set('revoir', [`${LECON}@ce2`]),
		set('stars', { [`${LECON}@ce2`]: 1 }),
		set('revoirFragile', [`${LECON}@ce2`]),
	);
	await expect(page.locator('#aRevoir .lj-title')).toHaveText('Clique sur le nom noyau');
	await page.locator('#aRevoir .go').click();
	await expect(page).toHaveURL(new RegExp(`#(lecon|mode)-${LECON}$`));
	await expect(page.locator('.lclic-consigne')).toContainText(CONSIGNE_CM1);
	expect(errors).toEqual([]);
});

test("critère 15 (négatif) : le titre de la carte n'est pas tronqué par une ellipse", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, set('revoir', [`${LECON}@ce2`]));
	const ellipsis = await page
		.locator('#aRevoir .lj-title')
		.evaluate((el) => getComputedStyle(el).textOverflow);
	expect(ellipsis).not.toBe('ellipsis');
	expect(errors).toEqual([]);
});
