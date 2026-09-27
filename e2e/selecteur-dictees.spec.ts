/* ============================================================
   Espace encadrant (#722) — une seule recherche, cohérente avec celle de
   l'enfant (mots-clés, libellés, dictées), dans le SÉLECTEUR de leçon
   (#556, `ui/selecteur-lecon.ts`, `core/catalogue-arbre.ts`) et dans
   l'étape « Une dictée » du composeur (`ui/encadrant-seance.ts`).
   ------------------------------------------------------------
   Écrite AVANT l'implémentation : aucun des points du contrat DOM ci-dessous
   n'existe encore (`data-kind` sur les lignes, groupe `c:dictees`, filtre de
   l'étape « Une dictée », bascule "lecon" → "dictee" au choix d'une dictée
   dans le sélecteur). La suite est donc ROUGE aujourd'hui, et c'est attendu.

   Contrat DOM visé (gelé pour cette PR, cf. brief) :
     - `li.enc-sel-item[data-kind="lecon"|"dictee"]`, bouton d'action portant
       `data-lesson="<id>"` ET `data-kind` ;
     - groupe des dictées : `details.enc-sel-cat[data-selcle="c:dictees"]`,
       `summary` contenant « Dictées de mots », dans la matière Français,
       juste après la catégorie Orthographe (`c:fr-orthographe`) ;
     - composeur, étape « Une dictée » : `fieldset.enc-seance-dictees[data-def][data-etape]`
       porte désormais un `input[type="search"][data-act="seance-dictee-filtre"]`
       (nom accessible « Filtrer les dictées ») ; une case cochée reste visible
       et cochable quel que soit le filtre ; un groupe sans case visible est
       masqué (`hidden`).
     - choisir une dictée dans le sélecteur d'une étape « Une leçon précise »
       transforme l'étape en « Une dictée » (cf. `SEANCE_MODE_INFOS.dictee.label`),
       coche cette seule dictée, referme le sélecteur, pose le focus dessus.

   Chaque test nomme le(s) critère(s) numéroté(s) de l'issue #722 qu'il
   traduit, pour qu'un échec dise ce qui n'est pas tenu. Les critères 2, 12
   et 13 (déjà couverts ailleurs, ou déclaratifs sans surface propre) ne sont
   pas repris ici.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Profil MULTI-NIVEAUX : CE2 en maths, CM1 en français (`niveauParMatiere`, #225). Pas un
   profil « tout CM1 » : pour un enfant mono-niveau, la barre de jetons RETIRE le jeton de
   sa classe, que « Sa classe (CM1) » dirait à l'identique (`jetonsNiveau`,
   core/catalogue-arbre.ts) — le test du critère 5 a besoin des jetons CE2 ET CM1 à côté de
   « Sa classe », ce que seul un profil à deux niveaux offre. « Sa classe » vaut ici CM1 pour
   le français, donc pour les dictées. */
const UUID_CM1 = 'e2e-sd-cm1';
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${UUID_CM1}', name: 'Test', emoji: '🦉', updatedAt: 1, niveauReference: 'ce2', niveauParMatiere: { francais: 'cm1' } }], active: '${UUID_CM1}' }));`;

/* Liste du parent « Mots de la semaine 12 », sur le modèle de SEED_ORTHO_ETATS
   (`e2e/dates-dictees.spec.ts`) / SEED_DICTEE_SEMAINE (`e2e/recherche-lecon.spec.ts`) :
   un mot minimal + une liste qui le référence, sans niveau (toujours visible,
   critère 5 : « les listes du parent sont là sous tous les jetons »). */
