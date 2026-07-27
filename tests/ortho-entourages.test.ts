/* ============================================================
   Atelier du mot — entourages (src/core/orthographe/entourages.ts, #462).
   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés du
   contrat du geste enfant (« recliquer une lettre entourée retire l'entourage »,
   jamais de superposition, une teinte par entourage visible), jamais recopiés de
   l'implémentation.

   Ce qui est éprouvé :
   - le prédicat de recouvrement au cran près (adjacence exacte ≠ chevauchement) ;
   - la BASCULE : ajout sur zone libre, retrait dès UNE lettre commune (inclusion,
     englobement, plusieurs entourages d'un coup), sans jamais rien réajouter ;
   - la pureté (aucune mutation de l'entrée) et la normalisation des bornes ;
   - l'unicité des teintes sur une séquence ajout/retrait/ajout (le piège de la
     couleur indexée par la longueur), et le recyclage borné à palette saturée ;
   - les entourages CHEVAUCHANTS déjà sauvegardés (l'atelier les autorisait avant
     #462 : `mot.entourage` persisté peut en contenir) ;
   - l'aperçu du geste (`apercuGeste`) : tout l'entourage condamné signalé, mais AUCUNE
     lettre jamais entourée marquée « en cours d'effacement » (plus d'enveloppe) ;
   - des invariants sur un grand échantillon de séquences de gestes (graine fixe).
   Le geste lui-même (pointer, hit-testing, classes CSS, SVG) vit dans
   src/ui/ortho-atelier.ts → e2e.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	recouvre,
	entouragesRecouverts,
	basculerEntourage,
	prochaineCouleur,
	apercuGeste,
	type EtatApercu,
} from '../src/core/orthographe/entourages';
import type { Entourage } from '../src/core/orthographe/types';
import { withSeed, rnd } from '../src/core/utils';

/** Taille de la palette de l'atelier (Okabe-Ito, cf. src/ui/ortho-atelier.ts). */
const NB = 6;

/** Entourage [debut, fin] (bornes incluses) de teinte `couleur`. */
const ent = (debut: number, fin: number, couleur = 0): Entourage => ({ debut, fin, couleur });
/** Plages seules, pour comparer un état sans se soucier des teintes. */
const plages = (es: readonly Entourage[]): string[] => es.map((e) => `${e.debut}-${e.fin}`);
/** Teintes dans l'ordre du tableau. */
const teintes = (es: readonly Entourage[]): number[] => es.map((e) => e.couleur);
/** Deux plages partagent-elles au moins une lettre ? (formulation indépendante du code) */
const seChevauchent = (a: Entourage, b: Entourage): boolean => a.debut <= b.fin && b.debut <= a.fin;
/** Aperçu sous une forme lisible : états indexés par lettre (les absentes = non concernées). */
function apercu(
	es: readonly Entourage[],
	a: number,
	b: number,
): { recouverts: number[]; lettres: Record<number, EtatApercu> } {
	const { recouverts, etats } = apercuGeste(es, a, b);
	const lettres: Record<number, EtatApercu> = {};
	for (const [i, etat] of [...etats].sort((x, y) => x[0] - y[0])) lettres[i] = etat;
	return { recouverts, lettres };
}

