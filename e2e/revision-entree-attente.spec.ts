/* ============================================================
   Borner l'entrée en rotation (#690) : smoke tests e2e.
   ------------------------------------------------------------
   Une leçon déclarée « vue en classe » (#478) n'entre plus en rotation à la
   date de la déclaration : elle est mise EN ATTENTE (`etatHorsRotation`), sans
   échéance, et démarre à sa première rencontre réelle ou par la passe de
   promotion bornée par un budget hebdomadaire (`promouvoirEntreesEnAttente`,
   progress.ts). La logique pure (budget, soupape des 4 semaines, ordre des
   niveaux) est couverte par ~100 tests Vitest (revision-budget-entree.test.ts,
   revision-entree-rotation.test.ts) : cette spec ne rejoue PAS ce calcul, elle
   vérifie ce qu'il ne peut pas voir — le RENDU et le DÉCLENCHEMENT réels.

   Quatre choses couvertes, une par groupe de tests ci-dessous :
   1. Critère 8 — le compte de la file est lisible côté encadrant.
   2. Critère 7 (+ garde-fou de régression) — un élément différé n'apparaît
      NULLE PART comme dû : ni sur la carte d'accueil, ni dans une séance de
      révision.
   3. Le DÉCLENCHEMENT de la passe de promotion (`applyActive`, profiles.ts) :
      sans appelant, la file ne se vide jamais en production alors que la
      logique pure est verte. Constaté ici en semant directement l'état de la
      file d'attente puis en chargeant l'app.
   4. Critère 14 — une leçon en attente reste visible et jouable.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Amorce un profil dont la SEULE trace de révision est un élément EN ATTENTE
   (état `etatHorsRotation` : palier 0, prochaineRevision null, jamais testé) —
   exactement ce qu'une déclaration « vu en classe » pose, AVANT toute
   rencontre réelle ou promotion. Aucun autre état de révision seedé : un
   profil qui n'a que ça doit se comporter comme un profil NEUF (critère 7).
   `page.addInitScript(fn, arg)` (comme `seedRevisionGroupes`,
   encadrant-revision.spec.ts) plutôt qu'une chaîne de script : `arg` est
   sérialisé par Playwright, aucun échappement manuel à écrire. */
async function seedEnAttente(page: Page, uuid: string, lessonKey = 'num-comparer@ce2') {
	await page.addInitScript(
		(opts: { uuid: string; lessonKey: string }) => {
			localStorage.setItem(
				'ludaskia_profiles',
				JSON.stringify({
					list: [
						{ uuid: opts.uuid, name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
					],
					active: opts.uuid,
				}),
			);
			localStorage.setItem(
				opts.uuid + '/ludaskia_lessonRevision',
				JSON.stringify({
					[opts.lessonKey]: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
				}),
			);
		},
		{ uuid, lessonKey },
	);
}

/* ---------- 1. Critère 8 : compte visible côté encadrant ---------- */

test("critère 8 — après une déclaration « vu en classe », l'encadrant lit un compte « en attente »", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/reglages');

	// Déclare UNE leçon jamais jouée (profil neuf) : math-doubles, catégorie Calcul mental
	// (même catégorie/leçon que la persistance de vu-en-classe.spec.ts).
	const cat = page.locator('.enc-vu-cat[data-cat="math-calcul-mental"]');
	await cat.locator('.enc-vu-expand').click();
	await cat.locator('.enc-vu-lecon[data-lesson="math-doubles"]').check();

	// Bascule vers l'onglet Suivi (clic in-page, pas de navigation) : le récap Révision y vit.
	await page.locator('.enc-tab[data-tab="suivi"]').click();

	const section = page.locator('.enc-rev-section');
	await expect(section).toBeVisible();

	// La synthèse du bloc nomme la file d'attente : sans ce compte, l'adulte qui vient de
	// déclarer une leçon ne verrait RIEN bouger et croirait la déclaration perdue.
	await expect(section.locator('.enc-hint')).toContainText("1 en attente d'une première rencontre");

	// Le résumé de LA catégorie concernée porte aussi le compte (`.enc-rev-d`, pas
	// `.enc-cat-d` seul : cette classe est partagée avec « Notions par catégorie »,
	// filtrer sur `.enc-rev-d` cible bien le bloc Révision).
	const groupe = section.locator('.enc-rev-d').filter({ hasText: 'Calcul mental' });
	await expect(groupe.locator('.enc-cat-counts')).toHaveText('1 en attente de rencontre');

	expect(errors).toEqual([]);
});

/* ---------- 2. Critère 7 : rien n'apparaît comme dû, nulle part ---------- */
const UUID_ATTENTE = 'e2e-attente';

