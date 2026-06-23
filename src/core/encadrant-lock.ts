/* ============================================================
   Verrou optionnel de l'espace encadrant (#234).
   ------------------------------------------------------------
   PIN à 4 chiffres, DÉSACTIVÉ par défaut. Garde-fou contre une modification
   accidentelle/impulsive par l'enfant — PAS un dispositif de sécurité : 100 %
   client, contournable en devtools ; le vrai verrouillage relève des contrôles
   parentaux de l'appareil (documenté). On stocke uniquement des HACHÉS (SHA-256)
   pour qu'un enfant curieux ne lise pas le code en clair dans le storage.

   Réinitialisation : UNIQUEMENT via un secret de récupération à haute entropie
   (GUID) généré à l'activation et affiché une seule fois (copier/télécharger).
   Si le PIN ET ce secret sont perdus, l'accès est définitivement perdu (avertir
   à l'activation). Le secret n'est jamais restocké en clair (seul son haché l'est).

   Clé GLOBALE (non préfixée par profil) : le verrou garde l'ESPACE, pas un profil.
   Il survit donc à « Réinitialiser/Supprimer » un profil et n'est pas exporté.
   ============================================================ */
import { lsGetRaw, lsSetRaw, lsRemoveRaw } from './storage';

export const ENCADRANT_LOCK_KEY = 'ludaskia_encadrant_lock';

interface EncadrantLock {
	pinHash: string;
	recoveryHash: string;
}

/* Un PIN valide = exactement 4 chiffres. */
export function pinValide(pin: string): boolean {
	return /^\d{4}$/.test(pin);
}

/* SHA-256 → hexadécimal (Web Crypto, natif navigateur et Node ≥ 19). */
async function sha256(s: string): Promise<string> {
	const data = new TextEncoder().encode(s);
	const buf = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Secret de récupération à haute entropie (GUID, repli getRandomValues). */
function genSecret(): string {
	try {
		return crypto.randomUUID();
	} catch {
		const a = new Uint8Array(16);
		crypto.getRandomValues(a);
		return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
	}
}

function loadLock(): EncadrantLock | null {
	const v = lsGetRaw(ENCADRANT_LOCK_KEY, null);
	return v && typeof v.pinHash === 'string' && typeof v.recoveryHash === 'string'
		? (v as EncadrantLock)
		: null;
}

/* Le verrou est-il actif ? (lecture synchrone, pour décider d'afficher le pavé) */
export function pinActif(): boolean {
	return loadLock() !== null;
}

/* Active le PIN et renvoie le SECRET DE RÉCUPÉRATION en clair (à afficher une seule
   fois : copier/télécharger). Seuls les hachés sont persistés. */
export async function definirPin(pin: string): Promise<string> {
	const secret = genSecret();
	const lock: EncadrantLock = { pinHash: await sha256(pin), recoveryHash: await sha256(secret) };
	lsSetRaw(ENCADRANT_LOCK_KEY, JSON.stringify(lock));
	return secret;
}

/* Le PIN saisi est-il correct ? (false si aucun verrou) */
export async function verifierPin(pin: string): Promise<boolean> {
	const lock = loadLock();
	return lock != null && (await sha256(pin)) === lock.pinHash;
}

/* Réinitialise via le secret de récupération : si le secret correspond, on retire
   le verrou (l'encadrant pourra définir un nouveau PIN). Renvoie le succès. */
export async function reinitViaRecuperation(secret: string): Promise<boolean> {
	const lock = loadLock();
	if (!lock) return false;
	const ok = (await sha256(secret.trim())) === lock.recoveryHash;
	if (ok) lsRemoveRaw(ENCADRANT_LOCK_KEY);
	return ok;
}

/* Désactive le PIN depuis l'intérieur de l'espace (déjà déverrouillé). */
export function desactiverPin(): void {
	lsRemoveRaw(ENCADRANT_LOCK_KEY);
}
