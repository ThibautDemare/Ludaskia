/* ============================================================
   #690 — LE BUDGET D'ENTRÉE EN ROTATION : une dose hebdomadaire dérivée du plafond.

   D'OÙ VIENNENT LES ATTENDUS. De la section « Le budget d'entrée et sa hiérarchie » et
   des critères 4, 5, 6, 10 et 12 de l'issue, écrits AVANT l'implémentation :
   `budgetEntreesRotation` et `promouvoirEntreesEnAttente` n'existent pas au moment où ce
   fichier est posé. Les valeurs du budget sont RECALCULÉES à la main depuis la formule de
   l'énoncé (`max(2, round(plafond / 3))`), jamais relues dans le code.

   CE QUI EST ÉPROUVÉ ICI :
   - critère 4  : la valeur du budget sur les sept paliers, et le fait qu'il compte TOUTES
                  les sources (mots découverts, leçons jouées, leçons déclarées) ;
   - critère 5  : une rencontre réelle entre immédiatement même budget épuisé, et le
                  budget peut donc être DÉPASSÉ par des rencontres réelles ;
   - critère 6  : une déclaration n'entre que sur le RELIQUAT — une semaine chargée n'en
                  fait entrer aucune ;
   - critère 12 : le budget ne retarde jamais le premier rappel d'un élément fraîchement
                  rencontré (J+1 le lendemain, quoi qu'il arrive) ;
   - la fenêtre est GLISSANTE (7 jours) et non calendaire, et le dépassement n'est pas
     REPORTÉ d'une semaine sur l'autre (deux points explicitement hors périmètre à
     l'envers : l'issue les écarte, donc ils doivent être éprouvés) ;
   - AUCUNE RAFALE possible sur le stock déclaré, quelle que soit son ancienneté : c'est ce
     qu'achète la décision du mainteneur du 9 septembre 2026 (soupape débitée au budget +
     slot réservé d'au plus une entrée par fenêtre), mesuré par différence de cumul sur
     sept jours. La borne est `budget + 1`, le +1 étant le slot réservé.

   LA FRONTIÈRE EXACTE DE LA FENÊTRE (une entrée vieille de 168 h tout juste : dedans ou
   dehors ?) n'est pas spécifiée par l'issue : rien ne l'assère ici. Les tests observent à
   J+6 (encore dans la fenêtre) et à J+8 (assurément dehors).
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
	budgetEntreesRotation,
	estHorsRotation,
	estDu,
	REVISION_PLAFOND_CHOIX,
	REVISION_PLAFOND_MIN,
	REVISION_PLAFOND_MAX,
} from '../src/core/revision';
import { countDue } from '../src/core/revision-select';
import {
	LESSON_REVISION_KEY,
	recordLessonStats,
	promouvoirEntreesEnAttente,
} from '../src/core/progress';
import { declarerVuAilleursFor } from '../src/core/vu-ailleurs';
import { getAllLessons } from '../src/core/catalog';
import { addOrGetMot, loadOrthoFor, saveOrthoFor } from '../src/core/orthographe/store';
import { marquerAtelierFait } from '../src/core/orthographe/runner';
import {
	initProfiles,
	activeProfile,
	touchActiveProfile,
	setNiveauReference,
} from '../src/core/profiles';
import { setOnDataWrite, lsGetRaw } from '../src/core/storage';
import type { EtatRevision, MotOrtho } from '../src/core/orthographe/types';

const JOUR = 24 * 60 * 60 * 1000;
/* Mercredi 3 juin 2026, 9 h — un MERCREDI délibérément : la frontière du lundi tombe
   alors AU MILIEU de la fenêtre de 7 jours, ce qui distingue une fenêtre glissante d'une
   semaine calendaire (cf. le bloc dédié). */
const T0 = new Date(2026, 5, 3, 9, 0, 0, 0).getTime();
const jour = (n: number): number => T0 + n * JOUR;
/* Plafond maximal (24) → budget de 8 par semaine glissante, l'ordre de grandeur mesuré
   dans l'issue. Recalculé ici, pas importé du code. */
const PLAFOND_MAX = 24;
const BUDGET_MAX = 8;

