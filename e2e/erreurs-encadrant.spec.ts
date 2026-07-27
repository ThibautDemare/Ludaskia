/* ============================================================
   Historique des erreurs (#391) — espace encadrant, section
   « Ce qui a été difficile récemment ».
   Couvre : le round-trip capture → affichage (rater une fiche fait
   remonter l'erreur côté encadrant), le rendu groupé par leçon avec
   dédoublonnage « vu N fois », l'épinglage depuis la section, et l'état
   vide. Tout reste local ; l'invariant « consulter ne bascule pas le
   profil actif » est déjà couvert par encadrant.spec.ts.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Journal d'erreurs seedé pour le profil e2e : une leçon (math-complements)
   avec la MÊME erreur répétée (dédoublonnée en « vu 2 fois ») + une autre
   question, et une seconde leçon plus ancienne (pour l'ordre par récence). */
const SEED_ERREURS = `(() => {
  const now = Date.now(); const min = 60000;
  const liste = [
    { ts: now,           lessonId: 'math-complements', mode: 'lecon',   question: '45 + … = 57', donnee: '11', attendue: '12' },
    { ts: now - min,     lessonId: 'math-complements', mode: 'lecon',   question: '45 + … = 57', donnee: '11', attendue: '12' },
    { ts: now - 2 * min, lessonId: 'math-complements', mode: 'express', question: '30 + … = 42', donnee: '10', attendue: '12' },
    { ts: now - 3 * 86400000, lessonId: 'math-doubles', mode: 'sprint', question: 'double de 8 = …', donnee: '18', attendue: '16' },
  ];
  localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify(liste));
})();`;

/* 1. Round-trip : rater une fiche journalise l'erreur, qui remonte côté encadrant. */
test('round-trip : une fiche ratée fait remonter l’erreur dans l’espace encadrant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await seedAideVue(page);
	// Leçon « comparer » en saisie (fiche → session.verify, le point de capture).
	await gotoHash(page, 'lecon-num-comparer');

	const fields = page.locator('#sheets input.ans');
	const n = await fields.count();
	expect(n).toBeGreaterThan(0);
	// Remplit CHAQUE champ avec un signe FAUX (≠ réponse) → toutes les réponses fausses.
	for (let i = 0; i < n; i++) {
		const f = fields.nth(i);
		const ans = await f.getAttribute('data-answer');
		await f.fill(ans === '<' ? '>' : '<');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.wrong').first()).toBeVisible();

	// Espace encadrant : la section liste la leçon ratée.
	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click(); // déplie
	await expect(lecon.locator('.enc-err-bonne').first()).toBeVisible();
	expect(errors).toEqual([]);
});

/* 2. Rendu seedé : groupé par leçon, dédoublonnage « vu N fois », épinglage. */
test('rendu : groupé par leçon, « vu N fois », et épinglage depuis la section', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_ERREURS);
	await gotoHash(page, 'encadrant');

	// Défaut adaptatif (#476) : la fenêtre la plus serrée avec au moins une erreur est
	// « Aujourd'hui » ici (les 3 erreurs de math-complements y tombent), ce qui masquerait
	// math-doubles (3 jours). On bascule sur « Tout » pour retrouver l'objet réel de ce
	// test : grouper/dédoublonner/épingler à travers 2 leçons.
	await page.locator('.enc-act-mode[data-act="erreurs-periode"][data-periode="tout"]').click();

	// Une carte par leçon ; la plus récemment ratée (math-complements) en tête.
	const lecons = page.locator('.enc-err-lecon');
	await expect(lecons.first()).toBeVisible();
	expect(await lecons.count()).toBe(2);
	// Compteur total (3 erreurs brutes pour la 1re leçon).
	await expect(lecons.first().locator('.enc-err-count')).toContainText('3 erreurs');

	// Déplier la 1re leçon : détail des erreurs.
	await lecons.first().locator('.enc-err-sum').click();
	await expect(lecons.first().locator('.enc-err-bonne').first()).toContainText('La bonne réponse');
	await expect(lecons.first().locator('.enc-err-donnee').first()).toContainText('Réponse donnée');
	// L'erreur répétée est dédoublonnée en « vue 2 fois ».
	await expect(
		lecons.first().locator('.enc-err-meta').filter({ hasText: 'vue 2 fois' }),
	).toBeVisible();

	// Épingler depuis la section → la leçon rejoint « À revoir ensemble », désormais dans
	// l'onglet Programme (#459) : onglet ouvert (bouton « Retirer »).
	await lecons.first().locator('[data-act="epingler"]').click();
	await page.locator('.enc-tab[data-tab="programme"]').click();
	await expect(
		page.locator('.enc-revoir [data-act="epingler"]').filter({ hasText: 'Retirer' }).first(),
	).toBeVisible();
	expect(errors).toEqual([]);
});

