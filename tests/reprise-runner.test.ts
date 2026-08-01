/* ============================================================
   Reprise des runners « une question à la fois » (#498).

   Trois volets, tous testables sans montage d'écran :
   1. `core/resume.ts` — l'union `grille` / `runner` et, surtout, la
      RÉTROCOMPATIBILITÉ : un instantané écrit avant #498 n'a pas de `kind` et
      doit rester lisible, sinon toute reprise en cours serait perdue à la mise
      à jour de l'appli (régression invisible : l'enfant ne voit qu'une carte
      « À continuer » disparue) ;
   2. `ui/runner-reprise.ts` — la mécanique de session : quand une leçon vaut la
      peine d'être reprise, ce que contient la photo, ce qui se passe quand on
      QUITTE l'écran (session close, instantané gardé) et quand on TERMINE
      l'essai (session close, instantané effacé) ;
   3. l'articulation avec `ui/resume.ts` (`captureResume`) : les deux natures se
      photographient l'une après l'autre sans se voler la place.

   Attendus DÉRIVÉS du contrat (une photo = l'état logique du runner au moment
   où l'enfant quitte, rejouable à l'identique), pas recopiés de
   l'implémentation : les valeurs attendues (clé, total/answered, libellé,
   icône) sont recalculées ici depuis la leçon et depuis l'état déclaré.

   Le rendu des dix runners (écran, interactions) relève du smoke Playwright ;
   on ne pilote ici que ce qui vit hors du DOM.
   ============================================================ */
import { beforeEach, describe, test, expect, vi } from 'vitest';
// Charge les dix runners, qui s'enregistrent au niveau de leur module (la navigation les
// importe statiquement — c'est ce qui rend le registre complet au démarrage de l'appli).
// L'ORDRE de cet import n'a plus d'importance : `runner-reprise` est un module feuille
// (invariant verrouillé plus bas par « module feuille »).
import '../src/ui/navigation';
import { lsGet, lsSet, setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import {
	RESUME_KEY,
	RESUME_VERSION,
	RESUME_TTL_MS,
	RESUME_MAX_STORED,
	leconKey,
	loadResumes,
	getResume,
	hasResume,
	upsertResume,
	removeResume,
	type ResumeGrille,
	type ResumeRunner,
} from '../src/core/resume';
import { getAllLessons } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import {
	declarerSessionRunner,
	quitterSessionRunner,
	finirSessionRunner,
	snapshotRunner,
	enregistrerRunner,
	restaurerRunner,
} from '../src/ui/runner-reprise';
import { finishLeconRun } from '../src/ui/lecon-runner-shared';
import { captureResume, setResumeCtx, clearResumeCtx } from '../src/ui/resume';
import { createRenderContext } from '../src/core/items';
import { setRenderCtx, setSessionRecorded } from '../src/ui/navigation';

/* ---------- Fixtures ---------- */

/** Instantané de grille (#63) tel que l'appli l'écrit AUJOURD'HUI (avec `kind`). */
function grille(over: Partial<ResumeGrille> = {}): ResumeGrille {
	return {
		kind: 'grille',
		key: 'lecon-fiche',
		version: RESUME_VERSION,
		savedAt: 1000,
		mode: 'lecon',
		label: 'Fiche en saisie',
		icon: 'calculator',
		categoryId: 'math-calcul',
		relaunch: { type: 'lecon', lessonId: 'fiche' },
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

/** Instantané de runner (#498). */
function runner(over: Partial<ResumeRunner> = {}): ResumeRunner {
	return {
		kind: 'runner',
		key: 'lecon-qcm-x',
		version: RESUME_VERSION,
		savedAt: 1000,
		mode: 'lecon',
		label: 'Leçon QCM',
		icon: 'book-open',
		categoryId: 'fr-grammaire',
		relaunch: { type: 'lecon', lessonId: 'qcm-x' },
		total: 8,
		answered: 3,
		runner: 'qcm',
		exerciseMode: 'reconnaissance',
		questions: [{ q: 'A' }, { q: 'B' }, { q: 'C' }],
		idx: 3,
		score: 2,
		...over,
	};
}

/** Instantané tel qu'il a été écrit AVANT #498 : aucun champ `kind`. On le
    construit à la main (et non depuis le type courant) — c'est exactement ce
    qui dort dans le `localStorage` des enfants au moment de la mise à jour. */
function grilleHeritee(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		key: 'lecon-avant-498',
		version: RESUME_VERSION,
		savedAt: 1000,
		mode: 'lecon',
		label: 'Additions posées',
		icon: 'calculator',
		categoryId: 'math-calcul',
		relaunch: { type: 'lecon', lessonId: 'avant-498' },
		total: 12,
		answered: 5,
		sheetsHTML: '<div class="page">déjà rempli</div>',
		items: { a0: { text: '12+9', answer: 21, kind: 'num' } },
		answers: { a0: '21' },
		activeId: 'a0',
		elapsedMs: 42000,
		...over,
	};
}

/** Écrit tel quel dans le stockage (sans passer par `upsertResume`, qui
    n'accepterait pas un instantané hérité ni malformé). */
function ecrireBrut(entrees: unknown[]): void {
	lsSet(RESUME_KEY, entrees);
}

const leconMaths = (): LessonDef => getAllLessons().find((l) => l.subject === 'math')!;
const leconFrancais = (): LessonDef => getAllLessons().find((l) => l.subject === 'francais')!;

/** État mutable d'un faux runner : la session lit `etat()` À LA PHOTO, donc
    modifier cet objet simule la progression de l'enfant. */
function sessionFactice(lesson: LessonDef, exerciseMode: string | null = 'reconnaissance') {
	const etat = {
		questions: [{ q: 'A' }, { q: 'B' }, { q: 'C' }, { q: 'D' }] as unknown[],
		idx: 0,
		score: 0,
	};
	declarerSessionRunner({ runner: 'faux-runner', lesson, exerciseMode, etat: () => etat });
	return etat;
}

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	// Fraîcheur des états de MODULE : session de runner et contexte de grille sont deux
	// singletons ; un reste de test précédent fausserait la capture.
	finirSessionRunner();
	clearResumeCtx();
	setSessionRecorded(false);
	document.body.innerHTML = '';
	// On se place « dans une activité » : `goHome()` (appelé par la restauration
	// d'un runner sans questions) se contente alors de router.
	location.hash = 'lecon-en-cours';
});

