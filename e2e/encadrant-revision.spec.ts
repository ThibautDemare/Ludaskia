/* ============================================================
   Espace encadrant — récap du mode Révision (#423). Smoke tests e2e.
   Sème directement `ludaskia_lessonRevision` par UUID (profil « e2e » du
   helper, celui que `gotoHash` amorce) : plus robuste que jouer une session
   complète pour amener des entrées dans la file de répétition espacée.
   Couvre : rendu de la section (entrée due + entrée acquise), bascule
   « Par catégorie » / « Par urgence » / « Par palier » (#555), état vide
   (aucune révision seedée).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, leconsDuNiveau } from './helpers';

/* Deux leçons réelles du catalogue CE2 (labels tels que rendus par le
   catalogue — cf. `label` dans src/core/catalog.ts / src/data). */
const LABEL_DUE = 'Je compare les nombres'; // num-comparer
const LABEL_ACQUIS = 'Complément à 10/100/1000'; // math-complements
const LABEL_MID = 'Doubles'; // math-doubles

/* Une entrée DUE (palier intermédiaire, échéance passée) et une entrée
   ACQUISE (palier maximal PALIER_ACQUIS = 6, sans échéance). Clé préfixée
   par le profil actif du helper ('e2e/'). */
const SEED_REVISION = `(() => {
  const now = Date.now();
  const day = 86400000;
  localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify({
    'num-comparer@ce2': { palier: 2, prochaineRevision: now - day, reussites: 2, dernierTest: now - 3 * day },
    'math-complements@ce2': { palier: 6, prochaineRevision: null, reussites: 6, dernierTest: now - 20 * day },
  }));
})();`;

test('récap Révision : section rendue, entrées due + acquise, bascule catégorie/urgence', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_REVISION);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	await expect(section).toBeVisible();
	expect(await section.locator('.enc-rev-item').count()).toBeGreaterThanOrEqual(2);

	// Vue par défaut : « Par catégorie » (regroupement dépliable, <details>).
	await expect(section.locator('details.enc-rev-d').first()).toBeVisible();
	const btnCat = section.locator('[data-act="revision-mode"][data-mode="categorie"]');
	const btnUrg = section.locator('[data-act="revision-mode"][data-mode="urgence"]');
	await expect(btnCat).toHaveClass(/on/);
	await expect(btnCat).toHaveAttribute('aria-checked', 'true');
	await expect(btnUrg).toHaveAttribute('aria-checked', 'false');

	// Bascule vers « Par urgence » : liste à plat, entrées visibles sans dépliage.
	await btnUrg.click();
	await expect(btnUrg).toHaveClass(/on/);
	await expect(btnUrg).toHaveAttribute('aria-checked', 'true');
	await expect(btnCat).toHaveAttribute('aria-checked', 'false');
	await expect(section.locator('ul.enc-rev-flat')).toBeVisible();

	// L'entrée DUE affiche son palier + une échéance échue (classe `.du`).
	const itemDue = section.locator('.enc-rev-item').filter({ hasText: LABEL_DUE });
	await expect(itemDue.locator('.enc-rev-palier')).toBeVisible();
	await expect(itemDue.locator('.enc-rev-echeance.du')).toBeVisible();

	// L'entrée ACQUISE affiche le badge dédié, jamais de palier/échéance.
	const itemAcquis = section.locator('.enc-rev-item').filter({ hasText: LABEL_ACQUIS });
	await expect(itemAcquis.locator('.enc-rev-badge')).toBeVisible();
	await expect(itemAcquis.locator('.enc-rev-palier')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Trois entrées à trois paliers DISTINCTS (0, 3, PALIER_ACQUIS=6), pour éprouver
   l'ORDRE des étages : le plus fragile (palier 0 → « 1 jour ») en premier, un
   palier intermédiaire (palier 3 → « 2 semaines »), « Acquis » en dernier. La
   première (palier 0) est échue (prochaineRevision < now) pour vérifier que
   l'échéance `.du` reste visible même sans répéter le palier (déjà porté par
   l'en-tête d'étage, #555). */
const SEED_PALIER = `(() => {
  const now = Date.now();
  const day = 86400000;
  localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify({
    'num-comparer@ce2': { palier: 0, prochaineRevision: now - day, reussites: 1, dernierTest: now - 2 * day },
    'math-doubles@ce2': { palier: 3, prochaineRevision: now + 5 * day, reussites: 4, dernierTest: now - 10 * day },
    'math-complements@ce2': { palier: 6, prochaineRevision: null, reussites: 6, dernierTest: now - 30 * day },
  }));
})();`;

test('récap Révision : vue « Par palier » — étages du plus fragile au plus ancré, acquis en dernier', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_PALIER);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	const btnPalier = section.locator('[data-act="revision-mode"][data-mode="palier"]');
	await btnPalier.click();
	await expect(btnPalier).toHaveClass(/on/);
	await expect(btnPalier).toHaveAttribute('aria-checked', 'true');

	// Un étage par palier NON VIDE (les trois seedés), aucun étage intermédiaire vide.
	const etages = section.locator('.enc-rev-etage');
	await expect(etages).toHaveCount(3);

	// ORDRE : le plus fragile d'abord, « Acquis » en dernier — cœur de la fonctionnalité.
	// (`.enc-rev-etage-lab` est le <h3> du titre, distinct du compteur `.enc-rev-etage-n`.)
	await expect(etages.nth(0).locator('h3.enc-rev-etage-lab')).toHaveText('Palier : 1 jour');
	await expect(etages.nth(1).locator('h3.enc-rev-etage-lab')).toHaveText('Palier : 2 semaines');
	await expect(etages.nth(2).locator('h3.enc-rev-etage-lab')).toHaveText('Acquis');
	await expect(etages.nth(0)).toContainText(LABEL_DUE);
	await expect(etages.nth(1)).toContainText(LABEL_MID);
	await expect(etages.nth(2)).toContainText(LABEL_ACQUIS);

	// Seul l'étage sommital porte la classe qui déclenche le filet de couleur distinct
	// (`.enc-rev-etage + .enc-rev-etage--acquis`, encadrant.scss) : verrouille le lien
	// entre le rendu et la règle CSS, comme `enc-frise-acquis` ailleurs sur cet écran.
	await expect(etages.nth(0)).not.toHaveClass(/enc-rev-etage--acquis/);
	await expect(etages.nth(1)).not.toHaveClass(/enc-rev-etage--acquis/);
	await expect(etages.nth(2)).toHaveClass(/enc-rev-etage--acquis/);

	// L'étage du bas garde l'échéance échue sur sa ligne, mais ne répète PAS son
	// palier (déjà porté par l'en-tête « Palier : 1 jour »).
	const itemBas = etages.nth(0).locator('.enc-rev-item').filter({ hasText: LABEL_DUE });
	await expect(itemBas.locator('.enc-rev-echeance.du')).toBeVisible();
	await expect(itemBas.locator('.enc-rev-palier')).toHaveCount(0);

	// L'étage « Acquis » : dans CETTE vue, l'entrée acquise n'affiche PAS le badge
	// dédié (déjà porté par le titre d'étage), contrairement aux vues catégorie/urgence.
	const itemAcquis = etages.nth(2).locator('.enc-rev-item').filter({ hasText: LABEL_ACQUIS });
	await expect(itemAcquis).toHaveClass(/acquis/);
	await expect(itemAcquis.locator('.enc-rev-badge')).toHaveCount(0);

	// Le focus clavier revient sur le bouton actif après le re-rendu complet de la bascule.
	await expect(page.locator(':focus')).toHaveAttribute('data-mode', 'palier');

	expect(errors).toEqual([]);
});

