/* ============================================================
   Mode Sprint : 5 minutes, un max de bonnes réponses, calculs
   tirés au hasard et générés un par un (pas de preview).
   - bonne réponse → petite animation ✓ puis question suivante
     (le compte à rebours continue)
   - mauvaise réponse → on révèle la bonne réponse et on MET LE
     CHRONO EN PAUSE jusqu'à ce que l'élève passe à la suite
     (clic « Continuer » OU touche Entrée)
   - validation à VIDE = réponse fausse assumée (#467) : même
     révélation, question comptée, aucun point ni XP. Le sprint n'a
     PAS de bouton « Je ne sais pas » (un passe-droit gratuit sous
     chrono gonflerait le record) : valider sans rien écrire est la
     sortie de secours de l'enfant coincé, au même prix qu'une erreur.
   - validation sur Entrée OU bouton « Valider »
   - un sprint ne compte que s'il va au bout des 5 minutes
   ============================================================ */
import { choice, commKey, fmt, rnd } from '../core/utils';
import {
	getAllLessons,
	getLessonsBySubject,
	getLessonsByCategory,
	lessonsForIds,
	estEligibleSprintHorsNiveau,
	SUBJECTS,
	CATEGORIES,
} from '../core/catalog';
import type { BilanConfig, LessonDef } from '../core/catalog';
import { niveauLecon, niveauActifMatiere } from '../core/niveau-actif';
import { labelLecon } from '../core/levels';
import { estSigneComparaison, signeView } from '../core/signes';
import type { SigneComparaison } from '../core/signes';
import type { ChoiceView } from '../core/exercise';
import { genSprintQuestion } from '../core/sprint-item';
import { creerDecompte, type Decompte } from '../core/sprint-decompte';
import { mathInline } from '../core/fraction-text';
import { icon, type IconName } from './icon';
import {
	checkItemAnswer,
	choiceButtonHTML,
	figureBlock,
	itemEstNumerique,
	TEXT_ANSWER_INPUT_ATTRS,
	poserAuTrou,
	texteItemParle,
} from '../core/items';
import { saisieEstNombre } from '../core/nombres';
import type { Item } from '../core/items';
import {
	updateStreak,
	recordLessonStats,
	recordRun,
	type RunResult,
	streakSuffix,
	addXP,
	getXP,
	niveauDepuisXP,
} from '../core/progress';
import {
	appliquerScope,
	scopeParDefaut,
	perimetreChoisissable,
	loadRencontrees,
	type SprintScope,
} from '../core/sprint-scope';
import { updateGoal, evaluateTrophies } from '../core/rewards';
import { sansPressionTemporelle } from '../core/profiles';
import { getTimer, setTimer, resetChrono } from './chrono';
import { recompensesEntre } from '../core/unlocks';
import { announceRewards } from './effects';
import { noterNotions, notionsDepuisPerLesson, recapAutonomeHTML } from './recap-seance';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import {
	setCurrentMode,
	setCurrentLessonId,
	hideMenus,
	setToolbar,
	startSprint,
	goHome,
} from './navigation';
import { bindConsigneTts } from './consigne-tts';
import { stopTts } from './tts';
import { capterErreur } from './erreur-capture';
import { attendueItem } from '../core/erreur-representation';
import { attribut, html, VIDE, type SafeHtml, joindre, drapeau } from '../core/html';

const SPRINT_MS = 300000; // 5 minutes

/* ---------- Filtre du sprint ---------- */

type SprintFilter =
	| { type: 'all' }
	| { type: 'subject'; id: string }
	| { type: 'category'; id: string }
	// Sprint personnalisé (#64) : une sélection précise de leçons alimente le
	// tirage, en lieu et place du filtre tout/matière/catégorie.
	| { type: 'lessons'; ids: string[]; label: string };

let sprintFilter: SprintFilter = { type: 'all' };
// Périmètre (#208, lot 2) : toutes les leçons éligibles, ou uniquement celles déjà
// rencontrées. Résolu (défaut adaptatif) à chaque entrée dans la config / lancement.
let sprintScope: SprintScope = 'all';

function lessonsForFilter(f: SprintFilter): LessonDef[] {
	const base =
		f.type === 'subject'
			? getLessonsBySubject(f.id)
			: f.type === 'category'
				? getLessonsByCategory(f.id)
				: f.type === 'lessons'
					? lessonsForIds(f.ids)
					: getAllLessons();
	// Filtre par niveau actif de la matière (#225) — SAUF un favori explicite
	// (`lessons`), qui résout hors-filtre pour ne pas être cassé par un changement de
	// classe (la génération reste calibrée par niveauLecon).
	const auNiveau =
		f.type === 'lessons'
			? base
			: base.filter((d) => d.levels.includes(niveauActifMatiere(d.subject)));
	// Les formats à écran dédié (posée #97, rangement #108, tri #114, appariement
	// #392…) ne se jouent pas « une réponse à la fois » : `estEligibleSprintHorsNiveau` les
	// écarte, avec les leçons explicitement exclues. Le prédicat vit dans le
	// catalogue depuis #630, pour que le gate du texte parlé interroge le même pool.
	return auNiveau.filter(estEligibleSprintHorsNiveau);
}

function filterLabel(f: SprintFilter): string {
	if (f.type === 'all') return '';
	if (f.type === 'subject') return SUBJECTS.find((s) => s.id === f.id)?.label ?? f.id;
	if (f.type === 'lessons') return f.label;
	return CATEGORIES.find((c) => c.id === f.id)?.label ?? f.id;
}

function parseFilter(value: string): SprintFilter {
	if (value.startsWith('subject:')) return { type: 'subject', id: value.slice(8) };
	if (value.startsWith('category:')) return { type: 'category', id: value.slice(9) };
	return { type: 'all' };
}

/* Lance un sprint filtré sur une catégorie (depuis l'écran de catégorie),
   sans passer par l'écran de configuration. */
export function startCategorySprint(categoryId: string): void {
	sprintFilter = { type: 'category', id: categoryId };
	// Lancement direct (sans écran de config) → périmètre par défaut adaptatif (#208).
	sprintScope = scopeParDefaut(lessonsForFilter(sprintFilter));
	location.hash = 'sprint';
}

/* Lance un sprint avec la configuration PAR DÉFAUT, sans passer par l'écran de
   configuration : toutes les matières + périmètre adaptatif (« ce que l'enfant
   connaît déjà » tant qu'il reste du non-rencontré, sinon « tout »). Utilisé par
   le programme du jour, où l'enfant ne configure pas l'étape lui-même. */
export function startDefaultSprint(): void {
	sprintFilter = { type: 'all' };
	sprintScope = scopeParDefaut(lessonsForFilter({ type: 'all' }));
	location.hash = 'sprint';
}

