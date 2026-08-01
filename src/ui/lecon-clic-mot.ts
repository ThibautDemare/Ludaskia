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
import { joindrePhrase } from '../data/francais/grammaire-clic-mot';
import { bindClicMot, type ClicMotController } from './clic-mot-interaction';
import { bindConsigneTts } from './consigne-tts';
import { goHome } from './navigation';
import {
	leconProgressHTML,
	finishLeconRun,
	renderLeconResult,
	wireNext,
	demarrerRunner,
} from './lecon-runner-shared';
import { enregistrerRunner } from './runner-reprise';
import { capterErreur } from './erreur-capture';
import { monterBoutonAide } from './aide-exercice';

const NB_QUESTIONS = 8;

interface QuestionClicMot {
	tokens: string[];
	cibleIndices: number[];
	consigne: string;
	explication: string;
	parle: string;
	// Nom de la cible au singulier (« le verbe conjugué », « l'article »…) : alimente
	// les aria-labels de correction. Absent ⇒ repli générique « la bonne réponse ».
	cibleLabel?: string;
}

let lesson: LessonDef;
let mode: ExerciseMode | undefined;
let questions: QuestionClicMot[] = [];
let idx = 0;
let score = 0;
let answered = false; // vrai après « Vérifier » : évite un double comptage du score
let ctrl: ClicMotController; // widget de sélection dans la phrase (mutualisé, #466)

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
			cibleLabel: ex.cibleLabel,
		});
		misses = 0;
	}
	return out;
}

/* Nom du runner dans le registre de reprise (#498) — stable, il vit dans les instantanés. */
const RUNNER = 'clicMot';

/* Démarre l'écran sur un jeu de questions donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(
	l: LessonDef,
	m: ExerciseMode | undefined,
	qs: QuestionClicMot[],
	depart = 0,
	pts = 0,
): void {
	lesson = l;
	mode = m;
	questions = qs;
	idx = depart;
	score = pts;
	demarrerRunner({
		runner: RUNNER,
		lesson: l,
		mode: m ?? null,
		etat: () => ({ questions, idx, score }),
		render: renderQuestion,
		aide: 'clicMot',
	});
}

export function runLeconClicMot(lessonId: string, m?: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	const qs = genQuestions(l, NB_QUESTIONS);
	if (!qs.length) {
		goHome();
		return;
	}
	demarrer(l, m, qs);
}

/* Reprise (#498) : on rejoue les questions DÉJÀ TIRÉES à l'index sauvegardé, jamais un
   nouveau tirage — l'enfant retrouve sa leçon, pas une autre. */
enregistrerRunner(RUNNER, (snap) => {
	const l = getLessonById(snap.relaunch.lessonId);
	const qs = snap.questions as QuestionClicMot[];
	if (!l || !qs.length) {
		goHome();
		return;
	}
	demarrer(l, (snap.exerciseMode as ExerciseMode) ?? undefined, qs, snap.idx, snap.score);
});

/* Rendu d'une phrase : le libellé de leçon et la consigne (persistante + TTS)
   encadrent le widget de sélection (mutualisé #466), monté sur `[data-tuile-mount]`.
   Le widget rend la phrase cliquable (+ sa lecture TTS) et gère (dé)sélection,
   marquage ✓/✗ et révélation des cibles ; le runner garde son chrome et l'après-coup
   (journal d'erreurs, XP). */
function renderQuestion(): void {
	answered = false;
	const q = questions[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage lclic-stage">
        <div class="lclic-col">
          <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
          <p class="lclic-consigne"${ttsAttr(q.consigne)}>${escapeHTML(q.consigne)}</p>
          <div data-tuile-mount></div>
          <button class="sprint-btn" id="lclicVerif" disabled>Vérifier</button>
          <div class="sprint-correction" id="lclicFeedback" hidden></div>
          <div class="sprint-actions" id="lclicActions" hidden></div>
        </div>
      </div>
    </div>`;
	const verif = sheets().querySelector('#lclicVerif') as HTMLButtonElement;
	ctrl = bindClicMot(
		sheets(),
		{
			tokens: q.tokens,
			cibleIndices: q.cibleIndices,
			parle: q.parle,
			cibleLabel: q.cibleLabel,
			explication: q.explication,
		},
		{ onState: (hasSelection) => (verif.disabled = !hasSelection) },
	);
	verif.addEventListener('click', () => verifier());
	bindConsigneTts(sheets()); // boutons « Écouter » : consigne (auto) + phrase entière (#42)
	// Bouton « ? » d'aide (#272) : renderQuestion() reconstruit tout le sheets() à chaque
	// question, donc on le re-monte à chaque rendu (l'appel est idempotent).
	monterBoutonAide(sheets().querySelector('.lclic-col'), 'clicMot');
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function verifier(): void {
	if (answered) return;
	const q = questions[idx];
	const juste = ctrl.verify(); // fige + marque ✓/✗ + révèle les cibles + annonce le verdict
	answered = true;
	if (juste) score++;

	// « Vérifier » s'efface : seul « Continuer ▶ » reste (pas deux boutons, #153).
	(sheets().querySelector('#lclicVerif') as HTMLButtonElement).hidden = true;

	if (!juste) journaliser(q, ctrl.selected());

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

/* Journal des erreurs (#391) : une entrée par phrase ratée (l'énoncé, les mots
   choisis, le(s) bon(s) mot(s)). `answered` garantit une seule capture par essai. */
function journaliser(q: QuestionClicMot, choisis: number[]): void {
	const motsCible = [...q.cibleIndices].sort((a, b) => a - b).map((i) => q.tokens[i]);
	const motsChoisis = choisis.map((i) => q.tokens[i]);
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
