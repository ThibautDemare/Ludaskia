/* ============================================================
   Séance du jour (#440) — logique pure + stockage (src/core/seance.ts).
   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés
   de la spec (récurrence, reset paresseux à minuit, attribution via le journal
   d'activité, métriques de temps), jamais recopiés de l'implémentation.

   Repères calendaires (heure LOCALE, vérifiés indépendamment) :
     2026-01-03 = samedi (ISO 6), 2026-01-04 = dimanche (ISO 7),
     2026-01-05 = lundi  (ISO 1), 2026-01-06 = mardi   (ISO 2),
     2026-01-07 = mercredi (ISO 3).
   On construit les instants via `new Date(2026, 0, j).getTime()` (mois 0-based)
   pour rester en heure locale et maîtriser la frontière de minuit.
   ============================================================ */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
	dateStrDe,
	isoJourSemaine,
	defApplicable,
	recurrencesEnConflit,
	estimationDureeMin,
	genEtapeId,
	genDefId,
	chargerSeancesFor,
	enregistrerSeancesFor,
	copierSeances,
	etatSeanceJour,
	marquerEtapeLancee,
	resoudrePending,
	seancesCompletees,
	vueSeanceDuJour,
	chargerJournalSeances,
	SEANCE_KEY,
	SEANCE_JOUR_KEY,
	SEANCE_JOURNAL_KEY,
	type SeanceDef,
	type SeanceEtape,
	type SeanceJour,
	type SeanceModeKind,
	type SeanceRealisation,
} from '../src/core/seance';
import {
	initProfiles,
	activeProfile,
	addProfile,
	loadProfilesMeta,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSet } from '../src/core/storage';
import { ACTIVITY_KEY, type ActivityKind } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});
afterEach(() => {
	vi.restoreAllMocks(); // certains tests mockent Date.now (bump updatedAt)
});

/* ---------- Instants de référence (heure locale) ---------- */
const LUN = new Date(2026, 0, 5).getTime(); // lundi, ISO 1
const MAR = new Date(2026, 0, 6).getTime(); // mardi, ISO 2
const MER = new Date(2026, 0, 7).getTime(); // mercredi, ISO 3

/* ---------- Fabriques ---------- */
function etape(id: string, kind: SeanceModeKind, count = 1, ref?: string): SeanceEtape {
	return ref === undefined ? { id, kind, count } : { id, kind, count, ref };
}
function defHebdo(id: string, jours: number[], etapes: SeanceEtape[] = []): SeanceDef {
	return { id, etapes, recurrence: { type: 'hebdo', jours } };
}
function defDate(id: string, date: string, etapes: SeanceEtape[] = []): SeanceDef {
	return { id, etapes, recurrence: { type: 'date', date } };
}

/* ---------- Accès profil / stockage (via l'API du module) ---------- */
/** Installe les définitions sur le profil ACTIF (que les fonctions d'état lisent). */
function poserDefs(defs: SeanceDef[]): string {
	const uuid = activeProfile().uuid;
	enregistrerSeancesFor(uuid, defs);
	return uuid;
}
/** Sème une entrée dans le journal d'activité (format `{t, k}` de core/progress),
 *  en maîtrisant l'horodatage pour tester `t >= launchTs`. */
function poserActivite(k: ActivityKind, t: number): void {
	const a: { t: number; k: ActivityKind }[] = lsGet(ACTIVITY_KEY, []);
	a.push({ t, k });
	lsSet(ACTIVITY_KEY, a);
}
/** Lit l'état du jour PERSISTÉ (clé documentée), pour inspecter debutTs / pending. */
function jourStocke(): SeanceJour | null {
	return lsGet(SEANCE_JOUR_KEY, null);
}
function profilUpdatedAt(uuid: string): number {
	return loadProfilesMeta()!.list.find((p) => p.uuid === uuid)!.updatedAt;
}