/* Lance un sprint personnalisé (#64) : la sélection de leçons d'un BilanConfig
   (composeur ou favori) alimente le tirage. Le sprint reste non reprenable et
   suit ses règles habituelles (chrono, pause sur erreur, XP/records/trophées). */
export function startCustomSprint(config: BilanConfig): void {
	sprintFilter = { type: 'lessons', ids: config.lessonIds, label: config.label };
	// Un favori est une sélection EXPLICITE de leçons : le périmètre « déjà vues »
	// ne s'y applique pas (on respecte le choix du parent/enfant).
	sprintScope = 'all';
	location.hash = 'sprint';
}

/* ---------- Écran de configuration du sprint ---------- */

export function renderSprintConfigScreen(el: HTMLElement): void {
	// À chaque entrée dans l'écran : périmètre par défaut ADAPTATIF (#208) — « déjà
	// vues » tant qu'il reste du non-rencontré, sinon « tout ».
	drawSprintConfig(el, scopeParDefaut(lessonsForFilter({ type: 'all' })));
}

/* Rendu (ré-entrant) de l'écran de config pour un périmètre donné. Re-dessiné au
   basculement du périmètre : les comptes par filtre et les options vides en dépendent. */
function drawSprintConfig(el: HTMLElement, scope: SprintScope): void {
	sprintScope = scope; // mémorisé pour le lancement
	// Périmètre « déjà vues » = joué dans l'appli ∪ déclaré vu en classe (#478).
	const vues = loadRencontrees();
	// Le choix de périmètre n'est proposé que s'il a un sens (mélange vu / pas-vu).
	const choisissable = perimetreChoisissable(lessonsForFilter({ type: 'all' }), vues);

	// On ne compte que les leçons ÉLIGIBLES au sprint (posée, tuiles, problèmes… en
	// sont exclues), puis restreintes au périmètre courant.
	const countFor = (f: SprintFilter): number =>
		appliquerScope(lessonsForFilter(f), scope, vues).length;

	// Filtre courant (l'écran n'expose que tout/matière/catégorie ; un favori 'lessons'
	// retombe sur « toutes »). Rabattu sur « toutes » s'il est vide au périmètre choisi.
	const wanted =
		sprintFilter.type === 'subject'
			? `subject:${sprintFilter.id}`
			: sprintFilter.type === 'category'
				? `category:${sprintFilter.id}`
				: 'all';
	const currentValue = countFor(parseFilter(wanted)) > 0 ? wanted : 'all';

	const opt = (value: string, label: string, n: number, indent = false) => {
		const checked = currentValue === value ? drapeau('checked') : VIDE;
		const disabled = n === 0 ? drapeau('disabled') : VIDE;
		const cls = `sc-option${indent ? ' sc-option-indent' : ''}${n === 0 ? ' sc-option-disabled' : ''}`;
		return html`<label class="${cls}">
      <input type="radio" name="scFilter" class="sc-radio" value="${value}"${checked}${disabled}>
      <span>${label} <span class="sc-count">${n} leçon${n > 1 ? 's' : ''}</span></span>
    </label>`;
	};

	// La structure matière/catégorie reste affichée selon l'ÉLIGIBILITÉ (indépendante
	// du périmètre) → liste stable au basculement ; seules les options vides au
	// périmètre courant sont grisées (compte 0).
	const subjectOptions = joindre(
		SUBJECTS.flatMap((subj) => {
			if (!lessonsForFilter({ type: 'subject', id: subj.id }).length) return [];
			const catOptions = CATEGORIES.filter((c) => c.subject === subj.id).flatMap((cat) =>
				lessonsForFilter({ type: 'category', id: cat.id }).length
					? [opt(`category:${cat.id}`, cat.label, countFor({ type: 'category', id: cat.id }), true)]
					: [],
			);
			return [
				opt(`subject:${subj.id}`, subj.label, countFor({ type: 'subject', id: subj.id })),
				...catOptions,
			];
		}),
	);

	// Sélecteur de périmètre (#208) : « Ce que tu connais déjà » (défaut) en tête.
	// « connais » et non « appris » : critère = rencontrée, pas maîtrisée (avis pédago).
	// Voix « tu » (#278, l'app pose la question) ; titre en <h2> sous le <h1>
	// « Sprint 5 min » de l'écran (#277). L'id reste la cible de l'aria-labelledby.
	const perimetre = choisissable
		? html`<h2 class="sc-section-title" id="scScopeTitle">Sur quoi veux-tu t'entraîner&nbsp;?</h2>
    <div class="sc-options sc-perimetre" role="radiogroup" aria-labelledby="scScopeTitle">
      <label class="sc-option"><input type="radio" name="scScope" class="sc-scope" value="seen"${scope === 'seen' ? drapeau('checked') : ''}><span>Ce que tu connais déjà</span></label>
      <label class="sc-option"><input type="radio" name="scScope" class="sc-scope" value="all"${scope === 'all' ? drapeau('checked') : ''}><span>Tout</span></label>
    </div>`
		: VIDE;

	el.innerHTML = html`<div class="sprint-config">
    ${perimetre}
    <h2 class="sc-section-title" id="scFilterTitle">Dans quelle matière&nbsp;?</h2>
    <div class="sc-options" role="radiogroup" aria-labelledby="scFilterTitle">
      ${opt('all', 'Toutes les matières', countFor({ type: 'all' }))}
      ${subjectOptions}
    </div>
    <button id="scLaunch" class="sprint-btn">${icon('play')} Lancer</button>
  </div>`.balisage;

	// Basculer le périmètre : on conserve le filtre en cours puis on redessine.
	el.querySelectorAll<HTMLInputElement>('.sc-scope').forEach((r) =>
		r.addEventListener('change', () => {
			const f = el.querySelector<HTMLInputElement>('.sc-radio:checked');
			if (f) sprintFilter = parseFilter(f.value);
			const next = el.querySelector<HTMLInputElement>('.sc-scope:checked')?.value;
			drawSprintConfig(el, next === 'seen' ? 'seen' : 'all');
		}),
	);
	el.querySelector('#scLaunch')!.addEventListener('click', () => {
		const selected = el.querySelector<HTMLInputElement>('.sc-radio:checked');
		sprintFilter = parseFilter(selected ? selected.value : 'all');
		location.hash = 'sprint';
	});
}

let sprintLessonDefs: LessonDef[] = [];

let sprintActive = false;
/* Le compte à rebours, avec ses causes de gel (core/sprint-decompte.ts). Créé à
   chaque lancement ; `null` hors partie. Une seule notion de pause pour la
   correction d'une erreur ET l'écoute de l'énoncé (#630), pour que la fin de
   l'audio ne relance pas un décompte que la correction voulait garder figé. */
