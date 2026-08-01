/* ============================================================
   Étape « dictée » à POOL de cibles (#463) — logique pure de src/core/seance.ts.
   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés de la spec
   (pool `refs` prioritaire, rétrocompat de l'ancien `ref` unique, crédit d'une étape par la
   liste RÉELLEMENT dictée, report de la cible vue dans la métrique), jamais recopiés du code.

   Depuis #498, l'attribution ne se fait plus « par type » mais sur la RÉFÉRENCE que porte
   la session journalisée : une dictée ne crédite l'étape que si la liste travaillée fait
   partie des cibles configurées, quel que soit le chemin de lancement (tuile du programme,
   catalogue Français > Orthographe, carte d'accueil).

   Le TIRAGE côté UI (dictées disponibles, `Math.random`) vit dans src/ui/seance.ts → e2e.

   Repère calendaire (heure LOCALE) : 2026-01-05 = lundi (ISO 1).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	ciblesEtape,
	ciblesValides,
	tirerCible,
	marquerEtapeLancee,
	resoudreProgramme,
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
/** Sème une session finalisée du journal d'activité (`{t, k, ref?}`). */
function poserActivite(k: ActivityKind, t: number, ref?: string): void {
	const a: { t: number; k: ActivityKind; ref?: string }[] = lsGet(ACTIVITY_KEY, []);
	a.push(ref === undefined ? { t, k } : { t, k, ref });
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
   2) Crédit d'une étape « dictée » : la LISTE dictée doit être une cible de l'étape
   ============================================================ */
describe('crédit par la liste réellement dictée (#498)', () => {
	it('rétrocompat : étape à cible unique, dictée faite hors programme → créditée', () => {
		poserDef(etapeDictee({ ref: 'liste-ce2-01' }));
		etatSeanceJour(LUN); // le programme du jour existe
		poserActivite('dictee', LUN + 60_000, 'liste-ce2-01'); // lancée depuis le catalogue
		const r = resoudreProgramme(LUN + 61_000);
		expect(r).toEqual({ etapesCreditees: ['e1'], justCompleted: true });
		expect(jourStocke().completions[0]).toMatchObject({
			etapeId: 'e1',
			kind: 'dictee',
			ref: 'liste-ce2-01',
			ts: LUN + 60_000,
			dureeMs: 0, // aucun lancement daté depuis le programme
		});
	});
	it('pool : n’importe quelle liste DU POOL crédite, avec sa propre cible en métrique', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b', 'liste-c'], count: 2 }));
		etatSeanceJour(LUN);
		poserActivite('dictee', LUN + 1_000, 'liste-c');
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual(['e1']);
		poserActivite('dictee', LUN + 3_000, 'liste-a');
		expect(resoudreProgramme(LUN + 4_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
		expect(jourStocke().completions.map((c) => c.ref)).toEqual(['liste-c', 'liste-a']);
	});
	it('une liste HORS pool ne crédite pas : la consigne de l’adulte reste due', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		etatSeanceJour(LUN);
		poserActivite('dictee', LUN + 1_000, 'liste-hors-programme');
		expect(resoudreProgramme(LUN + 2_000)).toEqual({ etapesCreditees: [], justCompleted: false });
		expect(jourStocke().faits).toEqual({});
	});
	it('une dictée SANS cible journalisée ne crédite pas (cible indéterminable)', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		etatSeanceJour(LUN);
		poserActivite('dictee', LUN + 1_000); // entrée d'avant #498, ou session multi-listes
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual([]);
	});
	it('le pool prime : la cible legacy `ref` d’une étape à pool ne crédite PAS', () => {
		// Cohérent avec `ciblesEtape` : dès qu'un pool existe, il définit seul les cibles.
		poserDef(etapeDictee({ refs: ['liste-a'], ref: 'liste-figee' }));
		etatSeanceJour(LUN);
		poserActivite('dictee', LUN + 1_000, 'liste-figee');
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual([]);
		poserActivite('dictee', LUN + 3_000, 'liste-a');
		expect(resoudreProgramme(LUN + 4_000).etapesCreditees).toEqual(['e1']);
	});
	it('étape SANS aucune cible configurée : jamais créditée (consigne incomplète)', () => {
		poserDef(etapeDictee({}));
		etatSeanceJour(LUN);
		poserActivite('dictee', LUN + 1_000, 'liste-a');
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual([]);
	});
	it('une dictée finie AVANT la naissance du programme du jour ne crédite pas', () => {
		poserDef(etapeDictee({ refs: ['liste-a'] }));
		poserActivite('dictee', LUN + 5_000, 'liste-a');
		etatSeanceJour(LUN + 10_000); // le programme naît après la dictée
		expect(resoudreProgramme(LUN + 20_000).etapesCreditees).toEqual([]);
		expect(jourStocke().faits).toEqual({});
	});
});

/* ============================================================
   3) Marqueur : mémorisation de la cible TIRÉE (métrique)
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
	it('lancement depuis la tuile : la complétion porte la cible tirée et la durée réelle', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b', 'liste-c'] }));
		marquerEtapeLancee('e1', LUN, 'liste-b'); // tirage → liste-b
		poserActivite('dictee', LUN + 3_000, 'liste-b');
		expect(resoudreProgramme(LUN + 5_000)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
		expect(jourStocke().completions[0]).toMatchObject({
			etapeId: 'e1',
			kind: 'dictee',
			ref: 'liste-b', // la dictée VUE, isolée du pool
			ts: LUN + 3_000,
			dureeMs: 3_000, // session - lancement
		});
	});
	it('cible du pool changée en route : la liste RÉELLEMENT dictée décide du crédit', () => {
		// L'enfant lance liste-a depuis la tuile, revient, puis fait liste-b du même pool.
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		marquerEtapeLancee('e1', LUN, 'liste-a');
		expect(resoudreProgramme(LUN + 1_000).etapesCreditees).toEqual([]); // rien de fini
		poserActivite('dictee', LUN + 5_000, 'liste-b');
		expect(resoudreProgramme(LUN + 6_000).etapesCreditees).toEqual(['e1']);
		// Marqueur déjà nettoyé : la métrique reprend la liste de la session, sans durée.
		expect(jourStocke().completions[0]).toMatchObject({ ref: 'liste-b', dureeMs: 0 });
	});
	it('abandon d’une étape à pool : rien crédité, marqueur effacé, crédit non perdu', () => {
		poserDef(etapeDictee({ refs: ['liste-a', 'liste-b'] }));
		marquerEtapeLancee('e1', LUN, 'liste-b');
		const abandon = resoudreProgramme(LUN + 5_000); // aucune dictée finie depuis le lancement
		expect(abandon).toEqual({ etapesCreditees: [], justCompleted: false });
		const j = jourStocke();
		expect(j.faits).toEqual({});
		expect(j.pending).toBeNull();
		expect(j.completions).toEqual([]);
		// Dictée reprise et finie plus tard dans la journée : l'étape est enfin créditée.
		poserActivite('dictee', LUN + 600_000, 'liste-b');
		expect(resoudreProgramme(LUN + 601_000).etapesCreditees).toEqual(['e1']);
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
