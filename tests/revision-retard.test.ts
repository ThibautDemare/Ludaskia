/* ============================================================
   #688 — L'ESCALIER DE LA RÉVISION FACE À UN RENDEZ-VOUS SERVI TRÈS EN RETARD.

   D'OÙ VIENNENT LES ATTENDUS. Des critères d'acceptation de l'issue, écrits AVANT
   l'implémentation : au moment où ce fichier est posé, `avancerEtat` traite un test
   tardif exactement comme un test à l'heure. Les cas des critères 2 et 5 sont donc
   ROUGES, et c'est le résultat attendu. Les autres blocs (1, 3, 4, 6, 7, 10, 11) sont
   verts aujourd'hui : ils tiennent ce que le changement ne doit PAS casser, et c'est le
   seul moment où on peut les écrire sans les dériver du nouveau code.

   ── LECTURE RETENUE DU CRITÈRE 2 (point ambigu, tranché ici) ──────────────────
   Le critère dit que l'élément « monte au palier correspondant au délai réellement
   écoulé depuis son dernier test ». Quand ce délai tombe ENTRE deux intervalles de
   `REVISION_INTERVALLES` (p. ex. 10 jours, entre 7 et 16), le texte ne dit pas lequel
   des deux paliers correspond. Deux lectures possibles :
     (A) le plus haut palier dont l'intervalle a été TENU EN ENTIER (10 j → palier 2) ;
     (B) le plus petit palier dont l'intervalle COUVRE le délai (10 j → palier 3).
   On retient (A), pour trois raisons :
     • le délai écoulé est une PREUVE de rétention ; (B) crédite l'enfant de 16 jours de
       mémoire sur la foi de 10, c'est-à-dire extrapole au-delà de la mesure ;
     • (A) est cohérente avec le critère 3 : sous (B), un élément au palier 1 servi
       6 jours en retard — la variance ordinaire d'un calendrier de 3 séances par
       semaine, et exactement le seuil de déclenchement — sauterait DEUX crans et
       disparaîtrait 16 jours. Le critère 3 dit que cette variance « ne doit rien prouver
       sur la mémoire » ;
     • sous (A), le crédit ne peut jamais rendre l'ancre PLUS RAPIDE qu'un parcours sain
       (cf. le plancher, plus bas). Il récupère une information jetée, il ne fabrique pas
       de progression — ce qui préserve le sens du trophée #660 (« ce qui tient dans le
       temps »).
   Sur les données qui motivent l'issue, les deux lectures donnent le MÊME résultat : un
   palier 0 ou 1 en retard de 20,5 jours (le retard médian mesuré) monte au palier 3 dans
   les deux cas, parce que le plafond du critère 2 mord avant. Les lectures ne divergent
   que sur les délais écoulés de 4 à 15 jours — cosmétique pour le problème posé, décisif
   pour le plancher du critère 8 : (A) le laisse à 137 jours, (B) le ramène à 136.

   ── CONSÉQUENCES MESURABLES DE LA LECTURE (A) ─────────────────────────────────
   Sous (A), le crédit n'est OBSERVABLE qu'aux paliers 0 et 1 : au palier 2 et au-delà,
   le plafond « palier 3 » du critère 2 ne dépasse plus l'avancement normal (+1 cran).
   C'est cohérent avec le problème mesuré (148 des 233 éléments bloqués aux paliers 0
   et 1), mais ça a deux effets sur ce fichier :
     • les seuls cas ROUGES du crédit sont ceux des paliers 0 et 1 ;
     • le seuil « 2 fois l'intervalle » du critère 3 est, sous (A), mathématiquement
       REDONDANT : pour un retard < 2 × intervalle, le délai écoulé est < 3 × intervalle,
       donc le palier démontré ne dépasse jamais l'avancement normal. Le critère 3 est
       donc mécanisé par son contenu OBSERVABLE (« le résultat est exactement celui d'un
       passage à l'heure »), et non par un bord de seuil — lequel n'existe pas sous (A).
       Ce test-là attrape en revanche une implémentation qui suivrait la lecture (B).

   ── HORS DE PORTÉE D'UN TEST DE LOGIQUE PURE ──────────────────────────────────
   Critère 12 (« rien n'apparaît côté enfant ») : « retard » et « rattrapage » sont déjà
   des libellés LÉGITIMES de l'espace encadrant (`encadrant-stats.ts`, « en retard de
   2 jours »), et rien ne distingue statiquement une vue enfant d'une vue adulte.
   → spec Playwright.
   Critère 10 : la moitié « aucune migration au chargement » est éprouvée ici au niveau
   du store des leçons ; la moitié « aucune réécriture au montage d'un écran » relève de
   l'e2e.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	JOUR,
	PALIER_ACQUIS,
	REVISION_INTERVALLES,
	avancerEtat,
	estAcquis,
	estDu,
	estHorsRotation,
	etatHorsRotation,
	etatNeuf,
} from '../src/core/revision';
import { countDue, prochaineEcheance } from '../src/core/revision-select';
import { LESSON_REVISION_KEY, loadLessonRevisions, notionsAncrees } from '../src/core/progress';
import { getAllLessons } from '../src/core/catalog';
import { loadOrtho } from '../src/core/orthographe/store';
import { lsSet, setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import type { EtatRevision } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Le jour de la mesure de l'issue (8 septembre 2026), pour que les dates des cas
   racontent l'histoire du profil réel. Aucune dépendance à Date.now() : `revision.ts`
   reçoit toujours `now` en paramètre. */
