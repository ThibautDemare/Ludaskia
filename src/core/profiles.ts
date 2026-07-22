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
	lsGetRaw,
	lsGetItemRaw,
	lsKeysRaw,
	lsRemoveRaw,
	lsSetRaw,
	appKeys,
	setActivePrefix,
} from './storage';
import { XP_KEY, niveauDepuisXP, migrateNiveauNamespacing } from './progress';
import { niveauRequisAvatar } from './unlocks';
import { migrateRevisions } from './revision-migrate';
import { REVISION_PLAFOND, REVISION_PLAFOND_MIN, REVISION_PLAFOND_MAX } from './revision';
import type { SchoolLevel } from './catalog';

/* Réglages d'accessibilité par profil (#42). Vivent dans la MÉTA de profil (pas
   dans les clés de données) : un aménagement doit survivre à « Réinitialiser »,
   qui n'efface que les données de progression. */
export interface ProfilePrefs {
	/** Confort de lecture : espacement + taille augmentés (police Nunito gardée). */
	confortLecture?: boolean;
	/** Lire la consigne à voix haute automatiquement à l'arrivée sur l'exercice. */
	lectureConsigneAuto?: boolean;
	/** Sprint sans pression temporelle (#223) : le minuteur ET le score live sont
	 *  masqués pendant la partie (anxiogènes pour les profils dys/TDAH), le temps
	 *  continue d'être mesuré en coulisse, et la dernière question entamée se termine
	 *  avant la finalisation (pas de coupure sèche). Score révélé au bilan. */
	sansPressionTemporelle?: boolean;
	/** Désactive les apparitions surprises ambiantes (easter eggs « qui passent »,
	 *  ex. la luciole, #331). Aménagement posé par l'adulte pour un enfant qu'un
	 *  mouvement inattendu déconcentre (TDAH) ou déstabilise (besoin de
	 *  prévisibilité). N'affecte PAS les eggs d'exploration, déclenchés
	 *  volontairement par l'enfant. Défaut (absent) = apparitions actives. */
	sansApparitionsSurprises?: boolean;
	/** Nombre d'éléments proposés par session de Révision (#439). Réglé par l'adulte
	 *  dans l'espace encadrant pour adapter la charge d'une séance (attention,
	 *  rattrapage). Absent = valeur par défaut REVISION_PLAFOND (12). Le fallback ET
	 *  le bornage se font à la lecture (`getRevisionPlafond`), pas à l'écriture, pour
	 *  rester robuste aux données importées. */
	revisionPlafond?: number;
}
export interface Profile {
	uuid: string;
	name: string;
	emoji: string;
	updatedAt: number;
	prefs?: ProfilePrefs;
	// Niveau scolaire de référence (#225) : la « classe » du profil, défaut de
	// toutes les matières. Vit dans la MÉTA (survit à « Réinitialiser », comme
	// prefs) ; réglage de CONTENU, distinct du niveau d'XP. Indéfini tant que
	// l'enfant n'a pas choisi sa classe (popup d'onboarding).
	niveauReference?: SchoolLevel;
	// Ajustement optionnel du niveau PAR MATIÈRE (#225, lot 4) : cible les profils
	// en dents de scie (fort en maths, plus fragile en français…). Le niveau
	// effectif d'une matière = niveauParMatiere[subject] ?? niveauReference. Réservé
	// à l'espace « Réglages parent ». Une matière absente hérite de la référence.
	niveauParMatiere?: Record<string, SchoolLevel>;
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
	// Le préfixe vient de basculer. (1) Namespacing de la progression par niveau
	// (#225) : renomme l'existant legacy en `@ce2` AVANT (2) le rattrapage vers la
	// révision espacée (qui écrit, lui, des clés namespacées). Les deux sont
	// idempotents → sans effet une fois faits.
	migrateNiveauNamespacing();
	migrateRevisions(Date.now());
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
// clé préfixée brute via lsGetRaw (#351 : plus d'accès localStorage direct) →
// permet de gérer le gating des avatars dans l'écran de gestion (où l'on édite un
// profil qui n'est pas forcément l'actif).
export function getXPFor(uuid: string): number {
	return lsGetRaw(uuid + '/' + XP_KEY, 0);
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
/* ---------- Préférences d'accessibilité du profil actif (#42) ---------- */
// Lues/écrites dans la méta (survivent à « Réinitialiser »). Toute écriture bumpe
// updatedAt (comme renameProfile) pour que l'export/fusion par récence les emporte.
export function getPrefs(): ProfilePrefs {
	return activeProfile()?.prefs ?? {};
}
export function setPref<K extends keyof ProfilePrefs>(key: K, value: ProfilePrefs[K]) {
	// Le profil actif est un cas particulier du réglage par UUID (#374 : on délègue
	// pour ne pas dupliquer la logique de recherche/écriture/bump).
	const active = loadProfilesMeta()?.active;
	if (active) setPrefFor(active, key, value);
}
/* Variante PAR UUID (#234, espace encadrant) : règle une préférence d'un profil
   CONSULTÉ (pas forcément l'actif) sans toucher m.active. Sert aux « aménagements »
   posés par l'adulte (masquer le minuteur, lecture auto). L'application au DOM
   (applyPreferences) ne concerne que le profil actif → l'appelant ne la déclenche
   que si le profil ciblé est l'actif. */
export function setPrefFor<K extends keyof ProfilePrefs>(
	uuid: string,
	key: K,
	value: ProfilePrefs[K],
) {
	const m = loadProfilesMeta();
	const p = m && m.list.find((x) => x.uuid === uuid);
	if (!p) return;
	p.prefs = { ...p.prefs, [key]: value };
	p.updatedAt = Date.now();
	saveProfilesMeta(m);
}
/* Bump l'`updatedAt` d'un profil DONNÉ par UUID, sans passer par une écriture de
   clé de données. Réservé aux écritures « par UUID » qui contournent le préfixe actif
   (donc le hook onDataWrite) mais doivent quand même marquer le profil comme modifié
   pour la fusion par récence de l'export/import — p. ex. composer/copier une séance
   pour un profil consulté dans l'espace encadrant (#440). No-op si l'UUID est inconnu. */
export function touchProfile(uuid: string) {
	const m = loadProfilesMeta();
	const p = m && m.list.find((x) => x.uuid === uuid);
	if (!p) return;
	p.updatedAt = Date.now();
	saveProfilesMeta(m);
}
export function confortLecture(): boolean {
	return getPrefs().confortLecture === true;
}
export function lectureConsigneAuto(): boolean {
	return getPrefs().lectureConsigneAuto === true;
}
export function sansPressionTemporelle(): boolean {
	return getPrefs().sansPressionTemporelle === true;
}
// Apparitions surprises ambiantes actives ? Vrai par défaut (l'aménagement ne
// fait que les DÉSACTIVER) — cf. #331.
export function apparitionsSurprises(): boolean {
	return getPrefs().sansApparitionsSurprises !== true;
}
// Nombre d'éléments d'une session de Révision pour le profil actif (#439). Le fallback
// et le bornage se font ICI, à la lecture : un profil sans réglage explicite (ou une
// valeur importée hors plage / non numérique) retombe sur REVISION_PLAFOND (12), et
// toute valeur valide est ramenée dans [MIN, MAX]. L'écriture (espace encadrant) ne
// contrôle donc rien — la lecture est l'unique source de vérité, robuste aux imports.
export function getRevisionPlafond(): number {
	const v = getPrefs().revisionPlafond;
	if (typeof v !== 'number' || !Number.isFinite(v)) return REVISION_PLAFOND;
	return Math.min(REVISION_PLAFOND_MAX, Math.max(REVISION_PLAFOND_MIN, Math.round(v)));
}

/* ---------- Niveau scolaire de référence du profil actif (#225) ---------- */
// Lu/écrit dans la méta (survit à « Réinitialiser »). L'écriture bumpe updatedAt
// pour que l'export/fusion par récence l'emporte. Indéfini = classe pas encore
// choisie (déclenche la popup d'onboarding).
export function getNiveauReference(): SchoolLevel | undefined {
	return activeProfile()?.niveauReference;
}
export function setNiveauReference(level: SchoolLevel) {
	// Cas particulier « profil actif » du réglage par UUID (#374 : délégué).
	const active = loadProfilesMeta()?.active;
	if (active) setNiveauReferenceFor(active, level);
}
// Ajustement du niveau par matière (#225, lot 4). `undefined` retire l'ajustement
// (la matière hérite de nouveau du niveau de référence).
export function getNiveauParMatiere(): Record<string, SchoolLevel> {
	return activeProfile()?.niveauParMatiere ?? {};
}
export function setNiveauMatiere(subject: string, level: SchoolLevel | undefined) {
	// Cas particulier « profil actif » du réglage par UUID (#374 : délégué).
	const active = loadProfilesMeta()?.active;
	if (active) setNiveauMatiereFor(active, subject, level);
}

/* ---------- Réglages de niveau PAR UUID (#234, espace encadrant) ----------
   L'encadrant règle la classe d'un profil CONSULTÉ qui n'est pas forcément l'actif :
   on cible le profil par UUID et on NE touche JAMAIS m.active (pas de bascule de
   l'enfant courant). On bumpe updatedAt du profil ciblé (fusion par récence). */
export function setNiveauReferenceFor(uuid: string, level: SchoolLevel) {
	const m = loadProfilesMeta();
	const p = m && m.list.find((x) => x.uuid === uuid);
	if (!p) return;
	p.niveauReference = level;
	p.updatedAt = Date.now();
	saveProfilesMeta(m);
}
export function setNiveauMatiereFor(uuid: string, subject: string, level: SchoolLevel | undefined) {
	const m = loadProfilesMeta();
	const p = m && m.list.find((x) => x.uuid === uuid);
	if (!p) return;
	const map = { ...(p.niveauParMatiere ?? {}) };
	if (level) map[subject] = level;
	else delete map[subject];
	p.niveauParMatiere = map;
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
			const v = lsGetItemRaw(k);
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
			prefs: p.prefs, // réglages d'accessibilité (#42)
			niveauReference: p.niveauReference, // niveau scolaire de référence (#225)
			niveauParMatiere: p.niveauParMatiere, // ajustement par matière (#225, lot 4)
			data: profileDataRelative(p),
		})),
	};
}
// Objet quelconque (garde de type minimale pour valider un payload importé
// venu de l'extérieur : fichier choisi par l'utilisateur, format non garanti).
function estObjet(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}
// Un profil d'export après validation de sa forme minimale (uuid + data présents).
// Les valeurs de `data` sont recopiées via String() par writeProfileData, et les
// autres champs sont protégés par les fallbacks `|| …` ci-dessous → assertion sûre.
interface ImportedProfile {
	uuid: string;
	data: Record<string, string>;
	name?: string;
	emoji?: string;
	updatedAt?: number;
	prefs?: ProfilePrefs;
	niveauReference?: SchoolLevel;
	niveauParMatiere?: Record<string, SchoolLevel>;
}
function estProfilImporte(v: unknown): v is ImportedProfile {
	return estObjet(v) && typeof v.uuid === 'string' && estObjet(v.data);
}
// Fusionne une sauvegarde : par UUID, écrase si plus récent, ajoute si inconnu.
// Renvoie {added, updated, skipped} ou null si format invalide.
export function importProfiles(payload: unknown) {
	if (!estObjet(payload) || payload.app !== EXPORT_APP || !Array.isArray(payload.profiles))
		return null;
	const m = loadProfilesMeta() || initProfiles();
	let added = 0,
		updated = 0,
		skipped = 0;
	payload.profiles.forEach((ip: unknown) => {
		if (!estProfilImporte(ip)) return;
		const existing = m.list.find((x) => x.uuid === ip.uuid);
		if (existing) {
			if ((ip.updatedAt || 0) > (existing.updatedAt || 0)) {
				// sauvegarde plus récente → on écrase
				clearProfileData(profilePrefix(existing));
				writeProfileData(profilePrefix(existing), ip.data);
				existing.name = ip.name || existing.name;
				existing.emoji = ip.emoji || existing.emoji;
				if (ip.prefs) existing.prefs = ip.prefs; // réglages d'accessibilité (#42)
				if (ip.niveauReference) existing.niveauReference = ip.niveauReference; // niveau (#225)
				if (ip.niveauParMatiere) existing.niveauParMatiere = ip.niveauParMatiere; // niveau/matière
				existing.updatedAt = ip.updatedAt || Date.now();
				updated++;
			} else skipped++; // version locale plus récente ou identique → on garde
		} else {
			// profil inconnu → ajout
			const p: Profile = {
				uuid: ip.uuid,
				name: ip.name || 'Profil',
				emoji: ip.emoji || PROFILE_EMOJIS[0],
				updatedAt: ip.updatedAt || Date.now(),
				prefs: ip.prefs || undefined, // réglages d'accessibilité (#42)
				niveauReference: ip.niveauReference || undefined, // niveau scolaire (#225)
				niveauParMatiere: ip.niveauParMatiere || undefined, // ajustement par matière (#225)
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
