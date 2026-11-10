/* ============================================================
   #785 — Jours de travail de décembre : le décompte qui porte les trophées de Noël.

   Attendus dérivés des critères de l'issue, pas de l'implémentation :
   - critère 20 : un jour de travail = une journée (date LOCALE de l'appareil) avec au
     moins une partie ; plusieurs parties le même jour = un seul jour ;
   - critère 21 : seuls comptent les jours du 1er au 31 décembre ; une partie compte pour
     le jour où elle se TERMINE ; le compte repart de zéro chaque 1er décembre ;
   - critère 24 : chaque profil a son propre décompte ;
   - critère 33 : horloge figée dans tous les tests, dates construites en heure locale.

   Fuseaux : mêmes raisons que `decor-saison.test.ts` — les bords de journée et de mois
   sont rejoués sous Europe/Paris (UTC+1) et America/New_York (UTC-5), pour qu'un
   décompte calculé en UTC échoue quel que soit le fuseau de la machine qui lance les
   tests (la CI est en UTC, où l'erreur serait invisible).
   ============================================================ */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ajouterJourDecembre,
	compterJoursDecembre,
	JOURS_DECEMBRE_KEY,
	loadJoursDecembre,
	noterJourDecembre,
	type JoursDecembre,
} from '../src/core/jours-decembre';
import {
	activeProfile,
	addProfile,
	initProfiles,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { lsSet, setOnDataWrite } from '../src/core/storage';

const FUSEAU_ORIGINE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const FUSEAUX: readonly { tz: string; decalageDecembre: number }[] = [
	{ tz: 'Europe/Paris', decalageDecembre: -60 },
	{ tz: 'America/New_York', decalageDecembre: 300 },
];

/** Horodatage d'un instant en heure LOCALE (mois 1-12, plus lisible dans les cas). */
const t = (annee: number, mois: number, jour: number, h = 10, min = 0): number =>
	new Date(annee, mois - 1, jour, h, min).getTime();

/** Rejoue une suite de fins de partie à partir d'un état. */
const rejouer = (instants: number[], depart: JoursDecembre | null = null): JoursDecembre | null =>
	instants.reduce<JoursDecembre | null>((etat, now) => ajouterJourDecembre(etat, now), depart);

/** Gèle un état en profondeur : une fonction annoncée pure qui le muterait lève alors. */
const geler = (e: JoursDecembre): JoursDecembre => {
	const jours = [...e.jours];
	Object.freeze(jours);
	return Object.freeze({ annee: e.annee, jours });
};

/** Rejoue et exige un état (les cas qui en partent n'ont pas de sens sur `null`). */
const etatDe = (instants: number[]): JoursDecembre => {
	const e = rejouer(instants);
	if (!e)
		throw new Error(
			`aucun état produit par ${instants.map((x) => new Date(x).toString()).join(', ')}`,
		);
	return e;
};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 6, 14, 10, 0));
});
afterEach(() => {
	vi.useRealTimers();
});

