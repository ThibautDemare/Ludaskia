/* ============================================================
   Historique des erreurs (#391) — espace encadrant, section
   « Ce qui a été difficile récemment ».
   Couvre : le round-trip capture → affichage (rater une fiche fait
   remonter l'erreur côté encadrant), le rendu groupé par leçon avec
   dédoublonnage « vu N fois », l'épinglage depuis la section, et l'état
   vide. Tout reste local ; l'invariant « consulter ne bascule pas le
   profil actif » est déjà couvert par encadrant.spec.ts.

   Couverture des chemins de correction (155f145) qui ne journalisaient
   AUCUNE erreur avant #391-bis : la révision espacée (toutes formes
   d'items confondues, testée sur l'opération posée), le mode « Je remplis
   le tableau » des conversions, le mode « Coche les bonnes propriétés »,
   et la leçon « Familles de mots à relier ». Chaque round-trip force une
   vraie erreur via l'interaction réelle (pas un seed direct du journal :
   c'est justement le CODE de capture qu'on verrouille), puis vérifie sa
   remontée côté encadrant. Complète aussi le rendu des erreurs anciennes
   (> 5 par leçon), désormais dépliables plutôt qu'un simple compteur.
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

	// Une carte par leçon ; la plus ratée (math-complements, 3 erreurs) en tête (#519).
	const lecons = page.locator('.enc-err-lecon');
	await expect(lecons.first()).toBeVisible();
	expect(await lecons.count()).toBe(2);
	// Compteur total (3 erreurs brutes pour la 1re leçon).
	await expect(lecons.first().locator('.enc-err-count')).toContainText('3 erreurs');

	// Déplier la 1re leçon : détail des erreurs.
	await lecons.first().locator('.enc-err-sum').click();
	// Libellé « Réponse attendue » (#446 : « La bonne réponse » niait à tort l'unicité
	// pour une intercalation corrigée par bande). Il a donc déjà bougé une fois — on
	// ancre ici sur la VALEUR seedée (attendue: '12'), pas sur le mot français, pour ne
	// pas re-casser ce test au prochain choix de libellé.
	await expect(lecons.first().locator('.enc-err-bonne').first()).toContainText('12');
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

/* 7. Round-trip RÉVISION (155f145) : la révision espacée ne journalisait RIEN — le
   trou le plus important, puisque c'est justement le moment où l'enfant rejoue ce
   qu'il rate. On amorce une opération posée « due » (comme revision.spec.ts), on la
   rate volontairement, et on vérifie qu'elle remonte côté encadrant sous le mode
   « révision » (distinct de « leçon »). */
