/* ============================================================
   Calcul mental CE2 — logique d'entraînement
   ============================================================ */

/* ============================================================
   Aléatoire
   ============================================================ */
const rnd=(min,max)=>Math.floor(Math.random()*(max-min+1))+min;
const choice=a=>a[Math.floor(Math.random()*a.length)];
function sample(arr,n){const c=[...arr];for(let i=c.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[c[i],c[j]]=[c[j],c[i]];}return c.slice(0,n);}
const commKey=op=>{const m=op.match(/(\d+)\s*([+×])\s*(\d+)/);if(m){const a=+m[1],s=m[2],b=+m[3];return `${s}${Math.min(a,b)}-${Math.max(a,b)}`;}return op;};
function uniqueComm(gen,n,mt=10000){const k=[],o=[];let t=0;while(o.length<n&&t<mt){const it=gen();const key=commKey(it.text);if(!k.includes(key)){k.push(key);o.push(it);}t++;}return o;}
function uniqueExact(gen,n,mt=10000){const k=[],o=[];let t=0;while(o.length<n&&t<mt){const it=gen();if(!k.includes(it.text)){k.push(it.text);o.push(it);}t++;}return o;}
const escapeHTML=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');

/* ============================================================
   Items {text, answer}  (@ = emplacement du champ)
   ============================================================ */
function add(a,b){return {text:`${a} + ${b} = @`,answer:a+b};}
function sub(a,b){return {text:`${a} - ${b} = @`,answer:a-b};}
function mul(a,b){return {text:`${a} × ${b} = @`,answer:a*b};}
function dbl(n){return {text:`double de ${n} = @`,answer:2*n};}
function half(n){return {text:`moitié de ${n} = @`,answer:n/2};}
function comp(a,total){return {text:`${a} + @ = ${total}`,answer:total-a};}
function facteur(a,total){return {text:`${a} × @ = ${total}`,answer:total/a};}

let inputCounter=0;
function renderItem(it,extra=''){
  const id='a'+(inputCounter++);
  const field=`<input class="ans ${extra}" id="${id}" data-answer="${it.answer}" inputmode="numeric" autocomplete="off"><span class="mark" data-for="${id}"></span>`;
  return escapeHTML(it.text).replace('@',field);
}
function gridHTML(items,cols){
  const cls=cols===3?'c3':'c4';
  return `<div class="grid ${cls}">${items.map(it=>`<div class="op">${renderItem(it)}</div>`).join('')}</div>`;
}
/* L'en-tête de fiche : le champ "Temps : ___ min" est print-only */
function ficheHTML(num,titre,sous,consigne,inner){
  return `<div class="fiche">
    <div class="fiche-head">
      <p class="fiche-title">MENTAL ${num} — ${titre}</p>
      <span class="temps print-only">Temps : ______ min</span>
    </div>
    <p class="fiche-sub">${sous}</p>
    <p class="consigne-line">${consigne}</p>
    ${inner}
  </div>`;
}

/* ============================================================
   Les 15 fiches
   ============================================================ */