let sprintDecompte: Decompte | null = null;
/* « L'écran attend un Continuer », et non « le temps est arrêté » : depuis #630 le
   décompte gèle AUSSI pendant l'écoute d'un énoncé, et l'enfant doit pouvoir
   répondre pendant qu'il écoute. Interroger la pause tout court à ces endroits
   ferait ignorer une réponse tapée pendant l'audio — et, sur Entrée, sauterait la
   question sans qu'elle soit comptée. */
const sprintEnCorrection = () => !!sprintDecompte?.gelePar('correction');
// Sans pression temporelle (#223) : minuteur + score masqués, fin douce. Lu une
// fois au lancement (runSprint). `sprintTimeUp` = les 5 min sont écoulées mais on
// laisse l'enfant terminer la question en cours avant de finaliser.
let sprintSansPression = false,
	sprintTimeUp = false;

let sprintScore = 0,
	sprintAnswered = 0,
	sprintNiveauDepart = 1; // niveau au lancement du sprint (pour détecter une montée)
let sprintPerLesson: Record<string, { ok: number; total: number }> = {},
	sprintRecentKeys: string[] = [],
	sprintCurrent: Item | null = null,
	sprintCurrentDef: LessonDef | null = null;
// Mini-séries : on garde la même matière 2-3 questions avant d'en changer,
// pour limiter le coût de bascule entre disciplines (cf. issue #54).
let sprintSeriesSubject: string | null = null,
	sprintSeriesLeft = 0;

// Combien d'items récents on s'interdit de répéter. Fenêtre volontairement
// modeste : sur un filtre réduit à une seule leçon (6 variantes en conjugaison),
// elle laisse toujours des candidats valides — et le garde-fou de sprintNext
// accepte de toute façon un item si la pioche n'en trouve pas d'autre.
const SPRINT_RECENT = 4;

// Stoppe proprement un sprint en cours (appelé en quittant la vue).
export function sprintCleanup() {
	sprintActive = false;
	sprintDecompte = null;
	sprintDesarmerFilet();
	stopTts(); // une lecture d'énoncé ne survit pas à la sortie du mode (#630)
}

// Un sprint est-il EN COURS (pas l'écran de résultats) ? Sert au garde-fou de
// sortie (#63) : quitter un sprint perd la progression (mode non reprenable).
export const isSprintRunning = () => sprintActive;

export function runSprint() {
	setCurrentMode('sprint');
	setCurrentLessonId(null);
	// Pool éligible filtré par le périmètre (#208). Un favori ('lessons') ignore le
	// périmètre : c'est déjà une sélection explicite.
	const eligibles = lessonsForFilter(sprintFilter);
	sprintLessonDefs =
		sprintFilter.type === 'lessons' ? eligibles : appliquerScope(eligibles, sprintScope);
	// Sélection vide (ex. favori dont toutes les leçons ont disparu du catalogue) :
	// rien à tirer, on revient à l'accueil plutôt que de planter le tirage.
	if (!sprintLessonDefs.length) {
		goHome();
		return;
	}
	sprintActive = true;
	sprintDecompte = creerDecompte(SPRINT_MS, Date.now());
	sprintSansPression = sansPressionTemporelle();
	sprintTimeUp = false;
	sprintScore = 0;
	sprintAnswered = 0;
	sprintNiveauDepart = niveauDepuisXP(getXP());
	sprintPerLesson = {};
	sprintRecentKeys = [];
	sprintCurrent = null;
	sprintCurrentDef = null;
	sprintSeriesSubject = null;
	sprintSeriesLeft = 0;
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false }); // pas de Vérifier (validation auto par question)
	resetChrono(); // le sprint a son propre compte à rebours
	const badge = filterLabel(sprintFilter);
	const badgeHTML = badge ? html`<span class="sprint-filter-badge">${badge}</span>` : VIDE;
	// Sans pression (#223) : on masque le minuteur ET le score live (révélés au bilan).
	// Le HUD ne garde alors que le badge éventuel ; sans badge, il n'est pas rendu du
	// tout (pas de barre vide au-dessus de la question).
	// Le badge « Pause » (#630) est rendu VIDE ET CACHÉ dès le lancement, à côté du
	// minuteur : le poser à la volée au premier clic sur « Écouter » ferait sauter la
	// largeur du HUD au moment précis où l'enfant attend le début de l'audio. Il porte
	// un MOT en plus de son picto — l'état « en pause » ne doit pas dépendre de la
	// seule couleur, qui est déjà prise par le rouge d'urgence du minuteur (`.low`).
	const hudContent = sprintSansPression
		? badgeHTML
		: html`<span class="sprint-time-wrap"
          ><span class="sprint-time" id="sprintTime">05:00</span
          ><span class="sprint-pause" id="sprintPause" hidden>${icon('pause')} Pause</span></span
        >
        ${badgeHTML}
        <span class="sprint-score" id="sprintScore">0 bonne réponse</span>`;
	const hud = hudContent.balisage
		? html`<div class="sprint-hud${sprintSansPression ? ' sprint-hud--calme' : ''}">${hudContent}</div>`
		: VIDE;
	// Région live du lecteur d'écran, créée VIDE et hors du stage : le stage est
	// réécrit à chaque question, or une région live insérée en même temps que son
	// texte n'est pas annoncée de façon fiable. Même pattern que le widget
	// d'appariement et « clique sur le mot ». Remplie par sprintAnnonce.
	document.getElementById('sheets')!.innerHTML = html`
    <div class="sprint">
      ${hud}
      <div class="sprint-stage" id="sprintStage"></div>
      <p class="sr-only" id="sprintStatus" role="status" aria-live="polite" aria-atomic="true"></p>
    </div>`.balisage;
	sprintRenderTime();
	const t0 = getTimer();
	if (t0) clearInterval(t0);
	setTimer(setInterval(sprintTick, 250));
	sprintNext();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function sprintTick() {
	if (!sprintDecompte) return;
	// Le décompte gèle de lui-même s'il a une cause active (correction, écoute).
	if (sprintDecompte.tic(Date.now()) <= 0) {
		sprintRenderTime();
		// Sans pression (#223) : pas de coupure sèche. On note que le temps est écoulé
		// et on stoppe le ticker ; la finalisation attend la fin de la question en cours
		// (validation correcte ou « Continuer » après une erreur — cf. sprintAnswer /
		// sprintContinue). Le temps reste plafonné à SPRINT_MS pour le record.
		if (sprintSansPression && !sprintTimeUp) {
			sprintTimeUp = true;
			const t = getTimer();
			if (t) clearInterval(t);
			return;
		}
		finalizeSprint();
		return;
	}
	sprintRenderTime();
}
function sprintRenderTime() {
	const el = document.getElementById('sprintTime');
	if (el && sprintDecompte) {
		const restant = sprintDecompte.restant(); // borné à zéro par le décompte lui-même
		el.textContent = fmt(restant);
		el.classList.toggle('low', restant <= 30000);
	}
}
function sprintUpdateScore() {
	const el = document.getElementById('sprintScore');
	if (el)
		el.textContent = `${sprintScore} bonne${sprintScore > 1 ? 's' : ''} réponse${sprintScore > 1 ? 's' : ''}`;
}

