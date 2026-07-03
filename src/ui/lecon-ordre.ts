/* ============================================================
   Runner « ranger une suite » d'une leçon de vocabulaire (#108) — ordre
   alphabétique, « une question à la fois ». L'enfant range 4 à 5 tuiles-mots
   dans une rangée de cases NUMÉROTÉES : il tape une tuile du bac → elle se
   place à la suite ; il tape une tuile posée → elle repart au bac (les
   suivantes se re-tassent). Glisser-déposer du bac vers la rangée en appoint
   (souris/desktop). Feedback immédiat case par case + bon ordre montré, sans
   chrono. À la fin, l'essai est enregistré via recordLessonRun → mêmes XP /
   étoiles / objectifs que les autres modes (parité #69).

   Réutilise les composants du sprint (.sprint-*) et la tuile .tuile. Modèle
   d'interaction validé côté UX enfant (tap fiable au doigt, drag en appoint).
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { ExerciseMode } from '../core/exercise';
import { escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
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

const NB_QUESTIONS = 6;

interface OrdreQuestion {
	question: string; // consigne
	tuiles: string[]; // suite mélangée (bac)
	ordre: string[]; // bonne suite triée
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: OrdreQuestion[] = [];
let idx = 0;
let score = 0;
let ctrl: TuileController; // widget « ranger une suite » mutualisé (#345)

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère des questions DISTINCTES. La consigne étant constante, on déduplique
   sur l'ensemble de mots (suite triée), pas sur le texte de l'énoncé. */
function genQuestions(l: LessonDef, m: ExerciseMode, n: number): OrdreQuestion[] {
	const out: OrdreQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'tuilesOrdre') break; // ce runner n'a de sens que pour ce type
		const key = ex.ordre.join('|');
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({ question: ex.question, tuiles: ex.tuiles, ordre: ex.ordre });
		misses = 0;
	}
	return out;
}

export function runLeconOrdre(lessonId: string, m: ExerciseMode): void {
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
	maybeAutoAide('ordre'); // bulle d'aide au 1er lancement (une fois par profil)
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderQuestion(): void {
	const q = questions[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        <p class="sprint-q lord-consigne"${ttsAttr(q.question)}>${escapeHTML(q.question)}</p>
        <div data-tuile-mount></div>
        <button class="sprint-btn" id="lordVerif" disabled>Vérifier</button>
        <div class="sprint-correction" id="lordFeedback" hidden></div>
        <div class="sprint-actions" id="lordActions" hidden></div>
      </div>
    </div>`;
	const verif = sheets().querySelector('#lordVerif') as HTMLButtonElement;
	// Widget « ranger une suite » mutualisé (#345) : rangée numérotée + bac, tap/glisser,
	// figeage et marques ✓/✗ par case à la validation.
	ctrl = bindTuileInteraction(
		sheets(),
		{ kind: 'ordre', question: q.question, ordre: q.ordre, tuiles: q.tuiles },
		{ variant: 'lecon', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => verifier());
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), 'ordre'); // bouton « ? » persistant (#272)
}

function verifier(): void {
	const verif = sheets().querySelector('#lordVerif') as HTMLButtonElement;
	if (verif.disabled) return; // rangée incomplète
	const q = questions[idx];
	const correct = ctrl.verify(); // fige + marque chaque case (✓/✗)
	if (correct) score++;
	// Une fois la réponse validée, « Vérifier » s'efface : seul « Continuer ▶ »
	// (#lordActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	verif.hidden = true;
	wireNext(
		sheets().querySelector('#lordActions') as HTMLElement,
		sheets().querySelector('#lordFeedback') as HTMLElement,
		{
			feedbackHTML: correct
				? `<span class="lqcm-ok">Bravo ! 🎉</span>`
				: `<span class="lqcm-ko">Le bon rangement : <strong>${q.ordre.map(escapeHTML).join(' · ')}</strong></span>`,
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
		onAgain: () => runLeconOrdre(lesson.id, mode),
	});
}
