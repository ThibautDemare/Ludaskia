/* ============================================================
   Célébration du tour complet du catalogue, PAR MATIÈRE (#276) — smoke e2e.
   ------------------------------------------------------------
   Un trophée `tour-<matière>-<niveau>` (ex. `tour-math-ce2`) se décroche quand
   TOUTES les leçons d'UNE matière, à SON niveau actif, sont franchies —
   étoilée OU réussie à ≥ 70 % sur un essai complet en mode leçon (`estFranchie`,
   `src/core/report-lecon.ts`). La célébration passe par la modale générique de
   récompense (`showCelebration`, confettis), déclenchée à l'instant même où le
   dernier essai franchit la dernière leçon (`recordLessonRun` → `evaluateTrophies`,
   cf. `src/ui/session.ts`).

   Critère 10 (le risque désigné comme le plus probable par le cadrage) : la
   célébration part UNE fois, à la TRANSITION, et ne doit PAS repartir au simple
   affichage de l'accueil. `evaluateTrophies()` y est rappelé pour rattraper
   d'éventuels trophées (`src/ui/render.ts`, « rattrape ... sans célébration
   ici »), mais sans jamais rouvrir de modale — gater sur l'ÉTAT plutôt que sur
   la transition rejouerait le pop-up de fête à chaque visite de l'accueil.

   Amorçage : on sème `ludaskia_leconReport` (franchie SANS étoile — le chemin
   le plus représentatif, `meilleurPct` ≥ 70) pour toutes les leçons de maths
   CE2 sauf `num-comparer`, jouée ensuite pour de vrai. Le français n'est pas
   touché : seul `tour-math-ce2` doit partir.

   Sélecteurs stables : .ans, #btnVerify, #celebrate, #celebrateList,
   #celebrateOk, #leconDuJour.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, leconsDuNiveau } from './helpers';

const TITRE_TROPHEE = 'Tour complet — Mathématiques CE2'; // src/core/rewards.ts (tourMatiereTrophies)

/* Sème tout le programme de maths CE2 comme déjà franchi (au SCORE, sans
   étoile), SAUF `num-comparer` : le tour de maths ne doit basculer qu'à
   l'essai réel joué par le test, pas avant. */
function scriptSemerMathsSaufDerniere(): string {
	const autres = leconsDuNiveau('math', 'ce2').filter((id) => id !== 'num-comparer');
	const reports: Record<string, unknown> = {};
	for (const id of autres) {
		reports[`${id}@ce2`] = {
			jours: 0,
			dernierJour: '',
			reporteLe: 0,
			reprendreLe: 0,
			meilleurPct: 100,
		};
	}
	return `localStorage.setItem('e2e/ludaskia_leconReport', ${JSON.stringify(JSON.stringify(reports))});`;
}

/* Joue `num-comparer` (fiche saisie, plusieurs items `.ans`) avec UNE réponse
   fausse : le reste correct suffit à dépasser 70 % → franchie au SCORE, sans
   sans-faute (chemin que rien ne fêtait avant #276). */
async function franchirNumComparerAuScore(page: Page): Promise<void> {
	await gotoHash(page, 'lecon-num-comparer');
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const n = await fields.count();
	expect(n).toBeGreaterThan(1);
	for (let i = 0; i < n; i++) {
		const attendu = await fields.nth(i).getAttribute('data-answer');
		expect(attendu).not.toBeNull();
		if (i === 0) {
			// Réponse volontairement fausse (num-comparer attend un signe parmi < = >).
			const faux = ['<', '=', '>'].find((s) => s !== attendu)!;
			await fields.nth(i).fill(faux);
		} else {
			await fields.nth(i).fill(attendu ?? '');
		}
	}
	await page.locator('#btnVerify').click();
}

test('critère 10 : après le tour de maths CE2, revenir sur l’accueil ne rejoue PAS la célébration', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(scriptSemerMathsSaufDerniere());
	await franchirNumComparerAuScore(page);

	// La transition a bien lieu : la modale de célébration s'ouvre et nomme le
	// trophée du tour de maths (sinon le test suivant ne prouverait rien : pas de
	// transition observée = pas de risque de rejeu à vérifier).
	const modale = page.locator('#celebrate');
	await expect(modale).toBeVisible();
	await expect(page.locator('#celebrateList')).toContainText(TITRE_TROPHEE);

	// On la ferme...
	await page.locator('#celebrateOk').click();
	await expect(modale).toBeHidden();

	// ...et on revient sur l'accueil, DEUX fois de suite (dont un rechargement
	// complet, cf. gotoHash sur un hash déjà courant) : le trophée est déjà acquis
	// en stockage, `evaluateTrophies()` n'y renvoie donc plus rien de nouveau et
	// aucune modale de célébration ne doit réapparaître.
	await gotoHash(page, 'accueil');
	await expect(page.locator('#leconDuJour')).toBeVisible();
	await expect(page.locator('#celebrate')).toBeHidden();

	await gotoHash(page, 'accueil');
	await expect(page.locator('#leconDuJour')).toBeVisible();
	await expect(page.locator('#celebrate')).toBeHidden();

	expect(errors).toEqual([]);
});