// Icône + libellé court par matière, pour signaler la matière de chaque
// question (cf. issue #54 : lisible instantanément par un enfant de CE2).
const SPRINT_SUBJECT_META: Record<string, { icon: IconName; label: string }> = {
	math: { icon: 'calculator', label: 'Maths' },
	francais: { icon: 'book-open', label: 'Français' },
};
function subjectTag(subject: string): SafeHtml {
	const meta = SPRINT_SUBJECT_META[subject] ?? {
		icon: 'book-open' as IconName,
		label: SUBJECTS.find((s) => s.id === subject)?.label ?? subject,
	};
	return html`<span class="sprint-subject sprint-subject-${subject}">${icon(meta.icon)} ${meta.label}</span>`;
}

// Choisit la prochaine leçon en gardant la même matière sur une mini-série de
// 2-3 questions, puis en changeant de matière si plusieurs sont disponibles.
function pickSprintDef(): LessonDef {
	const subjects = [...new Set(sprintLessonDefs.map((d) => d.subject))];
	if (
		sprintSeriesLeft <= 0 ||
		sprintSeriesSubject === null ||
		!subjects.includes(sprintSeriesSubject)
	) {
		const others = subjects.filter((s) => s !== sprintSeriesSubject);
		sprintSeriesSubject = choice(others.length ? others : subjects);
		sprintSeriesLeft = rnd(2, 3);
	}
	sprintSeriesLeft--;
	return choice(sprintLessonDefs.filter((d) => d.subject === sprintSeriesSubject));
}

// Génère et affiche la prochaine question (en évitant de répéter l'un des
// derniers items via une mémoire glissante). Les leçons dont l'ExerciseType
// propose un mode 'qcm' (conjugaison) sont posées en QCM : sous chrono, la
// frappe au clavier pénaliserait la vitesse (cf. issue #54).
/* Écrit (ou vide, avec '') l'annonce destinée au lecteur d'écran. */
function sprintAnnonce(texte: string): void {
	const el = document.getElementById('sprintStatus');
	if (el) el.textContent = texte;
}

/* ---------- Écouter l'énoncé (#630) ---------- */

/* Ce que la région live dit quand l'écoute arrête le temps, puis quand il repart.
   Le sprint est le seul mode où le décompte est un enjeu : un enfant qui ne voit
   pas le minuteur doit savoir que l'écoute ne lui coûte rien, sinon il n'osera pas
   s'en servir — et le bouton n'aura servi à rien. */
const ANNONCE_PAUSE = 'Lecture de la question. Le temps est en pause.';
const ANNONCE_REPRISE = 'Le temps repart.';
/* Une bonne réponse n'était signalée que par un « ✓ » à l'écran : rien pour qui
   ne voit pas l'écran, alors que la branche erreur, elle, annonçait déjà (SC 4.1.3). */
const ANNONCE_BONNE_REPONSE = 'Bonne réponse !';

/* Filet : au-delà de quoi on considère qu'une lecture ne finira pas. La synthèse
   vocale des navigateurs sait rester muette SANS émettre ni `end` ni `error` (bug
   connu des moteurs mobiles au-delà d'une quinzaine de secondes). Ailleurs dans
   l'application ce silence ne coûte qu'un bouton resté surligné ; ici il figerait le
   compte à rebours pour toujours, et un sprint qui ne tombe jamais à zéro ne se
   termine jamais — l'enfant est coincé dans sa partie. Les énoncés du mode tiennent
   en quelques secondes : 30 s laissent une marge confortable, et le pire cas est de
   rendre la main trop tôt, pas trop tard.
   `dicterConsigne` rappelant tout de même son `onDone` dans la quasi-totalité des
   cas, le filet est presque toujours désarmé sans avoir servi. */
const LECTURE_MAX_MS = 30000;
let sprintLectureFilet: ReturnType<typeof setTimeout> | null = null;

/* Désarme le filet en quittant la partie. Il se rattrapait de lui-même — le rappel
   relit l'état RÉEL du décompte du moment — mais un compte à rebours d'une partie
   finie qui reste armé au-dessus de la suivante n'a aucune raison d'exister, et
   c'est une ligne. */
function sprintDesarmerFilet(): void {
	if (sprintLectureFilet) clearTimeout(sprintLectureFilet);
	sprintLectureFilet = null;
}

/* L'énoncé À LIRE de la question courante, en attribut. Vide (leçon délibérément
   muette : `parle: ''` des homophones, où l'oral trahirait la réponse) ⇒ aucun
   bouton n'est greffé. Le gate tests/sprint-tts-gate.test.ts interdit qu'une leçon
   se retrouve dans ce cas SANS être exclue du sprint. */
const sprintTtsAttr = (q: Item | null): SafeHtml => {
	const texte = q ? texteItemParle(q) : '';
	return texte ? attribut('data-tts', texte) : VIDE;
};

/* La ligne « matière + leçon », commune aux TROIS rendus du mode (saisie, choix,
   correction) : c'est elle qui porte l'énoncé à lire et qui accueille le bouton
   « Écouter ». Un seul endroit, donc un bouton qui ne se déplace jamais d'une forme
   de question à l'autre — sous chrono, le rechercher coûterait à chaque question.
   PAS dans le HUD : celui-ci disparaît entièrement quand le minuteur est masqué,
   c'est-à-dire précisément pour les profils dont l'aménagement dys/TDAH est posé,
   ceux qui ont le plus besoin de l'oral. */
function sprintThemeHTML(def: LessonDef | null, q: Item | null): SafeHtml {
	return html`<div class="sprint-theme sprint-theme--ecoute"${sprintTtsAttr(q)}>${def ? subjectTag(def.subject) : ''}<span class="sprint-lesson">${def ? labelLecon(def, niveauLecon(def)) : ''}</span></div>`;
}

