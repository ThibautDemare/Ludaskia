/* ============================================================
   Rendu de l'écran d'accueil et du sélecteur de leçons
   ============================================================ */

/* Niveau de réussite → couleur (rouge < 50, orange < 75, vert sinon) */
const pctColor=p=>p<50?'#c62828':(p<75?'#ef6c00':'#2e7d32');

/* Barre de profils sur l'accueil : un chip par profil (clic = bascule) + Gérer */
function renderProfileBar(){
  const el=document.getElementById('profileBar'); if(!el) return;
  const m=loadProfilesMeta(); if(!m) return;
  const chips=m.list.map(p=>`<button class="profile-chip${p.id===m.active?' active':''}" data-pid="${p.id}">${p.emoji} ${escapeHTML(p.name)}</button>`).join('');
  el.innerHTML=`${chips}<button class="profile-manage" id="profileManage">⚙️ Gérer</button>`;
}
/* Écran de gestion des profils */
function renderProfiles(){
  const el=document.getElementById('profileList'); if(!el) return;
  const m=loadProfilesMeta(); if(!m) return;
  el.innerHTML=m.list.map(p=>`
    <div class="profile-row${p.id===m.active?' active':''}" data-pid="${p.id}">
      <button class="profile-pick" data-act="pick" title="Choisir ce profil">
        <span class="profile-emoji">${p.emoji}</span>
        <span class="profile-name">${escapeHTML(p.name)}</span>
        ${p.id===m.active?'<span class="profile-tag">actif</span>':''}
      </button>
      <span class="profile-tools">
        <button data-act="emoji" title="Changer l'avatar">🎨</button>
        <button data-act="rename" title="Renommer">✏️</button>
        <button data-act="reset" title="Réinitialiser la progression">♻️</button>
        <button data-act="delete" title="Supprimer le profil"${m.list.length<=1?' disabled':''}>🗑️</button>
      </span>
    </div>`).join('')
    +`<button class="profile-add" id="profileAdd">＋ Nouveau profil</button>`;
}

/* Record perso affiché sur une carte de l'accueil */
function fillCardRecord(elId,mode){
  const el=document.getElementById(elId);if(!el)return;
  const runs=loadRuns(mode);
  if(!runs.length){el.innerHTML=`<span class="muted">Aucun essai — à toi de jouer !</span>`;return;}
  el.innerHTML=`🏅 Ton record : <strong>${fmtRecord([...runs].sort(cmpRun)[0])}</strong>`;
}
/* Record de sprint (compté en nombre de bonnes réponses) */
function fillSprintRecord(elId){
  const el=document.getElementById(elId);if(!el)return;
  const runs=loadRuns('sprint');
  if(!runs.length){el.innerHTML=`<span class="muted">Aucun sprint — à toi de jouer !</span>`;return;}
  el.innerHTML=`🏅 Record : <strong>${[...runs].sort(cmpRun)[0].ok} bonnes réponses</strong>`;
}
function sprintBoardHTML(){
  const runs=loadRuns('sprint');
  if(!runs.length) return '';
  const medals=['🥇','🥈','🥉'];
  const top=[...runs].sort(cmpRun).slice(0,3);
  const lis=top.map((r,i)=>`<li>${medals[i]} <strong>${r.ok}</strong> bonnes <span class="lb-mut">(${r.ok}/${r.count})</span></li>`).join('');
  return `<div class="lb">
    <h3>Sprint 5 min</h3>
    <ol class="podium">${lis}</ol>
    <p class="lb-count">${runs.length} sprint${runs.length>1?'s':''}</p>
  </div>`;
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
  renderProfileBar();
  fillCardRecord('recComplet','complet');
  fillCardRecord('recExpress','express');
  const recL=document.getElementById('recLecon');
  if(recL){const n=starsEarned();recL.innerHTML=`⭐ <strong>${n}/${LESSONS.length}</strong> leçon${n>1?'s':''} réussie${n>1?'s':''} sans faute`;}
  fillSprintRecord('recSprint');
  renderObjectives();
  renderGoal();
  const boards=document.getElementById('boards');
  if(boards) boards.innerHTML=sprintBoardHTML()+boardHTML('express','Bilan express')+boardHTML('complet','Bilan complet');
  evaluateTrophies(); // rattrape d'éventuels trophées acquis (sans célébration ici)
  renderTrophies();
}

/* Objectifs de régularité (cadence saine, périodes calendaires).
   La pratique espacée prime : on encourage à revenir, sans pression quotidienne. */
const REGULARITY=[
  {mode:'sprint',  icon:'🏃', label:'Sprints',       target:3, period:'week'},
  {mode:'express', icon:'⏱️', label:'Bilan express', target:2, period:'month'},
  {mode:'complet', icon:'📚', label:'Bilan complet',  target:1, period:'month'},
];
const PERIOD_LABEL={week:'cette semaine', month:'ce mois-ci'};
function renderObjectives(){
  const el=document.getElementById('objectives');if(!el)return;
  const rows=REGULARITY.map(o=>{
    const since=o.period==='week'?startOfWeek():startOfMonth();
    const n=countSince(o.mode,since);
    const done=n>=o.target;
    return `<div class="obj ${done?'done':''}">
      <span class="obj-ico">${o.icon}</span>
      <span class="obj-lab">${o.label}</span>
      <span class="obj-prog">${Math.min(n,o.target)}/${o.target} <span class="obj-per">${PERIOD_LABEL[o.period]}</span></span>
      <span class="obj-check">${done?'✓':''}</span>
    </div>`;
  }).join('');
  el.innerHTML=`<h3 class="obj-h">Mes objectifs</h3>${rows}`;
}

/* Défi du jour (qualité : étoile / leçon sans faute / battre un record) */
function renderGoal(){
  const el=document.getElementById('goal');if(!el)return;
  const g=getGoal();
  if(g.done){
    el.className='goal done';
    el.innerHTML=`🎯 Défi du jour réussi ! <span class="goal-lab">${g.label}</span> ✓`;
  }else{
    el.className='goal';
    el.innerHTML=`🎯 Défi du jour : <span class="goal-lab">${g.label}</span> <span class="goal-prog">(${g.progress}/${g.target})</span>`;
  }
}

/* Vitrine des trophées */
function renderTrophies(){
  const el=document.getElementById('trophies');if(!el)return;
  const have=new Set(loadTrophies());
  const cells=TROPHIES.map(t=>{
    const on=have.has(t.id);
    return `<div class="trophy ${on?'on':'off'}">
      <span class="trophy-ico">${on?t.icon:'🔒'}</span>
      <span class="trophy-title">${t.title}</span>
      <span class="trophy-desc">${t.desc}</span></div>`;
  }).join('');
  el.innerHTML=`<h3 class="trophies-h">Mes trophées <span class="trophies-count">${have.size}/${TROPHIES.length}</span></h3>
    <div class="trophy-grid">${cells}</div>`;
}

/* Liste des 15 leçons avec étoiles + taux de réussite */
function renderLessons(){
  const stars=loadStars();
  const lstats=loadLessonStats();
  const list=document.getElementById('lessonList');
  if(list){
    list.innerHTML=LESSONS.map(l=>{
      const c=stars[l.num]||0;
      const starBadge=c>0
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
        ${starBadge}</button>`;
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
