/* ============================================================
   Vocabulaire CM1 (#244) — 4 leçons additives, CE2 GELÉ.
   Couvre : câblage catalogue (levels cm1, rubrique/exclusion des leçons « sens »),
   génération QCM 3 options valides pour chaque pool CM1 (sens proche / contraires
   via sensType ; familles / affixes via famillesType), invariants des banques
   (réponse incluse, options distinctes, distracteurs ≠ réponse), NON-régression
   CE2 (banques et pool ITEMS_FAMILLES inchangés) et DÉDUP CE2↔CM1 du même type.
   Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	CONTRAIRES,
	SENS_PROCHE,
	CONTRAIRES_CM1,
	SENS_PROCHE_CM1,
	ITEMS_CONTRAIRES_CM1,
	ITEMS_SENS_PROCHE_CM1,
	SENS_LESSONS,
	type ItemSens,
} from '../src/data/francais/synonymes-contraires';
import {
	FAMILLES,
	PREFIXES,
	SUFFIXES,
	FAMILLES_CM1,
	PREFIXES_CM1,
	SUFFIXES_CM1,
	ITEMS_FAMILLES,
	ITEMS_FAMILLES_SEULES,
	ITEMS_AFFIXES,
	ITEMS_FAMILLES_CM1,
	ITEMS_AFFIXES_CM1,
	FAMILLES_LESSONS,
	type ItemVocabQcm,
} from '../src/data/francais/familles';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';
import { getLessonById, getLessonsByCategory } from '../src/core/catalog';
import type { ExerciseType } from '../src/core/exercise';

const RE_GRAS_G = /\*\*(.+?)\*\*/g;
const cibleDe = (phrase: string) => phrase.match(/\*\*(.+?)\*\*/)?.[1] ?? '';
const aPlat = (phrase: string) => phrase.replace(/\*\*(.+?)\*\*/g, '$1');
// Mots de la phrase (minuscule, ponctuation de bord retirée) : sert à vérifier
// qu'aucune option ne figure déjà dans la phrase (pas d'amorce / d'indice).
const motsDe = (phrase: string): Set<string> =>
	new Set(
		aPlat(phrase)
			.toLowerCase()
			.split(/\s+/)
			.map((m) => m.replace(/^[«».,;:!?"'']+|[«».,;:!?"'']+$/g, '')),
	);

/* Invariants d'une banque « sens » CM1 (mot-cible en contexte, 3 options francs). */
function verifieBanqueSens(banque: ItemSens[], taille: number) {
	expect(banque.length).toBe(taille);
	const cibleVersReponses = new Map<string, Set<string>>();
	for (const it of banque) {
		// Exactement UN mot-cible en gras (jamais isolé, toujours en contexte).
		expect((it.phrase.match(RE_GRAS_G) ?? []).length, it.phrase).toBe(1);
		const cible = cibleDe(it.phrase);
		expect(cible.length, it.phrase).toBeGreaterThan(0);
		const opts = [it.reponse, ...it.distracteurs];
		expect(opts.length).toBe(3);
		expect(new Set(opts).size, it.phrase).toBe(3); // 3 options distinctes
		expect(opts, it.phrase).not.toContain(cible); // jamais le mot-cible
		for (const o of opts) expect(o.trim().length, it.phrase).toBeGreaterThan(0);
		// Aucune option ne figure déjà dans la phrase (sinon amorce / indice involontaire).
		const mots = motsDe(it.phrase);
		for (const o of opts) expect(mots.has(o.toLowerCase()), `${it.phrase} :: « ${o} »`).toBe(false);
		// Phrase courte (~8 mots ; borne large pour rester robuste).
		expect(it.phrase.split(/\s+/).length, it.phrase).toBeLessThanOrEqual(12);
		const k = cible.toLowerCase();
		if (!cibleVersReponses.has(k)) cibleVersReponses.set(k, new Set());
		cibleVersReponses.get(k)!.add(it.reponse);
	}
	// Un même mot-cible appelle toujours la MÊME réponse (anti-nœud lexical).
	for (const [cible, reps] of cibleVersReponses) {
		expect(reps.size, `mot-cible « ${cible} » → { ${[...reps].join(', ')} }`).toBe(1);
	}
}

