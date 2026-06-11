/* ============================================================
   Bilan personnalisé : configurateur, favoris, exécution.
   Suit le même pattern que sprint.ts (dépendance circulaire
   volontaire avec navigation.ts — valide en ES modules).
   ============================================================ */
import {
	getAllLessons,
	getLessonsByCategory,
	bilanMode,
	CATEGORIES,
	SUBJECTS,
} from '../core/catalog';
import type { BilanConfig, LessonDef } from '../core/catalog';
import { loadBilans, saveBilan, deleteBilan } from '../core/bilans';
import { startCustomSprint } from './sprint';
import { fichesPagesHTML } from '../core/lessons';
import { bilanBlocksForIds, buildFichesForIds } from '../core/build';
import { setInputCounter, setSessionItems, setRenderLesson, renderItem } from '../core/items';
import { escapeHTML } from '../core/utils';
import { setCurrentMode, setCurrentLessonId, afterStart } from './navigation';
import { printScope } from './session';
import { bilanCategoryKey, bilanCustomKey } from '../core/resume';
import { setResumeCtx, clearResumeCtx, maybeRelaunch, type ResumeCtx } from './resume';

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

export function runBilanConfig(config: BilanConfig, ctx?: ResumeCtx | null): void {
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
	// Un bilan compte pour les objectifs de régularité : « complet » quand toutes
	// les questions sont demandées, « express » sinon (#35). Ces essais ne sont
	// pas classés (cf. session.ts) car les leçons varient d'un bilan à l'autre.
	setCurrentMode(config.questionsPerLesson === 'all' ? 'complet' : 'express');
	setCurrentLessonId(null);
	// Contexte de reprise (#63) : ce bilan devient « l'exercice en cours ».
	if (ctx) setResumeCtx(ctx);
	else clearResumeCtx();
	afterStart();
}

/* Lance un bilan en gérant la reprise : si le même bilan était commencé, on
   propose « Continuer / Recommencer » ; sinon on le lance neuf (#63). */
export function startBilan(config: BilanConfig, ctx: ResumeCtx): void {
	maybeRelaunch(ctx.key, ctx.label, () => runBilanConfig(config, ctx));
}

/* Fabriques de contexte de reprise selon le type de bilan. */
export function categoryBilanCtx(
	mode: 'express' | 'complet',
	categoryId: string,
	config: BilanConfig,
): ResumeCtx {
	return {
		key: bilanCategoryKey(mode, categoryId),
		mode,
		label: config.label,
		icon: mode === 'complet' ? '📚' : '⏱️',
		categoryId,
		relaunch: { type: 'bilan', config },
	};
}
function customBilanCtx(config: BilanConfig, categoryId: string | null): ResumeCtx {
	return {
		key: bilanCustomKey(categoryId),
		mode: 'custom',
		label: config.label,
		icon: '🎚️',
		categoryId,
		relaunch: { type: 'bilan', config },
	};
}
function favoriBilanCtx(config: BilanConfig): ResumeCtx {
	return {
		key: `bilan-favori-${config.id}`,
		mode: 'custom',
		label: config.label,
		icon: '⭐',
		categoryId: null,
		relaunch: { type: 'bilan', config },
	};
}

/* ---------- Lecture du formulaire ---------- */

