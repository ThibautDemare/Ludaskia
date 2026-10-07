/* ============================================================
   Séance partagée (#734) — TIRAGE des exercices d'un envoi, à la création.

   Le tirage a lieu une fois, chez l'encadrant ; le lien porte le résultat du
   tirage, jamais de quoi le refaire. Le niveau est TOUJOURS explicite (critère 1) :
   il ne dépend pas du profil actif de l'encadrant.
   ============================================================ */
import type { LessonDef, SchoolLevel } from '../catalog';
import type { Exercise, ExerciseMode } from '../exercise';

/** Forme canonique d'une valeur : clés d'objet TRIÉES à chaque niveau, champs `undefined`
 *  écartés, ordre des tableaux conservé. `JSON.stringify` seul dépend de l'ordre
 *  d'insertion des clés : une fabrique qui construit le même exercice par deux chemins
 *  aurait servi deux fois la même question (trouvé par l'auteur des tests). */
function canonique(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(canonique);
	if (v === null || typeof v !== 'object') return v;
	const obj = v as Record<string, unknown>;
	return Object.fromEntries(
		Object.keys(obj)
			.filter((k) => obj[k] !== undefined)
			.sort()
			.map((k) => [k, canonique(obj[k])]),
	);
}

/** Clé de déduplication : l'exercice entier, figure comprise (le balisage d'un
 *  `SafeHtml` en fait partie). Deux tirages qui ne diffèrent que par l'ordre des
 *  choix sont donc deux exercices — c'est déjà ce que voit l'enfant. */
const cle = (ex: Exercise): string => JSON.stringify(canonique(ex));

/** Tire jusqu'à `n` exercices DISTINCTS d'une leçon, au niveau et dans le mode donnés.
 *  Moins de `n` si la leçon n'a pas assez de variantes — une question répétée à
 *  l'identique n'apprend rien (même règle que `genItems`). Une fabrique qui sait tirer
 *  une session entière (`generateSession`) la tire d'un coup : elle seule garantit les
 *  propriétés globales de la série (pas de répétition d'une manche à l'autre, paliers). */
export function tirerExercices(
	lesson: LessonDef,
	n: number,
	niveau: SchoolLevel,
	mode?: ExerciseMode,
): Exercise[] {
	const opts = { level: niveau, mode };
	const vus = new Set<string>();
	const garder = (ex: Exercise): boolean => {
		const k = cle(ex);
		if (vus.has(k)) return false;
		vus.add(k);
		return true;
	};
	const session = lesson.exerciseType.generateSession?.(n, opts);
	if (session) return session.filter(garder).slice(0, n);
	const exercices: Exercise[] = [];
	let rates = 0;
	while (exercices.length < n && rates < 80) {
		const ex = lesson.exerciseType.generate(opts);
		if (garder(ex)) {
			exercices.push(ex);
			rates = 0;
		} else rates++;
	}
	return exercices;
}
