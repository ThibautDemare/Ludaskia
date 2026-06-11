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
	getLessonsBySubject,
	genLessonItem,
	getLessonById,
	lessonsForIds,
	bilanMode,
} from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { checkAnswer } from '../src/core/exercise';
import { genItems } from '../src/core/build';
import { conjugationType, VERBS, CONJ_LESSONS } from '../src/data/francais/conjugaison';
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
import { selectDueGroups, countDue } from '../src/core/revision-select';
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
	test('REGULARITY : 3 sprints/semaine, 2 express/mois, 1 complet/mois', () => {
		const byMode = Object.fromEntries(api.REGULARITY.map((o) => [o.mode, o]));
		expect(byMode.sprint.target).toBe(3);
		expect(byMode.sprint.period).toBe('week');
		expect(byMode.express.target).toBe(2);
		expect(byMode.express.period).toBe('month');
		expect(byMode.complet.target).toBe(1);
		expect(byMode.complet.period).toBe('month');
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
		expect(g.categoryCorrect['math-calcul']).toBe(50);
		api.recordLessonResult('math-tables-addition', true);
		api.recordLessonResult('math-doubles', true);
		const g2 = api.gSnapshot();
		expect(g2.subjectStars.math).toBe(2);
		expect(g2.categoryStars['math-calcul']).toBe(2);
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
		expect(api.gSnapshot().categoryStars['math-calcul']).toBe(3);
		expect(
			api
				.evaluateTrophies()
				.map((t) => t.id)
				.includes('cat-math-calcul-3'),
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
	test('themesDebloques : défaut toujours dispo, autres par palier', () => {
		expect(api.themesDebloques(1)).toEqual(['defaut']);
		expect(api.themesDebloques(20)).toEqual(['defaut', 'foret']);
		expect(api.themesDebloques(70)).toEqual(['defaut', 'foret', 'automne', 'lagon']);
		expect(api.themesDebloques(95)).toContain('fruit-rouge');
		// Le défaut n'a pas de seuil de déblocage « vécu ».
		expect(THEMES_UNLOCK[0].id).toBe('defaut');
		expect(THEMES_UNLOCK[0].niveau).toBe(1);
	});
	test('recompensesNiveau : thème annoncé à 20/40/70/95 (hors défaut)', () => {
		expect(api.recompensesNiveau(20).map((r) => r.type)).toEqual(['theme']);
		expect(api.recompensesNiveau(20)[0].texte).toContain('Forêt');
		expect(api.recompensesNiveau(95).map((r) => r.type)).toContain('theme');
		// 21 n'est pas un palier.
		expect(api.recompensesNiveau(21)).toEqual([]);
	});
	test('getTheme / setTheme : gating par niveau du profil actif, défaut sinon', () => {
		expect(api.getTheme()).toBe('defaut'); // au départ
		// Thème verrouillé (niveau 1 < 20) : refusé, reste au défaut.
		api.setTheme('foret');
		expect(api.getTheme()).toBe('defaut');
		// Assez d'XP pour le niveau 20 → Forêt débloqué et sélectionnable.
		api.addXP(api.xpPourNiveau(20));
		api.setTheme('foret');
		expect(api.getTheme()).toBe('foret');
	});
	test('getTheme : garde-fou si le thème stocké n’est plus débloqué', () => {
		// Thème stocké directement (jadis débloqué) mais niveau insuffisant → défaut.
		api.lsSet('ludaskia_theme', 'foret');
		expect(api.getTheme()).toBe('defaut'); // niveau 1 → Forêt (niv 20) non débloqué
		// Avec l'XP suffisante, le thème stocké redevient valide.
		api.addXP(api.xpPourNiveau(20));
		expect(api.getTheme()).toBe('foret');
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
	test('le catalogue couvre les 15 leçons de maths (décomposer incluse)', () => {
		const mathLessons = getAllLessons().filter((l) => l.subject === 'math');
		expect(mathLessons.some((l) => l.id === 'math-decomposer-multiplication')).toBe(true);
		expect(mathLessons.length).toBe(15);
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
		const fr = getLessonsBySubject('francais');
		expect(fr.length).toBe(CONJ_LESSONS.length);
		expect(fr.length).toBe(52);
		expect(fr.every((l) => l.category === 'fr-conjugaison')).toBe(true);
		expect(fr.some((l) => l.id === 'fr-conj-etre-present')).toBe(true);
		expect(fr.some((l) => l.id === 'fr-conj-aller-futur')).toBe(true);
		expect(fr.some((l) => l.id === 'fr-conj-venir-imparfait')).toBe(true);
		expect(fr.some((l) => l.id === 'fr-conj-prendre-passe_compose')).toBe(true);
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
					const ex = type.generate('qcm');
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
		const ex = type.generate('qcm');
		if (ex.type === 'qcm') {
			expect(type.check(ex, ex.answer)).toBe(true);
			const wrong = ex.choices.find((c) => c !== ex.answer)!;
			expect(type.check(ex, wrong)).toBe(false);
		}
	});
	test('rétrocompatibilité : sans mode (ou « saisie ») → exercice texte', () => {
		const type = conjugationType('etre', 'present');
		expect(type.generate().type).toBe('text');
		expect(type.generate('saisie').type).toBe('text');
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
		expect(cats).toContain('math-calcul');
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
