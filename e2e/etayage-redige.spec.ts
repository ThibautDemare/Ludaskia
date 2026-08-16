/* ============================================================
   Étayage de la NOTION (#490, PR 3/4) — contenu RÉDIGÉ, sans déroulé.
   ------------------------------------------------------------
   Jusqu'ici (`e2e/etayage.spec.ts`, `e2e/etayage-generalisation.spec.ts`), le panneau
   n'avait qu'une forme : un exemple entièrement DÉROULÉ par un moteur (grille posée,
   tableau de conversion, droite graduée, conjugaison…), avec visuel, compteur
   « Étape i sur n » et Précédent/Suivant. Cette PR donne un contenu à la quasi-totalité
   des leçons de maths qui n'ont PAS de moteur : un titre, une règle en une phrase, une
   liste d'AU PLUS trois étapes ÉCRITES — et aucun déroulé (`ouvrirEtayage`,
   `src/ui/etayage-panneau.ts` : `pas.length === 0` dès que `derouleMontrable` refuse le
   déroulé, ou qu'aucun `exemple` n'est renseigné).

   On ne teste PAS le libellé des phrases (Vitest, et ça bougera), seulement la FORME :
   présence de la règle et des étapes, absence du compteur/de la navigation/du visuel du
   déroulé, un seul bouton de sortie. Quatre témoins, quatre chemins d'écran DIFFÉRENTS
   (mêmes raisons qu'etayage-generalisation.spec.ts de varier les moteurs) :
   - `mes-perimetre-formule` (CE2) : fiche en saisie (`buildLessonFiche`, `.fiche`),
     entrée `etayage` posée directement dans la donnée de la leçon ;
   - `geo-figures-proprietes` (CE2) : runner QCM (`demarrerRunner`, `.sprint-stage`) —
     seul témoin ici sur un container DIFFÉRENT de la fiche ;
   - `donnees-tableau-lire` (CM1) : fiche en saisie, pour vérifier que la forme rédigée
     ne dépend pas du niveau ;
   - `math-tables-addition` (CE2, calcul mental du moteur bilanQ historique) : la seule
     des quatre dont l'entrée d'étayage ne vit PAS dans le module de données de la leçon
     mais dans une table à part (`ETAYAGES_CALCUL_MENTAL`, `core/catalog.ts`) — un chemin
     de branchement différent des trois autres.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Assertions communes à la forme RÉDIGÉE, quel que soit le point d'entrée : la règle et
   les étapes sont là, rien de ce qui appartient au déroulé ne l'est. */
async function verifierFormeRedigee(page: Page): Promise<void> {
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	await expect(page.locator('.etay-regle')).toBeVisible();
	await expect(page.locator('.etay-regle')).not.toHaveText('');

	const etapes = page.locator('#etayEtapes li');
	const n = await etapes.count();
	expect(n).toBeGreaterThan(0);
	expect(n).toBeLessThanOrEqual(3);

	// Rien du déroulé pas-à-pas : ni compteur, ni visuel, ni bouton « Précédent ».
	await expect(page.locator('.etay-compteur')).toHaveCount(0);
	await expect(page.locator('#etayVisuel')).toHaveCount(0);
	await expect(page.locator('#etayPrec')).toHaveCount(0);

	// Un seul bouton de sortie, déjà libellé pour partir (pas de « Suivant ▶ » à traverser).
	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");
}

/* ================================================================
   1. Fiche en saisie (mes-perimetre-formule, CE2) — témoin détaillé.
   ================================================================ */

test('périmètre (formule) : le bouton persistant ouvre un contenu rédigé, sans déroulé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-mes-perimetre-formule'); // mono-mode → fiche directe

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();

	await verifierFormeRedigee(page);
	await expect(page.locator('#etayTitle')).not.toHaveText('');

	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	// Le bouton persistant reste disponible, la fiche est intacte derrière.
	await expect(btn).toBeVisible();
	await expect(page.locator('.ans').first()).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   2. Runner QCM (geo-figures-proprietes, CE2) — seul container DIFFÉRENT
      de la fiche (`.sprint-stage`, monté par `demarrerRunner`).
   ================================================================ */

test('propriétés des figures (QCM) : le bouton persistant du runner ouvre le même contenu rédigé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-geo-figures-proprietes'); // mono-mode QCM → runner direct
	await expect(page.locator('.sprint-choice').first()).toBeVisible();

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await verifierFormeRedigee(page);

	// Fermeture par Échap (accessibilité minimale, cf. etayage.spec.ts) : le focus revient
	// au bouton qui a ouvert le panneau, le QCM sous-jacent n'a pas bougé.
	await page.keyboard.press('Escape');
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	await expect(btn).toBeFocused();
	await expect(page.locator('.sprint-choice')).toHaveCount(4);

	expect(errors).toEqual([]);
});

/* ================================================================
   3. Fiche CM1 avec figure (donnees-tableau-lire) — la forme rédigée ne
      dépend pas du niveau. Même amorçage CM1 que donnees.spec.ts.
   ================================================================ */

const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

test('lire un tableau à double entrée (CM1) : contenu rédigé identique, niveau différent', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-donnees-tableau-lire'); // mono-mode → fiche directe

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await verifierFormeRedigee(page);

	await page.locator('.aide-close').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   4. Calcul mental du moteur bilanQ historique (math-tables-addition, CE2) :
      seul témoin dont l'entrée d'étayage vient d'une table à part
      (`ETAYAGES_CALCUL_MENTAL`) plutôt que du module de données de la leçon.
   ================================================================ */

test('tables d’addition (calcul mental) : contenu rédigé branché depuis la table à part', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-tables-addition'); // mono-mode → fiche directe

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await verifierFormeRedigee(page);

	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});
