/* ============================================================
   Smoke e2e — Numération « Droite graduée » (#256 CM1, #447 CE2).
   Runner d'écran DÉDIÉ (ui/lecon-droite-graduee.ts, hors sprint) : l'enfant lit une
   consigne « Place le nombre X sur la droite graduée. », POSE un repère sur la
   graduation correspondante (tap aimanté OU flèches clavier), puis « Vérifier ».
   Deux leçons sur la même brique : entiers (num-droite-entiers, calibrée CE2 ET
   CM1 depuis #447 — fenêtres de 10/100 sous 10 000 au CE2, plus grandes au CM1)
   et décimaux (num-droite-decimaux, cible à virgule, CM1 seul).

   La cible EST toujours une graduation (data-index/data-valeur/data-label sur
   `.dg-hit`) : on lit le nombre à placer dans #dgConsigne, on en déduit le hit
   correspondant via son `data-label` (identique caractère pour caractère à la
   consigne, y compris la virgule décimale et l'espace fine insécable des grands
   nombres groupés) — jamais recalculé depuis les données aléatoires.

   Aide contextuelle (#272/#435) : `maybeAutoAide('droiteGraduee')` ouvre une bulle
   d'aide (#aideOverlay) au 1er lancement ; on la ferme avant toute interaction,
   comme clic-verbe.spec.ts / appariement.spec.ts.

   Les tests CM1 ci-dessous seedent un profil CM1 dédié (`gotoCM1`, leçons
   `levels: [...]` invisibles sous le niveau CE2 par défaut). Les tests CE2
   (#447, en bas de fichier) utilisent le profil CE2 PAR DÉFAUT de `gotoHash` —
   aucun seed dédié nécessaire.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, leconsDuNiveau } from './helpers';

/* Profil en CM1 (leçons `levels: ['cm1']`, invisibles sous le niveau CE2 par défaut). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

/* Ferme l'aide auto-affichée si présente (1er lancement du profil) ; no-op sinon. */
async function fermerAideSiPresente(page: Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) {
		await page.locator('.aide-ok').click();
		await expect(overlay).toHaveCount(0);
	}
}

/* Extrait le libellé de la cible depuis la consigne (« Place le nombre 3,47 sur la
   droite graduée. » → « 3,47 »), identique caractère pour caractère au `data-label`
   du `.dg-hit` visé (même fonction de formatage côté data et côté consigne). */
async function cibleLabelDepuisConsigne(page: Page): Promise<string> {
	const texte = await page.locator('#dgConsigne').innerText();
	const m = texte.match(/Place le nombre (.+) sur la droite graduée/);
	expect(m).not.toBeNull();
	return m![1];
}

test('CM1 : la catégorie Numération propose les deux leçons « droite graduée »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-math-numeration');
	await expect(page.locator('.lesson-item[data-id="num-droite-entiers"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-droite-decimaux"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('entiers : placement correct au tap → feedback juste, figure de révélation', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-num-droite-entiers'); // mono-mode → lancement direct
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page); // écarte l'auto-aide (#435) avant toute interaction

	await expect(page.locator('#dgVerify')).toBeDisabled();

	const cible = await cibleLabelDepuisConsigne(page);
	const hit = page.locator(`.dg-hit[data-label="${cible}"]`);
	await expect(hit).toHaveCount(1); // la cible est toujours une graduation existante
	await hit.click();

	await expect(page.locator('#dgVerify')).toBeEnabled();
	await page.locator('#dgVerify').click();

	await expect(page.locator('.lqcm-ok')).toBeVisible();
	await expect(page.locator('#dgStatus')).toContainText('Bravo');
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.figure-droite-graduee circle')).toHaveCount(1); // un seul repère (correct)
	// #153 : « Vérifier » s'efface, seul « Continuer ▶ » reste.
	await expect(page.locator('#dgVerify')).toBeHidden();
	await expect(page.locator('#dgActions button')).toBeVisible();
	expect(errors).toEqual([]);
});