function revisions(uuid: string): Record<string, EtatRevision> {
	return lsGetRaw(uuid + '/' + LESSON_REVISION_KEY, {}) as Record<string, EtatRevision>;
}
const enRotation = (e: EtatRevision | undefined): boolean => !!e && !estHorsRotation(e);
function leconsCe2(): string[] {
	return getAllLessons()
		.filter((l) => l.levels.includes('ce2'))
		.map((l) => l.id);
}
function declarer(uuid: string, ids: string[], t: number): void {
	declarerVuAilleursFor(
		uuid,
		ids.map((lessonId) => ({ lessonId, niveau: 'ce2' as const })),
		true,
		t,
	);
}
/* Nombre de leçons DÉCLARÉES effectivement passées en rotation. */
function leconsEntrees(uuid: string, ids: string[]): number {
	const r = revisions(uuid);
	return ids.filter((id) => enRotation(r[`${id}@ce2`])).length;
}
function aLInstant<T>(t: number, fn: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return fn();
	} finally {
		spy.mockRestore();
	}
}
function jouerLecon(lessonId: string, t: number): void {
	aLInstant(t, () => recordLessonStats({ [lessonId]: { ok: 4, total: 5 } }, 'lecon', lessonId));
}
/* Découvertes réelles de mots (le chemin réel : atelier + persistance du profil). */
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
let compteurMots = 0;
function formeMot(i: number): string {
	return ALPHA[i % 26] + ALPHA[Math.floor(i / 26) % 26] + ALPHA[Math.floor(i / 676) % 26];
}
function decouvrirMots(uuid: string, n: number, t: number): MotOrtho[] {
	const state = loadOrthoFor(uuid);
	const mots: MotOrtho[] = [];
	for (let i = 0; i < n; i++) {
		const m = addOrGetMot(state, { mot: formeMot(compteurMots++) });
		marquerAtelierFait(m, t);
		mots.push(m);
	}
	saveOrthoFor(uuid, state);
	return mots;
}
function motsEnRotation(uuid: string): number {
	const banque = loadOrthoFor(uuid).banque;
	return Object.values(banque).filter((m) => enRotation(m.revision)).length;
}
/* Passes de promotion sur les jours [de, a] : la passe que l'appli déclenchera. */
function passes(uuid: string, de: number, a: number, plafond = PLAFOND_MAX): void {
	for (let j = de; j <= a; j++) promouvoirEntreesEnAttente(uuid, jour(j), plafond);
}

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	setNiveauReference('ce2');
	compteurMots = 0;
});

/* ============================================================
   1) Critère 4 — la valeur du budget, dérivée du plafond
   ============================================================ */
describe('critère 4 — le budget hebdomadaire vaut max(2, round(plafond / 3))', () => {
	it('les sept paliers du menu donnent 2 / 3 / 3 / 4 / 5 / 7 / 8', () => {
		// Valeurs recopiées de l'ÉNONCÉ de l'issue et recalculées à la main :
		// 6/3=2 · 8/3=2,67→3 · 10/3=3,33→3 · 12/3=4 · 15/3=5 · 20/3=6,67→7 · 24/3=8.
		expect(REVISION_PLAFOND_CHOIX).toEqual([6, 8, 10, 12, 15, 20, 24]);
		expect(REVISION_PLAFOND_CHOIX.map((p) => budgetEntreesRotation(p))).toEqual([
			2, 3, 3, 4, 5, 7, 8,
		]);
	});

	it('la formule tient sur toute la plage de plafonds admissibles', () => {
		for (let p = REVISION_PLAFOND_MIN; p <= REVISION_PLAFOND_MAX; p++) {
			expect(budgetEntreesRotation(p), `plafond=${p}`).toBe(Math.max(2, Math.round(p / 3)));
		}
	});

	it('le plancher de 2 tient, même sur un plafond dégénéré (donnée importée)', () => {
		for (const p of [0, 1, 3, -5]) {
			expect(budgetEntreesRotation(p), `plafond=${p}`).toBeGreaterThanOrEqual(2);
		}
	});

	it('le budget est monotone : un plafond plus grand n’ouvre jamais moins d’entrées', () => {
		for (let p = REVISION_PLAFOND_MIN; p < REVISION_PLAFOND_MAX; p++) {
			expect(budgetEntreesRotation(p + 1)).toBeGreaterThanOrEqual(budgetEntreesRotation(p));
		}
	});
});

