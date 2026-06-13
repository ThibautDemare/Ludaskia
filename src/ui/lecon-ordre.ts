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
import type { ExerciseMode } from '../core/exercise';
import { escapeHTML } from '../core/utils';
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
let placed: string[] = []; // mots posés dans la rangée-réponse, dans l'ordre
let answered = false;

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
		const ex = l.exerciseType.generate(m);
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
	placed = [];
	const q = questions[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${progressHTML()}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        <p class="sprint-q lord-consigne">${escapeHTML(q.question)}</p>
        <div class="lord-seq" id="lordSeq"></div>
        <p class="ltui-consigne">Tape les mots dans l'ordre (ou glisse-les dans les cases).</p>
        <div class="ltui-bac" id="lordBac"></div>
        <button class="sprint-btn" id="lordVerif" disabled>Vérifier</button>
        <div class="sprint-correction" id="lordFeedback" hidden></div>
        <div class="sprint-actions" id="lordActions" hidden></div>
      </div>
    </div>`;
	redraw();
	sheets()
		.querySelector('#lordVerif')!
		.addEventListener('click', () => verifier());
}

function redraw(): void {
	const q = questions[idx];
	// Rangée-réponse : une case numérotée par position.
	const seq = sheets().querySelector('#lordSeq') as HTMLElement;
	seq.innerHTML = q.ordre
		.map((_, i) => {
			const mot = placed[i];
			const rempli = mot !== undefined;
			const label = rempli
				? `Position ${i + 1} : ${escapeHTML(mot)}, taper pour retirer`
				: `Position ${i + 1}, vide`;
			return `<button type="button" class="lord-cell${rempli ? ' rempli' : ''}"
        data-pos="${i}" aria-label="${label}"${rempli ? '' : ' disabled'}>
        <span class="lord-num" aria-hidden="true">${i + 1}</span>
        <span class="lord-mot">${rempli ? escapeHTML(mot) : ''}</span>
      </button>`;
		})
		.join('');
	if (!answered) {
		seq.querySelectorAll<HTMLButtonElement>('.lord-cell.rempli').forEach((cell) => {
			cell.addEventListener('click', () => retirer(Number(cell.dataset.pos)));
		});
		// Dépôt (glisser) : lâcher une tuile sur la rangée l'ajoute à la suite.
		seq.addEventListener('dragover', (e) => {
			if (!answered && placed.length < q.ordre.length) e.preventDefault();
		});
		seq.addEventListener('drop', (e) => {
			e.preventDefault();
			const val = e.dataTransfer?.getData('text/plain');
			if (val) poser(val);
		});
	}
	// Bac : tuiles non encore posées (les posées restent en place mais masquées
	// pour ne pas faire « sauter » la mise en page). Les mots d'une question sont
	// distincts → un mot posé est repérable par sa valeur.
	const bac = sheets().querySelector('#lordBac') as HTMLElement;
	bac.innerHTML = q.tuiles
		.map((t) => {
			const used = placed.includes(t);
			return `<button type="button" class="tuile lord-tuile${used ? ' tuile-used' : ''}"
        data-val="${escapeHTML(t)}"${used || answered ? ' disabled' : ' draggable="true"'}
        aria-label="Ranger le mot ${escapeHTML(t)}">${escapeHTML(t)}</button>`;
		})
		.join('');
	if (!answered) {
		bac.querySelectorAll<HTMLButtonElement>('.lord-tuile:not(.tuile-used)').forEach((btn) => {
			const val = btn.dataset.val!;
			btn.addEventListener('click', () => poser(val));
			btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
		});
	}
	const verif = sheets().querySelector('#lordVerif') as HTMLButtonElement;
	verif.disabled = placed.length !== q.ordre.length || answered;
}

function poser(val: string): void {
	if (answered) return;
	const q = questions[idx];
	if (placed.length >= q.ordre.length || placed.includes(val)) return;
	placed.push(val);
	redraw();
}

function retirer(pos: number): void {
	if (answered || pos < 0 || pos >= placed.length) return;
	placed.splice(pos, 1);
	redraw();
}

function verifier(): void {
	const q = questions[idx];
	if (answered || placed.length !== q.ordre.length) return;
	answered = true;
	const correct = placed.every((mot, i) => mot === q.ordre[i]);
	if (correct) score++;
	redraw(); // fige les tuiles + régénère la rangée en mode « répondu »
	// Marque chaque case APRÈS le redraw (qui réécrit le HTML de la rangée) — vert
	// si bien placée, alerte sinon ; jamais la couleur seule : on ajoute une icône.
	const seq = sheets().querySelector('#lordSeq') as HTMLElement;
	seq.querySelectorAll<HTMLElement>('.lord-cell').forEach((cell, i) => {
		const ok = placed[i] === q.ordre[i];
		cell.classList.add(ok ? 'correct' : 'wrong');
		const mark = document.createElement('span');
		mark.className = 'lord-mark';
		mark.setAttribute('aria-hidden', 'true');
		mark.textContent = ok ? '✓' : '✗';
		cell.appendChild(mark);
	});
	const fb = sheets().querySelector('#lordFeedback') as HTMLElement;
	fb.hidden = false;
	fb.innerHTML = correct
		? `<span class="lqcm-ok">Bravo ! 🎉</span>`
		: `<span class="lqcm-ko">Le bon rangement : <strong>${q.ordre.map(escapeHTML).join(' · ')}</strong></span>`;
	const actions = sheets().querySelector('#lordActions') as HTMLElement;
	actions.hidden = false;
	const last = idx >= questions.length - 1;
	actions.innerHTML = `<button class="sprint-btn" id="lordNext">${last ? 'Voir mon résultat ▶' : 'Continuer ▶'}</button>`;
	const next = sheets().querySelector('#lordNext') as HTMLButtonElement;
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
            <button class="sprint-btn" id="lordAgain">↻ Recommencer</button>
            <button class="sprint-btn ghost" id="lordBack">Retour</button>
          </div>
        </div>
      </div>
    </div>`;
	sheets()
		.querySelector('#lordAgain')!
		.addEventListener('click', () => runLeconOrdre(lesson.id, mode));
	sheets()
		.querySelector('#lordBack')!
		.addEventListener('click', () => goCategorie(lesson.category));
	if (out.niveauGagne)
		showLevelUp(
			out.niveauGagne,
			out.recompensesNiv,
			out.celeb.length ? () => showCelebration(out.celeb) : undefined,
		);
	else if (out.celeb.length) showCelebration(out.celeb);
}
