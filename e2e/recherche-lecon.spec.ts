/* ============================================================
   Recherche de leçon dans l'interface enfant (#718) — smoke tests e2e,
   écrits AVANT l'implémentation (aucun code applicatif n'existe encore :
   `#rechercheLecon` n'existe pas, la suite est donc ROUGE aujourd'hui,
   et c'est attendu).
   ------------------------------------------------------------
   Contrat DOM visé (gelé pour cette PR), dans `#matieresContent` de
   l'écran `#matieres` :
     - `.recherche-lecon` (conteneur sticky) > `label.sr-only[for="rechercheLecon"]`
       + `input#rechercheLecon[type="search"]` (sans autofocus, ≥44px de haut) ;
     - `p#rechercheResume[role="status"][aria-live="polite"]` : compte de
       résultats, annoncé avec un délai (~350 ms) ;
     - `#rechercheResultats` (masqué sous 2 caractères), dans l'ordre :
       `button.rech-categorie[data-category]`, des `section.rech-groupe`
       (titre `h3.rech-groupe-titre` + `button.rech-lecon[data-id]`),
       `section.rech-dictees` (`button.rech-dictee[data-ortho]`),
       `p.rech-vide` si rien ne correspond ;
     - `.nav-cards` (cartes `[data-subject]`) : masquées si des résultats
       sont affichés, visibles si la recherche est inactive OU vide.

   Chaque test nomme le(s) critère(s) numéroté(s) de l'issue #718 qu'il
   traduit, pour qu'un échec dise ce qui n'est pas tenu.

   Écart avec la donnée « CM1 : les deux » suggérée pour le brief de cette
   spec — voir la note sur le test des critères 7/17 plus bas : le
   catalogue réel ne la permet pas sans violer le critère 7 lui-même.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Profil CM1 dédié (comme `e2e/selecteur-lecon.spec.ts` lignes 32-36) : seul moyen
   d'amorcer un niveau différent du défaut CE2 posé par `gotoHash`/`ENSURE_NIVEAU`. */
const UUID_CM1 = 'e2e-rl-cm1';
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${UUID_CM1}', name: 'Test', emoji: '🦉', updatedAt: 1, niveauReference: 'cm1' }], active: '${UUID_CM1}' }));`;

/* Liste du parent « Mots de la semaine 12 », sur le modèle de SEED_ORTHO_ETATS
   (`e2e/dates-dictees.spec.ts` lignes ~47-117) : un mot minimal + une liste qui le
   référence. Profil par défaut 'e2e' (celui posé par `ENSURE_NIVEAU`), clé préfixée
   à la main comme le fait dates-dictees.spec.ts. */
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

test('critère 1 — champ de recherche visible sans défilement, cible ≥44px, sans autofocus', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');

	// Nom accessible du champ : pinné, c'est l'objet même du critère (label lié par `for`,
	// consommé par un lecteur d'écran) — pas une formulation d'énoncé rejouable autrement.
	const label = page.locator('label.sr-only[for="rechercheLecon"]');
	await expect(label).toHaveText('Cherche une leçon');

	const champ = page.locator('#rechercheLecon');
	await expect(champ).toBeVisible();
	// SC 2.5.3 (Label in Name, relecture a11y) : le texte VISIBLE (placeholder) commence par
	// le nom accessible — un enfant en commande vocale dit ce qu'il lit.
	const placeholder = (await champ.getAttribute('placeholder')) ?? '';
	expect(placeholder.startsWith((await label.textContent()) ?? '\u0000')).toBe(true);
	await expect(champ).toHaveAttribute('type', 'search');
	await expect(champ).toHaveAttribute('autocomplete', 'off');
	await expect(champ).not.toHaveAttribute('autofocus', /.*/);

	// Visible SANS défiler : entièrement dans le viewport chargé (profil mobile Pixel 5).
	const viewport = page.viewportSize();
	expect(viewport).not.toBeNull();
	const box = await champ.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.y).toBeGreaterThanOrEqual(0);
	expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
	expect(box!.height).toBeGreaterThanOrEqual(44); // cible tactile

	// Pas d'autofocus : le clavier virtuel ne doit pas s'ouvrir seul à l'arrivée.
	const activeId = await page.evaluate(() => document.activeElement?.id ?? null);
	expect(activeId).not.toBe('rechercheLecon');

	expect(errors).toEqual([]);
});

