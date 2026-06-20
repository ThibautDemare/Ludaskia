/* ============================================================
   Consignes d'action visibles (#265) — leçons QCM dont l'énoncé est
   télégraphique ou agrège plusieurs tâches. On verrouille au niveau des DONNÉES
   (pas du DOM) la consigne attendue PAR ITEM, car le générateur tire au hasard
   dans une banque hétérogène : une assertion e2e serait flaky.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { ITEMS_CLASSES } from '../src/data/francais/classes-mots';
import { ITEMS_FAMILLES } from '../src/data/francais/familles';
import { POSEE_LESSONS } from '../src/data/maths/posee';

describe("classes-mots — consigne d'action par item (#265)", () => {
	it('classe → « Est-ce un nom… », article → « Quel petit mot va devant… », adverbe → aucune', () => {
		for (const item of ITEMS_CLASSES) {
			if (item.type === 'classe') {
				expect(item.consigne).toBe('Est-ce un nom, un verbe ou un adjectif ?');
			} else if (item.type === 'article') {
				expect(item.consigne).toBe('Quel petit mot va devant : le, la ou les ?');
			} else {
				// L'adverbe : l'énoncé « Quel est l'adverbe ? … » EST déjà une question d'action.
				expect(item.consigne).toBeUndefined();
			}
		}
	});
});

describe("familles — consigne d'action par tâche (#265)", () => {
	it('famille → « … même famille ? », préfixe/suffixe → « Que veut dire ce mot ? »', () => {
		for (const item of ITEMS_FAMILLES) {
			if (item.type === 'famille') {
				expect(item.consigne).toBe('Quel mot est de la même famille ?');
			} else {
				expect(item.consigne).toBe('Que veut dire ce mot ?');
			}
		}
	});
});

describe("opérations posées — consigne d'action (#265)", () => {
	// La grille posée n'a pas d'énoncé : sa consigne (ExerciseType.consigne) est désormais
	// affichée en fiche ET en révision (propagée par renderPosed).
	it('chaque leçon posée porte sa consigne « Pose … et calcule. »', () => {
		const attendu: Record<string, string> = {
			'calc-addition-posee': "Pose l'addition et calcule.",
			'calc-soustraction-posee': 'Pose la soustraction et calcule.',
			'calc-multiplication-posee': 'Pose la multiplication et calcule.',
		};
		for (const l of POSEE_LESSONS) {
			expect(l.exerciseType.consigne).toBe(attendu[l.id]);
		}
	});
});
