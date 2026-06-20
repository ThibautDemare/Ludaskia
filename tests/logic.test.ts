/* ============================================================
   Tests de la logique « Ludaskia » (Vitest).
   Lancer :  npm test
   ------------------------------------------------------------
   Portés depuis l'ancien tests/run.js (contexte vm + stubs) vers
   des imports ES modules directs. On teste la logique pure (la
   génération, la persistance et les règles de récompense ; pas le
   rendu DOM).

   Fraîcheur d'environnement : en modules ES l'état est un singleton.
   On reproduit l'ancien freshEnv() avant chaque test :
   - localStorage.clear()
   - on rebranche le hook d'écriture (setOnDataWrite(touchActiveProfile),
     effet de bord que faisait profiles.js au chargement),
   - on remet à zéro l'état du module items (inputCounter, sessionItems,
     renderLesson),
   - on appelle initProfiles() pour recréer un profil par défaut + le
     préfixe actif.
   ============================================================ */
import { beforeEach, describe, test, expect } from 'vitest';

import {
	rnd,
	choice,
	sample,
	commKey,
	uniqueComm,
	uniqueExact,
	escapeHTML,
	fmt,
	normalizeText,
} from '../src/core/utils';
import { lsGet, lsSet, setOnDataWrite } from '../src/core/storage';
import {
	add,
	sub,
	mul,
	dbl,
	half,
	comp,
	facteur,
	renderItem,
	setInputCounter,
	setSessionItems,
	setRenderLesson,
} from '../src/core/items';
import {
	LESSONS,
	buildFiches,
	THEMES,
	bilanQ,
	bilanBlocks,
	bilanHTML,
	buildPrintableDOM,
} from '../src/core/lessons';
import {
	RUNS_KEY,
	loadRuns,
	cmpRun,
	runPct,
	fmtRecord,
	recordRun,
	startOfWeek,
	startOfMonth,
	countSince,
	STREAK_KEY,
	todayStr,
	daysBetween,
	getStreak,
	updateStreak,
	streakSuffix,
	STARS_KEY,
	recordLessonResult,
	starsEarned,
	LESSON_STATS_KEY,
	loadLessonStats,
	recordLessonStats,
	lessonAvgPct,
	LESSON_FIRST_SEEN_KEY,
	loadLessonFirstSeen,
	markLessonsFirstSeen,
	countNewLessonsSince,
	XP_KEY,
	getXP,
	addXP,
	NIVEAU_MAX,
	xpVersSuivant,
	xpPourNiveau,
	niveauDepuisXP,
	progressionNiveau,
} from '../src/core/progress';
import { recordLessonRun } from '../src/core/lesson-run';
import {
	CHALLENGES,
	challengeContext,
	weakLessons,
	GOAL_KEY,
	GOALS_DONE_KEY,
	getGoalsDone,
	getGoal,
	updateGoal,
	TROPHIES_KEY,
	TROPHIES,
	loadTrophies,
	gSnapshot,
	evaluateTrophies,
} from '../src/core/rewards';
import { REGULARITY } from '../src/ui/render';
import { sprintQuestionBody } from '../src/ui/sprint';
import {
	getAllLessons,
	getLessonsByCategory,
	genLessonItem,
	getLessonById,
	lessonsForIds,
	bilanMode,
	commonCategoryId,
	isPosedLesson,
	isOrderingLesson,
	isTriLesson,
	CATEGORIES,
} from '../src/core/catalog';
import { VOCAB_LESSONS, trierAlpha } from '../src/data/francais/vocabulaire';
import { checkItemAnswer, figureBlock } from '../src/core/items';
import type { PosedSpec } from '../src/core/items';
import {
	renderHorloge,
	renderFigure,
	pointOnCircle,
	renderPolygoneCote,
	renderQuadrillage,
	boundaryEdges,
	renderFigurePlane,
	renderSceneFigures,
	renderCercle,
	renderSolide,
} from '../src/core/figures';
import { checkAnswer } from '../src/core/exercise';
import type { Exercise } from '../src/core/exercise';
import { isNewerVersion, canReloadNow } from '../src/core/version';
import type { ReloadState, ReloadThresholds } from '../src/core/version';
import { genItems, buildLessonFiche } from '../src/core/build';
import { conjugationType, VERBS, CONJ_LESSONS, getVerb } from '../src/data/francais/conjugaison';
import { SUJETS, GRAMMAIRE_SUJET_LESSONS } from '../src/data/francais/grammaire-sujet';
import {
	CLASSES,
	ARTICLES,
	ADVERBES,
	ITEMS_CLASSES,
	CLASSES_LESSONS,
} from '../src/data/francais/classes-mots';
import { ACCORD_LESSONS, transfosDisponibles } from '../src/data/francais/accords';
import { HOMOPHONE_PAIRS, HOMOPHONE_LESSONS } from '../src/data/francais/homophones';
import {
	MBP_BANK,
	MBP_LESSONS,
	tiragePondere,
	poidsDe,
	motComplet,
} from '../src/data/francais/mbp';
import { GROUPES_SENS, SENS_FIGURE_LESSONS } from '../src/data/francais/sens-figure';
import { CHAMPS, TOUS_LES_MOTS, CHAMPS_LESSONS } from '../src/data/francais/champs-lexicaux';
import {
	FAMILLES,
	PREFIXES,
	SUFFIXES,
	ITEMS_FAMILLES,
	FAMILLES_LESSONS,
} from '../src/data/francais/familles';
import { variantes as heureVariantes } from '../src/data/maths/heure';
import {
	EXPRESS_CAP,
	expressQuestionsPerLesson,
	expressWeight,
	sampleExpressLessons,
} from '../src/core/bilan-express';
import {
	etatNeuf,
	estDu,
	estAcquis,
	avancerEtat,
	PALIER_ACQUIS,
	REVISION_INTERVALLES,
	JOUR,
} from '../src/core/revision';
import {
	selectDueGroups,
	countDue,
	prochaineEcheance,
	aDesRevisions,
} from '../src/core/revision-select';
import { loadLessonRevisions, backfillLessonRevisions } from '../src/core/progress';
import { loadOrtho, saveOrtho, backfillMotRevisions } from '../src/core/orthographe/store';
import { migrateRevisions } from '../src/core/revision-migrate';
import type { OrthoState } from '../src/core/orthographe/types';
import {
	RANGS,
	titreDuNiveau,
	MASCOTTE,
	mascotteDuNiveau,
	AVATARS_FORET,
	niveauRequisAvatar,
	avatarsForetDebloques,
	THEMES as THEMES_UNLOCK,
	themesDebloques,
	recompensesNiveau,
	recompensesEntre,
} from '../src/core/unlocks';
import {
	getTheme,
	setTheme,
	animationsReduites,
	setAnimationsReduites,
} from '../src/ui/preferences';
import {
	loadProfilesMeta,
	listProfiles,
	activeProfile,
	setActiveProfile,
	addProfile,
	renameProfile,
	setProfileEmoji,
	getXPFor,
	avatarAutorise,
	resetProfile,
	deleteProfile,
	exportProfiles,
	importProfiles,
	touchActiveProfile,
	initProfiles,
	PROFILE_EMOJIS,
} from '../src/core/profiles';
import {
	RESUME_KEY,
	RESUME_VERSION,
	RESUME_TTL_MS,
	RESUME_MAX_STORED,
	leconKey,
	bilanCategoryKey,
	bilanCustomKey,
	loadResumes,
	getResume,
	hasResume,
	upsertResume,
	removeResume,
	clearResumes,
	type ResumeSnapshot,
} from '../src/core/resume';
import { loadBilans, saveBilan } from '../src/core/bilans';

// API agrégée (parité avec l'ancien globalThis.__api), pour conserver le style `api.x`.
const api = {
	rnd,
	choice,
	sample,
	commKey,
	uniqueComm,
	uniqueExact,
	escapeHTML,
	fmt,
	lsGet,
	lsSet,
	add,
	sub,
	mul,
	dbl,
	half,
	comp,
	facteur,
	renderItem,
	LESSONS,
	buildFiches,
	THEMES,
	bilanQ,
	bilanBlocks,
	bilanHTML,
	buildPrintableDOM,
	RUNS_KEY,
	loadRuns,
	cmpRun,
	runPct,
	fmtRecord,
	recordRun,
	startOfWeek,
	startOfMonth,
	countSince,
	REGULARITY,
	STREAK_KEY,
	todayStr,
	daysBetween,
	getStreak,
	updateStreak,
	streakSuffix,
	CHALLENGES,
	challengeContext,
	weakLessons,
	STARS_KEY,
	recordLessonResult,
	starsEarned,
	LESSON_STATS_KEY,
	loadLessonStats,
	recordLessonStats,
	lessonAvgPct,
	LESSON_FIRST_SEEN_KEY,
	loadLessonFirstSeen,
	markLessonsFirstSeen,
	countNewLessonsSince,
	XP_KEY,
	getXP,
	addXP,
	NIVEAU_MAX,
	xpVersSuivant,
	xpPourNiveau,
	niveauDepuisXP,
	progressionNiveau,
	RANGS,
	titreDuNiveau,
	MASCOTTE,
	mascotteDuNiveau,
	AVATARS_FORET,
	niveauRequisAvatar,
	avatarsForetDebloques,
	themesDebloques,
	getTheme,
	setTheme,
	animationsReduites,
	setAnimationsReduites,
	recompensesNiveau,
	recompensesEntre,
	GOAL_KEY,
	GOALS_DONE_KEY,
	getGoalsDone,
	getGoal,
	updateGoal,
	TROPHIES_KEY,
	TROPHIES,
	loadTrophies,
	gSnapshot,
	evaluateTrophies,
	sprintQuestionBody,
	loadProfilesMeta,
	listProfiles,
	activeProfile,
	setActiveProfile,
	addProfile,
	renameProfile,
	resetProfile,
	deleteProfile,
	setProfileEmoji,
	getXPFor,
	avatarAutorise,
	PROFILE_EMOJIS,
	exportProfiles,
	importProfiles,
	lessonsForIds,
	bilanMode,
	commonCategoryId,
};

// Remet l'environnement à neuf (état module + localStorage vierges) avant chaque test.
beforeEach(() => {
	localStorage.clear();
	// Effet de bord que faisait profiles.js au chargement (hook de bump updatedAt).
	setOnDataWrite(touchActiveProfile);
	// État du module items (équivalent d'un module neuf).
	setInputCounter(0);
	setSessionItems({});
	setRenderLesson(null);
	// Profil par défaut + préfixe actif (comme initProfiles() au chargement).
	initProfiles();
});

