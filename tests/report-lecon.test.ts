/* ============================================================
   Avancement assoupli + REPORT d'une leçon (#485) — socle pur, persistance,
   et invariant « seul le mode leçon franchit ».
   ------------------------------------------------------------
   Règle métier éprouvée ici (attendus DÉRIVÉS de la règle, pas relus dans le code) :
   - une leçon est « franchie » (= fait avancer le fil de la leçon du jour) dès qu'elle
     est étoilée OU réussie à au moins 70 % sur un essai COMPLET en mode leçon ;
     l'étoile, elle, reste le sans-faute et ne bouge pas ;
   - le score de référence est le MEILLEUR score en mode leçon (monotone comme
     l'étoile) : un essai plus mauvais ensuite ne « défranchit » rien ;
   - une leçon travaillée sans être franchie est mise de côté quelques jours.
     L'escalade compte des JOURS CIVILS distincts de blocage, pas des tentatives ;
     le 1er jour ne reporte rien ; à partir du 2e, le délai suit l'escalier de la
     révision espacée (1 j → 3 j → 7 j, plafonné à 7 j) ; un dernier essai
     franchement bas (< 40 %) fait passer au cran suivant ;
   - le report ne verrouille rien : un essai relancé depuis le catalogue compte
     normalement (score, escalade, étoile) ;
   - effets de bord : une leçon mise de côté sort du vivier du défi de remédiation
     (`weakLessons`), et un mur qui revient (3 jours de blocage) devient une
     suggestion « à revoir » PRIORITAIRE dans l'espace encadrant.

   La SÉLECTION (fil, plafond par matière, alternance, repli) est éprouvée dans
   `lecon-du-jour-report.test.ts`.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	apresEssaiLecon,
	delaiReport,
	enReport,
	estFranchie,
	etatReportVierge,
	jourDe,
	JOURS_AVANT_REPORT,
	BLOCAGES_SIGNAL_ADULTE,
	SEUIL_FRANCHIE,
	type EtatReport,
} from '../src/core/report-lecon';
import { REVISION_INTERVALLES } from '../src/core/revision';
import { SEUIL_NON_ACQUIS } from '../src/core/maitrise';
import { MAX_REPORTEES_MATIERE, leconDuJour } from '../src/core/lecon-du-jour';
import {
	LESSON_REPORT_KEY,
	loadLessonReports,
	loadLessonStats,
	recordEssaiLecon,
	recordLessonStats,
} from '../src/core/progress';
import { recordLessonRun } from '../src/core/lesson-run';
import { weakLessons } from '../src/core/rewards';
import { progressionProfil } from '../src/core/encadrant-stats';
import {
	activeProfile,
	initProfiles,
	setNiveauMatiere,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import { lsSet, setOnDataWrite } from '../src/core/storage';
import { ordreLecons } from '../src/core/ordre';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	setNiveauReference('ce2');
});

/* Valeurs de la RÈGLE, écrites à la main (pas importées) : les tests de comportement
   ci-dessous n'utilisent que celles-ci. Le describe « prémisses » vérifie que les
   constantes du code disent bien la même chose — une dérive de spec échoue là, une
   seule fois, avec un message clair. */
const JOUR = 86_400_000;
const SEUIL = 70; // « réussie à au moins 70 % »
const SEUIL_BAS = 40; // « score franchement bas » → cran suivant
const M_CE2 = ordreLecons('math', 'ce2');
const F_CE2 = ordreLecons('francais', 'ce2');
const LECON = 'math-doubles'; // leçon de maths CE2 quelconque

/* Instant fixe, heure LOCALE (comme le jour civil de la règle) : mars 2026, hors
   bascule d'heure d'été (29 mars) pour que « +1 jour » reste 24 h pleines. */
const J = (jour: number, h = 9, min = 0) => new Date(2026, 2, jour, h, min).getTime();

describe('report — prémisses de la règle (#485)', () => {
	it('les constantes du code disent la même chose que la règle métier', () => {
		expect(SEUIL_FRANCHIE).toBe(SEUIL);
		expect(SEUIL_NON_ACQUIS).toBe(SEUIL_BAS);
		expect(JOURS_AVANT_REPORT).toBe(2); // le 1er jour de blocage ne reporte rien
		expect(REVISION_INTERVALLES.slice(0, 3)).toEqual([1 * JOUR, 3 * JOUR, 7 * JOUR]);
		expect(MAX_REPORTEES_MATIERE).toBe(2);
		expect(BLOCAGES_SIGNAL_ADULTE).toBe(3);
	});

	it('leçon jamais travaillée : ni franchie, ni mise de côté', () => {
		expect(estFranchie(undefined, false)).toBe(false);
		expect(enReport(undefined, J(10))).toBe(false);
		expect(estFranchie(etatReportVierge(), false)).toBe(false);
		expect(enReport(etatReportVierge(), J(10))).toBe(false);
	});
});

