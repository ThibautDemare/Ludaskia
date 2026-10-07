import { describe, it, expect } from 'vitest';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import type { Exercise, ExerciseMode, ExerciseType, GenerateOpts } from '../src/core/exercise';
import { tirerExercices } from '../src/core/partage/tirage';

/* ============================================================
   Séance partagée (#734) — TIRAGE des exercices d'un envoi (`tirerExercices`).

   Tests unitaires sur des `ExerciseType` FACTICES (pas le catalogue) : chaque
   générateur ci-dessous est déterministe (il cycle sur une liste de variantes) et
   ESPIONNÉ (il note ses appels). On peut donc dire exactement ce que le tirage
   doit rendre, sans dépendre d'une banque réelle.

   Exigences tenues :
   1. Critère 1 — le niveau et le mode demandés sont transmis tels quels au
      générateur, à `generate` comme à `generateSession` : le niveau des items ne
      dépend pas du profil actif de l'encadrant.
   2. Déduplication par CONTENU, pas par identité d'objet ; deux exercices qui ne
      diffèrent que par l'ordre des choix restent deux exercices (c'est ce que voit
      l'enfant).
   3. Arrêt — une leçon à peu de variantes rend ce qu'elle a, et le tirage finit.
   4. Session — `generateSession`, si elle existe, est appelée UNE fois avec `n`,
      `generate` jamais ; son résultat est dédoublonné PUIS coupé à `n`, dans SON
      ordre (elle seule porte les paliers de la série).
   5. Jamais plus de `n` exercices.

   Garde anti-boucle : un générateur factice lève après `GARDE` appels. Une boucle
   synchrone sans fin ne serait pas interrompue par le délai de Vitest (elle bloque
   le fil) ; la garde la transforme en échec lisible.
   ============================================================ */

const GARDE = 10_000;

/** Un QCM neuf à chaque appel (objets et tableaux distincts) : seule une
 *  déduplication par contenu peut reconnaître deux tirages identiques. */
function qcm(question: string, choices: readonly string[]): Exercise {
	return { type: 'qcm', question, answer: choices[0] ?? '', choices: [...choices] };
}

interface Espion {
	type: ExerciseType;
	/** Options reçues par `generate`, une entrée par appel. */
	appels: (GenerateOpts | undefined)[];
	/** Appels à `generateSession`. */
	sessions: { count: number; opts: GenerateOpts | undefined }[];
}

/** Générateur qui rend les variantes dans l'ordre, en boucle. */
function typeCyclique(variantes: readonly (() => Exercise)[]): Espion {
	const appels: (GenerateOpts | undefined)[] = [];
	const sessions: Espion['sessions'] = [];
	const type: ExerciseType = {
		generate(opts) {
			appels.push(opts);
			if (appels.length > GARDE)
				throw new Error(`generate appelé plus de ${GARDE} fois : le tirage ne s'arrête pas`);
			const fabrique = variantes[(appels.length - 1) % variantes.length];
			if (!fabrique) throw new Error('générateur factice sans variante');
			return fabrique();
		},
		check: () => true,
	};
	return { type, appels, sessions };
}

/** Générateur à session : `generateSession` rend `session()` ; `generate` est
 *  espionné et rend un exercice reconnaissable s'il est appelé à tort. */
function typeASession(session: () => Exercise[]): Espion {
	const espion = typeCyclique([() => qcm('venu de generate', ['x', 'y'])]);
	espion.type.generateSession = (count, opts) => {
		espion.sessions.push({ count, opts });
		return session();
	};
	return espion;
}

function lecon(exerciseType: ExerciseType): LessonDef {
	return {
		id: 'lecon-factice',
		label: 'Leçon factice',
		subject: 'math',
		category: 'math-factice',
		levels: ['ce2', 'cm1'],
		exerciseType,
	};
}

/** `n` variantes QCM distinctes (« Q1 », « Q2 »…). */
function variantesDistinctes(n: number): (() => Exercise)[] {
	return Array.from({ length: n }, (_, i) => () => qcm(`Q${i + 1}`, ['a', 'b', 'c']));
}

const questions = (exs: Exercise[]): string[] =>
	exs.map((e) => ('question' in e && typeof e.question === 'string' ? e.question : `(${e.type})`));

/** Couples (niveau, mode) éprouvés : les deux niveaux, pour qu'un niveau figé ailleurs
 *  (profil actif, défaut de la leçon) diffère forcément de l'un d'eux, et un appel sans
 *  mode. */
const CAS: [SchoolLevel, ExerciseMode | undefined][] = [
	['ce2', 'qcm'],
	['cm1', 'saisie'],
	['cm1', undefined],
];

describe('tirerExercices — critère 1 : niveau et mode transmis au générateur', () => {
	it('generate reçoit exactement { level, mode } demandés, à chaque appel', () => {
		for (const [niveau, mode] of CAS) {
			// 2 variantes pour n = 4 : le tirage rappelle generate après des doublons,
			// et chacun de ces appels doit porter les mêmes options.
			const e = typeCyclique(variantesDistinctes(2));
			tirerExercices(lecon(e.type), 4, niveau, mode);
			expect(
				e.appels.length,
				`${niveau}/${mode ?? 'sans mode'} : generate jamais appelé`,
			).toBeGreaterThan(2);
			for (const opts of e.appels)
				expect(opts, `${niveau}/${mode ?? 'sans mode'}`).toEqual({ level: niveau, mode });
		}
	});

	it('generateSession reçoit exactement { level, mode } demandés', () => {
		for (const [niveau, mode] of CAS) {
			const e = typeASession(() => variantesDistinctes(3).map((f) => f()));
			tirerExercices(lecon(e.type), 5, niveau, mode);
			expect(e.sessions, `${niveau}/${mode ?? 'sans mode'}`).toEqual([
				{ count: 5, opts: { level: niveau, mode } },
			]);
		}
	});
});

