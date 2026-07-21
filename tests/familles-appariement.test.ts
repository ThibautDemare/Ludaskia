/* ============================================================
   Vocabulaire — « Familles de mots à relier » (#392) : tirage d'une SESSION
   d'appariement SANS RÉPÉTITION inter-manches (`tirerSessionAppariement`).
   ------------------------------------------------------------
   Les attendus sont DÉRIVÉS du contrat de la leçon (relier base ↔ dérivé, décoys
   = faux-amis), pas de l'implémentation. Le tirage est aléatoire (via `sample`,
   dérouté par `withSeed`) : les bornes dures sont éprouvées par ÉCHANTILLONNAGE
   large sur des graines reproductibles.

   Constantes de manche (contrat de conception, non exportées) : 4 paires, 2 décoys.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { withSeed } from '../src/core/utils';
import {
	FAMILLES,
	tirerSessionAppariement,
	appariementType,
	type ItemFamille,
} from '../src/data/francais/familles';
import { getLessonById } from '../src/core/catalog';
import type { Exercise } from '../src/core/exercise';

const NB_PAIRES = 4;
const NB_INTRUS = 2;

type Manche = Extract<Exercise, { type: 'appariement' }>;

/** Narrowing : les manches d'appariement sont l'unique forme produite ici. */
function asManche(ex: Exercise): Manche {
	if (ex.type !== 'appariement') throw new Error(`type attendu 'appariement', reçu '${ex.type}'`);
	return ex;
}
const gauches = (m: Manche): string[] => m.paires.map((p) => p.gauche);
const droites = (m: Manche): string[] => m.paires.map((p) => p.droite);
const decoys = (m: Manche): string[] => m.intrus ?? [];
const tousMots = (m: Manche): string[] => [...gauches(m), ...droites(m), ...decoys(m)];

/** Source factice : mots inventés mais respectant `ItemFamille`, tous DEUX À DEUX
    distincts et sans collision base/dérivé/faux-ami (permet de raisonner sur le cas
    dégradé et sur le nombre exact de décoys sans bruit de données). */
function fausseSource(n: number): ItemFamille[] {
	return Array.from({ length: n }, (_, i) => ({
		mot: `base${i}`,
		famille: `deriv${i}`,
		fauxAmi: `faux${i}`,
		autre: `autre${i}`,
		explication: `exp${i}`,
	}));
}

describe('Familles à relier — intégrité de la banque FAMILLES (#392)', () => {
	it('54 familles, chacune avec 4 mots deux à deux distincts (mot ≠ famille ≠ fauxAmi ≠ autre)', () => {
		expect(FAMILLES.length).toBe(54);
		for (const f of FAMILLES) {
			const quatre = [f.mot, f.famille, f.fauxAmi, f.autre];
			for (const w of quatre) expect(w.trim().length, JSON.stringify(f)).toBeGreaterThan(0);
			expect(new Set(quatre).size, `4 mots distincts attendus : ${quatre.join(' / ')}`).toBe(4);
			// famille ≠ fauxAmi : le piège doit être un AUTRE mot que le dérivé correct.
			expect(f.famille, JSON.stringify(f)).not.toBe(f.fauxAmi);
		}
	});

	it('bases (mot) toutes distinctes, dérivés (famille) tous distincts, et disjoints entre eux', () => {
		const mots = FAMILLES.map((f) => f.mot);
		const familles = FAMILLES.map((f) => f.famille);
		expect(new Set(mots).size).toBe(mots.length);
		expect(new Set(familles).size).toBe(familles.length);
		// Aucune base n'est le dérivé d'une autre famille → zéro collision base↔dérivé
		// intra-manche possible : c'est ce qui garantit qu'une passe place bien les 54.
		const setFam = new Set(familles);
		expect(mots.filter((m) => setFam.has(m))).toEqual([]);
	});
});

