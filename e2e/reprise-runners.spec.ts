/* ============================================================
   Reprise des runners « une question à la fois » (#498, volet 2) — smoke tests.
   ------------------------------------------------------------
   Avant ce lot, seule la fiche en saisie (et les bilans) se reprenait : la
   reprise photographiait le DOM. Les dix runners (QCM, QCM multi, tri, ordre,
   tuiles, tableau, appariement, clic-mot, droite graduée, problème) n'avaient
   AUCUNE reprise — une leçon interrompue y était perdue.

   Désormais ils photographient leur ÉTAT LOGIQUE (questions déjà tirées, index
   courant, score) : core/resume.ts (ResumeRunner) + ui/lecon-runner-shared.ts
   (déclaration/registre des runners). Deux runners représentatifs suffisent à
   couvrir la mécanique commune (reste des huit = même squelette partagé) :
   - QCM (lecon-qcm.ts), sur une leçon À PLUSIEURS MODES : couvre en plus le
     point le plus visible du changement — `startLecon` propose désormais
     Continuer/Recommencer AVANT l'écran de choix de mode (avant #498, seule
     une leçon MONO-mode l'aurait proposé, car seule la fiche grille se
     reprenait) ;
   - Appariement (lecon-appariement.ts), un runner à WIDGET (relier des
     paires) plutôt qu'un simple clic de bouton, et repris via la carte
     « À continuer » (pas la modale de startLecon) — chemin de restauration
     différent.

   Point le plus important dans les deux tests : la reprise NE RETIRE JAMAIS
   un nouveau tirage — on rejoue EXACTEMENT les mêmes questions/manches, à la
   question entamée, score compris. On vérifie aussi ce point via un RELOAD
   COMPLET de page (`page.goto`, pas une simple navigation par hash) entre
   l'interruption et la reprise : les runners s'enregistrent dans un registre
   au CHARGEMENT de leur module (cycle d'imports navigation ↔ runner ↔
   lecon-runner-shared) ; un mauvais ordre d'évaluation viderait ce registre au
   moment de restaurer, et l'enfant retomberait silencieusement sur l'accueil.
   Une simple navigation par hash dans la même session ne l'aurait pas
   révélé (les modules restent chargés) ; un reload complet, si.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Alias de l'overlay ui-modal (seul overlay de modale sans id, cf. modales.spec.ts). */
const uiModalOverlay = '.modal-overlay:not([id])';

/* Répond à la question QCM courante (1er choix) et indique si c'était la bonne
   réponse (classe .correct posée sur TOUT bouton correct, y compris le nôtre). */
async function repondreQcm(page: Page): Promise<boolean> {
	const premier = page.locator('#lqcmChoices .sprint-choice').first();
	await premier.click();
	const cls = (await premier.getAttribute('class')) ?? '';
	return cls.includes('correct');
}

/* Enchaîne sur la question suivante (ou l'écran de résultat si c'était la dernière). */
async function continuerQcm(page: Page): Promise<void> {
	await page.locator('#lqcmActions button').click();
}

/* Quitte l'exercice en cours vers l'accueil (déclenche captureResume). Sur le viewport
   mobile du projet Playwright, « Accueil » est replié dans le tiroir latéral (cf.
   menu-mobile.spec.ts) : on l'ouvre d'abord. */
async function quitterVersAccueil(page: Page): Promise<void> {
	await page.locator('#toolbarBurger').click();
	await page.locator('#btnHome').click();
	await expect(page.locator('#home')).toBeVisible();
}

