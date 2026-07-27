/* ============================================================
   Étape CONDITIONNELLE « à revoir » du programme du jour (#464) — logique pure
   de src/core/seance.ts.

   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés du
   CONTRAT fonctionnel (une étape « à revoir » puise dans la file épinglée par
   l'encadrant ; elle n'existe dans le programme du jour que s'il y a quelque chose
   d'épinglé ; elle ne doit ni bloquer la complétion ni fabriquer un programme vide ;
   l'attribution suit le type RÉELLEMENT lancé, leçon OU dictée), jamais recopiés de
   l'implémentation.

   Ce qui est hors de ce fichier : la CONSTRUCTION du contexte (`ContexteSeance`) et
   le pool épinglé lui-même vivent côté UI (src/ui/seance.ts, dépend de la dispo du
   TTS et de `revoirActives`) → e2e ; les helpers d'id de file (`orthoRevoirId`,
   `isOrthoRevoirId`) sont couverts par tests/suivi-dictees-encadrant.test.ts. Ici on
   éprouve le cœur : étapes applicables, vue du jour, complétion, attribution, tirage.

   Repères calendaires (heure LOCALE, vérifiés indépendamment) :
     2026-01-05 = lundi (ISO 1), 2026-01-06 = mardi (ISO 2).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	SEANCE_MODE_INFOS,
	CONTEXTE_VIDE,
	etapeApplicable,
	etapesApplicables,
	ciblesEtape,
	countRequis,
	tirerParmi,
	tirerCible,
	estimationDureeMin,
	etatSeanceJour,
	vueSeanceDuJour,
	marquerEtapeLancee,
	resoudrePending,
	consoliderCompletion,
	seancesCompletees,
	chargerJournalSeances,
	chargerSeancesFor,
	enregistrerSeancesFor,
	SEANCE_KEY,
	SEANCE_JOUR_KEY,
	type ContexteSeance,
	type ResolutionSeance,
	type SeanceDef,
	type SeanceEtape,
	type SeanceJour,
	type SeanceModeKind,
} from '../src/core/seance';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSet, lsSetRaw } from '../src/core/storage';
import { ACTIVITY_KEY, type ActivityKind } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Instants de référence (heure locale) ---------- */
const LUN = new Date(2026, 0, 5).getTime(); // lundi, ISO 1
const MAR = new Date(2026, 0, 6).getTime(); // mardi, ISO 2

/* ---------- Contextes du jour ---------- */
const RIEN_EPINGLE: ContexteSeance = { aRevoir: 0 };
const epingle = (n: number): ContexteSeance => ({ aRevoir: n });

/* ---------- Fabriques ---------- */
function etape(id: string, kind: SeanceModeKind, count = 1, ref?: string): SeanceEtape {
	return ref === undefined ? { id, kind, count } : { id, kind, count, ref };
}
/** Séance appliquée le lundi seulement (tests d'une journée). */
function defLundi(etapes: SeanceEtape[], id = 'd1'): SeanceDef {
	return { id, etapes, recurrence: { type: 'hebdo', jours: [1] } };
}
/** Séance appliquée lundi ET mardi (tests du passage de minuit / archivage). */
function defLunMar(etapes: SeanceEtape[], id = 'd1'): SeanceDef {
	return { id, etapes, recurrence: { type: 'hebdo', jours: [1, 2] } };
}

/* ---------- Accès stockage (API du module + clés documentées) ---------- */
function poserDefs(defs: SeanceDef[]): void {
	enregistrerSeancesFor(activeProfile().uuid, defs);
}
/** Sème une entrée du journal d'activité (`{t, k}`, core/progress) à un instant maîtrisé. */
function poserActivite(k: ActivityKind, t: number): void {
	const a: { t: number; k: ActivityKind }[] = lsGet(ACTIVITY_KEY, []);
	a.push({ t, k });
	lsSet(ACTIVITY_KEY, a);
}
function jourStocke(): SeanceJour {
	return lsGet(SEANCE_JOUR_KEY, null) as SeanceJour;
}
/** Fil complet d'une réalisation : marqueur (cible + type réellement lancés) →
    activité journalisée → résolution avec le contexte du moment. */
function realiser(o: {
	etape: string;
	t: number;
	journalise: ActivityKind; // type d'activité effectivement enregistré par le runner
	ctx?: ContexteSeance;
	cible?: string; // cible tirée du pool (id de file : leçon, ou dictée préfixée)
	lance?: ActivityKind; // type mémorisé au lancement
}): ResolutionSeance {
	marquerEtapeLancee(o.etape, o.t, o.cible, o.lance);
	poserActivite(o.journalise, o.t + 100);
	return resoudrePending(o.t + 200, o.ctx ?? CONTEXTE_VIDE);
}

/* ============================================================
   1) Le mode `aRevoir` : un mode SANS cible configurée
   ============================================================ */
