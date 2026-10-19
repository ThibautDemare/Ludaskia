/* ============================================================
   Révision — FORME de la question servie (#770), logique pure.
   Une leçon qui mêle questions NUMÉRIQUES et COMPARAISONS (réponse <, = ou >) doit
   servir chaque question sous la forme qui lui convient : le signe en TUILES (il
   n'est pas saisissable au clavier numérique sur mobile, #186), le nombre en SAISIE.
   L'exigence porte sur LA question affichée : sa réponse et sa forme doivent aller
   ensemble, tirage après tirage.

   Chaque tirage est rejoué sous une graine fixe (`withSeed`) : un échec cite les
   graines fautives, rejouables à l'identique.

   Critère 6 de l'issue (journal d'erreurs) : hors de ce fichier, aucun code de
   journal n'est concerné par le correctif.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getAllLessons, getLessonById } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { hasMode } from '../src/core/exercise';
import type { Exercise } from '../src/core/exercise';
import { questionDeRevision } from '../src/core/revision-question';
import type { QuestionRevision } from '../src/core/revision-question';
import { withSeed } from '../src/core/utils';

const TIRAGES = 300;
const GRAINE = 770_000;
const LECON_MIXTE = 'num-situer-10000';

const SIGNES = new Set(['<', '=', '>']);
const estSigne = (reponse: string | number): boolean => SIGNES.has(String(reponse).trim());

interface Tirage {
	graine: number;
	q: QuestionRevision | null;
}

/* `TIRAGES` questions de révision, le n°i tiré sous la graine `GRAINE + i`. */
function echantillon(lesson: LessonDef, level: SchoolLevel, n = TIRAGES): Tirage[] {
	const out: Tirage[] = [];
	for (let i = 0; i < n; i++) {
		const graine = GRAINE + i;
		out.push({ graine, q: withSeed(graine, () => questionDeRevision(lesson, level)) });
	}
	return out;
}

/* Réponse attendue de la question SERVIE : saisie → `item.answer`, tuiles → `answer`.
   `undefined` pour les autres formes (QCM, widgets riches), hors sujet ici. */
function reponseServie(q: QuestionRevision | null): string | number | undefined {
	if (q?.kind === 'num') return q.item.answer;
	if (q?.kind === 'tuile') return q.answer;
	return undefined;
}

/* Signe servi en SAISIE : le défaut de #770 (côté comparaison). */
const signeEnSaisie = (t: Tirage): boolean => {
	const r = reponseServie(t.q);
	return t.q?.kind === 'num' && r !== undefined && estSigne(r);
};

/* Nombre servi en TUILES : le défaut de #770 (côté numérique). */
const nombreEnTuiles = (t: Tirage): boolean => {
	const r = reponseServie(t.q);
	return t.q?.kind === 'tuile' && r !== undefined && !estSigne(r);
};

const decrire = (t: Tirage): string =>
	`graine ${t.graine} : ${t.q?.kind} « ${String(reponseServie(t.q))} »`;

function leconMixte(): LessonDef {
	const lesson = getLessonById(LECON_MIXTE);
	if (!lesson) throw new Error(`leçon ${LECON_MIXTE} introuvable dans le catalogue`);
	return lesson;
}

