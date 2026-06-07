/* ============================================================
   Construction générique des fiches et bilans, toutes matières.
   Aiguille selon la leçon : les leçons de calcul mental gardent
   leur rendu riche (grilles, décomposition…) via LESSONS ; les
   autres matières (texte) passent par genLessonItem + un rendu
   en liste. C'est le pont qui rend le pipeline multi-matières.
   ============================================================ */
import { getAllLessons, getLessonById, genLessonItem } from './catalog';
import type { LessonDef } from './catalog';
import { LESSONS } from './lessons';
import { setRenderLesson, renderItem, ficheHTMLGeneric } from './items';
import type { Item } from './items';
import { commKey } from './utils';

/* Génère n items distincts pour une leçon (dédup par texte ; complète
   avec des doublons si la leçon offre moins de n variantes). */
export function genItems(lesson: LessonDef, n: number): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (items.length < n && guard < n * 30) {
    const it = genLessonItem(lesson);
    const key = commKey(it.text);
    if (!seen.has(key)) {
      seen.add(key);
      items.push(it);
    }
    guard++;
  }
  while (items.length < n) items.push(genLessonItem(lesson)); // peu de variantes → on complète
  return items;
}

/* Fiche d'une leçon (vue « une leçon à la fois »). */
export function buildLessonFiche(lessonId: string): string {
  const lesson = getLessonById(lessonId);
  if (!lesson) return '';
  if (lesson.subject === 'math') {
    const math = LESSONS.find((l) => l.id === lessonId)!;
    setRenderLesson(lessonId);
    const html = math.build();
    setRenderLesson(null);
    return html;
  }
  // Matière texte : 8 questions en liste verticale.
  const items = genItems(lesson, 8);
  setRenderLesson(lessonId);
  const inner = `<div class="conj-list">${items
    .map((it) => `<div class="conj-op">${renderItem(it)}</div>`)
    .join('')}</div>`;
  setRenderLesson(null);
  return ficheHTMLGeneric(lesson.label, '', 'Écris la forme correcte.', inner);
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
