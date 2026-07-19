/* ============================================================
   Runner « Clique sur le mot » (#259) — une phrase à la fois.
   L'enfant lit une phrase rendue MOT PAR MOT en boutons cliquables et
   SÉLECTIONNE le(s) mot(s) répondant à la consigne (1re leçon : le verbe
   conjugué). Sélection MULTIPLE réversible : taper un mot le sélectionne, retaper
   le désélectionne ; aucune correction au 1er tap. « Vérifier » (désactivé tant
   qu'aucun mot n'est sélectionné) compare l'ENSEMBLE des indices sélectionnés à
   l'ensemble cible `cibleIndices` par ÉGALITÉ D'ENSEMBLES EXACTE (ni plus, ni
   moins) — au passé composé, le verbe fait 2 mots (auxiliaire + participe) : il
   faut sélectionner les deux.

   Feedback DIFFÉRÉ à la validation : chaque mot sélectionné est figé et marqué
   ✓/✗ (couleur + pastille, jamais la couleur seule) ; le(s) bon(s) mot(s) sont
   RÉVÉLÉS dans la phrase (surlignage vert doux) même en cas d'erreur ; une
   explication courte s'affiche sous la phrase. La consigne reste PERSISTANTE
   pendant toute la recherche, et la phrase entière est lisible en TTS. À la fin :
   recordLessonRun → mêmes XP / étoiles / objectifs que les autres modes (parité).

   Hors sprint (runner d'écran dédié). Structure calquée sur ui/lecon-appariement.ts
   et ui/lecon-probleme.ts (état de module + squelette lecon-runner-shared).
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { ExerciseMode } from '../core/exercise';
import { escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { estPonctuation, joindrePhrase } from '../data/francais/grammaire-clic-mot';
import { bindConsigneTts } from './consigne-tts';
import { setToolbar, hideMenus, goHome, setCurrentMode, setCurrentLessonId } from './navigation';
import {
	leconProgressHTML,
	finishLeconRun,
	renderLeconResult,
	wireNext,
} from './lecon-runner-shared';
import { capterErreur } from './erreur-capture';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';

const NB_QUESTIONS = 8;

interface QuestionClicMot {
	tokens: string[];
	cibleIndices: number[];
	consigne: string;
	explication: string;
	parle: string;
}

let lesson: LessonDef;
let mode: ExerciseMode | undefined;
let questions: QuestionClicMot[] = [];
let idx = 0;
let score = 0;
// Ensemble des indices de tokens sélectionnés (question courante).
const selection = new Set<number>();
let fige = false; // vrai après « Vérifier » : plus aucune (dé)sélection

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère jusqu'à n phrases DISTINCTES (dédup sur la phrase reconstruite). */
function genQuestions(l: LessonDef, n: number): QuestionClicMot[] {
	const out: QuestionClicMot[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode, level: niveauLecon(l) });
		if (ex.type !== 'clicMot') break; // ce runner n'a de sens que pour ce type
		const key = ex.tokens.join('|');
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({
			tokens: ex.tokens,
			cibleIndices: ex.cibleIndices,
			consigne: ex.consigne,
			explication: ex.explication,
			parle: ex.parle,
		});
		misses = 0;
	}
	return out;
}

