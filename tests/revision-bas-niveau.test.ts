/* ============================================================
   Entretien du niveau INFÉRIEUR en révision espacée (#232)
   ------------------------------------------------------------
   Une séance du niveau actif ressort une DOSE PLAFONNÉE de notions encore en
   consolidation au niveau immédiatement inférieur (le CE2 d'un enfant passé en
   CM1), dont l'état SR restait stocké sous `lessonId@niveau` mais n'était plus
   jamais reproposé.

   Les attendus sont DÉRIVÉS du contrat annoncé, jamais recopiés de
   l'implémentation :
     - dose par palier de plafond : < 8 → 0, 8-11 → 1, 12-19 → 2, ≥ 20 → 3 ;
     - éligibilité = `estDu` (donc un « acquis » ne ressort jamais) ;
     - la dose prend ses slots DANS le plafond (la charge d'une séance ne bouge pas) et
       ne DÉPASSE jamais le nombre d'actifs dus : le niveau inférieur ne colonise pas une
       séance de travail courant (#232). Rien de dû au niveau actif ⇒ dose entière ;
     - lot trié par « le plus longtemps sans test réel » (dernierTest croissant,
       jamais testé d'abord), départage par id ;
     - placement décidé sur les GROUPES : « jamais en clôture de séance » PRIME sur la
       règle de catégorie (un groupe d'entretien est inséré avant le dernier groupe ;
       dans le dernier groupe, l'élément passe avant le dernier élément), sinon
       l'entretien suit les actifs de sa catégorie. Conséquence assumée : l'entretien
       peut OUVRIR une séance quand aucune position intérieure n'existe ;
     - `bas` absent ou sans élément éligible ⇒ comportement V1 strictement inchangé ;
     - escalier d'intervalles de #45 (REVISION_INTERVALLES = [1, 3, 7, 16, 35, 75] j)
       pour vérifier la clé réécrite après une réussite.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	plafondBasNiveau,
	REVISION_BAS_NIVEAU_MAX,
	REVISION_PLAFOND,
	REVISION_PLAFOND_CHOIX,
	PALIER_ACQUIS,
	JOUR,
	estDu,
} from '../src/core/revision';
import {
	selectDueGroups,
	countDue,
	prochaineEcheance,
	aDesRevisions,
	effortRevisionAffiche,
	type DueGroup,
	type DueItem,
	type LeconBasNiveau,
} from '../src/core/revision-select';
import {
	LESSON_REVISION_KEY,
	loadLessonRevisions,
	loadLessonRevisionsBasNiveau,
	avancerLessonRevision,
	countDusSeance,
} from '../src/core/progress';
import {
	initProfiles,
	touchActiveProfile,
	setNiveauReference,
	setNiveauMatiere,
} from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSet } from '../src/core/storage';
import { getAllLessons, getLessonById, ORTHO_CATEGORY_ID } from '../src/core/catalog';
import type { EtatRevision, OrthoState } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const T0 = 1_700_000_000_000; // instant de référence (ms)

/* --- fabriques d'états, calées sur EtatRevision (#45) --- */
function etat(palier: number, prochaineRevision: number | null, dernierTest: number | null = null) {
	return { palier, prochaineRevision, reussites: palier, dernierTest } satisfies EtatRevision;
}
const etatDu = (dernierTest: number | null = null) => etat(1, T0 - JOUR, dernierTest);
const etatAcquis = () => etat(PALIER_ACQUIS, null, T0 - 100 * JOUR);
const etatFutur = () => etat(2, T0 + 5 * JOUR, T0 - JOUR);

/* Banque d'orthographe de n mots TOUS dus (une seule source « orthographe »). */
function motsDus(n: number): OrthoState {
	const banque: OrthoState['banque'] = {};
	for (let i = 0; i < n; i++) {
		const id = 'w' + i;
		banque[id] = {
			id,
			mot: 'mot' + i,
			entourage: [],
			atelierFait: false,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: etat(0, T0 - 1000 - i),
			origine: 'liste',
		};
	}
	return { banque, listes: [], motIdParForme: {} };
}
const orthoVide = (): OrthoState => motsDus(0);

/* Leçons du niveau actif dues, `due` décroissant dans l'ordre donné (le 1er est le
   plus en retard). Clés = id nu, comme la vue scopée `loadLessonRevisions`. */
function lecons(ids: string[], depart = 5000): Record<string, EtatRevision> {
	const out: Record<string, EtatRevision> = {};
	ids.forEach((id, i) => {
		out[id] = etat(0, T0 - depart + i * 100);
	});
	return out;
}
const basNiveau = (
	lessonId: string,
	e: EtatRevision = etatDu(),
	niveau: LeconBasNiveau['niveau'] = 'ce2',
): LeconBasNiveau => ({ lessonId, niveau, etat: e });

/* Séance à plat, dans l'ordre où l'enfant la parcourt (l'UI enchaîne les groupes
   puis leurs items : `for (const g of groups) for (const it of g.items)`). */
const aplati = (groups: DueGroup[]): DueItem[] => groups.flatMap((g) => g.items);
const total = (groups: DueGroup[]) => aplati(groups).length;
const estEntretien = (it: DueItem) => it.kind === 'lesson' && it.niveau !== undefined;

/* ============================================================
   1. La dose autorisée par plafond de séance
   ============================================================ */
describe('plafondBasNiveau : dose d’entretien selon le plafond de séance', () => {
	it('respecte les paliers annoncés (< 8 → 0, 8-11 → 1, 12-19 → 2, ≥ 20 → 3)', () => {
		// Bornes des paliers, recalculées depuis la règle et non depuis le code.
		expect([7, 8, 11, 12, 19, 20].map(plafondBasNiveau)).toEqual([0, 1, 1, 2, 2, 3]);
		expect(plafondBasNiveau(9)).toBe(1);
		expect(plafondBasNiveau(15)).toBe(2);
		expect(plafondBasNiveau(24)).toBe(3);
	});

	it('les 7 plafonds réglables (#439) donnent 0/1/1/2/2/3/3', () => {
		expect(REVISION_PLAFOND_CHOIX).toEqual([6, 8, 10, 12, 15, 20, 24]);
		expect(REVISION_PLAFOND_CHOIX.map(plafondBasNiveau)).toEqual([0, 1, 1, 2, 2, 3, 3]);
		// Le défaut (12) entretient 2 notions.
		expect(plafondBasNiveau(REVISION_PLAFOND)).toBe(2);
	});

	it('séance la plus courte (6) ou dérisoire (0, 1, 3) → entretien SUSPENDU', () => {
		for (const p of [0, 1, 3, 6, 7]) expect(plafondBasNiveau(p)).toBe(0);
	});

	it('INVARIANT : dose croissante, bornée par REVISION_BAS_NIVEAU_MAX, et jamais confiscatrice', () => {
		let precedente = 0;
		for (let p = 0; p <= 60; p++) {
			const d = plafondBasNiveau(p);
			expect(d, `plafond ${p}`).toBeGreaterThanOrEqual(precedente); // monotone
			expect(d).toBeLessThanOrEqual(REVISION_BAS_NIVEAU_MAX);
			// L'entretien ne peut jamais rafler la séance : il reste toujours de la place
			// pour le niveau actif (et au moins 5 slots dès que l'entretien s'ouvre).
			if (d > 0) expect(p - d).toBeGreaterThanOrEqual(5);
			precedente = d;
		}
		expect(plafondBasNiveau(1000)).toBe(REVISION_BAS_NIVEAU_MAX); // plafond DUR
	});
});

