/* ============================================================
   Étape « Un bilan favori » du programme du jour (#636) — smoke tests e2e.
   ------------------------------------------------------------
   Écrits AVANT l'implémentation (skill /cadrer) : ROUGES à l'arrivée, à
   l'exception du critère 14 (déjà satisfait). Couvre les critères 1-4 et 6-8
   de l'issue #636 (composer l'étape côté encadrant, la faire côté enfant).
   Les critères 5, 9-11 sont tenus au cœur en Vitest par un autre agent ; les
   critères 12-15 (déplacement de la suppression) vivent dans
   `favori-suppression-encadrant.spec.ts`.

   Contrat d'écran visé (décidé avec le mainteneur, cf. issue) :
   - mode `favori` dans le sélecteur d'ajout, libellé « Un bilan favori » ;
   - `fieldset.enc-seance-favoris[data-def][data-etape]`, cases
     `input[data-act="seance-favori-toggle"][data-def][data-etape][data-ref]`,
     chacune dans un `label.enc-seance-favori` qui nomme le favori ET son mode
     lisible (« Bilan » / « Sprint 5 min ») ;
   - repère `p.enc-seance-favoris-hint` (dit explicitement l'absence de favori) ;
   - côté enfant : titre générique du cas « pool » = « Mes bilans favoris »
     (vocabulaire déjà affiché à l'enfant par `renderFavoris`, #230 : jamais
     « bilan » seul, abstrait pour un CE2).

   Comme `programme-dictee-pool.spec.ts` / `programme-dictee-sans-cible.spec.ts` :
   mêmes helpers, même pattern watchErrors, seed direct de `ludaskia_seance` /
   `ludaskia_bilans` pour les scénarios côté enfant (le compositeur ne sachant pas
   encore composer une étape « favori », impossible de la faire naître par l'UI).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Leçon réelle du catalogue CE2, reprise du repère de plusieurs autres specs
   (mono-mode, fiche de 12 items) : peu importe ici, seul le LABEL du favori
   compte pour les assertions. */
const LESSON_ID = 'math-complements';

interface BilanFavoriSeed {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	mode: 'bilan' | 'sprint';
}

function favori(id: string, label: string, mode: 'bilan' | 'sprint'): BilanFavoriSeed {
	return { id, label, lessonIds: [LESSON_ID], questionsPerLesson: 3, mode };
}

/* Seed direct de `ludaskia_bilans` (favoris) SEUL, pour le profil par défaut
   'e2e' — compositeur encadrant (critères 1, 3, 4). */
function seedBilansScript(bilans: BilanFavoriSeed[]): string {
	return `localStorage.setItem('e2e/ludaskia_bilans', ${JSON.stringify(JSON.stringify(bilans))});`;
}

/* Seed direct de `ludaskia_bilans` ET `ludaskia_seance` (une définition d1 avec
   une seule étape e1, kind 'favori', pool `refs`) pour le profil 'e2e' —
   scénarios côté enfant (critères 6, 7, 8). Le compositeur ne pouvant pas
   encore créer ce type d'étape, on la pose directement en stockage, comme
   `seedProgrammeLeconPlusDicteeOrpheline` dans programme-dictee-sans-cible.spec.ts. */
function seedFavorisEtProgrammeScript(bilans: BilanFavoriSeed[], refs: string[]): string {
	const defs = [
		{
			id: 'd1',
			etapes: [{ id: 'e1', kind: 'favori', refs, count: 1 }],
			recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
		},
	];
	return `(function(){
		localStorage.setItem('e2e/ludaskia_bilans', ${JSON.stringify(JSON.stringify(bilans))});
		localStorage.setItem('e2e/ludaskia_seance', ${JSON.stringify(JSON.stringify(defs))});
	})();`;
}

/* ---------- Critère 1 : le mode apparaît dans le sélecteur d'ajout ---------- */

