/* ============================================================
   Coordination des deux cartes « à faire » de l'accueil (#516) — logique pure.
   ------------------------------------------------------------
   Règle éprouvée ici (dérivée de la SPEC arbitrée, pas de l'implémentation) :
   1. les deux cartes ne proposent jamais la même leçon ; « À revoir » CÈDE la
      première : si l'entrée qu'elle afficherait par défaut (la tête de file) est la
      leçon du jour, elle affiche la première AUTRE entrée active ;
   2. si elle ne peut pas céder (aucune autre entrée), elle garde la sienne et c'est
      « Ta prochaine leçon » qui avance d'un cran dans son fil ;
   3. « Ta prochaine leçon » ne se vide JAMAIS tant que le fil n'est pas vide : tout
      le fil à éviter ⇒ repli sur la tête (le doublon vaut mieux qu'un « Bravo, tu as
      fait le tour » mensonger). `null` seulement pour un fil vide ;
   4. seules les entrées `kind === 'lecon'` peuvent entrer en collision : une liste de
      dictée n'est pas une leçon du catalogue, même à id identique ;
   5. `cibleId` (« Voir une autre leçon ») est un choix EXPLICITE de l'enfant : il
      court-circuite la déduplication ; s'il ne désigne aucune entrée active, on
      retombe sur le comportement par défaut (donc dédupliqué).

   Modules purs (aucune lecture de stockage ni du catalogue) : pas de `beforeEach`
   d'environnement, et les fixtures sont fabriquées ici plutôt que lues dans le
   catalogue réel — le contrat testé ne dépend d'aucune leçon existante.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { choisirARevoir, choisirProchaineLecon } from '../src/core/accueil-propositions';
import type { LessonDef } from '../src/core/catalog';
import type { ExerciseType } from '../src/core/exercise';
import type { RevoirEntry } from '../src/core/encadrant-stats';

/* ---------- Fixtures minimales ---------- */

/* Type d'exercice inerte : les sélecteurs ne l'appellent jamais, il n'est là que
   pour satisfaire `LessonDef` sans cast de contournement. */
const TYPE_INERTE: ExerciseType = {
	generate: () => ({ type: 'text', question: 'question factice', answer: '1' }),
	check: (_ex, input) => input === '1',
};

const lecon = (id: string): LessonDef => ({
	id,
	label: `Leçon ${id}`,
	subject: 'math',
	category: 'numeration',
	levels: ['ce2'],
	exerciseType: TYPE_INERTE,
});

/* Entrée épinglée pointant une leçon du catalogue. */
const epingleLecon = (id: string): RevoirEntry => ({
	kind: 'lecon',
	id,
	label: `Leçon ${id}`,
	lesson: lecon(id),
});

/* Entrée épinglée pointant une LISTE DE DICTÉE (hors catalogue). */
const epingleOrtho = (id: string): RevoirEntry => ({
	kind: 'ortho',
	id,
	label: `Dictée ${id}`,
	source: 'liste',
});

const fil = (...ids: string[]): LessonDef[] => ids.map(lecon);

/* Ce que l'accueil fait réellement (renderHomeStats) : « À revoir » est résolue en
   premier et transmet la LEÇON qu'elle a retenue (rien pour une dictée), que « Ta
   prochaine leçon » évite à son tour. */
function accueil(
	entrees: RevoirEntry[],
	sequence: LessonDef[],
	cibleId?: string,
): { revoir: RevoirEntry | null; prochaine: LessonDef | null } {
	const jour = sequence.length > 0 ? sequence[0].id : null; // leconDuJour() = tête du fil
	const revoir = choisirARevoir(entrees, jour, cibleId);
	const eviterId = revoir && revoir.kind === 'lecon' ? revoir.id : null;
	return { revoir, prochaine: choisirProchaineLecon(sequence, eviterId) };
}

/* ============================================================
   1. choisirARevoir — la file épinglée cède la première.
   ============================================================ */
