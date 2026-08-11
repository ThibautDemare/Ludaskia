/* ============================================================
   Coordination des deux cartes « à faire » de l'accueil (#516) — smoke tests e2e.
   ------------------------------------------------------------
   « À revoir » (#aRevoir, ui/a-revoir-card.ts) et « Ta prochaine leçon »
   (#leconDuJour, ui/lecon-du-jour.ts) pouvaient proposer EXACTEMENT la même
   leçon : l'arbitrage qui les déduplique vit dans core/accueil-propositions.ts
   et se joue depuis render.ts (renderHomeStats). Ici on vérifie le résultat
   VISIBLE de l'arbitrage, pas la logique pure (déjà couverte côté Vitest).

   La tête du fil « Ta prochaine leçon » d'un profil neuf CE2 est lue dans le
   DOM (#leconDuJour[data-lesson]) plutôt que figée en dur : robuste à un
   réordonnancement de l'ordre pédagogique. On seed ensuite `ludaskia_revoir`
   par `page.evaluate` + `page.reload` (pas `addInitScript`, qui rejouerait
   AVANT le 1er rendu et empêcherait de lire la tête de fil « naturelle » au
   préalable) — même pattern que programme-a-revoir.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, leconsDuNiveau } from './helpers';

/* Tête du fil « Ta prochaine leçon » d'un profil neuf CE2, lue dans le DOM
   après un premier accueil SANS rien épinglé. */
async function têteFilDuJour(page: Page): Promise<string> {
	await gotoHash(page, 'accueil');
	const id = await page.locator('#leconDuJour').getAttribute('data-lesson');
	if (!id) throw new Error('Profil neuf CE2 sans tête de fil : programme vide ?');
	return id;
}

/* Un second id de leçon CE2 (toutes matières), garanti différent de `têteFil` —
   dérivé du catalogue plutôt que figé en dur (#516 exige juste UNE autre entrée
   active, pas une leçon précise). */
function autreLeconId(têteFil: string): string {
	const candidats = [...leconsDuNiveau('math', 'ce2'), ...leconsDuNiveau('francais', 'ce2')];
	const autre = candidats.find((id) => id !== têteFil);
	if (!autre) throw new Error('Catalogue CE2 trop court pour un second pin distinct');
	return autre;
}

/* Seed la file « à revoir » du profil e2e actif puis recharge la page (PAS
   addInitScript : la file doit s'appliquer APRÈS le 1er rendu déjà passé). */
async function seedRevoirEtRecharge(page: Page, ids: string[]): Promise<void> {
	await page.evaluate(
		(list) => localStorage.setItem('e2e/ludaskia_revoir', JSON.stringify(list)),
		ids,
	);
	await page.reload({ waitUntil: 'networkidle' });
}

/* Clique « Voir une autre leçon » sur #leconDuJour et renvoie la leçon affichée
   ensuite. Ne touche à rien en storage (état purement DOM) : sert à lire, AVANT
   tout seed, les prochains maillons du fil naturel (seq1, seq2 après la tête). */
async function cliquerAutreLeconDuJour(page: Page): Promise<string> {
	await page.locator('#leconDuJour [data-lj="autre"]').click();
	const id = await page.locator('#leconDuJour').getAttribute('data-lesson');
	if (!id) throw new Error('« Voir une autre leçon » (leçon du jour) a vidé la carte');
	return id;
}

test('une seule leçon épinglée, qui est la leçon du jour : les deux cartes restent visibles et distinctes (#516)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const têteFil = await têteFilDuJour(page);

	// Une seule entrée épinglée, et c'est justement la tête de fil : « À revoir »
	// ne PEUT pas céder (aucune autre entrée) → c'est « Ta prochaine leçon » qui
	// avance d'un cran (règle 2 de core/accueil-propositions.ts).
	await seedRevoirEtRecharge(page, [têteFil]);

	const aRevoir = page.locator('#aRevoir');
	await expect(aRevoir).toBeVisible();
	await expect(aRevoir).toHaveAttribute('data-lesson', têteFil);
	await expect(aRevoir).toHaveAttribute('data-kind', 'lecon');

	const leconDuJour = page.locator('#leconDuJour');
	await expect(leconDuJour).toBeVisible();
	// Jamais l'état « Bravo, tu as fait le tour » : il reste bien une leçon à
	// proposer, seulement pas CELLE que « À revoir » affiche déjà.
	await expect(leconDuJour).toHaveAttribute('data-mode', 'lesson');
	await expect(leconDuJour).not.toHaveAttribute('data-lesson', têteFil);
	const autre = await leconDuJour.getAttribute('data-lesson');
	expect(autre).toBeTruthy();

	expect(errors).toEqual([]);
});

