/* ============================================================
   Carte de l'accueil quand il n'y a plus rien à travailler (#276) — texte, pur.
   ------------------------------------------------------------
   Module à part, et non un coin de `lecon-du-jour.ts` : celui-là CHOISIT une leçon,
   il n'a pas à rédiger l'état affiché quand il n'y en a plus. Même découpage que
   `compteur-etoiles.ts` (#559), pour la même raison — un texte isolé dans un module
   pur est testable, et c'est faute de l'être que deux défauts avaient survécu des
   mois dans le libellé du compteur d'étoiles.
   ============================================================ */

/* Cet état est PERSISTANT : il se réaffiche à chaque visite, potentiellement pendant des
   mois. Un « Bravo ! » identique répété perd sa valeur de signal et l'enfant apprend à ne
   plus le lire — d'où la variation. La fête, elle, a déjà eu lieu au moment où le tour s'est
   achevé (modale + confettis) : ici la carte n'est qu'une TRACE calme.

   Trois contraintes, chacune payée par un avis :
   - le texte nomme le PÉRIMÈTRE RÉEL (« ici », « sur cet écran ») et jamais « ta classe » :
     l'application ne couvre ni l'oral, ni la lecture, ni la production d'écrit, et le
     catalogue peut être vidé en octobre. Il ne dit pas non plus « fini » sans borne — un
     enfant qui croit avoir fini l'année peut décrocher, ou se désinvestir en classe ;
   - les trois variantes sont STRICTEMENT synonymes. Y loger des angles différents ferait
     croire, à un enfant qui recroise la carte après des semaines, que quelque chose a changé
     d'état (avis `pedagogue-primaire`) ;
   - aucune ne parle à la première personne. Le « je » est réservé à la voix de l'enfant
     (« Mes trophées ») et à la mascotte qui parle dans une bulle ; cette carte n'a ni l'une
     ni l'autre (convention de rédaction #278, avis `redacteur-contenu-francais`).

   « pour l'instant », proposé sur une seule variante, a été RETIRÉ de toutes : sur une seule
   il rompait la synonymie (définitif vs temporaire), et sur les trois il se lisait comme une
   attente — « c'est pour bientôt ? » — soit une promesse de « la suite » que ce lot s'interdit
   précisément de faire. */
export const VARIANTES_TOUR_FAIT: readonly { titre: string; texte: string }[] = [
	{ titre: 'Tout est fait', texte: 'Tu as fait toutes les leçons proposées ici.' },
	{ titre: 'Tout est vu', texte: "Tu as terminé tout ce qu'il y a à découvrir sur cet écran." },
	{ titre: 'Tout est travaillé', texte: 'Tu as travaillé chacune des leçons proposées ici.' },
];

/* La révision comme objectif QUI CHANGE, pas comme pis-aller ni comme seul reste :
   l'enfant n'avance plus, il entretient. Le verbe du corps de phrase (« garder ») diffère
   volontairement de celui du bouton (« Réviser ») — le répéter aurait produit un écho pauvre —
   et le bouton, lui, garde son mot : c'est le même que la carte Révision de l'accueil, donc
   le même repère pour la même destination. */
export const TEXTE_ENTRETIEN_TOUR =
	"Ton travail, maintenant, c'est de garder tout ça bien en tête.";

/** Variante à afficher, choisie par rotation déterministe sur `tour` (entier quelconque).
    Pur : l'appelant fournit le tour, aucun état n'est gardé ici. */
export function varianteTourFait(tour: number): { titre: string; texte: string } {
	const n = VARIANTES_TOUR_FAIT.length;
	return VARIANTES_TOUR_FAIT[((tour % n) + n) % n];
}
