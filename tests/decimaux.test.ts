/* ============================================================
   Nombres décimaux CM1 (#246) — logique pure.
   - BORNE DURE : aucun nombre à 3+ décimales (centièmes au plus) sur un grand
     échantillon, toutes leçons confondues ;
   - numération de position décimale : « chiffre au rang » juste, cas zéro compris ;
   - rôle du zéro : « 3,4 » = « 3,40 » (même nombre) vs « 3,4 » ≠ « 3,04 » ;
   - comparer : signe correct, les deux familles de distracteurs apparaissent ;
   - encadrer : entier juste avant/après correct ;
   - ranger : bonne suite triée par valeur, choix distincts et permutations valides ;
   - branchement catalogue (CM1-only, Numération, rubrique « Nombres décimaux »).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import type { Exercise } from '../src/core/exercise';

const IDS = [
	'num-dec-position',
	'num-dec-egales',
	'num-dec-comparer',
	'num-dec-encadrer',
	'num-dec-ranger',
];

/* Toutes les chaînes « visibles » d'un exercice (énoncé, réponse, choix, consigne,
   explication, tuiles, texte lu) — pour éprouver la borne dure partout. */
function textesDe(ex: Exercise): string[] {
	const out: string[] = [];
	if ('question' in ex) out.push(ex.question);
	if ('answer' in ex) out.push(String(ex.answer));
	if ('choices' in ex && ex.choices) out.push(...ex.choices);
	if ('tuiles' in ex && ex.tuiles) out.push(...ex.tuiles);
	if ('consigne' in ex && ex.consigne) out.push(ex.consigne);
	if ('explication' in ex && ex.explication) out.push(ex.explication);
	if ('parle' in ex && ex.parle) out.push(ex.parle);
	return out;
}

/* Valeur en centièmes d'un décimal écrit à la française (« 3,04 » → 304). */
const enCentiemes = (s: string) => Math.round(Number(s.replace(',', '.')) * 100);

describe('Nombres décimaux CM1 — branchement catalogue (#246)', () => {
	it('les 5 leçons existent, CM1-only, en Numération, rubrique « Nombres décimaux »', () => {
		for (const id of IDS) {
			const l = getLessonById(id)!;
			expect(l).toBeDefined();
			expect(l.levels).toEqual(['cm1']);
			expect(l.category).toBe('math-numeration');
			expect(l.rubrique).toBe('Nombres décimaux');
		}
	});
});

describe('BORNE DURE : centièmes au plus, JAMAIS de millièmes (#246)', () => {
	// Seules comparer/encadrer offrent le mode tuiles ; inutile (et coûteux) de le
	// demander aux 3 autres, dont `generate` ignore `opts` et referait le même travail.
	const AVEC_TUILES = new Set(['num-dec-comparer', 'num-dec-encadrer']);
	it('aucune leçon ne produit un nombre à 3+ décimales (grand échantillon)', () => {
		let vusDecimaux = 0;
		for (const id of IDS) {
			const t = getLessonById(id)!.exerciseType;
			// 400 tirages/leçon suffisent largement pour une propriété de FORMAT (borne dure).
			for (let i = 0; i < 400; i++) {
				const exs = AVEC_TUILES.has(id)
					? [t.generate(), t.generate({ mode: 'tuiles' })]
					: [t.generate()];
				for (const ex of exs) {
					for (const s of textesDe(ex)) {
						// Une virgule suivie de 3 chiffres ou plus = un millième → interdit.
						expect(s).not.toMatch(/\d,\d{3,}/);
						// Jamais d'écriture anglo-saxonne (point décimal) non plus.
						expect(s).not.toMatch(/\d\.\d/);
						if (/\d,\d/.test(s)) vusDecimaux++;
					}
				}
			}
		}
		// Sanity : on a bien PRODUIT des décimaux (sinon le test ne prouve rien).
		expect(vusDecimaux).toBeGreaterThan(0);
	});
});

