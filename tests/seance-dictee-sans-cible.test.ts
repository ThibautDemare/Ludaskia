/* ============================================================
   Étape « Une dictée » SANS aucune cible atteignable (#657) — logique pure de
   src/core/seance.ts.

   Auteur des tests DISTINCT de l'auteur du code, et tests écrits AVANT l'implémentation :
   les attendus sont dérivés des critères d'acceptation de l'issue, jamais recopiés du code
   (qui, au moment où ce fichier est écrit, fait exactement le contraire — cf. #657 :
   `etapeConfiguree` déclare TOUJOURS configurée une étape « dictée », même sans cible).

   Le défaut tenu ici : une étape « Une dictée » dont plus aucune cible n'est proposable
   reste au programme du jour sous forme de tuile morte, et — c'est le vrai dégât —
   `restantes` ne se vide jamais, donc le programme ne peut PLUS être déclaré terminé.
   L'enfant perd fête, trophée et compteur pour une case que personne ne peut cocher.

   Quatre chemins mènent au même état, et ils ne laissent PAS la même donnée stockée :
     1. profil sans aucune liste à la création de l'étape → `refs` jamais posé ;
     2. l'adulte décoche toutes les cases → `refs: []` ;
     3. la liste visée est supprimée après coup → `refs: ['…']` orphelin ;
     4. le programme est copié vers un profil qui n'a pas ces listes → même forme que 3,
        mais atteinte sans que personne n'ait touché à la définition.
   S'y ajoute l'ancien champ unique `ref` (rétrocompat #463), qui peut lui aussi pointer
   dans le vide. Les cinq doivent s'escamoter de la même façon.

   Cibles symétriques déjà traitées ailleurs, et NON redoublées ici : « une leçon précise »
   sans cible (#556, tests/seance.test.ts) et « à revoir » sans épingle (#464,
   tests/seance-a-revoir.test.ts) ; la normalisation du pool (`ciblesEtape`,
   `ciblesValides`, `tirerCible`) vit dans tests/seance-dictee-pool.test.ts.

   Ce qui est HORS de ce fichier : la CONSTRUCTION de `dicteesDisponibles` (côté UI, elle
   dépend des listes du profil et de la dispo du TTS) et l'écran encadrant → e2e.

   Repère calendaire (heure LOCALE) : 2026-01-05 = lundi (ISO 1).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	CONTEXTE_VIDE,
	etapeConfiguree,
	etapeApplicable,
	estimationDureeMin,
	vueSeanceDuJour,
	resoudreProgramme,
	seancesCompletees,
	chargerSeancesFor,
	enregistrerSeancesFor,
	copierSeances,
	type ContexteSeance,
	type ResolutionSeance,
	type SeanceDef,
	type SeanceEtape,
	type SeanceModeKind,
} from '../src/core/seance';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSet } from '../src/core/storage';
import { ACTIVITY_KEY, type ActivityKind } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Instant de référence (heure locale) ---------- */
const LUN = new Date(2026, 0, 5).getTime(); // lundi, ISO 1

/* ---------- Cibles ---------- */
const LISTE_A = 'fr-ortho-invariables-1';
const LISTE_B = 'fr-ortho-son-eu-1';
const DISPARUE = 'fr-ortho-liste-supprimee';
const DISPARUE_2 = 'fr-ortho-liste-supprimee-2';
const LECON_A = 'math-doubles';

/** Des dictées SONT proposables au profil — simplement, aucune de celles que l'étape vise.
    Liste volontairement NON vide : un escamotage qui ne marcherait que « quand il n'y a
    aucune dictée du tout » raterait les cas 2, 3 et 4 du défaut. */
const DISPO = [LISTE_A, LISTE_B];