function buildFiches(){
  const F=[];
  let items=uniqueComm(()=>{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return add(a,b);},12);
  F.push(ficheHTML(1,"Les tables d'addition","Additionner deux nombres de 1 à 9.","Calcule chaque addition.",gridHTML(items,4)));

  const pool10=[];for(let a=1;a<=9;a++)pool10.push(comp(a,10));
  const pool100=[10,20,30,40,50,60,70,80,90].map(a=>comp(a,100));
  items=sample([...sample(pool10,6),...sample(pool100,6)],12);
  F.push(ficheHTML(2,"Les compléments","Trouver le nombre qui complète à 10 ou à 100.","Complète chaque égalité.",gridHTML(items,3)));

  items=sample([...Array(39).keys()].map(i=>i+1),12).map(dbl);
  F.push(ficheHTML(3,"Les doubles","Le double, c'est deux fois le nombre.","Écris le double.",gridHTML(items,3)));

  items=sample([2,4,6,8,10,12,14,16,18,20,30,40,50,60,80,100],12).map(half);
  F.push(ficheHTML(4,"Les moitiés","La moitié, c'est le nombre partagé en deux.","Écris la moitié.",gridHTML(items,3)));

  items=uniqueExact(()=>add(rnd(20,70),choice([8,9,18,19,28,29])),12);
  F.push(ficheHTML(5,"Ajouter 9, 19, 29 / 8, 18, 28","Astuce : +9 = +10 puis -1 · +8 = +10 puis -2.","Calcule en utilisant l'astuce.",gridHTML(items,4)));

  items=uniqueExact(()=>sub(rnd(40,90),choice([9,19,29,39])),8).concat(uniqueExact(()=>sub(rnd(11,20),rnd(2,8)),4));
  F.push(ficheHTML(6,"Soustraire 9, 19, 29, 39 et un petit nombre","Astuce : -9 = -10 puis +1.","Calcule chaque soustraction.",gridHTML(items,4)));

  items=uniqueComm(()=>{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return mul(a,b);},12);
  F.push(ficheHTML(7,"Les tables de multiplication","Tables de 2 à 9.","Calcule chaque produit.",gridHTML(items,4)));

  items=sample([24,36,48,52,64,28,46,82,38,56,74,98,66,84],12).map(half);
  F.push(ficheHTML(8,"La moitié d'un nombre pair","Je sépare les dizaines et les unités si besoin.","Écris la moitié.",gridHTML(items,3)));

  items=sample([2,3,4,5,6,7,8,9,10,11,12],11).map(a=>mul(a,25));
  F.push(ficheHTML(9,"Les multiples de 25","25, 50, 75, 100... de 25 en 25.","Calcule.",gridHTML(items,3)));

  const fac=[[2,30],[3,20],[4,15],[5,12],[6,10],[12,5],[15,4],[20,3],[10,6],[30,2],[60,1],[1,60]];
  items=sample(fac,12).map(([a])=>facteur(a,60));
  F.push(ficheHTML(10,"Décompositions multiplicatives de 60","Quel nombre multiplié donne 60 ?","Complète.",gridHTML(items,3)));

  items=uniqueExact(()=>{const a=rnd(120,500),op=choice(['+','-']),b=choice([10,20,30,40,50]);return op==='+'?add(a,b):sub(a,b);},6)
    .concat(uniqueExact(()=>{const a=rnd(150,600),op=choice(['+','-']),b=choice([100,200,300]);return op==='+'?add(a,b):sub(a,b);},6));
  F.push(ficheHTML(11,"Ajouter, soustraire des dizaines et des centaines","J'ajoute ou je retire des paquets entiers.","Calcule.",gridHTML(items,3)));

  items=sample([...Array(98).keys()].map(i=>i+2),6).map(a=>mul(a,10)).concat(sample([...Array(39).keys()].map(i=>i+2),6).map(a=>mul(a,100)));
  F.push(ficheHTML(12,"Multiplier par 10, par 100","×10 j'ajoute un zéro · ×100 j'ajoute deux zéros.","Calcule.",gridHTML(items,3)));

  items=sample([...Array(23).keys()].map(i=>i+3).filter(x=>x!==8),6).map(a=>mul(a,4)).concat(sample([...Array(13).keys()].map(i=>i+3).filter(x=>x!==4),6).map(a=>mul(a,8)));
  F.push(ficheHTML(13,"Multiplier par 4, par 8","×4 = double du double · ×8 = double du double du double.","Calcule.",gridHTML(items,3)));

  items=uniqueComm(()=>mul(rnd(2,12),choice([20,30,40])),12);
  F.push(ficheHTML(14,"Multiplier par 20, 30, 40","Astuce : je multiplie par le chiffre, puis par 10.","Calcule.",gridHTML(items,3)));

  const seen=new Set();const d=[];
  while(d.length<6){const a=rnd(3,8),b=choice([12,13,14,15,16,21,23,24]);const k=a+'x'+b;if(!seen.has(k)){seen.add(k);d.push([a,b]);}}
  const lines=d.map(([a,b])=>{
    const free=()=>`<input class="ans-free" inputmode="numeric" autocomplete="off">`;
    const finalId='a'+(inputCounter++);
    const finalField=`<input class="ans" id="${finalId}" data-answer="${a*b}" inputmode="numeric" autocomplete="off"><span class="mark" data-for="${finalId}"></span>`;
    return `<div class="op">${a} × ${b} = (${free()} × ${free()}) + (${free()} × ${free()}) = ${free()} + ${free()} = ${finalField}</div>`;
  }).join('');
  F.push(ficheHTML(15,"Décomposer pour calculer une multiplication","Ex : 6 × 14 = (6×10) + (6×4) = 60 + 24 = 84.","Décompose puis calcule. Écris les étapes.",`<div class="deco">${lines}</div>`));
  return F;
}

