import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { creerDecompte } from '../src/core/sprint-decompte';
import type { CauseGel } from '../src/core/sprint-decompte';

/* ============================================================
   Décompte du sprint chronométré (#630) — logique pure.

   Le sprint gagne un bouton « Écouter », donc un décompte qui doit se GELER pendant
   la lecture de l'énoncé. Ce module en est la seule source de vérité : le temps lui
   est TOUJOURS passé en paramètre (`now`), jamais lu depuis `Date.now()`, ce qui rend
   toute la logique éprouvable ici, sans faux timers ni horloge réelle.

   Les attendus ci-dessous sont DÉRIVÉS des critères de l'issue, pas de
   l'implémentation : chaque scénario pose une frise d'instants, et le temps restant
   est recalculé à la main comme « durée de la partie moins le temps réellement JOUÉ »
   (le temps gelé n'existe pas pour la partie). Un test qui recopierait la formule
   interne figerait un bug aussi bien qu'un comportement correct.

   Critères couverts : C3 (le temps d'écoute n'est pas retiré du temps de partie),
   C4 (gel exact pendant la lecture, reprise sans geste de l'enfant), C12 (réécouter
   n'achète aucun temps — aucune fuite par bascule), C13 (le gel est porté par le
   décompte, pas par l'affichage), C17 (une partie sans écoute se comporte comme avant,
   donc les records déjà enregistrés restent comparables).
   ============================================================ */

const T0 = 1_700_000_000_000; // instant de départ, arbitraire mais réaliste (ms epoch)
const DUREE = 60_000; // durée d'une partie ; le module la reçoit en paramètre

/* Une frise = une suite d'instants ABSOLUS. Raccourci de lecture pour « T0 + x ». */
const t = (ms: number) => T0 + ms;

describe('Décompte du sprint — le socle (C17 : sans aucune écoute, rien ne change)', () => {
	it('démarre plein, en marche, et ne bouge pas tant qu’on ne relève rien', () => {
		const d = creerDecompte(DUREE, T0);
		expect(d.restant()).toBe(DUREE);
		expect(d.enPause()).toBe(false);
		// `restant()` est un accesseur : il rend le dernier relevé, il n'avance pas seul.
		expect(d.restant()).toBe(DUREE);
	});

	it('critère 17 : le décompte décroît de la durée RÉELLE écoulée, sans écart', () => {
		const d = creerDecompte(DUREE, T0);
		expect(d.tic(t(1_000))).toBe(59_000);
		expect(d.tic(t(4_500))).toBe(55_500);
		expect(d.tic(t(4_500))).toBe(55_500); // deux relevés au même instant : idempotent
		expect(d.tic(t(30_000))).toBe(30_000);
	});

	it('critère 17 : des relevés IRRÉGULIERS ne dérivent pas (pas de décrément par pas fixe)', () => {
		// Un onglet ralenti espace les battements : le total doit rester le temps réel
		// écoulé, pas « nombre de relevés × 250 ms ».
		const ecarts = [37, 250, 250, 1_003, 250, 8_400, 250, 17];
		const d = creerDecompte(DUREE, T0);
		let now = T0;
		for (const ecart of ecarts) {
			now += ecart;
			d.tic(now);
		}
		const total = ecarts.reduce((a, b) => a + b, 0); // 10 457 ms
		expect(d.restant()).toBe(DUREE - total);
	});

	it('une partie épuisée le reste : le décompte ne repasse jamais au-dessus de zéro', () => {
		// NB : le module ne borne PAS `restant()` à zéro — il rend une valeur négative
		// une fois la durée dépassée, et c'est l'appelant (ui/sprint.ts) qui coupe à
		// l'affichage (`Math.max(0, …)`) et termine la partie sur `<= 0`. On éprouve donc
		// l'invariant qui compte vraiment ici : une fois le temps écoulé, plus rien — pas
		// même un gel tardif — ne rend du temps de jeu.
		const d = creerDecompte(5_000, T0);
		expect(d.tic(t(7_000))).toBeLessThanOrEqual(0);
		expect(d.restant()).toBeLessThanOrEqual(0);
		d.geler('lecture', t(8_000));
		d.degeler('lecture', t(20_000));
		expect(d.tic(t(30_000))).toBeLessThanOrEqual(0);
		// Le dernier tirage de la partie reste jouable jusqu'au bout : le franchissement
		// de zéro est net, pas un « presque zéro » flottant.
		expect(Number.isInteger(d.restant())).toBe(true);
	});
});