// Décale une date 'YYYY-MM-DD' de delta jours (pour simuler hier/avant-hier).
function shiftDay(_api: any, dStr: string, delta: number) {
	const d = new Date(dStr + 'T00:00:00');
	d.setDate(d.getDate() + delta);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ============================================================
   Tests
   ============================================================ */
describe('Utilitaires', () => {
	test('fmt formate mm:ss', () => {
		expect(api.fmt(0)).toBe('00:00');
		expect(api.fmt(65000)).toBe('01:05');
		expect(api.fmt(600000)).toBe('10:00');
	});
	test('rnd reste dans les bornes', () => {
		for (let i = 0; i < 200; i++) {
			const v = api.rnd(2, 9);
			expect(v >= 2 && v <= 9).toBe(true);
		}
	});
	test('sample renvoie n éléments', () => {
		expect(api.sample([1, 2, 3, 4, 5], 3).length).toBe(3);
	});
});

describe('Items', () => {
	test('opérations correctes', () => {
		expect(api.add(3, 4).answer).toBe(7);
		expect(api.sub(9, 2).answer).toBe(7);
		expect(api.mul(6, 7).answer).toBe(42);
		expect(api.dbl(8).answer).toBe(16);
		expect(api.half(10).answer).toBe(5);
		expect(api.comp(3, 10).answer).toBe(7);
		expect(api.facteur(4, 60).answer).toBe(15);
	});
	test('renderItem remplace @ par un champ', () => {
		const h = api.renderItem(api.add(2, 3));
		expect(h.includes('@')).toBe(false);
		expect(/class="ans /.test(h)).toBe(true);
		expect(/data-answer="5"/.test(h)).toBe(true);
	});
	test('renderItem : anti-suggestion sur le texte uniquement (issue #67)', () => {
		// Réponse texte : déguisée en mot de passe pour bloquer les suggestions du clavier.
		const txt = api.renderItem({ text: 'x = @', answer: 'mangé', kind: 'text' });
		expect(/type="password"/.test(txt)).toBe(true);
		// Calcul : saisie numérique inchangée (pas de type password).
		const num = api.renderItem(api.add(2, 3));
		expect(/type="password"/.test(num)).toBe(false);
		expect(/inputmode="numeric"/.test(num)).toBe(true);
	});
});

describe('Leçons & bilans', () => {
	test('buildFiches produit 15 fiches couvrant les 15 leçons', () => {
		const html = api.buildFiches();
		expect(html.length).toBe(15);
		const seen = new Set([...html.join('').matchAll(/data-lesson="([^"]+)"/g)].map((m) => m[1]));
		expect(seen.size).toBe(15);
	});
	test('bilan express : 45 champs tagués (3 par leçon)', () => {
		const h = api.bilanHTML(1);
		expect([...h.matchAll(/data-lesson=/g)].length).toBe(45);
		expect([...h.matchAll(/data-lesson="math-tables-multiplication"/g)].length).toBe(3);
	});
	test('bilanQ renvoie un item valide pour chaque leçon', () => {
		for (let k = 1; k <= 15; k++) {
			const q = api.bilanQ(k);
			expect(q && typeof q.text === 'string' && Number.isFinite(q.answer)).toBe(true);
		}
	});
	test('aucun résultat négatif (hors-programme CE2)', () => {
		for (let k = 1; k <= 15; k++)
			for (let i = 0; i < 300; i++) {
				const q = api.bilanQ(k)!;
				expect(Number(q.answer) >= 0).toBe(true);
			}
	});
});

describe('Records & classement', () => {
	test('cmpRun : score puis temps', () => {
		const arr = [
			{ ok: 18, ms: 400 },
			{ ok: 18, ms: 300 },
			{ ok: 20, ms: 999 },
		].sort(api.cmpRun as any);
		expect(arr[0].ok).toBe(20);
		expect(arr[1].ms).toBe(300);
	});
	test('recordRun : rang, médaille et record', () => {
		api.recordRun('express', 40, 45, 500000);
		api.recordRun('express', 44, 45, 480000);
		const r = api.recordRun('express', 45, 45, 470000); // meilleur score → 1er
		expect(r.rank).toBe(1);
		expect(r.total).toBe(3);
		expect(r.medal).toBe(1);
		expect(r.isRecord).toBe(true);
		const r2 = api.recordRun('express', 10, 45, 300000); // mauvais score → pas de médaille
		expect(r2.medal).toBe(0);
		expect(r2.isRecord).toBe(false);
	});
});

describe('Série de jours', () => {
	test('getStreak par défaut', () => {
		expect(api.getStreak().days).toBe(0);
	});
	test('updateStreak : 1er jour, +1 le lendemain, reset si saut', () => {
		expect(api.updateStreak().days).toBe(1);
		const today = api.todayStr();
		api.lsSet(api.STREAK_KEY, { days: 3, last: shiftDay(api, today, -1), max: 3 });
		expect(api.updateStreak().days).toBe(4); // hier → +1
		api.lsSet(api.STREAK_KEY, { days: 4, last: shiftDay(api, today, -2), max: 4 });
		const s = api.updateStreak();
		expect(s.days).toBe(1);
		expect(s.max).toBe(4);
	}); // saut → reset, max conservé
	test('streakSuffix', () => {
		expect(api.streakSuffix(1)).toBe('');
		expect(api.streakSuffix(3).includes('3 jours')).toBe(true);
	});
});

describe('Étoiles & stats par leçon', () => {
	test('recordLessonResult : étoile au 1er sans-faute', () => {
		expect(api.recordLessonResult('math-doubles', true).newStar).toBe(true);
		expect(api.recordLessonResult('math-doubles', true).newStar).toBe(false);
		expect(api.recordLessonResult('math-ajouter-9-19-29', false).count).toBe(0);
		expect(api.starsEarned()).toBe(1);
	});
	test('recordLessonStats : agrégation + moyenne', () => {
		api.recordLessonStats({ 'math-tables-multiplication': { ok: 10, total: 12 } });
		api.recordLessonStats({ 'math-tables-multiplication': { ok: 12, total: 12 } });
		const e = api.loadLessonStats()['math-tables-multiplication'];
		expect(e.attempts).toBe(2);
		expect(e.correct).toBe(22);
		expect(e.questions).toBe(24);
		expect(e.bestPct).toBe(100);
		expect(api.lessonAvgPct(e)).toBe(92);
	});
	// Enregistrement commun à tous les modes de rendu (saisie / QCM) : parité (#69).
	test('recordLessonRun : leçon sans-faute → étoile + XP = bonnes réponses', () => {
		const xp0 = api.getXP();
		const out = recordLessonRun({
			mode: 'lecon',
			lessonId: 'math-doubles',
			ok: 8,
			questionCount: 8,
			ms: 1000,
			perLesson: { 'math-doubles': { ok: 8, total: 8 } },
		});
		expect(out.starInfo).toEqual({ perfect: true, newStar: true, count: 1 });
		expect(api.getXP()).toBe(xp0 + 8);
		expect(api.starsEarned()).toBe(1);
	});
	test('recordLessonRun : leçon avec une faute → pas d’étoile, XP = bonnes réponses', () => {
		const xp0 = api.getXP();
		const out = recordLessonRun({
			mode: 'lecon',
			lessonId: 'math-doubles',
			ok: 6,
			questionCount: 8,
			ms: 1000,
			perLesson: { 'math-doubles': { ok: 6, total: 8 } },
		});
		expect(out.starInfo?.perfect).toBe(false);
		expect(out.starInfo?.newStar).toBe(false);
		expect(api.getXP()).toBe(xp0 + 6);
	});
});

describe('Défi du jour (qualité)', () => {
	test('getGoal en crée un pour aujourd’hui', () => {
		const g = api.getGoal();
		expect(g.date).toBe(api.todayStr());
		expect(g.done).toBe(false);
	});
	test('remédiation proposée seulement s’il y a une leçon à revoir', () => {
		const avail = () =>
			api.CHALLENGES.filter((c) => c.avail(api.challengeContext())).map((c) => c.type);
		expect(avail().includes('remediation')).toBe(false);
		api.recordLessonStats({ 'math-soustraire-9-19-29': { ok: 2, total: 12 } }); // 17 % → leçon à revoir
		expect(api.weakLessons().includes('math-soustraire-9-19-29')).toBe(true);
		expect(avail().includes('remediation')).toBe(true);
	});
	test('défis « se dépasser » indisponibles sans record à battre', () => {
		const avail = () =>
			api.CHALLENGES.filter((c) => c.avail(api.challengeContext())).map((c) => c.type);
		expect(!avail().includes('beatSprint') && !avail().includes('beatExpress')).toBe(true);
		api.recordRun('sprint', 5, 8, 300000);
		expect(avail().includes('beatSprint')).toBe(true);
	});
	test('updateGoal : progression, justDone et compteur', () => {
		api.lsSet(api.GOAL_KEY, {
			date: api.todayStr(),
			type: 'record',
			target: 1,
			label: 'x',
			progress: 0,
			done: false,
		});
		expect(api.updateGoal({ mode: 'express' }).justDone).toBe(false); // pas de record → pas d'avancée
		const r = api.updateGoal({ isRecord: true });
		expect(r.justDone).toBe(true);
		expect(api.getGoalsDone()).toBe(1);
		expect(api.updateGoal({ isRecord: true }).justDone).toBe(false);
	}); // déjà fait
});

describe('Objectifs de régularité', () => {
	test('countSince compte les essais d’une période', () => {
		const now = Date.now();
		api.lsSet('ludaskia_runs_sprint', [
			{ ts: now, ok: 1, count: 1, ms: 1 },
			{ ts: now - 40 * 86400000, ok: 1, count: 1, ms: 1 },
		]);
		expect(api.countSince('sprint', now - 7 * 86400000)).toBe(1); // un seul dans les 7 derniers jours
		expect(api.startOfWeek() <= now && api.startOfMonth() <= now).toBe(true);
	});
	test('REGULARITY : 2 sprints, 3 révisions, 1 nouvelle leçon (tout hebdo, #178)', () => {
		const byMode = Object.fromEntries(api.REGULARITY.map((o) => [o.mode, o]));
		// Plus aucun objectif sur les bilans express/complet.
		expect(byMode.express).toBeUndefined();
		expect(byMode.complet).toBeUndefined();
		// Les trois objectifs sont hebdomadaires.
		expect(api.REGULARITY.every((o) => o.period === 'week')).toBe(true);
		expect(byMode.sprint.target).toBe(2);
		expect(byMode['revision-espacee'].target).toBe(3);
		expect(byMode.lecon.target).toBe(1);
		expect(byMode.lecon.metric).toBe('newLessons');
	});
});

describe('Objectif « nouvelle leçon » : premier passage par leçon (#178)', () => {
	test('countNewLessonsSince ne compte que les 1res rencontres dans la fenêtre', () => {
		const now = Date.now();
		const semaine = now - 3 * 86400000; // début de fenêtre : il y a 3 jours
		// Leçon découverte avant la fenêtre → ne compte pas.
		api.markLessonsFirstSeen(['math-doubles'], now - 10 * 86400000);
		// Leçon découverte dans la fenêtre → compte.
		api.markLessonsFirstSeen(['math-tables-multiplication'], now - 1 * 86400000);
		expect(api.countNewLessonsSince(semaine)).toBe(1);
		expect(api.countNewLessonsSince(now - 30 * 86400000)).toBe(2);
	});
	test('markLessonsFirstSeen ne réécrit jamais la 1re date', () => {
		// t1 ancré sur le début de semaine (pas « maintenant ») → toujours avant la
		// semaine courante, quel que soit le jour (sinon flaky le ven/sam/dim).
		const t1 = api.startOfWeek() - 5 * 86400000;
		api.markLessonsFirstSeen(['math-doubles'], t1);
		api.markLessonsFirstSeen(['math-doubles'], Date.now()); // 2e passage : ignoré
		expect(api.loadLessonFirstSeen()['math-doubles']).toBe(t1);
		// Donc ne compte pas comme « nouvelle » cette semaine.
		expect(api.countNewLessonsSince(api.startOfWeek())).toBe(0);
	});
	test('recordLessonStats date le 1er passage, pas les suivants', () => {
		const since = api.startOfWeek();
		api.recordLessonStats({ 'math-doubles': { ok: 5, total: 8 } }); // 1re fois cette semaine
		expect(api.countNewLessonsSince(since)).toBe(1);
		api.recordLessonStats({ 'math-doubles': { ok: 8, total: 8 } }); // 2e fois : pas une nouvelle leçon
		expect(api.countNewLessonsSince(since)).toBe(1);
	});
});

describe('Catalogue maths : 4 catégories du manuel (#92)', () => {
	test('les 4 catégories maths + le calcul mental coexistent', () => {
		const mathCats = CATEGORIES.filter((c) => c.subject === 'math').map((c) => c.id);
		for (const id of [
			'math-numeration',
			'math-calcul',
			'math-calcul-mental',
			'math-grandeurs-mesures',
			'math-geometrie',
		]) {
			expect(mathCats).toContain(id);
		}
	});
	test('« Calcul » (posé) ≠ « Calcul mental » : ids et libellés distincts', () => {
		const calcul = CATEGORIES.find((c) => c.id === 'math-calcul');
		const mental = CATEGORIES.find((c) => c.id === 'math-calcul-mental');
		expect(calcul?.label).toBe('Calcul');
		expect(mental?.label).toBe('Calcul mental');
		expect(calcul?.id).not.toBe(mental?.id);
	});
	test('les leçons de calcul mental sont rattachées à math-calcul-mental', () => {
		// 15 leçons « legacy » (bilanQ) + 2 division par le sens (#104) + reste (#95).
		expect(getLessonsByCategory('math-calcul-mental').length).toBe(18);
		expect(getLessonsByCategory('math-calcul').length).toBeGreaterThan(0); // posé (#97)
	});
	test('toutes les catégories maths sont désormais peuplées ; helper robuste sur un id inconnu', () => {
		// Numération (#98/#94), Calcul posé (#97), Grandeurs et mesures (#89/#96/#88/#99)
		// et Géométrie (#100) sont peuplées.
		expect(getLessonsByCategory('math-geometrie').length).toBeGreaterThan(0);
		// Le helper ne casse pas sur une catégorie inconnue (pas de leçon).
		expect(getLessonsByCategory('math-inexistant')).toEqual([]);
	});
	test('les trophées de catégorie suivent les catégories peuplées', () => {
		const ids = api.TROPHIES.map((t) => t.id);
		// Catégories peuplées → leurs trophées existent (calcul mental, et Géométrie #100)…
		expect(ids).toContain('cat-math-calcul-mental-3');
		expect(ids).toContain('cat-math-geometrie-3');
		// …une catégorie inexistante n’en génère pas (pas de trophée impossible).
		expect(ids).not.toContain('cat-math-inexistant-3');
	});
});

describe('Grandeurs et mesures : conversions (#89)', () => {
	const ids = ['mes-longueurs', 'mes-masses', 'mes-contenances', 'mes-durees'];
	test('les 4 leçons de conversion peuplent « Grandeurs et mesures »', () => {
		const cat = getLessonsByCategory('math-grandeurs-mesures').map((l) => l.id);
		for (const id of ids) expect(cat).toContain(id);
		// La catégorie accueille aussi d'autres leçons (monnaie #96…) : on vérifie
		// la présence des conversions, pas un total figé.
		expect(cat.length).toBeGreaterThanOrEqual(4);
	});
	test('items numériques, réponses entières positives, corrigés numériquement', () => {
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 200; i++) {
				const it = genLessonItem(lesson);
				expect(it.kind).toBe('num'); // pas une saisie texte
				expect(it.text).toContain('@'); // le champ a sa place
				expect(it._lesson).toBe(id);
				const ans = Number(it.answer);
				expect(Number.isInteger(ans)).toBe(true); // jamais de réponse décimale
				expect(ans).toBeGreaterThan(0);
				expect(checkItemAnswer(it, String(ans))).toBe(true);
				expect(checkItemAnswer(it, String(ans + 1))).toBe(false);
			}
		}
	});
	test('durées : pas de conversion min↔s libre (base 60 écartée du cœur CE2)', () => {
		const lesson = getLessonById('mes-durees')!;
		for (let i = 0; i < 300; i++) {
			// L'unité « s » (secondes) ne doit jamais apparaître comme unité de calcul.
			expect(genLessonItem(lesson).text).not.toMatch(/\bs\b/);
		}
	});
	test('contenances : pas de mL (réservé au CM1)', () => {
		const lesson = getLessonById('mes-contenances')!;
		for (let i = 0; i < 200; i++) {
			expect(genLessonItem(lesson).text).not.toContain('mL');
		}
	});
	test('buildLessonFiche : rendu fiche/écran avec champs de saisie (chemin math moderne)', () => {
		const html = buildLessonFiche('mes-longueurs');
		expect(html).toContain('Je mesure en mètres et en centimètres'); // titre
		expect(html).toContain('Complète : écris le bon nombre.'); // consigne d'action (#265)
		expect(html).toContain('<input'); // au moins un champ de réponse
		expect(html).not.toContain('@'); // le `@` a bien été remplacé par le champ
	});
});

describe('Grandeurs et mesures : la monnaie (#96)', () => {
	const ids = ['mes-monnaie-calcul', 'mes-monnaie-rendu'];
	test('les 2 leçons de monnaie rejoignent « Grandeurs et mesures »', () => {
		const cat = getLessonsByCategory('math-grandeurs-mesures').map((l) => l.id);
		for (const id of ids) expect(cat).toContain(id);
	});
	test('réponses entières positives, unité € ou c collée au champ, corrigées', () => {
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 300; i++) {
				const it = genLessonItem(lesson);
				expect(it.kind).toBe('num');
				expect(it.text).toContain('@');
				const ans = Number(it.answer);
				expect(Number.isInteger(ans)).toBe(true); // jamais de décimal (« 1,60 » banni)
				expect(ans).toBeGreaterThan(0);
				expect(checkItemAnswer(it, String(ans))).toBe(true);
				expect(checkItemAnswer(it, String(ans + 1))).toBe(false);
				// L'unité du champ encadre les bornes CE2 : € ≤ 20, centimes pas de 10 < 1 €.
				if (it.text.includes('@ c')) {
					expect(ans % 10).toBe(0);
					expect(ans).toBeLessThan(100);
				} else {
					expect(it.text).toContain('@ €');
					expect(ans).toBeLessThanOrEqual(20);
				}
			}
		}
	});
	test('« Je rends la monnaie » : rendu = billet − prix, en euros, jamais en centimes', () => {
		const lesson = getLessonById('mes-monnaie-rendu')!;
		for (let i = 0; i < 300; i++) {
			const it = genLessonItem(lesson);
			expect(it.text).toContain('@ €'); // toujours en euros
			expect(it.text).not.toContain('@ c');
			expect(Number(it.answer)).toBeLessThanOrEqual(19); // billet 20 − prix ≥ 1
		}
	});
});

describe('Moteur de figures SVG (#88)', () => {
	test('renderHorloge : SVG accessible (role img, titre, description) + légende', () => {
		const html = renderHorloge(10, 15);
		expect(html).toContain('<svg');
		expect(html).toContain('role="img"');
		expect(html).toContain('<title>'); // accessibilité
		expect(html).toContain('<desc>');
		expect(html).toContain('viewBox="0 0 200 200"');
		expect(html).toContain('class="clock-legend"'); // rôle des aiguilles rappelé
		// La description NE souffle PAS la réponse (pas de « 10 h 15 » dans le desc/title).
		const head = html.slice(0, html.indexOf('</desc>'));
		expect(head).not.toContain('10 h 15');
	});
	test('renderHorloge : 12 chiffres, 60 graduations, 2 aiguilles + moyeu', () => {
		const html = renderHorloge(3, 0);
		expect((html.match(/<text/g) ?? []).length).toBe(12); // chiffres 1–12
		expect((html.match(/<line/g) ?? []).length).toBe(62); // 60 graduations + 2 aiguilles
		expect((html.match(/<circle/g) ?? []).length).toBe(2); // cadran + moyeu
	});
	test('aiguille des heures proportionnelle aux minutes (pas pile sur le chiffre à la demie)', () => {
		// À 3 h 30, la petite aiguille est À MI-CHEMIN entre 3 et 4 (105°), pas sur 3 (90°).
		const [x3h, y3h] = pointOnCircle(100, 100, 52, 3 * 30 + 30 * 0.5);
		const [x3, y3] = pointOnCircle(100, 100, 52, 90);
		expect(Math.hypot(x3h - x3, y3h - y3)).toBeGreaterThan(5); // positions distinctes
		expect(renderHorloge(3, 30)).toContain(`x2="${x3h}"`);
	});
	test('renderFigure dispatch : horloge', () => {
		expect(renderFigure({ kind: 'horloge', heures: 6, minutes: 45 })).toContain('<svg');
	});
	test('figureBlock : enveloppe seulement si figure présente (SVG non échappé)', () => {
		expect(figureBlock(undefined)).toBe('');
		const b = figureBlock('<svg id="x"></svg>');
		expect(b).toContain('class="figure"');
		expect(b).toContain('<svg id="x">'); // pas d'échappement du balisage
	});
});

describe("Grandeurs et mesures : lire l'heure (#88)", () => {
	const lesson = () => getLessonById('mes-lecture-heure')!;
	test("la leçon « Je lis l'heure » peuple « Grandeurs et mesures » avec 2 modes", () => {
		const cat = getLessonsByCategory('math-grandeurs-mesures').map((l) => l.id);
		expect(cat).toContain('mes-lecture-heure');
		const modes = (lesson().exerciseType.modes ?? []).map((m) => m.id);
		expect(modes).toEqual(['saisie', 'qcm']);
	});
	test('saisie : item « heure » (2 champs) avec figure horloge, corrigé sur formes équivalentes', () => {
		const l = lesson();
		for (let i = 0; i < 300; i++) {
			const it = genLessonItem(l);
			expect(it.kind).toBe('heure'); // saisie en 2 champs [heures] h [minutes]
			expect(it.text).toContain('@');
			expect(it.figure).toContain('<svg'); // l'horloge accompagne la question
			expect(it._lesson).toBe('mes-lecture-heure');
			expect(checkItemAnswer(it, String(it.answer))).toBe(true); // forme canonique
			for (const v of it.answers ?? []) expect(checkItemAnswer(it, v)).toBe(true); // variantes
			expect(checkItemAnswer(it, 'pas une heure')).toBe(false);
		}
	});
	test('renderItem : un item « heure » produit 2 champs et un « h » en dur', () => {
		const it = genLessonItem(lesson());
		const html = renderItem(it);
		expect(html).toContain('class="ans heure-h '); // champ des heures (noté)
		expect(html).toContain('heure-min'); // champ des minutes
		expect(html).toContain('data-min-field='); // lien heures → minutes (fusion à la correction)
		expect(html).toContain('>h<'); // séparateur « h » affiché en dur
		expect((html.match(/<input/g) ?? []).length).toBe(2); // exactement 2 champs
	});
	test('format canonique « H h MM » : heures 1–12, minutes multiples de 5, jamais 12 h 00', () => {
		const type = lesson().exerciseType;
		for (let i = 0; i < 500; i++) {
			const ex = type.generate({ mode: 'saisie' });
			if (ex.type !== 'text') throw new Error('saisie doit produire un texte');
			const m = ex.answer.match(/^(\d{1,2}) h (\d{2})$/);
			expect(m).not.toBeNull();
			const h = Number(m![1]),
				min = Number(m![2]);
			expect(h).toBeGreaterThanOrEqual(1);
			expect(h).toBeLessThanOrEqual(12);
			expect(min % 5).toBe(0);
			expect(ex.answer).not.toBe('12 h 00'); // aiguilles superposées : écarté
		}
	});
	test('QCM : 4 propositions distinctes, la bonne en fait partie, figure présente', () => {
		const type = lesson().exerciseType;
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('qcm doit produire un qcm');
			expect(ex.choices.length).toBe(4);
			expect(new Set(ex.choices).size).toBe(4); // toutes distinctes
			expect(ex.choices).toContain(ex.answer);
			expect(ex.figure).toContain('<svg');
			for (const c of ex.choices) expect(c).toMatch(/^\d{1,2} h \d{2}$/); // même format
		}
	});
	test('saisie tolérante : 8 h 05 accepte « 8h5 » / « 8:05 » ; heures pile « 9 » / « 9h »', () => {
		const type = lesson().exerciseType;
		// Exercices construits (déterministe) : on teste le parsing tolérant via les
		// variantes acceptées, sans dépendre d'un tirage aléatoire qui tombe sur 8 h 05.
		const mkSaisie = (h: number, m: number): Exercise => ({
			type: 'text',
			question: 'Quelle heure est-il ? @',
			answer: `${h} h ${String(m).padStart(2, '0')}`,
			answers: heureVariantes(h, m),
			champHeure: true,
		});
		// Cas « minutes » (8 h 05).
		const exMin = mkSaisie(8, 5);
		expect(type.check(exMin, '8h5')).toBe(true);
		expect(type.check(exMin, '8:05')).toBe(true);
		expect(type.check(exMin, '8 h 05')).toBe(true);
		expect(type.check(exMin, '9 h 05')).toBe(false); // mauvaise heure
		// Cas « heure pile » (9 h 00) : tolère « 9 » et « 9h ».
		const exRound = mkSaisie(9, 0);
		expect(type.check(exRound, '9')).toBe(true);
		expect(type.check(exRound, '9h')).toBe(true);
		expect(type.check(exRound, '9 h 00')).toBe(true);
	});
	test('cadran ambigu : la lecture 24 h équivalente est acceptée pour chaque heure (#152)', () => {
		const type = lesson().exerciseType;
		const mk = (h: number, m: number): Exercise => ({
			type: 'text',
			question: 'Quelle heure est-il ? @',
			answer: `${h} h ${String(m).padStart(2, '0')}`,
			answers: heureVariantes(h, m),
			champHeure: true,
		});
		// 12 ↔ 0 (midi / minuit).
		const ex12 = mk(12, 35);
		expect(type.check(ex12, '12 h 35')).toBe(true); // forme canonique
		expect(type.check(ex12, '0 h 35')).toBe(true);
		expect(type.check(ex12, '0h35')).toBe(true);
		// 8 ↔ 20 (matin / soir) : les deux lectures du cadran sont justes.
		const ex8 = mk(8, 35);
		expect(type.check(ex8, '8 h 35')).toBe(true);
		expect(type.check(ex8, '20 h 35')).toBe(true);
		// 1 ↔ 13, y compris en heure pile (« 13 h », « 13 heures »).
		const ex1 = mk(1, 0);
		expect(type.check(ex1, '1 h 00')).toBe(true);
		expect(type.check(ex1, '13 h 00')).toBe(true);
		expect(type.check(ex1, '13 heures')).toBe(true);
		// On valide L'ÉQUIVALENT (h+12), pas n'importe quelle autre heure 24 h.
		expect(type.check(ex8, '0 h 35')).toBe(false); // 8 ↔ 20, jamais 0
		expect(type.check(ex8, '21 h 35')).toBe(false);
	});
	test('buildLessonFiche : fiche imprimable avec horloge SVG et champ de saisie', () => {
		const html = buildLessonFiche('mes-lecture-heure');
		expect(html).toContain("Je lis l'heure"); // titre
		expect(html).toContain('<svg'); // l'horloge s'affiche sur la fiche
		expect(html).toContain('<input'); // champ de réponse
		expect(html).not.toContain('@'); // le `@` est remplacé par le champ
	});
});