describe('recouvre — « au moins une lettre commune »', () => {
	it('compte un chevauchement d’un seul cran, à droite comme à gauche', () => {
		expect(recouvre(ent(2, 4), 4, 6)).toBe(true);
		expect(recouvre(ent(2, 4), 0, 2)).toBe(true);
	});
	it('ne compte pas l’adjacence exacte (plages collées, aucune lettre partagée)', () => {
		expect(recouvre(ent(2, 4), 5, 7)).toBe(false);
		expect(recouvre(ent(2, 4), 0, 1)).toBe(false);
	});
	it('reconnaît une lettre unique posée sur un bord, refuse la voisine', () => {
		expect(recouvre(ent(2, 4), 2, 2)).toBe(true);
		expect(recouvre(ent(2, 4), 4, 4)).toBe(true);
		expect(recouvre(ent(2, 4), 1, 1)).toBe(false);
		expect(recouvre(ent(2, 4), 5, 5)).toBe(false);
	});
	it('reconnaît une plage strictement incluse et une plage englobante', () => {
		expect(recouvre(ent(2, 4), 3, 3)).toBe(true);
		expect(recouvre(ent(2, 4), 0, 9)).toBe(true);
	});
	it('gère un entourage d’une seule lettre (tap)', () => {
		expect(recouvre(ent(3, 3), 3, 3)).toBe(true);
		expect(recouvre(ent(3, 3), 2, 2)).toBe(false);
		expect(recouvre(ent(3, 3), 4, 4)).toBe(false);
		expect(recouvre(ent(3, 3), 2, 4)).toBe(true);
	});
	it('bornes inversées : même verdict qu’à l’endroit', () => {
		expect(recouvre(ent(2, 4), 6, 3)).toBe(true); // plage [3,6] : partage la lettre 4
		expect(recouvre(ent(2, 4), 2, 0)).toBe(true); // plage [0,2] : partage la lettre 2
		expect(recouvre(ent(2, 4), 7, 5)).toBe(false); // plage [5,7] : collée, rien en commun
		expect(recouvre(ent(2, 4), 1, 0)).toBe(false); // plage [0,1] : avant l'entourage
		expect(recouvre(ent(3, 3), 9, 0)).toBe(true); // plage englobante, à l'envers
	});
});

describe('entouragesRecouverts — quels entourages le geste vise', () => {
	const trois = [ent(0, 1, 0), ent(3, 4, 1), ent(6, 7, 2)];
	it('aucun entourage : aucun indice', () => {
		expect(entouragesRecouverts([], 0, 5)).toEqual([]);
	});
	it('renvoie les indices dans l’ordre du tableau', () => {
		expect(entouragesRecouverts(trois, 1, 6)).toEqual([0, 1, 2]);
		expect(entouragesRecouverts(trois, 4, 5)).toEqual([1]);
	});
	it('plage dans un trou entre deux entourages : rien', () => {
		expect(entouragesRecouverts(trois, 2, 2)).toEqual([]);
		expect(entouragesRecouverts(trois, 5, 5)).toEqual([]);
	});
	it('bornes inversées : même résultat (le glissé peut aller de droite à gauche)', () => {
		expect(entouragesRecouverts(trois, 6, 1)).toEqual([0, 1, 2]);
	});
});

describe('basculerEntourage — zone libre : le geste ajoute', () => {
	it('premier entourage d’un mot vierge, première teinte', () => {
		expect(basculerEntourage([], 2, 4, NB)).toEqual([{ debut: 2, fin: 4, couleur: 0 }]);
	});
	it('tap d’une lettre : entourage d’une seule lettre', () => {
		expect(basculerEntourage([], 3, 3, NB)).toEqual([{ debut: 3, fin: 3, couleur: 0 }]);
	});
	it('bornes inversées : l’entourage stocké est normalisé (debut ≤ fin)', () => {
		expect(basculerEntourage([], 5, 2, NB)).toEqual([{ debut: 2, fin: 5, couleur: 0 }]);
	});
	it('plage juste collée à un entourage existant : ajoute (ne retire pas)', () => {
		const res = basculerEntourage([ent(2, 4, 0)], 5, 6, NB);
		expect(plages(res)).toEqual(['2-4', '5-6']);
	});
});

