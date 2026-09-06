/* ============================================================
   Écran de choix du mode d'orthographe, cas « liste entièrement acquise »
   (#658) — smoke tests écrits AVANT l'implémentation, à partir des critères
   d'acceptation gelés sur l'issue. Rien n'est codé sur la branche
   `fix/658-marche-haute-liste-acquise` : cette spec doit être ROUGE.

   Défaut visé : sur une liste acquise, le bouton de tête reste « Le parcours
   complet » badgé « conseillé · donne l'étoile », alors que l'étoile est déjà
   acquise (sa célébration ne se rejoue pas, #641 critère 5) et que derrière ce
   bouton se joue en réalité un tour de révision à marche tirée au hasard.

   Contrat de surface attendu (issue #658) :
   - critères 1/2/4/6 : sur une liste acquise, le bouton `.mode-btn.recommended`
     (toujours `data-mode=""`) porte en plus `data-marche="dictee"` (voix dispo)
     ou `data-marche="motCache"` (pas de voix) — l'attribut est la source de
     vérité, pas le libellé, qui reprend simplement celui du mode visé
     (`ORTHO_MODE_OPTIONS`, déjà arrêté ailleurs). Son badge devient
     « conseillé » seul, sans « Le parcours complet » ni « donne l'étoile ».
     Son coût affiche `min(8, nombre de mots de la liste)` — la liste seed ici
     n'a que 2 mots, pour que ce plafond soit discriminant face au « 8
     activités » actuel, écrit en dur.
   - critère 5 : le mode promu en tête ne réapparaît plus dans la zone basse
     (`.mode-choice-epuises`) ; les autres modes y restent, avec le badge
     actuel et SANS `.programme-tuile--inactive` (déjà refusé par #641).
   - critère 10 : « Relire mes mots » ne bouge pas.
   - critères 7/11 (négatifs) : une liste NON entièrement acquise garde
     exactement l'écran actuel — parcours complet en tête, badge
     « conseillé · donne l'étoile ».

   Stub de voix : jamais subi de l'hôte (Chromium headless n'expose aucune
   voix par défaut sous Linux/CI, mais peut exposer des voix SAPI sous
   Windows) — `STUB_SANS_VOIX` / `STUB_VOIX_FR` (`journal-couverture.ts`)
   posent l'état voulu explicitement, comme dans `ortho-choix-mode.spec.ts`.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import { STUB_SANS_VOIX, STUB_VOIX_FR } from './journal-couverture';

/* ---------- Seeds (pattern repris de ortho-choix-mode.spec.ts) ---------- */

function motVierge(
	id: string,
	mot: string,
	validation: Partial<{ tuiles: boolean; motCache: boolean; dictee: boolean }> = {},
) {
	return {
		id,
		mot,
		entourage: [],
		atelierFait: true,
		validation: { tuiles: false, motCache: false, dictee: false, ...validation },
		revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
		origine: 'liste',
	};
}

