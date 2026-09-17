/* ============================================================
   Étape de programme « Un bilan favori » (#636) — logique pure de src/core/seance.ts
   et journalisation de src/core/lesson-run.ts.

   Auteur des tests DISTINCT de l'auteur du code, et tests écrits AVANT l'implémentation :
   les attendus sont dérivés des critères d'acceptation GELÉS de l'issue #636, jamais
   recopiés du code (qui, au moment où ce fichier est écrit, ne connaît ni la nature
   d'étape `favori`, ni `ContexteSeance.favorisDisponibles`, et neutralise la référence
   d'un bilan dans `recordLessonRun`).

   Ce que l'issue demande, en une phrase : un adulte pose SA sélection nommée comme une
   étape du programme, et l'enfant la coche en la faisant — quel que soit le bouton par
   lequel il l'a lancée (c'est le sens de l'attribution de #498).

   Trois pièges nommés, hérités des natures à référence précédentes :
   - `CONTEXTE_VIDE` ESCAMOTE une étape à pool, il ne la neutralise pas (piège mesuré sur
     #657, consigné dans docs/architecture/tests.md). Tout test qui met une étape `favori`
     en jeu via `vueSeanceDuJour` / `resoudreProgramme` fournit donc SON contexte, sinon le
     programme se déclarerait terminé à mi-chemin ;
   - le crédit ne doit PAS dépendre de la disponibilité de la cible (le travail a eu lieu),
     alors que l'APPLICABILITÉ, elle, en dépend (une étape sans cible atteignable est
     impossible à faire, critère 18) ;
   - une étape à pool est un pool : une cible survivante suffit à la maintenir en vie.

   Ce qui est HORS de ce fichier :
   - l'écran encadrant (sélecteur, liste des favoris du profil consulté, suppression) et
     l'écran enfant (tuile, tirage, ouverture du bon mode) → critères 1-4, 6-8, 12-15, e2e ;
   - la CONSTRUCTION de `ctx.favorisDisponibles` (côté UI, à partir des favoris du profil) ;
   - le chemin sprint de la journalisation (`src/ui/sprint.ts` appelle `recordLessonStats`,
     inséparable du DOM et de son chrono) → e2e. La PRISE qu'il utilisera est éprouvée ici.

   Les favoris par profil (`loadBilansFor` / `deleteBilanFor`, critères 2 et 20) vivent dans
   tests/bilans-par-profil.test.ts : autre module (src/core/bilans.ts), autre fichier.

   Repère calendaire (heure LOCALE) : 2026-01-05 = lundi (ISO 1).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	CONTEXTE_VIDE,
	SEANCE_MODE_INFOS,
	ciblesEtape,
	etapeConfiguree,
	etapeApplicable,
	etapeSatisfaite,
	estimationDureeMin,
	vueSeanceDuJour,
	resoudreProgramme,
	seancesCompletees,
	enregistrerSeancesFor,
	chargerSeancesFor,
	copierSeances,
	marquerEtapeLancee,
	type ContexteSeance,
	type FavoriDispo,
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
import {
	ACTIVITY_KEY,
	loadActivity,
	recordLessonStats,
	type ActivityEntry,
	type ActivityKind,
} from '../src/core/progress';
import { recordLessonRun } from '../src/core/lesson-run';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Instants de référence (heure locale) ---------- */
const LUN = new Date(2026, 0, 5).getTime(); // lundi, ISO 1
const JOUR = 24 * 3_600_000;

/* ---------- Favoris du profil (ce que l'UI résoudra et passera dans le contexte) ---------- */
const FAV_UNE = 'fav-une-lecon'; // bilan, 1 leçon
const FAV_COURT = 'fav-court'; // bilan, 2 leçons
const FAV_MOYEN = 'fav-moyen'; // bilan, 6 leçons
const FAV_LONG = 'fav-long'; // bilan, 12 leçons
const FAV_SPRINT = 'fav-sprint'; // sprint, 3 leçons
const FAV_SPRINT_LONG = 'fav-sprint-long'; // sprint, 12 leçons
const FAV_ABSENT = 'fav-supprime'; // n'existe plus (ou pas) chez le profil
const FAV_ABSENT_2 = 'fav-supprime-2';

/* Leçons et listes réelles, pour les cas « la nature de la session compte ». */
const LECON_A = 'math-doubles';
const LECON_B = 'math-moities';
const LISTE_A = 'fr-ortho-invariables-1';

function fav(id: string, nbLecons: number, mode: 'bilan' | 'sprint'): FavoriDispo {
	return { id, nbLecons, mode };
}
/** Favoris RÉELLEMENT lançables par le profil aujourd'hui. Volontairement NON vide dans les
    cas « cible disparue » : un escamotage qui ne marcherait que « quand le profil n'a aucun
    favori » raterait le cas où il en a d'autres. */
const TOUS: FavoriDispo[] = [
	fav(FAV_UNE, 1, 'bilan'),
	fav(FAV_COURT, 2, 'bilan'),
	fav(FAV_MOYEN, 6, 'bilan'),
	fav(FAV_LONG, 12, 'bilan'),
	fav(FAV_SPRINT, 3, 'sprint'),
	fav(FAV_SPRINT_LONG, 12, 'sprint'),
];

