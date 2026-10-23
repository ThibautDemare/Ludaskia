/* ============================================================
   Reprise d'un PARCOURS de bilan (#777, critère 16 ; négatifs N1 et N4).

   Trois volets, sans monter l'écran du parcours :
   1. `core/resume.ts` — la nature « runner » relancée comme un BILAN : un instantané de
      parcours valide fait l'aller-retour du stockage avec toute sa charge ; un instantané
      mal formé est écarté ; un ancien instantané « grille » de BILAN (page unique d'avant
      #777) est écarté et purgé (N1), sans emporter la grille d'une FICHE de leçon, qui
      reste la reprise des fiches en saisie ;
   2. `ui/runner-reprise.ts` — la photo du parcours : quand elle vaut la peine, ce qu'elle
      contient, l'exclusion mutuelle avec un runner de leçon, la clôture. Côté N4 (ni la
      reprise ni « Recommencer » ne créditent deux fois), la part LOGIQUE : un parcours
      dont toutes les questions ont une réponse (donc corrigé et crédité) ne produit plus
      jamais de photo, et sa clôture efface la reprise — il n'y a rien à reprendre, donc
      rien à recréditer. Le crédit lui-même vit dans l'écran : N4 de bout en bout est tenu
      par `e2e/bilan-parcours-suivi.spec.ts` ;
   3. le cycle photo → stockage → restauration sur un VRAI parcours tiré du catalogue :
      l'écran qui reprend retrouve ses questions (figures comprises, rendues de nouveau
      interpolables), les réponses données, la partie et la question où reprendre, les
      parties déjà corrigées — et chaque réponse se corrige après la reprise exactement
      comme avant.

   Attendus dérivés du contrat (critère 16 : « Continuer reprend à la première question
   sans réponse, avec les réponses données et les parties déjà corrigées »), recalculés
   ici depuis l'état déclaré, pas recopiés de l'implémentation.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
// Charge les écrans, qui s'enregistrent au niveau de leur module (dont le parcours).
import '../src/ui/navigation';
import { lsGet, lsSet, setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import {
	RESUME_KEY,
	RESUME_VERSION,
	bilanCustomKey,
	getResume,
	hasResume,
	leconKey,
	loadResumes,
	upsertResume,
	type ResumeGrille,
	type ResumeParcours,
	type ResumeRunner,
} from '../src/core/resume';
import { getAllLessons, type BilanConfig, type LessonDef } from '../src/core/catalog';
import {
	construireParcours,
	corrigerQuestion,
	positionDuRang,
	premiereSansReponse,
	questionsDuBilan,
	type PartieBilan,
	type ReponseQuestion,
} from '../src/core/bilan-parcours';
import type { QuestionRevision } from '../src/core/revision-question';
import { html } from '../src/core/html';
import { withSeed } from '../src/core/utils';
import {
	declarerSessionParcours,
	declarerSessionRunner,
	enregistrerParcours,
	enregistrerRunner,
	finirSessionParcours,
	finirSessionRunner,
	quitterSessionRunner,
	restaurerRunner,
	snapshotRunner,
	type SessionParcours,
} from '../src/ui/runner-reprise';
import { captureResume, clearResumeCtx, setResumeCtx } from '../src/ui/resume';
import { setSessionRecorded } from '../src/ui/navigation';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	// États de MODULE : session de runner, session de parcours, contexte de grille.
	finirSessionRunner();
	quitterSessionRunner();
	clearResumeCtx();
	setSessionRecorded(false);
	document.body.innerHTML = '';
	// « Dans une activité » : `goHome()` (restauration qui renonce) se contente de router.
	location.hash = 'lecon-en-cours';
});

/* ---------- Fixtures ---------- */

const CONFIG: BilanConfig = {
	id: 'fav-1',
	label: 'Mon bilan',
	lessonIds: ['math-complements', 'fr-homophones-et'],
	questionsPerLesson: 3,
};

/** Instantané de parcours tel que la photo l'écrit. `questions` (les parties) et
    `parcours` sont opaques pour le stockage : des valeurs simples suffisent ici. */