const T0 = new Date(2026, 8, 8, 9, 0, 0, 0).getTime();
const jours = (n: number) => n * JOUR;

/* ---------- Les trois nombres que l'issue pose (critère 2) ----------
   Écrits en dur ici, avec leur origine : ce sont des EXIGENCES, pas des constantes du
   code (aucune n'existe dans `src/` au moment où ce fichier est posé). */
const FACTEUR_RETARD = 2; // « au moins 2 fois l'intervalle de son palier » (critères 2, 3, 5)
const PALIER_CREDIT_MAX = 3; // « sans dépasser le palier 3 » (critère 2)
const CRANS_CREDIT_MAX = 3; // « ni 3 crans d'un seul passage » (critère 2)

const intervalle = (palier: number) =>
	REVISION_INTERVALLES[Math.min(palier, REVISION_INTERVALLES.length - 1)];

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

/* ---------- Fixtures montées par le chemin RÉEL ----------
   Aucun palier n'est écrit à la main : un état au palier 3 est le RÉSULTAT de trois
   réussites servies le jour même du rendez-vous (retard nul, donc aucun crédit en jeu).
   Si l'escalier change, la fixture suit au lieu de mentir. */
function etatALHeure(palier: number): EtatRevision {
	let e = etatNeuf(T0);
	for (let i = 0; i < palier; i++) e = avancerEtat(e, true, rendezVous(e));
	return e;
}

/* L'élément du problème (le mot « parachutisme ») : palier 0 mais DÉJÀ testé, donc
   `dernierTest` non nul. Obtenu par le chemin réel — entrée en rotation, puis un échec
   servi à l'heure au premier rendez-vous. Si la garde de fixture du bloc « critère 2 »
   tombe, c'est le critère 6 ou 13 qui est cassé, pas le crédit. */
function etatPalier0Teste(): EtatRevision {
	const neuf = etatNeuf(T0);
	return avancerEtat(neuf, false, rendezVous(neuf));
}

/* Les six états « déjà mesurés » (dernierTest non nul), un par palier en rotation. */
const etatsTestes = (): EtatRevision[] => [
	etatPalier0Teste(),
	...[1, 2, 3, 4, 5].map((p) => etatALHeure(p)),
];

