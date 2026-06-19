/* ============================================================
   Combinateurs multi-niveaux (#225) — fonctionnels, sans classe.
   Deux façons de rendre une notion multi-niveaux :
   - `calibrated` : UN id recalibré par une table de paramètres par niveau
     (génératif sans items : numération, conversions, calcul mental…) ;
   - `bankByLevel` : banque d'items tagués chacun par niveau (QCM : vocabulaire,
     grammaire, homophones…), dont on dérive l'ensemble des niveaux couverts.
   ============================================================ */
import type { ExerciseType, GenerateOpts } from './exercise';
import type { SchoolLevel } from './catalog';
import { LEVEL_ORDER, closestSupported } from './levels';

/* Recalibre une notion par niveau : `table` mappe niveau → paramètres, `build`
   fabrique l'ExerciseType pour un jeu de paramètres. L'ExerciseType renvoyé lit
   `generate({ level })` et délègue au type du niveau le plus proche supporté
   (repli/clamp via closestSupported). `levels` (clés de la table) est exposé pour
   que le catalogue en dérive `LessonDef.levels`. Métadonnées invariantes (modes,
   consigne, probLexique, check) prises sur le plus bas niveau. */
export function calibrated<P>(
	table: Partial<Record<SchoolLevel, P>>,
	build: (params: P) => ExerciseType,
): ExerciseType {
	const levels = LEVEL_ORDER.filter((l) => table[l] !== undefined);
	const cache = new Map<SchoolLevel, ExerciseType>();
	const typePour = (niveau?: SchoolLevel): ExerciseType => {
		const lvl = closestSupported(levels, niveau ?? levels[0]);
		let t = cache.get(lvl);
		if (!t) {
			t = build(table[lvl] as P);
			cache.set(lvl, t);
		}
		return t;
	};
	const base = typePour(levels[0]);
	return {
		levels,
		modes: base.modes,
		consigne: base.consigne,
		probLexique: base.probLexique,
		generate(opts?: GenerateOpts) {
			return typePour(opts?.level).generate(opts);
		},
		check: base.check,
	};
}

/* Banque d'items tagués par niveau. Expose l'union des niveaux couverts (`levels`,
   pour dériver `LessonDef.levels`) et `at(niveau)` = items disponibles à ce niveau
   (appartenance stricte ; le tirage aléatoire reste au choix de l'appelant). */
export function bankByLevel<I extends { levels: SchoolLevel[] }>(items: I[]) {
	const set = new Set<SchoolLevel>();
	for (const it of items) for (const l of it.levels) set.add(l);
	const levels = LEVEL_ORDER.filter((l) => set.has(l));
	return {
		levels,
		at(niveau: SchoolLevel): I[] {
			return items.filter((it) => it.levels.includes(niveau));
		},
	};
}
