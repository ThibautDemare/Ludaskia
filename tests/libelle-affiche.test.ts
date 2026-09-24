/* ============================================================
   Libellé AFFICHÉ d'une leçon (#718) — src/core/libelle-affiche.ts (pur).

   Pourquoi ce module existe : l'écran de catégorie ne montre pas toujours le libellé du
   catalogue. Pour les 17 leçons du moteur historique de calcul mental, il affiche le
   titre de `core/lessons.ts` (« Multiplier par 4, par 8 ») et non le `label` du catalogue
   (« × 4, × 8 »). Une recherche indexée sur le second rate ce que l'enfant a sous les yeux
   (critère 3 de l'issue). Écrit AVANT le module : ce fichier échoue à l'import tant qu'il
   n'existe pas.

   Référence des attendus : l'écran (ui/catalog-nav.ts, renderCategorie → cardRow) et les
   exemples cités dans l'issue, pas le module testé.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { libelleAffiche } from '../src/core/libelle-affiche';
import { LESSONS_CALCUL_MENTAL } from '../src/core/lessons';
import {
	getAllLessons,
	getLessonById,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { labelLecon } from '../src/core/levels';

const NIVEAUX: SchoolLevel[] = ['ce2', 'cm1'];
const IDS_CALCUL_MENTAL = new Set(LESSONS_CALCUL_MENTAL.map((l) => l.id));

function def(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon « ${id} » absente du catalogue : test à réviser`);
	return l;
}

describe('libelleAffiche — calcul mental du moteur historique', () => {
	it('prémisse : 17 leçons, toutes au catalogue, dont le titre diffère du libellé catalogue', () => {
		expect(LESSONS_CALCUL_MENTAL).toHaveLength(17);
		for (const l of LESSONS_CALCUL_MENTAL) expect(getLessonById(l.id), l.id).toBeDefined();
		// Si titre et libellé coïncidaient, `labelLecon` seul passerait le test suivant : il
		// ne distinguerait plus rien.
		const distincts = LESSONS_CALCUL_MENTAL.filter((l) => l.title !== def(l.id).label);
		expect(distincts.length).toBeGreaterThan(0);
	});

	it('chacune rend son TITRE (celui de l’écran), à chaque niveau', () => {
		for (const l of LESSONS_CALCUL_MENTAL)
			for (const lv of NIVEAUX)
				expect(libelleAffiche(def(l.id), lv), `${l.id}@${lv}`).toBe(l.title);
	});

	it('exemples de l’issue : « Multiplier par 4, par 8 » (CE2), « Les multiples de 50 » (CM1)', () => {
		expect(libelleAffiche(def('math-multiplier-4-8'), 'ce2')).toBe('Multiplier par 4, par 8');
		expect(libelleAffiche(def('math-multiples-50'), 'cm1')).toBe('Les multiples de 50');
	});
});

describe('libelleAffiche — toute autre leçon', () => {
	it('prémisse : le reste du catalogue n’est pas vide', () => {
		expect(getAllLessons().filter((l) => !IDS_CALCUL_MENTAL.has(l.id)).length).toBeGreaterThan(100);
	});

	it('rend le libellé résolu au niveau (`labelLecon`), à chaque niveau', () => {
		for (const l of getAllLessons()) {
			if (IDS_CALCUL_MENTAL.has(l.id)) continue;
			for (const lv of NIVEAUX)
				expect(libelleAffiche(l, lv), `${l.id}@${lv}`).toBe(labelLecon(l, lv));
		}
	});

	it('suit le libellé par niveau (#436) : une même leçon, deux classes, deux libellés', () => {
		const l = getAllLessons().find(
			(x) =>
				!!x.labelNiveau &&
				x.levels.includes('ce2') &&
				x.levels.includes('cm1') &&
				!!x.labelNiveau.ce2 &&
				!!x.labelNiveau.cm1 &&
				x.labelNiveau.ce2 !== x.labelNiveau.cm1,
		);
		if (!l) throw new Error('aucune leçon à libellé distinct CE2/CM1 : test à réviser');
		expect(libelleAffiche(l, 'ce2')).toBe(l.labelNiveau!.ce2);
		expect(libelleAffiche(l, 'cm1')).toBe(l.labelNiveau!.cm1);
	});
});
