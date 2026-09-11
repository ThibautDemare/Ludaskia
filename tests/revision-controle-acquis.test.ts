/* ============================================================
   #689 — LE SOMMET DE L'ESCALIER N'EST PLUS UNE SORTIE DÉFINITIVE.

   D'OÙ VIENNENT LES ATTENDUS. Des critères de l'issue #689, écrits AVANT
   l'implémentation : au moment où ce fichier est posé, `avancerEtat` pose
   `prochaineRevision: null` au palier `PALIER_ACQUIS` et `estDu` exige
   `palier < PALIER_ACQUIS` — un élément acquis n'est donc plus jamais revu.
   TOUT ce fichier est rouge aujourd'hui, y compris via une erreur de module
   (les exports `REVISION_CONTROLE_ACQUIS`, `echeanceControle`, `estDuControle`
   n'existent pas encore) : c'est le résultat attendu.

   Cette tranche couvre l'ÉTAT et l'ESCALIER. La sélection en séance et les
   comptes annoncés à l'encadrant sont une autre tranche — pas testés ici.

   ── LE PIÈGE : L'EXEMPTION DE RETARD DE #688 NE DOIT PAS COUVRIR LE SOMMET ──
   `palierApresPassage` exempte un échec servi à ≥ 2 × l'intervalle du palier
   (`serviTresEnRetard`) : l'élément conserve alors son palier au lieu de
   redescendre. Au sommet, l'intervalle de référence pris par `intervalleDe`
   est plafonné au dernier de `REVISION_INTERVALLES` (75 jours), donc le seuil
   « très en retard » naïf y vaudrait 150 jours — très en dessous des 365 jours
   de l'échéance de contrôle. Sans un cas spécial, TOUT contrôle raté un peu
   tardivement (365 + quelques jours) serait exempté, ce qui annule purement
   et simplement le critère 2. Les tests ci-dessous forcent l'échec à J+365
   (pile à l'échéance), J+600 et J+1000 : dans les trois cas, le palier DOIT
   redescendre à `PALIER_ACQUIS - 1`.

   ── LE REPLI DE LECTURE DU CRITÈRE 5 EST PUR, PAS UNE MIGRATION ────────────
   `echeanceControle` doit lire `prochaineRevision` s'il existe, et seulement
   sinon retomber sur `dernierTest + 365 jours` — sans jamais réécrire l'état
   ni le stockage (critère 11). Un acquis SANS `dernierTest` (donnée d'avant
   toute mesure de rétention) n'a aucune date de référence : l'échéance doit
   être `null`, pas un 1970 implicite qui rendrait tout le stock dû d'un coup.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	JOUR,
	PALIER_ACQUIS,
	REVISION_CONTROLE_ACQUIS,
	avancerEtat,
	estAcquis,
	estDu,
	echeanceControle,
	estDuControle,
	etatNeuf,
} from '../src/core/revision';
import { LESSON_REVISION_KEY, loadLessonRevisions, notionsAncrees } from '../src/core/progress';
import { getAllLessons } from '../src/core/catalog';
import { lsSet, setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import type { EtatRevision } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Une date fixe, arbitraire : `revision.ts` reçoit toujours `now` en paramètre, aucune
   dépendance à Date.now(). */
const T0 = new Date(2026, 8, 8, 9, 0, 0, 0).getTime();
const jours = (n: number) => n * JOUR;
/* « 365 jours », dérivé du CRITÈRE 1 lui-même — jamais de la constante du code. */
const UN_AN = jours(365);
/* Dernier intervalle de l'escalier (« ~2-3 mois »), déjà verrouillé par #688
   (`tests/revision-retard.test.ts`) : pas la logique sous test ici, littéral assumé. */
const INTERVALLE_SOMMET = jours(75);

function rendezVous(e: EtatRevision): number {
	const t = e.prochaineRevision;
	if (t == null) throw new Error('élément acquis ou hors rotation : aucun rendez-vous à servir');
	return t;
}
const dernierTestDe = (e: EtatRevision): number => {
	const t = e.dernierTest;
	if (t == null) throw new Error('élément jamais testé : aucun délai écoulé à mesurer');
	return t;
};

