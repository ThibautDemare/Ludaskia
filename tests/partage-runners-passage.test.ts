/* ============================================================
   Séance partagée (#734), PR 4 — les runners « une question à la fois » depuis un lien.

   Écrits AVANT l'implémentation, par un auteur distinct, depuis le contrat de la PR 4
   (section « Logique pure ») et les critères 1, 2, 11 et 27 de l'issue. Les cas qui
   décrivent ce qui manque encore (champ `runner`, modes runner envoyables) sont ROUGES
   tant que la PR n'est pas codée : c'est attendu.

   Ce que le contrat fixe :
   1. `preparerPassage` d'un envoi `lecon` dont TOUS les exercices sont d'un même type
      joué en runner dans le mode effectif (`bloc.mode ?? defaultMode(...)`) → `ok`, avec
      `runner: { type, mode }` et les blocs (items + captures) comme aujourd'hui ;
      mélange fiche + runner, ou deux types de runner → refus `format` ; fiche → pas de
      `runner` ; bilan → pas de `runner`, même avec des exercices de type runner.
   2. `modesEnvoyables` propose tout mode de la leçon à ce niveau (critère 1), runners
      compris ; il n'écarte qu'un mode dont les tirages mêlent des formats, ou dont la
      génération lève. `niveauxEnvoyables` suit.
   3. Tout mode envoyable se compose (`composerLecon`) et se prépare sans refus, et
      `runner.type` est le type des exercices tirés.

   « Joué en runner » est défini par le contrat lui-même : la table `JEU_PAR_TYPE`, lue
   par `seJoueEnRunner`. S'en servir pour l'attendu, c'est lire la spécification, pas
   l'implémentation testée (`preparerPassage`, `modesEnvoyables`).

   Le cas « dictée → format » est déjà tenu par `partage-passage.test.ts`.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import {
	getAllLessons,
	getLessonById,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import {
	defaultMode,
	modesPourNiveau,
	seJoueEnRunner,
	type Exercise,
	type ExerciseMode,
	type GenerateOpts,
	type ModeOption,
} from '../src/core/exercise';
import { labelLecon, LEVEL_ORDER } from '../src/core/levels';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import {
	composerLecon,
	modesEnvoyables,
	niveauxEnvoyables,
	type Composition,
} from '../src/core/partage/composition';
import type { BlocEnvoi, Envoi } from '../src/core/partage/envoi';
import { preparerPassage, type Passage } from '../src/core/partage/passage';
import { tirerExercices } from '../src/core/partage/tirage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Outils ---------- */

const ID = 'EnvoiTest001';
const LIBELLE = 'Fiche du lundi';

function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
}

/** Exercices tirés comme le ferait l'encadrant, avec une précondition sur leur type : si
 *  le catalogue change, le test le dit au lieu de tester autre chose en silence. */
function tirer(
	id: string,
	n: number,
	niveau: SchoolLevel,
	mode: ExerciseMode | undefined,
	type: Exercise['type'],
): Exercise[] {
	const exs = tirerExercices(lecon(id), n, niveau, mode);
	expect(exs.length, `${id} : aucun exercice tiré`).toBeGreaterThan(0);
	for (const ex of exs) expect(ex.type, `${id} (${mode ?? 'sans mode'}) : précondition`).toBe(type);
	return exs;
}

function bloc(id: string, exercices: Exercise[], mode?: ExerciseMode): BlocEnvoi {
	return mode === undefined ? { lecon: id, exercices } : { lecon: id, mode, exercices };
}

function envoiLecon(b: BlocEnvoi, niveau: SchoolLevel = 'ce2'): Envoi {
	return { id: ID, libelle: LIBELLE, nature: 'lecon', niveau, blocs: [b] };
}

function envoiBilan(blocs: BlocEnvoi[], niveau: SchoolLevel = 'ce2'): Envoi {
	return {
		id: ID,
		libelle: 'Bilan de la semaine',
		nature: 'bilan',
		variante: 'express',
		niveau,
		blocs,
	};
}