/* ---------- Plafonnement des vues « Par palier » / « Par urgence » ----------
   Rien ne borne le nombre d'entrées d'un profil chargé : au-delà de MAX_PAR_ETAGE (6)
   sur un même étage, ou de MAX_URGENCE (20) au total, les deux vues à plat plafonnent
   l'affichage et rangent le reliquat dans un <details> replié (la vue « Par catégorie »
   n'a pas ce problème, ses <details> par catégorie étant déjà repliés). Seed via de
   VRAIES leçons du catalogue CE2 (`leconsDuNiveau`, seul import de `src/` toléré ici,
   cf. e2e/README.md) : le volume importe, pas l'identité précise des leçons — un id ou
   un niveau qui n'existerait pas serait silencieusement ignoré au rendu, d'où la
   vérification de la synthèse (`.enc-hint`) contre le nombre RÉELLEMENT seedé. */
interface GroupeSeed {
	ids: string[];
	palier: number;
	joursRetard: number;
}
function seedRevisionGroupes(groupes: GroupeSeed[]) {
	return {
		fn: (gs: GroupeSeed[]) => {
			const now = Date.now();
			const day = 86400000;
			const rev: Record<string, unknown> = {};
			for (const g of gs) {
				for (const id of g.ids) {
					rev[id + '@ce2'] = {
						palier: g.palier,
						prochaineRevision: now - g.joursRetard * day,
						reussites: 3,
						dernierTest: now - 5 * day,
					};
				}
			}
			localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify(rev));
		},
		arg: groupes,
	};
}
function seedRevisionEnMasse(ids: string[], palier: number, joursRetard: number) {
	return seedRevisionGroupes([{ ids, palier, joursRetard }]);
}