describe('choisirARevoir — pas de collision', () => {
	it('file vide : rien à proposer', () => {
		expect(choisirARevoir([], 'a')).toBeNull();
		expect(choisirARevoir([], null)).toBeNull();
	});

	it('la leçon du jour n’est pas épinglée : la tête de file est gardée', () => {
		const entrees = [epingleLecon('b'), epingleLecon('c')];
		expect(choisirARevoir(entrees, 'a')).toBe(entrees[0]);
	});

	it('programme terminé (aucune leçon du jour) : la tête de file est gardée', () => {
		const entrees = [epingleLecon('a'), epingleLecon('b')];
		expect(choisirARevoir(entrees, null)).toBe(entrees[0]);
	});

	it('la collision est PLUS LOIN dans la file : la tête est gardée telle quelle', () => {
		// Seule l'entrée AFFICHÉE peut faire doublon : une épingle « leçon du jour » en
		// 2e position ne doit pas réordonner la file.
		const entrees = [epingleLecon('b'), epingleLecon('a'), epingleLecon('c')];
		expect(choisirARevoir(entrees, 'a')).toBe(entrees[0]);
	});
});

describe('choisirARevoir — collision en tête : la file cède (règle 1)', () => {
	it('deux entrées, la tête est la leçon du jour : la seconde est affichée', () => {
		const entrees = [epingleLecon('a'), epingleLecon('b')];
		expect(choisirARevoir(entrees, 'a')).toBe(entrees[1]);
	});

	it('la PREMIÈRE autre entrée est prise (l’ordre de la file est respecté)', () => {
		const entrees = [epingleLecon('a'), epingleLecon('b'), epingleLecon('c')];
		expect(choisirARevoir(entrees, 'a')).toBe(entrees[1]);
	});

	it('une SEULE entrée, et c’est la leçon du jour : la file ne peut pas céder, elle la garde', () => {
		// Règle 2 : c'est alors « Ta prochaine leçon » qui bougera.
		const entrees = [epingleLecon('a')];
		expect(choisirARevoir(entrees, 'a')).toBe(entrees[0]);
	});

	it('la file n’est jamais réordonnée ni modifiée', () => {
		const entrees = [epingleLecon('a'), epingleLecon('b')];
		const avant = [...entrees];
		choisirARevoir(entrees, 'a');
		expect(entrees).toEqual(avant);
	});
});

describe('choisirARevoir — une dictée n’entre pas en collision (règle 4)', () => {
	it('dictée en tête portant l’id de la leçon du jour : gardée, ce n’est pas la même chose', () => {
		const entrees = [epingleOrtho('a'), epingleLecon('b')];
		expect(choisirARevoir(entrees, 'a')).toBe(entrees[0]);
	});

	it('une dictée est une alternative valable quand la leçon en tête fait doublon', () => {
		const entrees = [epingleLecon('a'), epingleOrtho('a'), epingleLecon('c')];
		expect(choisirARevoir(entrees, 'a')).toBe(entrees[1]); // la dictée homonyme
	});

	it('file 100 % dictées : aucune collision possible, tête gardée', () => {
		const entrees = [epingleOrtho('a'), epingleOrtho('b')];
		expect(choisirARevoir(entrees, 'a')).toBe(entrees[0]);
	});
});

describe('choisirARevoir — « Voir une autre leçon » force l’entrée (règle 5)', () => {
	it('l’entrée demandée est affichée MÊME si c’est la leçon du jour', () => {
		const entrees = [epingleLecon('b'), epingleLecon('a')];
		expect(choisirARevoir(entrees, 'a', 'a')).toBe(entrees[1]);
	});

	it('l’entrée demandée est affichée même quand elle n’est pas en tête', () => {
		const entrees = [epingleLecon('a'), epingleLecon('b'), epingleLecon('c')];
		expect(choisirARevoir(entrees, 'z', 'c')).toBe(entrees[2]);
	});

	it('cible inconnue (entrée sortie de la file entre-temps) : retour au comportement dédupliqué', () => {
		const entrees = [epingleLecon('a'), epingleLecon('b')];
		expect(choisirARevoir(entrees, 'a', 'disparue')).toBe(entrees[1]);
	});

	it('cible inconnue et file vide : toujours rien', () => {
		expect(choisirARevoir([], 'a', 'a')).toBeNull();
	});

	it('cible désignant une dictée : elle est affichée', () => {
		const entrees = [epingleLecon('a'), epingleOrtho('dictee-1')];
		expect(choisirARevoir(entrees, 'z', 'dictee-1')).toBe(entrees[1]);
	});
});

