/* ============================================================
   Étape « Une dictée » SANS cible atteignable (#657) — smoke tests e2e.
   ------------------------------------------------------------
   Une étape « Une dictée » peut se retrouver sans AUCUNE dictée qu'elle puisse
   proposer (profil sans liste, toutes les cases décochées, liste supprimée
   après coup, programme copié vers un profil qui n'a pas ces listes) : avant le
   correctif, l'enfant voit une tuile morte (« Dictée indisponible ») et le
   programme ne peut plus jamais être déclaré terminé.

   Cinq critères couverts ici (un test par critère, numéroté comme l'issue) :
   1. ajout refusé si le profil n'a aucune dictée disponible ;
   2. décochage de la dernière cible refusé ;
   3. une étape sans cible atteignable n'apparaît pas côté enfant ;
   4. elle ne bloque pas la complétion du reste du programme ;
   6. elle reste visible (et modifiable) côté encadrant.

   Le critère 5 n'existe pas dans l'énoncé de l'issue (numérotation d'origine).
   Le critère 4 est tenu AU CŒUR par des tests Vitest sur `vueSeanceDuJour`
   (autre agent) ; la version ici n'en est que le reflet VISIBLE (l'écran
   #seance annonce « tout ton programme du jour » fait), volontairement
   redondante avec le test unitaire — c'est cette redondance qui prouve que le
   correctif se voit vraiment à l'écran, pas seulement dans l'état interne.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Leçon réelle du catalogue CE2, mono-mode, fiche de 12 items (reprise du
   repère de programme-carte-terminee.spec.ts) : cible FIXE toujours valide,
   pour isoler le défaut à la SEULE étape « dictée ». */
const LESSON_ID = 'math-complements';

/* Id de dictée qui ne correspond à AUCUNE dictée prédéfinie ni liste du
   profil : reproduit directement les scénarios (3) « liste supprimée après
   coup » et (4) « programme copié vers un profil sans ces listes » de
   l'issue, sans dépendre d'un mécanisme de suppression réel. */
const ORPHAN_REF = 'orpheline-e2e-inexistante';

/* ---------- Critères 1 & 2 : compositeur encadrant (ajout / décochage) ---------- */

/* Profil dont le français est calé sur un niveau SANS AUCUNE dictée prédéfinie
   (toutes les entrées d'ORTHO_PREDEF sont 'ce2' ; un niveau 'ce1' n'en voit
   aucune, cf. listOrthoLecons) et sans liste créée : `groupesDictee` renvoie
   alors 0 entrée, exactement la précondition du critère 1. Le reste de
   l'appli (maths, etc.) garde son niveau CE2 habituel via `niveauReference`. */
const SEED_NIVEAU_FR_SANS_DICTEE = `(function(){
	var KEY = 'ludaskia_profiles';
	var m = { list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2', niveauParMatiere: { francais: 'ce1' } }], active: 'e2e' };
	localStorage.setItem(KEY, JSON.stringify(m));
	localStorage.setItem('e2e/ludaskia_tour_seen', 'true');
	localStorage.setItem('e2e/ludaskia_parents_seen', 'true');
})();`;