/* ============================================================
   2. Non-régression V1 : sans entretien éligible, rien ne change
   ============================================================ */
describe('sélection : sans entretien, la séance V1 est strictement inchangée', () => {
	const scenarios: [string, OrthoState, Record<string, EtatRevision>][] = [
		['rien de dû', orthoVide(), {}],
		['20 mots (une grosse source)', motsDus(20), {}],
		[
			'mots + 2 catégories de leçons',
			motsDus(8),
			lecons(['math-doubles', 'math-moities', 'fr-conj-etre-present', 'fr-conj-avoir-present']),
		],
	];

	it('paramètre `bas` omis ⇔ tableau vide (bit à bit, tous plafonds)', () => {
		for (const [nom, ortho, lecs] of scenarios) {
			for (const plafond of [0, ...REVISION_PLAFOND_CHOIX]) {
				const v1 = selectDueGroups(ortho, lecs, T0, plafond);
				expect(selectDueGroups(ortho, lecs, T0, plafond, []), `${nom}/${plafond}`).toEqual(v1);
				expect(countDue(ortho, lecs, T0, plafond, [])).toBe(countDue(ortho, lecs, T0, plafond));
			}
			// Plafond par défaut (12) : l'appel V1 à 3 arguments reste possible.
			expect(selectDueGroups(ortho, lecs, T0, undefined, [])).toEqual(
				selectDueGroups(ortho, lecs, T0),
			);
		}
	});

	it('stock bas présent mais AUCUN élément éligible ⇒ séance V1 identique', () => {
		const inéligibles: LeconBasNiveau[] = [
			basNiveau('math-tables-addition', etatAcquis()), // acquis → au repos
			basNiveau('math-complements', etatFutur()), // échéance à venir
			basNiveau('math-decompo-60', etat(0, null)), // pas d'échéance programmée
			basNiveau('lecon-supprimee-du-catalogue'), // hors catalogue
		];
		for (const [nom, ortho, lecs] of scenarios) {
			for (const plafond of REVISION_PLAFOND_CHOIX) {
				expect(selectDueGroups(ortho, lecs, T0, plafond, inéligibles), `${nom}/${plafond}`).toEqual(
					selectDueGroups(ortho, lecs, T0, plafond),
				);
				expect(countDue(ortho, lecs, T0, plafond, inéligibles)).toBe(
					countDue(ortho, lecs, T0, plafond),
				);
			}
		}
	});

	it('un « acquis » du niveau inférieur ne ressort JAMAIS, même avec toute la place', () => {
		// Séance vide côté niveau actif : s'il devait sortir, ce serait ici.
		const groups = selectDueGroups(orthoVide(), {}, T0, 24, [
			basNiveau('math-tables-addition', etatAcquis()),
			basNiveau('math-doubles', etatAcquis()),
		]);
		expect(total(groups)).toBe(0);
		expect(countDue(orthoVide(), {}, T0, 24, [basNiveau('math-doubles', etatAcquis())])).toBe(0);
	});
});

/* ============================================================
   3. La dose prend ses slots DANS le plafond
   ============================================================ */
describe('sélection : la charge d’une séance ne grossit pas', () => {
	// Les deux sources débordent : 20 mots dus + 4 leçons dues + 5 notions basses dues.
	const bas5 = [
		'math-tables-addition',
		'math-complements',
		'math-decompo-60',
		'math-multiples-25',
		'math-dizaines-centaines',
	].map((id, i) => basNiveau(id, etatDu(T0 - (i + 1) * 30 * JOUR)));
	const lecs = () =>
		lecons(['math-doubles', 'math-moities', 'fr-conj-etre-present', 'fr-conj-avoir-present']);

	it('total = plafond exactement, dont la dose d’entretien, pour chaque plafond réglable', () => {
		for (const plafond of [0, ...REVISION_PLAFOND_CHOIX]) {
			const groups = selectDueGroups(motsDus(20), lecs(), T0, plafond, bas5);
			const items = aplati(groups);
			expect(items.length, `plafond ${plafond}`).toBe(plafond);
			expect(items.filter(estEntretien).length, `plafond ${plafond}`).toBe(
				plafondBasNiveau(plafond),
			);
		}
	});

	it('le stock bas est tronqué à la dose (5 dus, dose 2 à plafond 12)', () => {
		const items = aplati(selectDueGroups(motsDus(20), lecs(), T0, 12, bas5));
		expect(items.filter(estEntretien).length).toBe(2);
		expect(countDue(motsDus(20), lecs(), T0, 12, bas5)).toBe(20 + 4 + 2); // stock actif entier + dose
	});

	it('seuls les éléments d’entretien portent un `niveau` (impératif de génération)', () => {
		const items = aplati(selectDueGroups(motsDus(3), lecs(), T0, 20, bas5));
		for (const it of items) {
			if (it.kind === 'word') continue;
			const attendu = bas5.some((b) => b.lessonId === it.id) ? 'ce2' : undefined;
			expect(it.niveau, it.id).toBe(attendu);
		}
		expect(items.filter(estEntretien).length).toBe(3);
	});
});

/* ============================================================
   4. La dose est BORNÉE par le niveau actif (qu'elle ne dépasse jamais)
   ------------------------------------------------------------
   Attendu dérivé du critère « le niveau actif ne se fait pas coloniser » : la dose du
   plafond est rabattue au nombre d'éléments actifs DUS (mots + leçons du niveau actif),
   donc dose effective = min(dose(plafond), nbActifs), et la dose entière quand rien
   n'est dû au niveau actif. À parts égales (1 actif + 1 entretien) la séance est
   moitié-moitié : assumé, une séance de deux éléments ne colonise personne.
   ============================================================ */
