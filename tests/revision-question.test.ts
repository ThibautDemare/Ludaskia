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

describe('#770 — critère 5 : pas de tuiles là où elles ne vont pas', () => {
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

	/* Leçons à mode tuiles dont AUCUNE réponse n'est un signe (encadrer / intercaler) :
	   la révision les sert en saisie, comme avant le correctif. */
	const SANS_SIGNE = ['num-encadrer-intercaler', 'num-dec-encadrer'];

	for (const id of SANS_SIGNE) {
		const lesson = getLessonById(id);
		for (const level of lesson?.levels ?? []) {
			it(`${id} (${level}) : aucune réponse n'est un signe → toujours en saisie`, () => {
				expect(lesson, `leçon ${id} introuvable`).toBeDefined();
				if (!lesson) return;
				expect(hasMode(lesson.exerciseType, 'tuiles')).toBe(true);
				// Précondition tirée du GÉNÉRATEUR, pas de la révision : si la leçon se met à
				// poser des comparaisons, elle ne qualifie plus pour ce test — on le dit.
				const signesGeneres = Array.from({ length: TIRAGES }, (_, i) =>
					withSeed(GRAINE + i, () => lesson.exerciseType.generate({ level })),
				).filter((ex) => 'answer' in ex && estSigne(ex.answer)).length;
				expect(signesGeneres, `${id} pose désormais des comparaisons`).toBe(0);

				const pasEnSaisie = echantillon(lesson, level).filter((t) => t.q?.kind !== 'num');
				expect(pasEnSaisie.slice(0, 5).map(decrire)).toEqual([]);
			});
		}
	}

	it('garde-fou : les leçons sans signe sont bien au catalogue', () => {
		expect(SANS_SIGNE.filter((id) => !getLessonById(id))).toEqual([]);
	});
});
