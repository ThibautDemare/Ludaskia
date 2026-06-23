/* ============================================================
   Runner « ranger par thème » d'une leçon de vocabulaire (#114) — champs
   lexicaux, « une question à la fois ». L'enfant trie des tuiles-mots FOURNIES
   dans DEUX colonnes-thèmes (aucune saisie, on teste la reconnaissance
   lexicale). Interaction tap en deux temps (fiable au doigt) : taper une tuile
   du bac la sélectionne ; taper une colonne y dépose la tuile sélectionnée ;
   taper une tuile déjà posée la renvoie au bac. Glisser-déposer du bac vers une
   colonne en appoint (souris/desktop). Feedback immédiat tuile par tuile + bon
   classement montré, sans chrono. À la fin, l'essai est enregistré via
   recordLessonRun → mêmes XP / étoiles / objectifs que les autres modes.

   Réutilise les composants du sprint (.sprint-*) et la tuile .tuile. Modèle
   d'interaction calqué sur le runner « ranger une suite » (ui/lecon-ordre.ts).
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { ExerciseMode } from '../core/exercise';
import { escapeHTML } from '../core/utils';
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
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';

const NB_QUESTIONS = 6;

interface TriQuestion {
	question: string; // consigne
	categories: [string, string]; // libellés des deux thèmes
	mots: { mot: string; cat: 0 | 1 }[]; // tuiles fournies + thème correct
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: TriQuestion[] = [];
let idx = 0;
let score = 0;
let placed: Record<string, 0 | 1> = {}; // mot → colonne choisie par l'enfant
let selected: string | null = null; // tuile sélectionnée dans le bac (tap 1er temps)
let answered = false;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère des questions DISTINCTES. La consigne étant constante, on déduplique sur
   l'ensemble des mots de la question (indépendant de l'ordre des tuiles). */
function genQuestions(l: LessonDef, m: ExerciseMode, n: number): TriQuestion[] {
	const out: TriQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'tuilesTri') break; // ce runner n'a de sens que pour ce type
		const key = [...ex.mots.map((x) => x.mot)].sort((a, b) => a.localeCompare(b)).join('|');
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({ question: ex.question, categories: ex.categories, mots: ex.mots });
		misses = 0;
	}
	return out;
}

