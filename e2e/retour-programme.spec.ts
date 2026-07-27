/* ============================================================
   Smoke e2e — retour au programme en fin d'activité (#461).
   Une leçon lancée DEPUIS le programme du jour (écran #seance) doit, à sa fin,
   proposer un retour vers #seance (« Retour au programme ») plutôt que vers la
   catégorie de la leçon. Couvre les deux familles d'écran de fin :
   - fiche/saisie (bandeau de session.ts, bouton #btnBackCategorie) ;
   - runner « une question à la fois » (QCM/tuiles/…, lecon-runner-shared.ts,
     bouton #leconBack).
   La non-régression « hors programme → retour catégorie inchangé » est déjà
   couverte par retours-navigation.spec.ts (test « fin de leçon (saisie) »).

   Couvre aussi deux chemins supplémentaires, toujours dans le périmètre #461 :
   - une étape « dictée » (parité leçon/dictée : `startOrthoLecon` reçoit la même
     origine) — chemin le plus court et déterministe : une liste MAISON déjà
     DÉCOUVERTE (atelierFait: true sur son unique mot, seedée en localStorage comme
     `suivi-dictees-encadrant.spec.ts`) saute directement l'atelier de découverte et
     atterrit sur l'écran de choix de mode (#ortho-mode-<id>) ; « Relire mes mots »
     (#btnRevoir) y mène à la page de relecture (#relRetour), le chemin le plus court
     vers un écran de fin d'activité ortho — la pause (8 activités) et le bilan de fin
     de découverte demanderaient de jouer une séance complète, hors smoke test ;
   - une leçon MULTI-MODE (`showModeChoice` dans navigation.ts) : l'écran de choix de
     mode (#mode-<id>, `.mode-btn`) est un DÉTOUR du lancement, pas un nouveau
     lancement — il ne réinitialise pas l'origine posée par startLecon, qui reste donc
     « programme » jusqu'à l'écran de fin.

   Mise en place du programme : on pilote la vraie UI encadrant (comme
   programme-du-jour.spec.ts), avec une étape « Une leçon précise » (ou « Une
   dictée ») ciblant une cible connue plutôt qu'un sprint. Étape à ×2 (au lieu de
   ×1) : sinon `resoudrePending` (appelé au retour vers #seance) créditerait la
   seule étape du programme et #seance basculerait en écran « programme fini »
   (célébration), masquant les tuiles — on veut rester dans le cas nominal,
   #seance visible avec l'étape encore lançable.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Crée, via l'UI réelle du compositeur, un programme (d1) avec UNE étape
   « Une leçon précise » (e1) ciblant `lessonId`, comptée `count` fois, et une
   récurrence hebdomadaire sur les 7 jours (s'applique quel que soit le jour
   d'exécution du test). Laisse la page sur #encadrant/programme. */
async function creerProgrammeLeconTousLesJours(
	page: Page,
	lessonId: string,
	count: number,
): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('lecon');
	await page
		.locator('select[data-act="seance-ref"][data-def="d1"][data-etape="e1"]')
		.selectOption(lessonId);
	if (count !== 1) {
		await page
			.locator('select[data-act="seance-count"][data-def="d1"][data-etape="e1"]')
			.selectOption(String(count));
	}
	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
}

/* Crée, via l'UI réelle du compositeur, un programme (d1) avec UNE étape
   « Une dictée » (e1) ciblant EXCLUSIVEMENT `listeId` (le pool par défaut cible la
   1re dictée prédéfinie du catalogue : on la décoche pour ne garder que la nôtre,
   afin que le tirage `tirerCible` soit déterministe), comptée `count` fois, et une
   récurrence hebdomadaire sur les 7 jours. Laisse la page sur #encadrant/programme. */
async function creerProgrammeDicteeTousLesJours(
	page: Page,
	listeId: string,
	count: number,
): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('dictee');
	const fieldset = page.locator('fieldset.enc-seance-dictees[data-def="d1"][data-etape="e1"]');
	await expect(fieldset).toBeVisible();
	// Un simple .click() (pas .check()/.uncheck()) : ces derniers re-vérifient l'état après
	// coup en repassant par la même requête CSS `:checked`, or chaque bascule RE-REND le
	// fieldset (nouveaux nœuds DOM) — la vérification interne de Playwright peut alors
	// reboucler indéfiniment (cf. programme-du-jour.spec.ts, même piège avec .check()).
	const defautCoche = fieldset.locator('input[data-act="seance-dictee-toggle"]:checked');
	await expect(defautCoche).toHaveCount(1);
	await defautCoche.click(); // décoche la dictée prédéfinie par défaut
	const cible = fieldset.locator(`input[data-act="seance-dictee-toggle"][data-ref="${listeId}"]`);
	await cible.click(); // coche NOTRE liste
	await expect(cible).toBeChecked();
	if (count !== 1) {
		await page
			.locator('select[data-act="seance-count"][data-def="d1"][data-etape="e1"]')
			.selectOption(String(count));
	}
	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
}

/* Depuis l'espace encadrant (programme composé), retourne à l'accueil enfant
   puis lance la 1re (seule) tuile du programme. */
