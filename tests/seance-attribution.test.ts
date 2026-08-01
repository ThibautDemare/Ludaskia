/* ============================================================
   Attribution du programme du jour sur ce qui a été FAIT (#498) — cœur pur de
   src/core/seance.ts : `etapeSatisfaite` (ce que vaut une session) et
   `resoudreProgramme` (appariement des sessions nouvelles aux étapes restantes).

   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés du CONTRAT
   fonctionnel de l'issue #498 — « créditer une étape sur ce qui a été FAIT, pas sur le
   chemin emprunté » —, jamais recopiés de l'implémentation :
   - une session faite depuis la carte « À revoir » de l'accueil ou depuis le catalogue
     (donc SANS marqueur) crédite son étape : c'était le bug d'origine ;
   - une session déjà examinée ne recrédite jamais (idempotence) et une session d'AVANT la
     naissance du programme du jour ne crédite rien ;
   - une session vaut UNE étape, jamais deux ; un « ×2 » exige deux sessions ;
   - le marqueur ne sert plus qu'à DATER (durée réelle) et à lever une ambiguïté : son
     absence ou son abandon ne coûte plus le crédit.

   Repère calendaire (heure LOCALE) : 2026-01-05 = lundi (ISO 1), 2026-01-06 = mardi.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import * as seanceApi from '../src/core/seance';
import {
	CONTEXTE_VIDE,
	SEANCE_MODE_INFOS,
	SEANCE_JOUR_KEY,
	dateStrDe,
	etapeSatisfaite,
	etatSeanceJour,
	marquerEtapeLancee,
	resoudreProgramme,
	seancesCompletees,
	enregistrerSeancesFor,
	type ContexteSeance,
	type SeanceDef,
	type SeanceEtape,
	type SeanceJour,
	type SeanceModeKind,
} from '../src/core/seance';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSet } from '../src/core/storage';
import {
	ACTIVITY_KEY,
	type ActivityEntry,
	type ActivityKind,
	type ActivityKindStored,
} from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Instants de référence (heure locale) ---------- */
const LUN = new Date(2026, 0, 5).getTime(); // lundi, ISO 1
const MAR = new Date(2026, 0, 6).getTime(); // mardi, ISO 2

/* ---------- Fabriques ---------- */
const LECON_A = 'math-doubles';
const LECON_B = 'math-complements';
const LISTE_A = 'fr-ortho-invariables-1';
const LISTE_B = 'fr-ortho-son-eu-1';

function etape(id: string, kind: SeanceModeKind, count = 1, ref?: string): SeanceEtape {
	return ref === undefined ? { id, kind, count } : { id, kind, count, ref };
}
function defLundi(etapes: SeanceEtape[], id = 'd1'): SeanceDef {
	return { id, etapes, recurrence: { type: 'hebdo', jours: [1] } };
}
/** Session du journal d'activité (`{t, k, ref?}`), pour éprouver `etapeSatisfaite` sans stockage. */
function session(k: ActivityKindStored, ref?: string, t = 1): ActivityEntry {
	return ref === undefined ? { t, k } : { t, k, ref };
}
/** Contexte du jour : ids BRUTS des épinglées, par nature. */
function epinglees(lecons: string[] = [], dictees: string[] = []): ContexteSeance {
	return { aRevoirLecons: lecons, aRevoirDictees: dictees };
}

/* ---------- Accès stockage (API du module + clés documentées) ---------- */
function poserDefs(defs: SeanceDef[]): void {
	enregistrerSeancesFor(activeProfile().uuid, defs);
}
/** Sème une session finalisée dans le journal d'activité, horodatage et cible maîtrisés. */
function poserActivite(k: ActivityKind, t: number, ref?: string): void {
	const a: { t: number; k: ActivityKind; ref?: string }[] = lsGet(ACTIVITY_KEY, []);
	a.push(ref === undefined ? { t, k } : { t, k, ref });
	lsSet(ACTIVITY_KEY, a);
}
function jourStocke(): SeanceJour {
	return lsGet(SEANCE_JOUR_KEY, null) as SeanceJour;
}
/** Naissance de l'état du jour (pose le curseur d'attribution à cet instant). */
function ouvrirJour(t: number): SeanceJour {
	return etatSeanceJour(t)!;
}
/** État du jour écrit par une version ANTÉRIEURE à #498 : la forme d'alors, SANS curseur
    d'attribution (le champ n'existait pas). Posé brut dans le stockage — c'est exactement
    ce qui dort dans le `localStorage` de l'enfant au moment de la mise à jour. */