/* 3. État vide : message positif quand aucune erreur récente. */
test('état vide : message rassurant quand rien à signaler', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	const section = page
		.locator('.enc-block')
		.filter({ hasText: 'Ce qui a été difficile récemment' });
	await expect(section).toBeVisible();
	await expect(section).toContainText('Rien à signaler récemment');
	await expect(page.locator('.enc-err-lecon')).toHaveCount(0);
	// Journal entièrement vide : rien à filtrer → le sélecteur de période (#476) ne
	// doit pas s'afficher.
	await expect(
		page.locator('.enc-act-modes[aria-label="Période des erreurs affichées"]'),
	).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* 4. Round-trip opération posée : une grille ratée remonte comme UNE entrée « a + b »
   (agrégation des cellules-chiffres, pas une erreur par chiffre). Valide le chemin
   le plus délicat (tag posedResult dans items.ts + agrégation dans session.verify). */
test('round-trip posé : une opération posée ratée remonte comme une seule erreur', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'lecon-calc-addition-posee');
	await expect(page.locator('.posee').first()).toBeVisible();

	// Remplit CHAQUE cellule-résultat avec un chiffre FAUX (≠ data-answer).
	const cells = page.locator('.posee-input');
	const n = await cells.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const c = cells.nth(i);
		const ans = Number((await c.getAttribute('data-answer')) ?? '0');
		await c.fill(String((ans + 1) % 10));
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.posee-input.wrong').first()).toBeVisible();

	// Espace encadrant : l'opération apparaît comme UNE entrée « … + … ».
	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	await expect(lecon.locator('.enc-err-q').first()).toContainText('+');
	expect(errors).toEqual([]);
});

/* 5. Seuil détaché : une 1re validation À VIDE (aucune faute → avertissement « 60 % »)
   ne doit PAS empêcher de journaliser les erreurs d'une validation ULTÉRIEURE du même
   essai (régression du garde « une fois par essai » qui ne se consomme que s'il y a une faute). */
test('seuil détaché : valider à vide puis en faux journalise quand même les erreurs', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await seedAideVue(page);
	await gotoHash(page, 'lecon-num-comparer');

	const fields = page.locator('#sheets input.ans');
	const n = await fields.count();
	expect(n).toBeGreaterThan(0);

	// 1re validation À VIDE : rien à journaliser → la garde ne doit pas être consommée.
	await page.locator('#btnVerify').click();

	// Puis on remplit tout FAUX et on revalide.
	for (let i = 0; i < n; i++) {
		const f = fields.nth(i);
		const ans = await f.getAttribute('data-answer');
		await f.fill(ans === '<' ? '>' : '<');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.wrong').first()).toBeVisible();

	// L'erreur remonte bien côté encadrant malgré la 1re validation à vide.
	await gotoHash(page, 'encadrant');
	await expect(page.locator('.enc-err-lecon').first()).toBeVisible();
	expect(errors).toEqual([]);
});