/** Le champ `runner` d'un passage, sans dépendre de son type (il n'existe pas encore) :
 *  `undefined` s'il est absent. */
function runnerDe(p: Passage): unknown {
	return 'runner' in p ? p.runner : undefined;
}

/** Options de `composerLecon` sans clé `mode` quand il n'y en a pas. */
function optsLecon(l: LessonDef, niveau: SchoolLevel, mode: ExerciseMode | undefined) {
	return mode === undefined
		? { lesson: l, niveau, libelle: LIBELLE, id: ID }
		: { lesson: l, niveau, mode, libelle: LIBELLE, id: ID };
}

function envoiDe(c: Composition, quoi: string): Envoi {
	if (!c.ok) throw new Error(`${quoi} : composition refusée (« ${c.raison} »)`);
	return c.envoi;
}

/** Le texte de l'exercice que l'énoncé capturé doit contenir (arbitrage du 8 octobre
 *  2026) : la consigne et les mots de la phrase pour « clique sur le mot », la consigne
 *  pour la droite graduée, l'énoncé pour un problème, la question pour les autres. */
function textesDeLExercice(ex: Exercise): string[] {
	switch (ex.type) {
		case 'clicMot':
			return [ex.consigne, ...ex.tokens.filter((t) => /\p{L}/u.test(t))];
		case 'droiteGraduee':
			return [ex.consigne];
		case 'probleme':
			return [ex.enonce];
		default:
			return 'question' in ex ? [ex.question] : [];
	}
}

/** Aucun texte exact n'est imposé : ni l'emplacement `@` (« … » dans l'énoncé lisible), ni
 *  le gras `**`, ni la nature des blancs. On compare les morceaux autour de `@`. */
const aplatir = (s: string): string => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const morceaux = (s: string): string[] =>
	s
		.split('@')
		.map(aplatir)
		.filter((m) => m !== '');

/** Les dix types que le contrat déclare joués dans un runner d'écran dédié. */
const DIX_TYPES_RUNNER = [
	'appariement',
	'clicMot',
	'droiteGraduee',
	'probleme',
	'qcm',
	'qcmMulti',
	'tableauConversion',
	'tuilesNombre',
	'tuilesOrdre',
	'tuilesTri',
] as const;

/** Une vraie leçon par type de runner, au niveau et dans le mode qui la jouent en runner.
 *  `undefined` : leçon sans modes, dont le format est un runner en toutes circonstances. */
const UNE_LECON_PAR_RUNNER: [Exercise['type'], string, SchoolLevel, ExerciseMode | undefined][] = [
	['qcm', 'fr-homophones-a', 'ce2', 'qcm'],
	['qcmMulti', 'geo-cm1-figures-proprietes', 'cm1', 'coche'],
	['tuilesNombre', 'num-comparer', 'ce2', 'tuiles'],
	['tuilesOrdre', 'num-ranger', 'ce2', 'tuiles'],
	['tuilesTri', 'fr-vocab-champs-tri', 'ce2', 'tri'],
	['tableauConversion', 'mes-longueurs', 'ce2', 'tableau'],
	['appariement', 'fr-vocab-familles-relier', 'ce2', 'relier'],
	['probleme', 'math-prob-composition', 'ce2', undefined],
	['clicMot', 'fr-gram-clic-verbe', 'ce2', 'clic'],
	['droiteGraduee', 'num-droite-entiers', 'ce2', 'placer'],
];

describe('préconditions : la table des leçons couvre les dix runners du contrat', () => {
	it('un type par ligne, les dix, et chaque mode est bien proposé à ce niveau', () => {
		expect(UNE_LECON_PAR_RUNNER.map(([t]) => t).sort()).toEqual([...DIX_TYPES_RUNNER]);
		for (const [, id, niveau, mode] of UNE_LECON_PAR_RUNNER) {
			const l = lecon(id);
			expect(l.levels, id).toContain(niveau);
			const proposes = modesPourNiveau(l.exerciseType, niveau).map((m) => m.id);
			if (mode === undefined) expect(proposes, `${id} : leçon sans modes`).toEqual([]);
			else expect(proposes, `${id} @${niveau}`).toContain(mode);
		}
	});
});

