/* ============================================================
   Mode Orthographe — génération d'exercices à partir d'un mot.
   Les 3 modes validants sont des exercices pairs (même `check`,
   vérification texte) ; seule l'interaction diffère.
   L'orchestration (séquence, déblocage, étoile…) vit dans le runner,
   pas ici. Voir docs/design-orthographe.md.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../exercise';
import { checkAnswer } from '../exercise';
import { sample } from '../utils';
import type { MotOrtho, ModeOrtho } from './types';

/* Modes d'entraînement ciblés présentables à l'enfant, dans l'ordre d'étayage
   décroissant (tuiles → mot caché → dictée). Le mode par défaut d'une liste
   reste le parcours complet (orchestré par le runner), pas un mode isolé : aucun
   `recommended` ici. Voir issue #69 et docs/design-orthographe.md. */
export const ORTHO_MODE_OPTIONS: ModeOption[] = [
	{ id: 'tuiles', label: 'Je remets les lettres en ordre', icon: 'puzzle-piece' },
	{ id: 'motCache', label: "Je regarde puis j'écris", icon: 'eye' },
	{ id: 'dictee', label: "J'écoute et j'écris", icon: 'speaker' },
];

/** Découpe un mot en lettres (NFC → une lettre accentuée = un seul caractère). */
export function lettresDuMot(mot: string): string[] {
	return Array.from(mot.normalize('NFC'));
}

/** Mélange les lettres d'un mot pour le mode Tuiles (lettres exactes, sans
    distracteur en v1). On évite de renvoyer l'ordre d'origine quand c'est possible. */
export function melangeLettres(mot: string): string[] {
	const lettres = lettresDuMot(mot);
	if (lettres.length < 2) return lettres;
	for (let i = 0; i < 8; i++) {
		const m = sample(lettres, lettres.length);
		if (m.join('') !== lettres.join('')) return m;
	}
	return sample(lettres, lettres.length);
}

/** Fabrique l'Exercise d'un mot pour un mode d'entraînement donné. */
export function genExerciseOrtho(mot: MotOrtho, mode: ModeOrtho): Exercise {
	if (mode === 'tuiles') {
		return { type: 'tuiles', answer: mot.mot, lettres: melangeLettres(mot.mot) };
	}
	if (mode === 'dictee') {
		return { type: 'dictee', answer: mot.mot, commeDans: mot.commeDans };
	}
	return { type: 'motCache', answer: mot.mot }; // motCache par défaut
}

/** ExerciseType mode-aware pour un mot (mode par défaut : motCache). */
export function orthoType(mot: MotOrtho): ExerciseType {
	return {
		modes: ORTHO_MODE_OPTIONS,
		generate: (mode) => genExerciseOrtho(mot, (mode ?? 'motCache') as ModeOrtho),
		check: checkAnswer,
	};
}