describe('mode aRevoir (métadonnées, #464)', () => {
	it('existe parmi les modes d’étape et n’a AUCUNE cible à configurer (ref: null)', () => {
		const kinds = Object.keys(SEANCE_MODE_INFOS) as SeanceModeKind[];
		expect(kinds).toContain('aRevoir');
		// Sa cible n'est pas configurée par l'adulte : elle est tirée au lancement dans la
		// file épinglée. À l'opposé des modes qui exigent une référence.
		expect(SEANCE_MODE_INFOS.aRevoir.ref).toBeNull();
		expect(SEANCE_MODE_INFOS.lecon.ref).toBe('lecon');
		expect(SEANCE_MODE_INFOS.dictee.ref).toBe('dictee');
	});
	it('porte un libellé et une durée exploitables par l’encadrant', () => {
		expect(SEANCE_MODE_INFOS.aRevoir.label.trim().length).toBeGreaterThan(0);
		expect(SEANCE_MODE_INFOS.aRevoir.dureeMin).toBeGreaterThanOrEqual(1);
	});
	it('son `activite` n’est qu’un DÉFAUT : une épinglée est une leçon ou une dictée', () => {
		expect(['lecon', 'dictee']).toContain(SEANCE_MODE_INFOS.aRevoir.activite);
	});
	it('une étape aRevoir n’a pas de cible dans la définition (ciblesEtape → [])', () => {
		expect(ciblesEtape(etape('e1', 'aRevoir'))).toEqual([]);
	});
	it('estimationDureeMin reste additive et linéaire (l’étape compte comme configurée)', () => {
		// Repère encadrant : l'estimation se lit à la CONFIGURATION, sans contexte du jour —
		// elle compte donc l'étape même si elle n'apparaîtra pas forcément.
		const seule = estimationDureeMin(defLundi([etape('e1', 'aRevoir', 1)]));
		const troisFois = estimationDureeMin(defLundi([etape('e1', 'aRevoir', 3)]));
		const sprint = estimationDureeMin(defLundi([etape('e1', 'sprint', 1)]));
		expect(seule).toBeGreaterThan(0);
		expect(troisFois).toBe(3 * seule);
		expect(estimationDureeMin(defLundi([etape('e1', 'sprint'), etape('e2', 'aRevoir', 3)]))).toBe(
			sprint + troisFois,
		);
	});
});

/* ============================================================
   2) etapeApplicable / etapesApplicables (helpers purs)
   ============================================================ */
describe('etapeApplicable (#464)', () => {
	it('aRevoir : applicable SSI quelque chose est épinglé', () => {
		const e = etape('e1', 'aRevoir');
		expect(etapeApplicable(e, epingle(0))).toBe(false);
		expect(etapeApplicable(e, epingle(1))).toBe(true); // borne basse du « il y a quelque chose »
		expect(etapeApplicable(e, epingle(12))).toBe(true);
	});
	it('aRevoir : un décompte NÉGATIF (état incohérent) vaut « rien d’épinglé »', () => {
		expect(etapeApplicable(etape('e1', 'aRevoir'), epingle(-1))).toBe(false);
	});
	it('CONTEXTE_VIDE = rien d’épinglé (défaut prudent)', () => {
		expect(CONTEXTE_VIDE.aRevoir).toBe(0);
		expect(etapeApplicable(etape('e1', 'aRevoir'), CONTEXTE_VIDE)).toBe(false);
	});
	it('les autres modes sont INCONDITIONNELS (quel que soit le contexte)', () => {
		const autres = (Object.keys(SEANCE_MODE_INFOS) as SeanceModeKind[]).filter(
			(k) => k !== 'aRevoir',
		);
		expect(autres.length).toBeGreaterThan(0);
		for (const k of autres) {
			expect(etapeApplicable(etape('e1', k), epingle(0))).toBe(true);
			expect(etapeApplicable(etape('e1', k), epingle(3))).toBe(true);
		}
	});
});

describe('etapesApplicables (#464)', () => {
	const def = defLundi([etape('e1', 'sprint'), etape('e2', 'aRevoir'), etape('e3', 'revision')]);
	it('rien d’épinglé : la conditionnelle saute, l’ORDRE des autres est préservé', () => {
		expect(etapesApplicables(def, epingle(0)).map((e) => e.id)).toEqual(['e1', 'e3']);
	});
	it('quelque chose d’épinglé : toutes les étapes, dans l’ordre de composition', () => {
		expect(etapesApplicables(def, epingle(2)).map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
	});
	it('définition faite d’une SEULE conditionnelle : [] quand rien n’est épinglé', () => {
		const seule = defLundi([etape('e1', 'aRevoir', 2)]);
		expect(etapesApplicables(seule, epingle(0))).toEqual([]);
		expect(etapesApplicables(seule, epingle(1)).map((e) => e.id)).toEqual(['e1']);
	});
	it('ne modifie PAS la définition (résultat détaché)', () => {
		const res = etapesApplicables(def, epingle(0));
		res.push(etape('zzz', 'sprint'));
		expect(def.etapes.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
	});
});

/* ============================================================
   3) vueSeanceDuJour : présence / absence de l'étape conditionnelle
   ============================================================ */
describe('vueSeanceDuJour avec une étape conditionnelle (#464)', () => {
	it('rien d’épinglé : l’étape disparaît de la vue et de totalRequis/totalFait', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 3)])]);
		const v = vueSeanceDuJour(LUN, RIEN_EPINGLE)!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']);
		expect(v.restantes.map((x) => x.etape.id)).toEqual(['e1']);
		expect(v.totalRequis).toBe(1); // le count 3 de l'étape escamotée ne compte pas
		expect(v.totalFait).toBe(0);
		expect(v.complete).toBe(false);
	});
	it('épinglées présentes : l’étape s’applique comme une autre, count compris', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 3)])]);
		const v = vueSeanceDuJour(LUN, epingle(2))!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1', 'e2']);
		expect(v.totalRequis).toBe(4); // 1 + 3, comme n'importe quelle étape à count 3
		expect(v.etapes[1]).toMatchObject({ fait: 0, reste: 3, epuise: false });
	});
	it('contexte OMIS = rien d’épinglé (défaut prudent, point de contrat)', () => {
		poserDefs([defLundi([etape('e1', 'sprint'), etape('e2', 'aRevoir')])]);
		const sansCtx = vueSeanceDuJour(LUN)!;
		expect(sansCtx.etapes.map((x) => x.etape.id)).toEqual(['e1']);
		expect(sansCtx.totalRequis).toBe(vueSeanceDuJour(LUN, RIEN_EPINGLE)!.totalRequis);
	});
	it('définition RÉDUITE à une conditionnelle non applicable → « pas de programme » (null)', () => {
		// Jamais un programme vide (0 étape) qui se dirait complété d'office.
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)).toBeNull();
		expect(vueSeanceDuJour(LUN)).toBeNull(); // idem sans contexte
		// Et rien n'a été célébré au passage.
		expect(seancesCompletees()).toBe(0);
		expect(jourStocke().complete).toBe(false);
	});
	it('la même définition RÉAPPARAÎT dès qu’une épinglée existe', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)).toBeNull();
		const v = vueSeanceDuJour(LUN, epingle(1))!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']);
		expect(v.totalRequis).toBe(2);
		expect(v.complete).toBe(false);
	});
	it('contexte qui va-et-vient : les FAITS de la journée sont conservés (aucun reset)', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		realiser({ etape: 'e1', t: LUN, journalise: 'lecon', ctx: epingle(2), cible: 'math-doubles' });
		expect(vueSeanceDuJour(LUN, epingle(2))!.etapes[0]).toMatchObject({ fait: 1, reste: 1 });
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)).toBeNull(); // plus rien d'épinglé → pas de programme
		// Retour d'une épinglée le même jour : la progression du matin est intacte.
		expect(vueSeanceDuJour(LUN, epingle(1))!.etapes[0]).toMatchObject({ fait: 1, reste: 1 });
	});
});

