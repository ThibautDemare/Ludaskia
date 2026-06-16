/* ============================================================
   Visuels (icône + teinte) des matières et catégories.
   Source unique partagée par la navigation (catalog-nav.ts) et le
   configurateur de bilan (bilan.ts), pour que les pastilles de
   couleur/icône d'une catégorie soient identiques d'un écran à l'autre.
   Purement décoratif : l'information reste portée par le libellé.
   ============================================================ */
import type { IconName } from '../core/icon-names';

/* Icône + teinte de pastille par matière (mêmes pastilles que les catégories,
   pour ne pas « jurer » avec elles). Fallback générique. */
const SUBJECT_ICON: Record<string, IconName> = { math: 'calculator', francais: 'book-open' };
const SUBJECT_TINT: Record<string, string> = {
	math: 'var(--accent)',
	francais: 'var(--cat-sprint)',
};

export const subjectIcon = (id: string): IconName => SUBJECT_ICON[id] ?? 'book-open';
export const subjectTint = (id: string): string => SUBJECT_TINT[id] ?? 'var(--accent)';

/* Teintes des pastilles de catégorie : on CYCLE les 4 hues existantes (pas de
   nouvelle couleur) pour varier les cartes sans gonfler la palette. */
const CAT_TINTS = ['var(--accent)', 'var(--cat-sprint)', 'var(--cat-bilan)', 'var(--cat-bleu)'];

/* Teinte d'une catégorie selon son rang dans sa matière (cycle des 4 hues). */
export const catTint = (index: number): string => CAT_TINTS[index % CAT_TINTS.length];
