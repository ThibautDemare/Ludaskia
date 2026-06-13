/* ============================================================
   Navigation : routing par hash + rendu des vues
   ------------------------------------------------------------
   Chaque vue a un hash (#accueil, #lecons, #complet, #express,
   #lecon-N, #revision). Les déclencheurs ne font que CHANGER le
   hash : c'est ce qui crée une entrée dans l'historique. Le rendu
   réel est piloté par route(), branché sur hashchange — donc
   Précédent/Suivant du navigateur passent d'une vue à l'autre au
   lieu de quitter la page. On utilise le hash (et non
   history.pushState) pour rester compatible avec file://.
   ============================================================ */
import { getAllLessons, getLessonById } from '../core/catalog';
import { defaultMode } from '../core/exercise';
import type { ExerciseMode } from '../core/exercise';
import { escapeHTML } from '../core/utils';
import { buildLessonFiche } from '../core/build';
import { runLeconQcm } from './lecon-qcm';
import { runLeconTuiles } from './lecon-tuiles';
import { runLeconOrdre } from './lecon-ordre';
import { setInputCounter, setSessionItems, renderItem } from '../core/items';
import type { Item } from '../core/items';
import { startChrono, resetChrono } from './chrono';
import { renderToolbarProfile, renderHomeStats, renderLessons, renderProfiles } from './render';
import { runSprint, sprintCleanup, renderSprintConfigScreen } from './sprint';
import { runRevisionEspacee, revisionCleanup } from './revision';
import { renderBilanConfigScreen } from './bilan';
import { renderSubjects, renderCategories, renderCategorie } from './catalog-nav';
import { SUBJECTS, CATEGORIES, ORTHO_CATEGORY_ID } from '../core/catalog';
import { loadOrtho } from '../core/orthographe/store';
import { loadLessonRevisions } from '../core/progress';
import { countDue } from '../core/revision-select';
import { listOrthoLecons } from '../core/orthographe/lessons';
import { renderOrthoListeForm } from './ortho-liste';
import { renderOrthoRevoir } from './ortho-revoir';
import { startOrthoRun, orthoDiscoveryComplete, renderOrthoModeChoice } from './ortho-runner';
import { closeProfileMenu } from './menu';
import { applyPreferences, renderPreferences } from './preferences';
import { leconKey } from '../core/resume';
import { captureResume, clearResumeCtx, setResumeCtx, maybeRelaunch } from './resume';

// Icône de matière pour les cartes de reprise (#63).
const SUBJECT_ICON: Record<string, string> = { math: '🔢', francais: '📚' };

// État de session partagé (réassigné depuis sprint.ts / session.ts) : accesseurs dédiés.
let currentMode: string | null = null; // 'complet' | 'express' | 'lecon' | 'revision' | null
export const getCurrentMode = () => currentMode;
export const setCurrentMode = (v: string | null) => {
	currentMode = v;
};
let currentLessonId: string | null = null; // ID de leçon quand currentMode === 'lecon'
export const getCurrentLessonId = () => currentLessonId;
export const setCurrentLessonId = (v: string | null) => {
	currentLessonId = v;
};
let sessionRecorded = false; // l'essai en cours a-t-il déjà été enregistré ?
export const getSessionRecorded = () => sessionRecorded;
export const setSessionRecorded = (v: boolean) => {
	sessionRecorded = v;
};
// Mode choisi pour la prochaine leçon lancée (#69), lu et vidé par runLecon.
// null → mode par défaut du type d'exercice (rétro-compatible : reprise, accès direct).
let pendingLeconMode: ExerciseMode | null = null;
export const setPendingLeconMode = (v: ExerciseMode | null) => {
	pendingLeconMode = v;
};
let lastErrors: Item[] = []; // items {text, answer} non réussis lors de la dernière vérification
export const getLastErrors = () => lastErrors;
export const setLastErrors = (v: Item[]) => {
	lastErrors = v;
};
let pendingRevision: Item[] = []; // items à réviser, transmis à la vue #revision
export const getPendingRevision = () => pendingRevision;
export const setPendingRevision = (v: Item[]) => {
	pendingRevision = v;
};