describe('Leçon 1 — numération de position décimale + rôle du zéro (#246)', () => {
	const t = getLessonById('num-dec-position')!.exerciseType;

	it('« chiffre au rang » : réponse = le bon chiffre, cas zéro inclus et corrects', () => {
		let vusZero = 0;
		for (let i = 0; i < 3000; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('text');
			if (ex.type !== 'text') continue;
			const m = ex.question.match(
				/Dans (\d+,\d+), quel est le chiffre des (unité|dixième|centième)s/,
			);
			expect(m).not.toBeNull();
			const centiemes = enCentiemes(m![1]);
			const rang = m![2];
			const attendu =
				rang === 'unité'
					? Math.floor(centiemes / 100) % 10
					: rang === 'dixième'
						? Math.floor((centiemes % 100) / 10)
						: centiemes % 10;
			expect(ex.answer).toBe(String(attendu));
			if (attendu === 0) vusZero++;
			// La réponse exacte est validée (correction numérique), une fausse non.
			const item = genLessonItem(getLessonById('num-dec-position')!, 'cm1');
			expect(item.kind).toBe('num');
		}
		// Le rôle du zéro est bien éprouvé : des réponses « 0 » à un rang décimal apparaissent.
		expect(vusZero).toBeGreaterThan(0);
	});

	it('l’item se corrige : bonne réponse acceptée, mauvaise refusée', () => {
		for (let i = 0; i < 300; i++) {
			const item = genLessonItem(getLessonById('num-dec-position')!, 'cm1');
			const bon = String(item.answer);
			expect(checkItemAnswer(item, bon)).toBe(true);
			expect(checkItemAnswer(item, String((Number(bon) + 1) % 10))).toBe(false);
		}
	});
});

describe('Leçon 2 — « le même nombre ? » (rôle du zéro, QCM) (#246)', () => {
	const t = getLessonById('num-dec-egales')!.exerciseType;

	it('Oui ssi même valeur ; « 3,4 » = « 3,40 » (zéro final), « 3,4 » ≠ « 3,04 » (zéro médian)', () => {
		let vusOui = 0;
		let vusNon = 0;
		for (let i = 0; i < 2000; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toEqual(['Oui', 'Non']);
			const m = ex.question.match(/« (\d+,\d+) » et « (\d+,\d+) »/);
			expect(m).not.toBeNull();
			const egaux = enCentiemes(m![1]) === enCentiemes(m![2]);
			expect(ex.answer).toBe(egaux ? 'Oui' : 'Non');
			// Écritures textuellement différentes dans les deux cas (le test discrimine).
			expect(m![1]).not.toBe(m![2]);
			if (egaux) vusOui++;
			else vusNon++;
		}
		expect(vusOui).toBeGreaterThan(0);
		expect(vusNon).toBeGreaterThan(0);
	});
});

describe('Leçon 3 — comparer les décimaux (#246)', () => {
	const t = getLessonById('num-dec-comparer')!.exerciseType;

	const parseCompare = (ex: Exercise): [number, number, string] => {
		if (ex.type !== 'text') throw new Error('attendu text');
		const m = ex.question.match(/Compare : (\d+,\d+) @ (\d+,\d+)/);
		if (!m) throw new Error('énoncé inattendu : ' + ex.question);
		return [enCentiemes(m[1]), enCentiemes(m[2]), ex.answer];
	};

	it('le signe est correct et validé ; un mauvais signe est refusé', () => {
		for (let i = 0; i < 2000; i++) {
			const ex = t.generate();
			const [a, b, sig] = parseCompare(ex);
			const attendu = a < b ? '<' : a > b ? '>' : '=';
			expect(sig).toBe(attendu);
			expect(t.check(ex, sig)).toBe(true);
			expect(t.check(ex, sig === '=' ? '<' : '=')).toBe(false);
		}
	});

	it('les deux familles de distracteurs ET les égalités à zéro final apparaissent', () => {
		let entiersDifferents = 0; // famille 1
		let memesEntiersLongueursDiff = 0; // famille 2
		let egalitesZeroFinal = 0; // ~18 % ciblées
		for (let i = 0; i < 4000; i++) {
			const ex = t.generate();
			if (ex.type !== 'text') continue;
			const m = ex.question.match(/Compare : (\d+,\d+) @ (\d+,\d+)/)!;
			const [s1, s2] = [m[1], m[2]];
			const [a, b, sig] = parseCompare(ex);
			const ent1 = Math.floor(a / 100);
			const ent2 = Math.floor(b / 100);
			const dec1 = s1.split(',')[1].length;
			const dec2 = s2.split(',')[1].length;
			if (ent1 !== ent2) entiersDifferents++;
			else if (dec1 !== dec2 && a !== b) memesEntiersLongueursDiff++;
			if (sig === '=' && a === b && s1 !== s2) egalitesZeroFinal++;
		}
		expect(entiersDifferents).toBeGreaterThan(0);
		expect(memesEntiersLongueursDiff).toBeGreaterThan(0);
		expect(egalitesZeroFinal).toBeGreaterThan(0);
	});

	it('mode tuiles : la bonne tuile (le signe) figure parmi les tuiles', () => {
		for (let i = 0; i < 200; i++) {
			const ex = t.generate({ mode: 'tuiles' });
			expect(ex.type).toBe('tuilesNombre');
			if (ex.type !== 'tuilesNombre') continue;
			expect(ex.tuiles).toContain(ex.answer);
			expect(ex.tuiles).toEqual(expect.arrayContaining(['<', '=', '>']));
		}
	});
});