/* ============================================================
   1. preparerPassage
   ============================================================ */

describe('preparerPassage — envoi « lecon » d’un seul type runner : joué dans son runner (contrat 1)', () => {
	it.each(UNE_LECON_PAR_RUNNER)(
		'%s (%s @%s, mode %s) → ok, runner { type, mode }, blocs fournis',
		(type, id, niveau, mode) => {
			const exs = tirer(id, 4, niveau, mode, type);
			const p = preparerPassage(envoiLecon(bloc(id, exs, mode), niveau));
			expect(p.ok, `${id} : la séance se joue depuis le lien`).toBe(true);
			if (!p.ok) return;
			// Leçon sans modes : mode effectif absent, donc pas de mode dans `runner`.
			expect(runnerDe(p)).toEqual(mode === undefined ? { type } : { type, mode });
			// Les blocs restent fournis : le runner rend ces items, le résultat lit ces captures.
			expect(p.blocs).toHaveLength(1);
			const [b] = p.blocs;
			expect(b.lecon.id).toBe(id);
			expect(b.titre, 'titre au niveau de l’ENVOI (critère 2)').toBe(labelLecon(lecon(id), niveau));
			expect(b.items, 'un item par exercice, dans l’ordre').toHaveLength(exs.length);
			for (const { capture } of b.items) {
				expect(capture.lecon).toBe(id);
				expect(capture.mode).toBe(mode);
				expect(capture.enonce.trim(), `${id} : énoncé lisible`).not.toBe('');
				expect(capture.attendue.trim(), `${id} : attendu lisible`).not.toBe('');
			}
		},
	);

	it.each(UNE_LECON_PAR_RUNNER)(
		'%s : l’énoncé capturé contient le texte de l’exercice (critère 14)',
		(type, id, niveau, mode) => {
			const exs = tirer(id, 4, niveau, mode, type);
			const p = preparerPassage(envoiLecon(bloc(id, exs, mode), niveau));
			expect(p.ok, `${id} : la séance se joue depuis le lien`).toBe(true);
			if (!p.ok) return;
			exs.forEach((ex, i) => {
				const enonce = aplatir(p.blocs[0].items[i].capture.enonce);
				const attendus = textesDeLExercice(ex).flatMap(morceaux);
				expect(attendus.length, `${id} : précondition, l’exercice porte un texte`).toBeGreaterThan(
					0,
				);
				for (const m of attendus) expect(enonce, `${id}, item ${i}`).toContain(m);
			});
		},
	);

	it('bloc SANS mode d’une leçon dont le mode par défaut est le QCM → runner.mode = ce mode effectif', () => {
		const l = lecon('fr-homophones-a');
		expect(defaultMode(l.exerciseType), 'précondition : le QCM est le mode par défaut').toBe('qcm');
		const exs = tirer('fr-homophones-a', 3, 'ce2', undefined, 'qcm');
		const p = preparerPassage(envoiLecon(bloc('fr-homophones-a', exs)));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(runnerDe(p)).toEqual({ type: 'qcm', mode: 'qcm' });
	});

	it('un seul exercice suffit à faire une séance en runner', () => {
		const [ex] = tirer('num-ranger', 1, 'ce2', 'tuiles', 'tuilesOrdre');
		const p = preparerPassage(envoiLecon(bloc('num-ranger', [ex], 'tuiles')));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(runnerDe(p)).toEqual({ type: 'tuilesOrdre', mode: 'tuiles' });
		expect(p.blocs[0].items).toHaveLength(1);
	});
});

