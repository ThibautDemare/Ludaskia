/* ============================================================
   Runner QCM d'une leçon (#69) — « une question à la fois ».
   Mode reconnaissance : l'enfant choisit la bonne forme parmi 4 avec
   FEEDBACK IMMÉDIAT (la valeur du QCM, cf. avis pédagogue), sans chrono
   ni pression de temps. À la fin, l'essai est enregistré via
   recordLessonRun → mêmes XP / étoiles / objectifs que la fiche en
   saisie (parité des modes). Pas de reprise auto (ce n'est pas une
   grille, comme le sprint / la révision).
   Réutilise les composants visuels du sprint (.sprint-*).
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { ChoiceView, ExerciseMode, QcmVariante } from '../core/exercise';
import type { Item } from '../core/items';
import { checkItemAnswer, choiceButtonHTML, enonceTexte, figureBlock } from '../core/items';
import { commKey, escapeHTML } from '../core/utils';
import { mathInline } from '../core/fraction-text';
import { ttsAttr } from '../core/tts-text';
import { bindConsigneTts, bindItemTts } from './consigne-tts';
import type { ItemTtsCible } from './consigne-tts';
import { PONCT_MOTS, ponctView } from './ponctuation-view';
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

// Cible de questions ; une leçon offrant moins de variantes en aura moins, sans
// doublon (une conjugaison = 6 personnes), comme la fiche en saisie.
const NB_QUESTIONS = 8;

interface QcmQuestion {
	item: Item; // { text, answer, kind:'text', _lesson }
	choices: string[]; // valeurs comparées (clé de correction)
	choicesView?: ChoiceView[]; // affichage riche optionnel, aligné sur choices (#200)
	empilees?: boolean; // options en colonne (#205, quasi-homophones)
	explication?: string; // justification affichée après la réponse (#110)
	consigne?: string; // consigne renforcée affichée en gras (#203)
	picto?: string; // symbole décoratif doublant la consigne (#203, « ↔ » / « = »)
	ttsItems?: boolean; // haut-parleur sur le mot-cible + chaque option (#203)
	variante?: QcmVariante; // présentation boutons-symboles + cadre pointillé (#204)
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: QcmQuestion[] = [];
let idx = 0;
let score = 0;
let answered = false; // garde anti double-clic sur une même question

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère jusqu'à n questions QCM distinctes, comme genItems pour la fiche : on
   s'arrête après une longue série de tirages sans nouveauté. La clé de dédup inclut
   la RÉPONSE et la FIGURE, pas seulement l'énoncé : pour les leçons à énoncé
   constant mais visuel variable (« Quel est ce solide ? », figures planes…), dédupe
   par texte seul ne laisserait qu'UNE question. */
function genQcmQuestions(l: LessonDef, m: ExerciseMode, n: number): QcmQuestion[] {
	const out: QcmQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'qcm') break; // sécurité : ce runner n'a de sens que pour un QCM
		const key = `${commKey(ex.question)}¦${ex.answer}¦${ex.figure ?? ''}`;
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({
			item: {
				text: ex.question,
				answer: ex.answer,
				kind: 'text',
				figure: ex.figure,
				parle: ex.parle,
				_lesson: l.id,
			},
			choices: ex.choices,
			choicesView: ex.choicesView,
			empilees: ex.choicesEmpilees,
			explication: ex.explication,
			consigne: ex.consigne,
			picto: ex.picto,
			ttsItems: ex.ttsItems,
			variante: ex.variante,
		});
		misses = 0;
	}
	return out;
}

