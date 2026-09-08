/* ============================================================
   #660 — RECONNAÎTRE CE QUI TIENT DANS LE TEMPS : mots ancrés / notions ancrées.

   D'OÙ VIENNENT LES ATTENDUS. Des critères d'acceptation de l'issue, écrits AVANT
   l'implémentation : au moment où ce fichier est posé, ni `notionsAncrees()`, ni les
   métriques `orthoMotsAncres`/`notionsAncrees` de `gSnapshot()`, ni les huit trophées
   n'existent. Tout est donc rouge, et c'est le résultat attendu.

   CE QUI EST ÉPROUVÉ ICI (logique pure) :
   - critère 1  : deux familles DISTINCTES (un compteur unique mélangeant les deux tombe) ;
   - critère 2  : un mot compte au palier acquis quelle que soit son ORIGINE (liste du
                  parent, liste livrée, cible verbe) ;
   - critère 3  : une notion compte par paire leçon × niveau (dédupliquer par `lessonId`
                  tombe) ;
   - critère 4  : le compte des notions est lu sur l'état BRUT, non scopé au niveau actif
                  (l'état monté plus bas donne 3 en brut et 1 en scopé : une lecture
                  scopée ne peut pas passer par accident) ;
   - critère 5  : seuils 1/150/300/420 (mots) et 1/45/120/200 (notions), éprouvés au BORD
                  (n-1 / n), quatre paliers par famille ;
   - critère 8  : les libellés situent l'accomplissement dans la durée — mécanisé en
                  PROPRIÉTÉ (cf. `situeDansLaDuree`, dont la portée exacte est écrite
                  au-dessus de la fonction) ;
   - critère 11 : un trophée obtenu n'est jamais reverrouillé (changement de niveau, leçon
                  sortie du catalogue, mot supprimé de la banque) ;
   - critère 12 : les trophées existants gardent leurs seuils, `orthoMotsMaitrises` en tête
                  (motCache + tuiles : rien à voir avec la répétition espacée) ;
   - critère 13 : l'XP ne bouge pas.

   HORS PÉRIMÈTRE (spec Playwright) : critères 6, 7, 9, 10 — annonce en fin de session,
   rendu en galerie, silence au milieu d'une session, rien qui révèle à l'enfant ce qui
   approche du palier.

   COMMENT L'ÉTAT EST MONTÉ. Par les chemins réels dès que possible : `ajouterMots` +
   `marquerAtelierFait` + `avancerMotRevision` pour les mots ; l'escalier pur de
   `revision.ts` pour les notions, semées ensuite sous la clé BRUTE
   `ludaskia_lessonRevision` comme le font `revision-bas-niveau.test.ts` et
   `encadrant-revision.test.ts`. Aucun palier n'est écrit à la main : un état « ancré »
   est le RÉSULTAT de six réussites, jamais un littéral `{ palier: 6 }` — si l'escalier
   change, la fixture suit au lieu de mentir.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { getAllLessons } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { setOnDataWrite, lsSet } from '../src/core/storage';
import {
	initProfiles,
	setNiveauMatiere,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import {
	JOUR,
	PALIER_ACQUIS,
	REVISION_INTERVALLES,
	avancerEtat,
	estAcquis,
	etatNeuf,
} from '../src/core/revision';
import {
	LESSON_REVISION_KEY,
	getXP,
	loadLessonRevisions,
	notionsAncrees,
} from '../src/core/progress';
import {
	TROPHIES,
	evaluateTrophies,
	gSnapshot,
	loadTrophies,
	trophiesVisibles,
} from '../src/core/rewards';
import type { Trophy } from '../src/core/rewards';
import {
	ajouterMots,
	avancerMotRevision,
	loadOrtho,
	saveOrtho,
	supprimerMot,
} from '../src/core/orthographe/store';
import { marquerAtelierFait, validerMode } from '../src/core/orthographe/runner';
import { expanseVerbe } from '../src/core/orthographe/verbes';
import type { EtatRevision, OrthoState, VerbeConfig } from '../src/core/orthographe/types';
import type { FormesConjuguees, VerbTense } from '../src/data/francais/verbs-lookup';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const T0 = new Date(2026, 0, 12, 9, 0, 0, 0).getTime();

/* ---------- Les huit trophées attendus (ids = contrat de persistance) ----------
   Les ids sont figés par l'issue : les renommer rendrait invisible tout palier déjà
   acquis et en ré-annoncerait un « nouveau ». Les TITRES et DESCRIPTIONS, eux, ne sont
   pas figés (relecture en cours) : aucune assertion sur une chaîne exacte ici. */
