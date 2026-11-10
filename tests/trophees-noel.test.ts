/* ============================================================
   #785 — Trophées de Noël : branchés sur le vrai chemin des parties.

   Contrat d'intégration (issue #785) : chaque session finalisée du profil actif de type
   leçon, bilan, sprint, révision ou dictée note son jour de décembre ; une séance
   partagée, non (#734 : elle ne fait bouger aucun trophée). `TROPHIES` gagne `noel1`,
   `noel5`, `noel10` (1, 5 et 10 jours de travail en décembre), sans XP.

   Attendus dérivés des critères de l'issue, pas de l'implémentation. Les seuils viennent
   de l'issue (1, 5, 10) ; les titres et descriptions ne sont PAS figés ici (relus
   ailleurs) : on ne vérifie que leur présence, et l'annonce se reconnaît au titre lu dans
   `TROPHIES`.

   Critère 33 : l'horloge est figée dans chaque test, les dates construites en heure
   locale. Les bords de journée sous plusieurs fuseaux sont éprouvés dans
   `jours-decembre.test.ts` ; ici, on vérifie le branchement.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllLessons } from '../src/core/catalog';
import { compterJoursDecembre, loadJoursDecembre } from '../src/core/jours-decembre';
import { recordLessonRun, type LessonRunOutcome } from '../src/core/lesson-run';
import {
	activeProfile,
	addProfile,
	initProfiles,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import {
	addXP,
	getXP,
	niveauDepuisXP,
	recordActivitePartage,
	recordLessonStats,
	recordRun,
	recordSessionActivity,
	type ActivityKind,
} from '../src/core/progress';
import { recompensesFin, type CelebEntry } from '../src/core/recompenses-fin';
import {
	evaluateTrophies,
	gSnapshot,
	loadTrophies,
	TROPHIES,
	trophiesVisibles,
	type Trophy,
} from '../src/core/rewards';
import { setOnDataWrite } from '../src/core/storage';
import { withSeed } from '../src/core/utils';

const NOEL = ['noel1', 'noel5', 'noel10'] as const;
type IdNoel = (typeof NOEL)[number];
const estNoel = (id: string): boolean => (NOEL as readonly string[]).includes(id);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 6, 14, 10, 0)); // juillet : loin de décembre
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});
afterEach(() => {
	vi.useRealTimers();
});

/* ---------- Petit outillage ---------- */

/** Instant en heure LOCALE (mois 1-12). */
const le = (annee: number, mois: number, jour: number, h = 10, min = 0): Date =>
	new Date(annee, mois - 1, jour, h, min);

const trophee = (id: string): Trophy => {
	const t = TROPHIES.find((x) => x.id === id);
	if (!t) throw new Error(`trophée absent de TROPHIES : ${id}`);
	return t;
};

const lecons = (): string[] => {
	const ids = getAllLessons()
		.filter((l) => l.levels.includes('ce2'))
		.map((l) => l.id);
	if (ids.length < 3) throw new Error('il faut au moins trois leçons CE2 au catalogue');
	return ids;
};

/** Une leçon jouée jusqu'au bout, terminée à `quand`. */
function partie(quand: Date, ok = 4, total = 5, lessonId = lecons()[0]): LessonRunOutcome {
	vi.setSystemTime(quand);
	return recordLessonRun({
		mode: 'lecon',
		lessonId,
		ok,
		questionCount: total,
		ms: 60_000,
		perLesson: { [lessonId]: { ok, total } },
	});
}

/** Une partie par jour, du `premier` au `dernier` jour du mois donné. */
function unePartieParJour(
	annee: number,
	mois: number,
	premier: number,
	dernier: number,
): LessonRunOutcome[] {
	const out: LessonRunOutcome[] = [];
	for (let j = premier; j <= dernier; j++) out.push(partie(le(annee, mois, j)));
	return out;
}

const acquis = (): Set<string> => new Set<string>(loadTrophies());
const noelAcquis = (): string[] => NOEL.filter((id) => acquis().has(id));
const joursComptes = (): number => compterJoursDecembre(loadJoursDecembre());
const annonce = (celeb: CelebEntry[], id: IdNoel): boolean => {
	const titre = trophee(id).title; // lu AVANT : sur une annonce vide, `some` ne le lirait jamais
	return celeb.some((c) => c.text.includes(titre));
};

/* Ce qu'une session de révision écrit (modèle de `recompenses-fin.test.ts`, calqué sur
   ui/revision.ts) : 1 XP par bonne réponse, un essai `revision-espacee`, les stats. */