/* ---------- L'oracle, dérivé des critères (jamais du code) ----------
   Sert aux tests par échantillon, où écrire chaque attendu à la main serait illisible.
   Les cas d'en-tête de chaque bloc, eux, portent des valeurs CALCULÉES À LA MAIN : si
   l'oracle et les littéraux divergent, c'est l'oracle qui est faux. */

/* Le palier que le délai écoulé DÉMONTRE (lecture (A) du critère 2) : le plus haut
   palier dont l'intervalle a été tenu en entier. -1 si même le premier ne l'est pas. */
function palierDemontre(ecoule: number): number {
	let p = -1;
	for (let i = 0; i < REVISION_INTERVALLES.length; i++) {
		if (REVISION_INTERVALLES[i] <= ecoule) p = i;
	}
	return p;
}

const retardDe = (e: EtatRevision, now: number): number =>
	e.prochaineRevision == null ? 0 : now - e.prochaineRevision;

const retardSignificatif = (e: EtatRevision, now: number): boolean =>
	e.prochaineRevision != null && retardDe(e, now) >= FACTEUR_RETARD * intervalle(e.palier);

/* Palier attendu après une RÉUSSITE (critères 1, 2, 3, 4). L'avancement normal reste le
   plancher : le plafond du crédit ne doit jamais RABOTER ce qu'un passage donnait avant
   (un palier 3 réussi tardivement monte au palier 4, pas au plafond 3). */
function palierAttenduReussite(e: EtatRevision, now: number): number {
	const normal = Math.min(PALIER_ACQUIS, e.palier + 1);
	if (e.dernierTest == null) return normal; // critère 4
	if (!retardSignificatif(e, now)) return normal; // critère 3
	const credit = Math.min(
		PALIER_CREDIT_MAX,
		e.palier + CRANS_CREDIT_MAX,
		palierDemontre(now - e.dernierTest),
	);
	return Math.max(normal, credit);
}

/* Palier attendu après un ÉCHEC (critères 5, 6, 13). */
const palierAttenduEchec = (e: EtatRevision, now: number): number =>
	retardSignificatif(e, now) ? e.palier : Math.max(0, e.palier - 1);

/* L'état complet attendu, pour comparer d'un bloc — `reussites`, `dernierTest` et
   l'échéance sont autant de choses que le changement peut casser. */
function etatAttendu(e: EtatRevision, reussi: boolean, now: number): EtatRevision {
	const palier = reussi ? palierAttenduReussite(e, now) : palierAttenduEchec(e, now);
	return {
		palier,
		prochaineRevision: palier >= PALIER_ACQUIS ? null : now + intervalle(palier),
		reussites: e.reussites + (reussi ? 1 : 0),
		dernierTest: now,
	};
}

/* Retards « ordinaires » : sous le seuil du critère 3, donc sans aucun crédit. */
const retardsOrdinaires = (e: EtatRevision): number[] => [
	0, // pile à l'heure
	1, // une milliseconde de retard
	intervalle(e.palier), // 1 × l'intervalle : un rendez-vous doublé, ça arrive
	FACTEUR_RETARD * intervalle(e.palier) - 1, // juste sous le seuil
];

/* Retards « très tardifs » : au seuil, et bien au-delà. Le multiple 10 est le retard
   relatif MÉDIAN mesuré sur le profil réel (20,5 jours pour un palier à 1 ou 3 jours). */
const retardsTardifs = (e: EtatRevision): number[] => [
	FACTEUR_RETARD * intervalle(e.palier),
	FACTEUR_RETARD * intervalle(e.palier) + jours(1),
	10 * intervalle(e.palier),
	jours(300),
];

/* ============================================================
   Critères 1 et 11 — la file saine ne bouge pas d'un pouce
   ============================================================ */
