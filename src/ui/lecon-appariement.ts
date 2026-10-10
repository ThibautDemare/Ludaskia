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

   Séance partagée (#734, `runner-partage.ts`) : les manches FIGÉES d'un envoi, sans
   verdict avant la fin. « Valider » s'active quand chaque mot de gauche est relié, comme
   « Vérifier » ; il note la réponse avec la règle du widget (`ctrl.juste()`), débranche
   l'observateur de redimensionnement du board, puis passe à la manche suivante.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { ColonneDroiteAppariement, Exercise, ExerciseMode } from '../core/exercise';
import type { TypeAide } from '../core/aide';
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
import { bindAppariement, type AppariementController } from './appariement';
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
import { liensLisibles, pairesErreur, type LienPropose } from '../core/erreur-representation';
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

const NB_MANCHES = 5;

interface MancheAppariement {
	question: string;
	paires: { gauche: string; droite: string }[];
	intrus: string[];
	/** Ce que porte la colonne de droite (#731) : des mots (défaut) ou des étiquettes.
	    Sert UNIQUEMENT à choisir la bulle d'aide, cf. `aideDuGeste`. */
	colonneDroite?: ColonneDroiteAppariement;
}

let lesson: LessonDef;
let mode: ExerciseMode;
let manches: MancheAppariement[] = [];
let idx = 0;
let score = 0;
let ctrl: AppariementController;
// Manche TRANCHÉE (validée ou révélée via « Je ne sais pas, montre-moi », #467) : garde
// contre un second enregistrement, et surtout contre une réactivation de « Vérifier » par
// le `onState` du widget, qui reste bavard tant que `verify()` n'a pas figé le board.
let tranchee = false;
// Séance partagée (#734) : la séance de l'écran partagé, le bloc de décision de la manche
// affichée, et « chaque mot de gauche est relié » (règle d'activation de « Valider »).
// `null` en jeu libre.
let partage: SeanceRunner | null = null;
let decision: DecisionPartage | null = null;
let pret = false;

function sheets(): HTMLElement {
	return partage?.scene ?? document.getElementById('sheets')!;
}

/* Un exercice d'appariement devient une manche du runner. Partagé par le tirage du jeu
   libre (les deux chemins) et par les exercices figés d'un envoi : tous jouent la même
   manche. */
function mancheDepuisExercice(ex: Extract<Exercise, { type: 'appariement' }>): MancheAppariement {
	return {
		question: ex.question,
		paires: ex.paires,
		intrus: ex.intrus ?? [],
		colonneDroite: ex.colonneDroite,
	};
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
			out.push(mancheDepuisExercice(ex));
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
		out.push(mancheDepuisExercice(ex));
		misses = 0;
	}
	return out;
}

/* Nom du runner dans le registre de reprise (#498) — stable, il vit dans les instantanés. */
const RUNNER = 'appariement';

/* Quelle bulle d'aide expliquer (#731). Le geste est le même dans les deux cas, mais ce
   qu'on touche à droite ne l'est pas : un mot de la même famille (#392) ou une étiquette
   de classe grammaticale. « Touche le mot qui va avec à droite » décrirait alors une
   colonne de mots là où l'enfant n'a que trois étiquettes sous les yeux. Les manches d'une
   leçon sont homogènes (la banque entière relie des mots ou des étiquettes), donc la
   première suffit à trancher — même raisonnement qu'`aideDuGeste` de lecon-clic-mot. */
function aideDuGeste(): TypeAide {
	return manches[0]?.colonneDroite === 'etiquettes' ? 'appariementEtiquettes' : 'appariement';
}

/* Démarre l'écran sur un jeu de manches donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(
	l: LessonDef,
	m: ExerciseMode,
	ms: MancheAppariement[],
	depart = 0,
	pts = 0,
	seancePartagee: SeanceRunner | null = null,
): void {
	partage = seancePartagee;
	lesson = l;
	mode = m;
	manches = ms;
	idx = depart;
	score = pts;
	demarrerRunner({
		runner: RUNNER,
		lesson: l,
		mode: m ?? null,
		etat: () => ({ questions: manches, idx, score }),
		render: renderManche,
		aide: aideDuGeste(),
		partage: seancePartagee ?? undefined,
	});
}

/** Séance partagée (#734) : les exercices figés de l'envoi, joués sans verdict. */
export function jouerPartageAppariement(s: SeanceRunner): void {
	const ms = s.exercices.flatMap((ex) =>
		ex.type === 'appariement' ? [mancheDepuisExercice(ex)] : [],
	);
	// L'appariement n'a de runner que dans un mode retenu (`JEU_PAR_TYPE`) : il est défini.
	demarrer(s.lesson, s.mode!, ms, 0, 0, s);
}

