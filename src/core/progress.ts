/* ============================================================
   Progression persistée : records de bilans, série de jours,
   étoiles et statistiques par leçon. (localStorage via lsGet/lsSet)
   ============================================================ */
import { fmt } from './utils';
import { lsGet, lsSet } from './storage';
import { getAllLessons } from './catalog';

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
}
export const lessonAvgPct = (e: any) =>
  e && e.questions ? Math.round((e.correct / e.questions) * 100) : null;

/* ---------- XP global (1 point par bonne réponse, tous modes) ---------- */
export const XP_KEY = 'ludaskia_xp';
export function getXP(): number {
  return lsGet(XP_KEY, 0);
}
export function addXP(n: number) {
  if (n <= 0) return;
  lsSet(XP_KEY, getXP() + n);
}
