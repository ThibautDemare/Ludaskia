/* ============================================================
   Travailler une leçon d'une autre classe sans changer la classe du profil (#772)
   — logique pure. Écrits AVANT l'implémentation, à partir des critères de l'issue
   (et des précisions du 20/10/2026) ; chaque test nomme le critère qu'il tient.

   État de module à lever : la classe choisie (`leverClasseChoisie`) et le niveau
   imposé de #573 (`leverNiveauImpose`). La classe choisie n'est levée que dans le
   bloc qui s'en sert : les TÉMOINS (plus bas) doivent tourner sans elle, puisqu'ils
   prouvent que les observables des critères négatifs savent rougir.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import { getAllLessons, getLessonById, getLessonsByCategory } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { LEVEL_ORDER, classeLaPlusProche, classesPourvues } from '../src/core/levels';
import {
	choisirClasse,
	classeChoisie,
	classeDeCategorie,
	imposerNiveauLecon,
	lessonsNiveauActif,
	leverClasseChoisie,
	leverNiveauImpose,
	niveauActif,
	niveauActifMatiere,
	niveauLecon,
} from '../src/core/niveau-actif';
import {
	activeProfile,
	addProfile,
	autresClassesAutorisees,
	getNiveauParMatiere,
	getNiveauReference,
	initProfiles,
	setActiveProfile,
	setNiveauMatiere,
	setNiveauReference,
	setPref,
	touchActiveProfile,
} from '../src/core/profiles';
import { lsGet, lsSet, setOnDataWrite } from '../src/core/storage';
import {
	LESSON_FIRST_SEEN_KEY,
	LESSON_STATS_KEY,
	countNewLessonsSince,
	countSince,
	etoileAuxNiveaux,
	getXP,
	loadActivity,
	loadLessonRevisions,
	loadLessonRevisionsBasNiveau,
	loadLessonStats,
	loadLessonStatsAll,
	loadRuns,
	loadRunsAll,
	loadStars,
	normalizeActivity,
	recordLessonStats,
	recordRun,
	starsEarned,
	starsEarnedAll,
	todayStr,
} from '../src/core/progress';
import { GOAL_KEY, getGoalsDone, updateGoal } from '../src/core/rewards';
import { recordLessonRun } from '../src/core/lesson-run';
import { leconAvant, leconAvantJouee } from '../src/core/etayage';
import type { CartesBrutes } from '../src/core/consolidation-bas-niveau';
import { PREREQUIS } from '../src/data/ordre-pedagogique';
import { chargerErreursFor, journaliserErreur, niveauErreur } from '../src/core/erreurs-journal';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	leverNiveauImpose();
});

/* ---------- Données réelles utilisées (préconditions vérifiées dans les tests) ---------- */
const NUMERATION = 'math-numeration';
const COMMUNE = 'num-comparer'; // CE2 et CM1, même libellé
const CE2_SEULE = 'num-decompose-100';
const CM1_SEULE = 'num-decompose-multiplicative';
const DIVISION_CM1 = 'math-division-euclidienne'; // prérequis CE2 dans PREREQUIS (#724)

function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
}

/* Un essai de leçon complet, par l'entrée publique commune à tous les modes. */
function jouerLecon(id: string, ok: number, total: number) {
	return recordLessonRun({
		mode: 'lecon',
		lessonId: id,
		ok,
		questionCount: total,
		ms: 30_000,
		perLesson: { [id]: { ok, total } },
	});
}

/* Repart d'un profil neuf, au même état que le `beforeEach` (comparaison de deux parties). */
function profilNeuf(classe: SchoolLevel) {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	leverNiveauImpose();
	setNiveauReference(classe);
}

/* Défi du jour « bats ton record de sprint », posé pour aujourd'hui. */
function poserDefi(type: string) {
	lsSet(GOAL_KEY, {
		date: todayStr(),
		target: 1,
		progress: 0,
		done: false,
		type,
		label: 'Bats ton record de sprint !',
	});
}

function membresPrerequis(lessonId: string): string[] {
	return (PREREQUIS[lessonId] ?? []).flatMap((e) => (typeof e === 'string' ? [e] : [...e]));
}

const cartesVides = (): CartesBrutes => ({ stars: {}, stats: {}, reports: {} });

/* ============================================================ */

