/* ============================================================
   Conversions de mesures — résultats DÉCIMAUX au CM1 (#248). Logique PURE (sans DOM).
   Vérifie l'ouverture décimale par paire (règle programme 2025 §1.3, AU PLUS 2
   chiffres après la virgule), le CE2 STRICTEMENT entier, l'absence de point (virgule
   partout, question comme réponse), et la tolérance de saisie (virgule/point,
   « 4,5 » == « 4,50 »). Itérations BORNÉES (pas de suite lente).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import { checkNumerique } from '../src/core/check-helpers';
import { checkItemAnswer, createRenderContext, renderItem } from '../src/core/items';
import { genLessonItem, getLessonById } from '../src/core/catalog';
import type { Exercise } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';

const IDS = ['mes-longueurs', 'mes-masses', 'mes-contenances', 'mes-durees'] as const;
const type = (id: string) => MESURE_LESSONS.find((l) => l.id === id)!.exerciseType;

// N exercices texte d'une leçon à un niveau (toutes les conversions sont de type 'text').
function gen(id: string, level: SchoolLevel, n: number): Extract<Exercise, { type: 'text' }>[] {
	const t = type(id);
	const out: Extract<Exercise, { type: 'text' }>[] = [];
	for (let i = 0; i < n; i++) {
		const ex = t.generate({ level });
		if (ex.type === 'text') out.push(ex);
	}
	return out;
}

// Décompose « A ku = @ au » ou « @ au = A ku » (A = valeur connue affichée).
function parseQ(q: string): { known: string; knownUnit: string; answerUnit: string } | null {
	const m1 = q.match(/^(.+?) ([A-Za-z]+) = @ ([A-Za-z]+)$/);
	if (m1) return { known: m1[1], knownUnit: m1[2], answerUnit: m1[3] };
	const m2 = q.match(/^@ ([A-Za-z]+) = (.+?) ([A-Za-z]+)$/);
	if (m2) return { answerUnit: m2[1], known: m2[2], knownUnit: m2[3] };
	return null;
}
// Nombre de chiffres après la virgule (0 si entier).
const nbDecimales = (s: string): number => (s.includes(',') ? (s.split(',')[1] ?? '').length : 0);

const txt = (answer: string): Exercise => ({ type: 'text', question: 'q @', answer });

describe('Conversions décimales CM1 (#248) — invariants transverses', () => {
	it('CM1 : chaque réponse stockée se valide par check() (décimaux compris)', () => {
		for (const id of IDS) {
			const t = type(id);
			for (const ex of gen(id, 'cm1', 300)) {
				expect(t.check(ex, ex.answer)).toBe(true);
			}
		}
	});

	it('CM1 : au plus 2 décimales, aucun point (question NI réponse)', () => {
		for (const id of IDS) {
			for (const ex of gen(id, 'cm1', 300)) {
				expect(ex.question).not.toContain('.');
				expect(ex.answer).not.toContain('.');
				expect(nbDecimales(ex.answer)).toBeLessThanOrEqual(2);
				// Tout nombre à virgule AFFICHÉ dans l'énoncé a lui aussi ≤ 2 décimales.
				for (const nb of ex.question.match(/\d+,\d+/g) ?? []) {
					expect(nbDecimales(nb)).toBeLessThanOrEqual(2);
				}
			}
		}
	});

	it('CE2 : STRICTEMENT entier (aucune virgule, question ni réponse)', () => {
		for (const id of IDS) {
			for (const ex of gen(id, 'ce2', 300)) {
				expect(ex.question).not.toContain(',');
				expect(ex.answer).not.toContain(',');
			}
		}
	});
});

describe('Conversions décimales CM1 (#248) — sens ouverts par paire', () => {
	it('longueurs m↔cm (×100) : décimal SEULEMENT petite→grande (≥ 1) ; grande→petite entier', () => {
		const sample = gen('mes-longueurs', 'cm1', 400)
			.map((ex) => ({ ex, p: parseQ(ex.question)! }))
			.filter(
				({ p }) => p.knownUnit + p.answerUnit === 'mcm' || p.knownUnit + p.answerUnit === 'cmm',
			);
		let decimalVersM = false;
		for (const { ex, p } of sample) {
			if (p.answerUnit === 'cm') {
				// grande→petite (m connu → cm attendu) : ENTIER des deux côtés.
				expect(ex.answer).not.toContain(',');
				expect(p.known).not.toContain(',');
			} else if (p.answerUnit === 'm' && ex.answer.includes(',')) {
				// petite→grande (cm connu → m attendu) : décimal, résultat ≥ 1.
				decimalVersM = true;
				expect(Number(ex.answer.replace(',', '.'))).toBeGreaterThanOrEqual(1);
			}
		}
		expect(decimalVersM).toBe(true); // le sens décimal petite→grande est bien ouvert
	});

	it('longueurs cm↔mm (×10) : décimal dans LES DEUX sens', () => {
		const sample = gen('mes-longueurs', 'cm1', 400)
			.map((ex) => ({ ex, p: parseQ(ex.question)! }))
			.filter(
				({ p }) =>
					(p.knownUnit === 'cm' && p.answerUnit === 'mm') ||
					(p.knownUnit === 'mm' && p.answerUnit === 'cm'),
			);
		// petite→grande : mm connu (entier) → cm attendu DÉCIMAL.
		const decimalReponse = sample.some(
			({ ex, p }) => p.answerUnit === 'cm' && ex.answer.includes(','),
		);
		// grande→petite : cm connu DÉCIMAL → mm attendu (entier).
		const decimalConnu = sample.some(
			({ ex, p }) => p.answerUnit === 'mm' && p.known.includes(',') && !ex.answer.includes(','),
		);
		expect(decimalReponse).toBe(true);
		expect(decimalConnu).toBe(true);
	});

	it('longueurs km↔m (×1000) : reste ENTIER (jamais de virgule)', () => {
		for (const ex of gen('mes-longueurs', 'cm1', 400)) {
			const p = parseQ(ex.question)!;
			if (
				(p.knownUnit === 'km' && p.answerUnit === 'm') ||
				(p.knownUnit === 'm' && p.answerUnit === 'km')
			) {
				expect(ex.question).not.toContain(',');
				expect(ex.answer).not.toContain(',');
			}
		}
	});

	it('contenances : L↔cL et L↔dL décimaux, L↔mL (×1000) entier', () => {
		const sample = gen('mes-contenances', 'cm1', 400).map((ex) => ({
			ex,
			p: parseQ(ex.question)!,
		}));
		expect(sample.some(({ ex, p }) => p.answerUnit === 'L' && ex.answer.includes(','))).toBe(true);
		for (const { ex, p } of sample) {
			if (p.knownUnit === 'mL' || p.answerUnit === 'mL') {
				expect(ex.question).not.toContain(',');
				expect(ex.answer).not.toContain(',');
			}
		}
	});

	it('durées : AUCUN décimal (question ni réponse), CE2 comme CM1', () => {
		for (const level of ['ce2', 'cm1'] as SchoolLevel[]) {
			for (const ex of gen('mes-durees', level, 300)) {
				expect(ex.question).not.toContain(',');
				expect(ex.answer).not.toContain(',');
			}
		}
	});

	it('masses : repères décimaux mémorisés (0,5 kg = 500 g ; 0,25 kg = 250 g), conversions entières', () => {
		const sample = gen('mes-masses', 'cm1', 400);
		// Les repères apparaissent en écriture à virgule côté connu ; la réponse reste entière.
		expect(sample.some((ex) => ex.question.includes('0,5 kg') && ex.answer === '500')).toBe(true);
		expect(sample.some((ex) => ex.question.includes('0,25 kg') && ex.answer === '250')).toBe(true);
		for (const ex of sample) expect(ex.answer).not.toContain(','); // aucune réponse décimale en masse
	});
});

describe('Conversions décimales CM1 (#248) — tolérance de saisie', () => {
	it('réponse stockée en virgule : validée ; « 4,5 » == « 4,50 » ; point accepté', () => {
		expect(checkNumerique(txt('4,56'), '4,56')).toBe(true);
		expect(checkNumerique(txt('4,56'), '4.56')).toBe(true); // point toléré
		expect(checkNumerique(txt('4,5'), '4,50')).toBe(true); // écriture équivalente (#247/I8-I9)
		expect(checkNumerique(txt('4,50'), '4,5')).toBe(true); // symétrique (stockée « 4,50 »)
		expect(checkNumerique(txt('4,56'), '4,57')).toBe(false); // mauvaise valeur
		// checkItemAnswer (chemin fiche/bilan) : même comportement.
		expect(checkItemAnswer({ text: 'q @', answer: '4,56', kind: 'num' }, '4,56')).toBe(true);
		expect(checkItemAnswer({ text: 'q @', answer: '4,5', kind: 'num' }, '4,50')).toBe(true);
	});

	it('un item décimal CM1 réel se corrige juste (virgule ET point)', () => {
		const lesson = getLessonById('mes-longueurs')!;
		let item = genLessonItem(lesson, 'cm1');
		for (let i = 0; i < 200 && !String(item.answer).includes(','); i++) {
			item = genLessonItem(lesson, 'cm1');
		}
		expect(String(item.answer)).toContain(','); // un décimal a bien été atteint
		expect(item.kind).toBe('num'); // classé numérique (pas texte)
		expect(checkItemAnswer(item, String(item.answer))).toBe(true);
		expect(checkItemAnswer(item, String(item.answer).replace(',', '.'))).toBe(true);
	});
});

describe('Conversions décimales CM1 (#248) — rendu de la saisie', () => {
	it('champ décimal → inputmode="decimal" (virgule au clavier) ; entier → "numeric"', () => {
		const dec = renderItem({ text: 'q @', answer: '4,56', kind: 'num' }, createRenderContext());
		expect(dec.balisage).toContain('inputmode="decimal"');
		expect(dec.balisage).not.toContain('.'); // aucun point dans le champ ni la réponse exposée
		const ent = renderItem({ text: 'q @', answer: '300', kind: 'num' }, createRenderContext());
		expect(ent.balisage).toContain('inputmode="numeric"');
	});
});