test("critère 7 — carte d'accueil : un élément différé ne se lit jamais « tout révisé » (régression corrigée)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedEnAttente(page, UUID_ATTENTE);
	await gotoHash(page, 'accueil');

	// Rien à réviser AUJOURD'HUI (l'élément n'a pas d'échéance) → carte inactive, comme un
	// profil neuf.
	await expect(page.locator('#cardRevision')).toHaveClass(/card-inactive/);
	// Piège que cette PR corrige : `aDesRevisions` comptait autrefois toute clé présente,
	// donc un profil qui n'a QUE des déclarations en attente affichait « Bravo, tu as tout
	// révisé ! » (.rev-ok) sans que l'enfant ait jamais rien joué. Le message attendu est
	// désormais celui du profil NEUF (.rev-empty) : on vérifie la classe rendue, pas la
	// phrase exacte, sauf pour prouver l'absence du badge fautif.
	await expect(page.locator('#recRevision .rev-empty')).toBeVisible();
	await expect(page.locator('#recRevision .rev-ok')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test("critère 7 — séance de révision : un élément différé n'est proposé à aucune séance", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedEnAttente(page, UUID_ATTENTE);
	await gotoHash(page, 'revision-espacee');

	// La révision espacée ne pioche que dans les éléments DUS ; un élément en attente
	// (jamais rencontré, sans échéance) n'en fait pas partie → écran « rien à réviser »,
	// pas un exercice sur l'élément différé.
	await expect(page.locator('.rev-done-lab')).toContainText('Rien à réviser');
	await expect(page.locator('#revInput, #ltuiSlot, .rev-choices')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- 3. Déclenchement de la passe de promotion ----------
   `promouvoirEntreesEnAttente` n'est appelée QUE depuis `applyActive`
   (profiles.ts), à l'activation d'un profil — jamais au montage d'un écran.
   Sans cet appelant réel, la file ne se viderait JAMAIS en production, alors
   que les tests Vitest de la fonction pure restent verts (ils l'appellent
   directement). On sème ici la file d'attente BRUTE (`ludaskia_revisionFile`,
   clé interne à progress.ts) avec une entrée récente et sous le budget, puis on
   charge l'app UNE SEULE fois : le premier `gotoHash` d'un test est une vraie
   navigation depuis about:blank, donc `main.ts` s'exécute en entier
   (`initProfiles` → `applyActive`). Si la promotion n'était plus câblée,
   l'entrée resterait « en attente » ; si elle l'est, le récap encadrant la
   montre déjà « en révision » sans qu'aucune rencontre réelle n'ait eu lieu. */
const UUID_PROMO = 'e2e-promo';
const LESSON_KEY_PROMO = 'num-comparer@ce2';

async function seedFileAttente(page: Page, uuid: string, lessonKey: string) {
	await page.addInitScript(
		(opts: { uuid: string; lessonKey: string }) => {
			const now = Date.now();
			const jour = 86400000;
			localStorage.setItem(
				'ludaskia_profiles',
				JSON.stringify({
					list: [
						{ uuid: opts.uuid, name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
					],
					active: opts.uuid,
				}),
			);
			localStorage.setItem(
				opts.uuid + '/ludaskia_lessonRevision',
				JSON.stringify({
					[opts.lessonKey]: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
				}),
			);
			// Budget par défaut (plafond 12 → budget 4) largement au-dessus de cette seule
			// entrée, déclarée il y a 1 jour (dans la fenêtre de 7 jours, bien avant la soupape
			// des 4 semaines) : seule la passe de promotion la fait sortir de l'attente, aucun
			// autre mécanisme ne pourrait expliquer sa sortie.
			localStorage.setItem(
				opts.uuid + '/ludaskia_revisionFile',
				JSON.stringify({
					attente: { [opts.lessonKey]: now - jour },
					promues: [],
				}),
			);
		},
		{ uuid, lessonKey },
	);
}

test("la passe de promotion tourne au chargement de l'app : une déclaration récente entre en rotation sans rencontre réelle", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedFileAttente(page, UUID_PROMO, LESSON_KEY_PROMO);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	await expect(section).toBeVisible();
	await expect(section.locator('.enc-rev-item')).toHaveCount(1);
	// Si la promotion n'avait pas tourné, la synthèse porterait « 1 en attente d'une
	// première rencontre » (cf. test du critère 8 ci-dessus) au lieu de « en révision ».
	await expect(section.locator('.enc-hint')).toHaveText('1 entrée en révision.');

	expect(errors).toEqual([]);
});

/* ---------- 4. Critère 14 : une leçon en attente reste jouable ----------
   Même état « en attente » que le groupe 2 (jamais rencontrée), mais ici on
   vérifie l'accès CÔTÉ ENFANT : catalogue puis exécution réelle de la leçon. */
const UUID_JOUABLE = 'e2e-jouable';

test('critère 14 — une leçon en attente reste visible dans le catalogue', async ({ page }) => {
	const errors = watchErrors(page);
	await seedEnAttente(page, UUID_JOUABLE);
	await gotoHash(page, 'categorie-math-numeration');

	await expect(page.locator('.lesson-item[data-id="num-comparer"]')).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 14 — une leçon en attente reste jouable (saisie, correction)', async ({ page }) => {
	const errors = watchErrors(page);
	await seedEnAttente(page, UUID_JOUABLE);
	await gotoHash(page, 'lecon-num-comparer'); // mode par défaut = saisie

	const field = page.locator('.ans').first();
	await field.waitFor();
	const expected = await field.getAttribute('data-answer');
	expect(['<', '=', '>']).toContain(expected);
	await field.fill(expected ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();

	expect(errors).toEqual([]);
});