/* ============================================================
   Bilans express
   ============================================================ */
const THEMES={1:"Table d'addition",2:"Complément à 10/100",3:"Doubles",4:"Moitiés",5:"Ajouter 9, 19...",6:"Soustraire 9, 19...",7:"Table de ×",8:"Moitié (pair)",9:"Multiples de 25",10:"Décompo. de 60",11:"Dizaines/centaines",12:"× 10, × 100",13:"× 4, × 8",14:"× 20, 30, 40",15:"Décomposer"};
function bilanQ(k){
  switch(k){
    case 1:{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return add(a,b);}
    case 2: return Math.random()<0.5?comp(rnd(1,9),10):comp(choice([10,20,30,40,60,70,80,90]),100);
    case 3: return dbl(rnd(5,35));
    case 4: return half(choice([8,12,16,20,30,40,50,60,80,100]));
    case 5: return add(rnd(20,60),choice([8,9,18,19,28,29]));
    case 6: return sub(rnd(40,85),choice([9,19,29,39]));
    case 7:{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return mul(a,b);}
    case 8: return half(choice([24,36,48,52,64,28,46,82,56,74,66,84]));
    case 9: return mul(rnd(2,12),25);
    case 10:return facteur(choice([2,3,4,5,6,10,12,15,20,30]),60);
    case 11:{const a=rnd(120,500),op=choice(['+','-']),b=choice([10,20,30,40,100,200,300]);return op==='+'?add(a,b):sub(a,b);}
    case 12:return mul(rnd(2,40),choice([10,100]));
    case 13:return mul(rnd(3,15),choice([4,8]));
    case 14:return mul(rnd(2,12),choice([20,30,40]));
    case 15:return mul(rnd(3,8),choice([12,13,14,15,16,21,23,24]));
  }
}
function bilanBlocks(nbQ){
  const blocks=[];
  for(let num=1;num<=15;num++){
    const k=[],ops=[];let t=0;
    while(ops.length<nbQ&&t<300){const o=bilanQ(num),key=commKey(o.text);if(!k.includes(key)){k.push(key);ops.push(o);}t++;}
    blocks.push({num,theme:THEMES[num],ops});
  }
  return blocks;
}
/* numero = libellé ; le bloc temps total est print-only */
function bilanHTML(numero){
  const blocks=bilanBlocks(3);
  const cells=blocks.map(b=>{const ops=b.ops.map(o=>`<div class="bop">${renderItem(o)}</div>`).join('');return `<div class="bloc"><span class="blab">M${b.num}.</span> <span class="btheme">${b.theme}</span>${ops}</div>`;}).join('');
  return `<div class="page">
    <p class="bilan-title">Bilan express ${numero} — toutes les leçons</p>
    <p class="bilan-sub">3 calculs par leçon · objectif : environ 20 minutes.
       <span class="print-only">Prénom : __________   Date : ________</span></p>
    <p class="bilan-temps print-only">Temps total : ______ min</p>
    <div class="bilan-grid">${cells}</div>
    <p class="foot">Calcul mental CE2</p>
  </div>`;
}

/* ============================================================
   Page de garde (impression uniquement)
   ============================================================ */
function coverHTML(){
  return `<div class="page cover print-only">
    <div class="big">Calcul mental — CE2</div>
    <div class="tagline">Fiches d'entraînement en autonomie · 15 ateliers</div>
    <div class="idbox"><div>Prénom : ______________________</div><div>Date : ______________________</div></div>
    <p class="consigne">Comment faire ? Je calcule de tête le plus vite possible, puis j'écris le résultat.
      Si je bloque, je passe au suivant et j'y reviens à la fin. Bon entraînement !</p>
  </div>`;
}
function fichesPagesHTML(fiches){
  const perPage=3;const pages=[];
  for(let i=0;i<fiches.length;i+=perPage){
    pages.push(`<div class="page">${fiches.slice(i,i+perPage).join('')}<p class="foot">Calcul mental CE2</p></div>`);
  }
  return pages.join('');
}

/* ============================================================
   Chronomètre
   ============================================================ */
