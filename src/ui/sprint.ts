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
import { choice, commKey, escapeHTML, fmt, rnd } from '../core/utils';
import {
	getAllLessons,
	getLessonsBySubject,
	getLessonsByCategory,
	lessonsForIds,
	genLessonItem,
	SUBJECTS,
	CATEGORIES,
} from '../core/catalog';
import type { BilanConfig, LessonDef } from '../core/catalog';
import { hasMode } from '../core/exercise';
import { checkItemAnswer } from '../core/items';
import type { Item } from '../core/items';
import {
	updateStreak,
	recordLessonStats,
	recordRun,
	streakSuffix,
	addXP,
	getXP,
	niveauDepuisXP,
} from '../core/progress';
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

function lessonsForFilter(f: SprintFilter): LessonDef[] {
	if (f.type === 'subject') return getLessonsBySubject(f.id);
	if (f.type === 'category') return getLessonsByCategory(f.id);
	if (f.type === 'lessons') return lessonsForIds(f.ids);
	return getAllLessons();
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
	location.hash = 'sprint';
}

/* Lance un sprint personnalisé (#64) : la sélection de leçons d'un BilanConfig
   (composeur ou favori) alimente le tirage. Le sprint reste non reprenable et
   suit ses règles habituelles (chrono, pause sur erreur, XP/records/trophées). */
export function startCustomSprint(config: BilanConfig): void {
	sprintFilter = { type: 'lessons', ids: config.lessonIds, label: config.label };
	location.hash = 'sprint';
}

/* ---------- Écran de configuration du sprint ---------- */

export function renderSprintConfigScreen(el: HTMLElement): void {
	const allLessons = getAllLessons();
	const totalN = allLessons.length;

	// L'écran de config n'expose que tout/matière/catégorie : un filtre 'lessons'
	// (sprint personnalisé lancé depuis le composeur) retombe sur « toutes ».
	const currentValue =
		sprintFilter.type === 'subject'
			? `subject:${sprintFilter.id}`
			: sprintFilter.type === 'category'
				? `category:${sprintFilter.id}`
				: 'all';

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
	sprintLessonDefs = lessonsForFilter(sprintFilter);
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
const SPRINT_SUBJECT_META: Record<string, { icon: string; label: string }> = {
	math: { icon: '🔢', label: 'Maths' },
	francais: { icon: '✏️', label: 'Français' },
};
function subjectTag(subject: string): string {
	const meta = SPRINT_SUBJECT_META[subject] ?? {
		icon: '📘',
		label: SUBJECTS.find((s) => s.id === subject)?.label ?? subject,
	};
	return `<span class="sprint-subject sprint-subject-${subject}">${meta.icon} ${escapeHTML(meta.label)}</span>`;
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
		key: string,
		guard = 0;
	do {
		def = pickSprintDef();
		if (hasMode(def.exerciseType, 'qcm')) {
			const ex = def.exerciseType.generate('qcm');
			q = {
				text: ex.type === 'qcm' ? ex.question : '',
				answer: ex.answer,
				kind: 'text',
				_lesson: def.id,
			};
			choices = ex.type === 'qcm' ? ex.choices : null;
		} else {
			q = genLessonItem(def); // aiguille math (bilanQ) ; pose _lesson
			choices = null;
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
	if (choices) renderSprintQcm(stage, def, q, choices);
	else renderSprintTyped(stage, def, q);
}

// Entrée valide la saisie (utile pour la leçon 15 et ses étapes). Fonction
// nommée : addEventListener déduplique, pas d'accumulation de listeners.
function onSprintEnter(e: KeyboardEvent) {
	if (e.key === 'Enter') {
		e.preventDefault();
		sprintSubmit();
	}
}

// Question à saisir (maths) : champ + bouton Valider.
function renderSprintTyped(stage: HTMLElement, def: LessonDef, q: Item) {
	const deco = def.id === 'math-decomposer-multiplication' ? ' deco' : '';
	stage.innerHTML = `
    <div class="sprint-theme">${subjectTag(def.subject)}<span class="sprint-lesson">${escapeHTML(def.label)}</span></div>
    <div class="sprint-q${deco}">${sprintQuestionBody(q)}</div>
    <div class="sprint-actions"><button class="sprint-btn" id="sprintValidate">Valider</button></div>`;
	document.getElementById('sprintValidate')?.addEventListener('click', sprintSubmit);
	stage.addEventListener('keydown', onSprintEnter);
	stage.querySelector('input')?.focus();
}

// Question à choix (conjugaison) : un clic sur une proposition vaut réponse.
function renderSprintQcm(stage: HTMLElement, def: LessonDef, q: Item, choices: string[]) {
	const question = escapeHTML(q.text).replace('@', '<span class="sprint-blank">?</span>');
	stage.innerHTML = `
    <div class="sprint-theme">${subjectTag(def.subject)}<span class="sprint-lesson">${escapeHTML(def.label)}</span></div>
    <div class="sprint-q sprint-q-qcm">${question}</div>
    <div class="sprint-choices">
      ${choices.map((c, i) => `<button class="sprint-choice" data-i="${i}">${escapeHTML(c)}</button>`).join('')}
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
			? '<input id="sprintInput" class="sprint-input sprint-input-text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">'
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