const SEED_DICTEE_SEMAINE = {
	banque: {
		m1: {
			id: 'm1',
			mot: 'cahier',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-recherche-semaine',
			label: 'Mots de la semaine 12',
			motIds: ['m1'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { cahier: 'm1' },
};

/* La clé est préfixée par le profil ACTIF : la liste doit être seedée pour celui que le test
   amorce (`e2e` par défaut, `UUID_CM1` pour le profil à deux niveaux), sinon elle n'existe
   pour personne. */
async function seedDicteeSemaine(page: Page, uuid = 'e2e'): Promise<void> {
	await page.addInitScript(
		({ seed, cle }) => {
			localStorage.setItem(cle, JSON.stringify(seed));
		},
		{ seed: SEED_DICTEE_SEMAINE, cle: `${uuid}/ludaskia_ortho` },
	);
}

/* Ouvre le sous-bloc « Épingler une leçon » (bloc « À revoir ensemble »), TOUJOURS
   rendu : pas besoin de composer un programme pour y accéder. Même sélecteur que
   le composeur (#556) — la classe des sous-tests importe peu ici. */
async function ouvrirSousBlocEpingler(page: Page) {
	await gotoHash(page, 'encadrant/programme');
	const sousBloc = page.locator('.enc-block').filter({ hasText: 'Épingler une leçon' });
	await expect(sousBloc).toBeVisible();
	return sousBloc.locator('.enc-sel');
}

/* Crée un premier programme neuf avec une étape du `kind` demandé (« Une leçon
   précise » ou « Une dictée »), sur le modèle de `creerEtapeLecon`
   (`e2e/selecteur-lecon.spec.ts` lignes 41-47). Un profil fraîchement seedé génère
   toujours `d1`/`e1` comme premiers ids (`genDefId`/`genEtapeId`, core/seance.ts). */
async function creerEtape(page: Page, kind: 'lecon' | 'dictee'): Promise<void> {
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption(kind);
}

test('critère 1 — un mot-clé (« fois ») trouve une leçon dans le sélecteur du composeur', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const selecteur = await ouvrirSousBlocEpingler(page);
	await selecteur.locator('input[data-act="sel-recherche"]').fill('fois');
	await expect(
		selecteur.locator('.enc-sel-item[data-kind="lecon"][data-lesson="math-tables-multiplication"]'),
	).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 3 — le libellé cherché ET affiché est celui de l’enfant (« Multiplier par 4, par 8 », pas « × 4, × 8 »)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const selecteur = await ouvrirSousBlocEpingler(page);
	await selecteur.locator('input[data-act="sel-recherche"]').fill('multiplier');
	const ligne = selecteur.locator(
		'.enc-sel-item[data-kind="lecon"][data-lesson="math-multiplier-4-8"]',
	);
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-sel-lab')).toHaveText('Multiplier par 4, par 8');

	expect(errors).toEqual([]);
});

test('critère 4 — groupe « Dictées de mots » juste après Orthographe (Français), une dictée trouvée par son nom ou par « dictée »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedDicteeSemaine(page);
	const selecteur = await ouvrirSousBlocEpingler(page);

	// Ordre STRUCTUREL, SANS recherche (les groupes existent dans le DOM qu'ils soient
	// dépliés ou non) : le groupe des dictées suit immédiatement Orthographe parmi les
	// catégories de la matière Français.
	const matiereFr = selecteur.locator('.enc-sel-mat').filter({ hasText: 'Français' });
	const cles = await matiereFr
		.locator('.enc-sel-cats > .enc-sel-cat')
		.evaluateAll((els) => els.map((e) => e.getAttribute('data-selcle')));
	const idxOrtho = cles.indexOf('c:fr-orthographe');
	expect(idxOrtho).toBeGreaterThanOrEqual(0);
	expect(cles[idxOrtho + 1]).toBe('c:dictees');
	const groupeDictees = matiereFr.locator('details.enc-sel-cat[data-selcle="c:dictees"]');
	await expect(groupeDictees.locator('summary')).toContainText('Dictées de mots');

	// Trouvée par un morceau de son nom (liste du parent seedée).
	const recherche = selecteur.locator('input[data-act="sel-recherche"]');
	await recherche.fill('semaine');
	await expect(
		groupeDictees.locator(
			'.enc-sel-item[data-kind="dictee"][data-lesson="l-e2e-recherche-semaine"]',
		),
	).toBeVisible();

	// « dictée » (mot-clé de la CATÉGORIE, pas d'une dictée en particulier) les rend TOUTES,
	// comme un mot-clé de catégorie déplie toute une catégorie de leçons (critère 2).
	await recherche.fill('dictée');
	const nb = await selecteur.locator('.enc-sel-item[data-kind="dictee"]').count();
	expect(nb).toBeGreaterThan(1);

	expect(errors).toEqual([]);
});

test('critère 5 — jetons de niveau sur les dictées : cumulatif pour « Sa classe », exclusif par classe, listes du parent sous tous les jetons', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	await seedDicteeSemaine(page, UUID_CM1);
	const selecteur = await ouvrirSousBlocEpingler(page);
	const recherche = selecteur.locator('input[data-act="sel-recherche"]');
	const ce2 = selecteur.locator(
		'.enc-sel-item[data-kind="dictee"][data-lesson="fr-ortho-invariables-1"]',
	);
	const cm1 = selecteur.locator(
		'.enc-sel-item[data-kind="dictee"][data-lesson="fr-ortho-cm1-invariables"]',
	);

	// « Sa classe » (défaut) : cumulatif — un profil CM1 voit les prédéfinies CE2 ET CM1.
	await recherche.fill('invariables');
	await expect(ce2).toBeVisible();
	await expect(cm1).toBeVisible();

	// Jeton CE2 : seulement la prédéfinie CE2.
	await selecteur.locator('[data-act="sel-niveau"][data-niveau="ce2"]').click();
	await expect(ce2).toBeVisible();
	await expect(cm1).toHaveCount(0);

	// Jeton CM1 : seulement la prédéfinie CM1.
	await selecteur.locator('[data-act="sel-niveau"][data-niveau="cm1"]').click();
	await expect(ce2).toHaveCount(0);
	await expect(cm1).toBeVisible();

	// Liste du parent : présente sous CM1 (jeton courant)...
	await recherche.fill('semaine');
	const liste = selecteur.locator(
		'.enc-sel-item[data-kind="dictee"][data-lesson="l-e2e-recherche-semaine"]',
	);
	await expect(liste).toBeVisible();
	// ...sous CE2...
	await selecteur.locator('[data-act="sel-niveau"][data-niveau="ce2"]').click();
	await expect(liste).toBeVisible();
	// ...et sous « Sa classe ».
	await selecteur.locator('[data-act="sel-niveau"][data-niveau="sa-classe"]').click();
	await expect(liste).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 6 — épingler une dictée depuis le sélecteur pose la même épingle que le bloc « Dictées » du Suivi', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedDicteeSemaine(page);
	const selecteur = await ouvrirSousBlocEpingler(page);
	await selecteur.locator('input[data-act="sel-recherche"]').fill('semaine');

	const ligne = selecteur.locator(
		'.enc-sel-item[data-kind="dictee"][data-lesson="l-e2e-recherche-semaine"]',
	);
	const btn = ligne.locator('[data-act="epingler-selecteur"][data-kind="dictee"]');
	await expect(btn).toHaveText('Épingler');
	await btn.click();
	await expect(btn).toHaveText('Retirer');
	await expect(btn).toBeFocused();

	const epinglees = page.locator('.enc-revoir').first();
	await expect(
		epinglees.locator('.enc-revoir-item').filter({ hasText: 'Mots de la semaine 12' }),
	).toBeVisible();

	// Même épingle vue depuis l'onglet Suivi (bloc « Dictées ») : le bouton de la MÊME
	// liste (`ortho:` + id, #391/#556) dit « Retirer » lui aussi.
	await gotoHash(page, 'encadrant');
	const ligneSuivi = page.locator(
		'.enc-detail-item:has([data-lesson="ortho:l-e2e-recherche-semaine"])',
	);
	await expect(ligneSuivi).toBeVisible();
	await expect(ligneSuivi.locator('[data-act="epingler"]')).toHaveText('Retirer');

	// Retirer depuis le sélecteur : la ligne disparaît d'« Épinglées ».
	const selecteur2 = await ouvrirSousBlocEpingler(page);
	await selecteur2.locator('input[data-act="sel-recherche"]').fill('semaine');
	await selecteur2
		.locator('.enc-sel-item[data-kind="dictee"][data-lesson="l-e2e-recherche-semaine"]')
		.locator('[data-act="epingler-selecteur"][data-kind="dictee"]')
		.click();
	await expect(
		page.locator('.enc-revoir-item').filter({ hasText: 'Mots de la semaine 12' }),
	).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('critère 7 — choisir une dictée dans le sélecteur d’une étape « Une leçon précise » la transforme en « Une dictée », cochée et focalisée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await seedDicteeSemaine(page);
	await gotoHash(page, 'encadrant/programme');
	await creerEtape(page, 'lecon');

	await page.locator('[data-act="seance-cible-ouvrir"]').click();
	const selecteur = page.locator('.enc-seance-selecteur .enc-sel');
	await expect(selecteur).toBeVisible();
	await selecteur.locator('input[data-act="sel-recherche"]').fill('semaine');
	const ligneDictee = selecteur.locator(
		'.enc-sel-item[data-kind="dictee"][data-lesson="l-e2e-recherche-semaine"]',
	);
	// Assertion séparée du clic (timeout par défaut, message clair) : le clic seul mettrait
	// 30 s à échouer si la ligne n'existe pas encore, sans dire pourquoi.
	await expect(ligneDictee).toBeVisible();
	await ligneDictee.locator('[data-act="seance-cible-choisir"][data-kind="dictee"]').click();

	// Sélecteur refermé : plus aucune instance dans l'étape.
	await expect(page.locator('.enc-seance-selecteur .enc-sel')).toHaveCount(0);

	// L'étape est désormais « Une dictée » (SEANCE_MODE_INFOS.dictee.label).
	const etape = page.locator('.enc-seance-etape');
	await expect(etape.locator('.enc-seance-etape-mode')).toContainText('Une dictée');

	// La dictée choisie est cochée ET porte le focus (pas de retour en tête de page).
	const caseCochee = etape.locator(
		'fieldset.enc-seance-dictees input[data-ref="l-e2e-recherche-semaine"]',
	);
	await expect(caseCochee).toBeChecked();
	await expect(caseCochee).toBeFocused();

	// Relecture a11y (SC 4.1.3 / 3.2.2) : le changement de nature de l'étape est ANNONCÉ, le
	// focus sur la case ne disant pas ce qui vient d'arriver à l'étape elle-même.
	await expect(etape.locator('.enc-seance-etape-statut')).toContainText('Une dictée');

	await expect(page.locator('.enc-hint').filter({ hasText: /^1 activité/ })).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 8 — l’étape « Une dictée » se filtre à la frappe ; une case cochée reste visible et cochable', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await seedDicteeSemaine(page);
	await gotoHash(page, 'encadrant/programme');
	await creerEtape(page, 'dictee');

	const fieldset = page.locator('fieldset.enc-seance-dictees[data-def="d1"][data-etape="e1"]');
	await expect(fieldset).toBeVisible();

	// Nom accessible pinné : c'est l'objet même du critère 8 (label sr-only associé au champ).
	const filtre = fieldset.getByRole('searchbox', { name: 'Filtrer les dictées', exact: true });
	await expect(filtre).toBeVisible();

	// Cible cochée par défaut (#556 : la 1re dictée proposée, ici « Mots invariables (1) »,
	// premier item d'ORTHO_PREDEF — déterministe sur un profil fraîchement seedé).
	const caseCochee = fieldset.locator('input[data-ref="fr-ortho-invariables-1"]');
	await expect(caseCochee).toBeChecked();
	const nbCochesAvant = await fieldset.locator('input:checked').count();

	// Filtre sur « semaine » : ne correspond ni à la cible cochée, ni à la plupart des
	// prédéfinies — seules la liste du parent ET la case cochée restent visibles.
	await filtre.click();
	await filtre.pressSequentially('semaine', { delay: 20 });
	await expect(filtre).toBeFocused();
	// Relecture a11y (SC 4.1.3) : le nombre de dictées restant visibles est annoncé, avec
	// délai, dans une région live propre au filtre (distincte du repère des cibles cochées).
	await expect(fieldset.locator('.enc-seance-dictees-filtre-statut')).toHaveText(
		/^\d+ dictées? affichées?\.$/,
	);

	await expect(
		fieldset.locator('label.enc-seance-dictee').filter({ hasText: 'Mots de la semaine 12' }),
	).toBeVisible();
	await expect(
		caseCochee.locator('xpath=ancestor::label[contains(@class,"enc-seance-dictee")]'),
	).toBeVisible();
	await expect(
		fieldset.locator('label.enc-seance-dictee').filter({ hasText: 'Mots invariables (2)' }),
	).toBeHidden();
	// Le filtre ne décoche RIEN (critère 11) : même compte qu'avant la frappe.
	await expect(fieldset.locator('input:checked')).toHaveCount(nbCochesAvant);

	// Effacer le filtre : tout redevient visible.
	await filtre.fill('');
	await expect(
		fieldset.locator('label.enc-seance-dictee').filter({ hasText: 'Mots invariables (2)' }),
	).toBeVisible();

	// Un groupe SANS case visible (aucun de ses items ne correspond, et aucun n'y est
	// coché) disparaît entièrement — ici le groupe des listes du parent, sous un filtre
	// qu'aucune de ses entrées ne satisfait.
	const groupeListes = fieldset
		.locator('div.enc-seance-dictees-groupe')
		.filter({ hasText: 'Mots de la semaine 12' });
	await filtre.fill('zzzzintrouvable');
	await expect(groupeListes).toBeHidden();
	// La case cochée, elle, reste visible malgré tout (elle est dans l'autre groupe).
	await expect(
		caseCochee.locator('xpath=ancestor::label[contains(@class,"enc-seance-dictee")]'),
	).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 9 — plafond de 30 lignes et bouton « Afficher la suite » sous recherche, dictées comprises', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const selecteur = await ouvrirSousBlocEpingler(page);
	// « mots » plutôt qu'une lettre courante : le groupe des dictées vit sous Français, APRÈS
	// Orthographe (critère 4), donc une lettre que toutes les leçons de maths contiennent
	// remplirait les 30 premières lignes sans une seule dictée. « mots » est un mot-clé des
	// catégories Grammaire et Orthographe (19 leçons en CE2) : les dictées entrent dans le
	// lot affiché, et le total (dictées + Vocabulaire) dépasse largement 30.
	await selecteur.locator('input[data-act="sel-recherche"]').fill('mots');
	await expect(selecteur.locator('.enc-sel-item')).toHaveCount(30);
	await expect(selecteur.locator('[data-act="sel-plus"]')).toBeVisible();
	// « dictées comprises » : le plafond à 30 existe déjà pour les seules leçons (avant
	// #722) — sans cette ligne, ce test resterait vert même si les dictées n'entraient
	// jamais dans l'arbre. Au moins une ligne du lot affiché doit être une dictée.
	await expect(selecteur.locator('.enc-sel-item[data-kind="dictee"]').first()).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 10 — sans recherche, aucune dictée mêlée aux leçons d’une catégorie : le groupe « Dictées de mots » reste distinct', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedDicteeSemaine(page);
	const selecteur = await ouvrirSousBlocEpingler(page);

	// Aucune ligne « dictee » hors du groupe dédié — ni côté Mathématiques, ni dans les
	// AUTRES catégories de Français (Grammaire, Conjugaison, Vocabulaire).
	const dictesHorsGroupe = selecteur.locator(
		'.enc-sel-cat:not([data-selcle="c:dictees"]) .enc-sel-item[data-kind="dictee"]',
	);
	await expect(dictesHorsGroupe).toHaveCount(0);

	// Le groupe dédié, lui, ne contient QUE des dictées.
	const groupeDictees = selecteur.locator('details.enc-sel-cat[data-selcle="c:dictees"]');
	await expect(groupeDictees).toHaveCount(1);
	const itemsGroupe = groupeDictees.locator('.enc-sel-item');
	const total = await itemsGroupe.count();
	const dictesDedans = await itemsGroupe.locator('[data-kind="dictee"]').count();
	expect(dictesDedans).toBe(total);
	expect(total).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

test('critère 11 — choisir une LEÇON dans une étape « Une leçon précise » ne la transforme jamais en « Une dictée »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await creerEtape(page, 'lecon');

	await page.locator('[data-act="seance-cible-ouvrir"]').click();
	const selecteur = page.locator('.enc-seance-selecteur .enc-sel');
	await selecteur.locator('input[data-act="sel-recherche"]').fill('fois');
	const ligneLecon = selecteur.locator(
		'.enc-sel-item[data-kind="lecon"][data-lesson="math-tables-multiplication"]',
	);
	// Assertion séparée du clic (timeout par défaut, message clair) plutôt qu'un clic qui
	// mettrait 30 s à échouer si la ligne n'existe pas encore.
	await expect(ligneLecon).toBeVisible();
	await ligneLecon.locator('[data-act="seance-cible-choisir"][data-kind="lecon"]').click();

	const etape = page.locator('.enc-seance-etape');
	await expect(etape.locator('.enc-seance-etape-mode')).toContainText('Une leçon précise');
	await expect(etape.locator('fieldset.enc-seance-dictees')).toHaveCount(0);
	await expect(etape.locator('.enc-seance-cible-nom')).toBeVisible();

	expect(errors).toEqual([]);
});
