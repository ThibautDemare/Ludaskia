/* ============================================================
   Mode « afficher / cacher » (motCache) — entourages en lecture seule (#263).
   Vérifie que les rectangles SVG tracés à l'atelier sont bien retracés
   sur le mot affiché (phase de lecture), avant que l'enfant clique sur
   « Cacher et écrire ». Couvre aussi :
   - le masquage du mot lors du clic sur #btnCacher (→ #motStage caché,
     #zoneSaisie visible) ;
   - l'absence d'entourages quand le mot n'en a pas.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* État ortho seedé : une liste « l-e2e » avec :
   - w1 « bonjour » : un entourage sur les lettres 2-4, couleur 1.
   - w2 « alors »   : aucun entourage.
   Les deux mots ont atelierFait = true et motCache non validé, donc le runner
   les présentera bien en mode motCache. */
const ORTHO_SEED = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [{ debut: 2, fin: 4, couleur: 1 }],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w2: {
			id: 'w2',
			mot: 'alors',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e',
			label: 'Test entourages',
			motIds: ['w1', 'w2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { bonjour: 'w1', alors: 'w2' },
};

/* ------------------------------------------------------------------ */
/* Test 1 : mot avec entourage — SVG tracé, masquage au clic           */
/* ------------------------------------------------------------------ */
test('motCache : entourages tracés sur le mot affiché, masquage au clic #btnCacher — #263', async ({
	page,
}) => {
	const errors = watchErrors(page);

	// Injecter l'état ortho AVANT la navigation (addInitScript s'exécute avant goto).
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, ORTHO_SEED);

	// Naviguer vers l'écran de choix de mode de la liste.
	await gotoHash(page, 'ortho-mode-l-e2e');

	// Cliquer sur le mode « afficher/cacher » (sélecteur stable data-mode).
	await page.locator('[data-mode="motCache"]').click();

	// --- Phase d'affichage du mot ---

	// Le mot s'affiche.
	await expect(page.locator('#motAffiche')).toBeVisible();

	// Les entourages sont tracés (au moins un <rect> dans le SVG).
	// On attend avec auto-retry pour laisser la mise en page se calculer
	// (dessinerEntourages dépend des offsetLeft/Width des spans).
	await expect(page.locator('#motSvg rect')).toHaveCount(1);

	// --- Clic sur « Cacher et écrire » ---
	await page.locator('#btnCacher').click();

	// Le stage (mot + SVG) est masqué.
	await expect(page.locator('#motStage')).toBeHidden();

	// La zone de saisie est maintenant visible.
	await expect(page.locator('#zoneSaisie')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* Test 2 : mot sans entourage — #motSvg reste vide                    */
/* ------------------------------------------------------------------ */
test('motCache : mot sans entourage → #motSvg vide — #263', async ({ page }) => {
	const errors = watchErrors(page);

	// Seed une liste à un seul mot sans entourage pour isoler ce cas.
	const seedSansEntourage = {
		banque: {
			w2: {
				id: 'w2',
				mot: 'alors',
				entourage: [],
				atelierFait: true,
				validation: { motCache: false, tuiles: false, dictee: false },
				revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
				origine: 'liste',
			},
		},
		listes: [
			{
				id: 'l-e2e-vide',
				label: 'Test sans entourage',
				motIds: ['w2'],
				createdAt: 1,
				updatedAt: 1,
			},
		],
		motIdParForme: { alors: 'w2' },
	};

	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, seedSansEntourage);

	await gotoHash(page, 'ortho-mode-l-e2e-vide');

	await page.locator('[data-mode="motCache"]').click();

	// Le mot s'affiche.
	await expect(page.locator('#motAffiche')).toBeVisible();

	// Aucun rect dans le SVG (pas d'entourage).
	await expect(page.locator('#motSvg rect')).toHaveCount(0);

	expect(errors).toEqual([]);
});