/** Met en place une fiche en saisie « en cours » : un champ rempli dans #sheets + le
    contexte de reprise posé par `runLecon`. C'est ce que `captureResume` photographie
    quand aucun runner n'est actif. */
function ficheEnSaisie(key: string, valeur = '21'): void {
	document.body.innerHTML = `<div id="sheets"><input class="ans" id="a0" value="${valeur}"></div>`;
	setRenderCtx(createRenderContext());
	setSessionRecorded(false);
	setResumeCtx({
		key,
		mode: 'lecon',
		label: 'Fiche en saisie',
		icon: 'calculator',
		categoryId: 'math-calcul',
		relaunch: { type: 'lecon', lessonId: 'fiche' },
	});
}

/* ============================================================
   1. core/resume — rétrocompatibilité (instantanés d'avant #498)
   ============================================================ */
describe('Instantanés écrits avant le double format (#498)', () => {
	test('un instantané sans `kind` est lu comme une grille, avec tout son contenu', () => {
		ecrireBrut([grilleHeritee()]);
		const list = loadResumes(2000);
		expect(list.length).toBe(1);
		const s = list[0];
		expect(s.kind).toBe('grille');
		expect(s.key).toBe('lecon-avant-498');
		// La carte « À continuer » reste rendable…
		expect(s.label).toBe('Additions posées');
		expect(s.answered).toBe(5);
		expect(s.total).toBe(12);
		// … et surtout l'exercice reste REJOUABLE (le DOM et les réponses saisies).
		if (s.kind !== 'grille') throw new Error('nature inattendue');
		expect(s.sheetsHTML).toBe('<div class="page">déjà rempli</div>');
		expect(s.answers).toEqual({ a0: '21' });
		expect(s.activeId).toBe('a0');
		expect(s.elapsedMs).toBe(42000);
		expect(s.items.a0.answer).toBe(21);
	});

	test('les accès par clé voient aussi les instantanés hérités', () => {
		ecrireBrut([grilleHeritee()]);
		expect(hasResume('lecon-avant-498', 2000)).toBe(true);
		expect(getResume('lecon-avant-498', 2000)?.kind).toBe('grille');
	});

	test('un instantané hérité survit à une purge déclenchée par une entrée voisine', () => {
		// Une entrée cassée force la réécriture du stockage : l'héritée ne doit pas
		// être emportée ni perdre sa charge au passage.
		ecrireBrut([grilleHeritee(), { key: 'cassé' }]);
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['lecon-avant-498']);
		// Relecture après réécriture : toujours là, toujours complète.
		const apres = getResume('lecon-avant-498', 2000);
		expect(apres?.kind).toBe('grille');
		expect(apres && apres.kind === 'grille' && apres.sheetsHTML).toBe(
			'<div class="page">déjà rempli</div>',
		);
		expect(lsGet(RESUME_KEY, []).length).toBe(1);
	});

	test('un instantané hérité MAL FORMÉ reste ignoré, sans emporter les valides', () => {
		ecrireBrut([
			grilleHeritee({ key: 'ok' }),
			grilleHeritee({ key: 'sans-html', sheetsHTML: undefined }),
			grilleHeritee({ key: 'items-cassés', items: 'oups' }),
			grilleHeritee({ key: 'answers-manquantes', answers: null }),
			grilleHeritee({ key: 'chrono-cassé', elapsedMs: '42' }),
		]);
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['ok']);
	});

	test('une grille du format courant et une grille héritée cohabitent', () => {
		ecrireBrut([grilleHeritee({ savedAt: 1000 }), grille({ key: 'lecon-fiche', savedAt: 2000 })]);
		const list = loadResumes(3000);
		expect(list.map((s) => s.key)).toEqual(['lecon-fiche', 'lecon-avant-498']);
		expect(list.every((s) => s.kind === 'grille')).toBe(true);
	});
});

