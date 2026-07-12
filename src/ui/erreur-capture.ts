/* ============================================================
   Capture d'erreur pour le journal encadrant (#391) — point d'entrée UNIQUE
   appelé par les runners au moment de la correction.
   ------------------------------------------------------------
   Les runners (fiche en saisie, QCM, dictée…) corrigent chacun à leur façon,
   mais journalisent une erreur EXACTEMENT de la même manière : on centralise ici
   la mise en forme (énoncé lisible, marqueur de figure) et la délégation à
   `core/erreurs-journal`, pour ne pas réécrire la capture dans chaque runner.

   Ne journalise QUE des erreurs rattachées à une leçon et à un énoncé lisible :
   une entrée sans leçon (ex. calcul mental non rattaché) ou sans question
   affichable (ex. cellule d'opération posée, énoncé vide) est ignorée — rien à
   regrouper ni à montrer au parent.
   ============================================================ */
import { journaliserErreur } from '../core/erreurs-journal';
import type { ChoiceView } from '../core/exercise';

/* Suffixe signalant qu'un énoncé s'appuie sur un dessin : hors de l'appli, la
   question textuelle seule (« Quelle heure est-il ? ») serait énigmatique — on
   invite alors à refaire l'exercice ensemble (avis designer). */
const MARQUEUR_FIGURE = ' (exercice avec dessin)';

/* Énoncé lisible pour le journal : l'emplacement de réponse `@` devient « … »
   (une question, pas un gabarit à trou), et une figure est signalée. Renvoie ''
   si rien d'affichable (énoncé vide sans figure → l'appelant n'enregistre pas). */
export function questionPourJournal(text: string, hasFigure = false): string {
	const t = text.replace(/@/g, '…').replace(/\s+/g, ' ').trim();
	if (!t) return hasFigure ? 'Exercice avec un dessin' : '';
	return hasFigure ? t + MARQUEUR_FIGURE : t;
}

/* Libellé LISIBLE d'un choix de QCM pour le journal : la vue riche (#200) si elle
   existe (fraction empilée, symbole de ponctuation…), sinon la valeur brute (déjà
   lisible en QCM texte). `valeur` sert à retrouver l'index dans `choices` (aligné
   sur `choicesView`) ; les choix d'un QCM étant distincts, `indexOf` est fiable.
   Fallback sur `valeur` si le choix est introuvable (jamais en pratique). */
export function libelleChoix(
	choices: string[],
	choicesView: ChoiceView[] | undefined,
	valeur: string,
): string {
	return choicesView?.[choices.indexOf(valeur)]?.label ?? valeur;
}

export interface CaptureErreurOpts {
	text: string; // énoncé BRUT de l'item (peut contenir '@')
	figure?: string; // fragment SVG éventuel → marqueur « exercice avec dessin »
	donnee: string; // réponse donnée (déjà lisible : libellé de choix pour un QCM)
	attendue: string; // réponse attendue (déjà lisible)
	lessonId: string | null; // leçon rattachée ; null → non journalisé
	mode: string; // mode d'entraînement ('lecon' | 'express' | 'complet' | 'sprint' | 'dictee'…)
}

/* Journalise une erreur depuis un runner (profil actif). Sans-effet si la leçon
   ou l'énoncé manquent. Idempotence « une fois par essai » : à la charge de
   l'appelant (les runners corrigent une réponse une seule fois). */
export function capterErreur(opts: CaptureErreurOpts): void {
	if (!opts.lessonId) return;
	const question = questionPourJournal(opts.text, !!opts.figure);
	if (!question) return;
	journaliserErreur({
		lessonId: opts.lessonId,
		mode: opts.mode,
		question,
		donnee: opts.donnee,
		attendue: opts.attendue,
	});
}
