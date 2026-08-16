/* ============================================================
   Espace encadrant — composant « segment » (#476), contrat clavier APG
   « Radio Group » (`src/ui/segment.ts`, câblé dans `ui/encadrant.ts`).
   ------------------------------------------------------------
   Le rendu (`role="radiogroup"` / `role="radio"` + `aria-checked`, tabindex
   mobile à un seul arrêt) et la navigation clavier (flèches circulaires,
   Home/End, sélection qui suit le focus) sont FACTORISÉS pour les quatre
   segments de l'espace encadrant. On éprouve le contrat clavier À FOND sur
   celui à 4 options (période des erreurs, #476) — le plus exigeant (deux
   paires de flèches, bouclage dans les deux sens, Home/End) — puis on vérifie
   plus légèrement que le contrat ARIA/tabindex est bien posé sur les trois
   autres sites, et que la navigation reste CONFINÉE à son groupe quand
   plusieurs segments identiques coexistent sur la page (programmes).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Journal d'erreurs seedé pour le segment « Période des erreurs » (4 options) :
   UNE leçon par fenêtre, horodatée sur le DÉBUT DU JOUR LOCAL (+10h, jamais une
   soustraction fixe en ms — robuste à l'heure d'exécution du test), pour obtenir
   un compte de cartes strictement croissant d'une option à l'autre :
   jour=1 (A), deux-jours=2 (A,B), semaine=3 (A,B,C), tout=4 (A,B,C,D). */
const SEED_PERIODES = `(() => {
  const now = Date.now();
  const debutJour = new Date(now); debutJour.setHours(0, 0, 0, 0);
  const ilYA = (jours) => debutJour.getTime() - jours * 86400000 + 10 * 3600000;
  const liste = [
    { ts: ilYA(0),  lessonId: 'math-complements', mode: 'lecon',   question: '12 + … = 20', donnee: '7', attendue: '8' },
    { ts: ilYA(1),  lessonId: 'math-doubles',      mode: 'sprint',  question: 'double de 6 = …', donnee: '11', attendue: '12' },
    { ts: ilYA(6),  lessonId: 'math-moities',      mode: 'express', question: 'moitié de 8 = …', donnee: '3', attendue: '4' },
    { ts: ilYA(20), lessonId: 'math-mesures',      mode: 'express', question: '3 m = … cm', donnee: '30', attendue: '300' },
  ];
  localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify(liste));
})();`;

/* Révisions seedées (repris du pattern encadrant-revision.spec.ts) : de quoi
   afficher la bascule « Par catégorie » / « Par urgence » (masquée si vide). */
const SEED_REVISION = `(() => {
  const now = Date.now();
  const day = 86400000;
  localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify({
    'num-comparer@ce2': { palier: 2, prochaineRevision: now - day, reussites: 2, dernierTest: now - 3 * day },
    'math-complements@ce2': { palier: 6, prochaineRevision: null, reussites: 6, dernierTest: now - 20 * day },
  }));
})();`;

/* Activité seedée (repris du pattern encadrant.spec.ts) : le graphe (et sa bascule
   Total/Par type) ne se rend QUE s'il y a au moins une session sur les 7 derniers
   jours (`activiteHTML`, encadrant-progression.ts) — rien à comparer sinon. */
const SEED_ACTIVITE = `(() => {
  const now = Date.now();
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify([
    { t: now, k: 'lecon' }, { t: now, k: 'sprint' },
  ]));
})();`;

