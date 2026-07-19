/* ============================================================
   Mode Révision (issue #45) : rejoue les éléments « dus » selon la
   répétition espacée, REGROUPÉS PAR CATÉGORIE (jamais en alternance
   inter-matières). Un élément à la fois ; chaque réponse met à jour
   l'état SR (et donne 1 XP si réussie). Pas de chrono, pas de record.
   Rendu selon la nature : maths = saisie, conjugaison = QCM,
   orthographe = mot caché (on regarde, puis on écrit).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { bindConsigneTts } from './consigne-tts';
import { consigneRenforceeHTML } from './consigne-renforcee';
import { icon } from './icon';
import { getLessonById, genLessonItem, answerEstNumerique } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import { hasMode } from '../core/exercise';
import type { ChoiceView, QcmVariante } from '../core/exercise';
import { PONCT_MOTS } from './ponctuation-view';
import { mathInline } from '../core/fraction-text';
import type { Item } from '../core/items';
import {
	checkItemAnswer,
	createRenderContext,
	enonceTexte,
	figureBlock,
	renderItem,
	TEXT_ANSWER_INPUT_ATTRS,
} from '../core/items';
import { loadOrtho, saveOrtho, avancerMotRevision } from '../core/orthographe/store';
import type { OrthoState } from '../core/orthographe/types';
import {
	loadLessonRevisions,
	avancerLessonRevision,
	addXP,
	recordRun,
	recordSessionActivity,
} from '../core/progress';
import { selectDueGroups } from '../core/revision-select';
import { getRevisionPlafond } from '../core/profiles';
import { setToolbar, hideMenus, goHome, setCurrentMode, setCurrentLessonId } from './navigation';
import { bindTuileInteraction } from './tuile-interaction';

// `consigne` (#186) : libellé de la leçon, affiché au-dessus de l'exercice pour
// dire ce qu'on attend (le HUD ne montre que la catégorie). Absent pour les mots
// d'orthographe, qui portent déjà leur propre consigne.
// `consigneAction` (#265, cas `num`/posé) : consigne d'ACTION du type d'exercice
// (ExerciseType.consigne, ex. « Pose l'addition et calcule. »), propagée du repli
// fiche jusqu'en révision — indispensable à la posée, qui n'a pas d'énoncé textuel.
type RevItem = { groupLabel: string; consigne?: string } & (
	| { kind: 'num'; lessonId: string; item: Item; consigneAction?: string }
	| {
			kind: 'qcm';
			lessonId: string;
			item: Item;
			choices: string[];
			// Affichage RICHE optionnel des choix (#200), aligné par index sur `choices` :
			// fractions empilées (« 2/4 » → barre horizontale), etc. — comme la leçon (#264).
			choicesView?: ChoiceView[];
			variante?: QcmVariante;
			// Consigne renforcée + picto de la leçon (#203), propagés jusqu'en révision (#265).
			// `consigne` (commun au RevItem) porte le LIBELLÉ de leçon ; ces deux champs portent
			// l'ACTION (« Quel mot veut dire le contraire ? » + « ↔ »), affichée au-dessus de
			// l'énoncé comme dans le runner leçon (lecon-qcm.ts).
			consigneRenforcee?: string;
			picto?: string;
	  }
	| { kind: 'word'; wordId: string; mot: string }
	// Interactions « tuiles » rejouées telles quelles en révision (#186), sans clavier.
	| {
			kind: 'tuile';
			lessonId: string;
			question: string;
			answer: string;
			tuiles: string[];
			parle?: string;
	  }
	| { kind: 'ordre'; lessonId: string; question: string; ordre: string[]; tuiles: string[] }
	| {
			kind: 'tri';
			lessonId: string;
			question: string;
			categories: [string, string];
			mots: { mot: string; cat: 0 | 1 }[];
	  }
);

let items: RevItem[] = [];
let idx = 0;
let score = 0;
let ortho: OrthoState;
let active = false; // une révision est-elle EN COURS ? (garde-fou de sortie, #63)
let startTs = 0; // début de la session (durée enregistrée à la fin, #178)

// Exposé pour le garde-fou de sortie ; remis à zéro en quittant la vue.
export const isRevisionRunning = () => active;
export const revisionCleanup = () => {
	active = false;
};

export function runRevisionEspacee(): void {
	setCurrentMode('revision'); // non enregistré comme un bilan (pas de record)
	setCurrentLessonId(null);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false });
	ortho = loadOrtho();
	// Plafond réglé par profil dans l'espace encadrant (#439) ; défaut 12 si non réglé
	// (fallback + bornage assurés par getRevisionPlafond).
	const groups = selectDueGroups(ortho, loadLessonRevisions(), Date.now(), getRevisionPlafond());
	items = [];
	for (const g of groups) {
		for (const it of g.items) {
			if (it.kind === 'word') {
				const m = ortho.banque[it.id];
				if (m) items.push({ groupLabel: g.label, kind: 'word', wordId: it.id, mot: m.mot });
				continue;
			}
			const lesson = getLessonById(it.id);
			if (!lesson) continue;
			const type = lesson.exerciseType;
			const level = niveauLecon(lesson); // calibrage au niveau effectif (#225)
			const consigne = lesson.label; // consigne affichée = libellé de la leçon (#186)
			// QCM (conjugaison, homophones, géométrie…) : inchangé.
			if (hasMode(type, 'qcm')) {
				const ex = type.generate({ mode: 'qcm', level });
				if (ex.type === 'qcm')
					items.push({
						groupLabel: g.label,
						consigne,
						kind: 'qcm',
						lessonId: it.id,
						item: {
							text: ex.question,
							answer: ex.answer,
							kind: 'text',
							figure: ex.figure,
							parle: ex.parle,
						},
						choices: ex.choices,
						choicesView: ex.choicesView,
						variante: ex.variante,
						consigneRenforcee: ex.consigne,
						picto: ex.picto,
					});
				continue;
			}
			// Interactions « tuiles » natives, rejouées telles quelles en révision (#186) :
			// ranger une suite (ordre alpha) et ranger par thème (champs lexicaux).
			const ex = type.generate({ level });
			if (ex.type === 'tuilesOrdre') {
				items.push({
					groupLabel: g.label,
					consigne,
					kind: 'ordre',
					lessonId: it.id,
					question: ex.question,
					ordre: ex.ordre,
					tuiles: ex.tuiles,
				});
				continue;
			}
			if (ex.type === 'tuilesTri') {
				items.push({
					groupLabel: g.label,
					consigne,
					kind: 'tri',
					lessonId: it.id,
					question: ex.question,
					categories: ex.categories,
					mots: ex.mots,
				});
				continue;
			}
			// Réponse non numérique (signe <, =, >) + mode tuiles disponible → on rejoue en
			// tuiles plutôt qu'en saisie : un signe n'est pas saisissable au clavier numérique
			// sur mobile (#186).
			if (ex.type === 'text' && !answerEstNumerique(String(ex.answer)) && hasMode(type, 'tuiles')) {
				const tex = type.generate({ mode: 'tuiles', level });
				if (tex.type === 'tuilesNombre') {
					items.push({
						groupLabel: g.label,
						consigne,
						kind: 'tuile',
						lessonId: it.id,
						question: tex.question,
						answer: tex.answer,
						tuiles: tex.tuiles,
						parle: tex.parle,
					});
					continue;
				}
			}
			// Repli saisie (num / texte / heure / posé) : genLessonItem gère figure, heure et
			// l'opération posée.
			items.push({
				groupLabel: g.label,
				consigne,
				kind: 'num',
				lessonId: it.id,
				item: genLessonItem(lesson, level),
				consigneAction: type.consigne, // action « quoi faire » (#265) ; surtout pour la posée
			});
		}
	}
	idx = 0;
	score = 0;
	active = false;
	const sheets = document.getElementById('sheets')!;
	if (!items.length) {
		sheets.innerHTML = `<div class="revision"><div class="rev-done">
      <div class="rev-done-big">👍</div>
      <div class="rev-done-lab">Rien à réviser pour l'instant !</div>
      <div class="rev-done-sub">Reviens un autre jour : les notions à entretenir réapparaîtront ici.</div>
      <div class="rev-actions"><button class="rev-btn" id="revHome">${icon('house')} Accueil</button></div>
    </div></div>`;
		document.getElementById('revHome')!.addEventListener('click', goHome);
		return;
	}
	active = true; // révision réellement en cours (au moins un élément à réviser)
	startTs = Date.now();
	sheets.innerHTML = `<div class="revision">
    <div class="rev-hud">
      <span class="rev-prog" id="revProg"></span>
      <span class="rev-cat" id="revCat"></span>
    </div>
    <div class="rev-stage" id="revStage"></div>
  </div>`;
	bindEnter(); // une seule fois : #revStage persiste d'une question à l'autre
	renderCurrent();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHud() {
	const prog = document.getElementById('revProg');
	const cat = document.getElementById('revCat');
	if (prog) prog.textContent = `${idx + 1} / ${items.length}`;
	if (cat) cat.textContent = items[idx].groupLabel;
}

function renderCurrent() {
	updateHud();
	const it = items[idx];
	if (it.kind === 'qcm') renderQcm(it);
	else if (it.kind === 'word') renderWordLook(it);
	else if (it.kind === 'tuile') renderTuile(it);
	else if (it.kind === 'ordre') renderOrdre(it);
	else if (it.kind === 'tri') renderTri(it);
	else if (it.item.kind === 'posed') renderPosed(it);
	else renderNum(it);
	bindConsigneTts(document.getElementById('revStage')!); // bouton « Écouter » (#42)
}

/* Consigne (#186) : libellé de la leçon, affiché au-dessus de l'exercice (le HUD
   ne montre que la catégorie). Vide pour les items sans consigne (mots). */
