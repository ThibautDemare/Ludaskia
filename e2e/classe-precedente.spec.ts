/* ============================================================
   « Classe précédente » — À revoir ensemble (#723) — smoke tests e2e.
   ------------------------------------------------------------
   FONCTIONNALITÉ PAS ENCORE IMPLÉMENTÉE côté src/ : cette spec est écrite
   AVANT le code (cadrage #723), elle doit être ROUGE tant que le sous-bloc
   n'existe pas. Les attentes viennent du contrat DOM de l'issue, jamais du
   code (qui ne contient rien à lire ici).

   Couvre (numéros = critères d'acceptation #723) :
     1,2,15 — Programme > « À revoir ensemble » : sous-bloc « Encore en cours
       en CE2 » liste une leçon CE2 travaillée non franchie, avec libellé,
       badge d'origine, état, bouton Épingler — sans aucun « % ».
     3,4    — Épingler depuis le sous-bloc bascule la leçon dans les
       épinglées (première `ul.enc-revoir`) ET dans la carte accueil
       `#aRevoir` ; elle ne réapparaît plus dans le sous-bloc.
     7      — Une leçon travaillée mais non fragile (étoilée) laisse la
       place à une phrase de clôture, pas à la liste.
     8      — Onglet Suivi : tuile « encore en cours en CE2 » au nombre de
       lignes du sous-bloc, absente à 0 ; ÉPINGLÉES COMPRISES (l'épingle ne
       « réussit » pas la leçon — décision actée sur l'issue, commentaire daté).
     12     — Profil CE2 (classe la plus basse) : ni sous-bloc, ni tuile.
     14     — Rien ne change côté enfant : aucune étiquette de classe dans
       `#aRevoir`.

   Remontées a11y (destin « gate », post-relecture, commit 65cf3f2) :
     - le nom accessible du bouton d'épinglage nomme la classe d'origine
       (« (CE2) ») en plus du libellé, car deux leçons de classes différentes
       peuvent partager le même libellé ;
     - l'infobulle du badge de classe (`aria-label` de `.enc-classe-origine`)
       ne doit affirmer un épinglage que pour une ligne réellement épinglée.

   Leçon de test : `calc-addition-posee` (« L'addition posée »), donnée par
   l'issue. On assère le FRAGMENT « addition posée » (sans l'apostrophe, pour
   ne pas figer un glyphe — cf. #717) plutôt que le libellé exact : ce n'est
   pas la formulation qui est testée, mais sa présence.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const UUID = 'e2e-classe-precedente';
const LESSON_ID = 'calc-addition-posee';
const LABEL_FRAGMENT = 'addition posée';
const LESSON_ID_2 = 'calc-soustraction-posee';
const LABEL_FRAGMENT_2 = 'soustraction posée';

function seedProfil(niveauReference: 'ce2' | 'cm1'): string {
	return `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${UUID}', name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: '${niveauReference}' }], active: '${UUID}' }));`;
}

function statFragile(lessonId: string) {
	return `'${lessonId}@ce2': { attempts: 1, correct: 4, questions: 10, bestPct: 40, lastPct: 40, recents: [{ ok: 4, total: 10 }], lastAt: 1 }`;
}

/* Leçon CE2 travaillée à 40 %, sans essai complet réussi (critère 1 : le cas
   d'échec explicite de l'issue). */
const SEED_STATS_FRAGILE = `localStorage.setItem('${UUID}/ludaskia_lessonStats', JSON.stringify({ ${statFragile(LESSON_ID)} }));`;

/* Deux leçons CE2 fragiles, même forme de stat (critère 8 : la tuile compte
   aussi celle déjà épinglée, le sous-bloc non). */
const SEED_STATS_FRAGILE_2LESSONS = `localStorage.setItem('${UUID}/ludaskia_lessonStats', JSON.stringify({ ${statFragile(LESSON_ID)}, ${statFragile(LESSON_ID_2)} }));`;

/* L'addition est déjà épinglée : elle reste « en cours » (pas réussie), donc
   comptée par la tuile, mais ne doit plus apparaître dans le sous-bloc. */
const SEED_REVOIR_PIN_ADDITION = `localStorage.setItem('${UUID}/ludaskia_revoir', JSON.stringify(['${LESSON_ID}']));`;

/* Même leçon, mais franchie (étoilée) : plus aucune leçon fragile (critère 7). */
const SEED_STARS_FRANCHIE = `localStorage.setItem('${UUID}/ludaskia_stars', JSON.stringify({ '${LESSON_ID}@ce2': 1 }));`;

