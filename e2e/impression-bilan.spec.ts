/* ============================================================
   Écrit AVANT les corrections (#777).

   Critère 24 : l'impression RÉELLE (média `print`) d'un bilan qui couvre TOUS les
   formats d'exercice. Les gates Vitest regardent le balisage ; seul le média `print`
   dit ce que le papier montre vraiment (boutons, pavé, chrono, parcours guidé de
   l'écran qui fuiraient sur la feuille).

   Geste : configurateur `#bilan-custom` → une leçon par format → case corrigé →
   `#bcPrint`. `window.print` est stubé (la boîte du navigateur est inaccessible) :
   il déclenche `beforeprint`, qui monte le document imprimable dans `#sheets`. On
   émule ensuite le média `print` et on mesure.

   DÉTERMINISME de la capture : l'aléa de génération part de `Math.random`, capturé
   au chargement des modules (`randomSource = Math.random`, core/utils.ts) — le
   remplacer après coup ne sert à rien. Le script d'init pose donc, AVANT le
   chargement, un `Math.random` qui délègue à `window.__rng` ; ce dernier ne vaut le
   vrai `Math.random` que tant que le test ne l'a pas fixé, ce qu'il fait juste avant
   le clic sur `#bcPrint`. Rien de ce qui précède (accueil, leçon du jour) n'entre donc
   dans la suite tirée.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';

/* Un exemplaire de CHAQUE format d'exercice (cf. `Exercise['type']`). Ids écrits en dur :
   une spec ne lit pas `src/`. */
const LECONS_PAR_FORMAT = [
	'math-complements', // saisie numérique
	'calc-addition-posee', // opération posée
	'fr-conj-groupe', // QCM
	'fr-homophones-et', // QCM à trou
	'num-comparer', // comparaison
	'fr-vocab-alpha-initiale', // ordre
	'fr-vocab-champs-tri', // tri
	'fr-vocab-familles-relier', // relier à mots
	'fr-gram-gn-nommer', // relier à étiquettes
	'fr-gram-clic-verbe', // clic-mot
	'num-droite-entiers', // droite graduée
	'math-prob-composition', // problème
];

/* Tout ce qui est chrome d'ÉCRAN et ne doit JAMAIS atteindre le papier. */
const ELEMENTS_D_ECRAN = [
	'.toolbar',
	'.pave-signes',
	'#chrono',
	'#btnVerify',
	'.bilan-parcours',
	'button',
];

const SEED = 20260;

declare global {
	interface Window {
		__rng?: () => number;
	}
}

/* `window.print` → `beforeprint` ; `Math.random` délègue à `window.__rng` (cf. en-tête). */
function amorcer() {
	const vrai = Math.random.bind(Math);
	Math.random = () => (window.__rng ? window.__rng() : vrai());
	window.print = () => window.dispatchEvent(new Event('beforeprint'));
}

async function fixerAlea(page: Page) {
	await page.evaluate((seed) => {
		let a = seed >>> 0; // mulberry32
		window.__rng = () => {
			a = (a + 0x6d2b79f5) | 0;
			let t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}, SEED);
}

/* Compose le bilan (une leçon par format), coche le corrigé et imprime. */
async function imprimerBilanTousFormats(page: Page) {
	await page.addInitScript(amorcer);
	await gotoHash(page, 'bilan-custom');
	await page.locator('#bcSelectNone').waitFor({ state: 'attached' });
	// Les leçons vivent dans des accordéons fermés : on coche par le DOM (+ `change`, qui
	// met à jour les compteurs), pas au clic.
	const manquantes = await page.evaluate((ids) => {
		document
			.querySelectorAll<HTMLInputElement>('.bc-lesson-check')
			.forEach((cb) => (cb.checked = false));
		const absentes: string[] = [];
		for (const id of ids) {
			const cb = document.querySelector<HTMLInputElement>(`.bc-lesson-check[value="${id}"]`);
			if (!cb) {
				absentes.push(id);
				continue;
			}
			cb.checked = true;
			cb.dispatchEvent(new Event('change', { bubbles: true }));
		}
		return absentes;
	}, LECONS_PAR_FORMAT);
	expect(manquantes, 'leçons absentes du configurateur').toEqual([]);
	await expect(page.locator('.bc-lesson-check:checked')).toHaveCount(LECONS_PAR_FORMAT.length);

	await page.locator('#bcCorrige').check();
	await fixerAlea(page);
	await page.locator('#bcPrint').click();
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('#sheets .cover-corrige')).toBeAttached();
}

test.describe('Impression réelle du bilan, tous formats (#777, critère 24)', () => {
	test('24 : en média print, aucun élément d’écran ; page de garde, feuille et corrigé présents', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await imprimerBilanTousFormats(page);

		// Garde anti-vide : la barre d'outils existe bien dans le DOM, sinon « rien de visible »
		// serait vrai pour la mauvaise raison.
		await expect(page.locator('.toolbar')).not.toHaveCount(0);

		// Aucun élément d'écran visible. `checkVisibility` tient compte du `display:none` des
		// ancêtres, de `visibility` et de `content-visibility`.
		const visibles = await page.evaluate((sels) => {
			const out: string[] = [];
			for (const sel of sels) {
				document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
					const r = el.getBoundingClientRect();
					if (el.checkVisibility({ visibilityProperty: true }) && r.width > 0 && r.height > 0) {
						out.push(`${sel} → ${el.id ? '#' + el.id : el.className || el.tagName}`);
					}
				});
			}
			return out;
		}, ELEMENTS_D_ECRAN);
		expect(visibles, 'éléments d’écran encore visibles sur le papier').toEqual([]);

		// Page de garde, feuille, corrigé.
		const sheets = page.locator('#sheets');
		await expect(sheets.locator('.cover:not(.cover-corrige)')).toBeVisible();
		await expect(sheets.locator('.bilan-title').first()).toBeVisible();
		await expect(sheets.locator('.cover-corrige')).toBeVisible();

		// Un bloc par leçon choisie, sur la feuille (la 1re `.bilan-grid`), donc aucun format
		// n'est silencieusement perdu à l'impression.
		const blocsFeuille = await sheets.locator('.bilan-grid').first().locator('.bloc').count();
		expect(blocsFeuille).toBe(LECONS_PAR_FORMAT.length);

		expect(errors).toEqual([]);
	});

	/* Capture de référence : comparée en CI Linux SEULEMENT (le moteur de texte diffère sous
	   Windows, cf. e2e/README.md) ; la baseline vient du workflow `update-snapshots.yml`,
	   jamais d'un run local. Page 1 du bilan = la feuille de l'enfant (la page de garde est
	   statique, elle ne dit rien du rendu des formats). */
	test('24 : capture de référence de la première page du bilan imprimé', async ({ page }) => {
		const errors = watchErrors(page);
		await imprimerBilanTousFormats(page);

		const feuille = page.locator('#sheets .page:has(.bilan-grid)').first();
		await expect(feuille).toBeVisible();
		await page.evaluate(() => document.fonts.ready);

		// Viewport plus haut que la page (#458) : sinon Playwright assemble plusieurs prises,
		// ce qui n'est pas reproductible.
		const hauteur = await feuille.evaluate((el) => el.getBoundingClientRect().height);
		await page.setViewportSize({
			width: page.viewportSize()?.width ?? 393,
			height: Math.ceil(hauteur) + 8,
		});
		await page.evaluate(() => document.fonts.ready);

		await expect(feuille).toHaveScreenshot('impression-bilan-page-1.png', {
			animations: 'disabled',
			timeout: 30_000,
		});
		expect(errors).toEqual([]);
	});
});
