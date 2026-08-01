/* ============================================================
   Étape CONDITIONNELLE « à revoir » du programme du jour (#464), et PERSISTANCE du
   travail fait quand la notion quitte la file (#498, défaut 3) — logique pure de
   src/core/seance.ts.

   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés du CONTRAT
   fonctionnel, jamais recopiés de l'implémentation :
   - une étape « à revoir » puise dans la file épinglée par l'encadrant ; elle n'existe
     dans le programme du jour que s'il y a quelque chose d'épinglé, et ne doit ni bloquer
     la complétion ni fabriquer un programme vide (#464) ;
   - une notion RÉUSSIE quitte aussitôt la file : l'étape qui vient d'être créditée doit
     rester affichée et comptée, et le programme réduit à cette étape doit être célébré —
     c'est l'incident du 1er août 2026 (« rien de fait » après avoir tout fait, #498) ;
   - l'attribution reconnaît la session à sa NATURE et à sa cible (leçon épinglée vs liste
     dictée épinglée), grâce au mémo des épinglées vues dans la journée.

   Ce qui est hors de ce fichier : la CONSTRUCTION du contexte (`ContexteSeance`) vit côté
   UI (src/ui/seance.ts, dépend de la dispo du TTS et de `revoirActives`) → e2e ; les
   helpers d'id de file (`orthoRevoirId`…) sont couverts par
   tests/suivi-dictees-encadrant.test.ts ; l'appariement générique (curseur, marqueur,
   arbitrage) par tests/seance-attribution.test.ts.

   Repères calendaires (heure LOCALE) : 2026-01-05 = lundi (ISO 1), 2026-01-06 = mardi.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	SEANCE_MODE_INFOS,
	CONTEXTE_VIDE,
	nbARevoir,
	etapeApplicable,
	ciblesEtape,
	countRequis,
	tirerParmi,
	tirerCible,
	estimationDureeMin,
	etatSeanceJour,
	vueSeanceDuJour,
	marquerEtapeLancee,
	resoudreProgramme,
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

/* ---------- Cibles ---------- */
const LECON_A = 'math-doubles';
const LECON_B = 'math-complements';
const LISTE_A = 'fr-ortho-invariables-1';
const LISTE_B = 'fr-ortho-son-eu-1';

/* ---------- Contextes du jour (ids BRUTS, par nature) ---------- */
const RIEN_EPINGLE: ContexteSeance = { aRevoirLecons: [], aRevoirDictees: [] };
function epinglees(lecons: string[] = [], dictees: string[] = []): ContexteSeance {
	return { aRevoirLecons: lecons, aRevoirDictees: dictees };
}

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
/** Sème une session finalisée du journal d'activité (`{t, k, ref?}`, core/progress). */
function poserActivite(k: ActivityKind, t: number, ref?: string): void {
	const a: { t: number; k: ActivityKind; ref?: string }[] = lsGet(ACTIVITY_KEY, []);
	a.push(ref === undefined ? { t, k } : { t, k, ref });
	lsSet(ACTIVITY_KEY, a);
}
function jourStocke(): SeanceJour {
	return lsGet(SEANCE_JOUR_KEY, null) as SeanceJour;
}
/** Fil réel d'une épinglée travaillée depuis la carte d'accueil ou le catalogue : l'accueil
    est rendu (la file du moment est VUE), la session est journalisée avec sa cible, puis
    l'enfant revient — la notion réussie a alors pu quitter la file (`apres`). */
function travaillerEpinglee(o: {
	t: number;
	k: ActivityKind;
	ref: string;
	avant: ContexteSeance;
	apres?: ContexteSeance;
}): ResolutionSeance {
	resoudreProgramme(o.t - 1_000, o.avant);
	poserActivite(o.k, o.t, o.ref);
	return resoudreProgramme(o.t + 1_000, o.apres ?? RIEN_EPINGLE);
}
/** Session d'un mode SANS cible (sprint / révision), du programme ou d'ailleurs. */
function faireSession(k: ActivityKind, t: number, ctx: ContexteSeance = RIEN_EPINGLE) {
	poserActivite(k, t, undefined);
	return resoudreProgramme(t + 1_000, ctx);
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
   2) nbARevoir / etapeApplicable (helpers purs)
   ============================================================ */
describe('nbARevoir (#498)', () => {
	it('compte les deux natures d’épinglée, sans les confondre', () => {
		expect(nbARevoir(CONTEXTE_VIDE)).toBe(0);
		expect(nbARevoir(epinglees([LECON_A]))).toBe(1);
		expect(nbARevoir(epinglees([], [LISTE_A]))).toBe(1);
		expect(nbARevoir(epinglees([LECON_A, LECON_B], [LISTE_A]))).toBe(3);
	});
});

