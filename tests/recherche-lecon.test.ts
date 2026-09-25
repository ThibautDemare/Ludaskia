/* ============================================================
   Recherche de leçon côté ENFANT (#718) — src/core/recherche-lecon.ts (pur).

   Écrit AVANT le code, par un auteur distinct de l'implémentation : chaque attendu
   vient des critères numérotés de l'issue (2, 3, 5, 6, 7, 8, 9, 10, 17, 19, 20) et
   du contrat technique gelé, jamais du code. Tant que le module n'existe pas, ce
   fichier échoue à l'import : c'est attendu.

   Deux sources de catalogue, pour deux risques différents :
   - un catalogue INJECTÉ (fixtures minimales) isole une règle à la fois — la
     correspondance sur une catégorie qui n'entraîne pas ses leçons, la catégorie
     vide jamais proposée, la déduplication libellé/mot-clé ;
   - le VRAI catalogue tient les exemples que l'issue cite noir sur blanc
     (« multiplier », « fois », « dictée », « geometrie ») et les invariants qui ne
     se voient que sur tout le contenu (niveau par matière, ordre de l'écran).

   Écart assumé avec le contrat technique : le critère 9 prend pour référence l'ordre
   de l'ÉCRAN de la catégorie, qui regroupe par rubrique ; le contrat parle du « même
   tri que getLessonsByCategory ». Les deux divergent réellement (cf. `ordreEcran`) ;
   c'est le critère qui fait foi ici.

   Mots des fixtures : inventés (« zorglub », « bidule »), pour qu'aucun mot-clé
   réel de catégorie ne vienne s'ajouter aux résultats et fausser un compte.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import {
	RECHERCHE_MIN,
	rechercherLecons,
	type DicteeRecherche,
	type ResultatsRecherche,
	type SourceRecherche,
} from '../src/core/recherche-lecon';
import {
	CATEGORIES,
	ORTHO_CATEGORY_ID,
	SUBJECTS,
	getAllLessons,
	getLessonById,
	getLessonsByCategory,
	type LessonDef,
	type SchoolLevel,
	type SubjectId,
} from '../src/core/catalog';
import type { ExerciseType } from '../src/core/exercise';
import { LESSONS_CALCUL_MENTAL } from '../src/core/lessons';
import { labelLecon } from '../src/core/levels';
import { arbreCatalogue } from '../src/core/catalogue-arbre';
import type { Profile } from '../src/core/profiles';

/* ---------- Niveau actif par matière ---------- */
type NiveauParMatiere = (subject: SubjectId) => SchoolLevel;
const partout =
	(lv: SchoolLevel): NiveauParMatiere =>
	() =>
		lv;
const mele =
	(math: SchoolLevel, francais: SchoolLevel): NiveauParMatiere =>
	(s) =>
		s === 'math' ? math : francais;
const CE2 = partout('ce2');
const CM1 = partout('cm1');
/* L'enfant « en dents de scie » (#225) : CM1 en maths, CE2 en français — et l'inverse. */
const MELE = mele('cm1', 'ce2');
const MELE_INVERSE = mele('ce2', 'cm1');
const PROFILS: [string, NiveauParMatiere][] = [
	['CE2', CE2],
	['CM1', CM1],
	['maths CM1 / français CE2', MELE],
	['maths CE2 / français CM1', MELE_INVERSE],
];

/* ---------- Fixtures ---------- */
const STUB: ExerciseType = {
	generate: () => ({ type: 'text', question: 'q', answer: 'a' }),
	check: () => false,
};

function matiereDe(categoryId: string): SubjectId {
	const c = CATEGORIES.find((x) => x.id === categoryId);
	if (!c) throw new Error(`catégorie inconnue « ${categoryId} » : fixture à réviser`);
	return c.subject;
}

interface Fab {
	id: string;
	label: string;
	category: string;
	levels?: SchoolLevel[];
	motsCles?: string[];
	labelNiveau?: Partial<Record<SchoolLevel, string>>;
	rubrique?: string;
}
function fab(o: Fab): LessonDef {
	const def: LessonDef = {
		id: o.id,
		label: o.label,
		subject: matiereDe(o.category),
		category: o.category,
		levels: o.levels ?? ['ce2'],
		exerciseType: STUB,
	};
	if (o.motsCles) def.motsCles = o.motsCles;
	if (o.labelNiveau) def.labelNiveau = o.labelNiveau;
	if (o.rubrique) def.rubrique = o.rubrique;
	return def;
}

function source(
	lessons: readonly LessonDef[],
	niveau: NiveauParMatiere,
	dictees: readonly DicteeRecherche[] = [],
): SourceRecherche {
	return { lessons, niveau, dictees };
}
const reel = (niveau: NiveauParMatiere, dictees: readonly DicteeRecherche[] = []) =>
	source(getAllLessons(), niveau, dictees);

