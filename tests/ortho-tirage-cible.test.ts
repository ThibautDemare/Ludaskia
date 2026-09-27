/* ============================================================
   Tirage d'une séance d'orthographe CIBLÉE (Tuiles / Mot caché / Dictée).

   Bug : en séance ciblée, le runner UI (`ui/ortho-runner.ts`, `prochainNonMaitrise`)
   tournait sur TOUS les mots dans l'ordre de la liste à partir de l'indice 0, sans
   regarder si le mode était déjà validé. La séance s'arrêtant à 8 activités, une liste
   de plus de 8 mots resservait à chaque séance les 8 mêmes premiers mots, déjà validés,
   et les suivants n'étaient jamais atteints.

   Correctif attendu : `indiceProchainMotCible(mots, mode, dicteeDispo, depuis)`, logique
   pure de `core/orthographe/runner.ts`. Elle parcourt la liste cycliquement à partir de
   `depuis` (inclus) et renvoie l'indice du premier mot que `mode` peut encore faire
   monter (`activiteProgressive`). Si le mode est terminé pour toute la liste, elle rend
   `depuis % n` (la séance continue en entretien) ; sur une liste vide, `-1`.

   Critères :
   1. ordre cyclique à partir de `depuis` (milieu de liste, rebouclage en fin de liste) ;
   2. un mot déjà validé pour le mode est sauté tant qu'il reste un mot progressif ;
   3. mode validé par tous les mots → `depuis % n` (entretien) ;
   4. liste vide → -1 ;
   5. cumul (#641) : un mode fait monter un mot tant qu'UNE marche jusqu'à lui manque,
      escalier troué hérité compris ;
   6. `dicteeDispo` est transmis tel quel ;
   7. scénario de séance : 10 mots, deux séances de 8 activités (le bug d'origine) ;
   8. pureté et déterminisme.

   Écrits AVANT l'implémentation. Les indices attendus sont calculés à la main à partir
   de la règle de l'escalier (tuiles → mot caché → dictée ; la dictée n'est une marche
   que si la voix est disponible), jamais relus dans le code. Le symbole est atteint par
   l'espace de noms du module : tant qu'il manque, chaque test échoue en le nommant au
   lieu de faire tomber tout le fichier à l'import.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import * as runner from '../src/core/orthographe/runner';
import {
	activiteProgressive,
	marquerAtelierFait,
	validerMode,
} from '../src/core/orthographe/runner';
import { emptyOrthoState, addOrGetMot } from '../src/core/orthographe/store';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import type { MotOrtho, ModeOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const T0 = new Date(2026, 5, 1, 9, 0).getTime(); // lundi 1er juin 2026, 9 h

/** Taille d'une séance (`SEANCE_MAX` côté UI), posée en dur : le scénario du critère 7
    décrit le bug tel qu'il se manifeste avec cette taille. */
const SEANCE = 8;

const MODES: readonly ModeOrtho[] = ['tuiles', 'motCache', 'dictee'];

type Escalier = Partial<Record<ModeOrtho, boolean>>;
const TUILES: Escalier = { tuiles: true };
const JUSQU_AU_MOT_CACHE: Escalier = { tuiles: true, motCache: true };
const COMPLET: Escalier = { tuiles: true, motCache: true, dictee: true };

let compteur = 0;
/** Mot découvert (atelier fait) portant exactement l'escalier donné (marche absente = non
    validée). `validation` est écrit à la main pour pouvoir poser un escalier TROUÉ hérité,
    qu'aucun chemin de jeu ne produit plus depuis #641. */
function mot(escalier: Escalier = {}): MotOrtho {
	const m = addOrGetMot(emptyOrthoState(), { mot: `mot${++compteur}` });
	marquerAtelierFait(m, T0);
	m.validation = { tuiles: false, motCache: false, dictee: false, ...escalier };
	return m;
}
const neufs = (n: number): MotOrtho[] => Array.from({ length: n }, () => mot());

const tirer = (
	mots: readonly MotOrtho[],
	mode: ModeOrtho,
	dicteeDispo: boolean,
	depuis: number,
): number => runner.indiceProchainMotCible(mots, mode, dicteeDispo, depuis);

