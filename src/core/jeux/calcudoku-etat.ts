/* ============================================================
   Calcudoku (#667) — l'ÉTAT PERSISTÉ : la grille en cours et l'initiation.

   DEUX clés, pas trois. Le voisin `sudoku-etat.ts` en a une de plus pour
   mémoriser la taille choisie ; le calcudoku n'a qu'une seule taille (`COTE`),
   donc cette préférence n'existe pas. Les deux clés sont préfixées `ludaskia_` :
   c'est ce que filtre `appKeys()`, donc ce qui fait entrer la donnée dans
   l'export de sauvegarde du parent ET la fait disparaître avec le profil
   supprimé. Le préfixe de profil, lui, est posé par `lsGet`/`lsSet` :
   l'isolation entre frères et sœurs est acquise.

   La grille en cours n'est pas un confort : avec un plafond quotidien, une
   grille peut très bien ne pas se terminer dans la session, donc repartir de
   zéro serait le cas NORMAL et non l'exception (critère 36).

   ── Tout se vérifie à la LECTURE, et voici pourquoi ─────────────────────────

   Ces clés traversent l'export et l'import de sauvegarde : la valeur stockée
   n'est pas un canal de confiance. Comme `getRevisionPlafond`, on borne donc à
   la lecture plutôt qu'à l'écriture — une donnée écrite par une version
   antérieure ou trafiquée à la main est rejetée au moment où on la relit. Une
   grille de longueur 3 rendue pour un 4×4 casserait le rendu à l'ouverture, et
   l'enfant n'aurait aucun moyen de s'en sortir : la donnée fautive serait relue
   à chaque tentative. D'où un `partieEnCours` qui ne lève JAMAIS et qui, au
   moindre doute, rend `null`.

   Le contrôle porte sur la validité STRUCTURELLE : forme, longueurs, bornes des
   valeurs, cohérence énoncé/état courant, et conformité des cages aux critères
   9, 11 et 12 (partition contiguë de 2 à 4 cases, jamais de division, différence
   et produit à deux cases). Il ne va délibérément PAS jusqu'à « l'énoncé stocké
   a-t-il encore une solution unique » : le sudoku peut se le permettre, sa règle
   étant intégralement connue du moteur sans donnée d'énoncé ; ici il faudrait
   rejouer l'oracle du tirage à chaque lecture de stockage, ce qu'aucun critère
   ne demande.
   ============================================================ */
import { lsGet, lsSet } from '../storage';
import {
	COTE,
	grilleTerminee,
	OPERATIONS,
	type Cage,
	type Operation,
	type Partie,
} from './calcudoku';
import type { Valeurs } from './grille-contraintes';

export const CLE_CALCUDOKU_PARTIE = 'ludaskia_jeux_calcudoku_partie';
export const CLE_CALCUDOKU_INITIE = 'ludaskia_jeux_calcudoku_initie';

const TOTAL = COTE * COTE;

/** Bornes de taille d'une cage (critères 9 et 10) : une case seule donnerait son
    chiffre gratuitement, au-delà de quatre la cage déborde du raisonnable. */
const CAGE_MIN = 2;
const CAGE_MAX = 4;

/* ── LA GRILLE EN COURS ──────────────────────────────────────────────────── */

/** Une grille de `TOTAL` cases, chacune entière de 0 à `COTE`. 7 dans un 4×4 est
    inaffichable : la case paraîtrait vide tout en bloquant la grille. Rend une
    COPIE, jamais la donnée relue. */
function grilleValide(x: unknown): Valeurs | null {
	if (!Array.isArray(x) || x.length !== TOTAL) return null;
	for (const c of x) {
		if (!Number.isInteger(c) || (c as number) < 0 || (c as number) > COTE) return null;
	}
	return [...(x as number[])];
}

function estOperation(x: unknown): x is Operation {
	return OPERATIONS.some((o) => o === x);
}

/** Les cases d'une cage se tiennent-elles ? Voisinage orthogonal, parcours en
    largeur : une cage en deux morceaux se dessinerait comme deux cages alors
    qu'elle n'aurait qu'une étiquette et un seul objectif. */
function contigue(cases: readonly number[]): boolean {
	const restant = new Set(cases);
	const file = [cases[0]];
	restant.delete(cases[0]);
	while (file.length > 0) {
		const i = file.shift() as number;
		for (const j of [...restant]) {
			const memeLigne = Math.floor(i / COTE) === Math.floor(j / COTE);
			if ((memeLigne && Math.abs(i - j) === 1) || Math.abs(i - j) === COTE) {
				restant.delete(j);
				file.push(j);
			}
		}
	}
	return restant.size === 0;
}

/** Les cages relues, ou `null`. Elles doivent PARTITIONNER la grille : deux
    cages qui se partagent une case feraient rendre l'une ou l'autre à `cageDe`
    selon l'ordre, donc la phrase d'explication dirait un objectif sur deux ; une
    case sans cage n'aurait aucun objectif du tout. Rend des COPIES. */
