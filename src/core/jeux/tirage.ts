/* ============================================================
   Étagère de jeux (#661) — le TIRAGE des 3 propositions (critères 4, 5, 8, 9).

   Fonction PURE : elle ne lit ni le stockage ni le DOM, et son aléa est injecté.
   Ce n'est pas une coquetterie de testabilité — c'est ce qui permet de vérifier
   par échantillon qu'aucun jeu du vivier n'est inatteignable, ce qu'un
   `Math.random()` planqué dans le module rendrait impossible à prouver.

   Le relâchement du critère 5 (compléter avec l'autre type quand le type du
   palier n'a pas 3 candidats) n'est pas un cas de repli exotique : au
   lancement, l'étagère ne compte que DEUX jeux, donc les premiers paliers
   passeront tous par là. C'est le chemin normal, pas l'exception.

   Ce qui n'est PAS ici, et c'est volontaire : le fait que les jeux non choisis
   restent dans le vivier (critère 6). Cette fonction ne retire rien de rien —
   elle reçoit `dejaChoisis` et rend une sélection. Ne rien muter EST la
   garantie.
   ============================================================ */
import type { SchoolLevel } from '../catalog';
import type { JeuDef } from './catalogue';
import type { Palier } from './paliers';

/** Combien de jeux l'écran de choix propose, quand le vivier le permet. */
export const NB_PROPOSITIONS = 3;

export interface EntreesTirage {
	palier: Palier;
	/** Le catalogue complet — jamais muté. */
	vivier: JeuDef[];
	/** Classe du profil, pour écarter les jeux qui n'y existent pas. */
	niveau: SchoolLevel;
	/** Ids des jeux déjà sur l'étagère — jamais reproposés. */
	dejaChoisis: string[];
	/** Générateur injecté, dans [0, 1[. */
	r: () => number;
}

/* Fisher-Yates sur une COPIE. Le `Math.min` borne un générateur qui rendrait
   exactement 1 : sans lui, l'index sort du tableau et la permutation perd un
   élément en silence. */
function melanger<T>(items: T[], r: () => number): T[] {
	const a = [...items];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.min(i, Math.floor(r() * (i + 1)));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Les 3 propositions d'un palier — ou moins, si le vivier ne suit plus.

    Ordre de service : d'abord le type du palier, puis l'autre type pour
    compléter. Rend `[]` quand plus rien n'est éligible (critère 9) ; c'est à
    l'appelant de ne PAS consommer le palier dans ce cas, pour qu'il se
    redéclenche quand le vivier se remplit. Pur. */
export function proposerJeux(e: EntreesTirage): JeuDef[] {
	const possedes = new Set(e.dejaChoisis);
	const eligibles = e.vivier.filter(
		(j) => !possedes.has(j.id) && (!j.levels || j.levels.includes(e.niveau)),
	);

	const duType = melanger(
		eligibles.filter((j) => j.type === e.palier.type),
		e.r,
	).slice(0, NB_PROPOSITIONS);
	if (duType.length >= NB_PROPOSITIONS) return duType;

	const complement = melanger(
		eligibles.filter((j) => j.type !== e.palier.type),
		e.r,
	).slice(0, NB_PROPOSITIONS - duType.length);
	return [...duType, ...complement];
}