/* ---------- Lecture d'un résultat ---------- */
const idsLecons = (r: ResultatsRecherche): string[] =>
	r.groupes.flatMap((g) => g.lecons.map((l) => l.id));
const idsCategories = (r: ResultatsRecherche): string[] => r.categories.map((c) => c.categoryId);
const ligne = (r: ResultatsRecherche, id: string) =>
	r.groupes.flatMap((g) => g.lecons).find((l) => l.id === id);
const nbLecons = (r: ResultatsRecherche): number =>
	r.groupes.reduce((n, g) => n + g.lecons.length, 0);
const memeSuite = (a: readonly string[], b: readonly string[]): boolean =>
	a.length === b.length && a.every((x, i) => x === b[i]);

const INACTIVE: ResultatsRecherche = {
	active: false,
	categories: [],
	groupes: [],
	dictees: [],
	total: 0,
};

/* Ce que l'écran de catégorie AFFICHE pour une leçon (ui/catalog-nav.ts, renderCategorie →
   cardRow) : le titre « riche » du moteur historique de calcul mental quand il existe,
   sinon le libellé résolu au niveau (#436). C'est la référence du critère 3 (« le libellé
   que l'enfant voit dans l'écran de sa catégorie »), prise à l'écran, pas au module testé. */
const TITRES_RICHES = new Map<string, string>(LESSONS_CALCUL_MENTAL.map((l) => [l.id, l.title]));
function libelleVu(def: LessonDef, niveau: SchoolLevel): string {
	return TITRES_RICHES.get(def.id) ?? labelLecon(def, niveau);
}

/* Ordre dans lequel l'écran de la catégorie PRÉSENTE ses leçons — la référence du critère 9
   (« Violé si l'ordre diffère de celui de l'écran de la catégorie »). L'écran part de
   l'ordre pédagogique (`getLessonsByCategory(cat, niveau)`) puis REGROUPE par rubrique,
   rubriques dans leur ordre de première apparition (ui/catalog-nav.ts, renderCategorie et
   renderOrthoCategorie). Les deux ordres divergent dès que les rubriques s'entrelacent dans
   la progression (conjugaison CE2 : « Retrouver l'infinitif » tombe entre le présent et le
   futur dans la progression, mais rejoint « Reconnaître les verbes » à l'écran). */
function ordreEcran(lessons: readonly LessonDef[]): string[] {
	const rubriques: { nom: string; ids: string[] }[] = [];
	for (const l of lessons) {
		const nom = l.rubrique ?? '';
		let r = rubriques.find((x) => x.nom === nom);
		if (!r) {
			r = { nom, ids: [] };
			rubriques.push(r);
		}
		r.ids.push(l.id);
	}
	return rubriques.flatMap((r) => r.ids);
}
const ordreEcranCategorie = (categoryId: string, niveau: SchoolLevel): string[] =>
	ordreEcran(getLessonsByCategory(categoryId, niveau));

function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi + ' : test à réviser');
	return l;
}

/* Dictées de mots telles que l'appelant les passerait (déjà filtrées au niveau actif).
   Ordre d'entrée volontairement NON alphabétique, pour que « ordre conservé » ne se
   confonde pas avec « trié ». */
const DICTEES: DicteeRecherche[] = [
	{ id: 'd-ferme', label: 'Les animaux de la ferme' },
	{ id: 'd-s12', label: 'Mots de la semaine 12' },
	{ id: 'd-gout', label: 'La SEMAINE du goût' },
	{ id: 'd-ete', label: 'Été au jardin' },
];

/* ============================================================
   Seuil de déclenchement — critères 2 et 10
   ============================================================ */
describe('seuil de déclenchement (critères 2 et 10)', () => {
	it('critère 2 : RECHERCHE_MIN vaut 2 (« dès 2 caractères »)', () => {
		expect(RECHERCHE_MIN).toBe(2);
	});

	it('requête vide, blanche ou d’un seul caractère → inactive, et TOUT est vide (dictées comprises)', () => {
		// « a » est contenu dans presque tout, dictées comprises : si le seuil n'était pas tenu,
		// ce cas remplirait toutes les rubriques. `é` = « e » + accent aigu COMBINANT :
		// deux unités de code, un seul caractère une fois normalisé (clavier qui compose à part).
		for (const q of ['', ' ', '   ', '\t', 'a', ' a ', 'é', 'é', 'Z']) {
			expect(rechercherLecons(q, reel(CE2, DICTEES)), JSON.stringify(q)).toEqual(INACTIVE);
		}
	});

	it('exactement 2 caractères → active, même quand rien ne correspond', () => {
		const rien = rechercherLecons('qz', reel(CE2, DICTEES));
		expect(rien).toEqual({ ...INACTIVE, active: true });
		const quelqueChose = rechercherLecons('ge', reel(CE2, DICTEES));
		expect(quelqueChose.active).toBe(true);
		expect(quelqueChose.total).toBeGreaterThan(0);
	});

	it('critère 10 : champ vidé après une recherche → de nouveau inactive, sans résultat résiduel', () => {
		const s = reel(CE2, DICTEES);
		expect(rechercherLecons('multiplier', s).total).toBeGreaterThan(0); // prémisse
		expect(rechercherLecons('', s)).toEqual(INACTIVE);
		expect(rechercherLecons('m', s)).toEqual(INACTIVE);
	});
});

