/* ============================================================
   Intercalation CE2 (#446) — logique pure.
   La leçon « J'encadre et j'intercale » (num-encadrer-intercaler) mélange, au CE2,
   des ENCADREMENTS (réponse unique) et des INTERCALATIONS à ÉCARTS VARIÉS corrigées
   PAR INTERVALLE OUVERT (a < x < b, bornes exclues, comme le veut la relation d'ordre
   du programme). On éprouve, en dérivant les attendus du contrat #446 (jamais recopiés
   du code) :
   - les 3 paliers d'écart (serré 2-4, moyen 6-30, large 100-900) et les bornes dures
     du tirage, par échantillonnage large (façon « bornes dures » du pattern maison) ;
   - la présence SYSTÉMATIQUE de l'intervalle et l'exemple strictement interne ;
   - le CŒUR anti-régression : le round-trip RÉEL de l'appli genLessonItem →
     checkItemAnswer accepte une valeur intermédiaire ≠ l'exemple et rejette les bornes
     (l'intervalle doit être câblé jusqu'à checkItemAnswer, pas seulement dans
     ExerciseType.check qui n'est pas appelé en jeu réel) ;
   - le mode tuiles (bonne réponse interne + borne-piège + valeur hors intervalle) ;
   - le déterminisme (withSeed) et la NON-RÉGRESSION des autres corrections.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';

const LESSON_ID = 'num-encadrer-intercaler';
// Début d'énoncé de l'intercalation (contrat #446) — distingue l'intercalation des
// encadrements « … juste avant/après … » de la même leçon, sans lire `intervalle`.
const INTERCALER = 'Place un nombre entre';

function lecon() {
	const l = getLessonById(LESSON_ID);
	if (!l) throw new Error(`leçon ${LESSON_ID} absente du catalogue`);
	return l;
}

/* Un exercice 'text' d'intercalation (mode saisie), identifié par son énoncé. On NE lit
   PAS `intervalle` ici pour ne pas rendre circulaires les tests qui l'éprouvent. */
function genIntercalation(level: 'ce2' | 'cm1'): Extract<Exercise, { type: 'text' }> | null {
	const ex = lecon().exerciseType.generate({ level });
	if (ex.type !== 'text' || !ex.question.startsWith(INTERCALER)) return null;
	return ex;
}

/* Bornes A, B lues dans l'énoncé « Place un nombre entre A et B … ». Au CE2 les nombres
   restent < 10 000 → écrits sans séparateur (formatNombre), parsing direct et exact. */
function bornesCe2(question: string): [number, number] {
	const m = question.match(/entre (\d+) et (\d+)/);
	if (!m) throw new Error(`énoncé d'intercalation inattendu : ${question}`);
	return [Number(m[1]), Number(m[2])];
}

describe('Intercalation CE2 — écarts variés et bornes du tirage (#446)', () => {
	it('les 3 paliers apparaissent et l’écart tombe toujours dans une bande autorisée', () => {
		let serre = 0;
		let moyen = 0;
		let large = 0;
		let total = 0;
		for (let i = 0; i < 4000; i++) {
			const ex = genIntercalation('ce2');
			if (!ex) continue;
			total++;
			const [a, b] = bornesCe2(ex.question);
			const ecart = b - a;
			// A < B ; borne basse ≥ 100 (place laissée) ; borne haute ≤ 999 (plafond 3 chiffres).
			expect(a).toBeLessThan(b);
			expect(a).toBeGreaterThanOrEqual(100);
			expect(b).toBeLessThanOrEqual(999);
			// Jamais un écart de 1 ni > 900 ; toujours l'une des 3 bandes du programme.
			expect(ecart).toBeGreaterThanOrEqual(2);
			expect(ecart).toBeLessThanOrEqual(900);
			const bande =
				ecart >= 2 && ecart <= 4
					? 'serre'
					: ecart >= 6 && ecart <= 30
						? 'moyen'
						: ecart >= 100 && ecart <= 900
							? 'large'
							: 'hors';
			// Jamais un écart « entre-deux-bandes » (5, ou 31..99).
			expect(bande).not.toBe('hors');
			if (bande === 'serre') serre++;
			else if (bande === 'moyen') moyen++;
			else large++;
		}
		// L'intercalation est bien tirée dans la leçon mixte (≈ 40 %).
		expect(total).toBeGreaterThan(200);
		// Au moins un tirage de CHAQUE palier sur l'échantillon large.
		expect(serre).toBeGreaterThan(0);
		expect(moyen).toBeGreaterThan(0);
		expect(large).toBeGreaterThan(0);
	});
});