/* ============================================================
   2. choisirProchaineLecon — le fil ne se vide jamais à tort.
   ============================================================ */
describe('choisirProchaineLecon — cas nominaux', () => {
	it('fil vide : rien à proposer, quel que soit l’évitement', () => {
		expect(choisirProchaineLecon([], null)).toBeNull();
		expect(choisirProchaineLecon([], 'a')).toBeNull();
	});

	it('rien à éviter : la tête du fil', () => {
		const seq = fil('a', 'b', 'c');
		expect(choisirProchaineLecon(seq, null)).toBe(seq[0]);
	});

	it('leçon à éviter absente du fil : la tête du fil', () => {
		const seq = fil('a', 'b');
		expect(choisirProchaineLecon(seq, 'z')).toBe(seq[0]);
	});

	it('la tête est à éviter : on avance d’UN cran (règle 2)', () => {
		const seq = fil('a', 'b', 'c');
		expect(choisirProchaineLecon(seq, 'a')).toBe(seq[1]);
	});

	it('la leçon à éviter est plus loin dans le fil : la tête ne bouge pas', () => {
		const seq = fil('a', 'b', 'c');
		expect(choisirProchaineLecon(seq, 'b')).toBe(seq[0]);
	});

	it('le fil n’est pas modifié', () => {
		const seq = fil('a', 'b');
		const avant = [...seq];
		choisirProchaineLecon(seq, 'a');
		expect(seq).toEqual(avant);
	});
});

describe('choisirProchaineLecon — jamais de carte vide à tort (règle 3)', () => {
	it('fil réduit à UNE leçon, et c’est elle qu’il faudrait éviter : elle est reproposée', () => {
		// Le doublon assumé : basculer sur « Bravo, tu as fait le tour » serait FAUX,
		// il reste précisément cette leçon à franchir.
		const seq = fil('a');
		expect(choisirProchaineLecon(seq, 'a')).toBe(seq[0]);
	});

	it('fil à une seule leçon, une AUTRE à éviter : elle reste proposée', () => {
		const seq = fil('a');
		expect(choisirProchaineLecon(seq, 'b')).toBe(seq[0]);
	});
});

/* ============================================================
   3. Les deux cartes ensemble — le scénario de l'issue.
   ============================================================ */