/* Journal seedé pour le sélecteur de période (#476) : horodatages ancrés sur le DÉBUT
   DU JOUR LOCAL (+10h) — jamais une soustraction fixe en ms — pour rester robuste à
   l'heure d'exécution du test (ne bascule pas de jour calendaire selon l'heure du run).
   - math-complements : une erreur HIER (dans « 2 jours », pas « Aujourd'hui ») + une
     erreur il y a 5 jours (dans « 1 semaine » seulement) → son compteur doit changer
     de 1 à 2 erreurs selon la période choisie.
   - math-doubles : une erreur il y a 6 jours (juste dans « 1 semaine »).
   - math-mesures : une erreur il y a 20 jours (seulement dans « Tout »).
   Rien AUJOURD'HUI → le défaut adaptatif doit retomber sur « 2 jours ». */
const SEED_PERIODES = `(() => {
  const now = Date.now();
  const debutJour = new Date(now); debutJour.setHours(0, 0, 0, 0);
  const ilYA = (jours) => debutJour.getTime() - jours * 86400000 + 10 * 3600000;
  const liste = [
    { ts: ilYA(1),  lessonId: 'math-complements', mode: 'lecon',   question: '12 + … = 20', donnee: '7', attendue: '8' },
    { ts: ilYA(5),  lessonId: 'math-complements', mode: 'lecon',   question: '15 + … = 25', donnee: '9', attendue: '10' },
    { ts: ilYA(6),  lessonId: 'math-doubles',     mode: 'sprint',  question: 'double de 6 = …', donnee: '11', attendue: '12' },
    { ts: ilYA(20), lessonId: 'math-mesures',      mode: 'express', question: '3 m = … cm', donnee: '30', attendue: '300' },
  ];
  localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify(liste));
})();`;

/* 6. Sélecteur de période (#476) : défaut adaptatif, bascule qui change contenu ET
   compteurs, « Tout » qui retrouve l'historique ancien, et message dédié quand la
   période choisie est vide alors que le journal ne l'est pas. */
test('sélecteur de période : défaut adaptatif, bascule change contenu et compteurs, « Tout » retrouve l’historique', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_PERIODES);
	await gotoHash(page, 'encadrant');

	const periodeBtn = (p: string) =>
		page.locator(`.enc-act-mode[data-act="erreurs-periode"][data-periode="${p}"]`);

	// Le sélecteur est affiché (journal non vide).
	await expect(
		page.locator('.enc-act-modes[aria-label="Période des erreurs affichées"]'),
	).toBeVisible();

	// Défaut adaptatif : rien aujourd'hui, une erreur hier → repli sur « 2 jours ».
	await expect(periodeBtn('deux-jours')).toHaveClass(/\bon\b/);
	await expect(periodeBtn('deux-jours')).toHaveAttribute('aria-checked', 'true');
	await expect(periodeBtn('jour')).toHaveAttribute('aria-checked', 'false');
	let lecons = page.locator('.enc-err-lecon');
	await expect(lecons).toHaveCount(1);
	await expect(lecons.first().locator('.enc-err-count')).toContainText('1 erreur');

	// Bascule sur « 1 semaine » : une 2e leçon apparaît (math-doubles, 6 jours) ET le
	// compteur de la 1re change (2 erreurs sur la semaine contre 1 sur 2 jours) — le
	// filtre s'applique bien AVANT le regroupement, pas seulement sur la liste des cartes.
	await periodeBtn('semaine').click();
	lecons = page.locator('.enc-err-lecon');
	await expect(lecons).toHaveCount(2);
	await expect(lecons.first().locator('.enc-err-count')).toContainText('2 erreurs');

	// Bascule sur « Aujourd'hui » : rien sur cette période alors que le journal n'est
	// pas vide → message dédié (distinct du message « rien à signaler » générique).
	await periodeBtn('jour').click();
	await expect(page.locator('.enc-err-lecon')).toHaveCount(0);
	await expect(page.locator('.enc-err-vide')).toContainText(
		'Rien à signaler sur cette période. Élargissez-la',
	);

	// « Tout » : retrouve aussi l'erreur la plus ancienne (math-mesures, 20 jours).
	await periodeBtn('tout').click();
	await expect(page.locator('.enc-err-lecon')).toHaveCount(3);

	expect(errors).toEqual([]);
});
