/* ============================================================
   Mode Sprint : 5 minutes, un max de bonnes réponses, calculs
   tirés au hasard et générés un par un (pas de preview).
   - bonne réponse → petite animation ✓ puis question suivante
     (le compte à rebours continue)
   - mauvaise réponse → on révèle la bonne réponse et on MET LE
     CHRONO EN PAUSE jusqu'à ce que l'élève passe à la suite
     (clic « Continuer » OU touche Entrée)
   - validation sur Entrée OU bouton « Valider »
   - un sprint ne compte que s'il va au bout des 5 minutes
   ============================================================ */
import { choice, commKey, escapeHTML, fmt, rnd } from '../core/utils';
import {
	getAllLessons,
	getLessonsBySubject,
	getLessonsByCategory,
	lessonsForIds,
	genLessonItem,
	isPosedLesson,
	isOrderingLesson,
	isTriLesson,
	isProblemeLesson,
	SUBJECTS,
	CATEGORIES,
} from '../core/catalog';
import type { BilanConfig, LessonDef } from '../core/catalog';
import { niveauLecon, niveauActifMatiere } from '../core/niveau-actif';
import { hasMode } from '../core/exercise';
import type { ChoiceView } from '../core/exercise';
import { mathInline } from '../core/fraction-text';
import { icon, type IconName } from './icon';
import {
	checkItemAnswer,
	choiceButtonHTML,
	figureBlock,
	TEXT_ANSWER_INPUT_ATTRS,
} from '../core/items';
import type { Item } from '../core/items';
import {
	updateStreak,
	recordLessonStats,
	recordRun,
	streakSuffix,
	addXP,
	getXP,
	niveauDepuisXP,
	loadLessonFirstSeen,
} from '../core/progress';
import {
	appliquerScope,
	scopeParDefaut,
	perimetreChoisissable,
	type SprintScope,
} from '../core/sprint-scope';
import { updateGoal, evaluateTrophies } from '../core/rewards';
import { getTimer, setTimer, resetChrono } from './chrono';
import { recompensesEntre } from '../core/unlocks';
import { showCelebration, showLevelUp } from './effects';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
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
	| { type: 'category'; id: string }
	// Sprint personnalisé (#64) : une sélection précise de leçons alimente le
	// tirage, en lieu et place du filtre tout/matière/catégorie.
	| { type: 'lessons'; ids: string[]; label: string };

let sprintFilter: SprintFilter = { type: 'all' };
// Périmètre (#208, lot 2) : toutes les leçons éligibles, ou uniquement celles déjà
// rencontrées. Résolu (défaut adaptatif) à chaque entrée dans la config / lancement.
let sprintScope: SprintScope = 'all';

function lessonsForFilter(f: SprintFilter): LessonDef[] {
	const base =
		f.type === 'subject'
			? getLessonsBySubject(f.id)
			: f.type === 'category'
				? getLessonsByCategory(f.id)
				: f.type === 'lessons'
					? lessonsForIds(f.ids)
					: getAllLessons();
	// Filtre par niveau actif de la matière (#225) — SAUF un favori explicite
	// (`lessons`), qui résout hors-filtre pour ne pas être cassé par un changement de
	// classe (la génération reste calibrée par niveauLecon).
	const auNiveau =
		f.type === 'lessons'
			? base
			: base.filter((d) => d.levels.includes(niveauActifMatiere(d.subject)));
	// Les opérations posées (#97, grille multi-cellules), le rangement d'une suite
	// (#108, plusieurs tuiles à ordonner) et le tri par thème (#114, tuiles à
	// classer) ne se jouent pas « une réponse à la fois » : on les écarte du
	// sprint chronométré.
	return auNiveau.filter(
		(d) =>
			!d.excludeFromSprint &&
			!isPosedLesson(d) &&
			!isOrderingLesson(d) &&
			!isTriLesson(d) &&
			!isProblemeLesson(d),
	);
}

function filterLabel(f: SprintFilter): string {
	if (f.type === 'all') return '';
	if (f.type === 'subject') return SUBJECTS.find((s) => s.id === f.id)?.label ?? f.id;
	if (f.type === 'lessons') return f.label;
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
	// Lancement direct (sans écran de config) → périmètre par défaut adaptatif (#208).
	sprintScope = scopeParDefaut(lessonsForFilter(sprintFilter));
	location.hash = 'sprint';
}

