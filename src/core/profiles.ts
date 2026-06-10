/* ============================================================
   Profils : plusieurs enfants sur le même navigateur, chacun avec
   sa progression isolée (préfixe de clés dérivé de l'UUID du profil).
   - chaque profil a un UUID stable (identification inter-appareils),
   - un updatedAt (ms) bumpé à chaque écriture de données,
   - export/import par profil avec fusion par UUID + recence.
   Aucune migration : en prod on part d'un profil vierge.
   ============================================================ */
import { choice } from './utils';
import {
	PROFILES_KEY,
	lsGet,
	lsSet,
	lsKeysRaw,
	lsRemoveRaw,
	lsSetRaw,
	appKeys,
	setActivePrefix,
} from './storage';
import { XP_KEY, niveauDepuisXP } from './progress';
import { niveauRequisAvatar } from './unlocks';

export interface Profile {
	uuid: string;
	name: string;
	emoji: string;
	updatedAt: number;
}
export interface ProfilesMeta {
	list: Profile[];
	active: string;
}

export const PROFILE_EMOJIS = [
	'🐧',
	'🦊',
	'🐼',
	'🐯',
	'🦁',
	'🐸',
	'🐙',
	'🦉',
	'🐝',
	'🦄',
	'🐱',
	'🐶',
];
export const EXPORT_APP = 'ludaskia';

function genUuid() {
	try {
		return crypto.randomUUID();
	} catch (e) {
		return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
	}
}
export function loadProfilesMeta(): ProfilesMeta | null {
	return lsGet(PROFILES_KEY, null);
}
function saveProfilesMeta(m: ProfilesMeta) {
	lsSet(PROFILES_KEY, m);
} // PROFILES_KEY n'est pas préfixé et ne déclenche pas le bump
function profilePrefix(p: Profile) {
	return p.uuid + '/';
}

function applyActive(m: ProfilesMeta) {
	const p = m.list.find((x) => x.uuid === m.active) || m.list[0];
	m.active = p.uuid;
	setActivePrefix(profilePrefix(p));
}
export function initProfiles() {
	let m = loadProfilesMeta();
	if (!m || !Array.isArray(m.list) || !m.list.length) {
		const p = {
			uuid: genUuid(),
			name: 'Profil 1',
			emoji: PROFILE_EMOJIS[0],
			updatedAt: Date.now(),
		};
		m = { list: [p], active: p.uuid };
		saveProfilesMeta(m);
	}
	applyActive(m);
	return m;
}
// Marque le profil actif comme modifié (appelé par storage.ts après chaque écriture de données).
export function touchActiveProfile() {
	const m = loadProfilesMeta();
	if (!m) return;
	const p = m.list.find((x) => x.uuid === m.active);
	if (!p) return;
	p.updatedAt = Date.now();
	saveProfilesMeta(m);
}

export function listProfiles() {
	const m = loadProfilesMeta() || initProfiles();
	return m.list;
}
export function activeProfile() {
	const m = loadProfilesMeta() || initProfiles();
	return m.list.find((x) => x.uuid === m.active) || m.list[0];
}

