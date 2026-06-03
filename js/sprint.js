/* ============================================================
   Mode Sprint : 5 minutes, un max de bonnes réponses, calculs
   tirés au hasard et générés un par un (pas de preview).
   - bonne réponse → petite animation ✓ puis question suivante
     (le compte à rebours continue)
   - mauvaise réponse → on révèle la bonne réponse et on MET LE
     CHRONO EN PAUSE jusqu'à ce que l'élève clique « Continuer »
   - validation sur Entrée OU bouton « Valider »
   - un sprint ne compte que s'il va au bout des 5 minutes
   ============================================================ */
const SPRINT_MS=300000; // 5 minutes

let sprintActive=false, sprintPaused=false;
let sprintRemaining=SPRINT_MS, sprintLastTick=0;
let sprintScore=0, sprintAnswered=0;
let sprintPerLesson={}, sprintLastKey='', sprintCurrent=null;

// Stoppe proprement un sprint en cours (appelé en quittant la vue).
function sprintCleanup(){ sprintActive=false; sprintPaused=false; }

function runSprint(){
  currentMode='sprint'; currentLessonNum=null;
  sprintActive=true; sprintPaused=false;
  sprintRemaining=SPRINT_MS; sprintScore=0; sprintAnswered=0;
  sprintPerLesson={}; sprintLastKey=''; sprintCurrent=null;
  document.getElementById('home').style.display='none';
  document.getElementById('lessons').style.display='none';
  setToolbar({verify:false,home:true}); // pas de Vérifier (validation auto par question)
  resetChrono();                          // le sprint a son propre compte à rebours
  document.getElementById('sheets').innerHTML=`
    <div class="sprint">
      <div class="sprint-hud">
        <span class="sprint-time" id="sprintTime">05:00</span>
        <span class="sprint-score" id="sprintScore">0 bonne réponse</span>
      </div>
      <div class="sprint-stage" id="sprintStage"></div>
    </div>`;
  sprintRenderTime();
  sprintLastTick=Date.now();
  clearInterval(timer); timer=setInterval(sprintTick,250);
  sprintNext();
  window.scrollTo({top:0,behavior:'smooth'});
}

function sprintTick(){
  const now=Date.now();
  if(!sprintPaused) sprintRemaining-=now-sprintLastTick; // gelé pendant une correction
  sprintLastTick=now;
  if(sprintRemaining<=0){ sprintRemaining=0; sprintRenderTime(); finalizeSprint(); return; }
  sprintRenderTime();
}
function sprintRenderTime(){
  const el=document.getElementById('sprintTime');
  if(el){ el.textContent=fmt(Math.max(0,sprintRemaining)); el.classList.toggle('low',sprintRemaining<=30000); }
}
function sprintUpdateScore(){
  const el=document.getElementById('sprintScore');
  if(el) el.textContent=`${sprintScore} bonne${sprintScore>1?'s':''} réponse${sprintScore>1?'s':''}`;
}

// Génère et affiche la prochaine question (en évitant un doublon immédiat).
function sprintNext(){
  let q,key,guard=0;
  do{ const k=rnd(1,15); q=bilanQ(k); q._lesson=k; key=commKey(q.text); guard++; }
  while(key===sprintLastKey && guard<25);
  sprintLastKey=key; sprintCurrent=q;
  const stage=document.getElementById('sprintStage'); if(!stage) return;
  stage.innerHTML=`
    <div class="sprint-q">${escapeHTML(q.text).replace('@','<input id="sprintInput" class="sprint-input" inputmode="numeric" autocomplete="off">')}</div>
    <div class="sprint-actions"><button class="sprint-btn" id="sprintValidate">Valider</button></div>`;
  const val=document.getElementById('sprintValidate'); if(val) val.addEventListener('click',sprintSubmit);
  const inp=document.getElementById('sprintInput');
  if(inp){ inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); sprintSubmit(); } }); inp.focus(); }
}