function consigneHTML(it: RevItem): string {
	return it.consigne ? `<div class="rev-consigne">${escapeHTML(it.consigne)}</div>` : '';
}

/* Révision d'une opération posée (#97) : la grille de cellules, validée d'un coup
   (toutes les cellules-résultat justes = réussi). */
function renderPosed(it: Extract<RevItem, { kind: 'num' }>) {
	const stage = document.getElementById('revStage')!;
	// La grille posée n'a pas d'énoncé : la consigne d'action (#265) porte la lecture vocale.
	const actionHTML = consigneRenforceeHTML(it.consigneAction, undefined, it.consigneAction ?? '');
	// Contexte de rendu jetable (#352) : la révision valide les cellules via le DOM
	// (`.posee-input` + data-answer), pas via la table id→Item — inutile de la conserver.
	stage.innerHTML = `${consigneHTML(it)}${actionHTML}<div class="rev-q rev-posee">${renderItem(it.item, createRenderContext())}</div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div>`;
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const cells = [...stage.querySelectorAll<HTMLInputElement>('.posee-input')];
		const vide = cells.find((c) => c.value.trim() === '');
		if (vide) return vide.focus();
		const reussi = cells.every((c) => Number(c.value.trim()) === Number(c.dataset.answer));
		grade(reussi, String(it.item.answer));
	});
}

