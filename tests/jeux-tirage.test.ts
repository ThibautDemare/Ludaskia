/* ============================================================
   Étagère de jeux (#661) — le tirage des 3 propositions d'un palier.
   Couvre les critères 4 (exactement 3, du bon type, ni possédé ni hors classe),
   5 (relâchement vers l'autre type sous 3 candidats), 6 (les non-choisis restent
   dans le vivier), 8 (fonction pure et déterministe à générateur fixé),
   9 (vivier vide → aucune proposition) et 25 (seuls le niveau XP et la classe
   filtrent — jamais la performance).

   Le vivier est FABRIQUÉ ici : la fonction le reçoit en argument (critère 8), donc
   les invariants s'éprouvent sans dépendre du catalogue réel, qui ne comptera que
   2 jeux au lancement. Les bornes se cherchent sur des centaines de tirages, avec
   un générateur déterministe : jamais de hasard réel dans un test.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { proposerJeux } from '../src/core/jeux/tirage';
import type { JeuDef, TypeJeu } from '../src/core/jeux/catalogue';
import type { Palier } from '../src/core/jeux/paliers';
import type { SchoolLevel } from '../src/core/catalog';
import { ajouterJeu } from '../src/core/jeux/etat';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { tirage } from './aleatoire';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const jeu = (id: string, type: TypeJeu, levels?: SchoolLevel[]): JeuDef =>
	levels
		? { id, label: `Jeu ${id}`, icone: 'Puzzle', type, levels }
		: { id, label: `Jeu ${id}`, icone: 'Puzzle', type };

/* Vivier d'essai : 4 « compétence » et 4 « refuge » disponibles partout, plus un de
   chaque réservé au CM1 (un jeu sans `levels` est disponible partout — c'est le cas
   du 2048, critère 16). */
const VIVIER: JeuDef[] = [
	jeu('c1', 'C'),
	jeu('c2', 'C'),
	jeu('c3', 'C'),
	jeu('c4', 'C'),
	jeu('cCm1', 'C', ['cm1']),
	jeu('r1', 'R'),
	jeu('r2', 'R'),
	jeu('r3', 'R'),
	jeu('r4', 'R'),
	jeu('rCm1', 'R', ['cm1']),
];

const PALIER_C: Palier = { rang: 2, niveau: 6, type: 'C' };
const PALIER_R: Palier = { rang: 1, niveau: 2, type: 'R' };

const ids = (js: JeuDef[]): string[] => js.map((j) => j.id);

describe('proposerJeux — la forme des 3 propositions (critère 4)', () => {
	it('propose exactement 3 jeux, tous du type du palier, sur tout l’éventail des tirages', () => {
		for (let graine = 1; graine <= 300; graine++) {
			const p = proposerJeux({
				palier: PALIER_C,
				vivier: VIVIER,
				niveau: 'ce2',
				dejaChoisis: [],
				r: tirage(graine),
			});
			expect(p.length).toBe(3);
			expect(p.every((j) => j.type === 'C')).toBe(true);
		}
	});

	it('ne propose jamais deux fois le même jeu', () => {
		for (let graine = 1; graine <= 300; graine++) {
			const p = proposerJeux({
				palier: PALIER_R,
				vivier: VIVIER,
				niveau: 'cm1',
				dejaChoisis: [],
				r: tirage(graine),
			});
			expect(new Set(ids(p)).size).toBe(p.length);
		}
	});

	it('ne propose jamais un jeu déjà possédé', () => {
		for (let graine = 1; graine <= 300; graine++) {
			const p = proposerJeux({
				palier: PALIER_C,
				vivier: VIVIER,
				niveau: 'cm1',
				dejaChoisis: ['c1', 'c3'],
				r: tirage(graine),
			});
			expect(ids(p)).not.toContain('c1');
			expect(ids(p)).not.toContain('c3');
			expect(p.length).toBe(3); // c2, c4 et cCm1 restent : le type suffit encore
		}
	});

	it('ne propose jamais un jeu indisponible à la classe du profil', () => {
		for (let graine = 1; graine <= 300; graine++) {
			const p = proposerJeux({
				palier: PALIER_C,
				vivier: VIVIER,
				niveau: 'ce2',
				dejaChoisis: [],
				r: tirage(graine),
			});
			expect(ids(p)).not.toContain('cCm1');
		}
	});

	it('propose les jeux sans `levels` à toutes les classes', () => {
		// Un jeu qui ne déclare pas de classe ignore le niveau scolaire (critère 16).
		const vivier = [jeu('libre1', 'C'), jeu('libre2', 'C'), jeu('libre3', 'C')];
		for (const niveau of ['ce2', 'cm1'] as SchoolLevel[]) {
			const p = proposerJeux({
				palier: PALIER_C,
				vivier,
				niveau,
				dejaChoisis: [],
				r: tirage(7),
			});
			expect(ids(p).sort()).toEqual(['libre1', 'libre2', 'libre3']);
		}
	});

	it('sert TOUTES les sélections possibles — aucun jeu mort, aucun jeu d’office', () => {
		/* « Chaque jeu sort au moins une fois » ne prouve presque rien : ce contrôle
		   reste vert alors même que deux jeux sur quatre sont proposés à TOUS les
		   coups. Ce n'est pas une hypothèse — c'est ce qui se passait ici : le
		   générateur des tests avait une première sortie quasi constante, le mélange
		   Fisher-Yates de `tirage.ts` s'effondrait, et seules 2 des 4 sélections
		   possibles sortaient (c3 et c4 présents 500 fois sur 500, c1 et c2 se
		   partageant la place restante). Le test ne le voyait pas.

		   On énumère donc les POSSIBILITÉS et non leur existence : 4 jeux éligibles
		   pour 3 places, cela fait exactement 4 sélections. Les quatre doivent
		   sortir — autrement dit, chaque jeu doit aussi être parfois ÉCARTÉ. */
		const eligibles = ['c1', 'c2', 'c3', 'c4'];
		const selections = new Set<string>();
		const rangs = new Map<string, Set<number>>(eligibles.map((id) => [id, new Set<number>()]));
		for (let graine = 1; graine <= 500; graine++) {
			const p = ids(
				proposerJeux({
					palier: PALIER_C,
					vivier: VIVIER,
					niveau: 'ce2',
					dejaChoisis: [],
					r: tirage(graine),
				}),
			);
			selections.add([...p].sort().join(','));
			p.forEach((id, rang) => rangs.get(id)?.add(rang));
		}
		// Les 4 sous-ensembles de 3 parmi 4, écrits en clair : un échec dit lequel
		// n'est jamais servi, au lieu de « il manque un jeu quelque part ».
		expect([...selections].sort()).toEqual(['c1,c2,c3', 'c1,c2,c4', 'c1,c3,c4', 'c2,c3,c4']);
		// Et personne n'est cantonné à la dernière carte. L'ordre d'affichage pèse
		// sur ce qu'un enfant choisit : un jeu toujours servi en troisième est
		// désavantagé sans que rien à l'écran ne le dise.
		for (const id of eligibles) {
			expect([...(rangs.get(id) ?? [])].sort(), id).toEqual([0, 1, 2]);
		}
	});
});

