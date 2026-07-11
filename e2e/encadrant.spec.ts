/* ============================================================
   Espace encadrant (#234) — smoke tests e2e.
   Couvre : accès depuis Profils, rendu de la vue, bouton Retour,
   cycle PIN complet (activation → rechargement → mauvais code →
   bon code), et carte « À revoir » sur l'accueil enfant (seeding).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* ----- Seeds localStorage ----- */

/* Profil e2e avec niveauReference CE2 (gotoHash l'injecte déjà, mais on
   le reproduit ici pour les tests qui naviguent directement sans gotoHash). */
const SEED_CE2 = `(() => {
  const KEY = 'ludaskia_profiles';
  let m = null;
  try { m = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e) {}
  if (!m || !Array.isArray(m.list) || !m.list.length) {
    m = { list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'ce2' }], active: 'e2e' };
  } else {
    m.list.forEach(p => { if (!p.niveauReference) p.niveauReference = 'ce2'; });
  }
  localStorage.setItem(KEY, JSON.stringify(m));
})();`;

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Seed des stats faibles pour la carte « À revoir » : profil e2e,
   leçon « math-complements » en CE2, taux récent 20 % (< seuil 70 %). */
const SEED_STATS_FAIBLES = `(() => {
  const stat = { attempts: 1, correct: 2, questions: 10, bestPct: 20, lastPct: 20, recentPct: [20] };
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({ 'math-complements@ce2': stat }));
})();`;

/* Seed du journal d'activité TYPÉ (#319) pour le profil e2e : quelques sessions
   réparties sur les derniers jours, plusieurs types (leçon / bilan / sprint). */
const SEED_ACTIVITE = `(() => {
  const now = Date.now(); const day = 86400000;
  const acts = [
    { t: now, k: 'lecon' }, { t: now, k: 'sprint' }, { t: now, k: 'revision' },
    { t: now, k: 'dictee' }, { t: now - day, k: 'bilan' }, { t: now - 2 * day, k: 'lecon' },
  ];
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify(acts));
})();`;

/* Seed d'une leçon TRAVAILLÉE (math-complements CE2) : 4 sessions, dernière = maintenant,
   fenêtre récente en hausse (40,50 → 80,90) pour déclencher la tendance « progresse ».
   Sert au détail « travaillée N fois · dernière fois … » + puce de tendance. */
const SEED_STATS_VUES = `(() => {
  const now = Date.now();
  const stat = { attempts: 4, correct: 26, questions: 40, bestPct: 90, lastPct: 90, recentPct: [40, 50, 80, 90], lastAt: now };
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({ 'math-complements@ce2': stat }));
})();`;

/* Seed du journal des paliers (#397) : 3 notions de maths ayant franchi un cap, réparties
   sur les dernières semaines (1re marche à 5 semaines → assez de recul pour afficher la frise). */
