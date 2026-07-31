/* ============================================================
   Runner « appariement » d'une leçon (#392) — relier des paires, « une manche à
   la fois ». L'enfant relie chaque mot d'une colonne gauche à son correspondant
   de la colonne droite (familles de mots : base ↔ dérivé), par des LIGNES de
   liaison. Interaction tap en deux temps (fiable au doigt et clavier) + glisser
   en appoint, déléguée au widget mutualisé ui/appariement.ts. Feedback DIFFÉRÉ à
   la validation : chaque lien est figé et marqué ✓/✗ ; les bonnes réponses sont
   révélées en texte sous le widget. À la fin, l'essai est enregistré via
   recordLessonRun → mêmes XP / étoiles / objectifs que les autres modes.

   Structure calquée sur le runner « ranger par thème » (ui/lecon-tri.ts).
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
import { bindAppariement } from './appariement';
import type { TuileController } from './tuile-interaction';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';
import { capterErreur } from './erreur-capture';
import { pairesErreur } from '../core/erreur-representation';

const NB_MANCHES = 5;

interface MancheAppariement {
	question: string;
	paires: { gauche: string; droite: string }[];
	intrus: string[];
}

let lesson: LessonDef;
let mode: ExerciseMode;
let manches: MancheAppariement[] = [];
let idx = 0;
let score = 0;
let ctrl: TuileController;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Génère les manches d'une session. Chemin PRIVILÉGIÉ : `generateSession` tire la
   session entière SANS RÉPÉTITION inter-manches (garantie portée par la fabrique, qui
   seule connaît la banque). Repli HISTORIQUE (types sans `generateSession`) : des
   `generate()` indépendants dédupliqués au mieux sur l'ensemble des bases de la manche. */
function genManches(l: LessonDef, m: ExerciseMode, n: number): MancheAppariement[] {
	const opts = { mode: m, level: niveauLecon(l) };
	const session = l.exerciseType.generateSession?.(n, opts);
	if (session) {
		const out: MancheAppariement[] = [];
		for (const ex of session) {
			if (ex.type !== 'appariement') continue; // ce runner n'a de sens que pour ce type
			out.push({ question: ex.question, paires: ex.paires, intrus: ex.intrus ?? [] });
		}
		return out;
	}
	const out: MancheAppariement[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate(opts);
		if (ex.type !== 'appariement') break; // ce runner n'a de sens que pour ce type
		const key = [...ex.paires.map((p) => p.gauche)].sort((a, b) => a.localeCompare(b)).join('|');
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({ question: ex.question, paires: ex.paires, intrus: ex.intrus ?? [] });
		misses = 0;
	}
	return out;
}

export function runLeconAppariement(lessonId: string, m: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	lesson = l;
	mode = m;
	manches = genManches(l, m, NB_MANCHES);
	if (!manches.length) {
		goHome();
		return;
	}
	idx = 0;
	score = 0;
	setCurrentMode('lecon');
	setCurrentLessonId(lessonId);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false });
	renderManche();
	maybeAutoAide('appariement'); // bulle d'aide au 1er lancement (une fois par profil)
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderManche(): void {
	const q = manches[idx];
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, manches.length)}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        <p class="sprint-q lapp-titre"${ttsAttr(q.question)}>${escapeHTML(q.question)}</p>
        <div data-tuile-mount></div>
        <button class="sprint-btn" id="lappVerif" disabled>Vérifier</button>
        <div class="sprint-correction" id="lappFeedback" hidden></div>
        <div class="sprint-actions" id="lappActions" hidden></div>
      </div>
    </div>`;
	const verif = sheets().querySelector('#lappVerif') as HTMLButtonElement;
	ctrl = bindAppariement(
		sheets(),
		{ question: q.question, paires: q.paires, intrus: q.intrus },
		{ variant: 'lecon', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => verifier());
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), 'appariement'); // bouton « ? » (#272)
}

function verifier(): void {
	const verif = sheets().querySelector('#lappVerif') as HTMLButtonElement;
	if (verif.disabled) return; // tous les mots de gauche ne sont pas reliés
	const q = manches[idx];
	const correct = ctrl.verify(); // fige + marque chaque lien (✓/✗)
	if (correct) score++;
	else journaliser(q);
	// « Vérifier » s'efface : seul « Continuer ▶ » reste (pas deux boutons, #153).
	verif.hidden = true;
	let feedbackHTML: string;
	if (correct) {
		feedbackHTML = `<span class="lqcm-ok">Bravo ! 🎉</span>`;
	} else {
		const bon = q.paires
			.map((p) => `${escapeHTML(p.gauche)} → ${escapeHTML(p.droite)}`)
			.join('<br>');
		feedbackHTML = `<span class="lqcm-ko">Les bonnes paires :</span><div class="lapp-solution">${bon}</div>`;
	}
	wireNext(
		sheets().querySelector('#lappActions') as HTMLElement,
		sheets().querySelector('#lappFeedback') as HTMLElement,
		{
			feedbackHTML,
			isLast: idx >= manches.length - 1,
			onNext: () => {
				idx++;
				if (idx >= manches.length) finish();
				else renderManche();
			},
		},
	);
}

/* Journal des erreurs (#391) : une entrée par manche ratée, restreinte aux paires
   FAUSSES (cf. pairesErreur). Une seule capture par manche : « Vérifier » disparaît
   juste après la correction. */
function journaliser(q: MancheAppariement): void {
	const rep = ctrl.reponse?.();
	if (rep?.kind !== 'appariement') return; // widget monté sans représentation d'erreur
	const { donnee, attendue } = pairesErreur(rep.liens, q.paires);
	capterErreur({ text: q.question, donnee, attendue, lessonId: lesson.id, mode: 'lecon' });
}

function finish(): void {
	renderLeconResult({
		out: finishLeconRun(lesson.id, score, manches.length),
		score,
		total: manches.length,
		category: lesson.category,
		onAgain: () => runLeconAppariement(lesson.id, mode),
	});
}