/* ============================================================
   2) Critère 4 — le budget compte TOUTES les sources
   ------------------------------------------------------------
   Signal de violation de l'issue : « avec un plafond de 24, plus de 8 éléments entrent en
   rotation sur une semaine glissante sans qu'aucun ne soit une rencontre réelle ».
   ============================================================ */
describe('critère 4 — le budget compte les mots découverts, les leçons jouées ET les déclarations', () => {
	it('8 mots découverts dans la semaine : aucune déclaration n’entre', () => {
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 20);
		declarer(uuid, ids, T0);
		decouvrirMots(uuid, BUDGET_MAX, T0);

		passes(uuid, 0, 6);

		expect(leconsEntrees(uuid, ids)).toBe(0);
	});

	it('4 mots + 4 leçons jouées : le budget est consommé pareil', () => {
		const uuid = activeProfile().uuid;
		const toutes = leconsCe2();
		const declarees = toutes.slice(0, 20);
		declarer(uuid, declarees, T0);
		decouvrirMots(uuid, 4, T0);
		for (const id of toutes.slice(50, 54)) jouerLecon(id, T0);

		passes(uuid, 0, 6);

		expect(leconsEntrees(uuid, declarees)).toBe(0);
	});

	it('7 rencontres réelles laissent EXACTEMENT une place à une déclaration', () => {
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 20);
		declarer(uuid, ids, T0);
		decouvrirMots(uuid, 7, T0);

		passes(uuid, 0, 6);

		expect(leconsEntrees(uuid, ids)).toBe(BUDGET_MAX - 7);
	});

	it('sans aucune rencontre réelle, le budget entier sert aux déclarations — et pas plus', () => {
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 30);
		declarer(uuid, ids, T0);

		passes(uuid, 0, 6);

		expect(leconsEntrees(uuid, ids)).toBe(BUDGET_MAX);
	});

	it('la passe est idempotente : la relancer dans la journée ne rouvre pas le budget', () => {
		// Piège : une promotion qui ne se compte pas elle-même comme une entrée laisserait
		// passer huit déclarations de plus à chaque ouverture de l'appli.
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 30);
		declarer(uuid, ids, T0);

		for (let i = 0; i < 5; i++) promouvoirEntreesEnAttente(uuid, T0, PLAFOND_MAX);

		expect(leconsEntrees(uuid, ids)).toBe(BUDGET_MAX);
	});

	it('le budget suit le plafond du profil : à plafond 6, deux entrées par semaine', () => {
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 30);
		declarer(uuid, ids, T0);

		passes(uuid, 0, 6, 6);

		expect(leconsEntrees(uuid, ids)).toBe(2);
	});
});

/* ============================================================
   3) Critères 5 et 12 — la rencontre réelle passe outre le budget
   ------------------------------------------------------------
   Signaux de violation de l'issue : « un mot travaillé à l'atelier reste hors rotation le
   lendemain parce que le budget était épuisé » (5) et « le premier rappel d'un mot
   d'atelier tombe plus de 1 jour après l'atelier » (12).
   ============================================================ */