/* ---------- Fabriques ---------- */
function ctx(
	o: {
		lecons?: string[];
		dictees?: string[];
		disponibles?: string[];
		favoris?: FavoriDispo[];
	} = {},
): ContexteSeance {
	return {
		aRevoirLecons: o.lecons ?? [],
		aRevoirDictees: o.dictees ?? [],
		dicteesDisponibles: o.disponibles ?? [],
		favorisDisponibles: o.favoris ?? [],
	};
}
function etape(id: string, kind: SeanceModeKind, count = 1, ref?: string): SeanceEtape {
	return ref === undefined ? { id, kind, count } : { id, kind, count, ref };
}
/** Étape favori : pool (`refs`), cible unique (`ref`, même rétrocompat que les dictées #463),
    ou rien du tout (l'adulte a ajouté l'étape sans rien cocher). */
function etapeFavori(
	id: string,
	o: { ref?: string; refs?: string[]; count?: number } = {},
): SeanceEtape {
	const e: SeanceEtape = { id, kind: 'favori', count: o.count ?? 1 };
	if (o.ref !== undefined) e.ref = o.ref;
	if (o.refs !== undefined) e.refs = o.refs;
	return e;
}
function defLundi(etapes: SeanceEtape[], id = 'd1'): SeanceDef {
	return { id, etapes, recurrence: { type: 'hebdo', jours: [1] } };
}
/** Entrée du journal d'activité, pour éprouver `etapeSatisfaite` sans stockage. */
function session(k: ActivityKind, ref?: string, t = 1): ActivityEntry {
	return ref === undefined ? { t, k } : { t, k, ref };
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
    activités postérieures à son curseur (`vuTs`), posé à la création de l'état. */
function ouvrirJour(t: number, c: ContexteSeance): void {
	resoudreProgramme(t, c);
}
/** Une session faite puis un retour à l'accueil (passe d'attribution), SANS marqueur : c'est
    le cas « lancé depuis l'accueil, hors programme » du critère 10. */
function faire(k: ActivityKind, t: number, c: ContexteSeance, ref?: string): ResolutionSeance {
	poserActivite(k, t, ref);
	return resoudreProgramme(t + 1_000, c);
}
/** Dernière entrée du journal d'activité, telle qu'elle ressort du stockage. */
function derniereActivite(): ActivityEntry {
	const a = loadActivity();
	return a[a.length - 1];
}

/* ============================================================
   0) Surface : une TROISIÈME nature de référence, à côté de `lecon` et `dictee`
   ============================================================ */
describe('surface : la nature d’étape « favori » (#636)', () => {
	it('« favori » est un mode d’étape À RÉFÉRENCE, avec un libellé et une durée exploitables', () => {
		expect(SEANCE_MODE_INFOS.favori.ref).toBe('favori');
		expect(SEANCE_MODE_INFOS.favori.label.trim().length).toBeGreaterThan(0);
		expect(SEANCE_MODE_INFOS.favori.dureeMin).toBeGreaterThanOrEqual(1);
	});

	it('le contexte NEUTRE ne propose aucun favori (même défaut prudent que les dictées)', () => {
		// Un appelant qui ne sait pas résoudre les favoris du profil ESCAMOTE l'étape plutôt
		// que de la promettre : une étape escamotée à tort se répare, une étape affichée à tort
		// bloque la journée entière.
		expect(CONTEXTE_VIDE.favorisDisponibles).toEqual([]);
	});

	/* VERT dès l'écriture : `ciblesEtape` est déjà agnostique de la nature de l'étape.
	   MUTATION qui le rougirait : la spécialiser par nature (`if (etape.kind !== 'dictee')
	   return []`) au moment d'ajouter le favori, ou perdre le repli sur l'ancien `ref` unique. */
	it('le pool d’une étape favori se lit comme celui d’une dictée (refs prime, ref en repli)', () => {
		expect(ciblesEtape(etapeFavori('e1', { refs: [FAV_COURT, FAV_LONG] }))).toEqual([
			FAV_COURT,
			FAV_LONG,
		]);
		expect(ciblesEtape(etapeFavori('e1', { ref: FAV_COURT }))).toEqual([FAV_COURT]);
		expect(ciblesEtape(etapeFavori('e1', { ref: FAV_COURT, refs: [FAV_LONG] }))).toEqual([
			FAV_LONG,
		]);
		expect(ciblesEtape(etapeFavori('e1'))).toEqual([]);
	});
});

/* ============================================================
   1) Critère 5 — l'estimation de durée DÉPEND des favoris visés
   ------------------------------------------------------------
   Exigence du critère, et rien de plus : « une étape visant un favori de 2 leçons et une
   étape visant un favori de 12 leçons annoncent le même nombre de minutes » = échec. Les
   assertions porteuses sont donc RELATIONNELLES (ordre, plancher, effet du pool), pas des
   valeurs recopiées d'une formule. Le barème annoncé au cadrage a son test à part, nommé
   comme tel, pour qu'un écart de barème ne se lise pas comme un critère non tenu.
   ============================================================ */
describe('critère 5 : la durée estimée d’une étape favori dépend des favoris visés', () => {
	const c = ctx({ favoris: TOUS });
	/** Durée de la SEULE étape favori du programme (l'estimation est additive par étape). */
	function duree(refs: string[], count = 1): number {
		return estimationDureeMin(defLundi([etapeFavori('e1', { refs, count })]), c);
	}

	it('2 leçons et 12 leçons n’annoncent PAS le même nombre de minutes (critère 5)', () => {
		expect(duree([FAV_COURT])).not.toBe(duree([FAV_LONG]));
		expect(duree([FAV_COURT])).toBeLessThan(duree([FAV_LONG]));
	});

	it('l’estimation croît avec le nombre de leçons du favori visé', () => {
		const paliers = [FAV_UNE, FAV_COURT, FAV_MOYEN, FAV_LONG].map((id) => duree([id]));
		for (let i = 1; i < paliers.length; i++)
			expect(paliers[i], `${i} vs ${i - 1}`).toBeGreaterThanOrEqual(paliers[i - 1]);
		expect(paliers[paliers.length - 1]).toBeGreaterThan(paliers[0]);
	});

	it('aucune étape lançable n’est annoncée sous un plancher praticable (jamais 0 ou 1 min)', () => {
		// Un bilan d'une seule leçon reste une évaluation à installer : l'annoncer à 2 min
		// promettrait à l'adulte un temps que la séance ne tiendra pas.
		for (const id of [FAV_UNE, FAV_COURT, FAV_MOYEN, FAV_LONG, FAV_SPRINT])
			expect(duree([id]), id).toBeGreaterThanOrEqual(3);
	});

	it('un favori SPRINT s’annonce comme un sprint, quel que soit son nombre de leçons', () => {
		// C'est un sprint de 5 min : le nombre de leçons qui l'alimente ne change pas sa durée.
		expect(duree([FAV_SPRINT])).toBe(SEANCE_MODE_INFOS.sprint.dureeMin);
		expect(duree([FAV_SPRINT_LONG])).toBe(duree([FAV_SPRINT]));
	});

	it('un pool se chiffre ENTRE le plus court et le plus long de ses favoris', () => {
		const court = duree([FAV_COURT]);
		const long = duree([FAV_LONG]);
		const pool = duree([FAV_COURT, FAV_LONG]);
		expect(pool).toBeGreaterThanOrEqual(court);
		expect(pool).toBeLessThanOrEqual(long);
	});

	it('un favori disparu du profil ne tire pas l’estimation du pool (critère 18, versant chiffre)', () => {
		expect(duree([FAV_COURT, FAV_ABSENT])).toBe(duree([FAV_COURT]));
		expect(duree([FAV_ABSENT, FAV_LONG, FAV_ABSENT_2])).toBe(duree([FAV_LONG]));
	});

	it('linéaire en count : trois passages annoncent trois fois le temps d’un', () => {
		expect(duree([FAV_LONG], 3)).toBe(3 * duree([FAV_LONG]));
	});

	it('additive : l’étape favori s’ajoute aux autres, sans les modifier', () => {
		const d = defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_LONG] })]);
		expect(estimationDureeMin(d, c)).toBe(SEANCE_MODE_INFOS.sprint.dureeMin + duree([FAV_LONG]));
	});

	/* Barème ANNONCÉ au cadrage (2,5 min par leçon pour un bilan, moyenne sur le pool), pas
	   exigé par le critère 5 : si seule cette assertion-ci tombe, c'est le barème qui a bougé,
	   pas le critère. Les nombres de leçons sont pairs : aucune ambiguïté d'arrondi. */
	it('repère du barème annoncé au cadrage (2,5 min par leçon) — hors exigence du critère 5', () => {
		expect(duree([FAV_COURT])).toBe(5); // 2 leçons
		expect(duree([FAV_MOYEN])).toBe(15); // 6 leçons
		expect(duree([FAV_LONG])).toBe(30); // 12 leçons
		expect(duree([FAV_COURT, FAV_MOYEN])).toBe(10); // moyenne du pool : (5 + 15) / 2
	});

	/* Défaut de signature (contrat #636 : `estimationDureeMin(def, ctx = CONTEXTE_VIDE)`).
	   Même prudence que #657 : sans contexte, aucun favori n'est réputé lançable. */
	it('contexte omis = aucun favori réputé lançable (défaut prudent)', () => {
		const d = defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_LONG] })]);
		expect(estimationDureeMin(d)).toBe(SEANCE_MODE_INFOS.sprint.dureeMin);
	});
});