/* Greffe le bouton sur l'écran qui vient d'être rendu. Deux réglages propres au
   chrono : `auto: false` — le mode réécrit son écran à chaque question, donc la
   lecture automatique du profil ferait de CHAQUE question « la première » et
   enchaînerait 20 à 60 énoncés en 5 minutes — et `exclusif: true`, pour qu'un
   second clic ne relance pas une lecture par-dessus la première (deux gels du
   décompte qui se chevauchent, le temps repartant au milieu de l'audio). */
function sprintBindTts(stage: HTMLElement): void {
	bindConsigneTts(stage, { auto: false, exclusif: true, onLecture: sprintGelLecture });
}

/* Gel du décompte pendant la lecture, posé et retiré par le MÊME callback que
   l'état « ça parle » du bouton : deux états tenus en synchro à la main auraient
   fini par diverger, et c'est le décompte qui serait resté figé.

   L'écoute ne coûte donc rien à l'enfant — et ne lui achète rien non plus : le gel
   est borné à la durée de l'audio, il se lève tout seul à la fin, et changer de
   question coupe la lecture (cf. sprintNext). Réécouter dix fois ne fait gagner que
   dix fois le temps d'écouter. */
function sprintGelLecture(enCours: boolean): void {
	sprintDesarmerFilet();
	if (enCours) sprintLectureFilet = setTimeout(() => sprintGelLecture(false), LECTURE_MAX_MS);
	if (!sprintDecompte) return;
	const now = Date.now();
	// Le décompte peut DÉJÀ être gelé par une correction affichée. On le relève AVANT
	// de toucher aux causes : c'est ce qui distingue « l'écoute vient d'arrêter le
	// temps » de « le temps était déjà arrêté », et donc s'il y a quelque chose à dire.
	const gelaitDeja = sprintDecompte.enPause();
	if (enCours) sprintDecompte.geler('lecture', now);
	else sprintDecompte.degeler('lecture', now);
	sprintSyncPause();
	// L'annonce de mise en pause est tue quand une correction gelait déjà le temps :
	// elle écraserait, dans la région live, la correction que l'enfant est en train de
	// se faire lire. Celle de reprise ne part que si la région porte ENCORE la mise en
	// pause : sinon c'est qu'autre chose de plus récent s'y trouve (« Bonne réponse ! »,
	// une correction, ou le vide de la question suivante), et la recouvrir d'un
	// « Le temps repart. » hors sujet ferait perdre le message utile.
	const live = document.getElementById('sprintStatus');
	if (enCours && !gelaitDeja) sprintAnnonce(ANNONCE_PAUSE);
	else if (!enCours && !sprintDecompte.enPause() && live?.textContent === ANNONCE_PAUSE)
		sprintAnnonce(ANNONCE_REPRISE);
}

/* L'état visible du minuteur, DÉRIVÉ du décompte plutôt que poussé par chaque
   branche qui gèle ou dégèle. Le premier jet le poussait, et en oubliait une : après
   avoir écouté puis répondu faux, le liseré et le badge restaient allumés pour tout
   le reste de la partie, au-dessus d'un chiffre qui tournait de nouveau — soit
   exactement le contresens que le témoin est censé éviter. Un état recopié à la main
   dans trois branches finit toujours par en oublier une ; celui-ci se recalcule.

   Il suit la cause `'lecture'`, et pas la pause en général : une correction affichée
   gèle aussi le temps, mais elle ne montrait aucun témoin avant #630 et une partie
   sans écoute doit se comporter comme avant. L'écran de correction dit déjà, à lui
   seul, pourquoi l'enfant n'est plus en train de courir.

   Deux codages, aucun chromatique : le liseré est POINTILLÉ et le badge porte un MOT.
   La couleur est déjà prise par le rouge des 30 dernières secondes (`.low`). */
function sprintSyncPause(): void {
	const enPause = !!sprintDecompte?.gelePar('lecture');
	document.getElementById('sprintTime')?.classList.toggle('en-pause', enPause);
	const badge = document.getElementById('sprintPause');
	if (badge) badge.hidden = !enPause;
}

/* Une réponse telle qu'elle se LIT dans une phrase de correction : un signe de
   comparaison est NOMMÉ (« plus petit que (<) ») au lieu d'être laissé en glyphe nu,
   comme la ponctuation du runner QCM (#204). Un symbole isolé au milieu d'une phrase
   ne se lit ni à l'œil ni au lecteur d'écran. Dans l'ÉNONCÉ reconstitué, en revanche,
   le glyphe reste nu : « 12 < 15 » se lit très bien, « 12 plus petit que (<) 15 » non. */
function reponseLisible(valeur: string): string {
	const s = valeur.trim();
	return estSigneComparaison(s) ? `${signeView(s as SigneComparaison).label} (${s})` : valeur;
}

function sprintNext() {
	// Une lecture d'énoncé ne déborde JAMAIS sur la question suivante (#630) : sans
	// cette coupure, un enfant pourrait lancer l'audio d'un énoncé long, répondre
	// aussitôt, et voir le décompte rester gelé sur la question d'après — le seul
	// vrai passe-droit que l'écoute pouvait offrir. La coupure lève le gel d'elle-même
	// (dicterConsigne rappelle son `onDone` sur interruption).
	stopTts();
	sprintAnnonce(''); // la correction précédente ne survit pas à la question suivante
	let q: Item,
		def: LessonDef,
		choices: string[] | null,
		choicesView: ChoiceView[] | undefined,
		sym: boolean, // choix-symboles « < = > » (#380) : présentation glyphe + mot
		key: string,
		guard = 0;
	do {
		def = pickSprintDef();
		({ q, choices, choicesView, sym } = genSprintQuestion(def, niveauLecon(def)));
		key = commKey(q.text);
		guard++;
	} while (sprintRecentKeys.includes(key) && guard < 25);
	sprintRecentKeys.push(key);
	if (sprintRecentKeys.length > SPRINT_RECENT) sprintRecentKeys.shift();
	sprintCurrent = q;
	sprintCurrentDef = def;
	const stage = document.getElementById('sprintStage');
	if (!stage) return;
	if (choices) renderSprintQcm(stage, def, q, choices, choicesView, sym);
	else renderSprintTyped(stage, def, q);
}

// Entrée : pendant une correction (chrono en pause) elle enchaîne sur la
// question suivante comme le bouton « Continuer » ; sinon elle valide la saisie
// (utile pour la leçon 15 et ses étapes). Le listener est posé sur #sprintStage
// (persistant) : sans ce routage, son preventDefault bloquerait l'activation
// native de « Continuer » au clavier. Fonction nommée : addEventListener
// déduplique, pas d'accumulation de listeners.
function onSprintEnter(e: KeyboardEvent) {
	if (e.key !== 'Enter') return;
	e.preventDefault();
	// Auto-répétition du clavier (touche MAINTENUE) avalée, après le preventDefault : depuis
	// #467, une validation à vide compte une question et révèle la réponse. Sans ce filtre,
	// une touche Entrée gardée enfoncée enchaînerait « Continuer » puis un envoi à vide sur la
	// question suivante, et brûlerait des questions à la volée sans que l'enfant les ait vues.
	if (e.repeat) return;
	if (sprintEnCorrection()) sprintContinue();
	else sprintSubmit();
}

