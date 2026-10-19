/* ============================================================
   Révision espacée — FORME de la question servie pour une leçon due (#770).
   Extrait de `ui/revision.ts` pour être testable sans DOM : c'est ici que se
   décide, tirage après tirage, si une leçon revient en QCM, en tuiles, en
   widget riche ou en saisie. Le rendu, lui, reste dans `ui/revision.ts`, qui
   n'ajoute que ce qui dépend de la séance (catégorie, libellé, niveau stocké).
   ============================================================ */
import { genLessonItem, answerEstNumerique } from './catalog';
import type { LessonDef, SchoolLevel } from './catalog';
import { hasMode, depuisTuilesNombre, consignePourNiveau } from './exercise';
import type {
	ChoiceView,
	QcmVariante,
	TuilesSpec,
	ProblemeEtape,
	ProbLexique,
	NatureOrdre,
	ColonneDroiteAppariement,
} from './exercise';
import type { Item } from './items';
import type { SafeHtml } from './html';

// `consigneAction` (#265, cas `num`/posé) : consigne d'ACTION du type d'exercice
// (ExerciseType.consigne, ex. « Pose l'addition et calcule. »), propagée du repli
// fiche jusqu'en révision — indispensable à la posée, qui n'a pas d'énoncé textuel.
export type QuestionRevision = { lessonId: string } & (
	| { kind: 'num'; item: Item; consigneAction?: string }
	| {
			kind: 'qcm';
			item: Item;
			choices: string[];
			// Affichage RICHE optionnel des choix (#200), aligné par index sur `choices` :
			// fractions empilées (« 2/4 » → barre horizontale), etc. — comme la leçon (#264).
			choicesView?: ChoiceView[];
			variante?: QcmVariante;
			// Consigne renforcée + picto de la leçon (#203), propagés jusqu'en révision (#265).
			// `consigne` (commun au RevItem) porte le LIBELLÉ de leçon ; ces deux champs portent
			// l'ACTION (« Quel mot veut dire le contraire ? » + « ↔ »), affichée au-dessus de
			// l'énoncé comme dans le runner leçon (lecon-qcm.ts).
			consigneRenforcee?: string;
			picto?: string;
	  }
	// Interactions « tuiles » rejouées telles quelles en révision (#186), sans clavier. Les
	// champs venant de l'exercice sont pris en bloc via `TuilesSpec` (énoncé, bonne tuile,
	// tuiles, texte lu, et l'`intervalle` d'une intercalation) : les énumérer ici avait
	// justement fait oublier l'intervalle (#446), donc un verdict « LA bonne réponse : 4 002 »
	// et un journal à nombre isolé là où une BANDE était acceptée.
	| ({ kind: 'tuile' } & TuilesSpec)
	| {
			kind: 'ordre';
			question: string;
			ordre: string[];
			tuiles: string[];
			nature?: NatureOrdre; // mots (défaut) ou nombres (#448) — formulation du widget
	  }
	| {
			kind: 'tri';
			question: string;
			categories: [string, string];
			mots: { mot: string; cat: 0 | 1 }[];
	  }
	// Moteurs « riches » rejoués tels quels en révision (#466), au lieu du repli champ
	// texte dégradé : le vrai widget interactif est monté, comme les tuiles/ordre/tri.
	| {
			kind: 'appariement';
			question: string;
			paires: { gauche: string; droite: string }[];
			intrus: string[];
			// Mots ou ÉTIQUETTES à droite (#731) : seule l'aide contextuelle en dépend, mais
			// elle en dépend ici comme en leçon — la révision monte le même widget.
			colonneDroite?: ColonneDroiteAppariement;
	  }
	// Problème : board complet (énoncé + TOUTES les sous-questions + brouillon), corrigé
	// étape par étape — perdre les étapes intermédiaires ou le brouillon dénaturait la
	// tâche « résoudre à étapes » (#466). `lex` porte le lexique d'affichage de la leçon.
	| {
			kind: 'probleme';
			enonce: string;
			etapes: ProblemeEtape[];
			parle: string;
			figure?: SafeHtml;
			explication?: string;
			lex?: ProbLexique;
	  }
	// « Clique sur le mot » : le vrai widget de sélection dans la phrase, monté via le
	// widget mutualisé — supprime le bruit orthographique de la recopie et gère les
	// consignes multi-mots sans ambiguïté (#466).
	| {
			kind: 'clicMot';
			// Consigne d'ACTION propre à l'exercice (« Clique sur le verbe conjugué »),
			// distincte du libellé de leçon porté par `consigne` (commun au RevItem).
			actionConsigne: string;
			tokens: string[];
			cibleIndices: number[];
			explication: string;
			parle: string;
			cibleLabel?: string;
			// L'explication nomme déjà la cible (#436) → pas de double annonce en live region.
			explicationNommeCible?: boolean;
			// La cible est un SEGMENT à délimiter (#716) : la révision monte alors le widget
			// à deux bornes, comme la leçon. Sans ce report, l'enfant réviserait la notion
			// avec un GESTE qu'il n'a jamais joué — et pourrait y cocher des mots épars, ce
			// que la leçon lui interdit précisément.
			segment?: boolean;
	  }
);