/* ============================================================
   2. core/resume — la nature « runner »
   ============================================================ */
describe('Instantané de runner : aller-retour et validation', () => {
	test('aller-retour : questions, index, score et mode reviennent intacts', () => {
		upsertResume(runner({ savedAt: 2000 }));
		const s = getResume('lecon-qcm-x', 3000);
		expect(s?.kind).toBe('runner');
		if (!s || s.kind !== 'runner') throw new Error('nature inattendue');
		expect(s.runner).toBe('qcm');
		expect(s.exerciseMode).toBe('reconnaissance');
		expect(s.questions).toEqual([{ q: 'A' }, { q: 'B' }, { q: 'C' }]);
		expect(s.idx).toBe(3);
		expect(s.score).toBe(2);
		// Le `relaunch` resserré reste exploitable sans re-tester la nature.
		expect(s.relaunch).toEqual({ type: 'lecon', lessonId: 'qcm-x' });
	});

	test('`exerciseMode` null (type mono-mode) est conservé tel quel', () => {
		upsertResume(runner({ key: 'lecon-mono', exerciseMode: null }));
		const s = getResume('lecon-mono', 2000);
		expect(s && s.kind === 'runner' && s.exerciseMode).toBe(null);
	});

	test('un instantané de runner mal formé est ignoré, les valides restent', () => {
		ecrireBrut([
			runner({ key: 'ok' }),
			{ ...runner({ key: 'sans-runner' }), runner: undefined },
			{ ...runner({ key: 'questions-non-tableau' }), questions: { 0: 'A' } },
			{ ...runner({ key: 'idx-texte' }), idx: '3' },
			{ ...runner({ key: 'score-texte' }), score: null },
		]);
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['ok']);
	});

	test("un `kind` inconnu (ni grille ni runner) n'est pas repris", () => {
		// Cas réaliste : une version future écrit une 3e nature, cette version-ci la relit.
		ecrireBrut([
			runner({ key: 'ok' }),
			{
				kind: 'sprint',
				key: 'nature-future',
				version: RESUME_VERSION,
				savedAt: 1000,
				mode: 'lecon',
				label: 'Sprint',
				icon: 'timer',
				categoryId: null,
				relaunch: { type: 'lecon', lessonId: 'z' },
				total: 5,
				answered: 2,
				restantMs: 60000,
			},
		]);
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['ok']);
	});

	test("un `kind` inconnu n'est pas rattrapé en grille au vu de ses seuls champs", () => {
		// Piège inverse du précédent : la 3e nature porte AUSSI une charge de grille
		// (rendu + réponses). La lire comme une grille rejouerait un écran qu'on ne sait
		// pas restaurer ; seuls `kind` absent (hérité) ou `'grille'` valent grille.
		ecrireBrut([
			runner({ key: 'ok' }),
			{ ...grille({ key: 'faux-ami' }), kind: 'sprint' },
			{ ...grille({ key: 'kind-vide' }), kind: '' },
			{ ...grille({ key: 'kind-numérique' }), kind: 1 },
		]);
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['ok']);
		// … alors qu'un instantané hérité (aucun champ `kind`), lui, passe toujours.
		ecrireBrut([grilleHeritee()]);
		expect(loadResumes(2000).map((s) => s.kind)).toEqual(['grille']);
	});

	test('le TTL et la purge silencieuse valent aussi pour un runner', () => {
		ecrireBrut([runner({ key: 'vieux', savedAt: 1000 }), runner({ key: 'récent', savedAt: 5000 })]);
		const maintenant = 1000 + RESUME_TTL_MS + 1;
		expect(loadResumes(maintenant).map((s) => s.key)).toEqual(['récent']);
		expect(lsGet(RESUME_KEY, []).length).toBe(1); // purgé pour de bon
	});

	test('removeResume efface un runner sans toucher aux autres', () => {
		upsertResume(runner({ key: 'a', savedAt: 1000 }));
		upsertResume(grille({ key: 'b', savedAt: 2000 }));
		removeResume('a');
		expect(loadResumes(3000).map((s) => s.key)).toEqual(['b']);
	});
});