/* ============================================================
   4) Complétion : une conditionnelle non applicable ne BLOQUE pas le programme
   ============================================================ */
describe('complétion et étape conditionnelle (#464)', () => {
	it('rien d’épinglé : faire le reste SUFFIT à compléter (l’étape ne bloque pas)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		const r = realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE });
		expect(r).toEqual({ credited: true, etapeId: 'e1', justCompleted: true });
		expect(seancesCompletees()).toBe(1);
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)!.complete).toBe(true);
	});
	it('même état, mais une épinglée existe : le programme reste INCOMPLET', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		const r = realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: epingle(1) });
		expect(r).toMatchObject({ credited: true, justCompleted: false });
		expect(seancesCompletees()).toBe(0);
		const v = vueSeanceDuJour(LUN, epingle(1))!;
		expect(v.restantes.map((x) => x.etape.id)).toEqual(['e2']);
		expect(v).toMatchObject({ complete: false, totalRequis: 2, totalFait: 1 });
	});
	it('count 3 sur la conditionnelle : trois réalisations pour compléter', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 3)])]);
		const ctx = epingle(2);
		const res = [0, 1000, 2000].map((dt) =>
			realiser({
				etape: 'e1',
				t: LUN + dt,
				journalise: 'lecon',
				ctx,
				cible: 'math-doubles',
				lance: 'lecon',
			}),
		);
		expect(res.map((r) => r.justCompleted)).toEqual([false, false, true]);
		expect(jourStocke().faits.e1).toBe(3);
		expect(seancesCompletees()).toBe(1);
		expect(vueSeanceDuJour(LUN, ctx)!.complete).toBe(true);
	});
	it('AUCUNE étape applicable : une réalisation est créditée mais rien n’est célébré', () => {
		// Borne dure : la complétion se calcule sur les étapes applicables — sur une liste
		// VIDE, un « toutes faites » naïf serait vrai et célébrerait un programme sans contenu.
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		const r = realiser({ etape: 'e1', t: LUN, journalise: 'lecon', ctx: RIEN_EPINGLE });
		expect(r.credited).toBe(true); // l'étape existe dans la définition
		expect(r.justCompleted).toBe(false);
		expect(seancesCompletees()).toBe(0);
		expect(jourStocke().complete).toBe(false);
	});
});

/* ============================================================
   5) Le contexte CHANGE en cours de journée
   ============================================================ */
