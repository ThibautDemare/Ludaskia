/* ============================================================
   Rendu de l'écran d'accueil et du sélecteur de leçons
   ============================================================ */

/* Niveau de réussite → couleur (rouge < 50, orange < 75, vert sinon) */
const pctColor=p=>p<50?'#c62828':(p<75?'#ef6c00':'#2e7d32');

/* Record perso affiché sur une carte de l'accueil */
function fillCardRecord(elId,mode){
  const el=document.getElementById(elId);if(!el)return;
  const runs=loadRuns(mode);
  if(!runs.length){el.innerHTML=`<span class="muted">Aucun essai — à toi de jouer !</span>`;return;}
  el.innerHTML=`🏅 Ton record : <strong>${fmtRecord([...runs].sort(cmpRun)[0])}</strong>`;
}
/* Panneau de classement d'un mode (podium top-3 + progression) */
function boardHTML(mode,label){
  const runs=loadRuns(mode);
  if(!runs.length) return '';
  const medals=['🥇','🥈','🥉'];
  const top=[...runs].sort(cmpRun).slice(0,3);
  const lis=top.map((r,i)=>`<li>${medals[i]} <strong>${r.ok}/${r.count}</strong> · ${fmt(r.ms)}</li>`).join('');
  const reste=3-runs.length;
  const note=reste>0?`<p class="lb-note">Encore ${reste} essai${reste>1?'s':''} pour débloquer les médailles.</p>`:'';
  const spark=runs.length>=2?`<div class="spark-wrap"><span class="spark-lab">Progression (score %)</span>${sparkline(runs.map(runPct))}</div>`:'';
  return `<div class="lb">
    <h3>${label}</h3>
    <ol class="podium">${lis}</ol>
    ${note}${spark}
    <p class="lb-count">${runs.length} essai${runs.length>1?'s':''} enregistré${runs.length>1?'s':''}</p>
  </div>`;
}
function renderHomeStats(){
  const s=getStreak();
  const streakEl=document.getElementById('streak');
  if(streakEl){
    if(s.days>=2){streakEl.textContent=`🔥 Série : ${s.days} jours d'affilée !`;streakEl.style.display='';}
    else if(s.days===1){streakEl.textContent=`🔥 Série lancée — reviens demain pour la prolonger !`;streakEl.style.display='';}
    else{streakEl.style.display='none';}
  }
  fillCardRecord('recComplet','complet');
  fillCardRecord('recExpress','express');
  const recL=document.getElementById('recLecon');
  if(recL){const n=starsEarned();recL.innerHTML=`⭐ <strong>${n}/${LESSONS.length}</strong> leçon${n>1?'s':''} réussie${n>1?'s':''} sans faute`;}
  const boards=document.getElementById('boards');
  if(boards) boards.innerHTML=boardHTML('complet','Bilan complet')+boardHTML('express','Bilan express');
  renderGoal();
  evaluateBadges(); // rattrape d'éventuels badges acquis (sans célébration ici)
  renderBadges();
}

/* Objectif du jour */
function renderGoal(){
  const el=document.getElementById('goal');if(!el)return;
  const g=getGoal();
  if(g.done){
    el.className='goal done';
    el.innerHTML=`🎯 Objectif du jour réussi ! <span class="goal-lab">${g.label}</span> ✓`;
  }else{
    el.className='goal';
    el.innerHTML=`🎯 Objectif du jour : <span class="goal-lab">${g.label}</span> <span class="goal-prog">(${g.progress}/${g.target})</span>`;
  }
}

/* Vitrine des badges */
function renderBadges(){
  const el=document.getElementById('badges');if(!el)return;
  const have=new Set(loadBadges());
  const cells=BADGES.map(b=>{
    const on=have.has(b.id);
    return `<div class="badge ${on?'on':'off'}">
      <span class="badge-ico">${on?b.icon:'🔒'}</span>
      <span class="badge-title">${b.title}</span>
      <span class="badge-desc">${b.desc}</span></div>`;
  }).join('');
  el.innerHTML=`<h3 class="badges-h">Mes badges <span class="badges-count">${have.size}/${BADGES.length}</span></h3>
    <div class="badge-grid">${cells}</div>`;
}

/* Liste des 15 leçons avec étoiles + taux de réussite */
function renderLessons(){
  const stars=loadStars();
  const lstats=loadLessonStats();
  const list=document.getElementById('lessonList');
  if(list){
    list.innerHTML=LESSONS.map(l=>{
      const c=stars[l.num]||0;
      const badge=c>0
        ?`<span class="lz-star" title="${c} sans-faute${c>1?'s':''}">⭐${c>1?`<small>×${c}</small>`:''}</span>`
        :`<span class="lz-star empty" title="Pas encore réussie sans faute">☆</span>`;
      const avg=lessonAvgPct(lstats[l.num]);
      let stat;
      if(avg==null){
        stat=`<span class="lz-stat lz-stat-empty">Pas encore travaillée</span>`;
      }else{
        const col=pctColor(avg);
        const flag=avg<70?`<span class="lz-flag">à revoir</span>`:'';
        stat=`<span class="lz-stat">
          <span class="lz-bar"><span class="lz-bar-fill" style="width:${avg}%;background:${col}"></span></span>
          <span class="lz-pct" style="color:${col}">${avg}%</span>${flag}</span>`;
      }
      return `<button class="lesson-item" data-num="${l.num}">
        <span class="lz-num">${l.num}</span>
        <span class="lz-main"><span class="lz-title">${l.title}</span>${stat}</span>
        ${badge}</button>`;
    }).join('');
  }
  const sum=document.getElementById('starsSummary');
  if(sum){
    const n=starsEarned();
    const weak=LESSONS.filter(l=>{const a=lessonAvgPct(lstats[l.num]);return a!=null&&a<70;}).map(l=>l.num);
    sum.innerHTML=`⭐ ${n} / ${LESSONS.length} leçons réussies sans faute`
      +(weak.length?` · <span class="weak-hint">à revoir : leçons ${weak.join(', ')}</span>`:'');
  }
}
