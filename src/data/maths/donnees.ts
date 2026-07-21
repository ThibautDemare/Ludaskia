/* ============================================================
   Organisation et gestion de données — LIRE un graphique / tableau (#257, CM1).
   ------------------------------------------------------------
   Deux leçons CM1 de LECTURE de données, en SAISIE chiffrée (aucun runner dédié : de
   simples exercices `text` portant une `figure`, qui routent vers le chemin de saisie
   générique du catalogue) :
   - `donnees-barres-lire` : lire la hauteur d'une barre sur un axe gradué ;
   - `donnees-tableau-lire` : lire une cellule d'un tableau à double entrée (ligne × colonne).
   Module PUR (aucun DOM) : les figures sont décrites par données via `renderFigure`.

   Calibrage CM1 (programme 2025 §4.1 « Lire et interpréter les données d'un tableau à
   double entrée / d'un diagramme en barres » ; avis pédagogue) : petites valeurs (≤ 50), pas
   d'axe ∈ {1, 2, 5, 10} pour que les sommets tombent PILE sur une graduation (4 à 6
   graduations), 4-6 barres, 3-4 colonnes × 3-4 lignes. Générateurs déterministes
   (rnd/choice/sample via `randFloat`).
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import type { LessonInput } from '../_shared';
import { renderFigure } from '../../core/figures';
import { checkNumerique } from '../../core/check-helpers';
import { choice, rnd, sample, elisionDe } from '../../core/utils';

/* Prénoms courts (≤ 5 lettres) : tiennent horizontalement sous une barre étroite et dans un
   en-tête de ligne étroit. Banque large pour éviter les répétitions d'un item à l'autre. */
const PRENOMS = [
	'Emma',
	'Léa',
	'Tom',
	'Zoé',
	'Hugo',
	'Jade',
	'Noah',
	'Lou',
	'Théo',
	'Enzo',
	'Lina',
	'Anna',
	'Léo',
	'Rose',
	'Adam',
	'Inès',
	'Nour',
	'Maël',
] as const;

/* Majuscule initiale (en-tête de colonne du tableau) — gère l'accent (« étoiles » → « É… »). */
function cap(mot: string): string {
	return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/* ---------- Leçon 1 : diagramme en barres ----------
   Objets possédables/collectionnables (consigne « Combien de {objet} a {prénom} ? »). */
const OBJETS_BARRES = [
	'billes',
	'cartes',
	'images',
	'autocollants',
	'bonbons',
	'coquillages',
	'timbres',
	'gommettes',
	'perles',
	'jetons',
	'crayons',
	'ballons',
] as const;

/* Échelles ARRÊTÉES : pas ∈ {1, 2, 5, 10}, valeur max de l'axe petite (≤ 50) et multiple du
   pas → 4 à 6 graduations au-dessus de 0 (max/pas ≤ 6). Plafond à 6 pour un espacement
   vertical confortable des étiquettes (≥ ~20 unités de viewBox à police 16 ; pas de
   chevauchement) et une lecture non ambiguë. */
const ECHELLES = [
	{ pas: 1, maxs: [5, 6] },
	{ pas: 2, maxs: [8, 10, 12] },
	{ pas: 5, maxs: [20, 25, 30] },
	{ pas: 10, maxs: [40, 50] },
] as const;

/* Valeurs des barres : multiples du pas dans [pas ; max] (chaque barre au moins d'une
   graduation, visible), avec au moins DEUX valeurs distinctes (diagramme jamais plat). */
function valeursBarres(n: number, pas: number, max: number): number[] {
	const nGrad = Math.round(max / pas);
	const vals = Array.from({ length: n }, () => rnd(1, nGrad) * pas);
	if (new Set(vals).size < 2) vals[0] = vals[1] === max ? max - pas : vals[1] + pas;
	return vals;
}

function genererBarres(): Exercise {
	const objet = choice([...OBJETS_BARRES]);
	const echelle = choice([...ECHELLES]);
	const max = choice([...echelle.maxs]);
	const n = rnd(4, 6);
	const prenoms = sample([...PRENOMS], n);
	const valeurs = valeursBarres(n, echelle.pas, max);
	const barres = prenoms.map((label, i) => ({ label, valeur: valeurs[i] }));
	const cible = rnd(0, n - 1);
	const titre = `Nombre ${elisionDe(objet)}`;
	const consigne = `Combien ${elisionDe(objet)} a ${prenoms[cible]} ?`;
	return {
		type: 'text',
		question: `${consigne} @`,
		answer: String(valeurs[cible]),
		figure: renderFigure({ kind: 'diagrammeBarres', titre, barres, pas: echelle.pas, max }),
		parle: consigne,
	};
}

/* ---------- Leçon 2 : tableau à double entrée ----------
   Lignes = élèves (prénoms), colonnes = objets d'un thème. Consigne « Combien de {objet}
   pour {ligne} ? » → croisement ligne × colonne. */
const THEMES_TABLEAU = [
	{ caption: 'Objets ramassés à la plage', objets: ['coquillages', 'galets', 'crabes'] },
	{ caption: 'Fruits mangés cette semaine', objets: ['pommes', 'bananes', 'kiwis', 'fraises'] },
	{ caption: 'Livres lus ce mois-ci', objets: ['bandes dessinées', 'romans', 'albums'] },
	{
		caption: 'Cartes de la collection',
		objets: ['cartes rouges', 'cartes bleues', 'cartes vertes'],
	},
	{ caption: 'Goûters de la semaine', objets: ['pommes', 'yaourts', 'biscuits'] },
] as const;

function genererTableau(): Exercise {
	const theme = choice([...THEMES_TABLEAU]);
	const objets = theme.objets; // 3 ou 4 colonnes (toutes utilisées)
	const nLignes = rnd(3, 4);
	const prenoms = sample([...PRENOMS], nLignes);
	const lignes = prenoms.map((entete) => ({
		entete,
		valeurs: objets.map(() => rnd(1, 15)),
	}));
	const cibleLigne = rnd(0, nLignes - 1);
	const cibleCol = rnd(0, objets.length - 1);
	const consigne = `Combien ${elisionDe(objets[cibleCol])} pour ${prenoms[cibleLigne]} ?`;
	return {
		type: 'text',
		question: `${consigne} @`,
		answer: String(lignes[cibleLigne].valeurs[cibleCol]),
		figure: renderFigure({
			kind: 'tableauDonnees',
			caption: theme.caption,
			colonnes: objets.map(cap),
			lignes,
			coinLabel: 'Élève',
		}),
		parle: consigne,
	};
}

/* ExerciseType mono-mode de saisie (pas d'écran de choix de mode, #69) : rendu fiche/bilan/
   sprint/révision via le chemin saisie du catalogue. `consigne` NOMME la tâche (en-tête de
   fiche + bouton « Écouter » de la fiche, #42) et est propre à chaque leçon. `check` =
   correction numérique générique (tolère les espaces de groupement de la saisie). */
function donneesType(generate: () => Exercise, consigne: string): ExerciseType {
	return {
		levels: ['cm1'],
		consigne,
		generate,
		check: checkNumerique,
	};
}

export const DONNEES_LESSONS: LessonInput[] = [
	{
		id: 'donnees-barres-lire',
		label: 'Je lis un diagramme en barres',
		exerciseType: donneesType(
			genererBarres,
			'Lis le diagramme en barres et réponds à la question.',
		),
	},
	{
		id: 'donnees-tableau-lire',
		label: 'Je lis un tableau à double entrée',
		exerciseType: donneesType(genererTableau, 'Lis le tableau et réponds à la question.'),
	},
];