describe('Moteur de figures : polygone coté & quadrillage (#99)', () => {
	test('renderPolygoneCote : SVG accessible, polygone, une cote par côté non vide', () => {
		const html = renderPolygoneCote(
			[
				[0, 0],
				[5, 0],
				[5, 3],
				[0, 3],
			],
			['5', '3', '5', '3'],
		);
		expect(html).toContain('<svg');
		expect(html).toContain('role="img"');
		expect(html).toContain('<polygon');
		expect((html.match(/<text/g) ?? []).length).toBe(4); // 4 côtés cotés
	});
	test('renderPolygoneCote : un label vide ne dessine pas de cote (dimensions déduites)', () => {
		const html = renderPolygoneCote(
			[
				[0, 0],
				[6, 0],
				[6, 4],
				[0, 4],
			],
			['6', '4', '', ''],
		);
		expect((html.match(/<text/g) ?? []).length).toBe(2); // seules 2 dimensions cotées
	});
	test('boundaryEdges : périmètre rectiligne = nombre de côtés unitaires du contour', () => {
		// Rectangle 3×2 cases → périmètre 2*(3+2) = 10 côtés.
		const rect: Array<[number, number]> = [];
		for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) rect.push([x, y]);
		expect(boundaryEdges(rect).length).toBe(10);
		// Une seule case → 4 côtés.
		expect(boundaryEdges([[0, 0]]).length).toBe(4);
		// Figure en L (rectangle 3×2 moins le coin haut-droite) garde le périmètre 10.
		const ell = rect.filter(([x, y]) => !(x === 2 && y === 0));
		expect(boundaryEdges(ell).length).toBe(10);
	});
	test('renderQuadrillage : trame + cases + contour surligné', () => {
		const html = renderQuadrillage(4, 4, [
			[1, 1],
			[2, 1],
			[1, 2],
			[2, 2],
		]);
		expect(html).toContain('<svg');
		expect(html).toContain('<rect'); // cases pleines
		expect(html).toContain('<line'); // trame + contour
	});
	test('renderFigure : dispatch polygoneCote et quadrillage', () => {
		expect(
			renderFigure({
				kind: 'polygoneCote',
				points: [
					[0, 0],
					[4, 0],
					[4, 4],
					[0, 4],
				],
				labels: ['4', '4', '4', '4'],
			}),
		).toContain('<polygon');
		expect(renderFigure({ kind: 'quadrillage', cols: 3, rows: 3, cells: [[1, 1]] })).toContain(
			'<svg',
		);
	});
});

describe('Grandeurs et mesures : le périmètre (#99)', () => {
	const ids = ['mes-perimetre-cotes', 'mes-perimetre-quadrillage', 'mes-perimetre-formule'];
	test('les 3 leçons de périmètre peuplent « Grandeurs et mesures »', () => {
		const cat = getLessonsByCategory('math-grandeurs-mesures').map((l) => l.id);
		for (const id of ids) expect(cat).toContain(id);
	});
	test('items numériques avec figure, réponse entière positive, corrigés numériquement', () => {
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 200; i++) {
				const it = genLessonItem(lesson);
				expect(it.kind).toBe('num'); // réponse numérique
				expect(it.text).toContain('@');
				expect(it.text).toContain('tour'); // la définition est rappelée
				expect(it.figure).toContain('<svg'); // figure affichée
				expect(it._lesson).toBe(id);
				const ans = Number(it.answer);
				expect(Number.isInteger(ans)).toBe(true);
				expect(ans).toBeGreaterThan(0);
				expect(checkItemAnswer(it, String(ans))).toBe(true);
				expect(checkItemAnswer(it, String(ans + 1))).toBe(false);
			}
		}
	});
	test('additionner les côtés : périmètre raisonnable au calcul mental CE2 (≤ 60 cm)', () => {
		const lesson = getLessonById('mes-perimetre-cotes')!;
		for (let i = 0; i < 300; i++) {
			const it = genLessonItem(lesson);
			expect(it.text).toContain('@ cm'); // unité cm affichée par l'app
			expect(Number(it.answer)).toBeLessThanOrEqual(60);
		}
	});
	test('quadrillage : périmètre pair (figure rectiligne), entre 8 et 24 côtés, sans unité cm', () => {
		const lesson = getLessonById('mes-perimetre-quadrillage')!;
		for (let i = 0; i < 300; i++) {
			const it = genLessonItem(lesson);
			expect(it.text).not.toContain('cm'); // on compte des côtés de carreaux, pas des cm
			const p = Number(it.answer);
			expect(p % 2).toBe(0); // tout polygone rectiligne a un périmètre pair
			expect(p).toBeGreaterThanOrEqual(8);
			expect(p).toBeLessThanOrEqual(24);
		}
	});
	test('formule : carré (4×côté) ou rectangle (2×(L+l)), figure cotée partiellement', () => {
		const lesson = getLessonById('mes-perimetre-formule')!;
		for (let i = 0; i < 300; i++) {
			const it = genLessonItem(lesson);
			expect(it.text).toMatch(/carré|rectangle/);
			expect(it.text).toContain('@ cm');
			expect(Number(it.answer) % 2).toBe(0); // 4c et 2(L+l) sont pairs
		}
	});
	test('buildLessonFiche : fiche imprimable avec figure SVG et champ de saisie', () => {
		const html = buildLessonFiche('mes-perimetre-cotes');
		expect(html).toContain('Je calcule le périmètre'); // titre
		expect(html).toContain('<svg');
		expect(html).toContain('<input');
		expect(html).not.toContain('@');
	});
});

describe('Moteur de figures : figures planes & scène (#100)', () => {
	test('renderFigurePlane : SVG accessible (desc neutre), polygone rempli', () => {
		const html = renderFigurePlane('carre', 30);
		expect(html).toContain('<svg');
		expect(html).toContain('role="img"');
		expect(html).toContain('<polygon');
		expect(html).toContain('var(--accent-soft)'); // forme pleine
		// La description ne nomme pas la figure (sinon réponse soufflée).
		const head = html.slice(0, html.indexOf('</desc>'));
		expect(head).not.toContain('carré');
	});
	test('renderFigurePlane : le cercle est un <circle>, pas un polygone', () => {
		const html = renderFigurePlane('cercle');
		expect(html).toContain('<circle');
		expect(html).not.toContain('<polygon');
	});
	test('renderSceneFigures : autant de formes que de cases', () => {
		const html = renderSceneFigures([
			{ shape: 'carre' },
			{ shape: 'triangle', rotation: 180 },
			{ shape: 'cercle' },
		]);
		expect(html).toContain('<svg');
		expect((html.match(/<polygon/g) ?? []).length).toBe(2); // carré + triangle
		expect((html.match(/<circle/g) ?? []).length).toBe(1); // cercle
	});
	test('renderFigure : dispatch figurePlane et sceneFigures', () => {
		expect(renderFigure({ kind: 'figurePlane', shape: 'losange' })).toContain('<polygon');
		expect(renderFigure({ kind: 'sceneFigures', cells: [{ shape: 'rectangle' }] })).toContain(
			'<svg',
		);
	});
});

describe('Géométrie : je reconnais les figures planes (#100)', () => {
	const NOMS = ['carré', 'rectangle', 'triangle', 'losange', 'cercle'];
	test('les 2 leçons peuplent « Géométrie »', () => {
		const cat = getLessonsByCategory('math-geometrie').map((l) => l.id);
		expect(cat).toContain('geo-figures-reconnaitre');
		expect(cat).toContain('geo-figures-proprietes');
	});
	test('reconnaître — QCM : figure + 4 propositions distinctes dont la bonne', () => {
		const type = getLessonById('geo-figures-reconnaitre')!.exerciseType;
		for (let i = 0; i < 400; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm');
			expect(ex.figure).toContain('<svg');
			expect(ex.choices.length).toBeGreaterThanOrEqual(3);
			expect(new Set(ex.choices).size).toBe(ex.choices.length); // distinctes
			expect(ex.choices).toContain(ex.answer);
			// Nommage → un nom connu ; comptage → un nombre 1..4.
			if (/^\d+$/.test(ex.answer)) {
				const n = Number(ex.answer);
				expect(n).toBeGreaterThanOrEqual(1);
				expect(n).toBeLessThanOrEqual(4);
			} else {
				expect(NOMS).toContain(ex.answer);
			}
		}
	});
	test('reconnaître — saisie : item avec figure, champ, réponse vérifiable', () => {
		const lesson = getLessonById('geo-figures-reconnaitre')!;
		for (let i = 0; i < 200; i++) {
			const it = genLessonItem(lesson);
			expect(it.text).toContain('@');
			expect(it.figure).toContain('<svg');
			expect(['num', 'text']).toContain(it.kind); // comptage (num) ou nommage (text)
			expect(checkItemAnswer(it, String(it.answer))).toBe(true);
		}
	});
	test('propriétés — QCM textuel sans figure, réponse parmi les choix', () => {
		const type = getLessonById('geo-figures-proprietes')!.exerciseType;
		for (let i = 0; i < 200; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm');
			expect(ex.figure).toBeUndefined(); // pas de figure (vocabulaire/propriétés)
			expect(ex.choices.length).toBe(4);
			expect(ex.choices).toContain(ex.answer);
		}
	});
	test('propriétés : jamais de question d’inclusion « carré = rectangle » (piège CE2)', () => {
		const type = getLessonById('geo-figures-proprietes')!.exerciseType;
		for (let i = 0; i < 200; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			expect(ex.question.toLowerCase()).not.toMatch(/est-il un|est un rectangle/);
		}
	});
});

describe('Géométrie : le cercle (#102)', () => {
	test('renderCercle : SVG accessible ; segment mis en évidence si demandé', () => {
		const sans = renderCercle();
		expect(sans).toContain('<svg');
		expect(sans).toContain('<circle');
		const avec = renderCercle('diametre', '10 cm');
		expect(avec).toContain('var(--clock-min)'); // segment surligné
		expect(avec).toContain('10 cm'); // cote affichée
		// La description ne nomme pas « rayon »/« diamètre » (sinon réponse soufflée au vocabulaire).
		const head = renderCercle('rayon', '?').slice(0, renderCercle('rayon', '?').indexOf('</desc>'));
		expect(head).not.toContain('rayon');
	});
	test('renderFigure : dispatch cercle', () => {
		expect(renderFigure({ kind: 'cercle', segment: 'rayon', label: '5 cm' })).toContain('<svg');
	});
	test('la leçon « Le cercle » peuple « Géométrie » avec 2 modes', () => {
		const cat = getLessonsByCategory('math-geometrie').map((l) => l.id);
		expect(cat).toContain('geom-cercle');
		const modes = (getLessonById('geom-cercle')!.exerciseType.modes ?? []).map((m) => m.id);
		expect(modes).toEqual(['qcm', 'saisie']);
	});
	test('QCM : figure + 4 propositions distinctes dont la bonne ; d = 2r et r = d/2 corrects', () => {
		const type = getLessonById('geom-cercle')!.exerciseType;
		for (let i = 0; i < 500; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm');
			expect(ex.figure).toContain('<svg');
			expect(ex.choices.length).toBe(4);
			expect(new Set(ex.choices).size).toBe(4);
			expect(ex.choices).toContain(ex.answer);
			// Cohérence du calcul : « rayon … diamètre ? » → réponse = 2× ; « diamètre … rayon ? » → /2.
			const mr = ex.question.match(/rayon mesure (\d+) cm\. Quel est le diamètre/);
			if (mr) expect(Number(ex.answer)).toBe(2 * Number(mr[1]));
			const md = ex.question.match(/diamètre mesure (\d+) cm\. Quel est le rayon/);
			if (md) expect(Number(ex.answer)).toBe(Number(md[1]) / 2);
			// Vocabulaire : réponse parmi les termes attendus.
			if (!mr && !md) expect(['rayon', 'diamètre', 'centre']).toContain(ex.answer);
		}
	});
	test('saisie : item avec figure et champ, réponse vérifiable', () => {
		const lesson = getLessonById('geom-cercle')!;
		for (let i = 0; i < 200; i++) {
			const it = genLessonItem(lesson);
			expect(it.text).toContain('@');
			expect(it.figure).toContain('<svg');
			expect(checkItemAnswer(it, String(it.answer))).toBe(true);
		}
	});
});

describe('Géométrie : je reconnais les solides (#103)', () => {
	const SOLIDS = ['cube', 'pave', 'cylindre', 'cone', 'pyramide', 'boule'] as const;
	const NOMS = ['cube', 'pavé droit', 'cylindre', 'cône', 'pyramide', 'boule'];
	test('renderSolide : SVG accessible (desc neutre) pour les 6 solides', () => {
		for (const s of SOLIDS) {
			const html = renderSolide(s);
			expect(html).toContain('<svg');
			expect(html).toContain('role="img"');
			// La description ne nomme aucun solide (sinon réponse soufflée).
			const head = html.slice(0, html.indexOf('</desc>'));
			for (const n of NOMS) expect(head).not.toContain(n);
		}
	});
	test('renderFigure : dispatch solide', () => {
		expect(renderFigure({ kind: 'solide', solid: 'cylindre' })).toContain('<svg');
	});
	test('les 2 leçons de solides peuplent « Géométrie »', () => {
		const cat = getLessonsByCategory('math-geometrie').map((l) => l.id);
		expect(cat).toContain('geo-solides-reconnaitre');
		expect(cat).toContain('geo-solides-proprietes');
	});
	test('une série propose PLUSIEURS questions (dédup par réponse+figure, pas par énoncé constant)', () => {
		// Régression : l'énoncé « Quel est ce solide ? » est constant ; dédupe par texte
		// seul ne laissait qu'UNE question. On doit obtenir plusieurs solides distincts.
		const lesson = getLessonById('geo-solides-reconnaitre')!;
		expect(genItems(lesson, 8).length).toBeGreaterThanOrEqual(5);
	});
	test('reconnaître — QCM : schéma + 4 noms distincts dont le bon', () => {
		const type = getLessonById('geo-solides-reconnaitre')!.exerciseType;
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm');
			expect(ex.figure).toContain('<svg');
			expect(ex.choices.length).toBe(4);
			expect(new Set(ex.choices).size).toBe(4);
			expect(ex.choices).toContain(ex.answer);
			expect(NOMS).toContain(ex.answer);
		}
	});
	test('reconnaître — saisie : « pavé » accepté pour « pavé droit »', () => {
		const type = getLessonById('geo-solides-reconnaitre')!.exerciseType;
		let testePave = false;
		for (let i = 0; i < 600 && !testePave; i++) {
			const ex = type.generate({ mode: 'saisie' });
			if (ex.type === 'text' && ex.answer === 'pavé droit') {
				expect(type.check(ex, 'pavé')).toBe(true);
				expect(type.check(ex, 'pavé droit')).toBe(true);
				testePave = true;
			}
		}
		expect(testePave).toBe(true);
	});
	test('propriétés — QCM textuel sans figure ; comptage seulement sur les polyèdres', () => {
		const type = getLessonById('geo-solides-proprietes')!.exerciseType;
		for (let i = 0; i < 400; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') throw new Error('mode qcm');
			expect(ex.figure).toBeUndefined();
			expect(ex.choices).toContain(ex.answer);
			// On ne demande JAMAIS le nombre de faces/arêtes d'un solide à face courbe.
			expect(ex.question.toLowerCase()).not.toMatch(
				/(faces|arêtes).*(cylindre|cône|boule)|(cylindre|cône|boule).*(faces|arêtes)/,
			);
		}
	});
});

describe('Numération : comparer / encadrer / intercaler (#98)', () => {
	const ids = ['num-comparer', 'num-encadrer-intercaler', 'num-situer-10000'];
	test('les 3 leçons « situer un nombre » peuplent « Numération »', () => {
		const cat = getLessonsByCategory('math-numeration').map((l) => l.id);
		for (const id of ids) expect(cat).toContain(id);
		// La catégorie accueille aussi la valeur de position (#94) : pas de total figé.
		expect(cat.length).toBeGreaterThanOrEqual(3);
	});
	test('chaque leçon expose les deux modes saisie + tuiles', () => {
		for (const id of ids) {
			const modes = (getLessonById(id)!.exerciseType.modes ?? []).map((m) => m.id);
			expect(modes).toContain('saisie');
			expect(modes).toContain('tuiles');
		}
	});
	test('mode tuiles : type tuilesNombre, tuiles distinctes incluant la réponse', () => {
		for (const id of ids) {
			const type = getLessonById(id)!.exerciseType;
			for (let i = 0; i < 300; i++) {
				const ex = type.generate({ mode: 'tuiles' });
				expect(ex.type).toBe('tuilesNombre');
				if (ex.type !== 'tuilesNombre') continue; // narrowing
				expect(ex.question).toContain('@');
				expect(ex.tuiles).toContain(ex.answer); // la bonne tuile est présente
				expect(new Set(ex.tuiles).size).toBe(ex.tuiles.length); // toutes distinctes
				expect(ex.tuiles.length).toBeGreaterThanOrEqual(2);
				expect(ex.tuiles.length).toBeLessThanOrEqual(4); // mémoire de travail CE2
				expect(type.check(ex, ex.answer)).toBe(true); // la réponse se valide
			}
		}
	});
	test('comparer : item texte (signe), le signe est mathématiquement correct', () => {
		const lesson = getLessonById('num-comparer')!;
		for (let i = 0; i < 400; i++) {
			const it = genLessonItem(lesson);
			expect(it.kind).toBe('text'); // un signe, pas un nombre
			const m = it.text.match(/^Compare : (\d+)\s*@\s*(\d+)$/); // énoncé préfixé (#265)
			expect(m).not.toBeNull();
			const a = Number(m![1]),
				b = Number(m![2]);
			const attendu = a < b ? '<' : a > b ? '>' : '=';
			expect(it.answer).toBe(attendu);
			expect(['<', '=', '>']).toContain(String(it.answer));
		}
	});
	test('encadrer/intercaler : réponses numériques entières positives, corrigées', () => {
		const lesson = getLessonById('num-encadrer-intercaler')!;
		for (let i = 0; i < 400; i++) {
			const it = genLessonItem(lesson);
			expect(it.kind).toBe('num');
			const ans = Number(it.answer);
			expect(Number.isInteger(ans)).toBe(true);
			expect(ans).toBeGreaterThan(0);
			expect(checkItemAnswer(it, String(ans))).toBe(true);
			expect(checkItemAnswer(it, String(ans + 1))).toBe(false);
		}
	});
	test('jusqu’à 10 000 : nombres ≤ 9999 (4 chiffres réservés à cette leçon)', () => {
		const lesson = getLessonById('num-situer-10000')!;
		for (let i = 0; i < 400; i++) {
			const it = genLessonItem(lesson);
			// Tous les nombres de l'énoncé (et la réponse) restent dans la plage CE2.
			const nombres = (it.text.match(/\d+/g) ?? []).map(Number).concat(Number(it.answer) || 0);
			for (const n of nombres) expect(n).toBeLessThanOrEqual(10000);
		}
		// La leçon « jusqu'à 1000 » ne dépasse pas le millier (4 chiffres réservés à L3).
		const l2 = getLessonById('num-encadrer-intercaler')!;
		for (let i = 0; i < 400; i++) {
			const it = genLessonItem(l2);
			const nombres = (it.text.match(/\d+/g) ?? []).map(Number).concat(Number(it.answer) || 0);
			for (const n of nombres) expect(n).toBeLessThanOrEqual(1000);
		}
	});
});

describe('Numération : valeur de position et décomposition (#94)', () => {
	const ids = [
		'num-valeur-position',
		'num-decompose-100',
		'num-decompose-1000',
		'num-decompose-10000',
	];
	test('les 4 leçons peuplent « Numération »', () => {
		const cat = getLessonsByCategory('math-numeration').map((l) => l.id);
		for (const id of ids) expect(cat).toContain(id);
	});
	test('items numériques entiers ≥ 0, corrigés numériquement', () => {
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 300; i++) {
				const it = genLessonItem(lesson);
				expect(it.kind).toBe('num');
				expect(it.text).toContain('@');
				const ans = Number(it.answer);
				expect(Number.isInteger(ans)).toBe(true);
				expect(ans).toBeGreaterThanOrEqual(0); // un chiffre/rang peut valoir 0
				expect(checkItemAnswer(it, String(ans))).toBe(true);
				expect(checkItemAnswer(it, String(ans + 1))).toBe(false);
			}
		}
	});
	test('valeur des chiffres : « chiffre des » ∈ 0-9, « en tout » jamais sur les unités', () => {
		const lesson = getLessonById('num-valeur-position')!;
		for (let i = 0; i < 600; i++) {
			const it = genLessonItem(lesson);
			const ans = Number(it.answer);
			if (it.text.includes('chiffre des')) {
				expect(ans).toBeGreaterThanOrEqual(0);
				expect(ans).toBeLessThanOrEqual(9); // un seul symbole
			} else {
				expect(it.text).toContain('en tout');
				expect(it.text).not.toContain('unités en tout'); // jamais le nombre entier
			}
		}
	});
	test('décompose : composer redonne le nombre, le rang troué donne son chiffre', () => {
		// Composer « a centaines + b dizaines + c unités = @ » → la réponse est le
		// nombre formé ; on vérifie sur la leçon ≤ 1000 que la réponse est cohérente.
		const lesson = getLessonById('num-decompose-1000')!;
		for (let i = 0; i < 400; i++) {
			const it = genLessonItem(lesson);
			const ans = Number(it.answer);
			if (it.text.trimEnd().endsWith('= @')) {
				// forme « composer » (rangs → nombre) : réponse = nombre à 3 rangs
				expect(ans).toBeGreaterThanOrEqual(100);
				expect(ans).toBeLessThanOrEqual(999);
			} else {
				// forme « décomposer » (trou sur un rang) : réponse = un chiffre 0-9
				expect(ans).toBeGreaterThanOrEqual(0);
				expect(ans).toBeLessThanOrEqual(9);
			}
		}
	});
});

