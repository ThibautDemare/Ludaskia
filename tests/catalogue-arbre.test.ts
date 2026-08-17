/* ============================================================
   Arbre du catalogue pour le sélecteur de leçon côté adulte (#556) —
   src/core/catalogue-arbre.ts (pur : ni DOM ni stockage).

   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés du
   CONTRAT (« l'adulte doit pouvoir désigner N'IMPORTE QUELLE leçon du catalogue
   pour un profil, quelle que soit la classe »), jamais recopiés de
   l'implémentation. Les cibles sont choisies DYNAMIQUEMENT dans le catalogue (un
   id en dur mentirait dès qu'une leçon change de niveau).

   Le risque que ces tests gardent :
   - un jeton de niveau qui disparaît à tort rend une partie du catalogue
     INATTEIGNABLE pour un enfant à niveaux mêlés (CM1 en maths, CE2 en
     français) — et ça ne se voit qu'à l'usage, sur un profil particulier ;
   - un filtre qui « replierait » (effectiveLevel) au lieu d'exiger
     l'appartenance montrerait à l'adulte, sous CM1, des leçons qui n'y sont pas ;
   - une recherche sensible aux accents est inutilisable au clavier tactile.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	arbreCatalogue,
	compterLecons,
	jetonsNiveau,
	niveauxSuivis,
	FILTRE_DEFAUT,
	type FiltreNiveau,
	type LeconArbre,
	type MatiereArbre,
} from '../src/core/catalogue-arbre';
import {
	CATEGORIES,
	getAllLessons,
	getLessonsByCategory,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import type { ExerciseType } from '../src/core/exercise';
import { availableLevels } from '../src/core/levels';
import type { Profile } from '../src/core/profiles';

/* ---------- Profils fabriqués à la main ----------
   Le module est PUR : il lit le profil qu'on lui passe, jamais le stockage. Pas de
   `initProfiles()` ici, donc, ce qui garde les cas de niveau parfaitement explicites. */
function profil(o: { reference?: SchoolLevel; parMatiere?: Record<string, SchoolLevel> } = {}) {
	const p: Profile = { uuid: 'u-test', name: 'Test', emoji: '🐧', updatedAt: 0 };
	if (o.reference) p.niveauReference = o.reference;
	if (o.parMatiere) p.niveauParMatiere = o.parMatiere;
	return p;
}
const CE2 = profil({ reference: 'ce2' });
const CM1 = profil({ reference: 'cm1' });
/* L'enfant « en dents de scie » (#225) : CM1 en maths, CE2 en français. C'est LE profil
   sur lequel une déduplication trop zélée des jetons casse le sélecteur. */
const MELE = profil({ reference: 'cm1', parMatiere: { francais: 'ce2' } });

/* ---------- Lecture d'un arbre ---------- */
function lecons(arbre: readonly MatiereArbre[]): LeconArbre[] {
	return arbre.flatMap((m) => m.categories.flatMap((c) => c.lecons));
}
function ids(arbre: readonly MatiereArbre[]): string[] {
	return lecons(arbre).map((l) => l.id);
}
function idsSousFiltre(p: Profile, filtre: FiltreNiveau): Set<string> {
	return new Set(ids(arbreCatalogue(p, { filtre })));
}
function idsDeNiveau(niveau: SchoolLevel): Set<string> {
	return new Set(
		getAllLessons()
			.filter((l) => l.levels.includes(niveau))
			.map((l) => l.id),
	);
}
function memeEnsemble(a: Set<string>, b: Set<string>): boolean {
	return a.size === b.size && [...a].every((x) => b.has(x));
}
function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi + ' : test à réviser');
	return l;
}

/* Prémisse commune, vérifiée une fois : le catalogue a bien DEUX classes pourvues.
   Tout le sujet #556 (désigner hors de la classe suivie) est vide sans ça. */
const DISPO = availableLevels(getAllLessons());
describe('prémisse — le catalogue est multi-classes', () => {
	it('deux niveaux pourvus, dans l’ordre scolaire', () => {
		expect(DISPO).toEqual(['ce2', 'cm1']);
	});
});

/* ============================================================
   niveauxSuivis — « ce que suit ce profil », matière par matière
   ============================================================ */