describe('Familles à relier — invariants d’une session de 5 manches (#392)', () => {
	it('anti-répétition inter-manches + structure/unicité/décoys (échantillon large)', () => {
		const fauxAmisBank = new Set(FAMILLES.map((f) => f.fauxAmi));
		let maxIntrus = 0;
		for (let seed = 0; seed < 300; seed++) {
			withSeed(seed, () => {
				const manches = tirerSessionAppariement(FAMILLES, 5).map(asManche);
				expect(manches.length).toBe(5);
				const basesVues = new Set<string>();
				for (const m of manches) {
					// Invariant 2 — structure : exactement 4 paires, au plus 2 décoys.
					expect(m.paires.length).toBe(NB_PAIRES);
					const intr = decoys(m);
					expect(intr.length).toBeLessThanOrEqual(NB_INTRUS);
					maxIntrus = Math.max(maxIntrus, intr.length);

					// Invariant 3 — unicité intra-manche : tous les mots affichés distincts.
					const mots = tousMots(m);
					expect(new Set(mots).size, `seed ${seed} : doublon affiché`).toBe(mots.length);

					// Invariant 4 — un décoy n'est jamais une bonne réponse (ni base, ni dérivé
					// présent) et reste une VRAIE forme (un faux-ami de la banque).
					const gset = new Set(gauches(m));
					const dset = new Set(droites(m));
					for (const it of intr) {
						expect(gset.has(it), `décoy « ${it} » = une base affichée`).toBe(false);
						expect(dset.has(it), `décoy « ${it} » = un dérivé affiché`).toBe(false);
						expect(fauxAmisBank.has(it), `décoy « ${it} » n'est pas un faux-ami de la banque`).toBe(
							true,
						);
					}

					// Invariant 1 (cœur) — aucune base réutilisée d'une manche à l'autre.
					for (const g of gauches(m)) {
						expect(basesVues.has(g), `base « ${g} » répétée dans la session (seed ${seed})`).toBe(
							false,
						);
						basesVues.add(g);
					}
				}
				// 5 × 4 = 20 bases toutes distinctes.
				expect(basesVues.size).toBe(20);
			});
		}
		// La mécanique de décoys produit bien 2 décoys (borne haute atteinte sur la banque réelle).
		expect(maxIntrus).toBe(NB_INTRUS);
	});

	it('décoys = exactement 2 quand aucun faux-ami ne collisionne (source contrôlée)', () => {
		for (let seed = 0; seed < 50; seed++) {
			withSeed(seed, () => {
				const manches = tirerSessionAppariement(fausseSource(20), 5).map(asManche);
				for (const m of manches) expect(decoys(m).length).toBe(NB_INTRUS);
			});
		}
	});

	it('rejeu : deux sessions successives ne sont pas identiques (re-mélange)', () => {
		// Sans graine : aléa réel. La séquence des bases doit différer entre deux tirages
		// (probabiliste — on exige seulement qu'au moins un essai diffère, pas chacun).
		const serial = (): string =>
			JSON.stringify(tirerSessionAppariement(FAMILLES, 5).map((m) => gauches(asManche(m))));
		let differe = false;
		for (let i = 0; i < 5 && !differe; i++) {
			if (serial() !== serial()) differe = true;
		}
		expect(differe).toBe(true);
	});
});

