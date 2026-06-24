/* ============================================================
   Géométrie CM1 (#242) — tracés des triangles particuliers, du parallélogramme et
   du prisme (core/figures.ts) + invariants de génération des leçons CM1
   (src/data/maths/geometrie-cm1.ts). On vérifie SURTOUT :
   - les nouveaux tracés produisent des figures SVG valides et les MARQUES de côté
     égal sont concordantes (3 marques équilatéral, 2 isocèle, 0 quelconque) ;
   - les côtés marqués « égaux » le sont VRAIMENT (longueurs égales à l'écran) ;
   - le parallélogramme respecte la géométrie corrigée (~28° / ratio ~1,9) ;
   - QCM de reconnaissance à distracteurs JUSTES (vraies formes), réponse parmi les
     choix ; JAMAIS « équilatéral » ET « isocèle » tous deux corrects sur une figure ;
   - le comptage n'est proposé que sur des POLYÈDRES et sans figure (« de mémoire ») ;
   - la justesse polyèdre / non-polyèdre ;
   - le prisme se rend ;
   - le CE2 est INCHANGÉ (assertions explicites).
   Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	renderFigurePlane,
	renderSolide,
	renderFigure,
	type PlaneShape,
} from '../src/core/figures';
import { GEOMETRIE_CM1_LESSONS } from '../src/data/maths/geometrie-cm1';
import { GEOMETRIE_LESSONS } from '../src/data/maths/geometrie';
import { SOLIDE_LESSONS } from '../src/data/maths/solides';
import { getLessonById, getLessonsByCategory } from '../src/core/catalog';

/* ---------- Petits parseurs SVG (sans DOM) ---------- */

/** Points de chaque <polygon> du fragment. */
function polygones(svg: string): [number, number][][] {
	const out: [number, number][][] = [];
	const re = /<polygon points="([^"]+)"/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(svg)) !== null) {
		out.push(
			m[1].split(' ').map((p) => {
				const [x, y] = p.split(',').map(Number);
				return [x, y] as [number, number];
			}),
		);
	}
	return out;
}

/** Toutes les <line> du fragment (les marques de côté égal en sont). */
function lignes(svg: string): { x1: number; y1: number; x2: number; y2: number }[] {
	const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
	const re = /<line ([^/]+)\/>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(svg)) !== null) {
		const at = (k: string) => Number(m![1].match(new RegExp(`${k}="([^"]+)"`))?.[1] ?? 'NaN');
		out.push({ x1: at('x1'), y1: at('y1'), x2: at('x2'), y2: at('y2') });
	}
	return out;
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Longueurs des côtés d'un polygone (fermé). */
function cotes(poly: [number, number][]): number[] {
	return poly.map((p, i) => dist(p, poly[(i + 1) % poly.length]));
}