/* ============================================================
   2) Critère 9 — le journal porte l'id du favori lancé
   ============================================================ */
describe('critère 9 : un bilan lancé depuis un favori journalise l’id de ce favori', () => {
	const PER_LESSON = { [LECON_A]: { ok: 4, total: 5 }, [LECON_B]: { ok: 3, total: 5 } };
	/** Un essai de BILAN tel que l'enregistre le runner commun (#69), lancé DEPUIS un favori.
	    `favoriId` est la prise que le contrat #636 ajoute à `LessonRunInput`. */
	function bilanDepuisFavori(favoriId: string): void {
		recordLessonRun({
			mode: 'express',
			lessonId: null,
			ok: 7,
			questionCount: 10,
			ms: 60_000,
			perLesson: PER_LESSON,
			favoriId,
		});
	}
	/** Le même essai, lancé depuis un bilan de catégorie (express / complet). */
	function bilanDeCategorie(): void {
		recordLessonRun({
			mode: 'complet',
			lessonId: null,
			ok: 7,
			questionCount: 10,
			ms: 60_000,
			perLesson: PER_LESSON,
		});
	}

	it('l’entrée journalisée est un bilan PORTANT l’id du favori', () => {
		bilanDepuisFavori(FAV_COURT);
		const e = derniereActivite();
		expect(e.k).toBe('bilan');
		expect(e.ref).toBe(FAV_COURT);
	});

	it('cette entrée-là, relue du journal, satisfait l’étape qui vise ce favori (9 + 10)', () => {
		// Le lien qui compte : ce que le chemin d'enregistrement ÉCRIT est exactement ce que
		// l'attribution SAIT reconnaître. Les deux moitiés testées séparément pourraient être
		// justes chacune et ne jamais se rencontrer.
		bilanDepuisFavori(FAV_COURT);
		const e = derniereActivite();
		expect(etapeSatisfaite(etapeFavori('e1', { refs: [FAV_COURT] }), e, CONTEXTE_VIDE)).toBe(true);
	});

	/* Critère 16, versant journal. VERT dès l'écriture (aucun bilan ne porte de référence
	   aujourd'hui).
	   MUTATION qui le rougirait : journaliser une référence par défaut pour tout bilan —
	   par exemple la première leçon de la sélection (`Object.keys(p.perLesson)[0]`) ou le
	   `mode` ('express'). Une étape favori se cocherait alors sur un bilan de catégorie. */
	it('un bilan SANS favori reste sans référence (critère 16)', () => {
		bilanDeCategorie();
		const e = derniereActivite();
		expect(e.k).toBe('bilan');
		expect(e.ref).toBeUndefined();
	});

	/* Critère 17, versant journal. VERT dès l'écriture.
	   MUTATION qui le rougirait : remplacer la référence du mode 'lecon' par celle du favori
	   (`ref: p.favoriId` sans conserver la branche 'lecon'), ce qui ferait perdre au journal
	   la cible exacte dont dépendent les étapes « Une leçon précise » et « Leçon du jour ». */
	it('le mode « leçon » garde SA référence de leçon, inchangée (critère 17)', () => {
		recordLessonRun({
			mode: 'lecon',
			lessonId: LECON_A,
			ok: 8,
			questionCount: 8,
			ms: 1_000,
			perLesson: { [LECON_A]: { ok: 8, total: 8 } },
		});
		const e = derniereActivite();
		expect(e.k).toBe('lecon');
		expect(e.ref).toBe(LECON_A);
	});

	/* La PRISE du chemin sprint (`src/ui/sprint.ts` appelle `recordLessonStats(…, 'sprint')`,
	   inséparable du DOM et de son chrono → le chemin réel se joue en e2e). Ce qui est
	   éprouvé ici : la référence d'un sprint traverse bien la journalisation.
	   VERT dès l'écriture (le paramètre existe depuis #498).
	   MUTATION qui le rougirait : cesser de reporter `ref` dans `recordActivity`
	   (src/core/progress.ts:480), ou l'ignorer pour les types autres que 'lecon'. */
	it('le journal sait porter la référence d’un SPRINT (prise du chemin ui/sprint.ts)', () => {
		recordLessonStats(PER_LESSON, 'sprint', FAV_SPRINT);
		const e = derniereActivite();
		expect(e.k).toBe('sprint');
		expect(e.ref).toBe(FAV_SPRINT);
		expect(etapeSatisfaite(etapeFavori('e1', { refs: [FAV_SPRINT] }), e, CONTEXTE_VIDE)).toBe(true);
	});
});

