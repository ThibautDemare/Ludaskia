/* ============================================================
   Espace encadrant (#556) — sélecteur de leçon TOUS NIVEAUX, smoke tests e2e.
   ------------------------------------------------------------
   Le composant `ui/selecteur-lecon.ts` remplace le `<select>` filtré au niveau
   du profil, qui rendait une leçon d'une autre classe inatteignable. Il est
   partagé par deux usages, testés ici sur un profil CM1 :
     - composeur du programme (« Une leçon précise ») : ouvrir le sélecteur,
       filtrer par jeton de classe, chercher, choisir une leçon CE2 (classe
       PRÉCÉDENTE) → la ligne affiche la cible seule avec son badge de classe
       d'origine, focus rendu au bouton « Changer » ;
     - sous-bloc « Épingler une leçon » (bloc « À revoir ensemble ») : même
       geste, action « Épingler » — et c'est là le CŒUR de l'issue : une
       épingle hors classe doit ensuite apparaître sur l'accueil de l'enfant
       (carte « À revoir »), SANS aucune étiquette de niveau côté enfant
       (décision produit, comme la révision d'entretien #232).
   Leçon choisie : `math-complements` (« Complément à 10/100/1000 »), CE2 SEULE
   (`levels: ['ce2']`, cf. `core/catalog.ts`) — hors classe pour un profil CM1,
   déjà utilisée par `programme-a-revoir.spec.ts` pour sa fiche de 12 items à
   verdict déterministe (`data-answer`).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const UUID = 'e2e-sel-lecon';
const LABEL = 'Complément à 10/100/1000'; // math-complements

/* Profil CM1 (toutes matières) : `math-complements` (CE2 seule) est donc une classe
   PRÉCÉDENTE — le scénario même de l'issue (#556 : proposer une notion d'un niveau
   inférieur). Supprime aussi tout verrou PIN persisté d'un test précédent. */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${UUID}', name: 'Test', emoji: '🦉', updatedAt: 1, niveauReference: 'cm1' }], active: '${UUID}' }));`;
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Ouvre le composeur du programme sur un premier programme neuf, avec une étape
   « Une leçon précise » (née sans cible, #556). Laisse le sélecteur de cette étape
   FERMÉ (l'appelant l'ouvre lui-même selon le test). */
async function creerEtapeLecon(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CM1);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('lecon');
}

test('composeur du programme : choisir une leçon d’une classe précédente, focus conservé (#556)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await creerEtapeLecon(page);

	// Née sans cible : le repère le dit, l'activité ne compte pas.
	await expect(page.locator('.enc-seance-cible-vide')).toHaveText('Aucune leçon choisie');
	await expect(
		page.locator('.enc-hint').filter({ hasText: "Tant qu'aucune leçon n'est choisie" }),
	).toBeVisible();
	await expect(page.locator('.enc-hint').filter({ hasText: /^0 activité/ })).toBeVisible();

	// Ouvre le sélecteur.
	const btnOuvrir = page.locator('[data-act="seance-cible-ouvrir"]');
	await expect(btnOuvrir).toHaveText('Choisir une leçon');
	await btnOuvrir.click();
	await expect(btnOuvrir).toHaveAttribute('aria-expanded', 'true');

	// Scopé à `.enc-seance-selecteur` : la section « À revoir ensemble » de la MÊME page
	// porte son propre sélecteur (sous-bloc « Épingler une leçon », toujours rendu, cf.
	// test suivant) — sans ce scope, `.enc-sel` matcherait les deux instances.
	const selecteur = page.locator('.enc-seance-selecteur .enc-sel');
	await expect(selecteur).toBeVisible();

	// Jetons de classe : radiogroup, « Sa classe (CM1) » cochée par défaut, jeton CE2 présent.
	const jetons = selecteur.locator('[data-act="sel-niveau"]');
	await expect(jetons.filter({ hasText: 'Sa classe' })).toHaveAttribute('aria-checked', 'true');
	const jetonCE2 = jetons.filter({ hasText: 'CE2' });
	await expect(jetonCE2).toBeVisible();

	// Filtre par jeton CE2 : le focus reste sur le jeton (contrat radiogroup, re-rendu complet).
	await jetonCE2.click();
	await expect(jetonCE2).toBeFocused();
	await expect(jetonCE2).toHaveAttribute('aria-checked', 'true');

	// Déplie manuellement l'arbre matière → catégorie (les `<details>` naissent repliés).
	const matiere = selecteur.locator('.enc-sel-mat').filter({ hasText: 'Mathématiques' });
	await expect(matiere).toHaveJSProperty('open', false);
	await matiere.locator('> summary').click();
	await expect(matiere).toHaveJSProperty('open', true);
	const categorie = matiere.locator('.enc-sel-cat').filter({ hasText: 'Calcul mental' });
	await categorie.locator('> summary').click();
	await expect(categorie).toHaveJSProperty('open', true);

	// Recherche : filtre à la frappe (résumé live mis à jour).
	const recherche = selecteur.locator('input[data-act="sel-recherche"]');
	await recherche.fill('Complément');
	await expect(selecteur.locator('.enc-sel-item').filter({ hasText: LABEL })).toBeVisible();

	// Choisit la leçon : sélecteur refermé, ligne montrant la cible seule + badge de classe
	// d'origine, focus rendu au bouton « Changer » (qui a pris la place du bouton cliqué).
	await selecteur
		.locator('.enc-sel-item')
		.filter({ hasText: LABEL })
		.locator('[data-act="seance-cible-choisir"]')
		.click();
	await expect(page.locator('.enc-seance-selecteur .enc-sel')).toHaveCount(0);

	const cible = page.locator('.enc-seance-cible');
	await expect(cible.locator('.enc-seance-cible-nom')).toHaveText(LABEL);
	await expect(cible.locator('.enc-classe-origine')).toContainText('CE2');

	const btnChanger = page.locator('[data-act="seance-cible-ouvrir"]');
	await expect(btnChanger).toHaveText('Changer');
	await expect(btnChanger).toBeFocused();

	// L'activité configurée compte désormais.
	await expect(page.locator('.enc-hint').filter({ hasText: /^1 activité/ })).toBeVisible();

	expect(errors).toEqual([]);
});