function poserJourHerite(over: Record<string, unknown> = {}): void {
	lsSet(SEANCE_JOUR_KEY, {
		date: dateStrDe(LUN),
		defId: 'd1', // = defLundi() par défaut : l'état est bien celui de la définition du jour
		faits: {},
		completions: [],
		complete: false,
		pending: null,
		...over,
	});
}
const JOURS = 24 * 3_600_000;

/* ============================================================
   0) Surface d'API : le marqueur n'est plus la porte de l'attribution
   ============================================================ */
describe('surface du module après #498', () => {
	it('resoudrePending / consoliderCompletion / etapesApplicables ont disparu au profit de resoudreProgramme', () => {
		const exports = Object.keys(seanceApi);
		expect(exports).toContain('resoudreProgramme');
		expect(exports).toContain('etapeSatisfaite');
		expect(exports).toContain('nbARevoir');
		expect(exports).not.toContain('resoudrePending');
		expect(exports).not.toContain('consoliderCompletion');
		expect(exports).not.toContain('etapesApplicables');
	});
	it('SEANCE_MODE_INFOS ne décrit plus qu’un libellé, une durée et une nature de cible', () => {
		// Le type d'activité par mode a quitté ces métadonnées : « ce que vaut une session »
		// n'a plus qu'une source, `etapeSatisfaite` (un mode « à revoir » accepte une leçon OU
		// une dictée selon la cible épinglée, ce qu'un champ unique ne pouvait pas dire).
		for (const kind of Object.keys(SEANCE_MODE_INFOS) as SeanceModeKind[]) {
			expect(Object.keys(SEANCE_MODE_INFOS[kind]).sort()).toEqual(['dureeMin', 'label', 'ref']);
		}
	});
});

/* ============================================================
   1) etapeSatisfaite — source unique de « ce que vaut une session »
   ============================================================ */