/* ============================================================
   3) Critère 10 — l'étape se coche sur un favori DU POOL, quel que soit le point d'entrée
   ============================================================ */
describe('critère 10 : etapeSatisfaite — un favori du pool, bilan OU sprint', () => {
	const e = etapeFavori('e1', { refs: [FAV_COURT, FAV_SPRINT] });

	it('un bilan ou un sprint portant un favori du pool satisfait l’étape', () => {
		expect(etapeSatisfaite(e, session('bilan', FAV_COURT), CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(e, session('sprint', FAV_SPRINT), CONTEXTE_VIDE)).toBe(true);
		// Le mode enregistré du favori n'est pas ce qui décide : l'adulte a coché CES favoris,
		// c'est l'id qui fait foi (un favori peut changer de mode sans changer d'id).
		expect(etapeSatisfaite(e, session('sprint', FAV_COURT), CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(e, session('bilan', FAV_SPRINT), CONTEXTE_VIDE)).toBe(true);
	});

	it('un favori HORS pool ne satisfait pas : la consigne de l’adulte reste due', () => {
		expect(etapeSatisfaite(e, session('bilan', FAV_LONG), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('sprint', FAV_LONG), CONTEXTE_VIDE)).toBe(false);
	});

	it('la NATURE de la session compte : ni leçon, ni dictée, ni révision', () => {
		// Un id de favori ne peut pas être un id de leçon, mais l'appariement ne doit pas
		// reposer sur cette coïncidence : c'est le type de session qui qualifie l'activité.
		expect(etapeSatisfaite(e, session('lecon', FAV_COURT), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('dictee', FAV_COURT), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('revision', FAV_COURT), CONTEXTE_VIDE)).toBe(false);
	});

	it('rétrocompat : une étape à cible unique `ref` se comporte comme un pool d’un', () => {
		const unique = etapeFavori('e1', { ref: FAV_COURT });
		expect(etapeSatisfaite(unique, session('bilan', FAV_COURT), CONTEXTE_VIDE)).toBe(true);
		expect(etapeSatisfaite(unique, session('bilan', FAV_LONG), CONTEXTE_VIDE)).toBe(false);
	});

	it('une étape sans aucune cible n’est jamais satisfaite, même par un bilan référencé', () => {
		// Sinon une consigne incomplète de l'adulte se créditerait avec n'importe quoi.
		expect(etapeSatisfaite(etapeFavori('e1'), session('bilan', FAV_COURT), CONTEXTE_VIDE)).toBe(
			false,
		);
		expect(
			etapeSatisfaite(etapeFavori('e1', { refs: [] }), session('bilan', FAV_COURT), CONTEXTE_VIDE),
		).toBe(false);
	});

	it('le CRÉDIT ne dépend pas de la disponibilité du favori (le travail a eu lieu)', () => {
		// Symétrique du parti pris des dictées : l'applicabilité regarde le contexte du jour,
		// l'appariement regarde la définition. Un favori supprimé APRÈS la session ne doit pas
		// effacer le travail déjà fait.
		const vide = ctx({ favoris: [] });
		const plein = ctx({ favoris: TOUS });
		expect(etapeSatisfaite(e, session('bilan', FAV_COURT), vide)).toBe(true);
		expect(etapeSatisfaite(e, session('bilan', FAV_COURT), plein)).toBe(true);
	});
});

describe('critère 10 : l’étape se coche quel que soit le point d’entrée', () => {
	const c = ctx({ favoris: TOUS });

	it('un favori lancé depuis l’ACCUEIL, hors programme (aucun marqueur), crédite l’étape', () => {
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_COURT, FAV_LONG] })])]);
		ouvrirJour(LUN, c);
		const r = faire('bilan', LUN + 10_000, c, FAV_LONG);
		expect(r.etapesCreditees).toEqual(['e1']);
		expect(r.justCompleted).toBe(true);
		const v = vueSeanceDuJour(LUN + 20_000, c)!;
		expect(v.complete).toBe(true);
		// La cible RÉELLEMENT faite est celle qui est retenue dans le récap (#537).
		expect(v.etapes[0].refs).toEqual([FAV_LONG]);
		expect(seancesCompletees()).toBe(1);
	});

	it('un favori SPRINT lancé depuis l’accueil crédite aussi l’étape', () => {
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_SPRINT] })])]);
		ouvrirJour(LUN, c);
		expect(faire('sprint', LUN + 10_000, c, FAV_SPRINT).etapesCreditees).toEqual(['e1']);
	});

	it('un « ×2 » exige deux sessions de favoris du pool', () => {
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_COURT, FAV_LONG], count: 2 })])]);
		ouvrirJour(LUN, c);
		expect(faire('bilan', LUN + 10_000, c, FAV_COURT).justCompleted).toBe(false);
		expect(faire('bilan', LUN + 20_000, c, FAV_LONG).justCompleted).toBe(true);
		expect(vueSeanceDuJour(LUN + 30_000, c)!.etapes[0].refs).toEqual([FAV_COURT, FAV_LONG]);
	});

	/* VERT dès l'écriture, mais pour une raison DÉGÉNÉRÉE : aujourd'hui aucune étape favori
	   n'est satisfiable, donc rien ne crédite jamais. Le test ne garde vraiment qu'une fois la
	   branche `favori` écrite.
	   MUTATION qui le rougirait alors : accepter n'importe quel bilan/sprint RÉFÉRENCÉ sans
	   vérifier l'appartenance au pool (`(a.k === 'bilan' || a.k === 'sprint') && !!a.ref`). */
	it('un favori hors pool ne crédite rien, même fait le même jour', () => {
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_COURT] })])]);
		ouvrirJour(LUN, c);
		const r = faire('bilan', LUN + 10_000, c, FAV_LONG);
		expect(r.etapesCreditees).toEqual([]);
		expect(vueSeanceDuJour(LUN + 20_000, c)!.complete).toBe(false);
	});
});

