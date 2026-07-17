/* ============================================================
   Grandeurs et mesures — grandes unités de TEMPS au CM1 (#252)
   Nouvelles conversions de la leçon `mes-durees` au niveau CM1 : siècle↔an (×100),
   an↔mois (×12), semaine↔jour (×7), jour↔h (×24). On ne retient que des relations
   EXACTES ; les unités-MOTS sont accordées au pluriel, les unités-SYMBOLES jamais.

   Auteur des tests ≠ auteur du code : chaque attendu est RECALCULÉ depuis l'énoncé
   (facteur de la relation, sens de conversion, accord grammatical), pas relu de la
   valeur stockée. Sans DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById } from '../src/core/catalog';
import type { Exercise } from '../src/core/exercise';

const type = getLessonById('mes-durees')!.exerciseType;
const N = 3000;
const cm1 = Array.from({ length: N }, () => type.generate({ level: 'cm1' }));
const ce2 = Array.from({ length: N }, () => type.generate({ level: 'ce2' }));

/* ---------- Relations de temps (dérivées du programme, pas du code) ---------- */
interface Rel {
	big: string;
	small: string;
	factor: number;
}
const RELATIONS: Rel[] = [
	{ big: 'h', small: 'min', factor: 60 },
	{ big: 'min', small: 's', factor: 60 },
	{ big: 'siècle', small: 'an', factor: 100 },
	{ big: 'an', small: 'mois', factor: 12 },
	{ big: 'semaine', small: 'jour', factor: 7 },
	{ big: 'jour', small: 'h', factor: 24 },
];
const relOf = (u1: string, u2: string): Rel | undefined =>
	RELATIONS.find((r) => (r.big === u1 && r.small === u2) || (r.big === u2 && r.small === u1));

/* Unité affichée → forme singulière (identifie la famille). */
const SINGULIER: Record<string, string> = {
	siècle: 'siècle',
	siècles: 'siècle',
	an: 'an',
	ans: 'an',
	mois: 'mois',
	semaine: 'semaine',
	semaines: 'semaine',
	jour: 'jour',
	jours: 'jour',
	h: 'h',
	min: 'min',
	s: 's',
};
/* Accord attendu d'une unité SELON sa valeur (français : singulier à 0/1, pluriel dès 2).
   Les symboles (h/min/s) et « mois » sont invariables. */
const ACCORD: Record<string, { sing: string; plur: string }> = {
	siècle: { sing: 'siècle', plur: 'siècles' },
	an: { sing: 'an', plur: 'ans' },
	mois: { sing: 'mois', plur: 'mois' },
	semaine: { sing: 'semaine', plur: 'semaines' },
	jour: { sing: 'jour', plur: 'jours' },
	h: { sing: 'h', plur: 'h' },
	min: { sing: 'min', plur: 'min' },
	s: { sing: 's', plur: 's' },
};
const accordAttendu = (uniteAffichee: string, valeur: number): string => {
	const sing = SINGULIER[uniteAffichee];
	const a = ACCORD[sing];
	return valeur >= 2 ? a.plur : a.sing;
};

interface ParsedConv {
	knownValue: number;
	knownUnit: string; // unité affichée (accordée)
	answerUnit: string; // unité affichée (accordée)
}
/* Sépare une égalité « valeur unité = @ unité » (dans un sens ou l'autre). Renvoie
   null pour un « fait » mémorisé (« une demi-heure = @ min », membre gauche non chiffré). */
function parseConv(q: string): ParsedConv | null {
	const parts = q.split(' = ');
	if (parts.length !== 2) return null;
	const [lhs, rhs] = parts;
	const known = lhs.includes('@') ? rhs : lhs;
	const cible = lhs.includes('@') ? lhs : rhs;
	const mk = /^(\d+) (.+)$/.exec(known);
	const mc = /^@ (.+)$/.exec(cible);
	if (!mk || !mc) return null;
	return { knownValue: Number(mk[1]), knownUnit: mk[2], answerUnit: mc[1] };
}

const textItems = (items: Exercise[]): Array<Extract<Exercise, { type: 'text' }>> =>
	items.filter((e): e is Extract<Exercise, { type: 'text' }> => e.type === 'text');

