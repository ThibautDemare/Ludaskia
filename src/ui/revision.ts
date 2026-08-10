/* ============================================================
   Mode Révision (issue #45) : rejoue les éléments « dus » selon la
   répétition espacée, REGROUPÉS PAR CATÉGORIE (jamais en alternance
   inter-matières). Un élément à la fois ; chaque réponse met à jour
   l'état SR (et donne 1 XP si réussie). Pas de chrono, pas de record.
   Chaque erreur est journalisée pour l'espace encadrant (#391, mode 'revision').
   Rendu selon la nature : maths = saisie, conjugaison = QCM,
   orthographe = mot caché (on regarde — avec écoute possible —, puis on écrit ;
   à l'erreur, on rebascule sur l'atelier du mot, comme à l'entraînement).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { bindConsigneTts } from './consigne-tts';
import { dicter, dicteeDisponible } from './tts';
import { renderAtelier } from './ortho-atelier';
import { consigneRenforceeHTML } from './consigne-renforcee';
import { icon } from './icon';
import { getLessonById, genLessonItem, answerEstNumerique } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import { labelLecon } from '../core/levels';
import { hasMode, depuisTuilesNombre, consignePourNiveau } from '../core/exercise';
import type { ChoiceView, QcmVariante, TuilesSpec } from '../core/exercise';
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
import { groupeOrthoDuMot } from '../core/orthographe/lessons';
import { diffCorrect } from '../core/orthographe/diff';
import type { OrthoState, MotOrtho } from '../core/orthographe/types';
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
import { bindAppariement } from './appariement';
import { bindClicMot } from './clic-mot-interaction';
import {
	renderProblemeBoardHTML,
	corrigerEtapesProbleme,
	PROB_STATUS_HTML,
} from './lecon-probleme';
import { brouillonHTML, bindBrouillon } from './brouillon';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';
import type { TypeAide } from '../core/aide';
import { capterErreur, libelleChoix } from './erreur-capture';
import {
	ordreErreur,
	motsMalClasses,
	pairesErreur,
	analyserResultatPosee,
	attendueItem,
	attendueIntervalle,
} from '../core/erreur-representation';
import { joindrePhrase, libelleCible } from '../data/francais/grammaire-clic-mot';
import type { ProblemeEtape, ProbLexique, NatureOrdre } from '../core/exercise';

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
	// Interactions « tuiles » rejouées telles quelles en révision (#186), sans clavier. Les
	// champs venant de l'exercice sont pris en bloc via `TuilesSpec` (énoncé, bonne tuile,
	// tuiles, texte lu, et l'`intervalle` d'une intercalation) : les énumérer ici avait
	// justement fait oublier l'intervalle (#446), donc un verdict « LA bonne réponse : 4 002 »
	// et un journal à nombre isolé là où une BANDE était acceptée.
	| ({ kind: 'tuile'; lessonId: string } & TuilesSpec)
	| {
			kind: 'ordre';
			lessonId: string;
			question: string;
			ordre: string[];
			tuiles: string[];
			nature?: NatureOrdre; // mots (défaut) ou nombres (#448) — formulation du widget
	  }
	| {
			kind: 'tri';
			lessonId: string;
			question: string;
			categories: [string, string];
			mots: { mot: string; cat: 0 | 1 }[];
	  }
	// Moteurs « riches » rejoués tels quels en révision (#466), au lieu du repli champ
	// texte dégradé : le vrai widget interactif est monté, comme les tuiles/ordre/tri.
	| {
			kind: 'appariement';
			lessonId: string;
			question: string;
			paires: { gauche: string; droite: string }[];
			intrus: string[];
	  }
	// Problème : board complet (énoncé + TOUTES les sous-questions + brouillon), corrigé
	// étape par étape — perdre les étapes intermédiaires ou le brouillon dénaturait la
	// tâche « résoudre à étapes » (#466). `lex` porte le lexique d'affichage de la leçon.
	| {
			kind: 'probleme';
			lessonId: string;
			enonce: string;
			etapes: ProblemeEtape[];
			parle: string;
			figure?: string;
			explication?: string;
			lex?: ProbLexique;
	  }
	// « Clique sur le mot » : le vrai widget de sélection dans la phrase, monté via le
	// widget mutualisé — supprime le bruit orthographique de la recopie et gère les
	// consignes multi-mots sans ambiguïté (#466).
	| {
			kind: 'clicMot';
			lessonId: string;
			// Consigne d'ACTION propre à l'exercice (« Clique sur le verbe conjugué »),
			// distincte du libellé de leçon porté par `consigne` (commun au RevItem).
			actionConsigne: string;
			tokens: string[];
			cibleIndices: number[];
			explication: string;
			parle: string;
			cibleLabel?: string;
			// L'explication nomme déjà la cible (#436) → pas de double annonce en live region.
			explicationNommeCible?: boolean;
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
			// Consigne affichée = libellé de la leçon (#186), résolu au niveau joué (#436).
			const consigne = labelLecon(lesson, level);
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
					nature: ex.nature,
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
			// Moteurs « riches » : rejoués tels quels (widget interactif) plutôt que dégradés
			// en champ texte via genLessonItem (#466).
			if (ex.type === 'appariement') {
				items.push({
					groupLabel: g.label,
					consigne,
					kind: 'appariement',
					lessonId: it.id,
					question: ex.question,
					paires: ex.paires,
					intrus: ex.intrus ?? [],
				});
				continue;
			}
			if (ex.type === 'probleme') {
				items.push({
					groupLabel: g.label,
					consigne,
					kind: 'probleme',
					lessonId: it.id,
					enonce: ex.enonce,
					etapes: ex.etapes,
					parle: ex.parle,
					figure: ex.figure,
					explication: ex.explication,
					lex: type.probLexique,
				});
				continue;
			}
			if (ex.type === 'clicMot') {
				items.push({
					groupLabel: g.label,
					consigne,
					kind: 'clicMot',
					lessonId: it.id,
					actionConsigne: ex.consigne,
					tokens: ex.tokens,
					cibleIndices: ex.cibleIndices,
					explication: ex.explication,
					parle: ex.parle,
					cibleLabel: ex.cibleLabel,
					explicationNommeCible: ex.explicationNommeCible,
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
						// Conversion partagée (#446) : tout ce que porte l'exercice arrive ici, y
						// compris la bande d'une intercalation (verdict + journal). Pas de recopie.
						...depuisTuilesNombre(tex),
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
				// Action « quoi faire » (#265) ; surtout pour la posée. Résolue au niveau joué
				// (#436) : une leçon multi-niveaux ne formule pas forcément la tâche pareil.
				consigneAction: consignePourNiveau(type, level),
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
	else if (it.kind === 'appariement') renderAppariement(it);
	else if (it.kind === 'probleme') renderProbleme(it);
	else if (it.kind === 'clicMot') renderClicMot(it);
	else if (it.item.kind === 'posed') renderPosed(it);
	else renderNum(it);
	bindConsigneTts(document.getElementById('revStage')!); // bouton « Écouter » (#42)
	monterAide(it);
}

/* Aide contextuelle du geste (#272) — type d'aide correspondant à l'item, ou `undefined`
   quand la mécanique n'en demande pas (saisie, QCM, mot d'orthographe : on répond
   comme on écrit ou on choisit, il n'y a pas de geste à apprendre). */
