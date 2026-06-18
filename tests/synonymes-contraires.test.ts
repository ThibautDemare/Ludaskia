/* ============================================================
   Vocabulaire — Les contraires & Les mots de sens proche (#203).
   Invariants des banques (mot-cible en contexte, 3 options distinctes, une seule
   réponse, distracteurs ≠ réponse ni mot-cible), de la génération QCM (consigne,
   picto, ttsItems, explication, lecture vocale) et du câblage catalogue (ordre,
   catégorie, rubrique, exclusion du sprint). Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	CONTRAIRES,
	SENS_PROCHE,
	ITEMS_CONTRAIRES,
	ITEMS_SENS_PROCHE,
	SENS_LESSONS,
	type ItemSens,
} from '../src/data/francais/synonymes-contraires';
import { getLessonById, getLessonsByCategory } from '../src/core/catalog';

const RE_GRAS_G = /\*\*(.+?)\*\*/g;
const cibleDe = (phrase: string) => phrase.match(/\*\*(.+?)\*\*/)?.[1] ?? '';

/* Invariants communs à une banque (contraires ou sens proche). */
function verifieBanque(banque: ItemSens[], min: number) {
	expect(banque.length).toBeGreaterThanOrEqual(min);
	for (const it of banque) {
		// Exactement UN mot-cible en gras dans la phrase (jamais isolé, toujours en contexte).
		const gras = it.phrase.match(RE_GRAS_G) ?? [];
		expect(gras.length, it.phrase).toBe(1);
		const cible = cibleDe(it.phrase);
		expect(cible.length, it.phrase).toBeGreaterThan(0);
		// 3 options : la réponse + 2 distracteurs, toutes distinctes et non vides.
		const opts = [it.reponse, ...it.distracteurs];
		expect(opts.length).toBe(3);
		for (const o of opts) expect(o.trim().length, it.phrase).toBeGreaterThan(0);
		expect(new Set(opts).size, it.phrase).toBe(3);
		// Le mot-cible n'est jamais une option (ni réponse, ni distracteur).
		expect(opts, it.phrase).not.toContain(cible);
		// Phrase courte (consigne #203 : ~8 mots) — borne large pour rester robuste.
		expect(it.phrase.split(/\s+/).length, it.phrase).toBeLessThanOrEqual(12);
	}
}

describe('Vocabulaire — contraires (#203)', () => {
	it('banque ≥ 50 items, mot-cible en contexte, 3 options francs distinctes', () => {
		verifieBanque(CONTRAIRES, 50);
	});

	it('génération : QCM 3 options dont la bonne réponse, consigne « contraire » + picto ↔', () => {
		const type = SENS_LESSONS.find((l) => l.id === 'fr-vocab-contraires')!.exerciseType;
		const reponses = new Set(ITEMS_CONTRAIRES.map((i) => i.reponse));
		for (let n = 0; n < 200; n++) {
			const ex = type.generate('qcm');
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices.length).toBe(3);
			expect(new Set(ex.choices).size).toBe(3); // pas de doublon
			expect(ex.choices).toContain(ex.answer);
			expect(reponses.has(ex.answer)).toBe(true); // jamais un distracteur en réponse
			// Mot-cible en GRAS dans l'énoncé (rendu par enonceTexte).
			expect(ex.question).toMatch(/\*\*(.+?)\*\*/);
			expect(ex.consigne).toBe('Quel mot veut dire le contraire ?');
			expect(ex.picto).toBe('↔');
			expect(ex.ttsItems).toBe(true);
			expect(ex.explication ?? '').toContain('le contraire de');
			// Lecture vocale = consigne + phrase « à plat » (sans marqueurs de gras).
			expect(ex.parle ?? '').toContain('Quel mot veut dire le contraire ?');
			expect(ex.parle ?? '').not.toContain('**');
		}
	});
});

describe('Vocabulaire — mots de sens proche (#203)', () => {
	it('banque ≥ 50 items, mot-cible en contexte, 3 options francs distinctes', () => {
		verifieBanque(SENS_PROCHE, 50);
	});

	it('génération : QCM 3 options dont la bonne réponse, consigne « pareil » + picto =', () => {
		const type = SENS_LESSONS.find((l) => l.id === 'fr-vocab-sens-proche')!.exerciseType;
		const reponses = new Set(ITEMS_SENS_PROCHE.map((i) => i.reponse));
		for (let n = 0; n < 200; n++) {
			const ex = type.generate('qcm');
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices.length).toBe(3);
			expect(new Set(ex.choices).size).toBe(3);
			expect(ex.choices).toContain(ex.answer);
			expect(reponses.has(ex.answer)).toBe(true);
			expect(ex.question).toMatch(/\*\*(.+?)\*\*/);
			expect(ex.consigne).toBe('Quel mot veut dire pareil ?');
			expect(ex.picto).toBe('=');
			expect(ex.ttsItems).toBe(true);
			expect(ex.explication ?? '').toContain('la même chose');
			expect(ex.parle ?? '').toContain('Quel mot veut dire pareil ?');
			expect(ex.parle ?? '').not.toContain('**');
		}
	});
});

describe('Vocabulaire — catalogue contraires / sens proche (#203)', () => {
	it('deux leçons en Vocabulaire, rubrique « Synonymes et contraires », exclues du sprint', () => {
		for (const id of ['fr-vocab-contraires', 'fr-vocab-sens-proche']) {
			const lesson = getLessonById(id)!;
			expect(lesson, id).toBeDefined();
			expect(lesson.category).toBe('fr-vocabulaire');
			expect(lesson.rubrique).toBe('Synonymes et contraires');
			expect(lesson.excludeFromSprint).toBe(true);
			expect(lesson.level).toBe('ce2');
		}
	});

	it('ordre pédagogique : les contraires AVANT les mots de sens proche', () => {
		const voc = getLessonsByCategory('fr-vocabulaire').map((l) => l.id);
		const iContraires = voc.indexOf('fr-vocab-contraires');
		const iSensProche = voc.indexOf('fr-vocab-sens-proche');
		expect(iContraires).toBeGreaterThanOrEqual(0);
		expect(iSensProche).toBeGreaterThan(iContraires);
	});
});
