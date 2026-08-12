/* ============================================================
   Sous-questions d'un problème (src/core/probleme-etapes.ts, #199 / #467).
   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés du
   besoin (« le journal doit dire ce qui s'est passé »), jamais recopiés de
   l'implémentation.

   Ce qui est éprouvé :
   - les TROIS issues d'une case, le « vide » étant un état à part entière et non
     un « faux » (ne pas essayer n'est pas se tromper) ;
   - le cas de bord qui a motivé l'extraction du module : une case VIDE sur une
     étape dont la réponse attendue est 0. `Number('')` vaut 0, donc toute
     comparaison faite AVANT le test du vide déclarerait « juste » un champ jamais
     rempli — et ferait disparaître la sous-question du journal encadrant ;
   - la virgule française (« 4,5 » = 4,5 ; « 12,50 » = 12,5, prix en euros) et les
     espaces autour de la saisie ;
   - une saisie non numérique, qui est une vraie tentative ratée et pas un vide ;
   - la réponse attendue AFFICHÉE à la française ;
   - les entrées de journal d'un problème passé : tout juste → aucune entrée, tout
     vide → une entrée « n'a pas essayé » par sous-question, mixte → exactement les
     bonnes entrées, dans l'ordre des sous-questions et avec le bon drapeau.
   Le rendu (case verrouillée, marque « → réponse », live region) vit dans
   src/ui/lecon-probleme.ts → e2e.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	etatEtape,
	etapeJuste,
	attenduEtapeTexte,
	entreesEtapesPassees,
} from '../src/core/probleme-etapes';
import { getAllLessons } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import type { ProblemeEtape } from '../src/core/exercise';

/** Sous-question d'un problème, réduite à ce que la règle regarde. */
const etape = (question: string, answer: number): ProblemeEtape => ({ question, answer });

describe('etatEtape — trois issues par case', () => {
	it('case remplie et exacte → « juste »', () => {
		expect(etatEtape('12', 12)).toBe('juste');
	});

	it('case remplie et inexacte → « faux » (une tentative ratée)', () => {
		expect(etatEtape('11', 12)).toBe('faux');
		expect(etatEtape('4', 4.5)).toBe('faux');
		expect(etatEtape('45', 4.5)).toBe('faux');
	});

	it('case jamais remplie → « vide », qui n’est pas un « faux »', () => {
		expect(etatEtape('', 12)).toBe('vide');
	});

	/* Le piège que le module existe pour fermer : `Number('')` vaut 0 en JavaScript.
	   Une comparaison faite avant le test du vide déclarerait « juste » une case
	   jamais touchée dès que la réponse attendue est 0 — l'enfant serait félicité
	   pour un champ blanc, et la sous-question disparaîtrait du journal encadrant
	   (aucune entrée n'est produite pour une case juste). */
	it('case VIDE sur une étape dont la réponse est 0 → « vide », jamais « juste »', () => {
		expect(etatEtape('', 0)).toBe('vide');
		expect(etatEtape('   ', 0)).toBe('vide');
		expect(etapeJuste('', 0)).toBe(false);
	});

	it('un 0 réellement écrit sur une étape à 0 → « juste »', () => {
		expect(etatEtape('0', 0)).toBe('juste');
	});

	it('un espace seul (ou une tabulation) vaut une case vide, pas une erreur', () => {
		expect(etatEtape(' ', 7)).toBe('vide');
		expect(etatEtape('\t\n ', 7)).toBe('vide');
	});

	it('les espaces autour d’une saisie exacte ne la rendent pas fausse', () => {
		expect(etatEtape('  7  ', 7)).toBe('juste');
		expect(etatEtape('\t4,5\n', 4.5)).toBe('juste');
	});

	it('la virgule française vaut le séparateur décimal (« 4,5 » = 4,5)', () => {
		expect(etatEtape('4,5', 4.5)).toBe('juste');
		expect(etatEtape('0,5', 0.5)).toBe('juste');
		expect(etatEtape('4,5', 45)).toBe('faux'); // la virgule n'est pas ignorée
	});

	it('un prix écrit avec ses deux décimales (« 12,50 ») vaut 12,5', () => {
		expect(etatEtape('12,50', 12.5)).toBe('juste');
		expect(etatEtape('3,00', 3)).toBe('juste');
	});

	/* Tolérance de CLAVIER, pas d'enseignement : l'application n'écrit jamais le point
	   (la réponse attendue s'affiche « 4,5 », cf. attenduEtapeTexte), mais un pavé
	   numérique — physique ou Android — peut n'offrir que le point. Compter faux une
	   réponse juste à cause de la touche disponible punirait le matériel, pas le
	   raisonnement : la permissivité est défendable ici. */
	it('un point décimal est accepté comme la virgule (tolérance de clavier)', () => {
		expect(etatEtape('4.5', 4.5)).toBe('juste');
	});

	it('une saisie non numérique est une tentative FAUSSE, jamais un vide', () => {
		for (const saisie of ['abc', '4,5,6', '?', '12 ans', '-']) {
			expect(etatEtape(saisie, 12)).toBe('faux');
		}
	});
});

