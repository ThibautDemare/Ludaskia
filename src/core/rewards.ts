/* ============================================================
   Récompenses : objectif du jour + trophées cumulatifs
   (les podiums des classements, eux, donnent des « médailles »)
   ============================================================ */
import { choice } from './utils';
import { lsGet, lsSet } from './storage';
import { getAllLessons, getLessonsByCategory, SUBJECTS, CATEGORIES } from './catalog';
import { lessonsNiveauActif, niveauLecon } from './niveau-actif';
import { labelLecon } from './levels';
import {
	loadRuns,
	loadRunsAll,
	getStreak,
	loadLessonStats,
	loadLessonStatsAll,
	loadLessonReports,
	loadStars,
	lessonAvgPct,
	starsEarned,
	todayStr,
} from './progress';
import { enReport } from './report-lecon';
import { loadOrtho } from './orthographe/store';
import type { MotOrtho } from './orthographe/types';
import { seancesCompletees } from './seance';

/* ---------- Défi du jour ----------
   Recentré « qualité / dépassement » : la cadence (sprints/express/complet)
   est gérée par les objectifs de régularité. Chaque défi déclare une condition
   de disponibilité — on ne propose jamais un défi impossible (ex. remédiation
   s'il n'y a aucune leçon à revoir, ou « bats ton record » sans record). */
export const GOAL_KEY = 'ludaskia_goal';
export const GOALS_DONE_KEY = 'ludaskia_goalsDone';
const WEAK_PCT = 70; // en dessous : leçon « à revoir »

// Leçons actuellement « à revoir » (taux de réussite < 70 %).
export function weakLessons(): string[] {
	const stats = loadLessonStats();
	const reports = loadLessonReports();
	const now = Date.now();
	// Périmètre = leçons du niveau actif (les stats sont scopées par matière ; itérer
	// sur lessonsNiveauActif() rend l'intention explicite — #225).
	return lessonsNiveauActif()
		.filter((l) => {
			// Leçon MISE DE CÔTÉ par la leçon du jour (#485) : ne pas la remettre le jour
			// même en défi de remédiation, ce serait dire « retente-la » pendant qu'on vient
			// justement de la laisser reposer. Elle continue de revenir en révision espacée.
			if (enReport(reports[l.id], now)) return false;
			const a = lessonAvgPct(stats[l.id]);
			return a != null && a < WEAK_PCT;
		})
		.map((l) => l.id);
}
export function challengeContext() {
	return {
		weak: weakLessons(),
		starsLeft: starsEarned() < lessonsNiveauActif().length,
		// Défi quotidien « bats ton record de sprint » : SCOPÉ au niveau actif (≠ trophée
		// d'effort) — on ne le propose pas s'il n'y a aucun record à battre à ce niveau.
		hasSprint: loadRuns('sprint').length > 0,
	};
}
// Défis disponibles selon le contexte. build() fabrique le défi concret.
interface ChallengeContext {
	weak: string[];
	starsLeft: boolean;
	hasSprint: boolean;
}
interface Challenge {
	type: string;
	avail: (c: ChallengeContext) => boolean;
	build: (c: ChallengeContext) => { type: string; label: string; lesson?: string };
}
export const CHALLENGES: Challenge[] = [
	{
		type: 'star',
		avail: (c) => c.starsLeft,
		build: () => ({ type: 'star', label: 'Gagne 1 nouvelle étoile.' }),
	},
	{
		type: 'perfectLesson',
		avail: () => true,
		build: () => ({ type: 'perfectLesson', label: 'Réussis 1 leçon sans faute.' }),
	},
	{
		type: 'beatSprint',
		avail: (c) => c.hasSprint,
		build: () => ({ type: 'beatSprint', label: 'Bats ton record de sprint !' }),
	},
	{
		type: 'remediation',
		avail: (c) => c.weak.length > 0,
		build: (c) => {
			const id = choice(c.weak);
			const l = getAllLessons().find((x) => x.id === id);
			return {
				type: 'remediation',
				lesson: id,
				// Libellé résolu au niveau joué (#436) : l'objectif nomme la leçon comme sa
				// carte et son runner la nomment à l'enfant.
				label: `Retravaille « ${labelLecon(l!, niveauLecon(l!))} » et réussis-la à 80 %.`,
			};
		},
	},
];

export function getGoalsDone() {
	const v = lsGet(GOALS_DONE_KEY, 0);
	return typeof v === 'number' ? v : 0;
}
/* Défi du jour stocké (#350) : combine l'état commun (date/cible/avancement) et le
   descriptif tiré du défi choisi (type/libellé/leçon). `type` reste un `string` pour
   tolérer les types hérités d'anciennes versions (record/express/sprint/sessions). */