test('décimaux : placement correct au tap (cible à virgule) → feedback juste', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-num-droite-decimaux'); // mono-mode → lancement direct
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	const cible = await cibleLabelDepuisConsigne(page);
	expect(cible).toContain(','); // programme CM1 : cible décimale (dixièmes/centièmes)
	const hit = page.locator(`.dg-hit[data-label="${cible}"]`);
	await expect(hit).toHaveCount(1);
	await hit.click();
	await expect(page.locator('#dgVerify')).toBeEnabled();
	await page.locator('#dgVerify').click();

	await expect(page.locator('.lqcm-ok')).toBeVisible();
	expect(errors).toEqual([]);
});

test('clavier : les flèches déplacent le repère, Entrée déclenche la correction', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-num-droite-entiers');
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	// Focus la 1re graduation (seule focusable au départ, tabindex=0 roving), déplace le
	// repère au clavier puis valide — on prouve le CHEMIN clavier, pas la justesse.
	const premierHit = page.locator('.dg-hit[data-index="0"]');
	await premierHit.focus();
	await page.locator('.dg-interactif').press('ArrowRight');
	await expect(page.locator('#dgVerify')).toBeEnabled();
	await page.locator('.dg-interactif').press('Enter');

	await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
	await expect(page.locator('#dgVerify')).toBeHidden();
	expect(errors).toEqual([]);
});

test('placement faux : feedback ko et repères juste/faux révélés', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-num-droite-decimaux');
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	// La cible n'est JAMAIS une borne numérotée (#256 : indices 1-4/6-9 exclus de 0/5/10) →
	// la graduation d'index 0 est toujours un mauvais choix, déterministe.
	await page.locator('.dg-hit[data-index="0"]').click();
	await page.locator('#dgVerify').click();

	await expect(page.locator('.lqcm-ko')).toBeVisible();
	await expect(page.locator('#dgStatus')).toContainText("Ce n'est pas ça");
	// Révélation : le bon repère (vert) + le repère de l'enfant (rouge) sont dessinés.
	await expect(page.locator('.figure-droite-graduee circle')).toHaveCount(2);
	expect(errors).toEqual([]);
});

/* ---------------------------------------------------------------------
   CE2 (#447) — extension multi-niveaux de la leçon ENTIERS uniquement (les
   décimaux restent CM1). Calibration CE2 : fenêtre de 10 graduée en unités OU
   fenêtre de 100 graduée en dizaines, entiers seuls, jamais au-delà de 10 000.
   --------------------------------------------------------------------- */

test('CE2 : la catégorie Numération propose « droite graduée », juste après l’encadrement (#447)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-numeration');
	await expect(page.locator('.lesson-item[data-id="num-droite-entiers"]')).toBeVisible();
	// Ordre pédagogique (src/data/ordre-pedagogique.ts) : juste après l'encadrement/
	// intercalation, dont elle réutilise la logique de comptage de crans (avis pédagogue).
	const ordre = leconsDuNiveau('math', 'ce2');
	const iCible = ordre.indexOf('num-droite-entiers');
	expect(iCible).toBeGreaterThan(0);
	expect(ordre[iCible - 1]).toBe('num-encadrer-intercaler');
	expect(errors).toEqual([]);
});

test('CE2 entiers : placement correct au tap → feedback juste (fenêtre sous 10 000, jamais décimale)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Profil CE2 par défaut de gotoHash (cf. helpers.ts) : mono-mode → lancement direct.
	await gotoHash(page, 'lecon-num-droite-entiers');
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page); // écarte l'auto-aide (#435) avant toute interaction

	await expect(page.locator('#dgVerify')).toBeDisabled();

	const cible = await cibleLabelDepuisConsigne(page);
	expect(cible).not.toContain(','); // CE2 : entiers seuls, les décimaux restent CM1 (#447)
	const hit = page.locator(`.dg-hit[data-label="${cible}"]`);
	await expect(hit).toHaveCount(1); // la cible est toujours une graduation existante
	await hit.click();

	await expect(page.locator('#dgVerify')).toBeEnabled();
	await page.locator('#dgVerify').click();

	await expect(page.locator('.lqcm-ok')).toBeVisible();
	await expect(page.locator('#dgStatus')).toContainText('Bravo');
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.figure-droite-graduee circle')).toHaveCount(1); // un seul repère (correct)
	await expect(page.locator('#dgVerify')).toBeHidden();
	expect(errors).toEqual([]);
});

