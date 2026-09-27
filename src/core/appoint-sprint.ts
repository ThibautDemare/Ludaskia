/* ============================================================
   Appoint de la classe précédente dans le sprint (#724) — logique PURE.
   ------------------------------------------------------------
   Un sprint « tout », par matière ou par catégorie tire aussi, pour une part bornée,
   dans les leçons de la classe précédente que l'enfant a commencées sans les franchir :
   exactement l'ensemble du bloc parent de #723 (`consolidationBasNiveau`), restreint à ce
   que le sprint sait jouer. Un favori n'est jamais touché : c'est une sélection explicite
   (décision de l'appelant, ui/sprint.ts).

   La part vaut min(15 % ; k/(n+k)) : proportionnelle au nombre de leçons fragiles tant
   qu'il y en a peu, pour qu'une seule leçon ne revienne pas une question sur sept, et
   plafonnée pour que le sprint reste celui de la classe suivie. Les questions se génèrent
   et se journalisent au niveau de STOCKAGE de la leçon (`niveauLecon`, `recordLessonStats`),
   sans rien changer au chemin du sprint.
   ============================================================ */
import {
	CATEGORIES,
	SUBJECTS,
	estEligibleSprintHorsNiveau,
	type LessonDef,
	type SubjectId,
} from './catalog';
import { consolidationBasNiveau, type CartesBrutes } from './consolidation-bas-niveau';
import { niveauActifMatiere } from './niveau-actif';

/** Part maximale des tirages d'un sprint accordée aux leçons de la classe précédente. */
export const PART_APPOINT_SPRINT_MAX = 0.15;

/** Part des tirages : min(PART_APPOINT_SPRINT_MAX ; k/(n+k)), 0 sans fragile. */
export function partAppointSprint(k: number, n: number): number {
	if (k <= 0) return 0;
	return Math.min(PART_APPOINT_SPRINT_MAX, k / (n + k));
}

/** Leçons de la classe précédente que le sprint peut tirer en appoint, pour un filtre :
    matière donnée, sinon celle de la catégorie, sinon toutes. Chaque matière est lue à SON
    niveau actif ; seules restent les leçons éligibles au sprint (mêmes exclusions de format
    que le pool actif). */
export function fragilesSprint(
	filtre: { subject?: SubjectId; category?: string },
	cartes: CartesBrutes,
): LessonDef[] {
	const categorie = filtre.category ? CATEGORIES.find((c) => c.id === filtre.category) : undefined;
	if (filtre.category && !categorie) return [];
	const matieres = filtre.subject
		? [filtre.subject]
		: categorie
			? [categorie.subject]
			: SUBJECTS.map((s) => s.id);
	const out: LessonDef[] = [];
	for (const subject of matieres) {
		const conso = consolidationBasNiveau(subject, niveauActifMatiere(subject), cartes);
		for (const { lesson } of conso?.fragiles ?? []) {
			if (filtre.category && lesson.category !== filtre.category) continue;
			if (estEligibleSprintHorsNiveau(lesson)) out.push(lesson);
		}
	}
	return out;
}

/** Un tirage : une leçon fragile avec la probabilité `partAppointSprint(k, n)`, sinon null.
    `r` est injecté (tirage testable par échantillon). */
export function tirerAppoint(
	r: () => number,
	n: number,
	fragiles: readonly LessonDef[],
): LessonDef | null {
	if (r() >= partAppointSprint(fragiles.length, n)) return null;
	return fragiles[Math.min(fragiles.length - 1, Math.floor(r() * fragiles.length))];
}
