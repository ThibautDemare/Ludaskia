/* ============================================================
   Runner QCM MULTI-SÉLECTION d'une leçon (#253) — « coche TOUTES les propriétés ».
   Une figure codée + EXACTEMENT 4 affirmations en boutons-toggles ; l'enfant coche
   celles qui s'appliquent, puis « Valider ». Correction TOUT-OU-RIEN (juste ⇔ toutes
   les bonnes cochées ET aucune mauvaise), réponse LUE dans l'item (`correctes`, jamais
   recalculée). À la fin, l'essai est enregistré via recordLessonRun → mêmes XP / étoiles
   / objectifs que les autres modes (parité).

   Choix d'accessibilité (specialiste-troubles-apprentissage) :
   - ORDRE des 4 propositions STABLE toute la question (jamais réordonné après un clic :
     un enfant dyspraxique planifie ses appuis par position) ;
   - TOUTE LA LIGNE est la cible tactile (le <button aria-pressed> couvre la ligne) ;
     l'état coché est porté par aria-pressed + le pictogramme case pleine (pas la couleur
     seule) ;
   - contre le réflexe « QCM = un seul choix » : la consigne « Coche TOUTES… » reste
     visible pendant tout le cochage, et les cases carrées (☐/☑) se distinguent d'un QCM
     mono ;
   - tour de 6 QUESTIONS (pas 8) : amortit le « tout-juste » conjonctif empilé sur l'étoile.

   Réutilise la coquille des runners (.sprint-stage, .sprint-q, figureBlock, barre de
   progression, lecon-runner-shared) et le TTS (bindConsigneTts / bindItemTts).
   Structure calquée sur ui/lecon-qcm.ts et ui/lecon-appariement.ts.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { ExerciseMode } from '../core/exercise';
import { figureBlock } from '../core/items';
import { escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { icon } from './icon';
import { bindConsigneTts, bindItemTts } from './consigne-tts';
import type { ItemTtsCible } from './consigne-tts';
import { setToolbar, hideMenus, goHome, setCurrentMode, setCurrentLessonId } from './navigation';
import {
	leconProgressHTML,
	finishLeconRun,
	renderLeconResult,
	wireNext,
} from './lecon-runner-shared';
import { capterErreur } from './erreur-capture';

// Tour plus court que le QCM mono (8) : anti-empilement d'étoile sur un « tout-ou-rien »
// conjonctif (gamification-enfant).
const NB_QUESTIONS = 6;

interface QuestionMulti {
	figure?: string;
	propositions: string[]; // ordre STABLE (jamais réordonné)
	correctes: string[]; // sous-ensemble VRAI stocké
	consigne: string;
	parle: string;
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: QuestionMulti[] = [];
let idx = 0;
let score = 0;
let selected = new Set<number>(); // index des propositions cochées (question courante)
let validated = false;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère jusqu'à n questions multi distinctes (dédup par figure + propositions + bonnes). */
function genQuestions(l: LessonDef, m: ExerciseMode, n: number): QuestionMulti[] {
	const out: QuestionMulti[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'qcmMulti') break; // ce runner n'a de sens que pour ce type
		const key = `${ex.figure ?? ''}¦${[...ex.propositions].sort().join('|')}¦${[...ex.correctes].sort().join('|')}`;
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({
			figure: ex.figure,
			propositions: ex.propositions,
			correctes: ex.correctes,
			consigne: ex.question,
			parle: ex.parle ?? ex.question,
		});
		misses = 0;
	}
	return out;
}