test('critère 1 : « + Ajouter une activité… » propose « Un bilan favori »', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	const option = page.locator(
		'select[data-act="seance-etape-add"][data-def="d1"] option[value="favori"]',
	);
	// Échec attendu tant que le mode n'existe pas : la liste des modes est inchangée
	// (5 options : sprint/révision/à revoir/leçon du jour/leçon précise/dictée).
	await expect(option).toHaveCount(1);
	await expect(option).toHaveText('Un bilan favori');

	expect(errors).toEqual([]);
});

/* ---------- Critère 2 : favoris du profil CONSULTÉ, pas de l'actif ---------- */

const PROFIL_A = 'e2e-a';
const PROFIL_B = 'e2e-b';

test('critère 2 : l’étape propose les favoris du profil CONSULTÉ (B), pas ceux de l’actif (A)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	// Actif = A. On seed aussi des favoris différents pour A, pour vérifier qu'ils ne
	// fuitent PAS dans l'étape composée pour B (sans quoi ce test passerait même avec
	// un `loadBilans()` non corrigé, lu sur le profil actif plutôt que le consulté).
	await page.addInitScript(
		(seed) => {
			localStorage.setItem('ludaskia_profiles', JSON.stringify(seed.profils));
			localStorage.setItem(`${seed.a}/ludaskia_bilans`, JSON.stringify(seed.bilansA));
			localStorage.setItem(`${seed.b}/ludaskia_bilans`, JSON.stringify(seed.bilansB));
		},
		{
			profils: {
				list: [
					{ uuid: PROFIL_A, name: 'Profil A', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
					{ uuid: PROFIL_B, name: 'Profil B', emoji: '🐨', updatedAt: 1, niveauReference: 'ce2' },
				],
				active: PROFIL_A,
			},
			a: PROFIL_A,
			b: PROFIL_B,
			bilansA: [favori('fav-a1', 'Favori A1', 'bilan')],
			bilansB: [favori('fav-b1', 'Favori B1', 'bilan'), favori('fav-b2', 'Favori B2', 'sprint')],
		},
	);
	await gotoHash(page, 'encadrant/programme');

	// A est actif, mais on COMPOSE pour B : bascule du profil consulté AVANT d'ajouter
	// l'étape (encConsulteSel, même sélecteur qu'encadrant-banque.spec.ts).
	const sel = page.locator('#encConsulteSel');
	await sel.selectOption(PROFIL_B);
	await expect(sel).toHaveValue(PROFIL_B);

	await page.locator('[data-act="seance-add"]').click();
	await page
		.locator('select[data-act="seance-etape-add"][data-def="d1"]')
		.selectOption('favori', { timeout: 5000 });

	const fieldset = page.locator('fieldset.enc-seance-favoris[data-def="d1"][data-etape="e1"]');
	await expect(fieldset).toBeVisible();
	await expect(fieldset.locator('label.enc-seance-favori')).toHaveCount(2);
	await expect(fieldset).toContainText('Favori B1');
	await expect(fieldset).toContainText('Favori B2');
	await expect(fieldset).not.toContainText('Favori A1');

	expect(errors).toEqual([]);
});

/* ---------- Critère 3 : les deux modes proposés, chacun lisible ---------- */

test('critère 3 : la liste propose les favoris des deux modes, chacun avec son mode lisible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	// Noms SANS le mot « Bilan »/« Sprint » dedans : sinon l'assertion sur le mode
	// lisible passerait trivialement en lisant le NOM du favori, pas l'étiquette de mode.
	await page.addInitScript(
		seedBilansScript([
			favori('fav-t', 'Tables de multiplication', 'bilan'),
			favori('fav-f', 'Flash calcul', 'sprint'),
		]),
	);
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	await page
		.locator('select[data-act="seance-etape-add"][data-def="d1"]')
		.selectOption('favori', { timeout: 5000 });

	const fieldset = page.locator('fieldset.enc-seance-favoris[data-def="d1"][data-etape="e1"]');
	const ligneBilan = fieldset.locator('label.enc-seance-favori', {
		hasText: 'Tables de multiplication',
	});
	const ligneSprint = fieldset.locator('label.enc-seance-favori', { hasText: 'Flash calcul' });
	await expect(ligneBilan).toContainText('Bilan');
	await expect(ligneSprint).toContainText('Sprint 5 min');

	expect(errors).toEqual([]);
});

