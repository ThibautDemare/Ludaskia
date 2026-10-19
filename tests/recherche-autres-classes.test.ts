/* ============================================================
   Recherche de leçon dans TOUTES les classes (#772, critères 10, 13 et 22)
   — src/core/recherche-lecon.ts (pur).

   Écrit AVANT l'implémentation, par un auteur distinct : chaque attendu vient des
   critères de l'issue et des règles du contrat (« Règles (critère 10) » du brief),
   jamais du code. Tant que `autresClasses` n'est pas lu, les tests du critère 10 sont
   ROUGES ; ceux du critère 22 et des dictées sont VERTS dès maintenant, parce qu'ils
   gardent ce qui ne doit pas changer (chacun dit plus bas ce qui le ferait rougir).

   Le contrat n'existant pas encore côté types, trois types locaux l'anticipent sans
   transtypage : `SourceAC` (le drapeau), `LigneAC` (la classe d'un résultat),
   `DicteeAC` (la classe d'une dictée). Ils restent justes une fois le contrat posé.

   La classe la plus proche est recalculée ICI depuis l'échelle scolaire (écart, puis
   celle du dessous à égalité), sans importer `classeLaPlusProche` : la règle est
   dérivée du critère 10, pas du code qui la porte.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	RECHERCHE_MIN,
	rechercherLecons,
	type DicteeRecherche,
	type ResultatLecon,
	type ResultatsRecherche,
	type SourceRecherche,
} from '../src/core/recherche-lecon';
import {
	CATEGORIES,
	getAllLessons,
	getLessonById,
	getLessonsByCategory,
	type LessonDef,
	type SchoolLevel,
	type SubjectId,
} from '../src/core/catalog';
import type { ExerciseType } from '../src/core/exercise';
import { libelleAffiche } from '../src/core/libelle-affiche';
import { trierParOrdre } from '../src/core/ordre';
import { ordreEcran } from '../src/core/rubriques';
import { cleRecherche } from '../src/core/utils';

/* ---------- Contrat anticipé ---------- */
type SourceAC = SourceRecherche & { autresClasses?: boolean };
type LigneAC = ResultatLecon & { niveau?: SchoolLevel };
type DicteeAC = DicteeRecherche & { niveau?: SchoolLevel };

/** Une ligne de résultat telle qu'on la compare : `niveau` n'y figure que s'il est défini. */
interface Ligne {
	id: string;
	label: string;
	niveau?: SchoolLevel;
}
function vue(l: LigneAC): Ligne {
	const n = l.niveau;
	return n === undefined ? { id: l.id, label: l.label } : { id: l.id, label: l.label, niveau: n };
}
function vueDictee(d: DicteeAC): DicteeAC {
	const n = d.niveau;
	return n === undefined ? { id: d.id, label: d.label } : { id: d.id, label: d.label, niveau: n };
}

/* ---------- Classe suivie par matière ---------- */
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
const MELE = mele('cm1', 'ce2'); // maths CM1, français CE2
const MELE_INVERSE = mele('ce2', 'cm1');
const PROFILS: [string, NiveauParMatiere][] = [
	['CE2', CE2],
	['CM1', CM1],
	['maths CM1 / français CE2', MELE],
	['maths CE2 / français CM1', MELE_INVERSE],
];

/* ---------- Échelle scolaire et proximité (dérivées du critère 10) ---------- */
const ECHELLE: SchoolLevel[] = ['cp', 'ce1', 'ce2', 'cm1', 'cm2', '6e'];
/** Les autres classes, de la plus proche à la plus lointaine ; à écart égal, celle du dessous. */
function parProximite(profil: SchoolLevel): SchoolLevel[] {
	const p = ECHELLE.indexOf(profil);
	return ECHELLE.filter((c) => c !== profil).sort((a, b) => {
		const ia = ECHELLE.indexOf(a);
		const ib = ECHELLE.indexOf(b);
		return Math.abs(ia - p) - Math.abs(ib - p) || ia - ib;
	});
}

/* ---------- Sources ---------- */
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
	levels: SchoolLevel[];
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
		levels: o.levels,
		exerciseType: STUB,
	};
	if (o.motsCles) def.motsCles = o.motsCles;
	if (o.labelNiveau) def.labelNiveau = o.labelNiveau;
	if (o.rubrique) def.rubrique = o.rubrique;
	return def;
}
interface Options {
	autresClasses?: boolean;
	dictees?: readonly DicteeAC[];
}
/** `autresClasses` n'est posé que s'il est fourni : « absent » reste vraiment absent. */
function source(
	lessons: readonly LessonDef[],
	niveau: NiveauParMatiere,
	opts: Options = {},
): SourceAC {
	const s: SourceAC = { lessons, niveau, dictees: opts.dictees ?? [] };
	if (opts.autresClasses !== undefined) s.autresClasses = opts.autresClasses;
	return s;
}
const reel = (niveau: NiveauParMatiere, opts: Options = {}): SourceAC =>
	source(getAllLessons(), niveau, opts);
const TOUTES = { autresClasses: true } as const;

/* ---------- Lecture d'un résultat ---------- */
const lignes = (r: ResultatsRecherche): Ligne[] => r.groupes.flatMap((g) => g.lecons.map(vue));
const lignesDe = (r: ResultatsRecherche, id: string): Ligne[] =>
	lignes(r).filter((l) => l.id === id);
