/* ============================================================
   Nombres décimaux CM1 (#247) — écritures équivalentes, logique pure.
   - branchement catalogue (CM1-only, Numération, rubrique « Nombres décimaux ») ;
   - BORNE DURE : centièmes au plus (jamais 3+ décimales, jamais de point décimal,
     dénominateur ∈ {10, 100}) sur un grand échantillon ;
   - leçon 1 (grille) : fraction/écriture correcte, choix numériquement DISTINCTS
     (jamais « 0,7 » et « 0,70 » ensemble), figure cohérente avec la réponse,
     distracteurs ciblés (oubli du zéro de cadrage, confusion de rang) présents ;
   - leçon 2 (fractions décimales > 1) : équivalence dans les deux sens, valeur > 1,
     distracteur de rang présent ;
   - leçon 3 (décomposition) : réponse entière validée, la décomposition somme bien
     au nombre, les trois positions de trou apparaissent, rôle du zéro éprouvé ;
   - leçon 4 (recomposition) : la réponse vaut la somme montrée, choix distincts en
     valeur (jamais une écriture égale à la réponse), distracteurs ciblés présents.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import { checkItemAnswer, createRenderContext, renderItem } from '../src/core/items';
import type { Item } from '../src/core/items';
import { renderGrilleCentiemes } from '../src/core/figures';
import type { Exercise } from '../src/core/exercise';

const IDS = [
	'num-dec-grille',
	'num-dec-frac-superieure',
	'num-dec-decomposer',
	'num-dec-recomposer',
];

/* Toutes les chaînes « visibles » d'un exercice — pour éprouver la borne dure partout. */
function textesDe(ex: Exercise): string[] {
	const out: string[] = [];
	if ('question' in ex) out.push(ex.question);
	if ('answer' in ex) out.push(String(ex.answer));
	if ('choices' in ex && ex.choices) out.push(...ex.choices);
	if ('explication' in ex && ex.explication) out.push(ex.explication);
	if ('parle' in ex && ex.parle) out.push(ex.parle);
	return out;
}

/* Valeur numérique d'une écriture « n/d » (fraction) ou « 0,05 » (décimale). */
const valeur = (s: string): number => {
	if (s.includes('/')) {
		const [n, d] = s.split('/').map(Number);
		return n / d;
	}
	return Number(s.replace(',', '.'));
};

/* Nombre de cases coloriées d'une figure (une occurrence de --accent-soft par case). */
const casesColoriees = (svg: string): number => (svg.match(/var\(--accent-soft\)/g) ?? []).length;

describe('Écritures des décimaux CM1 — branchement catalogue (#247)', () => {
	it('les 4 leçons existent, CM1-only, en Numération, rubrique « Nombres décimaux »', () => {
		for (const id of IDS) {
			const l = getLessonById(id)!;
			expect(l).toBeDefined();
			expect(l.levels).toEqual(['cm1']);
			expect(l.category).toBe('math-numeration');
			expect(l.rubrique).toBe('Nombres décimaux');
		}
	});
});

describe('BORNE DURE : centièmes au plus, dénominateur ∈ {10, 100} (#247)', () => {
	it('aucune leçon ne dépasse 2 décimales ni n’écrit un point décimal (grand échantillon)', () => {
		let vusDecimaux = 0;
		for (const id of IDS) {
			const t = getLessonById(id)!.exerciseType;
			for (let i = 0; i < 400; i++) {
				const ex = t.generate();
				for (const s of textesDe(ex)) {
					expect(s).not.toMatch(/\d,\d{3,}/); // pas de millième (3+ décimales)
					expect(s).not.toMatch(/\d\.\d/); // jamais de point décimal (convention FR)
					if (/\d,\d/.test(s)) vusDecimaux++;
					// Toute fraction citée est décimale : dénominateur 10 ou 100 uniquement.
					for (const m of s.matchAll(/(\d+)\/(\d+)/g)) {
						expect([10, 100]).toContain(Number(m[2]));
					}
				}
			}
		}
		expect(vusDecimaux).toBeGreaterThan(0); // on a bien produit des décimaux
	});
});

