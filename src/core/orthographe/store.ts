/* ============================================================
   Mode Orthographe — persistance et opérations sur la banque/listes.
   Tout passe par lsGet/lsSet (clé préfixée par le profil actif).
   Les opérations mutent un OrthoState en mémoire ; l'appelant
   sauvegarde via saveOrtho(). Logique pure, testable sans DOM.
   ============================================================ */
import { lsGet, lsSet, lsGetRaw, lsSetRaw } from '../storage';
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

/** Écrit l'état orthographe d'un profil DONNÉ par UUID (clé BRUTE), pendant en écriture de
    `loadOrthoFor` — l'espace encadrant agit sur le profil CONSULTÉ, qui n'est pas forcément
    l'actif (#496). SILENCIEUSE par nature, comme `saveRevoirFor` (encadrant-stats) : contourner
    le préfixe actif contourne aussi le hook `onDataWrite`, donc c'est à l'APPELANT de marquer le
    profil modifié (`touchProfile`) quand l'écriture traduit un geste VOULU de l'adulte. */
export function saveOrthoFor(uuid: string, state: OrthoState): void {
	lsSetRaw(uuid + '/' + ORTHO_KEY, JSON.stringify(state));
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

/** Id d'une liste du profil CONTENANT ce mot, `null` si aucune (#391).
 *
 *  Sert à rattacher une erreur de mot à un groupe affichable dans l'espace encadrant : la
 *  révision espacée travaille des mots (pas des listes), or le journal d'erreurs regroupe par
 *  leçon / liste. On réutilise ainsi l'id de liste du journal de la dictée, donc les erreurs
 *  des deux parcours se regroupent sous le même libellé.
 *
 *  Un mot peut appartenir à PLUSIEURS listes (les listes référencent des ids de mots, et un mot
 *  partage tout son historique entre elles) : on retient la PREMIÈRE de `state.listes`, faute de
 *  critère meilleur — le mot est le même partout, seul le libellé du groupe change. Renvoie
 *  `null` pour un mot rattaché à aucune liste (mot d'une leçon prédéfinie, cible de verbe
 *  conjugué) : il n'y a alors aucun groupe où le ranger, et l'appelant n'a rien à journaliser. */
export function listeContenantMot(state: OrthoState, wordId: string): string | null {
	return state.listes.find((l) => l.motIds.includes(wordId))?.id ?? null;
}

/** TOUTES les listes du profil référençant ce mot, dans l'ordre de `state.listes` (#496).
 *
 *  Distinct de `listeContenantMot`, qui n'en renvoie qu'UNE (le journal d'erreurs n'a besoin que
 *  d'un groupe où ranger l'erreur). Ici on montre à l'adulte OÙ vit un mot, et on l'avertit avant
 *  suppression : les listes qu'on ne nommerait pas seraient amputées sans qu'il le sache. Tableau
 *  vide = mot ORPHELIN (plus référencé nulle part) — l'état qui motive cette vue. Pur. */
export function listesContenantMot(state: OrthoState, wordId: string): ListeOrtho[] {
	return state.listes.filter((l) => l.motIds.includes(wordId));
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

/** Supprime DÉFINITIVEMENT un mot de la banque du profil (#496) : l'entrée elle-même, son
    index de dédup par forme, et sa référence dans les `motIds` de toute liste qui le
    référence encore. Renvoie `true` si un mot a bien été retiré.

    Toute la surface de nettoyage tient ici : rien d'autre en localStorage ne référence un id
    de mot (la file « à revoir » épingle des LISTES et des leçons, pas des mots, cf.
    `orthoRevoirId`). L'index est balayé par VALEUR, pas reconstruit depuis `mot.mot` : un état
    importé peut porter une entrée d'index périmée pointant sur cet id, qui ressusciterait le
    mot au prochain `addOrGetMot` (dédup sur un id absent de la banque). Mute l'état ;
    l'appelant sauvegarde. Pur (hors mutation de l'argument). */
export function supprimerMot(state: OrthoState, wordId: string): boolean {
	if (!state.banque[wordId]) return false;
	delete state.banque[wordId];
	for (const forme in state.motIdParForme) {
		if (state.motIdParForme[forme] === wordId) delete state.motIdParForme[forme];
	}
	for (const l of state.listes) {
		if (l.motIds.includes(wordId)) l.motIds = l.motIds.filter((id) => id !== wordId);
	}
	return true;
}
