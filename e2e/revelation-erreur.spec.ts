/* ============================================================
   #503 — Après une erreur, l'enfant doit pouvoir comparer ce qu'il a donné
   avec ce qui était attendu : la QUESTION reste lisible, sa RÉPONSE est
   rappelée (révision), chaque réponse est INTRODUITE par un mot, et le rouge
   colore la réponse donnée seule (jamais la question ni le texte du message).

   Critères couverts (numérotation de l'issue) :
   1 question lisible après erreur (révision : saisie, QCM, posée)
   2 réponse donnée affichée telle que saisie / choisie
   3 chaque réponse est introduite par un mot
   4 réponse donnée en --ko, jamais barrée
   5 annonce #revStatus : réponse donnée puis bonne réponse
   6 « Je ne sais pas » : question lisible, AUCUN .rev-donnee
   7 le rouge ne colore ni la question ni le texte du message
   12 (négatif) une saisie `<b>x</b>` reste du texte littéral
   14 (négatif) la réponse donnée n'est jamais barrée (révision et sprint)

   Le contrat de sélecteurs (.rev-donnee, .rev-feedback.ko strong, #revStatus,
   .sprint-donnee, .sprint-q, .lqcm-ko) est celui convenu avec l'implémentation.
   La couleur est comparée au TOKEN résolu dans la page (six thèmes), jamais à
   un RGB écrit en dur.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const UUID = 'e2e-revelation';

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

/* Couleur calculée d'un token (--ko / --ok) dans la page, via un élément sonde. */
async function couleurToken(page: Page, token: string): Promise<string> {
	return page.evaluate((t) => {
		const s = document.createElement('span');
		s.style.color = `var(${t})`;
		document.body.appendChild(s);
		const c = getComputedStyle(s).color;
		s.remove();
		return c;
	}, token);
}

async function couleurDe(page: Page, selector: string): Promise<string> {
	return page
		.locator(selector)
		.first()
		.evaluate((el) => getComputedStyle(el).color);
}

/* Aucun trait barré sur l'élément ni sur son contenu fort. */
async function pasBarre(page: Page, selector: string): Promise<void> {
	const lignes = await page
		.locator(selector)
		.first()
		.evaluate((el) =>
			[el, ...Array.from(el.querySelectorAll('*'))].map(
				(n) => getComputedStyle(n).textDecorationLine,
			),
		);
	for (const l of lignes) expect(l).not.toContain('line-through');
}

/* Mots (4+ lettres) et nombres d'un texte : de quoi retrouver un énoncé sans figer sa mise en page. */
function jetons(texte: string): string[] {
	return texte.match(/\p{L}{4,}|\d+/gu) ?? [];
}

/* Nombres seuls : les opérandes d'une posée (la consigne en mots est remplacée par le verdict, pas l'opération). */
function nombres(texte: string): string[] {
	return texte.match(/\d+/g) ?? [];
}

function norm(s: string): string {
	return s.replace(/\s+/g, ' ').trim();
}

async function fermerEtayageSiOuvert(page: Page): Promise<void> {
	const panneau = page.locator('#etayageOverlay');
	if (await panneau.isVisible().catch(() => false)) {
		await page.locator('#etayageOverlay .aide-close').click();
		await expect(panneau).toHaveCount(0);
	}
}

/* Erreur en saisie (leçon num-valeur-position) : 999999 n'est jamais un chiffre de rang. */
async function ratageSaisie(page: Page, saisie = '999999'): Promise<string> {
	await page.addInitScript(seedDueLesson('num-valeur-position'));
	await gotoHash(page, 'revision-espacee');
	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	const avant = await page.locator('.rev-q').innerText();
	await input.fill(saisie);
	await input.press('Enter');
	await expect(page.locator('.rev-feedback.ko')).toBeVisible();
	return avant;
}