export function runLeconTri(lessonId: string, m: ExerciseMode): void {
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
	maybeAutoAide('tri'); // bulle d'aide au 1er lancement (une fois par profil)
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
	placed = {};
	selected = null;
	const q = questions[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${progressHTML()}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        <p class="sprint-q lord-consigne"${ttsAttr(q.question)}>${escapeHTML(q.question)}</p>
        <p class="ltui-consigne">Tape un mot, puis tape son thème (ou glisse-le dans la colonne).</p>
        <div class="ltri-cols" id="ltriCols"></div>
        <div class="ltui-bac" id="ltriBac"></div>
        <button class="sprint-btn" id="ltriVerif" disabled>Vérifier</button>
        <div class="sprint-correction" id="ltriFeedback" hidden></div>
        <div class="sprint-actions" id="ltriActions" hidden></div>
      </div>
    </div>`;
	redraw();
	sheets()
		.querySelector('#ltriVerif')!
		.addEventListener('click', () => verifier());
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), 'tri'); // bouton « ? » persistant (#272)
}

function motsDeColonne(col: 0 | 1): string[] {
	const q = questions[idx];
	return q.mots.map((m) => m.mot).filter((mot) => placed[mot] === col);
}

function redraw(): void {
	const q = questions[idx];
	// Deux colonnes-thèmes : chacune liste les tuiles qu'on y a déposées.
	const cols = sheets().querySelector('#ltriCols') as HTMLElement;
	cols.innerHTML = ([0, 1] as const)
		.map((col) => {
			const tuiles = motsDeColonne(col)
				.map((mot) => {
					const m = q.mots.find((x) => x.mot === mot)!;
					const etat = answered ? (m.cat === col ? ' correct' : ' wrong') : '';
					const mark = answered
						? `<span class="ltri-mark" aria-hidden="true">${m.cat === col ? '✓' : '✗'}</span>`
						: '';
					const label = answered
						? escapeHTML(mot)
						: `Retirer ${escapeHTML(mot)} du thème ${escapeHTML(q.categories[col])}`;
					return `<button type="button" class="tuile ltri-posee${etat}" data-mot="${escapeHTML(mot)}"
            aria-label="${label}"${answered ? ' disabled' : ''}>${escapeHTML(mot)}${mark}</button>`;
				})
				.join('');
			return `<div class="ltri-col" data-col="${col}">
        <div class="ltri-col-titre">${escapeHTML(q.categories[col])}</div>
        <div class="ltri-zone" data-col="${col}">${tuiles}</div>
      </div>`;
		})
		.join('');
	if (!answered) {
		// Dépôt par tap : taper une colonne y place la tuile sélectionnée.
		cols.querySelectorAll<HTMLElement>('.ltri-col').forEach((colEl) => {
			const col = Number(colEl.dataset.col) as 0 | 1;
			colEl.addEventListener('click', (e) => {
				const posee = (e.target as HTMLElement).closest('.ltri-posee') as HTMLElement | null;
				if (posee) {
					retirer(posee.dataset.mot!); // taper une tuile posée la renvoie au bac
					return;
				}
				if (selected) poser(selected, col);
			});
			// Dépôt par glisser.
			colEl.addEventListener('dragover', (e) => {
				if (!answered) e.preventDefault();
			});
			colEl.addEventListener('drop', (e) => {
				e.preventDefault();
				const val = e.dataTransfer?.getData('text/plain');
				if (val) poser(val, col);
			});
		});
	}
	// Bac : tuiles pas encore rangées. La tuile sélectionnée est mise en avant.
	const bac = sheets().querySelector('#ltriBac') as HTMLElement;
	bac.innerHTML = q.mots
		.map((m) => {
			if (placed[m.mot] !== undefined) return ''; // déjà rangée → hors du bac
			const sel = selected === m.mot ? ' ltri-sel' : '';
			return `<button type="button" class="tuile lord-tuile ltri-tuile${sel}"
        data-mot="${escapeHTML(m.mot)}" draggable="true"
        aria-label="Choisir le mot ${escapeHTML(m.mot)}"${selected === m.mot ? ' aria-pressed="true"' : ''}>${escapeHTML(m.mot)}</button>`;
		})
		.join('');
	if (!answered) {
		bac.querySelectorAll<HTMLButtonElement>('.ltri-tuile').forEach((btn) => {
			const val = btn.dataset.mot!;
			btn.addEventListener('click', () => selectTuile(val));
			btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
		});
	}
	const verif = sheets().querySelector('#ltriVerif') as HTMLButtonElement;
	verif.disabled = Object.keys(placed).length !== q.mots.length || answered;
	// Une fois la réponse validée, « Vérifier » s'efface : seul « Continuer ▶ »
	// (#ltriActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	verif.hidden = answered;
}

function selectTuile(val: string): void {
	if (answered || placed[val] !== undefined) return;
	selected = selected === val ? null : val; // re-taper désélectionne
	redraw();
}

function poser(val: string, col: 0 | 1): void {
	if (answered || placed[val] !== undefined) return;
	placed[val] = col;
	if (selected === val) selected = null;
	redraw();
}

function retirer(val: string): void {
	if (answered || placed[val] === undefined) return;
	delete placed[val];
	redraw();
}

function verifier(): void {
	const q = questions[idx];
	if (answered || Object.keys(placed).length !== q.mots.length) return;
	answered = true;
	selected = null;
	const correct = q.mots.every((m) => placed[m.mot] === m.cat);
	if (correct) score++;
	redraw(); // fige les tuiles + marque chaque colonne (vert/alerte + ✓/✗)
	const fb = sheets().querySelector('#ltriFeedback') as HTMLElement;
	fb.hidden = false;
	if (correct) {
		fb.innerHTML = `<span class="lqcm-ok">Bravo ! 🎉</span>`;
	} else {
		const bon = ([0, 1] as const)
			.map(
				(col) =>
					`<strong>${escapeHTML(q.categories[col])}</strong> : ${q.mots
						.filter((m) => m.cat === col)
						.map((m) => escapeHTML(m.mot))
						.join(' · ')}`,
			)
			.join('<br>');
		fb.innerHTML = `<span class="lqcm-ko">Le bon classement :</span><div class="ltri-solution">${bon}</div>`;
	}
	const actions = sheets().querySelector('#ltriActions') as HTMLElement;
	actions.hidden = false;
	const last = idx >= questions.length - 1;
	actions.innerHTML = `<button class="sprint-btn" id="ltriNext">${last ? 'Voir mon résultat ▶' : 'Continuer ▶'}</button>`;
	const next = sheets().querySelector('#ltriNext') as HTMLButtonElement;
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
            <button class="sprint-btn" id="ltriAgain">↻ Recommencer</button>
            <button class="sprint-btn ghost" id="ltriBack">Retour</button>
          </div>
        </div>
      </div>
    </div>`;
	sheets()
		.querySelector('#ltriAgain')!
		.addEventListener('click', () => runLeconTri(lesson.id, mode));
	sheets()
		.querySelector('#ltriBack')!
		.addEventListener('click', () => goCategorie(lesson.category));
	if (out.niveauGagne)
		showLevelUp(
			out.niveauGagne,
			out.recompensesNiv,
			out.celeb.length ? () => showCelebration(out.celeb) : undefined,
		);
	else if (out.celeb.length) showCelebration(out.celeb);
}
