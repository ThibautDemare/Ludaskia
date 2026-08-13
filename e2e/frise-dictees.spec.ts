/* ============================================================
   Frise d'états des LISTES de dictée (#541, volet 2) — smoke tests e2e.
   ------------------------------------------------------------
   Les listes de dictée avaient déjà un ÉTAT (`avancementLecon`), mais aucune
   trajectoire datée : rien ne journalisait le moment où une liste passe
   « en cours » puis « acquis ». Le journal dédié (`journaliserPaliersOrtho`,
   `src/core/orthographe/paliers.ts`) répare ça, sur le modèle du journal des
   paliers des leçons (#397/#521), et la même frise (`friseNotionHTML`) est
   réutilisée dans le bloc « Dictées » de l'onglet Suivi (`ligneListeOrtho`,
   `src/ui/encadrant-progression.ts`).

   Ces tests SÈMENT le journal directement en localStorage (comme
   encadrant.spec.ts le fait pour les leçons) : l'écriture RÉELLE par une
   session jouée est couverte à part (paliers-journal-ortho.spec.ts).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Deux listes « maison » (source 'liste', toujours visibles) : l'une dont l'atelier
   est fait mais aucun mode validé (niveau réel « en cours »), l'autre entièrement
   validée (niveau réel « acquis » — dictée exclue des modes requis en Chromium
   headless, sans voix FR, cf. modesRequis/dicteeDisponible). */
const SEED_ORTHO_ETATS = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'cahier',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w2: {
			id: 'w2',
			mot: 'tableau',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: true, dictee: false },
			revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-frise-encours',
			label: 'Liste en cours',
			motIds: ['w1'],
			createdAt: 1,
			updatedAt: 1,
		},
		{
			id: 'l-e2e-frise-acquis',
			label: 'Liste acquise',
			motIds: ['w2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { cahier: 'w1', tableau: 'w2' },
};

/* Journal des paliers de dictée (#541) : un franchissement daté par liste + la
   borne de mise en service, sur le modèle de SEED_PALIERS (encadrant.spec.ts). */
const SEED_PALIERS_ORTHO = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliersOrthoDepuis', String(now - 6 * week));
  localStorage.setItem('e2e/ludaskia_paliersOrtho', JSON.stringify({
    'l-e2e-frise-encours': { enCours: now - 5 * week },
    'l-e2e-frise-acquis': { acquis: now - 2 * week },
  }));
})();`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_ORTHO_ETATS);
});

test("frise d'une liste de dictée « en cours » : 12 cellules, préfixe inconnu, dernière cellule en cours", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_PALIERS_ORTHO);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-encours"])');
	const frise = ligne.locator('.enc-frise');
	await expect(frise).toBeVisible();
	await expect(frise).toHaveAttribute('aria-label', /Évolution sur les 12 dernières semaines/);

	const cells = frise.locator('.enc-frise-cell');
	await expect(cells).toHaveCount(12);
	// Avant la mise en service du journal (borne à 6 semaines), les semaines suivies
	// mais sans cap daté sont « à découvrir » (cf. friseListeOrtho : plancher constant
	// pour une liste, contrairement à une leçon).
	await expect(cells.first()).toHaveClass(/enc-frise-inconnu/);
	await expect(cells.last()).toHaveClass(/enc-frise-en-cours/);
	await expect(cells.last()).toHaveClass(/enc-frise-courante/);

	expect(errors).toEqual([]);
});

test("frise d'une liste de dictée « acquise » : dernière cellule acquise et courante", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_PALIERS_ORTHO);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-acquis"])');
	const frise = ligne.locator('.enc-frise');
	await expect(frise).toBeVisible();

	const cells = frise.locator('.enc-frise-cell');
	await expect(cells).toHaveCount(12);
	await expect(cells.last()).toHaveClass(/enc-frise-acquis/);
	await expect(cells.last()).toHaveClass(/enc-frise-courante/);

	expect(errors).toEqual([]);
});

/* Nuance documentée par friseListeOrtho/debutSuiviPaliers (#541) : SANS borne de mise
   en service (`ludaskia_paliersOrthoDepuis` absente) et sans aucun cap déjà daté, rien
   n'est déductible — la frise reste ENTIÈREMENT « inconnu », même si l'état RÉEL de la
   liste (`avancementLecon`) est déjà « en cours ». C'est le cas d'un profil qui
   travaillait ses listes avant l'arrivée de ce journal. */
test("sans borne de mise en service, la frise d'une liste déjà commencée reste entièrement « inconnu »", async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Aucun seed de `ludaskia_paliersOrtho`/`ludaskia_paliersOrthoDepuis` : le journal
	// n'a encore jamais tourné pour ce profil.
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-encours"])');
	const frise = ligne.locator('.enc-frise');
	await expect(frise).toBeVisible();
	await expect(frise.locator('.enc-frise-cell')).toHaveCount(12);
	await expect(frise.locator('.enc-frise-inconnu')).toHaveCount(12);

	expect(errors).toEqual([]);
});

/* Une liste jamais commencée (aucun mot travaillé) n'a rien à tracer : pas de frise,
   comme pour une leçon jamais travaillée (cf. encadrant.spec.ts, test 10). */
test('liste de dictée jamais commencée : pas de frise', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript((seed) => {
		const s = JSON.parse(seed);
		s.listes.push({
			id: 'l-e2e-frise-vierge',
			label: 'Liste vierge',
			motIds: [],
			createdAt: 1,
			updatedAt: 1,
		});
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, JSON.stringify(SEED_ORTHO_ETATS));
	await page.addInitScript(SEED_PALIERS_ORTHO);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-vierge"])');
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);

	expect(errors).toEqual([]);
});
