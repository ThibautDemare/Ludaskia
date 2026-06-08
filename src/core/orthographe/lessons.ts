/* ============================================================
   Mode Orthographe — vue unifiée des « leçons » d'orthographe.
   Une leçon est soit une leçon PRÉDÉFINIE (statique, ORTHO_PREDEF),
   soit une LISTE du profil (dynamique). Cet accessor donne au
   catalogue/à l'UI une liste homogène, et résout les mots d'une
   leçon (en matérialisant les prédéfinis dans la banque à la volée).
   ============================================================ */
import { ORTHO_PREDEF } from '../../data/francais/orthographe';
import { ajouterMots, getListe, motsDeListe } from './store';
import type { MotOrtho, OrthoState } from './types';

export type SourceLecon = 'predefini' | 'liste';

export interface LeconOrthoRef {
  id: string;
  label: string;
  source: SourceLecon;
  nbMots: number;
  mots: string[]; // aperçu des mots (pour la prévisualisation)
  dateControle?: string; // listes du parent : pour le tri par échéance
  createdAt?: number;
}

/** Liste unifiée des leçons d'orthographe : prédéfinies puis listes du profil. */
export function listOrthoLecons(state: OrthoState): LeconOrthoRef[] {
  const predef: LeconOrthoRef[] = ORTHO_PREDEF.map((l) => ({
    id: l.id,
    label: l.label,
    source: 'predefini',
    nbMots: l.mots.length,
    mots: l.mots.map((mi) => mi.mot),
  }));
  const listes: LeconOrthoRef[] = state.listes.map((l) => ({
    id: l.id,
    label: l.label,
    source: 'liste',
    nbMots: l.motIds.length,
    mots: motsDeListe(state, l).map((m) => m.mot),
    dateControle: l.dateControle,
    createdAt: l.createdAt,
  }));
  return [...predef, ...listes];
}

/** Résout les mots d'une leçon (liste du profil OU leçon prédéfinie).
    Une leçon prédéfinie est matérialisée dans la banque au passage
    (l'appelant doit sauvegarder ensuite). Renvoie [] si l'id est inconnu. */
export function motsDeLecon(state: OrthoState, id: string): MotOrtho[] {
  const liste = getListe(state, id);
  if (liste) return motsDeListe(state, liste);
  const predef = ORTHO_PREDEF.find((l) => l.id === id);
  if (predef) {
    const ids = ajouterMots(state, predef.mots, 'predefini');
    return ids.map((mid) => state.banque[mid]).filter((m): m is MotOrtho => !!m);
  }
  return [];
}
