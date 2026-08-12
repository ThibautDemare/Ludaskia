/* ============================================================
   Runner « ranger une suite » (#108, #448) — « une question à la fois ».
   L'enfant range 4 à 5 tuiles dans une rangée de cases NUMÉROTÉES : il tape une
   tuile du bac → elle se place à la suite ; il tape une tuile posée → elle
   repart au bac (les suivantes se re-tassent). Glisser-déposer du bac vers la
   rangée en appoint (souris/desktop). Feedback immédiat case par case + bon ordre
   montré, sans chrono. À la fin, l'essai est enregistré via recordLessonRun →
   mêmes XP / étoiles / objectifs que les autres modes (parité #69).

   AGNOSTIQUE de ce qu'on range : des MOTS (ordre alphabétique, vocabulaire #108)
   ou des NOMBRES (numération « je range », #448 — sens croissant/décroissant tiré
   par question, donc porté par la consigne de l'exercice). La `nature` de
   l'exercice n'accorde que la formulation (consigne du widget, aide contextuelle,
   séparateur de liste du journal).

   Correction : en plus de la révélation du bon rangement, le runner DIAGNOSTIQUE la
   suite exactement INVERSÉE (`messageInversion`) — au CE2 l'erreur typique est un
   réflexe de sens, pas une erreur de comparaison, et les deux ne s'aident pas de la
   même façon. Le rangement alphabétique en bénéficie aussi (message accordé). Le même
   contenu est annoncé aux lecteurs d'écran via une RÉGION LIVE (`#lordStatus`,
   `resumeCorrection`) : le feedback visuel apparaît alors que le focus part sur
   « Continuer ▶ », il serait sinon muet.

   Réutilise les composants du sprint (.sprint-*) et la tuile .tuile. Modèle
   d'interaction validé côté UX enfant (tap fiable au doigt, drag en appoint).
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { ExerciseMode, NatureOrdre } from '../core/exercise';
import { separateurSuite } from '../core/exercise';
import { escapeHTML } from '../core/utils';
import { parseNombreFr } from '../core/nombres';
import { ttsAttr } from '../core/tts-text';
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
import type { TypeAide } from '../core/aide';
import { capterErreur } from './erreur-capture';
import {
	capterPasse,
	decisionHTML,
	ligneRevelation,
	masquerDecision,
	revelerSolution,
	wirePasser,
} from './lecon-passer';
import { ordreErreur } from '../core/erreur-representation';

const NB_QUESTIONS = 6;

interface OrdreQuestion {
	question: string; // consigne
	tuiles: string[]; // suite mélangée (bac)
	ordre: string[]; // bonne suite triée
	nature?: NatureOrdre; // mots (défaut) ou nombres (#448) — formulation seulement
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: OrdreQuestion[] = [];
let idx = 0;
let score = 0;
let ctrl: TuileController; // widget « ranger une suite » mutualisé (#345)
// Question TRANCHÉE (validée ou révélée via « Je ne sais pas, montre-moi », #467) : garde
// contre un second enregistrement, et surtout contre une réactivation de « Vérifier » par
// le `onState` du widget, qui reste bavard tant que `verify()` n'a pas figé le widget.
let tranchee = false;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* Type d'aide contextuelle (#272) accordé à ce qu'on range (#448) : le contenu de
   l'aide « ordre » parle de mots, celui de « ordreNombres » de nombres. */
function typeAide(q: OrdreQuestion): TypeAide {
	return q.nature === 'nombres' ? 'ordreNombres' : 'ordre';
}

/* La suite posée est-elle l'EXACT inverse de la suite attendue ? Pur (aucun DOM),
   exporté pour être éprouvé seul. Une rangée incomplète ou une simple permutation
   n'est pas une inversion. */
export function estSuiteInversee(propose: readonly string[], ordre: readonly string[]): boolean {
	if (propose.length !== ordre.length || ordre.length < 2) return false;
	return propose.every((v, i) => v === ordre[ordre.length - 1 - i]);
}

/* Message ciblé quand l'enfant a rangé la suite À L'ENVERS (avis pedagogue-primaire) :
   au CE2, l'erreur typique n'est pas une erreur de COMPARAISON mais un RÉFLEXE — on
   range du plus petit au plus grand par habitude, alors que la consigne demandait
   l'inverse. Servir le même « c'est faux » dans les deux cas fait passer une erreur
   d'attention pour une erreur de calcul : on NOMME donc ce qui s'est passé.
   Renvoie `null` si la réponse n'est pas exactement l'inverse (rien à dire de ciblé).
   Pur (aucun DOM) → exporté pour être éprouvé seul. */