describe('etapeJuste — raccourci binaire du chemin de correction', () => {
	it('ne dit « juste » que pour une case remplie ET exacte', () => {
		const cas: [string, number, boolean][] = [
			['12', 12, true],
			[' 12 ', 12, true],
			['4,5', 4.5, true],
			['0', 0, true],
			['', 0, false],
			['  ', 12, false],
			['13', 12, false],
			['abc', 12, false],
		];
		for (const [saisie, attendu, juste] of cas) {
			expect(etapeJuste(saisie, attendu), `${JSON.stringify(saisie)} vs ${attendu}`).toBe(juste);
		}
	});
});

describe('attenduEtapeTexte — réponse attendue écrite à la française', () => {
	it('un entier s’affiche tel quel', () => {
		expect(attenduEtapeTexte(12)).toBe('12');
		expect(attenduEtapeTexte(0)).toBe('0');
	});

	it('un décimal s’affiche avec une virgule, jamais un point', () => {
		expect(attenduEtapeTexte(4.5)).toBe('4,5');
		expect(attenduEtapeTexte(12.05)).toBe('12,05');
		expect(attenduEtapeTexte(0.75)).not.toContain('.');
	});

	it('ce qui est affiché est ré-acceptable en saisie (aller-retour)', () => {
		for (const attendu of [0, 7, 4.5, 12.05, 130]) {
			expect(etatEtape(attenduEtapeTexte(attendu), attendu)).toBe('juste');
		}
	});
});

/* ============================================================
   Entrées de journal d'un problème PASSÉ (#467). Spec dérivée du besoin : le parent
   lit ce journal, il doit y trouver ce qui s'est passé sous-question par
   sous-question — et surtout pas « n'a pas essayé » collé sur une case remplie.
   ============================================================ */
describe('entreesEtapesPassees — honnêteté du journal, sous-question par sous-question', () => {
	const deux: ProblemeEtape[] = [
		etape('Combien y a-t-il de billes en tout ?', 12),
		etape('Combien lui en reste-t-il ?', 5),
	];

	it('problème tout juste → AUCUNE entrée (on ne fabrique pas une erreur)', () => {
		expect(entreesEtapesPassees(deux, ['12', '5'])).toEqual([]);
	});

	it('problème tout vide → une entrée « n’a pas essayé » par sous-question', () => {
		expect(entreesEtapesPassees(deux, ['', ''])).toEqual([
			{ etape: deux[0], donnee: '', sansTentative: true },
			{ etape: deux[1], donnee: '', sansTentative: true },
		]);
	});

	it('case remplie et fausse → vraie entrée d’erreur, avec ce que l’enfant avait écrit', () => {
		const entrees = entreesEtapesPassees(deux, ['12', '9']);
		expect(entrees).toHaveLength(1);
		expect(entrees[0].etape.question).toBe('Combien lui en reste-t-il ?');
		expect(entrees[0].donnee).toBe('9');
		expect(entrees[0].sansTentative).toBe(false);
	});

	it('problème mixte → les bonnes entrées, dans l’ordre, avec le bon drapeau', () => {
		const trois: ProblemeEtape[] = [
			etape('Combien de cartes en tout ?', 30),
			etape('Combien pour chacun ?', 6),
			etape('Combien en reste-t-il ?', 0),
		];
		// juste / faux / vide → l'étape juste sort, les deux autres restent distinguées.
		expect(entreesEtapesPassees(trois, ['30', '5', ''])).toEqual([
			{ etape: trois[1], donnee: '5', sansTentative: false },
			{ etape: trois[2], donnee: '', sansTentative: true },
		]);
	});

	it('l’étape à réponse 0 laissée vide reste au journal, marquée « n’a pas essayé »', () => {
		const zero: ProblemeEtape[] = [etape('Combien en reste-t-il ?', 0)];
		expect(entreesEtapesPassees(zero, [''])).toEqual([
			{ etape: zero[0], donnee: '', sansTentative: true },
		]);
	});

	it('une saisie manquante (moins de saisies que d’étapes) compte comme vide', () => {
		expect(entreesEtapesPassees(deux, ['12'])).toEqual([
			{ etape: deux[1], donnee: '', sansTentative: true },
		]);
		expect(entreesEtapesPassees(deux, [])).toHaveLength(2);
	});

	it('la réponse journalisée est débarrassée de ses espaces', () => {
		expect(entreesEtapesPassees(deux, ['  9  ', '  '])).toEqual([
			{ etape: deux[0], donnee: '9', sansTentative: false },
			{ etape: deux[1], donnee: '', sansTentative: true },
		]);
	});

	it('une saisie illisible est journalisée telle qu’écrite, comme une tentative', () => {
		const entrees = entreesEtapesPassees(deux, ['douze', '']);
		expect(entrees[0]).toEqual({ etape: deux[0], donnee: 'douze', sansTentative: false });
	});

	it('ne modifie ni les étapes ni les saisies reçues', () => {
		const etapes = [...deux];
		const saisies = ['12', ''];
		const avant = JSON.stringify([etapes, saisies]);
		entreesEtapesPassees(etapes, saisies);
		expect(JSON.stringify([etapes, saisies])).toBe(avant);
	});

	it('un problème sans étape ne produit rien', () => {
		expect(entreesEtapesPassees([], [])).toEqual([]);
	});
});

