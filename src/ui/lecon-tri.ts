/* ============================================================
   Runner « ranger par thème » d'une leçon de vocabulaire (#114) — champs
   lexicaux, « une question à la fois ». L'enfant trie des tuiles-mots FOURNIES
   dans DEUX colonnes-thèmes (aucune saisie, on teste la reconnaissance
   lexicale). Interaction tap en deux temps (fiable au doigt) : taper une tuile
   du bac la sélectionne ; taper une colonne y dépose la tuile sélectionnée ;
   taper une tuile déjà posée la renvoie au bac. Glisser-déposer du bac vers une
   colonne en appoint (souris/desktop). Feedback immédiat tuile par tuile + bon
   classement montré, sans chrono. À la fin, l'essai est enregistré via
   recordLessonRun → mêmes XP / étoiles / objectifs que les autres modes.

   Réutilise les composants du sprint (.sprint-*) et la tuile .tuile. Modèle
   d'interaction calqué sur le runner « ranger une suite » (ui/lecon-ordre.ts).

   Séance partagée (#734, `runner-partage.ts`) : les questions FIGÉES d'un envoi, sans
   verdict avant la fin. « Valider » s'active quand tous les mots sont rangés, comme
   « Vérifier » ; il note la réponse avec la règle du widget (`ctrl.juste()`), puis passe
   à la question suivante.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { Exercise, ExerciseMode } from '../core/exercise';
import { escapeHTML } from '../core/utils';
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
import { capterErreur } from './erreur-capture';
import {
	capterPasse,
	decisionHTML,
	ligneRevelation,
	masquerDecision,
	revelerSolution,
	wirePasser,
} from './lecon-passer';
import { motsMalClasses } from '../core/erreur-representation';
import { html, type SafeHtml, joindre } from '../core/html';
import {
	brancherDecisionPartage,
	decisionPartageHTML,
	enchainerPartage,
	erreurPassee,
	type DecisionPartage,
	type ErreurRunner,
	type ReponseRunner,
	type SeanceRunner,
} from './runner-partage';

const NB_QUESTIONS = 6;

interface TriQuestion {
	question: string; // consigne
	categories: [string, string]; // libellés des deux thèmes
	mots: { mot: string; cat: 0 | 1 }[]; // tuiles fournies + thème correct
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: TriQuestion[] = [];
let idx = 0;
let score = 0;
let ctrl: TuileController; // widget « ranger par thème » mutualisé (#345)
// Question TRANCHÉE (validée ou révélée via « Je ne sais pas, montre-moi », #467) : garde
// contre un second enregistrement, et surtout contre une réactivation de « Vérifier » par
// le `onState` du widget, qui reste bavard tant que `verify()` n'a pas figé le widget.
let tranchee = false;
// Séance partagée (#734) : la séance de l'écran partagé, le bloc de décision de la question
// affichée, et « tous les mots sont rangés » (règle d'activation de « Valider »). `null` en
// jeu libre.
let partage: SeanceRunner | null = null;
let decision: DecisionPartage | null = null;
let pret = false;

function sheets(): HTMLElement {
	return partage?.scene ?? document.getElementById('sheets')!;
}

/* Un exercice « ranger par thème » devient une question du runner. Partagé par le tirage
   du jeu libre et par les exercices figés d'un envoi : les deux jouent la même question. */
function questionDepuisExercice(ex: Extract<Exercise, { type: 'tuilesTri' }>): TriQuestion {
	return { question: ex.question, categories: ex.categories, mots: ex.mots };
}

/* Génère des questions DISTINCTES. La consigne étant constante, on déduplique sur
   l'ensemble des mots de la question (indépendant de l'ordre des tuiles). */
function genQuestions(l: LessonDef, m: ExerciseMode, n: number): TriQuestion[] {
	const out: TriQuestion[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'tuilesTri') break; // ce runner n'a de sens que pour ce type
		const key = [...ex.mots.map((x) => x.mot)].sort((a, b) => a.localeCompare(b)).join('|');
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push(questionDepuisExercice(ex));
		misses = 0;
	}
	return out;
}

/* Nom du runner dans le registre de reprise (#498) — stable, il vit dans les instantanés. */
const RUNNER = 'tri';

/* Démarre l'écran sur un jeu de questions donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(
	l: LessonDef,
	m: ExerciseMode,
	qs: TriQuestion[],
	depart = 0,
	pts = 0,
	seancePartagee: SeanceRunner | null = null,
): void {
	partage = seancePartagee;
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
		aide: 'tri',
		partage: seancePartagee ?? undefined,
	});
}

/** Séance partagée (#734) : les exercices figés de l'envoi, joués sans verdict. */
export function jouerPartageTri(s: SeanceRunner): void {
	const qs = s.exercices.flatMap((ex) =>
		ex.type === 'tuilesTri' ? [questionDepuisExercice(ex)] : [],
	);
	// Le tri n'a de runner que dans un mode retenu (`JEU_PAR_TYPE`) : il est défini.
	demarrer(s.lesson, s.mode!, qs, 0, 0, s);
}

