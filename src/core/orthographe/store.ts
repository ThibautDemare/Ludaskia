/* ============================================================
   Mode Orthographe — persistance et opérations sur la banque/listes.
   Tout passe par lsGet/lsSet (clé préfixée par le profil actif).
   Les opérations mutent un OrthoState en mémoire ; l'appelant
   sauvegarde via saveOrtho(). Logique pure, testable sans DOM.
   ============================================================ */
import { lsGet, lsSet, lsGetRaw } from '../storage';
import type {
	MotOrtho,
	ListeOrtho,
	OrthoState,
	MotInput,
	FormesAccord,
	VerbeConfig,
} from './types';
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

/** Normalise des formes fléchies (trim + NFC) ; renvoie undefined si toutes vides
    (un mot « neutre », non éligible aux exercices d'accord). #109 */
export function normaliserFormes(formes?: FormesAccord): FormesAccord | undefined {
	if (!formes) return undefined;
	const clean = (s?: string) => {
		const v = s?.trim().normalize('NFC');
		return v ? v : undefined;
	};
	const out: FormesAccord = {
		mascSing: clean(formes.mascSing),
		femSing: clean(formes.femSing),
		mascPlur: clean(formes.mascPlur),
		femPlur: clean(formes.femPlur),
	};
	return out.mascSing || out.femSing || out.mascPlur || out.femPlur ? out : undefined;
}

/** Normalise les verbes paramétrés d'une liste (#261) : infinitif trim+NFC,
    dédup et bornage des pronoms (0..5) et des temps, complément trim→undefined.
    Écarte les entrées incomplètes (sans infinitif, sans pronom ou sans temps). */
export function normaliserVerbes(verbes?: VerbeConfig[]): VerbeConfig[] {
	if (!Array.isArray(verbes)) return [];
	const out: VerbeConfig[] = [];
	for (const v of verbes) {
		const infinitif = (v?.infinitif ?? '').trim().normalize('NFC');
		const pronoms = [
			...new Set((v?.pronoms ?? []).filter((p) => Number.isInteger(p) && p >= 0 && p <= 5)),
		].sort((a, b) => a - b);
		const temps = [...new Set(v?.temps ?? [])];
		const complement = v?.complement?.trim() || undefined;
		if (!infinitif || pronoms.length === 0 || temps.length === 0) continue;
		out.push({ kind: 'verbe', infinitif, pronoms, temps, complement });
	}
	return out;
}

/** Normalise un état brut lu en localStorage (tolère absent/corrompu). Partagé par
    loadOrtho (profil actif) et loadOrthoFor (profil arbitraire, espace encadrant). */
function parseOrtho(s: Partial<OrthoState> | null): OrthoState {
	if (!s || typeof s !== 'object') return emptyOrthoState();
	return {
		banque: s.banque ?? {},
		listes: (Array.isArray(s.listes) ? s.listes : []).map((l) => ({
			...l,
			verbes: l.verbes ? normaliserVerbes(l.verbes) : undefined,
		})),
		motIdParForme: s.motIdParForme ?? {},
	};
}

export function loadOrtho(): OrthoState {
	return parseOrtho(lsGet(ORTHO_KEY, null) as Partial<OrthoState> | null);
}

/** État orthographe d'un profil DONNÉ par UUID (clé BRUTE `uuid/…`), sans changer le
    profil actif — même parti pris que le reste de l'espace encadrant (encadrant-stats). */
export function loadOrthoFor(uuid: string): OrthoState {
	return parseOrtho(lsGetRaw(uuid + '/' + ORTHO_KEY, null) as Partial<OrthoState> | null);
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
		// « comme dans »/homophone/formes fournis : on applique (l'édition la plus récente gagne).
		if (input.commeDans !== undefined) existing.commeDans = input.commeDans.trim() || undefined;
		if (input.homophone !== undefined) existing.homophone = input.homophone || undefined;
		if (input.formes !== undefined) existing.formes = normaliserFormes(input.formes);
		return existing;
	}
	const m: MotOrtho = {
		id: genId(),
		mot,
		commeDans: input.commeDans?.trim() || undefined,
		homophone: input.homophone || undefined,
		formes: normaliserFormes(input.formes),
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
	verbes: VerbeConfig[] = [],
): ListeOrtho {
	const now = Date.now();
	const v = normaliserVerbes(verbes);
	const liste: ListeOrtho = {
		id: genId(),
		label,
		dateControle,
		motIds: ajouterMots(state, mots, 'liste'),
		verbes: v.length ? v : undefined,
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
	verbes: VerbeConfig[] = [],
): ListeOrtho | null {
	const liste = state.listes.find((l) => l.id === id);
	if (!liste) return null;
	liste.label = label;
	liste.dateControle = dateControle;
	liste.motIds = ajouterMots(state, mots, 'liste');
	const v = normaliserVerbes(verbes);
	liste.verbes = v.length ? v : undefined;
	liste.updatedAt = Date.now();
	return liste;
}

export function getListe(state: OrthoState, id: string): ListeOrtho | undefined {
	return state.listes.find((l) => l.id === id);
}

/** Mots d'une liste, dans l'ordre, en ignorant les références orphelines. */
export function motsDeListe(state: OrthoState, liste: ListeOrtho): MotOrtho[] {
	return liste.motIds.map((id) => state.banque[id]).filter((m): m is MotOrtho => !!m);
}

/** Reprise : les mots déjà en banque mais sans état de révision (ajoutés avant
    l'arrivée du mode Révision) entrent en rotation. `now` doit être daté de J-1
    par l'appelant → 1er re-test échu dès aujourd'hui, donc dus immédiatement.
    Idempotent : ne touche que les mots dépourvus de `.revision`. Renvoie `true`
    si la banque a changé (à l'appelant de sauvegarder). */
export function backfillMotRevisions(state: OrthoState, now: number): boolean {
	let changed = false;
	for (const id in state.banque) {
		const m = state.banque[id];
		if (!m.revision) {
			m.revision = etatNeuf(now);
			changed = true;
		}
	}
	return changed;
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
