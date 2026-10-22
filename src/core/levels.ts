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

/* Garde de type : une valeur lue hors du code (stockage, attribut `data-*`, clé `@niveau`)
   est-elle une classe de l'échelle ? Une seule lecture, plutôt qu'un `as SchoolLevel` qui
   laisserait passer « zz » ou « CE2 » partout où la valeur circule ensuite. */
export function estNiveau(x: unknown): x is SchoolLevel {
	return (LEVEL_ORDER as unknown[]).includes(x);
}

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

/* Libellé IMPRIMÉ d'une leçon pour un niveau (#777, critère 19) : celui que portent le titre
   d'un bloc de bilan imprimé et celui d'une fiche imprimée. Même résolution que `labelLecon`
   (niveau effectif d'abord) : `labelImpressionNiveau[niveau]`, sinon `labelImpression`, sinon
   le libellé d'ÉCRAN du niveau — juste sur papier tant qu'il ne décrit pas un geste d'écran.
   Lu par les seuls chemins d'impression : l'écran garde `labelLecon`. */
export function labelImpressionLecon(lesson: LessonDef, niveau?: SchoolLevel): string {
	const parNiveau =
		niveau === undefined
			? undefined
			: lesson.labelImpressionNiveau?.[effectiveLevel(lesson, niveau)];
	return parNiveau ?? lesson.labelImpression ?? labelLecon(lesson, niveau);
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

/* Niveau immédiatement en dessous d'un niveau donné sur l'échelle scolaire, `undefined`
   pour le plus bas (rien en dessous) ou un niveau hors échelle.
   Périmètre de l'entretien du niveau inférieur en révision (#232) : on n'entretient
   qu'UN SEUL niveau d'écart. Un CM2 ne se voit pas reproposer du CE2 — au-delà d'un
   niveau, la dette non acquise est abandonnée (gardée en stock, plus jamais tirée),
   sinon l'entretien devient une traîne multi-niveaux qui grossit indéfiniment et grignote
   la classe suivie (avis pédagogue). Ce qui est stocké AU-DESSUS du niveau actif reste
   dormant lui aussi : on ne re-sert jamais du contenu plus dur que la classe suivie.
   L'appelant compare ce résultat au niveau LU dans une clé `lessonId@niveau`, non garanti
   valide : une comparaison d'égalité écarte d'elle-même un niveau corrompu. */
export function niveauInferieurImmediat(reference: SchoolLevel): SchoolLevel | undefined {
	const i = LEVEL_ORDER.indexOf(reference);
	return i > 0 ? LEVEL_ORDER[i - 1] : undefined;
}

/* Niveaux réellement présents dans un ensemble de leçons (union des `levels`),
   triés par ordre scolaire. Alimente la popup de choix de classe : on ne propose
   que des niveaux qui ont du contenu (un seul niveau dispo ⇒ pas de choix utile). */
export function availableLevels(
	lessons: readonly { levels: readonly SchoolLevel[] }[],
): SchoolLevel[] {
	const set = new Set<SchoolLevel>();
	for (const l of lessons) for (const lv of l.levels) set.add(lv);
	return LEVEL_ORDER.filter((lv) => set.has(lv));
}

/* Classes pourvues dans UNE catégorie (#772) : celles où au moins une de ses leçons existe,
   plus `autres` (les dictées prédéfinies de l'orthographe, qui ne sont pas des leçons du
   catalogue). Ordre scolaire, sans doublon. Alimente le sélecteur de classe de l'écran de
   catégorie : on ne propose une classe que si elle a quelque chose à montrer. */
export function classesPourvues(
	lessons: readonly { category: string; levels: readonly SchoolLevel[] }[],
	categoryId: string,
	autres: readonly SchoolLevel[] = [],
): SchoolLevel[] {
	const set = new Set<SchoolLevel>(autres);
	for (const l of lessons) if (l.category === categoryId) for (const lv of l.levels) set.add(lv);
	return LEVEL_ORDER.filter((lv) => set.has(lv));
}

/* Classe la plus PROCHE d'un niveau parmi un ensemble (#772, recherche toutes classes) :
   le niveau lui-même s'il y est, sinon le plus petit écart sur l'échelle, celle du DESSOUS
   à égalité. Distinct de `closestSupported`, qui préfère toujours le dessous même plus
   lointain : c'est la bonne règle pour JOUER une référence hors filtre (on ne sert pas plus
   dur que demandé), pas pour dire à l'enfant dans quelle classe une leçon se trouve. */
export function classeLaPlusProche(
	levels: readonly SchoolLevel[],
	niveau: SchoolLevel,
): SchoolLevel {
	if (levels.length === 0 || levels.includes(niveau)) return niveau;
	const ref = LEVEL_ORDER.indexOf(niveau);
	let best = levels[0];
	for (const lv of levels) {
		const d = Math.abs(LEVEL_ORDER.indexOf(lv) - ref);
		const db = Math.abs(LEVEL_ORDER.indexOf(best) - ref);
		if (d < db || (d === db && LEVEL_ORDER.indexOf(lv) < LEVEL_ORDER.indexOf(best))) best = lv;
	}
	return best;
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
