/* ============================================================
   Runner « Résolution de problèmes » (#199) — un problème à la fois.
   L'énoncé reste visible, avec son bouton « Écouter » (#42, lecture de
   l'énoncé = principal obstacle des lecteurs fragiles). Une sous-question pour
   un problème simple, DEUX pour un problème à deux étapes (« chunking » : le
   résultat intermédiaire est demandé avant la réponse finale). Chaque étape est
   corrigée indépendamment ; le problème est réussi si TOUTES ses étapes le sont.
   Pas de chrono (exclu du sprint). À la fin : recordLessonRun → mêmes XP /
   étoiles / objectifs que les autres modes (parité, cf. lecon-qcm.ts).
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import type { ProblemeEtape } from '../core/exercise';
import { commKey, escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { recordLessonRun } from '../core/lesson-run';
import type { LessonRunOutcome } from '../core/lesson-run';
import { streakSuffix } from '../core/progress';
import { bindConsigneTts } from './consigne-tts';
import { brouillonHTML, bindBrouillon } from './brouillon';
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

interface ProbQuestion {
	enonce: string;
	etapes: ProblemeEtape[];
	parle: string;
}

let lesson: LessonDef;
let questions: ProbQuestion[] = [];
let idx = 0;
let score = 0;
let answered = false;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère jusqu'à n problèmes distincts (dédup par énoncé), comme genQcmQuestions. */
function genQuestions(l: LessonDef, n: number): ProbQuestion[] {
	const out: ProbQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate();
		if (ex.type !== 'probleme') break; // ce runner n'a de sens que pour un problème
		const key = commKey(ex.enonce);
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({ enonce: ex.enonce, etapes: ex.etapes, parle: ex.parle });
		misses = 0;
	}
	return out;
}

export function runLeconProbleme(lessonId: string): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	lesson = l;
	questions = genQuestions(l, NB_QUESTIONS);
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
    <span class="lqcm-progress-lab">Problème ${idx + 1} / ${questions.length}</span>
    <div class="lqcm-bar"><div class="lqcm-bar-fill" style="width:${pct}%"></div></div>
  </div>`;
}

function renderQuestion(): void {
	answered = false;
	const q = questions[idx];
	const multi = q.etapes.length > 1;
	const etapesHTML = q.etapes
		.map(
			(et, i) => `<div class="prob-etape">
        ${multi ? `<span class="prob-num">Étape ${i + 1}</span>` : ''}
        <label class="prob-q" for="probInput${i}">${escapeHTML(et.question)}</label>
        <span class="prob-rep">
          <span class="prob-rep-lab">Ma réponse</span>
          <span class="prob-saisie">
            <input class="prob-input" id="probInput${i}" data-i="${i}" data-answer="${et.answer}" inputmode="numeric" autocomplete="off" />
            <span class="prob-mark" data-for="${i}"></span>
          </span>
        </span>
      </div>`,
		)
		.join('');
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${progressHTML()}
      <div class="sprint-stage prob-stage">
        <div class="prob-col">
          <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
          <p class="prob-enonce" data-tts-pos="start"${ttsAttr(q.parle)}>${escapeHTML(q.enonce)}</p>
          <div class="prob-etapes${multi ? ' prob-etapes-multi' : ''}">${etapesHTML}</div>
          ${brouillonHTML()}
          <button class="sprint-btn" id="probVerif">Vérifier</button>
          <div class="sprint-correction" id="probFeedback" hidden></div>
          <div class="sprint-actions" id="probActions" hidden></div>
        </div>
      </div>
    </div>`;
	bindConsigneTts(sheets()); // bouton « Écouter » en tête de l'énoncé (#42)
	bindBrouillon(sheets()); // ardoise de dessin repliable (#199)
	sheets()
		.querySelector('#probVerif')!
		.addEventListener('click', () => verifier());
	const first = sheets().querySelector<HTMLInputElement>('.prob-input');
	if (first) first.focus();
}

function verifier(): void {
	if (answered) return;
	const q = questions[idx];
	const inputs = [...sheets().querySelectorAll<HTMLInputElement>('.prob-input')];
	// On exige une réponse à chaque étape avant de corriger (focus sur le 1er vide).
	const vide = inputs.find((inp) => inp.value.trim() === '');
	if (vide) {
		vide.focus();
		return;
	}
	answered = true;
	let toutJuste = true;
	inputs.forEach((inp) => {
		const i = Number(inp.dataset.i);
		const attendu = q.etapes[i].answer;
		const correct = Number(inp.value.trim().replace(',', '.')) === attendu;
		inp.disabled = true;
		inp.classList.add(correct ? 'correct' : 'wrong');
		const mark = sheets().querySelector(`.prob-mark[data-for="${i}"]`) as HTMLElement;
		mark.className = 'prob-mark ' + (correct ? 'correct' : 'wrong');
		mark.innerHTML = correct ? '✓' : `✗ <span class="sol">→ ${attendu}</span>`;
		if (!correct) toutJuste = false;
	});
	if (toutJuste) score++;
	const fb = sheets().querySelector('#probFeedback') as HTMLElement;
	fb.hidden = false;
	fb.innerHTML = toutJuste
		? `<span class="lqcm-ok">Bravo ! 🎉</span>`
		: `<span class="lqcm-ko">Regarde la bonne réponse, puis continue.</span>`;
	const actions = sheets().querySelector('#probActions') as HTMLElement;
	actions.hidden = false;
	const last = idx >= questions.length - 1;
	actions.innerHTML = `<button class="sprint-btn" id="probNext">${last ? 'Voir mon résultat ▶' : 'Continuer ▶'}</button>`;
	const next = sheets().querySelector('#probNext') as HTMLButtonElement;
	next.addEventListener('click', () => {
		idx++;
		if (idx >= questions.length) finish();
		else renderQuestion();
	});
	next.focus(); // la touche Entrée enchaîne
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
				? `Problèmes réussis sans faute${out.starInfo.count > 1 ? ` (${out.starInfo.count}×)` : ''}. Bravo !`
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
          <div class="sprint-done-lab">problème${score > 1 ? 's' : ''} réussi${score > 1 ? 's' : ''} (${acc}%)</div>
          ${extra}
          <div class="sprint-actions">
            <button class="sprint-btn" id="probAgain">↻ Recommencer</button>
            <button class="sprint-btn ghost" id="probBack">Retour</button>
          </div>
        </div>
      </div>
    </div>`;
	sheets()
		.querySelector('#probAgain')!
		.addEventListener('click', () => runLeconProbleme(lesson.id));
	sheets()
		.querySelector('#probBack')!
		.addEventListener('click', () => goCategorie(lesson.category));
	if (out.niveauGagne)
		showLevelUp(
			out.niveauGagne,
			out.recompensesNiv,
			out.celeb.length ? () => showCelebration(out.celeb) : undefined,
		);
	else if (out.celeb.length) showCelebration(out.celeb);
}
