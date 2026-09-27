/* ============================================================
   Sélecteur de leçon côté ADULTE (#556) étendu par #722 — src/core/catalogue-arbre.ts.
   Une seule recherche, cohérente avec celle de l'enfant (#718) : mots-clés, libellé de
   la carte de l'enfant, et dictées de mots dans un groupe à part.

   Écrit AVANT le code, par un auteur distinct de l'implémentation : chaque attendu vient
   des critères numérotés de l'issue #722 (1, 2, 3, 4, 5, 9 partie pure, 10, 13 partie
   pure) et du contrat technique gelé, jamais du code. Tant que les exports et le groupe
   n'existent pas, ce fichier est ROUGE : c'est attendu.

   Deux sources, pour deux risques :
   - un catalogue INJECTÉ (`lessons`, `dictees` fabriqués) isole une règle à la fois :
     placement du groupe quand Orthographe est vidée, filtre de niveau cumulatif ou
     strict, ordre d'entrée, bornage par `tronquerArbre` ;
   - le VRAI catalogue et les VRAIES dictées prédéfinies tiennent les exemples que
     l'issue cite noir sur blanc (« fois », « a ou à », « tables », « multiplier »,
     « semaine », « dictée ») et les invariants qui ne se voient que sur tout le contenu.

   Mots des fixtures : inventés (« zorglub », « bidule »), pour qu'aucun mot-clé réel de
   catégorie ne s'ajoute aux résultats et ne fausse un compte.

   Hors de ce fichier (volontairement) : `tests/catalogue-arbre.test.ts` doit passer
   INCHANGÉ (critère 14) et `tests/recherche-lecon.test.ts` aussi (critère 12).
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import {
	arbreCatalogue,
	compterLecons,
	tronquerArbre,
	DICTEES_ARBRE_ID,
	DICTEES_ARBRE_LABEL,
	type CategorieArbre,
	type DicteeArbreEntree,
	type FiltreNiveau,
	type LeconArbre,
	type MatiereArbre,
} from '../src/core/catalogue-arbre';
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
import { libelleAffiche } from '../src/core/libelle-affiche';
import { labelLecon } from '../src/core/levels';
import { listOrthoLecons } from '../src/core/orthographe/lessons';
import type { OrthoState } from '../src/core/orthographe/types';
import type { Profile } from '../src/core/profiles';
import { cleRecherche } from '../src/core/utils';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';

/* Identifiant gelé du groupe, écrit EN CLAIR : les attendus ne passent pas par la constante
   exportée, pour qu'un échec dise « groupe absent » plutôt que « undefined ». La constante
   est vérifiée à part. */
const GROUPE = 'dictees';

/* ---------- Profils fabriqués à la main (module pur : pas de stockage) ---------- */
function profil(o: { reference?: SchoolLevel; parMatiere?: Record<string, SchoolLevel> } = {}) {
	const p: Profile = { uuid: 'u-test', name: 'Test', emoji: '🐧', updatedAt: 0 };
	if (o.reference) p.niveauReference = o.reference;
	if (o.parMatiere) p.niveauParMatiere = o.parMatiere;
	return p;
}
const CE2 = profil({ reference: 'ce2' });
const CM1 = profil({ reference: 'cm1' });
/* Maths CM1 / français CE2, et l'inverse. Le second distingue « niveau du FRANÇAIS » de
   « niveau de référence » et de « niveau des maths » : ils ne coïncident jamais tous. */
const MELE = profil({ reference: 'cm1', parMatiere: { francais: 'ce2' } });
const MELE_INVERSE = profil({ reference: 'ce2', parMatiere: { francais: 'cm1' } });

interface CasProfil {
	nom: string;
	p: Profile;
	math: SchoolLevel;
	francais: SchoolLevel;
}
const PROFILS: CasProfil[] = [
	{ nom: 'CE2', p: CE2, math: 'ce2', francais: 'ce2' },
	{ nom: 'CM1', p: CM1, math: 'cm1', francais: 'cm1' },
	{ nom: 'maths CM1 / français CE2', p: MELE, math: 'cm1', francais: 'ce2' },
	{ nom: 'maths CE2 / français CM1', p: MELE_INVERSE, math: 'ce2', francais: 'cm1' },
];
const FILTRES: FiltreNiveau[] = ['sa-classe', 'ce2', 'cm1'];

/* Niveau sous lequel une matière est proposée : le jeton s'il en est un, sinon la classe
   suivie pour CETTE matière. Écrit d'après la définition des jetons (#556), à la main. */
function niveauAffiche(c: CasProfil, subject: SubjectId, filtre: FiltreNiveau): SchoolLevel {
	if (filtre !== 'sa-classe') return filtre;
	return subject === 'math' ? c.math : c.francais;
}

/* ---------- Lecture d'un arbre ---------- */
const toutesLignes = (arbre: readonly MatiereArbre[]): LeconArbre[] =>
	arbre.flatMap((m) => m.categories.flatMap((c) => c.lecons));
const ids = (arbre: readonly MatiereArbre[]): string[] => toutesLignes(arbre).map((l) => l.id);
const ligne = (arbre: readonly MatiereArbre[], id: string): LeconArbre | undefined =>
	toutesLignes(arbre).find((l) => l.id === id);
const matiere = (arbre: readonly MatiereArbre[], s: SubjectId): MatiereArbre | undefined =>
	arbre.find((m) => m.subject === s);
const categoriesFr = (arbre: readonly MatiereArbre[]): string[] =>
	matiere(arbre, 'francais')?.categories.map((c) => c.categoryId) ?? [];
const groupeDictees = (arbre: readonly MatiereArbre[]): CategorieArbre | undefined =>
	arbre.flatMap((m) => m.categories).find((c) => c.categoryId === GROUPE);
const idsDictees = (arbre: readonly MatiereArbre[]): string[] =>
	groupeDictees(arbre)?.lecons.map((l) => l.id) ?? [];
const idsCategorie = (arbre: readonly MatiereArbre[], categoryId: string): string[] =>
	arbre
		.flatMap((m) => m.categories)
		.find((c) => c.categoryId === categoryId)
		?.lecons.map((l) => l.id) ?? [];