describe('borne : la dose ne dépasse jamais le niveau actif dû', () => {
	// Stock bas volontairement large (4 notions dues) : c'est la borne qui décide, jamais
	// le stock disponible.
	const bas4 = [
		'math-tables-addition',
		'math-decompo-60',
		'math-multiples-25',
		'math-dizaines-centaines',
	].map((id, i) => basNiveau(id, etatDu(i ? T0 - (i + 1) * JOUR : null)));
	const actifsPossibles = [
		'math-doubles',
		'math-moities',
		'fr-conj-etre-present',
		'fr-conj-avoir-present',
		'num-comparer',
	];
	const seance = (nbActifs: number, plafond: number, nbMots = 0) =>
		aplati(
			selectDueGroups(
				motsDus(nbMots),
				lecons(actifsPossibles.slice(0, nbActifs)),
				T0,
				plafond,
				bas4,
			),
		);
	const doseServie = (nbActifs: number, plafond: number, nbMots = 0) =>
		seance(nbActifs, plafond, nbMots).filter(estEntretien).length;

	const plafonds = [6, 8, 12, 20, 24]; // doses de plafond : 0, 1, 2, 3, 3

	it('dose effective selon (nombre d’actifs dus, plafond)', () => {
		// Recalculé à la main : min(dose(plafond), nbActifs), la file active vide comptant
		// pour 2 — de sorte qu'une séance sans rien d'actif ne soit pas plus grosse que la
		// suivante (cf. monotonie).
		const attendu: [number, number[]][] = [
			[0, [0, 1, 2, 2, 2]], // aucun actif dû → dose du plafond, mais jamais plus de 2
			[1, [0, 1, 1, 1, 1]], // un seul actif → au plus un élément d'entretien
			[2, [0, 1, 2, 2, 2]],
			[3, [0, 1, 2, 3, 3]], // dès 3 actifs, la borne ne mord plus (dose max 3)
			[4, [0, 1, 2, 3, 3]],
			[5, [0, 1, 2, 3, 3]],
		];
		for (const [nbActifs, doses] of attendu)
			expect(
				plafonds.map((p) => doseServie(nbActifs, p)),
				`actifs=${nbActifs}`,
			).toEqual(doses);
	});

	it('taille de séance = actifs dus + dose effective', () => {
		// Même table lue en TAILLE de séance : c'est ce que l'enfant voit d'un jour à l'autre.
		const attendu: [number, number[]][] = [
			[0, [0, 1, 2, 2, 2]],
			[1, [1, 2, 2, 2, 2]],
			[2, [2, 3, 4, 4, 4]],
			[3, [3, 4, 5, 6, 6]],
			[4, [4, 5, 6, 7, 7]],
		];
		for (const [nbActifs, tailles] of attendu)
			expect(
				plafonds.map((p) => seance(nbActifs, p).length),
				`actifs=${nbActifs}`,
			).toEqual(tailles);
	});

	it('l’entretien n’est plus conditionné à la charge du niveau actif', () => {
		// Un seul élément actif dû suffit désormais à entretenir (séance moitié-moitié).
		expect(doseServie(1, 8)).toBe(1);
		expect(seance(1, 8).length).toBe(2);
		// La borne porte sur les DEUX sources : un mot dû compte comme un actif.
		expect(doseServie(0, 12, 1)).toBe(1);
		expect(doseServie(0, 12, 2)).toBe(2);
	});

	it('aucun actif dû : séance 100 % entretien, mais jamais plus de 2 éléments', () => {
		// Rien à coloniser, donc on sert ; mais pas plus que ce qu'une file active d'un
		// élément permettrait, sinon la séance rétrécirait le lendemain.
		for (const plafond of REVISION_PLAFOND_CHOIX) {
			const items = seance(0, plafond);
			expect(items.length, `plafond ${plafond}`).toBe(Math.min(plafondBasNiveau(plafond), 2));
			expect(items.every(estEntretien), `plafond ${plafond}`).toBe(true);
		}
	});

	it('INVARIANT : l’entretien ne DÉPASSE jamais le niveau actif servi', () => {
		let servi = 0;
		let paritesRencontrees = 0;
		for (let nbActifs = 1; nbActifs <= actifsPossibles.length; nbActifs++)
			for (let nbMots = 0; nbMots <= 8; nbMots += 2)
				for (const plafond of REVISION_PLAFOND_CHOIX) {
					const items = seance(nbActifs, plafond, nbMots);
					const e = items.filter(estEntretien).length;
					const ctx = `actifs=${nbActifs} mots=${nbMots} plafond=${plafond}`;
					expect(items.length - e, ctx).toBeGreaterThanOrEqual(e);
					expect(e, ctx).toBeLessThanOrEqual(plafondBasNiveau(plafond));
					if (e && items.length - e === e) paritesRencontrees++;
					servi += e;
				}
		expect(servi).toBeGreaterThan(50); // anti-test-vide
		expect(paritesRencontrees).toBeGreaterThan(0); // le cas « moitié-moitié » est bien atteint
	});

	it('MONOTONIE : une leçon de plus à réviser n’enlève jamais de travail à la séance', () => {
		// Garantie COMPLÈTE, dès la file active vide : d'un jour à l'autre, voir la dette du
		// niveau actif monter ne doit jamais faire RÉTRÉCIR la séance (l'enfant comparerait
		// deux jours consécutifs et verrait moins de travail alors qu'il y en a plus).
		for (const plafond of REVISION_PLAFOND_CHOIX) {
			const tailles = [0, 1, 2, 3, 4, 5].map((n) => seance(n, plafond).length);
			for (let n = 0; n < tailles.length - 1; n++)
				expect(tailles[n + 1], `plafond=${plafond} actifs=${n}→${n + 1}`).toBeGreaterThanOrEqual(
					tailles[n],
				);
			// Anti-test-vide : sur les plafonds qui entretiennent, la séance finit par croître.
			if (plafondBasNiveau(plafond)) expect(tailles[5], `plafond ${plafond}`).toBeGreaterThan(2);
		}
	});

	it('INVARIANT #478 : la carte annonce ce que la séance sert, borne comprise', () => {
		// countDue et selectDueGroups partagent la borne : si l'une l'oubliait, l'accueil
		// annoncerait des éléments que la séance ne proposerait jamais.
		for (let nbActifs = 0; nbActifs <= actifsPossibles.length; nbActifs++) {
			const lecs = lecons(actifsPossibles.slice(0, nbActifs));
			for (const plafond of [0, ...REVISION_PLAFOND_CHOIX]) {
				const dus = countDue(orthoVide(), lecs, T0, plafond, bas4);
				const proposes = total(selectDueGroups(orthoVide(), lecs, T0, plafond, bas4));
				const ctx = `actifs=${nbActifs} plafond=${plafond}`;
				expect(effortRevisionAffiche(dus, plafond).n, ctx).toBe(proposes);
				expect(dus, ctx).toBe(nbActifs + doseServie(nbActifs, plafond));
			}
		}
	});
});

/* ============================================================
   5. Choix du lot : le plus longtemps SANS TEST RÉEL
   ============================================================ */