function typeAideItem(it: RevItem): TypeAide | undefined {
	switch (it.kind) {
		case 'tuile':
			return 'tuiles';
		case 'ordre':
			return it.nature === 'nombres' ? 'ordreNombres' : 'ordre'; // même choix qu'en leçon
		case 'tri':
			return 'tri';
		case 'appariement':
			return 'appariement';
		case 'clicMot':
			return 'clicMot';
		default:
			return undefined;
	}
}

/* Pose l'aide du geste sur la carte, comme les runners de leçon le font sur la leur.
   La révision monte les MÊMES widgets (#186/#345/#466), donc les mêmes gestes — mais
   elle les sert hors de leur leçon, souvent des semaines plus tard : sans ce rappel,
   l'enfant qui a oublié comment RECTIFIER (retoucher un mot pour le désélectionner,
   toucher une tuile posée pour la reprendre…) n'a aucun moyen de le retrouver, et une
   fausse manœuvre devient une réponse fausse. Le bouton « ampoule » est reposé à chaque
   item (le rendu remplace tout `#revStage`) et suit donc le type de l'item courant ;
   la bulle automatique ne s'ouvre qu'au 1er geste de ce type jamais vu par le profil. */
function monterAide(it: RevItem): void {
	const stage = document.getElementById('revStage')!;
	const type = typeAideItem(it);
	// Le couloir réservé au bouton n'a de sens que si le bouton est là (styles).
	stage.classList.toggle('rev-stage--aide', !!type);
	if (!type) return;
	monterBoutonAide(stage, type);
	maybeAutoAide(type);
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
		if (!reussi) journaliserPosee(it, cells);
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
		const reussi = checkItemAnswer(it.item, inp.value);
		if (!reussi)
			capterRev({
				text: it.item.text,
				figure: it.item.figure,
				donnee: inp.value,
				// Intercalation : la BANDE acceptée, pas l'exemple isolé (#446, cf. attendueItem).
				attendue: attendueItem(it.item),
				lessonId: it.lessonId,
			});
		// Item corrigé par intervalle (intercaler) → verdict au singulier INDÉFINI (#446).
		grade(reussi, String(it.item.answer), !!it.item.intervalle);
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
		btn.addEventListener('click', () => {
			const choisi = it.choices[Number(btn.dataset.i)];
			const reussi = checkItemAnswer(it.item, choisi);
			// Libellé LISIBLE d'un choix, comme à l'écran : mot de ponctuation (un « . » nu
			// serait illisible dans le journal), sinon vue riche #200 (fraction empilée).
			const label = (v: string) =>
				ponct ? (PONCT_MOTS[v] ?? v) : libelleChoix(it.choices, it.choicesView, v);
			if (!reussi)
				capterRev({
					text: it.item.text,
					figure: it.item.figure,
					donnee: label(choisi),
					attendue: label(String(it.item.answer)),
					lessonId: it.lessonId,
				});
			grade(reussi, String(it.item.answer));
		});
	});
}

