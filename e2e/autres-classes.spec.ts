/* ============================================================
   Travailler une leçon d'une autre classe sans changer la classe du profil (#772).
   ------------------------------------------------------------
   Spec écrite AVANT le code (cadrage #772) : elle doit être ROUGE tant que le
   sélecteur de classe, la pastille de recherche, le réglage parent et le badge
   de « Travaillé récemment » n'existent pas. Les attentes viennent des critères
   de l'issue et de ses précisions du 20/10, jamais du code.

   Couvre (numéros = critères d'acceptation #772) :
     2, 6   — Catégorie : choisir la classe inférieure change la page (titre,
              leçons), sans bandeau ni badge par leçon.
     9      — Sélecteur : groupe radio nommé, une seule option tabulable,
              flèches, cibles d'au moins 48 px.
     5      — Persistance : la classe choisie survit au retour d'une leçon,
              pas à l'accueil ni au rechargement.
     7      — Classe supérieure : bandeau.
     12     — Recherche : pastille, lancement direct, retour dans la bonne classe.
     13     — Orthographe : les dictées suivent la classe choisie.
     14, 22 — Réglage parent : coché par défaut ; décoché, plus de sélecteur ni
              de résultat hors classe.
     15     — « Travaillé récemment » : badge de classe d'origine, une ligne par
              classe.
     21     — (négatif) rien de « CE2 » sur « Ta prochaine leçon ».

   Leçons de test (données réelles) : `math-numeration` pour le sélecteur (CE2
   seule : `num-decompose-100` ; CM1 seule : `num-decompose-multiplicative` ;
   commune : `num-comparer`), `geo-figures-proprietes` (CE2 seule, runner QCM
   mono-mode, donc un écran de résultat avec `#leconBack`) pour les parcours qui
   lancent une leçon.

   Libellés : les chaînes « Leçons de : », « classe supérieure » et « · CE2 » du
   titre viennent des critères de l'issue ; leur formulation finale sera relue
   par `redacteur-contenu-francais`, d'où des expressions régulières tolérantes.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Profil `e2e` (celui qu'amorce `gotoHash`) avec une classe de référence donnée ;
   `ENSURE_NIVEAU` préserve la méta déjà posée. */
function seedProfil(niveauReference: 'ce2' | 'cm1'): string {
	return `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: '${niveauReference}' }], active: 'e2e' }));`;
}

const radio = (page: Page, classe: string) =>
	page.locator(
		`.classe-choix button[role="radio"][data-act="choisir-classe"][data-classe="${classe}"]`,
	);

/* Joue une leçon QCM jusqu'à l'écran de résultat (`#leconBack`), sans dépendre du
   nombre de questions ni de la forme du tirage : on clique le 1er choix puis l'action
   suivante, jusqu'à voir le bouton de retour. */
async function jouerQcmJusquAuRetour(page: Page): Promise<void> {
	const choix = page.locator('.sprint-choice');
	const retour = page.locator('#leconBack');
	for (let i = 0; i < 30; i++) {
		await expect(choix.first().or(retour)).toBeVisible();
		if (await retour.isVisible()) break;
		await choix.first().click();
		await page.locator('#lqcmActions button').click();
	}
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}
	await expect(retour).toBeVisible();
}

test("Catégorie : le sélecteur de classe s'ouvre sur la classe du profil et passe la page en CE2 (#772 crit. 2, 6)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, 'categorie-math-numeration');

	// Crit. 1 (observable) : sélecteur nommé, classe du profil cochée à l'ouverture.
	const choix = page.locator('.classe-choix');
	await expect(choix).toBeVisible();
	await expect(choix).toContainText(/Leçons de\s*:/); // libellé de l'issue, intentionnel
	await expect(choix.locator('[role="radiogroup"][aria-label="Classe des leçons"]')).toBeVisible();
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'false');
	await expect(page.locator('#categorieTitle')).not.toContainText('·');
	await expect(page.locator('.lesson-item[data-id="num-decompose-multiplicative"]')).toBeVisible();

	// Crit. 2 : toute la page passe en CE2.
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#categorieTitle')).toContainText(/Numération\s*·\s*CE2/);
	await expect(page.locator('.lesson-item[data-id="num-decompose-100"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-decompose-multiplicative"]')).toHaveCount(0);

	// Crit. 6 : vers le bas, ni bandeau (le signal est le segment et le titre).
	await expect(page.locator('.classe-bandeau')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('Sélecteur : une seule option tabulable, flèches gauche/droite, cibles de 48 px (#772 crit. 9)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, 'categorie-math-numeration');

	const options = page.locator('.classe-choix button[role="radio"][data-act="choisir-classe"]');
	await expect(options.first()).toBeVisible();
	const n = await options.count();
	expect(n).toBeGreaterThanOrEqual(2);

	// Roving tabindex : une seule option dans l'ordre de tabulation.
	await expect(options.and(page.locator('[tabindex="-1"]'))).toHaveCount(n - 1);

	// Cibles tactiles.
	for (let i = 0; i < n; i++) {
		const box = await options.nth(i).boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
	}

	// Flèches : la sélection suit le clavier (CE2 est juste avant CM1 dans l'ordre scolaire).
	await radio(page, 'cm1').focus();
	await page.keyboard.press('ArrowLeft');
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'false');
	await page.keyboard.press('ArrowRight');
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');

	expect(errors).toEqual([]);
});

