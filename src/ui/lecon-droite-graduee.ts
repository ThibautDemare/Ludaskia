/* ============================================================
   Runner « Droite graduée » (#256) — placer un nombre, une droite à la fois.
   L'enfant lit la consigne (« Place le nombre 3,47… »), PLACE un repère sur la
   graduation correspondante (tap aimanté OU flèches clavier), puis valide.
   Sélection RÉVERSIBLE tant que « Vérifier » n'a pas été cliqué (aucune correction au
   1er tap) ; « Vérifier » (désactivé tant qu'aucune graduation n'est choisie) compare la
   graduation choisie à la CIBLE stockée.

   La droite est une coquille SVG `role="radiogroup"` (core/figures/droite.ts) : une
   graduation = un `radio`, sélectionnable au doigt (bandes verticales aimantées) ou au
   clavier (flèches ← → / Début / Fin déplacent le repère de graduation en graduation,
   Entrée valide). Le repère mobile corail est dessiné dans le groupe `.dg-repere`.

   Feedback DIFFÉRÉ à la validation : la coquille interactive est remplacée par une figure
   STATIQUE de RÉVÉLATION (repère juste en vert plein ; en cas d'erreur, le repère de
   l'enfant en rouge à tête creuse en plus). Verdict annoncé en live region (a11y). À la
   fin : recordLessonRun → mêmes XP / étoiles / objectifs (parité des modes).

   Hors sprint (runner d'écran dédié). Structure calquée sur ui/lecon-clic-mot.ts.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { ExerciseMode } from '../core/exercise';
import { escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import {
	renderDroiteGraduee,
	renderDroiteGradueeInteractif,
	repereMarkup,
	xDeValeur,
} from '../core/figures/droite';
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

interface QuestionDroite {
	min: number;
	max: number;
	pas: number;
	graduations: { valeur: number; label: string }[];
	bornes: { valeur: number; label: string }[];
	cible: number;
	cibleLabel: string;
	consigne: string;
	explication: string;
	parle: string;
}

let lesson: LessonDef;
let mode: ExerciseMode | undefined;
let questions: QuestionDroite[] = [];
let idx = 0;
let score = 0;
// Index de la graduation choisie (question courante) ou null tant qu'aucun placement.
let selection: number | null = null;
// Index de la graduation FOCUSABLE au clavier (roving tabindex), indépendant de la sélection.
let focusIndex = 0;
let fige = false; // vrai après « Vérifier » : plus aucune (dé)sélection

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère jusqu'à n droites DISTINCTES (dédup sur fenêtre + cible). */
function genQuestions(l: LessonDef, n: number): QuestionDroite[] {
	const out: QuestionDroite[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode, level: niveauLecon(l) });
		if (ex.type !== 'droiteGraduee') break; // ce runner n'a de sens que pour ce type
		const key = `${ex.min}|${ex.max}|${ex.cible}`;
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({
			min: ex.min,
			max: ex.max,
			pas: ex.pas,
			graduations: ex.graduations,
			bornes: ex.bornes,
			cible: ex.cible,
			cibleLabel: ex.cibleLabel,
			consigne: ex.consigne,
			explication: ex.explication,
			parle: ex.parle,
		});
		misses = 0;
	}
	return out;
}

