/* ============================================================
   Regroupement par rubrique (#109, #718) — `core/rubriques.ts`.
   Logique pure, sans DOM ni stockage.

   Exigence (en-tête du module, critère 9 de #718) : une catégorie range ses leçons
   par rubrique ; chaque rubrique prend la place de sa PREMIÈRE leçon dans l'ordre
   fourni, chaque leçon garde son rang relatif dans sa rubrique, et les leçons sans
   rubrique forment un groupe qui suit la même règle. L'aplat (`ordreEcran`) est
   l'ordre de lecture des cartes, repris tel quel par la recherche.

   Les attendus des cas fabriqués sont écrits à la main à partir de cette règle. Pour
   le vrai catalogue, on ne recalcule pas l'aplat : `verifierAplat` contrôle les
   quatre propriétés qui le déterminent entièrement.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { grouperParRubrique, ordreEcran } from '../src/core/rubriques';
import type { GroupeRubrique } from '../src/core/rubriques';
import { getAllLessons, getLessonsByCategory } from '../src/core/catalog';
import type { CategoryId, SchoolLevel } from '../src/core/catalog';

/** Le type le plus pauvre que le module accepte : rien d'un `LessonDef`. */
interface Mini {
	id: string;
	rubrique?: string;
}

const lecon = (id: string, rubrique?: string): Mini =>
	rubrique === undefined ? { id } : { id, rubrique };

/** Vue lisible d'un regroupement : une ligne `[rubrique, id…]` par groupe. */
const resume = (groupes: GroupeRubrique<Mini>[]): string[][] =>
	groupes.map((g) => [g.rubrique, ...g.lecons.map((x) => x.id)]);

const ids = (ls: readonly { id: string }[]): string[] => ls.map((x) => x.id);

/** Les quatre propriétés qui définissent l'aplat, sans le recalculer : (1) mêmes objets
    que l'entrée, sans perte ni doublon ; (2) une rubrique = un seul bloc contigu ;
    (3) les blocs dans l'ordre de première apparition dans l'entrée ; (4) dans un
    bloc, le rang relatif de l'entrée. */
function verifierAplat<T extends { rubrique?: string }>(
	entree: readonly T[],
	sortie: readonly T[],
	contexte: string,
): void {
	const cle = (x: T): string => x.rubrique ?? '';
	const dansEntree = new Set(entree);
	expect(sortie.length, `${contexte} : longueur`).toBe(entree.length);
	expect(new Set(sortie).size, `${contexte} : doublon`).toBe(entree.length);
	expect(
		sortie.every((x) => dansEntree.has(x)),
		`${contexte} : objet étranger à l'entrée`,
	).toBe(true);

	const premieresApparitions: string[] = [];
	for (const x of entree)
		if (!premieresApparitions.includes(cle(x))) premieresApparitions.push(cle(x));
	const blocs: string[] = [];
	for (const x of sortie) if (blocs[blocs.length - 1] !== cle(x)) blocs.push(cle(x));
	// Égalité stricte des deux listes : un bloc coupé en deux ferait apparaître deux fois
	// la même rubrique dans `blocs`, un bloc déplacé en changerait l'ordre.
	expect(blocs, `${contexte} : blocs`).toEqual(premieresApparitions);

	for (const r of premieresApparitions) {
		const rangs = sortie.filter((x) => cle(x) === r).map((x) => entree.indexOf(x));
		const croissant = rangs.every((v, i) => i === 0 || v > rangs[i - 1]);
		expect(croissant, `${contexte} : ordre relatif dans « ${r} »`).toBe(true);
	}
}

describe('grouperParRubrique / ordreEcran — bords', () => {
	it('liste vide : aucun groupe (même avec un sansTitre explicite) et un aplat vide', () => {
		expect(grouperParRubrique([])).toEqual([]);
		// Pas de groupe « Exercices » fantôme, vide, qu'un écran afficherait en en-tête seul.
		expect(grouperParRubrique([], 'Exercices')).toEqual([]);
		expect(ordreEcran([])).toEqual([]);
	});

	it('aucune leçon rubriquée : un seul groupe, nommé par la chaîne vide par défaut', () => {
		const a = lecon('a');
		const b = lecon('b');
		const c = lecon('c');
		const groupes = grouperParRubrique([a, b, c]);
		expect(resume(groupes)).toEqual([['', 'a', 'b', 'c']]);
		expect(ordreEcran([a, b, c])).toEqual([a, b, c]);
	});

	it('aucune leçon rubriquée : un sansTitre explicite nomme ce groupe unique', () => {
		const groupes = grouperParRubrique([lecon('a'), lecon('b')], 'Exercices');
		expect(resume(groupes)).toEqual([['Exercices', 'a', 'b']]);
	});

	it("sansTitre ne renomme jamais une rubrique réelle : il ne vise que les leçons qui n'en ont pas", () => {
		const groupes = grouperParRubrique([lecon('a', 'Présent'), lecon('b', 'Présent')], 'Exercices');
		expect(resume(groupes)).toEqual([['Présent', 'a', 'b']]);
	});
});