/* ---------- 1. Contrat clavier à fond : segment « période des erreurs » (4 options) ---------- */
test('segment radiogroup : flèches circulaires, Home/End, focus suit la sélection, pas de défilement (période des erreurs)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_PERIODES);
	await gotoHash(page, 'encadrant');

	const btn = (p: string) =>
		page.locator(`.enc-act-mode[data-act="erreurs-periode"][data-periode="${p}"]`);
	const lecons = page.locator('.enc-err-lecon');
	const focused = () => page.locator(':focus');

	// Contrat ARIA/tabindex initial : défaut adaptatif = « Aujourd'hui » (seule
	// période avec une erreur AUJOURD'HUI), un seul arrêt de tabulation.
	await expect(btn('jour')).toHaveClass(/\bon\b/);
	await expect(btn('jour')).toHaveAttribute('role', 'radio');
	await expect(btn('jour')).toHaveAttribute('aria-checked', 'true');
	await expect(btn('jour')).toHaveAttribute('tabindex', '0');
	for (const p of ['deux-jours', 'semaine', 'tout']) {
		await expect(btn(p)).toHaveAttribute('aria-checked', 'false');
		await expect(btn(p)).toHaveAttribute('tabindex', '-1');
	}
	await expect(lecons).toHaveCount(1);

	// Le conteneur porte le rôle et le nom accessible du groupe (contrat radiogroup).
	await expect(
		page.locator('.enc-act-modes[role="radiogroup"][aria-label="Période des erreurs affichées"]'),
	).toBeVisible();

	await btn('jour').focus();

	// SUIVANT (ArrowRight) : jour → deux-jours, la sélection SUIT le focus (contenu +
	// aria-checked + classe + tabindex changent), le focus reste sur l'option cochée.
	await page.keyboard.press('ArrowRight');
	await expect(focused()).toHaveAttribute('data-periode', 'deux-jours');
	await expect(btn('deux-jours')).toHaveClass(/\bon\b/);
	await expect(btn('deux-jours')).toHaveAttribute('aria-checked', 'true');
	await expect(btn('deux-jours')).toHaveAttribute('tabindex', '0');
	await expect(btn('jour')).toHaveAttribute('aria-checked', 'false');
	await expect(btn('jour')).toHaveAttribute('tabindex', '-1');
	await expect(lecons).toHaveCount(2);

	// SUIVANT via ArrowDown (les deux touches font la même chose) : deux-jours → semaine.
	await page.keyboard.press('ArrowDown');
	await expect(focused()).toHaveAttribute('data-periode', 'semaine');
	await expect(btn('semaine')).toHaveAttribute('aria-checked', 'true');
	await expect(lecons).toHaveCount(3);

	// SUIVANT : semaine → tout (dernière option).
	await page.keyboard.press('ArrowRight');
	await expect(focused()).toHaveAttribute('data-periode', 'tout');
	await expect(btn('tout')).toHaveAttribute('aria-checked', 'true');
	await expect(lecons).toHaveCount(4);

	// Bouclage circulaire : depuis la dernière option, SUIVANT revient à la première.
	await page.keyboard.press('ArrowRight');
	await expect(focused()).toHaveAttribute('data-periode', 'jour');
	await expect(btn('jour')).toHaveAttribute('aria-checked', 'true');
	await expect(lecons).toHaveCount(1);

	// PRÉCÉDENT (ArrowLeft) : bouclage circulaire dans l'autre sens, jour → tout.
	await page.keyboard.press('ArrowLeft');
	await expect(focused()).toHaveAttribute('data-periode', 'tout');
	await expect(btn('tout')).toHaveAttribute('aria-checked', 'true');
	await expect(lecons).toHaveCount(4);

	// PRÉCÉDENT via ArrowUp : tout → semaine.
	await page.keyboard.press('ArrowUp');
	await expect(focused()).toHaveAttribute('data-periode', 'semaine');
	await expect(lecons).toHaveCount(3);

	// Home → première option ; End → dernière option.
	await page.keyboard.press('Home');
	await expect(focused()).toHaveAttribute('data-periode', 'jour');
	await expect(btn('jour')).toHaveAttribute('aria-checked', 'true');
	await expect(lecons).toHaveCount(1);

	await page.keyboard.press('End');
	await expect(focused()).toHaveAttribute('data-periode', 'tout');
	await expect(btn('tout')).toHaveAttribute('aria-checked', 'true');
	await expect(lecons).toHaveCount(4);

	// `preventDefault` sur les touches de navigation (isolé du scroll-into-view LÉGITIME
	// que déclenche un changement de focus — pas un bon signal ici puisqu'il dépend de la
	// position du segment dans la page) : on dispatche un vrai `KeyboardEvent` annulable
	// sur l'option active et on vérifie que le handler l'a bien annulé.
	const defaultPrevented = (key: string) =>
		page.evaluate((k) => {
			const btn = document.querySelector('.enc-act-mode[data-act="erreurs-periode"].on');
			const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
			btn?.dispatchEvent(ev);
			return ev.defaultPrevented;
		}, key);
	for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
		expect(await defaultPrevented(key)).toBe(true);
	}
	// Une touche hors contrat (ex. lettre) n'est pas neutralisée par le segment.
	expect(await defaultPrevented('a')).toBe(false);

	expect(errors).toEqual([]);
});

