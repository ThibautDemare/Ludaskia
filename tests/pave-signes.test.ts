/* ============================================================
   Pavé de signes « < = > » (#380) — rendu et comportement.

   Rendu (core/items.ts + core/signes.ts) : un item dont la réponse est un signe
   de comparaison reçoit un champ `.ans-signe` SANS clavier virtuel
   (inputmode="none") suivi d'un pavé de trois boutons ; les autres items et les
   modes impression/corrigé n'en reçoivent pas.
   Comportement (ui/pave-signes.ts) : le tap remplit le champ par le même chemin
   que la frappe (évènement `input`), l'état aria-pressed suit la valeur du
   champ, y compris tapée au clavier physique.
   Rappel de la réponse donnée (#503, `reponseLisible`) : un signe isolé est nommé
   dans « Tu as répondu … », toute autre saisie ressort telle quelle.
   ============================================================ */
import { describe, test, expect, beforeEach } from 'vitest';
import { renderItem, createRenderContext } from '../src/core/items';
import type { Item } from '../src/core/items';
import {
	estSigneComparaison,
	reponseLisible,
	signeView,
	SIGNES_COMPARAISON,
	type SigneComparaison,
} from '../src/core/signes';
import { installPaveSignes } from '../src/ui/pave-signes';

const itemSigne = (answer: string): Item => ({
	text: `Compare : 3 456 @ 3 465`,
	answer,
	kind: 'text',
});

/** Parse un markup en élément hôte (happy-dom). Les attributs s'y lisent DÉCODÉS, comme le
    fera le navigateur : c'est la valeur RÉELLE que `ui/pave-signes` recopiera dans le champ.
    Comparer les entités à la main verrouillerait la table d'échappement de `escapeHTML`
    (qui a déjà changé) au lieu du contenu, seul attendu qui compte ici. */
function parse(html: string): HTMLElement {
	const hote = document.createElement('div');
	hote.innerHTML = html;
	return hote;
}

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
		expect(html.balisage).toContain('ans-signe');
		expect(html.balisage).toContain('inputmode="none"');
		expect(html.balisage).toContain('class="pave-signes screen-only"');
		expect(html.balisage.match(/class="pave-signe"/g)).toHaveLength(3);
		// Ordre FIGÉ « < = > » (même ancrage spatial que les tuiles), lu sur les attributs
		// tels que le navigateur les reconstruit. `escapeHTML` échappe les cinq caractères de
		// markup : « < » et « > » sont tous deux sérialisés (`&lt;`, `&gt;`) et redonnent le
		// signe nu au parsing — c'est ce signe-là que le tap écrira dans le champ.
		const ordre = [...parse(html.balisage).querySelectorAll('button.pave-signe')].map((b) =>
			b.getAttribute('data-signe'),
		);
		expect(ordre).toEqual(['<', '=', '>']);
		// Libellés accessibles complets (registre CE2), boutons non pressés au rendu.
		expect(html.balisage).toContain('aria-label="plus petit que"');
		expect(html.balisage).toContain('aria-label="égal à"');
		expect(html.balisage).toContain('aria-label="plus grand que"');
		expect(html.balisage).not.toContain('aria-pressed="true"');
	});

	test('la réponse-signe part échappée dans data-answer (valeur décodée intacte)', () => {
		// `renderItem` posait ses `data-*` via un échappement PARTIEL (`&` et `"` seulement),
		// qui laissait passer un chevron NU en valeur d'attribut : toléré par le parseur HTML5,
		// mais non conforme et fatal à toute relecture XML (les figures sont du markup
		// sérialisé). Ce que lit le pipeline de correction ne change pas pour autant : c'est la
		// valeur DÉCODÉE, seul contrat qui compte pour `session.verify` et les specs e2e.
		const chevronNu = /="[^"]*[<>][^"]*"/;
		// Contre-épreuve du détecteur : il DOIT voir un chevron nu là où il y en a un.
		expect('<input class="ans" data-answer="<">').toMatch(chevronNu);
		for (const signe of SIGNES_COMPARAISON) {
			const html = renderItem(itemSigne(signe), createRenderContext());
			const champ = parse(html.balisage).querySelector('input.ans');
			expect(champ, signe).toBeTruthy();
			expect(champ!.getAttribute('data-answer'), signe).toBe(signe);
			// Le contenu de balise, lui, a parfaitement le droit de porter un chevron échappé.
			expect(html.balisage, signe).not.toMatch(chevronNu);
		}
	});

	test('les boutons du pavé sont rattachés au champ rendu (data-for = id)', () => {
		const ctx = createRenderContext();
		const html = renderItem(itemSigne('>'), ctx);
		const id = html.balisage.match(/<input[^>]*id="(a\d+)"/)?.[1];
		expect(id).toBeTruthy();
		// 3 boutons rattachés au champ (la marque ✓/✗ porte AUSSI un data-for : on ne
		// compte que ceux des boutons du pavé).
		expect(
			html.balisage.match(new RegExp(`class="pave-signe" data-for="${id}"`, 'g'))?.length,
		).toBe(3);
	});

	test('pas de pavé pour une réponse numérique ou un mot', () => {
		expect(
			renderItem({ text: '3 + 4 = @', answer: 7 }, createRenderContext()).balisage,
		).not.toContain('pave-signes');
		expect(
			renderItem({ text: 'Le félin : @', answer: 'chat', kind: 'text' }, createRenderContext())
				.balisage,
		).not.toContain('pave-signes');
	});

	test('pas de pavé à l’impression ni en corrigé', () => {
		const impr = renderItem(itemSigne('='), createRenderContext({ printMode: true }));
		expect(impr.balisage).not.toContain('pave-signes');
		const corrige = renderItem(
			itemSigne('='),
			createRenderContext({ printMode: true, corrigeMode: true }),
		);
		expect(corrige.balisage).not.toContain('pave-signes');
		expect(corrige.balisage).toContain('ans-corrige'); // la réponse est révélée, pas de champ
	});
});

