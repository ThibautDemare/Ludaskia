/* ============================================================
   Bilan personnalisé : configurateur, favoris, exécution.
   Suit le même pattern que sprint.ts (dépendance circulaire
   volontaire avec navigation.ts — valide en ES modules).
   ============================================================ */
import {
	getAllLessons,
	getLessonsByCategory,
	bilanMode,
	commonCategoryId,
	CATEGORIES,
	SUBJECTS,
} from '../core/catalog';
import type { BilanConfig, LessonDef, Category } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { niveauActifMatiere } from '../core/niveau-actif';
import { subjectIcon, subjectTint, catTint } from './cat-visuals';
import { loadBilans, saveBilan, deleteBilan } from '../core/bilans';
import { startCustomSprint } from './sprint';
import { fichesPagesHTML } from '../core/lessons';
import { bilanBlocksForIds, buildFichesForIds } from '../core/build';
import { renderItem, createRenderContext, withLessonId } from '../core/items';
import type { RenderContext } from '../core/items';

import { setCurrentMode, setCurrentLessonId, afterStart, setRenderCtx } from './navigation';
import { printScope } from './session';
import { bilanCategoryKey, bilanCustomKey } from '../core/resume';
import { setResumeCtx, clearResumeCtx, maybeRelaunch, type ResumeCtx } from './resume';
import { icon } from './icon';
import { uiConfirm } from './ui-modal';
import { html, type SafeHtml, VIDE, joindre, drapeau } from '../core/html';

/* ---------- Génération de bilan express personnalisé ---------- */

function bilanCustomExpressHTML(config: BilanConfig, ctx: RenderContext): SafeHtml {
	const blocks = bilanBlocksForIds(config.lessonIds, config.questionsPerLesson as number);
	const cells = joindre(
		blocks.map((b) => {
			const ops = withLessonId(ctx, b.id, () =>
				joindre(b.ops.map((o) => html`<div class="bop">${renderItem(o, ctx)}</div>`)),
			);
			return html`<div class="bloc"><span class="btheme">${b.theme}</span>${ops}</div>`;
		}),
	);
	const nbq = config.questionsPerLesson as number;
	return html`<div class="page">
    <p class="bilan-title">${config.label}</p>
    <p class="bilan-sub">${nbq} question${nbq > 1 ? 's' : ''} par leçon · ${config.lessonIds.length} leçon${config.lessonIds.length > 1 ? 's' : ''}</p>
    <div class="bilan-grid">${cells}</div>
    <p class="foot print-only">Ludaskia</p>
  </div>`;
}

/* ---------- Exécution d'un BilanConfig ---------- */

export function runBilanConfig(config: BilanConfig, ctx?: ResumeCtx | null): void {
	if (!config.lessonIds.length) return;
	const renderCtx = createRenderContext();
	setRenderCtx(renderCtx);
	let contenu: SafeHtml;
	if (config.questionsPerLesson === 'all') {
		contenu = fichesPagesHTML(buildFichesForIds(config.lessonIds, undefined, renderCtx));
	} else {
		contenu = bilanCustomExpressHTML(config, renderCtx);
	}
	document.getElementById('sheets')!.innerHTML = contenu.balisage;
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
		icon: mode === 'complet' ? 'exam' : 'timer',
		categoryId,
		relaunch: { type: 'bilan', config },
	};
}
function customBilanCtx(config: BilanConfig, categoryId: string | null): ResumeCtx {
	return {
		key: bilanCustomKey(categoryId),
		mode: 'custom',
		label: config.label,
		icon: 'faders',
		categoryId,
		relaunch: { type: 'bilan', config },
	};
}
function favoriBilanCtx(config: BilanConfig): ResumeCtx {
	return {
		key: `bilan-favori-${config.id}`,
		mode: 'custom',
		label: config.label,
		icon: 'bookmark',
		// Un favori rattaché à une catégorie (#65) voit aussi sa reprise filtrée
		// dans cette catégorie ; un favori multi-catégories reste « hors scope ».
		categoryId: config.categoryId ?? null,
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
	// Rattachement à une catégorie (#65) : déduit des leçons cochées (et non du
	// contexte d'ouverture) pour couvrir aussi une sélection mono-catégorie
	// composée depuis l'accueil. `undefined` (multi-catégories) → accueil seul.
	const categoryId = commonCategoryId(lessonIds);
	return { id: '', label: 'Bilan personnalisé', lessonIds, questionsPerLesson, mode, categoryId };
}

function genId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2);
	}
}

