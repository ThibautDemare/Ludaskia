/* ============================================================
   Calcul mental CM1 — Ordre de grandeur d'un produit (#250).
   ------------------------------------------------------------
   UNE leçon QCM « dans quelle classe tombe le résultat ? » : « 48 × 21, le résultat
   sera… » → 3 choix libellés par CLASSE de nombres + nombre de chiffres (« dans les
   centaines (3 chiffres) » / « dans les milliers (4 chiffres) » / …), espacés d'un
   facteur 10. Multiplication uniquement, opérandes à 1-2 chiffres. On N'utilise PAS le
   format « juger la vraisemblance d'un résultat proposé » (écarté pour ce lot).

   Formulation par APPARTENANCE de classe (nombre de chiffres), PAS par proximité :
   dire « 74 × 81, c'est à peu près 1000 » serait faux (5994 ≈ 6000), tandis que
   « 5994 est un nombre à 4 chiffres, donc dans les milliers » est exact et sans
   ambiguïté. Le vocabulaire de classe (centaines, milliers, dizaines de mille) reprend
   celui de la numération CM1 (cf. `position.ts` / leçon `num-decompose-10000`).

   Banque CM1-only construite via `bankByLevel` (#225) : chaque item porte
   `levels: ['cm1']`, le catalogue en dérive `LessonDef.levels`.

   INVARIANT PROJET : l'ordre correct est CALCULÉ puis STOCKÉ dans l'item à la
   construction, jamais recalculé au `check` (qui compare le choix à la valeur
   stockée).

   ---- Règle d'admissibilité (calibrage des distracteurs, point sensible de l'issue) ----
   L'espacement ×10 entre les 3 choix est VOULU (on ne le resserre pas). On définit
   l'« ordre de grandeur » d'un nombre par son NOMBRE DE CHIFFRES :
   `ordreDeGrandeur(x) = 10^(nombre de chiffres de x − 1)` (la plus grande puissance de
   10 ≤ x). Comme la réponse est une CLASSE (nombre de chiffres) et NON une proximité,
   il n'y a pas de « zone charnière » à fuir : 5994 est sans ambiguïté « dans les
   milliers » (4 chiffres), même à un chiffre de basculer. Un couple (a, b) est retenu
   ssi les DEUX conditions tiennent :
   1. `ordre = ordreDeGrandeur(a × b)` est ≥ 100 (réponse sur centaines/milliers ;
      pas de « dizaines » en réponse, peu parlant) ;
   2. l'estimation `arrondiChiffreSignificatif(a) × arrondiChiffreSignificatif(b)` a la
      MÊME classe que le produit réel — c'est la méthode enseignée (arrondir chaque
      opérande à son chiffre significatif puis multiplier) : on n'admet que les couples
      où appliquer correctement la méthode donne la bonne classe (ex. 32×32 = 1024 est
      ÉCARTÉ car 30×30 = 900 tomberait dans les centaines, pas les milliers — vrai piège).
   L'exemple canonique de l'issue, 48 × 21 = 1008 (arrondi 50×20 = 1000), est admis.
   Avec des opérandes à 1-2 chiffres (produit ≤ 9801), l'ordre stocké vaut donc toujours
   100 ou 1000 ; les libellés « dizaines » et « dizaines de mille » ne sont que des
   DISTRACTEURS (fenêtre ×10).
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { bankByLevel, pickFromBank } from '../../core/level-combinators';
import { etayageRedige, MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';
import { sample } from '../../core/utils';

const NIVEAUX: SchoolLevel[] = ['cm1'];

/* Item de banque tagué par niveau. `ordre` = puissance de 10 STOCKÉE (la réponse). */
export interface ItemOrdreGrandeur {
	a: number;
	b: number;
	ordre: number;
	levels: SchoolLevel[];
}

/* Arrondit un entier à son chiffre significatif de tête (48 → 50, 21 → 20, 34 → 30,
   6 → 6, 55 → 60). Exporté pour dériver les attendus dans les tests. */