describe('etapeApplicable (#464)', () => {
	it('aRevoir : applicable SSI quelque chose est épinglé, quelle qu’en soit la nature', () => {
		const e = etape('e1', 'aRevoir');
		expect(etapeApplicable(e, RIEN_EPINGLE)).toBe(false);
		expect(etapeApplicable(e, epinglees([LECON_A]))).toBe(true); // borne basse (1 leçon)
		expect(etapeApplicable(e, epinglees([], [LISTE_A]))).toBe(true); // borne basse (1 dictée)
		expect(etapeApplicable(e, epinglees([LECON_A, LECON_B], [LISTE_A, LISTE_B]))).toBe(true);
	});
	it('CONTEXTE_VIDE = deux files vides (défaut prudent)', () => {
		expect(CONTEXTE_VIDE.aRevoirLecons).toEqual([]);
		expect(CONTEXTE_VIDE.aRevoirDictees).toEqual([]);
		expect(etapeApplicable(etape('e1', 'aRevoir'), CONTEXTE_VIDE)).toBe(false);
	});
	it('les autres modes sont INCONDITIONNELS (quel que soit le contexte)', () => {
		const autres = (Object.keys(SEANCE_MODE_INFOS) as SeanceModeKind[]).filter(
			(k) => k !== 'aRevoir',
		);
		expect(autres.length).toBeGreaterThan(0);
		for (const k of autres) {
			expect(etapeApplicable(etape('e1', k), RIEN_EPINGLE)).toBe(true);
			expect(etapeApplicable(etape('e1', k), epinglees([LECON_A], [LISTE_A]))).toBe(true);
		}
	});
});

/* ============================================================
   3) vueSeanceDuJour : présence / absence de l'étape conditionnelle
   ============================================================ */
describe('vueSeanceDuJour avec une étape conditionnelle (#464)', () => {
	it('rien d’épinglé et rien de fait : l’étape disparaît de la vue et du décompte', () => {
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
		const v = vueSeanceDuJour(LUN, epinglees([LECON_A], [LISTE_A]))!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1', 'e2']);
		expect(v.totalRequis).toBe(4); // 1 + 3, comme n'importe quelle étape à count 3
		expect(v.etapes[1]).toMatchObject({ requis: 3, fait: 0, reste: 3, epuise: false });
	});
	it('contexte OMIS = rien d’épinglé (défaut prudent, point de contrat)', () => {
		poserDefs([defLundi([etape('e1', 'sprint'), etape('e2', 'aRevoir')])]);
		const sansCtx = vueSeanceDuJour(LUN)!;
		expect(sansCtx.etapes.map((x) => x.etape.id)).toEqual(['e1']);
		expect(sansCtx.totalRequis).toBe(vueSeanceDuJour(LUN, RIEN_EPINGLE)!.totalRequis);
	});
	it('définition RÉDUITE à une conditionnelle jamais applicable → « pas de programme » (null)', () => {
		// Jamais un programme vide (0 étape) qui se dirait complété d'office.
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)).toBeNull();
		expect(vueSeanceDuJour(LUN)).toBeNull(); // idem sans contexte
		// Et rien n'a été célébré au passage.
		expect(resoudreProgramme(LUN + 1_000, RIEN_EPINGLE)).toEqual({
			etapesCreditees: [],
			justCompleted: false,
		});
		expect(seancesCompletees()).toBe(0);
		expect(jourStocke().complete).toBe(false);
	});
	it('la même définition RÉAPPARAÎT dès qu’une épinglée existe', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)).toBeNull();
		const v = vueSeanceDuJour(LUN, epinglees([], [LISTE_A]))!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']);
		expect(v.totalRequis).toBe(2);
		expect(v.complete).toBe(false);
	});
});

/* ============================================================
   4) DÉFAUT 3 (#498) : une étape déjà travaillée reste EN JEU
   La notion réussie quitte la file dans la seconde ; l'ancien filtrage sur les seules
   étapes APPLICABLES escamotait alors de la jauge et du récap le travail qui venait
   d'être crédité — l'enfant lisait « rien de fait » juste après avoir fait.
   ============================================================ */