/* ---------- Écran de configuration ---------- */

/* Liste de cases à cocher (toute la tuile est cliquable) pour un ensemble de leçons.
   Le composeur liste TOUTES les leçons (tous niveaux confondus, volontairement) ; le
   libellé, lui, est celui du niveau actif de la matière (#436) — c'est la classe dans
   laquelle la leçon sera imprimée/jouée. */
function lessonChecks(lessons: LessonDef[]): SafeHtml {
	return joindre(
		lessons.map(
			(l) =>
				html`<label class="bc-item">
          <input type="checkbox" class="bc-lesson-check" value="${l.id}" checked>
          <span>${labelLecon(l, niveauActifMatiere(l.subject))}</span>
        </label>`,
		),
	);
}

/* Case parent d'un groupe (matière/catégorie/rubrique) : coche/décoche tout son
   périmètre, et reflète un état partiel (indéterminé) — câblé dans le JS. */
function groupCheck(label: string): SafeHtml {
	return html`<input type="checkbox" class="bc-group-check" aria-label="Tout choisir : ${label}">`;
}

/* Regroupe des leçons par rubrique (#109), dans leur ordre d'apparition. Une
   leçon sans rubrique rejoint un groupe « sans titre » (clé vide). */
function groupByRubrique(lessons: LessonDef[]): { rubrique: string; lessons: LessonDef[] }[] {
	const groups: { rubrique: string; lessons: LessonDef[] }[] = [];
	lessons.forEach((l) => {
		const r = l.rubrique ?? '';
		let g = groups.find((x) => x.rubrique === r);
		if (!g) {
			g = { rubrique: r, lessons: [] };
			groups.push(g);
		}
		g.lessons.push(l);
	});
	return groups;
}

/* Corps d'une catégorie : leçons regroupées par rubrique si la catégorie en a
   (même présentation que l'écran de catégorie, #109), sinon grille à plat. Les
   leçons sans rubrique d'une catégorie mixte restent à plat (sans en-tête). */
function categoryBody(lessons: LessonDef[]): SafeHtml {
	const groups = groupByRubrique(lessons);
	const aRubriques = groups.some((g) => g.rubrique !== '');
	if (!aRubriques) return html`<div class="bc-lessons-grid">${lessonChecks(lessons)}</div>`;
	return joindre(
		groups.map((g) => {
			if (g.rubrique === '')
				return html`<div class="bc-lessons-grid">${lessonChecks(g.lessons)}</div>`;
			return html`<div class="bc-group bc-rubrique">
        <label class="bc-group-head bc-rubrique-head">
          ${groupCheck(g.rubrique)}
          <span class="bc-group-title bc-rubrique-title">${g.rubrique}</span>
          <span class="bc-group-count" aria-hidden="true"></span>
        </label>
        <div class="bc-lessons-grid">${lessonChecks(g.lessons)}</div>
      </div>`;
		}),
	);
}

/* Bloc d'une catégorie (configurateur global) : en-tête à pastille colorée +
   case parent + compteur, puis corps groupé par rubrique. La teinte (cyclée)
   et l'icône reprennent celles des cartes de navigation (cf. cat-visuals). */