describe('proposerJeux — relâchement vers l’autre type (critère 5)', () => {
	it('complète avec l’autre type quand le type du palier n’a que 2 candidats', () => {
		const vivier = [jeu('c1', 'C'), jeu('c2', 'C'), jeu('r1', 'R'), jeu('r2', 'R')];
		const complements = new Set<string>();
		for (let graine = 1; graine <= 200; graine++) {
			const p = proposerJeux({
				palier: PALIER_C,
				vivier,
				niveau: 'ce2',
				dejaChoisis: [],
				r: tirage(graine),
			});
			expect(p.length).toBe(3);
			// Les 2 du type du palier sont là, et un seul de l'autre type complète.
			expect(
				ids(p)
					.filter((i) => i.startsWith('c'))
					.sort(),
			).toEqual(['c1', 'c2']);
			const autres = p.filter((j) => j.type === 'R');
			expect(autres.length).toBe(1);
			complements.add(autres[0].id);
		}
		/* Et ce n'est pas toujours le MÊME qui complète. Choisir 1 parmi 2 est le
		   tirage le plus fragile qui soit : c'est celui où un générateur biaisé rend
		   toujours la même permutation, donc où un jeu ne sort jamais. « Il y en a
		   bien un » ne l'aurait pas vu ; « les deux sortent » le voit. */
		expect([...complements].sort()).toEqual(['r1', 'r2']);
	});

	it('complète entièrement avec l’autre type quand le type du palier n’a plus rien', () => {
		// Cas ANNONCÉ par l'issue : au lancement, 2 jeux seulement, donc les premiers
		// paliers passent par cette règle. Le palier est « refuge », tout est déjà pris
		// côté refuge : les 3 propositions viennent du type compétence.
		const vivier = [jeu('r1', 'R'), jeu('c1', 'C'), jeu('c2', 'C'), jeu('c3', 'C'), jeu('c4', 'C')];
		const p = proposerJeux({
			palier: PALIER_R,
			vivier,
			niveau: 'ce2',
			dejaChoisis: ['r1'],
			r: tirage(42),
		});
		expect(p.length).toBe(3);
		expect(p.every((j) => j.type === 'C')).toBe(true);
	});

	it('ne complète pas non plus au-delà de ce qui existe : 2 candidats en tout → 2 propositions', () => {
		// « moins de 3 » se relâche vers l'autre type, jamais vers un doublon ni vers un
		// jeu déjà possédé : on propose ce qui existe, et rien d'autre.
		const vivier = [jeu('c1', 'C'), jeu('r1', 'R'), jeu('c2', 'C', ['cm1'])];
		const p = proposerJeux({
			palier: PALIER_C,
			vivier,
			niveau: 'ce2',
			dejaChoisis: [],
			r: tirage(3),
		});
		expect(ids(p).sort()).toEqual(['c1', 'r1']);
	});
});

