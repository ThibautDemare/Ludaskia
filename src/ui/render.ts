/* ============================================================
   Rendu de l'écran d'accueil et du sélecteur de leçons
   ============================================================ */
import { escapeHTML, fmt } from '../core/utils';
import { activeProfile, loadProfilesMeta, PROFILE_EMOJIS } from '../core/profiles';
import { LESSONS } from '../core/lessons';
import { getAllLessons } from '../core/catalog';
import {
  loadRuns,
  cmpRun,
  runPct,
  starsEarned,
  loadStars,
  loadLessonStats,
  lessonAvgPct,
  startOfWeek,
  startOfMonth,
  countSince,
  getXP,
  progressionNiveau,
  loadLessonRevisions,
} from '../core/progress';
import { countDue } from '../core/revision-select';
import { loadOrtho } from '../core/orthographe/store';
import { getGoal, evaluateTrophies, loadTrophies, TROPHIES } from '../core/rewards';
import { sparkline } from './effects';
import { renderFavoris } from './bilan';

/* Niveau de réussite → couleur (rouge < 50, orange < 75, vert sinon) */
export const pctColor = (p: number) => (p < 50 ? '#c62828' : p < 75 ? '#ef6c00' : '#2e7d32');

/* Bouton de profil dans la barre d'outils (libellé = profil actif) + badge de niveau */
export function renderToolbarProfile() {
  const xpEl = document.getElementById('xpBadge');
  if (xpEl) {
    const xp = getXP();
    const pr = progressionNiveau(xp);
    xpEl.title = pr.max
      ? `Niveau maximum atteint ! (${xp} XP)`
      : `${pr.xpDansNiveau} / ${pr.xpRequisPalier} XP vers le niveau ${pr.niveau + 1} (${xp} XP au total)`;
    xpEl.innerHTML =
      `<span class="lvl-num">⭐ Niveau ${pr.niveau}</span>` +
      `<span class="lvl-bar"><span class="lvl-bar-fill" style="width:${pr.pct}%"></span></span>`;
  }
  const el = document.getElementById('toolbarProfile');
  if (!el) return;
  const p = activeProfile();
  if (!p) return;
  el.innerHTML = `${p.emoji} ${escapeHTML(p.name)} <span class="btn-profile-caret">▾</span>`;
}
/* Menu déroulant : liste des profils (clic = bascule) + accès à la gestion */
export function renderProfileMenu() {
  const el = document.getElementById('profileMenu');
  if (!el) return;
  const m = loadProfilesMeta();
  if (!m) return;
  el.innerHTML =
    m.list
      .map(
        (p) =>
          `<button class="pm-item${p.uuid === m.active ? ' active' : ''}" data-uuid="${p.uuid}">${p.emoji} ${escapeHTML(p.name)}${p.uuid === m.active ? ' <span class="pm-check">✓</span>' : ''}</button>`,
      )
      .join('') + `<button class="pm-item pm-manage" id="pmManage">⚙️ Gérer les profils</button>`;
}
/* Profil dont la palette d'avatars est ouverte (null = aucune). Géré ici car
   l'écran de gestion se re-rend entièrement via renderProfiles(). */
let emojiPickerFor: string | null = null;
// Ouvre la palette d'un profil (ou la referme si on reclique le même). Renvoie
// le nouvel état ouvert pour permettre à l'appelant de re-rendre.
export function toggleEmojiPicker(uuid: string) {
  emojiPickerFor = emojiPickerFor === uuid ? null : uuid;
}
export function closeEmojiPicker() {
  emojiPickerFor = null;
}
/* Palette d'avatars : grille des émojis disponibles, le courant marqué. */
function emojiPaletteHTML(current: string) {
  const opts = PROFILE_EMOJIS.map(
    (e) =>
      `<button class="emoji-opt${e === current ? ' current' : ''}" data-act="set-emoji" data-emoji="${e}"${
        e === current ? ' aria-current="true"' : ''
      } title="${e === current ? 'Avatar actuel' : 'Choisir cet avatar'}">${e}</button>`,
  ).join('');
  return `<div class="emoji-palette" role="listbox" aria-label="Choisir un avatar">${opts}</div>`;
}
/* Écran de gestion des profils */
export function renderProfiles() {
  const el = document.getElementById('profileList');
  if (!el) return;
  const m = loadProfilesMeta();
  if (!m) return;
  if (emojiPickerFor && !m.list.some((p) => p.uuid === emojiPickerFor)) emojiPickerFor = null;
  el.innerHTML =
    m.list
      .map(
        (p) => `
    <div class="profile-row${p.uuid === m.active ? ' active' : ''}" data-uuid="${p.uuid}">
      <input type="checkbox" class="profile-check" data-uuid="${p.uuid}" checked title="Inclure dans l'export">
      <button class="profile-pick" data-act="pick" title="Choisir ce profil">
        <span class="profile-emoji">${p.emoji}</span>
        <span class="profile-name">${escapeHTML(p.name)}</span>
        ${p.uuid === m.active ? '<span class="profile-tag">actif</span>' : ''}
      </button>
      <span class="profile-tools">
        <button data-act="emoji" title="Changer l'avatar"${p.uuid === emojiPickerFor ? ' aria-expanded="true"' : ''}>🎨</button>
        <button data-act="rename" title="Renommer">✏️</button>
        <button data-act="reset" title="Réinitialiser la progression">♻️</button>
        <button data-act="delete" title="Supprimer le profil"${m.list.length <= 1 ? ' disabled' : ''}>🗑️</button>
      </span>
      ${p.uuid === emojiPickerFor ? emojiPaletteHTML(p.emoji) : ''}
    </div>`,
      )
      .join('') + `<button class="profile-add" id="profileAdd">＋ Nouveau profil</button>`;
  renderToolbarProfile(); // garde le bouton de la barre synchronisé
}

