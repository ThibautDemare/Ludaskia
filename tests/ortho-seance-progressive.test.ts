/* ============================================================
   #641 — « L'étape dictée se coche-t-elle ? » (critères 14, 15, 17, 18, 19).

   Écrits AVANT l'implémentation, à partir de l'issue seule. Le cœur du lot est le
   critère 17 : une séance qui ne POUVAIT faire progresser aucun mot ne coche pas
   l'étape du programme du jour, même si elle a été journalisée sur la bonne liste.

   Deux niveaux sont éprouvés, parce qu'ils peuvent diverger :
   - `activiteProgressive` (runner) : cette activité-là pouvait-elle faire monter CE mot ?
   - `etapeSatisfaite` (seance) : ce que vaut la SESSION une fois journalisée.
   Entre les deux, la session traverse le stockage : les entrées sont donc écrites par
   `recordSessionActivity` et relues par `loadActivity`, ce qui éprouve du même coup la
   conservation du drapeau par `normalizeActivity` (critère 18).

   Le nom du drapeau n'est PAS écrit ici : le contrat ne le fixe pas, et un test qui le
   nommerait figerait un détail d'implémentation au lieu du comportement.

   Les symboles/paramètres NEUFS sont atteints par l'ESPACE DE NOMS de leur module, pour
   que l'échec NOMME ce qui manque au lieu de faire exploser le fichier à l'import.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import * as runner from '../src/core/orthographe/runner';
import * as progressApi from '../src/core/progress';
import { loadActivity, normalizeActivity, type ActivityEntry } from '../src/core/progress';
import {
	CONTEXTE_VIDE,
	dateStrDe,
	etapeSatisfaite,
	etatSeanceJour,
	resoudreProgramme,
	enregistrerSeancesFor,
	type ContexteSeance,
	type SeanceDef,
	type SeanceEtape,
	type SeanceModeKind,
} from '../src/core/seance';
import { marquerAtelierFait, validerMode } from '../src/core/orthographe/runner';
import {
	emptyOrthoState,
	addOrGetMot,
	createListe,
	motsDeListe,
	saveOrtho,
} from '../src/core/orthographe/store';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import type { MotOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const LISTE_A = 'liste-semaine-1';
const LISTE_B = 'liste-semaine-2';
const LECON_A = 'math-doubles';

function etape(kind: SeanceModeKind, refs?: string[]): SeanceEtape {
	return refs === undefined ? { id: 'e1', kind, count: 1 } : { id: 'e1', kind, count: 1, refs };
}
const etapeDictee = (): SeanceEtape => etape('dictee', [LISTE_A]);
const epinglees = (lecons: string[] = [], dictees: string[] = []): ContexteSeance => ({
	aRevoirLecons: lecons,
	aRevoirDictees: dictees,
});

/** Session d'orthographe JOURNALISÉE par le chemin réel, puis relue depuis le journal :
    ce qui est éprouvé ensuite, c'est bien l'entrée telle qu'elle ressort du stockage. */
function sessionOrtho(ref: string, progressive: boolean): ActivityEntry {
	progressApi.recordSessionActivity('dictee', ref, progressive);
	const journal = loadActivity();
	return journal[journal.length - 1];
}
/** Entrée telle qu'en écrivait la version ANTÉRIEURE à #641 : aucun drapeau. C'est ce qui
    dort dans le `localStorage` de l'enfant au moment de la mise à jour. */
function sessionHeritee(k: ActivityEntry['k'], ref?: string, t = 1): ActivityEntry {
	return ref === undefined ? { t, k } : { t, k, ref };
}

let compteur = 0;
/** Mot découvert (atelier fait), avec les modes indiqués DÉJÀ validés. La validation passe
    par le runner : c'est la seule fonction qui a le droit d'écrire ces booléens. */
function mot(...modes: ('tuiles' | 'motCache' | 'dictee')[]): MotOrtho {
	const m = addOrGetMot(emptyOrthoState(), { mot: `mot${++compteur}` });
	marquerAtelierFait(m, 1000);
	for (const mode of modes) validerMode(m, mode, 1000);
	return m;
}

/* ============================================================
   0) Contrat d'API — ce que les tests exigent d'exister
   ============================================================ */
describe('#641 — surface attendue', () => {
	it('le runner expose `activiteProgressive` (contrat #641 §B)', () => {
		expect(typeof runner.activiteProgressive).toBe('function');
	});

	it('une session journalisée porte, et conserve, « la séance pouvait faire progresser »', () => {
		const non = sessionOrtho(LISTE_A, false);
		const oui = sessionOrtho(LISTE_A, true);
		// Sans nommer le champ (le contrat ne le nomme pas) : les deux entrées doivent se
		// DISTINGUER une fois relues, sinon plus rien ne pourra les départager en aval.
		expect(non).not.toEqual({ ...oui, t: non.t });
	});

	it('la distinction survit à une deuxième normalisation (relecture du stockage)', () => {
		const non = sessionOrtho(LISTE_A, false);
		const oui = sessionOrtho(LISTE_A, true);
		const [nonRelu] = normalizeActivity([non]);
		const [ouiRelu] = normalizeActivity([oui]);
		expect(nonRelu).toEqual(non);
		expect(nonRelu).not.toEqual({ ...ouiRelu, t: nonRelu.t });
	});
});

