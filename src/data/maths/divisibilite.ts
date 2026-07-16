/* ============================================================
   Calcul mental CM1 — Critères de divisibilité par 2, 5 et 10 (#250).
   ------------------------------------------------------------
   UNE leçon QCM oui/non mêlant les trois critères. Chaque item = un nombre N +
   un diviseur d ∈ {2, 5, 10} (~1/3 chacun) ; question « N est-il divisible par
   d ? » → Oui / Non. Réponses équilibrées ~50/50 (12 oui + 12 non par diviseur).
   Une minorité d'items est formulée CÔTÉ DIVISEUR (« d est-il un diviseur de
   N ? ») pour faire le pont de vocabulaire — le vocabulaire principal reste
   « divisible par » (on évite « dans la table de »).

   Banque CM1-only, construite via le combinateur `bankByLevel` (#225) : chaque
   item porte `levels: ['cm1']`, le catalogue en dérive `LessonDef.levels` (comme
   `calibrated`). CM1 uniquement — le CE2 ne bouge pas.

   INVARIANT PROJET : la réponse est CALCULÉE puis STOCKÉE dans l'item à la
   construction (`estDivisible`), jamais recalculée au moment du `check` (qui se
   contente de comparer le choix de l'enfant à la réponse stockée).

   Cas frontière obligatoires et équilibrés (par construction, cf. `UNITES_*`) :
   - nombre finissant par 0 → divisible par 2, 5 ET 10 ;
   - finissant par 5 → divisible par 5 SEUL (pas par 2 ni 10 — piège classique) ;
   - finissant par un chiffre pair non nul → divisible par 2 SEUL ;
   - finissant par un impair ≠ 5 → divisible par aucun.

   Plage : le gros de la banque en 2-4 chiffres (lisibilité) + un quota (~19 %) de
   nombres à 5-6 chiffres, pour montrer que le critère tient même sur un grand
   nombre. Affichage groupé des grands nombres via `formatNombre` (#240).
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { bankByLevel, pickFromBank } from '../../core/level-combinators';
import { MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';
import { formatNombre } from '../../core/nombres';

const NIVEAUX: SchoolLevel[] = ['cm1'];

const OUI = 'Oui';
const NON = 'Non';

/* Diviseur interrogé (~1/3 chacun dans la banque). */
export type Diviseur = 2 | 5 | 10;

/* Formulation de l'énoncé : côté NOMBRE (« N divisible par d ? ») ou côté DIVISEUR
   (« d diviseur de N ? »). Le côté diviseur reste minoritaire (pont de vocabulaire). */
export type Cote = 'nombre' | 'diviseur';

/* Item de banque tagué par niveau (contrat de `bankByLevel`). La réponse est portée
   par `divisible` — CALCULÉE et STOCKÉE à la construction, jamais au `check`. */
export interface ItemDivisibilite {
	n: number;
	d: Diviseur;
	divisible: boolean;
	cote: Cote;
	levels: SchoolLevel[];
}

/* Test de divisibilité — utilisé UNIQUEMENT à la construction de la banque (pour
   calculer puis stocker la réponse). Exporté pour permettre au testeur de dériver
   ses attendus indépendamment. */
export const estDivisible = (n: number, d: number): boolean => n % d === 0;

/* Corrigé nommant les TROIS critères à chaque item (pas seulement celui interrogé),
   à partir du seul chiffre des unités. Le nombre est mis en forme groupée (#240). */
export function explicationDivisibilite(n: number): string {
	const u = n % 10;
	const nf = formatNombre(n);
	if (u === 0) {
		return `${nf} finit par 0 : divisible par 2, par 5 et par 10 (c'est vrai pour tout nombre qui finit par 0).`;
	}
	if (u === 5) {
		return `${nf} finit par 5 : divisible par 5, mais pas par 2 (il est impair) ni par 10 (il ne finit pas par 0).`;
	}
	if (u % 2 === 0) {
		return `${nf} finit par ${u} : divisible par 2 (il est pair), mais pas par 5 ni par 10 (il ne finit ni par 0 ni par 5).`;
	}
	return `${nf} finit par ${u} : ni divisible par 2 (il est impair), ni par 5, ni par 10 (il ne finit ni par 0 ni par 5).`;
}

/* ---------- Construction déterministe de la banque ----------
   Aucun aléa à l'import (la banque doit être IDENTIQUE d'un run à l'autre — corrigé
   imprimable #41, galerie #412) : les nombres sont fabriqués par un balayage
   déterministe. Chaque nombre = `prefixe × 10 + chiffre des unités`, où le chiffre
   des unités STEER l'appartenance oui/non (mais la réponse stockée est toujours
   recalculée par `estDivisible`, robuste à une éventuelle erreur de liste). */