function renderNum(it: Extract<RevItem, { kind: 'num' }>) {
	const stage = document.getElementById('revStage')!;
	// Réponse non numérique (signe, nom de figure, heure « H h MM »…) → champ TEXTE
	// (clavier complet). `inputmode="numeric"` n'expose que les chiffres sur mobile,
	// d'où l'impossibilité de saisir un signe ou un mot en révision (#186).
	const texte = it.item.kind === 'text' || it.item.kind === 'heure';
	const champ = texte
		? `<input id="revInput" class="rev-input rev-input-text" ${TEXT_ANSWER_INPUT_ATTRS}>`
		: '<input id="revInput" class="rev-input" inputmode="numeric" autocomplete="off">';
	const q = enonceTexte(it.item.text).replace('@', champ);
	// Consigne d'action (#265) : si le type en fournit une, elle s'affiche au-dessus de
	// l'énoncé et porte la lecture vocale ; l'énoncé garde la sienne sinon. Aujourd'hui les
	// exos saisie portent l'instruction dans leur énoncé (consigneAction vide) ; cas générique.
	const actionHTML = consigneRenforceeHTML(it.consigneAction, undefined, it.consigneAction ?? '');
	const enonceTts = it.consigneAction ? '' : ttsAttr(it.item.parle ?? it.item.text);
	stage.innerHTML = `${consigneHTML(it)}${actionHTML}${figureBlock(it.item.figure)}<div class="rev-q"${enonceTts}>${q}</div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div>`;
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const inp = document.getElementById('revInput') as HTMLInputElement;
		if (inp.value.trim() === '') return inp.focus();
		grade(checkItemAnswer(it.item, inp.value), String(it.item.answer));
	});
	(document.getElementById('revInput') as HTMLInputElement).focus();
}