// Question à saisir (maths) : champ + bouton Valider.
function renderSprintTyped(stage: HTMLElement, def: LessonDef, q: Item) {
	const deco = def.id === 'math-decomposer-multiplication' ? ' deco' : '';
	stage.innerHTML = html`
    ${sprintThemeHTML(def, q)}
    ${figureBlock(q.figure)}
    <div class="sprint-q${deco}">${sprintQuestionBody(q)}</div>
    <p class="sprint-hint" id="sprintHint" hidden></p>
    <div class="sprint-actions"><button class="sprint-btn" id="sprintValidate">Valider</button></div>`.balisage;
	sprintBindTts(stage);
	document.getElementById('sprintValidate')?.addEventListener('click', sprintSubmit);
	stage.addEventListener('keydown', onSprintEnter);
	const champ = document.getElementById('sprintInput') as HTMLInputElement | null;
	champ?.addEventListener('input', () => {
		// Le message de refus disparaît dès que l'enfant retouche sa réponse : il a fait ce
		// qu'on lui demandait, le laisser affiché le contredirait.
		sprintCacheHint();
		sprintEchoFrappe(champ);
	});
	stage.querySelector('input')?.focus();
}

/* Écho de frappe (cf. `.sprint-input.frappe`) : relance le rebond à CHAQUE caractère.
   Retirer puis reposer la classe dans la même frame ne relancerait rien — le navigateur
   ne verrait aucun changement — d'où le passage par la frame suivante. Le respect de
   `prefers-reduced-motion` est porté par la feuille de style, pas ici. */
function sprintEchoFrappe(champ: HTMLInputElement): void {
	champ.classList.remove('frappe');
	requestAnimationFrame(() => champ.classList.add('frappe'));
}

/* Refus de saisie : la réponse n'est pas exploitable — pas un nombre là où un nombre est
   attendu (le champ VIDE, lui, n'est plus refusé : c'est la sortie de secours de #467).
   Ce n'est PAS une mauvaise réponse — rien n'est compté, rien n'est
   journalisé, et on n'ouvre surtout pas l'écran de correction, qui affirmerait une erreur
   de contenu qui n'a pas eu lieu. On GARDE la saisie, curseur en fin : redemander toute la
   séquence de frappe multiplierait les occasions de la rater (avis dys). Un submit sans
   effet visible étant vécu comme un bug, le message est aussi annoncé au lecteur d'écran. */
function sprintRefuse(inp: HTMLInputElement, message: string): void {
	const hint = document.getElementById('sprintHint');
	if (hint) {
		hint.textContent = message;
		hint.hidden = false;
	}
	sprintAnnonce(message);
	inp.focus();
	inp.setSelectionRange(inp.value.length, inp.value.length);
}

function sprintCacheHint(): void {
	const hint = document.getElementById('sprintHint');
	if (hint && !hint.hidden) {
		hint.hidden = true;
		hint.textContent = '';
	}
}

// Question à choix (conjugaison) : un clic sur une proposition vaut réponse.
function renderSprintQcm(
	stage: HTMLElement,
	def: LessonDef,
	q: Item,
	choices: string[],
	choicesView?: ChoiceView[],
	// Choix-symboles « < = > » (#380) : même présentation glyphe + mot que les
	// boutons de ponctuation (#204) — la classe conteneur porte la mise en forme.
	sym = false,
) {
	// `mathInline` : empile les fractions « num/den » de l'énoncé (barre horizontale).
	const question = poserAuTrou(mathInline(q.text), '@', html`<span class="sprint-blank">?</span>`);
	stage.innerHTML = html`
    ${sprintThemeHTML(def, q)}
    ${figureBlock(q.figure)}
    <div class="sprint-q sprint-q-qcm">${question}</div>
    <div class="sprint-choices${sym ? ' lqcm-choices-sym' : ''}">
      ${joindre(choices.map((c, i) => choiceButtonHTML(c, i, choicesView?.[i])))}
    </div>`.balisage;
	sprintBindTts(stage);
	stage.querySelectorAll<HTMLButtonElement>('.sprint-choice').forEach((btn) => {
		btn.addEventListener('click', () => sprintAnswer(choices[Number(btn.dataset.i)]));
	});
	// Le focus repart sur le premier choix, comme la branche saisie le pose sur son
	// champ (#630). Sans cette ligne, réécrire `stage.innerHTML` renvoyait le focus au
	// corps de page à CHAQUE question : sous chrono, le Tab suivant recommençait
	// depuis la barre du haut. Enter reste sans effet ici (pas de champ à valider),
	// donc rien ne peut être choisi par inadvertance.
	stage.querySelector<HTMLButtonElement>('.sprint-choice')?.focus();
}
// Corps de la question : champ unique, sauf leçon 15 où l'on affiche la
// décomposition avec des champs de brouillon (non corrigés) + le champ final.
export function sprintQuestionBody(q: Item) {
	// `enterkeyhint="done"` : la touche d'action du clavier virtuel annonce « OK » au lieu
	// d'un symbole générique, alors qu'elle VALIDE la réponse (elle ne passe pas au champ
	// suivant, il n'y en a pas). Une ligne, et un doute de moins sur la touche à utiliser.
	const main =
		q.kind === 'text'
			? html`<input id="sprintInput" class="sprint-input sprint-input-text" enterkeyhint="done" ${TEXT_ANSWER_INPUT_ATTRS}>`
			: html`<input id="sprintInput" class="sprint-input" inputmode="numeric" enterkeyhint="done" autocomplete="off">`;
	if (q._lesson !== 'math-decomposer-multiplication')
		return poserAuTrou(html`${q.text}`, '@', main);
	const m = q.text.match(/(\d+)\s*×\s*(\d+)/)!;
	const a = +m[1],
		b = +m[2];
	const free = html`<input class="sprint-free" inputmode="numeric" autocomplete="off">`;
	return html`${a} × ${b} = (${free} × ${free}) + (${free} × ${free}) = ${free} + ${free} = ${main}`;
}

