/* ============================================================
   Mode Orthographe — persistance et opérations sur la banque/listes.
   Tout passe par lsGet/lsSet (clé préfixée par le profil actif).
   Les opérations mutent un OrthoState en mémoire ; l'appelant
   sauvegarde via saveOrtho(). Logique pure, testable sans DOM.
   ============================================================ */
import { lsGet, lsSet } from '../storage';
import type { MotOrtho, ListeOrtho, OrthoState, MotInput } from './types';
import { etatNeuf, avancerEtat } from '../revision';

export const ORTHO_KEY = 'ludaskia_ortho';

/** Identifiant opaque (UUID si dispo, sinon repli). */
function genId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return 'o' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
	}
}

/** Clé de déduplication d'un mot : trim + NFC + minuscules. */
export function formeNormalisee(mot: string): string {
	return mot.trim().normalize('NFC').toLocaleLowerCase('fr');
}

export function emptyOrthoState(): OrthoState {
	return { banque: {}, listes: [], motIdParForme: {} };
}

export function loadOrtho(): OrthoState {
	const s = lsGet(ORTHO_KEY, null) as Partial<OrthoState> | null;
	if (!s || typeof s !== 'object') return emptyOrthoState();
	return {
		banque: s.banque ?? {},
		listes: Array.isArray(s.listes) ? s.listes : [],
		motIdParForme: s.motIdParForme ?? {},
	};
}

export function saveOrtho(state: OrthoState): void {
	lsSet(ORTHO_KEY, state);
}

/** Ajoute (ou retrouve) un mot dans la banque, dédupliqué par forme normalisée.
    Complète commeDans/homophone si fournis et absents. Renvoie le MotOrtho. */
export function addOrGetMot(
	state: OrthoState,
	input: MotInput,
	origine: 'liste' | 'predefini' = 'liste',
): MotOrtho {
	const mot = input.mot.trim().normalize('NFC');
	const forme = formeNormalisee(mot);
	const existingId = state.motIdParForme[forme];
	const existing = existingId ? state.banque[existingId] : undefined;
	if (existing) {
		// « comme dans »/homophone fournis : on applique (l'édition la plus récente gagne).
		if (input.commeDans !== undefined) existing.commeDans = input.commeDans.trim() || undefined;
		if (input.homophone !== undefined) existing.homophone = input.homophone || undefined;
		return existing;
	}
	const m: MotOrtho = {
		id: genId(),
		mot,
		commeDans: input.commeDans?.trim() || undefined,
		homophone: input.homophone || undefined,
		entourage: [],
		atelierFait: false,
		validation: { motCache: false, tuiles: false, dictee: false },
		revision: etatNeuf(Date.now()), // entre en rotation de révision dès l'ajout (#45)
		origine,
	};
	state.banque[m.id] = m;
	state.motIdParForme[forme] = m.id;
	return m;
}

/** Matérialise des mots dans la banque (dédup par forme normalisée) et renvoie
    leurs ids (dédupliqués). Sert aux listes du parent ET aux leçons prédéfinies. */
export function ajouterMots(
	state: OrthoState,
	mots: MotInput[],
	origine: 'liste' | 'predefini' = 'liste',
): string[] {
	const ids = mots
		.filter((mi) => mi.mot.trim() !== '')
		.map((mi) => addOrGetMot(state, mi, origine).id);
	return [...new Set(ids)]; // un même mot deux fois ne compte qu'une fois
}

/** Crée une liste à partir de mots saisis (dédup gérée dans la banque ET dans la liste).
    Mute l'état ; l'appelant sauvegarde via saveOrtho(). */
export function createListe(
	state: OrthoState,
	label: string,
	mots: MotInput[],
	dateControle?: string,
): ListeOrtho {
	const now = Date.now();
	const liste: ListeOrtho = {
		id: genId(),
		label,
		dateControle,
		motIds: ajouterMots(state, mots, 'liste'),
		createdAt: now,
		updatedAt: now,
	};
	state.listes.push(liste);
	return liste;
}

/** Met à jour une liste existante (label, date, mots). Reconstruit motIds depuis
    les mots fournis (dédup) ; renvoie la liste, ou null si introuvable. */
export function updateListe(
	state: OrthoState,
	id: string,
	label: string,
	mots: MotInput[],
	dateControle?: string,
): ListeOrtho | null {
	const liste = state.listes.find((l) => l.id === id);
	if (!liste) return null;
	liste.label = label;
	liste.dateControle = dateControle;
	liste.motIds = ajouterMots(state, mots, 'liste');
	liste.updatedAt = Date.now();
	return liste;
}

export function getListe(state: OrthoState, id: string): ListeOrtho | undefined {
	return state.listes.find((l) => l.id === id);
}

export function getMot(state: OrthoState, id: string): MotOrtho | undefined {
	return state.banque[id];
}

/** Mots d'une liste, dans l'ordre, en ignorant les références orphelines. */
export function motsDeListe(state: OrthoState, liste: ListeOrtho): MotOrtho[] {
	return liste.motIds.map((id) => state.banque[id]).filter((m): m is MotOrtho => !!m);
}

/** Met à jour l'état de révision espacée d'un mot après une réponse (#45). */
export function avancerMotRevision(
	state: OrthoState,
	motId: string,
	reussi: boolean,
	now: number,
): void {
	const m = state.banque[motId];
	if (m) m.revision = avancerEtat(m.revision, reussi, now);
}

/** Supprime une liste. Les mots restent dans la banque (corpus de l'année). */
export function deleteListe(state: OrthoState, id: string): boolean {
	const before = state.listes.length;
	state.listes = state.listes.filter((l) => l.id !== id);
	return state.listes.length < before;
}