describe('ajouterJourDecembre / compterJoursDecembre — logique pure', () => {
	it('aucun état : zéro jour', () => {
		expect(compterJoursDecembre(null)).toBe(0);
	});

	it('critère 20 : une partie le 15 décembre = un jour', () => {
		expect(compterJoursDecembre(rejouer([t(2026, 12, 15)]))).toBe(1);
	});

	it('critère 20 : deux parties le même jour = un seul jour (échec : deux leçons font avancer de deux)', () => {
		expect(compterJoursDecembre(rejouer([t(2026, 12, 15, 9), t(2026, 12, 15, 17)]))).toBe(1);
	});

	it('critère 20 : des parties trois jours distincts = trois jours, dans n’importe quel ordre', () => {
		const instants = [
			t(2026, 12, 3),
			t(2026, 12, 1),
			t(2026, 12, 3, 18),
			t(2026, 12, 20),
			t(2026, 12, 1, 8),
		];
		expect(compterJoursDecembre(rejouer(instants))).toBe(3);
	});

	it('critère 21 : une partie un autre mois ne compte pas (état rendu inchangé)', () => {
		expect(compterJoursDecembre(rejouer([t(2026, 7, 14), t(2026, 11, 15), t(2027, 1, 15)]))).toBe(
			0,
		);
		const avant = etatDe([t(2026, 12, 2), t(2026, 12, 3)]);
		expect(ajouterJourDecembre(avant, t(2027, 2, 10))).toEqual(avant);
	});

	it('critère 21 : sur une année entière jouée chaque jour, exactement 31 jours comptent', () => {
		const instants: number[] = [];
		for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1))
			instants.push(
				t(2026, d.getMonth() + 1, d.getDate(), 0, 0),
				t(2026, d.getMonth() + 1, d.getDate(), 23, 59),
			);
		expect(compterJoursDecembre(rejouer(instants))).toBe(31);
	});

	it('critère 21 : le compte repart de zéro le décembre suivant (échec : 3 jours en 2026 + 2 en 2027 = 5)', () => {
		const dec2026 = rejouer([t(2026, 12, 1), t(2026, 12, 2), t(2026, 12, 3)]);
		expect(compterJoursDecembre(dec2026)).toBe(3);
		const dec2027 = rejouer([t(2027, 12, 1), t(2027, 12, 2)], dec2026);
		expect(compterJoursDecembre(dec2027)).toBe(2);
	});

	it('critère 21 : la remise à zéro se fait même si décembre 2027 rejoue les mêmes dates qu’en 2026', () => {
		const dec2026 = rejouer([t(2026, 12, 1), t(2026, 12, 2), t(2026, 12, 3)]);
		// Mêmes jour et mois : un décompte qui ne regarderait que « 12-01 », « 12-02 »…
		// garderait 3 au lieu de repartir à 1.
		expect(compterJoursDecembre(rejouer([t(2027, 12, 2)], dec2026))).toBe(1);
	});

	/* Ce que vaut le décompte ENTRE deux décembres (l'ancien total ou zéro) n'est pas fixé
	   par l'issue : on n'assère que la remise à zéro au décembre suivant. */
	it('critère 21 : des parties toute l’année entre deux décembres n’empêchent pas la remise à zéro', () => {
		const dec2026 = rejouer([t(2026, 12, 1), t(2026, 12, 2), t(2026, 12, 3)]);
		const horsSaison = rejouer(
			[t(2027, 1, 1, 0, 5), t(2027, 7, 14), t(2027, 11, 30, 23, 59)],
			dec2026,
		);
		expect(compterJoursDecembre(rejouer([t(2027, 12, 31, 23, 59)], horsSaison))).toBe(1);
	});

	it('pur : ne modifie pas l’état reçu', () => {
		const gele = geler(etatDe([t(2026, 12, 1), t(2026, 12, 2)]));
		const apres = ajouterJourDecembre(gele, t(2026, 12, 3));
		expect(gele.jours).toHaveLength(2);
		expect(compterJoursDecembre(apres)).toBe(3);
		const autreAnnee = ajouterJourDecembre(gele, t(2027, 12, 3));
		expect(gele.jours).toHaveLength(2);
		expect(compterJoursDecembre(autreAnnee)).toBe(1);
	});
});