/* Erreur en QCM (num-frac-addition). Le bon choix n'est pas lisible dans le DOM : on clique le
   premier choix et, si c'était le bon, on recharge (l'amorçage remet l'élément « dû ») et on
   recommence. 10 essais à ≥ 2 chances sur 3 de rater chacun : l'échec du tirage est négligeable. */
async function ratageQcm(page: Page, leconId = 'fr-vocab-contraires'): Promise<string> {
	// Par défaut des choix en MOTS (texte affiché = texte annoncé) ; les fractions ont leur test.
	await page.addInitScript(seedDueLesson(leconId));
	await gotoHash(page, 'revision-espacee');
	for (let essai = 0; essai < 10; essai++) {
		const choix = page.locator('.rev-choice').first();
		await expect(choix).toBeVisible();
		const libelle = norm(await choix.innerText());
		await choix.click();
		const verdict = page.locator('.rev-feedback.ok, .rev-feedback.ko').first();
		await expect(verdict).toBeVisible();
		if (await page.locator('.rev-feedback.ko').count()) return libelle;
		await page.reload({ waitUntil: 'networkidle' });
	}
	throw new Error('QCM : 10 tirages consécutifs où le premier choix était juste');
}

/* Erreur sur opération posée : chaque cellule-résultat reçoit un chiffre ≠ data-answer. */
async function ratagePosee(page: Page): Promise<string[]> {
	await page.addInitScript(seedDueLesson('calc-addition-posee'));
	await gotoHash(page, 'revision-espacee');
	const cells = page.locator('.posee-input');
	await expect(cells.first()).toBeVisible();
	const avant = nombres(await page.locator('#revStage').innerText());
	expect(avant.length).toBeGreaterThan(1); // opérandes lisibles AVANT (sinon le test ne prouve rien)
	const n = await cells.count();
	for (let i = 0; i < n; i++) {
		const ans = Number((await cells.nth(i).getAttribute('data-answer')) ?? '0');
		await cells.nth(i).fill(String((ans + 1) % 10));
	}
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ko')).toBeVisible();
	return avant;
}

/* ---------------- Révision : erreur en saisie ---------------- */

test('Révision saisie : question gardée, réponse donnée rappelée avec son mot, annonce complète (critères 1, 2, 3, 5)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const avant = await ratageSaisie(page);

	// 1 — l'énoncé est encore dans la carte.
	await expect(page.locator('.rev-q')).toBeVisible();
	const apres = await page.locator('.rev-q').innerText();
	for (const j of jetons(avant)) expect(apres).toContain(j);

	// 2 — la réponse donnée est rappelée telle que saisie, en <strong>.
	const donnee = page.locator('.rev-donnee');
	await expect(donnee).toHaveCount(1);
	await expect(donnee.locator('strong')).toHaveText('999999');
	// 3 — introduite par un mot (la phrase « Tu as répondu X. » est le contrat, partagé avec le sprint).
	await expect(donnee).toHaveText('Tu as répondu 999999.');
	// .rev-donnee est HORS du verdict : .rev-feedback.ko strong reste LA bonne réponse, unique.
	await expect(page.locator('.rev-donnee.rev-feedback, .rev-feedback .rev-donnee')).toHaveCount(0);
	await expect(page.locator('.rev-feedback.ko strong')).toHaveCount(1);
	// 3 — la bonne réponse aussi est introduite par un mot (texte du verdict hors <strong>).
	const intro = await page.locator('.rev-feedback.ko').evaluate((el) => {
		const c = el.cloneNode(true) as HTMLElement;
		c.querySelectorAll('strong').forEach((s) => s.remove());
		return c.textContent ?? '';
	});
	expect(intro).toMatch(/\p{L}{3,}/u);

	// 5 — annonce : réponse donnée puis bonne réponse.
	const donneeAffichee = await donnee.locator('strong').innerText();
	const bonne = await page.locator('.rev-feedback.ko strong').innerText();
	await expect(page.locator('#revStatus')).toHaveText(
		`Ce n'est pas ça. Tu as répondu ${donneeAffichee}. La bonne réponse : ${bonne}.`,
	);
	expect(errors).toEqual([]);
});