describe('basculerEntourage — lettre déjà entourée : le geste retire (#462)', () => {
	it('recliquer la lettre entourée efface l’entourage', () => {
		expect(basculerEntourage([ent(3, 3, 0)], 3, 3, NB)).toEqual([]);
	});
	it('tap sur une lettre du groupe : tout le groupe part', () => {
		expect(basculerEntourage([ent(2, 5, 0)], 4, 4, NB)).toEqual([]);
		expect(basculerEntourage([ent(2, 5, 0)], 2, 2, NB)).toEqual([]);
		expect(basculerEntourage([ent(2, 5, 0)], 5, 5, NB)).toEqual([]);
	});
	it('un seul cran de chevauchement suffit, et rien n’est ajouté en échange', () => {
		expect(basculerEntourage([ent(2, 5, 0)], 5, 8, NB)).toEqual([]);
		expect(basculerEntourage([ent(2, 5, 0)], 0, 2, NB)).toEqual([]);
	});
	it('plage strictement incluse dans l’entourage', () => {
		expect(basculerEntourage([ent(1, 6, 0)], 3, 4, NB)).toEqual([]);
	});
	it('plage englobant l’entourage', () => {
		expect(basculerEntourage([ent(3, 4, 0)], 0, 9, NB)).toEqual([]);
	});
	it('plusieurs entourages d’un coup, sans rien réajouter', () => {
		const trois = [ent(0, 1, 0), ent(3, 4, 1), ent(6, 7, 2)];
		expect(basculerEntourage(trois, 1, 6, NB)).toEqual([]);
		expect(basculerEntourage(trois, 1, 3, NB)).toEqual([ent(6, 7, 2)]);
	});
	it('ne touche que les entourages effectivement visés', () => {
		const trois = [ent(0, 1, 0), ent(3, 4, 1), ent(6, 7, 2)];
		expect(basculerEntourage(trois, 3, 4, NB)).toEqual([ent(0, 1, 0), ent(6, 7, 2)]);
	});
	it('après un retrait, la lettre visée n’est plus dans aucun entourage', () => {
		const res = basculerEntourage([ent(2, 5, 0), ent(7, 8, 1)], 4, 4, NB);
		expect(res.some((e) => e.debut <= 4 && 4 <= e.fin)).toBe(false);
	});
	it('bornes inversées : retire aussi bien', () => {
		expect(basculerEntourage([ent(2, 5, 0)], 8, 4, NB)).toEqual([]);
	});
});

describe('basculerEntourage — fonction pure', () => {
	it('ne mute ni le tableau ni les entourages, à l’ajout comme au retrait', () => {
		const src = [ent(2, 5, 0), ent(7, 8, 1)];
		const avant = JSON.stringify(src);
		basculerEntourage(src, 0, 1, NB); // ajout
		basculerEntourage(src, 3, 3, NB); // retrait
		expect(JSON.stringify(src)).toBe(avant);
	});
	it('renvoie un nouveau tableau même quand rien ne change de place', () => {
		const src: Entourage[] = [];
		expect(basculerEntourage(src, 1, 1, NB)).not.toBe(src);
	});
	it('deux gestes identiques sur une zone libre reviennent à l’état de départ', () => {
		const src = [ent(0, 1, 0)];
		const apresAller = basculerEntourage(src, 4, 5, NB);
		expect(basculerEntourage(apresAller, 4, 5, NB)).toEqual(src);
	});
});

describe('prochaineCouleur — deux entourages visibles jamais de la même teinte', () => {
	it('mot vierge : première teinte de la palette', () => {
		expect(prochaineCouleur([], NB)).toBe(0);
	});
	it('prend la première teinte LIBRE, pas la suivante', () => {
		expect(prochaineCouleur([ent(0, 0, 0), ent(2, 2, 2)], NB)).toBe(1);
		expect(prochaineCouleur([ent(0, 0, 1), ent(2, 2, 2)], NB)).toBe(0);
	});
	it('teintes consécutives déjà prises : la suivante', () => {
		expect(prochaineCouleur([ent(0, 0, 0), ent(2, 2, 1), ent(4, 4, 2)], NB)).toBe(3);
	});
	it('palette saturée : recycle, mais toujours dans la palette', () => {
		const six = [0, 1, 2, 3, 4, 5].map((c) => ent(c * 2, c * 2, c));
		const c = prochaineCouleur(six, NB);
		expect(c).toBeGreaterThanOrEqual(0);
		expect(c).toBeLessThan(NB);
	});
	it('palette d’une seule teinte : reste dans les bornes', () => {
		expect(prochaineCouleur([], 1)).toBe(0);
		expect(prochaineCouleur([ent(0, 0, 0)], 1)).toBe(0);
	});
	it('teinte sauvegardée hors palette : compte pour la teinte réellement affichée', () => {
		// L'atelier rend PALETTE[couleur % PALETTE.length] : une couleur 6 s'affiche
		// comme la teinte 0, qui n'est donc plus libre.
		expect(prochaineCouleur([ent(0, 0, NB)], NB)).toBe(1);
	});
});

