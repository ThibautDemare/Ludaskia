/* ============================================================
   Runner « tuiles » d'une leçon de numération (#98) — « une question
   à la fois ». L'enfant amène LA bonne tuile (signe <, =, > ou nombre)
   parmi des distracteurs vers l'emplacement `@` de l'énoncé, par TAP
   (fiable au doigt) ou par GLISSER-DÉPOSER (souris). Feedback immédiat,
   sans chrono. À la fin, l'essai est enregistré via recordLessonRun →
   mêmes XP / étoiles / objectifs que la fiche en saisie (parité #69).
   Réutilise les composants visuels du sprint (.sprint-*) et la tuile
   `.tuile` de l'orthographe. N'altère PAS le moteur de tuiles ortho.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import type { ExerciseMode } from '../core/exercise';
import { commKey, escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { bindConsigneTts } from './consigne-tts';
import { recordLessonRun } from '../core/lesson-run';
import type { LessonRunOutcome } from '../core/lesson-run';
import { streakSuffix } from '../core/progress';
import { showLevelUp, showCelebration } from './effects';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import {
	setToolbar,
	hideMenus,
	goCategorie,
	goHome,
	setCurrentMode,
	setCurrentLessonId,
} from './navigation';

const NB_QUESTIONS = 8;

interface TuilesQuestion {
	question: string; // énoncé avec `@` = emplacement
	answer: string; // libellé de la bonne tuile
	tuiles: string[]; // réponse + distracteurs (déjà mélangés)
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: TuilesQuestion[] = [];
let idx = 0;
let score = 0;
let placed: string | null = null; // tuile actuellement dans l'emplacement
let answered = false;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

function genQuestions(l: LessonDef, m: ExerciseMode, n: number): TuilesQuestion[] {
	const out: TuilesQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate(m);
		if (ex.type !== 'tuilesNombre') break; // ce runner n'a de sens que pour des tuiles
		const key = commKey(ex.question);
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({ question: ex.question, answer: ex.answer, tuiles: ex.tuiles });
		misses = 0;
	}
	return out;
}

export function runLeconTuiles(lessonId: string, m: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	lesson = l;
	mode = m;
	questions = genQuestions(l, m, NB_QUESTIONS);
	if (!questions.length) {
		goHome();
		return;
	}
	idx = 0;
	score = 0;
	setCurrentMode('lecon');
	setCurrentLessonId(lessonId);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false });
	renderQuestion();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function progressHTML(): string {
	const pct = Math.round((idx / questions.length) * 100);
	return `<div class="lqcm-progress">
    <span class="lqcm-progress-lab">Question ${idx + 1} / ${questions.length}</span>
    <div class="lqcm-bar"><div class="lqcm-bar-fill" style="width:${pct}%"></div></div>
  </div>`;
}

function renderQuestion(): void {
	answered = false;
	placed = null;
	const q = questions[idx];
	// L'énoncé : le `@` devient l'emplacement (drop zone).
	const enonce = escapeHTML(q.question).replace(
		'@',
		`<button type="button" class="ltui-slot" id="ltuiSlot" aria-label="Emplacement de la réponse"></button>`,
	);
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${progressHTML()}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        <p class="ltui-consigne">Amène la bonne tuile dans la case (tape-la ou glisse-la).</p>
        <div class="sprint-q ltui-enonce"${ttsAttr(q.question)}>${enonce}</div>
        <div class="ltui-bac" id="ltuiBac"></div>
        <button class="sprint-btn" id="ltuiVerif" disabled>Vérifier</button>
        <div class="sprint-correction" id="ltuiFeedback" hidden></div>
        <div class="sprint-actions" id="ltuiActions" hidden></div>
      </div>
    </div>`;
	redraw();
	sheets()
		.querySelector('#ltuiVerif')!
		.addEventListener('click', () => verifier());
	// Glisser-déposer (souris/pointeur fin) : la case accepte une tuile lâchée.
	const slot = sheets().querySelector('#ltuiSlot') as HTMLElement;
	slot.addEventListener('dragover', (e) => {
		if (!answered) e.preventDefault();
	});
	slot.addEventListener('drop', (e) => {
		e.preventDefault();
		const val = e.dataTransfer?.getData('text/plain');
		if (val) place(val);
	});
	slot.addEventListener('click', () => {
		if (placed !== null) place(null); // retirer la tuile posée
	});
	bindConsigneTts(sheets()); // bouton « Écouter » sur l'énoncé (#42)
}

function redraw(): void {
	const q = questions[idx];
	const slot = sheets().querySelector('#ltuiSlot') as HTMLElement;
	slot.textContent = placed ?? '';
	slot.classList.toggle('rempli', placed !== null);
	const bac = sheets().querySelector('#ltuiBac') as HTMLElement;
	bac.innerHTML = q.tuiles
		.map((t) => {
			const used = t === placed;
			return `<button type="button" class="tuile ltui-tuile${used ? ' tuile-used' : ''}"
        data-val="${escapeHTML(t)}"${used || answered ? ' disabled' : ' draggable="true"'}>${escapeHTML(t)}</button>`;
		})
		.join('');
	bac.querySelectorAll<HTMLButtonElement>('.ltui-tuile').forEach((btn) => {
		const val = btn.dataset.val!;
		btn.addEventListener('click', () => place(val));
		btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
	});
	const verif = sheets().querySelector('#ltuiVerif') as HTMLButtonElement;
	verif.disabled = placed === null || answered;
	// Une fois la réponse validée, « Vérifier » s'efface : seul « Continuer ▶ »
	// (#ltuiActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	verif.hidden = answered;
}

function place(val: string | null): void {
	if (answered) return;
	placed = val;
	redraw();
}

function verifier(): void {
	if (answered || placed === null) return;
	answered = true;
	const q = questions[idx];
	const correct = placed === q.answer; // libellés exacts (signe ou nombre)
	if (correct) score++;
	const slot = sheets().querySelector('#ltuiSlot') as HTMLElement;
	slot.classList.add(correct ? 'correct' : 'wrong');
	redraw(); // fige les tuiles (answered)
	const fb = sheets().querySelector('#ltuiFeedback') as HTMLElement;
	fb.hidden = false;
	fb.innerHTML = correct
		? `<span class="lqcm-ok">Bravo ! 🎉</span>`
		: `<span class="lqcm-ko">La bonne réponse était <strong>${escapeHTML(q.answer)}</strong>.</span>`;
	const actions = sheets().querySelector('#ltuiActions') as HTMLElement;
	actions.hidden = false;
	const last = idx >= questions.length - 1;
	actions.innerHTML = `<button class="sprint-btn" id="ltuiNext">${last ? 'Voir mon résultat ▶' : 'Continuer ▶'}</button>`;
	const next = sheets().querySelector('#ltuiNext') as HTMLButtonElement;
	next.addEventListener('click', () => {
		idx++;
		if (idx >= questions.length) finish();
		else renderQuestion();
	});
	next.focus();
}

function finish(): void {
	const out = recordLessonRun({
		mode: 'lecon',
		lessonId: lesson.id,
		ok: score,
		questionCount: questions.length,
		ms: 0,
		perLesson: { [lesson.id]: { ok: score, total: questions.length } },
	});
	renderResult(out);
}

function renderResult(out: LessonRunOutcome): void {
	const acc = questions.length ? Math.round((score / questions.length) * 100) : 0;
	let extra = '';
	if (out.starInfo) {
		if (out.starInfo.perfect)
			extra += `<div class="rb-medal"><span class="rb-medal-ico">⭐</span><span class="rb-medal-txt">${out.starInfo.newStar ? 'Étoile gagnée !' : 'Encore sans faute !'}</span></div>`;
		const msg =
			(out.starInfo.perfect
				? `Leçon réussie sans faute${out.starInfo.count > 1 ? ` (${out.starInfo.count}×)` : ''}. Bravo !`
				: `Il faut un sans-faute pour décrocher l'étoile. Réessaie ⭐`) +
			streakSuffix(out.streakDays);
		extra += `<div class="sprint-done-sub">${msg}</div>`;
	}
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      <div class="sprint-stage">
        <div class="sprint-done">
          ${mascotteBulleHTML(encouragementMascotte())}
          <div class="sprint-done-big">${score} / ${questions.length}</div>
          <div class="sprint-done-lab">bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} (${acc}%)</div>
          ${extra}
          <div class="sprint-actions">
            <button class="sprint-btn" id="ltuiAgain">↻ Recommencer</button>
            <button class="sprint-btn ghost" id="ltuiBack">Retour</button>
          </div>
        </div>
      </div>
    </div>`;
	sheets()
		.querySelector('#ltuiAgain')!
		.addEventListener('click', () => runLeconTuiles(lesson.id, mode));
	sheets()
		.querySelector('#ltuiBack')!
		.addEventListener('click', () => goCategorie(lesson.category));
	if (out.niveauGagne)
		showLevelUp(
			out.niveauGagne,
			out.recompensesNiv,
			out.celeb.length ? () => showCelebration(out.celeb) : undefined,
		);
	else if (out.celeb.length) showCelebration(out.celeb);
}