/* L'arbre SANS le groupe des dictées (totaux recalculés, matière vidée écartée) : ce que
   le critère 10 compare à l'arbre obtenu sans `dictees`. */
function sansGroupeDictees(arbre: readonly MatiereArbre[]): MatiereArbre[] {
	return arbre
		.map((m) => {
			const categories = m.categories.filter((c) => c.categoryId !== GROUPE);
			return { ...m, categories, total: categories.reduce((n, c) => n + c.lecons.length, 0) };
		})
		.filter((m) => m.categories.length > 0);
}

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
	return def;
}

/* Une leçon par catégorie de français, plus une de maths. « Bidule » est porté par
   Grammaire, Conjugaison et Vocabulaire, PAS par Orthographe : c'est ce qui permet de
   vider Orthographe par la recherche tout en gardant ses deux voisines. */
const F_LECONS: LessonDef[] = [
	fab({ id: 'fx-math', label: 'Zorglub en maths', category: 'math-calcul' }),
	fab({ id: 'fx-gram', label: 'Bidule de grammaire', category: 'fr-grammaire' }),
	fab({ id: 'fx-conj', label: 'Bidule de conjugaison', category: 'fr-conjugaison' }),
	fab({ id: 'fx-ortho', label: 'Zorglub orthographe', category: ORTHO_CATEGORY_ID }),
	fab({ id: 'fx-voc', label: 'Bidule de vocabulaire', category: 'fr-vocabulaire' }),
];

/* Dictées dans un ordre d'entrée volontairement NON alphabétique : « ordre conservé » ne
   doit pas se confondre avec « trié ». Prédéfinies CE2 et listes du parent mêlées. */
const D_FERME: DicteeArbreEntree = {
	id: 'd-ferme',
	label: 'Les animaux de la ferme',
	source: 'predefini',
	niveau: 'ce2',
};
const D_S12: DicteeArbreEntree = { id: 'd-s12', label: 'Mots de la semaine 12', source: 'liste' };
const D_GOUT: DicteeArbreEntree = { id: 'd-gout', label: 'La SEMAINE du goût', source: 'liste' };
const D_ETE: DicteeArbreEntree = {
	id: 'd-ete',
	label: 'Été au jardin',
	source: 'predefini',
	niveau: 'ce2',
};
const D_BIDULE: DicteeArbreEntree = {
	id: 'd-bidule',
	label: 'Les bidules de Léa',
	source: 'liste',
};
const F_DICTEES: DicteeArbreEntree[] = [D_FERME, D_S12, D_GOUT, D_ETE, D_BIDULE];
const F_IDS_DICTEES = F_DICTEES.map((d) => d.id);

/* Ligne attendue d'une dictée, écrite à la main d'après le contrat. */
const ligneDictee = (d: DicteeArbreEntree, niveau: SchoolLevel): LeconArbre => ({
	id: d.id,
	label: d.label,
	niveau,
	kind: 'dictee',
});

/* ---------- Vraies dictées ---------- */
const ETAT_VIDE: OrthoState = { banque: {}, listes: [], motIdParForme: {} };
const PREDEF_REELLES: DicteeArbreEntree[] = ORTHO_PREDEF.map((l): DicteeArbreEntree => ({
	id: l.id,
	label: l.label,
	source: 'predefini',
	niveau: l.niveau,
}));
const LISTES_PARENT: DicteeArbreEntree[] = [
	{ id: 'liste-s12', label: 'Mots de la semaine 12', source: 'liste' },
	{ id: 'liste-noel', label: 'Les mots de Noël', source: 'liste' },
	{ id: 'liste-ecole', label: 'L’école de Léa', source: 'liste' },
];
const IDS_LISTES_PARENT = LISTES_PARENT.map((d) => d.id);
const DICTEES_REELLES: DicteeArbreEntree[] = [...PREDEF_REELLES, ...LISTES_PARENT];
const IDS_DICTEES_REELLES = new Set(DICTEES_REELLES.map((d) => d.id));

/* Prédéfinies que l'ENFANT voit dans son écran Orthographe à ce niveau : la référence de
   « Sa classe montre ce que l'enfant voit » (critère 5), prise à l'accessor du catalogue
   enfant (`listOrthoLecons`, filtrage cumulatif #243), pas au module testé. */
const predefVuesParEnfant = (niveauFr: SchoolLevel): string[] =>
	listOrthoLecons(ETAT_VIDE, niveauFr)
		.filter((l) => l.source === 'predefini')
		.map((l) => l.id);

/* ============================================================
   Prémisses et contrat
   ============================================================ */
describe('prémisses et constantes du groupe', () => {
	it('le groupe porte l’identifiant et le libellé gelés, et n’est PAS une catégorie du catalogue', () => {
		expect(DICTEES_ARBRE_ID).toBe(GROUPE);
		expect(DICTEES_ARBRE_LABEL).toBe('Dictées de mots');
		expect(CATEGORIES.some((c) => c.id === GROUPE)).toBe(false);
	});

	it('Orthographe vient avant Vocabulaire dans le catalogue (le placement du critère 4 en dépend)', () => {
		const fr = CATEGORIES.filter((c) => c.subject === 'francais').map((c) => c.id);
		expect(fr.indexOf(ORTHO_CATEGORY_ID)).toBeGreaterThanOrEqual(0);
		expect(fr.indexOf('fr-vocabulaire')).toBe(fr.indexOf(ORTHO_CATEGORY_ID) + 1);
	});

	it('vraies dictées : des prédéfinies CE2 ET CM1, aucun id partagé avec une leçon', () => {
		expect(ORTHO_PREDEF.some((l) => l.niveau === 'ce2')).toBe(true);
		expect(ORTHO_PREDEF.some((l) => l.niveau === 'cm1')).toBe(true);
		// L'enfant de CM1 en voit STRICTEMENT plus que celui de CE2 : sans ça, le critère 5 ne
		// distinguerait rien.
		expect(predefVuesParEnfant('cm1').length).toBeGreaterThan(predefVuesParEnfant('ce2').length);
		for (const l of getAllLessons()) expect(IDS_DICTEES_REELLES.has(l.id), l.id).toBe(false);
	});
});

