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

/* Seed du journal des paliers (#397/#521) : 3 notions de maths ayant franchi un cap, réparties
   sur les dernières semaines. Dès qu'un franchissement est daté, la frise apparaît (pas de
   seuil de recul minimal). */
const SEED_PALIERS = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliers', JSON.stringify({
    'math-complements@ce2': { enCours: now - 5 * week },
    'math-doubles@ce2': { acquis: now - 2 * week },
    'math-moities@ce2': { enCours: now - 1 * week },
  }));
})();`;

/* Seed du signal de recul (#521) : « math-tables-multiplication » a franchi le cap « acquis »
   il y a 3 semaines (journal des paliers, jamais réécrit), mais n'est plus étoilée aujourd'hui
   et sa perf récente est retombée à 50 % → niveau courant « en cours ». C'est l'écart entre le
   cap le plus haut de la frise et le mot d'état courant qui sert de signal de recul — le seul
   trou du design d'après le relecteur qualité, rien d'autre ne le couvre. */
const SEED_REGRESSION = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliers', JSON.stringify({
    'math-tables-multiplication@ce2': { enCours: now - 6 * week, acquis: now - 3 * week },
  }));
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'math-tables-multiplication@ce2': {
      attempts: 5, correct: 6, questions: 10, bestPct: 90, lastPct: 50, recentPct: [50], lastAt: now,
    },
  }));
})();`;

/* Seed de la frise « à renforcer » (fix/frise-etats-uniformes) : une leçon TRAVAILLÉE dont
   la perf récente reste sous le seuil de 40 % (jamais franchi aucun palier vers le haut), et
   qui n'a donc AUCUNE entrée dans le journal des paliers pour elle-même. Avant ce correctif,
   ce palier était escamoté et la ligne n'avait aucune frise ; elle doit désormais en avoir une,
   avec au moins une cellule « non acquis ». Borne de mise en service posée à 6 semaines pour
   que la fenêtre de 12 semaines ne soit pas entièrement 'inconnu' (cf. friseNotion : sans
   borne datée, aucune semaine n'est déductible). */
const SEED_NON_ACQUIS = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliersDepuis', String(now - 6 * week));
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'num-comparer@ce2': { attempts: 2, correct: 5, questions: 20, bestPct: 30, lastPct: 30, recentPct: [20, 30], lastAt: now },
  }));
})();`;

/* Seed d'un historique DÉJÀ PROUVÉ (fix/frise-etats-uniformes) : AUCUNE borne stockée
   (`ludaskia_paliersDepuis`) au premier chargement, mais un franchissement daté d'une AUTRE
   leçon du profil (math-doubles, 3 semaines) qui PROUVE que le journal tournait déjà à cette
   date (cf. debutSuiviPaliers : le PLUS ANCIEN entre la borne stockée et tout franchissement
   déjà daté, PAS la borne seule). La leçon sous test (num-encadrer-intercaler) n'a, elle, aucun
   palier propre (aucunCap) : sa frise dépend donc entièrement du début de suivi retenu. Le test
   pose ensuite une borne PLUS RÉCENTE que ce franchissement, pour vérifier qu'elle ne l'efface
   pas (l'historique déjà prouvé continue de faire foi). */
const SEED_FRISE_HISTORIQUE = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliers', JSON.stringify({
    'math-doubles@ce2': { enCours: now - 3 * week },
  }));
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'num-encadrer-intercaler@ce2': { attempts: 3, correct: 7, questions: 15, bestPct: 50, lastPct: 50, recentPct: [45, 50], lastAt: now },
  }));
})();`;

/* Seed d'UNIFORMITÉ (fix/frise-etats-uniformes) : DEUX leçons voisines, avec le MÊME
   franchissement daté (« en cours » il y a 2 semaines) et la MÊME borne de suivi (4 semaines) —
   seule différence, `num-encadrer-intercaler` a une première rencontre ANCIENNE (10 semaines,
   donc ANTÉRIEURE à la borne), `num-droite-entiers` n'en a aucune. Avant le correctif, la
   première rencontre effaçait tout le préfixe « inconnu » d'un côté et pas de l'autre : deux
   lignes voisines s'affichaient selon deux règles. Les deux frises doivent désormais être
   IDENTIQUES. */