describe('étape « à revoir » créditée puis escamotée (#498, défaut 3)', () => {
	it('la vue garde les DEUX étapes : totalRequis 2, totalFait 1 (l’incident reproduit)', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1), etape('e2', 'dictee', 1, LISTE_A)])]);
		const r = travaillerEpinglee({
			t: LUN + 10_000,
			k: 'lecon',
			ref: LECON_A,
			avant: epinglees([LECON_A]), // la leçon est épinglée au moment du rendu
			apres: RIEN_EPINGLE, // réussie → elle a quitté la file
		});
		expect(r.etapesCreditees).toEqual(['e1']);
		expect(r.justCompleted).toBe(false); // la dictée reste due
		const v = vueSeanceDuJour(LUN + 20_000, RIEN_EPINGLE)!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1', 'e2']);
		expect(v).toMatchObject({ totalRequis: 2, totalFait: 1, complete: false });
		expect(v.etapes[0]).toMatchObject({ requis: 1, fait: 1, reste: 0, epuise: true });
		expect(v.restantes.map((x) => x.etape.id)).toEqual(['e2']); // faite ⇒ plus PROPOSÉE
	});
	it('programme réduit à cette étape : la vue n’est plus null et la RÉCOMPENSE est actée', () => {
		// Corollaire grave de l'incident : l'enfant avait tout fait et perdait fête, trophée
		// et compteur de séances.
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		const r = travaillerEpinglee({
			t: LUN + 10_000,
			k: 'dictee',
			ref: LISTE_A,
			avant: epinglees([], [LISTE_A]),
			apres: RIEN_EPINGLE,
		});
		expect(r).toEqual({ etapesCreditees: ['e1'], justCompleted: true });
		expect(seancesCompletees()).toBe(1);
		expect(jourStocke().complete).toBe(true);
		const v = vueSeanceDuJour(LUN + 20_000, RIEN_EPINGLE)!;
		expect(v).toMatchObject({ complete: true, totalRequis: 1, totalFait: 1 });
		expect(v.restantes).toEqual([]);
	});
	it('« ×3 » fait UNE fois puis devenu impossible : plus deux passages introuvables à réclamer', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 3)])]);
		const r = travaillerEpinglee({
			t: LUN + 10_000,
			k: 'lecon',
			ref: LECON_A,
			avant: epinglees([LECON_A]),
			apres: RIEN_EPINGLE,
		});
		expect(r.etapesCreditees).toEqual(['e1']);
		expect(r.justCompleted).toBe(true); // l'exigence du jour se ramène à ce qui a été fait
		const v = vueSeanceDuJour(LUN + 20_000, RIEN_EPINGLE)!;
		expect(v.etapes[0]).toMatchObject({ requis: 1, fait: 1, reste: 0, epuise: true });
		expect(v).toMatchObject({ complete: true, totalRequis: 1, totalFait: 1 });
		expect(seancesCompletees()).toBe(1);
	});
	it('l’épinglée REVIENT après coup : l’exigence complète reprend, sans seconde récompense', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 3)])]);
		travaillerEpinglee({
			t: LUN + 10_000,
			k: 'lecon',
			ref: LECON_A,
			avant: epinglees([LECON_A]),
			apres: RIEN_EPINGLE,
		});
		expect(seancesCompletees()).toBe(1);
		// Le soir, une autre notion s'épingle : l'étape redevient applicable, donc exigeante.
		const v = vueSeanceDuJour(LUN + 30_000, epinglees([LECON_B]))!;
		expect(v.etapes[0]).toMatchObject({ requis: 3, fait: 1, reste: 2, epuise: false });
		expect(v.complete).toBe(false); // rouvert À L'ÉCRAN
		expect(jourStocke().complete).toBe(true); // mais la récompense reste donnée UNE fois
		const r = travaillerEpinglee({
			t: LUN + 40_000,
			k: 'lecon',
			ref: LECON_B,
			avant: epinglees([LECON_B]),
			apres: epinglees([LECON_B]),
		});
		expect(r).toEqual({ etapesCreditees: ['e1'], justCompleted: false });
		expect(seancesCompletees()).toBe(1);
	});
	it('INCIDENT du 1er août reproduit : leçon « à revoir » + dictée faites hors des tuiles', () => {
		// L'enfant part de l'accueil, prend la carte « À revoir » (leçon épinglée) puis la
		// dictée depuis le catalogue. Aucun marqueur n'est posé sur ce chemin : avant #498 le
		// programme affichait « rien de fait » et l'enfant perdait sa récompense.
		poserDefs([defLundi([etape('e1', 'aRevoir', 1), etape('e2', 'dictee', 1, LISTE_B)])]);
		resoudreProgramme(LUN, epinglees([LECON_A])); // rendu de l'accueil du matin
		poserActivite('lecon', LUN + 600_000, LECON_A); // carte « À revoir » → leçon réussie
		poserActivite('dictee', LUN + 1_200_000, LISTE_B); // catalogue → dictée
		const r = resoudreProgramme(LUN + 1_260_000, RIEN_EPINGLE); // la notion a quitté la file
		expect(r).toEqual({ etapesCreditees: ['e1', 'e2'], justCompleted: true });
		const v = vueSeanceDuJour(LUN + 1_300_000, RIEN_EPINGLE)!;
		expect(v).toMatchObject({ complete: true, totalRequis: 2, totalFait: 2 });
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1', 'e2']);
		expect(seancesCompletees()).toBe(1);
	});
	it('garde-fou : aucune étape en jeu ⇒ pas de programme, et rien n’est célébré', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		// Une passe où rien n'est épinglé et rien n'a été fait : pas de programme du jour.
		expect(resoudreProgramme(LUN, RIEN_EPINGLE).justCompleted).toBe(false);
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)).toBeNull();
		// Même avec une session de leçon au journal : sans épinglée reconnue, rien à créditer.
		poserActivite('lecon', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000, RIEN_EPINGLE)).toEqual({
			etapesCreditees: [],
			justCompleted: false,
		});
		expect(seancesCompletees()).toBe(0);
		expect(jourStocke().complete).toBe(false);
	});
	it('garde-fou : un programme où RIEN n’a été fait n’est jamais complet', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		for (const ctx of [RIEN_EPINGLE, epinglees([LECON_A]), epinglees([], [LISTE_A])]) {
			expect(resoudreProgramme(LUN + 1_000, ctx).justCompleted).toBe(false);
			expect(vueSeanceDuJour(LUN + 1_000, ctx)!.complete).toBe(false);
		}
		expect(seancesCompletees()).toBe(0);
	});
});