/* ============================================================ */
describe('dateStrDe / isoJourSemaine', () => {
	it('dateStrDe : YYYY-MM-DD en heure locale, zéro-paddé', () => {
		expect(dateStrDe(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
		expect(dateStrDe(new Date(2026, 6, 22).getTime())).toBe('2026-07-22');
		expect(dateStrDe(new Date(2026, 11, 31).getTime())).toBe('2026-12-31');
		// Tard dans la journée : toujours la même date locale (pas de bascule UTC).
		expect(dateStrDe(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
	});
	it('isoJourSemaine : 1=lundi … 7=dimanche (dimanche renvoie 7, pas 0)', () => {
		expect(isoJourSemaine(new Date(2026, 0, 5).getTime())).toBe(1); // lundi
		expect(isoJourSemaine(new Date(2026, 0, 6).getTime())).toBe(2); // mardi
		expect(isoJourSemaine(new Date(2026, 0, 3).getTime())).toBe(6); // samedi
		expect(isoJourSemaine(new Date(2026, 0, 4).getTime())).toBe(7); // dimanche
	});
});

describe('defApplicable', () => {
	it('une DATE d’aujourd’hui l’emporte sur une hebdo du même jour (ordre indifférent)', () => {
		const h = defHebdo('dh', [1]); // lundi
		const d = defDate('dd', '2026-01-05'); // le lundi 5 janvier
		expect(defApplicable([h, d], LUN)!.id).toBe('dd');
		expect(defApplicable([d, h], LUN)!.id).toBe('dd');
	});
	it('hebdo : s’applique le bon jour, sinon rien', () => {
		const d = defHebdo('d1', [1, 3, 5]);
		expect(defApplicable([d], LUN)!.id).toBe('d1'); // lundi ISO 1 ∈
		expect(defApplicable([d], MER)!.id).toBe('d1'); // mercredi ISO 3 ∈
		expect(defApplicable([d], MAR)).toBeNull(); // mardi ISO 2 ∉
	});
	it('date : ne s’applique QUE le jour exact', () => {
		const d = defDate('d1', '2026-01-05');
		expect(defApplicable([d], LUN)!.id).toBe('d1');
		expect(defApplicable([d], MAR)).toBeNull();
	});
	it('aucune définition → null', () => {
		expect(defApplicable([], LUN)).toBeNull();
	});
});

describe('recurrencesEnConflit', () => {
	it('deux dates : conflit ssi identiques', () => {
		expect(
			recurrencesEnConflit(
				{ type: 'date', date: '2026-01-05' },
				{ type: 'date', date: '2026-01-05' },
			),
		).toBe(true);
		expect(
			recurrencesEnConflit(
				{ type: 'date', date: '2026-01-05' },
				{ type: 'date', date: '2026-01-06' },
			),
		).toBe(false);
	});
	it('deux hebdo : conflit ssi jours qui se chevauchent', () => {
		expect(
			recurrencesEnConflit({ type: 'hebdo', jours: [1, 2, 3] }, { type: 'hebdo', jours: [3, 4] }),
		).toBe(true);
		expect(
			recurrencesEnConflit({ type: 'hebdo', jours: [1, 2] }, { type: 'hebdo', jours: [3, 4] }),
		).toBe(false);
	});
	it('date vs hebdo : jamais de conflit dur (la date l’emporte)', () => {
		expect(
			recurrencesEnConflit({ type: 'date', date: '2026-01-05' }, { type: 'hebdo', jours: [1] }),
		).toBe(false);
		expect(
			recurrencesEnConflit({ type: 'hebdo', jours: [1] }, { type: 'date', date: '2026-01-05' }),
		).toBe(false);
	});
});

describe('estimationDureeMin', () => {
	// Durées documentées (spec #440) : sprint 5, revision 8, leconDuJour 7, lecon 7, dictee 10.
	it('somme des count × durée du mode', () => {
		expect(
			estimationDureeMin(defHebdo('d1', [1], [etape('e1', 'sprint', 2), etape('e2', 'dictee', 3)])),
		).toBe(
			2 * 5 + 3 * 10, // 40
		);
		expect(
			estimationDureeMin(
				defHebdo('d2', [1], [etape('e1', 'revision', 1), etape('e2', 'lecon', 2)]),
			),
		).toBe(
			8 + 2 * 7, // 22
		);
	});
	it('additive sur les étapes et linéaire en count (structure de la formule)', () => {
		const un = defHebdo('d', [1], [etape('e1', 'sprint', 1)]);
		const trois = defHebdo('d', [1], [etape('e1', 'sprint', 3)]);
		const dictee = defHebdo('d', [1], [etape('e1', 'dictee', 1)]);
		const mix = defHebdo('d', [1], [etape('e1', 'sprint', 3), etape('e2', 'dictee', 1)]);
		expect(estimationDureeMin(trois)).toBe(3 * estimationDureeMin(un)); // linéaire en count
		expect(estimationDureeMin(mix)).toBe(estimationDureeMin(trois) + estimationDureeMin(dictee)); // additive
	});
	it('un count < 1 compte pour 1', () => {
		expect(estimationDureeMin(defHebdo('d1', [1], [etape('e1', 'sprint', 0)]))).toBe(5);
	});
});

describe('genEtapeId / genDefId (ids neufs, robustes aux trous)', () => {
	const defAvecEtapes = (ids: string[]): SeanceDef =>
		defHebdo(
			'd1',
			[1],
			ids.map((id) => etape(id, 'sprint')),
		);
	it('def vide → e1 ; incrémente au-delà du max', () => {
		expect(genEtapeId(defAvecEtapes([]))).toBe('e1');
		expect(genEtapeId(defAvecEtapes(['e1', 'e2']))).toBe('e3');
	});
	it('trou au milieu (e2 supprimée) → prochain id sans collision', () => {
		const neuf = genEtapeId(defAvecEtapes(['e1', 'e3']));
		expect(neuf).toBe('e4');
		expect(['e1', 'e3']).not.toContain(neuf);
	});
	it('ignore les ids hors motif', () => {
		expect(genEtapeId(defAvecEtapes(['x', 'autre']))).toBe('e1');
	});
	it('genDefId : d1 sur liste vide, robuste aux trous', () => {
		expect(genDefId([])).toBe('d1');
		expect(genDefId([defHebdo('d1', [1]), defHebdo('d3', [1])])).toBe('d4');
	});
});

describe('chargerSeancesFor / enregistrerSeancesFor / copierSeances', () => {
	it('round-trip sous la clé <uuid>/ludaskia_seance', () => {
		const uuid = activeProfile().uuid;
		const defs = [defHebdo('d1', [1], [etape('e1', 'sprint')])];
		enregistrerSeancesFor(uuid, defs);
		expect(chargerSeancesFor(uuid)).toEqual(defs);
		expect(localStorage.getItem(uuid + '/' + SEANCE_KEY)).not.toBeNull();
	});
	it('profil sans séances → tableau vide', () => {
		expect(chargerSeancesFor(activeProfile().uuid)).toEqual([]);
	});
	it('enregistrerSeancesFor bumpe updatedAt du profil visé', () => {
		const uuid = activeProfile().uuid;
		const avant = profilUpdatedAt(uuid);
		const t = avant + 10_000;
		vi.spyOn(Date, 'now').mockReturnValue(t); // touchProfile date via Date.now()
		enregistrerSeancesFor(uuid, []);
		expect(profilUpdatedAt(uuid)).toBe(t);
		expect(profilUpdatedAt(uuid)).toBeGreaterThan(avant);
	});
	it('copierSeances recopie de la source et écrase la cible', () => {
		const a = activeProfile();
		const b = addProfile('Profil B'); // devient actif (sans importance : accès par UUID)
		const defsA = [defHebdo('d1', [1], [etape('e1', 'sprint')])];
		enregistrerSeancesFor(a.uuid, defsA);
		enregistrerSeancesFor(b.uuid, [defDate('d9', '2026-02-02', [etape('e1', 'dictee')])]);
		copierSeances(a.uuid, b.uuid);
		expect(chargerSeancesFor(b.uuid)).toEqual(defsA); // cible écrasée par la source
	});
	it('copierSeances : no-op si source == cible (aucune écriture)', () => {
		const uuid = activeProfile().uuid;
		const defsA = [defHebdo('d1', [1])];
		enregistrerSeancesFor(uuid, defsA);
		const t0 = profilUpdatedAt(uuid);
		vi.spyOn(Date, 'now').mockReturnValue(t0 + 50_000);
		copierSeances(uuid, uuid);
		expect(chargerSeancesFor(uuid)).toEqual(defsA);
		expect(profilUpdatedAt(uuid)).toBe(t0); // pas de bump → confirme le no-op
	});
});

describe('etatSeanceJour (reset paresseux)', () => {
	it('aucune séance applicable → null', () => {
		poserDefs([]);
		expect(etatSeanceJour(LUN)).toBeNull();
	});
	it('séance applicable → état vierge du jour', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint')])]);
		const j = etatSeanceJour(LUN)!;
		expect(j.date).toBe('2026-01-05');
		expect(j.defId).toBe('d1');
		expect(j.faits).toEqual({});
		expect(j.completions).toEqual([]);
		expect(j.complete).toBe(false);
	});
	it('état FRAIS (même date + defId) : renvoyé tel quel, faits conservés', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 2)])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('sprint', LUN + 100);
		resoudrePending(LUN + 200);
		expect(etatSeanceJour(LUN)!.faits.e1).toBe(1);
		expect(etatSeanceJour(LUN)!.faits.e1).toBe(1); // relecture même jour → inchangé
	});
	it('changement de JOUR : faits remis à zéro (le cumul, lui, est conservé)', () => {
		poserDefs([defHebdo('d1', [1, 2], [etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('sprint', LUN + 100);
		resoudrePending(LUN + 200);
		expect(etatSeanceJour(LUN)!.faits.e1).toBe(1);
		expect(seancesCompletees()).toBe(1);
		// Lendemain (mardi, même def car hebdo [1,2]) : état périmé → reset.
		const j2 = etatSeanceJour(MAR)!;
		expect(j2.date).toBe('2026-01-06');
		expect(j2.faits).toEqual({});
		expect(j2.complete).toBe(false);
		expect(seancesCompletees()).toBe(1); // cumul jamais remis à zéro
	});
	it('changement de DÉFINITION le même jour (defId différent) → reset', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('sprint', LUN + 100);
		resoudrePending(LUN + 200);
		expect(jourStocke()!.faits.e1).toBe(1);
		// L'adulte remplace la séance du lundi (id différent).
		poserDefs([defHebdo('d2', [1], [etape('e1', 'revision', 1)])]);
		const j = etatSeanceJour(LUN)!;
		expect(j.defId).toBe('d2');
		expect(j.faits).toEqual({});
	});
});

describe('marquerEtapeLancee', () => {
	it('pose pending {etapeId, kind, launchTs} et fixe debutTs au 1er appel seulement', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint'), etape('e2', 'revision')])]);
		marquerEtapeLancee('e1', LUN);
		const j1 = jourStocke()!;
		expect(j1.pending).toEqual({ etapeId: 'e1', kind: 'sprint', launchTs: LUN });
		expect(j1.debutTs).toBe(LUN);
		// 2e lancement : pending remplacé, debutTs NE bouge PAS (span de la séance).
		marquerEtapeLancee('e2', LUN + 5000);
		const j2 = jourStocke()!;
		expect(j2.pending).toEqual({ etapeId: 'e2', kind: 'revision', launchTs: LUN + 5000 });
		expect(j2.debutTs).toBe(LUN);
	});
	it('sans effet si l’étape est inconnue', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint')])]);
		marquerEtapeLancee('zzz', LUN);
		expect(jourStocke()!.pending).toBeNull();
		expect(vueSeanceDuJour(LUN)!.pendingEtapeId).toBeNull();
	});
});