/* ============================================================
   Critère 1 — parcours cyclique à partir de `depuis`
   ============================================================ */
describe('critère 1 : les mots à faire sont servis dans l’ordre cyclique à partir de `depuis`', () => {
	it('depuis le milieu de la liste, un mot à faire placé AVANT `depuis` n’est pas servi', () => {
		// indices : 0 et 1 à faire, 2 et 3 validés, 4 et 5 à faire.
		const mots = [mot(), mot(), mot(TUILES), mot(TUILES), mot(), mot()];
		expect(tirer(mots, 'tuiles', true, 2)).toBe(4);
		expect(tirer(mots, 'tuiles', true, 4)).toBe(4); // `depuis` est inclus
		expect(tirer(mots, 'tuiles', true, 5)).toBe(5);
		expect(tirer(mots, 'tuiles', true, 1)).toBe(1);
	});

	it('en fin de liste, la recherche reboucle au début et y saute aussi les mots validés', () => {
		// 0 validé, 1 et 2 à faire, 3 et 4 validés : depuis 3, on passe 3, 4, puis 0.
		const mots = [mot(TUILES), mot(), mot(), mot(TUILES), mot(TUILES)];
		expect(tirer(mots, 'tuiles', true, 3)).toBe(1);
		expect(tirer(mots, 'tuiles', true, 4)).toBe(1);
	});
});

/* ============================================================
   Critère 2 — un mot validé pour le mode est sauté
   ============================================================ */
describe('critère 2 : un mot déjà validé pour le mode est sauté tant qu’il en reste un à faire', () => {
	it('un seul mot reste à faire sur 8 : il est servi quel que soit le point de départ', () => {
		const mots = Array.from({ length: 8 }, (_, i) => mot(i === 6 ? {} : TUILES));
		for (let depuis = 0; depuis < mots.length; depuis++) {
			expect(tirer(mots, 'tuiles', true, depuis), `depuis ${depuis}`).toBe(6);
		}
	});
});

/* ============================================================
   Critère 3 — mode terminé pour toute la liste : entretien
   ============================================================ */
describe('critère 3 : quand tous les mots ont validé le mode, la séance continue en entretien', () => {
	it('on reste sur `depuis` : ni retour au début, ni -1', () => {
		const mots = [mot(TUILES), mot(COMPLET), mot(JUSQU_AU_MOT_CACHE), mot(TUILES)];
		for (let depuis = 0; depuis < mots.length; depuis++) {
			expect(tirer(mots, 'tuiles', true, depuis), `depuis ${depuis}`).toBe(depuis);
		}
	});

	it('une marche AU-DESSUS du mode laissée vide ne relance pas le mode (mot caché, dictée non faite)', () => {
		const mots = [mot(JUSQU_AU_MOT_CACHE), mot(JUSQU_AU_MOT_CACHE), mot(JUSQU_AU_MOT_CACHE)];
		expect(tirer(mots, 'motCache', true, 2)).toBe(2);
		expect(tirer(mots, 'tuiles', true, 1)).toBe(1);
	});

	it('liste d’un seul mot : indice 0, qu’il soit à faire ou déjà validé', () => {
		expect(tirer([mot()], 'tuiles', true, 0)).toBe(0);
		expect(tirer([mot(TUILES)], 'tuiles', true, 0)).toBe(0);
	});
});

/* ============================================================
   Critère 4 — liste vide
   ============================================================ */
describe('critère 4 : liste vide', () => {
	it('renvoie -1 pour chaque mode, avec ou sans voix', () => {
		for (const mode of MODES) {
			for (const dicteeDispo of [true, false]) {
				expect(tirer([], mode, dicteeDispo, 0), `${mode}, voix ${dicteeDispo}`).toBe(-1);
			}
		}
	});
});

/* ============================================================
   Critère 5 — cumul (#641)
   ============================================================ */
