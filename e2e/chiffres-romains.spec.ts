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

test('ecrire : taper en minuscules reste compté juste, et la forme affichée reste en majuscules (arbitrage mainteneur, relecture a11y #717)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-chiffres-romains'); // mode par défaut = ecrire (recommandé)
	const field = page.locator('.ans-romain').first();
	await field.waitFor();
	const answer = await field.getAttribute('data-answer');
	expect(answer).toMatch(/^[IVXLCDM]+$/);
	const saisie = (answer ?? '').toLowerCase();
	// Frappe réelle (pressSequentially) plutôt que `fill()` : elle déclenche l'évènement
	// `input` à CHAQUE caractère — celui que forçait autrefois la casse. On veut prouver
	// qu'il n'y a plus rien qui intercepte cet évènement sur ce champ, pas seulement que
	// la valeur finale est correcte.
	await field.focus();
	await field.pressSequentially(saisie);
	// Négatif — et c'est lui qui attrape la régression : la VALEUR soumise n'est plus
	// réécrite sous l'enfant. C'est exactement ce que réintroduirait un futur forçage JS
	// de la casse (le défaut corrigé par la relecture a11y #717 : ça casse les claviers à
	// composition, prédiction/correction automatique, sur les tablettes ciblées).
	expect(await field.inputValue()).toBe(saisie);
	// Le rendu VISUEL, lui, reste en majuscules — l'exigence pédagogique n'a pas bougé :
	// l'enfant voit la forme conventionnelle se former sous ses doigts. Sans capture
	// d'écran/OCR, le seul canal observable ici est le style calculé qui porte cette
	// transformation. Assertion consciente de figer le MÉCANISME actuel (CSS
	// `text-transform`, cf. sheets.scss) plutôt que la seule exigence : si un jour ce
	// mécanisme change pour un autre moyen de montrer la majuscule à l'écran, cette
	// ligne devra changer avec lui — contrairement à celle du dessus (valeur non
	// réécrite), qui doit rester vraie quel que soit ce moyen.
	const transform = await field.evaluate((el) => getComputedStyle(el).textTransform);
	expect(transform).toBe('uppercase');
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

test('la validation annonce le verdict (région vivante) et pose aria-invalid sur les champs corrigés (relecture a11y #717)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-chiffres-romains');
	const fields = page.locator('.ans-romain');
	await fields.first().waitFor();
	// Au moins une bonne (data-answer) et une fausse (« IIII », toujours fausse quel que
	// soit l'item — même raisonnement que le test « critère 5 » juste au-dessus) : sans
	// ça, l'annonce se réduirait au cas homogène (tout juste OU tout faux), qui ne dirait
	// rien sur les DEUX valeurs possibles d'aria-invalid.
	const bonneReponse = fields.first();
	const answer = await bonneReponse.getAttribute('data-answer');
	expect(answer).toMatch(/^[IVXLCDM]+$/);
	await bonneReponse.fill(answer ?? '');
	const mauvaiseReponse = fields.nth(1);
	await mauvaiseReponse.fill('IIII');
	// Champs restants volontairement laissés vides (non répondu ≠ faux, cf. critère 5).
	await page.locator('#btnVerify').click();
	const correctCount = await page.locator('.mark.correct').count();
	const wrongCount = await page.locator('.mark.wrong').count();
	expect(correctCount).toBeGreaterThanOrEqual(1);
	expect(wrongCount).toBeGreaterThanOrEqual(1);
	const total = correctCount + wrongCount;
	// La région existe, elle est bien un statut (pas une alerte, cf. commentaire de
	// `annoncerVerdict` dans ui/session.ts), et se REMPLIT au tour suivant (elle est créée
	// vide) : `expect(...).toHaveText` interroge à nouveau tant que ça ne matche pas, ce
	// qui tient compte de ce délai sans `waitForTimeout` figé.
	const region = page.locator('#verdictAnnonce');
	await expect(region).toHaveAttribute('role', 'status');
	// Les deux comptes (bonnes réponses / total répondu) se retrouvent dans l'annonce —
	// pas la phrase entière : c'est le DÉCOMPTE qui est l'exigence, pas son habillage.
	await expect(region).toHaveText(new RegExp(`\\b${correctCount}\\b[\\s\\S]*\\b${total}\\b`));
	await expect(bonneReponse).toHaveAttribute('aria-invalid', 'false');
	await expect(mauvaiseReponse).toHaveAttribute('aria-invalid', 'true');
	// Un champ resté vide n'est ni juste ni faux : rien à annoncer dessus non plus.
	expect(await fields.nth(2).getAttribute('aria-invalid')).toBeNull();
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