/* Mot d'orthographe (banque du profil) derrière un item de révision « word ». */
function motDeRevision(it: Extract<RevItem, { kind: 'word' }>): MotOrtho | undefined {
	return ortho.banque[it.wordId];
}

/* Bouton « Écouter le mot » d'un afficher/cacher en révision : le mode a besoin
   qu'on puisse (r)entendre le mot — surtout une fois caché — comme au parcours
   d'entraînement. Lit le mot, avec son « comme dans » pour lever l'ambiguïté d'un
   homophone. Rendu seulement si l'appareil a une voix FR (sinon pas de bouton mort).
   Réutilise le bouton `.rev-btn` (icône haut-parleur), comme les autres boutons. */
function ecouteMotHTML(m: MotOrtho | undefined): string {
	if (!m || !dicteeDisponible()) return '';
	return `<div class="rev-actions"><button type="button" class="rev-btn" id="revEcouter">${icon('speaker')} Écouter le mot</button></div>`;
}
function bindEcouteMot(m: MotOrtho | undefined): void {
	if (!m || !dicteeDisponible()) return;
	document
		.getElementById('revEcouter')
		?.addEventListener('click', () => dicter(m.mot, m.commeDans));
}

/* Orthographe — phase 1 : on regarde le mot (et on peut l'écouter). */
function renderWordLook(it: Extract<RevItem, { kind: 'word' }>) {
	const stage = document.getElementById('revStage')!;
	const m = motDeRevision(it);
	stage.innerHTML = `<div class="rev-consigne">Regarde bien ce mot, puis écris-le sans le voir.</div>
    <div class="rev-word">${escapeHTML(it.mot)}</div>
    ${ecouteMotHTML(m)}
    <div class="rev-actions"><button class="rev-btn" id="revHide">Cacher et écrire</button></div>`;
	bindEcouteMot(m);
	document.getElementById('revHide')!.addEventListener('click', () => renderWordWrite(it));
}

