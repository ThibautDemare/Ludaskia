/* ============================================================
   #659 — « Révision espacée : les trophées et niveaux gagnés ne sont jamais annoncés ».

   Une session de révision fait avancer TOUS les compteurs (XP, essai, stats de leçon)
   et n'annonce rien : la récompense est découverte plus tard dans la galerie, sans lien
   avec ce que l'enfant venait de faire. Le lot factorise le calcul déjà écrit deux fois
   (core/lesson-run.ts et la copie privée d'ui/ortho-runner.ts) dans `core/recompenses-fin`,
   puis le branche sur l'écran de fin de révision.

   Ce fichier tient le CALCUL (logique pure). L'annonce à l'écran — modale, confettis,
   rien au milieu de la session (critère 6) — relève de la spec Playwright.

   Attendus dérivés des critères de l'issue, pas de l'implémentation :
   - les seuils de trophée viennent de la table `TROPHIES`, les paliers de déblocage des
     tables `MASCOTTE`/`AVATARS_FORET` (ce sont les données qui font foi) ;
   - les scénarios reproduisent ce qu'écrit VRAIMENT `ui/revision.ts:renderDone`
     (1 XP par bonne réponse, un essai `revision-espacee`, les stats de leçon), pour que
     les seuils tombent comme ils tomberaient en vrai.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { recompensesFin } from '../src/core/recompenses-fin';
import type { CelebEntry } from '../src/core/recompenses-fin';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { lsGet, setOnDataWrite } from '../src/core/storage';
import {
	addXP,
	getXP,
	niveauDepuisXP,
	recordLessonStats,
	recordRun,
	xpPourNiveau,
	ACTIVITY_KEY,
	LESSON_STATS_KEY,
	RUNS_KEY,
	XP_KEY,
} from '../src/core/progress';
import { evaluateTrophies, loadTrophies, TROPHIES } from '../src/core/rewards';
import type { Trophy } from '../src/core/rewards';
import { AVATARS_FORET, MASCOTTE } from '../src/core/unlocks';
import { getAllLessons } from '../src/core/catalog';
import { recordLessonRun } from '../src/core/lesson-run';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Petit outillage ---------- */

function trouver<T>(liste: T[], predicat: (x: T) => boolean, quoi: string): T {
	const x = liste.find(predicat);
	if (!x) throw new Error(`introuvable dans les données : ${quoi}`);
	return x;
}

const trophee = (id: string): Trophy => trouver(TROPHIES, (t) => t.id === id, `trophée ${id}`);

// Une leçon réelle du catalogue : les compteurs de matière (`subjectCorrect`) ne
// s'agrègent que sur des ids connus, un id inventé ne franchirait aucun seuil.
const leconCe2 = () =>
	trouver(getAllLessons(), (l) => l.levels.includes('ce2'), 'leçon CE2 au catalogue');

/* Ce qu'une session de révision écrit RÉELLEMENT (ui/revision.ts) : 1 XP par bonne
   réponse, un essai `revision-espacee`, les stats des leçons rejouées. Et rien d'autre :
   aujourd'hui, aucune annonce — c'est tout le sujet de #659. */
function sessionRevision(lessonId: string, ok: number, total: number): void {
	addXP(ok);
	recordRun('revision-espacee', ok, total, 60_000);
	recordLessonStats({ [lessonId]: { ok, total } }, 'revision');
}

/* Historique du profil AVANT la session : des compteurs déjà avancés, mais aucun seuil
   franchi. L'`evaluateTrophies` final joue le rattrapage de l'accueil (render.ts) — après
   lui, il ne doit RIEN rester en attente, sans quoi le test mesurerait le passé. */
function historiqueSansTrophee(lessonId: string, ok: number, total: number): void {
	recordLessonStats({ [lessonId]: { ok, total } }, 'lecon', lessonId);
	expect(evaluateTrophies()).toEqual([]);
}

/* ============================================================
   Ce qui a été gagné pendant la session
   ============================================================ */