/* ============================================================
   1) `activiteProgressive` — « cette activité pouvait-elle faire monter ce mot ? »
   ============================================================ */
describe('activiteProgressive : ce qu’une activité peut faire gagner à un mot', () => {
	it('l’atelier de découverte fait toujours progresser (c’est la marche du bas)', () => {
		const m = addOrGetMot(emptyOrthoState(), { mot: 'chat' });
		expect(runner.activiteProgressive(m, 'atelier', true)).toBe(true);
		expect(runner.activiteProgressive(m, 'atelier', false)).toBe(true);
	});

	it('un mode dont TOUTES les marches sont acquises ne fait plus progresser', () => {
		// Le cas du critère 17 : huit tuiles sur un mot qui a déjà validé les tuiles.
		expect(runner.activiteProgressive(mot('tuiles'), 'tuiles', true)).toBe(false);
		expect(runner.activiteProgressive(mot('tuiles', 'motCache'), 'motCache', true)).toBe(false);
		expect(runner.activiteProgressive(mot('tuiles', 'motCache', 'dictee'), 'dictee', true)).toBe(
			false,
		);
	});

	it('un mode PLUS HAUT fait progresser, parce qu’il entraîne les marches du dessous', () => {
		// Effet direct du critère 1 : la dictée d'un mot au rang « tuiles » gagne deux marches.
		expect(runner.activiteProgressive(mot('tuiles'), 'dictee', true)).toBe(true);
		expect(runner.activiteProgressive(mot('tuiles'), 'motCache', true)).toBe(true);
		expect(runner.activiteProgressive(mot(), 'dictee', true)).toBe(true);
	});

	it('un mode PLUS BAS qu’une marche déjà acquise ne fait rien gagner', () => {
		expect(runner.activiteProgressive(mot('tuiles', 'motCache'), 'tuiles', true)).toBe(false);
		expect(runner.activiteProgressive(mot('tuiles', 'motCache', 'dictee'), 'motCache', true)).toBe(
			false,
		);
	});

	it('critère 20 : sans voix, un mot tuiles + mot caché est au bout, plus rien ne progresse', () => {
		const m = mot('tuiles', 'motCache');
		expect(runner.activiteProgressive(m, 'tuiles', false)).toBe(false);
		expect(runner.activiteProgressive(m, 'motCache', false)).toBe(false);
		// … alors que le même mot progresse encore s'il y a une voix (la dictée reste à faire).
		expect(runner.activiteProgressive(m, 'dictee', true)).toBe(true);
	});
});

/* ============================================================
   2) Critère 14 — l'étape se coche sur ce qui POUVAIT progresser, réussite ou non
   ============================================================ */
describe('critère 14 : la réussite n’entre pas dans le calcul', () => {
	it('un mot neuf raté huit fois pouvait progresser : l’étape se coche quand même', () => {
		const m = mot(); // découvert, rien de validé
		expect(runner.activiteProgressive(m, 'tuiles', true)).toBe(true);
		// L'enfant rate : aucune validation n'est posée, le mot est strictement inchangé…
		expect(m.validation.tuiles).toBe(false);
		expect(runner.activiteProgressive(m, 'tuiles', true)).toBe(true);
		// … et la session, journalisée comme progressive, satisfait l'étape.
		expect(etapeSatisfaite(etapeDictee(), sessionOrtho(LISTE_A, true), CONTEXTE_VIDE)).toBe(true);
	});

	it('une séance de DÉCOUVERTE (que des ateliers) coche l’étape', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		const mots = motsDeListe(s, liste);
		const progressive = mots.some((m) => runner.activiteProgressive(m, 'atelier', true));
		expect(progressive).toBe(true);
		expect(etapeSatisfaite(etapeDictee(), sessionOrtho(LISTE_A, progressive), CONTEXTE_VIDE)).toBe(
			true,
		);
	});
});

/* ============================================================
   3) Critère 17 — le critère central : une séance stérile ne coche rien
   ============================================================ */