describe('sélection du lot d’entretien : rotation du stock', () => {
	const actifs = () => lecons(['math-doubles', 'math-moities']);

	it('jamais testé passe devant un élément déjà testé', () => {
		const items = aplati(
			selectDueGroups(orthoVide(), actifs(), T0, 8, [
				basNiveau('math-complements', etatDu(T0 - 10 * JOUR)), // testé il y a 10 j
				basNiveau('math-tables-addition', etatDu(null)), // jamais testé
			]),
		);
		const lot = items.filter(estEntretien).map((it) => it.id);
		expect(lot).toEqual(['math-tables-addition']); // dose 1 → le jamais testé
	});

	it('à égalité de « jamais testé », départage par id (indépendant de l’ordre du tableau)', () => {
		const a = basNiveau('math-tables-addition', etatDu(null));
		const b = basNiveau('math-complements', etatDu(null));
		const lot = (bas: LeconBasNiveau[]) =>
			aplati(selectDueGroups(orthoVide(), actifs(), T0, 8, bas))
				.filter(estEntretien)
				.map((it) => it.id);
		// « math-complements » < « math-tables-addition » en ordre alphabétique.
		expect(lot([a, b])).toEqual(['math-complements']);
		expect(lot([b, a])).toEqual(['math-complements']);
	});

	it('le RETARD ne départage pas : un élément moins en retard mais délaissé passe d’abord', () => {
		const items = aplati(
			selectDueGroups(orthoVide(), actifs(), T0, 8, [
				// Très en retard (200 j) mais testé hier.
				basNiveau('math-complements', etat(1, T0 - 200 * JOUR, T0 - JOUR)),
				// À peine dû, mais plus testé depuis 300 j.
				basNiveau('math-tables-addition', etat(1, T0 - 1000, T0 - 300 * JOUR)),
			]),
		);
		expect(items.filter(estEntretien).map((it) => it.id)).toEqual(['math-tables-addition']);
	});

	it('DÉTERMINISME : permuter le tableau `bas` ne change pas la séance', () => {
		const bas = [
			basNiveau('math-tables-addition', etatDu(T0 - 30 * JOUR)),
			basNiveau('math-complements', etatDu(null)),
			basNiveau('math-decompo-60', etatDu(T0 - 5 * JOUR)),
			basNiveau('math-multiples-25', etatDu(null)),
		];
		const reference = selectDueGroups(motsDus(6), actifs(), T0, 12, bas);
		const permutations = [
			[...bas].reverse(),
			[bas[2], bas[0], bas[3], bas[1]],
			[bas[3], bas[2], bas[1], bas[0]],
		];
		for (const p of permutations) {
			expect(selectDueGroups(motsDus(6), actifs(), T0, 12, p)).toEqual(reference);
		}
		// Le lot retenu est bien celui des deux « jamais testés », par ordre d'id.
		expect(
			aplati(reference)
				.filter(estEntretien)
				.map((it) => it.id),
		).toEqual(['math-complements', 'math-multiples-25']);
	});
});

/* ============================================================
   6. Placement dans la séance
   ============================================================ */