describe('recompensesFin — ce qu’une fin de session a réellement gagné (#659)', () => {
	it('critère 1 : le trophée décroché pendant la session ressort dans la célébration', () => {
		const lecon = leconCe2();
		// 99 réponses au compteur : le palier « 100 calculs » tombera PENDANT la révision.
		historiqueSansTrophee(lecon.id, 30, 99);
		const niveauAvant = niveauDepuisXP(getXP());
		sessionRevision(lecon.id, 8, 10);

		const res = recompensesFin(niveauAvant);
		const vol = trophee('vol100');
		expect(res.celeb).toContainEqual({ icon: vol.icon, text: `Trophée : ${vol.title}` });
	});

	it('critère 2 : un niveau franchi est rendu, même quand aucun déblocage n’y est attaché', () => {
		const lecon = leconCe2();
		expect(niveauDepuisXP(getXP())).toBe(1);
		// Pile de quoi atteindre le niveau 2 : aucune table n'ouvre quoi que ce soit à ce
		// palier, et pourtant le niveau lui-même est une récompense à annoncer.
		sessionRevision(lecon.id, xpPourNiveau(2), xpPourNiveau(2));

		const res = recompensesFin(1);
		expect(res.niveauApres).toBe(2);
		expect(res.niveauGagne).toBe(2);
		expect(res.recompensesNiv).toEqual([]);
	});

	it('critère 2 : plusieurs paliers franchis d’un coup rendent TOUS leurs déblocages', () => {
		const lecon = leconCe2();
		historiqueSansTrophee(lecon.id, 5, 10);
		// L'écart de niveaux compte, pas la façon dont il a été gagné : on pose l'XP du
		// niveau 5 (long historique, sauvegarde réimportée…). Trois paliers traversés.
		addXP(xpPourNiveau(5));
		expect(niveauDepuisXP(getXP())).toBe(5);

		const res = recompensesFin(1);
		expect(res.niveauGagne).toBe(5);
		// Attendus lus dans les tables de déblocage : le compagnon éclot au niveau 3,
		// le premier avatar forêt s'ouvre au niveau 5. Ne garder que le dernier palier
		// (ou que le premier) en perdrait un.
		const mascotte3 = trouver(MASCOTTE, (m) => m.seuil === 3, 'mascotte du niveau 3');
		const avatar5 = trouver(AVATARS_FORET, (a) => a.niveau === 5, 'avatar du niveau 5');
		expect(res.recompensesNiv.map((r) => r.type)).toEqual(['mascotte', 'avatar']);
		expect(res.recompensesNiv.map((r) => r.icone)).toEqual([mascotte3.emoji, avatar5.emoji]);
		// Le premier rang ne s'ouvre qu'au niveau 10 : rien de ce qui n'est pas atteint.
		expect(res.recompensesNiv.some((r) => r.type === 'rang')).toBe(false);
	});

	it('critère 3 : deux trophées et un niveau dans la même session — tout ressort', () => {
		const lecon = leconCe2();
		// 99 réponses dont 45 bonnes dans la matière : la session fera tomber « 100 calculs »
		// (100 réponses) ET « 50 bonnes réponses » de la matière, d'un seul coup.
		historiqueSansTrophee(lecon.id, 45, 99);
		addXP(xpPourNiveau(2) - 10); // …et il reste 10 bonnes réponses avant le niveau 2
		const niveauAvant = niveauDepuisXP(getXP());
		expect(niveauAvant).toBe(1);

		sessionRevision(lecon.id, 10, 10);
		const res = recompensesFin(niveauAvant);

		const vol = trophee('vol100');
		const matiere = trophee(`subj-${lecon.subject}-50`);
		expect(res.niveauGagne).toBe(2);
		expect(res.celeb).toHaveLength(2); // aucune des deux n'est avalée par l'autre
		expect(res.celeb).toEqual(
			expect.arrayContaining([
				{ icon: vol.icon, text: `Trophée : ${vol.title}` },
				{ icon: matiere.icon, text: `Trophée : ${matiere.title}` },
			]),
		);
	});

	it('critère 7 : une session sans rien gagner ne fabrique aucune annonce', () => {
		const lecon = leconCe2();
		historiqueSansTrophee(lecon.id, 6, 10);
		const niveauAvant = niveauDepuisXP(getXP());
		sessionRevision(lecon.id, 3, 4); // 3 XP, aucun seuil approché

		const res = recompensesFin(niveauAvant);
		// Des listes VIDES, pas un `undefined` ni une entrée creuse : c'est ce qui permet à
		// l'appelant de ne rien afficher du tout (ni bloc vide, ni titre orphelin).
		expect(res.celeb).toEqual([]);
		expect(res.recompensesNiv).toEqual([]);
		expect(res.niveauGagne).toBe(0);
		expect(res.niveauApres).toBe(niveauAvant);
	});
});

/* ============================================================
   Critère négatif 5 : jamais deux fois
   ============================================================ */