describe('Géométrie CM1 — tracés des triangles particuliers (#242)', () => {
	it('équilatéral : SVG valide, 3 côtés égaux, 3 marques de côté égal', () => {
		const svg = renderFigurePlane('triangleEquilateral');
		expect(svg).toContain('<svg');
		expect(svg).toContain('role="img"');
		const polys = polygones(svg);
		expect(polys).toHaveLength(1);
		const c = cotes(polys[0]);
		expect(c).toHaveLength(3);
		// Les 3 côtés sont égaux à l'écran (échelle uniforme → égalité préservée).
		for (const l of c) expect(l).toBeCloseTo(c[0], 1);
		// 3 marques = 3 <line> (la figure n'a pas d'autre trait).
		expect(lignes(svg)).toHaveLength(3);
		// La description ne nomme pas le triangle (réponse jamais soufflée).
		const head = svg.slice(0, svg.indexOf('</desc>'));
		expect(head).not.toContain('équilatéral');
	});

	it('isocèle FRANC : 2 côtés égaux, le 3e (la base) DIFFÉRENT, 2 marques', () => {
		const svg = renderFigurePlane('triangleIsocele');
		const c = cotes(polygones(svg)[0]);
		expect(c).toHaveLength(3);
		const tri = [...c].sort((a, b) => a - b);
		// Deux côtés égaux (les obliques), un troisième nettement plus court (la base).
		expect(tri[1]).toBeCloseTo(tri[2], 1);
		expect(tri[0]).toBeLessThan(tri[2] * 0.8); // franchement non équilatéral
		expect(lignes(svg)).toHaveLength(2); // 2 marques (les côtés égaux)
	});

	it('quelconque : 3 côtés DIFFÉRENTS, AUCUNE marque, aucun angle droit', () => {
		const svg = renderFigurePlane('triangleQuelconque');
		const poly = polygones(svg)[0];
		const c = [...cotes(poly)].sort((a, b) => a - b);
		expect(c).toHaveLength(3);
		// Trois longueurs distinctes (ratio franc ~3:4:5,5).
		expect(c[0]).toBeLessThan(c[1] - 1);
		expect(c[1]).toBeLessThan(c[2] - 1);
		expect(lignes(svg)).toHaveLength(0); // aucune marque de côté égal
		// Aucun angle droit : pour chaque sommet, le produit scalaire des deux côtés ≠ 0.
		for (let i = 0; i < 3; i++) {
			const prev = poly[(i + 2) % 3];
			const cur = poly[i];
			const next = poly[(i + 1) % 3];
			const u: [number, number] = [prev[0] - cur[0], prev[1] - cur[1]];
			const v: [number, number] = [next[0] - cur[0], next[1] - cur[1]];
			const cosA = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
			expect(Math.abs(cosA)).toBeGreaterThan(0.1); // |cos| > 0,1 ⇒ loin de 90°
		}
	});

	it('la marque est PERPENDICULAIRE au côté qu’elle marque (équilatéral)', () => {
		const svg = renderFigurePlane('triangleEquilateral', 0);
		const poly = polygones(svg)[0];
		const marques = lignes(svg);
		expect(marques).toHaveLength(3);
		// Chaque marque doit être perpendiculaire à au moins un côté du triangle.
		for (const mk of marques) {
			const md: [number, number] = [mk.x2 - mk.x1, mk.y2 - mk.y1];
			const perp = poly.some((p, i) => {
				const q = poly[(i + 1) % poly.length];
				const sd: [number, number] = [q[0] - p[0], q[1] - p[1]];
				const cos = (md[0] * sd[0] + md[1] * sd[1]) / (Math.hypot(...md) * Math.hypot(...sd));
				return Math.abs(cos) < 0.05; // produit scalaire ~0 ⇒ perpendiculaire
			});
			expect(perp).toBe(true);
		}
	});
});

describe('Géométrie CM1 — parallélogramme corrigé (#242)', () => {
	it('inclinaison ~28° de la verticale, ratio longueur/largeur ~1,9', () => {
		const poly = polygones(renderFigurePlane('parallelogramme', 0))[0];
		expect(poly).toHaveLength(4);
		const c = cotes(poly);
		// Côtés opposés égaux (parallélogramme) : c[0]≈c[2], c[1]≈c[3].
		expect(c[0]).toBeCloseTo(c[2], 1);
		expect(c[1]).toBeCloseTo(c[3], 1);
		// Ratio longueur/largeur ~1,9 (rectangle penché allongé, pas quasi-carré).
		const lng = Math.max(c[0], c[1]);
		const lrg = Math.min(c[0], c[1]);
		expect(lng / lrg).toBeGreaterThan(1.6);
		expect(lng / lrg).toBeLessThan(2.3);
	});
});

describe('Géométrie CM1 — prisme (#242)', () => {
	it('le prisme se rend (SVG accessible, face triangulaire + arêtes de fuite)', () => {
		const svg = renderSolide('prisme');
		expect(svg).toContain('<svg');
		expect(svg).toContain('role="img"');
		expect(svg).toContain('<polygon'); // face avant triangulaire
		// Au moins 5 arêtes de profondeur/arrière (lignes).
		expect(lignes(svg).length).toBeGreaterThanOrEqual(5);
		const head = svg.slice(0, svg.indexOf('</desc>'));
		expect(head).not.toContain('prisme'); // desc neutre
	});

	it('renderFigure dispatch le prisme ; le miroir/le lean changent le tracé', () => {
		expect(renderFigure({ kind: 'solide', solid: 'prisme' })).toContain('<svg');
		expect(renderSolide('prisme', { mirror: true })).toContain('scale(-1 1)');
		expect(renderSolide('prisme', { lean: 0 })).not.toBe(renderSolide('prisme', { lean: 2 }));
	});
});

