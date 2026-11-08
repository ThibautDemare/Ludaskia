/* ============================================================
   Garde de double appui (parcours d'orthographe : dictée, mot caché) — logique pure.

   Au 1er échec, la saisie fausse reste dans le champ. Un double appui accidentel sur
   « Vérifier » (ou une double Entrée) renverrait la même réponse fausse et brûlerait le
   2e essai. La garde ignore ce doublon, mais UNE seule fois et dans une fenêtre courte,
   pour qu'un enfant qui maintient sa réponse arrive quand même à la correction guidée.

   Attendus dérivés des règles de l'issue (pas d'une implémentation) :
   1. première réponse fausse → comptée ;
   2. même réponse que l'essai compté précédent, STRICTEMENT moins de
      DELAI_DOUBLE_APPUI_MS après lui → ignorée ;
   3. « même » = égalité après normalizeText (trim, espaces internes réduits, NFC),
      sans pliage de casse ni d'accents ;
   4. une seule fois : après un doublon ignoré, la même réponse suivante est comptée ;
   5. borne exclue : à DELAI_DOUBLE_APPUI_MS ou plus → comptée ;
   6. réponse différente → comptée, et devient la référence ;
   7. deux gardes ne partagent aucun état ;
   8. sans horloge injectée, la garde fonctionne (horloge réelle lue).
   ============================================================ */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { creerGardeDoubleAppui, DELAI_DOUBLE_APPUI_MS } from '../src/core/orthographe/double-appui';

/* Horloge pilotée : chaque test avance `t` à la main, aucune dépendance au temps réel. */
function horlogePilotee() {
	const h = { t: 0, maintenant: () => h.t };
	return h;
}

/* Joue une suite de réponses fausses à des instants donnés, rend les verdicts de la garde
   (true = doublon ignoré). Une garde neuve par appel : « une garde par mot affiché ». */
function jouer(appuis: ReadonlyArray<readonly [instant: number, saisie: string]>): boolean[] {
	const h = horlogePilotee();
	const garde = creerGardeDoubleAppui(h.maintenant);
	return appuis.map(([instant, saisie]) => {
		h.t = instant;
		return garde(saisie);
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('garde de double appui — contrat', () => {
	it('la fenêtre de double appui vaut une seconde', () => {
		expect(DELAI_DOUBLE_APPUI_MS).toBe(1000);
	});
});

describe('règle 1 : première réponse fausse', () => {
	it('la toute première réponse fausse est comptée', () => {
		expect(jouer([[0, 'bonjoru']])).toEqual([false]);
	});
});

describe('règle 2 : doublon dans la fenêtre', () => {
	it('même réponse reçue au même instant → doublon ignoré', () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[0, 'bonjoru'],
			]),
		).toEqual([false, true]);
	});

	it('même réponse reçue juste avant la fin de la fenêtre → doublon ignoré', () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[DELAI_DOUBLE_APPUI_MS - 1, 'bonjoru'],
			]),
		).toEqual([false, true]);
	});

	it("une fraction de milliseconde sous la borne reste dans la fenêtre (pas d'arrondi)", () => {
		// performance.now() rend des fractions : 999,6 ms est strictement sous 1000 ms.
		expect(
			jouer([
				[0, 'bonjoru'],
				[DELAI_DOUBLE_APPUI_MS - 0.4, 'bonjoru'],
			]),
		).toEqual([false, true]);
	});
});

describe('règle 5 : borne de la fenêtre exclue', () => {
	it('même réponse reçue exactement à DELAI_DOUBLE_APPUI_MS → comptée', () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[DELAI_DOUBLE_APPUI_MS, 'bonjoru'],
			]),
		).toEqual([false, false]);
	});

	it('même réponse reçue bien après la fenêtre → comptée', () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[DELAI_DOUBLE_APPUI_MS * 5, 'bonjoru'],
			]),
		).toEqual([false, false]);
	});

	it("la fenêtre se mesure depuis l'instant de l'essai compté, pas depuis zéro", () => {
		// Essai compté à t = 10 000 ; le doublon à 10 500 est à 500 ms de lui.
		expect(
			jouer([
				[10_000, 'bonjoru'],
				[10_500, 'bonjoru'],
			]),
		).toEqual([false, true]);
	});
});

describe('règle 3 : « même réponse » = égalité après normalizeText', () => {
	it('espaces de tête et de fin ignorés', () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[100, '  bonjoru  '],
			]),
		).toEqual([false, true]);
	});

	it('espaces internes multiples réduits à un seul (espaces, tabulation)', () => {
		expect(
			jouer([
				[0, 'le chat'],
				[100, 'le   chat'],
			]),
		).toEqual([false, true]);
		expect(
			jouer([
				[0, 'le chat'],
				[100, 'le\tchat'],
			]),
		).toEqual([false, true]);
	});

	it('une espace insécable compte comme une espace', () => {
		expect(
			jouer([
				[0, 'le chat'],
				[100, 'le\u00a0chat'],
			]),
		).toEqual([false, true]);
	});

	it("forme décomposée et forme composée d'un accent sont la même saisie (NFC)", () => {
		const compose = '\u00e9l\u00e8ve'; // « élève », lettres précomposées
		const decompose = 'e\u0301le\u0300ve'; // « élève », lettre + accent combinant
		expect(compose).not.toBe(decompose); // garde du test : les deux chaînes diffèrent bien
		expect(
			jouer([
				[0, compose],
				[100, decompose],
			]),
		).toEqual([false, true]);
	});

	it("la casse n'est PAS repliée : « Bonjoru » puis « bonjoru » → comptée", () => {
		expect(
			jouer([
				[0, 'Bonjoru'],
				[100, 'bonjoru'],
			]),
		).toEqual([false, false]);
	});

	it('les accents ne sont PAS repliés : « élève » puis « eleve » → comptée', () => {
		expect(
			jouer([
				[0, 'élève'],
				[100, 'eleve'],
			]),
		).toEqual([false, false]);
	});

	it('une espace interne ajoutée ou retirée change la saisie', () => {
		expect(
			jouer([
				[0, 'bonjour'],
				[100, 'bon jour'],
			]),
		).toEqual([false, false]);
	});
});