describe('franchissement (avancement assoupli)', () => {
	it('borne exacte du seuil : 69 % ne franchit pas, 70 % franchit', () => {
		expect(estFranchie(apresEssaiLecon(undefined, SEUIL - 1, J(10)), false)).toBe(false);
		expect(estFranchie(apresEssaiLecon(undefined, SEUIL, J(10)), false)).toBe(true);
	});

	it('l’étoile franchit quel que soit le score de l’essai (et n’est jamais reportée)', () => {
		const etat = apresEssaiLecon(undefined, 10, J(10), true);
		expect(estFranchie(etat, true)).toBe(true);
		expect(etat.reprendreLe).toBe(0);
		expect(enReport(etat, J(10))).toBe(false);
	});

	it('le meilleur score est monotone : un essai plus mauvais ne défranchit pas', () => {
		let etat = apresEssaiLecon(undefined, 80, J(10));
		etat = apresEssaiLecon(etat, 20, J(11));
		etat = apresEssaiLecon(etat, 0, J(12));
		expect(etat.meilleurPct).toBe(80);
		expect(estFranchie(etat, false)).toBe(true);
		// Une leçon franchie n'a plus rien à mettre de côté, même après 3 jours d'échecs.
		expect(etat.reprendreLe).toBe(0);
		expect(enReport(etat, J(12))).toBe(false);
	});

	it('un essai à 0 % ne franchit rien et compte comme un jour de blocage', () => {
		const etat = apresEssaiLecon(undefined, 0, J(10));
		expect(estFranchie(etat, false)).toBe(false);
		expect(etat.jours).toBe(1);
		expect(etat.meilleurPct).toBe(0);
	});

	it('franchir efface un report en cours', () => {
		let etat = apresEssaiLecon(undefined, 30, J(10)); // 1er jour : pas de report
		etat = apresEssaiLecon(etat, 30, J(11)); // 2e jour : mise de côté
		expect(enReport(etat, J(11, 12))).toBe(true);
		etat = apresEssaiLecon(etat, SEUIL, J(12)); // franchie depuis le catalogue
		expect(estFranchie(etat, false)).toBe(true);
		expect(etat.reporteLe).toBe(0);
		expect(etat.reprendreLe).toBe(0);
		expect(enReport(etat, J(12))).toBe(false);
	});
});

