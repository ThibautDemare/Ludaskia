/* ============================================================
   Mode Orthographe — persistance et opérations sur la banque/listes.
   Tout passe par lsGet/lsSet (clé préfixée par le profil actif).
   Les opérations mutent un OrthoState en mémoire ; l'appelant
   sauvegarde via saveOrtho(). Logique pure, testable sans DOM.
   ============================================================ */
import { lsGet, lsSet } from '../storage';
import type { MotOrtho, ListeOrtho, OrthoState, MotInput, EtatRevision } from './types';

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

function etatRevisionNeuf(): EtatRevision {
  return { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null };
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
    if (input.commeDans && !existing.commeDans) existing.commeDans = input.commeDans;
    if (input.homophone && !existing.homophone) existing.homophone = true;
    return existing;
  }
  const m: MotOrtho = {
    id: genId(),
    mot,
    commeDans: input.commeDans,
    homophone: input.homophone,
    entourage: [],
    atelierFait: false,
    validation: { motCache: false, tuiles: false, dictee: false },
    revision: etatRevisionNeuf(),
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

/** Supprime une liste. Les mots restent dans la banque (corpus de l'année). */
export function deleteListe(state: OrthoState, id: string): boolean {
  const before = state.listes.length;
  state.listes = state.listes.filter((l) => l.id !== id);
  return state.listes.length < before;
}