describe('resoudrePending (attribution via le journal d’activité)', () => {
	it('crédite l’étape si une activité du BON type existe depuis le lancement', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('sprint', LUN + 1000);
		const r = resoudrePending(LUN + 2000);
		expect(r).toEqual({ credited: true, etapeId: 'e1', justCompleted: true });
		expect(seancesCompletees()).toBe(1);
		const j = jourStocke()!;
		expect(j.faits.e1).toBe(1);
		expect(j.pending).toBeNull();
		expect(j.completions).toHaveLength(1);
		// dureeMs = t de l'activité - launchTs (1000), ts = celui du journal.
		expect(j.completions[0]).toMatchObject({
			etapeId: 'e1',
			kind: 'sprint',
			ts: LUN + 1000,
			dureeMs: 1000,
		});
	});
	it('abandon : AUCUNE activité depuis le lancement → pending effacé, rien crédité', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('e1', LUN);
		const r = resoudrePending(LUN + 5000);
		expect(r).toEqual({ credited: false, etapeId: null, justCompleted: false });
		const j = jourStocke()!;
		expect(j.faits).toEqual({});
		expect(j.pending).toBeNull();
		expect(seancesCompletees()).toBe(0);
	});
	it('activité d’un AUTRE type ne crédite pas', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('revision', LUN + 1000); // mauvais type (attendu : sprint)
		const r = resoudrePending(LUN + 2000);
		expect(r.credited).toBe(false);
		expect(jourStocke()!.faits).toEqual({});
	});
	it('activité ANTÉRIEURE au lancement ne crédite pas', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('e1', LUN + 10_000); // launchTs = LUN+10000
		poserActivite('sprint', LUN + 5_000); // AVANT le lancement
		const r = resoudrePending(LUN + 20_000);
		expect(r.credited).toBe(false);
		expect(jourStocke()!.faits).toEqual({});
	});
	it('sans marqueur : ne fait rien (idempotent)', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 1)])]);
		etatSeanceJour(LUN); // état frais, aucun pending
		expect(resoudrePending(LUN)).toEqual({ credited: false, etapeId: null, justCompleted: false });
		expect(seancesCompletees()).toBe(0);
	});
	it('étape demandée 2 fois : 2 complétions pour l’épuiser ; jamais de sur-crédit', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 2)])]);
		// 1re complétion : créditée mais séance pas terminée.
		marquerEtapeLancee('e1', LUN);
		poserActivite('sprint', LUN + 100);
		let r = resoudrePending(LUN + 200);
		expect(r.credited).toBe(true);
		expect(r.justCompleted).toBe(false);
		expect(jourStocke()!.faits.e1).toBe(1);
		expect(seancesCompletees()).toBe(0);
		// 2e complétion : épuise l'étape → séance complète.
		marquerEtapeLancee('e1', LUN + 1000);
		poserActivite('sprint', LUN + 1100);
		r = resoudrePending(LUN + 1200);
		expect(r.credited).toBe(true);
		expect(r.justCompleted).toBe(true);
		expect(jourStocke()!.faits.e1).toBe(2);
		expect(seancesCompletees()).toBe(1);
		// 3e passage : faits plafonné à count, cumul PAS incrémenté une 2e fois.
		marquerEtapeLancee('e1', LUN + 2000);
		poserActivite('sprint', LUN + 2100);
		r = resoudrePending(LUN + 2200);
		expect(jourStocke()!.faits.e1).toBe(2); // plafonné
		expect(r.justCompleted).toBe(false); // déjà complète auparavant
		expect(seancesCompletees()).toBe(1); // jamais 2 fois pour la même séance
	});
	it('justCompleted UNIQUEMENT quand TOUTES les étapes atteignent leur count', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 1), etape('e2', 'revision', 1)])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('sprint', LUN + 100);
		let r = resoudrePending(LUN + 200);
		expect(r.credited).toBe(true);
		expect(r.justCompleted).toBe(false); // e2 reste à faire
		expect(seancesCompletees()).toBe(0);
		marquerEtapeLancee('e2', LUN + 1000);
		poserActivite('revision', LUN + 1100);
		r = resoudrePending(LUN + 1200);
		expect(r.justCompleted).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});
	it("lecon ET leconDuJour créditent tous deux via l’activité 'lecon'", () => {
		// lecon (avec ref) → activité 'lecon'
		poserDefs([defHebdo('d1', [1], [etape('e1', 'lecon', 1, 'math-doubles')])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('lecon', LUN + 100);
		let r = resoudrePending(LUN + 200);
		expect(r.credited).toBe(true);
		expect(jourStocke()!.completions[0]).toMatchObject({ kind: 'lecon', ref: 'math-doubles' });
		// leconDuJour (mardi, def neuve) → mappe aussi sur 'lecon'
		poserDefs([defHebdo('d2', [2], [etape('e1', 'leconDuJour', 1)])]);
		marquerEtapeLancee('e1', MAR);
		poserActivite('lecon', MAR + 100);
		r = resoudrePending(MAR + 200);
		expect(r.credited).toBe(true);
		expect(jourStocke()!.completions[0]).toMatchObject({ kind: 'leconDuJour' });
	});
	it("type dictee : crédite via l’activité 'dictee' et reporte la ref (id de liste)", () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'dictee', 1, 'liste-ce2-01')])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('dictee', LUN + 1000);
		const r = resoudrePending(LUN + 2000);
		expect(r).toEqual({ credited: true, etapeId: 'e1', justCompleted: true });
		// La ref (id de liste d'orthographe) visée par l'étape est bien reportée dans la complétion.
		expect(jourStocke()!.completions[0]).toMatchObject({
			etapeId: 'e1',
			kind: 'dictee',
			ref: 'liste-ce2-01',
			dureeMs: 1000,
		});
	});
	it('attribution par TYPE, pas par RÉFÉRENCE : c’est l’étape PENDING qui est créditée', () => {
		// Deux étapes 'lecon' de ref différentes. Le journal d'activité ne porte QUE le type
		// ('lecon'), jamais l'id de leçon → resoudrePending crédite l'étape PENDING (celle que
		// l'enfant vient de lancer), quelle que soit la leçon réellement journalisée. C'est VOULU :
		// le flux garantit qu'un seul pending vit à la fois (retour obligatoire par l'accueil, qui
		// vide pending avant tout autre mode). Cf. docstring de resoudrePending, src/core/seance.ts.
		poserDefs([
			defHebdo(
				'd1',
				[1],
				[etape('e1', 'lecon', 1, 'math-doubles'), etape('e2', 'lecon', 1, 'math-complements')],
			),
		]);
		marquerEtapeLancee('e1', LUN); // on lance la 1re étape (ref math-doubles)
		poserActivite('lecon', LUN + 1000); // activité 'lecon' — le journal ne dit PAS quelle leçon
		const r = resoudrePending(LUN + 2000);
		expect(r.credited).toBe(true);
		expect(r.etapeId).toBe('e1'); // l'étape pending, pas e2
		const j = jourStocke()!;
		expect(j.faits.e1).toBe(1);
		expect(j.faits.e2 ?? 0).toBe(0); // e2 intacte
		expect(j.completions[0]).toMatchObject({ etapeId: 'e1', ref: 'math-doubles' });
	});
});

