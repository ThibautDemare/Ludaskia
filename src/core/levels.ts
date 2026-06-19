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
	if (lesson.levels.length === 0 || lesson.levels.includes(niveau)) return niveau;
	const wanted = LEVEL_ORDER.indexOf(niveau);
	// Indices des niveaux supportés, triés par ordre scolaire croissant.
	const supported = lesson.levels.map((l) => LEVEL_ORDER.indexOf(l)).sort((a, b) => a - b);
	// Plus haut niveau supporté dont l'index ne dépasse pas le niveau demandé.
	let best = -1;
	for (const idx of supported) {
		if (idx <= wanted) best = idx;
	}
	// Aucun en-dessous → clamp sur le plus bas niveau supporté.
	if (best === -1) best = supported[0];
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

/* Leçons appartenant au niveau demandé (filtrage du catalogue par niveau actif).
   Appartenance stricte : `effectiveLevel` (repli/clamp) sert à la GÉNÉRATION
   d'une référence hors-filtre (favori, révision), pas au filtrage de l'écran. */
export function lessonsForLevel<T extends { levels: SchoolLevel[] }>(
	lessons: T[],
	niveau: SchoolLevel,
): T[] {
	return lessons.filter((l) => l.levels.includes(niveau));
}