function cagesValides(x: unknown): Cage[] | null {
	if (!Array.isArray(x) || x.length === 0) return null;
	const vues = new Set<number>();
	const out: Cage[] = [];
	for (const brute of x) {
		if (!brute || typeof brute !== 'object' || Array.isArray(brute)) return null;
		const { cases, operation, objectif } = brute as {
			cases?: unknown;
			operation?: unknown;
			objectif?: unknown;
		};
		if (!Array.isArray(cases) || cases.length < CAGE_MIN || cases.length > CAGE_MAX) return null;
		// Critère 11 : jamais de division, et rien d'autre non plus — le rendu
		// n'aurait aucun symbole à afficher pour une opération inconnue.
		if (!estOperation(operation)) return null;
		// Critère 12 : une différence à trois termes n'a pas de sens univoque, et un
		// produit à trois facteurs a une cible ambiguë (8 = 1×2×4 = 2×2×2).
		if (operation !== 'somme' && cases.length !== 2) return null;
		if (!Number.isInteger(objectif) || (objectif as number) < 0) return null;
		const indices: number[] = [];
		for (const i of cases) {
			if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= TOTAL) return null;
			if (vues.has(i as number)) return null;
			vues.add(i as number);
			indices.push(i as number);
		}
		if (!contigue(indices)) return null;
		out.push({ cases: indices, operation, objectif: objectif as number });
	}
	return vues.size === TOTAL ? out : null;
}

/** La grille laissée en cours, ou `null`. Rend un état INDÉPENDANT à chaque
    appel : le runner mute son état de jeu, et deux lectures qui partageraient
    leurs tableaux se contamineraient — une pose faite dans un écran changerait
    l'état d'un autre sans passer par `poser`.

    N'écrit RIEN au passage : un effet de bord ici (marquer « vu », dater)
    recréerait par la bande le compteur de relance que le critère 37 interdit. */
export function partieEnCours(): Partie | null {
	const brute = lsGet(CLE_CALCUDOKU_PARTIE, null) as unknown;
	if (!brute || typeof brute !== 'object' || Array.isArray(brute)) return null;
	const { cages, enonce, valeurs } = brute as {
		cages?: unknown;
		enonce?: unknown;
		valeurs?: unknown;
	};
	const c = cagesValides(cages);
	const e = grilleValide(enonce);
	const v = grilleValide(valeurs);
	if (!c || !e || !v) return null;
	// L'énoncé « ne change jamais » : une case donnée qui porte autre chose dans
	// l'état courant n'est plus une grille mais deux grilles mélangées, et
	// `estFixe` mentirait ensuite à l'enfant sur ce qu'il peut toucher.
	for (let i = 0; i < e.length; i++) if (e[i] !== 0 && v[i] !== e[i]) return null;
	const p: Partie = { cages: c, enonce: e, valeurs: v };
	// Une grille TERMINÉE ne se rouvre jamais terminée (critère 38). Le chemin
	// normal efface à la victoire, mais la fenêtre entre la dernière pose et
	// l'effacement existe pour de vrai : onglet fermé, plafond atteint, export
	// pris à cet instant précis.
	return grilleTerminee(p) ? null : p;
}

/** Range la grille en cours, en REMPLAÇANT la précédente : il n'y en a qu'une,
    le jeu n'ayant qu'une taille. Écrit une copie plate — ce qui est rangé ne
    doit rien partager avec ce que le runner continue de muter. Le contrôle de
    validité, lui, se fait à la relecture (voir l'en-tête). */
export function sauverPartie(p: Partie): void {
	if (!p || typeof p !== 'object') return;
	lsSet(CLE_CALCUDOKU_PARTIE, {
		cages: Array.isArray(p.cages)
			? p.cages.map((c) => ({
					cases: Array.isArray(c?.cases) ? [...c.cases] : c?.cases,
					operation: c?.operation,
					objectif: c?.objectif,
				}))
			: p.cages,
		enonce: Array.isArray(p.enonce) ? [...p.enonce] : p.enonce,
		valeurs: Array.isArray(p.valeurs) ? [...p.valeurs] : p.valeurs,
	});
}

/** Libère l'emplacement : la partie suivante repart d'une grille neuve
    (critère 38). Idempotent, et toujours par `lsSet` — l'effacement est une
    modification du profil comme une autre, qui doit dater le profil actif. */
export function effacerPartie(): void {
	lsSet(CLE_CALCUDOKU_PARTIE, null);
}

/* ── LA PREMIÈRE GRILLE DU PROFIL ────────────────────────────────────────── */

/** L'enfant a-t-il déjà vu sa toute première grille sur ce profil ? Celle-ci est
    un cas-pivot d'EXEMPLE (critère 32) : la resservir à chaque nouvelle grille
    la transformerait en grille offerte. Rend TOUJOURS un booléen, même sur une
    donnée bricolée — seul le `true` littéral compte. */
export function dejaInitie(): boolean {
	return lsGet(CLE_CALCUDOKU_INITIE, false) === true;
}

export function marquerInitie(): void {
	lsSet(CLE_CALCUDOKU_INITIE, true);
}