describe('recompensesFin — aucune récompense annoncée deux fois (critère 5)', () => {
	it('un second passage sur l’écran de fin n’a plus rien à annoncer', () => {
		const lecon = leconCe2();
		historiqueSansTrophee(lecon.id, 30, 99);
		const niveauAvant = niveauDepuisXP(getXP());
		sessionRevision(lecon.id, 12, 12); // franchit « 100 calculs » ET le niveau 2

		const premier = recompensesFin(niveauAvant);
		expect(premier.celeb.length).toBeGreaterThan(0);
		expect(premier.niveauGagne).toBe(2);

		// L'appelant avance son curseur avec le `niveauApres` rendu : rien ne revient.
		const second = recompensesFin(premier.niveauApres);
		expect(second.celeb).toEqual([]);
		expect(second.niveauGagne).toBe(0);
		expect(second.recompensesNiv).toEqual([]);
	});

	it('le rattrapage de l’accueil (render.ts) ne trouve plus rien à rattraper', () => {
		const lecon = leconCe2();
		historiqueSansTrophee(lecon.id, 30, 99);
		sessionRevision(lecon.id, 12, 12);

		const res = recompensesFin(niveauDepuisXP(getXP()));
		expect(res.celeb.length).toBeGreaterThan(0);
		// Retour à l'accueil : `render.ts` rappelle evaluateTrophies() « sans célébration
		// ici ». S'il trouvait encore quelque chose, l'annonce reviendrait par l'autre porte.
		expect(evaluateTrophies()).toEqual([]);
		// …parce que le trophée annoncé est déjà PERSISTÉ : un rechargement ne le
		// redécouvre pas non plus.
		expect(loadTrophies()).toContain('vol100');
	});

	it('la liste de célébration de l’appelant n’est pas modifiée au passage', () => {
		const lecon = leconCe2();
		historiqueSansTrophee(lecon.id, 30, 99);
		const base: CelebEntry[] = [{ icon: '🌟', text: 'Liste prête, bravo !' }];
		const niveauAvant = niveauDepuisXP(getXP());
		sessionRevision(lecon.id, 5, 5);

		const res = recompensesFin(niveauAvant, base);
		expect(res.celeb[0]).toEqual({ icon: '🌟', text: 'Liste prête, bravo !' });
		expect(res.celeb).toHaveLength(2); // la base, puis le trophée gagné
		// Une base remplie au passage se re-célébrerait à l'écran de fin suivant.
		expect(base).toEqual([{ icon: '🌟', text: 'Liste prête, bravo !' }]);
	});

	it('critère 8 : annoncer ne fait que LIRE — aucun compteur ne bouge', () => {
		const lecon = leconCe2();
		historiqueSansTrophee(lecon.id, 30, 99);
		sessionRevision(lecon.id, 12, 12);
		const avant = {
			xp: JSON.stringify(lsGet(XP_KEY, 0)),
			stats: JSON.stringify(lsGet(LESSON_STATS_KEY, {})),
			activite: JSON.stringify(lsGet(ACTIVITY_KEY, [])),
			runs: JSON.stringify(lsGet(RUNS_KEY('revision-espacee'), [])),
		};

		recompensesFin(1);

		// Un module d'annonce qui ajouterait de l'XP ou un essai doublerait les compteurs
		// de la session ; il ne doit toucher qu'au registre des trophées.
		expect(JSON.stringify(lsGet(XP_KEY, 0))).toBe(avant.xp);
		expect(JSON.stringify(lsGet(LESSON_STATS_KEY, {}))).toBe(avant.stats);
		expect(JSON.stringify(lsGet(ACTIVITY_KEY, []))).toBe(avant.activite);
		expect(JSON.stringify(lsGet(RUNS_KEY('revision-espacee'), []))).toBe(avant.runs);
	});
});

/* ============================================================
   Critère 9 : les autres écrans de fin ne changent pas de forme
   ============================================================ */
describe('recordLessonRun — l’annonce des leçons reste la sienne (critère 9)', () => {
	it('le chemin de leçon dit toujours « Nouveau trophée : … », il n’est pas harmonisé', () => {
		const lecon = leconCe2();
		historiqueSansTrophee(lecon.id, 30, 99);

		const out = recordLessonRun({
			mode: 'lecon',
			lessonId: lecon.id,
			ok: 10,
			questionCount: 10,
			ms: 60_000,
			perLesson: { [lecon.id]: { ok: 10, total: 10 } },
		});

		// Factoriser le calcul ne doit pas aligner les LIBELLÉS : le chemin de révision
		// annonce « Trophée : … », celui de la leçon « Nouveau trophée : … ». Les deux
		// coexistaient avant ce lot et l'issue les gèle (« garder exactement leur
		// comportement »). Garde-fou : ce test est vert avant l'implémentation.
		const vol = trophee('vol100');
		expect(out.celeb).toContainEqual({ icon: vol.icon, text: `Nouveau trophée : ${vol.title}` });
	});
});
