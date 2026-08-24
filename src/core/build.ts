/* ============================================================
   Construction générique des fiches et bilans, toutes matières.
   Aiguille selon la leçon : les leçons de calcul mental gardent
   leur rendu riche (grilles, décomposition…) via LESSONS ; les
   autres matières (texte) passent par genLessonItem + un rendu
   en liste. C'est le pont qui rend le pipeline multi-matières.
   ============================================================ */
import { getAllLessons, getLessonById, genLessonItem, isLegacyMathLesson } from './catalog';
import type { LessonDef, SchoolLevel } from './catalog';
import { consignePourNiveau } from './exercise';
import { labelLecon } from './levels';
import { niveauLecon } from './niveau-actif';
import { LESSONS_CALCUL_MENTAL } from './lessons';
import {
	renderItem,
	ficheHTMLGeneric,
	estItemQcm,
	createRenderContext,
	withLessonId,
} from './items';
import type { Item, RenderContext } from './items';
import { commKey } from './utils';
import { html, joindre, VIDE, type SafeHtml } from './html';

/* Génère jusqu'à n items distincts pour une leçon (dédup par contenu).
   Si la leçon offre moins de n variantes (ex. une conjugaison = 6 personnes),
   on renvoie la série plus courte SANS doublon : une question répétée à
   l'identique n'a aucune valeur pédagogique. On s'arrête après une longue
   série de tirages sans nouveauté (la pioche est aléatoire). La clé inclut la
   RÉPONSE et la FIGURE, pas seulement le texte : sinon une leçon à énoncé
   constant mais visuel variable (« Quel est ce solide ? ») n'aurait qu'UN item. */
export function genItems(lesson: LessonDef, n: number, level?: SchoolLevel): Item[] {
	const items: Item[] = [];
	const seen = new Set<string>();
	// Calibrage au niveau effectif (#225), surchargeable (#234) : impression d'une fiche
	// au niveau d'un profil CONSULTÉ par l'encadrant, sans changer le profil/niveau actif.
	const lvl = level ?? niveauLecon(lesson);
	let misses = 0;
	while (items.length < n && misses < 80) {
		const it = genLessonItem(lesson, lvl);
		const key = `${commKey(it.text)}¦${it.answer}¦${it.figure?.balisage ?? ''}`;
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

/* Fiche d'une leçon (vue « une leçon à la fois »). `level` (optionnel) force le
   calibrage à un niveau donné — impression au niveau d'un profil consulté (#234).
   `ctx` (#352) : contexte de rendu partagé — l'appelant l'impose pour conserver les
   items (session interactive) ou partager le compteur d'id d'un document imprimé.
   Par défaut, un contexte frais (fiche isolée, écran unique, tests). */
export function buildLessonFiche(
	lessonId: string,
	level?: SchoolLevel,
	ctx: RenderContext = createRenderContext(),
): SafeHtml {
	const lesson = getLessonById(lessonId);
	if (!lesson) return VIDE;
	// Calcul mental (moteur bilanQ) : rendu riche dédié (grilles, décomposition…).
	if (isLegacyMathLesson(lesson)) {
		const math = LESSONS_CALCUL_MENTAL.find((l) => l.id === lessonId)!;
		return withLessonId(ctx, lessonId, () => math.build(ctx));
	}
	// Sinon (math moderne : conversions… / matière texte) : 8 questions en liste.
	// L'item math est numérique, la matière texte est une saisie de chaîne ; la
	// consigne s'adapte, le `@` de l'item place le champ dans les deux cas.
	// Niveau de la fiche : celui imposé par l'appelant (#234), sinon le niveau effectif —
	// MÊME résolution que `genItems`, pour que le titre, la consigne et le contenu de la
	// fiche parlent tous du même niveau (#436).
	const lvl = level ?? niveauLecon(lesson);
	const items = genItems(lesson, 8, lvl);
	const inner = withLessonId(ctx, lessonId, () => {
		const lignes = joindre(
			items.map((it) => html`<div class="conj-op">${renderItem(it, ctx)}</div>`),
		);
		return html`<div class="conj-list">${lignes}</div>`;
	});
	// Consigne propre au type d'exercice si définie (#42 : nomme la tâche, ex.
	// « Conjugue le verbe au temps demandé. ») ; sinon générique selon la matière.
	// En impression (#289), une fiche de QCM se remplit en cochant → consigne d'action
	// dédiée (la question de chaque item reste affichée — décision produit).
	const isQcm = items.some(estItemQcm);
	const consigne =
		ctx.printMode && isQcm
			? 'Coche la bonne réponse.'
			: (consignePourNiveau(lesson.exerciseType, lvl) ??
				(lesson.subject === 'math' ? 'Complète.' : 'Écris la forme correcte.'));
	return ficheHTMLGeneric(labelLecon(lesson, lvl), '', consigne, inner);
}

/* Blocs d'un bilan personnalisé : nbQ questions par leçon sélectionnée. `level`
   (optionnel) force le calibrage (impression au niveau d'un profil consulté, #234). */
export function bilanBlocksForIds(lessonIds: string[], nbQ: number, level?: SchoolLevel) {
	const blocks: { id: string; theme: string; ops: Item[] }[] = [];
	for (const lesson of getAllLessons()) {
		if (!lessonIds.includes(lesson.id)) continue;
		blocks.push({
			id: lesson.id,
			theme: labelLecon(lesson, level ?? niveauLecon(lesson)),
			ops: genItems(lesson, nbQ, level),
		});
	}
	return blocks;
}

/* Fiches complètes pour un sous-ensemble de leçons (bilan complet personnalisé).
   `ctx` (#352) partagé entre toutes les fiches : compteur d'id commun (ids uniques
   dans le document) et items conservés pour la correction d'une session interactive. */
export function buildFichesForIds(
	lessonIds: string[],
	level?: SchoolLevel,
	ctx: RenderContext = createRenderContext(),
): SafeHtml[] {
	return getAllLessons()
		.filter((l) => lessonIds.includes(l.id))
		.map((l) => buildLessonFiche(l.id, level, ctx));
}
