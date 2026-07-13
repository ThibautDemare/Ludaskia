/* ============================================================
   Scan a11y automatique (axe-core) sur un échantillon de vues (#411).

   Signal AUTOMATISÉ en complément de l'agent-conseil `relecteur-accessibilite`
   (qui reste utile pour tout ce qu'axe ne mesure pas : sémantique, TTS, contexte).
   Chaque vue est amenée à un état stable (attente d'un élément repère, comme les
   autres specs), puis scannée en WCAG A/AA. Le rapport groupé par règle/élément
   est imprimé dans les logs (exploitable tel quel par un agent) et le détail JSON
   complet est attaché au rapport Playwright.

   ATTERRISSAGE NON BLOQUANT (#411) : par défaut les violations a11y sont REMONTÉES
   mais NE font PAS échouer le test — on ne fige pas le merge sur la dette a11y
   existante (suivie en #385/#386/#387). La bascule en gate bloquant fera l'objet
   d'un suivi séparé une fois la dette soldée. Pour prévisualiser ce que le gate
   bloquerait, lancer avec `A11Y_GATE=1` : le scan échoue alors sur toute violation.

   ÉCHANTILLON (représentatif des grandes familles de rendu, pas exhaustif) :
   - Accueil / grille des leçons  → structure de navigation principale.
   - Leçon maths avec figure SVG  → libellés `<title>`/`<desc>` + contraste des tracés.
   - Leçon français (saisie)      → consigne + champ de saisie (label de formulaire).
   - Espace encadrant             → écran adulte dense (stats, réglages, contrôles).
   - Modale « nouveau profil »     → dialog superposé (rôle, focus, contraste).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import { scanA11y, formatA11yReport } from './axe';

/* Gate désactivé par défaut (cf. en-tête) ; `A11Y_GATE=1` le passe en bloquant. */
const GATE = !!process.env.A11Y_GATE;

/* Supprime un éventuel verrou PIN persistant avant d'ouvrir l'espace encadrant. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

interface View {
	name: string;
	hash: string;
	/* Amène la vue à un état stable (navigation + attente d'un repère + interaction). */
	open: (page: Page) => Promise<void>;
	/* Restreint le scan axe à un sous-arbre (ex. la modale ouverte). */
	include?: string;
}

const VIEWS: View[] = [
	{
		name: 'Accueil / grille des leçons',
		hash: 'accueil',
		open: async (page) => {
			await gotoHash(page, 'accueil');
			await page.locator('#home').waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Leçon maths avec figure SVG (Les angles)',
		hash: 'lecon-geo-angles',
		open: async (page) => {
			await gotoHash(page, 'lecon-geo-angles');
			await page.locator('.figure svg').first().waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Leçon français (conjugaison — être au présent)',
		hash: 'lecon-fr-conj-etre-present',
		open: async (page) => {
			await gotoHash(page, 'lecon-fr-conj-etre-present');
			await page.locator('.consigne-line').first().waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Espace encadrant',
		hash: 'encadrant',
		open: async (page) => {
			await page.addInitScript(CLEAR_PIN);
			await gotoHash(page, 'encadrant');
			await page.locator('.enc-frame').waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Modale « nouveau profil »',
		hash: 'encadrant',
		include: '.modal-overlay:not([id])',
		open: async (page) => {
			await page.addInitScript(CLEAR_PIN);
			await gotoHash(page, 'encadrant');
			await page.locator('[data-act="enc-add"]').click();
			await page.locator('.modal-overlay:not([id])').waitFor({ state: 'visible' });
			await page.locator('#uimodal-input').waitFor({ state: 'visible' });
		},
	},
];

for (const view of VIEWS) {
	test(`axe — ${view.name}`, async ({ page }, testInfo) => {
		const errors = watchErrors(page);
		await view.open(page);

		const results = await scanA11y(page, { include: view.include });
		const report = formatA11yReport(view.name, view.hash, results);

		// Rapport lisible dans les logs CI + détail JSON complet attaché (débogage à distance).
		console.log('\n' + report + '\n');
		await testInfo.attach(`axe-${view.hash}.json`, {
			body: JSON.stringify(results.violations, null, 2),
			contentType: 'application/json',
		});

		// Smoke : la vue se rend sans erreur JS et axe a bien tourné.
		expect(errors).toEqual([]);
		expect(results).toBeTruthy();

		// A11y : non bloquant par défaut (dette existante) ; bloquant si A11Y_GATE=1.
		if (GATE) {
			expect(results.violations, report).toEqual([]);
		}
	});
}
