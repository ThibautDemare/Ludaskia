/* ============================================================
   Mode Sprint : 5 minutes, un max de bonnes réponses, calculs
   tirés au hasard et générés un par un (pas de preview).
   - bonne réponse → petite animation ✓ puis question suivante
     (le compte à rebours continue)
   - mauvaise réponse → on révèle la bonne réponse et on MET LE
     CHRONO EN PAUSE jusqu'à ce que l'élève clique « Continuer »
   - validation sur Entrée OU bouton « Valider »
   - un sprint ne compte que s'il va au bout des 5 minutes
   ============================================================ */
import { choice, commKey, escapeHTML, fmt } from '../core/utils';
import { bilanQ } from '../core/lessons';
import {
  getAllLessons,
  getLessonsBySubject,
  getLessonsByCategory,
  MATH_LESSON_NUM,
  SUBJECTS,
  CATEGORIES,
} from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import type { Item } from '../core/items';
import { updateStreak, recordLessonStats, recordRun, streakSuffix, addXP } from '../core/progress';
import { updateGoal, evaluateTrophies } from '../core/rewards';
import { getTimer, setTimer, resetChrono } from './chrono';
import { showCelebration } from './effects';
import {
  setCurrentMode,
  setCurrentLessonId,
  hideMenus,
  setToolbar,
  startSprint,
  goHome,
} from './navigation';

const SPRINT_MS = 300000; // 5 minutes

/* ---------- Filtre du sprint ---------- */

type SprintFilter =
  | { type: 'all' }
  | { type: 'subject'; id: string }
  | { type: 'category'; id: string };

let sprintFilter: SprintFilter = { type: 'all' };

function lessonsForFilter(f: SprintFilter): LessonDef[] {
  if (f.type === 'subject') return getLessonsBySubject(f.id);
  if (f.type === 'category') return getLessonsByCategory(f.id);
  return getAllLessons();
}

function filterLabel(f: SprintFilter): string {
  if (f.type === 'all') return '';
  if (f.type === 'subject') return SUBJECTS.find((s) => s.id === f.id)?.label ?? f.id;
  return CATEGORIES.find((c) => c.id === f.id)?.label ?? f.id;
}

function parseFilter(value: string): SprintFilter {
  if (value.startsWith('subject:')) return { type: 'subject', id: value.slice(8) };
  if (value.startsWith('category:')) return { type: 'category', id: value.slice(9) };
  return { type: 'all' };
}

/* Lance un sprint filtré sur une catégorie (depuis l'écran de catégorie),
   sans passer par l'écran de configuration. */
export function startCategorySprint(categoryId: string): void {
  sprintFilter = { type: 'category', id: categoryId };
  location.hash = 'sprint';
}

/* ---------- Écran de configuration du sprint ---------- */

export function renderSprintConfigScreen(el: HTMLElement): void {
  const allLessons = getAllLessons();
  const totalN = allLessons.length;

  const currentValue =
    sprintFilter.type === 'all'
      ? 'all'
      : sprintFilter.type === 'subject'
        ? `subject:${sprintFilter.id}`
        : `category:${sprintFilter.id}`;

  const opt = (value: string, label: string, n: number, indent = false) => {
    const checked = currentValue === value ? 'checked' : '';
    const cls = `sc-option${indent ? ' sc-option-indent' : ''}`;
    return `<label class="${cls}">
      <input type="radio" name="scFilter" class="sc-radio" value="${value}" ${checked}>
      <span>${escapeHTML(label)} <span class="sc-count">${n} leçon${n > 1 ? 's' : ''}</span></span>
    </label>`;
  };

  const subjectOptions = SUBJECTS.flatMap((subj) => {
    const subjLessons = getLessonsBySubject(subj.id);
    if (!subjLessons.length) return [];
    const catOptions = CATEGORIES.filter((c) => c.subject === subj.id).flatMap((cat) => {
      const n = getLessonsByCategory(cat.id).length;
      return n ? [opt(`category:${cat.id}`, cat.label, n, true)] : [];
    });
    return [opt(`subject:${subj.id}`, subj.label, subjLessons.length), ...catOptions];
  }).join('');

  el.innerHTML = `<div class="sprint-config">
    <div class="sc-section-title">Filtre</div>
    <div class="sc-options">
      ${opt('all', 'Toutes les matières', totalN)}
      ${subjectOptions}
    </div>
    <button id="scLaunch" class="sprint-btn">Lancer ▶</button>
  </div>`;

  el.querySelector('#scLaunch')!.addEventListener('click', () => {
    const selected = el.querySelector<HTMLInputElement>('.sc-radio:checked');
    sprintFilter = parseFilter(selected ? selected.value : 'all');
    location.hash = 'sprint';
  });
}

let sprintLessonDefs: LessonDef[] = [];

let sprintActive = false,
  sprintPaused = false;