const SEUILS_MOTS = [1, 150, 300, 420];
const SEUILS_NOTIONS = [1, 45, 120, 200];
const IDS_MOTS = SEUILS_MOTS.map((n) => `orthoAncres${n}`);
const IDS_NOTIONS = SEUILS_NOTIONS.map((n) => `notionsAncrees${n}`);
/* Famille EXISTANTE à ne pas bousculer (critère 12). */
const SEUILS_MOTS_MAITRISES = [10, 50, 100, 200];
const IDS_MOTS_MAITRISES = SEUILS_MOTS_MAITRISES.map((n) => `orthoMots${n}`);

const idsFamille = (prefixe: string, ids: string[]): string[] =>
	ids.filter((id) => id.startsWith(prefixe)).sort();
const acquis = (): string[] => [...new Set<string>(loadTrophies())];
const acquisFamille = (prefixe: string): string[] => idsFamille(prefixe, acquis());
const visiblesIds = (): string[] => trophiesVisibles().map((t: Trophy) => t.id);
const trophee = (id: string): Trophy | undefined => TROPHIES.find((t) => t.id === id);

/* ---------- Escalier : l'état d'un élément ANCRÉ ----------
   Six réussites à l'échéance, en partant d'un élément qui entre en rotation. Dérivé de
   `revision.ts` (fonctions pures), jamais écrit en dur. */
function etatPalier(n: number, depart = T0): EtatRevision {
	let e = etatNeuf(depart);
	let t = depart;
	for (let i = 0; i < n; i++) {
		t = e.prochaineRevision ?? t; // révision faite le jour de l'échéance
		e = avancerEtat(e, true, t);
	}
	return e;
}
const etatAncre = (depart = T0): EtatRevision => etatPalier(PALIER_ACQUIS, depart);

/* ---------- Mots ----------
   Formes factices mais uniques (index en base 12 sur des syllabes) : la banque dédup par
   forme normalisée, une collision ferait silencieusement rétrécir la fixture. */
const SYLLABES = [
	'ba',
	'che',
	'dou',
	'fri',
	'gla',
	'lou',
	'mer',
	'nou',
	'pra',
	'tor',
	'vin',
	'sau',
];
const motFactice = (i: number): string =>
	SYLLABES[i % 12] + SYLLABES[Math.floor(i / 12) % 12] + SYLLABES[Math.floor(i / 144) % 12];

/** Mène un mot de la banque jusqu'au palier acquis par le chemin réel : découverte à
    l'atelier (entrée en rotation, #641) puis six réussites, chacune à son échéance. */
function ancrerMot(state: OrthoState, id: string, depart = T0): void {
	const m = state.banque[id];
	marquerAtelierFait(m, depart);
	let t = depart;
	for (let i = 0; i < PALIER_ACQUIS; i++) {
		t = m.revision.prochaineRevision ?? t;
		avancerMotRevision(state, id, true, t);
	}
}

interface OptionsMots {
	ancres?: boolean;
	maitrises?: boolean; // motCache + tuiles (métrique EXISTANTE orthoMotsMaitrises)
	origine?: 'liste' | 'predefini';
	decalage?: number; // pour semer deux lots sans collision de formes
}
/** Sème `n` mots dans la banque du profil actif et renvoie leurs ids. */
function semerMots(n: number, opts: OptionsMots = {}): string[] {
	const state = loadOrtho();
	const mots = Array.from({ length: n }, (_, i) => ({ mot: motFactice(i + (opts.decalage ?? 0)) }));
	const ids = ajouterMots(state, mots, opts.origine ?? 'liste');
	expect(ids.length).toBe(n); // aucune collision de forme : la fixture a bien la taille voulue
	for (const id of ids) {
		// L'escalier monte tuiles → motCache → dictee, et `validerMode` est CUMULATIVE :
		// valider `motCache` valide aussi les tuiles, soit exactement les deux marches que
		// compte `orthoMotsMaitrises`.
		if (opts.maitrises) validerMode(state.banque[id], 'motCache', T0);
		if (opts.ancres) ancrerMot(state, id);
	}
	saveOrtho(state);
	return ids;
}