describe('séquence de gestes — les teintes ne doublonnent pas', () => {
	it('ajout ×3 puis retrait du deuxième : le suivant reprend la teinte libérée', () => {
		let es: Entourage[] = [];
		es = basculerEntourage(es, 0, 0, NB);
		es = basculerEntourage(es, 2, 2, NB);
		es = basculerEntourage(es, 4, 4, NB);
		expect(teintes(es)).toEqual([0, 1, 2]);
		es = basculerEntourage(es, 2, 2, NB); // bascule : retire le deuxième
		expect(plages(es)).toEqual(['0-0', '4-4']);
		expect(teintes(es)).toEqual([0, 2]);
		es = basculerEntourage(es, 6, 6, NB);
		expect(teintes(es)).toEqual([0, 2, 1]);
		expect(new Set(teintes(es)).size).toBe(3);
	});
	it('retrait du PREMIER puis ajout : pas de doublon (teinte ≠ nombre d’entourages)', () => {
		let es: Entourage[] = [];
		es = basculerEntourage(es, 0, 0, NB);
		es = basculerEntourage(es, 2, 2, NB);
		es = basculerEntourage(es, 4, 4, NB);
		es = basculerEntourage(es, 0, 0, NB); // retire le premier (teinte 0 libérée)
		es = basculerEntourage(es, 6, 6, NB);
		expect(teintes(es)).toEqual([1, 2, 0]);
		expect(new Set(teintes(es)).size).toBe(3);
	});
	it('« effacer le dernier » puis ajout : teintes toujours distinctes', () => {
		let es: Entourage[] = [];
		es = basculerEntourage(es, 0, 0, NB);
		es = basculerEntourage(es, 2, 2, NB);
		es = basculerEntourage(es, 4, 4, NB);
		es = es.slice(0, -1); // bouton « effacer le dernier » de l'atelier
		es = basculerEntourage(es, 8, 8, NB);
		expect(new Set(teintes(es)).size).toBe(es.length);
	});
	it('six entourages : six teintes distinctes ; le septième reste dans la palette', () => {
		let es: Entourage[] = [];
		for (let i = 0; i < NB; i++) es = basculerEntourage(es, i * 2, i * 2, NB);
		expect(new Set(teintes(es)).size).toBe(NB);
		es = basculerEntourage(es, 12, 12, NB);
		expect(es).toHaveLength(NB + 1);
		for (const e of es) {
			expect(e.couleur).toBeGreaterThanOrEqual(0);
			expect(e.couleur).toBeLessThan(NB);
		}
	});
});

