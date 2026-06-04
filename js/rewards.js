/* ============================================================
   Récompenses : objectif du jour + trophées cumulatifs
   (les podiums des classements, eux, donnent des « médailles »)
   ============================================================ */

/* ---------- Défi du jour ----------
   Recentré « qualité » : la cadence (sprints/express/complet) est gérée par
   les objectifs de régularité ; le défi du jour vise un dépassement ponctuel. */
const GOAL_KEY='cm_ce2_goal';
const GOALS_DONE_KEY='cm_ce2_goalsDone';
const GOAL_TYPES=[
  {type:'star',          target:1, label:'Gagne 1 nouvelle étoile.'},
  {type:'perfectLesson', target:1, label:'Réussis 1 leçon sans faute.'},
  {type:'record',        target:1, label:'Bats un de tes records.'},
];
function getGoalsDone(){const v=lsGet(GOALS_DONE_KEY,0);return typeof v==='number'?v:0;}
function getGoal(){
  const today=todayStr();let goal=lsGet(GOAL_KEY,null);
  if(!goal||goal.date!==today){ // nouvel objectif tiré une fois par jour
    const def=GOAL_TYPES[Math.floor(Math.random()*GOAL_TYPES.length)];
    goal={date:today,type:def.type,target:def.target,label:def.label,progress:0,done:false};
    lsSet(GOAL_KEY,goal);
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
    case 'sprint':        if(ev.sprint) inc=1; break;
    case 'sessions':      inc=1; break; // chaque entraînement compte
  }
  if(inc>0){
    goal.progress=Math.min(goal.target,goal.progress+inc);
    if(goal.progress>=goal.target) goal.done=true;
    lsSet(GOAL_KEY,goal);
  }
  const justDone=goal.done; // on n'arrive ici que si l'objectif n'était pas encore atteint
  if(justDone) lsSet(GOALS_DONE_KEY,getGoalsDone()+1);
  return {goal,justDone};
}

/* ---------- Trophées (succès cumulatifs, persistants une fois gagnés) ----------
   Un trophée peut être défini par un seuil sur une métrique de gSnapshot
   ({metric, n} → test g[metric] >= n) ou par un test explicite (booléens, etc.).
   tiers() fabrique une famille de trophées à paliers réutilisable. */
const TROPHIES_KEY='cm_ce2_trophies';
const TROPHIES_KEY_OLD='cm_ce2_badges'; // ancienne clé : lue en secours puis migrée

function tiers(prefix,icon,metric,levels){
  // levels : [{n, title, desc}]
  return levels.map(l=>({id:prefix+l.n,icon,title:l.title,desc:l.desc,metric,n:l.n}));
}
const TROPHIES=[
  {id:'first',    icon:'🎉',title:'Premier pas',  desc:'Terminer un premier bilan.', metric:'totalRuns',n:1},
  ...tiers('streak','🔥','maxStreak',[
    {n:3, title:'Sérieux', desc:'Une série de 3 jours.'},
    {n:7, title:'En feu',  desc:'Une série de 7 jours.'},
  ]),
  ...tiers('stars','⭐','stars',[
    {n:5,  title:'Étoile montante',   desc:'5 leçons réussies sans faute.'},
    {n:10, title:"Chasseur d'étoiles", desc:'10 leçons réussies sans faute.'},
    {n:15, title:'Sans faute partout', desc:'Les 15 leçons étoilées.'},
  ]),
  {id:'trained10',icon:'💪',title:'Entraîné',     desc:'10 bilans terminés.', metric:'totalRuns',n:10},
  {id:'eclair',   icon:'⚡',title:'Éclair',       desc:'Un bilan express en moins de 8 min.', test:g=>g.bestExpressMs<=480000},
  {id:'carton',   icon:'💯',title:'Carton plein', desc:'Un bilan réussi à 100 %.', test:g=>g.perfectBilan},
  {id:'champion', icon:'🥇',title:'Champion',     desc:"Décrocher une médaille d'or.", test:g=>g.gold},
  ...tiers('sprint','🏃','sprints',[
    {n:1,   title:'Sprinter',             desc:'Terminer un sprint de 5 min.'},
    {n:5,   title:'Sprinter aguerri',     desc:'5 sprints terminés.'},
    {n:15,  title:'Sprinter chevronné',   desc:'15 sprints terminés.'},
    {n:50,  title:'Marathonien du calcul', desc:'50 sprints terminés.'},
    {n:100, title:'Centurion',            desc:'100 sprints terminés.'},
  ]),
  ...tiers('goal','🎯','goalsDone',[
    {n:1,  title:'Premier défi',     desc:'Réussir un objectif du jour.'},
    {n:7,  title:'Persévérant',      desc:'Réussir 7 objectifs du jour.'},
    {n:30, title:'Maître des défis', desc:'Réussir 30 objectifs du jour.'},
  ]),
];
// Compile le raccourci {metric, n} en fonction test.
TROPHIES.forEach(t=>{ if(!t.test && t.metric) t.test=g=>g[t.metric]>=t.n; });

function loadTrophies(){
  const v=lsGet(TROPHIES_KEY,null);
  if(v!=null) return v;
  return lsGet(TROPHIES_KEY_OLD,[]); // migration douce depuis l'ancienne clé
}
/* Instantané des stats servant aux conditions de trophées */
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
    sprints:loadRuns('sprint').length,
  };
}
/* Débloque les trophées nouvellement atteints ; renvoie les nouveaux. */
function evaluateTrophies(){
  const g=gSnapshot();const set=new Set(loadTrophies());const newly=[];
  TROPHIES.forEach(t=>{if(!set.has(t.id)&&t.test(g)){set.add(t.id);newly.push(t);}});
  if(newly.length) lsSet(TROPHIES_KEY,[...set]);
  return newly;
}
