/* ============================================================
   Grandeurs et mesures — Calculer une DURÉE (CM1, #252)
   Logique de génération de src/data/maths/duree-ecoulee (via la leçon
   `mes-duree-ecoulee` du catalogue — les générateurs ne sont pas exportés).

   Auteur des tests ≠ auteur du code : tous les attendus sont RECALCULÉS depuis
   l'ÉNONCÉ affiché (parsing des instants / de la durée), jamais recopiés de la
   valeur stockée. Deux formes tirées au hasard :
     A « durée écoulée »  : « De 8 h 20 à 10 h 50… »  → étapes (heures, minutes) ÉCOULÉES.
     B « instant + durée » : « Il est 8 h 20. 45 min plus tard… » → étapes (heures,
        minutes) d'ARRIVÉE.

   Invariants dérivés du cadrage #252 (pas du code) :
   - minutes des deux instants multiples de 5 ; départ < arrivée ; durée ≠ 0 ;
     amplitude ≤ 4 h (240 min) ; jamais de passage de midi (arrivée ≤ 11 h 55) ;
   - la « retenue » (m_arrivée < m_départ) : les deux cas apparaissent ;
   - cohérence etapes[].answer avec l'énoncé (recalcul indépendant) ;
   - QCM : TOUJOURS exactement 4 choix UNIQUES (marge historiquement nulle) — martelé
     sur un grand échantillon ; bonne réponse dans les choix ; piège « oubli de
     retenue » (±1 h) présent quand il y a retenue ;
   - `parle` 100 % en lettres (aucun chiffre, ni « h »/« min » abrégés) ;
   - `explication` non vide ; déterminisme sous `withSeed`.
   Sans DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';

const lesson = getLessonById('mes-duree-ecoulee')!;
const type = lesson.exerciseType;

const N = 4000;
const problemes = Array.from({ length: N }, () => type.generate());
const qcms = Array.from({ length: N }, () => type.generate({ mode: 'qcm' }));

/* ---------- Mise en forme dérivée de la CONSIGNE (pas importée) ---------- */
const pad = (m: number): string => String(m).padStart(2, '0');
const fmtInstant = (h: number, m: number): string => (m === 0 ? `${h} h` : `${h} h ${pad(m)}`);
const fmtDureeReponse = (h: number, m: number): string =>
	h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${pad(m)} min`;

function parseInstant(s: string): { h: number; m: number } {
	const m = /^(\d+) h(?: (\d+))?$/.exec(s.trim());
	if (!m) throw new Error(`instant illisible : « ${s} »`);
	return { h: Number(m[1]), m: m[2] ? Number(m[2]) : 0 };
}
function parseDuree(s: string): { dh: number; dm: number } {
	const min = /^(\d+) min$/.exec(s.trim());
	if (min) return { dh: 0, dm: Number(min[1]) };
	const h = /^(\d+) h(?: (\d+))?$/.exec(s.trim());
	if (h) return { dh: Number(h[1]), dm: h[2] ? Number(h[2]) : 0 };
	throw new Error(`durée illisible : « ${s} »`);
}

interface Analyse {
	form: 'A' | 'B';
	h1: number;
	m1: number;
	h2: number;
	m2: number;
	dh: number;
	dm: number;
}
/* Reconstruit tout (instants, durée) à partir du SEUL texte affiché. */
function analyse(texte: string): Analyse {
	const a = /^De (.+?) à (.+?), combien de temps s'est écoulé \?$/.exec(texte);
	if (a) {
		const i1 = parseInstant(a[1]);
		const i2 = parseInstant(a[2]);
		const dur = i2.h * 60 + i2.m - (i1.h * 60 + i1.m);
		return {
			form: 'A',
			h1: i1.h,
			m1: i1.m,
			h2: i2.h,
			m2: i2.m,
			dh: Math.floor(dur / 60),
			dm: dur % 60,
		};
	}
	const b = /^Il est (.+?)\. (.+?) plus tard, quelle heure sera-t-il \?$/.exec(texte);
	if (b) {
		const i1 = parseInstant(b[1]);
		const d = parseDuree(b[2]);
		const arr = i1.h * 60 + i1.m + d.dh * 60 + d.dm;
		return {
			form: 'B',
			h1: i1.h,
			m1: i1.m,
			h2: Math.floor(arr / 60),
			m2: arr % 60,
			dh: d.dh,
			dm: d.dm,
		};
	}
	throw new Error(`énoncé non reconnu : « ${texte} »`);
}
const retenue = (t: Analyse): boolean => t.m2 < t.m1; // minutes d'arrivée < minutes de départ

const enonceOf = (ex: Exercise): string =>
	ex.type === 'probleme' ? ex.enonce : ex.type === 'qcm' ? ex.question : '';

describe('Durée écoulée (CM1, #252) — câblage catalogue', () => {
	it('leçon CM1-only, rangée en Grandeurs et mesures, hors sprint', () => {
		expect(lesson.subject).toBe('math');
		expect(lesson.category).toBe('math-grandeurs-mesures');
		expect(lesson.levels).toEqual(['cm1']);
		expect(lesson.excludeFromSprint).toBe(true);
	});

	it('deux modes : saisie (recommandé) puis QCM ; classée « problème »', () => {
		const ids = type.modes?.map((m) => m.id) ?? [];
		expect(ids).toEqual(['saisie', 'qcm']);
		expect(type.modes?.find((m) => m.recommended)?.id).toBe('saisie');
		expect(type.exerciseKind).toBe('probleme');
	});

	it('les deux formes (durée écoulée / instant d’arrivée) sont tirées', () => {
		const formes = new Set(problemes.map((ex) => analyse(enonceOf(ex)).form));
		expect(formes.has('A')).toBe(true);
		expect(formes.has('B')).toBe(true);
	});
});

describe('Durée écoulée — invariants du tirage (bornes dures)', () => {
	it('instants alignés sur 5 min, départ < arrivée, durée ≠ 0, amplitude ≤ 4 h, jamais après midi', () => {
		for (const ex of [...problemes, ...qcms]) {
			const t = analyse(enonceOf(ex));
			const depart = t.h1 * 60 + t.m1;
			const arrivee = t.h2 * 60 + t.m2;
			const duree = t.dh * 60 + t.dm;
			// Minutes des DEUX instants multiples de 5.
			expect(t.m1 % 5).toBe(0);
			expect(t.m2 % 5).toBe(0);
			// Départ en matinée (jamais avant 1 h), arrivée avant midi (≤ 11 h 55) : pas de
			// passage de midi ni de minuit.
			expect(depart).toBeGreaterThanOrEqual(60);
			expect(arrivee).toBeLessThanOrEqual(11 * 60 + 55);
			// Ordre strict et durée non nulle.
			expect(depart).toBeLessThan(arrivee);
			expect(duree).toBeGreaterThan(0);
			expect(duree).toBe(arrivee - depart); // cohérence interne des deux lectures
			// Amplitude ≤ 4 h.
			expect(duree).toBeLessThanOrEqual(240);
			// Les composantes de durée restent des minutes valides.
			expect(t.dm).toBeGreaterThanOrEqual(0);
			expect(t.dm).toBeLessThan(60);
		}
	});

	it('la retenue est DOSÉE : les deux cas (avec / sans) apparaissent, majorité sans retenue', () => {
		const avec = problemes.filter((ex) => retenue(analyse(enonceOf(ex)))).length;
		expect(avec).toBeGreaterThan(0);
		expect(problemes.length - avec).toBeGreaterThan(0);
		const part = avec / problemes.length;
		// Cadrage : « ~2/3 sans retenue ». Bornes larges (tirage aléatoire ~1/3 forcé).
		expect(part).toBeGreaterThan(0.1);
		expect(part).toBeLessThan(0.55);
	});
});

describe('Durée écoulée — mode saisie (problème à deux sous-questions)', () => {
	it('type probleme, 2 étapes, réponses cohérentes avec l’énoncé (recalcul indépendant)', () => {
		for (const ex of problemes) {
			if (ex.type !== 'probleme') throw new Error('attendu probleme');
			expect(ex.etapes).toHaveLength(2);
			const t = analyse(ex.enonce);
			if (t.form === 'A') {
				// Forme A : la réponse est la DURÉE écoulée (heures, puis minutes).
				expect(ex.etapes[0].answer).toBe(t.dh);
				expect(ex.etapes[1].answer).toBe(t.dm);
			} else {
				// Forme B : la réponse est l'INSTANT d'arrivée (heures, puis minutes).
				expect(ex.etapes[0].answer).toBe(t.h2);
				expect(ex.etapes[1].answer).toBe(t.m2);
			}
			expect(typeof ex.explication).toBe('string');
			expect((ex.explication ?? '').length).toBeGreaterThan(0);
		}
	});

	it('check() renvoie TOUJOURS false pour un item probleme (corrigé champ par champ par le runner)', () => {
		for (const ex of problemes.slice(0, 50)) {
			if (ex.type !== 'probleme') continue;
			// Même la BONNE réponse à une sous-question n'est pas validée par ce check générique.
			expect(type.check(ex, String(ex.etapes[0].answer))).toBe(false);
			expect(type.check(ex, String(ex.etapes[1].answer))).toBe(false);
		}
	});
});

describe('Durée écoulée — mode QCM (variante accessible)', () => {
	it('TOUJOURS exactement 4 choix UNIQUES contenant la bonne réponse', () => {
		for (const ex of qcms) {
			if (ex.type !== 'qcm') throw new Error('attendu qcm');
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4);
			expect(ex.choices).toContain(ex.answer);
		}
	});

	it('la bonne réponse est loyale à l’énoncé (durée pour A, instant d’arrivée pour B)', () => {
		for (const ex of qcms) {
			if (ex.type !== 'qcm') continue;
			const t = analyse(ex.question);
			const attendu = t.form === 'A' ? fmtDureeReponse(t.dh, t.dm) : fmtInstant(t.h2, t.m2);
			expect(ex.answer).toBe(attendu);
		}
	});

	it('piège « oubli de retenue » (±1 h) présent DÈS QU’il y a retenue', () => {
		let avecRetenueVus = 0;
		for (const ex of qcms) {
			if (ex.type !== 'qcm') continue;
			const t = analyse(ex.question);
			if (!retenue(t)) continue;
			avecRetenueVus++;
			// A : durée avec une heure de TROP ; B : arrivée avec une heure de MOINS.
			const piege = t.form === 'A' ? fmtDureeReponse(t.dh + 1, t.dm) : fmtInstant(t.h2 - 1, t.m2);
			expect(ex.choices).toContain(piege);
			expect(piege).not.toBe(ex.answer); // le piège reste un leurre distinct
		}
		expect(avecRetenueVus).toBeGreaterThan(0); // l'échantillon couvre bien la retenue
	});

	it('check() valide la bonne réponse, rejette un mauvais choix', () => {
		for (const ex of qcms.slice(0, 80)) {
			if (ex.type !== 'qcm') continue;
			expect(type.check(ex, ex.answer)).toBe(true);
			const mauvais = ex.choices.find((c) => c !== ex.answer)!;
			expect(type.check(ex, mauvais)).toBe(false);
		}
	});
});

describe('Durée écoulée — énoncé parlé (#42, 100 % en lettres)', () => {
	it('aucun chiffre, ni « h »/« min » abrégés dans `parle` (les deux formes, saisie + QCM)', () => {
		for (const ex of [...problemes, ...qcms]) {
			const parle = 'parle' in ex ? ex.parle : undefined;
			expect(typeof parle).toBe('string');
			const p = parle ?? '';
			expect(p).not.toMatch(/\d/); // aucun chiffre
			expect(p).not.toMatch(/\bh\b/); // pas de « h » abrégé (mais « heures » autorisé)
			expect(p).not.toMatch(/\bmin\b/); // pas de « min » abrégé (mais « minutes » autorisé)
		}
	});
});

describe('Durée écoulée — déterminisme du tirage', () => {
	it('à graine fixée, saisie et QCM sont reproductibles ; graines différentes → tirages différents', () => {
		for (const mode of [undefined, 'qcm']) {
			const opts = mode ? { mode } : undefined;
			const a = withSeed(20252607, () => type.generate(opts));
			const b = withSeed(20252607, () => type.generate(opts));
			expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		}
		const s1 = withSeed(1, () => type.generate());
		const s2 = withSeed(7, () => type.generate());
		expect(JSON.stringify(s1)).not.toBe(JSON.stringify(s2));
	});
});
