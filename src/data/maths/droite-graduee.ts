/* ============================================================
   Numération — placer un nombre sur la droite graduée (#256 CM1, #447 CE2).
   ------------------------------------------------------------
   Deux leçons sur la MÊME brique interactive (renderer core/figures/droite.ts,
   runner ui/lecon-droite-graduee.ts) : placer un ENTIER (CE2 et CM1, recalibrée par
   niveau) et placer un nombre DÉCIMAL (CM1 seul). L'enfant pose un repère sur la
   graduation qui correspond à la valeur demandée (interaction aimantée,
   auto-correction). Module PUR (aucun DOM).

   Modèle de rendu ARRÊTÉ (avis designer + pédagogue, #256) :
   - toujours une FENÊTRE zoomée d'une dizaine d'intervalles entre deux bornes rondes
     (jamais 0→N en entier) ;
   - on ne NUMÉROTE que 3 graduations majeures (les deux bornes + le milieu) ; les autres
     traits sont muets ; la cible tombe TOUJOURS sur une graduation NON numérotée (l'enfant
     doit compter les crans depuis un repère chiffré, jamais lire une étiquette).

   Plages ARRÊTÉES :
   - ENTIERS au CE2 (#447 — « savoir placer des nombres et repérer des points sur une
     demi-droite graduée », programme CE2 2025) : entiers SEULS, jamais au-delà de 10 000
     (les décimaux sont réservés au CM1) → fenêtre de 10 graduée en unités, fenêtre de 100
     graduée en dizaines. PAS de fenêtre de 1 000 ni de 10 000 (grands nombres = CM1) ;
   - ENTIERS au CM1 (grands nombres, ordre de grandeur varié d'un item à l'autre) : fenêtre
     de 100 graduée en dizaines, fenêtre de 1 000 graduée en centaines, fenêtre de 10 000
     graduée en milliers. La démarcation avec le CE2 se fait par les DEUX échelles
     supérieures, pas par la fenêtre de 100, que les deux niveaux partagent : à partir de
     1 100, une fenêtre de 100 du CM1 est aussi tirable au CE2 (choix assumé — c'est la même
     compétence, et le CM1 la revoit en la mêlant à des ordres de grandeur plus grands) ;
   - DÉCIMAUX (centièmes AU PLUS, borne dure du programme) : soit un intervalle [n ; n+1]
     gradué en dixièmes (chaque cran = 0,1), soit un ZOOM sur un seul dixième
     [n,d ; n,d+0,1] gradué en centièmes (chaque cran = 0,01) — JAMAIS [n ; n+1] gradué en
     100 (illisible).

   Représentation des décimaux : valeur en CENTIÈMES ENTIERS (comme src/data/maths/
   decimaux.ts) → positions et libellés exacts, aucune erreur de flottant. `afficheDecimal`
   dérive l'écriture à virgule (nombre de décimales NATUREL : « 3 », « 3,4 », « 3,47 »).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { calibrated } from '../../core/level-combinators';
import { valeursGraduations } from '../../core/figures/droite';
import type { LessonInput } from '../_shared';
import { choice, rnd } from '../../core/utils';
import { formatNombre } from '../../core/nombres';

/* Mode unique (comme « clique sur le mot » / l'appariement) : lancement direct du runner
   dédié, pas d'écran de choix de mode (#69). */
const MODE_PLACER: ModeOption[] = [
	{ id: 'placer', label: 'Je place le repère', recommended: true },
];

/* Un « fait » : la fenêtre (min/max/pas), les valeurs des graduations NUMÉROTÉES et la
   valeur CIBLE (∈ graduations non numérotées). Le formatage des libellés est porté à part
   (entier groupé vs décimal à virgule). */
interface FaitDroite {
	min: number;
	max: number;
	pas: number;
	bornesVals: number[];
	cible: number;
}

/* Indices de graduation candidats pour la cible : entre les deux bornes, MILIEU exclu
   (les 3 numérotées sont aux indices 0, 5 et 10). L'enfant compte donc toujours des crans
   depuis une graduation chiffrée. */
const INDICES_CIBLE = [1, 2, 3, 4, 6, 7, 8, 9] as const;

/* ---------- Entiers ----------
   Un GABARIT = une échelle de fenêtre : `largeur` (= 10 × `pas`, l'invariant « une dizaine
   d'intervalles ») et la plage des bornes basses, exprimée en multiples de la largeur
   (`kMin`..`kMax`) — la borne basse est ainsi TOUJOURS un multiple rond de la largeur, et
   `kMax` borne mécaniquement le plus grand nombre atteignable ((kMax + 1) × largeur). */
interface GabaritFenetre {
	pas: number;
	largeur: number;
	kMin: number;
	kMax: number;
}

