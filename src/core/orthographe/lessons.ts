/* ============================================================
   Mode Orthographe — vue unifiée des « leçons » d'orthographe.
   Une leçon est soit une leçon PRÉDÉFINIE (statique, ORTHO_PREDEF),
   soit une LISTE du profil (dynamique). Cet accessor donne au
   catalogue/à l'UI une liste homogène, et résout les mots d'une
   leçon (en matérialisant les prédéfinis dans la banque à la volée).
   ============================================================ */
import { ORTHO_PREDEF } from '../../data/francais/orthographe';
import { ajouterMots, getListe, motsDeListe, listeContenantMot, formeNormalisee } from './store';
import { nbCiblesVerbes, listeDeCibleVerbe } from './verbes';
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

/** Libellé lisible d'une leçon d'orthographe par id, SANS charger l'état complet :
    d'abord les listes du profil consulté (`listes`, {id,label} suffisent — lues brutes
    par UUID côté encadrant), sinon une leçon prédéfinie (statique). null si inconnu.
    Sert au journal d'erreurs (#391) : les listes d'ortho ne sont pas des `LessonDef`
    du catalogue, `getLessonById` ne les résout donc pas. Pur. */
export function labelLeconOrtho(
	id: string,
	listes: readonly { id: string; label: string }[] = [],
): string | null {
	const custom = listes.find((l) => l && l.id === id);
	if (custom) return custom.label;
	const predef = ORTHO_PREDEF.find((l) => l.id === id);
	return predef ? predef.label : null;
}

/** Groupe d'erreurs affichable pour un MOT d'orthographe (#391) : l'id sous lequel ranger une
    erreur commise sur ce mot en révision espacée. Un mot n'est pas une leçon du catalogue, et la
    révision travaille des mots (pas des leçons) alors que le journal regroupe par leçon/liste.
    On cherche donc, dans l'ordre :
      1. une LISTE du parent qui référence ce mot (`motIds`) ;
      2. une leçon PRÉDÉFINIE qui le contient — via le même index de dédup par forme que
         `progression.ts`, les prédéfinis étant matérialisés en banque sans lien retour ;
      3. la liste propriétaire d'une CIBLE VERBE (matérialisée hors `motIds`).
    `null` seulement si rien ne rattache le mot : l'appelant n'a alors aucun groupe où le ranger.
    Les trois formes d'id sont résolues en libellé par `labelLeconOrtho`. Pur.

    Deux arbitrages ASSUMÉS, faute de provenance : la révision travaille un mot, pas la leçon par
    laquelle il est entré, et rien n'est mémorisé de ce passage.
      - Une forme partagée par plusieurs leçons prédéfinies (une quarantaine, ex. « après » ∈
        mots invariables ET thème de la mer) est rangée sous la PREMIÈRE déclarée : l'encadrant
        peut donc lire l'erreur sous une leçon que l'enfant n'a jamais ouverte. Le mot et l'erreur
        restent justes — seul le libellé du groupe peut surprendre.
      - Un mot dont le groupe a DISPARU (liste supprimée, mot ou verbe retiré d'une liste) reste
        en rotation de révision mais n'a plus de groupe : son erreur n'est pas journalisée. Il
        faudrait un groupe « mots de l'année » pour la récupérer (décision produit). */
export function groupeOrthoDuMot(state: OrthoState, wordId: string): string | null {
	const liste = listeContenantMot(state, wordId);
	if (liste) return liste;
	const predef = ORTHO_PREDEF.find((l) =>
		l.mots.some((mi) => state.motIdParForme[formeNormalisee(mi.mot)] === wordId),
	);
	if (predef) return predef.id;
	return listeDeCibleVerbe(state, wordId);
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