test('Révision saisie : réponse donnée en rouge --ko, jamais barrée ; ni la question ni le message ne sont rouges (critères 4, 7, 14)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ratageSaisie(page);
	const ko = await couleurToken(page, '--ko');
	const ok = await couleurToken(page, '--ok');

	await expect(page.locator('.rev-donnee')).toHaveCount(1);
	expect(await couleurDe(page, '.rev-donnee strong')).toBe(ko);
	await pasBarre(page, '.rev-donnee');

	// 7 — le rouge ne teinte ni l'énoncé ni le texte du verdict ; la bonne réponse reste verte.
	expect(await couleurDe(page, '.rev-q')).not.toBe(ko);
	expect(await couleurDe(page, '.rev-feedback.ko')).not.toBe(ko);
	expect(await couleurDe(page, '.rev-feedback.ko strong')).toBe(ok);
	expect(errors).toEqual([]);
});

test('Révision saisie : `<b>x</b>` est rappelé comme texte littéral, sans élément b (critère 12)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ratageSaisie(page, '<b>x</b>');
	await expect(page.locator('.rev-donnee')).toHaveCount(1);
	await expect(page.locator('.rev-donnee strong')).toHaveText('<b>x</b>');
	await expect(page.locator('#revStage b')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ---------------- Révision : erreur en QCM ---------------- */

test('Révision QCM : question gardée, libellé du choix rappelé tel qu’à l’écran, annonce complète (critères 1, 2, 3, 5)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const libelle = await ratageQcm(page);

	// 1
	await expect(page.locator('.rev-q.rev-q-qcm')).toBeVisible();
	expect(norm(await page.locator('.rev-q.rev-q-qcm').innerText())).not.toBe('');
	// 2 + 3
	const donnee = page.locator('.rev-donnee');
	await expect(donnee).toHaveCount(1);
	await expect(donnee).toHaveText(/^Tu as répondu/);
	expect(norm(await donnee.locator('strong').innerText())).toBe(libelle);
	// 5
	const donneeAffichee = norm(await donnee.locator('strong').innerText());
	const bonne = norm(await page.locator('.rev-feedback.ko strong').innerText());
	await expect(page.locator('#revStatus')).toHaveText(
		`Ce n'est pas ça. Tu as répondu ${donneeAffichee}. La bonne réponse : ${bonne}.`,
	);
	expect(errors).toEqual([]);
});

test('Révision QCM : réponse donnée en --ko non barrée, question non rouge (critères 4, 7, 14)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ratageQcm(page);
	const ko = await couleurToken(page, '--ko');
	await expect(page.locator('.rev-donnee')).toHaveCount(1);
	expect(await couleurDe(page, '.rev-donnee strong')).toBe(ko);
	await pasBarre(page, '.rev-donnee');
	expect(await couleurDe(page, '.rev-q.rev-q-qcm')).not.toBe(ko);
	expect(await couleurDe(page, '.rev-feedback.ko')).not.toBe(ko);
	expect(errors).toEqual([]);
});

/* Fractions empilées : affichées en `.frac`, mais ANNONCÉES en toutes lettres (jamais « 2/4 »
   ni « 2 4 »). Le libellé exact en toutes lettres n'est pas figé. */
test('Révision QCM à fractions : rappel en fraction empilée, annonce sans « / » (critères 2, 5)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ratageQcm(page, 'num-frac-addition');
	const donnee = page.locator('.rev-donnee');
	await expect(donnee).toHaveCount(1);
	await expect(donnee.locator('strong .frac').first()).toBeVisible();
	const status = page.locator('#revStatus');
	await expect(status).toHaveText(/^Ce n'est pas ça\. Tu as répondu /);
	expect(await status.innerText()).not.toContain('/');
	expect(errors).toEqual([]);
});

