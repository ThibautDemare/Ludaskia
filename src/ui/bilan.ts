/* ============================================================
   Bilan personnalisé : configurateur, favoris, exécution.
   Suit le même pattern que sprint.ts (dépendance circulaire
   volontaire avec navigation.ts — valide en ES modules).
   ============================================================ */
import { getAllLessons, CATEGORIES, SUBJECTS } from '../core/catalog';
import type { BilanConfig } from '../core/catalog';
import { loadBilans, saveBilan, deleteBilan } from '../core/bilans';
import { fichesPagesHTML } from '../core/lessons';
import { bilanBlocksForIds, buildFichesForIds } from '../core/build';
import { setInputCounter, setSessionItems, setRenderLesson, renderItem } from '../core/items';
import { escapeHTML } from '../core/utils';
import { setCurrentMode, setCurrentLessonId, afterStart } from './navigation';

/* ---------- Génération de bilan express personnalisé ---------- */

function bilanCustomExpressHTML(config: BilanConfig): string {
  const blocks = bilanBlocksForIds(config.lessonIds, config.questionsPerLesson as number);
  const cells = blocks
    .map((b) => {
      setRenderLesson(b.id);
      const ops = b.ops.map((o) => `<div class="bop">${renderItem(o)}</div>`).join('');
      setRenderLesson(null);
      return `<div class="bloc"><span class="btheme">${escapeHTML(b.theme)}</span>${ops}</div>`;
    })
    .join('');
  const nbq = config.questionsPerLesson as number;
  return `<div class="page">
    <p class="bilan-title">${escapeHTML(config.label)}</p>
    <p class="bilan-sub">${nbq} question${nbq > 1 ? 's' : ''} par leçon · ${config.lessonIds.length} leçon${config.lessonIds.length > 1 ? 's' : ''}</p>
    <div class="bilan-grid">${cells}</div>
    <p class="foot print-only">Ludaskia</p>
  </div>`;
}

/* ---------- Exécution d'un BilanConfig ---------- */

export function runBilanConfig(config: BilanConfig): void {
  if (!config.lessonIds.length) return;
  setInputCounter(0);
  setSessionItems({});
  let html: string;
  if (config.questionsPerLesson === 'all') {
    html = fichesPagesHTML(buildFichesForIds(config.lessonIds));
  } else {
    html = bilanCustomExpressHTML(config);
  }
  document.getElementById('sheets')!.innerHTML = html;
  setCurrentMode('bilan');
  setCurrentLessonId(null);
  afterStart();
}

/* ---------- Lecture du formulaire ---------- */

function readFormConfig(form: HTMLElement): BilanConfig | null {
  const lessonIds = [...form.querySelectorAll<HTMLInputElement>('.bc-lesson-check:checked')].map(
    (el) => el.value,
  );
  if (!lessonIds.length) return null;
  const nbqEl = form.querySelector<HTMLInputElement>('.bc-nbq-radio:checked');
  const nbqRaw = nbqEl ? nbqEl.value : '3';
  const questionsPerLesson = nbqRaw === 'all' ? ('all' as const) : Number(nbqRaw);
  return { id: '', label: 'Bilan personnalisé', lessonIds, questionsPerLesson };
}

function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}

/* ---------- Écran de configuration ---------- */