describe('preparerPassage — envoi « lecon » qui mêle des formats : refus « format » (contrat 1)', () => {
	/* Ces envois ne sortent pas de `composerLecon` : ils viennent d'un lien forgé, ou d'une
	   fabrique qui changerait de format d'un tirage à l'autre. Un runner ne joue qu'un type. */
	it('fiche PUIS runner, et runner PUIS fiche (le premier exercice ne décide pas pour tous)', () => {
		const qcm = tirer('fr-conj-etre-present', 2, 'ce2', 'qcm', 'qcm');
		const texte = tirer('fr-conj-etre-present', 2, 'ce2', 'saisie', 'text');
		for (const exs of [
			[texte[0], ...qcm],
			[...qcm, texte[0]],
			[qcm[0], texte[0], qcm[1]],
		])
			expect(
				preparerPassage(envoiLecon(bloc('fr-conj-etre-present', exs, 'qcm'))),
				exs.map((e) => e.type).join(' + '),
			).toEqual({ ok: false, raison: 'format' });
	});

	it('runner « toujours » mêlé à une opération posée, leçon sans modes', () => {
		const prob = tirer('math-prob-composition', 2, 'ce2', undefined, 'probleme');
		const [pose] = tirer('calc-addition-posee', 1, 'ce2', undefined, 'posed');
		for (const exs of [
			[pose, ...prob],
			[...prob, pose],
		])
			expect(
				preparerPassage(envoiLecon(bloc('math-prob-composition', exs))),
				exs.map((e) => e.type).join(' + '),
			).toEqual({ ok: false, raison: 'format' });
	});

	it('deux types de runner dans le même mode (QCM + tuiles nombre)', () => {
		const qcm = tirer('fr-conj-etre-present', 2, 'ce2', 'qcm', 'qcm');
		const tuiles = tirer('num-comparer', 2, 'ce2', 'tuiles', 'tuilesNombre');
		for (const exs of [
			[...qcm, ...tuiles],
			[...tuiles, ...qcm],
		])
			expect(
				preparerPassage(envoiLecon(bloc('fr-conj-etre-present', exs, 'qcm'))),
				exs.map((e) => e.type).join(' + '),
			).toEqual({ ok: false, raison: 'format' });
	});

	it('deux types de runner « toujours » sans mode (problème + clic sur le mot)', () => {
		const prob = tirer('math-prob-composition', 2, 'ce2', undefined, 'probleme');
		const clic = tirer('fr-gram-clic-verbe', 2, 'ce2', 'clic', 'clicMot');
		expect(preparerPassage(envoiLecon(bloc('math-prob-composition', [...prob, ...clic])))).toEqual({
			ok: false,
			raison: 'format',
		});
	});
});

describe('preparerPassage — fiche et bilan : jamais de champ runner (contrat 1, critère 27)', () => {
	it('fiche d’une leçon qui A un mode runner, envoyée dans son mode saisie → ok, sans runner', () => {
		const exs = tirer('num-comparer', 4, 'ce2', 'saisie', 'text');
		const p = preparerPassage(envoiLecon(bloc('num-comparer', exs, 'saisie')));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(runnerDe(p)).toBeUndefined();
		expect(p.blocs[0].items).toHaveLength(exs.length);
	});

	it('opération posée (fiche, leçon sans modes) → ok, sans runner', () => {
		const exs = tirer('calc-addition-posee', 3, 'ce2', undefined, 'posed');
		const p = preparerPassage(envoiLecon(bloc('calc-addition-posee', exs)));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(runnerDe(p)).toBeUndefined();
	});

	it('QCM dont le mode effectif est ABSENT (leçon sans modes) : la fiche, pas le runner', () => {
		// Le QCM ne part dans son runner que « dès qu'un mode est retenu ». Sans mode, c'est
		// la fiche : le runner se décide sur le mode effectif, pas sur le seul type.
		const l = lecon('math-complements');
		expect(l.exerciseType.modes ?? [], 'précondition : leçon sans modes').toEqual([]);
		const qcm = tirer('fr-homophones-a', 3, 'ce2', 'qcm', 'qcm');
		const p = preparerPassage(envoiLecon(bloc('math-complements', qcm)));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(runnerDe(p)).toBeUndefined();
	});

	it('bilan d’un seul bloc, tout en QCM, sans mode (défaut QCM) → ok, sans runner : repli en fiche', () => {
		const exs = tirer('fr-homophones-a', 3, 'ce2', undefined, 'qcm');
		const p = preparerPassage(envoiBilan([bloc('fr-homophones-a', exs)]));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(runnerDe(p)).toBeUndefined();
		expect(p.blocs[0].items).toHaveLength(exs.length);
	});

	it('bilan d’un seul bloc de problèmes (runner en toutes circonstances) → ok, sans runner', () => {
		const exs = tirer('math-prob-composition', 3, 'ce2', undefined, 'probleme');
		const p = preparerPassage(envoiBilan([bloc('math-prob-composition', exs)]));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(runnerDe(p)).toBeUndefined();
	});

	it('bilan de plusieurs blocs de types runner différents → ok, sans runner', () => {
		const blocs = [
			bloc('fr-homophones-a', tirer('fr-homophones-a', 2, 'ce2', undefined, 'qcm')),
			bloc('num-ranger', tirer('num-ranger', 2, 'ce2', undefined, 'tuilesOrdre')),
			bloc(
				'math-prob-composition',
				tirer('math-prob-composition', 2, 'ce2', undefined, 'probleme'),
			),
			bloc('fr-gram-clic-verbe', tirer('fr-gram-clic-verbe', 2, 'ce2', undefined, 'clicMot')),
		];
		const p = preparerPassage(envoiBilan(blocs));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(runnerDe(p)).toBeUndefined();
		expect(p.blocs.map((b) => b.items.length)).toEqual(blocs.map((b) => b.exercices.length));
	});
});

