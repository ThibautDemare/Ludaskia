/* ============================================================
   Smoke e2e — Grammaire « Clique sur… » les 5 natures CM1 (#437).
   Réutilise le runner d'écran « clique sur le mot » (ui/lecon-clic-mot.ts) déjà
   couvert en profondeur par clic-verbe.spec.ts (#259) : sélection MULTIPLE
   réversible de tokens `.lclic-mot`, correction par égalité d'ensembles, feedback
   `.lqcm-ok/.lqcm-ko` + `.lqcm-expl`, révélation `.is-cible`. On ne réexerce pas
   ici toute la mécanique (déjà testée) : on couvre la présence des 5 nouvelles
   leçons, un smoke jeu par leçon, et le cas spécifique à ces natures — une cible
   à DEUX mots NON ADJACENTS (« ni…ni », sujet composé de noms propres).

   Ces 5 leçons sont CM1-UNIQUEMENT (`levels: ['cm1']`, cf. grammaire-clic-mot.ts) :
   comme clic-verbe.spec.ts, on seed un profil CM1 et on navigue DIRECTEMENT vers le
   hash de la leçon (gotoHash forcerait ce2, catalogue où ces leçons sont absentes).

   Aide contextuelle (#272/#435) : `#aideOverlay` s'ouvre au 1er lancement d'un
   profil neuf et intercepte les clics → fermée systématiquement avant toute
   interaction (fermerAideSiPresente, identique à clic-verbe.spec.ts).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Ferme l'aide auto-affichée si présente (1er lancement, profil neuf) ; ne fait
   rien si absente. Identique à clic-verbe.spec.ts. */
async function fermerAideSiPresente(page: Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) {
		await page.locator('.aide-ok').click();
		await expect(overlay).toHaveCount(0);
	}
}

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
	// Une relance sur le MÊME hash (trouverCibleDouble) est un no-op de navigation
	// (URL identique) sous Chromium : .reload() force un vrai rechargement à coup sûr.
	await page.reload({ waitUntil: 'networkidle' });
}

const NB_QUESTIONS = 8; // cf. ui/lecon-clic-mot.ts (partagé par tous les runners clicMot)

const LECONS_CLIC_MOT = [
	{ id: 'fr-gram-clic-det', label: 'Clique sur le déterminant' },
	{ id: 'fr-gram-clic-conj', label: 'Clique sur la conjonction' },
	{ id: 'fr-gram-clic-pron', label: 'Clique sur le pronom' },
	{ id: 'fr-gram-clic-noyau', label: 'Clique sur le nom noyau' },
	{ id: 'fr-gram-clic-sujet', label: 'Clique sur le sujet' },
];

test('les 5 leçons « Clique sur… » apparaissent en Grammaire (profil CM1)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-fr-grammaire');
	for (const { id } of LECONS_CLIC_MOT) {
		await expect(page.locator(`[data-id="${id}"]`)).toBeVisible();
	}
	expect(errors).toEqual([]);
});

for (const { id, label } of LECONS_CLIC_MOT) {
	test(`CM1 : « ${label} » se rend et se joue (sélection, Vérifier, feedback)`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoCM1(page, `lecon-${id}`); // mono-mode → lancement direct
		const mots = page.locator('.lclic-mot');
		await mots.first().waitFor();
		await fermerAideSiPresente(page); // écarte l'auto-aide (#435) avant toute interaction

		await expect(page.locator('#lclicVerif')).toBeDisabled();

		await mots.first().click();
		await expect(mots.first()).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('#lclicVerif')).toBeEnabled();

		await page.locator('#lclicVerif').click();
		await expect(page.locator('#lclicVerif')).toBeHidden();
		await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
		await expect(page.locator('.lqcm-expl')).toBeVisible();
		await expect(mots.first()).toHaveClass(/correct|wrong/);
		expect(errors).toEqual([]);
	});
}

/* Avance dans les questions d'un run jusqu'à tomber sur une cible DOUBLE non
   adjacente (« ni…ni » en conjonction, sujet composé de noms propres en sujet).
   Le mot cliqué (le dernier mot cliquable de la phrase) sert de pari pour
   déclencher Vérifier ; la taille RÉELLE de la cible se déduit du nombre de
   mots marqués (`.correct` + `.is-cible`) après correction — jamais lue depuis
   les données. Relance bornée (5 runs) plutôt qu'un waitForTimeout, comme
   trouverCibleDouble dans clic-verbe.spec.ts. Laisse la page sur l'item trouvé,
   déjà vérifié. */
async function trouverCibleDouble(page: Page, hash: string): Promise<boolean> {
	for (let run = 0; run < 5; run++) {
		await gotoCM1(page, hash);
		for (let q = 0; q < NB_QUESTIONS; q++) {
			const mots = page.locator('.lclic-mot');
			await mots.first().waitFor();
			if (q === 0) await fermerAideSiPresente(page); // écarte l'auto-aide (#435), 1re question du run
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

test('CM1 : une cible à deux mots non adjacents (ni…ni) est révélée par .is-cible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const trouve = await trouverCibleDouble(page, 'lecon-fr-gram-clic-conj');
	expect(trouve).toBe(true); // un item « ni…ni » a bien été tiré (dans les runs tentés)
	await expect(page.locator('.lclic-mot.correct, .lclic-mot.is-cible')).toHaveCount(2);
	expect(errors).toEqual([]);
});
