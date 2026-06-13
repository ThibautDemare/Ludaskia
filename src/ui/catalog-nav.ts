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
import type { BilanConfig, LessonDef } from '../core/catalog';
import { LESSONS } from '../core/lessons';
import { loadStars, loadLessonStats } from '../core/progress';
import { loadOrtho } from '../core/orthographe/store';
import { listOrthoLecons, type LeconOrthoRef } from '../core/orthographe/lessons';
import { escapeHTML } from '../core/utils';
import { lessonCardHTML } from './render';
import { startCategorySprint } from './sprint';
import { startBilan, categoryBilanCtx, renderFavoris } from './bilan';
import { renderReprises } from './resume';
import { printScope } from './session';
import { buildExpressConfig } from '../core/bilan-express';
import {
	startLecon,
	goCategories,
	goCategorie,
	goCategorieBilan,
	startOrthoLecon,
	goOrthoNew,
	goOrthoEdit,
} from './navigation';

/* Dernier tirage d'express par catégorie (rotation : on évite de
   refaire tomber le même échantillon de leçons d'un express à l'autre). */
const lastExpressByCat: Record<string, string[]> = {};

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
						? listOrthoLecons(loadOrtho()).length + getLessonsByCategory(c.id).length
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

	// Catégorie encore sans leçon (nouvelles catégories maths en attente de
	// contenu, #92) : on évite d'afficher des bilans/sprints qui ne tireraient
	// rien. Un message rassurant tient lieu d'écran.
	if (!lessonDefs.length) {
		el.innerHTML = `<div class="cat-empty">
      <div class="cat-empty-ico" aria-hidden="true">🌱</div>
      <p class="cat-empty-title">Bientôt disponible&nbsp;!</p>
      <p class="cat-empty-sub">Les leçons de cette catégorie arrivent prochainement.</p>
    </div>`;
		return;
	}

	const lessonIds = lessonDefs.map((l) => l.id);
	const stars = loadStars();
	const lstats = loadLessonStats();

	// On réutilise les cartes riches (numéro, titre, étoile, %) à partir des
	// entrées LESSONS correspondantes ; fallback minimal si absente.
	// Chaque leçon : carte riche + un 🖨 pour imprimer sa fiche (sans la lancer).
	const cardRow = (def: LessonDef, i: number) => {
		const rich = LESSONS.find((l) => l.id === def.id);
		const entry = rich ?? { id: def.id, num: i + 1, title: def.label };
		return `<div class="lesson-row">${lessonCardHTML(entry, stars, lstats)}<button class="lz-print" data-print="${def.id}" title="Imprimer la fiche" aria-label="Imprimer la fiche : ${escapeHTML(def.label)}">🖨</button></div>`;
	};

	// Regroupement par rubrique (#109), dans l'ordre d'apparition. Une leçon sans
	// rubrique forme un groupe « sans titre » (rendu à plat, rétro-compatible).
	const groupes: { rubrique: string; defs: LessonDef[] }[] = [];
	lessonDefs.forEach((def) => {
		const r = def.rubrique ?? '';
		let g = groupes.find((x) => x.rubrique === r);
		if (!g) {
			g = { rubrique: r, defs: [] };
			groupes.push(g);
		}
		g.defs.push(def);
	});
	const aRubriques = groupes.some((g) => g.rubrique !== '');
	const listHTML = groupes
		.map((g) => {
			const head =
				g.rubrique && aRubriques ? `<h3 class="cat-rubrique">${escapeHTML(g.rubrique)}</h3>` : '';
			const rows = g.defs.map((def) => cardRow(def, lessonDefs.indexOf(def))).join('');
			return `${head}<div class="lesson-list">${rows}</div>`;
		})
		.join('');

	el.innerHTML = `
    <div id="catReprises" class="reprises reprises-cat"></div>
    <div class="cat-actions">
      <button class="cat-action" data-act="express">⏱️ Bilan express<small>rapide · ~20 questions</small></button>
      <button class="cat-action" data-act="complet">📚 Bilan complet<small>toutes les questions</small></button>
      <button class="cat-action" data-act="sprint">🏃 Sprint 5 min<small>cette catégorie</small></button>
      <button class="cat-action cat-action-secondary" data-act="custom">🎚️ Je choisis mes leçons<small>coche les leçons que tu veux</small></button>
      <button class="cat-action cat-action-secondary" data-act="print">🖨 Imprimer les fiches<small>toute la catégorie</small></button>
    </div>
    <div id="catLessons">${listHTML}</div>
    <div id="catFavoris" class="favoris favoris-cat"></div>`;

	// Délégation : 🖨 d'une leçon (impression, chemin B) ou clic sur la carte (lancer).
	el.querySelector('#catLessons')!.addEventListener('click', (e: Event) => {
		const target = e.target as HTMLElement;
		const printBtn = target.closest('.lz-print') as HTMLElement | null;
		if (printBtn && printBtn.dataset.print) {
			const def = lessonDefs.find((l) => l.id === printBtn.dataset.print);
			printScope({ title: def?.label ?? '', lessonIds: [printBtn.dataset.print], kind: 'fiches' });
			return;
		}
		const btn = target.closest('.lesson-item') as HTMLElement | null;
		if (btn && btn.dataset.id) startLecon(btn.dataset.id);
	});

	// Bilans et sprint de la catégorie
	el.querySelector('[data-act="express"]')!.addEventListener('click', () => {
		// Express borné + échantillonné (cf. #35), avec rotation par catégorie.
		const config = buildExpressConfig(
			`Bilan express — ${category?.label ?? ''}`,
			lessonIds,
			lastExpressByCat[categoryId],
		);
		lastExpressByCat[categoryId] = config.lessonIds;
		startBilan(config, categoryBilanCtx('express', categoryId, config));
	});
	el.querySelector('[data-act="complet"]')!.addEventListener('click', () => {
		const config: BilanConfig = {
			id: '',
			label: `Bilan complet — ${category?.label ?? ''}`,
			lessonIds,
			questionsPerLesson: 'all',
		};
		startBilan(config, categoryBilanCtx('complet', categoryId, config));
	});
	el.querySelector('[data-act="sprint"]')!.addEventListener('click', () => {
		startCategorySprint(categoryId);
	});
	el.querySelector('[data-act="print"]')!.addEventListener('click', () => {
		printScope({ title: `Fiches — ${category?.label ?? ''}`, lessonIds, kind: 'fiches' });
	});
	el.querySelector('[data-act="custom"]')!.addEventListener('click', () => {
		goCategorieBilan(categoryId);
	});

	// Section « À continuer » filtrée sur cette catégorie (#63).
	renderReprises(el.querySelector<HTMLElement>('#catReprises'), categoryId);

	// Bilans favoris rattachés à cette catégorie (#65), en complément de l'accueil.
	renderFavoris(el.querySelector<HTMLElement>('#catFavoris'), categoryId);
}