function renderQcm(it: Extract<RevItem, { kind: 'qcm' }>) {
	const stage = document.getElementById('revStage')!;
	// Ponctuation (#204) : en révision (rendu propre, sans boutons-symboles), le trou
	// devient un cadre pointillé NEUTRE — jamais un « ? », qui est ici l'une des trois
	// réponses — et les choix sont affichés par leur MOT (un « . » nu serait illisible).
	const ponct = it.variante === 'ponctuation';
	const blank = ponct
		? '<span class="lqcm-ponct-trou" aria-hidden="true"></span>'
		: '<span class="rev-blank">?</span>';
	// `enonceTexte` : échappe + GRAS « **…** » (#199/#203) + fractions empilées (#200),
	// comme les runners leçon et sprint — le chemin QCM de la révision l'avait oublié (#264).
	const q = enonceTexte(it.item.text).replace('@', blank);
	const ttsText = it.item.parle ?? it.item.text;
	// Consigne renforcée (#203) propagée en révision (#265) : ligne en gras + picto au-dessus
	// de l'énoncé (« Quel mot veut dire le contraire ? »), pour donner l'ACTION et pas
	// seulement le libellé de leçon. Comme dans le runner leçon (lecon-qcm.ts), elle porte
	// alors la lecture vocale globale (consigne + phrase) et l'énoncé n'a plus son propre
	// bouton « Écouter » (markup partagé via consigneRenforceeHTML).
	const consigneRenfHTML = consigneRenforceeHTML(it.consigneRenforcee, it.picto, ttsText);
	stage.innerHTML = `${consigneHTML(it)}${consigneRenfHTML}${figureBlock(it.item.figure)}<div class="rev-q rev-q-qcm"${it.consigneRenforcee ? '' : ttsAttr(ttsText)}>${q}</div>
    <div class="rev-choices">${it.choices
			.map((c, i) => {
				// Ponctuation (#204) : libellé MOT lisible (un « . » nu serait invisible) — on
				// n'utilise PAS les boutons-symboles de la leçon. Sinon, vue riche optionnelle
				// (#200/#264 : fractions empilées) rendue telle quelle, son libellé parlé en
				// aria-label ; à défaut, le texte du choix échappé.
				const view = ponct ? undefined : it.choicesView?.[i];
				const label = ponct ? (PONCT_MOTS[c] ?? c) : c;
				const inner = view ? view.html : escapeHTML(label);
				const aria = view
					? ` aria-label="${escapeHTML(view.label)}"`
					: ponct
						? ` aria-label="${escapeHTML(label)}"`
						: '';
				return `<button class="rev-choice" data-i="${i}"${aria}>${inner}</button>`;
			})
			.join('')}</div>`;
	stage.querySelectorAll<HTMLButtonElement>('.rev-choice').forEach((btn) => {
		btn.addEventListener('click', () =>
			grade(checkItemAnswer(it.item, it.choices[Number(btn.dataset.i)]), String(it.item.answer)),
		);
	});
}

