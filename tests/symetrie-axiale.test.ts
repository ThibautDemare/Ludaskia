/* ============================================================
   Symétrie axiale (#201) — logique de génération (src/data/maths/symetrie-axiale)
   et exactitude du rendu (src/core/figures : renderSymMiroir / renderSymImage).
   On tire beaucoup de questions et on vérifie les invariants CE2 : toujours un
   QCM à figure, réponse parmi les choix, les trois formats présents, le format
   reflet en figures-choix cliquables, et SURTOUT que le « reflet » est le miroir
   EXACT du motif (pixel-perfect). Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { SYMETRIE_LESSONS, axeEstDeSymetrie } from '../src/data/maths/symetrie-axiale';
import { renderSymImage, renderSymJuger } from '../src/core/figures';
import type { SymMotif } from '../src/core/figures';

const type = SYMETRIE_LESSONS[0].exerciseType;
const TIRAGES = 600;
const draws = Array.from({ length: TIRAGES }, () => type.generate({ mode: 'qcm' }));

/** Liste des points de chaque <polygon> d'un fragment SVG. */
function polygones(svg: string): number[][][] {
	const out: number[][][] = [];
	const re = /<polygon points="([^"]+)"/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(svg)) !== null) {
		out.push(m[1].split(' ').map((p) => p.split(',').map(Number)));
	}
	return out;
}

describe('symétrie axiale — invariants de génération', () => {
	it('toujours un QCM à figure SVG, réponse parmi les choix, explication + lecture', () => {
		for (const ex of draws) {
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.figure ?? '').toContain('<svg');
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choices.length).toBeGreaterThanOrEqual(2);
			expect((ex.explication ?? '').length).toBeGreaterThan(0);
			expect((ex.parle ?? '').length).toBeGreaterThan(0);
		}
	});

	it('check() valide la bonne réponse et rejette les autres choix', () => {
		for (const ex of draws.slice(0, 200)) {
			if (ex.type !== 'qcm') continue;
			expect(type.check(ex, ex.answer)).toBe(true);
			for (const c of ex.choices) {
				if (c !== ex.answer) expect(type.check(ex, c)).toBe(false);
			}
		}
	});

	it('les trois formats apparaissent (amorce, axe, reflet)', () => {
		const ouiNon = draws.filter((d) => d.type === 'qcm' && d.choices.join('') === 'OuiNon');
		const reflet = draws.filter((d) => d.type === 'qcm' && !!d.choicesView);
		expect(reflet.length).toBeGreaterThan(0);
		const enonces = new Set(ouiNon.map((d) => (d.type === 'qcm' ? d.question : '')));
		expect(enonces.has('Cette figure a-t-elle un axe de symétrie ?')).toBe(true);
		expect(enonces.has('Le trait en pointillé est-il un axe de symétrie ?')).toBe(true);
	});

	it('le format reflet propose trois FIGURES-choix cliquables + une figure « miroir »', () => {
		const reflet = draws.find((d) => d.type === 'qcm' && !!d.choicesView);
		expect(reflet).toBeTruthy();
		if (reflet && reflet.type === 'qcm' && reflet.choicesView) {
			// La question montre le miroir ; chaque choix est une image SVG avec libellé parlé.
			expect(reflet.figure).toContain('figure-symetrie-miroir');
			expect(reflet.choicesView).toHaveLength(reflet.choices.length);
			expect(reflet.choicesView).toHaveLength(3);
			for (const v of reflet.choicesView) {
				expect(v.html).toContain('figure-symetrie-image');
				expect(v.label.length).toBeGreaterThan(0);
			}
		}
	});
});