/* ============================================================
   2. modesEnvoyables / niveauxEnvoyables
   ============================================================ */

describe('modesEnvoyables — les modes joués en runner sont envoyables (contrat 2, critère 1)', () => {
	it('leçon de conjugaison : la saisie ET le QCM, dans l’ordre des modes de la leçon', () => {
		const l = lecon('fr-conj-etre-present');
		for (const niv of ['ce2', 'cm1'] as const) {
			expect(
				modesPourNiveau(l.exerciseType, niv).map((m) => m.id),
				`précondition @${niv}`,
			).toEqual(['saisie', 'qcm']);
			expect(modesEnvoyables(l, niv), `@${niv}`).toEqual(['saisie', 'qcm']);
		}
	});

	it('le QCM placé EN TÊTE des modes reste en tête', () => {
		const geo = lecon('geo-figures-reconnaitre');
		expect(
			modesPourNiveau(geo.exerciseType, 'ce2').map((m) => m.id),
			'précondition',
		).toEqual(['qcm', 'saisie']);
		expect(modesEnvoyables(geo, 'ce2')).toEqual(['qcm', 'saisie']);
	});

	it.each(UNE_LECON_PAR_RUNNER)(
		'%s : %s @%s propose son mode runner (%s)',
		(_type, id, niveau, mode) => {
			expect(modesEnvoyables(lecon(id), niveau)).toContain(mode);
		},
	);

	it('leçon sans modes jouée en runner (problème) : [undefined], comme une fiche sans modes', () => {
		expect(modesEnvoyables(lecon('math-prob-composition'), 'ce2')).toEqual([undefined]);
	});

	it('niveauxEnvoyables suit : une leçon entièrement à runner est envoyable à tous ses niveaux', () => {
		for (const id of [
			'fr-homophones-a',
			'math-prob-composition',
			'fr-gram-clic-verbe',
			'num-droite-entiers',
			'geo-cm1-figures-proprietes',
		]) {
			const l = lecon(id);
			expect(niveauxEnvoyables(l), id).toEqual(LEVEL_ORDER.filter((n) => l.levels.includes(n)));
		}
	});
});