/* CE2 (#447) : deux échelles seulement, toutes deux sous 10 000.
   - fenêtre de 10 graduée en UNITÉS : on compte des unités depuis une dizaine chiffrée.
     kMin = 2 pour éviter [0 ; 10] et [10 ; 20], où « compter les crans » se confond avec
     réciter les premiers nombres ; kMax = 99 → nombres de 21 à 999.
   - fenêtre de 100 graduée en DIZAINES : couvre les nombres à 3 et 4 chiffres jusqu'à
     9 900, soit toute la plage du programme CE2 sans jamais la dépasser.
   Chaque échelle porte ainsi sa propre plage de grandeurs : un item ne cumule pas « lire un
   nombre à 4 chiffres » ET « compter des unités une par une ». */
const GABARITS_CE2: readonly GabaritFenetre[] = [
	{ pas: 1, largeur: 10, kMin: 2, kMax: 99 }, // ex. [340 ; 350], graduée en unités
	{ pas: 10, largeur: 100, kMin: 1, kMax: 98 }, // ex. [3 200 ; 3 300], graduée en dizaines
];

/* CM1 (#256) : trois échelles d'ordre de grandeur croissant, jusqu'aux centaines de mille
   (le CE2, lui, ne dépasse pas 10 000). */
const GABARITS_CM1: readonly GabaritFenetre[] = [
	{ pas: 10, largeur: 100, kMin: 11, kMax: 98 }, // fenêtre de 100, graduée en dizaines
	{ pas: 100, largeur: 1000, kMin: 11, kMax: 98 }, // fenêtre de 1 000, graduée en centaines
	{ pas: 1000, largeur: 10000, kMin: 11, kMax: 98 }, // fenêtre de 10 000, graduée en milliers
];

/* Tire une fenêtre parmi les gabarits du niveau, puis la cible dans ses graduations
   muettes. Le milieu (indice 5) vaut min + largeur/2, toujours un multiple du pas. */
function faitEntiers(gabarits: readonly GabaritFenetre[]): FaitDroite {
	const gabarit = choice([...gabarits]);
	const min = rnd(gabarit.kMin, gabarit.kMax) * gabarit.largeur;
	const max = min + gabarit.largeur;
	const mid = min + gabarit.largeur / 2; // graduation d'indice 5 (bien un multiple du pas)
	const cible = min + choice([...INDICES_CIBLE]) * gabarit.pas;
	return { min, max, pas: gabarit.pas, bornesVals: [min, mid, max], cible };
}

/* ---------- Décimaux (dixièmes ou centièmes), en CENTIÈMES ENTIERS ---------- */
function faitDecimaux(): FaitDroite {
	if (choice([true, false])) {
		// Dixièmes : [n ; n+1] gradué en 10 → en centièmes, pas de 10 sur une fenêtre de 100.
		const n = rnd(1, 12);
		const min = n * 100;
		const cible = min + choice([...INDICES_CIBLE]) * 10;
		return { min, max: min + 100, pas: 10, bornesVals: [min, min + 50, min + 100], cible };
	}
	// Centièmes : ZOOM sur un seul dixième [n,d ; n,d+0,1] gradué en 10 → pas de 1 centième
	// sur une fenêtre de 10 centièmes.
	const min = rnd(1, 9) * 100 + rnd(0, 9) * 10;
	const cible = min + choice([...INDICES_CIBLE]);
	return { min, max: min + 10, pas: 1, bornesVals: [min, min + 5, min + 10], cible };
}

/* Écriture à virgule d'une valeur en CENTIÈMES, avec le nombre NATUREL de décimales :
   « 3 » (entier), « 3,4 » (dixième exact), « 3,47 » (centième). Jamais de point. */
function afficheDecimal(centiemes: number): string {
	const ent = Math.floor(centiemes / 100);
	const frac = centiemes % 100;
	if (frac === 0) return String(ent);
	if (frac % 10 === 0) return `${ent},${frac / 10}`;
	return `${ent},${String(frac).padStart(2, '0')}`;
}

/* Construit l'Exercise « droite graduée » depuis un fait + un formateur de libellé.
   `graduations` = TOUTES les valeurs (pour l'axe et les aria-labels des radios) ;
   `bornes` = le sous-ensemble numéroté ; `cibleLabel` = l'écriture de la cible. */
function construireExercice(f: FaitDroite, format: (v: number) => string): Exercise {
	const graduations = valeursGraduations(f.min, f.max, f.pas).map((valeur) => ({
		valeur,
		label: format(valeur),
	}));
	const bornes = f.bornesVals.map((valeur) => ({ valeur, label: format(valeur) }));
	const cibleLabel = format(f.cible);
	// Explication après correction : borne chiffrée juste avant la cible + nombre de crans.
	const borneInf = Math.max(...f.bornesVals.filter((v) => v <= f.cible));
	const crans = Math.round((f.cible - borneInf) / f.pas);
	const pasLabel = format(f.pas);
	const explication =
		`Chaque graduation vaut ${pasLabel}. ` +
		`${cibleLabel} se place ${crans} ${crans > 1 ? 'graduations' : 'graduation'} après ${format(borneInf)}.`;
	const consigne = `Place le nombre ${cibleLabel} sur la droite graduée.`;
	return {
		type: 'droiteGraduee',
		min: f.min,
		max: f.max,
		pas: f.pas,
		graduations,
		bornes,
		cible: f.cible,
		cibleLabel,
		consigne,
		explication,
		parle: consigne,
		pasLabel,
	};
}

