/* ============================================================
   Symétrie axiale (#201) — logique de génération (src/data/maths/symetrie-axiale)
   et exactitude du rendu (src/core/figures : renderSymReflet).
   On tire beaucoup de questions et on vérifie les invariants CE2 : toujours un
   QCM à figure, réponse parmi les choix, les trois formats présents, et SURTOUT
   que le « reflet » est le miroir EXACT du motif (pixel-perfect). Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { SYMETRIE_LESSONS, axeEstDeSymetrie } from '../src/data/maths/symetrie-axiale';
import { renderSymReflet } from '../src/core/figures';
import type { SymMotif } from '../src/core/figures';

const type = SYMETRIE_LESSONS[0].exerciseType;
const TIRAGES = 600;
const draws = Array.from({ length: TIRAGES }, () => type.generate('qcm'));

/** Extrait les listes de points de chaque <polygon> d'un fragment SVG. */
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
		const reflet = draws.filter((d) => d.type === 'qcm' && d.choices.join('') === 'ABC');
		expect(reflet.length).toBeGreaterThan(0);
		const enonces = new Set(ouiNon.map((d) => (d.type === 'qcm' ? d.question : '')));
		expect(enonces.has('Cette figure a-t-elle un axe de symétrie ?')).toBe(true);
		expect(enonces.has('Le trait en pointillé est-il un axe de symétrie ?')).toBe(true);
	});

	it('le format reflet montre trois propositions étiquetées A, B, C', () => {
		const reflet = draws.find((d) => d.type === 'qcm' && d.choices.join('') === 'ABC');
		expect(reflet).toBeTruthy();
		if (reflet && reflet.type === 'qcm') {
			expect(reflet.figure).toContain('>A<');
			expect(reflet.figure).toContain('>B<');
			expect(reflet.figure).toContain('>C<');
		}
	});
});

describe('symétrie axiale — reflet pixel-perfect', () => {
	const CW = 160; // largeur de cellule de renderSymReflet (axe au centre)

	it('axe vertical : l’image « reflet » est le miroir EXACT du motif (x → CW - x, y inchangé)', () => {
		const svg = renderSymReflet('drapeau', 'v', [{ t: 'reflet', label: 'A' }]);
		const [base, img] = polygones(svg);
		expect(base.length).toBe(img.length);
		for (let i = 0; i < base.length; i++) {
			expect(base[i][0] + img[i][0]).toBeCloseTo(CW, 1); // somme des x = axe doublé
			expect(img[i][1]).toBeCloseTo(base[i][1], 5); // y identique
		}
	});

	it('axe horizontal : l’image « reflet » est le miroir EXACT (y → CW - y, x inchangé)', () => {
		const svg = renderSymReflet('botte', 'h', [{ t: 'reflet', label: 'A' }]);
		const [base, img] = polygones(svg);
		for (let i = 0; i < base.length; i++) {
			expect(img[i][0]).toBeCloseTo(base[i][0], 5);
			expect(base[i][1] + img[i][1]).toBeCloseTo(CW, 1);
		}
	});

	it('les trois images (reflet/glissé/tourné) sont distinctes, pour chaque motif et chaque axe', () => {
		const motifs: SymMotif[] = ['drapeau', 'botte'];
		for (const motif of motifs) {
			for (const axis of ['v', 'h'] as const) {
				const img = (t: 'reflet' | 'glisse' | 'tourne') =>
					JSON.stringify(polygones(renderSymReflet(motif, axis, [{ t, label: 'A' }]))[1]);
				const reflet = img('reflet');
				const glisse = img('glisse');
				const tourne = img('tourne');
				// Trois propositions mutuellement distinctes → une seule bonne réponse (le reflet).
				expect(new Set([reflet, glisse, tourne]).size).toBe(3);
			}
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
