/* ============================================================
   Déclarations mutualisées des fichiers de données (#347).

   Chaque fichier `src/data/**` redéclarait localement les mêmes structures
   (descripteur du mode QCM, forme « source » d'une leçon), ce qui multipliait
   les risques de divergence (icône oubliée, champ ajouté à un seul endroit) et
   alourdissait la maintenance. On les centralise ici.
   ============================================================ */
import type { SchoolLevel } from '../core/catalog';
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

/* ---------- Étayage RÉDIGÉ d'une notion (#490) ----------
   Raccourci du cas de loin le plus fréquent : une notion dont la méthode s'ÉCRIT, faute
   d'algorithme à dérouler (reconnaître une figure, lire un tableau, comparer deux
   fractions). Là où les familles mécanisables décrivent un `exemple` que leur moteur
   narre pas à pas, celles-ci portent trois champs de texte et rien d'autre.

   La charte est celle des aides au geste (#272), et elle est CONTRAIGNANTE :
   - `regle` en UNE phrase — l'idée-force, la seule chose qu'un enfant à faible mémoire
     de travail emporte d'un écran au suivant ; elle dit le SENS, pas le geste ;
   - `etapes` au plus TROIS, à l'impératif, une idée par phrase ;
   - tutoiement, aucun ton punitif, et jamais la réponse d'une question à venir.
   Les exemples chiffrés y sont volontairement CANONIQUES (toujours les mêmes) : un enfant
   qui rouvre le panneau doit y retrouver ce qu'il a déjà lu, pas un nouvel énoncé.

   `niveau` ne se renseigne que pour une leçon dont la TÂCHE change avec la classe (les
   angles : nommer au CE2, comparer deux ouvertures au CM1) — pas pour un simple
   élargissement de plage, où la méthode ne bouge pas. */
export function etayageRedige(
	titre: string,
	regle: string,
	etapes: string[],
	niveau?: SchoolLevel,
): EtayageEntree {
	return { ...(niveau ? { niveau } : {}), contenu: { titre, regle, etapes } };
}

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
