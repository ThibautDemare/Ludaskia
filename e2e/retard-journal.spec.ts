/* ============================================================
   Journal du retard au moment de la correction (#691).
   ------------------------------------------------------------
   Le gate statique (tests/retard-journal-gate.test.ts) prouve, en lisant le SOURCE, qu'un
   appel de journalisation précède chaque avancement de révision. Il ne prouve pas que le
   chemin s'exécute pour de bon depuis l'interface. Ici, on joue une VRAIE session du mode
   Révision (widget réel, réponse réelle) puis on relit `localStorage` pour vérifier que
   `ludaskia_retards` s'est effectivement rempli, avec des champs cohérents.

   Deux avanceurs distincts existent (`avancerLessonRevision` / `avancerMotRevision`,
   core/progress.ts et core/orthographe/store.ts) : une session par avanceur, pour ne pas
   ne prouver que la moitié du chemin.

   Fichier dédié plutôt qu'un ajout à revision.spec.ts : ces deux tests ont une assertion
   finale que revision.spec.ts n'a jamais (lecture de `localStorage` après coup), et
   regrouper les deux avanceurs ici garde le sujet (#691) lisible d'un coup d'œil.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const DAY = 86400000;

/* Même schéma que `seedDueLesson` de revision.spec.ts, avec un retard CONTRÔLÉ (au lieu
   d'un `prochaineRevision: 1` fixe) : `retardRelatif` doit rester un nombre fini et
   positif, ce qu'un timestamp de 1970 aurait aussi produit, mais un retard de quelques
   jours est plus proche de ce qu'un profil réel donnerait à lire. */
function seedLeconDue(uuid: string, lessonId: string, joursRetard: number): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: uuid,
			}),
		)});
    localStorage.setItem('${uuid}/ludaskia_lessonRevision', JSON.stringify({
      ${JSON.stringify(lessonId)}: { palier: 0, prochaineRevision: Date.now() - ${joursRetard * DAY}, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(uuid)}
  `;
}

test('retard (#691) : une session de révision sur une LEÇON remplit ludaskia_retards', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const uuid = 'e2e-retard-lecon';
	// « Je compare les nombres » (num-comparer) : due depuis 2 jours sur un palier 0
	// (intervalle 1 jour) → retard mesurable dès la première correction.
	await page.addInitScript(seedLeconDue(uuid, 'num-comparer', 2));
	await gotoHash(page, 'revision-espacee');

	// Geste central : comparaison en tuiles (même interaction que revision.spec.ts), réponse
	// JUSTE déduite de l'énoncé, pour connaître `reussi` attendu sans ambiguïté.
	await expect(page.locator('#ltuiSlot')).toBeVisible();
	const enonce = await page.locator('.ltui-enonce').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]);
	const b = Number(m![2]);
	const signe = a < b ? '<' : a > b ? '>' : '=';
	await page.locator('.ltui-tuile', { hasText: signe }).first().click();
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();

	const retards = await page.evaluate(
		(u) => JSON.parse(localStorage.getItem(`${u}/ludaskia_retards`) || 'null'),
		uuid,
	);
	expect(Array.isArray(retards)).toBe(true);
	expect(retards.length).toBeGreaterThanOrEqual(1);
	const entry = retards[0];
	expect(entry.kind).toBe('lecon');
	// Clé namespacée par niveau (`nsKey`, core/progress.ts) : le profil de test est CE2
	// (niveau par défaut d'ENSURE_NIVEAU, cf. helpers.ts).
	expect(entry.id).toBe('num-comparer@ce2');
	expect(entry.palier).toBe(0); // palier de DÉPART, avant l'avancement qui l'écrase
	expect(entry.reussi).toBe(true);
	expect(typeof entry.ts).toBe('number');
	expect(Number.isFinite(entry.retardRelatif)).toBe(true);
	expect(entry.retardRelatif).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

test("retard (#691) : une session de révision sur un MOT d'orthographe remplit ludaskia_retards", async ({
	page,
}) => {
	const errors = watchErrors(page);
	const uuid = 'e2e-retard-mot';
	// Mot « chat », tous les modes déjà validés (mastère) : `prochaineActivite` sert alors la
	// marche la plus haute JOUABLE (`marcheLaPlusHaute`) — en Chromium headless, sans aucune
	// voix disponible (`dicteeDisponible()` → false, cf. e2e/README.md), c'est déterministe :
	// le mot caché (« motCache »), jamais les tuiles ni la dictée. Due depuis 6 jours sur un
	// palier 1 (intervalle 3 jours) → retard mesurable.
	await page.addInitScript((u) => {
		const now = Date.now();
		const day = 86400000;
		localStorage.setItem(
			'ludaskia_profiles',
			JSON.stringify({ list: [{ uuid: u, name: 'Test', emoji: '🦊', updatedAt: 1 }], active: u }),
		);
		localStorage.setItem(
			`${u}/ludaskia_ortho`,
			JSON.stringify({
				banque: {
					m1: {
						id: 'm1',
						mot: 'chat',
						entourage: [],
						atelierFait: true,
						validation: { tuiles: true, motCache: true, dictee: true },
						revision: {
							palier: 1,
							prochaineRevision: now - 6 * day,
							reussites: 3,
							dernierTest: now - 10 * day,
						},
						origine: 'liste',
					},
				},
				listes: [
					{ id: 'l-rev', label: 'Liste révision', motIds: ['m1'], createdAt: 1, updatedAt: 1 },
				],
				motIdParForme: { chat: 'm1' },
			}),
		);
	}, uuid);
	await gotoHash(page, 'revision-espacee');

	// Geste central : mot caché (mêmes ids que ortho-revision.spec.ts) — on cache, on écrit
	// le mot, on vérifie.
	await expect(page.locator('#btnCacher')).toBeVisible();
	await page.locator('#btnCacher').click();
	await page.locator('#orthoInput').fill('chat');
	await page.locator('#btnVerifMot').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();

	const retards = await page.evaluate(
		(u) => JSON.parse(localStorage.getItem(`${u}/ludaskia_retards`) || 'null'),
		uuid,
	);
	expect(Array.isArray(retards)).toBe(true);
	expect(retards.length).toBeGreaterThanOrEqual(1);
	const entry = retards[0];
	expect(entry.kind).toBe('mot');
	expect(entry.id).toBe('m1'); // wordId, jamais le mot lui-même
	expect(entry.palier).toBe(1);
	expect(entry.reussi).toBe(true);
	expect(typeof entry.ts).toBe('number');
	expect(Number.isFinite(entry.retardRelatif)).toBe(true);
	expect(entry.retardRelatif).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});
