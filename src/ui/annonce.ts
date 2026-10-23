/* ============================================================
   Délai d'annonce aux aides techniques — constante partagée.
   ------------------------------------------------------------
   Temps d'attente avant d'écrire dans une région vivante (`role="status"`, `aria-live`).
   Deux usages, une même valeur :
   - une région créée VIDE puis remplie : insérée déjà pleine, elle n'est pas annoncée de
     façon fiable, c'est le changement qui l'est ;
   - un résumé recalculé à chaque lettre d'une recherche : réécrit à chaque frappe, il
     ferait s'interrompre la synthèse vocale elle-même.
   Aucune des valeurs recopiées jusqu'ici n'était issue d'une mesure sur un moteur vocal
   réel : la cohérence est le seul argument disponible, d'où une seule constante plutôt
   que des copies qui divergeraient un jour sans raison.

   Module FEUILLE, sans import : l'écran de l'enfant (recherche de leçon) comme l'espace
   encadrant peuvent le charger sans tirer l'un l'autre.
   ============================================================ */
export const DELAI_ANNONCE = 350;