test('récap Révision : vue « Par palier » plafonne un étage chargé (compteur sur le total, reliquat accessible)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// 9 leçons CE2 réelles, toutes au même palier (2 → « 1 semaine ») et toutes échues :
	// un seul étage, qui dépasse MAX_PAR_ETAGE = 6.
	const ids = leconsDuNiveau('math', 'ce2').slice(0, 9);
	expect(ids.length).toBeGreaterThan(6); // le catalogue CE2 doit dépasser le plafond pour que ce test ait un sens
	const seed = seedRevisionEnMasse(ids, 2, 1);
	await page.addInitScript(seed.fn, seed.arg);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	// Le nombre d'entrées RENDUES correspond au nombre semé (aucune clé perdue en route).
	await expect(section.locator('.enc-hint')).toHaveText(
		`${ids.length} entrées en révision, dont ${ids.length} à réviser.`,
	);

	await section.locator('[data-act="revision-mode"][data-mode="palier"]').click();

	const etage = section.locator('.enc-rev-etage');
	await expect(etage).toHaveCount(1); // toutes les entrées au même palier → un seul étage

	// En-tête d'étage NON plafonné : le compteur annonce le total complet, jamais la
	// tranche affichée — l'invariant qui justifie tout le plafonnement.
	const titre = etage.locator('h3.enc-rev-etage-lab');
	await expect(titre).toHaveText('Palier : 1 semaine');
	await expect(etage.locator('.enc-rev-etage-n')).toHaveText(
		`${ids.length} entrées, dont ${ids.length} à réviser`,
	);
	// La <section> d'étage est nommée par son <h3>.
	const titreId = await titre.getAttribute('id');
	expect(titreId).toBeTruthy();
	await expect(etage).toHaveAttribute('aria-labelledby', titreId!);

	// Lignes plafonnées à MAX_PAR_ETAGE = 6, visibles sans interaction.
	const visibles = etage.locator('> ul.enc-rev-etage-l > li.enc-rev-item');
	await expect(visibles).toHaveCount(6);

	// Le reliquat (3 lignes) est replié par défaut, avec le libellé « N autres »... Le texte
	// du repli redit aussi les dues cachées (texteRepli, partagé avec la vue « Par urgence » :
	// contrairement à ce que documente le commentaire de vuePalierHTML, la fonction commune
	// applique la même règle « , dont N à réviser » aux deux vues — cf. compte-rendu).
	const repli = etage.locator('details.enc-rev-etage-plus');
	const resume = repli.locator('summary.enc-rev-etage-plus-sum');
	const plus = resume.locator('.enc-repli-plus');
	const moins = resume.locator('.enc-repli-moins');
	await expect(plus).toHaveText('3 autres, dont 3 à réviser');
	await expect(plus).toBeVisible();
	await expect(moins).toBeHidden();
	const caches = repli.locator('ul.enc-rev-etage-l > li.enc-rev-item');
	await expect(caches).toHaveCount(3);
	await expect(caches.first()).toBeHidden();

	// ...devient accessible une fois ouvert, et le libellé bascule vers « Voir moins ».
	await resume.click();
	await expect(caches.first()).toBeVisible();
	await expect(plus).toBeHidden();
	await expect(moins).toBeVisible();

	// Le bouton de PIED du reliquat (absent tant que replié, existe uniquement DANS le
	// <details>) referme et rend le focus à son <summary> — pensé pour un reliquat de
	// plusieurs centaines de lignes, où le résumé est loin en haut de l'écran.
	const finBouton = repli.locator('button.enc-repli-fin[data-act="revision-replier"]');
	await expect(finBouton).toBeVisible();
	await finBouton.click();
	await expect(plus).toBeVisible();
	await expect(moins).toBeHidden();
	await expect(caches.first()).toBeHidden();
	await expect(resume).toBeFocused();

	expect(errors).toEqual([]);
});