describe('tirerExercices — déduplication', () => {
	it('un exercice rendu deux fois (même contenu, objets distincts) ne compte qu’une fois', () => {
		const e = typeCyclique([
			() => qcm('Q1', ['a', 'b']),
			() => qcm('Q1', ['a', 'b']),
			() => qcm('Q2', ['a', 'b']),
			() => qcm('Q3', ['a', 'b']),
		]);
		const exs = tirerExercices(lecon(e.type), 3, 'ce2');
		expect(questions(exs)).toEqual(['Q1', 'Q2', 'Q3']);
	});

	it('le même contenu écrit dans un autre ordre de propriétés reste un doublon', () => {
		// Deux chemins d'une même fabrique peuvent construire le même exercice avec les
		// clés dans un autre ordre : pour l'enfant, c'est la même question.
		const e = typeCyclique([
			() => ({ type: 'qcm', question: 'Q1', answer: 'a', choices: ['a', 'b'] }),
			() => ({ choices: ['a', 'b'], answer: 'a', question: 'Q1', type: 'qcm' }),
		]);
		const exs = tirerExercices(lecon(e.type), 8, 'ce2');
		expect(exs).toHaveLength(1);
	});

	it('deux exercices qui ne diffèrent que par l’ordre des choix sont deux exercices', () => {
		const e = typeCyclique([() => qcm('Q', ['a', 'b', 'c']), () => qcm('Q', ['b', 'a', 'c'])]);
		const exs = tirerExercices(lecon(e.type), 8, 'ce2');
		expect(exs).toHaveLength(2);
		expect(
			exs.map((x) => ('choices' in x && Array.isArray(x.choices) ? x.choices.join('') : '')),
		).toEqual(['abc', 'bac']);
	});
});

describe('tirerExercices — arrêt quand la leçon n’a pas assez de variantes', () => {
	it('3 variantes, n = 8 : rend les 3, et s’arrête', () => {
		const e = typeCyclique(variantesDistinctes(3));
		const exs = tirerExercices(lecon(e.type), 8, 'ce2');
		expect(questions(exs)).toEqual(['Q1', 'Q2', 'Q3']);
	});

	it('1 seule variante, n = 8 : rend 1 exercice', () => {
		const e = typeCyclique(variantesDistinctes(1));
		expect(tirerExercices(lecon(e.type), 8, 'ce2')).toHaveLength(1);
	});
});

describe('tirerExercices — session tirée d’un coup (generateSession)', () => {
	it('appelée une fois avec n ; generate jamais, même si la session est courte', () => {
		const e = typeASession(() => [qcm('S1', ['a']), qcm('S2', ['a'])]);
		const exs = tirerExercices(lecon(e.type), 8, 'ce2');
		expect(e.sessions).toHaveLength(1);
		expect(e.sessions[0]?.count).toBe(8);
		expect(e.appels, 'generate ne doit pas compléter une session').toEqual([]);
		expect(questions(exs)).toEqual(['S1', 'S2']);
	});

	it('dédoublonne AVANT de couper à n : n distincts disponibles → n rendus, dans l’ordre de la session', () => {
		// 5 rendus dont un doublon en tête : couper d'abord laisserait 2 exercices.
		const e = typeASession(() => [
			qcm('S3', ['a']),
			qcm('S3', ['a']),
			qcm('S1', ['a']),
			qcm('S2', ['a']),
			qcm('S4', ['a']),
		]);
		const exs = tirerExercices(lecon(e.type), 3, 'ce2');
		expect(questions(exs)).toEqual(['S3', 'S1', 'S2']);
	});

	it('session vide : aucun exercice, sans repli sur generate', () => {
		const e = typeASession(() => []);
		expect(tirerExercices(lecon(e.type), 8, 'ce2')).toEqual([]);
		expect(e.appels).toEqual([]);
	});
});

describe('tirerExercices — jamais plus de n', () => {
	it('par generate : 100 variantes, n = 5 → exactement 5', () => {
		const e = typeCyclique(variantesDistinctes(100));
		expect(questions(tirerExercices(lecon(e.type), 5, 'ce2'))).toEqual([
			'Q1',
			'Q2',
			'Q3',
			'Q4',
			'Q5',
		]);
	});

	it('par session : 10 distincts rendus, n = 4 → les 4 premiers', () => {
		const e = typeASession(() => variantesDistinctes(10).map((f) => f()));
		expect(questions(tirerExercices(lecon(e.type), 4, 'ce2'))).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
	});

	it('n = 0 : aucun exercice, par generate comme par session', () => {
		const g = typeCyclique(variantesDistinctes(3));
		expect(tirerExercices(lecon(g.type), 0, 'ce2')).toEqual([]);
		const s = typeASession(() => variantesDistinctes(3).map((f) => f()));
		expect(tirerExercices(lecon(s.type), 0, 'ce2')).toEqual([]);
	});
});