describe('Intervalle ouvert et exemple interne (#446)', () => {
	it('chaque intercalation porte un intervalle [A,B] et un exemple strictement dedans', () => {
		let vus = 0;
		for (let i = 0; i < 3000; i++) {
			const ex = genIntercalation('ce2');
			if (!ex) continue;
			vus++;
			// Contrairement à l'ancien comportement (réponse unique, sans intervalle), il est
			// désormais TOUJOURS présent pour l'intercalation.
			expect(ex.intervalle).toBeDefined();
			const [a, b] = ex.intervalle!;
			// L'intervalle correspond bien aux bornes affichées dans l'énoncé.
			expect([a, b]).toEqual(bornesCe2(ex.question));
			// L'exemple (`answer`) est un entier STRICTEMENT à l'intérieur de ]A ; B[.
			const exemple = Number(ex.answer);
			expect(Number.isInteger(exemple)).toBe(true);
			expect(exemple).toBeGreaterThan(a);
			expect(exemple).toBeLessThan(b);
		}
		expect(vus).toBeGreaterThan(100);
	});
});

describe('Round-trip RÉEL genLessonItem → checkItemAnswer (#446, cœur)', () => {
	it('accepte une valeur intermédiaire (≠ exemple), rejette les bornes A et B', () => {
		let items = 0;
		// Items où l'on éprouve une valeur INTERNE distincte de l'exemple : la vraie garde
		// anti-régression (si l'intervalle n'était pas honoré, seul `answer` passerait).
		let discriminants = 0;
		for (let i = 0; i < 3000; i++) {
			const it = genLessonItem(lecon(), 'ce2');
			if (!it.text.startsWith(INTERCALER)) continue;
			items++;
			// Item NUMÉRIQUE : checkItemAnswer emprunte le chemin intervalle, pas la branche
			// texte (qui court-circuiterait la correction par appartenance).
			expect(it.kind).toBe('num');
			// L'intervalle a bien été CÂBLÉ jusqu'à l'Item.
			expect(it.intervalle).toBeDefined();
			const [a, b] = it.intervalle!;
			const exemple = Number(it.answer);
			// L'exemple révélé est accepté.
			expect(checkItemAnswer(it, String(it.answer))).toBe(true);
			// Bornes (intervalle OUVERT) refusées, ainsi que le juste-dehors (A-1, B+1).
			expect(checkItemAnswer(it, String(a))).toBe(false);
			expect(checkItemAnswer(it, String(b))).toBe(false);
			expect(checkItemAnswer(it, String(a - 1))).toBe(false);
			expect(checkItemAnswer(it, String(b + 1))).toBe(false);
			// Dès qu'il existe ≥ 2 valeurs internes (écart ≥ 3) : une AUTRE que l'exemple
			// doit être acceptée (tolérant aux espaces, comme la saisie réelle).
			if (b - a >= 3) {
				const autre = a + 1 !== exemple ? a + 1 : a + 2;
				expect(autre).toBeGreaterThan(a);
				expect(autre).toBeLessThan(b);
				expect(autre).not.toBe(exemple);
				expect(checkItemAnswer(it, String(autre))).toBe(true);
				expect(checkItemAnswer(it, ` ${autre} `)).toBe(true);
				discriminants++;
			}
		}
		expect(items).toBeGreaterThan(100);
		expect(discriminants).toBeGreaterThan(0);
	});
});