export function runLeconClicMot(lessonId: string, m?: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	lesson = l;
	mode = m;
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
	maybeAutoAide('clicMot'); // bulle d'aide au 1er lancement (une fois par profil, jamais sous chrono)
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Rendu d'une phrase : chaque MOT est un <button> cliquable ; la ponctuation est
   un <span> inerte. Le libellé de leçon, la consigne (persistante + TTS) et la
   phrase (TTS de l'énoncé entier) encadrent le tout. */
function renderQuestion(): void {
	selection.clear();
	fige = false;
	const q = questions[idx];
	const motsHTML = q.tokens
		.map((t, i) =>
			estPonctuation(t)
				? `<span class="lclic-ponct">${escapeHTML(t)}</span>`
				: `<button type="button" class="lclic-mot" data-i="${i}" aria-pressed="false">${escapeHTML(t)}</button>`,
		)
		.join('');
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage lclic-stage">
        <div class="lclic-col">
          <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
          <p class="lclic-consigne"${ttsAttr(q.consigne)}>${escapeHTML(q.consigne)}</p>
          <div class="lclic-phrase-zone"${ttsAttr(q.parle)}>
            <div class="lclic-phrase">${motsHTML}</div>
          </div>
          <button class="sprint-btn" id="lclicVerif" disabled>Vérifier</button>
          <p class="sr-only" id="lclicStatus" role="status" aria-live="polite" aria-atomic="true"></p>
          <div class="sprint-correction" id="lclicFeedback" hidden></div>
          <div class="sprint-actions" id="lclicActions" hidden></div>
        </div>
      </div>
    </div>`;
	const verif = sheets().querySelector('#lclicVerif') as HTMLButtonElement;
	sheets()
		.querySelectorAll<HTMLButtonElement>('.lclic-mot')
		.forEach((btn) => btn.addEventListener('click', () => toggleMot(btn, verif)));
	verif.addEventListener('click', () => verifier());
	bindConsigneTts(sheets()); // boutons « Écouter » : consigne (auto) + phrase entière (#42)
	// Bouton « ? » d'aide (#272) : renderQuestion() reconstruit tout le sheets() à chaque
	// question, donc on le re-monte à chaque rendu (l'appel est idempotent).
	monterBoutonAide(sheets().querySelector('.lclic-col'), 'clicMot');
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* (Dé)sélectionne un mot (réversible tant que non figé) et met à jour l'état du
   bouton « Vérifier » (actif dès qu'au moins un mot est sélectionné). */
function toggleMot(btn: HTMLButtonElement, verif: HTMLButtonElement): void {
	if (fige) return;
	const i = Number(btn.dataset.i);
	if (selection.has(i)) {
		selection.delete(i);
		btn.classList.remove('is-selected');
		btn.setAttribute('aria-pressed', 'false');
	} else {
		selection.add(i);
		btn.classList.add('is-selected');
		btn.setAttribute('aria-pressed', 'true');
	}
	verif.disabled = selection.size === 0;
}

function verifier(): void {
	if (fige || selection.size === 0) return;
	fige = true;
	const q = questions[idx];
	const cible = new Set(q.cibleIndices);
	// Égalité d'ensembles exacte : même cardinal ET tout sélectionné est cible.
	const juste = selection.size === cible.size && [...selection].every((i) => cible.has(i));
	if (juste) score++;

	// Feedback token par token (mots seulement). Un mot sélectionné est marqué juste
	// (dans la cible) / faux (hors cible) ; un mot-cible NON sélectionné est révélé.
	sheets()
		.querySelectorAll<HTMLButtonElement>('.lclic-mot')
		.forEach((btn) => {
			const i = Number(btn.dataset.i);
			btn.disabled = true;
			btn.classList.remove('is-selected');
			const estCible = cible.has(i);
			const estChoisi = selection.has(i);
			if (estChoisi && estCible) {
				marquer(btn, 'correct', '✓', `${btn.textContent ?? ''}, correct`);
			} else if (estChoisi && !estCible) {
				marquer(btn, 'wrong', '✗', `${btn.textContent ?? ''}, ce n'est pas le verbe`);
			} else if (!estChoisi && estCible) {
				// Bonne réponse révélée dans la phrase (surlignage vert doux), sans pastille.
				btn.classList.add('is-cible');
				btn.setAttribute('aria-label', `${btn.textContent ?? ''}, c'était le verbe`);
			}
		});

	// « Vérifier » s'efface : seul « Continuer ▶ » reste (pas deux boutons, #153).
	(sheets().querySelector('#lclicVerif') as HTMLButtonElement).hidden = true;

	// Annonce du verdict pour lecteur d'écran (live region) : le focus part sur
	// « Continuer », donc rien ne serait lu sans ça (parité avec ui/appariement.ts).
	const statusEl = sheets().querySelector('#lclicStatus');
	if (statusEl) {
		const motsCible = q.cibleIndices.map((i) => q.tokens[i]).join(' ');
		statusEl.textContent = juste
			? 'Bravo, bonne réponse.'
			: `Ce n'est pas ça. La bonne réponse : ${motsCible}. ${q.explication}`;
	}

	if (!juste) journaliser(q, cible);

	const expl = `<p class="lqcm-expl">${escapeHTML(q.explication)}</p>`;
	wireNext(
		sheets().querySelector('#lclicActions') as HTMLElement,
		sheets().querySelector('#lclicFeedback') as HTMLElement,
		{
			feedbackHTML:
				(juste
					? `<span class="lqcm-ok">Bravo ! 🎉</span>`
					: `<span class="lqcm-ko">Regarde le bon mot en vert, puis continue.</span>`) + expl,
			isLast: idx >= questions.length - 1,
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

/* Applique un verdict à un mot : classe d'état, pastille ✓/✗ (double codage
   couleur + signe), et aria-label parlant pour le lecteur d'écran. */
function marquer(
	btn: HTMLButtonElement,
	etat: 'correct' | 'wrong',
	signe: string,
	aria: string,
): void {
	btn.classList.add(etat);
	btn.setAttribute('aria-label', aria);
	const mark = document.createElement('span');
	mark.className = 'lclic-mark';
	mark.setAttribute('aria-hidden', 'true');
	mark.textContent = signe;
	btn.appendChild(mark);
}

/* Journal des erreurs (#391) : une entrée par phrase ratée (l'énoncé, les mots
   choisis, le(s) bon(s) mot(s)). `fige` garantit une seule capture par essai. */
function journaliser(q: QuestionClicMot, cible: Set<number>): void {
	const motsCible = [...cible].sort((a, b) => a - b).map((i) => q.tokens[i]);
	const motsChoisis = [...selection].sort((a, b) => a - b).map((i) => q.tokens[i]);
	capterErreur({
		text: `${q.consigne} « ${joindrePhrase(q.tokens)} »`,
		donnee: motsChoisis.length ? motsChoisis.join(' ') : '(aucun mot juste)',
		attendue: motsCible.join(' '),
		lessonId: lesson.id,
		mode: 'lecon',
	});
}

function finish(): void {
	renderLeconResult({
		out: finishLeconRun(lesson.id, score, questions.length),
		score,
		total: questions.length,
		category: lesson.category,
		onAgain: () => runLeconClicMot(lesson.id, mode),
	});
}
