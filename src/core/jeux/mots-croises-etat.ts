/* ============================================================
   Mots croisés (#665) — l'ÉTAT PERSISTÉ : la grille en cours.

   UNE seule clé, préfixée `ludaskia_` : c'est ce que filtre `appKeys()`, donc ce
   qui fait entrer la donnée dans l'export de sauvegarde du parent ET la fait
   disparaître avec le profil supprimé. Le préfixe de PROFIL, lui, est posé par
   `lsGet`/`lsSet` : l'isolation entre frères et sœurs est acquise sans rien
   écrire ici.

   Une clé et pas deux, et ce n'est pas une économie. Les mots casés en ont deux
   parce que l'enfant y choisit une taille ; ici il ne choisit rien, donc toute
   clé supplémentaire serait une MÉMOIRE de plus — un compteur de grilles finies,
   une série de grilles enchaînées (critère 43), un record (critère 42). Sans
   mémoire, il n'y a ni palier ni score possible. Une deuxième clé se déclare ici,
   avec sa raison.

   ── Tout se vérifie à la LECTURE, et voici pourquoi ─────────────────────────

   Cette clé traverse l'export et l'import de sauvegarde : la valeur stockée n'est
   pas un canal de confiance, elle peut avoir été fabriquée à la main. Comme
   l'état du sudoku et celui des mots casés, on borne donc à la lecture plutôt
   qu'à l'écriture.

   Trois refus vont plus loin que la forme :

   • **une grille restaurée est une grille SERVIE**, donc ce que la génération
     s'interdit vaut pour elle : un mot hors du vivier (l'emplacement n'aurait
     aucune définition à montrer), un doublon (deux fois le même énoncé, une seule
     réponse acceptée), une longueur qui ne colle pas au dessin, une solution qui
     se contredit à un croisement — celle-là est INFINISSABLE, l'enfant tournerait
     en rond sans jamais comprendre ;
   • **une case ne porte jamais autre chose qu'une lettre** : un « ## » ou un
     chiffre déborderait d'une case de 44 px, et rien au clavier ne permettrait de
     le corriger ;
   • **une grille déjà terminée ne se rouvre pas** (critère 39). Le chemin normal
     efface à la victoire, mais la fenêtre existe : onglet fermé sur la dernière
     lettre, plafond atteint pile à ce moment, export pris à cet instant.

   Ce qui est en revanche GARDÉ, et qui pourrait passer pour une corruption : la
   grille PLEINE MAIS FAUSSE. C'est exactement le moment où l'enfant a le plus
   besoin de revenir ; la jeter à la lecture le punirait d'avoir quitté.

   Le plafond n'est jamais consulté ici, et c'est le critère 37 : la grille survit
   à son atteinte. Une lecture qui regarderait le temps restant pourrait décider
   de ne PAS rendre la grille — le cas d'échec littéral.
   ============================================================ */
import { lsGet, lsSet } from '../storage';
import { casesDe, croisements } from './grille-mots';
import { MOTIFS_MOTS_CROISES } from '../../data/jeux/motifs-mots-croises';
import {
	cleCase,
	estLettre,
	lettresDe,
	partieGagnee,
	vivierMotsCroises,
	type PartieMotsCroises,
} from './mots-croises';

export const CLE_MOTS_CROISES_PARTIE = 'ludaskia_jeux_mots-croises_partie';

/** Forme rangée sous la clé : l'IDENTIFIANT du motif (jamais son dessin — il vit
    dans les données, et un dessin recopié dans le stockage vieillirait), la
    solution dans l'ordre des emplacements, et les lettres écrites. */
interface PartieRangee {
	motif: string;
	solution: string[];
	lettres: Record<string, string>;
}

const nfc = (mot: string): string => mot.normalize('NFC');

const bas = (mot: string): string => nfc(mot).toLocaleLowerCase('fr');

/** La grille laissée en cours, ou `null`. Rend un état INDÉPENDANT à chaque
    appel : le runner remplace son état à chaque lettre, et deux lectures qui
    partageraient leurs objets se contamineraient l'une l'autre. */
export function partieEnCours(): PartieMotsCroises | null {
	const brut = lsGet(CLE_MOTS_CROISES_PARTIE, null) as unknown;
	if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
	const range = brut as Partial<PartieRangee>;

	const motif = MOTIFS_MOTS_CROISES.find((m) => m.id === range.motif);
	if (!motif) return null;

	const solution = range.solution;
	if (!Array.isArray(solution) || solution.length !== motif.emplacements.length) return null;
	if (!solution.every((mot) => typeof mot === 'string')) return null;
	const vivier = new Set(vivierMotsCroises().map(bas));
	if (!solution.every((mot) => vivier.has(bas(mot)))) return null;
	if (new Set(solution.map(bas)).size !== solution.length) return null;
	if (!solution.every((mot, i) => lettresDe(mot).length === motif.emplacements[i].longueur)) {
		return null;
	}
	const contredite = croisements(motif).some(
		(c) => lettresDe(solution[c.a])[c.indexA] !== lettresDe(solution[c.b])[c.indexB],
	);
	if (contredite) return null;

	/* Les cases du dessin, pour refuser une lettre rangée nulle part : une case
	   qui n'existe pas ne se voit pas à l'écran, mais elle voyagerait d'un export
	   à l'autre sans que rien ne la nettoie. */
	const connues = new Set(
		motif.emplacements.flatMap((e) => casesDe(e).map((c) => cleCase(c.ligne, c.colonne))),
	);
	const brutes: unknown = range.lettres;
	if (!brutes || typeof brutes !== 'object' || Array.isArray(brutes)) return null;
	const lettres: Record<string, string> = {};
	for (const [k, valeur] of Object.entries(brutes)) {
		if (!connues.has(k) || !estLettre(valeur)) return null;
		lettres[k] = nfc(valeur);
	}

	const partie: PartieMotsCroises = { motif, solution: [...solution], lettres };
	return partieGagnee(partie) ? null : partie;
}

/** Écrit la partie telle quelle. Le bornage est à la LECTURE : ici on n'a rien à
    juger, et une écriture qui filtrerait ferait diverger ce que le runner croit
    avoir sauvé de ce qu'il relira. */
export function sauverPartie(p: PartieMotsCroises): void {
	const range: PartieRangee = {
		motif: p.motif.id,
		solution: [...p.solution],
		lettres: { ...p.lettres },
	};
	lsSet(CLE_MOTS_CROISES_PARTIE, range);
}

/** Libère la place : la partie suivante repart d'une grille neuve. */
export function effacerPartie(): void {
	lsSet(CLE_MOTS_CROISES_PARTIE, null);
}