test('sous-bloc « Épingler une leçon » : épingler une classe précédente, focus conservé (#556)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CM1);
	await gotoHash(page, 'encadrant/programme');

	const sousBloc = page.locator('.enc-block').filter({ hasText: 'Épingler une leçon' });
	await expect(sousBloc).toBeVisible();
	const selecteur = sousBloc.locator('.enc-sel');

	// Filtre CE2 puis recherche, comme le composeur (le sélecteur est le MÊME composant).
	await selecteur.locator('[data-act="sel-niveau"]').filter({ hasText: 'CE2' }).click();
	await selecteur.locator('input[data-act="sel-recherche"]').fill('Complément');

	const ligne = selecteur.locator('.enc-sel-item').filter({ hasText: LABEL });
	const btnEpingler = ligne.locator('[data-act="epingler-selecteur"]');
	await expect(btnEpingler).toHaveText('Épingler');
	await btnEpingler.click();

	// Le bouton, dans l'arbre, passe à « Retirer » ET garde le focus (pas de fermeture du
	// panneau ici — contrairement au choix d'une cible unique côté programme).
	await expect(btnEpingler).toHaveText('Retirer');
	await expect(btnEpingler).toBeFocused();

	// La leçon apparaît dans le bloc « Épinglées », avec son badge de classe d'origine.
	const epinglees = page.locator('.enc-revoir').first();
	const itemEpingle = epinglees.locator('.enc-revoir-item').filter({ hasText: LABEL });
	await expect(itemEpingle).toBeVisible();
	await expect(itemEpingle.locator('.enc-classe-origine')).toContainText('CE2');
	await expect(itemEpingle.locator('[data-act="epingler"]')).toHaveText('Retirer');

	expect(errors).toEqual([]);
});

test('accueil enfant : une épingle hors classe apparaît (carte « À revoir »), aucune étiquette de niveau (#556)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Épinglage direct en stockage (le geste UI est déjà couvert par le test précédent) :
	// isole le bout-en-bout « épingle hors classe → accueil enfant ».
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CM1);
	await page.addInitScript(
		`localStorage.setItem('${UUID}/ludaskia_revoir', JSON.stringify(['math-complements']));`,
	);
	// `gotoHash` (pas `page.goto` direct) : amorce aussi le guide de 1re visite déjà vu
	// (tour enfant + mot aux parents), sinon sa modale interne intercepterait le clic
	// sur la carte. Son script `ENSURE_NIVEAU` s'exécute APRÈS les nôtres (ajouté après)
	// et respecte le profil déjà seedé (niveauReference déjà posé).
	await gotoHash(page, 'accueil');

	const carte = page.locator('#aRevoir');
	await expect(carte).toBeVisible();
	await expect(carte.locator('.lj-title')).toHaveText(LABEL);

	// Aucune étiquette de classe nulle part sur l'accueil (décision produit, comme #232) :
	// l'enfant ne voit ni « CE2 » (classe d'origine de la leçon) ni « CM1 » (sa classe).
	await expect(page.locator('#home')).not.toContainText('CE2');
	await expect(page.locator('#home')).not.toContainText('CM1');

	// Bout en bout : le clic lance bien la leçon CE2, jouable et corrigée normalement.
	await carte.click();
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
	// Aucune étiquette de niveau ne fuite dans l'écran de leçon non plus.
	await expect(page.locator('#sheets')).not.toContainText('CE2');
	await expect(page.locator('#sheets')).not.toContainText('CM1');

	expect(errors).toEqual([]);
});