describe('Figure — grille des centièmes (#247)', () => {
	it('colorie exactement `parts` cases, bornées à [0, 100]', () => {
		for (let p = 0; p <= 100; p++) {
			const svg = renderGrilleCentiemes(p);
			expect(svg).toContain('<svg');
			expect(casesColoriees(svg)).toBe(p);
		}
		// Bornage : hors [0,100], on clampe (jamais plus de 100 cases, jamais de négatif).
		expect(casesColoriees(renderGrilleCentiemes(150))).toBe(100);
		expect(casesColoriees(renderGrilleCentiemes(-7))).toBe(0);
	});

	it('l’étiquette accessible ne révèle JAMAIS le compte de cases coloriées (invariant)', () => {
		// title / desc / aria-label doivent être IDENTIQUES quel que soit `parts` : ils
		// décrivent la structure (« 100 cases égales »), jamais le nombre de coloriées (la réponse).
		const etiquette = (svg: string) => ({
			title: svg.match(/<title>(.*?)<\/title>/)![1],
			desc: svg.match(/<desc>(.*?)<\/desc>/)![1],
			aria: svg.match(/aria-label="(.*?)"/)![1],
		});
		const ref = etiquette(renderGrilleCentiemes(3));
		for (const p of [0, 7, 40, 55, 90, 100]) {
			expect(etiquette(renderGrilleCentiemes(p))).toEqual(ref);
		}
	});
});

describe('Leçon 1 — une fraction, une écriture à virgule (grille, QCM) (#247)', () => {
	const t = getLessonById('num-dec-grille')!.exerciseType;

	it('QCM à 4 choix distincts en VALEUR (« 0,7 » et « 0,70 » jamais ensemble), figure cohérente', () => {
		for (let i = 0; i < 2000; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choices).toHaveLength(4);
			// Aucun doublon de VALEUR : deux écritures d'un même nombre ne coexistent pas.
			const vals = ex.choices.map(valeur);
			expect(new Set(vals).size).toBe(vals.length);
			// La figure colorie exactement le nombre de cases correspondant à la réponse.
			expect(ex.figure).toBeDefined();
			const attendu = Math.round(valeur(ex.answer) * 100);
			expect(attendu).toBeGreaterThanOrEqual(0);
			expect(attendu).toBeLessThanOrEqual(100);
			expect(casesColoriees(ex.figure!)).toBe(attendu);
		}
	});

	it('distracteurs ciblés : oubli du zéro de cadrage (0,0n→0,n) et confusion de rang (n/100→n/10)', () => {
		let oubliZero = 0; // (b) écriture « 0,04 » avec « 0,4 » proposé
		let confusionRang = 0; // (a) fraction « 4/100 » avec « 4/10 » proposé
		for (let i = 0; i < 4000; i++) {
			const ex = t.generate();
			if (ex.type !== 'qcm') continue;
			const m = ex.answer.match(/^0,0(\d)$/); // centième en écriture
			if (m && ex.choices.includes(`0,${m[1]}`)) oubliZero++;
			const f = ex.answer.match(/^(\d)\/100$/); // centième en fraction
			if (f && ex.choices.includes(`${f[1]}/10`)) confusionRang++;
		}
		expect(oubliZero).toBeGreaterThan(0);
		expect(confusionRang).toBeGreaterThan(0);
	});

	it('se corrige comme un QCM : bonne réponse acceptée, autre choix refusé', () => {
		for (let i = 0; i < 300; i++) {
			const ex = t.generate();
			if (ex.type !== 'qcm') continue;
			expect(t.check(ex, ex.answer)).toBe(true);
			const autre = ex.choices.find((c) => c !== ex.answer)!;
			expect(t.check(ex, autre)).toBe(false);
		}
	});
});