function sessionRevision(quand: Date, lessonId: string, ok: number, total: number): void {
	vi.setSystemTime(quand);
	addXP(ok);
	recordRun('revision-espacee', ok, total, 60_000);
	recordLessonStats({ [lessonId]: { ok, total } }, 'revision');
}

/* ---------- Critère 19 : galerie ---------- */

describe('trophées de Noël — critère 19 : dans la galerie toute l’année', () => {
	it('critère 19 : en juillet, avant obtention, les trois sont visibles avec un titre et une condition', () => {
		const visibles = new Map(trophiesVisibles().map((t) => [t.id, t]));
		for (const id of NOEL) {
			const t = visibles.get(id);
			expect(t, `${id} absent de la galerie en juillet`).toBeDefined();
			expect(t?.title.trim(), id).not.toBe('');
			expect(t?.desc.trim(), id).not.toBe('');
		}
		expect(noelAcquis()).toEqual([]);
	});

	it('critère 19 : visibles aussi pour un profil qui n’a jamais joué en décembre, en novembre', () => {
		unePartieParJour(2026, 11, 2, 6);
		const ids = new Set(trophiesVisibles().map((t) => t.id));
		for (const id of NOEL) expect(ids.has(id), id).toBe(true);
		expect(noelAcquis()).toEqual([]);
	});
});

/* ---------- Critère 19 + convention #660 : un constat, pas une consigne ---------- */

/* Visibles toute l'année, gagnables seulement en décembre : la description ne doit pas se
   lire comme « voilà quelque chose à faire » (docs/architecture/conventions-redaction.md,
   « Un trophée qu'on ne peut pas gagner aujourd'hui ne se décrit pas à l'infinitif (#660) »).

   COPIE de `VERBE_INJONCTION`, partie (a) du gate de `tests/trophees-ancres.test.ts`
   (critère 8, `situeDansLaDuree`) : les deux listes évoluent ensemble. Un écart, voulu :
   on tolère en tête un pronom réfléchi (« S'entraîner », « Se réviser »). La copie brute
   laissait passer « S'entraîner un jour de décembre. », précisément la première version
   de ces trophées, parce que le motif source ne regarde que le premier mot.

   Ce que le motif ne voit pas : un verbe absent de la liste (« Jouer un jour de
   décembre. » passerait). La liste reste la source de vérité ; l'étendre aux deux
   endroits à la fois. */
