/* ============================================================
   Accords CM1 — mots isolés (#243). Banque plus exigeante (terminaisons -er/-ère,
   -f/-ve, -et/-ète, -eur/-trice, -al/-aux + noms à pluriel -aux) sur le MÊME moteur
   de transformation saisie/QCM que le CE2. On vérifie :
   - les transformations produites par la banque CM1 (formes attendues) ;
   - en QCM, les distracteurs sont de VRAIES formes ≠ réponse ;
   - le CE2 reste INCHANGÉ (banques + comportement des 2 leçons CE2).
   Logique pure, pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	ACCORD_LESSONS,
	ACCORD_CM1_LESSONS,
	ACCORDS_REGULIERS,
	ACCORDS_IRREGULIERS,
	ACCORDS_CM1,
	transfosDisponibles,
} from '../src/data/francais/accords';
import { getLessonById, getLessonsByCategory } from '../src/core/catalog';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';

const LECON_CM1 = ACCORD_CM1_LESSONS[0];
const TIRAGES = 800;

/* Toutes les formes connues d'un mot de la banque (pour reconnaître une vraie forme). */
function toutesFormes(banque: typeof ACCORDS_CM1): Set<string> {
	const s = new Set<string>();
	for (const f of banque) {
		for (const v of [f.mascSing, f.femSing, f.mascPlur, f.femPlur])
			if (v) s.add(v.normalize('NFC'));
	}
	return s;
}

describe('banque CM1 — formes & transformations', () => {
	it('contient les terminaisons CM1 attendues (échantillon)', () => {
		const sings = ACCORDS_CM1.map((f) => f.mascSing);
		for (const mot of [
			'léger',
			'actif',
			'secret',
			'directeur',
			'national',
			'général',
			'festival',
		]) {
			expect(sings).toContain(mot);
		}
	});

	it('« festival » est le piège : pluriel régulier en -s (pas -aux)', () => {
		const festival = ACCORDS_CM1.find((f) => f.mascSing === 'festival')!;
		expect(festival.mascPlur).toBe('festivals');
		const general = ACCORDS_CM1.find((f) => f.mascSing === 'général')!;
		expect(general.mascPlur).toBe('généraux');
	});

	it('transformations attendues sur quelques mots (formes stockées, jamais déduites)', () => {
		const cas: Record<string, Record<string, string>> = {
			léger: { 'Mets au pluriel': 'légers', 'Mets au féminin': 'légère' },
			actif: { 'Mets au pluriel': 'actifs', 'Mets au féminin': 'active' },
			secret: { 'Mets au féminin': 'secrète' },
			directeur: { 'Mets au féminin': 'directrice' },
			national: { 'Mets au pluriel': 'nationaux', 'Mets au féminin': 'nationale' },
		};
		for (const [mot, attendus] of Object.entries(cas)) {
			const f = ACCORDS_CM1.find((x) => x.mascSing === mot)!;
			const transfos = transfosDisponibles(f);
			for (const [consigne, answer] of Object.entries(attendus)) {
				const t = transfos.find((x) => x.consigne === consigne && x.source === mot);
				expect(t, `${consigne} de ${mot}`).toBeDefined();
				expect(t!.answer).toBe(answer);
			}
		}
	});
});

