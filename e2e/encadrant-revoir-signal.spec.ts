/* ============================================================
   Espace encadrant — signal « reste un point dur » sur les lignes « À revoir
   ensemble » (#492). Une leçon butée ≥ BLOCAGES_SIGNAL_ADULTE (3) jours dans
   la « leçon du jour » (mécanique de report, #485) porte un marqueur
   `.enc-revoir-signal` EN PLUS de son état d'acquisition — une simple notion
   fragile (perf faible, aucun blocage) n'en porte pas.
   Sème directement `ludaskia_lessonStats` (déclenche la suggestion, seuil
   70 %) et `ludaskia_leconReport` (compteur de jours de blocage, seuil 3) :
   plus robuste que rejouer la mécanique de report pour amener l'état.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Deux leçons réelles du catalogue CE2 (labels tels que rendus par le
   catalogue — cf. `label` dans src/core/catalog.ts / src/data), reprises des
   specs encadrant existantes. */
const LABEL_FAIBLE = 'Complément à 10/100/1000'; // math-complements : fragile, jamais bloquée
const LABEL_BLOQUEE = 'Je compare les nombres'; // num-comparer : fragile ET bloquée 3 jours

/* Profil e2e avec niveauReference CE2 (repris du pattern encadrant.spec.ts :
   navigation directe par lien profond, sans passer par gotoHash). */
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

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Les deux leçons travaillées (questions > 0) avec une performance récente
   à 20 % (< seuil 70 %) : les DEUX sont donc « suggérées ». Seule
   num-comparer aura, en plus, un blocage ≥ 3 jours (seedé séparément). */
const SEED_STATS = `(() => {
  const stat = { attempts: 1, correct: 2, questions: 10, bestPct: 20, lastPct: 20, recentPct: [20] };
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'math-complements@ce2': stat,
    'num-comparer@ce2': stat,
  }));
})();`;

/* num-comparer butée 3 jours dans la leçon du jour (seuil BLOCAGES_SIGNAL_ADULTE,
   src/core/report-lecon.ts) : SEULE cette leçon doit porter le marqueur.
   Champs hors `jours` neutres (non lus par le signal). */
const SEED_REPORT_BLOQUEE = `(() => {
  localStorage.setItem('e2e/ludaskia_leconReport', JSON.stringify({
    'num-comparer@ce2': { jours: 3, dernierJour: '2024-01-01', reporteLe: 0, reprendreLe: 0, meilleurPct: 20 },
  }));
})();`;

test("signal « reste un point dur » sur une suggestion bloquée, absent d'une suggestion simplement faible", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STATS);
	await page.addInitScript(SEED_REPORT_BLOQUEE);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant/programme', { waitUntil: 'networkidle' });

	const section = page.locator('.enc-block').filter({ hasText: 'À revoir ensemble' });
	await expect(section).toBeVisible();

	// Suggestion simplement faible (aucun blocage) : pas de marqueur.
	const itemFaible = section.locator('.enc-revoir-item').filter({ hasText: LABEL_FAIBLE });
	await expect(itemFaible).toBeVisible();
	await expect(itemFaible.locator('.enc-revoir-signal')).toHaveCount(0);

	// Suggestion bloquée (≥ 3 jours) : marqueur visible, texte « reste un point dur ».
	const itemBloquee = section.locator('.enc-revoir-item').filter({ hasText: LABEL_BLOQUEE });
	await expect(itemBloquee).toBeVisible();
	await expect(itemBloquee.locator('.enc-revoir-signal')).toBeVisible();
	await expect(itemBloquee.locator('.enc-revoir-signal')).toContainText('reste un point dur');

	expect(errors).toEqual([]);
});

test('signal « reste un point dur » : survit au passage suggestion → épinglée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STATS);
	await page.addInitScript(SEED_REPORT_BLOQUEE);
	await page.addInitScript(SEED_CE2);
	await page.goto('app.html#encadrant/programme', { waitUntil: 'networkidle' });

	const section = page.locator('.enc-block').filter({ hasText: 'À revoir ensemble' });
	const item = section.locator('.enc-revoir-item').filter({ hasText: LABEL_BLOQUEE });

	// Avant épinglage (suggestion) : marqueur présent, bouton « Épingler ».
	await expect(item.locator('.enc-revoir-signal')).toBeVisible();
	const btnEpingler = item.locator('[data-act="epingler"]');
	await expect(btnEpingler).toHaveText('Épingler');
	await btnEpingler.click();

	// Après épinglage : la ligne passe côté « Épinglées » (bouton « Retirer »),
	// le marqueur reste affiché — c'est le point que la régression casserait.
	await expect(item.locator('[data-act="epingler"]')).toHaveText('Retirer');
	await expect(item.locator('.enc-revoir-signal')).toBeVisible();

	expect(errors).toEqual([]);
});
