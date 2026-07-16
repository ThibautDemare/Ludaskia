/* ============================================================
   Division par le sens (#104) — logique de génération (src/data/maths/division).
   Invariants CE2 : division EXACTE (reste nul), diviseur ≥ 2, quotient ≥ 2,
   dividende ≤ 100, réponse entière ; moitié/quart à résultat entier ; figure de
   découverte uniquement en partage et pour un petit total. Pas de DOM.
   Plages par niveau (#287) : « Moitié et quart » est calibrée CE2/CM1 — CE2
   moitié X ≤ 50 / quart X ≤ 48, CM1 jusqu'à X ≤ 100. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { DIVISION_LESSONS } from '../src/data/maths/division';
import { renderFigure } from '../src/core/figures';
import { getLessonById, getLessonsByCategory, isProblemeLesson } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import type { SchoolLevel } from '../src/core/catalog';

const TIRAGES = 500;

function gen(id: string) {
	const l = DIVISION_LESSONS.find((x) => x.id === id)!;
	return Array.from({ length: TIRAGES }, () => l.exerciseType.generate());
}
const ints = (s: string) => (s.match(/\d+/g) ?? []).map(Number);

// Dividendes « la moitié de X » et « le quart de X » d'un niveau (≥ 1000 tirages).
function dividendesMoitieQuart(level: SchoolLevel, n = 1000) {
	const l = DIVISION_LESSONS.find((x) => x.id === 'math-div-moitie-quart')!;
	const moities: number[] = [];
	const quarts: number[] = [];
	for (let i = 0; i < n; i++) {
		const ex = l.exerciseType.generate({ level });
		if (ex.type !== 'text') throw new Error('attendu text');
		const m = /^La moitié de (\d+) = @$/.exec(ex.question);
		const q = /^Le quart de (\d+) = @$/.exec(ex.question);
		if (m) moities.push(Number(m[1]));
		if (q) quarts.push(Number(q[1]));
		expect(l.exerciseType.check(ex, String(ex.answer))).toBe(true); // la réponse stockée se valide
	}
	return { moities, quarts };
}

describe('Moitié et quart d’une collection', () => {
	it('résultat entier garanti, quotient ≥ 2, dénominateurs 2 et 4 seulement', () => {
		for (const ex of gen('math-div-moitie-quart')) {
			if (ex.type !== 'text') throw new Error('attendu text');
			const rep = Number(ex.answer);
			expect(Number.isInteger(rep)).toBe(true);
			expect(rep).toBeGreaterThanOrEqual(2);
			const moitie = /^La moitié de (\d+) = @$/.exec(ex.question);
			const quart = /^Le quart de (\d+) = @$/.exec(ex.question);
			expect(Boolean(moitie) || Boolean(quart)).toBe(true);
			if (moitie) expect(Number(moitie[1])).toBe(rep * 2);
			if (quart) expect(Number(quart[1])).toBe(rep * 4);
			expect(ex.figure).toBeUndefined(); // pas de figure sur cette leçon
		}
	});

	it('expose CE2 + CM1 (moteur calibré, #287)', () => {
		const l = DIVISION_LESSONS.find((x) => x.id === 'math-div-moitie-quart')!;
		expect(l.exerciseType.levels).toEqual(['ce2', 'cm1']);
	});

	it('CE2 : moitié X ≤ 50 (quotient 2–25), quart X ≤ 48 (quotient 2–12)', () => {
		const { moities, quarts } = dividendesMoitieQuart('ce2');
		for (const x of moities) {
			expect(x % 2).toBe(0);
			expect(x).toBeLessThanOrEqual(50); // X = 2·q, q ≤ 25
			expect(x).toBeGreaterThanOrEqual(4); // q ≥ 2
		}
		for (const x of quarts) {
			expect(x % 4).toBe(0);
			expect(x).toBeLessThanOrEqual(48); // X = 4·q, q ≤ 12
			expect(x).toBeGreaterThanOrEqual(8); // q ≥ 2
		}
		// Les bornes hautes CE2 sont effectivement atteintes (sinon le calibrage est trop étroit).
		expect(Math.max(...moities)).toBe(50);
		expect(Math.max(...quarts)).toBe(48);
	});

	it('CM1 : moitié ET quart jusqu’à X ≤ 100, et X > 50 possible', () => {
		const { moities, quarts } = dividendesMoitieQuart('cm1');
		for (const x of [...moities, ...quarts]) expect(x).toBeLessThanOrEqual(100);
		for (const x of moities) expect(x % 2).toBe(0);
		for (const x of quarts) expect(x % 4).toBe(0);
		// Extension CM1 : on dépasse la borne CE2 (X > 50) côté moitié ET côté quart.
		expect(moities.some((x) => x > 50)).toBe(true);
		expect(quarts.some((x) => x > 48)).toBe(true);
		expect(Math.max(...moities)).toBe(100); // X = 2·q, q ≤ 50
		expect(Math.max(...quarts)).toBe(100); // X = 4·q, q ≤ 25
	});
});

describe('Je partage', () => {
	it('division exacte dans les tables : diviseur ≥ 2, quotient ≥ 2, dividende ≤ 100', () => {
		for (const ex of gen('math-div-partage')) {
			if (ex.type !== 'text') throw new Error('attendu text');
			const rep = Number(ex.answer);
			expect(Number.isInteger(rep)).toBe(true);
			expect(rep).toBeGreaterThanOrEqual(2);
			expect(rep).toBeLessThanOrEqual(10);
			const total = ints(ex.question)[0]; // le dividende = 1er nombre de l'énoncé
			expect(total).toBeLessThanOrEqual(100);
			expect(total % rep).toBe(0); // reste nul
			expect(total / rep).toBeGreaterThanOrEqual(2); // le co-facteur ≥ 2 aussi
		}
	});

	it('le signe ÷ n’apparaît jamais seul (toujours une phrase de situation avant)', () => {
		for (const ex of gen('math-div-partage')) {
			if (ex.type !== 'text') continue;
			if (ex.question.includes('÷')) {
				// une phrase décrit la situation avant l'écriture ÷
				expect(/^On (partage|range) /.test(ex.question)).toBe(true);
				const m = /(\d+) ÷ (\d+) = @$/.exec(ex.question)!;
				expect(Number(m[1]) % Number(m[2])).toBe(0);
				expect(Number(ex.answer)).toBe(Number(m[1]) / Number(m[2]));
			}
		}
	});

	it('les deux sens sont contrastés (partage « en … chaque » / groupement « par paquets de »)', () => {
		const items = gen('math-div-partage').filter((e) => e.type === 'text');
		const partage = items.filter((e: any) => e.question.startsWith('On partage'));
		const groupement = items.filter((e: any) => e.question.startsWith('On range'));
		expect(partage.length).toBeGreaterThan(0);
		expect(groupement.length).toBeGreaterThan(0);
		for (const e of groupement) expect((e as any).question).toContain('par paquets de');
	});

	it('figure de découverte : uniquement en partage et pour un petit total (≤ 12)', () => {
		const items = gen('math-div-partage');
		// La figure DOIT apparaître parfois (sinon le déclencheur est cassé).
		expect(items.some((e) => e.type === 'text' && Boolean(e.figure))).toBe(true);
		for (const ex of items) {
			if (ex.type === 'text' && ex.figure) {
				expect(ex.question.startsWith('On partage')).toBe(true);
				expect(ints(ex.question)[0]).toBeLessThanOrEqual(12);
			}
		}
	});

	it('exclusion du sprint : « Je partage » exclue, « Moitié et quart » éligible', () => {
		const partage = DIVISION_LESSONS.find((l) => l.id === 'math-div-partage')!;
		const moitie = DIVISION_LESSONS.find((l) => l.id === 'math-div-moitie-quart')!;
		expect(partage.excludeFromSprint).toBe(true);
		expect(moitie.excludeFromSprint).toBeFalsy();
	});
});

describe('Je découvre le reste (#95)', () => {
	const lesson = DIVISION_LESSONS.find((l) => l.id === 'math-div-reste')!;
	const genReste = (mode: string, n = TIRAGES) =>
		Array.from({ length: n }, () => lesson.exerciseType.generate({ mode }));

	it('expose deux modes : saisie (conseillé) puis QCM', () => {
		const ids = lesson.exerciseType.modes?.map((m) => m.id) ?? [];
		expect(ids).toEqual(['saisie', 'qcm']);
		expect(lesson.exerciseType.modes?.find((m) => m.recommended)?.id).toBe('saisie');
	});

	it('est exclue du sprint (deux champs + énoncé + figure)', () => {
		expect(lesson.excludeFromSprint).toBe(true);
	});

	describe('mode saisie (problème à deux sous-questions)', () => {
		const items = genReste('saisie');

		it('invariants euclidiens : total = diviseur × quotient + reste, reste < diviseur, bornes CE2', () => {
			for (const ex of items) {
				if (ex.type !== 'probleme') throw new Error('attendu probleme');
				expect(ex.etapes).toHaveLength(2);
				const quotient = ex.etapes[0].answer;
				const reste = ex.etapes[1].answer;
				const [total, diviseur] = ints(ex.enonce);
				expect(Number.isInteger(quotient)).toBe(true);
				expect(Number.isInteger(reste)).toBe(true);
				expect(diviseur).toBeGreaterThanOrEqual(2);
				expect(diviseur).toBeLessThanOrEqual(9);
				expect(quotient).toBeGreaterThanOrEqual(2);
				expect(quotient).toBeLessThanOrEqual(9);
				expect(reste).toBeGreaterThanOrEqual(0);
				expect(reste).toBeLessThan(diviseur); // invariant clé du reste
				expect(total).toBeLessThanOrEqual(81);
				expect(total).toBe(diviseur * quotient + reste);
			}
		});

		it('mélange des restes nuls et non nuls (≈ 1/3 de restes nuls, jamais marginal)', () => {
			const nuls = items.filter((e) => e.type === 'probleme' && e.etapes[1].answer === 0).length;
			const part = nuls / items.length;
			expect(nuls).toBeGreaterThan(0);
			expect(items.length - nuls).toBeGreaterThan(0);
			expect(part).toBeGreaterThan(0.15);
			expect(part).toBeLessThan(0.55);
		});

		it('les deux sens sont contrastés (partage / groupement « par paquets de »)', () => {
			const partage = items.filter(
				(e) => e.type === 'probleme' && e.enonce.startsWith('On partage'),
			);
			const groupement = items.filter(
				(e) => e.type === 'probleme' && e.enonce.startsWith('On range'),
			);
			expect(partage.length).toBeGreaterThan(0);
			expect(groupement.length).toBeGreaterThan(0);
			for (const e of groupement) {
				if (e.type === 'probleme') expect(e.enonce).toContain('par paquets de');
			}
		});

		it('le signe ÷ n’apparaît jamais seul (mix avec/sans signe, situation toujours avant)', () => {
			const avecSigne = items.filter((e) => e.type === 'probleme' && e.enonce.includes('÷'));
			const sansSigne = items.filter((e) => e.type === 'probleme' && !e.enonce.includes('÷'));
			expect(avecSigne.length).toBeGreaterThan(0);
			expect(sansSigne.length).toBeGreaterThan(0);
			for (const e of avecSigne) {
				if (e.type === 'probleme') expect(/^On (partage|range) /.test(e.enonce)).toBe(true);
			}
		});

		it('figure de découverte : uniquement en partage et pour un petit total (≤ 12)', () => {
			expect(items.some((e) => e.type === 'probleme' && Boolean(e.figure))).toBe(true);
			for (const ex of items) {
				if (ex.type === 'probleme' && ex.figure) {
					expect(ex.enonce.startsWith('On partage')).toBe(true);
					expect(ints(ex.enonce)[0]).toBeLessThanOrEqual(12);
				}
			}
		});

		it('chaque sous-question a son intitulé ; l’énoncé parlé reformule la situation (sans symbole)', () => {
			for (const ex of items) {
				if (ex.type !== 'probleme') continue;
				expect(ex.etapes[0].question.length).toBeGreaterThan(0);
				expect(ex.etapes[1].question.toLowerCase()).toContain('reste');
				expect(/^On (partage|range) /.test(ex.parle)).toBe(true);
				expect(ex.parle).not.toContain('÷'); // le TTS épelle la situation, pas le symbole
			}
		});
	});

	describe('mode QCM', () => {
		const items = genReste('qcm');

		it('produit 4 choix uniques contenant la bonne réponse, au format « q et il reste r »', () => {
			for (const ex of items) {
				if (ex.type !== 'qcm') throw new Error('attendu qcm');
				expect(ex.choices).toHaveLength(4);
				expect(new Set(ex.choices).size).toBe(4);
				expect(ex.choices).toContain(ex.answer);
				expect(/^\d+ et il reste \d+$/.test(ex.answer)).toBe(true);
			}
		});

		it('la bonne réponse respecte l’invariant euclidien (reste < diviseur, total cohérent)', () => {
			for (const ex of items) {
				if (ex.type !== 'qcm') continue;
				const [total, diviseur] = ints(ex.question);
				const m = /^(\d+) et il reste (\d+)$/.exec(ex.answer)!;
				const quotient = Number(m[1]);
				const reste = Number(m[2]);
				expect(reste).toBeLessThan(diviseur);
				expect(total).toBe(diviseur * quotient + reste);
			}
		});
	});
});

/* ============================================================
   Division euclidienne — quotient et reste (CM1, #251)
   Leçon SŒUR du CE2 « Je découvre le reste » mais registre ABSTRAIT-NUMÉRIQUE :
   on entraîne le RÉSULTAT de la division euclidienne (quotient ET reste) en calcul
   réfléchi. Attendus dérivés de la définition d'Euclide (dividende = d·q + r,
   0 ≤ r < d) et du cadrage #251 (diviseur 2–9, dividende à 2 chiffres, quotient
   qui PEUT dépasser 9), pas des constantes du code. Pas de DOM.
   Piège #251 : `exerciseType.check` renvoie TOUJOURS false pour un item `probleme`
   (correction champ par champ dans le runner) → aucun test de check en saisie ;
   check n'est exercé qu'en QCM.
   ============================================================ */
