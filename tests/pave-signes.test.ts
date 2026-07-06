/* ============================================================
   Pavé de signes « < = > » (#380) — rendu et comportement.

   Rendu (core/items.ts + core/signes.ts) : un item dont la réponse est un signe
   de comparaison reçoit un champ `.ans-signe` SANS clavier virtuel
   (inputmode="none") suivi d'un pavé de trois boutons ; les autres items et les
   modes impression/corrigé n'en reçoivent pas.
   Comportement (ui/pave-signes.ts) : le tap remplit le champ par le même chemin
   que la frappe (évènement `input`), l'état aria-pressed suit la valeur du
   champ, y compris tapée au clavier physique.
   ============================================================ */
import { describe, test, expect, beforeEach } from 'vitest';
import { renderItem, createRenderContext } from '../src/core/items';
import type { Item } from '../src/core/items';
import { estSigneComparaison, signeView, SIGNES_COMPARAISON } from '../src/core/signes';
import { installPaveSignes } from '../src/ui/pave-signes';

const itemSigne = (answer: string): Item => ({
	text: `Compare : 3 456 @ 3 465`,
	answer,
	kind: 'text',
});

describe('estSigneComparaison (#380)', () => {
	test('reconnaît les trois signes (espaces tolérés)', () => {
		for (const s of SIGNES_COMPARAISON) expect(estSigneComparaison(s)).toBe(true);
		expect(estSigneComparaison(' < ')).toBe(true);
	});
	test("écarte ce qui n'est pas un signe", () => {
		expect(estSigneComparaison('chat')).toBe(false);
		expect(estSigneComparaison('<=')).toBe(false);
		expect(estSigneComparaison('')).toBe(false);
		expect(estSigneComparaison(42)).toBe(false);
	});
});

describe('rendu du champ signe et du pavé (#380)', () => {
	test('item signe → champ .ans-signe sans clavier virtuel + pavé de 3 boutons', () => {
		const html = renderItem(itemSigne('<'), createRenderContext());
		expect(html).toContain('ans-signe');
		expect(html).toContain('inputmode="none"');
		expect(html).toContain('class="pave-signes screen-only"');
		expect(html.match(/class="pave-signe"/g)).toHaveLength(3);
		// Ordre FIGÉ « < = > » (même ancrage spatial que les tuiles). escapeHTML du
		// projet n'échappe pas « > » (sans risque en valeur d'attribut).
		const ordre = [...html.matchAll(/data-signe="([^"]+)"/g)].map((m) => m[1]);
		expect(ordre).toEqual(['&lt;', '=', '>']);
		// Libellés accessibles complets (registre CE2), boutons non pressés au rendu.
		expect(html).toContain('aria-label="plus petit que"');
		expect(html).toContain('aria-label="égal à"');
		expect(html).toContain('aria-label="plus grand que"');
		expect(html).not.toContain('aria-pressed="true"');
	});

	test('les boutons du pavé sont rattachés au champ rendu (data-for = id)', () => {
		const ctx = createRenderContext();
		const html = renderItem(itemSigne('>'), ctx);
		const id = html.match(/<input[^>]*id="(a\d+)"/)?.[1];
		expect(id).toBeTruthy();
		// 3 boutons rattachés au champ (la marque ✓/✗ porte AUSSI un data-for : on ne
		// compte que ceux des boutons du pavé).
		expect(html.match(new RegExp(`class="pave-signe" data-for="${id}"`, 'g'))?.length).toBe(3);
	});

	test('pas de pavé pour une réponse numérique ou un mot', () => {
		expect(renderItem({ text: '3 + 4 = @', answer: 7 }, createRenderContext())).not.toContain(
			'pave-signes',
		);
		expect(
			renderItem({ text: 'Le félin : @', answer: 'chat', kind: 'text' }, createRenderContext()),
		).not.toContain('pave-signes');
	});

	test('pas de pavé à l’impression ni en corrigé', () => {
		const impr = renderItem(itemSigne('='), createRenderContext({ printMode: true }));
		expect(impr).not.toContain('pave-signes');
		const corrige = renderItem(
			itemSigne('='),
			createRenderContext({ printMode: true, corrigeMode: true }),
		);
		expect(corrige).not.toContain('pave-signes');
		expect(corrige).toContain('ans-corrige'); // la réponse est révélée, pas de champ
	});
});

describe('signeView (#380)', () => {
	test('glyphe échappé + mot-légende, libellé accessible complet', () => {
		const v = signeView('<');
		expect(v.html).toContain('&lt;');
		expect(v.html).toContain('petit');
		expect(v.label).toBe('plus petit que');
		expect(signeView('=').label).toBe('égal à');
		expect(signeView('>').label).toBe('plus grand que');
	});
});

describe('comportement du pavé (ui/pave-signes.ts)', () => {
	beforeEach(() => {
		document.body.innerHTML = `<div id="sheets">${renderItem(itemSigne('<'), createRenderContext())}</div>`;
		installPaveSignes();
	});

	const bouton = (signe: string) =>
		[...document.querySelectorAll<HTMLButtonElement>('.pave-signe')].find(
			(b) => b.dataset.signe === signe,
		)!;

	test('un tap remplit le champ et enfonce LE bouton tapé', () => {
		bouton('<').click();
		const champ = document.querySelector<HTMLInputElement>('.ans-signe')!;
		expect(champ.value).toBe('<');
		expect(bouton('<').getAttribute('aria-pressed')).toBe('true');
		expect(bouton('=').getAttribute('aria-pressed')).toBe('false');
		expect(bouton('>').getAttribute('aria-pressed')).toBe('false');
	});

	test('changer d’avis : le nouveau tap remplace le signe et déplace l’état', () => {
		bouton('<').click();
		bouton('>').click();
		const champ = document.querySelector<HTMLInputElement>('.ans-signe')!;
		expect(champ.value).toBe('>');
		expect(bouton('<').getAttribute('aria-pressed')).toBe('false');
		expect(bouton('>').getAttribute('aria-pressed')).toBe('true');
	});

	test('le tap émet `input` (bulle) : le chemin d’effacement du marquage est joué', () => {
		let recu = false;
		document.getElementById('sheets')!.addEventListener('input', () => (recu = true));
		bouton('=').click();
		expect(recu).toBe(true);
	});

	test('la frappe au clavier physique synchronise aussi le pavé', () => {
		const champ = document.querySelector<HTMLInputElement>('.ans-signe')!;
		champ.value = '=';
		champ.dispatchEvent(new Event('input', { bubbles: true }));
		expect(bouton('=').getAttribute('aria-pressed')).toBe('true');
		champ.value = '';
		champ.dispatchEvent(new Event('input', { bubbles: true }));
		expect(bouton('=').getAttribute('aria-pressed')).toBe('false');
	});

	test('le tap ne déplace pas le focus vers le champ (pas de clavier virtuel)', () => {
		const b = bouton('<');
		b.focus();
		b.click();
		expect(document.activeElement).toBe(b);
	});
});
