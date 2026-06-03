/* ============================================================
   Déroulé d'une session : vérification, saisie clavier, impression
   ============================================================ */

/* ---------- Vérification (arrête le chrono) ---------- */
function verify(){
  const ms=stopChrono();
  const inputs=document.querySelectorAll('#sheets input.ans');
  let total=0,ok=0,vides=0;
  const errors=[]; // items non réussis (faux OU non remplis) pour la révision
  const perLesson={}; // num -> {ok, total} pour les stats par leçon
  inputs.forEach(inp=>{
    const mark=document.querySelector(`.mark[data-for="${inp.id}"]`);
    inp.classList.remove('correct','wrong');
    if(mark){mark.className='mark';mark.textContent='';}
    const it=sessionItems[inp.id];
    const ln=inp.dataset.lesson;
    const bucket=ln!=null?(perLesson[ln]||(perLesson[ln]={ok:0,total:0})):null;
    const raw=inp.value.trim().replace(',','.');
    if(raw===''){vides++; if(it) errors.push(it); return;}
    total++; if(bucket) bucket.total++;
    if(Number(raw)===Number(inp.dataset.answer)){ok++;if(bucket)bucket.ok++;inp.classList.add('correct');if(mark){mark.className='mark correct';mark.textContent='✓';}}
    else{
      inp.classList.add('wrong');
      // On révèle la bonne réponse à côté de l'erreur.
      if(mark){mark.className='mark wrong';mark.innerHTML=`✗ <span class="sol">→ ${inp.dataset.answer}</span>`;}
      if(it) errors.push(it);
    }
  });
  lastErrors=errors;
  // Un exercice ne « compte » que si au moins 60 % des calculs ont une réponse.
  const recordable = currentMode && currentMode!=='revision';
  const enough = inputs.length>0 && total>=inputs.length*0.6;
  const notEnough = recordable && !enough && !sessionRecorded;
  // Enregistrement de l'essai (une seule fois par session)
  // → bilan complet/express : classement + médaille
  // → leçon seule : étoile si sans-faute
  let medalInfo=null, starInfo=null, streakDays=0, goalRes=null, newTrophies=[];
  const celeb=[]; // récompenses à annoncer dans la modale
  if(recordable && enough && !sessionRecorded){
    sessionRecorded=true;
    streakDays=updateStreak().days;
    recordLessonStats(perLesson);
    let perfect=false;
    if(currentMode==='lecon'){
      perfect = ok===inputs.length; // toutes les réponses justes
      const res=recordLessonResult(currentLessonNum,perfect);
      starInfo={perfect, newStar:res.newStar, count:res.count};
    }else{
      medalInfo=recordRun(currentMode,ok,inputs.length,ms);
    }
    // Objectif du jour + trophées (évalués après l'enregistrement de l'essai)
    goalRes=updateGoal({mode:currentMode, newStar:!!(starInfo&&starInfo.newStar), perfect, isRecord:!!(medalInfo&&medalInfo.isRecord)});
    newTrophies=evaluateTrophies();
    // Liste des récompenses obtenues (sert à la modale + confettis)
    if(medalInfo&&medalInfo.isRecord) celeb.push({icon:'🎉',text:'Nouveau record !'});
    if(starInfo&&starInfo.newStar) celeb.push({icon:'⭐',text:'Étoile gagnée pour cette leçon !'});
    newTrophies.forEach(t=>celeb.push({icon:t.icon,text:`Nouveau trophée : ${t.title}`}));
    if(goalRes&&goalRes.justDone) celeb.push({icon:'🎯',text:'Objectif du jour réussi !'});
  }

  // Bandeau résultat en tête de la zone
  const old=document.getElementById('resultBanner'); if(old) old.remove();
  const banner=document.createElement('div');
  banner.className='result-banner screen-only'; banner.id='resultBanner';
  const note = total>0 ? Math.round(ok/total*100) : 0;
  let html=`<span class="rb-big">${ok}/${total}</span>
    <span class="rb-sub">bonnes réponses (${note}%)${vides>0?` · ${vides} non remplie${vides>1?'s':''}`:''}<br>
    Temps : <strong>${fmt(ms)}</strong></span>`;
  if(notEnough){
    html+=`<div class="rb-warn">⚠️ Réponds à au moins 60 % des calculs pour valider ton temps et gagner des récompenses.</div>`;
  }
  if(medalInfo){
    if(medalInfo.medal){
      const M={1:['🥇',"Médaille d'or"],2:['🥈',"Médaille d'argent"],3:['🥉','Médaille de bronze']}[medalInfo.medal];
      html+=`<div class="rb-medal"><span class="rb-medal-ico">${M[0]}</span><span class="rb-medal-txt">${M[1]} !</span></div>`;
    }
    if(medalInfo.isRecord) html+=`<div class="rb-record">🎉 Nouveau record !</div>`;
    let rk=`C'est ton ${medalInfo.rank}<sup>${medalInfo.rank===1?'er':'e'}</sup> meilleur essai sur ${medalInfo.total}.`;
    if(medalInfo.total<3) rk+=` Encore ${3-medalInfo.total} pour décrocher une médaille !`;
    rk+=streakSuffix(streakDays);
    html+=`<div class="rb-rank">${rk}</div>`;
  }
  if(starInfo){
    if(starInfo.perfect){
      html+=`<div class="rb-medal"><span class="rb-medal-ico">⭐</span><span class="rb-medal-txt">${starInfo.newStar?'Étoile gagnée !':'Encore sans faute !'}</span></div>`;
    }
    let msg = starInfo.perfect
      ? `Leçon réussie sans faute${starInfo.count>1?` (${starInfo.count}×)`:''}. Bravo !`
      : `Il faut un sans-faute pour décrocher l'étoile de cette leçon. Réessaie ⭐`;
    msg+=streakSuffix(streakDays);
    html+=`<div class="rb-rank">${msg}</div>`;
  }
  if(newTrophies.length){
    html+=`<div class="rb-trophies">🏆 Nouveau trophée : ${newTrophies.map(t=>`${t.icon} ${t.title}`).join(' · ')} !</div>`;
  }
  if(goalRes){
    if(goalRes.justDone) html+=`<div class="rb-goal">🎯 Objectif du jour réussi : ${goalRes.goal.label}</div>`;
    else if(!goalRes.goal.done) html+=`<div class="rb-goal">🎯 Objectif du jour : ${goalRes.goal.label} (${goalRes.goal.progress}/${goalRes.goal.target})</div>`;
  }
  if(lastErrors.length){
    html+=`<button class="rb-redo" id="btnRedo">↻ Réviser mes erreurs (${lastErrors.length})</button>`;
  }
  banner.innerHTML=html;
  const redo=banner.querySelector('#btnRedo');
  if(redo) redo.addEventListener('click',startRevision);
  const sheets=document.getElementById('sheets');
  sheets.parentNode.insertBefore(banner,sheets);
  // Récompenses : modale explicite (+ confettis) pour qu'on sache ce qu'on a gagné
  if(celeb.length) showCelebration(celeb);
  // petit rappel dans la barre
  const sc=document.getElementById('score'); sc.classList.remove('hidden');
  sc.textContent= total>0 ? `${ok}/${total} · ${fmt(ms)}` : `Aucune réponse · ${fmt(ms)}`;
  const firstWrong=document.querySelector('#sheets input.ans.wrong');
  if(firstWrong) firstWrong.scrollIntoView({behavior:'smooth',block:'center'});
  else window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- Saisie ---------- */
// Modifier un champ efface son marquage
document.addEventListener('input',e=>{
  if(e.target.classList&&e.target.classList.contains('ans')){
    e.target.classList.remove('correct','wrong');
    const mark=document.querySelector(`.mark[data-for="${e.target.id}"]`);
    if(mark){mark.className='mark';mark.textContent='';}
  }
});
// Confort de saisie : Entrée passe au champ suivant ; sur le dernier, on vérifie.
document.addEventListener('keydown',e=>{
  const t=e.target;
  if(e.key!=='Enter'||t.tagName!=='INPUT') return;
  if(!t.classList.contains('ans')&&!t.classList.contains('ans-free')) return;
  e.preventDefault();
  const all=[...document.querySelectorAll('#sheets input.ans, #sheets input.ans-free')];
  const i=all.indexOf(t);
  if(i>-1 && i<all.length-1) all[i+1].focus();
  else verify(); // dernier champ
});

/* ---------- Impression ----------
   On injecte TOUJOURS la version complète, on imprime, puis on
   restaure l'écran courant (gère aussi le Ctrl+P natif). */
function printAll(){ window.print(); }

let printSnapshot=null;
window.addEventListener('beforeprint',()=>{
  const sheets=document.getElementById('sheets');
  printSnapshot={
    sheets:sheets.innerHTML,
    homeDisplay:document.getElementById('home').style.display,
    banner: document.getElementById('resultBanner') ? document.getElementById('resultBanner').outerHTML : null,
    items: sessionItems // la version imprimable régénère des items : on garde ceux de la session
  };
  const banner=document.getElementById('resultBanner'); if(banner) banner.remove();
  sheets.innerHTML=buildPrintableDOM();
});
window.addEventListener('afterprint',()=>{
  const sheets=document.getElementById('sheets');
  if(printSnapshot){
    sheets.innerHTML=printSnapshot.sheets;
    sessionItems=printSnapshot.items;
    document.getElementById('home').style.display=printSnapshot.homeDisplay;
    if(printSnapshot.banner){
      const tmp=document.createElement('div'); tmp.innerHTML=printSnapshot.banner;
      const restored=tmp.firstChild;
      sheets.parentNode.insertBefore(restored,sheets);
      const redo=restored.querySelector&&restored.querySelector('#btnRedo');
      if(redo) redo.addEventListener('click',startRevision); // le listener est perdu via outerHTML
    }
    printSnapshot=null;
  }
});
