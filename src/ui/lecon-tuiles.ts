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
import { depuisTuilesNombre } from '../core/exercise';
import type { ExerciseMode, TuilesSpec } from '../core/exercise';
import { commKey } from '../core/utils';
import { bindConsigneTts } from './consigne-tts';
import { goHome } from './navigation';
import {
	leconProgressHTML,
	finishLeconRun,
	renderLeconResult,
	wireNext,
	demarrerRunner,
	leconTitreHTML,
} from './lecon-runner-shared';
import { enregistrerRunner } from './runner-reprise';
import { bindTuileInteraction } from './tuile-interaction';
import type { TuileController } from './tuile-interaction';
import { monterBoutonAide } from './aide-exercice';
import { capterErreur } from './erreur-capture';
import {
	capterPasse,
	decisionHTML,
	ligneRevelation,
	masquerDecision,
	revelerSolution,
	wirePasser,
} from './lecon-passer';
import { attendueIntervalle } from '../core/erreur-representation';
import { intervalleAPlusieursReponses } from '../core/items';
import { html, type SafeHtml } from '../core/html';

const NB_QUESTIONS = 8;

/* Une question de la série = l'exercice « tuiles » tel quel, moins son étiquette `type`
   (`TuilesSpec`, cf. core/exercise.ts) : énoncé avec `@`, libellé de la bonne tuile, tuiles
   mélangées, texte lu (#42), et — pour une intercalation — les bornes de la bande acceptée
   (#446). Alias plutôt que copie de la forme : c'est le mappeur partagé
   `depuisTuilesNombre` qui remplit tout, sans énumération de champs qu'on pourrait oublier. */
type TuilesQuestion = TuilesSpec;

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: TuilesQuestion[] = [];
let idx = 0;
let score = 0;
let ctrl: TuileController; // widget « tuiles » mutualisé (#345)
// Question TRANCHÉE (validée ou révélée via « Je ne sais pas, montre-moi », #467) : garde
// contre un second enregistrement, et surtout contre une réactivation de « Vérifier » par
// le `onState` du widget, qui reste bavard tant que `verify()` n'a pas figé le widget.
let tranchee = false;

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
		out.push(depuisTuilesNombre(ex)); // conversion partagée (#446), pas de recopie locale
		misses = 0;
	}
	return out;
}

/* Nom du runner dans le registre de reprise (#498) — stable, il vit dans les instantanés. */
const RUNNER = 'tuiles';

/* Démarre l'écran sur un jeu de questions donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(l: LessonDef, m: ExerciseMode, qs: TuilesQuestion[], depart = 0, pts = 0): void {
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
		aide: 'tuiles',
	});
}

export function runLeconTuiles(lessonId: string, m: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	const qs = genQuestions(l, m, NB_QUESTIONS);
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
	const qs = snap.questions as TuilesQuestion[];
	if (!l || !qs.length) {
		goHome();
		return;
	}
	demarrer(l, snap.exerciseMode as ExerciseMode, qs, snap.idx, snap.score);
});

function renderQuestion(): void {
	const q = questions[idx];
	tranchee = false;
	sheets().innerHTML = html`
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        ${leconTitreHTML(lesson)}
        <div data-tuile-mount></div>
        ${decisionHTML('ltuiVerif')}
        <!-- Région live (#467) : porte la RÉVÉLATION d'une question passée. Le widget
             « tuiles » n'annonce rien de son côté (son verdict est visuel : case ✓/✗),
             mais une question révélée à la demande n'a AUCUN autre canal — le focus part
             sur « Continuer ▶ », qui ne dit que « Continuer ». -->
        <p class="sr-only" id="ltuiStatus" role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="sprint-correction" id="ltuiFeedback" hidden></div>
        <div class="sprint-actions" id="ltuiActions" hidden></div>
      </div>
    </div>`.balisage;
	const verif = sheets().querySelector('#ltuiVerif') as HTMLButtonElement;
	// Le widget « tuiles » mutualisé (#345) rend l'énoncé + le bac, gère tap/glisser
	// et l'enveloppe .bignum (#240) ; il (dé)active « Vérifier » via onState.
	ctrl = bindTuileInteraction(
		sheets(),
		{ kind: 'tuile', question: q.question, answer: q.answer, tuiles: q.tuiles, parle: q.parle },
		{
			variant: 'lecon',
			onState: (complete) => {
				if (!tranchee) verif.disabled = !complete;
			},
		},
	);
	verif.addEventListener('click', () => verifier());
	wirePasser(sheets(), passer); // « Je ne sais pas, montre-moi » (#467)
	bindConsigneTts(sheets()); // bouton « Écouter » sur l'énoncé (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), 'tuiles'); // bouton « ? » persistant (#272)
}

/* Correction d'une réponse fausse (#446). Deux réglages, portés par l'intervalle :
   - l'AMORCE passe au singulier indéfini (« Une réponse possible était X. ») dès que l'item
     est corrigé par intervalle — même tournure qu'au sprint, en révision et sur la fiche, une
     seule pour les quatre écrans. « LA bonne réponse était X » suivi de « d'autres auraient
     convenu » se lisait comme une contradiction à 8-9 ans (avis redacteur-contenu-francais) ;
     les leçons en tuiles SANS intervalle gardent leur message d'origine ;
   - la MENTION « D'autres nombres… » dit ce que le mode tuiles cache : la tuile juste était la
     seule POSABLE, mais la question admettait d'autres nombres. Sans elle, l'enfant qui ne joue
     qu'en tuiles ne rencontrerait la pluralité dans aucun mode (le suffixe de consigne n'existe
     qu'en saisie). Seuil de pluriel partagé avec la consigne (`intervalleAPlusieursReponses`) :
     « d'autres nombres » serait faux quand l'intervalle n'admet que deux valeurs, dont la
     tuile juste. */