describe('Division euclidienne — quotient et reste (CM1, #251)', () => {
	const lesson = getLessonById('math-division-euclidienne')!;
	const genEucl = (mode: string, n = TIRAGES) =>
		Array.from({ length: n }, () => lesson.exerciseType.generate({ mode }));

	describe('câblage catalogue', () => {
		it('leçon CM1-only, rattachée au calcul mental, hors sprint', () => {
			expect(lesson).toBeDefined();
			expect(lesson.category).toBe('math-calcul-mental');
			expect(lesson.levels).toEqual(['cm1']);
			expect(lesson.exerciseType.levels).toEqual(['cm1']);
			expect(lesson.excludeFromSprint).toBe(true);
		});

		it('surfacée au calcul mental (tous niveaux), ABSENTE du calcul mental CE2', () => {
			const tous = getLessonsByCategory('math-calcul-mental').map((l) => l.id);
			const ce2 = getLessonsByCategory('math-calcul-mental', 'ce2').map((l) => l.id);
			const cm1 = getLessonsByCategory('math-calcul-mental', 'cm1').map((l) => l.id);
			expect(tous).toContain('math-division-euclidienne');
			expect(ce2).not.toContain('math-division-euclidienne');
			expect(cm1).toContain('math-division-euclidienne');
			// La sœur CE2 reste, elle, disponible au CE2 (leçon distincte, non fusionnée).
			expect(ce2).toContain('math-div-reste');
		});

		it('deux modes : saisie (recommandé) puis QCM ; classée « problème »', () => {
			const ids = lesson.exerciseType.modes?.map((m) => m.id) ?? [];
			expect(ids).toEqual(['saisie', 'qcm']);
			expect(lesson.exerciseType.modes?.find((m) => m.recommended)?.id).toBe('saisie');
			expect(isProblemeLesson(lesson)).toBe(true);
		});
	});

	describe('mode saisie (problème à deux sous-questions)', () => {
		const items = genEucl('saisie');

		it('invariants euclidiens : type probleme, 2 étapes, d ∈ [2,9], dividende à 2 chiffres, 0 ≤ r < d, d·q + r', () => {
			for (const ex of items) {
				if (ex.type !== 'probleme') throw new Error('attendu probleme');
				expect(ex.etapes).toHaveLength(2);
				const quotient = ex.etapes[0].answer;
				const reste = ex.etapes[1].answer;
				const [dividende, diviseur] = ints(ex.enonce); // 1er nombre = dividende, 2e = diviseur
				expect(Number.isInteger(quotient)).toBe(true);
				expect(Number.isInteger(reste)).toBe(true);
				// Diviseur : tables, 2 à 9.
				expect(diviseur).toBeGreaterThanOrEqual(2);
				expect(diviseur).toBeLessThanOrEqual(9);
				// Dividende EXACTEMENT à 2 chiffres (jamais 1 ni 3 = territoire du posé).
				expect(dividende).toBeGreaterThanOrEqual(10);
				expect(dividende).toBeLessThanOrEqual(99);
				// Quotient au moins 2 (une division qui « tourne »).
				expect(quotient).toBeGreaterThanOrEqual(2);
				// Invariant clé du reste : 0 ≤ r < diviseur (strict).
				expect(reste).toBeGreaterThanOrEqual(0);
				expect(reste).toBeLessThan(diviseur);
				// Identité d'Euclide reconstruite indépendamment (dérivée, pas copiée).
				expect(dividende).toBe(diviseur * quotient + reste);
			}
		});

		it('marqueur CM1 : le quotient peut dépasser 9 (les DEUX cas < 10 et ≥ 10 présents)', () => {
			const quotients = items.map((e) => (e.type === 'probleme' ? e.etapes[0].answer : NaN));
			const petits = quotients.filter((q) => q < 10).length;
			const grands = quotients.filter((q) => q >= 10).length;
			expect(petits).toBeGreaterThan(0); // pas exclusivement à 2 chiffres
			expect(grands).toBeGreaterThan(0); // le quotient à 2 chiffres existe bel et bien (≠ CE2)
			// Ni marginal ni ultra-dominant : bornes larges (tirage aléatoire ~40 % forcés).
			const part = grands / quotients.length;
			expect(part).toBeGreaterThan(0.1);
			expect(part).toBeLessThan(0.9);
		});

		it('mélange des restes nuls et non nuls (≈ 1/3 de restes nuls, jamais marginal)', () => {
			const nuls = items.filter((e) => e.type === 'probleme' && e.etapes[1].answer === 0).length;
			const part = nuls / items.length;
			expect(nuls).toBeGreaterThan(0);
			expect(items.length - nuls).toBeGreaterThan(0);
			expect(part).toBeGreaterThan(0.15);
			expect(part).toBeLessThan(0.55);
		});

		it('couvre le reste-frontière r = diviseur − 1', () => {
			const frontiere = items.some(
				(e) => e.type === 'probleme' && e.etapes[1].answer === ints(e.enonce)[1] - 1,
			);
			expect(frontiere).toBe(true);
		});

		it('les trois formes d’énoncé apparaissent, et chaque item n’en est QUE une', () => {
			let combienDeFois = 0;
			let egalite = 0;
			let contexte = 0;
			for (const ex of items) {
				if (ex.type !== 'probleme') continue;
				const f1 = /combien de fois/.test(ex.enonce);
				const f2 = /Complète l'égalité/.test(ex.enonce);
				const f3 = /boîtes de/.test(ex.enonce);
				// Formes mutuellement exclusives : exactement une reconnue par énoncé.
				expect(Number(f1) + Number(f2) + Number(f3)).toBe(1);
				if (f1) combienDeFois++;
				if (f2) egalite++;
				if (f3) contexte++;
			}
			expect(combienDeFois).toBeGreaterThan(0);
			expect(egalite).toBeGreaterThan(0);
			expect(contexte).toBeGreaterThan(0);
		});

		it('forme « contexte » : l’objet de l’énoncé == l’objet du libellé du reste (pas de divergence)', () => {
			const contextes = items.filter((e) => e.type === 'probleme' && /boîtes de/.test(e.enonce));
			expect(contextes.length).toBeGreaterThan(0);
			for (const ex of contextes) {
				if (ex.type !== 'probleme') continue;
				const m = /^On range \d+ (.+?) dans des boîtes de \d+\.$/.exec(ex.enonce);
				expect(m).not.toBeNull();
				const objet = m![1];
				// La 2e sous-question nomme le MÊME objet (« Combien de <objet> restants ? »).
				expect(ex.etapes[1].question).toContain(objet);
			}
		});
	});

	describe('mode QCM (variante accessible)', () => {
		const items = genEucl('qcm');

		it('type qcm : 4 choix distincts, contiennent la bonne réponse, format « q et il reste r »', () => {
			for (const ex of items) {
				if (ex.type !== 'qcm') throw new Error('attendu qcm');
				expect(ex.choices).toHaveLength(4);
				expect(new Set(ex.choices).size).toBe(4);
				expect(ex.choices).toContain(ex.answer);
				for (const c of ex.choices) expect(/^\d+ et il reste \d+$/.test(c)).toBe(true);
			}
		});

		it('la bonne réponse encode (q, r) cohérents : dividende = d·q + r, r < d', () => {
			for (const ex of items) {
				if (ex.type !== 'qcm') continue;
				const [dividende, diviseur] = ints(ex.question);
				const m = /^(\d+) et il reste (\d+)$/.exec(ex.answer)!;
				const quotient = Number(m[1]);
				const reste = Number(m[2]);
				expect(reste).toBeLessThan(diviseur);
				expect(dividende).toBe(diviseur * quotient + reste);
			}
		});

		it('piège « reste ≥ diviseur » SYSTÉMATIQUEMENT présent (q−1 et il reste r+d)', () => {
			for (const ex of items) {
				if (ex.type !== 'qcm') continue;
				const [, diviseur] = ints(ex.question);
				const m = /^(\d+) et il reste (\d+)$/.exec(ex.answer)!;
				const quotient = Number(m[1]);
				const reste = Number(m[2]);
				// Erreur cible : l'enfant qui aurait pu continuer à diviser (reste ≥ diviseur).
				const piege = `${quotient - 1} et il reste ${reste + diviseur}`;
				expect(ex.choices).toContain(piege);
				// Le piège reste un LEURRE valide : distinct de la bonne réponse.
				expect(piege).not.toBe(ex.answer);
			}
		});

		it('cas-limites couverts par l’échantillon : quotient = 2 (piège → q−1 = 1) et reste = 0', () => {
			const parse = (a: string) => {
				const m = /^(\d+) et il reste (\d+)$/.exec(a)!;
				return { q: Number(m[1]), r: Number(m[2]) };
			};
			const qcm = items.filter((e): e is Extract<typeof e, { type: 'qcm' }> => e.type === 'qcm');
			expect(qcm.some((e) => parse(e.answer).q === 2)).toBe(true);
			expect(qcm.some((e) => parse(e.answer).r === 0)).toBe(true);
		});

		it('check() valide la bonne réponse et rejette un mauvais choix', () => {
			for (const ex of items.slice(0, 50)) {
				if (ex.type !== 'qcm') continue;
				expect(lesson.exerciseType.check(ex, ex.answer)).toBe(true);
				const mauvais = ex.choices.find((c) => c !== ex.answer)!;
				expect(lesson.exerciseType.check(ex, mauvais)).toBe(false);
			}
		});
	});

	describe('déterminisme du tirage', () => {
		it('à graine fixée, saisie et QCM sont reproductibles', () => {
			for (const mode of ['saisie', 'qcm']) {
				const a = withSeed(20251016, () => lesson.exerciseType.generate({ mode }));
				const b = withSeed(20251016, () => lesson.exerciseType.generate({ mode }));
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}
			// Graines différentes → items (au moins parfois) différents : le tirage varie vraiment.
			const s1 = withSeed(1, () => lesson.exerciseType.generate({ mode: 'saisie' }));
			const s2 = withSeed(2, () => lesson.exerciseType.generate({ mode: 'saisie' }));
			expect(JSON.stringify(s1)).not.toBe(JSON.stringify(s2));
		});
	});
});

describe('renderGroupes (figure de partage)', () => {
	it('dessine autant de paniers que demandé et le bon nombre de jetons', () => {
		const svg = renderFigure({ kind: 'groupes', paniers: 3, total: 12 });
		expect(svg).toContain('<svg');
		expect(svg.match(/<polygon/g)?.length).toBe(3); // 3 paniers
		expect(svg.match(/<circle/g)?.length).toBe(12); // 12 jetons
	});
});