/* Cible VERBE (#261) : matérialisée comme le fait `materialiserVerbes` une fois les formes
   résolues (ici fournies, donc synchrone) — seul moyen d'obtenir un mot d'origine 'verbe'
   sans passer par LEFFF. */
const CHANTER: VerbeConfig = {
	kind: 'verbe',
	infinitif: 'chanter',
	pronoms: [2],
	temps: ['present'],
};
const FORMES_CHANTER: FormesConjuguees = [
	'chante',
	'chantes',
	'chante',
	'chantons',
	'chantez',
	'chantent',
];
function semerCibleVerbe(): string {
	const state = loadOrtho();
	const [cible] = expanseVerbe(
		CHANTER,
		new Map<VerbTense, FormesConjuguees>([['present', FORMES_CHANTER]]),
		T0,
	);
	state.banque[cible.id] = cible;
	ancrerMot(state, cible.id);
	saveOrtho(state);
	return cible.id;
}

/* ---------- Notions (paires leçon × niveau) ---------- */
function semerRevisions(raw: Record<string, EtatRevision>): void {
	lsSet(LESSON_REVISION_KEY, raw);
}
/* Écriture BRUTE de la carte, hors du typage d'`EtatRevision` : sert aux états corrompus
   (cf. le bloc « ÉTATS CORROMPUS », section 1), qu'aucun chemin de l'appli ne sait produire. */
function semerRevisionsBrutes(carte: unknown): void {
	lsSet(LESSON_REVISION_KEY, carte);
}
/** Toutes les paires `lessonId@niveau` du catalogue, dans un ordre stable. */
const pairesCatalogue = (): string[] =>
	getAllLessons()
		.flatMap((l: LessonDef) => l.levels.map((lv: SchoolLevel) => `${l.id}@${lv}`))
		.sort();
/** Sème `n` paires ANCRÉES, prises dans le catalogue. */
function semerNotionsAncrees(n: number): string[] {
	const paires = pairesCatalogue().slice(0, n);
	expect(paires.length).toBe(n); // le catalogue doit avoir de quoi atteindre le seuil
	const raw: Record<string, EtatRevision> = {};
	for (const k of paires) raw[k] = etatAncre();
	semerRevisions(raw);
	return paires;
}

/** Une leçon d'une matière donnée, disponible à CES niveaux exactement. */
function leconAuxNiveaux(subject: string, niveaux: SchoolLevel[]): LessonDef {
	const l = getAllLessons().find(
		(x) =>
			x.subject === subject &&
			x.levels.length === niveaux.length &&
			niveaux.every((lv) => x.levels.includes(lv)),
	);
	if (!l) throw new Error(`aucune leçon ${subject} aux niveaux ${niveaux.join('+')}`);
	return l;
}

/* ============================================================
   0. Prémisse : ce que « ancré » veut dire (socle des fixtures)
   ============================================================ */
describe('prémisse — l’escalier de la répétition espacée', () => {
	it('six réussites d’affilée mènent au palier acquis, cinq n’y suffisent pas', () => {
		expect(estAcquis(etatPalier(PALIER_ACQUIS - 1))).toBe(false);
		expect(estAcquis(etatAncre())).toBe(true);
		expect(etatAncre().palier).toBe(PALIER_ACQUIS);
		expect(etatAncre().prochaineRevision).toBeNull(); // sorti de la rotation
	});

	it('un élément ancré l’est au plus tôt après 137 jours sans échec', () => {
		const attendu = REVISION_INTERVALLES.reduce((a, b) => a + b, 0);
		expect(attendu).toBe(137 * JOUR); // 1 + 3 + 7 + 16 + 35 + 75
		expect(etatAncre().dernierTest).toBe(T0 + attendu);
	});
});

/* ============================================================
   1. Les mots ancrés (critères 1, 2, 12)
   ============================================================ */
