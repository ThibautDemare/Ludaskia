/* ============================================================
   Niveau scolaire — Lot 1 (#225) : helpers de catalogue par niveau,
   persistance de `niveauReference` (méta de profil) et résolution du
   niveau actif. Profil/localStorage reconstruits avant chaque test.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { availableLevels, lessonsForLevel } from '../src/core/levels';
import { niveauActif, besoinChoixNiveau } from '../src/core/niveau-actif';
import { getAllLessons, getLessonById, genLessonItem } from '../src/core/catalog';
import type { SchoolLevel } from '../src/core/catalog';
import {
	initProfiles,
	activeProfile,
	listProfiles,
	resetProfile,
	exportProfiles,
	importProfiles,
	getNiveauReference,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSet } from '../src/core/storage';
import {
	recordLessonResult,
	recordLessonStats,
	starsEarned,
	loadLessonStats,
	loadLessonStatsAll,
	loadLessonRevisions,
	avancerLessonRevision,
	migrateNiveauNamespacing,
	STARS_KEY,
} from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('availableLevels / lessonsForLevel', () => {
	it('rend les niveaux présents, dédupliqués et triés par ordre scolaire', () => {
		const lessons: { levels: SchoolLevel[] }[] = [
			{ levels: ['cm1'] },
			{ levels: ['ce2', 'cm1'] },
			{ levels: ['ce2'] },
		];
		expect(availableLevels(lessons)).toEqual(['ce2', 'cm1']);
	});

	it('filtre les leçons par appartenance stricte au niveau', () => {
		const lessons: { id: string; levels: SchoolLevel[] }[] = [
			{ id: 'a', levels: ['ce2'] },
			{ id: 'b', levels: ['ce2', 'cm1'] },
			{ id: 'c', levels: ['cm1'] },
		];
		expect(lessonsForLevel(lessons, 'ce2').map((l) => l.id)).toEqual(['a', 'b']);
		expect(lessonsForLevel(lessons, 'cm1').map((l) => l.id)).toEqual(['b', 'c']);
	});

	it('le catalogue réel expose au moins le niveau CE2', () => {
		expect(availableLevels(getAllLessons())).toContain('ce2');
	});
});

describe('niveauReference (méta de profil)', () => {
	it('se lit après écriture', () => {
		expect(getNiveauReference()).toBeUndefined();
		setNiveauReference('ce2');
		expect(getNiveauReference()).toBe('ce2');
	});

	it('survit à « Réinitialiser » (vit dans la méta, pas dans les données)', () => {
		setNiveauReference('cm1');
		resetProfile(activeProfile().uuid);
		expect(getNiveauReference()).toBe('cm1');
	});

	it('est emporté par un export puis réimport (round-trip)', () => {
		const uuid = activeProfile().uuid;
		setNiveauReference('cm1');
		const payload = exportProfiles([uuid]);
		localStorage.clear();
		initProfiles(); // nouveau profil par défaut, uuid différent
		importProfiles(payload); // l'ancien profil revient comme inconnu
		const restored = listProfiles().find((p) => p.uuid === uuid);
		expect(restored?.niveauReference).toBe('cm1');
	});
});

describe('niveauActif / besoinChoixNiveau', () => {
	it('sans classe choisie, le niveau actif est un niveau disponible au catalogue', () => {
		expect(getNiveauReference()).toBeUndefined();
		expect(availableLevels(getAllLessons())).toContain(niveauActif());
	});

	it('retourne la classe choisie une fois fixée', () => {
		setNiveauReference('cm1');
		expect(niveauActif()).toBe('cm1');
	});

	it('ne redemande plus la classe une fois choisie', () => {
		setNiveauReference('ce2');
		expect(besoinChoixNiveau()).toBe(false);
	});
});

describe('namespacing de la progression par niveau (Lot 2)', () => {
	it('étoiles scopées au niveau actif, acquis CE2 conservé au passage en CM1', () => {
		setNiveauReference('ce2');
		recordLessonResult('math-doubles', true);
		expect(starsEarned()).toBe(1);
		// Passage au CM1 : l'étoile CE2 n'est pas comptée (scope CM1) mais reste stockée.
		setNiveauReference('cm1');
		expect(starsEarned()).toBe(0);
		// Retour au CE2 : l'acquis est conservé (pas de reset).
		setNiveauReference('ce2');
		expect(starsEarned()).toBe(1);
	});

	it('stats : effort GLOBAL (tous niveaux), complétude SCOPÉE au niveau actif', () => {
		setNiveauReference('ce2');
		recordLessonStats({ 'math-doubles': { ok: 5, total: 5 } });
		setNiveauReference('cm1');
		recordLessonStats({ 'math-doubles': { ok: 3, total: 4 } });
		// Agrégat global = somme des deux niveaux.
		expect(loadLessonStatsAll()['math-doubles'].questions).toBe(9);
		// Vue scopée = niveau actif seulement.
		expect(loadLessonStats()['math-doubles'].questions).toBe(4);
		setNiveauReference('ce2');
		expect(loadLessonStats()['math-doubles'].questions).toBe(5);
	});

	it('état de révision SR scopé au niveau actif', () => {
		const now = 1_000_000;
		setNiveauReference('ce2');
		avancerLessonRevision('math-doubles', true, now);
		expect(loadLessonRevisions()['math-doubles']).toBeDefined();
		setNiveauReference('cm1');
		expect(loadLessonRevisions()['math-doubles']).toBeUndefined();
	});

	it('migration : renomme les clés legacy (sans @) en @ce2, idempotente', () => {
		// Mélange d'une clé legacy (pleine) et d'une clé déjà namespacée.
		lsSet(STARS_KEY, { 'math-doubles': 2, 'math-complements@ce2': 1 });
		migrateNiveauNamespacing();
		expect(lsGet(STARS_KEY, {})).toEqual({ 'math-doubles@ce2': 2, 'math-complements@ce2': 1 });
		// Idempotent : un second passage ne change rien.
		migrateNiveauNamespacing();
		expect(lsGet(STARS_KEY, {})).toEqual({ 'math-doubles@ce2': 2, 'math-complements@ce2': 1 });
	});
});

describe('contenu multi-niveau (Lot 3)', () => {
	it('le catalogue expose désormais CE2 et CM1', () => {
		expect(availableLevels(getAllLessons())).toContain('ce2');
		expect(availableLevels(getAllLessons())).toContain('cm1');
	});

	it('« Je compare les nombres » est calibrée CE2+CM1', () => {
		expect(getLessonById('num-comparer')?.levels).toEqual(['ce2', 'cm1']);
	});

	it('numération calibrée : nombres plus grands en CM1 qu’en CE2', () => {
		const lesson = getLessonById('num-comparer')!;
		const maxValeur = (niveau: SchoolLevel) => {
			let max = 0;
			for (let i = 0; i < 300; i++) {
				const it = genLessonItem(lesson, niveau);
				for (const n of it.text.match(/\d+/g) ?? []) max = Math.max(max, Number(n));
			}
			return max;
		};
		// CE2 : plage ≤ 999 (le cas charnière 999/1000 atteint au plus 1001) ;
		// CM1 : plage jusqu'à 9999 → dépasse nettement le CE2.
		expect(maxValeur('ce2')).toBeLessThanOrEqual(1001);
		expect(maxValeur('cm1')).toBeGreaterThan(1500);
	});

	it('le passé composé est ouvert au CM1 (multi-niveau « identique »)', () => {
		expect(getLessonById('fr-conj-etre-passe_compose')?.levels).toEqual(['ce2', 'cm1']);
		expect(getLessonById('fr-conj-etre-present')?.levels).toEqual(['ce2']);
	});
});