/* ============================================================
   Critère 1 — une leçon est trouvée par l'un de ses mots-clés
   ============================================================ */
describe('critère 1 : une leçon est trouvée par l’un de ses mots-clés', () => {
	it('un mot-clé ABSENT du libellé suffit, en sous-chaîne, casse, accents et apostrophe indifférents', () => {
		const lessons = [
			fab({
				id: 'fx-cle',
				label: 'Zorglub',
				category: 'math-calcul',
				motsCles: ['Les bidules à l’envers'],
			}),
			fab({
				id: 'fx-temoin',
				label: 'Zorglub témoin',
				category: 'math-calcul',
				motsCles: ['truc'],
			}),
		];
		for (const q of ['bidule', 'BIDULES', "bidules a l'envers", 'dules À L’ENV']) {
			expect(ids(arbreCatalogue(CE2, { lessons, recherche: q })), q).toEqual(['fx-cle']);
		}
	});

	it('la ligne trouvée par mot-clé garde le libellé de la leçon (jamais le mot-clé)', () => {
		const lessons = [
			fab({ id: 'fx-cle', label: 'Zorglub', category: 'math-calcul', motsCles: ['les bidules'] }),
		];
		expect(ligne(arbreCatalogue(CE2, { lessons, recherche: 'bidule' }), 'fx-cle')?.label).toBe(
			'Zorglub',
		);
	});

	it('trouvée par son libellé ET par un mot-clé : une seule ligne', () => {
		const lessons = [
			fab({
				id: 'fx-double',
				label: 'Zorglub rouge',
				category: 'math-calcul',
				motsCles: ['zorglub', 'le zorglub bleu'],
			}),
		];
		const arbre = arbreCatalogue(CE2, { lessons, recherche: 'zorglub' });
		expect(ids(arbre)).toEqual(['fx-double']);
		expect(compterLecons(arbre)).toBe(1);
	});

	it('un mot-clé ne contourne pas le filtre de niveau (leçon CM1 seule, jeton CE2)', () => {
		const lessons = [
			fab({
				id: 'fx-cm1',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['cm1'],
				motsCles: ['bidule'],
			}),
		];
		expect(arbreCatalogue(CE2, { lessons, filtre: 'ce2', recherche: 'bidule' })).toEqual([]);
		expect(ids(arbreCatalogue(CE2, { lessons, filtre: 'cm1', recherche: 'bidule' }))).toEqual([
			'fx-cm1',
		]);
	});

	it('vrai catalogue : « fois » rend les tables de multiplication, sans déplier tout le Calcul mental', () => {
		const tables = getLessonById('math-tables-multiplication');
		const addition = getLessonById('math-tables-addition');
		if (!tables || !addition) throw new Error('leçons de tables absentes : test à réviser');
		// Prémisses : « fois » n'est ni dans ce que la carte affiche, ni dans le nom ou les
		// mots-clés de la catégorie. Seul le mot-clé de la LEÇON peut donc la faire sortir.
		expect(cleRecherche(libelleAffiche(tables, 'ce2'))).not.toContain('fois');
		const cat = CATEGORIES.find((c) => c.id === tables.category)!;
		expect([cat.label, ...(cat.motsCles ?? [])].some((s) => cleRecherche(s).includes('fois'))).toBe(
			false,
		);
		// Témoin de la même catégorie, que rien ne relie à « fois ».
		expect(addition.category).toBe(tables.category);
		expect(
			[libelleAffiche(addition, 'ce2'), ...(addition.motsCles ?? [])].some((s) =>
				cleRecherche(s).includes('fois'),
			),
		).toBe(false);

		const trouves = ids(arbreCatalogue(CE2, { recherche: 'fois' }));
		expect(trouves).toContain('math-tables-multiplication');
		expect(trouves).not.toContain('math-tables-addition');
	});

	it('vrai catalogue : « a ou à » (avec ou sans accent) rend l’homophone a / à', () => {
		const homo = getLessonById('fr-homophones-a');
		if (!homo) throw new Error('fr-homophones-a absente : test à réviser');
		expect(homo.levels).toContain('ce2'); // prémisse
		// Le libellé porte des guillemets (« « a » ou « à » ») : la saisie n'y est PAS en
		// sous-chaîne, c'est le mot-clé qui doit la trouver.
		expect(cleRecherche(libelleAffiche(homo, 'ce2'))).not.toContain('a ou a');
		for (const q of ['a ou à', 'a ou a', 'A OU À']) {
			expect(ids(arbreCatalogue(CE2, { recherche: q })), q).toContain('fr-homophones-a');
		}
	});
});

/* ============================================================
   Critère 2 — un mot-clé de catégorie déplie toute la catégorie
   ============================================================ */
describe('critère 2 : un mot-clé de catégorie déplie toute la catégorie', () => {
	const CALCUL_MENTAL = CATEGORIES.find((c) => c.id === 'math-calcul-mental')!;

	it('prémisse : « tables » est un mot-clé de Calcul mental, absent de son nom', () => {
		expect(cleRecherche(CALCUL_MENTAL.label)).not.toContain('tables');
		expect((CALCUL_MENTAL.motsCles ?? []).map(cleRecherche)).toContain('tables');
	});

	it('fixture : « tables » rend TOUTES les leçons de Calcul mental (aucune ne porte le mot), rien d’ailleurs', () => {
		const lessons = [
			fab({ id: 'fx-cm-a', label: 'Zorglub', category: 'math-calcul-mental' }),
			fab({ id: 'fx-cm-b', label: 'Bidule', category: 'math-calcul-mental' }),
			fab({ id: 'fx-calc', label: 'Zorglub posé', category: 'math-calcul' }),
		];
		for (const q of ['tables', 'TABLES', 'calcul de tete']) {
			const arbre = arbreCatalogue(CE2, { lessons, recherche: q });
			expect(
				arbre.flatMap((m) => m.categories).map((c) => c.categoryId),
				q,
			).toEqual(['math-calcul-mental']);
			expect(ids(arbre), q).toEqual(['fx-cm-a', 'fx-cm-b']);
		}
	});

	it('fixture : la catégorie qui correspond n’apparaît pas si elle n’a rien au niveau filtré', () => {
		const lessons = [
			fab({ id: 'fx-cm1', label: 'Zorglub', category: 'math-calcul-mental', levels: ['cm1'] }),
		];
		expect(arbreCatalogue(CE2, { lessons, filtre: 'ce2', recherche: 'tables' })).toEqual([]);
		expect(ids(arbreCatalogue(CE2, { lessons, filtre: 'cm1', recherche: 'tables' }))).toEqual([
			'fx-cm1',
		]);
	});

	it('vrai catalogue : « tables » rend le Calcul mental ENTIER, dans l’ordre, même les leçons sans le mot', () => {
		for (const c of PROFILS.slice(0, 2)) {
			const complet = idsCategorie(arbreCatalogue(c.p), 'math-calcul-mental');
			// Prémisse : au moins une leçon de la catégorie ne porte « tables » ni dans sa carte
			// ni dans ses mots-clés. Sinon, la catégorie ne serait pas ce qui l'a fait sortir.
			const sansLeMot = complet.filter((id) => {
				const def = getLessonById(id)!;
				return ![libelleAffiche(def, c.math), ...(def.motsCles ?? [])].some((s) =>
					cleRecherche(s).includes('tables'),
				);
			});
			expect(sansLeMot.length, c.nom).toBeGreaterThan(0);
			expect(
				idsCategorie(arbreCatalogue(c.p, { recherche: 'tables' }), 'math-calcul-mental'),
				c.nom,
			).toEqual(complet);
		}
	});
});

