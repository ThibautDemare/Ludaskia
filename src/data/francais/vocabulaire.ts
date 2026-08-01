/* ============================================================
   Données + moteur des leçons de Vocabulaire (#108).
   ------------------------------------------------------------
   Première leçon : « Ordre alphabétique ». L'enfant range 4 à 5 mots
   mélangés dans l'ordre alphabétique (interaction tuiles, runner
   ui/lecon-ordre.ts). La bonne suite est TOUJOURS calculée par tri
   (`localeCompare` français), jamais codée en dur.

   Deux niveaux de progression = deux leçons distinctes :
   - 1re lettre : des mots dont les premières lettres sont toutes
     différentes (le tri se joue sur l'initiale) ;
   - 2e lettre : des mots qui commencent par la même lettre et dont la
     2e lettre diffère (le tri se joue sur la deuxième lettre).

   Convention de données : noms communs CE2 courants, en minuscules et au
   singulier ; aucune métadonnée — un simple tableau de chaînes suffit.
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import { choice, sample, normalizeText, melangerDifferemment } from '../../core/utils';
import type { LessonInput } from '../_shared';

/* Pool de noms communs pour le tri par 1re lettre. On pioche des INITIALES
   toutes différentes (une par lettre), puis un mot au hasard pour chacune :
   le rangement se joue donc bien sur la première lettre. */
const POOL_INITIALE: string[] = [
	'arbre',
	'avion',
	'ananas',
	'ballon',
	'banane',
	'bateau',
	'cahier',
	'carotte',
	'cerise',
	'dauphin',
	'danse',
	'doigt',
	'école',
	'étoile',
	'escargot',
	'fleur',
	'fraise',
	'fromage',
	'gâteau',
	'girafe',
	'gomme',
	'hibou',
	'herbe',
	'histoire',
	'igloo',
	'image',
	'île',
	'jardin',
	'jouet',
	'journal',
	'lapin',
	'livre',
	'lune',
	'maison',
	'montagne',
	'mouton',
	'nuage',
	'neige',
	'nid',
	'orange',
	'oiseau',
	'ours',
	'papillon',
	'pomme',
	'panier',
	'robot',
	'renard',
	'rivière',
	'soleil',
	'singe',
	'souris',
	'tortue',
	'table',
	'tigre',
	'vélo',
	'vache',
	'voiture',
];

/* Groupes de mots partageant la 1re lettre mais dont la 2e lettre DIFFÈRE :
   ainsi le tri alphabétique de tout le groupe se joue sans ambiguïté sur la
   deuxième lettre (pas besoin de regarder plus loin).
   #285 (variété) : groupes d/g/l/r/v ajoutés et groupes existants étoffés ; dans
   chaque groupe, toutes les 2es lettres restent distinctes (cf. annotations). */
const GROUPES_DEUXIEME: string[][] = [
	['ballon', 'berger', 'bicyclette', 'bonbon', 'brosse', 'bulle'], // b : a e i o r u
	['cabane', 'ceinture', 'chien', 'citron', 'classe', 'crayon', 'cuisine'], // c : a e h i l r u
	['dauphin', 'dent', 'dindon', 'doigt', 'drapeau', 'dune'], // d : a e i o r u
	['facteur', 'fenêtre', 'fil', 'fleur', 'forêt', 'fruit', 'fumée'], // f : a e i l o r u
	['gare', 'genou', 'girafe', 'gomme', 'grenouille', 'guitare'], // g : a e i o r u
	['lac', 'lettre', 'lion', 'loup', 'lune'], // l : a e i o u
	['maison', 'melon', 'midi', 'moto', 'mur'], // m : a e i o u
	['panier', 'peigne', 'pirate', 'plume', 'pomme', 'prince', 'puzzle'], // p : a e i l o r u
	['rat', 'renard', 'rideau', 'robot', 'rue'], // r : a e i o u
	['sac', 'seau', 'singe', 'soleil', 'stylo', 'sucre'], // s : a e i o t u
	['table', 'tente', 'timbre', 'tomate', 'train', 'tulipe'], // t : a e i o r u
	['vache', 'vent', 'ville', 'voiture', 'vue'], // v : a e i o u
];

/* Tri alphabétique français (gère les accents : é ≈ e). */
export const trierAlpha = (mots: string[]): string[] =>
	[...mots].sort((a, b) => a.localeCompare(b, 'fr'));

const nbMots = (): number => choice([4, 5]);
const CONSIGNE = "Range ces mots dans l'ordre alphabétique.";

/* Niveau 1 — tri par 1re lettre : initiales toutes différentes. */
function genNiveau1(): Exercise {
	const parInitiale = new Map<string, string[]>();
	for (const mot of POOL_INITIALE) {
		const k = mot[0];
		const liste = parInitiale.get(k);
		if (liste) liste.push(mot);
		else parInitiale.set(k, [mot]);
	}
	const initiales = sample([...parInitiale.keys()], nbMots());
	const mots = initiales.map((k) => choice(parInitiale.get(k)!));
	const ordre = trierAlpha(mots);
	return { type: 'tuilesOrdre', question: CONSIGNE, tuiles: melangerDifferemment(ordre), ordre };
}

/* Niveau 2 — tri par 2e lettre : mots à 1re lettre commune. */
function genNiveau2(): Exercise {
	const groupe = choice(GROUPES_DEUXIEME);
	const n = Math.min(nbMots(), groupe.length);
	const mots = sample(groupe, n);
	const ordre = trierAlpha(mots);
	const question = `Ces mots commencent par la même lettre. ${CONSIGNE}`;
	return { type: 'tuilesOrdre', question, tuiles: melangerDifferemment(ordre), ordre };
}

/* Fabrique un ExerciseType mono-mode « tuiles » (ranger la suite). Le runner
   d'écran compare directement la suite posée à `ordre` ; `check()` ne sert
   qu'au repli texte (fiche/bilan) : mots écrits dans l'ordre, séparés par des
   espaces ou des virgules. */
function ordreType(gen: () => Exercise): ExerciseType {
	return {
		// Rangement d'une suite (#108) : classé sans appeler generate() (#348), hors sprint.
		exerciseKind: 'tuilesOrdre',
		modes: [
			{
				id: 'tuiles',
				label: 'Je range les mots',
				hint: 'glisse ou tape les tuiles',
				icon: 'text',
				recommended: true,
			},
		],
		generate: () => gen(),
		check(exercise: Exercise, input: string): boolean {
			if (exercise.type !== 'tuilesOrdre') return false;
			const norm = (s: string) =>
				normalizeText(s)
					.toLowerCase()
					.replace(/\s*,\s*/g, ' ');
			return norm(input) === norm(exercise.ordre.join(' '));
		},
	};
}

export const VOCAB_LESSONS: LessonInput[] = [
	{
		id: 'fr-vocab-alpha-initiale',
		label: 'Ordre alphabétique — la 1re lettre',
		exerciseType: ordreType(genNiveau1),
	},
	{
		id: 'fr-vocab-alpha-deuxieme',
		label: 'Ordre alphabétique — la 2e lettre',
		exerciseType: ordreType(genNiveau2),
	},
];