let timer=null, startTs=0, elapsedMs=0, running=false;
function fmt(ms){
  const s=Math.floor(ms/1000); const m=Math.floor(s/60); const r=s%60;
  return String(m).padStart(2,'0')+':'+String(r).padStart(2,'0');
}
function startChrono(){
  elapsedMs=0; startTs=Date.now(); running=true;
  const el=document.getElementById('chrono');
  el.classList.remove('hidden'); el.textContent='00:00';
  clearInterval(timer);
  timer=setInterval(()=>{ if(running){el.textContent=fmt(Date.now()-startTs);} },250);
}
function stopChrono(){
  if(!running) return elapsedMs;
  running=false; elapsedMs=Date.now()-startTs; clearInterval(timer);
  document.getElementById('chrono').textContent=fmt(elapsedMs);
  return elapsedMs;
}
function resetChrono(){
  running=false; clearInterval(timer); elapsedMs=0;
  const el=document.getElementById('chrono'); el.classList.add('hidden'); el.textContent='00:00';
}

/* ============================================================
   Gamification : records, médailles, série, progression
   (tout est conservé dans le localStorage du navigateur)
   ============================================================ */
const RUNS_KEY=m=>`cm_ce2_runs_${m}`;
const STREAK_KEY='cm_ce2_streak';
const MAX_RUNS=50; // on ne garde que les 50 derniers essais par mode

function loadRuns(mode){try{return JSON.parse(localStorage.getItem(RUNS_KEY(mode)))||[];}catch(e){return [];}}
function saveRuns(mode,runs){try{localStorage.setItem(RUNS_KEY(mode),JSON.stringify(runs));}catch(e){}}

/* Classement « score puis temps » : plus de bonnes réponses d'abord,
   le chrono départage à égalité (le plus rapide gagne). */
function cmpRun(a,b){return b.ok!==a.ok ? b.ok-a.ok : a.ms-b.ms;}
const runPct=r=>r.count?Math.round(r.ok/r.count*100):0;
const fmtRecord=r=>`${r.ok}/${r.count} · ${fmt(r.ms)}`;

/* Série de jours consécutifs */
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function daysBetween(a,b){return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);}
function getStreak(){try{return JSON.parse(localStorage.getItem(STREAK_KEY))||{days:0,last:null};}catch(e){return {days:0,last:null};}}
function updateStreak(){
  const today=todayStr();let s=getStreak();
  if(!s.last){s={days:1,last:today};}
  else{const d=daysBetween(s.last,today);
    if(d===1){s.days++;s.last=today;}
    else if(d!==0){s.days=1;s.last=today;}}
  try{localStorage.setItem(STREAK_KEY,JSON.stringify(s));}catch(e){}
  return s;
}

/* Enregistre l'essai courant et calcule médaille / rang / record */
function recordRun(mode,ok,count,ms){
  const run={ts:Date.now(),ok,count,ms};
  const runs=loadRuns(mode);
  const previous=[...runs];
  runs.push(run);
  if(runs.length>MAX_RUNS) runs.splice(0,runs.length-MAX_RUNS);
  saveRuns(mode,runs);
  const rank=[...runs].sort(cmpRun).indexOf(run)+1;
  const isRecord=previous.length>0 && cmpRun(run,[...previous].sort(cmpRun)[0])<0;
  const medal=(runs.length>=3 && rank<=3) ? rank : 0; // 1=or, 2=argent, 3=bronze
  return {rank,total:runs.length,medal,isRecord};
}

/* Mini-courbe SVG de la progression (score % au fil des essais) */
function sparkline(vals,w=260,h=46){
  if(vals.length<2) return '';
  const pad=4, iw=w-2*pad, ih=h-2*pad;
  const x=i=>pad+(i/(vals.length-1))*iw;
  const y=v=>pad+ih-(v/100)*ih;
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots=vals.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="var(--blue)"/>`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Progression des scores">
    <polyline fill="none" stroke="var(--blue)" stroke-width="2" points="${pts}"/>${dots}</svg>`;
}

/* Petite pluie de confettis (nouveau record) */
function confetti(){
  const colors=['#336CBF','#ffd54f','#2e7d32','#c62828','#00acc1','#ff8f00'];
  const layer=document.createElement('div');layer.className='confetti-layer';
  for(let i=0;i<90;i++){
    const c=document.createElement('span');c.className='confetti';
    c.style.left=(Math.random()*100).toFixed(1)+'vw';
    c.style.background=colors[i%colors.length];
    c.style.animationDelay=(Math.random()*0.6).toFixed(2)+'s';
    c.style.animationDuration=(2+Math.random()*1.6).toFixed(2)+'s';
    layer.appendChild(c);
  }
  document.body.appendChild(layer);
  setTimeout(()=>layer.remove(),4200);
}

