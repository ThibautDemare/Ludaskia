/* ============================================================
   Combinateurs multi-niveaux (#225) : `calibrated` (un id recalibré par
   table de paramètres) et `bankByLevel` (banque d'items tagués par niveau).
   Logique pure (sans DOM).

   Ce fichier protège tout le multi-niveaux du catalogue : une leçon calibrée
   (numération, conversions, droite graduée #447…) ne traverse `calibrated` qu'une
   fois, et une métadonnée perdue ou un point d'entrée génératif figé sur le mauvais
   niveau ne se voit PAS à l'usage (l'enfant reçoit « un » exercice, plausible mais du
   niveau d'à côté). D'où trois familles de cas ci-dessous :
   - MÉTADONNÉES : n'importe quel champ du type de base traverse la recalibration
     (`exerciseKind` manquait à l'énumération d'origine → une leçon à runner dédié
     retombait silencieusement dans le sprint) ;
   - `generate` : délègue au niveau demandé, avec repli/clamp ;
   - `generateSession` : délègue AUSSI par niveau (le piège : `base` est construit avec
     les paramètres du niveau le plus BAS), et reste ABSENT quand aucun niveau ne le
     fournit (un runner teste sa présence pour décider s'il replie sur des `generate()`).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { calibrated, bankByLevel } from '../src/core/level-combinators';
import { defaultMode } from '../src/core/exercise';
import type { ExerciseType, Exercise, GenerateOpts } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';

/* Fabrique un ExerciseType trivial dont la réponse encode le paramètre reçu :
   on lit la réponse pour savoir quel jeu de paramètres a été retenu. */
const typeFromMax = (max: number): ExerciseType => ({
	generate: (): Exercise => ({ type: 'text', question: '@', answer: String(max) }),
	check: () => true,
});
const answerOf = (t: ExerciseType, level?: SchoolLevel): string => {
	const ex = t.generate({ level });
	return ex.type === 'text' ? ex.answer : '';
};
/* Même lecture, mais avec TOUTES les options (mode compris). */
const reponse = (t: ExerciseType, opts?: GenerateOpts): string => {
	const ex = t.generate(opts);
	return ex.type === 'text' ? ex.answer : '';
};

describe('calibrated', () => {
	const t = calibrated<number>({ ce2: 10, cm1: 100 }, typeFromMax);

	it('expose les niveaux de la table, triés', () => {
		expect(t.levels).toEqual(['ce2', 'cm1']);
	});

	it('génère avec les paramètres du niveau demandé', () => {
		expect(answerOf(t, 'ce2')).toBe('10');
		expect(answerOf(t, 'cm1')).toBe('100');
	});

	it('replie sous un niveau non supporté, clampe au-dessus, et défaut = plus bas', () => {
		expect(answerOf(t, 'cm2')).toBe('100'); // repli vers cm1
		expect(answerOf(t, 'cp')).toBe('10'); // clamp vers ce2
		expect(answerOf(t)).toBe('10'); // sans niveau → plus bas supporté
	});

	it('reprend les modes du type construit', () => {
		const withModes = calibrated<number>({ ce2: 1 }, (n) => ({
			modes: [{ id: 'saisie', label: 'x' }],
			generate: (): Exercise => ({ type: 'text', question: '@', answer: String(n) }),
			check: () => true,
		}));
		expect(withModes.modes?.[0].id).toBe('saisie');
	});

	it('transmet les options de génération (mode) au type du niveau', () => {
		const t2 = calibrated<number>({ ce2: 1, cm1: 2 }, (n) => ({
			generate: (opts): Exercise => ({
				type: 'text',
				question: '@',
				answer: `${n}/${opts?.mode ?? 'défaut'}`,
			}),
			check: () => true,
		}));
		// Le niveau ET le mode arrivent ensemble au bon type (le mode n'est pas avalé).
		expect(reponse(t2, { level: 'cm1', mode: 'tableau' })).toBe('2/tableau');
		expect(reponse(t2, { level: 'ce2', mode: 'tableau' })).toBe('1/tableau');
		expect(reponse(t2, { level: 'cm1' })).toBe('2/défaut');
	});
});