const SEED_UNIFORMITE = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliersDepuis', String(now - 4 * week));
  localStorage.setItem('e2e/ludaskia_paliers', JSON.stringify({
    'num-encadrer-intercaler@ce2': { enCours: now - 2 * week },
    'num-droite-entiers@ce2': { enCours: now - 2 * week },
  }));
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'num-encadrer-intercaler@ce2': { attempts: 3, correct: 7, questions: 15, bestPct: 50, lastPct: 50, recentPct: [45, 50], lastAt: now },
    'num-droite-entiers@ce2': { attempts: 3, correct: 7, questions: 15, bestPct: 50, lastPct: 50, recentPct: [45, 50], lastAt: now },
  }));
  localStorage.setItem('e2e/ludaskia_lessonFirstSeen', JSON.stringify({
    'num-encadrer-intercaler@ce2': now - 10 * week,
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

/* 4. Réglages classe : les selects de niveau sont présents (CE2 + CM1 au catalogue).
      Onglet Réglages (#459) : lien direct pour ouvrir la bonne section d'emblée. */
test("réglages classe : selects de niveau présents dans l'onglet Réglages", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant/reglages', { waitUntil: 'networkidle' });

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
   On supprime le verrou éventuel via page.evaluate() après le premier chargement.
   Le flux d'activation vit dans l'onglet Réglages (#459) : on y navigue directement
   par lien profond (`#encadrant/reglages`) avant de cliquer « Activer un code ». */
test('cycle PIN : activation, rechargement, mauvais code refusé, bon code accepté', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Premier chargement (via gotoHash qui injecte le profil CE2).
	await gotoHash(page, 'encadrant');

	// Nettoyer un verrou PIN éventuel laissé par un test précédent (via evaluate,
	// pas addInitScript, pour ne pas ré-exécuter la suppression sur le rechargement).
	await page.evaluate(() => localStorage.removeItem('ludaskia_encadrant_lock'));
	// Re-rendre la vue sans verrou, directement sur l'onglet Réglages.
	await page.goto('app.html#encadrant/reglages', { waitUntil: 'networkidle' });

	// Vérifier que l'onglet Réglages est directement accessible (pas de pavé).
	await expect(page.locator('[data-act="pin-activer"]')).toBeVisible();

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

	// De retour dans l'espace (session déjà déverrouillée en mémoire) : le re-rendu
	// reste sur l'onglet courant (Réglages, #459), donc un repère de Réglages plutôt
	// que .enc-frame (qui est du Suivi).
	await expect(page.locator('select[data-act="set-niveau-ref"]')).toBeVisible();

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
      Étapes : seed stats → épingler dans l'espace encadrant (onglet Programme, #459)
      → accueil enfant affiche la carte. */
test("carte « À revoir » : épingler une leçon faible la fait apparaître sur l'accueil", async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Injecter stats faibles ET supprimer PIN avant chargement.
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STATS_FAIBLES);
	// gotoHash injecte aussi ENSURE_NIVEAU (CE2) — on passe par navigation directe
	// pour conserver le seeding addInitScript déjà posé. « À revoir ensemble » vit dans
	// l'onglet Programme → lien profond direct.
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant/programme', { waitUntil: 'networkidle' });

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

/* 10. Frise d'états par leçon (#521) : remplace la frise « Évolution récente » par
       matière de #397 (bloc `.enc-evol` disparu). Paliers franchis → 12 cellules dans
       la ligne de détail, puce d'état omise (la frise porte déjà l'info), méta datée
       du cap le plus haut, et compteur « changements récents » par matière. Une leçon
       jamais travaillée garde sa puce et n'a pas de frise. */
test("frise d'états : 12 cellules cohérentes avec le seed, puce omise sur ces lignes, conservée sur une leçon jamais travaillée", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_PALIERS);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	// L'ancien bloc « Évolution récente » (#397) a disparu.
	await expect(page.locator('.enc-evol')).toHaveCount(0);

	// Déplier chaque catégorie pour exposer les lignes de détail.
	const resumes = page.locator('.enc-cat-sum');
	const n = await resumes.count();
	for (let i = 0; i < n; i++) await resumes.nth(i).click();

	// Palier « en cours » franchi il y a 5 semaines (seed) : frise de 12 cellules,
	// 1re semaine « inconnue » (avant tout franchissement connu), dernière « en cours ».
	const ligneEnCours = page.locator('.enc-detail-item:has([data-lesson="math-complements"])');
	const friseEnCours = ligneEnCours.locator('.enc-frise');
	await expect(friseEnCours).toHaveAttribute(
		'aria-label',
		/Évolution sur les 12 dernières semaines/,
	);
	const cellsEnCours = friseEnCours.locator('.enc-frise-cell');
	await expect(cellsEnCours).toHaveCount(12);
	await expect(cellsEnCours.first()).toHaveClass(/enc-frise-inconnu/);
	await expect(cellsEnCours.last()).toHaveClass(/enc-frise-en-cours/);
	await expect(ligneEnCours.locator('.enc-detail-meta')).toContainText('passée en cours');
	// La puce d'état disparaît : la frise porte déjà l'info. Sa GOUTTIÈRE reste réservée
	// (placeholder sans couleur), sinon le libellé de cette ligne partirait ~19 px à
	// gauche de ses voisines — on verrouille l'absence de COULEUR, pas l'absence d'élément.
	await expect(ligneEnCours.locator('.enc-detail-puce.enc-detail-puce--reserve')).toHaveCount(1);
	await expect(ligneEnCours.locator('.enc-detail-puce[class*="enc-key-"]')).toHaveCount(0);

	// Palier « acquis » franchi il y a 2 semaines (seed) : dernière cellule acquise,
	// avec le marqueur « semaine courante » (classe `enc-frise-courante`, distincte du nom
	// de l'état — une cellule « en cours » ET courante ne doit pas porter deux fois le même mot).
	const ligneAcquis = page.locator('.enc-detail-item:has([data-lesson="math-doubles"])');
	const derniereCelluleAcquis = ligneAcquis.locator('.enc-frise-cell').last();
	await expect(derniereCelluleAcquis).toHaveClass(/enc-frise-acquis/);
	await expect(derniereCelluleAcquis).toHaveClass(/enc-frise-courante/);
	await expect(ligneAcquis.locator('.enc-detail-meta')).toContainText('acquise');
	// Même règle : gouttière réservée, jamais de pastille COLORÉE (cf. commentaire ci-dessus).
	await expect(ligneAcquis.locator('.enc-detail-puce.enc-detail-puce--reserve')).toHaveCount(1);
	await expect(ligneAcquis.locator('.enc-detail-puce[class*="enc-key-"]')).toHaveCount(0);

	// Leçon jamais travaillée (aucun palier seedé) : pas de frise, puce d'état conservée.
	const ligneVierge = page.locator('.enc-detail-item:has([data-lesson="math-tables-addition"])');
	await expect(ligneVierge.locator('.enc-frise')).toHaveCount(0);
	await expect(ligneVierge.locator('.enc-detail-puce')).toBeVisible();

	// Couverture par matière : compteur « changements récents » (3 paliers dans la fenêtre).
	await expect(
		page.locator('.enc-mat-item').filter({ hasText: 'Mathématiques' }).locator('.enc-mat-counts'),
	).toContainText('changement');

	expect(errors).toEqual([]);
});

/* 10bis. Signal de recul (#521) : la frise ne redescend jamais (elle ne trace que les
       montées), donc le seul endroit où un recul se voit est l'écart entre son cap le plus
       haut et le mot d'état COURANT de la ligne (`.enc-detail-mot`, piloté par les stats/
       étoiles réelles, pas par le journal des paliers). Signalé par le relecteur qualité
       comme le seul trou du design : rien d'autre ne couvre ce cas. */
test("signal de recul : le mot d'état courant peut être plus bas que le cap le plus haut de la frise", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_REGRESSION);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	const resumes = page.locator('.enc-cat-sum');
	const n = await resumes.count();
	for (let i = 0; i < n; i++) await resumes.nth(i).click();

	const ligne = page.locator('.enc-detail-item:has([data-lesson="math-tables-multiplication"])');
	// La frise dit « acquis » (cap le plus haut jamais franchi)…
	await expect(ligne.locator('.enc-frise-cell').last()).toHaveClass(/enc-frise-acquis/);
	// … mais le mot d'état courant dit « en cours » : l'écart EST le signal de recul.
	await expect(ligne.locator('.enc-detail-mot')).toContainText('en cours');

	expect(errors).toEqual([]);
});

/* 10ter. Dépliage global par matière (#521) : un bouton par matière ouvre d'un coup toutes
       ses catégories (`<details class="enc-cat-d">`), sans toucher l'autre matière, et
       referme tout si tout est déjà ouvert. Un état de module retient les catégories
       ouvertes et RE-REND l'espace à chaque clic — le pli survit donc à toute autre action
       de l'écran (ex. « Épingler »), un travers corrigé par le relecteur qualité. Le bouton
       porte aussi un nom accessible dont le verbe bascule (« Tout déplier » / « Tout
       replier »). Catégories repliées au chargement. */
test('dépliage global par matière : ouvre puis referme toutes les catégories visées, sans toucher l’autre matière', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	const btnMath = page.locator('[data-act="deplier-matiere"][data-subject="math"]');
	const btnFrancais = page.locator('[data-act="deplier-matiere"][data-subject="francais"]');
	const catsMath = page.locator('.enc-cat-d[data-subject="math"]');
	const catsFrancais = page.locator('.enc-cat-d[data-subject="francais"]');

	await expect(btnMath).toBeVisible();
	await expect(btnFrancais).toBeVisible();
	expect(await catsMath.count()).toBeGreaterThan(1);

	// Repliées au chargement.
	await expect(btnMath).toHaveAttribute('aria-expanded', 'false');
	await expect(btnMath).toHaveAttribute('aria-label', /Tout déplier : Mathématiques/);
	expect(
		await catsMath.evaluateAll((els) => els.some((el) => (el as HTMLDetailsElement).open)),
	).toBe(false);

	// Ouvre TOUTES les catégories de maths, sans toucher le français.
	await btnMath.click();
	await expect(btnMath).toHaveAttribute('aria-expanded', 'true');
	// Le nom accessible bascule aussi (SC 4.1.2) : le verbe annonce désormais l'action inverse.
	await expect(btnMath).toHaveAttribute('aria-label', /Tout replier : Mathématiques/);
	expect(
		await catsMath.evaluateAll((els) => els.every((el) => (el as HTMLDetailsElement).open)),
	).toBe(true);
	expect(
		await catsFrancais.evaluateAll((els) => els.some((el) => (el as HTMLDetailsElement).open)),
	).toBe(false);
	await expect(btnFrancais).toHaveAttribute('aria-expanded', 'false');
	await expect(btnFrancais).toHaveAttribute('aria-label', /Tout déplier : Français/);

	// Reclique : tout étant déjà ouvert, la bascule referme tout.
	await btnMath.click();
	await expect(btnMath).toHaveAttribute('aria-expanded', 'false');
	await expect(btnMath).toHaveAttribute('aria-label', /Tout déplier : Mathématiques/);
	expect(
		await catsMath.evaluateAll((els) => els.some((el) => (el as HTMLDetailsElement).open)),
	).toBe(false);

	expect(errors).toEqual([]);
});

/* 10quater. Le pli survit à une autre action de l'écran (#521) : cliquer « Épingler » sur
       une leçon d'une catégorie ouverte NE la referme PAS. Avant #521 (manipulation DOM
       directe sans mémoire), un re-rendu quelconque effaçait tout pli fait à la main — ce qui
       cassait précisément le contexte de lecture que le dépliage venait de créer. */
test('dépliage global par matière : le pli survit à une autre action de l’écran (Épingler)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	const btnMath = page.locator('[data-act="deplier-matiere"][data-subject="math"]');
	const catsMath = page.locator('.enc-cat-d[data-subject="math"]');

	await btnMath.click();
	await expect(btnMath).toHaveAttribute('aria-expanded', 'true');

	// Une action SANS RAPPORT avec le pli (épingler une leçon) re-rend l'espace.
	await page.locator('[data-act="epingler"][data-lesson="math-complements"]').click();

	// Le pli n'a pas bougé : ni le bouton, ni les catégories.
	await expect(btnMath).toHaveAttribute('aria-expanded', 'true');
	expect(
		await catsMath.evaluateAll((els) => els.every((el) => (el as HTMLDetailsElement).open)),
	).toBe(true);

	expect(errors).toEqual([]);
});

