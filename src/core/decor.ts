/* ============================================================
   Réglage « Figer le décor » (#785) : arrête la forêt animée et le décor de saison,
   SANS toucher au reste des animations (critère 25), contrairement à « Réduire les
   animations » qui coupe aussi les démonstrations de l'aide.

   Deux mémoires distinctes, qui ne se voient jamais (critère 28) :
   - dans l'appli, PAR PROFIL (critère 4) : clé préfixée par le profil actif ;
   - sur la vitrine et le guide, PAR APPAREIL (critère 5) : clé réelle, sans préfixe,
     partagée par les deux pages. Son nom diffère de celle du profil : même pour un
     profil hérité au préfixe vide, les deux clés réelles ne se confondent pas.
   Module léger (stockage seul) : la vitrine et le guide l'importent.
   ============================================================ */
import { lsGet, lsSet, lsGetRaw, lsSetRaw } from './storage';

/** Réglage du profil actif, dans l'appli (lsGet/lsSet, préfixe du profil). */
export const DECOR_FIGE_KEY = 'ludaskia_decorFige';
/** Réglage de l'appareil, pour la vitrine et le guide (clé réelle, sans préfixe). */
export const DECOR_FIGE_SITE_KEY = 'ludaskia_decorFigeSite';

/** Le profil actif a-t-il figé le décor ? `false` par défaut. */
export function decorFigeProfil(): boolean {
	return lsGet(DECOR_FIGE_KEY, false) === true;
}
export function setDecorFigeProfil(v: boolean): void {
	lsSet(DECOR_FIGE_KEY, !!v);
}

/** La vitrine et le guide ont-ils figé le décor sur cet appareil ? `false` par défaut. */
export function decorFigeSite(): boolean {
	return lsGetRaw(DECOR_FIGE_SITE_KEY, false) === true;
}
/* `lsSetRaw` ne marque aucun profil comme modifié : ce réglage n'appartient à aucun. */
export function setDecorFigeSite(v: boolean): void {
	lsSetRaw(DECOR_FIGE_SITE_KEY, JSON.stringify(!!v));
}

/** État EFFECTIF du décor : figé si le réglage le demande, ou si les animations sont
 *  réduites (« déjà inclus », critère 7). */
export function decorFigeEffectif(fige: boolean, animationsReduites: boolean): boolean {
	return fige || animationsReduites;
}