describe('critères 1 et 11 — un rendez-vous servi à l’heure garde le comportement actuel', () => {
	it('critère 1 : chaque palier servi à l’heure monte d’un cran, et d’un seul', () => {
		for (const e of etatsTestes()) {
			const now = rendezVous(e);
			expect(avancerEtat(e, true, now)).toEqual(etatAttendu(e, true, now));
			// Et l'avancement vaut bien +1, jamais plus : aucune accélération.
			expect(avancerEtat(e, true, now).palier).toBe(e.palier + 1);
		}
	});

	it('critère 11 : la trajectoire complète, palier par palier ET date par date', () => {
		/* Dates calculées à la main depuis l'escalier annoncé par `revision.ts`
		   (J+1, J+3, ~1 sem, ~2 sem, ~1 mois, ~2-3 mois) : cumuls 1, 1+3=4, 4+7=11,
		   11+16=27, 27+35=62, 62+75=137. Une somme de `REVISION_INTERVALLES` recopierait
		   la donnée au lieu de la vérifier. */
		const attendus = [
			{ palier: 1, jour: 1 },
			{ palier: 2, jour: 4 },
			{ palier: 3, jour: 11 },
			{ palier: 4, jour: 27 },
			{ palier: 5, jour: 62 },
			{ palier: PALIER_ACQUIS, jour: 137 },
		];
		let e = etatNeuf(T0);
		const vus: Array<{ palier: number; jour: number }> = [];
		for (let i = 0; i < attendus.length; i++) {
			const now = rendezVous(e);
			e = avancerEtat(e, true, now);
			vus.push({ palier: e.palier, jour: Math.round((now - T0) / JOUR) });
		}
		expect(vus).toEqual(attendus);
		expect(e.prochaineRevision).toBeNull(); // acquis → sorti de la rotation
		expect(estAcquis(e)).toBe(true);
	});
});

/* ============================================================
   Critère 2 — la réussite très tardive vaut le délai réellement tenu
   ============================================================ */
describe('critère 2 — une réussite servie très en retard porte le crédit du délai écoulé', () => {
	it('le cas de l’issue : palier 0 non testé depuis 48 jours, réussi → revient dans 16 jours', () => {
		const e = etatPalier0Teste();
		expect(e.palier).toBe(0); // garde de fixture (cf. en-tête de `etatPalier0Teste`)
		expect(e.dernierTest).not.toBeNull();

		const now = dernierTestDe(e) + jours(48);
		const apres = avancerEtat(e, true, now);
		/* 48 jours tenus : le palier 4 (35 j) est démontré, le plafond du critère 2 ramène
		   à 3, dont l'échéance est de 16 jours — le « 16 au lieu de 3 » de l'issue. */
		expect(apres.palier).toBe(3);
		expect(apres.prochaineRevision).toBe(now + jours(16));
		expect(apres.prochaineRevision).not.toBe(now + jours(3)); // le défaut d'aujourd'hui
		expect(apres.dernierTest).toBe(now);
		expect(apres.reussites).toBe(e.reussites + 1);
	});

	it('un palier 0 tenu 10 jours monte au palier démontré (2), pas au palier suivant', () => {
		/* Cœur de l'arbitrage de l'en-tête : 10 jours tenus démontrent le palier 2 (7 j),
		   pas le palier 3 (16 j). Sous la lecture (B), ce test attendrait 3 et 16 jours. */
		const e = etatPalier0Teste();
		const now = dernierTestDe(e) + jours(10);
		const apres = avancerEtat(e, true, now);
		expect(apres.palier).toBe(2);
		expect(apres.prochaineRevision).toBe(now + jours(7));
	});

	it('un palier 1 tenu 20 jours monte au palier 3 (16 jours tenus)', () => {
		const e = etatALHeure(1);
		const now = dernierTestDe(e) + jours(20); // retard = 20 - 3 = 17 j ≥ 2 × 3 j
		const apres = avancerEtat(e, true, now);
		expect(apres.palier).toBe(3);
		expect(apres.prochaineRevision).toBe(now + jours(16));
	});

	it('le crédit plafonne au palier 3, même après 300 jours, et ne saute pas 4 crans', () => {
		const e = etatPalier0Teste();
		const now = dernierTestDe(e) + jours(300);
		const apres = avancerEtat(e, true, now);
		expect(apres.palier).toBe(PALIER_CREDIT_MAX);
		expect(apres.palier - e.palier).toBeLessThanOrEqual(CRANS_CREDIT_MAX);
		expect(estAcquis(apres)).toBe(false);
		expect(apres.prochaineRevision).toBe(now + jours(16));
	});

	it('le plafond du crédit ne rabote jamais l’avancement normal (paliers 3 à 5)', () => {
		/* Un palier 3 réussi après 200 jours doit monter au palier 4 comme avant : le
		   plafond borne le CRÉDIT, il ne rétrograde personne. */
		const trois = etatALHeure(3);
		const now3 = dernierTestDe(trois) + jours(200);
		expect(avancerEtat(trois, true, now3).palier).toBe(4);
		expect(avancerEtat(trois, true, now3).prochaineRevision).toBe(now3 + jours(35));

		const quatre = etatALHeure(4);
		expect(avancerEtat(quatre, true, dernierTestDe(quatre) + jours(200)).palier).toBe(5);

		const cinq = etatALHeure(5);
		const ancre = avancerEtat(cinq, true, dernierTestDe(cinq) + jours(400));
		expect(ancre.palier).toBe(PALIER_ACQUIS);
		expect(ancre.prochaineRevision).toBeNull();
	});

	it('sur tout l’échantillon des retards tardifs, l’état complet est celui attendu', () => {
		for (const e of etatsTestes()) {
			for (const retard of retardsTardifs(e)) {
				const now = rendezVous(e) + retard;
				expect(avancerEtat(e, true, now)).toEqual(etatAttendu(e, true, now));
			}
		}
	});
});