test('critère 1 : ajouter « Une dictée » à un profil sans aucune dictée disponible est refusé, avec une alerte lisible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_NIVEAU_FR_SANS_DICTEE);
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('dictee');

	// Effet : l'étape n'est PAS ajoutée à la définition (aucune fieldset de dictée,
	// aucune étape dans la liste) — pas seulement « ajoutée mais vide ».
	await expect(page.locator('.enc-seance-etapes .enc-seance-etape')).toHaveCount(0);
	await expect(page.locator('fieldset.enc-seance-dictees')).toHaveCount(0);

	// Alerte lisible par l'adulte, même emplacement que le conflit de récurrence.
	await expect(page.locator('.enc-warn[role="alert"]')).toHaveText(/\S/);

	// Persistance : un rechargement ne fait pas réapparaître l'étape refusée.
	await gotoHash(page, 'encadrant/programme');
	await expect(page.locator('.enc-seance-etapes .enc-seance-etape')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('critère 2 : décocher la dernière dictée cochée d’une étape est refusé, la case redevient cochée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('dictee');

	const fieldset = page.locator('fieldset.enc-seance-dictees');
	const caseCochee = fieldset.locator('input[data-act="seance-dictee-toggle"]:checked');
	await expect(caseCochee).toHaveCount(1); // pré-cochée par défaut (comportement #463)
	const ref = await caseCochee.getAttribute('data-ref');
	expect(ref, 'la case pré-cochée doit porter un data-ref').toBeTruthy();

	// Locator scopé par `data-ref` (STABLE), pas par `:checked` : ce dernier ne matche
	// plus l'élément dès qu'on l'a décoché, ce qui ferait boucler indéfiniment le
	// mécanisme de re-tentative de `.uncheck()` (element "disparu" à chaque relecture).
	// Et `click()` plutôt que `uncheck()` : cette dernière EXIGE que la case finisse
	// décochée, ce qui est exactement ce que le correctif doit empêcher — elle
	// échouerait donc sur le comportement attendu. Le clic pose le geste, les
	// assertions qui suivent disent ce qu'il doit produire.
	const memeCase = fieldset.locator(`input[data-act="seance-dictee-toggle"][data-ref="${ref}"]`);
	await memeCase.click();

	// Alerte lisible par l'adulte, même emplacement que le conflit de récurrence.
	await expect(page.locator('.enc-warn[role="alert"]')).toHaveText(/\S/);

	// Effet : rien n'est persisté, la case redevient cochée — y compris après un
	// rechargement complet de la page (pas seulement un artefact du re-rendu en mémoire).
	await expect(memeCase).toBeChecked();
	await gotoHash(page, 'encadrant/programme');
	await expect(
		page.locator(
			`fieldset.enc-seance-dictees input[data-act="seance-dictee-toggle"][data-ref="${ref}"]`,
		),
	).toBeChecked();

	expect(errors).toEqual([]);
});

/* ---------- Critères 3, 4 & 6 : programme SEEDÉ avec une dictée orpheline ---------- */

/* Programme à deux étapes : une leçon RÉELLE et toujours valide (isole le défaut), et
   une dictée dont l'UNIQUE cible ne correspond à rien de disponible pour le profil —
   scénario (3)/(4) de l'issue, posé directement en stockage (aucun mécanisme actuel de
   suppression de liste n'est nécessaire pour l'atteindre, et le compositeur seul ne
   permet plus de le recréer une fois le critère 2 tenu). */
function seedProgrammeLeconPlusDicteeOrpheline(): string {
	const defs = [
		{
			id: 'd1',
			etapes: [
				{ id: 'e1', kind: 'lecon', ref: LESSON_ID, count: 1 },
				{ id: 'e2', kind: 'dictee', refs: [ORPHAN_REF], count: 1 },
			],
			recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
		},
	];
	return `localStorage.setItem('e2e/ludaskia_seance', ${JSON.stringify(JSON.stringify(defs))});`;
}

/* Ferme les éventuelles modales de récompense (étoile / niveau) qui intercepteraient
   le clic suivant (même pattern que programme-carte-terminee.spec.ts). */
async function fermerModalesRecompense(page: Page): Promise<void> {
	for (let i = 0; i < 5; i++) {
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

test('critère 3 : une étape « Une dictée » sans cible atteignable n’apparaît pas dans le programme de l’enfant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedProgrammeLeconPlusDicteeOrpheline());
	await gotoHash(page, 'seance');

	// Seule la leçon (toujours valide) produit une tuile — pas de tuile morte
	// « Dictée indisponible » pour l'étape orpheline : elle n'apparaît PAS du tout,
	// ni active ni inactive.
	await expect(page.locator('.programme-tuiles .programme-tuile')).toHaveCount(1);
	await expect(page.locator('.programme-tuile[data-act="lancer"]')).toHaveCount(1);
	await expect(page.locator('.programme-tuile-hint', { hasText: /indisponible/i })).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('critère 4 : une dictée sans cible atteignable ne bloque pas la complétion du reste du programme', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedProgrammeLeconPlusDicteeOrpheline());
	await gotoHash(page, 'seance');

	// Fait la SEULE étape atteignable (la leçon) ; l'étape « dictée » orpheline reste
	// à jamais hors d'atteinte (aucun mécanisme ne peut la réaliser).
	await page.locator('.programme-tuile[data-act="lancer"]').first().click();
	await expect(page).toHaveURL(new RegExp(`#lecon-${LESSON_ID}$`));

	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const count = await fields.count();
	for (let i = 0; i < count; i++) {
		const ans = (await fields.nth(i).getAttribute('data-answer')) ?? '';
		await fields.nth(i).fill(ans);
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await fermerModalesRecompense(page);

	// Retour au programme (persisté, donc un rechargement suffit à revoir l'état à jour) :
	// tout ce qui pouvait être fait l'a été → le programme se déclare terminé, malgré
	// l'étape « dictée » à jamais hors d'atteinte.
	await gotoHash(page, 'seance');
	await expect(page.locator('.programme-fini')).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 6 : une étape « Une dictée » sans cible atteignable reste visible, avec ses cases à cocher, côté encadrant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedProgrammeLeconPlusDicteeOrpheline());
	await gotoHash(page, 'encadrant/programme');

	// Les DEUX étapes restent listées (la leçon ET la dictée orpheline) : l'adulte doit
	// pouvoir retrouver l'étape en panne pour lui redonner une cible.
	await expect(page.locator('.enc-seance-etapes .enc-seance-etape')).toHaveCount(2);
	const fieldset = page.locator('fieldset.enc-seance-dictees[data-def="d1"][data-etape="e2"]');
	await expect(fieldset).toBeVisible();
	// Des cases COCHABLES sont là (le pool des dictées disponibles au profil) : de quoi
	// réparer l'étape en choisissant une nouvelle cible. Le nombre exact n'est pas le
	// point (il varie avec le contenu du catalogue) — qu'il y en ait au moins une l'est.
	await expect(fieldset.locator('input[data-act="seance-dictee-toggle"]')).not.toHaveCount(0);
	// La cible orpheline demandée par l'adulte reste visible et COCHÉE dans son propre
	// groupe (« Cibles actuelles (indisponibles) ») : il ne perd pas la trace de ce qu'il
	// avait choisi, seulement l'information que ça ne correspond plus à rien de dispo.
	const caseOrpheline = fieldset.locator(
		`input[data-act="seance-dictee-toggle"][data-ref="${ORPHAN_REF}"]`,
	);
	await expect(caseOrpheline).toHaveCount(1);
	await expect(caseOrpheline).toBeChecked();

	expect(errors).toEqual([]);
});

/* Ce dernier test est VERT dès l'écriture. Deux mutations distinctes le feraient rougir :
   (a) dans `etapeHTML`, conditionner l'affectation de `cibleBloc` pour une étape « dictee »
   à la présence d'au moins une cible valide (masquerait toute la fieldset : plus aucune
   case, l'étape en panne deviendrait irréparable) ; (b) dans `checkboxesDicteeHTML`, rendre
   toujours `groupes = dictees` (retirer la branche qui ajoute le groupe « Cibles actuelles
   (indisponibles) » quand `orphelins.length`) : la cible orpheline redemandée disparaîtrait
   silencieusement de l'écran, l'adulte ne saurait plus ce qu'il avait choisi. Raisonné sur
   le code lu, PAS rejoué : la consigne de cette tâche interdit toute modification, même
   temporaire, de `src/` (« interdiction absolue de toucher src/ »), ce qui entre en
   tension avec la règle habituelle « vérifier la mutation pour de vrai » — signalé dans
   le compte rendu plutôt que tranché en silence. */
