/* ============================================================
   Sudoku (#666) — l'ÉTAT PERSISTÉ (critères 1, 6, 17, 19).

   Trois clés, toutes préfixées `ludaskia_` : c'est ce que filtre `appKeys()`,
   donc ce qui fait entrer la donnée dans l'export de sauvegarde du parent ET la
   fait disparaître avec le profil supprimé. Le préfixe de profil, lui, est posé
   par `lsGet`/`lsSet` : l'isolation entre frères et sœurs est acquise.

   La grille en cours n'est pas un confort. Avec un plafond par défaut de 10
   minutes, une grille 6×6 ne se termine pas en une session, donc repartir de
   zéro serait le cas NORMAL et non l'exception (critère 17) — et une perte non
   consentie, dans une application dont l'XP et les étoiles ne régressent jamais.

   ── Tout se vérifie à la LECTURE, et voici pourquoi ─────────────────────────

   Ces clés traversent l'export et l'import de sauvegarde : la valeur stockée
   n'est pas un canal de confiance, elle peut avoir été fabriquée à la main.
   Comme `getRevisionPlafond`, on borne donc à la lecture plutôt qu'à l'écriture.

   Deux refus vont plus loin que la simple forme, et ils viennent de l'auteur des
   tests, qui les a DÉRIVÉS des critères plutôt que de les y lire :

   • **une grille restaurée est une grille SERVIE**, donc les critères 3 et 4
     valent pour elle. Un énoncé qui n'est pas finissable par déduction
     élémentaire condamnerait l'enfant à ne jamais finir sans que rien ne le lui
     dise, ce qui est exactement le défaut que ces deux critères interdisent à
     la génération. Il n'a pas à rentrer par la porte du stockage ;
   • **une grille déjà terminée ne se rouvre jamais** (critère 19), même si le
     chemin normal efface à la victoire : la fenêtre onglet-fermé,
     plafond-atteint ou export-pris-à-cet-instant existe.

   Le bornage borne le BRUIT, jamais le signal : une 4×4 corrompue ne doit pas
   emporter la 6×6 avec elle, d'où la validation par taille et non en bloc.
   ============================================================ */
import { lsGet, lsSet } from '../storage';
import { grilleTerminee, moteurSudoku, TAILLES, type Partie, type TailleSudoku } from './sudoku';
import { resoudreParDeductionElementaire, type Valeurs } from './grille-contraintes';

export const CLE_SUDOKU_PARTIES = 'ludaskia_jeux_sudoku_parties';
export const CLE_SUDOKU_TAILLE = 'ludaskia_jeux_sudoku_taille';
export const CLE_SUDOKU_INITIE = 'ludaskia_jeux_sudoku_initie';

/** La taille servie à un profil neuf. Le 4×4 : ses régions 2×2 collent à
    l'intuition visuelle de quadrant qu'un enfant a déjà, là où les régions non
    carrées du 6×6 sont un regroupement arbitraire. Même esprit que le critère 6. */
const TAILLE_DEFAUT: TailleSudoku = 4;

function estTaille(x: unknown): x is TailleSudoku {
	return TAILLES.some((t) => t === x);
}

/** La dernière taille jouée, reproposée à la partie suivante (critère 1). C'est
    une PRÉFÉRENCE, pas un record : le jeu n'a pas de score (critère 29). */
export function tailleChoisie(): TailleSudoku {
	const brut = lsGet(CLE_SUDOKU_TAILLE, TAILLE_DEFAUT) as unknown;
	return estTaille(brut) ? brut : TAILLE_DEFAUT;
}

export function memoriserTaille(taille: TailleSudoku): void {
	if (!estTaille(taille)) return;
	lsSet(CLE_SUDOKU_TAILLE, taille);
}

/* ---------- La grille en cours, une par taille ---------- */

/** La table brute des parties, rangée par taille. Un objet, jamais un tableau :
    les tailles ne se suivent pas (4 puis 6) et n'ont pas à se suivre. */
function tableParties(): Record<string, unknown> {
	const brut = lsGet(CLE_SUDOKU_PARTIES, {}) as unknown;
	if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return {};
	return { ...(brut as Record<string, unknown>) };
}

function grilleValide(x: unknown, taille: TailleSudoku): Valeurs | null {
	if (!Array.isArray(x) || x.length !== taille * taille) return null;
	for (const c of x) {
		if (!Number.isInteger(c) || (c as number) < 0 || (c as number) > taille) return null;
	}
	return [...(x as number[])];
}

/** La grille laissée en cours à cette taille, ou `null`. Rend un état
    INDÉPENDANT à chaque appel : le runner mute son état de jeu, et deux
    lectures qui partageraient leurs tableaux se contamineraient. */
export function partieEnCours(taille: TailleSudoku): Partie | null {
	if (!estTaille(taille)) return null;
	const brute = tableParties()[String(taille)];
	if (!brute || typeof brute !== 'object' || Array.isArray(brute)) return null;
	const { enonce, valeurs } = brute as { enonce?: unknown; valeurs?: unknown };
	const e = grilleValide(enonce, taille);
	const v = grilleValide(valeurs, taille);
	if (!e || !v) return null;
	// L'énoncé « ne change jamais » : une case donnée qui porte autre chose dans
	// l'état courant n'est plus une grille mais deux grilles mélangées, et
	// `estFixe` mentirait ensuite à l'enfant sur ce qu'il peut toucher.
	for (let i = 0; i < e.length; i++) if (e[i] !== 0 && v[i] !== e[i]) return null;
	// L'ÉNONCÉ doit être finissable, pas l'état courant : un symbole mal posé par
	// l'enfant rend souvent l'état courant insoluble, et c'est son droit
	// (critère 13, le conflit ne bloque pas la pose). Effacer sa grille pour ça
	// serait la perte que le critère 17 refuse.
	if (!resoudreParDeductionElementaire(moteurSudoku(taille), e)) return null;
	const p: Partie = { taille, enonce: e, valeurs: v };
	return grilleTerminee(p) ? null : p;
}

export function sauverPartie(p: Partie): void {
	if (!p || !estTaille(p.taille)) return;
	lsSet(CLE_SUDOKU_PARTIES, {
		...tableParties(),
		[String(p.taille)]: { enonce: [...p.enonce], valeurs: [...p.valeurs] },
	});
}

/** Libère l'emplacement : la partie suivante repart d'une grille neuve
    (critère 19). N'emporte pas l'autre taille. */
export function effacerPartie(taille: TailleSudoku): void {
	const table = tableParties();
	if (!(String(taille) in table)) return;
	delete table[String(taille)];
	lsSet(CLE_SUDOKU_PARTIES, table);
}

/* ---------- La première grille du profil ---------- */

/** L'enfant a-t-il déjà joué une grille sur ce profil ? La toute première est
    presque complète (critère 6), et une seule fois pour le profil ENTIER : pas
    une par taille, sinon la leçon d'entrée se redonnerait au changement de
    format alors qu'elle est déjà apprise. */
export function dejaInitie(): boolean {
	return lsGet(CLE_SUDOKU_INITIE, false) === true;
}

export function marquerInitie(): void {
	lsSet(CLE_SUDOKU_INITIE, true);
}