describe('etapeSatisfaite : modes à TYPE seul (sprint, revision)', () => {
	it('le type suffit, la cible de la session est indifférente', () => {
		for (const ref of [undefined, LECON_A, LISTE_A]) {
			expect(etapeSatisfaite(etape('e1', 'sprint'), session('sprint', ref), CONTEXTE_VIDE)).toBe(
				true,
			);
			expect(
				etapeSatisfaite(etape('e1', 'revision'), session('revision', ref), CONTEXTE_VIDE),
			).toBe(true);
		}
	});
	it('un autre type ne satisfait pas (sprint ≠ revision, et réciproquement)', () => {
		expect(etapeSatisfaite(etape('e1', 'sprint'), session('revision'), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(etape('e1', 'revision'), session('sprint'), CONTEXTE_VIDE)).toBe(false);
	});
});

describe('etapeSatisfaite : mode `lecon` (cible EXACTE fixée par l’adulte)', () => {
	const e = etape('e1', 'lecon', 1, LECON_A);
	it('la leçon demandée, et elle seule', () => {
		expect(etapeSatisfaite(e, session('lecon', LECON_A), CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(e, session('lecon', LECON_B), CONTEXTE_VIDE)).toBe(false);
	});
	it('une session SANS cible ne suffit pas (on ne peut pas affirmer que c’était CETTE leçon)', () => {
		expect(etapeSatisfaite(e, session('lecon'), CONTEXTE_VIDE)).toBe(false);
	});
	it('une dictée portant le même id ne satisfait pas (la nature compte)', () => {
		expect(etapeSatisfaite(e, session('dictee', LECON_A), CONTEXTE_VIDE)).toBe(false);
	});
	it('étape mal configurée (aucune ref) : jamais satisfaite, même par une leçon', () => {
		// Sinon une consigne incomplète de l'adulte se créditerait avec n'importe quoi.
		expect(etapeSatisfaite(etape('e1', 'lecon'), session('lecon', LECON_A), CONTEXTE_VIDE)).toBe(
			false,
		);
	});
});

describe('etapeSatisfaite : mode `dictee` (pool de cibles)', () => {
	it('n’importe quelle liste DU POOL satisfait, une liste hors pool non', () => {
		const e: SeanceEtape = { id: 'e1', kind: 'dictee', count: 1, refs: [LISTE_A, LISTE_B] };
		expect(etapeSatisfaite(e, session('dictee', LISTE_A), CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(e, session('dictee', LISTE_B), CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(e, session('dictee', 'fr-ortho-autre'), CONTEXTE_VIDE)).toBe(false);
	});
	it('rétrocompat : étape à cible unique `ref` (programme configuré avant le pool)', () => {
		const e = etape('e1', 'dictee', 1, LISTE_A);
		expect(etapeSatisfaite(e, session('dictee', LISTE_A), CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(e, session('dictee', LISTE_B), CONTEXTE_VIDE)).toBe(false);
	});
	it('dictée SANS cible, ou leçon portant l’id de la liste : non satisfaite', () => {
		const e = etape('e1', 'dictee', 1, LISTE_A);
		expect(etapeSatisfaite(e, session('dictee'), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('lecon', LISTE_A), CONTEXTE_VIDE)).toBe(false);
	});
});

describe('etapeSatisfaite : mode `leconDuJour` (n’importe quelle leçon)', () => {
	const e = etape('e1', 'leconDuJour');
	it('toute session de leçon PORTANT une cible convient (la leçon proposée change dès qu’elle est réussie)', () => {
		expect(etapeSatisfaite(e, session('lecon', LECON_A), CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(e, session('lecon', LECON_B), CONTEXTE_VIDE)).toBe(true);
	});
	it('une leçon sans cible, une dictée ou une révision ne conviennent pas', () => {
		expect(etapeSatisfaite(e, session('lecon'), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('dictee', LISTE_A), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('revision'), CONTEXTE_VIDE)).toBe(false);
	});
});

describe('etapeSatisfaite : mode `aRevoir` (cible prise dans la file épinglée)', () => {
	const e = etape('e1', 'aRevoir');
	const file = epinglees([LECON_A], [LISTE_A]);
	it('leçon épinglée travaillée, dictée épinglée faite : les deux natures satisfont', () => {
		expect(etapeSatisfaite(e, session('lecon', LECON_A), file)).toBe(true);
		expect(etapeSatisfaite(e, session('dictee', LISTE_A), file)).toBe(true);
	});
	it('une cible HORS file ne satisfait pas', () => {
		expect(etapeSatisfaite(e, session('lecon', LECON_B), file)).toBe(false);
		expect(etapeSatisfaite(e, session('dictee', LISTE_B), file)).toBe(false);
	});
	it('croisement de nature : la leçon épinglée ne se travaille pas « en dictée »', () => {
		expect(etapeSatisfaite(e, session('dictee', LECON_A), file)).toBe(false);
		expect(etapeSatisfaite(e, session('lecon', LISTE_A), file)).toBe(false);
	});
	it('session sans cible, ou file vide : jamais satisfaite', () => {
		expect(etapeSatisfaite(e, session('lecon'), file)).toBe(false);
		expect(etapeSatisfaite(e, session('dictee'), file)).toBe(false);
		expect(etapeSatisfaite(e, session('lecon', LECON_A), CONTEXTE_VIDE)).toBe(false);
	});
});

describe('etapeSatisfaite : invariants transverses', () => {
	it('une session MULTI-CIBLES (bilan) ou d’un format ancien (inconnu) ne satisfait AUCUN mode', () => {
		// Un bilan ou un journal d'avant #498 ne désigne pas une cible : mieux vaut ne rien
		// créditer que créditer à tort la consigne précise d'un adulte.
		const file = epinglees([LECON_A], [LISTE_A]);
		for (const kind of Object.keys(SEANCE_MODE_INFOS) as SeanceModeKind[]) {
			for (const type of ['bilan', 'inconnu'] as ActivityKindStored[]) {
				expect(etapeSatisfaite(etape('e1', kind, 1, LECON_A), session(type, LECON_A), file)).toBe(
					false,
				);
			}
		}
	});
	it('fonction PURE : aucune lecture/écriture d’état du jour', () => {
		poserDefs([defLundi([etape('e1', 'sprint')])]);
		etapeSatisfaite(etape('e1', 'sprint'), session('sprint'), CONTEXTE_VIDE);
		etapeSatisfaite(etape('e2', 'aRevoir'), session('lecon', LECON_A), epinglees([LECON_A]));
		expect(lsGet(SEANCE_JOUR_KEY, null)).toBeNull(); // aucun état du jour créé au passage
	});
});

/* ============================================================
   2) resoudreProgramme SANS marqueur — le bug d'origine (#498, défaut 1)
   ============================================================ */
describe('crédit d’une session faite hors du programme (défaut 1)', () => {
	it('une leçon lancée depuis le catalogue ou la carte d’accueil crédite son étape', () => {
		poserDefs([defLundi([etape('e1', 'lecon', 1, LECON_A)])]);
		ouvrirJour(LUN); // l'accueil s'est affiché : le programme du jour naît ici
		poserActivite('lecon', LUN + 60_000, LECON_A); // travaillée SANS passer par la tuile
		const r = resoudreProgramme(LUN + 90_000);
		expect(r).toEqual({ etapesCreditees: ['e1'], justCompleted: true });
		expect(seancesCompletees()).toBe(1);
		const j = jourStocke();
		expect(j.faits.e1).toBe(1);
		expect(j.completions).toHaveLength(1);
		// Horodatage = celui du journal ; durée INCONNUE (aucun lancement daté) → 0.
		expect(j.completions[0]).toMatchObject({
			etapeId: 'e1',
			kind: 'lecon',
			ref: LECON_A,
			ts: LUN + 60_000,
			dureeMs: 0,
		});
	});
	it('une dictée lancée depuis le catalogue crédite l’étape « dictée » de la bonne liste', () => {
		poserDefs([defLundi([etape('e1', 'dictee', 1, LISTE_A)])]);
		ouvrirJour(LUN);
		poserActivite('dictee', LUN + 1_000, LISTE_A);
		expect(resoudreProgramme(LUN + 2_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
		expect(jourStocke().completions[0]).toMatchObject({ kind: 'dictee', ref: LISTE_A });
	});
	it('une session de la MAUVAISE cible laisse l’étape due', () => {
		poserDefs([defLundi([etape('e1', 'lecon', 1, LECON_A)])]);
		ouvrirJour(LUN);
		poserActivite('lecon', LUN + 1_000, LECON_B);
		expect(resoudreProgramme(LUN + 2_000)).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(jourStocke().faits).toEqual({});
		expect(seancesCompletees()).toBe(0);
	});
	it('une session d’un autre TYPE ne crédite pas', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		ouvrirJour(LUN);
		poserActivite('revision', LUN + 1_000);
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual([]);
	});
	it('aucun programme aujourd’hui : résolution neutre, rien de célébré', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]); // lundi seulement
		poserActivite('sprint', MAR + 1_000);
		expect(resoudreProgramme(MAR + 2_000)).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(seancesCompletees()).toBe(0);
	});
});

/* ============================================================
   3) Curseur d'attribution : idempotence et bornes
   ============================================================ */
describe('curseur d’attribution (idempotence et bornes)', () => {
	it('passes répétées : la même session ne crédite qu’UNE fois', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 2)])]);
		ouvrirJour(LUN);
		poserActivite('sprint', LUN + 1_000);
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual(['e1']);
		for (const dt of [3_000, 4_000, 5_000]) {
			expect(resoudreProgramme(LUN + dt)).toEqual({ etapesCreditees: [], justCompleted: false });
		}
		expect(jourStocke().faits.e1).toBe(1); // toujours 1/2, malgré quatre passes
	});
	it('une session ANTÉRIEURE à la naissance du programme du jour ne crédite rien', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		poserActivite('sprint', LUN + 5_000); // sprint fait AVANT que le programme existe
		ouvrirJour(LUN + 10_000); // naissance de l'état du jour
		expect(resoudreProgramme(LUN + 20_000).etapesCreditees).toEqual([]);
		expect(jourStocke().faits).toEqual({});
	});
	it('DÉFINITION changée en cours de journée : le travail d’avant ne nourrit pas le programme neuf', () => {
		// L'adulte remplace la séance du jour à midi : l'état repart de zéro et son curseur
		// naît à cet instant — le sprint du matin appartenait à l'ancien programme.
		poserDefs([defLundi([etape('e1', 'sprint', 1)], 'd1')]);
		ouvrirJour(LUN);
		poserActivite('sprint', LUN + 5_000);
		expect(resoudreProgramme(LUN + 6_000).etapesCreditees).toEqual(['e1']);
		poserDefs([defLundi([etape('e1', 'sprint', 1)], 'd2')]);
		ouvrirJour(LUN + 10_000); // nouvelle définition → nouvel état, nouveau curseur
		expect(resoudreProgramme(LUN + 11_000)).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(jourStocke().defId).toBe('d2');
		expect(jourStocke().faits).toEqual({});
	});
	it('borne EXCLUSIVE : une session pile à l’instant de naissance ne compte pas, la milliseconde suivante oui', () => {
		// Prix de l'idempotence : le curseur avance sur l'horodatage de la dernière session
		// examinée, la fenêtre est donc ouverte à gauche. Fenêtre d'exclusion = 1 ms.
		poserDefs([defLundi([etape('e1', 'sprint', 2)])]);
		ouvrirJour(LUN);
		poserActivite('sprint', LUN); // pile à la naissance
		expect(resoudreProgramme(LUN + 1_000).etapesCreditees).toEqual([]);
		poserActivite('sprint', LUN + 1); // une milliseconde plus tard
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual(['e1']);
		expect(jourStocke().faits.e1).toBe(1); // la session de la borne reste écartée
	});
	it('session postérieure à la passe (horloge en avance) : différée, JAMAIS perdue', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		ouvrirJour(LUN);
		poserActivite('sprint', LUN + 10_000);
		expect(resoudreProgramme(LUN + 5_000).etapesCreditees).toEqual([]); // pas encore examinable
		expect(resoudreProgramme(LUN + 20_000).etapesCreditees).toEqual(['e1']); // rattrapée
	});
	it('journal d’AVANT #319 (horodatages nus) : rien crédité, rien cassé', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		ouvrirJour(LUN);
		lsSet(ACTIVITY_KEY, [LUN + 1_000, LUN + 2_000]); // ancien format → type 'inconnu'
		expect(resoudreProgramme(LUN + 3_000)).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(jourStocke().faits).toEqual({});
	});
});

