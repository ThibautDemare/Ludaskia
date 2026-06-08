/* ============================================================
   Navigation multi-matières : Matière → Catégorie → Leçons.
   Trois écrans, routés par hash depuis navigation.ts :
     #matieres            → liste des matières
     #matiere-<id>        → catégories d'une matière
     #categorie-<id>      → leçons d'une catégorie + accès bilan/sprint
   ============================================================ */
import {
  SUBJECTS,
  CATEGORIES,
  ORTHO_CATEGORY_ID,
  getLessonsBySubject,
  getLessonsByCategory,
} from '../core/catalog';
import { LESSONS } from '../core/lessons';
import { loadStars, loadLessonStats } from '../core/progress';
import { loadOrtho } from '../core/orthographe/store';
import { listOrthoLecons, type LeconOrthoRef } from '../core/orthographe/lessons';
import { escapeHTML } from '../core/utils';
import { lessonCardHTML } from './render';
import { startCategorySprint } from './sprint';
import { runBilanConfig } from './bilan';
import {
  startLecon,
  goCategories,
  goCategorie,
  startOrthoLecon,
  goOrthoNew,
  goOrthoEdit,
} from './navigation';

/* Icône par matière (fallback générique). */
const SUBJECT_ICON: Record<string, string> = { math: '🔢', francais: '📚' };
const subjectIcon = (id: string) => SUBJECT_ICON[id] ?? '📘';

/* ---------- Écran : liste des matières ---------- */
export function renderSubjects(el: HTMLElement): void {
  el.innerHTML = `<div class="nav-cards">
    ${SUBJECTS.map((s) => {
      const n = getLessonsBySubject(s.id).length;
      return `<button class="nav-card" data-subject="${s.id}">
        <div class="nav-ico">${subjectIcon(s.id)}</div>
        <div class="nav-card-title">${escapeHTML(s.label)}</div>
        <div class="nav-card-sub">${n} leçon${n > 1 ? 's' : ''}</div>
      </button>`;
    }).join('')}
  </div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach((btn) => {
    btn.addEventListener('click', () => goCategories(btn.dataset.subject!));
  });
}

/* ---------- Écran : catégories d'une matière ---------- */
export function renderCategories(el: HTMLElement, subjectId: string, titleEl: HTMLElement): void {
  const subject = SUBJECTS.find((s) => s.id === subjectId);
  if (titleEl && subject) titleEl.textContent = subject.label;
  const cats = CATEGORIES.filter((c) => c.subject === subjectId);
  el.innerHTML = `<div class="nav-cards">
    ${cats
      .map((c) => {
        const n =
          c.id === ORTHO_CATEGORY_ID
            ? listOrthoLecons(loadOrtho()).length
            : getLessonsByCategory(c.id).length;
        return `<button class="nav-card" data-category="${c.id}">
          <div class="nav-card-title">${escapeHTML(c.label)}</div>
          <div class="nav-card-sub">${n} leçon${n > 1 ? 's' : ''}</div>
        </button>`;
      })
      .join('')}
  </div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => goCategorie(btn.dataset.category!));
  });
}

