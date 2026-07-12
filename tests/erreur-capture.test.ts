/* ============================================================
   Capture d'erreur (#391) — mise en forme pure (helper UI, testé isolément
   sur le modèle de tests/anti-suggestion.test.ts).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { questionPourJournal, libelleChoix } from '../src/ui/erreur-capture';
import type { ChoiceView } from '../src/core/exercise';

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