/* ---------- Écran : catégorie Orthographe ----------
   Leçons prédéfinies (invariables/irréguliers) + listes du profil, plus une
   carte « + Ajouter une liste ». Pas de bilan/sprint (modes propres au runner). */
function renderOrthoCategorie(el: HTMLElement): void {
	const lecons = listOrthoLecons(loadOrtho());
	// Leçons « moteur » de la catégorie Orthographe (accords #109) : exercices de
	// transformation (pluriel/féminin), distincts des dictées de mots. Affichés
	// dans leur propre rubrique, lancés par le parcours standard (saisie/QCM).
	const accords = getLessonsByCategory(ORTHO_CATEGORY_ID);
	const stars = loadStars();
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
	const apercu = (l: LeconOrthoRef) => {
		if (!l.mots.length) return '';
		// Listes du parent : tri alphabétique (saisie dans un ordre quelconque).
		// Leçons de base : on garde l'ordre d'origine (les nombres restent numériques).
		const mots =
			l.source === 'liste' ? [...l.mots].sort((a, b) => a.localeCompare(b, 'fr')) : l.mots;
		return `<div class="ortho-apercu" aria-hidden="true">${mots.map(escapeHTML).join(' · ')}</div>`;
	};
	const baseCard = (l: LeconOrthoRef) => `<button class="nav-card" data-ortho="${l.id}">
      <div class="nav-ico">📘</div>
      <div class="nav-card-title">${escapeHTML(l.label)}</div>
      <div class="nav-card-sub">${sub(l)}</div>
      ${apercu(l)}
    </button>`;
	const listCard = (l: LeconOrthoRef) => `<div class="nav-card-group">
      <button class="nav-card" data-ortho="${l.id}">
        <div class="nav-ico">📝</div>
        <div class="nav-card-title">${escapeHTML(l.label)}</div>
        <div class="nav-card-sub">${sub(l)}</div>
        ${apercu(l)}
      </button>
      <button class="nav-card-edit" data-ortho-edit="${l.id}" aria-label="Modifier la liste" title="Modifier">✎</button>
    </div>`;

	// Carte d'une leçon d'accords (transformation) : annonce clairement le geste
	// (« transformer », pas « écrire un mot dicté ») pour ne pas tromper l'enfant.
	const accordCard = (l: LessonDef) => {
		const etoilee = (stars[l.id] ?? 0) > 0;
		return `<button class="nav-card" data-accord="${l.id}">
      <div class="nav-ico">✍️</div>
      <div class="nav-card-title">${escapeHTML(l.label)}${etoilee ? ' ⭐' : ''}</div>
      <div class="nav-card-sub">je transforme les mots</div>
    </button>`;
	};

	const accordsSection = accords.length
		? `<section class="ortho-rubrique">
        <h3 class="cat-rubrique">Les accords</h3>
        <p class="ortho-rubrique-hint">Transforme les mots : pluriel et féminin.</p>
        <div class="nav-cards ortho-cards">${accords.map(accordCard).join('')}</div>
      </section>`
		: '';

	el.innerHTML = `${accordsSection}
    <section class="ortho-rubrique">
      <h3 class="cat-rubrique">Les dictées de mots</h3>
      <div class="ortho-cols">
        <section class="ortho-col">
          <h4 class="ortho-col-title">📘 Mots de base</h4>
          <div class="nav-cards ortho-cards">${predef.map(baseCard).join('')}</div>
        </section>
        <section class="ortho-col">
          <h4 class="ortho-col-title">📝 Mes listes</h4>
          <div class="nav-cards ortho-cards">
            <button class="nav-card nav-card-add" data-ortho-new="1">
              <div class="nav-ico">➕</div>
              <div class="nav-card-title">Ajouter une liste</div>
              <div class="nav-card-sub">les mots de la semaine</div>
            </button>
            ${listes.map(listCard).join('')}
          </div>
        </section>
      </div>
    </section>`;
	el.querySelectorAll<HTMLButtonElement>('[data-accord]').forEach((btn) => {
		btn.addEventListener('click', () => startLecon(btn.dataset.accord!));
	});
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