/* ============================================================
   Critère 3 — le retard ordinaire ne prouve rien
   ============================================================ */
describe('critère 3 — un retard inférieur à 2 fois l’intervalle ne donne aucun crédit', () => {
	it('le cas de l’issue : un palier 0 dû depuis 1 jour et réussi revient dans 3 jours', () => {
		const e = etatPalier0Teste();
		const now = rendezVous(e) + jours(1); // retard 1 j < 2 × 1 j
		const apres = avancerEtat(e, true, now);
		expect(apres.palier).toBe(1); // et surtout pas 2
		expect(apres.prochaineRevision).toBe(now + jours(3));
	});

	it('sur tout l’échantillon des retards ordinaires, le résultat est celui d’un passage à l’heure', () => {
		for (const e of etatsTestes()) {
			const alHeure = avancerEtat(e, true, rendezVous(e));
			for (const retard of retardsOrdinaires(e)) {
				const now = rendezVous(e) + retard;
				const apres = avancerEtat(e, true, now);
				expect(apres.palier).toBe(alHeure.palier);
				expect(apres.prochaineRevision).toBe(
					apres.palier >= PALIER_ACQUIS ? null : now + intervalle(apres.palier),
				);
			}
		}
	});
});

/* ============================================================
   Critère 4 — une première mesure n'est pas une mesure de rétention
   ============================================================ */
describe('critère 4 — aucun crédit sans mesure antérieure (`dernierTest` nul)', () => {
	it('le cas de l’issue : une leçon déclarée vue il y a 45 jours, réussie au 1er passage', () => {
		const e = etatNeuf(T0);
		expect(e.dernierTest).toBeNull();
		const now = T0 + jours(45); // retard = 44 jours, largement au-delà du seuil
		const apres = avancerEtat(e, true, now);
		expect(apres.palier).toBe(1); // un cran, pas plusieurs
		expect(apres.prochaineRevision).toBe(now + jours(3));
	});

	it('un élément hors rotation réussi tardivement n’a aucun retard à créditer', () => {
		const e = etatHorsRotation();
		expect(estHorsRotation(e)).toBe(true);
		const now = T0 + jours(45);
		const apres = avancerEtat(e, true, now);
		expect(apres.palier).toBe(1);
		expect(apres.prochaineRevision).toBe(now + jours(3));
	});
});