/* Orthographe — phase 1 : on regarde le mot. */
function renderWordLook(it: Extract<RevItem, { kind: 'word' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = `<div class="rev-consigne">Regarde bien ce mot, puis écris-le sans le voir.</div>
    <div class="rev-word">${escapeHTML(it.mot)}</div>
    <div class="rev-actions"><button class="rev-btn" id="revHide">Cacher et écrire</button></div>`;
	document.getElementById('revHide')!.addEventListener('click', () => renderWordWrite(it));
}

/* Orthographe — phase 2 : on écrit le mot de mémoire. */
function renderWordWrite(it: Extract<RevItem, { kind: 'word' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = `<div class="rev-consigne">Écris le mot.</div>
    <div class="rev-q"><input id="revInput" class="rev-input rev-input-text" ${TEXT_ANSWER_INPUT_ATTRS}></div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div>`;
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const inp = document.getElementById('revInput') as HTMLInputElement;
		if (inp.value.trim() === '') return inp.focus();
		grade(checkItemAnswer({ text: '', answer: it.mot, kind: 'text' }, inp.value), it.mot);
	});
	(document.getElementById('revInput') as HTMLInputElement).focus();
}

/* ---------- Interactions « tuiles » (#186, mutualisées #345) ----------
   Le widget (rendu + tap/glisser + figeage avec marques ✓/✗) est partagé avec les
   runners de leçon via `bindTuileInteraction` (ui/tuile-interaction.ts). La
   révision garde son « chrome » : libellé de leçon (consigneHTML), bouton « Valider »
   et, à la validation, l'enregistrement SR. Le widget figé+marqué reste visible et
   le verdict s'insère EN DESSOUS (#revAfter), comme les runners — c'est ce qui
   fait apparaître les marques ✓/✗ en révision (correction de la divergence #345). */

/* Squelette commun aux trois interactions : consigne, point de montage du widget,
   et zone d'après-validation (Valider → verdict). `extra` insère la consigne-énoncé
   propre à l'ordre/au tri (la « tuile » porte la sienne dans son énoncé). */
function tuileStageHTML(it: RevItem, extra = ''): string {
	return `${consigneHTML(it)}${extra}
    <div data-tuile-mount></div>
    <div id="revAfter"><div class="rev-actions"><button class="rev-btn" id="revValidate" disabled>Valider</button></div></div>`;
}