export function messageInversion(
	propose: readonly string[],
	ordre: readonly string[],
	nature?: NatureOrdre,
): string | null {
	if (!estSuiteInversee(propose, ordre)) return null;
	if (nature !== 'nombres') {
		// Rangement alphabétique (#108) : la consigne demande toujours l'ordre de
		// l'alphabet, l'enfant l'a parcouru à rebours.
		return "Tu as rangé les mots à l'envers : la consigne demandait l'ordre alphabétique.";
	}
	// Nombres : on dit dans quel sens l'enfant a rangé, pour qu'il relie son geste à la
	// consigne. Le sens se lit sur SA suite (premier vs dernier nombre posé) ; si les
	// libellés ne sont pas des nombres lisibles, on reste sur un message générique.
	const premier = parseNombreFr(propose[0]);
	const dernier = parseNombreFr(propose[propose.length - 1]);
	if (Number.isNaN(premier) || Number.isNaN(dernier) || premier === dernier) {
		return "Tu as rangé les nombres à l'envers : relis bien la consigne.";
	}
	const sens = premier < dernier ? 'du plus petit au plus grand' : 'du plus grand au plus petit';
	return `Tu as rangé ${sens} : la consigne demandait l'inverse.`;
}

/* Résumé TEXTE de la correction, pour la région live lue par un lecteur d'écran : le même
   contenu que l'écran (verdict, diagnostic d'inversion s'il s'applique, bon rangement),
   assemblé à partir de `messageInversion` — on ne reformule jamais le diagnostic une
   seconde fois. La suite est énumérée avec le séparateur de sa NATURE (`separateurSuite`,
   #448) : le point-virgule des nombres se lit comme une pause, pas comme une virgule
   décimale. Pur (aucun DOM) → exporté pour être éprouvé seul. */
export function resumeCorrection(
	propose: readonly string[],
	ordre: readonly string[],
	nature: NatureOrdre | undefined,
	correct: boolean,
): string {
	if (correct) return 'Bravo, tout est bien rangé.';
	const suite = ordre.join(separateurSuite(nature));
	const cible = messageInversion(propose, ordre, nature);
	return `${cible ?? "Ce n'est pas le bon rangement."} Le bon rangement : ${suite}.`;
}

/* Génère des questions DISTINCTES. La consigne pouvant être constante (ordre
   alphabétique), on déduplique sur la suite triée, pas sur le texte de l'énoncé. */
function genQuestions(l: LessonDef, m: ExerciseMode, n: number): OrdreQuestion[] {
	const out: OrdreQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'tuilesOrdre') break; // ce runner n'a de sens que pour ce type
		const key = ex.ordre.join('|');
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push({ question: ex.question, tuiles: ex.tuiles, ordre: ex.ordre, nature: ex.nature });
		misses = 0;
	}
	return out;
}

/* Nom du runner dans le registre de reprise (#498) — stable, il vit dans les instantanés. */
const RUNNER = 'ordre';