export interface Goal {
	date: string;
	target: number;
	progress: number;
	done: boolean;
	type: string;
	label: string;
	lesson?: string;
}
export function getGoal(): Goal {
	const today = todayStr();
	let goal: Goal | null = lsGet(GOAL_KEY, null);
	if (!goal || goal.date !== today) {
		// nouveau défi tiré une fois par jour, parmi les défis possibles
		const c = challengeContext();
		const pool = CHALLENGES.filter((ch) => ch.avail(c));
		const def = choice(pool).build(c);
		goal = { date: today, target: 1, progress: 0, done: false, ...def };
		lsSet(GOAL_KEY, goal);
	}
	return goal;
}
/* Événement de fin de session consommé par le défi du jour (#350). Tous les champs
   sont optionnels : chaque appelant n'en renseigne que la part utile à son contexte
   (leçon, bilan, sprint), et chaque type de défi ne lit que ceux qui le concernent. */
export interface GoalEvent {
	mode?: string; // 'lecon' | 'express' | 'complet' | 'sprint' …
	newStar?: boolean; // une nouvelle étoile vient d'être décrochée
	perfect?: boolean; // leçon réussie sans faute
	isRecord?: boolean; // nouveau record (sprint/bilan)
	sprint?: boolean; // la session était un sprint
	lessonId?: string | null; // leçon concernée (défi de remédiation)
	lessonPct?: number; // % de réussite sur la leçon (défi de remédiation)
}
/* Met à jour le défi selon l'événement de la session. Renvoie {goal, justDone}. */
export function updateGoal(ev: GoalEvent) {
	const goal = getGoal();
	if (goal.done) return { goal, justDone: false };
	let inc = 0;
	switch (goal.type) {
		case 'star':
			if (ev.newStar) inc = 1;
			break;
		case 'perfectLesson':
			if (ev.mode === 'lecon' && ev.perfect) inc = 1;
			break;
		case 'beatSprint':
			if (ev.mode === 'sprint' && ev.isRecord) inc = 1;
			break;
		case 'remediation':
			if (ev.mode === 'lecon' && ev.lessonId === goal.lesson && (ev.lessonPct ?? 0) >= 80) inc = 1;
			break;
		// types hérités d'anciennes versions (défi déjà stocké pour aujourd'hui)
		case 'record':
			if (ev.isRecord) inc = 1;
			break;
		case 'express':
			if (ev.mode === 'express') inc = 1;
			break;
		case 'sprint':
			if (ev.sprint) inc = 1;
			break;
		case 'sessions':
			inc = 1;
			break;
	}
	if (inc > 0) {
		goal.progress = Math.min(goal.target, goal.progress + inc);
		if (goal.progress >= goal.target) goal.done = true;
		lsSet(GOAL_KEY, goal);
	}
	const justDone = goal.done; // on n'arrive ici que si le défi n'était pas encore atteint
	if (justDone) lsSet(GOALS_DONE_KEY, getGoalsDone() + 1);
	return { goal, justDone };
}

/* ---------- Trophées (succès cumulatifs, persistants une fois gagnés) ----------
   Un trophée peut être défini par un seuil sur une métrique de gSnapshot
   ({metric, n} → test g[metric] >= n) ou par un test explicite (booléens, etc.).
   tiers() fabrique une famille de trophées à paliers réutilisable. */
export const TROPHIES_KEY = 'ludaskia_trophies';

/* Instantané des stats servant aux conditions de trophées (#350) : dérivé du
   RETOUR de gSnapshot() plutôt que redéclaré, pour rester automatiquement à jour
   quand on ajoute une métrique. Un renommage de champ casse alors le typecheck. */
export type GSnapshot = ReturnType<typeof gSnapshot>;
/* Métriques éligibles au raccourci {metric, n} : seules les clés NUMÉRIQUES du
   snapshot (les booléens et les Record<> passent par un `test` explicite). */
type GaugeMetric = {
	[K in keyof GSnapshot]: GSnapshot[K] extends number ? K : never;
}[keyof GSnapshot];