const SEED_PALIERS = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliers', JSON.stringify({
    'math-complements@ce2': { enCours: now - 5 * week },
    'math-doubles@ce2': { acquis: now - 2 * week },
    'math-moities@ce2': { enCours: now - 1 * week },
  }));
})();`;

/* ----- Tests ----- */

/* 1. Accès depuis Profils : #btnEncadrant visible → clic → espace visible */
test("accès depuis Profils : #btnEncadrant visible, clic ouvre l'espace encadrant", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'profils');

	const btn = page.locator('#btnEncadrant');
	await expect(btn).toBeVisible();
	await btn.click();

	// La vue encadrant s'affiche (le titre distinctif est présent).
	await expect(page.locator('.enc-title')).toBeVisible();
	await expect(page.locator('.enc-title')).toContainText('encadrant');
	expect(errors).toEqual([]);
});

/* 2. Navigation directe : rendu de l'espace sans erreur */
test('navigation directe #encadrant : titre + récap (progression) présents', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	await expect(page.locator('.enc-title')).toBeVisible();
	// Le récap nomme l'enfant consulté (titre « Progression de … ») + chiffres-clés.
	await expect(page.locator('.enc-frame')).toBeVisible();
	await expect(page.locator('.enc-stats')).toBeVisible();
	expect(errors).toEqual([]);
});

/* 3. Bouton Retour : revenir à l'accueil enfant */
test("bouton « Retour » de l'espace encadrant ramène à l'accueil", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	await expect(page.locator('.enc-back[data-act="retour"]')).toBeVisible();
	await page.locator('.enc-back[data-act="retour"]').click();

	await expect(page.locator('#home')).toBeVisible();
	expect(errors).toEqual([]);
});

/* 4. Réglages classe : les selects de niveau sont présents (CE2 + CM1 au catalogue) */
test("réglages classe : selects de niveau présents dans l'espace encadrant", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	// Select de la classe de référence.
	await expect(page.locator('select[data-act="set-niveau-ref"]')).toBeVisible();
	// Select par matière (au moins Mathématiques).
	await expect(page.locator('select[data-act="set-niveau-mat"]').first()).toBeVisible();
	expect(errors).toEqual([]);
});

/* 5. Cycle PIN complet :
      a) activer le code (4 chiffres au pavé → secret affiché)
      b) cocher la case + terminer
      c) recharger → pavé de saisie affiché
      d) mauvais code → message d'erreur
      e) bon code → espace ouvert
   NOTE : on NE pose PAS CLEAR_PIN via addInitScript ici, car addInitScript
   s'exécute à chaque navigation — il effacerait le PIN lors du rechargement.
   On supprime le verrou éventuel via page.evaluate() après le premier chargement. */
test('cycle PIN : activation, rechargement, mauvais code refusé, bon code accepté', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Premier chargement (via gotoHash qui injecte le profil CE2).
	await gotoHash(page, 'encadrant');

	// Nettoyer un verrou PIN éventuel laissé par un test précédent (via evaluate,
	// pas addInitScript, pour ne pas ré-exécuter la suppression sur le rechargement).
	await page.evaluate(() => localStorage.removeItem('ludaskia_encadrant_lock'));
	// Re-rendre la vue sans verrou.
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	// Vérifier que l'espace est directement accessible (pas de pavé).
	await expect(page.locator('.enc-frame')).toBeVisible();

	// Cliquer « Activer un code ».
	await page.locator('[data-act="pin-activer"]').click();

	// Un pavé numérique doit apparaître.
	await expect(page.locator('.kp-key[data-d="1"]')).toBeVisible();

	// Saisir le code 1-2-3-4.
	const CODE = ['1', '2', '3', '4'];
	for (const d of CODE) {
		await page.locator(`.kp-key[data-d="${d}"]`).click();
	}

	// Après 4 chiffres, le panneau secret de récupération apparaît.
	await expect(page.locator('.enc-secret')).toBeVisible();

	// Cocher la case « J'ai conservé ma clé ».
	await page.locator('[data-act="secret-conserve"]').click();

	// Le bouton « Terminer » est maintenant actif → cliquer.
	await expect(page.locator('[data-act="pin-terminer"]')).toBeEnabled();
	await page.locator('[data-act="pin-terminer"]').click();

	// De retour dans l'espace (session déjà déverrouillée en mémoire).
	await expect(page.locator('.enc-frame')).toBeVisible();

	// Recharger la page → réinitialise l'état mémoire JS (deverrouille = false),
	// le verrou PIN est dans localStorage → le pavé doit s'afficher.
	// On utilise page.evaluate pour naviguer sans re-exécuter addInitScript.
	await page.evaluate(() => {
		location.hash = 'accueil';
	});
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	// Le pavé de saisie doit s'afficher (plus d'état déverrouillé en mémoire).
	await expect(page.locator('.kp-dot').first()).toBeVisible();
	await expect(page.locator('.kp-key[data-d="1"]')).toBeVisible();

	// Saisir un MAUVAIS code (9-9-9-9).
	for (const d of ['9', '9', '9', '9']) {
		await page.locator(`.kp-key[data-d="${d}"]`).click();
	}

	// Message d'erreur visible ; l'espace n'est pas ouvert (renderGate efface le DOM,
	// donc le récap .enc-frame est absent — toHaveCount(0) plus robuste que toBeHidden).
	await expect(page.locator('.enc-gate-err')).toBeVisible();
	await expect(page.locator('.enc-frame')).toHaveCount(0);

	// Saisir le BON code (1-2-3-4).
	for (const d of CODE) {
		await page.locator(`.kp-key[data-d="${d}"]`).click();
	}

	// L'espace est maintenant accessible.
	await expect(page.locator('.enc-frame')).toBeVisible();

	expect(errors).toEqual([]);
});

/* 6. Carte « À revoir » sur l'accueil enfant (seeding de stats faibles).
      Étapes : seed stats → épingler dans l'espace encadrant → accueil enfant
      affiche la carte. */
test("carte « À revoir » : épingler une leçon faible la fait apparaître sur l'accueil", async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Injecter stats faibles ET supprimer PIN avant chargement.
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STATS_FAIBLES);
	// gotoHash injecte aussi ENSURE_NIVEAU (CE2) — on passe par navigation directe
	// pour conserver le seeding addInitScript déjà posé.
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	// La leçon faible doit apparaître dans la section « À revoir » (liste .enc-revoir,
	// hors détail dépliable des catégories), proposée à l'épinglage (bouton « Épingler »).
	const btnEpingler = page
		.locator('.enc-revoir [data-act="epingler"]')
		.filter({ hasText: 'Épingler' })
		.first();
	await expect(btnEpingler).toBeVisible();
	await btnEpingler.click();

	// Une fois épinglée, la leçon passe dans les « Épinglées » (bouton « Retirer »).
	await expect(
		page.locator('.enc-revoir [data-act="epingler"]').filter({ hasText: 'Retirer' }).first(),
	).toBeVisible();

	// Naviguer vers l'accueil de l'enfant.
	await page.locator('[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();

	// La carte « À revoir » doit être visible et contenir un titre de leçon.
	const carteARevoir = page.locator('#aRevoir');
	await expect(carteARevoir).toBeVisible();
	await expect(carteARevoir.locator('.lj-title')).toBeVisible();

	expect(errors).toEqual([]);
});

/* 7. Graphe d'activité (#319) : échelle Y + bascule « Total » / « Par type ». */
test("graphe d'activité : échelle Y présente, bascule « Par type » empile les segments", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_ACTIVITE);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	// Le graphe se rend, avec une échelle Y chiffrée (≥ 2 graduations).
	await expect(page.locator('.enc-chart')).toBeVisible();
	expect(await page.locator('.enc-axis-tick').count()).toBeGreaterThanOrEqual(2);

	// Vue par défaut « Total » : barres simples présentes, bouton « Total » actif.
	await expect(page.locator('.enc-bar').first()).toBeVisible();
	await expect(page.locator('.enc-act-mode[data-mode="total"]')).toHaveClass(/on/);
	await expect(page.locator('.enc-seg-bar')).toHaveCount(0);

	// Bascule « Par type » → segments empilés + légende des types.
	await page.locator('.enc-act-mode[data-mode="type"]').click();
	await expect(page.locator('.enc-act-mode[data-mode="type"]')).toHaveClass(/on/);
	await expect(page.locator('.enc-seg-bar').first()).toBeVisible();
	await expect(page.locator('.enc-key.enc-act-lecon')).toBeVisible();
	await expect(page.locator('.enc-key.enc-act-revision')).toBeVisible();
	await expect(page.locator('.enc-key.enc-act-dictee')).toBeVisible();
	await expect(page.locator('.enc-key.enc-act-sprint')).toBeVisible();

	expect(errors).toEqual([]);
});

/* 8. Détail des notions : « travaillée N fois · dernière fois … ». */
test('détail des notions : nombre de fois travaillée + dernière fois', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STATS_VUES);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	// Déplier chaque catégorie (clic sur son résumé = toggle natif <details>) pour
	// exposer les lignes de détail par leçon.
	const resumes = page.locator('.enc-cat-sum');
	const n = await resumes.count();
	for (let i = 0; i < n; i++) await resumes.nth(i).click();

	// La leçon travaillée affiche son nombre de sessions (et une « dernière fois »).
	await expect(
		page.locator('.enc-detail-meta').filter({ hasText: 'travaillée 4 fois' }).first(),
	).toBeVisible();
	// ... et sa tendance récente (ici « progresse », fenêtre en hausse).
	await expect(page.locator('.enc-tendance-progresse').first()).toBeVisible();
	// Une leçon non abordée affiche l'état neutre « pas encore travaillée ».
	await expect(
		page.locator('.enc-detail-meta').filter({ hasText: 'pas encore travaillée' }).first(),
	).toBeVisible();

	expect(errors).toEqual([]);
});

/* 9. Couverture par matière + compteur « travaillées » par catégorie. */
test('couverture : vue par matière et compteur « travaillées » par catégorie', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STATS_VUES);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	// Vue « Couverture par matière » : toujours visible (hors dépliage des catégories).
	await expect(page.locator('.enc-mat-list')).toBeVisible();
	await expect(
		page.locator('.enc-mat-item').filter({ hasText: 'Mathématiques' }).first(),
	).toBeVisible();
	// Le compteur de catégorie affiche la couverture « travaillée(s) » (sous-chaîne robuste au pluriel).
	await expect(
		page.locator('.enc-cat-counts').filter({ hasText: 'travaillée' }).first(),
	).toBeVisible();

	expect(errors).toEqual([]);
});

/* 10. Frise d'évolution (#397) : paliers franchis par matière (seed du journal). */
test("frise d'évolution : la frise « Évolution récente » par matière se rend", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_PALIERS);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	// Le bloc de frises est rendu, avec une mini-frise « Mathématiques ».
	await expect(page.locator('.enc-evol')).toBeVisible();
	await expect(
		page.locator('.enc-evol-mat-lab').filter({ hasText: 'Mathématiques' }).first(),
	).toBeVisible();
	// Au moins une semaine avec un franchissement : barre « pleine » + compteur chiffré.
	await expect(page.locator('.enc-evol-col.has-value').first()).toBeVisible();
	await expect(page.locator('.enc-evol-num').filter({ hasText: /\d/ }).first()).toBeVisible();

	expect(errors).toEqual([]);
});

/* 11. Split accessibilité (#234) : « Mon confort » (enfant) vs « Aménagements » (encadrant). */
test('accessibilité : confort côté enfant, aménagements côté encadrant', async ({ page }) => {
	const errors = watchErrors(page);
	// Écran « Mon espace » : confort de lecture + animations, MAIS plus le minuteur
	// ni la lecture auto (devenus des aménagements posés par l'adulte).
	await gotoHash(page, 'profils');
	await expect(page.locator('#prefAnim')).toBeVisible();
	await expect(page.locator('#prefConfort')).toBeVisible();
	await expect(page.locator('#prefSansChrono')).toHaveCount(0);
	await expect(page.locator('#prefLectureAuto')).toHaveCount(0);
	// Espace encadrants : les trois aménagements (masquer le minuteur + lecture auto
	// + désactiver les apparitions surprises, #331).
	await gotoHash(page, 'encadrant');
	expect(await page.locator('[data-act="set-amenagement"]').count()).toBe(3);
	await expect(page.locator('[data-pref="sansApparitionsSurprises"]')).toBeVisible();
	expect(errors).toEqual([]);
});
