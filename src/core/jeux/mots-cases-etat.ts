/* ============================================================
   Mots casés (#664) — l'ÉTAT PERSISTÉ : taille choisie, grille en cours.

   Deux clés, toutes deux préfixées `ludaskia_` : c'est ce que filtre
   `appKeys()`, donc ce qui fait entrer la donnée dans l'export de sauvegarde du
   parent ET la fait disparaître avec le profil supprimé. Le préfixe de PROFIL,
   lui, est posé par `lsGet`/`lsSet` : l'isolation entre frères et sœurs est
   acquise sans rien écrire ici.

   Deux clés et pas trois, et ce n'est pas une économie : une troisième clé
   serait une mémoire de plus — un compteur de parties, une série de grilles
   enchaînées, un record. Le jeu n'a le droit ni de compter ni de se souvenir
   (critères 38 et 39). Sans mémoire, il n'y a ni palier ni score possible.

   ── UNE seule grille en cours, pas une par taille ───────────────────────────

   Le sudoku en garde une par taille ; ici les critères n'en demandent qu'une, et
   la partie sauvée porte déjà sa taille dans `motif.taille`. Conséquence
   assumée : changer de taille pendant une partie ABANDONNE la grille en cours,
   et repasse donc par `avantNouvellePartie` — ce qui interdit au passage de
   contourner le plafond quotidien en faisant l'aller-retour entre les deux
   tailles.

   ── Tout se vérifie à la LECTURE, et voici pourquoi ─────────────────────────

   Ces clés traversent l'export et l'import de sauvegarde : la valeur stockée
   n'est pas un canal de confiance, elle peut avoir été fabriquée à la main.
   Comme `getRevisionPlafond` et l'état du sudoku, on borne donc à la lecture
   plutôt qu'à l'écriture.

   Deux refus vont plus loin que la forme :

   • **une grille restaurée est une grille SERVIE**, donc ce que la génération
     s'interdit vaut pour elle : un mot hors des banques (l'enfant lirait un mot
     faux, en toutes lettres), un doublon, une longueur qui ne colle pas au
     dessin. Ça n'a pas à rentrer par la porte du stockage ;
   • **une grille déjà terminée ne se rouvre jamais** : le chemin normal efface à
     la victoire, mais la fenêtre existe — onglet fermé sur le dernier mot,
     plafond atteint, export pris à cet instant. Rouvrir une grille finie ne
     laisserait rien à faire à l'enfant, sans lui dire pourquoi.

   Ce qui est en revanche GARDÉ, et qui pourrait passer pour une corruption :
   la grille PLEINE MAIS FAUSSE. C'est un état de jeu légitime, rendu
   atteignable par l'arbitrage qui accepte la pose contradictoire ; le jeter à la
   lecture ferait perdre à l'enfant, en quittant, exactement le moment où il a le
   plus besoin de revenir.
   ============================================================ */
import { lsGet, lsSet } from '../storage';
import { grilleNeuve, poser, terminee } from './grille-mots';
import { vivierMotsCases, type PartieMotsCases } from './mots-cases';
import {
	MOTIFS_MOTS_CASES,
	TAILLES_MOTS_CASES,
	type TailleMotsCases,
} from '../../data/jeux/motifs-mots-cases';

export const CLE_MOTS_CASES_PARTIE = 'ludaskia_jeux_mots-cases_partie';
export const CLE_MOTS_CASES_TAILLE = 'ludaskia_jeux_mots-cases_taille';

/** La taille servie à un profil neuf. La petite : cinq mots et dix-neuf cases se
    finissent dans une session, là où la grande demande d'y revenir — et un jeu
    qu'on découvre doit pouvoir se terminer une première fois. */
const TAILLE_DEFAUT: TailleMotsCases = 'petite';

const nfc = (mot: string): string => mot.normalize('NFC');
const longueurDe = (mot: string): number => [...nfc(mot)].length;

function estTaille(x: unknown): x is TailleMotsCases {
	return TAILLES_MOTS_CASES.some((t) => t === x);
}

/** La dernière taille jouée, reproposée à la partie suivante (critère 13).
    C'est une PRÉFÉRENCE, pas un record : le jeu n'a pas de score. */
