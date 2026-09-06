/* ============================================================
   Motus (#661) — smoke e2e écrit AVANT l'implémentation (rouge attendu),
   contre les critères numérotés de l'issue et le contrat `tmp-contrat.md`
   (racine du dépôt, temporaire).

   Sélecteurs stables (cf. tmp-contrat.md, plus ceux posés par l'implémentation) :
   #btnJeux, #jeuxEtagere, .jeu-item, #jeuEcran, #motusSaisie, .motus-ligne,
   .motus-case[data-etat], #motusClavier, .motus-fin[data-issue],
   .motus-mot-revele, #btnQuitterJeu.

   Ce que cette spec NE teste PAS, et pourquoi (cf. compte rendu complet) :
   - critère 33 (l'accent fait partie de la lettre) : demande de connaître le
     mot caché pour construire un cas « avec/sans accent » précis — logique
     pure, du ressort de `evaluerEssai` (Vitest) ;
   - critère 36 (pas de rejeu immédiat, ≥ 5 essais) et critère 47 (lettres
     répétées) : mêmes raisons, ce sont des invariants du CORRECTEUR
     (`src/core/jeux/motus.ts`), testables sans DOM et donc du ressort des
     Vitest, pas d'un smoke e2e ;
   - l'issue GAGNÉE (moitié du critère 13) : sans connaître le mot caché (aucun
     hook de test ne l'expose), impossible de taper la bonne réponse. La
     défaite, elle, ne demande PAS de connaître le mot (cf. le test ci-dessous) :
     c'est donc elle qui couvre 13/34/35, pas l'inverse.
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

/* ---------- Critères 13, 34, 35 : issue explicite, mot révélé en dernier ---------- */

test('critères 13, 34, 35 : épuiser les essais révèle le mot, en dernière position, après toutes les tentatives fautives', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['motus']));
	await gotoHash(page, 'accueil');
	await ouvrirJeuDepuisEtagere(page);

	const saisie = page.locator('#motusSaisie');
	const fin = page.locator('.motus-fin');

	// Une proposition qui n'est jamais le mot caché (le vivier est du vocabulaire
	// réel curé, cf. critère 32 : aucune série n'est faite de « x » répétés) :
	// la rejouer jusqu'à épuiser le budget d'essais (critère 36 : ≥ 5, constant à
	// 6 au lot 1) perd la partie À COUP SÛR, SANS connaître le mot caché — c'est
	// justement ce que garantit le critère 29 (aucune saisie n'est refusée).
	// Plafond de tentatives par SÉCURITÉ (cf. e2e/README.md), pas la valeur exacte
	// du budget : si celui-ci change plus tard, ce test reste correct.
	let tentatives = 0;
	while (!(await fin.isVisible()) && tentatives < 10) {
		await saisie.fill('xxxxxx');
		await saisie.press('Enter');
		tentatives++;
	}
	expect(await fin.isVisible(), 'la partie ne s’est jamais terminée').toBe(true);

	// Critère 13 : issue explicite — et c'est bien une DÉFAITE : « xxxxxx » n'est
	// le mot caché d'aucune série du vivier.
	await expect(fin).toHaveAttribute('data-issue', 'perdu');

	// Critère 34 : le mot correct est révélé, et n'est pas vide.
	const revele = page.locator('.motus-mot-revele');
	await expect(revele).toBeVisible();
	expect((await revele.innerText()).trim().length).toBeGreaterThan(0);

	// Critère 35 : aucune tentative fautive ne reste visible SANS le mot après
	// elle — la révélation (.motus-fin) suit la grille des essais (.motus-grille)
	// dans l'ordre du DOM, jamais l'inverse.
	const finApresGrille = await page.evaluate(() => {
		const grille = document.querySelector('.motus-grille');
		const fin = document.querySelector('.motus-fin');
		if (!grille || !fin) return false;
		return (grille.compareDocumentPosition(fin) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
	});
	expect(finApresGrille).toBe(true);

	expect(errors).toEqual([]);
});
