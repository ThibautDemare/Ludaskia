/* ============================================================
   Étagère de jeux (#661) — QUAND inviter à jouer (critère 2, révisé le
   2026-09-06 : cf. le commentaire daté sur l'issue, sections 4 et 5).

   L'invitation est une proposition APRÈS COUP, jamais une condition annoncée
   d'avance : l'entrée de l'étagère, elle, est permanente et inconditionnelle.
   C'est cette asymétrie qui empêche le dispositif de retomber dans le péage —
   travailler n'achète pas du temps de jeu, il ouvre de NOUVEAUX jeux.

   La règle a un point de subtilité qui vaut d'être dit : un programme du jour
   ne fait pas APPARAÎTRE une invitation de plus, il la DÉPLACE. Sans ça, un
   enfant qui enchaîne trois étapes de son programme serait invité trois fois,
   et la proposition deviendrait une relance.
   ============================================================ */

export interface ContexteInvitation {
	/** L'encadrant autorise-t-il l'étagère ? */
	etagereActive: boolean;
	/** L'encadrant veut-il qu'on invite ? Subordonné à `etagereActive`. */
	invitationActive: boolean;
	/** Y a-t-il quelque chose à ouvrir : au moins un jeu possédé, OU un choix de
	 *  palier encore dû ?

	 *  Ce n'est PAS « possède un jeu », et la nuance a coûté un bug : un enfant
	 *  qui ferme son tout premier écran de choix possède zéro jeu et a un choix
	 *  en attente. Avec « possède un jeu », l'invitation se taisait — alors que le
	 *  critère 42 interdit tout badge sur l'accueil, donc plus rien ne lui disait
	 *  qu'il avait quelque chose à aller chercher, et ce jusqu'au palier suivant.
	 *  Relevé par `auteur-tests-logique` le 2026-09-07. */
	etagereNonVide: boolean;
	/** Y a-t-il un programme du jour aujourd'hui ? */
	programmeActif: boolean;
	/** L'écran d'où l'on demande. */
	ou: 'programme' | 'ecran';
}

/** Faut-il proposer l'étagère ici et maintenant ? Pur.

    Note sur la forme des entrées : `programmeActif` et `ou` sont partiellement
    redondants — l'état `(programmeActif: false, ou: 'programme')` décrit la fin
    d'un programme qui n'existe pas, donc rien. On le traite comme « non »
    plutôt que d'interdire de le construire, parce que la garantie qui compte
    est ailleurs : **au plus un** emplacement invite dans une journée donnée, y
    compris si un appelant se trompe. Rendre `true` sur un état incohérent
    ouvrirait la porte à la double invitation, exactement ce que le déplacement
    cherche à éviter. */
export function doitInviter(c: ContexteInvitation): boolean {
	// L'accès commande tout : couper l'étagère coupe l'invitation, quel que soit
	// le réglage d'invitation. Et si l'étagère est vide — ni jeu, ni choix dû —
	// il n'y a rien à proposer : avant le premier palier, l'enfant ne voit rien
	// (critère 27).
	if (!c.etagereActive || !c.invitationActive || !c.etagereNonVide) return false;
	return c.ou === 'programme' ? c.programmeActif : !c.programmeActif;
}
