/* ============================================================
   Anti-suggestion clavier « mot de passe visible » (#139).
   Les champs de réponse texte (conjugaison, dictée, sprint, révision) sont rendus
   en `type="password"` — seul moyen fiable de couper la barre de suggestions des
   claviers mobiles, qui « souffle » sinon la réponse — puis démasqués en
   `type="text"` AVANT focus (Android les traite alors en textVisiblePassword :
   texte lisible SANS suggestions). On vérifie le résultat observable : le champ
   finit en `type="text"` (donc lisible, plus de points) tout en gardant son
   marqueur `data-unmask`. La correction reste fonctionnelle.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('conjugaison : le champ de réponse texte est démasqué (type=text), pas en points', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-conj-etre-present'); // leçon de conjugaison → champ texte
	const field = page.locator('.ans-text').first();
	await field.waitFor();
	// Né `type="password"` (anti-suggestion), il doit être démasqué à l'affichage.
	await expect(field).toHaveAttribute('type', 'text');
	await expect(field).toHaveAttribute('data-unmask', '');
	// La saisie et la correction restent fonctionnelles sur un champ démasqué.
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});