/* Tire UNE question de révision pour `lesson`, au niveau `level` (déjà résolu par
   l'appelant : niveau effectif, ou niveau d'entretien #232). `null` : rien à servir
   (type QCM dont le tirage ne rend pas de QCM — l'élément n'est alors pas empilé). */
export function questionDeRevision(lesson: LessonDef, level: SchoolLevel): QuestionRevision | null {
	const lessonId = lesson.id;
	const type = lesson.exerciseType;
	// QCM (conjugaison, homophones, géométrie…) : inchangé.
	if (hasMode(type, 'qcm')) {
		const ex = type.generate({ mode: 'qcm', level });
		if (ex.type === 'qcm')
			return {
				kind: 'qcm',
				lessonId,
				item: {
					text: ex.question,
					answer: ex.answer,
					kind: 'text',
					figure: ex.figure,
					parle: ex.parle,
				},
				choices: ex.choices,
				choicesView: ex.choicesView,
				variante: ex.variante,
				consigneRenforcee: ex.consigne,
				picto: ex.picto,
			};
		return null;
	}
	// Interactions « tuiles » natives, rejouées telles quelles en révision (#186) :
	// ranger une suite (ordre alpha) et ranger par thème (champs lexicaux).
	const ex = type.generate({ level });
	if (ex.type === 'tuilesOrdre')
		return {
			kind: 'ordre',
			lessonId,
			question: ex.question,
			ordre: ex.ordre,
			tuiles: ex.tuiles,
			nature: ex.nature,
		};
	if (ex.type === 'tuilesTri')
		return {
			kind: 'tri',
			lessonId,
			question: ex.question,
			categories: ex.categories,
			mots: ex.mots,
		};
	// Moteurs « riches » : rejoués tels quels (widget interactif) plutôt que dégradés
	// en champ texte via genLessonItem (#466).
	if (ex.type === 'appariement')
		return {
			kind: 'appariement',
			lessonId,
			question: ex.question,
			paires: ex.paires,
			intrus: ex.intrus ?? [],
			colonneDroite: ex.colonneDroite,
		};
	if (ex.type === 'probleme')
		return {
			kind: 'probleme',
			lessonId,
			enonce: ex.enonce,
			etapes: ex.etapes,
			parle: ex.parle,
			figure: ex.figure,
			explication: ex.explication,
			lex: type.probLexique,
		};
	if (ex.type === 'clicMot')
		return {
			kind: 'clicMot',
			lessonId,
			actionConsigne: ex.consigne,
			tokens: ex.tokens,
			cibleIndices: ex.cibleIndices,
			explication: ex.explication,
			parle: ex.parle,
			cibleLabel: ex.cibleLabel,
			explicationNommeCible: ex.explicationNommeCible,
			segment: ex.segment,
		};
	// Réponse non numérique (signe <, =, >) + mode tuiles disponible → on rejoue en
	// tuiles plutôt qu'en saisie : un signe n'est pas saisissable au clavier numérique
	// sur mobile (#186).
	if (ex.type === 'text' && !answerEstNumerique(String(ex.answer)) && hasMode(type, 'tuiles')) {
		const tex = type.generate({ mode: 'tuiles', level });
		if (tex.type === 'tuilesNombre')
			return {
				kind: 'tuile',
				lessonId,
				// Conversion partagée (#446) : tout ce que porte l'exercice arrive ici, y
				// compris la bande d'une intercalation (verdict + journal). Pas de recopie.
				...depuisTuilesNombre(tex),
			};
	}
	// Repli saisie (num / texte / heure / posé) : genLessonItem gère figure, heure et
	// l'opération posée.
	return {
		kind: 'num',
		lessonId,
		item: genLessonItem(lesson, level),
		// Action « quoi faire » (#265) ; surtout pour la posée. Résolue au niveau joué
		// (#436) : une leçon multi-niveaux ne formule pas forcément la tâche pareil.
		consigneAction: consignePourNiveau(type, level),
	};
}