describe('modesEnvoyables — n’écarte qu’un mode qui mêle des formats ou dont la génération lève (contrat 2)', () => {
	/* Leçons fabriquées : aucune leçon du catalogue ne mêle aujourd'hui des formats dans un
	   mode (mesuré sur 80 tirages par mode). Identifiants propres à chaque leçon : le
	   sondage est mémorisé par identifiant. Le générateur ALTERNE à chaque appel, donc deux
	   sondages suffisent à voir le mélange : aucun hasard dans ce test. */
	function alterne(...exs: Exercise[]): () => Exercise {
		let i = 0;
		return () => exs[i++ % exs.length];
	}

	function leconFabriquee(id: string, parMode: Record<ExerciseMode, () => Exercise>): LessonDef {
		const modes: ModeOption[] = Object.keys(parMode).map((m) => ({ id: m, label: m }));
		const base = lecon('fr-conj-etre-present');
		return {
			...base,
			id,
			exerciseType: {
				...base.exerciseType,
				// Le tirage d'une session entière contournerait le générateur fabriqué.
				generateSession: undefined,
				modes,
				generate: (o?: GenerateOpts) => {
					const gen = o?.mode === undefined ? undefined : parMode[o.mode];
					if (!gen) throw new Error(`mode inattendu : ${String(o?.mode)}`);
					return gen();
				},
			},
		};
	}

	it('un mode dont les tirages alternent fiche et runner est écarté, les autres restent', () => {
		const [qcm] = tirer('fr-conj-etre-present', 1, 'ce2', 'qcm', 'qcm');
		const [texte] = tirer('fr-conj-etre-present', 1, 'ce2', 'saisie', 'text');
		const l = leconFabriquee('test-pr4-mixte-fiche-runner', {
			saisie: () => texte,
			qcm: () => qcm,
			mixte: alterne(qcm, texte),
		});
		expect(modesEnvoyables(l, 'ce2')).toEqual(['saisie', 'qcm']);
	});

	it('un mode dont les tirages alternent deux types de runner est écarté', () => {
		const [qcm] = tirer('fr-conj-etre-present', 1, 'ce2', 'qcm', 'qcm');
		const [tuiles] = tirer('num-comparer', 1, 'ce2', 'tuiles', 'tuilesNombre');
		const [texte] = tirer('fr-conj-etre-present', 1, 'ce2', 'saisie', 'text');
		const l = leconFabriquee('test-pr4-deux-runners', {
			saisie: () => texte,
			deuxRunners: alterne(qcm, tuiles),
			tuiles: () => tuiles,
		});
		expect(modesEnvoyables(l, 'ce2')).toEqual(['saisie', 'tuiles']);
	});

	it('un mode dont la génération lève est écarté, sans lever lui-même', () => {
		const [qcm] = tirer('fr-conj-etre-present', 1, 'ce2', 'qcm', 'qcm');
		const l = leconFabriquee('test-pr4-generation-leve', {
			casse: () => {
				throw new Error('générateur cassé');
			},
			qcm: () => qcm,
		});
		expect(modesEnvoyables(l, 'ce2')).toEqual(['qcm']);
	});
});

/* ============================================================
   3. composerLecon → preparerPassage, et la garantie sur tout le catalogue
   ============================================================ */

describe('composerLecon avec un mode joué en runner (contrat 3)', () => {
	it.each(UNE_LECON_PAR_RUNNER)(
		'%s : %s @%s se compose, et la séance le joue dans son runner',
		(type, id, niveau, mode) => {
			const l = lecon(id);
			const e = envoiDe(composerLecon(optsLecon(l, niveau, mode)), id);
			expect(e.nature).toBe('lecon');
			const exs = e.nature === 'dictee' ? [] : e.blocs.flatMap((b) => b.exercices);
			expect(exs.length).toBeGreaterThan(0);
			for (const ex of exs) expect(ex.type, `${id} : exercices tirés`).toBe(type);
			const p = preparerPassage(e);
			expect(p.ok, `${id} : refusé par la séance`).toBe(true);
			if (!p.ok) return;
			expect(runnerDe(p)).toEqual(mode === undefined ? { type } : { type, mode });
		},
	);
});