describe(`#770 — ${LECON_MIXTE} : chaque question servie sous la forme de sa réponse`, () => {
	it('garde-fou : la leçon existe, propose le mode tuiles, couvre ce2 et cm1', () => {
		const lesson = leconMixte();
		expect(hasMode(lesson.exerciseType, 'tuiles')).toBe(true);
		expect(lesson.levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
	});

	for (const level of ['ce2', 'cm1'] as const) {
		it(`critère 1 (${level}) : une comparaison n'est jamais servie en saisie`, () => {
			const fautifs = echantillon(leconMixte(), level).filter(signeEnSaisie);
			expect(
				fautifs.slice(0, 5).map(decrire),
				`${fautifs.length}/${TIRAGES} signes servis en saisie`,
			).toEqual([]);
		});

		it(`critère 2 (${level}) : une question numérique n'est jamais servie en tuiles`, () => {
			const fautifs = echantillon(leconMixte(), level).filter(nombreEnTuiles);
			expect(
				fautifs.slice(0, 5).map(decrire),
				`${fautifs.length}/${TIRAGES} nombres servis en tuiles`,
			).toEqual([]);
		});

		it(`critère 4 (${level}) : les deux sortes de questions restent servies`, () => {
			const tirages = echantillon(leconMixte(), level);
			const comparaisonsEnTuiles = tirages.filter((t) => {
				const r = reponseServie(t.q);
				return t.q?.kind === 'tuile' && r !== undefined && estSigne(r);
			}).length;
			const nombresEnSaisie = tirages.filter((t) => {
				const r = reponseServie(t.q);
				return t.q?.kind === 'num' && r !== undefined && !estSigne(r);
			}).length;
			expect(comparaisonsEnTuiles, 'aucune comparaison servie en tuiles').toBeGreaterThan(0);
			expect(nombresEnSaisie, 'aucune question numérique servie en saisie').toBeGreaterThan(0);
		});
	}
});

/* Couples (leçon, niveau) énumérés DEPUIS le catalogue : une leçon ajoutée plus tard
   entre dans le gate sans qu'on touche à ce fichier. */
function couples(filtre: (lesson: LessonDef) => boolean): [string, SchoolLevel, LessonDef][] {
	return getAllLessons()
		.filter(filtre)
		.flatMap((lesson) =>
			lesson.levels.map((level): [string, SchoolLevel, LessonDef] => [lesson.id, level, lesson]),
		);
}

const AVEC_TUILES = couples((l) => hasMode(l.exerciseType, 'tuiles'));
const SANS_TUILES = couples((l) => !hasMode(l.exerciseType, 'tuiles'));

describe('#770 — critère 3 : gate catalogue, aucun signe servi en saisie', () => {
	it('garde-fou : la liste itérée est non vide et contient la leçon mixte', () => {
		expect(AVEC_TUILES.length).toBeGreaterThan(0);
		expect(AVEC_TUILES.map(([id]) => id)).toContain(LECON_MIXTE);
	});

	it.each(AVEC_TUILES)('%s (%s) : aucun signe servi en saisie', (_id, level, lesson) => {
		const fautifs = echantillon(lesson, level).filter(signeEnSaisie);
		expect(
			fautifs.slice(0, 5).map(decrire),
			`${fautifs.length}/${TIRAGES} signes servis en saisie`,
		).toEqual([]);
	});
});

describe('#770 — critère 5 : pas de tuiles sans mode tuiles', () => {
	it('garde-fou : des leçons sans mode tuiles existent au catalogue', () => {
		expect(SANS_TUILES.length).toBeGreaterThan(0);
	});

	it.each(SANS_TUILES)(
		'%s (%s) : jamais servie en tuiles (pas de mode tuiles)',
		(_id, level, lesson) => {
			const fautifs = echantillon(lesson, level, 50).filter((t) => t.q?.kind === 'tuile');
			expect(fautifs.slice(0, 5).map(decrire)).toEqual([]);
		},
	);
});

/* Profil des réponses d'un couple (leçon à mode tuiles, niveau), tiré du GÉNÉRATEUR et non
   de la révision : 'sansSigne' si tous les tirages sont des `text` dont aucun n'est un
   signe, 'queDesSignes' si ce sont tous des `text` à signe, `null` sinon — leçon mixte
   (couverte par les critères 1 à 4) ou forme non `text` (vocabulaire en `tuilesOrdre`). */
type ExerciceTexte = Extract<Exercise, { type: 'text' }>;
function profilReponses(
	lesson: LessonDef,
	level: SchoolLevel,
): 'sansSigne' | 'queDesSignes' | null {
	const tirages = Array.from({ length: TIRAGES }, (_, i) =>
		withSeed(GRAINE + i, () => lesson.exerciseType.generate({ level })),
	);
	const textes = tirages.filter((ex): ex is ExerciceTexte => ex.type === 'text');
	if (textes.length !== tirages.length) return null;
	const signes = textes.filter((ex) => estSigne(ex.answer)).length;
	if (signes === 0) return 'sansSigne';
	if (signes === textes.length) return 'queDesSignes';
	return null;
}

const PROFILS = AVEC_TUILES.map((c) => ({ couple: c, profil: profilReponses(c[2], c[1]) }));
const SANS_SIGNE = PROFILS.filter((p) => p.profil === 'sansSigne').map((p) => p.couple);
const QUE_DES_SIGNES = PROFILS.filter((p) => p.profil === 'queDesSignes').map((p) => p.couple);
const ids = (cs: [string, SchoolLevel, LessonDef][]): string[] => cs.map(([id]) => id);

describe('#770 — critère 5 : une leçon homogène garde la forme de ses réponses (gate catalogue)', () => {
	it('garde-fou : la branche « aucun signe » a des leçons, dont num-encadrer-intercaler', () => {
		expect(ids(SANS_SIGNE)).toContain('num-encadrer-intercaler');
	});

	it('garde-fou : la branche « que des signes » a des leçons, dont num-comparer', () => {
		expect(ids(QUE_DES_SIGNES)).toContain('num-comparer');
	});

	it("garde-fou : la leçon mixte n'entre dans aucune des deux branches", () => {
		expect([...ids(SANS_SIGNE), ...ids(QUE_DES_SIGNES)]).not.toContain(LECON_MIXTE);
	});

	it.each(SANS_SIGNE)(
		"%s (%s) : aucune réponse n'est un signe → toujours en saisie",
		(_id, level, lesson) => {
			const horsSaisie = echantillon(lesson, level).filter((t) => t.q?.kind !== 'num');
			expect(
				horsSaisie.slice(0, 5).map(decrire),
				`${horsSaisie.length}/${TIRAGES} non servis en saisie`,
			).toEqual([]);
		},
	);

	it.each(QUE_DES_SIGNES)(
		'%s (%s) : toutes les réponses sont des signes → toujours en tuiles',
		(_id, level, lesson) => {
			const horsTuiles = echantillon(lesson, level).filter((t) => t.q?.kind !== 'tuile');
			expect(
				horsTuiles.slice(0, 5).map(decrire),
				`${horsTuiles.length}/${TIRAGES} non servis en tuiles`,
			).toEqual([]);
		},
	);
});