const idsCategories = (r: ResultatsRecherche): string[] => r.categories.map((c) => c.categoryId);
const groupesVus = (r: ResultatsRecherche) =>
	r.groupes.map((g) => ({ categoryId: g.categoryId, lecons: g.lecons.map(vue) }));

function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon « ${id} » absente du catalogue : test à réviser`);
	return l;
}
function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi + ' : test à réviser');
	return l;
}
const seule = (lv: SchoolLevel) => (l: LessonDef) => l.levels.length === 1 && l.levels[0] === lv;

/* ---------- Référence : ce que les règles du critère 10 font attendre ----------
   Écrite depuis les règles, pas depuis une implémentation (il n'y en a pas) :
   1. classe suivie d'abord, dans l'ordre de son écran ;
   2. puis chaque autre classe, de la plus proche à la plus lointaine, dans l'ordre de
      l'écran de CETTE classe (tri pédagogique de cette classe, rubriques calculées sur
      toute la catégorie avant de filtrer) ;
   3. une leçon de la classe suivie n'y revient que sous un libellé DIFFÉRENT, une fois
      par libellé (classe la plus proche qui le porte) ; une leçon absente de la classe
      suivie n'y revient qu'une fois, dans sa classe la plus proche. */
function retenue(l: LessonDef, c: SchoolLevel, profil: SchoolLevel): boolean {
	const candidates = parProximite(profil).filter((x) => l.levels.includes(x));
	if (!l.levels.includes(profil)) return candidates[0] === c;
	const label = libelleAffiche(l, c);
	if (label === libelleAffiche(l, profil)) return false;
	return candidates.find((x) => libelleAffiche(l, x) === label) === c;
}
function attenduGroupes(
	q: string,
	s: { lessons: readonly LessonDef[]; niveau: NiveauParMatiere },
): { categoryId: string; lecons: Ligne[] }[] {
	const cle = cleRecherche(q);
	const contient = (t: string): boolean => cleRecherche(t).includes(cle);
	const correspond = (l: LessonDef, label: string): boolean =>
		contient(label) || (l.motsCles ?? []).some(contient);
	const out: { categoryId: string; lecons: Ligne[] }[] = [];
	for (const cat of CATEGORIES) {
		const profil = s.niveau(cat.subject);
		const dansCat = s.lessons.filter((l) => l.category === cat.id);
		const ecran = (c: SchoolLevel): LessonDef[] =>
			ordreEcran(
				trierParOrdre(
					dansCat.filter((l) => l.levels.includes(c)),
					c,
				),
			);
		const lecons: Ligne[] = [];
		for (const l of ecran(profil)) {
			const label = libelleAffiche(l, profil);
			if (correspond(l, label)) lecons.push({ id: l.id, label });
		}
		for (const c of parProximite(profil)) {
			for (const l of ecran(c)) {
				const label = libelleAffiche(l, c);
				if (retenue(l, c, profil) && correspond(l, label))
					lecons.push({ id: l.id, label, niveau: c });
			}
		}
		if (lecons.length) out.push({ categoryId: cat.id, lecons });
	}
	return out;
}

const INACTIVE: ResultatsRecherche = {
	active: false,
	categories: [],
	groupes: [],
	dictees: [],
	total: 0,
};

/* Requêtes du vrai catalogue : larges (« le ») et ciblées (libellés cités par l'issue). */
const REQUETES = [
	'le',
	'je decompose',
	'clique sur',
	'compar',
	'nombre',
	'present',
	'mult',
	'fois',
	'nom',
	'conjug',
];

/* ============================================================
   Critère 10 — profil CM1 : toutes les classes, sans doublon
   ============================================================ */
describe('critère 10 : un CM1 trouve aussi les leçons de CE2, une fois chacune', () => {
	it('« Je compare les nombres » (num-comparer, même libellé en CE2 et en CM1) sort UNE fois, sans classe', () => {
		const def = lecon('num-comparer');
		// Prémisses : commune aux deux classes, sous le même libellé.
		expect(def.levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
		expect(libelleAffiche(def, 'ce2')).toBe(libelleAffiche(def, 'cm1'));
		const r = rechercherLecons(libelleAffiche(def, 'cm1'), reel(CM1, TOUTES));
		expect(lignesDe(r, 'num-comparer')).toEqual([
			{ id: 'num-comparer', label: libelleAffiche(def, 'cm1') },
		]);
	});

	it('une leçon CE2 seule (num-decompose-100) est trouvée par son libellé, une fois, avec la classe CE2', () => {
		const def = lecon('num-decompose-100');
		expect(def.levels).toEqual(['ce2']); // prémisse
		const r = rechercherLecons(libelleAffiche(def, 'ce2'), reel(CM1, TOUTES));
		expect(lignesDe(r, def.id)).toEqual([
			{ id: def.id, label: libelleAffiche(def, 'ce2'), niveau: 'ce2' },
		]);
		// Rangée dans le groupe de SA catégorie.
		const groupe = r.groupes.find((g) => g.lecons.some((l) => l.id === def.id));
		expect(groupe?.categoryId).toBe('math-numeration');
	});

	it('« Clique sur le nom » (version CE2 de fr-gram-clic-noyau) sort avec la classe CE2, APRÈS la version CM1 sans classe', () => {
		const def = lecon('fr-gram-clic-noyau');
		const ce2 = libelleAffiche(def, 'ce2');
		const cm1 = libelleAffiche(def, 'cm1');
		// Prémisses : deux libellés distincts, et celui du CE2 est contenu dans celui du CM1
		// (« Clique sur le nom » / « Clique sur le nom noyau ») : la requête touche les deux.
		expect(ce2).not.toBe(cm1);
		expect(cleRecherche(cm1)).toContain(cleRecherche(ce2));
		const r = rechercherLecons(ce2, reel(CM1, TOUTES));
		expect(lignesDe(r, def.id)).toEqual([
			{ id: def.id, label: cm1 },
			{ id: def.id, label: ce2, niveau: 'ce2' },
		]);
	});

	it('un mot-clé de la leçon fait sortir ses DEUX libellés, chacun dans sa classe (règle 2 : libellé OU mots-clés)', () => {
		const def = lecon('fr-gram-clic-noyau');
		expect(def.motsCles).toContain('nom commun'); // prémisse
		const r = rechercherLecons('nom commun', reel(CM1, TOUTES));
		expect(lignesDe(r, def.id)).toEqual([
			{ id: def.id, label: libelleAffiche(def, 'cm1') },
			{ id: def.id, label: libelleAffiche(def, 'ce2'), niveau: 'ce2' },
		]);
	});

	it('balayage : toute leçon CE2 seule, et toute version CE2 au libellé propre, est trouvée par ce libellé, une fois, avec la classe CE2', () => {
		let cas = 0;
		for (const def of getAllLessons()) {
			if (!def.levels.includes('ce2')) continue;
			const label = libelleAffiche(def, 'ce2');
			const commune = def.levels.includes('cm1');
			if (commune && label === libelleAffiche(def, 'cm1')) continue;
			cas++;
			const trouvees = lignesDe(rechercherLecons(label, reel(CM1, TOUTES)), def.id).filter(
				(l) => l.label === label,
			);
			expect(trouvees, `${def.id} « ${label} »`).toEqual([{ id: def.id, label, niveau: 'ce2' }]);
		}
		expect(cas).toBeGreaterThan(10); // prémisse : le balayage n'est pas creux
	});
});

/* ============================================================
   Critère 10 — profil CE2 : les leçons de CM1
   ============================================================ */
describe('critère 10 : un CE2 trouve aussi les leçons de CM1', () => {
	it('une leçon CM1 seule (num-decompose-multiplicative) est trouvée par son libellé, avec la classe CM1', () => {
		const def = lecon('num-decompose-multiplicative');
		expect(def.levels).toEqual(['cm1']); // prémisse
		const r = rechercherLecons(libelleAffiche(def, 'cm1'), reel(CE2, TOUTES));
		expect(lignesDe(r, def.id)).toEqual([
			{ id: def.id, label: libelleAffiche(def, 'cm1'), niveau: 'cm1' },
		]);
	});

	it('« Clique sur le nom noyau » : seule la version CM1 correspond, elle sort SEULE, avec la classe CM1', () => {
		// La version de la classe suivie (« Clique sur le nom ») ne correspond pas à la
		// requête : elle ne doit pas sortir pour autant, ni prêter son libellé.
		const def = lecon('fr-gram-clic-noyau');
		const cm1 = libelleAffiche(def, 'cm1');
		expect(cleRecherche(libelleAffiche(def, 'ce2'))).not.toContain(cleRecherche(cm1)); // prémisse
		const r = rechercherLecons(cm1, reel(CE2, TOUTES));
		expect(lignesDe(r, def.id)).toEqual([{ id: def.id, label: cm1, niveau: 'cm1' }]);
	});

	it('balayage : toute leçon CM1 seule, et toute version CM1 au libellé propre, est trouvée par ce libellé, avec la classe CM1', () => {
		let cas = 0;
		for (const def of getAllLessons()) {
			if (!def.levels.includes('cm1')) continue;
			const label = libelleAffiche(def, 'cm1');
			if (def.levels.includes('ce2') && label === libelleAffiche(def, 'ce2')) continue;
			cas++;
			const trouvees = lignesDe(rechercherLecons(label, reel(CE2, TOUTES)), def.id).filter(
				(l) => l.label === label,
			);
			expect(trouvees, `${def.id} « ${label} »`).toEqual([{ id: def.id, label, niveau: 'cm1' }]);
		}
		expect(cas).toBeGreaterThan(10);
	});
});

/* ============================================================
   Critère 10 — ordre dans un groupe
   ============================================================ */
describe('critère 10 : ordre dans un groupe — classe suivie, puis les autres de la plus proche à la plus lointaine', () => {
	/* Profil CM1. Fixtures sans ordre pédagogique : à chaque classe, l'écran suit l'ordre
	   d'entrée. Attendu calculé à la main :
	   - CM1 (suivie) : a, e (« Zorglub E »), f ;
	   - écart 1 : CE2 (dessous) avant CM2 → b, e (« Zorglub E petit ») ; puis c ;
	   - écart 2 : CE1 (dessous) avant 6e → d ; puis g ;
	   - écart 3 : CP → h. */
	const FIXTURES = [
		fab({ id: 'fx-a', label: 'Zorglub A', category: 'math-calcul', levels: ['cm1'] }),
		fab({ id: 'fx-b', label: 'Zorglub B', category: 'math-calcul', levels: ['ce2'] }),
		fab({ id: 'fx-c', label: 'Zorglub C', category: 'math-calcul', levels: ['cm2'] }),
		fab({ id: 'fx-d', label: 'Zorglub D', category: 'math-calcul', levels: ['ce1'] }),
		fab({
			id: 'fx-e',
			label: 'Zorglub E',
			category: 'math-calcul',
			levels: ['ce2', 'cm1'],
			labelNiveau: { ce2: 'Zorglub E petit', cm1: 'Zorglub E' },
		}),
		fab({ id: 'fx-f', label: 'Zorglub F', category: 'math-calcul', levels: ['cm1'] }),
		fab({ id: 'fx-g', label: 'Zorglub G', category: 'math-calcul', levels: ['6e'] }),
		fab({ id: 'fx-h', label: 'Zorglub H', category: 'math-calcul', levels: ['cp'] }),
	];
	const ATTENDU: Ligne[] = [
		{ id: 'fx-a', label: 'Zorglub A' },
		{ id: 'fx-e', label: 'Zorglub E' },
		{ id: 'fx-f', label: 'Zorglub F' },
		{ id: 'fx-b', label: 'Zorglub B', niveau: 'ce2' },
		{ id: 'fx-e', label: 'Zorglub E petit', niveau: 'ce2' },
		{ id: 'fx-c', label: 'Zorglub C', niveau: 'cm2' },
		{ id: 'fx-d', label: 'Zorglub D', niveau: 'ce1' },
		{ id: 'fx-g', label: 'Zorglub G', niveau: '6e' },
		{ id: 'fx-h', label: 'Zorglub H', niveau: 'cp' },
	];

	it('prémisse de la référence : elle redonne le calcul fait à la main', () => {
		// Vérifie l'outil de test, pas le module : sans elle, la comparaison au vrai
		// catalogue (plus bas) pourrait reposer sur une référence fausse.
		expect(attenduGroupes('zorglub', source(FIXTURES, CM1))).toEqual([
			{ categoryId: 'math-calcul', lecons: ATTENDU },
		]);
	});

	it('écart croissant, celle du DESSOUS d’abord à écart égal, et la classe suivie en tête', () => {
		const r = rechercherLecons('zorglub', source(FIXTURES, CM1, TOUTES));
		expect(groupesVus(r)).toEqual([{ categoryId: 'math-calcul', lecons: ATTENDU }]);
	});

	it('dans une autre classe : l’ordre de SON écran, rubriques calculées sur toute la catégorie AVANT de filtrer', () => {
		/* Écran CE2 (ordre d'entrée, puis rubriques) : « commun » (R2) ouvre R2, puis x (R1),
		   y (R2) → R2 : commun, y ; R1 : x. « commun » a le même libellé dans les deux
		   classes : il ne revient pas en CE2. Reste y PUIS x. Filtrer avant de regrouper
		   donnerait x puis y (R1 apparaîtrait d'abord). */
		const lessons = [
			fab({
				id: 'fx-commun',
				label: 'Zorglub commun',
				category: 'fr-vocabulaire',
				levels: ['ce2', 'cm1'],
				rubrique: 'R2',
			}),
			fab({
				id: 'fx-x',
				label: 'Zorglub X',
				category: 'fr-vocabulaire',
				levels: ['ce2'],
				rubrique: 'R1',
			}),
			fab({
				id: 'fx-y',
				label: 'Zorglub Y',
				category: 'fr-vocabulaire',
				levels: ['ce2'],
				rubrique: 'R2',
			}),
		];
		const r = rechercherLecons('zorglub', source(lessons, CM1, TOUTES));
		expect(lignes(r)).toEqual([
			{ id: 'fx-commun', label: 'Zorglub commun' },
			{ id: 'fx-y', label: 'Zorglub Y', niveau: 'ce2' },
			{ id: 'fx-x', label: 'Zorglub X', niveau: 'ce2' },
		]);
	});

	it('prémisse de la référence, vrai catalogue : sa part « classe suivie » est le résultat d’aujourd’hui, et son ordre des autres classes n’est pas l’ordre reçu', () => {
		// Vérifie l'outil de test contre le module SANS le drapeau (comportement en place) :
		// si la référence se trompait sur la classe suivie, le test suivant échouerait pour
		// une mauvaise raison. Et elle doit discriminer : sur un catalogue inversé, l'ordre
		// attendu dans une autre classe diffère de l'ordre reçu, sinon une implémentation qui
		// garderait l'ordre d'entrée passerait.
		const inverse = [...getAllLessons()].reverse();
		const rangRecu = new Map(inverse.map((l, i) => [l.id, i]));
		let discriminants = 0;
		for (const [nom, niveau] of PROFILS) {
			for (const q of REQUETES) {
				const attendu = attenduGroupes(q, { lessons: inverse, niveau });
				const suivie = attendu
					.map((g) => ({
						categoryId: g.categoryId,
						lecons: g.lecons.filter((l) => l.niveau === undefined),
					}))
					.filter((g) => g.lecons.length > 0);
				expect(suivie, `${nom} · « ${q} »`).toEqual(
					groupesVus(rechercherLecons(q, source(inverse, niveau))),
				);
				for (const g of attendu) {
					const autres = g.lecons.filter((l) => l.niveau !== undefined).map((l) => l.id);
					const recu = [...autres].sort((a, b) => (rangRecu.get(a) ?? 0) - (rangRecu.get(b) ?? 0));
					if (autres.join() !== recu.join()) discriminants++;
				}
			}
		}
		expect(discriminants).toBeGreaterThan(0);
	});

	it('vrai catalogue fourni À L’ENVERS : chaque groupe suit la référence (ordre pédagogique de chaque classe)', () => {
		// Catalogue inversé : garder l'ordre reçu, ou trier une leçon CE2 seule avec l'ordre
		// du CM1 (où elle est absente, donc en queue dans l'ordre reçu), rend l'autre classe
		// à l'envers.
		const inverse = [...getAllLessons()].reverse();
		for (const [nom, niveau] of PROFILS) {
			for (const q of REQUETES) {
				const r = rechercherLecons(q, source(inverse, niveau, TOUTES));
				expect(groupesVus(r), `${nom} · « ${q} »`).toEqual(
					attenduGroupes(q, { lessons: inverse, niveau }),
				);
			}
		}
	});
});

/* ============================================================
   Critère 10 — classe la plus proche (données de test)
   ============================================================ */
describe('critère 10 : une leçon absente de la classe suivie sort UNE fois, dans la classe la plus proche', () => {
	it('CE1 et CM2, vue d’un CM1 → CM2 (écart 1 contre 2), avec le libellé de CM2', () => {
		const lessons = [
			fab({
				id: 'fx-loin',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['ce1', 'cm2'],
				labelNiveau: { ce1: 'Zorglub petit', cm2: 'Zorglub grand' },
			}),
		];
		const s = source(lessons, CM1, TOUTES);
		expect(lignes(rechercherLecons('zorglub', s))).toEqual([
			{ id: 'fx-loin', label: 'Zorglub grand', niveau: 'cm2' },
		]);
		// Le libellé de la classe la plus LOINTAINE ne fait pas sortir une seconde ligne.
		expect(lignes(rechercherLecons('zorglub petit', s))).toEqual([]);
	});

	it('CE2 et CM2, vue d’un CM1 → CE2 (écart égal : celle du dessous)', () => {
		const lessons = [
			fab({
				id: 'fx-egal',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['ce2', 'cm2'],
				labelNiveau: { ce2: 'Zorglub dessous', cm2: 'Zorglub dessus' },
			}),
		];
		expect(lignes(rechercherLecons('zorglub', source(lessons, CM1, TOUTES)))).toEqual([
			{ id: 'fx-egal', label: 'Zorglub dessous', niveau: 'ce2' },
		]);
	});

	it('CP et CM2, vue d’un CE2 → CP (écart 2 des deux côtés) ; 6e seule, vue d’un CE2 → 6e', () => {
		const lessons = [
			fab({
				id: 'fx-cp-cm2',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['cp', 'cm2'],
				labelNiveau: { cp: 'Zorglub du CP', cm2: 'Zorglub du CM2' },
			}),
			fab({ id: 'fx-6e', label: 'Zorglub sixième', category: 'math-calcul', levels: ['6e'] }),
		];
		expect(lignes(rechercherLecons('zorglub', source(lessons, CE2, TOUTES)))).toEqual([
			{ id: 'fx-cp-cm2', label: 'Zorglub du CP', niveau: 'cp' },
			{ id: 'fx-6e', label: 'Zorglub sixième', niveau: '6e' },
		]);
	});
});

describe('critère 10 : une leçon de la classe suivie ne revient que sous un libellé DIFFÉRENT, une fois par libellé', () => {
	it('deux autres classes au même libellé différent → un seul résultat, la plus proche ; libellé identique → rien', () => {
		const lessons = [
			// CE1 et CE2 disent X, CM1 dit Y → Y, puis X en CE2 (plus proche que CE1).
			fab({
				id: 'fx-p',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['ce1', 'ce2', 'cm1'],
				labelNiveau: { ce1: 'Zorglub X', ce2: 'Zorglub X', cm1: 'Zorglub Y' },
			}),
			// CE2 et CM2 disent Z (écart égal), CM1 dit W → W, puis Z en CE2 (dessous).
			fab({
				id: 'fx-q',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['ce2', 'cm1', 'cm2'],
				labelNiveau: { ce2: 'Zorglub Z', cm1: 'Zorglub W', cm2: 'Zorglub Z' },
			}),
			// CE2 dit comme CM1 (rien), CE1 diffère → U, puis V en CE1.
			fab({
				id: 'fx-r',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['ce1', 'ce2', 'cm1'],
				labelNiveau: { ce1: 'Zorglub V', ce2: 'Zorglub U', cm1: 'Zorglub U' },
			}),
		];
		expect(lignes(rechercherLecons('zorglub', source(lessons, CM1, TOUTES)))).toEqual([
			{ id: 'fx-p', label: 'Zorglub Y' },
			{ id: 'fx-q', label: 'Zorglub W' },
			{ id: 'fx-r', label: 'Zorglub U' },
			{ id: 'fx-p', label: 'Zorglub X', niveau: 'ce2' },
			{ id: 'fx-q', label: 'Zorglub Z', niveau: 'ce2' },
			{ id: 'fx-r', label: 'Zorglub V', niveau: 'ce1' },
		]);
	});

	it('INVARIANT vrai catalogue : pas de doublon, et chaque ligne d’une autre classe est légitime', () => {
		let lignesAutres = 0;
		for (const [nom, niveau] of PROFILS) {
			for (const q of REQUETES) {
				const r = rechercherLecons(q, reel(niveau, TOUTES));
				const ls = lignes(r);
				const ctx = `${nom} · « ${q} »`;
				// Une même leçon : jamais deux fois le même libellé, ni deux fois la même classe.
				const parLibelle = ls.map((l) => `${l.id}|${l.label}`);
				const parClasse = ls.map((l) => `${l.id}|${l.niveau ?? 'suivie'}`);
				expect(new Set(parLibelle).size, ctx).toBe(ls.length);
				expect(new Set(parClasse).size, ctx).toBe(ls.length);
				for (const l of ls) {
					const def = lecon(l.id);
					const profil = niveau(def.subject);
					if (l.niveau === undefined) {
						expect(def.levels, `${ctx} · ${l.id}`).toContain(profil);
						expect(l.label).toBe(libelleAffiche(def, profil));
						continue;
					}
					lignesAutres++;
					// Classe portée = classe réelle de la leçon, jamais la classe suivie.
					expect(l.niveau, `${ctx} · ${l.id}`).not.toBe(profil);
					expect(def.levels, `${ctx} · ${l.id}`).toContain(l.niveau);
					expect(l.label, `${ctx} · ${l.id}`).toBe(libelleAffiche(def, l.niveau));
					expect(retenue(def, l.niveau, profil), `${ctx} · ${l.id}@${l.niveau}`).toBe(true);
				}
				expect(r.total, ctx).toBe(r.categories.length + ls.length + r.dictees.length);
			}
		}
		expect(lignesAutres).toBeGreaterThan(0); // prémisse : des lignes d'autres classes existent
	});
});

/* ============================================================
   Règle 1 — la classe suivie sort comme aujourd'hui, en tête de chaque groupe
   ============================================================ */
describe('règle 1 : avec autresClasses, la classe suivie sort à l’identique, en tête de chaque groupe', () => {
	it('retirées les lignes d’autres classes, il reste exactement le résultat sans le drapeau', () => {
		let allonges = 0;
		for (const [nom, niveau] of PROFILS) {
			for (const q of REQUETES) {
				const sans = groupesVus(rechercherLecons(q, reel(niveau)));
				const avec = groupesVus(rechercherLecons(q, reel(niveau, TOUTES)));
				const ctx = `${nom} · « ${q} »`;
				// Dans chaque groupe, aucune ligne de la classe suivie après une ligne d'une autre.
				for (const g of avec) {
					const premiereAutre = g.lecons.findIndex((l) => l.niveau !== undefined);
					if (premiereAutre < 0) continue;
					allonges++;
					expect(
						g.lecons.slice(premiereAutre).every((l) => l.niveau !== undefined),
						`${ctx} · ${g.categoryId}`,
					).toBe(true);
				}
				const classeSuivie = avec
					.map((g) => ({
						categoryId: g.categoryId,
						lecons: g.lecons.filter((l) => l.niveau === undefined),
					}))
					.filter((g) => g.lecons.length > 0);
				expect(classeSuivie, ctx).toEqual(sans);
			}
		}
		expect(allonges).toBeGreaterThan(0); // prémisse : le drapeau ajoute bien quelque chose
	});
});

/* ============================================================
   Matière surchargée — chaque matière jugée sur sa propre classe
   ============================================================ */
describe('profil mêlé : chaque matière est jugée sur SA classe suivie', () => {
	it('maths CM1 / français CE2 : la classe portée dépend de la matière de la leçon', () => {
		const mathCe2 = lecon('num-decompose-100');
		const mathCm1 = lecon('num-decompose-multiplicative');
		const frCe2 = leconTelleQue(
			(l) => l.subject === 'francais' && seule('ce2')(l),
			'de français CE2 seule',
		);
		const frCm1 = leconTelleQue(
			(l) => l.subject === 'francais' && seule('cm1')(l),
			'de français CM1 seule',
		);
		const noyau = lecon('fr-gram-clic-noyau');
		const s = reel(MELE, TOUTES);
		const cherche = (def: LessonDef, lv: SchoolLevel): Ligne[] =>
			lignesDe(rechercherLecons(libelleAffiche(def, lv), s), def.id).filter(
				(l) => l.label === libelleAffiche(def, lv),
			);
		// Maths en CM1 : la CE2 seule porte « ce2 », la CM1 seule ne porte rien.
		expect(cherche(mathCe2, 'ce2')).toEqual([
			{ id: mathCe2.id, label: libelleAffiche(mathCe2, 'ce2'), niveau: 'ce2' },
		]);
		expect(cherche(mathCm1, 'cm1')).toEqual([
			{ id: mathCm1.id, label: libelleAffiche(mathCm1, 'cm1') },
		]);
		// Français en CE2 : l'inverse.
		expect(cherche(frCe2, 'ce2')).toEqual([{ id: frCe2.id, label: libelleAffiche(frCe2, 'ce2') }]);
		expect(cherche(frCm1, 'cm1')).toEqual([
			{ id: frCm1.id, label: libelleAffiche(frCm1, 'cm1'), niveau: 'cm1' },
		]);
		// Leçon commune de français : la version CM1 porte « cm1 » (le français est en CE2).
		expect(cherche(noyau, 'cm1')).toEqual([
			{ id: noyau.id, label: libelleAffiche(noyau, 'cm1'), niveau: 'cm1' },
		]);
	});

	it('maths CE2 / français CM1 : symétrique', () => {
		const mathCm1 = lecon('num-decompose-multiplicative');
		const noyau = lecon('fr-gram-clic-noyau');
		const s = reel(MELE_INVERSE, TOUTES);
		expect(lignesDe(rechercherLecons(libelleAffiche(mathCm1, 'cm1'), s), mathCm1.id)).toEqual([
			{ id: mathCm1.id, label: libelleAffiche(mathCm1, 'cm1'), niveau: 'cm1' },
		]);
		expect(lignesDe(rechercherLecons(libelleAffiche(noyau, 'ce2'), s), noyau.id)).toEqual([
			{ id: noyau.id, label: libelleAffiche(noyau, 'cm1') },
			{ id: noyau.id, label: libelleAffiche(noyau, 'ce2'), niveau: 'ce2' },
		]);
	});
});

/* ============================================================
   Catégories proposées
   ============================================================ */
describe('catégories : avec autresClasses, une catégorie pourvue dans n’importe quelle classe peut sortir', () => {
	it('« Calcul » (math-calcul, CE2 seulement) est proposée à un CM1 avec autresClasses, et seulement avec', () => {
		// Prémisses : aucune leçon de Calcul en CM1, au moins une en CE2.
		expect(getLessonsByCategory('math-calcul', 'cm1')).toEqual([]);
		expect(getLessonsByCategory('math-calcul', 'ce2').length).toBeGreaterThan(0);
		expect(idsCategories(rechercherLecons('calcul', reel(CM1)))).not.toContain('math-calcul');
		expect(
			idsCategories(rechercherLecons('calcul', reel(CM1, { autresClasses: false }))),
		).not.toContain('math-calcul');
		expect(idsCategories(rechercherLecons('calcul', reel(CM1, TOUTES)))).toContain('math-calcul');
	});

	it('une catégorie pourvue seulement en CM2 (deux classes d’écart) est proposée à un CE2', () => {
		const lessons = [
			fab({ id: 'fx-geo', label: 'Zorglub', category: 'math-geometrie', levels: ['cm2'] }),
			fab({ id: 'fx-calc', label: 'Zorglub', category: 'math-calcul', levels: ['ce2'] }),
		];
		const r = rechercherLecons('geometrie', source(lessons, CE2, TOUTES));
		expect(idsCategories(r)).toEqual(['math-geometrie']);
	});

	it('une catégorie vide dans TOUTES les classes n’est jamais proposée, même avec autresClasses', () => {
		const lessons = [
			fab({ id: 'fx-calc', label: 'Zorglub', category: 'math-calcul', levels: ['cm2'] }),
		];
		expect(idsCategories(rechercherLecons('geometrie', source(lessons, CE2, TOUTES)))).toEqual([]);
		expect(rechercherLecons('geometrie', source([], CM1, TOUTES))).toEqual({
			...INACTIVE,
			active: true,
		});
	});
});

/* ============================================================
   Total
   ============================================================ */
describe('total : compte tout, autres classes comprises', () => {
	it('cas composé compté à la main', () => {
		const lessons = [
			// Donne du contenu à Géométrie en CE2 seulement : proposée à un CM1 grâce au drapeau.
			fab({ id: 'g1', label: 'Les angles droits', category: 'math-geometrie', levels: ['ce2'] }),
			fab({ id: 'g2', label: 'Tracer en géométrie', category: 'math-geometrie', levels: ['ce2'] }),
			fab({ id: 'g3', label: 'Géométrie du zorglub', category: 'math-calcul', levels: ['cm1'] }),
			fab({
				id: 'g4',
				label: 'Lexique',
				category: 'fr-vocabulaire',
				levels: ['ce2', 'cm1'],
				labelNiveau: { ce2: 'Mots de géométrie', cm1: 'Lexique de la géométrie' },
			}),
		];
		const dictees: DicteeAC[] = [
			{ id: 'd-geo', label: 'Mots de la géométrie', niveau: 'ce2' },
			{ id: 'd-autre', label: 'Les fruits' },
		];
		const r = rechercherLecons('geometrie', source(lessons, CM1, { autresClasses: true, dictees }));
		// À la main : 1 catégorie (Géométrie) + 4 lignes (g3 ; g2 en CE2 ; g4 en CM1 puis en
		// CE2) + 1 dictée = 6. Calcul avant Géométrie avant Vocabulaire (ordre du catalogue).
		expect(idsCategories(r)).toEqual(['math-geometrie']);
		expect(lignes(r)).toEqual([
			{ id: 'g3', label: 'Géométrie du zorglub' },
			{ id: 'g2', label: 'Tracer en géométrie', niveau: 'ce2' },
			{ id: 'g4', label: 'Lexique de la géométrie' },
			{ id: 'g4', label: 'Mots de géométrie', niveau: 'ce2' },
		]);
		expect(r.dictees.map(vueDictee)).toEqual([
			{ id: 'd-geo', label: 'Mots de la géométrie', niveau: 'ce2' },
		]);
		expect(r.total).toBe(6);
	});
});

/* ============================================================
   Critère 13 — dictées : la classe éventuelle est recopiée
   ============================================================ */
describe('critère 13 : une dictée garde sa classe dans le résultat, et n’en reçoit pas', () => {
	it('dictée avec classe → la garde ; sans classe → n’en a pas ; filtre et ordre d’entrée inchangés', () => {
		const dictees: DicteeAC[] = [
			{ id: 'd-cm1', label: 'Zorglub du CM1', niveau: 'cm1' },
			{ id: 'd-hors', label: 'Les fruits', niveau: 'cm1' },
			{ id: 'd-sans', label: 'Zorglub de la semaine' },
		];
		for (const opts of [{ dictees }, { autresClasses: true, dictees }]) {
			const r = rechercherLecons('zorglub', source([], CE2, opts));
			expect(r.dictees.map(vueDictee), JSON.stringify(opts.autresClasses)).toEqual([
				{ id: 'd-cm1', label: 'Zorglub du CM1', niveau: 'cm1' },
				{ id: 'd-sans', label: 'Zorglub de la semaine' },
			]);
		}
	});
});

/* ============================================================
   Critère 22 — drapeau absent ou faux : rien ne change
   ============================================================ */
describe('critère 22 : sans autresClasses (absent ou false), le résultat est celui d’aujourd’hui', () => {
	it('absent et false donnent STRICTEMENT le même résultat, sur le vrai catalogue', () => {
		for (const [nom, niveau] of PROFILS) {
			for (const q of [...REQUETES, 'calcul', 'geometrie', 'a', '']) {
				const absent = rechercherLecons(q, reel(niveau));
				const faux = rechercherLecons(q, reel(niveau, { autresClasses: false }));
				expect(faux, `${nom} · « ${q} »`).toStrictEqual(absent);
			}
		}
	});

	it('false : aucune ligne ne porte de classe, aucune leçon hors classe, aucune catégorie vide dans la classe', () => {
		for (const [nom, niveau] of PROFILS) {
			// Prémisse : pour ce profil, plusieurs requêtes AURAIENT des lignes d'autres classes
			// à montrer, sinon l'absence vérifiée ci-dessous ne garderait rien.
			const gardees = REQUETES.filter((q) =>
				attenduGroupes(q, { lessons: getAllLessons(), niveau }).some((g) =>
					g.lecons.some((l) => l.niveau !== undefined),
				),
			);
			expect(gardees.length, nom).toBeGreaterThanOrEqual(3);
			for (const opts of [{}, { autresClasses: false }]) {
				for (const q of REQUETES) {
					const ctx = `${nom} · « ${q} » · ${JSON.stringify(opts)}`;
					const r = rechercherLecons(q, reel(niveau, opts));
					for (const l of lignes(r)) {
						expect(l.niveau, `${ctx} · ${l.id}`).toBeUndefined();
						const def = lecon(l.id);
						expect(def.levels, `${ctx} · ${l.id}`).toContain(niveau(def.subject));
					}
					for (const c of r.categories)
						expect(
							getLessonsByCategory(c.categoryId, niveau(c.subject)).length,
							`${ctx} · ${c.categoryId}`,
						).toBeGreaterThan(0);
				}
			}
		}
	});

	it('false : un mot-clé qui ne correspond qu’à une leçon d’une autre classe ne la fait pas sortir', () => {
		const lessons = [
			fab({
				id: 'fx-ce2',
				label: 'Zorglub',
				category: 'math-calcul',
				levels: ['ce2'],
				motsCles: ['bidule'],
			}),
		];
		expect(lignes(rechercherLecons('bidule', source(lessons, CM1)))).toEqual([]);
		expect(
			lignes(rechercherLecons('bidule', source(lessons, CM1, { autresClasses: false }))),
		).toEqual([]);
	});
});

/* ============================================================
   Cas tricky
   ============================================================ */
describe('cas tricky avec autresClasses', () => {
	it('sous RECHERCHE_MIN, la recherche reste inactive et TOUT est vide', () => {
		const dictees: DicteeAC[] = [{ id: 'd', label: 'a', niveau: 'cm1' }];
		const s = source(getAllLessons(), CM1, { autresClasses: true, dictees });
		for (const q of ['', ' ', 'a', ' é ', 'Z']) {
			expect(q.trim().length, JSON.stringify(q)).toBeLessThan(RECHERCHE_MIN);
			expect(rechercherLecons(q, s), JSON.stringify(q)).toEqual(INACTIVE);
		}
	});

	it('casse, accents et apostrophe indifférents : « JE DECOMPOSE JUSQU’A 100 » trouve la leçon CE2 d’un CM1', () => {
		const def = lecon('num-decompose-100');
		const attendu = [{ id: def.id, label: libelleAffiche(def, 'ce2'), niveau: 'ce2' }];
		for (const q of [
			"JE DECOMPOSE JUSQU'A 100",
			'je décompose jusqu’à 100',
			'Je Decompose Jusqu',
		]) {
			expect(lignesDe(rechercherLecons(q, reel(CM1, TOUTES)), def.id), q).toEqual(attendu);
		}
	});

	it('un mot-clé qui ne correspond qu’à une leçon d’une autre classe la fait sortir, sous son LIBELLÉ', () => {
		const lessons = [
			fab({ id: 'fx-ici', label: 'Zorglub ici', category: 'math-calcul', levels: ['cm1'] }),
			fab({
				id: 'fx-ce2',
				label: 'Zorglub là-bas',
				category: 'math-calcul',
				levels: ['ce2'],
				motsCles: ['les bidules'],
			}),
		];
		expect(lignes(rechercherLecons('bidule', source(lessons, CM1, TOUTES)))).toEqual([
			{ id: 'fx-ce2', label: 'Zorglub là-bas', niveau: 'ce2' },
		]);
	});
});
