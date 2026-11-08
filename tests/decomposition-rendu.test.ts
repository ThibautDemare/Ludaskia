/* ============================================================
   Rendu des énoncés de DÉCOMPOSITION terme par terme (retour terrain, novembre 2026)
   et règle de la saisie groupée des grands nombres.

   Exigence d'écran : « 60 677 = 6 × 10 000 + … » ne doit jamais se couper AU MILIEU
   d'un terme (« + 6 × » en fin de ligne, « 10 000 » à la suivante). On ne teste pas le
   CSS ici, seulement la structure qui le permet : un bloc, le nombre cible à part, puis
   un élément par terme, chaque « + » dans le terme qu'il ouvre, le champ dans son terme.
   Le HTML est relu dans un vrai DOM (happy-dom), pas comparé en chaîne.
   ============================================================ */
import { describe, expect, it } from 'vitest';
import {
	createRenderContext,
	decompositionHTML,
	renderItem,
	saisieGroupee,
} from '../src/core/items';
import type { Item } from '../src/core/items';
import { brut } from '../src/core/html';
import { formatNombre } from '../src/core/nombres';
import { genLessonItem, getLessonById } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';

const CHAMP = brut('<input class="ans" id="champ-test">');

function relire(texte: string): HTMLElement {
	const rendu = decompositionHTML(texte, CHAMP);
	expect(rendu, `rendu attendu pour « ${texte} »`).not.toBeNull();
	const hote = document.createElement('div');
	hote.innerHTML = rendu!.balisage;
	return hote;
}
/* Texte d'un nœud sans aucun blanc (U+202F compris : `\s` couvre les espaces Unicode). */
const compact = (el: Element): string => (el.textContent ?? '').replace(/\s/g, '');

describe('decompositionHTML — sens « décomposer » (N = t1 + t2 + …)', () => {
	const texte = `${formatNombre(60677)} = 6 × ${formatNombre(10000)} + 0 × 1000 + @ × 100 + 7 × 10 + 7 × 1`;

	it('prémisse : l’énoncé porte bien des espaces fines dans les grands nombres', () => {
		expect(texte).toContain(String.fromCharCode(0x202f));
	});

	it('un seul bloc .decompo, le nombre cible dans .decompo-cible', () => {
		const hote = relire(texte);
		expect(hote.querySelectorAll('.decompo')).toHaveLength(1);
		expect(hote.querySelector('.decompo--composer')).toBeNull();
		const cible = hote.querySelector('.decompo-cible');
		expect(cible).not.toBeNull();
		// Le « = » peut appartenir à la cible ou non : seul le nombre est exigé.
		expect(compact(cible!).replace('=', '')).toBe('60677');
		expect(cible!.querySelector('input')).toBeNull();
	});

	it('un .decompo-terme par terme, le « + » DANS le terme qu’il ouvre, le champ dans le terme troué', () => {
		const hote = relire(texte);
		const termes = [...hote.querySelectorAll('.decompo-terme')];
		expect(termes.map(compact)).toEqual(['6×10000', '+0×1000', '+×100', '+7×10', '+7×1']);
		const champs = hote.querySelectorAll('#champ-test');
		expect(champs).toHaveLength(1);
		expect(champs[0].closest('.decompo-terme')).toBe(termes[2]);
		// Aucun terme n'est à cheval sur la cible.
		expect(hote.querySelector('.decompo-cible .decompo-terme')).toBeNull();
	});

	it('le @ est consommé : aucune autre occurrence dans le HTML', () => {
		expect(decompositionHTML(texte, CHAMP)!.balisage).not.toContain('@');
	});
});

describe('decompositionHTML — sens « composer » (t1 + t2 + … = @)', () => {
	const texte = '3 × 1000 + 5 × 100 + 5 × 10 + 3 × 1 = @';

	it('.decompo--composer, sans cible ; le champ dans un dernier terme qui commence par « = »', () => {
		const hote = relire(texte);
		expect(hote.querySelectorAll('.decompo.decompo--composer')).toHaveLength(1);
		expect(hote.querySelector('.decompo-cible')).toBeNull();
		const termes = [...hote.querySelectorAll('.decompo-terme')];
		expect(termes.map(compact)).toEqual(['3×1000', '+5×100', '+5×10', '+3×1', '=']);
		const champs = hote.querySelectorAll('#champ-test');
		expect(champs).toHaveLength(1);
		expect(champs[0].closest('.decompo-terme')).toBe(termes[termes.length - 1]);
		expect(decompositionHTML(texte, CHAMP)!.balisage).not.toContain('@');
	});

	it('avec de grands nombres groupés dans les termes, le découpage reste juste', () => {
		const texte = `4 × ${formatNombre(100000)} + 8 × ${formatNombre(10000)} + 2 × 100 = @`;
		const termes = [...relire(texte).querySelectorAll('.decompo-terme')].map(compact);
		expect(termes).toEqual(['4×100000', '+8×10000', '+2×100', '=']);
	});
});

describe('decompositionHTML — énoncé hors forme : null (l’appelant garde le rendu d’un bloc)', () => {
	it.each([
		['aucun « = »', '6 × 1000 + @ × 100'],
		['deux « = »', '305 = 3 × 100 + @ × 1 = 305'],
		['champ absent', '305 = 3 × 100 + 0 × 10 + 5 × 1'],
		['champ dans le nombre cible', '@ = 3 × 100 + 0 × 10 + 5 × 1'],
		['champ dans le nombre cible, au milieu', '3@5 = 3 × 100 + 0 × 10 + 5 × 1'],
		// Le seul cas où « champ dans la cible » se distingue de « champ absent des termes ».
		['champ dans le nombre cible, même si un terme en porte un', '3@5 = 3 × 100 + @ × 10 + 5 × 1'],
	])('%s', (_cas, texte) => {
		expect(decompositionHTML(texte, CHAMP)).toBeNull();
	});
});

