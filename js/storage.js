/* ============================================================
   Accès localStorage centralisé (lecture/écriture JSON tolérantes)
   Toute la persistance du projet passe par ces deux helpers.
   ============================================================ */
function lsGet(key,fallback){
  try{const v=localStorage.getItem(key);return v==null?fallback:JSON.parse(v);}
  catch(e){return fallback;}
}
function lsSet(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}
}
