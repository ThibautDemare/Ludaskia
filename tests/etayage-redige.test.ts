/* ============================================================
   Étayage RÉDIGÉ de la notion (#490, PR 3) — la DONNÉE : couverture des maths,
   charte de rédaction, résolution par niveau.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du contenu. Les moteurs de déroulé ont leurs
   propres suites (`etayage-deroule`, `etayage-conversion`, `etayage-posee`…) ; ici rien
   ne se calcule, tout se lit — et c'est précisément ce qui ne se voit pas à la relecture
   d'un diff de 800 lignes :

   1. la COUVERTURE. Une leçon oubliée ne casse rien : elle n'ouvre simplement pas de
      panneau, exactement comme une leçon volontairement laissée sans contenu. Le trou est
      donc invisible jusqu'au jour où un enfant bute dessus. On le recense par CATÉGORIE,
      pour que l'échec dise laquelle a été oubliée, et on le fait AUSSI dans le mode où la
      leçon se lance vraiment — une entrée réservée à un mode secondaire ne sert personne.
   2. la CHARTE (#490, reprise de celle des aides au geste #272). Trois étapes au plus, une
      règle non vide, du texte propre : ce sont des contraintes de MÉMOIRE DE TRAVAIL, pas
      de style. Elles se respectent naturellement sur dix entrées écrites d'affilée et se
      relâchent sur la centième — donc elles se testent.
   3. la RÉSOLUTION PAR NIVEAU. `geo-angles` est la seule leçon dont les deux entrées sont
      scopées par classe sans entrée générale : servir au CM1 la méthode du CE2 y est
      possible d'un caractère près, et personne ne le verrait (un panneau s'ouvre, il est
      plein, il est faux). Les attendus sont dérivés de la TÂCHE que la leçon pose à chaque
      niveau — lue dans ses propres tirages, pas dans le texte de l'étayage.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { etayagePour, type EtayageContenu } from '../src/core/etayage';
import { CATEGORIES, getAllLessons, getLessonById, isProblemeLesson } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { defaultMode } from '../src/core/exercise';
import { etayageRedige } from '../src/data/_shared';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
};

/* Les modes réellement atteignables : ceux que la leçon déclare, plus « sans mode » (une
   leçon mono-mode se lance sans en choisir un). */
const modesDe = (l: LessonDef): (string | undefined)[] => [
	undefined,
	...(l.exerciseType.modes ?? []).map((m) => m.id),
];

/* Tout le texte d'un contenu, en un seul bloc minuscule (les assertions de charte et de
   vocabulaire portent sur ce que l'enfant LIT, titre compris). */
const texteDe = (c: EtayageContenu): string =>
	[c.titre, c.regle ?? '', ...(c.etapes ?? [])].join(' ').toLowerCase();

const MATHS = CATEGORIES.filter((c) => c.subject === 'math').map((c) => c.id);

/* ============================================================
   1. COUVERTURE DES MATHS
   ============================================================ */