export function renderBilanConfigScreen(el: HTMLElement): void {
  const lessons = getAllLessons();

  // Grouper les leçons par sujet > catégorie
  const subjectBlocks = SUBJECTS.map((subj) => {
    const cats = CATEGORIES.filter((c) => c.subject === subj.id);
    const catBlocks = cats
      .map((cat) => {
        const catLessons = lessons.filter((l) => l.subject === subj.id && l.category === cat.id);
        if (!catLessons.length) return '';
        const items = catLessons
          .map(
            (l) =>
              `<label class="bc-item">
                <input type="checkbox" class="bc-lesson-check" value="${l.id}" checked>
                <span>${escapeHTML(l.label)}</span>
              </label>`,
          )
          .join('');
        return `<div class="bc-category">
          <div class="bc-cat-label">${escapeHTML(cat.label)}</div>
          <div class="bc-lessons-grid">${items}</div>
        </div>`;
      })
      .join('');
    return catBlocks
      ? `<div class="bc-subject">
          <div class="bc-section-title">${escapeHTML(subj.label)}</div>
          ${catBlocks}
        </div>`
      : '';
  }).join('');

  el.innerHTML = `
    <div class="bilan-config" id="bilanConfigForm">
      <div class="bc-section-title">Leçons à inclure</div>
      <div class="bc-top-actions">
        <button class="bc-action-btn" id="bcSelectAll">Tout cocher</button>
        <button class="bc-action-btn" id="bcSelectNone">Tout décocher</button>
      </div>
      ${subjectBlocks}

      <div class="bc-section-title">Questions par leçon</div>
      <div class="bc-nbq">
        <label class="bc-nbq-item"><input type="radio" name="bcNbq" class="bc-nbq-radio" value="3" checked> 3 (express)</label>
        <label class="bc-nbq-item"><input type="radio" name="bcNbq" class="bc-nbq-radio" value="5"> 5</label>
        <label class="bc-nbq-item"><input type="radio" name="bcNbq" class="bc-nbq-radio" value="10"> 10</label>
        <label class="bc-nbq-item"><input type="radio" name="bcNbq" class="bc-nbq-radio" value="all"> Toutes (complet)</label>
      </div>

      <div class="bc-section-title">Sauvegarder comme favori <span style="font-weight:400;color:var(--grey)">(optionnel)</span></div>
      <div class="bc-save-row">
        <input id="bcLabel" class="bc-label-input" type="text" placeholder="Ex : Révision semaine 5" maxlength="60">
        <button id="bcSaveRun" class="bc-btn bc-btn-save">Sauvegarder et lancer</button>
      </div>

      <div class="bc-btns">
        <button id="bcRun" class="bc-btn bc-btn-run">Lancer</button>
      </div>
      <div class="bc-err" id="bcErr"></div>
    </div>`;

  const form = el.querySelector<HTMLElement>('#bilanConfigForm')!;
  const errEl = el.querySelector<HTMLElement>('#bcErr')!;

  el.querySelector('#bcSelectAll')!.addEventListener('click', () => {
    form
      .querySelectorAll<HTMLInputElement>('.bc-lesson-check')
      .forEach((cb) => (cb.checked = true));
  });
  el.querySelector('#bcSelectNone')!.addEventListener('click', () => {
    form
      .querySelectorAll<HTMLInputElement>('.bc-lesson-check')
      .forEach((cb) => (cb.checked = false));
  });

  el.querySelector('#bcRun')!.addEventListener('click', () => {
    const config = readFormConfig(form);
    if (!config) {
      errEl.textContent = 'Coche au moins une leçon.';
      return;
    }
    errEl.textContent = '';
    runBilanConfig(config);
  });

  el.querySelector('#bcSaveRun')!.addEventListener('click', () => {
    const label = el.querySelector<HTMLInputElement>('#bcLabel')!.value.trim();
    if (!label) {
      errEl.textContent = 'Entre un nom pour sauvegarder le bilan.';
      return;
    }
    const config = readFormConfig(form);
    if (!config) {
      errEl.textContent = 'Coche au moins une leçon.';
      return;
    }
    errEl.textContent = '';
    config.label = label;
    config.id = genId();
    saveBilan(config);
    runBilanConfig(config);
  });
}

/* ---------- Section favoris (accueil) ---------- */

export function renderFavoris(el: HTMLElement | null): void {
  if (!el) return;
  const bilans = loadBilans();
  if (!bilans.length) {
    el.innerHTML = '';
    return;
  }
  const items = bilans
    .map((b) => {
      const nbq =
        b.questionsPerLesson === 'all'
          ? 'toutes les questions'
          : `${b.questionsPerLesson} question${(b.questionsPerLesson as number) > 1 ? 's' : ''}/leçon`;
      return `<div class="favori-item">
        <div class="favori-info">
          <div class="favori-name">${escapeHTML(b.label)}</div>
          <div class="favori-meta">${b.lessonIds.length} leçon${b.lessonIds.length > 1 ? 's' : ''} · ${nbq}</div>
        </div>
        <div class="favori-btns">
          <button class="favori-btn favori-btn-run" data-run="${b.id}">▶ Lancer</button>
          <button class="favori-btn favori-btn-del" data-del="${b.id}" title="Supprimer ce favori">🗑</button>
        </div>
      </div>`;
    })
    .join('');
  el.innerHTML = `<h3 class="favoris-title">Mes bilans favoris</h3>
    <div class="favori-list">${items}</div>`;

  el.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const config = loadBilans().find((b) => b.id === btn.dataset.run);
      if (config) runBilanConfig(config);
    });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name =
        btn.closest('.favori-item')?.querySelector<HTMLElement>('.favori-name')?.textContent ?? '';
      if (confirm(`Supprimer le bilan « ${name} » ?`)) {
        deleteBilan(btn.dataset.del!);
        renderFavoris(el);
      }
    });
  });
}