/* ============================================================
   3. core/resume — les deux natures dans le même stockage
   ============================================================ */
describe('Cohabitation des deux natures', () => {
	test('grille, runner et instantané hérité se lisent ensemble, du plus récent au plus ancien', () => {
		ecrireBrut([
			grille({ key: 'g', savedAt: 1000 }),
			runner({ key: 'r', savedAt: 3000 }),
			grilleHeritee({ key: 'h', savedAt: 2000 }),
		]);
		const list = loadResumes(4000);
		expect(list.map((s) => s.key)).toEqual(['r', 'h', 'g']);
		expect(list.map((s) => s.kind)).toEqual(['runner', 'grille', 'grille']);
	});

	test('une leçon jouée en fiche puis en runner garde UNE seule reprise (la dernière)', () => {
		// Même leçon = même clé : la nature change, pas l'identité de l'exercice.
		const cle = leconKey('math-doubles');
		upsertResume(grille({ key: cle, savedAt: 1000, answered: 4, total: 10 }));
		upsertResume(runner({ key: cle, savedAt: 2000, answered: 3, total: 8 }));
		const list = loadResumes(3000);
		expect(list.length).toBe(1);
		expect(list[0].kind).toBe('runner');
		expect(list[0].answered).toBe(3);
		// … et dans l'autre sens (le runner ne « verrouille » pas la clé).
		upsertResume(grille({ key: cle, savedAt: 3000, answered: 7 }));
		const apres = loadResumes(4000);
		expect(apres.length).toBe(1);
		expect(apres[0].kind).toBe('grille');
		expect(apres[0].answered).toBe(7);
	});

	test('le plafond de stockage compte les deux natures ensemble (les plus récentes gardées)', () => {
		const total = RESUME_MAX_STORED * 2;
		for (let i = 0; i < total; i++) {
			const commun = { key: 'k' + i, savedAt: 1000 + i };
			upsertResume(i % 2 === 0 ? grille(commun) : runner(commun));
		}
		const list = loadResumes(1000 + total + 1);
		expect(list.length).toBe(RESUME_MAX_STORED);
		// Les 12 dernières écrites, du plus récent au plus ancien.
		const attendues = Array.from({ length: RESUME_MAX_STORED }, (_, i) => 'k' + (total - 1 - i));
		expect(list.map((s) => s.key)).toEqual(attendues);
		// Aucune nature n'est sacrifiée au profit de l'autre.
		expect(list.filter((s) => s.kind === 'runner').length).toBe(RESUME_MAX_STORED / 2);
		expect(list.filter((s) => s.kind === 'grille').length).toBe(RESUME_MAX_STORED / 2);
	});
});

/* ============================================================
   4. snapshotRunner — ce qui vaut la peine d'être repris
   ============================================================ */