function parcours(over: Partial<ResumeParcours> = {}): ResumeParcours {
	return {
		kind: 'runner',
		key: bilanCustomKey(),
		version: RESUME_VERSION,
		savedAt: 1000,
		mode: 'custom',
		label: 'Mon bilan',
		icon: 'clipboard-text',
		categoryId: null,
		relaunch: { type: 'bilan', config: CONFIG },
		total: 4,
		answered: 2,
		runner: 'bilan-parcours',
		exerciseMode: null,
		questions: [{ categoryId: 'math-calcul-mental', questions: [{ q: 'A' }, { q: 'B' }] }],
		idx: 2,
		score: 1,
		parcours: {
			reponses: [{ kind: 'passe' }, { kind: 'saisie', valeur: '12' }, null, null],
			partiesCorrigees: 1,
			ecouleMs: 5000,
		},
		...over,
	};
}

/** Grille (#63), au format courant ou hérité (sans `kind`). */
function grille(
	relaunch: ResumeGrille['relaunch'],
	over: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		kind: 'grille',
		key: 'lecon-fiche',
		version: RESUME_VERSION,
		savedAt: 1000,
		mode: 'lecon',
		label: 'Fiche',
		icon: 'calculator',
		categoryId: 'math-calcul',
		relaunch,
		total: 10,
		answered: 4,
		sheetsHTML: '<div class="page"></div>',
		items: { a0: { text: '2+3', answer: 5, kind: 'num' } },
		answers: { a0: '5' },
		activeId: 'a0',
		elapsedMs: 5000,
		...over,
	};
}
/** Le même instantané tel qu'écrit avant #498 : sans champ `kind`. */
const sansKind = (o: Record<string, unknown>): Record<string, unknown> =>
	Object.fromEntries(Object.entries(o).filter(([cle]) => cle !== 'kind'));

const ecrireBrut = (entrees: unknown[]): void => lsSet(RESUME_KEY, entrees);

const IDENTITE: SessionParcours['identite'] = {
	key: bilanCustomKey('math-numeration'),
	mode: 'custom',
	label: 'Bilan de numération',
	icon: 'list-numbers',
	categoryId: 'math-numeration',
	config: CONFIG,
};

/** Faux parcours : l'état est relu À LA PHOTO, le modifier simule la progression. */
function sessionParcours(identite = IDENTITE, runner = 'parcours-factice') {
	const etat = {
		parties: [{ categoryId: 'math-numeration', questions: [{ q: 'A' }, { q: 'B' }, { q: 'C' }] }],
		idx: 0,
		total: 3,
		score: 0,
		parcours: { reponses: [null, null, null], partiesCorrigees: 0, ecouleMs: 0 } as unknown,
	};
	declarerSessionParcours({ runner, identite, etat: () => etat });
	return etat;
}

const leconMaths = (): LessonDef => getAllLessons().find((l) => l.subject === 'math')!;

/* ============================================================
   1. core/resume — l'instantané de parcours et l'ancienne grille de bilan
   ============================================================ */