describe('Calcul : opérations posées (#97)', () => {
	const ids = ['calc-addition-posee', 'calc-soustraction-posee', 'calc-multiplication-posee'];
	test('les 3 leçons peuplent « Calcul »', () => {
		const cat = getLessonsByCategory('math-calcul').map((l) => l.id);
		for (const id of ids) expect(cat).toContain(id);
		expect(cat.length).toBe(3);
	});
	test('genLessonItem → item posed cohérent (op, opérandes, résultat)', () => {
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 300; i++) {
				const it = genLessonItem(lesson);
				expect(it.kind).toBe('posed');
				const p = it.posed!;
				expect(['+', '-', 'x']).toContain(p.op);
				const r = p.op === '+' ? p.a + p.b : p.op === '-' ? p.a - p.b : p.a * p.b;
				expect(Number(it.answer)).toBe(r);
				if (p.op === '-') {
					expect(p.a).toBeGreaterThanOrEqual(p.b); // jamais de négatif
					expect(r).toBeGreaterThanOrEqual(0);
				}
			}
		}
	});
	test('isPosedLesson : vrai pour les posées, faux pour les autres', () => {
		for (const id of ids) expect(isPosedLesson(getLessonById(id)!)).toBe(true);
		expect(isPosedLesson(getLessonById('mes-longueurs')!)).toBe(false);
		expect(isPosedLesson(getLessonById('math-tables-addition')!)).toBe(false);
	});
	test('renderItem : grille dont les cellules-résultat reconstituent le résultat', () => {
		const cas: Array<[PosedSpec, string]> = [
			[{ op: '+', a: 347, b: 285 }, '632'],
			[{ op: '-', a: 503, b: 287 }, '216'],
			[{ op: 'x', a: 123, b: 4 }, '492'],
		];
		for (const [posed, attendu] of cas) {
			setInputCounter(0);
			setSessionItems({});
			const html = renderItem({ text: '', answer: Number(attendu), kind: 'posed', posed });
			expect(html).toContain('class="posee"');
			// Pour +, − et ×1 chiffre, les seuls champs .posee-input sont le résultat.
			const digits = [...html.matchAll(/posee-input[^>]*data-answer="(\d)"/g)]
				.map((m) => m[1])
				.join('');
			expect(digits).toBe(attendu);
		}
	});
	test('multiplication ×2 chiffres : produits partiels (plusieurs lignes de cellules)', () => {
		setInputCounter(0);
		setSessionItems({});
		// 24 × 13 = 312 ; pp1 = 72, pp2 = 24 (décalé) → plus de 3 cellules-résultat.
		const html = renderItem({
			text: '',
			answer: 312,
			kind: 'posed',
			posed: { op: 'x', a: 24, b: 13 },
		});
		const nbInputs = [...html.matchAll(/posee-input/g)].length;
		expect(nbInputs).toBeGreaterThan(3); // pp1 + pp2 + somme finale
		expect((html.match(/posee-rule/g) ?? []).length).toBe(2); // deux traits
	});
	test('multiplication ×2 chiffres : 0 fourni du décalage + retenues de la somme (#154)', () => {
		setInputCounter(0);
		setSessionItems({});
		// 24 × 13 → pp1 = 72, pp2 = 24 (suivi du 0 fourni), somme = 312. C = 3 colonnes.
		const html = renderItem({
			text: '',
			answer: 312,
			kind: 'posed',
			posed: { op: 'x', a: 24, b: 13 },
		});
		// Le 0 du décalage est FOURNI (grisé) : présent, mais pas un champ noté.
		expect(html).toContain('posee-zero');
		expect((html.match(/posee-zero/g) ?? []).length).toBe(1);
		// Rangée de retenues au-dessus de la somme : C cellules d'aide non notées.
		expect((html.match(/posee-carry/g) ?? []).length).toBe(3);
		// Chiffres NOTÉS, dans l'ordre : pp1 (72) + pp2 (24) + somme (312) ; le 0 exclu.
		const digits = [...html.matchAll(/posee-input[^>]*data-answer="(\d)"/g)]
			.map((m) => m[1])
			.join('');
		expect(digits).toBe('7224312');
	});
});

describe('Trophées', () => {
	test('evaluateTrophies débloque selon les stats, sans doublon', () => {
		expect(api.evaluateTrophies().length).toBe(0);
		api.recordRun('express', 45, 45, 400000); // 1 bilan, 100%, express<8min
		const ids = api.evaluateTrophies().map((t) => t.id);
		expect(ids.includes('first')).toBe(true);
		expect(ids.includes('carton')).toBe(true);
		expect(ids.includes('eclair')).toBe(true);
		expect(api.evaluateTrophies().length).toBe(0);
	}); // rien de nouveau au 2e passage
	test('gSnapshot reflète étoiles et série', () => {
		const ids = getAllLessons()
			.slice(0, 5)
			.map((l) => l.id);
		for (const id of ids) api.recordLessonResult(id, true);
		expect(api.gSnapshot().stars).toBe(5);
		expect(
			api
				.evaluateTrophies()
				.map((t) => t.id)
				.includes('stars5'),
		).toBe(true);
	});
	test('trophée « Tout au vert » : toutes les leçons ≥ 70 %', () => {
		const allIds = getAllLessons().map((l) => l.id);
		for (const id of allIds.slice(0, allIds.length - 1))
			api.recordLessonStats({ [id]: { ok: 10, total: 10 } });
		expect(api.gSnapshot().allGreen).toBe(false); // 1 leçon manquante
		api.recordLessonStats({ [allIds[allIds.length - 1]]: { ok: 10, total: 10 } });
		expect(api.gSnapshot().allGreen).toBe(true);
		expect(
			api
				.evaluateTrophies()
				.map((t) => t.id)
				.includes('allgreen'),
		).toBe(true);
	});
	test('trophées de volume cumulé', () => {
		api.recordLessonStats({ 'math-tables-addition': { ok: 60, total: 120 } }); // 120 calculs résolus
		expect(api.gSnapshot().totalAnswered).toBe(120);
		expect(
			api
				.evaluateTrophies()
				.map((t) => t.id)
				.includes('vol100'),
		).toBe(true);
	});
	test('trophée « Grande exploration » : plus grand bilan d’une session (#181)', () => {
		// Aucun bilan : métrique à 0, trophée verrouillé.
		expect(api.gSnapshot().bestBilanCount).toBe(0);
		// Plusieurs petits bilans cumulés ne suffisent pas : c'est la taille d'UNE session qui compte.
		api.recordRun('complet', 10, 10, 200000);
		api.recordRun('express', 18, 20, 300000);
		expect(api.gSnapshot().bestBilanCount).toBe(20);
		expect(api.evaluateTrophies().map((t) => t.id)).not.toContain('bilanLong');
		// Un seul bilan d'au moins 30 questions déclenche le trophée.
		api.recordRun('complet', 28, 30, 600000);
		expect(api.gSnapshot().bestBilanCount).toBe(30);
		expect(api.evaluateTrophies().map((t) => t.id)).toContain('bilanLong');
		// Persistant : rien de nouveau au passage suivant.
		expect(api.evaluateTrophies().map((t) => t.id)).not.toContain('bilanLong');
	});
	test('trophées à paliers compilés (metric/n → test)', () => {
		const def = api.TROPHIES.find((t) => t.id === 'stars5')!;
		expect(typeof def.test === 'function').toBe(true);
		expect(def.test!({ stars: 5 })).toBe(true);
		expect(def.test!({ stars: 4 })).toBe(false);
	});
	test('trophée « Sans faute partout » : seuil dynamique = nb réel de leçons (#39)', () => {
		const def = api.TROPHIES.find((t) => t.id === 'starsAll')!;
		expect(typeof def.test === 'function').toBe(true);
		// Le seuil suit le nombre total de leçons (auto-extensible) : il ne se
		// déclenche pas avant que TOUTES les leçons soient étoilées.
		expect(def.test!({ stars: 5, totalLessons: 5 })).toBe(true);
		expect(def.test!({ stars: 4, totalLessons: 5 })).toBe(false);
		// Ajout de leçons ⇒ le même nombre d'étoiles ne suffit plus.
		expect(def.test!({ stars: 67, totalLessons: 67 })).toBe(true);
		expect(def.test!({ stars: 15, totalLessons: 67 })).toBe(false);
		// Garde-fou : aucun déclenchement à 0 leçon.
		expect(def.test!({ stars: 0, totalLessons: 0 })).toBe(false);
	});
	test('gSnapshot expose totalLessons (= catalogue)', () => {
		expect(api.gSnapshot().totalLessons).toBe(getAllLessons().length);
	});
});

describe('XP & gamification multi-matières', () => {
	test('XP : 0 au départ, addXP cumule, addXP(≤0) ignoré', () => {
		expect(api.getXP()).toBe(0);
		api.addXP(3);
		api.addXP(2);
		expect(api.getXP()).toBe(5);
		api.addXP(0);
		api.addXP(-4);
		expect(api.getXP()).toBe(5);
	});
	test('Niveaux : coût du palier et XP cumulée par niveau', () => {
		// xpVersSuivant(L) = round(12 × L^0,89) : palier 1→2 = 12 XP, donc une leçon
		// isolée (~10 bonnes réponses) fait gagner au plus 1 niveau en début de jeu.
		expect([1, 2, 3, 4, 5].map(api.xpVersSuivant)).toEqual([12, 22, 32, 41, 50]);
		// xpPourNiveau = cumul des paliers ; niveau 1 ⇒ 0 XP.
		expect(api.xpPourNiveau(1)).toBe(0);
		expect([2, 3, 4, 5, 6].map(api.xpPourNiveau)).toEqual([12, 34, 66, 107, 157]);
		// Le coût est strictement croissant (« de plus en plus dur »).
		expect(api.xpVersSuivant(60)).toBeGreaterThan(api.xpVersSuivant(10));
		// Une leçon isolée (~10 XP) fait gagner au plus 1 niveau au démarrage (#38).
		expect(api.niveauDepuisXP(10)).toBeLessThanOrEqual(2);
	});
	test('Niveaux : niveau dérivé de l’XP, plafonné à NIVEAU_MAX', () => {
		expect(api.niveauDepuisXP(0)).toBe(1);
		expect(api.niveauDepuisXP(11)).toBe(1); // pas encore le 1er palier (12 XP)
		expect(api.niveauDepuisXP(12)).toBe(2);
		expect(api.niveauDepuisXP(33)).toBe(2); // pas encore le palier suivant (34 XP)
		expect(api.niveauDepuisXP(34)).toBe(3);
		// Cohérence avec xpPourNiveau : l’XP juste sous un palier ne fait pas monter.
		const xp50 = api.xpPourNiveau(50);
		expect(api.niveauDepuisXP(xp50)).toBe(50);
		expect(api.niveauDepuisXP(xp50 - 1)).toBe(49);
		// Plafond : au-delà de l’XP du niveau max, on reste au niveau max.
		expect(api.niveauDepuisXP(api.xpPourNiveau(api.NIVEAU_MAX))).toBe(api.NIVEAU_MAX);
		expect(api.niveauDepuisXP(10_000_000)).toBe(api.NIVEAU_MAX);
	});
	test('Niveaux : progressionNiveau (barre)', () => {
		// Pile sur un palier ⇒ niveau monté, barre à 0 %.
		const p = api.progressionNiveau(api.xpPourNiveau(3));
		expect(p.niveau).toBe(3);
		expect(p.xpDansNiveau).toBe(0);
		expect(p.xpRequisPalier).toBe(api.xpVersSuivant(3));
		expect(p.pct).toBe(0);
		expect(p.max).toBe(false);
		// Niveau max ⇒ barre pleine et figée.
		const pm = api.progressionNiveau(api.xpPourNiveau(api.NIVEAU_MAX));
		expect(pm.max).toBe(true);
		expect(pm.pct).toBe(100);
	});
	test('gSnapshot agrège bonnes réponses et étoiles par matière/catégorie', () => {
		api.recordLessonStats({ 'math-tables-addition': { ok: 30, total: 30 } });
		api.recordLessonStats({ 'math-doubles': { ok: 20, total: 20 } });
		const g = api.gSnapshot();
		expect(g.subjectCorrect.math).toBe(50);
		expect(g.categoryCorrect['math-calcul-mental']).toBe(50);
		api.recordLessonResult('math-tables-addition', true);
		api.recordLessonResult('math-doubles', true);
		const g2 = api.gSnapshot();
		expect(g2.subjectStars.math).toBe(2);
		expect(g2.categoryStars['math-calcul-mental']).toBe(2);
	});
	test('trophée par matière débloqué à 50 bonnes réponses', () => {
		api.recordLessonStats({ 'math-tables-multiplication': { ok: 50, total: 60 } });
		expect(api.gSnapshot().subjectCorrect.math).toBe(50);
		expect(
			api
				.evaluateTrophies()
				.map((t) => t.id)
				.includes('subj-math-50'),
		).toBe(true);
	});
	test('trophée par catégorie débloqué à 3 leçons étoilées', () => {
		const ids = getAllLessons()
			.slice(0, 3)
			.map((l) => l.id);
		for (const id of ids) api.recordLessonResult(id, true);
		expect(api.gSnapshot().categoryStars['math-calcul-mental']).toBe(3);
		expect(
			api
				.evaluateTrophies()
				.map((t) => t.id)
				.includes('cat-math-calcul-mental-3'),
		).toBe(true);
	});
});

describe('Déblocages par niveau (unlocks)', () => {
	test('titreDuNiveau : rang courant aux bornes des paliers', () => {
		// Seuils : 1 Graine · 10 Pousse · 25 Arbuste · 45 Jeune arbre · 65 Grand chêne
		// · 85 Forêt · 100 Légende de la forêt.
		expect(api.titreDuNiveau(1).titre).toBe('Graine');
		expect(api.titreDuNiveau(9).titre).toBe('Graine');
		expect(api.titreDuNiveau(10).titre).toBe('Pousse');
		expect(api.titreDuNiveau(24).titre).toBe('Pousse');
		expect(api.titreDuNiveau(25).titre).toBe('Arbuste');
		expect(api.titreDuNiveau(84).titre).toBe('Grand chêne');
		expect(api.titreDuNiveau(85).titre).toBe('Forêt');
		expect(api.titreDuNiveau(99).titre).toBe('Forêt');
		expect(api.titreDuNiveau(100).titre).toBe('Légende de la forêt');
	});
	test('titreDuNiveau : monotone (le rang ne régresse jamais)', () => {
		let dernierSeuil = 0;
		for (let n = 1; n <= api.NIVEAU_MAX; n++) {
			const r = api.titreDuNiveau(n);
			expect(r.seuil).toBeGreaterThanOrEqual(dernierSeuil);
			dernierSeuil = r.seuil;
		}
		// Le dernier rang couvre exactement le niveau max.
		expect(api.RANGS[api.RANGS.length - 1].seuil).toBe(api.NIVEAU_MAX);
	});
	test('mascotteDuNiveau : forme courante aux seuils', () => {
		// 1 🥚 · 3 🐣 · 10 🐥 · 25 🐤 · 50 🦉 · 65 🦜 · 80 🦢 · 90 🦚 · 100 🦅
		expect(api.mascotteDuNiveau(1).emoji).toBe('🥚');
		expect(api.mascotteDuNiveau(2).emoji).toBe('🥚');
		expect(api.mascotteDuNiveau(3).emoji).toBe('🐣');
		expect(api.mascotteDuNiveau(9).emoji).toBe('🐣');
		expect(api.mascotteDuNiveau(10).emoji).toBe('🐥');
		expect(api.mascotteDuNiveau(49).emoji).toBe('🐤');
		expect(api.mascotteDuNiveau(50).emoji).toBe('🦉');
		expect(api.mascotteDuNiveau(64).emoji).toBe('🦉');
		expect(api.mascotteDuNiveau(65).emoji).toBe('🦜');
		expect(api.mascotteDuNiveau(100).emoji).toBe('🦅');
		// `forme` pilote la catégorie d'animation.
		expect(api.mascotteDuNiveau(1).forme).toBe('oeuf');
		expect(api.mascotteDuNiveau(3).forme).toBe('oisillon');
		expect(api.mascotteDuNiveau(50).forme).toBe('oiseau');
	});
	test('mascotteDuNiveau : monotone + dernière forme au niveau max', () => {
		let dernierSeuil = 0;
		for (let n = 1; n <= api.NIVEAU_MAX; n++) {
			const m = api.mascotteDuNiveau(n);
			expect(m.seuil).toBeGreaterThanOrEqual(dernierSeuil);
			dernierSeuil = m.seuil;
		}
		expect(api.MASCOTTE[api.MASCOTTE.length - 1].seuil).toBe(api.NIVEAU_MAX);
	});
	test('recompensesNiveau : rang et/ou mascotte selon le palier (hors niveau 1)', () => {
		expect(api.recompensesNiveau(1)).toEqual([]); // œuf + Graine de départ : pas un déblocage
		expect(api.recompensesNiveau(2)).toEqual([]); // aucun palier
		// 3 : mascotte seule (pas un palier de rang).
		expect(api.recompensesNiveau(3).map((r) => r.type)).toEqual(['mascotte']);
		// 10 : rang Pousse + mascotte 🐥 (rang annoncé d'abord).
		const r10 = api.recompensesNiveau(10);
		expect(r10.map((r) => r.type)).toEqual(['rang', 'mascotte']);
		expect(r10[0].texte).toContain('Pousse');
		// 5 : avatar forêt seul (ni rang ni mascotte à ce palier).
		expect(api.recompensesNiveau(5).map((r) => r.type)).toEqual(['avatar']);
		// 45 : rang Jeune arbre + avatar 🦫 (pas de mascotte à 45).
		expect(api.recompensesNiveau(45).map((r) => r.type)).toEqual(['rang', 'avatar']);
		// 50 : mascotte seule (pas un palier de rang ni d'avatar).
		expect(api.recompensesNiveau(50).map((r) => r.type)).toEqual(['mascotte']);
		// 100 : rang Légende + mascotte 🦅 + avatar 🦅 (ordre rang → mascotte → avatar).
		expect(api.recompensesNiveau(100).map((r) => r.type)).toEqual(['rang', 'mascotte', 'avatar']);
	});
	test('recompensesEntre : agrège rangs ET mascotte sur un saut multi-niveaux', () => {
		// 9 → 11 : franchit le palier 10 (rang Pousse + mascotte 🐥).
		expect(api.recompensesEntre(9, 11).map((r) => r.type)).toEqual(['rang', 'mascotte']);
		// 1 → 25 : mascotte aux niv 3/10/25, rang aux niv 10/25.
		const gros = api.recompensesEntre(1, 25);
		expect(gros.filter((r) => r.type === 'mascotte')).toHaveLength(3);
		expect(gros.filter((r) => r.type === 'rang')).toHaveLength(2);
		// Aucun changement de niveau ⇒ aucun déblocage.
		expect(api.recompensesEntre(12, 12)).toEqual([]);
	});
});

