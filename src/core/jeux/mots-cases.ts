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

   ── Le remplissage : « le plus contraint d'abord », et un budget DUR ────────

   Une recherche naïve sur ce problème ne termine pas. Deux réglages suffisent à
   le rendre trivial, et ils ont été mesurés avant d'être écrits :

   • **l'ordre**, choisir à chaque étape l'emplacement qui a le MOINS de mots
     encore possibles. Sur les sept motifs livrés, 200 remplissages sur 200
     réussissent, sans une seule reprise coûteuse ;
   • **le budget**, un nombre de nœuds maximal avec abandon propre. Il ne sert
     jamais sur ces motifs-là ; il existe pour que l'ajout d'un motif trop dense
     se solde par « on essaie un autre dessin » et jamais par un onglet figé.
     Le carré de mots 5×5 (6 mots pour 9 croisements) est le cas mesuré : 0
     remplissage sur 200. Ce n'est pas le vivier qui limite, c'est la DENSITÉ.

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
import { croisements, grilleNeuve, type Croisement, type Grille, type Motif } from './grille-mots';

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

const lettresDe = (mot: string): string[] => [...mot.normalize('NFC')];

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

/** Mélange par CLÉ TIRÉE : un tirage par élément, puis tri sur cette clé. Une
    copie, jamais l'original.

    Ce n'est pas le Fisher-Yates habituel du dépôt, et le motif du changement est
    mesuré. Fisher-Yates fait reposer UNE position sur UN tirage — la dernière
    sur le tout premier appel. Or les générateurs déterministes employés partout
    dans les tests sont des LCG semés par de petits entiers, dont la première
    sortie est quasi constante : sur les graines 1 à 200, elle ne bouge que de
    0,236 à 0,314. Choisir un motif parmi trois avec ce seul tirage, c'est donc
    servir le même motif aux 200 tirages et n'en montrer jamais un troisième.

    Avec une clé par élément, chaque position dépend de TOUS les tirages : le
    biais d'un seul d'entre eux ne peut plus geler un rang. */
function melanger<T>(items: readonly T[], r: () => number): T[] {
	return items
		.map((item) => ({ item, cle: r() }))
		.sort((a, b) => a.cle - b.cle)
		.map(({ item }) => item);
}

/** Nombre de placements essayés avant d'abandonner un motif. Jamais atteint sur
    les motifs livrés (mesuré : 200 réussites sur 200, chacune en quelques
    dizaines de nœuds) — c'est un garde-fou contre un dessin futur trop dense,
    pas un réglage de performance. */
const BUDGET_NOEUDS = 30000;