describe('mots ancrés — la métrique', () => {
	it('critère 2 : un mot d’une liste saisie par le parent compte dès le palier acquis', () => {
		semerMots(1, { ancres: true, origine: 'liste' });
		expect(gSnapshot().orthoMotsAncres).toBe(1);
	});

	it('critère 2 : un mot d’une liste livrée (predefini) compte de la même façon', () => {
		semerMots(1, { ancres: true, origine: 'predefini' });
		expect(gSnapshot().orthoMotsAncres).toBe(1);
	});

	it('critère 2 : une cible verbe ancrée compte elle aussi', () => {
		const id = semerCibleVerbe();
		expect(loadOrtho().banque[id].origine).toBe('verbe'); // prémisse : bien une cible verbe
		expect(gSnapshot().orthoMotsAncres).toBe(1);
	});

	it('critère 2 (bord) : un mot au palier juste en dessous, ou jamais entré en rotation, ne compte pas', () => {
		const state = loadOrtho();
		const [presque, jamais] = ajouterMots(state, [{ mot: 'chemin' }, { mot: 'village' }]);
		marquerAtelierFait(state.banque[presque], T0);
		state.banque[presque].revision = etatPalier(PALIER_ACQUIS - 1);
		saveOrtho(state);
		expect(loadOrtho().banque[jamais].revision.palier).toBe(0); // prémisse : hors rotation
		expect(gSnapshot().orthoMotsAncres).toBe(0);
	});

	it('critère 12 : « mots maîtrisés » (motCache + tuiles) ne bouge pas avec l’ancrage', () => {
		semerMots(12, { ancres: true });
		const g = gSnapshot();
		expect(g.orthoMotsAncres).toBe(12);
		expect(g.orthoMotsMaitrises).toBe(0); // aucun mode validé : rien de maîtrisé
		evaluateTrophies();
		expect(acquisFamille('orthoAncres')).toEqual(['orthoAncres1']);
		expect(acquisFamille('orthoMots')).toEqual([]);
	});

	it('critère 12 (contre-épreuve) : des mots maîtrisés mais non ancrés ne donnent rien d’ancré', () => {
		semerMots(10, { maitrises: true });
		const g = gSnapshot();
		expect(g.orthoMotsMaitrises).toBe(10);
		expect(g.orthoMotsAncres).toBe(0);
		evaluateTrophies();
		expect(acquisFamille('orthoMots')).toEqual(['orthoMots10']);
		expect(acquisFamille('orthoAncres')).toEqual([]);
	});

	it('critère 12 : la famille orthoMots garde ses quatre paliers et son premier seuil (9 ≠ 10)', () => {
		const ids = TROPHIES.map((t) => t.id);
		expect(idsFamille('orthoMots', ids)).toEqual([...IDS_MOTS_MAITRISES].sort());
		semerMots(9, { maitrises: true });
		evaluateTrophies();
		expect(acquisFamille('orthoMots')).toEqual([]);
		semerMots(1, { maitrises: true, decalage: 9 });
		evaluateTrophies();
		expect(acquisFamille('orthoMots')).toEqual(['orthoMots10']);
	});

	/* ---------- ÉTATS CORROMPUS : ce que ces verrous gardent, et ce qu'ils ne prétendent pas
	   ----------
	   CE N'EST PAS LA REPRODUCTION D'UN DÉFAUT VIVANT — mesuré le 2026-09-08, tous ces cas
	   passent en l'état. `estAcquis` s'écrit `!!e && e.palier >= PALIER_ACQUIS` : un état de
	   révision absent, un `palier` manquant ou non numérique, une entrée qui n'est même pas un
	   objet, tout cela vaut `false` sans rien faire tomber, et l'élément douteux n'est
	   simplement pas compté (un `for...in` sur une valeur non-objet ne lève pas non plus).

	   CE QU'ILS GARDENT, c'est l'AVENIR de cette lecture. Une déstructuration
	   (`const { palier } = e`), une garde de type stricte ou le passage à une lecture de champ
	   obligatoire y réintroduiraient un plantage — sur des données IMPORTÉES ou corrompues,
	   donc chez un enfant qui restaure une sauvegarde, et sur des chemins (galerie des
	   trophées, bilan de fin de session) qu'aucun autre cas de ce fichier n'éprouve avec autre
	   chose que des états sains.

	   CE QU'ILS NE GARDENT PAS, délibérément : la coercition d'une chaîne NUMÉRIQUE. Mesuré :
	   un `palier: '6'` est aujourd'hui COMPTÉ (`'6' >= 6` est vrai en JS). Aucune assertion de
	   ce fichier ne fige ce cas dans un sens ou dans l’autre — le compter est bénin (l’élément
	   est bien au sommet), et une garde de type stricte qui cesserait de le compter serait tout
	   aussi défendable. Ce qui est verrouillé est plus étroit : rien ne PLANTE, et rien de non
	   numérique ne décroche un palier.

	   Aucune de ces formes ne peut naître d'un chemin d'écriture de l'appli : elles sont donc
	   posées à la main, et TOUJOURS à côté d'un élément sain — sans quoi le test ne
	   distinguerait pas « l'élément douteux ne compte pas » de « la métrique ne renvoie plus
	   rien ». */
	it('robustesse : un mot sans état de révision, ou sans palier, ne compte pas et ne fait rien tomber', () => {
		const [sain, sansRevision, sansPalier] = semerMots(3, { ancres: true });
		expect(gSnapshot().orthoMotsAncres).toBe(3); // prémisse : les trois sont bien ancrés

		const state = loadOrtho();
		// `delete` est refusé par TS sur un champ obligatoire ; Reflect fait le trou sans cast.
		Reflect.deleteProperty(state.banque[sansRevision], 'revision');
		Reflect.deleteProperty(state.banque[sansPalier].revision, 'palier');
		saveOrtho(state);

		expect(() => gSnapshot()).not.toThrow();
		expect(gSnapshot().orthoMotsAncres).toBe(1); // le seul mot resté sain
		expect(loadOrtho().banque[sain].revision.palier).toBe(PALIER_ACQUIS); // voisin intact
		expect(() => evaluateTrophies()).not.toThrow();
		expect(acquisFamille('orthoAncres')).toEqual(['orthoAncres1']);
	});
});