/* Démarre l'écran sur un jeu de questions donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(l: LessonDef, m: ExerciseMode, qs: OrdreQuestion[], depart = 0, pts = 0): void {
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
		// Clé d'aide DYNAMIQUE (#448) : ranger des mots et ranger des nombres ne
		// s'expliquent pas pareil, la nature est portée par la question tirée.
		aide: typeAide(qs[0]),
	});
}

export function runLeconOrdre(lessonId: string, m: ExerciseMode): void {
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
	const qs = snap.questions as OrdreQuestion[];
	if (!l || !qs.length) {
		goHome();
		return;
	}
	demarrer(l, snap.exerciseMode as ExerciseMode, qs, snap.idx, snap.score);
});

function renderQuestion(): void {
	const q = questions[idx];
	tranchee = false;
	sheets().innerHTML = `
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        ${leconTitreHTML(lesson)}
        <p class="sprint-q lord-consigne"${ttsAttr(q.question)}>${escapeHTML(q.question)}</p>
        <div data-tuile-mount></div>
        ${decisionHTML('lordVerif')}
        <p class="sr-only" id="lordStatus" role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="sprint-correction" id="lordFeedback" hidden></div>
        <div class="sprint-actions" id="lordActions" hidden></div>
      </div>
    </div>`;
	const verif = sheets().querySelector('#lordVerif') as HTMLButtonElement;
	// Widget « ranger une suite » mutualisé (#345) : rangée numérotée + bac, tap/glisser,
	// figeage et marques ✓/✗ par case à la validation.
	ctrl = bindTuileInteraction(
		sheets(),
		{ kind: 'ordre', question: q.question, ordre: q.ordre, tuiles: q.tuiles, nature: q.nature },
		{
			variant: 'lecon',
			onState: (complete) => {
				if (!tranchee) verif.disabled = !complete;
			},
		},
	);
	verif.addEventListener('click', () => verifier());
	wirePasser(sheets(), passer); // « Je ne sais pas, montre-moi » (#467)
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), typeAide(q)); // bouton « ? » persistant (#272)
}

function verifier(): void {
	const verif = sheets().querySelector('#lordVerif') as HTMLButtonElement;
	if (tranchee || verif.disabled) return; // déjà tranchée, ou rangée incomplète
	tranchee = true;
	const q = questions[idx];
	const correct = ctrl.verify(); // fige + marque chaque case (✓/✗)
	// Ordre réellement posé par l'enfant : il sert à DEUX choses, le journal d'erreurs
	// et le diagnostic « suite inversée » — on le lit donc une seule fois, avant de
	// brancher quoi que ce soit (aucun chemin ne doit sortir avant `capterErreur`).
	const rep = ctrl.reponse?.();
	const propose = rep?.kind === 'ordre' ? rep.propose : [];
	if (correct) score++;
	else {
		// Journal des erreurs (#391) : UNE entrée pour le rangement raté (ordre proposé
		// vs bon ordre, lisibles). Une inversion de sens EST une erreur : elle est
		// journalisée comme les autres (avec son message ciblé en plus à l'écran). Une
		// seule capture : verifier() ne corrige qu'une fois (bouton figé après
		// validation, puis on passe à la question suivante).
		const { donnee, attendue } = ordreErreur(propose, q.ordre, q.nature);
		capterErreur({ text: q.question, donnee, attendue, lessonId: lesson.id, mode: 'lecon' });
	}
	// Diagnostic ciblé de l'inversion : il s'AJOUTE à la révélation du bon rangement
	// (qui reste l'information la plus utile), il ne la remplace pas.
	const inversion = correct ? null : messageInversion(propose, q.ordre, q.nature);
	// Une fois la réponse validée, le bloc de décision s'efface : seul « Continuer ▶ »
	// (#lordActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	masquerDecision(sheets());
	// Annonce vocale du verdict (SC 4.1.3) : `#lordFeedback` n'est PAS une région live et
	// `wireNext` pose le focus sur « Continuer ▶ » — sans ça, un lecteur d'écran passe
	// par-dessus le diagnostic d'inversion ET la révélation du bon rangement. Peuplé AVANT
	// `wireNext` (donc avant le déplacement du focus) et en `textContent` : rien à échapper,
	// et le même résumé pur que l'écran (`resumeCorrection`), jamais une 2ᵉ formulation.
	const statut = sheets().querySelector('#lordStatus');
	if (statut) statut.textContent = resumeCorrection(propose, q.ordre, q.nature, correct);
	wireNext(
		sheets().querySelector('#lordActions') as HTMLElement,
		sheets().querySelector('#lordFeedback') as HTMLElement,
		{
			feedbackHTML: correct
				? `<span class="lqcm-ok">Bravo ! 🎉</span>`
				: `${inversion ? `<span class="lord-inverse">${escapeHTML(inversion)}</span>` : ''}<span class="lqcm-ko">Le bon rangement : <strong>${q.ordre.map(escapeHTML).join(' · ')}</strong></span>`,
			isLast: idx >= questions.length - 1,
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

/* « Je ne sais pas, montre-moi » (#467) : la suite attendue est révélée en TEXTE et le
   rangement commencé reste visible, mais figé — jamais `ctrl.verify()`, qui marquerait ✗ des
   cases vides. La question compte au dénominateur (score inchangé ⇒ 0 XP) et n'est pas
   rejouée. Pas de diagnostic d'inversion ici : sans rangée complète, il n'y a rien à
   diagnostiquer. */
function passer(): void {
	if (tranchee) return;
	tranchee = true;
	const q = questions[idx];
	// Attendu formaté comme pour une erreur (séparateur accordé à la nature, #448), avec une
	// proposition vide puisqu'il n'y a pas eu d'essai. Il sert aussi d'annonce vocale.
	const attendue = ordreErreur([], q.ordre, q.nature).attendue;
	capterPasse({ text: q.question, attendue, lessonId: lesson.id });
	// L'index avance AVANT tout affichage : la photo de reprise (#498) est prise quand
	// l'enfant quitte l'écran, et une question déjà révélée ne doit jamais lui être reposée.
	idx++;
	revelerSolution({
		root: sheets(),
		feedback: sheets().querySelector('#lordFeedback') as HTMLElement,
		actions: sheets().querySelector('#lordActions') as HTMLElement,
		repHTML: ligneRevelation('le bon rangement', q.ordre.map(escapeHTML).join(' · ')),
		// La suite est énumérée avec le séparateur de sa NATURE (#448) : le point-virgule des
		// nombres se lit comme une pause, pas comme une virgule décimale.
		annonce: `Le bon rangement : ${attendue}.`,
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
		onAgain: () => runLeconOrdre(lesson.id, mode),
	});
}
