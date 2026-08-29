import { describe, expect, it } from 'vitest';
import {
	estEligibleSprintHorsNiveau,
	getAllLessons,
	getLessonById,
	isClicMotLesson,
	isDroiteGradueeLesson,
	isOrderingLesson,
	isPairingLesson,
	isPosedLesson,
	isProblemeLesson,
	isTriLesson,
} from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';

/* ============================================================
   `estEligibleSprintHorsNiveau` — ce que le sprint chronométré a le droit de tirer (#630).

   POURQUOI CE FICHIER. Les sept prédicats de format (`isPosedLesson`,
   `isOrderingLesson`… testés dans tests/logic.test.ts) ont chacun leur cas ; la
   fonction qui les COMPOSE n'en avait aucun, alors que c'est elle qui décide de ce
   que l'enfant rencontre en sprint. Une condition oubliée dans la conjonction (ou
   retirée par un refacto) ne se voit nulle part ailleurs : la leçon rentrerait
   simplement dans le tirage, et l'enfant tomberait au chrono sur une grille
   d'opération posée ou un rangement de tuiles — jouables, mais pas « une réponse à
   la fois ». Personne n'aurait de test rouge.

   COMMENT. On tire les témoins du VRAI catalogue, format par format, et jamais en
   bloc : un test global « aucune leçon à écran dédié n'est éligible » resterait vert
   si six conditions sur sept faisaient le travail. Deux précautions :
   - chaque témoin est PUR, c'est-à-dire sans `excludeFromSprint` — sinon le drapeau
     déclaratif masquerait la disparition de la condition de format, et le test
     mesurerait autre chose que ce qu'il annonce ;
   - chaque cas GARDE contre le vide (`toBeGreaterThan(0)`) : le jour où un format
     n'a plus de leçon au catalogue, la boucle tournerait à vide et passerait au vert
     sans rien vérifier. On préfère un rouge qui dit « témoin à réancrer ».

   HORS PÉRIMÈTRE : le filtre de NIVEAU. Il vit dans `ui/sprint.ts` parce qu'il dépend
   du profil actif ; le prédicat du catalogue, lui, ne connaît pas la classe de
   l'enfant. C'est éprouvé ici en négatif (une leçon CM1 reste éligible telle quelle),
   pour qu'un futur « raccourci » qui déplacerait ce filtre dans le catalogue casse
   bruyamment — plutôt que de faire disparaître en silence toutes les leçons CM1 du
   sprint, ou l'inverse.
   ============================================================ */

const CATALOGUE: LessonDef[] = getAllLessons();

/* Leçon du catalogue par id, avec un message qui dit quoi faire si l'id a bougé
   (les témoins nommés ci-dessous sont de vraies leçons, pas des objets fabriqués). */
function lecon(id: string): LessonDef {
	const def = getLessonById(id);
	if (!def) throw new Error(`Leçon « ${id} » absente du catalogue : témoin à réancrer.`);
	return def;
}

/* Les sept formats à écran dédié composés par `estEligibleSprintHorsNiveau`, chacun avec son
   prédicat. Libellés repris de l'intention métier (le runner concerné). */
const FORMATS: { nom: string; predicat: (l: LessonDef) => boolean }[] = [
	{ nom: 'opération posée (#97)', predicat: isPosedLesson },
	{ nom: 'rangement d’une suite (#108/#448)', predicat: isOrderingLesson },
	{ nom: 'tri par thème (#114)', predicat: isTriLesson },
	{ nom: 'résolution de problèmes (#199)', predicat: isProblemeLesson },
	{ nom: 'appariement (#392)', predicat: isPairingLesson },
	{ nom: 'clique sur le mot (#259)', predicat: isClicMotLesson },
	{ nom: 'droite graduée (#256)', predicat: isDroiteGradueeLesson },
];

/* Témoins PURS d'un format : la leçon est de ce format ET ne porte pas le drapeau
   déclaratif. Seuls ceux-là prouvent quelque chose sur la condition de format. */
function temoinsPurs(predicat: (l: LessonDef) => boolean): LessonDef[] {
	return CATALOGUE.filter((l) => predicat(l) && !l.excludeFromSprint);
}

