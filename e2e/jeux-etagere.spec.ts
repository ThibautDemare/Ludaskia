/* ============================================================
   Socle de l'étagère de jeux (#661) — smoke e2e écrits AVANT l'implémentation
   (rouges attendus), contre les critères numérotés de l'issue et le contrat
   `tmp-contrat.md` (racine du dépôt, temporaire — donne les sélecteurs).

   Couvre ici l'ENTRÉE, les QUATRE SURFACES, l'ÉTAGÈRE elle-même, le RETOUR
   après un jeu, et le franchissement d'un PALIER (écran de choix). Les deux
   jeux (Motus, 2048) ont chacun leur propre fichier
   (jeu-motus.spec.ts, jeu-2048.spec.ts), au titre de « nouveau type
   d'exercice mérite son fichier spec » (e2e/README.md).

   Sélecteurs stables (cf. tmp-contrat.md) : #jeuxNav, #btnJeux, #jeuxEtagere,
   .jeu-item, #jeuxChoix, .jeu-choix-item, #jeuEcran, #btnQuitterJeu.

   Ce que cette spec NE teste PAS, et pourquoi (cf. compte rendu complet) :
   - critères 10/11 (plafond réglable côté encadrant) : aucun sélecteur stable
     n'existe pour ce réglage dans le contrat — probablement un écran de
     l'espace encadrant qui reste à définir ;
   - la moitié « le vivier redonne le jeu non choisi au palier suivant » du
     critère 6 : il faudrait atteindre le palier 2 (niveau 6, ~150 XP), trop
     de réponses à scripter pour un smoke e2e — relève des Vitest sur
     `proposerJeux`/`paliersEnAttente` (critère 8) ;
   - la formulation exacte « l'écran dit explicitement que les autres
     reviendront » (moitié du critère 6) et le critère 12 (« fin douce, phrase
     non culpabilisante ») : ce sont des exigences de FORMULATION, pas des
     invariants mécaniques — l'issue elle-même range le critère 12 dans les
     points qu'aucun test ne peut tenir (relecture designer-ux-enfant /
     redacteur-contenu-francais).
   - critère 4 « EXACTEMENT 3 propositions » : au lancement le catalogue ne
     compte que 2 jeux (Motus, 2048) — l'issue le documente elle-même
     (« Contexte », table des paliers) comme un cas où la règle de
     RELÂCHEMENT (critère 5) s'applique nécessairement. Le test ci-dessous
     vérifie donc 2 propositions, pas 3.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import {
	watchErrors,
	gotoHash,
	seedJeuxPossedesScript,
	ouvrirEtagere,
	ouvrirJeuDepuisEtagere,
} from './helpers';

/* ---------- Critère 27 (négatif) : rien avant le premier palier ---------- */

