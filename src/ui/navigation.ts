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
import { LESSONS, fichesPagesHTML, buildFiches, bilanHTML } from '../core/lessons';
import { setInputCounter, setSessionItems, setRenderLesson, renderItem } from '../core/items';
import { startChrono, resetChrono } from './chrono';
import { renderToolbarProfile, renderHomeStats, renderLessons, renderProfiles } from './render';
import { runSprint, sprintCleanup } from './sprint';
import { closeProfileMenu } from './menu';

// État de session partagé (réassigné depuis sprint.ts / session.ts) : accesseurs dédiés.
let currentMode = null; // 'complet' | 'express' | 'lecon' | 'revision' | null
export const getCurrentMode = () => currentMode;
export const setCurrentMode = (v) => {
  currentMode = v;
};
let currentLessonNum = null; // numéro de leçon quand currentMode === 'lecon'
export const getCurrentLessonNum = () => currentLessonNum;
export const setCurrentLessonNum = (v) => {
  currentLessonNum = v;
};
let sessionRecorded = false; // l'essai en cours a-t-il déjà été enregistré ?
export const getSessionRecorded = () => sessionRecorded;
export const setSessionRecorded = (v) => {
  sessionRecorded = v;
};
let lastErrors = []; // items {text, answer} non réussis lors de la dernière vérification
export const getLastErrors = () => lastErrors;
export const setLastErrors = (v) => {
  lastErrors = v;
};
let pendingRevision = []; // items à réviser, transmis à la vue #revision
export const getPendingRevision = () => pendingRevision;
export const setPendingRevision = (v) => {
  pendingRevision = v;
};

// Déclencheurs (liés à l'UI)
export function goHome() {
  location.hash = 'accueil';
}
export function showLessons() {
  location.hash = 'lecons';
}
export function showProfiles() {
  location.hash = 'profils';
}
export function startComplet() {
  location.hash = 'complet';
}
export function startExpress() {
  location.hash = 'express';
}
export function startLecon(num) {
  if (LESSONS.find((l) => l.num === num)) location.hash = 'lecon-' + num;
}
export function startSprint() {
  // Déjà sur #sprint (bouton « Recommencer ») : on relance directement.
  if (location.hash === '#sprint') runSprint();
  else location.hash = 'sprint';
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
  if (h === 'complet') runComplet();
  else if (h === 'express') runExpress();
  else if (h === 'sprint') runSprint();
  else if (h === 'lecons') showLessonsView();
  else if (h === 'profils') showProfilesView();
  else if (h === 'revision') {
    if (pendingRevision.length) runRevision(pendingRevision);
    else showHomeView();
  } else if (h.startsWith('lecon-')) {
    const n = Number(h.slice(6));
    if (LESSONS.find((l) => l.num === n)) runLecon(n);
    else showHomeView();
  } else showHomeView(); // '' ou #accueil
}

/* Visibilité des boutons de la barre :
   - Vérifier : seulement pendant un exercice
   - Accueil : partout sauf sur l'accueil lui-même
   - Profil : sur les écrans « menu » (pas pendant un exercice) */
export function setToolbar({ verify, home, profile }) {
  const v: any = document.getElementById('btnVerify');
  const h = document.getElementById('btnHome');
  const p = document.getElementById('toolbarProfile');
  v.style.display = verify ? '' : 'none';
  v.disabled = !verify;
  h.style.display = home ? '' : 'none';
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
  currentLessonNum = null;
  document.getElementById('sheets').innerHTML = '';
  const sc = document.getElementById('score');
  sc.classList.add('hidden');
  sc.textContent = '';
  const old = document.getElementById('resultBanner');
  if (old) old.remove();
}

// Masque les écrans « menu » (accueil, sélecteur de leçons, profils)
export function hideMenus() {
  ['home', 'lessons', 'profils'].forEach((id) => {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  });
}

// Rendus des vues (sans toucher à l'historique)
export function showHomeView() {
  resetSessionUI();
  setToolbar({ verify: false, home: false, profile: true }); // accueil : profil visible, ni Vérifier ni Accueil
  hideMenus();
  document.getElementById('home').style.display = '';
  renderHomeStats();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showLessonsView() {
  resetSessionUI();
  setToolbar({ verify: false, home: true, profile: true }); // sélecteur : Accueil + profil
  hideMenus();
  renderLessons();
  document.getElementById('lessons').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function showProfilesView() {
  resetSessionUI();
  setToolbar({ verify: false, home: true, profile: true });
  hideMenus();
  renderProfiles();
  document.getElementById('profils').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function runComplet() {
  currentMode = 'complet';
  setInputCounter(0);
  setSessionItems({});
  // À l'écran : pas de page de garde ni de bilans, juste les 15 fiches.
  document.getElementById('sheets').innerHTML = fichesPagesHTML(buildFiches());
  afterStart();
}
export function runExpress() {
  currentMode = 'express';
  setInputCounter(0);
  setSessionItems({});
  // À l'écran : un seul bilan express.
  document.getElementById('sheets').innerHTML = bilanHTML(1);
  afterStart();
}
export function runLecon(num) {
  const lesson = LESSONS.find((l) => l.num === num);
  if (!lesson) {
    showHomeView();
    return;
  }
  currentMode = 'lecon';
  currentLessonNum = num;
  setInputCounter(0);
  setSessionItems({});
  setRenderLesson(num);
  const fiche = lesson.build();
  setRenderLesson(null);
  document.getElementById('sheets').innerHTML =
    `<div class="page">${fiche}<p class="foot">Ludaskia</p></div>`;
  afterStart();
}
/* Révision : on rejoue uniquement les items ratés (aucun enregistrement). */
export function runRevision(items) {
  currentMode = 'revision';
  currentLessonNum = null;
  setInputCounter(0);
  setSessionItems({});
  const grid = `<div class="grid c3">${items.map((it) => `<div class="op">${renderItem(it)}</div>`).join('')}</div>`;
  document.getElementById('sheets').innerHTML = `<div class="page">
    <p class="fiche-title">Révision — tes erreurs</p>
    <p class="fiche-sub">Reprends les calculs que tu n'avais pas réussis.</p>
    ${grid}<p class="foot">Ludaskia</p></div>`;
  afterStart();
}
export function afterStart() {
  sessionRecorded = false;
  hideMenus();
  const sc = document.getElementById('score');
  sc.classList.add('hidden');
  sc.textContent = '';
  setToolbar({ verify: true, home: true, profile: false }); // en exercice : pas de bouton profil
  startChrono();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Confort de saisie : on place le curseur sur le premier calcul.
  const first: any = document.querySelector('#sheets input');
  if (first) first.focus({ preventScroll: true });
}