describe('règle 4 : un seul doublon ignoré', () => {
	it("après un doublon ignoré, la même réponse suivante est comptée même dans la fenêtre (l'enfant qui insiste atteint son 2e essai)", () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[100, 'bonjoru'],
				[200, 'bonjoru'],
			]),
		).toEqual([false, true, false]);
	});

	it('après un doublon ignoré, la même réponse suivante est comptée hors fenêtre aussi', () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[100, 'bonjoru'],
				[DELAI_DOUBLE_APPUI_MS * 5, 'bonjoru'],
			]),
		).toEqual([false, true, false]);
	});

	/* « Une fois » s'entend PAR RÉFÉRENCE, pas par garde : chaque essai compté repose la
	   référence, donc un nouveau doublon de cet essai redevient possible. */
	it('cycle complet, même réponse dans la fenêtre : comptée, ignorée, comptée, puis le doublon de ce dernier essai est ignoré', () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[100, 'bonjoru'],
				[200, 'bonjoru'],
				[300, 'bonjoru'],
			]),
		).toEqual([false, true, false, true]);
	});

	it("le doublon consommé sur une réponse n'empêche pas d'ignorer celui d'une nouvelle réponse comptée", () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[100, 'bonjoru'],
				[200, 'bonjuor'],
				[300, 'bonjuor'],
			]),
		).toEqual([false, true, false, true]);
	});
});

describe('règle 6 : une réponse différente devient la référence', () => {
	it("réponse différente → comptée, puis un doublon d'elle dans la fenêtre → ignoré", () => {
		expect(
			jouer([
				[0, 'bonjoru'],
				[100, 'bonjuor'],
				[200, 'bonjuor'],
			]),
		).toEqual([false, false, true]);
	});

	it("l'ancienne référence n'est plus reconnue comme doublon une fois remplacée", () => {
		// « bonjoru » n'est plus la référence : la revoir à 100 ms de son premier envoi
		// ne doit pas la faire ignorer (la garde ne retient pas un ensemble de réponses vues).
		expect(
			jouer([
				[0, 'bonjoru'],
				[50, 'bonjuor'],
				[100, 'bonjoru'],
			]),
		).toEqual([false, false, false]);
	});

	it("la fenêtre repart de l'instant de la nouvelle référence", () => {
		// « bonjuor » compté à 800 ; son doublon à 1 500 est à 700 ms de lui (dans la
		// fenêtre), mais à 1 500 ms du premier essai : la référence temporelle doit suivre.
		expect(
			jouer([
				[0, 'bonjoru'],
				[800, 'bonjuor'],
				[1500, 'bonjuor'],
			]),
		).toEqual([false, false, true]);
	});
});

describe('règle 7 : deux gardes indépendantes', () => {
	it("une garde neuve compte la réponse qu'une autre garde vient de voir", () => {
		const h = horlogePilotee();
		const motA = creerGardeDoubleAppui(h.maintenant);
		const motB = creerGardeDoubleAppui(h.maintenant);
		expect(motA('bonjoru')).toBe(false);
		h.t = 100;
		expect(motB('bonjoru')).toBe(false);
	});

	it("le doublon consommé par une garde reste disponible pour l'autre", () => {
		const h = horlogePilotee();
		const motA = creerGardeDoubleAppui(h.maintenant);
		const motB = creerGardeDoubleAppui(h.maintenant);
		expect(motA('bonjoru')).toBe(false);
		expect(motB('bonjoru')).toBe(false);
		h.t = 100;
		expect(motA('bonjoru')).toBe(true);
		expect(motB('bonjoru')).toBe(true);
		h.t = 200;
		expect(motA('bonjoru')).toBe(false);
		expect(motB('bonjoru')).toBe(false);
	});

	it('une garde ne voit pas la référence posée dans une autre', () => {
		const h = horlogePilotee();
		const motA = creerGardeDoubleAppui(h.maintenant);
		const motB = creerGardeDoubleAppui(h.maintenant);
		expect(motA('bonjoru')).toBe(false);
		expect(motB('maizon')).toBe(false);
		h.t = 100;
		// Pour motA, la référence est toujours « bonjoru » : « maizon » est une autre réponse.
		expect(motA('maizon')).toBe(false);
	});
});

describe('règle 8 : horloge par défaut', () => {
	it('sans horloge injectée, deux appuis immédiats identiques → compté puis ignoré', () => {
		const garde = creerGardeDoubleAppui();
		expect(garde('bonjoru')).toBe(false);
		expect(garde('bonjoru')).toBe(true);
	});

	it('sans horloge injectée, le temps réel est bien lu : hors fenêtre, le doublon est compté', () => {
		// Sans ce test, une horloge par défaut figée (() => 0) passerait le précédent.
		let t = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => t);
		const garde = creerGardeDoubleAppui();
		expect(garde('bonjoru')).toBe(false);
		t = DELAI_DOUBLE_APPUI_MS + 500;
		expect(garde('bonjoru')).toBe(false);
	});
});