/* 10quinquies. Frise « à renforcer » (fix/frise-etats-uniformes) : ce palier était escamoté
       (aucune frise pour les leçons n'ayant jamais dépassé 40 %, alors que ce sont celles qui
       intéressent le plus l'adulte). Une leçon travaillée mais toujours sous le seuil doit
       désormais afficher une frise, avec au moins une cellule `enc-frise-non-acquis`, et sa
       puce d'état omise comme les autres lignes à frise. */
test('frise d’états : une leçon jamais montée au-dessus du seuil affiche désormais une frise « non acquis »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_NON_ACQUIS);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	const resumes = page.locator('.enc-cat-sum');
	const n = await resumes.count();
	for (let i = 0; i < n; i++) await resumes.nth(i).click();

	const ligne = page.locator('.enc-detail-item:has([data-lesson="num-comparer"])');
	const frise = ligne.locator('.enc-frise');
	await expect(frise).toBeVisible();
	await expect(frise.locator('.enc-frise-cell')).toHaveCount(12);
	await expect(frise.locator('.enc-frise-non-acquis').first()).toBeVisible();
	// La puce d'état disparaît : la frise porte déjà l'info (même règle que les autres paliers) —
	// gouttière réservée, jamais de pastille colorée.
	await expect(ligne.locator('.enc-detail-puce.enc-detail-puce--reserve')).toHaveCount(1);
	await expect(ligne.locator('.enc-detail-puce[class*="enc-key-"]')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* 10sexies. Mise en service du journal (fix/frise-etats-uniformes) : `debutSuiviPaliers` retient
       le PLUS ANCIEN entre la borne stockée (`ludaskia_paliersDepuis`) et tout franchissement déjà
       daté du profil — PAS la borne en priorité. Raison (cf. encadrant-stats.ts) : la borne n'est
       posée qu'à la première fin de session SUIVANT son arrivée dans le code, donc un profil qui
       journalise depuis des semaines la reçoit datée d'AUJOURD'HUI ; la prendre en priorité
       effacerait à tort tout l'historique déjà PROUVÉ par un franchissement plus ancien.
       Ici, un franchissement ancien (3 semaines, sur une autre leçon) fixe le début de suivi, d'où
       8 cellules « inconnu » (12 − 3 − 1 semaines suivies). Poser ensuite une borne PLUS RÉCENTE
       (1 semaine) sur ce même profil NE DOIT RIEN CHANGER : sous la règle « borne prioritaire »,
       le préfixe se serait allongé à 10 cellules (12 − 1 − 1, l'historique prouvé effacé) ; sous la
       règle correcte (le plus ancien des deux), il reste à 8. */
test('frise d’états : le début de suivi retient le PLUS ANCIEN entre la borne stockée et l’historique déjà daté', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_FRISE_HISTORIQUE);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	const resumes = page.locator('.enc-cat-sum');
	const n = await resumes.count();
	for (let i = 0; i < n; i++) await resumes.nth(i).click();

	const ligne = page.locator('.enc-detail-item:has([data-lesson="num-encadrer-intercaler"])');
	await expect(ligne.locator('.enc-frise-cell')).toHaveCount(12);
	// Aucune borne stockée : le seul franchissement daté du profil (3 semaines) fixe le début de
	// suivi.
	await expect(ligne.locator('.enc-frise-inconnu')).toHaveCount(8);

	// Poser une borne PLUS RÉCENTE (1 semaine) que ce franchissement, puis re-rendre depuis zéro.
	await page.evaluate(() => {
		localStorage.setItem('e2e/ludaskia_paliersDepuis', String(Date.now() - 1 * 7 * 86400000));
	});
	await page.evaluate(() => {
		location.hash = 'accueil';
	});
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	const resumes2 = page.locator('.enc-cat-sum');
	const n2 = await resumes2.count();
	for (let i = 0; i < n2; i++) await resumes2.nth(i).click();
	const ligne2 = page.locator('.enc-detail-item:has([data-lesson="num-encadrer-intercaler"])');
	// Le franchissement plus ancien continue de faire foi : le préfixe NE bouge PAS (il se serait
	// allongé à 10 cellules si la borne, plus récente, avait pris le pas dessus).
	await expect(ligne2.locator('.enc-frise-inconnu')).toHaveCount(8);

	expect(errors).toEqual([]);
});

/* 10septies. Uniformité de la frise (fix/frise-etats-uniformes) — LE test qui garde le bug
       fermé : deux leçons voisines, même franchissement daté, même borne de suivi, mais l'une a
       une première rencontre (`ludaskia_lessonFirstSeen`) ANTÉRIEURE à la borne et l'autre pas.
       Avant le correctif, cette première rencontre effaçait tout le préfixe « inconnu » d'un
       côté sans toucher l'autre : deux lignes voisines s'affichaient selon deux règles
       différentes, départagées par un critère invisible pour le lecteur. Les deux frises
       doivent désormais être RIGOUREUSEMENT identiques. */
test('frise d’états : deux leçons aux paliers identiques restent identiques, 1re rencontre antérieure à la borne ou pas', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_UNIFORMITE);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant', { waitUntil: 'networkidle' });

	const resumes = page.locator('.enc-cat-sum');
	const n = await resumes.count();
	for (let i = 0; i < n; i++) await resumes.nth(i).click();

	const ligneAvecRencontre = page.locator(
		'.enc-detail-item:has([data-lesson="num-encadrer-intercaler"])',
	);
	const ligneSansRencontre = page.locator(
		'.enc-detail-item:has([data-lesson="num-droite-entiers"])',
	);

	const cellulesAvecRencontre = await ligneAvecRencontre
		.locator('.enc-frise-cell')
		.evaluateAll((els) => els.map((el) => el.className));
	const cellulesSansRencontre = await ligneSansRencontre
		.locator('.enc-frise-cell')
		.evaluateAll((els) => els.map((el) => el.className));
	// Comparaison cellule par cellule (pas seulement un décompte global) : les deux frises
	// doivent porter EXACTEMENT le même récit, dans le même ordre.
	expect(cellulesAvecRencontre).toEqual(cellulesSansRencontre);

	// Sanity : la frise n'est ni entièrement inconnue ni entièrement connue (sinon la
	// comparaison ci-dessus serait vraie par construction, sans rien démontrer).
	const inconnuAvecRencontre = await ligneAvecRencontre.locator('.enc-frise-inconnu').count();
	expect(inconnuAvecRencontre).toBeGreaterThan(0);
	expect(inconnuAvecRencontre).toBeLessThan(12);

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
	// Espace encadrants : les quatre aménagements (masquer le minuteur + lecture auto
	// + désactiver les apparitions surprises, #331 + ne pas rappeler les mots
	// difficiles en fin de séance, #618), dans l'onglet Réglages (#459).
	await gotoHash(page, 'encadrant/reglages');
	expect(await page.locator('[data-act="set-amenagement"]').count()).toBe(4);
	await expect(page.locator('[data-pref="sansApparitionsSurprises"]')).toBeVisible();
	await expect(page.locator('[data-pref="sansMotsDifficiles"]')).toBeVisible();
	expect(errors).toEqual([]);
});

/* 12. Longueur de séance de révision (#439) : select par profil, défaut = 12,
       réglage persistant sur le profil consulté (rechargement compris).
       Le réglage vit dans l'onglet Réglages (#459). */
test('séance de révision : select visible, 12 par défaut, réglage persistant au rechargement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/reglages');

	const select = page.locator('select[data-act="set-revision-plafond"]');
	await expect(select).toBeVisible();
	// Profil non réglé : la valeur par défaut (12) est sélectionnée, libellée « (par défaut) ».
	await expect(select).toHaveValue('12');
	await expect(select.locator('option[value="12"]')).toHaveText('12 (par défaut)');

	// Changer la valeur (ex. 24) puis recharger : le réglage doit survivre (profil consulté),
	// SANS re-poser addInitScript qui écraserait la valeur écrite.
	await select.selectOption('24');
	await expect(select).toHaveValue('24');

	await page.goto('app.html#encadrant/reglages', { waitUntil: 'networkidle' });
	await expect(page.locator('select[data-act="set-revision-plafond"]')).toHaveValue('24');

	expect(errors).toEqual([]);
});
