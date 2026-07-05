/* ============================================================
   Préférences d'accessibilité du profil (#42). setPref (profil actif) délègue
   désormais à setPrefFor (par UUID) — #374 : on vérifie ici l'équivalence
   comportementale (écriture sur l'actif, bump d'updatedAt) et l'isolation de
   setPrefFor (cible un profil consulté sans toucher l'actif). Profil/localStorage
   reconstruits avant chaque test.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	initProfiles,
	activeProfile,
	listProfiles,
	addProfile,
	setActiveProfile,
	getPrefs,
	setPref,
	setPrefFor,
	confortLecture,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('setPref (profil actif) — délègue à setPrefFor (#374)', () => {
	it('écrit la préférence sur le profil actif et se relit', () => {
		expect(getPrefs().confortLecture).toBeUndefined();
		setPref('confortLecture', true);
		expect(getPrefs().confortLecture).toBe(true);
		expect(confortLecture()).toBe(true);
	});

	it("bumpe updatedAt du profil actif (fusion par récence de l'export)", () => {
		const before = activeProfile().updatedAt;
		setPref('lectureConsigneAuto', true);
		expect(activeProfile().updatedAt).toBeGreaterThanOrEqual(before);
		expect(getPrefs().lectureConsigneAuto).toBe(true);
	});

	it("setPrefFor cible un profil NON actif sans changer l'actif ni ses prefs", () => {
		const actif = activeProfile().uuid;
		const autre = addProfile('Autre'); // addProfile bascule l'actif sur le nouveau…
		setActiveProfile(actif); // …on rétablit l'actif d'origine
		expect(activeProfile().uuid).toBe(actif);
		setPrefFor(autre.uuid, 'confortLecture', true);
		expect(activeProfile().uuid).toBe(actif); // l'actif n'a pas bougé
		expect(getPrefs().confortLecture).toBeUndefined(); // le profil actif n'est pas touché
		const cible = listProfiles().find((p) => p.uuid === autre.uuid);
		expect(cible?.prefs?.confortLecture).toBe(true); // la pref a bien atterri sur la cible
	});
});