/* ============================================================
   5) Complétion : une conditionnelle non applicable ne BLOQUE pas le programme
   ============================================================ */
describe('complétion et étape conditionnelle (#464)', () => {
	it('rien d’épinglé : faire le reste SUFFIT à compléter (l’étape ne bloque pas)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		etatSeanceJour(LUN);
		const r = faireSession('sprint', LUN + 1_000, RIEN_EPINGLE);
		expect(r).toEqual({ etapesCreditees: ['e1'], justCompleted: true });
		expect(seancesCompletees()).toBe(1);
		expect(vueSeanceDuJour(LUN + 5_000, RIEN_EPINGLE)!.complete).toBe(true);
	});
	it('même état, mais une épinglée existe : le programme reste INCOMPLET', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		etatSeanceJour(LUN);
		const ctx = epinglees([LECON_A]);
		expect(faireSession('sprint', LUN + 1_000, ctx)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: false,
		});
		expect(seancesCompletees()).toBe(0);
		const v = vueSeanceDuJour(LUN + 5_000, ctx)!;
		expect(v.restantes.map((x) => x.etape.id)).toEqual(['e2']);
		expect(v).toMatchObject({ complete: false, totalRequis: 2, totalFait: 1 });
	});
	it('count 3 sur la conditionnelle TOUJOURS applicable : trois réalisations pour compléter', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 3)])]);
		const ctx = epinglees([LECON_A], [LISTE_A]); // la file ne se vide pas
		const res = [10_000, 20_000, 30_000].map((dt) =>
			travaillerEpinglee({ t: LUN + dt, k: 'lecon', ref: LECON_A, avant: ctx, apres: ctx }),
		);
		expect(res.map((r) => r.justCompleted)).toEqual([false, false, true]);
		expect(jourStocke().faits.e1).toBe(3);
		expect(seancesCompletees()).toBe(1);
		expect(vueSeanceDuJour(LUN + 40_000, ctx)!.complete).toBe(true);
	});
	it('l’épinglée DISPARAÎT sans que rien d’autre reste : LIRE la vue ne récompense pas', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		etatSeanceJour(LUN);
		// Matin : une épinglée existe, l'enfant ne fait que le sprint → incomplet.
		expect(faireSession('sprint', LUN + 1_000, epinglees([LECON_A])).justCompleted).toBe(false);
		expect(jourStocke().complete).toBe(false);
		// Soir : la notion redevient solide (ou l'adulte désépingle) → plus rien à faire.
		const v = vueSeanceDuJour(LUN + 5_000, RIEN_EPINGLE)!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']);
		expect(v).toMatchObject({ complete: true, totalRequis: 1, totalFait: 1 });
		// La LECTURE reste sans effet de bord : elle dérive « plus rien à faire » mais n'acte
		// pas la récompense, sinon un simple rendu la déclencherait.
		expect(jourStocke().complete).toBe(false);
		expect(seancesCompletees()).toBe(0);
		// C'est la RÉSOLUTION qui l'acte, même sans étape fraîchement réalisée, et une fois.
		expect(resoudreProgramme(LUN + 6_000, RIEN_EPINGLE).justCompleted).toBe(true);
		expect(jourStocke().complete).toBe(true);
		expect(seancesCompletees()).toBe(1);
		for (const dt of [7_000, 8_000]) {
			expect(resoudreProgramme(LUN + dt, RIEN_EPINGLE).justCompleted).toBe(false);
		}
		expect(seancesCompletees()).toBe(1);
	});
	it('la complétion sans étape réalisée n’INVENTE aucune réalisation', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		etatSeanceJour(LUN);
		faireSession('sprint', LUN + 1_000, epinglees([LECON_A]));
		const avant = jourStocke();
		expect(resoudreProgramme(LUN + 5_000, RIEN_EPINGLE).justCompleted).toBe(true);
		const apres = jourStocke();
		expect(apres.faits).toEqual(avant.faits);
		expect(apres.completions).toEqual(avant.completions); // la seule complétion du sprint
	});
	it('une épinglée APPARAÎT après coup : le programme rouvre à l’écran, sans double récompense', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		etatSeanceJour(LUN);
		expect(faireSession('sprint', LUN + 1_000, RIEN_EPINGLE).justCompleted).toBe(true);
		expect(seancesCompletees()).toBe(1);
		expect(jourStocke().complete).toBe(true); // mémoire de la récompense donnée
		// Après-midi : une notion s'épingle → une étape apparaît, il reste à faire.
		const ctx = epinglees([LECON_A]);
		const v = vueSeanceDuJour(LUN + 5_000, ctx)!;
		expect(v.complete).toBe(false); // DÉRIVÉ (« plus rien à faire »), pas l'état stocké
		expect(v.restantes.map((x) => x.etape.id)).toEqual(['e2']);
		expect(v).toMatchObject({ totalRequis: 2, totalFait: 1 });
		// L'enfant fait l'étape « à revoir » : créditée, mais PAS de seconde célébration.
		const r = travaillerEpinglee({
			t: LUN + 10_000,
			k: 'lecon',
			ref: LECON_A,
			avant: ctx,
			apres: ctx,
		});
		expect(r).toEqual({ etapesCreditees: ['e2'], justCompleted: false });
		expect(seancesCompletees()).toBe(1); // jamais deux récompenses le même jour
		expect(vueSeanceDuJour(LUN + 20_000, ctx)!.complete).toBe(true);
	});
	it('MONOTONIE : une étape qui réapparaît puis avance ne fait pas redescendre la mémoire', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 2)])]);
		etatSeanceJour(LUN);
		expect(faireSession('sprint', LUN + 1_000, RIEN_EPINGLE).justCompleted).toBe(true);
		const ctx = epinglees([LECON_A]);
		// 1re des 2 réalisations de l'étape réapparue : créditée, programme rouvert à l'écran.
		const r1 = travaillerEpinglee({
			t: LUN + 10_000,
			k: 'lecon',
			ref: LECON_A,
			avant: ctx,
			apres: ctx,
		});
		expect(r1).toEqual({ etapesCreditees: ['e2'], justCompleted: false });
		expect(jourStocke().complete).toBe(true); // mémoire monotone
		expect(vueSeanceDuJour(LUN + 15_000, ctx)!.complete).toBe(false); // 1/2 → il reste
		const r2 = travaillerEpinglee({
			t: LUN + 20_000,
			k: 'lecon',
			ref: LECON_A,
			avant: ctx,
			apres: ctx,
		});
		expect(r2).toEqual({ etapesCreditees: ['e2'], justCompleted: false });
		expect(seancesCompletees()).toBe(1); // une seule récompense sur la journée
		expect(vueSeanceDuJour(LUN + 25_000, ctx)!.complete).toBe(true);
	});
	it('resoudreProgramme SANS contexte = rien d’épinglé (défaut prudent)', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		etatSeanceJour(LUN);
		poserActivite('lecon', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000).etapesCreditees).toEqual([]); // aucun 2e argument
		// La même session serait créditée si la file du jour était fournie… mais le curseur a
		// déjà avancé : c'est bien le contexte, et lui seul, qui fait la différence.
		poserActivite('lecon', LUN + 3_000, LECON_A);
		expect(resoudreProgramme(LUN + 4_000, epinglees([LECON_A])).etapesCreditees).toEqual(['e1']);
	});
});