let sprintRemaining = SPRINT_MS,
  sprintLastTick = 0;
let sprintScore = 0,
  sprintAnswered = 0;
let sprintPerLesson: Record<string, { ok: number; total: number }> = {},
  sprintLastKey = '',
  sprintCurrent: Item | null = null,
  sprintCurrentDef: LessonDef | null = null;

// Stoppe proprement un sprint en cours (appelé en quittant la vue).
export function sprintCleanup() {
  sprintActive = false;
  sprintPaused = false;
}

export function runSprint() {
  setCurrentMode('sprint');
  setCurrentLessonId(null);
  sprintLessonDefs = lessonsForFilter(sprintFilter);
  sprintActive = true;
  sprintPaused = false;
  sprintRemaining = SPRINT_MS;
  sprintScore = 0;
  sprintAnswered = 0;
  sprintPerLesson = {};
  sprintLastKey = '';
  sprintCurrent = null;
  sprintCurrentDef = null;
  hideMenus();
  setToolbar({ verify: false, home: true, profile: false }); // pas de Vérifier (validation auto par question)
  resetChrono(); // le sprint a son propre compte à rebours
  const badge = filterLabel(sprintFilter);
  document.getElementById('sheets')!.innerHTML = `
    <div class="sprint">
      <div class="sprint-hud">
        <span class="sprint-time" id="sprintTime">05:00</span>
        ${badge ? `<span class="sprint-filter-badge">${escapeHTML(badge)}</span>` : ''}
        <span class="sprint-score" id="sprintScore">0 bonne réponse</span>
      </div>
      <div class="sprint-stage" id="sprintStage"></div>
    </div>`;
  sprintRenderTime();
  sprintLastTick = Date.now();
  const t0 = getTimer();
  if (t0) clearInterval(t0);
  setTimer(setInterval(sprintTick, 250));
  sprintNext();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function sprintTick() {
  const now = Date.now();
  if (!sprintPaused) sprintRemaining -= now - sprintLastTick; // gelé pendant une correction
  sprintLastTick = now;
  if (sprintRemaining <= 0) {
    sprintRemaining = 0;
    sprintRenderTime();
    finalizeSprint();
    return;
  }
  sprintRenderTime();
}
function sprintRenderTime() {
  const el = document.getElementById('sprintTime');
  if (el) {
    el.textContent = fmt(Math.max(0, sprintRemaining));
    el.classList.toggle('low', sprintRemaining <= 30000);
  }
}
function sprintUpdateScore() {
  const el = document.getElementById('sprintScore');
  if (el)
    el.textContent = `${sprintScore} bonne${sprintScore > 1 ? 's' : ''} réponse${sprintScore > 1 ? 's' : ''}`;
}

// Génère et affiche la prochaine question (en évitant un doublon immédiat).
function sprintNext() {
  let q: Item,
    def: LessonDef,
    key: string,
    guard = 0;
  do {
    def = choice(sprintLessonDefs);
    const num = MATH_LESSON_NUM[def.id];
    q = bilanQ(num)!;
    q._lesson = def.id;
    key = commKey(q.text);
    guard++;
  } while (key === sprintLastKey && guard < 25);
  sprintLastKey = key;
  sprintCurrent = q;
  sprintCurrentDef = def!;
  const stage = document.getElementById('sprintStage');
  if (!stage) return;
  const deco = def!.id === 'math-decomposer-multiplication' ? ' deco' : '';
  stage.innerHTML = `
    <div class="sprint-theme">${def!.label}</div>
    <div class="sprint-q${deco}">${sprintQuestionBody(q)}</div>
    <div class="sprint-actions"><button class="sprint-btn" id="sprintValidate">Valider</button></div>`;
  const val = document.getElementById('sprintValidate');
  if (val) val.addEventListener('click', sprintSubmit);
  // Entrée valide depuis n'importe quel champ (utile pour la leçon 15 et ses étapes).
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sprintSubmit();
    }
  });
  const first = stage.querySelector('input');
  if (first) first.focus();
}
// Corps de la question : champ unique, sauf leçon 15 où l'on affiche la
// décomposition avec des champs de brouillon (non corrigés) + le champ final.
export function sprintQuestionBody(q: Item) {
  const main =
    '<input id="sprintInput" class="sprint-input" inputmode="numeric" autocomplete="off">';
  if (q._lesson !== 'math-decomposer-multiplication') return escapeHTML(q.text).replace('@', main);
  const m = q.text.match(/(\d+)\s*×\s*(\d+)/)!;
  const a = +m[1],
    b = +m[2];
  const free = '<input class="sprint-free" inputmode="numeric" autocomplete="off">';
  return `${a} × ${b} = (${free} × ${free}) + (${free} × ${free}) = ${free} + ${free} = ${main}`;
}