/* Rendu des statistiques sur l'écran d'accueil */
function fillCardRecord(elId,mode){
  const el=document.getElementById(elId);if(!el)return;
  const runs=loadRuns(mode);
  if(!runs.length){el.innerHTML=`<span class="muted">Aucun essai — à toi de jouer !</span>`;return;}
  el.innerHTML=`🏅 Ton record : <strong>${fmtRecord([...runs].sort(cmpRun)[0])}</strong>`;
}
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
  const boards=document.getElementById('boards');
  if(boards) boards.innerHTML=boardHTML('complet','Bilan complet')+boardHTML('express','Bilan express');
}

/* ============================================================
   Navigation : accueil / sessions
   ============================================================ */
let currentMode=null; // 'complet' | 'express' | null
let sessionRecorded=false; // l'essai en cours a-t-il déjà été enregistré ?

// Construit le contenu COMPLET pour l'impression (toujours présent dans le DOM).
// En interactif on n'affiche qu'une partie via masquage, mais pour rester simple
// on régénère le DOM selon le mode et on garde la version imprimable cohérente.
function buildPrintableDOM(){
  inputCounter=0;
  const fiches=buildFiches();
  return coverHTML()+fichesPagesHTML(fiches)+bilanHTML(1)+bilanHTML(2);
}

function goHome(){
  resetChrono();
  currentMode=null;
  document.getElementById('home').style.display='';
  document.getElementById('sheets').innerHTML='';
  const sc=document.getElementById('score'); sc.classList.add('hidden'); sc.textContent='';
  document.getElementById('btnVerify').disabled=true;
  const old=document.getElementById('resultBanner'); if(old) old.remove();
  renderHomeStats();
  window.scrollTo({top:0,behavior:'smooth'});
}