describe('placement de l’entretien dans la séance', () => {
	it('pré-condition : les leçons du scénario existent, avec les catégories attendues', () => {
		const cat = (id: string) => getLessonById(id)?.category;
		for (const id of ['math-doubles', 'math-moities', 'math-complements', 'math-tables-addition'])
			expect(cat(id), id).toBe('math-calcul-mental');
		for (const id of ['fr-conj-etre-present', 'fr-conj-avoir-present', 'fr-conj-aimer-present'])
			expect(cat(id), id).toBe('fr-conjugaison');
		expect(cat('fr-conj-etre-imparfait')).toBe('fr-conjugaison');
		expect(cat('num-comparer')).toBe('math-numeration');
	});

	/* Le cas du CM1 qui travaille géométrie et problèmes pendant que sa dette CE2 porte sur
	   d'autres notions : PLUSIEURS catégories d'entretien, AUCUNE en commun avec la séance.
	   Chaque insertion crée un groupe, et l'enjeu est que ces insertions répétées ne poussent
	   jamais l'ancien dernier groupe de sa place. Les leçons sont tirées du catalogue par
	   catégorie (l'ordre attendu est dérivé des RÔLES, pas d'ids figés). */
	const leconsDe = (categoryId: string, n: number): string[] => {
		const ids = getAllLessons()
			.filter((l) => l.category === categoryId)
			.slice(0, n)
			.map((l) => l.id);
		if (ids.length < n) throw new Error(`catalogue : ${categoryId} a moins de ${n} leçons`);
		return ids;
	};

	it('trois catégories d’entretien sans correspondance → trois groupes, tous avant le dernier', () => {
		const [geo1, geo2] = leconsDe('math-geometrie', 2);
		const [prob1, prob2] = leconsDe('math-problemes', 2);
		const [mcm] = leconsDe('math-calcul-mental', 1);
		const [conj] = leconsDe('fr-conjugaison', 1);
		const [num] = leconsDe('math-numeration', 1);
		// 4 actifs (géométrie la plus en retard, puis problèmes) → 2 blocs ; plafond 20 → dose 3.
		const groups = selectDueGroups(orthoVide(), lecons([geo1, geo2, prob1, prob2]), T0, 20, [
			basNiveau(mcm, etatDu(null)), // jamais testé → 1er du lot
			basNiveau(conj, etatDu(T0 - 100 * JOUR)), // 2e
			basNiveau(num, etatDu(T0 - 10 * JOUR)), // 3e
		]);
		// Attendu recalculé : chaque groupe créé s'insère avant le dernier groupe, donc ils
		// s'empilent dans l'ordre du lot entre la géométrie et les problèmes, qui reste dernier.
		expect(groups.map((g) => g.categoryId)).toEqual([
			'math-geometrie',
			'math-calcul-mental',
			'fr-conjugaison',
			'math-numeration',
			'math-problemes',
		]);
		const items = aplati(groups);
		expect(items.map((it) => it.id)).toEqual([geo1, geo2, mcm, conj, num, prob1, prob2]);
		expect(estEntretien(items[0])).toBe(false); // 2 catégories actives → pas d'ouverture
		expect(estEntretien(items[items.length - 1])).toBe(false); // et surtout pas de clôture
		// L'invariant tient à travers les 3 insertions : le dernier groupe est resté actif.
		expect(groups[groups.length - 1].items.some(estEntretien)).toBe(false);
	});

	it('deux notions d’entretien d’une même catégorie absente → un seul groupe créé', () => {
		const [geo1, geo2] = leconsDe('math-geometrie', 2);
		const [prob1, prob2] = leconsDe('math-problemes', 2);
		const [mcmA, mcmB] = leconsDe('math-calcul-mental', 2);
		const [conj] = leconsDe('fr-conjugaison', 1);
		const groups = selectDueGroups(orthoVide(), lecons([geo1, geo2, prob1, prob2]), T0, 20, [
			basNiveau(mcmA, etatDu(null)), // 1er du lot → crée le groupe
			basNiveau(mcmB, etatDu(T0 - 100 * JOUR)), // 2e → rejoint le groupe créé
			basNiveau(conj, etatDu(T0 - 10 * JOUR)), // 3e → nouveau groupe
		]);
		expect(groups.map((g) => g.categoryId)).toEqual([
			'math-geometrie',
			'math-calcul-mental',
			'fr-conjugaison',
			'math-problemes',
		]);
		expect(aplati(groups).map((it) => it.id)).toEqual([
			geo1,
			geo2,
			mcmA,
			mcmB, // les deux notions restent groupées sous leur catégorie
			conj,
			prob1,
			prob2,
		]);
		expect(groups[groups.length - 1].items.some(estEntretien)).toBe(false);
	});

	it('chaque élément est glissé derrière le DERNIER actif de sa catégorie, jamais en clôture', () => {
		// 6 actifs : 3 en calcul mental (les plus en retard) puis 3 en conjugaison.
		// Dose 2 à plafond 12 : une notion basse par catégorie.
		const groups = selectDueGroups(
			orthoVide(),
			lecons([
				'math-doubles',
				'math-moities',
				'math-complements',
				'fr-conj-etre-present',
				'fr-conj-avoir-present',
				'fr-conj-aimer-present',
			]),
			T0,
			12,
			[
				basNiveau('math-tables-addition', etatDu(null)),
				basNiveau('fr-conj-etre-imparfait', etatDu(T0 - 100 * JOUR)),
			],
		);
		// Ordre attendu, recalculé à la main : dans son bloc, l'entretien passe derrière les
		// actifs de sa catégorie ; dans le DERNIER bloc, il doit en plus laisser la dernière
		// place à un actif (→ avant-dernier en conjugaison).
		expect(aplati(groups).map((it) => it.id)).toEqual([
			'math-doubles',
			'math-moities',
			'math-complements',
			'math-tables-addition', // entretien, en fin de bloc « calcul mental »
			'fr-conj-etre-present',
			'fr-conj-avoir-present',
			'fr-conj-etre-imparfait', // entretien, avant-dernier (clamp de clôture)
			'fr-conj-aimer-present',
		]);
		expect(groups.map((g) => g.categoryId)).toEqual(['math-calcul-mental', 'fr-conjugaison']);
	});

	it('sans catégorie commune, le groupe d’entretien est inséré AVANT le dernier groupe', () => {
		// 2 catégories actives → « avant le dernier groupe » = 2e position.
		const deuxBlocs = selectDueGroups(
			orthoVide(),
			lecons([
				'math-doubles',
				'math-moities', // calcul mental (les plus en retard)
				'fr-conj-etre-present',
				'fr-conj-avoir-present', // conjugaison
			]),
			T0,
			8,
			[basNiveau('num-comparer', etatDu(null))], // numération : aucun actif de cette catégorie
		);
		expect(deuxBlocs.map((g) => g.categoryId)).toEqual([
			'math-calcul-mental',
			'math-numeration', // groupe d'entretien, avant le dernier groupe
			'fr-conjugaison',
		]);
		let items = aplati(deuxBlocs);
		expect(estEntretien(items[0])).toBe(false); // pas en ouverture (2 catégories actives)
		expect(estEntretien(items[items.length - 1])).toBe(false); // ni en clôture
		expect(items.findIndex(estEntretien)).toBe(2);

		// 3 catégories actives : c'est bien « avant le DERNIER groupe » (3e position), pas
		// « en 2e position » — les deux règles se distinguent ici.
		const troisBlocs = selectDueGroups(
			motsDus(4), // l'orthographe, source la moins en retard → dernier bloc
			lecons(['math-doubles', 'math-moities', 'fr-conj-etre-present', 'fr-conj-avoir-present']),
			T0,
			20,
			[basNiveau('num-comparer', etatDu(null))],
		);
		expect(troisBlocs.map((g) => g.categoryId)).toEqual([
			'math-calcul-mental',
			'fr-conjugaison',
			'math-numeration', // groupe d'entretien, juste avant le dernier groupe
			ORTHO_CATEGORY_ID,
		]);
		items = aplati(troisBlocs);
		expect(estEntretien(items[0])).toBe(false);
		expect(estEntretien(items[items.length - 1])).toBe(false);
	});

	it('arbitrage : quand il faut choisir, l’entretien OUVRE la séance plutôt que de la clore', () => {
		// Un seul actif : les deux places sont extrêmes, aucune position intérieure n'existe.
		// La règle « jamais en clôture » l'emporte → l'entretien passe devant.
		const duo = aplati(
			selectDueGroups(orthoVide(), lecons(['math-doubles']), T0, 8, [
				basNiveau('math-tables-addition', etatDu(null)),
			]),
		);
		expect(duo.map((it) => it.id)).toEqual(['math-tables-addition', 'math-doubles']);
		expect(estEntretien(duo[duo.length - 1])).toBe(false); // la séance finit sur du niveau actif

		// Même arbitrage sur un seul BLOC actif, cas très fréquent : une séance d'orthographe
		// (la grosse source) est un bloc unique, où l'entretien maths ne peut pas s'intercaler.
		const orthoSeule = selectDueGroups(motsDus(20), {}, T0, 12, [
			basNiveau('math-doubles', etatDu(null)),
			basNiveau('math-moities', etatDu(T0 - 30 * JOUR)),
		]);
		expect(orthoSeule.map((g) => g.categoryId)).toEqual(['math-calcul-mental', ORTHO_CATEGORY_ID]);
		const items = aplati(orthoSeule);
		expect(items.length).toBe(12); // la charge de séance ne bouge pas
		expect(items.slice(0, 2).every(estEntretien)).toBe(true); // dose 2 en ouverture
		expect(items.slice(2).some(estEntretien)).toBe(false);
		expect(estEntretien(items[items.length - 1])).toBe(false);
	});

	it('aucun actif dû : la séance ne contient que l’entretien, dans l’ordre du lot', () => {
		// Les deux règles de placement n'ont plus d'objet ; seul le tri du lot s'applique
		// (jamais testé d'abord, puis le plus anciennement testé), tronqué à la dose.
		const groups = selectDueGroups(orthoVide(), {}, T0, 12, [
			basNiveau('math-doubles', etatDu(T0 - 5 * JOUR)), // testé récemment → hors dose
			basNiveau('fr-conj-etre-imparfait', etatDu(null)), // jamais testé
			basNiveau('math-moities', etatDu(T0 - 50 * JOUR)),
		]);
		const items = aplati(groups);
		expect(items.map((it) => it.id)).toEqual(['fr-conj-etre-imparfait', 'math-moities']);
		expect(items.every(estEntretien)).toBe(true);
		// Chaque élément reste sous l'intitulé de SA catégorie.
		expect(groups.map((g) => g.categoryId)).toEqual(['fr-conjugaison', 'math-calcul-mental']);
	});

	it('INVARIANTS par échantillonnage : jamais en clôture, et pas en ouverture dès qu’une place intérieure existe', () => {
		const catalogueActif = [
			'math-doubles',
			'math-moities',
			'math-complements',
			'fr-conj-etre-present',
			'fr-conj-avoir-present',
			'num-comparer',
			'fr-conj-aimer-present',
		];
		// Deux profils de dette basse : l'un RECOUVRE les catégories actives (l'entretien
		// rejoint des blocs existants), l'autre en est totalement DISJOINT (chaque élément crée
		// son groupe — insertions répétées, cas du CM1 qui travaille autre chose que sa dette).
		const stocksBas: [string, string[]][] = [
			[
				'recouvrant',
				['math-tables-addition', 'math-decompo-60', 'fr-conj-etre-imparfait', 'math-multiples-25'],
			],
			[
				'disjoint',
				[
					leconsDe('math-geometrie', 1)[0],
					leconsDe('math-problemes', 1)[0],
					leconsDe('math-grandeurs-mesures', 1)[0],
					leconsDe('fr-vocabulaire', 1)[0],
				],
			],
		];
		let avecEntretien = 0;
		let ouverturesEntretien = 0; // combien de séances paient l'arbitrage
		let placesInterieures = 0; // combien avaient une place intérieure disponible
		let groupesCrees = 0; // combien de groupes nés d'un entretien seul
		for (const [profil, stockBas] of stocksBas)
			for (let nbActifs = 1; nbActifs <= catalogueActif.length; nbActifs++) {
				for (let nbMots = 0; nbMots <= 12; nbMots += 4) {
					for (let nbBas = 1; nbBas <= stockBas.length; nbBas++) {
						for (const plafond of REVISION_PLAFOND_CHOIX) {
							const bas = stockBas
								.slice(0, nbBas)
								.map((id, i) => basNiveau(id, etatDu(i % 2 ? T0 - (i + 1) * JOUR : null)));
							const groups = selectDueGroups(
								motsDus(nbMots),
								lecons(catalogueActif.slice(0, nbActifs)),
								T0,
								plafond,
								bas,
							);
							const items = aplati(groups);
							const ctx = `${profil} actifs=${nbActifs} mots=${nbMots} bas=${nbBas} plafond=${plafond}`;
							expect(items.length, ctx).toBeLessThanOrEqual(plafond);
							const entretien = items.filter(estEntretien);
							expect(entretien.length, ctx).toBeLessThanOrEqual(plafondBasNiveau(plafond));
							if (entretien.length) {
								avecEntretien++;
								const actifs = items.filter((it) => !estEntretien(it));
								// Garantie FORTE : dès qu'il reste du niveau actif, la séance FINIT dessus —
								// on ne laisse jamais l'enfant sur un échec de l'année passée — et le niveau
								// actif y reste majoritaire.
								expect(actifs.length, ctx).toBeGreaterThan(0);
								expect(actifs.length, ctx).toBeGreaterThanOrEqual(entretien.length);
								expect(estEntretien(items[items.length - 1]), ctx).toBe(false);
								// Même chose vue par GROUPES : quel que soit le nombre de groupes créés par
								// l'entretien, aucun groupe fait UNIQUEMENT d'entretien ne finit dernier (les
								// insertions successives ne poussent pas le dernier groupe de sa place).
								const dernier = groups[groups.length - 1];
								expect(dernier.items.every(estEntretien), ctx).toBe(false);
								groupesCrees += groups.filter((g) => g.items.every(estEntretien)).length;
								// « Pas en ouverture » ne tient plus partout : il faut qu'une place intérieure
								// existe, c'est-à-dire au moins DEUX catégories actives (avec une seule, le bloc
								// d'entretien n'a que le début ou la fin à sa disposition).
								if (new Set(actifs.map((it) => it.categoryId)).size >= 2) {
									placesInterieures++;
									expect(estEntretien(items[0]), ctx).toBe(false);
								} else if (estEntretien(items[0])) ouverturesEntretien++;
								// Chaque élément d'entretien est révisé sous l'intitulé de SA catégorie.
								for (const g of groups)
									for (const it of g.items) expect(it.categoryId, ctx).toBe(g.categoryId);
								// Et il porte bien son niveau de stockage.
								for (const it of entretien) expect(it.kind === 'lesson' && it.niveau).toBe('ce2');
							}
						}
					}
				}
			}
		expect(avecEntretien).toBeGreaterThan(200); // anti-test-vide
		expect(placesInterieures).toBeGreaterThan(50); // la garantie d'ouverture est vraiment exercée…
		expect(ouverturesEntretien).toBeGreaterThan(0); // …et son exception aussi (arbitrage assumé)
		expect(groupesCrees).toBeGreaterThan(200); // …et des groupes ont bien été créés de toutes pièces
	});
});