describe('critère 17 : huit activités qui ne pouvaient rien faire gagner ne cochent pas', () => {
	it('huit tuiles sur une liste dont tous les mots ont déjà validé les tuiles', () => {
		const mots = [mot('tuiles'), mot('tuiles'), mot('tuiles')];
		// La séance : 8 activités « tuiles » réparties sur la liste.
		const progressive = Array.from({ length: 8 }, (_, i) =>
			runner.activiteProgressive(mots[i % mots.length], 'tuiles', true),
		).some(Boolean);
		expect(progressive).toBe(false);
		expect(etapeSatisfaite(etapeDictee(), sessionOrtho(LISTE_A, progressive), CONTEXTE_VIDE)).toBe(
			false,
		);
	});

	it('témoin : la MÊME liste jouée en dictée coche, parce que le cumul y gagne des marches', () => {
		const mots = [mot('tuiles'), mot('tuiles'), mot('tuiles')];
		const progressive = mots.some((m) => runner.activiteProgressive(m, 'dictee', true));
		expect(progressive).toBe(true);
		expect(etapeSatisfaite(etapeDictee(), sessionOrtho(LISTE_A, progressive), CONTEXTE_VIDE)).toBe(
			true,
		);
	});

	it('une seule activité utile dans les huit suffit à cocher', () => {
		// « au moins une activité qui POUVAIT faire progresser un mot » : c'est un OU.
		const mots = [mot('tuiles'), mot('tuiles'), mot()];
		const progressive = mots.some((m) => runner.activiteProgressive(m, 'tuiles', true));
		expect(progressive).toBe(true);
		expect(etapeSatisfaite(etapeDictee(), sessionOrtho(LISTE_A, progressive), CONTEXTE_VIDE)).toBe(
			true,
		);
	});

	it('bout en bout : le programme du jour ne crédite pas la séance stérile', () => {
		const debut = Date.now() - 5; // même journée à coup sûr, et curseur < session
		enregistrerSeancesFor(activeProfile().uuid, [
			{
				id: 'd1',
				etapes: [etapeDictee()],
				recurrence: { type: 'date', date: dateStrDe(debut) },
			} satisfies SeanceDef,
		]);
		etatSeanceJour(debut); // naissance du programme du jour
		sessionOrtho(LISTE_A, false); // huit tuiles sur une liste déjà tuilée
		expect(resoudreProgramme(Date.now()).etapesCreditees).toEqual([]);
	});

	it('bout en bout, témoin : la même séance devenue utile crédite bien l’étape', () => {
		const debut = Date.now() - 5;
		enregistrerSeancesFor(activeProfile().uuid, [
			{
				id: 'd1',
				etapes: [etapeDictee()],
				recurrence: { type: 'date', date: dateStrDe(debut) },
			} satisfies SeanceDef,
		]);
		etatSeanceJour(debut);
		sessionOrtho(LISTE_A, true);
		expect(resoudreProgramme(Date.now()).etapesCreditees).toEqual(['e1']);
	});

	it('une séance stérile sur une AUTRE liste ne coche pas davantage', () => {
		expect(etapeSatisfaite(etapeDictee(), sessionOrtho(LISTE_B, false), CONTEXTE_VIDE)).toBe(false);
	});
});

/* ============================================================
   4) Critère 15 — une liste acquise, jouée en tour de révision, coche
   ============================================================ */
describe('critère 15 : le parcours complet d’une liste déjà acquise coche l’étape', () => {
	it('l’attribution suit le drapeau de la SESSION, pas l’état courant de la banque', () => {
		// Banque entièrement maîtrisée : plus aucun mot ne peut monter. Le parcours complet
		// s'y joue quand même (tour de révision) et doit rester créditable — sans quoi une
		// liste étoilée mise au programme deviendrait impossible à valider.
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		motsDeListe(s, liste).forEach((m) => {
			marquerAtelierFait(m, 1000);
			validerMode(m, 'dictee', 1000);
		});
		saveOrtho(s);
		expect(etapeSatisfaite(etapeDictee(), sessionOrtho(LISTE_A, true), CONTEXTE_VIDE)).toBe(true);
	});
});

/* ============================================================
   5) Critère 18 — rien de déjà crédité ne se décrédite
   ============================================================ */
describe('critère 18 : une entrée de journal ANTÉRIEURE compte toujours', () => {
	it('une session de dictée sans drapeau satisfait l’étape (l’absence vaut « oui »)', () => {
		expect(etapeSatisfaite(etapeDictee(), sessionHeritee('dictee', LISTE_A), CONTEXTE_VIDE)).toBe(
			true,
		);
	});

	it('… y compris relue par le chemin de lecture du stockage', () => {
		const [relue] = normalizeActivity([sessionHeritee('dictee', LISTE_A)]);
		expect(etapeSatisfaite(etapeDictee(), relue, CONTEXTE_VIDE)).toBe(true);
	});

	it('… et pour une étape « à revoir » visant la même liste', () => {
		expect(
			etapeSatisfaite(
				etape('aRevoir'),
				sessionHeritee('dictee', LISTE_A),
				epinglees([], [LISTE_A]),
			),
		).toBe(true);
	});

	it('le journal d’AVANT #319 (horodatage nu) reste inoffensif', () => {
		const [relue] = normalizeActivity([12345]);
		expect(relue.k).toBe('inconnu');
		expect(etapeSatisfaite(etapeDictee(), relue, CONTEXTE_VIDE)).toBe(false);
	});
});

