/* ============================================================
   QCM de fiche — câblage côté session (#734), en happy-dom.

   `qcmChoixHTML` rend des boutons radio et un champ `.ans` CACHÉ. Ce fichier tient ce que
   `ui/session.ts` doit faire de ce couple pour que le QCM se joue comme un champ ordinaire :
   - cocher un choix COPIE sa valeur dans le champ caché du MÊME groupe, et relance un
     événement `input` sur ce champ (qui efface l'ancien marquage, comme une frappe) ;
   - la marque ✓/✗ d'un champ caché est rattachée au GROUPE (`aria-describedby`), sans quoi
     un lecteur d'écran ne l'entendrait jamais ; la réponse révélée est le LIBELLÉ du choix ;
   - un champ caché n'est jamais une « saisie illisible » : l'enfant n'a rien tapé.

   Le rendu et la correction (pure) sont dans `qcm-fiche.test.ts`.
   ============================================================ */
import { beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { initSession, marquerChamps, champsIllisibles } from '../src/ui/session';
import { renderItem, createRenderContext, type Item, type RenderContext } from '../src/core/items';
import { brut } from '../src/core/html';
import { fractionChoiceViews } from '../src/core/fraction-text';
import { getAllLessons } from '../src/core/catalog';
import { buildLessonFiche } from '../src/core/build';
import { withSeed } from '../src/core/utils';

const QCM_SIMPLE: Item = {
	text: 'Que fait cette phrase ? Où vas-tu ?',
	answer: 'Poser une question',
	choices: ['Raconter ou dire', 'Poser une question', 'Donner un ordre'],
	kind: 'text',
};

const QCM_RICHE: Item = {
	text: 'Quelle fraction est coloriée ?',
	answer: '3/4',
	choices: ['1/4', '2/4', '3/4'],
	choicesView: [
		{ html: brut('<span class="frac">1/4</span>'), label: 'un quart' },
		{ html: brut('<span class="frac">2/4</span>'), label: 'deux quarts' },
		{ html: brut('<span class="frac">3/4</span>'), label: 'trois quarts' },
	],
	kind: 'text',
};

/** Monte une fiche dans `#sheets` et rend, pour chaque item, son champ, son groupe de
 *  choix (s'il y en a un), ses radios et sa marque. */
function monter(items: Item[]) {
	const ctx: RenderContext = createRenderContext();
	const balisage = items.map((it) => `<div class="op">${renderItem(it, ctx).balisage}</div>`);
	document.body.innerHTML = `<div id="sheets">${balisage.join('')}</div>`;
	const champs = [...document.querySelectorAll<HTMLInputElement>('#sheets input.ans')];
	return {
		ctx,
		champs,
		parItem: champs.map((champ) => {
			const groupe = document.querySelector<HTMLFieldSetElement>(
				`fieldset.fiche-choix[data-for="${champ.id}"]`,
			);
			return {
				champ,
				groupe,
				radios: [...(groupe?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])],
				marque: document.querySelector<HTMLElement>(`.mark[data-for="${champ.id}"]`)!,
			};
		}),
	};
}