export function runLeconQcm(lessonId: string, m: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	lesson = l;
	mode = m;
	questions = genQcmQuestions(l, m, NB_QUESTIONS);
	if (!questions.length) {
		goHome();
		return;
	}
	idx = 0;
	score = 0;
	setCurrentMode('lecon');
	setCurrentLessonId(lessonId);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false }); // boutons propres au runner
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
	const q = questions[idx];
	const ponct = q.variante === 'ponctuation';
	// `enonceTexte` : échappe + GRAS « **…** » (mot-cible #203) + fractions empilées (#200).
	// Ponctuation (#204) : le trou final est un cadre vide pointillé (PAS un « ? », qui se
	// confondrait avec la réponse) ; sinon le repère « ? » standard du QCM.
	const trou = ponct
		? '<span class="lqcm-ponct-trou" id="lqcmTrou" aria-hidden="true"></span>'
		: '<span class="sprint-blank">?</span>';
	const question = enonceTexte(q.item.text).replace('@', trou);
	const ttsText = q.item.parle ?? q.item.text;
	// Consigne renforcée optionnelle (#203) : ligne en gras précédée d'un picto
	// décoratif (« ↔ » / « = », aria-hidden — le sens est porté par le texte). Elle
	// porte la lecture vocale globale (consigne + phrase) ; l'énoncé n'a alors pas
	// son propre bouton « Écouter ».
	const consigneHTML = q.consigne
		? `<div class="lqcm-consigne"${ttsAttr(ttsText)}>${
				q.picto ? `<span class="lqcm-picto" aria-hidden="true">${escapeHTML(q.picto)}</span>` : ''
			}<span class="lqcm-consigne-txt">${escapeHTML(q.consigne)}</span></div>`
		: '';
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${progressHTML()}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        ${figureBlock(q.item.figure)}
        ${consigneHTML}
        <div class="sprint-q sprint-q-qcm"${q.consigne ? '' : ttsAttr(ttsText)}>${question}</div>
        <div class="sprint-choices${q.empilees ? ' sprint-choices--pile' : ''}${q.ttsItems ? ' lqcm-choices-tts' : ''}${ponct ? ' lqcm-choices-sym' : ''}" id="lqcmChoices">
          ${q.choices
						.map((c, i) => {
							const btn = choiceButtonHTML(c, i, ponct ? ponctView(c) : q.choicesView?.[i]);
							// Les options portant un haut-parleur (#203) sont enveloppées pour
							// accueillir le bouton sans l'imbriquer dans le bouton-choix.
							return q.ttsItems ? `<span class="lqcm-choice-wrap">${btn}</span>` : btn;
						})
						.join('')}
        </div>
        <div class="sprint-correction" id="lqcmFeedback" hidden></div>
        <div class="sprint-actions" id="lqcmActions" hidden></div>
      </div>
    </div>`;
	sheets()
		.querySelectorAll<HTMLButtonElement>('#lqcmChoices .sprint-choice')
		.forEach((btn) => btn.addEventListener('click', () => answer(Number(btn.dataset.i))));
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne/énoncé (#42)
	// TTS individuel (#203) : haut-parleur sur le mot-cible (en gras) et chaque option.
	if (q.ttsItems) {
		const cibles: ItemTtsCible[] = [];
		const cible = sheets().querySelector('.sprint-q-qcm strong');
		if (cible?.textContent) cibles.push({ anchor: cible, texte: cible.textContent });
		sheets()
			.querySelectorAll<HTMLElement>('#lqcmChoices .lqcm-choice-wrap')
			.forEach((wrap, i) => cibles.push({ anchor: wrap, texte: q.choices[i], dans: true }));
		bindItemTts(cibles);
	}
}

function answer(choiceIdx: number): void {
	if (answered) return; // on ne répond qu'une fois
	answered = true;
	const q = questions[idx];
	const chosen = q.choices[choiceIdx];
	const correct = checkItemAnswer(q.item, chosen);
	if (correct) score++;
	// Marquage : la bonne réponse en vert ; le mauvais choix tapé en rouge.
	sheets()
		.querySelectorAll<HTMLButtonElement>('#lqcmChoices .sprint-choice')
		.forEach((b, i) => {
			b.disabled = true;
			if (q.choices[i] === q.item.answer) b.classList.add('correct');
			else if (i === choiceIdx) b.classList.add('wrong');
		});
	const fb = sheets().querySelector('#lqcmFeedback') as HTMLElement;
	fb.hidden = false;
	// Ponctuation (#204) : on NOMME le signe (« point d'exclamation (!) ») plutôt que
	// d'afficher un glyphe nu, peu lisible isolé dans la phrase de feedback.
	const ans = String(q.item.answer);
	const ansHTML =
		q.variante === 'ponctuation'
			? `${escapeHTML(PONCT_MOTS[ans] ?? ans)} (${escapeHTML(ans)})`
			: mathInline(ans);
	fb.innerHTML = correct
		? `<span class="lqcm-ok">Bravo ! 🎉</span>`
		: `<span class="lqcm-ko">La bonne réponse était <strong>${ansHTML}</strong>.</span>`;
	// Justification pédagogique (ex. critère de substitution des homophones, #110).
	// `mathInline` empile aussi les fractions citées dans l'explication (cohérence d'écriture).
	if (q.explication) fb.innerHTML += `<p class="lqcm-expl">${mathInline(q.explication)}</p>`;
	// Ponctuation (#204) : on réinjecte le BON signe dans le trou de la phrase → l'enfant
	// voit sa phrase complétée correctement. Le signe étant toujours la bonne réponse, on
	// le montre « juste » (vert) même après une erreur (le rouge reste sur le bouton tapé).
	if (q.variante === 'ponctuation') {
		const trou = sheets().querySelector('#lqcmTrou');
		if (trou) {
			trou.textContent = ans;
			trou.classList.add('rempli', 'rempli-ok');
			trou.removeAttribute('aria-hidden');
		}
	}
	const actions = sheets().querySelector('#lqcmActions') as HTMLElement;
	actions.hidden = false;
	const last = idx >= questions.length - 1;
	actions.innerHTML = `<button class="sprint-btn" id="lqcmNext">${last ? 'Voir mon résultat ▶' : 'Continuer ▶'}</button>`;
	const next = sheets().querySelector('#lqcmNext') as HTMLButtonElement;
	next.addEventListener('click', () => {
		idx++;
		if (idx >= questions.length) finish();
		else renderQuestion();
	});
	next.focus(); // la touche Entrée enchaîne
}

function finish(): void {
	// Enregistrement commun (parité avec la fiche en saisie). ms inutile en mode leçon.
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
            <button class="sprint-btn" id="lqcmAgain">↻ Recommencer</button>
            <button class="sprint-btn ghost" id="lqcmBack">Retour</button>
          </div>
        </div>
      </div>
    </div>`;
	sheets()
		.querySelector('#lqcmAgain')!
		.addEventListener('click', () => runLeconQcm(lesson.id, mode));
	sheets()
		.querySelector('#lqcmBack')!
		.addEventListener('click', () => goCategorie(lesson.category));
	// Récompenses : modale de niveau (puis confettis), comme les autres écrans.
	if (out.niveauGagne)
		showLevelUp(
			out.niveauGagne,
			out.recompensesNiv,
			out.celeb.length ? () => showCelebration(out.celeb) : undefined,
		);
	else if (out.celeb.length) showCelebration(out.celeb);
}
