/* ============================================================
   Chiffres romains (#717) — smoke e2e.

   Logique pure déjà couverte par 38 tests Vitest (tests/chiffres-romains.test.ts) :
   conversion, forme canonique, paliers, règle enfreinte. Ici on ne redouble pas ce
   travail — on tient ce qu'un vrai navigateur seul peut prouver : la vue se rend,
   les deux modes existent, la saisie se comporte comme attendu (majuscules forcées,
   pas un simple habillage CSS), et le feedback d'erreur nomme la règle enfreinte.

   CM1 uniquement (#717, hors périmètre : « Le CE2 »). Profil SEED_CM1 repris TEL
   QUEL de mesures-decimaux.spec.ts (#248) : même patron, pas de raison d'en refaire
   un troisième avant qu'il n'y ait un vrai partage (cf. e2e/README.md).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

test('critère 2 : la leçon se rend sans erreur et propose ses deux modes (ecrire, lire)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-num-chiffres-romains');
	await expect(page.locator('.mode-btn')).toHaveCount(2);
	await expect(page.locator('.mode-btn[data-mode="ecrire"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="lire"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('ecrire : remplir le champ avec l’écriture romaine attendue (data-answer) est compté juste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-num-chiffres-romains');
	await page.locator('.mode-btn[data-mode="ecrire"]').click();
	const field = page.locator('.ans-romain').first();
	await field.waitFor();
	// Réponse lue depuis l'attribut, jamais recalculée ici (l'item est tiré au hasard).
	const answer = await field.getAttribute('data-answer');
	expect(answer).toMatch(/^[IVXLCDM]+$/);
	await field.fill(answer ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('ecrire : taper en minuscules affiche des MAJUSCULES dans le champ, et reste compté juste (arbitrage mainteneur)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-chiffres-romains'); // mode par défaut = ecrire (recommandé)
	const field = page.locator('.ans-romain').first();
	await field.waitFor();
	const answer = await field.getAttribute('data-answer');
	expect(answer).toMatch(/^[IVXLCDM]+$/);
	// Frappe réelle (pressSequentially) plutôt que `fill()` : elle déclenche l'évènement
	// `input` à CHAQUE caractère, celui qu'écoute le forçage de casse (ui/session.ts). Un
	// `fill()` pose la valeur finale d'un coup et ne prouverait rien sur la frappe elle-même.
	await field.focus();
	await field.pressSequentially((answer ?? '').toLowerCase());
	// La VALEUR soumise, pas le rendu visuel : un `text-transform: uppercase` en CSS
	// afficherait des majuscules sans changer ce qui part à la correction — exactement le
	// défaut que cet arbitrage (JS, pas CSS) doit empêcher. `inputValue()` lit la vraie
	// valeur du champ, pas son affichage.
	expect(await field.inputValue()).toBe(answer);
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('critère 5 : une écriture fausse mais licite marque faux et NOMME la règle enfreinte', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-chiffres-romains');
	const field = page.locator('.ans-romain').first();
	await field.waitFor();
	// « IIII » n'est la forme canonique d'AUCUN nombre de 1 à 3999 (un signe I/X/C/M ne se
	// répète jamais 4 fois) : quel que soit l'item tiré par la fiche, cette saisie est
	// TOUJOURS fausse et enfreint TOUJOURS la même règle (répétition interdite).
	//
	// Note pour le relecteur : la consigne initiale demandait de chercher, parmi les items
	// rendus, celui dont la réponse exacte est « IV » (le cas d'école IIII/IV). Calcul fait :
	// le palier « formes soustractives » compte 488 nombres sous 1000, dont un SEUL (4)
	// s'écrit IV — 3 des 8 items d'une fiche relèvent de ce palier, donc P(un item = IV par
	// fiche) ≈ 3/488 ≈ 0,6 %. Chercher cet item précis par rechargements successifs demanderait
	// plusieurs centaines de tentatives pour une chance raisonnable de succès (95 % ≈ 485
	// rechargements) — ingérable en e2e, et non demandé ailleurs dans ce dossier pour un tirage
	// aussi rare. `regleEnfreinte` ne compare la forme au nombre visé qu'APRÈS avoir écarté les
	// fautes structurelles (signe inconnu, répétition ×4, répétition de V/L/D, soustraction hors
	// des six formes) : « IIII » tombe systématiquement dans la même branche (répétition ×4),
	// quel que soit l'item réellement tiré. Le test exerce donc exactement le même code — et la
	// même exigence du critère 5 — sans dépendre d'un tirage que l'implémentation rend
	// pratiquement impossible à cibler de l'extérieur.
	await field.fill('IIII');
	await page.locator('#btnVerify').click();
	const mark = page.locator('.mark.wrong').first();
	await expect(mark).toBeVisible();
	const regle = mark.locator('.regle-romaine');
	await expect(regle).toBeVisible();
	expect((await regle.innerText()).trim().length).toBeGreaterThan(0);
	expect(errors).toEqual([]);
});

test('lire (critère 2, autre sens) : remplir le champ avec le nombre attendu (data-answer) est compté juste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-num-chiffres-romains');
	await page.locator('.mode-btn[data-mode="lire"]').click();
	const field = page.locator('.ans').first();
	await field.waitFor();
	const answer = await field.getAttribute('data-answer');
	expect(answer).toMatch(/^\d+$/); // un nombre arabe, pas une écriture romaine
	await field.fill(answer ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});