describe('couverture — aucune leçon de maths ne reste sans explication', () => {
	it('catégorie par catégorie, à chaque niveau où la leçon est enseignée', () => {
		/* Recensement plutôt qu'un total : un nombre nu (« 89 leçons couvertes ») ne dit ni
		   ce qu'il protège ni ce qui manque, et se « répare » en changeant le nombre. Ici
		   l'échec nomme la catégorie ET les leçons oubliées. La liste des catégories est
		   lue dans `CATEGORIES` : une matière qui en gagne une la voit couverte d'office. */
		const recensement = MATHS.map((categorie) => {
			const lecons = getAllLessons().filter((l) => l.category === categorie);
			const sansEtayage = lecons
				.filter((l) => l.levels.some((n) => !modesDe(l).some((m) => etayagePour(l, n, m))))
				.map((l) => l.id);
			return { categorie, sansEtayage };
		});
		expect(recensement).toEqual(MATHS.map((categorie) => ({ categorie, sansEtayage: [] })));
		// Garde-fou du recensement lui-même : une catégorie vide (id renommé, import perdu)
		// passerait le test ci-dessus sans avoir rien vérifié.
		for (const categorie of MATHS)
			expect(
				getAllLessons().filter((l) => l.category === categorie).length,
				categorie,
			).toBeGreaterThan(0);
	});

	it('dans le mode où la leçon SE LANCE, sans exception', () => {
		/* `defaultMode` est le mode retenu quand l'enfant n'en choisit pas (ui/navigation.ts) :
		   celui d'une reprise depuis la révision, d'un lien direct, du fil d'une série. Une
		   explication qui n'existe que dans un mode secondaire ne sera pour ainsi dire jamais
		   vue au moment du blocage — c'est ce que ce test interdit, et c'est ce qu'il a
		   attrapé : les trois conversions à tableau n'avaient d'entrée QUE dans le mode
		   `tableau`, alors que `saisie` est leur mode conseillé. Elles portent depuis un
		   second contenu, rédigé, sans `mode` (cf. `etayageConversion`, mesures.ts). */
		const trous: string[] = [];
		for (const l of getAllLessons()) {
			if (l.subject !== 'math') continue;
			const mode = defaultMode(l.exerciseType);
			for (const niveau of l.levels)
				if (!etayagePour(l, niveau, mode)) trous.push(`${l.id}/${niveau}/${mode ?? '-'}`);
		}
		expect(trous.sort()).toEqual([]);
	});
});

/* ============================================================
   2. CHARTE DE RÉDACTION — TOUTES les entrées du catalogue
   ============================================================ */
const ENTREES = getAllLessons().flatMap((l) =>
	(l.etayage ?? []).map((e, i) => ({ ou: `${l.id}[${i}]`, lesson: l, contenu: e.contenu })),
);