/* ============================================================
   6) Mémo des épinglées VUES dans la journée (#498)
   Raison d'être : la notion réussie quitte la file AVANT la passe d'attribution. Sans
   mémoire de ce qui était épinglé quand l'accueil s'est affiché, la session qui vient de
   faire sortir la notion serait méconnaissable — le crédit se perdrait.
   ============================================================ */
describe('mémo des épinglées vues (SeanceJour.aRevoirVus)', () => {
	it('épinglée vue à une passe PRÉCÉDENTE : la session reste reconnaissable plus tard', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		resoudreProgramme(LUN, epinglees([], [LISTE_A])); // rendu de l'accueil : file vue
		poserActivite('dictee', LUN + 10_000, LISTE_A); // dictée réussie → sort de la file
		expect(resoudreProgramme(LUN + 11_000, RIEN_EPINGLE)).toEqual({
			etapesCreditees: ['e1'],
			justCompleted: true,
		});
	});
	it('UNION des files vues : deux notions différentes dans la journée restent reconnaissables', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		resoudreProgramme(LUN, epinglees([LECON_A])); // matin : A épinglée
		resoudreProgramme(LUN + 1_000, epinglees([LECON_B])); // midi : A sortie, B épinglée
		poserActivite('lecon', LUN + 2_000, LECON_A);
		poserActivite('lecon', LUN + 3_000, LECON_B);
		const r = resoudreProgramme(LUN + 4_000, RIEN_EPINGLE); // soir : file vide
		expect(r).toEqual({ etapesCreditees: ['e1', 'e1'], justCompleted: true });
		expect(jourStocke().faits.e1).toBe(2);
	});
	it('épinglée disparue puis REVENUE : le mémo ne se perd pas entre-temps', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		resoudreProgramme(LUN, epinglees([LECON_A]));
		resoudreProgramme(LUN + 1_000, RIEN_EPINGLE); // passes à vide (accueil rendu plusieurs fois)
		resoudreProgramme(LUN + 2_000, RIEN_EPINGLE);
		resoudreProgramme(LUN + 3_000, epinglees([LECON_A]));
		poserActivite('lecon', LUN + 4_000, LECON_A);
		expect(resoudreProgramme(LUN + 5_000, RIEN_EPINGLE).etapesCreditees).toEqual(['e1']);
	});
	it('mémo remis à zéro au passage de MINUIT (une file d’hier ne crédite pas aujourd’hui)', () => {
		poserDefs([defLunMar([etape('e1', 'aRevoir', 1)])]);
		resoudreProgramme(LUN, epinglees([LECON_A])); // lundi : A épinglée et vue
		resoudreProgramme(MAR, RIEN_EPINGLE); // mardi : état neuf, mémo vierge
		poserActivite('lecon', MAR + 1_000, LECON_A);
		expect(resoudreProgramme(MAR + 2_000, RIEN_EPINGLE).etapesCreditees).toEqual([]);
		// Et c'est bien le mémo (pas le curseur) qui manquait : la file du jour fournie, la
		// session suivante est créditée.
		poserActivite('lecon', MAR + 3_000, LECON_A);
		expect(resoudreProgramme(MAR + 4_000, epinglees([LECON_A])).etapesCreditees).toEqual(['e1']);
	});
});