/* ============================================================
   Critère 3 — libellé affiché ET cherché = celui de la carte de l'enfant
   ============================================================ */
describe('critère 3 : le libellé affiché et cherché est celui de la carte de l’enfant', () => {
	it('« multiplier » rend math-multiplier-4-8 sous CE2, et sa ligne dit « Multiplier par 4, par 8 »', () => {
		const trouve = ligne(arbreCatalogue(CE2, { recherche: 'multiplier' }), 'math-multiplier-4-8');
		expect(trouve?.label).toBe('Multiplier par 4, par 8');
		// Sans recherche non plus, la ligne ne dit pas « × 4, × 8 ».
		expect(ligne(arbreCatalogue(CE2), 'math-multiplier-4-8')?.label).toBe(
			'Multiplier par 4, par 8',
		);
	});

	it('balayage : chaque ligne de leçon porte libelleAffiche(leçon, niveau de la ligne)', () => {
		let divergentes = 0;
		for (const c of PROFILS) {
			for (const filtre of FILTRES) {
				for (const l of toutesLignes(arbreCatalogue(c.p, { filtre, dictees: DICTEES_REELLES }))) {
					if (IDS_DICTEES_REELLES.has(l.id)) continue;
					const def = getLessonById(l.id);
					expect(def, `${c.nom} · ${filtre} · ${l.id} inconnue`).toBeDefined();
					const attendu = libelleAffiche(def!, l.niveau);
					expect(l.label, `${c.nom} · ${filtre} · ${l.id}`).toBe(attendu);
					if (attendu !== labelLecon(def!, l.niveau)) divergentes++;
				}
			}
		}
		// Amendement #722 (option 1, 2026-09-27) : un seul nom par leçon, partout. Plus aucune
		// ligne ne peut diverger du libellé de catalogue — le balayage tient désormais
		// l'ÉGALITÉ (même gate que tests/libelle-affiche.test.ts), là où la version initiale
		// exigeait d'avoir croisé des divergences.
		expect(divergentes).toBe(0);
	});

	it('balayage : chaque leçon de la classe est trouvée par le libellé de SA carte', () => {
		for (const c of PROFILS) {
			for (const def of getAllLessons()) {
				const lv = niveauAffiche(c, def.subject, 'sa-classe');
				if (!def.levels.includes(lv)) continue;
				const vu = libelleAffiche(def, lv);
				expect(
					ligne(arbreCatalogue(c.p, { recherche: vu }), def.id)?.label,
					`${c.nom} · ${def.id} « ${vu} »`,
				).toBe(vu);
			}
		}
	});
});

/* ============================================================
   Critère 4 — le groupe « Dictées de mots »
   ============================================================ */
