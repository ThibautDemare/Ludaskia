/* ============================================================
   Bloc « Travaillé récemment » (#520) — espace encadrant, onglet Suivi.
   ------------------------------------------------------------
   Couvre : le round-trip complet (jouer une VRAIE leçon la fait apparaître
   NOMMÉE, avec sa méta « catégorie · N fois · quand »), le sélecteur de
   période (resserrer la fenêtre retire une leçon devenue trop ancienne, le
   message dédié apparaît, l'option cochée suit le clic), l'état vide, et le
   décompte mixte leçons/dictées de la synthèse (relu langue après coup :
   « N fois » et non « travaillée N fois » — réservé au compte CUMULÉ de
   l'accordéon « Notions par catégorie », deux chiffres différents sous la
   même phrase se lisant comme un bug ; « Aucune session … » et non « Aucune
   leçon travaillée … », le mot déjà employé par le graphe d'activité juste
   au-dessus ; les dictées comptées À PART dans la synthèse, jamais annoncées
   comme une « leçon »).

   Le bloc partage l'onglet Suivi avec plusieurs AUTRES `.enc-sub-lab`
   (Couverture par matière, Évolution récente, À revoir ensemble) et
   `.enc-act-mode` (graphe d'activité, période des erreurs, révisions) :
   tous les sélecteurs ci-dessous sont scopés au bloc lui-même
   (`.enc-block` filtré sur son titre), jamais globaux.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Le bloc, scopé par son titre (h3) : point d'entrée de tous les sélecteurs
   de cette spec, pour ne jamais retomber sur un `.enc-sub-lab`/`.enc-act-mode`
   d'un AUTRE bloc de l'onglet Suivi. */
const bloc = (page: import('@playwright/test').Page) =>
	page.locator('.enc-block').filter({ hasText: 'Travaillé récemment' });

/* 1. Round-trip : jouer une VRAIE leçon (fiche en saisie, num-comparer) la fait
   apparaître nommée dans le bloc, avec sa catégorie, son compte de séances et
   sa date. Chemin le plus fidèle : le journal d'activité et les stats se
   remplissent comme en vrai (`ref` compris), pas un seed direct des stores. */
test('jouer une leçon la fait apparaître nommée dans « Travaillé récemment »', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await seedAideVue(page);
	await gotoHash(page, 'lecon-num-comparer'); // mode par défaut = saisie

	const fields = page.locator('#sheets input.ans');
	const n = await fields.count();
	expect(n).toBeGreaterThan(0);
	// Remplit CHAQUE champ avec sa VRAIE réponse (data-answer) : essai sans faute.
	for (let i = 0; i < n; i++) {
		const f = fields.nth(i);
		const ans = await f.getAttribute('data-answer');
		await f.fill(ans ?? '');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await expect(page.locator('.mark.wrong')).toHaveCount(0);

	await gotoHash(page, 'encadrant');
	const b = bloc(page);
	await expect(b).toBeVisible();

	// Groupée sous l'en-tête de sa matière (« Mathématiques »), scopé au bloc.
	await expect(b.locator('.enc-sub-lab').filter({ hasText: 'Mathématiques' })).toBeVisible();

	// La leçon jouée est NOMMÉE (libellé du catalogue), avec sa méta factuelle :
	// catégorie (Numération) · 1 fois (un seul essai, PAS « travaillée 1 fois » —
	// formule réservée au compte CUMULÉ de l'accordéon « Notions par catégorie »,
	// pour ne pas afficher deux chiffres différents sous la même phrase) · aujourd'hui.
	const ligne = b.locator('.enc-trav-item').filter({ hasText: 'Je compare les nombres' });
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-trav-lab')).toHaveText('Je compare les nombres');
	await expect(ligne.locator('.enc-trav-meta')).toContainText('Numération');
	await expect(ligne.locator('.enc-trav-meta')).toContainText('1 fois');
	await expect(ligne.locator('.enc-trav-meta')).not.toContainText('travaillée');
	await expect(ligne.locator('.enc-trav-meta')).toContainText("aujourd'hui");

	expect(errors).toEqual([]);
});

/* Une leçon travaillée il y a 3 jours (ancrée sur le DÉBUT DU JOUR LOCAL, +10h —
   jamais une soustraction fixe en ms, cf. erreurs-encadrant.spec.ts) : visible
   dans la fenêtre par défaut (7 jours), hors fenêtre une fois resserré sur
   « Aujourd'hui » (1 jour). Seedé directement (pas de round-trip réel possible
   sans attendre 3 jours) : clé namespacée `lessonId@niveau`, champ `lastAt`. */