/* ============================================================
   Normalisation de la requête — critère 2
   ============================================================ */
describe('casse, accents, ligatures et espaces indifférents (critère 2)', () => {
	it('« Geometrie », « géométrie », « GÉOMÉTRIE » donnent EXACTEMENT le même résultat', () => {
		const s = reel(CE2, DICTEES);
		const reference = rechercherLecons('géométrie', s);
		expect(idsCategories(reference)).toContain('math-geometrie'); // prémisse (critère 5)
		for (const q of ['Geometrie', 'geometrie', 'GÉOMÉTRIE', 'GeOmÉtRiE', '  géométrie  '])
			expect(rechercherLecons(q, s), q).toEqual(reference);
	});

	it('la requête peut porter l’accent que le libellé n’a pas, et inversement', () => {
		const lessons = [
			fab({ id: 'fx-ete', label: 'Zorglub ete', category: 'math-calcul' }),
			fab({ id: 'fx-noel', label: 'Zorglub à Noël', category: 'math-calcul' }),
		];
		expect(idsLecons(rechercherLecons('été', source(lessons, CE2)))).toEqual(['fx-ete']);
		expect(idsLecons(rechercherLecons('a noel', source(lessons, CE2)))).toEqual(['fx-noel']);
	});

	it('ligature : « oeufs de paques » trouve « Les œufs de Pâques »', () => {
		const lessons = [
			fab({ id: 'fx-oeuf', label: 'Les œufs de Pâques', category: 'fr-vocabulaire' }),
		];
		expect(idsLecons(rechercherLecons('oeufs de paques', source(lessons, CE2)))).toEqual([
			'fx-oeuf',
		]);
	});

	it('espaces multiples de la requête réduits : « multiplier   par » trouve « Multiplier par 4, par 8 »', () => {
		const r = rechercherLecons('  multiplier   par  ', reel(CE2));
		expect(idsLecons(r)).toContain('math-multiplier-4-8');
	});

	it('un mot-clé accentué est trouvé sans accent, en sous-chaîne, quelle que soit la casse', () => {
		const lessons = [
			fab({ id: 'fx-eq', label: 'Zorglub', category: 'math-geometrie', motsCles: ['Équerre'] }),
		];
		for (const q of ['equerre', 'EQUERRE', 'équer', 'querr'])
			expect(idsLecons(rechercherLecons(q, source(lessons, CE2))), q).toEqual(['fx-eq']);
	});

	it('la requête est cherchée LITTÉRALEMENT : ses caractères spéciaux ne font ni planter ni tout trouver', () => {
		// Une implémentation qui construirait une expression régulière depuis la saisie
		// planterait sur « (( » et trouverait tout sur « .* ».
		const s = reel(CE2, DICTEES);
		for (const q of ['((', '[a', '.*', '\\d', '+?', '^$', '|e'])
			expect(() => rechercherLecons(q, s), q).not.toThrow();
		expect(rechercherLecons('.*', s)).toEqual({ ...INACTIVE, active: true });
		// …et un vrai signe d'un libellé reste trouvable tel quel.
		expect(idsLecons(rechercherLecons('9, 19', s))).toContain('math-ajouter-9-19-29');
	});
});

/* ============================================================
   Ce que l'enfant voit — critère 3
   ============================================================ */