describe('critères 5 et 12 — une rencontre réelle entre toujours, immédiatement', () => {
	it('le 9e mot d’atelier de la semaine entre quand même, avec son J+1 le lendemain', () => {
		const uuid = activeProfile().uuid;
		decouvrirMots(uuid, BUDGET_MAX, T0); // budget de la semaine épuisé
		passes(uuid, 0, 0);

		const [neuvieme] = decouvrirMots(uuid, 1, jour(1));

		expect(estHorsRotation(neuvieme.revision)).toBe(false);
		expect(neuvieme.revision.prochaineRevision).toBe(jour(1) + JOUR);
		expect(estDu(neuvieme.revision, jour(2))).toBe(true);
	});

	it('vingt mots découverts le même jour ont TOUS leur premier rappel le lendemain', () => {
		const uuid = activeProfile().uuid;
		const mots = decouvrirMots(uuid, 20, T0);

		for (const m of mots) expect(m.revision.prochaineRevision, m.mot).toBe(T0 + JOUR);
		// Et vu de la séance : les vingt sont dus le lendemain, aucun n'a été mis de côté.
		expect(countDue(loadOrthoFor(uuid), {}, jour(1), PLAFOND_MAX)).toBe(20);
	});

	it('une leçon jouée entre immédiatement, même budget épuisé', () => {
		const uuid = activeProfile().uuid;
		decouvrirMots(uuid, BUDGET_MAX, T0);
		passes(uuid, 0, 0);

		const X = leconsCe2()[0];
		jouerLecon(X, jour(1));

		expect(revisions(uuid)[`${X}@ce2`].prochaineRevision).toBe(jour(1) + JOUR);
	});

	it('le budget peut donc être DÉPASSÉ par des rencontres réelles, jamais par des déclarations', () => {
		const uuid = activeProfile().uuid;
		const toutes = leconsCe2();
		const declarees = toutes.slice(0, 10);
		declarer(uuid, declarees, T0);
		decouvrirMots(uuid, 20, T0);
		for (const id of toutes.slice(50, 55)) jouerLecon(id, T0);

		passes(uuid, 0, 6);

		// 25 entrées réelles sur la semaine pour un budget de 8 : elles passent toutes.
		expect(motsEnRotation(uuid)).toBe(20);
		expect(
			toutes.slice(50, 55).filter((id) => enRotation(revisions(uuid)[`${id}@ce2`])),
		).toHaveLength(5);
		// Et aucune déclaration n'a profité du dépassement.
		expect(leconsEntrees(uuid, declarees)).toBe(0);
	});
});

/* ============================================================
   4) Critère 6 — une déclaration n'entre que sur le reliquat
   ------------------------------------------------------------
   Signal de violation de l'issue : « une semaine comportant 8 ateliers laisse encore
   entrer une leçon déclarée ».
   ============================================================ */
describe('critère 6 — une semaine chargée ne fait entrer aucune déclaration', () => {
	it('huit ateliers dans la semaine : les cinq leçons déclarées attendent toutes', () => {
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 5);
		declarer(uuid, ids, T0);
		// Les huit ateliers étalés sur la semaine, comme dans la vraie vie. La passe se juge
		// une fois la SEMAINE ÉCOULÉE : au jour 0 la fenêtre ne contient que les deux
		// ateliers du jour, et mesurer là reviendrait à parler d'une semaine à deux ateliers.
		for (let j = 0; j <= 6; j++) decouvrirMots(uuid, j < 2 ? 2 : 1, jour(j));

		promouvoirEntreesEnAttente(uuid, jour(6), PLAFOND_MAX);

		const r = revisions(uuid);
		for (const id of ids) expect(estHorsRotation(r[`${id}@ce2`]), id).toBe(true);
	});

	it('l’ordre de passage est celui de l’ANCIENNETÉ de la déclaration', () => {
		const uuid = activeProfile().uuid;
		const [A, ...tardives] = leconsCe2().slice(0, 6);
		declarer(uuid, [A], T0);
		decouvrirMots(uuid, 7, T0); // reliquat = 1
		declarer(uuid, tardives, jour(1));

		promouvoirEntreesEnAttente(uuid, jour(1), PLAFOND_MAX);

		const r = revisions(uuid);
		expect(enRotation(r[`${A}@ce2`])).toBe(true); // la plus ancienne passe
		for (const id of tardives) expect(estHorsRotation(r[`${id}@ce2`]), id).toBe(true);
	});
});

/* ============================================================
   5) La fenêtre est glissante (7 jours), et le dépassement n'est pas reporté
   ------------------------------------------------------------
   L'issue écarte explicitement le report du déficit (« une fenêtre glissante de 7 jours
   simple »), donc c'est un attendu, pas un détail d'implémentation.
   ============================================================ */
