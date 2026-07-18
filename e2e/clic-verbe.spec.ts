/* ============================================================
   Smoke e2e — Grammaire « Clique sur le verbe » (#259).
   Nouveau runner d'interaction « clique sur le mot » (ui/lecon-clic-mot.ts) :
   une phrase rendue MOT PAR MOT en boutons `.lclic-mot` (data-i), sélection
   MULTIPLE réversible (`.is-selected`) tant que « Vérifier » (#lclicVerif,
   désactivé sans sélection) n'a pas été cliqué. Correction par égalité
   d'ensembles : les mots figés portent `.correct`/`.wrong` (+ pastille
   `.lclic-mark`), le(s) bon(s) mot(s) non choisis sont révélés via `.is-cible`.

   La bonne réponse n'est PAS exposée dans le DOM avant Vérifier (comme
   l'appariement, cf. appariement.spec.ts) : on exerce la MÉCANIQUE (sélection
   réversible, activation de Vérifier, feedback + révélation), pas un score
   parfait — le mot cliqué est choisi arbitrairement.

   CE2 (cible = 1 mot, temps simples) : navigation habituelle (gotoHash force
   ce2). CM1 (cible = 1 OU 2 mots au passé composé) : profil seedé en CM1 et
   navigation DIRECTE (gotoHash forcerait ce2), comme problemes-cm1.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

const NB_QUESTIONS = 8; // cf. ui/lecon-clic-mot.ts

test('la catégorie Grammaire propose la leçon « Clique sur le verbe »', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-grammaire');
	await expect(page.locator('[data-id="fr-gram-clic-verbe"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test("CE2 : sélection réversible d'un mot, Vérifier, feedback + révélation", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-clic-verbe'); // mono-mode → lancement direct
	const mots = page.locator('.lclic-mot');
	await mots.first().waitFor();

	await expect(page.locator('#lclicVerif')).toBeDisabled();

	// Sélectionner le 1er mot cliquable : aria-pressed + classe, Vérifier s'active.
	const premier = mots.first();
	await premier.click();
	await expect(premier).toHaveAttribute('aria-pressed', 'true');
	await expect(premier).toHaveClass(/is-selected/);
	await expect(page.locator('#lclicVerif')).toBeEnabled();

	// Retaper le même mot le désélectionne (réversible) : Vérifier se redésactive.
	await premier.click();
	await expect(premier).toHaveAttribute('aria-pressed', 'false');
	await expect(premier).not.toHaveClass(/is-selected/);
	await expect(page.locator('#lclicVerif')).toBeDisabled();

	// Resélectionner puis valider.
	await premier.click();
	await page.locator('#lclicVerif').click();

	// Feedback affiché, Vérifier s'efface (seul Continuer reste, #153).
	await expect(page.locator('#lclicVerif')).toBeHidden();
	await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	// Le mot cliqué est figé et marqué juste ou faux (jamais neutre).
	await expect(premier).toHaveClass(/correct|wrong/);
	await expect(premier.locator('.lclic-mark')).toBeVisible();
	// Si faux, le(s) bon(s) mot(s) sont révélés en vert dans la phrase.
	if (await page.locator('.lqcm-ko').isVisible()) {
		await expect(page.locator('.lclic-mot.is-cible').first()).toBeVisible();
	}
	await expect(page.locator('#lclicActions button')).toBeVisible();

	// Continuer enchaîne : la phrase suivante se re-rend (Vérifier redevient désactivé).
	await page.locator('#lclicActions button').click();
	await expect(page.locator('#lclicVerif')).toBeVisible();
	await expect(page.locator('#lclicVerif')).toBeDisabled();
	expect(errors).toEqual([]);
});

test('CM1 : la leçon se rend (niveau forcé en CM1, navigation directe)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-gram-clic-verbe');
	const mots = page.locator('.lclic-mot');
	await mots.first().waitFor();

	// La consigne CM1 signale qu'au passé composé le verbe est en deux mots.
	await expect(page.locator('.lclic-consigne')).toContainText('deux mots');

	await mots.first().click();
	await page.locator('#lclicVerif').click();
	await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
	expect(errors).toEqual([]);
});

/* Avance dans les questions d'un run (une leçon = une phrase aléatoire par
   question) jusqu'à tomber sur un verbe au PASSÉ COMPOSÉ (cible = 2 mots).
   Le mot cliqué (le dernier mot cliquable de la phrase, jamais le verbe dans
   la banque : cf. grammaire-clic-mot.ts, le verbe n'y ferme aucune phrase) sert
   de pari pour déclencher Vérifier ; la taille RÉELLE de la cible se déduit du
   nombre total de mots marqués (`.correct` + `.is-cible`) après correction —
   sans jamais lire la réponse depuis les données. Relance jusqu'à 5 runs si
   aucun passé composé n'apparaît dans les 8 tirages (~18 % par tirage, donc
   probabilité résiduelle négligeable sur 40 tirages), plutôt qu'un
   waitForTimeout arbitraire. Laisse la page sur l'item trouvé, déjà vérifié. */
async function trouverCibleDouble(page: Page, hash: string): Promise<boolean> {
	for (let run = 0; run < 5; run++) {
		await gotoCM1(page, hash);
		for (let q = 0; q < NB_QUESTIONS; q++) {
			const mots = page.locator('.lclic-mot');
			await mots.first().waitFor();
			const n = await mots.count();
			await mots.nth(n - 1).click();
			await page.locator('#lclicVerif').click();
			const tailleCible = await page.locator('.lclic-mot.correct, .lclic-mot.is-cible').count();
			if (tailleCible === 2) return true;
			if (q < NB_QUESTIONS - 1) await page.locator('#lclicActions button').click();
		}
	}
	return false;
}

test('CM1 : un verbe au passé composé (cible 2 mots) est révélé par .is-cible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const trouve = await trouverCibleDouble(page, 'lecon-fr-gram-clic-verbe');
	expect(trouve).toBe(true); // un item à cible double a bien été tiré (dans les runs tentés)
	await expect(page.locator('.lclic-mot.correct, .lclic-mot.is-cible')).toHaveCount(2);
	await expect(page.locator('.lqcm-expl')).toContainText('deux mots');
	expect(errors).toEqual([]);
});
