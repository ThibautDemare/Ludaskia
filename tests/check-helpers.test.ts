/* ============================================================
   Helpers de correction centralisés (#346) — logique PURE, sans DOM.
   Couvre `checkNumerique` (correction numérique : virgule, espaces de groupement,
   rejet du non-numérique) et `checkNumeriqueOuTexte` (numérique si la réponse est
   un entier, sinon texte normalisé délégué à `checkAnswer`).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { checkNumerique, checkNumeriqueOuTexte } from '../src/core/check-helpers';
import type { Exercise } from '../src/core/exercise';

// Petit constructeur d'exercice texte (le seul porteur de `answer` utile ici).
const txt = (answer: string): Exercise => ({ type: 'text', question: 'q @', answer });
const qcm = (answer: string, choices: string[]): Exercise => ({
	type: 'qcm',
	question: 'q @',
	answer,
	choices,
});

describe('checkNumerique', () => {
	it('accepte la valeur exacte', () => {
		expect(checkNumerique(txt('42'), '42')).toBe(true);
	});

	it('tolère les espaces autour et de groupement', () => {
		expect(checkNumerique(txt('1002'), ' 1 002 ')).toBe(true);
		// Espace fine insécable (U+202F) et insécable (U+00A0) du formatage français.
		expect(checkNumerique(txt('1000000'), '1 000 000')).toBe(true);
	});

	it('tolère la virgule décimale française', () => {
		expect(checkNumerique(txt('1.5'), '1,5')).toBe(true);
		expect(checkNumerique(txt('150'), '150,0')).toBe(true); // 150,0 == 150
	});

	it('normalise AUSSI la réponse stockée en virgule (#248, conversions décimales)', () => {
		// Réponse STOCKÉE en virgule française (« 4,56 ») : sans normalisation des deux
		// côtés, Number("4,56") = NaN → jamais validée. Elle doit se comparer correctement.
		expect(checkNumerique(txt('4,56'), '4,56')).toBe(true);
		expect(checkNumerique(txt('4,56'), '4.56')).toBe(true); // saisie au point tolérée
		expect(checkNumerique(txt('4,5'), '4,50')).toBe(true); // « 4,5 » == « 4,50 »
		expect(checkNumerique(txt('4,50'), '4,5')).toBe(true); // symétrique
		expect(checkNumerique(txt('4,56'), '4,57')).toBe(false); // mauvaise valeur
	});

	it('non-régression : entiers, espaces de groupement, point stocké inchangés', () => {
		expect(checkNumerique(txt('300'), '300')).toBe(true); // entier (conversions CE2)
		expect(checkNumerique(txt('1002050'), '1 002 050')).toBe(true); // groupement toléré
		expect(checkNumerique(txt('1.5'), '1.5')).toBe(true); // réponse stockée au point (legacy)
		expect(checkNumerique(txt('300'), '301')).toBe(false);
	});

	it('égalité numérique, pas textuelle (zéros, décimales équivalentes)', () => {
		expect(checkNumerique(txt('5'), '5,0')).toBe(true);
		expect(checkNumerique(txt('5'), '05')).toBe(true);
	});

	it('rejette une saisie non numérique', () => {
		expect(checkNumerique(txt('42'), 'quarante-deux')).toBe(false);
		expect(checkNumerique(txt('42'), '')).toBe(false);
		expect(checkNumerique(txt('42'), '4 2 abc')).toBe(false);
	});

	it('rejette une mauvaise valeur', () => {
		expect(checkNumerique(txt('42'), '43')).toBe(false);
	});

	it("est faux quand l'exercice n'a pas de réponse unique", () => {
		const posed: Exercise = { type: 'posed', op: '+', a: 12, b: 30 };
		expect(checkNumerique(posed, '42')).toBe(false);
	});

	it("sur un type non numérique (motCache), une réponse-mot n'est pas validée", () => {
		const ex: Exercise = { type: 'motCache', answer: 'chat' };
		expect(checkNumerique(ex, 'chat')).toBe(false); // 'chat' n'est pas un nombre → faux
	});
});

describe('checkNumeriqueOuTexte', () => {
	it('corrige numériquement quand la réponse est un entier', () => {
		expect(checkNumeriqueOuTexte(txt('4'), '4')).toBe(true);
		expect(checkNumeriqueOuTexte(txt('4'), '04')).toBe(true); // tolérance numérique
		expect(checkNumeriqueOuTexte(txt('4'), '5')).toBe(false);
	});

	it('corrige comme du texte normalisé quand la réponse est un mot', () => {
		expect(checkNumeriqueOuTexte(txt('carré'), 'carré')).toBe(true);
		expect(checkNumeriqueOuTexte(txt('carré'), '  carré ')).toBe(true); // espaces de bord ignorés
		expect(checkNumeriqueOuTexte(txt('carré'), 'carre')).toBe(false); // accent exigé
		expect(checkNumeriqueOuTexte(txt('carré'), 'Carré')).toBe(false); // casse exigée (normalizeText ne minuscule pas)
	});

	it('accepte les variantes `answers` pour un exercice texte', () => {
		const ex: Exercise = { type: 'text', question: 'q @', answer: 'cube', answers: ['un cube'] };
		expect(checkNumeriqueOuTexte(ex, 'un cube')).toBe(true);
	});

	it("n'accepte que la bonne réponse d'un QCM (pas les autres choix)", () => {
		expect(checkNumeriqueOuTexte(qcm('losange', ['losange', 'carré']), 'carré')).toBe(false);
		expect(checkNumeriqueOuTexte(qcm('losange', ['losange', 'carré']), 'losange')).toBe(true);
	});

	it("est faux quand l'exercice n'a pas de réponse unique", () => {
		const probleme: Exercise = {
			type: 'probleme',
			enonce: 'e',
			etapes: [{ question: 'q', answer: 3 }],
			parle: 'e',
		};
		expect(checkNumeriqueOuTexte(probleme, '3')).toBe(false);
	});
});
