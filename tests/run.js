/* ============================================================
   Tests du module « Calcul mental CE2 » (sans dépendance).
   Lancer :  node exercices/tests/run.js
   ------------------------------------------------------------
   Les fichiers js/ sont des scripts classiques partageant la
   portée globale. On les charge dans un contexte vm avec des
   stubs DOM/localStorage, puis on teste la logique pure (la
   génération, la persistance et les règles de récompense ;
   pas le rendu DOM).
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ORDER = ['utils','storage','profiles','chrono','items','lessons','progress',
               'rewards','effects','render','navigation','sprint','session','main'];
const JS_DIR = path.join(__dirname, '..', 'js');

// Symboles exposés aux tests (ajouter ici au besoin).
const API = ['rnd','choice','sample','commKey','uniqueComm','uniqueExact','escapeHTML','fmt',
  'lsGet','lsSet','add','sub','mul','dbl','half','comp','facteur','renderItem','renderLesson',
  'LESSONS','buildFiches','THEMES','bilanQ','bilanBlocks','bilanHTML','buildPrintableDOM',
  'RUNS_KEY','loadRuns','cmpRun','runPct','fmtRecord','recordRun','startOfWeek','startOfMonth','countSince','REGULARITY',
  'STREAK_KEY','todayStr','daysBetween','getStreak','updateStreak','streakSuffix','CHALLENGES','challengeContext','weakLessons',
  'STARS_KEY','recordLessonResult','starsEarned','LESSON_STATS_KEY','loadLessonStats','recordLessonStats','lessonAvgPct',
  'GOAL_KEY','GOALS_DONE_KEY','getGoalsDone','getGoal','updateGoal','TROPHIES_KEY','TROPHIES','loadTrophies','gSnapshot','evaluateTrophies',
  'sparkline','pctColor','SPRINT_LESSONS','sprintQuestionBody',
  'loadProfilesMeta','listProfiles','activeProfile','setActiveProfile','addProfile','renameProfile','resetProfile','deleteProfile'];

const SOURCE = ORDER.map(f => fs.readFileSync(path.join(JS_DIR, f + '.js'), 'utf8')).join('\n')
  + `\n;globalThis.__api = { ${API.join(',')} };`;

// Construit un environnement neuf (état module + localStorage vierges) par test.
function freshEnv(){
  const store = {};
  const noopEl = { style:{}, classList:{add(){},remove(){},contains(){return false;}},
                   appendChild(){}, querySelector(){return null;}, addEventListener(){} };
  const ctx = {
    Math, Date, JSON, String, Number, Array, Object, Set, Map, parseInt, parseFloat, isNaN, Infinity, console,
    setInterval:()=>0, clearInterval(){}, setTimeout:()=>0,
    localStorage:(()=>{const ls={getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v);},
                   removeItem:k=>{delete store[k];}, clear:()=>{Object.keys(store).forEach(k=>delete store[k]);},
                   key:i=>{const ks=Object.keys(store);return i<ks.length?ks[i]:null;}};
                   Object.defineProperty(ls,'length',{get:()=>Object.keys(store).length});return ls;})(),
    document:{ addEventListener(){}, getElementById(){return null;}, querySelector(){return null;},
               querySelectorAll(){return [];}, createElement(){return noopEl;} },
    window:{ addEventListener(){} },
    location:{ hash:'' },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  return { api: ctx.__api, store };
}

// Décale une date 'YYYY-MM-DD' de delta jours (pour simuler hier/avant-hier).
function shiftDay(api, dStr, delta){
  const d = new Date(dStr + 'T00:00:00'); d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ---------- mini-framework ---------- */