function remplirAvecBudget(motif: Motif, r: () => number, budgetInitial: number): string[] | null {
	const n = motif.emplacements.length;
	const parEmplacement: Croisement[][] = motif.emplacements.map(() => []);
	for (const c of croisements(motif)) {
		parEmplacement[c.a].push(c);
		parEmplacement[c.b].push(c);
	}

	/* Le vivier est mélangé UNE fois puis rangé par longueur : c'est ce mélange
	   qui fait varier les grilles d'un tirage à l'autre, et le seul endroit où
	   l'aléa entre. La recherche, elle, est déterministe. */
	const parLongueur = new Map<number, string[][]>();
	for (const mot of melanger(vivierMotsCases(), r)) {
		const lettres = lettresDe(mot);
		const liste = parLongueur.get(lettres.length);
		if (liste) liste.push(lettres);
		else parLongueur.set(lettres.length, [lettres]);
	}
	const candidats = motif.emplacements.map((e) => parLongueur.get(e.longueur) ?? []);

	const poses: (string[] | null)[] = motif.emplacements.map(() => null);
	const pris = new Set<string>();
	let budget = budgetInitial;

	/** Le mot tient-il compte des lettres déjà fixées par les croisements ? */
	const accepte = (i: number, mot: string[]): boolean => {
		for (const c of parEmplacement[i]) {
			const voisin = poses[c.a === i ? c.b : c.a];
			if (!voisin) continue;
			if (mot[c.a === i ? c.indexA : c.indexB] !== voisin[c.a === i ? c.indexB : c.indexA]) {
				return false;
			}
		}
		return true;
	};

	const chercher = (): boolean => {
		if (budget-- <= 0) return false;
		/* L'emplacement le PLUS CONTRAINT d'abord : celui qui a le moins de mots
		   encore possibles. C'est ce qui fait échouer tôt les impasses, au lieu de
		   les découvrir après avoir posé cinq mots. */
		let cible = -1;
		let choix: string[][] | null = null;
		for (let i = 0; i < n; i++) {
			if (poses[i]) continue;
			const possibles = candidats[i].filter((mot) => !pris.has(mot.join('')) && accepte(i, mot));
			if (!choix || possibles.length < choix.length) {
				cible = i;
				choix = possibles;
				if (possibles.length === 0) break;
			}
		}
		if (cible < 0 || !choix) return true;
		for (const mot of choix) {
			const forme = mot.join('');
			poses[cible] = mot;
			pris.add(forme);
			if (chercher()) return true;
			poses[cible] = null;
			pris.delete(forme);
			if (budget <= 0) return false;
		}
		return false;
	};

	if (!chercher()) return null;
	return poses.map((mot) => (mot ?? []).join(''));
}

/** Un mot par emplacement, dans l'ordre des emplacements — ou `null` si ce
    tirage ne remplit pas ce motif. Aucun mot n'y figure deux fois, et tous les
    croisements s'accordent : c'est ce placement qui prouve que la grille servie
    est résoluble (critère 9). Pur. */
export function remplir(motif: Motif, r: () => number): string[] | null {
	return remplirAvecBudget(motif, r, BUDGET_NOEUDS);
}

/* Passes successives : chacune remélange les motifs et le vivier, et desserre
   le budget. Sur les motifs livrés la première suffit toujours. */
const BUDGETS: readonly number[] = [BUDGET_NOEUDS, BUDGET_NOEUDS * 8, BUDGET_NOEUDS * 64];

/** Tire une partie de la taille demandée : un motif, ses mots mélangés, et une
    grille VIDE.

    Rend toujours une partie — servir `null` obligerait le runner à gérer un
    « pas de grille aujourd'hui » qui n'a aucun sens pour l'enfant. Si un motif
    résiste à ce tirage, on en essaie un autre.

    Le cas où AUCUN motif d'une taille ne se remplit est un défaut de DONNÉES,
    pas un aléa : `tests/mots-cases.test.ts` exige de chaque motif livré qu'il se
    remplisse au moins 18 fois sur 20. L'exception finale est donc une assertion
    — elle dit qu'un motif a été ajouté sans être mesuré, ou que le vivier a
    fondu, et il vaut mieux qu'elle se voie que de servir une grille insoluble.
    Pur : l'aléa est injecté, rien n'est lu ni écrit. */
export function tirerGrille(taille: TailleMotsCases, r: () => number): PartieMotsCases {
	const motifs = motifsDe(taille);
	for (const budget of BUDGETS) {
		for (const motif of melanger(motifs, r)) {
			const solution = remplirAvecBudget(motif, r, budget);
			if (!solution) continue;
			return { motif, mots: melanger(solution, r), grille: grilleNeuve(motif) };
		}
	}
	throw new Error(`Aucun motif « ${taille} » ne se remplit avec le vivier courant.`);
}

/** Les mots qui restent à placer : ceux de la partie qui ne sont pas déjà dans
    la grille. Un mot retiré y revient donc de lui-même (critère 17). */
export function motsDisponibles(p: PartieMotsCases): string[] {
	const poses = new Set(
		p.grille.poses.filter((mot): mot is string => mot !== null).map((mot) => mot.normalize('NFC')),
	);
	return p.mots.filter((mot) => !poses.has(mot.normalize('NFC')));
}