describe('niveauxSuivis', () => {
	it('profil sans classe choisie → la classe par défaut du catalogue (CE2)', () => {
		expect(niveauxSuivis(profil())).toEqual(['ce2']);
	});

	it('profil mono-classe → cette seule classe, quel que soit le nombre de matières', () => {
		expect(niveauxSuivis(CE2)).toEqual(['ce2']);
		expect(niveauxSuivis(CM1)).toEqual(['cm1']);
	});

	it('un ajustement par matière REDONDANT ne crée pas de doublon', () => {
		expect(niveauxSuivis(profil({ reference: 'cm1', parMatiere: { math: 'cm1' } }))).toEqual([
			'cm1',
		]);
	});

	it('profil à classes mêlées → les deux, dans l’ordre SCOLAIRE (pas l’ordre des matières)', () => {
		// Maths en CM1 est déclaré en premier (SUBJECTS commence par les maths) : le résultat
		// doit malgré tout commencer par le CE2, sinon un affichage ordonné mentirait.
		expect(niveauxSuivis(MELE)).toEqual(['ce2', 'cm1']);
	});
});

/* ============================================================
   jetonsNiveau — la barre de filtres, et l'ATTEIGNABILITÉ du catalogue
   ============================================================ */
describe('jetonsNiveau', () => {
	it('« Sa classe » vient toujours en tête', () => {
		for (const p of [profil(), CE2, CM1, MELE]) expect(jetonsNiveau(p)[0].val).toBe('sa-classe');
	});

	it('profil mono-classe : le jeton DOUBLON de sa classe disparaît, et « Sa classe » la nomme', () => {
		const jce2 = jetonsNiveau(CE2);
		expect(jce2.map((j) => j.val)).toEqual(['sa-classe', 'cm1']);
		expect(jce2[0].label).toBe('Sa classe (CE2)');

		const jcm1 = jetonsNiveau(CM1);
		expect(jcm1.map((j) => j.val)).toEqual(['sa-classe', 'ce2']);
		expect(jcm1[0].label).toBe('Sa classe (CM1)');
	});

	it('profil à classes mêlées : AUCUN jeton ne disparaît, et « Sa classe » ne nomme rien', () => {
		const j = jetonsNiveau(MELE);
		expect(j.map((x) => x.val)).toEqual(['sa-classe', 'ce2', 'cm1']);
		// Nommer une classe entre parenthèses serait faux : il y en a deux.
		expect(j[0].label).toBe('Sa classe');
	});

	/* L'invariant qui compte vraiment : quoi qu'il arrive à la déduplication, chaque classe
	   pourvue doit rester joignable d'UN clic. Sur le profil mêlé, « Sa classe » ne rend
	   ni les maths CE2 ni le français CM1 : sans leurs jetons, ces leçons deviennent
	   inatteignables — c'est-à-dire indésignables, ce qui vide #556 de son objet. */
	it('INVARIANT : chaque classe du catalogue reste atteignable par un jeton', () => {
		for (const p of [CE2, CM1, MELE]) {
			const jetons = jetonsNiveau(p);
			for (const lv of DISPO) {
				const joignable = jetons.some((j) =>
					memeEnsemble(idsSousFiltre(p, j.val), idsDeNiveau(lv)),
				);
				expect(
					joignable,
					`${lv} injoignable pour ${JSON.stringify(p.niveauParMatiere ?? p.niveauReference)}`,
				).toBe(true);
			}
		}
	});

	it('profil mêlé : les leçons hors de « Sa classe » sont bien celles que les jetons rattrapent', () => {
		const mathCe2 = leconTelleQue(
			(l) => l.subject === 'math' && l.levels.includes('ce2') && !l.levels.includes('cm1'),
			'de maths CE2 seule',
		);
		const frCm1 = leconTelleQue(
			(l) => l.subject === 'francais' && l.levels.includes('cm1') && !l.levels.includes('ce2'),
			'de français CM1 seule',
		);
		// Prémisse : « Sa classe » (maths CM1 + français CE2) ne les montre ni l'une ni l'autre.
		const saClasse = idsSousFiltre(MELE, 'sa-classe');
		expect(saClasse.has(mathCe2.id)).toBe(false);
		expect(saClasse.has(frCm1.id)).toBe(false);
		// …et un jeton de niveau les rattrape toutes les deux.
		expect(idsSousFiltre(MELE, 'ce2').has(mathCe2.id)).toBe(true);
		expect(idsSousFiltre(MELE, 'cm1').has(frCm1.id)).toBe(true);
	});

	/* Les jetons se DÉRIVENT du catalogue, jamais d'une liste de classes en dur : le jour où
	   une leçon CM2 arrive, son jeton doit apparaître sans toucher à ce module. */
	it('les jetons suivent le catalogue fourni (un niveau inédit apparaît tout seul)', () => {
		const stub: ExerciseType = {
			generate: () => ({ type: 'text', question: 'q', answer: 'a' }),
			check: () => false,
		};
		const cm2: LessonDef = {
			id: 'math-futur-cm2',
			label: 'Leçon de demain',
			subject: 'math',
			category: 'math-calcul',
			levels: ['cm2'],
			exerciseType: stub,
		};
		expect(jetonsNiveau(CE2, [...getAllLessons(), cm2]).map((j) => j.val)).toEqual([
			'sa-classe',
			'cm1',
			'cm2',
		]);
	});

	it('catalogue mono-classe : « Sa classe » suffit, aucun jeton de niveau', () => {
		const cm1Seules = getAllLessons().filter((l) => l.levels.length === 1 && l.levels[0] === 'cm1');
		expect(cm1Seules.length).toBeGreaterThan(0); // prémisse
		expect(jetonsNiveau(CM1, cm1Seules)).toEqual([{ val: 'sa-classe', label: 'Sa classe (CM1)' }]);
	});
});