test('critère 27 : un profil neuf (niveau 1, aucun jeu débloqué) ne voit pas l’entrée d’étagère', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Profil frais : XP nulle (niveau 1), aucun jeu semé (ENSURE_NIVEAU par défaut,
	// posé par gotoHash — cf. helpers.ts).
	await gotoHash(page, 'accueil');

	// #btnJeux, pas #jeuxNav : si le conteneur existe mais reste vide (même
	// convention que #eggAlbumNav, précédent cité par le critère 41), #jeuxNav
	// pourrait exister sans bouton — c'est le bouton qui doit être absent.
	await expect(page.locator('#btnJeux')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- Critères 1, 38, 40, 41, 42, 45 : l'entrée, une fois débloquée ---------- */

test('critères 1, 38, 40, 41, 42, 45 : un jeu déjà débloqué fait apparaître #jeuxNav juste avant #rewardNav, en bouton .reward-btn sans compteur ni badge ni icône 🎮', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Un jeu déjà possédé (état post-palier), et AUCUNE activité semée aujourd'hui :
	// le critère 1 exige que l'entrée reste atteignable même sans séance faite ce
	// jour-là — ne rien semer d'autre que le jeu possédé suffit à le vérifier.
	await page.addInitScript(seedJeuxPossedesScript(['motus']));
	await gotoHash(page, 'accueil');

	const nav = page.locator('#jeuxNav');
	await expect(nav).toBeVisible();
	const btn = page.locator('#btnJeux');
	await expect(btn).toBeVisible();
	await expect(btn).toHaveClass(/reward-btn/); // critère 40 : facture des boutons voisins

	// Critère 38 : #jeuxNav est dans .home-col-left, JUSTE AVANT #rewardNav (donc
	// après .boards) — rien entre les deux.
	const position = await page.evaluate(() => {
		const jeuxNav = document.getElementById('jeuxNav');
		const rewardNav = document.getElementById('rewardNav');
		if (!jeuxNav || !rewardNav) return { dansColonne: false, justeAvant: false };
		return {
			dansColonne: !!jeuxNav.closest('.home-col-left'),
			justeAvant: jeuxNav.nextElementSibling === rewardNav,
		};
	});
	expect(position.dansColonne).toBe(true);
	expect(position.justeAvant).toBe(true);

	const texte = await nav.innerText();
	expect(texte).not.toMatch(/\d+\s*\/\s*\d+/); // critère 41 : aucun ratio N/M
	expect(texte).not.toContain('🎮'); // critère 45

	// Critère 42 : aucun badge « nouveau » persistant — #jeuxNav ne porte que SON
	// bouton, pas de pastille additionnelle accolée (même logique que
	// renderEggAlbumNav, cité comme précédent par le critère 41).
	const nEnfants = await page.evaluate(
		() => document.getElementById('jeuxNav')?.children.length ?? -1,
	);
	expect(nEnfants).toBe(1);

	expect(errors).toEqual([]);
});

/* ---------- Critère 39 : quatre surfaces, une seule en écran plein ---------- */

test('critère 39 : l’étagère s’ouvre en modale (le hash ne bouge pas), un jeu s’ouvre en écran plein (le hash change)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['2048']));
	await gotoHash(page, 'accueil');
	const hashAccueil = new URL(page.url()).hash;

	await ouvrirEtagere(page);
	const etagere = page.locator('#jeuxEtagere');
	await expect(etagere).toBeVisible();
	await expect(etagere.locator('.modal-wide')).toBeVisible();
	// Modale : la navigation par hash n'a PAS eu lieu (contrairement à un écran).
	expect(new URL(page.url()).hash).toBe(hashAccueil);

	await page.locator('.jeu-item').first().click();
	const ecran = page.locator('#jeuEcran');
	await expect(ecran).toBeVisible();
	// Écran plein : le hash a changé, l'étagère n'est plus au-dessus.
	expect(new URL(page.url()).hash).not.toBe(hashAccueil);
	await expect(etagere).not.toBeVisible();
	const dansUneModale = await page.evaluate(
		() => !!document.getElementById('jeuEcran')?.closest('.modal-overlay'),
	);
	expect(dansUneModale).toBe(false);

	expect(errors).toEqual([]);
});

/* ---------- Critère 3 : l'étagère, une seule liste, sans libellé de compétence ---------- */

test('critère 3 : l’étagère liste les jeux possédés en une seule liste, sans libellé qui révèle une compétence', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['motus', '2048']));
	await gotoHash(page, 'accueil');
	await ouvrirEtagere(page);

	const etagere = page.locator('#jeuxEtagere');
	const items = etagere.locator('.jeu-item');
	await expect(items).toHaveCount(2);

	// Une seule liste : tous les items partagent le MÊME parent (pas deux sections).
	const nParents = await page.evaluate(() => {
		const els = Array.from(document.querySelectorAll('#jeuxEtagere .jeu-item'));
		return new Set(els.map((e) => e.parentElement)).size;
	});
	expect(nParents).toBe(1);

	// Le Motus déclare la compétence « orthographe lexicale » (critère 14) : elle ne
	// doit apparaître QUE côté encadrant, jamais dans le libellé enfant de l'étagère.
	const texte = (await etagere.innerText()).toLowerCase();
	expect(texte).not.toContain('orthographe');
	expect(texte).not.toContain('compétence');

	expect(errors).toEqual([]);
});

/* ---------- Critère 44 : quitter un jeu rouvre l'étagère ---------- */