describe('decompositionHTML — échappement', () => {
	it('un « < » de l’énoncé n’injecte aucune balise, ni dans la cible ni dans un terme', () => {
		const texte = '<img src=x onerror=alert(1)> = 3 × 100 + <b>@</b> × 10';
		const hote = relire(texte);
		expect(hote.querySelector('img')).toBeNull();
		expect(hote.querySelector('b')).toBeNull();
		expect(hote.querySelector('.decompo-cible')!.textContent).toContain('<img');
		// Le champ, lui, est bien posé (c'est le seul HTML brut autorisé).
		expect(hote.querySelectorAll('#champ-test')).toHaveLength(1);
	});
});

describe('saisieGroupee — grand nombre (≥ 10 000) à saisir groupé', () => {
	const item = (answer: Item['answer'], kind: Item['kind']): Item => ({ text: '@', answer, kind });

	it.each([
		['10000 (borne basse incluse)', 10000],
		['1400000', '1400000'],
		['« 12345,67 » (virgule décimale)', '12345,67'],
	] as const)('vrai pour une réponse numérique %s', (_cas, answer) => {
		expect(saisieGroupee(item(answer, 'num'))).toBe(true);
	});

	it.each([
		['9999 (juste sous la borne)', 9999],
		['« 9999,99 » (décimal juste sous la borne)', '9999,99'],
	] as const)('faux pour %s', (_cas, answer) => {
		expect(saisieGroupee(item(answer, 'num'))).toBe(false);
	});

	it.each(['text', 'heure'] as const)(
		'faux pour un champ %s, même si la réponse est grande',
		(kind) => {
			expect(saisieGroupee(item(10000, kind))).toBe(false);
		},
	);
});

/* Rendu PAPIER (fiche imprimée) et CORRIGÉ d'un vrai item de la leçon : le rendu terme par
   terme doit tenir aussi hors écran, avec un champ (imprimé souligné par le CSS print) ou
   la réponse écrite, toujours dans le terme troué. Items tirés sous graine. */
describe('renderItem — décomposition imprimée et corrigée', () => {
	const lecon = getLessonById('num-decompose-multiplicative')!;
	const tirage = withSeed(20261108, () =>
		Array.from({ length: 200 }, () => genLessonItem(lecon, 'cm1')),
	);
	const estComposer = (it: Item) => it.text.trim().endsWith('= @');
	const decomposer = tirage.find((it) => !estComposer(it))!;
	const composer = tirage.find(estComposer)!;

	/* Attendus recalculés depuis l'énoncé : rang du trou et réponse. */
	function attendu(it: Item): { indexTrou: number; reponse: string } {
		const [gauche, droite] = it.text.split(' = ');
		if (droite.trim() === '@') {
			const somme = gauche
				.split(' + ')
				.map((t) => t.replace(/\s/g, '').split('×').map(Number))
				.reduce((s, [d, v]) => s + d * v, 0);
			return { indexTrou: gauche.split(' + ').length, reponse: String(somme) };
		}
		const nombre = Number(gauche.replace(/\s/g, ''));
		const termes = droite.split(' + ');
		const indexTrou = termes.findIndex((t) => t.includes('@'));
		const valeur = Number(termes[indexTrou].replace(/\s/g, '').split('×')[1]);
		return { indexTrou, reponse: String(Math.floor(nombre / valeur) % 10) };
	}

	function rendre(it: Item, corrige: boolean): { hote: HTMLElement; balisage: string } {
		const ctx = createRenderContext({ printMode: true, corrigeMode: corrige });
		const balisage = renderItem(it, ctx).balisage;
		const hote = document.createElement('div');
		hote.innerHTML = balisage;
		return { hote, balisage };
	}

	it('prémisse : l’échantillon contient les deux sens, avec le drapeau', () => {
		expect(decomposer?.decomposition).toBe(true);
		expect(composer?.decomposition).toBe(true);
	});

	it.each([
		['décomposer', () => decomposer],
		['composer', () => composer],
	])(
		'impression, sens « %s » : bloc .decompo, un champ dans le terme troué, aucun @',
		(_s, item) => {
			const it = item();
			const { hote, balisage } = rendre(it, false);
			expect(hote.querySelectorAll('.decompo')).toHaveLength(1);
			const champs = hote.querySelectorAll('input.ans');
			expect(champs).toHaveLength(1);
			const termes = [...hote.querySelectorAll('.decompo-terme')];
			expect(champs[0].closest('.decompo-terme')).toBe(termes[attendu(it).indexTrou]);
			expect(balisage).not.toContain('@');
		},
	);

	it.each([
		['décomposer', () => decomposer],
		['composer', () => composer],
	])(
		'corrigé, sens « %s » : la réponse écrite dans le terme troué, aucun champ, aucun @',
		(_s, item) => {
			const it = item();
			const { hote, balisage } = rendre(it, true);
			expect(hote.querySelectorAll('.decompo')).toHaveLength(1);
			expect(hote.querySelector('input')).toBeNull();
			const corriges = hote.querySelectorAll('.ans-corrige');
			expect(corriges).toHaveLength(1);
			const { indexTrou, reponse } = attendu(it);
			expect(corriges[0].closest('.decompo-terme')).toBe(
				[...hote.querySelectorAll('.decompo-terme')][indexTrou],
			);
			expect((corriges[0].textContent ?? '').replace(/\s/g, '')).toBe(reponse);
			expect(balisage).not.toContain('@');
		},
	);
});