describe('Leçon 4 — encadrer entre deux entiers consécutifs (#246)', () => {
	const t = getLessonById('num-dec-encadrer')!.exerciseType;

	it('la réponse est l’entier juste avant / juste après, et elle est validée', () => {
		for (let i = 0; i < 2000; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('text');
			if (ex.type !== 'text') continue;
			const m = ex.question.match(/juste (avant|après) (\d+,\d+) : @/);
			expect(m).not.toBeNull();
			const val = enCentiemes(m![2]) / 100;
			const inf = Math.floor(val);
			const attendu = m![1] === 'après' ? inf + 1 : inf;
			expect(Number(ex.answer)).toBe(attendu);
			// La partie décimale n'est jamais nulle (sinon « juste avant/après » d'un entier).
			expect(enCentiemes(m![2]) % 100).not.toBe(0);
			expect(t.check(ex, ex.answer)).toBe(true);
			expect(t.check(ex, String(attendu + 1))).toBe(false);
		}
	});

	it('mode tuiles : la bonne tuile (l’entier) figure parmi les tuiles, ≥ 0', () => {
		for (let i = 0; i < 500; i++) {
			const ex = t.generate({ mode: 'tuiles' });
			if (ex.type !== 'tuilesNombre') continue;
			expect(ex.tuiles).toContain(ex.answer);
			for (const tu of ex.tuiles) expect(Number(tu)).toBeGreaterThanOrEqual(0);
		}
	});

	it('inclut des décimaux de [0,1[ (« juste avant 0,45 » → 0)', () => {
		let vus = 0;
		for (let i = 0; i < 3000 && vus < 5; i++) {
			const ex = t.generate();
			if (ex.type !== 'text') continue;
			if (/juste avant 0,\d+ : @/.test(ex.question)) {
				expect(ex.answer).toBe('0');
				vus++;
			}
		}
		expect(vus).toBeGreaterThan(0);
	});
});

describe('Leçon 5 — ranger des décimaux (QCM) (#246)', () => {
	const t = getLessonById('num-dec-ranger')!.exerciseType;

	it('la bonne réponse est triée par VALEUR ; choix distincts, tous permutations', () => {
		for (let i = 0; i < 2000; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			// « décroissant » contient « croissant » → tester le préfixe négatif d'abord.
			const croissant = !ex.question.includes('décroissant');
			const suite = ex.answer.split(' ; ').map(enCentiemes);
			const trie = [...suite].sort((a, b) => (croissant ? a - b : b - a));
			expect(suite).toEqual(trie); // la réponse est bien rangée
			// La bonne réponse figure dans les choix, et les choix sont distincts.
			expect(ex.choices).toContain(ex.answer);
			expect(new Set(ex.choices).size).toBe(ex.choices.length);
			expect(ex.choices.length).toBeGreaterThanOrEqual(3);
			// Chaque choix est une permutation du MÊME multiensemble (aucune faute affichée).
			const refTri = [...suite].sort((a, b) => a - b).join(',');
			for (const c of ex.choices) {
				const vals = c
					.split(' ; ')
					.map(enCentiemes)
					.sort((a, b) => a - b)
					.join(',');
				expect(vals).toBe(refTri);
			}
			// 3 nombres (charge de mémoire de travail bornée).
			expect(suite.length).toBe(3);
		}
	});

	it('se corrige comme un QCM texte : bonne suite acceptée, autre suite refusée', () => {
		for (let i = 0; i < 300; i++) {
			const ex = t.generate();
			if (ex.type !== 'qcm') continue;
			expect(t.check(ex, ex.answer)).toBe(true);
			const autre = ex.choices.find((c) => c !== ex.answer)!;
			expect(t.check(ex, autre)).toBe(false);
		}
	});
});