/* ============================================================
   2. Les notions ancrées (critères 1, 3, 4)
   ============================================================ */
describe('notions ancrées — la métrique', () => {
	it('critère 3 : la même leçon ancrée au CE2 puis au CM1 compte deux fois', () => {
		const lecon = leconAuxNiveaux('math', ['ce2', 'cm1']);
		semerRevisions({
			[`${lecon.id}@ce2`]: etatAncre(),
			[`${lecon.id}@cm1`]: etatAncre(),
		});
		// Dédupliquer par lessonId donnerait 1 : c'est exactement ce que ce test refuse.
		expect(notionsAncrees()).toBe(2);
		expect(gSnapshot().notionsAncrees).toBe(2);
	});

	it('critère 4 : le compte est lu sur l’état BRUT — passer les maths au CM1 ne le fait pas baisser', () => {
		setNiveauReference('ce2');
		const ce2Seule = leconAuxNiveaux('math', ['ce2']);
		const deuxNiveaux = leconAuxNiveaux('math', ['ce2', 'cm1']);
		semerRevisions({
			[`${ce2Seule.id}@ce2`]: etatAncre(),
			[`${deuxNiveaux.id}@ce2`]: etatAncre(),
			[`${deuxNiveaux.id}@cm1`]: etatAncre(),
		});
		expect(notionsAncrees()).toBe(3);

		setNiveauMatiere('math', 'cm1'); // la matière change de classe
		// La vue SCOPÉE ne voit plus qu'une seule des trois paires ancrées…
		const ancreesScopees = Object.values(loadLessonRevisions()).filter(estAcquis).length;
		expect(ancreesScopees).toBe(1);
		// … la métrique, elle, ne bouge pas : c'est cet écart qui rend le test discriminant.
		expect(notionsAncrees()).toBe(3);
		expect(gSnapshot().notionsAncrees).toBe(3);
	});

	it('critère 4 : une entrée dont la leçon a quitté le catalogue compte encore', () => {
		semerRevisions({ 'lecon-disparue@ce2': etatAncre() });
		expect(getAllLessons().some((l) => l.id === 'lecon-disparue')).toBe(false); // prémisse
		expect(notionsAncrees()).toBe(1);
	});

	it('critère 4 (bord) : une notion au palier juste en dessous ne compte pas', () => {
		const lecon = leconAuxNiveaux('math', ['ce2']);
		semerRevisions({ [`${lecon.id}@ce2`]: etatPalier(PALIER_ACQUIS - 1) });
		expect(notionsAncrees()).toBe(0);
	});

	it('critère 1 : les deux compteurs ne se contaminent pas', () => {
		semerMots(3, { ancres: true });
		semerNotionsAncrees(5);
		const g = gSnapshot();
		// Un compteur unique mélangeant les deux familles vaudrait 8 des deux côtés.
		expect(g.orthoMotsAncres).toBe(3);
		expect(g.notionsAncrees).toBe(5);
	});

	/* Robustesse — cf. le bloc « ÉTATS CORROMPUS » de la section 1 pour ce que ces deux cas
	   gardent, et pourquoi ce n'est pas un défaut vivant. */
	it('robustesse : une entrée sans palier, ou à palier non numérique, ne compte pas et ne fait rien tomber', () => {
		const lecon = leconAuxNiveaux('math', ['ce2']);
		semerRevisionsBrutes({
			[`${lecon.id}@ce2`]: etatAncre(), // la SEULE entrée saine
			'sans-palier@ce2': { dernierTest: T0, prochaineRevision: null },
			'palier-texte@ce2': { ...etatAncre(), palier: 'acquis' },
			'palier-nul@ce2': { ...etatAncre(), palier: null },
			'palier-objet@ce2': { ...etatAncre(), palier: {} },
			'palier-booleen@ce2': { ...etatAncre(), palier: true },
			'entree-non-objet@ce2': 'ancrée',
			'entree-nulle@ce2': null,
		});
		expect(() => notionsAncrees()).not.toThrow();
		expect(notionsAncrees()).toBe(1);
		expect(() => gSnapshot()).not.toThrow();
		expect(gSnapshot().notionsAncrees).toBe(1);
		expect(() => evaluateTrophies()).not.toThrow();
		expect(acquisFamille('notionsAncrees')).toEqual(['notionsAncrees1']);
	});

	it('robustesse : une carte de révisions qui n’est pas un objet ne compte rien et ne fait rien tomber', () => {
		for (const carte of ['ludaskia', 42, true, ['pas-une-carte']]) {
			const quoi = `carte brute ${JSON.stringify(carte)}`;
			semerRevisionsBrutes(carte);
			expect(() => notionsAncrees()).not.toThrow();
			expect(notionsAncrees(), quoi).toBe(0);
			expect(() => gSnapshot()).not.toThrow();
			expect(gSnapshot().notionsAncrees, quoi).toBe(0);
		}
	});
});