describe('escalade du report : des JOURS de blocage, pas des tentatives', () => {
	it('le 1er jour de blocage ne reporte rien, même à 0 %', () => {
		expect(delaiReport(1, 50)).toBe(0);
		expect(delaiReport(1, 0)).toBe(0);
		expect(delaiReport(0, 50)).toBe(0);
	});

	it('escalier des délais : 1 j → 3 j → 7 j, plafonné à 7 j', () => {
		expect(delaiReport(2, 50)).toBe(1 * JOUR);
		expect(delaiReport(3, 50)).toBe(3 * JOUR);
		expect(delaiReport(4, 50)).toBe(7 * JOUR);
		expect(delaiReport(5, 50)).toBe(7 * JOUR); // plafond
		expect(delaiReport(12, 50)).toBe(7 * JOUR);
	});

	it('un dernier essai franchement bas passe au cran suivant (borne 39 / 40 %)', () => {
		expect(delaiReport(2, SEUIL_BAS)).toBe(1 * JOUR); // 40 % n'est pas « franchement bas »
		expect(delaiReport(2, SEUIL_BAS - 1)).toBe(3 * JOUR);
		expect(delaiReport(3, SEUIL_BAS - 1)).toBe(7 * JOUR);
		expect(delaiReport(4, SEUIL_BAS - 1)).toBe(7 * JOUR); // plafond, même très bas
		expect(delaiReport(2, 0)).toBe(3 * JOUR);
	});

	it('retenter plusieurs fois le MÊME jour n’escalade pas', () => {
		let etat = apresEssaiLecon(undefined, 30, J(10, 9));
		etat = apresEssaiLecon(etat, 40, J(10, 10));
		etat = apresEssaiLecon(etat, 50, J(10, 18));
		expect(etat.jours).toBe(1); // 3 tentatives, 1 seul jour de blocage
		expect(etat.reprendreLe).toBe(0); // donc aucun report

		// Lendemain : le 2e jour déclenche le report… et retenter dans la séance ne
		// le rallonge pas (ni ne l'annule).
		etat = apresEssaiLecon(etat, 50, J(11, 9));
		expect(etat.jours).toBe(2);
		expect(etat.reporteLe).toBe(J(11, 9));
		expect(etat.reprendreLe).toBe(J(11, 9) + 1 * JOUR);
		const rejoue = apresEssaiLecon(etat, 60, J(11, 20));
		expect(rejoue.jours).toBe(2);
		expect(rejoue.reprendreLe).toBe(etat.reprendreLe);
		expect(rejoue.meilleurPct).toBe(60); // seul le meilleur score progresse
	});

	it('jours civils : 23 h 59 puis 00 h 01 = deux jours de blocage', () => {
		// 2 minutes d'écart, mais deux jours civils → escalade (et donc report).
		let etat = apresEssaiLecon(undefined, 50, J(10, 23, 59));
		expect(etat.jours).toBe(1);
		etat = apresEssaiLecon(etat, 50, J(11, 0, 1));
		expect(etat.jours).toBe(2);
		expect(etat.reprendreLe).toBe(J(11, 0, 1) + 1 * JOUR);
	});

	it('jours civils : 00 h 01 puis 23 h 59 du MÊME jour = un seul jour de blocage', () => {
		let etat = apresEssaiLecon(undefined, 50, J(10, 0, 1));
		etat = apresEssaiLecon(etat, 50, J(10, 23, 59));
		expect(etat.jours).toBe(1);
		expect(etat.reprendreLe).toBe(0);
		expect(jourDe(J(10, 0, 1))).toBe(jourDe(J(10, 23, 59)));
		expect(jourDe(J(10, 23, 59))).not.toBe(jourDe(J(11, 0, 1)));
	});

	it('escalade jour après jour, l’enfant relançant la leçon malgré le report', () => {
		// Le report ne verrouille rien : l'enfant peut relancer depuis le catalogue, et
		// chaque nouveau jour de blocage compte.
		const attendus = [0, 1, 3, 7, 7, 7]; // en jours, pour 1, 2, 3… jours de blocage
		let etat: EtatReport | undefined;
		for (let i = 0; i < attendus.length; i++) {
			const now = J(10 + i);
			etat = apresEssaiLecon(etat, 50, now);
			expect(etat.jours).toBe(i + 1);
			if (attendus[i] === 0) {
				expect(etat.reporteLe).toBe(0);
				expect(etat.reprendreLe).toBe(0);
			} else {
				expect(etat.reporteLe).toBe(now);
				expect(etat.reprendreLe - etat.reporteLe).toBe(attendus[i] * JOUR);
			}
		}
	});

	it('les jours de blocage ne s’oublient pas avec le temps', () => {
		// La règle compte les jours OÙ L'ENFANT A BUTÉ, sans péremption : revenir un mois
		// plus tard sur le même mur, c'est un 2e jour de blocage (donc un report), pas un
		// nouveau départ.
		let etat = apresEssaiLecon(undefined, 50, J(1));
		etat = apresEssaiLecon(etat, 50, J(31));
		expect(etat.jours).toBe(2);
		expect(etat.reprendreLe).toBe(J(31) + 1 * JOUR);
	});

	it('échéance : mise de côté jusqu’au bout du délai, reproposée dès qu’il est écoulé', () => {
		let etat = apresEssaiLecon(undefined, 50, J(10));
		etat = apresEssaiLecon(etat, 50, J(11));
		expect(enReport(etat, J(11))).toBe(true);
		expect(enReport(etat, etat.reprendreLe - 1)).toBe(true);
		expect(enReport(etat, etat.reprendreLe)).toBe(false); // délai écoulé → de retour
		expect(enReport(etat, etat.reprendreLe + 1)).toBe(false);
	});
});

