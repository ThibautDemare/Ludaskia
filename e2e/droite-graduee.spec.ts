/* ============================================================
   Smoke e2e — Numération CM1 « Droite graduée » (#256).
   Runner d'écran DÉDIÉ (ui/lecon-droite-graduee.ts, hors sprint) : l'enfant lit une
   consigne « Place le nombre X sur la droite graduée. », POSE un repère sur la
   graduation correspondante (tap aimanté OU flèches clavier), puis « Vérifier ».
   Deux leçons CM1 sur la même brique : entiers (num-droite-entiers) et décimaux
   (num-droite-decimaux, cible à virgule).

   La cible EST toujours une graduation (data-index/data-valeur/data-label sur
   `.dg-hit`) : on lit le nombre à placer dans #dgConsigne, on en déduit le hit
   correspondant via son `data-label` (identique caractère pour caractère à la
   consigne, y compris la virgule décimale et l'espace fine insécable des grands
   nombres groupés) — jamais recalculé depuis les données aléatoires.

   Aide contextuelle (#272/#435) : `maybeAutoAide('droiteGraduee')` ouvre une bulle
   d'aide (#aideOverlay) au 1er lancement ; on la ferme avant toute interaction,
   comme clic-verbe.spec.ts / appariement.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (leçons `levels: ['cm1']`, invisibles sous le niveau CE2 par défaut). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

/* Ferme l'aide auto-affichée si présente (1er lancement du profil) ; no-op sinon. */
async function fermerAideSiPresente(page: Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) {
		await page.locator('.aide-ok').click();
		await expect(overlay).toHaveCount(0);
	}
}

/* Extrait le libellé de la cible depuis la consigne (« Place le nombre 3,47 sur la
   droite graduée. » → « 3,47 »), identique caractère pour caractère au `data-label`
   du `.dg-hit` visé (même fonction de formatage côté data et côté consigne). */
async function cibleLabelDepuisConsigne(page: Page): Promise<string> {
	const texte = await page.locator('#dgConsigne').innerText();
	const m = texte.match(/Place le nombre (.+) sur la droite graduée/);
	expect(m).not.toBeNull();
	return m![1];
}

test('CM1 : la catégorie Numération propose les deux leçons « droite graduée »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-math-numeration');
	await expect(page.locator('.lesson-item[data-id="num-droite-entiers"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-droite-decimaux"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('entiers : placement correct au tap → feedback juste, figure de révélation', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-num-droite-entiers'); // mono-mode → lancement direct
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page); // écarte l'auto-aide (#435) avant toute interaction

	await expect(page.locator('#dgVerify')).toBeDisabled();

	const cible = await cibleLabelDepuisConsigne(page);
	const hit = page.locator(`.dg-hit[data-label="${cible}"]`);
	await expect(hit).toHaveCount(1); // la cible est toujours une graduation existante
	await hit.click();

	await expect(page.locator('#dgVerify')).toBeEnabled();
	await page.locator('#dgVerify').click();

	await expect(page.locator('.lqcm-ok')).toBeVisible();
	await expect(page.locator('#dgStatus')).toContainText('Bravo');
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.figure-droite-graduee circle')).toHaveCount(1); // un seul repère (correct)
	// #153 : « Vérifier » s'efface, seul « Continuer ▶ » reste.
	await expect(page.locator('#dgVerify')).toBeHidden();
	await expect(page.locator('#dgActions button')).toBeVisible();
	expect(errors).toEqual([]);
});

test('décimaux : placement correct au tap (cible à virgule) → feedback juste', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-num-droite-decimaux'); // mono-mode → lancement direct
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	const cible = await cibleLabelDepuisConsigne(page);
	expect(cible).toContain(','); // programme CM1 : cible décimale (dixièmes/centièmes)
	const hit = page.locator(`.dg-hit[data-label="${cible}"]`);
	await expect(hit).toHaveCount(1);
	await hit.click();
	await expect(page.locator('#dgVerify')).toBeEnabled();
	await page.locator('#dgVerify').click();

	await expect(page.locator('.lqcm-ok')).toBeVisible();
	expect(errors).toEqual([]);
});

test('clavier : les flèches déplacent le repère, Entrée déclenche la correction', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-num-droite-entiers');
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	// Focus la 1re graduation (seule focusable au départ, tabindex=0 roving), déplace le
	// repère au clavier puis valide — on prouve le CHEMIN clavier, pas la justesse.
	const premierHit = page.locator('.dg-hit[data-index="0"]');
	await premierHit.focus();
	await page.locator('.dg-interactif').press('ArrowRight');
	await expect(page.locator('#dgVerify')).toBeEnabled();
	await page.locator('.dg-interactif').press('Enter');

	await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
	await expect(page.locator('#dgVerify')).toBeHidden();
	expect(errors).toEqual([]);
});

test('placement faux : feedback ko et repères juste/faux révélés', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-num-droite-decimaux');
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	// La cible n'est JAMAIS une borne numérotée (#256 : indices 1-4/6-9 exclus de 0/5/10) →
	// la graduation d'index 0 est toujours un mauvais choix, déterministe.
	await page.locator('.dg-hit[data-index="0"]').click();
	await page.locator('#dgVerify').click();

	await expect(page.locator('.lqcm-ko')).toBeVisible();
	await expect(page.locator('#dgStatus')).toContainText("Ce n'est pas ça");
	// Révélation : le bon repère (vert) + le repère de l'enfant (rouge) sont dessinés.
	await expect(page.locator('.figure-droite-graduee circle')).toHaveCount(2);
	expect(errors).toEqual([]);
});
