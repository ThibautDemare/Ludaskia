/* ============================================================
   Capture d'erreur (#391) — mise en forme pure (helper UI, testé isolément
   sur le modèle de tests/anti-suggestion.test.ts), puis la capture elle-même :
   garde-fous (leçon + énoncé lisible) et normalisation du marqueur
   « passé sans essayer » (#467) avant stockage.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	questionPourJournal,
	libelleChoix,
	capterErreur,
	type CaptureErreurOpts,
} from '../src/ui/erreur-capture';
import type { ChoiceView } from '../src/core/exercise';
import { chargerErreursFor, ERREURS_KEY } from '../src/core/erreurs-journal';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('questionPourJournal', () => {
	it('remplace l’emplacement de réponse @ par des points de suspension', () => {
		expect(questionPourJournal('45 + @ = 57')).toBe('45 + … = 57');
	});

	it('écrase les espaces multiples', () => {
		expect(questionPourJournal('Écris   le    mot')).toBe('Écris le mot');
	});

	it('énoncé vide SANS figure → chaîne vide (non journalisable)', () => {
		expect(questionPourJournal('')).toBe('');
		expect(questionPourJournal('   ')).toBe('');
	});

	it('énoncé vide AVEC figure → libellé « Exercice avec un dessin »', () => {
		expect(questionPourJournal('', true)).toBe('Exercice avec un dessin');
	});

	it('énoncé non vide AVEC figure → suffixe « (exercice avec dessin) »', () => {
		expect(questionPourJournal('Quelle heure est-il ?', true)).toBe(
			'Quelle heure est-il ? (exercice avec dessin)',
		);
	});
});

describe('libelleChoix', () => {
	const view: ChoiceView[] = [
		{ html: '<span>1/2</span>', label: 'un demi' },
		{ html: '<span>1/4</span>', label: 'un quart' },
	];

	it('sans vue riche → la valeur brute (QCM texte déjà lisible)', () => {
		expect(libelleChoix(['chat', 'chien'], undefined, 'chien')).toBe('chien');
	});

	it('avec vue riche → le libellé parlé aligné sur l’index de la valeur', () => {
		expect(libelleChoix(['1/2', '1/4'], view, '1/4')).toBe('un quart');
	});

	it('valeur introuvable → repli sur la valeur (jamais en pratique)', () => {
		expect(libelleChoix(['1/2', '1/4'], view, '3/4')).toBe('3/4');
	});
});

/* ============================================================
   #467 — `capterErreur` : normalisation du marqueur « passé sans essayer ».
   ------------------------------------------------------------
   L'appelant (runner) passe un BOOLÉEN (son propre drapeau) ; le journal, lui, ne
   doit contenir le marqueur que pour un vrai passage. Spec dérivée du besoin :
   - drapeau vrai → l'entrée est marquée, sans réponse donnée ;
   - drapeau faux ou absent → entrée ORDINAIRE, et RIEN de plus en stockage (le
     journal est plafonné et lu à chaque écriture : un `false` recopié sur des
     centaines d'entrées serait du poids mort) ;
   - les garde-fous d'origine (#391) ne bougent pas : pas de leçon ou pas d'énoncé
     lisible ⇒ on ne journalise rien, drapeau ou pas.
   ============================================================ */

/* Options d'une capture réaliste (révision, saisie libre). */
function opts(over: Partial<CaptureErreurOpts> = {}): CaptureErreurOpts {
	return {
		text: 'Quel mot va avec « dos » ?',
		donnee: 'dossard',
		attendue: 'dossier',
		lessonId: 'vocab-familles',
		mode: 'revision',
		...over,
	};
}

/* Journal du profil actif (côté encadrant) + sa forme BRUTE en stockage. */
function journal() {
	return chargerErreursFor(activeProfile().uuid);
}
function journalBrut(): string {
	return localStorage.getItem(activeProfile().uuid + '/' + ERREURS_KEY) ?? '';
}

describe('capterErreur — marqueur « passé sans essayer » (#467)', () => {
	it('drapeau vrai → entrée marquée, sans réponse donnée', () => {
		capterErreur(opts({ donnee: '', sansTentative: true }));
		expect(journal()).toHaveLength(1);
		expect(journal()[0]).toMatchObject({
			lessonId: 'vocab-familles',
			mode: 'revision',
			question: 'Quel mot va avec « dos » ?',
			donnee: '',
			attendue: 'dossier',
			sansTentative: true,
		});
	});

	it('drapeau faux → entrée ordinaire, et AUCUN champ parasite en stockage', () => {
		capterErreur(opts({ sansTentative: false }));
		expect(journal()[0].sansTentative).toBeUndefined();
		expect(journal()[0].donnee).toBe('dossard');
		expect(journalBrut()).not.toContain('sansTentative');
	});

	it('drapeau absent → strictement comme un drapeau faux', () => {
		capterErreur(opts());
		const sansDrapeau = journal();
		expect(sansDrapeau[0].sansTentative).toBeUndefined();
		expect(journalBrut()).not.toContain('sansTentative');

		localStorage.clear();
		initProfiles();
		capterErreur(opts({ sansTentative: false }));
		expect(journal()[0]).toEqual({ ...sansDrapeau[0], ts: journal()[0].ts });
	});

	it('un item passé garde la mise en forme de l’énoncé (@ → « … », espaces)', () => {
		capterErreur(opts({ text: '45 +  @  = 57', donnee: '', sansTentative: true }));
		expect(journal()[0].question).toBe('45 + … = 57');
		expect(journal()[0].sansTentative).toBe(true);
	});

	it('un item passé sur un exercice à dessin reste journalisé et signalé', () => {
		capterErreur(opts({ text: '', figure: '<svg></svg>', donnee: '', sansTentative: true }));
		expect(journal()[0]).toMatchObject({
			question: 'Exercice avec un dessin',
			sansTentative: true,
		});
	});

	it('garde-fous inchangés : pas de leçon ⇒ rien de journalisé, drapeau ou pas', () => {
		capterErreur(opts({ lessonId: null, donnee: '', sansTentative: true }));
		capterErreur(opts({ lessonId: null }));
		expect(journal()).toEqual([]);
	});

	it('garde-fous inchangés : énoncé illisible ⇒ rien de journalisé, drapeau ou pas', () => {
		for (const text of ['', '   ']) {
			capterErreur(opts({ text, donnee: '', sansTentative: true }));
			capterErreur(opts({ text }));
		}
		expect(journal()).toEqual([]);
	});

	it('deux passages successifs sont journalisés séparément (plus récent d’abord)', () => {
		capterErreur(opts({ text: 'Q1', donnee: '', sansTentative: true }));
		capterErreur(opts({ text: 'Q2', donnee: 'essai' }));
		expect(journal().map((e) => [e.question, e.sansTentative])).toEqual([
			['Q2', undefined],
			['Q1', true],
		]);
	});
});