describe('une leçon est trouvée par le libellé que l’enfant voit, ou par un mot-clé (critère 3)', () => {
	it('« multiplier » rend « Multiplier par 4, par 8 » sous un profil CE2, libellé affiché à l’appui', () => {
		const r = rechercherLecons('multiplier', reel(CE2));
		// Le libellé attendu est celui que l'issue cite, pas celui du catalogue (« × 4, × 8 ») :
		// c'est la ligne que l'enfant doit reconnaître, et son nom accessible (critère 14).
		expect(ligne(r, 'math-multiplier-4-8')?.label).toBe('Multiplier par 4, par 8');
	});

	it('« fois » rend les tables de multiplication (mot-clé de l’enfant, absent du libellé)', () => {
		const r = rechercherLecons('fois', reel(CE2));
		expect(idsLecons(r)).toContain('math-tables-multiplication');
	});

	it('toute leçon du niveau actif est trouvée par son PROPRE libellé affiché, et sa ligne porte ce libellé', () => {
		// Balayage exhaustif, profil par profil : aucune leçon visible n'est introuvable par
		// ce qu'elle affiche, et aucune ligne ne porte un autre libellé que celui de l'écran.
		for (const [nom, niveau] of PROFILS) {
			const s = reel(niveau);
			for (const def of getAllLessons()) {
				const lv = niveau(def.subject);
				if (!def.levels.includes(lv)) continue;
				const vu = libelleVu(def, lv);
				expect(ligne(rechercherLecons(vu, s), def.id)?.label, `${nom} · ${def.id} « ${vu} »`).toBe(
					vu,
				);
			}
		}
	});

	it('trouvée par un MORCEAU de mot-clé, et la ligne garde le libellé affiché (pas le mot-clé)', () => {
		const lessons = [
			fab({ id: 'fx-bid', label: 'Zorglub', category: 'math-calcul', motsCles: ['les bidules'] }),
		];
		const r = rechercherLecons('bidule', source(lessons, CE2));
		expect(ligne(r, 'fx-bid')?.label).toBe('Zorglub');
	});

	it('le libellé affiché est celui du niveau actif DE LA MATIÈRE (#436)', () => {
		const lessons = [
			fab({
				id: 'fx-noyau',
				label: 'Trouver le zorglub',
				category: 'fr-grammaire',
				levels: ['ce2', 'cm1'],
				labelNiveau: { ce2: 'Trouver le zorglub', cm1: 'Trouver le zorglub noyau' },
			}),
		];
		// Même matière de maths dans les deux cas : seul le niveau du FRANÇAIS change.
		const sousFrCe2 = rechercherLecons('zorglub', source(lessons, MELE));
		const sousFrCm1 = rechercherLecons('zorglub', source(lessons, CM1));
		expect(ligne(sousFrCe2, 'fx-noyau')?.label).toBe('Trouver le zorglub');
		expect(ligne(sousFrCm1, 'fx-noyau')?.label).toBe('Trouver le zorglub noyau');
	});

	it('une leçon qui correspond par son libellé ET par un ou plusieurs mots-clés n’apparaît qu’une fois', () => {
		const lessons = [
			fab({
				id: 'fx-double',
				label: 'Zorglub rouge',
				category: 'math-calcul',
				motsCles: ['zorglub', 'le zorglub bleu'],
			}),
		];
		const r = rechercherLecons('zorglub', source(lessons, CE2));
		expect(idsLecons(r)).toEqual(['fx-double']);
		expect(r.total).toBe(1);
	});
});

/* ============================================================
   Niveau actif par matière — critères 7 et 17
   ============================================================ */
describe('les résultats respectent le niveau actif, matière par matière (critères 7 et 17)', () => {
	it('prémisse : « Les multiples de 25 » est CE2 seul, « Les multiples de 50 » CM1 seul', () => {
		expect(getLessonById('math-multiples-25')?.levels).toEqual(['ce2']);
		expect(getLessonById('math-multiples-50')?.levels).toEqual(['cm1']);
	});

	it('« multiples de » : chaque profil ne voit que la leçon de SA classe de maths', () => {
		const cas: [string, NiveauParMatiere, string, string][] = [
			['CE2', CE2, 'math-multiples-25', 'math-multiples-50'],
			['CM1', CM1, 'math-multiples-50', 'math-multiples-25'],
			['maths CM1 / français CE2', MELE, 'math-multiples-50', 'math-multiples-25'],
			['maths CE2 / français CM1', MELE_INVERSE, 'math-multiples-25', 'math-multiples-50'],
		];
		for (const [nom, niveau, visible, cachee] of cas) {
			const trouves = idsLecons(rechercherLecons('multiples de', reel(niveau)));
			expect(trouves, nom).toContain(visible);
			expect(trouves, nom).not.toContain(cachee);
		}
		// Et le libellé rendu est celui que l'enfant de CM1 voit à l'écran.
		expect(ligne(rechercherLecons('multiples de 50', reel(CM1)), 'math-multiples-50')?.label).toBe(
			'Les multiples de 50',
		);
	});

	it('profil mêlé : une leçon hors du niveau de SA matière reste introuvable, même par son libellé exact', () => {
		const frCm1 = leconTelleQue(
			(l) => l.subject === 'francais' && l.levels.includes('cm1') && !l.levels.includes('ce2'),
			'de français CM1 seule',
		);
		const mathCe2 = leconTelleQue(
			(l) => l.subject === 'math' && l.levels.includes('ce2') && !l.levels.includes('cm1'),
			'de maths CE2 seule',
		);
		const frCe2 = leconTelleQue(
			(l) => l.subject === 'francais' && l.levels.includes('ce2') && !l.levels.includes('cm1'),
			'de français CE2 seule',
		);
		const mathCm1 = leconTelleQue(
			(l) => l.subject === 'math' && l.levels.includes('cm1') && !l.levels.includes('ce2'),
			'de maths CM1 seule',
		);
		const trouve = (def: LessonDef, lv: SchoolLevel, niveau: NiveauParMatiere) =>
			idsLecons(rechercherLecons(libelleVu(def, lv), reel(niveau))).includes(def.id);
		// Maths CM1 / français CE2 : les deux « du bon côté » sortent, les deux autres non.
		expect(trouve(mathCm1, 'cm1', MELE)).toBe(true);
		expect(trouve(frCe2, 'ce2', MELE)).toBe(true);
		expect(trouve(frCm1, 'cm1', MELE)).toBe(false);
		expect(trouve(mathCe2, 'ce2', MELE)).toBe(false);
	});

	it('INVARIANT : aucune leçon rendue n’est hors du niveau actif de sa matière', () => {
		const requetes = ['le', 'la', 'au', 'es', 'on', 'de', 'ou', 'er', 'mult', 'nombre', 'present'];
		for (const [nom, niveau] of PROFILS) {
			for (const q of requetes) {
				for (const id of idsLecons(rechercherLecons(q, reel(niveau)))) {
					const def = getLessonById(id);
					expect(def, `${nom} · « ${q} » · ${id} inconnue du catalogue`).toBeDefined();
					expect(def!.levels, `${nom} · « ${q} » · ${id}`).toContain(niveau(def!.subject));
				}
			}
		}
	});

	it('un mot-clé ne contourne pas le niveau : leçon CM1 seule, cherchée par son mot-clé sous CE2', () => {
		const lessons = [
			fab({
				id: 'fx-cm1',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['cm1'],
				motsCles: ['bidule'],
			}),
		];
		expect(idsLecons(rechercherLecons('bidule', source(lessons, CE2)))).toEqual([]);
		expect(idsLecons(rechercherLecons('bidule', source(lessons, CM1)))).toEqual(['fx-cm1']);
	});
});