function cocher(radio: HTMLInputElement): void {
	radio.checked = true;
	radio.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Élément désigné par l'`aria-describedby` d'un élément (null si aucun). */
function decrit(el: Element | null): HTMLElement | null {
	const id = el?.getAttribute('aria-describedby');
	return id ? document.getElementById(id) : null;
}

beforeAll(() => {
	// Écouteurs délégués posés une fois, comme `main.ts` le fait au démarrage.
	initSession();
});

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('initSession — cocher un choix alimente le champ caché', () => {
	it('la valeur du choix coché devient celle du champ caché ; un autre choix la remplace', () => {
		const { parItem } = monter([QCM_SIMPLE]);
		const { champ, radios } = parItem[0];
		cocher(radios[2]);
		expect(champ.value).toBe('Donner un ordre');
		cocher(radios[1]);
		expect(champ.value).toBe('Poser une question');
	});

	it('vue riche : c’est la VALEUR (« 3/4 ») qui est copiée, celle que la correction compare', () => {
		const { parItem } = monter([QCM_RICHE]);
		cocher(parItem[0].radios[2]);
		expect(parItem[0].champ.value).toBe('3/4');
	});

	it('un événement `input` (qui remonte) est relancé sur le champ caché', () => {
		const { parItem } = monter([QCM_SIMPLE]);
		const recus: { cible: EventTarget | null; remonte: boolean }[] = [];
		parItem[0].champ.addEventListener('input', (e) =>
			recus.push({ cible: e.target, remonte: e.bubbles }),
		);
		cocher(parItem[0].radios[0]);
		expect(recus).toEqual([{ cible: parItem[0].champ, remonte: true }]);
	});

	it('deux QCM : cocher dans le second ne touche pas le champ du premier', () => {
		const { parItem } = monter([QCM_SIMPLE, QCM_RICHE]);
		cocher(parItem[1].radios[0]);
		expect(parItem[1].champ.value).toBe('1/4');
		expect(parItem[0].champ.value).toBe('');
	});

	it('un radio hors d’un groupe de fiche est ignoré (aucun champ de fiche modifié)', () => {
		const { parItem } = monter([QCM_SIMPLE]);
		const autre = document.createElement('input');
		autre.type = 'radio';
		autre.name = 'theme';
		autre.value = 'sombre';
		// Même identifiant de groupe que le QCM, mais hors `fieldset.fiche-choix` : un radio
		// de réglage ne doit pas écrire dans une fiche.
		const boite = document.createElement('fieldset');
		boite.dataset.for = parItem[0].champ.id;
		boite.appendChild(autre);
		document.body.appendChild(boite);
		cocher(autre);
		expect(parItem[0].champ.value).toBe('');
	});

	it('changer de choix après correction efface le marquage ET le rattachement au groupe', () => {
		const { parItem, ctx } = monter([QCM_SIMPLE]);
		const { champ, groupe, radios, marque } = parItem[0];
		cocher(radios[0]); // « Raconter ou dire » : faux
		marquerChamps([champ], { [champ.id]: 'wrong' }, ctx.items);
		// Préalable : la correction est bien posée, sinon le test ne prouverait rien.
		expect(marque.textContent).toContain('✗');
		expect(decrit(groupe)).toBe(marque);

		cocher(radios[1]);
		expect(champ.value).toBe('Poser une question');
		expect(groupe?.hasAttribute('aria-describedby')).toBe(false);
		expect(marque.textContent).toBe('');
		expect(champ.classList.contains('wrong')).toBe(false);
		expect(champ.hasAttribute('aria-invalid')).toBe(false);
	});
});

describe('marquerChamps — la marque d’un champ caché est rattachée à son groupe de choix', () => {
	it('faux, vue riche : ✗ et le LIBELLÉ attendu (« trois quarts »), décrivant le groupe', () => {
		const { parItem, ctx } = monter([QCM_RICHE]);
		const { champ, groupe, radios, marque } = parItem[0];
		cocher(radios[0]);
		marquerChamps([champ], { [champ.id]: 'wrong' }, ctx.items);
		expect(marque.textContent).toContain('✗');
		expect(marque.textContent).toContain('trois quarts');
		expect(marque.textContent).not.toContain('3/4');
		expect(decrit(groupe)).toBe(marque);
	});

	it('faux, choix simple : la réponse attendue est révélée, décrivant le groupe', () => {
		const { parItem, ctx } = monter([QCM_SIMPLE]);
		const { champ, groupe, radios, marque } = parItem[0];
		cocher(radios[2]);
		marquerChamps([champ], { [champ.id]: 'wrong' }, ctx.items);
		expect(marque.textContent).toContain('Poser une question');
		expect(decrit(groupe)).toBe(marque);
	});

	it('juste : ✓, décrivant le groupe', () => {
		const { parItem, ctx } = monter([QCM_SIMPLE]);
		const { champ, groupe, radios, marque } = parItem[0];
		cocher(radios[1]);
		marquerChamps([champ], { [champ.id]: 'correct' }, ctx.items);
		expect(marque.textContent).toContain('✓');
		expect(decrit(groupe)).toBe(marque);
	});

	it('re-correction à vide après une erreur : le groupe ne pointe plus vers une marque vidée', () => {
		const { parItem, ctx } = monter([QCM_SIMPLE]);
		const { champ, groupe, radios } = parItem[0];
		cocher(radios[0]);
		marquerChamps([champ], { [champ.id]: 'wrong' }, ctx.items);
		expect(groupe?.hasAttribute('aria-describedby')).toBe(true); // préalable
		marquerChamps([champ], { [champ.id]: 'empty' }, ctx.items);
		expect(groupe?.hasAttribute('aria-describedby')).toBe(false);
	});

	it('deux QCM : chaque groupe est décrit par SA marque', () => {
		const { parItem, ctx, champs } = monter([QCM_SIMPLE, QCM_RICHE]);
		cocher(parItem[0].radios[0]);
		cocher(parItem[1].radios[2]);
		marquerChamps(champs, { [champs[0].id]: 'wrong', [champs[1].id]: 'correct' }, ctx.items);
		expect(decrit(parItem[0].groupe)).toBe(parItem[0].marque);
		expect(decrit(parItem[1].groupe)).toBe(parItem[1].marque);
	});
});

describe('champsIllisibles — un champ caché n’est jamais une saisie illisible', () => {
	it('QCM d’un item NUMÉRIQUE dont le choix coché n’est pas un nombre : non signalé ; le champ tapé « 3- » l’est', () => {
		const qcmNum: Item = {
			text: 'Combien de côtés a un carré ?',
			answer: 4,
			choices: ['3', '4', 'aucun'],
			kind: 'num',
		};
		const calcul: Item = { text: '45 + @ = 57', answer: 12, kind: 'num' };
		const { parItem, ctx, champs } = monter([qcmNum, calcul]);
		cocher(parItem[0].radios[2]); // « aucun »
		expect(parItem[0].champ.value).toBe('aucun'); // préalable : le champ caché est rempli
		parItem[1].champ.value = '3-';
		expect(champsIllisibles(champs, ctx.items)).toEqual([parItem[1].champ]);
	});
});

/* ============================================================
   Le TROU rempli d'un QCM à trou se dit par le LIBELLÉ du choix (#777, relecture
   accessibilité R2). Écrit avant la correction : rouge à l'arrivée.

   Cocher un choix le recopie dans le trou (`afficherChoixAuTrou`) pour que la phrase se
   lise complète. Une vue RICHE (fraction empilée, terminaison surlignée) recopiée telle
   quelle se lit en morceaux (« 3 4 ») : la décision veut la copie visuelle `aria-hidden`,
   et un `.sr-only` DANS le trou qui porte le libellé lisible — l'`aria-label` du bouton
   coché (« trois quarts »). Un choix simple, lui, se lit tel quel, une seule fois.
   ============================================================ */

/** Texte que lit un lecteur d'écran : sans les sous-arbres `aria-hidden`, et le nom d'une
    image (`role="img"` + `aria-label`) à la place de son contenu. */
function texteAccessible(n: Node): string {
	if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
	if (!(n instanceof Element) || n.getAttribute('aria-hidden') === 'true') return '';
	const nom = n.getAttribute('aria-label');
	if (n.getAttribute('role') === 'img' && nom !== null) return ` ${nom} `;
	return [...n.childNodes].map(texteAccessible).join(' ');
}
const lu = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Cocher comme un navigateur : les autres boutons du même groupe se décochent (happy-dom ne
    le fait pas hors d'un formulaire, et le trou lit le bouton `:checked`). */
function choisir(radio: HTMLInputElement): void {
	for (const r of document.querySelectorAll<HTMLInputElement>(
		`input[type="radio"][name="${radio.name}"]`,
	))
		r.checked = false;
	cocher(radio);
}

const trouDe = (champ: HTMLInputElement): HTMLElement =>
	document.querySelector<HTMLElement>(`.fiche-trou[data-for="${champ.id}"]`)!;

/** Défauts du trou après qu'on a coché `radio` : copie visuelle `aria-hidden`, libellé du
    choix en `.sr-only`, et rien d'autre à entendre. */
function defautsTrouRiche(trou: HTMLElement, radio: HTMLInputElement): string[] {
	const d: string[] = [];
	const libelle = radio.getAttribute('aria-label') ?? '';
	const vue = radio.closest('label')?.querySelector('.fiche-choix-vue')?.innerHTML ?? '';
	const caches = [...trou.querySelectorAll('[aria-hidden="true"]')];
	if (!caches.some((c) => c.innerHTML === vue)) d.push('copie visuelle absente ou non aria-hidden');
	const srOnly = [...trou.querySelectorAll('.sr-only')].map((e) => lu(e.textContent ?? ''));
	if (!srOnly.includes(libelle))
		d.push(`pas de .sr-only « ${libelle} » (vus : ${JSON.stringify(srOnly)})`);
	const entendu = lu(texteAccessible(trou));
	if (entendu !== libelle) d.push(`le trou se lit « ${entendu} » au lieu de « ${libelle} »`);
	return d;
}

const TROU_FRACTION: Item = {
	text: 'Léa a mangé @ du gâteau.',
	answer: '3/4',
	choices: ['1/4', '2/4', '3/4'],
	choicesView: fractionChoiceViews(['1/4', '2/4', '3/4']),
	kind: 'text',
};
/** Fraction empilée SANS nom d'image : sa copie brute se lit « 3 4 ». */
const TROU_EMPILE: Item = {
	...TROU_FRACTION,
	choicesView: [1, 2, 3].map((n) => ({
		html: brut(`<span class="frac"><span>${n}</span><span>4</span></span>`),
		label: ['un quart', 'deux quarts', 'trois quarts'][n - 1],
	})),
};
const TROU_SIMPLE: Item = {
	text: 'Le chat @ mangé.',
	answer: 'a',
	choices: ['a', 'à'],
	kind: 'text',
};

describe('QCM à trou d’une fiche : le trou rempli se lit par le libellé du choix (R2)', () => {
	it('fraction : copie visuelle cachée, « trois quarts » en .sr-only dans le trou', () => {
		const { parItem } = monter([TROU_FRACTION]);
		const { champ, radios } = parItem[0];
		expect(radios[2].getAttribute('aria-label'), 'précondition').toBe('trois quarts');
		choisir(radios[2]);
		expect(defautsTrouRiche(trouDe(champ), radios[2])).toEqual([]);
	});

	it('fraction empilée sans nom d’image : jamais « 3 4 », toujours « trois quarts »', () => {
		const { parItem } = monter([TROU_EMPILE]);
		choisir(parItem[0].radios[2]);
		const entendu = lu(texteAccessible(trouDe(parItem[0].champ)));
		expect(entendu).not.toMatch(/\d\s*\d/);
		expect(defautsTrouRiche(trouDe(parItem[0].champ), parItem[0].radios[2])).toEqual([]);
	});

	it('changer de choix remplace le libellé : un seul, celui du nouveau choix', () => {
		const { parItem } = monter([TROU_FRACTION]);
		choisir(parItem[0].radios[2]);
		choisir(parItem[0].radios[0]);
		const trou = trouDe(parItem[0].champ);
		expect(defautsTrouRiche(trou, parItem[0].radios[0])).toEqual([]);
		expect(trou.querySelectorAll('.sr-only')).toHaveLength(1);
	});

	it('critère négatif : un choix SIMPLE se lit tel quel, une seule fois', () => {
		const { parItem } = monter([TROU_SIMPLE]);
		choisir(parItem[0].radios[1]);
		expect(lu(texteAccessible(trouDe(parItem[0].champ)))).toBe('à');
	});

	it('catalogue : chaque QCM à trou de fiche à vues riches, pour chacun de ses choix', () => {
		let vus = 0;
		const fautes: string[] = [];
		for (const l of getAllLessons())
			for (const niveau of l.levels) {
				const ctx = createRenderContext();
				document.body.innerHTML = `<div id="sheets">${withSeed(1, () => buildLessonFiche(l.id, niveau, ctx)).balisage}</div>`;
				for (const groupe of document.querySelectorAll<HTMLFieldSetElement>(
					'fieldset.fiche-choix',
				)) {
					const champ = document.getElementById(groupe.dataset.for ?? '');
					const it = ctx.items[champ?.id ?? ''];
					if (
						!(champ instanceof HTMLInputElement) ||
						!it?.text.includes('@') ||
						!it.choicesView?.length
					)
						continue;
					vus++;
					for (const radio of groupe.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
						choisir(radio);
						for (const d of defautsTrouRiche(trouDe(champ), radio))
							fautes.push(`${l.id} @${niveau} « ${it.text} » / ${radio.value} : ${d}`);
					}
				}
			}
		expect(vus, 'plancher : QCM à trou à vues riches dans les fiches').toBeGreaterThanOrEqual(5);
		expect(fautes.slice(0, 10)).toEqual([]);
	});

	it('témoins : defautsTrouRiche signale la copie brute, et pas un trou conforme', () => {
		document.body.innerHTML =
			'<label><input type="radio" aria-label="trois quarts"><span class="fiche-choix-vue"><span>3</span><span>4</span></span></label>' +
			'<span id="t1"><span>3</span><span>4</span></span>' +
			'<span id="t2"><span aria-hidden="true"><span>3</span><span>4</span></span><span class="sr-only">trois quarts</span></span>';
		const radio = document.querySelector<HTMLInputElement>('input')!;
		expect(defautsTrouRiche(document.getElementById('t1')!, radio)).toHaveLength(3);
		expect(defautsTrouRiche(document.getElementById('t2')!, radio)).toEqual([]);
	});
});
