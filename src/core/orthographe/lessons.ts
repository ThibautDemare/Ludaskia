/* ============================================================
   Mode Orthographe — vue unifiée des « leçons » d'orthographe.
   Une leçon est soit une leçon PRÉDÉFINIE (statique, ORTHO_PREDEF),
   soit une LISTE du profil (dynamique). Cet accessor donne au
   catalogue/à l'UI une liste homogène, et résout les mots d'une
   leçon (en matérialisant les prédéfinis dans la banque à la volée).
   ============================================================ */
import { ORTHO_PREDEF } from '../../data/francais/orthographe';
import { ajouterMots, getListe, motsDeListe } from './store';
import { nbCiblesVerbes } from './verbes';
import type { MotOrtho, OrthoState } from './types';
import type { SchoolLevel } from '../catalog';
import { LEVEL_ORDER } from '../levels';

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

/** Liste unifiée des leçons d'orthographe : prédéfinies puis listes du profil.
    Filtrage CUMULATIF par niveau (#243) : si `niveau` est fourni, on ne garde
    que les leçons PRÉDÉFINIES dont le niveau est <= niveau actif (ordre canonique
    de core/levels.ts). Ainsi un profil CM1 voit les listes CE2 ET CM1 (révision
    spiralaire), un profil CE2 ne voit que les listes CE2. Sans paramètre (lookups
    par id), aucun filtrage : toutes les prédéfinies sont visibles (robustesse).
    Les listes du profil (source 'liste', non taguées) restent TOUJOURS visibles. */
export function listOrthoLecons(state: OrthoState, niveau?: SchoolLevel): LeconOrthoRef[] {
	const rangActif = niveau === undefined ? Infinity : LEVEL_ORDER.indexOf(niveau);
	const predef: LeconOrthoRef[] = ORTHO_PREDEF.filter(
		(l) => LEVEL_ORDER.indexOf(l.niveau) <= rangActif,
	).map((l) => ({
		id: l.id,
		label: l.label,
		source: 'predefini',
		nbMots: l.mots.length,
		mots: l.mots.map((mi) => mi.mot),
	}));
	const listes: LeconOrthoRef[] = state.listes.map((l) => ({
		id: l.id,
		label: l.label,
		// Un verbe compte pour ses couples (pronoms × temps) réellement dictés (#261).
		nbMots: l.motIds.length + nbCiblesVerbes(l.verbes),
		source: 'liste',
		mots: [...motsDeListe(state, l).map((m) => m.mot), ...(l.verbes ?? []).map((v) => v.infinitif)],
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
