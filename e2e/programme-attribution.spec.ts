/* ============================================================
   Attribution du programme du jour sur ce qui est FAIT, pas sur le bouton pris
   (#498) — smoke tests e2e.
   ------------------------------------------------------------
   Avant #498, une étape n'était créditée que si l'enfant lançait le mode DEPUIS
   la tuile du programme (`#seance`) : la même leçon jouée depuis la carte
   « À revoir » de l'accueil, ou depuis le catalogue, ne comptait pas — l'écran
   continuait d'afficher « rien de fait » alors que le travail était fait. Une
   étape « à revoir » réussie disparaissait même de la jauge, car la notion
   quitte aussitôt la file épinglée dès qu'elle devient solide (étoilée).

   Ce fichier couvre le chemin HORS programme (carte « À revoir » de l'accueil,
   pas la tuile `#seance`), dans l'esprit de programme-a-revoir.spec.ts (mêmes
   helpers, même pattern watchErrors) :
   - une étape « à revoir » faite depuis la carte d'accueil est créditée ET reste
     visible ensuite (jauge, « Déjà fait aujourd'hui ») bien que la leçon vienne
     de quitter la file épinglée (réussite parfaite = étoile = solide) ;
   - un programme réduit à cette seule étape se termine bien (état « terminé »),
     pas de retour silencieux à l'accueil.
   Le chemin nominal (tuile du programme) est déjà couvert par
   programme-du-jour.spec.ts / programme-a-revoir.spec.ts / retour-programme.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Épingle UNE leçon réelle du catalogue CE2 pour le profil e2e : une leçon jamais
   travaillée est déjà « à revoir » (revoirActives, pct == null), pas besoin de
   forcer une stat de faiblesse. Même leçon que programme-a-revoir.spec.ts
   (mono-mode, fiche de 12 items — cf. lessons.ts). */
const SEED_REVOIR = `localStorage.setItem('e2e/ludaskia_revoir', JSON.stringify(['math-complements']));`;

/* Ferme les éventuelles modales de récompense (étoile / niveau / trophée / fête de
   fin de programme) qui intercepteraient le clic suivant. Fermer le niveau peut à
   son tour ROUVRIR la modale de récompense générique (chaînage `then` de
   `announceRewards`, cf. `effects.ts`) : on boucle jusqu'à ce que plus rien ne
   s'affiche. IMPORTANT : à appeler juste après avoir terminé une activité, AVANT
   toute navigation — un enfant ne peut de toute façon pas naviguer tant qu'une
   modale est ouverte (arrière-plan rendu `inert`) ; laisser une modale de la
   leçon ouverte puis en déclencher une autre par navigation créerait une
   superposition qu'un vrai parcours ne produit jamais (et que `activateModal`
   ne sait pas démêler : la modale nouvellement activée n'annule pas un `inert`
   qu'elle portait déjà elle-même d'une activation précédente). */
async function fermerModalesRecompense(page: Page): Promise<void> {
	for (let i = 0; i < 5; i++) {
		const levelup = page.locator('#levelupOk');
		if (await levelup.isVisible().catch(() => false)) {
			await levelup.click();
			continue;
		}
		const celebrate = page.locator('#celebrateOk');
		if (await celebrate.isVisible().catch(() => false)) {
			await celebrate.click();
			continue;
		}
		break;
	}
}

/* Crée, via l'UI réelle du compositeur, un programme (d1) avec une étape « À
   revoir » (e1) puis, si demandé, une étape « Sprint 5 min » (e2), et une
   récurrence hebdomadaire sur les 7 jours (s'applique quel que soit le jour
   d'exécution du test). Laisse la page sur #encadrant/programme. */
async function creerProgrammeARevoir(page: Page, avecSprint: boolean): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	const selectEtape = page.locator('select[data-act="seance-etape-add"][data-def="d1"]');
	await selectEtape.selectOption('aRevoir');
	if (avecSprint) await selectEtape.selectOption('sprint');
	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
}

/* Depuis l'espace encadrant (programme composé), retourne à l'accueil enfant —
   c'est ce premier passage qui fait mémoriser au programme la leçon ENCORE
   épinglée à cet instant (`aRevoirVus`, #498), condition du crédit ultérieur. */
async function retourAccueil(page: Page): Promise<void> {
	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();
}