describe('persistance (recordEssaiLecon) et namespacing par niveau', () => {
	it('mémorise le meilleur score et le report du niveau actif', () => {
		recordEssaiLecon(LECON, 50, J(10));
		expect(loadLessonReports()[LECON].meilleurPct).toBe(50);
		expect(loadLessonReports()[LECON].jours).toBe(1);
		const etat = recordEssaiLecon(LECON, 30, J(11));
		expect(etat).toEqual(loadLessonReports()[LECON]); // ce qui est renvoyé est ce qui est écrit
		expect(loadLessonReports()[LECON].meilleurPct).toBe(50); // monotone
		expect(enReport(loadLessonReports()[LECON], J(11))).toBe(true);
	});

	it('une leçon jouée en CE2 ne franchit pas la même leçon en CM1', () => {
		expect(M_CE2[0]).toBe('num-comparer'); // leçon présente aux DEUX niveaux
		expect(ordreLecons('math', 'cm1')[0]).toBe('num-comparer');
		recordEssaiLecon('num-comparer', 90, J(10)); // rangé @ce2 (niveau de jeu des maths)
		expect(loadLessonReports()['num-comparer'].meilleurPct).toBe(90);
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe(F_CE2[0]); // maths 1 ↔ français 0

		setNiveauMatiere('math', 'cm1');
		// Au CM1 la leçon est de nouveau à franchir : rien d'écrit à ce niveau.
		expect(loadLessonReports()['num-comparer']).toBeUndefined();
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe('num-comparer');
	});

	it('leçon CE2-only travaillée par un profil CM1 : rangée @ce2, sans effet sur le fil CM1', () => {
		setNiveauReference('cm1');
		recordEssaiLecon('math-tables-addition', 100, J(10)); // jouée hors filtre (favori/révision)
		expect(loadLessonReports()['math-tables-addition']).toBeUndefined();
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe(ordreLecons('math', 'cm1')[0]);
	});

	it('leçon inconnue du catalogue : enregistrée sans casser le fil', () => {
		expect(() => recordEssaiLecon('zzz-inconnue', 20, J(10))).not.toThrow();
		recordEssaiLecon('zzz-inconnue', 20, J(11)); // report d'une leçon fantôme
		expect(leconDuJour(undefined, undefined, J(11))?.id).toBe(M_CE2[0]);
	});

	it('état stocké incohérent (importé / édité à la main) : aucun franchissement fantôme, aucun report invalide', () => {
		// `lsSet` accepte du JSON quelconque : on simule un état venu d'un import.
		lsSet(LESSON_REPORT_KEY, {
			[`${LECON}@ce2`]: { jours: 'trois', dernierJour: 42, reporteLe: null, reprendreLe: 'demain' },
			[`${M_CE2[0]}@ce2`]: {},
		});
		// Rien ne casse, et une entrée sans score n'est PAS considérée comme franchie.
		expect(() => leconDuJour(undefined, undefined, J(10))).not.toThrow();
		const fil = leconDuJour(undefined, undefined, J(10));
		expect(fil).not.toBeNull();
		const etat = recordEssaiLecon(LECON, 30, J(10));
		expect(estFranchie(etat, false)).toBe(false);
		// Un report écrit par-dessus une entrée douteuse reste soit inexistant, soit daté.
		expect(etat.reprendreLe === 0 || etat.reprendreLe > etat.reporteLe).toBe(true);
		expect(Number.isNaN(etat.reprendreLe)).toBe(false);
	});
});

describe('INVARIANT : seul un essai en mode leçon peut franchir (#485)', () => {
	const perLesson = { [LECON]: { ok: 1, total: 1 } };

	it('un bilan (express / complet) n’écrit rien, même à 100 %', () => {
		for (const mode of ['express', 'complet']) {
			recordLessonRun({ mode, lessonId: null, ok: 1, questionCount: 1, ms: 500, perLesson });
		}
		// Le bilan a bien travaillé la leçon (stats), mais pas de quoi franchir : une seule
		// question posée ne vaut pas une série complète.
		expect(loadLessonStats()[LECON].attempts).toBe(2);
		expect(loadLessonReports()).toEqual({});
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe(M_CE2[0]); // fil intact
	});

	it('le sprint n’écrit rien (il ne passe pas par recordLessonRun)', () => {
		recordLessonStats({ [LECON]: { ok: 2, total: 2 } }, 'sprint');
		expect(loadLessonStats()[LECON].bestPct).toBe(100);
		expect(loadLessonReports()).toEqual({});
	});

	it('même répété, un 100 % de bilan ne fait pas avancer le fil', () => {
		for (let i = 0; i < 5; i++) {
			recordLessonRun({
				mode: 'express',
				lessonId: null,
				ok: 2,
				questionCount: 2,
				ms: 500,
				perLesson: { [M_CE2[0]]: { ok: 1, total: 1 }, [M_CE2[1]]: { ok: 1, total: 1 } },
			});
		}
		expect(loadLessonReports()).toEqual({});
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe(M_CE2[0]);
	});

	it('mode leçon : le score de l’essai est enregistré, lui', () => {
		recordLessonRun({
			mode: 'lecon',
			lessonId: LECON,
			ok: 7,
			questionCount: 10,
			ms: 0,
			perLesson: { [LECON]: { ok: 7, total: 10 } },
		});
		expect(loadLessonReports()[LECON].meilleurPct).toBe(70); // 7/10 → franchie
		expect(estFranchie(loadLessonReports()[LECON], false)).toBe(true);
	});

	it('mode leçon : 6/10 ne franchit pas et ouvre le compte des jours de blocage', () => {
		recordLessonRun({
			mode: 'lecon',
			lessonId: LECON,
			ok: 6,
			questionCount: 10,
			ms: 0,
			perLesson: { [LECON]: { ok: 6, total: 10 } },
		});
		const etat = loadLessonReports()[LECON];
		expect(etat.meilleurPct).toBe(60);
		expect(estFranchie(etat, false)).toBe(false);
		expect(etat.jours).toBe(1);
		expect(etat.reprendreLe).toBe(0); // 1er jour : pas de report
	});
});