describe('Stockage d’un instantané de parcours (critère 16)', () => {
	it('un parcours valide fait l’aller-retour, avec sa relance de bilan et toute sa charge', () => {
		const snap = parcours({ savedAt: 2000 });
		upsertResume(snap);
		const relu = getResume(bilanCustomKey(), 3000);
		expect(relu).toEqual(snap);
		expect(relu?.relaunch).toEqual({ type: 'bilan', config: CONFIG });
	});

	it('un parcours mal formé est écarté, les valides restent', () => {
		const ok = parcours({ key: 'ok' });
		ecrireBrut([
			ok,
			{ ...parcours({ key: 'sans-etat' }), parcours: undefined },
			{ ...parcours({ key: 'etat-null' }), parcours: null },
			{ ...parcours({ key: 'etat-texte' }), parcours: 'oups' },
			{ ...parcours({ key: 'sans-config' }), relaunch: { type: 'bilan' } },
			{ ...parcours({ key: 'config-null' }), relaunch: { type: 'bilan', config: null } },
			{
				...parcours({ key: 'lecons-non-tableau' }),
				relaunch: { type: 'bilan', config: { ...CONFIG, lessonIds: 'math-complements' } },
			},
			{ ...parcours({ key: 'parties-non-tableau' }), questions: { 0: 'A' } },
			{ ...parcours({ key: 'idx-texte' }), idx: '2' },
		]);
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['ok']);
	});

	it('N1 : une grille de BILAN (format courant ou hérité) est écartée et purgée ; celle d’une fiche reste', () => {
		const relanceBilan = { type: 'bilan' as const, config: CONFIG };
		const relanceLecon = { type: 'lecon' as const, lessonId: 'math-complements' };
		ecrireBrut([
			grille(relanceBilan, { key: 'bilan-express-math-calcul', savedAt: 1400 }),
			sansKind(grille(relanceBilan, { key: 'bilan-custom-avant-498', savedAt: 1300 })),
			grille(relanceLecon, { key: 'lecon-fiche', savedAt: 1200 }),
			sansKind(grille(relanceLecon, { key: 'lecon-heritee', savedAt: 1100 })),
		]);
		const reprises = loadResumes(2000);
		expect(reprises.map((s) => s.key)).toEqual(['lecon-fiche', 'lecon-heritee']);
		expect(reprises.every((s) => s.kind === 'grille')).toBe(true);
		// Purgées POUR DE BON : le stockage ne les retraîne plus.
		expect(lsGet(RESUME_KEY, [])).toHaveLength(2);
	});

	it('N1 : sous la même clé, une vieille grille de bilan plus récente ne masque pas le parcours', () => {
		ecrireBrut([
			grille({ type: 'bilan', config: CONFIG }, { key: bilanCustomKey(), savedAt: 1900 }),
			parcours({ savedAt: 1000 }),
		]);
		const relu = getResume(bilanCustomKey(), 2000);
		expect(relu?.kind).toBe('runner');
		expect(relu?.relaunch.type).toBe('bilan');
		expect(loadResumes(2000)).toHaveLength(1);
	});
});

/* ============================================================
   2. ui/runner-reprise — la photo du parcours
   ============================================================ */
describe('Photo d’un parcours : quand elle vaut la peine', () => {
	it('aucune question répondue (idx = 0) : pas de carte « À continuer »', () => {
		sessionParcours();
		expect(snapshotRunner(1000)).toBe(null);
	});

	it('une réponse donnée (idx = 1) : la photo est prise', () => {
		const etat = sessionParcours();
		etat.idx = 1;
		expect(snapshotRunner(1000)?.answered).toBe(1);
	});

	it('dernière question entamée (idx = total − 1) : la photo est prise', () => {
		const etat = sessionParcours();
		etat.idx = etat.total - 1;
		expect(snapshotRunner(1000)?.answered).toBe(etat.total - 1);
	});

	it('N4 : toutes les questions ont une réponse (idx = total), donc bilan corrigé et crédité : plus de photo', () => {
		const etat = sessionParcours();
		etat.idx = etat.total;
		expect(snapshotRunner(1000)).toBe(null);
		// Et la capture ne recrée rien à reprendre.
		captureResume();
		expect(hasResume(IDENTITE.key, Date.now())).toBe(false);
	});

	it('parcours vide : rien à reprendre, à tout index', () => {
		const etat = sessionParcours();
		etat.parties = [];
		etat.total = 0;
		expect(snapshotRunner(1000)).toBe(null);
		etat.idx = 1;
		expect(snapshotRunner(1000)).toBe(null);
	});
});

