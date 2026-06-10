/* ============================================================
   Mode Orthographe — modèle de données (par profil).
   - Un mot a un ID stable ; les listes référencent des ID de mots,
     si bien qu'un mot présent dans plusieurs listes partage tout son
     historique (entourage, « comme dans », validation, révision).
   - La « banque de l'année » = le dictionnaire de mots lui-même
     (mots uniques des listes + mots des leçons prédéfinies jouées).
   Voir docs/design-orthographe.md.
   ============================================================ */

/** Modes d'entraînement validants (= types d'interaction Exercise correspondants). */
export type ModeOrtho = 'motCache' | 'tuiles' | 'dictee';
export const MODES_ORTHO: readonly ModeOrtho[] = ['motCache', 'tuiles', 'dictee'];

/** Entourage tracé par l'enfant dans l'atelier : une plage de lettres + une couleur. */
export interface Entourage {
	debut: number; // index de la 1re lettre (sur le mot)
	fin: number; // index de la dernière lettre (incluse)
	couleur: number; // index dans la palette colorblind-safe
}

/** État de répétition espacée d'un mot (escalier d'intervalles). */
export interface EtatRevision {
	palier: number; // 0 = neuf … 4 = acquis
	prochaineRevision: number | null; // timestamp ms ; null tant que pas entré en banque
	reussites: number;
	dernierTest: number | null; // timestamp ms
}

/** Un mot de la banque du profil. */
export interface MotOrtho {
	id: string; // stable ; dédup par forme normalisée
	mot: string; // forme correcte exacte (NFC) = référence de vérification
	commeDans?: string; // bout de phrase d'exemple (dictée)
	homophone?: boolean; // exige « commeDans » en dictée
	entourage: Entourage[]; // marquage de l'enfant (sauvegardé)
	atelierFait: boolean; // l'atelier de découverte a-t-il été fait ?
	validation: Record<ModeOrtho, boolean>; // pour l'étoile de liste
	revision: EtatRevision;
	origine: 'liste' | 'predefini';
}

/** Une liste = une leçon dynamique, créée par le parent. */
export interface ListeOrtho {
	id: string;
	label: string;
	dateControle?: string; // ISO court, repère doux optionnel
	motIds: string[]; // références vers la banque
	createdAt: number;
	updatedAt: number;
}

/** Tout l'état orthographe d'un profil (1 clé localStorage préfixée). */
export interface OrthoState {
	banque: Record<string, MotOrtho>; // id → mot
	listes: ListeOrtho[];
	motIdParForme: Record<string, string>; // index dédup : forme normalisée → id
}

/** Données d'entrée pour ajouter un mot (saisie parent ou leçon prédéfinie). */
export interface MotInput {
	mot: string;
	commeDans?: string;
	homophone?: boolean;
}