/* ============================================================
   4) Une session = UNE étape ; « ×N » = N sessions
   ============================================================ */
describe('une session ne vaut qu’UNE étape', () => {
	it('deux étapes identiques : une session en crédite une seule (ordre de composition)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'sprint', 1)])]);
		ouvrirJour(LUN);
		poserActivite('sprint', LUN + 1_000);
		const r1 = resoudreProgramme(LUN + 2_000);
		expect(r1).toEqual({ etapesCreditees: ['e1'], justCompleted: false });
		expect(jourStocke().faits).toEqual({ e1: 1 });
		// Le second sprint nourrit la seconde étape : deux passages pour deux étapes.
		poserActivite('sprint', LUN + 3_000);
		expect(resoudreProgramme(LUN + 4_000)).toEqual({
			etapesCreditees: ['e2'],
			justCompleted: true,
		});
	});
	it('« ×2 » : deux sessions DISTINCTES, crédit plafonné, une seule récompense', () => {
		poserDefs([defLundi([etape('e1', 'lecon', 2, LECON_A)])]);
		ouvrirJour(LUN);
		poserActivite('lecon', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: false,
		});
		poserActivite('lecon', LUN + 3_000, LECON_A);
		expect(resoudreProgramme(LUN + 4_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
		expect(seancesCompletees()).toBe(1);
		// Un troisième passage : ni sur-crédit, ni seconde récompense.
		poserActivite('lecon', LUN + 5_000, LECON_A);
		expect(resoudreProgramme(LUN + 6_000)).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(jourStocke().faits.e1).toBe(2);
		expect(jourStocke().completions).toHaveLength(2);
		expect(seancesCompletees()).toBe(1);
	});
	it('deux sessions dans une même passe : chacune crédite son étape, chronologiquement', () => {
		poserDefs([defLundi([etape('e1', 'lecon', 1, LECON_A), etape('e2', 'dictee', 1, LISTE_A)])]);
		ouvrirJour(LUN);
		// Journal semé dans le DÉSORDRE (la dictée écrite avant la leçon, plus tardive).
		poserActivite('dictee', LUN + 30_000, LISTE_A);
		poserActivite('lecon', LUN + 20_000, LECON_A);
		const r = resoudreProgramme(LUN + 40_000);
		expect(r.etapesCreditees).toEqual(['e1', 'e2']); // ordre CHRONOLOGIQUE, pas d'écriture
		expect(r.justCompleted).toBe(true);
		expect(jourStocke().completions.map((c) => c.ts)).toEqual([LUN + 20_000, LUN + 30_000]);
	});
});