function startComplet(){
  currentMode='complet';
  inputCounter=0;
  const fiches=buildFiches();
  // À l'écran : pas de page de garde ni de bilans, juste les 15 fiches.
  document.getElementById('sheets').innerHTML=fichesPagesHTML(fiches);
  afterStart();
}
function startExpress(){
  currentMode='express';
  inputCounter=0;
  // À l'écran : un seul bilan express.
  document.getElementById('sheets').innerHTML=bilanHTML(1);
  afterStart();
}
function afterStart(){
  sessionRecorded=false;
  document.getElementById('home').style.display='none';
  const sc=document.getElementById('score'); sc.classList.add('hidden'); sc.textContent='';
  document.getElementById('btnVerify').disabled=false;
  startChrono();
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ============================================================
   Vérification (arrête le chrono)
   ============================================================ */
function verify(){
  const ms=stopChrono();
  const inputs=document.querySelectorAll('#sheets input.ans');
  let total=0,ok=0,vides=0;
  inputs.forEach(inp=>{
    const mark=document.querySelector(`.mark[data-for="${inp.id}"]`);
    inp.classList.remove('correct','wrong');
    if(mark){mark.className='mark';mark.textContent='';}
    const raw=inp.value.trim().replace(',','.');
    if(raw===''){vides++;return;}
    total++;
    if(Number(raw)===Number(inp.dataset.answer)){ok++;inp.classList.add('correct');if(mark){mark.className='mark correct';mark.textContent='✓';}}
    else{inp.classList.add('wrong');if(mark){mark.className='mark wrong';mark.textContent='✗';}}
  });
  // Enregistrement de l'essai (une seule fois par session) + médaille / record
  let medalInfo=null, streakDays=0;
  if(currentMode && !sessionRecorded && inputs.length>0){
    sessionRecorded=true;
    streakDays=updateStreak().days;
    medalInfo=recordRun(currentMode,ok,inputs.length,ms);
    if(medalInfo.isRecord) confetti();
  }

  // Bandeau résultat en tête de la zone
  const old=document.getElementById('resultBanner'); if(old) old.remove();
  const banner=document.createElement('div');
  banner.className='result-banner screen-only'; banner.id='resultBanner';
  const note = total>0 ? Math.round(ok/total*100) : 0;
  let html=`<span class="rb-big">${ok}/${total}</span>
    <span class="rb-sub">bonnes réponses (${note}%)${vides>0?` · ${vides} non remplie${vides>1?'s':''}`:''}<br>
    Temps : <strong>${fmt(ms)}</strong></span>`;
  if(medalInfo){
    if(medalInfo.medal){
      const M={1:['🥇',"Médaille d'or"],2:['🥈',"Médaille d'argent"],3:['🥉','Médaille de bronze']}[medalInfo.medal];
      html+=`<div class="rb-medal"><span class="rb-medal-ico">${M[0]}</span><span class="rb-medal-txt">${M[1]} !</span></div>`;
    }
    if(medalInfo.isRecord) html+=`<div class="rb-record">🎉 Nouveau record !</div>`;
    let rk=`C'est ton ${medalInfo.rank}<sup>${medalInfo.rank===1?'er':'e'}</sup> meilleur essai sur ${medalInfo.total}.`;
    if(medalInfo.total<3) rk+=` Encore ${3-medalInfo.total} pour décrocher une médaille !`;
    if(streakDays>=2) rk+=` · 🔥 ${streakDays} jours d'affilée`;
    html+=`<div class="rb-rank">${rk}</div>`;
  }
  banner.innerHTML=html;
  const sheets=document.getElementById('sheets');
  sheets.parentNode.insertBefore(banner,sheets);
  // petit rappel dans la barre
  const sc=document.getElementById('score'); sc.classList.remove('hidden');
  sc.textContent= total>0 ? `${ok}/${total} · ${fmt(ms)}` : `Aucune réponse · ${fmt(ms)}`;
  const firstWrong=document.querySelector('#sheets input.ans.wrong');
  if(firstWrong) firstWrong.scrollIntoView({behavior:'smooth',block:'center'});
  else window.scrollTo({top:0,behavior:'smooth'});
}

// Modifier un champ efface son marquage
document.addEventListener('input',e=>{
  if(e.target.classList&&e.target.classList.contains('ans')){
    e.target.classList.remove('correct','wrong');
    const mark=document.querySelector(`.mark[data-for="${e.target.id}"]`);
    if(mark){mark.className='mark';mark.textContent='';}
  }
});

/* ============================================================
   Impression : on injecte TOUJOURS la version complète,
   on imprime, puis on restaure l'écran courant.
   ============================================================ */
function printAll(){
  // On laisse le gestionnaire beforeprint injecter la version complète,
  // et afterprint la restaurer. Rien de spécial à faire ici.
  window.print();
}

/* Gère aussi le Ctrl+P natif du navigateur :
   si la zone n'est pas déjà la version complète, on l'injecte avant impression
   puis on restaure après. */
let printSnapshot=null;
window.addEventListener('beforeprint',()=>{
  const sheets=document.getElementById('sheets');
  printSnapshot={
    sheets:sheets.innerHTML,
    homeDisplay:document.getElementById('home').style.display,
    banner: document.getElementById('resultBanner') ? document.getElementById('resultBanner').outerHTML : null
  };
  const banner=document.getElementById('resultBanner'); if(banner) banner.remove();
  sheets.innerHTML=buildPrintableDOM();
});
window.addEventListener('afterprint',()=>{
  const sheets=document.getElementById('sheets');
  if(printSnapshot){
    sheets.innerHTML=printSnapshot.sheets;
    document.getElementById('home').style.display=printSnapshot.homeDisplay;
    if(printSnapshot.banner){
      const tmp=document.createElement('div'); tmp.innerHTML=printSnapshot.banner;
      sheets.parentNode.insertBefore(tmp.firstChild,sheets);
    }
    printSnapshot=null;
  }
});

/* ============================================================
   Initialisation : câblage des événements (plus de onclick inline)
   ============================================================ */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btnVerify').addEventListener('click',verify);
  document.getElementById('btnHome').addEventListener('click',goHome);
  document.getElementById('btnPrint').addEventListener('click',printAll);
  document.getElementById('cardComplet').addEventListener('click',startComplet);
  document.getElementById('cardExpress').addEventListener('click',startExpress);
  document.getElementById('printLink').addEventListener('click',printAll);

  // Au chargement : zone vide (accueil affiché) + stats de gamification.
  document.getElementById('sheets').innerHTML='';
  renderHomeStats();
});
