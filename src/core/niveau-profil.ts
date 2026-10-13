/* ============================================================
   Niveau scolaire d'un profil DÉSIGNÉ (par UUID, sans le rendre actif) et position
   d'une leçon par rapport à sa classe suivie (#556, #573).
   ------------------------------------------------------------
   Sorti d'`encadrant-stats` pour être partagé avec la file « à revoir »
   (`revoir-file.ts`) sans cycle d'imports ; `encadrant-stats` le ré-exporte.
   ============================================================ */
import { getAllLessons, type LessonDef, type SchoolLevel, type SubjectId } from './catalog';
import { LEVEL_ORDER, effectiveLevel, niveauDefautCatalogue } from './levels';
import type { Profile } from './profiles';

/* ---------- Résolution du niveau d'un profil ARBITRAIRE ----------
   Réplique niveauActifMatiere (niveau-actif.ts) mais paramétré par profil, sans
   lire meta.active : ajustement par matière, sinon classe de référence, sinon défaut
   (niveauDefautCatalogue, source unique dans levels.ts — #351). */
export function niveauProfilMatiere(profile: Profile, subject: SubjectId): SchoolLevel {
	return (
		profile.niveauParMatiere?.[subject] ??
		profile.niveauReference ??
		niveauDefautCatalogue(getAllLessons())
	);
}
/* ---------- Position d'une leçon par rapport à la classe suivie (#556) ----------
   Vit ici, aux côtés de `niveauProfilMatiere`, et non dans `catalogue-arbre` (qui l'expose
   au sélecteur) : ce module est celui qui résout « niveau d'un profil », et l'y placer
   éviterait un cycle d'imports entre les deux. */
export type DirectionNiveau = 'en-dessous' | 'classe-suivie' | 'au-dessus';
export interface OrigineLecon {
	/** Niveau auquel la leçon sera RÉELLEMENT jouée et stockée pour ce profil (le même que
	    `niveauStockage` côté progression) : c'est lui que nomme le badge « classe d'origine ».
	    Le badge dit donc sous quelle classe l'enfant va travailler, pas une étiquette. */
	niveau: SchoolLevel;
	/** Sens de l'écart. Ne s'affiche JAMAIS en toutes lettres : il commande le RÉGIME
	    d'affichage de la ligne (état d'acquisition en dessous, compte-rendu factuel
	    au-dessus) et porte l'infobulle. */
	direction: DirectionNiveau;
}
/* `niveauJoue` (#573) : la classe d'une épingle qui en porte une ; absent, la leçon se joue à
   la classe suivie (résolue sur ses classes). */
export function origineLecon(
	lesson: LessonDef,
	profile: Profile,
	niveauJoue?: SchoolLevel,
): OrigineLecon {
	const suivi = niveauProfilMatiere(profile, lesson.subject);
	const niveau = effectiveLevel(lesson, niveauJoue ?? suivi);
	const ecart = LEVEL_ORDER.indexOf(niveau) - LEVEL_ORDER.indexOf(suivi);
	return {
		niveau,
		direction: ecart === 0 ? 'classe-suivie' : ecart < 0 ? 'en-dessous' : 'au-dessus',
	};
}