/* ---------------- Révision : opération posée ---------------- */

test('Révision posée : les opérandes restent lisibles après une erreur, réponse donnée rappelée (critères 1, 2, 3)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const operandes = await ratagePosee(page);
	const apres = await page.locator('#revStage').innerText();
	for (const o of operandes) expect(apres).toContain(o);
	await expect(page.locator('.rev-donnee')).toHaveCount(1);
	await expect(page.locator('.rev-donnee')).toHaveText(/^Tu as répondu\s+\S+/);
	expect(errors).toEqual([]);
});

/* ---------------- Révision : « Je ne sais pas » ---------------- */

test('Révision « Je ne sais pas » (saisie) : question lisible, aucun .rev-donnee (critère 6)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('num-valeur-position'));
	await gotoHash(page, 'revision-espacee');
	await expect(page.locator('#revInput')).toBeVisible();
	const avant = await page.locator('.rev-q').innerText();
	await page.locator('#revGiveUp').click();
	await fermerEtayageSiOuvert(page);
	await expect(page.locator('.rev-feedback.reveal')).toBeVisible();
	await expect(page.locator('.rev-q')).toBeVisible();
	const apres = await page.locator('.rev-q').innerText();
	for (const j of jetons(avant)) expect(apres).toContain(j);
	await expect(page.locator('.rev-donnee')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('Révision « Je ne sais pas » (QCM) : question lisible, aucun .rev-donnee (critère 6)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('fr-vocab-contraires'));
	await gotoHash(page, 'revision-espacee');
	await expect(page.locator('.rev-q.rev-q-qcm')).toBeVisible();
	await page.locator('#revGiveUp').click();
	await fermerEtayageSiOuvert(page);
	await expect(page.locator('.rev-feedback.reveal')).toBeVisible();
	await expect(page.locator('.rev-q.rev-q-qcm')).toBeVisible();
	expect(norm(await page.locator('.rev-q.rev-q-qcm').innerText())).not.toBe('');
	await expect(page.locator('.rev-donnee')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('Révision « Je ne sais pas » (posée) : opérandes lisibles, aucun .rev-donnee (critère 6)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('calc-addition-posee'));
	await gotoHash(page, 'revision-espacee');
	await expect(page.locator('.posee-input').first()).toBeVisible();
	const avant = nombres(await page.locator('#revStage').innerText());
	expect(avant.length).toBeGreaterThan(1);
	await page.locator('#revGiveUp').click();
	await fermerEtayageSiOuvert(page);
	await expect(page.locator('.rev-feedback.reveal')).toBeVisible();
	const apres = await page.locator('#revStage').innerText();
	for (const o of avant) expect(apres).toContain(o);
	await expect(page.locator('.rev-donnee')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ---------------- Leçon ---------------- */

test('Leçon QCM : le message d’erreur n’est pas rouge, la bonne réponse reste verte (critère 7)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-homophones-a');
	const ko = await couleurToken(page, '--ko');
	const ok = await couleurToken(page, '--ok');
	// Le bon choix n'est pas lisible : on clique le premier, et on recharge si c'était le bon.
	for (let essai = 0; essai < 10; essai++) {
		await page.locator('.sprint-choice').first().click();
		await page.locator('#lqcmActions button').waitFor();
		if (await page.locator('.lqcm-ko').count()) break;
		await page.reload({ waitUntil: 'networkidle' });
	}
	await expect(page.locator('.lqcm-ko')).toBeVisible();
	expect(await couleurDe(page, '.lqcm-ko')).not.toBe(ko);
	expect(await couleurDe(page, '.lqcm-ko strong')).toBe(ok);
	expect(errors).toEqual([]);
});

/* ---------------- Sprint ---------------- */

test('Sprint : réponse donnée en --ko non barrée, énoncé non rouge (critères 7, 14)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'sprint-config');
	await page.locator('.sc-option', { hasText: 'Calcul mental' }).click();
	await page.locator('#scLaunch').click();
	await expect(page.locator('#sprintInput')).toBeVisible();
	await page.locator('#sprintInput').fill('999999');
	await page.locator('#sprintInput').press('Enter');

	const ko = await couleurToken(page, '--ko');
	// Existant : le rappel est déjà là. Nouveau : il est rouge, l'énoncé ne l'est pas.
	await expect(page.locator('.sprint-donnee')).toHaveText('Tu as répondu 999999.');
	expect(await couleurDe(page, '.sprint-donnee strong')).toBe(ko);
	await pasBarre(page, '.sprint-donnee');
	await expect(page.locator('.sprint-q')).toBeVisible();
	expect(await couleurDe(page, '.sprint-q')).not.toBe(ko);
	expect(errors).toEqual([]);
});

/* ---------------- Relectures : ✗, posée, ponctuation, champ figé ---------------- */

test('Révision : le ✗ décoratif est masqué au lecteur d’écran (critère 5)', async ({ page }) => {
	const errors = watchErrors(page);
	await ratageSaisie(page);
	await expect(page.locator('.rev-marque-ko')).toHaveAttribute('aria-hidden', 'true');
	expect(errors).toEqual([]);
});

test('Révision posée : annonce de la réponse donnée puis de la bonne (critère 5)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ratagePosee(page);
	const donnee = (await page.locator('.rev-donnee strong').innerText()).trim();
	const bonne = (await page.locator('.rev-feedback.ko strong').innerText()).trim();
	await expect(page.locator('#revStatus')).toHaveText(
		`Ce n'est pas ça. Tu as répondu ${donnee}. La bonne réponse : ${bonne}.`,
	);
	expect(errors).toEqual([]);
});

test('Révision QCM de ponctuation : signes dits en mots, à l’annonce et à l’écran (critères 2, 5)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ratageQcm(page, 'fr-gram-ponctuation');
	// (a) aucune réponse n'est un signe nu dans l'annonce : un signe ne se prononce pas.
	const annonce = await page.locator('#revStatus').innerText();
	expect(annonce).toMatch(/^Ce n'est pas ça\. Tu as répondu /);
	const reponses = annonce.replace(/^Ce n'est pas ça\. Tu as répondu /, '');
	const [donnee, bonne] = reponses.split('. La bonne réponse : ');
	expect(donnee).toMatch(/\p{L}{3,}/u);
	expect(bonne).toMatch(/\p{L}{3,}/u);
	expect(donnee.trim()).not.toMatch(/^[.?!]$/);
	expect(bonne.replace(/\.$/, '').trim()).not.toMatch(/^[.?!]$/);
	// (b) à l'écran, la bonne réponse porte le MOT du signe, pas le glyphe seul.
	const affichee = await page.locator('.rev-feedback.ko strong').innerText();
	expect(affichee).toMatch(/\p{L}{3,}/u);
	expect(errors).toEqual([]);
});

/* Critère 15 — le champ de saisie a un nom accessible dérivé de l'énoncé (comme dans la fiche,
   #577), avant ET après validation. Ni absent, ni le repli générique « réponse ». */
test('Révision : #revInput est nommé d’après l’énoncé, avant et après une erreur (critère 15)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('num-valeur-position'));
	await gotoHash(page, 'revision-espacee');
	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	const mots = (await page.locator('.rev-q').innerText()).match(/\p{L}{4,}/gu) ?? [];
	expect(mots.length).toBeGreaterThan(0);
	const unMotDeLEnonce = new RegExp(mots.join('|'), 'i');

	await expect(input).toHaveAccessibleName(/\S/);
	await expect(input).not.toHaveAccessibleName(/^\s*réponse\s*$/i);
	await expect(input).toHaveAccessibleName(unMotDeLEnonce);

	await input.fill('999999');
	await input.press('Enter');
	await expect(page.locator('.rev-feedback.ko')).toBeVisible();
	await expect(input).toBeDisabled();
	await expect(input).toHaveAccessibleName(/\S/);
	await expect(input).not.toHaveAccessibleName(/^\s*réponse\s*$/i);
	await expect(input).toHaveAccessibleName(unMotDeLEnonce);
	expect(errors).toEqual([]);
});

/* Critère 16 — posée ratée : chaque case-réponse de la grille figée est marquée `.correct` ou
   `.wrong` selon qu'elle vaut son data-answer. On remplit tout JUSTE sauf la case `indexFaux`. */
async function poseeUneSeuleFausse(
	page: Page,
	choisirIndex: (nCases: number) => number,
): Promise<{ faux: number; n: number }> {
	const cells = page.locator('.posee-input');
	await expect(cells.first()).toBeVisible();
	const n = await cells.count();
	const faux = choisirIndex(n);
	for (let i = 0; i < n; i++) {
		const ans = Number((await cells.nth(i).getAttribute('data-answer')) ?? '0');
		await cells.nth(i).fill(String(i === faux ? (ans + 1) % 10 : ans));
	}
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ko')).toBeVisible();
	return { faux, n };
}

async function verifierMarques(page: Page, faux: number, n: number): Promise<void> {
	const cells = page.locator('.posee-input');
	expect(await cells.count()).toBe(n);
	for (let i = 0; i < n; i++) {
		if (i === faux) {
			await expect(cells.nth(i)).toHaveClass(/\bwrong\b/);
			await expect(cells.nth(i)).not.toHaveClass(/\bcorrect\b/);
		} else {
			await expect(cells.nth(i)).toHaveClass(/\bcorrect\b/);
			await expect(cells.nth(i)).not.toHaveClass(/\bwrong\b/);
		}
	}
}

test('Révision posée : une seule case fausse est la seule marquée .wrong (critère 16a)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('calc-addition-posee'));
	await gotoHash(page, 'revision-espacee');
	const { faux, n } = await poseeUneSeuleFausse(page, (nb) => nb - 1);
	await verifierMarques(page, faux, n);
	expect(errors).toEqual([]);
});

test('Révision posée ×2 chiffres : un produit partiel faux est marqué .wrong, le résultat juste .correct (critère 16b)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('calc-multiplication-posee'));
	await gotoHash(page, 'revision-espacee');
	// ~40 % des tirages ont un multiplicateur à deux chiffres (data-pose-b ≥ 10) : on recharge
	// (l'amorçage remet l'élément dû) jusqu'à en obtenir un. 20 essais : échec négligeable.
	for (let essai = 0; essai < 20; essai++) {
		await expect(page.locator('.posee')).toBeVisible();
		const b = Number(await page.locator('.posee').getAttribute('data-pose-b'));
		if (b >= 10) break;
		await page.reload({ waitUntil: 'networkidle' });
	}
	expect(Number(await page.locator('.posee').getAttribute('data-pose-b'))).toBeGreaterThanOrEqual(
		10,
	);
	// Les produits partiels précèdent le résultat dans le DOM : la 1re case en est un.
	const { faux, n } = await poseeUneSeuleFausse(page, () => 0);
	await verifierMarques(page, faux, n);
	expect(errors).toEqual([]);
});

test('Révision : le champ figé après erreur reste lisible, en --ink et pleine opacité', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ratageSaisie(page);
	const input = page.locator('#revInput');
	await expect(input).toBeDisabled();
	const ink = await couleurToken(page, '--ink');
	expect(await couleurDe(page, '#revInput')).toBe(ink);
	const opacite = await input.evaluate((el) => getComputedStyle(el).opacity);
	expect(opacite).toBe('1');
	expect(errors).toEqual([]);
});