describe('symétrie axiale — reflet pixel-perfect', () => {
	const CW = 160; // côté de la scène (axe au centre)
	// Chaque scène-choix contient DEUX polygones : [0] = figure de départ (identique
	// partout), [1] = image transformée. Le reflet doit être le miroir EXACT du départ.
	it('axe vertical : le reflet est le miroir EXACT de la figure (x → CW - x, y inchangé)', () => {
		const [base, img] = polygones(renderSymImage('drapeau', 'v', 'reflet'));
		expect(base.length).toBe(img.length);
		for (let i = 0; i < base.length; i++) {
			expect(base[i][0] + img[i][0]).toBeCloseTo(CW, 1); // somme des x = axe doublé
			expect(img[i][1]).toBeCloseTo(base[i][1], 5); // y identique
		}
	});

	it('axe horizontal : le reflet est le miroir EXACT de la figure (y → CW - y, x inchangé)', () => {
		const [base, img] = polygones(renderSymImage('botte', 'h', 'reflet'));
		for (let i = 0; i < base.length; i++) {
			expect(img[i][0]).toBeCloseTo(base[i][0], 5);
			expect(base[i][1] + img[i][1]).toBeCloseTo(CW, 1);
		}
	});

	it('les trois images (reflet/glissé/tourné) sont distinctes, pour chaque motif et chaque axe', () => {
		// #286 : les 5 motifs chiraux (aucun axe ni symétrie de demi-tour) → reflet,
		// glissé et tourné donnent bien trois images distinctes (sinon question ambiguë).
		const motifs: SymMotif[] = ['drapeau', 'botte', 'lettreF', 'poisson', 'chaussure'];
		for (const motif of motifs) {
			for (const axis of ['v', 'h'] as const) {
				// poly[1] = l'image transformée (poly[0] = figure de départ, identique partout).
				const img = (t: 'reflet' | 'glisse' | 'tourne') =>
					JSON.stringify(polygones(renderSymImage(motif, axis, t))[1]);
				expect(new Set([img('reflet'), img('glisse'), img('tourne')]).size).toBe(3);
			}
		}
	});

	it('le cœur est tracé SYMÉTRIQUE (un seul chemin, chaque x a son miroir autour du centre)', () => {
		// Régression : l'ancien cœur (2 cercles + triangle, formes séparées contourées)
		// paraissait asymétrique au creux central → réponse « Oui » trompeuse. Désormais
		// un seul <path> symétrique par construction.
		const svg = renderSymJuger('coeur'); // figure seule (sans axe)
		expect((svg.match(/<path/g) ?? []).length).toBe(1);
		expect(svg).not.toContain('<circle'); // plus de cercles séparés
		const d = svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
		const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
		const xs = nums.filter((_, i) => i % 2 === 0); // les x des paires « x y »
		expect(xs.length).toBeGreaterThan(0);
		const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
		// Chaque x a son miroir (2·centre − x) présent dans le tracé (à 1 px près).
		for (const x of xs) {
			expect(xs.some((o) => Math.abs(o - (2 * centre - x)) <= 1)).toBe(true);
		}
	});
});

describe('symétrie axiale — vérité géométrique du format « axe »', () => {
	it('reconnaît les vrais axes (médianes) et refuse les diagonales du rectangle (le piège)', () => {
		// Vrais axes.
		expect(axeEstDeSymetrie('rectangle', 'v')).toBe(true);
		expect(axeEstDeSymetrie('rectangle', 'h')).toBe(true);
		expect(axeEstDeSymetrie('carre', 'd1')).toBe(true);
		expect(axeEstDeSymetrie('triangleIso', 'v')).toBe(true);
		expect(axeEstDeSymetrie('lettreH', 'h')).toBe(true);
		// Piège : la diagonale d'un rectangle n'est PAS un axe de symétrie.
		expect(axeEstDeSymetrie('rectangle', 'd1')).toBe(false);
		expect(axeEstDeSymetrie('rectangle', 'd2')).toBe(false);
		// Autres faux axes.
		expect(axeEstDeSymetrie('triangleIso', 'h')).toBe(false);
		expect(axeEstDeSymetrie('losange', 'd1')).toBe(false);
		expect(axeEstDeSymetrie('lettreA', 'h')).toBe(false);
		// Figures sans aucun axe.
		expect(axeEstDeSymetrie('triangleScalene', 'v')).toBe(false);
		expect(axeEstDeSymetrie('fanion', 'v')).toBe(false);
	});
});