describe.each(FUSEAUX)(
	'jours de décembre — bords en heure locale, fuseau $tz',
	({ tz, decalageDecembre }) => {
		beforeAll(() => {
			process.env.TZ = tz;
			const obtenu = new Date(2026, 11, 1, 0, 0).getTimezoneOffset();
			if (obtenu !== decalageDecembre)
				throw new Error(
					`fuseau ${tz} non appliqué (décalage ${obtenu} au lieu de ${decalageDecembre}) : ` +
						'lancer Vitest avec le pool forks, sinon ces cas ne discriminent pas heure locale / UTC',
				);
		});
		afterAll(() => {
			process.env.TZ = FUSEAU_ORIGINE;
		});

		it('critère 21 : une partie terminée le 1er décembre à 0 h 00 compte', () => {
			expect(compterJoursDecembre(rejouer([t(2026, 12, 1, 0, 0)]))).toBe(1);
		});

		it('critère 21 : une partie terminée le 31 décembre à 23 h 59 compte', () => {
			expect(compterJoursDecembre(rejouer([t(2026, 12, 31, 23, 59)]))).toBe(1);
		});

		it('critère 21 : une partie terminée le 30 novembre à 23 h 59 ne compte pas', () => {
			expect(compterJoursDecembre(rejouer([t(2026, 11, 30, 23, 59)]))).toBe(0);
		});

		it('critère 21 : une partie terminée le 1er janvier à 0 h 05 ne compte pas pour décembre', () => {
			// Pas de partie le 31 : lu en UTC à Paris, 0 h 05 le 1er janvier tomberait le 31 et
			// ajouterait un jour — un 31 déjà compté masquerait l'erreur (mesuré par mutation).
			const dec = rejouer([t(2026, 12, 27), t(2026, 12, 28), t(2026, 12, 29)]);
			expect(compterJoursDecembre(rejouer([t(2027, 1, 1, 0, 5)], dec))).toBe(3);
		});

		it('critère 20 : 0 h 00 et 23 h 59 du même jour local = un seul jour', () => {
			expect(compterJoursDecembre(rejouer([t(2026, 12, 15, 0, 0), t(2026, 12, 15, 23, 59)]))).toBe(
				1,
			);
		});

		it('critère 20 : 23 h 59 puis 0 h 00 le lendemain = deux jours', () => {
			expect(compterJoursDecembre(rejouer([t(2026, 12, 15, 23, 59), t(2026, 12, 16, 0, 0)]))).toBe(
				2,
			);
		});

		it('critère 21 : le 31 décembre à 23 h 59 reste dans le décembre de son année', () => {
			const dec2026 = rejouer([t(2026, 12, 1), t(2026, 12, 2)]);
			// Lu en UTC à New York, cet instant tombe en 2027 : il ferait repartir le compte à 1.
			expect(compterJoursDecembre(rejouer([t(2026, 12, 31, 23, 59)], dec2026))).toBe(3);
		});
	},
);

describe('noterJourDecembre / loadJoursDecembre — mémoire du profil actif', () => {
	beforeEach(() => {
		localStorage.clear();
		setOnDataWrite(touchActiveProfile);
		initProfiles();
	});

	it('jamais écrit : aucun état, zéro jour', () => {
		expect(loadJoursDecembre()).toBeNull();
	});

	it('critère 20 : deux parties le même jour puis une le lendemain = deux jours mémorisés', () => {
		noterJourDecembre(t(2026, 12, 4, 9));
		noterJourDecembre(t(2026, 12, 4, 16));
		noterJourDecembre(t(2026, 12, 5, 9));
		expect(compterJoursDecembre(loadJoursDecembre())).toBe(2);
	});

	it('critère 21 : une partie hors décembre ne crée aucun jour', () => {
		noterJourDecembre(t(2026, 11, 30, 23, 59));
		noterJourDecembre(t(2027, 1, 1, 0, 5));
		expect(compterJoursDecembre(loadJoursDecembre())).toBe(0);
	});

	it.each([
		['une chaîne', 'n’importe quoi'],
		['un nombre', 42],
		['des jours qui ne sont pas une liste', { annee: 2026, jours: '2026-12-01' }],
		['une année illisible', { annee: 'deux mille', jours: [] }],
	])('état illisible (%s) : lu comme absent, et le décompte repart proprement', (_quoi, brut) => {
		lsSet(JOURS_DECEMBRE_KEY, brut);
		expect(loadJoursDecembre()).toBeNull();
		noterJourDecembre(t(2026, 12, 2));
		expect(compterJoursDecembre(loadJoursDecembre())).toBe(1);
	});

	it('critère 24 : chaque profil a son propre décompte', () => {
		const a = activeProfile().uuid;
		noterJourDecembre(t(2026, 12, 1));
		noterJourDecembre(t(2026, 12, 2));

		const b = addProfile('B').uuid; // devient actif
		expect(compterJoursDecembre(loadJoursDecembre())).toBe(0);
		noterJourDecembre(t(2026, 12, 3));
		expect(compterJoursDecembre(loadJoursDecembre())).toBe(1);

		setActiveProfile(a);
		expect(compterJoursDecembre(loadJoursDecembre())).toBe(2);
		noterJourDecembre(t(2026, 12, 4));
		expect(compterJoursDecembre(loadJoursDecembre())).toBe(3);

		setActiveProfile(b);
		expect(compterJoursDecembre(loadJoursDecembre())).toBe(1);
	});
});
