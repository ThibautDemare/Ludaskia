/* ============================================================
   Bilan « express » borné (issue #35).
   ------------------------------------------------------------
   Avec la conjugaison (~52 leçons par catégorie), « 3 questions ×
   toutes les leçons » donnait un bilan de 150+ questions — à
   l'opposé d'un « express ». On borne donc l'express à ~20
   questions (cible CE2 : ~10 min, validée avec le conseiller
   pédagogique) :
     - peu de leçons  → jusqu'à 3 questions chacune ;
     - beaucoup       → 1 question, et on ÉCHANTILLONNE les leçons.
   L'échantillonnage est pondéré (priorité aux leçons faibles ou
   jamais vues) et tournant (on évite de retomber sur le tirage
   précédent). La logique de tirage est pure et testable ;
   buildExpressConfig() la branche sur les stats du profil. */
import { loadLessonStats, lessonAvgPct } from './progress';
import type { BilanConfig } from './catalog';

/* Plafond indicatif de questions d'un express (cible ~10 min en CE2). */
export const EXPRESS_CAP = 20;

/* Questions par leçon : on remplit jusqu'au plafond, sans dépasser 3
   (au-delà, un express n'a plus rien d'« express »). Quand il y a plus
   de leçons que le plafond, on tombe à 1 et l'échantillonnage prend le
   relais (voir sampleExpressLessons). */
export function expressQuestionsPerLesson(nbLessons: number, cap = EXPRESS_CAP): number {
	if (nbLessons <= 0) return 0;
	return Math.min(3, Math.max(1, Math.floor(cap / nbLessons)));
}

/* Poids d'une leçon dans le tirage : plus elle est fragile, plus elle a
   de chances de sortir ; une leçon du tirage précédent est dépriorisée
   pour faire tourner la couverture. */
export function expressWeight(avg: number | null, recent: boolean): number {
	let w = avg == null ? 3 : avg < 60 ? 4 : avg < 80 ? 2 : 1;
	if (recent) w = Math.max(1, w - 2);
	return w;
}

interface SampleOpts {
	cap?: number;
	avgPct?: (lessonId: string) => number | null;
	recent?: string[];
}

/* Sélectionne au plus `cap` leçons par tirage pondéré sans remise.
   En deçà du plafond, on renvoie toutes les leçons (pas d'échantillonnage). */
export function sampleExpressLessons(lessonIds: string[], opts: SampleOpts = {}): string[] {
	const cap = opts.cap ?? EXPRESS_CAP;
	if (lessonIds.length <= cap) return [...lessonIds];
	const avgPct = opts.avgPct ?? (() => null);
	const recent = new Set(opts.recent ?? []);
	const pool = lessonIds.map((id) => ({ id, w: expressWeight(avgPct(id), recent.has(id)) }));
	const out: string[] = [];
	while (out.length < cap && pool.length) {
		const total = pool.reduce((s, p) => s + p.w, 0);
		let r = Math.random() * total;
		let i = 0;
		while (i < pool.length - 1 && r >= pool[i].w) {
			r -= pool[i].w;
			i++;
		}
		out.push(pool[i].id);
		pool.splice(i, 1);
	}
	return out;
}

/* Construit la config d'un bilan express borné pour un ensemble de leçons,
   en pondérant par les stats du profil et en évitant le tirage précédent.
   `recent` = leçons du dernier express de ce périmètre (rotation). */
export function buildExpressConfig(
	label: string,
	lessonIds: string[],
	recent: string[] = [],
): BilanConfig {
	const stats = loadLessonStats();
	const selected = sampleExpressLessons(lessonIds, {
		avgPct: (id) => lessonAvgPct(stats[id]),
		recent,
	});
	// Le nombre de questions par leçon se calcule sur le nombre TOTAL de leçons
	// du périmètre : au-delà du plafond il vaut 1, ce qui s'accorde avec
	// l'échantillonnage (cap leçons × 1 question).
	return {
		id: '',
		label,
		lessonIds: selected,
		questionsPerLesson: expressQuestionsPerLesson(lessonIds.length),
	};
}
