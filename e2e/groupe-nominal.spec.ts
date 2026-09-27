/* ============================================================
   Smoke e2e — « Repère le groupe nominal » (#716), CM1 uniquement.

   Écrite AVANT l'implémentation (aucun code applicatif n'existe encore pour
   cette leçon) : elle sert de SPÉCIFICATION, dérivée de l'issue #716 et du
   contrat DOM qui y est fixé — jamais du code, qui n'existe pas. Elle DOIT
   être rouge tant que la leçon n'est pas branchée au catalogue.

   Id de leçon : fr-gram-groupe-nominal, mode unique 'segment' → lancement
   DIRECT (`lecon-fr-gram-groupe-nominal`, pas d'écran de choix de mode, comme
   les leçons mono-mode de clic-mot-natures.spec.ts / chiffres-romains.spec.ts).
   CM1 uniquement : profil seedé en CM1 (SEED_CM1, copié TEL QUEL de
   chiffres-romains.spec.ts) + `gotoHash` habituel — `gotoHash` ne réécrit le
   niveau qu'à défaut d'un `niveauReference` déjà posé (cf. ENSURE_NIVEAU dans
   helpers.ts), donc pas besoin d'une navigation « à froid » ni d'un
   `gotoCM1` dédié.

   Runner réutilisé : ui/lecon-clic-mot.ts (CHROME inchangé, cf. #716) →
   `.lclic-consigne`, `#lclicVerif`, `#lclicFeedback`, `#lclicActions`,
   `#leconPasser` (« Je ne sais pas, montre-moi ») restent les sélecteurs de
   clic-mot-natures.spec.ts, y compris le feedback `.lqcm-ok`/`.lqcm-ko` +
   `.lqcm-expl` de la même fonction `verifier()`. Le WIDGET, lui, est neuf et
   préfixé `lseg` (cf. contrat DOM de l'issue) : `.lseg-phrase`,
   `button.lseg-mot[data-i]`, `.lseg-ponct`, `.est-ancre`, `.dans-bloc` (+
   `.bloc-debut`/`.bloc-fin`), `#lsegReset`, `#lsegStatus`, et après Vérifier
   `.correct`/`.wrong`/`.is-cible` + pastille `.lseg-mark`.

   Deux choix méthodologiques, à connaître avant de lire les tests :

   1. AUCUN `data-answer` n'est exposé sur ce widget (comme `.lclic-mot` avant
      lui, cf. le commentaire de NOM_CE2_TRIPLES dans clic-mot-natures.spec.ts
      : a11y voulue, anti-suggestion) et la banque de phrases n'existe pas
      encore — impossible de la recopier ici. Toute assertion qui a besoin
      d'un verdict connu À L'AVANCE s'appuie donc sur UN SEUL fait garanti par
      la nature de l'exercice, indépendant du tirage : un groupe nominal ne
      couvre JAMAIS la phrase entière (il reste toujours au moins le verbe
      après lui) → sélectionner TOUTE la phrase est TOUJOURS faux. C'est le
      seul verdict que cette spec ose prédire.
   2. Plancher de 3 mots sélectionnables par phrase (`ouvrirEtMots`), posé en
      dur : nécessaire pour qu'un bloc à trois éléments (ancre + 2 mots) et
      une « frappe déjà dans le bloc » aient un sens. Hypothèse pédagogique
      (pas un fait du contrat) : l'exemple de l'issue (« Le petit chat noir
      dort. ») et l'objet même de la leçon — donner un début ET une fin à
      trouver — rendent improbable une phrase à un seul mot de GN suivi d'un
      seul verbe. Si la banque finit par produire des phrases plus courtes,
      cette assertion le dira (elle ne doit pas être affaiblie en silence).
   ============================================================ */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

const LECON_ID = 'fr-gram-groupe-nominal';
const LECON_HASH = `lecon-${LECON_ID}`;

/* Profil CM1 sans popup d'onboarding (niveauReference déjà fixé) — copié TEL
   QUEL de chiffres-romains.spec.ts (#717) : même patron, pas de raison d'en
   refaire un troisième avant qu'il n'y ait un vrai partage (cf. e2e/README.md). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

/* Ferme l'aide auto-affichée si présente (1er lancement, profil neuf), quelle
   que soit la clé qu'elle utilise — no-op sinon. */
async function fermerAideSiPresente(page: Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) {
		await page.locator('.aide-ok').click();
		await expect(overlay).toHaveCount(0);
	}
}

/* Ouvre la leçon (lancement direct, mono-mode) et renvoie les mots
   sélectionnables. `seedAideVue` neutralise l'aide si elle réutilise la clé
   'clicMot' (même famille de runner) ; `fermerAideSiPresente` est le filet si
   une NOUVELLE clé d'aide est introduite pour ce widget. */
