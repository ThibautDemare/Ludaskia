/* ============================================================
   Numération — lire et écrire les nombres en chiffres romains (#717, CM1).

   Une leçon de NUMÉRATION, pas un ancrage historique : ni siècles, ni frise (écartés
   par le mainteneur), ni calcul en chiffres romains (ça n'existe pas dans l'usage
   réel). Deux sens, tous deux en SAISIE — c'est la production qui prouve que la règle
   est comprise, là où un QCM se réussit en reconnaissant une forme déjà vue :
   - `ecrire` : le nombre est donné en chiffres arabes, l'enfant écrit l'écriture romaine ;
   - `lire`   : l'écriture romaine est donnée, l'enfant écrit le nombre.

   Le SYSTÈME lui-même (conversion, forme canonique, règle enfreinte, paliers) vit dans
   `core/chiffres-romains.ts` : la correction et le feedback d'erreur en dépendent aussi,
   et ils n'ont pas à traverser un module de données pour y accéder.

   Risque pédagogique signalé dans l'issue, et traité ici plutôt que laissé implicite :
   le CM1 est l'année où la valeur de position en base 10 se consolide. Un second système
   symbolique NON POSITIONNEL glissé dans la série sans être nommé comme tel brouillerait
   le premier. La consigne de fiche et l'étayage le disent donc en toutes lettres.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import { checkNumerique } from '../../core/check-helpers';
import {
	enRomain,
	normaliserRomain,
	progressionPaliers,
	tirerNombreRomain,
	tirerPalierRomain,
	type PalierRomain,
} from '../../core/chiffres-romains';
import { etayageRedige, type LessonInput } from '../_shared';

/** Les deux sens de la notion (#69). « J'écris en chiffres romains » est le mode
    conseillé : c'est celui qui oblige à APPLIQUER la règle (décomposer le nombre, choisir
    les signes) ; la lecture, elle, se laisse reconstituer en additionnant ce qu'on voit. */
const MODES: ModeOption[] = [
	{ id: 'ecrire', label: "J'écris en chiffres romains", icon: 'pencil', recommended: true },
	{ id: 'lire', label: 'Je lis un nombre romain', icon: 'eye' },
];

const MODE_ECRIRE = 'ecrire';

/** Consigne de fiche : elle NOMME la tâche et, surtout, pose le cadre du critère 6 de
    l'issue. Elle est commune aux deux modes (la consigne se décline par niveau, pas par
    mode) ; c'est l'énoncé de chaque question qui dit dans quel sens on travaille. */
const CONSIGNE =
	'Écris ce que la question demande. Les chiffres romains ne marchent pas comme nos ' +
	"nombres : la place d'un signe ne change jamais sa valeur. On additionne les signes, " +
	"sauf dans quelques cas où l'on retire un petit signe placé devant un grand.";

/** Un item, dans le sens demandé. `@` place le champ de saisie.

    La réponse est STOCKÉE, jamais recalculée à la correction : `enRomain` n'est appelé
    qu'ici, à la génération, et `check` se contente de comparer. */
function exercice(n: number, mode: string): Exercise {
	const romain = enRomain(n);
	if (mode === MODE_ECRIRE) {
		return {
			type: 'text',
			question: `Écris ${n} en chiffres romains : @`,
			answer: romain,
			champRomain: true,
		};
	}
	return {
		type: 'text',
		question: `Écris ${romain} en chiffres arabes : @`,
		answer: String(n),
		// Lu SIGNE PAR SIGNE (#42) : « XLVII » prononcé tel quel par une voix française ne
		// donne rien d'audible, et le lire « quarante-sept » soufflerait la réponse. On
		// épelle donc, ce qui laisse tout le travail de lecture à l'enfant.
		parle: `Écris en chiffres arabes le nombre romain ${romain.split('').join(' ')}.`,
	};
}

/* Mode effectif : le mode par défaut de ce type est « ecrire », et c'est lui qui sert
   quand l'appelant n'en passe pas (fiche, bilan, révision, impression). */
const modeDe = (opts?: GenerateOpts): string => opts?.mode ?? MODE_ECRIRE;

const CHIFFRES_ROMAINS_TYPE: ExerciseType = {
	levels: ['cm1'],
	modes: MODES,
	consigne: CONSIGNE,
	/* Tirage ISOLÉ (un item à la fois : bilan, révision, complément de fiche). Le palier
	   y est tiré selon les poids de la progression — sans ordre à tenir, la graduation ne
	   peut être qu'une fréquence. Volontairement PAS bloqué sur le premier palier : une
	   fiche remplie item par item ne montrerait alors jamais les milliers, et la leçon
	   annoncerait une étendue 1-3999 qu'elle ne sert pas. */
	generate(opts?: GenerateOpts): Exercise {
		return exercice(tirerNombreRomain(tirerPalierRomain()), modeDe(opts));
	},
	/* Série ENTIÈRE (la fiche d'une leçon, un bloc de bilan) : c'est ici que la
	   graduation du critère 4 devient un ORDRE observable — les écritures purement
	   additives, puis les formes soustractives, puis les milliers (`progressionPaliers`).
	   Un `generate()` par question ne saurait pas le faire : il ne connaît pas son rang. */
	generateSession(count: number, opts?: GenerateOpts): Exercise[] {
		const mode = modeDe(opts);
		return progressionPaliers(count).map((palier: PalierRomain) =>
			exercice(tirerNombreRomain(palier), mode),
		);
	},
	/* Correction. En mode « écrire », SEULE la forme canonique passe : on compare à la
	   réponse stockée au lieu de DÉCODER la saisie — décoder accepterait `IIII` pour 4,
	   qui est précisément ce que la leçon apprend à ne plus écrire. La casse est repliée
	   (arbitrage mainteneur, cf. `normaliserRomain`), rien d'autre.
	   En mode « lire », la réponse est un nombre : correction numérique ordinaire. */
	check(exercise: Exercise, input: string): boolean {
		if (exercise.type !== 'text') return false;
		if (!exercise.champRomain) return checkNumerique(exercise, input);
		return normaliserRomain(input) === normaliserRomain(exercise.answer);
	},
};

export const CHIFFRES_ROMAINS_LESSONS: LessonInput[] = [
	{
		id: 'num-chiffres-romains',
		label: 'Les chiffres romains',
		exerciseType: CHIFFRES_ROMAINS_TYPE,
		etayage: [
			etayageRedige(
				'Comment on écrit en chiffres romains ?',
				"Les chiffres romains ne marchent pas comme nos nombres : la place d'un signe ne change pas sa valeur, on additionne les signes écrits.",
				[
					'Découpe le nombre : les milliers, puis les centaines, puis les dizaines, puis les unités.',
					"Écris chaque morceau avec ses signes, du plus grand au plus petit : 47, c'est 40 puis 7, donc XL puis VII.",
					"N'écris jamais quatre fois le même signe : pour 4, 9, 40, 90, 400 et 900, le petit signe passe devant (IV, IX, XL, XC, CD, CM).",
				],
			),
			{
				mode: 'lire',
				contenu: {
					titre: 'Comment on lit un nombre romain ?',
					regle:
						'On lit de gauche à droite et on additionne, sauf quand un petit signe est placé devant un plus grand : là, on retire.',
					etapes: [
						'Repère les six formes qui retirent : IV, IX, XL, XC, CD, CM.',
						"Donne sa valeur à chaque signe ou à chaque forme : MCMXLVII, c'est 1000, puis 900, puis 40, puis 5, puis 1 et 1.",
						'Additionne le tout : tu obtiens 1947.',
					],
				},
			},
		],
	},
];