/* ============================================================
   Catégories — critère 5, et différence voulue avec le sélecteur adulte (critère 20)
   ============================================================ */
describe('une catégorie est trouvée par son nom ou un mot-clé (critère 5)', () => {
	it('« geometrie » propose Géométrie, nommée en texte avec sa matière (critère 8)', () => {
		const r = rechercherLecons('geometrie', reel(CE2));
		const cat = r.categories.find((c) => c.categoryId === 'math-geometrie');
		expect(cat).toMatchObject({
			categoryId: 'math-geometrie',
			label: 'Géométrie',
			subject: 'math',
			subjectLabel: 'Mathématiques',
		});
	});

	it('« dictée » propose l’écran Orthographe (mot-clé de la catégorie)', () => {
		for (const q of ['dictée', 'dictee', 'DICTÉE']) {
			const r = rechercherLecons(q, reel(CE2, DICTEES));
			expect(idsCategories(r), q).toContain(ORTHO_CATEGORY_ID);
		}
	});

	it('la correspondance sur une catégorie N’ENTRAÎNE PAS ses leçons', () => {
		const lessons = [
			fab({ id: 'fx-angle', label: 'Les angles droits', category: 'math-geometrie' }),
			fab({ id: 'fx-sym', label: 'La symétrie', category: 'math-geometrie' }),
		];
		const r = rechercherLecons('geometrie', source(lessons, CE2));
		expect(idsCategories(r)).toEqual(['math-geometrie']);
		expect(r.groupes).toEqual([]);
		expect(r.total).toBe(1);
	});

	it('critère 20 : le sélecteur adulte, lui, garde son comportement (la catégorie entraîne ses leçons)', () => {
		// Même catalogue, même saisie : c'est la différence VOULUE entre les deux recherches.
		// Si quelqu'un « factorise » l'une sur l'autre, l'une des deux moitiés tombe.
		const lessons = [
			fab({ id: 'fx-angle', label: 'Les angles droits', category: 'math-geometrie' }),
			fab({ id: 'fx-sym', label: 'La symétrie', category: 'math-geometrie' }),
		];
		const adulte: Profile = {
			uuid: 'u',
			name: 'T',
			emoji: '🐧',
			updatedAt: 0,
			niveauReference: 'ce2',
		};
		const arbre = arbreCatalogue(adulte, { filtre: 'ce2', lessons, recherche: 'geometrie' });
		expect(arbre.flatMap((m) => m.categories.flatMap((c) => c.lecons.map((l) => l.id)))).toEqual([
			'fx-angle',
			'fx-sym',
		]);
		expect(nbLecons(rechercherLecons('geometrie', source(lessons, CE2)))).toBe(0);
	});

	it('une catégorie sans leçon au niveau actif n’est JAMAIS proposée', () => {
		const lessons = [
			fab({ id: 'fx-geo-cm1', label: 'Zorglub', category: 'math-geometrie', levels: ['cm1'] }),
		];
		expect(idsCategories(rechercherLecons('geometrie', source(lessons, CE2)))).toEqual([]);
		expect(idsCategories(rechercherLecons('geometrie', source(lessons, CM1)))).toEqual([
			'math-geometrie',
		]);
		// Catalogue vide : aucune catégorie, même celles dont le nom correspond.
		expect(rechercherLecons('geometrie', source([], CE2))).toEqual({ ...INACTIVE, active: true });
	});

	it('vrai catalogue : une catégorie qui n’a de contenu qu’au CM1 n’est pas proposée sous CE2', () => {
		const cat = CATEGORIES.find((c) => {
			const dedans = getAllLessons().filter((l) => l.category === c.id);
			return (
				dedans.length > 0 &&
				dedans.every((l) => !l.levels.includes('ce2')) &&
				dedans.some((l) => l.levels.includes('cm1'))
			);
		});
		if (!cat) throw new Error('catalogue sans catégorie CM1 seule : test à réviser');
		expect(idsCategories(rechercherLecons(cat.label, reel(CE2)))).not.toContain(cat.id);
		expect(idsCategories(rechercherLecons(cat.label, reel(CM1)))).toContain(cat.id);
	});

	it('Orthographe sans leçon mais avec une dictée visible → proposée ; sans rien → absente', () => {
		const dictee: DicteeRecherche[] = [{ id: 'd-1', label: 'Zorglub' }];
		expect(idsCategories(rechercherLecons('orthographe', source([], CE2, dictee)))).toEqual([
			ORTHO_CATEGORY_ID,
		]);
		expect(idsCategories(rechercherLecons('orthographe', source([], CE2, [])))).toEqual([]);
	});

	it('les dictées ne remplissent QUE l’Orthographe (une autre catégorie vide reste absente)', () => {
		const dictee: DicteeRecherche[] = [{ id: 'd-1', label: 'Zorglub' }];
		expect(idsCategories(rechercherLecons('grammaire', source([], CE2, dictee)))).toEqual([]);
	});

	it('plusieurs catégories trouvées : dans l’ordre du catalogue, sans doublon', () => {
		const r = rechercherLecons('calcul', reel(CE2));
		const ids = idsCategories(r);
		expect(ids).toEqual(expect.arrayContaining(['math-calcul', 'math-calcul-mental'])); // prémisse
		expect(ids).toEqual(CATEGORIES.map((c) => c.id).filter((id) => ids.includes(id)));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('INVARIANT : toute catégorie proposée porte les libellés du catalogue et a du contenu au niveau', () => {
		for (const [nom, niveau] of PROFILS) {
			for (const q of ['ge', 'ca', 'on', 'ra', 'or', 'ul', 'dictee', 'geometrie']) {
				for (const c of rechercherLecons(q, reel(niveau)).categories) {
					const def = CATEGORIES.find((x) => x.id === c.categoryId);
					expect(def, `${nom} · « ${q} » · ${c.categoryId}`).toBeDefined();
					expect(c.label).toBe(def!.label);
					expect(c.subject).toBe(def!.subject);
					expect(c.subjectLabel).toBe(SUBJECTS.find((s) => s.id === def!.subject)!.label);
					expect(
						getLessonsByCategory(c.categoryId, niveau(c.subject)).length,
						`${nom} · « ${q} » · ${c.categoryId} proposée VIDE`,
					).toBeGreaterThan(0);
				}
			}
		}
	});
});

/* ============================================================
   Dictées de mots — critère 6
   ============================================================ */
describe('les dictées de mots sont trouvées par leur nom (critère 6)', () => {
	it('« semaine » trouve « Mots de la semaine 12 », dans l’ordre d’entrée', () => {
		const r = rechercherLecons('semaine', source([], CE2, DICTEES));
		expect(r.dictees).toEqual([
			{ id: 'd-s12', label: 'Mots de la semaine 12' },
			{ id: 'd-gout', label: 'La SEMAINE du goût' },
		]);
	});

	it('ordre d’ENTRÉE conservé (pas un tri) : liste inversée → résultats inversés', () => {
		const inverse = [...DICTEES].reverse();
		expect(rechercherLecons('semaine', source([], CE2, inverse)).dictees.map((d) => d.id)).toEqual([
			'd-gout',
			'd-s12',
		]);
	});

	it('accents indifférents sur le nom de la liste', () => {
		expect(rechercherLecons('ete au', source([], CE2, DICTEES)).dictees.map((d) => d.id)).toEqual([
			'd-ete',
		]);
	});

	it('aucune dictée ne correspond → liste vide (et le reste n’est pas affecté)', () => {
		const lessons = [fab({ id: 'fx-z', label: 'Zorglub', category: 'math-calcul' })];
		const r = rechercherLecons('zorglub', source(lessons, CE2, DICTEES));
		expect(r.dictees).toEqual([]);
		expect(idsLecons(r)).toEqual(['fx-z']);
	});
});

/* ============================================================
   Groupes et ordre — critères 8 et 9
   ============================================================ */
describe('leçons groupées par catégorie, dans l’ordre de l’écran de la catégorie (critères 8 et 9)', () => {
	it('groupes dans l’ordre du catalogue, même si les leçons arrivent dans l’autre sens', () => {
		const lessons = [
			fab({ id: 'fx-fr', label: 'Zorglub en français', category: 'fr-grammaire' }),
			fab({ id: 'fx-math', label: 'Zorglub en maths', category: 'math-calcul' }),
		];
		const r = rechercherLecons('zorglub', source(lessons, CE2));
		expect(r.groupes.map((g) => g.categoryId)).toEqual(['math-calcul', 'fr-grammaire']);
		expect(r.groupes[1]).toMatchObject({
			categoryId: 'fr-grammaire',
			label: 'Grammaire',
			subject: 'francais',
			subjectLabel: 'Français',
			lecons: [{ id: 'fx-fr', label: 'Zorglub en français' }],
		});
	});

	it('prémisse du critère 9 : sur le vrai catalogue, l’ordre de l’écran n’est PAS l’ordre brut de la progression', () => {
		// Sans cette prémisse, le test suivant ne distinguerait pas « ordre de l'écran » de
		// « getLessonsByCategory » — et un groupe rendu dans le second passerait pour juste.
		const divergentes = CATEGORIES.flatMap((c) =>
			(['ce2', 'cm1'] as SchoolLevel[])
				.filter((lv) => {
					const brut = getLessonsByCategory(c.id, lv).map((l) => l.id);
					return !memeSuite(brut, ordreEcranCategorie(c.id, lv));
				})
				.map((lv) => `${c.id}@${lv}`),
		);
		expect(divergentes).toContain('fr-conjugaison@ce2');
	});

	it('critère 9 : rubriques entrelacées dans la progression → l’ordre de l’ÉCRAN (regroupé par rubrique)', () => {
		// Fixtures hors de l'ordre pédagogique : la progression vaut l'ordre d'entrée.
		const lessons = [
			fab({ id: 'fx-a', label: 'Zorglub A', category: 'fr-vocabulaire', rubrique: 'Rubrique 1' }),
			fab({ id: 'fx-b', label: 'Zorglub B', category: 'fr-vocabulaire', rubrique: 'Rubrique 2' }),
			fab({ id: 'fx-c', label: 'Zorglub C', category: 'fr-vocabulaire', rubrique: 'Rubrique 1' }),
		];
		// À l'écran : Rubrique 1 (A, C) puis Rubrique 2 (B).
		expect(idsLecons(rechercherLecons('zorglub', source(lessons, CE2)))).toEqual([
			'fx-a',
			'fx-c',
			'fx-b',
		]);
	});

	it('critère 9 : dans chaque groupe, l’ordre de l’écran de la catégorie — même avec un catalogue fourni à l’envers', () => {
		// Catalogue INVERSÉ en entrée : une implémentation qui garderait l'ordre reçu (au lieu
		// de suivre l'écran de la catégorie) rendrait chaque groupe à l'envers.
		const inverse = [...getAllLessons()].reverse();
		let divergences = 0;
		for (const [nom, niveau] of PROFILS) {
			for (const q of ['au', 'le', 'er', 'on', 'present', 'verbe']) {
				for (const g of rechercherLecons(q, source(inverse, niveau)).groupes) {
					const trouves = g.lecons.map((l) => l.id);
					const ecran = ordreEcranCategorie(g.categoryId, niveau(g.subject)).filter((id) =>
						trouves.includes(id),
					);
					expect(trouves, `${nom} · « ${q} » · ${g.categoryId}`).toEqual(ecran);
					const recu = inverse.map((l) => l.id).filter((id) => trouves.includes(id));
					if (!memeSuite(ecran, recu)) divergences++;
				}
			}
		}
		// Le verrou n'est pas creux : l'ordre reçu différait bel et bien de l'ordre attendu.
		expect(divergences).toBeGreaterThan(0);
	});

	it('critère 9 : l’ordre ne change pas d’une lettre à l’autre, et une lettre de plus n’ajoute rien', () => {
		const chaines = [
			['pr', 'pre', 'pres', 'prese', 'presen', 'present'],
			['ge', 'geo', 'geom'],
			['mu', 'mul', 'mult', 'multi', 'multiplier'],
		];
		// Prémisse : la frappe progressive garde plusieurs leçons jusqu'au bout, sinon le test
		// ne compare que des listes vides.
		expect(idsLecons(rechercherLecons('present', reel(CE2))).length).toBeGreaterThan(4);
		for (const [nom, niveau] of PROFILS) {
			for (const chaine of chaines) {
				for (let i = 1; i < chaine.length; i++) {
					const avant = idsLecons(rechercherLecons(chaine[i - 1], reel(niveau)));
					const apres = idsLecons(rechercherLecons(chaine[i], reel(niveau)));
					const ctx = `${nom} · « ${chaine[i - 1]} » → « ${chaine[i]} »`;
					for (const id of apres) expect(avant, ctx).toContain(id);
					expect(apres, ctx).toEqual(avant.filter((id) => apres.includes(id)));
				}
			}
		}
	});

	it('INVARIANT : un groupe par catégorie, jamais vide, libellés du catalogue, leçons de la bonne catégorie', () => {
		const ordreCategories = CATEGORIES.map((c) => c.id);
		for (const [nom, niveau] of PROFILS) {
			for (const q of ['le', 'la', 'au', 'on', 'er', 'es']) {
				const r = rechercherLecons(q, reel(niveau));
				const cats = r.groupes.map((g) => g.categoryId);
				expect(cats, `${nom} · « ${q} »`).toEqual(
					ordreCategories.filter((id) => cats.includes(id)),
				);
				expect(new Set(cats).size).toBe(cats.length);
				const tous = idsLecons(r);
				expect(new Set(tous).size, `${nom} · « ${q} » : doublon de leçon`).toBe(tous.length);
				for (const g of r.groupes) {
					const def = CATEGORIES.find((c) => c.id === g.categoryId)!;
					expect(g.lecons.length).toBeGreaterThan(0);
					expect(g.label).toBe(def.label);
					expect(g.subject).toBe(def.subject);
					expect(g.subjectLabel).toBe(SUBJECTS.find((s) => s.id === def.subject)!.label);
					for (const l of g.lecons) expect(getLessonById(l.id)?.category).toBe(g.categoryId);
				}
			}
		}
	});
});

/* ============================================================
   Compte total et pureté — critères 19 (pas de stockage) et contrat
   ============================================================ */
describe('total et pureté', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('total = catégories + leçons + dictées (compté à la main sur un cas composé)', () => {
		const lessons = [
			// Donne du contenu à Géométrie, sans porter le mot : la catégorie compte, pas elle.
			fab({ id: 'fx-angle', label: 'Les angles droits', category: 'math-geometrie' }),
			// Deux leçons trouvées par leur libellé, dans deux catégories.
			fab({ id: 'fx-trace', label: 'Tracer en géométrie', category: 'math-geometrie' }),
			fab({ id: 'fx-calc', label: 'Géométrie du zorglub', category: 'math-calcul' }),
		];
		const dictees: DicteeRecherche[] = [
			{ id: 'd-geo', label: 'Mots de la géométrie' },
			{ id: 'd-autre', label: 'Les fruits' },
		];
		const r = rechercherLecons('geometrie', source(lessons, CE2, dictees));
		// Calcul à la main : 1 catégorie (Géométrie ; Calcul ne porte pas le mot) + 2 leçons + 1 dictée.
		expect(idsCategories(r)).toEqual(['math-geometrie']);
		expect(idsLecons(r)).toEqual(['fx-calc', 'fx-trace']); // Calcul avant Géométrie (catalogue)
		expect(r.dictees.map((d) => d.id)).toEqual(['d-geo']);
		expect(r.total).toBe(4);
	});

	it('INVARIANT sur le vrai catalogue : total = catégories + leçons + dictées', () => {
		for (const [nom, niveau] of PROFILS) {
			for (const q of ['ge', 'semaine', 'le', 'dictee', 'fois', 'qz']) {
				const r = rechercherLecons(q, reel(niveau, DICTEES));
				expect(r.total, `${nom} · « ${q} »`).toBe(
					r.categories.length + nbLecons(r) + r.dictees.length,
				);
			}
		}
	});

	it('aucune mutation des entrées, résultat reproductible, et rien d’écrit dans le stockage (critère 19)', () => {
		const lessons = [
			fab({ id: 'fx-a', label: 'Zorglub', category: 'math-calcul', motsCles: ['bidule'] }),
			fab({ id: 'fx-b', label: 'Bidule', category: 'fr-grammaire', levels: ['ce2', 'cm1'] }),
		];
		const dictees: DicteeRecherche[] = [{ id: 'd-1', label: 'Bidules de la semaine' }];
		// Gel PROFOND : en module ES (mode strict), toute écriture sur un objet gelé lève.
		for (const l of lessons) {
			Object.freeze(l.levels);
			if (l.motsCles) Object.freeze(l.motsCles);
			Object.freeze(l);
		}
		for (const d of dictees) Object.freeze(d);
		Object.freeze(lessons);
		Object.freeze(dictees);
		const avant = JSON.stringify({ lessons, dictees });
		const s = source(lessons, CE2, dictees);

		const r1 = rechercherLecons('bidule', s);
		const r2 = rechercherLecons('bidule', s);

		expect(JSON.stringify({ lessons, dictees })).toBe(avant);
		expect(r2).toEqual(r1);
		expect(r1.total).toBe(3); // prémisse : l'appel a bien parcouru leçons ET dictées
		expect(localStorage.length).toBe(0);
	});
});