/* =========================================================================
   MÉTADONNÉES : rien ne se perd à la recalibration (#447)
   ========================================================================= */

/* Type de base RICHE : il porte toutes les métadonnées qu'un `ExerciseType` peut
   déclarer, plus un `levels` VOLONTAIREMENT faux (la table doit gagner). */
const typeRiche = (max: number): ExerciseType => ({
	modes: [
		{ id: 'placer', label: 'Je place le repère', recommended: true },
		{ id: 'saisie', label: 'J’écris le nombre' },
	],
	consigne: 'Écris le nombre repéré sur la droite graduée.',
	probLexique: { nom: 'Calcul', nomPluriel: 'calculs' },
	exerciseKind: 'droiteGraduee',
	levels: ['cm2'],
	generate: (): Exercise => ({ type: 'text', question: '@', answer: String(max) }),
	check: (_ex, input) => input === String(max),
});

describe('calibrated : métadonnées du type recalibré', () => {
	const t = calibrated<number>({ ce2: 10, cm1: 100 }, typeRiche);

	it('un champ QUELCONQUE du type de base traverse la recalibration', () => {
		// Contrat visé : ce qui est déclaré par la fabrique se retrouve sur le type
		// recalibré, SANS liste blanche — un champ ajouté demain à `ExerciseType` passe
		// tout seul. On compare donc les clés, pas une énumération écrite à la main.
		for (const cle of Object.keys(typeRiche(10))) {
			expect(Object.keys(t), `champ « ${cle} » perdu à la recalibration`).toContain(cle);
		}
	});

	it('`exerciseKind` survit : sans lui, une leçon à runner dédié retombe dans le sprint', () => {
		// C'est le champ qui manquait (#447) : les helpers de classement du catalogue
		// (isDroiteGradueeLesson, isPosedLesson…) ne lisent que celui-là.
		expect(t.exerciseKind).toBe('droiteGraduee');
	});

	it('consigne, modes (et donc le mode par défaut) et probLexique survivent', () => {
		expect(t.consigne).toBe('Écris le nombre repéré sur la droite graduée.');
		expect(t.modes?.map((m) => m.id)).toEqual(['placer', 'saisie']);
		expect(defaultMode(t)).toBe('placer'); // le « recommended » traverse aussi
		expect(t.probLexique?.nom).toBe('Calcul');
		expect(t.probLexique?.nomPluriel).toBe('calculs');
	});

	it('`levels` vient de la TABLE (dans l’ordre scolaire), jamais du type de base', () => {
		// Le type de base déclare ['cm2'] : c'est la table qui fait foi, sinon le catalogue
		// publierait la leçon au mauvais niveau. Ordre = ordre scolaire, pas l'ordre de la table.
		expect(t.levels).toEqual(['ce2', 'cm1']);
		expect(calibrated<number>({ cm1: 1, ce2: 2 }, typeRiche).levels).toEqual(['ce2', 'cm1']);
	});
});

/* =========================================================================
   generateSession : délégation PAR NIVEAU, et absence assumée
   ========================================================================= */

