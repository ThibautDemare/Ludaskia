/* ============================================================
   Origine de lancement d'une activité (#461).
   ------------------------------------------------------------
   Une leçon (ou une dictée) se lance depuis le CATALOGUE (catégories, cartes
   d'accueil) ou depuis le PROGRAMME du jour (écran `#seance`). À la fin, le
   bouton « Retour » doit ramener là d'où l'enfant vient — or les déclencheurs ne
   font que changer `location.hash`, qui ne porte pas cette provenance (et
   `#lecon-N` reste une URL partageable / rechargeable).

   On mémorise donc l'origine ici, en état de module : posée par CHAQUE
   déclencheur d'activité (`startLecon` / `startOrthoLecon` / reprise), relue par
   l'écran de fin. L'invariant « chaque lancement pose son origine » évite qu'un
   lancement suivant hérite de la provenance du précédent.

   Volontairement NON persistée : au chargement de la page (rechargement, accès direct
   à `#lecon-N`) on repart du catalogue, comportement historique.

   L'origine est posée avec la CLÉ de l'activité lancée, et l'écran qui démarre
   réellement l'activité l'annonce (`activiteDemarree`). Sans cela, un retour par le
   bouton Précédent sur l'entrée d'historique d'une activité lancée PLUS TÔT (le routeur
   la rejoue sans repasser par un déclencheur) hériterait de l'origine du DERNIER
   lancement, et son bouton de fin annoncerait la mauvaise destination. Clé qui ne
   correspond pas ⇒ la provenance n'est pas la nôtre ⇒ retour à la valeur sûre
   « catalogue ».

   Le bouton « Quitter » (accueil) n'est PAS concerné : il garde sa destination,
   et l'accueil re-rend la carte du programme.
   ============================================================ */

/** D'où l'activité en cours a-t-elle été lancée ? */
export type OrigineActivite = 'catalogue' | 'programme';

let origine: OrigineActivite = 'catalogue';
// Clé (id de leçon / de liste) de l'activité que le dernier lancement a visée. Sert à
// n'accorder l'origine qu'à CETTE activité — cf. `activiteDemarree`.
let cleLancee: string | null = null;

/** Pose l'origine du lancement en cours (appelé par les déclencheurs d'activité).
    `cle` = id de l'activité visée ; l'omettre (reprise) laisse l'origine sans clé, donc
    sans effet possible sur une activité future. */
export function setOrigineActivite(o: OrigineActivite, cle: string | null = null): void {
	origine = o;
	cleLancee = cle;
}

/** Annonce que l'activité `cle` DÉMARRE (appelé par `runLecon` / `startOrthoRun` /
    la page de relecture, seuls à connaître l'activité réellement rendue). Si ce n'est pas
    celle que le dernier lancement a posée, on a été rejoué par l'historique et non par un
    déclencheur : la provenance n'est pas la nôtre → valeur sûre « catalogue ». Idempotent
    (relancer la même activité — « Recommencer » — conserve son origine). */
export function activiteDemarree(cle: string): void {
	if (cle === cleLancee) return;
	origine = 'catalogue';
	cleLancee = cle;
}

/** Origine du lancement en cours (sert à la propager, ex. écran de choix de mode). */
export function origineActivite(): OrigineActivite {
	return origine;
}

/** Destination du bouton « Retour » d'un écran de fin d'activité. */
export interface RetourCible {
	label: string;
	aller: () => void;
}

/* Retour au programme du jour : même route que `startSeance` (navigation.ts),
   réécrite ici pour garder ce module sans dépendance (donc testable seul). Si plus
   aucun programme ne s'applique (minuit passé pendant la leçon), `showSeanceView`
   rend la main à l'accueil — pas d'écran cul-de-sac. */
function allerAuProgramme(): void {
	location.hash = 'seance';
}

/** Cible du bouton « Retour » de fin d'activité : le PROGRAMME du jour quand
    l'activité en vient (#461), sinon la cible « catalogue » de l'appelant (catégorie
    de la leçon, orthographe…). `labelProgramme` permet à un écran de garder un
    libellé qui lui est propre (bouton d'arrêt d'une pause de dictée). */
export function retourFinActivite(
	catalogue: RetourCible,
	labelProgramme = 'Retour au programme',
): RetourCible & { versProgramme: boolean } {
	if (origine !== 'programme') return { ...catalogue, versProgramme: false };
	return { label: labelProgramme, aller: allerAuProgramme, versProgramme: true };
}