export function runLeconTri(lessonId: string, m: ExerciseMode): void {
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
	const qs = snap.questions as TriQuestion[];
	if (!l || !qs.length) {
		goHome();
		return;
	}
	demarrer(l, snap.exerciseMode as ExerciseMode, qs, snap.idx, snap.score);
});

function renderQuestion(): void {
	const q = questions[idx];
	tranchee = false;
	decision = null;
	pret = false;
	const s = partage;
	sheets().innerHTML = html`
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        ${leconTitreHTML(lesson, s?.niveau)}
        <p class="sprint-q lord-consigne"${ttsAttr(q.question)}>${q.question}</p>
        <div data-tuile-mount></div>
        ${s ? decisionPartageHTML('ltriVerif') : decisionHTML('ltriVerif')}
        <div class="sprint-correction" id="ltriFeedback" hidden></div>
        <div class="sprint-actions" id="ltriActions" hidden></div>
      </div>
    </div>`.balisage;
	const verif = sheets().querySelector('#ltriVerif') as HTMLButtonElement;
	// Widget « ranger par thème » mutualisé (#345) : deux colonnes + bac, tap en deux
	// temps / glisser, figeage et marques ✓/✗ par tuile à la validation. En séance partagée,
	// choisir, ranger ou retirer un mot décoche « Je ne sais pas » et recalcule « Valider ».
	ctrl = bindTuileInteraction(
		sheets(),
		{ kind: 'tri', question: q.question, categories: q.categories, mots: q.mots },
		{
			variant: 'lecon',
			onState: (complete) => {
				if (s) {
					pret = complete;
					decision?.widgetTouche();
				} else if (!tranchee) verif.disabled = !complete;
			},
		},
	);
	if (s)
		decision = brancherDecisionPartage(sheets(), {
			validerId: 'ltriVerif',
			repondu: () => pret,
			onValider: () => validerPartage(s),
		});
	else {
		verif.addEventListener('click', () => verifier());
		wirePasser(sheets(), passer); // « Je ne sais pas, montre-moi » (#467)
	}
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), 'tri'); // bouton « ? » persistant (#272)
}

/* Mots d'un thème, dans l'ordre de la question. */
function motsDuTheme(q: TriQuestion, col: 0 | 1): string[] {
	return q.mots.filter((m) => m.cat === col).map((m) => m.mot);
}

/* Bon classement RÉVÉLÉ (une ligne par thème) : servi après une erreur ET après un passage
   (#467), pour que l'enfant lise la même solution dans les deux cas. */
function classementHTML(q: TriQuestion): SafeHtml {
	const bon = joindre(
		([0, 1] as const).map(
			(col) =>
				html`<strong>${q.categories[col]}</strong> : ${motsDuTheme(q, col)
					.map(escapeHTML)
					.join(' · ')}`,
		),
		html`<br>`,
	);
	return html`<div class="ltri-solution">${bon}</div>`;
}

/* Même classement en TEXTE, d'une seule ligne, pour la live region et le journal. */
function classementTexte(q: TriQuestion): string {
	return classementLigne(q, (m) => m.cat);
}

/* Un classement d'une seule ligne, thème par thème, dans l'ordre des mots de la question :
   le bon (`classementTexte`) ou celui de l'enfant (séance partagée, #734), mis en forme
   pareil pour que l'adulte compare les deux lignes terme à terme. */
function classementLigne(
	q: TriQuestion,
	colonne: (m: TriQuestion['mots'][number]) => 0 | 1 | undefined,
): string {
	return ([0, 1] as const)
		.map((col) => {
			const mots = q.mots.filter((m) => colonne(m) === col).map((m) => m.mot);
			// Un thème vide n'arrive que dans le classement d'un enfant (tout rangé d'un côté) :
			// chaque thème d'un exercice a ses mots.
			return `${q.categories[col]} : ${mots.length ? mots.join(', ') : '(aucun mot)'}`;
		})
		.join(' — ');
}

/* Colonne choisie par l'enfant pour chaque mot rangé. */
function placementPose(): Record<string, 0 | 1> {
	const rep = ctrl.reponse?.();
	return rep?.kind === 'tri' ? rep.placement : {};
}

/* Entrées du journal d'un tri raté (#391) : UNE par mot MAL classé (colonne choisie vs
   bonne colonne), pour cibler le mot précis à revoir. Partagées par le jeu libre et la
   séance partagée, qui journalisent les mêmes erreurs. */
function erreursTri(q: TriQuestion, placement: Record<string, 0 | 1>): ErreurRunner[] {
	return motsMalClasses(q.mots, q.categories, placement).map((mal) => ({
		text: `Ranger le mot « ${mal.mot} »`,
		donnee: mal.donnee,
		attendue: mal.attendue,
		lessonId: lesson.id,
	}));
}