async function ouvrirEtMots(page: Page): Promise<Locator> {
	await seedAideVue(page);
	await gotoHash(page, LECON_HASH);
	await expect(page.locator('.lseg-phrase')).toBeVisible();
	const mots = page.locator('.lseg-mot');
	await mots.first().waitFor();
	await fermerAideSiPresente(page);
	const n = await mots.count();
	expect(
		n,
		'une phrase de cette leçon doit compter au moins 3 mots cliquables (groupe nominal + verbe) — cf. hypothèse §2 en tête de fichier',
	).toBeGreaterThanOrEqual(3);
	return mots;
}

test('la leçon « Repère le groupe nominal » apparaît en Grammaire (CM1)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-grammaire');
	await expect(page.locator(`[data-id="${LECON_ID}"]`)).toBeVisible();
	expect(errors).toEqual([]);
});

test('critère 1 : la phrase arrive entière et NON marquée, Vérifier désactivé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirEtMots(page);
	// Mutation qui ferait rougir ce test : pré-sélectionner le groupe au montage
	// (poser `.dans-bloc`/`.correct` avant toute frappe) — l'enfant ne ferait alors
	// que confirmer un groupe déjà tracé, ce que le critère 1 interdit explicitement.
	await expect(page.locator('.lseg-mot.est-ancre')).toHaveCount(0);
	await expect(page.locator('.lseg-mot.dans-bloc')).toHaveCount(0);
	await expect(page.locator('.lseg-mot.correct, .lseg-mot.wrong, .lseg-mot.is-cible')).toHaveCount(
		0,
	);
	await expect(page.locator('#lclicVerif')).toBeDisabled();
	expect(errors).toEqual([]);
});

test('poser seulement l’ancre (une frappe) laisse Vérifier désactivé', async ({ page }) => {
	const errors = watchErrors(page);
	const mots = await ouvrirEtMots(page);
	await mots.nth(0).click();
	// Mutation qui ferait rougir ce test : activer Vérifier dès la première frappe
	// (avant que le bloc ne soit fermé) — l'enfant pourrait valider une simple ancre.
	await expect(mots.nth(0)).toHaveClass(/est-ancre/);
	await expect(page.locator('#lclicVerif')).toBeDisabled();
	// La live region existe et annonce déjà quelque chose (contrat DOM #lsegStatus,
	// « l'étape en cours ») : on ne fige pas le libellé, seulement sa présence.
	const annonce = ((await page.locator('#lsegStatus').textContent()) ?? '').trim();
	expect(annonce.length).toBeGreaterThan(0);
	expect(errors).toEqual([]);
});

test('critère 3 (cœur) : deux frappes sur des mots NON voisins ferment un bloc qui inclut aussi le mot entre les deux', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const mots = await ouvrirEtMots(page);
	// Mutation qui ferait rougir ce test : ne marquer `.dans-bloc` QUE sur les deux
	// mots réellement tapés (index 0 et 2), sans le mot du milieu (index 1) — c'est
	// exactement ce que le geste « deux frappes-bornes » doit rendre impossible :
	// désigner deux mots séparés par un troisième.
	await mots.nth(0).click(); // pose l'ancre
	await mots.nth(2).click(); // ferme le bloc — le mot 1, jamais tapé, doit s'y trouver
	await expect(mots.nth(0)).toHaveClass(/dans-bloc/);
	await expect(mots.nth(1)).toHaveClass(/dans-bloc/); // le cœur de la garantie
	await expect(mots.nth(2)).toHaveClass(/dans-bloc/);
	await expect(mots.nth(0)).toHaveClass(/bloc-debut/);
	await expect(mots.nth(2)).toHaveClass(/bloc-fin/);
	await expect(page.locator('#lclicVerif')).toBeEnabled();
	expect(errors).toEqual([]);
});

test('une 3e frappe, bloc déjà fermé, repart d’une nouvelle ancre (l’ancien bloc est effacé)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const mots = await ouvrirEtMots(page);
	await mots.nth(0).click();
	await mots.nth(2).click(); // bloc [0,1,2] fermé
	await expect(page.locator('.lseg-mot.dans-bloc')).toHaveCount(3);

	// 3e frappe SUR UN MOT DÉJÀ DANS L'ANCIEN BLOC (index 1) : le contrat ne
	// réserve pas cette remise à zéro aux mots extérieurs au bloc — « taper
	// encore, alors qu'un bloc est posé » suffit, quel que soit le mot tapé.
	await mots.nth(1).click();
	// Mutation qui ferait rougir ce test : ignorer la 3e frappe tant qu'un bloc est
	// posé, ou la traiter comme une (dé)sélection À L'INTÉRIEUR de l'ancien bloc au
	// lieu d'en repartir — le contrat exige un effacement total, ancre comprise.
	await expect(page.locator('.lseg-mot.dans-bloc')).toHaveCount(0);
	await expect(mots.nth(1)).toHaveClass(/est-ancre/);
	await expect(page.locator('#lclicVerif')).toBeDisabled();
	expect(errors).toEqual([]);
});