// Cœur de la validation, commun à la saisie (maths) et au QCM (conjugaison).
// `sansTentative` (#467) : validation à VIDE assumée — l'enfant n'a rien proposé, donc
// demande de fait à voir la réponse. Traitée comme une réponse fausse (question comptée,
// aucun point, aucun XP, révélation), mais journalisée « passé sans essayer » pour
// l'encadrant. Seul `sprintSubmit` lève ce drapeau : un choix de QCM n'est jamais vide.
function sprintAnswer(raw: string, sansTentative = false) {
	if (!sprintActive || sprintEnCorrection()) return;
	const val = (raw || '').trim();
	// Une valeur vide ne vaut réponse que par le chemin explicite de `sprintSubmit` : ailleurs
	// (choix de QCM vide, appel défensif), il n'y a rien à corriger et rien à compter.
	if (val === '' && !sansTentative) return;
	sprintAnswered++;
	const lessonId = sprintCurrent!._lesson!;
	const b = sprintPerLesson[lessonId] || (sprintPerLesson[lessonId] = { ok: 0, total: 0 });
	b.total++;
	// Rien de proposé ⇒ faux par construction : on n'interroge pas la correction avec une
	// chaîne vide (un item dont la réponse attendue serait vide la validerait).
	if (!sansTentative && checkItemAnswer(sprintCurrent!, val)) {
		sprintScore++;
		b.ok++;
		addXP(1);
		sprintUpdateScore();
		// Annoncée AVANT de remplacer l'écran par le « ✓ » (#630) : seule la branche
		// erreur annonçait, donc un enfant au lecteur d'écran n'avait aucun signal que
		// sa réponse venait d'être acceptée (SC 4.1.3). Une seule annonce par question :
		// sprintNext videra la région avant la suivante.
		sprintAnnonce(ANNONCE_BONNE_REPONSE);
		const stage = document.getElementById('sprintStage');
		if (stage) stage.innerHTML = html`<div class="sprint-check">✓</div>`.balisage; // petite animation
		setTimeout(() => {
			if (!sprintActive || sprintEnCorrection()) return;
			if (sprintTimeUp)
				finalizeSprint(); // temps écoulé : on finalise après la question (#223)
			else sprintNext();
		}, 600);
	} else {
		// Journal des erreurs (#391) : une réponse fausse du sprint, pour l'espace encadrant.
		// Une fois par question (sprintAnswer n'est appelé qu'une fois par item).
		capterErreur({
			text: sprintCurrent!.text,
			figure: sprintCurrent!.figure,
			// Item passé (#467) : aucune réponse donnée. Avec le marqueur, l'encadrant remplace
			// la ligne « Réponse donnée » par « N'a pas essayé », au lieu d'afficher un vide.
			donnee: sansTentative ? '' : val,
			// Intercalation : la BANDE acceptée, pas l'exemple isolé (#446, cf. attendueItem).
			attendue: attendueItem(sprintCurrent!),
			lessonId,
			mode: 'sprint',
			sansTentative,
		});
		sprintShowCorrection(val, sprintCurrent!.answer, {
			parIntervalle: !!sprintCurrent!.intervalle,
			sansTentative,
		});
	}
}

function sprintSubmit() {
	const inp = document.getElementById('sprintInput') as HTMLInputElement | null;
	if (!inp) return;
	// Validation à VIDE (#467) : ne plus la refuser. Un enfant coincé n'avait aucune issue
	// (message de refus en boucle, ou abandon du sprint) ; elle vaut maintenant réponse fausse
	// assumée — révélation, question comptée, aucun point. Testée AVANT le filtre numérique
	// ci-dessous : un champ vide n'étant pas un nombre, il y serait sinon refusé.
	if (inp.value.trim() === '') {
		sprintAnswer('', true);
		return;
	}
	// Saisie qui n'est pas un nombre là où un nombre est attendu (« 3- » : un caractère
	// parasite atteignable sur le pavé numérique d'Android). Compter faux mesurerait une
	// erreur de calcul qui n'a pas eu lieu — l'enfant avait le bon résultat.
	// Le message NOMME le symptôme (« Ce n'est pas un nombre ») plutôt que la règle, et
	// dit « corrige » et non « écris » : la saisie est conservée, il s'agit de la retoucher,
	// pas de la retaper. Même tournure que le message de la fiche (avis rédacteur).
	if (sprintCurrent && itemEstNumerique(sprintCurrent) && !saisieEstNombre(inp.value)) {
		sprintRefuse(inp, "Ce n'est pas un nombre. Corrige ta réponse, puis valide.");
		return;
	}
	sprintAnswer(inp.value);
}

/* Rappel affiché à la place de « Tu as répondu … » quand l'enfant a validé sans rien
   écrire (#467). Constat NEUTRE, sans « tu » ni reproche : ce chemin sert de sortie de
   secours, l'y sermonner ferait payer deux fois un enfant déjà coincé. « cette fois »
   borne le constat à la question, et annonce implicitement qu'il y en a une autre après.
   Une seule constante, pour que le texte affiché et celui annoncé au lecteur d'écran ne
   puissent pas diverger. */
const RAPPEL_SANS_REPONSE = 'Pas de réponse cette fois.';