/* ============================================================
   5) Arbitrage quand plusieurs étapes accepteraient la même session
   ============================================================ */
describe('arbitrage entre étapes concurrentes', () => {
	it('la cible EXACTE passe avant « leçon du jour », même composée en second', () => {
		poserDefs([defLundi([etape('e1', 'leconDuJour', 1), etape('e2', 'lecon', 1, LECON_A)])]);
		ouvrirJour(LUN);
		poserActivite('lecon', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual(['e2']);
		// La consigne large se satisfait ensuite de n'importe quelle leçon.
		poserActivite('lecon', LUN + 3_000, LECON_B);
		expect(resoudreProgramme(LUN + 4_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
	});
	it('« à revoir » passe avant « leçon du jour » (l’ordre le plus favorable à l’enfant)', () => {
		poserDefs([defLundi([etape('e1', 'leconDuJour', 1), etape('e2', 'aRevoir', 1)])]);
		const ctx = epinglees([LECON_A]);
		resoudreProgramme(LUN, ctx); // rendu de l'accueil : la file du jour est vue
		poserActivite('lecon', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000, ctx).etapesCreditees).toEqual(['e2']);
	});
	it('la cible EXACTE passe avant « à revoir »', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1), etape('e2', 'lecon', 1, LECON_A)])]);
		const ctx = epinglees([LECON_A]); // la leçon demandée est AUSSI épinglée
		resoudreProgramme(LUN, ctx);
		poserActivite('lecon', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000, ctx).etapesCreditees).toEqual(['e2']);
	});
	it('à égalité de spécificité, l’ordre de composition tranche', () => {
		poserDefs([defLundi([etape('e1', 'lecon', 1, LECON_A), etape('e2', 'lecon', 1, LECON_A)])]);
		ouvrirJour(LUN);
		poserActivite('lecon', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual(['e1']);
	});
	it('une étape ÉPUISÉE ne prend pas le crédit d’une autre encore due', () => {
		poserDefs([defLundi([etape('e1', 'lecon', 1, LECON_A), etape('e2', 'leconDuJour', 1)])]);
		ouvrirJour(LUN);
		poserActivite('lecon', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual(['e1']);
		// Même leçon refaite : e1 est épuisée, le crédit va à la consigne large.
		poserActivite('lecon', LUN + 3_000, LECON_A);
		expect(resoudreProgramme(LUN + 4_000)).toEqual({
			etapesCreditees: ['e2'],
			justCompleted: true,
		});
	});
	it('le MARQUEUR l’emporte sur l’arbitrage : l’enfant a lancé CETTE étape', () => {
		poserDefs([defLundi([etape('e1', 'lecon', 1, LECON_A), etape('e2', 'leconDuJour', 1)])]);
		marquerEtapeLancee('e2', LUN + 1_000); // tuile « Leçon du jour » du programme
		poserActivite('lecon', LUN + 4_000, LECON_A); // la leçon proposée était justement LECON_A
		const r = resoudreProgramme(LUN + 5_000);
		expect(r.etapesCreditees).toEqual(['e2']); // e2 malgré la spécificité de e1
		expect(jourStocke().completions[0]).toMatchObject({
			etapeId: 'e2',
			kind: 'leconDuJour',
			ref: LECON_A,
			dureeMs: 3_000, // datée par le marqueur
		});
		expect(jourStocke().faits.e1 ?? 0).toBe(0);
	});
});

