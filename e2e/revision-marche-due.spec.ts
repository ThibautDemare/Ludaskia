/* ============================================================
   Révision espacée : jouer et valider le mode DÛ d'un mot d'orthographe (#640).

   Écrite AVANT l'implémentation, à partir des critères GELÉS de l'issue #640
   (branche `feat/640-marche-due-revision`). Rien n'est codé : cette spec doit
   être ROUGE. Ne couvre QUE la partie écran confiée à `auteur-tests-e2e` —
   critères 4, 11, 12, 14, 15, 19, 21. Les critères 1, 2, 3, 5 à 10, 13, 16 à 18,
   20, 22 à 24 sont déjà éprouvés côté logique par `tests/revision-marche-due.test.ts`
   (ne pas les doubler ici).

   Défaut visé : `renderWordLook`/`renderWordWrite` (`src/ui/revision.ts`) servent
   invariablement le mot caché en révision, quel que soit le rang du mot, et une
   réussite en révision ne fait progresser aucun mot (seul le compteur
   d'espacement avance).

   ---------------------------------------------------------------------------
   CONTRAT DE SURFACE SUPPOSÉ (rien n'existe encore, donc rien n'est vérifié —
   c'est la meilleure hypothèse déductible des notes d'exécution de l'issue) :
   « on mutualise renderTuiles, renderMotCache et renderDictee entre le parcours
   et la révision ». On part du principe que ces trois fonctions sont RÉUTILISÉES
   telles quelles (mêmes ids DOM qu'aujourd'hui dans `ortho-runner.ts`), montées
   dans le host de révision (#revStage) avec des rappels de réussite/échec :
     - tuiles  : `#bac .tuile[data-i]` (bac), `#construction`, `#btnVerifTuiles`
     - mot caché : `#btnCacher` (révèle la saisie), `#orthoInput`, `#btnVerifMot`
     - dictée  : `#btnEcouter` (ou un bouton de rôle « Écouter… »), `#orthoInput`,
       `#btnVerifMot`
   La consigne est cherchée via `.ortho-run-consigne, .rev-consigne` (les deux
   classes existent déjà dans le code actuel, l'une côté parcours, l'autre côté
   révision) : si l'implémentation en choisit une troisième, AJUSTER cette spec,
   pas la contourner. Après un verdict, un bouton « Continuer ▶ »/« Terminer »
   peut apparaître (`#revNext`, mécanisme déjà partagé par tous les autres types
   d'item de révision) : on le clique s'il apparaît, sans l'exiger.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { STUB_SANS_VOIX, STUB_VOIX_FR } from './journal-couverture';

/* ---------- Seed banque d'orthographe (pattern repris de revision-ortho.spec.ts / ortho-liste-acquise.spec.ts) ---------- */

interface ValidationSeed {
	tuiles?: boolean;
	motCache?: boolean;
	dictee?: boolean;
}

/* `due = true` pose un palier de révision ÉCHU (prochaineRevision dans un passé
   lointain, timestamp 1 = 1970 : toujours <= Date.now()) ; `due = false` pose un
   mot fraîchement acquis (palier au maximum, hors rotation — cf. PALIER_ACQUIS). */
function motSeed(id: string, mot: string, validation: ValidationSeed, due: boolean) {
	return {
		id,
		mot,
		entourage: [],
		atelierFait: true,
		validation: { tuiles: false, motCache: false, dictee: false, ...validation },
		revision: due
			? { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: 1 }
			: { palier: 6, prochaineRevision: null, reussites: 6, dernierTest: 1 },
		origine: 'liste',
	};
}

