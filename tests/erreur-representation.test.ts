/* ============================================================
   Représentations composites du journal d'erreurs (#391) — logique pure :
   opération posée (agrégation des cellules), rangement, tri par thème, et
   résolution du libellé d'une liste d'orthographe.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	analyserResultatPosee,
	ordreErreur,
	motsMalClasses,
	type CellulePosee,
} from '../src/core/erreur-representation';
import { labelLeconOrtho } from '../src/core/orthographe/lessons';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';

const cell = (pos: number, saisie: string, correct: boolean): CellulePosee => ({
	pos,
	saisie,
	correct,
});

describe('analyserResultatPosee (opération posée → une entrée)', () => {
	it('résultat entièrement juste → non journalisé', () => {
		const r = analyserResultatPosee([cell(0, '4', true), cell(1, '2', true), cell(2, '3', true)]);
		expect(r.journaliser).toBe(false);
	});

	it('grille vierge (aucun chiffre saisi) → non journalisé', () => {
		const r = analyserResultatPosee([cell(0, '', false), cell(1, '', false)]);
		expect(r.journaliser).toBe(false);
	});

	it('résultat faux et complet → journalisé, chiffres assemblés dans l’ordre des positions', () => {
		// positions données en désordre : la reconstruction doit trier par `pos`.
		const r = analyserResultatPosee([cell(2, '3', false), cell(0, '4', true), cell(1, '1', false)]);
		expect(r.journaliser).toBe(true);
		expect(r.donnee).toBe('413');
	});

	it('résultat partiellement saisi (des cellules vides) → « (incomplet) »', () => {
		const r = analyserResultatPosee([cell(0, '4', true), cell(1, '', false), cell(2, '3', false)]);
		expect(r.journaliser).toBe(true);
		expect(r.donnee).toBe('(incomplet)');
	});
});

describe('ordreErreur (rangement d’une suite)', () => {
	it('joint la suite proposée et la suite attendue par « , »', () => {
		expect(ordreErreur(['banane', 'abricot', 'cerise'], ['abricot', 'banane', 'cerise'])).toEqual({
			donnee: 'banane, abricot, cerise',
			attendue: 'abricot, banane, cerise',
		});
	});
});

describe('motsMalClasses (tri par thème)', () => {
	const mots = [
		{ mot: 'chat', cat: 0 as const },
		{ mot: 'rose', cat: 1 as const },
		{ mot: 'chien', cat: 0 as const },
	];
	const categories = ['Animaux', 'Fleurs'] as const;

	it('ne renvoie que les mots MAL classés (colonne choisie ≠ bonne colonne)', () => {
		// chat mal classé (mis en Fleurs), rose bien classée, chien non classé.
		const res = motsMalClasses(mots, categories, { chat: 1, rose: 1 });
		expect(res).toEqual([{ mot: 'chat', donnee: 'Fleurs', attendue: 'Animaux' }]);
	});

	it('tri parfait → aucune entrée', () => {
		expect(motsMalClasses(mots, categories, { chat: 0, rose: 1, chien: 0 })).toEqual([]);
	});
});

describe('labelLeconOrtho (libellé d’une liste d’orthographe)', () => {
	it('liste du profil (custom) : renvoie son label', () => {
		expect(labelLeconOrtho('liste-42', [{ id: 'liste-42', label: 'Mots de la semaine' }])).toBe(
			'Mots de la semaine',
		);
	});

	it('leçon prédéfinie : renvoie son label sans état de profil', () => {
		const predef = ORTHO_PREDEF[0];
		expect(labelLeconOrtho(predef.id)).toBe(predef.label);
	});

	it('id inconnu → null (repli sur l’id brut côté UI)', () => {
		expect(labelLeconOrtho('inexistant')).toBeNull();
	});
});