/* ============================================================
   6) Le marqueur : une DATE, plus un droit d'entrée (#498, défaut 2)
   ============================================================ */
describe('marqueur « étape en cours »', () => {
	it('lancement depuis la tuile : durée RÉELLE et marqueur consommé', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('e1', LUN + 1_000);
		poserActivite('sprint', LUN + 4_500);
		expect(resoudreProgramme(LUN + 5_000).etapesCreditees).toEqual(['e1']);
		const j = jourStocke();
		expect(j.completions[0]).toMatchObject({ dureeMs: 3_500, ts: LUN + 4_500 });
		expect(j.pending).toBeNull();
		expect(j.debutTs).toBe(LUN + 1_000); // span de la séance
	});
	it('étape lancée puis quittée : marqueur nettoyé, et le crédit N’EST PLUS PERDU (défaut 2)', () => {
		// Leçon interrompue (retour à l'accueil), reprise et finie dix minutes plus tard.
		poserDefs([defLundi([etape('e1', 'lecon', 1, LECON_A)])]);
		marquerEtapeLancee('e1', LUN + 1_000);
		const abandon = resoudreProgramme(LUN + 2_000); // repassage par l'accueil, rien de fini
		expect(abandon).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(jourStocke().pending).toBeNull(); // marqueur nettoyé
		expect(jourStocke().faits).toEqual({});
		// Reprise plus tard : la session est journalisée, l'étape est enfin créditée.
		poserActivite('lecon', LUN + 600_000, LECON_A);
		const r = resoudreProgramme(LUN + 601_000);
		expect(r).toEqual({ etapesCreditees: ['e1'], justCompleted: true });
		expect(jourStocke().completions[0]).toMatchObject({ ref: LECON_A, dureeMs: 0 });
		expect(seancesCompletees()).toBe(1);
	});
	it('marqueur d’une AUTRE étape : la session est quand même créditée, sans durée', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'revision', 1)])]);
		marquerEtapeLancee('e2', LUN + 1_000); // l'enfant a lancé la révision…
		poserActivite('sprint', LUN + 3_000); // … mais a fait un sprint
		expect(resoudreProgramme(LUN + 4_000).etapesCreditees).toEqual(['e1']);
		const j = jourStocke();
		expect(j.completions[0]).toMatchObject({ etapeId: 'e1', dureeMs: 0 });
		expect(j.pending).toBeNull(); // marqueur non consommé → nettoyé
		expect(j.faits.e2 ?? 0).toBe(0);
	});
	it('session ANTÉRIEURE au marqueur : créditée sans durée (jamais de durée négative)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		ouvrirJour(LUN);
		poserActivite('sprint', LUN + 3_000);
		marquerEtapeLancee('e1', LUN + 5_000); // relance après coup, la session est déjà finie
		expect(resoudreProgramme(LUN + 6_000).etapesCreditees).toEqual(['e1']);
		expect(jourStocke().completions[0].dureeMs).toBe(0);
	});
	it('la cible tirée d’un pool est conservée dans la métrique, avec la durée réelle', () => {
		poserDefs([defLundi([{ id: 'e1', kind: 'dictee', count: 1, refs: [LISTE_A, LISTE_B] }])]);
		marquerEtapeLancee('e1', LUN + 1_000, LISTE_B); // tirage du pool → LISTE_B
		poserActivite('dictee', LUN + 2_000, LISTE_B);
		expect(resoudreProgramme(LUN + 3_000).etapesCreditees).toEqual(['e1']);
		expect(jourStocke().completions[0]).toMatchObject({ ref: LISTE_B, dureeMs: 1_000 });
	});
	it('étape inconnue : marqueur sans effet, l’attribution reste possible', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('zzz', LUN);
		expect(jourStocke().pending).toBeNull();
		poserActivite('sprint', LUN + 1_000);
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual(['e1']);
	});
});