describe('Photo d’un parcours : ce qu’elle contient', () => {
	it('identité du bilan, relance par sa config, progression et état, dérivés de la déclaration', () => {
		const etat = sessionParcours();
		etat.idx = 2;
		etat.score = 1;
		etat.parcours = { reponses: [{ kind: 'passe' }, { kind: 'choix', valeur: 'et' }, null] };
		const snap = snapshotRunner(7777);
		expect(snap).toEqual({
			kind: 'runner',
			key: IDENTITE.key,
			version: RESUME_VERSION,
			savedAt: 7777,
			mode: IDENTITE.mode,
			label: IDENTITE.label,
			icon: IDENTITE.icon,
			categoryId: IDENTITE.categoryId,
			relaunch: { type: 'bilan', config: CONFIG },
			total: 3,
			answered: 2,
			runner: 'parcours-factice',
			exerciseMode: null,
			questions: etat.parties,
			idx: 2,
			score: 1,
			parcours: etat.parcours,
		});
	});

	it('l’état est relu À LA PHOTO, pas figé à la déclaration', () => {
		const etat = sessionParcours();
		etat.idx = 1;
		expect(snapshotRunner(1000)).toMatchObject({ idx: 1, answered: 1 });
		etat.idx = 2;
		etat.parcours = { reponses: ['x'], partiesCorrigees: 1, ecouleMs: 9 };
		expect(snapshotRunner(2000)).toMatchObject({
			idx: 2,
			answered: 2,
			savedAt: 2000,
			parcours: { partiesCorrigees: 1 },
		});
	});

	it('une leçon lancée après le bilan prend la place du parcours, et inversement', () => {
		const etatBilan = sessionParcours();
		etatBilan.idx = 1;
		const lecon = leconMaths();
		const etatLecon = { questions: [{ q: 'A' }, { q: 'B' }] as unknown[], idx: 1, score: 1 };
		declarerSessionRunner({
			runner: 'faux',
			lesson: lecon,
			exerciseMode: null,
			etat: () => etatLecon,
		});
		expect(snapshotRunner(1000)?.key).toBe(leconKey(lecon.id));
		sessionParcours().idx = 1;
		expect(snapshotRunner(1000)?.key).toBe(IDENTITE.key);
		// Le bilan fini, la leçon d'avant ne revient pas se faire photographier.
		finirSessionParcours();
		expect(snapshotRunner(1000)).toBe(null);
	});

	it('captureResume photographie le parcours en cours, même avec un contexte de grille résiduel', () => {
		const etat = sessionParcours();
		etat.idx = 2;
		document.body.innerHTML = '<div id="sheets"><input class="ans" id="a0" value="21"></div>';
		setResumeCtx({
			key: 'lecon-fiche',
			mode: 'lecon',
			label: 'Fiche',
			icon: 'calculator',
			categoryId: 'math-calcul',
			relaunch: { type: 'lecon', lessonId: 'fiche' },
		});
		captureResume();
		const reprises = loadResumes(Date.now());
		expect(reprises.map((s) => s.key)).toEqual([IDENTITE.key]);
		expect(reprises[0].kind).toBe('runner');
		expect(reprises[0].relaunch).toEqual({ type: 'bilan', config: CONFIG });
	});
});

describe('Fin et sortie du parcours', () => {
	it('quitter l’écran garde la reprise, mais la session ne se rephotographie plus', () => {
		const etat = sessionParcours();
		etat.idx = 2;
		upsertResume(snapshotRunner(Date.now() - 60_000)!);
		quitterSessionRunner();
		expect(snapshotRunner(Date.now())).toBe(null);
		etat.idx = 3;
		captureResume();
		expect(getResume(IDENTITE.key, Date.now())?.answered).toBe(2);
	});

	it('N4 : la clôture (bilan crédité) efface la reprise de CE bilan, et elle seule', () => {
		const etat = sessionParcours();
		etat.idx = 2;
		upsertResume(snapshotRunner(1000)!);
		upsertResume(parcours({ key: 'bilan-custom-autre', savedAt: 900 }));
		finirSessionParcours();
		expect(hasResume(IDENTITE.key, 2000)).toBe(false);
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['bilan-custom-autre']);
		// Plus de session : aucune capture ne recrée la reprise effacée.
		expect(snapshotRunner(2000)).toBe(null);
		captureResume();
		expect(hasResume(IDENTITE.key, Date.now())).toBe(false);
	});

	it('la clôture est idempotente et n’efface rien sans parcours en cours', () => {
		upsertResume(parcours({ key: 'bilan-custom-autre', savedAt: 900 }));
		finirSessionParcours();
		finirSessionParcours();
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['bilan-custom-autre']);
	});
});

/* ============================================================
   3. Restauration
   ============================================================ */
