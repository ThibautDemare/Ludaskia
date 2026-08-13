/* ============================================================
   Révision espacée — entretien du niveau inférieur (#232). Un profil passé
   en CM1 continue de se voir reproposer, en dose plafonnée, ses notions CE2
   encore en cours de consolidation (état SR stocké sous `lessonId@ce2`).
   Deux points couverts :
     - côté ENFANT : la séance propose bien l'élément CE2 dû, l'exercice est
       jouable, AUCUNE étiquette de niveau ne fuite dans le rendu, et
       répondre fait avancer la clé `…@ce2` (jamais une clé `…@cm1` fantôme,
       qui resterait due à jamais — le vrai piège de l'implémentation) ;
     - côté ENCADRANT (onglet Suivi) : le récap de révision affiche cette
       entrée avec son niveau d'origine (« CE2 »), à l'inverse.
   Leçon choisie : `num-comparer` (« Je compare les nombres »), déjà utilisée
   par revision.spec.ts pour son interaction en tuiles — verdict déterministe
   (on déduit le bon signe des deux nombres de l'énoncé), sans dépendre d'un
   tirage QCM aléatoire.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const UUID = 'e2e-revision-inf';
const LABEL = 'Je compare les nombres'; // num-comparer

/* Profil de test calé en CM1 (toutes matières, donc math), avec UNE entrée SR
   `num-comparer@ce2` déjà due (échéance très ancienne). Aucune entrée au niveau
   actif : la séance n'a donc QUE cet élément d'entretien à proposer — la plus
   simple façon d'isoler son comportement sans qu'il n'ait à concourir avec
   d'autres éléments dus. */
const SEED =
	`localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${UUID}', name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: '${UUID}' }));` +
	`localStorage.setItem('${UUID}/ludaskia_lessonRevision', JSON.stringify({ 'num-comparer@ce2': { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: null } }));` +
	seedAideVueScript(UUID);

test('Révision : un profil CM1 entretient une notion CE2 due, sans étiquette de niveau visible (#232)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED);
	await gotoHash(page, 'revision-espacee');

	// L'élément CE2 est bien proposé (consigne + widget en tuiles, comme au niveau actif).
	await expect(page.locator('.rev-consigne')).toContainText('compare');
	await expect(page.locator('#ltuiSlot')).toBeVisible();

	// Aucune étiquette de niveau ne fuite côté enfant (décision produit) : ni dans la
	// consigne, ni dans le HUD (catégorie/progression), ni ailleurs dans la scène.
	await expect(page.locator('.revision')).not.toContainText('CE2');
	await expect(page.locator('.revision')).not.toContainText('CM1');

	// Déduit le bon signe des deux nombres de l'énoncé, pose la tuile, valide.
	const enonce = await page.locator('.ltui-enonce').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]);
	const b = Number(m![2]);
	const signe = a < b ? '<' : a > b ? '>' : '=';
	await page.locator('.ltui-tuile', { hasText: signe }).first().click();
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();

	// La clé `num-comparer@ce2` a avancé (palier/échéance/dernier test mis à jour) ; AUCUNE
	// clé `num-comparer@cm1` n'a été créée — c'était le vrai piège : générer au niveau
	// inférieur mais réécrire l'état sur le niveau actif aurait laissé l'entrée CE2 due
	// à jamais.
	const raw = await page.evaluate(
		(uuid) => JSON.parse(localStorage.getItem(`${uuid}/ludaskia_lessonRevision`) || '{}'),
		UUID,
	);
	expect(raw['num-comparer@ce2']).toBeTruthy();
	expect(raw['num-comparer@ce2'].palier).toBe(3); // réussi : un cran de plus (palier 2 → 3)
	expect(raw['num-comparer@ce2'].dernierTest).not.toBeNull();
	expect(raw['num-comparer@cm1']).toBeUndefined();

	expect(errors).toEqual([]);
});

test('Espace encadrant : le récap de révision affiche l’entretien CE2 avec son niveau d’origine (#232)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	await expect(section).toBeVisible();

	// Vue « Par urgence » (liste à plat, toujours visible) : la vue par défaut « Par
	// catégorie » range l'entrée dans un <details> replié (cf. encadrant-revision.spec.ts).
	await section.locator('[data-act="revision-mode"][data-mode="urgence"]').click();

	// L'entrée CE2 apparaît avec son badge de niveau d'origine, alors qu'un enfant en
	// CE2 pur ne le voit jamais (cf. test précédent). En vue « Par urgence », l'entrée
	// porte DEUX pastilles `.enc-rev-cat` (niveau d'origine, rendu en premier, PUIS
	// catégorie rappelée sur la ligne) : on cible la première.
	const item = section.locator('.enc-rev-item').filter({ hasText: LABEL });
	await expect(item).toBeVisible();
	await expect(item.locator('.enc-rev-cat').first()).toContainText('CE2');

	expect(errors).toEqual([]);
});
