/* ============================================================
   2048 (#661) — smoke e2e écrit AVANT l'implémentation (rouge attendu), contre
   les critères numérotés de l'issue et le contrat `tmp-contrat.md` (racine du
   dépôt, temporaire).

   Sélecteurs stables (cf. tmp-contrat.md) : #btnJeux, #jeuxEtagere, .jeu-item,
   #jeuEcran, #btnQuitterJeu.

   AUCUN sélecteur stable n'existe encore pour une CASE/TUILE du 2048 (le
   contrat n'en donne pas). Cette spec compare donc le texte brut de #jeuEcran
   avant/après un glissement plutôt que de compter des tuiles précises — cf.
   compte rendu pour la proposition d'un sélecteur du type
   `.g2048-case[data-valeur]`, qui rendrait ce test moins générique.

   Ce que cette spec NE teste PAS : la fin de partie (critère 15, seconde
   moitié) et la persistance du meilleur score (critère 17) — aucun sélecteur
   stable pour un écran de fin ou un affichage de score n'existe dans le
   contrat ; jouer une partie 2048 jusqu'à blocage complet serait par ailleurs
   un scénario long et fragile pour un smoke test. Ces deux points relèvent
   des Vitest sur `partieFinie`/`enregistrerScore`.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedJeuxPossedesScript, ouvrirJeuDepuisEtagere } from './helpers';

/* Glisse au centre de #jeuEcran dans une direction (dx, dy en pixels) : simule le
   geste au doigt en souris (pointerdown/move/up), sans dépendre d'un clavier
   physique (critère 18 : jouable au doigt, sans clavier). */
async function glisser(page: Page, dx: number, dy: number): Promise<void> {
	const box = await page.locator('#jeuEcran').boundingBox();
	if (!box) throw new Error('#jeuEcran introuvable');
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
	await page.mouse.up();
}

const DIRECTIONS: [number, number][] = [
	[150, 0], // droite
	[-150, 0], // gauche
	[0, 150], // bas
	[0, -150], // haut
];

/* ---------- Critère 15 : jouable, un glissement change la grille ---------- */

test('critère 15 : un glissement change la grille du 2048', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['2048']));
	await gotoHash(page, 'accueil');
	await ouvrirJeuDepuisEtagere(page);

	const avant = await page.locator('#jeuEcran').innerText();

	// Deux tuiles de départ, quatre directions possibles : au moins l'une d'elles
	// bouge nécessairement (grille loin d'être pleine/bloquée en tout début de
	// partie). On boucle plutôt que de parier sur UNE direction précise (cf.
	// e2e/README.md, « un cas précis dans un tirage à plusieurs branches se boucle »).
	let bouge = false;
	for (const [dx, dy] of DIRECTIONS) {
		await glisser(page, dx, dy);
		const apres = await page.locator('#jeuEcran').innerText();
		if (apres !== avant) {
			bouge = true;
			break;
		}
	}
	expect(bouge, 'aucune des quatre directions n’a changé la grille').toBe(true);

	expect(errors).toEqual([]);
});

/* ---------- Critères 12, 23, 28 (négatifs) ---------- */

test('critères 12, 23, 28 (négatifs) : jouer au 2048 ne bouge ni XP ni étoiles, sans compte à rebours ni texte de prix', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['2048']));
	await gotoHash(page, 'accueil');

	const xpAvant = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_xp'));
	const starsAvant = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_stars'));

	await ouvrirJeuDepuisEtagere(page);

	// Critère 12 : jamais de compte à rebours visible — aucun texte au format
	// mm:ss, le format déjà utilisé ailleurs pour un VRAI chrono (#sprintTime).
	await expect(page.locator('#jeuEcran')).not.toContainText(/\d{1,2}:\d{2}/);

	await glisser(page, 150, 0);
	await glisser(page, 0, 150);

	// Critère 28 : aucune formulation de prix/condition sur l'écran de jeu.
	const texte = (await page.locator('#jeuEcran').innerText()).toLowerCase();
	expect(texte).not.toContain('pour débloquer');
	expect(texte).not.toContain('il te reste');
	expect(texte).not.toContain("tu dois d'abord");

	// Critère 23 : ni XP ni étoiles n'ont bougé après avoir joué.
	const xpApres = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_xp'));
	const starsApres = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_stars'));
	expect(xpApres).toBe(xpAvant);
	expect(starsApres).toBe(starsAvant);

	expect(errors).toEqual([]);
});
