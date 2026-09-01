/* ============================================================
   Smoke e2e — Annonce partagée de la correction (#505).

   `wireNext` (ui/lecon-runner-shared.ts) pose désormais lui-même le résumé du
   verdict dans la bonne région live de l'écran (`annoncerStatut`,
   ui/revelation-neutre.ts) : celle du WIDGET si la carte en monte une, sinon la
   région FIXE rendue par l'écran (`#lqcmStatus`, `#ltuiStatus`…). Le `div`
   `.sprint-correction` où atterrit le pavé de feedback n'est PAS une région
   live : sans cette annonce, le focus part sur « Continuer ▶ » — qui ne dit
   que « Continuer » — et un enfant au lecteur d'écran ne sait pas ce que la
   question est devenue.

   Cette spec est transversale à plusieurs runners (pas la spec d'une leçon) :
   elle garde la garantie que `wireNext` apporte, pas le contenu pédagogique
   d'une leçon précise.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Ferme l'overlay d'aide contextuelle s'il est présent : `seedAideVue` ne connaît
   pas toutes les clés (la droite graduée n'y figure pas, cf. helpers.ts). */
async function fermerAideSiPresente(page: import('@playwright/test').Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) await page.locator('.aide-ok').click();
}

/* --------------------------------------------------------------------------
   Critère 6 (+ 8) — QCM simple : le runner le plus fréquenté n'avait AUCUNE
   région live avant #505, et son résumé n'est pas le pavé HTML affiché.
   -------------------------------------------------------------------------- */
test('QCM (#lqcmStatus) : la correction est annoncée en résumé, pas en HTML brut (critères 6, 8)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Mono-mode, avec justification pédagogique (#lqcm-expl) : le pavé de feedback
	// est donc nettement plus long qu'un simple résumé, dans les deux branches
	// (juste/faux) — la seule façon d'éprouver honnêtement le critère 8.
	await gotoHash(page, 'lecon-fr-homophones-a');
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();

	const status = page.locator('#lqcmStatus');
	await expect(status).toHaveAttribute('role', 'status');
	expect(await status.textContent()).toBe(''); // vide AVANT la validation

	await choices.first().click();
	const bouton = page.locator('#lqcmActions button');
	await bouton.waitFor(); // la correction a eu lieu (wireNext a tourné)

	const resume = (await status.textContent()) ?? '';
	expect(resume.trim()).not.toBe(''); // (critère 6) non vide APRÈS la correction
	expect(await status.innerHTML()).not.toContain('<'); // (critère 8) pas de balise

	const pave = ((await page.locator('#lqcmFeedback').innerText()) ?? '').trim();
	expect(pave.length).toBeGreaterThan(resume.length); // (critère 8) résumé << pavé

	// Focus sur « Continuer ▶ » après la validation (critère 9, éprouvé ici pour
	// l'économie d'une navigation : le comportement est le même sur tous les runners).
	await expect(bouton).toBeFocused();

	expect(errors).toEqual([]);
});

/* --------------------------------------------------------------------------
   Critère 6 — tuiles : 2e runner muet avant #505.
   -------------------------------------------------------------------------- */
test('tuiles (#ltuiStatus) : la correction du mode tuiles est annoncée (critère 6)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page); // le mode tuiles déclenche l'aide contextuelle au 1er lancement
	await gotoHash(page, 'mode-num-comparer');
	await page.locator('.mode-btn[data-mode="tuiles"]').click();
	await page.locator('#ltuiSlot').waitFor();

	const status = page.locator('#ltuiStatus');
	await expect(status).toHaveAttribute('role', 'status');
	expect(await status.textContent()).toBe(''); // vide AVANT la validation

	await page.locator('.ltui-tuile').first().click();
	await page.locator('#ltuiVerif').click();
	await page.locator('#ltuiSlot.correct, #ltuiSlot.wrong').first().waitFor();

	expect(((await status.textContent()) ?? '').trim()).not.toBe('');
	expect(errors).toEqual([]);
});

/* --------------------------------------------------------------------------
   Critère 7 — clic-mot : le widget annonce déjà dans SA région (#lclicStatus,
   `bindClicMot.verify()`) ; `wireNext` reçoit `resume: ''` et doit se taire,
   pas écraser ce message par un doublon générique.
   -------------------------------------------------------------------------- */
