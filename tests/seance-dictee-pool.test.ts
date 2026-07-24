/* ============================================================
   Étape « dictée » à POOL de cibles (#463) — logique pure de src/core/seance.ts.
   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés de la
   spec (pool `refs` prioritaire, rétrocompat de l'ancien `ref` unique, report de la
   cible RÉELLEMENT tirée dans la métrique de complétion), jamais recopiés du code.

   Le TIRAGE aléatoire (`tirerCibleDictee`, filtrage des dictées valides) vit côté UI
   (src/ui/seance.ts, dépend de Math.random + loadOrtho) → couvert en e2e. Ici on
   éprouve UNIQUEMENT le contrat pur de core : `ciblesEtape` et le fil
   lancement→complétion (`marquerEtapeLancee` avec cible tirée → `resoudrePending`).

   Repère calendaire (heure LOCALE) : 2026-01-05 = lundi (ISO 1).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	ciblesEtape,
	ciblesValides,
	tirerCible,
	marquerEtapeLancee,
	resoudrePending,
	etatSeanceJour,
	enregistrerSeancesFor,
	SEANCE_JOUR_KEY,
	type SeanceDef,
	type SeanceEtape,
	type SeanceJour,
} from '../src/core/seance';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSet } from '../src/core/storage';
import { ACTIVITY_KEY, type ActivityKind } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Instant de référence (heure locale) ---------- */
const LUN = new Date(2026, 0, 5).getTime(); // lundi, ISO 1

/* ---------- Fabriques ---------- */
/** Étape dictée : cible unique legacy (`ref`), pool (`refs`), les deux, ou aucun. */
function etapeDictee(opts: { ref?: string; refs?: string[]; count?: number } = {}): SeanceEtape {
	const e: SeanceEtape = { id: 'e1', kind: 'dictee', count: opts.count ?? 1 };
	if (opts.ref !== undefined) e.ref = opts.ref;
	if (opts.refs !== undefined) e.refs = opts.refs;
	return e;
}
/** Séance hebdo appliquée le lundi, portant l'étape fournie. */
function defLundi(etape: SeanceEtape): SeanceDef {
	return { id: 'd1', etapes: [etape], recurrence: { type: 'hebdo', jours: [1] } };
}

/* ---------- Accès stockage (via l'API du module + clés documentées) ---------- */
function poserDef(etape: SeanceEtape): void {
	enregistrerSeancesFor(activeProfile().uuid, [defLundi(etape)]);
}
function poserActivite(k: ActivityKind, t: number): void {
	const a: { t: number; k: ActivityKind }[] = lsGet(ACTIVITY_KEY, []);
	a.push({ t, k });
	lsSet(ACTIVITY_KEY, a);
}
function jourStocke(): SeanceJour {
	return lsGet(SEANCE_JOUR_KEY, null) as SeanceJour;
}

/* ============================================================
   1) ciblesEtape — normalisation des cibles (fonction pure, sans stockage)
   ============================================================ */
describe('ciblesEtape (normalisation, #463)', () => {
	it('pool `refs` non vide PRIME sur `ref` legacy (ref ignoré)', () => {
		expect(ciblesEtape(etapeDictee({ refs: ['liste-a', 'liste-b'], ref: 'liste-c' }))).toEqual([
			'liste-a',
			'liste-b',
		]);
	});
	it('pas de `refs` mais `ref` présent → [ref] (cible unique)', () => {
		expect(ciblesEtape(etapeDictee({ ref: 'liste-legacy' }))).toEqual(['liste-legacy']);
	});
	it('ni `refs` ni `ref` → [] (aucune cible)', () => {
		expect(ciblesEtape(etapeDictee({}))).toEqual([]);
	});
	it('`refs` VIDE [] → retombe sur `ref` (borne : longueur 0 ⇒ pool ignoré)', () => {
		expect(ciblesEtape(etapeDictee({ refs: [], ref: 'liste-legacy' }))).toEqual(['liste-legacy']);
	});
	it('`refs` VIDE [] et pas de `ref` → []', () => {
		expect(ciblesEtape(etapeDictee({ refs: [] }))).toEqual([]);
	});
	it('pool à UNE seule cible → équivalent d’une dictée figée', () => {
		expect(ciblesEtape(etapeDictee({ refs: ['liste-x'] }))).toEqual(['liste-x']);
	});
	it('préserve l’ordre du pool (pas de tri)', () => {
		expect(ciblesEtape(etapeDictee({ refs: ['z', 'a', 'm'] }))).toEqual(['z', 'a', 'm']);
	});
});