describe('Déblocages : avatars forêt (gating)', () => {
	test('niveauRequisAvatar / avatarsForetDebloques', () => {
		expect(api.niveauRequisAvatar('🐿️')).toBe(5);
		expect(api.niveauRequisAvatar('🦅')).toBe(100);
		expect(api.niveauRequisAvatar('🐧')).toBeNull(); // avatar de base, pas forêt
		expect(api.avatarsForetDebloques(1)).toEqual([]);
		expect(api.avatarsForetDebloques(5)).toEqual(['🐿️']);
		expect(api.avatarsForetDebloques(30)).toEqual(['🐿️', '🦔', '🦌']);
		// Dernier avatar débloqué au niveau max.
		expect(api.AVATARS_FORET[api.AVATARS_FORET.length - 1].niveau).toBe(api.NIVEAU_MAX);
	});
	test('setProfileEmoji : base toujours OK, forêt seulement si débloqué', () => {
		const uuid = api.activeProfile().uuid;
		// Avatar de base : autorisé même au niveau 1.
		api.setProfileEmoji(uuid, '🦊');
		expect(api.activeProfile().emoji).toBe('🦊');
		// Avatar forêt verrouillé (niveau 1 < 5) : refusé.
		api.setProfileEmoji(uuid, '🐿️');
		expect(api.activeProfile().emoji).toBe('🦊');
		expect(api.avatarAutorise(uuid, '🐿️')).toBe(false);
		// Assez d'XP pour le niveau 5 → débloqué.
		api.addXP(api.xpPourNiveau(5));
		expect(api.avatarAutorise(uuid, '🐿️')).toBe(true);
		api.setProfileEmoji(uuid, '🐿️');
		expect(api.activeProfile().emoji).toBe('🐿️');
	});
	test('resetProfile : rend un avatar forêt (XP=0), garde un avatar de base', () => {
		const uuid = api.activeProfile().uuid;
		api.addXP(api.xpPourNiveau(5));
		api.setProfileEmoji(uuid, '🐿️');
		expect(api.activeProfile().emoji).toBe('🐿️');
		api.resetProfile(uuid);
		expect(api.activeProfile().emoji).toBe(api.PROFILE_EMOJIS[0]); // forêt rendu
		// Un avatar de base survit au reset.
		api.setProfileEmoji(uuid, '🐼');
		api.resetProfile(uuid);
		expect(api.activeProfile().emoji).toBe('🐼');
	});
});

describe('Déblocages : thèmes & préférences', () => {
	test('themesDebloques : confort (niv 1) toujours dispo, couleur par palier', () => {
		// Les thèmes de CONFORT (Forêt / Nuit / Clair-obscur) sont à niveau 1 → dispo dès le départ.
		expect(api.themesDebloques(1)).toEqual(['defaut', 'nuit', 'auto']);
		expect(api.themesDebloques(20)).toEqual(['defaut', 'nuit', 'auto', 'ciel']);
		expect(api.themesDebloques(70)).toEqual(['defaut', 'nuit', 'auto', 'ciel', 'automne', 'lagon']);
		expect(api.themesDebloques(95)).toContain('fruit-rouge');
		// Le défaut n'a pas de seuil de déblocage « vécu ».
		expect(THEMES_UNLOCK[0].id).toBe('defaut');
		expect(THEMES_UNLOCK[0].niveau).toBe(1);
	});
	test('thèmes de confort (#224) : Nuit & Clair-obscur, niv 1, sans récompense', () => {
		const confort = THEMES_UNLOCK.filter((t) => t.confort);
		// Exactement les trois thèmes d'affichage, tous au niveau 1.
		expect(confort.map((t) => t.id)).toEqual(['defaut', 'nuit', 'auto']);
		expect(confort.every((t) => t.niveau === 1)).toBe(true);
		// Aucun thème de confort n'est annoncé comme récompense de palier.
		for (let n = 1; n <= 100; n++) {
			const themes = api.recompensesNiveau(n).filter((r) => r.type === 'theme');
			expect(themes.some((r) => /Nuit|Clair-obscur/.test(r.texte))).toBe(false);
		}
	});
	test('setTheme : un thème de confort est sélectionnable dès le niveau 1', () => {
		// Niveau 1, aucune XP : Nuit et Clair-obscur passent le garde-fou (non gatés).
		api.setTheme('nuit');
		expect(api.getTheme()).toBe('nuit');
		api.setTheme('auto');
		expect(api.getTheme()).toBe('auto');
		// Un thème de couleur gaté reste, lui, refusé à ce niveau.
		api.setTheme('ciel');
		expect(api.getTheme()).toBe('auto');
	});
	test('recompensesNiveau : thème annoncé à 20/40/70/95 (hors défaut)', () => {
		expect(api.recompensesNiveau(20).map((r) => r.type)).toEqual(['theme']);
		expect(api.recompensesNiveau(20)[0].texte).toContain('Ciel');
		expect(api.recompensesNiveau(95).map((r) => r.type)).toContain('theme');
		// 21 n'est pas un palier.
		expect(api.recompensesNiveau(21)).toEqual([]);
	});
	test('getTheme / setTheme : gating par niveau du profil actif, défaut sinon', () => {
		expect(api.getTheme()).toBe('defaut'); // au départ
		// Thème verrouillé (niveau 1 < 20) : refusé, reste au défaut.
		api.setTheme('ciel');
		expect(api.getTheme()).toBe('defaut');
		// Assez d'XP pour le niveau 20 → Ciel débloqué et sélectionnable.
		api.addXP(api.xpPourNiveau(20));
		api.setTheme('ciel');
		expect(api.getTheme()).toBe('ciel');
	});
	test('getTheme : garde-fou si le thème stocké n’est plus débloqué', () => {
		// Thème stocké directement (jadis débloqué) mais niveau insuffisant → défaut.
		api.lsSet('ludaskia_theme', 'ciel');
		expect(api.getTheme()).toBe('defaut'); // niveau 1 → Ciel (niv 20) non débloqué
		// Avec l'XP suffisante, le thème stocké redevient valide.
		api.addXP(api.xpPourNiveau(20));
		expect(api.getTheme()).toBe('ciel');
	});
	test('animationsReduites : faux par défaut, persistant', () => {
		expect(api.animationsReduites()).toBe(false);
		api.setAnimationsReduites(true);
		expect(api.animationsReduites()).toBe(true);
		api.setAnimationsReduites(false);
		expect(api.animationsReduites()).toBe(false);
	});
});

describe('Sprint', () => {
	test('un sprint compte dans gSnapshot.sprints + trophée sprint1', () => {
		api.recordRun('sprint', 12, 15, 300000);
		expect(api.gSnapshot().sprints).toBe(1);
		expect(
			api
				.evaluateTrophies()
				.map((t) => t.id)
				.includes('sprint1'),
		).toBe(true);
	});
	test('objectif sprint validé en terminant un sprint', () => {
		api.lsSet(api.GOAL_KEY, {
			date: api.todayStr(),
			type: 'sprint',
			target: 1,
			label: 'x',
			progress: 0,
			done: false,
		});
		expect(api.updateGoal({ mode: 'complet' }).justDone).toBe(false);
		expect(api.updateGoal({ mode: 'sprint', sprint: true }).justDone).toBe(true);
	});
	test('le calcul mental couvre ses leçons (décomposer + division par le sens)', () => {
		const calculMental = getLessonsByCategory('math-calcul-mental');
		expect(calculMental.some((l) => l.id === 'math-decomposer-multiplication')).toBe(true);
		expect(calculMental.some((l) => l.id === 'math-div-partage')).toBe(true); // #104
		expect(calculMental.some((l) => l.id === 'math-div-reste')).toBe(true); // #95
		expect(calculMental.length).toBe(18); // 15 legacy + moitié-quart + Je partage + reste
	});
	test('sprint leçon 15 : étapes intermédiaires + champ final', () => {
		const body15 = api.sprintQuestionBody({
			text: '6 × 14 = @',
			answer: 84,
			_lesson: 'math-decomposer-multiplication',
		});
		expect((body15.match(/sprint-free/g) || []).length).toBe(6); // 6 champs de brouillon
		expect((body15.match(/id="sprintInput"/g) || []).length).toBe(1); // 1 champ final corrigé
		const body7 = api.sprintQuestionBody({
			text: '6 × 7 = @',
			answer: 42,
			_lesson: 'math-tables-multiplication',
		});
		expect(body7.includes('sprint-free')).toBe(false);
		expect(body7.includes('id="sprintInput"')).toBe(true);
	});
});

describe('Sélection de leçons & sprint personnalisé (#64)', () => {
	test('lessonsForIds : résout dans l’ordre demandé et ignore les inconnus', () => {
		const out = api.lessonsForIds(['math-doubles', 'inconnue-xyz', 'math-tables-addition']);
		expect(out.map((l) => l.id)).toEqual(['math-doubles', 'math-tables-addition']);
	});
	test('lessonsForIds : liste vide ou 100 % inconnus → []', () => {
		expect(api.lessonsForIds([])).toEqual([]);
		expect(api.lessonsForIds(['rien', 'non-plus'])).toEqual([]);
	});
	test('bilanMode : favori legacy sans mode = bilan ; mode sprint respecté', () => {
		const base = { id: 'x', label: 'L', lessonIds: ['math-doubles'], questionsPerLesson: 3 };
		expect(api.bilanMode(base)).toBe('bilan'); // migration : pas de champ → bilan
		expect(api.bilanMode({ ...base, mode: 'bilan' })).toBe('bilan');
		expect(api.bilanMode({ ...base, mode: 'sprint' })).toBe('sprint');
	});
});

describe('Rattachement d’un favori à sa catégorie (#65)', () => {
	test('commonCategoryId : mono-catégorie → la catégorie ; multi → undefined', () => {
		const lessons = getAllLessons();
		// Deux catégories distinctes peuplées par au moins une leçon chacune.
		const byCat = new Map<string, string[]>();
		for (const l of lessons) byCat.set(l.category, [...(byCat.get(l.category) ?? []), l.id]);
		const cats = [...byCat.keys()];
		expect(cats.length).toBeGreaterThanOrEqual(2);

		// Toutes les leçons d'une même catégorie → cette catégorie.
		const [catA, catB] = cats;
		expect(api.commonCategoryId(byCat.get(catA)!)).toBe(catA);
		// Une seule leçon → sa catégorie.
		expect(api.commonCategoryId([byCat.get(catA)![0]])).toBe(catA);
		// Mélange de deux catégories → undefined (bilan multi-catégories, accueil seul).
		expect(api.commonCategoryId([byCat.get(catA)![0], byCat.get(catB)![0]])).toBeUndefined();
	});
	test('commonCategoryId : liste vide ou 100 % inconnus → undefined', () => {
		expect(api.commonCategoryId([])).toBeUndefined();
		expect(api.commonCategoryId(['rien', 'non-plus'])).toBeUndefined();
	});
	test('loadBilans : backfill de categoryId pour un favori legacy mono-catégorie', () => {
		const byCat = new Map<string, string[]>();
		for (const l of getAllLessons())
			byCat.set(l.category, [...(byCat.get(l.category) ?? []), l.id]);
		const [catA, catB] = [...byCat.keys()];

		// Favori antérieur à #65 : aucun champ categoryId enregistré.
		saveBilan({
			id: 'leg-mono',
			label: 'Vieux',
			lessonIds: byCat.get(catA)!,
			questionsPerLesson: 3,
		});
		saveBilan({
			id: 'leg-multi',
			label: 'Vieux multi',
			lessonIds: [byCat.get(catA)![0], byCat.get(catB)![0]],
			questionsPerLesson: 3,
		});

		const loaded = loadBilans();
		// Mono-catégorie → rattaché à la lecture, sans réécrire le stockage.
		expect(loaded.find((b) => b.id === 'leg-mono')!.categoryId).toBe(catA);
		// Multi-catégories → reste accueil-only.
		expect(loaded.find((b) => b.id === 'leg-multi')!.categoryId).toBeUndefined();
	});
});

describe('Français — Conjugaison', () => {
	test('conjugationType.generate produit un exercice texte avec champ et bonne réponse', () => {
		const t = conjugationType('etre', 'present');
		const formes = VERBS.find((v) => v.id === 'etre')!.forms.present;
		for (let i = 0; i < 50; i++) {
			const ex = t.generate();
			expect(ex.type).toBe('text');
			if (ex.type === 'text') {
				expect(ex.question.includes('@')).toBe(true);
				expect(formes.includes(ex.answer)).toBe(true);
			}
		}
	});
	test('vérification stricte : accent et forme exacte exigés', () => {
		const t = conjugationType('etre', 'present');
		const ex = { type: 'text' as const, question: 'être · présent — vous @', answer: 'êtes' };
		expect(t.check(ex, 'êtes')).toBe(true);
		expect(t.check(ex, ' êtes ')).toBe(true); // trim toléré
		expect(t.check(ex, 'etes')).toBe(false); // accent manquant
		expect(t.check(ex, 'est')).toBe(false); // mauvaise forme
	});
	test('futur simple : aller → j’irai (élision affichée, forme « irai »)', () => {
		const t = conjugationType('aller', 'futur');
		const ex = { type: 'text' as const, question: 'aller · futur — j’@', answer: 'irai' };
		expect(t.check(ex, 'irai')).toBe(true);
		expect(t.check(ex, 'irais')).toBe(false);
	});
	test('intégrité des données : chaque verbe couvre les 4 temps × 6 personnes', () => {
		const tenses = ['present', 'futur', 'imparfait', 'passe_compose'] as const;
		for (const v of VERBS) {
			for (const tense of tenses) {
				const formes = v.forms[tense];
				expect(formes, `${v.id}/${tense}`).toBeDefined();
				expect(formes.length).toBe(6);
				expect(formes.every((f) => f.trim().length > 0)).toBe(true);
			}
		}
	});
	test('passé composé : verbe en « être » accordé (aller → nous sommes allés)', () => {
		const t = conjugationType('aller', 'passe_compose');
		const ex = {
			type: 'text' as const,
			question: 'aller · passé composé — nous @',
			answer: 'sommes allés',
		};
		expect(t.check(ex, 'sommes allés')).toBe(true);
		expect(t.check(ex, 'sommes allé')).toBe(false); // accord pluriel manquant
	});
	test('catalogue : 52 leçons de conjugaison (13 verbes × 4 temps)', () => {
		// La matière Français contient désormais aussi du vocabulaire (#108) : on
		// compte la conjugaison par sa catégorie, pas par la matière entière.
		const conj = getLessonsByCategory('fr-conjugaison');
		expect(conj.length).toBe(CONJ_LESSONS.length);
		expect(conj.length).toBe(52);
		const fr = conj;
		expect(fr.every((l) => l.category === 'fr-conjugaison')).toBe(true);
		expect(fr.some((l) => l.id === 'fr-conj-etre-present')).toBe(true);
		expect(fr.some((l) => l.id === 'fr-conj-aller-futur')).toBe(true);
		expect(fr.some((l) => l.id === 'fr-conj-venir-imparfait')).toBe(true);
		expect(fr.some((l) => l.id === 'fr-conj-prendre-passe_compose')).toBe(true);
	});
	test('libellés uniformes « Verbe (Ne groupe) au temps » ; auxiliaires à part', () => {
		const labelOf = (id: string) => CONJ_LESSONS.find((l) => l.id === id)!.label;
		// Format uniforme pour les verbes ordinaires (1er / 2e / 3e groupe).
		expect(labelOf('fr-conj-aimer-present')).toBe('Aimer (1er groupe) au présent');
		expect(labelOf('fr-conj-finir-futur')).toBe('Finir (2e groupe) au futur');
		expect(labelOf('fr-conj-aller-imparfait')).toBe("Aller (3e groupe) à l'imparfait");
		expect(labelOf('fr-conj-naitre-passe_compose')).toBe('Naître (3e groupe) au passé composé');
		// Les auxiliaires gardent leur libellé dédié (pas de groupe).
		expect(labelOf('fr-conj-etre-present')).toBe("L'auxiliaire être au présent");
		expect(labelOf('fr-conj-avoir-futur')).toBe("L'auxiliaire avoir au futur");
		// Tous les libellés non-auxiliaires portent un groupe (aucun « (undefined) »).
		const nonAux = CONJ_LESSONS.filter((l) => l.verbId !== 'etre' && l.verbId !== 'avoir');
		expect(nonAux.every((l) => /\((1er|2e|3e) groupe\)/.test(l.label))).toBe(true);
	});
	test('genLessonItem : item texte pour le français, numérique pour les maths', () => {
		const frItem = genLessonItem(getLessonById('fr-conj-etre-present')!);
		expect(frItem.kind).toBe('text');
		expect(typeof frItem.answer).toBe('string');
		expect(frItem._lesson).toBe('fr-conj-etre-present');
		const mathItem = genLessonItem(getLessonById('math-tables-addition')!);
		expect(mathItem.kind).not.toBe('text');
		expect(typeof mathItem.answer).toBe('number');
	});
	test('checkItemAnswer route selon le type (texte NFC vs numérique)', () => {
		expect(checkItemAnswer({ text: 'x', answer: 'êtes', kind: 'text' }, 'êtes')).toBe(true);
		expect(checkItemAnswer({ text: 'x', answer: 'êtes', kind: 'text' }, 'etes')).toBe(false);
		expect(checkItemAnswer({ text: 'x', answer: 12 }, '12')).toBe(true);
		expect(checkItemAnswer({ text: 'x', answer: 12 }, '13')).toBe(false);
	});
	test('normalizeText réduit les espaces internes et de bord (issue #66)', () => {
		expect(normalizeText('a  mangé')).toBe('a mangé'); // double espace interne
		expect(normalizeText('  a   mangé  ')).toBe('a mangé'); // bords + espaces multiples
		expect(normalizeText('a\tmangé')).toBe('a mangé'); // tabulation
	});
	test('checkItemAnswer (conjugaison) : double espace acceptée (issue #66)', () => {
		const it = { text: 'x', answer: 'a mangé', kind: 'text' as const };
		expect(checkItemAnswer(it, 'a  mangé')).toBe(true); // deux espaces
		expect(checkItemAnswer(it, ' a mangé ')).toBe(true); // espaces de bord
		expect(checkItemAnswer(it, 'a mangé')).toBe(true); // exact
		// Les formes alternatives bénéficient aussi de la normalisation.
		const alt = {
			text: 'x',
			answer: 'se sont lavés',
			answers: ['se sont lavées'],
			kind: 'text' as const,
		};
		expect(checkItemAnswer(alt, 'se  sont  lavées')).toBe(true);
		// L'accent reste exigé (pas un effet de bord du fix).
		expect(checkItemAnswer(it, 'a mange')).toBe(false);
	});
	test('checkAnswer (orthographe/texte) : double espace acceptée (issue #66)', () => {
		const ex = { type: 'text' as const, question: 'q', answer: 'tout à coup' };
		expect(checkAnswer(ex, 'tout  à  coup')).toBe(true);
		expect(checkAnswer(ex, ' tout à coup ')).toBe(true);
		// Type non-text (dictée) : même normalisation des espaces.
		const dictee = { type: 'dictee' as const, answer: 'il a dit' };
		expect(checkAnswer(dictee, 'il  a  dit')).toBe(true);
	});
	test('genItems : pas de doublon dans une leçon de conjugaison (issue #36)', () => {
		const lesson = getLessonById('fr-conj-etre-present')!;
		// On demande plus de questions qu'il n'existe de variantes (6 personnes).
		for (let run = 0; run < 50; run++) {
			const items = genItems(lesson, 8);
			const texts = items.map((it) => it.text);
			// Aucun item répété à l'identique…
			expect(new Set(texts).size).toBe(texts.length);
			// …et on plafonne au nombre de personnes plutôt que de compléter par des doublons.
			expect(items.length).toBe(6);
		}
	});
	test('genItems : renvoie exactement n items distincts quand n ≤ variantes', () => {
		const items = genItems(getLessonById('fr-conj-aller-futur')!, 4);
		expect(items.length).toBe(4);
		expect(new Set(items.map((it) => it.text)).size).toBe(4);
	});
	test('mode QCM : 4 choix distincts, bonne réponse incluse, toutes formes réelles (issue #53)', () => {
		const tenses = ['present', 'futur', 'imparfait', 'passe_compose'] as const;
		const allForms = (verbId: string) => {
			const v = VERBS.find((x) => x.id === verbId)!;
			return new Set(tenses.flatMap((t) => v.forms[t]));
		};
		for (const verbId of ['etre', 'aimer', 'aller', 'prendre']) {
			const formsSet = allForms(verbId);
			for (const tense of tenses) {
				const type = conjugationType(verbId, tense);
				for (let i = 0; i < 30; i++) {
					const ex = type.generate({ mode: 'qcm' });
					expect(ex.type).toBe('qcm');
					if (ex.type === 'qcm') {
						expect(ex.choices.length).toBe(4);
						expect(new Set(ex.choices).size).toBe(4); // distincts
						expect(ex.choices.includes(ex.answer)).toBe(true); // bonne réponse présente
						expect(ex.choices.every((c) => formsSet.has(c))).toBe(true); // jamais de faute
						expect(ex.question.includes('@')).toBe(true);
					}
				}
			}
		}
	});
	test('mode QCM : check accepte la bonne forme, refuse une autre proposition', () => {
		const type = conjugationType('etre', 'imparfait');
		const ex = type.generate({ mode: 'qcm' });
		if (ex.type === 'qcm') {
			expect(type.check(ex, ex.answer)).toBe(true);
			const wrong = ex.choices.find((c) => c !== ex.answer)!;
			expect(type.check(ex, wrong)).toBe(false);
		}
	});
	test('rétrocompatibilité : sans mode (ou « saisie ») → exercice texte', () => {
		const type = conjugationType('etre', 'present');
		expect(type.generate().type).toBe('text');
		expect(type.generate({ mode: 'saisie' }).type).toBe('text');
	});
});