test('clic-mot (#lclicStatus) : le widget annonce déjà, une seule région vive non vide après correction (critère 7)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page); // couvre la clé 'clicMot'
	await gotoHash(page, 'lecon-fr-gram-clic-verbe');
	const mots = page.locator('.lclic-mot');
	await mots.first().waitFor();
	const n = await mots.count();
	for (let i = 0; i < n; i++) await mots.nth(i).click();
	await page.locator('#lclicVerif').click();
	await page.locator('#lclicActions button').waitFor(); // correction faite

	const regions = page.locator('.sprint-stage [role="status"]');
	const textes = await regions.allTextContents();
	const nonVides = textes.filter((t) => t.trim() !== '');
	expect(nonVides).toHaveLength(1); // pas deux régions qui disent la même chose

	const status = page.locator('#lclicStatus');
	expect(((await status.textContent()) ?? '').trim()).not.toBe('');
	expect(errors).toEqual([]);
});

/* --------------------------------------------------------------------------
   Critère 9 — ordre et droite graduée annonçaient déjà À LA MAIN avant #505 ;
   ils passent maintenant par `wireNext`/`annoncerStatut` sans perdre leur
   annonce.
   -------------------------------------------------------------------------- */
test('ordre (#lordStatus) : l’annonce déjà en place survit au passage par wireNext (critère 9)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page); // couvre 'ordre'/'ordreNombres'
	await gotoHash(page, 'lecon-num-ranger');
	const tuiles = page.locator('.lord-tuile');
	await tuiles.first().waitFor();

	const status = page.locator('#lordStatus');
	expect(await status.textContent()).toBe(''); // vide AVANT la validation

	// Pose chaque tuile (peu importe l'ordre, juste ou faux : `resumeCorrection`
	// renvoie un texte non vide dans les deux cas).
	const valeurs = await tuiles.evaluateAll((els) => els.map((e) => e.getAttribute('data-val')));
	for (const val of valeurs) await page.locator(`.lord-tuile[data-val="${val}"]`).click();
	await page.locator('#lordVerif').click();
	await page.locator('#lordActions button').waitFor();

	expect(((await status.textContent()) ?? '').trim()).not.toBe('');
	expect(errors).toEqual([]);
});

test('droite graduée (#dgStatus) : l’annonce déjà en place survit au passage par wireNext (critère 9)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-droite-entiers');
	await fermerAideSiPresente(page);
	await page.locator('.dg-interactif').waitFor();

	const status = page.locator('#dgStatus');
	expect(await status.textContent()).toBe(''); // vide AVANT la validation

	await page.locator('.dg-hit').first().click();
	await page.locator('#dgVerify').click();
	await page.locator('#dgActions button').waitFor();

	expect(((await status.textContent()) ?? '').trim()).not.toBe('');
	expect(errors).toEqual([]);
});

/* --------------------------------------------------------------------------
   Critère 6 — QCM MULTI-SÉLECTION. Comme les tuiles, il déclarait `#lqmStatus`
   sans que rien ne l'écrive au verdict : les cases marquées portent bien un
   `sr-only` par proposition, mais il faut les PARCOURIR pour les entendre — or
   le focus part sur « Continuer ▶ ». Aucune spec du dépôt ne couvrait ce runner.
   -------------------------------------------------------------------------- */
const SEED_CM1 = `(() => {
  localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e-505', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e-505' }));
  localStorage.setItem('e2e-505/ludaskia_tour_seen', 'true');
  localStorage.setItem('e2e-505/ludaskia_parents_seen', 'true');
})();`;

