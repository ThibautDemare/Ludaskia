/* ============================================================
   Mode Orthographe — modèle de données (par profil).
   - Un mot a un ID stable ; les listes référencent des ID de mots,
     si bien qu'un mot présent dans plusieurs listes partage tout son
     historique (entourage, « comme dans », validation, révision).
   - La « banque de l'année » = le dictionnaire de mots lui-même
     (mots uniques des listes + mots des leçons prédéfinies jouées).
   Voir docs/design-orthographe.md.
   ============================================================ */

import type { VerbTense } from '../../data/francais/verbs-lookup';

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

/** Formes fléchies d'un mot variable (nom/adjectif), pour les leçons d'accord
    (pluriels & féminins, #109). Toutes FACULTATIVES : un mot « neutre » (sans
    aucune forme) n'est pas éligible aux exercices de transformation, mais reste
    utilisable dans les autres leçons d'orthographe. La correction se fait sur la
    forme STOCKÉE, jamais par règle déduite. */
export interface FormesAccord {
	mascSing?: string; // masculin singulier (ex. « grand », « cheval »)
	femSing?: string; // féminin singulier (ex. « grande »)
	mascPlur?: string; // masculin pluriel (ex. « grands », « chevaux »)
	femPlur?: string; // féminin pluriel (ex. « grandes »)
}

/** Phrase de contexte d'une cible VERBE (#261) : la forme conjuguée (= `mot`)
    s'écrit dans le « trou » d'une phrase « pronom + forme + complément », affichée
    autour du slot interactif dans tous les modes et lue en TTS pour lever
    l'ambiguïté phonétique. Purement d'AFFICHAGE : jamais comparé à la saisie. */
export interface ContexteVerbe {
	avant: string; // pronom (avec élision/espace), ex. « il », « j' »
	apres: string; // complément précédé d'un espace, ex. « une pomme », ou ''
}

/** Un mot de la banque du profil. */
export interface MotOrtho {
	id: string; // stable ; dédup par forme normalisée (cibles verbe : id namespacé « v:… »)
	mot: string; // forme correcte exacte (NFC) = référence de vérification
	commeDans?: string; // bout de phrase d'exemple (dictée)
	homophone?: boolean; // exige « commeDans » en dictée
	formes?: FormesAccord; // formes fléchies optionnelles (accords #109)
	contexte?: ContexteVerbe; // phrase à trou d'une cible verbe (#261)
	entourage: Entourage[]; // marquage de l'enfant (sauvegardé)
	atelierFait: boolean; // l'atelier de découverte a-t-il été fait ?
	validation: Record<ModeOrtho, boolean>; // pour l'étoile de liste
	revision: EtatRevision;
	origine: 'liste' | 'predefini' | 'verbe';
}

/** Configuration d'un VERBE saisi par le parent dans une liste (#261). La dictée
    tire ses cibles dans le PRODUIT cartésien (pronoms × temps) ; chaque couple est
    matérialisé en MotOrtho au lancement du parcours (formes issues de LEFFF). */
export interface VerbeConfig {
	kind: 'verbe';
	infinitif: string; // saisie parent (NFC), ex. « manger », « s'enfuir »
	pronoms: number[]; // indices 0..5 (je, tu, il, nous, vous, ils), au moins 1
	temps: VerbTense[]; // au moins 1 ; v1 : ['present']
	complement?: string; // bout de phrase invariant, ex. « une pomme » (facultatif)
}

/** Une liste = une leçon dynamique, créée par le parent. Elle mélange des mots
    classiques (`motIds`) et des verbes paramétrés (`verbes`, #261). */
export interface ListeOrtho {
	id: string;
	label: string;
	dateControle?: string; // ISO court, repère doux optionnel
	motIds: string[]; // références vers la banque
	verbes?: VerbeConfig[]; // verbes paramétrés (#261) ; absent = liste de mots seuls
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
	formes?: FormesAccord; // formes fléchies optionnelles (accords #109)
}