describe('fenêtre glissante de 7 jours, sans report du dépassement', () => {
	it('pré-condition : T0 est un mercredi, et J+5 un lundi', () => {
		expect(new Date(T0).getDay()).toBe(3);
		expect(new Date(jour(5)).getDay()).toBe(1);
	});

	it('la frontière du LUNDI ne libère rien : seule l’ancienneté des entrées compte', () => {
		// Une implémentation par semaine CALENDAIRE remettrait le compteur à zéro le lundi
		// 8 juin (J+5) et laisserait entrer huit déclarations ce jour-là. Une fenêtre
		// glissante de 7 jours, non.
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 30);
		declarer(uuid, ids, T0);
		decouvrirMots(uuid, BUDGET_MAX, T0);

		for (let j = 0; j <= 6; j++) {
			promouvoirEntreesEnAttente(uuid, jour(j), PLAFOND_MAX);
			expect(leconsEntrees(uuid, ids), `j=${j}`).toBe(0);
		}

		// Une fois les huit ateliers sortis de la fenêtre, le budget est de nouveau plein.
		passes(uuid, 8, 8);
		expect(leconsEntrees(uuid, ids)).toBe(BUDGET_MAX);
	});

	it('pas de report du dépassement : douze rencontres une semaine ne rognent pas la suivante', () => {
		// Douze découvertes le jour 0 pour un budget de 8, soit quatre de dépassement. Sept
		// jours plus tard, la fenêtre ne les contient plus : le budget vaut 8, pas 4.
		// Reporter le dépassement rendrait le blocage cumulatif (critère 10 en danger).
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 30);
		declarer(uuid, ids, T0);
		decouvrirMots(uuid, 12, T0);

		passes(uuid, 0, 6);
		expect(leconsEntrees(uuid, ids)).toBe(0);

		passes(uuid, 8, 8);
		expect(leconsEntrees(uuid, ids)).toBe(BUDGET_MAX);
	});

	it('AUCUNE RAFALE sur le stock mesuré : 101 déclarations n’entrent jamais plus de 9 par semaine', () => {
		// DÉCISION DU MAINTENEUR (9 septembre 2026) : la soupape des 4 semaines est débitée
		// au budget, plus un SLOT RÉSERVÉ d'au plus une entrée par fenêtre quand le budget
		// n'a rien laissé passer. La charge d'une semaine est donc bornée par `budget + 1` —
		// c'est précisément ce que cette décision achète : les 101 déclarations du profil
		// mesuré ne peuvent entrer en masse ni le jour de la déclaration (critère 1), ni
		// quatre semaines plus tard. La mesure se fait par DIFFÉRENCE DE CUMUL sur sept
		// jours, donc sans rien supposer de la convention de bord de la fenêtre.
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 101);
		declarer(uuid, ids, T0);

		const cumul: number[] = [];
		for (let j = 0; j <= 7 * 20; j++) {
			promouvoirEntreesEnAttente(uuid, jour(j), PLAFOND_MAX);
			cumul.push(leconsEntrees(uuid, ids));
		}

		for (let j = 0; j < cumul.length; j++) {
			const debutFenetre = j >= 7 ? cumul[j - 7] : 0;
			expect(cumul[j] - debutFenetre, `fenêtre finissant à j=${j}`).toBeLessThanOrEqual(
				BUDGET_MAX + 1,
			);
		}
		// À quatre semaines, au plus cinq doses ont pu passer : rien qui ressemble aux
		// 101 entrées simultanées du profil mesuré.
		expect(cumul[28]).toBeLessThanOrEqual(5 * (BUDGET_MAX + 1));
		// Et le stock finit tout de même par s'écouler entièrement (critère 10 / 11).
		expect(cumul[cumul.length - 1]).toBe(101);
	});

	it('le budget non consommé ne se cumule pas non plus : 8 par semaine, pas 16 en deux', () => {
		// Le pendant du précédent : une semaine calme ne met pas de budget « en réserve ».
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 30);
		declarer(uuid, ids, T0);

		passes(uuid, 0, 0); // une seule passe : 8 entrent
		expect(leconsEntrees(uuid, ids)).toBe(BUDGET_MAX);

		passes(uuid, 1, 6); // la fenêtre les contient encore : rien de plus
		expect(leconsEntrees(uuid, ids)).toBe(BUDGET_MAX);

		passes(uuid, 8, 8); // fenêtre vidée : la dose suivante, pas le cumul
		expect(leconsEntrees(uuid, ids)).toBe(2 * BUDGET_MAX);
	});
});
