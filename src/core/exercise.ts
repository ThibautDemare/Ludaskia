/* ============================================================
   Abstraction d'exercice : type générique + interface de génération/vérification.
   Utilisé par tous les types d'exercices (math, conjugaison, QCM, orthographe…).
   ============================================================ */
import { normalizeText } from './utils';

export type Exercise =
	| { type: 'text'; question: string; answer: string; answers?: string[] }
	| { type: 'qcm'; question: string; answer: string; choices: string[] }
	// Numération (#98) — l'enfant déplace LA bonne tuile (signe ou nombre) parmi
	// des distracteurs vers l'emplacement `@` de la question. Réponse = `answer`.
	| { type: 'tuilesNombre'; question: string; answer: string; tuiles: string[] }
	// Calcul posé (#97) — opération en colonnes ; le catalogue en fait un Item
	// `posed` (cellules-chiffres notées une à une). Pas de champ `answer` unique.
	| { type: 'posed'; op: '+' | '-' | 'x'; a: number; b: number }
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
	icon?: string; // pictogramme/emoji
	recommended?: boolean; // mode par défaut / conseillé (mis en avant, choisi si aucun)
}

export interface ExerciseType {
	/** Modes proposés, dans l'ordre d'affichage (optionnel ; un type mono-mode l'ignore). */
	modes?: ModeOption[];
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
	// Le calcul posé n'a pas de réponse unique (corrigé cellule par cellule) :
	// il ne passe jamais par cette vérification générique.
	if (exercise.type === 'posed') return false;
	const normalized = normalizeText(input);
	if (normalized === normalizeText(exercise.answer)) return true;
	if (exercise.type === 'text') {
		return (exercise.answers ?? []).some((a) => normalizeText(a) === normalized);
	}
	return false;
}
