/* ============================================================
   Numération — placer un nombre sur la droite graduée (#256, CM1).
   ------------------------------------------------------------
   Deux leçons CM1 sur la MÊME brique interactive (renderer core/figures/droite.ts,
   runner ui/lecon-droite-graduee.ts) : placer un ENTIER (grands nombres) et placer un
   nombre DÉCIMAL. L'enfant pose un repère sur la graduation qui correspond à la valeur
   demandée (interaction aimantée, auto-correction). Module PUR (aucun DOM).

   Modèle de rendu ARRÊTÉ (avis designer + pédagogue, #256) :
   - toujours une FENÊTRE zoomée d'une dizaine d'intervalles entre deux bornes rondes
     (jamais 0→N en entier) ;
   - on ne NUMÉROTE que 3 graduations majeures (les deux bornes + le milieu) ; les autres
     traits sont muets ; la cible tombe TOUJOURS sur une graduation NON numérotée (l'enfant
     doit compter les crans depuis un repère chiffré, jamais lire une étiquette).

   Plages ARRÊTÉES (programme CM1) :
   - ENTIERS (démarquer du CE2 → grands nombres, ordre de grandeur varié d'un item à
     l'autre) : fenêtre de 100 graduée en dizaines, fenêtre de 1 000 graduée en centaines,
     fenêtre de 10 000 graduée en milliers ;
   - DÉCIMAUX (centièmes AU PLUS, borne dure du programme) : soit un intervalle [n ; n+1]
     gradué en dixièmes (chaque cran = 0,1), soit un ZOOM sur un seul dixième
     [n,d ; n,d+0,1] gradué en centièmes (chaque cran = 0,01) — JAMAIS [n ; n+1] gradué en
     100 (illisible).

   Représentation des décimaux : valeur en CENTIÈMES ENTIERS (comme src/data/maths/
   decimaux.ts) → positions et libellés exacts, aucune erreur de flottant. `afficheDecimal`
   dérive l'écriture à virgule (nombre de décimales NATUREL : « 3 », « 3,4 », « 3,47 »).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
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

/* ---------- Entiers (grands nombres) ----------
   Trois gabarits d'ordre de grandeur croissant ; tiré au hasard par item pour varier. */
function faitEntiers(): FaitDroite {
	const gabarit = choice([
		{ pas: 10, largeur: 100 }, // fenêtre de 100, graduée en dizaines (ex. [3200 ; 3300])
		{ pas: 100, largeur: 1000 }, // fenêtre de 1 000, graduée en centaines (ex. [45 000 ; 46 000])
		{ pas: 1000, largeur: 10000 }, // fenêtre de 10 000, graduée en milliers (ex. [230 000 ; 240 000])
	]);
	const min = rnd(11, 98) * gabarit.largeur;
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
	const explication =
		`Chaque graduation vaut ${format(f.pas)}. ` +
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
	};
}

/* Fabrique d'`ExerciseType`. `check` renvoie toujours false : le runner dédié
   (ui/lecon-droite-graduee.ts) corrige par « graduation choisie === cible ». Le repli
   non interactif (bilan/révision/impression) est produit par genLessonItem (core/catalog),
   qui montre la droite avec le repère à la cible et demande de LIRE le nombre. */
function droiteType(genFait: () => FaitDroite, format: (v: number) => string): ExerciseType {
	return {
		modes: MODE_PLACER,
		consigne: 'Écris le nombre repéré sur la droite graduée.',
		exerciseKind: 'droiteGraduee',
		levels: ['cm1'],
		generate: () => construireExercice(genFait(), format),
		check: () => false,
	};
}

/* Le format des décimaux est utilisé par le repli du catalogue (via l'Exercise, qui porte
   déjà les libellés). On expose la fenêtre de génération sous forme de fabriques. */
export interface DroiteLessonInput extends LessonInput {
	rubrique?: string;
}

export const DROITE_GRADUEE_LESSONS: DroiteLessonInput[] = [
	{
		id: 'num-droite-entiers',
		label: 'Je place un nombre sur la droite graduée',
		exerciseType: droiteType(faitEntiers, formatNombre),
	},
	{
		id: 'num-droite-decimaux',
		label: 'Je place un nombre décimal sur la droite graduée',
		exerciseType: droiteType(faitDecimaux, afficheDecimal),
		rubrique: 'Nombres décimaux',
	},
];
