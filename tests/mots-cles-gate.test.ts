import { describe, it, expect } from 'vitest';
import { CATEGORIES, getAllLessons } from '../src/core/catalog';

/* ============================================================
   Gate des mots-clés de recherche (#718, critère 4).

   La recherche de l'enfant trouve une leçon par le libellé qu'il voit OU par un de ses
   mots-clés — et ce sont les mots-clés qui portent son vocabulaire à lui : un CE2 dit
   « fois », « les tables », « a ou à », pas « numération » ni « homophones ». Une leçon
   sans mot-clé fonctionne pourtant parfaitement : elle se lance, se parcourt, se corrige,
   et même la recherche la trouve encore par son libellé exact.

   Le défaut est donc INVISIBLE au développement. Il se paie à l'usage, chez l'enfant qui
   tape le mot qu'il connaît et ne trouve rien — et qui en conclut, raisonnablement, que la
   leçon n'existe pas. Personne ne remarque une absence dans une liste de résultats.

   ── Ce que ce gate prouve ─────────────────────────────────────────────────────
   Toute leçon du catalogue (`getAllLessons()`, tous niveaux confondus) et toute
   catégorie de `CATEGORIES` porte au moins un mot-clé non blanc. Pour les leçons
   déclarées dans `src/data/`, il prouve aussi que `toLessonDefs` recopie bien le
   champ : un mot-clé écrit dans la donnée mais perdu en route fait échouer ce gate.

   ── Ce qu'il ne prouve pas ────────────────────────────────────────────────────
   - Que le mot-clé soit rédigé dans le vocabulaire de l'ENFANT plutôt que dans celui du
     programme : c'est un jugement (pedagogue-primaire), pas une règle mécanisable.
   - Qu'il apporte quelque chose : un mot-clé qui recopie le libellé passe le gate sans
     rien rendre trouvable de plus.
   - Rien sur les dictées de mots : elles ne sont pas des leçons du catalogue, et la
     recherche les trouve par leur nom (critère 6).
   ============================================================ */

/** Au moins un mot-clé qui ne soit pas une chaîne vide ou faite d'espaces. */
function aUnMotCle(motsCles: readonly string[] | undefined): boolean {
	return Array.isArray(motsCles) && motsCles.some((m) => typeof m === 'string' && m.trim() !== '');
}

const LECONS = getAllLessons();

describe('Mots-clés de recherche (#718, critère 4)', () => {
	it('le catalogue examiné n’est pas vide (garde contre un gate à vide)', () => {
		// Un catalogue qui ne se chargerait plus rendrait les deux tests suivants verts en
		// n'examinant rien du tout.
		expect(LECONS.length).toBeGreaterThan(100);
		expect(CATEGORIES.length).toBeGreaterThanOrEqual(10);
	});

	it('chaque leçon du catalogue porte au moins un mot-clé', () => {
		const fautives = LECONS.filter((l) => !aUnMotCle(l.motsCles)).map((l) => l.id);
		expect(
			fautives,
			`${fautives.length} leçon(s) sans mot-clé de recherche : ${fautives.join(', ')}.\n` +
				`Ajouter \`motsCles\` dans sa donnée (src/data/…, ou src/core/catalog.ts pour le ` +
				`calcul mental historique) : au moins un mot que l'ENFANT emploierait pour la ` +
				`chercher (« fois », « les tables », « a ou à »), pas le terme du programme.\n` +
				`Sans lui, la leçon reste introuvable dès que l'enfant ne tape pas son titre exact.`,
		).toEqual([]);
	});

	it('chaque catégorie porte au moins un mot-clé', () => {
		const fautives = CATEGORIES.filter((c) => !aUnMotCle(c.motsCles)).map((c) => c.id);
		expect(
			fautives,
			`${fautives.length} catégorie(s) sans mot-clé de recherche : ${fautives.join(', ')}.\n` +
				`Ajouter \`motsCles\` à son entrée de CATEGORIES (src/core/catalog.ts) : le mot par ` +
				`lequel un enfant désigne ce domaine (« dictée » pour l'Orthographe, par exemple).`,
		).toEqual([]);
	});
});