function sprintSubmit(){
  if(!sprintActive||sprintPaused) return;
  const inp=document.getElementById('sprintInput'); if(!inp) return;
  const raw=(inp.value||'').trim().replace(',','.');
  if(raw===''){ inp.focus(); return; } // pas de validation à vide
  sprintAnswered++;
  const ln=sprintCurrent._lesson;
  const b=sprintPerLesson[ln]||(sprintPerLesson[ln]={ok:0,total:0}); b.total++;
  if(Number(raw)===Number(sprintCurrent.answer)){
    sprintScore++; b.ok++; sprintUpdateScore();
    const stage=document.getElementById('sprintStage');
    if(stage) stage.innerHTML=`<div class="sprint-check">✓</div>`; // petite animation
    setTimeout(()=>{ if(sprintActive&&!sprintPaused) sprintNext(); },600);
  }else{
    sprintShowCorrection(sprintCurrent.answer);
  }
}

// Mauvaise réponse : on révèle la solution et on met le chrono en pause.
function sprintShowCorrection(ans){
  sprintPaused=true;
  const stage=document.getElementById('sprintStage'); if(!stage) return;
  stage.innerHTML=`
    <div class="sprint-q wrong">${escapeHTML(sprintCurrent.text).replace('@','<span class="sprint-sol">'+ans+'</span>')}</div>
    <div class="sprint-correction">La bonne réponse était <strong>${ans}</strong>. Prends le temps de la lire.</div>
    <div class="sprint-actions"><button class="sprint-btn" id="sprintContinue">Continuer ▶</button></div>`;
  const c=document.getElementById('sprintContinue');
  if(c){ c.addEventListener('click',sprintContinue); c.focus(); }
}
function sprintContinue(){
  if(!sprintActive) return;
  sprintPaused=false; // le compte à rebours repart
  sprintNext();
}

function finalizeSprint(){
  if(!sprintActive) return;
  sprintActive=false; sprintPaused=false; clearInterval(timer);
  // Un sprint compte car il est allé au bout du temps : on enregistre tout.
  const streakDays=updateStreak().days;
  recordLessonStats(sprintPerLesson);
  const medalInfo=recordRun('sprint',sprintScore,sprintAnswered,SPRINT_MS);
  const goalRes=updateGoal({mode:'sprint',sprint:true,isRecord:medalInfo.isRecord});
  const newTrophies=evaluateTrophies();
  const celeb=[];
  if(medalInfo.isRecord) celeb.push({icon:'🎉',text:'Nouveau record de sprint !'});
  newTrophies.forEach(t=>celeb.push({icon:t.icon,text:`Nouveau trophée : ${t.title}`}));
  if(goalRes.justDone) celeb.push({icon:'🎯',text:'Objectif du jour réussi !'});
  renderSprintResults(medalInfo,streakDays);
  if(celeb.length) showCelebration(celeb);
}

function renderSprintResults(medalInfo,streakDays){
  const acc=sprintAnswered?Math.round(sprintScore/sprintAnswered*100):0;
  let extra='';
  if(medalInfo){
    if(medalInfo.isRecord) extra+=`<div class="rb-record">🎉 Nouveau record !</div>`;
    extra+=`<div class="rb-rank">C'est ton ${medalInfo.rank}<sup>${medalInfo.rank===1?'er':'e'}</sup> meilleur sprint sur ${medalInfo.total}.${streakSuffix(streakDays)}</div>`;
  }
  const stage=document.getElementById('sprintStage');
  if(stage) stage.innerHTML=`
    <div class="sprint-done">
      <div class="sprint-done-big">${sprintScore}</div>
      <div class="sprint-done-lab">bonne${sprintScore>1?'s':''} réponse${sprintScore>1?'s':''} en 5 min</div>
      <div class="sprint-done-sub">${sprintAnswered} calcul${sprintAnswered>1?'s':''} tenté${sprintAnswered>1?'s':''} · ${acc}% de réussite</div>
      ${extra}
      <div class="sprint-actions">
        <button class="sprint-btn" id="sprintAgain">↻ Recommencer</button>
        <button class="sprint-btn ghost" id="sprintHome">🏠 Accueil</button>
      </div>
    </div>`;
  const again=document.getElementById('sprintAgain'); if(again) again.addEventListener('click',startSprint);
  const home=document.getElementById('sprintHome'); if(home) home.addEventListener('click',goHome);
  sprintRenderTime(); sprintUpdateScore();
}