/* ---------- Écran : leçons d'une catégorie + accès bilan/sprint ---------- */
export function renderCategorie(el: HTMLElement, categoryId: string, titleEl: HTMLElement): void {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  if (titleEl && category) titleEl.textContent = category.label;

  if (categoryId === ORTHO_CATEGORY_ID) {
    renderOrthoCategorie(el);
    return;
  }

  const lessonDefs = getLessonsByCategory(categoryId);
  const lessonIds = lessonDefs.map((l) => l.id);
  const stars = loadStars();
  const lstats = loadLessonStats();

  // On réutilise les cartes riches (numéro, titre, étoile, %) à partir des
  // entrées LESSONS correspondantes ; fallback minimal si absente.
  const cards = lessonDefs
    .map((def, i) => {
      const rich = LESSONS.find((l) => l.id === def.id);
      const entry = rich ?? { id: def.id, num: i + 1, title: def.label };
      return lessonCardHTML(entry, stars, lstats);
    })
    .join('');

  el.innerHTML = `
    <div class="cat-actions">
      <button class="cat-action" data-act="express">⏱️ Bilan express<small>3 questions / leçon</small></button>
      <button class="cat-action" data-act="complet">📚 Bilan complet<small>toutes les questions</small></button>
      <button class="cat-action" data-act="sprint">🏃 Sprint 5 min<small>cette catégorie</small></button>
    </div>
    <div class="lesson-list" id="catLessonList">${cards}</div>`;

  // Clic sur une leçon (délégation)
  el.querySelector('#catLessonList')!.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest('.lesson-item') as HTMLElement | null;
    if (btn && btn.dataset.id) startLecon(btn.dataset.id);
  });

  // Bilans et sprint de la catégorie
  el.querySelector('[data-act="express"]')!.addEventListener('click', () => {
    runBilanConfig({
      id: '',
      label: `Bilan express — ${category?.label ?? ''}`,
      lessonIds,
      questionsPerLesson: 3,
    });
  });
  el.querySelector('[data-act="complet"]')!.addEventListener('click', () => {
    runBilanConfig({
      id: '',
      label: `Bilan complet — ${category?.label ?? ''}`,
      lessonIds,
      questionsPerLesson: 'all',
    });
  });
  el.querySelector('[data-act="sprint"]')!.addEventListener('click', () => {
    startCategorySprint(categoryId);
  });
}

/* ---------- Écran : catégorie Orthographe ----------
   Leçons prédéfinies (invariables/irréguliers) + listes du profil, plus une
   carte « + Ajouter une liste ». Pas de bilan/sprint (modes propres au runner). */
function renderOrthoCategorie(el: HTMLElement): void {
  const lecons = listOrthoLecons(loadOrtho());
  const predef = lecons.filter((l) => l.source === 'predefini');
  // Listes du parent triées par date de contrôle décroissante (sans date en dernier).
  const listes = lecons
    .filter((l) => l.source === 'liste')
    .sort(
      (a, b) =>
        (b.dateControle ?? '').localeCompare(a.dateControle ?? '') ||
        (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );

  const sub = (l: LeconOrthoRef) => {
    const mots = `${l.nbMots} mot${l.nbMots > 1 ? 's' : ''}`;
    if (l.source === 'liste' && l.dateControle) {
      const [, m, d] = l.dateControle.split('-');
      return `${mots} · 📅 ${d}/${m}`;
    }
    return mots;
  };
  const baseCard = (l: LeconOrthoRef) => `<button class="nav-card" data-ortho="${l.id}">
      <div class="nav-ico">📘</div>
      <div class="nav-card-title">${escapeHTML(l.label)}</div>
      <div class="nav-card-sub">${sub(l)}</div>
    </button>`;
  const listCard = (l: LeconOrthoRef) => `<div class="nav-card-group">
      <button class="nav-card" data-ortho="${l.id}">
        <div class="nav-ico">📝</div>
        <div class="nav-card-title">${escapeHTML(l.label)}</div>
        <div class="nav-card-sub">${sub(l)}</div>
      </button>
      <button class="nav-card-edit" data-ortho-edit="${l.id}" aria-label="Modifier la liste" title="Modifier">✎</button>
    </div>`;

  el.innerHTML = `<div class="ortho-cols">
    <section class="ortho-col">
      <h3 class="ortho-col-title">📘 Mots de base</h3>
      <div class="nav-cards ortho-cards">${predef.map(baseCard).join('')}</div>
    </section>
    <section class="ortho-col">
      <h3 class="ortho-col-title">📝 Mes listes</h3>
      <div class="nav-cards ortho-cards">
        ${listes.map(listCard).join('')}
        <button class="nav-card nav-card-add" data-ortho-new="1">
          <div class="nav-ico">➕</div>
          <div class="nav-card-title">Ajouter une liste</div>
          <div class="nav-card-sub">les mots de la semaine</div>
        </button>
      </div>
    </section>
  </div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-ortho]').forEach((btn) => {
    btn.addEventListener('click', () => startOrthoLecon(btn.dataset.ortho!));
  });
  el.querySelectorAll<HTMLButtonElement>('[data-ortho-edit]').forEach((btn) => {
    btn.addEventListener('click', () => goOrthoEdit(btn.dataset.orthoEdit!));
  });
  el.querySelector<HTMLButtonElement>('[data-ortho-new]')!.addEventListener('click', () =>
    goOrthoNew(),
  );
}
