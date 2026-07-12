/* ============================================================
   Aide contextuelle des exercices à interaction non intuitive (#272).
   Module PUR (aucun accès DOM) : il porte le CONTENU des aides (titre +
   étapes courtes + voie alternative + filet anti-erreur) et la mémoire
   « aide déjà vue » par profil (via lsGet/lsSet, jamais localStorage direct).

   Six types, un par runner d'écran dont la mécanique n'est pas évidente :
   - `tuiles` → numération (ui/lecon-tuiles) : amener LA tuile dans le trou ;
   - `ordre`  → ranger une suite (ui/lecon-ordre) : tap → case suivante ;
   - `tri`    → ranger par thème (ui/lecon-tri) : tap mot puis tap colonne ;
   - `atelier`→ atelier du mot (ui/ortho-atelier) : glisser pour surligner ;
   - `lettres`→ dictée « remettre les lettres dans l'ordre » (ui/ortho-runner, tuiles) ;
   - `tableau`→ tableau de conversion (ui/lecon-tableau, #394) : un chiffre par case,
     zéros de transit compris (les cases en pointillés se remplissent aussi).

   Le RENDU (modale, bouton, animation) vit dans ui/aide-exercice.ts.
   Rédaction validée avec les conseillers (designer / troubles d'apprentissage) :
   tutoiement, verbes d'action concrets, une idée par phrase, ≤ 3 étapes.
   ============================================================ */
import { lsGet, lsSet } from './storage';

export type TypeAide = 'tuiles' | 'ordre' | 'tri' | 'atelier' | 'lettres' | 'tableau';

export interface AideContenu {
	/** Titre de la bulle (ton « astuce », jamais « problème »). */
	titre: string;
	/** Étapes du geste : une action observable par phrase, ≤ 3 (mémoire de travail). */
	etapes: string[];
	/** Voie alternative présentée à ÉGALITÉ (atelier : tap lettre par lettre, clé dys-praxie). */
	alternative?: string;
	/** Filet anti-erreur dédramatisant (retour au bac, effacer/recommencer). */
	reparation?: string;
}

export const AIDES: Record<TypeAide, AideContenu> = {
	tuiles: {
		titre: 'Comment jouer ?',
		etapes: ['Touche la bonne tuile.', 'La tuile se pose dans la case vide.'],
		reparation: 'Tu veux changer ? Touche la case, la tuile revient.',
	},
	ordre: {
		titre: 'Comment ranger les mots ?',
		etapes: [
			'Touche le mot qui vient en premier.',
			'Il se range dans la case numéro 1.',
			"Continue dans l'ordre.",
		],
		reparation: "Tu t'es trompé ? Touche un mot rangé, il revient.",
	},
	tri: {
		titre: 'Comment ranger par thème ?',
		etapes: ['Touche un mot.', 'Touche sa colonne pour le ranger.'],
		reparation: "Tu t'es trompé ? Touche le mot rangé, il revient.",
	},
	atelier: {
		// « surligner » : même verbe que la consigne du runner sur le même écran.
		titre: 'Comment surligner un piège ?',
		etapes: [
			'Pose ton doigt sur la première lettre du piège.',
			"Glisse jusqu'à la dernière lettre, puis relève ton doigt.",
		],
		alternative: 'Trop difficile ? Touche les lettres une par une.',
		reparation: 'Tu peux effacer et recommencer autant de fois que tu veux.',
	},
	lettres: {
		titre: 'Comment remettre les lettres ?',
		etapes: ['Touche les lettres dans le bon ordre.', 'Elles forment ton mot en haut.'],
		reparation: "Tu t'es trompé ? Touche une lettre placée pour la déplacer ou l'enlever.",
	},
	tableau: {
		titre: 'Comment remplir le tableau ?',
		etapes: [
			'Écris un chiffre dans chaque case, de gauche à droite.',
			"Écris 0 quand il n'y a rien à compter dans cette unité.",
			'Les cases en pointillés se remplissent aussi.',
		],
		reparation: "Tu t'es trompé ? Touche la case à corriger pour y revenir.",
	},
};

/** Texte lu à voix haute (TTS) : toutes les phrases enchaînées, ponctuées pour
    des pauses naturelles entre étapes. Le titre porte déjà sa ponctuation. */
export function texteTtsAide(type: TypeAide): string {
	const a = AIDES[type];
	return [a.titre, ...a.etapes, a.alternative, a.reparation].filter(Boolean).join(' ');
}

/* ---------- Mémoire « aide déjà vue », par profil ----------
   Un seul objet { type: true } sous une clé préfixée profil (storage.ts) :
   l'auto-affichage au 1er lancement ne se déclenche qu'UNE fois par type et par
   enfant ; le bouton « ? » reste, lui, toujours disponible. */
export const AIDE_VUE_KEY = 'ludaskia_aide_vue';
type AideVueMap = Partial<Record<TypeAide, boolean>>;

/** L'aide de ce type a-t-elle déjà été montrée automatiquement à ce profil ? */
export function aideVue(type: TypeAide): boolean {
	const m = lsGet(AIDE_VUE_KEY, {}) as AideVueMap;
	return m[type] === true;
}

/** Marque l'aide de ce type comme « déjà vue » pour ce profil (idempotent). */
export function marquerAideVue(type: TypeAide): void {
	const m = lsGet(AIDE_VUE_KEY, {}) as AideVueMap;
	if (m[type]) return;
	m[type] = true;
	lsSet(AIDE_VUE_KEY, m);
}
