/* ============================================================
   Abstraction d'exercice : type générique + interface de génération/vérification.
   Utilisé par tous les types d'exercices (math, conjugaison, QCM, orthographe…).
   ============================================================ */
import { normalizeText } from './utils';
import type { IconName } from './icon-names';

/** Une sous-question d'un problème (#199) : son intitulé et sa réponse numérique. */
export interface ProblemeEtape {
	question: string; // ex. « Combien Léo a-t-il de billes maintenant ? »
	answer: number;
}

// `parle` (#42) : texte LU à voix haute par le bouton « Écouter », quand
// l'énoncé affiché est télégraphique/symbolique et ne se lit pas tel quel
// (ex. « pouvoir · présent — je @ » → « Conjugue le verbe pouvoir au présent,
// avec je. »). Optionnel : si absent, la lecture dérive de l'énoncé affiché
// (core/tts-text → texteParle). Ne doit JAMAIS contenir la réponse ni un indice.
export type Exercise =
	// `figure` (#88) : fragment SVG optionnel (moteur core/figures.ts) affiché
	// au-dessus de la question — horloge, plus tard rectangle coté, polygone…
	// `champHeure` (#88) : la réponse est une heure « H h MM » → saisie en 2 champs
	// [heures] h [minutes] (item `kind: 'heure'`), fusionnés avant correction.
	| {
			type: 'text';
			question: string;
			answer: string;
			answers?: string[];
			figure?: string;
			champHeure?: boolean;
			parle?: string;
	  }
	// `explication` (#110) : justification pédagogique optionnelle affichée APRÈS
	// la réponse dans le runner QCM (ex. critère de substitution des homophones).
	| {
			type: 'qcm';
			question: string;
			answer: string;
			choices: string[];
			figure?: string;
			explication?: string;
			parle?: string;
	  }
	// Numération (#98) — l'enfant déplace LA bonne tuile (signe ou nombre) parmi
	// des distracteurs vers l'emplacement `@` de la question. Réponse = `answer`.
	| { type: 'tuilesNombre'; question: string; answer: string; tuiles: string[]; parle?: string }
	// Vocabulaire (#108) — l'enfant range une SUITE de tuiles-mots dans l'ordre
	// alphabétique. `tuiles` = la suite mélangée affichée ; `ordre` = la bonne
	// suite triée (calculée, jamais codée en dur). Mono-mode (runner dédié).
	| { type: 'tuilesOrdre'; question: string; tuiles: string[]; ordre: string[]; parle?: string }
	// Vocabulaire (#114) — champs lexicaux : l'enfant range des tuiles-mots FOURNIES
	// dans deux thèmes (catégories). `mots` porte la catégorie correcte de chaque
	// tuile (0 ou 1) ; corrigé tuile par tuile par son runner (ui/lecon-tri.ts).
	| {
			type: 'tuilesTri';
			question: string;
			categories: [string, string];
			mots: { mot: string; cat: 0 | 1 }[];
			parle?: string;
	  }
	// Calcul posé (#97) — opération en colonnes ; le catalogue en fait un Item
	// `posed` (cellules-chiffres notées une à une). Pas de champ `answer` unique.
	| { type: 'posed'; op: '+' | '-' | 'x'; a: number; b: number }
	// Résolution de problèmes (#199) — énoncé textuel + 1 sous-question (problème
	// simple) ou 2 (problème à deux étapes, « chunking »). Chaque étape a sa réponse
	// numérique, corrigée indépendamment. Runner dédié (ui/lecon-probleme.ts) ;
	// `parle` = énoncé complet lu à voix haute (jamais la réponse). Hors sprint.
	| { type: 'probleme'; enonce: string; etapes: ProblemeEtape[]; parle: string }
	// Orthographe — interactions réutilisables (vérifiées comme du texte) :
	| { type: 'motCache'; answer: string } // affiche/masque le mot puis saisie
	| { type: 'tuiles'; answer: string; lettres: string[] } // lettres mélangées à ordonner
	| { type: 'dictee'; answer: string; commeDans?: string }; // rien d'affiché, lu en TTS

/** Mode d'entraînement, pour les types d'exercices qui en proposent plusieurs. */
export type ExerciseMode = string;

/* Descripteur d'un mode présentable à l'enfant (écran de choix depuis une leçon).
   Les modes sont listés dans l'ordre d'affichage (du plus conseillé/accessible au
   plus exigeant) ; chaque écran dérive ses choix d'ici, jamais en dur. */
export interface ModeOption {
	id: ExerciseMode;
	label: string; // libellé à l'action, lisible par un CE2 (« J'écris le verbe »)
	hint?: string; // sous-ligne d'aide optionnelle (« plus facile pour commencer »)
	icon?: IconName; // pictogramme (icône Phosphor, rendu par ui/icon.ts)
	recommended?: boolean; // mode par défaut / conseillé (mis en avant, choisi si aucun)
}

export interface ExerciseType {
	/** Modes proposés, dans l'ordre d'affichage (optionnel ; un type mono-mode l'ignore). */
	modes?: ModeOption[];
	/** Consigne de la fiche en saisie (#42) : phrase qui NOMME la tâche, propre à ce
	 *  type d'exercice (ex. « Conjugue le verbe au temps demandé. »). Remplace le
	 *  générique « Écris la forme correcte. » quand elle est définie. */
	consigne?: string;
	generate(mode?: ExerciseMode): Exercise;
	check(exercise: Exercise, input: string): boolean;
}

/** Le type propose-t-il ce mode ? (remplace les `modes.includes(...)` codés en dur.) */
export function hasMode(type: ExerciseType, mode: ExerciseMode): boolean {
	return !!type.modes?.some((m) => m.id === mode);
}

/** Mode par défaut : le mode « recommended », sinon le premier listé, sinon aucun. */
export function defaultMode(type: ExerciseType): ExerciseMode | undefined {
	const ms = type.modes;
	if (!ms || ms.length === 0) return undefined;
	return (ms.find((m) => m.recommended) ?? ms[0]).id;
}

/* Vérification générique pour les exercices texte (hors math).
   Normalisation partagée (`normalizeText`) : trim + espaces internes réduits + NFC.
   Accents et apostrophes exigés. Couvre tous les types : comparaison à `answer`
   (+ variantes `answers` pour 'text'). */
export function checkAnswer(exercise: Exercise, input: string): boolean {
	// Le calcul posé (corrigé cellule par cellule), le rangement d'une suite (#108)
	// et le tri par thème (#114) — corrigés par leur runner — n'ont pas de réponse
	// texte unique : ils ne passent jamais par cette vérification générique.
	if (
		exercise.type === 'posed' ||
		exercise.type === 'tuilesOrdre' ||
		exercise.type === 'tuilesTri' ||
		exercise.type === 'probleme'
	)
		return false;
	const normalized = normalizeText(input);
	if (normalized === normalizeText(exercise.answer)) return true;
	if (exercise.type === 'text') {
		return (exercise.answers ?? []).some((a) => normalizeText(a) === normalized);
	}
	return false;
}