/* ============================================================
   7. « Ce que la carte annonce = ce que la séance propose » (#478) avec entretien
   ============================================================ */
describe('cohérence carte d’accueil ↔ séance, entretien compris', () => {
	it('INVARIANT : effortRevisionAffiche(countDue) = ce que selectDueGroups propose', () => {
		const bas3 = [
			basNiveau('math-tables-addition', etatDu(null)),
			basNiveau('math-decompo-60', etatDu(T0 - 40 * JOUR)),
			basNiveau('fr-conj-etre-imparfait', etatDu(T0 - 400 * JOUR)),
		];
		const scenarios: [string, OrthoState, Record<string, EtatRevision>, LeconBasNiveau[]][] = [
			['rien du tout', orthoVide(), {}, []],
			['entretien SEUL (aucun actif dû)', orthoVide(), {}, bas3],
			['1 actif + entretien', orthoVide(), lecons(['math-doubles']), bas3],
			['mots + entretien', motsDus(20), {}, bas3],
			[
				'mots + leçons + entretien',
				motsDus(8),
				lecons(['math-doubles', 'math-moities', 'fr-conj-etre-present']),
				bas3,
			],
			[
				'entretien inéligible',
				motsDus(5),
				lecons(['math-doubles']),
				[basNiveau('math-complements', etatAcquis())],
			],
		];
		const regimes = new Set<boolean>();
		let avecEntretien = 0;
		for (const [nom, ortho, lecs, bas] of scenarios) {
			for (const plafond of [0, ...REVISION_PLAFOND_CHOIX]) {
				const dus = countDue(ortho, lecs, T0, plafond, bas);
				const annonce = effortRevisionAffiche(dus, plafond);
				const groups = selectDueGroups(ortho, lecs, T0, plafond, bas);
				const proposes = total(groups);
				expect(annonce.n, `${nom} / plafond ${plafond}`).toBe(proposes);
				expect(annonce.plafonne, `${nom} / plafond ${plafond}`).toBe(dus > proposes);
				regimes.add(annonce.plafonne);
				if (aplati(groups).some(estEntretien)) avecEntretien++;
			}
		}
		expect([...regimes].sort()).toEqual([false, true]);
		expect(avecEntretien).toBeGreaterThan(0); // l'entretien a bien été exercé
	});

	it('entretien SEUL : la carte annonce la dose, pas le stock dormant', () => {
		const bas = [
			basNiveau('math-tables-addition', etatDu(null)),
			basNiveau('math-decompo-60', etatDu(null)),
			basNiveau('math-multiples-25', etatDu(null)),
			basNiveau('math-complements', etatDu(null)),
		];
		// 4 notions basses dues, mais une séance de 8 n'en entretient qu'une.
		expect(countDue(orthoVide(), {}, T0, 8, bas)).toBe(1);
		expect(total(selectDueGroups(orthoVide(), {}, T0, 8, bas))).toBe(1);
		// Et à plafond 6, l'entretien est suspendu → « rien à réviser », séance vide.
		expect(countDue(orthoVide(), {}, T0, 6, bas)).toBe(0);
		expect(total(selectDueGroups(orthoVide(), {}, T0, 6, bas))).toBe(0);
	});
});