test('critère 2 — insensible à la casse et aux accents (« Geometrie » = « géométrie »)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');

	async function resultatsActuels() {
		await expect(resume).toHaveText(/\d/); // attend la fin du délai d'annonce
		const cats = await page
			.locator('.rech-categorie')
			.evaluateAll((els) => els.map((e) => e.getAttribute('data-category')).sort());
		const lecons = await page
			.locator('.rech-lecon')
			.evaluateAll((els) => els.map((e) => e.getAttribute('data-id')).sort());
		return { cats, lecons };
	}

	await champ.fill('Geometrie');
	const sansAccent = await resultatsActuels();
	expect(sansAccent.cats).toContain('math-geometrie');

	await champ.fill('géométrie');
	const avecAccent = await resultatsActuels();

	expect(avecAccent.cats).toEqual(sansAccent.cats);
	expect(avecAccent.lecons).toEqual(sansAccent.lecons);

	expect(errors).toEqual([]);
});

test('critères 3 et 5 — une leçon trouvée par son libellé affiché, une catégorie par son nom (clic → son écran)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');

	// Critère 3 : « multiplier » rend la leçon dont le libellé AFFICHÉ (core/lessons.ts,
	// pas le `label` du catalogue « × 4, × 8 ») contient « Multiplier ».
	await champ.fill('multiplier');
	await expect(resume).toHaveText(/\d/);
	const resultatMultiplier = page.locator('.rech-lecon[data-id="math-multiplier-4-8"]');
	await expect(resultatMultiplier).toBeVisible();
	// Le texte du bouton EST le libellé affiché de la leçon (contrat DOM) : pinné à dessein.
	await expect(resultatMultiplier).toHaveText('Multiplier par 4, par 8');

	// Critère 5 : « geometrie » (sans accent) propose la catégorie, un clic ouvre son écran.
	await champ.fill('geometrie');
	await expect(resume).toHaveText(/\d/);
	const categorieGeom = page.locator('.rech-categorie[data-category="math-geometrie"]');
	await expect(categorieGeom).toBeVisible();
	await categorieGeom.click();
	await expect(page).toHaveURL(/#categorie-math-geometrie$/);

	expect(errors).toEqual([]);
});

test('critère 6 — une dictée du parent trouvée par son nom, un tap la lance', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_DICTEE_SEMAINE);
	await gotoHash(page, 'matieres');

	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');
	await champ.fill('semaine');
	await expect(resume).toHaveText(/\d/);

	const dictee = page.locator('.rech-dictee[data-ortho="l-e2e-recherche-semaine"]');
	await expect(dictee).toBeVisible();
	await expect(dictee).toContainText('Mots de la semaine 12');
	await dictee.click();
	await expect(page).toHaveURL(/#ortho-/); // ortho-<id> (découverte) ou ortho-mode-<id>

	expect(errors).toEqual([]);
});

/* Critères 7 et 17 (respect du niveau actif, aucune fuite hors niveau) — deux tests
   symétriques plutôt qu'un seul avec bascule de profil en cours de route (reload +
   ré-empilement d'addInitScript), pour rester lisible et isolé comme le reste de la suite.

   ÉCART assumé avec la donnée « sous un profil CM1... les deux » du brief : le catalogue
   réel a `math-multiples-25` en `levels: ['ce2']` SEULE (`src/core/catalog.ts:375-381`,
   confirmé par l'ordre pédagogique CM1 qui ne la liste pas, `src/data/ordre-pedagogique.ts:116-121` —
   son commentaire dit explicitement que math-multiples-50 « réinvestit » la notion, pas
   qu'elle réaffiche la leçon CE2). Le critère 7 exige lui-même « le même filtrage que le
   catalogue parcouru à la main » (`getLessonsByCategory`/`niveauActifMatiere`, filtre STRICT
   par niveau, `src/core/catalog.ts:1286-1291`) — cumulatif pour les dictées SEULEMENT, dit le
   critère en toutes lettres. Faire remonter « Les multiples de 25 » à un profil CM1 violerait
   donc le critère 7 lui-même et le critère 17 (aucune leçon hors niveau). Le test ci-dessous
   tient la version SYMÉTRIQUE et cohérente avec ces deux critères : CM1 trouve sa propre leçon,
   pas celle du CE2. */