describe('effets de bord du report', () => {
	it('weakLessons : une leçon mise de côté sort du vivier du défi, et y revient à échéance', () => {
		recordLessonStats({ [LECON]: { ok: 3, total: 10 } }); // 30 % → « à revoir »
		expect(weakLessons()).toContain(LECON);

		// Report EN COURS (2 jours de blocage, le second aujourd'hui) : plus proposée.
		const now = Date.now();
		recordEssaiLecon(LECON, 30, now - JOUR);
		recordEssaiLecon(LECON, 30, now);
		expect(enReport(loadLessonReports()[LECON], now)).toBe(true);
		expect(weakLessons()).not.toContain(LECON);

		// Report ÉCHU (les deux jours de blocage sont anciens) : de nouveau proposable.
		lsSet(LESSON_REPORT_KEY, {});
		recordEssaiLecon(LECON, 30, now - 5 * JOUR);
		recordEssaiLecon(LECON, 30, now - 4 * JOUR); // 30 % → report de 3 jours, échu hier
		expect(enReport(loadLessonReports()[LECON], now)).toBe(false);
		expect(weakLessons()).toContain(LECON);
	});

	it('weakLessons : une leçon franchie à 70 % reste proposable en remédiation si elle est faible', () => {
		// Le franchissement fait avancer le FIL, il ne déclare pas la notion maîtrisée :
		// la remédiation et la révision espacée continuent de s'en occuper.
		recordLessonStats({ [LECON]: { ok: 3, total: 10 } });
		recordEssaiLecon(LECON, 70, Date.now());
		expect(weakLessons()).toContain(LECON);
	});

	it('espace encadrant : 3 jours de blocage → suggéré « à revoir » malgré un % récent flatteur, et en tête', () => {
		const profil = activeProfile();
		const now = J(20);
		// Le % récent agrège sprint et bilans : ici la leçon paraît solide (100 %).
		recordLessonStats({ [LECON]: { ok: 1, total: 1 } }, 'sprint');
		recordLessonStats({ [LECON]: { ok: 1, total: 1 } }, 'bilan');
		// Une autre leçon franchement faible, sans mur : elle passerait devant au seul %.
		recordLessonStats({ 'math-moities': { ok: 4, total: 10 } });

		// 2 jours de blocage : pas encore un signal pour l'adulte.
		recordEssaiLecon(LECON, 30, J(10));
		recordEssaiLecon(LECON, 30, J(11));
		let aRevoir = progressionProfil(profil, now).aRevoir.map((n) => n.lessonId);
		expect(aRevoir).not.toContain(LECON);
		expect(aRevoir).toContain('math-moities');

		// 3e jour de blocage : le mur revient trop souvent → suggestion, et PRIORITAIRE.
		recordEssaiLecon(LECON, 30, J(12));
		const recap = progressionProfil(profil, now);
		aRevoir = recap.aRevoir.map((n) => n.lessonId);
		expect(aRevoir).toContain(LECON);
		expect(aRevoir[0]).toBe(LECON); // devant math-moities (40 %), qui reste listée
		expect(aRevoir).toContain('math-moities');
		const notion = recap.aRevoir.find((n) => n.lessonId === LECON)!;
		expect(notion.blocages).toBe(3);
		expect(notion.pctRecent).toBe(100); // le % seul l'aurait dite solide
		expect(notion.epingle).toBe(false); // suggestion, jamais un épinglage d'office
	});

	it('espace encadrant : une leçon jamais travaillée dans l’appli n’est pas suggérée', () => {
		// `reports` sans aucune stat (import partiel) : rien à suggérer à l'adulte.
		lsSet(LESSON_REPORT_KEY, {
			[`${LECON}@ce2`]: {
				jours: 5,
				dernierJour: '2026-03-12',
				reporteLe: J(12),
				reprendreLe: J(19),
				meilleurPct: 20,
			},
		});
		const recap = progressionProfil(activeProfile(), J(20));
		expect(recap.aRevoir.map((n) => n.lessonId)).not.toContain(LECON);
	});
});
