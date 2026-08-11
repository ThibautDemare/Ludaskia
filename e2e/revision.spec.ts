/* ============================================================
   Mode Révision (#45) sur mobile (#186) : les exercices à interaction
   « tuiles » (comparaison de nombres, ordre alphabétique) se rejouent
   AVEC leurs tuiles, sans clavier — et la consigne de la leçon s'affiche.
   On amorce un élément « dû » en localStorage (méta-profil à UUID fixe +
   état de révision échu) puis on ouvre la révision espacée.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const UUID = 'e2e-revision';

/* Amorce un profil de test et rend UNE leçon « due » dès maintenant. La clé de
   révision est préfixée par le profil actif (uuid + '/'), d'où l'amorçage conjoint
   de la méta-profil avec un UUID connu.

   L'aide contextuelle du geste est marquée « déjà vue » : la révision monte désormais
   la même aide que les runners de leçon, et sa bulle de 1er lancement recouvrirait le
   widget (l'overlay intercepte les clics). Ces tests exercent les MÉCANIQUES ; l'aide
   en révision a ses propres tests (aide-exercice.spec.ts). */
function seedDueLesson(lessonId: string): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: UUID,
			}),
		)});
    localStorage.setItem('${UUID}/ludaskia_lessonRevision', JSON.stringify({
      ${JSON.stringify(lessonId)}: { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(UUID)}
  `;
}

test('Révision : la comparaison se joue en tuiles (pas de clavier) + consigne', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('num-comparer'));
	await gotoHash(page, 'revision-espacee');

	// La consigne (libellé de la leçon) est affichée, et l'exercice est en tuiles.
	await expect(page.locator('.rev-consigne')).toContainText('compare');
	await expect(page.locator('#ltuiSlot')).toBeVisible();
	for (const signe of ['<', '=', '>']) {
		await expect(page.locator('.ltui-tuile', { hasText: signe })).toBeVisible();
	}

	// On déduit le bon signe des deux nombres de l'énoncé, on pose la tuile, on valide.
	const enonce = await page.locator('.ltui-enonce').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]);
	const b = Number(m![2]);
	const signe = a < b ? '<' : a > b ? '>' : '=';
	await page.locator('.ltui-tuile', { hasText: signe }).first().click();
	await expect(page.locator('#ltuiSlot')).toHaveText(signe);
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible(); // « ✓ Bravo ! »
	expect(errors).toEqual([]);
});

test('Révision : la touche Entrée valide puis enchaîne sur la suite', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('num-valeur-position'));
	await gotoHash(page, 'revision-espacee');

	// Question à saisie : on remplit puis on valide à la touche Entrée (pas de clic).
	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	await input.fill('0'); // peu importe la justesse : on teste l'enchaînement clavier
	await input.press('Enter');

	// Le verdict s'affiche, avec le bouton « Terminer » (un seul élément dû).
	await expect(page.locator('.rev-feedback')).toBeVisible();
	await expect(page.locator('#revNext')).toBeVisible();

	// Entrée enchaîne sur l'écran de fin sans cliquer le bouton.
	await page.locator('#revNext').press('Enter');
	await expect(page.locator('.rev-done')).toContainText('terminée');
	expect(errors).toEqual([]);
});

test('Révision : un QCM à consigne renforcée affiche la consigne + le picto (#265)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-vocab-contraires'));
	await gotoHash(page, 'revision-espacee');

	// Le libellé de la leçon reste affiché (contexte)…
	await expect(page.locator('.rev-consigne')).toContainText('Les contraires');
	// …ET la consigne d'ACTION renforcée + son picto sont propagés (#265) : avant,
	// l'enfant ne voyait que le libellé, jamais l'instruction « quoi faire ».
	await expect(page.locator('.lqcm-consigne')).toContainText('Quel mot veut dire le contraire');
	await expect(page.locator('.lqcm-picto')).toHaveText('↔');

	// L'exercice reste jouable : on choisit une option, le verdict s'affiche.
	await page.locator('.rev-choice').first().click();
	await expect(page.locator('.rev-feedback')).toBeVisible();
	expect(errors).toEqual([]);
});

test("Révision : une opération posée affiche sa consigne d'action (#265)", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('calc-addition-posee'));
	await gotoHash(page, 'revision-espacee');

	// La grille posée n'a aucun énoncé : avant, l'enfant ne voyait que le libellé de
	// leçon. La consigne d'ACTION est désormais propagée jusqu'en révision (#265).
	await expect(page.locator('.lqcm-consigne')).toContainText("Pose l'addition");
	await expect(page.locator('.rev-posee')).toBeVisible();
	await expect(page.locator('.posee-input').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test("Révision : l'ordre alphabétique se joue en tuiles-mots", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-vocab-alpha-initiale'));
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('.lord-seq')).toBeVisible();
	const bac = page.locator('#lordBac .lord-tuile');
	const n = await bac.count();
	expect(n).toBeGreaterThanOrEqual(4);

	// Lit les mots, les range dans l'ordre alphabétique (français), puis valide.
	const mots: string[] = [];
	for (let i = 0; i < n; i++) mots.push((await bac.nth(i).innerText()).trim());
	const ordre = [...mots].sort((x, y) => x.localeCompare(y, 'fr'));
	for (const mot of ordre) {
		await page
			.locator('#lordBac .lord-tuile:not(.tuile-used)', { hasText: new RegExp(`^${mot}$`) })
			.first()
			.click();
	}
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();
	// #345 : le widget figé reste visible avec ses marques ✓/✗ (la révision les
	// affiche désormais, comme les runners de leçon — correction de la divergence).
	expect(await page.locator('.lord-cell.correct').count()).toBe(ordre.length);
	expect(errors).toEqual([]);
});

/* #345 — Correction de la divergence : « ranger par thème » montre les marques ✓/✗
   en révision (avant, seul le runner de leçon les produisait). */
test('Révision : « ranger par thème » montre les marques ✓/✗ (#345)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-vocab-champs-tri'));
	await gotoHash(page, 'revision-espacee');

	await page.locator('.ltri-tuile').first().waitFor();
	// On range TOUT dans le 1er thème → résultat déterministe : 3 corrects, 3 faux.
	while ((await page.locator('.ltri-tuile').count()) > 0) {
		await page.locator('.ltri-tuile').first().click();
		await page.locator('.ltri-col').first().locator('.ltri-col-titre').click();
	}
	await page.locator('#revValidate').click();

	// Les marques apparaissent EN RÉVISION, et le verdict s'affiche sous le widget figé.
	expect(await page.locator('.ltri-posee.correct').count()).toBe(3);
	expect(await page.locator('.ltri-posee.wrong').count()).toBe(3);
	await expect(page.locator('.rev-feedback')).toBeVisible();
	await expect(page.locator('#revNext')).toBeVisible();
	expect(errors).toEqual([]);
});

/* #471 — Entrée sur le titre-colonne (role="button", pas un vrai <button>) pour
   poser la DERNIÈRE tuile réactivait #revValidate de façon synchrone (onState),
   puis la même touche remontait à `bindEnter` (#revStage) qui la détournait vers
   Valider : la réponse était validée sans que l'enfant ait pu la relire. Le
   correctif ignore désormais aussi `[role="button"]` dans cette garde. */
test('Révision : Entrée sur le titre de colonne ne valide pas prématurément (#471)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-vocab-champs-tri'));
	await gotoHash(page, 'revision-espacee');

	await page.locator('.ltri-tuile').first().waitFor();
	const total = await page.locator('.ltri-tuile').count();
	expect(total).toBeGreaterThanOrEqual(2);

	const titre = page.locator('.ltri-col-titre').first();
	await expect(titre).toHaveAttribute('role', 'button'); // le chemin visé par le bug

	// Entrée sur le titre SANS mot choisi ne dépose rien et ne déclenche AUCUNE
	// validation (relecture a11y de #471) : l'annonce invite à choisir un mot d'abord.
	await titre.focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('#ltriStatus')).toHaveText("Choisis d'abord un mot, puis son thème.");
	await expect(page.locator('.ltri-posee')).toHaveCount(0);
	await expect(page.locator('.rev-feedback')).toHaveCount(0);
	await expect(page.locator('#revNext')).toHaveCount(0);

	// Range toutes les tuiles SAUF la dernière, au clavier : Entrée sur la tuile du
	// bac (bouton natif) la sélectionne, puis Entrée sur le titre-colonne la dépose.
	for (let i = 0; i < total - 1; i++) {
		await page.locator('.ltri-tuile').first().focus();
		await page.keyboard.press('Enter');
		await titre.focus();
		await page.keyboard.press('Enter');
	}
	expect(await page.locator('.ltri-tuile').count()).toBe(1);
	await expect(page.locator('#revValidate')).toBeDisabled();

	// Pose la DERNIÈRE tuile, toujours au clavier, en terminant sur le titre-colonne :
	// c'est exactement le geste qui validait prématurément avant le correctif.
	await page.locator('.ltri-tuile').first().focus();
	await page.keyboard.press('Enter');
	await titre.focus();
	await page.keyboard.press('Enter');

	// Aucune validation n'a eu lieu : pas de verdict, pas de bouton « Continuer »,
	// le widget n'est pas figé (aucune marque ✓/✗) — et Valider est bien activé.
	await expect(page.locator('.rev-feedback')).toHaveCount(0);
	await expect(page.locator('#revNext')).toHaveCount(0);
	await expect(page.locator('.ltri-posee.correct, .ltri-posee.wrong')).toHaveCount(0);
	await expect(page.locator('.ltri-posee')).toHaveCount(total);
	await expect(page.locator('#revValidate')).toBeEnabled();

	// Un clic explicite sur Valider (le vrai geste attendu) valide normalement.
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback')).toBeVisible();
	await expect(page.locator('#revNext')).toBeVisible();

	// Garde-fou : le raccourci clavier reste opérant sur un VRAI <button> (#revNext).
	await page.locator('#revNext').press('Enter');
	await expect(page.locator('.rev-done')).toContainText('terminée');

	expect(errors).toEqual([]);
});

/* #264 — Le chemin QCM de la révision enrichit désormais l'énoncé (gras + fractions
   empilées) ET les boutons-réponses, comme les runners leçon et sprint. */
test('Révision QCM : fractions empilées dans l’énoncé ET les choix (#264)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('num-frac-addition'));
	await gotoHash(page, 'revision-espacee');

	// L'énoncé QCM tiré (ex. « Combien font 1/4 + 1/4 ? ») est rendu en fractions
	// empilées (barre horizontale `.frac`), pas en oblique « 1/4 ».
	const enonce = page.locator('.rev-q-qcm');
	await expect(enonce).toBeVisible();
	await expect(enonce.locator('.frac').first()).toBeVisible();
	await expect(enonce).not.toContainText('/');

	// Les boutons-réponses affichent aussi les fractions empilées (pas de « 1/4 » oblique).
	const choices = page.locator('.rev-choices');
	await expect(choices.locator('.rev-choice .frac').first()).toBeVisible();
	await expect(choices).not.toContainText('/');

	expect(errors).toEqual([]);
});

test('Révision QCM : mot-cible des « contraires » en gras, sans astérisques (#264)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-vocab-contraires'));
	await gotoHash(page, 'revision-espacee');

	// Le mot-cible (tiré au hasard ; chaque phrase de la banque le met en **gras**)
	// est rendu en <strong>, sans laisser fuiter les marqueurs « ** » dans le texte.
	const enonce = page.locator('.rev-q-qcm');
	await expect(enonce).toBeVisible();
	await expect(enonce.locator('strong')).toBeVisible();
	await expect(enonce).not.toContainText('**');

	expect(errors).toEqual([]);
});

/* #466 — Trois moteurs « riches » (appariement, problème, clique-sur-le-mot) étaient
   dégradés en simple champ texte quand ils remontaient en révision ; ils montent
   désormais leur VRAI widget interactif, comme les tuiles/ordre/tri (#186/#345). */
test('Révision : l’appariement se joue avec le vrai widget de liaison (#466)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-vocab-familles-relier'));
	await gotoHash(page, 'revision-espacee');

	// Garde-fou anti-régression : plus de repli champ texte pour ce moteur.
	await expect(page.locator('#revInput')).toHaveCount(0);
	await expect(page.locator('.lapp-board')).toBeVisible();
	const mots = page.locator('.lapp-mot');
	expect(await mots.count()).toBeGreaterThan(0);

	// Le bouton Valider ne s'active qu'une fois TOUS les mots de gauche reliés (comme
	// les tuiles/ordre/tri) : on relie chaque mot de gauche à un mot de droite, sans
	// se soucier de la justesse (peu importe : seul l'état « complet » est testé ici).
	const validate = page.locator('#revValidate');
	const gauche = page.locator('.lapp-mot--g');
	const droite = page.locator('.lapp-mot--d');
	const n = await gauche.count();
	await expect(validate).toBeDisabled();
	for (let i = 0; i < n; i++) {
		await gauche.nth(i).click();
		await droite.nth(i).click();
	}
	await expect(validate).toBeEnabled();

	// L'interaction reste jouable : Valider fige le widget et affiche un verdict.
	await validate.click();
	await expect(page.locator('.rev-feedback')).toBeVisible();

	expect(errors).toEqual([]);
});

test('Révision : le problème à deux étapes garde ses sous-questions et son brouillon (#466)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('math-prob-deux-etapes'));
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('.prob-enonce')).toBeVisible();
	const inputs = page.locator('.prob-input');
	const n = await inputs.count();
	expect(n).toBeGreaterThanOrEqual(2);
	await expect(page.locator('.brouillon-toggle')).toBeVisible();

	// Répond juste à chaque étape via `data-answer`, puis valide : verdict + marques ✓.
	for (let i = 0; i < n; i++) {
		const answer = await inputs.nth(i).getAttribute('data-answer');
		expect(answer).not.toBeNull();
		await inputs.nth(i).fill(answer!);
	}
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();
	expect(await page.locator('.prob-mark.correct').count()).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

test('Révision : « clique sur le verbe » monte le vrai widget de sélection (#466)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-gram-clic-verbe'));
	await gotoHash(page, 'revision-espacee');

	// Garde-fou anti-régression : plus de repli champ texte pour ce moteur.
	await expect(page.locator('#revInput')).toHaveCount(0);
	await expect(page.locator('.lclic-consigne')).toBeVisible(); // consigne d'ACTION
	await expect(page.locator('.lclic-phrase')).toBeVisible();
	const mots = page.locator('.lclic-mot');
	expect(await mots.count()).toBeGreaterThan(0);

	// Sélectionne un mot (au hasard, sans viser la cible) puis valide.
	await mots.first().click();
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback')).toBeVisible();
	await expect(page.locator('#revNext')).toBeVisible();
	// Le widget marque les mots après validation (correct / wrong / cible révélée).
	expect(
		await page.locator('.lclic-mot.correct, .lclic-mot.wrong, .lclic-mot.is-cible').count(),
	).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});
