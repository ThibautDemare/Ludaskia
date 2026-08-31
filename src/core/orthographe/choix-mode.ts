/* ============================================================
   Mode Orthographe — ce que l'écran de choix a encore à proposer (#641).
   ------------------------------------------------------------
   Un mode d'entraînement ciblé « TERMINÉ pour cette liste » = tous les mots de la liste
   ont déjà validé ce mode. Il n'y a alors plus rien à y gagner pour la progression, mais
   il reste jouable (et il rapporte toujours de l'XP) : l'écran le range plus bas au lieu
   de le laisser en tête, où il capte le geste par défaut d'un enfant qui va au plus
   étayé — c'est le point de départ de #641.

   Le vocabulaire « épuisé » vit ICI et nulle part à l'écran : côté enfant il se lit « à
   bout », donc « bouton mort », exactement la lecture que le critère 10 interdit (cf.
   libellés arrêtés, contrat §F).

   Pur : ni DOM ni stockage, donc testable. La répartition à l'écran, elle, est dans
   `ui/ortho-runner.ts`.
   ============================================================ */
import { modesRequis } from './runner';
import type { MotOrtho, ModeOrtho } from './types';

/** Tous les mots de la liste ont validé ce mode. Une liste VIDE n'épuise rien (comme
    `listeEtoilee`) : sans mot, il n'y a rien à avoir fini. */
export function modeEpuise(mots: readonly MotOrtho[], mode: ModeOrtho): boolean {
	return mots.length > 0 && mots.every((m) => m.validation[mode]);
}

/** Les modes terminés pour cette liste, dans l'ordre de l'escalier. Bornés aux modes
    REQUIS : sans voix de synthèse, la dictée n'est ni proposée ni « terminable ». */
export function modesEpuises(mots: readonly MotOrtho[], dicteeDispo: boolean): ModeOrtho[] {
	return modesRequis(dicteeDispo).filter((m) => modeEpuise(mots, m));
}

/** Ce qui a basculé PENDANT la séance (critère 12) : les modes terminés à l'arrivée qui
    ne l'étaient pas au départ. C'est ce dont l'écran de fin doit parler — un mode déjà
    terminé avant la séance n'est une nouvelle pour personne. */
export function modesEpuisesPendant(
	avant: readonly ModeOrtho[],
	apres: readonly ModeOrtho[],
): ModeOrtho[] {
	return apres.filter((m) => !avant.includes(m));
}