describe('Familles à relier — bornes de la banque (nbManches vs 54 familles)', () => {
	it('13 manches (52 ≤ 54) : encore sans répétition ; 14 manches (56 > 54) : dégradation bornée', () => {
		for (let seed = 0; seed < 100; seed++) {
			withSeed(seed, () => {
				// 13 manches : 52 bases, encore toutes distinctes (une seule passe suffit).
				const m13 = tirerSessionAppariement(FAMILLES, 13).map(asManche);
				expect(m13.length).toBe(13);
				const bases13: string[] = [];
				for (const m of m13) {
					expect(m.paires.length).toBe(NB_PAIRES);
					bases13.push(...gauches(m));
				}
				expect(bases13.length).toBe(52);
				expect(new Set(bases13).size, `seed ${seed} : répétition inattendue à 13 manches`).toBe(52);

				// 14 manches : 56 bases pour 54 familles → réapparition INÉVITABLE, mais
				// repoussée au plus tard : les 54 familles sont d'abord toutes couvertes,
				// puis seulement 2 répétitions. Chaque manche reste bien formée.
				const m14 = tirerSessionAppariement(FAMILLES, 14).map(asManche);
				expect(m14.length).toBe(14);
				const bases14: string[] = [];
				for (const m of m14) {
					expect(m.paires.length).toBe(NB_PAIRES);
					const mots = tousMots(m);
					expect(new Set(mots).size).toBe(mots.length); // unicité intra-manche préservée
					bases14.push(...gauches(m));
				}
				expect(bases14.length).toBe(56);
				// 54 familles distinctes couvertes (toute la banque) avant les 2 réapparitions.
				expect(new Set(bases14).size, `seed ${seed}`).toBe(54);
			});
		}
	});

	it('petite banque (6 familles), 3 manches (12 > 6) : pas de plantage, réutilisation repoussée au plus tard', () => {
		const src = fausseSource(6);
		for (let seed = 0; seed < 100; seed++) {
			withSeed(seed, () => {
				const manches = tirerSessionAppariement(src, 3).map(asManche);
				expect(manches.length).toBe(3);
				const bases: string[] = [];
				for (const m of manches) {
					expect(m.paires.length).toBe(NB_PAIRES);
					const mots = tousMots(m);
					expect(new Set(mots).size).toBe(mots.length); // intra-manche toujours sans doublon
					bases.push(...gauches(m));
				}
				expect(bases.length).toBe(12);
				// Une passe COMPLÈTE des 6 familles est consommée avant toute réapparition :
				// les 6 premières bases placées sont les 6 familles (aucune répétée avant).
				expect(new Set(bases.slice(0, 6)).size, `seed ${seed} : réapparition trop précoce`).toBe(6);
			});
		}
	});

	it('nbManches = 1 : une manche bien formée (délégation de generate)', () => {
		for (let seed = 0; seed < 30; seed++) {
			withSeed(seed, () => {
				const manches = tirerSessionAppariement(FAMILLES, 1).map(asManche);
				expect(manches.length).toBe(1);
				const m = manches[0];
				expect(m.paires.length).toBe(NB_PAIRES);
				expect(decoys(m).length).toBeLessThanOrEqual(NB_INTRUS);
				expect(new Set(tousMots(m)).size).toBe(tousMots(m).length);
			});
		}
	});
});

describe('Familles à relier — fabrique appariementType (#392)', () => {
	const type = appariementType(FAMILLES);

	it('métadonnées : mode « relier », format appariement, consigne, check() toujours false', () => {
		expect(type.exerciseKind).toBe('appariement');
		expect((type.modes ?? []).map((mo) => mo.id)).toEqual(['relier']);
		expect(type.consigne).toBe('Relie chaque mot à un mot de sa famille.');
		expect(typeof type.generateSession).toBe('function');
		// Corrigé lien par lien par le runner → la vérification générique renvoie toujours false.
		const [manche] = tirerSessionAppariement(FAMILLES, 1);
		expect(type.check(manche, 'dentiste')).toBe(false);
		expect(type.check(manche, '')).toBe(false);
	});

	it('generate() : une manche (4 paires, ≤ 2 décoys, mots distincts)', () => {
		for (let seed = 0; seed < 100; seed++) {
			withSeed(seed, () => {
				const ex = asManche(type.generate());
				expect(ex.paires.length).toBe(NB_PAIRES);
				expect(decoys(ex).length).toBeLessThanOrEqual(NB_INTRUS);
				const mots = tousMots(ex);
				expect(new Set(mots).size).toBe(mots.length);
			});
		}
	});

	it('generateSession(5) : hérite de l’anti-répétition inter-manches', () => {
		for (let seed = 0; seed < 100; seed++) {
			withSeed(seed, () => {
				const manches = type.generateSession!(5).map(asManche);
				expect(manches.length).toBe(5);
				const bases = new Set<string>();
				for (const m of manches) {
					for (const g of gauches(m)) {
						expect(bases.has(g), `base « ${g} » répétée (seed ${seed})`).toBe(false);
						bases.add(g);
					}
				}
				expect(bases.size).toBe(20);
			});
		}
	});
});

describe('Familles à relier — câblage catalogue (#392)', () => {
	it('leçon fr-vocab-familles-relier : CE2, vocabulaire, format appariement', () => {
		const lesson = getLessonById('fr-vocab-familles-relier');
		expect(lesson).toBeDefined();
		expect(lesson!.category).toBe('fr-vocabulaire');
		expect(lesson!.levels).toEqual(['ce2']);
		expect(lesson!.exerciseType.exerciseKind).toBe('appariement');
	});
});