/* ============================================================
   arbreCatalogue — filtre de niveau
   ============================================================ */
describe('arbreCatalogue — filtre de niveau', () => {
	it('le filtre par défaut est « Sa classe »', () => {
		expect(FILTRE_DEFAUT).toBe('sa-classe');
		expect(arbreCatalogue(CE2)).toEqual(arbreCatalogue(CE2, { filtre: 'sa-classe' }));
	});

	it('« Sa classe » rend exactement les leçons de la classe suivie, matière par matière', () => {
		for (const l of lecons(arbreCatalogue(MELE))) {
			const def = leconTelleQue((x) => x.id === l.id, l.id);
			expect(def.levels).toContain(def.subject === 'math' ? 'cm1' : 'ce2');
			expect(l.niveau).toBe(def.subject === 'math' ? 'cm1' : 'ce2');
		}
	});

	it('un jeton de niveau l’emporte sur la classe suivie (le cœur de #556)', () => {
		// Un profil CE2 doit pouvoir atteindre tout le CM1, sans changer de classe.
		expect(idsSousFiltre(CE2, 'cm1')).toEqual(idsDeNiveau('cm1'));
		expect(idsSousFiltre(CE2, 'ce2')).toEqual(idsDeNiveau('ce2'));
		// …et réciproquement pour un CM1 qui vient chercher une notion du CE2.
		expect(idsSousFiltre(CM1, 'ce2')).toEqual(idsDeNiveau('ce2'));
	});

	it('APPARTENANCE stricte : jamais de repli (une leçon CM1-seule n’apparaît pas sous CE2)', () => {
		const cm1Seule = leconTelleQue(
			(l) => l.levels.includes('cm1') && !l.levels.includes('ce2'),
			'CM1 seule',
		);
		expect(idsSousFiltre(CE2, 'ce2').has(cm1Seule.id)).toBe(false);
		expect(idsSousFiltre(CE2, 'sa-classe').has(cm1Seule.id)).toBe(false);
		expect(idsSousFiltre(CE2, 'cm1').has(cm1Seule.id)).toBe(true);
	});

	it('chaque leçon rendue appartient VRAIMENT au niveau annoncé sur sa ligne', () => {
		for (const p of [CE2, CM1, MELE]) {
			for (const filtre of ['sa-classe', 'ce2', 'cm1'] as FiltreNiveau[]) {
				for (const l of lecons(arbreCatalogue(p, { filtre }))) {
					const def = leconTelleQue((x) => x.id === l.id, l.id);
					expect(def.levels).toContain(l.niveau);
					if (filtre !== 'sa-classe') expect(l.niveau).toBe(filtre);
				}
			}
		}
	});

	it('une catégorie vidée par le filtre disparaît (pas de rubrique vide à l’écran)', () => {
		// Catégorie qui n'a de contenu qu'au CM1 (« Organisation et gestion de données »).
		const cat = CATEGORIES.find((c) => {
			const dedans = getAllLessons().filter((l) => l.category === c.id);
			return (
				dedans.length > 0 &&
				dedans.every((l) => !l.levels.includes('ce2')) &&
				dedans.some((l) => l.levels.includes('cm1'))
			);
		});
		if (!cat) throw new Error('catalogue sans catégorie CM1-only : test à réviser');
		const sousCe2 = arbreCatalogue(CE2, { filtre: 'ce2' });
		expect(sousCe2.flatMap((m) => m.categories).some((c) => c.categoryId === cat.id)).toBe(false);
		const sousCm1 = arbreCatalogue(CE2, { filtre: 'cm1' });
		expect(sousCm1.flatMap((m) => m.categories).some((c) => c.categoryId === cat.id)).toBe(true);
	});

	it('une matière entièrement vide disparaît elle aussi', () => {
		const mathSeules = getAllLessons().filter((l) => l.subject === 'math');
		const arbre = arbreCatalogue(CE2, { lessons: mathSeules });
		expect(arbre.map((m) => m.subject)).toEqual(['math']);
	});

	it('catalogue vide → arbre vide (et aucun compteur à afficher)', () => {
		expect(arbreCatalogue(CE2, { lessons: [] })).toEqual([]);
		expect(compterLecons([])).toBe(0);
	});

	it('INVARIANT de structure : aucun nœud vide, total cohérent, aucun doublon d’id', () => {
		for (const p of [CE2, CM1, MELE]) {
			for (const filtre of ['sa-classe', 'ce2', 'cm1'] as FiltreNiveau[]) {
				const arbre = arbreCatalogue(p, { filtre });
				for (const m of arbre) {
					expect(m.categories.length).toBeGreaterThan(0);
					for (const c of m.categories) expect(c.lecons.length).toBeGreaterThan(0);
					expect(m.total).toBe(m.categories.reduce((n, c) => n + c.lecons.length, 0));
				}
				const tous = ids(arbre);
				expect(new Set(tous).size).toBe(tous.length);
				expect(compterLecons(arbre)).toBe(tous.length);
			}
		}
	});

	it('le libellé est celui du niveau AFFICHÉ (#436), pas le libellé par défaut', () => {
		const l = leconTelleQue(
			(x) =>
				!!x.labelNiveau &&
				x.levels.includes('ce2') &&
				x.levels.includes('cm1') &&
				x.labelNiveau.ce2 !== x.labelNiveau.cm1,
			'à libellé distinct CE2/CM1',
		);
		const sous = (filtre: FiltreNiveau, p: Profile = CE2) =>
			lecons(arbreCatalogue(p, { filtre })).find((x) => x.id === l.id)!.label;
		expect(sous('ce2')).toBe(l.labelNiveau!.ce2);
		expect(sous('cm1')).toBe(l.labelNiveau!.cm1);
		// Sous « Sa classe », c'est la classe SUIVIE pour la matière qui décide.
		expect(sous('sa-classe', CE2)).toBe(l.labelNiveau!.ce2);
		expect(sous('sa-classe', CM1)).toBe(l.labelNiveau!.cm1);
	});
});