describe('grouperParRubrique / ordreEcran — ordre de première apparition', () => {
	/* Entrée r1, r2, r1, r3, r2 avec r1 = Présent, r2 = Futur, r3 = Imparfait.
	   Ordre attendu des groupes (première apparition) : Présent, Futur, Imparfait.
	   Il diffère de l'ordre alphabétique (Futur, Imparfait, Présent), de l'alphabétique
	   inverse (Présent, Imparfait, Futur) et de l'ordre de DERNIÈRE apparition
	   (Présent en 2, Imparfait en 3, Futur en 4 → Présent, Imparfait, Futur).
	   Les id sont choisis pour que le rang d'entrée DANS un groupe soit l'inverse de
	   l'ordre alphabétique des id (p-b avant p-a) : un tri par id se verrait. */
	const entrelacee = (): Mini[] => [
		lecon('p-b', 'Présent'),
		lecon('f-b', 'Futur'),
		lecon('p-a', 'Présent'),
		lecon('i', 'Imparfait'),
		lecon('f-a', 'Futur'),
	];

	it("rubriques entrelacées : groupes dans l'ordre de première apparition, pas alphabétique", () => {
		expect(resume(grouperParRubrique(entrelacee()))).toEqual([
			['Présent', 'p-b', 'p-a'],
			['Futur', 'f-b', 'f-a'],
			['Imparfait', 'i'],
		]);
	});

	it("rubriques entrelacées : l'aplat concatène les groupes dans cet ordre", () => {
		expect(ids(ordreEcran(entrelacee()))).toEqual(['p-b', 'p-a', 'f-b', 'f-a', 'i']);
	});

	/* Leçons sans rubrique au MILIEU de la liste (première en position 1) : leur groupe
	   s'intercale entre Présent (position 0) et Futur (position 2), ni en tête ni en queue. */
	const melangee = (): Mini[] => [
		lecon('a', 'Présent'),
		lecon('x'),
		lecon('b', 'Futur'),
		lecon('c', 'Présent'),
		lecon('y'),
	];

	it('avec et sans rubrique mêlées : le groupe sans titre prend la place de sa première leçon', () => {
		expect(resume(grouperParRubrique(melangee()))).toEqual([
			['Présent', 'a', 'c'],
			['', 'x', 'y'],
			['Futur', 'b'],
		]);
		expect(resume(grouperParRubrique(melangee(), 'Exercices'))).toEqual([
			['Présent', 'a', 'c'],
			['Exercices', 'x', 'y'],
			['Futur', 'b'],
		]);
		expect(ids(ordreEcran(melangee()))).toEqual(['a', 'c', 'x', 'y', 'b']);
	});

	it("les propriétés de l'aplat tiennent sur les cas fabriqués (témoin de verifierAplat)", () => {
		const e = entrelacee();
		const m = melangee();
		verifierAplat(e, ordreEcran(e), 'entrelacée');
		verifierAplat(m, ordreEcran(m), 'mêlée');
	});
});