/* Génère N exercices d'un ExerciseType QCM et vérifie l'invariant 3-options. */
function verifieGenerationQcm(type: ExerciseType, reponsesAttendues: Set<string>) {
	for (let n = 0; n < 200; n++) {
		const ex = type.generate({ mode: 'qcm' });
		expect(ex.type).toBe('qcm');
		if (ex.type !== 'qcm') continue;
		expect(ex.choices.length).toBe(3);
		expect(new Set(ex.choices).size).toBe(3); // distinctes
		expect(ex.choices).toContain(ex.answer); // réponse présente
		expect(reponsesAttendues.has(ex.answer)).toBe(true); // jamais un distracteur en réponse
	}
}

describe('Vocabulaire CM1 — banques « sens » (#244)', () => {
	it('contraires CM1 : 18 items, mot-cible en contexte, 3 options francs distinctes', () => {
		verifieBanqueSens(CONTRAIRES_CM1, 18);
	});
	it('sens proche CM1 : 18 items, mot-cible en contexte, 3 options francs distinctes', () => {
		verifieBanqueSens(SENS_PROCHE_CM1, 18);
	});

	it('génération QCM 3 options valides (contraires CM1)', () => {
		const type = SENS_LESSONS.find((l) => l.id === 'fr-vocab-contraires-cm1')!.exerciseType;
		verifieGenerationQcm(type, new Set(ITEMS_CONTRAIRES_CM1.map((i) => i.reponse)));
	});
	it('génération QCM 3 options valides (sens proche CM1)', () => {
		const type = SENS_LESSONS.find((l) => l.id === 'fr-vocab-sens-proche-cm1')!.exerciseType;
		verifieGenerationQcm(type, new Set(ITEMS_SENS_PROCHE_CM1.map((i) => i.reponse)));
	});

	// Les leçons « sens » CM1 doivent réutiliser sensType (picto + TTS qui nomme la
	// cible), pas une copie simplifiée : on vérifie picto/ttsItems/parle au générateur.
	it('les leçons « sens » CM1 portent picto, ttsItems et parlé', () => {
		const cas = [
			{ id: 'fr-vocab-contraires-cm1', picto: '↔' },
			{ id: 'fr-vocab-sens-proche-cm1', picto: '=' },
		];
		for (const { id, picto } of cas) {
			const ex = SENS_LESSONS.find((l) => l.id === id)!.exerciseType.generate({ mode: 'qcm' });
			expect(ex.type, id).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.picto, id).toBe(picto);
			expect(ex.ttsItems, id).toBe(true);
			expect((ex.parle ?? '').length, id).toBeGreaterThan(0);
		}
	});
});