async function retourEtLancerTuile(page: Page): Promise<void> {
	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();
	await page.locator('#cardProgramme').click();
	await expect(page).toHaveURL(/#seance$/);
	await page.locator('.programme-tuile[data-act="lancer"]').first().click();
}

test('leçon (saisie) lancée depuis le programme : « Retour au programme » ramène à #seance', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await creerProgrammeLeconTousLesJours(page, 'math-tables-addition', 2);
	await retourEtLancerTuile(page);
	await expect(page).toHaveURL(/#lecon-math-tables-addition$/);

	// Remplit toutes les réponses correctement pour terminer la leçon.
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const count = await fields.count();
	for (let i = 0; i < count; i++) {
		const ans = (await fields.nth(i).getAttribute('data-answer')) ?? '';
		await fields.nth(i).fill(ans);
	}
	await page.locator('#btnVerify').click();
	// Un sans-faute peut déclencher la modale de niveau (puis célébration) : la
	// fermer avant d'atteindre le bandeau, sinon elle intercepte les clics.
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}

	const back = page.locator('#btnBackCategorie');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour au programme/);
	await back.click();

	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-tuile').first()).toBeVisible();
	expect(errors).toEqual([]);
});

/* Liste de dictée « maison » déjà DÉCOUVERTE (atelierFait: true sur son unique mot,
   même seed que suivi-dictees-encadrant.spec.ts) : le clic sur la tuile programme
   saute directement l'atelier de découverte et atterrit sur l'écran de choix de
   mode (#ortho-mode-<id>), pas sur l'atelier. */
const DICTEE_LISTE_ID = 'l-e2e-programme-dictee';
const SEED_ORTHO_DECOUVERTE = {
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
	},
	listes: [
		{ id: DICTEE_LISTE_ID, label: 'Ma liste maison', motIds: ['w1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { cahier: 'w1' },
};

test('dictée lancée depuis le programme : « Relire mes mots » → « Retour au programme » ramène à #seance', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_ORTHO_DECOUVERTE);
	await creerProgrammeDicteeTousLesJours(page, DICTEE_LISTE_ID, 2);
	await retourEtLancerTuile(page);
	await expect(page).toHaveURL(new RegExp(`#ortho-mode-${DICTEE_LISTE_ID}$`));
	await expect(page.locator('.mode-choice-title')).toBeVisible();

	// « Relire mes mots » : détour d'étude passive, pas un nouveau lancement — garde
	// l'origine « programme » posée par startOrthoLecon.
	await page.locator('#btnRevoir').click();
	await expect(page).toHaveURL(new RegExp(`#ortho-revoir-${DICTEE_LISTE_ID}$`));

	const back = page.locator('#relRetour');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour au programme/);
	await back.click();

	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-tuile').first()).toBeVisible();
	expect(errors).toEqual([]);
});

/* Leçon MULTI-MODE (#253) : CM1 uniquement, 2 modes (Vrai/Faux QCM + Coche multi-
   sélection). Profil CM1 seedé comme angles-cm1.spec.ts / geo-cm1-figures-proprietes.spec.ts. */
const SEED_CM1 = `(() => {
	localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));
})();`;

test('leçon MULTI-MODE lancée depuis le programme : l’écran de choix de mode propage l’origine, « Retour au programme » ramène à #seance', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	await creerProgrammeLeconTousLesJours(page, 'geo-cm1-figures-proprietes', 2);
	await retourEtLancerTuile(page);

	// Lancé depuis le programme, une leçon multi-mode passe par l'écran de CHOIX
	// de mode (#mode-<id>) — pas directement par #lecon-<id> comme les mono-mode.
	await expect(page).toHaveURL(/#mode-geo-cm1-figures-proprietes$/);
	const modeBtns = page.locator('.mode-btn');
	await expect(modeBtns).toHaveCount(2);
	await page.locator('.mode-btn[data-mode="qcm"]').click();
	await expect(page).toHaveURL(/#lecon-geo-cm1-figures-proprietes$/);

	// Mode Vrai/Faux : 2 choix, enchaîne les 8 questions jusqu'à l'écran de résultat.
	const choices = page.locator('.sprint-choice');
	for (let i = 0; i < 8; i++) {
		await expect(choices.first()).toBeVisible();
		await choices.first().click();
		await page.locator('#lqcmActions button').click();
	}
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}

	const back = page.locator('#leconBack');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour au programme/);
	await back.click();

	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-tuile').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('leçon (runner QCM) lancée depuis le programme : « Retour au programme » ramène à #seance', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await creerProgrammeLeconTousLesJours(page, 'geo-angles', 2);
	await retourEtLancerTuile(page);
	await expect(page).toHaveURL(/#lecon-geo-angles$/);

	// Enchaîne les 8 questions du runner QCM jusqu'à l'écran de résultat (le
	// nombre de choix varie selon la question tirée, ≥ 2 — on ne dépend que du
	// 1er choix, quelle que soit la famille aléatoire).
	const choices = page.locator('.sprint-choice');
	for (let i = 0; i < 8; i++) {
		await expect(choices.first()).toBeVisible();
		await choices.first().click();
		await page.locator('#lqcmActions button').click();
	}
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}

	const back = page.locator('#leconBack');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour au programme/);
	await back.click();

	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-tuile').first()).toBeVisible();
	expect(errors).toEqual([]);
});