describe('vueSeanceDuJour', () => {
	it('null si aucune séance applicable aujourd’hui', () => {
		poserDefs([defHebdo('d1', [3], [etape('e1', 'sprint')])]); // mercredi
		expect(vueSeanceDuJour(LUN)).toBeNull(); // lundi
	});
	it('totalRequis/totalFait avec counts>1 ; l’étape épuisée sort des restantes', () => {
		poserDefs([defHebdo('d1', [1], [etape('e1', 'sprint', 2), etape('e2', 'revision', 3)])]);
		const v0 = vueSeanceDuJour(LUN)!;
		expect(v0.totalRequis).toBe(5); // 2 + 3
		expect(v0.totalFait).toBe(0);
		expect(v0.restantes.map((e) => e.etape.id)).toEqual(['e1', 'e2']);
		expect(v0.complete).toBe(false);
		// Épuise e1 (2 complétions).
		for (const dt of [0, 1000]) {
			marquerEtapeLancee('e1', LUN + dt);
			poserActivite('sprint', LUN + dt + 100);
			resoudrePending(LUN + dt + 200);
		}
		const v1 = vueSeanceDuJour(LUN)!;
		expect(v1.totalFait).toBe(2);
		expect(v1.etapes.find((e) => e.etape.id === 'e1')).toMatchObject({
			fait: 2,
			reste: 0,
			epuise: true,
		});
		expect(v1.restantes.map((e) => e.etape.id)).toEqual(['e2']); // e1 épuisée sort
		expect(v1.complete).toBe(false); // e2 reste
	});
});

