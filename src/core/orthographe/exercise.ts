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

/** Énoncé du journal d'erreurs pour un mot, LISIBLE par un parent hors de l'appli (#391).
    Un verbe en contexte montre sa phrase à trou ; sinon chaque tâche dit la sienne.

    Partagé par le parcours (`ui/ortho-runner.ts`) et la révision (`ui/revision.ts`) : le
    parcours décrivait les trois tâches par le seul « Mot à écrire sous la dictée », si bien
    qu'une erreur commise sur les tuiles se lisait comme une dictée dans le tableau du
    parent. Le même geste ne doit pas se raconter différemment selon le chemin pris. */
export function enonceJournalOrtho(mot: MotOrtho, mode: ModeOrtho): string {
	const ctx = mot.contexte;
	if (ctx) return `${ctx.avant}…${ctx.apres}`;
	if (mode === 'tuiles') return 'Mot à reconstituer avec les lettres données';
	if (mode === 'dictee') return 'Mot à écrire sous la dictée';
	return 'Mot à écrire de mémoire';
}

/** Ce qu'on dit à l'enfant quand il valide sans avoir rien posé. Deux gestes, deux
    formulations : on ne demande pas de « poser des lettres » à qui a un clavier. */
export function messageRienDePose(geste: 'saisie' | 'tuiles', verbe: boolean): string {
	if (geste === 'tuiles') return "Pose d'abord des lettres, puis vérifie.";
	return verbe ? "Écris d'abord le verbe, puis vérifie." : "Écris d'abord le mot, puis vérifie.";
}

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
		generate: (opts) => genExerciseOrtho(mot, (opts?.mode ?? 'motCache') as ModeOrtho),
		check: checkAnswer,
	};
}