/* ============================================================
   2) Rétrocompatibilité : une étape configurée AVANT #463 (seulement `ref`)
   reste résolue comme une cible unique, jusque dans la métrique de complétion.
   ============================================================ */
describe('rétrocompatibilité (étape legacy avec seul `ref`)', () => {
	it('ciblesEtape : cible unique inchangée', () => {
		expect(ciblesEtape(etapeDictee({ ref: 'liste-ce2-01' }))).toEqual(['liste-ce2-01']);
	});
	it('fil complet SANS cible tirée passée → la complétion reprend `etape.ref`', () => {
		// Un appelant legacy n'a pas de pool et ne passe donc pas de 3e argument.
		poserDef(etapeDictee({ ref: 'liste-ce2-01' }));
		marquerEtapeLancee('e1', LUN); // pas de drawnRef
		poserActivite('dictee', LUN + 1000);
		const r = resoudrePending(LUN + 2000);
		expect(r).toEqual({ credited: true, etapeId: 'e1', justCompleted: true });
		expect(jourStocke().completions[0]).toMatchObject({
			etapeId: 'e1',
			kind: 'dictee',
			ref: 'liste-ce2-01', // repli sur etape.ref (aucune cible tirée mémorisée)
			ts: LUN + 1000,
			dureeMs: 1000,
		});
	});
});

/* ============================================================
   3) Fil « métrique » lancement → complétion avec un pool.
   La cible RÉELLEMENT tirée (3e arg de marquerEtapeLancee) est mémorisée dans
   pending.ref puis reportée telle quelle dans la complétion.
   ============================================================ */
describe('marquerEtapeLancee : mémorisation de la cible tirée', () => {
	it('avec cible tirée → pending.ref = cible', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b', 'liste-c'] }));
		marquerEtapeLancee('e1', LUN, 'liste-b');
		expect(jourStocke().pending).toEqual({
			etapeId: 'e1',
			kind: 'dictee',
			launchTs: LUN,
			ref: 'liste-b',
		});
	});
	it('sans cible tirée → pending sans clé `ref` (undefined non persisté)', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		marquerEtapeLancee('e1', LUN);
		const pending = jourStocke().pending!;
		expect(pending).toEqual({ etapeId: 'e1', kind: 'dictee', launchTs: LUN });
		expect('ref' in pending).toBe(false);
	});
});

