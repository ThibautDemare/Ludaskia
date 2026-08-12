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
import { capterErreur } from './erreur-capture';
import { entreeTentativePassee } from '../core/erreur-representation';
import {
	capterPasse,
	decisionHTML,
	ligneRevelation,
	masquerDecision,
	revelerSolution,
	wirePasser,
} from './lecon-passer';

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

/* Nom du runner dans le registre de reprise (#498) — stable, il vit dans les instantanés. */
const RUNNER = 'qcmMulti';

/* Démarre l'écran sur un jeu de questions donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(l: LessonDef, m: ExerciseMode, qs: QuestionMulti[], depart = 0, pts = 0): void {
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
	});
}

export function runLeconQcmMulti(lessonId: string, m: ExerciseMode): void {
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
	const qs = snap.questions as QuestionMulti[];
	if (!l || !qs.length) {
		goHome();
		return;
	}
	demarrer(l, snap.exerciseMode as ExerciseMode, qs, snap.idx, snap.score);
});

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
        ${leconTitreHTML(lesson)}
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
        ${decisionHTML('lqmValider', { classeBloc: 'lqcm-multi-decide' })}
        <!-- Région live (#467) : porte la RÉVÉLATION d'une question passée. Le verdict
             ordinaire, lui, est annoncé proposition par proposition (sr-only posé sur chaque
             ligne à la validation) ; une question révélée à la demande n'a AUCUN autre canal,
             le focus partant sur « Continuer ▶ », qui ne dit que « Continuer ». -->
        <p class="sr-only" id="lqmStatus" role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="sprint-correction" id="lqmFeedback" hidden></div>
        <div class="sprint-actions" id="lqmActions" hidden></div>
      </div>
    </div>`;
	sheets()
		.querySelectorAll<HTMLButtonElement>('#lqmChoices .lqcm-multi-choice')
		.forEach((btn) => btn.addEventListener('click', () => toggle(Number(btn.dataset.i), btn)));
	(sheets().querySelector('#lqmValider') as HTMLButtonElement).addEventListener('click', valider);
	wirePasser(sheets(), passer); // « Je ne sais pas, montre-moi » (#467)
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
	// TOUT-OU-RIEN, lu une seule fois (`selectionJuste`) : le même verdict sert au score, au
	// journal et — question passée (#467) — à savoir si la grille cochée était déjà juste.
	const correct = selectionJuste(q, selected);
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
			} else if (!estBonne && cochee) {
				btn.classList.add('is-false'); // coché à tort → rouge + ✗
				if (box) box.innerHTML = icon('x');
				verdict = 'à ne pas cocher';
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
	// Journal des erreurs (#391) : une entrée par question ratée. La garde `validated`
	// ci-dessus assure une seule capture par question.
	if (!correct) journaliserErreurMulti(q, selected);
	// Seul « Continuer ▶ » reste ensuite (pas deux boutons) : tout le bloc de décision
	// s'efface, « Je ne sais pas, montre-moi » compris — la question est tranchée.
	masquerDecision(sheets());

	// Badge tout-ou-rien + synthèse (redondante avec les cases marquées). Échec en AMBRE et
	// libellé NON punitif, distinct de la feature « À revoir » (révision espacée).
	const badge = correct
		? `<span class="lqm-badge lqm-badge--ok">${icon('check-circle')} Bravo ! 🎉</span>`
		: `<span class="lqm-badge lqm-badge--revoir">Presque ! Regarde bien.</span>`;
	const synthese = `<p class="lqm-synthese">Les bonnes propriétés :<br>${listeCorrectesHTML(q)}</p>`;
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

/* Bonnes propriétés, une par LIGNE (pas séparées d'un simple espace) : chacune est une phrase
   complète. Partagé par la synthèse d'une réponse validée et la révélation d'une question
   passée (#467) — deux formulations différentes de la même liste seraient une divergence de
   plus à maintenir. */
function listeCorrectesHTML(q: QuestionMulti): string {
	return q.correctes.map((c) => escapeHTML(c)).join('<br>');
}

/* Verdict TOUT-OU-RIEN de la grille cochée : juste ⇔ toutes les bonnes cochées ET aucune
   mauvaise. Lu proposition par proposition (et non par comparaison d'ensembles) pour coller
   exactement à ce que peint `valider`. Source unique : le score, le journal et la décision
   « cette grille passée était-elle déjà juste ? » (#467) ne peuvent pas se contredire.
   La grille cochée arrive en PARAMÈTRE (et n'est pas lue dans l'état du module) : la règle
   est alors éprouvable sur une grille donnée, sans piloter l'écran. */