describe('accueil — les deux cartes coordonnées (#516)', () => {
	it('épingle = leçon du jour, mais une autre épingle existe : c’est « À revoir » qui bouge', () => {
		const { revoir, prochaine } = accueil(
			[epingleLecon('a'), epingleLecon('k')],
			fil('a', 'b', 'c'),
		);
		expect(revoir?.id).toBe('k'); // la file cède
		expect(prochaine?.id).toBe('a'); // le fil garde sa tête (la leçon du jour)
	});

	it('épingle UNIQUE = leçon du jour : c’est « Ta prochaine leçon » qui avance d’un cran', () => {
		const { revoir, prochaine } = accueil([epingleLecon('a')], fil('a', 'b', 'c'));
		expect(revoir?.id).toBe('a');
		expect(prochaine?.id).toBe('b');
	});

	it('épingle unique = leçon du jour = DERNIÈRE leçon du programme : doublon assumé, pas de « Bravo »', () => {
		const { revoir, prochaine } = accueil([epingleLecon('a')], fil('a'));
		expect(revoir?.id).toBe('a');
		expect(prochaine?.id).toBe('a'); // et surtout PAS null
	});

	it('épingle = dictée homonyme de la leçon du jour : les deux cartes cohabitent sans se déplacer', () => {
		const { revoir, prochaine } = accueil([epingleOrtho('a')], fil('a', 'b'));
		expect(revoir?.kind).toBe('ortho');
		expect(revoir?.id).toBe('a');
		expect(prochaine?.id).toBe('a'); // une dictée ne fait pas reculer le fil
	});

	it('aucune épingle : « Ta prochaine leçon » reste sur la tête du fil', () => {
		const { revoir, prochaine } = accueil([], fil('a', 'b'));
		expect(revoir).toBeNull();
		expect(prochaine?.id).toBe('a');
	});

	it('programme terminé : la carte du fil se tait, « À revoir » garde sa tête de file', () => {
		const { revoir, prochaine } = accueil([epingleLecon('a')], []);
		expect(revoir?.id).toBe('a');
		expect(prochaine).toBeNull();
	});
});

/* ============================================================
   4. Invariants sur échantillon (files et fils tirés au hasard).
   ============================================================ */
describe('accueil — invariants sur échantillon large', () => {
	const ids = ['a', 'b', 'c', 'd'];
	const arbEntrees = fc.array(
		fc
			.record({
				kind: fc.constantFrom<'lecon' | 'ortho'>('lecon', 'ortho'),
				id: fc.constantFrom(...ids, 'z'),
			})
			.map(({ kind, id }) => (kind === 'lecon' ? epingleLecon(id) : epingleOrtho(id))),
		{ maxLength: 5 },
	);
	// Un fil réel est sans doublon (permutation des leçons restantes).
	const arbFil = fc.uniqueArray(fc.constantFrom(...ids), { maxLength: 4 }).map((v) => fil(...v));

	it('les deux cartes ne se répètent QUE dans le cas dégénéré (épingle unique = dernière leçon restante)', () => {
		fc.assert(
			fc.property(arbEntrees, arbFil, (entrees, sequence) => {
				const { revoir, prochaine } = accueil(entrees, sequence);
				const jour = sequence.length > 0 ? sequence[0].id : null;

				// a. Rien n'est inventé : l'entrée rendue vient de la file, la leçon du fil.
				expect(revoir === null ? entrees.length === 0 : entrees.includes(revoir)).toBe(true);
				expect(prochaine === null ? sequence.length === 0 : sequence.includes(prochaine)).toBe(
					true,
				);
				// b. La carte du fil n'est vide QUE si le programme est terminé (règle 3).
				expect(prochaine === null).toBe(sequence.length === 0);

				// c. Un doublon n'est possible que si la file n'avait AUCUNE alternative
				//    (toutes ses entrées sont la leçon du jour) ET que le fil est réduit à
				//    cette seule leçon.
				const doublon =
					revoir !== null &&
					revoir.kind === 'lecon' &&
					prochaine !== null &&
					revoir.id === prochaine.id;
				if (doublon) {
					expect(entrees.every((e) => e.kind === 'lecon' && e.id === jour)).toBe(true);
					expect(sequence.map((l) => l.id)).toEqual([jour]);
				}
			}),
			{ numRuns: 500 },
		);
	});

	it('une cible explicite rend TOUJOURS l’entrée demandée quand elle est dans la file', () => {
		fc.assert(
			fc.property(
				arbEntrees,
				fc.option(fc.constantFrom(...ids), { nil: null }),
				(entrees, jour) => {
					for (const cible of entrees) {
						const rendue = choisirARevoir(entrees, jour, cible.id);
						// Choix explicite : jamais dédupliqué. (À id égal, la file peut contenir
						// deux entrées de `kind` différents : c'est bien cet ID qui est rendu.)
						expect(rendue?.id).toBe(cible.id);
					}
				},
			),
			{ numRuns: 300 },
		);
	});
});