/* ============================================================
   4) Critère 11 — « bilan favori » passe AVANT « Sprint 5 min »
   ------------------------------------------------------------
   L'ordre est éprouvé par le COMPORTEMENT (quelle étape est créditée), pas en lisant la
   table de spécificité : c'est le contrat, pas le mécanisme.
   ============================================================ */
describe('critère 11 : à session équivoque, l’étape favori passe avant l’étape sprint', () => {
	const c = ctx({ favoris: TOUS });

	it('un favori sprint crédite l’étape favori, et laisse l’étape « Sprint 5 min » due', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_SPRINT] })])]);
		ouvrirJour(LUN, c);
		const r = faire('sprint', LUN + 10_000, c, FAV_SPRINT);
		expect(r.etapesCreditees).toEqual(['e2']);
		expect(r.justCompleted).toBe(false);
		expect(vueSeanceDuJour(LUN + 20_000, c)!.restantes.map((v) => v.etape.id)).toEqual(['e1']);
	});

	it('… quel que soit l’ordre de composition (c’est la spécificité qui tranche)', () => {
		// Étape favori déclarée EN PREMIER : si le crédit suivait l'ordre de composition, le
		// test précédent passerait par accident. Les deux ordres doivent donner le même choix.
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_SPRINT] }), etape('e2', 'sprint', 1)])]);
		ouvrirJour(LUN, c);
		expect(faire('sprint', LUN + 10_000, c, FAV_SPRINT).etapesCreditees).toEqual(['e1']);
	});

	it('deux sessions : le favori d’abord, un sprint ordinaire ensuite → tout est fait', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_SPRINT] })])]);
		ouvrirJour(LUN, c);
		expect(faire('sprint', LUN + 10_000, c, FAV_SPRINT).etapesCreditees).toEqual(['e2']);
		const r = faire('sprint', LUN + 20_000, c);
		expect(r.etapesCreditees).toEqual(['e1']);
		expect(r.justCompleted).toBe(true);
	});

	it('l’ordre inverse marche aussi : un sprint ordinaire ne vole pas la place du favori', () => {
		// Le sprint ordinaire (sans référence) ne peut satisfaire QUE l'étape générique ; il ne
		// doit donc pas être un piège pour l'enfant qui commence par lui.
		poserDefs([defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_SPRINT] })])]);
		ouvrirJour(LUN, c);
		expect(faire('sprint', LUN + 10_000, c).etapesCreditees).toEqual(['e1']);
		expect(faire('sprint', LUN + 20_000, c, FAV_SPRINT).etapesCreditees).toEqual(['e2']);
	});

	/* VERT dès l'écriture pour une raison dégénérée (l'étape favori n'est pas encore
	   candidate) ; vrai garde-fou une fois la branche écrite.
	   MUTATION qui le rougirait alors : appliquer `SPECIFICITE` AVANT le marqueur dans
	   `etapeACrediter`, ce que la lecture la plus littérale du critère 11 pourrait suggérer.
	   ARBITRAGE assumé ici : le critère 11 porte sur la table de spécificité, qui n'intervient
	   qu'à ambiguïté ; la priorité du marqueur est un comportement EXISTANT (#498) que le
	   critère 17 demande de ne pas changer. À confirmer si l'implémentation diverge. */
	it('le marqueur du programme reste prioritaire quand il désigne une candidate (#498)', () => {
		// La spécificité arbitre l'AMBIGUÏTÉ, elle ne remplace pas la volonté explicite de
		// l'enfant qui a pris la tuile « Sprint 5 min » du programme puis l'a quittée.
		poserDefs([defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_SPRINT] })])]);
		ouvrirJour(LUN, c);
		marquerEtapeLancee('e1', LUN + 5_000);
		expect(faire('sprint', LUN + 10_000, c, FAV_SPRINT).etapesCreditees).toEqual(['e1']);
	});

	it('une étape favori ÉPUISÉE ne retient plus le crédit (il redescend au sprint)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_SPRINT] })])]);
		ouvrirJour(LUN, c);
		faire('sprint', LUN + 10_000, c, FAV_SPRINT); // e2 épuisée
		expect(faire('sprint', LUN + 20_000, c, FAV_SPRINT).etapesCreditees).toEqual(['e1']);
	});
});