/* Monte un état, palier par palier, en servant chaque rendez-vous À L'HEURE (aucun crédit
   #688 en jeu). Aucun palier n'est écrit à la main : si l'escalier change, la fixture suit
   au lieu de mentir. */
function etatALHeure(palier: number): EtatRevision {
	let e = etatNeuf(T0);
	for (let i = 0; i < palier; i++) e = avancerEtat(e, true, rendezVous(e));
	return e;
}

/* Un élément ACQUIS, monté par le chemin réel (six réussites servies à l'heure). */
function etatAcquis(): EtatRevision {
	return etatALHeure(PALIER_ACQUIS);
}

/* Un acquis D'AVANT ce changement (#689) : `prochaineRevision: null`, telle que l'ANCIEN
   `avancerEtat` la posait. Construite à la main À DESSEIN — c'est la forme même que le
   critère 5 demande de savoir lire ; elle ne peut pas venir du chemin réel puisque le
   nouveau code ne la produit plus jamais. */
function etatAcquisAncienneForme(dernierTest: number | null): EtatRevision {
	return { palier: PALIER_ACQUIS, prochaineRevision: null, reussites: 6, dernierTest };
}

/* Photographie brute du stockage des révisions de leçons : ce que « rien ne bouge sans
   passage réel » veut dire côté données (critère 11). */
function instantaneRevisions(): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k && k.includes(LESSON_REVISION_KEY)) out[k] = localStorage.getItem(k);
	}
	return out;
}

/* ============================================================
   La constante
   ============================================================ */
describe('la constante du contrôle d’acquis', () => {
	it('`REVISION_CONTROLE_ACQUIS` vaut 365 jours en millisecondes', () => {
		expect(REVISION_CONTROLE_ACQUIS).toBe(UN_AN);
	});
});

/* ============================================================
   Critère 1 — atteindre le sommet pose une échéance à 365 jours, jamais null
   ============================================================ */
describe('critère 1 — atteindre le sommet pose une échéance de contrôle à 365 jours', () => {
	it('la montée pas à pas jusqu’au sommet pose 365 jours, jamais null', () => {
		const avantSommet = etatALHeure(PALIER_ACQUIS - 1);
		const now = rendezVous(avantSommet);
		const ancre = avancerEtat(avantSommet, true, now);
		expect(ancre.palier).toBe(PALIER_ACQUIS);
		expect(estAcquis(ancre)).toBe(true);
		expect(ancre.prochaineRevision).toBe(now + UN_AN);
		expect(ancre.prochaineRevision).not.toBeNull(); // le défaut d’aujourd’hui
	});

	it('atteindre le sommet via le crédit de retard (#688) pose aussi 365 jours, pas 75', () => {
		/* Palier 5, réussi 400 jours après son dernier test : le crédit de #688 plafonne à 3
		   (donc ne détermine rien ici), mais l'avancement normal (5+1=6) fait franchir le
		   sommet en passant par la branche « tardif » de `palierApresPassage` — le chemin le
		   plus susceptible de laisser fuiter l'intervalle d'escalier (75 j) au lieu du
		   contrôle (365 j) si le cas spécial du sommet est oublié. */
		const cinq = etatALHeure(PALIER_ACQUIS - 1);
		const now = dernierTestDe(cinq) + jours(400);
		const ancre = avancerEtat(cinq, true, now);
		expect(ancre.palier).toBe(PALIER_ACQUIS);
		expect(ancre.prochaineRevision).toBe(now + UN_AN);
		expect(ancre.prochaineRevision).not.toBe(now + INTERVALLE_SOMMET);
	});
});

/* ============================================================
   Critère 2 — un contrôle échu peut être servi, et la réponse fait évoluer l'état
   ============================================================ */