describe('resoudrePending : report de la cible tirée du pool (#463)', () => {
	it('la complétion porte la cible TIRÉE, pas le pool entier', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b', 'liste-c'] }));
		marquerEtapeLancee('e1', LUN, 'liste-b'); // tirage → liste-b
		poserActivite('dictee', LUN + 3000);
		const r = resoudrePending(LUN + 5000);
		expect(r).toEqual({ credited: true, etapeId: 'e1', justCompleted: true });
		const comp = jourStocke().completions[0];
		expect(comp).toMatchObject({
			etapeId: 'e1',
			kind: 'dictee',
			ref: 'liste-b', // la dictée VUE, isolée du pool
			ts: LUN + 3000,
			dureeMs: 3000, // hit.t - launchTs
		});
	});
	it('crédit par TYPE d’activité, indépendant de la cible tirée', () => {
		// L'attribution reste par ActivityKind='dictee' : le journal ne porte pas l'id de
		// liste, donc peu importe quelle dictée a été jouée, l'étape pending est créditée.
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'], count: 1 }));
		marquerEtapeLancee('e1', LUN, 'liste-a');
		poserActivite('dictee', LUN + 100);
		expect(resoudrePending(LUN + 200).credited).toBe(true);
		expect(jourStocke().completions[0].ref).toBe('liste-a');
	});
	it('pool SANS cible tirée et sans `ref` → complétion sans cible (repli undefined)', () => {
		// Cas limite : étape à pool dont marquerEtapeLancee n'a reçu aucune cible (ex. pool
		// dont aucune dictée n'était disponible côté UI). Le repli `etape.ref` est undefined
		// → la métrique perd la cible, mais l'étape est tout de même créditée.
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		marquerEtapeLancee('e1', LUN); // aucune cible tirée
		poserActivite('dictee', LUN + 1000);
		const r = resoudrePending(LUN + 2000);
		expect(r.credited).toBe(true);
		const comp = jourStocke().completions[0];
		expect(comp.ref).toBeUndefined();
		expect('ref' in comp).toBe(false); // undefined non persisté par JSON
	});
	it('cible tirée fournie sur une étape legacy → elle PRIME sur etape.ref', () => {
		// p.ref ?? etape.ref : dès qu'une cible tirée est mémorisée, elle l'emporte sur la
		// cible figée. Cohérent avec « la métrique conserve la dictée réellement vue ».
		poserDef(etapeDictee({ ref: 'liste-figee' }));
		marquerEtapeLancee('e1', LUN, 'liste-tiree');
		poserActivite('dictee', LUN + 100);
		resoudrePending(LUN + 200);
		expect(jourStocke().completions[0].ref).toBe('liste-tiree');
	});
	it('étape à pool ET ref, sans cible tirée → repli sur etape.ref (comportement documenté)', () => {
		// refs prime pour les cibles PROPOSÉES (ciblesEtape), mais le repli de la métrique
		// reste etape.ref quand aucune cible n'a été tirée. On fige ce comportement observé.
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'], ref: 'liste-figee' }));
		expect(
			ciblesEtape(
				defLundi(etapeDictee({ refs: ['liste-a', 'liste-b'], ref: 'liste-figee' })).etapes[0],
			),
		).toEqual(['liste-a', 'liste-b']);
		marquerEtapeLancee('e1', LUN); // pas de cible tirée
		poserActivite('dictee', LUN + 100);
		resoudrePending(LUN + 200);
		expect(jourStocke().completions[0].ref).toBe('liste-figee');
	});
	it('count 2 : deux tirages distincts → deux complétions aux cibles respectives', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b', 'liste-c'], count: 2 }));
		// 1re réalisation : cible liste-c.
		marquerEtapeLancee('e1', LUN, 'liste-c');
		poserActivite('dictee', LUN + 100);
		let r = resoudrePending(LUN + 200);
		expect(r.justCompleted).toBe(false); // 1/2
		// 2e réalisation : cible liste-a.
		marquerEtapeLancee('e1', LUN + 1000, 'liste-a');
		poserActivite('dictee', LUN + 1100);
		r = resoudrePending(LUN + 1200);
		expect(r.justCompleted).toBe(true); // 2/2 → séance complète
		const comps = jourStocke().completions;
		expect(comps).toHaveLength(2);
		expect(comps.map((c) => c.ref)).toEqual(['liste-c', 'liste-a']);
	});
	it('abandon d’une étape à pool : aucune activité → rien crédité, pending effacé', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		marquerEtapeLancee('e1', LUN, 'liste-b');
		const r = resoudrePending(LUN + 5000); // aucune activité dictée depuis le lancement
		expect(r).toEqual({ credited: false, etapeId: null, justCompleted: false });
		const j = jourStocke();
		expect(j.faits).toEqual({});
		expect(j.pending).toBeNull();
		expect(j.completions).toEqual([]);
	});
	it('activité dictée ANTÉRIEURE au lancement ne crédite pas (même avec cible tirée)', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		marquerEtapeLancee('e1', LUN + 10_000, 'liste-a'); // launchTs = LUN+10000
		poserActivite('dictee', LUN + 5_000); // AVANT le lancement
		expect(resoudrePending(LUN + 20_000).credited).toBe(false);
		expect(jourStocke().faits).toEqual({});
	});
});

/* ============================================================
   4) ciblesValides — filtrage des cibles obsolètes (fonction pure).
   ============================================================ */
describe('ciblesValides (filtrage des cibles obsolètes, #463)', () => {
	it('exclut la cible ORPHELINE (absente des disponibles), garde les valides', () => {
		expect(
			ciblesValides(etapeDictee({ refs: ['liste-a', 'liste-b', 'liste-c'] }), [
				'liste-a',
				'liste-c',
			]),
		).toEqual(['liste-a', 'liste-c']); // liste-b orpheline écartée
	});
	it('pool ENTIÈREMENT orphelin → []', () => {
		expect(ciblesValides(etapeDictee({ refs: ['liste-a', 'liste-b'] }), ['autre'])).toEqual([]);
	});
	it('disponibles VIDE → [] (rien de résoluble)', () => {
		expect(ciblesValides(etapeDictee({ refs: ['liste-a', 'liste-b'] }), [])).toEqual([]);
	});
	it('pool VIDE (ni refs ni ref) → [] quelles que soient les disponibles', () => {
		expect(ciblesValides(etapeDictee({}), ['liste-a'])).toEqual([]);
	});
	it('préserve l’ORDRE DU POOL, pas celui des disponibles', () => {
		expect(ciblesValides(etapeDictee({ refs: ['z', 'a', 'm'] }), ['a', 'm', 'z'])).toEqual([
			'z',
			'a',
			'm',
		]);
	});
	it('rétrocompat : étape legacy à `ref` filtrée de la même façon', () => {
		expect(ciblesValides(etapeDictee({ ref: 'liste-legacy' }), ['liste-legacy'])).toEqual([
			'liste-legacy',
		]);
		expect(ciblesValides(etapeDictee({ ref: 'liste-legacy' }), ['autre'])).toEqual([]);
	});
});

