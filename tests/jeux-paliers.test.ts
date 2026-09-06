/* ============================================================
   Étagère de jeux (#661) — la table des paliers et le franchissement.
   Couvre les critères 37 (table exacte, aucun télescopage avec un déblocage
   existant) et 7 (aucun palier perdu, jamais deux en bloc).

   Les attendus viennent de l'ISSUE, pas du code : la table ci-dessous est
   recopiée du tableau de l'issue #661, et la liste des niveaux « déjà occupés »
   est RECALCULÉE depuis `src/core/unlocks.ts` — c'est le vrai piège de
   régression : le jour où l'on ajoutera un avatar ou un thème sur un niveau,
   c'est ce test qui doit rougir, pas l'enfant qui doit recevoir deux
   célébrations dans la même seconde.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { PALIERS, paliersFranchis } from '../src/core/jeux/paliers';
import type { Palier } from '../src/core/jeux/paliers';
import { RANGS, MASCOTTE, AVATARS_FORET, THEMES } from '../src/core/unlocks';
import { NIVEAU_MAX } from '../src/core/progress';

/* Le tableau de l'issue #661, transcrit tel quel (critère 37). */
const NIVEAUX_ATTENDUS = [2, 6, 9, 12, 16, 19, 23, 27, 31, 35, 39, 43, 47, 52, 56, 61, 64, 68];
const TYPES_ATTENDUS = [
	'R',
	'C',
	'C',
	'R',
	'C',
	'R',
	'C',
	'R',
	'C',
	'R',
	'C',
	'R',
	'C',
	'R',
	'C',
	'R',
	'C',
	'C',
];

const rangs = (ps: Palier[]): number[] => ps.map((p) => p.rang);

describe('PALIERS — la table de l’issue #661 (critère 37)', () => {
	it('porte 18 paliers, rangs 1 à 18 dans l’ordre', () => {
		expect(PALIERS.length).toBe(18);
		expect(rangs(PALIERS)).toEqual([...Array(18)].map((_, i) => i + 1));
	});

	it('a exactement les niveaux et les types du tableau', () => {
		expect(PALIERS.map((p) => p.niveau)).toEqual(NIVEAUX_ATTENDUS);
		expect(PALIERS.map((p) => p.type)).toEqual(TYPES_ATTENDUS);
	});

	it('distribue 10 paliers « compétence » et 8 « refuge » (18 jeux au total)', () => {
		// Décompte annoncé par l'issue au-dessus du tableau : 18 jeux, 10 C / 8 R.
		expect(PALIERS.filter((p) => p.type === 'C').length).toBe(10);
		expect(PALIERS.filter((p) => p.type === 'R').length).toBe(8);
	});

	it('monte strictement, et reste dans la plage des niveaux jouables', () => {
		for (let i = 1; i < PALIERS.length; i++) {
			expect(PALIERS[i].niveau).toBeGreaterThan(PALIERS[i - 1].niveau);
		}
		expect(PALIERS[0].niveau).toBeGreaterThan(1); // rien avant le 1er palier (critère 27)
		expect(PALIERS[PALIERS.length - 1].niveau).toBeLessThanOrEqual(NIVEAU_MAX);
	});

	it('ne tombe JAMAIS sur un niveau déjà occupé par un déblocage existant', () => {
		/* Recalculé depuis unlocks.ts, jamais recopié : rangs, mascotte, avatars forêt
		   et thèmes. Un palier de jeu qui coïnciderait empilerait deux célébrations au
		   même instant — c'est le cas d'échec écrit dans le critère 37. */
		const occupes = new Set<number>([
			...RANGS.map((r) => r.seuil),
			...MASCOTTE.map((m) => m.seuil),
			...AVATARS_FORET.map((a) => a.niveau),
			...THEMES.map((t) => t.niveau),
		]);
		const collisions = PALIERS.filter((p) => occupes.has(p.niveau));
		expect(collisions.map((p) => p.niveau)).toEqual([]);
	});
});

describe('paliersFranchis — franchissement seul, jamais l’état (critère 7)', () => {
	it('rend le palier franchi quand on passe pile dessus', () => {
		expect(rangs(paliersFranchis(1, 2))).toEqual([1]);
		expect(rangs(paliersFranchis(5, 6))).toEqual([2]);
	});

	it('ne rend rien quand le niveau ne bouge pas', () => {
		expect(paliersFranchis(2, 2)).toEqual([]);
		expect(paliersFranchis(5, 5)).toEqual([]);
	});

	it('ne rend rien entre deux paliers', () => {
		expect(paliersFranchis(2, 5)).toEqual([]); // 3, 4, 5 ne portent aucun palier
		expect(paliersFranchis(68, NIVEAU_MAX)).toEqual([]); // plus rien après le 18e
	});

	it('rend TOUS les paliers d’un saut de plusieurs niveaux, dans l’ordre', () => {
		// De 1 à 12 : les niveaux 2, 6, 9 et 12 portent un palier — aucun n'est perdu.
		expect(rangs(paliersFranchis(1, 12))).toEqual([1, 2, 3, 4]);
		// Cas extrême : le parcours entier rend les 18, une seule fois chacun.
		expect(rangs(paliersFranchis(0, NIVEAU_MAX))).toEqual(rangs(PALIERS));
	});

	it('exclut la borne de départ et inclut la borne d’arrivée', () => {
		// Le palier 1 est au niveau 2 : parti DE 2, on ne le refranchit pas.
		expect(paliersFranchis(2, 6).map((p) => p.niveau)).toEqual([6]);
	});

	it('ne rend rien à la baisse (l’XP ne recule jamais — critère 22)', () => {
		expect(paliersFranchis(12, 2)).toEqual([]);
		expect(paliersFranchis(NIVEAU_MAX, 1)).toEqual([]);
	});

	it('rend des paliers de la table, pas des copies bricolées', () => {
		for (const p of paliersFranchis(0, NIVEAU_MAX)) {
			const ref = PALIERS.find((x) => x.rang === p.rang);
			expect(ref).toBeDefined();
			expect(p.niveau).toBe(ref?.niveau);
			expect(p.type).toBe(ref?.type);
		}
	});
});
