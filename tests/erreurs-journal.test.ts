/* ============================================================
   Journal des erreurs par profil (#391) — logique de journalisation.
   Couvre : ajout (plus récent d'abord, sans mutation), purge par rétention,
   écriture sur le profil actif + lecture par UUID, isolation entre profils,
   tolérance à un stockage corrompu.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	ajouterErreur,
	journaliserErreur,
	chargerErreursFor,
	grouperErreursParLecon,
	ERREURS_KEY,
	MAX_ERREURS,
	type ErreurEntry,
} from '../src/core/erreurs-journal';
import { initProfiles, activeProfile, addProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Petite fabrique d'entrée (ts explicite → tests déterministes). */
function err(over: Partial<ErreurEntry> = {}): Omit<ErreurEntry, 'ts'> & { ts: number } {
	return {
		ts: 1000,
		lessonId: 'math-complements',
		mode: 'lecon',
		question: '45 + 12 = …',
		donnee: '56',
		attendue: '57',
		...over,
	};
}

describe('ajouterErreur (pur : ordre + rétention)', () => {
	it('ajoute la nouvelle entrée EN TÊTE (plus récent d’abord)', () => {
		const a = err({ ts: 1 });
		const b = err({ ts: 2, donnee: 'x' });
		const liste = ajouterErreur(ajouterErreur([], a), b);
		expect(liste.map((e) => e.ts)).toEqual([2, 1]);
	});

	it('ne mute pas la liste d’origine', () => {
		const base: ErreurEntry[] = [err({ ts: 1 })];
		const copie = [...base];
		ajouterErreur(base, err({ ts: 2 }));
		expect(base).toEqual(copie);
	});

	it('purge au-delà de la rétention en gardant les plus récentes', () => {
		let liste: ErreurEntry[] = [];
		for (let i = 1; i <= 5; i++) liste = ajouterErreur(liste, err({ ts: i }), 3);
		expect(liste.map((e) => e.ts)).toEqual([5, 4, 3]); // 1 et 2 purgées
	});

	it('max = 0 → liste vide', () => {
		expect(ajouterErreur([], err(), 0)).toEqual([]);
	});
});

describe('journaliserErreur + chargerErreursFor (profil actif ↔ lecture par UUID)', () => {
	it('journalise sur le profil actif et se relit par son UUID', () => {
		const uuid = activeProfile().uuid;
		journaliserErreur(err({ question: 'Q1' }));
		journaliserErreur(err({ question: 'Q2' }));
		const journal = chargerErreursFor(uuid);
		expect(journal).toHaveLength(2);
		// Plus récent d’abord.
		expect(journal.map((e) => e.question)).toEqual(['Q2', 'Q1']);
		expect(journal[0]).toMatchObject({
			lessonId: 'math-complements',
			mode: 'lecon',
			attendue: '57',
		});
		expect(typeof journal[0].ts).toBe('number');
	});

	it('ignore une entrée sans leçon identifiée (rien à regrouper)', () => {
		const uuid = activeProfile().uuid;
		journaliserErreur(err({ lessonId: '' }));
		expect(chargerErreursFor(uuid)).toEqual([]);
	});

	it('applique la rétention MAX_ERREURS', () => {
		const uuid = activeProfile().uuid;
		for (let i = 0; i < MAX_ERREURS + 5; i++) journaliserErreur(err({ question: 'Q' + i }));
		const journal = chargerErreursFor(uuid);
		expect(journal).toHaveLength(MAX_ERREURS);
		// La toute dernière journalisée est en tête ; les 5 premières ont été purgées.
		expect(journal[0].question).toBe('Q' + (MAX_ERREURS + 4));
		expect(journal.some((e) => e.question === 'Q0')).toBe(false);
	});

	it('isole les journaux entre profils', () => {
		const p1 = activeProfile().uuid;
		journaliserErreur(err({ question: 'chez-p1' }));
		const p2 = addProfile('Deux'); // addProfile bascule le profil actif sur p2
		journaliserErreur(err({ question: 'chez-p2' }));

		expect(chargerErreursFor(p1).map((e) => e.question)).toEqual(['chez-p1']);
		expect(chargerErreursFor(p2.uuid).map((e) => e.question)).toEqual(['chez-p2']);

		// Consulter un profil ne bascule pas l’actif (invariant encadrant).
		expect(activeProfile().uuid).toBe(p2.uuid);
		chargerErreursFor(p1);
		expect(activeProfile().uuid).toBe(p2.uuid);
	});
});

describe('chargerErreursFor (robustesse)', () => {
	it('profil inconnu → []', () => {
		expect(chargerErreursFor('inconnu')).toEqual([]);
	});

	it('tolère un stockage corrompu (non-tableau, entrées invalides)', () => {
		const uuid = activeProfile().uuid;
		localStorage.setItem(uuid + '/' + ERREURS_KEY, '"pas un tableau"');
		expect(chargerErreursFor(uuid)).toEqual([]);

		// Mélange d’entrées valides et invalides : ne garde que les valides.
		const valide = err({ ts: 9 });
		localStorage.setItem(
			uuid + '/' + ERREURS_KEY,
			JSON.stringify([valide, { ts: 'x' }, null, { lessonId: 'y' }]),
		);
		expect(chargerErreursFor(uuid)).toEqual([valide]);
	});
});

describe('grouperErreursParLecon (regroupement + dédoublonnage)', () => {
	it('groupe par leçon, la plus récemment ratée en tête', () => {
		const liste: ErreurEntry[] = [
			err({ ts: 10, lessonId: 'a', question: 'Qa' }),
			err({ ts: 30, lessonId: 'b', question: 'Qb' }),
			err({ ts: 20, lessonId: 'a', question: 'Qa2' }),
		];
		const g = grouperErreursParLecon(liste);
		expect(g.map((x) => x.lessonId)).toEqual(['b', 'a']); // b (ts 30) devant a (ts max 20)
		expect(g[1].total).toBe(2);
		expect(g[1].derniereFois).toBe(20);
		// À l’intérieur d’une leçon, plus récent d’abord.
		expect(g[1].erreurs.map((e) => e.question)).toEqual(['Qa2', 'Qa']);
	});

	it('dédoublonne la même erreur (question + réponse donnée) en « vu N fois »', () => {
		const liste: ErreurEntry[] = [
			err({ ts: 1, lessonId: 'a', question: 'Q', donnee: '56' }),
			err({ ts: 5, lessonId: 'a', question: 'Q', donnee: '56' }),
			err({ ts: 3, lessonId: 'a', question: 'Q', donnee: '58' }), // réponse différente → ligne distincte
		];
		const g = grouperErreursParLecon(liste);
		expect(g).toHaveLength(1);
		expect(g[0].total).toBe(3); // total = nombre d’erreurs brutes
		expect(g[0].erreurs).toHaveLength(2); // 2 lignes distinctes après dédoublonnage
		const parDonnee = Object.fromEntries(g[0].erreurs.map((e) => [e.donnee, e]));
		expect(parDonnee['56'].occurrences).toBe(2);
		expect(parDonnee['56'].ts).toBe(5); // garde l’horodatage le plus récent
		expect(parDonnee['58'].occurrences).toBe(1);
	});

	it('liste vide → []', () => {
		expect(grouperErreursParLecon([])).toEqual([]);
	});
});