describe('critère 2 — un contrôle échu peut être servi, et la réponse fait évoluer l’état', () => {
	it('réussite au sommet : reste au sommet, avec une NOUVELLE échéance à 365 jours', () => {
		const acquis = etatAcquis();
		const now = rendezVous(acquis); // pile à l’échéance de contrôle
		const apres = avancerEtat(acquis, true, now);
		expect(apres.palier).toBe(PALIER_ACQUIS);
		expect(estAcquis(apres)).toBe(true);
		expect(apres.prochaineRevision).toBe(now + UN_AN);
		expect(apres.prochaineRevision).not.toBe(acquis.prochaineRevision); // une échéance NEUVE
		expect(apres.reussites).toBe(acquis.reussites + 1);
	});

	it.each([0, 235, 635])(
		'échec au sommet, %i jour(s) après l’échéance de contrôle : redescend d’un cran quand même',
		(joursApresEcheance) => {
			const acquis = etatAcquis();
			const now = rendezVous(acquis) + jours(joursApresEcheance);
			const apres = avancerEtat(acquis, false, now);
			expect(apres.palier).toBe(PALIER_ACQUIS - 1); // et surtout PAS resté au sommet
			expect(estAcquis(apres)).toBe(false);
			expect(apres.prochaineRevision).toBe(now + INTERVALLE_SOMMET);
			expect(apres.reussites).toBe(acquis.reussites); // un échec ne compte pas comme réussite
		},
	);

	it('la redescente puis la remontée : 75 jours après l’échec, 365 jours après la remontée', () => {
		const acquis = etatAcquis();
		const dateEchec = rendezVous(acquis) + jours(50); // servi tardivement, mais servi
		const redescendu = avancerEtat(acquis, false, dateEchec);
		expect(redescendu.palier).toBe(PALIER_ACQUIS - 1);
		expect(redescendu.prochaineRevision).toBe(dateEchec + INTERVALLE_SOMMET);

		const dateReussite = rendezVous(redescendu);
		const remonte = avancerEtat(redescendu, true, dateReussite);
		expect(remonte.palier).toBe(PALIER_ACQUIS);
		expect(estAcquis(remonte)).toBe(true);
		expect(remonte.prochaineRevision).toBe(dateReussite + UN_AN);
	});
});

/* ============================================================
   Critère 5 — le repli de lecture d'un acquis d'ancienne forme
   ============================================================ */
describe('critère 5 — le repli de lecture d’un acquis d’ancienne forme (`prochaineRevision: null`)', () => {
	it('`echeanceControle` recalcule dernierTest + 365 jours quand prochaineRevision est absent', () => {
		const e = etatAcquisAncienneForme(T0);
		expect(echeanceControle(e)).toBe(T0 + UN_AN);
	});

	it('`estDuControle` suit ce repli : dû seulement une fois les 365 jours écoulés', () => {
		const e = etatAcquisAncienneForme(T0);
		expect(estDuControle(e, T0 + UN_AN - 1)).toBe(false);
		expect(estDuControle(e, T0 + UN_AN)).toBe(true); // frontière : alignée sur `estDu` (<=)
		expect(estDuControle(e, T0 + UN_AN + jours(400))).toBe(true);
	});

	it('sans aucun `dernierTest`, aucune échéance à déduire : jamais dû (pas de « 1970 » implicite)', () => {
		const e = etatAcquisAncienneForme(null);
		expect(echeanceControle(e)).toBeNull();
		expect(estDuControle(e, T0 + jours(100_000))).toBe(false);
	});

	it('un `prochaineRevision` déjà posé l’emporte sur le recalcul depuis `dernierTest`', () => {
		/* Désaccord construit à la main entre `prochaineRevision` et `dernierTest + 365 jours»,
		   pour distinguer « lire prochaineRevision » de « toujours recalculer » : le contrat dit
		   prochaineRevision D'ABORD, le repli seulement s'il est absent. */
		const e: EtatRevision = {
			palier: PALIER_ACQUIS,
			prochaineRevision: T0 + jours(10),
			reussites: 6,
			dernierTest: T0,
		};
		expect(echeanceControle(e)).toBe(T0 + jours(10));
		expect(echeanceControle(e)).not.toBe(T0 + UN_AN);
	});

	it('`echeanceControle` et `estDuControle` ne modifient pas l’état reçu (lecture seule)', () => {
		const e = etatAcquisAncienneForme(T0);
		const copie: EtatRevision = { ...e };
		echeanceControle(e);
		estDuControle(e, T0 + jours(400));
		expect(e).toEqual(copie);
	});

	it('un élément `null` ou `undefined` ne fait pas planter la lecture', () => {
		expect(echeanceControle(null)).toBeNull();
		expect(echeanceControle(undefined)).toBeNull();
		expect(estDuControle(null, T0)).toBe(false);
		expect(estDuControle(undefined, T0)).toBe(false);
	});

	it('un élément NON acquis n’est jamais « dû en contrôle », quelle que soit son échéance', () => {
		for (const palier of [0, 1, 2, 3, 4, 5]) {
			const e = etatALHeure(palier);
			// Même largement en retard sur SA propre échéance d'escalier :
			const now = rendezVous(e) + jours(100_000);
			expect(estDuControle(e, now)).toBe(false);
		}
	});
});