/* Fabrique d'`ExerciseType`. `check` renvoie toujours false : le runner dédié
   (ui/lecon-droite-graduee.ts) corrige par « graduation choisie === cible ». Le repli
   non interactif (bilan/révision/impression) est produit par genLessonItem (core/catalog),
   qui montre la droite avec le repère à la cible et demande de LIRE le nombre. */
function droiteType(
	genFait: () => FaitDroite,
	format: (v: number) => string,
	/* Niveaux déclarés par CE type. Omis dans la branche multi-niveaux (#447) : c'est alors
	   `calibrated` qui expose l'union des clés de sa table, et ce champ serait ignoré. */
	niveaux?: SchoolLevel[],
): ExerciseType {
	const type: ExerciseType = {
		modes: MODE_PLACER,
		consigne: 'Écris le nombre repéré sur la droite graduée.',
		exerciseKind: 'droiteGraduee',
		generate: () => construireExercice(genFait(), format),
		check: () => false,
	};
	if (niveaux) type.levels = niveaux;
	return type;
}

/* Le format des décimaux est utilisé par le repli du catalogue (via l'Exercise, qui porte
   déjà les libellés). On expose la fenêtre de génération sous forme de fabriques. */
export interface DroiteLessonInput extends LessonInput {
	rubrique?: string;
}

/* ---------- Étayage de la notion (#490) ----------
   Trois pas, jamais plus : placer un nombre n'est pas une accumulation (comme une grille
   qui se remplit) mais une décision, quasi immédiate une fois l'échelle comprise. Ce que
   l'exemple doit installer, c'est donc l'ORDRE du raisonnement — ce que vaut un cran,
   d'où l'on part, combien de sauts — et non un enchaînement de gestes.

   Exemples FIXES, comme partout ailleurs, et choisis pour ne pas être des cas dégénérés :
   la cible tombe sur une graduation muette, à plusieurs crans d'une borne chiffrée, dans
   une fenêtre où le pas ne vaut pas 1 par hasard. */
const ETAYAGE_REGLE =
	"Avant de compter, regarde ce que vaut UNE graduation : ce n'est pas toujours 1.";

export const DROITE_GRADUEE_LESSONS: DroiteLessonInput[] = [
	{
		id: 'num-droite-entiers',
		label: 'Je place un nombre sur la droite graduée',
		// Multi-niveaux « calibré » (#225, #447) : MÊME leçon, même id, même geste — seules les
		// échelles de fenêtre changent (CE2 : 10 et 100, sous 10 000 ; CM1 : 100, 1 000 et
		// 10 000). Aligné sur les leçons de numération voisines (num-comparer,
		// num-encadrer-intercaler, num-valeur-position…), plutôt qu'un second id CE2 qui
		// dupliquerait le libellé et ferait perdre sa progression à l'enfant passé au CM1.
		exerciseType: calibrated<readonly GabaritFenetre[]>(
			{ ce2: GABARITS_CE2, cm1: GABARITS_CM1 },
			(gabarits) => droiteType(() => faitEntiers(gabarits), formatNombre),
		),
		// Fenêtre [340 ; 350] graduée en unités, cible 347 : deux crans après le milieu
		// chiffré (345), donc un comptage court mais réel, et une échelle qui se déduit.
		etayage: [
			{
				contenu: {
					titre: 'Placer un nombre sur la droite graduée',
					regle: ETAYAGE_REGLE,
					exemple: {
						moteur: 'droite',
						spec: {
							min: 340,
							max: 350,
							pas: 1,
							bornes: [
								{ valeur: 340, label: '340' },
								{ valeur: 345, label: '345' },
								{ valeur: 350, label: '350' },
							],
							cible: 347,
							cibleLabel: '347',
							pasLabel: '1',
						},
					},
				},
			},
		],
	},
	{
		id: 'num-droite-decimaux',
		label: 'Je place un nombre décimal sur la droite graduée',
		// Décimaux : CM1 seul (borne dure du programme, le CE2 reste aux entiers).
		exerciseType: droiteType(faitDecimaux, afficheDecimal, ['cm1']),
		rubrique: 'Nombres décimaux',
		// Fenêtre [3 ; 4] graduée en dixièmes (valeurs en CENTIÈMES entiers, comme le
		// générateur), cible 3,7 : c'est ici que « une graduation ne vaut pas 1 » se joue.
		etayage: [
			{
				contenu: {
					titre: 'Placer un nombre décimal sur la droite graduée',
					regle: ETAYAGE_REGLE,
					exemple: {
						moteur: 'droite',
						spec: {
							min: 300,
							max: 400,
							pas: 10,
							bornes: [
								{ valeur: 300, label: '3' },
								{ valeur: 350, label: '3,5' },
								{ valeur: 400, label: '4' },
							],
							cible: 370,
							cibleLabel: '3,7',
							pasLabel: '0,1',
						},
					},
				},
			},
		],
	},
];