describe('apercuGeste — ce que l’enfant voit pendant le glissé', () => {
	it('zone libre : les lettres visées annoncent l’ajout, rien d’autre n’est marqué', () => {
		expect(apercu([], 2, 4)).toEqual({
			recouverts: [],
			lettres: { 2: 'ajout', 3: 'ajout', 4: 'ajout' },
		});
	});
	it('entourage juste à côté (adjacent) : geste d’ajout, voisin non signalé', () => {
		expect(apercu([ent(0, 1)], 2, 3)).toEqual({
			recouverts: [],
			lettres: { 2: 'ajout', 3: 'ajout' },
		});
	});
	it('tap au milieu d’un entourage : tout l’entourage est condamné, aucune lettre neutre', () => {
		expect(apercu([ent(2, 5)], 4, 4)).toEqual({
			recouverts: [0],
			lettres: { 2: 'effacement', 3: 'effacement', 4: 'effacement', 5: 'effacement' },
		});
	});
	it('effacement : jamais de lettre en « ajout » en même temps', () => {
		const { lettres } = apercu([ent(2, 5)], 4, 7);
		expect(Object.values(lettres)).not.toContain('ajout');
	});
	it('dépassement à droite : entourage en effacement, lettres traversées en neutre', () => {
		expect(apercu([ent(2, 5)], 4, 8)).toEqual({
			recouverts: [0],
			lettres: {
				2: 'effacement',
				3: 'effacement',
				4: 'effacement',
				5: 'effacement',
				6: 'neutre',
				7: 'neutre',
				8: 'neutre',
			},
		});
	});
	it('l’entourage condamné est signalé même hors de la plage visée', () => {
		expect(apercu([ent(0, 3)], 3, 5)).toEqual({
			recouverts: [0],
			lettres: {
				0: 'effacement',
				1: 'effacement',
				2: 'effacement',
				3: 'effacement',
				4: 'neutre',
				5: 'neutre',
			},
		});
	});
	it('deux entourages condamnés : les lettres jamais entourées du milieu restent neutres', () => {
		// Remplace l'ancienne enveloppe : 3-4-5 sont traversées, pas « en cours
		// d'effacement » ; 0 et 8, hors du geste et hors des entourages, ne sont pas marquées.
		expect(apercu([ent(1, 2), ent(6, 7)], 2, 6)).toEqual({
			recouverts: [0, 1],
			lettres: {
				1: 'effacement',
				2: 'effacement',
				3: 'neutre',
				4: 'neutre',
				5: 'neutre',
				6: 'effacement',
				7: 'effacement',
			},
		});
	});
	it('un entourage hors du geste reste absent de l’aperçu', () => {
		const { recouverts, lettres } = apercu([ent(2, 3), ent(8, 9)], 1, 4);
		expect(recouverts).toEqual([0]);
		expect(lettres[8]).toBeUndefined();
		expect(lettres[9]).toBeUndefined();
		expect(lettres[0]).toBeUndefined(); // avant la plage visée, hors entourage
	});
	it('bornes inversées : aperçu identique au glissé de gauche à droite', () => {
		const es = [ent(2, 5)];
		expect(apercu(es, 8, 4)).toEqual(apercu(es, 4, 8));
	});
	it('tap sur une lettre d’un entourage d’une lettre', () => {
		expect(apercu([ent(3, 3)], 3, 3)).toEqual({
			recouverts: [0],
			lettres: { 3: 'effacement' },
		});
	});
	it('ne mute pas les entourages fournis', () => {
		const src = [ent(2, 5, 0), ent(7, 8, 1)];
		const avant = JSON.stringify(src);
		apercuGeste(src, 3, 9);
		expect(JSON.stringify(src)).toBe(avant);
	});
	it('cohérent avec la bascule : recouverts non vide ⟺ le geste efface', () => {
		const es = [ent(2, 5, 0), ent(8, 9, 1)];
		expect(apercuGeste(es, 5, 7).recouverts).toEqual([0]);
		expect(basculerEntourage(es, 5, 7, NB)).toEqual([ent(8, 9, 1)]);
		expect(apercuGeste(es, 6, 7).recouverts).toEqual([]);
		expect(basculerEntourage(es, 6, 7, NB)).toHaveLength(3);
	});
});

describe('entourages chevauchants déjà sauvegardés (avant #462)', () => {
	const legacy = [ent(0, 3, 0), ent(2, 5, 1)]; // superposés sur les lettres 2-3
	it('un geste sur la zone commune retire les deux', () => {
		expect(basculerEntourage(legacy, 2, 2, NB)).toEqual([]);
	});
	it('un geste sur une lettre couverte par un seul ne retire que celui-là', () => {
		expect(basculerEntourage(legacy, 0, 0, NB)).toEqual([ent(2, 5, 1)]);
		expect(basculerEntourage(legacy, 5, 5, NB)).toEqual([ent(0, 3, 0)]);
	});
	it('les deux entourages condamnés sont signalés à l’aperçu, sur toute leur étendue', () => {
		expect(apercu(legacy, 3, 3)).toEqual({
			recouverts: [0, 1],
			lettres: {
				0: 'effacement',
				1: 'effacement',
				2: 'effacement',
				3: 'effacement',
				4: 'effacement',
				5: 'effacement',
			},
		});
	});
});