// Mauvaise réponse : on révèle la solution et on met le chrono en pause.
// `donnee` : la réponse RÉELLEMENT envoyée par l'enfant, rappelée avant la bonne réponse.
// Sans elle, l'énoncé re-rendu avec la solution dans le trou se lit comme SA réponse, et
// l'écran affirme alors « ta réponse est fausse, la bonne réponse était [le même nombre] » :
// une erreur de frappe (chiffre doublé, frappe perdue) devient indétectable, pour l'enfant
// comme pour l'encadrant. Même parti pris que le journal d'erreurs (#391) : la réponse
// donnée reste NEUTRE (jamais barrée, jamais en rouge), la bonne réponse est mise en avant.
// `parIntervalle` (#446) : l'item est corrigé par appartenance à un intervalle (intercaler)
// → la valeur révélée n'est qu'UN exemple. On passe alors au singulier INDÉFINI (« une
// réponse possible ») : affirmer « la bonne réponse » là où la consigne annonçait plusieurs
// réponses possibles se contredit, et laisse croire à l'enfant qu'il devait trouver CE
// nombre-là.
// `sansTentative` (#467) : validation à vide → il n'y a AUCUNE réponse donnée à rappeler.
// Le rappel devient un constat neutre (cf. RAPPEL_SANS_REPONSE) ; sans lui, la phrase
// « Tu as répondu . » s'afficherait avec un blanc à la place de la réponse.
function sprintShowCorrection(
	donnee: string,
	ans: number | string,
	{
		parIntervalle = false,
		sansTentative = false,
	}: { parIntervalle?: boolean; sansTentative?: boolean } = {},
) {
	sprintDecompte?.geler('correction', Date.now());
	const stage = document.getElementById('sprintStage');
	if (!stage) return;
	// Dans l'énoncé reconstitué, à la place du champ.
	const solBrute = html`<span class="sprint-sol">${String(ans)}</span>`;
	const solLue = reponseLisible(String(ans)); // dans la phrase de correction
	const donneeLue = reponseLisible(donnee);
	const amorce = parIntervalle ? 'Une réponse possible était' : 'La bonne réponse était';
	// « répondu » et non « écrit » : le sprint valide aussi au TAP (QCM de conjugaison,
	// signes « < = > »), où rien n'a été saisi au clavier.
	const rappelHTML = sansTentative
		? RAPPEL_SANS_REPONSE
		: html`Tu as répondu <strong>${donneeLue}</strong>.`;
	stage.innerHTML = html`
    ${sprintThemeHTML(sprintCurrentDef, sprintCurrent)}
    <div class="sprint-q wrong">${poserAuTrou(html`${sprintCurrent!.text}`, '@', solBrute)}</div>
    <div class="sprint-correction">
      <span class="sprint-donnee">${rappelHTML}</span>
      <span>${amorce} <strong>${solLue}</strong>. Prends le temps de la lire.</span>
    </div>
    <div class="sprint-actions"><button class="sprint-btn" id="sprintContinue">Continuer ▶</button></div>`.balisage;
	sprintBindTts(stage);
	// Le focus part sur « Continuer » (ci-dessous) : un lecteur d'écran n'annonce que
	// l'élément focalisé, donc sans cette ligne la correction ne serait jamais lue.
	const rappelLu = sansTentative ? RAPPEL_SANS_REPONSE : `Tu as répondu ${donneeLue}.`;
	sprintAnnonce(`${rappelLu} ${amorce} ${solLue}.`);
	const c = document.getElementById('sprintContinue');
	if (c) {
		c.addEventListener('click', sprintContinue);
		c.focus();
	}
}
function sprintContinue() {
	if (!sprintActive) return;
	sprintDecompte?.degeler('correction', Date.now()); // le compte à rebours repart
	if (sprintTimeUp)
		finalizeSprint(); // temps écoulé pendant la correction : on finalise (#223)
	else sprintNext();
}

function finalizeSprint() {
	if (!sprintActive) return;
	sprintActive = false;
	sprintDecompte = null;
	sprintDesarmerFilet();
	stopTts(); // le bilan n'a pas à hériter d'un énoncé encore en cours de lecture
	const t = getTimer();
	if (t) clearInterval(t);
	// Un sprint compte car il est allé au bout du temps : on enregistre tout.
	const streakDays = updateStreak().days;
	// Journalise aussi les franchissements de palier (frise d'évolution, #397), de lui-même :
	// le sprint n'attribue pas d'étoile, donc ne peut faire atteindre que « en cours ».
	recordLessonStats(sprintPerLesson, 'sprint'); // type journalisé pour le graphe d'activité (#319)
	// Récap éphémère (#537) : le sprint est la séance où l'enfant traverse le plus de
	// notions sans pouvoir les nommer. On mémorise lesquelles — en mémoire, jamais
	// persisté — MÊME quand l'écran de fin ne les affichera pas : c'est justement dans ce
	// cas que le récap du programme du jour en a besoin pour nommer sa tuile « Sprint ».
	const recapNotions = notionsDepuisPerLesson(sprintPerLesson);
	noterNotions('sprint', recapNotions);
	const medalInfo = recordRun('sprint', sprintScore, sprintAnswered, SPRINT_MS);
	const goalRes = updateGoal({ mode: 'sprint', sprint: true, isRecord: medalInfo.isRecord });
	const newTrophies = evaluateTrophies();
	const celeb: { icon: string; text: string }[] = [];
	if (medalInfo.isRecord) celeb.push({ icon: '🎉', text: 'Nouveau record de sprint !' });
	newTrophies.forEach((t) => celeb.push({ icon: t.icon, text: `Nouveau trophée : ${t.title}` }));
	if (goalRes.justDone) celeb.push({ icon: '🎯', text: 'Objectif du jour réussi !' });
	renderSprintResults(
		medalInfo,
		streakDays,
		recapAutonomeHTML('sprint', recapNotions, 'sprint-recap'),
	);
	// Passage de niveau pendant le sprint → modale dédiée, puis enchaînement.
	const niveauApres = niveauDepuisXP(getXP());
	announceRewards(
		niveauApres > sprintNiveauDepart ? niveauApres : 0,
		recompensesEntre(sprintNiveauDepart, niveauApres),
		celeb,
	);
}

/* `recap` (#537) : phrase nommant les notions traversées, déjà rendue par la couche récap
   (vide si le programme du jour va la nommer lui-même). Le chiffre reste l'objet de
   l'exercice ; le récap n'est qu'un épilogue SOUS lui. */
function renderSprintResults(medalInfo: RunResult, streakDays: number, recap: SafeHtml = VIDE) {
	const acc = sprintAnswered ? Math.round((sprintScore / sprintAnswered) * 100) : 0;
	let extra = '';
	if (medalInfo) {
		if (medalInfo.isRecord) extra += html`<div class="rb-record">🎉 Nouveau record !</div>`;
		extra += html`<div class="rb-rank">C'est ton ${medalInfo.rank}<sup>${medalInfo.rank === 1 ? 'er' : 'e'}</sup> meilleur sprint sur ${medalInfo.total}.${streakSuffix(streakDays)}</div>`;
	}
	const stage = document.getElementById('sprintStage');
	if (stage)
		stage.innerHTML = html`
    <div class="sprint-done">
      ${mascotteBulleHTML(encouragementMascotte())}
      <div class="sprint-done-big">${sprintScore}</div>
      <div class="sprint-done-lab">bonne${sprintScore > 1 ? 's' : ''} réponse${sprintScore > 1 ? 's' : ''} en 5 min</div>
      <div class="sprint-done-sub">${sprintAnswered} question${sprintAnswered > 1 ? 's' : ''} posée${sprintAnswered > 1 ? 's' : ''} · ${acc}% de réussite</div>
      ${extra}
      ${recap}
      <div class="sprint-actions">
        <button class="sprint-btn" id="sprintAgain">↻ Recommencer</button>
        <button class="sprint-btn ghost" id="sprintHome">${icon('house')} Accueil</button>
      </div>
    </div>`.balisage;
	const again = document.getElementById('sprintAgain');
	if (again) again.addEventListener('click', startSprint);
	const home = document.getElementById('sprintHome');
	if (home) home.addEventListener('click', goHome);
	sprintRenderTime();
	sprintUpdateScore();
}
