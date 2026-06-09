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
import { buildLessonFiche } from '../core/build';
import { setInputCounter, setSessionItems, renderItem } from '../core/items';
import type { Item } from '../core/items';
import { startChrono, resetChrono } from './chrono';
import { renderToolbarProfile, renderHomeStats, renderLessons, renderProfiles } from './render';
import { runSprint, sprintCleanup, renderSprintConfigScreen } from './sprint';
import { renderBilanConfigScreen } from './bilan';
import { renderSubjects, renderCategories, renderCategorie } from './catalog-nav';
import { SUBJECTS, CATEGORIES, ORTHO_CATEGORY_ID } from '../core/catalog';
import { loadOrtho } from '../core/orthographe/store';
import { listOrthoLecons } from '../core/orthographe/lessons';
import { renderOrthoListeForm } from './ortho-liste';
import { startOrthoRun } from './ortho-runner';
import { closeProfileMenu } from './menu';

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
  location.hash = 'accueil';
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
  location.hash = 'ortho-' + id;
}
export function goOrthoNew() {
  location.hash = 'ortho-new';
}
export function goOrthoEdit(id: string) {
  location.hash = 'ortho-edit-' + id;
}
export function showProfiles() {
  location.hash = 'profils';
}
export function startLecon(id: string) {
  if (getAllLessons().find((l) => l.id === id)) location.hash = 'lecon-' + id;
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
export function startRevision() {
  if (!lastErrors.length) return;
  pendingRevision = lastErrors.slice();
  // Déjà sur #revision : réassigner le hash ne déclencherait pas hashchange.
  if (location.hash === '#revision') runRevision(pendingRevision);
  else location.hash = 'revision';
}

export function route() {
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
  } else if (h.startsWith('matiere-')) {
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
  } else if (h === 'ortho-new') {
    showOrthoNewView();
  } else if (h.startsWith('ortho-edit-')) {
    showOrthoEditView(h.slice('ortho-edit-'.length));
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
  resetChrono();
  sprintCleanup(); // stoppe un éventuel sprint en cours (compte à rebours)
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
  if (!getLessonById(id)) {
    showHomeView();
    return;
  }
  currentMode = 'lecon';
  currentLessonId = id;
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