describe('estEligibleSprintHorsNiveau — les sept formats à écran dédié, un par un', () => {
	it.each(FORMATS)('$nom : aucune leçon de ce format n’est tirable', ({ nom, predicat }) => {
		const temoins = temoinsPurs(predicat);
		// Garde anti-test-à-vide : sans témoin PUR, la boucle ne dirait rien du format.
		expect(
			temoins.length,
			`Aucun témoin sans excludeFromSprint pour « ${nom} » : la condition de format n’est plus éprouvée, réancrer le test.`,
		).toBeGreaterThan(0);
		for (const l of temoins) {
			expect(
				estEligibleSprintHorsNiveau(l),
				`${l.id} (${nom}) ne devrait pas être tirable au sprint`,
			).toBe(false);
		}
	});

	it('un format à écran dédié FUTUR est écarté lui aussi (toute étiquette exerciseKind)', () => {
		// `exerciseKind` ne se pose QUE sur un format à runner dédié (cf. son contrat dans
		// core/exercise.ts : « Absent = format standard éligible au sprint »). Ce cas
		// attrape donc le huitième format qu'on ajouterait sans l'ajouter à la
		// conjonction — la table `FORMATS` ci-dessus, elle, ne le connaîtrait pas.
		const etiquetes = CATALOGUE.filter((l) => l.exerciseType.exerciseKind && !l.excludeFromSprint);
		expect(etiquetes.length).toBeGreaterThan(0);
		for (const l of etiquetes) {
			expect(
				estEligibleSprintHorsNiveau(l),
				`${l.id} porte exerciseKind='${l.exerciseType.exerciseKind}' : format à écran dédié, donc hors sprint`,
			).toBe(false);
		}
	});
});

describe('estEligibleSprintHorsNiveau — le drapeau déclaratif excludeFromSprint', () => {
	it('écarte une leçon de format STANDARD (le drapeau seul fait le travail)', () => {
		// « Sens propre / sens figuré » : QCM ordinaire, aucun écran dédié — elle n'est
		// hors sprint QUE par décision pédagogique (jugement de sens, cf. #254).
		const l = lecon('fr-vocab-sens');
		expect(l.excludeFromSprint).toBe(true);
		expect(
			l.exerciseType.exerciseKind,
			'témoin choisi pour être un format standard',
		).toBeUndefined();
		expect(estEligibleSprintHorsNiveau(l)).toBe(false);
	});

	it('écarte TOUTES les leçons qui le portent', () => {
		const marquees = CATALOGUE.filter((l) => l.excludeFromSprint);
		expect(marquees.length).toBeGreaterThan(0);
		for (const l of marquees) {
			expect(estEligibleSprintHorsNiveau(l), `${l.id} porte excludeFromSprint`).toBe(false);
		}
	});
});

describe('estEligibleSprintHorsNiveau — ce qui reste tirable', () => {
	it('retient une leçon ordinaire (ni drapeau, ni écran dédié)', () => {
		for (const id of ['math-tables-addition', 'fr-conj-etre-present']) {
			const l = lecon(id);
			expect(l.excludeFromSprint).toBeUndefined();
			expect(l.exerciseType.exerciseKind).toBeUndefined();
			expect(estEligibleSprintHorsNiveau(l), `${id} devrait rester tirable au sprint`).toBe(true);
		}
	});

	it('laisse un pool de taille utile (le sprint ne tire pas dans le vide)', () => {
		// Sans plancher, une conjonction devenue trop gourmande (une condition de trop,
		// une négation inversée) viderait le pool sans faire rougir un seul cas ci-dessus.
		expect(CATALOGUE.filter(estEligibleSprintHorsNiveau).length).toBeGreaterThan(30);
	});
});

describe('estEligibleSprintHorsNiveau — ne filtre PAS par niveau scolaire (#225)', () => {
	it('une leçon CM1-only reste éligible telle quelle', () => {
		// Le prédicat ignore la classe : c'est `ui/sprint.ts` qui croise avec le profil
		// actif. Une leçon qui n'existe qu'au CM1 doit donc sortir éligible ici.
		const l = lecon('math-multiples-50');
		expect(l.levels).not.toContain('ce2');
		expect(estEligibleSprintHorsNiveau(l)).toBe(true);
	});

	it('le pool éligible contient des leçons de chaque niveau présent au catalogue', () => {
		const niveaux = new Set<SchoolLevel>(CATALOGUE.flatMap((l) => l.levels));
		expect(niveaux.size).toBeGreaterThan(1); // garde : au moins deux classes au catalogue
		const pool = CATALOGUE.filter(estEligibleSprintHorsNiveau);
		for (const n of niveaux) {
			expect(
				pool.some((l) => l.levels.includes(n)),
				`aucune leçon de niveau ${n} dans le pool : le prédicat filtre-t-il par classe ?`,
			).toBe(true);
		}
	});
});

describe('estEligibleSprintHorsNiveau — aucune exclusion pour une raison invisible', () => {
	it('toute leçon écartée l’est par le drapeau ou par un format nommé', () => {
		// Sens inverse des cas précédents : ils vérifient que les raisons connues
		// écartent bien ; celui-ci vérifie qu'il n'y en a pas d'AUTRE. Un critère ajouté
		// en douce (le repère « plus difficile », une matière, un niveau) retirerait des
		// leçons du sprint sans que rien ne le dise — c'est exactement le genre de perte
		// silencieuse qu'on ne remarque qu'à l'usage, des semaines plus tard.
		const orphelines = CATALOGUE.filter(
			(l) =>
				!estEligibleSprintHorsNiveau(l) &&
				!l.excludeFromSprint &&
				!FORMATS.some((f) => f.predicat(l)),
		);
		expect(orphelines.map((l) => l.id)).toEqual([]);
	});
});