export function runLeconDroiteGraduee(lessonId: string, m?: ExerciseMode): void {
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
	maybeAutoAide('droiteGraduee'); // bulle d'aide au 1er lancement (jamais sous chrono)
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function svgEl(): SVGSVGElement {
	return sheets().querySelector('.dg-interactif') as SVGSVGElement;
}
function hitEls(): SVGElement[] {
	return Array.from(svgEl().querySelectorAll<SVGElement>('.dg-hit'));
}

function renderQuestion(): void {
	selection = null;
	focusIndex = 0;
	fige = false;
	const q = questions[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage dg-stage">
        <div class="dg-col">
          <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
          <p class="dg-consigne" id="dgConsigne"${ttsAttr(q.parle)}>${escapeHTML(q.consigne)}</p>
          <div class="dg-figure" id="dgFigure">${renderDroiteGradueeInteractif({
						min: q.min,
						max: q.max,
						pas: q.pas,
						graduations: q.graduations,
						bornes: q.bornes,
						ariaLabel: q.consigne,
					})}</div>
          <button class="sprint-btn" id="dgVerify" disabled>Vérifier</button>
          <p class="sr-only" id="dgStatus" role="status" aria-live="polite" aria-atomic="true"></p>
          <div class="sprint-correction" id="dgFeedback" hidden></div>
          <div class="sprint-actions" id="dgActions" hidden></div>
        </div>
      </div>
    </div>`;
	const verif = sheets().querySelector('#dgVerify') as HTMLButtonElement;
	const svg = svgEl();
	hitEls().forEach((el) =>
		el.addEventListener('click', () => {
			const i = Number(el.getAttribute('data-index'));
			selectGraduation(i, false);
		}),
	);
	svg.addEventListener('keydown', (e) => onKeydown(e));
	verif.addEventListener('click', () => verifier());
	bindConsigneTts(sheets()); // bouton « Écouter » de la consigne (#42)
	monterBoutonAide(sheets().querySelector('.dg-col'), 'droiteGraduee');
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Sélectionne (ou déplace le repère vers) la graduation `i`. Réversible tant que non
   figé. `focus` déplace le focus clavier sur le radio choisi (navigation au clavier). */
function selectGraduation(i: number, focus: boolean): void {
	if (fige) return;
	const q = questions[idx];
	selection = i;
	focusIndex = i;
	const els = hitEls();
	els.forEach((el, j) => {
		const checked = j === i;
		el.setAttribute('aria-checked', String(checked));
		el.setAttribute('tabindex', checked ? '0' : '-1');
	});
	if (focus) els[i].focus();
	// Repère mobile corail à la graduation choisie.
	const g = svgEl().querySelector('.dg-repere') as SVGGElement;
	g.innerHTML = repereMarkup(xDeValeur(q.graduations[i].valeur, q.min, q.max), 'neutre');
	(sheets().querySelector('#dgVerify') as HTMLButtonElement).disabled = false;
}

/* Clavier (WCAG 2.1.1) : flèches / Début / Fin déplacent le repère de graduation en
   graduation ; Entrée / Espace valident (ou posent le repère au premier appui). */
function onKeydown(e: KeyboardEvent): void {
	if (fige) return;
	const n = questions[idx].graduations.length - 1;
	switch (e.key) {
		case 'ArrowRight':
		case 'ArrowUp':
			selectGraduation(Math.min(n, focusIndex + 1), true);
			break;
		case 'ArrowLeft':
		case 'ArrowDown':
			selectGraduation(Math.max(0, focusIndex - 1), true);
			break;
		case 'Home':
			selectGraduation(0, true);
			break;
		case 'End':
			selectGraduation(n, true);
			break;
		case ' ':
		case 'Spacebar':
			selectGraduation(focusIndex, true);
			break;
		case 'Enter':
			if (selection !== null) verifier();
			break;
		default:
			return; // touche non gérée : ne pas bloquer (Tab, etc.)
	}
	e.preventDefault();
}

function verifier(): void {
	if (fige || selection === null) return;
	fige = true;
	const q = questions[idx];
	const choisie = q.graduations[selection];
	const juste = choisie.valeur === q.cible;
	if (juste) score++;

	// Révélation : figure STATIQUE (plus interactive). Repère juste en vert ; si erreur,
	// le repère de l'enfant en rouge (tête creuse) en plus — double codage forme + couleur.
	const reperes = juste
		? [{ valeur: q.cible, etat: 'correct' as const }]
		: [
				{ valeur: q.cible, etat: 'correct' as const },
				{ valeur: choisie.valeur, etat: 'faux' as const },
			];
	(sheets().querySelector('#dgFigure') as HTMLElement).innerHTML = renderDroiteGraduee({
		min: q.min,
		max: q.max,
		pas: q.pas,
		bornes: q.bornes,
		reperes,
		desc: juste
			? 'La droite graduée avec le repère au bon endroit.'
			: 'La droite graduée avec le bon repère en vert et ton repère en rouge.',
	});

	// « Vérifier » s'efface : seul « Continuer ▶ » reste (#153).
	(sheets().querySelector('#dgVerify') as HTMLButtonElement).hidden = true;

	// Annonce du verdict pour lecteur d'écran (le focus part sur « Continuer »).
	const statusEl = sheets().querySelector('#dgStatus');
	if (statusEl) {
		statusEl.textContent = juste
			? "Bravo, c'est le bon endroit."
			: `Ce n'est pas ça. Il fallait placer ${q.cibleLabel} ; tu as placé ${choisie.label}.`;
	}

	if (!juste) journaliser(q, choisie.label);

	const expl = `<p class="lqcm-expl">${escapeHTML(q.explication)}</p>`;
	wireNext(
		sheets().querySelector('#dgActions') as HTMLElement,
		sheets().querySelector('#dgFeedback') as HTMLElement,
		{
			feedbackHTML:
				(juste
					? `<span class="lqcm-ok">Bravo ! 🎉</span>`
					: `<span class="lqcm-ko">Regarde le bon repère en vert, puis continue.</span>`) + expl,
			isLast: idx >= questions.length - 1,
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

/* Journal des erreurs (#391) : une entrée par droite ratée. `fige` garantit une seule
   capture par essai. */
function journaliser(q: QuestionDroite, choisieLabel: string): void {
	capterErreur({
		text: q.consigne,
		donnee: choisieLabel,
		attendue: q.cibleLabel,
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
		onAgain: () => runLeconDroiteGraduee(lesson.id, mode),
	});
}