describe('snapshotRunner — bornes de la photo', () => {
	test('aucune session déclarée : rien à photographier', () => {
		expect(snapshotRunner(1000)).toBe(null);
	});

	test('aucune question validée (idx = 0) : pas de carte « À continuer »', () => {
		const etat = sessionFactice(leconMaths());
		etat.idx = 0;
		expect(snapshotRunner(1000)).toBe(null);
	});

	test('une seule question validée (idx = 1) : la photo est prise', () => {
		const etat = sessionFactice(leconMaths());
		etat.idx = 1;
		etat.score = 1;
		const snap = snapshotRunner(1000);
		expect(snap).not.toBe(null);
		expect(snap?.answered).toBe(1);
	});

	test('dernière question entamée (idx = longueur − 1) : la photo est prise', () => {
		const etat = sessionFactice(leconMaths());
		etat.idx = etat.questions.length - 1;
		const snap = snapshotRunner(1000);
		expect(snap?.answered).toBe(3);
		expect(snap?.total).toBe(4);
	});

	test('toutes les questions validées (idx = longueur) : plus rien à reprendre', () => {
		const etat = sessionFactice(leconMaths());
		etat.idx = etat.questions.length;
		expect(snapshotRunner(1000)).toBe(null);
	});

	test('série vide (aucune question tirée) : rien à reprendre, à tout index', () => {
		const etat = sessionFactice(leconMaths());
		etat.questions = [];
		etat.idx = 0;
		expect(snapshotRunner(1000)).toBe(null);
		etat.idx = 1; // index incohérent : ne doit pas produire une reprise vide
		expect(snapshotRunner(1000)).toBe(null);
	});

	test('après la clôture de session (essai terminé), plus aucune photo possible', () => {
		const etat = sessionFactice(leconMaths());
		etat.idx = 2;
		expect(snapshotRunner(1000)).not.toBe(null);
		finirSessionRunner();
		expect(snapshotRunner(1000)).toBe(null);
	});

	test('après avoir quitté l’écran, plus aucune photo possible (session morte)', () => {
		// Sinon l'état de module du runner survivrait à la sortie et se ferait
		// rephotographier indéfiniment, à la place de l'exercice réellement en cours.
		const etat = sessionFactice(leconMaths());
		etat.idx = 2;
		expect(snapshotRunner(1000)).not.toBe(null);
		quitterSessionRunner();
		expect(snapshotRunner(1000)).toBe(null);
		// Même en « avançant » l'état laissé derrière : la session est morte, point.
		etat.idx = 3;
		expect(snapshotRunner(2000)).toBe(null);
	});
});

describe('snapshotRunner — contenu de la photo', () => {
	test('identité, progression et de quoi relancer, dérivés de la leçon et de l’état', () => {
		const lecon = leconMaths();
		const etat = sessionFactice(lecon, 'reconnaissance');
		etat.idx = 2;
		etat.score = 1;
		const snap = snapshotRunner(7777);
		expect(snap).not.toBe(null);
		if (!snap) throw new Error('photo attendue');
		expect(snap.kind).toBe('runner');
		expect(snap.key).toBe(leconKey(lecon.id)); // même identité que la fiche en saisie
		expect(snap.version).toBe(RESUME_VERSION);
		expect(snap.savedAt).toBe(7777); // l'horloge est fournie, jamais lue par le module
		expect(snap.mode).toBe('lecon');
		expect(snap.relaunch).toEqual({ type: 'lecon', lessonId: lecon.id });
		// Progression exprimée dans l'unité commune aux deux natures.
		expect(snap.total).toBe(4); // = nombre de questions tirées
		expect(snap.answered).toBe(2); // = questions déjà validées
		// État logique du runner.
		expect(snap.runner).toBe('faux-runner');
		expect(snap.exerciseMode).toBe('reconnaissance');
		expect(snap.questions).toEqual(etat.questions);
		expect(snap.idx).toBe(2);
		expect(snap.score).toBe(1);
	});

	test('libellé, catégorie et icône viennent de la leçon (carte identique à celle d’une fiche)', () => {
		const maths = leconMaths();
		const etat = sessionFactice(maths);
		etat.idx = 1;
		const snapMaths = snapshotRunner(1000);
		expect(snapMaths?.label).toBe(maths.label);
		expect(snapMaths?.categoryId).toBe(maths.category);
		expect(snapMaths?.icon).toBe('calculator'); // pastille « maths »

		const francais = leconFrancais();
		const etatFr = sessionFactice(francais);
		etatFr.idx = 1;
		const snapFr = snapshotRunner(1000);
		expect(snapFr?.label).toBe(francais.label);
		expect(snapFr?.categoryId).toBe(francais.category);
		expect(snapFr?.icon).toBe('book-open'); // pastille « français »
	});

	test('`exerciseMode` null d’un type mono-mode traverse la photo', () => {
		const etat = sessionFactice(leconMaths(), null);
		etat.idx = 1;
		expect(snapshotRunner(1000)?.exerciseMode).toBe(null);
	});

	test('l’état est relu À LA PHOTO, pas figé à la déclaration de session', () => {
		const etat = sessionFactice(leconMaths());
		etat.idx = 1;
		etat.score = 1;
		expect(snapshotRunner(1000)).toMatchObject({ idx: 1, score: 1, answered: 1, savedAt: 1000 });
		// L'enfant continue…
		etat.idx = 3;
		etat.score = 2;
		etat.questions = [...etat.questions, { q: 'E' }];
		expect(snapshotRunner(2000)).toMatchObject({
			idx: 3,
			score: 2,
			answered: 3,
			total: 5,
			savedAt: 2000,
		});
	});

	test('la reprise stockée est une PHOTO : l’état vivant qui bouge ensuite ne la modifie pas', () => {
		const etat = sessionFactice(leconMaths());
		etat.idx = 2;
		etat.score = 2;
		const snap = snapshotRunner(1000)!;
		upsertResume(snap);
		// Le runner continue de tourner après la sauvegarde (l'enfant revient à l'écran).
		etat.questions.push({ q: 'Z' });
		etat.idx = 3;
		const relu = getResume(leconKey(leconMaths().id), 2000);
		if (!relu || relu.kind !== 'runner') throw new Error('runner attendu');
		expect(relu.idx).toBe(2);
		expect(relu.questions.length).toBe(4);
		expect(relu.total).toBe(4);
	});
});