export interface Trophy {
	id: string;
	icon: string;
	title: string;
	desc: string;
	metric?: GaugeMetric;
	n?: number;
	test?: (g: GSnapshot) => boolean;
}
export function tiers(
	prefix: string,
	icon: string,
	metric: GaugeMetric,
	levels: { n: number; title: string; desc: string }[],
): Trophy[] {
	// levels : [{n, title, desc}]
	return levels.map((l) => ({
		id: prefix + l.n,
		icon,
		title: l.title,
		desc: l.desc,
		metric,
		n: l.n,
	}));
}
export const TROPHIES: Trophy[] = [
	{
		id: 'first',
		icon: '🎉',
		title: 'Premier pas',
		desc: 'Terminer un premier bilan.',
		metric: 'totalRuns',
		n: 1,
	},
	...tiers('streak', '🔥', 'maxStreak', [
		{ n: 3, title: 'Sérieux', desc: 'Une série de 3 jours.' },
		{ n: 7, title: 'En feu', desc: 'Une série de 7 jours.' },
	]),
	...tiers('stars', '⭐', 'stars', [
		{ n: 5, title: 'Étoile montante', desc: '5 leçons réussies sans faute.' },
		{ n: 15, title: "Chasseur d'étoiles", desc: '15 leçons réussies sans faute.' },
		{ n: 30, title: 'Pluie d’étoiles', desc: '30 leçons réussies sans faute.' },
	]),
	{
		// Seuil dynamique : « toutes les leçons étoilées », dérivé du catalogue
		// (s'étend automatiquement quand on ajoute des leçons), au lieu d'une
		// constante codée en dur — il y a aujourd'hui bien plus de 15 leçons.
		id: 'starsAll',
		icon: '🌟',
		title: 'Sans faute partout',
		desc: 'Décrocher l’étoile de toutes les leçons.',
		test: (g: GSnapshot) => g.totalLessons > 0 && g.stars >= g.totalLessons,
	},
	{
		id: 'trained10',
		icon: '💪',
		title: 'Entraîné',
		desc: '10 bilans terminés.',
		metric: 'totalRuns',
		n: 10,
	},
	{
		id: 'eclair',
		icon: '⚡',
		title: 'Éclair',
		desc: 'Un bilan express en moins de 8 min.',
		test: (g: GSnapshot) => g.bestExpressMs <= 480000,
	},
	{
		id: 'carton',
		icon: '💯',
		title: 'Carton plein',
		desc: 'Un bilan réussi à 100 %.',
		test: (g: GSnapshot) => g.perfectBilan,
	},
	{
		// Bonus découvrable : reconnaître un seul bilan de longue haleine (≈ 3 leçons
		// × 10 ou 6 × 5), sans en faire une norme ni une famille « toujours plus long ».
		id: 'bilanLong',
		icon: '🌲',
		title: 'Grande exploration',
		desc: 'Terminer un grand bilan de 30 questions d’une traite.',
		test: (g: GSnapshot) => g.bestBilanCount >= 30,
	},
	{
		id: 'champion',
		icon: '🥇',
		title: 'Champion',
		desc: "Décrocher une médaille d'or.",
		test: (g: GSnapshot) => g.gold,
	},
	{
		id: 'allgreen',
		icon: '🌿',
		title: 'Tout au vert',
		desc: 'Toutes les leçons à 70 % ou plus.',
		test: (g: GSnapshot) => g.allGreen,
	},
	...tiers('vol', '🧮', 'totalAnswered', [
		{ n: 100, title: '100 calculs', desc: '100 calculs résolus.' },
		{ n: 500, title: '500 calculs', desc: '500 calculs résolus.' },
		{ n: 1000, title: '1000 calculs', desc: '1000 calculs résolus.' },
		{ n: 5000, title: '5000 calculs', desc: '5000 calculs résolus.' },
	]),
	...tiers('sprint', '🏃', 'sprints', [
		{ n: 1, title: 'Sprinter', desc: 'Terminer un sprint de 5 min.' },
		{ n: 5, title: 'Sprinter aguerri', desc: '5 sprints terminés.' },
		{ n: 15, title: 'Sprinter chevronné', desc: '15 sprints terminés.' },
		{ n: 50, title: 'Marathonien du calcul', desc: '50 sprints terminés.' },
		{ n: 100, title: 'Centurion', desc: '100 sprints terminés.' },
	]),
	...tiers('goal', '🎯', 'goalsDone', [
		{ n: 1, title: 'Premier défi', desc: 'Réussir un objectif du jour.' },
		{ n: 7, title: 'Persévérant', desc: 'Réussir 7 objectifs du jour.' },
		{ n: 30, title: 'Maître des défis', desc: 'Réussir 30 objectifs du jour.' },
	]),
	// Séance du jour (#440) : programmes composés par l'encadrant et menés à terme.
	// Cumulatif (jamais remis à zéro, contrairement à l'état du jour), forfaitaire
	// (une séance courte et une longue comptent 1 pareil), sans XP : le feedback de
	// complétion reste symbolique, chaque mode ayant déjà donné son XP propre.
	...tiers('seance', '📋', 'seancesCompletees', [
		{ n: 1, title: 'Premier programme', desc: 'Terminer un programme du jour en entier.' },
		{ n: 7, title: 'Suivi régulier', desc: 'Terminer 7 programmes du jour.' },
		{ n: 30, title: 'Grand sérieux', desc: 'Terminer 30 programmes du jour.' },
	]),
	// Orthographe
	...tiers('orthoMots', '📖', 'orthoMotsMaitrises', [
		{ n: 10, title: 'Collectionneur de mots', desc: '10 mots maîtrisés en orthographe.' },
		{ n: 50, title: 'Collectionneur aguerri', desc: '50 mots maîtrisés en orthographe.' },
		{ n: 100, title: 'Grand collectionneur', desc: '100 mots maîtrisés en orthographe.' },
		{ n: 200, title: 'Maître des mots', desc: '200 mots maîtrisés en orthographe.' },
	]),
	...tiers('orthoListes', '⭐', 'orthoListesMaitrisees', [
		{ n: 1, title: 'Première liste', desc: 'Maîtriser une liste de mots.' },
		{ n: 5, title: 'Listes maîtrisées', desc: 'Maîtriser 5 listes de mots.' },
		{ n: 10, title: 'Listes maîtrisées (10)', desc: 'Maîtriser 10 listes de mots.' },
		{ n: 20, title: 'Listes maîtrisées (20)', desc: 'Maîtriser 20 listes de mots.' },
	]),
	...tiers('orthoAtelier', '🔍', 'orthoMotsAtelier', [
		{ n: 10, title: 'Chasseur de pièges', desc: "Travailler 10 mots à l'atelier." },
		{ n: 50, title: 'Chasseur de pièges (50)', desc: "Travailler 50 mots à l'atelier." },
		{ n: 100, title: 'Chasseur de pièges (100)', desc: "Travailler 100 mots à l'atelier." },
	]),
];
/* ---------- Trophées par matière et par catégorie ----------
   Générés depuis le catalogue : chaque matière a des paliers de
   bonnes réponses cumulées, chaque catégorie des paliers de leçons
   étoilées. S'étendent automatiquement quand on ajoute des matières. */
