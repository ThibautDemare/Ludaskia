/* ============================================================
   Bilan personnalisé : configurateur, favoris, exécution.
   Suit le même pattern que sprint.ts (dépendance circulaire
   volontaire avec navigation.ts — valide en ES modules).
   ============================================================ */
import { getAllLessons, getLessonsByCategory, CATEGORIES, SUBJECTS } from '../core/catalog';
import type { BilanConfig, LessonDef } from '../core/catalog';
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

/* Liste de cases à cocher (toute la tuile est cliquable) pour un ensemble de leçons. */
function lessonChecks(lessons: LessonDef[]): string {
  return lessons
    .map(
      (l) =>
        `<label class="bc-item">
          <input type="checkbox" class="bc-lesson-check" value="${l.id}" checked>
          <span>${escapeHTML(l.label)}</span>
        </label>`,
    )
    .join('');
}

/* Écran de composition d'un bilan.
   - global (categoryId absent) : leçons groupées par matière > catégorie ;
   - scopé à une catégorie : liste à plat de ses leçons (entrée « Je choisis
     mes leçons » depuis l'écran de catégorie).
   Pensé tablette/mobile (cf. avis UX enfant) : grosses cibles tactiles, une
   action principale « C'est parti », sauvegarde repliée pour le parent. */
export function renderBilanConfigScreen(el: HTMLElement, categoryId?: string): void {
  const category = categoryId ? CATEGORIES.find((c) => c.id === categoryId) : null;
  const scoped = !!category;

  let lessonsMarkup: string;
  if (scoped) {
    lessonsMarkup = `<div class="bc-lessons-grid">${lessonChecks(getLessonsByCategory(category!.id))}</div>`;
  } else {
    const lessons = getAllLessons();
    lessonsMarkup = SUBJECTS.map((subj) => {
      const catBlocks = CATEGORIES.filter((c) => c.subject === subj.id)
        .map((cat) => {
          const catLessons = lessons.filter((l) => l.subject === subj.id && l.category === cat.id);
          if (!catLessons.length) return '';
          return `<div class="bc-category">
            <div class="bc-cat-label">${escapeHTML(cat.label)}</div>
            <div class="bc-lessons-grid">${lessonChecks(catLessons)}</div>
          </div>`;
        })
        .join('');
      return catBlocks
        ? `<div class="bc-subject"><div class="bc-section-title">${escapeHTML(subj.label)}</div>${catBlocks}</div>`
        : '';
    }).join('');
  }

  // Défaut : « Moyen » sur un écran scopé (révision pour de vrai), « Rapide » sinon.
  const defaultNbq = scoped ? '5' : '3';
  const nbqItem = (value: string, icon: string, intent: string, num: string) =>
    `<label class="bc-nbq-item">
      <input type="radio" name="bcNbq" class="bc-nbq-radio" value="${value}"${value === defaultNbq ? ' checked' : ''}>
      <span>${icon} ${intent}${num ? ` <span class="bc-nbq-num">${num}</span>` : ''}</span>
    </label>`;

  const today = new Date();
  const defaultName = scoped
    ? `${category!.label} ${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`
    : '';
  const runLabel = scoped ? `Bilan — ${category!.label}` : 'Bilan personnalisé';

  el.innerHTML = `
    <div class="bilan-config" id="bilanConfigForm">
      ${scoped ? `<p class="bc-scope">Catégorie : <strong>${escapeHTML(category!.label)}</strong></p>` : ''}
      <div class="bc-section-title">Leçons à inclure</div>
      <div class="bc-top-actions">
        <button class="bc-action-btn" id="bcSelectAll">✓ Tout choisir</button>
        <button class="bc-action-btn" id="bcSelectNone">✗ Tout enlever</button>
      </div>
      ${lessonsMarkup}

      <div class="bc-section-title">Questions par leçon</div>
      <div class="bc-nbq">
        ${nbqItem('3', '🐢', 'Rapide', '3')}
        ${nbqItem('5', '🚶', 'Moyen', '5')}
        ${nbqItem('10', '🏃', 'Costaud', '10')}
        ${nbqItem('all', '🎯', 'Tout', '')}
      </div>

      <div class="bc-run-row">
        <button id="bcRun" class="bc-btn bc-btn-run">▶ C'est parti !</button>
        <span class="bc-count" id="bcCount"></span>
      </div>

      <details class="bc-save">
        <summary>💾 Garder ce bilan pour plus tard</summary>
        <div class="bc-save-row">
          <input id="bcLabel" class="bc-label-input" type="text" placeholder="Nom du bilan" maxlength="60" value="${escapeHTML(defaultName)}">
          <button id="bcSaveRun" class="bc-btn bc-btn-save">Enregistrer et lancer</button>
        </div>
      </details>
      <div class="bc-err" id="bcErr"></div>
    </div>`;

  const form = el.querySelector<HTMLElement>('#bilanConfigForm')!;
  const errEl = el.querySelector<HTMLElement>('#bcErr')!;
  const countEl = el.querySelector<HTMLElement>('#bcCount')!;

  const updateCount = () => {
    const n = form.querySelectorAll<HTMLInputElement>('.bc-lesson-check:checked').length;
    countEl.textContent = n
      ? `${n} leçon${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''}`
      : 'Aucune leçon choisie';
  };
  updateCount();
  form.addEventListener('change', updateCount);

  const setAll = (checked: boolean) => {
    form
      .querySelectorAll<HTMLInputElement>('.bc-lesson-check')
      .forEach((cb) => (cb.checked = checked));
    updateCount();
  };
  el.querySelector('#bcSelectAll')!.addEventListener('click', () => setAll(true));
  el.querySelector('#bcSelectNone')!.addEventListener('click', () => setAll(false));

  el.querySelector('#bcRun')!.addEventListener('click', () => {
    const config = readFormConfig(form);
    if (!config) {
      errEl.textContent = 'Coche au moins une leçon.';
      return;
    }
    errEl.textContent = '';
    config.label = runLabel;
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
