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
// Mémorise les items {text, answer} de la session courante, par id de champ,
// pour pouvoir reconstruire « mes erreurs » lors d'une révision.
let sessionItems={};
// Numéro de la leçon en cours de génération (pour taguer les champs et
// agréger les stats par leçon, y compris dans les bilans). null = non rattaché.
let renderLesson=null;
function renderItem(it,extra=''){
  const id='a'+(inputCounter++);
  sessionItems[id]=it;
  const ln=renderLesson!=null?` data-lesson="${renderLesson}"`:'';
  const field=`<input class="ans ${extra}" id="${id}" data-answer="${it.answer}"${ln} inputmode="numeric" autocomplete="off"><span class="mark" data-for="${id}"></span>`;
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
   Les 15 leçons — chaque entrée est constructible isolément,
   ce qui permet de jouer une leçon seule OU le bilan complet.
   build() régénère des items frais à chaque appel.
   ============================================================ */
const LESSONS=[
  {num:1,title:"Les tables d'addition",sub:"Additionner deux nombres de 1 à 9.",consigne:"Calcule chaque addition.",
   build(){const items=uniqueComm(()=>{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return add(a,b);},12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,4));}},

  {num:2,title:"Les compléments",sub:"Trouver le nombre qui complète à 10 ou à 100.",consigne:"Complète chaque égalité.",
   build(){const pool10=[];for(let a=1;a<=9;a++)pool10.push(comp(a,10));
     const pool100=[10,20,30,40,50,60,70,80,90].map(a=>comp(a,100));
     const items=sample([...sample(pool10,6),...sample(pool100,6)],12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:3,title:"Les doubles",sub:"Le double, c'est deux fois le nombre.",consigne:"Écris le double.",
   build(){const items=sample([...Array(39).keys()].map(i=>i+1),12).map(dbl);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:4,title:"Les moitiés",sub:"La moitié, c'est le nombre partagé en deux.",consigne:"Écris la moitié.",
   build(){const items=sample([2,4,6,8,10,12,14,16,18,20,30,40,50,60,80,100],12).map(half);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:5,title:"Ajouter 9, 19, 29 / 8, 18, 28",sub:"Astuce : +9 = +10 puis -1 · +8 = +10 puis -2.",consigne:"Calcule en utilisant l'astuce.",
   build(){const items=uniqueExact(()=>add(rnd(20,70),choice([8,9,18,19,28,29])),12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,4));}},

  {num:6,title:"Soustraire 9, 19, 29, 39 et un petit nombre",sub:"Astuce : -9 = -10 puis +1.",consigne:"Calcule chaque soustraction.",
   build(){const items=uniqueExact(()=>sub(rnd(40,90),choice([9,19,29,39])),8).concat(uniqueExact(()=>sub(rnd(11,20),rnd(2,8)),4));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,4));}},

  {num:7,title:"Les tables de multiplication",sub:"Tables de 2 à 9.",consigne:"Calcule chaque produit.",
   build(){const items=uniqueComm(()=>{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return mul(a,b);},12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,4));}},

  {num:8,title:"La moitié d'un nombre pair",sub:"Je sépare les dizaines et les unités si besoin.",consigne:"Écris la moitié.",
   build(){const items=sample([24,36,48,52,64,28,46,82,38,56,74,98,66,84],12).map(half);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:9,title:"Les multiples de 25",sub:"25, 50, 75, 100... de 25 en 25.",consigne:"Calcule.",
   build(){const items=sample([2,3,4,5,6,7,8,9,10,11,12],11).map(a=>mul(a,25));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:10,title:"Décompositions multiplicatives de 60",sub:"Quel nombre multiplié donne 60 ?",consigne:"Complète.",
   build(){const fac=[[2,30],[3,20],[4,15],[5,12],[6,10],[12,5],[15,4],[20,3],[10,6],[30,2],[60,1],[1,60]];
     const items=sample(fac,12).map(([a])=>facteur(a,60));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:11,title:"Ajouter, soustraire des dizaines et des centaines",sub:"J'ajoute ou je retire des paquets entiers.",consigne:"Calcule.",
   build(){const items=uniqueExact(()=>{const a=rnd(120,500),op=choice(['+','-']),b=choice([10,20,30,40,50]);return op==='+'?add(a,b):sub(a,b);},6)
       .concat(uniqueExact(()=>{const a=rnd(150,600),op=choice(['+','-']),b=choice([100,200,300]);return op==='+'?add(a,b):sub(a,b);},6));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:12,title:"Multiplier par 10, par 100",sub:"×10 j'ajoute un zéro · ×100 j'ajoute deux zéros.",consigne:"Calcule.",
   build(){const items=sample([...Array(98).keys()].map(i=>i+2),6).map(a=>mul(a,10)).concat(sample([...Array(39).keys()].map(i=>i+2),6).map(a=>mul(a,100)));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:13,title:"Multiplier par 4, par 8",sub:"×4 = double du double · ×8 = double du double du double.",consigne:"Calcule.",
   build(){const items=sample([...Array(23).keys()].map(i=>i+3).filter(x=>x!==8),6).map(a=>mul(a,4)).concat(sample([...Array(13).keys()].map(i=>i+3).filter(x=>x!==4),6).map(a=>mul(a,8)));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:14,title:"Multiplier par 20, 30, 40",sub:"Astuce : je multiplie par le chiffre, puis par 10.",consigne:"Calcule.",
   build(){const items=uniqueComm(()=>mul(rnd(2,12),choice([20,30,40])),12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:15,title:"Décomposer pour calculer une multiplication",sub:"Ex : 6 × 14 = (6×10) + (6×4) = 60 + 24 = 84.",consigne:"Décompose puis calcule. Écris les étapes.",
   build(){const seen=new Set();const d=[];
     while(d.length<6){const a=rnd(3,8),b=choice([12,13,14,15,16,21,23,24]);const k=a+'x'+b;if(!seen.has(k)){seen.add(k);d.push([a,b]);}}
     const lines=d.map(([a,b])=>{
       const free=()=>`<input class="ans-free" inputmode="numeric" autocomplete="off">`;
       const finalId='a'+(inputCounter++);
       sessionItems[finalId]={text:`${a} × ${b} = @`,answer:a*b};
       const ln=renderLesson!=null?` data-lesson="${renderLesson}"`:'';
       const finalField=`<input class="ans" id="${finalId}" data-answer="${a*b}"${ln} inputmode="numeric" autocomplete="off"><span class="mark" data-for="${finalId}"></span>`;
       return `<div class="op">${a} × ${b} = (${free()} × ${free()}) + (${free()} × ${free()}) = ${free()} + ${free()} = ${finalField}</div>`;
     }).join('');
     return ficheHTML(this.num,this.title,this.sub,this.consigne,`<div class="deco">${lines}</div>`);}},
];
function buildFiches(){return LESSONS.map(l=>{renderLesson=l.num;const html=l.build();renderLesson=null;return html;});}

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
  const cells=blocks.map(b=>{renderLesson=b.num;const ops=b.ops.map(o=>`<div class="bop">${renderItem(o)}</div>`).join('');renderLesson=null;return `<div class="bloc"><span class="blab">M${b.num}.</span> <span class="btheme">${b.theme}</span>${ops}</div>`;}).join('');
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
function getStreak(){try{return JSON.parse(localStorage.getItem(STREAK_KEY))||{days:0,last:null,max:0};}catch(e){return {days:0,last:null,max:0};}}
function updateStreak(){
  const today=todayStr();let s=getStreak();
  if(!s.last){s={days:1,last:today,max:1};}
  else{const d=daysBetween(s.last,today);
    if(d===1){s.days++;s.last=today;}
    else if(d!==0){s.days=1;s.last=today;}}
  s.max=Math.max(s.max||0,s.days); // record de série, jamais reperdu
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

/* Étoiles par leçon : une étoile dès le premier sans-faute sur la leçon */
const STARS_KEY='cm_ce2_stars';
function loadStars(){try{return JSON.parse(localStorage.getItem(STARS_KEY))||{};}catch(e){return {};}}
function saveStars(s){try{localStorage.setItem(STARS_KEY,JSON.stringify(s));}catch(e){}}
function recordLessonResult(num,perfect){
  const stars=loadStars();
  const had=(stars[num]||0)>0;
  if(perfect) stars[num]=(stars[num]||0)+1;
  saveStars(stars);
  return {count:stars[num]||0, newStar: perfect && !had};
}
function starsEarned(){const s=loadStars();return LESSONS.filter(l=>(s[l.num]||0)>0).length;}

/* Stats de réussite par leçon (agrégées sur tous les contextes : leçon seule,
   bilan complet, bilan express). Sert à repérer les thèmes à retravailler. */
const LESSON_STATS_KEY='cm_ce2_lessonStats';
function loadLessonStats(){try{return JSON.parse(localStorage.getItem(LESSON_STATS_KEY))||{};}catch(e){return {};}}
function recordLessonStats(perLesson){
  const s=loadLessonStats();
  for(const num in perLesson){
    const {ok,total}=perLesson[num];
    if(!total) continue;
    const e=s[num]||{attempts:0,correct:0,questions:0,bestPct:0,lastPct:0};
    e.attempts++; e.correct+=ok; e.questions+=total;
    const pct=Math.round(ok/total*100);
    e.bestPct=Math.max(e.bestPct,pct); e.lastPct=pct;
    s[num]=e;
  }
  try{localStorage.setItem(LESSON_STATS_KEY,JSON.stringify(s));}catch(e){}
}
const lessonAvgPct=e=>e&&e.questions?Math.round(e.correct/e.questions*100):null;

/* ---------- Objectif du jour ---------- */
const GOAL_KEY='cm_ce2_goal';
const GOALS_DONE_KEY='cm_ce2_goalsDone';
const GOAL_TYPES=[
  {type:'express',       target:1, label:'Termine 1 bilan express.'},
  {type:'star',          target:1, label:'Gagne 1 nouvelle étoile.'},
  {type:'perfectLesson', target:1, label:'Réussis 1 leçon sans faute.'},
  {type:'record',        target:1, label:'Bats un de tes records.'},
  {type:'sessions',      target:3, label:"Fais 3 entraînements aujourd'hui."},
];
function getGoalsDone(){const v=parseInt(localStorage.getItem(GOALS_DONE_KEY)||'0',10);return isNaN(v)?0:v;}
function getGoal(){
  const today=todayStr();let goal=null;
  try{goal=JSON.parse(localStorage.getItem(GOAL_KEY));}catch(e){}
  if(!goal||goal.date!==today){ // nouvel objectif tiré une fois par jour
    const def=GOAL_TYPES[Math.floor(Math.random()*GOAL_TYPES.length)];
    goal={date:today,type:def.type,target:def.target,label:def.label,progress:0,done:false};
    try{localStorage.setItem(GOAL_KEY,JSON.stringify(goal));}catch(e){}
  }
  return goal;
}
/* Met à jour l'objectif selon l'événement de la session. Renvoie {goal, justDone}. */
function updateGoal(ev){
  const goal=getGoal();
  if(goal.done) return {goal,justDone:false};
  let inc=0;
  switch(goal.type){
    case 'express':       if(ev.mode==='express') inc=1; break;
    case 'star':          if(ev.newStar) inc=1; break;
    case 'perfectLesson': if(ev.mode==='lecon'&&ev.perfect) inc=1; break;
    case 'record':        if(ev.isRecord) inc=1; break;
    case 'sessions':      inc=1; break; // chaque entraînement compte
  }
  if(inc>0){
    goal.progress=Math.min(goal.target,goal.progress+inc);
    if(goal.progress>=goal.target) goal.done=true;
    try{localStorage.setItem(GOAL_KEY,JSON.stringify(goal));}catch(e){}
  }
  const justDone=goal.done; // on n'arrive ici que si l'objectif n'était pas encore atteint
  if(justDone){try{localStorage.setItem(GOALS_DONE_KEY,String(getGoalsDone()+1));}catch(e){}}
  return {goal,justDone};
}

/* ---------- Badges (succès cumulatifs, persistants une fois gagnés) ---------- */
const BADGES_KEY='cm_ce2_badges';
const BADGES=[
  {id:'first',    icon:'🎉',title:'Premier pas',       desc:'Terminer un premier bilan.',         test:g=>g.totalRuns>=1},
  {id:'streak3',  icon:'🔥',title:'Sérieux',           desc:'Une série de 3 jours.',              test:g=>g.maxStreak>=3},
  {id:'streak7',  icon:'🔥',title:'En feu',            desc:'Une série de 7 jours.',              test:g=>g.maxStreak>=7},
  {id:'stars5',   icon:'⭐',title:'Étoile montante',    desc:'5 leçons réussies sans faute.',      test:g=>g.stars>=5},
  {id:'stars10',  icon:'🌟',title:"Chasseur d'étoiles", desc:'10 leçons réussies sans faute.',     test:g=>g.stars>=10},
  {id:'stars15',  icon:'🏆',title:'Sans faute partout', desc:'Les 15 leçons étoilées.',            test:g=>g.stars>=15},
  {id:'trained10',icon:'💪',title:'Entraîné',          desc:'10 bilans terminés.',                test:g=>g.totalRuns>=10},
  {id:'eclair',   icon:'⚡',title:'Éclair',            desc:'Un bilan express en moins de 8 min.', test:g=>g.bestExpressMs<=480000},
  {id:'carton',   icon:'💯',title:'Carton plein',      desc:'Un bilan réussi à 100 %.',           test:g=>g.perfectBilan},
  {id:'champion', icon:'🥇',title:'Champion',          desc:"Décrocher une médaille d'or.",        test:g=>g.gold},
  {id:'goal1',    icon:'🎯',title:'Premier défi',      desc:'Réussir un objectif du jour.',       test:g=>g.goalsDone>=1},
  {id:'goal7',    icon:'🎯',title:'Persévérant',       desc:'Réussir 7 objectifs du jour.',       test:g=>g.goalsDone>=7},
  {id:'goal30',   icon:'🏅',title:'Maître des défis',   desc:'Réussir 30 objectifs du jour.',      test:g=>g.goalsDone>=30},
];
function loadBadges(){try{return JSON.parse(localStorage.getItem(BADGES_KEY))||[];}catch(e){return [];}}
/* Instantané des stats servant aux conditions de badges */
function gSnapshot(){
  const rc=loadRuns('complet'),re=loadRuns('express'),all=[...rc,...re];
  const s=getStreak();
  return {
    totalRuns:all.length,
    stars:starsEarned(),
    maxStreak:s.max||s.days||0,
    bestExpressMs:re.length?Math.min(...re.map(r=>r.ms)):Infinity,
    perfectBilan:all.some(r=>r.count>0&&r.ok===r.count),
    gold:rc.length>=3||re.length>=3, // un podium d'or existe dès 3 essais dans un mode
    goalsDone:getGoalsDone(),
  };
}
/* Débloque les badges nouvellement atteints ; renvoie les nouveaux. */
function evaluateBadges(){
  const g=gSnapshot();const set=new Set(loadBadges());const newly=[];
  BADGES.forEach(b=>{if(!set.has(b.id)&&b.test(g)){set.add(b.id);newly.push(b);}});
  if(newly.length){try{localStorage.setItem(BADGES_KEY,JSON.stringify([...set]));}catch(e){}}
  return newly;
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

/* Niveau de réussite → couleur (rouge < 50, orange < 75, vert sinon) */
const pctColor=p=>p<50?'#c62828':(p<75?'#ef6c00':'#2e7d32');

/* Liste des 15 leçons avec étoiles + taux de réussite (écran « une leçon à la fois ») */
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

/* ============================================================
   Navigation : accueil / sessions
   ============================================================ */
let currentMode=null; // 'complet' | 'express' | 'lecon' | 'revision' | null
let currentLessonNum=null; // numéro de leçon quand currentMode === 'lecon'
let sessionRecorded=false; // l'essai en cours a-t-il déjà été enregistré ?
let lastErrors=[]; // items {text, answer} non réussis lors de la dernière vérification
let pendingRevision=[]; // items à réviser, transmis à la vue #revision

// Construit le contenu COMPLET pour l'impression (toujours présent dans le DOM).
// En interactif on n'affiche qu'une partie via masquage, mais pour rester simple
// on régénère le DOM selon le mode et on garde la version imprimable cohérente.
function buildPrintableDOM(){
  inputCounter=0;
  const fiches=buildFiches();
  return coverHTML()+fichesPagesHTML(fiches)+bilanHTML(1)+bilanHTML(2);
}

/* ---------- Routing par hash ----------
   Chaque vue a un hash (#accueil, #lecons, #complet, #express, #lecon-N).
   Les déclencheurs ci-dessous ne font que CHANGER le hash : c'est ce qui
   crée une entrée dans l'historique du navigateur. Le rendu réel est piloté
   par route(), branché sur l'événement hashchange — donc Précédent/Suivant
   du navigateur passent d'une vue à l'autre au lieu de quitter la page.
   On utilise le hash (et non history.pushState) pour rester compatible avec
   l'ouverture du fichier en local (file://). */

// Déclencheurs (liés à l'UI)
function goHome(){ location.hash='accueil'; }
function showLessons(){ location.hash='lecons'; }
function startComplet(){ location.hash='complet'; }
function startExpress(){ location.hash='express'; }
function startLecon(num){ if(LESSONS.find(l=>l.num===num)) location.hash='lecon-'+num; }
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
  else if(h==='lecons') showLessonsView();
  else if(h==='revision'){ if(pendingRevision.length) runRevision(pendingRevision); else showHomeView(); }
  else if(h.startsWith('lecon-')){
    const n=Number(h.slice(6));
    if(LESSONS.find(l=>l.num===n)) runLecon(n); else showHomeView();
  }
  else showHomeView(); // '' ou #accueil
}

// Remet l'UI dans l'état « hors session » (commun à l'accueil et au sélecteur)
function resetSessionUI(){
  resetChrono();
  currentMode=null; currentLessonNum=null;
  document.getElementById('sheets').innerHTML='';
  const sc=document.getElementById('score'); sc.classList.add('hidden'); sc.textContent='';
  document.getElementById('btnVerify').disabled=true;
  const old=document.getElementById('resultBanner'); if(old) old.remove();
}

// Rendus des vues (sans toucher à l'historique)
function showHomeView(){
  resetSessionUI();
  document.getElementById('home').style.display='';
  document.getElementById('lessons').style.display='none';
  renderHomeStats();
  window.scrollTo({top:0,behavior:'smooth'});
}
function showLessonsView(){
  resetSessionUI();
  document.getElementById('home').style.display='none';
  renderLessons();
  document.getElementById('lessons').style.display='';
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
  document.getElementById('home').style.display='none';
  document.getElementById('lessons').style.display='none';
  const sc=document.getElementById('score'); sc.classList.add('hidden'); sc.textContent='';
  document.getElementById('btnVerify').disabled=false;
  startChrono();
  window.scrollTo({top:0,behavior:'smooth'});
  // Confort de saisie : on place le curseur sur le premier calcul.
  const first=document.querySelector('#sheets input');
  if(first) first.focus({preventScroll:true});
}

/* ============================================================
   Vérification (arrête le chrono)
   ============================================================ */
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
  // Enregistrement de l'essai (une seule fois par session)
  // → bilan complet/express : classement + médaille
  // → leçon seule : étoile si sans-faute
  let medalInfo=null, starInfo=null, streakDays=0, goalRes=null, newBadges=[];
  if(currentMode && currentMode!=='revision' && !sessionRecorded && inputs.length>0){
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
    // Objectif du jour + badges (évalués après l'enregistrement de l'essai)
    goalRes=updateGoal({mode:currentMode, newStar:!!(starInfo&&starInfo.newStar), perfect, isRecord:!!(medalInfo&&medalInfo.isRecord)});
    newBadges=evaluateBadges();
    // Une seule pluie de confettis si quelque chose est à fêter
    if((medalInfo&&medalInfo.isRecord)||(starInfo&&starInfo.newStar)||goalRes.justDone||newBadges.length) confetti();
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
  if(starInfo){
    if(starInfo.perfect){
      html+=`<div class="rb-medal"><span class="rb-medal-ico">⭐</span><span class="rb-medal-txt">${starInfo.newStar?'Étoile gagnée !':'Encore sans faute !'}</span></div>`;
    }
    let msg = starInfo.perfect
      ? `Leçon réussie sans faute${starInfo.count>1?` (${starInfo.count}×)`:''}. Bravo !`
      : `Il faut un sans-faute pour décrocher l'étoile de cette leçon. Réessaie ⭐`;
    if(streakDays>=2) msg+=` · 🔥 ${streakDays} jours d'affilée`;
    html+=`<div class="rb-rank">${msg}</div>`;
  }
  if(newBadges.length){
    html+=`<div class="rb-badges">🏅 Nouveau badge : ${newBadges.map(b=>`${b.icon} ${b.title}`).join(' · ')} !</div>`;
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

/* ============================================================
   Initialisation : câblage des événements (plus de onclick inline)
   ============================================================ */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btnVerify').addEventListener('click',verify);
  document.getElementById('btnHome').addEventListener('click',goHome);
  document.getElementById('btnPrint').addEventListener('click',printAll);
  document.getElementById('cardComplet').addEventListener('click',startComplet);
  document.getElementById('cardExpress').addEventListener('click',startExpress);
  document.getElementById('cardLecon').addEventListener('click',showLessons);
  document.getElementById('backHome').addEventListener('click',goHome);
  document.getElementById('printLink').addEventListener('click',printAll);

  // Sélection d'une leçon dans la liste (délégation)
  document.getElementById('lessonList').addEventListener('click',e=>{
    const btn=e.target.closest('.lesson-item');
    if(btn) startLecon(Number(btn.dataset.num));
  });

  // Précédent/Suivant du navigateur → on rejoue la vue correspondante
  window.addEventListener('hashchange',route);
  // Au chargement : on affiche la vue désignée par le hash (accueil par défaut)
  route();
});
