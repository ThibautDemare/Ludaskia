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
import { motsMalClasses } from '../core/erreur-representation';

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
let ctrl: TuileController; // widget « ranger par thème » mutualisé (#345)

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

function renderQuestion(): void {
	const q = questions[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        <p class="sprint-q lord-consigne"${ttsAttr(q.question)}>${escapeHTML(q.question)}</p>
        <div data-tuile-mount></div>
        <button class="sprint-btn" id="ltriVerif" disabled>Vérifier</button>
        <div class="sprint-correction" id="ltriFeedback" hidden></div>
        <div class="sprint-actions" id="ltriActions" hidden></div>
      </div>
    </div>`;
	const verif = sheets().querySelector('#ltriVerif') as HTMLButtonElement;
	// Widget « ranger par thème » mutualisé (#345) : deux colonnes + bac, tap en deux
	// temps / glisser, figeage et marques ✓/✗ par tuile à la validation.
	ctrl = bindTuileInteraction(
		sheets(),
		{ kind: 'tri', question: q.question, categories: q.categories, mots: q.mots },
		{ variant: 'lecon', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => verifier());
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), 'tri'); // bouton « ? » persistant (#272)
}

function verifier(): void {
	const verif = sheets().querySelector('#ltriVerif') as HTMLButtonElement;
	if (verif.disabled) return; // toutes les tuiles ne sont pas rangées
	const q = questions[idx];
	const correct = ctrl.verify(); // fige + marque chaque tuile (✓/✗)
	if (correct) score++;
	else {
		// Journal des erreurs (#391) : UNE entrée par mot MAL classé (colonne choisie vs
		// bonne colonne), pour cibler le mot précis à revoir. Une seule capture par essai
		// (bouton figé après validation, puis question suivante).
		const rep = ctrl.reponse();
		const placement = rep.kind === 'tri' ? rep.placement : {};
		for (const mal of motsMalClasses(q.mots, q.categories, placement)) {
			capterErreur({
				text: `Ranger le mot « ${mal.mot} »`,
				donnee: mal.donnee,
				attendue: mal.attendue,
				lessonId: lesson.id,
				mode: 'lecon',
			});
		}
	}
	// Une fois la réponse validée, « Vérifier » s'efface : seul « Continuer ▶ »
	// (#ltriActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	verif.hidden = true;
	let feedbackHTML: string;
	if (correct) {
		feedbackHTML = `<span class="lqcm-ok">Bravo ! 🎉</span>`;
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
		feedbackHTML = `<span class="lqcm-ko">Le bon classement :</span><div class="ltri-solution">${bon}</div>`;
	}
	wireNext(
		sheets().querySelector('#ltriActions') as HTMLElement,
		sheets().querySelector('#ltriFeedback') as HTMLElement,
		{
			feedbackHTML,
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
		onAgain: () => runLeconTri(lesson.id, mode),
	});
}
