/* ============================================================
   Générateurs de DÉCOMPOSITION (src/data/maths/position.ts), retour terrain de
   novembre 2026 :
   - la décomposition multiplicative (CM1) tirait encore des millions : elle porte
     désormais sur des nombres de 4 à 6 chiffres (cible 40 / 35 / 25 %) ;
   - toutes les décompositions portent le drapeau `decomposition` jusqu'à l'`Item`, pour
     être rendues terme par terme — et leurs énoncés doivent avoir la forme que ce rendu
     sait lire, sans quoi le drapeau ne sert à rien.

   Les attendus sont recalculés depuis l'énoncé (valeur de position : le chiffre du rang
   `v` de N vaut ⌊N / v⌋ mod 10), jamais repris du générateur. Tirages sous graine
   (`withSeed`) : reproductibles, donc aucun aléa dans le verdict.
   ============================================================ */
import { describe, expect, it } from 'vitest';
import { genLessonItem, getLessonById } from '../src/core/catalog';
import type { SchoolLevel } from '../src/core/catalog';
import { decompositionHTML } from '../src/core/items';
import type { Item } from '../src/core/items';
import { brut } from '../src/core/html';
import { withSeed } from '../src/core/utils';

const TIRAGES = 6000;
const GRAINE = 20261108;

function tirer(id: string, niveau: SchoolLevel, n = TIRAGES, graine = GRAINE): Item[] {
	const lecon = getLessonById(id);
	expect(lecon, `leçon ${id} absente du catalogue`).toBeDefined();
	return withSeed(graine, () => Array.from({ length: n }, () => genLessonItem(lecon!, niveau)));
}

const sansBlancs = (s: string): string => s.replace(/\s/g, '');
const chiffreDuRang = (n: number, valeur: number): number => Math.floor(n / valeur) % 10;
const estPuissanceDeDix = (v: number): boolean => /^10*$/.test(String(v));

interface Terme {
	chiffre: number | '@';
	valeur: number;
}
interface Decomposition {
	sens: 'decomposer' | 'composer';
	/** Le nombre en jeu : celui qu'on décompose, ou la réponse en sens « composer ». */
	nombre: number;
	termes: Terme[];
}

/* Lit un énoncé multiplicatif « N = d × v + … » ou « d × v + … = @ ». Toute forme
   inattendue fait échouer le test qui l'appelle, avec l'énoncé fautif. */
function lireMultiplicative(it: Item): Decomposition {
	const cotes = it.text.split('=');
	expect(cotes, `un seul « = » : ${it.text}`).toHaveLength(2);
	const [gauche, droite] = cotes.map((c) => c.trim());
	const lireTermes = (somme: string): Terme[] =>
		somme.split('+').map((t) => {
			const m = sansBlancs(t).match(/^(\d|@)×(\d+)$/);
			expect(m, `terme « chiffre × valeur » attendu, lu « ${t} » dans : ${it.text}`).not.toBeNull();
			return { chiffre: m![1] === '@' ? '@' : Number(m![1]), valeur: Number(m![2]) };
		});
	if (droite === '@')
		return { sens: 'composer', nombre: Number(it.answer), termes: lireTermes(gauche) };
	const nombre = Number(sansBlancs(gauche));
	expect(Number.isInteger(nombre), `nombre à décomposer illisible : ${it.text}`).toBe(true);
	return { sens: 'decomposer', nombre, termes: lireTermes(droite) };
}

const nbChiffres = (n: number): number => String(Math.abs(n)).length;