/* ============================================================
   Critères 5, 6 et 13 — le débit d'un échec dépend du retard, et de lui seul
   ============================================================ */
describe('critère 5 — un échec servi très en retard conserve son palier', () => {
	it('le cas de l’issue : un palier 2 dû depuis 30 jours et échoué reste au palier 2', () => {
		const e = etatALHeure(2);
		const now = rendezVous(e) + jours(30); // 30 j ≥ 2 × 7 j
		const apres = avancerEtat(e, false, now);
		expect(apres.palier).toBe(2); // et surtout pas 1
		expect(apres.prochaineRevision).toBe(now + jours(7)); // reposé à l'intervalle conservé
		expect(apres.reussites).toBe(e.reussites); // un échec ne compte pas comme réussite
		expect(apres.dernierTest).toBe(now);
	});

	it('sur tous les paliers, l’échec très tardif conserve le palier et repose l’échéance', () => {
		for (const e of etatsTestes()) {
			for (const retard of retardsTardifs(e)) {
				const now = rendezVous(e) + retard;
				const apres = avancerEtat(e, false, now);
				expect(apres.palier).toBe(e.palier);
				expect(apres.prochaineRevision).toBe(now + intervalle(e.palier));
				// Un échec ne fait jamais franchir le sommet, même conservé au palier 5.
				expect(estAcquis(apres)).toBe(false);
				expect(estDu(apres, now)).toBe(false); // l'échéance est bien reportée
			}
		}
	});

	it('le non-débit ne fabrique pas de palier négatif au palier 0', () => {
		const e = etatPalier0Teste();
		const now = rendezVous(e) + jours(48);
		const apres = avancerEtat(e, false, now);
		expect(apres.palier).toBe(0);
		expect(apres.prochaineRevision).toBe(now + jours(1));
	});
});

describe('critères 6 et 13 — l’échec à l’heure ou en retard modéré coûte toujours un cran', () => {
	it('critère 13 : deux échecs à l’heure d’affilée font reculer de deux crans', () => {
		let e = etatALHeure(3);
		const premier = rendezVous(e);
		e = avancerEtat(e, false, premier);
		expect(e.palier).toBe(2);
		const second = rendezVous(e);
		expect(second).toBe(premier + jours(7)); // reposé à l'intervalle du palier 2
		e = avancerEtat(e, false, second);
		expect(e.palier).toBe(1);
	});

	it('sur tout l’échantillon des retards ordinaires, l’échec débite d’un cran (jamais sous 0)', () => {
		for (const e of etatsTestes()) {
			for (const retard of retardsOrdinaires(e)) {
				const now = rendezVous(e) + retard;
				const apres = avancerEtat(e, false, now);
				expect(apres.palier).toBe(Math.max(0, e.palier - 1));
				expect(apres).toEqual(etatAttendu(e, false, now));
			}
		}
	});
});

/* ============================================================
   Critère 7 — le crédit ne peut pas ancrer à lui seul
   ============================================================ */
describe('critère 7 — après le crédit maximal, il reste au moins deux réussites à gagner', () => {
	it('aucune réussite tardive depuis un palier ≤ 3 ne laisse l’ancre à un seul cran', () => {
		/* « Il reste au moins deux réussites » ⇒ le palier atteint ne dépasse jamais
		   PALIER_ACQUIS - 2 : de là, il faut encore deux montées (5, puis 6). */
		for (const e of etatsTestes().filter((x) => x.palier <= PALIER_CREDIT_MAX)) {
			for (const retard of [...retardsOrdinaires(e), ...retardsTardifs(e), jours(1000)]) {
				const apres = avancerEtat(e, true, rendezVous(e) + retard);
				expect(apres.palier).toBeLessThanOrEqual(PALIER_ACQUIS - 2);
				expect(estAcquis(apres)).toBe(false);
				expect(apres.prochaineRevision).not.toBeNull();
			}
		}
	});

	it('après le crédit maximal, l’ancre demande encore 3 réussites et 126 jours', () => {
		const depart = etatPalier0Teste();
		const promu = avancerEtat(depart, true, dernierTestDe(depart) + jours(300));
		expect(promu.palier).toBe(PALIER_CREDIT_MAX);

		/* Puis des rendez-vous RÉELS, servis à l'heure : 16 + 35 + 75 = 126 jours. */
		let e = promu;
		let n = 0;
		while (!estAcquis(e)) {
			e = avancerEtat(e, true, rendezVous(e));
			n++;
		}
		expect(n).toBe(3);
		expect(Math.round((dernierTestDe(e) - dernierTestDe(promu)) / JOUR)).toBe(126);
	});
});