export function runLeconAppariement(lessonId: string, m: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	const ms = genManches(l, m, NB_MANCHES);
	if (!ms.length) {
		goHome();
		return;
	}
	demarrer(l, m, ms);
}

/* Reprise (#498) : on rejoue les manches DÉJÀ TIRÉES à l'index sauvegardé, jamais un
   nouveau tirage — l'enfant retrouve sa leçon, pas une autre. */
enregistrerRunner(RUNNER, (snap) => {
	const l = getLessonById(snap.relaunch.lessonId);
	const ms = snap.questions as MancheAppariement[];
	if (!l || !ms.length) {
		goHome();
		return;
	}
	demarrer(l, snap.exerciseMode as ExerciseMode, ms, snap.idx, snap.score);
});

function renderManche(): void {
	const q = manches[idx];
	tranchee = false;
	decision = null;
	pret = false;
	const s = partage;
	sheets().innerHTML = html`
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, manches.length)}
      <div class="sprint-stage">
        ${leconTitreHTML(lesson, s?.niveau)}
        <p class="sprint-q lapp-titre"${ttsAttr(q.question)}>${q.question}</p>
        <div data-tuile-mount></div>
        ${s ? decisionPartageHTML('lappVerif') : decisionHTML('lappVerif')}
        <div class="sprint-correction" id="lappFeedback" hidden></div>
        <div class="sprint-actions" id="lappActions" hidden></div>
      </div>
    </div>`.balisage;
	const verif = sheets().querySelector('#lappVerif') as HTMLButtonElement;
	// En séance partagée, armer, relier ou délier un mot décoche « Je ne sais pas » et
	// recalcule « Valider ».
	ctrl = bindAppariement(
		sheets(),
		{ question: q.question, paires: q.paires, intrus: q.intrus },
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
			validerId: 'lappVerif',
			repondu: () => pret,
			onValider: () => validerPartage(s),
		});
	else {
		verif.addEventListener('click', () => verifier());
		wirePasser(sheets(), passer); // « Je ne sais pas, montre-moi » (#467)
	}
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), aideDuGeste()); // bouton « ? » (#272)
}

/* Bonnes paires RÉVÉLÉES (une par ligne) : servies après une erreur ET après un passage
   (#467), pour que l'enfant lise la même solution dans les deux cas. */
function pairesHTML(q: MancheAppariement): SafeHtml {
	const bon = joindre(
		q.paires.map((p) => html`${p.gauche} → ${p.droite}`),
		html`<br>`,
	);
	return html`<div class="lapp-solution">${bon}</div>`;
}

function verifier(): void {
	const verif = sheets().querySelector('#lappVerif') as HTMLButtonElement;
	if (tranchee || verif.disabled) return; // déjà tranchée, ou mots de gauche non tous reliés
	tranchee = true;
	const q = manches[idx];
	const correct = ctrl.verify(); // fige + marque chaque lien (✓/✗)
	if (correct) score++;
	else journaliser(q);
	// Le bloc de décision s'efface : seul « Continuer ▶ » reste (pas deux boutons, #153).
	masquerDecision(sheets());
	const feedbackHTML = correct
		? html`<span class="lqcm-ok">Bravo ! 🎉</span>`
		: html`<span class="lqcm-ko">Les bonnes paires :</span>${pairesHTML(q)}`;
	wireNext(
		sheets().querySelector('#lappActions') as HTMLElement,
		sheets().querySelector('#lappFeedback') as HTMLElement,
		{
			feedbackHTML,
			// Le widget a déjà annoncé, et plus précisément (paire par paire, mot par mot) :
			// résumé vide = « ne redis rien ». Cf. `WireNextOpts.resume` (#505).
			resume: '',
			isLast: idx >= manches.length - 1,
			onNext: () => {
				idx++;
				if (idx >= manches.length) finish();
				else renderManche();
			},
		},
	);
}

/* « Je ne sais pas, montre-moi » (#467) : les bonnes paires sont révélées en TEXTE et le
   board est désarmé. Surtout PAS `ctrl.verify()` : il poserait `.is-decoy` partout et
   annoncerait « non relié, incorrect » sur chaque lien jamais tenté — un verdict d'échec sur
   une manche que l'enfant n'a pas pu commencer, alors que « Vérifier » est encore inactif
   (c'est le cas nommé par l'issue). La manche compte au dénominateur (score inchangé ⇒
   0 XP) et n'est pas rejouée. */