describe('Restauration d’un parcours', () => {
	it('un parcours ne va jamais au registre des leçons, ni une leçon à celui des parcours', () => {
		const recusLecon: ResumeRunner[] = [];
		const recusParcours: ResumeParcours[] = [];
		enregistrerRunner('meme-nom', (s) => recusLecon.push(s));
		enregistrerParcours('meme-nom', (s) => recusParcours.push(s));
		expect(restaurerRunner(parcours({ runner: 'meme-nom' }))).toBe(true);
		expect([recusLecon.length, recusParcours.length]).toEqual([0, 1]);
		const lecon: ResumeRunner = {
			...parcours(),
			runner: 'meme-nom',
			relaunch: { type: 'lecon', lessonId: 'math-complements' },
		};
		expect(restaurerRunner(lecon)).toBe(true);
		expect([recusLecon.length, recusParcours.length]).toEqual([1, 1]);
		// Un nom connu du seul registre des leçons ne rejoue pas un parcours.
		enregistrerRunner('lecon-seule', () => undefined);
		expect(restaurerRunner(parcours({ runner: 'lecon-seule' }))).toBe(false);
	});

	it('l’écran du parcours est enregistré sous son nom de stockage « bilan-parcours »', () => {
		// Contrat de STOCKAGE : le nom dort 7 jours dans les instantanés. Parties vides : le
		// restaurateur reconnaît l'instantané et renonce aussitôt (retour à l'accueil).
		expect(restaurerRunner(parcours({ runner: 'bilan-parcours', questions: [] }))).toBe(true);
		expect(restaurerRunner(parcours({ runner: 'parcours-disparu' }))).toBe(false);
	});

	it('cycle complet sur un vrai parcours : questions, réponses, partie et question courantes, parties corrigées', () => {
		// Une leçon dont les questions portent un DESSIN : la figure doit revenir interpolable.
		const aDessin = (q: QuestionRevision): boolean =>
			((q.kind === 'num' || q.kind === 'qcm') && q.item.figure !== undefined) ||
			(q.kind === 'probleme' && q.figure !== undefined);
		const leconDessin = getAllLessons().find(
			(l) =>
				l.levels.includes('ce2') &&
				withSeed(9, () => questionsDuBilan(l, 3, 'ce2')).filter(aDessin).length === 3,
		);
		expect(leconDessin, 'précondition : une leçon CE2 à dessins').toBeDefined();
		const config: BilanConfig = {
			...CONFIG,
			lessonIds: ['math-complements', leconDessin!.id, 'fr-homophones-et'],
		};
		const parties = withSeed(9, () => construireParcours(config));
		const toutes = parties.flatMap((p) => p.questions);
		expect(parties.length, 'précondition : au moins deux parties').toBeGreaterThanOrEqual(2);
		expect(
			parties[1].questions.length,
			'précondition : 3 questions en partie 2',
		).toBeGreaterThanOrEqual(3);
		expect(toutes.some(aDessin), 'précondition : un dessin dans le parcours').toBe(true);

		// Partie 1 entièrement répondue et corrigée ; partie 2 : deux réponses, puis rien.
		const n0 = parties[0].questions.length;
		const repondre = (q: QuestionRevision, i: number): ReponseQuestion =>
			i % 2 === 0
				? { kind: 'passe' }
				: q.kind === 'qcm'
					? { kind: 'choix', valeur: q.choices[0] }
					: { kind: 'saisie', valeur: '7' };
		const reponses: (ReponseQuestion | null)[] = toutes.map((q, i) =>
			i < n0 + 2 ? repondre(q, i) : null,
		);
		const etat = {
			parties: parties as unknown[],
			idx: n0 + 2,
			total: toutes.length,
			score: 0,
			parcours: { reponses, partiesCorrigees: 1, ecouleMs: 42_000 } as unknown,
		};
		declarerSessionParcours({ runner: 'parcours-cycle', identite: IDENTITE, etat: () => etat });
		const rejoues: ResumeParcours[] = [];
		enregistrerParcours('parcours-cycle', (s) => rejoues.push(s));

		// L'enfant quitte : photo, clôture SANS effacement ; il revient et clique « Continuer ».
		upsertResume(snapshotRunner(1000)!);
		quitterSessionRunner();
		const relu = getResume(IDENTITE.key, 2000);
		if (!relu || relu.kind !== 'runner') throw new Error('instantané de parcours attendu');
		expect(restaurerRunner(relu)).toBe(true);
		expect(rejoues).toHaveLength(1);
		const r = rejoues[0];
		const partiesRelues = r.questions as PartieBilan[];
		const etatRelu = r.parcours as {
			reponses: (ReponseQuestion | null)[];
			partiesCorrigees: number;
			ecouleMs: number;
		};

		// Mêmes questions, pas un nouveau tirage.
		expect(JSON.stringify(partiesRelues)).toBe(JSON.stringify(parties));
		// Mêmes réponses, mêmes parties corrigées, même temps écoulé.
		expect(etatRelu).toEqual({ reponses, partiesCorrigees: 1, ecouleMs: 42_000 });
		// Reprise à la première question sans réponse : partie 2, 3e question.
		expect(r.idx).toBe(n0 + 2);
		expect(premiereSansReponse(etatRelu.reponses)).toBe(r.idx);
		expect(positionDuRang(partiesRelues, r.idx)).toEqual({ partie: 1, question: 2 });
		// Chaque réponse donnée se corrige APRÈS la reprise comme AVANT.
		const touteRelues = partiesRelues.flatMap((p) => p.questions);
		toutes.forEach((q, i) => {
			const rep = reponses[i] ?? { kind: 'passe' };
			expect(corrigerQuestion(touteRelues[i], rep), `question ${i}`).toEqual(
				corrigerQuestion(q, rep),
			);
		});
		// Les dessins reviennent interpolables dans un gabarit (un objet nu y serait refusé),
		// et le même dessin qu'avant.
		const dessin = (q: QuestionRevision) =>
			q.kind === 'probleme'
				? q.figure
				: q.kind === 'num' || q.kind === 'qcm'
					? q.item.figure
					: undefined;
		const dessinsRelus = touteRelues.filter(aDessin);
		expect(dessinsRelus.length).toBe(toutes.filter(aDessin).length);
		for (const q of dessinsRelus) {
			expect(() => html`${dessin(q)}`, q.lessonId).not.toThrow();
			expect(html`${dessin(q)}`.balisage).toBe(
				html`${dessin(toutes[touteRelues.indexOf(q)])}`.balisage,
			);
		}
	});
});

