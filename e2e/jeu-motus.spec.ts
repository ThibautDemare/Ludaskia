/* ============================================================
   Motus (#661) — smoke e2e écrit AVANT l'implémentation (rouge attendu),
   contre les critères numérotés de l'issue et le contrat `tmp-contrat.md`
   (racine du dépôt, temporaire).

   Sélecteurs stables (cf. tmp-contrat.md) : #btnJeux, #jeuxEtagere, .jeu-item,
   #jeuEcran, #motusSaisie, .motus-ligne, .motus-case[data-etat], #motusClavier,
   #btnQuitterJeu.

   Ce que cette spec NE teste PAS, et pourquoi (cf. compte rendu complet) :
   - critères 13, 34, 35 (issue explicite en fin de partie, mot révélé en
     dernier, aucun essai fautif visible sans le mot) : le contrat ne donne
     AUCUN sélecteur pour l'écran de fin (gagné/perdu). Jouer jusqu'à la fin
     est néanmoins FAISABLE sans connaître le mot caché — critère 29 garantit
     qu'une proposition quelconque est toujours acceptée, donc rejouer la
     MÊME proposition jusqu'à épuisement du budget d'essais suffirait à
     perdre à coup sûr — mais sans sélecteur pour l'écran de résultat, rien
     n'est vérifiable à l'arrivée ;
   - critère 33 (l'accent fait partie de la lettre) : demande de connaître le
     mot caché pour construire un cas « avec/sans accent » précis — logique
     pure, du ressort de `evaluerEssai` (Vitest) ;
   - critère 36 (pas de rejeu immédiat, ≥ 5 essais) et critère 47 (lettres
     répétées) : mêmes raisons, ce sont des invariants du CORRECTEUR
     (`src/core/jeux/motus.ts`), testables sans DOM et donc du ressort des
     Vitest, pas d'un smoke e2e.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedJeuxPossedesScript, ouvrirJeuDepuisEtagere } from './helpers';

/* ---------- Critères 29 et 46 ---------- */

test('critères 29 et 46 : une suite de lettres quelconque est acceptée, produit une ligne à trois états et met à jour le clavier-résumé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['motus']));
	await gotoHash(page, 'accueil');
	await ouvrirJeuDepuisEtagere(page);

	const saisie = page.locator('#motusSaisie');
	await expect(saisie).toBeVisible();
	const clavierAvant = await page.locator('#motusClavier').innerHTML();

	// Suite de lettres qui n'est PAS un mot français ordinaire (critère 29 : aucun
	// dictionnaire d'acceptation, tout est reçu et consomme un essai — cf. le rejet
	// écrit du critère 31 dans l'issue).
	await saisie.fill('zxkqw');
	await saisie.press('Enter');

	const ligne = page.locator('.motus-ligne').first();
	await expect(ligne).toBeVisible();
	const cases = ligne.locator('.motus-case[data-etat]');
	await expect(cases.first()).toBeVisible();
	const n = await cases.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const etat = await cases.nth(i).getAttribute('data-etat');
		expect(['placee', 'ailleurs', 'absente']).toContain(etat);
	}

	// Critère 46 : le clavier-résumé change — au minimum, les lettres testées y
	// apparaissent désormais avec un statut (le résumé n'était pas déjà à l'identique
	// avant le premier essai).
	const clavierApres = await page.locator('#motusClavier').innerHTML();
	expect(clavierApres).not.toBe(clavierAvant);

	expect(errors).toEqual([]);
});
