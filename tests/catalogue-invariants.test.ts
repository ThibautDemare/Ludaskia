import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getAllLessons, genLessonItem } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import type { Item } from '../src/core/items';
import type { Exercise, ExerciseType } from '../src/core/exercise';
import { withSeed } from '../src/core/utils';

/* ============================================================
   Harnais d'invariants générique sur TOUT le catalogue (#410).

   But : transformer en gate automatique bloquant une bonne part de ce qu'un
   relecteur vérifie à la main quand un agent (integrateur-lecon) ajoute une leçon
   — sans avoir à écrire un test dédié par leçon. Le harnais balaie `getAllLessons()`
   et, pour chaque leçon, éprouve un socle d'invariants communs à tout `ExerciseType`,
   sous des graines VARIÉES pilotées par `fast-check` (property-based) et rejouables
   via `withSeed` (#41). Un échec nomme explicitement la leçon (titre `$id`) et, grâce
   au shrinking de fast-check, imprime la graine minimale qui reproduit le problème.

   PÉRIMÈTRE (décision actée avec le mainteneur) : les deux « critères » de #410
   « plancher de 50-100 items » et « aucun item dupliqué sur l'échantillon » NE SONT
   PAS des invariants universels et ne sont donc pas des gates ici. Mesure à l'appui :
   ~48 % du catalogue produit < 50 items distincts par CONCEPTION (une leçon de
   conjugaison = un verbe × un temps = 6 formes ; il n'existe que ~4 types de
   triangles ; etc.), et échantillonner une telle leçon produit forcément des
   doublons. Le plancher 50-100 (cf. mémoire « taille des banques QCM ») vise les
   BANQUES DE CONTENU (vocabulaire, homophones) pour éviter la répétition ressentie ;
   la mesure montre qu'elles sont déjà à 98-300 items, donc aucune banque de contenu
   n'est sous-provisionnée. Ce qui reste utile et universel : une garde « générateur
   non figé » (≥ 2 items distincts), qui attrape un `generate()` coincé sur un item.

   Couche de test : on éprouve DEUX chemins complémentaires.
   - `genLessonItem()` (chemin CATALOGUE, mode par défaut) : le point d'entrée qui
     normalise TOUT — y compris le math hérité bilanQ et les replis texte des formats
     à runner dédié posed/tuiles/probleme/appariement — en un `Item` à réponse
     canonique. Round-trip via `checkItemAnswer` (la vraie correction de scoring).
   - `exerciseType.generate({ level, mode })` (moteur BRUT) pour CHAQUE niveau ET
     CHAQUE mode déclaré (`type.modes`, sinon le mode par défaut) : c'est le correctif
     du point de relecture #410 — sans ça, un mode alternatif (ex. le mode « tableau »
     des mesures, #394) ne serait jamais exercé par le gate. Round-trip au niveau
     `Exercise` via `type.check(ex, ex.answer)`, SAUF pour les types à correction
     déléguée (posed/tuiles/probleme/appariement/tableauConversion) où `check()`
     renvoie `false` par construction — leur bonne formation est vérifiée, pas leur
     round-trip. NB : pour un item `posed`, le round-trip `checkItemAnswer` du chemin
     catalogue est structurellement trivial (comparaison numérique de la réponse à
     elle-même — la vraie correction est cellule par cellule) ; il ne vaut que comme
     garde « ne lève pas / réponse présente ».
   ============================================================ */

const LESSONS = getAllLessons();
const NUM_RUNS = 100; // graines par leçon (property-based) — cf. #410 « N ~ 100-200 »

/* Sérialisation stable d'un Item pour comparer deux tirages (diversité). */
const serialize = (it: Item): string => JSON.stringify({ t: it.text, a: it.answer, c: it.choices });

/* Types à correction DÉLÉGUÉE à un runner (posed/tuiles/probleme/appariement/tableau) :
   `check()` renvoie `false` par construction (cf. core/exercise.ts checkAnswer), donc pas
   de round-trip générique possible — on vérifie seulement leur bonne formation. */
const CORRECTION_DELEGUEE = new Set([
	'posed',
	'tuilesOrdre',
	'tuilesTri',
	'probleme',
	'appariement',
	'tableauConversion',
]);

/* Bonne formation d'un exercice BRUT (moteur), + round-trip quand la correction n'est
   pas déléguée à un runner. Sert à éprouver CHAQUE mode déclaré d'un ExerciseType. */