test('Programme > À revoir ensemble : sous-bloc « Encore en cours en CE2 » liste la leçon fragile, sans % (#723 crit. 1,2,15)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(SEED_STATS_FRAGILE);
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, 'encadrant/programme');

	// Le bloc existant « À revoir ensemble » rend bien (pas de crash de rendu) : sa
	// liste des épinglées est vide sur ce profil neuf, donc rendue en `<p>` plutôt
	// qu'en `ul.enc-revoir` (l'élément n'existe qu'avec au moins une entrée, cf.
	// test suivant) — on vérifie donc l'état vide connu, pas la liste.
	await expect(page.locator('h3').filter({ hasText: 'À revoir ensemble' })).toBeVisible();
	await expect(page.getByText('Aucune leçon épinglée pour le moment.')).toBeVisible();

	const sousBloc = page.locator(
		'div.enc-classe-precedente[data-subject="math"][data-niveau="ce2"]',
	);
	await expect(sousBloc).toBeVisible();
	await expect(sousBloc.locator('h4.enc-sub-lab')).toContainText('Encore en cours en CE2');

	const item = sousBloc.locator('li.enc-revoir-item').filter({ hasText: LABEL_FRAGMENT });
	await expect(item).toBeVisible();

	// Badge de classe d'origine : le TEXTE visible reste court (« CE2 »), mais son
	// infobulle (aria-label) doit lever l'ambiguïté correctement — ligne NON
	// épinglée ici, donc pas de mention d'épinglage (remontée a11y, destin gate).
	const badge = item.locator('.enc-classe-origine');
	await expect(badge).toContainText('CE2');
	const ariaBadge = await badge.getAttribute('aria-label');
	expect(ariaBadge).toBeTruthy();
	expect(ariaBadge).toMatch(/^Classe d'origine : CE2\./);
	expect(ariaBadge).not.toContain('épinglée volontairement');

	await expect(item.locator('.enc-revoir-etat')).not.toHaveText('');

	// Bouton d'épinglage : nom accessible qui nomme À LA FOIS la leçon et sa
	// classe d'origine — deux leçons de classes différentes peuvent partager le
	// même libellé, le texte visible seul ne suffit pas à les distinguer.
	const boutonEpingleSousBloc = item.locator(
		`button[data-act="epingler"][data-lesson="${LESSON_ID}"]`,
	);
	await expect(boutonEpingleSousBloc).toContainText('Épingler');
	const ariaEpingle = await boutonEpingleSousBloc.getAttribute('aria-label');
	expect(ariaEpingle).toBeTruthy();
	expect(ariaEpingle).toContain('(CE2)');
	expect(ariaEpingle).toContain(LABEL_FRAGMENT);

	// Critère 15 : aucun pourcentage dans le sous-bloc (état qualitatif, pas chiffré).
	await expect(sousBloc).not.toContainText('%');

	expect(errors).toEqual([]);
});

test('Épingler depuis le sous-bloc : la leçon rejoint les épinglées et la carte accueil, et quitte le sous-bloc (#723 crit. 3,4)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(SEED_STATS_FRAGILE);
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, 'encadrant/programme');

	const sousBloc = page.locator(
		'div.enc-classe-precedente[data-subject="math"][data-niveau="ce2"]',
	);
	const boutonDansSousBloc = sousBloc.locator(
		`button[data-act="epingler"][data-lesson="${LESSON_ID}"]`,
	);
	await expect(boutonDansSousBloc).toContainText('Épingler');
	await boutonDansSousBloc.click();

	// Critère 4 : plus aucune trace de cette leçon dans le sous-bloc.
	await expect(sousBloc.locator(`[data-lesson="${LESSON_ID}"]`)).toHaveCount(0);

	// Critère 3 : elle rejoint la PREMIÈRE ul.enc-revoir (épinglées), avec « Retirer ».
	// On cible le bouton d'épinglage précisément : la ligne porte aussi deux boutons
	// d'impression qui partagent le même `data-lesson`, un `[data-lesson=...]` nu
	// résout donc 3 éléments (strict mode violation).
	const boutonEpingle = page
		.locator('ul.enc-revoir')
		.first()
		.locator(`button[data-act="epingler"][data-lesson="${LESSON_ID}"]`);
	await expect(boutonEpingle).toContainText('Retirer');

	// Même exigence a11y que dans le sous-bloc : le nom accessible du bouton
	// « Retirer » nomme aussi la classe d'origine et la leçon.
	const ariaRetirer = await boutonEpingle.getAttribute('aria-label');
	expect(ariaRetirer).toBeTruthy();
	expect(ariaRetirer).toContain('(CE2)');
	expect(ariaRetirer).toContain(LABEL_FRAGMENT);

	// Critère 3 (suite) : la carte accueil enfant la propose. Navigation SPA
	// (hash direct, pas gotoHash) pour ne pas ré-exécuter les addInitScript et
	// perdre l'épinglage qu'on vient d'obtenir (cf. desepinglage-auto.spec.ts).
	await page.evaluate(() => {
		location.hash = 'accueil';
	});
	await expect(page.locator('#home')).toBeVisible();
	const carteRevoir = page.locator('#aRevoir');
	await expect(carteRevoir).toBeVisible();
	await expect(carteRevoir).toContainText(LABEL_FRAGMENT);
	// Critère 14 : rien ne change côté enfant, aucune étiquette de classe ne fuite
	// (même exigence que #232, cf. revision-niveau-inferieur.spec.ts).
	await expect(carteRevoir).not.toContainText('CE2');
	await expect(carteRevoir).not.toContainText('CM1');

	expect(errors).toEqual([]);
});