describe('critère 4 : les dictées forment un groupe à part, sous Français après Orthographe', () => {
	it('sans recherche : groupe complet, dans l’ordre d’entrée, juste après Orthographe et avant Vocabulaire', () => {
		const arbre = arbreCatalogue(CE2, { lessons: F_LECONS, dictees: F_DICTEES });
		expect(categoriesFr(arbre)).toEqual([
			'fr-grammaire',
			'fr-conjugaison',
			ORTHO_CATEGORY_ID,
			GROUPE,
			'fr-vocabulaire',
		]);
		expect(groupeDictees(arbre)).toEqual({
			categoryId: GROUPE,
			label: 'Dictées de mots',
			lecons: F_DICTEES.map((d) => ligneDictee(d, 'ce2')),
		});
		// Les maths ne reçoivent rien.
		expect(matiere(arbre, 'math')?.categories.map((c) => c.categoryId)).toEqual(['math-calcul']);
	});

	it('Orthographe VIDÉE par la recherche : le groupe garde sa place, entre Conjugaison et Vocabulaire', () => {
		const arbre = arbreCatalogue(CE2, {
			lessons: F_LECONS,
			dictees: F_DICTEES,
			recherche: 'bidule',
		});
		expect(categoriesFr(arbre)).toEqual([
			'fr-grammaire',
			'fr-conjugaison',
			GROUPE,
			'fr-vocabulaire',
		]);
		expect(idsDictees(arbre)).toEqual(['d-bidule']);
	});

	it('seule une dictée correspond : Français ne contient que le groupe, et les maths disparaissent', () => {
		const arbre = arbreCatalogue(CE2, {
			lessons: F_LECONS,
			dictees: F_DICTEES,
			recherche: 'ferme',
		});
		expect(arbre).toEqual([
			{
				subject: 'francais',
				label: 'Français',
				total: 1,
				categories: [
					{ categoryId: GROUPE, label: 'Dictées de mots', lecons: [ligneDictee(D_FERME, 'ce2')] },
				],
			},
		]);
	});

	it('catalogue sans leçon de français : la matière Français existe quand même pour les dictées, après les maths', () => {
		const mathsSeules = F_LECONS.filter((l) => l.subject === 'math');
		const arbre = arbreCatalogue(CE2, { lessons: mathsSeules, dictees: F_DICTEES });
		expect(arbre.map((m) => m.subject)).toEqual(['math', 'francais']);
		expect(categoriesFr(arbre)).toEqual([GROUPE]);
		expect(arbreCatalogue(CE2, { lessons: [], dictees: [D_S12] }).map((m) => m.subject)).toEqual([
			'francais',
		]);
	});

	it('aucune dictée retenue : jamais de groupe vide (recherche sans écho, liste vide, niveau)', () => {
		const parRecherche = arbreCatalogue(CE2, {
			lessons: F_LECONS,
			dictees: F_DICTEES,
			recherche: 'zorglub',
		});
		expect(groupeDictees(parRecherche)).toBeUndefined();
		expect(ids(parRecherche)).toEqual(['fx-math', 'fx-ortho']); // les leçons, elles, sortent
		expect(groupeDictees(arbreCatalogue(CE2, { lessons: F_LECONS, dictees: [] }))).toBeUndefined();
		// Une prédéfinie CM1 seule, sous un jeton CE2 : rien à montrer, donc pas de groupe.
		const cm1: DicteeArbreEntree = {
			id: 'p',
			label: 'Zorglub',
			source: 'predefini',
			niveau: 'cm1',
		};
		expect(arbreCatalogue(CE2, { lessons: [], filtre: 'ce2', dictees: [cm1] })).toEqual([]);
	});

	it('« semaine » trouve « Mots de la semaine 12 » (et « La SEMAINE du goût »), rien d’autre, dans l’ordre d’entrée', () => {
		const arbre = arbreCatalogue(CE2, { lessons: [], dictees: F_DICTEES, recherche: 'semaine' });
		expect(groupeDictees(arbre)?.lecons).toEqual([
			ligneDictee(D_S12, 'ce2'),
			ligneDictee(D_GOUT, 'ce2'),
		]);
	});

	it('un morceau du nom, accents, casse et apostrophe indifférents', () => {
		const cas: [string, string[]][] = [
			['ete au', ['d-ete']],
			['ÉTÉ', ['d-ete']],
			['GOUT', ['d-gout']],
			['bidules de lea', ['d-bidule']],
			['maux de la f', ['d-ferme']],
		];
		for (const [q, attendu] of cas) {
			expect(
				idsDictees(arbreCatalogue(CE2, { lessons: [], dictees: F_DICTEES, recherche: q })),
				q,
			).toEqual(attendu);
		}
		const apostrophe: DicteeArbreEntree = { id: 'd-ecole', label: 'L’école', source: 'liste' };
		expect(
			idsDictees(arbreCatalogue(CE2, { lessons: [], dictees: [apostrophe], recherche: "l'ecole" })),
		).toEqual(['d-ecole']);
	});

	it('« dictée » (toutes ses graphies) les rend TOUTES, même celles dont le nom ne porte pas le mot', () => {
		for (const q of ['dictée', 'dictee', 'DICTÉES', 'Dictées de mots']) {
			expect(
				idsDictees(arbreCatalogue(CE2, { lessons: [], dictees: F_DICTEES, recherche: q })),
				q,
			).toEqual(F_IDS_DICTEES);
		}
	});

	it('vrai catalogue : « semaine » rend la liste du parent « Mots de la semaine 12 »', () => {
		const arbre = arbreCatalogue(CE2, { dictees: DICTEES_REELLES, recherche: 'semaine' });
		expect(ligne(arbre, 'liste-s12')).toEqual({
			id: 'liste-s12',
			label: 'Mots de la semaine 12',
			niveau: 'ce2',
			kind: 'dictee',
		});
		expect(idsDictees(arbre)).toContain('liste-s12');
	});

	it('vrai catalogue : « dictée » rend toutes les dictées visibles, dans l’ordre d’entrée', () => {
		for (const c of PROFILS) {
			const attendu = [...predefVuesParEnfant(c.francais), ...IDS_LISTES_PARENT];
			for (const q of ['dictée', 'dictee', 'DICTÉE']) {
				expect(
					idsDictees(arbreCatalogue(c.p, { dictees: DICTEES_REELLES, recherche: q })),
					`${c.nom} · ${q}`,
				).toEqual(attendu);
			}
		}
	});

	it('INVARIANT vrai catalogue : kind « dictee » dans le groupe seulement, « lecon » partout ailleurs, jamais de mélange', () => {
		const rangOrtho = CATEGORIES.findIndex((c) => c.id === ORTHO_CATEGORY_ID);
		const rang = (id: string) => CATEGORIES.findIndex((c) => c.id === id);
		let groupesVus = 0;
		for (const c of PROFILS) {
			for (const filtre of FILTRES) {
				for (const q of ['', 'mots', 'semaine', 'dictée', 'le']) {
					const arbre = arbreCatalogue(c.p, { filtre, recherche: q, dictees: DICTEES_REELLES });
					const ctx = `${c.nom} · ${filtre} · « ${q} »`;
					for (const m of arbre) {
						for (const cat of m.categories) {
							if (cat.categoryId === GROUPE) {
								groupesVus++;
								expect(m.subject, ctx).toBe('francais');
								expect(cat.label).toBe('Dictées de mots');
								expect(cat.lecons.length, ctx).toBeGreaterThan(0);
								for (const l of cat.lecons) {
									expect(l.kind, `${ctx} · ${l.id}`).toBe('dictee');
									expect(IDS_DICTEES_REELLES.has(l.id), `${ctx} · ${l.id}`).toBe(true);
								}
							} else {
								for (const l of cat.lecons) {
									expect(l.kind, `${ctx} · ${l.id}`).toBe('lecon');
									expect(getLessonById(l.id)?.category, `${ctx} · ${l.id}`).toBe(cat.categoryId);
								}
							}
						}
					}
					// Placement : tout ce qui précède le groupe vient au plus d'Orthographe, tout
					// ce qui le suit vient après elle dans le catalogue.
					const fr = categoriesFr(arbre);
					const g = fr.indexOf(GROUPE);
					if (g >= 0) {
						for (const id of fr.slice(0, g))
							expect(rang(id), `${ctx} · ${id}`).toBeLessThanOrEqual(rangOrtho);
						for (const id of fr.slice(g + 1))
							expect(rang(id), `${ctx} · ${id}`).toBeGreaterThan(rangOrtho);
					}
				}
			}
		}
		expect(groupesVus).toBeGreaterThan(0); // le balayage a bien rencontré le groupe
	});
});