// Déclencheurs (liés à l'UI)
export function goHome() {
	// Un exercice repris est rendu directement (sans changer le hash) : si on est
	// déjà sur #accueil, réassigner le hash ne déclencherait pas hashchange → on
	// rend la vue à la main (et resetSessionUI sauvegarde l'exercice en cours).
	if ((location.hash === '#accueil' || location.hash === '') && currentMode !== null) {
		showHomeView();
	} else {
		location.hash = 'accueil';
	}
}
export function showLessons() {
	location.hash = 'lecons';
}
export function startMatieres() {
	location.hash = 'matieres';
}
export function goCategories(subjectId: string) {
	location.hash = 'matiere-' + subjectId;
}
export function goCategorie(categoryId: string) {
	location.hash = 'categorie-' + categoryId;
}
export function startOrthoLecon(id: string) {
	// Liste découverte → choix du mode (#69) ; sinon lancement direct (découverte).
	location.hash = (orthoDiscoveryComplete(id) ? 'ortho-mode-' : 'ortho-') + id;
}
export function goOrthoNew() {
	location.hash = 'ortho-new';
}
export function goOrthoEdit(id: string) {
	location.hash = 'ortho-edit-' + id;
}
export function goOrthoRevoir(id: string) {
	location.hash = 'ortho-revoir-' + id;
}
export function showProfiles() {
	location.hash = 'profils';
}
export function startLecon(id: string) {
	const lesson = getLessonById(id);
	if (!lesson) return;
	// Plusieurs modes (ex. conjugaison saisie/QCM) → écran de choix (#69).
	if ((lesson.exerciseType.modes?.length ?? 0) > 1) {
		location.hash = 'mode-' + id;
		return;
	}
	// Mono-mode (ex. maths) : pas de choix. Reprise éventuelle → Continuer / Recommencer.
	maybeRelaunch(leconKey(id), lesson.label, () => {
		location.hash = 'lecon-' + id;
	});
}
/* Écran de choix du sous-exercice / mode (#69) : gros boutons dérivés des modes
   du type d'exercice (jamais codés en dur). Le mode conseillé est mis en avant. */
