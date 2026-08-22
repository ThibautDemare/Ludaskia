/* ============================================================
   Droite graduée — ouverture au CE2 (#447) — logique pure.
   ------------------------------------------------------------
   La leçon « je place un nombre sur la droite graduée » (num-droite-entiers) est
   désormais UNE leçon recalibrée par niveau (CE2 + CM1) ; les décimaux restent CM1.
   Le modèle de rendu (fenêtre de 10 intervalles, 3 graduations numérotées, cible sur
   une graduation MUETTE) est éprouvé pour les deux leçons dans `droite-graduee.test.ts`
   au niveau CM1 ; ici on éprouve ce qui est PROPRE au CE2, et la non-régression du CM1.

   Attendus DÉRIVÉS de l'issue #447 et du programme CE2 (nombres entiers jusqu'à
   10 000, « placer des nombres et repérer des points sur une demi-droite graduée »),
   pas de l'implémentation :
   - deux échelles SEULEMENT : fenêtre de 10 graduée en unités (bornes basses 20…990)
     et fenêtre de 100 graduée en dizaines (bornes basses 100…9 800) ;
   - entiers SEULS, jamais au-delà de 10 000 : ni fenêtre de 1 000, ni de 10 000
     (grands nombres = CM1), et aucun décimal nulle part ;
   - la cible ne tombe JAMAIS sur une graduation chiffrée (sinon l'exercice se lit au
     lieu de se compter) et reste à 4 crans au plus d'un repère chiffré.

   Échantillons DÉTERMINISTES : tout le tirage passe par `withSeed` (une graine fixe),
   donc un échec est reproductible — jamais « je relance et ça passe ».
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { nbIntervalles } from '../src/core/figures/droite';
import {
	getAllLessons,
	getLessonById,
	genLessonItem,
	isDroiteGradueeLesson,
} from '../src/core/catalog';
import type { SchoolLevel } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { lessonsForLevel } from '../src/core/levels';
import { withSeed } from '../src/core/utils';
import { parseNombreFr } from '../src/core/nombres';
import { defaultMode } from '../src/core/exercise';
import type { Exercise, ExerciseType } from '../src/core/exercise';

const ENTIERS = 'num-droite-entiers';
const DECIMAUX = 'num-droite-decimaux';

type DGEx = Extract<Exercise, { type: 'droiteGraduee' }>;

/* Narrowing utilitaire : force le variant attendu ou lève (jamais de `as`). */
function asDG(ex: Exercise): DGEx {
	if (ex.type !== 'droiteGraduee') throw new Error(`attendu droiteGraduee, reçu ${ex.type}`);
	return ex;
}

