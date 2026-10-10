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
