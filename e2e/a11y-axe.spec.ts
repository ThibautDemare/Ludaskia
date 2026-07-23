/* ============================================================
   Scan a11y automatique (axe-core) sur un échantillon de vues (#411).

   Signal AUTOMATISÉ en complément de l'agent-conseil `relecteur-accessibilite`
   (qui reste utile pour tout ce qu'axe ne mesure pas : sémantique, TTS, contexte).
   Chaque vue est amenée à un état stable (attente d'un élément repère PUIS de la
   fin des animations d'entrée, cf. `settleAnimations`), puis scannée en WCAG A/AA.
   Le rapport groupé par règle/élément est imprimé dans les logs (exploitable tel
   quel par un agent) et le détail JSON complet est attaché au rapport Playwright.

   ATTERRISSAGE NON BLOQUANT (#411) : par défaut les violations a11y sont REMONTÉES
   mais NE font PAS échouer le test — on ne fige pas le merge sur la dette a11y
   existante (suivie en #385/#386/#387). La bascule en gate bloquant fera l'objet
   d'un suivi séparé une fois la dette soldée. Pour prévisualiser ce que le gate
   bloquerait, lancer avec `A11Y_GATE=1` : le scan échoue alors sur toute violation.

   ÉCHANTILLON (représentatif des grandes familles de rendu, pas exhaustif) :
   - Accueil / grille des leçons  → structure de navigation principale.
   - Leçon maths avec figure SVG  → libellés `<title>`/`<desc>` + contraste des tracés.
   - Leçon français (saisie)      → consigne + champ de saisie (label de formulaire).
   - Leçon à tuiles (tri)          → ARIA sur-mesure (rôles, zone de dépôt), famille à risque.
   - Espace encadrant             → écran adulte dense (stats, réglages, contrôles).
   - Modale « nouveau profil »     → dialog de saisie superposé (rôle, focus, contraste).
   - Modale Récompenses           → dialog de gamification (couleurs des récompenses).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { scanA11y, formatA11yReport } from './axe';

/* Gate désactivé par défaut (cf. en-tête) ; `A11Y_GATE=1` le passe en bloquant. */
const GATE = !!process.env.A11Y_GATE;

/* Supprime un éventuel verrou PIN persistant avant d'ouvrir l'espace encadrant. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Attend la fin des animations d'ENTRÉE (finies, non infinies) du sous-arbre visé
   avant de scanner : `.modal` a une animation `modal-pop` 0.25s (opacité 0→1), et
   scanner à mi-fondu rend le contraste NON déterministe sous CI série (#411,
   relecture qualité). Règle générale : sur une vue animée, attendre la fin des
   animations, pas seulement un élément repère. On écarte les animations infinies
   (ambiance) pour ne pas bloquer. */
async function settleAnimations(page: Page, selector: string): Promise<void> {
	await page
		.locator(selector)
		.first()
		.evaluate((el) =>
			Promise.all(
				el
					.getAnimations({ subtree: true })
					.filter(
						(a) => (a.effect as KeyframeEffect | null)?.getComputedTiming().iterations !== Infinity,
					)
					.map((a) => a.finished.catch(() => undefined)),
			),
		);
}

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
		name: 'Leçon à tuiles (tri de mots)',
		hash: 'lecon-fr-vocab-champs-tri',
		open: async (page) => {
			// Masque l'auto-modale d'aide du runner tuiles pour scanner le runner lui-même.
			await seedAideVue(page);
			await gotoHash(page, 'lecon-fr-vocab-champs-tri');
			await page.locator('.ltri-tuile').first().waitFor({ state: 'visible' });
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
		hash: 'encadrant/profils',
		include: '.modal-overlay:not([id])',
		open: async (page) => {
			await page.addInitScript(CLEAR_PIN);
			// Le bouton « Nouveau profil » vit dans l'onglet Profils (#459).
			await gotoHash(page, 'encadrant/profils');
			await page.locator('[data-act="enc-add"]').click();
			await page.locator('.modal-overlay:not([id])').waitFor({ state: 'visible' });
			await page.locator('#uimodal-input').waitFor({ state: 'visible' });
			await settleAnimations(page, '.modal-overlay:not([id]) .modal');
		},
	},
	{
		name: 'Modale Récompenses (gamification)',
		hash: 'accueil',
		include: '#recompenses',
		open: async (page) => {
			await gotoHash(page, 'accueil');
			await page.locator('#home').waitFor({ state: 'visible' });
			await page.locator('[data-act="open-recompenses"]').click();
			await page.locator('#recompenses').waitFor({ state: 'visible' });
			await settleAnimations(page, '#recompenses .modal');
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
			body: JSON.stringify(
				{ violations: results.violations, incomplete: results.incomplete },
				null,
				2,
			),
			contentType: 'application/json',
		});

		// Smoke : la vue se rend sans erreur JS et axe a bien tourné.
		expect(errors).toEqual([]);
		expect(results.testEngine.name).toBe('axe-core');

		// A11y : non bloquant par défaut (dette existante) ; bloquant si A11Y_GATE=1.
		if (GATE) {
			expect(results.violations, report).toEqual([]);
		}
	});
}