/* Orthographe — phase 2 : on écrit le mot de mémoire (l'écoute reste dispo). */
function renderWordWrite(it: Extract<RevItem, { kind: 'word' }>) {
	const stage = document.getElementById('revStage')!;
	const m = motDeRevision(it);
	stage.innerHTML = `<div class="rev-consigne">Écris le mot.</div>
    ${ecouteMotHTML(m)}
    <div class="rev-q"><input id="revInput" class="rev-input rev-input-text" ${TEXT_ANSWER_INPUT_ATTRS}></div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div>`;
	bindEcouteMot(m);
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const inp = document.getElementById('revInput') as HTMLInputElement;
		if (inp.value.trim() === '') return inp.focus();
		const saisie = inp.value;
		if (checkItemAnswer({ text: '', answer: it.mot, kind: 'text' }, saisie)) {
			grade(true, it.mot);
		} else {
			// Erreur : on enregistre l'échec SR, puis on rebascule sur l'atelier du mot
			// (parité avec le parcours d'entraînement) au lieu d'afficher le mot correct
			// sans correction interactive.
			// Énoncé : la phrase à trou du mot si on en a une (la plus parlante pour le
			// parent), sinon la tâche elle-même. Formulation distincte de celle de la dictée
			// (« sous la dictée ») : les deux exercices ne se confondent pas dans le journal.
			const ctx = motDeRevision(it)?.contexte;
			capterRev({
				text: ctx ? `${ctx.avant}…${ctx.apres}` : 'Mot à écrire de mémoire',
				donnee: saisie,
				attendue: it.mot,
				lessonId: groupeOrthoDuMot(ortho, it.wordId),
			});
			recordGrade(false);
			renderWordCorrection(it, saisie);
		}
	});
	(document.getElementById('revInput') as HTMLInputElement).focus();
}

/* Orthographe — correction d'un mot raté : réaffiche l'atelier du mot (le mot en
   grand, les lettres ratées soulignées via le diff) pour que l'enfant revoie où il
   s'est trompé et ré-entoure le piège, comme à l'entraînement. « Continuer → »
   persiste l'entourage et passe à l'item suivant. Repli sûr : sans MotOrtho en
   banque (cas improbable), on retombe sur le verdict simple. */
function renderWordCorrection(it: Extract<RevItem, { kind: 'word' }>, saisie: string) {
	const stage = document.getElementById('revStage')!;
	const m = motDeRevision(it);
	if (!m) {
		stage.innerHTML = verdictHTML(false, it.mot);
		wireRevNext();
		return;
	}
	renderAtelier(stage, m, {
		diff: diffCorrect(saisie, m.mot),
		consigne: "Presque ! Regarde où tu t'es trompé, puis entoure le piège.",
		ecoute: dicteeDisponible()
			? { label: 'Écouter le mot', onClick: () => dicter(m.mot, m.commeDans) }
			: undefined,
		onDone: () => {
			saveOrtho(ortho);
			next();
		},
	});
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
		const reussi = ctrl.verify();
		if (!reussi) {
			const rep = ctrl.reponse?.();
			capterRev({
				text: it.question,
				donnee: rep?.kind === 'tuile' ? (rep.posee ?? '') : '',
				// Intercalation : la BANDE acceptée, pas la seule tuile juste (#446) — même
				// formulation que la leçon en tuiles et que la fiche.
				attendue: it.intervalle ? attendueIntervalle(it.intervalle) : it.answer,
				lessonId: it.lessonId,
			});
		}
		// Verdict au singulier INDÉFINI quand la correction se fait par intervalle (#446).
		gradeTuile(reussi, it.answer, !!it.intervalle);
	});
}

/* Rangement d'une suite : ranger les tuiles dans des cases numérotées — mots dans
   l'ordre alphabétique (#108) ou nombres dans l'ordre demandé (#448, `nature`). */