function sprintSubmit() {
  if (!sprintActive || sprintPaused) return;
  const inp = document.getElementById('sprintInput') as HTMLInputElement | null;
  if (!inp) return;
  const raw = (inp.value || '').trim().replace(',', '.');
  if (raw === '') {
    inp.focus();
    return;
  } // pas de validation à vide
  sprintAnswered++;
  const lessonId = sprintCurrent!._lesson!;
  const b = sprintPerLesson[lessonId] || (sprintPerLesson[lessonId] = { ok: 0, total: 0 });
  b.total++;
  if (
    sprintCurrentDef!.exerciseType.check(
      { type: 'text', question: sprintCurrent!.text, answer: String(sprintCurrent!.answer) },
      raw,
    )
  ) {
    sprintScore++;
    b.ok++;
    addXP(1);
    sprintUpdateScore();
    const stage = document.getElementById('sprintStage');
    if (stage) stage.innerHTML = `<div class="sprint-check">✓</div>`; // petite animation
    setTimeout(() => {
      if (sprintActive && !sprintPaused) sprintNext();
    }, 600);
  } else {
    sprintShowCorrection(sprintCurrent!.answer);
  }
}

// Mauvaise réponse : on révèle la solution et on met le chrono en pause.
function sprintShowCorrection(ans: number) {
  sprintPaused = true;
  const stage = document.getElementById('sprintStage');
  if (!stage) return;
  stage.innerHTML = `
    <div class="sprint-theme">${sprintCurrentDef?.label ?? ''}</div>
    <div class="sprint-q wrong">${escapeHTML(sprintCurrent!.text).replace('@', '<span class="sprint-sol">' + ans + '</span>')}</div>
    <div class="sprint-correction">La bonne réponse était <strong>${ans}</strong>. Prends le temps de la lire.</div>
    <div class="sprint-actions"><button class="sprint-btn" id="sprintContinue">Continuer ▶</button></div>`;
  const c = document.getElementById('sprintContinue');
  if (c) {
    c.addEventListener('click', sprintContinue);
    c.focus();
  }
}
function sprintContinue() {
  if (!sprintActive) return;
  sprintPaused = false; // le compte à rebours repart
  sprintNext();
}

function finalizeSprint() {
  if (!sprintActive) return;
  sprintActive = false;
  sprintPaused = false;
  const t = getTimer();
  if (t) clearInterval(t);
  // Un sprint compte car il est allé au bout du temps : on enregistre tout.
  const streakDays = updateStreak().days;
  recordLessonStats(sprintPerLesson);
  const medalInfo = recordRun('sprint', sprintScore, sprintAnswered, SPRINT_MS);
  const goalRes = updateGoal({ mode: 'sprint', sprint: true, isRecord: medalInfo.isRecord });
  const newTrophies = evaluateTrophies();
  const celeb: { icon: string; text: string }[] = [];
  if (medalInfo.isRecord) celeb.push({ icon: '🎉', text: 'Nouveau record de sprint !' });
  newTrophies.forEach((t) => celeb.push({ icon: t.icon, text: `Nouveau trophée : ${t.title}` }));
  if (goalRes.justDone) celeb.push({ icon: '🎯', text: 'Objectif du jour réussi !' });
  renderSprintResults(medalInfo, streakDays);
  if (celeb.length) showCelebration(celeb);
}

function renderSprintResults(medalInfo: any, streakDays: number) {
  const acc = sprintAnswered ? Math.round((sprintScore / sprintAnswered) * 100) : 0;
  let extra = '';
  if (medalInfo) {
    if (medalInfo.isRecord) extra += `<div class="rb-record">🎉 Nouveau record !</div>`;
    extra += `<div class="rb-rank">C'est ton ${medalInfo.rank}<sup>${medalInfo.rank === 1 ? 'er' : 'e'}</sup> meilleur sprint sur ${medalInfo.total}.${streakSuffix(streakDays)}</div>`;
  }
  const stage = document.getElementById('sprintStage');
  if (stage)
    stage.innerHTML = `
    <div class="sprint-done">
      <div class="sprint-done-big">${sprintScore}</div>
      <div class="sprint-done-lab">bonne${sprintScore > 1 ? 's' : ''} réponse${sprintScore > 1 ? 's' : ''} en 5 min</div>
      <div class="sprint-done-sub">${sprintAnswered} calcul${sprintAnswered > 1 ? 's' : ''} tenté${sprintAnswered > 1 ? 's' : ''} · ${acc}% de réussite</div>
      ${extra}
      <div class="sprint-actions">
        <button class="sprint-btn" id="sprintAgain">↻ Recommencer</button>
        <button class="sprint-btn ghost" id="sprintHome">🏠 Accueil</button>
      </div>
    </div>`;
  const again = document.getElementById('sprintAgain');
  if (again) again.addEventListener('click', startSprint);
  const home = document.getElementById('sprintHome');
  if (home) home.addEventListener('click', goHome);
  sprintRenderTime();
  sprintUpdateScore();
}