/* ============================================================
   Critère 5 — jetons de niveau appliqués aux dictées
   ============================================================ */
describe('critère 5 : jetons de niveau sur les dictées (cumulatif sous « Sa classe », strict sous un jeton)', () => {
	const P_CE1: DicteeArbreEntree = {
		id: 'p-ce1',
		label: 'Zorglub CE1',
		source: 'predefini',
		niveau: 'ce1',
	};
	const P_CE2: DicteeArbreEntree = {
		id: 'p-ce2',
		label: 'Zorglub CE2',
		source: 'predefini',
		niveau: 'ce2',
	};
	const P_CM1: DicteeArbreEntree = {
		id: 'p-cm1',
		label: 'Zorglub CM1',
		source: 'predefini',
		niveau: 'cm1',
	};
	const P_CM2: DicteeArbreEntree = {
		id: 'p-cm2',
		label: 'Zorglub CM2',
		source: 'predefini',
		niveau: 'cm2',
	};
	const L_PARENT: DicteeArbreEntree = { id: 'l-parent', label: 'Zorglub maison', source: 'liste' };
	const ENTREES = [P_CE1, P_CE2, P_CM1, P_CM2, L_PARENT];
	const dicteesSous = (p: Profile, filtre: FiltreNiveau) =>
		idsDictees(arbreCatalogue(p, { lessons: [], filtre, dictees: ENTREES }));

	it('« Sa classe » : ce que l’enfant voit, cumulatif (un CM1 voit CE1, CE2 et CM1 ; jamais CM2)', () => {
		expect(dicteesSous(CM1, 'sa-classe')).toEqual(['p-ce1', 'p-ce2', 'p-cm1', 'l-parent']);
		expect(dicteesSous(CE2, 'sa-classe')).toEqual(['p-ce1', 'p-ce2', 'l-parent']);
	});

	it('un jeton de classe : les prédéfinies de CETTE classe seule (ni en dessous, ni au-dessus)', () => {
		for (const p of [CE2, CM1, MELE, MELE_INVERSE]) {
			expect(dicteesSous(p, 'ce2')).toEqual(['p-ce2', 'l-parent']);
			expect(dicteesSous(p, 'cm1')).toEqual(['p-cm1', 'l-parent']);
		}
	});

	it('la liste du parent est là sous TOUS les jetons, pour tous les profils', () => {
		for (const c of PROFILS)
			for (const filtre of FILTRES)
				expect(dicteesSous(c.p, filtre), `${c.nom} · ${filtre}`).toContain('l-parent');
	});

	it('profil mêlé : c’est le niveau du FRANÇAIS qui compte (ni celui des maths, ni la référence)', () => {
		// Maths CM1 / français CE2 : comme un CE2.
		expect(dicteesSous(MELE, 'sa-classe')).toEqual(['p-ce1', 'p-ce2', 'l-parent']);
		// Maths CE2 (référence CE2) / français CM1 : comme un CM1.
		expect(dicteesSous(MELE_INVERSE, 'sa-classe')).toEqual(['p-ce1', 'p-ce2', 'p-cm1', 'l-parent']);
	});

	it('niveau porté par chaque ligne de dictée : le niveau sous lequel le FRANÇAIS est proposé', () => {
		for (const c of PROFILS) {
			for (const filtre of FILTRES) {
				const lignes =
					groupeDictees(arbreCatalogue(c.p, { lessons: [], filtre, dictees: ENTREES }))?.lecons ??
					[];
				expect(lignes.length, `${c.nom} · ${filtre}`).toBeGreaterThan(0);
				for (const l of lignes)
					expect(l.niveau, `${c.nom} · ${filtre} · ${l.id}`).toBe(
						niveauAffiche(c, 'francais', filtre),
					);
			}
		}
	});

	it('vraies dictées : « Sa classe » rend exactement les prédéfinies du catalogue ENFANT, puis toutes les listes', () => {
		for (const c of PROFILS) {
			expect(
				idsDictees(arbreCatalogue(c.p, { lessons: [], dictees: DICTEES_REELLES })),
				c.nom,
			).toEqual([...predefVuesParEnfant(c.francais), ...IDS_LISTES_PARENT]);
		}
	});

	it('vraies dictées : un jeton rend les prédéfinies de sa classe seule, puis toutes les listes', () => {
		for (const c of PROFILS) {
			for (const lv of ['ce2', 'cm1'] as SchoolLevel[]) {
				expect(
					idsDictees(arbreCatalogue(c.p, { lessons: [], filtre: lv, dictees: DICTEES_REELLES })),
					`${c.nom} · ${lv}`,
				).toEqual([
					...ORTHO_PREDEF.filter((l) => l.niveau === lv).map((l) => l.id),
					...IDS_LISTES_PARENT,
				]);
			}
		}
	});
});

/* ============================================================
   Critère 9 (partie pure) — le plafond compte les dictées
   ============================================================ */