const SEED_TRAVAIL_ANCIEN = `(() => {
  const now = Date.now();
  const debutJour = new Date(now); debutJour.setHours(0, 0, 0, 0);
  const ilYA = (jours) => debutJour.getTime() - jours * 86400000 + 10 * 3600000;
  const stat = { attempts: 2, correct: 18, questions: 20, bestPct: 90, lastPct: 90, recentPct: [90], lastAt: ilYA(3) };
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({ 'math-complements@ce2': stat }));
})();`;

/* 2. Sélecteur de période : la fenêtre par défaut (7 jours) nomme la leçon,
   resserrer sur « Aujourd'hui » la retire (hors fenêtre) et affiche le message
   dédié, et l'option cochée suit le clic (contrat radiogroup, comme les autres
   segments de l'espace encadrant, cf. encadrant-segment.spec.ts). */
test("sélecteur de période : resserrer sur « Aujourd'hui » retire la leçon devenue trop ancienne", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_TRAVAIL_ANCIEN);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	const btn = (jours: string) =>
		b.locator(`.enc-act-mode[data-act="travail-periode"][data-jours="${jours}"]`);

	// Défaut : « 1 semaine » (7 jours), cochée — la leçon d'il y a 3 jours y est nommée.
	await expect(btn('7')).toHaveClass(/\bon\b/);
	await expect(btn('7')).toHaveAttribute('aria-checked', 'true');
	const ligne = b.locator('.enc-trav-item').filter({ hasText: 'Complément à 10/100/1000' });
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-trav-meta')).toContainText('il y a 3 jours');

	// Resserrer sur « Aujourd'hui » (1 jour) : la leçon sort de la fenêtre → message
	// dédié, ET l'option cochée bascule (re-rendu, focus/état conservés).
	await btn('1').click();
	await expect(btn('1')).toHaveClass(/\bon\b/);
	await expect(btn('1')).toHaveAttribute('aria-checked', 'true');
	await expect(btn('7')).toHaveAttribute('aria-checked', 'false');
	await expect(b.locator('.enc-trav-item')).toHaveCount(0);
	// « Aucune session … », pas « Aucune leçon travaillée … » : le mot déjà employé par
	// le graphe d'activité juste au-dessus, pour ne pas faire entendre « 0 leçon
	// travaillée » à un lecteur d'écran (ce texte sert aussi de nom accessible à l'option
	// de période active).
	await expect(b).toContainText("Aucune session aujourd'hui.");

	expect(errors).toEqual([]);
});

/* 3. État vide : aucune leçon travaillée dans la fenêtre (aucun seed) → message
   dédié, aucune ligne. */
test('état vide : aucune leçon travaillée récemment', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	await expect(b).toBeVisible();
	await expect(b).toContainText('Aucune session sur les 7 derniers jours.');
	await expect(b.locator('.enc-trav-item')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Une leçon ET une dictée travaillées AUJOURD'HUI : la leçon via les stats (comme
   SEED_TRAVAIL_ANCIEN), la dictée via le SEUL journal d'activité (`k: 'dictee'`, `ref`
   = id d'une dictée PRÉDÉFINIE — pas besoin de seeder le store `ludaskia_ortho`,
   `labelLeconOrtho` la résout seule, cf. suivi-dictees-encadrant.spec.ts). */
const SEED_MIXTE = `(() => {
  const now = Date.now();
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'math-complements@ce2': { attempts: 1, correct: 8, questions: 10, bestPct: 80, lastPct: 80, recentPct: [80], lastAt: now },
  }));
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify([
    { t: now, k: 'dictee', ref: 'fr-ortho-invariables-1' },
  ]));
})();`;

/* 4. Synthèse mixte (relu langue, #520) : une leçon et une dictée sont comptées à part
   dans la phrase de synthèse (« 1 leçon et 1 dictée travaillées … »), jamais fondues
   sous « leçon » — c'est précisément la faute corrigée par la relecture. La dictée
   porte aussi sa propre étiquette de contexte (« Dictée »), fournie par l'UI (le champ
   `contexte` renvoyé par le calcul core est vide pour une dictée, `kind` porte la
   nature de la cible). */
test('synthèse : une leçon et une dictée sont comptées SÉPARÉMENT (pas « 1 leçon » pour une dictée)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_MIXTE);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	await expect(b).toContainText('1 leçon et 1 dictée travaillées sur les 7 derniers jours.');

	const ligneDictee = b.locator('.enc-trav-item').filter({ hasText: 'Mots invariables (1)' });
	await expect(ligneDictee).toBeVisible();
	await expect(ligneDictee.locator('.enc-trav-meta')).toContainText('Dictée');

	expect(errors).toEqual([]);
});