describe('calibrated : generateSession', () => {
	/* Fabrique dont les DEUX points d'entrée marquent le niveau reçu : `generate` renvoie
	   l'étiquette, `generateSession` la répète `count` fois (+ le mode s'il est passé). */
	const typeAvecSession = (etiquette: string): ExerciseType => ({
		generate: (): Exercise => ({ type: 'text', question: '@', answer: etiquette }),
		generateSession: (count, opts): Exercise[] =>
			Array.from({ length: count }, (_, i) => ({
				type: 'text',
				question: '@',
				answer: `${etiquette}#${i}${opts?.mode ? `/${opts.mode}` : ''}`,
			})),
		check: () => true,
	});

	const t = calibrated<string>({ ce2: 'CE2', cm1: 'CM1' }, typeAvecSession);
	const session = (count: number, opts?: GenerateOpts): string[] =>
		(t.generateSession?.(count, opts) ?? []).map((ex) => (ex.type === 'text' ? ex.answer : ''));

	it('délègue au niveau DEMANDÉ, pas au niveau le plus bas de la table', () => {
		// LE piège : `base` est construit avec les paramètres du plus bas niveau. Un
		// `generateSession` simplement étalé depuis `base` renverrait « CE2#… » ci-dessous
		// — un CM1 jouerait une session entière d'exercices CE2, sans que rien ne le signale.
		expect(session(3, { level: 'cm1' })).toEqual(['CM1#0', 'CM1#1', 'CM1#2']);
		expect(session(2, { level: 'ce2' })).toEqual(['CE2#0', 'CE2#1']);
	});

	it('transmet `count` et le mode, et applique le MÊME repli/clamp que generate', () => {
		expect(session(5, { level: 'cm1' })).toHaveLength(5);
		expect(session(0, { level: 'cm1' })).toEqual([]); // session vide demandée = session vide
		expect(session(1, { level: 'cm2' })).toEqual(['CM1#0']); // repli vers le niveau du dessous
		expect(session(1, { level: 'cp' })).toEqual(['CE2#0']); // clamp vers le plus bas
		expect(session(1)).toEqual(['CE2#0']); // sans niveau → plus bas supporté
		expect(session(1, { level: 'cm1', mode: 'tableau' })).toEqual(['CM1#0/tableau']);
		// Cohérence des deux points d'entrée : même niveau retenu par generate et par la session.
		for (const level of ['ce2', 'cm1', 'cm2', 'cp'] as SchoolLevel[]) {
			expect(session(1, { level })[0]).toBe(`${answerOf(t, level)}#0`);
		}
	});

	it('reste ABSENT quand aucun niveau ne le fournit (le runner doit pouvoir replier)', () => {
		// `lecon-appariement` appelle `generateSession?.(n, opts)` et retombe sur des
		// `generate()` indépendants si la fabrique n'en propose pas : une fonction PRÉSENTE
		// mais vide/cassée serait pire que rien (session muette au lieu du repli historique).
		const sans = calibrated<number>({ ce2: 10, cm1: 100 }, typeFromMax);
		expect(sans.generateSession).toBeUndefined();
		expect(sans.generateSession?.(3, { level: 'cm1' })).toBeUndefined();
		// Et la CLÉ elle-même est absente, pas posée à `undefined` : un appelant qui teste
		// la présence (`'generateSession' in type`, `Object.keys`) doit voir « pas de session ».
		expect('generateSession' in sans).toBe(false);
		expect(Object.keys(sans)).not.toContain('generateSession');
	});

	it('table à un seul niveau : la session délègue quand même (aucun cas particulier)', () => {
		const solo = calibrated<string>({ cm1: 'CM1' }, typeAvecSession);
		expect(solo.generateSession?.(2, { level: 'ce2' })?.length).toBe(2); // clamp vers cm1
		expect(solo.generateSession?.(1, { level: 'cm1' })?.[0]).toMatchObject({ answer: 'CM1#0' });
	});
});

describe('bankByLevel', () => {
	const items: { id: string; levels: SchoolLevel[] }[] = [
		{ id: 'a', levels: ['ce2'] },
		{ id: 'b', levels: ['ce2', 'cm1'] },
		{ id: 'c', levels: ['cm1'] },
	];
	const bank = bankByLevel(items);

	it('expose l’union des niveaux, triée', () => {
		expect(bank.levels).toEqual(['ce2', 'cm1']);
	});

	it('at(niveau) renvoie les items disponibles à ce niveau (appartenance stricte)', () => {
		expect(bank.at('ce2').map((i) => i.id)).toEqual(['a', 'b']);
		expect(bank.at('cm1').map((i) => i.id)).toEqual(['b', 'c']);
	});
});