describe('critère 5 : un mode fait monter un mot tant qu’une marche jusqu’à lui manque (#641)', () => {
	it('escalier troué hérité { tuiles: non, motCache: oui } : servi en séance de mot caché', () => {
		// Le mot caché y est coché mais pas les tuiles, que le mot caché cumule : ce mode peut
		// encore faire monter le mot. Regarder la seule marche du mode le ferait sauter (→ 2).
		const mots = [mot(JUSQU_AU_MOT_CACHE), mot({ motCache: true }), mot()];
		expect(tirer(mots, 'motCache', true, 0)).toBe(1);
		expect(tirer(mots, 'motCache', false, 0)).toBe(1);
	});

	it('{ tuiles: oui, motCache: non } : servi en séance de mot caché, sauté en séance de tuiles', () => {
		const mots = [mot(JUSQU_AU_MOT_CACHE), mot(TUILES), mot()];
		expect(tirer(mots, 'motCache', true, 0)).toBe(1);
		expect(tirer(mots, 'tuiles', true, 0)).toBe(2);
	});

	it('un mot réussi en dictée ciblée est sauté par les séances de tuiles et de mot caché', () => {
		// Chemin réel : `validerMode('dictee')` valide aussi les marches du dessous.
		const mots = neufs(3);
		validerMode(mots[0], 'dictee', T0);
		validerMode(mots[1], 'dictee', T0);
		expect(tirer(mots, 'tuiles', true, 0)).toBe(2);
		expect(tirer(mots, 'motCache', true, 0)).toBe(2);
		expect(tirer(mots, 'dictee', true, 0)).toBe(2);
	});
});

/* ============================================================
   Critère 6 — `dicteeDispo` transmis tel quel
   ============================================================ */
describe('critère 6 : la disponibilité de la voix est prise en compte', () => {
	// indice 0 : validé jusqu'au mot caché, dictée non faite ; indice 1 : neuf.
	// Seul le mode dictée change de réponse selon la voix : les marches jusqu'au mot caché
	// ne contiennent jamais la dictée. C'est donc la paire « dictée avec / sans voix » qui
	// prouve que le drapeau est transmis ; le cas « mot caché » garde l'autre moitié du critère.
	const liste = (): MotOrtho[] => [mot(JUSQU_AU_MOT_CACHE), mot()];

	it('mot caché : { tuiles, motCache } validés suffisent, avec ou sans voix → sauté', () => {
		expect(tirer(liste(), 'motCache', false, 0)).toBe(1);
		expect(tirer(liste(), 'motCache', true, 0)).toBe(1);
	});

	it('dictée avec la voix : la marche manquante est la dictée → servi', () => {
		expect(tirer(liste(), 'dictee', true, 0)).toBe(0);
	});

	it('dictée sans la voix : la dictée n’est pas une marche requise, rien ne manque jusqu’à elle → sauté', () => {
		expect(tirer(liste(), 'dictee', false, 0)).toBe(1);
	});
});

/* ============================================================
   Critère 7 — scénario de séance (le bug d'origine)
   ============================================================ */