test("Persistance : la classe choisie survit au retour d'une leçon, pas à l'accueil ni au rechargement (#772 crit. 5)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, 'categorie-math-geometrie');

	// Vue CE2 : `geo-figures-proprietes` n'existe qu'en CE2.
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await page.locator('.lesson-item[data-id="geo-figures-proprietes"]').click();
	await expect(page).toHaveURL(/#lecon-geo-figures-proprietes$/);
	await jouerQcmJusquAuRetour(page);
	await page.locator('#leconBack').click();

	// Retour d'une leçon lancée depuis la page : toujours en CE2.
	await expect(page).toHaveURL(/#categorie-math-geometrie$/);
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('.lesson-item[data-id="geo-figures-proprietes"]')).toBeVisible();

	// Sortie de la catégorie (accueil) puis retour : classe du profil.
	await gotoHash(page, 'accueil');
	await expect(page.locator('#leconDuJour')).toBeVisible();
	await gotoHash(page, 'categorie-math-geometrie');
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');

	// Rechargement de l'appli, depuis une vue CE2 : classe du profil.
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await page.reload({ waitUntil: 'networkidle' });
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');

	expect(errors).toEqual([]);
});

test("Classe supérieure : la vue CM1 d'un profil CE2 porte le bandeau (#772 crit. 7)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('ce2'));
	await seedAideVue(page);
	await gotoHash(page, 'categorie-math-numeration');

	// Dans sa propre classe : pas de bandeau (sinon la suite ne prouverait rien).
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('.classe-bandeau')).toHaveCount(0);

	await radio(page, 'cm1').click();
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#categorieTitle')).toContainText(/Numération\s*·\s*CM1/);
	await expect(page.locator('.lesson-item[data-id="num-decompose-multiplicative"]')).toBeVisible();
	const bandeau = page.locator('.classe-bandeau');
	await expect(bandeau).toBeVisible();
	await expect(bandeau).toContainText(/classe supérieure/i);

	expect(errors).toEqual([]);
});

test('Calcul (CE2 seul) : un profil CM1 arrive sur « Bientôt disponible » et peut passer en CE2 (#772 précision 1)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, 'categorie-math-calcul');

	await expect(page.locator('.cat-empty')).toBeVisible();
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	await radio(page, 'ce2').click();
	await expect(page.locator('.cat-empty')).toHaveCount(0);
	await expect(page.locator('.lesson-item').first()).toBeVisible();

	expect(errors).toEqual([]);
});

test('Recherche : un résultat CE2 porte la pastille, se lance, et le retour ouvre la catégorie en CE2 (#772 crit. 12)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, 'matieres');

	// Résultat de la classe du profil : ni data-classe, ni pastille, une seule fois.
	await page.locator('#rechercheLecon').fill('Je compare les nombres');
	const propre = page.locator('.rech-lecon[data-id="num-comparer"]');
	await expect(propre).toHaveCount(1);
	await expect(propre).not.toHaveAttribute('data-classe', /.+/);
	await expect(propre.locator('.rech-classe')).toHaveCount(0);

	// Leçon CE2 seule : trouvée, avec sa pastille (texte « CE2 » + préfixe non visuel).
	await page.locator('#rechercheLecon').fill('Les propriétés des figures');
	const autre = page.locator('.rech-lecon[data-id="geo-figures-proprietes"]');
	await expect(autre).toHaveCount(1);
	await expect(autre).toHaveAttribute('data-classe', 'ce2');
	const pastille = autre.locator('.rech-classe');
	await expect(pastille).toContainText('CE2');
	await expect(pastille.locator('.sr-only')).toContainText('Classe');

	// Le toucher lance la leçon directement ; le retour de fin ramène à la catégorie, en CE2.
	await autre.click();
	await expect(page).toHaveURL(/#lecon-geo-figures-proprietes$/);
	await jouerQcmJusquAuRetour(page);
	await page.locator('#leconBack').click();
	await expect(page).toHaveURL(/#categorie-math-geometrie$/);
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('.lesson-item[data-id="geo-figures-proprietes"]')).toBeVisible();

	expect(errors).toEqual([]);
});