test('round-trip révision : une opération posée ratée en révision remonte sous le mode « révision »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		`localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify({
      'calc-addition-posee': { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));`,
	);
	await gotoHash(page, 'revision-espacee');

	const cells = page.locator('.posee-input');
	const n = await cells.count();
	expect(n).toBeGreaterThan(0);
	// Remplit CHAQUE cellule-résultat avec un chiffre FAUX (≠ data-answer).
	for (let i = 0; i < n; i++) {
		const c = cells.nth(i);
		const ans = Number((await c.getAttribute('data-answer')) ?? '0');
		await c.fill(String((ans + 1) % 10));
	}
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ko')).toBeVisible();
	// Termine la session (seul élément dû) : une révision EN COURS bloque toute
	// navigation par un garde-fou de sortie (« Tu veux arrêter ? », #63) qui
	// empêcherait le `gotoHash` suivant d'atteindre l'espace encadrant.
	await page.locator('#revNext').click();
	await expect(page.locator('.rev-done')).toContainText('terminée');

	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	await expect(lecon.locator('.enc-err-q').first()).toContainText('+');
	// Mode « révision », pour le distinguer d'une même leçon ratée à l'entraînement.
	await expect(lecon.locator('.enc-err-meta').first()).toContainText('révision');
	expect(errors).toEqual([]);
});

/* 8. Round-trip TABLEAU (155f145) : le mode « Je remplis le tableau » des conversions
   (pavé de chiffres, jamais de clavier) ne journalisait rien — seul le mode « saisie »
   de la même leçon remontait. Une case fausse doit désormais remonter côté encadrant. */
test('round-trip tableau : une case fausse en mode « Je remplis le tableau » remonte côté encadrant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await seedAideVue(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	// Remplit toutes les cases juste, sauf la première qu'on trompe volontairement
	// (même recette que tableau-conversion.spec.ts).
	const cellules = page.locator('.tc-cell');
	const n = await cellules.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const cellule = page.locator(`.tc-cell[data-i="${i}"]`);
		const bon = await cellule.getAttribute('data-answer');
		const chiffre = i === 0 ? String((Number(bon) + 1) % 10) : (bon ?? '0');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
	}
	await expect(page.locator('#tcVerif')).toBeEnabled();
	await page.locator('#tcVerif').click();
	await expect(page.locator('.tc-cell[data-i="0"]')).toHaveClass(/wrong/);

	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	// La réponse donnée porte l'unité (nombreTableauSaisi + unité, ex. « 301 cm »),
	// pas juste les chiffres bruts d'une case.
	await expect(lecon.locator('.enc-err-donnee').first()).not.toBeEmpty();
	expect(errors).toEqual([]);
});

/* Profil CM1 (comme geo-cm1-figures-proprietes.spec.ts) : la leçon « Reconnaître une
   figure par ses propriétés » n'existe qu'à ce niveau. */
const SEED_CM1 = `(() => {
  localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));
  localStorage.setItem('e2e/ludaskia_tour_seen', 'true');
  localStorage.setItem('e2e/ludaskia_parents_seen', 'true');
})();`;

/* 9. Round-trip QCM MULTI (155f145) : le mode « Coche les bonnes propriétés » ne
   journalisait rien. Cocher LES 4 propositions garantit une correction fausse : le
   pool ne compte jamais plus de 3 propriétés vraies parmi les 4 (figures-proprietes.ts,
   `choisirK` borné à 3), donc au moins une case cochée est forcément fausse. */
test('round-trip QCM multi : cocher toutes les propriétés (au moins une fausse) remonte côté encadrant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CM1);
	await gotoHash(page, 'mode-geo-cm1-figures-proprietes');
	await page.locator('.mode-btn[data-mode="coche"]').click();

	const choices = page.locator('.lqcm-multi-choice');
	await expect(choices).toHaveCount(4);
	for (let i = 0; i < 4; i++) await choices.nth(i).click();
	await page.locator('#lqmValider').click();
	await expect(page.locator('.lqm-badge--revoir')).toBeVisible();

	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	// Réponse donnée = les 4 propositions cochées, jointes ; bonne réponse = les
	// propriétés vraies seules (capterErreur dans lecon-qcm-multi.ts).
	await expect(lecon.locator('.enc-err-donnee').first()).not.toBeEmpty();
	await expect(lecon.locator('.enc-err-bonne').first()).not.toBeEmpty();
	expect(errors).toEqual([]);
});

/* 10. Round-trip APPARIEMENT (155f145) : la leçon « Familles de mots à relier » ne
   journalisait rien (le widget n'avait pas de `reponse()` exploitable). La bonne
   réponse n'est PAS exposée dans le DOM avant Vérifier (voulu, a11y, cf.
   appariement.spec.ts) : on relie le i-ème mot de gauche au i-ème mot de droite
   (ordre DOM), sans garantie de justesse. Sur les 5 manches de la session, la
   probabilité qu'une manche entière tombe juste par hasard est d'environ 1/24 : on
   avance de manche en manche jusqu'à en trouver une ratée (quasi certain avant la
   fin de la session ; (1/24)^5 pour les 5 manches justes par hasard). */
test('round-trip appariement : une manche « Familles de mots à relier » ratée remonte côté encadrant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await seedAideVue(page);
	await gotoHash(page, 'lecon-fr-vocab-familles-relier');
	await page.locator('.lapp-mot').first().waitFor();

	let ratee = false;
	for (let manche = 0; manche < 5 && !ratee; manche++) {
		const gauche = page.locator('.lapp-mot[data-side="g"]');
		const droite = page.locator('.lapp-mot[data-side="d"]');
		const n = await gauche.count();
		for (let i = 0; i < n; i++) {
			await gauche.nth(i).click();
			await droite.nth(i).click();
		}
		await page.locator('#lappVerif').click();
		await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
		if (await page.locator('.lqcm-ko').isVisible()) {
			ratee = true;
		} else {
			await page.locator('#lappActions button').click();
			await page.locator('.lapp-mot').first().waitFor();
		}
	}
	expect(ratee).toBe(true);

	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	// Restreint aux paires FAUSSES (pairesErreur), formatées « gauche → droite ».
	await expect(lecon.locator('.enc-err-donnee').first()).toContainText('→');
	expect(errors).toEqual([]);
});

/* Journal seedé avec 6 erreurs DISTINCTES (question+donnee différents → pas de
   dédoublonnage) sur UNE seule leçon, pour dépasser MAX_PAR_LECON (5) et faire
   apparaître le repli « + N plus anciennes ». */
const SEED_ANCIENNES = `(() => {
  const now = Date.now();
  const liste = Array.from({ length: 6 }, (_, i) => ({
    ts: now - i * 1000,
    lessonId: 'math-complements',
    mode: 'lecon',
    question: 'Question n°' + (i + 1),
    donnee: String(i),
    attendue: String(i + 1),
  }));
  localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify(liste));
})();`;

/* 11. Erreurs anciennes (> 5 par leçon) DÉPLIABLES (155f145) : avant, le « + N plus
   anciennes » au-delà de MAX_PAR_LECON était un simple texte, illisible — un écart
   inexplicable entre le compteur total et la liste affichée. Repliées par défaut
   (mur de fautes évité), mais dépliables pour qui cherche une régularité. */
test('erreurs anciennes (> 5 par leçon) : dépliables et lisibles au second niveau', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_ANCIENNES);
	await gotoHash(page, 'encadrant');

	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	await expect(lecon.locator('.enc-err-count')).toContainText('6 erreurs');

	// Les 5 erreurs les plus récentes (Question n°1 à 5) sont visibles d'emblée, dans
	// la liste DIRECTE de la leçon (celle du 1er niveau de <details>, pas encore la
	// leçon des erreurs anciennes du 2e niveau).
	const listeDirecte = lecon.locator('ul.enc-err-list').first();
	await expect(listeDirecte.locator('.enc-err-item')).toHaveCount(5);
	await expect(listeDirecte).not.toContainText('Question n°6');

	// La 6e (la plus ancienne) est repliée dans le second <details>, présente mais
	// non visible tant qu'on ne la déplie pas.
	const anciennes = lecon.locator('.enc-err-anciennes');
	await expect(anciennes).toBeVisible();
	const resume = anciennes.locator('.enc-err-anciennes-sum');
	await expect(resume).toContainText('1 erreur plus ancienne');
	const itemAncien = anciennes.locator('.enc-err-item');
	await expect(itemAncien).toHaveCount(1);
	await expect(itemAncien).toBeHidden();

	// Dépliée, elle devient lisible.
	await resume.click();
	await expect(itemAncien).toBeVisible();
	await expect(itemAncien.locator('.enc-err-q')).toContainText('Question n°6');

	expect(errors).toEqual([]);
});

/* Journal seedé où récence et volume se CONTREDISENT (#519) : math-doubles n'a
   qu'UNE erreur mais à l'instant présent (la plus récente) ; math-complements en a
   TROIS, distinctes (pas de dédoublonnage), mais plus anciennes de quelques minutes
   — dans la même fenêtre de période qu'on ira chercher explicitement (« Tout »). Sous
   l'ancien tri antéchronologique, math-doubles serait sorti en tête ; le nouveau tri
   par volume doit mettre math-complements devant. */
const SEED_TRI = `(() => {
  const now = Date.now(); const min = 60000;
  const liste = [
    { ts: now,           lessonId: 'math-doubles',     mode: 'sprint', question: 'double de 8 = …', donnee: '15', attendue: '16' },
    { ts: now - 5 * min, lessonId: 'math-complements', mode: 'lecon',  question: '12 + … = 20',     donnee: '7',  attendue: '8' },
    { ts: now - 6 * min, lessonId: 'math-complements', mode: 'lecon',  question: '15 + … = 25',     donnee: '9',  attendue: '10' },
    { ts: now - 7 * min, lessonId: 'math-complements', mode: 'lecon',  question: '40 + … = 60',     donnee: '15', attendue: '20' },
  ];
  localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify(liste));
})();`;

/* 12. Tri par volume (#519) : à récence et volume contradictoires, la leçon la plus
   RATÉE (3 erreurs, plus ancienne) passe devant la plus RÉCEMMENT ratée (1 erreur) —
   verrou du rendu réel, puisque les seeds ci-dessus (par coïncidence) n'auraient
   jamais distingué l'ancien tri antéchronologique du nouveau tri par volume. */
test('tri des cartes-leçons : la plus ratée passe devant la plus récente (#519)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_TRI);
	await gotoHash(page, 'encadrant');

	// Bascule explicite sur « Tout » (#476) : la fenêtre adaptative par défaut est la
	// plus serrée qui contient au moins une erreur, ce qui pourrait exclure une partie
	// des erreurs seedées (donc fausser le total comparé) indépendamment du tri qu'on
	// veut vérifier ici.
	await page.locator('.enc-act-mode[data-act="erreurs-periode"][data-periode="tout"]').click();

	const lecons = page.locator('.enc-err-lecon');
	await expect(lecons).toHaveCount(2);
	// math-complements (3 erreurs, plus ancienne) EN TÊTE, devant math-doubles (1
	// erreur, plus récente) : le volume prime sur la récence, qui ne départage plus
	// qu'à égalité.
	await expect(lecons.first().locator('.enc-err-lecon-lab')).toHaveText('Complément à 10/100/1000');
	await expect(lecons.nth(1).locator('.enc-err-lecon-lab')).toHaveText('Doubles');

	expect(errors).toEqual([]);
});
