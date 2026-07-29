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
/* Écriture SANS notifier onDataWrite : réservée aux migrations internes (réécriture
   de clés), qui ne doivent pas bumper `updatedAt` du profil — sinon la fusion par
   récence de l'export/import serait faussée (la simple activation rendrait le profil
   « plus récent »). */
export function lsSetQuiet(key: string, value: any) {
	try {
		localStorage.setItem(realKey(key), JSON.stringify(value));
	} catch (e) {}
}
/* Suppression d'une clé (préfixée profil) SANS notifier onDataWrite : réservée
   aux migrations internes (renommage de clés), au même titre que lsSetQuiet —
   elles ne doivent pas bumper `updatedAt` du profil. */
export function lsRemoveQuiet(key: string) {
	try {
		localStorage.removeItem(realKey(key));
	} catch (e) {}
}
/* Lecture d'une clé RÉELLE (déjà préfixée, JSON tolérant) : pour lire les données
   d'un profil donné par UUID SANS changer le profil actif — espace encadrant (#234),
   sur le modèle de getXPFor (profiles.ts). Ne passe pas par le préfixe actif. */
export function lsGetRaw(realK: string, fallback: any) {
	try {
		const v = localStorage.getItem(realK);
		return v == null ? fallback : JSON.parse(v);
	} catch (e) {
		return fallback;
	}
}
/* Lecture d'une clé RÉELLE en CHAÎNE BRUTE (sans JSON.parse) : pour recopier telle
   quelle la valeur stockée d'un profil (export par UUID), là où lsGetRaw la
   désérialiserait à tort. Renvoie null si absente. */
export function lsGetItemRaw(realK: string): string | null {
	try {
		return localStorage.getItem(realK);
	} catch (e) {
		return null;
	}
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
/* ⚠️ Écrire une clé RÉELLE contourne le préfixe actif ET le hook `onDataWrite` : le profil
   ciblé n'est donc PAS marqué comme modifié. Une écriture qui traduit une action VOULUE sur
   un profil (espace encadrant : épingler, composer une séance, déclarer « vu en classe »)
   doit appeler `touchProfile(uuid)` derrière, sinon la fusion par récence de l'export/import
   peut l'écraser silencieusement. Un effet AUTOMATIQUE (nettoyage, migration) reste
   silencieux : bumper ferait passer une simple consultation pour une modification. */
export function lsSetRaw(realK: string, rawValue: string) {
	try {
		localStorage.setItem(realK, rawValue);
	} catch (e) {}
}
/* Toutes les clés de l'appli (tous profils confondus) */
export function appKeys() {
	return lsKeysRaw().filter((k: string) => k.includes('ludaskia_'));
}