/* Lance un sprint personnalisé (#64) : la sélection de leçons d'un BilanConfig
   (composeur ou favori) alimente le tirage. Le sprint reste non reprenable et
   suit ses règles habituelles (chrono, pause sur erreur, XP/records/trophées). */
export function startCustomSprint(config: BilanConfig): void {
	sprintFilter = { type: 'lessons', ids: config.lessonIds, label: config.label };
	// Un favori est une sélection EXPLICITE de leçons : le périmètre « déjà vues »
	// ne s'y applique pas (on respecte le choix du parent/enfant).
	sprintScope = 'all';
	location.hash = 'sprint';
}

/* ---------- Écran de configuration du sprint ---------- */

export function renderSprintConfigScreen(el: HTMLElement): void {
	// À chaque entrée dans l'écran : périmètre par défaut ADAPTATIF (#208) — « déjà
	// vues » tant qu'il reste du non-rencontré, sinon « tout ».
	drawSprintConfig(el, scopeParDefaut(lessonsForFilter({ type: 'all' })));
}

/* Rendu (ré-entrant) de l'écran de config pour un périmètre donné. Re-dessiné au
   basculement du périmètre : les comptes par filtre et les options vides en dépendent. */
function drawSprintConfig(el: HTMLElement, scope: SprintScope): void {
	sprintScope = scope; // mémorisé pour le lancement
	const vues = loadLessonFirstSeen();
	// Le choix de périmètre n'est proposé que s'il a un sens (mélange vu / pas-vu).
	const choisissable = perimetreChoisissable(lessonsForFilter({ type: 'all' }), vues);

	// On ne compte que les leçons ÉLIGIBLES au sprint (posée, tuiles, problèmes… en
	// sont exclues), puis restreintes au périmètre courant.
	const countFor = (f: SprintFilter): number =>
		appliquerScope(lessonsForFilter(f), scope, vues).length;

	// Filtre courant (l'écran n'expose que tout/matière/catégorie ; un favori 'lessons'
	// retombe sur « toutes »). Rabattu sur « toutes » s'il est vide au périmètre choisi.
	const wanted =
		sprintFilter.type === 'subject'
			? `subject:${sprintFilter.id}`
			: sprintFilter.type === 'category'
				? `category:${sprintFilter.id}`
				: 'all';
	const currentValue = countFor(parseFilter(wanted)) > 0 ? wanted : 'all';

	const opt = (value: string, label: string, n: number, indent = false) => {
		const checked = currentValue === value ? 'checked' : '';
		const disabled = n === 0 ? 'disabled' : '';
		const cls = `sc-option${indent ? ' sc-option-indent' : ''}${n === 0 ? ' sc-option-disabled' : ''}`;
		return `<label class="${cls}">
      <input type="radio" name="scFilter" class="sc-radio" value="${value}" ${checked} ${disabled}>
      <span>${escapeHTML(label)} <span class="sc-count">${n} leçon${n > 1 ? 's' : ''}</span></span>
    </label>`;
	};

	// La structure matière/catégorie reste affichée selon l'ÉLIGIBILITÉ (indépendante
	// du périmètre) → liste stable au basculement ; seules les options vides au
	// périmètre courant sont grisées (compte 0).
	const subjectOptions = SUBJECTS.flatMap((subj) => {
		if (!lessonsForFilter({ type: 'subject', id: subj.id }).length) return [];
		const catOptions = CATEGORIES.filter((c) => c.subject === subj.id).flatMap((cat) =>
			lessonsForFilter({ type: 'category', id: cat.id }).length
				? [opt(`category:${cat.id}`, cat.label, countFor({ type: 'category', id: cat.id }), true)]
				: [],
		);
		return [
			opt(`subject:${subj.id}`, subj.label, countFor({ type: 'subject', id: subj.id })),
			...catOptions,
		];
	}).join('');

	// Sélecteur de périmètre (#208) : « Ce que je connais déjà » (défaut) en tête.
	// « connais » et non « appris » : critère = rencontrée, pas maîtrisée (avis pédago).
	const perimetre = choisissable
		? `<div class="sc-section-title">Je m'entraîne sur</div>
    <div class="sc-options sc-perimetre">
      <label class="sc-option"><input type="radio" name="scScope" class="sc-scope" value="seen" ${scope === 'seen' ? 'checked' : ''}><span>Ce que je connais déjà</span></label>
      <label class="sc-option"><input type="radio" name="scScope" class="sc-scope" value="all" ${scope === 'all' ? 'checked' : ''}><span>Tout</span></label>
    </div>`
		: '';

	el.innerHTML = `<div class="sprint-config">
    ${perimetre}
    <div class="sc-section-title">Filtre</div>
    <div class="sc-options">
      ${opt('all', 'Toutes les matières', countFor({ type: 'all' }))}
      ${subjectOptions}
    </div>
    <button id="scLaunch" class="sprint-btn">${icon('play')} Lancer</button>
  </div>`;

	// Basculer le périmètre : on conserve le filtre en cours puis on redessine.
	el.querySelectorAll<HTMLInputElement>('.sc-scope').forEach((r) =>
		r.addEventListener('change', () => {
			const f = el.querySelector<HTMLInputElement>('.sc-radio:checked');
			if (f) sprintFilter = parseFilter(f.value);
			const next = el.querySelector<HTMLInputElement>('.sc-scope:checked')?.value;
			drawSprintConfig(el, next === 'seen' ? 'seen' : 'all');
		}),
	);
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
	sprintAnswered = 0,
	sprintNiveauDepart = 1; // niveau au lancement du sprint (pour détecter une montée)
let sprintPerLesson: Record<string, { ok: number; total: number }> = {},
	sprintRecentKeys: string[] = [],
	sprintCurrent: Item | null = null,
	sprintCurrentDef: LessonDef | null = null;
// Mini-séries : on garde la même matière 2-3 questions avant d'en changer,
// pour limiter le coût de bascule entre disciplines (cf. issue #54).
let sprintSeriesSubject: string | null = null,
	sprintSeriesLeft = 0;

// Combien d'items récents on s'interdit de répéter. Fenêtre volontairement
// modeste : sur un filtre réduit à une seule leçon (6 variantes en conjugaison),
// elle laisse toujours des candidats valides — et le garde-fou de sprintNext
// accepte de toute façon un item si la pioche n'en trouve pas d'autre.
const SPRINT_RECENT = 4;

// Stoppe proprement un sprint en cours (appelé en quittant la vue).
export function sprintCleanup() {
	sprintActive = false;
	sprintPaused = false;
}

// Un sprint est-il EN COURS (pas l'écran de résultats) ? Sert au garde-fou de
// sortie (#63) : quitter un sprint perd la progression (mode non reprenable).
export const isSprintRunning = () => sprintActive;

export function runSprint() {
	setCurrentMode('sprint');
	setCurrentLessonId(null);
	// Pool éligible filtré par le périmètre (#208). Un favori ('lessons') ignore le
	// périmètre : c'est déjà une sélection explicite.
	const eligibles = lessonsForFilter(sprintFilter);
	sprintLessonDefs =
		sprintFilter.type === 'lessons' ? eligibles : appliquerScope(eligibles, sprintScope);
	// Sélection vide (ex. favori dont toutes les leçons ont disparu du catalogue) :
	// rien à tirer, on revient à l'accueil plutôt que de planter le tirage.
	if (!sprintLessonDefs.length) {
		goHome();
		return;
	}
	sprintActive = true;
	sprintPaused = false;
	sprintRemaining = SPRINT_MS;
	sprintScore = 0;
	sprintAnswered = 0;
	sprintNiveauDepart = niveauDepuisXP(getXP());
	sprintPerLesson = {};
	sprintRecentKeys = [];
	sprintCurrent = null;
	sprintCurrentDef = null;
	sprintSeriesSubject = null;
	sprintSeriesLeft = 0;
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

// Icône + libellé court par matière, pour signaler la matière de chaque
// question (cf. issue #54 : lisible instantanément par un enfant de CE2).
const SPRINT_SUBJECT_META: Record<string, { icon: IconName; label: string }> = {
	math: { icon: 'calculator', label: 'Maths' },
	francais: { icon: 'book-open', label: 'Français' },
};
function subjectTag(subject: string): string {
	const meta = SPRINT_SUBJECT_META[subject] ?? {
		icon: 'book-open' as IconName,
		label: SUBJECTS.find((s) => s.id === subject)?.label ?? subject,
	};
	return `<span class="sprint-subject sprint-subject-${subject}">${icon(meta.icon)} ${escapeHTML(meta.label)}</span>`;
}

// Choisit la prochaine leçon en gardant la même matière sur une mini-série de
// 2-3 questions, puis en changeant de matière si plusieurs sont disponibles.
function pickSprintDef(): LessonDef {
	const subjects = [...new Set(sprintLessonDefs.map((d) => d.subject))];
	if (
		sprintSeriesLeft <= 0 ||
		sprintSeriesSubject === null ||
		!subjects.includes(sprintSeriesSubject)
	) {
		const others = subjects.filter((s) => s !== sprintSeriesSubject);
		sprintSeriesSubject = choice(others.length ? others : subjects);
		sprintSeriesLeft = rnd(2, 3);
	}
	sprintSeriesLeft--;
	return choice(sprintLessonDefs.filter((d) => d.subject === sprintSeriesSubject));
}

// Génère et affiche la prochaine question (en évitant de répéter l'un des
// derniers items via une mémoire glissante). Les leçons dont l'ExerciseType
// propose un mode 'qcm' (conjugaison) sont posées en QCM : sous chrono, la
// frappe au clavier pénaliserait la vitesse (cf. issue #54).
function sprintNext() {
	let q: Item,
		def: LessonDef,
		choices: string[] | null,
		choicesView: ChoiceView[] | undefined,
		key: string,
		guard = 0;
	do {
		def = pickSprintDef();
		const level = niveauLecon(def); // calibrage au niveau effectif (#225)
		if (hasMode(def.exerciseType, 'qcm')) {
			const ex = def.exerciseType.generate({ mode: 'qcm', level });
			q = {
				text: ex.type === 'qcm' ? ex.question : '',
				answer: ex.type === 'qcm' ? ex.answer : '',
				kind: 'text',
				figure: ex.type === 'qcm' ? ex.figure : undefined,
				_lesson: def.id,
			};
			choices = ex.type === 'qcm' ? ex.choices : null;
			choicesView = ex.type === 'qcm' ? ex.choicesView : undefined;
		} else {
			q = genLessonItem(def, level); // aiguille math (bilanQ) ; pose _lesson
			choices = null;
			choicesView = undefined;
		}
		key = commKey(q.text);
		guard++;
	} while (sprintRecentKeys.includes(key) && guard < 25);
	sprintRecentKeys.push(key);
	if (sprintRecentKeys.length > SPRINT_RECENT) sprintRecentKeys.shift();
	sprintCurrent = q;
	sprintCurrentDef = def;
	const stage = document.getElementById('sprintStage');
	if (!stage) return;
	if (choices) renderSprintQcm(stage, def, q, choices, choicesView);
	else renderSprintTyped(stage, def, q);
}

// Entrée : pendant une correction (chrono en pause) elle enchaîne sur la
// question suivante comme le bouton « Continuer » ; sinon elle valide la saisie
// (utile pour la leçon 15 et ses étapes). Le listener est posé sur #sprintStage
// (persistant) : sans ce routage, son preventDefault bloquerait l'activation
// native de « Continuer » au clavier. Fonction nommée : addEventListener
// déduplique, pas d'accumulation de listeners.
function onSprintEnter(e: KeyboardEvent) {
	if (e.key !== 'Enter') return;
	e.preventDefault();
	if (sprintPaused) sprintContinue();
	else sprintSubmit();
}

// Question à saisir (maths) : champ + bouton Valider.
function renderSprintTyped(stage: HTMLElement, def: LessonDef, q: Item) {
	const deco = def.id === 'math-decomposer-multiplication' ? ' deco' : '';
	stage.innerHTML = `
    <div class="sprint-theme">${subjectTag(def.subject)}<span class="sprint-lesson">${escapeHTML(def.label)}</span></div>
    ${figureBlock(q.figure)}
    <div class="sprint-q${deco}">${sprintQuestionBody(q)}</div>
    <div class="sprint-actions"><button class="sprint-btn" id="sprintValidate">Valider</button></div>`;
	document.getElementById('sprintValidate')?.addEventListener('click', sprintSubmit);
	stage.addEventListener('keydown', onSprintEnter);
	stage.querySelector('input')?.focus();
}

// Question à choix (conjugaison) : un clic sur une proposition vaut réponse.
function renderSprintQcm(
	stage: HTMLElement,
	def: LessonDef,
	q: Item,
	choices: string[],
	choicesView?: ChoiceView[],
) {
	// `mathInline` : empile les fractions « num/den » de l'énoncé (barre horizontale).
	const question = mathInline(q.text).replace('@', '<span class="sprint-blank">?</span>');
	stage.innerHTML = `
    <div class="sprint-theme">${subjectTag(def.subject)}<span class="sprint-lesson">${escapeHTML(def.label)}</span></div>
    ${figureBlock(q.figure)}
    <div class="sprint-q sprint-q-qcm">${question}</div>
    <div class="sprint-choices">
      ${choices.map((c, i) => choiceButtonHTML(c, i, choicesView?.[i])).join('')}
    </div>`;
	stage.querySelectorAll<HTMLButtonElement>('.sprint-choice').forEach((btn) => {
		btn.addEventListener('click', () => sprintAnswer(choices[Number(btn.dataset.i)]));
	});
}
// Corps de la question : champ unique, sauf leçon 15 où l'on affiche la
// décomposition avec des champs de brouillon (non corrigés) + le champ final.
export function sprintQuestionBody(q: Item) {
	const main =
		q.kind === 'text'
			? `<input id="sprintInput" class="sprint-input sprint-input-text" ${TEXT_ANSWER_INPUT_ATTRS}>`
			: '<input id="sprintInput" class="sprint-input" inputmode="numeric" autocomplete="off">';
	if (q._lesson !== 'math-decomposer-multiplication') return escapeHTML(q.text).replace('@', main);
	const m = q.text.match(/(\d+)\s*×\s*(\d+)/)!;
	const a = +m[1],
		b = +m[2];
	const free = '<input class="sprint-free" inputmode="numeric" autocomplete="off">';
	return `${a} × ${b} = (${free} × ${free}) + (${free} × ${free}) = ${free} + ${free} = ${main}`;
}

// Cœur de la validation, commun à la saisie (maths) et au QCM (conjugaison).
function sprintAnswer(raw: string) {
	if (!sprintActive || sprintPaused) return;
	const val = (raw || '').trim();
	if (val === '') return; // pas de validation à vide
	sprintAnswered++;
	const lessonId = sprintCurrent!._lesson!;
	const b = sprintPerLesson[lessonId] || (sprintPerLesson[lessonId] = { ok: 0, total: 0 });
	b.total++;
	if (checkItemAnswer(sprintCurrent!, val)) {
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

function sprintSubmit() {
	const inp = document.getElementById('sprintInput') as HTMLInputElement | null;
	if (!inp) return;
	if (inp.value.trim() === '') {
		inp.focus(); // garde le focus plutôt que de valider à vide
		return;
	}
	sprintAnswer(inp.value);
}

// Mauvaise réponse : on révèle la solution et on met le chrono en pause.
function sprintShowCorrection(ans: number | string) {
	sprintPaused = true;
	const stage = document.getElementById('sprintStage');
	if (!stage) return;
	const sol = escapeHTML(String(ans));
	stage.innerHTML = `
    <div class="sprint-theme">${sprintCurrentDef ? subjectTag(sprintCurrentDef.subject) : ''}<span class="sprint-lesson">${escapeHTML(sprintCurrentDef?.label ?? '')}</span></div>
    <div class="sprint-q wrong">${escapeHTML(sprintCurrent!.text).replace('@', '<span class="sprint-sol">' + sol + '</span>')}</div>
    <div class="sprint-correction">La bonne réponse était <strong>${sol}</strong>. Prends le temps de la lire.</div>
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
	// Passage de niveau pendant le sprint → modale dédiée, puis enchaînement.
	const niveauApres = niveauDepuisXP(getXP());
	if (niveauApres > sprintNiveauDepart)
		showLevelUp(
			niveauApres,
			recompensesEntre(sprintNiveauDepart, niveauApres),
			celeb.length ? () => showCelebration(celeb) : undefined,
		);
	else if (celeb.length) showCelebration(celeb);
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
      ${mascotteBulleHTML(encouragementMascotte())}
      <div class="sprint-done-big">${sprintScore}</div>
      <div class="sprint-done-lab">bonne${sprintScore > 1 ? 's' : ''} réponse${sprintScore > 1 ? 's' : ''} en 5 min</div>
      <div class="sprint-done-sub">${sprintAnswered} question${sprintAnswered > 1 ? 's' : ''} tentée${sprintAnswered > 1 ? 's' : ''} · ${acc}% de réussite</div>
      ${extra}
      <div class="sprint-actions">
        <button class="sprint-btn" id="sprintAgain">↻ Recommencer</button>
        <button class="sprint-btn ghost" id="sprintHome">${icon('house')} Accueil</button>
      </div>
    </div>`;
	const again = document.getElementById('sprintAgain');
	if (again) again.addEventListener('click', startSprint);
	const home = document.getElementById('sprintHome');
	if (home) home.addEventListener('click', goHome);
	sprintRenderTime();
	sprintUpdateScore();
}
