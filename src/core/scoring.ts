/* ============================================================
   Correction d'une feuille de réponses (#349) — logique pure, sans DOM.

   `verify()` (ui/session.ts) lit les champs du DOM, en fait une liste de
   `ScoredInput` (données seulement), délègue le calcul ici, puis marque les
   champs selon les `statuses` renvoyés. Extraire ce cœur permet de le tester
   en isolation (Vitest) sans document ni rendu.
   ============================================================ */
import type { Item } from './items';
import { checkItemAnswer } from './items';

/** Un champ de réponse à corriger, réduit à ses données (aucune référence DOM).
 *  `saisie` est la réponse déjà normalisée par l'appelant (heure #88 fusionnée en
 *  « H h MM ») — pas la valeur brute du champ. `item` absent → repli numérique sur
 *  `answer` (sécurité, cf. cas où l'item n'est plus en session). `answer` =
 *  `data-answer` du champ. */
export interface ScoredInput {
	id: string;
	item: Item | null;
	saisie: string;
	answer?: string;
	lesson?: string | null;
}

/** Verdict d'un champ : juste, faux, ou laissé vide (non répondu). */
export type ItemStatus = 'correct' | 'wrong' | 'empty';

export interface ScoreResult {
	ok: number;
	total: number;
	vides: number;
	/** Items non réussis (faux OU non remplis), pour la révision des erreurs. */
	errors: Item[];
	/** Agrégat par leçon (id de leçon → réussis/total), pour les stats. */
	perLesson: Record<string, { ok: number; total: number }>;
	/** Verdict par id de champ, pour le marquage DOM par l'appelant. */
	statuses: Record<string, ItemStatus>;
}

/* Corrige la feuille : compte les bonnes réponses, agrège par leçon et collecte
   les erreurs. Une réponse vide n'est pas comptée dans `total` (mais son item
   part en révision) ; une réponse non vide est juste si `checkItemAnswer`
   l'accepte, ou — à défaut d'item — si elle égale `answer` (comparaison
   numérique, virgule tolérée). Le seau `perLesson` est créé pour chaque leçon
   rencontrée mais n'est incrémenté que par les réponses non vides. */
export function scoreItems(inputs: ScoredInput[]): ScoreResult {
	let total = 0,
		ok = 0,
		vides = 0;
	const errors: Item[] = [];
	const perLesson: Record<string, { ok: number; total: number }> = {};
	const statuses: Record<string, ItemStatus> = {};
	for (const { id, item, saisie, answer, lesson } of inputs) {
		const bucket =
			lesson != null ? perLesson[lesson] || (perLesson[lesson] = { ok: 0, total: 0 }) : null;
		if (saisie === '') {
			vides++;
			statuses[id] = 'empty';
			if (item) errors.push(item);
			continue;
		}
		total++;
		if (bucket) bucket.total++;
		const correct = item
			? checkItemAnswer(item, saisie)
			: Number(saisie.replace(',', '.')) === Number(answer);
		if (correct) {
			ok++;
			if (bucket) bucket.ok++;
			statuses[id] = 'correct';
		} else {
			statuses[id] = 'wrong';
			if (item) errors.push(item);
		}
	}
	return { ok, total, vides, errors, perLesson, statuses };
}