/* ============================================================
   5) Critère 16 (négatif) — un bilan lancé AUTREMENT ne coche aucune étape favori
   ============================================================ */
describe('critère 16 : un bilan hors favori ne coche aucune étape « bilan favori »', () => {
	const c = ctx({ favoris: TOUS });

	it('un bilan SANS référence (express, complet, sélection à la volée) ne satisfait pas', () => {
		const e = etapeFavori('e1', { refs: [FAV_COURT, FAV_LONG] });
		expect(etapeSatisfaite(e, session('bilan'), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('sprint'), CONTEXTE_VIDE)).toBe(false);
	});

	/* VERT dès l'écriture pour une raison dégénérée (aucune étape favori n'est satisfiable
	   aujourd'hui) ; vrai garde-fou une fois la branche écrite.
	   MUTATION qui le rougirait alors : laisser la branche `favori` accepter une session de
	   bilan SANS référence (« un bilan, c'est un bilan »). */
	it('le bilan complet d’une catégorie ne coche pas l’étape, même tout le pool disponible', () => {
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_COURT, FAV_LONG] })])]);
		ouvrirJour(LUN, c);
		const r = faire('bilan', LUN + 10_000, c); // bilan de catégorie : aucune référence
		expect(r.etapesCreditees).toEqual([]);
		expect(vueSeanceDuJour(LUN + 20_000, c)!.complete).toBe(false);
	});

	it('un bilan portant l’id d’une LEÇON (et non d’un favori) ne coche pas non plus', () => {
		const e = etapeFavori('e1', { refs: [FAV_COURT] });
		expect(etapeSatisfaite(e, session('bilan', LECON_A), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('bilan', LISTE_A), CONTEXTE_VIDE)).toBe(false);
	});
});

/* ============================================================
   6) Critère 17 (négatif) — rien du programme existant ne change
   ============================================================ */