describe('contexte modifié en cours de journée (#464)', () => {
	it('une épinglée APPARAÎT après coup : le programme redevient incomplet, sans double célébration', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		// Matin : rien d'épinglé, le sprint suffit → programme complété + récompense.
		expect(
			realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE }).justCompleted,
		).toBe(true);
		expect(seancesCompletees()).toBe(1);
		expect(jourStocke().complete).toBe(true); // mémoire de la récompense donnée
		// Après-midi : l'adulte épingle une leçon → une étape apparaît, il reste à faire.
		const v = vueSeanceDuJour(LUN, epingle(1))!;
		expect(v.complete).toBe(false); // DÉRIVÉ (« plus rien à faire »), pas l'état stocké
		expect(v.restantes.map((x) => x.etape.id)).toEqual(['e2']);
		expect(v).toMatchObject({ totalRequis: 2, totalFait: 1 });
		// L'enfant fait l'étape « à revoir » : créditée, mais PAS de seconde célébration.
		const r = realiser({
			etape: 'e2',
			t: LUN + 10_000,
			journalise: 'lecon',
			ctx: epingle(1),
			cible: 'math-doubles',
			lance: 'lecon',
		});
		expect(r).toMatchObject({ credited: true, justCompleted: false });
		expect(seancesCompletees()).toBe(1); // jamais deux récompenses le même jour
		expect(jourStocke().complete).toBe(true);
		expect(vueSeanceDuJour(LUN, epingle(1))!.complete).toBe(true);
	});
	it('l’épinglée DISPARAÎT après le reste : la vue devient complète, LIRE ne récompense pas', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		// Matin : une épinglée existe, l'enfant ne fait que le sprint → incomplet.
		expect(
			realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: epingle(1) }).justCompleted,
		).toBe(false);
		expect(jourStocke().complete).toBe(false);
		// Soir : l'adulte désépingle (ou la notion redevient solide) → plus rien à faire.
		const v = vueSeanceDuJour(LUN, RIEN_EPINGLE)!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']);
		expect(v).toMatchObject({ complete: true, totalRequis: 1, totalFait: 1 });
		// La LECTURE de la vue reste sans effet de bord : elle dérive « plus rien à faire »
		// mais n'acte pas la récompense (sinon un simple rendu la déclencherait). C'est
		// `consoliderCompletion` qui l'acte, appelé par l'UI au retour vers l'accueil.
		expect(jourStocke().complete).toBe(false);
		expect(seancesCompletees()).toBe(0);
		expect(consoliderCompletion(LUN + 20_000, RIEN_EPINGLE)).toBe(true);
		expect(jourStocke().complete).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});
	it('MONOTONIE : une étape qui réapparaît puis avance ne fait pas redescendre la mémoire', () => {
		// Le programme a été récompensé avec l'étape escamotée ; elle réapparaît avec count 2.
		// Une résolution qui CRÉDITE sans tout finir ne doit pas remettre `complete` à false
		// (sinon la complétion suivante rendrait une 2e récompense le même jour).
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 2)])]);
		expect(
			realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE }).justCompleted,
		).toBe(true);
		expect(seancesCompletees()).toBe(1);
		// 1re des 2 réalisations de l'étape réapparue : créditée, programme encore ouvert à l'écran.
		const r1 = realiser({
			etape: 'e2',
			t: LUN + 10_000,
			journalise: 'lecon',
			ctx: epingle(1),
			cible: 'math-doubles',
			lance: 'lecon',
		});
		expect(r1).toMatchObject({ credited: true, justCompleted: false });
		expect(jourStocke()).toMatchObject({ complete: true }); // mémoire monotone
		expect(vueSeanceDuJour(LUN, epingle(1))!.complete).toBe(false); // 1/2 → il reste à faire
		// 2e réalisation : tout est fait, mais la récompense a déjà été donnée aujourd'hui.
		const r2 = realiser({
			etape: 'e2',
			t: LUN + 20_000,
			journalise: 'lecon',
			ctx: epingle(1),
			cible: 'math-doubles',
			lance: 'lecon',
		});
		expect(r2).toMatchObject({ credited: true, justCompleted: false });
		expect(seancesCompletees()).toBe(1); // une seule récompense sur la journée
		expect(vueSeanceDuJour(LUN, epingle(1))!.complete).toBe(true);
	});
	it('abandon alors que le programme était déjà récompensé : la mémoire n’est pas effacée', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE });
		expect(jourStocke().complete).toBe(true);
		// Une épinglée apparaît ; l'enfant lance l'étape puis abandonne (aucune activité).
		marquerEtapeLancee('e2', LUN + 5_000, 'math-doubles', 'lecon');
		const r = resoudrePending(LUN + 9_000, epingle(1));
		expect(r).toEqual({ credited: false, etapeId: null, justCompleted: false });
		const j = jourStocke();
		expect(j.pending).toBeNull();
		expect(j.faits.e2 ?? 0).toBe(0);
		expect(j.complete).toBe(true); // la récompense déjà donnée reste mémorisée
		expect(vueSeanceDuJour(LUN, epingle(1))!.complete).toBe(false); // mais il reste à faire
		expect(seancesCompletees()).toBe(1);
	});
	it('resoudrePending SANS contexte = rien d’épinglé (défaut prudent)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		marquerEtapeLancee('e1', LUN);
		poserActivite('sprint', LUN + 100);
		const r = resoudrePending(LUN + 200); // aucun 2e argument
		expect(r.justCompleted).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});
});

/* ============================================================
   5 bis) consoliderCompletion : acter la complétion SANS étape réalisée
   Contrat éprouvé : le programme peut se terminer parce que le CONTEXTE a escamoté la
   dernière étape restante (l'adulte désépingle, ou la notion redevient solide) — aucune
   étape n'est alors résolue, la récompense doit quand même être actée, UNE seule fois.
   ============================================================ */