/* Record de sprint (compté en nombre de bonnes réponses) */
function fillSprintRecord(elId: string) {
  const el = document.getElementById(elId);
  if (!el) return;
  const runs = loadRuns('sprint');
  if (!runs.length) {
    el.innerHTML = `<span class="muted">Aucun sprint — à toi de jouer !</span>`;
    return;
  }
  el.innerHTML = `🏅 Record : <strong>${[...runs].sort(cmpRun)[0].ok} bonnes réponses</strong>`;
}
/* Nombre d'éléments dus en révision espacée (carte d'accueil) */
function fillRevisionRecord(elId: string) {
  const el = document.getElementById(elId);
  if (!el) return;
  const n = countDue(loadOrtho(), loadLessonRevisions(), Date.now());
  el.innerHTML = n
    ? `🔁 <strong>${n}</strong> à réviser`
    : `<span class="muted">Rien à réviser pour l'instant 👍</span>`;
}
export function sprintBoardHTML() {
  const runs = loadRuns('sprint');
  if (!runs.length) return '';
  const medals = ['🥇', '🥈', '🥉'];
  const top = [...runs].sort(cmpRun).slice(0, 3);
  const lis = top
    .map(
      (r, i) =>
        `<li>${medals[i]} <strong>${r.ok}</strong> bonnes <span class="lb-mut">(${r.ok}/${r.count})</span></li>`,
    )
    .join('');
  return `<div class="lb">
    <h3>Sprint 5 min</h3>
    <ol class="podium">${lis}</ol>
    <p class="lb-count">${runs.length} sprint${runs.length > 1 ? 's' : ''}</p>
  </div>`;
}
/* Panneau de classement d'un mode (podium top-3 + progression) */
export function boardHTML(mode: string, label: string) {
  const runs = loadRuns(mode);
  if (!runs.length) return '';
  const medals = ['🥇', '🥈', '🥉'];
  const top = [...runs].sort(cmpRun).slice(0, 3);
  const lis = top
    .map((r, i) => `<li>${medals[i]} <strong>${r.ok}/${r.count}</strong> · ${fmt(r.ms)}</li>`)
    .join('');
  const reste = 3 - runs.length;
  const note =
    reste > 0
      ? `<p class="lb-note">Encore ${reste} essai${reste > 1 ? 's' : ''} pour débloquer les médailles.</p>`
      : '';
  const spark =
    runs.length >= 2
      ? `<div class="spark-wrap"><span class="spark-lab">Progression (score %)</span>${sparkline(runs.map(runPct))}</div>`
      : '';
  return `<div class="lb">
    <h3>${label}</h3>
    <ol class="podium">${lis}</ol>
    ${note}${spark}
    <p class="lb-count">${runs.length} essai${runs.length > 1 ? 's' : ''} enregistré${runs.length > 1 ? 's' : ''}</p>
  </div>`;
}
export function renderHomeStats() {
  // Le badge XP vit désormais dans la barre d'outils (renderToolbarProfile).
  const recL = document.getElementById('recLecon');
  if (recL) {
    const n = starsEarned();
    const total = getAllLessons().length;
    recL.innerHTML = `⭐ <strong>${n}/${total}</strong> leçon${n > 1 ? 's' : ''} réussie${n > 1 ? 's' : ''} sans faute`;
  }
  fillSprintRecord('recSprint');
  fillRevisionRecord('recRevision');
  renderObjectives();
  renderGoal();
  const boards = document.getElementById('boards');
  // Seul le sprint a un classement comparable (ensemble stable). Les bilans
  // express/complet varient d'un essai à l'autre → pas de podium (#35).
  if (boards) boards.innerHTML = sprintBoardHTML();
  evaluateTrophies(); // rattrape d'éventuels trophées acquis (sans célébration ici)
  renderTrophies();
  renderFavoris(document.getElementById('favoris'));
}

/* Objectifs de régularité (cadence saine, périodes calendaires).
   La pratique espacée prime : on encourage à revenir, sans pression quotidienne. */
