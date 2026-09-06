/* ============================================================
   Étagère de jeux (#661) — les PALIERS de déblocage (critères 7 et 37).

   Un palier n'ouvre pas un jeu : il ouvre un ÉCRAN DE CHOIX entre trois
   propositions (critère 4). C'est pourquoi il ne passe pas par `Recompense`
   (`src/core/unlocks.ts`), qui décrit des acquis immédiats — un palier décrit un
   rendez-vous, pas un cadeau.

   Autant de paliers que de jeux (18), pour qu'un enfant arrivé au niveau 100 ait
   pu obtenir toute l'étagère. L'alternance R/C tient à ce qu'un jeu-refuge et un
   jeu-compétence n'appellent pas au même moment : le premier palier est un
   refuge (rien à prouver pour entrer), et le dernier tiers penche vers la
   compétence, quand la mécanique est comprise.

   AUCUN de ces niveaux ne coïncide avec un déblocage existant (rang, mascotte,
   avatar, thème) : deux célébrations au même instant s'annulent. C'est vérifié
   par le calcul dans `tests/jeux-paliers.test.ts`, jamais par recopie.
   ============================================================ */
import type { TypeJeu } from './catalogue';

export interface Palier {
	/** 1 à 18, dans l'ordre de la table. */
	rang: number;
	/** Niveau XP qui l'ouvre. */
	niveau: number;
	type: TypeJeu;
}

/* Table du critère 37, à l'identique. 10 « compétence », 8 « refuge ». */
const TABLE: [number, TypeJeu][] = [
	[2, 'R'],
	[6, 'C'],
	[9, 'C'],
	[12, 'R'],
	[16, 'C'],
	[19, 'R'],
	[23, 'C'],
	[27, 'R'],
	[31, 'C'],
	[35, 'R'],
	[39, 'C'],
	[43, 'R'],
	[47, 'C'],
	[52, 'R'],
	[56, 'C'],
	[61, 'R'],
	[64, 'C'],
	[68, 'C'],
];

export const PALIERS: Palier[] = TABLE.map(([niveau, type], i) => ({
	rang: i + 1,
	niveau,
	type,
}));

/** Les paliers strictement franchis en passant de `avant` à `apres`.

    Borne de départ EXCLUE, borne d'arrivée INCLUSE : parti du niveau 2, on ne
    refranchit pas le palier qui y est posé. Même grammaire que
    `recompensesEntre` — on décrit un franchissement, jamais un état, sans quoi
    rouvrir l'app rejouerait toutes les célébrations déjà vues.

    Rend `[]` à la baisse : l'XP ne recule pas (critère 22), et si elle reculait
    (donnée importée douteuse) redistribuer des paliers serait pire que ne rien
    faire. Pur. */
export function paliersFranchis(avant: number, apres: number): Palier[] {
	if (apres <= avant) return [];
	return PALIERS.filter((p) => p.niveau > avant && p.niveau <= apres);
}