/* ============================================================
   arbreCatalogue — ordre des leçons
   ------------------------------------------------------------
   L'adulte désigne une leçon pour l'enfant : les deux doivent voir la MÊME progression,
   sinon l'adulte qui cherche « la suite de ce qu'il a vu en classe » ne la trouve pas là
   où l'enfant l'a rencontrée. L'ordre de référence est donc l'ordre PÉDAGOGIQUE du niveau
   affiché (#208), celui que sert `getLessonsByCategory(cat, niveau)` à l'écran de l'enfant
   — et NON l'ordre de déclaration du catalogue, dont il diffère réellement (la conjugaison
   se déclare verbe par verbe et s'enseigne temps par temps).
   ============================================================ */
describe('arbreCatalogue — ordre des leçons', () => {
	/* Ordre de DÉCLARATION du catalogue, restreint à un niveau : le repli qu'on obtiendrait
	   sans tri. Sert de témoin — un attendu qui lui serait égal ne prouverait rien. */
	const ordreDeclaration = (categoryId: string, niveau: SchoolLevel): string[] =>
		getAllLessons()
			.filter((l) => l.category === categoryId && l.levels.includes(niveau))
			.map((l) => l.id);
	const ordrePedagogique = (categoryId: string, niveau: SchoolLevel): string[] =>
		getLessonsByCategory(categoryId, niveau).map((l) => l.id);
	const memeSuite = (a: readonly string[], b: readonly string[]): boolean =>
		a.length === b.length && a.every((x, i) => x === b[i]);

	it('prémisse : les deux ordres divergent bel et bien, sur plusieurs catégories', () => {
		const divergentes = CATEGORIES.filter((c) =>
			(['ce2', 'cm1'] as SchoolLevel[]).some(
				(niveau) => !memeSuite(ordrePedagogique(c.id, niveau), ordreDeclaration(c.id, niveau)),
			),
		);
		// Sans cette prémisse, tout le reste de ce bloc passerait aussi sans le tri.
		expect(divergentes.length).toBeGreaterThan(1);
	});

	it('chaque catégorie sort dans l’ordre pédagogique du niveau AFFICHÉ, comme l’écran enfant', () => {
		let divergences = 0;
		for (const p of [CE2, CM1, MELE]) {
			for (const filtre of ['sa-classe', 'ce2', 'cm1'] as FiltreNiveau[]) {
				for (const m of arbreCatalogue(p, { filtre })) {
					for (const c of m.categories) {
						// Toutes les leçons d'une catégorie relèvent de la même matière, donc du même
						// niveau affiché : celui que la ligne porte déjà.
						const niveau = c.lecons[0].niveau;
						const attendu = ordrePedagogique(c.categoryId, niveau);
						expect(
							c.lecons.map((l) => l.id),
							`${c.categoryId} @${niveau}`,
						).toEqual(attendu);
						if (!memeSuite(attendu, ordreDeclaration(c.categoryId, niveau))) divergences++;
					}
				}
			}
		}
		// Le verrou n'est pas creux : le tri a bien changé quelque chose dans ce balayage.
		expect(divergences).toBeGreaterThan(0);
	});

	it('cas concret : la conjugaison est rangée par TEMPS, pas verbe par verbe', () => {
		const cat = arbreCatalogue(CE2, { filtre: 'ce2' })
			.flatMap((m) => m.categories)
			.find((c) => c.categoryId === 'fr-conjugaison');
		if (!cat) throw new Error('catalogue sans conjugaison CE2 : test à réviser');
		const obtenu = cat.lecons.map((l) => l.id);
		// La déclaration groupe les temps d'un même verbe ; la progression balaie tous les
		// verbes à un temps avant de passer au suivant. Les deux suites diffèrent donc dès
		// leur 2e élément, ce qui rend ce test impossible à satisfaire sans tri.
		const declaration = ordreDeclaration('fr-conjugaison', 'ce2');
		expect(obtenu).not.toEqual(declaration);
		expect(obtenu[0]).toBe(declaration[0]); // même point de départ…
		expect(obtenu[1]).not.toBe(declaration[1]); // …et déjà plus la même suite
		expect(obtenu).toEqual(ordrePedagogique('fr-conjugaison', 'ce2'));
	});

	it('une recherche ne réordonne rien (le sous-ensemble garde l’ordre pédagogique)', () => {
		for (const c of arbreCatalogue(CM1, { filtre: 'cm1', recherche: 'e' }).flatMap(
			(m) => m.categories,
		)) {
			const complet = ordrePedagogique(c.categoryId, 'cm1');
			const trouves = c.lecons.map((l) => l.id);
			// Sous-suite de l'ordre complet : mêmes éléments dans le même ordre relatif.
			expect(trouves).toEqual(complet.filter((id) => trouves.includes(id)));
		}
	});
});

