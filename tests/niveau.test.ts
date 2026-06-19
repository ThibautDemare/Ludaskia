/* ============================================================
   Niveau scolaire — Lot 1 (#225) : helpers de catalogue par niveau,
   persistance de `niveauReference` (méta de profil) et résolution du
   niveau actif. Profil/localStorage reconstruits avant chaque test.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { availableLevels, lessonsForLevel } from '../src/core/levels';
import { niveauActif, besoinChoixNiveau } from '../src/core/niveau-actif';
import { getAllLessons } from '../src/core/catalog';
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
import { setOnDataWrite } from '../src/core/storage';

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