test('QCM (leçon à plusieurs modes) interrompu : la modale de reprise sort avant l’écran de choix, et Continuer rejoue exactement la même question, score conservé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-geometrie');

	// 1er lancement : aucune reprise → écran de choix de mode (2 modes : qcm/saisie).
	await page.locator('.lesson-item[data-id="geo-solides-reconnaitre"]').click();
	await page.locator('.mode-btn[data-mode="qcm"]').click();
	await page.locator('.sprint-choice').first().waitFor();

	// Question 1 : répondue puis on enchaîne (peu importe juste/faux, on retient le score).
	let score = (await repondreQcm(page)) ? 1 : 0;
	await continuerQcm(page);

	// Question 2 EN COURS, pas encore répondue : c'est CELLE-CI que la reprise doit rejouer.
	await page.locator('.sprint-choice').first().waitFor();
	const progressAvant = await page.locator('.lqcm-progress-lab').textContent();
	const total = Number(progressAvant!.match(/\/ (\d+)/)![1]);
	expect(total).toBeGreaterThanOrEqual(2); // sinon rien à interrompre (régression connue par ailleurs)
	const choicesAvant = (await page.locator('.sprint-choice').allTextContents())
		.map((s) => s.trim())
		.sort();
	expect(choicesAvant.length).toBe(4);

	// Quitte l'exercice (idx=1, ni fini ni au tout début) : la photo est prise.
	await quitterVersAccueil(page);

	// Reload COMPLET (pas une navigation par hash) : rejoue à froid le cycle d'imports/
	// enregistrement des runners avant de vérifier la carte « À continuer ».
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	const carte = page.locator('.reprise-card[data-key="lecon-geo-solides-reconnaitre"]');
	await expect(carte).toBeVisible();
	await expect(carte.locator('.reprise-count')).toHaveText(`1/${total}`);

	// Relance la MÊME leçon depuis le catalogue (nouveau reload complet) : `startLecon`
	// doit proposer Continuer/Recommencer AVANT l'écran de choix de mode — avant #498,
	// seule une leçon mono-mode l'aurait proposé (les runners n'étaient pas repris).
	await gotoHash(page, 'categorie-math-geometrie');
	await page.locator('.lesson-item[data-id="geo-solides-reconnaitre"]').click();
	const overlay = page.locator(uiModalOverlay);
	await expect(overlay.locator('.modal-title')).toHaveText('Tu avais commencé !');
	await expect(page.locator('.mode-btn')).toHaveCount(0); // pas encore passé par l'écran de choix
	await overlay.locator('.modal-ok').click(); // « Continuer où j'en étais »

	// On retombe EXACTEMENT sur la question 2 : mêmes choix, même progression — jamais
	// un nouveau tirage.
	await expect(page.locator('.lqcm-progress-lab')).toHaveText(progressAvant!);
	const choicesApres = (await page.locator('.sprint-choice').allTextContents())
		.map((s) => s.trim())
		.sort();
	expect(choicesApres).toEqual(choicesAvant);
	await expect(page.locator('.ui-toast')).toContainText('Te revoilà');

	// Termine la leçon en répondant aux questions restantes : le score final doit inclure
	// celui acquis AVANT l'interruption (score conservé, pas remis à zéro par la reprise).
	for (let i = 1; i < total; i++) {
		if (await repondreQcm(page)) score++;
		await continuerQcm(page);
	}
	await expect(page.locator('.sprint-done-big')).toHaveText(`${score} / ${total}`);

	expect(errors).toEqual([]);
});