describe('critère 9 : tronquerArbre borne en comptant les dictées comme des leçons', () => {
	/* Parcours de l'arbre fixture (CE2, sans recherche), calculé à la main :
	   maths (fx-math) → Grammaire (fx-gram) → Conjugaison (fx-conj) → Orthographe (fx-ortho)
	   → Dictées (5, ordre d'entrée) → Vocabulaire (fx-voc). Total 10. */
	const ORDRE = ['fx-math', 'fx-gram', 'fx-conj', 'fx-ortho', ...F_IDS_DICTEES, 'fx-voc'];
	const TOTAL = 10;
	const arbre = () => arbreCatalogue(CE2, { lessons: F_LECONS, dictees: F_DICTEES });

	it('prémisse : l’arbre compte les dictées (10 lignes, dans l’ordre de parcours attendu)', () => {
		expect(compterLecons(arbre())).toBe(TOTAL);
		expect(ids(arbre())).toEqual(ORDRE);
	});

	it('borne pile avant le groupe : aucun groupe « Dictées de mots » vide ne paraît', () => {
		const r = tronquerArbre(arbre(), 4);
		expect(r.restant).toBe(TOTAL - 4);
		expect(ids(r.arbre)).toEqual(ORDRE.slice(0, 4));
		expect(categoriesFr(r.arbre)).toEqual(['fr-grammaire', 'fr-conjugaison', ORTHO_CATEGORY_ID]);
	});

	it('borne au milieu du groupe : il garde ses PREMIÈRES dictées, Vocabulaire ne paraît pas', () => {
		const r = tronquerArbre(arbre(), 6);
		expect(r.restant).toBe(TOTAL - 6);
		expect(idsDictees(r.arbre)).toEqual(['d-ferme', 'd-s12']);
		expect(categoriesFr(r.arbre)).not.toContain('fr-vocabulaire');
		expect(matiere(r.arbre, 'francais')?.total).toBe(5); // 3 leçons + 2 dictées
	});

	it('invariant sur toute la plage : compte = min(limite, total), restant = total − limite, aucun nœud vide', () => {
		for (let limite = 1; limite <= TOTAL + 2; limite++) {
			const r = tronquerArbre(arbre(), limite);
			expect(compterLecons(r.arbre), `limite ${limite}`).toBe(Math.min(limite, TOTAL));
			expect(r.restant, `limite ${limite}`).toBe(Math.max(0, TOTAL - limite));
			expect(ids(r.arbre)).toEqual(ORDRE.slice(0, Math.min(limite, TOTAL)));
			for (const m of r.arbre)
				for (const c of m.categories) expect(c.lecons.length).toBeGreaterThan(0);
		}
	});

	it('vraies dictées, « mots » : toutes sortent, et le plafond de 30 lignes en laisse de côté', () => {
		const attendu = [...predefVuesParEnfant('cm1'), ...IDS_LISTES_PARENT];
		expect(attendu.length).toBeGreaterThan(30); // prémisse : il y a bien de quoi dépasser
		const arbreMots = arbreCatalogue(CM1, {
			lessons: [],
			dictees: DICTEES_REELLES,
			recherche: 'mots',
		});
		expect(idsDictees(arbreMots)).toEqual(attendu);
		expect(compterLecons(arbreMots)).toBe(attendu.length);
		const r = tronquerArbre(arbreMots, 30);
		expect(compterLecons(r.arbre)).toBe(30);
		expect(r.restant).toBe(attendu.length - 30);
		expect(idsDictees(r.arbre)).toEqual(attendu.slice(0, 30));
	});

	it('vrai catalogue, « mots » : le compte = leçons trouvées + dictées, et le reste est cohérent', () => {
		const sans = arbreCatalogue(CE2, { recherche: 'mots' });
		const avec = arbreCatalogue(CE2, { recherche: 'mots', dictees: DICTEES_REELLES });
		const nbDictees = predefVuesParEnfant('ce2').length + LISTES_PARENT.length;
		expect(idsDictees(avec)).toHaveLength(nbDictees);
		expect(compterLecons(avec)).toBe(compterLecons(sans) + nbDictees);
		const r = tronquerArbre(avec, 30);
		expect(r.restant).toBe(compterLecons(avec) - 30);
	});
});

/* ============================================================
   Critère 10 — sans dictées, l'arbre des leçons ne bouge pas
   ============================================================ */
describe('critère 10 : sans dictées, mêmes groupes et même ordre qu’aujourd’hui ; dictées jamais mêlées', () => {
	it('sans `dictees` : chaque matière et chaque catégorie pourvue, dans l’ordre du catalogue et l’ordre pédagogique', () => {
		for (const c of PROFILS) {
			for (const filtre of FILTRES) {
				// Référence construite hors du module : catalogue, puis ordre pédagogique du niveau
				// affiché (`getLessonsByCategory`, ce que sert l'écran de l'enfant).
				const attendu = SUBJECTS.map((s) => ({
					subject: s.id,
					categories: CATEGORIES.filter((cat) => cat.subject === s.id)
						.map((cat) => ({
							categoryId: cat.id,
							ids: getLessonsByCategory(cat.id, niveauAffiche(c, s.id, filtre)).map((l) => l.id),
						}))
						.filter((cat) => cat.ids.length > 0),
				})).filter((m) => m.categories.length > 0);
				const obtenu = arbreCatalogue(c.p, { filtre }).map((m) => ({
					subject: m.subject,
					categories: m.categories.map((cat) => ({
						categoryId: cat.categoryId,
						ids: cat.lecons.map((l) => l.id),
					})),
				}));
				expect(obtenu, `${c.nom} · ${filtre}`).toEqual(attendu);
			}
		}
	});

	it('sans `dictees` : aucun groupe « Dictées de mots », et kind « lecon » sur chaque ligne', () => {
		for (const c of PROFILS) {
			for (const filtre of FILTRES) {
				const arbre = arbreCatalogue(c.p, { filtre });
				expect(groupeDictees(arbre)).toBeUndefined();
				const lignes = toutesLignes(arbre);
				expect(lignes.length).toBeGreaterThan(0);
				for (const l of lignes) expect(l.kind, `${c.nom} · ${filtre} · ${l.id}`).toBe('lecon');
			}
		}
	});

	it('`dictees: []` donne exactement l’arbre sans `dictees`', () => {
		for (const q of ['', 'mots', 'dictée'])
			expect(arbreCatalogue(CM1, { dictees: [], recherche: q }), q).toEqual(
				arbreCatalogue(CM1, { recherche: q }),
			);
	});

	it('avec dictées : les catégories du catalogue sont IDENTIQUES à l’arbre sans dictées (rien d’ajouté, rien de mêlé)', () => {
		let groupesVus = 0;
		for (const c of PROFILS) {
			for (const filtre of FILTRES) {
				for (const q of ['', 'mots', 'semaine', 'dictée', 'fois', 'zorglub']) {
					const ctx = `${c.nom} · ${filtre} · « ${q} »`;
					const avec = arbreCatalogue(c.p, { filtre, recherche: q, dictees: DICTEES_REELLES });
					const sans = arbreCatalogue(c.p, { filtre, recherche: q });
					if (groupeDictees(avec)) groupesVus++;
					expect(sansGroupeDictees(avec), ctx).toEqual(sans);
				}
			}
		}
		// Non creux : la comparaison a porté sur des arbres qui CONTENAIENT le groupe.
		expect(groupesVus).toBeGreaterThan(0);
	});

	it('recherche vide ou blanche = aucun filtre, dictées comprises', () => {
		const reference = arbreCatalogue(CE2, { lessons: F_LECONS, dictees: F_DICTEES });
		expect(idsDictees(reference)).toEqual(F_IDS_DICTEES); // prémisse
		for (const q of ['', '   '])
			expect(arbreCatalogue(CE2, { lessons: F_LECONS, dictees: F_DICTEES, recherche: q })).toEqual(
				reference,
			);
	});

	it('ordre des dictées = ordre d’ENTRÉE, pas un tri : entrée inversée → groupe inversé', () => {
		const inverse = [...F_DICTEES].reverse();
		expect(idsDictees(arbreCatalogue(CE2, { lessons: [], dictees: F_DICTEES }))).toEqual(
			F_IDS_DICTEES,
		);
		expect(idsDictees(arbreCatalogue(CE2, { lessons: [], dictees: inverse }))).toEqual(
			[...F_IDS_DICTEES].reverse(),
		);
	});
});