describe('Leçon 2 — une fraction décimale plus grande que 1 (QCM, deux sens) (#247)', () => {
	const t = getLessonById('num-dec-frac-superieure')!.exerciseType;

	it('équivalence dans les deux sens, valeur > 1, choix distincts en valeur', () => {
		let sensFraction = 0; // fraction montrée → écriture demandée
		let sensEcriture = 0; // écriture montrée → fraction demandée
		for (let i = 0; i < 3000; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choices).toHaveLength(4);
			const vals = ex.choices.map(valeur);
			expect(new Set(vals).size).toBe(vals.length);
			// Aucune écriture décimale à ZÉRO FINAL (« 3,50 » n'est jamais un choix — on
			// n'oppose pas deux écritures d'un même nombre, cf. #246).
			for (const c of ex.choices) if (!c.includes('/')) expect(c).not.toMatch(/,\d*0$/);
			// La réponse et l'autre écriture (dans l'énoncé) désignent le même nombre > 1.
			const autre = ex.answer.includes('/')
				? ex.question.match(/(\d+,\d+)/)![1] // fraction demandée → écriture dans l'énoncé
				: ex.question.match(/(\d+\/\d+)/)![1]; // écriture demandée → fraction dans l'énoncé
			expect(valeur(ex.answer)).toBeCloseTo(valeur(autre), 6);
			expect(valeur(ex.answer)).toBeGreaterThan(1);
			if (ex.answer.includes('/')) sensEcriture++;
			else sensFraction++;
		}
		expect(sensFraction).toBeGreaterThan(0);
		expect(sensEcriture).toBeGreaterThan(0);
	});

	it('distracteur de rang présent : même numérateur sur l’autre dénominateur (n/10 vs n/100)', () => {
		let vus = 0;
		for (let i = 0; i < 3000 && vus < 5; i++) {
			const ex = t.generate();
			if (ex.type !== 'qcm' || !ex.answer.includes('/')) continue; // sens « → fraction »
			const num = ex.answer.split('/')[0];
			const autre = ex.answer.endsWith('/10') ? `${num}/100` : `${num}/10`;
			if (ex.choices.includes(autre)) vus++;
		}
		expect(vus).toBeGreaterThan(0);
	});
});

describe('Leçon 3 — je décompose un nombre décimal (saisie) (#247)', () => {
	const t = getLessonById('num-dec-decomposer')!.exerciseType;

	it('réponse entière validée ; la décomposition somme bien au nombre', () => {
		for (let i = 0; i < 2000; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('text');
			if (ex.type !== 'text') continue;
			expect(ex.answer).toMatch(/^\d+$/); // toujours un entier (jamais un décimal tapé)
			expect(t.check(ex, ex.answer)).toBe(true);
			expect(t.check(ex, String(Number(ex.answer) + 1))).toBe(false);
			// Reconstitution : le nombre = entier + dixNum/10 + centNum/100 (trou rempli).
			const rep = Number(ex.answer);
			const [gauche, droite] = ex.question.split(' = ');
			const nombre = valeur(gauche.match(/\d+,\d\d/)![0]);
			const [t0, t1, t2] = droite.split(' + ');
			const entier = t0 === '@' ? rep : Number(t0);
			const dixNum = t1.startsWith('@') ? rep : Number(t1.split('/')[0]);
			const centNum = t2.startsWith('@') ? rep : Number(t2.split('/')[0]);
			expect(Math.round((entier + dixNum / 10 + centNum / 100) * 100)).toBe(
				Math.round(nombre * 100),
			);
		}
	});

	it('rendu fiche : item numérique, corrigé par checkItemAnswer (bon accepté, faux refusé)', () => {
		for (let i = 0; i < 300; i++) {
			const item = genLessonItem(getLessonById('num-dec-decomposer')!, 'cm1');
			expect(item.kind).toBe('num'); // réponse entière → saisie numérique
			const bon = String(item.answer);
			expect(checkItemAnswer(item, bon)).toBe(true);
			expect(checkItemAnswer(item, String(Number(bon) + 1))).toBe(false);
		}
	});

	it('trou d’un rang décimal : rendu EMPILÉ cohérent à l’écran ET à l’impression', () => {
		const item: Item = { text: '42,48 = 42 + @/10 + 8/100', answer: '4', kind: 'num' };
		// Écran : le champ (noté) tient DANS le numérateur (fraction empilée), pas « @/10 » en ligne.
		const ecran = renderItem(item, createRenderContext());
		expect(ecran).toContain('frac-num-input');
		expect(ecran).toContain('frac-num');
		expect(ecran).not.toContain('@/10');
		// Impression : une case vide `.cloze-box` DANS un numérateur empilé (rendu homogène
		// avec le terme voisin « 8/100 », lui aussi empilé), pas « @/10 » en ligne.
		const impr = renderItem(item, createRenderContext({ printMode: true }));
		expect(impr).toContain('cloze-box');
		expect(impr).toContain('frac-num');
		expect(impr).not.toContain('@/10');
		expect(impr).not.toContain('frac-num-input'); // pas de champ de saisie à l'impression
		// Corrigé : le chiffre est révélé dans le numérateur (pas de case vide).
		const corrige = renderItem(item, createRenderContext({ printMode: true, corrigeMode: true }));
		expect(corrige).toContain('ans-corrige');
		expect(corrige).not.toContain('cloze-box');
	});

	it('les trois positions de trou apparaissent, et le rôle du zéro est éprouvé (réponse 0)', () => {
		let trouEntier = 0;
		let trouDixieme = 0;
		let trouCentieme = 0;
		let zero = 0;
		for (let i = 0; i < 3000; i++) {
			const ex = t.generate();
			if (ex.type !== 'text') continue;
			const droite = ex.question.split(' = ')[1];
			const [t0, t1, t2] = droite.split(' + ');
			if (t0 === '@') trouEntier++;
			else if (t1.startsWith('@')) trouDixieme++;
			else if (t2.startsWith('@')) trouCentieme++;
			if (ex.answer === '0') zero++;
		}
		expect(trouEntier).toBeGreaterThan(0);
		expect(trouDixieme).toBeGreaterThan(0);
		expect(trouCentieme).toBeGreaterThan(0);
		expect(zero).toBeGreaterThan(0);
	});
});

