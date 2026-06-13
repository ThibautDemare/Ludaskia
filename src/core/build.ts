/* ============================================================
   Construction générique des fiches et bilans, toutes matières.
   Aiguille selon la leçon : les leçons de calcul mental gardent
   leur rendu riche (grilles, décomposition…) via LESSONS ; les
   autres matières (texte) passent par genLessonItem + un rendu
   en liste. C'est le pont qui rend le pipeline multi-matières.
   ============================================================ */
import { getAllLessons, getLessonById, genLessonItem, isLegacyMathLesson } from './catalog';
import type { LessonDef } from './catalog';
import { LESSONS } from './lessons';
import { setRenderLesson, renderItem, ficheHTMLGeneric } from './items';
import type { Item } from './items';
import { commKey } from './utils';

/* Génère jusqu'à n items distincts pour une leçon (dédup par contenu).
   Si la leçon offre moins de n variantes (ex. une conjugaison = 6 personnes),
   on renvoie la série plus courte SANS doublon : une question répétée à
   l'identique n'a aucune valeur pédagogique. On s'arrête après une longue
   série de tirages sans nouveauté (la pioche est aléatoire). La clé inclut la
   RÉPONSE et la FIGURE, pas seulement le texte : sinon une leçon à énoncé
   constant mais visuel variable (« Quel est ce solide ? ») n'aurait qu'UN item. */
export function genItems(lesson: LessonDef, n: number): Item[] {
	const items: Item[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (items.length < n && misses < 80) {
		const it = genLessonItem(lesson);
		const key = `${commKey(it.text)}¦${it.answer}¦${it.figure ?? ''}`;
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		items.push(it);
		misses = 0;
	}
	return items;
}

/* Fiche d'une leçon (vue « une leçon à la fois »). */
export function buildLessonFiche(lessonId: string): string {
	const lesson = getLessonById(lessonId);
	if (!lesson) return '';
	// Calcul mental (moteur bilanQ) : rendu riche dédié (grilles, décomposition…).
	if (isLegacyMathLesson(lesson)) {
		const math = LESSONS.find((l) => l.id === lessonId)!;
		setRenderLesson(lessonId);
		const html = math.build();
		setRenderLesson(null);
		return html;
	}
	// Sinon (math moderne : conversions… / matière texte) : 8 questions en liste.
	// L'item math est numérique, la matière texte est une saisie de chaîne ; la
	// consigne s'adapte, le `@` de l'item place le champ dans les deux cas.
	const items = genItems(lesson, 8);
	setRenderLesson(lessonId);
	const inner = `<div class="conj-list">${items
		.map((it) => `<div class="conj-op">${renderItem(it)}</div>`)
		.join('')}</div>`;
	setRenderLesson(null);
	const consigne = lesson.subject === 'math' ? 'Complète.' : 'Écris la forme correcte.';
	return ficheHTMLGeneric(lesson.label, '', consigne, inner);
}

/* Blocs d'un bilan personnalisé : nbQ questions par leçon sélectionnée. */
export function bilanBlocksForIds(lessonIds: string[], nbQ: number) {
	const blocks: { id: string; theme: string; ops: Item[] }[] = [];
	for (const lesson of getAllLessons()) {
		if (!lessonIds.includes(lesson.id)) continue;
		blocks.push({ id: lesson.id, theme: lesson.label, ops: genItems(lesson, nbQ) });
	}
	return blocks;
}

/* Fiches complètes pour un sous-ensemble de leçons (bilan complet personnalisé). */
export function buildFichesForIds(lessonIds: string[]): string[] {
	return getAllLessons()
		.filter((l) => lessonIds.includes(l.id))
		.map((l) => buildLessonFiche(l.id));
}
