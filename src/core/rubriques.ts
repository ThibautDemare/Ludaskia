/* ============================================================
   Regroupement par RUBRIQUE (#109) — logique pure.
   ------------------------------------------------------------
   L'écran d'une catégorie range ses leçons par rubrique (« Présent », « Les accords »…),
   chaque rubrique apparaissant à la place de sa PREMIÈRE leçon dans l'ordre pédagogique,
   et les leçons sans rubrique formant un groupe sans titre. Depuis #718, les résultats
   de recherche doivent suivre exactement cet ordre (critère 9 : « violé si l'ordre
   diffère de celui de l'écran de la catégorie ») — d'où UNE fonction, ici, consommée par
   l'écran (`ui/catalog-nav.ts`, deux fois) et par la recherche (`core/recherche-lecon.ts`).
   Deux copies du même `forEach` auraient fini par diverger sans que rien ne rougisse.

   Ne trie pas : l'appelant fournit la liste déjà dans l'ordre pédagogique
   (`getLessonsByCategory(cat, niveau)`, `trierParOrdre`). Stable, sans mutation. Pur.
   ============================================================ */

export interface GroupeRubrique<T> {
	rubrique: string; // '' (ou `sansTitre`) pour les leçons sans rubrique
	lecons: T[];
}

/** Groupes de rubrique dans l'ordre d'apparition ; `sansTitre` nomme le groupe des
    leçons sans rubrique (vide par défaut : l'écran le rend à plat, sans en-tête). */
export function grouperParRubrique<T extends { rubrique?: string }>(
	lessons: readonly T[],
	sansTitre = '',
): GroupeRubrique<T>[] {
	// Les leçons SANS rubrique sont reconnues à cette absence, jamais au nom qu'on leur
	// donne : `sansTitre` n'est qu'un libellé. Sinon, une rubrique réelle portant ce nom
	// fusionnerait avec elles sur un appelant et pas sur l'autre (l'écran Orthographe
	// nomme le groupe « Exercices », la recherche le laisse vide), et l'ordre de la
	// recherche cesserait d'être celui de l'écran — ce qu'interdit le critère 9 de #718.
	const SANS_RUBRIQUE = Symbol('sans rubrique');
	const groupes: { cle: string | symbol; groupe: GroupeRubrique<T> }[] = [];
	for (const l of lessons) {
		const cle = l.rubrique ?? SANS_RUBRIQUE;
		let g = groupes.find((x) => x.cle === cle);
		if (!g) {
			g = { cle, groupe: { rubrique: l.rubrique ?? sansTitre, lecons: [] } };
			groupes.push(g);
		}
		g.groupe.lecons.push(l);
	}
	return groupes.map((x) => x.groupe);
}

/** La même chose À PLAT : l'ordre dans lequel l'enfant lit les cartes de haut en bas. */
export function ordreEcran<T extends { rubrique?: string }>(lessons: readonly T[]): T[] {
	return grouperParRubrique(lessons).flatMap((g) => g.lecons);
}
