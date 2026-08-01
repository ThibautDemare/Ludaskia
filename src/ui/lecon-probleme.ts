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
import { niveauLecon } from '../core/niveau-actif';
import type { ExerciseMode, ProblemeEtape, ProbLexique } from '../core/exercise';
import { figureBlock } from '../core/items';
import { commKey, escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { bindConsigneTts } from './consigne-tts';
import { brouillonHTML, bindBrouillon } from './brouillon';
import { setToolbar, hideMenus, goHome, setCurrentMode, setCurrentLessonId } from './navigation';
import {
	leconProgressHTML,
	finishLeconRun,
	renderLeconResult,
	wireNext,
	declarerSessionRunner,
	enregistrerRunner,
} from './lecon-runner-shared';
import { capterErreur } from './erreur-capture';

const NB_QUESTIONS = 8;

// Lexique d'affichage par défaut : vocabulaire « problème » de #199. Une leçon qui
// réutilise ce runner (division avec reste, #95) le surcharge via `probLexique`.
const LEX_DEFAUT: ProbLexique = { nom: 'Problème', nomPluriel: 'problèmes', badgeEtape: true };

export interface ProbQuestion {
	enonce: string;
	etapes: ProblemeEtape[];
	parle: string;
	figure?: string;
	explication?: string; // stratégie affichée APRÈS la réponse (#252) — optionnelle
}

/* Board PUR d'un problème (#419) : énoncé (+ figure) + sous-questions saisissables.
   Extrait du runner live (renderQuestion l'appelle) POUR ÊTRE RÉUTILISÉ à l'identique
   par la galerie visuelle (ui/galerie.ts) — même markup des deux côtés, donc un
   snapshot y détecte les régressions du VRAI rendu. Fonction pure, SANS effet de bord
   (pas de TTS branché, pas de listener) : l'entrée live ajoute ces effets autour. */
export function renderProblemeBoardHTML(q: ProbQuestion, lex: ProbLexique = LEX_DEFAUT): string {
	const multi = q.etapes.length > 1;
	const etapesHTML = q.etapes
		.map(
			(et, i) => `<div class="prob-etape">
        ${multi && lex.badgeEtape !== false ? `<span class="prob-num">Étape ${i + 1}</span>` : ''}
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
	return `<p class="prob-enonce" data-tts-pos="start"${ttsAttr(q.parle)}>${escapeHTML(q.enonce)}</p>
          ${figureBlock(q.figure)}
          <div class="prob-etapes${multi ? ' prob-etapes-multi' : ''}">${etapesHTML}</div>`;
}

/* Live region (sr-only) à insérer dans le board par l'APPELANT (runner leçon ET
   révision) : `corrigerEtapesProbleme` y annonce le verdict non-visuel (#466). Hors
   du board PUR (renderProblemeBoardHTML), qui reste réutilisé tel quel par la galerie. */
export const PROB_STATUS_HTML =
	'<p class="sr-only" id="probStatus" role="status" aria-live="polite" aria-atomic="true"></p>';

/* Corrige les sous-questions d'un problème DANS le DOM (partagé runner ↔ révision,
   #466) : marque chaque `.prob-input` (couleur + classe) et sa `.prob-mark` (glyphe
   ✓/✗ + solution révélée + `aria-label` explicite, car le glyphe n'est pas fiablement
   vocalisé), annonce un résumé dans la live region `#probStatus` si l'appelant en a
   posé une, et renvoie si TOUTES les étapes sont justes. `onErreur` (optionnel) est
   appelé par sous-question ratée — seul le runner de leçon journalise (#391) ; la
   révision l'omet, comme les autres items de sa session. Virgule française tolérée
   (réponses décimales CM1, #255) ; le `data-answer` reste numérique. */
export function corrigerEtapesProbleme(
	root: ParentNode,
	etapes: ProblemeEtape[],
	onErreur?: (etape: ProblemeEtape, saisie: string) => void,
): boolean {
	const inputs = [...root.querySelectorAll<HTMLInputElement>('.prob-input')];
	let nbBon = 0;
	inputs.forEach((inp) => {
		const i = Number(inp.dataset.i);
		const attendu = etapes[i].answer;
		const saisie = inp.value.trim();
		const correct = Number(saisie.replace(',', '.')) === attendu;
		inp.disabled = true;
		inp.classList.add(correct ? 'correct' : 'wrong');
		const attenduTexte = String(attendu).replace('.', ',');
		const mark = root.querySelector(`.prob-mark[data-for="${i}"]`) as HTMLElement;
		mark.className = 'prob-mark ' + (correct ? 'correct' : 'wrong');
		mark.innerHTML = correct ? '✓' : `✗ <span class="sol">→ ${escapeHTML(attenduTexte)}</span>`;
		mark.setAttribute(
			'aria-label',
			correct ? 'correct' : `incorrect, la bonne réponse était ${attenduTexte}`,
		);
		if (correct) nbBon++;
		else onErreur?.(etapes[i], saisie);
	});
	const status = root.querySelector('#probStatus');
	if (status) {
		status.textContent =
			nbBon === inputs.length
				? 'Bravo, toutes les réponses sont justes.'
				: `${nbBon} bonne${nbBon > 1 ? 's' : ''} réponse${nbBon > 1 ? 's' : ''} sur ${inputs.length}.`;
	}
	return nbBon === inputs.length;
}

let lesson: LessonDef;
let probMode: ExerciseMode | undefined; // mode retenu (#95) — passé à la génération et conservé au « Recommencer »
let lex: ProbLexique = LEX_DEFAUT;
let questions: ProbQuestion[] = [];
let idx = 0;
let score = 0;
let answered = false;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère jusqu'à n problèmes distincts (dédup par énoncé), comme genQcmQuestions.
   `m` (#95) : mode retenu, transmis à la génération (un type mono-mode l'ignore). */
function genQuestions(l: LessonDef, n: number, m?: ExerciseMode): ProbQuestion[] {
	const out: ProbQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'probleme') break; // ce runner n'a de sens que pour un problème
		const key = commKey(ex.enonce);
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({
			enonce: ex.enonce,
			etapes: ex.etapes,
			parle: ex.parle,
			figure: ex.figure,
			explication: ex.explication,
		});
		misses = 0;
	}
	return out;
}

/* Nom du runner dans le registre de reprise (#498) — stable, il vit dans les instantanés. */
const RUNNER = 'probleme';

/* Démarre l'écran sur un jeu de problèmes donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(
	l: LessonDef,
	m: ExerciseMode | undefined,
	qs: ProbQuestion[],
	depart = 0,
	pts = 0,
): void {
	lesson = l;
	probMode = m;
	lex = l.exerciseType.probLexique ?? LEX_DEFAUT;
	questions = qs;
	idx = depart;
	score = pts;
	setCurrentMode('lecon');
	setCurrentLessonId(l.id);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false });
	declarerSessionRunner({
		runner: RUNNER,
		lesson: l,
		exerciseMode: m ?? null,
		etat: () => ({ questions, idx, score }),
	});
	renderQuestion();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function runLeconProbleme(lessonId: string, m?: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	const qs = genQuestions(l, NB_QUESTIONS, m);
	if (!qs.length) {
		goHome();
		return;
	}
	demarrer(l, m, qs);
}

/* Reprise (#498) : on rejoue les problèmes DÉJÀ TIRÉS à l'index sauvegardé, jamais un
   nouveau tirage — l'enfant retrouve sa leçon, pas une autre. */
enregistrerRunner(RUNNER, (snap) => {
	const l = getLessonById(snap.relaunch.lessonId);
	const qs = snap.questions as ProbQuestion[];
	if (!l || !qs.length) {
		goHome();
		return;
	}
	demarrer(l, (snap.exerciseMode as ExerciseMode) ?? undefined, qs, snap.idx, snap.score);
});

function renderQuestion(): void {
	answered = false;
	const q = questions[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length, lex.nom)}
      <div class="sprint-stage prob-stage">
        <div class="prob-col">
          <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
          ${renderProblemeBoardHTML(q, lex)}
          ${brouillonHTML()}
          <button class="sprint-btn" id="probVerif">Vérifier</button>
          ${PROB_STATUS_HTML}
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
	// Correction partagée avec la révision (#466) : marque chaque étape (✓/✗ + solution
	// + aria-label) et annonce le résumé dans #probStatus. Le runner journalise en plus
	// chaque sous-question ratée (#391) via le callback — une seule capture par essai
	// (garde `answered`).
	const toutJuste = corrigerEtapesProbleme(sheets(), q.etapes, (etape, saisie) =>
		capterErreur({
			text: etape.question,
			donnee: saisie,
			attendue: String(etape.answer),
			lessonId: lesson.id,
			mode: 'lecon',
		}),
	);
	if (toutJuste) score++;
	// Une fois la réponse validée, « Vérifier » s'efface : seul « Continuer ▶ »
	// (#probActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	(sheets().querySelector('#probVerif') as HTMLButtonElement).hidden = true;
	// Explication de stratégie (#252, ex. le « pont » d'une durée avec retenue) : affichée
	// après la réponse quand la leçon la fournit (contenu de confiance, échappé par sûreté).
	const expl = q.explication ? `<p class="lqcm-expl">${escapeHTML(q.explication)}</p>` : '';
	wireNext(
		sheets().querySelector('#probActions') as HTMLElement,
		sheets().querySelector('#probFeedback') as HTMLElement,
		{
			feedbackHTML:
				(toutJuste
					? `<span class="lqcm-ok">Bravo ! 🎉</span>`
					: `<span class="lqcm-ko">Regarde la bonne réponse, puis continue.</span>`) + expl,
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
		onAgain: () => runLeconProbleme(lesson.id, probMode),
		lexique: lex,
	});
}