let passed = 0, failed = 0;
function test(name, fn){
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e){ failed++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function eq(a, b, msg){ if (a !== b) throw new Error((msg||'') + ` attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); }
function ok(c, msg){ if (!c) throw new Error(msg || 'condition fausse'); }

/* ============================================================
   Tests
   ============================================================ */
console.log('\nUtilitaires');
test('fmt formate mm:ss', () => { const {api}=freshEnv(); eq(api.fmt(0),'00:00'); eq(api.fmt(65000),'01:05'); eq(api.fmt(600000),'10:00'); });
test('rnd reste dans les bornes', () => { const {api}=freshEnv(); for(let i=0;i<200;i++){const v=api.rnd(2,9);ok(v>=2&&v<=9);} });
test('sample renvoie n éléments', () => { const {api}=freshEnv(); eq(api.sample([1,2,3,4,5],3).length,3); });

console.log('Items');
test('opérations correctes', () => { const {api}=freshEnv();
  eq(api.add(3,4).answer,7); eq(api.sub(9,2).answer,7); eq(api.mul(6,7).answer,42);
  eq(api.dbl(8).answer,16); eq(api.half(10).answer,5); eq(api.comp(3,10).answer,7); eq(api.facteur(4,60).answer,15); });
test('renderItem remplace @ par un champ', () => { const {api}=freshEnv();
  const h=api.renderItem(api.add(2,3)); ok(!h.includes('@')); ok(/class="ans /.test(h)); ok(/data-answer="5"/.test(h)); });

console.log('Leçons & bilans');
test('buildFiches produit 15 fiches couvrant les 15 leçons', () => { const {api}=freshEnv();
  const html=api.buildFiches(); eq(html.length,15);
  const seen=new Set([...html.join('').matchAll(/data-lesson="(\d+)"/g)].map(m=>+m[1]));
  eq(seen.size,15); });
test('bilan express : 45 champs tagués (3 par leçon)', () => { const {api}=freshEnv();
  const h=api.bilanHTML(1); eq([...h.matchAll(/data-lesson=/g)].length,45);
  eq([...h.matchAll(/data-lesson="7"/g)].length,3); });
test('bilanQ renvoie un item valide pour chaque leçon', () => { const {api}=freshEnv();
  for(let k=1;k<=15;k++){const q=api.bilanQ(k);ok(q&&typeof q.text==='string'&&Number.isFinite(q.answer),'leçon '+k);} });
test('aucun résultat négatif (hors-programme CE2)', () => { const {api}=freshEnv();
  for(let k=1;k<=15;k++) for(let i=0;i<300;i++){ const q=api.bilanQ(k); ok(q.answer>=0,`leçon ${k} → ${q.answer}`); } });

console.log('Records & classement');
test('cmpRun : score puis temps', () => { const {api}=freshEnv();
  const arr=[{ok:18,ms:400},{ok:18,ms:300},{ok:20,ms:999}].sort(api.cmpRun);
  eq(arr[0].ok,20); eq(arr[1].ms,300); });
test('recordRun : rang, médaille et record', () => { const {api}=freshEnv();
  api.recordRun('express',40,45,500000);
  api.recordRun('express',44,45,480000);
  const r=api.recordRun('express',45,45,470000); // meilleur score → 1er
  eq(r.rank,1); eq(r.total,3); eq(r.medal,1); eq(r.isRecord,true);
  const r2=api.recordRun('express',10,45,300000); // mauvais score → pas de médaille
  eq(r2.medal,0); eq(r2.isRecord,false); });

console.log('Série de jours');
test('getStreak par défaut', () => { const {api}=freshEnv(); eq(api.getStreak().days,0); });
test('updateStreak : 1er jour, +1 le lendemain, reset si saut', () => { const {api}=freshEnv();
  eq(api.updateStreak().days,1);
  const today=api.todayStr();
  api.lsSet(api.STREAK_KEY,{days:3,last:shiftDay(api,today,-1),max:3});
  eq(api.updateStreak().days,4); // hier → +1
  api.lsSet(api.STREAK_KEY,{days:4,last:shiftDay(api,today,-2),max:4});
  const s=api.updateStreak(); eq(s.days,1); eq(s.max,4); }); // saut → reset, max conservé
test('streakSuffix', () => { const {api}=freshEnv(); eq(api.streakSuffix(1),''); ok(api.streakSuffix(3).includes('3 jours')); });

console.log('Étoiles & stats par leçon');
test('recordLessonResult : étoile au 1er sans-faute', () => { const {api}=freshEnv();
  eq(api.recordLessonResult(3,true).newStar,true);
  eq(api.recordLessonResult(3,true).newStar,false);
  eq(api.recordLessonResult(5,false).count,0);
  eq(api.starsEarned(),1); });
test('recordLessonStats : agrégation + moyenne', () => { const {api}=freshEnv();
  api.recordLessonStats({7:{ok:10,total:12}}); api.recordLessonStats({7:{ok:12,total:12}});
  const e=api.loadLessonStats()[7]; eq(e.attempts,2); eq(e.correct,22); eq(e.questions,24); eq(e.bestPct,100);
  eq(api.lessonAvgPct(e),92); });

console.log('Défi du jour (qualité)');
test('getGoal en crée un pour aujourd’hui', () => { const {api}=freshEnv();
  const g=api.getGoal(); eq(g.date,api.todayStr()); eq(g.done,false); });
test('remédiation proposée seulement s’il y a une leçon à revoir', () => { const {api}=freshEnv();
  const avail=()=>api.CHALLENGES.filter(c=>c.avail(api.challengeContext())).map(c=>c.type);
  ok(!avail().includes('remediation'),'pas de leçon faible → pas de remédiation');
  api.recordLessonStats({6:{ok:2,total:12}}); // 17 % → leçon à revoir
  ok(api.weakLessons().includes(6));
  ok(avail().includes('remediation'),'leçon faible → remédiation possible'); });
test('défis « se dépasser » indisponibles sans record à battre', () => { const {api}=freshEnv();
  const avail=()=>api.CHALLENGES.filter(c=>c.avail(api.challengeContext())).map(c=>c.type);
  ok(!avail().includes('beatSprint')&&!avail().includes('beatExpress'));
  api.recordRun('sprint',5,8,300000);
  ok(avail().includes('beatSprint')); });
test('updateGoal : progression, justDone et compteur', () => { const {api}=freshEnv();
  api.lsSet(api.GOAL_KEY,{date:api.todayStr(),type:'record',target:1,label:'x',progress:0,done:false});
  eq(api.updateGoal({mode:'express'}).justDone,false); // pas de record → pas d'avancée
  const r=api.updateGoal({isRecord:true}); eq(r.justDone,true);
  eq(api.getGoalsDone(),1);
  eq(api.updateGoal({isRecord:true}).justDone,false); }); // déjà fait

console.log('Objectifs de régularité');
test('countSince compte les essais d’une période', () => { const {api}=freshEnv();
  const now=Date.now();
  api.lsSet('cm_ce2_runs_sprint',[{ts:now,ok:1,count:1,ms:1},{ts:now-40*86400000,ok:1,count:1,ms:1}]);
  eq(api.countSince('sprint',now-7*86400000),1); // un seul dans les 7 derniers jours
  ok(api.startOfWeek()<=now && api.startOfMonth()<=now); });
test('REGULARITY : 3 sprints/semaine, 2 express/mois, 1 complet/mois', () => { const {api}=freshEnv();
  const byMode=Object.fromEntries(api.REGULARITY.map(o=>[o.mode,o]));
  eq(byMode.sprint.target,3); eq(byMode.sprint.period,'week');
  eq(byMode.express.target,2); eq(byMode.express.period,'month');
  eq(byMode.complet.target,1); eq(byMode.complet.period,'month'); });

console.log('Trophées');
test('evaluateTrophies débloque selon les stats, sans doublon', () => { const {api}=freshEnv();
  eq(api.evaluateTrophies().length,0);
  api.recordRun('express',45,45,400000); // 1 bilan, 100%, express<8min
  const ids=api.evaluateTrophies().map(t=>t.id);
  ok(ids.includes('first')); ok(ids.includes('carton')); ok(ids.includes('eclair'));
  eq(api.evaluateTrophies().length,0); }); // rien de nouveau au 2e passage
test('gSnapshot reflète étoiles et série', () => { const {api}=freshEnv();
  for(let n=1;n<=5;n++) api.recordLessonResult(n,true);
  eq(api.gSnapshot().stars,5);
  ok(api.evaluateTrophies().map(t=>t.id).includes('stars5')); });
test('trophée « Tout au vert » : 15 leçons ≥ 70 %', () => { const {api}=freshEnv();
  for(let n=1;n<=14;n++) api.recordLessonStats({[n]:{ok:10,total:10}});
  ok(!api.gSnapshot().allGreen); // 1 leçon manquante
  api.recordLessonStats({15:{ok:10,total:10}});
  ok(api.gSnapshot().allGreen);
  ok(api.evaluateTrophies().map(t=>t.id).includes('allgreen')); });
test('trophées de volume cumulé', () => { const {api}=freshEnv();
  api.recordLessonStats({1:{ok:60,total:120}}); // 120 calculs résolus
  eq(api.gSnapshot().totalAnswered,120);
  ok(api.evaluateTrophies().map(t=>t.id).includes('vol100')); });
test('trophées à paliers compilés (metric/n → test)', () => { const {api}=freshEnv();
  const def=api.TROPHIES.find(t=>t.id==='stars5');
  ok(typeof def.test==='function'); ok(def.test({stars:5})); ok(!def.test({stars:4})); });
test('migration depuis l’ancienne clé cm_ce2_badges', () => { const {api}=freshEnv();
  api.lsSet('cm_ce2_badges',['first']);
  ok(api.loadTrophies().includes('first')); }); // lue en secours

console.log('Sprint');
test('un sprint compte dans gSnapshot.sprints + trophée sprint1', () => { const {api}=freshEnv();
  api.recordRun('sprint',12,15,300000);
  eq(api.gSnapshot().sprints,1);
  ok(api.evaluateTrophies().map(t=>t.id).includes('sprint1')); });
test('objectif sprint validé en terminant un sprint', () => { const {api}=freshEnv();
  api.lsSet(api.GOAL_KEY,{date:api.todayStr(),type:'sprint',target:1,label:'x',progress:0,done:false});
  eq(api.updateGoal({mode:'complet'}).justDone,false);
  eq(api.updateGoal({mode:'sprint',sprint:true}).justDone,true); });
test('le sprint couvre les 15 leçons (15 incluse, avec étapes)', () => { const {api}=freshEnv();
  ok(api.SPRINT_LESSONS.includes(15)); eq(api.SPRINT_LESSONS.length,15); });
test('sprint leçon 15 : étapes intermédiaires + champ final', () => { const {api}=freshEnv();
  const body15=api.sprintQuestionBody({text:'6 × 14 = @',answer:84,_lesson:15});
  eq((body15.match(/sprint-free/g)||[]).length,6); // 6 champs de brouillon
  eq((body15.match(/id="sprintInput"/g)||[]).length,1); // 1 champ final corrigé
  const body7=api.sprintQuestionBody({text:'6 × 7 = @',answer:42,_lesson:7});
  ok(!body7.includes('sprint-free')); ok(body7.includes('id="sprintInput"')); });

console.log('Profils');
test('profil par défaut créé au 1er lancement', () => { const {api}=freshEnv();
  const m=api.loadProfilesMeta(); eq(m.list.length,1); eq(m.active,'p1'); eq(api.activeProfile().name,'Profil 1'); });
test('progression isolée par profil', () => { const {api}=freshEnv();
  api.recordRun('sprint',5,5,300000);          // profil par défaut
  const tom=api.addProfile('Tom','🦊');         // bascule sur Tom (vierge)
  eq(api.loadRuns('sprint').length,0);
  api.recordRun('sprint',3,3,300000);
  eq(api.loadRuns('sprint').length,1);
  api.setActiveProfile('p1');                   // retour au défaut
  eq(api.loadRuns('sprint').length,1);          // intact
  api.setActiveProfile(tom.id);
  eq(api.loadRuns('sprint').length,1); });      // Tom intact aussi
test('réinitialiser un profil efface sa progression', () => { const {api}=freshEnv();
  api.recordRun('express',40,45,400000);
  for(let n=1;n<=3;n++) api.recordLessonResult(n,true);
  api.resetProfile('p1');
  eq(api.loadRuns('express').length,0); eq(api.starsEarned(),0); });
test('supprimer un profil (mais pas le dernier)', () => { const {api}=freshEnv();
  const tom=api.addProfile('Tom');
  eq(api.listProfiles().length,2);
  ok(api.deleteProfile(tom.id)); eq(api.listProfiles().length,1);
  ok(!api.deleteProfile('p1')); }); // on garde au moins un profil

/* ---------- bilan ---------- */
console.log(`\n${passed} réussis, ${failed} échoués\n`);
process.exit(failed ? 1 : 0);
