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

/* Quatre listes « maison » (source 'liste', toujours visibles) : deux pour les paliers
   datés (l'une dont l'atelier est fait mais aucun mode validé, niveau réel « en cours » ;
   l'autre entièrement validée, niveau réel « acquis » — dictée exclue des modes requis en
   Chromium headless, sans voix FR, cf. modesRequis/dicteeDisponible), et deux de plus pour
   l'AMORÇAGE depuis le graphe d'activité (#541) : une « en cours » et une « acquise »,
   toutes deux SANS aucun palier stocké — c'est justement le cas qu'amorce ou pas
   `friseListeOrtho` selon que le sommet visé est atteignable. */
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
		w3: {
			id: 'w3',
			mot: 'domino',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w4: {
			id: 'w4',
			mot: 'ballon',
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
		{
			id: 'l-e2e-frise-amorce-encours',
			label: 'Liste amorcée en cours',
			motIds: ['w3'],
			createdAt: 1,
			updatedAt: 1,
		},
		{
			id: 'l-e2e-frise-amorce-acquis',
			label: 'Liste amorcée acquise',
			motIds: ['w4'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { cahier: 'w1', tableau: 'w2', domino: 'w3', ballon: 'w4' },
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
	// Puce d'état omise mais sa gouttière réservée, même règle que sur une ligne de leçon
	// (cf. encadrant.spec.ts, test 10) — seul le placeholder subsiste, jamais de pastille COLORÉE.
	await expect(ligne.locator('.enc-detail-puce.enc-detail-puce--reserve')).toHaveCount(1);
	await expect(ligne.locator('.enc-detail-puce[class*="enc-key-"]')).toHaveCount(0);

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
	await expect(ligne.locator('.enc-detail-puce.enc-detail-puce--reserve')).toHaveCount(1);
	await expect(ligne.locator('.enc-detail-puce[class*="enc-key-"]')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Nuance documentée par friseListeOrtho/aucuneSemaineConnue (#541) : SANS borne de mise
   en service (`ludaskia_paliersOrthoDepuis` absente) et sans aucun cap déjà daté, rien
   n'est déductible d'aucune semaine — plutôt que d'affirmer douze cellules « inconnu »
   (lu comme un défaut d'affichage sur TOUTES les listes d'un profil existant, le jour de
   la mise en service du journal), la frise n'est PAS DESSINÉE. La ligne retombe alors sur
   sa puce d'état et son mot, exactement comme avant qu'elle ait une frise. */
test("sans borne de mise en service, une liste déjà commencée n'affiche PAS de frise (repli sur la puce et le mot)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Aucun seed de `ludaskia_paliersOrtho`/`ludaskia_paliersOrthoDepuis` : le journal
	// n'a encore jamais tourné pour ce profil.
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-encours"])');
	await expect(ligne).toBeVisible();
	// Rien à affirmer d'aucune semaine → pas de frise du tout (pas douze blocs creux).
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);
	// La ligne retombe sur ce qu'elle montrait avant d'avoir une frise : la puce d'état…
	await expect(ligne.locator('.enc-detail-puce.enc-key-en-cours')).toBeVisible();
	// … et le mot, qui porte la même information en texte (a11y).
	await expect(ligne.locator('.enc-detail-mot')).toContainText('en cours');

	expect(errors).toEqual([]);
});

/* Amorçage depuis le graphe d'activité (#541) : le cas RÉEL qui l'a motivé — un profil
   déjà utilisateur des dictées au moment où ce journal arrive, sans aucun palier stocké
   ni borne posée. `ludaskia_activity` garde pourtant des séances DATÉES par liste
   (`{k:'dictee', ref}`, #498) : une séance sur cette liste PROUVE qu'elle était « en
   cours » à cette date. `friseListeOrtho` s'en sert pour amorcer le cap « en cours » ET
   la borne de suivi de CETTE ligne — la frise apparaît dès le premier chargement, sans
   attendre une prochaine séance. */
const SEED_ACTIVITE_AMORCE = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify([
    { t: now - 3 * week, k: 'dictee', ref: 'l-e2e-frise-amorce-encours' },
    { t: now - 3 * week, k: 'dictee', ref: 'l-e2e-frise-amorce-acquis' },
  ]));
})();`;

test("amorçage depuis le graphe d'activité : une liste « en cours » sans palier stocké affiche une frise dès la première séance datée", async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Aucun `ludaskia_paliersOrtho` ni borne : seul le graphe d'activité connaît cette liste.
	await page.addInitScript(SEED_ACTIVITE_AMORCE);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator(
		'.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-amorce-encours"])',
	);
	const frise = ligne.locator('.enc-frise');
	await expect(frise).toBeVisible();

	const cells = frise.locator('.enc-frise-cell');
	await expect(cells).toHaveCount(12);
	// Les semaines ANTÉRIEURES à cette première séance (il y a 3 semaines) restent creuses :
	// l'amorçage ne prouve rien avant la date qu'il fournit.
	await expect(cells.first()).toHaveClass(/enc-frise-inconnu/);
	await expect(cells.last()).toHaveClass(/enc-frise-en-cours/);
	await expect(cells.last()).toHaveClass(/enc-frise-courante/);

	expect(errors).toEqual([]);
});

/* Ce que l'amorçage ne fait JAMAIS : dater une acquisition. Une liste déjà maîtrisée avant
   ce journal (état courant « acquis ») n'a AUCUN tampon `acquis` stocké — rien ne permet de
   dater CE franchissement-là, et l'inventer peindrait une semaine au hasard. Elle reste donc
   sans frise (repli sur la puce et le mot), même avec des séances de dictée datées ; elle en
   aura une après sa prochaine séance, qui posera pour de bon le tampon `acquis`. */
test("amorçage depuis le graphe d'activité : une liste déjà « acquise » sans tampon reste sans frise", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_ACTIVITE_AMORCE);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator(
		'.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-amorce-acquis"])',
	);
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);
	await expect(ligne.locator('.enc-detail-puce.enc-key-acquis')).toBeVisible();
	await expect(ligne.locator('.enc-detail-mot')).toContainText('acquis');

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
