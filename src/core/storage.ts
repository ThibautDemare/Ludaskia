/* ============================================================
   Accès localStorage centralisé (lecture/écriture JSON tolérantes)
   Toute la persistance du projet passe par ces helpers. Les clés sont
   automatiquement préfixées par le profil actif (sauf la clé méta des
   profils), ce qui isole la progression de chaque enfant.
   ============================================================ */
export const PROFILES_KEY = 'ludaskia_profiles'; // clé globale (jamais préfixée)
let activePrefix = ''; // préfixe du profil actif ('' = profil hérité / par défaut)
export function setActivePrefix(p: string) {
  activePrefix = p || '';
}
function realKey(key: string) {
  return key === PROFILES_KEY ? key : activePrefix + key;
}

let onDataWrite: (() => void) | null = null; // hook (profiles.ts) appelé après écriture d'une donnée de profil
export function setOnDataWrite(fn: () => void) {
  onDataWrite = fn;
}
export function lsGet(key: string, fallback: any) {
  try {
    const v = localStorage.getItem(realKey(key));
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
export function lsSet(key: string, value: any) {
  try {
    localStorage.setItem(realKey(key), JSON.stringify(value));
  } catch (e) {}
  if (key !== PROFILES_KEY && onDataWrite) onDataWrite(); // marque le profil actif comme modifié
}
/* Accès bas niveau aux clés réelles (réinitialiser/supprimer/sauvegarder) */
export function lsKeysRaw(): string[] {
  const o: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k != null) o.push(k);
    }
  } catch (e) {}
  return o;
}
export function lsRemoveRaw(realK: string) {
  try {
    localStorage.removeItem(realK);
  } catch (e) {}
}
export function lsSetRaw(realK: string, rawValue: string) {
  try {
    localStorage.setItem(realK, rawValue);
  } catch (e) {}
}
/* Toutes les clés de l'appli (tous profils confondus) */
export function appKeys() {
  return lsKeysRaw().filter((k: string) => k.includes('ludaskia_'));
}
