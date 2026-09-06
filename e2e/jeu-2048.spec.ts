/* ============================================================
   2048 (#661) — smoke e2e écrit AVANT l'implémentation (rouge attendu), contre
   les critères numérotés de l'issue et le contrat `tmp-contrat.md` (racine du
   dépôt, temporaire).

   Sélecteurs stables (cf. tmp-contrat.md, plus ceux posés par l'implémentation) :
   #btnJeux, #jeuxEtagere, .jeu-item, #jeuEcran, #btnQuitterJeu,
   .g2048-case[data-valeur] (`"0"` = case vide), .g2048-fin, #g2048Record.

   Ce que cette spec NE teste PAS, et pourquoi : la fin de partie (critère 15,
   seconde moitié) et la persistance du meilleur score au travers d'une
   nouvelle partie (critère 17) — `.g2048-fin`/`#g2048Record` existent, mais
   jouer jusqu'à blocage complet de la grille (aucun des 4 coups ne bouge)
   resterait un scénario long et non déterministe pour un smoke test (le
   nombre de coups nécessaires dépend du tirage des tuiles). Ces deux points
   restent du ressort des Vitest sur `partieFinie`/`enregistrerScore`.
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

/* L'état des 16 cases, dans l'ordre du DOM : "0" = vide, sinon la valeur de la
   tuile. Sélecteur structuré (posé par l'implémentation), à préférer au texte
   brut de l'écran — insensible au score ou à un libellé qui changerait. */
async function lireGrille(page: Page): Promise<string[]> {
	return page
		.locator('.g2048-case')
		.evaluateAll((els) => els.map((el) => el.getAttribute('data-valeur') ?? ''));
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

	const depart = await lireGrille(page);
	// Sanity du porteur : une nouvelle partie place exactement DEUX tuiles — si ce
	// n'est pas le cas, la suite du test ne prouverait plus ce qu'elle annonce.
	expect(
		depart.filter((v) => v !== '0'),
		'la grille de départ doit avoir 2 tuiles',
	).toHaveLength(2);

	// Deux tuiles de départ, quatre directions possibles : au moins l'une d'elles
	// bouge nécessairement (grille loin d'être pleine/bloquée en tout début de
	// partie). On boucle plutôt que de parier sur UNE direction précise (cf.
	// e2e/README.md, « un cas précis dans un tirage à plusieurs branches se boucle »).
	let bouge = false;
	for (const [dx, dy] of DIRECTIONS) {
		await glisser(page, dx, dy);
		const apres = await lireGrille(page);
		if (apres.some((v, i) => v !== depart[i])) {
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
