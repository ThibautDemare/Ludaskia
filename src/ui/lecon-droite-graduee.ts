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
   l'enfant en rouge à tête creuse en plus — et, sur une droite PASSÉE via « Je ne sais pas,
   montre-moi », son repère corail tel qu'il l'avait posé, pour comparer). Verdict annoncé en
   live region (a11y). À la fin : recordLessonRun → mêmes XP / étoiles / objectifs (parité).

   Hors sprint (runner d'écran dédié). Structure calquée sur ui/lecon-clic-mot.ts.

   Séance partagée (#734, `runner-partage.ts`) : les droites FIGÉES d'un envoi, sans
   verdict avant la fin. Poser le repère (doigt ou clavier) reste le geste neutre du jeu
   libre ; « Valider » s'active dès qu'une graduation est choisie, comme « Vérifier », et
   Entrée le déclenche s'il est actif. Il note le placement avec la règle du jeu libre
   (`tentativePosee`), sans figure de révélation, puis passe à la droite suivante.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import { droiteDepuisExercice } from '../core/etayage-droite';
import type { Exercise, ExerciseMode } from '../core/exercise';

import { ttsAttr } from '../core/tts-text';
import {
	renderDroiteGraduee,
	renderDroiteGradueeInteractif,
	repereMarkup,
	xDeValeur,
} from '../core/figures/droite';
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
import { capterErreur } from './erreur-capture';
import { enonceDroiteJournal, entreeTentativePassee } from '../core/erreur-representation';
import {
	capterPasse,
	decisionHTML,
	ligneRevelation,
	masquerDecision,
	revelerSolution,
	wirePasser,
} from './lecon-passer';
import { monterBoutonAide } from './aide-exercice';
import { html, type SafeHtml, brut } from '../core/html';
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
	pasLabel: string; // ce que vaut une graduation (#490) — premier pas de l'étayage
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
// Séance partagée (#734) : la séance de l'écran partagé et le bloc de décision de la droite
// affichée. `null` en jeu libre.
let partage: SeanceRunner | null = null;
let decision: DecisionPartage | null = null;

function sheets(): HTMLElement {
	return partage?.scene ?? document.getElementById('sheets')!;
}

/* Un exercice de droite graduée devient une question du runner. Partagé par le tirage du
   jeu libre et par les exercices figés d'un envoi : les deux jouent la même droite. */
function questionDepuisExercice(ex: Extract<Exercise, { type: 'droiteGraduee' }>): QuestionDroite {
	return {
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
		pasLabel: ex.pasLabel,
	};
}

/* Génère jusqu'à n droites DISTINCTES (dédup sur fenêtre + cible). */
/* `m` : le mode DEMANDÉ. L'état de module `mode` n'est posé qu'ensuite, par `demarrer` : le
   lire ici reprendrait le mode de la partie précédente, qui peut être une séance partagée. */
function genQuestions(l: LessonDef, m: ExerciseMode | undefined, n: number): QuestionDroite[] {
	const out: QuestionDroite[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'droiteGraduee') break; // ce runner n'a de sens que pour ce type
		const key = `${ex.min}|${ex.max}|${ex.cible}`;
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
const RUNNER = 'droiteGraduee';

/* Démarre l'écran sur un jeu de questions donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(
	l: LessonDef,
	m: ExerciseMode | undefined,
	qs: QuestionDroite[],
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
		aide: 'droiteGraduee',
		partage: seancePartagee ?? undefined,
	});
}

/** Séance partagée (#734) : les exercices figés de l'envoi, joués sans verdict. Le mode
    peut manquer : la droite graduée se joue toujours dans ce runner. */
export function jouerPartageDroiteGraduee(s: SeanceRunner): void {
	const qs = s.exercices.flatMap((ex) =>
		ex.type === 'droiteGraduee' ? [questionDepuisExercice(ex)] : [],
	);
	demarrer(s.lesson, s.mode, qs, 0, 0, s);
}

export function runLeconDroiteGraduee(lessonId: string, m?: ExerciseMode): void {
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
	const qs = snap.questions as QuestionDroite[];
	if (!l || !qs.length) {
		goHome();
		return;
	}
	demarrer(l, (snap.exerciseMode as ExerciseMode) ?? undefined, qs, snap.idx, snap.score);
});

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
	decision = null;
	const s = partage;
	const q = questions[idx];
	sheets().innerHTML = html`
    <div class="sprint sprint-lecon">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage dg-stage">
        <div class="dg-col">
          ${leconTitreHTML(lesson, s?.niveau)}
          <p class="dg-consigne" id="dgConsigne"${ttsAttr(q.parle)}>${q.consigne}</p>
          <div class="dg-figure" id="dgFigure">${brut(
						// Fragment SVG du moteur de figures (frontière typée, cf. rendu-et-echappement.md) :
						// composé de nombres et de la consigne de la leçon, jamais d'une saisie d'enfant.
						renderDroiteGradueeInteractif({
							min: q.min,
							max: q.max,
							pas: q.pas,
							graduations: q.graduations,
							bornes: q.bornes,
							ariaLabel: q.consigne,
						}),
					)}</div>
          ${s ? decisionPartageHTML('dgVerify') : decisionHTML('dgVerify')}
          <p class="sr-only" id="dgStatus" role="status" aria-live="polite" aria-atomic="true"></p>
          <div class="sprint-correction" id="dgFeedback" hidden></div>
          <div class="sprint-actions" id="dgActions" hidden></div>
        </div>
      </div>
    </div>`.balisage;
	const verif = sheets().querySelector('#dgVerify') as HTMLButtonElement;
	const svg = svgEl();
	hitEls().forEach((el) =>
		el.addEventListener('click', () => {
			const i = Number(el.getAttribute('data-index'));
			selectGraduation(i, false);
		}),
	);
	svg.addEventListener('keydown', (e) => onKeydown(e));
	if (s)
		decision = brancherDecisionPartage(sheets(), {
			validerId: 'dgVerify',
			repondu: () => selection !== null,
			onValider: () => validerPartage(s),
		});
	else {
		verif.addEventListener('click', () => verifier());
		wirePasser(sheets(), passer); // « Je ne sais pas, montre-moi » (#467)
	}
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
	// Fragment SVG du moteur de figures (cf. sa frontière typée) : composé de nombres.
	g.innerHTML = brut(
		repereMarkup(xDeValeur(q.graduations[i].valeur, q.min, q.max), 'neutre'),
	).balisage;
	// Séance partagée : poser le repère décoche « Je ne sais pas » et recalcule « Valider »
	// (même règle : une graduation choisie). Le repère reste neutre, rien n'est révélé.
	if (decision) decision.widgetTouche();
	else (sheets().querySelector('#dgVerify') as HTMLButtonElement).disabled = false;
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
			if (decision) validerAuClavier();
			else if (selection !== null) verifier();
			break;
		default:
			return; // touche non gérée : ne pas bloquer (Tab, etc.)
	}
	e.preventDefault();
}

