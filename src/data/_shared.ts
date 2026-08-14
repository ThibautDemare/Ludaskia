/* ============================================================
   Déclarations mutualisées des fichiers de données (#347).

   Chaque fichier `src/data/**` redéclarait localement les mêmes structures
   (descripteur du mode QCM, forme « source » d'une leçon), ce qui multipliait
   les risques de divergence (icône oubliée, champ ajouté à un seul endroit) et
   alourdissait la maintenance. On les centralise ici.
   ============================================================ */
import type { ExerciseType, ModeOption } from '../core/exercise';
import type { EtayageEntree } from '../core/etayage';

/* ---------- Mode QCM ----------
   Descripteur du mode « je choisis parmi des propositions », de loin le plus
   réutilisé. Deux variantes selon l'icône, avec une règle par matière :
   - MODE_QCM_POINT (`hand-pointing`, « je désigne ») : QCM de MATHS (on pointe
     une figure, un nombre, une forme) et les rares QCM de français où l'enfant
     désigne une proposition (le bon groupe, la bonne forme d'accord).
   - MODE_QCM_CHECK (`check-circle`, « je valide ») : QCM de FRANÇAIS (on valide
     le bon mot, la bonne catégorie).
   Les deux sont `recommended` par défaut (le QCM est le mode d'entrée le plus
   accessible). Un fichier qui a besoin d'un libellé propre, d'un indice ou d'un
   autre réglage part de la constante et surcharge par diffusion :
     `{ ...MODE_QCM_POINT, label: 'Je choisis la bonne fraction' }`
     `{ ...MODE_QCM_CHECK, hint: 'plus facile pour commencer', recommended: false }`
   La règle d'icône est historique (maths ↔ français) ; l'unifier relèverait
   d'une décision UX distincte. */
export const MODE_QCM_POINT: ModeOption = {
	id: 'qcm',
	label: 'Je choisis la bonne réponse',
	icon: 'hand-pointing',
	recommended: true,
};

export const MODE_QCM_CHECK: ModeOption = {
	id: 'qcm',
	label: 'Je choisis la bonne réponse',
	icon: 'check-circle',
	recommended: true,
};

/* ---------- Descripteur « source » d'une leçon ----------
   Forme minimale d'une leçon dans un fichier de données, AVANT que
   `core/catalog.ts` ne la mappe en `LessonDef` complet (matière, catégorie,
   niveaux dérivés…). Les listes `XXX_LESSONS` sont typées `LessonInput[]` ; un
   fichier qui porte des champs propres (rubrique, niveaux, exclusion du sprint)
   ÉTEND ce type plutôt que de le redéclarer. */
export interface LessonInput {
	id: string;
	label: string;
	exerciseType: ExerciseType;
	// Étayage de la notion (#490) : le contenu qui explique le SAVOIR en jeu, écrit au
	// plus près de la leçon qu'il décrit. Remonté tel quel en `LessonDef` par
	// `toLessonDefs`. Absent = pas de panneau d'étayage pour cette leçon.
	etayage?: EtayageEntree[];
}