describe('chargerJournalSeances (archivage au passage de minuit)', () => {
	it('séance COMPLÈTE d’hier archivée avec durées cohérentes', () => {
		poserDefs([defHebdo('d1', [1, 2], [etape('e1', 'sprint', 1)])]);
		marquerEtapeLancee('e1', LUN); // debutTs = LUN
		poserActivite('sprint', LUN + 60_000);
		resoudrePending(LUN + 90_000);
		expect(vueSeanceDuJour(LUN)!.complete).toBe(true);
		expect(chargerJournalSeances()).toHaveLength(0); // encore frais aujourd'hui
		// Lendemain : l'état périmé est archivé.
		vueSeanceDuJour(MAR);
		const journal = chargerJournalSeances();
		expect(journal).toHaveLength(1);
		expect(journal[0]).toMatchObject({
			date: '2026-01-05',
			defId: 'd1',
			complete: true,
			dureeActiveMs: 60_000, // somme des dureeMs (hit.t - launchTs)
			dureeTotaleMs: 60_000, // finTs - debutTs
		});
		expect(journal[0].etapes).toHaveLength(1);
	});
	it('séance PARTIELLE d’hier également archivée (complete=false)', () => {
		poserDefs([defHebdo('d1', [1, 2], [etape('e1', 'revision', 2)])]);
		marquerEtapeLancee('e1', LUN + 10_000); // debutTs = LUN+10000
		poserActivite('revision', LUN + 30_000);
		resoudrePending(LUN + 40_000); // 1/2 → non complète
		expect(vueSeanceDuJour(LUN)!.complete).toBe(false);
		expect(chargerJournalSeances()).toHaveLength(0);
		// Lendemain : la séance partielle est quand même capturée.
		vueSeanceDuJour(MAR);
		const journal = chargerJournalSeances();
		expect(journal).toHaveLength(1);
		expect(journal[0]).toMatchObject({
			complete: false,
			dureeActiveMs: 20_000, // 30000 - 10000
			dureeTotaleMs: 20_000, // fin (LUN+30000) - debut (LUN+10000)
		});
		expect(journal[0].etapes).toHaveLength(1);
	});
	it('bornage à JOURNAL_MAX (120) : FIFO, les plus anciennes réalisations sautent', () => {
		// On prépare une séance PARTIELLE aujourd'hui (1 complétion), qui sera archivée demain.
		poserDefs([defHebdo('d1', [1, 2], [etape('e1', 'revision', 2)])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('revision', LUN + 5_000);
		resoudrePending(LUN + 6_000); // 1/2 → séance partielle, archivable
		// Le journal est déjà PLEIN (120 réalisations plus anciennes, identifiables par defId).
		const anciennes: SeanceRealisation[] = Array.from({ length: 120 }, (_, i) => ({
			date: '2025-01-01',
			defId: 'old-' + i,
			etapes: [],
			complete: true,
			debutTs: i,
			finTs: i,
			dureeActiveMs: 0,
			dureeTotaleMs: 0,
		}));
		lsSet(SEANCE_JOURNAL_KEY, anciennes);
		// Passage de minuit → archivage de la séance d'hier = 121e entrée.
		vueSeanceDuJour(MAR);
		const journal = chargerJournalSeances();
		expect(journal).toHaveLength(120); // plafonné
		const ids = journal.map((r) => r.defId);
		expect(ids).not.toContain('old-0'); // la plus ancienne a sauté (FIFO)
		expect(ids).toContain('old-119'); // la plus récente des anciennes reste
		expect(journal[journal.length - 1].defId).toBe('d1'); // la nouvelle est en queue
	});
});