test('QCM multiple (#lqmStatus) : la correction est annoncée, avec les bonnes propriétés (critère 6)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	await seedAideVue(page);
	await gotoHash(page, 'mode-geo-cm1-figures-proprietes');
	await page.locator('.mode-btn[data-mode="coche"]').click();
	await fermerAideSiPresente(page);

	const choix = page.locator('.lqcm-multi-choice');
	await choix.first().waitFor();

	const status = page.locator('#lqmStatus');
	await expect(status).toHaveAttribute('role', 'status');
	expect(await status.textContent()).toBe(''); // vide AVANT la validation

	// Tout cocher : le pool ne contient jamais plus de 3 propositions vraies sur 4,
	// donc au moins une cochée est fausse → verdict tout-ou-rien négatif garanti.
	const n = await choix.count();
	for (let i = 0; i < n; i++) await choix.nth(i).click();
	await page.locator('#lqmValider').click();
	await page.locator('#lqmActions button').waitFor();

	const resume = ((await status.textContent()) ?? '').trim();
	expect(resume).not.toBe('');
	// Le résumé ÉNUMÈRE la réponse, il ne se contente pas de dire « c'est faux » :
	// sans les bonnes propriétés, l'enfant n'apprend rien de sa correction.
	expect(resume).toContain('Les bonnes propriétés');
	expect(await status.innerHTML()).not.toContain('<');

	expect(errors).toEqual([]);
});

/* --------------------------------------------------------------------------
   Critère 6 — TABLEAU DE CONVERSION, et la séparation des deux régions.
   `#tcStatus` porte l'écho de SAISIE au pavé (« chiffre des mètres : 3 »),
   `#tcVerdict` porte le verdict. Les fusionner ferait se marcher dessus deux
   responsabilités aux rythmes opposés — l'écho parle à chaque frappe, le
   verdict une fois à la fin (règle déjà écrite dans docs/architecture/ui.md).
   -------------------------------------------------------------------------- */
test('tableau (#tcVerdict) : le verdict a sa propre région, distincte de l’écho de saisie (critère 6)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await fermerAideSiPresente(page);
	await page.locator('#tcTable').waitFor();

	const verdict = page.locator('#tcVerdict');
	const echo = page.locator('#tcStatus');
	await expect(verdict).toHaveAttribute('role', 'status');
	expect(await verdict.textContent()).toBe(''); // vide AVANT la validation

	// 1re case fausse, le reste juste → verdict négatif, et l'écho a parlé entretemps.
	const n = await page.locator('.tc-cell').count();
	for (let i = 0; i < n; i++) {
		const bon = await page.locator(`.tc-cell[data-i="${i}"]`).getAttribute('data-answer');
		const chiffre = i === 0 ? String((Number(bon) + 1) % 10) : (bon ?? '0');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
	}
	const dernierEcho = ((await echo.textContent()) ?? '').trim();
	await page.locator('#tcVerif').click();
	await page.locator('#tcActions button').waitFor();

	const resume = ((await verdict.textContent()) ?? '').trim();
	expect(resume).not.toBe('');
	// LE test de la séparation : refusionner les deux régions le ferait rougir.
	expect(resume).not.toBe(dernierEcho);
	expect(errors).toEqual([]);
});

/* --------------------------------------------------------------------------
   Régression trouvée en relecture — une FRACTION annoncée en valeur brute.
   `q.item.answer` vaut « 3/4 » ; poser cette valeur telle quelle dans la région
   live la fait prononcer « trois slash quatre », exactement ce que l'aria-label
   de `fractionInlineHTML` a été construit pour éviter côté visuel. Le résumé
   passe donc par `libelleChoix`, qui rend « trois quarts » via `choicesView`.
   `num-frac-sens` est le bon terrain : QCM pur, réponse fraction, et
   `choicesView` fournis par `fractionChoiceViews` (sans eux, `libelleChoix`
   retomberait sur la valeur brute et ce test ne garderait rien).
   -------------------------------------------------------------------------- */
test('QCM fraction (#lqcmStatus) : la réponse est annoncée en toutes lettres, jamais « 3/4 »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-frac-sens');
	await fermerAideSiPresente(page);
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();

	const status = page.locator('#lqcmStatus');
	expect(await status.textContent()).toBe('');

	// N'importe quel choix : juste ou faux, le résumé ne doit JAMAIS contenir de barre
	// de fraction. Sur une erreur il cite la réponse (« trois quarts ») ; sur une
	// réussite il n'en cite aucune — les deux branches satisfont l'assertion, et c'est
	// voulu : le test garde l'absence du défaut, pas le tirage aléatoire.
	await choices.first().click();
	await page.locator('#lqcmActions button').waitFor();

	const resume = ((await status.textContent()) ?? '').trim();
	expect(resume).not.toBe('');
	expect(resume).not.toContain('/');
	expect(errors).toEqual([]);
});
