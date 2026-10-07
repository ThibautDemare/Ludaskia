/* ============================================================
   Capture d'erreur pour le journal encadrant (#391) — point d'entrée UNIQUE
   appelé par les runners au moment de la correction.
   ------------------------------------------------------------
   Les runners (fiche en saisie, QCM, dictée…) corrigent chacun à leur façon,
   mais journalisent une erreur EXACTEMENT de la même manière : on centralise ici
   la mise en forme (énoncé lisible, marqueur de figure) et la délégation à
   `core/erreurs-journal`, pour ne pas réécrire la capture dans chaque runner.

   Sert aussi de porte d'entrée au marqueur « passé sans essayer » (#467,
   `sansTentative`) : « Je ne sais pas, montre-moi » journalise par ici, comme une erreur,
   mais signalée comme telle.

   « Validation à vide » DÉPEND du chemin, et la nuance vaut d'être écrite : le sprint la
   journalise (`ui/sprint.ts`, phrase dédiée « a validé sans répondre » côté encadrant) parce
   que le chrono tourne — valider à vide y est un renoncement assumé. En orthographe, c'est
   un mis-clic : depuis le lot de suite de #640, un clic « Vérifier » sans rien de posé ne
   coûte pas l'essai et le dit à l'enfant, donc il n'y a rien à raconter au parent.

   Ne journalise QUE des erreurs rattachées à une leçon et à un énoncé lisible :
   une entrée sans leçon (ex. calcul mental non rattaché) ou sans question
   affichable (ex. cellule d'opération posée, énoncé vide) est ignorée — rien à
   regrouper ni à montrer au parent.
   ============================================================ */
import { journaliserErreur } from '../core/erreurs-journal';
import { questionPourJournal } from '../core/erreur-representation';
import { type SafeHtml } from '../core/html';

/* Mise en forme de l'énoncé et des choix : partagée avec la séance partagée (#734), donc
   logée dans le cœur pur (`core/erreur-representation.ts`) et réexportée d'ici pour les
   runners. */
export { libelleChoix, questionPourJournal } from '../core/erreur-representation';

export interface CaptureErreurOpts {
	text: string; // énoncé BRUT de l'item (peut contenir '@')
	figure?: SafeHtml; // fragment SVG éventuel → marqueur « exercice avec dessin »
	donnee: string; // réponse donnée (déjà lisible : libellé de choix pour un QCM)
	attendue: string; // réponse attendue (déjà lisible)
	lessonId: string | null; // leçon rattachée ; null → non journalisé
	mode: string; // mode d'entraînement ('lecon' | 'express' | 'complet' | 'sprint' | 'dictee'…)
	/* AUCUNE tentative (#467) : « Je ne sais pas, montre-moi » ou validation à vide.
	   Booléen (et non `true` seul) pour que l'appelant puisse passer directement son
	   drapeau ; `capterErreur` normalise et ne journalise le marqueur que s'il est
	   vrai. Un item passé n'a pas de réponse donnée : passer `donnee: ''`. */
	sansTentative?: boolean;
}

/* Journalise une erreur depuis un runner (profil actif). Sans-effet si la leçon
   ou l'énoncé manquent. Idempotence « une fois par essai » : à la charge de
   l'appelant (les runners corrigent une réponse une seule fois). */
export function capterErreur(opts: CaptureErreurOpts): void {
	if (!opts.lessonId) return;
	const question = questionPourJournal(opts.text, !!opts.figure?.balisage);
	if (!question) return;
	journaliserErreur({
		lessonId: opts.lessonId,
		mode: opts.mode,
		question,
		donnee: opts.donnee,
		attendue: opts.attendue,
		// Marqueur écrit seulement s'il est vrai (`undefined` disparaît du JSON stocké) :
		// absent ⇒ tentative faite, cf. ErreurEntry.sansTentative.
		sansTentative: opts.sansTentative ? true : undefined,
	});
}
