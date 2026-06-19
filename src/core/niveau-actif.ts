/* ============================================================
   Niveau scolaire ACTIF (#225) — résolution au seam profil/catalogue.
   Compose le niveau de référence stocké (profiles) avec les niveaux
   réellement présents au catalogue (levels). Distinct de levels.ts,
   resté pur : ici on lit le profil et le catalogue.
   ============================================================ */
import { getNiveauReference } from './profiles';
import { getAllLessons } from './catalog';
import type { SchoolLevel } from './catalog';
import { availableLevels } from './levels';

/* Niveau actif du profil : sa classe choisie, sinon le plus bas niveau disponible
   au catalogue (jamais indéfini → le catalogue n'est jamais vide pendant que la
   popup d'onboarding attend un choix). */
export function niveauActif(): SchoolLevel {
	return getNiveauReference() ?? availableLevels(getAllLessons())[0];
}

/* Faut-il demander à l'enfant de choisir sa classe ? Seulement si aucune classe
   n'est encore choisie ET qu'au moins deux niveaux ont du contenu (un seul niveau
   ⇒ aucun choix à faire, on reste silencieusement dessus). */
export function besoinChoixNiveau(): boolean {
	return getNiveauReference() === undefined && availableLevels(getAllLessons()).length >= 2;
}