export function arrondiChiffreSignificatif(n: number): number {
	if (n < 10) return n;
	const p = Math.pow(10, String(n).length - 1);
	return Math.round(n / p) * p;
}

/* Ordre de grandeur d'un entier positif : plus grande puissance de 10 ≤ x
   (= 10^(nombre de chiffres − 1)). Ex. 204 → 100, 1008 → 1000. */
export function ordreDeGrandeur(x: number): number {
	return Math.pow(10, String(Math.trunc(x)).length - 1);
}

/* Classe (ordre de grandeur) stockée d'un couple (a, b) SI le couple est admissible
   (cf. règle d'admissibilité en tête), sinon `null`. Exporté pour les tests. */
export function ordreGrandeurProduit(a: number, b: number): number | null {
	const produit = a * b;
	const ordre = ordreDeGrandeur(produit);
	if (ordre < 100) return null; // réponse sur centaines / milliers (pas de « dizaines »)
	const estimation = arrondiChiffreSignificatif(a) * arrondiChiffreSignificatif(b);
	if (ordreDeGrandeur(estimation) !== ordre) return null; // arrondir changerait de classe → vrai piège, écarté
	return ordre;
}

/* ---------- Construction déterministe de la banque ----------
   Balayage déterministe (aucun aléa à l'import : corrigé imprimable #41, galerie
   #412) de tous les couples a ≤ b (opérandes 2..99), filtrés par la règle de
   frontière, répartis en deux seaux (ordre 100 / 1000) puis échantillonnés de façon
   ÉTALÉE (par produit croissant) pour varier les tailles d'opérandes. */
const OPERANDE_MIN = 2;
const OPERANDE_MAX = 99;
const PAR_ORDRE = 40; // cible par seau → ~80 items (fourchette projet 50-100)

/* Échantillon réparti (sans aléa) : jusqu'à `n` éléments espacés régulièrement. */
function echantillonReparti<T>(arr: T[], n: number): T[] {
	if (arr.length <= n) return arr;
	const out: T[] = [];
	for (let i = 0; i < n; i++) {
		out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
	}
	return out;
}

/* Construit la banque complète. Exporté pour les tests. */
export function construireBanqueOrdreGrandeur(): ItemOrdreGrandeur[] {
	const cent: ItemOrdreGrandeur[] = [];
	const mille: ItemOrdreGrandeur[] = [];
	for (let a = OPERANDE_MIN; a <= OPERANDE_MAX; a++) {
		for (let b = a; b <= OPERANDE_MAX; b++) {
			const ordre = ordreGrandeurProduit(a, b);
			if (ordre === null) continue;
			(ordre === 100 ? cent : mille).push({ a, b, ordre, levels: NIVEAUX });
		}
	}
	// Tri par produit croissant : l'échantillon étalé couvre alors tout le spectre
	// de tailles (petits × grands opérandes), plutôt que d'empiler les mêmes formes.
	const parProduit = (x: ItemOrdreGrandeur, y: ItemOrdreGrandeur): number =>
		x.a * x.b - y.a * y.b || x.a - y.a;
	cent.sort(parProduit);
	mille.sort(parProduit);
	return [...echantillonReparti(cent, PAR_ORDRE), ...echantillonReparti(mille, PAR_ORDRE)];
}

/* Banque taguée par niveau (#225). */
export const BANQUE_ORDRE_GRANDEUR = bankByLevel(construireBanqueOrdreGrandeur());

/* ---------- Fabrique d'ExerciseType ---------- */

const MODES: ModeOption[] = [MODE_QCM_POINT];

/* Nom de la classe d'un nombre depuis sa valeur d'ordre (puissance de 10) : le mot de
   classe de la numération CM1. Ex. 1000 → « milliers ». Le vocabulaire (« dizaines de
   mille ») reprend celui de `position.ts` / `numeration.ts`. */
const NOM_CLASSE: Record<number, string> = {
	10: 'dizaines',
	100: 'centaines',
	1000: 'milliers',
	10000: 'dizaines de mille',
};