describe('Décompte du sprint — le gel de lecture (C3, C4)', () => {
	it('critère 3 : le temps passé à écouter n’est pas retiré du temps de la partie', () => {
		const d = creerDecompte(DUREE, T0);
		d.tic(t(10_000)); // 10 s jouées
		d.geler('lecture', t(10_000));
		expect(d.restant()).toBe(50_000);

		// 12 s d'écoute : la partie n'en perd rien, même relevée pendant le gel.
		expect(d.tic(t(16_000))).toBe(50_000);
		d.degeler('lecture', t(22_000));
		expect(d.restant()).toBe(50_000);

		// … et la reprise repart de là : pas de rattrapage du temps gelé.
		expect(d.tic(t(25_000))).toBe(47_000);
	});

	it('critère 3 : geler SOLDE le temps couru jusqu’à l’instant du gel (sans relevé préalable)', () => {
		// Aucun `tic` entre le départ et le gel : les 3 s jouées doivent quand même
		// compter, sinon écouter très tôt rendrait le début de la question gratuit.
		const d = creerDecompte(DUREE, T0);
		d.geler('lecture', t(3_000));
		expect(d.restant()).toBe(57_000);
	});

	it('critère 4 : le décompte est figé EXACTEMENT pendant la lecture', () => {
		const d = creerDecompte(DUREE, T0);
		d.geler('lecture', t(5_000));
		expect(d.enPause()).toBe(true);
		for (const ms of [5_100, 6_000, 9_999, 25_000]) {
			expect(d.tic(t(ms))).toBe(55_000);
		}
		expect(d.enPause()).toBe(true);
	});

	it('critère 4 : il repart TOUT SEUL au dégel, sans autre geste', () => {
		const d = creerDecompte(DUREE, T0);
		d.geler('lecture', t(5_000));
		d.degeler('lecture', t(25_000));
		expect(d.enPause()).toBe(false);
		// Le seul appel qui suit est le battement d'horloge : rien à faire côté enfant.
		expect(d.tic(t(26_000))).toBe(54_000);
	});

	it('gel puis dégel au MÊME instant : ni temps perdu, ni temps offert', () => {
		const d = creerDecompte(DUREE, T0);
		d.tic(t(4_000));
		d.geler('lecture', t(4_000));
		d.degeler('lecture', t(4_000)); // lecture avortée (voix indisponible, clic annulé)
		expect(d.enPause()).toBe(false);
		expect(d.tic(t(9_000))).toBe(51_000); // 9 s jouées, rien de plus
	});
});

describe('Décompte du sprint — idempotence et causes croisées', () => {
	it('geler deux fois la même cause ne demande PAS deux dégels', () => {
		const d = creerDecompte(DUREE, T0);
		d.geler('lecture', t(2_000));
		d.geler('lecture', t(6_000)); // double clic sur « Écouter »
		expect(d.restant()).toBe(58_000); // le 2e gel ne solde pas les 4 s gelées
		d.degeler('lecture', t(10_000));
		expect(d.enPause()).toBe(false);
		expect(d.tic(t(12_000))).toBe(56_000); // 2 s jouées de plus, 8 s gelées à personne
	});

	it('dégeler une cause jamais posée ne change rien (ni saut, ni temps offert)', () => {
		const d = creerDecompte(DUREE, T0);
		d.tic(t(3_000));
		d.degeler('correction', t(3_000)); // la partie tourne, aucune correction en cours
		expect(d.enPause()).toBe(false);
		expect(d.tic(t(8_000))).toBe(52_000);

		// Même chose alors qu'un AUTRE gel est actif : la cause absente n'en libère aucune.
		d.geler('lecture', t(8_000));
		d.degeler('correction', t(12_000));
		expect(d.enPause()).toBe(true);
		expect(d.tic(t(15_000))).toBe(52_000);
	});

	it('gels imbriqués : le décompte ne repart qu’à la DERNIÈRE cause retirée', () => {
		const d = creerDecompte(DUREE, T0);
		// L'enfant se trompe (correction affichée) puis réécoute l'énoncé pendant celle-ci.
		d.geler('correction', t(10_000)); // 10 s jouées
		d.geler('lecture', t(12_000));
		expect(d.enPause()).toBe(true);
		d.degeler('correction', t(14_000)); // la correction se referme, la voix parle encore
		expect(d.enPause()).toBe(true);
		expect(d.tic(t(18_000))).toBe(50_000);
		d.degeler('lecture', t(20_000)); // dernière cause : reprise
		expect(d.enPause()).toBe(false);
		expect(d.tic(t(23_000))).toBe(47_000); // 10 s + 3 s jouées, 10 s gelées
	});

	it('les deux causes sont indépendantes : dégeler l’une ne relâche pas l’autre', () => {
		const d = creerDecompte(DUREE, T0);
		d.geler('lecture', t(1_000));
		d.geler('correction', t(2_000));
		d.degeler('lecture', t(3_000));
		expect(d.enPause()).toBe(true);
		d.degeler('lecture', t(9_000)); // dégel répété d'une cause déjà levée
		expect(d.enPause()).toBe(true);
		expect(d.tic(t(9_000))).toBe(59_000); // 1 s jouée en tout
		d.degeler('correction', t(9_000));
		expect(d.enPause()).toBe(false);
	});
});

