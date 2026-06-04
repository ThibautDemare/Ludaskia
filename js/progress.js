/* ============================================================
   Progression persistée : records de bilans, série de jours,
   étoiles et statistiques par leçon. (localStorage via lsGet/lsSet)
   ============================================================ */

/* ---------- Records de bilans (classement) ---------- */
const RUNS_KEY=m=>`cm_ce2_runs_${m}`;
const MAX_RUNS=50; // on ne garde que les 50 derniers essais par mode
function loadRuns(mode){return lsGet(RUNS_KEY(mode),[]);}
function saveRuns(mode,runs){lsSet(RUNS_KEY(mode),runs);}

/* Bornes de période calendaire (pour les objectifs de régularité) */
function startOfWeek(){ const d=new Date(); const day=(d.getDay()+6)%7; // lundi = 0
  d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d.getTime(); }
function startOfMonth(){ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).getTime(); }
/* Nombre d'essais d'un mode depuis un instant donné */
function countSince(mode,since){ return loadRuns(mode).filter(r=>r.ts>=since).length; }

/* Classement « score puis temps » : plus de bonnes réponses d'abord,
   le chrono départage à égalité (le plus rapide gagne). */
function cmpRun(a,b){return b.ok!==a.ok ? b.ok-a.ok : a.ms-b.ms;}
const runPct=r=>r.count?Math.round(r.ok/r.count*100):0;
const fmtRecord=r=>`${r.ok}/${r.count} · ${fmt(r.ms)}`;

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

/* ---------- Série de jours consécutifs ---------- */
const STREAK_KEY='cm_ce2_streak';
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function daysBetween(a,b){return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);}
function getStreak(){return lsGet(STREAK_KEY,{days:0,last:null,max:0});}
function updateStreak(){
  const today=todayStr();let s=getStreak();
  if(!s.last){s={days:1,last:today,max:1};}
  else{const d=daysBetween(s.last,today);
    if(d===1){s.days++;s.last=today;}
    else if(d!==0){s.days=1;s.last=today;}}
  s.max=Math.max(s.max||0,s.days); // record de série, jamais reperdu
  lsSet(STREAK_KEY,s);
  return s;
}
/* Suffixe « · 🔥 N jours d'affilée » (vide si série < 2) */
const streakSuffix=days=>days>=2?` · 🔥 ${days} jours d'affilée`:'';

/* ---------- Étoiles par leçon (1 dès le premier sans-faute) ---------- */
const STARS_KEY='cm_ce2_stars';
function loadStars(){return lsGet(STARS_KEY,{});}
function saveStars(s){lsSet(STARS_KEY,s);}
function recordLessonResult(num,perfect){
  const stars=loadStars();
  const had=(stars[num]||0)>0;
  if(perfect) stars[num]=(stars[num]||0)+1;
  saveStars(stars);
  return {count:stars[num]||0, newStar: perfect && !had};
}
function starsEarned(){const s=loadStars();return LESSONS.filter(l=>(s[l.num]||0)>0).length;}

/* ---------- Stats de réussite par leçon ----------
   Agrégées sur tous les contextes (leçon seule, bilan complet, express).
   Sert à repérer les thèmes à retravailler. */
const LESSON_STATS_KEY='cm_ce2_lessonStats';
function loadLessonStats(){return lsGet(LESSON_STATS_KEY,{});}
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
  lsSet(LESSON_STATS_KEY,s);
}
const lessonAvgPct=e=>e&&e.questions?Math.round(e.correct/e.questions*100):null;