/* Libellé d'un choix / de la réponse : « dans les <classe> (<n> chiffres) ». Le mot de
   classe + le nombre de chiffres désamorcent toute lecture en « à peu près » (la réponse
   est une CLASSE, pas une proximité). */
function libelleClasse(ordre: number): string {
	return `dans les ${NOM_CLASSE[ordre]} (${String(ordre).length} chiffres)`;
}

/* Corrigé : rappelle la méthode (arrondir → multiplier) et conclut sur la CLASSE par le
   nombre de chiffres du résultat exact — évite de faire croire que le produit « vaut » la
   puissance de 10 (il en a juste la classe). */
function explicationOrdre(a: number, b: number, ordre: number): string {
	const ra = arrondiChiffreSignificatif(a);
	const rb = arrondiChiffreSignificatif(b);
	const arrondis: string[] = [];
	if (ra !== a) arrondis.push(`${a} → ${ra}`);
	if (rb !== b) arrondis.push(`${b} → ${rb}`);
	const debut = arrondis.length ? `on arrondit (${arrondis.join(', ')}) puis ` : '';
	return `Pour estimer ${a} × ${b}, ${debut}on calcule ${ra} × ${rb} = ${ra * rb}. Le résultat exact (${a * b}) est un nombre à ${String(ordre).length} chiffres : il est donc dans les ${NOM_CLASSE[ordre]}.`;
}

/* Trois choix = fenêtre ×10 centrée sur l'ordre { ordre/10, ordre, ordre×10 }, libellés
   par classe et mélangés (position non prédictible). */
function choixOrdre(ordre: number): string[] {
	return sample([ordre / 10, ordre, ordre * 10].map(libelleClasse), 3);
}

/* Construit l'Exercise QCM d'un item. Réponse LUE dans l'item (jamais recalculée). */
export function exerciceOrdreGrandeur(item: ItemOrdreGrandeur): Exercise {
	return {
		type: 'qcm',
		question: `${item.a} × ${item.b}, le résultat sera…`,
		answer: libelleClasse(item.ordre),
		choices: choixOrdre(item.ordre),
		explication: explicationOrdre(item.a, item.b, item.ordre),
		// TTS : question lue à voix haute (le calcul symbolique reste à l'écran). On
		// parle de « nombre de chiffres » et non de « classe » — le mot « classe » a un
		// sens précis en numération (groupes de 3 chiffres) qu'on ne veut pas surcharger.
		parle: `Le résultat de ${item.a} × ${item.b} sera un nombre à combien de chiffres ?`,
	};
}

function ordreGrandeurType(): ExerciseType {
	return {
		levels: BANQUE_ORDRE_GRANDEUR.levels,
		modes: MODES,
		generate(opts?: GenerateOpts): Exercise {
			return exerciceOrdreGrandeur(pickFromBank(BANQUE_ORDRE_GRANDEUR, opts?.level));
		},
		check: checkAnswer,
	};
}

export const ORDRE_GRANDEUR_LESSONS: LessonInput[] = [
	{
		id: 'math-ordre-grandeur-produit',
		label: "Ordre de grandeur d'un produit",
		exerciseType: ordreGrandeurType(),
		// Le 1ᵉʳ pas dit ce que la leçon demande VRAIMENT (une taille, pas un résultat) :
		// l'enfant qui pose l'opération en entier ne se trompe pas de calcul, il se trompe
		// de tâche — et il y passe trois fois plus de temps pour rien.
		etayage: [
			etayageRedige(
				"L'ordre de grandeur d'un produit",
				'On ne cherche pas le résultat exact, seulement sa TAILLE : combien de chiffres aura-t-il ?',
				[
					'Arrondis chaque nombre à la dizaine : 58 devient 60, et 35 monte à 40.',
					'Multiplie les arrondis sans leurs zéros : 4 × 6 = 24, puis remets les zéros, donc 2 400.',
					'Compte les chiffres du résultat : 2 400 en a 4, on est donc dans les milliers.',
				],
			),
		],
	},
];
