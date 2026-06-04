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
let currentMode=null; // 'complet' | 'express' | 'lecon' | 'revision' | null
let currentLessonNum=null; // numéro de leçon quand currentMode === 'lecon'
let sessionRecorded=false; // l'essai en cours a-t-il déjà été enregistré ?
let lastErrors=[]; // items {text, answer} non réussis lors de la dernière vérification
let pendingRevision=[]; // items à réviser, transmis à la vue #revision

// Déclencheurs (liés à l'UI)
function goHome(){ location.hash='accueil'; }
function showLessons(){ location.hash='lecons'; }
function showProfiles(){ location.hash='profils'; }
function startComplet(){ location.hash='complet'; }
function startExpress(){ location.hash='express'; }
function startLecon(num){ if(LESSONS.find(l=>l.num===num)) location.hash='lecon-'+num; }
function startSprint(){
  // Déjà sur #sprint (bouton « Recommencer ») : on relance directement.
  if(location.hash==='#sprint') runSprint();
  else location.hash='sprint';
}
function startRevision(){
  if(!lastErrors.length) return;
  pendingRevision=lastErrors.slice();
  // Déjà sur #revision : réassigner le hash ne déclencherait pas hashchange.
  if(location.hash==='#revision') runRevision(pendingRevision);
  else location.hash='revision';
}

function route(){
  const h=(location.hash||'').replace(/^#/,'');
  if(h==='complet') runComplet();
  else if(h==='express') runExpress();
  else if(h==='sprint') runSprint();
  else if(h==='lecons') showLessonsView();
  else if(h==='profils') showProfilesView();
  else if(h==='revision'){ if(pendingRevision.length) runRevision(pendingRevision); else showHomeView(); }
  else if(h.startsWith('lecon-')){
    const n=Number(h.slice(6));
    if(LESSONS.find(l=>l.num===n)) runLecon(n); else showHomeView();
  }
  else showHomeView(); // '' ou #accueil
}

/* Visibilité des boutons de la barre :
   - Vérifier : seulement pendant un exercice
   - Accueil : partout sauf sur l'accueil lui-même
   - Profil : sur les écrans « menu » (pas pendant un exercice) */
function setToolbar({verify,home,profile}){
  const v=document.getElementById('btnVerify');
  const h=document.getElementById('btnHome');
  const p=document.getElementById('toolbarProfile');
  v.style.display=verify?'':'none'; v.disabled=!verify;
  h.style.display=home?'':'none';
  if(p){ p.style.display=profile?'':'none'; if(profile) renderToolbarProfile(); }
  closeProfileMenu(); // tout changement de vue referme le menu déroulant
}

// Remet l'UI dans l'état « hors session » (commun à l'accueil et au sélecteur)
function resetSessionUI(){
  resetChrono();
  sprintCleanup(); // stoppe un éventuel sprint en cours (compte à rebours)
  currentMode=null; currentLessonNum=null;
  document.getElementById('sheets').innerHTML='';
  const sc=document.getElementById('score'); sc.classList.add('hidden'); sc.textContent='';
  const old=document.getElementById('resultBanner'); if(old) old.remove();
}

// Masque les écrans « menu » (accueil, sélecteur de leçons, profils)
function hideMenus(){
  ['home','lessons','profils'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
}

// Rendus des vues (sans toucher à l'historique)
function showHomeView(){
  resetSessionUI();
  setToolbar({verify:false,home:false,profile:true}); // accueil : profil visible, ni Vérifier ni Accueil
  hideMenus();
  document.getElementById('home').style.display='';
  renderHomeStats();
  window.scrollTo({top:0,behavior:'smooth'});
}
function showLessonsView(){
  resetSessionUI();
  setToolbar({verify:false,home:true,profile:true}); // sélecteur : Accueil + profil
  hideMenus();
  renderLessons();
  document.getElementById('lessons').style.display='';
  window.scrollTo({top:0,behavior:'smooth'});
}
function showProfilesView(){
  resetSessionUI();
  setToolbar({verify:false,home:true,profile:true});
  hideMenus();
  renderProfiles();
  document.getElementById('profils').style.display='';
  window.scrollTo({top:0,behavior:'smooth'});
}
function runComplet(){
  currentMode='complet';
  inputCounter=0; sessionItems={};
  // À l'écran : pas de page de garde ni de bilans, juste les 15 fiches.
  document.getElementById('sheets').innerHTML=fichesPagesHTML(buildFiches());
  afterStart();
}
function runExpress(){
  currentMode='express';
  inputCounter=0; sessionItems={};
  // À l'écran : un seul bilan express.
  document.getElementById('sheets').innerHTML=bilanHTML(1);
  afterStart();
}
function runLecon(num){
  const lesson=LESSONS.find(l=>l.num===num);
  if(!lesson){ showHomeView(); return; }
  currentMode='lecon'; currentLessonNum=num;
  inputCounter=0; sessionItems={};
  renderLesson=num; const fiche=lesson.build(); renderLesson=null;
  document.getElementById('sheets').innerHTML=`<div class="page">${fiche}<p class="foot">Calcul mental CE2</p></div>`;
  afterStart();
}
/* Révision : on rejoue uniquement les items ratés (aucun enregistrement). */
function runRevision(items){
  currentMode='revision'; currentLessonNum=null;
  inputCounter=0; sessionItems={};
  const grid=`<div class="grid c3">${items.map(it=>`<div class="op">${renderItem(it)}</div>`).join('')}</div>`;
  document.getElementById('sheets').innerHTML=`<div class="page">
    <p class="fiche-title">Révision — tes erreurs</p>
    <p class="fiche-sub">Reprends les calculs que tu n'avais pas réussis.</p>
    ${grid}<p class="foot">Calcul mental CE2</p></div>`;
  afterStart();
}
function afterStart(){
  sessionRecorded=false;
  hideMenus();
  const sc=document.getElementById('score'); sc.classList.add('hidden'); sc.textContent='';
  setToolbar({verify:true,home:true,profile:false}); // en exercice : pas de bouton profil
  startChrono();
  window.scrollTo({top:0,behavior:'smooth'});
  // Confort de saisie : on place le curseur sur le premier calcul.
  const first=document.querySelector('#sheets input');
  if(first) first.focus({preventScroll:true});
}