function correctionHTML(q: TuilesQuestion): SafeHtml {
	const amorce = q.intervalle ? 'Une réponse possible était' : 'La bonne réponse était';
	return html`<span class="lqcm-ko">${amorce} <strong>${q.answer}</strong>.${mentionAutresNombres(q)}</span>`;
}

/* Mention « D'autres nombres… » : partagée par la correction d'une erreur et la révélation
   d'une question passée (#467) — le mode tuiles cache la pluralité dans les deux cas. */
function mentionAutresNombres(q: TuilesQuestion): string {
	return q.intervalle && intervalleAPlusieursReponses(q.intervalle)
		? " D'autres nombres auraient aussi convenu."
		: '';
}

function verifier(): void {
	const verif = sheets().querySelector('#ltuiVerif') as HTMLButtonElement;
	if (tranchee || verif.disabled) return; // déjà tranchée, ou pas de tuile posée
	tranchee = true;
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
			// Intercalation : la BANDE acceptée (« un nombre entre 450 et 465 »), pas la seule
			// tuile juste — c'est ce qui explique au parent pourquoi la tuile posée était fausse
			// sans lui faire croire à une réponse unique (#446).
			attendue: q.intervalle ? attendueIntervalle(q.intervalle) : q.answer,
			lessonId: lesson.id,
			mode: 'lecon',
		});
	}
	// Une fois la réponse validée, le bloc de décision s'efface : seul « Continuer ▶ »
	// (#ltuiActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	masquerDecision(sheets());
	wireNext(
		sheets().querySelector('#ltuiActions') as HTMLElement,
		sheets().querySelector('#ltuiFeedback') as HTMLElement,
		{
			feedbackHTML: correct ? html`<span class="lqcm-ok">Bravo ! 🎉</span>` : correctionHTML(q),
			isLast: idx >= questions.length - 1,
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

/* « Je ne sais pas, montre-moi » (#467) : la bonne tuile est révélée en TEXTE et le bac est
   désarmé, sans passer par `ctrl.verify()` — « Vérifier » est justement encore inactif à ce
   stade (aucune tuile posée), et le figeage marquerait une case vide ✗ en rouge. La question
   compte au dénominateur (score inchangé ⇒ 0 XP) et n'est pas rejouée. */
function passer(): void {
	if (tranchee) return;
	tranchee = true;
	const q = questions[idx];
	// Même énoncé et même attendu que pour une erreur — intercalation comprise : la BANDE
	// acceptée, pas la seule tuile juste (#446). Seule la réponse donnée manque.
	capterPasse({
		text: q.question,
		attendue: q.intervalle ? attendueIntervalle(q.intervalle) : q.answer,
		lessonId: lesson.id,
	});
	// L'index avance AVANT tout affichage : la photo de reprise (#498) est prise quand
	// l'enfant quitte l'écran, et une question déjà révélée ne doit jamais lui être reposée.
	idx++;
	revelerSolution({
		root: sheets(),
		feedback: sheets().querySelector('#ltuiFeedback') as HTMLElement,
		actions: sheets().querySelector('#ltuiActions') as HTMLElement,
		repHTML: html`${ligneRevelation(
			q.intervalle ? 'une réponse possible' : 'la réponse',
			html`${q.answer}`,
		)}${mentionAutresNombres(q)}`,
		annonce: `${q.intervalle ? 'Une réponse possible' : 'La réponse'} : ${q.answer}.`,
		isLast: idx >= questions.length,
		onNext: () => {
			if (idx >= questions.length) finish();
			else renderQuestion();
		},
	});
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