export function runLeconQcmMulti(lessonId: string, m: ExerciseMode): void {
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

function renderQuestion(): void {
	validated = false;
	selected = new Set<number>();
	const q = questions[idx];
	// Consigne PERSISTANTE et emphatique (« Coche TOUTES… ») : reste affichée pendant tout
	// le cochage (contre le réflexe « un seul choix »). « toutes » est mis en gras.
	const consigneHTML = q.consigne.replace(/toutes/i, (m) => `<strong>${m}</strong>`);
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        ${figureBlock(q.figure)}
        <p class="sprint-q lqcm-multi-consigne"${ttsAttr(q.parle)}>${consigneHTML}</p>
        <div class="sprint-choices sprint-choices--pile lqcm-multi-choices" id="lqmChoices" role="group" aria-label="${escapeHTML(q.consigne)}">
          ${q.propositions
						.map(
							(p, i) => `<div class="lqcm-multi-wrap">
            <button type="button" class="lqcm-multi-choice" aria-pressed="false" data-i="${i}">
              <span class="lqcm-multi-box" aria-hidden="true">${icon('square')}</span>
              <span class="lqcm-multi-lab">${escapeHTML(p)}</span>
            </button>
          </div>`,
						)
						.join('')}
        </div>
        <button class="sprint-btn lqcm-multi-valider" id="lqmValider" disabled>Vérifier</button>
        <div class="sprint-correction" id="lqmFeedback" hidden></div>
        <div class="sprint-actions" id="lqmActions" hidden></div>
      </div>
    </div>`;
	sheets()
		.querySelectorAll<HTMLButtonElement>('#lqmChoices .lqcm-multi-choice')
		.forEach((btn) => btn.addEventListener('click', () => toggle(Number(btn.dataset.i), btn)));
	(sheets().querySelector('#lqmValider') as HTMLButtonElement).addEventListener('click', valider);
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	// TTS par proposition (#203) : haut-parleur ajouté DANS chaque ligne, après le toggle.
	const cibles: ItemTtsCible[] = [];
	sheets()
		.querySelectorAll<HTMLElement>('#lqmChoices .lqcm-multi-wrap')
		.forEach((wrap, i) => cibles.push({ anchor: wrap, texte: q.propositions[i], dans: true }));
	bindItemTts(cibles);
}

function toggle(i: number, btn: HTMLButtonElement): void {
	if (validated) return;
	const coche = !selected.has(i);
	if (coche) selected.add(i);
	else selected.delete(i);
	btn.setAttribute('aria-pressed', String(coche));
	btn.classList.toggle('is-selected', coche);
	const box = btn.querySelector('.lqcm-multi-box');
	if (box) box.innerHTML = icon(coche ? 'check-square' : 'square');
	(sheets().querySelector('#lqmValider') as HTMLButtonElement).disabled = selected.size === 0;
}

function valider(): void {
	const valBtn = sheets().querySelector('#lqmValider') as HTMLButtonElement;
	if (valBtn.disabled || validated) return; // rien de coché, ou déjà validé
	validated = true;
	const q = questions[idx];
	const bonnes = new Set(q.correctes);
	// TOUT-OU-RIEN : juste ⇔ toutes les bonnes cochées ET aucune mauvaise.
	let correct = true;
	sheets()
		.querySelectorAll<HTMLButtonElement>('#lqmChoices .lqcm-multi-choice')
		.forEach((btn, i) => {
			btn.disabled = true;
			btn.classList.remove('is-selected');
			const estBonne = bonnes.has(q.propositions[i]);
			const cochee = selected.has(i);
			const box = btn.querySelector('.lqcm-multi-box');
			// Verdict annoncé au lecteur d'écran (la case est `aria-hidden` → l'état ne passe
			// pas par le seul pictogramme ni la seule couleur). sr-only par bouton.
			let verdict = '';
			if (estBonne && cochee) {
				btn.classList.add('is-hit'); // coché à raison → vert + ✓
				if (box) box.innerHTML = icon('check');
				verdict = 'correcte';
			} else if (estBonne && !cochee) {
				btn.classList.add('is-missed'); // oublié → ambre (pas rouge), picto « ? » distinct
				if (box) box.innerHTML = icon('question');
				verdict = 'oubliée, il fallait la cocher';
				correct = false;
			} else if (!estBonne && cochee) {
				btn.classList.add('is-false'); // coché à tort → rouge + ✗
				if (box) box.innerHTML = icon('x');
				verdict = 'à ne pas cocher';
				correct = false;
			}
			// décoché à raison → neutre (aucune classe, aucune annonce)
			if (verdict) {
				const sr = document.createElement('span');
				sr.className = 'sr-only';
				sr.textContent = ` (${verdict})`;
				btn.appendChild(sr);
			}
		});
	if (correct) score++;
	// Journal des erreurs (#391) : une entrée par question ratée. Les propositions cochées
	// sont listées dans l'ORDRE D'AFFICHAGE (stable toute la question), pas dans l'ordre des
	// clics : le parent relit la grille telle qu'elle était à l'écran. La garde `validated`
	// ci-dessus assure une seule capture par question.
	if (!correct) {
		capterErreur({
			text: q.consigne,
			figure: q.figure,
			donnee: [...selected]
				.sort((a, b) => a - b)
				.map((i) => q.propositions[i])
				.join(' ; '),
			attendue: q.correctes.join(' ; '),
			lessonId: lesson.id,
			mode: 'lecon',
		});
	}
	valBtn.hidden = true; // seul « Continuer ▶ » reste ensuite (pas deux boutons)

	// Badge tout-ou-rien + synthèse (redondante avec les cases marquées). Échec en AMBRE et
	// libellé NON punitif, distinct de la feature « À revoir » (révision espacée).
	const badge = correct
		? `<span class="lqm-badge lqm-badge--ok">${icon('check-circle')} Bravo ! 🎉</span>`
		: `<span class="lqm-badge lqm-badge--revoir">Presque ! Regarde bien.</span>`;
	// Items sur des lignes séparées (pas un simple espace) — chaque bonne propriété est une
	// phrase complète.
	const liste = q.correctes.map((c) => escapeHTML(c)).join('<br>');
	const synthese = `<p class="lqm-synthese">Les bonnes propriétés :<br>${liste}</p>`;
	wireNext(
		sheets().querySelector('#lqmActions') as HTMLElement,
		sheets().querySelector('#lqmFeedback') as HTMLElement,
		{
			feedbackHTML: `${badge}${synthese}`,
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
		onAgain: () => runLeconQcmMulti(lesson.id, mode),
	});
}