describe('Décompte du sprint — C12 : réécouter n’achète aucun temps', () => {
	/* Frise A : 5 écoutes de 2 s, séparées de 1 s de réflexion.
	   Frise B : la même durée d'écoute CUMULÉE (10 s) en une seule fois, même temps joué.
	   Les deux doivent laisser exactement le même temps de partie — et ce temps est celui
	   que je calcule à la main : 60 s − 5 s réellement jouées. */
	const JOUE = 5_000;

	const cinqEcoutes = (): number => {
		const d = creerDecompte(DUREE, T0);
		let now = T0;
		for (let i = 0; i < 5; i++) {
			now += 1_000; // 1 s de réflexion
			d.tic(now);
			d.geler('lecture', now);
			now += 2_000; // 2 s d'écoute
			d.tic(now); // le sprint continue de battre pendant la lecture
			d.degeler('lecture', now);
		}
		return d.tic(now);
	};

	const uneEcoute = (): number => {
		const d = creerDecompte(DUREE, T0);
		const fin = T0 + JOUE;
		d.tic(fin);
		d.geler('lecture', fin);
		d.tic(fin + 10_000);
		d.degeler('lecture', fin + 10_000);
		return d.tic(fin + 10_000);
	};

	it('critère 12 : 5 écoutes de 2 s laissent le même temps qu’UNE écoute de 10 s', () => {
		expect(cinqEcoutes()).toBe(DUREE - JOUE);
		expect(uneEcoute()).toBe(DUREE - JOUE);
		expect(cinqEcoutes()).toBe(uneEcoute());
	});

	it('critère 12 : aucune fuite par bascule, même sur des écoutes plus courtes que le battement', () => {
		// Le piège annoncé : un battement de 250 ms non soldé à chaque gel/dégel. Ici les
		// segments joués (30 ms) sont bien plus courts que ce battement ; une fuite d'un
		// battement par écoute rendrait la partie quasi interminable.
		const d = creerDecompte(DUREE, T0);
		const ECOUTES = 40;
		let now = T0;
		for (let i = 0; i < ECOUTES; i++) {
			now += 30;
			d.geler('lecture', now);
			now += 4_000;
			d.degeler('lecture', now);
		}
		expect(d.tic(now)).toBe(DUREE - 30 * ECOUTES);
	});

	it('critère 12 : longue série gel/dégel quelconque — le restant vaut la somme du temps joué', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						jeu: fc.integer({ min: 0, max: 400 }),
						gel: fc.integer({ min: 0, max: 900 }),
						cause: fc.constantFrom<CauseGel>('lecture', 'correction'),
						relevePendantGel: fc.boolean(),
					}),
					{ minLength: 1, maxLength: 40 },
				),
				(segments) => {
					const duree = 600_000; // large : on reste loin du plancher à zéro
					const d = creerDecompte(duree, T0);
					let now = T0;
					let joue = 0;
					for (const s of segments) {
						now += s.jeu;
						joue += s.jeu;
						d.geler(s.cause, now);
						now += s.gel;
						if (s.relevePendantGel) d.tic(now);
						d.degeler(s.cause, now);
					}
					expect(d.tic(now)).toBe(duree - joue);
				},
			),
			{ numRuns: 300 },
		);
	});
});

describe('Décompte du sprint — C13 : le gel est porté par le décompte, pas par l’affichage', () => {
	it('critère 13 : le décompte n’a AUCUN moyen de savoir si le minuteur est visible', () => {
		// L'aménagement « sans pression temporelle » masque le minuteur. Pour que le gel
		// puisse en dépendre, il faudrait bien que l'information entre quelque part : ni la
		// fabrique ni les méthodes n'ont de paramètre pour ça, et le module ne lit rien du
		// DOM (tout le temps lui est passé). Le gel ne peut donc être porté que par le
		// décompte lui-même. Ce test se contente de le CONSTATER sur la surface d'API ;
		// que `sprint.ts` gèle bien même minuteur caché reste du ressort de l'e2e.
		expect(creerDecompte.length).toBe(2); // (dureeMs, maintenant) et rien d'autre
		const d = creerDecompte(DUREE, T0);
		expect(Object.keys(d).sort()).toEqual(['degeler', 'enPause', 'geler', 'restant', 'tic']);
		expect(d.geler.length).toBe(2); // (cause, now)
		expect(d.degeler.length).toBe(2);
	});

	it('critère 13 : sans aucun relevé pendant la lecture (rien à redessiner), le gel tient quand même', () => {
		// Minuteur caché : l'écran n'a plus de raison d'appeler `tic` à chaque battement.
		// Si le gel était porté par la boucle d'affichage, les 30 s d'écoute reviendraient
		// d'un coup au dégel.
		const d = creerDecompte(DUREE, T0);
		d.geler('lecture', t(8_000));
		d.degeler('lecture', t(38_000)); // 30 s d'écoute, zéro relevé entre les deux
		expect(d.restant()).toBe(52_000);
		expect(d.tic(t(40_000))).toBe(50_000);
	});
});
