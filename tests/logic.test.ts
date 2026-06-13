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
	getLessonsByCategory,
	genLessonItem,
	getLessonById,
	lessonsForIds,
	bilanMode,
	commonCategoryId,
	isPosedLesson,
	CATEGORIES,
} from '../src/core/catalog';
import { checkItemAnswer, figureBlock } from '../src/core/items';
import type { PosedSpec } from '../src/core/items';
import { renderHorloge, renderFigure, pointOnCircle } from '../src/core/figures';
import { checkAnswer } from '../src/core/exercise';
import { genItems, buildLessonFiche } from '../src/core/build';
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
	test('les 15 leçons de calcul mental sont rattachées à math-calcul-mental', () => {
		expect(getLessonsByCategory('math-calcul-mental').length).toBe(15);
		expect(getLessonsByCategory('math-calcul').length).toBeGreaterThan(0); // posé (#97)
	});
	test('les catégories encore sans contenu restent vides, sans casser les helpers', () => {
		// Numération (#98/#94), Calcul posé (#97), Grandeurs et mesures (#89/#96) sont
		// peuplées ; « Géométrie » attend encore ses leçons.
		expect(getLessonsByCategory('math-geometrie')).toEqual([]);
	});
	test('aucun trophée de catégorie n’est généré pour une catégorie vide', () => {
		const ids = api.TROPHIES.map((t) => t.id);
		// Catégorie peuplée → ses trophées existent…
		expect(ids).toContain('cat-math-calcul-mental-3');
		// …une catégorie encore vide n’en génère pas (pas de trophée impossible).
		expect(ids).not.toContain('cat-math-geometrie-3');
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
		expect(html).toContain('Complète.'); // consigne maths (pas « Écris la forme »)
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
	test('saisie : item texte avec figure horloge, corrigé sur formes équivalentes', () => {
		const l = lesson();
		for (let i = 0; i < 300; i++) {
			const it = genLessonItem(l);
			expect(it.kind).toBe('text'); // « 10 h 15 » n'est pas numérique
			expect(it.text).toContain('@');
			expect(it.figure).toContain('<svg'); // l'horloge accompagne la question
			expect(it._lesson).toBe('mes-lecture-heure');
			expect(checkItemAnswer(it, String(it.answer))).toBe(true); // forme canonique
			for (const v of it.answers ?? []) expect(checkItemAnswer(it, v)).toBe(true); // variantes
			expect(checkItemAnswer(it, 'pas une heure')).toBe(false);
		}
	});
	test('format canonique « H h MM » : heures 1–12, minutes multiples de 5, jamais 12 h 00', () => {
		const type = lesson().exerciseType;
		for (let i = 0; i < 500; i++) {
			const ex = type.generate('saisie');
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
			const ex = type.generate('qcm');
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
		let testedMin = false,
			testedRound = false;
		for (let i = 0; i < 3000 && !(testedMin && testedRound); i++) {
			const ex = type.generate('saisie');
			if (ex.type !== 'text') continue;
			if (ex.answer === '8 h 05') {
				expect(type.check(ex, '8h5')).toBe(true);
				expect(type.check(ex, '8:05')).toBe(true);
				expect(type.check(ex, '8 h 05')).toBe(true);
				testedMin = true;
			}
			const round = ex.answer.match(/^(\d{1,2}) h 00$/);
			if (round) {
				const h = round[1];
				expect(type.check(ex, h)).toBe(true);
				expect(type.check(ex, `${h}h`)).toBe(true);
				testedRound = true;
			}
		}
		expect(testedMin && testedRound).toBe(true);
	});
	test('buildLessonFiche : fiche imprimable avec horloge SVG et champ de saisie', () => {
		const html = buildLessonFiche('mes-lecture-heure');
		expect(html).toContain("Je lis l'heure"); // titre
		expect(html).toContain('<svg'); // l'horloge s'affiche sur la fiche
		expect(html).toContain('<input'); // champ de réponse
		expect(html).not.toContain('@'); // le `@` est remplacé par le champ
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
				const ex = type.generate('tuiles');
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
			const m = it.text.match(/^(\d+)\s*@\s*(\d+)$/);
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
	test('le calcul mental couvre ses 15 leçons (décomposer incluse)', () => {
		const calculMental = getLessonsByCategory('math-calcul-mental');
		expect(calculMental.some((l) => l.id === 'math-decomposer-multiplication')).toBe(true);
		expect(calculMental.length).toBe(15);
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