test('Programme > À revoir ensemble : une leçon franchie (étoilée) affiche la phrase de clôture, pas la liste (#723 crit. 7)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(SEED_STATS_FRAGILE);
	await page.addInitScript(SEED_STARS_FRANCHIE);
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, 'encadrant/programme');

	const sousBloc = page.locator(
		'div.enc-classe-precedente[data-subject="math"][data-niveau="ce2"]',
	);
	await expect(sousBloc).toBeVisible();
	await expect(sousBloc.locator('h4.enc-sub-lab')).toContainText('Encore en cours en CE2');
	await expect(sousBloc.locator('p.enc-classe-precedente-fin')).toContainText('réussi');
	await expect(sousBloc.locator('li.enc-revoir-item')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('Suivi : la tuile « encore en cours en CE2 » compte les lignes du sous-bloc, absente quand il n’y en a pas (#723 crit. 8)', async ({
	page,
}) => {
	const errors = watchErrors(page);

	// Cas présent : une leçon fragile → tuile à 1.
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(SEED_STATS_FRAGILE);
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, 'encadrant');
	await expect(
		page.locator('.enc-stat[data-stat="classe-precedente-ce2"] .enc-stat-num'),
	).toHaveText('1');
	await expect(page.locator('.enc-stat[data-stat="classe-precedente-ce2"]')).not.toContainText('%');

	expect(errors).toEqual([]);
});

test('Suivi + Programme : la tuile compte aussi une leçon déjà épinglée, le sous-bloc ne liste que les non épinglées (#723 crit. 8, épingle)', async ({
	page,
}) => {
	// Décision actée sur l'issue (commentaire daté) : épingler ne « réussit » pas la
	// leçon, elle reste « encore en cours » — la tuile la compte donc toujours, même
	// si le sous-bloc (qui ne montre que ce qui reste À FAIRE) ne la liste plus.
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(SEED_STATS_FRAGILE_2LESSONS);
	await page.addInitScript(SEED_REVOIR_PIN_ADDITION);
	await page.addInitScript(seedAideVueScript(UUID));

	await gotoHash(page, 'encadrant');
	await expect(
		page.locator('.enc-stat[data-stat="classe-precedente-ce2"] .enc-stat-num'),
	).toHaveText('2');

	await gotoHash(page, 'encadrant/programme');
	const sousBloc = page.locator(
		'div.enc-classe-precedente[data-subject="math"][data-niveau="ce2"]',
	);
	const lignes = sousBloc.locator('li.enc-revoir-item');
	await expect(lignes).toHaveCount(1);
	await expect(lignes).toContainText(LABEL_FRAGMENT_2);
	await expect(sousBloc).not.toContainText(LABEL_FRAGMENT);

	const ligneEpinglee = page
		.locator('ul.enc-revoir')
		.first()
		.locator(`button[data-act="epingler"][data-lesson="${LESSON_ID}"]`);
	await expect(ligneEpinglee).toContainText('Retirer');

	expect(errors).toEqual([]);
});

test('Suivi : la tuile « encore en cours en CE2 » est absente sans aucune leçon CE2 travaillée (#723 crit. 8, cas à 0)', async ({
	page,
}) => {
	// NB — cette assertion d'absence est vraie aujourd'hui même SANS l'implémentation
	// (rien ne rend la tuile). Elle ne devient une garde de non-régression qu'une fois
	// le sous-bloc/la tuile codés : la mutation qu'elle attrapera alors est « rendre la
	// tuile inconditionnellement dès qu'il existe un profil CM1/CE2 », sans vérifier
	// que le compte est > 0.
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, 'encadrant');
	await expect(page.locator('.enc-stat[data-stat="classe-precedente-ce2"]')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('Profil CE2 (classe la plus basse) : ni sous-bloc ni tuile « classe précédente » (#723 crit. 12)', async ({
	page,
}) => {
	// Même remarque que ci-dessus : sans implémentation, ce test passe déjà (rien ne
	// rend ni le sous-bloc ni la tuile pour AUCUN profil). Il protégera, une fois le
	// code écrit, contre la mutation « afficher le sous-bloc CE2 même quand le profil
	// n'a pas de classe antérieure » (ex. boucle sur les niveaux < niveauReference qui
	// oublierait d'exclure le niveau minimal lui-même).
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('ce2'));
	await page.addInitScript(SEED_STATS_FRAGILE);
	await page.addInitScript(seedAideVueScript(UUID));

	await gotoHash(page, 'encadrant/programme');
	await expect(page.locator('div.enc-classe-precedente')).toHaveCount(0);

	await gotoHash(page, 'encadrant');
	await expect(page.locator('.enc-stat[data-stat="classe-precedente-ce2"]')).toHaveCount(0);

	expect(errors).toEqual([]);
});