describe('Bilan express borné (issue #35)', () => {
	test('questions par leçon : ≤ 3, et 1 quand il y a beaucoup de leçons', () => {
		expect(expressQuestionsPerLesson(1)).toBe(3);
		expect(expressQuestionsPerLesson(6)).toBe(3); // 20/6 = 3
		expect(expressQuestionsPerLesson(7)).toBe(2); // 20/7 = 2
		expect(expressQuestionsPerLesson(10)).toBe(2);
		expect(expressQuestionsPerLesson(15)).toBe(1); // calcul mental
		expect(expressQuestionsPerLesson(20)).toBe(1);
		expect(expressQuestionsPerLesson(52)).toBe(1); // conjugaison
		expect(expressQuestionsPerLesson(0)).toBe(0);
	});
	test('total de questions borné autour du plafond', () => {
		for (const n of [1, 4, 6, 7, 10, 15, 20, 52]) {
			const lessons = Array.from({ length: n }, (_, i) => `l${i}`);
			const selected = sampleExpressLessons(lessons);
			const total = selected.length * expressQuestionsPerLesson(n);
			expect(total).toBeLessThanOrEqual(EXPRESS_CAP);
		}
	});
	test('poids : leçon fragile prioritaire, leçon récente dépriorisée', () => {
		expect(expressWeight(null, false)).toBe(3); // jamais vue
		expect(expressWeight(40, false)).toBe(4); // faible
		expect(expressWeight(70, false)).toBe(2); // moyenne
		expect(expressWeight(95, false)).toBe(1); // solide
		expect(expressWeight(40, true)).toBe(2); // faible mais déjà tirée
		expect(expressWeight(95, true)).toBe(1); // plancher à 1
	});
	test('échantillonnage : au plus `cap` leçons, distinctes, issues de l’ensemble', () => {
		const lessons = Array.from({ length: 52 }, (_, i) => `l${i}`);
		for (let run = 0; run < 30; run++) {
			const selected = sampleExpressLessons(lessons);
			expect(selected.length).toBe(EXPRESS_CAP);
			expect(new Set(selected).size).toBe(selected.length); // distinctes
			expect(selected.every((id) => lessons.includes(id))).toBe(true);
		}
	});
	test('pas d’échantillonnage en deçà du plafond : toutes les leçons', () => {
		const lessons = Array.from({ length: 15 }, (_, i) => `l${i}`);
		const selected = sampleExpressLessons(lessons);
		expect(selected.sort()).toEqual(lessons.sort());
	});
});

describe('Impression contextuelle (issue #40)', () => {
	test('fiches multi-matières : couvre maths ET conjugaison, avec page de garde', () => {
		const html = api.buildPrintableDOM({
			title: 'Test',
			lessonIds: ['math-tables-addition', 'fr-conj-etre-present'],
			kind: 'fiches',
		});
		expect(html.includes('class="page cover')).toBe(true); // garde dès 2 leçons
		expect(html.includes('ans-text')).toBe(true); // champ texte (conjugaison)
		expect(html.includes('class="ans ')).toBe(true); // champ numérique (maths)
	});
	test('une seule leçon : pas de page de garde', () => {
		const html = api.buildPrintableDOM({
			title: 'x',
			lessonIds: ['math-doubles'],
			kind: 'fiches',
		});
		expect(html.includes('class="page cover')).toBe(false);
	});
	test('bilan : grille de bilan, titre repris, multi-matières', () => {
		const html = api.buildPrintableDOM({
			title: 'Bilan test',
			lessonIds: ['fr-conj-aller-futur', 'math-doubles'],
			kind: 'bilan',
			nbQ: 2,
		});
		expect(html.includes('bilan-grid')).toBe(true);
		expect(html.includes('Bilan test')).toBe(true);
	});
});

describe('Révision espacée (issue #45)', () => {
	const T0 = 1_700_000_000_000; // instant de référence (ms)
	test('entrée en rotation : palier 0, dû dès J+1', () => {
		const e = etatNeuf(T0);
		expect(e.palier).toBe(0);
		expect(e.prochaineRevision).toBe(T0 + REVISION_INTERVALLES[0]);
		expect(estDu(e, T0)).toBe(false); // pas dû tout de suite
		expect(estDu(e, T0 + REVISION_INTERVALLES[0])).toBe(true); // dû dès le lendemain
	});
	test('réussite monte d’un cran ; acquis sort de la rotation', () => {
		let e = etatNeuf(T0);
		for (let i = 0; i < PALIER_ACQUIS; i++) e = avancerEtat(e, true, T0);
		expect(e.palier).toBe(PALIER_ACQUIS);
		expect(estAcquis(e)).toBe(true);
		expect(e.prochaineRevision).toBe(null); // plus en rotation
		expect(estDu(e, T0 + 10 * 365 * 86400000)).toBe(false);
	});
	test('échec recule d’UN cran, jamais sous 0', () => {
		let e = etatNeuf(T0);
		e = avancerEtat(e, true, T0); // palier 1
		e = avancerEtat(e, true, T0); // palier 2
		e = avancerEtat(e, false, T0); // → palier 1
		expect(e.palier).toBe(1);
		const z = avancerEtat(etatNeuf(T0), false, T0); // déjà à 0
		expect(z.palier).toBe(0);
	});
	test('sélection : éléments dus regroupés par catégorie, plafonnés', () => {
		const lessonRevisions = {
			'math-doubles': { palier: 0, prochaineRevision: T0 - 1000, reussites: 0, dernierTest: null },
			'fr-conj-etre-present': {
				palier: 1,
				prochaineRevision: T0 - 5000,
				reussites: 1,
				dernierTest: T0,
			},
			'math-moities': {
				palier: 0,
				prochaineRevision: T0 + 999999,
				reussites: 0,
				dernierTest: null,
			}, // pas dû
		};
		const ortho = { banque: {}, listes: [], motIdParForme: {} };
		expect(countDue(ortho, lessonRevisions, T0)).toBe(2);
		const groups = selectDueGroups(ortho, lessonRevisions, T0);
		const cats = groups.map((g) => g.categoryId);
		expect(cats).toContain('math-calcul-mental');
		expect(cats).toContain('fr-conjugaison');
		// une catégorie n'apparaît qu'une fois (regroupement)
		expect(new Set(cats).size).toBe(cats.length);
		const total = groups.reduce((n, g) => n + g.items.length, 0);
		expect(total).toBe(2);
	});
	test('sélection : plafond respecté', () => {
		const lessonRevisions: Record<string, any> = {};
		for (const l of getAllLessons())
			lessonRevisions[l.id] = {
				palier: 0,
				prochaineRevision: T0 - 1000,
				reussites: 0,
				dernierTest: null,
			};
		const groups = selectDueGroups(
			{ banque: {}, listes: [], motIdParForme: {} },
			lessonRevisions,
			T0,
			5,
		);
		const total = groups.reduce((n, g) => n + g.items.length, 0);
		expect(total).toBe(5);
	});
	test('prochaineEcheance : re-test À VENIR le plus proche, ignore dus et acquis', () => {
		const lessonRevisions = {
			'math-doubles': { palier: 0, prochaineRevision: T0 - 1000, reussites: 0, dernierTest: null }, // dû → ignoré
			'math-moities': { palier: 1, prochaineRevision: T0 + 5000, reussites: 1, dernierTest: T0 },
			'fr-conj-etre-present': {
				palier: 2,
				prochaineRevision: T0 + 2000,
				reussites: 2,
				dernierTest: T0,
			}, // le plus proche
			'math-tables-addition': {
				palier: PALIER_ACQUIS,
				prochaineRevision: null,
				reussites: 6,
				dernierTest: T0,
			}, // acquis → ignoré
		};
		const ortho = { banque: {}, listes: [], motIdParForme: {} };
		expect(prochaineEcheance(ortho, lessonRevisions, T0)).toBe(T0 + 2000);
	});
	test('prochaineEcheance : null si rien n’est programmé', () => {
		const vide = { banque: {}, listes: [], motIdParForme: {} };
		expect(prochaineEcheance(vide, {}, T0)).toBe(null);
	});
	test('aDesRevisions : true dès qu’un élément connu est suivi, false sinon', () => {
		const ortho = { banque: {}, listes: [], motIdParForme: {} };
		expect(aDesRevisions(ortho, {})).toBe(false);
		expect(aDesRevisions(ortho, { 'math-doubles': etatNeuf(T0) })).toBe(true);
	});
});

describe('Reprise vers la révision espacée (#45)', () => {
	const NOW = 1_700_000_000_000;
	// Un mot « pré-fonctionnalité » : présent en banque, sans état de révision.
	function orthoSansRevision(): OrthoState {
		return {
			banque: { w1: { id: 'w1', mot: 'caillou', revision: undefined as any } as any },
			listes: [],
			motIdParForme: { caillou: 'w1' },
		};
	}

	test('backfillMotRevisions : mot sans état → dû dès aujourd’hui (daté J-1)', () => {
		const state = orthoSansRevision();
		expect(backfillMotRevisions(state, NOW - JOUR)).toBe(true);
		expect(estDu(state.banque.w1.revision, NOW)).toBe(true);
		// Idempotent : un 2e passage ne change plus rien.
		expect(backfillMotRevisions(state, NOW - JOUR)).toBe(false);
	});

	test('backfillLessonRevisions : leçon déjà notée mais hors rotation → due (J-1)', () => {
		api.recordLessonStats({ 'math-doubles': { ok: 8, total: 10 } });
		// recordLessonStats l'a entrée à J+1 (pas due) ; on simule l'absence d'état SR.
		api.lsSet('ludaskia_lessonRevision', {});
		backfillLessonRevisions(NOW - JOUR);
		const rev = loadLessonRevisions();
		expect(estDu(rev['math-doubles'], NOW)).toBe(true);
		// Idempotent : on ne réécrase pas une leçon déjà en rotation.
		const snapshot = JSON.stringify(rev);
		backfillLessonRevisions(NOW - JOUR);
		expect(JSON.stringify(loadLessonRevisions())).toBe(snapshot);
	});

	test('migrateRevisions : leçons notées + mots en banque deviennent dus', () => {
		api.recordLessonStats({ 'math-doubles': { ok: 8, total: 10 } });
		api.lsSet('ludaskia_lessonRevision', {}); // état d'avant la fonctionnalité
		saveOrtho(orthoSansRevision());
		migrateRevisions(NOW);
		expect(countDue(loadOrtho(), loadLessonRevisions(), NOW)).toBe(2);
	});
});

describe('Profils', () => {
	test('profil par défaut créé au 1er lancement (avec UUID)', () => {
		const m = api.loadProfilesMeta()!;
		expect(m.list.length).toBe(1);
		expect(m.active).toBe(m.list[0].uuid);
		expect(!!m.list[0].uuid).toBe(true);
		expect(api.activeProfile().name).toBe('Profil 1');
	});
	test('progression isolée par profil', () => {
		const p1 = api.activeProfile().uuid;
		api.recordRun('sprint', 5, 5, 300000); // profil par défaut
		const tom = api.addProfile('Tom', '🦊'); // bascule sur Tom (vierge)
		expect(api.loadRuns('sprint').length).toBe(0);
		api.recordRun('sprint', 3, 3, 300000);
		expect(api.loadRuns('sprint').length).toBe(1);
		api.setActiveProfile(p1); // retour au défaut
		expect(api.loadRuns('sprint').length).toBe(1); // intact
		api.setActiveProfile(tom.uuid);
		expect(api.loadRuns('sprint').length).toBe(1);
	}); // Tom intact aussi
	test('updatedAt bumpé à l’écriture de données', () => {
		api.recordRun('sprint', 1, 1, 300000);
		expect(Number.isFinite(api.activeProfile().updatedAt)).toBe(true);
	});
	test('réinitialiser un profil efface sa progression', () => {
		api.recordRun('express', 40, 45, 400000);
		const ids3 = getAllLessons()
			.slice(0, 3)
			.map((l) => l.id);
		for (const id of ids3) api.recordLessonResult(id, true);
		api.resetProfile(api.activeProfile().uuid);
		expect(api.loadRuns('express').length).toBe(0);
		expect(api.starsEarned()).toBe(0);
	});
	test('setProfileEmoji : choix direct d’un avatar valide, ignore l’inconnu (#32)', () => {
		const u = api.activeProfile().uuid;
		const cible = api.PROFILE_EMOJIS.find((e) => e !== api.activeProfile().emoji)!;
		api.setProfileEmoji(u, cible);
		expect(api.activeProfile().emoji).toBe(cible);
		// Émoji hors catalogue → no-op (l'avatar reste inchangé).
		api.setProfileEmoji(u, '💥');
		expect(api.activeProfile().emoji).toBe(cible);
	});
	test('supprimer un profil (mais pas le dernier)', () => {
		const tom = api.addProfile('Tom');
		expect(api.listProfiles().length).toBe(2);
		expect(api.deleteProfile(tom.uuid)).toBe(true);
		expect(api.listProfiles().length).toBe(1);
		expect(api.deleteProfile(api.activeProfile().uuid)).toBe(false);
	}); // on garde au moins un profil
});

describe('Sauvegarde (export / import par profil)', () => {
	const BK = (ps: any) => ({ app: 'ludaskia', version: 2, profiles: ps });
	test('exporter un profil', () => {
		const u = api.activeProfile().uuid;
		api.recordRun('sprint', 5, 5, 300000);
		const payload = api.exportProfiles([u])!;
		expect(payload.profiles.length).toBe(1);
		expect(payload.profiles[0].uuid).toBe(u);
		expect(Object.keys(payload.profiles[0].data).some((k) => k.includes('runs_sprint'))).toBe(true);
	});
	test('importer un profil inconnu → ajouté', () => {
		const before = api.listProfiles().length;
		const res = api.importProfiles(
			BK([
				{
					uuid: 'X',
					name: 'Lou',
					emoji: '🦄',
					updatedAt: 1000,
					data: { ludaskia_runs_sprint: JSON.stringify([{ ts: 1, ok: 3, count: 3, ms: 300000 }]) },
				},
			]),
		);
		expect(res!.added).toBe(1);
		expect(api.listProfiles().length).toBe(before + 1);
		api.setActiveProfile('X');
		expect(api.loadRuns('sprint').length).toBe(1);
	});
	test('import : écrase si plus récent, ignore si plus ancien (par UUID)', () => {
		api.importProfiles(
			BK([
				{
					uuid: 'X',
					name: 'Lou',
					emoji: '🦄',
					updatedAt: 1000,
					data: { ludaskia_stars: JSON.stringify({ 'math-tables-addition': 1 }) },
				},
			]),
		);
		let res = api.importProfiles(
			BK([
				{
					uuid: 'X',
					name: 'Vieux',
					updatedAt: 500,
					data: {
						ludaskia_stars: JSON.stringify({
							'math-tables-addition': 1,
							'math-complements': 1,
							'math-doubles': 1,
						}),
					},
				},
			]),
		);
		expect(res!.skipped).toBe(1);
		api.setActiveProfile('X');
		expect(api.starsEarned()).toBe(1); // inchangé (local plus récent)
		res = api.importProfiles(
			BK([
				{
					uuid: 'X',
					name: 'Neuf',
					updatedAt: 2000,
					data: {
						ludaskia_stars: JSON.stringify({
							'math-tables-addition': 1,
							'math-complements': 1,
							'math-doubles': 1,
						}),
					},
				},
			]),
		);
		expect(res!.updated).toBe(1);
		api.setActiveProfile('X');
		expect(api.starsEarned()).toBe(3);
	}); // écrasé
	test('importProfiles rejette un format invalide', () => {
		expect(!api.importProfiles(null)).toBe(true);
		expect(!api.importProfiles({ app: 'autre' })).toBe(true);
		expect(!api.importProfiles({ app: 'ludaskia' })).toBe(true);
	});
});