/* ---------- Critère 4 : profil sans aucun favori -> message explicite ---------- */

test('critère 4 : un profil sans aucun favori le dit dans l’étape', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedBilansScript([]));
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	await page
		.locator('select[data-act="seance-etape-add"][data-def="d1"]')
		.selectOption('favori', { timeout: 5000 });

	// Cadre vide et MUET = échec : on exige un texte non vide, spécifique au favori
	// (pas le repère générique d'une autre étape recyclé tel quel).
	const hint = page.locator('p.enc-seance-favoris-hint');
	await expect(hint).toHaveText(/\S/);
	await expect(hint).toContainText(/favori/i);
	await expect(
		page.locator('fieldset.enc-seance-favoris input[data-act="seance-favori-toggle"]'),
	).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- Critères 6 et 7 : pool à UN SEUL favori (nommage + mode respecté) ---------- */

test('critères 6+7 : pool à un seul favori BILAN — la tuile le nomme, le lancement ouvre le bilan', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		seedFavorisEtProgrammeScript([favori('fav-1', 'Tables de 7', 'bilan')], ['fav-1']),
	);
	await gotoHash(page, 'seance');

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	await expect(tuile.locator('.programme-tuile-titre')).toHaveText('Tables de 7');

	await tuile.click();
	// Le mode BILAN du favori tiré ouvre l'écran de bilan (rendu direct dans #sheets,
	// comme runBilanConfig ; #seance disparaît, cf. hideMenus dans navigation.ts).
	await expect(page.locator('#seance')).toBeHidden();
	await expect(page.locator('#sheets .bilan-title')).toHaveText('Tables de 7');

	expect(errors).toEqual([]);
});

test('critères 6+7 : pool à un seul favori SPRINT — la tuile le nomme, le lancement ouvre le sprint personnalisé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		seedFavorisEtProgrammeScript([favori('fav-2', 'Sprint révisions', 'sprint')], ['fav-2']),
	);
	await gotoHash(page, 'seance');

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	await expect(tuile.locator('.programme-tuile-titre')).toHaveText('Sprint révisions');

	await tuile.click();
	// Échec du critère 7 tel que constaté aujourd'hui : un favori sprint ne doit PAS
	// ouvrir l'écran de bilan — il doit lancer le sprint personnalisé (#sprint, #sprintStage).
	await expect(page).toHaveURL(/#sprint$/);
	await expect(page.locator('#sprintStage')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- Critères 6 et 8 : pool à DEUX favoris ou plus (titre générique + tirage) ---------- */

test('critères 6+8 : pool à deux favoris — titre générique « Mes bilans favoris », un favori est tiré au lancement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		seedFavorisEtProgrammeScript(
			[favori('fav-3', 'Favori Trois', 'bilan'), favori('fav-4', 'Favori Quatre', 'bilan')],
			['fav-3', 'fav-4'],
		),
	);
	await gotoHash(page, 'seance');

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	// Titre générique = vocabulaire DÉJÀ affiché à l'enfant (titre de section de
	// `renderFavoris`, src/ui/bilan.ts:530) — jamais « bilan » seul, abstrait pour un CE2
	// (choix acté #230). Le libellé exact est donc intentionnel ici, pas un simple non-vide.
	await expect(tuile.locator('.programme-tuile-titre')).toHaveText('Mes bilans favoris');

	await tuile.click();
	// Un favori du pool a bien été tiré ET lancé (peu importe lequel : le tirage est
	// aléatoire) — la tuile n'annonce jamais un favori pour en lancer un autre.
	await expect(page.locator('#sheets .bilan-title')).toHaveText(/Favori (Trois|Quatre)/);

	expect(errors).toEqual([]);
});