describe('Mode tuiles — bonne réponse, borne-piège, hors-intervalle (#446)', () => {
	it('tuiles = exemple interne + au moins une borne + au moins une valeur hors intervalle', () => {
		let vus = 0;
		for (let i = 0; i < 3000; i++) {
			const ex = lecon().exerciseType.generate({ level: 'ce2', mode: 'tuiles' });
			if (ex.type !== 'tuilesNombre' || !ex.question.startsWith(INTERCALER)) continue;
			vus++;
			const [a, b] = bornesCe2(ex.question);
			const vals = ex.tuiles.map((t) => Number(t));
			// 3 à 4 tuiles, toutes DISTINCTES, toutes de VRAIES valeurs (entiers > 0).
			expect(ex.tuiles.length).toBeGreaterThanOrEqual(3);
			expect(ex.tuiles.length).toBeLessThanOrEqual(4);
			expect(new Set(ex.tuiles).size).toBe(ex.tuiles.length);
			for (const v of vals) {
				expect(Number.isInteger(v)).toBe(true);
				expect(v).toBeGreaterThan(0);
			}
			// La bonne tuile (answer) est présente ET strictement dans ]A ; B[.
			expect(ex.tuiles).toContain(ex.answer);
			const bonne = Number(ex.answer);
			expect(bonne).toBeGreaterThan(a);
			expect(bonne).toBeLessThan(b);
			// Piège de l'intervalle OUVERT : au moins une borne (A ou B) figure parmi les tuiles.
			expect(vals.some((v) => v === a || v === b)).toBe(true);
			// … et au moins une valeur STRICTEMENT hors de l'intervalle.
			expect(vals.some((v) => v < a || v > b)).toBe(true);
		}
		expect(vus).toBeGreaterThan(100);
	});
});

describe('Déterminisme du tirage (withSeed) (#446)', () => {
	const empreinte = () => {
		const it = genLessonItem(lecon(), 'ce2');
		return JSON.stringify([it.text, it.answer, it.intervalle ?? null, it.kind]);
	};

	it('deux générations de MÊME graine sont identiques', () => {
		expect(withSeed(20240446, empreinte)).toBe(withSeed(20240446, empreinte));
		expect(withSeed(7, empreinte)).toBe(withSeed(7, empreinte));
	});

	it('générateur non figé : des graines variées produisent des énoncés variés', () => {
		const distinctes = new Set(Array.from({ length: 60 }, (_, s) => withSeed(s, empreinte)));
		expect(distinctes.size).toBeGreaterThan(5);
	});
});

describe('Non-régression : correction par réponse unique ailleurs (#446)', () => {
	it('num-comparer : réponse = signe, jamais d’intervalle, correction stricte', () => {
		const cmp = getLessonById('num-comparer');
		expect(cmp).toBeDefined();
		for (let i = 0; i < 500; i++) {
			const it = genLessonItem(cmp!, 'ce2');
			expect(it.intervalle).toBeUndefined();
			expect(['<', '=', '>']).toContain(String(it.answer));
			expect(checkItemAnswer(it, String(it.answer))).toBe(true);
			const faux = String(it.answer) === '=' ? '<' : '=';
			expect(checkItemAnswer(it, faux)).toBe(false);
		}
	});

	it('num-encadrer-intercaler : les ENCADREMENTS gardent une réponse unique (sans intervalle)', () => {
		let vus = 0;
		for (let i = 0; i < 3000; i++) {
			const it = genLessonItem(lecon(), 'ce2');
			if (it.text.startsWith(INTERCALER)) continue; // écarte les intercalations
			if (!/juste (avant|après)/.test(it.text)) continue; // ne garde que les encadrements
			vus++;
			expect(it.intervalle).toBeUndefined();
			const ans = Number(it.answer);
			expect(checkItemAnswer(it, String(ans))).toBe(true);
			// Correction STRICTE (réponse unique) : le voisin immédiat est refusé.
			expect(checkItemAnswer(it, String(ans + 1))).toBe(false);
		}
		expect(vus).toBeGreaterThan(50);
	});

	it('CM1 intercaleFactGrand : intervalle conservé, bornes refusées via checkItemAnswer', () => {
		let vus = 0;
		for (let i = 0; i < 3000 && vus < 40; i++) {
			const it = genLessonItem(lecon(), 'cm1');
			if (!it.text.startsWith(INTERCALER) || !it.intervalle) continue;
			vus++;
			const [a, b] = it.intervalle;
			expect(b).toBeGreaterThan(a + 1); // vrai intervalle (plusieurs valeurs internes)
			expect(checkItemAnswer(it, String(it.answer))).toBe(true);
			expect(checkItemAnswer(it, String(a))).toBe(false);
			expect(checkItemAnswer(it, String(b))).toBe(false);
			expect(checkItemAnswer(it, String(a + 1))).toBe(true);
		}
		expect(vus).toBeGreaterThan(0);
	});
});
