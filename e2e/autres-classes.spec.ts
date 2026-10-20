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
	// Nom accessible pinné À DESSEIN (SC 2.5.3) : il doit contenir le libellé visible « Leçons de : ».
	await expect(
		choix.locator('[role="radiogroup"][aria-label="Leçons de la classe"]'),
	).toBeVisible();
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
	const largeurs = async () =>
		Promise.all([0, 1].map(async (i) => (await options.nth(i).boundingBox())?.width ?? 0));
	const avant = await largeurs();
	await radio(page, 'cm1').focus();
	await page.keyboard.press('ArrowLeft');
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'false');
	// Coche : sa place est réservée sur toutes les options, cocher ne déplace pas les boutons.
	expect(await largeurs()).toEqual(avant);
	await page.keyboard.press('ArrowRight');
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	expect(await largeurs()).toEqual(avant);

	// Anneau de focus : l'option cochée porte le focus clavier ; aucun conteneur du groupe ne
	// doit rogner (`overflow: hidden|clip`) l'anneau dessiné hors du bouton (relecture a11y).
	await expect(radio(page, 'cm1')).toBeFocused();
	const rognage = await page.evaluate(() => {
		const groupe = document.querySelector('.classe-choix [role="radiogroup"]') as HTMLElement;
		const racine = groupe.closest('.classe-choix') as HTMLElement;
		const rogne: string[] = [];
		for (let e: HTMLElement | null = groupe; e && e !== racine.parentElement; e = e.parentElement) {
			const s = getComputedStyle(e);
			if (/hidden|clip/.test(s.overflowX + s.overflowY)) rogne.push(e.className || e.tagName);
		}
		return rogne;
	});
	expect(rognage).toEqual([]);

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

/* ============================================================
   Chemins ajoutés après la relecture qualité (#772) : sprint, « Je choisis mes
   leçons », bilans sans reprise, reprises et favoris, offre de reprise annulée,
   changement de profil. Attentes tirées des critères 4 et des précisions 2 et 3 du
   20/10, jamais du code.
   ============================================================ */

const CAT_NUM = 'categorie-math-numeration';

/* Libellés et ids des leçons listées par la page de catégorie, dans la classe affichée. */
async function leconsAffichees(page: Page): Promise<{ id: string; titre: string }[]> {
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	return page.locator('.lesson-item').evaluateAll((els) =>
		els.map((e) => ({
			id: (e as HTMLElement).dataset.id ?? '',
			titre: (e.querySelector('.lz-title')?.textContent ?? '').trim(),
		})),
	);
}

/* Les leçons de `math-numeration` vues en CE2 puis en CM1 (la page repasse en CE2 ensuite),
   et celles qui n'existent QU'en CM1 : le jeu d'exclusion des tests de classe. */
async function inventaireNumeration(page: Page) {
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	const ce2 = await leconsAffichees(page);
	await radio(page, 'cm1').click();
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	const cm1 = await leconsAffichees(page);
	const idsCe2 = new Set(ce2.map((l) => l.id));
	const cm1Seules = cm1.filter((l) => !idsCe2.has(l.id));
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	return { ce2, cm1Seules };
}

/* Instantané de reprise « grille » minimal (un champ rempli sur deux), pris par un profil
   CM1 : `savedAt` posé à l'exécution, sinon l'instantané expire. */
function seedReprise(key: string, categoryId: string, label: string, lessonId?: string): string {
	const relaunch = lessonId
		? { type: 'lecon', lessonId }
		: {
				type: 'bilan',
				config: { id: '', label, lessonIds: ['num-comparer'], questionsPerLesson: 3 },
			};
	return `(() => {
	  const snap = ${JSON.stringify({
			kind: 'grille',
			key,
			version: 1,
			mode: lessonId ? 'lecon' : 'express',
			label,
			icon: 'timer',
			categoryId,
			relaunch,
			sheetsHTML: '<input class="ans" id="a0" value=""><input class="ans" id="a1" value="">',
			items: {},
			answers: { a0: '1' },
			activeId: null,
			elapsedMs: 0,
			total: 2,
			answered: 1,
		})};
	  snap.savedAt = Date.now();
	  localStorage.setItem('e2e/ludaskia_resume', JSON.stringify([snap]));
	})();`;
}

/* Rejoue le routeur sur le hash courant : ce que fait un retour vers la page de catégorie
   (la reprise et le favori ne changent pas de hash, donc ne le font pas eux-mêmes). */
const rejouerRoute = (page: Page) =>
	page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));

const DIALOGUE = '[role="alertdialog"]'; // l'offre « Tu avais commencé ! » (les autres dialogues sont masqués)