describe("Reprise d'exercice en cours (#63)", () => {
	// Fabrique un instantané minimal valide.
	function snap(over: Partial<ResumeSnapshot> = {}): ResumeSnapshot {
		return {
			key: 'lecon-x',
			version: RESUME_VERSION,
			savedAt: 1000,
			mode: 'lecon',
			label: 'Leçon X',
			icon: '📖',
			categoryId: null,
			relaunch: { type: 'lecon', lessonId: 'x' },
			sheetsHTML: '<div></div>',
			items: {},
			answers: {},
			activeId: null,
			elapsedMs: 5000,
			total: 10,
			answered: 4,
			...over,
		};
	}

	test("clés stables par identité d'exercice", () => {
		expect(leconKey('math-doubles')).toBe('lecon-math-doubles');
		expect(bilanCategoryKey('express', 'math-calc')).toBe('bilan-express-math-calc');
		expect(bilanCategoryKey('complet', 'math-calc')).toBe('bilan-complet-math-calc');
		expect(bilanCustomKey()).toBe('bilan-custom');
		expect(bilanCustomKey('math-calc')).toBe('bilan-custom-math-calc');
	});

	test('upsert + load : aller-retour', () => {
		upsertResume(snap({ savedAt: 2000 }));
		const list = loadResumes(3000);
		expect(list.length).toBe(1);
		expect(list[0].label).toBe('Leçon X');
		expect(getResume('lecon-x', 3000)!.answered).toBe(4);
		expect(hasResume('lecon-x', 3000)).toBe(true);
		expect(hasResume('absent', 3000)).toBe(false);
	});

	test('une reprise par clé : relancer écrase', () => {
		upsertResume(snap({ savedAt: 1000, answered: 2 }));
		upsertResume(snap({ savedAt: 2000, answered: 7 }));
		const list = loadResumes(3000);
		expect(list.length).toBe(1);
		expect(list[0].answered).toBe(7);
	});

	test('plusieurs clés coexistent, triées par date décroissante', () => {
		upsertResume(snap({ key: 'a', savedAt: 1000 }));
		upsertResume(snap({ key: 'b', savedAt: 3000 }));
		upsertResume(snap({ key: 'c', savedAt: 2000 }));
		expect(loadResumes(4000).map((s) => s.key)).toEqual(['b', 'c', 'a']);
	});

	test('expiration silencieuse au-delà du TTL', () => {
		upsertResume(snap({ key: 'old', savedAt: 1000 }));
		upsertResume(snap({ key: 'new', savedAt: 1000 + RESUME_TTL_MS }));
		// « maintenant » = old + TTL + 1 → old a expiré, new tout juste vivant.
		const now = 1000 + RESUME_TTL_MS + 1;
		const list = loadResumes(now);
		expect(list.map((s) => s.key)).toEqual(['new']);
		// La purge a réécrit le stockage (old retiré pour de bon).
		expect(api.lsGet(RESUME_KEY, []).length).toBe(1);
	});

	test('plafond de stockage respecté (les plus récents gardés)', () => {
		for (let i = 0; i < RESUME_MAX_STORED + 5; i++) {
			upsertResume(snap({ key: 'k' + i, savedAt: 1000 + i }));
		}
		const list = loadResumes(1000 + RESUME_MAX_STORED + 10);
		expect(list.length).toBe(RESUME_MAX_STORED);
		expect(list[0].key).toBe('k' + (RESUME_MAX_STORED + 4)); // le plus récent
	});

	test('removeResume retire une clé, clearResumes vide tout', () => {
		upsertResume(snap({ key: 'a', savedAt: 1000 }));
		upsertResume(snap({ key: 'b', savedAt: 2000 }));
		removeResume('a');
		expect(loadResumes(3000).map((s) => s.key)).toEqual(['b']);
		clearResumes();
		expect(loadResumes(3000).length).toBe(0);
	});

	test("entrées invalides ou d'une autre version ignorées proprement", () => {
		api.lsSet(RESUME_KEY, [
			snap({ key: 'ok', savedAt: 2000 }),
			{ ...snap({ key: 'oldver' }), version: 999 }, // mauvaise version
			{ key: 'broken' }, // structure incomplète
			null,
		]);
		const list = loadResumes(3000);
		expect(list.map((s) => s.key)).toEqual(['ok']);
	});

	test("isolation par profil : une reprise ne fuit pas d'un profil à l'autre", () => {
		upsertResume(snap({ key: 'a', savedAt: 1000 }));
		const autre = api.addProfile('Autre');
		api.setActiveProfile(autre.uuid);
		expect(loadResumes(3000).length).toBe(0);
	});
});

describe('vocabulaire — ordre alphabétique (#108)', () => {
	const ID_NIV1 = 'fr-vocab-alpha-initiale';
	const ID_NIV2 = 'fr-vocab-alpha-deuxieme';

	test('trierAlpha : tri français, gère les accents', () => {
		expect(trierAlpha(['banane', 'arbre', 'école', 'avion'])).toEqual([
			'arbre',
			'avion',
			'banane',
			'école',
		]);
		// é se classe avec e (entre « danse » et « fleur »), pas après z.
		expect(trierAlpha(['fleur', 'école', 'danse'])).toEqual(['danse', 'école', 'fleur']);
	});

	test('génération : suite mélangée valide, ordre = tri calculé (jamais figé)', () => {
		for (const def of VOCAB_LESSONS) {
			for (let i = 0; i < 60; i++) {
				const ex = def.exerciseType.generate({ mode: 'tuiles' });
				expect(ex.type).toBe('tuilesOrdre');
				if (ex.type !== 'tuilesOrdre') continue;
				// 4 à 5 mots, tous distincts.
				expect(ex.ordre.length).toBeGreaterThanOrEqual(4);
				expect(ex.ordre.length).toBeLessThanOrEqual(5);
				expect(new Set(ex.ordre).size).toBe(ex.ordre.length);
				// `ordre` est exactement le tri alphabétique des tuiles (correction calculée).
				expect(ex.ordre).toEqual(trierAlpha(ex.tuiles));
				// `tuiles` est une permutation de `ordre`…
				expect([...ex.tuiles].sort()).toEqual([...ex.ordre].sort());
				// …et n'est PAS déjà rangée (sinon exercice sans intérêt).
				expect(ex.tuiles).not.toEqual(ex.ordre);
			}
		}
	});

	test('niveau 1 : initiales toutes différentes', () => {
		const def = VOCAB_LESSONS.find((l) => l.id === ID_NIV1)!;
		for (let i = 0; i < 60; i++) {
			const ex = def.exerciseType.generate({ mode: 'tuiles' });
			if (ex.type !== 'tuilesOrdre') continue;
			const initiales = ex.ordre.map((m) => m[0]);
			expect(new Set(initiales).size).toBe(initiales.length);
		}
	});

	test('niveau 2 : même initiale, deuxièmes lettres distinctes', () => {
		const def = VOCAB_LESSONS.find((l) => l.id === ID_NIV2)!;
		for (let i = 0; i < 60; i++) {
			const ex = def.exerciseType.generate({ mode: 'tuiles' });
			if (ex.type !== 'tuilesOrdre') continue;
			const initiales = new Set(ex.ordre.map((m) => m[0]));
			expect(initiales.size).toBe(1); // tous la même 1re lettre
			const deuxiemes = ex.ordre.map((m) => m[1]);
			expect(new Set(deuxiemes).size).toBe(deuxiemes.length); // 2e lettre discriminante
		}
	});

	test('check() : accepte la suite écrite (espaces ou virgules), rejette le désordre', () => {
		const def = VOCAB_LESSONS.find((l) => l.id === ID_NIV1)!;
		const ex = def.exerciseType.generate({ mode: 'tuiles' });
		if (ex.type !== 'tuilesOrdre') throw new Error('type inattendu');
		expect(def.exerciseType.check(ex, ex.ordre.join(' '))).toBe(true);
		expect(def.exerciseType.check(ex, ex.ordre.join(', '))).toBe(true);
		expect(def.exerciseType.check(ex, ex.ordre.join('  '))).toBe(true); // espaces multiples
		expect(def.exerciseType.check(ex, [...ex.ordre].reverse().join(' '))).toBe(false);
	});

	test('genLessonItem : repli texte rangé pour fiche/bilan/révision', () => {
		const lesson = getLessonById(ID_NIV1)!;
		expect(isOrderingLesson(lesson)).toBe(true);
		const it = genLessonItem(lesson);
		expect(it.kind).toBe('text');
		expect(it.text).toContain('@'); // emplacement du champ
		// La bonne réponse est la suite rangée ; checkItemAnswer la valide.
		expect(checkItemAnswer(it, String(it.answer))).toBe(true);
		expect(checkItemAnswer(it, 'zzz nimporte quoi')).toBe(false);
	});

	test('isOrderingLesson : vrai pour le rangement, faux pour les autres', () => {
		expect(isOrderingLesson(getLessonById(ID_NIV2)!)).toBe(true);
		expect(isOrderingLesson(getLessonById('math-tables-addition')!)).toBe(false);
		expect(isOrderingLesson(getLessonById('fr-conj-etre-present')!)).toBe(false);
	});
});

describe('orthographe — accords pluriel/féminin (#109)', () => {
	const reg = ACCORD_LESSONS.find((l) => l.id === 'fr-accords-reguliers')!;
	const irr = ACCORD_LESSONS.find((l) => l.id === 'fr-accords-irreguliers')!;

	test('transfosDisponibles : écarte les transformations triviales (source = cible)', () => {
		// « gris » au pluriel reste « gris » → aucune transformation de nombre.
		expect(transfosDisponibles({ mascSing: 'gris', mascPlur: 'gris' })).toEqual([]);
		const t = transfosDisponibles({
			mascSing: 'grand',
			femSing: 'grande',
			mascPlur: 'grands',
			femPlur: 'grandes',
		});
		expect(t.length).toBe(4); // 2 pluriels + 2 féminins
		expect(t.every((x) => x.source !== x.answer)).toBe(true);
	});

	test('saisie : toujours du texte, formes courtes uniquement', () => {
		for (const lesson of [reg, irr]) {
			for (let i = 0; i < 200; i++) {
				const ex = lesson.exerciseType.generate({ mode: 'saisie' });
				expect(ex.type).toBe('text');
				if (ex.type === 'text') expect(ex.answer.length).toBeLessThanOrEqual(9);
			}
		}
	});

	test('QCM : 4 propositions distinctes dont la bonne réponse', () => {
		for (const lesson of [reg, irr]) {
			for (let i = 0; i < 200; i++) {
				const ex = lesson.exerciseType.generate({ mode: 'qcm' });
				expect(ex.type).toBe('qcm');
				if (ex.type === 'qcm') {
					expect(ex.choices.length).toBe(4);
					expect(new Set(ex.choices).size).toBe(4); // pas de doublon
					expect(ex.choices).toContain(ex.answer);
				}
			}
		}
	});

	test('repli QCM : une forme longue n’apparaît qu’en QCM, jamais en saisie', () => {
		let vueLongueEnQcm = false;
		for (let i = 0; i < 300; i++) {
			const s = irr.exerciseType.generate({ mode: 'saisie' });
			if (s.type === 'text') expect(s.answer.length).toBeLessThanOrEqual(9);
			const q = irr.exerciseType.generate({ mode: 'qcm' });
			if (q.type === 'qcm' && q.answer.length > 9) vueLongueEnQcm = true;
		}
		expect(vueLongueEnQcm).toBe(true);
	});

	test('catalogue : leçons d’accords en Orthographe, rubrique « Les accords »', () => {
		const lesson = getLessonById('fr-accords-reguliers')!;
		expect(lesson.category).toBe('fr-orthographe');
		expect(lesson.rubrique).toBe('Les accords');
		const ortho = getLessonsByCategory('fr-orthographe').map((l) => l.id);
		expect(ortho).toContain('fr-accords-reguliers');
		expect(ortho).toContain('fr-accords-irreguliers');
	});

	test('rubriques : la conjugaison est étiquetée par temps', () => {
		const conj = getLessonsByCategory('fr-conjugaison');
		expect(conj.every((l) => !!l.rubrique)).toBe(true);
		expect(new Set(conj.map((l) => l.rubrique))).toEqual(
			new Set(['Présent', 'Futur', 'Imparfait', 'Passé composé']),
		);
	});
});

describe('orthographe — homophones grammaticaux (#110)', () => {
	test('banques : chaque paire bien formée et fournie (≈100, ≥ 30 mini)', () => {
		expect(HOMOPHONE_PAIRS.map((p) => p.id)).toEqual([
			'fr-homophones-a',
			'fr-homophones-et',
			'fr-homophones-on',
			'fr-homophones-son',
			'fr-homophones-ou',
		]);
		for (const p of HOMOPHONE_PAIRS) {
			// Volume : cible 100/paire, minimum 30 (critère d'acceptation).
			const total = p.phrasesA.length + p.phrasesB.length;
			expect(total, p.id).toBeGreaterThanOrEqual(30);
			expect(total, p.id).toBeGreaterThanOrEqual(90); // on vise la centaine
			expect(p.explication.length).toBeGreaterThan(10);
			// Chaque phrase : exactement un trou `@`, jamais en tête (majuscule).
			for (const phrase of [...p.phrasesA, ...p.phrasesB]) {
				expect(phrase.split('@').length - 1, phrase).toBe(1);
				expect(phrase.trim().startsWith('@'), phrase).toBe(false);
			}
			// Pas de doublon de phrase au sein de la paire.
			const all = [...p.phrasesA, ...p.phrasesB];
			expect(new Set(all).size, p.id).toBe(all.length);
		}
	});

	test('génération : QCM à 2 options (les 2 graphies), bonne réponse + explication', () => {
		for (const lesson of HOMOPHONE_LESSONS) {
			for (let i = 0; i < 60; i++) {
				const ex = lesson.exerciseType.generate({ mode: 'qcm' });
				expect(ex.type).toBe('qcm');
				if (ex.type !== 'qcm') continue;
				const paire = HOMOPHONE_PAIRS.find((p) => p.label === lesson.label)!;
				// Exactement les deux graphies de la paire, jamais une forme fautive.
				expect([...ex.choices].sort()).toEqual([...paire.options].sort());
				expect(paire.options).toContain(ex.answer);
				expect(ex.explication).toBe(paire.explication);
				expect(ex.question).toContain('@');
			}
		}
	});

	test('catalogue : 5 leçons d’homophones en Orthographe, rubrique « Les homophones »', () => {
		const ids = HOMOPHONE_LESSONS.map((l) => l.id);
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			expect(lesson.category).toBe('fr-orthographe');
			expect(lesson.rubrique).toBe('Les homophones');
		}
		expect(ids).toHaveLength(5);
	});
});

describe('orthographe — m devant m, b, p (#111)', () => {
	const APRES = (mot: string) => mot[mot.indexOf('@') + 1]; // lettre juste après le trou

	test('banque : items bien formés, trou au bon endroit selon le type', () => {
		expect(MBP_BANK.length).toBeGreaterThan(40);
		for (const it of MBP_BANK) {
			// Exactement un trou, jamais en tête.
			expect(it.mot.split('@').length - 1, it.mot).toBe(1);
			expect(it.mot.startsWith('@'), it.mot).toBe(false);
			expect(['m', 'n']).toContain(it.reponse);
			const apres = APRES(it.mot);
			if (it.type === 'regle') {
				// Devant m, b, p → réponse « m ».
				expect(['m', 'b', 'p'], it.mot).toContain(apres);
				expect(it.reponse).toBe('m');
			} else if (it.type === 'contre') {
				// La lettre suivante n'est PAS m, b, p → réponse « n ».
				expect(['m', 'b', 'p'].includes(apres), it.mot).toBe(false);
				expect(it.reponse).toBe('n');
			} else {
				// Exception : « n » malgré b/m derrière.
				expect(['m', 'b'], it.mot).toContain(apres);
				expect(it.reponse).toBe('n');
			}
		}
	});

	test('banque : pas de doublon, pas de majuscule (noms propres exclus)', () => {
		const complets = MBP_BANK.map(motComplet);
		expect(new Set(complets).size).toBe(complets.length); // aucun doublon
		for (const mot of complets) {
			expect(/\p{Lu}/u.test(mot), mot).toBe(false); // aucune majuscule
			expect(/mment$/.test(mot), mot).toBe(false); // adverbes en -mment écartés
		}
	});

	test('tirage pondéré : déterministe, et exceptions sur-pondérées', () => {
		// r = 0 → 1er item ; r → 1 → dernier item.
		expect(tiragePondere(MBP_BANK, 0)).toBe(MBP_BANK[0]);
		expect(tiragePondere(MBP_BANK, 0.999999)).toBe(MBP_BANK[MBP_BANK.length - 1]);
		// Une exception pèse plus qu'un mot ordinaire.
		const exc = MBP_BANK.find((i) => i.type === 'exception')!;
		const reg = MBP_BANK.find((i) => i.type === 'regle')!;
		expect(poidsDe(exc)).toBeGreaterThan(poidsDe(reg));
		// Part des exceptions dans le tirage : régulièrement présentes, sans dominer.
		const total = MBP_BANK.reduce((s, it) => s + poidsDe(it), 0);
		const poidsExc = MBP_BANK.filter((i) => i.type === 'exception').reduce(
			(s, it) => s + poidsDe(it),
			0,
		);
		const part = poidsExc / total;
		expect(part).toBeGreaterThanOrEqual(0.08);
		expect(part).toBeLessThanOrEqual(0.15);
	});

	test('génération : QCM « m ou n ? » + explication, bonne réponse présente', () => {
		const type = MBP_LESSONS[0].exerciseType;
		for (let i = 0; i < 80; i++) {
			const ex = type.generate({ mode: 'qcm' });
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect([...ex.choices].sort()).toEqual(['m', 'n']);
			expect(['m', 'n']).toContain(ex.answer);
			expect(ex.question).toContain('@');
			expect((ex.explication ?? '').length).toBeGreaterThan(10);
		}
	});

	test('catalogue : leçon m/b/p en Orthographe, rubrique « Les règles »', () => {
		const lesson = getLessonById('fr-mbp')!;
		expect(lesson.category).toBe('fr-orthographe');
		expect(lesson.rubrique).toBe('Les règles');
	});
});

describe('vocabulaire — sens propre / sens figuré (#112)', () => {
	test('banque : groupes bien formés, mot présent dans la phrase, équilibre propre/figuré', () => {
		let nbPropre = 0,
			nbFigure = 0;
		for (const g of GROUPES_SENS) {
			// 3 options distinctes et non vides.
			const opts = [g.propre, g.figure, g.distracteur];
			expect(new Set(opts).size, JSON.stringify(opts)).toBe(3);
			for (const o of opts) expect(o.length).toBeGreaterThan(0);
			expect(g.phrases.length).toBeGreaterThan(0);
			for (const p of g.phrases) {
				expect(['propre', 'figuré']).toContain(p.sens);
				expect(p.phrase.includes(p.mot), p.phrase).toBe(true); // le mot cité figure bien
				if (p.sens === 'propre') nbPropre++;
				else nbFigure++;
			}
		}
		const total = nbPropre + nbFigure;
		expect(total).toBeGreaterThanOrEqual(30); // ≥ 30 (cible 100)
		// Équilibre propre/figuré : chacun entre 40 % et 60 %.
		expect(nbPropre / total).toBeGreaterThanOrEqual(0.4);
		expect(nbPropre / total).toBeLessThanOrEqual(0.6);
	});

	test('génération : QCM 3 options dont la bonne (sens contextuel) + explication', () => {
		const type = SENS_FIGURE_LESSONS[0].exerciseType;
		// Toutes les bonnes réponses possibles (sens propre + sens figuré de chaque groupe).
		const sensValides = new Set(GROUPES_SENS.flatMap((g) => [g.propre, g.figure]));
		for (let i = 0; i < 120; i++) {
			const ex = type.generate({ mode: 'qcm' });
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices.length).toBe(3);
			expect(new Set(ex.choices).size).toBe(3); // pas de doublon
			expect(ex.choices).toContain(ex.answer);
			expect(sensValides.has(ex.answer)).toBe(true); // jamais le distracteur en réponse
			expect(ex.question).toContain('@');
			expect(ex.explication ?? '').toMatch(/sens (propre|figuré)/);
		}
	});

	test('catalogue : leçon « sens propre / figuré » en Vocabulaire', () => {
		const lesson = getLessonById('fr-vocab-sens')!;
		expect(lesson.category).toBe('fr-vocabulaire');
	});
});