/* ============================================================
   3. Les seuils, éprouvés au bord (critère 5)
   ============================================================ */
describe('critère 5 — seuils des deux familles', () => {
	it('chaque famille a exactement quatre paliers, aux ids attendus', () => {
		const ids = TROPHIES.map((t) => t.id);
		expect(idsFamille('orthoAncres', ids)).toEqual([...IDS_MOTS].sort());
		expect(idsFamille('notionsAncrees', ids)).toEqual([...IDS_NOTIONS].sort());
	});

	const attendusMots = (n: number): string[] =>
		SEUILS_MOTS.filter((s) => n >= s)
			.map((s) => `orthoAncres${s}`)
			.sort();
	for (const n of [0, 1, 149, 150, 299, 300, 419, 420]) {
		it(`mots : ${n} mot(s) ancré(s) → ${attendusMots(n).length} palier(s)`, () => {
			if (n > 0) semerMots(n, { ancres: true });
			expect(gSnapshot().orthoMotsAncres).toBe(n);
			evaluateTrophies();
			expect(acquisFamille('orthoAncres')).toEqual(attendusMots(n));
			expect(acquisFamille('notionsAncrees')).toEqual([]); // familles indépendantes (critère 1)
		});
	}

	const attendusNotions = (n: number): string[] =>
		SEUILS_NOTIONS.filter((s) => n >= s)
			.map((s) => `notionsAncrees${s}`)
			.sort();
	for (const n of [0, 1, 44, 45, 119, 120, 199, 200]) {
		it(`notions : ${n} notion(s) ancrée(s) → ${attendusNotions(n).length} palier(s)`, () => {
			if (n > 0) semerNotionsAncrees(n);
			expect(gSnapshot().notionsAncrees).toBe(n);
			evaluateTrophies();
			expect(acquisFamille('notionsAncrees')).toEqual(attendusNotions(n));
			expect(acquisFamille('orthoAncres')).toEqual([]); // familles indépendantes (critère 1)
		});
	}
});