function verifier(): void {
	const verif = sheets().querySelector('#ltriVerif') as HTMLButtonElement;
	if (tranchee || verif.disabled) return; // déjà tranchée, ou tuiles non toutes rangées
	tranchee = true;
	const q = questions[idx];
	const correct = ctrl.verify(); // fige + marque chaque tuile (✓/✗)
	if (correct) score++;
	else {
		// Journal des erreurs (#391) : UNE entrée par mot MAL classé. Une seule capture par
		// essai (bouton figé après validation, puis question suivante).
		for (const e of erreursTri(q, placementPose())) capterErreur({ ...e, mode: 'lecon' });
	}
	// Une fois la réponse validée, le bloc de décision s'efface : seul « Continuer ▶ »
	// (#ltriActions) reste, pour ne pas afficher deux boutons à la fois (#153).
	masquerDecision(sheets());
	const feedbackHTML = correct
		? html`<span class="lqcm-ok">Bravo ! 🎉</span>`
		: html`<span class="lqcm-ko">Le bon classement :</span>${classementHTML(q)}`;
	wireNext(
		sheets().querySelector('#ltriActions') as HTMLElement,
		sheets().querySelector('#ltriFeedback') as HTMLElement,
		{
			feedbackHTML,
			// Le widget de tuiles a déjà annoncé dans `#ltriStatus`, colonne par colonne :
			// résumé vide = « ne redis rien ». Cf. `WireNextOpts.resume` (#505).
			resume: '',
			isLast: idx >= questions.length - 1,
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

/* « Je ne sais pas, montre-moi » (#467) : le classement complet est révélé en TEXTE et les
   colonnes sont désarmées, sans `ctrl.verify()` — qui marquerait ✗ les mots déjà posés et
   figerait le tri comme après une erreur. La question compte au dénominateur (score
   inchangé ⇒ 0 XP) et n'est pas rejouée.

   Journal : UNE entrée pour l'exercice, là où une erreur en produit une par mot MAL CLASSÉ.
   Sans tentative, il n'y a pas de mot mal classé à cibler (l'enfant peut même en avoir bien
   rangé quelques-uns) : une entrée par mot ferait peser un seul « je ne sais pas » comme
   huit erreurs dans le suivi, en désignant au hasard des mots qu'on n'a aucune raison de
   croire acquis ou non. Même arbitrage qu'en révision, pour que le parent lise la même
   maille dans les deux modes. */
function passer(): void {
	if (tranchee) return;
	tranchee = true;
	const q = questions[idx];
	const solution = classementTexte(q);
	capterPasse({ text: q.question, attendue: solution, lessonId: lesson.id });
	// L'index avance AVANT tout affichage : la photo de reprise (#498) est prise quand
	// l'enfant quitte l'écran, et une question déjà révélée ne doit jamais lui être reposée.
	idx++;
	revelerSolution({
		root: sheets(),
		feedback: sheets().querySelector('#ltriFeedback') as HTMLElement,
		actions: sheets().querySelector('#ltriActions') as HTMLElement,
		repHTML: ligneRevelation('le bon classement'),
		extraHTML: classementHTML(q),
		annonce: `Le bon classement : ${solution}.`,
		isLast: idx >= questions.length,
		onNext: () => {
			if (idx >= questions.length) finish();
			else renderQuestion();
		},
	});
}

/* Séance partagée : note la question (même correction qu'en jeu libre, critère 11, via
   `ctrl.juste()`), puis passe à la suivante sans rien montrer du verdict. La saisie est le
   classement COMPLET de l'enfant ; le journal garde la maille du jeu libre (un mot mal
   classé = une entrée, et une seule entrée pour « je ne sais pas »). */
function validerPartage(s: SeanceRunner): void {
	const q = questions[idx];
	const attendue = classementTexte(q);
	let reponse: ReponseRunner;
	if (decision?.jnsp() || !pret) {
		reponse = {
			statut: 'jnsp',
			saisie: '',
			attendue,
			erreurs: [erreurPassee({ text: q.question, attendue, lessonId: lesson.id })],
		};
	} else {
		const placement = placementPose();
		const juste = ctrl.juste();
		reponse = {
			statut: juste ? 'juste' : 'faux',
			saisie: classementLigne(q, (m) => placement[m.mot]),
			attendue,
			erreurs: juste ? [] : erreursTri(q, placement),
		};
	}
	enchainerPartage(s, idx, reponse, () => {
		idx++;
		renderQuestion();
	});
}

function finish(): void {
	renderLeconResult({
		out: finishLeconRun(lesson.id, score, questions.length),
		score,
		total: questions.length,
		category: lesson.category,
		onAgain: () => runLeconTri(lesson.id, mode),
	});
}
