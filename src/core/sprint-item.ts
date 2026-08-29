/* ============================================================
   La question d'un sprint (#630) — génération pure, hors DOM.

   Extrait de `ui/sprint.ts` : le mode décide, pour une leçon tirée, s'il la pose
   en QCM (leçons dont l'ExerciseType propose ce mode — sous chrono, la frappe au
   clavier pénaliserait la vitesse, cf. #54) ou en saisie, et il fabrique lui-même
   l'`Item` correspondant. Cette décision est de la LOGIQUE : elle n'a besoin
   d'aucun élément d'écran, et le gate du texte parlé (tests/sprint-tts-gate.test.ts)
   doit pouvoir interroger EXACTEMENT la question que verra l'enfant. La recopier
   dans le test aurait produit un gate qui garde une autre application que la vraie.
   ============================================================ */
import { genLessonItem } from './catalog';
import type { LessonDef, SchoolLevel } from './catalog';
import { hasMode } from './exercise';
import type { ChoiceView } from './exercise';
import { estSigneComparaison, SIGNES_COMPARAISON, signeView } from './signes';
import type { Item } from './items';

export interface SprintQuestion {
	q: Item;
	/** Non nul ⇒ la question se joue en boutons de choix (un tap vaut réponse). */
	choices: string[] | null;
	choicesView?: ChoiceView[];
	/** Choix-symboles « < = > » (#380) : présentation glyphe + mot. */
	sym: boolean;
}

/** Génère UNE question de sprint pour la leçon donnée, au niveau demandé. `level`
 *  est EXIGÉ : un défaut qui serait allé le chercher dans le profil actif aurait
 *  rendu ce module dépendant du `localStorage` alors qu'il s'annonce pur, et un
 *  appelant distrait aurait tiré au niveau de quelqu'un d'autre sans s'en rendre
 *  compte. L'appelant du sprint passe `niveauLecon(def)`. */
export function genSprintQuestion(def: LessonDef, level: SchoolLevel): SprintQuestion {
	if (hasMode(def.exerciseType, 'qcm')) {
		const ex = def.exerciseType.generate({ mode: 'qcm', level });
		const qcm = ex.type === 'qcm' ? ex : null;
		return {
			q: {
				text: qcm?.question ?? '',
				answer: qcm?.answer ?? '',
				kind: 'text',
				figure: qcm?.figure,
				// Version pour l'OREILLE de l'énoncé, reportée depuis l'exercice. Sans
				// elle, un énoncé délibérément muet (`parle: ''`, leçons d'homophones)
				// redeviendrait lisible à voix haute par la seule bande passante du
				// sprint, et le bouton « Écouter » trahirait la réponse.
				parle: qcm?.parle,
				_lesson: def.id,
			},
			choices: qcm?.choices ?? null,
			choicesView: qcm?.choicesView,
			sym: false,
		};
	}
	const q = genLessonItem(def, level); // aiguille math (bilanQ) ; pose _lesson
	// Réponse = signe de comparaison (#380) : posée en QCM à trois choix (tap direct,
	// chemin déjà câblé) plutôt qu'en saisie — le clavier virtuel n'expose pas
	// « < = > », et sous chrono le QCM valide au tap sans bouton « Valider ». Même
	// ordre figé que les tuiles et le pavé de la fiche.
	if (q.kind === 'text' && estSigneComparaison(q.answer))
		return {
			q,
			choices: [...SIGNES_COMPARAISON],
			choicesView: SIGNES_COMPARAISON.map(signeView),
			sym: true,
		};
	return { q, choices: null, sym: false };
}