/* ============================================================
   Total de la matière
   ============================================================ */
describe('total de la matière = leçons + dictées', () => {
	it('compté à la main sur la fixture (CE2 : 4 leçons de français + 5 dictées)', () => {
		const arbre = arbreCatalogue(CE2, { lessons: F_LECONS, dictees: F_DICTEES });
		expect(matiere(arbre, 'francais')?.total).toBe(9);
		expect(matiere(arbre, 'math')?.total).toBe(1);
		expect(compterLecons(arbre)).toBe(10);
	});

	it('jeton CM1 sur la fixture : leçons CE2 et prédéfinies CE2 écartées, restent les 3 listes du parent', () => {
		const arbre = arbreCatalogue(CE2, { lessons: F_LECONS, filtre: 'cm1', dictees: F_DICTEES });
		expect(arbre.map((m) => m.subject)).toEqual(['francais']);
		expect(matiere(arbre, 'francais')?.total).toBe(3);
		expect(idsDictees(arbre)).toEqual(['d-s12', 'd-gout', 'd-bidule']);
	});

	it('INVARIANT vrai catalogue : total de chaque matière = somme des lignes de ses groupes', () => {
		for (const c of PROFILS) {
			for (const filtre of FILTRES) {
				for (const q of ['', 'mots', 'dictée']) {
					const arbre = arbreCatalogue(c.p, { filtre, recherche: q, dictees: DICTEES_REELLES });
					for (const m of arbre)
						expect(m.total, `${c.nom} · ${filtre} · « ${q} » · ${m.subject}`).toBe(
							m.categories.reduce((n, cat) => n + cat.lecons.length, 0),
						);
					expect(compterLecons(arbre)).toBe(toutesLignes(arbre).length);
				}
			}
		}
	});
});

/* ============================================================
   Critère 13 (partie pure) — pureté
   ============================================================ */
describe('critère 13 : aucune mutation des entrées, résultat reproductible, rien dans le stockage', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('entrées gelées en profondeur : aucun appel ne lève, ne modifie, ni n’écrit', () => {
		const lessons = [
			fab({ id: 'fx-a', label: 'Zorglub', category: 'fr-grammaire', motsCles: ['bidule'] }),
			fab({ id: 'fx-b', label: 'Bidule', category: 'fr-vocabulaire', levels: ['ce2', 'cm1'] }),
		];
		const dictees: DicteeArbreEntree[] = [
			{ id: 'd-1', label: 'Bidules de la semaine', source: 'liste' },
			{ id: 'd-2', label: 'Zorglub', source: 'predefini', niveau: 'ce2' },
		];
		const p = profil({ reference: 'cm1', parMatiere: { francais: 'ce2' } });
		// Gel PROFOND : en module ES (mode strict), toute écriture sur un objet gelé lève.
		for (const l of lessons) {
			Object.freeze(l.levels);
			if (l.motsCles) Object.freeze(l.motsCles);
			Object.freeze(l);
		}
		for (const d of dictees) Object.freeze(d);
		Object.freeze(lessons);
		Object.freeze(dictees);
		if (p.niveauParMatiere) Object.freeze(p.niveauParMatiere);
		Object.freeze(p);
		const avant = JSON.stringify({ lessons, dictees, p });

		const r1 = arbreCatalogue(p, { lessons, dictees, recherche: 'bidule' });
		const r2 = arbreCatalogue(p, { lessons, dictees, recherche: 'bidule' });
		const t = tronquerArbre(r1, 1);

		expect(JSON.stringify({ lessons, dictees, p })).toBe(avant);
		expect(r2).toEqual(r1);
		// Prémisse : l'appel a bien parcouru leçons ET dictées (2 leçons + 1 dictée).
		expect(compterLecons(r1)).toBe(3);
		expect(idsDictees(r1)).toEqual(['d-1']);
		expect(t.restant).toBe(2);
		expect(localStorage.length).toBe(0);
	});

	it('le résultat ne partage pas d’objet avec les entrées : le modifier ne touche pas aux dictées fournies', () => {
		const dictees: DicteeArbreEntree[] = [{ id: 'd-1', label: 'Zorglub', source: 'liste' }];
		const r = arbreCatalogue(CE2, { lessons: [], dictees });
		const l = groupeDictees(r)?.lecons[0];
		expect(l).toBeDefined(); // prémisse
		l!.label = 'modifié';
		expect(dictees[0].label).toBe('Zorglub');
		expect(idsDictees(arbreCatalogue(CE2, { lessons: [], dictees }))).toEqual(['d-1']);
		expect(groupeDictees(arbreCatalogue(CE2, { lessons: [], dictees }))?.lecons[0].label).toBe(
			'Zorglub',
		);
	});
});