/* ============================================================
   5) tirerCible — tirage DÉTERMINISTE via `rand` injecté, sur les VALIDES.
   Contrat : rand ∈ [0,1[ ; index = floor(rand * N) ∈ {0..N-1}.
   ============================================================ */
describe('tirerCible (tirage déterministe, #463)', () => {
	it('rand=0 → 1re cible valide ; rand→1 → DERNIÈRE (pas d’off-by-one)', () => {
		const e = etapeDictee({ refs: ['liste-a', 'liste-b', 'liste-c'] });
		const dispo = ['liste-a', 'liste-b', 'liste-c'];
		expect(tirerCible(e, dispo, () => 0)).toBe('liste-a'); // index 0
		expect(tirerCible(e, dispo, () => 0.999999)).toBe('liste-c'); // index N-1, jamais hors borne
	});
	it('bornes de seaux : rand = i/N tombe pile sur l’index i (N=4)', () => {
		const e = etapeDictee({ refs: ['a', 'b', 'c', 'd'] });
		const dispo = ['a', 'b', 'c', 'd'];
		expect(tirerCible(e, dispo, () => 0)).toBe('a'); // floor(0)   = 0
		expect(tirerCible(e, dispo, () => 0.25)).toBe('b'); // floor(1.0) = 1
		expect(tirerCible(e, dispo, () => 0.5)).toBe('c'); // floor(2.0) = 2
		expect(tirerCible(e, dispo, () => 0.75)).toBe('d'); // floor(3.0) = 3
	});
	it('échantillonnage dense : tous les index 0..N-1 atteignables, jamais undefined', () => {
		const e = etapeDictee({ refs: ['a', 'b', 'c', 'd'] });
		const dispo = ['a', 'b', 'c', 'd'];
		const atteints = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			const res = tirerCible(e, dispo, () => i / 1000); // rand ∈ [0, 0.999]
			expect(res).toBeDefined();
			expect(dispo).toContain(res);
			atteints.add(res!);
		}
		expect([...atteints].sort()).toEqual(['a', 'b', 'c', 'd']); // les 4 couvertes, aucune de trop
	});
	it('le tirage porte sur les VALIDES, JAMAIS sur le pool brut : l’orpheline est inatteignable', () => {
		// Pool brut = [valide, ORPHELINE, valide]. Sur le brut (N=3), rand=0.5 → index 1 = orpheline.
		// Or tirerCible tire sur les valides (N=2) → l'orpheline ne peut jamais sortir.
		const e = etapeDictee({ refs: ['v1', 'orpheline', 'v2'] });
		const dispo = ['v1', 'v2'];
		expect(tirerCible(e, dispo, () => 0.5)).toBe('v2'); // sur le brut ç'aurait été 'orpheline'
		// Balayage exhaustif : jamais 'orpheline', jamais undefined.
		for (let i = 0; i < 1000; i++) {
			const res = tirerCible(e, dispo, () => i / 1000);
			expect(res).not.toBe('orpheline');
			expect(['v1', 'v2']).toContain(res);
		}
	});
	it('cible unique valide → toujours cette cible quel que soit rand', () => {
		const e = etapeDictee({ refs: ['liste-x'] });
		const dispo = ['liste-x'];
		for (const r of [0, 0.3, 0.5, 0.999999]) {
			expect(tirerCible(e, dispo, () => r)).toBe('liste-x');
		}
	});
	it('legacy `ref` disponible → renvoie cette cible (rétrocompat)', () => {
		expect(tirerCible(etapeDictee({ ref: 'liste-legacy' }), ['liste-legacy'], () => 0.7)).toBe(
			'liste-legacy',
		);
	});
	it('aucune cible valide (toutes orphelines) → undefined quel que soit rand', () => {
		const e = etapeDictee({ refs: ['liste-a', 'liste-b'] });
		for (const r of [0, 0.5, 0.999999]) {
			expect(tirerCible(e, ['autre'], () => r)).toBeUndefined();
		}
	});
	it('pool vide (ni refs ni ref) → undefined', () => {
		expect(tirerCible(etapeDictee({}), ['liste-a'], () => 0)).toBeUndefined();
	});
});

/* Cohérence transverse : après reset paresseux d'un jour neuf, une étape à pool
   se présente bien (état vierge, pas de crédit fantôme). */
describe('intégration état du jour', () => {
	it('étape à pool visible dans l’état vierge, sans complétion tant qu’aucune activité', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		const j = etatSeanceJour(LUN)!;
		expect(j.faits).toEqual({});
		expect(j.completions).toEqual([]);
		expect(j.complete).toBe(false);
	});
});
