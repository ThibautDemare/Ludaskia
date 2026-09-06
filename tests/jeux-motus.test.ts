/* ============================================================
   Étagère de jeux (#661) — le Motus : correcteur à trois états, résumé des
   lettres, budget d'essais et banque des mots cachés.
   Couvre les critères 29 (toute suite de lettres est acceptée), 30 et 32 (une
   seule banque, curée), 33 (l'accent fait partie de la lettre), 36 (au moins 5
   essais, pas de rejeu immédiat), 46 (statut cumulé, jamais régressif) et 47
   (lettres répétées, dans les deux sens).

   ATTENDUS DÉRIVÉS À LA MAIN. Chaque cas de `evaluerEssai` est calculé ici en
   commentaire, à partir de la règle du jeu (« bien placée » d'abord, puis
   « présente ailleurs » dans la limite des occurrences RESTANTES du mot caché),
   et non lu dans le code — c'est tout l'intérêt d'un testeur qui n'est pas
   l'auteur.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	evaluerEssai,
	statutsCumules,
	budgetEssais,
	vivierMots,
	tirerMot,
} from '../src/core/jeux/motus';
import type { EtatLettre } from '../src/core/jeux/motus';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';

/* Tirage déterministe (LCG), pattern de fenetre-ponderee.test.ts. */
function tirage(graine: number): () => number {
	let s = graine >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

const lettres = (mot: string): string[] => [...mot.normalize('NFC')];

/* ============================================================
   1. evaluerEssai — le décompte à trois états
   ============================================================ */
describe('evaluerEssai — cas nominal', () => {
	it('le mot exact rend « bien placée » partout', () => {
		expect(evaluerEssai('pomme', 'pomme')).toEqual([
			'placee',
			'placee',
			'placee',
			'placee',
			'placee',
		]);
	});

	it('un mot sans aucune lettre commune rend « absente » partout', () => {
		// Critère 29 : « ZZZZZ » n'est pas refusé, il est simplement tout gris.
		expect(evaluerEssai('zzzzz', 'pomme')).toEqual([
			'absente',
			'absente',
			'absente',
			'absente',
			'absente',
		]);
	});

	it('ne rend jamais un quatrième état', () => {
		const valeurs = new Set<EtatLettre>();
		for (const [p, c] of [
			['momie', 'pomme'],
			['foret', 'forêt'],
			['lampe', 'pomme'],
			['tttttt', 'lettre'],
			['zzzzz', 'pomme'],
		]) {
			for (const e of evaluerEssai(p, c)) valeurs.add(e);
		}
		for (const v of valeurs) expect(['placee', 'ailleurs', 'absente']).toContain(v);
	});

	it('rend un état PAR LETTRE de la proposition, quelle que soit sa longueur', () => {
		// Critère 29 : le jeu ne refuse jamais une saisie, donc pas d'exception ici non plus.
		expect(evaluerEssai('pom', 'pomme')).toEqual(['placee', 'placee', 'placee']);
		expect(evaluerEssai('pommes', 'pomme').length).toBe(6);
		expect(evaluerEssai('ab', 'pomme').length).toBe(2);
	});
});

describe('evaluerEssai — lettres répétées, dans les deux sens (critère 47)', () => {
	it('« momie » face à « pomme » : les DEUX m sont crédités, car le mot en a deux', () => {
		/* Calcul à la main. Cible p-o-m-m-e (deux m, un o, un e), proposition m-o-m-i-e.
		   1) bien placées : o (pos 1), m (pos 2), e (pos 4) — trois lettres consommées ;
		      il reste dans le mot caché : p et UN m.
		   2) le m de la position 0 trouve le m restant → « présente ailleurs » ;
		      le i n'est nulle part → « absente ».
		   NB : l'issue #661 écrit, dans le « violé si » du critère 47, que créditer deux m
		   serait une faute « alors que le mot n'en a qu'un de disponible ». C'est inexact :
		   « pomme » porte bien DEUX m, donc les deux m de « momie » sont légitimes. Le vrai
		   invariant, testé plus bas, est : placées + ailleurs ≤ occurrences dans la cible.
		   Écart signalé au mainteneur. */
		expect(evaluerEssai('momie', 'pomme')).toEqual([
			'ailleurs',
			'placee',
			'placee',
			'absente',
			'placee',
		]);
	});

	it('« momme » face à « pomme » : le TROISIÈME m est absent (plus d’occurrences que la cible)', () => {
		/* Cible p-o-m-m-e, proposition m-o-m-m-e : bien placées en 1, 2, 3 et 4
		   (o, m, m, e) — les deux m de la cible sont consommés. Il ne reste que p, donc
		   le m de la position 0 n'a plus rien à réclamer : « absente ». */
		expect(evaluerEssai('momme', 'pomme')).toEqual([
			'absente',
			'placee',
			'placee',
			'placee',
			'placee',
		]);
	});

	it('« pommme » face à « pomme » : le troisième m est « absente », jamais autre chose', () => {
		/* Cas d'échec littéral du critère 47. Cible p-o-m-m-e, proposition p-o-m-m-m-e :
		   positions 0 à 3 exactes (p, o, m, m) ; le m de la position 4 ne trouve plus de m
		   disponible → « absente ». Position 5 : au-delà de la cible, donc « absente » aussi
		   (règle tranchée le 2026-09-06), alors même qu'un e non consommé reste dans le mot
		   caché — c'est le cas discriminant, testé pour lui-même juste en dessous. */
		expect(evaluerEssai('pommme', 'pomme')).toEqual([
			'placee',
			'placee',
			'placee',
			'placee',
			'absente',
			'absente',
		]);
	});

	it('les positions au-delà de la cible sont « absente », même si la lettre existe dans le mot', () => {
		/* Une proposition plus longue que le mot caché n'est pas refusée (critère 29). Les
		   lettres en trop ne colorent rien : la grille n'a pas de case pour elles. */
		expect(evaluerEssai('pommes', 'pomme')).toEqual([
			'placee',
			'placee',
			'placee',
			'placee',
			'placee',
			'absente',
		]);
		// « pommee » : le e surnuméraire est au-delà de la cible → gris, bien que « pomme »
		// contienne un e.
		expect(evaluerEssai('pommee', 'pomme').slice(4)).toEqual(['placee', 'absente']);
	});

	it('« lampe » face à « pomme » : une seule occurrence proposée, aucun crédit fantôme', () => {
		/* Sens inverse : la proposition contient MOINS de m que la cible. Cible p-o-m-m-e,
		   proposition l-a-m-p-e. 1) bien placées : m (pos 2), e (pos 4) ; il reste p, o, m.
		   2) le p de la position 3 trouve le p → « présente ailleurs » ; l et a → absentes.
		   Le m surnuméraire de la cible ne colore rien : il n'a pas été proposé. */
		expect(evaluerEssai('lampe', 'pomme')).toEqual([
			'absente',
			'absente',
			'placee',
			'ailleurs',
			'placee',
		]);
	});

	it('« tttttt » face à « lettre » : seuls les deux t du mot sont crédités', () => {
		/* Cible l-e-t-t-r-e (deux t), proposition six t : positions 2 et 3 exactes, les
		   quatre autres t n'ont plus rien à réclamer. */
		expect(evaluerEssai('tttttt', 'lettre')).toEqual([
			'absente',
			'absente',
			'placee',
			'placee',
			'absente',
			'absente',
		]);
	});

	it('INVARIANT : « placée » + « ailleurs » ne dépasse jamais le nombre d’occurrences du mot caché', () => {
		/* La borne dure du critère 47, cherchée sur un millier de couples tirés dans un
		   alphabet volontairement étroit (beaucoup de répétitions). Et le nombre de
		   « placée » d'une lettre vaut exactement le nombre de positions coïncidentes. */
		const alphabet = [...'aemop'];
		const r = tirage(2026);
		const motAleatoire = (n: number): string =>
			[...Array(n)].map(() => alphabet[Math.floor(r() * alphabet.length)]).join('');
		for (let i = 0; i < 1000; i++) {
			const cible = motAleatoire(5);
			const propose = motAleatoire(5);
			const etats = evaluerEssai(propose, cible);
			for (const lettre of new Set([...propose])) {
				const dansCible = [...cible].filter((c) => c === lettre).length;
				const credites = [...propose].filter(
					(c, i2) => c === lettre && etats[i2] !== 'absente',
				).length;
				const placees = [...propose].filter(
					(c, i2) => c === lettre && etats[i2] === 'placee',
				).length;
				const coincidences = [...propose].filter(
					(c, i2) => c === lettre && cible[i2] === lettre,
				).length;
				expect(credites).toBeLessThanOrEqual(dansCible);
				expect(placees).toBe(coincidences);
			}
		}
	});
});

describe('evaluerEssai — l’accent fait partie de la lettre (critère 33)', () => {
	it('« foret » proposé pour « forêt » ne donne PAS « bien placée » sur le e', () => {
		/* Cible f-o-r-ê-t, proposition f-o-r-e-t : f, o, r et t coïncident ; il reste ê
		   dans le mot caché. Le e de la position 3 n'est pas un ê, et rien d'autre ne
		   l'attend → « absente ». Ni ignoré, ni signalé à part : gris, comme une lettre
		   qui n'y est pas. */
		expect(evaluerEssai('foret', 'forêt')).toEqual([
			'placee',
			'placee',
			'placee',
			'absente',
			'placee',
		]);
	});

	it('« ecole » proposé pour « école » ne colore pas le é', () => {
		expect(evaluerEssai('ecole', 'école')).toEqual([
			'absente',
			'placee',
			'placee',
			'placee',
			'placee',
		]);
	});

	it('le mot accentué exact est entièrement « bien placée »', () => {
		expect(evaluerEssai('forêt', 'forêt')).toEqual([
			'placee',
			'placee',
			'placee',
			'placee',
			'placee',
		]);
	});

	it('traite une proposition en majuscules comme la même suite de lettres', () => {
		/* Les mots cachés sont stockés en minuscules, la grille s'écrit en capitales : la
		   casse ne doit jamais valoir une faute. Règle tranchée le 2026-09-06. */
		expect(evaluerEssai('POMME', 'pomme')).toEqual([
			'placee',
			'placee',
			'placee',
			'placee',
			'placee',
		]);
		expect(evaluerEssai('MOMIE', 'pomme')).toEqual(evaluerEssai('momie', 'pomme'));
		// L'accent survit au changement de casse : « FORÊT » reste « forêt » (critère 33).
		expect(evaluerEssai('FORÊT', 'forêt')).toEqual([
			'placee',
			'placee',
			'placee',
			'placee',
			'placee',
		]);
		expect(evaluerEssai('FORET', 'forêt')[3]).toBe('absente');
	});

	it('ne dépend pas de la casse des deux côtés à la fois', () => {
		for (const [p, c] of [
			['momie', 'pomme'],
			['foret', 'forêt'],
			['lettre', 'lettre'],
		]) {
			expect(evaluerEssai(p.toUpperCase(), c.toUpperCase())).toEqual(evaluerEssai(p, c));
		}
	});
});

/* ============================================================
   2. statutsCumules — le résumé des lettres sous la grille (critère 46)
   ============================================================ */
describe('statutsCumules — le meilleur statut connu, jamais régressif (critère 46)', () => {
	it('retient toutes les lettres proposées, et rien d’autre', () => {
		const essais = [{ mot: 'lampe', etats: evaluerEssai('lampe', 'pomme') }];
		const m = statutsCumules(essais);
		for (const l of lettres('lampe')) expect(m.has(l)).toBe(true);
		expect(m.has('z')).toBe(false); // lettre jamais proposée : absente du résumé
		expect(m.size).toBe(5);
	});

	it('garde le MEILLEUR statut d’une lettre répétée dans le même essai', () => {
		// « momie » : m « ailleurs » en position 0, « bien placée » en position 2.
		const m = statutsCumules([{ mot: 'momie', etats: evaluerEssai('momie', 'pomme') }]);
		expect(m.get('m')).toBe('placee');
		expect(m.get('i')).toBe('absente');
	});

	it('ne régresse jamais d’un essai à l’autre', () => {
		/* Essai 1 « lampe » → m bien placée, p ailleurs. Essai 2 « momie » → m ailleurs en
		   position 0. Le résumé doit rester « bien placée » pour m : c'est le cas d'échec
		   écrit dans le critère 46. */
		const essais = [
			{ mot: 'lampe', etats: evaluerEssai('lampe', 'pomme') },
			{ mot: 'momie', etats: evaluerEssai('momie', 'pomme') },
		];
		const m = statutsCumules(essais);
		expect(m.get('m')).toBe('placee');
		expect(m.get('p')).toBe('ailleurs');
		expect(m.get('e')).toBe('placee');
		expect(m.get('o')).toBe('placee');
		expect(m.get('l')).toBe('absente');
		expect(m.get('a')).toBe('absente');
		expect(m.get('i')).toBe('absente');
		expect(m.size).toBe(7);
	});

	it('classe « bien placée » > « présente ailleurs » > « absente », quel que soit l’ordre des essais', () => {
		/* Essais fabriqués à la main (le résumé ne doit pas dépendre du correcteur) :
		   b passe de « ailleurs » à « absente », c de « absente » à « bien placée ». */
		const e1 = { mot: 'abc', etats: ['absente', 'ailleurs', 'absente'] as EtatLettre[] };
		const e2 = { mot: 'cba', etats: ['placee', 'absente', 'absente'] as EtatLettre[] };
		const attendu = { a: 'absente', b: 'ailleurs', c: 'placee' };
		for (const ordre of [
			[e1, e2],
			[e2, e1],
		]) {
			const m = statutsCumules(ordre);
			expect(m.get('a')).toBe(attendu.a);
			expect(m.get('b')).toBe(attendu.b);
			expect(m.get('c')).toBe(attendu.c);
		}
	});

	it('distingue une lettre accentuée de sa version nue (critère 33)', () => {
		const m = statutsCumules([
			{ mot: 'foret', etats: evaluerEssai('foret', 'forêt') },
			{ mot: 'forêt', etats: evaluerEssai('forêt', 'forêt') },
		]);
		expect(m.get('e')).toBe('absente');
		expect(m.get('ê')).toBe('placee');
	});

	it('rend un résumé vide avant le premier essai', () => {
		expect(statutsCumules([]).size).toBe(0);
	});
});

/* ============================================================
   3. budgetEssais — le nombre d'essais (critère 36)
   ============================================================ */
describe('budgetEssais (critère 36)', () => {
	it('n’accorde JAMAIS moins de 5 essais', () => {
		// Sous 5 essais, la première couleur n'a pas le temps de guider une seconde
		// hypothèse : le jeu devient une loterie (raison écrite dans le critère 36).
		for (let n = 3; n <= 12; n++) {
			expect(budgetEssais(n)).toBeGreaterThanOrEqual(5);
		}
	});

	it('accorde au moins 5 essais aux longueurs réellement jouées (5 et 6 lettres)', () => {
		expect(budgetEssais(5)).toBeGreaterThanOrEqual(5);
		expect(budgetEssais(6)).toBeGreaterThanOrEqual(5);
	});

	it('ne donne jamais MOINS d’essais à un mot plus long', () => {
		for (let n = 4; n <= 12; n++) {
			expect(budgetEssais(n)).toBeGreaterThanOrEqual(budgetEssais(n - 1));
		}
	});

	/* PAS de test « ratio essais/lettres non décroissant » ici, et c'est délibéré.
	   La règle a été tranchée le 2026-09-06 (commentaire daté sur l'issue #661, § 2) :
	   elle appartient à #663, critère 8 — le lot qui fait VARIER la longueur des mots.
	   Le lot 1 livre un budget CONSTANT (« nombre d'essais unique ≥ 5 »), donc un ratio
	   qui décroît de 1,2 à 1,0 entre 5 et 6 lettres : par construction, pas par
	   négligence. Ce qui reste gardé ici, c'est le plancher et la monotonie. */
});

/* ============================================================
   4. vivierMots / tirerMot — la banque des mots cachés (critères 30, 32, 36)
   ============================================================ */

/* Référence recalculée depuis les DONNÉES (src/data), pas depuis l'implémentation :
   les séries « thème » sont la seule source autorisée par le critère 30. */
const SERIES_THEME = ORTHO_PREDEF.filter((l) => l.id.startsWith('fr-ortho-theme-'));
const MOTS_THEME = new Set(
	SERIES_THEME.flatMap((l) => l.mots.map((m) => m.mot.toLowerCase().normalize('NFC'))),
);
const MOTS_HOMOPHONES = new Set(
	ORTHO_PREDEF.flatMap((l) =>
		l.mots.filter((m) => m.homophone).map((m) => m.mot.toLowerCase().normalize('NFC')),
	),
);
const MOTS_INVARIABLES = new Set(
	ORTHO_PREDEF.filter((l) => /^fr-ortho-(invariables|cm1-invariables)/.test(l.id)).flatMap((l) =>
		l.mots.map((m) => m.mot.toLowerCase().normalize('NFC')),
	),
);
/* Les mots que le critère 32 nomme explicitement : tous de 5 ou 6 lettres, donc tous
   retenus par un filtre de LONGUEUR SEULE — c'est exactement ce qu'il faut attraper. */
const INTERDITS_NOMMES = ['corps', 'poids', 'fils', 'temps', 'août'];

describe('vivierMots — une seule banque, curée (critères 30 et 32)', () => {
	const NIVEAUX = ['ce2', 'cm1'] as const;

	for (const niveau of NIVEAUX) {
		describe(`niveau ${niveau}`, () => {
			it('n’est pas vide et offre de quoi jouer plusieurs parties sans répétition', () => {
				// Mesure de l'issue : 75 mots de 5-6 lettres dans les séries « thème », avant
				// les exclusions du critère 32. Un vivier tombé sous 30 signalerait un filtre
				// qui mord bien au-delà de ce que le critère demande.
				const v = vivierMots(niveau);
				expect(v.length).toBeGreaterThanOrEqual(30);
			});

			it('ne contient que des mots des séries « thème »', () => {
				for (const mot of vivierMots(niveau)) {
					expect(MOTS_THEME.has(mot.toLowerCase().normalize('NFC'))).toBe(true);
				}
			});

			it('ne contient que des mots de 5 ou 6 lettres', () => {
				for (const mot of vivierMots(niveau)) {
					expect(lettres(mot).length).toBeGreaterThanOrEqual(5);
					expect(lettres(mot).length).toBeLessThanOrEqual(6);
				}
			});

			it('ne contient que des lettres : ni espace, ni trait d’union, ni apostrophe', () => {
				// Une grille de Motus a une case par lettre : « à travers », « c'est-à-dire »
				// ou « aujourd'hui » n'y entrent pas.
				for (const mot of vivierMots(niveau)) {
					expect(mot).not.toMatch(/[\s'’-]/);
					expect(mot.normalize('NFC')).toMatch(/^[a-zA-ZÀ-ÿœŒæÆ]+$/);
				}
			});

			it('ne propose jamais deux fois le même mot', () => {
				const v = vivierMots(niveau);
				expect(new Set(v.map((m) => m.toLowerCase())).size).toBe(v.length);
			});

			it('exclut les mots que le critère 32 nomme (finale muette, lettre interne muette)', () => {
				const v = vivierMots(niveau).map((m) => m.toLowerCase().normalize('NFC'));
				for (const interdit of INTERDITS_NOMMES) {
					expect(v).not.toContain(interdit.normalize('NFC'));
				}
			});

			it('exclut les homophones', () => {
				for (const mot of vivierMots(niveau)) {
					expect(MOTS_HOMOPHONES.has(mot.toLowerCase().normalize('NFC'))).toBe(false);
				}
			});

			it('exclut les mots invariables, même quand une série « thème » les reprend', () => {
				/* Le critère 32 écarte les mots-outils « sans référent, l'enfant ne peut pas
				   s'appuyer sur le sens ». La raison tient au MOT, pas à la série : « chaque »,
				   « autre » ou « malgré » figurent à la fois dans une série invariables et dans
				   une série thème, et passeraient un filtre appliqué à la série seule. */
				for (const mot of vivierMots(niveau)) {
					expect(MOTS_INVARIABLES.has(mot.toLowerCase().normalize('NFC'))).toBe(false);
				}
			});
		});
	}

	it('le vivier CM1 contient au moins celui du CE2 (visibilité cumulative)', () => {
		const ce2 = vivierMots('ce2').map((m) => m.toLowerCase());
		const cm1 = new Set(vivierMots('cm1').map((m) => m.toLowerCase()));
		for (const mot of ce2) expect(cm1.has(mot)).toBe(true);
	});
});

describe('tirerMot — pas de rejeu immédiat (critère 36)', () => {
	it('rend toujours un mot du vivier', () => {
		const v = new Set(vivierMots('ce2'));
		const r = tirage(1234);
		for (let i = 0; i < 300; i++) expect(v.has(tirerMot('ce2', [], r))).toBe(true);
	});

	it('ne redonne jamais un mot exclu, même sur des centaines de tirages', () => {
		// « pas de rejeu immédiat du même mot dans la session » : le mot perdu est passé en
		// exclusion, il ne doit pas revenir à la partie suivante.
		const v = vivierMots('ce2');
		const exclus = v.slice(0, 5);
		const r = tirage(77);
		for (let i = 0; i < 500; i++) expect(exclus).not.toContain(tirerMot('ce2', exclus, r));
	});

	it('est déterministe à générateur fixé', () => {
		expect(tirerMot('ce2', [], tirage(99))).toBe(tirerMot('ce2', [], tirage(99)));
	});

	it('laisse chaque mot du vivier atteignable (aucun mot mort)', () => {
		const v = vivierMots('ce2');
		const vus = new Set<string>();
		const r = tirage(5);
		for (let i = 0; i < 4000; i++) vus.add(tirerMot('ce2', [], r));
		expect([...vus].sort()).toEqual([...v].sort());
	});
});