/* ============================================================
   7) Attribution : la NATURE de la session compte (leçon OU dictée)
   ============================================================ */
describe('attribution d’une étape « à revoir » (#464/#498)', () => {
	it('épinglée = DICTÉE : une leçon portant le même id ne crédite pas, la dictée oui', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		const ctx = epinglees([], [LISTE_A]);
		resoudreProgramme(LUN, ctx);
		poserActivite('lecon', LUN + 1_000, LISTE_A); // autre chose qu'une dictée
		expect(resoudreProgramme(LUN + 2_000, ctx).etapesCreditees).toEqual([]);
		poserActivite('dictee', LUN + 3_000, LISTE_A);
		expect(resoudreProgramme(LUN + 4_000, ctx).etapesCreditees).toEqual(['e1']);
		expect(jourStocke().completions[0]).toMatchObject({
			etapeId: 'e1',
			kind: 'aRevoir',
			ref: LISTE_A, // la cible VUE, pour la métrique
			ts: LUN + 3_000,
		});
	});
	it('épinglée = LEÇON : une dictée ne crédite pas, la leçon oui', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		const ctx = epinglees([LECON_A]);
		resoudreProgramme(LUN, ctx);
		poserActivite('dictee', LUN + 1_000, LECON_A);
		expect(resoudreProgramme(LUN + 2_000, ctx).etapesCreditees).toEqual([]);
		poserActivite('lecon', LUN + 3_000, LECON_A);
		expect(resoudreProgramme(LUN + 4_000, ctx).etapesCreditees).toEqual(['e1']);
		expect(jourStocke().completions[0]).toMatchObject({ kind: 'aRevoir', ref: LECON_A });
	});
	it('une notion NON épinglée travaillée ne crédite pas l’étape', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1)])]);
		const ctx = epinglees([LECON_A]);
		resoudreProgramme(LUN, ctx);
		poserActivite('lecon', LUN + 1_000, LECON_B); // leçon libre, hors file
		expect(resoudreProgramme(LUN + 2_000, ctx).etapesCreditees).toEqual([]);
		expect(vueSeanceDuJour(LUN + 3_000, ctx)!.totalFait).toBe(0);
	});
	it('deux réalisations, deux natures : chaque complétion garde SA cible', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 2)])]);
		const ctx = epinglees([LECON_A], [LISTE_A]);
		resoudreProgramme(LUN, ctx);
		poserActivite('lecon', LUN + 1_000, LECON_A);
		poserActivite('dictee', LUN + 2_000, LISTE_A);
		expect(resoudreProgramme(LUN + 3_000, ctx).justCompleted).toBe(true);
		expect(jourStocke().completions.map((c) => c.ref)).toEqual([LECON_A, LISTE_A]);
	});
	it('l’étape « à revoir » ne contamine pas les autres étapes du programme', () => {
		poserDefs([defLundi([etape('e1', 'aRevoir', 1), etape('e2', 'lecon', 1, LECON_B)])]);
		const ctx = epinglees([], [LISTE_A]);
		resoudreProgramme(LUN, ctx);
		// L'enfant fait la dictée épinglée : seule l'étape « à revoir » est créditée.
		poserActivite('dictee', LUN + 1_000, LISTE_A);
		expect(resoudreProgramme(LUN + 2_000, ctx).etapesCreditees).toEqual(['e1']);
		expect(jourStocke().faits.e2 ?? 0).toBe(0);
		// Puis la leçon configurée par l'adulte : créditée avec SA propre référence.
		poserActivite('lecon', LUN + 3_000, LECON_B);
		expect(resoudreProgramme(LUN + 4_000, ctx).justCompleted).toBe(true);
		expect(jourStocke().completions.map((c) => [c.etapeId, c.kind, c.ref])).toEqual([
			['e1', 'aRevoir', LISTE_A],
			['e2', 'lecon', LECON_B],
		]);
	});
});