test('« Recommencer » efface la sélection en cours', async ({ page }) => {
	const errors = watchErrors(page);
	const mots = await ouvrirEtMots(page);
	await mots.nth(0).click();
	await mots.nth(2).click();
	await expect(page.locator('.lseg-mot.dans-bloc')).toHaveCount(3);

	await page.locator('#lsegReset').click();
	// Mutation qui ferait rougir ce test : un bouton « Recommencer » posé sans effet
	// (pas de handler câblé, ou un handler qui ne vide pas l'état du widget).
	await expect(page.locator('.lseg-mot.dans-bloc, .lseg-mot.est-ancre')).toHaveCount(0);
	await expect(page.locator('#lclicVerif')).toBeDisabled();
	expect(errors).toEqual([]);
});

test('la ponctuation n’est jamais sélectionnable', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirEtMots(page);
	const ponct = page.locator('.lseg-ponct');
	expect(await ponct.count()).toBeGreaterThanOrEqual(1); // au moins le point final
	// Mutation qui ferait rougir ce test : rendre la ponctuation cliquable (un
	// bouton `.lseg-mot` posé sur le signe) — le contrat l'interdit explicitement.
	await expect(page.locator('.lseg-ponct.lseg-mot')).toHaveCount(0);
	await ponct.first().click({ force: true }); // force : un span inerte n'est pas « actionnable »
	await expect(page.locator('.lseg-mot.est-ancre')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('critère 2 et critère 6 : sélectionner toute la phrase est faux, et le groupe attendu est montré en entier', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const mots = await ouvrirEtMots(page);
	const n = await mots.count();

	// Sélection de TOUTE la phrase (ancre sur le 1er mot, fermeture sur le
	// dernier) : un groupe nominal ne couvre jamais la phrase entière (il reste
	// toujours au moins le verbe après lui), donc cette réponse est TOUJOURS
	// fausse, quel que soit l'item tiré — cf. hypothèse §1 en tête de fichier.
	await mots.first().click();
	await mots.last().click();
	await expect(page.locator('.lseg-mot.dans-bloc')).toHaveCount(n);

	await page.locator('#lclicVerif').click();
	// Mutation qui ferait rougir ce test (critère 2) : compter juste dès que TOUS
	// les mots du groupe attendu sont présents dans la sélection, sans vérifier
	// qu'aucun autre mot ne s'y trouve — l'égalité d'ensembles ne serait plus
	// qu'une inclusion.
	await expect(page.locator('.lqcm-ko')).toBeVisible();

	const correct = page.locator('.lseg-mot.correct');
	const wrong = page.locator('.lseg-mot.wrong');
	const nCorrect = await correct.count();
	const nWrong = await wrong.count();
	// Mutation qui ferait rougir ce test (critère 6) : marquer tout le bloc
	// `.wrong` sans distinguer les mots réellement attendus — le parent ne
	// verrait alors JAMAIS où était la frontière juste, seulement « c'est faux ».
	expect(nCorrect).toBeGreaterThan(0);
	expect(nWrong).toBeGreaterThan(0);
	expect(nCorrect + nWrong).toBe(n); // rien d'autre que juste/faux : pas un mot oublié

	// Le groupe attendu (les mots `.correct`, tous choisis puisque toute la phrase
	// l'était) forme un bloc CONTIGU d'index — montré EN ENTIER, jamais en mots épars.
	const indices = (
		await correct.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-i'))))
	).sort((a, b) => a - b);
	expect(indices[indices.length - 1] - indices[0] + 1).toBe(indices.length);

	expect(await page.locator('.lseg-mark').count()).toBeGreaterThan(0);
	expect(errors).toEqual([]);
});

test('critère 7 : l’erreur remonte côté encadrant avec les DEUX délimitations (celle de l’enfant, celle attendue)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);
	const mots = await ouvrirEtMots(page);

	// Même geste garanti faux que le test précédent (toute la phrase).
	await mots.first().click();
	await mots.last().click();
	await page.locator('#lclicVerif').click();
	await expect(page.locator('.lqcm-ko')).toBeVisible();

	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();

	const enonce = ((await lecon.locator('.enc-err-q').first().textContent()) ?? '').trim();
	const donnee = ((await lecon.locator('.enc-err-donnee').first().textContent()) ?? '').trim();
	const attendue = ((await lecon.locator('.enc-err-bonne').first().textContent()) ?? '').trim();

	expect(enonce.length).toBeGreaterThan(0);
	expect(donnee.length).toBeGreaterThan(0);
	expect(attendue.length).toBeGreaterThan(0);
	// Mutation qui ferait rougir ce test : journaliser une seule délimitation (ou
	// la même chaîne des deux côtés, ex. un « c'est faux » générique) — le parent
	// ne verrait alors pas ce que l'enfant a réellement désigné, seulement le verdict.
	expect(donnee).not.toBe(attendue);

	expect(errors).toEqual([]);
});
