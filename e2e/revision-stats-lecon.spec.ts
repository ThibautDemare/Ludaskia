/* ============================================================
   Révision espacée → statistiques de leçon (#541, volet 1 côté correctif).
   ------------------------------------------------------------
   Avant ce correctif, `renderDone` (`src/ui/revision.ts`) n'écrivait qu'un run
   de régularité (`recordRun('revision-espacee', …)`) et un point d'activité :
   la performance en rappel différé — précisément ce qui dit si une notion est
   retenue — n'atteignait jamais le niveau de maîtrise affiché au parent.
   Désormais `renderDone` agrège les réponses par leçon (`perLesson`) et les
   enregistre via `recordLessonStats(perLesson, 'revision')`, dont la forme
   stockée est `ludaskia_lessonStats` → `<leçon>@<niveau>`.

   Deux pièges verrouillés ici :
   - une session composée UNIQUEMENT de mots d'orthographe n'a aucune stat de
     leçon à écrire, mais doit garder son point d'activité (`ludaskia_activity`,
     sinon elle disparaît du graphe de l'espace encadrant) ;
   - le point d'activité ne doit pas être écrit DEUX FOIS quand la session
     contient des items de leçon (`recordLessonStats` journalise déjà
     l'activité lui-même ; un second appel à `recordSessionActivity`
     produirait un doublon dans le graphe).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Une leçon réelle du catalogue CE2, DUE (palier intermédiaire, échéance passée) —
   même seed que encadrant-revision.spec.ts. « Les compléments » génère un item
   numérique à champ unique (`comp`, cf. core/items.ts) : une seule saisie suffit
   à boucler la session. */
const SEED_LECON_DUE = `(() => {
  const now = Date.now(); const day = 86400000;
  localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify({
    'math-complements@ce2': { palier: 2, prochaineRevision: now - day, reussites: 2, dernierTest: now - 3 * day },
  }));
})();`;

test('révision espacée sur une leçon due : stats de leçon écrites + UN SEUL point d’activité', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_LECON_DUE);
	await gotoHash(page, 'revision-espacee');

	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	// Peu importe l'exactitude (recordLessonStats compte le TOTAL de questions, pas
	// seulement les bonnes) : une valeur quelconque suffit à boucler la session.
	await input.fill('1');
	await page.locator('#revValidate').click();
	await page.locator('#revNext').click(); // seul item de la session → « Terminer »

	await expect(page.locator('.rev-done')).toContainText('terminée');

	const { stats, activity } = await page.evaluate(() => ({
		stats: JSON.parse(localStorage.getItem('e2e/ludaskia_lessonStats') || 'null'),
		activity: JSON.parse(localStorage.getItem('e2e/ludaskia_activity') || 'null'),
	}));

	expect(stats).not.toBeNull();
	const stat = stats['math-complements@ce2'];
	expect(stat).toBeTruthy();
	expect(stat.attempts).toBe(1);
	expect(stat.questions).toBe(1);

	// Un seul point d'activité pour toute la session (pas de doublon recordLessonStats
	// + recordSessionActivity) : le journal était vide avant, il ne contient qu'UNE entrée.
	expect(Array.isArray(activity)).toBe(true);
	expect(activity).toHaveLength(1);
	expect(activity[0].k).toBe('revision');

	expect(errors).toEqual([]);
});

/* Un seul mot d'orthographe DÛ, aucune leçon due : la session ne produit aucune stat
   de leçon (rien à agréger dans `perLesson`), mais doit garder son point d'activité
   via le repli explicite `recordSessionActivity('revision')` — sinon elle
   disparaîtrait du graphe de l'espace encadrant. */
const SEED_MOT_DU = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'jardin',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: false, dictee: false },
			revision: { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: 1 },
			origine: 'liste',
		},
	},
	listes: [
		{ id: 'l-e2e-rs-lecon', label: 'Test stats mot', motIds: ['w1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { jardin: 'w1' },
};

test('révision espacée composée UNIQUEMENT de mots d’orthographe : pas de stat de leçon, mais un point d’activité conservé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_MOT_DU);
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('.rev-word')).toHaveText('jardin');
	await page.locator('#revHide').click();
	await page.locator('#revInput').fill('jardin');
	await page.locator('#revValidate').click();
	await page.locator('#revNext').click();

	await expect(page.locator('.rev-done')).toContainText('terminée');

	const { stats, activity } = await page.evaluate(() => ({
		stats: localStorage.getItem('e2e/ludaskia_lessonStats'),
		activity: JSON.parse(localStorage.getItem('e2e/ludaskia_activity') || 'null'),
	}));

	// Aucune stat de leçon écrite (perLesson vide → recordLessonStats jamais appelé).
	expect(stats).toBeNull();

	// Mais le point d'activité est là : le repli `recordSessionActivity('revision')`
	// a bien pris le relais.
	expect(Array.isArray(activity)).toBe(true);
	expect(activity).toHaveLength(1);
	expect(activity[0].k).toBe('revision');

	expect(errors).toEqual([]);
});
