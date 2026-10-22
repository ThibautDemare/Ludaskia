/* ============================================================
   Couverture des formats d'exercice à l'impression (#777, critère 23).

   Écrit AVANT l'implémentation (#777, skill /cadrer) : rouge à l'arrivée sauf
   non-régressions. Ici, rouge dès l'import : le module n'existe pas encore.

   Contrat attendu : `src/core/impression-couverture.ts` exporte
     FORMES_IMPRIMEES: Record<Exercise['type'], { forme: string }>
   Le `Record` sur l'union fait échouer `npm run typecheck` dès qu'un `type` d'exercice
   est ajouté sans dire comment il s'imprime. Ce fichier tient l'autre moitié, à
   l'exécution : chaque format QUE LE CATALOGUE PRODUIT VRAIMENT (toutes leçons, tous
   niveaux, mode par défaut — celui de l'impression —, quelques graines) a une entrée,
   et cette entrée dit quelque chose (forme non vide).

   Fichier séparé de `impression-gate.test.ts` à dessein : l'import manquant ne doit pas
   faire tomber les critères 19 à 22.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getAllLessons, type LessonDef, type SchoolLevel } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';
import { FORMES_IMPRIMEES } from '../src/core/impression-couverture';

type TypeExercice = Exercise['type'];
type TableFormes = Readonly<Partial<Record<string, { forme: string }>>>;

const niveauxDe = (lesson: LessonDef): SchoolLevel[] =>
	lesson.levels.length > 0 ? lesson.levels : ['ce2'];

const GRAINES = [1, 2, 3, 4, 5, 6];

/** Formats produits par le catalogue, chacun avec le premier couple qui l'a produit (pour
    un message d'échec qui dit où regarder). Mode par défaut : c'est celui que tirent le
    bilan et la fiche imprimés. */
function formatsProduits(): Map<TypeExercice, string> {
	const vus = new Map<TypeExercice, string>();
	for (const lecon of getAllLessons()) {
		for (const niveau of niveauxDe(lecon)) {
			for (const graine of GRAINES) {
				const ex = withSeed(graine, () => lecon.exerciseType.generate({ level: niveau }));
				if (!vus.has(ex.type)) vus.set(ex.type, `${lecon.id} @${niveau}`);
			}
		}
	}
	return vus;
}

/** Formats sans forme imprimée déclarée : absents de la table, ou à forme vide. */
function formatsSansForme(formats: Iterable<string>, table: TableFormes): string[] {
	return [...formats].filter((t) => {
		const entree = Object.hasOwn(table, t) ? table[t] : undefined;
		return (entree?.forme ?? '').trim() === '';
	});
}

describe('Critère 23 : chaque format d’exercice produit a sa forme imprimée déclarée', () => {
	const produits = formatsProduits();

	it('critère 23 : l’inventaire des formats produits n’est pas effondré (plancher)', () => {
		expect(produits.size).toBeGreaterThanOrEqual(8);
		// Les formats dont le repli papier pose problème (#777) doivent être vus.
		for (const t of ['qcm', 'clicMot', 'appariement', 'posed', 'probleme']) {
			expect([...produits.keys()], t).toContain(t);
		}
	});

	it('critère 23 : chaque format produit par le catalogue est une clé de FORMES_IMPRIMEES, à forme non vide', () => {
		const manquants = [...produits]
			.filter(([t]) => formatsSansForme([t], FORMES_IMPRIMEES).length > 0)
			.map(([t, ou]) => `${t} (produit par ${ou})`);
		expect(manquants).toEqual([]);
	});

	it('critère 23 : aucune entrée de FORMES_IMPRIMEES n’a une forme vide', () => {
		expect(formatsSansForme(Object.keys(FORMES_IMPRIMEES), FORMES_IMPRIMEES)).toEqual([]);
	});

	it('témoins : le contrôle signale un format absent ou à forme vide, et seulement ça', () => {
		expect(formatsSansForme(['qcm', 'clicMot'], { qcm: { forme: 'cases à cocher' } })).toEqual([
			'clicMot',
		]);
		expect(
			formatsSansForme(['qcm', 'clicMot'], {
				qcm: { forme: 'cases à cocher' },
				clicMot: { forme: '  ' },
			}),
		).toEqual(['clicMot']);
		expect(
			formatsSansForme(['qcm', 'clicMot'], {
				qcm: { forme: 'cases à cocher' },
				clicMot: { forme: 'phrase recopiée, mot à écrire' },
			}),
		).toEqual([]);
	});
});