describe('consoliderCompletion (#464)', () => {
	it('acte la complétion quand la DERNIÈRE étape restante est escamotée, et une seule fois', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: epingle(1) }); // 1/2 → incomplet
		expect(jourStocke().complete).toBe(false);
		expect(consoliderCompletion(LUN + 1_000, RIEN_EPINGLE)).toBe(true);
		expect(jourStocke().complete).toBe(true);
		expect(seancesCompletees()).toBe(1);
		// Idempotence : rappels (rendus successifs de l'accueil) sans nouvelle récompense.
		for (const dt of [2_000, 3_000, 4_000]) {
			expect(consoliderCompletion(LUN + dt, RIEN_EPINGLE)).toBe(false);
		}
		expect(seancesCompletees()).toBe(1);
	});
	it('n’invente aucune réalisation : faits, complétions et marqueur intacts', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: epingle(1) });
		// Une étape « à revoir » est même en cours au moment du désépinglage.
		marquerEtapeLancee('e2', LUN + 5_000, 'math-doubles', 'lecon');
		const avant = jourStocke();
		expect(consoliderCompletion(LUN + 6_000, RIEN_EPINGLE)).toBe(true);
		const apres = jourStocke();
		expect(apres.faits).toEqual(avant.faits);
		expect(apres.completions).toEqual(avant.completions); // 1 seule, celle du sprint
		expect(apres.pending).toEqual(avant.pending); // le marqueur en cours n'est pas consommé
		// Et l'étape lancée avant la consolidation reste attribuable au retour.
		poserActivite('lecon', LUN + 7_000);
		const r = resoudrePending(LUN + 8_000, RIEN_EPINGLE);
		expect(r).toMatchObject({ credited: true, etapeId: 'e2', justCompleted: false });
		expect(seancesCompletees()).toBe(1);
	});
	it('ne fait RIEN s’il reste à faire (étape inconditionnelle ou conditionnelle applicable)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'revision', 1)])]);
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE });
		expect(consoliderCompletion(LUN + 1_000, RIEN_EPINGLE)).toBe(false); // e2 reste
		expect(jourStocke().complete).toBe(false);
		expect(seancesCompletees()).toBe(0);
		// Même chose avec une conditionnelle qui, elle, s'applique toujours.
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)], 'd2')]);
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: epingle(1) });
		expect(consoliderCompletion(LUN + 2_000, epingle(1))).toBe(false);
		expect(seancesCompletees()).toBe(0);
	});
	it('ne fait rien si la récompense a DÉJÀ été donnée par resoudrePending', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		expect(
			realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE }).justCompleted,
		).toBe(true);
		expect(consoliderCompletion(LUN + 1_000, RIEN_EPINGLE)).toBe(false);
		expect(consoliderCompletion(LUN + 2_000, epingle(1))).toBe(false); // ni avec un autre contexte
		expect(seancesCompletees()).toBe(1);
	});
	it('ne fait rien quand AUCUNE étape n’est applicable, même après de l’activité', () => {
		// Programme réduit à une conditionnelle escamotée : il n'y a rien à célébrer, même si
		// l'enfant l'avait travaillée le matin (borne : « toutes faites » sur une liste vide).
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		expect(consoliderCompletion(LUN, RIEN_EPINGLE)).toBe(false); // aucune activité
		realiser({
			etape: 'e1',
			t: LUN + 1_000,
			journalise: 'lecon',
			ctx: epingle(1),
			cible: 'math-doubles',
			lance: 'lecon',
		}); // 1/2
		expect(consoliderCompletion(LUN + 2_000, RIEN_EPINGLE)).toBe(false);
		expect(jourStocke().complete).toBe(false);
		expect(seancesCompletees()).toBe(0);
	});
	it('ne fait rien quand aucun programme ne s’applique aujourd’hui', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]); // lundi seulement
		expect(consoliderCompletion(MAR, RIEN_EPINGLE)).toBe(false);
		expect(consoliderCompletion(MAR, epingle(2))).toBe(false);
		expect(seancesCompletees()).toBe(0);
	});
	it('contexte OMIS = rien d’épinglé (défaut prudent, dans les deux sens)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		// Rien de fait : le sprint reste dû → aucune consolidation.
		expect(consoliderCompletion(LUN)).toBe(false);
		// Sprint fait : l'étape conditionnelle est escamotée par le défaut → consolidation.
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: epingle(1) });
		expect(consoliderCompletion(LUN + 1_000)).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});
	it('AUCUNE double récompense — ordre resoudrePending → consoliderCompletion', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		expect(
			realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE }).justCompleted,
		).toBe(true);
		for (const ctx of [RIEN_EPINGLE, epingle(1), epingle(5)]) {
			expect(consoliderCompletion(LUN + 5_000, ctx)).toBe(false);
		}
		expect(seancesCompletees()).toBe(1);
	});
	it('AUCUNE double récompense — ordre consoliderCompletion → resoudrePending', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		// Sprint fait avec une épinglée en attente → incomplet, puis désépinglage : consolidation.
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: epingle(1) });
		expect(consoliderCompletion(LUN + 1_000, RIEN_EPINGLE)).toBe(true);
		expect(seancesCompletees()).toBe(1);
		// L'épinglée revient et l'enfant la fait : créditée, sans seconde célébration.
		const r = realiser({
			etape: 'e2',
			t: LUN + 10_000,
			journalise: 'lecon',
			ctx: epingle(1),
			cible: 'math-doubles',
			lance: 'lecon',
		});
		expect(r).toMatchObject({ credited: true, justCompleted: false });
		expect(seancesCompletees()).toBe(1);
		expect(consoliderCompletion(LUN + 11_000, epingle(1))).toBe(false);
		expect(seancesCompletees()).toBe(1);
	});
});

/* ============================================================
   6) Attribution : le type RÉELLEMENT lancé (leçon OU dictée)
   ============================================================ */