/* ============================================================
   Position de reprise : (partie, question) d'un rang global
   ============================================================ */
describe('Position de reprise (positionDuRang, premiereSansReponse)', () => {
	const UNE: QuestionRevision = withSeed(1, () =>
		questionsDuBilan(
			getAllLessons().find((l) => l.id === 'math-complements')!,
			1,
			'ce2',
		),
	)[0];
	const parties = (...tailles: number[]): PartieBilan[] =>
		tailles.map((n) => ({ categoryId: 'c', questions: Array.from({ length: n }, () => UNE) }));

	it('rang global → (partie, question), bornes comprises ; au-delà de la fin, null', () => {
		const p = parties(3, 2, 4);
		expect(positionDuRang(p, 0)).toEqual({ partie: 0, question: 0 });
		expect(positionDuRang(p, 2)).toEqual({ partie: 0, question: 2 });
		expect(positionDuRang(p, 3)).toEqual({ partie: 1, question: 0 });
		expect(positionDuRang(p, 4)).toEqual({ partie: 1, question: 1 });
		expect(positionDuRang(p, 5)).toEqual({ partie: 2, question: 0 });
		expect(positionDuRang(p, 8)).toEqual({ partie: 2, question: 3 });
		expect(positionDuRang(p, 9)).toBe(null);
		expect(positionDuRang([], 0)).toBe(null);
	});

	it('reprise à la PREMIÈRE question sans réponse, même suivie de réponses ; « Je passe » est une réponse', () => {
		const passe: ReponseQuestion = { kind: 'passe' };
		expect(premiereSansReponse([null, null])).toBe(0);
		expect(premiereSansReponse([passe, null, passe])).toBe(1);
		// « Je passe » est une réponse (la question est traitée), pas un trou.
		expect(premiereSansReponse([passe, passe])).toBe(2);
		expect(premiereSansReponse([])).toBe(0);
	});
});