test('Sprint de catégorie : en vue CE2, il ne tire que des leçons CE2 de la catégorie (#772 crit. 4)', async ({
	page,
}) => {
	test.setTimeout(60_000);
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, CAT_NUM);
	const { ce2, cm1Seules } = await inventaireNumeration(page);
	// Sans leçon CM1 seule, la suite ne prouverait rien.
	expect(cm1Seules.length).toBeGreaterThan(0);
	const titresCe2 = new Set(ce2.map((l) => l.titre));
	const titresCm1Seules = new Set(cm1Seules.map((l) => l.titre));

	await page.clock.install(); // avant le clic : le décompte du sprint
	await page.locator('[data-act="sprint"]').click();
	await expect(page.locator('#sprintTime')).toBeVisible();

	for (let i = 0; i < 14; i++) {
		const lecon = page.locator('.sprint-lesson');
		await expect(lecon).toBeVisible();
		const titre = ((await lecon.textContent()) ?? '').trim();
		expect(titresCe2.has(titre), `« ${titre} » n'est pas une leçon CE2 de la catégorie`).toBe(true);
		expect(titresCm1Seules.has(titre)).toBe(false);
		const saisie = page.locator('#sprintInput');
		if (await saisie.isVisible().catch(() => false)) {
			await saisie.fill('');
			await page.locator('#sprintValidate').click();
		} else {
			await page.locator('.sprint-choice').first().click();
		}
		// Correction (« Continuer ») ou auto-avance chronométrée d'une bonne réponse.
		const suite = page.locator('#sprintContinue');
		if (await suite.isVisible().catch(() => false)) await suite.click();
		else await page.clock.fastForward(700);
	}

	expect(errors).toEqual([]);
});

test('« Je choisis mes leçons » : en vue CE2, seules les leçons CE2 de la catégorie, sous leur libellé CE2 (#772 crit. 4)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, CAT_NUM);
	const { ce2, cm1Seules } = await inventaireNumeration(page);
	expect(cm1Seules.length).toBeGreaterThan(0);

	await page.locator('[data-act="custom"]').click();
	await expect(page).toHaveURL(/#bilan-cat-math-numeration$/);
	const cases = page.locator('.bc-lesson-check');
	await expect(cases.first()).toBeVisible();
	const ids = await cases.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
	const libelles = await page
		.locator('.bc-item span')
		.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));

	expect([...ids].sort()).toEqual(ce2.map((l) => l.id).sort());
	for (const l of cm1Seules) expect(ids).not.toContain(l.id);
	expect([...libelles].sort()).toEqual(ce2.map((l) => l.titre).sort());

	expect(errors).toEqual([]);
});

/* Joue un bilan express de la page courante, y remplit un champ, puis quitte vers l'accueil. */
async function jouerExpressEtQuitter(page: Page): Promise<void> {
	await page.locator('[data-act="express"]').click();
	const champ = page.locator('#sheets input.ans').first();
	await expect(champ).toBeVisible();
	await champ.fill('1');
	await gotoHash(page, 'accueil'); // quitter l'exercice (hashchange : capture de reprise)
	await expect(page.locator('#leconDuJour')).toBeVisible();
}

test('Bilan en vue CE2 : quitté, il ne laisse aucune carte « À continuer » (#772 crit. 4, précision 3)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await seedAideVue(page);
	await gotoHash(page, CAT_NUM);

	// Contrôle : dans la classe du profil, ce même geste laisse une carte (sinon l'absence
	// en CE2 ne prouverait rien).
	await jouerExpressEtQuitter(page);
	await expect(page.locator('.reprise-card')).toHaveCount(1);
	await page.evaluate(() => localStorage.setItem('e2e/ludaskia_resume', '[]'));

	await gotoHash(page, CAT_NUM);
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await jouerExpressEtQuitter(page);
	await expect(page.locator('.reprise-card')).toHaveCount(0);
	expect(
		await page.evaluate(() => JSON.parse(localStorage.getItem('e2e/ludaskia_resume') || '[]')),
	).toEqual([]);

	// Page de catégorie : toujours rien à continuer.
	await gotoHash(page, CAT_NUM);
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	await expect(page.locator('.reprise-card')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test("Bilan en vue CE2 : un instantané CM1 en attente n'ouvre pas « Continuer / Recommencer » (#772 crit. 4, précision 3)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(
		seedReprise('bilan-express-math-numeration', 'math-numeration', 'Bilan express — Numération'),
	);
	await seedAideVue(page);
	await gotoHash(page, CAT_NUM);

	// Contrôle : dans la classe du profil, l'offre existe bien (sinon l'absence ne prouve rien).
	await page.locator('[data-act="express"]').click();
	await expect(page.locator(DIALOGUE)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator(DIALOGUE)).toHaveCount(0);

	// Page de catégorie neuve : le rechargement ré-amorce l'instantané (Échap peut l'avoir repris).
	await gotoHash(page, CAT_NUM);
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await page.locator('[data-act="express"]').click();
	// Le bilan part neuf : ses champs sont là, vides, sans dialogue.
	await expect(page.locator('#sheets input.ans').first()).toBeVisible();
	await expect(page.locator(DIALOGUE)).toHaveCount(0);
	await expect(page.locator('#sheets input.ans').first()).toHaveValue('');

	expect(errors).toEqual([]);
});