function assertExercise(type: ExerciseType, ex: Exercise, où: string): void {
	expect(ex, `${où} : generate() n'a rien renvoyé`).toBeTruthy();
	if ('answer' in ex) {
		const ans = String(ex.answer);
		expect(ans.trim(), `${où} : réponse vide`).not.toBe('');
		if (!CORRECTION_DELEGUEE.has(ex.type)) {
			expect(type.check(ex, ans), `${où} : round-trip — check() rejette « ${ans} »`).toBe(true);
		}
	}
	if (ex.type === 'qcm') {
		expect(ex.choices.length, `${où} : QCM à moins de 2 choix`).toBeGreaterThanOrEqual(2);
		expect(ex.choices, `${où} : les choix du QCM ne contiennent pas « ${ex.answer} »`).toContain(
			ex.answer,
		);
		expect(
			new Set(ex.choices).size,
			`${où} : doublon de choix dans le QCM [${ex.choices.join(' | ')}]`,
		).toBe(ex.choices.length);
	}
}

/* Bonne formation de l'ITEM du chemin catalogue (mode par défaut) + round-trip de
   scoring via `checkItemAnswer` (la vraie correction, y compris math hérité bilanQ). */
function assertItem(item: Item, où: string): void {
	expect(item.answer, `${où} : réponse undefined`).toBeDefined();
	const ans = String(item.answer);
	expect(ans.trim(), `${où} : réponse vide`).not.toBe('');

	expect(
		checkItemAnswer(item, ans),
		`${où} : round-trip — réponse canonique « ${ans} » rejetée`,
	).toBe(true);
	for (const alt of item.answers ?? []) {
		expect(checkItemAnswer(item, alt), `${où} : forme équivalente « ${alt} » rejetée`).toBe(true);
	}

	if (item.choices && item.choices.length) {
		expect(item.choices.length, `${où} : QCM à moins de 2 choix`).toBeGreaterThanOrEqual(2);
		expect(
			item.choices,
			`${où} : les choix du QCM ne contiennent pas la réponse « ${ans} »`,
		).toContain(ans);
		expect(
			new Set(item.choices).size,
			`${où} : doublon de choix dans le QCM [${item.choices.join(' | ')}]`,
		).toBe(item.choices.length);
	}
}

/* Socle d'invariants d'une leçon, éprouvé sous la graine courante. Balaie TOUS les
   niveaux déclarés (une leçon multi-niveaux peut générer différemment selon la classe,
   ex. décimaux au CM1) ET, pour le moteur brut, TOUS les modes déclarés (#410 relecture). */
function assertInvariants(lesson: LessonDef): void {
	for (const level of lesson.levels) {
		const base = `${lesson.id}@${level}`;
		// Chemin catalogue (mode par défaut) : normalisation + round-trip de scoring.
		assertItem(genLessonItem(lesson, level), base);
		// Moteur brut, chaque mode déclaré (ou le mode par défaut implicite).
		const modes = lesson.exerciseType.modes?.map((m) => m.id) ?? [undefined];
		for (const mode of modes) {
			const ex = lesson.exerciseType.generate({ level, mode });
			assertExercise(lesson.exerciseType, ex, `${base}/${mode ?? 'défaut'}`);
		}
	}
}

describe('Invariants génériques du catalogue (#410)', () => {
	it('le catalogue est non vide (garde contre un it.each vide qui passerait à vide)', () => {
		expect(LESSONS.length).toBeGreaterThan(50);
	});

	it.each(LESSONS)('invariants structurels — $id', (lesson) => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 0x7fffffff }), (seed) => {
				withSeed(seed, () => assertInvariants(lesson));
			}),
			{ numRuns: NUM_RUNS },
		);
	});
});

describe('Garde « générateur non figé » (#410)', () => {
	// Attrape un generate() coincé sur un unique item. Espace borné assumé (conjugaison
	// = 6 formes, etc.) : le seuil est volontairement bas (≥ 2), on ne mesure PAS un
	// plancher de banque ici (cf. en-tête). Éprouve CHAQUE niveau déclaré (un niveau
	// figé passerait inaperçu si un autre est sain) ; graine fixe + arrêt anticipé.
	it.each(LESSONS)('produit au moins 2 items distincts par niveau — $id', (lesson) => {
		for (const level of lesson.levels) {
			const vus = new Set<string>();
			withSeed(20260713, () => {
				for (let i = 0; i < 40 && vus.size < 2; i++) {
					vus.add(serialize(genLessonItem(lesson, level)));
				}
			});
			expect(
				vus.size,
				`${lesson.id}@${level} : générateur figé (un seul item sur 40 tirages)`,
			).toBeGreaterThanOrEqual(2);
		}
	});
});