const VERBE_INJONCTION =
	/^(?:s['’]|se\s+)?(r[ée]ussis|r[ée]ussir|termine|terminer|fais|faire|d[ée]croche|d[ée]crocher|cumule|cumuler|travaille|travailler|gagne|gagner|atteins|atteindre|obtiens|obtenir|continue|continuer|refais|refaire|recommence|recommencer|entra[îi]ne|entra[îi]ner|r[ée]vise|r[ée]viser|bats|battre|ajoute|ajouter|rejoue|rejouer|compl[èe]te|compl[ée]ter)\b/i;

/** Aucune phrase du titre ni de la description ne commence par une consigne. */
function sansConsigneEnTete(titre: string, description: string): boolean {
	return !`${titre}. ${description}`
		.split(/[.!?]+/)
		.map((p) => p.trim())
		.filter(Boolean)
		.some((p) => VERBE_INJONCTION.test(p));
}

describe('trophées de Noël — critère 19 : la condition se lit comme un constat', () => {
	it('le motif discrimine (sans quoi le test ne garderait rien)', () => {
		expect(sansConsigneEnTete('Premier flocon', "S'entraîner un jour de décembre.")).toBe(false);
		expect(sansConsigneEnTete('Premier flocon', 'S’entraîner un jour de décembre.')).toBe(false);
		expect(sansConsigneEnTete('Premier flocon', 'Entraîne-toi un jour de décembre.')).toBe(false);
		expect(sansConsigneEnTete('Premier flocon', 'Un jour d’entraînement en décembre.')).toBe(true);
		expect(sansConsigneEnTete('Premier flocon', "Un jour d'entraînement en décembre.")).toBe(true);
	});

	it('ni le titre ni la description des trois trophées ne commencent par un impératif ou un infinitif de consigne', () => {
		// Liste des fautifs plutôt qu'un `expect` par trophée : l'échec les nomme tous à la fois.
		const fautifs = NOEL.map(trophee)
			.filter((t) => !sansConsigneEnTete(t.title, t.desc))
			.map((t) => `${t.id} : « ${t.title} » / « ${t.desc} »`);
		expect(fautifs).toEqual([]);
	});
});

/* ---------- Contrat d'intégration : quelles sessions comptent ---------- */

describe('jours de décembre — quelles parties comptent (contrat du journal)', () => {
	it.each<ActivityKind>(['lecon', 'bilan', 'sprint'])(
		'une session « %s » avec au moins une question compte pour son jour',
		(kind) => {
			vi.setSystemTime(le(2026, 12, 3));
			const id = lecons()[0];
			recordLessonStats({ [id]: { ok: 2, total: 3 } }, kind, kind === 'lecon' ? id : undefined);
			expect(joursComptes()).toBe(1);
		},
	);

	it.each<ActivityKind>(['revision', 'dictee'])(
		'une session « %s » finalisée compte pour son jour',
		(kind) => {
			vi.setSystemTime(le(2026, 12, 3));
			recordSessionActivity(kind);
			expect(joursComptes()).toBe(1);
		},
	);

	it('#734 : une séance partagée ne compte pas (seule la leçon du lendemain compte)', () => {
		vi.setSystemTime(le(2026, 12, 2));
		recordActivitePartage(Date.now());
		evaluateTrophies();
		expect(noelAcquis()).toEqual([]);
		partie(le(2026, 12, 3));
		expect(joursComptes()).toBe(1);
	});

	/* Arbitrage du 09/11/2026 : on filtre par TYPE de session, pas par chemin d'appel. Une
	   séance partagée qui passerait par le chemin générique ne compte pas davantage. */
	it('#734 : une séance « partage » journalisée par recordSessionActivity ne compte pas non plus', () => {
		vi.setSystemTime(le(2026, 12, 2));
		recordSessionActivity('partage');
		evaluateTrophies();
		expect(noelAcquis()).toEqual([]);
		partie(le(2026, 12, 3));
		expect(joursComptes()).toBe(1);
	});

	it('critère 20 : une session sans aucune question jouée ne compte pas', () => {
		vi.setSystemTime(le(2026, 12, 2));
		recordLessonStats({ [lecons()[0]]: { ok: 0, total: 0 } }, 'lecon', lecons()[0]);
		partie(le(2026, 12, 3));
		expect(joursComptes()).toBe(1);
	});

	it('la métrique `joursDecembre` de gSnapshot suit le décompte (contrat des seuils)', () => {
		partie(le(2026, 12, 1, 9));
		partie(le(2026, 12, 1, 17));
		partie(le(2026, 12, 2));
		expect(gSnapshot().joursDecembre).toBe(2);
	});
});

/* ---------- Critères 20 et 21 : seuils, jours distincts, décembre seul ---------- */

describe('trophées de Noël — critères 20 et 21 : seuils de 1, 5 et 10 jours', () => {
	it('critère 20 : débloqués au 1er, au 5e et au 10e jour de travail, pas avant', () => {
		const attendus: Record<number, string[]> = {
			1: ['noel1'],
			4: ['noel1'],
			5: ['noel1', 'noel5'],
			9: ['noel1', 'noel5'],
			10: ['noel1', 'noel5', 'noel10'],
		};
		for (let j = 1; j <= 10; j++) {
			partie(le(2026, 12, j));
			if (attendus[j]) expect(noelAcquis(), `après le jour ${j}`).toEqual(attendus[j]);
		}
	});

	it('critère 20 : dix parties le même jour ne valent qu’un jour (échec : deux leçons font avancer de deux)', () => {
		for (let h = 8; h < 18; h++) partie(le(2026, 12, 5, h));
		expect(joursComptes()).toBe(1);
		expect(noelAcquis()).toEqual(['noel1']);
	});

	it('critère 21 : 3 jours en décembre 2026 puis 2 en décembre 2027 ne débloquent pas « 5 jours »', () => {
		unePartieParJour(2026, 12, 1, 3);
		unePartieParJour(2027, 12, 1, 2);
		expect(joursComptes()).toBe(2);
		expect(noelAcquis()).toEqual(['noel1']);
	});

	it('critère 21 : une partie finie le 1er janvier à 0 h 05 ne compte pas (finie le 31 à 23 h 59, si)', () => {
		unePartieParJour(2026, 12, 27, 30);
		partie(le(2027, 1, 1, 0, 5));
		expect(noelAcquis()).toEqual(['noel1']);

		addProfile('Témoin'); // même histoire, cinquième partie finie une minute avant minuit
		unePartieParJour(2026, 12, 27, 30);
		partie(le(2026, 12, 31, 23, 59));
		expect(noelAcquis()).toEqual(['noel1', 'noel5']);
	});

	it('critère 21 : une partie compte pour le jour où elle se TERMINE (30 novembre 23 h 59 non, 1er décembre 0 h 03 oui)', () => {
		partie(le(2026, 11, 30, 23, 59));
		expect(noelAcquis()).toEqual([]);
		partie(le(2026, 12, 1, 0, 3));
		expect(noelAcquis()).toEqual(['noel1']);
	});
});

/* ---------- Critère 22 : acquis pour toujours, rattrapable ---------- */

describe('trophées de Noël — critère 22', () => {
	it('critère 22 : un trophée obtenu reste acquis l’été et le décembre suivants, sans être réannoncé', () => {
		unePartieParJour(2026, 12, 1, 5);
		expect(noelAcquis()).toEqual(['noel1', 'noel5']);

		vi.setSystemTime(le(2027, 7, 14));
		evaluateTrophies(); // rattrapage de l'accueil
		expect(noelAcquis()).toEqual(['noel1', 'noel5']);
		const galerie = new Set(trophiesVisibles().map((t) => t.id));
		expect(galerie.has('noel1') && galerie.has('noel5')).toBe(true);

		const debut2027 = partie(le(2027, 12, 1));
		expect(joursComptes()).toBe(1); // le compte est bien reparti de zéro…
		expect(noelAcquis()).toEqual(['noel1', 'noel5']); // …sans rien retirer
		expect(debut2027.newTrophies.filter((t) => estNoel(t.id))).toEqual([]);
	});

	it('critère 22 : un trophée manqué un décembre s’obtient le décembre suivant', () => {
		unePartieParJour(2026, 12, 1, 3);
		expect(noelAcquis()).toEqual(['noel1']);
		const parties2027 = unePartieParJour(2027, 12, 1, 5);
		expect(noelAcquis()).toEqual(['noel1', 'noel5']);
		expect(parties2027[4].newTrophies.map((t) => t.id)).toContain('noel5');
	});
});

/* ---------- Critère 23 : annoncé à la fin de la partie qui le débloque ---------- */

describe('trophées de Noël — critère 23 : annonce en fin de partie', () => {
	it('critère 23 : recordLessonRun annonce le trophée à la partie qui le débloque, ni avant ni après', () => {
		const parties = unePartieParJour(2026, 12, 1, 6);
		expect(annonce(parties[0].celeb, 'noel1')).toBe(true);
		expect(annonce(parties[3].celeb, 'noel5')).toBe(false);
		expect(annonce(parties[4].celeb, 'noel5')).toBe(true);
		expect(annonce(parties[5].celeb, 'noel5')).toBe(false);
		expect(annonce(parties[5].celeb, 'noel1')).toBe(false);
	});

	it('critère 23 : recompensesFin annonce le trophée après une révision espacée', () => {
		const niveauAvant = niveauDepuisXP(getXP());
		sessionRevision(le(2026, 12, 3), lecons()[0], 3, 4);
		expect(annonce(recompensesFin(niveauAvant).celeb, 'noel1')).toBe(true);
	});

	it('critère 23 : recompensesFin annonce le trophée après une dictée', () => {
		const niveauAvant = niveauDepuisXP(getXP());
		vi.setSystemTime(le(2026, 12, 3));
		recordSessionActivity('dictee');
		expect(annonce(recompensesFin(niveauAvant).celeb, 'noel1')).toBe(true);
	});
});

/* ---------- Critère 24 : par profil ---------- */

describe('trophées de Noël — critère 24 : chaque profil a les siens', () => {
	it('critère 24 : les jours et les trophées d’un profil ne passent pas à un autre', () => {
		const a = activeProfile().uuid;
		unePartieParJour(2026, 12, 1, 5);
		expect(noelAcquis()).toEqual(['noel1', 'noel5']);

		vi.setSystemTime(le(2026, 12, 6, 9));
		const b = addProfile('B').uuid;
		expect(noelAcquis()).toEqual([]);
		partie(le(2026, 12, 6));
		expect(joursComptes()).toBe(1);
		expect(noelAcquis()).toEqual(['noel1']);

		setActiveProfile(a);
		partie(le(2026, 12, 7));
		expect(joursComptes()).toBe(6);
		expect(noelAcquis()).toEqual(['noel1', 'noel5']);

		setActiveProfile(b);
		expect(joursComptes()).toBe(1);
		expect(noelAcquis()).toEqual(['noel1']);
	});
});

/* ---------- Critères 31 et 32 : rien d'autre ne bouge ---------- */

/* Décalage de 28 jours entre les deux séries : mêmes jours de la semaine, aucune fin de
   mois traversée pendant les parties, aucun changement d'heure (Europe/Paris passe à
   l'heure d'hiver le 25 octobre 2026). Seule différence : novembre ou décembre. */
const DEBUT_NOVEMBRE = le(2026, 11, 3);
const DEBUT_DECEMBRE = le(2026, 12, 1);
const jourApres = (debut: Date, n: number, h = 10): Date =>
	new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + n, h, 0);

/* L'objectif du jour est tiré au sort (`choice`, rewards.ts) : sans graine, deux séries
   identiques n'obtiennent pas leurs trophées d'objectif le même jour (mesuré : `goal7`
   tombait un jour plus tôt d'un lancement à l'autre, une fois sur deux). Chaque série se
   joue donc sous `withSeed`, avec la même graine. */
const GRAINE = 785;

/** Repart d'un profil neuf, créé quatre jours avant `debut` (avant tout historique). */
function profilNeuf(debut: Date): void {
	vi.setSystemTime(jourApres(debut, -4, 8));
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
}

describe('trophées de Noël — critère 31 : aucun XP', () => {
	/** Dix parties identiques, une par jour ; renvoie l'XP gagnée par chacune. */
	function serie(debut: Date): number[] {
		profilNeuf(debut);
		const gains: number[] = [];
		for (let i = 0; i < 10; i++) {
			const avant = getXP();
			partie(jourApres(debut, i));
			gains.push(getXP() - avant);
		}
		return gains;
	}

	it('critère 31 : chaque partie rapporte la même XP en décembre (trophées débloqués) qu’en novembre', () => {
		const novembre = withSeed(GRAINE, () => serie(DEBUT_NOVEMBRE));
		expect(noelAcquis()).toEqual([]);
		const decembre = withSeed(GRAINE, () => serie(DEBUT_DECEMBRE));
		// Sans ce témoin, la comparaison passerait aussi si les trophées n'existaient pas.
		expect(noelAcquis()).toEqual(['noel1', 'noel5', 'noel10']);
		expect(decembre).toEqual(novembre);
	});
});

describe('trophées de Noël — critère 32 : les autres trophées ne changent pas', () => {
	/** Un profil déjà avancé (trois jours d'historique), puis dix jours de parties variées.
	    Renvoie, jour après jour, les trophées NON-Noël acquis. */
	function parcours(debut: Date): string[][] {
		profilNeuf(debut);
		const [l0, l1, l2] = lecons();
		const bilanExpress = (quand: Date) => {
			vi.setSystemTime(quand);
			recordLessonRun({
				mode: 'express',
				lessonId: null,
				ok: 9,
				questionCount: 9,
				ms: 300_000,
				perLesson: {
					[l0]: { ok: 3, total: 3 },
					[l1]: { ok: 3, total: 3 },
					[l2]: { ok: 3, total: 3 },
				},
			});
		};
		for (let i = -3; i < 0; i++) {
			partie(jourApres(debut, i, 9), 5, 5, l0);
			bilanExpress(jourApres(debut, i, 11));
		}
		const autres = (): string[] => [...acquis()].filter((id) => !estNoel(id)).sort();
		const jours: string[][] = [];
		for (let i = 0; i < 10; i++) {
			partie(jourApres(debut, i, 9), 5, 5, l1);
			partie(jourApres(debut, i, 10), 3, 5, l2);
			bilanExpress(jourApres(debut, i, 11));
			const niveau = niveauDepuisXP(getXP());
			sessionRevision(jourApres(debut, i, 14), l0, 4, 4);
			recompensesFin(niveau);
			vi.setSystemTime(jourApres(debut, i, 16));
			recordSessionActivity('dictee');
			recompensesFin(niveauDepuisXP(getXP()));
			jours.push(autres());
		}
		return jours;
	}

	it('critère 32 : un profil avancé obtient les mêmes trophées non-Noël, jour après jour, en novembre et en décembre', () => {
		const novembre = withSeed(GRAINE, () => parcours(DEBUT_NOVEMBRE));
		expect(noelAcquis()).toEqual([]);
		const decembre = withSeed(GRAINE, () => parcours(DEBUT_DECEMBRE));
		expect(noelAcquis()).toEqual(['noel1', 'noel5', 'noel10']); // témoin : décembre a bien compté
		// Plancher : un parcours qui ne débloquerait rien comparerait deux listes vides.
		expect(novembre[novembre.length - 1].length).toBeGreaterThanOrEqual(3);
		expect(decembre).toEqual(novembre);
	});
});