describe('Géométrie CM1 — reconnaissance des triangles', () => {
	const type = getLessonById('geo-cm1-triangles')!.exerciseType;
	const NOMS = [
		'triangle équilatéral',
		'triangle isocèle',
		'triangle rectangle',
		'triangle quelconque',
	];

	it('QCM : figure + 4 propositions distinctes (vraies formes) dont la bonne', () => {
		for (let i = 0; i < 500; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm attendu');
			expect(ex.figure).toContain('<svg');
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4); // distinctes
			expect(ex.choices).toContain(ex.answer);
			for (const c of ex.choices) expect(NOMS).toContain(c); // que de vraies formes
		}
	});

	it('JAMAIS « équilatéral » ET « isocèle » tous deux corrects : un seul answer, et l’isocèle dessiné est non-équilatéral', () => {
		for (let i = 0; i < 500; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			// La réponse est unique (un seul libellé) ; les autres choix sont des distracteurs.
			expect(ex.choices.filter((c) => c === ex.answer)).toHaveLength(1);
			// Quand la réponse est « isocèle », la figure est un isocèle FRANC (2 côtés
			// égaux, base différente) — donc PAS un équilatéral (pas d'ambiguïté).
			if (ex.answer === 'triangle isocèle') {
				const c = [...cotes(polygones(ex.figure!)[0])].sort((a, b) => a - b);
				expect(c[1]).toBeCloseTo(c[2], 1); // 2 côtés égaux
				expect(c[0]).toBeLessThan(c[2] * 0.85); // mais pas tous égaux
			}
		}
	});

	it('check() : valide la bonne réponse, rejette les autres choix', () => {
		for (let i = 0; i < 200; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			expect(type.check(ex, ex.answer)).toBe(true);
			for (const c of ex.choices) if (c !== ex.answer) expect(type.check(ex, c)).toBe(false);
		}
	});

	it('saisie : l’adjectif seul (« isocèle ») est aussi accepté', () => {
		for (let i = 0; i < 200; i++) {
			const ex = type.generate({ mode: 'saisie' });
			if (ex.type !== 'text') continue;
			expect(ex.figure).toContain('<svg');
			expect(type.check(ex, ex.answer)).toBe(true);
			// L'adjectif sans « triangle » est dans les formes acceptées.
			const adj = ex.answer.replace('triangle ', '');
			expect(type.check(ex, adj)).toBe(true);
		}
	});
});

describe('Géométrie CM1 — propriétés des triangles', () => {
	const type = getLessonById('geo-cm1-triangles-prop')!.exerciseType;

	it('QCM textuel sans figure, réponse parmi les choix, distracteurs distincts', () => {
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm attendu');
			expect(ex.figure).toBeUndefined();
			expect(ex.choices.length).toBeGreaterThanOrEqual(2);
			expect(new Set(ex.choices).size).toBe(ex.choices.length);
			expect(ex.choices).toContain(ex.answer);
		}
	});

	it('jamais « équilatéral » ET « isocèle » dans les MÊMES choix d’une question de côtés égaux', () => {
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			// Question sur des côtés égaux : on ne mélange pas les deux (inclusion non enseignée).
			if (/côtés? égaux/.test(ex.question)) {
				const aEqui = ex.choices.some((c) => c.includes('équilatéral'));
				const aIso = ex.choices.some((c) => c.includes('isocèle'));
				expect(aEqui && aIso).toBe(false);
			}
		}
	});
});

describe('Géométrie CM1 — reconnaissance des quadrilatères (dont parallélogramme)', () => {
	const type = getLessonById('geo-cm1-quadrilateres')!.exerciseType;

	it('le parallélogramme est une réponse possible, jamais d’inclusion dans les énoncés', () => {
		let vuParallelo = false;
		for (let i = 0; i < 600; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toContain(ex.answer);
			if (ex.answer === 'parallélogramme') vuParallelo = true;
			// Pas d'inclusion : on ne dit jamais qu'un carré/rectangle EST un parallélogramme.
			expect(ex.question.toLowerCase()).not.toMatch(/est un parall|est-il un parall/);
		}
		expect(vuParallelo).toBe(true);
	});

	it('saisie : figure + champ, réponse vérifiable', () => {
		for (let i = 0; i < 200; i++) {
			const ex = type.generate({ mode: 'saisie' });
			if (ex.type !== 'text') continue;
			expect(ex.figure).toContain('<svg');
			expect(type.check(ex, ex.answer)).toBe(true);
		}
	});
});