function readFormConfig(form: HTMLElement): BilanConfig | null {
	const lessonIds = [...form.querySelectorAll<HTMLInputElement>('.bc-lesson-check:checked')].map(
		(el) => el.value,
	);
	if (!lessonIds.length) return null;
	const modeEl = form.querySelector<HTMLInputElement>('.bc-mode-radio:checked');
	const mode = modeEl?.value === 'sprint' ? 'sprint' : 'bilan';
	const nbqEl = form.querySelector<HTMLInputElement>('.bc-nbq-radio:checked');
	const nbqRaw = nbqEl ? nbqEl.value : '3';
	// En sprint, le nombre de questions par leçon n'a pas de sens (le sprint est
	// borné par le temps) : on garde une valeur neutre, ignorée au lancement.
	const questionsPerLesson = nbqRaw === 'all' ? ('all' as const) : Number(nbqRaw);
	return { id: '', label: 'Bilan personnalisé', lessonIds, questionsPerLesson, mode };
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
	const sprintLabel = scoped ? `Sprint — ${category!.label}` : 'Sprint personnalisé';

	const modeItem = (value: string, icon: string, title: string, sub: string) =>
		`<label class="bc-mode-item">
      <input type="radio" name="bcMode" class="bc-mode-radio" value="${value}"${value === 'bilan' ? ' checked' : ''}>
      <span>${icon} ${title} <span class="bc-mode-sub">${sub}</span></span>
    </label>`;

	el.innerHTML = `
    <div class="bilan-config" id="bilanConfigForm">
      ${scoped ? `<p class="bc-scope">Catégorie : <strong>${escapeHTML(category!.label)}</strong></p>` : ''}
      <div class="bc-section-title">Que veux-tu faire ?</div>
      <div class="bc-mode">
        ${modeItem('bilan', '🌱', 'Tranquille', 'à ton rythme')}
        ${modeItem('sprint', '⏱️', 'Sprint', '5 min chrono')}
      </div>
      <div class="bc-section-title">Leçons à inclure</div>
      <div class="bc-top-actions">
        <button class="bc-action-btn" id="bcSelectAll">✓ Tout choisir</button>
        <button class="bc-action-btn" id="bcSelectNone">✗ Tout enlever</button>
      </div>
      ${lessonsMarkup}

      <div id="bcNbqSection">
        <div class="bc-section-title">Questions par leçon</div>
        <div class="bc-nbq">
          ${nbqItem('3', '🐢', 'Rapide', '3')}
          ${nbqItem('5', '🚶', 'Moyen', '5')}
          ${nbqItem('10', '🏃', 'Costaud', '10')}
          ${nbqItem('all', '🎯', 'Tout', '')}
        </div>
      </div>

      <div class="bc-run-row">
        <button id="bcRun" class="bc-btn bc-btn-run">▶ C'est parti !</button>
        <button id="bcPrint" class="bc-btn bc-btn-print" title="Imprimer ce bilan à remplir au crayon">🖨 Imprimer</button>
        <span class="bc-count" id="bcCount"></span>
      </div>

      <details class="bc-save">
        <summary>💾 Garder ce bilan pour plus tard</summary>
        <div class="bc-save-row">
          <input id="bcLabel" class="bc-label-input" type="text" placeholder="Nom du bilan" maxlength="60" value="${escapeHTML(defaultName)}">
          <button id="bcSave" class="bc-btn bc-btn-save">💾 Enregistrer</button>
        </div>
        <div class="bc-saved" id="bcSaved" role="status"></div>
      </details>
      <div class="bc-err" id="bcErr"></div>
    </div>`;

	const form = el.querySelector<HTMLElement>('#bilanConfigForm')!;
	const errEl = el.querySelector<HTMLElement>('#bcErr')!;
	const countEl = el.querySelector<HTMLElement>('#bcCount')!;
	const savedEl = el.querySelector<HTMLElement>('#bcSaved')!;

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

	// Mode sprint (#64) : le sprint est borné par le temps, le réglage « questions
	// par leçon » et l'impression d'un bilan papier n'ont pas de sens → masqués.
	const nbqSection = el.querySelector<HTMLElement>('#bcNbqSection')!;
	const printBtn = el.querySelector<HTMLElement>('#bcPrint')!;
	const applyMode = () => {
		const sprint =
			form.querySelector<HTMLInputElement>('.bc-mode-radio:checked')?.value === 'sprint';
		nbqSection.hidden = sprint;
		printBtn.hidden = sprint;
	};
	applyMode();
	form
		.querySelectorAll<HTMLInputElement>('.bc-mode-radio')
		.forEach((r) => r.addEventListener('change', applyMode));

	el.querySelector('#bcRun')!.addEventListener('click', () => {
		const config = readFormConfig(form);
		if (!config) {
			errEl.textContent = 'Coche au moins une leçon.';
			return;
		}
		errEl.textContent = '';
		if (bilanMode(config) === 'sprint') {
			config.label = sprintLabel;
			startCustomSprint(config);
		} else {
			config.label = runLabel;
			startBilan(config, customBilanCtx(config, categoryId ?? null));
		}
	});

	// Chemin B (#40) : imprimer le bilan tel que configuré, sans le lancer.
	// « Toutes » → fiches d'entraînement ; un nombre → bilan (grille de N questions).
	el.querySelector('#bcPrint')!.addEventListener('click', () => {
		savedEl.textContent = '';
		const config = readFormConfig(form);
		if (!config) {
			errEl.textContent = 'Coche au moins une leçon.';
			return;
		}
		errEl.textContent = '';
		const isAll = config.questionsPerLesson === 'all';
		printScope({
			title: runLabel,
			lessonIds: config.lessonIds,
			kind: isAll ? 'fiches' : 'bilan',
			nbQ: isAll ? undefined : (config.questionsPerLesson as number),
		});
	});

	// Enregistrer un favori SANS le lancer (#55) : on confirme sur place ; le
	// favori apparaît dans « Mes bilans favoris » sur l'accueil. Pour le lancer,
	// « C'est parti ! » reste disponible (en deux gestes : enregistrer puis lancer).
	el.querySelector('#bcSave')!.addEventListener('click', () => {
		savedEl.textContent = '';
		const label = el.querySelector<HTMLInputElement>('#bcLabel')!.value.trim();
		if (!label) {
			errEl.textContent = 'Entre un nom pour enregistrer le bilan.';
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
		savedEl.textContent = `✓ « ${label} » enregistré — tu le retrouveras dans tes favoris.`;
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
			const nLessons = `${b.lessonIds.length} leçon${b.lessonIds.length > 1 ? 's' : ''}`;
			// Un favori sprint (#64) affiche son chrono ; un bilan, ses questions/leçon.
			const detail =
				bilanMode(b) === 'sprint'
					? `⏱️ Sprint · 5 min · ${nLessons}`
					: `🌱 ${nLessons} · ${
							b.questionsPerLesson === 'all'
								? 'toutes les questions'
								: `${b.questionsPerLesson} question${(b.questionsPerLesson as number) > 1 ? 's' : ''}/leçon`
						}`;
			return `<div class="favori-item">
        <div class="favori-info">
          <div class="favori-name">${escapeHTML(b.label)}</div>
          <div class="favori-meta">${detail}</div>
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
			if (!config) return;
			if (bilanMode(config) === 'sprint') startCustomSprint(config);
			else startBilan(config, favoriBilanCtx(config));
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