async function seedOrtho(page: Page, seed: unknown): Promise<void> {
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

// Liste de 2 mots, tuiles + mot caché déjà validés sur les deux : liste acquise
// dès l'ouverture de l'écran quand la dictée n'est pas disponible (STUB_SANS_VOIX).
const LESSON_ACQUISE = 'l-e2e-liste-acquise-sans-voix';
const SEED_ACQUISE = {
	banque: {
		m1: motVierge('m1', 'chat', { tuiles: true, motCache: true }),
		m2: motVierge('m2', 'lion', { tuiles: true, motCache: true }),
	},
	listes: [
		{
			id: LESSON_ACQUISE,
			label: 'Liste acquise',
			motIds: ['m1', 'm2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1', lion: 'm2' },
};

// Même liste, mais les 3 modes (dont dictée) sont validés : acquise quand la
// dictée EST disponible (STUB_VOIX_FR).
const LESSON_ACQUISE_VOIX = 'l-e2e-liste-acquise-voix';
const SEED_ACQUISE_VOIX = {
	banque: {
		m1: motVierge('m1', 'chat', { tuiles: true, motCache: true, dictee: true }),
		m2: motVierge('m2', 'lion', { tuiles: true, motCache: true, dictee: true }),
	},
	listes: [
		{
			id: LESSON_ACQUISE_VOIX,
			label: 'Liste acquise voix',
			motIds: ['m1', 'm2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1', lion: 'm2' },
};

// Tuiles validé sur les deux mots, mot caché non : liste PAS entièrement
// acquise (le critère négatif ne doit rien changer ici).
const LESSON_NON_ACQUISE = 'l-e2e-liste-non-acquise';
const SEED_NON_ACQUISE = {
	banque: {
		m1: motVierge('m1', 'chat', { tuiles: true }),
		m2: motVierge('m2', 'lion', { tuiles: true }),
	},
	listes: [
		{
			id: LESSON_NON_ACQUISE,
			label: 'Liste non acquise',
			motIds: ['m1', 'm2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1', lion: 'm2' },
};

test.describe('Orthographe : écran de choix, liste entièrement acquise (#658)', () => {
	test('critères 1,2,4,5,6,10 : sans voix, la marche haute promue en tête est « mot caché »', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_SANS_VOIX);
		await seedOrtho(page, SEED_ACQUISE);
		await gotoHash(page, 'ortho-mode-' + LESSON_ACQUISE);

		const tete = page.locator('.mode-choice-list .mode-btn.recommended');
		await expect(tete).toBeVisible();
		await expect(tete).toHaveAttribute('data-mode', '');
		// critère 6 : pas de voix de synthèse → la marche la plus haute jouable est le mot caché.
		await expect(tete).toHaveAttribute('data-marche', 'motCache');
		// Libellé du mode visé, déjà arrêté dans ORTHO_MODE_OPTIONS (pas une formulation neuve).
		await expect(tete.locator('.mode-btn-label')).toHaveText("Je regarde puis j'écris");
		// critère 2 : le badge ne promet plus l'étoile.
		await expect(tete.locator('.mode-btn-badge')).toHaveText('conseillé');
		// critère 1 : ce n'est plus « Le parcours complet ».
		await expect(tete).not.toContainText('Le parcours complet');
		await expect(tete).not.toContainText("donne l'étoile");
		// critère 4 : coût = min(8, nombre de mots) — 2 mots ici, pas « 8 activités » en dur.
		await expect(tete.locator('.mode-btn-cout')).toHaveText('2 activités');

		// critère 5 : le mode promu quitte la zone basse, l'autre y reste, actif.
		await expect(page.locator('.mode-choice-epuises .mode-btn[data-mode="motCache"]')).toHaveCount(
			0,
		);
		const tuilesEpuise = page.locator('.mode-choice-epuises .mode-btn[data-mode="tuiles"]');
		await expect(tuilesEpuise).toBeVisible();
		await expect(tuilesEpuise).toContainText('Terminé pour cette liste');
		await expect(tuilesEpuise).toContainText('donne toujours des points');
		await expect(tuilesEpuise).not.toHaveClass(/programme-tuile--inactive/);

		// critère 10 : « Relire mes mots » inchangé.
		await expect(page.locator('#btnRevoir .mode-btn-hint')).toHaveText(
			'juste pour relire, sans points',
		);

		expect(errors).toEqual([]);
	});

	test('critère 1 : avec voix de synthèse, la marche haute promue en tête est la dictée', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_VOIX_FR);
		await seedOrtho(page, SEED_ACQUISE_VOIX);
		await gotoHash(page, 'ortho-mode-' + LESSON_ACQUISE_VOIX);

		const tete = page.locator('.mode-choice-list .mode-btn.recommended');
		await expect(tete).toBeVisible();
		await expect(tete).toHaveAttribute('data-marche', 'dictee');
		await expect(tete.locator('.mode-btn-label')).toHaveText("J'écoute et j'écris");
		await expect(tete.locator('.mode-btn-badge')).toHaveText('conseillé');

		// La dictée quitte la zone basse ; les deux autres modes y restent.
		await expect(page.locator('.mode-choice-epuises .mode-btn[data-mode="dictee"]')).toHaveCount(0);
		await expect(page.locator('.mode-choice-epuises .mode-btn[data-mode="tuiles"]')).toBeVisible();
		await expect(
			page.locator('.mode-choice-epuises .mode-btn[data-mode="motCache"]'),
		).toBeVisible();

		expect(errors).toEqual([]);
	});

	test("critères 7,11 (négatif) : liste non entièrement acquise, l'écran garde le parcours complet en tête", async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_SANS_VOIX);
		await seedOrtho(page, SEED_NON_ACQUISE);
		await gotoHash(page, 'ortho-mode-' + LESSON_NON_ACQUISE);

		const tete = page.locator('.mode-choice-list .mode-btn.recommended');
		await expect(tete).toBeVisible();
		expect(await tete.getAttribute('data-marche')).toBeNull();
		await expect(tete.locator('.mode-btn-label')).toHaveText('Le parcours complet');
		await expect(tete.locator('.mode-btn-badge')).toHaveText("conseillé · donne l'étoile");

		expect(errors).toEqual([]);
	});
});
