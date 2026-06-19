/* ============================================================
   Niveau scolaire ACTIF (#225) — résolution au seam profil/catalogue.
   Compose le niveau de référence du profil actif avec les niveaux
   réellement présents au catalogue. Lit la méta de profil DIRECTEMENT
   depuis le stockage (pas via profiles.ts) pour rester indépendant : on
   évite ainsi un cycle progress → niveau-actif → profiles → progress
   (profiles.ts importe déjà progress.ts).
   ============================================================ */
import { lsGet, PROFILES_KEY } from './storage';
import { getAllLessons } from './catalog';
import type { LessonDef, SchoolLevel } from './catalog';
import { availableLevels, effectiveLevel } from './levels';

/* Niveau de référence stocké dans la méta du profil actif (undefined si non choisi). */
function niveauReferenceStocke(): SchoolLevel | undefined {
	const meta = lsGet(PROFILES_KEY, null) as {
		list?: { uuid: string; niveauReference?: SchoolLevel }[];
		active?: string;
	} | null;
	const list = meta?.list ?? [];
	const p = list.find((x) => x.uuid === meta?.active) ?? list[0];
	return p?.niveauReference;
}

/* Niveau actif du profil : sa classe choisie, sinon le plus bas niveau disponible
   au catalogue (jamais indéfini → le catalogue n'est jamais vide pendant que la
   popup d'onboarding attend un choix). */
export function niveauActif(): SchoolLevel {
	return niveauReferenceStocke() ?? availableLevels(getAllLessons())[0];
}

/* Faut-il demander à l'enfant de choisir sa classe ? Seulement si aucune classe
   n'est encore choisie ET qu'au moins deux niveaux ont du contenu (un seul niveau
   ⇒ aucun choix à faire, on reste silencieusement dessus). */
export function besoinChoixNiveau(): boolean {
	return niveauReferenceStocke() === undefined && availableLevels(getAllLessons()).length >= 2;
}

/* Niveau effectif POUR UNE LEÇON : le niveau actif résolu sur les niveaux que la
   leçon supporte (repli/clamp via effectiveLevel). C'est ce qu'on passe à
   `generate`/`genLessonItem` au seam UI — une référence hors-filtre (favori,
   révision) est ainsi calibrée sans jamais être cassée. */
export function niveauLecon(lesson: LessonDef): SchoolLevel {
	return effectiveLevel(lesson, niveauActif());
}
