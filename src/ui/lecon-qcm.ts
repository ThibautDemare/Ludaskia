/* ============================================================
   Runner QCM d'une leçon (#69) — « une question à la fois ».
   Mode reconnaissance : l'enfant choisit la bonne forme parmi 4 avec
   FEEDBACK IMMÉDIAT (la valeur du QCM, cf. avis pédagogue), sans chrono
   ni pression de temps. À la fin, l'essai est enregistré via
   recordLessonRun → mêmes XP / étoiles / objectifs que la fiche en
   saisie (parité des modes). Pas de reprise auto (ce n'est pas une
   grille, comme le sprint / la révision).
   Réutilise les composants visuels du sprint (.sprint-*).
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import type { ExerciseMode } from '../core/exercise';
import type { Item } from '../core/items';
import { checkItemAnswer, figureBlock } from '../core/items';
import { commKey, escapeHTML } from '../core/utils';
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

// Cible de questions ; une leçon offrant moins de variantes en aura moins, sans
// doublon (une conjugaison = 6 personnes), comme la fiche en saisie.
const NB_QUESTIONS = 8;

interface QcmQuestion {
	item: Item; // { text, answer, kind:'text', _lesson }
	choices: string[];
	explication?: string; // justification affichée après la réponse (#110)
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: QcmQuestion[] = [];
let idx = 0;
let score = 0;
let answered = false; // garde anti double-clic sur une même question

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère jusqu'à n questions QCM distinctes, comme genItems pour la fiche : on
   s'arrête après une longue série de tirages sans nouveauté. La clé de dédup inclut
   la RÉPONSE et la FIGURE, pas seulement l'énoncé : pour les leçons à énoncé
   constant mais visuel variable (« Quel est ce solide ? », figures planes…), dédupe
   par texte seul ne laisserait qu'UNE question. */
function genQcmQuestions(l: LessonDef, m: ExerciseMode, n: number): QcmQuestion[] {
	const out: QcmQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate(m);
		if (ex.type !== 'qcm') break; // sécurité : ce runner n'a de sens que pour un QCM
		const key = `${commKey(ex.question)}¦${ex.answer}¦${ex.figure ?? ''}`;
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({
			item: {
				text: ex.question,
				answer: ex.answer,
				kind: 'text',
				figure: ex.figure,
				_lesson: l.id,
			},
			choices: ex.choices,
			explication: ex.explication,
		});
		misses = 0;
	}
	return out;
}

export function runLeconQcm(lessonId: string, m: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	lesson = l;
	mode = m;
	questions = genQcmQuestions(l, m, NB_QUESTIONS);
	if (!questions.length) {
		goHome();
		return;
	}
	idx = 0;
	score = 0;
	setCurrentMode('lecon');
	setCurrentLessonId(lessonId);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false }); // boutons propres au runner
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
	const q = questions[idx];
	const question = escapeHTML(q.item.text).replace('@', '<span class="sprint-blank">?</span>');
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${progressHTML()}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        ${figureBlock(q.item.figure)}
        <div class="sprint-q sprint-q-qcm">${question}</div>
        <div class="sprint-choices" id="lqcmChoices">
          ${q.choices
						.map((c, i) => `<button class="sprint-choice" data-i="${i}">${escapeHTML(c)}</button>`)
						.join('')}
        </div>
        <div class="sprint-correction" id="lqcmFeedback" hidden></div>
        <div class="sprint-actions" id="lqcmActions" hidden></div>
      </div>
    </div>`;
	sheets()
		.querySelectorAll<HTMLButtonElement>('#lqcmChoices .sprint-choice')
		.forEach((btn) => btn.addEventListener('click', () => answer(Number(btn.dataset.i))));
}

function answer(choiceIdx: number): void {
	if (answered) return; // on ne répond qu'une fois
	answered = true;
	const q = questions[idx];
	const chosen = q.choices[choiceIdx];
	const correct = checkItemAnswer(q.item, chosen);
	if (correct) score++;
	// Marquage : la bonne réponse en vert ; le mauvais choix tapé en rouge.
	sheets()
		.querySelectorAll<HTMLButtonElement>('#lqcmChoices .sprint-choice')
		.forEach((b, i) => {
			b.disabled = true;
			if (q.choices[i] === q.item.answer) b.classList.add('correct');
			else if (i === choiceIdx) b.classList.add('wrong');
		});
	const fb = sheets().querySelector('#lqcmFeedback') as HTMLElement;
	fb.hidden = false;
	fb.innerHTML = correct
		? `<span class="lqcm-ok">Bravo ! 🎉</span>`
		: `<span class="lqcm-ko">La bonne réponse était <strong>${escapeHTML(String(q.item.answer))}</strong>.</span>`;
	// Justification pédagogique (ex. critère de substitution des homophones, #110).
	if (q.explication) fb.innerHTML += `<p class="lqcm-expl">${escapeHTML(q.explication)}</p>`;
	const actions = sheets().querySelector('#lqcmActions') as HTMLElement;
	actions.hidden = false;
	const last = idx >= questions.length - 1;
	actions.innerHTML = `<button class="sprint-btn" id="lqcmNext">${last ? 'Voir mon résultat ▶' : 'Continuer ▶'}</button>`;
	const next = sheets().querySelector('#lqcmNext') as HTMLButtonElement;
	next.addEventListener('click', () => {
		idx++;
		if (idx >= questions.length) finish();
		else renderQuestion();
	});
	next.focus(); // la touche Entrée enchaîne
}

function finish(): void {
	// Enregistrement commun (parité avec la fiche en saisie). ms inutile en mode leçon.
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
            <button class="sprint-btn" id="lqcmAgain">↻ Recommencer</button>
            <button class="sprint-btn ghost" id="lqcmBack">Retour</button>
          </div>
        </div>
      </div>
    </div>`;
	sheets()
		.querySelector('#lqcmAgain')!
		.addEventListener('click', () => runLeconQcm(lesson.id, mode));
	sheets()
		.querySelector('#lqcmBack')!
		.addEventListener('click', () => goCategorie(lesson.category));
	// Récompenses : modale de niveau (puis confettis), comme les autres écrans.
	if (out.niveauGagne)
		showLevelUp(
			out.niveauGagne,
			out.recompensesNiv,
			out.celeb.length ? () => showCelebration(out.celeb) : undefined,
		);
	else if (out.celeb.length) showCelebration(out.celeb);
}
