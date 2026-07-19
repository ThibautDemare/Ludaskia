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
	getRevisionPlafond,
	importProfiles,
	EXPORT_APP,
	touchActiveProfile,
} from '../src/core/profiles';
import {
	REVISION_PLAFOND,
	REVISION_PLAFOND_MIN,
	REVISION_PLAFOND_MAX,
	REVISION_PLAFOND_CHOIX,
} from '../src/core/revision';
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

/* Plafond d'éléments par session de Révision, réglable par profil (#439). Attendus
   DÉRIVÉS de la spec (pas de l'implémentation) : défaut historique 12 pour un profil
   sans réglage ; sinon arrondi à l'entier le plus proche PUIS bornage dans [6, 24] ;
   valeur non numérique / non finie → 12. Le fallback + le bornage se font à la LECTURE
   (robustesse aux imports) → toute la logique se vérifie via getRevisionPlafond. */
describe('getRevisionPlafond — plafond de session réglable par profil (#439)', () => {
	it('profil sans réglage explicite : plafond par défaut historique (12)', () => {
		// Critère clé de l'issue : aucun profil existant ne doit changer de comportement.
		expect(getPrefs().revisionPlafond).toBeUndefined();
		expect(getRevisionPlafond()).toBe(REVISION_PLAFOND);
		expect(getRevisionPlafond()).toBe(12);
	});

	it('chaque palier du menu fait un aller-retour fidèle (écrit → relu → identique)', () => {
		for (const palier of REVISION_PLAFOND_CHOIX) {
			setPref('revisionPlafond', palier);
			expect(getRevisionPlafond()).toBe(palier);
		}
	});

	it('borne basse : toute valeur sous le minimum remonte à 6', () => {
		expect(REVISION_PLAFOND_MIN).toBe(6);
		for (const v of [5, 3, 1, 0, -5, -100]) {
			setPref('revisionPlafond', v);
			expect(getRevisionPlafond()).toBe(REVISION_PLAFOND_MIN);
		}
	});

	it('borne haute : toute valeur au-dessus du maximum redescend à 24', () => {
		expect(REVISION_PLAFOND_MAX).toBe(24);
		for (const v of [25, 30, 100, 1000]) {
			setPref('revisionPlafond', v);
			expect(getRevisionPlafond()).toBe(REVISION_PLAFOND_MAX);
		}
	});

	it("valeur décimale importée : arrondie à l'entier le plus proche", () => {
		const cas: [number, number][] = [
			[12.4, 12],
			[12.5, 13], // demi arrondi vers le haut
			[12.7, 13],
			[9.49, 9],
			[9.5, 10],
		];
		for (const [entree, attendu] of cas) {
			setPref('revisionPlafond', entree);
			expect(getRevisionPlafond()).toBe(attendu);
		}
	});

	it("arrondi PUIS bornage : l'arrondi peut franchir une borne, le bornage rattrape", () => {
		setPref('revisionPlafond', 24.6); // arrondi 25 → borné 24
		expect(getRevisionPlafond()).toBe(24);
		setPref('revisionPlafond', 5.4); // arrondi 5 → borné 6
		expect(getRevisionPlafond()).toBe(6);
		setPref('revisionPlafond', 5.6); // arrondi 6 → déjà dans la plage
		expect(getRevisionPlafond()).toBe(6);
		setPref('revisionPlafond', -5.6); // arrondi -6 → borné 6
		expect(getRevisionPlafond()).toBe(6);
	});

	it('valeur numérique non finie → plafond par défaut', () => {
		for (const v of [NaN, Infinity, -Infinity]) {
			setPref('revisionPlafond', v);
			expect(getRevisionPlafond()).toBe(REVISION_PLAFOND);
		}
	});

	it('donnée importée non numérique (chaîne) → plafond par défaut', () => {
		// Robustesse aux imports : le fallback se fait à la lecture, jamais à l'écriture.
		// On simule un profil importé dont la pref est corrompue (chaîne au lieu d'un nombre) ;
		// impossible via setPref (typé), on passe donc par importProfiles (payload `unknown`).
		const importe = {
			app: EXPORT_APP,
			version: 2,
			profiles: [
				{
					uuid: 'profil-importe-439',
					name: 'Importé',
					emoji: '🦊',
					updatedAt: Date.now(),
					prefs: { revisionPlafond: '10' },
					data: {},
				},
			],
		};
		expect(importProfiles(importe)).not.toBeNull();
		setActiveProfile('profil-importe-439');
		expect(typeof getPrefs().revisionPlafond).toBe('string'); // la donnée corrompue est bien là…
		expect(getRevisionPlafond()).toBe(REVISION_PLAFOND); // …mais la lecture la neutralise
	});

	it("réglé par UUID sur un profil non actif : n'affecte pas le plafond de l'actif", () => {
		const actif = activeProfile().uuid;
		const autre = addProfile('Autre'); // addProfile bascule l'actif…
		setActiveProfile(actif); // …on rétablit l'actif d'origine
		setPrefFor(autre.uuid, 'revisionPlafond', 8);
		expect(getRevisionPlafond()).toBe(REVISION_PLAFOND); // l'actif reste au défaut
		const cible = listProfiles().find((p) => p.uuid === autre.uuid);
		expect(cible?.prefs?.revisionPlafond).toBe(8); // la valeur a bien atterri sur la cible
		setActiveProfile(autre.uuid); // en basculant sur l'autre profil…
		expect(getRevisionPlafond()).toBe(8); // …c'est son plafond qui est lu
	});

	it('cohérence du menu : défaut dans les choix, choix croissants, distincts et dans [MIN, MAX]', () => {
		expect(REVISION_PLAFOND_CHOIX).toContain(REVISION_PLAFOND);
		const trie = [...REVISION_PLAFOND_CHOIX].sort((a, b) => a - b);
		expect([...REVISION_PLAFOND_CHOIX]).toEqual(trie); // déjà croissant
		expect(new Set(REVISION_PLAFOND_CHOIX).size).toBe(REVISION_PLAFOND_CHOIX.length); // distincts
		expect(Math.min(...REVISION_PLAFOND_CHOIX)).toBe(REVISION_PLAFOND_MIN);
		expect(Math.max(...REVISION_PLAFOND_CHOIX)).toBe(REVISION_PLAFOND_MAX);
		for (const p of REVISION_PLAFOND_CHOIX) expect(Number.isInteger(p)).toBe(true);
	});
});