describe('attribution d’une étape « à revoir » (#464)', () => {
	it('marquerEtapeLancee mémorise cible ET type lancés', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		marquerEtapeLancee('e1', LUN, 'ortho:fr-ortho-invariables-1', 'dictee');
		expect(jourStocke().pending).toEqual({
			etapeId: 'e1',
			kind: 'aRevoir',
			launchTs: LUN,
			ref: 'ortho:fr-ortho-invariables-1',
			activite: 'dictee',
		});
	});
	it('épinglée = DICTÉE : une activité « leçon » ne crédite pas', () => {
		// Sans mémorisation du type lancé, le type du MODE ('lecon') créditerait à tort :
		// c'est exactement le piège que `activite` doit fermer.
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		const r = realiser({
			etape: 'e1',
			t: LUN,
			journalise: 'lecon', // l'enfant a fait AUTRE chose qu'une dictée
			ctx: epingle(1),
			cible: 'ortho:fr-ortho-invariables-1',
			lance: 'dictee',
		});
		expect(r.credited).toBe(false);
		expect(jourStocke().faits).toEqual({});
	});
	it('épinglée = DICTÉE : une activité « dictée » crédite, la cible tirée est conservée', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		const r = realiser({
			etape: 'e1',
			t: LUN,
			journalise: 'dictee',
			ctx: epingle(3),
			cible: 'ortho:fr-ortho-invariables-1',
			lance: 'dictee',
		});
		expect(r).toEqual({ credited: true, etapeId: 'e1', justCompleted: true });
		expect(jourStocke().completions[0]).toMatchObject({
			etapeId: 'e1',
			kind: 'aRevoir',
			ref: 'ortho:fr-ortho-invariables-1', // la cible VUE, pour la métrique
			ts: LUN + 100,
			dureeMs: 100,
		});
	});
	it('épinglée = LEÇON : crédit par l’activité « leçon », pas par « dictée »', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		// 1) mauvais type journalisé → pas de crédit.
		expect(
			realiser({
				etape: 'e1',
				t: LUN,
				journalise: 'dictee',
				ctx: epingle(2),
				cible: 'math-doubles',
				lance: 'lecon',
			}).credited,
		).toBe(false);
		// 2) bon type → crédit, avec l'id de leçon tiré comme cible.
		const r = realiser({
			etape: 'e1',
			t: LUN + 10_000,
			journalise: 'lecon',
			ctx: epingle(2),
			cible: 'math-doubles',
			lance: 'lecon',
		});
		expect(r.credited).toBe(true);
		expect(jourStocke().completions[0]).toMatchObject({
			kind: 'aRevoir',
			ref: 'math-doubles',
		});
	});
	it('deux réalisations, deux natures : chaque complétion garde SA cible', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		const ctx = epingle(2);
		realiser({
			etape: 'e1',
			t: LUN,
			journalise: 'lecon',
			ctx,
			cible: 'math-doubles',
			lance: 'lecon',
		});
		const r = realiser({
			etape: 'e1',
			t: LUN + 10_000,
			journalise: 'dictee',
			ctx,
			cible: 'ortho:fr-ortho-invariables-1',
			lance: 'dictee',
		});
		expect(r.justCompleted).toBe(true);
		expect(jourStocke().completions.map((c) => c.ref)).toEqual([
			'math-doubles',
			'ortho:fr-ortho-invariables-1',
		]);
	});
	it('marqueur PERSISTÉ sans `activite` (rétrocompat) : repli sur le type du mode', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		// Simule un marqueur écrit par une version antérieure : ni `activite`, ni cible.
		const j = etatSeanceJour(LUN)!;
		j.pending = { etapeId: 'e1', kind: 'aRevoir', launchTs: LUN };
		j.debutTs = LUN;
		lsSet(SEANCE_JOUR_KEY, j);
		poserActivite(SEANCE_MODE_INFOS.aRevoir.activite, LUN + 500);
		const r = resoudrePending(LUN + 600, epingle(1));
		expect(r).toEqual({ credited: true, etapeId: 'e1', justCompleted: true });
		const comp = jourStocke().completions[0];
		expect(comp).toMatchObject({ etapeId: 'e1', kind: 'aRevoir', dureeMs: 500 });
		expect(comp.ref).toBeUndefined(); // aucune cible mémorisée, l'étape n'en configure pas
	});
	it('l’étape « à revoir » ne contamine pas les autres étapes du programme', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1), etape('e2', 'lecon', 1, 'math-complements')])]);
		const ctx = epingle(1);
		// L'enfant fait l'étape épinglée (une dictée) : seule elle est créditée.
		realiser({
			etape: 'e1',
			t: LUN,
			journalise: 'dictee',
			ctx,
			cible: 'ortho:fr-ortho-invariables-1',
			lance: 'dictee',
		});
		let j = jourStocke();
		expect(j.faits.e1).toBe(1);
		expect(j.faits.e2 ?? 0).toBe(0);
		// Puis la leçon configurée : créditée avec SA propre référence.
		const r = realiser({ etape: 'e2', t: LUN + 10_000, journalise: 'lecon', ctx });
		expect(r.justCompleted).toBe(true);
		j = jourStocke();
		expect(j.completions.map((c) => [c.etapeId, c.kind, c.ref])).toEqual([
			['e1', 'aRevoir', 'ortho:fr-ortho-invariables-1'],
			['e2', 'lecon', 'math-complements'],
		]);
	});
});

/* ============================================================
   7) Archivage / journal de séances (inchangé par la conditionnelle)
   ============================================================ */
