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
} from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { conjugationType, VERBS, CONJ_LESSONS } from '../src/data/francais/conjugaison';
import {
  loadProfilesMeta,
  listProfiles,
  activeProfile,
  setActiveProfile,
  addProfile,
  renameProfile,
  resetProfile,
  deleteProfile,
  exportProfiles,
  importProfiles,
  touchActiveProfile,
  initProfiles,
} from '../src/core/profiles';

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
  exportProfiles,
  importProfiles,
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
