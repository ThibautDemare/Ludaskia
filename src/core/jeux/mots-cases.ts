/* ============================================================
   Mots casés (#664) — le JEU : vivier, remplissage, tirage d'une partie.

   Ce module assemble deux briques indépendantes : le moteur générique
   (`grille-mots.ts`, qui ne connaît que la géométrie) et les motifs
   (`../../data/jeux/motifs-mots-cases.ts`, qui ne sont que du dessin). Ce qui
   lui appartient en propre, c'est le FRANÇAIS : d'où viennent les mots, et
   comment on en trouve un jeu qui tienne dans le dessin.

   ── D'où viennent les mots, et la seule chose qu'on écarte ──────────────────

   Les deux banques déjà relues du dépôt : les séries thématiques d'orthographe
   et les champs lexicaux. Seule exclusion, et elle est de FORME : une case porte
   une lettre, pas un espace, pas une apostrophe, pas un trait d'union.

   Surtout PAS le vivier du Motus, qui serait le raccourci évident et qui donne
   un vivier deux fois trop petit : il écarte les homophones, les séries
   irrégulières et tout ce qui ne fait pas 5 ou 6 lettres. Sa raison — un retour
   lettre à lettre n'est pas informatif sur un mot dont la graphie ne se déduit
   pas — ne vaut pas ici : le mot est DONNÉ en entier, l'enfant ne l'orthographie
   jamais. Un mot difficile à écrire est même un bon candidat, puisque
   l'exposition à sa forme correcte est gratuite.

   Le vivier ignore la classe du profil (jeu de type refuge, critère 40) : les
   séries portent chacune leur classe, et filtrer dessus serait à un caractère
   près — mais un CE2 et un CM1 doivent voir exactement le même jeu.

   ── Le remplissage : l'algorithme est au MOTEUR, la mesure est ici ──────────

   Chercher un jeu de mots qui tient dans un dessin ne demande aucune
   connaissance du français : c'est `remplirMotif` et `choisirRemplissage`
   (`grille-mots.ts`), qui prennent la liste de mots en PARAMÈTRE. Ce module ne
   fait que leur passer SON vivier — très exactement ce que #665 refera avec le
   sien, sans redupliquer un algorithme réglé à la main.

   Ce qui reste ici, parce que cela dépend du vivier autant que des motifs
   livrés, c'est la MESURE, faite avant d'écrire :

   • **l'ordre** (le plus contraint d'abord) suffit à lui seul : sur les sept
     motifs livrés, 200 remplissages sur 200 réussissent, sans une seule reprise
     coûteuse ;
   • **le budget** ne sert jamais sur ces motifs-là ; il existe pour que l'ajout
     d'un motif trop dense se solde par « on essaie un autre dessin » et jamais
     par un onglet figé. Le carré de mots 5×5 (6 mots pour 9 croisements) est le
     cas mesuré : 0 remplissage sur 200. Ce n'est pas le vivier qui limite,
     c'est la DENSITÉ.

   Tout est pur : l'aléa est injecté, donc un remplissage se rejoue à l'identique
   et un invariant qui casse une fois sur mille se reproduit.
   ============================================================ */
import { CHAMPS } from '../../data/francais/champs-lexicaux';
import { ORTHO_PREDEF } from '../../data/francais/orthographe';
import {
	MOTIFS_MOTS_CASES,
	type MotifMotsCases,
	type TailleMotsCases,
} from '../../data/jeux/motifs-mots-cases';
import {
	choisirRemplissage,
	grilleNeuve,
	melanger,
	remplirMotif,
	type Grille,
	type Motif,
} from './grille-mots';

/** Une partie servie : le dessin, la liste COMPLÈTE de ses mots (mélangée), et
    la grille où l'enfant les pose. Volontairement SANS la solution : l'exposer
    donnerait à l'écran un indice tout prêt, que le hors-périmètre refuse. */
export interface PartieMotsCases {
	motif: MotifMotsCases;
	mots: string[];
	grille: Grille;
}

/** Les séries d'orthographe retenues : les thématiques, et elles seules. */
const PREFIXE_THEME = 'fr-ortho-theme-';

/* Une case, une lettre. Ce filtre écarte « s'enfuir », « au-dessus »,
   « sous-bois » — des mots parfaitement légitimes ailleurs, mais qui n'entrent
   pas dans une grille. */