describe('proposerJeux — vivier épuisé (critère 9)', () => {
	it('ne propose rien quand tout est déjà possédé', () => {
		const p = proposerJeux({
			palier: PALIER_C,
			vivier: VIVIER,
			niveau: 'cm1',
			dejaChoisis: ids(VIVIER),
			r: tirage(1),
		});
		expect(p).toEqual([]);
	});

	it('ne propose rien quand rien n’est disponible à la classe du profil', () => {
		const vivier = [jeu('c1', 'C', ['cm1']), jeu('r1', 'R', ['cm1'])];
		const p = proposerJeux({
			palier: PALIER_C,
			vivier,
			niveau: 'ce2',
			dejaChoisis: [],
			r: tirage(1),
		});
		expect(p).toEqual([]);
	});

	it('reproposera ces jeux dès que la classe change (le vivier se remplit)', () => {
		// Corollaire du critère 9 : le palier ne doit pas être consommé à vide. Côté
		// logique pure, cela se lit ainsi : les mêmes entrées, avec la classe CM1,
		// redonnent des propositions.
		const vivier = [jeu('c1', 'C', ['cm1']), jeu('r1', 'R', ['cm1'])];
		const p = proposerJeux({
			palier: PALIER_C,
			vivier,
			niveau: 'cm1',
			dejaChoisis: [],
			r: tirage(1),
		});
		expect(ids(p).sort()).toEqual(['c1', 'r1']);
	});
});

describe('proposerJeux — fonction pure et déterministe (critère 8)', () => {
	it('rend exactement le même résultat pour les mêmes entrées et la même graine', () => {
		for (const graine of [1, 17, 99, 12345]) {
			const a = proposerJeux({
				palier: PALIER_C,
				vivier: VIVIER,
				niveau: 'cm1',
				dejaChoisis: [],
				r: tirage(graine),
			});
			const b = proposerJeux({
				palier: PALIER_C,
				vivier: VIVIER,
				niveau: 'cm1',
				dejaChoisis: [],
				r: tirage(graine),
			});
			expect(ids(a)).toEqual(ids(b)); // même ordre, mêmes jeux
		}
	});

	it('ne dépend pas du stockage : ce qui est possédé se dit par `dejaChoisis`', () => {
		/* Le stockage dit que « c1 » est possédé ; l'appel, lui, ne le dit pas. Une
		   fonction qui irait lire le stockage écarterait c1 — et deviendrait intestable
		   sans profil. On vérifie aussi qu'elle n'ÉCRIT rien. */
		ajouterJeu('c1');
		const avant = instantaneStockage();
		const vivier = [jeu('c1', 'C'), jeu('c2', 'C'), jeu('c3', 'C')];
		const p = proposerJeux({
			palier: PALIER_C,
			vivier,
			niveau: 'ce2',
			dejaChoisis: [],
			r: tirage(5),
		});
		expect(ids(p).sort()).toEqual(['c1', 'c2', 'c3']);
		expect(instantaneStockage()).toEqual(avant);
	});

	it('ne modifie ni le vivier ni la liste des jeux déjà choisis', () => {
		// Critère 6 : les jeux non choisis RESTENT dans le vivier — le tirage ne
		// consomme rien, il propose.
		const vivier = [jeu('c1', 'C'), jeu('c2', 'C'), jeu('c3', 'C'), jeu('c4', 'C')];
		const copieVivier = ids(vivier);
		const dejaChoisis = ['c1'];
		proposerJeux({
			palier: PALIER_C,
			vivier,
			niveau: 'ce2',
			dejaChoisis,
			r: tirage(11),
		});
		expect(ids(vivier)).toEqual(copieVivier);
		expect(dejaChoisis).toEqual(['c1']);
	});

	it('ne filtre QUE sur la classe et sur ce qui est déjà possédé (critère 25)', () => {
		/* Deux profils de même classe et de même niveau XP voient les mêmes propositions :
		   rien dans la signature ne peut porter une performance, et deux appels identiques
		   avec des générateurs identiques doivent coïncider — la seule variable est `r`. */
		const entrees = {
			palier: PALIER_C,
			vivier: VIVIER,
			niveau: 'ce2' as SchoolLevel,
			dejaChoisis: [] as string[],
		};
		const enfantA = proposerJeux({ ...entrees, r: tirage(2024) });
		const enfantB = proposerJeux({ ...entrees, r: tirage(2024) });
		expect(ids(enfantA)).toEqual(ids(enfantB));
	});
});

/** Photographie du stockage complet (clés réelles + valeurs), pour prouver qu'un appel
 *  n'écrit rien. */
function instantaneStockage(): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k != null) out[k] = localStorage.getItem(k) ?? '';
	}
	return out;
}