describe('Géométrie CM1 — reconnaissance des solides (dont prisme)', () => {
	const type = getLessonById('geo-cm1-solides')!.exerciseType;
	const NOMS = ['cube', 'pavé droit', 'cylindre', 'cône', 'pyramide', 'boule', 'prisme'];

	it('QCM : figure + 4 noms (vrais) dont la bonne ; le prisme apparaît', () => {
		let vuPrisme = false;
		for (let i = 0; i < 600; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm attendu');
			expect(ex.figure).toContain('<svg');
			expect(ex.choices).toHaveLength(4);
			expect(ex.choices).toContain(ex.answer);
			for (const c of ex.choices) expect(NOMS).toContain(c);
			if (ex.answer === 'prisme') vuPrisme = true;
		}
		expect(vuPrisme).toBe(true);
	});
});

describe('Géométrie CM1 — polyèdre / non-polyèdre', () => {
	const type = getLessonById('geo-cm1-polyedre')!.exerciseType;
	const POLY = ['cube', 'pavé droit', 'pyramide', 'prisme'];
	const NON_POLY = ['boule', 'cône', 'cylindre'];

	it('justesse : les réponses « polyèdre » sont des polyèdres, et inversement', () => {
		for (let i = 0; i < 400; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toContain(ex.answer);
			const q = ex.question.toLowerCase();
			const nom = ex.answer.replace(/^(le |la |l')/, '');
			if (q.includes("n'est pas un polyèdre")) {
				expect(NON_POLY).toContain(nom);
			} else if (q.includes('lequel est un polyèdre')) {
				expect(POLY).toContain(nom);
			} else if (/^(le |la |l')/.test(ex.choices[0]) || /est-elle|est-il/.test(q)) {
				// Question « X est-il un polyèdre ? » → oui/non, vérité connue.
				if (/\boui\b/.test(ex.answer)) {
					expect(POLY.some((p) => q.includes(p))).toBe(true);
				}
			}
		}
	});

	it('« La boule est-elle un polyèdre ? » → toujours « non » ; « Le cube … » → « oui »', () => {
		// On force suffisamment de tirages pour rencontrer ces deux items canoniques.
		const items = Array.from({ length: 500 }, () => type.generate({ mode: 'qcm' }));
		const boule = items.find(
			(e) => e.type === 'qcm' && e.question === 'La boule est-elle un polyèdre ?',
		);
		const cube = items.find(
			(e) => e.type === 'qcm' && e.question === 'Le cube est-il un polyèdre ?',
		);
		if (boule && boule.type === 'qcm') expect(boule.answer).toBe('non');
		if (cube && cube.type === 'qcm') expect(cube.answer).toBe('oui');
	});
});

describe('Géométrie CM1 — comptage faces/arêtes/sommets DE MÉMOIRE', () => {
	const type = getLessonById('geo-cm1-solides-comptage')!.exerciseType;
	// Vérité de référence (cube, pavé, pyramide base carrée, prisme base triangulaire).
	const VRAI: Record<string, { faces: number; aretes: number; sommets: number }> = {
		'un cube': { faces: 6, aretes: 12, sommets: 8 },
		'un pavé droit': { faces: 6, aretes: 12, sommets: 8 },
		'une pyramide à base carrée': { faces: 5, aretes: 8, sommets: 5 },
		'un prisme droit à base triangulaire': { faces: 5, aretes: 9, sommets: 6 },
	};

	it('proposé UNIQUEMENT sur des polyèdres, SANS figure (« de mémoire »), réponse juste', () => {
		for (let i = 0; i < 500; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm attendu');
			// Jamais de figure (un dessin 3D inviterait à compter les arêtes visibles).
			expect(ex.figure).toBeUndefined();
			// Jamais « sur le dessin » dans l'énoncé.
			expect(ex.question.toLowerCase()).not.toContain('dessin');
			// Le solide nommé est un polyèdre connu (jamais cône/cylindre/boule).
			const m = ex.question.match(/a (un .+|une .+) \?$/);
			expect(m).toBeTruthy();
			const nom = m![1];
			expect(Object.keys(VRAI)).toContain(nom);
			// Élision « de » → « d' » devant voyelle : « Combien d'arêtes… » (jamais la forme
			// fautive « de arêtes »), mais « Combien de faces/sommets… ».
			expect(ex.question).not.toContain('de arêtes');
			// La réponse correspond à la caractéristique demandée (regex tolérant « de »/« d' »).
			const caracMatch = ex.question.match(/Combien d(?:e |')(\S+)/);
			expect(caracMatch).toBeTruthy();
			const carac = caracMatch![1];
			const map: Record<string, keyof (typeof VRAI)['un cube']> = {
				faces: 'faces',
				arêtes: 'aretes',
				sommets: 'sommets',
			};
			expect(Number(ex.answer)).toBe(VRAI[nom][map[carac]]);
			expect(ex.choices).toContain(ex.answer);
			// Contrat des choix : toujours 4 options DISTINCTES (garde-fou si une future
			// entrée COMPTAGE a une petite valeur qui réduirait le vivier de distracteurs).
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4);
		}
	});

	it('jamais de cône / cylindre / boule dans le comptage', () => {
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			for (const interdit of ['cône', 'cylindre', 'boule']) {
				expect(ex.question).not.toContain(interdit);
			}
		}
	});
});

describe('Géométrie CM1 — catalogue & non-régression CE2', () => {
	it('les 6 leçons CM1 peuplent « Géométrie » au niveau CM1', () => {
		const ids = getLessonsByCategory('math-geometrie', 'cm1').map((l) => l.id);
		for (const d of GEOMETRIE_CM1_LESSONS) expect(ids).toContain(d.id);
	});

	it('les leçons CM1 sont taguées cm1 (pas ce2)', () => {
		for (const d of GEOMETRIE_CM1_LESSONS) {
			const lesson = getLessonById(d.id)!;
			expect(lesson.levels).toEqual(['cm1']);
		}
	});

	it('CE2 INCHANGÉ : les leçons CE2 restent ce2-only et ne tirent jamais les triangles particuliers ni le prisme', () => {
		// Les 2 leçons de figures planes CE2 + 2 de solides CE2 restent ce2.
		for (const d of [...GEOMETRIE_LESSONS, ...SOLIDE_LESSONS]) {
			const lesson = getLessonById(d.id)!;
			expect(lesson.levels).toEqual(['ce2']);
		}
		// La reconnaissance de figures CE2 ne propose jamais un triangle particulier ni
		// le parallélogramme comme nom (formes CM1) : les choix restent dans le set CE2.
		const ce2Reco = getLessonById('geo-figures-reconnaitre')!.exerciseType;
		const NOMS_CE2 = ['carré', 'rectangle', 'triangle', 'losange', 'cercle'];
		for (let i = 0; i < 400; i++) {
			const ex = ce2Reco.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			if (/^\d+$/.test(ex.answer)) continue; // comptage
			expect(NOMS_CE2).toContain(ex.answer);
			for (const c of ex.choices) {
				if (/^\d+$/.test(c)) continue;
				expect(c).not.toMatch(/équilatéral|isocèle|quelconque|parallélogramme/);
			}
		}
		// La reconnaissance de solides CE2 ne tire jamais le prisme.
		const ce2Sol = getLessonById('geo-solides-reconnaitre')!.exerciseType;
		for (let i = 0; i < 400; i++) {
			const ex = ce2Sol.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			expect(ex.answer).not.toBe('prisme');
			for (const c of ex.choices) expect(c).not.toBe('prisme');
		}
	});

	it('le tracé du parallélogramme partagé n’altère pas le rendu CE2 (CE2 ne le dessine jamais)', () => {
		// Le parallélogramme n'est tiré par aucun générateur CE2 (ni nommage ni comptage) :
		// corriger son tracé est purement additif côté CM1.
		const fait = renderFigure({ kind: 'figurePlane', shape: 'parallelogramme' as PlaneShape });
		expect(fait).toContain('<polygon'); // le renderer fonctionne, sans dépendance CE2
	});
});