/* ============================================================
   8) Archivage / journal de séances (inchangé par la conditionnelle)
   ============================================================ */
describe('archivage au passage de minuit avec une conditionnelle (#464)', () => {
	it('la séance d’hier est archivée avec l’étape « à revoir » et sa cible', () => {
		poserDefs([defLunMar([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		const ctx = epinglees([], [LISTE_A]);
		marquerEtapeLancee('e1', LUN); // lancé depuis la tuile : debutTs = LUN
		poserActivite('sprint', LUN + 20_000);
		resoudreProgramme(LUN + 21_000, ctx);
		poserActivite('dictee', LUN + 60_000, LISTE_A);
		expect(resoudreProgramme(LUN + 61_000, ctx).justCompleted).toBe(true);
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
			['e2', 'aRevoir', LISTE_A],
		]);
		// Durées : le sprint est daté par son marqueur (20 s), la dictée non (hors programme).
		expect(journal[0]).toMatchObject({ dureeActiveMs: 20_000, dureeTotaleMs: 60_000 });
	});
	it('l’archive porte la MÉMOIRE de récompense, pas « toutes les étapes du jour faites »', () => {
		// Récompense donnée le matin (rien d'épinglé), puis une épinglée apparaît et reste non
		// faite : la mémoire étant monotone, la séance s'archive `complete: true` avec 1 étape
		// sur 2. Sémantique à connaître pour un futur récap encadrant.
		poserDefs([defLunMar([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		etatSeanceJour(LUN);
		faireSession('sprint', LUN + 1_000, RIEN_EPINGLE);
		expect(vueSeanceDuJour(LUN + 5_000, epinglees([LECON_A]))!.complete).toBe(false);
		vueSeanceDuJour(MAR, epinglees([LECON_A])); // passage de minuit → archivage
		const journal = chargerJournalSeances();
		expect(journal).toHaveLength(1);
		expect(journal[0]).toMatchObject({ date: '2026-01-05', complete: true });
		expect(journal[0].etapes.map((c) => c.etapeId)).toEqual(['e1']);
	});
	it('une séance partielle est archivée MÊME si la vue du lendemain est nulle', () => {
		// Définition réduite à la conditionnelle : mardi, rien d'épinglé ⇒ « pas de programme ».
		// L'archivage d'hier ne doit pas être escamoté pour autant (métriques encadrant).
		poserDefs([defLunMar([etape('e1', 'aRevoir', 2)])]);
		const ctx = epinglees([LECON_A]);
		travaillerEpinglee({ t: LUN + 10_000, k: 'lecon', ref: LECON_A, avant: ctx, apres: ctx });
		expect(jourStocke().completions).toHaveLength(1);
		expect(vueSeanceDuJour(MAR, RIEN_EPINGLE)).toBeNull();
		const journal = chargerJournalSeances();
		expect(journal).toHaveLength(1);
		expect(journal[0]).toMatchObject({ date: '2026-01-05', complete: false });
		expect(journal[0].etapes).toHaveLength(1);
	});
});

/* ============================================================
   9) tirerParmi — tirage déterministe du pool épinglé (helper pur)
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

/* Non-régression #463 : `tirerCible` (dictées configurées) est bâti sur `tirerParmi`. Son
   contrat observable ne doit pas avoir bougé — même politique de tirage, et toujours sur
   les cibles VALIDES (une cible obsolète reste inatteignable). */
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
   10) countRequis — « combien de fois » BORNÉ à 1
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
			// Rendu de l'accueil (résolution + lecture) : rien ne doit s'acter sans activité.
			expect(resoudreProgramme(LUN, RIEN_EPINGLE).justCompleted).toBe(false);
			expect(resoudreProgramme(LUN + 1_000).justCompleted).toBe(false); // ctx omis idem
			expect(seancesCompletees()).toBe(0);
			expect(jourStocke().complete).toBe(false);
			// La jauge présente bien un passage à faire (« × 1 » ordinaire).
			const v = vueSeanceDuJour(LUN + 2_000, RIEN_EPINGLE)!;
			expect(v).toMatchObject({ complete: false, totalRequis: 1, totalFait: 0 });
			expect(v.etapes[0]).toMatchObject({ requis: 1, fait: 0, reste: 1, epuise: false });
			expect(v.restantes.map((x) => x.etape.id)).toEqual(['e1']);
		});
		it(`${libelle} : UN passage suffit et ne crédite qu’une fois`, () => {
			poserDefBrute(json);
			etatSeanceJour(LUN);
			const r = faireSession('sprint', LUN + 1_000, RIEN_EPINGLE);
			expect(r).toEqual({ etapesCreditees: ['e1'], justCompleted: true });
			expect(jourStocke().faits.e1).toBe(1); // plafonné à countRequis, pas de sur-crédit
			expect(seancesCompletees()).toBe(1);
			const v = vueSeanceDuJour(LUN + 5_000, RIEN_EPINGLE)!;
			expect(v).toMatchObject({ complete: true, totalRequis: 1, totalFait: 1 });
			expect(v.etapes[0]).toMatchObject({ requis: 1, fait: 1, reste: 0, epuise: true });
			// Un passage de plus ne rend ni sur-crédit ni seconde récompense.
			expect(faireSession('sprint', LUN + 10_000).justCompleted).toBe(false);
			expect(jourStocke().faits.e1).toBe(1);
			expect(seancesCompletees()).toBe(1);
		});
	}
	it('étape « à revoir » à count dégradé : escamotée sans rien célébrer, sinon « × 1 »', () => {
		poserDefBrute('{"id":"e1","kind":"aRevoir","count":0}');
		// Rien d'épinglé, rien de fait : aucune étape en jeu ⇒ pas de programme, pas de récompense.
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)).toBeNull();
		expect(resoudreProgramme(LUN + 1_000, RIEN_EPINGLE).justCompleted).toBe(false);
		expect(seancesCompletees()).toBe(0);
		// Une épinglée existe : l'étape s'applique et vaut un passage.
		const ctx = epinglees([LECON_A]);
		expect(resoudreProgramme(LUN + 2_000, ctx).justCompleted).toBe(false); // rien de fait encore
		expect(vueSeanceDuJour(LUN + 3_000, ctx)!).toMatchObject({ complete: false, totalRequis: 1 });
		const r = travaillerEpinglee({ t: LUN + 10_000, k: 'lecon', ref: LECON_A, avant: ctx });
		expect(r.justCompleted).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});
	it('count dégradé mêlé à une étape normale : la normale reste due', () => {
		poserDefBrute('{"id":"e1","kind":"sprint","count":0},{"id":"e2","kind":"revision","count":2}');
		expect(vueSeanceDuJour(LUN, RIEN_EPINGLE)!).toMatchObject({ totalRequis: 3 }); // 1 + 2
		expect(faireSession('sprint', LUN + 1_000).justCompleted).toBe(false); // e2 reste (0/2)
		expect(seancesCompletees()).toBe(0);
		expect(faireSession('revision', LUN + 10_000).justCompleted).toBe(false); // 1/2
		expect(faireSession('revision', LUN + 20_000).justCompleted).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});
});