describe('Vocabulaire CM1 — banques « familles / affixes » (#244)', () => {
	it('familles CM1 : 12 items ; préfixes CM1 : 13 ; suffixes CM1 : 12', () => {
		expect(FAMILLES_CM1.length).toBe(12);
		expect(PREFIXES_CM1.length).toBe(13);
		expect(SUFFIXES_CM1.length).toBe(12);
	});

	it('pools CM1 : familles seules + affixes (préfixes + suffixes)', () => {
		expect(ITEMS_FAMILLES_CM1.length).toBe(12);
		expect(ITEMS_FAMILLES_CM1.every((i) => i.type === 'famille')).toBe(true);
		expect(ITEMS_AFFIXES_CM1.length).toBe(13 + 12);
		expect(ITEMS_AFFIXES_CM1.some((i) => i.type === 'prefixe')).toBe(true);
		expect(ITEMS_AFFIXES_CM1.some((i) => i.type === 'suffixe')).toBe(true);
	});

	it('invariants des pools CM1 : 1 bonne réponse + 2 distracteurs distincts, réponse ≠ distracteur', () => {
		for (const it of [...ITEMS_FAMILLES_CM1, ...ITEMS_AFFIXES_CM1] as ItemVocabQcm[]) {
			const opts = [it.reponse, ...it.distracteurs];
			expect(opts.length, it.question).toBe(3);
			expect(new Set(opts).size, it.question).toBe(3);
			expect(it.distracteurs, it.question).not.toContain(it.reponse);
		}
	});

	it('génération QCM 3 options valides (familles CM1)', () => {
		const type = FAMILLES_LESSONS.find((l) => l.id === 'fr-vocab-familles-cm1')!.exerciseType;
		verifieGenerationQcm(type, new Set(ITEMS_FAMILLES_CM1.map((i) => i.reponse)));
	});
	it('génération QCM 3 options valides (préfixes et suffixes CM1)', () => {
		const type = FAMILLES_LESSONS.find((l) => l.id === 'fr-vocab-affixes-cm1')!.exerciseType;
		verifieGenerationQcm(type, new Set(ITEMS_AFFIXES_CM1.map((i) => i.reponse)));
	});
});

describe('Vocabulaire CM1 — NON-régression CE2 (#244)', () => {
	it('la leçon fr-vocab-familles garde le pool combiné familles + préfixes + suffixes', () => {
		// Découplage : le pool QCM combiné est bâti sur les 30 familles d'ORIGINE (pas les 54
		// de FAMILLES, dont 24 sont réservées à la leçon à relier) → équilibre ~⅓ préservé.
		const NB_FAMILLES_QCM = 30;
		expect(ITEMS_FAMILLES_SEULES.length).toBe(NB_FAMILLES_QCM);
		expect(FAMILLES.length).toBe(54); // banque complète (relier) = 30 d'origine + 24 extra
		expect(ITEMS_AFFIXES.length).toBe(PREFIXES.length + SUFFIXES.length);
		expect(ITEMS_FAMILLES.length).toBe(NB_FAMILLES_QCM + PREFIXES.length + SUFFIXES.length);
		// La leçon CE2 utilise bien le pool combiné (et reste taguée CE2).
		const ce2 = getLessonById('fr-vocab-familles')!;
		expect(ce2.levels).toEqual(['ce2']);
		expect(ce2.label).toBe('Familles, préfixes et suffixes');
	});

	it('les banques « sens » CE2 sont inchangées (taille connue ≥ 50)', () => {
		expect(CONTRAIRES.length).toBeGreaterThanOrEqual(50);
		expect(SENS_PROCHE.length).toBeGreaterThanOrEqual(50);
		for (const id of ['fr-vocab-contraires', 'fr-vocab-sens-proche']) {
			expect(getLessonById(id)!.levels).toEqual(['ce2']);
		}
	});
});