/* ============================================================
   4. Les libellés (critère 8) — mécanisé en PROPRIÉTÉ
   ============================================================ */
/* CE QUE LE GATE EXIGE. Un libellé de ces huit trophées doit situer l'accomplissement dans
   la DURÉE, pas dans l'effort du jour. Trois volets, appliqués au titre ET à la description :
   (a) aucune phrase ne COMMENCE par un verbe d'action adressé à l'enfant (impératif ou
       infinitif de consigne : « Réussis… », « Terminer… ») — c'est la formulation qui laisse
       croire qu'on peut faire avancer la chose maintenant ;
   (b) aucun ancrage sur l'instant (« aujourd'hui », « du jour », « cette séance »,
       « maintenant », « tout de suite ») ;
   (c) au moins un marqueur de durée ou de permanence (mois, semaines, année, longtemps, au
       fil du temps, ancré, retenu, gardé, mémoire, oubli, depuis, toujours, encore…).

   CE QU'IL ATTRAPE. « Réussis 6 fois ce mot. » (a) ; « Terminer 7 programmes du jour. »
   (a + b) ; « 150 mots maîtrisés. » (c : rien qui parle de durée — c'est le libellé d'effort
   qu'on recopie sans y penser depuis une famille voisine).

   CE QU'IL LAISSE PASSER. Une formulation non impérative mais quand même centrée sur
   l'effort, si elle glisse un mot de durée (« 150 mots travaillés encore et encore. ») ; une
   durée FAUSSE (« ancré depuis 3 jours ») ; le registre et la justesse de la langue. Le gate
   garde le franchissement grossier, pas la qualité d'écriture : celle-ci reste au
   `redacteur-contenu-francais` et au `pedagogue-primaire`.

   NB : « jour(s) » n'est VOLONTAIREMENT pas un marqueur de durée — « du jour » est
   précisément la formulation d'effort immédiat que le critère refuse. */
const VERBE_INJONCTION =
	/^(r[ée]ussis|r[ée]ussir|termine|terminer|fais|faire|d[ée]croche|d[ée]crocher|cumule|cumuler|travaille|travailler|gagne|gagner|atteins|atteindre|obtiens|obtenir|continue|continuer|refais|refaire|recommence|recommencer|entra[îi]ne|entra[îi]ner|r[ée]vise|r[ée]viser|bats|battre|ajoute|ajouter|rejoue|rejouer|compl[èe]te|compl[ée]ter)\b/i;