describe('critère 17 : les natures d’étape existantes gardent leur comportement', () => {
	const c = ctx({ favoris: TOUS });

	/* VERT dès l'écriture pour la partie « sprint » : le mode `sprint` ignore déjà la
	   référence de la session.
	   MUTATION qui le rougirait : restreindre le sprint générique aux sprints SANS favori
	   (`activite.k === 'sprint' && !activite.ref`), tentation naturelle pour « réserver » les
	   sprints de favoris à la nouvelle étape — l'enfant perdrait alors son étape « Sprint
	   5 min » en faisant un sprint favori, ce que le critère 17 interdit explicitement. */
	it('« Sprint 5 min » est coché par N’IMPORTE QUEL sprint, favori compris', () => {
		const e = etape('e1', 'sprint');
		for (const ref of [undefined, FAV_SPRINT, FAV_COURT, LECON_A])
			expect(etapeSatisfaite(e, session('sprint', ref), CONTEXTE_VIDE), String(ref)).toBe(true);
	});

	it('un sprint favori crédite l’étape « Sprint 5 min » quand c’est la seule étape en jeu', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1)])]);
		ouvrirJour(LUN, c);
		expect(faire('sprint', LUN + 10_000, c, FAV_SPRINT).justCompleted).toBe(true);
	});

	/* VERT dès l'écriture.
	   MUTATION qui le rougirait : ajouter `bilan` aux types acceptés par une de ces natures
	   (par exemple `activite.k === 'lecon' || activite.k === 'bilan'` dans `leconDuJour`, sous
	   prétexte qu'un bilan « travaille bien des leçons ») — l'étape « Leçon du jour » se
	   cocherait alors sur un bilan, ce qui n'a jamais été le cas. */
	it('aucune autre nature ne se coche sur une session de bilan, même référencée', () => {
		const bilanRef = session('bilan', FAV_COURT);
		const file = ctx({ lecons: [LECON_A], dictees: [LISTE_A] });
		expect(etapeSatisfaite(etape('e1', 'leconDuJour'), bilanRef, CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(etape('e1', 'lecon', 1, LECON_A), bilanRef, CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(etape('e1', 'dictee', 1, LISTE_A), bilanRef, CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(etape('e1', 'revision'), bilanRef, CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(etape('e1', 'aRevoir'), session('bilan', LECON_A), file)).toBe(false);
	});

	/* VERT dès l'écriture.
	   MUTATION qui le rougirait : brancher l'applicabilité d'une nature existante sur
	   `favorisDisponibles` (copier-coller de la nouvelle règle d'une nature à l'autre) — le
	   programme entier disparaîtrait chez un profil sans favori. */
	it('les autres natures ne dépendent pas des favoris disponibles', () => {
		const sansFavori = ctx({ favoris: [], disponibles: [LISTE_A], lecons: [LECON_A] });
		for (const k of ['sprint', 'revision', 'leconDuJour'] as SeanceModeKind[]) {
			expect(etapeConfiguree(etape('e1', k), sansFavori), k).toBe(true);
			expect(etapeApplicable(etape('e1', k), sansFavori), k).toBe(true);
		}
		expect(etapeApplicable(etape('e1', 'lecon', 1, LECON_A), sansFavori)).toBe(true);
		expect(etapeApplicable(etape('e1', 'dictee', 1, LISTE_A), sansFavori)).toBe(true);
		expect(etapeApplicable(etape('e1', 'aRevoir'), sansFavori)).toBe(true);
	});

	/* VERT dès l'écriture : c'est le pipeline d'aujourd'hui, de bout en bout.
	   MUTATION qui le rougirait : toute retouche des branches `sprint` / `dictee` de
	   `etapeSatisfaite` ou de l'ordre d'attribution en ajoutant la nature `favori`. */
	it('un programme sans étape favori se comporte exactement comme avant', () => {
		const sansFavori = ctx({ favoris: [], disponibles: [LISTE_A] });
		poserDefs([defLundi([etape('e1', 'sprint', 1), etape('e2', 'dictee', 1, LISTE_A)])]);
		ouvrirJour(LUN, sansFavori);
		expect(faire('sprint', LUN + 10_000, sansFavori).etapesCreditees).toEqual(['e1']);
		const r = faire('dictee', LUN + 20_000, sansFavori, LISTE_A);
		expect(r.etapesCreditees).toEqual(['e2']);
		expect(r.justCompleted).toBe(true);
	});
});

/* ============================================================
   7) Critère 18 (négatif) — une étape favori sans cible atteignable ne BLOQUE pas
   ------------------------------------------------------------
   Même dégât que #657 côté dictées : `restantes` ne se vide jamais, donc le programme ne
   peut plus être déclaré terminé et l'enfant perd fête, trophée et compteur.
   ============================================================ */
const SANS_CIBLE: { nom: string; etape: (id: string) => SeanceEtape }[] = [
	{
		nom: 'aucun `refs` posé (étape ajoutée sans rien cocher)',
		etape: (id) => etapeFavori(id),
	},
	{
		nom: '`refs: []` (l’adulte a décoché toutes les cases)',
		etape: (id) => etapeFavori(id, { refs: [] }),
	},
	{
		nom: '`refs` orphelin (le favori visé a été supprimé depuis)',
		etape: (id) => etapeFavori(id, { refs: [FAV_ABSENT] }),
	},
	{
		nom: 'pool entier orphelin (programme copié vers un profil sans ces favoris)',
		etape: (id) => etapeFavori(id, { refs: [FAV_ABSENT, FAV_ABSENT_2] }),
	},
	{
		nom: 'cible unique `ref` pointant un favori disparu',
		etape: (id) => etapeFavori(id, { ref: FAV_ABSENT }),
	},
];

describe('critère 18 : une étape favori sans cible atteignable s’escamote', () => {
	const c = ctx({ favoris: TOUS });

	for (const cas of SANS_CIBLE) {
		it(`ni configurée, ni applicable — ${cas.nom}`, () => {
			const e = cas.etape('e1');
			expect(etapeConfiguree(e, c)).toBe(false);
			expect(etapeApplicable(e, c)).toBe(false);
			expect(estimationDureeMin(defLundi([e]), c)).toBe(0);
		});
		it(`absente du programme de l’enfant — ${cas.nom}`, () => {
			poserDefs([defLundi([etape('e1', 'sprint', 1), cas.etape('e2')])]);
			const v = vueSeanceDuJour(LUN, c)!;
			expect(v.etapes.map((x) => x.etape.id)).toEqual(['e1']);
			expect(v.restantes.map((x) => x.etape.id)).toEqual(['e1']);
			expect(v.totalRequis).toBe(1);
		});
	}

	it('le sprint fait suffit : le programme se termine et se célèbre (critère 18)', () => {
		poserDefs([defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_ABSENT] })])]);
		ouvrirJour(LUN, c);
		const r = faire('sprint', LUN + 10_000, c);
		expect(r.etapesCreditees).toEqual(['e1']);
		expect(r.justCompleted).toBe(true);
		expect(vueSeanceDuJour(LUN + 20_000, c)!.complete).toBe(true);
		expect(seancesCompletees()).toBe(1);
	});

	it('un « ×3 » sans cible ne réclame pas trois passages introuvables', () => {
		poserDefs([
			defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_ABSENT], count: 3 })]),
		]);
		ouvrirJour(LUN, c);
		expect(faire('sprint', LUN + 10_000, c).justCompleted).toBe(true);
		const v = vueSeanceDuJour(LUN + 20_000, c)!;
		expect(v.totalRequis).toBe(1);
		expect(v.complete).toBe(true);
	});

	it('l’étape favori SEULE et morte : pas de programme du jour (jamais un programme vide)', () => {
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_ABSENT] })])]);
		expect(vueSeanceDuJour(LUN, c)).toBeNull();
	});

	it('programme copié vers un profil qui n’a pas ces favoris : il reste complétable', () => {
		const source = activeProfile().uuid;
		const defs = [defLundi([etape('e1', 'sprint', 1), etapeFavori('e2', { refs: [FAV_COURT] })])];
		enregistrerSeancesFor(source, defs);

		const b = addProfile('Profil B'); // ce profil n'a enregistré aucun favori
		copierSeances(source, b.uuid);
		setActiveProfile(b.uuid);

		const sansFavori = ctx({ favoris: [] });
		ouvrirJour(LUN, sansFavori);
		expect(faire('sprint', LUN + 10_000, sansFavori).justCompleted).toBe(true);
		expect(vueSeanceDuJour(LUN + 20_000, sansFavori)!.complete).toBe(true);
		// La consigne de l'adulte n'est pas réécrite en douce, ni chez B ni à la source : le
		// jour où B enregistre ce favori, l'étape revient telle quelle.
		expect(chargerSeancesFor(b.uuid)).toEqual(defs);
		expect(chargerSeancesFor(source)).toEqual(defs);
	});

	/* Contre-épreuve du critère 18 : l'escamotage ne doit pas être plus large que nécessaire.
	   MUTATION qui le rougirait : exiger que TOUTES les cibles soient atteignables
	   (`every` au lieu de `some`) — l'enfant perdrait un favori qu'il peut parfaitement faire. */
	it('un seul favori survivant sur trois SUFFIT à maintenir l’étape (contre-épreuve)', () => {
		const e = etapeFavori('e1', { refs: [FAV_ABSENT, FAV_COURT, FAV_ABSENT_2] });
		expect(etapeConfiguree(e, c)).toBe(true);
		expect(etapeApplicable(e, c)).toBe(true);
		expect(e.refs).toEqual([FAV_ABSENT, FAV_COURT, FAV_ABSENT_2]); // rien n'a été purgé au passage
	});

	/* Défaut de signature (contrat #636). */
	it('contexte omis = aucun favori réputé lançable (défaut prudent)', () => {
		expect(etapeConfiguree(etapeFavori('e1', { refs: [FAV_COURT] }))).toBe(false);
	});
});