test('deux leçons épinglées dont la leçon du jour : « À revoir » affiche l’autre, « Ta prochaine leçon » garde la tête (#516)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const têteFil = await têteFilDuJour(page);
	const autreId = autreLeconId(têteFil);

	// Deux entrées épinglées : « À revoir » a de la marge, elle cède la première
	// (règle 1) et affiche l'autre pin ; « Ta prochaine leçon » n'a donc rien à
	// éviter et garde la tête de son fil.
	await seedRevoirEtRecharge(page, [têteFil, autreId]);

	await expect(page.locator('#aRevoir')).toHaveAttribute('data-lesson', autreId);
	await expect(page.locator('#leconDuJour')).toHaveAttribute('data-lesson', têteFil);

	expect(errors).toEqual([]);
});

test('« Voir une autre leçon » (À revoir) fonctionne toujours avec deux entrées épinglées', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const têteFil = await têteFilDuJour(page);
	const autreId = autreLeconId(têteFil);
	await seedRevoirEtRecharge(page, [têteFil, autreId]);

	const aRevoir = page.locator('#aRevoir');
	await expect(aRevoir).toHaveAttribute('data-lesson', autreId);

	// Choix EXPLICITE de l'enfant : le bouton court-circuite la déduplication
	// (cf. choisirARevoir) et fait réapparaître la tête de fil — comportement
	// documenté, pas une régression du doublon.
	await page.locator('[data-ar="autre"]').click();
	await expect(aRevoir).toHaveAttribute('data-lesson', têteFil);

	expect(errors).toEqual([]);
});

test('« Voir une autre leçon » de #leconDuJour évite lui aussi la leçon affichée par #aRevoir (#516)', async ({
	page,
}) => {
	const errors = watchErrors(page);

	// Fil naturel (rien épinglé, rien en storage) : seq0 = tête de fil, seq1/seq2 lus
	// en cliquant deux fois « Voir une autre leçon » — lecture DOM pure, aucun impact
	// sur le stockage, donc le seed qui suit repart bien du même fil.
	const seq0 = await têteFilDuJour(page);
	const seq1 = await cliquerAutreLeconDuJour(page);
	const seq2 = await cliquerAutreLeconDuJour(page);
	// Garde-fou : le scénario suppose 3 maillons distincts (catalogue CE2 largement
	// assez fourni). S'il échouait, ce serait le catalogue qui a rétréci, pas le test.
	expect(new Set([seq0, seq1, seq2]).size).toBe(3);

	// Deux pins dont la tête de fil : « À revoir » cède la première et affiche seq1
	// (l'autre pin) ; « Ta prochaine leçon » garde seq0 et mémorise seq1 à éviter.
	await seedRevoirEtRecharge(page, [seq0, seq1]);
	const aRevoir = page.locator('#aRevoir');
	const leconDuJour = page.locator('#leconDuJour');
	await expect(aRevoir).toHaveAttribute('data-lesson', seq1);
	await expect(leconDuJour).toHaveAttribute('data-lesson', seq0);
	await expect(leconDuJour).toHaveAttribute('data-eviter', seq1);

	// Sans le saut, un clic ramènerait seq1 (le doublon que l'accueil vient d'éviter,
	// puisque seq1 suit naturellement seq0 dans le fil) : avec, la carte SAUTE à seq2.
	const suivante = await cliquerAutreLeconDuJour(page);
	expect(suivante).toBe(seq2);
	expect(suivante).not.toBe(seq0); // pas un no-op : la carte a bien changé
	expect(suivante).not.toBe(seq1); // ne retombe pas sur ce que montre « À revoir »

	// Plus rien épinglé : la trace d'évitement ne doit pas persister à tort.
	await seedRevoirEtRecharge(page, []);
	await expect(aRevoir).toBeHidden();
	await expect(leconDuJour).toHaveAttribute('data-lesson', seq0);
	expect(await leconDuJour.getAttribute('data-eviter')).toBeNull();

	expect(errors).toEqual([]);
});