describe('Vocabulaire CM1 — déduplication CE2 ↔ CM1 du même type (#244)', () => {
	it('aucune réponse CM1 ne duplique une réponse CE2 (contraires ; sens proche)', () => {
		const repCe2Contr = new Set(CONTRAIRES.map((i) => i.reponse));
		for (const it of CONTRAIRES_CM1) {
			expect(repCe2Contr.has(it.reponse), `contraire CM1 « ${it.reponse} »`).toBe(false);
		}
		const repCe2Sens = new Set(SENS_PROCHE.map((i) => i.reponse));
		for (const it of SENS_PROCHE_CM1) {
			expect(repCe2Sens.has(it.reponse), `sens proche CM1 « ${it.reponse} »`).toBe(false);
		}
	});

	it('aucune réponse (famille) CM1 ne duplique une famille CE2 ; idem sens d’affixe', () => {
		const famCe2 = new Set(FAMILLES.map((f) => f.famille));
		for (const f of FAMILLES_CM1) {
			expect(famCe2.has(f.famille), `famille CM1 « ${f.famille} »`).toBe(false);
		}
		const sensPrefCe2 = new Set(PREFIXES.map((a) => a.sens));
		for (const a of PREFIXES_CM1) {
			expect(sensPrefCe2.has(a.sens), `préfixe CM1 « ${a.mot} »`).toBe(false);
		}
		const sensSuffCe2 = new Set(SUFFIXES.map((a) => a.sens));
		for (const a of SUFFIXES_CM1) {
			expect(sensSuffCe2.has(a.sens), `suffixe CM1 « ${a.mot} »`).toBe(false);
		}
	});

	it('les mots affixés CM1 ne dupliquent pas les mots affixés CE2', () => {
		const motsCe2 = new Set([...PREFIXES, ...SUFFIXES].map((a) => a.mot));
		for (const a of [...PREFIXES_CM1, ...SUFFIXES_CM1]) {
			expect(motsCe2.has(a.mot), `mot affixé CM1 « ${a.mot} »`).toBe(false);
		}
	});
});

describe('Vocabulaire CM1 — catalogue & ordre (#244)', () => {
	it('4 leçons CM1 au catalogue, en Vocabulaire, taguées cm1', () => {
		const ids = [
			'fr-vocab-contraires-cm1',
			'fr-vocab-sens-proche-cm1',
			'fr-vocab-familles-cm1',
			'fr-vocab-affixes-cm1',
		];
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			expect(lesson, id).toBeDefined();
			expect(lesson.category).toBe('fr-vocabulaire');
			expect(lesson.levels).toEqual(['cm1']);
		}
	});

	it('les leçons « sens » CM1 héritent de la rubrique et de l’exclusion du sprint', () => {
		for (const id of ['fr-vocab-contraires-cm1', 'fr-vocab-sens-proche-cm1']) {
			const lesson = getLessonById(id)!;
			expect(lesson.rubrique).toBe('Synonymes et contraires');
			expect(lesson.excludeFromSprint).toBe(true);
		}
	});

	it('ordre francais.cm1 contient les 4 leçons, contraires AVANT sens proche, familles AVANT affixes', () => {
		const ordre = ORDRE_LECONS.francais.cm1!;
		// +1 : « Clique sur le verbe » (#259, partagée CE2/CM1) ; +5 : natures « clique sur
		// le mot » CM1 (#437 : déterminant, conjonction, pronom, nom noyau, sujet).
		expect(ordre).toHaveLength(71);
		const i = (id: string) => ordre.indexOf(id);
		for (const id of [
			'fr-vocab-contraires-cm1',
			'fr-vocab-sens-proche-cm1',
			'fr-vocab-familles-cm1',
			'fr-vocab-affixes-cm1',
		]) {
			expect(i(id), id).toBeGreaterThanOrEqual(0);
		}
		expect(i('fr-vocab-contraires-cm1')).toBeLessThan(i('fr-vocab-sens-proche-cm1'));
		expect(i('fr-vocab-familles-cm1')).toBeLessThan(i('fr-vocab-affixes-cm1'));
	});

	it('en Vocabulaire CM1, l’affichage trié respecte l’ordre pédagogique', () => {
		const voc = getLessonsByCategory('fr-vocabulaire', 'cm1').map((l) => l.id);
		const cm1 = voc.filter((id) => id.endsWith('-cm1'));
		expect(cm1).toEqual([
			'fr-vocab-contraires-cm1',
			'fr-vocab-sens-proche-cm1',
			'fr-vocab-familles-cm1',
			'fr-vocab-affixes-cm1',
			// Homonymes (#254) : clôt le fil vocabulaire CM1, juste après les affixes.
			'fr-vocab-homonymes-cm1',
		]);
	});
});