/* Termine la fiche « Les compléments » (12 items) avec un sans-faute : toutes
   les réponses sont justes via `data-answer`, en un seul clic Vérifier — comme
   retour-programme.spec.ts. Un sans-faute donne l'étoile, ce qui fait quitter
   IMMÉDIATEMENT la leçon de la file épinglée (c'est précisément le cas que le
   fix doit couvrir). */
async function terminerMathComplements(page: Page): Promise<void> {
	await expect(page).toHaveURL(/#lecon-math-complements$/);
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const count = await fields.count();
	for (let i = 0; i < count; i++) {
		const ans = (await fields.nth(i).getAttribute('data-answer')) ?? '';
		await fields.nth(i).fill(ans);
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
}

test('programme du jour : une étape « à revoir » faite depuis la carte d’accueil est créditée et reste visible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_REVOIR);
	await creerProgrammeARevoir(page, true); // e1 = à revoir, e2 = sprint
	await retourAccueil(page);

	// Lancement HORS programme : la carte « À revoir » de l'accueil, pas la
	// tuile du programme.
	const carteRevoir = page.locator('#aRevoir');
	await expect(carteRevoir).toBeVisible();
	await carteRevoir.click();
	await terminerMathComplements(page);
	await fermerModalesRecompense(page); // sans-faute = étoile (+ niveau éventuel)

	// Retour à l'accueil (rechargement direct de la vue, comme
	// programme-a-revoir.spec.ts) : le travail fait hors programme doit
	// désormais être crédité (#498).
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await fermerModalesRecompense(page);

	const carteProgramme = page.locator('#cardProgramme');
	await expect(carteProgramme).toBeVisible();
	await expect(carteProgramme.locator('.lj-sub')).toHaveText('1 sur 2 déjà fait');

	await carteProgramme.click();
	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-pastilles')).toHaveAttribute(
		'aria-label',
		'1 activité sur 2 faite',
	);

	// L'étape ne disparaît plus : toujours listée en « Déjà fait aujourd'hui »
	// (le libellé retombe sur le générique « À revoir » — la leçon vient de
	// quitter la file épinglée, etapeVisuel ne peut plus la nommer).
	const deja = page.locator('.programme-deja');
	await expect(deja).toBeVisible();
	await expect(deja.locator('.programme-recap-item')).toHaveCount(1);
	await expect(deja.locator('.programme-recap-item')).toContainText('À revoir');

	// Le programme n'est pas fini : le sprint reste proposable.
	const tuiles = page.locator('.programme-tuile[data-act="lancer"]');
	await expect(tuiles).toHaveCount(1);
	await expect(tuiles.first().locator('.programme-tuile-titre')).toHaveText('Sprint 5 min');

	expect(errors).toEqual([]);
});

test('programme du jour : réduit à une étape « à revoir » faite hors programme, il se termine bien', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_REVOIR);
	await creerProgrammeARevoir(page, false); // e1 = à revoir, seule étape
	await retourAccueil(page);

	await page.locator('#aRevoir').click();
	await terminerMathComplements(page);
	await fermerModalesRecompense(page); // sans-faute = étoile (+ niveau éventuel)

	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await fermerModalesRecompense(page);

	// Programme réduit à sa seule étape, faite hors programme : « terminé »,
	// pas « rien de fait ».
	const carteProgramme = page.locator('#cardProgramme');
	await expect(carteProgramme).toBeVisible();
	await expect(carteProgramme).toHaveClass(/programme-card--fini/);
	await expect(carteProgramme.locator('.lj-title')).toContainText('Terminé, bravo !');

	// Carte « fini » : plus de pastille d'action (#517) — le clic ne navigue
	// plus vers #seance, ce serait un écran cul-de-sac. On reste sur l'accueil.
	await carteProgramme.click();
	await expect(page).not.toHaveURL(/#seance/);
	await expect(page.locator('#home')).toBeVisible();

	// L'écran #seance en état « terminé » reste atteignable par le hash (pas
	// un écran mort, juste plus la cible du clic sur la carte) : il se rend
	// bien, sans « rien de fait ».
	await gotoHash(page, 'seance');
	await fermerModalesRecompense(page);
	await expect(page.locator('.programme-fini')).toBeVisible();
	await expect(page.locator('.programme-recap .programme-recap-item')).toHaveCount(1);
	await expect(page.locator('.programme-recap .programme-recap-item')).toContainText('À revoir');

	expect(errors).toEqual([]);
});