describe('vocabulaire — familles, préfixes, suffixes (#113)', () => {
	test('FAMILLES : 3 options distinctes, faux-ami ≠ bonne réponse', () => {
		for (const f of FAMILLES) {
			const opts = [f.famille, f.fauxAmi, f.autre];
			for (const o of opts) expect(o.length).toBeGreaterThan(0);
			expect(new Set(opts).size, f.mot).toBe(3); // bonne réponse, faux-ami, intrus distincts
			expect(f.explication.length).toBeGreaterThan(10);
		}
	});

	test('PRÉFIXES & SUFFIXES : sens + 2 distracteurs distincts, non vides', () => {
		for (const a of [...PREFIXES, ...SUFFIXES]) {
			const opts = [a.sens, ...a.distracteurs];
			expect(opts.length).toBe(3);
			for (const o of opts) expect(o.length).toBeGreaterThan(0);
			expect(new Set(opts).size, a.mot).toBe(3); // pas de distracteur = bonne réponse
		}
	});

	test('banque combinée : ≥ 30 items, trois types couverts de façon équilibrée', () => {
		expect(ITEMS_FAMILLES.length).toBeGreaterThanOrEqual(30);
		const parType = { famille: 0, prefixe: 0, suffixe: 0 };
		for (const it of ITEMS_FAMILLES) parType[it.type]++;
		const total = ITEMS_FAMILLES.length;
		for (const t of ['famille', 'prefixe', 'suffixe'] as const) {
			expect(parType[t], t).toBeGreaterThan(0);
			// Équilibre : chaque type entre 25 % et 42 % de la banque.
			expect(parType[t] / total).toBeGreaterThanOrEqual(0.25);
			expect(parType[t] / total).toBeLessThanOrEqual(0.42);
		}
	});

	test('génération : QCM 3 options dont la bonne réponse + explication', () => {
		const type = FAMILLES_LESSONS[0].exerciseType;
		const reponsesValides = new Set(ITEMS_FAMILLES.map((it) => it.reponse));
		for (let i = 0; i < 150; i++) {
			const ex = type.generate({ mode: 'qcm' });
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices.length).toBe(3);
			expect(new Set(ex.choices).size).toBe(3);
			expect(ex.choices).toContain(ex.answer);
			expect(reponsesValides.has(ex.answer)).toBe(true); // jamais un distracteur en réponse
			expect(ex.question).toContain('@');
			expect((ex.explication ?? '').length).toBeGreaterThan(10);
		}
	});

	test('catalogue : leçon « familles, préfixes, suffixes » en Vocabulaire', () => {
		const lesson = getLessonById('fr-vocab-familles')!;
		expect(lesson.category).toBe('fr-vocabulaire');
	});
});

describe('vocabulaire — champs lexicaux (#114)', () => {
	const ID_MOTS = 'fr-vocab-champs-mots';
	const ID_TRI = 'fr-vocab-champs-tri';

	test('banque : ≥ 30 mots, chaque champ ≥ 4 mots (dont ≥ 3 non ambigus), défs OK', () => {
		expect(TOUS_LES_MOTS.length).toBeGreaterThanOrEqual(30);
		for (const c of CHAMPS) {
			expect(c.mots.length, c.id).toBeGreaterThanOrEqual(4); // QCM 4 options du même champ
			// Intrus (3 membres) & tri (3 par thème) ne tirent que des mots non ambigus.
			expect(c.mots.filter((m) => !m.ambigu).length, c.id).toBeGreaterThanOrEqual(3);
			expect(c.nom.length).toBeGreaterThan(0);
			for (const m of c.mots) {
				expect(m.mot.length, c.id).toBeGreaterThan(0);
				expect(m.def.length, m.mot).toBeGreaterThan(10);
			}
		}
	});

	test('banque : chaque mot est mono-thématique (aucun doublon entre champs)', () => {
		// L'intrus et le tri supposent qu'un mot appartient à UN seul thème.
		expect(new Set(TOUS_LES_MOTS).size).toBe(TOUS_LES_MOTS.length);
	});

	test('mots stockés sans article (tuiles homogènes), un seul mot par tuile', () => {
		for (const m of TOUS_LES_MOTS) {
			expect(m, m).not.toMatch(/^(le |la |les |l’|un |une |des )/i);
		}
	});

	test('flag « ambigu » : les mots transversaux connus sont bien marqués', () => {
		const motsAmbigus = new Set(
			CHAMPS.flatMap((c) => c.mots.filter((m) => m.ambigu).map((m) => m.mot)),
		);
		// Mots relief/végétaux pouvant relever de plusieurs champs (cf. revue pédago).
		for (const m of ['fougère', 'mousse', 'ronce', 'falaise', 'galet', 'torrent']) {
			expect(motsAmbigus.has(m), m).toBe(true);
		}
		// Un mot mono-thématique franc n'est pas marqué.
		expect(motsAmbigus.has('averse')).toBe(false);
		expect(motsAmbigus.has('poignet')).toBe(false);
	});

	test('mots « ambigus » : exclus de l’intrus et du tri, gardés pour définition → mot', () => {
		const ambigus = new Set(
			CHAMPS.flatMap((c) => c.mots.filter((m) => m.ambigu).map((m) => m.mot)),
		);
		expect(ambigus.size).toBeGreaterThan(0); // le mécanisme est réellement utilisé
		const typeMots = CHAMPS_LESSONS.find((l) => l.id === ID_MOTS)!.exerciseType;
		const typeTri = CHAMPS_LESSONS.find((l) => l.id === ID_TRI)!.exerciseType;
		const vusEnDefinition = new Set<string>();
		for (let i = 0; i < 500; i++) {
			const ex = typeMots.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			if (ex.question.includes('n’appartient pas')) {
				// Intrus : aucune option (membres + intrus) n'est un mot ambigu.
				for (const c of ex.choices) expect(ambigus.has(c), c).toBe(false);
			} else {
				// Définition → mot : les mots ambigus restent jouables (cible/distracteur).
				for (const c of ex.choices) if (ambigus.has(c)) vusEnDefinition.add(c);
			}
		}
		for (let i = 0; i < 300; i++) {
			const ex = typeTri.generate({ mode: 'tri' });
			if (ex.type !== 'tuilesTri') continue;
			for (const t of ex.mots) expect(ambigus.has(t.mot), t.mot).toBe(false);
		}
		expect(vusEnDefinition.size).toBeGreaterThan(0); // au moins un mot ambigu vu en définition
	});

	test('« Le mot juste » : QCM 4 options, bonne réponse incluse, énoncé + explication', () => {
		const type = CHAMPS_LESSONS.find((l) => l.id === ID_MOTS)!.exerciseType;
		for (let i = 0; i < 200; i++) {
			const ex = type.generate({ mode: 'qcm' });
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices.length).toBe(4);
			expect(new Set(ex.choices).size).toBe(4); // options distinctes
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choices.every((c) => TOUS_LES_MOTS.includes(c))).toBe(true);
			expect(ex.question).toContain('@'); // emplacement du champ (repli texte)
			expect((ex.explication ?? '').length).toBeGreaterThan(10);
		}
	});

	test('« Le mot juste » : les deux formats (définition, intrus) apparaissent', () => {
		const type = CHAMPS_LESSONS.find((l) => l.id === ID_MOTS)!.exerciseType;
		let definitions = 0;
		let intrus = 0;
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			if (ex.question.includes('n’appartient pas')) intrus++;
			else definitions++;
		}
		expect(definitions).toBeGreaterThan(0);
		expect(intrus).toBeGreaterThan(0);
	});

	test('intrus : la réponse n’est jamais un mot du thème visé', () => {
		const type = CHAMPS_LESSONS.find((l) => l.id === ID_MOTS)!.exerciseType;
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm' || !ex.question.includes('n’appartient pas')) continue;
			// Le champ visé est nommé dans l'énoncé ; l'intrus vient d'un autre champ.
			const champVise = CHAMPS.find((c) => ex.question.includes(`« ${c.nom} »`))!;
			expect(champVise).toBeTruthy();
			expect(champVise.mots.some((m) => m.mot === ex.answer)).toBe(false);
		}
	});

	test('« Ranger par thème » : 2 thèmes distincts, 6 tuiles fournies, cat correcte', () => {
		const type = CHAMPS_LESSONS.find((l) => l.id === ID_TRI)!.exerciseType;
		for (let i = 0; i < 200; i++) {
			const ex = type.generate({ mode: 'tri' });
			expect(ex.type).toBe('tuilesTri');
			if (ex.type !== 'tuilesTri') continue;
			expect(ex.categories.length).toBe(2);
			expect(ex.categories[0]).not.toBe(ex.categories[1]);
			expect(ex.mots.length).toBe(6); // 3 + 3
			expect(new Set(ex.mots.map((m) => m.mot)).size).toBe(6);
			// 3 tuiles par thème, et chaque tuile appartient réellement à son champ.
			const champA = CHAMPS.find((c) => c.nom === ex.categories[0])!;
			const champB = CHAMPS.find((c) => c.nom === ex.categories[1])!;
			for (const t of ex.mots) {
				const source = t.cat === 0 ? champA : champB;
				expect(
					source.mots.some((m) => m.mot === t.mot),
					t.mot,
				).toBe(true);
			}
			expect(ex.mots.filter((m) => m.cat === 0).length).toBe(3);
		}
	});

	test('tri : pas de réponse texte unique (corrigé par le runner)', () => {
		const type = CHAMPS_LESSONS.find((l) => l.id === ID_TRI)!.exerciseType;
		const ex = type.generate({ mode: 'tri' });
		expect(type.check(ex, 'la météo')).toBe(false);
	});

	test('genLessonItem : repli texte (une tuile → son thème) pour fiche/bilan', () => {
		const lesson = getLessonById(ID_TRI)!;
		expect(isTriLesson(lesson)).toBe(true);
		const it = genLessonItem(lesson);
		expect(it.kind).toBe('text');
		expect(it.text).toContain('@');
		expect(checkItemAnswer(it, String(it.answer))).toBe(true);
		expect(checkItemAnswer(it, 'thème inexistant')).toBe(false);
	});

	test('isTriLesson : vrai pour le tri, faux pour les autres', () => {
		expect(isTriLesson(getLessonById(ID_TRI)!)).toBe(true);
		expect(isTriLesson(getLessonById(ID_MOTS)!)).toBe(false);
		expect(isTriLesson(getLessonById('math-tables-addition')!)).toBe(false);
	});

	test('catalogue : les deux leçons sont en Vocabulaire, rubrique « Champs lexicaux »', () => {
		for (const id of [ID_MOTS, ID_TRI]) {
			const lesson = getLessonById(id)!;
			expect(lesson.category).toBe('fr-vocabulaire');
			expect(lesson.rubrique).toBe('Champs lexicaux');
		}
	});
});

describe('grammaire — pronom sujet & accord sujet-verbe (#115)', () => {
	const PRONOMS = ['il', 'elle', 'ils', 'elles', 'nous', 'vous', 'je', 'tu'];
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

	test('mapping : personne valide, pronom cohérent, verbes présents dans la base', () => {
		for (const s of SUJETS) {
			expect(s.personne).toBeGreaterThanOrEqual(0);
			expect(s.personne).toBeLessThanOrEqual(5);
			expect(PRONOMS).toContain(s.pronom);
			expect(s.verbes.length).toBeGreaterThan(0);
			for (const v of s.verbes) expect(getVerb(v), `${s.texte}/${v}`).toBeTruthy();
			// Cohérence personne ↔ pronom (genre/nombre).
			if (s.pronom === 'nous') expect(s.personne).toBe(3);
			if (s.pronom === 'vous') expect(s.personne).toBe(4);
			if (s.pronom === 'ils' || s.pronom === 'elles') expect(s.personne).toBe(5);
			if (s.pronom === 'il' || s.pronom === 'elle') expect(s.personne).toBe(2);
		}
	});

	test('invariant : ≥ 4 formes distinctes au présent → QCM d’accord à 4 choix', () => {
		const verbesUtilises = new Set(SUJETS.flatMap((s) => s.verbes));
		for (const v of verbesUtilises) {
			const present = getVerb(v)!.forms.present;
			expect(new Set(present).size, v).toBeGreaterThanOrEqual(4);
		}
	});

	test('pronom sujet : QCM 4 pronoms distincts dont le bon', () => {
		const type = GRAMMAIRE_SUJET_LESSONS.find((l) => l.id === 'fr-gram-pronom-sujet')!.exerciseType;
		const pronomsAttendus = new Set(SUJETS.map((s) => s.pronom));
		for (let i = 0; i < 100; i++) {
			const ex = type.generate({ mode: 'qcm' });
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices.length).toBe(4);
			expect(new Set(ex.choices).size).toBe(4);
			expect(ex.choices).toContain(ex.answer);
			expect(pronomsAttendus.has(ex.answer)).toBe(true);
			ex.choices.forEach((c) => expect(PRONOMS).toContain(c));
			expect(ex.question).toContain('@');
		}
	});

	test('accord sujet-verbe : forme lue depuis la base, accordée au sujet', () => {
		const type = GRAMMAIRE_SUJET_LESSONS.find(
			(l) => l.id === 'fr-gram-accord-sujet-verbe',
		)!.exerciseType;
		for (let i = 0; i < 150; i++) {
			const ex = type.generate({ mode: 'qcm' });
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices.length).toBe(4);
			expect(new Set(ex.choices).size).toBe(4); // 4 vraies formes distinctes
			expect(ex.choices).toContain(ex.answer);
			// Décortique « Sujet (infinitif) → @ » et recompose la bonne forme depuis la base.
			const m = /^(.+) \((.+)\) →/.exec(ex.question);
			expect(m, ex.question).not.toBeNull();
			const sujet = SUJETS.find((s) => cap(s.texte) === m![1])!;
			const verbe = VERBS.find((v) => v.infinitif === m![2])!;
			expect(sujet).toBeTruthy();
			expect(verbe).toBeTruthy();
			expect(ex.answer).toBe(verbe.forms.present[sujet.personne]); // accord correct
		}
	});

	test('catalogue : 2 leçons de grammaire (pronom, accord) en Grammaire', () => {
		const pronom = getLessonById('fr-gram-pronom-sujet')!;
		const accord = getLessonById('fr-gram-accord-sujet-verbe')!;
		expect(pronom.category).toBe('fr-grammaire');
		expect(accord.category).toBe('fr-grammaire');
	});
});

describe('grammaire — classes de mots, articles, adverbes (#116)', () => {
	test('CLASSES : classe valide, mot non vide', () => {
		for (const c of CLASSES) {
			expect(['nom', 'verbe', 'adjectif']).toContain(c.classe);
			expect(c.mot.length).toBeGreaterThan(0);
		}
	});

	test('ARTICLES : genre/nombre valide ; le/la jamais devant une voyelle (élision)', () => {
		for (const a of ARTICLES) {
			expect(['le', 'la', 'les']).toContain(a.article);
			if (a.article !== 'les') {
				// « le/la » devant voyelle deviendrait « l' » : on l'évite (QCM à 3 options).
				expect(/^[aeiouyàâäéèêëîïôöùûüh]/i.test(a.mot), a.mot).toBe(false);
			}
		}
	});

	test('ADVERBES : l’adverbe et les distracteurs sont des mots de la phrase, distincts', () => {
		for (const a of ADVERBES) {
			expect(a.distracteurs.length).toBe(2);
			expect(a.phrase.includes(a.adverbe), a.phrase).toBe(true);
			for (const d of a.distracteurs) expect(a.phrase.includes(d), `${a.phrase} / ${d}`).toBe(true);
			expect(new Set([a.adverbe, ...a.distracteurs]).size).toBe(3); // pas de doublon
		}
	});

	test('banque combinée : ≥ 30 items, trois sous-types couverts et équilibrés', () => {
		expect(ITEMS_CLASSES.length).toBeGreaterThanOrEqual(30);
		const parType = { classe: 0, article: 0, adverbe: 0 };
		for (const it of ITEMS_CLASSES) parType[it.type]++;
		const total = ITEMS_CLASSES.length;
		for (const t of ['classe', 'article', 'adverbe'] as const) {
			expect(parType[t], t).toBeGreaterThan(0);
			expect(parType[t] / total).toBeGreaterThanOrEqual(0.25);
			expect(parType[t] / total).toBeLessThanOrEqual(0.45);
		}
	});

	test('génération : QCM 3 options dont la bonne réponse + explication', () => {
		const type = CLASSES_LESSONS[0].exerciseType;
		const reponsesValides = new Set(ITEMS_CLASSES.map((it) => it.reponse));
		for (let i = 0; i < 150; i++) {
			const ex = type.generate({ mode: 'qcm' });
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices.length).toBe(3);
			expect(new Set(ex.choices).size).toBe(3);
			expect(ex.choices).toContain(ex.answer);
			expect(reponsesValides.has(ex.answer)).toBe(true);
			expect(ex.question).toContain('@');
			expect((ex.explication ?? '').length).toBeGreaterThan(10);
		}
	});

	test('catalogue : leçon « classes de mots » en Grammaire', () => {
		const lesson = getLessonById('fr-gram-classes')!;
		expect(lesson.category).toBe('fr-grammaire');
	});
});

describe('auto-actualisation (core/version)', () => {
	test('isNewerVersion : différence stricte sur une chaîne non vide', () => {
		expect(isNewerVersion('abc', 'def')).toBe(true);
		expect(isNewerVersion('abc', 'abc')).toBe(false); // identique → pas neuf
		expect(isNewerVersion('abc', '')).toBe(false); // chaîne vide ignorée
		expect(isNewerVersion('abc', null)).toBe(false);
		expect(isNewerVersion('abc', undefined)).toBe(false);
		expect(isNewerVersion('abc', 42)).toBe(false); // type non-chaîne ignoré
	});

	const THR: ReloadThresholds = { minIdleMs: 4000, minVisibleMs: 1500 };
	// État « moment sûr » de référence : tout est réuni pour recharger.
	const sain = (): ReloadState => ({
		updatePending: true,
		calmScreen: true,
		busy: false,
		alreadyReloaded: false,
		idleMs: 5000,
		visibleMs: 2000,
	});

	test('canReloadNow : recharge dans un état sûr', () => {
		expect(canReloadNow(sain(), THR)).toBe(true);
	});

	test('canReloadNow : ne recharge pas sans mise à jour en attente', () => {
		expect(canReloadNow({ ...sain(), updatePending: false }, THR)).toBe(false);
	});

	test('canReloadNow : jamais en plein exercice (écran non calme)', () => {
		expect(canReloadNow({ ...sain(), calmScreen: false }, THR)).toBe(false);
	});

	test('canReloadNow : jamais pendant sprint / révision (busy)', () => {
		expect(canReloadNow({ ...sain(), busy: true }, THR)).toBe(false);
	});

	test('canReloadNow : anti-boucle (déjà rechargé pour cette version)', () => {
		expect(canReloadNow({ ...sain(), alreadyReloaded: true }, THR)).toBe(false);
	});

	test('canReloadNow : attend un court délai d’inactivité', () => {
		expect(canReloadNow({ ...sain(), idleMs: 1000 }, THR)).toBe(false);
		expect(canReloadNow({ ...sain(), idleMs: 4000 }, THR)).toBe(true); // seuil atteint
	});

	test('canReloadNow : attend un instant après le retour sur l’onglet', () => {
		expect(canReloadNow({ ...sain(), visibleMs: 500 }, THR)).toBe(false);
		expect(canReloadNow({ ...sain(), visibleMs: 1500 }, THR)).toBe(true); // seuil atteint
	});
});