test('Appariement (runner à widget) : rien avant la 1re manche validée, et Continuer réaffiche la même manche déjà tirée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page); // masque l'auto-aide du 1er lancement (cf. helpers.ts)
	await gotoHash(page, 'lecon-fr-vocab-familles-relier'); // mono-mode → lancement direct

	// Abandon immédiat, AVANT toute manche validée (idx=0) : rien à reprendre (#498).
	await page.locator('.lapp-mot').first().waitFor();
	await quitterVersAccueil(page);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await expect(
		page.locator('.reprise-card[data-key="lecon-fr-vocab-familles-relier"]'),
	).toHaveCount(0);

	// Relance à neuf (rien n'a été sauvegardé) et termine la 1re manche pour atteindre idx=1.
	await gotoHash(page, 'lecon-fr-vocab-familles-relier');
	await page.locator('.lapp-mot').first().waitFor();
	const gauche = page.locator('.lapp-mot[data-side="g"]');
	const droite = page.locator('.lapp-mot[data-side="d"]');
	const nb = await gauche.count();
	for (let i = 0; i < nb; i++) {
		await gauche.nth(i).click();
		await droite.nth(i).click();
	}
	await page.locator('#lappVerif').click();
	await page.locator('#lappActions button').click();

	// Manche 2 en cours, pas encore reliée : ce sont CES mots (déjà tirés) qu'il faut
	// retrouver après reprise — jamais une nouvelle manche. L'ordre d'affichage de la
	// colonne de gauche est REMÉLANGÉ à chaque rendu (cf. ui/appariement.ts) : on compare
	// donc des ensembles triés, pas un ordre.
	await page.locator('.lapp-mot').first().waitFor();
	const progressAvant = await page.locator('.lqcm-progress-lab').textContent();
	const total = Number(progressAvant!.match(/\/ (\d+)/)![1]);
	const motsAvant = (await gauche.allTextContents()).map((s) => s.trim()).sort();

	await quitterVersAccueil(page);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });

	const carte = page.locator('.reprise-card[data-key="lecon-fr-vocab-familles-relier"]');
	await expect(carte).toBeVisible();
	await expect(carte.locator('.reprise-count')).toHaveText(`1/${total}`);

	await carte.locator('.reprise-continue').click();

	await expect(page.locator('.lqcm-progress-lab')).toHaveText(progressAvant!);
	const motsApres = (await gauche.allTextContents()).map((s) => s.trim()).sort();
	expect(motsApres).toEqual(motsAvant);
	await expect(page.locator('.ui-toast')).toContainText('Te revoilà');

	expect(errors).toEqual([]);
});

test('quitter un runner interrompu PUIS une fiche en saisie : les deux restent proposés (une session de runner morte ne doit plus écraser la capture suivante)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await gotoHash(page, 'lecon-fr-vocab-familles-relier');

	// Runner interrompu en manche 2 (idx=1) : quitté vers l'accueil, SANS reload — c'est
	// dans cette même session JS que la reprise doit être clôturée par `quitterSessionRunner`.
	await page.locator('.lapp-mot').first().waitFor();
	const gauche = page.locator('.lapp-mot[data-side="g"]');
	const droite = page.locator('.lapp-mot[data-side="d"]');
	const nb = await gauche.count();
	for (let i = 0; i < nb; i++) {
		await gauche.nth(i).click();
		await droite.nth(i).click();
	}
	await page.locator('#lappVerif').click();
	await page.locator('#lappActions button').click();
	await page.locator('.lapp-mot').first().waitFor();
	await quitterVersAccueil(page);

	// Enchaîne, TOUJOURS SANS RELOAD, sur une fiche en saisie (navigation par hash in-session,
	// pas gotoHash qui recharge la page) : avant le correctif, l'état de module du runner
	// survivait à la sortie et captureResume le rephotographiait indéfiniment, court-circuitant
	// la capture de la grille ci-dessous (elle n'était alors JAMAIS sauvegardée).
	await page.evaluate(() => {
		location.hash = 'lecon-math-complements';
	});
	const champ = page.locator('.ans').first();
	await champ.waitFor();
	await champ.fill('1');
	await quitterVersAccueil(page);

	// Reload complet : LES DEUX cartes doivent être là, pas seulement le runner.
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await expect(
		page.locator('.reprise-card[data-key="lecon-fr-vocab-familles-relier"]'),
	).toBeVisible();
	await expect(page.locator('.reprise-card[data-key="lecon-math-complements"]')).toBeVisible();
	await expect(page.locator('.reprise-card')).toHaveCount(2);

	expect(errors).toEqual([]);
});
