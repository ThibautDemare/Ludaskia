/* ============================================================
   Accès localStorage centralisé (lecture/écriture JSON tolérantes)
   Toute la persistance du projet passe par ces helpers. Les clés sont
   automatiquement préfixées par le profil actif (sauf la clé méta des
   profils), ce qui isole la progression de chaque enfant.
   ============================================================ */
const PROFILES_KEY='ludaskia_profiles'; // clé globale (jamais préfixée)
let activePrefix=''; // préfixe du profil actif ('' = profil hérité / par défaut)
function setActivePrefix(p){ activePrefix=p||''; }
function realKey(key){ return key===PROFILES_KEY?key:activePrefix+key; }

let onDataWrite=null; // hook (profiles.js) appelé après écriture d'une donnée de profil
function lsGet(key,fallback){
  try{const v=localStorage.getItem(realKey(key));return v==null?fallback:JSON.parse(v);}
  catch(e){return fallback;}
}
function lsSet(key,value){
  try{localStorage.setItem(realKey(key),JSON.stringify(value));}catch(e){}
  if(key!==PROFILES_KEY && onDataWrite) onDataWrite(); // marque le profil actif comme modifié
}
/* Accès bas niveau aux clés réelles (réinitialiser/supprimer/sauvegarder) */
function lsKeysRaw(){ const o=[]; try{for(let i=0;i<localStorage.length;i++) o.push(localStorage.key(i));}catch(e){} return o; }
function lsRemoveRaw(realK){ try{localStorage.removeItem(realK);}catch(e){} }
function lsSetRaw(realK,rawValue){ try{localStorage.setItem(realK,rawValue);}catch(e){} }
/* Toutes les clés de l'appli (tous profils confondus) */
function appKeys(){ return lsKeysRaw().filter(k=>k.includes('ludaskia_')); }
