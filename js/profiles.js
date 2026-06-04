/* ============================================================
   Profils : plusieurs enfants sur le même navigateur, chacun avec
   sa progression isolée (préfixe de clés appliqué par storage.js).
   Aucune migration : en prod on part d'un profil vierge.
   ============================================================ */
const PROFILE_EMOJIS=['🐧','🦊','🐼','🐯','🦁','🐸','🐙','🦉','🐝','🦄','🐱','🐶'];

function loadProfilesMeta(){ return lsGet(PROFILES_KEY,null); }
function saveProfilesMeta(m){ lsSet(PROFILES_KEY,m); }
function newProfileId(){ return 'p'+Date.now().toString(36)+Math.floor(Math.random()*1000); }
function profilePrefix(p){ return p.prefix!=null?p.prefix:(p.id+'/'); }

function applyActive(m){
  const p=m.list.find(x=>x.id===m.active)||m.list[0];
  m.active=p.id;
  setActivePrefix(profilePrefix(p));
}
// Crée le profil par défaut au tout premier lancement, puis applique le profil actif.
function initProfiles(){
  let m=loadProfilesMeta();
  if(!m||!Array.isArray(m.list)||!m.list.length){
    m={list:[{id:'p1',name:'Profil 1',emoji:PROFILE_EMOJIS[0],prefix:''}],active:'p1'};
    saveProfilesMeta(m);
  }
  applyActive(m);
  return m;
}

function listProfiles(){ const m=loadProfilesMeta()||initProfiles(); return m.list; }
function activeProfile(){ const m=loadProfilesMeta()||initProfiles(); return m.list.find(x=>x.id===m.active)||m.list[0]; }

function setActiveProfile(id){
  const m=loadProfilesMeta(); if(!m||!m.list.some(x=>x.id===id)) return;
  m.active=id; saveProfilesMeta(m); applyActive(m);
}
function addProfile(name,emoji){
  const m=loadProfilesMeta()||initProfiles();
  const id=newProfileId();
  const used=new Set(m.list.map(p=>p.emoji));
  const e=emoji||PROFILE_EMOJIS.find(x=>!used.has(x))||choice(PROFILE_EMOJIS);
  const p={id,name:name||('Profil '+(m.list.length+1)),emoji:e,prefix:id+'/'};
  m.list.push(p); m.active=id; saveProfilesMeta(m); applyActive(m);
  return p;
}
function renameProfile(id,name){
  const m=loadProfilesMeta(); const p=m&&m.list.find(x=>x.id===id);
  if(p&&name){ p.name=name; saveProfilesMeta(m); }
}
function cycleProfileEmoji(id){
  const m=loadProfilesMeta(); const p=m&&m.list.find(x=>x.id===id); if(!p) return;
  const i=PROFILE_EMOJIS.indexOf(p.emoji);
  p.emoji=PROFILE_EMOJIS[(i+1)%PROFILE_EMOJIS.length]; saveProfilesMeta(m);
}
// Efface toutes les données d'un profil (clés cm_ce2_* sous son préfixe), sauf la méta.
function clearProfileData(prefix){
  lsKeysRaw().filter(k=>k!==PROFILES_KEY && k.startsWith(prefix+'cm_ce2_')).forEach(lsRemoveRaw);
}
function resetProfile(id){
  const m=loadProfilesMeta(); const p=m&&m.list.find(x=>x.id===id);
  if(p) clearProfileData(profilePrefix(p));
}
function deleteProfile(id){
  const m=loadProfilesMeta(); if(!m||m.list.length<=1) return false; // on garde toujours au moins 1 profil
  const p=m.list.find(x=>x.id===id); if(!p) return false;
  clearProfileData(profilePrefix(p));
  m.list=m.list.filter(x=>x.id!==id);
  if(m.active===id) m.active=m.list[0].id;
  saveProfilesMeta(m); applyActive(m);
  return true;
}

initProfiles(); // au chargement, avant tout rendu