/* ============================================================
   5. Quitter l'écran ≠ terminer l'essai
   ============================================================ */
describe('Quitter l’écran : la session se ferme, la reprise reste', () => {
	test('quitterSessionRunner GARDE l’instantané déjà stocké (c’est toute la différence)', () => {
		const lecon = leconMaths();
		const etat = sessionFactice(lecon);
		etat.idx = 2;
		etat.score = 2;
		upsertResume(snapshotRunner(1000)!); // photo prise en quittant l'écran
		quitterSessionRunner();
		// La carte « À continuer » doit survivre : c'est justement là qu'elle sert.
		const relu = getResume(leconKey(lecon.id), 2000);
		expect(relu?.kind).toBe('runner');
		expect(relu?.answered).toBe(2);
	});

	test('quitterSessionRunner est idempotent et n’efface aucune reprise', () => {
		upsertResume(runner({ key: 'lecon-a', savedAt: 900 }));
		upsertResume(grille({ key: 'lecon-b', savedAt: 950 }));
		quitterSessionRunner();
		quitterSessionRunner();
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['lecon-b', 'lecon-a']);
	});

	test('l’instantané d’un runner quitté ne se rafraîchit plus aux captures suivantes', () => {
		// `savedAt` ordonne la section « À continuer » : une session morte qui se
		// rephotographie remonterait éternellement en tête, devant l'exercice du jour.
		const lecon = leconMaths();
		const etat = sessionFactice(lecon);
		etat.idx = 2;
		// Photo « il y a une minute » (une date réaliste : la capture suivante passe par
		// l'horloge réelle, et une reprise trop vieille serait purgée par le TTL).
		const photo = Date.now() - 60_000;
		upsertResume(snapshotRunner(photo)!);
		quitterSessionRunner();

		ficheEnSaisie('lecon-fiche');
		captureResume(); // capture suivante (l'enfant quitte un AUTRE exercice)
		const relu = getResume(leconKey(lecon.id), Date.now());
		expect(relu?.savedAt).toBe(photo); // date de la photo d'origine, pas celle du jour
	});
});