/* ============================================================
   `estDu` ne change pas : réservé aux éléments non acquis (#478)
   ============================================================ */
describe('`estDu` reste réservé aux éléments non acquis (invariant « annoncé = proposé », #478)', () => {
	it('un acquis en forme neuve, même très en retard sur son échéance de contrôle, n’est jamais « dû » via `estDu`', () => {
		const acquis = etatAcquis();
		const now = rendezVous(acquis) + jours(500); // très en retard sur les 365 jours
		expect(estDu(acquis, now)).toBe(false);
		expect(estDuControle(acquis, now)).toBe(true); // et pourtant bien dû EN CONTRÔLE
	});

	it('un acquis d’ancienne forme (`prochaineRevision: null`) n’est jamais « dû » via `estDu`', () => {
		const e = etatAcquisAncienneForme(T0);
		expect(estDu(e, T0 + jours(100_000))).toBe(false);
	});
});

/* ============================================================
   Critère 7 — le prédicat qui nourrit `orthoMotsAncres` / `notionsAncrees`
   ============================================================ */
describe('critère 7 — un acquis redescendu cesse d’être compté par `estAcquis`', () => {
	it('séquence réelle : acquis (compté) → échec → redescendu (plus compté)', () => {
		const acquis = etatAcquis();
		expect(estAcquis(acquis)).toBe(true);
		const redescendu = avancerEtat(acquis, false, rendezVous(acquis) + jours(400));
		expect(redescendu.palier).toBe(PALIER_ACQUIS - 1);
		expect(estAcquis(redescendu)).toBe(false);
	});

	it('un contrôle réussi ne fait jamais cesser d’être compté', () => {
		const acquis = etatAcquis();
		const reconduit = avancerEtat(acquis, true, rendezVous(acquis));
		expect(estAcquis(reconduit)).toBe(true);
	});
});

/* ============================================================
   Critère 11 — aucune migration : ni au chargement, ni par avancerEtat
   ============================================================ */
describe('critère 11 — aucune migration : les états existants ne sont pas réécrits', () => {
	it('lire un acquis d’ancienne forme (échéance passée) ne réécrit rien en stockage', () => {
		const lecon = getAllLessons()[0];
		const cle = `${lecon.id}@${lecon.levels[0]}`;
		const legacy = etatAcquisAncienneForme(T0);
		lsSet(LESSON_REVISION_KEY, { [cle]: legacy });
		const avant = instantaneRevisions();
		expect(Object.keys(avant).length).toBeGreaterThan(0); // la graine est bien posée

		const now = T0 + jours(1000);
		const carte = loadLessonRevisions();
		echeanceControle(carte[cle]);
		estDuControle(carte[cle], now);
		notionsAncrees();

		expect(instantaneRevisions()).toEqual(avant);
	});

	it('`avancerEtat` ne mute pas l’état acquis qu’on lui passe (réussite comme échec)', () => {
		const acquis = etatAcquis();
		const copie: EtatRevision = { ...acquis };
		const now = rendezVous(acquis) + jours(400);
		avancerEtat(acquis, true, now);
		avancerEtat(acquis, false, now);
		expect(acquis).toEqual(copie);
	});
});