const SUBJECT_LEVELS = [50, 200]; // bonnes réponses cumulées dans la matière
const CATEGORY_LEVELS = [3, 8]; // leçons étoilées (sans-faute) dans la catégorie

function subjectTrophies(): Trophy[] {
	return SUBJECTS.flatMap((s) =>
		SUBJECT_LEVELS.map((n) => ({
			id: `subj-${s.id}-${n}`,
			icon: '📗',
			title: `${n} bonnes réponses en ${s.label}`,
			desc: `Cumuler ${n} bonnes réponses en ${s.label}.`,
			test: (g: GSnapshot) => (g.subjectCorrect[s.id] || 0) >= n,
		})),
	);
}
function categoryTrophies(): Trophy[] {
	// On ne génère des trophées que pour les catégories effectivement peuplées :
	// les leurs sont mesurés via gSnapshot, qui agrège categoryStars sur
	// getAllLessons(). Une catégorie sans LessonDef (nouvelles catégories maths
	// encore vides ; orthographe aux « leçons » dynamiques) ne pourrait pas les
	// décrocher — inutile d'afficher des trophées impossibles. Ils apparaîtront
	// d'eux-mêmes dès qu'une leçon rejoint la catégorie.
	return CATEGORIES.filter((c) => getLessonsByCategory(c.id).length > 0).flatMap((c) =>
		CATEGORY_LEVELS.map((n) => ({
			id: `cat-${c.id}-${n}`,
			icon: '🏷️',
			title: `${n} leçons étoilées — ${c.label}`,
			desc: `Décrocher l'étoile de ${n} leçons de ${c.label}.`,
			test: (g: GSnapshot) => (g.categoryStars[c.id] || 0) >= n,
		})),
	);
}
TROPHIES.push(...subjectTrophies(), ...categoryTrophies());

// Compile le raccourci {metric, n} en fonction test.
TROPHIES.forEach((t) => {
	if (!t.test && t.metric) t.test = (g: GSnapshot) => g[t.metric!] >= t.n!;
});