function passer(): void {
	if (tranchee) return;
	tranchee = true;
	const q = manches[idx];
	const attendue = attenduePaires(q);
	capterPasse({ text: q.question, attendue, lessonId: lesson.id });
	// L'index avance AVANT tout affichage : la photo de reprise (#498) est prise quand
	// l'enfant quitte l'écran, et une manche déjà révélée ne doit jamais lui être reposée.
	idx++;
	revelerSolution({
		root: sheets(),
		feedback: sheets().querySelector('#lappFeedback') as HTMLElement,
		actions: sheets().querySelector('#lappActions') as HTMLElement,
		repHTML: ligneRevelation('les bonnes paires'),
		extraHTML: pairesHTML(q),
		annonce: `Les bonnes paires : ${attendue}.`,
		isLast: idx >= manches.length,
		onNext: () => {
			if (idx >= manches.length) finish();
			else renderManche();
		},
	});
}

/* Journal des erreurs (#391) : une entrée par manche ratée, restreinte aux paires
   FAUSSES (cf. pairesErreur). Une seule capture par manche : « Vérifier » disparaît
   juste après la correction. */
function journaliser(q: MancheAppariement): void {
	const liens = liensPoses();
	if (!liens) return; // widget monté sans représentation d'erreur
	capterErreur({ ...erreurAppariement(q, liens), mode: 'lecon' });
}

/* Liens posés par l'enfant, dans l'ordre d'affichage de la colonne de gauche (`null` :
   widget sans représentation d'erreur). */
function liensPoses(): LienPropose[] | null {
	const rep = ctrl.reponse?.();
	return rep?.kind === 'appariement' ? rep.liens : null;
}

/* Entrée du journal d'une manche ratée, restreinte aux paires FAUSSES (`pairesErreur`).
   Partagée par le jeu libre et la séance partagée, qui journalisent la même erreur. */
function erreurAppariement(q: MancheAppariement, liens: LienPropose[]): ErreurRunner {
	const { donnee, attendue } = pairesErreur(liens, q.paires);
	return { text: q.question, donnee, attendue, lessonId: lesson.id };
}

/* Toutes les bonnes paires, formatées comme l'attendu d'une erreur (`pairesErreur`) avec
   des liens vides : toutes ressortent alors comme attendues. Sert le « je ne sais pas »
   des deux chemins, et l'attendu entier de la séance partagée. */
function attenduePaires(q: MancheAppariement): string {
	return pairesErreur(
		q.paires.map((p) => ({ gauche: p.gauche, droite: null })),
		q.paires,
	).attendue;
}

/* Séance partagée : note la manche (même correction qu'en jeu libre, critère 11, via
   `ctrl.juste()`), puis passe à la suivante sans rien montrer du verdict. */
function validerPartage(s: SeanceRunner): void {
	const q = manches[idx];
	const attendue = attenduePaires(q);
	let reponse: ReponseRunner;
	if (decision?.jnsp() || !pret) {
		reponse = {
			statut: 'jnsp',
			saisie: '',
			attendue,
			erreurs: [erreurPassee({ text: q.question, attendue, lessonId: lesson.id })],
		};
	} else {
		const liens = liensPoses() ?? [];
		const juste = ctrl.juste();
		// La réponse ENTIÈRE, dans l'ordre des paires de la manche (celui de l'attendu) et
		// non dans l'ordre mélangé de l'affichage : l'adulte compare les deux lignes terme à
		// terme. Le journal, lui, garde la maille du jeu libre (les seules paires fausses).
		const relie = new Map(liens.map((l) => [l.gauche, l.droite]));
		const saisie = liensLisibles(
			q.paires.map((p) => ({ gauche: p.gauche, droite: relie.get(p.gauche) ?? null })),
		);
		reponse = {
			statut: juste ? 'juste' : 'faux',
			saisie,
			attendue,
			erreurs: juste ? [] : [erreurAppariement(q, liens)],
		};
	}
	// Le board va disparaître (manche suivante, ou fin de séance) : son observateur de
	// redimensionnement ne doit pas lui survivre.
	ctrl.liberer();
	enchainerPartage(s, idx, reponse, () => {
		idx++;
		renderManche();
	});
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