/* ============================================================
   8) Critère 19 (négatif) — aucun crédit rétroactif sur les bilans déjà journalisés
   ============================================================ */
describe('critère 19 : les bilans déjà journalisés ne cochent rien rétroactivement', () => {
	const c = ctx({ favoris: TOUS });

	/* VERT dès l'écriture côté « sans référence » (aucun bilan n'en porte aujourd'hui).
	   MUTATION qui le rougirait : accepter une session de bilan sans référence dans la branche
	   `favori` (tentation « un bilan, c'est un bilan ») — toutes les entrées d'avant la mise à
	   jour deviendraient créditables. */
	it('une entrée de bilan SANS référence ne satisfait aucune étape favori', () => {
		const e = etapeFavori('e1', { refs: [FAV_COURT] });
		expect(etapeSatisfaite(e, session('bilan'), CONTEXTE_VIDE)).toBe(false);
		expect(etapeSatisfaite(e, session('bilan', ''), CONTEXTE_VIDE)).toBe(false);
	});

	/* VERT dès l'écriture pour une raison dégénérée ; vrai garde-fou une fois la branche écrite.
	   MUTATION qui le rougirait alors : retirer le curseur `vuTs` de la passe d'attribution
	   (`loadActivity().filter((e) => e.t <= now)` seul) — tout le journal redeviendrait
	   créditable, et une étape du jour se cocherait sur une session d'hier. */
	it('un bilan d’hier, même référencé, ne coche pas l’étape d’aujourd’hui (curseur vuTs)', () => {
		poserActivite('bilan', LUN - JOUR + 3_600_000, FAV_COURT); // hier soir
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_COURT] })])]);
		// Première ouverture du jour APRÈS la mise à jour : le programme naît maintenant.
		const r = resoudreProgramme(LUN, c);
		expect(r.etapesCreditees).toEqual([]);
		expect(r.justCompleted).toBe(false);
		expect(vueSeanceDuJour(LUN + 1_000, c)!.complete).toBe(false);
		expect(seancesCompletees()).toBe(0);
	});

	/* VERT dès l'écriture pour une raison dégénérée ; même mutation que le critère 16 :
	   accepter une session de bilan sans référence dans la branche `favori`. */
	it('un bilan sans référence fait AUJOURD’HUI ne coche pas davantage', () => {
		poserDefs([defLundi([etapeFavori('e1', { refs: [FAV_COURT] })])]);
		ouvrirJour(LUN, c);
		expect(faire('bilan', LUN + 10_000, c).etapesCreditees).toEqual([]);
		expect(vueSeanceDuJour(LUN + 20_000, c)!.complete).toBe(false);
	});
});
