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
import { choice } from './utils';

/* Recalibre une notion par niveau : `table` mappe niveau → paramètres, `build`
   fabrique l'ExerciseType pour un jeu de paramètres. L'ExerciseType renvoyé lit
   `generate({ level })` et délègue au type du niveau le plus proche supporté
   (repli/clamp via closestSupported). `levels` (clés de la table) est exposé pour
   que le catalogue en dérive `LessonDef.levels`.

   Les métadonnées invariantes sont ÉTALÉES depuis le plus bas niveau (`...base`), jamais
   réénumérées champ par champ : un champ ajouté à `ExerciseType` traverse donc la
   recalibration tout seul. Cette énumération était un piège réel (#447) — `exerciseKind`
   y manquait, or c'est lui qui dit au catalogue qu'une leçon se joue dans un runner
   d'écran dédié (`isDroiteGradueeLesson`, `isPosedLesson`…) : la perdre en recalibrant
   une leçon la faisait silencieusement retomber dans le sprint « une réponse à la fois »,
   qui ne sait pas rendre son format.

   Les DEUX points d'entrée génératifs, eux, doivent déléguer par niveau et non venir de
   `base` : `base` est construit avec les paramètres du plus bas niveau, donc un
   `generateSession` étalé tel quel resterait figé sur ce niveau — un CM1 recevrait des
   exercices CE2. `build` étant la même fabrique pour tous les niveaux, la présence de
   `generateSession` sur `base` vaut pour tous : la tester sur `base` suffit.

   CONTRAINTE sur `check`, qui ne peut PAS être déléguée : sa signature `(exercise, input)` ne
   porte pas le niveau, donc elle vient forcément de `base`, c'est-à-dire du plus bas niveau.
   Une fabrique passée à `calibrated` doit donc avoir un `check` INDÉPENDANT du niveau (tout
   ce qui varie doit voyager dans l'`Exercise`, que `check` reçoit). Une correction qui
   fermerait sur les paramètres de niveau (tolérance, plage acceptée) corrigerait
   silencieusement le CM1 avec les règles du CE2 — même classe de piège que ci-dessus, mais
   qui ne se répare pas ici : elle demanderait de passer le niveau à `check`.

   Corollaire pour toute métadonnée qui doit VARIER par niveau (#436) : elle ne peut pas être
   une valeur figée ici, puisque l'étalement de `base` prendrait celle du plus bas niveau.
   D'où la FORME FONCTION de la consigne de fiche (`ConsigneFiche`, core/exercise.ts) :
   `build()` la renvoie, elle traverse l'étalement telle quelle, et c'est le LECTEUR qui la
   résout avec son niveau (`consignePourNiveau`). Une consigne fonction doit donc dériver du
   niveau REÇU EN ARGUMENT, jamais des `params` capturés à la construction — c'est la même
   contrainte que sur `check`, mais celle-ci, la forme fonction sait la satisfaire. */
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
		...base,
		levels,
		generate(opts?: GenerateOpts) {
			return typePour(opts?.level).generate(opts);
		},
		...(base.generateSession
			? {
					generateSession(count: number, opts?: GenerateOpts) {
						return typePour(opts?.level).generateSession!(count, opts);
					},
				}
			: {}),
	};
}

/* Banque d'items tagués par niveau. Expose l'union des niveaux couverts (`levels`,
   pour dériver `LessonDef.levels`) et `at(niveau)` = items disponibles à ce niveau
   (appartenance stricte ; le tirage aléatoire reste au choix de l'appelant). */
export interface LevelBank<I> {
	levels: SchoolLevel[];
	at(niveau: SchoolLevel): I[];
}

export function bankByLevel<I extends { levels: SchoolLevel[] }>(items: I[]): LevelBank<I> {
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

/* Tire un item d'une banque pour le niveau demandé. Replie sur le niveau supporté le
   plus proche via `closestSupported` — MÊME invariant que `calibrated` (et que la
   résolution `effectiveLevel` faite en amont), plutôt qu'un repli ad hoc sur le plus bas
   niveau. Sans niveau demandé, part du plus bas niveau couvert. Centralise le repli pour
   toutes les banques : à utiliser dans le `generate` d'un ExerciseType sur banque. */
export function pickFromBank<I extends { levels: SchoolLevel[] }>(
	bank: LevelBank<I>,
	niveau?: SchoolLevel,
): I {
	return choice(bank.at(closestSupported(bank.levels, niveau ?? bank.levels[0])));
}