function selectionJuste(q: QuestionMulti, coches: ReadonlySet<number>): boolean {
	const bonnes = new Set(q.correctes);
	return q.propositions.every((p, i) => bonnes.has(p) === coches.has(i));
}

/* Propositions cochées, listées dans l'ORDRE D'AFFICHAGE (stable toute la question) et non
   dans l'ordre des clics : le parent relit la grille telle qu'elle était à l'écran. */
function cocheesTexte(q: QuestionMulti, coches: ReadonlySet<number>): string {
	return [...coches]
		.sort((a, b) => a - b)
		.map((i) => q.propositions[i])
		.join(' ; ');
}

/* Entrée de journal d'une grille cochée et FAUSSE — après « Valider », ou après « Je ne sais
   pas, montre-moi » sur une grille déjà cochée (#467) : dans les deux cas l'enfant a proposé
   quelque chose, et le parent doit lire la même chose. */
function journaliserErreurMulti(q: QuestionMulti, coches: ReadonlySet<number>): void {
	capterErreur({
		text: q.consigne,
		figure: q.figure,
		donnee: cocheesTexte(q, coches),
		attendue: q.correctes.join(' ; '),
		lessonId: lesson.id,
		mode: 'lecon',
	});
}

/* Ce qu'une question passée laisse au journal encadrant (#467). La règle des trois cas
   (rien de coché / coché et faux / coché et juste) n'est PAS réécrite ici : elle vit dans
   `entreeTentativePassee` (core/erreur-representation.ts), avec les sous-questions d'un
   problème et la droite graduée. On ne fournit que les FAITS propres au format — une grille
   cochée est une tentative, son verdict est tout-ou-rien — et on route l'entrée obtenue vers
   le bon canal (aveu d'ignorance ou vraie erreur).
   Le score, lui, ne bouge dans aucun cas : demander la réponse n'est pas y répondre. */
function journaliserPasseMulti(q: QuestionMulti, coches: ReadonlySet<number>): void {
	const entree = entreeTentativePassee({
		tentee: coches.size > 0,
		juste: selectionJuste(q, coches),
		donnee: cocheesTexte(q, coches),
	});
	if (!entree) return;
	if (entree.sansTentative) {
		capterPasse({
			text: q.consigne,
			figure: q.figure,
			attendue: q.correctes.join(' ; '),
			lessonId: lesson.id,
		});
		return;
	}
	journaliserErreurMulti(q, coches);
}

/* « Je ne sais pas, montre-moi » (#467) : les bonnes propriétés sont listées EN BLOC sous le
   verdict neutre, sans passer par `valider()` — celui-ci marquerait en rouge (« à ne pas
   cocher ») ou en ambre (« oubliée ») des lignes que l'enfant n'a jamais tranchées, alors que
   « Valider » est justement encore inactif à ce stade (rien de coché). Ce qu'il avait
   éventuellement coché reste visible à côté de la liste, mais n'est plus modifiable. La
   question compte au dénominateur (score inchangé ⇒ 0 XP) et n'est pas rejouée. Ce qu'il
   avait coché décide de l'entrée de journal (cf. journaliserPasseMulti) : « Vérifier » n'est
   inactif que si RIEN n'est coché, donc une grille commencée arrive bien jusqu'ici. */
function passer(): void {
	if (validated) return;
	validated = true;
	const q = questions[idx];
	journaliserPasseMulti(q, selected);
	// L'index avance AVANT tout affichage : la photo de reprise (#498) est prise quand
	// l'enfant quitte l'écran, et une question déjà révélée ne doit jamais lui être reposée.
	idx++;
	revelerSolution({
		root: sheets(),
		feedback: sheets().querySelector('#lqmFeedback') as HTMLElement,
		actions: sheets().querySelector('#lqmActions') as HTMLElement,
		// Réponse EN BLOC (plusieurs phrases) : la ligne l'annonce et s'arrête sur « : ».
		repHTML: ligneRevelation('les bonnes propriétés'),
		extraHTML: `<p class="lqm-synthese">${listeCorrectesHTML(q)}</p>`,
		annonce: `Les bonnes propriétés : ${q.correctes.join(' ; ')}.`,
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
		onAgain: () => runLeconQcmMulti(lesson.id, mode),
	});
}