test('critère 7 — profil CE2 : « multiples » trouve la leçon CE2, pas celle réservée au CM1', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres'); // profil par défaut = CE2 (ENSURE_NIVEAU)
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');
	await champ.fill('multiples');
	await expect(resume).toHaveText(/\d/);

	await expect(page.locator('.rech-lecon[data-id="math-multiples-25"]')).toBeVisible();
	await expect(page.locator('.rech-lecon[data-id="math-multiples-50"]')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('critère 17 — profil CM1 : « multiples » trouve la leçon CM1, aucune fuite de la leçon CE2', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	await gotoHash(page, 'matieres');
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');
	await champ.fill('multiples');
	await expect(resume).toHaveText(/\d/);

	await expect(page.locator('.rech-lecon[data-id="math-multiples-50"]')).toBeVisible();
	await expect(page.locator('.rech-lecon[data-id="math-multiples-25"]')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('critère 8 — chaque résultat porte sa matière et sa catégorie en texte, un tap lance la leçon', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');
	await champ.fill('multiplier');
	await expect(resume).toHaveText(/\d/);

	const groupe = page.locator('.rech-groupe').filter({ has: page.locator('.rech-groupe-titre') });
	const titre = groupe.locator('.rech-groupe-titre').first();
	await expect(titre).toContainText('Mathématiques');
	await expect(titre).toContainText('Calcul mental');

	await page.locator('.rech-lecon[data-id="math-multiplier-4-8"]').click();
	// Même chemin de lancement qu'une carte `.lesson-item` : lecon-<id> (mono-mode) ou
	// mode-<id> (choix de mode) — le contrat n'impose que « le même chemin », pas l'un ou l'autre.
	await expect(page).toHaveURL(/#(lecon|mode)-math-multiplier-4-8$/);

	expect(errors).toEqual([]);
});

test('critère 10 — champ vidé : retour exact à l’écran des matières, sans zone de résultats résiduelle', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');
	const resultats = page.locator('#rechercheResultats');
	const cartes = page.locator('#matieresContent .nav-cards [data-subject]');

	await champ.fill('multiplier');
	await expect(resume).toHaveText(/\d/);
	await expect(resultats).toBeVisible();
	// Contrat DOM : les cartes sont MASQUÉES (display:none via `hidden`), pas retirées du
	// DOM — c'est leur visibilité qu'on mesure, pas leur nombre.
	await expect(page.locator('#matieresContent .nav-cards')).toBeHidden();
	await expect(cartes.first()).toBeHidden();

	await champ.fill('');
	await expect(resultats).toBeHidden();
	await expect(cartes).toHaveCount(2);
	await expect(cartes.first()).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 11 — aucune correspondance : message positif, les cartes de matière restent accessibles', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');
	await champ.fill('zzzz');
	await expect(resume).toHaveText(/\d/);

	await expect(page.locator('p.rech-vide')).toBeVisible();
	await expect(page.locator('.rech-lecon')).toHaveCount(0);
	await expect(page.locator('#matieresContent .nav-cards [data-subject]')).toHaveCount(2);

	expect(errors).toEqual([]);
});

test('critère 12 — retour arrière restaure la recherche ; la carte d’accueil la réinitialise', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');
	await champ.fill('multiplier');
	await expect(resume).toHaveText(/\d/);

	await page.locator('.rech-lecon[data-id="math-multiplier-4-8"]').click();
	await expect(page).toHaveURL(/#(lecon|mode)-math-multiplier-4-8$/);

	// Retour arrière (navigateur) : texte tapé ET résultats restaurés.
	await page.goBack();
	await expect(page).toHaveURL(/#matieres$/);
	await expect(champ).toHaveValue('multiplier');
	await expect(page.locator('#rechercheResultats')).toBeVisible();

	// Repartir de l'accueil (navigation SPA, pas un rechargement) : la recherche est réinitialisée.
	await page.locator('#backHomeMatieresTop').click();
	await expect(page).toHaveURL(/#accueil$/);
	await page.locator('#cardLecon .go').click();
	await expect(page).toHaveURL(/#matieres$/);
	await expect(champ).toHaveValue('');

	expect(errors).toEqual([]);
});

test('critères 13 et 14 — le champ garde le focus pendant la frappe, le résumé est annoncé (délai)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	const champ = page.locator('#rechercheLecon');
	const resume = page.locator('#rechercheResume');
	await expect(resume).toHaveAttribute('role', 'status');
	await expect(resume).toHaveAttribute('aria-live', 'polite');

	await champ.click();
	await champ.pressSequentially('multiplier', { delay: 30 }); // frappe lettre par lettre
	// Seul le corps des résultats doit être re-rendu à chaque lettre : le champ, lui, garde
	// le focus (et donc la position du curseur) du début à la fin de la frappe.
	await expect(champ).toBeFocused();
	await expect(resume).toHaveText(/\d/); // annonce différée, après le délai (~350 ms)

	expect(errors).toEqual([]);
});

test('critère 16 — sans recherche, le parcours matière → catégorie reste inchangé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	await page.locator('#matieresContent .nav-cards [data-subject="math"]').click();
	await expect(page).toHaveURL(/#matiere-math$/);

	expect(errors).toEqual([]);
});
