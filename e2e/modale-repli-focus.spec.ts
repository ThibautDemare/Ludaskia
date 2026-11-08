/* ============================================================
   Primitive des modales (`src/ui/modal-a11y.ts`) : repli du focus quand le déclencheur
   est MASQUÉ. `restoreFocus` ne teste que `document.contains(trigger)` : un déclencheur
   en `display:none` (ou sous un ancêtre masqué) est encore dans le DOM, `focus()` y échoue
   en silence dans un vrai navigateur, le repli `restoreFocusTo` n'est jamais tenté et le
   focus tombe sur <body>. happy-dom accepte le focus sur un élément masqué : seul un vrai
   navigateur le voit, d'où cette spec.

   La primitive est importée telle quelle depuis le serveur de dev Vite (module sans
   dépendance), puis jouée sur des nœuds montés dans <body> : on teste le comportement
   navigateur de la primitive, pas un écran particulier.

   Cas : (1) déclencheur masqué → repli ; (2) deux modales, la 2e déclenchée depuis un bouton
   de la 1re, fermée → repli ; (3) témoin : déclencheur visible → le focus y revient.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Monte le décor (deux overlays enfants directs de <body>, un déclencheur, un bouton de repli
   visible HORS des modales) et expose `window.__m` (la primitive) et `window.__scene`. */
async function monterDecor(page: Page): Promise<void> {
	await gotoHash(page, 'accueil');
	await page.evaluate(async () => {
		const m = await import(/* @vite-ignore */ '/Ludaskia/src/ui/modal-a11y.ts');
		const w = window as unknown as Record<string, unknown>;
		w.__m = m;
		const zone = document.createElement('div');
		zone.id = 'zoneRepli';
		zone.innerHTML = `<button id="declencheur">Déclencheur</button><button id="repli">Repli</button>`;
		document.body.appendChild(zone);
		for (const id of ['A', 'B']) {
			const o = document.createElement('div');
			o.id = `modale${id}`;
			o.className = 'modal-overlay';
			o.innerHTML = `<div class="modal"><button id="bouton${id}">Bouton ${id}</button></div>`;
			o.style.display = 'none';
			document.body.appendChild(o);
		}
	});
}

const actif = (page: Page) =>
	page.evaluate(() => {
		const a = document.activeElement;
		return a ? a.id || a.tagName.toLowerCase() : null;
	});

test('cas 1 : déclencheur masqué pendant la modale → le focus va au bouton de repli, pas à <body>', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await monterDecor(page);
	await page.evaluate(() => {
		const m = (window as any).__m;
		const declencheur = document.getElementById('declencheur')!;
		declencheur.focus();
		const overlay = document.getElementById('modaleA')!;
		overlay.style.display = '';
		(window as any).__release = m.activateModal(overlay, {
			trigger: declencheur,
			restoreFocusTo: () => document.getElementById('repli'),
		});
		// Le déclencheur est masqué pendant que la modale est ouverte, mais reste dans le DOM.
		declencheur.style.display = 'none';
		overlay.style.display = 'none';
		(window as any).__release();
	});
	expect(await actif(page)).toBe('repli');
	expect(errors).toEqual([]);
});

test('cas 2 : 2e modale déclenchée depuis un bouton de la 1re, toutes deux fermées → repli', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await monterDecor(page);
	await page.evaluate(() => {
		const m = (window as any).__m;
		const a = document.getElementById('modaleA')!;
		const b = document.getElementById('modaleB')!;
		a.style.display = '';
		const releaseA = m.activateModal(a, { trigger: document.getElementById('declencheur') });
		const boutonA = document.getElementById('boutonA')!;
		boutonA.focus();
		b.style.display = '';
		const releaseB = m.activateModal(b, {
			trigger: boutonA,
			restoreFocusTo: () => document.getElementById('repli'),
		});
		// On ferme A (libération puis masquage), puis B.
		releaseA();
		a.style.display = 'none';
		b.style.display = 'none';
		releaseB();
	});
	expect(await actif(page)).toBe('repli');
	expect(errors).toEqual([]);
});

test('cas 3 (témoin) : déclencheur visible → le focus y revient, le repli n’est pas utilisé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await monterDecor(page);
	const repliUtilise = await page.evaluate(() => {
		const m = (window as any).__m;
		let utilise = false;
		const declencheur = document.getElementById('declencheur')!;
		declencheur.focus();
		const overlay = document.getElementById('modaleA')!;
		overlay.style.display = '';
		const release = m.activateModal(overlay, {
			trigger: declencheur,
			restoreFocusTo: () => {
				utilise = true;
				return document.getElementById('repli');
			},
		});
		overlay.style.display = 'none';
		release();
		return utilise;
	});
	expect(await actif(page)).toBe('declencheur');
	expect(repliUtilise).toBe(false);
	expect(errors).toEqual([]);
});