function renderOrdre(it: Extract<RevItem, { kind: 'ordre' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = tuileStageHTML(
		it,
		`<p class="rev-q lord-consigne"${ttsAttr(it.question)}>${escapeHTML(it.question)}</p>`,
	);
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	const ctrl = bindTuileInteraction(
		stage,
		{ kind: 'ordre', question: it.question, ordre: it.ordre, tuiles: it.tuiles, nature: it.nature },
		{ variant: 'revision', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => {
		if (verif.disabled) return;
		const reussi = ctrl.verify();
		if (!reussi) {
			const rep = ctrl.reponse?.();
			// Séparateur accordé à la nature (#448) : « ; » pour des nombres, sinon la virgule
			// — le parent lit la même chose ici et depuis le runner de leçon.
			const { donnee, attendue } = ordreErreur(
				rep?.kind === 'ordre' ? rep.propose : [],
				it.ordre,
				it.nature,
			);
			capterRev({ text: it.question, donnee, attendue, lessonId: it.lessonId });
		}
		gradeTuile(reussi, it.ordre.join(' · '));
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
		const reussi = ctrl.verify();
		if (!reussi) {
			// Une entrée par mot MAL CLASSÉ (comme le runner de leçon) : on cible le mot sur
			// lequel aider, pas « le tri est faux ».
			const rep = ctrl.reponse?.();
			if (rep?.kind === 'tri')
				for (const mal of motsMalClasses(it.mots, it.categories, rep.placement))
					capterRev({
						text: `Ranger le mot « ${mal.mot} »`,
						donnee: mal.donnee,
						attendue: mal.attendue,
						lessonId: it.lessonId,
					});
		}
		const bon = ([0, 1] as const)
			.map(
				(col) =>
					`${it.categories[col]} : ${it.mots
						.filter((m) => m.cat === col)
						.map((m) => m.mot)
						.join(', ')}`,
			)
			.join(' — ');
		gradeTuile(reussi, bon);
	});
}

/* ---------- Moteurs « riches » rejoués en révision (#466) ---------- */

/* Appariement (#392) : relier les paires, comme à la leçon. Le widget mutualisé
   (bindAppariement) est monté sur le slot `[data-tuile-mount]` de tuileStageHTML ;
   à la validation il fige + marque chaque lien (✓/✗) et le verdict s'insère sous
   le widget (gradeTuile), avec les bonnes paires révélées en texte. */
function renderAppariement(it: Extract<RevItem, { kind: 'appariement' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = tuileStageHTML(
		it,
		`<p class="rev-q lapp-titre"${ttsAttr(it.question)}>${escapeHTML(it.question)}</p>`,
	);
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	const ctrl = bindAppariement(
		stage,
		{ question: it.question, paires: it.paires, intrus: it.intrus },
		{ variant: 'revision', onState: (complete) => (verif.disabled = !complete) },
	);
	verif.addEventListener('click', () => {
		if (verif.disabled) return;
		const reussi = ctrl.verify();
		if (!reussi) {
			const rep = ctrl.reponse?.();
			if (rep?.kind === 'appariement') {
				const { donnee, attendue } = pairesErreur(rep.liens, it.paires);
				capterRev({ text: it.question, donnee, attendue, lessonId: it.lessonId });
			}
		}
		gradeTuile(reussi, it.paires.map((p) => `${p.gauche} → ${p.droite}`).join(' · '));
	});
}

/* Résolution de problèmes (#199) : board COMPLET (énoncé + toutes les sous-questions
   + brouillon) plutôt que la seule question finale en champ texte (#466). Corrigé
   étape par étape comme le runner de leçon (chaque case marquée ✓/✗ + sa solution) ;
   réussi ⇔ toutes les étapes justes. Le brouillon (ardoise) reste disponible : sans
   support pour poser un calcul multi-étapes, on mesurerait la charge de travail, pas
   la compétence. Le verdict s'insère sous le board (les solutions sont déjà en place). */
function renderProbleme(it: Extract<RevItem, { kind: 'probleme' }>) {
	const stage = document.getElementById('revStage')!;
	const board = renderProblemeBoardHTML(
		{
			enonce: it.enonce,
			etapes: it.etapes,
			parle: it.parle,
			figure: it.figure,
			explication: it.explication,
		},
		it.lex,
	);
	stage.innerHTML = `${consigneHTML(it)}<div class="rev-q rev-probleme">${board}</div>
    ${brouillonHTML()}
    ${PROB_STATUS_HTML}
    <div id="revAfter"><div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div></div>`;
	bindBrouillon(stage); // ardoise de dessin repliable (#199) — l'énoncé garde sa lecture TTS
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const inputs = [...stage.querySelectorAll<HTMLInputElement>('.prob-input')];
		const vide = inputs.find((c) => c.value.trim() === '');
		if (vide) return vide.focus();
		// Correction partagée avec le runner de leçon (#466) : marque chaque étape (✓/✗ +
		// solution + aria-label) et annonce le résumé dans #probStatus. Le callback journalise
		// chaque SOUS-QUESTION ratée (#391), comme à la leçon — une entrée par étape, pas une
		// pour « le problème est faux » : c'est l'étape qui dit où l'enfant décroche.
		const toutJuste = corrigerEtapesProbleme(stage, it.etapes, (etape, saisie) =>
			capterRev({
				text: etape.question,
				donnee: saisie,
				attendue: String(etape.answer),
				lessonId: it.lessonId,
			}),
		);
		recordGrade(toutJuste);
		// Explication de stratégie (#252) affichée après la réponse quand la leçon la fournit.
		const extra = it.explication ? `<p class="lqcm-expl">${escapeHTML(it.explication)}</p>` : '';
		document.getElementById('revAfter')!.innerHTML = verdictHTML(toutJuste, undefined, extra);
		wireRevNext();
	});
	const first = stage.querySelector<HTMLInputElement>('.prob-input');
	if (first) first.focus();
}

/* « Clique sur le mot » (#259) : le vrai widget de sélection dans la phrase, monté
   via le widget mutualisé (bindClicMot) sur le slot `[data-tuile-mount]`. À la
   validation il fige + marque ✓/✗ et révèle le(s) bon(s) mot(s) en place ; le verdict
   (+ explication) s'insère sous la phrase. La consigne d'action de l'exercice s'affiche
   au-dessus (le libellé de leçon reste porté par consigneHTML). */
function renderClicMot(it: Extract<RevItem, { kind: 'clicMot' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = tuileStageHTML(
		it,
		`<p class="rev-q lclic-consigne"${ttsAttr(it.actionConsigne)}>${escapeHTML(it.actionConsigne)}</p>`,
	);
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	const ctrl = bindClicMot(
		stage,
		{
			tokens: it.tokens,
			cibleIndices: it.cibleIndices,
			parle: it.parle,
			cibleLabel: it.cibleLabel,
			// Justification annoncée dans la live region du widget (parité avec le feedback
			// visuel `extra` ci-dessous, pour un lecteur d'écran) — #466.
			explication: it.explication,
			explicationNommeCible: it.explicationNommeCible,
		},
		{ onState: (hasSelection) => (verif.disabled = !hasSelection) },
	);
	verif.addEventListener('click', () => {
		if (verif.disabled) return;
		const reussi = ctrl.verify();
		if (!reussi) {
			// Mots joints par `libelleCible` (source unique, comme le runner d'entraînement) :
			// une cible NON contiguë se lit « chien et pomme », pas « chien pomme ».
			const choisis = ctrl.selected();
			capterRev({
				text: `${it.actionConsigne} « ${joindrePhrase(it.tokens)} »`,
				donnee: choisis.length ? libelleCible(it.tokens, choisis) : '(aucun mot choisi)',
				attendue: libelleCible(it.tokens, it.cibleIndices),
				lessonId: it.lessonId,
			});
		}
		const extra = `<p class="lqcm-expl">${escapeHTML(it.explication)}</p>`;
		recordGrade(reussi);
		document.getElementById('revAfter')!.innerHTML = verdictHTML(reussi, undefined, extra);
		wireRevNext();
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
		// Si le focus est déjà sur un bouton (Écouter le mot, Continuer, ceux de l'atelier
		// de correction, un choix de QCM…), on laisse le navigateur l'activer nativement :
		// ce raccourci ne sert qu'à valider une SAISIE (#revInput, hors <form>) via Entrée.
		// Sans cette garde, Entrée sur un bouton injecté dans #revStage serait détournée vers
		// Valider/Continuer — mauvaise réponse enregistrée, boutons de l'atelier morts au clavier.
		if ((e.target as HTMLElement).tagName === 'BUTTON') return;
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

/* ---------- Journal des erreurs de la révision (#391) ----------
   La révision espacée journalise ses erreurs comme les runners d'entraînement, sous le
   mode 'revision' : c'est justement le moment où l'enfant rejoue ce qu'il rate, donc le
   signal le plus utile à l'encadrant — il manquait au journal. Chaque `render*` capture
   lui-même juste avant son `grade` / `gradeTuile` (comme les runners de leçon le font
   avant `wireNext`) : la réponse DONNÉE n'est connue que là, sous la forme propre au
   widget, et un tri ou un problème produit PLUSIEURS entrées (une par mot mal classé,
   une par sous-question ratée) qu'un point d'entrée unique ne saurait pas produire.
   Aucune capture pour une réussite. */
function capterRev(o: {
	text: string;
	figure?: string;
	donnee: string;
	attendue: string;
	lessonId: string | null;
}): void {
	capterErreur({ ...o, mode: 'revision' });
}

/* Grille posée : UNE entrée pour l'opération (jamais une par chiffre), comme la fiche en
   saisie. La grille n'a pas d'énoncé textuel → on le reconstruit depuis les opérandes
   (`item.posed`). Les cellules du RÉSULTAT sont les DERNIÈRES de la grille (les produits
   partiels d'une multiplication à deux chiffres les précèdent) ; on ne journalise que si
   leurs chiffres attendus recomposent bien la réponse, garde-fou si la disposition de la
   grille changeait. Comme la fiche, une erreur portant UNIQUEMENT sur une retenue ou un
   produit partiel n'est pas journalisée (rien de lisible à montrer au parent) : le résultat
   final est alors juste. */
function journaliserPosee(it: Extract<RevItem, { kind: 'num' }>, cells: HTMLInputElement[]): void {
	const p = it.item.posed;
	if (!p) return;
	const attendue = String(it.item.answer);
	const res = cells.slice(-attendue.length);
	if (res.map((c) => c.dataset.answer ?? '').join('') !== attendue) return;
	const analyse = analyserResultatPosee(
		res.map((c, pos) => ({
			pos,
			saisie: c.value.trim(),
			correct: Number(c.value.trim()) === Number(c.dataset.answer),
		})),
	);
	if (!analyse.journaliser) return;
	capterRev({
		text: `${p.a} ${p.op === 'x' ? '×' : p.op} ${p.b}`,
		donnee: analyse.donnee,
		attendue,
		lessonId: it.lessonId,
	});
}

/* Verdict + bouton « Continuer / Terminer ». `mathInline` (= échappe + empile les
   fractions « n/d ») : la bonne réponse révélée s'affiche en barre horizontale comme
   les choix, pas en oblique (#264). Sans effet sur les réponses non fractionnaires. */
function verdictHTML(reussi: boolean, correct?: string, extra = '', parIntervalle = false): string {
	// `correct` absent (moteurs qui révèlent EUX-MÊMES la bonne réponse en place —
	// problème marqué étape par étape, clic-mot surligné) → verdict d'échec neutre,
	// sans ligne « La bonne réponse : … » redondante. `extra` insère un complément
	// (ex. l'explication de stratégie) entre le verdict et le bouton.
	// `parIntervalle` (#446) : item corrigé par appartenance à un intervalle (intercaler) →
	// la valeur montrée n'est qu'UN exemple ; on ne lui donne donc pas le statut de réponse
	// unique, sinon la correction contredit la consigne (« plusieurs réponses possibles »).
	const label = parIntervalle ? 'Une réponse possible' : 'La bonne réponse';
	const verdict = reussi
		? `<div class="rev-feedback ok">✓ Bravo !</div>`
		: correct
			? `<div class="rev-feedback ko">✗ ${label} : <strong>${mathInline(correct)}</strong></div>`
			: `<div class="rev-feedback ko">✗ Regarde la correction, puis continue.</div>`;
	return `${verdict}${extra}
    <div class="rev-actions"><button class="rev-btn" id="revNext">${idx + 1 < items.length ? 'Continuer ▶' : 'Terminer'}</button></div>`;
}

function wireRevNext() {
	document.getElementById('revNext')!.addEventListener('click', next);
	document.getElementById('revNext')!.focus();
}

/* Saisie / QCM / mot / posée : pas de widget à conserver → le verdict remplace le stage.
   `parIntervalle` (#446) : voir verdictHTML (réponse non unique → singulier indéfini). */
function grade(reussi: boolean, correct: string, parIntervalle = false) {
	recordGrade(reussi);
	document.getElementById('revStage')!.innerHTML = verdictHTML(reussi, correct, '', parIntervalle);
	wireRevNext();
}

/* Tuiles / ordre / tri : le widget vient d'être figé + marqué (✓/✗) par le binder ;
   on garde ces marques visibles et on insère le verdict EN DESSOUS (#revAfter), au
   lieu de remplacer tout le stage — sinon l'enfant ne verrait jamais les marques.
   `parIntervalle` (#446) : voir verdictHTML (réponse non unique → singulier indéfini). */
function gradeTuile(reussi: boolean, correct: string, parIntervalle = false) {
	recordGrade(reussi);
	document.getElementById('revAfter')!.innerHTML = verdictHTML(reussi, correct, '', parIntervalle);
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