test('CE2 lecture (repli bilan hors runner) : repère déjà posé, le champ se corrige avec data-answer', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Hors du runner dédié (isDroiteGradueeLesson exclut la leçon du sprint), le composeur
	// de bilan personnalisé scopé à cette SEULE leçon (#64, cf. README) exerce le repli
	// LECTURE de genLessonItem : la droite est montrée avec le repère déjà posé à la cible,
	// et la réponse attendue est le nombre lu (kind « num » générique → champ `.ans`).
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-droite-entiers"]').check();
	await expect(page.locator('.bc-mode-radio[value="bilan"]')).toBeChecked(); // pas sprint
	await page.locator('#bcRun').click();

	const field = page.locator('.ans').first();
	await field.waitFor();
	// Le repère (neutre, à lire) est déjà dessiné, contrairement au runner interactif.
	await expect(
		page.locator('.figure-droite-graduee circle[data-etat="neutre"]').first(),
	).toBeVisible();

	const expected = await field.getAttribute('data-answer');
	expect(expected).toBeTruthy();
	await field.fill(expected ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

/* Pas de verrou PIN hérité d'un test précédent (même garde que erreurs-encadrant.spec.ts). */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Round-trip journal d'erreurs (#391, remonté par relecture qualité sur #447) : le mode
   « placer » (ui/lecon-droite-graduee.ts#journaliser) journalise un énoncé enrichi de la
   FENÊTRE affichée (« La droite va de X à Y. ») et passe `figure` (marqueur « (exercice
   avec dessin) », cf. erreur-capture.ts). Rien ne le vérifiait : la fonction est privée au
   module ui/, donc hors de portée de Vitest sans DOM. Même structure que les round-trips de
   erreurs-encadrant.spec.ts (CLEAR_PIN, navigation #encadrant, sélecteurs .enc-err-*), gardé
   ici pour réutiliser fermerAideSiPresente/cibleLabelDepuisConsigne déjà en place. */
test('CE2 round-trip journal (#447) : un placement faux remonte la fenêtre et le marqueur de figure', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'lecon-num-droite-entiers');
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	// Fenêtre affichée (les bornes numérotées min…max), lue depuis l'axe interactif —
	// jamais recalculée depuis les données aléatoires. `.dg-axe` disparaît après Vérifier
	// (figure de révélation) : à lire AVANT de cliquer.
	// `.allTextContents()`, pas `.allInnerTexts()` : les `<text>` SVG n'exposent pas
	// `innerText` (propriété HTML), seulement `textContent`.
	const bornesTexte = await page.locator('.dg-axe text').allTextContents();
	expect(bornesTexte.length).toBeGreaterThanOrEqual(2);
	const de = bornesTexte[0];
	const a = bornesTexte[bornesTexte.length - 1];
	const cible = await cibleLabelDepuisConsigne(page);

	// La graduation d'indice 0 (une borne, jamais la cible) : choix faux déterministe.
	await page.locator('.dg-hit[data-index="0"]').click();
	await page.locator('#dgVerify').click();
	await expect(page.locator('.lqcm-ko')).toBeVisible();

	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	await expect(lecon.locator('.enc-err-q').first()).toContainText(
		`Place le nombre ${cible} sur la droite graduée. La droite va de ${de} à ${a}. (exercice avec dessin)`,
	);
	await expect(lecon.locator('.enc-err-bonne').first()).toContainText(cible);
	await expect(lecon.locator('.enc-err-donnee').first()).toContainText(de); // la borne cliquée (indice 0)
	expect(errors).toEqual([]);
});