async function seedOrtho(page: Page, seed: unknown): Promise<void> {
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

/* Bouton « Continuer ▶ »/« Terminer » : câblé pour TOUS les autres types d'item de
   révision (cf. `wireRevNext`, revision.ts). On le clique s'il apparaît, sans
   l'exiger : rien ne dit qu'une tâche d'orthographe nouvellement branchée passera
   par ce même palier plutôt que d'avancer toute seule. */
async function continuerSiPresent(page: Page): Promise<void> {
	const next = page.locator('#revNext');
	try {
		await next.waitFor({ state: 'visible', timeout: 2500 });
		await next.click();
	} catch {
		/* pas de palier intermédiaire : tant mieux, rien à cliquer */
	}
}

/* Consigne affichée, quelle que soit la classe retenue (cf. contrat de surface
   en tête de fichier). */
function consigneLocator(page: Page) {
	return page.locator('.ortho-run-consigne, .rev-consigne').first();
}

test.describe('Révision espacée : la marche due (#640)', () => {
	/* ---------------- Critère 4 : la consigne correspond à la tâche servie ---------------- */

	test('critère 4 : un mot dû aux tuiles affiche une consigne de tuiles, pas « regarde puis écris »', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_SANS_VOIX);
		await seedAideVue(page);
		await seedOrtho(page, {
			banque: { m1: motSeed('m1', 'jardin', {}, true) },
			listes: [
				{
					id: 'l-e2e-c4-tuiles',
					label: 'Test C4 tuiles',
					motIds: ['m1'],
					createdAt: 1,
					updatedAt: 1,
				},
			],
			motIdParForme: { jardin: 'm1' },
		});
		await gotoHash(page, 'revision-espacee');

		// La tâche réellement servie EST les tuiles : le bac de lettres est là.
		await page.locator('#bac .tuile[data-i]').first().waitFor({ state: 'visible' });

		const consigne = (await consigneLocator(page).innerText()).toLowerCase();
		// Échec type de l'issue : la consigne du mot caché au-dessus d'un bac de lettres.
		expect(consigne).not.toMatch(/sans le voir|cache-le/);
		expect(consigne).toMatch(/ordre|lettres/);

		expect(errors).toEqual([]);
	});

	test("critère 4 : un mot dû en dictée (voix dispo) affiche une consigne d'écoute, pas de lecture", async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_VOIX_FR);
		await seedAideVue(page);
		await seedOrtho(page, {
			banque: { m1: motSeed('m1', 'melon', { tuiles: true, motCache: true }, true) },
			listes: [
				{
					id: 'l-e2e-c4-dictee',
					label: 'Test C4 dictée',
					motIds: ['m1'],
					createdAt: 1,
					updatedAt: 1,
				},
			],
			motIdParForme: { melon: 'm1' },
		});
		await gotoHash(page, 'revision-espacee');

		// La tâche réellement servie EST la dictée : un bouton « Écouter » est là, pas de bac.
		await expect(page.getByRole('button', { name: /Écouter/ })).toBeVisible();
		await expect(page.locator('#bac .tuile[data-i]')).toHaveCount(0);

		const consigne = (await consigneLocator(page).innerText()).toLowerCase();
		expect(consigne).toMatch(/écout/);
		expect(consigne).not.toMatch(/sans le voir|cache-le|remets les lettres/);

		expect(errors).toEqual([]);
	});

	/* ---------------- Critère 19 (négatif) : jamais de sortie de session ---------------- */

	test('critère 19 : un mot dû en dictée SANS voix se dégrade en mot caché, sans jamais montrer « Travailler autrement »', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_SANS_VOIX);
		await seedAideVue(page);
		await seedOrtho(page, {
			banque: { m1: motSeed('m1', 'radis', { tuiles: true, motCache: true }, true) },
			listes: [{ id: 'l-e2e-c19', label: 'Test C19', motIds: ['m1'], createdAt: 1, updatedAt: 1 }],
			motIdParForme: { radis: 'm1' },
		});
		await gotoHash(page, 'revision-espacee');

		// Jamais l'écran de sortie du parcours (renderDicteeMuette), ni son bouton.
		const autrement = page.getByRole('button', { name: /Travailler autrement|Faire autrement/ });
		await expect(autrement).toHaveCount(0);

		// La session continue : une tâche jouable est bien là (mot caché, dégradation propre).
		await page.locator('#btnCacher').waitFor({ state: 'visible' });
		await expect(autrement).toHaveCount(0);
		await page.locator('#btnCacher').click();
		const input = page.locator('#orthoInput');
		await expect(input).toBeVisible();
		await input.fill('radis');
		await page.locator('#btnVerifMot').click();
		await continuerSiPresent(page);

		// Ni retour catalogue, ni retour liste : la session se termine normalement.
		await expect(page.locator('.rev-done')).toBeVisible();
		await expect(autrement).toHaveCount(0);

		expect(errors).toEqual([]);
	});

	/* ---------------- Critères 11 et 12 : célébration de(s) liste(s) étoilée(s) ---------------- */

	test("critère 11 : une liste qui devient acquise PENDANT la révision fait annoncer « Liste prête ! » sur l'écran de fin", async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_SANS_VOIX);
		await seedAideVue(page);
		await seedOrtho(page, {
			banque: {
				// Déjà maîtrisé (hors rotation) : sert de « reste de la liste ».
				m1: motSeed('m1', 'poire', { tuiles: true, motCache: true }, false),
				// Dernier mot dû : il ne manque que le mot caché pour que la liste soit complète.
				m2: motSeed('m2', 'tomate', { tuiles: true }, true),
			},
			listes: [
				{
					id: 'l-e2e-c11',
					label: 'Test C11',
					motIds: ['m1', 'm2'],
					createdAt: 1,
					updatedAt: 1,
				},
			],
			motIdParForme: { poire: 'm1', tomate: 'm2' },
		});
		await gotoHash(page, 'revision-espacee');

		await page.locator('#btnCacher').waitFor({ state: 'visible' });
		await page.locator('#btnCacher').click();
		await page.locator('#orthoInput').fill('tomate');
		await page.locator('#btnVerifMot').click();
		await continuerSiPresent(page);

		await expect(page.locator('.rev-done')).toBeVisible();
		const celebrate = page.locator('#celebrate');
		await expect(celebrate).toBeVisible();
		// Formulation déjà établie ailleurs pour cet évènement précis (`ortho-runner.ts`,
		// « Liste prête, bravo ! ») : on vérifie le mot-clé, pas la phrase au caractère près.
		await expect(page.locator('#celebrateList')).toContainText(/liste prête/i);

		expect(errors).toEqual([]);
	});

	test('critère 12 : deux listes étoilées dans la même session sont toutes les deux annoncées', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_SANS_VOIX);
		await seedAideVue(page);
		await seedOrtho(page, {
			banque: {
				a1: motSeed('a1', 'melon', { tuiles: true, motCache: true }, false),
				a2: motSeed('a2', 'cerise', { tuiles: true }, true),
				b1: motSeed('b1', 'fraise', { tuiles: true, motCache: true }, false),
				b2: motSeed('b2', 'ananas', { tuiles: true }, true),
			},
			listes: [
				{
					id: 'l-e2e-c12-a',
					label: 'Test C12 A',
					motIds: ['a1', 'a2'],
					createdAt: 1,
					updatedAt: 1,
				},
				{
					id: 'l-e2e-c12-b',
					label: 'Test C12 B',
					motIds: ['b1', 'b2'],
					createdAt: 1,
					updatedAt: 1,
				},
			],
			motIdParForme: { melon: 'a1', cerise: 'a2', fraise: 'b1', ananas: 'b2' },
		});
		await gotoHash(page, 'revision-espacee');

		const attendus = new Set(['cerise', 'ananas']);
		// #640 : borne figée AVANT la boucle. `attendus.size` était réévalué à
		// chaque tour alors que la boucle supprime dedans (`attendus.delete`) : il
		// retombait à 1 après le premier tour, un seul des deux mots dus était joué,
		// la session ne se terminait jamais et le critère 12 n'était prouvé par rien.
		const total = attendus.size;
		for (let i = 0; i < total; i++) {
			await page.locator('#btnCacher').waitFor({ state: 'visible' });
			// Le mot affiché AVANT d'être caché dit lequel des deux mots dus est servi :
			// on répond en conséquence, sans dépendre de l'ordre de passage.
			const affiche = (await page.locator('#motAffiche').innerText()).trim().toLowerCase();
			expect(attendus.has(affiche), `mot inattendu affiché : "${affiche}"`).toBe(true);
			attendus.delete(affiche);
			await page.locator('#btnCacher').click();
			await page.locator('#orthoInput').fill(affiche);
			await page.locator('#btnVerifMot').click();
			await continuerSiPresent(page);
		}

		await expect(page.locator('.rev-done')).toBeVisible();
		const celebrate = page.locator('#celebrate');
		await expect(celebrate).toBeVisible();
		const items = page.locator('#celebrateList li', { hasText: /liste prête/i });
		await expect(items).toHaveCount(2);

		expect(errors).toEqual([]);
	});

	/* ---------------- Critères 14 et 15 : suivi encadrant sur une tâche NOUVELLE ---------------- */

	test("critères 14 et 15 : une tâche tuiles ratée en révision journalise l'erreur ET reste notée « mot difficile »", async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(STUB_SANS_VOIX);
		await seedAideVue(page);
		await seedOrtho(page, {
			banque: { m1: motSeed('m1', 'lundi', {}, true) },
			listes: [
				{ id: 'l-e2e-c1415', label: 'Test C14-15', motIds: ['m1'], createdAt: 1, updatedAt: 1 },
			],
			motIdParForme: { lundi: 'm1' },
		});
		await gotoHash(page, 'revision-espacee');

		// Même geste que `journal-couverture.ts` (tuiles, parcours) : ne poser que deux
		// lettres du bac, le mot construit est trop court, donc faux.
		const lettres = page.locator('#bac .tuile[data-i]');
		await lettres.first().waitFor({ state: 'visible' });
		await lettres.nth(0).click();
		await lettres.nth(0).click();
		await page.locator('#btnVerifTuiles').click();

		// Deux issues possibles pour la suite (contrat non fixé) : soit la tâche
		// bascule directement sur l'atelier de correction (comme le mot caché en
		// révision aujourd'hui), soit elle autorise un nouvel essai sur le même bac.
		const atelierDone = page.locator('#btnAtelierDone');
		const bacTuile = page.locator('#bac .tuile[data-i]');
		await Promise.race([
			atelierDone.waitFor({ state: 'visible' }),
			bacTuile.first().waitFor({ state: 'visible' }),
		]).catch(() => {});

		if (await atelierDone.isVisible().catch(() => false)) {
			await atelierDone.click();
			const confirmer = page.getByRole('button', { name: 'Continuer quand même' });
			if (await confirmer.isVisible().catch(() => false)) await confirmer.click();
		} else {
			// Retry encore ouvert : on assemble le mot correct, lettre par lettre, en
			// relisant le bac à chaque tour (les tuiles déjà posées disparaissent des
			// candidates, l'ordre du bac n'a pas besoin d'être connu à l'avance).
			for (const lettre of 'lundi') {
				const bac = page.locator('#bac .tuile[data-i]');
				const n = await bac.count();
				let posee = false;
				for (let i = 0; i < n; i++) {
					const t = bac.nth(i);
					if (((await t.textContent()) ?? '').trim() === lettre) {
						await t.click();
						posee = true;
						break;
					}
				}
				expect(posee, `lettre "${lettre}" introuvable dans le bac`).toBe(true);
			}
			await page.locator('#btnVerifTuiles').click();
			await continuerSiPresent(page);
		}

		// Critère 15 : sur l'écran de fin de LA RÉVISION elle-même, le mot raté est nommé
		// « mot difficile » (#618), alors que la tâche qui l'a fait échouer est NOUVELLE.
		await expect(page.locator('.rev-done')).toBeVisible();
		const bloc = page.locator('.mots-difficiles');
		await expect(bloc).toBeVisible();
		const phrase = await bloc.locator('.mots-difficiles-phrase').innerText();
		expect(phrase).toContain('lundi');

		// Critère 14 : la même erreur remonte aussi côté encadrant, avec un énoncé lisible
		// et les deux réponses mises en forme (pattern de journal-couverture.spec.ts).
		await gotoHash(page, 'encadrant');
		const carte = page.locator('.enc-err-lecon');
		await expect(
			carte,
			'La tâche tuiles servie en révision a raté sans que rien ne remonte dans le journal (#391).',
		).toHaveCount(1);
		await carte.locator('.enc-err-sum').click();
		await expect(carte.locator('.enc-err-q').first()).not.toBeEmpty();
		await expect(carte.locator('.enc-err-donnee').first()).toHaveText(/Réponse donnée\s*:\s*\S/);
		await expect(carte.locator('.enc-err-bonne').first()).toHaveText(/Réponse attendue\s*:\s*\S/);

		expect(errors).toEqual([]);
	});
});