describe('Leçon 4 — je recompose un nombre décimal (QCM, composer) (#247)', () => {
	const t = getLessonById('num-dec-recomposer')!.exerciseType;

	it('la réponse vaut la somme montrée ; choix distincts en valeur (aucune écriture = réponse)', () => {
		for (let i = 0; i < 3000; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choices).toHaveLength(4);
			// Aucun doublon de VALEUR → jamais « 42,48 » ET « 42,480 » ensemble.
			const vals = ex.choices.map(valeur);
			expect(new Set(vals).size).toBe(vals.length);
			// La réponse vaut exactement la somme montrée (entier + fractions décimales).
			const somme = ex.question.split(' = ')[0];
			let v = 0;
			for (const terme of somme.split(' + ')) {
				if (terme.includes('/')) {
					const [n, d] = terme.split('/').map(Number);
					v += n / d;
				} else v += Number(terme);
			}
			expect(valeur(ex.answer)).toBeCloseTo(v, 6);
			// Correction QCM.
			expect(t.check(ex, ex.answer)).toBe(true);
			const autre = ex.choices.find((c) => c !== ex.answer)!;
			expect(t.check(ex, autre)).toBe(false);
			// Borne : la réponse ne dépasse jamais 2 décimales.
			expect(ex.answer).not.toMatch(/,\d{3,}/);
		}
	});

	it('distracteurs ciblés présents : rang inversé et numérateurs additionnés', () => {
		let inversion = 0;
		let addition = 0;
		for (let i = 0; i < 5000; i++) {
			const ex = t.generate();
			if (ex.type !== 'qcm') continue;
			// d et c reconstruits depuis la réponse canonique (« 42,4 » → d=4,c=0 ; « 3,05 » → d=0,c=5).
			const dec2 = (ex.answer.split(',')[1] ?? '').padEnd(2, '0');
			const d = Number(dec2[0]);
			const c = Number(dec2[1]);
			const E = Number(ex.answer.split(',')[0]);
			const vals = ex.choices.map(valeur);
			const contient = (x: number) => vals.some((y) => Math.abs(y - x) < 1e-9);
			if (c !== d && contient(E + c / 10 + d / 100)) inversion++; // rang inversé
			if (d > 0 && contient(E + (d + c) / 100)) addition++; // numérateurs additionnés
		}
		expect(inversion).toBeGreaterThan(0);
		expect(addition).toBeGreaterThan(0);
	});
});
