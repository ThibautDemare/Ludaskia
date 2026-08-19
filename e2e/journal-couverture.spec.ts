/* ============================================================
   Preuve par l'usage de la table de couverture du journal d'erreurs (#581).

   UNE spec paramétrée qui boucle sur `e2e/journal-couverture.ts` : un test par
   entrée, tous avec le MÊME round-trip — produire une erreur par une vraie
   interaction, puis la retrouver dans l'espace encadrant. Seul le geste varie ;
   l'assertion, elle, est commune et centrale, ce qui est tout l'intérêt (un format
   ajouté à la table hérite du même verrou sans qu'on réécrive la vérification).

   Un fichier unique, pas un par format : la suite e2e tourne en `workers: 1`, le
   coût d'un fichier par format serait disproportionné.

   Ce que le round-trip commun verrouille, et que le gate statique (#580) ne peut
   pas voir : que `capterErreur` est appelé AU BON MOMENT (une carte apparaît), avec
   un énoncé lisible (sans quoi l'entrée est ignorée en silence, donc zéro carte) et
   avec des réponses NON VIDES des deux côtés — une entrée « Réponse attendue : »
   suivie de rien passerait tous les tests d'existence et ne dirait rien au parent.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';
import { COUVERTURE_JOURNAL, CLEAR_PIN } from './journal-couverture';

for (const [format, couverture] of Object.entries(COUVERTURE_JOURNAL)) {
	if (!couverture.couvert) continue; // format exempté : sa raison est jugée par le gate Vitest
	for (const entree of couverture.entrees) {
		test(`${format} — ${entree.titre} : l'erreur remonte dans l'espace encadrant`, async ({
			page,
		}) => {
			const errors = watchErrors(page);

			await page.addInitScript(CLEAR_PIN);
			await entree.amorce?.(page);
			await entree.jouer(page);

			await gotoHash(page, 'encadrant');
			// Profil neuf + un seul geste = une seule leçon ratée. Zéro carte signifie que
			// la capture n'a pas eu lieu (ou a été ignorée faute d'énoncé ou de leçon).
			const carte = page.locator('.enc-err-lecon');
			await expect(
				carte,
				`Le geste « ${entree.geste} » n'a produit AUCUNE entrée dans le journal : ` +
					`ce format corrige une réponse d'enfant sans la journaliser (#391).`,
			).toHaveCount(1);
			await carte.locator('.enc-err-sum').click();

			// Un énoncé, et surtout DEUX réponses renseignées : `capterErreur` accepte
			// sans broncher une donnée ou une attendue vide, illisible côté parent.
			await expect(carte.locator('.enc-err-q').first()).not.toBeEmpty();
			await expect(carte.locator('.enc-err-donnee').first()).toHaveText(/Réponse donnée\s*:\s*\S/);
			await expect(carte.locator('.enc-err-bonne').first()).toHaveText(/Réponse attendue\s*:\s*\S/);

			await entree.verifie?.(carte);
			expect(errors).toEqual([]);
		});
	}
}