function categoryBlock(cat: Category, lessons: LessonDef[], tint: string): SafeHtml {
	const ico = cat.icon
		? html`<span class="cat-ico bc-cat-ico" style="background:${tint}">${icon(cat.icon)}</span>`
		: VIDE;
	return html`<div class="bc-group bc-category" style="--bc-cat-tint:${tint}">
      <label class="bc-group-head bc-cat-head">
        ${groupCheck(cat.label)}
        ${ico}
        <span class="bc-group-title bc-cat-title">${cat.label}</span>
        <span class="bc-group-count" aria-hidden="true"></span>
      </label>
      <div class="bc-cat-body">${categoryBody(lessons)}</div>
    </div>`;
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

	let lessonsMarkup: SafeHtml;
	if (scoped) {
		// Écran scopé : une seule catégorie, déjà nommée par `.bc-scope`. On
		// regroupe simplement ses leçons par rubrique (#109) ; le « Tout choisir »
		// global du haut couvre le niveau catégorie.
		lessonsMarkup = html`<div class="bc-scoped-lessons">${categoryBody(getLessonsByCategory(category!.id))}</div>`;
	} else {
		// Écran global : Matière (volet repliable) → Catégorie → Rubrique. Volets
		// repliés par défaut (109 leçons) — les compteurs « x/y » par matière disent
		// l'état sans déplier (cf. avis UX enfant).
		const lessons = getAllLessons();
		lessonsMarkup = joindre(
			SUBJECTS.map((subj) => {
				const catBlocks = CATEGORIES.filter((c) => c.subject === subj.id).map((cat, i) => {
					const catLessons = lessons.filter((l) => l.category === cat.id);
					return catLessons.length ? categoryBlock(cat, catLessons, catTint(i)) : VIDE;
				});
				if (!catBlocks.length) return VIDE;
				return html`<details class="bc-group bc-subject">
        <summary class="bc-group-head bc-subject-head">
          <span class="bc-check-wrap"><input type="checkbox" class="bc-group-check" aria-label="Tout choisir : ${subj.label}"></span>
          <span class="cat-ico bc-subject-ico" style="background:${subjectTint(subj.id)}">${icon(subjectIcon(subj.id))}</span>
          <span class="bc-group-title bc-subject-title">${subj.label}</span>
          <span class="bc-group-count" aria-hidden="true"></span>
          <span class="bc-chevron" aria-hidden="true">${icon('caret-down')}</span>
        </summary>
        <div class="bc-subject-body">${catBlocks}</div>
      </details>`;
			}),
		);
	}

	// Défaut : « Moyen » sur un écran scopé (révision pour de vrai), « Un peu » sinon.
	const defaultNbq = scoped ? '5' : '3';
	// Carte verticale : icône (agrandie) au-dessus du libellé et du nombre, pour
	// un picto lisible et tapable au doigt (cf. avis UX enfant). Le bouton radio
	// est masqué visuellement (l'état coché est porté par la carte).
	const nbqItem = (value: string, ico: SafeHtml, intent: string, num: string) =>
		html`<label class="bc-nbq-item">
      <input type="radio" name="bcNbq" class="bc-nbq-radio" value="${value}"${value === defaultNbq ? drapeau('checked') : ''}>
      <span class="bc-nbq-ico">${ico}</span>
      <span class="bc-nbq-label">${intent}</span>
      <span class="bc-nbq-num">${num || '&nbsp;'}</span>
    </label>`;

	const today = new Date();
	const defaultName = scoped
		? `${category!.label} ${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`
		: '';
	const runLabel = scoped ? `Bilan — ${category!.label}` : 'Bilan personnalisé';
	const sprintLabel = scoped ? `Sprint — ${category!.label}` : 'Sprint personnalisé';

	const modeItem = (value: string, ico: SafeHtml, title: string, sub: string) =>
		html`<label class="bc-mode-item">
      <input type="radio" name="bcMode" class="bc-mode-radio" value="${value}"${value === 'bilan' ? drapeau('checked') : ''}>
      <span>${ico} ${title} <span class="bc-mode-sub">${sub}</span></span>
    </label>`;

	el.innerHTML = html`
    <div class="bilan-config" id="bilanConfigForm">
      ${scoped ? html`<p class="bc-scope">Catégorie : <strong>${category!.label}</strong></p>` : ''}
      <div class="bc-section-title">Que veux-tu faire ?</div>
      <div class="bc-mode">
        ${modeItem('bilan', icon('feather'), 'Tranquille', 'à ton rythme')}
        ${modeItem('sprint', icon('run'), 'Sprint', '5 min chrono')}
      </div>
      <div class="bc-section-title">Leçons à inclure</div>
      <div class="bc-top-actions">
        <button class="bc-action-btn" id="bcSelectAll">${icon('check')} Tout choisir</button>
        <button class="bc-action-btn" id="bcSelectNone">${icon('x')} Tout enlever</button>
      </div>
      ${lessonsMarkup}

      <div id="bcNbqSection">
        <div class="bc-section-title">Questions par leçon</div>
        <div class="bc-nbq">
          ${nbqItem('3', icon('quantity-1'), 'Un peu', '3')}
          ${nbqItem('5', icon('quantity-2'), 'Moyen', '5')}
          ${nbqItem('10', icon('quantity-3'), 'Beaucoup', '10')}
          ${nbqItem('all', icon('quantity-all'), 'Tout', '')}
        </div>
      </div>

      <div class="bc-run-row">
        <button id="bcRun" class="bc-btn bc-btn-run">${icon('play')} C'est parti !</button>
        <button id="bcPrint" class="bc-btn bc-btn-print" title="Imprimer ce bilan à remplir au crayon">${icon('printer')} Imprimer</button>
        <span class="bc-count" id="bcCount"></span>
      </div>
      <label class="bc-corrige" id="bcCorrigeWrap">
        <input type="checkbox" id="bcCorrige">
        <span>${icon('printer')} Imprimer aussi le corrigé pour le parent (avec les réponses)</span>
      </label>

      <details class="bc-save">
        <summary>${icon('bookmark')} Garder pour plus tard</summary>
        <div class="bc-save-row">
          <input id="bcLabel" class="bc-label-input" type="text" placeholder="Nom du bilan" maxlength="60" value="${defaultName}">
          <button id="bcSave" class="bc-btn bc-btn-save">${icon('bookmark')} Garder</button>
        </div>
        <div class="bc-saved" id="bcSaved" role="status"></div>
      </details>
      <div class="bc-err" id="bcErr"></div>
    </div>`.balisage;

	const form = el.querySelector<HTMLElement>('#bilanConfigForm')!;
	const errEl = el.querySelector<HTMLElement>('#bcErr')!;
	const countEl = el.querySelector<HTMLElement>('#bcCount')!;
	const savedEl = el.querySelector<HTMLElement>('#bcSaved')!;

	// Groupes (matière / catégorie / rubrique) : chaque groupe porte une case
	// parent (`.bc-group-check`) et un compteur (`.bc-group-count`) dans son
	// en-tête direct (`:scope > .bc-group-head`). On collecte une fois les
	// références ; le périmètre d'un groupe = toutes les leçons qu'il contient
	// (les groupes sont imbriqués matière ⊃ catégorie ⊃ rubrique).
	const groups = [...form.querySelectorAll<HTMLElement>('.bc-group')].map((group) => {
		const head = group.querySelector<HTMLElement>(':scope > .bc-group-head')!;
		return {
			group,
			cb: head.querySelector<HTMLInputElement>('.bc-group-check')!,
			counter: head.querySelector<HTMLElement>('.bc-group-count')!,
		};
	});

	// Recalcule l'état de chaque case parent (cochée / partielle « indéterminée »)
	// et son compteur « x/y », plus le compteur global de leçons choisies. Le
	// texte « x/y » est le vrai porteur d'info (la couleur seule ne suffit pas
	// pour ce public, cf. avis UX enfant).
	const refresh = () => {
		for (const { group, cb, counter } of groups) {
			const boxes = group.querySelectorAll<HTMLInputElement>('.bc-lesson-check');
			const total = boxes.length;
			const checked = [...boxes].filter((b) => b.checked).length;
			cb.checked = total > 0 && checked === total;
			cb.indeterminate = checked > 0 && checked < total;
			counter.textContent = `${checked}/${total}`;
			counter.classList.toggle('is-full', total > 0 && checked === total);
		}
		const n = form.querySelectorAll<HTMLInputElement>('.bc-lesson-check:checked').length;
		countEl.textContent = n
			? `${n} leçon${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''}`
			: 'Aucune leçon choisie';
	};

	// Case parent → coche/décoche toutes les leçons de son périmètre. Sur la barre
	// de matière, la case est un `<label>` distinct (`.bc-check-wrap`) : on stoppe
	// la propagation pour ne pas (dé)plier l'accordéon en cochant.
	groups.forEach(({ group, cb }) => {
		const wrap = cb.closest('.bc-check-wrap');
		if (wrap) wrap.addEventListener('click', (e) => e.stopPropagation());
		cb.addEventListener('change', () => {
			group
				.querySelectorAll<HTMLInputElement>('.bc-lesson-check')
				.forEach((b) => (b.checked = cb.checked));
			refresh();
		});
	});

	// Une leçon cochée/décochée met à jour tous les compteurs et états parents.
	form.addEventListener('change', (e) => {
		if ((e.target as HTMLElement).classList.contains('bc-lesson-check')) refresh();
	});

	refresh();

	const setAll = (checked: boolean) => {
		form
			.querySelectorAll<HTMLInputElement>('.bc-lesson-check')
			.forEach((cb) => (cb.checked = checked));
		refresh();
	};
	el.querySelector('#bcSelectAll')!.addEventListener('click', () => setAll(true));
	el.querySelector('#bcSelectNone')!.addEventListener('click', () => setAll(false));

	// Mode sprint (#64) : le sprint est borné par le temps, le réglage « questions
	// par leçon » et l'impression d'un bilan papier n'ont pas de sens → masqués.
	const nbqSection = el.querySelector<HTMLElement>('#bcNbqSection')!;
	const printBtn = el.querySelector<HTMLElement>('#bcPrint')!;
	const corrigeWrap = el.querySelector<HTMLElement>('#bcCorrigeWrap')!;
	const applyMode = () => {
		const sprint =
			form.querySelector<HTMLInputElement>('.bc-mode-radio:checked')?.value === 'sprint';
		nbqSection.hidden = sprint;
		printBtn.hidden = sprint;
		// Le corrigé n'a de sens qu'à l'impression (chemin papier), pas en sprint.
		corrigeWrap.hidden = sprint;
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
		// #41 : si la case est cochée, on ajoute un corrigé (mêmes items, réponses révélées).
		const corrige = el.querySelector<HTMLInputElement>('#bcCorrige')?.checked ?? false;
		printScope({
			title: runLabel,
			lessonIds: config.lessonIds,
			kind: isAll ? 'fiches' : 'bilan',
			nbQ: isAll ? undefined : (config.questionsPerLesson as number),
			corrige,
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

/* ---------- Section favoris (accueil et catégorie) ---------- */

function favoriItemHTML(b: BilanConfig): SafeHtml {
	const nLessons = `${b.lessonIds.length} leçon${b.lessonIds.length > 1 ? 's' : ''}`;
	// Un favori sprint (#64) affiche son chrono ; un bilan, ses questions/leçon.
	const detail =
		bilanMode(b) === 'sprint'
			? html`${icon('run')} Sprint · 5 min · ${nLessons}`
			: html`${icon('feather')} ${nLessons} · ${
					b.questionsPerLesson === 'all'
						? 'toutes les questions'
						: `${b.questionsPerLesson} question${(b.questionsPerLesson as number) > 1 ? 's' : ''}/leçon`
				}`;
	return html`<div class="favori-item">
        <div class="favori-info">
          <div class="favori-name">${b.label}</div>
          <div class="favori-meta">${detail}</div>
        </div>
        <div class="favori-btns">
          <button class="favori-btn favori-btn-run" data-run="${b.id}">${icon('play')} Lancer</button>
          <button class="favori-btn favori-btn-del" data-del="${b.id}" title="Supprimer ce favori" aria-label="Supprimer ce favori">${icon('trash')}</button>
        </div>
      </div>`;
}

/* Rend la liste des favoris dans `el` et câble Lancer/Supprimer.
   - sans `categoryId` : tous les favoris (accueil) ;
   - avec `categoryId` : seulement ceux rattachés à cette catégorie (#65).
   Liste vide → conteneur vidé (aucun titre), pour ne pas encombrer l'écran. */
export function renderFavoris(el: HTMLElement | null, categoryId?: string): void {
	if (!el) return;
	const bilans = loadBilans().filter((b) => !categoryId || b.categoryId === categoryId);
	if (!bilans.length) {
		el.innerHTML = '';
		return;
	}
	el.innerHTML = html`<h3 class="favoris-title">Mes bilans favoris</h3>
    <div class="favori-list">${joindre(bilans.map(favoriItemHTML))}</div>`.balisage;

	el.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const config = loadBilans().find((b) => b.id === btn.dataset.run);
			if (!config) return;
			if (bilanMode(config) === 'sprint') startCustomSprint(config);
			else startBilan(config, favoriBilanCtx(config));
		});
	});
	el.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((btn) => {
		btn.addEventListener('click', async () => {
			const name =
				btn.closest('.favori-item')?.querySelector<HTMLElement>('.favori-name')?.textContent ?? '';
			// On nomme l'objet par son nom (« Supprimer « X » ? ») plutôt que par le mot
			// « bilan », abstrait pour un CE2 (avis pédagogue/rédacteur, #230).
			const ok = await uiConfirm({
				title: `Supprimer « ${name} » ?`,
				message: 'Tu ne pourras pas le récupérer.',
				confirmLabel: 'Supprimer',
				cancelLabel: 'Non, je garde',
				destructive: true,
				confirmIcon: 'trash',
				emoji: '🗑️',
			});
			if (ok) {
				deleteBilan(btn.dataset.del!);
				renderFavoris(el, categoryId);
				// Déclencheur recréé/supprimé au re-rendu → repli sur une action restante.
				el.querySelector<HTMLElement>('button')?.focus();
			}
		});
	});
}