test('Reprise lancée depuis une page en vue CE2 : elle se joue dans la classe du profil, la catégorie rouvre en CM1 (#772 précision 2)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(
		seedReprise('bilan-express-math-numeration', 'math-numeration', 'Bilan express — Numération'),
	);
	await seedAideVue(page);
	await gotoHash(page, CAT_NUM);
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');

	// La carte est offerte quelle que soit la classe affichée (l'instantané a été pris en CM1).
	await page.locator('.reprise-continue').click();
	await expect(page.locator('#sheets input.ans').first()).toHaveValue('1');

	// Retour sur la catégorie : la classe CE2 a été levée au lancement.
	await rejouerRoute(page);
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#categorieTitle')).not.toContainText('·');

	expect(errors).toEqual([]);
});

test('Favori lancé depuis une page en vue CE2 : il se joue dans la classe du profil, la catégorie rouvre en CM1 (#772 précision 2)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(
		`localStorage.setItem('e2e/ludaskia_bilans', ${JSON.stringify(
			JSON.stringify([
				{
					id: 'fav1',
					label: 'Mon favori',
					lessonIds: ['num-comparer'],
					questionsPerLesson: 3,
					mode: 'bilan',
				},
			]),
		)});`,
	);
	await seedAideVue(page);
	await gotoHash(page, CAT_NUM);
	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');

	await page.locator('#catFavoris [data-run]').first().click();
	await expect(page.locator('#sheets input.ans').first()).toBeVisible();

	await rejouerRoute(page);
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#categorieTitle')).not.toContainText('·');

	expect(errors).toEqual([]);
});

test("Recherche : l'offre « Continuer / Recommencer » d'une leçon CE2 fermée par Échap ne laisse pas la classe CE2 posée (#772 crit. 12)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil('cm1'));
	await page.addInitScript(
		seedReprise('lecon-num-decompose-100', 'math-numeration', 'Décomposer', 'num-decompose-100'),
	);
	await seedAideVue(page);

	// Leçon CE2 seule de la catégorie : on lit son libellé sur la page CE2, puis on la cherche.
	await gotoHash(page, CAT_NUM);
	await radio(page, 'ce2').click();
	const titre = (
		(await page.locator('.lesson-item[data-id="num-decompose-100"] .lz-title').textContent()) ?? ''
	).trim();
	await gotoHash(page, 'matieres');
	await page.locator('#rechercheLecon').fill(titre);
	const resultat = page.locator('.rech-lecon[data-id="num-decompose-100"]');
	await expect(resultat).toHaveAttribute('data-classe', 'ce2');
	await resultat.click();

	// L'offre s'ouvre. Elle n'a pas de sortie « annuler » : Échap vaut « Continuer où j'en étais »
	// (ui/resume.ts, openChoiceModal). Le test fixe l'état FINAL (aucune classe CE2 résiduelle),
	// quelle que soit la sortie de la modale.
	await expect(page.locator(DIALOGUE)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator(DIALOGUE)).toHaveCount(0);
	await expect(page).toHaveURL(/#matieres$/); // rien n'a été lancé

	await gotoHash(page, CAT_NUM);
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#categorieTitle')).not.toContainText('·');
	await expect(page.locator('.lesson-item[data-id="num-decompose-multiplicative"]')).toBeVisible();

	expect(errors).toEqual([]);
});

test('Changement de profil sur la même page : la classe choisie par le premier ne passe pas au second (#772 crit. 5)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Deux profils CM1. Le second est amorcé comme `gotoHash` amorce le premier (pas de tour,
	// pas d'aide) : sinon un overlay d'accueil s'ouvrirait à la bascule.
	await page.addInitScript(
		`localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [
			{ uuid: 'e2e', name: 'Alice', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' },
			{ uuid: 'autre', name: 'Bruno', emoji: '\\uD83D\\uDC3B', updatedAt: 1, niveauReference: 'cm1' },
		], active: 'e2e' }));
		localStorage.setItem('autre/ludaskia_tour_seen', 'true');
		localStorage.setItem('autre/ludaskia_parents_seen', 'true');`,
	);
	await seedAideVue(page);
	await page.addInitScript(
		`localStorage.setItem('autre/ludaskia_aide_vue', localStorage.getItem('e2e/ludaskia_aide_vue'));`,
	);
	await gotoHash(page, CAT_NUM);

	await radio(page, 'ce2').click();
	await expect(radio(page, 'ce2')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#categorieTitle')).toContainText(/·\s*CE2/);

	// Bascule par le menu de profils : le hash ne change pas, la page se re-rend.
	const burger = page.locator('#toolbarBurger');
	if (await burger.isVisible()) await burger.click(); // mobile : la barre vit dans le tiroir
	await page.locator('#toolbarProfile').click();
	await page.locator('#profileMenu button[data-uuid="autre"]').click();
	await expect(page).toHaveURL(/#categorie-math-numeration$/);
	await expect(radio(page, 'cm1')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#categorieTitle')).not.toContainText('·');
	await expect(page.locator('.lesson-item[data-id="num-decompose-multiplicative"]')).toBeVisible();

	expect(errors).toEqual([]);
});