/* ============================================================
   8. Horizon annoncé et « profil neuf » vs « tout à jour »
   ============================================================ */
describe('prochaineEcheance / aDesRevisions avec l’entretien', () => {
	it('une échéance basse À VENIR entre dans l’horizon annoncé', () => {
		// Aucun rendez-vous côté niveau actif : sans #232, l'accueil n'annonçait rien.
		expect(prochaineEcheance(orthoVide(), {}, T0)).toBe(null);
		expect(
			prochaineEcheance(orthoVide(), {}, T0, [basNiveau('math-doubles', etat(2, T0 + 3 * JOUR))]),
		).toBe(T0 + 3 * JOUR);
	});

	it('retient le plus proche, ignore acquis / déjà dû / hors catalogue', () => {
		const bas = [
			basNiveau('math-tables-addition', etatAcquis()), // acquis → aucun rendez-vous
			basNiveau('math-doubles', etat(1, T0 - JOUR)), // déjà dû → relève de countDue
			basNiveau('lecon-inconnue', etat(1, T0 + JOUR)), // hors catalogue → ignorée
			basNiveau('math-moities', etat(2, T0 + 9 * JOUR)),
			basNiveau('math-complements', etat(2, T0 + 4 * JOUR)), // le plus proche
		];
		expect(prochaineEcheance(orthoVide(), {}, T0, bas)).toBe(T0 + 4 * JOUR);
		// L'échéance du niveau ACTIF garde la priorité si elle est plus proche.
		expect(
			prochaineEcheance(orthoVide(), { 'math-doubles': etat(1, T0 + 2 * JOUR) }, T0, bas),
		).toBe(T0 + 2 * JOUR);
	});

	it('aDesRevisions : un stock uniquement bas n’est pas un profil neuf', () => {
		expect(aDesRevisions(orthoVide(), {})).toBe(false);
		expect(aDesRevisions(orthoVide(), {}, [])).toBe(false);
		expect(aDesRevisions(orthoVide(), {}, [basNiveau('math-doubles', etatAcquis())])).toBe(true);
		// Une leçon disparue du catalogue ne suffit pas à déclarer un suivi.
		expect(aDesRevisions(orthoVide(), {}, [basNiveau('lecon-inconnue')])).toBe(false);
	});
});

/* ============================================================
   9. Le seam de stockage : quelles clés sont de l'entretien ?
   ============================================================ */
describe('loadLessonRevisionsBasNiveau : filtrage des clés `lessonId@niveau`', () => {
	const cles = (bas: LeconBasNiveau[]) => bas.map((b) => b.lessonId).sort();

	it('sous un profil CM1 : garde @ce2, avec son niveau et son état intacts', () => {
		setNiveauReference('cm1');
		const e = etatDu(T0 - 50 * JOUR);
		lsSet(LESSON_REVISION_KEY, { 'math-doubles@ce2': e });
		const bas = loadLessonRevisionsBasNiveau();
		expect(bas).toEqual([{ lessonId: 'math-doubles', niveau: 'ce2', etat: e }]);
	});

	it('écarte le niveau actif, ce qui est AU-DESSUS, et ce qui est à 2 niveaux en dessous', () => {
		setNiveauReference('cm1');
		lsSet(LESSON_REVISION_KEY, {
			'num-comparer@cm1': etatDu(), // niveau ACTIF → vue scopée, pas entretien
			'num-comparer@ce2': etatDu(), // -1 niveau → entretien
			'math-doubles@ce1': etatDu(), // -2 niveaux → dette abandonnée
			'math-moities@cm2': etatDu(), // au-dessus du niveau suivi → dormant
		});
		expect(cles(loadLessonRevisionsBasNiveau())).toEqual(['num-comparer']);
		// Disjonction : aucune clé n'est à la fois dans la vue active et dans l'entretien.
		expect(Object.keys(loadLessonRevisions())).toEqual(['num-comparer']);
		expect(loadLessonRevisions()['num-comparer']).toBeDefined();
	});

	it('écarte une leçon absente du catalogue et un niveau corrompu dans la clé', () => {
		setNiveauReference('cm1');
		lsSet(LESSON_REVISION_KEY, {
			'lecon-supprimee@ce2': etatDu(), // hors catalogue
			'math-doubles@ce3': etatDu(), // niveau inexistant
			'math-moities@': etatDu(), // niveau vide
			'math-complements@CE2': etatDu(), // casse différente → pas un niveau connu
		});
		expect(loadLessonRevisionsBasNiveau()).toEqual([]);
	});

	it('résout le niveau PAR MATIÈRE (un français resté en CE2 n’entretient pas du CE2)', () => {
		setNiveauReference('cm1');
		setNiveauMatiere('francais', 'ce2'); // français suivi en CE2 → son inférieur est le CE1
		lsSet(LESSON_REVISION_KEY, {
			'math-doubles@ce2': etatDu(), // math suivi en CM1 → entretien
			'fr-conj-etre-present@ce2': etatDu(), // français : c'est son niveau ACTIF
		});
		expect(cles(loadLessonRevisionsBasNiveau())).toEqual(['math-doubles']);
	});

	it('profil au plus bas niveau du catalogue (CE2) : aucun entretien', () => {
		setNiveauReference('ce2');
		lsSet(LESSON_REVISION_KEY, { 'math-doubles@ce2': etatDu(), 'num-comparer@cm1': etatDu() });
		expect(loadLessonRevisionsBasNiveau()).toEqual([]);
	});

	it('clé legacy sans `@` : lue comme du CE2 (convention de migration #225)', () => {
		setNiveauReference('cm1');
		lsSet(LESSON_REVISION_KEY, { 'math-doubles': etatDu() });
		expect(loadLessonRevisionsBasNiveau()).toEqual([
			{ lessonId: 'math-doubles', niveau: 'ce2', etat: etatDu() },
		]);
	});

	it('DÉTERMINISME : l’ordre d’énumération du stockage ne change pas la séance', () => {
		const seance = (ordre: string[]) => {
			localStorage.clear();
			setOnDataWrite(touchActiveProfile);
			initProfiles();
			setNiveauReference('cm1');
			const raw: Record<string, EtatRevision> = {};
			// Deux jamais testés + un testé : le tri doit venir des DONNÉES, pas de l'ordre des clés.
			const etats: Record<string, EtatRevision> = {
				'math-tables-addition@ce2': etatDu(null),
				'math-complements@ce2': etatDu(null),
				'math-decompo-60@ce2': etatDu(T0 - 2 * JOUR),
			};
			for (const k of ordre) raw[k] = etats[k];
			lsSet(LESSON_REVISION_KEY, raw);
			return aplati(
				selectDueGroups(motsDus(6), loadLessonRevisions(), T0, 12, loadLessonRevisionsBasNiveau()),
			).map((it) => it.id);
		};
		const ordreA = ['math-tables-addition@ce2', 'math-complements@ce2', 'math-decompo-60@ce2'];
		const reference = seance(ordreA);
		expect(seance([...ordreA].reverse())).toEqual(reference);
		expect(
			seance(['math-decompo-60@ce2', 'math-tables-addition@ce2', 'math-complements@ce2']),
		).toEqual(reference);
		// Dose 2 : les deux jamais testés, par ordre d'id.
		expect(reference.filter((id) => id.startsWith('math-'))).toEqual([
			'math-complements',
			'math-tables-addition',
		]);
	});
});