function verifier(): void {
	if (fige || selection === null) return;
	const q = questions[idx];
	// Même lecture du placement que la droite passée et la séance partagée (`tentativePosee`) :
	// une seule règle « au bon endroit ».
	const { choisie, juste } = tentativePosee(q, selection);
	if (!choisie) return;
	fige = true;
	if (juste) score++;

	afficherFigureRevelation(q, juste ? undefined : { valeur: choisie.valeur, etat: 'faux' });

	// Le bloc de décision s'efface : seul « Continuer ▶ » reste (#153) — et pas de
	// « Je ne sais pas, montre-moi » cliquable sur une droite déjà corrigée.
	masquerDecision(sheets());

	// Le résumé annoncé aux lecteurs d'écran est désormais passé à `wireNext`, qui le
	// pose dans `#dgStatus` (#505) — c'était jusqu'ici une écriture à la main, recopiée
	// runner par runner. Le texte, lui, ne change pas.
	const resume = juste
		? "Bravo, c'est le bon endroit."
		: `Ce n'est pas ça. Il fallait placer ${q.cibleLabel} ; tu as placé ${choisie.label}.`;

	if (!juste) journaliser(q, choisie.label);

	const expl = html`<p class="lqcm-expl">${q.explication}</p>`;
	wireNext(
		sheets().querySelector('#dgActions') as HTMLElement,
		sheets().querySelector('#dgFeedback') as HTMLElement,
		{
			feedbackHTML: html`${
				juste
					? html`<span class="lqcm-ok">Bravo ! 🎉</span>`
					: html`<span class="lqcm-ko">Regarde le bon repère en vert, puis continue.</span>`
			}${expl}`,
			resume,
			statut: '#dgStatus',
			isLast: idx >= questions.length - 1,
			// Étayage (#490) : proposé sur un placement raté, et déroulé sur CETTE droite —
			// l'échelle change à chaque question, un exemple voisin ne montrerait pas la sienne.
			...(juste
				? {}
				: {
						etayage: {
							lesson,
							niveau: niveauLecon(lesson),
							exemple: { moteur: 'droite' as const, spec: droiteDepuisExercice(q) },
						},
					}),
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

/* Remplace la coquille interactive par une figure STATIQUE (plus de sélection possible) :
   repère juste en vert plein, et — quand l'enfant avait posé un repère AILLEURS — le sien
   à côté, pour qu'il puisse comparer les deux positions. Son état de rendu dit ce qui s'est
   passé, sans se contredire d'un chemin à l'autre :
     - « Vérifier » sur un placement faux → tête CREUSE rouge : la réponse a été jugée, la
       forme double la couleur (daltonisme) ;
     - « Je ne sais pas, montre-moi » (#467) → état 'neutre', exactement le repère corail
       qu'il avait sous les yeux avant de valider. On le FIGE tel quel : il n'a pas échoué,
       il a demandé à voir — lui coller ici la tête creuse du « faux » serait un verdict sur
       une réponse jamais validée. La légende (« ton repère » / « le bon repère ») est posée
       par le moteur de figures, les deux têtes étant pleines.
   Aucun repère de l'enfant quand il avait visé la BONNE graduation : deux têtes pleines à la
   même abscisse s'occulteraient totalement (on lirait un bug), et il n'y a rien à comparer. */
function afficherFigureRevelation(
	q: QuestionDroite,
	enfant?: { valeur: number; etat: 'faux' | 'neutre' },
): void {
	const reperes: { valeur: number; etat: 'correct' | 'faux' | 'neutre' }[] = [
		{ valeur: q.cible, etat: 'correct' },
	];
	if (enfant) reperes.push(enfant);
	// Fragment SVG du moteur de figures (cf. sa frontière typée) : composé de nombres.
	(sheets().querySelector('#dgFigure') as HTMLElement).innerHTML = brut(
		renderDroiteGraduee({
			min: q.min,
			max: q.max,
			pas: q.pas,
			bornes: q.bornes,
			reperes,
			// Description a11y : les RÔLES des repères, jamais un verdict ni une couleur (une
			// couleur ne dit rien à qui ne voit pas la figure, et « ton repère en rouge » ferait
			// dire à la figure ce que la région live annonce déjà). Deux branches, exactement
			// celles du rendu : un repère, ou deux.
			desc: enfant
				? 'La droite graduée avec le bon repère, et à côté, le repère que tu avais posé, pour comparer.'
				: 'La droite graduée avec le repère au bon endroit.',
		}),
	).balisage;
}

/* Figure du journal : droite VIDE de repère, telle que l'enfant l'a vue, la réponse restant
   portée par `attendue`. Seule la PRÉSENCE d'une figure est consommée (marqueur « exercice
   avec dessin »), mais on passe la vraie figure pour que ce mode porte le même marqueur que
   le chemin de lecture de la MÊME leçon (fiche, révision) — un parent ne doit pas lire deux
   mises en forme selon le mode. */
function figureJournal(q: QuestionDroite): SafeHtml {
	// Fragment SVG du moteur de figures : construit à partir de nombres, jamais
	// d'une saisie (cf. la frontière typée de core/figures/index.ts).
	return brut(renderDroiteGraduee({ min: q.min, max: q.max, pas: q.pas, bornes: q.bornes }));
}

/* Journal des erreurs (#391) : une entrée par droite ratée. `fige` garantit une seule
   capture par essai. */
function journaliser(q: QuestionDroite, choisieLabel: string): void {
	capterErreur({ ...erreurDroite(q, choisieLabel), mode: 'lecon' });
}

/* Entrée du journal d'une droite ratée. L'énoncé vient de `enonceDroiteJournal` (la FENÊTRE
   en fait partie : « place 3 470 » ne dit rien sans la portion de droite), source unique
   partagée avec la capture de la séance partagée (#734). Partagée par le jeu libre et la
   séance partagée, qui journalisent la même erreur. */
function erreurDroite(q: QuestionDroite, choisieLabel: string): ErreurRunner {
	return {
		text: enonceDroiteJournal(q),
		figure: figureJournal(q),
		donnee: choisieLabel,
		attendue: q.cibleLabel,
		lessonId: lesson.id,
	};
}

/* Ce que l'enfant avait posé au moment de demander à voir : la graduation choisie (`null` s'il
   n'a rien posé) et si elle visait la cible. L'index de sélection arrive en PARAMÈTRE (et non
   lu dans l'état du module) : la lecture est ainsi éprouvable sur une droite donnée, et surtout
   la figure et le journal parlent du MÊME placement, avec la MÊME condition « au bon endroit »
   — deux lectures parallèles finiraient par se contredire (un repère montré comme faux à
   l'écran, absent du suivi encadrant). */
function tentativePosee(
	q: QuestionDroite,
	sel: number | null,
): { choisie: { valeur: number; label: string } | null; juste: boolean } {
	const choisie = sel === null ? null : q.graduations[sel];
	return { choisie, juste: choisie !== null && choisie.valeur === q.cible };
}

/* Ce qu'une droite passée laisse au journal encadrant (#467). La règle des trois cas (rien de
   posé / posé et faux / posé et juste) n'est PAS réécrite ici : elle vit dans
   `entreeTentativePassee` (core/erreur-representation.ts), avec les sous-questions d'un
   problème et le QCM multi. On ne fournit que les faits propres au format — un repère posé est
   une tentative, et c'est l'écart entre son repère et la cible qui dit au parent ce qui coince
   (lecture des graduations, décalage d'un cran…).
   Le score, lui, ne bouge dans aucun cas : demander la réponse n'est pas y répondre. */
function journaliserPasse(
	q: QuestionDroite,
	choisie: { valeur: number; label: string } | null,
	juste: boolean,
): void {
	const entree = entreeTentativePassee({
		tentee: choisie !== null,
		juste,
		donnee: choisie?.label ?? '',
	});
	if (!entree) return;
	if (entree.sansTentative) {
		capterPasse({
			text: enonceDroiteJournal(q),
			figure: figureJournal(q),
			attendue: q.cibleLabel,
			lessonId: lesson.id,
		});
		return;
	}
	journaliser(q, entree.donnee);
}

/* « Je ne sais pas, montre-moi » (#467) : la droite se rejoue en figure statique avec le repère
   juste (en vert) — et, si l'enfant avait déjà posé le sien ailleurs, ce repère-là reste visible
   à côté pour qu'il compare les deux positions. La réponse est redite en texte et l'explication
   s'affiche : c'est là qu'elle sert le plus. Pas de `verifier()` : « Vérifier » est justement
   encore inactif à ce stade (aucune graduation choisie), et une graduation éventuellement posée
   n'a pas été validée — elle ne mérite donc ni ✗ rouge ni point au score. La droite compte au
   dénominateur (score inchangé ⇒ 0 XP) et n'est pas rejouée. */
function passer(): void {
	if (fige) return;
	fige = true;
	const q = questions[idx];
	// Une seule lecture du placement pour les deux usages qui en dépendent (cf. tentativePosee).
	const { choisie, juste } = tentativePosee(q, selection);
	// Le journal dit ce qui s'est PASSÉ : un repère déjà placé est une tentative, et non un
	// « n'a pas essayé » (cf. journaliserPasse).
	journaliserPasse(q, choisie, juste);
	// Le repère de l'enfant est FIGÉ tel qu'il le voyait (corail, état 'neutre'), à son abscisse
	// exacte : la position sur l'axe est toute l'information pédagogique. Rien à montrer s'il
	// visait déjà la bonne graduation (même condition que le journal).
	afficherFigureRevelation(
		q,
		choisie !== null && !juste ? { valeur: choisie.valeur, etat: 'neutre' } : undefined,
	);
	// L'index avance AVANT tout affichage : la photo de reprise (#498) est prise quand
	// l'enfant quitte l'écran, et une droite déjà révélée ne doit jamais lui être reposée.
	idx++;
	revelerSolution({
		root: sheets(),
		feedback: sheets().querySelector('#dgFeedback') as HTMLElement,
		actions: sheets().querySelector('#dgActions') as HTMLElement,
		repHTML: ligneRevelation('la réponse', html`${q.cibleLabel}`),
		extraHTML: html`<p class="lqcm-expl">${q.explication}</p>`,
		annonce: `La réponse : ${q.cibleLabel}.`,
		isLast: idx >= questions.length,
		onNext: () => {
			if (idx >= questions.length) finish();
			else renderQuestion();
		},
	});
}

/* Séance partagée : Entrée sur la droite déclenche « Valider » s'il est actif, comme elle
   déclenche « Vérifier » en jeu libre ; rien sinon. Le clic passe par le bloc de décision,
   qui garde son unique validation par question. */
function validerAuClavier(): void {
	const valider = sheets().querySelector<HTMLButtonElement>('#dgVerify');
	if (valider && !valider.disabled) valider.click();
}

/* Séance partagée : note le placement (même correction qu'en jeu libre, critère 11, via
   `tentativePosee`), puis passe à la droite suivante sans figure de révélation ni verdict. */
function validerPartage(s: SeanceRunner): void {
	const q = questions[idx];
	const attendue = q.cibleLabel;
	const { choisie, juste } = tentativePosee(q, selection);
	let reponse: ReponseRunner;
	if (decision?.jnsp() || !choisie) {
		reponse = {
			statut: 'jnsp',
			saisie: '',
			attendue,
			erreurs: [
				erreurPassee({
					text: enonceDroiteJournal(q),
					figure: figureJournal(q),
					attendue,
					lessonId: lesson.id,
				}),
			],
		};
	} else {
		reponse = {
			statut: juste ? 'juste' : 'faux',
			saisie: choisie.label,
			attendue,
			erreurs: juste ? [] : [erreurDroite(q, choisie.label)],
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
		onAgain: () => runLeconDroiteGraduee(lesson.id, mode),
	});
}