/* Vert aujourd'hui : il sépare « la donnée a changé » de « la fonction est fausse » quand un
   test plus bas rougit après l'implémentation. */
describe('préconditions sur les données réelles', () => {
	it("les leçons et catégories citées par l'issue ont la forme attendue", () => {
		const toutes = getAllLessons();
		const niveauxDe = (c: string) =>
			LEVEL_ORDER.filter((lv) => toutes.some((l) => l.category === c && l.levels.includes(lv)));
		expect(lecon(COMMUNE).category).toBe(NUMERATION);
		expect(lecon(COMMUNE).levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
		expect(lecon(CE2_SEULE)).toMatchObject({ category: NUMERATION, levels: ['ce2'] });
		expect(lecon(CM1_SEULE)).toMatchObject({ category: NUMERATION, levels: ['cm1'] });
		expect(niveauxDe('math-calcul')).toEqual(['ce2']);
		expect(niveauxDe('math-donnees')).toEqual(['cm1']);
		expect(lecon('fr-gram-clic-noyau').category).toBe('fr-grammaire');
		expect(lecon('fr-gram-clic-noyau').levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
		const maths = lecon(COMMUNE).subject;
		expect(
			toutes.some(
				(l) =>
					l.subject === maths &&
					l.category !== NUMERATION &&
					l.levels.includes('ce2') &&
					l.levels.includes('cm1'),
			),
			'une leçon de maths commune CE2/CM1 hors numération',
		).toBe(true);
		expect(new Set(toutes.map((l) => l.category)).size).toBeGreaterThanOrEqual(10);
	});
});

describe('critère 1 : classes proposées par catégorie (classesPourvues)', () => {
	it('numération : CE2 et CM1 (leçons propres à chaque classe + communes)', () => {
		expect(classesPourvues(getAllLessons(), NUMERATION)).toEqual(['ce2', 'cm1']);
	});

	it('une catégorie pourvue dans une seule classe ne propose que celle-là', () => {
		expect(classesPourvues(getAllLessons(), 'math-calcul')).toEqual(['ce2']);
		expect(classesPourvues(getAllLessons(), 'math-donnees')).toEqual(['cm1']);
	});

	it("la liste vient du contenu : pour chaque catégorie réelle, les classes d'au moins une de ses leçons, en ordre scolaire", () => {
		const toutes = getAllLessons();
		const categories = [...new Set(toutes.map((l) => l.category))];
		expect(categories.length).toBeGreaterThanOrEqual(10); // inventaire non effondré
		for (const c of categories) {
			const attendu = LEVEL_ORDER.filter((lv) =>
				toutes.some((l) => l.category === c && l.levels.includes(lv)),
			);
			expect(classesPourvues(toutes, c), c).toEqual(attendu);
		}
	});

	it("une leçon d'une classe nouvelle (CE1), ajoutée par une donnée de test, fait apparaître son option à sa place", () => {
		const donnees = [
			...getAllLessons(),
			{ category: NUMERATION, levels: ['ce1'] as SchoolLevel[] },
		];
		expect(classesPourvues(donnees, NUMERATION)).toEqual(['ce1', 'ce2', 'cm1']);
	});

	it("n'emprunte pas les classes d'une autre catégorie, et ne duplique pas une classe partagée", () => {
		const donnees: { category: string; levels: SchoolLevel[] }[] = [
			{ category: 'cat-a', levels: ['cm1'] },
			{ category: 'cat-a', levels: ['ce2', 'cm1'] },
			{ category: 'cat-b', levels: ['cm2'] },
		];
		expect(classesPourvues(donnees, 'cat-a')).toEqual(['ce2', 'cm1']);
		expect(classesPourvues(donnees, 'cat-inconnue')).toEqual([]);
	});

	it('les classes supplémentaires (`autres`) sont fusionnées en ordre scolaire, sans doublon', () => {
		const donnees: { category: string; levels: SchoolLevel[] }[] = [
			{ category: 'cat-a', levels: ['ce2'] },
		];
		expect(classesPourvues(donnees, 'cat-a', ['cm1'])).toEqual(['ce2', 'cm1']);
		expect(classesPourvues(donnees, 'cat-a', ['ce1', 'ce2'])).toEqual(['ce1', 'ce2']);
		// Précision 1 du 20/10 : « Calcul », CE2 seul, garde l'option de la classe suivie (CM1)
		// quand l'appelant la fournit.
		expect(classesPourvues(getAllLessons(), 'math-calcul', ['cm1'])).toEqual(['ce2', 'cm1']);
	});
});

describe('critère 10 (règle de classe) : classeLaPlusProche', () => {
	it('rend la classe demandée quand elle est dans la liste', () => {
		expect(classeLaPlusProche(['ce2', 'cm1'], 'cm1')).toBe('cm1');
		expect(classeLaPlusProche(['ce2', 'cm1'], 'ce2')).toBe('ce2');
	});

	it("rend l'unique classe disponible, au-dessus comme en dessous", () => {
		expect(classeLaPlusProche(['ce2'], 'cm1')).toBe('ce2');
		expect(classeLaPlusProche(['cm1'], 'ce2')).toBe('cm1');
	});

	it('à égale distance, prend celle du DESSOUS', () => {
		expect(classeLaPlusProche(['ce1', 'cm1'], 'ce2')).toBe('ce1');
		expect(classeLaPlusProche(['ce2', 'cm2'], 'cm1')).toBe('ce2');
		expect(classeLaPlusProche(['cm1', 'ce1'], 'ce2')).toBe('ce1'); // ordre d'entrée indifférent
	});

	it('une classe plus proche au-dessus passe devant une classe plus lointaine en dessous', () => {
		// CP est à 2 crans du CE2, CM1 à 1 cran : le repli « vers le bas » ne s'applique pas ici.
		expect(classeLaPlusProche(['cp', 'cm1'], 'ce2')).toBe('cm1');
		expect(classeLaPlusProche(['cp', 'cm2'], 'cm1')).toBe('cm2');
	});
});

describe('critère 14 : réglage « Autoriser les autres classes »', () => {
	it('activé par défaut, profil sans aucune préférence enregistrée', () => {
		expect(activeProfile().prefs).toBeUndefined();
		expect(autresClassesAutorisees()).toBe(true);
	});

	it("activé pour un profil existant qui a d'autres préférences mais pas celle-ci", () => {
		setPref('confortLecture', true);
		expect(autresClassesAutorisees()).toBe(true);
	});

	it('désactivé quand le parent pose sansAutresClasses, réactivé quand il le retire', () => {
		setPref('sansAutresClasses', true);
		expect(autresClassesAutorisees()).toBe(false);
		setPref('sansAutresClasses', false);
		expect(autresClassesAutorisees()).toBe(true);
	});

	it('se règle par profil : le réglage de l’un ne touche pas l’autre', () => {
		const premier = activeProfile().uuid;
		setPref('sansAutresClasses', true);
		addProfile('Second'); // devient actif
		expect(autresClassesAutorisees()).toBe(true);
		setActiveProfile(premier);
		expect(autresClassesAutorisees()).toBe(false);
	});
});

describe("critère 8 : étayage d'une leçon de classe supérieure (leconAvantJouee)", () => {
	const attendus = (): string[] => membresPrerequis(DIVISION_CM1);

	it('préconditions : la division euclidienne est CM1 seule et a des prérequis CE2 dans la table', () => {
		expect(lecon(DIVISION_CM1).levels).toEqual(['cm1']);
		expect(attendus()).toEqual(
			expect.arrayContaining(['math-div-reste', 'math-tables-multiplication']),
		);
		for (const id of attendus()) expect(lecon(id).levels, id).toContain('ce2');
	});

	it('profil CE2 qui joue la leçon CM1, prérequis non franchi : nomme un prérequis de la table, en CE2', () => {
		const r = leconAvantJouee(lecon(DIVISION_CM1), 'cm1', 'ce2', cartesVides());
		expect(r).toBeDefined();
		expect(attendus()).toContain(r?.lesson.id);
		expect(r?.niveau).toBe('ce2');
	});

	it('profil CM1 qui joue la même leçon : même résultat que leconAvant, qui nomme aussi le prérequis CE2', () => {
		const lesson = lecon(DIVISION_CM1);
		const r = leconAvantJouee(lesson, 'cm1', 'cm1', cartesVides());
		expect(r).toEqual(leconAvant(lesson, 'cm1', 'cm1', cartesVides()));
		expect(attendus()).toContain(r?.lesson.id);
		expect(r?.niveau).toBe('ce2');
	});

	it('prérequis tous franchis : retombe sur la précédente de catégorie en CM1, pas sur la table', () => {
		const lesson = lecon(DIVISION_CM1);
		const cartes = cartesVides();
		for (const id of attendus()) cartes.stars[`${id}@ce2`] = 1;
		const soeurs = getLessonsByCategory(lesson.category, 'cm1');
		const i = soeurs.findIndex((l) => l.id === lesson.id);
		const precedente = i > 0 ? soeurs[i - 1] : undefined;
		const r = leconAvantJouee(lesson, 'cm1', 'ce2', cartes);
		expect(r?.lesson.id).toBe(precedente?.id);
		if (r) expect(r.niveau).toBe('cm1');
	});
});

describe('critère 15 (logique) : la classe jouée se garde dans le journal d’activité', () => {
	it('normalizeActivity conserve `n` quand c’est une classe valide, l’écarte sinon', () => {
		const lu = normalizeActivity([
			{ t: 1, k: 'lecon', ref: COMMUNE, n: 'ce2' },
			{ t: 2, k: 'lecon', ref: COMMUNE, n: 'cm1' },
			{ t: 3, k: 'lecon', ref: COMMUNE, n: 'zz' },
			{ t: 4, k: 'lecon', ref: COMMUNE, n: 'CE2' },
			{ t: 5, k: 'lecon', ref: COMMUNE, n: 2 },
		]);
		expect(lu.map((e) => e.n)).toEqual(['ce2', 'cm1', undefined, undefined, undefined]);
		expect(lu.every((e) => e.ref === COMMUNE)).toBe(true); // rien d'autre n'est perdu
	});

	it('sans classe choisie, une leçon CE2 seule jouée par un CM1 (favori) porte la classe JOUÉE, pas la classe suivie', () => {
		setNiveauReference('cm1');
		jouerLecon(CE2_SEULE, 3, 4);
		expect(loadActivity().at(-1)?.n).toBe('ce2');
		jouerLecon(COMMUNE, 3, 4);
		expect(loadActivity().at(-1)?.n).toBe('cm1');
	});
});

/* ---------- Témoins : verts aujourd'hui, ils prouvent que les observables des critères
   négatifs (19, 20) RÉAGISSENT à la même partie jouée dans la classe suivie. Sans eux, un
   « rien ne bouge » sous classe choisie pourrait passer à vide. ---------- */
describe('témoins des critères négatifs (sans classe choisie)', () => {
	it('témoin 19 : la même partie jouée en CM1 fait bouger étoiles, compteur et nouvelles leçons du CM1', () => {
		setNiveauReference('cm1');
		const t0 = Date.now();
		const avant = starsEarned();
		jouerLecon(COMMUNE, 5, 5);
		expect(loadStars()).toHaveProperty(COMMUNE);
		expect(starsEarned()).toBe(avant + 1);
		expect(countNewLessonsSince(t0)).toBe(1);
	});

	it('témoin 19 : sans classe choisie, un record de sprint fait progresser le défi « bats ton record »', () => {
		setNiveauReference('cm1');
		poserDefi('beatSprint');
		const r = updateGoal({ mode: 'sprint', isRecord: true, sprint: true });
		expect(r.goal.progress).toBe(1);
		expect(r.justDone).toBe(true);
	});

	it('témoin 20 : la leçon CM1 seule jouée par un profil CM1 entre en révision ; une CE2 seule entre dans le bas niveau', () => {
		setNiveauReference('cm1');
		jouerLecon(CM1_SEULE, 3, 4);
		expect(loadLessonRevisions()).toHaveProperty(CM1_SEULE);
		jouerLecon(CE2_SEULE, 3, 4);
		expect(loadLessonRevisionsBasNiveau().map((e) => e.lessonId)).toContain(CE2_SEULE);
	});
});

/* ============================================================ */

describe('sous une classe choisie', () => {
	beforeEach(() => {
		leverClasseChoisie();
	});

	describe('état de la classe choisie', () => {
		beforeEach(() => setNiveauReference('cm1'));

		it('aucune classe choisie au départ ; classeDeCategorie rend la classe suivie', () => {
			expect(classeChoisie()).toBeNull();
			expect(classeDeCategorie(NUMERATION)).toBe('cm1');
		});

		it('choisir une autre classe la pose pour CETTE catégorie seulement', () => {
			choisirClasse(NUMERATION, 'ce2');
			expect(classeChoisie()).toEqual({ categoryId: NUMERATION, niveau: 'ce2' });
			expect(classeDeCategorie(NUMERATION)).toBe('ce2');
			// Une autre catégorie, même de la même matière, reste dans la classe suivie —
			// y compris « Calcul », qui n'a pourtant que du CE2.
			expect(classeDeCategorie('math-calcul')).toBe('cm1');
			expect(classeDeCategorie('fr-grammaire')).toBe('cm1');
		});

		it('choisir la classe que la matière suit déjà lève le choix', () => {
			choisirClasse(NUMERATION, 'ce2');
			choisirClasse(NUMERATION, 'cm1');
			expect(classeChoisie()).toBeNull();
			expect(classeDeCategorie(NUMERATION)).toBe('cm1');
		});

		it('leverClasseChoisie ramène à la classe suivie', () => {
			choisirClasse(NUMERATION, 'ce2');
			leverClasseChoisie();
			expect(classeChoisie()).toBeNull();
			expect(classeDeCategorie(NUMERATION)).toBe('cm1');
		});

		it('matière surchargée : la « classe suivie » est celle de la MATIÈRE, pas la classe de référence', () => {
			setNiveauReference('ce2');
			setNiveauMatiere(lecon(COMMUNE).subject, 'cm1');
			choisirClasse(NUMERATION, 'ce2'); // = référence, mais ≠ classe suivie en maths
			expect(classeChoisie()).toEqual({ categoryId: NUMERATION, niveau: 'ce2' });
			expect(niveauLecon(lecon(COMMUNE))).toBe('ce2');
			choisirClasse(NUMERATION, 'cm1'); // = classe suivie en maths → levée
			expect(classeChoisie()).toBeNull();
			expect(classeDeCategorie(NUMERATION)).toBe('cm1');
		});
	});

	describe('critère 18 : le réglage de classe du profil n’est jamais modifié', () => {
		it('ni pendant le choix, ni après', () => {
			setNiveauReference('cm1');
			const maths = lecon(COMMUNE).subject;
			choisirClasse(NUMERATION, 'ce2');
			for (const moment of ['pendant le choix', 'après levée']) {
				expect(getNiveauReference(), moment).toBe('cm1');
				expect(getNiveauParMatiere(), moment).toEqual({});
				expect(niveauActif(), moment).toBe('cm1');
				expect(niveauActifMatiere(maths), moment).toBe('cm1');
				leverClasseChoisie();
			}
		});
	});

	describe('critère 3 : la leçon est jouée et rangée dans la classe choisie', () => {
		beforeEach(() => setNiveauReference('cm1'));

		it('num-comparer (commune CE2/CM1) se joue en CE2 quand le CE2 est choisi pour la numération', () => {
			const l = lecon(COMMUNE);
			expect(l.levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
			expect(niveauLecon(l)).toBe('cm1'); // sans choix : la classe suivie
			choisirClasse(NUMERATION, 'ce2');
			expect(niveauLecon(l)).toBe('ce2');
		});

		it('ses statistiques, son étoile et sa 1re rencontre vont en CE2, rien en CM1', () => {
			choisirClasse(NUMERATION, 'ce2');
			jouerLecon(COMMUNE, 5, 5);
			const stats = Object.keys(lsGet(LESSON_STATS_KEY, {}) as Record<string, unknown>);
			expect(stats).toContain(`${COMMUNE}@ce2`);
			expect(stats).not.toContain(`${COMMUNE}@cm1`);
			expect(etoileAuxNiveaux(COMMUNE)).toEqual(['ce2']);
			expect(Object.keys(lsGet(LESSON_FIRST_SEEN_KEY, {}) as Record<string, unknown>)).toEqual([
				`${COMMUNE}@ce2`,
			]);
			leverClasseChoisie();
			expect(loadLessonStats()).not.toHaveProperty(COMMUNE); // vue CM1 intacte
		});

		it("son erreur journalisée est classée CE2 dans l'historique", () => {
			choisirClasse(NUMERATION, 'ce2');
			journaliserErreur({
				lessonId: COMMUNE,
				mode: 'lecon',
				question: 'Compare 4 512 et 4 521.',
				donnee: '>',
				attendue: '<',
			});
			const [e] = chargerErreursFor(activeProfile().uuid);
			expect(e?.lessonId).toBe(COMMUNE);
			expect(niveauErreur(e)).toBe('ce2');
		});

		it('une leçon commune d’une AUTRE catégorie de la même matière reste jouée et rangée en CM1', () => {
			const maths = lecon(COMMUNE).subject;
			const autre = getAllLessons().find(
				(l) =>
					l.subject === maths &&
					l.category !== NUMERATION &&
					l.levels.includes('ce2') &&
					l.levels.includes('cm1'),
			);
			expect(autre, 'il faut une leçon de maths commune CE2/CM1 hors numération').toBeDefined();
			if (!autre) return;
			choisirClasse(NUMERATION, 'ce2');
			expect(niveauLecon(autre)).toBe('cm1');
			recordLessonStats({ [autre.id]: { ok: 1, total: 2 } }, 'lecon', autre.id);
			const stats = Object.keys(lsGet(LESSON_STATS_KEY, {}) as Record<string, unknown>);
			expect(stats).toContain(`${autre.id}@cm1`);
			expect(stats).not.toContain(`${autre.id}@ce2`);
		});

		it('une leçon d’une autre matière n’est pas affectée', () => {
			const fr = lecon('fr-gram-clic-noyau');
			expect(fr.levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
			choisirClasse(NUMERATION, 'ce2');
			expect(niveauLecon(fr)).toBe('cm1');
		});

		it('le niveau imposé par une épingle (#573) passe devant la classe choisie', () => {
			const l = lecon(COMMUNE);
			choisirClasse(NUMERATION, 'ce2');
			imposerNiveauLecon(COMMUNE, 'cm1');
			expect(niveauLecon(l)).toBe('cm1');
			// Imposé à une AUTRE leçon : la classe choisie s'applique de nouveau.
			imposerNiveauLecon(CE2_SEULE, 'ce2');
			expect(niveauLecon(l)).toBe('ce2');
		});
	});

	describe('critère 4 : les records vont dans le classement de la classe choisie', () => {
		beforeEach(() => setNiveauReference('cm1'));

		it('un bilan express en vue CE2 est classé en CE2 et absent du classement CM1', () => {
			choisirClasse(NUMERATION, 'ce2');
			recordRun('express', 3, 5, 4_321);
			expect(loadRuns('express').map((r) => r.ms)).toEqual([4_321]); // classement affiché sur la page
			leverClasseChoisie();
			expect(loadRuns('express')).toEqual([]); // classement CM1
			setNiveauReference('ce2');
			expect(loadRuns('express').map((r) => r.ms)).toEqual([4_321]); // il est bien au CE2
		});

		it('le record se mesure contre le classement CE2, pas contre le CM1', () => {
			setNiveauReference('ce2');
			recordRun('express', 1, 5, 9_000); // seul essai CE2
			setNiveauReference('cm1');
			recordRun('express', 5, 5, 1_000); // essai CM1 imbattable
			choisirClasse(NUMERATION, 'ce2');
			const r = recordRun('express', 3, 5, 5_000);
			expect(r).toMatchObject({ rank: 1, total: 2, isRecord: true });
		});
	});

	describe('critère 15 (logique) : l’activité porte la classe jouée', () => {
		it('une leçon commune jouée en vue CE2 chez un CM1 est journalisée avec n = ce2', () => {
			setNiveauReference('cm1');
			choisirClasse(NUMERATION, 'ce2');
			jouerLecon(COMMUNE, 3, 4);
			const e = loadActivity().at(-1);
			expect(e?.ref).toBe(COMMUNE);
			expect(e?.n).toBe('ce2');
		});
	});

	describe('critère 17 : XP et compteurs d’effort', () => {
		it('une leçon jouée dans la classe choisie rapporte autant d’XP que jouée sans choix', () => {
			profilNeuf('cm1');
			const x0 = getXP();
			jouerLecon(COMMUNE, 5, 5);
			const gainSansChoix = getXP() - x0;

			profilNeuf('cm1');
			choisirClasse(NUMERATION, 'ce2');
			expect(niveauLecon(lecon(COMMUNE))).toBe('ce2'); // jouée dans l'autre classe
			const x1 = getXP();
			jouerLecon(COMMUNE, 5, 5);
			const gainAvecChoix = getXP() - x1;

			expect(gainSansChoix).toBeGreaterThan(0);
			expect(gainAvecChoix).toBe(gainSansChoix);
		});

		it('les compteurs d’effort globaux comptent ce qui est fait en vue CE2', () => {
			setNiveauReference('cm1');
			choisirClasse(NUMERATION, 'ce2');
			const etoiles = starsEarnedAll();
			jouerLecon(CE2_SEULE, 4, 4);
			recordLessonRun({
				mode: 'express',
				lessonId: null,
				ok: 4,
				questionCount: 5,
				ms: 20_000,
				perLesson: { [COMMUNE]: { ok: 4, total: 5 } },
			});
			leverClasseChoisie();
			expect(starsEarnedAll()).toBe(etoiles + 1);
			expect(countSince('express', 0)).toBe(1);
			expect(loadRunsAll('express')).toHaveLength(1);
			expect(loadLessonStatsAll()[COMMUNE]?.questions).toBe(5);
		});
	});

	describe('critère 19 (négatif) : rien n’entre dans l’avancement de la classe suivie', () => {
		it('complétude, étoiles scopées et nouvelles leçons du CM1 ne bougent pas après des leçons faites en vue CE2', () => {
			setNiveauReference('cm1');
			const t0 = Date.now();
			const perimetre = lessonsNiveauActif().map((l) => l.id);
			expect(perimetre).toContain(COMMUNE);
			expect(perimetre).not.toContain(CE2_SEULE);
			const etoilesAvant = starsEarned();

			choisirClasse(NUMERATION, 'ce2');
			jouerLecon(COMMUNE, 5, 5);
			jouerLecon(CE2_SEULE, 4, 4);
			expect(etoileAuxNiveaux(COMMUNE)).toEqual(['ce2']); // le travail est bien enregistré

			for (const moment of ['classe CE2 encore choisie', 'après retour à la classe du profil']) {
				expect(
					lessonsNiveauActif().map((l) => l.id),
					moment,
				).toEqual(perimetre);
				expect(loadStars(), moment).not.toHaveProperty(COMMUNE);
				expect(loadStars(), moment).not.toHaveProperty(CE2_SEULE);
				expect(starsEarned(), moment).toBe(etoilesAvant);
				expect(countNewLessonsSince(t0), moment).toBe(0);
				leverClasseChoisie();
			}
		});

		it('un record de sprint fait en vue CE2 ne fait pas progresser le défi « bats ton record »', () => {
			setNiveauReference('cm1');
			poserDefi('beatSprint');
			const faits = getGoalsDone();
			choisirClasse(NUMERATION, 'ce2');
			const r = updateGoal({ mode: 'sprint', isRecord: true, sprint: true });
			expect(r.goal.progress).toBe(0);
			expect(r.justDone).toBe(false);
			expect(getGoalsDone()).toBe(faits);
			// Le défi reste à prendre dans la classe suivie.
			leverClasseChoisie();
			expect(updateGoal({ mode: 'sprint', isRecord: true, sprint: true }).goal.progress).toBe(1);
		});

		it('idem pour le type hérité « record »', () => {
			setNiveauReference('cm1');
			poserDefi('record');
			choisirClasse(NUMERATION, 'ce2');
			expect(updateGoal({ mode: 'sprint', isRecord: true, sprint: true }).goal.progress).toBe(0);
		});
	});

	describe('critère 20 (négatif) : classe supérieure, ni révision espacée ni appoint', () => {
		it('profil CE2, vue CM1 : une leçon CM1 seule jouée ne ressort ni en révision ni en bas niveau', () => {
			setNiveauReference('ce2');
			expect(lecon(CM1_SEULE).levels).toEqual(['cm1']);
			choisirClasse(NUMERATION, 'cm1');
			jouerLecon(CM1_SEULE, 3, 4);
			expect(loadLessonStatsAll()).toHaveProperty(CM1_SEULE); // l'essai est bien enregistré
			for (const moment of ['classe CM1 encore choisie', 'après retour à la classe du profil']) {
				expect(loadLessonRevisions(), moment).not.toHaveProperty(CM1_SEULE);
				expect(
					loadLessonRevisionsBasNiveau().map((e) => e.lessonId),
					moment,
				).not.toContain(CM1_SEULE);
				leverClasseChoisie();
			}
		});
	});
});