describe('Durées CM1 (#252) — grandes unités de temps : conversions exactes', () => {
	it('toute conversion générée est exacte et la réponse stockée est juste', () => {
		let convVues = 0;
		for (const ex of textItems(cm1)) {
			const p = parseConv(ex.question);
			if (!p) continue; // fait mémorisé
			convVues++;
			const kS = SINGULIER[p.knownUnit];
			const aS = SINGULIER[p.answerUnit];
			const rel = relOf(kS, aS);
			expect(rel, `relation inconnue : ${kS}/${aS}`).toBeDefined();
			const r = rel!;
			let attendu: number;
			if (kS === r.big) {
				// grande → petite : multiplication exacte.
				attendu = p.knownValue * r.factor;
			} else {
				// petite → grande : la valeur connue est un MULTIPLE exact du facteur.
				expect(p.knownValue % r.factor).toBe(0);
				attendu = p.knownValue / r.factor;
			}
			expect(Number(ex.answer)).toBe(attendu); // réponse recalculée = réponse stockée
			expect(type.check(ex, String(ex.answer))).toBe(true); // et elle se valide
		}
		expect(convVues).toBeGreaterThan(0);
	});

	it('exemples-repères : 3 siècles = 300 ans, 100 ans = 1 siècle, 2 semaines = 14 jours, 1 jour = 24 h', () => {
		// Vérifie que le facteur codé donne bien ces égalités connues (dérivées, non lues).
		const eq = (kv: number, ku: string, au: string): number => {
			const r = relOf(SINGULIER[ku], SINGULIER[au])!;
			return SINGULIER[ku] === r.big ? kv * r.factor : kv / r.factor;
		};
		expect(eq(3, 'siècles', 'ans')).toBe(300);
		expect(eq(100, 'ans', 'siècle')).toBe(1);
		expect(eq(2, 'semaines', 'jours')).toBe(14);
		expect(eq(1, 'jour', 'h')).toBe(24);
		expect(eq(12, 'mois', 'an')).toBe(1);
	});

	it('les quatre grandes unités (siècle/an, an/mois, semaine/jour, jour/h) sont toutes tirées', () => {
		const paires = new Set<string>();
		for (const ex of textItems(cm1)) {
			const p = parseConv(ex.question);
			if (!p) continue;
			const [a, b] = [SINGULIER[p.knownUnit], SINGULIER[p.answerUnit]].sort();
			paires.add(`${a}/${b}`);
		}
		expect(paires.has('an/siècle')).toBe(true);
		expect(paires.has('an/mois')).toBe(true);
		expect(paires.has('jour/semaine')).toBe(true);
		expect(paires.has('h/jour')).toBe(true);
	});
});

describe('Durées CM1 — accord des unités', () => {
	it('chaque unité affichée est correctement accordée (pluriel dès 2, singulier à 1)', () => {
		for (const ex of textItems(cm1)) {
			const p = parseConv(ex.question);
			if (!p) continue;
			expect(p.knownUnit).toBe(accordAttendu(p.knownUnit, p.knownValue));
			expect(p.answerUnit).toBe(accordAttendu(p.answerUnit, Number(ex.answer)));
		}
	});

	it('les deux régimes d’accord sont exercés (mot au singulier à 1, au pluriel dès 2)', () => {
		let singulier = false;
		let pluriel = false;
		let moisVu = false;
		let symboleAuPluriel = false; // un symbole avec une valeur ≥ 2, resté invariable
		for (const ex of textItems(cm1)) {
			const p = parseConv(ex.question);
			if (!p) continue;
			for (const [unite, valeur] of [
				[p.knownUnit, p.knownValue],
				[p.answerUnit, Number(ex.answer)],
			] as Array<[string, number]>) {
				const sing = SINGULIER[unite];
				const estMot = ['siècle', 'an', 'semaine', 'jour'].includes(sing);
				if (estMot && valeur === 1) singulier = true;
				if (estMot && valeur >= 2) pluriel = true;
				if (sing === 'mois') moisVu = true;
				if (['h', 'min', 's'].includes(sing) && valeur >= 2) symboleAuPluriel = true;
			}
		}
		expect(singulier).toBe(true); // « 1 siècle », « 1 an »…
		expect(pluriel).toBe(true); // « 3 siècles », « 300 ans »…
		expect(moisVu).toBe(true); // « mois » invariable, apparaît
		expect(symboleAuPluriel).toBe(true); // « 24 h », « 180 s »… jamais « hs »/« ss »
	});

	it('« mois » reste invariable quelle que soit la valeur', () => {
		for (const ex of textItems(cm1)) {
			const p = parseConv(ex.question);
			if (!p) continue;
			if (SINGULIER[p.knownUnit] === 'mois') expect(p.knownUnit).toBe('mois');
			if (SINGULIER[p.answerUnit] === 'mois') expect(p.answerUnit).toBe('mois');
		}
	});

	it('les symboles (h, min, s) ne prennent JAMAIS de marque de pluriel', () => {
		for (const ex of textItems(cm1)) {
			const p = parseConv(ex.question);
			if (!p) continue;
			for (const u of [p.knownUnit, p.answerUnit]) {
				if (['h', 'min', 's'].includes(SINGULIER[u])) expect(u).toBe(SINGULIER[u]);
			}
		}
	});
});

describe('Durées CE2 — non-régression (les grandes unités sont réservées au CM1)', () => {
	it('le CE2 ne convertit que des heures et des minutes (aucune unité-mot, jamais de seconde)', () => {
		for (const ex of textItems(ce2)) {
			const p = parseConv(ex.question);
			if (!p) continue;
			expect(['h', 'min']).toContain(SINGULIER[p.knownUnit]);
			expect(['h', 'min']).toContain(SINGULIER[p.answerUnit]);
		}
	});

	it('aucun accord de pluriel ne fuite dans les autres familles (longueurs/masses/contenances)', () => {
		// Ces familles n'emploient que des SYMBOLES : la table d'accord ne doit jamais s'y appliquer.
		const motsTemps = /\b(siècles?|ans?|semaines?|jours?|mois)\b/;
		for (const id of ['mes-longueurs', 'mes-masses', 'mes-contenances']) {
			const t = getLessonById(id)!.exerciseType;
			for (const level of ['ce2', 'cm1'] as const) {
				for (let i = 0; i < 500; i++) {
					const ex = t.generate({ level });
					if (ex.type === 'text') expect(ex.question).not.toMatch(motsTemps);
				}
			}
		}
	});
});