describe('signeView (#380)', () => {
	test('glyphe échappé + mot-légende, libellé accessible complet', () => {
		const v = signeView('<');
		expect(v.html.balisage).toContain('&lt;');
		expect(v.html.balisage).toContain('petit');
		expect(v.label).toBe('plus petit que');
		expect(signeView('=').label).toBe('égal à');
		expect(signeView('>').label).toBe('plus grand que');
	});
});

describe('reponseLisible (#503) : la réponse donnée, lue dans « Tu as répondu … »', () => {
	/* Les trois signes du besoin, écrits ici et non énumérés depuis SIGNES_COMPARAISON : une
	   table source amputée d'un signe laisserait sinon la boucle verte sur ce qui reste. */
	const SIGNES: readonly SigneComparaison[] = ['<', '=', '>'];
	/** Forme nommée : le libellé du pavé (même source que ses boutons), puis le glyphe entre
	    parenthèses pour que l'enfant reconnaisse ce qu'il a tapé. */
	const nomme = (s: SigneComparaison) => `${signeView(s).label} (${s})`;

	test('chacun des trois signes est nommé, glyphe entre parenthèses', () => {
		for (const s of SIGNES) {
			const lue = reponseLisible(s);
			expect(lue, s).toBe(nomme(s));
			// « Nommé » veut dire des MOTS en plus du glyphe : un libellé vide ou réduit au
			// glyphe rendrait l'égalité ci-dessus vraie sans rien nommer.
			expect(lue.replace(s, ''), s).toMatch(/\p{L}{2,}/u);
		}
		// « < » et « > » ne doivent jamais se lire pareil.
		expect(new Set(SIGNES.map((s) => reponseLisible(s))).size).toBe(3);
	});

	test('un signe entouré d’espaces est nommé aussi, sans reporter les espaces', () => {
		// Décision : ces espaces ne sont pas la faute à montrer, la correction les ignore déjà
		// (`normalizeText` rogne avant de comparer). Les laisser bloquer la reconnaissance
		// rendrait le glyphe nu, le défaut même que la fonction corrige ; les reporter autour du
		// libellé mettrait un blanc double dans « Tu as répondu … . ». Le sprint passe la saisie
		// SANS la rogner : le cas est atteignable.
		const cas: [string, SigneComparaison][] = [
			[' < ', '<'],
			['<  ', '<'],
			['\t>', '>'],
			['  =', '='],
		];
		for (const [saisie, s] of cas)
			expect(reponseLisible(saisie), JSON.stringify(saisie)).toBe(nomme(s));
	});

	test('deux signes, ou un signe accolé à autre chose : rendu tel quel', () => {
		// Pas un signe ISOLÉ : nommer le premier signe trouvé cacherait la saisie réelle.
		for (const v of ['<<', '<=', '>=', '==', '=<', '< >', '3<4', '<3', '12 >', 'x='])
			expect(reponseLisible(v), v).toBe(v);
	});

	test('signes Unicode voisins : rendus tels quels, jamais repliés sur < = >', () => {
		// Piège : « ≠ ≮ ≯ » se DÉCOMPOSENT (NFD) en « = < > » + barre combinante U+0338, qu'un
		// repli de diacritiques (celui de la recherche, `utils.ts`) retire, ce qui donnerait le
		// signe CONTRAIRE. Les formes pleine chasse « ＜ ＝ ＞ » deviennent « < = > » sous NFKC.
		// Dans les deux cas, l'enfant lirait la bonne réponse dans le rappel de son erreur.
		for (const v of ['≤', '≥', '≠', '≮', '≯', '＜', '＝', '＞'])
			expect(reponseLisible(v), v).toBe(v);
	});

	test('toute autre réponse ressort à l’identique : la faute de frappe reste visible', () => {
		const saisies = [
			'12',
			'122', // chiffre doublé
			'1002050', // pas de regroupement des milliers
			'3.5', // pas de virgule substituée
			'3,50', // pas de zéro final retiré
			'007', // pas de zéro de tête retiré
			'3 4', // espace parasite au milieu
			' 12', // … ou autour : rien n'est rogné hors signe
			'12 ',
			'chat',
			'Chat', // casse conservée
			'ecole', // accent manquant conservé
			'',
			'   ',
		];
		for (const v of saisies) expect(reponseLisible(v), JSON.stringify(v)).toBe(v);
	});

	test('du balisage ou une entité ressortent bruts : ni échappés ni décodés', () => {
		// L'échappement revient au gabarit `html` des appelants : échapper ici le doublerait
		// (l'enfant lirait « &lt;b&gt; »). Décoder « &lt; » en ferait un signe, aussitôt nommé.
		for (const v of ['<b>x</b>', '&lt;', '&amp;']) expect(reponseLisible(v), v).toBe(v);
	});
});

describe('comportement du pavé (ui/pave-signes.ts)', () => {
	beforeEach(() => {
		document.body.innerHTML = `<div id="sheets">${renderItem(itemSigne('<'), createRenderContext()).balisage}</div>`;
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
