/* ============================================================
   Progression persistée : records de bilans, série de jours,
   étoiles et statistiques par leçon. (localStorage via lsGet/lsSet)
   ============================================================ */
import { fmt } from './utils';
import { lsGet, lsSet } from './storage';
import { getAllLessons } from './catalog';
import { etatNeuf, avancerEtat } from './revision';
import type { EtatRevision } from './orthographe/types';

/* ---------- Records de bilans (classement) ---------- */
export interface Run {
	ts: number;
	ok: number;
	count: number;
	ms: number;
}
export const RUNS_KEY = (m: string) => `ludaskia_runs_${m}`;
const MAX_RUNS = 50; // on ne garde que les 50 derniers essais par mode
export function loadRuns(mode: string): Run[] {
	return lsGet(RUNS_KEY(mode), []);
}
function saveRuns(mode: string, runs: Run[]) {
	lsSet(RUNS_KEY(mode), runs);
}

/* Bornes de période calendaire (pour les objectifs de régularité) */
export function startOfWeek() {
	const d = new Date();
	const day = (d.getDay() + 6) % 7; // lundi = 0
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - day);
	return d.getTime();
}
export function startOfMonth() {
	const d = new Date();
	return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
/* Nombre d'essais d'un mode depuis un instant donné */
export function countSince(mode: string, since: number) {
	return loadRuns(mode).filter((r) => r.ts >= since).length;
}

/* Classement « score puis temps » : plus de bonnes réponses d'abord,
   le chrono départage à égalité (le plus rapide gagne). */
export function cmpRun(a: Run, b: Run) {
	return b.ok !== a.ok ? b.ok - a.ok : a.ms - b.ms;
}
export const runPct = (r: Run) => (r.count ? Math.round((r.ok / r.count) * 100) : 0);
export const fmtRecord = (r: Run) => `${r.ok}/${r.count} · ${fmt(r.ms)}`;

/* Enregistre l'essai courant et calcule médaille / rang / record */
export function recordRun(mode: string, ok: number, count: number, ms: number) {
	const run = { ts: Date.now(), ok, count, ms };
	const runs = loadRuns(mode);
	const previous = [...runs];
	runs.push(run);
	if (runs.length > MAX_RUNS) runs.splice(0, runs.length - MAX_RUNS);
	saveRuns(mode, runs);
	const rank = [...runs].sort(cmpRun).indexOf(run) + 1;
	const isRecord = previous.length > 0 && cmpRun(run, [...previous].sort(cmpRun)[0]) < 0;
	const medal = runs.length >= 3 && rank <= 3 ? rank : 0; // 1=or, 2=argent, 3=bronze
	return { rank, total: runs.length, medal, isRecord };
}

/* ---------- Série de jours consécutifs ---------- */
export const STREAK_KEY = 'ludaskia_streak';
export function todayStr() {
	const d = new Date();
	return (
		d.getFullYear() +
		'-' +
		String(d.getMonth() + 1).padStart(2, '0') +
		'-' +
		String(d.getDate()).padStart(2, '0')
	);
}
export function daysBetween(a: string, b: string) {
	return Math.round(
		(new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000,
	);
}
export function getStreak() {
	return lsGet(STREAK_KEY, { days: 0, last: null, max: 0 });
}
export function updateStreak() {
	const today = todayStr();
	let s = getStreak();
	if (!s.last) {
		s = { days: 1, last: today, max: 1 };
	} else {
		const d = daysBetween(s.last, today);
		if (d === 1) {
			s.days++;
			s.last = today;
		} else if (d !== 0) {
			s.days = 1;
			s.last = today;
		}
	}
	s.max = Math.max(s.max || 0, s.days); // record de série, jamais reperdu
	lsSet(STREAK_KEY, s);
	return s;
}
/* Suffixe « · 🔥 N jours d'affilée » (vide si série < 2) */
export const streakSuffix = (days: number) => (days >= 2 ? ` · 🔥 ${days} jours d'affilée` : '');

/* ---------- Étoiles par leçon (1 dès le premier sans-faute) ---------- */
export const STARS_KEY = 'ludaskia_stars';
function loadStars() {
	return lsGet(STARS_KEY, {});
}
function saveStars(s: Record<string, number>) {
	lsSet(STARS_KEY, s);
}
export function recordLessonResult(lessonId: string, perfect: boolean) {
	const stars = loadStars();
	const had = (stars[lessonId] || 0) > 0;
	if (perfect) stars[lessonId] = (stars[lessonId] || 0) + 1;
	saveStars(stars);
	return { count: stars[lessonId] || 0, newStar: perfect && !had };
}
export function starsEarned() {
	const s = loadStars();
	return getAllLessons().filter((l) => (s[l.id] || 0) > 0).length;
}
export { loadStars };

/* ---------- Stats de réussite par leçon ----------
   Agrégées sur tous les contextes (leçon seule, bilan complet, express).
   Sert à repérer les thèmes à retravailler. */
export const LESSON_STATS_KEY = 'ludaskia_lessonStats';
export function loadLessonStats() {
	return lsGet(LESSON_STATS_KEY, {});
}
export function recordLessonStats(perLesson: Record<string, { ok: number; total: number }>) {
	const s = loadLessonStats();
	for (const num in perLesson) {
		const { ok, total } = perLesson[num];
		if (!total) continue;
		const e = s[num] || { attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 };
		e.attempts++;
		e.correct += ok;
		e.questions += total;
		const pct = Math.round((ok / total) * 100);
		e.bestPct = Math.max(e.bestPct, pct);
		e.lastPct = pct;
		s[num] = e;
	}
	lsSet(LESSON_STATS_KEY, s);
	// Première rencontre d'une leçon → entrée en révision espacée (cf. #45).
	enterLessonsRevision(
		Object.keys(perLesson).filter((id) => perLesson[id].total > 0),
		Date.now(),
	);
}
export const lessonAvgPct = (e: any) =>
	e && e.questions ? Math.round((e.correct / e.questions) * 100) : null;

/* ---------- Révision espacée des leçons (maths / conjugaison) ----------
   État SR par leçon (les mots d'orthographe ont le leur dans MotOrtho.revision).
   La logique d'escalier est dans revision.ts (pure) ; ici, persistance + hooks. */
export const LESSON_REVISION_KEY = 'ludaskia_lessonRevision';
export function loadLessonRevisions(): Record<string, EtatRevision> {
	return lsGet(LESSON_REVISION_KEY, {});
}
function saveLessonRevisions(r: Record<string, EtatRevision>) {
	lsSet(LESSON_REVISION_KEY, r);
}
/* Entrée en rotation à la première rencontre (1er re-test dès J+1), sans
   rendre la leçon due immédiatement. */
export function enterLessonsRevision(lessonIds: string[], now: number) {
	const all = loadLessonRevisions();
	let changed = false;
	for (const id of lessonIds) {
		if (!all[id]) {
			all[id] = etatNeuf(now);
			changed = true;
		}
	}
	if (changed) saveLessonRevisions(all);
}
/* Met à jour l'état SR d'une leçon après une réponse en révision. */
export function avancerLessonRevision(lessonId: string, reussi: boolean, now: number) {
	const all = loadLessonRevisions();
	all[lessonId] = avancerEtat(all[lessonId] ?? etatNeuf(now), reussi, now);
	saveLessonRevisions(all);
}

/* ---------- XP global (1 point par bonne réponse, tous modes) ---------- */
export const XP_KEY = 'ludaskia_xp';
export function getXP(): number {
	return lsGet(XP_KEY, 0);
}
export function addXP(n: number) {
	if (n <= 0) return;
	lsSet(XP_KEY, getXP() + n);
}

/* ---------- Niveaux dérivés de l'XP (1 → NIVEAU_MAX) ----------
   On n'affiche pas l'XP brute mais un niveau. L'XP totale (XP_KEY)
   reste l'unique source de vérité : le niveau en est *dérivé* par une
   fonction pure (aucune migration, testable sans DOM).

   Courbe « de plus en plus dure » : le coût pour passer du niveau L au
   niveau L+1 croît en puissance →
     xpVersSuivant(L) = round(XP_COEFF × L^XP_EXPOSANT)
   Calibrage (validé avec un avis pédagogique CE2, 1 XP = 1 bonne réponse) :
     - palier 1→2 = 12 XP : une leçon isolée (~10 bonnes réponses) fait gagner
       *au plus 1 niveau* en début de jeu (vs ~3 niveaux auparavant) ;
     - niveau 10 ≈ 445 XP (~1-2 semaines), niveau 50 ≈ 10 100 XP (~quelques
       mois), niveau 100 ≈ 37 900 XP (horizon « plusieurs mois », atteignable) ;
     - exposant < 1.5 : la courbe ralentit mais le dernier palier (99→100)
       reste ~717 XP — franchissable en quelques sessions, pas un mur.
   Deux constantes à régler pour recalibrer (coefficient = générosité globale,
   exposant = vitesse à laquelle les paliers se durcissent). */
export const NIVEAU_MAX = 100;
const XP_COEFF = 12;
const XP_EXPOSANT = 0.89;

// Coût en XP pour passer du niveau `niveau` au niveau suivant.
export function xpVersSuivant(niveau: number): number {
	return Math.round(XP_COEFF * Math.pow(niveau, XP_EXPOSANT));
}

// XP cumulée nécessaire pour *atteindre* `niveau` (niveau 1 ⇒ 0 XP).
export function xpPourNiveau(niveau: number): number {
	let total = 0;
	for (let l = 1; l < niveau; l++) total += xpVersSuivant(l);
	return total;
}

// Niveau courant déduit de l'XP totale, plafonné à NIVEAU_MAX.
export function niveauDepuisXP(xp: number): number {
	let niveau = 1;
	while (niveau < NIVEAU_MAX && xp >= xpPourNiveau(niveau + 1)) niveau++;
	return niveau;
}

export interface ProgressionNiveau {
	niveau: number; // niveau courant (1 à NIVEAU_MAX)
	xpDansNiveau: number; // XP déjà acquise dans le niveau courant
	xpRequisPalier: number; // XP nécessaire pour finir le niveau courant (0 au max)
	pct: number; // progression du palier en cours, 0 à 100
	max: boolean; // niveau maximum atteint
}

// Détail de progression pour l'affichage (badge + barre).
export function progressionNiveau(xp: number): ProgressionNiveau {
	const niveau = niveauDepuisXP(xp);
	if (niveau >= NIVEAU_MAX) {
		return { niveau: NIVEAU_MAX, xpDansNiveau: 0, xpRequisPalier: 0, pct: 100, max: true };
	}
	const xpRequisPalier = xpVersSuivant(niveau);
	const xpDansNiveau = xp - xpPourNiveau(niveau);
	const pct = Math.min(100, Math.round((xpDansNiveau / xpRequisPalier) * 100));
	return { niveau, xpDansNiveau, xpRequisPalier, pct, max: false };
}