describe('génération CM1 — QCM', () => {
	const formesCM1 = toutesFormes(ACCORDS_CM1);

	it('QCM : 4 choix distincts, la réponse incluse, distracteurs = vraies formes ≠ réponse', () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = LECON_CM1.exerciseType.generate({ mode: 'qcm' });
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4);
			expect(ex.choices).toContain(ex.answer);
			for (const c of ex.choices) {
				// Toute proposition affichée est une VRAIE forme de la banque CM1.
				expect(formesCM1.has(c.normalize('NFC'))).toBe(true);
			}
			const distracteurs = ex.choices.filter((c) => c !== ex.answer);
			expect(distracteurs).toHaveLength(3);
			for (const d of distracteurs) expect(d).not.toBe(ex.answer);
		}
	});

	it('check valide la réponse, refuse un distracteur', () => {
		for (let i = 0; i < 200; i++) {
			const ex = LECON_CM1.exerciseType.generate({ mode: 'qcm' });
			if (ex.type !== 'qcm') continue;
			expect(LECON_CM1.exerciseType.check(ex, ex.answer)).toBe(true);
			const autre = ex.choices.find((c) => c !== ex.answer)!;
			expect(LECON_CM1.exerciseType.check(ex, autre)).toBe(false);
		}
	});

	it('saisie : énoncé « consigne : source → @ », réponse = forme cible stockée', () => {
		for (let i = 0; i < 200; i++) {
			const ex = LECON_CM1.exerciseType.generate({ mode: 'saisie' });
			if (ex.type !== 'text') continue;
			expect(ex.question).toMatch(/(Mets au pluriel|Mets au féminin) : .+ → @/);
			expect(formesCM1.has(ex.answer.normalize('NFC'))).toBe(true);
		}
	});
});

describe('intégration catalogue — leçon CM1', () => {
	it('fr-accords-cm1 : Orthographe, rubrique « Les accords », niveau CM1', () => {
		const def = getLessonById('fr-accords-cm1');
		expect(def).toBeDefined();
		expect(def!.category).toBe('fr-orthographe');
		expect(def!.rubrique).toBe('Les accords');
		expect(def!.levels).toEqual(['cm1']);
		expect(def!.label).toBe('Pluriel et féminin — au CM1');
		expect(getLessonsByCategory('fr-orthographe').some((l) => l.id === def!.id)).toBe(true);
	});

	it('insérée dans l’ordre pédagogique français CM1', () => {
		expect(ORDRE_LECONS.francais.cm1).toContain('fr-accords-cm1');
	});
});

describe('CE2 inchangé (#243) — non-régression', () => {
	it('les banques CE2 gardent EXACTEMENT leur contenu d’origine', () => {
		// Réguliers : 14 adjectifs + 4 noms masc/fém + 3 noms pluriel-seul (#109 + #285) —
		// la banque ne doit pas avoir été modifiée par l'ajout CM1.
		expect(ACCORDS_REGULIERS).toHaveLength(21);
		expect(ACCORDS_REGULIERS[0]).toEqual({
			mascSing: 'grand',
			femSing: 'grande',
			mascPlur: 'grands',
			femPlur: 'grandes',
		});
		// Irréguliers : aucun mot CM1 (-er/-ve/-trice…) n'a fui dedans.
		const motsIrr = ACCORDS_IRREGULIERS.map((f) => f.mascSing);
		expect(motsIrr).toContain('cheval');
		expect(motsIrr).not.toContain('léger');
		expect(motsIrr).not.toContain('directeur');
	});

	it('les 2 leçons CE2 existent toujours, niveau CE2, et ne piochent pas la banque CM1', () => {
		const reg = ACCORD_LESSONS.find((l) => l.id === 'fr-accords-reguliers')!;
		const irr = ACCORD_LESSONS.find((l) => l.id === 'fr-accords-irreguliers')!;
		expect(getLessonById('fr-accords-reguliers')!.levels).toEqual(['ce2']);
		expect(getLessonById('fr-accords-irreguliers')!.levels).toEqual(['ce2']);
		// Aucune forme exclusive au CM1 n'apparaît dans les leçons CE2.
		const motsCM1 = new Set(ACCORDS_CM1.flatMap((f) => [f.mascSing, f.mascPlur]));
		for (const lecon of [reg, irr]) {
			for (let i = 0; i < 300; i++) {
				const ex = lecon.exerciseType.generate({ mode: 'qcm' });
				if (ex.type !== 'qcm') continue;
				for (const c of ex.choices) {
					// On tolère un chevauchement éventuel de forme (« principal » n'est PAS en CE2),
					// mais aucune des formes CM1 ne doit remonter via la leçon CE2.
					expect(motsCM1.has(c)).toBe(false);
				}
			}
		}
	});
});