test('critère 44 : quitter un jeu rouvre l’étagère (pas l’accueil seul)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['2048']));
	await gotoHash(page, 'accueil');
	await ouvrirJeuDepuisEtagere(page);
	await expect(page.locator('#jeuEcran')).toBeVisible();

	await page.locator('#btnQuitterJeu').click();
	await expect(page.locator('#jeuEcran')).not.toBeVisible();
	const etagere = page.locator('#jeuxEtagere');
	await expect(etagere).toBeVisible();
	await expect(etagere.locator('.modal-wide')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- Critères 4 et 6 : franchir un palier ouvre le choix, irrévocable ---------- */

/* xpPourNiveau(2) - 1 = round(12 × 1^0.89) - 1 = 12 - 1 = 11 (courbe documentée dans
   src/core/progress.ts, déjà réutilisée telle quelle par
   e2e/revision-recompenses.spec.ts pour la MÊME raison : faire basculer le niveau
   avec UNE seule bonne réponse de plus, de façon déterministe). Palier 1 de la table
   de l'issue : rang 1, niveau 2, type R (refuge) — dévolu au 2048 dans ce lot. */
const XP_JUSTE_SOUS_NIVEAU_2 = 11;

/* Ferme la chaîne de modales de récompense (niveau puis célébration générique, cf.
   src/ui/effects.ts:announceRewards) jusqu'à ce que #jeuxChoix apparaisse — ou
   jusqu'à épuisement de la chaîne. Si l'écran de choix ne s'ouvre qu'au retour sur
   l'accueil (mécanisme non fixé par le contrat), un repli vers l'accueil est tenté
   ensuite par l'appelant. */
async function fermerRecompensesJusquauChoix(page: Page): Promise<void> {
	for (let i = 0; i < 6; i++) {
		if (
			await page
				.locator('#jeuxChoix')
				.isVisible()
				.catch(() => false)
		)
			return;
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

test('critères 4 et 6 : franchir le palier 1 ouvre l’écran de choix ; choisir une proposition l’ajoute seule à l’étagère, sans retour possible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(`localStorage.setItem('e2e/ludaskia_xp', '${XP_JUSTE_SOUS_NIVEAU_2}');`);
	await gotoHash(page, 'lecon-num-comparer');

	// Fiche mono-mode saisie (8 items, cf. compteur-etoiles.spec.ts) : toutes les
	// réponses justes suffisent largement à passer de 11 à un total < 34
	// (xpPourNiveau(3)), donc à ne franchir QUE le palier 1 (niveau 2).
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const n = await fields.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const ans = await fields.nth(i).getAttribute('data-answer');
		await fields.nth(i).fill(ans ?? '');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();

	await fermerRecompensesJusquauChoix(page);
	if (
		!(await page
			.locator('#jeuxChoix')
			.isVisible()
			.catch(() => false))
	) {
		// Repli : le mécanisme précis (chaîné aux autres modales, ou déclenché au
		// retour sur l'accueil) n'est pas fixé par le contrat — cf. compte rendu.
		await gotoHash(page, 'accueil');
	}
	const choix = page.locator('#jeuxChoix');
	await expect(choix).toBeVisible();

	// Contexte de l'issue #661 : au lancement, le catalogue ne compte que 2 jeux
	// (Motus, 2048) — la règle des 3 propositions ne peut donc pas s'exercer avant
	// qu'un 3ᵉ jeu existe (#664+). On vérifie ici la règle de RELÂCHEMENT (critère 5),
	// explicitement anticipée par l'issue pour ce lot.
	const propositions = choix.locator('.jeu-choix-item');
	await expect(propositions).toHaveCount(2);

	// Critère 28 : aucune formulation de prix/condition sur cet écran.
	const texteChoix = (await choix.innerText()).toLowerCase();
	expect(texteChoix).not.toContain('pour débloquer');
	expect(texteChoix).not.toContain('il te reste');
	expect(texteChoix).not.toContain("tu dois d'abord");

	await propositions.first().click();
	await expect(choix).not.toBeVisible();

	// Irrévocable : le jeu choisi est SEUL dans l'étagère (pas les deux), et l'écran
	// de choix a bien disparu — aucune trace d'un « relancer le tirage ». #btnJeux
	// n'existant qu'à l'accueil, on y repasse explicitement avant d'ouvrir l'étagère
	// (que le choix ait été fait depuis l'écran de fin de leçon ou depuis l'accueil).
	await gotoHash(page, 'accueil');
	await ouvrirEtagere(page);
	await expect(page.locator('#jeuxEtagere .jeu-item')).toHaveCount(1);

	expect(errors).toEqual([]);
});
