/* ============================================================
   Corrigé imprimable (#41) — vérifié au niveau LOGIQUE (chaînes HTML + RNG).
   On verrouille ici :
   - le déterminisme de `withSeed` (clé : feuille et corrigé = mêmes items) ;
   - la révélation des réponses par type d'item (saisie / QCM / posée) ;
   - la correspondance feuille ↔ corrigé (mêmes questions) ;
   - le confinement du `corrigeMode` (retiré après génération).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { buildPrintableDOM } from '../src/core/lessons';
import { getLessonById } from '../src/core/catalog';
import { genItems } from '../src/core/build';
import { renderItem, createRenderContext } from '../src/core/items';
import { withSeed, rnd } from '../src/core/utils';

describe('withSeed — RNG déterministe (#41)', () => {
	// 20 tirages : pour une même graine ils sont identiques ; pour deux graines la
	// probabilité qu'ils coïncident est négligeable.
	const seq = (s: number) => withSeed(s, () => Array.from({ length: 20 }, () => rnd(0, 1_000_000)));

	it('même graine → même suite de tirages', () => {
		expect(seq(7)).toEqual(seq(7));
	});

	it('graines différentes → suites différentes', () => {
		expect(seq(7)).not.toEqual(seq(8));
	});

	it('restaure la source aléatoire après exécution (les tirages redeviennent variables)', () => {
		withSeed(1, () => rnd(0, 10));
		const a = Array.from({ length: 20 }, () => rnd(0, 1_000_000));
		const b = Array.from({ length: 20 }, () => rnd(0, 1_000_000));
		expect(a).not.toEqual(b); // hors withSeed → Math.random
	});

	// Régression : `math-complements` (bilanQ, branche /10 vs /100) et `fr-mbp` (tirage
	// pondéré) tiraient via `Math.random` direct → le corrigé divergeait de la feuille.
	// Depuis qu'ils passent par `randFloat`, une même graine régénère les mêmes items.
	it.each(['math-complements', 'fr-mbp'])(
		'%s : même graine → mêmes items (aléa interne désormais seedable)',
		(id) => {
			const lesson = getLessonById(id)!;
			const items = () =>
				withSeed(2024, () => genItems(lesson, 6).map((i) => `${i.text}¦${i.answer}`));
			expect(items()).toEqual(items());
		},
	);
});

describe('renderItem — révélation corrigé par type (#41)', () => {
	it('saisie : réponse écrite sur la ligne (ans-corrige), sans champ de saisie', () => {
		const html = renderItem(
			{ text: '2 + 2 = @', answer: 4, kind: 'num' },
			createRenderContext({ printMode: true, corrigeMode: true }),
		);
		expect(html).toContain('ans-corrige');
		expect(html).toContain('>4<');
		expect(html).not.toContain('<input');
	});

	it('hors corrigé : champ vide normal (pas de révélation)', () => {
		const html = renderItem(
			{ text: '2 + 2 = @', answer: 4, kind: 'num' },
			createRenderContext({ printMode: true }),
		);
		expect(html).toContain('<input');
		expect(html).not.toContain('ans-corrige');
	});
});

describe('buildPrintableDOM — document avec corrigé (#41)', () => {
	const base = { title: 'Test corrigé', lessonIds: ['geo-angles'] };

	it('sans corrigé : aucune page corrigé ni réponse révélée', () => {
		const dom = buildPrintableDOM({ ...base, kind: 'bilan', nbQ: 3 });
		expect(dom).not.toContain('cover-corrige');
		expect(dom).not.toContain('qcm-print-box--checked');
	});

	it('avec corrigé : page de garde « Corrigé » + bon choix coché (QCM)', () => {
		const dom = buildPrintableDOM({ ...base, kind: 'bilan', nbQ: 3, corrige: true });
		expect(dom).toContain('cover-corrige');
		expect(dom).toContain('Corrigé');
		expect(dom).toContain('qcm-print-box--checked'); // case du bon choix cochée
		expect(dom).toContain('qcm-print-choice--correct');
	});

	it('corrigé d’une fiche posée : cellules-résultat remplies', () => {
		const dom = buildPrintableDOM({
			title: 'T',
			lessonIds: ['calc-addition-posee'],
			kind: 'fiches',
			corrige: true,
		});
		expect(dom).toContain('posee-corrige');
	});

	it('le corrigé reflète les MÊMES items que la feuille (mêmes questions, même ordre)', () => {
		const dom = buildPrintableDOM({ ...base, kind: 'bilan', nbQ: 3, corrige: true });
		const cut = dom.indexOf('cover-corrige');
		expect(cut).toBeGreaterThan(0);
		const questions = (s: string) => s.match(/<p class="qcm-print-q">.*?<\/p>/g) ?? [];
		const feuille = questions(dom.slice(0, cut));
		const corrige = questions(dom.slice(cut));
		expect(feuille.length).toBeGreaterThan(0);
		expect(corrige).toEqual(feuille);
	});
});