/* ============================================================
   Critères 8 et 9 — le plancher temporel de l'ancre, EXPLORÉ
   ============================================================ */

/* Le plancher, CHERCHÉ au lieu d'être annoncé (critère 9). On rejoue `avancerEtat` sur
   tous les chemins de réussites possibles depuis l'entrée en rotation, chaque rendez-vous
   pouvant être servi à l'heure ou avec n'importe quel retard d'un nombre entier de jours,
   et on garde le chemin qui atteint l'ancre le plus tôt.
   • Pourquoi seulement des réussites : un échec ne peut jamais faire MONTER un palier,
     propriété éprouvée juste en dessous — donc aucun chemin passant par un échec ne peut
     être plus court.
   • Pourquoi un pas d'un jour : tous les intervalles de l'escalier sont des multiples
     entiers de `JOUR`, donc toutes les bascules (seuil de retard, palier démontré)
     tombent sur des jours pleins ; servir un rendez-vous plus tard qu'une bascule ne peut
     que retarder l'ancre.
   • Le mémo est indispensable : sans lui, l'exploration est exponentielle. */
const LIMITE_EXPLORATION = 200; // jours ; au-delà, ce n'est plus un « plus court chemin »

interface CheminAncre {
	fin: number; // instant (ms) de la réussite qui ancre
	jours: number[]; // jour (depuis T0) de chaque passage du chemin
}

function plancherAncre(): CheminAncre {
	const memo = new Map<string, CheminAncre | null>();
	const limite = T0 + jours(LIMITE_EXPLORATION);
	const explore = (e: EtatRevision): CheminAncre | null => {
		const rdv = rendezVous(e);
		const cle = `${e.palier}:${e.dernierTest}:${rdv}`;
		const vu = memo.get(cle);
		if (vu !== undefined) return vu;
		let meilleur: CheminAncre | null = null;
		for (let k = 0; rdv + jours(k) <= limite; k++) {
			const now = rdv + jours(k);
			const suivant = avancerEtat(e, true, now);
			const jour = Math.round((now - T0) / JOUR);
			let candidat: CheminAncre | null = null;
			if (estAcquis(suivant)) {
				candidat = { fin: now, jours: [jour] };
			} else {
				const suite = explore(suivant);
				if (suite) candidat = { fin: suite.fin, jours: [jour, ...suite.jours] };
			}
			if (candidat && (meilleur == null || candidat.fin < meilleur.fin)) meilleur = candidat;
		}
		memo.set(cle, meilleur);
		return meilleur;
	};
	const trouve = explore(etatNeuf(T0));
	if (!trouve) throw new Error(`aucun chemin vers l’ancre en ${LIMITE_EXPLORATION} jours`);
	return trouve;
}

/* La valeur DÉRIVÉE, pas recopiée. Elle vaut 137 sous la lecture (A) du critère 2, et
   c'est un résultat, pas une coïncidence : l'escalier est SUR-ADDITIF (7 > 1+3,
   16 > 3+7, 35 > 7+16, 75 > 16+35), donc attendre assez longtemps pour se faire créditer
   un cran de plus coûte toujours plus de jours que de gagner ce cran en deux rendez-vous
   servis à l'heure. Le crédit ne peut donc pas raccourcir le plus court chemin : il
   rattrape une information perdue, il n'accélère pas l'ancrage.
   (Sous la lecture (B), le plancher tomberait à 136 jours, par un palier 1 volontairement
   servi 6 jours en retard, au jour 10.) */
