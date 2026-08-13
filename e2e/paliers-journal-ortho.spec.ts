/* ============================================================
   Journal des paliers des LISTES de dictée (#541, volet 2) — écriture RÉELLE
   par une session JOUÉE dans l'interface, pas semée à la main.
   ------------------------------------------------------------
   Pendant de `paliers-journal.spec.ts` (leçons du catalogue), pour le journal
   dédié aux listes d'orthographe (`journaliserPaliersOrtho`,
   `src/core/orthographe/paliers.ts`, clés `ludaskia_paliersOrtho` /
   `ludaskia_paliersOrthoDepuis`), appelé depuis DEUX portes :
   - la dictée elle-même, à tout écran terminal (`journalOrthoSession`,
     `src/ui/ortho-runner.ts`) ;
   - la révision espacée, en fin de session (`renderDone`, `src/ui/revision.ts`),
     qui rejoue des MOTS sans jamais passer par la dictée.
   Rien ne vérifiait que ces deux chemins écrivent bien le journal daté dont la
   frise de l'espace encadrant dépend (frise-dictees.spec.ts).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Complète l'activité d'entretien affichée, quel que soit le mode tiré au hasard
   (copié de ortho-revision.spec.ts : tuiles, affiche/masque, ou dictée selon la
   disponibilité du TTS dans l'environnement Chromium headless). */
async function completerEntretien(page: Page, mot: string): Promise<void> {
	if (
		await page
			.locator('#btnVerifTuiles')
			.isVisible()
			.catch(() => false)
	) {
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
		await page.locator('#btnCacher').click();
		await page.locator('#orthoInput').fill(mot);
		await page.locator('#btnVerifMot').click();
	} else {
		await page.locator('#orthoInput').fill(mot);
		await page.locator('#btnVerifMot').click();
	}
}

/* Liste d'un seul mot DÉJÀ maîtrisé (atelier fait + tous les modes validés) : le
   parcours complet lance un tour de révision d'entretien qui se termine par le
   bilan « Révision terminée ! » (renderRevisionFin), lequel journalise (cf.
   ortho-revision.spec.ts). Lettres distinctes → tuiles non ambiguës. */
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
	listes: [
		{ id: 'l-e2e-pj', label: 'Liste maîtrisée', motIds: ['m1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { chat: 'm1' },
};

test('round-trip dictée : une révision de liste déjà maîtrisée journalise « acquis » + la borne de mise en service', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_MAITRISEE);
	await gotoHash(page, 'ortho-mode-l-e2e-pj');

	await page.locator('.mode-btn.recommended').click();
	await expect(page.locator('.ortho-run-consigne')).toBeVisible();

	await completerEntretien(page, 'chat');
	await page.locator('#fb button.btn-primary').click();

	// Écran terminal atteint : c'est lui qui déclenche journalOrthoSession.
	await expect(page.getByRole('heading', { name: 'Révision terminée !' })).toBeVisible();

	const { paliers, depuis } = await page.evaluate(() => ({
		paliers: JSON.parse(localStorage.getItem('e2e/ludaskia_paliersOrtho') || 'null'),
		depuis: JSON.parse(localStorage.getItem('e2e/ludaskia_paliersOrthoDepuis') || 'null'),
	}));

	expect(typeof depuis).toBe('number');
	expect(depuis).toBeGreaterThan(0);
	expect(paliers).not.toBeNull();
	const notion = paliers['l-e2e-pj'];
	expect(notion).toBeTruthy();
	// Liste déjà maîtrisée avant même de jouer : franchissement direct « acquis »
	// (jamais « en cours » d'abord).
	expect(typeof notion.acquis).toBe('number');
	// Même instant capturé une seule fois par journalOrthoSession : les deux coïncident.
	expect(notion.acquis).toBe(depuis);

	expect(errors).toEqual([]);
});

/* Un seul mot d'orthographe DÛ (palier en rotation), rejoué en révision espacée —
   PAS de dictée lancée. Repris de revision-ortho.spec.ts (bonjour/l-e2e-rev),
   validation.tuiles=false → statutMot 'enCours' → niveau de LISTE « en cours ». */
const ORTHO_SEED_DUE = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: false, dictee: false },
			revision: { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: 1 },
			origine: 'liste',
		},
	},
	listes: [
		{ id: 'l-e2e-rev-pj', label: 'Test PJ révision', motIds: ['w1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { bonjour: 'w1' },
};

test('round-trip révision espacée : un mot dû, sans dictée lancée, journalise « en cours » + la borne', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, ORTHO_SEED_DUE);
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('.rev-word')).toHaveText('bonjour');
	await page.locator('#revHide').click();
	await page.locator('#revInput').fill('bonjour');
	await page.locator('#revValidate').click();
	// Un seul mot dans la session : le bouton de verdict est « Terminer » (idx+1 = items.length).
	await page.locator('#revNext').click();

	await expect(page.locator('.rev-done')).toContainText('terminée');

	const { paliers, depuis } = await page.evaluate(() => ({
		paliers: JSON.parse(localStorage.getItem('e2e/ludaskia_paliersOrtho') || 'null'),
		depuis: JSON.parse(localStorage.getItem('e2e/ludaskia_paliersOrthoDepuis') || 'null'),
	}));

	expect(typeof depuis).toBe('number');
	expect(paliers).not.toBeNull();
	const notion = paliers['l-e2e-rev-pj'];
	expect(notion).toBeTruthy();
	// Un seul mot commencé, aucun mode encore validé (tuiles manque) → « en cours ».
	expect(typeof notion.enCours).toBe('number');
	expect(notion.acquis).toBeUndefined();

	expect(errors).toEqual([]);
});