describe('garantie sur tout le catalogue : envoyable ⇒ composé, joué, et dans le bon runner (contrat 3, critère 1)', () => {
	/* Attendu dérivé du critère 1 : à chaque niveau, TOUS les modes proposés (ou la leçon
	   elle-même, sans modes). Une leçon dont un mode mêlerait des formats ferait échouer
	   ce test, et c'est voulu : l'encadrant ne pourrait pas l'envoyer. */
	function modesProposes(l: LessonDef, niveau: SchoolLevel): (ExerciseMode | undefined)[] {
		const ids = modesPourNiveau(l.exerciseType, niveau).map((m) => m.id);
		return l.exerciseType.modes?.length ? ids : [undefined];
	}

	it('modesEnvoyables = tous les modes proposés au niveau ; niveauxEnvoyables en ordre scolaire', () => {
		const ecarts: string[] = [];
		for (const l of getAllLessons()) {
			for (const niv of l.levels) {
				const obtenus = modesEnvoyables(l, niv);
				const attendus = modesProposes(l, niv);
				if (JSON.stringify(obtenus) !== JSON.stringify(attendus))
					ecarts.push(
						`${l.id} @${niv} : ${JSON.stringify(obtenus)} au lieu de ${JSON.stringify(attendus)}`,
					);
			}
			const niveaux = LEVEL_ORDER.filter(
				(n) => l.levels.includes(n) && modesProposes(l, n).length > 0,
			);
			if (JSON.stringify(niveauxEnvoyables(l)) !== JSON.stringify(niveaux))
				ecarts.push(
					`${l.id} : niveaux ${JSON.stringify(niveauxEnvoyables(l))} au lieu de ${JSON.stringify(niveaux)}`,
				);
		}
		expect(ecarts).toEqual([]);
	}, 60_000);

	it('chaque leçon × niveau × mode envoyable : composée, préparée, runner = type des exercices (ou absent pour une fiche)', () => {
		const echecs: string[] = [];
		// Comparés en fin de boucle par `toEqual` : insensible à l'ordre des clés, et un
		// `runner` absent vaut `undefined`.
		const runnersObtenus: Record<string, unknown> = {};
		const runnersAttendus: Record<string, unknown> = {};
		const typesVus = new Set<string>();
		let enRunner = 0;
		for (const l of getAllLessons())
			for (const niv of l.levels)
				for (const mode of modesEnvoyables(l, niv)) {
					const quoi = `${l.id} @${niv} (${mode ?? 'sans mode'})`;
					const c = composerLecon(optsLecon(l, niv, mode));
					if (!c.ok) {
						echecs.push(`${quoi} : composition refusée (« ${c.raison} »)`);
						continue;
					}
					const p = preparerPassage(c.envoi);
					if (!p.ok) {
						echecs.push(`${quoi} : refusé par la séance (« ${p.raison} »)`);
						continue;
					}
					const exs = c.envoi.nature === 'dictee' ? [] : c.envoi.blocs.flatMap((b) => b.exercices);
					const effectif = mode ?? defaultMode(l.exerciseType);
					const runners = exs.filter((ex) => seJoueEnRunner(ex.type, effectif));
					runnersObtenus[quoi] = runnerDe(p);
					if (runners.length === 0) {
						runnersAttendus[quoi] = undefined;
						continue;
					}
					const types = new Set(exs.map((ex) => ex.type));
					if (runners.length !== exs.length || types.size !== 1) {
						echecs.push(`${quoi} : composé avec des formats mêlés (${[...types].join(', ')})`);
						continue;
					}
					const [type] = types;
					runnersAttendus[quoi] = effectif === undefined ? { type } : { type, mode: effectif };
					typesVus.add(type);
					enRunner++;
				}
		expect(echecs).toEqual([]);
		expect(runnersObtenus).toEqual(runnersAttendus);
		// Garde de vacuité : sans modes runner envoyables, la boucle n'éprouverait aucun runner.
		expect([...typesVus].sort(), 'les dix runners sont éprouvés sur le catalogue').toEqual([
			...DIX_TYPES_RUNNER,
		]);
		expect(enRunner).toBeGreaterThan(100);
	}, 120_000);
});