describe('charte des panneaux (#490 / #272) — sur chaque entrée déclarée', () => {
	it('l’inventaire porte sur toutes les entrées du catalogue, pas sur un échantillon', () => {
		// Sanity du dispositif : si le catalogue cessait d'exposer `etayage`, les tests
		// suivants boucleraient sur rien et passeraient tous.
		expect(ENTREES.length).toBeGreaterThan(100);
	});

	it('un contenu n’est jamais vide : un titre de NOTION et une idée-force', () => {
		const fautes: string[] = [];
		for (const { ou, contenu } of ENTREES) {
			if (!contenu.titre.trim()) fautes.push(`${ou} — titre vide`);
			// « Comment jouer ? » est le titre de l'aide au GESTE (#272) : le confondre avec
			// l'étayage de la notion, c'est promettre une explication et donner un mode d'emploi.
			if (/comment jouer/i.test(contenu.titre)) fautes.push(`${ou} — titre de l'aide au geste`);
			// La règle est affichée en permanence, y compris pendant un déroulé : c'est la seule
			// chose qu'un enfant à faible mémoire de travail emporte d'un écran au suivant.
			if (!contenu.regle?.trim()) fautes.push(`${ou} — pas de règle`);
		}
		expect(fautes).toEqual([]);
	});

	it('la méthode est SOIT un exemple déroulé, SOIT des étapes rédigées — jamais les deux', () => {
		/* Les deux formes se rendent au même endroit du panneau : les cumuler ferait lire deux
		   méthodes concurrentes, et un `exemple` posé sur une notion sans moteur enverrait le
		   panneau en chercher un.

		   Troisième forme LÉGITIME : la règle seule, pour les problèmes — leur déroulé n'est
		   pas figé dans la donnée, il est construit à l'exécution sur l'énoncé que l'enfant
		   vient de rater (ui/lecon-probleme.ts). Partout ailleurs, une entrée sans méthode
		   ouvre un panneau qui redit la fiche. */
		const fautes: string[] = [];
		for (const { ou, lesson, contenu } of ENTREES) {
			const formes = [
				contenu.exemple ? 'exemple' : '',
				contenu.etapes?.length ? 'étapes' : '',
			].filter(Boolean);
			if (formes.length > 1) fautes.push(`${ou} — ${formes.join(' + ')}`);
			if (!formes.length && !isProblemeLesson(lesson)) fautes.push(`${ou} — ni exemple ni étapes`);
		}
		expect(fautes).toEqual([]);
		// L'exception est bien celle qu'on croit, et elle est entière : les leçons de la
		// catégorie « Résolution de problèmes », toutes en règle seule. Les trois autres
		// leçons jouées par ce runner (reste, division euclidienne, durée écoulée) portent,
		// elles, une méthode écrite — leur difficulté n'est pas l'énoncé.
		const regleSeule = ENTREES.filter((e) => !e.contenu.exemple && !e.contenu.etapes?.length);
		expect(regleSeule.map((e) => e.ou)).toEqual(
			getAllLessons()
				.filter((l) => l.category === 'math-problemes')
				.map((l) => `${l.id}[0]`),
		);
	});

	it('trois étapes au maximum, et chacune dit quelque chose', () => {
		/* Le plafond est une contrainte de mémoire de travail (#272), pas une préférence : au
		   quatrième pas, l'enfant qui vient d'échouer a perdu le premier. */
		const fautes: string[] = [];
		for (const { ou, contenu } of ENTREES) {
			const etapes = contenu.etapes ?? [];
			if (!etapes.length) continue;
			if (etapes.length > 3) fautes.push(`${ou} — ${etapes.length} étapes`);
			etapes.forEach((e, i) => {
				if (!e.trim()) fautes.push(`${ou} pas ${i} — vide`);
				if (e !== e.trim() || /\s{2}/.test(e)) fautes.push(`${ou} pas ${i} — espaces parasites`);
				// Un trou d'interpolation ou un reste de balise ne se voit pas à la relecture ;
				// il se voit ici (le panneau échappe le HTML : une balise s'afficherait telle
				// quelle). « NaN » se cherche en respectant la casse — sinon « additionnant ».
				if (/undefined|\[object|<[a-z/]/i.test(e) || /NaN/.test(e))
					fautes.push(`${ou} pas ${i} — « ${e} »`);
			});
		}
		expect(fautes).toEqual([]);
	});

	it('on parle À l’enfant, avec l’apostrophe droite du projet', () => {
		const fautes: string[] = [];
		for (const { ou, contenu } of ENTREES) {
			const texte = texteDe(contenu);
			// Tutoiement : le vouvoiement s'adresse à l'adulte, et le panneau ne s'ouvre que
			// devant un enfant qui vient d'échouer.
			if (/\bvous\b|\bvotre\b|\bvos\b/.test(texte)) fautes.push(`${ou} — vouvoiement`);
			// Apostrophe droite (convention projet, cf. CLAUDE.md et les bulles d'aide des
			// figures) : deux apostrophes différentes dans un même panneau se voient.
			if (texte.includes('’')) fautes.push(`${ou} — apostrophe typographique`);
		}
		expect(fautes).toEqual([]);
	});
});

/* ============================================================
   3. `geo-angles` — deux tâches, deux niveaux
   ============================================================ */
describe('geo-angles — chaque classe reçoit la méthode de SA tâche', () => {
	const angles = () => lecon('geo-angles');

	/* Ce que la leçon POSE réellement à ce niveau, lu dans ses tirages (graines fixes :
	   reproductible, aucun re-run « en espérant »). */
	const questions = (niveau: SchoolLevel): string[] =>
		Array.from({ length: 200 }, (_, i) => {
			const ex = withSeed(i + 1, () => angles().exerciseType.generate({ level: niveau }));
			if (ex.type !== 'qcm') throw new Error(`geo-angles/${niveau} : ${ex.type} au lieu d'un QCM`);
			return ex.question.toLowerCase();
		});

	it('la tâche CHANGE de classe : nommer un angle au CE2, comparer deux ouvertures au CM1', () => {
		const ce2 = questions('ce2');
		const cm1 = questions('cm1');
		// CE2 : un seul angle, jugé par rapport à l'angle droit (aigu / droit / obtus).
		expect(ce2.some((q) => /aigu, droit ou obtus/.test(q))).toBe(true);
		expect(ce2.some((q) => /angle droit/.test(q))).toBe(true);
		expect(ce2.some((q) => /plus ouvert|deux angles/.test(q))).toBe(false);
		// CM1 : deux angles montrés ensemble, et c'est leur ouverture qu'on compare.
		expect(cm1.some((q) => /plus ouvert/.test(q))).toBe(true);
		expect(cm1.some((q) => /deux angles/.test(q))).toBe(true);
	});

	it('un CM1 ne reçoit jamais la version CE2, ni l’inverse', () => {
		const ce2 = etayagePour(angles(), 'ce2');
		const cm1 = etayagePour(angles(), 'cm1');
		expect(ce2).toBeDefined();
		expect(cm1).toBeDefined();
		expect(cm1).not.toBe(ce2);
		expect(cm1?.titre).not.toBe(ce2?.titre);
		// Y compris dans le mode QCM, le seul que la leçon déclare : les deux entrées sont
		// scopées par NIVEAU, un mode ne doit pas les court-circuiter.
		for (const mode of modesDe(angles())) {
			expect(etayagePour(angles(), 'ce2', mode), `ce2/${mode ?? '-'}`).toBe(ce2);
			expect(etayagePour(angles(), 'cm1', mode), `cm1/${mode ?? '-'}`).toBe(cm1);
		}
	});

	it('chaque version parle de la tâche de sa classe', () => {
		const ce2 = etayagePour(angles(), 'ce2');
		const cm1 = etayagePour(angles(), 'cm1');
		if (!ce2 || !cm1) throw new Error('les deux entrées de geo-angles sont attendues');
		// CE2 : les trois noms que le QCM lui demande de produire.
		for (const nom of ['aigu', 'droit', 'obtus']) expect(texteDe(ce2), nom).toContain(nom);
		// CM1 : la comparaison de deux ouvertures — et la LONGUEUR des traits, que le
		// générateur fait délibérément varier (deux rayons distincts par angle) pour piéger
		// l'œil. Une méthode CM1 qui ne désamorce pas ce piège n'explique pas la leçon.
		expect(texteDe(cm1)).toMatch(/ouvert/);
		expect(texteDe(cm1)).toMatch(/longueur/);
	});
});

/* ============================================================
   4. `etayageRedige` — le raccourci partagé
   ============================================================ */
describe('etayageRedige — ce que le raccourci garantit à ses 70 appels', () => {
	/* Leçon de test minimale : `etayagePour` ne lit que `etayage`. */
	const leconAvec = (etayage: LessonDef['etayage']): LessonDef => ({
		id: 'test-redige',
		label: 'Leçon de test',
		subject: 'math',
		category: 'test',
		levels: ['ce2', 'cm1'],
		exerciseType: {
			generate: () => ({ type: 'text', question: '@', answer: 'x' }),
			check: () => false,
		},
		etayage,
	});

	it('sans niveau, l’entrée vaut partout ; avec, elle ne vaut qu’à ce niveau', () => {
		const general = leconAvec([etayageRedige('Général', 'Une règle.', ['Un pas.'])]);
		expect(etayagePour(general, 'ce2')?.titre).toBe('Général');
		expect(etayagePour(general, 'cm1', 'saisie')?.titre).toBe('Général');
		// Le paramètre `niveau` est ce qui sépare les deux versions de `geo-angles` : s'il
		// était ignoré, la dernière entrée déclarée gagnerait pour tout le monde.
		const parNiveau = leconAvec([
			etayageRedige('Version CE2', 'Une règle.', ['Un pas.'], 'ce2'),
			etayageRedige('Version CM1', 'Une autre règle.', ['Un autre pas.'], 'cm1'),
		]);
		expect(etayagePour(parNiveau, 'ce2')?.titre).toBe('Version CE2');
		expect(etayagePour(parNiveau, 'cm1')?.titre).toBe('Version CM1');
	});

	it('l’entrée produite est RÉDIGÉE : des étapes, aucun exemple à dérouler', () => {
		// Un `exemple` glissé dans une entrée rédigée enverrait le panneau chercher un moteur
		// de résolution pour une notion qui n'en a pas.
		const entree = etayageRedige('Titre', 'Une règle.', ['Un pas.', 'Un autre.']);
		expect(entree.contenu).toEqual({
			titre: 'Titre',
			regle: 'Une règle.',
			etapes: ['Un pas.', 'Un autre.'],
		});
		expect(entree.niveau).toBeUndefined();
	});
});
