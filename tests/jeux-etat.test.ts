/* ============================================================
   Étagère de jeux (#661) — l'état stocké : jeux possédés, paliers en attente,
   meilleurs scores.
   Couvre les critères 20 (toute clé commence par `ludaskia_`, et passe par
   lsGet/lsSet — donc suit le profil actif et entre dans la sauvegarde), 7 (les
   paliers franchis s'empilent et se consomment UN PAR UN, aucun perdu),
   17 (meilleur score local) et 23 (jouer n'alimente aucun compteur de
   l'économie).

   Le préfixe est déjà tenu statiquement par `cles-stockage-gate.test.ts` ; ce
   qu'on éprouve ICI, c'est la conséquence OBSERVABLE : la donnée est bien rangée
   sous le profil actif, elle apparaît dans `appKeys()` (donc dans l'export du
   parent et dans la suppression d'un profil), et elle ne fuit pas d'un enfant à
   l'autre.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	CLE_POSSEDES,
	CLE_PALIERS_ATTENTE,
	CLE_PLAFOND,
	CLE_SCORES,
	jeuxPossedes,
	ajouterJeu,
	paliersEnAttente,
	empilerPaliers,
	consommerPalier,
	meilleurScore,
	enregistrerScore,
} from '../src/core/jeux/etat';
import {
	initProfiles,
	addProfile,
	setActiveProfile,
	activeProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, appKeys } from '../src/core/storage';
import { getXP, addXP } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('clés de stockage (critère 20)', () => {
	it('commencent toutes par `ludaskia_`', () => {
		for (const cle of [CLE_POSSEDES, CLE_PALIERS_ATTENTE, CLE_PLAFOND, CLE_SCORES]) {
			expect(cle.startsWith('ludaskia_')).toBe(true);
		}
	});

	it('sont distinctes les unes des autres', () => {
		const cles = [CLE_POSSEDES, CLE_PALIERS_ATTENTE, CLE_PLAFOND, CLE_SCORES];
		expect(new Set(cles).size).toBe(cles.length);
	});

	it('entrent dans le périmètre de l’export et de la suppression de profil', () => {
		// `appKeys()` filtre sur `ludaskia_` : une clé hors convention resterait après la
		// suppression du profil et manquerait à la sauvegarde du parent.
		ajouterJeu('motus');
		enregistrerScore('2048', 120);
		empilerPaliers([1]);
		const cles = appKeys();
		for (const cle of [CLE_POSSEDES, CLE_SCORES, CLE_PALIERS_ATTENTE]) {
			expect(cles.some((k) => k.includes(cle))).toBe(true);
		}
	});
});

describe('jeux possédés', () => {
	it('part de rien sur un profil neuf (critère 27)', () => {
		expect(jeuxPossedes()).toEqual([]);
	});

	it('retient le jeu choisi', () => {
		ajouterJeu('motus');
		expect(jeuxPossedes()).toContain('motus');
	});

	it('ne compte jamais deux fois le même jeu', () => {
		// L'étagère est UNE liste (critère 3) : un doublon s'y verrait.
		ajouterJeu('motus');
		ajouterJeu('motus');
		expect(jeuxPossedes().filter((id) => id === 'motus').length).toBe(1);
	});

	it('reste propre au profil actif', () => {
		ajouterJeu('motus');
		const premier = activeProfile()?.uuid ?? '';
		addProfile('Cadette');
		expect(jeuxPossedes()).toEqual([]); // le petit frère n'hérite de rien
		ajouterJeu('2048');
		expect(jeuxPossedes()).toEqual(['2048']);
		setActiveProfile(premier);
		expect(jeuxPossedes()).toEqual(['motus']);
	});
});

describe('paliers en attente — un par un, aucun perdu (critère 7)', () => {
	it('n’a rien en attente au départ', () => {
		expect(paliersEnAttente()).toEqual([]);
		expect(consommerPalier()).toBeUndefined();
	});

	it('empile plusieurs paliers franchis hors de l’app', () => {
		empilerPaliers([1, 2, 3]);
		expect(paliersEnAttente()).toEqual([1, 2, 3]);
	});

	it('les rend UN PAR UN, dans l’ordre de franchissement', () => {
		// Deux écrans de choix simultanés = le cas d'échec du critère 7.
		empilerPaliers([1, 2, 3]);
		expect(consommerPalier()).toBe(1);
		expect(paliersEnAttente()).toEqual([2, 3]);
		expect(consommerPalier()).toBe(2);
		expect(consommerPalier()).toBe(3);
		expect(paliersEnAttente()).toEqual([]);
		expect(consommerPalier()).toBeUndefined();
	});

	it('n’écrase pas ce qui attendait déjà', () => {
		// Un palier franchi ne doit jamais être perdu, même si un autre survient avant
		// que l'enfant n'ait fait son choix.
		empilerPaliers([1]);
		empilerPaliers([2, 3]);
		expect(paliersEnAttente()).toEqual([1, 2, 3]);
	});

	it('reste stable si on empile une liste vide', () => {
		empilerPaliers([1]);
		empilerPaliers([]);
		expect(paliersEnAttente()).toEqual([1]);
	});

	it('n’empile pas deux fois le même palier', () => {
		// Un rang déjà en attente ne doit pas ouvrir deux écrans de choix.
		empilerPaliers([1, 2]);
		empilerPaliers([2]);
		expect(paliersEnAttente()).toEqual([1, 2]);
	});

	it('reste propre au profil actif', () => {
		empilerPaliers([1, 2]);
		addProfile('Cadette');
		expect(paliersEnAttente()).toEqual([]);
	});
});

describe('meilleur score local (critère 17)', () => {
	it('vaut 0 avant la première partie', () => {
		expect(meilleurScore('2048')).toBe(0);
	});

	it('retient le meilleur, jamais le dernier', () => {
		enregistrerScore('2048', 120);
		expect(meilleurScore('2048')).toBe(120);
		enregistrerScore('2048', 40); // partie ratée : le record tient
		expect(meilleurScore('2048')).toBe(120);
		enregistrerScore('2048', 300);
		expect(meilleurScore('2048')).toBe(300);
	});

	it('garde un score par jeu', () => {
		enregistrerScore('2048', 120);
		expect(meilleurScore('motus')).toBe(0);
	});

	it('reste propre au profil actif', () => {
		enregistrerScore('2048', 120);
		addProfile('Cadette');
		expect(meilleurScore('2048')).toBe(0);
	});
});

describe('les jeux n’alimentent pas l’économie (critère 23)', () => {
	it('ne touche ni l’XP ni le niveau', () => {
		addXP(50);
		const avant = getXP();
		ajouterJeu('2048');
		enregistrerScore('2048', 999);
		empilerPaliers([1]);
		consommerPalier();
		expect(getXP()).toBe(avant);
	});
});
