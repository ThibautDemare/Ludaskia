/* ============================================================
   Gate : chaque leçon déclare une consigne d'action, à chaque niveau (#777, critère 4).

   Écrit AVANT l'implémentation (#777, skill /cadrer) : rouge à l'arrivée sauf
   non-régressions.

   Constat de départ : 100 leçons sur 188 n'avaient aucune consigne d'action. Le bilan
   affiche le titre de leçon comme consigne (comme la révision espacée), complété de
   cette consigne d'action, désormais OBLIGATOIRE : le titre seul ne dit pas toujours
   quoi faire.

   Ce qui compte comme consigne : ce que la leçon DÉCLARE, lu par le point d'entrée
   unique `consignePourNiveau` (forme chaîne ou fonction du niveau). Un repli générique
   posé ailleurs (« Complète. », « Écris la forme correcte. ») ne compte pas : il ne
   nomme pas la tâche. Le même texte générique, s'il était déclaré par la leçon, ne
   compte pas davantage — sinon un défaut posé en masse par un combinateur rendrait le
   gate vert sans qu'aucune consigne n'ait été écrite.

   Inventaire LU du catalogue (`getAllLessons()`), jamais recopié : une leçon ajoutée
   plus tard est couverte d'office. Un plancher empêche un inventaire effondré de
   passer à vide.

   Ce que ce gate ne juge pas : la JUSTESSE de la consigne (critère 5 : vraie sur le
   support où elle s'affiche, relue par pedagogue-primaire et redacteur-contenu-francais).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getAllLessons, type LessonDef, type SchoolLevel } from '../src/core/catalog';
import { consignePourNiveau, type ExerciseType } from '../src/core/exercise';

/* Replis génériques qui ne nomment pas la tâche (cités par l'issue #777). */
const REPLIS_GENERIQUES = ['Complète.', 'Écris la forme correcte.'];

/** Niveaux couverts par une leçon ; CE2 par défaut si la liste est vide. */
const niveauxDe = (lesson: LessonDef): SchoolLevel[] =>
	lesson.levels.length > 0 ? lesson.levels : ['ce2'];

/** Raison pour laquelle le type n'a pas de consigne d'action à ce niveau, ou `null`. */
function sansConsigne(type: Pick<ExerciseType, 'consigne'>, niveau: SchoolLevel): string | null {
	const c = consignePourNiveau(type, niveau);
	if (c === undefined) return 'aucune consigne';
	const t = c.normalize('NFC').trim();
	if (t === '') return 'consigne vide';
	if (REPLIS_GENERIQUES.includes(t)) return `consigne générique « ${t} »`;
	return null;
}

/** Couples leçon × niveau sans consigne d'action, prêts à servir de liste de travail. */
function manquants(lessons: readonly LessonDef[]): string[] {
	return lessons.flatMap((lesson) =>
		niveauxDe(lesson).flatMap((niveau) => {
			const raison = sansConsigne(lesson.exerciseType, niveau);
			return raison === null ? [] : [`${lesson.id} @${niveau} : ${raison}`];
		}),
	);
}

/* Plancher : 188 leçons au 22/10/2026. On tolère des retraits, pas un effondrement. */
const PLANCHER_LECONS = 150;

describe('Critère 4 : consigne d’action déclarée par chaque leçon, à chaque niveau', () => {
	const LESSONS = getAllLessons();

	it('l’inventaire énuméré n’est pas effondré', () => {
		expect(LESSONS.length).toBeGreaterThanOrEqual(PLANCHER_LECONS);
	});

	it('critère 4 : aucune leçon × niveau sans consigne d’action propre', () => {
		const liste = manquants(LESSONS);
		const lecons = new Set(liste.map((l) => l.split(' ')[0]));
		expect(
			liste,
			`${liste.length} couple(s) leçon × niveau sans consigne (${lecons.size} leçon(s))`,
		).toEqual([]);
	});

	/* Le gate sera vert une fois les consignes écrites : seuls ces témoins diront alors
	   qu'il garde quelque chose. Leçon support : la première du catalogue, dont on ne
	   garde que l'identité ; la consigne est fabriquée. */
	it('témoins : le gate signale chaque forme de consigne manquante, et seulement elles', () => {
		const base = LESSONS[0];
		const avec = (consigne: ExerciseType['consigne'], levels: SchoolLevel[]): LessonDef => ({
			...base,
			levels,
			exerciseType: { ...base.exerciseType, consigne },
		});
		// Absente, vide, blanche, générique : signalées.
		expect(manquants([avec(undefined, ['ce2'])])).toHaveLength(1);
		expect(manquants([avec('', ['ce2'])])).toHaveLength(1);
		// Blanche, insécable comprise (construite par son code : pas de caractère littéral).
		expect(manquants([avec(`  ${String.fromCharCode(0x00a0)} `, ['ce2'])])).toHaveLength(1);
		expect(manquants([avec('Écris la forme correcte.', ['ce2'])])).toHaveLength(1);
		// Forme fonction muette à UN niveau : seul ce niveau est signalé, et nommé.
		const cm1Muet = avec((n) => (n === 'cm1' ? undefined : 'Conjugue le verbe.'), ['ce2', 'cm1']);
		expect(manquants([cm1Muet])).toEqual([`${base.id} @cm1 : aucune consigne`]);
		// Une liste de niveaux vide est lue comme CE2, pas comme « rien à vérifier ».
		expect(manquants([avec(undefined, [])])).toEqual([`${base.id} @ce2 : aucune consigne`]);
		// Témoins qui ne doivent PAS être signalés : une vraie consigne, chaîne ou fonction.
		expect(manquants([avec('Conjugue le verbe au temps demandé.', ['ce2', 'cm1'])])).toEqual([]);
		expect(manquants([avec((n) => `Consigne ${n ?? ''}.`, ['ce2', 'cm1'])])).toEqual([]);
	});
});