/* ---------- Fabriques ---------- */
function ctx(
	o: { lecons?: string[]; dictees?: string[]; disponibles?: string[] } = {},
): ContexteSeance {
	return {
		aRevoirLecons: o.lecons ?? [],
		aRevoirDictees: o.dictees ?? [],
		dicteesDisponibles: o.disponibles ?? [],
	};
}
function etape(id: string, kind: SeanceModeKind, count = 1, ref?: string): SeanceEtape {
	return ref === undefined ? { id, kind, count } : { id, kind, count, ref };
}
/** Étape dictée : pool (`refs`), cible unique legacy (`ref`), ou rien du tout. */
function etapeDictee(
	id: string,
	o: { ref?: string; refs?: string[]; count?: number } = {},
): SeanceEtape {
	const e: SeanceEtape = { id, kind: 'dictee', count: o.count ?? 1 };
	if (o.ref !== undefined) e.ref = o.ref;
	if (o.refs !== undefined) e.refs = o.refs;
	return e;
}
function defLundi(etapes: SeanceEtape[], id = 'd1'): SeanceDef {
	return { id, etapes, recurrence: { type: 'hebdo', jours: [1] } };
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
/** Ouvre l'état du jour AVANT toute session : la passe d'attribution ne regarde que les
    activités postérieures à son curseur (`vuTs`), posé à la création de l'état. Sans ce
    premier passage, une session semée « avant l'ouverture » ne serait jamais créditée et
    le test échouerait pour une raison étrangère à #657. */
function ouvrirJour(t: number, c: ContexteSeance): void {
	resoudreProgramme(t, c);
}
/** Une session faite puis un retour à l'accueil (passe d'attribution). */
function faire(k: ActivityKind, t: number, c: ContexteSeance, ref?: string): ResolutionSeance {
	poserActivite(k, t, ref);
	return resoudreProgramme(t + 1_000, c);
}

/* ---------- Les cinq états stockés « sans cible atteignable » ---------- */
interface CasSansCible {
	nom: string;
	etape: (id: string) => SeanceEtape;
}
const SANS_CIBLE: CasSansCible[] = [
	{
		nom: 'aucun `refs` posé (profil sans la moindre liste à la création de l’étape)',
		etape: (id) => etapeDictee(id),
	},
	{
		nom: '`refs: []` (l’adulte a décoché toutes les cases)',
		etape: (id) => etapeDictee(id, { refs: [] }),
	},
	{
		nom: '`refs` orphelin (la liste visée a été supprimée depuis)',
		etape: (id) => etapeDictee(id, { refs: [DISPARUE] }),
	},
	{
		nom: 'pool entier orphelin (programme copié vers un profil qui n’a pas ces listes)',
		etape: (id) => etapeDictee(id, { refs: [DISPARUE, DISPARUE_2] }),
	},
	{
		nom: 'ancien champ `ref` unique pointant une liste disparue (rétrocompat #463)',
		etape: (id) => etapeDictee(id, { ref: DISPARUE }),
	},
];

/* ============================================================
   1) etapeConfiguree — la définition seule (lecture encadrant)
   ============================================================ */
describe('etapeConfiguree : une dictée n’est configurée que si une cible reste atteignable (#657)', () => {
	for (const cas of SANS_CIBLE) {
		it(`non configurée — ${cas.nom}`, () => {
			expect(etapeConfiguree(cas.etape('e1'), DISPO)).toBe(false);
		});
	}

	/* Critère 7 (négatif). VERT dès l'écriture : aujourd'hui une dictée est toujours dite
	   configurée, donc l'assertion passe pour la mauvaise raison.
	   MUTATION qui le rougirait : exiger que TOUTES les cibles soient disponibles
	   (`ciblesEtape(e).every(...)` au lieu de `some(...)`) — avec deux cibles sur trois
	   disparues, l'étape deviendrait non configurée et l'enfant perdrait une dictée qu'il
	   peut parfaitement faire. */
	it('une seule cible survivante sur trois suffit (critère 7)', () => {
		const e = etapeDictee('e1', { refs: [DISPARUE, LISTE_B, DISPARUE_2] });
		expect(etapeConfiguree(e, DISPO)).toBe(true);
		// Cible unique encore proposée : le cas « dictée figée » reste entier.
		expect(etapeConfiguree(etapeDictee('e1', { refs: [LISTE_A] }), DISPO)).toBe(true);
		expect(etapeConfiguree(etapeDictee('e1', { ref: LISTE_A }), DISPO)).toBe(true);
	});

	/* Défaut de l'API annoncée par le contrat #657 (pas un critère de l'issue) : un appelant
	   qui n'a pas de liste à fournir escamote l'étape plutôt que de la promettre — même
	   prudence que `CONTEXTE_VIDE` pour « à revoir ». */
	it('argument omis = aucune dictée réputée disponible (défaut prudent)', () => {
		expect(etapeConfiguree(etapeDictee('e1', { refs: [LISTE_A] }))).toBe(false);
		expect(CONTEXTE_VIDE.dicteesDisponibles).toEqual([]);
	});
});

/* ============================================================
   2) etapeApplicable — la même règle vue du jour
   ============================================================ */
describe('etapeApplicable : la tuile morte ne s’applique pas (critère 3, #657)', () => {
	for (const cas of SANS_CIBLE) {
		it(`jamais applicable — ${cas.nom}`, () => {
			const e = cas.etape('e1');
			expect(etapeApplicable(e, ctx({ disponibles: DISPO }))).toBe(false);
			// Ce n'est pas non plus la file « à revoir » qui la rattrape : elle ne dit rien de
			// ce que l'étape vise.
			expect(etapeApplicable(e, ctx({ dictees: [LISTE_A], disponibles: DISPO }))).toBe(false);
		});
	}

	/* Critère 7 + critère 8, versant comportement. VERT dès l'écriture (une dictée est
	   aujourd'hui toujours applicable).
	   MUTATION qui le rougirait : purger les cibles obsolètes au chargement
	   (`etape.refs = ciblesValides(etape, dispo)`) — l'étape survivrait au premier jour puis
	   deviendrait morte dès que la liste redeviendrait disponible, et la seconde assertion
	   tomberait. */
	it('une cible de nouveau proposée fait revenir l’étape telle quelle (critères 7 et 8)', () => {
		const e = etapeDictee('e1', { refs: [DISPARUE, LISTE_B] });
		expect(etapeApplicable(e, ctx({ disponibles: [] }))).toBe(false); // plus rien de proposable
		expect(etapeApplicable(e, ctx({ disponibles: DISPO }))).toBe(true); // LISTE_B est là
		expect(e.refs).toEqual([DISPARUE, LISTE_B]); // l'étape n'a pas été retouchée en passant
	});
});

/* ============================================================
   3) vueSeanceDuJour — ce que l'enfant voit (critère 3)
   ============================================================ */
describe('vueSeanceDuJour : l’étape sans cible disparaît du programme de l’enfant (critère 3)', () => {
	for (const cas of SANS_CIBLE) {
		it(`absente des étapes et des restantes — ${cas.nom}`, () => {
			poserDefs([defLundi([etape('e1', 'sprint', 1), cas.etape('e2')])]);
			const v = vueSeanceDuJour(LUN, ctx({ disponibles: DISPO }))!;
			expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']);
			expect(v.restantes.map((x) => x.etape.id)).toEqual(['e1']);
			// Le décompte annoncé à l'enfant ne promet pas davantage (critère 5, côté vue).
			expect(v.totalRequis).toBe(1);
		});
	}

	/* Même garde-fou que #464 : un programme réduit à une étape escamotée n'est pas un
	   programme VIDE, c'est pas de programme du tout. */
	it('la dictée morte SEULE : pas de programme du jour (jamais un programme vide)', () => {
		poserDefs([defLundi([etapeDictee('e1', { refs: [DISPARUE] })])]);
		expect(vueSeanceDuJour(LUN, ctx({ disponibles: DISPO }))).toBeNull();
	});
});

/* ============================================================
   4) Complétion — le vrai dégât du défaut (critère 4)
   ============================================================ */
describe('complétion : l’étape sans cible ne bloque plus le programme (critère 4, #657)', () => {
	it('le sprint fait suffit : programme terminé, célébré une seule fois', () => {
		const c = ctx({ disponibles: DISPO });
		poserDefs([defLundi([etape('e1', 'sprint', 1), etapeDictee('e2', { refs: [DISPARUE] })])]);
		expect(vueSeanceDuJour(LUN, c)!.complete).toBe(false); // rien de fait : normal

		const r = faire('sprint', LUN + 10_000, c);
		expect(r.etapesCreditees).toEqual(['e1']);
		expect(r.justCompleted).toBe(true);

		const v = vueSeanceDuJour(LUN + 20_000, c)!;
		expect(v.restantes).toEqual([]);
		expect(v.complete).toBe(true);
		expect(seancesCompletees()).toBe(1); // trophée/compteur enfin crédités
	});

	it('un « ×3 » sans cible ne réclame pas trois passages introuvables', () => {
		const c = ctx({ disponibles: DISPO });
		poserDefs([
			defLundi([
				etape('e1', 'lecon', 1, LECON_A),
				etapeDictee('e2', { refs: [DISPARUE], count: 3 }),
				etape('e3', 'sprint', 1),
			]),
		]);
		ouvrirJour(LUN, c);
		faire('lecon', LUN + 10_000, c, LECON_A);
		const r = faire('sprint', LUN + 20_000, c);
		expect(r.justCompleted).toBe(true);
		const v = vueSeanceDuJour(LUN + 30_000, c)!;
		expect(v.complete).toBe(true);
		expect(v.totalRequis).toBe(2); // la leçon et le sprint, pas les 3 dictées fantômes
		expect(v.totalFait).toBe(2);
	});

	it('la même définition, la liste retrouvée : le programme redevient exigeant (critère 7)', () => {
		// Contre-épreuve du test précédent : si la cible est proposable, l'étape compte.
		// MUTATION qui rougirait ce test : escamoter la dictée dès qu'UNE cible manque.
		const c = ctx({ disponibles: [DISPARUE, LISTE_A] });
		poserDefs([defLundi([etape('e1', 'sprint', 1), etapeDictee('e2', { refs: [DISPARUE] })])]);
		ouvrirJour(LUN, c);
		const r = faire('sprint', LUN + 10_000, c);
		expect(r.justCompleted).toBe(false);
		const v = vueSeanceDuJour(LUN + 20_000, c)!;
		expect(v.complete).toBe(false);
		expect(v.restantes.map((x) => x.etape.id)).toEqual(['e2']);
	});
});

/* ============================================================
   5) estimationDureeMin — la carte encadrant (critère 5)
   ============================================================ */
describe('estimationDureeMin : la dictée morte n’est ni comptée ni chiffrée (critère 5)', () => {
	// Durées documentées (spec #440) : sprint 5, dictee 10, lecon 7.
	for (const cas of SANS_CIBLE) {
		it(`hors de la durée estimée — ${cas.nom}`, () => {
			const d = defLundi([etape('e1', 'sprint', 1), cas.etape('e2')]);
			expect(estimationDureeMin(d, DISPO)).toBe(5); // le sprint seul
		});
	}

	it('la même étape chiffre ses 10 min par passage dès que sa liste est proposée', () => {
		const d = defLundi([
			etape('e1', 'sprint', 1),
			etapeDictee('e2', { refs: [LISTE_A], count: 2 }),
		]);
		expect(estimationDureeMin(d, DISPO)).toBe(5 + 2 * 10);
		expect(estimationDureeMin(d, [])).toBe(5); // plus aucune dictée proposable
	});

	/* Critère 7, versant chiffre. MUTATION qui le rougirait : chiffrer au PRORATA des cibles
	   encore valides (2/3 des passages) — l'enfant fera pourtant bien ses 2 dictées. */
	it('un pool partiellement disparu compte PLEIN (critère 7)', () => {
		const d = defLundi([etapeDictee('e1', { refs: [DISPARUE, LISTE_B, DISPARUE_2], count: 2 })]);
		expect(estimationDureeMin(d, DISPO)).toBe(2 * 10);
	});

	/* Défaut de l'API annoncée par le contrat #657 (pas un critère de l'issue). */
	it('argument omis = aucune dictée réputée disponible (défaut prudent)', () => {
		const d = defLundi([etape('e1', 'sprint', 1), etapeDictee('e2', { refs: [LISTE_A] })]);
		expect(estimationDureeMin(d)).toBe(5);
	});
});

/* ============================================================
   6) Critère 8 (négatif) — aucune donnée réécrite en silence
   ============================================================ */
describe('critère 8 : la définition stockée n’est jamais purgée en douce (#657)', () => {
	/* VERT dès l'écriture : rien ne purge aujourd'hui.
	   MUTATION qui le rougirait : « nettoyer » la définition au passage (dans
	   `resoudreProgramme` ou la vue : `e.refs = ciblesValides(e, dispo)`, ou filtrer
	   `def.etapes` avant `enregistrerSeancesFor`). L'adulte perdrait sans le savoir la
	   consigne qu'il avait posée, et l'étape ne pourrait plus revenir. */
	it('lecture de la vue et passe d’attribution laissent `refs` intact', () => {
		const c = ctx({ disponibles: DISPO });
		const defs = [defLundi([etape('e1', 'sprint', 1), etapeDictee('e2', { refs: [DISPARUE] })])];
		poserDefs(defs);
		const uuid = activeProfile().uuid;

		vueSeanceDuJour(LUN, c);
		faire('sprint', LUN + 10_000, c);
		vueSeanceDuJour(LUN + 20_000, c);

		const relu = chargerSeancesFor(uuid);
		expect(relu[0].etapes.map((e) => e.id)).toEqual(['e1', 'e2']); // l'étape reste dans la def
		expect(relu[0].etapes[1].refs).toEqual([DISPARUE]); // la consigne de l'adulte est gardée
		expect(relu).toEqual(defs);
	});

	it('programme copié vers un profil sans ces listes : refs conservés des deux côtés', () => {
		const source = activeProfile().uuid;
		const defs = [defLundi([etape('e1', 'sprint', 1), etapeDictee('e2', { refs: [LISTE_A] })])];
		enregistrerSeancesFor(source, defs);

		const b = addProfile('Profil B'); // le nouveau profil n'a aucune liste d'orthographe
		copierSeances(source, b.uuid);
		setActiveProfile(b.uuid);

		// Chez B, l'étape est morte (aucune liste proposable) : elle s'escamote à l'affichage…
		const v = vueSeanceDuJour(LUN, ctx({ disponibles: [] }))!;
		// … mais la définition copiée garde ses refs, chez B comme chez la source (critère 8 :
		// c'est l'assertion utile de ce test, évaluée AVANT celle du critère 3 qui, elle, est
		// rouge tant que #657 n'est pas implémentée).
		expect(chargerSeancesFor(b.uuid)).toEqual(defs);
		expect(chargerSeancesFor(source)).toEqual(defs);
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']);
	});
});

/* ============================================================
   7) Critère 9 (négatif) — les autres natures ne bougent pas
   ============================================================ */
describe('critère 9 : les autres natures d’étape gardent leur comportement (#657)', () => {
	/* VERT dès l'écriture (rien de tout ça ne change).
	   MUTATION qui le rougirait : appliquer la règle de disponibilité à TOUTES les natures
	   (par exemple `ciblesEtape(e).some((c) => dispo.includes(c))` sans le garde
	   `kind === 'dictee'`) — sprint, révision et leçon du jour n'ont aucune cible, elles
	   deviendraient toutes non applicables et le programme entier disparaîtrait. */
	it('sprint / révision / leçon du jour : applicables sans aucune dictée disponible', () => {
		for (const k of ['sprint', 'revision', 'leconDuJour'] as SeanceModeKind[]) {
			expect(etapeConfiguree(etape('e1', k), []), k).toBe(true);
			expect(etapeApplicable(etape('e1', k), ctx({ disponibles: [] })), k).toBe(true);
		}
	});

	/* MUTATION qui le rougirait : brancher « une leçon précise » sur `dicteesDisponibles`
	   (copier-coller de la nouvelle règle d'une nature à l'autre) — la leçon ciblée
	   deviendrait non applicable alors qu'elle n'a rien à voir avec les dictées. */
	it('« une leçon précise » dépend de SA cible, pas des dictées disponibles (#556)', () => {
		expect(etapeApplicable(etape('e1', 'lecon'), ctx({ disponibles: DISPO }))).toBe(false);
		expect(etapeApplicable(etape('e1', 'lecon', 1, LECON_A), ctx({ disponibles: [] }))).toBe(true);
		expect(etapeConfiguree(etape('e1', 'lecon', 1, LECON_A), [])).toBe(true);
		expect(etapeConfiguree(etape('e1', 'lecon'), DISPO)).toBe(false);
	});

	/* MUTATION qui le rougirait : faire dépendre `aRevoir` des dictées disponibles (au lieu
	   de la file épinglée) — une liste épinglée mais hors des proposables ferait disparaître
	   l'étape, et une dictée disponible non épinglée la ferait apparaître à vide. */
	it('« à revoir » dépend de la file épinglée, pas des dictées disponibles (#464)', () => {
		const e = etape('e1', 'aRevoir');
		expect(etapeApplicable(e, ctx({ dictees: [DISPARUE], disponibles: [] }))).toBe(true);
		expect(etapeApplicable(e, ctx({ lecons: [LECON_A], disponibles: [] }))).toBe(true);
		expect(etapeApplicable(e, ctx({ disponibles: DISPO }))).toBe(false);
	});

	/* MUTATION qui le rougirait : filtrer l'estimation sur les dictées disponibles sans
	   distinguer la nature de l'étape (toutes les durées tomberaient à 0 avec une liste
	   vide). */
	it('estimation : les natures sans cible de dictée ne bougent pas avec la liste', () => {
		const d = defLundi([
			etape('e1', 'sprint', 2),
			etape('e2', 'revision', 1),
			etape('e3', 'leconDuJour', 1),
			etape('e4', 'lecon', 1, LECON_A),
			etape('e5', 'aRevoir', 1),
		]);
		expect(estimationDureeMin(d, [])).toBe(estimationDureeMin(d, DISPO));
		expect(estimationDureeMin(d, [])).toBeGreaterThan(0);
	});

	it('un programme sprint + « à revoir » se comporte comme avant (#464 intact)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'aRevoir', 1)])]);
		// Rien d'épinglé : l'étape « à revoir » s'escamote, le sprint suffit à terminer.
		ouvrirJour(LUN, ctx({ disponibles: DISPO }));
		expect(faire('sprint', LUN + 10_000, ctx({ disponibles: DISPO })).justCompleted).toBe(true);
		// Avec une épinglée, elle est bien là (le contexte du jour décide, comme avant).
		const v = vueSeanceDuJour(LUN + 20_000, ctx({ lecons: [LECON_A], disponibles: [] }))!;
		expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1', 'e2']);
		expect(v.restantes.map((x) => x.etape.id)).toEqual(['e2']);
	});
});