test('Orthographe : les dictées suivent la classe choisie (#772 crit. 13)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('ce2'));
	await seedAideVue(page);
	await gotoHash(page, 'categorie-fr-orthographe');

	const ids = async (): Promise<string[]> =>
		page
			.locator('#categorieContent [data-ortho]')
			.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.ortho ?? ''));

	await expect(page.locator('#categorieContent [data-ortho]').first()).toBeAttached();
	const enCe2 = await ids();

	await radio(page, 'cm1').click();
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#categorieContent [data-ortho]').first()).toBeAttached();
	const enCm1 = await ids();

	// La vue CM1 montre au moins une dictée que la vue CE2 n'a pas.
	expect(enCm1.filter((id) => !enCe2.includes(id)).length).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

test('Réglage parent : « Autoriser les autres classes » est coché par défaut ; décoché, plus de sélecteur ni de résultat hors classe (#772 crit. 14, 22)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, 'encadrant/reglages');

	const reglage = page.locator('input[type="checkbox"][data-act="set-autres-classes"]');
	await expect(reglage).toBeVisible();
	await expect(reglage).toBeChecked(); // défaut, profil sans valeur enregistrée
	await reglage.uncheck();
	await expect(reglage).not.toBeChecked();

	// Comme aujourd'hui : l'écran de catégorie rend ses leçons, sans sélecteur.
	await gotoHash(page, 'categorie-math-numeration');
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	await expect(page.locator('.classe-choix')).toHaveCount(0);
	await expect(page.locator('#categorieTitle')).not.toContainText('·');

	// Recherche : la leçon CE2 seule n'est plus proposée, aucune pastille de classe.
	await gotoHash(page, 'matieres');
	await page.locator('#rechercheLecon').fill('Les propriétés des figures');
	await expect(page.locator('#rechercheResume')).toContainText(/résultat/); // la recherche a répondu
	await expect(page.locator('.rech-lecon[data-id="geo-figures-proprietes"]')).toHaveCount(0);
	await expect(page.locator('.rech-classe')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Une leçon CE2 seule (geo-figures-proprietes) et une leçon commune (num-comparer)
   travaillée dans les DEUX classes, il y a 2 h. */
const SEED_TRAVAIL_CLASSES = `(() => {
  const stat = () => ({ attempts: 1, correct: 9, questions: 10, bestPct: 90, lastPct: 90, recentPct: [90], lastAt: Date.now() - 2 * 3600000 });
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'geo-figures-proprietes@ce2': stat(),
    'num-comparer@ce2': stat(),
    'num-comparer@cm1': stat(),
  }));
})();`;

test("Travaillé récemment : badge de classe d'origine hors classe suivie, une ligne par classe (#772 crit. 15)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(SEED_TRAVAIL_CLASSES);
	await seedAideVue(page);
	await gotoHash(page, 'encadrant');

	const b = page.locator('.enc-block').filter({ hasText: 'Travaillé récemment' });
	await expect(b).toBeVisible();

	// Leçon CE2 seule chez un profil CM1 : badge « CE2 ».
	const geo = b.locator('.enc-trav-item').filter({ hasText: /propriétés/i });
	await expect(geo).toHaveCount(1);
	await expect(geo.locator('.enc-classe-origine')).toContainText('CE2');

	// Leçon travaillée dans deux classes : deux lignes, dont une seule (la CE2) porte le badge.
	const commune = b.locator('.enc-trav-item').filter({ hasText: /compar/i });
	await expect(commune).toHaveCount(2);
	await expect(commune.locator('.enc-classe-origine')).toHaveCount(1);
	await expect(commune.locator('.enc-classe-origine')).toContainText('CE2');

	expect(errors).toEqual([]);
});

test('Négatif : après un passage en vue CE2, « Ta prochaine leçon » ne porte aucune marque de classe (#772 crit. 21)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, 'categorie-math-numeration');
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');

	await gotoHash(page, 'accueil');
	const carte = page.locator('#leconDuJour');
	await expect(carte.locator('.lj-title')).toBeVisible(); // la carte est bien rendue
	await expect(carte).not.toContainText('CE2');

	expect(errors).toEqual([]);
});
