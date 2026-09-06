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
	/** L'enfant possède-t-il au moins un jeu ? */
	aUnJeu: boolean;
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
	// le réglage d'invitation. Et sans jeu sur l'étagère, il n'y a rien à
	// proposer — avant le premier palier, l'enfant ne voit rien (critère 27).
	if (!c.etagereActive || !c.invitationActive || !c.aUnJeu) return false;
	return c.ou === 'programme' ? c.programmeActif : !c.programmeActif;
}