export function setActiveProfile(uuid: string) {
	const m = loadProfilesMeta();
	if (!m || !m.list.some((x) => x.uuid === uuid)) return;
	m.active = uuid;
	saveProfilesMeta(m);
	applyActive(m);
}
export function addProfile(name: string, emoji?: string) {
	const m = loadProfilesMeta() || initProfiles();
	const used = new Set(m.list.map((p) => p.emoji));
	const e = emoji || PROFILE_EMOJIS.find((x) => !used.has(x)) || choice(PROFILE_EMOJIS);
	const p = {
		uuid: genUuid(),
		name: name || 'Profil ' + (m.list.length + 1),
		emoji: e,
		updatedAt: Date.now(),
	};
	m.list.push(p);
	m.active = p.uuid;
	saveProfilesMeta(m);
	applyActive(m);
	return p;
}
export function renameProfile(uuid: string, name: string) {
	const m = loadProfilesMeta();
	const p = m && m.list.find((x) => x.uuid === uuid);
	if (p && name) {
		p.name = name;
		p.updatedAt = Date.now();
		saveProfilesMeta(m);
	}
}
// XP totale d'un profil donné (par UUID), sans changer le profil actif. Lit la
// clé préfixée brute → permet de gérer le gating des avatars dans l'écran de
// gestion (où l'on édite un profil qui n'est pas forcément l'actif).
export function getXPFor(uuid: string): number {
	try {
		const v = localStorage.getItem(uuid + '/' + XP_KEY);
		return v == null ? 0 : JSON.parse(v);
	} catch (e) {
		return 0;
	}
}
// Un avatar est autorisé pour un profil s'il est de base (toujours dispo) ou s'il
// s'agit d'un avatar « forêt » dont le niveau requis est atteint par CE profil.
export function avatarAutorise(uuid: string, emoji: string): boolean {
	if (PROFILE_EMOJIS.includes(emoji)) return true;
	const requis = niveauRequisAvatar(emoji);
	return requis != null && niveauDepuisXP(getXPFor(uuid)) >= requis;
}
// Affecte l'avatar choisi (no-op si verrouillé : base inconnue ou forêt non
// débloquée pour ce profil — garde-fou contre un contournement via le DOM).
export function setProfileEmoji(uuid: string, emoji: string) {
	if (!avatarAutorise(uuid, emoji)) return;
	const m = loadProfilesMeta();
	const p = m && m.list.find((x) => x.uuid === uuid);
	if (!p || p.emoji === emoji) return;
	p.emoji = emoji;
	p.updatedAt = Date.now();
	saveProfilesMeta(m);
}
// Efface les données d'un profil (clés sous son préfixe), sauf la méta.
function clearProfileData(prefix: string) {
	lsKeysRaw()
		.filter((k) => k !== PROFILES_KEY && k.startsWith(prefix + 'ludaskia_'))
		.forEach(lsRemoveRaw);
}
export function resetProfile(uuid: string) {
	const m = loadProfilesMeta();
	const p = m && m.list.find((x) => x.uuid === uuid);
	if (!p) return;
	clearProfileData(profilePrefix(p));
	// L'XP repart à zéro : un avatar « forêt » gagné n'est plus débloqué → on rend
	// un avatar de base (les 12 de base relèvent de l'identité, pas d'une récompense).
	if (!PROFILE_EMOJIS.includes(p.emoji)) p.emoji = PROFILE_EMOJIS[0];
	p.updatedAt = Date.now();
	saveProfilesMeta(m);
}
export function deleteProfile(uuid: string) {
	const m = loadProfilesMeta();
	if (!m || m.list.length <= 1) return false; // on garde toujours au moins 1 profil
	const p = m.list.find((x) => x.uuid === uuid);
	if (!p) return false;
	clearProfileData(profilePrefix(p));
	m.list = m.list.filter((x) => x.uuid !== uuid);
	if (m.active === uuid) m.active = m.list[0].uuid;
	saveProfilesMeta(m);
	applyActive(m);
	return true;
}

/* ---------- Export / import par profil ---------- */
// Données d'un profil avec clés RELATIVES (préfixe retiré), pour réimport portable.
function profileDataRelative(p: Profile) {
	const P = profilePrefix(p),
		out: Record<string, string> = {};
	appKeys().forEach((k) => {
		if (k !== PROFILES_KEY && k.startsWith(P)) {
			const v = localStorage.getItem(k);
			if (v != null) out[k.slice(P.length)] = v;
		}
	});
	return out;
}
function writeProfileData(prefix: string, data: Record<string, string>) {
	Object.keys(data).forEach((rel) => lsSetRaw(prefix + rel, String(data[rel])));
}

// Exporte les profils désignés (par UUID).
export function exportProfiles(uuids: string[]) {
	const m = loadProfilesMeta();
	if (!m) return null;
	const list = m.list.filter((p) => uuids.includes(p.uuid));
	return {
		app: EXPORT_APP,
		version: 2,
		exportedAt: new Date().toISOString(),
		profiles: list.map((p) => ({
			uuid: p.uuid,
			name: p.name,
			emoji: p.emoji,
			updatedAt: p.updatedAt || 0,
			data: profileDataRelative(p),
		})),
	};
}
// Fusionne une sauvegarde : par UUID, écrase si plus récent, ajoute si inconnu.
// Renvoie {added, updated, skipped} ou null si format invalide.
export function importProfiles(payload: any) {
	if (!payload || payload.app !== EXPORT_APP || !Array.isArray(payload.profiles)) return null;
	const m = loadProfilesMeta() || initProfiles();
	let added = 0,
		updated = 0,
		skipped = 0;
	payload.profiles.forEach((ip: any) => {
		if (!ip || !ip.uuid || !ip.data) return;
		const existing = m.list.find((x) => x.uuid === ip.uuid);
		if (existing) {
			if ((ip.updatedAt || 0) > (existing.updatedAt || 0)) {
				// sauvegarde plus récente → on écrase
				clearProfileData(profilePrefix(existing));
				writeProfileData(profilePrefix(existing), ip.data);
				existing.name = ip.name || existing.name;
				existing.emoji = ip.emoji || existing.emoji;
				existing.updatedAt = ip.updatedAt || Date.now();
				updated++;
			} else skipped++; // version locale plus récente ou identique → on garde
		} else {
			// profil inconnu → ajout
			const p = {
				uuid: ip.uuid,
				name: ip.name || 'Profil',
				emoji: ip.emoji || PROFILE_EMOJIS[0],
				updatedAt: ip.updatedAt || Date.now(),
			};
			writeProfileData(profilePrefix(p), ip.data);
			m.list.push(p);
			added++;
		}
	});
	saveProfilesMeta(m);
	applyActive(m);
	return { added, updated, skipped };
}
