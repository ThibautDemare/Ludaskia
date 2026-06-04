/* ============================================================
   Profils : plusieurs enfants sur le même navigateur, chacun avec
   sa progression isolée (préfixe de clés dérivé de l'UUID du profil).
   - chaque profil a un UUID stable (identification inter-appareils),
   - un updatedAt (ms) bumpé à chaque écriture de données,
   - export/import par profil avec fusion par UUID + recence.
   Aucune migration : en prod on part d'un profil vierge.
   ============================================================ */
const PROFILE_EMOJIS=['🐧','🦊','🐼','🐯','🦁','🐸','🐙','🦉','🐝','🦄','🐱','🐶'];
const EXPORT_APP='calcul-mental-ce2';

function genUuid(){
  try{ return crypto.randomUUID(); }
  catch(e){ return 'u'+Date.now().toString(36)+Math.floor(Math.random()*1e9).toString(36); }
}
function loadProfilesMeta(){ return lsGet(PROFILES_KEY,null); }
function saveProfilesMeta(m){ lsSet(PROFILES_KEY,m); } // PROFILES_KEY n'est pas préfixé et ne déclenche pas le bump
function profilePrefix(p){ return p.uuid+'/'; }

function applyActive(m){
  const p=m.list.find(x=>x.uuid===m.active)||m.list[0];
  m.active=p.uuid;
  setActivePrefix(profilePrefix(p));
}
function initProfiles(){
  let m=loadProfilesMeta();
  if(!m||!Array.isArray(m.list)||!m.list.length){
    const p={uuid:genUuid(),name:'Profil 1',emoji:PROFILE_EMOJIS[0],updatedAt:Date.now()};
    m={list:[p],active:p.uuid};
    saveProfilesMeta(m);
  }
  applyActive(m);
  return m;
}
// Marque le profil actif comme modifié (appelé par storage.js après chaque écriture de données).
function touchActiveProfile(){
  const m=loadProfilesMeta(); if(!m) return;
  const p=m.list.find(x=>x.uuid===m.active); if(!p) return;
  p.updatedAt=Date.now();
  saveProfilesMeta(m);
}

function listProfiles(){ const m=loadProfilesMeta()||initProfiles(); return m.list; }
function activeProfile(){ const m=loadProfilesMeta()||initProfiles(); return m.list.find(x=>x.uuid===m.active)||m.list[0]; }

function setActiveProfile(uuid){
  const m=loadProfilesMeta(); if(!m||!m.list.some(x=>x.uuid===uuid)) return;
  m.active=uuid; saveProfilesMeta(m); applyActive(m);
}
function addProfile(name,emoji){
  const m=loadProfilesMeta()||initProfiles();
  const used=new Set(m.list.map(p=>p.emoji));
  const e=emoji||PROFILE_EMOJIS.find(x=>!used.has(x))||choice(PROFILE_EMOJIS);
  const p={uuid:genUuid(),name:name||('Profil '+(m.list.length+1)),emoji:e,updatedAt:Date.now()};
  m.list.push(p); m.active=p.uuid; saveProfilesMeta(m); applyActive(m);
  return p;
}
function renameProfile(uuid,name){
  const m=loadProfilesMeta(); const p=m&&m.list.find(x=>x.uuid===uuid);
  if(p&&name){ p.name=name; p.updatedAt=Date.now(); saveProfilesMeta(m); }
}
function cycleProfileEmoji(uuid){
  const m=loadProfilesMeta(); const p=m&&m.list.find(x=>x.uuid===uuid); if(!p) return;
  const i=PROFILE_EMOJIS.indexOf(p.emoji);
  p.emoji=PROFILE_EMOJIS[(i+1)%PROFILE_EMOJIS.length]; p.updatedAt=Date.now(); saveProfilesMeta(m);
}
// Efface les données d'un profil (clés sous son préfixe), sauf la méta.
function clearProfileData(prefix){
  lsKeysRaw().filter(k=>k!==PROFILES_KEY && k.startsWith(prefix+'cm_ce2_')).forEach(lsRemoveRaw);
}
function resetProfile(uuid){
  const m=loadProfilesMeta(); const p=m&&m.list.find(x=>x.uuid===uuid); if(!p) return;
  clearProfileData(profilePrefix(p));
  p.updatedAt=Date.now(); saveProfilesMeta(m);
}
function deleteProfile(uuid){
  const m=loadProfilesMeta(); if(!m||m.list.length<=1) return false; // on garde toujours au moins 1 profil
  const p=m.list.find(x=>x.uuid===uuid); if(!p) return false;
  clearProfileData(profilePrefix(p));
  m.list=m.list.filter(x=>x.uuid!==uuid);
  if(m.active===uuid) m.active=m.list[0].uuid;
  saveProfilesMeta(m); applyActive(m);
  return true;
}

/* ---------- Export / import par profil ---------- */
// Données d'un profil avec clés RELATIVES (préfixe retiré), pour réimport portable.
function profileDataRelative(p){
  const P=profilePrefix(p), out={};
  appKeys().forEach(k=>{ if(k!==PROFILES_KEY && k.startsWith(P)){ const v=localStorage.getItem(k); if(v!=null) out[k.slice(P.length)]=v; } });
  return out;
}
function writeProfileData(prefix,data){ Object.keys(data).forEach(rel=>lsSetRaw(prefix+rel,String(data[rel]))); }

// Exporte les profils désignés (par UUID).
function exportProfiles(uuids){
  const m=loadProfilesMeta(); if(!m) return null;
  const list=m.list.filter(p=>uuids.includes(p.uuid));
  return {app:EXPORT_APP,version:2,exportedAt:new Date().toISOString(),
    profiles:list.map(p=>({uuid:p.uuid,name:p.name,emoji:p.emoji,updatedAt:p.updatedAt||0,data:profileDataRelative(p)}))};
}
// Fusionne une sauvegarde : par UUID, écrase si plus récent, ajoute si inconnu.
// Renvoie {added, updated, skipped} ou null si format invalide.
function importProfiles(payload){
  if(!payload||payload.app!==EXPORT_APP||!Array.isArray(payload.profiles)) return null;
  const m=loadProfilesMeta()||initProfiles();
  let added=0,updated=0,skipped=0;
  payload.profiles.forEach(ip=>{
    if(!ip||!ip.uuid||!ip.data) return;
    const existing=m.list.find(x=>x.uuid===ip.uuid);
    if(existing){
      if((ip.updatedAt||0)>(existing.updatedAt||0)){ // sauvegarde plus récente → on écrase
        clearProfileData(profilePrefix(existing));
        writeProfileData(profilePrefix(existing),ip.data);
        existing.name=ip.name||existing.name; existing.emoji=ip.emoji||existing.emoji; existing.updatedAt=ip.updatedAt||Date.now();
        updated++;
      }else skipped++; // version locale plus récente ou identique → on garde
    }else{ // profil inconnu → ajout
      const p={uuid:ip.uuid,name:ip.name||'Profil',emoji:ip.emoji||PROFILE_EMOJIS[0],updatedAt:ip.updatedAt||Date.now()};
      writeProfileData(profilePrefix(p),ip.data);
      m.list.push(p); added++;
    }
  });
  saveProfilesMeta(m); applyActive(m);
  return {added,updated,skipped};
}

onDataWrite=touchActiveProfile; // branche le bump d'updatedAt sur les écritures de données
initProfiles();                 // au chargement, avant tout rendu