export function showModeChoice(id: string) {
	const lesson = getLessonById(id);
	const opts = lesson?.exerciseType.modes;
	if (!lesson || !opts || opts.length <= 1) {
		// Pas de choix réel → lancement direct (cohérent avec le mono-mode).
		startLecon(id);
		return;
	}
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	const sheets = document.getElementById('sheets')!;
	sheets.innerHTML = `<div class="mode-choice">
    <h2 class="mode-choice-title">Comment veux-tu t'entraîner ?</h2>
    <p class="mode-choice-lesson">${escapeHTML(lesson.label)}</p>
    <div class="mode-choice-list">
      ${opts
				.map(
					(
						m,
					) => `<button class="mode-btn${m.recommended ? ' recommended' : ''}" data-mode="${m.id}">
        <span class="mode-btn-ico" aria-hidden="true">${m.icon ?? '▶'}</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">${escapeHTML(m.label)}</span>
          ${
						m.recommended
							? '<span class="mode-btn-badge">conseillé</span>'
							: m.hint
								? `<span class="mode-btn-hint">${escapeHTML(m.hint)}</span>`
								: ''
					}
        </span>
      </button>`,
				)
				.join('')}
    </div>
  </div>`;
	sheets
		.querySelectorAll<HTMLButtonElement>('.mode-btn')
		.forEach((btn) => btn.addEventListener('click', () => chooseMode(id, btn.dataset.mode!)));
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
/* Lance la leçon dans le mode choisi. La saisie (fiche) garde l'offre de reprise ;
   le QCM (parcours « une question à la fois ») n'est pas repris. */
function chooseMode(id: string, mode: ExerciseMode) {
	const lesson = getLessonById(id);
	if (!lesson) return;
	setPendingLeconMode(mode);
	// Les modes « une question à la fois » (QCM, tuiles) ne sont pas des grilles :
	// pas d'offre de reprise. Seule la saisie (fiche grille) la propose.
	const type = lesson.exerciseType.generate(mode).type;
	if (type === 'qcm' || type === 'tuilesNombre' || type === 'tuilesOrdre') {
		location.hash = 'lecon-' + id;
	} else {
		maybeRelaunch(leconKey(id), lesson.label, () => {
			location.hash = 'lecon-' + id;
		});
	}
}
export function startSprint() {
	location.hash = 'sprint-config';
}
export function startBilanCustom() {
	location.hash = 'bilan-custom';
}
export function goCategorieBilan(categoryId: string) {
	location.hash = 'bilan-cat-' + categoryId;
}
export function startRevisionEspacee() {
	// Carte non actionnable quand rien n'est dû : on n'envoie pas l'enfant sur un
	// écran cul-de-sac (cf. état « rien à réviser » sur l'accueil).
	if (!countDue(loadOrtho(), loadLessonRevisions(), Date.now())) return;
	location.hash = 'revision-espacee';
}
export function startRevision() {
	if (!lastErrors.length) return;
	pendingRevision = lastErrors.slice();
	// Déjà sur #revision : réassigner le hash ne déclencherait pas hashchange.
	if (location.hash === '#revision') runRevision(pendingRevision);
	else location.hash = 'revision';
}

export function route() {
	// Applique le thème + le réglage d'animations du profil actif (couvre le
	// bootstrap et chaque bascule de profil, qui passent toutes par route()).
	applyPreferences();
	const h = (location.hash || '').replace(/^#/, '');
	if (h === 'sprint-config') showSprintConfigView();
	else if (h === 'sprint') runSprint();
	else if (h === 'bilan-custom') showBilanCustomView();
	else if (h.startsWith('bilan-cat-')) {
		const id = h.slice('bilan-cat-'.length);
		if (id !== ORTHO_CATEGORY_ID && CATEGORIES.find((c) => c.id === id)) showBilanCustomView(id);
		else showMatieresView();
	} else if (h === 'matieres') showMatieresView();
	else if (h === 'lecons') showLessonsView();
	else if (h === 'profils') showProfilesView();
	else if (h === 'revision') {
		if (pendingRevision.length) runRevision(pendingRevision);
		else showHomeView();
	} else if (h === 'revision-espacee') runRevisionEspacee();
	else if (h.startsWith('matiere-')) {
		const id = h.slice(8);
		if (SUBJECTS.find((s) => s.id === id)) showMatiereView(id);
		else showMatieresView();
	} else if (h.startsWith('categorie-')) {
		const id = h.slice(10);
		if (CATEGORIES.find((c) => c.id === id)) showCategorieView(id);
		else showMatieresView();
	} else if (h.startsWith('lecon-')) {
		const id = h.slice(6);
		if (getAllLessons().find((l) => l.id === id)) runLecon(id);
		else showHomeView();
	} else if (h.startsWith('mode-')) {
		const id = h.slice(5);
		if (getAllLessons().find((l) => l.id === id)) showModeChoice(id);
		else showHomeView();
	} else if (h === 'ortho-new') {
		showOrthoNewView();
	} else if (h.startsWith('ortho-edit-')) {
		showOrthoEditView(h.slice('ortho-edit-'.length));
	} else if (h.startsWith('ortho-mode-')) {
		showOrthoModeView(h.slice('ortho-mode-'.length));
	} else if (h.startsWith('ortho-revoir-')) {
		showOrthoRevoirView(h.slice('ortho-revoir-'.length));
	} else if (h.startsWith('ortho-')) {
		showOrthoRunView(h.slice(6));
	} else showHomeView(); // '' ou #accueil
}

/* Visibilité des boutons de la barre :
   - Vérifier : seulement pendant un exercice
   - Accueil : partout sauf sur l'accueil lui-même
   - Profil : sur les écrans « menu » (pas pendant un exercice) */
export function setToolbar({
	verify,
	home,
	profile,
	print = false,
}: {
	verify: boolean;
	home: boolean;
	profile: boolean;
	print?: boolean; // 🖨 « imprimer l'écran courant » : seulement en exercice (#40)
}) {
	const v = document.getElementById('btnVerify') as HTMLButtonElement;
	const h = document.getElementById('btnHome')!;
	const pr = document.getElementById('btnPrint');
	const p = document.getElementById('toolbarProfile');
	const xp = document.getElementById('xpBadge');
	v.style.display = verify ? '' : 'none';
	v.disabled = !verify;
	h.style.display = home ? '' : 'none';
	if (pr) pr.style.display = print ? '' : 'none';
	// Le badge XP suit la visibilité du profil (écrans « menu », pas en exercice).
	if (xp) xp.style.display = profile ? '' : 'none';
	if (p) {
		p.style.display = profile ? '' : 'none';
		if (profile) renderToolbarProfile();
	}
	closeProfileMenu(); // tout changement de vue referme le menu déroulant
}

// Remet l'UI dans l'état « hors session » (commun à l'accueil et au sélecteur)
function resetSessionUI() {
	// Avant d'effacer #sheets : sauvegarder l'exercice en cours s'il y a lieu (#63).
	captureResume();
	clearResumeCtx();
	resetChrono();
	sprintCleanup(); // stoppe un éventuel sprint en cours (compte à rebours)
	revisionCleanup(); // remet à zéro le drapeau « révision en cours » (#63)
	currentMode = null;
	currentLessonId = null;
	document.getElementById('sheets')!.innerHTML = '';
	const sc = document.getElementById('score')!;
	sc.classList.add('hidden');
	sc.textContent = '';
	const old = document.getElementById('resultBanner');
	if (old) old.remove();
}

// Masque les écrans « menu » (accueil, sélecteurs, profils, bilan/sprint, matières)
export function hideMenus() {
	[
		'home',
		'lessons',
		'profils',
		'bilan-custom',
		'sprint-config',
		'matieres',
		'categories',
		'categorie',
		'ortho-liste',
	].forEach((id) => {
		const e = document.getElementById(id);
		if (e) e.style.display = 'none';
	});
}

// Rendus des vues (sans toucher à l'historique)
export function showHomeView() {
	resetSessionUI();
	setToolbar({ verify: false, home: false, profile: true }); // accueil : profil visible, ni Vérifier ni Accueil
	hideMenus();
	document.getElementById('home')!.style.display = '';
	renderHomeStats();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showLessonsView() {
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true }); // sélecteur : Accueil + profil
	hideMenus();
	renderLessons();
	document.getElementById('lessons')!.style.display = '';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showProfilesView() {
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	renderPreferences();
	renderProfiles();
	document.getElementById('profils')!.style.display = '';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showMatieresView() {
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	renderSubjects(document.getElementById('matieresContent')!);
	document.getElementById('matieres')!.style.display = '';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showMatiereView(subjectId: string) {
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	renderCategories(
		document.getElementById('categoriesContent')!,
		subjectId,
		document.getElementById('categoriesTitle')!,
	);
	document.getElementById('categories')!.style.display = '';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showCategorieView(categoryId: string) {
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	renderCategorie(
		document.getElementById('categorieContent')!,
		categoryId,
		document.getElementById('categorieTitle')!,
	);
	// Lien « Retour » dynamique vers la matière parente.
	const cat = CATEGORIES.find((c) => c.id === categoryId);
	const back = document.getElementById('backCategorie') as HTMLAnchorElement | null;
	if (back && cat) back.dataset.subject = cat.subject;
	// L'orthographe (deux colonnes + sous-colonnes) profite de toute la largeur.
	document
		.getElementById('categorie')!
		.classList.toggle('categorie-ortho', categoryId === ORTHO_CATEGORY_ID);
	document.getElementById('categorie')!.style.display = '';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showOrthoListeView(listeId: string | null, title: string) {
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	document.getElementById('orthoListeTitle')!.textContent = title;
	renderOrthoListeForm(document.getElementById('orthoListeContent')!, listeId);
	document.getElementById('ortho-liste')!.style.display = '';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showOrthoNewView() {
	showOrthoListeView(null, 'Nouvelle liste');
}
function showOrthoEditView(id: string) {
	const lecon = listOrthoLecons(loadOrtho()).find((l) => l.id === id && l.source === 'liste');
	if (!lecon) {
		goCategorie(ORTHO_CATEGORY_ID);
		return;
	}
	showOrthoListeView(id, lecon.label);
}
function showOrthoRunView(id: string) {
	if (!listOrthoLecons(loadOrtho()).some((l) => l.id === id)) {
		goCategorie(ORTHO_CATEGORY_ID);
		return;
	}
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: false });
	hideMenus();
	startOrthoRun(id);
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
/* Page de relecture « Je relis mes mots » d'une liste (#80) : étude passive, pas un
   exercice → profil visible (comme un écran « menu »), ni Vérifier ni 🖨. */
function showOrthoRevoirView(id: string) {
	if (!listOrthoLecons(loadOrtho()).some((l) => l.id === id)) {
		goCategorie(ORTHO_CATEGORY_ID);
		return;
	}
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	renderOrthoRevoir(document.getElementById('sheets')!, id);
}
/* Écran de choix du mode d'une liste d'orthographe (#69). */
function showOrthoModeView(id: string) {
	const lecon = listOrthoLecons(loadOrtho()).find((l) => l.id === id);
	if (!lecon) {
		goCategorie(ORTHO_CATEGORY_ID);
		return;
	}
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	renderOrthoModeChoice(document.getElementById('sheets')!, id, lecon.label);
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showSprintConfigView() {
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	renderSprintConfigScreen(document.getElementById('sprintConfigContent')!);
	document.getElementById('sprint-config')!.style.display = '';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showBilanCustomView(categoryId?: string) {
	resetSessionUI();
	setToolbar({ verify: false, home: true, profile: true });
	hideMenus();
	renderBilanConfigScreen(document.getElementById('bilanCustomContent')!, categoryId);
	document.getElementById('bilan-custom')!.style.display = '';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function runLecon(id: string) {
	const lesson = getLessonById(id);
	if (!lesson) {
		showHomeView();
		return;
	}
	// Mode retenu (choix #69) ou défaut du type d'exercice. Consommé une fois.
	const mode = pendingLeconMode ?? defaultMode(lesson.exerciseType);
	pendingLeconMode = null;
	// Un mode produisant un QCM ou des tuiles se joue « une question à la fois »
	// (pas une fiche grille) — chacun son runner d'écran dédié.
	if (mode) {
		const t = lesson.exerciseType.generate(mode).type;
		if (t === 'qcm') {
			runLeconQcm(id, mode);
			return;
		}
		if (t === 'tuilesNombre') {
			runLeconTuiles(id, mode);
			return;
		}
		if (t === 'tuilesOrdre') {
			runLeconOrdre(id, mode);
			return;
		}
	}
	currentMode = 'lecon';
	currentLessonId = id;
	// Contexte de reprise : cette leçon devient « l'exercice en cours » (#63).
	setResumeCtx({
		key: leconKey(id),
		mode: 'lecon',
		label: lesson.label,
		icon: SUBJECT_ICON[lesson.subject] ?? '📘',
		categoryId: lesson.category,
		relaunch: { type: 'lecon', lessonId: id },
	});
	setInputCounter(0);
	setSessionItems({});
	const fiche = buildLessonFiche(id); // aiguille math (rendu riche) / autres matières (texte)
	document.getElementById('sheets')!.innerHTML =
		`<div class="page">${fiche}<p class="foot print-only">Ludaskia</p></div>`;
	afterStart();
}
/* Révision : on rejoue uniquement les items ratés (aucun enregistrement). */
export function runRevision(items: Item[]) {
	currentMode = 'revision';
	currentLessonId = null;
	setInputCounter(0);
	setSessionItems({});
	const grid = `<div class="grid c3">${items.map((it) => `<div class="op">${renderItem(it)}</div>`).join('')}</div>`;
	document.getElementById('sheets')!.innerHTML = `<div class="page">
    <p class="fiche-title">Révision — tes erreurs</p>
    <p class="fiche-sub">Reprends les calculs que tu n'avais pas réussis.</p>
    ${grid}<p class="foot print-only">Ludaskia</p></div>`;
	afterStart();
}
export function afterStart() {
	sessionRecorded = false;
	hideMenus();
	const sc = document.getElementById('score')!;
	sc.classList.add('hidden');
	sc.textContent = '';
	setToolbar({ verify: true, home: true, profile: false, print: true }); // exercice : pas de profil, 🖨 dispo
	startChrono();
	window.scrollTo({ top: 0, behavior: 'smooth' });
	// Confort de saisie : on place le curseur sur le premier calcul.
	const first = document.querySelector('#sheets input') as HTMLInputElement | null;
	if (first) first.focus({ preventScroll: true });
}