describe('archivage au passage de minuit avec une conditionnelle (#464)', () => {
	it('la séance d’hier est archivée avec l’étape « à revoir » et sa cible tirée', () => {
		poserDefs([defLunMar([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		const ctx = epingle(1);
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx });
		const r = realiser({
			etape: 'e2',
			t: LUN + 60_000,
			journalise: 'dictee',
			ctx,
			cible: 'ortho:fr-ortho-invariables-1',
			lance: 'dictee',
		});
		expect(r.justCompleted).toBe(true);
		expect(chargerJournalSeances()).toHaveLength(0); // encore frais aujourd'hui
		// Lendemain (même définition) : l'état périmé est archivé, l'état du jour repart vierge.
		const v = vueSeanceDuJour(MAR, RIEN_EPINGLE)!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']); // rien d'épinglé mardi
		expect(v.totalFait).toBe(0);
		const journal = chargerJournalSeances();
		expect(journal).toHaveLength(1);
		expect(journal[0]).toMatchObject({ date: '2026-01-05', defId: 'd1', complete: true });
		expect(journal[0].etapes.map((c) => [c.etapeId, c.kind, c.ref])).toEqual([
			['e1', 'sprint', undefined],
			['e2', 'aRevoir', 'ortho:fr-ortho-invariables-1'],
		]);
		// Durées : somme des étapes (100 + 100) et span début → dernière complétion.
		expect(journal[0]).toMatchObject({ dureeActiveMs: 200, dureeTotaleMs: 60_100 });
	});
	it('l’archive porte la MÉMOIRE de récompense, pas « toutes les étapes du jour faites »', () => {
		// Récompense donnée le matin (rien d'épinglé), puis une épinglée apparaît et reste non
		// faite : la mémoire étant monotone, la séance s'archive `complete: true` avec 1 étape
		// sur 2. Sémantique à connaître pour un futur récap encadrant (« séance complétée »
		// = récompense attribuée).
		poserDefs([defLunMar([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE });
		expect(vueSeanceDuJour(LUN, epingle(1))!.complete).toBe(false); // à l'écran : il reste e2
		vueSeanceDuJour(MAR, epingle(1)); // passage de minuit → archivage
		const journal = chargerJournalSeances();
		expect(journal).toHaveLength(1);
		expect(journal[0]).toMatchObject({ date: '2026-01-05', complete: true });
		expect(journal[0].etapes.map((c) => c.etapeId)).toEqual(['e1']);
	});
	it('une séance partielle est archivée MÊME si la vue du lendemain est nulle', () => {
		// Définition réduite à la conditionnelle : mardi, rien d'épinglé ⇒ « pas de programme ».
		// L'archivage d'hier ne doit pas être escamoté pour autant (métriques encadrant).
		poserDefs([defLunMar([etape('e1', 'aRevoir', 2)])]);
		realiser({
			etape: 'e1',
			t: LUN + 5_000,
			journalise: 'lecon',
			ctx: epingle(1),
			cible: 'math-doubles',
			lance: 'lecon',
		});
		expect(jourStocke().completions).toHaveLength(1);
		expect(vueSeanceDuJour(MAR, RIEN_EPINGLE)).toBeNull();
		const journal = chargerJournalSeances();
		expect(journal).toHaveLength(1);
		expect(journal[0]).toMatchObject({ date: '2026-01-05', complete: false });
		expect(journal[0].etapes).toHaveLength(1);
	});
});

/* ============================================================
   8) tirerParmi — tirage déterministe du pool épinglé (helper pur)
   Contrat : rand ∈ [0,1[ ; index = floor(rand × N) ∈ {0..N-1} ; pool vide → undefined.
   ============================================================ */
describe('tirerParmi (#464)', () => {
	const POOL = ['math-doubles', 'ortho:fr-ortho-invariables-1', 'fr-conj-present'];
	it('pool VIDE → undefined quel que soit rand', () => {
		for (const r of [0, 0.5, 0.999999]) expect(tirerParmi([], () => r)).toBeUndefined();
	});
	it('un seul élément → toujours lui', () => {
		for (const r of [0, 0.4, 0.999999]) expect(tirerParmi(['seule'], () => r)).toBe('seule');
	});
	it('rand=0 → 1er élément ; rand→1 → DERNIER (jamais hors borne)', () => {
		expect(tirerParmi(POOL, () => 0)).toBe(POOL[0]);
		expect(tirerParmi(POOL, () => 0.999999)).toBe(POOL[POOL.length - 1]);
	});
	it('bornes de seaux : rand = i/N tombe pile sur l’index i (N=4)', () => {
		const p = ['a', 'b', 'c', 'd'];
		expect(tirerParmi(p, () => 0)).toBe('a');
		expect(tirerParmi(p, () => 0.25)).toBe('b');
		expect(tirerParmi(p, () => 0.5)).toBe('c');
		expect(tirerParmi(p, () => 0.75)).toBe('d');
	});
	it('échantillonnage dense : tout le pool est atteignable, jamais autre chose', () => {
		const atteints = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			const res = tirerParmi(POOL, () => i / 1000);
			expect(res).toBeDefined();
			expect(POOL).toContain(res);
			atteints.add(res!);
		}
		expect(atteints.size).toBe(POOL.length); // les 3 natures d'entrée sortent (leçons ET dictée)
	});
	it('rand par DÉFAUT (Math.random) : 300 tirages restent dans le pool', () => {
		for (let i = 0; i < 300; i++) expect(POOL).toContain(tirerParmi(POOL));
	});
	it('ne modifie pas le pool reçu', () => {
		const p = ['a', 'b', 'c'];
		tirerParmi(p, () => 0.9);
		expect(p).toEqual(['a', 'b', 'c']);
	});
});

/* Non-régression #463 : `tirerCible` (dictées configurées) est désormais bâti sur
   `tirerParmi`. Son contrat observable ne doit pas avoir bougé — même politique de
   tirage, et toujours sur les cibles VALIDES (une cible obsolète reste inatteignable). */
describe('tirerCible après refactor (non-régression #463)', () => {
	const dictee = (refs: string[]): SeanceEtape => ({ id: 'e1', kind: 'dictee', count: 1, refs });
	it('même politique de tirage que tirerParmi sur les cibles valides', () => {
		const dispo = ['liste-a', 'liste-b', 'liste-c', 'liste-d'];
		for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
			expect(tirerCible(dictee(dispo), dispo, () => r)).toBe(tirerParmi(dispo, () => r));
		}
	});
	it('la cible obsolète reste inatteignable (tirage sur les valides)', () => {
		const e = dictee(['v1', 'orpheline', 'v2']);
		for (let i = 0; i < 500; i++) {
			const res = tirerCible(e, ['v1', 'v2'], () => i / 500);
			expect(['v1', 'v2']).toContain(res);
		}
	});
	it('aucune cible valide → undefined', () => {
		expect(tirerCible(dictee(['liste-a']), [], () => 0)).toBeUndefined();
	});
});

/* ============================================================
   9) countRequis — « combien de fois » BORNÉ à 1
   Un programme importé / édité à la main peut porter un `count` à 0, négatif ou absent.
   Lu tel quel, « fait ≥ requis » serait vrai sans rien faire : le programme se dirait
   terminé et la récompense partirait au chargement. Attendu : une telle étape se comporte
   comme un « × 1 » ordinaire, partout (durée estimée, vue, crédit, complétion).
   ============================================================ */
describe('countRequis (borne du « combien de fois »)', () => {
	const avecCount = (count: number): SeanceEtape => ({ id: 'e1', kind: 'sprint', count });
	it('valeurs normales : rendues telles quelles', () => {
		expect(countRequis(avecCount(1))).toBe(1);
		expect(countRequis(avecCount(2))).toBe(2);
		expect(countRequis(avecCount(5))).toBe(5);
	});
	it('ne borne PAS par le haut (le compositeur borne la saisie, pas le cœur)', () => {
		expect(countRequis(avecCount(7))).toBe(7);
		expect(countRequis(avecCount(42))).toBe(42);
	});
	it('zéro et valeurs négatives → 1', () => {
		expect(countRequis(avecCount(0))).toBe(1);
		expect(countRequis(avecCount(-1))).toBe(1);
		expect(countRequis(avecCount(-100))).toBe(1);
	});
	it('`count` ABSENT d’un programme stocké à la main → 1', () => {
		// Écriture BRUTE du JSON de programme, comme un export bricolé : l'étape n'a pas de
		// clé `count`. On relit par l'API du module (aucune fabrication d'objet en test).
		lsSetRaw(
			activeProfile().uuid + '/' + SEANCE_KEY,
			'[{"id":"d1","recurrence":{"type":"hebdo","jours":[1]},"etapes":[{"id":"e1","kind":"sprint"}]}]',
		);
		const etapeSansCount = chargerSeancesFor(activeProfile().uuid)[0].etapes[0];
		expect(etapeSansCount.count).toBeUndefined();
		expect(countRequis(etapeSansCount)).toBe(1);
	});
	it('durée estimée cohérente : un count dégradé compte pour un passage', () => {
		const unSprint = estimationDureeMin(defLundi([etape('e1', 'sprint', 1)]));
		expect(estimationDureeMin(defLundi([etape('e1', 'sprint', 0)]))).toBe(unSprint);
		expect(estimationDureeMin(defLundi([etape('e1', 'sprint', -3)]))).toBe(unSprint);
		// Mixte : la somme suit countRequis étape par étape (2 sprints + 1 « à revoir »).
		const mixte = defLundi([etape('e1', 'sprint', 2), etape('e2', 'aRevoir', -1)]);
		expect(estimationDureeMin(mixte)).toBe(
			2 * SEANCE_MODE_INFOS.sprint.dureeMin + SEANCE_MODE_INFOS.aRevoir.dureeMin,
		);
	});
});

describe('count dégradé : aucune récompense gratuite (#464)', () => {
	/** Programme du lundi écrit BRUT, avec l'étape telle quelle (count 0, négatif, absent…). */
	function poserDefBrute(etapeJson: string): void {
		lsSetRaw(
			activeProfile().uuid + '/' + SEANCE_KEY,
			`[{"id":"d1","recurrence":{"type":"hebdo","jours":[1]},"etapes":[${etapeJson}]}]`,
		);
	}
	for (const [libelle, json] of [
		['count ABSENT', '{"id":"e1","kind":"sprint"}'],
		['count 0', '{"id":"e1","kind":"sprint","count":0}'],
		['count NÉGATIF', '{"id":"e1","kind":"sprint","count":-2}'],
	] as const) {
		it(`${libelle} : rien n’est célébré au chargement, l’étape reste à faire`, () => {
			poserDefBrute(json);
			// Rendu de l'accueil (lecture + rattrapage de complétion) : rien ne doit s'acter.
			expect(consoliderCompletion(LUN, RIEN_EPINGLE)).toBe(false);
			expect(consoliderCompletion(LUN + 1_000)).toBe(false); // ctx omis idem
			expect(seancesCompletees()).toBe(0);
			expect(jourStocke().complete).toBe(false);
			// La jauge présente bien un passage à faire (« × 1 » ordinaire).
			const v = vueSeanceDuJour(LUN, RIEN_EPINGLE)!;
			expect(v).toMatchObject({ complete: false, totalRequis: 1, totalFait: 0 });
			expect(v.etapes[0]).toMatchObject({ fait: 0, reste: 1, epuise: false });
			expect(v.restantes.map((x) => x.etape.id)).toEqual(['e1']);
		});
		it(`${libelle} : UN passage suffit et ne crédite qu’une fois`, () => {
			poserDefBrute(json);
			const r = realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE });
			expect(r).toEqual({ credited: true, etapeId: 'e1', justCompleted: true });
			expect(jourStocke().faits.e1).toBe(1); // plafonné à countRequis, pas de sur-crédit
			expect(seancesCompletees()).toBe(1);
			const v = vueSeanceDuJour(LUN, RIEN_EPINGLE)!;
			expect(v).toMatchObject({ complete: true, totalRequis: 1, totalFait: 1 });
			expect(v.etapes[0]).toMatchObject({ fait: 1, reste: 0, epuise: true });
			// Un passage de plus ne rend ni sur-crédit ni seconde récompense.
			const r2 = realiser({ etape: 'e1', t: LUN + 10_000, journalise: 'sprint' });
			expect(r2.justCompleted).toBe(false);
			expect(jourStocke().faits.e1).toBe(1);
			expect(seancesCompletees()).toBe(1);
		});
	}
	it('étape « à revoir » à count dégradé : escamotée sans rien célébrer, sinon « × 1 »', () => {
		poserDefBrute('{"id":"e1","kind":"aRevoir","count":0}');
		// Rien d'épinglé : aucune étape applicable ⇒ pas de programme, pas de récompense.
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)).toBeNull();
		expect(consoliderCompletion(LUN, RIEN_EPINGLE)).toBe(false);
		expect(seancesCompletees()).toBe(0);
		// Une épinglée existe : l'étape s'applique et vaut un passage.
		const ctx = epingle(2);
		expect(consoliderCompletion(LUN + 1_000, ctx)).toBe(false); // rien de fait encore
		expect(vueSeanceDuJour(LUN, ctx)!).toMatchObject({ complete: false, totalRequis: 1 });
		const r = realiser({
			etape: 'e1',
			t: LUN + 2_000,
			journalise: 'lecon',
			ctx,
			cible: 'math-doubles',
			lance: 'lecon',
		});
		expect(r.justCompleted).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});
	it('count dégradé mêlé à une étape normale : la normale reste due', () => {
		poserDefBrute('{"id":"e1","kind":"sprint","count":0},{"id":"e2","kind":"revision","count":2}');
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)!).toMatchObject({ totalRequis: 3 }); // 1 + 2
		realiser({ etape: 'e1', t: LUN, journalise: 'sprint', ctx: RIEN_EPINGLE });
		expect(consoliderCompletion(LUN + 1_000, RIEN_EPINGLE)).toBe(false); // e2 reste (0/2)
		expect(seancesCompletees()).toBe(0);
		realiser({ etape: 'e2', t: LUN + 2_000, journalise: 'revision', ctx: RIEN_EPINGLE });
		const r = realiser({ etape: 'e2', t: LUN + 3_000, journalise: 'revision', ctx: RIEN_EPINGLE });
		expect(r.justCompleted).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});
});