// Chiffres des unités pilotant l'équilibre oui/non ET les cas frontière.
const UNITES_OUI: Record<Diviseur, number[]> = {
	2: [2, 4, 6, 8, 0], // pairs (dont 0 = frontière ÷2,5,10)
	5: [5, 0], // multiples de 5 (5 = ÷5 seul ; 0 = ÷2,5,10)
	10: [0], // seul 0
};
const UNITES_NON: Record<Diviseur, number[]> = {
	2: [1, 3, 5, 7, 9], // impairs (5 = piège « finit par 5 » ≠ ÷2)
	5: [1, 2, 3, 4, 6, 7, 8, 9], // ni 0 ni 5
	10: [1, 2, 3, 4, 5, 6, 7, 8, 9], // ≠ 0 (5 = piège « finit par 5 » ≠ ÷10)
};

// Préfixes de tête faisant varier la TAILLE. Petits (1-3 chiffres) → nombres 2-4
// chiffres (gros de la banque) ; grands (4-5 chiffres) → 5-6 chiffres.
const PREFIXES_PETITS = [
	1, 4, 7, 13, 26, 38, 52, 74, 95, 118, 234, 357, 461, 583, 606, 729, 840, 972,
];
const PREFIXES_GRANDS = [1240, 3571, 4806, 27509, 60318];

const PAR_GROUPE = 12; // 12 items par (diviseur × oui/non) → 12 oui + 12 non par diviseur
const PERIODE_GRAND_NOMBRE = 5; // 1 item sur 5 est un grand nombre (5-6 chiffres) → ~19 %
const PERIODE_COTE_DIVISEUR = 9; // 1 item sur 9 formulé « d est-il un diviseur de N ? »

/* Construit la banque complète (6 groupes : 3 diviseurs × oui/non → 72 items).
   Exporté pour les tests (dérivation d'attendus, vérification d'équilibre). */
export function construireBanqueDivisibilite(): ItemDivisibilite[] {
	const out: ItemDivisibilite[] = [];
	let k = 0; // compteur global (taille + formulation), garde la variété déterministe
	// Compteurs de préfixe DÉDIÉS (petits/grands) : chaque nombre consomme le préfixe
	// suivant de son pool. Indispensable pour que les groupes à unités peu variées
	// (d = 10, unités = {0}) produisent quand même des nombres DISTINCTS.
	let iPetit = 0;
	let iGrand = 0;
	const ajouter = (d: Diviseur, unites: number[]): void => {
		for (let i = 0; i < PAR_GROUPE; i++) {
			const u = unites[i % unites.length];
			const grand = k % PERIODE_GRAND_NOMBRE === 4; // ~19 % de grands nombres
			const prefixe = grand
				? PREFIXES_GRANDS[iGrand++ % PREFIXES_GRANDS.length]
				: PREFIXES_PETITS[iPetit++ % PREFIXES_PETITS.length];
			const n = prefixe * 10 + u;
			// Minorité côté diviseur, répartie sur les diviseurs.
			const cote: Cote = k % PERIODE_COTE_DIVISEUR === 4 ? 'diviseur' : 'nombre';
			out.push({ n, d, divisible: estDivisible(n, d), cote, levels: NIVEAUX });
			k++;
		}
	};
	ajouter(2, UNITES_OUI[2]);
	ajouter(2, UNITES_NON[2]);
	ajouter(5, UNITES_OUI[5]);
	ajouter(5, UNITES_NON[5]);
	ajouter(10, UNITES_OUI[10]);
	ajouter(10, UNITES_NON[10]);
	return out;
}

/* Banque taguée par niveau (#225) — premier usage réel de `bankByLevel`. */
export const BANQUE_DIVISIBILITE = bankByLevel(construireBanqueDivisibilite());

/* ---------- Fabrique d'ExerciseType ---------- */

const MODES: ModeOption[] = [MODE_QCM_POINT];

/* Construit l'Exercise QCM d'un item de banque. Réponse LUE dans l'item (jamais
   recalculée) ; choix fixes [Oui, Non] (positions stables — accessibilité). */
export function exerciceDivisibilite(item: ItemDivisibilite): Exercise {
	const nf = formatNombre(item.n);
	const question =
		item.cote === 'nombre'
			? `${nf} est-il divisible par ${item.d} ?`
			: `${item.d} est-il un diviseur de ${nf} ?`;
	return {
		type: 'qcm',
		question,
		answer: item.divisible ? OUI : NON,
		choices: [OUI, NON],
		explication: explicationDivisibilite(item.n),
	};
}

function divisibiliteType(): ExerciseType {
	return {
		levels: BANQUE_DIVISIBILITE.levels,
		modes: MODES,
		generate(opts?: GenerateOpts): Exercise {
			return exerciceDivisibilite(pickFromBank(BANQUE_DIVISIBILITE, opts?.level));
		},
		check: checkAnswer,
	};
}

/* Étend `LessonInput` pour porter l'exclusion du sprint (comme `DivisionLessonDef`). */
export interface DivisibiliteLessonDef extends LessonInput {
	excludeFromSprint?: boolean;
}

export const DIVISIBILITE_LESSONS: DivisibiliteLessonDef[] = [
	{
		id: 'math-divisibilite-2-5-10',
		label: 'Divisible par 2, 5 et 10',
		exerciseType: divisibiliteType(),
		// QCM oui/non devinable à 50 % : sous la pression du chrono, le sprint
		// récompenserait le spam → exclue du sprint (comme les QCM homophones/verbes).
		excludeFromSprint: true,
	},
];