test('récap Révision : vue « Par urgence » plafonne à 20 entrées (reliquat annonce les dues cachées, accessible après ouverture)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// 25 leçons CE2 réelles (disjointes du test précédent), toutes échues au même jour :
	// dépasse MAX_URGENCE = 20, et le tri alphabétique (à égalité d'urgence) rend le
	// découpage visible/replié déterministe.
	const ids = leconsDuNiveau('math', 'ce2').slice(9, 34);
	expect(ids.length).toBeGreaterThan(20); // idem : le catalogue doit dépasser largement le plafond
	const seed = seedRevisionEnMasse(ids, 1, 1);
	await page.addInitScript(seed.fn, seed.arg);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	await expect(section.locator('.enc-hint')).toHaveText(
		`${ids.length} entrées en révision, dont ${ids.length} à réviser.`,
	);

	await section.locator('[data-act="revision-mode"][data-mode="urgence"]').click();

	// Plafonnée à MAX_URGENCE = 20, visible sans interaction.
	const visibles = section.locator('.enc-block > ul.enc-rev-flat > li.enc-rev-item');
	await expect(visibles).toHaveCount(20);

	const repli = section.locator('details.enc-rev-plus');
	const resume = repli.locator('summary.enc-rev-plus-sum');
	const plus = resume.locator('.enc-repli-plus');
	const moins = resume.locator('.enc-repli-moins');
	const reste = ids.length - 20;
	// Toutes les entrées seedées sont dues : le repli le redit, pas seulement le compte.
	await expect(plus).toHaveText(`${reste} autres, dont ${reste} à réviser`);
	await expect(plus).toBeVisible();
	await expect(moins).toBeHidden();

	const caches = repli.locator('ul.enc-rev-flat > li.enc-rev-item');
	await expect(caches).toHaveCount(reste);
	await expect(caches.first()).toBeHidden();

	await resume.click();
	await expect(caches.first()).toBeVisible();
	await expect(plus).toBeHidden();
	await expect(moins).toBeVisible();

	// Même bouton de pied, même effet dans cette vue (présent dans les DEUX vues plafonnées).
	const finBouton = repli.locator('button.enc-repli-fin[data-act="revision-replier"]');
	await expect(finBouton).toBeVisible();
	await finBouton.click();
	await expect(plus).toBeVisible();
	await expect(moins).toBeHidden();
	await expect(caches.first()).toBeHidden();
	await expect(resume).toBeFocused();

	expect(errors).toEqual([]);
});

/* Le handler (`revisionClick`, revision-replier) referme le SEUL <details> englobant le
   bouton cliqué, SANS appeler `renderEspace()` (cf. commentaire du handler) : re-rendre
   toute la vue recréerait chaque <details> à l'état FERMÉ par défaut, refermant du même
   coup n'importe quel AUTRE repli resté ouvert par l'adulte. Deux étages distincts, tous
   deux au-delà de MAX_PAR_ETAGE, permettent de le vérifier : si un renderEspace() venait
   à être ajouté plus tard par erreur, ce test le verrait (le second repli se refermerait
   avec le premier). */
test('récap Révision : le bouton de pied referme SON repli sans affecter les autres ni re-rendre la vue « Par palier »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const math = leconsDuNiveau('math', 'ce2');
	const idsA = math.slice(0, 9);
	const idsB = math.slice(34, 43);
	expect(idsA.length).toBeGreaterThan(6);
	expect(idsB.length).toBeGreaterThan(6);
	const seed = seedRevisionGroupes([
		{ ids: idsA, palier: 0, joursRetard: 1 },
		{ ids: idsB, palier: 2, joursRetard: 1 },
	]);
	await page.addInitScript(seed.fn, seed.arg);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	await section.locator('[data-act="revision-mode"][data-mode="palier"]').click();

	const etages = section.locator('.enc-rev-etage');
	await expect(etages).toHaveCount(2);
	const etageA = etages.nth(0); // palier 0 → « 1 jour »
	const etageB = etages.nth(1); // palier 2 → « 1 semaine »

	// Ouvre les DEUX reliquats.
	const resumeA = etageA.locator('summary.enc-rev-etage-plus-sum');
	const resumeB = etageB.locator('summary.enc-rev-etage-plus-sum');
	await resumeA.click();
	await resumeB.click();
	const moinsA = resumeA.locator('.enc-repli-moins');
	const moinsB = resumeB.locator('.enc-repli-moins');
	await expect(moinsA).toBeVisible();
	await expect(moinsB).toBeVisible();

	// Referme SEULEMENT le premier, par son bouton de pied.
	await etageA.locator('button.enc-repli-fin[data-act="revision-replier"]').click();

	// Le premier repli est refermé, le focus revient sur SON <summary>...
	await expect(resumeA.locator('.enc-repli-plus')).toBeVisible();
	await expect(moinsA).toBeHidden();
	await expect(resumeA).toBeFocused();

	// ...mais le SECOND reste ouvert : la vue n'a pas été re-rendue en entier.
	await expect(moinsB).toBeVisible();
	await expect(resumeB.locator('.enc-repli-plus')).toBeHidden();

	expect(errors).toEqual([]);
});

test('récap Révision : état vide (aucune révision programmée)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	await expect(section).toBeVisible();
	await expect(section.locator('.enc-block')).toHaveCount(0);
	await expect(section.locator('.enc-rev-item')).toHaveCount(0);
	await expect(section).toContainText('Aucune révision');

	expect(errors).toEqual([]);
});