export const REGULARITY = [
  { mode: 'sprint', icon: '🏃', label: 'Sprints', target: 3, period: 'week' },
  { mode: 'express', icon: '⏱️', label: 'Bilan express', target: 2, period: 'month' },
  { mode: 'complet', icon: '📚', label: 'Bilan complet', target: 1, period: 'month' },
];
const PERIOD_LABEL: Record<string, string> = { week: 'cette semaine', month: 'ce mois-ci' };
export function renderObjectives() {
  const el = document.getElementById('objectives');
  if (!el) return;
  const rows = REGULARITY.map((o) => {
    const since = o.period === 'week' ? startOfWeek() : startOfMonth();
    const n = countSince(o.mode, since);
    const done = n >= o.target;
    return `<div class="obj ${done ? 'done' : ''}">
      <span class="obj-ico">${o.icon}</span>
      <span class="obj-lab">${o.label}</span>
      <span class="obj-prog">${Math.min(n, o.target)}/${o.target} <span class="obj-per">${PERIOD_LABEL[o.period]}</span></span>
      <span class="obj-check">${done ? '✓' : ''}</span>
    </div>`;
  }).join('');
  el.innerHTML = `<h3 class="obj-h">Mes objectifs</h3>${rows}`;
}

/* Défi du jour (qualité : étoile / leçon sans faute / battre un record) */
export function renderGoal() {
  const el = document.getElementById('goal');
  if (!el) return;
  const g = getGoal();
  if (g.done) {
    el.className = 'goal done';
    el.innerHTML = `🎯 Défi du jour réussi ! <span class="goal-lab">${g.label}</span> ✓`;
  } else {
    el.className = 'goal';
    el.innerHTML = `🎯 Défi du jour : <span class="goal-lab">${g.label}</span> <span class="goal-prog">(${g.progress}/${g.target})</span>`;
  }
}

/* Vitrine des trophées */
export function renderTrophies() {
  const el = document.getElementById('trophies');
  if (!el) return;
  const have = new Set(loadTrophies());
  const cells = TROPHIES.map((t) => {
    const on = have.has(t.id);
    return `<div class="trophy ${on ? 'on' : 'off'}">
      <span class="trophy-ico">${on ? t.icon : '🔒'}</span>
      <span class="trophy-title">${t.title}</span>
      <span class="trophy-desc">${t.desc}</span></div>`;
  }).join('');
  el.innerHTML = `<h3 class="trophies-h">Mes trophées <span class="trophies-count">${have.size}/${TROPHIES.length}</span></h3>
    <div class="trophy-grid">${cells}</div>`;
}

/* Carte d'une leçon (étoile + taux de réussite). Réutilisée par le sélecteur
   de leçons et par l'écran d'une catégorie (navigation multi-matières). */
export function lessonCardHTML(
  l: { id: string; num: number | string; title: string },
  stars: Record<string, number>,
  lstats: Record<string, any>,
) {
  const c = stars[l.id] || 0;
  const starBadge =
    c > 0
      ? `<span class="lz-star" title="${c} sans-faute${c > 1 ? 's' : ''}">⭐${c > 1 ? `<small>×${c}</small>` : ''}</span>`
      : `<span class="lz-star empty" title="Pas encore réussie sans faute">☆</span>`;
  const avg = lessonAvgPct(lstats[l.id]);
  let stat;
  if (avg == null) {
    stat = `<span class="lz-stat lz-stat-empty">Pas encore travaillée</span>`;
  } else {
    const col = pctColor(avg);
    const flag = avg < 70 ? `<span class="lz-flag">à revoir</span>` : '';
    stat = `<span class="lz-stat">
      <span class="lz-bar"><span class="lz-bar-fill" style="width:${avg}%;background:${col}"></span></span>
      <span class="lz-pct" style="color:${col}">${avg}%</span>${flag}</span>`;
  }
  return `<button class="lesson-item" data-id="${l.id}">
    <span class="lz-num">${l.num}</span>
    <span class="lz-main"><span class="lz-title">${l.title}</span>${stat}</span>
    ${starBadge}</button>`;
}

/* Liste des 15 leçons avec étoiles + taux de réussite */
export function renderLessons() {
  const stars = loadStars();
  const lstats = loadLessonStats();
  const list = document.getElementById('lessonList');
  if (list) {
    list.innerHTML = LESSONS.map((l) => lessonCardHTML(l, stars, lstats)).join('');
  }
  const sum = document.getElementById('starsSummary');
  if (sum) {
    const n = starsEarned();
    const total = getAllLessons().length;
    const weak = LESSONS.filter((l) => {
      const a = lessonAvgPct(lstats[l.id]);
      return a != null && a < 70;
    }).map((l) => l.num);
    sum.innerHTML =
      `⭐ ${n} / ${total} leçons réussies sans faute` +
      (weak.length ? ` · <span class="weak-hint">à revoir : leçons ${weak.join(', ')}</span>` : '');
  }
}