describe('critère 7 : deux séances ciblées de suite sur une liste de 10 mots', () => {
	/** Joue une séance ciblée comme l'appelant UI : tire, sert, valide si réussi, avance. */
	function seance(
		mots: MotOrtho[],
		mode: ModeOrtho,
		activites: number,
		reussit: (i: number) => boolean = () => true,
	): number[] {
		const servis: number[] = [];
		let idx = 0; // chaque séance repart du début
		for (let k = 0; k < activites; k++) {
			const i = tirer(mots, mode, true, idx);
			servis.push(i);
			if (reussit(i)) validerMode(mots[i], mode, T0);
			idx = (i + 1) % mots.length;
		}
		return servis;
	}

	it('la 1re séance sert 0 à 7 ; la 2de sert 8 puis 9, puis passe en entretien', () => {
		const mots = neufs(10);
		expect(seance(mots, 'tuiles', SEANCE)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		// Dès le 3e tirage tout est validé : entretien à partir de (9 + 1) % 10 = 0, puis la
		// séance continue de tourner sur toute la liste (ni blocage sur un mot, ni fin anticipée).
		expect(seance(mots, 'tuiles', SEANCE)).toEqual([8, 9, 0, 1, 2, 3, 4, 5]);
		expect(mots.every((m) => m.validation.tuiles)).toBe(true);
	});

	it('un mot raté à la 1re séance revient en tête de la 2de, avant les mots jamais servis', () => {
		const mots = neufs(10);
		expect(seance(mots, 'tuiles', SEANCE, (i) => i !== 3)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(seance(mots, 'tuiles', 4)).toEqual([3, 8, 9, 0]);
	});
});

/* ============================================================
   Critère 8 — pureté et déterminisme
   ============================================================ */
describe('critère 8 : la fonction est pure', () => {
	it('ne modifie ni la liste ni les mots, et rend le même indice à chaque appel', () => {
		// Un escalier troué est inclus : une « réparation » au passage serait une mutation.
		const mots = [
			mot(COMPLET),
			mot({ motCache: true }),
			mot(TUILES),
			mot(),
			mot(JUSQU_AU_MOT_CACHE),
		];
		const avant = structuredClone(mots);
		const references = [...mots];
		for (const mode of MODES) {
			for (const dicteeDispo of [true, false]) {
				for (let depuis = 0; depuis < mots.length; depuis++) {
					const premier = tirer(mots, mode, dicteeDispo, depuis);
					expect(tirer(mots, mode, dicteeDispo, depuis)).toBe(premier);
				}
			}
		}
		expect(mots).toStrictEqual(avant); // ni mot modifié, ni liste réordonnée ou raccourcie
		mots.forEach((m, i) => expect(m).toBe(references[i]));
	});
});

/* ============================================================
   Caractérisation exhaustive — tous les escaliers, listes de 1 à 4 mots
   ============================================================ */
describe('caractérisation exhaustive : listes de 1 à 4 mots, les 8 escaliers possibles par mot', () => {
	// L'oracle `activiteProgressive` n'est pas recopié : c'est la définition même du contrat
	// (« un mot que le mode peut encore faire monter »), et ses valeurs sur les cas piégeux sont
	// épinglées à la main par les critères 5 et 6. Ce test garde la RECHERCHE cyclique.
	it('le mot servi est à faire et aucun mot à faire n’est sauté ; sinon on reste sur `depuis`', () => {
		const escaliers: Escalier[] = [];
		for (const tuiles of [false, true])
			for (const motCache of [false, true])
				for (const dictee of [false, true]) escaliers.push({ tuiles, motCache, dictee });

		// Toutes les suites de n escaliers (8^n), pour n de 1 à 4.
		const suites: Escalier[][] = [];
		const etendre = (prefixe: Escalier[]): void => {
			if (prefixe.length > 0) suites.push(prefixe);
			if (prefixe.length === 4) return;
			for (const e of escaliers) etendre([...prefixe, e]);
		};
		etendre([]);

		const echecs: string[] = [];
		for (const suite of suites) {
			const mots = suite.map((e) => mot(e));
			const n = mots.length;
			for (const mode of MODES) {
				for (const dicteeDispo of [true, false]) {
					const aFaire = (i: number): boolean => activiteProgressive(mots[i], mode, dicteeDispo);
					for (let depuis = 0; depuis < n; depuis++) {
						const servi = tirer(mots, mode, dicteeDispo, depuis);
						const cas = `${JSON.stringify(suite)} ${mode} voix=${dicteeDispo} depuis=${depuis} → ${servi}`;
						if (!Number.isInteger(servi) || servi < 0 || servi >= n) {
							echecs.push(`hors bornes : ${cas}`);
							continue;
						}
						if (!mots.some((_, i) => aFaire(i))) {
							if (servi !== depuis) echecs.push(`entretien attendu sur depuis : ${cas}`);
							continue;
						}
						if (!aFaire(servi)) echecs.push(`mot servi déjà fait : ${cas}`);
						for (let k = 0; k < (servi - depuis + n) % n; k++) {
							if (aFaire((depuis + k) % n)) {
								echecs.push(`mot à faire sauté (${(depuis + k) % n}) : ${cas}`);
								break;
							}
						}
					}
				}
			}
		}
		expect(echecs.slice(0, 10)).toEqual([]);
	});
});