/* ---------- 2. Contrat ARIA/tabindex, vérification légère : graphe d'activité + révisions ---------- */
test('segment radiogroup : contrat ARIA/tabindex en place sur le graphe d’activité et les révisions', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_REVISION);
	await page.addInitScript(SEED_ACTIVITE);
	await gotoHash(page, 'encadrant');

	// Graphe d'activité (2 options, défaut « Total »).
	await expect(
		page.locator('.enc-act-modes[role="radiogroup"][aria-label="Affichage du graphe d\'activité"]'),
	).toBeVisible();
	const total = page.locator('.enc-act-mode[data-act="activite-mode"][data-mode="total"]');
	const parType = page.locator('.enc-act-mode[data-act="activite-mode"][data-mode="type"]');
	await expect(total).toHaveAttribute('role', 'radio');
	await expect(total).toHaveAttribute('aria-checked', 'true');
	await expect(total).toHaveAttribute('tabindex', '0');
	await expect(parType).toHaveAttribute('aria-checked', 'false');
	await expect(parType).toHaveAttribute('tabindex', '-1');

	// Révisions (3 options depuis #555, défaut « Par catégorie »).
	await expect(
		page.locator('.enc-act-modes[role="radiogroup"][aria-label="Affichage des révisions"]'),
	).toBeVisible();
	const categorie = page.locator('.enc-act-mode[data-act="revision-mode"][data-mode="categorie"]');
	const urgence = page.locator('.enc-act-mode[data-act="revision-mode"][data-mode="urgence"]');
	const palier = page.locator('.enc-act-mode[data-act="revision-mode"][data-mode="palier"]');
	await expect(categorie).toHaveAttribute('aria-checked', 'true');
	await expect(categorie).toHaveAttribute('tabindex', '0');
	await expect(urgence).toHaveAttribute('aria-checked', 'false');
	await expect(urgence).toHaveAttribute('tabindex', '-1');
	// La 3e option (« Par palier », #555) porte le même contrat radio et n'est pas
	// cochée au départ, dans le MÊME radiogroup que les deux autres.
	await expect(palier).toHaveAttribute('role', 'radio');
	await expect(palier).toHaveAttribute('aria-checked', 'false');
	await expect(palier).toHaveAttribute('tabindex', '-1');
	await expect(
		page.locator(
			'.enc-act-modes[role="radiogroup"][aria-label="Affichage des révisions"] .enc-act-mode[data-mode="palier"]',
		),
	).toHaveCount(1);

	// Le clic reste fonctionnel (le contrat clavier n'a pas remplacé l'activation souris).
	await urgence.click();
	await expect(urgence).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('ul.enc-rev-flat')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- 3. Confinement : plusieurs segments identiques (récurrence de programme) ---------- */
test('segment radiogroup : la navigation clavier reste confinée à son groupe (plusieurs programmes)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');

	// Deux programmes (d1, d2), tous deux avec leur récurrence par défaut « Chaque
	// semaine » — même `data-act`/`data-type`, seul `data-def` les distingue.
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('[data-act="seance-add"]').click();
	const d1Hebdo = page.locator(
		'.enc-act-mode[data-act="seance-rec-type"][data-def="d1"][data-type="hebdo"]',
	);
	const d1Date = page.locator(
		'.enc-act-mode[data-act="seance-rec-type"][data-def="d1"][data-type="date"]',
	);
	const d2Hebdo = page.locator(
		'.enc-act-mode[data-act="seance-rec-type"][data-def="d2"][data-type="hebdo"]',
	);
	const d2Date = page.locator(
		'.enc-act-mode[data-act="seance-rec-type"][data-def="d2"][data-type="date"]',
	);

	await expect(d1Hebdo).toHaveAttribute('aria-checked', 'true');
	await expect(d2Hebdo).toHaveAttribute('aria-checked', 'true');
	// Repère de contenu : la variante hebdo affiche les 7 cases de jour.
	await expect(page.locator('input[data-act="seance-rec-jour"][data-def="d2"]')).toHaveCount(7);

	// Flèche sur le groupe de d2 SEULEMENT : bascule d2 sur « Une date » (contenu :
	// l'input date apparaît DANS la carte de d2), d1 reste totalement inchangé.
	await d2Hebdo.focus();
	await page.keyboard.press('ArrowLeft');
	await expect(page.locator(':focus')).toHaveAttribute('data-def', 'd2');
	await expect(page.locator(':focus')).toHaveAttribute('data-type', 'date');
	await expect(d2Date).toHaveAttribute('aria-checked', 'true');
	await expect(d2Date).toHaveAttribute('tabindex', '0');
	await expect(d2Hebdo).toHaveAttribute('aria-checked', 'false');
	await expect(d2Hebdo).toHaveAttribute('tabindex', '-1');
	await expect(page.locator('input[data-act="seance-rec-date"][data-def="d2"]')).toBeVisible();

	// d1 n'a pas bougé : toujours « Chaque semaine », ses 7 cases toujours là.
	await expect(d1Hebdo).toHaveAttribute('aria-checked', 'true');
	await expect(d1Hebdo).toHaveAttribute('tabindex', '0');
	await expect(d1Date).toHaveAttribute('aria-checked', 'false');
	await expect(page.locator('input[data-act="seance-rec-jour"][data-def="d1"]')).toHaveCount(7);

	expect(errors).toEqual([]);
});