/* ============================================================
   7) Le JOUR DE LA MISE À JOUR : état du jour écrit avant #498

   Le curseur d'attribution est une nouveauté : un état du jour déjà en place quand
   l'appli se met à jour n'en a pas. Sans reprise, `resoudreProgramme` repart de zéro
   (« depuis toujours ») et rend créditable TOUT le journal d'activité — un sprint joué
   trois semaines plus tôt satisferait l'étape « Sprint 5 min » du jour (ce mode ne
   regarde que le type), jusqu'à faire fêter un programme auquel l'enfant n'a pas touché.
   Contrat visé : à la première lecture, l'état hérité prend un curseur « maintenant »,
   une fois pour toutes. Prix assumé : le travail fait aujourd'hui AVANT la mise à jour
   n'est pas rattrapé — mieux vaut ne rien créditer que de tout créditer.
   ============================================================ */
describe('état du jour hérité (sans curseur d’attribution)', () => {
	it('l’historique du profil ne devient PAS créditable : rien n’est crédité ni célébré', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		// Le journal d'activité du profil, tel qu'il existe déjà au moment de la mise à jour.
		poserActivite('sprint', LUN - 21 * JOURS); // sprint d'il y a trois semaines
		poserActivite('revision', LUN - 5 * JOURS);
		poserActivite('lecon', LUN - 1 * JOURS, LECON_A); // hier
		poserJourHerite();

		const r = resoudreProgramme(LUN + 10_000); // 1er retour à l'accueil après la mise à jour
		expect(r).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(jourStocke().faits).toEqual({});
		expect(jourStocke().completions).toEqual([]);
		expect(jourStocke().complete).toBe(false);
		expect(seancesCompletees()).toBe(0); // ni fête, ni trophée
	});

	it('témoin : la même journée avec un curseur permissif crédite bel et bien l’historique', () => {
		// Contrôle de la portée du test précédent : le montage (définition + journal + étape)
		// est parfaitement capable de créditer. C'est donc bien la reprise du curseur qui
		// protège l'enfant, et non un détail du montage qui masquerait le défaut.
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		poserActivite('sprint', LUN - 21 * JOURS);
		poserJourHerite({ vuTs: LUN - 30 * JOURS }); // curseur antérieur au vieux sprint
		expect(resoudreProgramme(LUN + 10_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
	});

	it('le travail d’aujourd’hui d’AVANT la mise à jour n’est pas rattrapé (prix assumé)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		poserActivite('sprint', LUN + 5_000); // fait ce matin, sur l'ancienne version
		poserJourHerite();
		expect(resoudreProgramme(LUN + 10_000)).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(jourStocke().faits).toEqual({});
	});

	it('le curseur posé à la reprise est PERSISTÉ : une seconde lecture ne repart pas de zéro', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		poserActivite('sprint', LUN - 21 * JOURS);
		poserJourHerite();

		etatSeanceJour(LUN + 10_000); // 1re lecture : le curseur naît ici…
		expect(jourStocke().vuTs).toBe(LUN + 10_000); // … et il est écrit dans le stockage
		// Lectures suivantes : le curseur ne bouge plus (sinon il sauterait en continu le
		// travail de la journée, et l'enfant ne verrait jamais son programme avancer).
		etatSeanceJour(LUN + 60_000);
		etatSeanceJour(LUN + 120_000);
		expect(jourStocke().vuTs).toBe(LUN + 10_000);
		expect(resoudreProgramme(LUN + 130_000).etapesCreditees).toEqual([]);
	});

	it('un curseur nul (état bricolé / partiellement écrit) est repris de la même façon', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		poserActivite('sprint', LUN - 21 * JOURS);
		poserJourHerite({ vuTs: null });
		expect(resoudreProgramme(LUN + 10_000).etapesCreditees).toEqual([]);
		expect(jourStocke().vuTs).toBe(LUN + 10_000);
	});

	it('l’attribution n’est pas gelée pour la journée : ce qui suit la reprise crédite normalement', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		poserActivite('sprint', LUN + 5_000); // avant la mise à jour → perdu
		poserJourHerite();
		expect(resoudreProgramme(LUN + 10_000).etapesCreditees).toEqual([]);

		poserActivite('sprint', LUN + 20_000); // sprint fait APRÈS la mise à jour
		expect(resoudreProgramme(LUN + 30_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
		expect(jourStocke().faits.e1).toBe(1);
		expect(seancesCompletees()).toBe(1);
	});

	it('la reprise n’efface pas le travail DÉJÀ enregistré dans la journée', () => {
		// Un « ×2 » à moitié fait avant la mise à jour doit rester à moitié fait : la reprise
		// ajoute un curseur, elle ne recrée pas l'état du jour.
		poserDefs([defLundi([etape('e1', 'sprint', 2)])]);
		poserJourHerite({
			faits: { e1: 1 },
			completions: [{ etapeId: 'e1', kind: 'sprint', ts: LUN + 1_000, dureeMs: 300_000 }],
			debutTs: LUN + 1_000,
		});
		const j = etatSeanceJour(LUN + 10_000)!;
		expect(j.faits).toEqual({ e1: 1 });
		expect(j.completions).toHaveLength(1);
		expect(j.debutTs).toBe(LUN + 1_000);
		expect(j.vuTs).toBe(LUN + 10_000);
		// Le second passage, fait après la mise à jour, achève le programme.
		poserActivite('sprint', LUN + 20_000);
		expect(resoudreProgramme(LUN + 30_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
		expect(jourStocke().faits.e1).toBe(2);
	});

	it('un curseur DÉJÀ présent n’est jamais écrasé par la reprise', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		ouvrirJour(LUN); // état créé par la version courante : curseur à sa naissance
		expect(jourStocke().vuTs).toBe(LUN);
		etatSeanceJour(LUN + 60_000);
		expect(jourStocke().vuTs).toBe(LUN); // relecture plus tard : inchangé
		// Le curseur suit le JOURNAL (dernière session examinée), pas l'horloge de lecture.
		poserActivite('sprint', LUN + 70_000);
		resoudreProgramme(LUN + 80_000);
		expect(jourStocke().vuTs).toBe(LUN + 70_000);
		etatSeanceJour(LUN + 90_000);
		expect(jourStocke().vuTs).toBe(LUN + 70_000);
	});

	it('état hérité PÉRIMÉ (jour précédent) : remplacé, et l’historique reste non créditable', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		poserJourHerite({
			date: dateStrDe(LUN - 1 * JOURS), // dimanche : l'état d'hier, sans curseur
			faits: { e1: 1 },
			completions: [{ etapeId: 'e1', kind: 'sprint', ts: LUN - 20_000, dureeMs: 60_000 }],
		});
		poserActivite('sprint', LUN - 10_000); // le sprint d'hier soir
		expect(resoudreProgramme(LUN + 10_000)).toEqual({ etapesCreditees: [], justCompleted: false });
		const j = jourStocke();
		expect(j.date).toBe(dateStrDe(LUN)); // état du jour recréé
		expect(j.faits).toEqual({}); // le travail d'hier ne suit pas
		expect(j.vuTs).toBe(LUN + 10_000);
	});
});