const ANCRAGE_INSTANT =
	/(aujourd[’']hui|du jour|cette s[ée]ance|cette session|maintenant|tout de suite)/i;
const MARQUEUR_DUREE =
	/(mois|semaines?|ann[ée]es?|\ban\b|longtemps|dur[ée]e|durable(ment)?|au fil|(dans|avec) le temps|ancr[ée]|retenu|gard[ée]|m[ée]moire|oubli|depuis|toujours|encore|d[ée]finitivement|pour de bon|solide|tien(t|nent)|rest[ée])/i;

/** Le libellé situe-t-il l'accomplissement dans la durée ? (cf. commentaire ci-dessus) */
function situeDansLaDuree(titre: string, description: string): boolean {
	const phrases = `${titre}. ${description}`
		.split(/[.!?]+/)
		.map((p) => p.trim())
		.filter(Boolean);
	if (phrases.some((p) => VERBE_INJONCTION.test(p))) return false;
	const tout = `${titre} ${description}`;
	if (ANCRAGE_INSTANT.test(tout)) return false;
	return MARQUEUR_DUREE.test(tout);
}

describe('critère 8 — les libellés disent la durée, pas l’effort du jour', () => {
	it('le gate discrimine (sans quoi il ne garderait rien)', () => {
		// Refusés : injonction d'action immédiate, ancrage sur l'instant, ou aucune durée.
		expect(situeDansLaDuree('Six réussites', 'Réussis 6 fois ce mot.')).toBe(false);
		// Aucun mot de durée NULLE PART, titre compris (« Mots ancrés » en porterait un).
		expect(situeDansLaDuree('Collection de mots', '150 mots maîtrisés.')).toBe(false);
		expect(situeDansLaDuree('Suivi régulier', 'Terminer 7 programmes du jour.')).toBe(false);
		expect(situeDansLaDuree('Mémoire vive', 'Encore sus, tout de suite après.')).toBe(false);
		// Acceptés : l'accomplissement est daté dans la durée, sans rien à faire aujourd'hui.
		expect(situeDansLaDuree('Mots ancrés', '150 mots encore sus des mois plus tard.')).toBe(true);
		expect(situeDansLaDuree('La mémoire longue', 'Une notion retenue plusieurs mois.')).toBe(true);
	});

	it('les huit libellés passent la propriété', () => {
		for (const id of [...IDS_MOTS, ...IDS_NOTIONS]) {
			const t = trophee(id);
			expect(t, `trophée ${id} absent`).toBeDefined();
			expect(situeDansLaDuree(t!.title, t!.desc), `${id} : « ${t!.title} » / « ${t!.desc} »`).toBe(
				true,
			);
		}
	});

	it('les huit titres et les huit descriptions sont distincts et non vides', () => {
		const tous = [...IDS_MOTS, ...IDS_NOTIONS].map((id) => trophee(id));
		for (const t of tous) expect(t).toBeDefined();
		const titres = tous.map((t) => t!.title.trim());
		const descs = tous.map((t) => t!.desc.trim());
		expect(titres.every((s) => s.length > 0)).toBe(true);
		expect(descs.every((s) => s.length > 0)).toBe(true);
		expect(new Set(titres).size).toBe(8);
		expect(new Set(descs).size).toBe(8);
	});
});

/* ============================================================
   5. Un trophée obtenu ne se reverrouille jamais (critère 11)
   ============================================================ */
describe('critère 11 — rien ne reprend un trophée déjà obtenu', () => {
	it('changer le niveau d’une matière ne reprend pas une notion ancrée', () => {
		setNiveauReference('ce2');
		const lecon = leconAuxNiveaux('math', ['ce2']);
		semerRevisions({ [`${lecon.id}@ce2`]: etatAncre() });
		evaluateTrophies();
		expect(acquis()).toContain('notionsAncrees1'); // prémisse

		setNiveauMatiere('math', 'cm1');
		evaluateTrophies();
		expect(acquis()).toContain('notionsAncrees1');
		expect(visiblesIds()).toContain('notionsAncrees1');
	});

	it('une leçon retirée du catalogue ne reprend pas le trophée', () => {
		const lecon = leconAuxNiveaux('math', ['ce2']);
		semerRevisions({ [`${lecon.id}@ce2`]: etatAncre() });
		evaluateTrophies();
		expect(acquis()).toContain('notionsAncrees1'); // prémisse

		// Ce que laisse une leçon retirée du catalogue : sa clé, sans leçon en face.
		semerRevisions({ 'lecon-disparue@ce2': etatAncre() });
		evaluateTrophies();
		expect(acquis()).toContain('notionsAncrees1');
		expect(visiblesIds()).toContain('notionsAncrees1');
		expect(gSnapshot().notionsAncrees).toBe(1); // l'entrée orpheline compte toujours
	});

	it('supprimer un mot de la banque ne reprend pas le trophée', () => {
		const [id] = semerMots(1, { ancres: true });
		evaluateTrophies();
		expect(acquis()).toContain('orthoAncres1'); // prémisse

		const state = loadOrtho();
		expect(supprimerMot(state, id)).toBe(true);
		saveOrtho(state);
		expect(gSnapshot().orthoMotsAncres).toBe(0); // la métrique est vivante…
		evaluateTrophies();
		expect(acquis()).toContain('orthoAncres1'); // … le trophée, lui, reste acquis
		expect(visiblesIds()).toContain('orthoAncres1');
	});
});

/* ============================================================
   6. L'XP ne change pas (critère 13)
   ============================================================ */
describe('critère 13 — aucun XP attaché à ces paliers', () => {
	it('ancrer des mots et des notions, puis décrocher les trophées, ne rapporte aucun point', () => {
		const avant = getXP();
		semerMots(2, { ancres: true });
		semerNotionsAncrees(3);
		expect(getXP()).toBe(avant);

		const nouveaux = evaluateTrophies().map((t) => t.id);
		expect(nouveaux).toContain('orthoAncres1'); // prémisse : les trophées tombent bien
		expect(nouveaux).toContain('notionsAncrees1');
		expect(getXP()).toBe(avant);
	});
});
