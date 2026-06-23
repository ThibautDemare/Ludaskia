/* ============================================================
   Orthographe — liste déjà maîtrisée : « Le parcours complet » doit lancer un
   TOUR DE RÉVISION (chaque mot une fois, mode d'entretien), pas tomber sur un
   bilan vide « Liste prête ! ».
   Régression : avant le correctif, une liste 100 % maîtrisée (étoile déjà gagnée)
   renvoyait immédiatement le bilan de première complétion, sans rien proposer à
   travailler — flagrant sur une liste d'un seul mot.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Si le tirage de révision tombe sur le mode « tuiles » (renderTuiles dans
   ortho-runner), l'aide contextuelle « lettres » s'auto-affiche et bloquerait
   les interactions. On la marque comme déjà vue pour tous les runners. */
test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

/* État ortho seedé : une liste « l-rev » d'un seul mot « chat » DÉJÀ maîtrisé
   (atelier fait + tous les modes validés). Lettres distinctes → tuiles non ambiguës. */
const SEED_MAITRISEE = {
	banque: {
		m1: {
			id: 'm1',
			mot: 'chat',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: true, dictee: true },
			revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [{ id: 'l-rev', label: 'Liste maîtrisée', motIds: ['m1'], createdAt: 1, updatedAt: 1 }],
	motIdParForme: { chat: 'm1' },
};

/* Complète l'activité d'entretien affichée, quel que soit le mode tiré au hasard
   (tuiles, affiche/masque, ou dictée — les trois peuvent apparaître selon la
   disponibilité du TTS dans l'environnement Chromium headless). */
async function completerEntretien(page: Page, mot: string): Promise<void> {
	if (
		await page
			.locator('#btnVerifTuiles')
			.isVisible()
			.catch(() => false)
	) {
		// Tuiles : poser chaque lettre dans l'ordre (lettres distinctes → non ambigu).
		for (const ch of mot) {
			await page
				.locator('.tuiles-bac button.tuile:not(.tuile-used)', { hasText: ch })
				.first()
				.click();
		}
		await page.locator('#btnVerifTuiles').click();
	} else if (
		await page
			.locator('#btnCacher')
			.isVisible()
			.catch(() => false)
	) {
		// Affiche/masque : cacher d'abord, puis écrire le mot et vérifier.
		await page.locator('#btnCacher').click();
		await page.locator('#orthoInput').fill(mot);
		await page.locator('#btnVerifMot').click();
	} else {
		// Dictée : TTS disponible dans l'environnement → champ texte direct.
		await page.locator('#orthoInput').fill(mot);
		await page.locator('#btnVerifMot').click();
	}
}

test('liste déjà maîtrisée : « parcours complet » lance une révision, pas un bilan vide', async ({
	page,
}) => {
	const errors = watchErrors(page);

	// Injecter l'état ortho AVANT la navigation (addInitScript s'exécute avant goto).
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_MAITRISEE);

	// Écran de choix de mode → « Le parcours complet » (bouton conseillé).
	await gotoHash(page, 'ortho-mode-l-rev');
	await page.locator('.mode-btn.recommended').click();

	// Une activité de révision se rend (consigne visible)…
	await expect(page.locator('.ortho-run-consigne')).toBeVisible();
	// …et surtout PAS le bilan « Liste prête ! » à vide (le bug corrigé).
	await expect(page.getByText('Liste prête')).toHaveCount(0);

	// On travaille le mot (tuiles, affiche/masque ou dictée selon le TTS disponible),
	// puis on enchaîne via le « Continuer → » du feedback de réussite
	// (sélecteur serré : pas le « Continuer encore un peu » de la pause). La liste ne fait
	// qu'un mot → on atteint la fin de révision.
	await completerEntretien(page, 'chat');
	await page.locator('#fb button.btn-primary').click();

	// Écran de fin spécifique à la révision (et non la célébration de première complétion).
	await expect(page.getByRole('heading', { name: 'Révision terminée !' })).toBeVisible();
	await expect(page.getByText('Liste prête')).toHaveCount(0);

	expect(errors).toEqual([]);
});