/* ============================================================
   6) Critère 19 — ce qui bouge, et ce qui ne bouge pas
   ------------------------------------------------------------
   AMENDÉ par le mainteneur en cours de route : la branche DICTÉE de l'étape « à revoir »
   porte désormais la même exigence que l'étape « Une dictée » — épingler une dictée dont
   tous les mots ont déjà validé les tuiles n'ouvre pas une porte dérobée où huit tuiles
   cochent quand même. Restent strictement inchangés : `lecon`, `leconDuJour`, `sprint`,
   `revision`, et la branche LEÇON d'`aRevoir`.
   `tests/seance-attribution.test.ts` couvre déjà leur attribution nominale (#498) : on
   n'éprouve ici que ce que #641 pouvait leur faire.
   ============================================================ */
describe('critère 19 : le drapeau ne déborde pas hors des sessions d’orthographe', () => {
	it('sprint, révision, leçon et leçon du jour se créditent, drapeau ou pas', () => {
		progressApi.recordSessionActivity('revision', undefined, false);
		progressApi.recordSessionActivity('sprint', undefined, false);
		const journal = loadActivity();
		const revision = journal[journal.length - 2];
		const sprint = journal[journal.length - 1];
		expect(etapeSatisfaite(etape('revision'), revision, CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(etape('sprint'), sprint, CONTEXTE_VIDE)).toBe(true);
		// Les leçons ne passent pas par `recordSessionActivity` : leur entrée n'a jamais de
		// drapeau, elle doit continuer de valoir ce qu'elle valait.
		const lecon = sessionHeritee('lecon', LECON_A);
		expect(
			etapeSatisfaite({ id: 'e1', kind: 'lecon', count: 1, ref: LECON_A }, lecon, CONTEXTE_VIDE),
		).toBe(true);
		expect(etapeSatisfaite(etape('leconDuJour'), lecon, CONTEXTE_VIDE)).toBe(true);
	});

	it('AMENDEMENT : une dictée stérile ne coche plus « à revoir » non plus', () => {
		// La règle du critère 17 vaut aussi pour la file épinglée : si tous les mots de la
		// liste ont déjà validé les tuiles, il faut du mot caché ou de la dictée pour que la
		// séance compte. Sans cet amendement, la porte fermée sur l'étape « Une dictée » se
		// rouvrait ici, à l'identique.
		expect(
			etapeSatisfaite(etape('aRevoir'), sessionOrtho(LISTE_A, false), epinglees([], [LISTE_A])),
		).toBe(false);
	});

	it('… mais la même liste travaillée utilement la coche, et elle seule', () => {
		expect(
			etapeSatisfaite(etape('aRevoir'), sessionOrtho(LISTE_A, true), epinglees([], [LISTE_A])),
		).toBe(true);
		// La cible compte toujours autant : une dictée utile HORS de la file ne coche rien.
		expect(
			etapeSatisfaite(etape('aRevoir'), sessionOrtho(LISTE_A, true), epinglees([], [LISTE_B])),
		).toBe(false);
	});

	it('la branche LEÇON d’« à revoir », elle, n’a pas bougé d’un pouce', () => {
		const lecon = sessionHeritee('lecon', LECON_A);
		expect(etapeSatisfaite(etape('aRevoir'), lecon, epinglees([LECON_A], []))).toBe(true);
		expect(etapeSatisfaite(etape('aRevoir'), lecon, epinglees([], [LECON_A]))).toBe(false);
		expect(etapeSatisfaite(etape('aRevoir'), sessionHeritee('lecon'), epinglees([LECON_A]))).toBe(
			false,
		);
		// Une leçon PORTANT le drapeau à faux (état qu'aucun chemin ne produit, faute de
		// mesure équivalente pour une leçon) la crédite quand même : la condition ne suit que
		// les sessions d'orthographe, jamais le type d'entrée.
		progressApi.recordSessionActivity('lecon', LECON_A, false);
		const journal = loadActivity();
		expect(
			etapeSatisfaite(etape('aRevoir'), journal[journal.length - 1], epinglees([LECON_A], [])),
		).toBe(true);
	});

	it('une dictée stérile ne satisfait toujours ni sprint ni révision (la nature compte)', () => {
		const session = sessionOrtho(LISTE_A, false);
		expect(etapeSatisfaite(etape('sprint'), session, CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(etape('revision'), session, CONTEXTE_VIDE)).toBe(false);
	});
});
