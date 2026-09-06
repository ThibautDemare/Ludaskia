/* ============================================================
   Étagère de jeux (#661) — le PLAFOND quotidien (critères 10, 11, 12).

   Le plafond est une borne de temps, pas une monnaie : il ne se gagne pas, ne
   se cumule pas, ne se reporte pas. Deux jours sans jouer ne donnent pas trente
   minutes le troisième — c'est le cas d'échec littéral du critère 11, et c'est
   ce qui distingue une borne de sécurité d'un solde à dépenser.

   Le jour est passé en paramètre (`'AAAA-MM-JJ'` local) au lieu d'être lu de
   l'horloge : sans ça, rien de tout ceci n'est testable, et les bugs de bord de
   journée ne se voient qu'à minuit passé, en production, chez l'enfant.

   Ce module ne stocke RIEN. La persistance est dans `./etat`, la mesure du temps
   écoulé dans le runner de jeu. Ici, seulement l'arithmétique.
   ============================================================ */

/** Défaut du critère 10. L'encadrant peut le changer, y compris à 0. */
export const PLAFOND_DEFAUT_MINUTES = 10;

/* Bornes et propositions du réglage encadrant. Le bornage se fait à la LECTURE
   (cf. `getJeuxPlafondMinutes`), donc une valeur importée hors plage retombe
   dans l'intervalle au lieu de faire n'importe quoi. */
export const PLAFOND_MIN_MINUTES = 0;
export const PLAFOND_MAX_MINUTES = 60;
export const PLAFOND_CHOIX_MINUTES = [5, 10, 15, 20, 30] as const;

export interface EtatPlafond {
	/** Jour LOCAL au format `AAAA-MM-JJ`. */
	jour: string;
	/** Secondes déjà jouées CE jour-là. */
	secondes: number;
}

/** Jour local d'un horodatage, au format attendu par `EtatPlafond`.

    Passe par les composantes locales plutôt que par `toISOString()`, qui bascule
    en UTC : une partie jouée à 23 h en France serait comptée sur le lendemain,
    et rendrait un plafond neuf une heure avant minuit. */
export function jourLocal(ts = Date.now()): string {
	const d = new Date(ts);
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const jj = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${mm}-${jj}`;
}

/** Secondes encore jouables aujourd'hui.

    Un état daté d'un AUTRE jour vaut « rien consommé » : c'est là que se joue la
    non-report du critère 11. Le résultat est borné à `[0, plafond]` — un restant
    négatif (partie qui déborde de quelques secondes, ou plafond abaissé en cours
    de journée) se propagerait sinon en dette le lendemain. Pur. */
export function restantSecondes(
	etat: EtatPlafond | null,
	plafondMinutes: number,
	aujourdhui: string,
): number {
	const total = Math.max(0, plafondMinutes) * 60;
	const consomme = etat && etat.jour === aujourdhui ? Math.max(0, etat.secondes) : 0;
	return Math.max(0, total - consomme);
}

/** L'état après avoir joué `secondes`. Ne mute pas l'état reçu, n'écrit rien.

    Un état d'hier n'est pas complété mais REMPLACÉ : ses secondes ne suivent pas
    dans la journée nouvelle. Pur. */
export function consommer(
	etat: EtatPlafond | null,
	secondes: number,
	aujourdhui: string,
): EtatPlafond {
	const dejaJoue = etat && etat.jour === aujourdhui ? Math.max(0, etat.secondes) : 0;
	return { jour: aujourdhui, secondes: dejaJoue + Math.max(0, secondes) };
}