describe('Capture croisée des deux natures (régression #63 × #498)', () => {
	test('une leçon-runner interrompue n’empêche plus la sauvegarde de la fiche suivante', () => {
		// Scénario réel : QCM abandonné à la question 3 → accueil → leçon « fiche en
		// saisie » remplie → accueil. Les deux exercices doivent figurer dans
		// « À continuer ». `captureResume` interrogeant le runner EN PREMIER, une session
		// laissée ouverte volait la place de la fiche, qui n'était alors jamais sauvegardée.
		const lecon = leconMaths();
		const etat = sessionFactice(lecon);
		etat.idx = 2;
		etat.score = 1;

		// 1) L'enfant quitte l'écran du runner (= ce que fait `resetSessionUI`).
		captureResume();
		quitterSessionRunner();
		expect(loadResumes(Date.now()).map((s) => s.key)).toEqual([leconKey(lecon.id)]);

		// 2) Il enchaîne sur une fiche en saisie, la remplit, puis la quitte.
		ficheEnSaisie('lecon-fiche');
		captureResume();
		quitterSessionRunner();

		// Les DEUX reprises coexistent, chacune dans sa nature.
		const list = loadResumes(Date.now());
		expect(list.map((s) => s.key).sort()).toEqual([leconKey(lecon.id), 'lecon-fiche'].sort());
		expect(list.find((s) => s.key === 'lecon-fiche')?.kind).toBe('grille');
		expect(list.find((s) => s.key === leconKey(lecon.id))?.kind).toBe('runner');
		// La fiche a bien capturé la réponse saisie (reprise réellement rejouable).
		const fiche = list.find((s) => s.key === 'lecon-fiche');
		if (!fiche || fiche.kind !== 'grille') throw new Error('grille attendue');
		expect(fiche.answers).toEqual({ a0: '21' });
		expect(fiche.answered).toBe(1);
	});

	test('tant que le runner est À L’ÉCRAN, c’est lui qui est photographié', () => {
		// L'inverse doit rester vrai : une session vivante prime sur un contexte de
		// grille résiduel (le runner n'a pas de champs dans #sheets à photographier).
		const lecon = leconFrancais();
		const etat = sessionFactice(lecon);
		etat.idx = 2;
		ficheEnSaisie('lecon-fiche'); // contexte de grille encore posé
		captureResume();
		const list = loadResumes(Date.now());
		expect(list.map((s) => s.key)).toEqual([leconKey(lecon.id)]);
		expect(list[0].kind).toBe('runner');
	});
});

describe('Terminer l’essai : la reprise disparaît', () => {
	test('finirSessionRunner efface la reprise de la leçon en cours, et elle seule', () => {
		const lecon = leconMaths();
		const etat = sessionFactice(lecon);
		etat.idx = 2;
		upsertResume(snapshotRunner(1000)!);
		upsertResume(grille({ key: 'lecon-autre', savedAt: 900 }));
		expect(loadResumes(2000).length).toBe(2);

		finirSessionRunner();
		expect(hasResume(leconKey(lecon.id), 2000)).toBe(false);
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['lecon-autre']);
	});

	test('finirSessionRunner est idempotent et n’efface rien sans session déclarée', () => {
		upsertResume(grille({ key: 'lecon-autre', savedAt: 900 }));
		finirSessionRunner(); // aucune session : ne doit rien emporter
		finirSessionRunner();
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['lecon-autre']);
	});

	test('terminer un essai (finishLeconRun) efface sa reprise et enregistre l’essai', () => {
		const lecon = leconMaths();
		const etat = sessionFactice(lecon);
		etat.idx = 3;
		etat.score = 3;
		upsertResume(snapshotRunner(1000)!);
		upsertResume(runner({ key: 'lecon-une-autre', savedAt: 900 }));
		expect(hasResume(leconKey(lecon.id), 2000)).toBe(true);

		const out = finishLeconRun(lecon.id, 4, 4);
		// La leçon terminée n'a plus rien à continuer…
		expect(hasResume(leconKey(lecon.id), 2000)).toBe(false);
		// … mais les reprises des AUTRES exercices survivent.
		expect(loadResumes(2000).map((s) => s.key)).toEqual(['lecon-une-autre']);
		// L'essai a bien été enregistré (parité des modes : étoile évaluée).
		expect(out.starInfo?.perfect).toBe(true);
		// Session close : plus de photo possible derrière.
		expect(snapshotRunner(2000)).toBe(null);
	});
});

/* ============================================================
   6. Registre : rejouer un instantané
   ============================================================ */