const FORME_JOUABLE = /^[a-zà-öø-ÿœæ]+$/;

function construireVivier(): string[] {
	const vus = new Set<string>();
	const retenir = (brut: string): void => {
		const mot = brut.toLowerCase().normalize('NFC');
		if (FORME_JOUABLE.test(mot)) vus.add(mot);
	};
	for (const serie of ORTHO_PREDEF) {
		if (!serie.id.startsWith(PREFIXE_THEME)) continue;
		for (const m of serie.mots) retenir(m.mot);
	}
	for (const champ of CHAMPS) for (const m of champ.mots) retenir(m.mot);
	return [...vus];
}

/* Calculé une fois : le vivier ne dépend que de données statiques. */
let cacheVivier: string[] | null = null;

/** Tous les mots jouables des deux banques, sans doublon.

    Rend une COPIE : le tableau gardé en cache serait sinon corruptible par
    n'importe quel appelant, et la contamination toucherait toutes les grilles
    suivantes. */
export function vivierMotsCases(): string[] {
	if (!cacheVivier) cacheVivier = construireVivier();
	return [...cacheVivier];
}

/** Les motifs de cette taille (critère 13). */
export function motifsDe(taille: TailleMotsCases): MotifMotsCases[] {
	return MOTIFS_MOTS_CASES.filter((m) => m.taille === taille);
}

/** Un mot par emplacement, dans l'ordre des emplacements — ou `null` si ce
    tirage ne remplit pas ce motif. Aucun mot n'y figure deux fois, et tous les
    croisements s'accordent : c'est ce placement qui prouve que la grille servie
    est résoluble (critère 9). Pur.

    `mots` par défaut, c'est le vivier du jeu ; le paramètre existe pour qu'un
    appelant puisse en fournir un autre — un vivier réduit, ou un vivier qui ne
    peut PAS remplir, ce qui est la seule façon d'atteindre l'abandon. */
export function remplir(
	motif: Motif,
	r: () => number,
	mots: readonly string[] = vivierMotsCases(),
): string[] | null {
	return remplirMotif(motif, mots, r);
}

/** Tire une partie de la taille demandée : un motif, ses mots mélangés, et une
    grille VIDE.

    Rend toujours une partie — servir `null` obligerait le runner à gérer un
    « pas de grille aujourd'hui » à chaque appel, pour un cas qui n'arrive pas.
    Si un motif résiste à ce tirage, `choisirRemplissage` en essaie un autre, et
    desserre le budget avant de renoncer.

    Le cas où AUCUN motif d'une taille ne se remplit est un défaut de DONNÉES,
    pas un aléa : `tests/mots-cases.test.ts` exige de chaque motif livré qu'il se
    remplisse au moins 18 fois sur 20. L'exception finale est donc une assertion
    — elle dit qu'un motif a été ajouté sans être mesuré, ou que le vivier a
    fondu, et il vaut mieux qu'elle se voie que de servir une grille insoluble.
    Le runner, lui, l'ATTRAPE et montre un panneau : une exception qui traverse
    un écran déjà rendu y laisse un jeu mort, sans grille et sans explication.

    Pur : l'aléa est injecté, rien n'est lu ni écrit. Comme pour `remplir`,
    `mots` rend le chemin d'échec atteignable sans toucher aux données. */
export function tirerGrille(
	taille: TailleMotsCases,
	r: () => number,
	mots: readonly string[] = vivierMotsCases(),
): PartieMotsCases {
	const trouve = choisirRemplissage(motifsDe(taille), mots, r);
	if (!trouve) {
		throw new Error(
			`Aucun motif « ${taille} » ne se remplit : vivier trop pauvre, ou croisements trop denses.`,
		);
	}
	return {
		motif: trouve.motif,
		mots: melanger(trouve.solution, r),
		grille: grilleNeuve(trouve.motif),
	};
}

/** Les mots qui restent à placer : ceux de la partie qui ne sont pas déjà dans
    la grille. Un mot retiré y revient donc de lui-même (critère 17). */
export function motsDisponibles(p: PartieMotsCases): string[] {
	const poses = new Set(
		p.grille.poses.filter((mot): mot is string => mot !== null).map((mot) => mot.normalize('NFC')),
	);
	return p.mots.filter((mot) => !poses.has(mot.normalize('NFC')));
}