describe('invariants sur un grand échantillon de séquences de gestes', () => {
	const N = 12; // lettres du mot
	it('gestes aléatoires (graine fixe) : disjoints, bornés, teinte libre à l’ajout', () => {
		let ajouts = 0;
		let retraits = 0;
		let retraitsMultiples = 0;
		let apercusAvecNeutre = 0;
		let apercusDebordants = 0;
		withSeed(20260727, () => {
			for (let essai = 0; essai < 300; essai++) {
				let es: Entourage[] = [];
				for (let geste = 0; geste < 12; geste++) {
					const a = rnd(0, N - 1);
					const b = Math.min(N - 1, a + rnd(0, 3)); // groupe de 1 à 4 lettres
					const lo = Math.min(a, b);
					const hi = Math.max(a, b);
					const snapshot = JSON.stringify(es);
					// Ce que le geste vise, calculé indépendamment du module : les entourages
					// qui partagent au moins une lettre avec [lo, hi].
					const visesAttendus = es.reduce<number[]>((acc, e, i) => {
						if (e.debut <= hi && lo <= e.fin) acc.push(i);
						return acc;
					}, []);
					const vises = entouragesRecouverts(es, a, b);
					expect(vises).toEqual(visesAttendus);

					// Aperçu : mêmes entourages condamnés que la bascule, et un état par
					// lettre conforme à la règle (condamnée > traversée ; jamais de lettre
					// jamais entourée annoncée comme effacée).
					const { recouverts, etats } = apercuGeste(es, a, b);
					expect(recouverts).toEqual(visesAttendus);
					const condamnees = new Set<number>();
					for (const k of visesAttendus) {
						for (let i = es[k].debut; i <= es[k].fin; i++) condamnees.add(i);
					}
					const visee = new Set<number>();
					for (let i = lo; i <= hi; i++) visee.add(i);
					const clesAttendues = [...new Set([...visee, ...condamnees])].sort((x, y) => x - y);
					expect([...etats.keys()].sort((x, y) => x - y)).toEqual(clesAttendues);
					for (const [i, etat] of etats) {
						if (condamnees.has(i)) expect(etat).toBe('effacement');
						else if (visee.has(i)) expect(etat).toBe(vises.length ? 'neutre' : 'ajout');
					}
					// Un aperçu est soit un ajout, soit un effacement : jamais les deux.
					const valeurs = new Set(etats.values());
					expect(valeurs.has('ajout') && valeurs.has('effacement')).toBe(false);
					if (valeurs.has('neutre')) apercusAvecNeutre++;
					if ([...condamnees].some((i) => !visee.has(i))) apercusDebordants++;

					const apres = basculerEntourage(es, a, b, NB);

					// Pureté : l'état d'avant est intact.
					expect(JSON.stringify(es)).toBe(snapshot);

					if (vises.length === 0) {
						ajouts++;
						// Ajout : un entourage de plus, couvrant exactement la plage visée…
						expect(apres).toHaveLength(es.length + 1);
						const nouveau = apres[apres.length - 1];
						expect([nouveau.debut, nouveau.fin]).toEqual([lo, hi]);
						// …avec une teinte encore libre tant que la palette n'est pas saturée.
						if (es.length < NB) {
							expect(es.every((e) => e.couleur !== nouveau.couleur)).toBe(true);
						}
					} else {
						retraits++;
						if (vises.length > 1) retraitsMultiples++;
						// Retrait : exactement les entourages visés partent, rien n'est ajouté,
						// et l'ordre des survivants est conservé (comparaison par VALEUR).
						expect(plages(apres)).toEqual(plages(es.filter((_, i) => !vises.includes(i))));
						expect(apres.length).toBeLessThan(es.length);
						// …et plus aucune lettre de la plage visée n'est entourée.
						for (let i = lo; i <= hi; i++) {
							expect(apres.some((e) => e.debut <= i && i <= e.fin)).toBe(false);
						}
					}

					es = apres;
					// Bornes du mot et de la palette.
					for (const e of es) {
						expect(e.debut).toBeLessThanOrEqual(e.fin);
						expect(e.debut).toBeGreaterThanOrEqual(0);
						expect(e.fin).toBeLessThan(N);
						expect(e.couleur).toBeGreaterThanOrEqual(0);
						expect(e.couleur).toBeLessThan(NB);
					}
					// Jamais de superposition : deux entourages ne partagent aucune lettre.
					for (let i = 0; i < es.length; i++) {
						for (let j = i + 1; j < es.length; j++) {
							expect(seChevauchent(es[i], es[j])).toBe(false);
						}
					}
					// Une lettre ne peut donc pas être entourée deux fois.
					expect(es.length).toBeLessThanOrEqual(N);
				}
			}
		});
		// Anti-vacuité : l'échantillon a bien exercé les deux branches, dont des retraits
		// de plusieurs entourages en un seul geste, des lettres seulement traversées, et
		// des entourages condamnés qui dépassent la plage visée.
		expect(ajouts).toBeGreaterThan(100);
		expect(retraits).toBeGreaterThan(100);
		expect(retraitsMultiples).toBeGreaterThan(10);
		expect(apercusAvecNeutre).toBeGreaterThan(10);
		expect(apercusDebordants).toBeGreaterThan(10);
	});
});