const PLANCHER_JOURS = 137;

describe('critères 8 et 9 — le plancher temporel entre l’entrée en rotation et l’ancre', () => {
	it('critère 9 : aucun échec ne fait jamais monter un palier (socle de l’exploration)', () => {
		for (const e of etatsTestes()) {
			for (const retard of [...retardsOrdinaires(e), ...retardsTardifs(e)]) {
				const apres = avancerEtat(e, false, rendezVous(e) + retard);
				expect(apres.palier).toBeLessThanOrEqual(e.palier);
			}
		}
	});

	it('critère 9 : le plancher est cherché en rejouant l’escalier, retard compris', () => {
		const chemin = plancherAncre();
		expect(Math.round((chemin.fin - T0) / JOUR)).toBe(PLANCHER_JOURS);
	});

	it('critère 8 : le chemin le plus court est celui des rendez-vous servis à l’heure', () => {
		/* Se mettre en retard exprès ne doit jamais faire gagner un jour : sinon l'ancre
		   récompenserait l'abandon plutôt que la régularité. */
		expect(plancherAncre().jours).toEqual([1, 4, 11, 27, 62, 137]);
	});

	it('critère 8 : le code et la doc annoncent exactement ce plancher', () => {
		const fichiers = [
			'src/core/rewards.ts',
			'src/core/progress.ts',
			'docs/architecture/core.md',
			'docs/architecture/gamification.md',
			'docs/architecture/conventions-redaction.md',
		];
		const motif = /(\d+)\s+jours\s+(?:sans\s+échec|à\s+atteindre)/g;
		for (const f of fichiers) {
			const annonces = [...readFileSync(f, 'utf8').matchAll(motif)].map((m) => Number(m[1]));
			expect(annonces.length, `${f} n’annonce plus le plancher de l’ancre`).toBeGreaterThan(0);
			for (const n of annonces) expect(n, `plancher annoncé par ${f}`).toBe(PLANCHER_JOURS);
		}
	});
});

/* ============================================================
   Critère 10 — aucun état ne change sans passage réel
   ============================================================ */

/* Photographie brute des états de révision stockés : c'est ce que « les échéances n'ont
   pas changé » veut dire côté stockage. */
function instantaneRevisions(): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k && k.includes(LESSON_REVISION_KEY)) out[k] = localStorage.getItem(k);
	}
	return out;
}

describe('critère 10 — rien ne bouge sans une correction', () => {
	it('`avancerEtat` ne touche pas l’état qu’on lui passe (réussite comme échec)', () => {
		for (const e of etatsTestes()) {
			const copie: EtatRevision = { ...e };
			const now = rendezVous(e) + jours(48);
			avancerEtat(e, true, now);
			avancerEtat(e, false, now);
			expect(e).toEqual(copie);
		}
	});

	it('lire un profil en retard ne réécrit aucune échéance', () => {
		const lecon = getAllLessons()[0];
		const cle = `${lecon.id}@${lecon.levels[0]}`;
		/* Un état très en retard, comme les 205 éléments dus du profil mesuré. */
		const enRetard = etatALHeure(1);
		const now = rendezVous(enRetard) + jours(48);
		lsSet(LESSON_REVISION_KEY, { [cle]: enRetard });
		const avant = instantaneRevisions();
		expect(Object.keys(avant).length).toBeGreaterThan(0); // la graine est bien posée

		// Tous les chemins de LECTURE d'une séance qui n'a pas encore été jouée.
		const carte = loadLessonRevisions();
		const ortho = loadOrtho();
		countDue(ortho, carte, now);
		prochaineEcheance(ortho, carte, now);
		notionsAncrees();
		estDu(carte[cle], now);

		expect(instantaneRevisions()).toEqual(avant);
	});
});