export function loadTrophies() {
	return lsGet(TROPHIES_KEY, []);
}
/* Instantané des stats servant aux conditions de trophées */
export function gSnapshot() {
	// Effort GLOBAL : les trophées de bilans/sprints comptent TOUS niveaux confondus
	// (un trophée acquis ne se reverrouille pas au changement de classe — #233).
	const rc = loadRunsAll('complet'),
		re = loadRunsAll('express'),
		all = [...rc, ...re];
	const s = getStreak();
	// Effort (GLOBAL, tous niveaux confondus) : total de réponses + bonnes réponses
	// cumulées par matière/catégorie (trophées « N calculs », « N bonnes réponses »).
	const statsAll = loadLessonStatsAll();
	let totalAnswered = 0;
	for (const k in statsAll) totalAnswered += statsAll[k].questions || 0;
	const subjectCorrect: Record<string, number> = {};
	const categoryCorrect: Record<string, number> = {};
	for (const l of getAllLessons()) {
		const correct = (statsAll[l.id] && statsAll[l.id].correct) || 0;
		subjectCorrect[l.subject] = (subjectCorrect[l.subject] || 0) + correct;
		categoryCorrect[l.category] = (categoryCorrect[l.category] || 0) + correct;
	}
	// Complétude (SCOPÉE au niveau actif) : leçons étoilées par matière/catégorie,
	// et « tout au vert ». Mesurées sur le périmètre du niveau actif uniquement.
	const stats = loadLessonStats(); // stats scopées (pour « tout au vert »)
	const starsMap = loadStars(); // étoiles scopées
	const lessonsActif = lessonsNiveauActif();
	const subjectStars: Record<string, number> = {};
	const categoryStars: Record<string, number> = {};
	for (const l of lessonsActif) {
		if ((starsMap[l.id] || 0) > 0) {
			subjectStars[l.subject] = (subjectStars[l.subject] || 0) + 1;
			categoryStars[l.category] = (categoryStars[l.category] || 0) + 1;
		}
	}
	// Métriques du mode Orthographe (indépendantes du TTS : motCache + tuiles).
	const ortho = loadOrtho();
	const motsBanque = Object.values(ortho.banque);
	const estMaitriseOrtho = (m: MotOrtho) => m.validation.motCache && m.validation.tuiles;
	const orthoMotsMaitrises = motsBanque.filter(estMaitriseOrtho).length;
	const orthoMotsAtelier = motsBanque.filter((m) => m.atelierFait).length;
	const orthoListesMaitrisees = ortho.listes.filter(
		(l) =>
			l.motIds.length > 0 &&
			l.motIds.every((id) => {
				const m = ortho.banque[id];
				return !!m && estMaitriseOrtho(m);
			}),
	).length;
	return {
		totalRuns: all.length,
		stars: starsEarned(),
		totalLessons: lessonsActif.length, // leçons du niveau actif (seuil « partout », complétude scopée)
		maxStreak: s.max || s.days || 0,
		bestExpressMs: re.length ? Math.min(...re.map((r) => r.ms)) : Infinity,
		bestBilanCount: all.length ? Math.max(...all.map((r) => r.count)) : 0, // plus grand bilan (complet/express) terminé en une session
		perfectBilan: all.some((r) => r.count > 0 && r.ok === r.count),
		gold: rc.length >= 3 || re.length >= 3, // un podium d'or existe dès 3 essais dans un mode
		goalsDone: getGoalsDone(),
		seancesCompletees: seancesCompletees(), // programmes du jour menés à terme (#440)
		sprints: loadRunsAll('sprint').length, // effort global (tous niveaux)
		totalAnswered, // total de calculs résolus (tous modes enregistrés)
		allGreen: lessonsActif.every((l) => {
			const a = lessonAvgPct(stats[l.id]);
			return a != null && a >= 70;
		}), // aucune leçon à revoir (au niveau actif)
		subjectCorrect, // bonnes réponses cumulées par matière
		categoryCorrect, // bonnes réponses cumulées par catégorie
		subjectStars, // leçons étoilées par matière
		categoryStars, // leçons étoilées par catégorie
		orthoMotsMaitrises, // mots d'orthographe maîtrisés (motCache + tuiles)
		orthoMotsAtelier, // mots travaillés à l'atelier
		orthoListesMaitrisees, // listes entièrement maîtrisées
	};
}
/* Débloque les trophées nouvellement atteints ; renvoie les nouveaux. */
export function evaluateTrophies() {
	const g = gSnapshot();
	const set = new Set<string>(loadTrophies());
	const newly: Trophy[] = [];
	TROPHIES.forEach((t) => {
		if (!set.has(t.id) && t.test!(g)) {
			set.add(t.id);
			newly.push(t);
		}
	});
	if (newly.length) lsSet(TROPHIES_KEY, [...set]);
	return newly;
}