export function tailleChoisie(): TailleMotsCases {
	const brut = lsGet(CLE_MOTS_CASES_TAILLE, TAILLE_DEFAUT) as unknown;
	return estTaille(brut) ? brut : TAILLE_DEFAUT;
}

export function memoriserTaille(taille: TailleMotsCases): void {
	if (!estTaille(taille)) return;
	lsSet(CLE_MOTS_CASES_TAILLE, taille);
}

/* ---------- La grille en cours ---------- */

/** Forme rangée sous la clé : l'IDENTIFIANT du motif (jamais son dessin — il
    vit dans les données, et un dessin recopié dans le stockage vieillirait),
    la liste des mots dans son ordre d'affichage, et les mots posés. */
interface PartieRangee {
	motif: string;
	mots: string[];
	poses: (string | null)[];
}

function estListeDeMots(x: unknown, taille: number): x is string[] {
	return Array.isArray(x) && x.length === taille && x.every((m) => typeof m === 'string');
}

/** Deux multiensembles de longueurs coïncident-ils ? Comparer les longueurs
    TRIÉES et non une par une : la liste des mots est mélangée, son ordre n'a
    rien à voir avec celui des emplacements. */
function memesLongueurs(a: readonly number[], b: readonly number[]): boolean {
	const croissant = (x: number, y: number): number => x - y;
	const ta = [...a].sort(croissant);
	const tb = [...b].sort(croissant);
	return ta.length === tb.length && ta.every((n, i) => n === tb[i]);
}

/** La grille laissée en cours, ou `null`. Rend un état INDÉPENDANT à chaque
    appel : le runner mute son état de jeu, et deux lectures qui partageraient
    leurs tableaux se contamineraient l'une l'autre. */
export function partieEnCours(): PartieMotsCases | null {
	const brut = lsGet(CLE_MOTS_CASES_PARTIE, null) as unknown;
	if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
	const range = brut as Partial<PartieRangee>;

	const motif = MOTIFS_MOTS_CASES.find((m) => m.id === range.motif);
	if (!motif) return null;
	const attendus = motif.emplacements.length;

	const mots = range.mots;
	if (!estListeDeMots(mots, attendus)) return null;
	const vivier = new Set(vivierMotsCases().map(nfc));
	if (!mots.every((mot) => vivier.has(nfc(mot)))) return null;
	if (new Set(mots.map(nfc)).size !== mots.length) return null;
	if (
		!memesLongueurs(
			mots.map(longueurDe),
			motif.emplacements.map((e) => e.longueur),
		)
	) {
		return null;
	}

	const poses = range.poses;
	if (!Array.isArray(poses) || poses.length !== attendus) return null;
	/* Les mots encore disponibles : un mot posé doit venir de la liste, et ne
	   peut y être puisé qu'une fois. Sans ça, la liste et la grille raconteraient
	   deux parties différentes, et le compteur « X mots sur Y » deviendrait faux
	   sans prévenir. */
	const restants = new Set(mots.map(nfc));
	let grille = grilleNeuve(motif);
	for (let i = 0; i < attendus; i++) {
		const mot: unknown = poses[i];
		if (mot === null || mot === undefined) continue;
		if (typeof mot !== 'string' || !restants.delete(nfc(mot))) return null;
		const apres = poser(grille, i, mot);
		// `poser` refuse en silence une longueur qui ne colle pas à l'emplacement :
		// une grille inchangée est donc le signal d'une pose impossible.
		if (apres === grille) return null;
		grille = apres;
	}

	return terminee(grille) ? null : { motif, mots: [...mots], grille };
}

/** Écrit la partie telle quelle. Le bornage est à la LECTURE : ici on n'a rien
    à juger, et une écriture qui filtrerait ferait diverger ce que le runner
    croit avoir sauvé de ce qu'il relira. */
export function sauverPartie(p: PartieMotsCases): void {
	const range: PartieRangee = {
		motif: p.motif.id,
		mots: [...p.mots],
		poses: [...p.grille.poses],
	};
	lsSet(CLE_MOTS_CASES_PARTIE, range);
}

/** Libère la place : la partie suivante repart d'une grille neuve. */
export function effacerPartie(): void {
	lsSet(CLE_MOTS_CASES_PARTIE, null);
}