/* ============================================================
   10. Boucle fermée : la clé réécrite après une réponse
   ============================================================ */
describe('avancerLessonRevision : clé écrite avec et sans `niveau`', () => {
	const raw = (): Record<string, EtatRevision> => lsGet(LESSON_REVISION_KEY, {});

	it('sans `niveau` : écrit sur la clé du niveau de stockage habituel', () => {
		setNiveauReference('cm1');
		avancerLessonRevision('num-comparer', true, T0); // leçon CE2+CM1, jouée en CM1
		expect(Object.keys(raw())).toEqual(['num-comparer@cm1']);
		// Une leçon CE2-only reste rangée @ce2 même sous un profil CM1 (clamp de génération).
		avancerLessonRevision('math-doubles', true, T0);
		expect(Object.keys(raw()).sort()).toEqual(['math-doubles@ce2', 'num-comparer@cm1']);
	});

	it('avec `niveau` : force la clé du niveau entretenu, sans toucher au niveau actif', () => {
		setNiveauReference('cm1');
		const initial = etat(1, T0 - JOUR, T0 - 60 * JOUR);
		lsSet(LESSON_REVISION_KEY, { 'num-comparer@ce2': initial, 'num-comparer@cm1': etatFutur() });
		avancerLessonRevision('num-comparer', true, T0, 'ce2');
		const apres = raw();
		expect(Object.keys(apres).sort()).toEqual(['num-comparer@ce2', 'num-comparer@cm1']);
		// Escalier #45 : palier 1 → 2, re-test dans 7 jours, dernier test daté d'aujourd'hui.
		expect(apres['num-comparer@ce2']).toEqual({
			palier: 2,
			prochaineRevision: T0 + 7 * JOUR,
			reussites: initial.reussites + 1,
			dernierTest: T0,
		});
		expect(apres['num-comparer@cm1']).toEqual(etatFutur()); // intacte
	});

	it('boucle fermée : la notion entretenue cesse d’être due, sans clé fantôme', () => {
		setNiveauReference('cm1');
		lsSet(LESSON_REVISION_KEY, { 'math-doubles@ce2': etatDu(T0 - 90 * JOUR) });
		const [avant] = loadLessonRevisionsBasNiveau();
		expect(estDu(avant.etat, T0)).toBe(true);

		avancerLessonRevision(avant.lessonId, true, T0, avant.niveau);

		const [apres] = loadLessonRevisionsBasNiveau();
		expect(estDu(apres.etat, T0)).toBe(false); // repoussée de plusieurs jours
		expect(apres.etat.dernierTest).toBe(T0); // le tri du lot pourra la faire tourner
		expect(Object.keys(raw())).toEqual(['math-doubles@ce2']); // aucune clé @cm1 fantôme
		expect(loadLessonRevisions()['math-doubles']).toBeUndefined();
	});

	it('contre-épreuve : sans le `niveau`, l’entrée basse resterait due à jamais', () => {
		setNiveauReference('cm1');
		lsSet(LESSON_REVISION_KEY, { 'math-doubles@ce2': etatDu(T0 - 90 * JOUR) });
		avancerLessonRevision('math-doubles', true, T0); // le paramètre oublié
		// math-doubles est CE2-only → son niveau de stockage est déjà @ce2, donc ici la bonne
		// clé est touchée par chance. La leçon MULTI-NIVEAU, elle, dérape :
		lsSet(LESSON_REVISION_KEY, { 'num-comparer@ce2': etatDu(T0 - 90 * JOUR) });
		avancerLessonRevision('num-comparer', true, T0);
		expect(Object.keys(raw()).sort()).toEqual(['num-comparer@ce2', 'num-comparer@cm1']); // fantôme
		expect(estDu(loadLessonRevisionsBasNiveau()[0].etat, T0)).toBe(true); // toujours due
	});
});

/* ============================================================
   11. Câblage des écrans : countDusSeance
   ============================================================ */
describe('countDusSeance : ce que les trois écrans annoncent', () => {
	it('compte l’entretien selon le plafond, et le suspend sur une séance de 6', () => {
		setNiveauReference('cm1');
		lsSet(LESSON_REVISION_KEY, {
			'math-doubles@ce2': etatDu(null),
			'math-moities@ce2': etatDu(null),
			'math-complements@ce2': etatDu(null),
			'math-decompo-60@ce2': etatDu(null),
		});
		// Rien de dû au niveau actif ici : la dose du plafond s'applique, bornée à 2.
		expect(countDusSeance(orthoVide(), T0, 6)).toBe(0); // entretien suspendu
		expect(countDusSeance(orthoVide(), T0, 8)).toBe(1);
		expect(countDusSeance(orthoVide(), T0, 12)).toBe(2);
		expect(countDusSeance(orthoVide(), T0, 24)).toBe(2);
		// Avec 3 mots dus au niveau actif, la borne ne mord plus : dose pleine à plafond 24.
		expect(countDusSeance(motsDus(3), T0, 24)).toBe(3 + 3);
	});

	it('reste d’accord avec la séance réellement proposée', () => {
		setNiveauReference('cm1');
		lsSet(LESSON_REVISION_KEY, {
			'num-comparer@cm1': etatDu(), // niveau actif
			'math-doubles@ce2': etatDu(null),
			'math-moities@ce2': etatDu(T0 - 20 * JOUR),
			'math-complements@ce2': etatDu(null),
		});
		const ortho = motsDus(4);
		for (const plafond of REVISION_PLAFOND_CHOIX) {
			const annonce = effortRevisionAffiche(countDusSeance(ortho, T0, plafond), plafond);
			const proposes = total(
				selectDueGroups(ortho, loadLessonRevisions(), T0, plafond, loadLessonRevisionsBasNiveau()),
			);
			expect(annonce.n, `plafond ${plafond}`).toBe(proposes);
		}
	});
});
