/* ============================================================
   Récompenses : objectif du jour + badges cumulatifs
   ============================================================ */

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
function loadBadges(){return lsGet(BADGES_KEY,[]);}
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
  if(newly.length) lsSet(BADGES_KEY,[...set]);
  return newly;
}