describe('Registre des runners', () => {
	test('un runner inconnu ne rejoue rien et le dit (false)', () => {
		// Cas réel : l'instantané a 7 jours de TTL, il peut survivre au runner qui l'a écrit.
		expect(restaurerRunner(runner({ runner: 'runner-disparu' }))).toBe(false);
	});

	test('un runner enregistré reçoit l’instantané exact et rend true', () => {
		const recus: ResumeRunner[] = [];
		enregistrerRunner('runner-de-test', (snap) => recus.push(snap));
		const snap = runner({ runner: 'runner-de-test', idx: 2, score: 1 });
		expect(restaurerRunner(snap)).toBe(true);
		expect(recus.length).toBe(1);
		expect(recus[0]).toBe(snap);
	});

	test('les dix runners livrés sont enregistrés sous leur nom historique', () => {
		// Le nom du runner est un contrat de STOCKAGE : il dort dans les instantanés
		// jusqu'à 7 jours. Un runner qui oublierait de s'enregistrer (ou qu'on
		// renommerait) rendrait ces reprises injouables — l'enfant cliquerait
		// « Continuer » pour atterrir à l'accueil.
		const noms = [
			'qcm',
			'qcmMulti',
			'tri',
			'ordre',
			'tuiles',
			'tableau',
			'appariement',
			'clicMot',
			'droiteGraduee',
			'probleme',
		];
		for (const nom of noms) {
			// Série vide + leçon inexistante : la restauration reconnaît le runner mais
			// renonce aussitôt, sans monter d'écran (le rendu relève du smoke e2e).
			const snap = runner({
				runner: nom,
				questions: [],
				relaunch: { type: 'lecon', lessonId: 'lecon-inexistante' },
			});
			expect(restaurerRunner(snap)).toBe(true);
		}
	});

	test('cycle complet : photo → stockage → relecture → rejeu à l’identique', () => {
		const lecon = leconFrancais();
		const rejoues: ResumeRunner[] = [];
		enregistrerRunner('runner-cycle', (snap) => rejoues.push(snap));
		const etat = { questions: [{ q: 'A' }, { q: 'B' }, { q: 'C' }] as unknown[], idx: 2, score: 1 };
		declarerSessionRunner({
			runner: 'runner-cycle',
			lesson: lecon,
			exerciseMode: 'saisie',
			etat: () => etat,
		});
		// L'enfant quitte l'écran : photo, puis clôture SANS effacement.
		upsertResume(snapshotRunner(1000)!);
		quitterSessionRunner();
		// … il revient plus tard et clique « Continuer ».
		const relu = getResume(leconKey(lecon.id), 2000);
		if (!relu || relu.kind !== 'runner') throw new Error('runner attendu');
		expect(restaurerRunner(relu)).toBe(true);
		expect(rejoues.length).toBe(1);
		// Le runner retrouve SES questions (pas un nouveau tirage) et sa progression.
		expect(rejoues[0].questions).toEqual([{ q: 'A' }, { q: 'B' }, { q: 'C' }]);
		expect(rejoues[0].idx).toBe(2);
		expect(rejoues[0].score).toBe(1);
		expect(rejoues[0].exerciseMode).toBe('saisie');
		expect(rejoues[0].relaunch.lessonId).toBe(lecon.id);
	});
});

/* ============================================================
   7. Module feuille : le garde-fou anti-écran-blanc
   ============================================================ */
describe('runner-reprise est un module FEUILLE', () => {
	test('il s’importe seul, sans qu’aucun autre module UI ait été chargé avant', async () => {
		// Les dix runners appellent `enregistrerRunner` AU NIVEAU DE LEUR MODULE. Si la
		// mécanique de reprise participait au cycle d'imports de l'UI (navigation ↔
		// runners ↔ resume), un runner à moitié initialisé pourrait la dépasser et lire
		// son registre avant sa création : `ReferenceError: Cannot access 'registre'
		// before initialization`, soit un écran BLANC au démarrage selon le point
		// d'entrée. Ce test échoue si l'on rajoute un import applicatif dans ce module.
		vi.resetModules();
		const frais = await import('../src/ui/runner-reprise');
		// Le module est utilisable tel quel, sans autre chargement préalable.
		const lecon = leconMaths();
		frais.declarerSessionRunner({
			runner: 'isolé',
			lesson: lecon,
			exerciseMode: null,
			etat: () => ({ questions: [{ q: 'A' }, { q: 'B' }], idx: 1, score: 1 }),
		});
		expect(frais.snapshotRunner(1000)?.key).toBe(leconKey(lecon.id));
		// Registre neuf et fonctionnel dans cette instance isolée.
		expect(frais.restaurerRunner(runner({ runner: 'isolé' }))).toBe(false);
	});

	test('le squelette des runners s’importe lui aussi sans ordre imposé', async () => {
		// `lecon-runner-shared` reste, lui, au cœur du cycle (il rend l'écran de résultat) :
		// on vérifie qu'il se charge en premier sans faire exploser les enregistrements.
		vi.resetModules();
		const frais = await import('../src/ui/lecon-runner-shared');
		expect(typeof frais.finishLeconRun).toBe('function');
	});
});
