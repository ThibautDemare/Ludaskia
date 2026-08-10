/* ============================================================
   Niveaux scolaires : axe transversal du catalogue et de la
   génération (#225). Le niveau est une DONNÉE/paramètre, jamais
   un type — pas de sous-classe par niveau. Ce module est de la
   logique pure (sans DOM), testable seule.
   ============================================================ */
import type { LessonDef, SchoolLevel } from './catalog';

/* Ordre scolaire croissant : sert d'échelle pour comparer deux niveaux
   (repli « vers le bas », plus tard mélange biaisé en V2). */
export const LEVEL_ORDER: SchoolLevel[] = ['cp', 'ce1', 'ce2', 'cm1', 'cm2', '6e'];

/* Libellé enfant d'un niveau (jamais « plus facile » / « niveau bas » : c'est un
   réglage de contenu, pas un score — cf. #225, sécurité émotionnelle). */
export const LEVEL_LABEL: Record<SchoolLevel, string> = {
	cp: 'CP',
	ce1: 'CE1',
	ce2: 'CE2',
	cm1: 'CM1',
	cm2: 'CM2',
	'6e': '6e',
};

/* Niveau effectif d'une leçon pour un niveau demandé :
   - le niveau demandé si la leçon le supporte ;
   - sinon le plus haut niveau supporté EN-DESSOUS (repli — gère un CM1 qui ouvre
     une leçon restée CE2-only, ou un favori hors-niveau) ;
   - sinon (leçon entièrement au-dessus du niveau demandé, ex. un CP sur une leçon
     CE2-only) le plus BAS niveau supporté (clamp). Ne renvoie jamais `undefined`. */
export function effectiveLevel(lesson: LessonDef, niveau: SchoolLevel): SchoolLevel {
	return closestSupported(lesson.levels, niveau);
}

/* Libellé d'une leçon POUR UN NIVEAU (#436) : `labelNiveau[niveau]` s'il existe, sinon
   le `label` par défaut. Le niveau demandé est d'abord résolu par `effectiveLevel`
   (repli/clamp), pour qu'une référence hors-filtre — favori, révision, leçon épinglée —
   reçoive le libellé du niveau RÉELLEMENT joué, comme la génération.

   Même convention que le reste du niveau (#225) : la résolution se fait à la LECTURE, au
   seam qui connaît le niveau (UI via `niveauLecon`, impression/encadrant via le niveau du
   profil consulté) ; sans niveau, on rend `label`. Un appelant qui affiche `lesson.label`
   en direct n'est donc pas cassé — il est seulement moins précis. */
export function labelLecon(lesson: LessonDef, niveau?: SchoolLevel): string {
	if (!lesson.labelNiveau || niveau === undefined) return lesson.label;
	return lesson.labelNiveau[effectiveLevel(lesson, niveau)] ?? lesson.label;
}

/* Niveau supporté le plus proche d'un niveau demandé, parmi un ensemble :
   - le niveau demandé s'il est supporté ;
   - sinon le plus haut supporté EN-DESSOUS (repli) ;
   - sinon le plus BAS supporté (clamp, ensemble entièrement au-dessus).
   Ensemble vide → le niveau demandé (aucune contrainte). Partagé par
   `effectiveLevel` (leçon) et le combinateur `calibrated` (table de params). */
export function closestSupported(supported: SchoolLevel[], niveau: SchoolLevel): SchoolLevel {
	if (supported.length === 0 || supported.includes(niveau)) return niveau;
	const wanted = LEVEL_ORDER.indexOf(niveau);
	const idxs = supported.map((l) => LEVEL_ORDER.indexOf(l)).sort((a, b) => a - b);
	let best = -1;
	for (const idx of idxs) if (idx <= wanted) best = idx;
	if (best === -1) best = idxs[0];
	return LEVEL_ORDER[best];
}

/* Niveaux réellement présents dans un ensemble de leçons (union des `levels`),
   triés par ordre scolaire. Alimente la popup de choix de classe : on ne propose
   que des niveaux qui ont du contenu (un seul niveau dispo ⇒ pas de choix utile). */
export function availableLevels(lessons: { levels: SchoolLevel[] }[]): SchoolLevel[] {
	const set = new Set<SchoolLevel>();
	for (const l of lessons) for (const lv of l.levels) set.add(lv);
	return LEVEL_ORDER.filter((lv) => set.has(lv));
}

/* Niveau par défaut d'un catalogue : le plus bas niveau ayant du contenu. Repli
   quand aucune classe n'est choisie. Source unique (#351) — les appelants passent
   getAllLessons() (niveau-actif.ts, encadrant-stats.ts). Reste pur/paramétré comme
   le reste du module : levels.ts ne dépend pas du singleton catalogue (sinon cycle
   levels → catalog → data → level-combinators → levels à l'initialisation). */
export function niveauDefautCatalogue(lessons: { levels: SchoolLevel[] }[]): SchoolLevel {
	return availableLevels(lessons)[0];
}

/* Leçons appartenant au niveau demandé (filtrage du catalogue par niveau actif).
   Appartenance stricte : `effectiveLevel` (repli/clamp) sert à la GÉNÉRATION
   d'une référence hors-filtre (favori, révision), pas au filtrage de l'écran. */
export function lessonsForLevel<T extends { levels: SchoolLevel[] }>(
	lessons: T[],
	niveau: SchoolLevel,
): T[] {
	return lessons.filter((l) => l.levels.includes(niveau));
}