describe('grouperParRubrique / ordreEcran — stabilité, non-mutation, références', () => {
	it("l'entrée n'est pas modifiée : tableau et leçons gelés, contenu inchangé après appel", () => {
		const lecons = [
			lecon('p-b', 'Présent'),
			lecon('x'),
			lecon('f', 'Futur'),
			lecon('p-a', 'Présent'),
		];
		const avant = lecons.map((x) => ({ ...x }));
		// Gel : un tri en place, un `push` ou une réécriture de `rubrique` lèverait ici
		// (les modules ES sont en mode strict).
		const entree: readonly Mini[] = Object.freeze(lecons.map((x) => Object.freeze(x)));
		grouperParRubrique(entree, 'Exercices');
		ordreEcran(entree);
		expect(entree).toEqual(avant);
		expect(ids(entree)).toEqual(['p-b', 'x', 'f', 'p-a']);
	});

	it('deux appels successifs donnent le même résultat', () => {
		const entree = [lecon('a', 'R1'), lecon('b', 'R2'), lecon('c', 'R1'), lecon('d')];
		expect(resume(grouperParRubrique(entree))).toEqual(resume(grouperParRubrique(entree)));
		expect(ordreEcran(entree)).toEqual(ordreEcran(entree));
	});

	it("les leçons renvoyées sont les objets d'entrée eux-mêmes, pas des copies", () => {
		const a = lecon('a', 'R1');
		const b = lecon('b', 'R2');
		const c = lecon('c', 'R1');
		const groupes = grouperParRubrique([a, b, c]);
		expect(groupes[0].lecons[0]).toBe(a);
		expect(groupes[0].lecons[1]).toBe(c);
		expect(groupes[1].lecons[0]).toBe(b);
		const aplat = ordreEcran([a, b, c]);
		expect(aplat[0]).toBe(a);
		expect(aplat[1]).toBe(c);
		expect(aplat[2]).toBe(b);
	});

	it("modifier le résultat ne touche ni l'entrée ni un appel suivant (pas d'alias)", () => {
		// Cas d'un seul groupe : celui où renvoyer le tableau d'entrée tel quel serait tentant.
		const entree = [lecon('a'), lecon('b')];
		const intrus = lecon('intrus');
		grouperParRubrique(entree)[0].lecons.push(intrus);
		ordreEcran(entree).push(intrus);
		expect(ids(entree)).toEqual(['a', 'b']);
		expect(resume(grouperParRubrique(entree))).toEqual([['', 'a', 'b']]);
		expect(ids(ordreEcran(entree))).toEqual(['a', 'b']);
	});
});

describe('grouperParRubrique / ordreEcran — générique', () => {
	it('accepte un type minimal { id, rubrique? } et conserve les champs en plus', () => {
		interface AvecPoids {
			id: string;
			rubrique?: string;
			poids: number;
		}
		const a: AvecPoids = { id: 'a', rubrique: 'R', poids: 3 };
		const b: AvecPoids = { id: 'b', poids: 7 };
		// L'annotation vérifie à la compilation que `T` est inféré, pas élargi.
		const groupes: GroupeRubrique<AvecPoids>[] = grouperParRubrique([a, b]);
		const aplat: AvecPoids[] = ordreEcran([b, a]);
		expect(groupes.map((g) => g.lecons.map((x) => x.poids))).toEqual([[3], [7]]);
		expect(aplat.map((x) => x.poids)).toEqual([7, 3]);
	});
});

describe('ordreEcran — sur le vrai catalogue', () => {
	const RECONNAITRE = 'Reconnaître les verbes';

	it("Conjugaison CE2 : l'aplat diffère de l'entrée, « Reconnaître les verbes » remonte à sa première leçon", () => {
		const entree = getLessonsByCategory('fr-conjugaison', 'ce2');
		const sortie = ordreEcran(entree);
		const rangsIn = entree.flatMap((l, i) => (l.rubrique === RECONNAITRE ? [i] : []));
		const rangsOut = sortie.flatMap((l, i) => (l.rubrique === RECONNAITRE ? [i] : []));
		const contigus = (r: number[]) => r.every((v, i) => i === 0 || v === r[i - 1] + 1);

		// Préconditions sur la donnée : sans elles, le test ne prouverait rien.
		expect(rangsIn.length).toBeGreaterThanOrEqual(2);
		expect(contigus(rangsIn), 'la rubrique doit être dispersée en entrée').toBe(false);

		expect(ids(sortie)).not.toEqual(ids(entree));
		expect(contigus(rangsOut), "la rubrique forme un seul bloc à l'écran").toBe(true);
		// Le bloc s'ouvre sur la première leçon de la rubrique en entrée, et la dernière
		// (posée en fin de programme CE2) n'est plus en queue de liste.
		expect(sortie[rangsOut[0]]).toBe(entree[rangsIn[0]]);
		expect(rangsOut[rangsOut.length - 1]).toBeLessThan(rangsIn[rangsIn.length - 1]);
		verifierAplat(entree, sortie, 'fr-conjugaison@ce2');
	});

	it("toute catégorie × niveau du catalogue : l'aplat respecte les quatre propriétés", () => {
		const paires = new Map<string, [CategoryId, SchoolLevel]>();
		for (const l of getAllLessons())
			for (const niv of l.levels) paires.set(`${l.category}@${niv}`, [l.category, niv]);
		expect(paires.size).toBeGreaterThan(1);
		for (const [nom, [cat, niv]] of paires) {
			const entree = getLessonsByCategory(cat, niv);
			verifierAplat(entree, ordreEcran(entree), nom);
		}
	});
});