/* ============================================================
   arbreCatalogue — recherche
   ============================================================ */
describe('arbreCatalogue — recherche', () => {
	/* Catégorie dont le LIBELLÉ porte des accents et dont aucune leçon ne contient le mot :
	   c'est le cas qui justifie que la recherche regarde aussi le nom de la catégorie. */
	const CAT_GEO = CATEGORIES.find((c) => c.id === 'math-geometrie')!;

	it('recherche vide (ou blanche) = aucun filtre', () => {
		const reference = arbreCatalogue(CE2);
		expect(arbreCatalogue(CE2, { recherche: '' })).toEqual(reference);
		expect(arbreCatalogue(CE2, { recherche: '   ' })).toEqual(reference);
	});

	it('trouve une leçon par son libellé, en SOUS-CHAÎNE', () => {
		const cible = leconTelleQue(
			(l) => l.levels.includes('ce2') && l.label.length > 6,
			'CE2 au libellé assez long',
		);
		const morceau = cible.label.slice(2, 7); // ni début ni fin : c'est bien une sous-chaîne
		const trouves = ids(arbreCatalogue(CE2, { recherche: morceau }));
		expect(trouves).toContain(cible.id);
	});

	it('accents et casse indifférents (clavier tactile : « geometrie » doit trouver « Géométrie »)', () => {
		const attendu = ids(arbreCatalogue(CE2, { recherche: CAT_GEO.label }));
		expect(attendu.length).toBeGreaterThan(0); // prémisse : la catégorie a du contenu CE2
		for (const saisie of ['geometrie', 'GÉOMÉTRIE', 'GeOmEtRiE', '  géométrie  '])
			expect(ids(arbreCatalogue(CE2, { recherche: saisie }))).toEqual(attendu);
	});

	it('un libellé de CATÉGORIE qui matche rend TOUTES ses leçons (aucune ne porte le mot)', () => {
		const toutes = arbreCatalogue(CE2)
			.flatMap((m) => m.categories)
			.find((c) => c.categoryId === CAT_GEO.id)!;
		const cherchees = arbreCatalogue(CE2, { recherche: 'geometrie' })
			.flatMap((m) => m.categories)
			.find((c) => c.categoryId === CAT_GEO.id)!;
		expect(cherchees.lecons.map((l) => l.id)).toEqual(toutes.lecons.map((l) => l.id));
		// Et le mot ne vient PAS des libellés de leçon : c'est bien la catégorie qui a matché.
		expect(toutes.lecons.some((l) => l.label.toLowerCase().includes('géom'))).toBe(false);
	});

	it('la recherche s’applique À L’INTÉRIEUR du filtre actif', () => {
		const cm1Seule = leconTelleQue(
			(l) => l.levels.includes('cm1') && !l.levels.includes('ce2'),
			'CM1 seule',
		);
		const mot = cm1Seule.label;
		expect(ids(arbreCatalogue(CE2, { filtre: 'cm1', recherche: mot }))).toContain(cm1Seule.id);
		expect(ids(arbreCatalogue(CE2, { filtre: 'ce2', recherche: mot }))).not.toContain(cm1Seule.id);
	});

	it('recherche sans résultat → arbre vide et compte nul (le seul cas « rien à montrer »)', () => {
		const arbre = arbreCatalogue(CE2, { recherche: 'zzzzz-aucune-lecon' });
		expect(arbre).toEqual([]);
		expect(compterLecons(arbre)).toBe(0);
	});

	it('une recherche ne fabrique jamais de nœud vide ni de leçon hors filtre', () => {
		for (const q of ['e', 'nombre', 'GÉOMÉTRIE', 'x']) {
			const arbre = arbreCatalogue(CM1, { filtre: 'cm1', recherche: q });
			for (const m of arbre) {
				expect(m.categories.length).toBeGreaterThan(0);
				for (const c of m.categories) expect(c.lecons.length).toBeGreaterThan(0);
			}
			for (const l of lecons(arbre)) {
				expect(l.niveau).toBe('cm1');
				expect(idsDeNiveau('cm1').has(l.id)).toBe(true);
			}
			// Sous-ensemble de l'arbre non filtré : chercher n'AJOUTE jamais rien.
			const sansRecherche = idsSousFiltre(CM1, 'cm1');
			for (const id of ids(arbre)) expect(sansRecherche.has(id)).toBe(true);
		}
	});
});