describe('Décomposition multiplicative (CM1) — plage et justesse', () => {
	const items = tirer('num-decompose-multiplicative', 'cm1');
	const lus = items.map((it) => ({ it, d: lireMultiplicative(it) }));

	it('les deux sens apparaissent dans l’échantillon (sinon une moitié ne serait pas éprouvée)', () => {
		expect(lus.some(({ d }) => d.sens === 'decomposer')).toBe(true);
		expect(lus.some(({ d }) => d.sens === 'composer')).toBe(true);
	});

	it('le nombre en jeu a toujours 4 à 6 chiffres, jamais 7', () => {
		const horsPlage = lus.filter(({ d }) => nbChiffres(d.nombre) < 4 || nbChiffres(d.nombre) > 6);
		expect(
			horsPlage.map(({ it }) => it.text).slice(0, 5),
			`${horsPlage.length} item(s) hors 4-6 chiffres`,
		).toEqual([]);
	});

	it('les trois tailles apparaissent : 4 chiffres le plus fréquent, 6 le moins (cible 40/35/25 %)', () => {
		const part = (k: number) =>
			lus.filter(({ d }) => nbChiffres(d.nombre) === k).length / lus.length;
		const [p4, p5, p6] = [part(4), part(5), part(6)];
		const resume = `4 : ${p4.toFixed(3)}, 5 : ${p5.toFixed(3)}, 6 : ${p6.toFixed(3)}`;
		expect(p4, resume).toBeGreaterThan(p5);
		expect(p5, resume).toBeGreaterThan(p6);
		// Fourchettes larges (± 10 points autour de la cible) : on garde l'ordre de grandeur,
		// pas un réglage au point près.
		expect(p4, resume).toBeGreaterThanOrEqual(0.3);
		expect(p4, resume).toBeLessThanOrEqual(0.5);
		expect(p5, resume).toBeGreaterThanOrEqual(0.25);
		expect(p5, resume).toBeLessThanOrEqual(0.45);
		expect(p6, resume).toBeGreaterThanOrEqual(0.15);
		expect(p6, resume).toBeLessThanOrEqual(0.35);
	});

	it('sens « décomposer » : la réponse est le chiffre du rang troué, chaque terme visible est juste', () => {
		for (const { it, d } of lus.filter(({ d }) => d.sens === 'decomposer')) {
			const trous = d.termes.filter((t) => t.chiffre === '@');
			expect(trous, `un seul trou : ${it.text}`).toHaveLength(1);
			for (const t of d.termes) {
				expect(estPuissanceDeDix(t.valeur), `valeur de rang : ${it.text}`).toBe(true);
				const attendu = chiffreDuRang(d.nombre, t.valeur);
				if (t.chiffre === '@') expect(Number(it.answer), `réponse de : ${it.text}`).toBe(attendu);
				else expect(t.chiffre, `terme ${t.chiffre} × ${t.valeur} de : ${it.text}`).toBe(attendu);
			}
			// La décomposition complétée redonne le nombre (aucun rang non nul oublié).
			const somme = d.termes.reduce(
				(s, t) => s + (t.chiffre === '@' ? Number(it.answer) : t.chiffre) * t.valeur,
				0,
			);
			expect(somme, `somme des termes de : ${it.text}`).toBe(d.nombre);
		}
	});

	it('sens « composer » : la réponse est la somme des produits affichés', () => {
		for (const { it, d } of lus.filter(({ d }) => d.sens === 'composer')) {
			expect(
				d.termes.some((t) => t.chiffre === '@'),
				`pas de trou à gauche : ${it.text}`,
			).toBe(false);
			const somme = d.termes.reduce((s, t) => s + (t.chiffre as number) * t.valeur, 0);
			expect(Number(it.answer), it.text).toBe(somme);
		}
	});
});

describe('Drapeau `decomposition` jusqu’à l’Item, et énoncé lisible par le rendu terme par terme', () => {
	const CHAMP = brut('<input class="ans" id="champ-test">');
	const CAS: Array<[string, SchoolLevel]> = [
		['num-decompose-multiplicative', 'cm1'],
		['num-decompose-10000', 'ce2'],
		['num-decompose-10000', 'cm1'],
		['num-decompose-1000', 'ce2'],
		['num-decompose-100', 'ce2'],
	];

	it.each(CAS)('%s (%s) : chaque item porte decomposition: true', (id, niveau) => {
		const sans = tirer(id, niveau, 2000).filter((it) => it.decomposition !== true);
		expect(sans.map((it) => it.text).slice(0, 5), `${sans.length} item(s) sans le drapeau`).toEqual(
			[],
		);
	});

	it.each(CAS)(
		'%s (%s) : chaque énoncé est rendu terme par terme (jamais le repli d’un bloc)',
		(id, niveau) => {
			const refuses = tirer(id, niveau, 2000).filter((it) => {
				const rendu = decompositionHTML(it.text, CHAMP);
				return rendu === null || rendu.balisage.split('champ-test').length !== 2;
			});
			expect(
				refuses.map((it) => it.text).slice(0, 5),
				`${refuses.length} énoncé(s) refusé(s)`,
			).toEqual([]);
		},
	);
});
