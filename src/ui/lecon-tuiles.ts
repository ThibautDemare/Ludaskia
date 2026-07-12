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
import { niveauLecon } from '../core/niveau-actif';
import type { ExerciseMode } from '../core/exercise';
import { commKey, escapeHTML } from '../core/utils';
import { bindConsigneTts } from './consigne-tts';
import { setToolbar, hideMenus, goHome, setCurrentMode, setCurrentLessonId } from './navigation';
import {
	leconProgressHTML,
	finishLeconRun,
	renderLeconResult,
	wireNext,
} from './lecon-runner-shared';
import { bindTuileInteraction } from './tuile-interaction';
import type { TuileController } from './tuile-interaction';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';
import { capterErreur } from './erreur-capture';

const NB_QUESTIONS = 8;

interface TuilesQuestion {
	question: string; // énoncé avec `@` = emplacement
	answer: string; // libellé de la bonne tuile
	tuiles: string[]; // réponse + distracteurs (déjà mélangés)
	parle?: string; // texte lu à voix haute si l'énoncé est télégraphique (#42)
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: TuilesQuestion[] = [];
let idx = 0;
let score = 0;
let ctrl: TuileController; // widget « tuiles » mutualisé (#345)

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

function genQuestions(l: LessonDef, m: ExerciseMode, n: number): TuilesQuestion[] {
	const out: TuilesQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'tuilesNombre') break; // ce runner n'a de sens que pour des tuiles
		const key = commKey(ex.question);
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({ question: ex.question, answer: ex.answer, tuiles: ex.tuiles, parle: ex.parle });
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
	maybeAutoAide('tuiles'); // bulle d'aide au 1er lancement (une fois par profil)
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderQuestion(): void {
	const q = questions[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        <div data-tuile-mount></div>
        <button class="sprint-btn" id="ltuiVerif" disabled>Vérifier</button>
        <div class="sprint-correction" id="ltuiFeedback" hidden></div>
        <div class="sprint-actions" id="ltuiActions" hidden></div>
      </div>
    </div>`;
	const verif = sheets().querySelector('#ltuiVerif') as HTMLButtonElement;
	// Le widget « tuiles » mutualisé (#345) rend l'énoncé + le bac, gère tap/glisser
	// et l'enveloppe .bignum (#240) ; il (dé)active « Vérifier » via onState.
	ctrl = bindTuileInteraction(
		sheets(),
		{ kind: 'tuile', question: q.question, answer: q.answer, tuiles: q.tuiles, parle: q.parle },
		{ variant: 'lecon', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => verifier());
	bindConsigneTts(sheets()); // bouton « Écouter » sur l'énoncé (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), 'tuiles'); // bouton « ? » persistant (#272)
}

function verifier(): void {
	const verif = sheets().querySelector('#ltuiVerif') as HTMLButtonElement;
	if (verif.disabled) return; // pas de tuile posée
	const q = questions[idx];
	const correct = ctrl.verify(); // fige + marque la case (✓/✗)
	if (correct) score++;
	else {
		// Journal des erreurs (#391) : la tuile posée (libellé) vs la bonne. Une seule
		// capture : verifier() ne corrige qu'une fois (bouton figé, puis question suivante).
		const rep = ctrl.reponse?.();
		capterErreur({
			text: q.question,
			donnee: rep?.kind === 'tuile' ? (rep.posee ?? '') : '',
			attendue: q.answer,
			lessonId: lesson.id,
			mode: 'lecon',
		});
	}
	// Une fois la réponse validée, « Vérifier » s'efface : seul « Continuer ▶ »
	// (#ltuiActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	verif.hidden = true;
	wireNext(
		sheets().querySelector('#ltuiActions') as HTMLElement,
		sheets().querySelector('#ltuiFeedback') as HTMLElement,
		{
			feedbackHTML: correct
				? `<span class="lqcm-ok">Bravo ! 🎉</span>`
				: `<span class="lqcm-ko">La bonne réponse était <strong>${escapeHTML(q.answer)}</strong>.</span>`,
			isLast: idx >= questions.length - 1,
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

function finish(): void {
	renderLeconResult({
		out: finishLeconRun(lesson.id, score, questions.length),
		score,
		total: questions.length,
		category: lesson.category,
		onAgain: () => runLeconTuiles(lesson.id, mode),
	});
}