function typeDe(id: string): ExerciseType {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente : ${id}`);
	return l.exerciseType;
}

/* Échantillon reproductible d'exercices pour un niveau donné. */
function echantillon(id: string, niveau: SchoolLevel | undefined, n: number, graine = 447): DGEx[] {
	return withSeed(graine, () =>
		Array.from({ length: n }, () => asDG(typeDe(id).generate({ level: niveau }))),
	);
}

/* Toutes les graduations attendues d'une fenêtre, recalculées à la main (arithmétique
   entière exacte au CE2) — pas via le helper du renderer. */
function graduationsAttendues(ex: DGEx): number[] {
	const vals: number[] = [];
	for (let v = ex.min; v <= ex.max; v += ex.pas) vals.push(v);
	return vals;
}

/* Toutes les chaînes « visibles » d'un exercice. */
function textesDe(ex: DGEx): string[] {
	return [
		...ex.graduations.map((g) => g.label),
		...ex.bornes.map((b) => b.label),
		ex.cibleLabel,
		ex.consigne,
		ex.explication,
		ex.parle,
	];
}

/* Échelle d'un exercice, sous la forme « largeur de fenêtre / pas ». */
const echelle = (ex: DGEx): string => `${ex.max - ex.min}/${ex.pas}`;

/* =========================================================================
   1. CALIBRATION CE2
   ========================================================================= */

describe('Calibration CE2 (#447) : deux fenêtres, entiers sous 10 000', () => {
	const ce2 = echantillon(ENTIERS, 'ce2', 2400);

	it('EXACTEMENT deux échelles, et seulement celles-là : fenêtre 10 pas 1, fenêtre 100 pas 10', () => {
		// Les deux doivent réellement APPARAÎTRE (une échelle jamais tirée serait morte),
		// et aucune troisième ne doit s'y glisser (pas de fenêtre de 1 000 ni de 10 000 :
		// les grands nombres sont du CM1).
		expect(new Set(ce2.map(echelle))).toEqual(new Set(['10/1', '100/10']));
	});

	it('bornes dures : min ≥ 0, min multiple de la largeur, max ≤ 10 000, 10 intervalles', () => {
		for (const ex of ce2) {
			const largeur = ex.max - ex.min;
			expect(ex.min).toBeGreaterThanOrEqual(0);
			expect(ex.min % largeur).toBe(0); // la borne basse est un multiple ROND de la largeur
			expect(ex.max).toBe(ex.min + largeur);
			expect(ex.max).toBeLessThanOrEqual(10000); // plage du programme CE2
			// « Une dizaine d'intervalles » : la largeur vaut 10 pas, et c'est bien ce que
			// comptera le renderer (data-n) — donc 11 graduations.
			expect(largeur).toBe(10 * ex.pas);
			expect(nbIntervalles(ex.min, ex.max, ex.pas)).toBe(10);
			expect(ex.graduations).toHaveLength(11);
			expect(ex.graduations.map((g) => g.valeur)).toEqual(graduationsAttendues(ex));
		}
	});

	it('plages des bornes basses : 20…990 (fenêtre 10) et 100…9 800 (fenêtre 100)', () => {
		const minsDe = (largeur: number) =>
			ce2.filter((ex) => ex.max - ex.min === largeur).map((ex) => ex.min);
		const unites = minsDe(10);
		const dizaines = minsDe(100);
		expect(unites.length).toBeGreaterThan(100);
		expect(dizaines.length).toBeGreaterThan(100);

		// Bornes dures.
		expect(Math.min(...unites)).toBeGreaterThanOrEqual(20); // [0;10] et [10;20] écartés
		expect(Math.max(...unites)).toBeLessThanOrEqual(990);
		expect(Math.min(...dizaines)).toBeGreaterThanOrEqual(100);
		expect(Math.max(...dizaines)).toBeLessThanOrEqual(9800);

		// …et la plage est réellement PARCOURUE : une calibration coincée en haut de plage
		// (p. ex. le plancher CM1 recopié tel quel, qui démarre à 1 100) ne passerait pas.
		expect(Math.min(...unites)).toBeLessThanOrEqual(30);
		expect(Math.max(...unites)).toBeGreaterThanOrEqual(980);
		expect(Math.min(...dizaines)).toBeLessThanOrEqual(200);
		expect(Math.max(...dizaines)).toBeGreaterThanOrEqual(9700);
	});

	it('la cible tombe TOUJOURS sur une graduation muette (jamais sur une borne chiffrée)', () => {
		for (const ex of ce2) {
			const grads = graduationsAttendues(ex);
			const bornes = ex.bornes.map((b) => b.valeur);
			// 3 graduations numérotées, dans l'ORDRE min → milieu → max : le journal d'erreurs
			// et l'énoncé « la droite va de X à Y » lisent la première et la dernière.
			expect(bornes).toEqual([ex.min, (ex.min + ex.max) / 2, ex.max]);
			// La cible est une graduation…
			expect(grads).toContain(ex.cible);
			// …mais jamais une chiffrée : l'enfant compte des crans, il ne lit pas une étiquette.
			expect(bornes).not.toContain(ex.cible);
			expect([0, 5, 10]).not.toContain(grads.indexOf(ex.cible));
		}
	});

	it('l’explication compte les crans depuis le repère chiffré juste avant (1 à 4 crans)', () => {
		for (const ex of ce2) {
			const borneInf = Math.max(...ex.bornes.map((b) => b.valeur).filter((v) => v < ex.cible));
			const crans = (ex.cible - borneInf) / ex.pas;
			expect(Number.isInteger(crans)).toBe(true);
			// Borne dure du modèle : le milieu étant numéroté, on ne compte jamais plus de
			// 4 crans (au-delà, l'enfant compterait depuis la mauvaise extrémité).
			expect(crans).toBeGreaterThanOrEqual(1);
			expect(crans).toBeLessThanOrEqual(4);
			const mot = crans > 1 ? 'graduations' : 'graduation';
			expect(ex.explication).toContain(`${crans} ${mot} après ${borneInf}`);
			expect(ex.explication).toContain(`vaut ${ex.pas}`);
		}
	});

	it('aucun décimal : valeurs entières, libellés = le nombre nu, jamais de virgule', () => {
		for (const ex of ce2) {
			expect(Number.isInteger(ex.cible)).toBe(true);
			expect(Number.isInteger(ex.pas)).toBe(true);
			for (const g of [...ex.graduations, ...ex.bornes]) {
				expect(Number.isInteger(g.valeur)).toBe(true);
				// Sous 10 000 (toute la plage CE2), l'écriture française n'insère aucun
				// séparateur de milliers : le libellé est le nombre nu, relisible tel quel.
				expect(g.valeur).toBeLessThan(10000);
				expect(g.label).toMatch(/^\d{2,4}$/);
				expect(parseNombreFr(g.label)).toBe(g.valeur);
			}
			expect(parseNombreFr(ex.cibleLabel)).toBe(ex.cible);
			// Ni virgule ni point décimal dans AUCUN texte (les décimaux sont du CM1).
			for (const s of textesDe(ex)) expect(s).not.toMatch(/\d[.,]\d/);
		}
	});
});

/* =========================================================================
   2. LE NIVEAU ATTEINT BIEN LE GÉNÉRATEUR
   ========================================================================= */

describe('Le niveau demandé pilote vraiment la calibration', () => {
	it('même graine, CE2 et CM1 ⇒ échelles différentes (le niveau n’est pas ignoré)', () => {
		// Les deux tables n'ont aucune échelle commune sur le PAS atteignable à graine
		// égale (CE2 : 1 ou 10 ; CM1 : 10, 100 ou 1 000) : si le niveau n'arrivait pas au
		// générateur, les deux tirages seraient identiques.
		for (const graine of [1, 7, 42, 447, 2025]) {
			const ce2 = withSeed(graine, () => asDG(typeDe(ENTIERS).generate({ level: 'ce2' })));
			const cm1 = withSeed(graine, () => asDG(typeDe(ENTIERS).generate({ level: 'cm1' })));
			expect(ce2.pas).not.toBe(cm1.pas);
			expect(ce2.max).toBeLessThanOrEqual(10000);
		}
	});

	it('un niveau non couvert est clampé (CE1 → calibration CE2) ou replié (CM2 → CM1)', () => {
		for (const ex of echantillon(ENTIERS, 'ce1', 300)) {
			expect(echelle(ex)).toMatch(/^(10\/1|100\/10)$/);
			expect(ex.max).toBeLessThanOrEqual(10000);
		}
		// Un CM2 garde les grands nombres du CM1 (repli vers le niveau du dessous).
		const cm2 = echantillon(ENTIERS, 'cm2', 300);
		expect(new Set(cm2.map(echelle))).toEqual(new Set(['100/10', '1000/100', '10000/1000']));
	});

	it('déterminisme : même graine ⇒ exercice identique ; graines variées ⇒ tirages variés', () => {
		for (const graine of [1, 7, 42, 447, 2025]) {
			const a = withSeed(graine, () => typeDe(ENTIERS).generate({ level: 'ce2' }));
			const b = withSeed(graine, () => typeDe(ENTIERS).generate({ level: 'ce2' }));
			expect(b).toEqual(a);
		}
		const vus = new Set(
			Array.from({ length: 20 }, (_, i) => {
				const ex = withSeed(i + 1, () => asDG(typeDe(ENTIERS).generate({ level: 'ce2' })));
				return `${ex.min}|${ex.max}|${ex.pas}|${ex.cible}`;
			}),
		);
		expect(vus.size).toBeGreaterThan(1);
	});
});

/* =========================================================================
   3. BRANCHEMENT CATALOGUE ET REPLI LECTURE AU CE2
   ========================================================================= */

describe('Branchement catalogue au CE2 (#447)', () => {
	it('la leçon entiers entre au catalogue CE2 ; les décimaux n’y entrent PAS', () => {
		const auCe2 = lessonsForLevel(getAllLessons(), 'ce2').map((l) => l.id);
		expect(auCe2).toContain(ENTIERS);
		expect(auCe2).not.toContain(DECIMAUX); // borne dure : les décimaux sont du CM1
		expect(lessonsForLevel(getAllLessons(), 'cm1').map((l) => l.id)).toContain(DECIMAUX);
	});

	it('la recalibration ne perd ni l’exerciseKind, ni les modes, ni la consigne', () => {
		// Sans `exerciseKind`, la leçon retomberait dans le sprint « une réponse à la fois »,
		// qui ne sait pas rendre une droite graduée (#447) — et rien ne le signalerait.
		const l = getLessonById(ENTIERS)!;
		expect(l.exerciseType.exerciseKind).toBe('droiteGraduee');
		expect(isDroiteGradueeLesson(l)).toBe(true);
		expect(l.exerciseType.modes?.map((m) => m.id)).toEqual(['placer']);
		expect(defaultMode(l.exerciseType)).toBe('placer'); // parité des modes (#69) : un seul mode
		expect(l.exerciseType.consigne).toBe('Écris le nombre repéré sur la droite graduée.');
		expect(l.levels).toEqual(['ce2', 'cm1']);
	});
});

describe('Repli LECTURE au CE2 (genLessonItem)', () => {
	it('item num cohérent, avec figure, réponse = le nombre repéré, sans décimal', () => {
		const lesson = getLessonById(ENTIERS)!;
		for (const graine of [1, 5, 17, 99, 314, 777]) {
			// Même graine : l'item du repli et l'exercice sous-jacent s'alignent.
			const ex = withSeed(graine, () => asDG(lesson.exerciseType.generate({ level: 'ce2' })));
			const item = withSeed(graine, () => genLessonItem(lesson, 'ce2'));

			expect(item.kind).toBe('num');
			expect(item.answer).toBe(ex.cibleLabel);
			expect(String(item.answer)).toMatch(/^\d{2,4}$/); // entier nu, dans la plage CE2
			expect(item.text).toContain('Quel nombre est repéré');
			// Figure statique présente, sans fuite de la valeur à lire dans sa description.
			expect(item.figure?.balisage).toBeTruthy();
			expect(item.figure!.balisage).toContain('role="img"');
			const desc = item.figure!.balisage.match(/<desc>(.*?)<\/desc>/)?.[1] ?? '';
			expect(desc).not.toContain(ex.cibleLabel);

			// La bonne réponse est acceptée…
			expect(checkItemAnswer(item, ex.cibleLabel)).toBe(true);
			// …et un cran voisin (donc un nombre plausible mais faux) est refusé.
			const idx = ex.graduations.findIndex((g) => g.valeur === ex.cible);
			const voisin = ex.graduations[idx - 1] ?? ex.graduations[idx + 1];
			expect(voisin.valeur).not.toBe(ex.cible);
			expect(checkItemAnswer(item, voisin.label)).toBe(false);
		}
	});
});

/* =========================================================================
   4. NON-RÉGRESSION CM1
   ========================================================================= */

describe('Non-régression CM1 : les fenêtres et les décimaux n’ont pas bougé', () => {
	const cm1 = echantillon(ENTIERS, 'cm1', 1600);

	it('trois échelles inchangées, bornes basses = k × largeur avec 11 ≤ k ≤ 98', () => {
		expect(new Set(cm1.map(echelle))).toEqual(new Set(['100/10', '1000/100', '10000/1000']));
		for (const ex of cm1) {
			const largeur = ex.max - ex.min;
			const k = ex.min / largeur;
			expect(Number.isInteger(k)).toBe(true);
			expect(k).toBeGreaterThanOrEqual(11); // fenêtre jamais collée à l'origine
			expect(k).toBeLessThanOrEqual(98);
			expect(largeur).toBe(10 * ex.pas);
		}
		// Le CM1 ne descend jamais à la fenêtre d'unités ouverte au CE2.
		expect(cm1.every((ex) => ex.pas >= 10)).toBe(true);
	});

	it('la leçon décimaux reste CM1 seule, dixièmes ou centièmes, jamais au-delà', () => {
		const lesson = getLessonById(DECIMAUX)!;
		expect(lesson.levels).toEqual(['cm1']);
		expect(lesson.exerciseType.levels).toEqual(['cm1']); // pas de recalibration ici
		const dec = echantillon(DECIMAUX, 'cm1', 600);
		expect(new Set(dec.map(echelle))).toEqual(new Set(['100/10', '10/1'])); // en centièmes entiers
		for (const ex of dec) {
			for (const s of textesDe(ex)) expect(s).not.toMatch(/\d,\d{3,}/); // centièmes au plus
		}
	});
});