/* Comparaison : amener LA bonne tuile (signe <, =, >) dans la case, sans clavier. */
function renderTuile(it: Extract<RevItem, { kind: 'tuile' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = tuileStageHTML(it);
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	const ctrl = bindTuileInteraction(
		stage,
		{ kind: 'tuile', question: it.question, answer: it.answer, tuiles: it.tuiles, parle: it.parle },
		{ variant: 'revision', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => {
		if (verif.disabled) return;
		gradeTuile(ctrl.verify(), it.answer);
	});
}

/* Ordre alphabétique : ranger les tuiles-mots dans des cases numérotées. */
function renderOrdre(it: Extract<RevItem, { kind: 'ordre' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = tuileStageHTML(
		it,
		`<p class="rev-q lord-consigne"${ttsAttr(it.question)}>${escapeHTML(it.question)}</p>`,
	);
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	const ctrl = bindTuileInteraction(
		stage,
		{ kind: 'ordre', question: it.question, ordre: it.ordre, tuiles: it.tuiles },
		{ variant: 'revision', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => {
		if (verif.disabled) return;
		gradeTuile(ctrl.verify(), it.ordre.join(' · '));
	});
}

/* Ranger par thème (champs lexicaux) : tap en deux temps (mot puis thème) ou glisser. */
function renderTri(it: Extract<RevItem, { kind: 'tri' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = tuileStageHTML(
		it,
		`<p class="rev-q lord-consigne"${ttsAttr(it.question)}>${escapeHTML(it.question)}</p>`,
	);
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	const ctrl = bindTuileInteraction(
		stage,
		{ kind: 'tri', question: it.question, categories: it.categories, mots: it.mots },
		{ variant: 'revision', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => {
		if (verif.disabled) return;
		const bon = ([0, 1] as const)
			.map(
				(col) =>
					`${it.categories[col]} : ${it.mots
						.filter((m) => m.cat === col)
						.map((m) => m.mot)
						.join(', ')}`,
			)
			.join(' — ');
		gradeTuile(ctrl.verify(), bon);
	});
}

// Entrée enchaîne sur l'action principale visible : après une réponse, le bouton
// « Continuer / Terminer » (#revNext) ; sinon « Valider » (#revValidate). Posé une
// seule fois sur #revStage (persistant) : son preventDefault bloquerait sinon
// l'activation native de « Continuer » au clavier.
function bindEnter() {
	const stage = document.getElementById('revStage')!;
	stage.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const btn = document.getElementById('revNext') ?? document.getElementById('revValidate');
		btn?.dispatchEvent(new Event('click'));
	});
}

/* Enregistre la réponse et met à jour l'état SR (1 XP si réussie). Sans DOM. */
function recordGrade(reussi: boolean) {
	const it = items[idx];
	const now = Date.now();
	if (it.kind === 'word') {
		avancerMotRevision(ortho, it.wordId, reussi, now);
		saveOrtho(ortho);
	} else {
		avancerLessonRevision(it.lessonId, reussi, now);
	}
	if (reussi) {
		score++;
		addXP(1);
	}
}

/* Verdict + bouton « Continuer / Terminer ». `mathInline` (= échappe + empile les
   fractions « n/d ») : la bonne réponse révélée s'affiche en barre horizontale comme
   les choix, pas en oblique (#264). Sans effet sur les réponses non fractionnaires. */
function verdictHTML(reussi: boolean, correct: string): string {
	const verdict = reussi
		? `<div class="rev-feedback ok">✓ Bravo !</div>`
		: `<div class="rev-feedback ko">✗ La bonne réponse : <strong>${mathInline(correct)}</strong></div>`;
	return `${verdict}
    <div class="rev-actions"><button class="rev-btn" id="revNext">${idx + 1 < items.length ? 'Continuer ▶' : 'Terminer'}</button></div>`;
}

function wireRevNext() {
	document.getElementById('revNext')!.addEventListener('click', next);
	document.getElementById('revNext')!.focus();
}

/* Saisie / QCM / mot / posée : pas de widget à conserver → le verdict remplace le stage. */
function grade(reussi: boolean, correct: string) {
	recordGrade(reussi);
	document.getElementById('revStage')!.innerHTML = verdictHTML(reussi, correct);
	wireRevNext();
}

/* Tuiles / ordre / tri : le widget vient d'être figé + marqué (✓/✗) par le binder ;
   on garde ces marques visibles et on insère le verdict EN DESSOUS (#revAfter), au
   lieu de remplacer tout le stage — sinon l'enfant ne verrait jamais les marques. */
function gradeTuile(reussi: boolean, correct: string) {
	recordGrade(reussi);
	document.getElementById('revAfter')!.innerHTML = verdictHTML(reussi, correct);
	wireRevNext();
}

function next() {
	idx++;
	if (idx >= items.length) return renderDone();
	renderCurrent();
}

function renderDone() {
	active = false; // terminée : plus rien à perdre, pas de confirmation de sortie
	// Une session de révision TERMINÉE compte comme une « révision » de la semaine
	// (objectif de régularité #178). Pas de classement ni de médaille : ce run
	// n'alimente aucun podium, il sert seulement au comptage via countSince.
	recordRun('revision-espacee', score, items.length, Date.now() - startTs);
	recordSessionActivity('revision'); // un point dans le graphe d'activité encadrant (#319)
	const stage = document.getElementById('revStage')!;
	if (!stage) return;
	document.querySelector('.rev-hud')?.remove();
	stage.innerHTML = `<div class="rev-done">
    <div class="rev-done-big">${score}/${items.length}</div>
    <div class="rev-done-lab">révision terminée</div>
    <div class="rev-done-sub">Les notions réussies reviendront plus tard, les autres plus tôt.</div>
    <div class="rev-actions"><button class="rev-btn" id="revHome">${icon('house')} Accueil</button></div>
  </div>`;
	document.getElementById('revHome')!.addEventListener('click', goHome);
}
