/* ============================================================
   Récompenses : objectif du jour + trophées cumulatifs
   (les podiums des classements, eux, donnent des « médailles »)
   ============================================================ */
import { choice } from './utils';
import { lsGet, lsSet } from './storage';
import { LESSONS } from './lessons';
import {
  loadRuns,
  getStreak,
  loadLessonStats,
  lessonAvgPct,
  starsEarned,
  todayStr,
} from './progress';

/* ---------- Défi du jour ----------
   Recentré « qualité / dépassement » : la cadence (sprints/express/complet)
   est gérée par les objectifs de régularité. Chaque défi déclare une condition
   de disponibilité — on ne propose jamais un défi impossible (ex. remédiation
   s'il n'y a aucune leçon à revoir, ou « bats ton record » sans record). */
export const GOAL_KEY = 'ludaskia_goal';
export const GOALS_DONE_KEY = 'ludaskia_goalsDone';
const WEAK_PCT = 70; // en dessous : leçon « à revoir »

// Leçons actuellement « à revoir » (taux de réussite < 70 %).
export function weakLessons() {
  const stats = loadLessonStats();
  return LESSONS.filter((l) => {
    const a = lessonAvgPct(stats[l.num]);
    return a != null && a < WEAK_PCT;
  }).map((l) => l.num);
}
export function challengeContext() {
  return {
    weak: weakLessons(),
    starsLeft: starsEarned() < LESSONS.length,
    hasSprint: loadRuns('sprint').length > 0,
    hasExpress: loadRuns('express').length > 0,
  };
}
// Défis disponibles selon le contexte. build() fabrique le défi concret.
export const CHALLENGES = [
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
    type: 'beatExpress',
    avail: (c) => c.hasExpress,
    build: () => ({ type: 'beatExpress', label: 'Bats ton record au bilan express !' }),
  },
  {
    type: 'remediation',
    avail: (c) => c.weak.length > 0,
    build: (c) => {
      const num = choice(c.weak);
      const l = LESSONS.find((x) => x.num === num);
      return {
        type: 'remediation',
        lesson: num,
        label: `Retravaille « ${l.title} » et réussis-la à 80 %.`,
      };
    },
  },
];

export function getGoalsDone() {
  const v = lsGet(GOALS_DONE_KEY, 0);
  return typeof v === 'number' ? v : 0;
}
export function getGoal() {
  const today = todayStr();
  let goal = lsGet(GOAL_KEY, null);
  if (!goal || goal.date !== today) {
    // nouveau défi tiré une fois par jour, parmi les défis possibles
    const c = challengeContext();
    const pool = CHALLENGES.filter((ch) => ch.avail(c));
    const def = pool[Math.floor(Math.random() * pool.length)].build(c);
    goal = { date: today, target: 1, progress: 0, done: false, ...def };
    lsSet(GOAL_KEY, goal);
  }
  return goal;
}
/* Met à jour le défi selon l'événement de la session. Renvoie {goal, justDone}. */
export function updateGoal(ev) {
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
    case 'beatExpress':
      if (ev.mode === 'express' && ev.isRecord) inc = 1;
      break;
    case 'remediation':
      if (ev.mode === 'lecon' && ev.lessonNum === goal.lesson && ev.lessonPct >= 80) inc = 1;
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

export function tiers(prefix, icon, metric, levels) {
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
export const TROPHIES = [
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
    { n: 10, title: "Chasseur d'étoiles", desc: '10 leçons réussies sans faute.' },
    { n: 15, title: 'Sans faute partout', desc: 'Les 15 leçons étoilées.' },
  ]),
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
    test: (g) => g.bestExpressMs <= 480000,
  },
  {
    id: 'carton',
    icon: '💯',
    title: 'Carton plein',
    desc: 'Un bilan réussi à 100 %.',
    test: (g) => g.perfectBilan,
  },
  {
    id: 'champion',
    icon: '🥇',
    title: 'Champion',
    desc: "Décrocher une médaille d'or.",
    test: (g) => g.gold,
  },
  {
    id: 'allgreen',
    icon: '🌿',
    title: 'Tout au vert',
    desc: 'Toutes les leçons à 70 % ou plus.',
    test: (g) => g.allGreen,
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
];
// Compile le raccourci {metric, n} en fonction test.
TROPHIES.forEach((t) => {
  if (!t.test && t.metric) t.test = (g) => g[t.metric] >= t.n;
});

export function loadTrophies() {
  return lsGet(TROPHIES_KEY, []);
}
/* Instantané des stats servant aux conditions de trophées */
export function gSnapshot() {
  const rc = loadRuns('complet'),
    re = loadRuns('express'),
    all = [...rc, ...re];
  const s = getStreak();
  const stats = loadLessonStats();
  let totalAnswered = 0;
  for (const k in stats) totalAnswered += stats[k].questions || 0;
  return {
    totalRuns: all.length,
    stars: starsEarned(),
    maxStreak: s.max || s.days || 0,
    bestExpressMs: re.length ? Math.min(...re.map((r) => r.ms)) : Infinity,
    perfectBilan: all.some((r) => r.count > 0 && r.ok === r.count),
    gold: rc.length >= 3 || re.length >= 3, // un podium d'or existe dès 3 essais dans un mode
    goalsDone: getGoalsDone(),
    sprints: loadRuns('sprint').length,
    totalAnswered, // total de calculs résolus (tous modes enregistrés)
    allGreen: LESSONS.every((l) => {
      const a = lessonAvgPct(stats[l.num]);
      return a != null && a >= 70;
    }), // aucune leçon à revoir
  };
}
/* Débloque les trophées nouvellement atteints ; renvoie les nouveaux. */
export function evaluateTrophies() {
  const g = gSnapshot();
  const set = new Set(loadTrophies());
  const newly = [];
  TROPHIES.forEach((t) => {
    if (!set.has(t.id) && t.test(g)) {
      set.add(t.id);
      newly.push(t);
    }
  });
  if (newly.length) lsSet(TROPHIES_KEY, [...set]);
  return newly;
}