/* ============================================================
   Sur les VRAIS problèmes du catalogue (échantillon à graine fixe, donc rejouable).
   Les cas ci-dessus fixent la règle ; celui-ci vérifie qu'elle tient sur les réponses
   réellement produites — notamment les décimaux d'argent et de mesure du CM1, dont une
   dérive de flottant (0,30000000000000004) afficherait à côté de la case une réponse
   illisible ET non ré-écrivable par l'enfant.
   ============================================================ */
describe('sur les problèmes réellement générés par le catalogue', () => {
	const TIRAGES = 60;

	/** Étapes de tous les problèmes tirés d'une leçon, à tous ses niveaux. */
	function etapesTirees(): { id: string; etape: ProblemeEtape }[] {
		const out: { id: string; etape: ProblemeEtape }[] = [];
		for (const lecon of getAllLessons()) {
			for (const level of lecon.levels) {
				withSeed(20467, () => {
					for (let i = 0; i < TIRAGES; i++) {
						const ex = lecon.exerciseType.generate({ level });
						if (ex.type !== 'probleme') return; // leçon sans sous-questions : rien à éprouver
						for (const etape of ex.etapes) out.push({ id: `${lecon.id}/${level}`, etape });
					}
				});
			}
		}
		return out;
	}

	const ECHANTILLON = etapesTirees();

	it('l’échantillon contient bien des problèmes, dont des décimaux (sinon rien n’est prouvé)', () => {
		expect(ECHANTILLON.length).toBeGreaterThan(100);
		expect(ECHANTILLON.some(({ etape }) => !Number.isInteger(etape.answer))).toBe(true);
	});

	it('la réponse affichée à côté de la case est lisible par un enfant', () => {
		for (const { id, etape } of ECHANTILLON) {
			const texte = attenduEtapeTexte(etape.answer);
			expect(texte, id).not.toContain('.'); // jamais le point décimal anglo-saxon
			expect(texte, id).not.toMatch(/e[+-]/i); // ni une notation scientifique
			expect(texte, id).toMatch(/^\d+(,\d{1,2})?$/); // au plus deux décimales (argent)
		}
	});

	it('ce qui est affiché serait accepté si l’enfant le recopiait', () => {
		for (const { id, etape } of ECHANTILLON) {
			expect(etatEtape(attenduEtapeTexte(etape.answer), etape.answer), id).toBe('juste');
		}
	});

	it('un problème réel laissé entièrement vide journalise chacune de ses sous-questions', () => {
		const parLecon = new Map<string, ProblemeEtape[]>();
		for (const { id, etape } of ECHANTILLON) parLecon.set(id, [...(parLecon.get(id) ?? []), etape]);
		for (const [id, etapes] of parLecon) {
			const entrees = entreesEtapesPassees(etapes, []);
			expect(entrees, id).toHaveLength(etapes.length);
			expect(
				entrees.every((e) => e.sansTentative && e.donnee === ''),
				id,
			).toBe(true);
		}
	});
});
