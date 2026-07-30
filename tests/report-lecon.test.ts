/* ============================================================
   Avancement assoupli + REPORT d'une leÃ§on (#485) â€” socle pur, persistance,
   et invariant Â« seul le mode leÃ§on franchit Â».
   ------------------------------------------------------------
   RÃ¨gle mÃ©tier Ã©prouvÃ©e ici (attendus DÃ‰RIVÃ‰S de la rÃ¨gle, pas relus dans le code) :
   - une leÃ§on est Â« franchie Â» (= fait avancer le fil de la leÃ§on du jour) dÃ¨s qu'elle
     est Ã©toilÃ©e OU rÃ©ussie Ã  au moins 70 % sur un essai COMPLET en mode leÃ§on ;
     l'Ã©toile, elle, reste le sans-faute et ne bouge pas ;
   - le score de rÃ©fÃ©rence est le MEILLEUR score en mode leÃ§on (monotone comme
     l'Ã©toile) : un essai plus mauvais ensuite ne Â« dÃ©franchit Â» rien ;
   - une leÃ§on travaillÃ©e sans Ãªtre franchie est mise de cÃ´tÃ© quelques jours.
     L'escalade compte des JOURS CIVILS distincts de blocage, pas des tentatives ;
     le 1er jour ne reporte rien ; Ã  partir du 2e, le dÃ©lai suit l'escalier de la
     rÃ©vision espacÃ©e (1 j â†’ 3 j â†’ 7 j, plafonnÃ© Ã  7 j) ; un dernier essai
     franchement bas (< 40 %) fait passer au cran suivant ;
   - le report ne verrouille rien : un essai relancÃ© depuis le catalogue compte
     normalement (score, escalade, Ã©toile) ;
   - effets de bord : une leÃ§on mise de cÃ´tÃ© sort du vivier du dÃ©fi de remÃ©diation
     (`weakLessons`), et un mur qui revient (3 jours de blocage) devient une
     suggestion Â« Ã  revoir Â» PRIORITAIRE dans l'espace encadrant.

   La SÃ‰LECTION (fil, plafond par matiÃ¨re, alternance, repli) est Ã©prouvÃ©e dans
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

/* Valeurs de la RÃˆGLE, Ã©crites Ã  la main (pas importÃ©es) : les tests de comportement
   ci-dessous n'utilisent que celles-ci. Le describe Â« prÃ©misses Â» vÃ©rifie que les
   constantes du code disent bien la mÃªme chose â€” une dÃ©rive de spec Ã©choue lÃ , une
   seule fois, avec un message clair. */
const JOUR = 86_400_000;
const SEUIL = 70; // Â« rÃ©ussie Ã  au moins 70 % Â»
const SEUIL_BAS = 40; // Â« score franchement bas Â» â†’ cran suivant
const M_CE2 = ordreLecons('math', 'ce2');
const F_CE2 = ordreLecons('francais', 'ce2');
const LECON = 'math-doubles'; // leÃ§on de maths CE2 quelconque

/* Instant fixe, heure LOCALE (comme le jour civil de la rÃ¨gle) : mars 2026, hors
   bascule d'heure d'Ã©tÃ© (29 mars) pour que Â« +1 jour Â» reste 24 h pleines. */
const J = (jour: number, h = 9, min = 0) => new Date(2026, 2, jour, h, min).getTime();

describe('report â€” prÃ©misses de la rÃ¨gle (#485)', () => {
	it('les constantes du code disent la mÃªme chose que la rÃ¨gle mÃ©tier', () => {
		expect(SEUIL_FRANCHIE).toBe(SEUIL);
		expect(SEUIL_NON_ACQUIS).toBe(SEUIL_BAS);
		expect(JOURS_AVANT_REPORT).toBe(2); // le 1er jour de blocage ne reporte rien
		expect(REVISION_INTERVALLES.slice(0, 3)).toEqual([1 * JOUR, 3 * JOUR, 7 * JOUR]);
		expect(MAX_REPORTEES_MATIERE).toBe(2);
		expect(BLOCAGES_SIGNAL_ADULTE).toBe(3);
	});

	it('leÃ§on jamais travaillÃ©e : ni franchie, ni mise de cÃ´tÃ©', () => {
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

	it('lâ€™Ã©toile franchit quel que soit le score de lâ€™essai (et nâ€™est jamais reportÃ©e)', () => {
		const etat = apresEssaiLecon(undefined, 10, J(10), true);
		expect(estFranchie(etat, true)).toBe(true);
		expect(etat.reprendreLe).toBe(0);
		expect(enReport(etat, J(10))).toBe(false);
	});

	it('le meilleur score est monotone : un essai plus mauvais ne dÃ©franchit pas', () => {
		let etat = apresEssaiLecon(undefined, 80, J(10));
		etat = apresEssaiLecon(etat, 20, J(11));
		etat = apresEssaiLecon(etat, 0, J(12));
		expect(etat.meilleurPct).toBe(80);
		expect(estFranchie(etat, false)).toBe(true);
		// Une leÃ§on franchie n'a plus rien Ã  mettre de cÃ´tÃ©, mÃªme aprÃ¨s 3 jours d'Ã©checs.
		expect(etat.reprendreLe).toBe(0);
		expect(enReport(etat, J(12))).toBe(false);
	});

	it('un essai Ã  0 % ne franchit rien et compte comme un jour de blocage', () => {
		const etat = apresEssaiLecon(undefined, 0, J(10));
		expect(estFranchie(etat, false)).toBe(false);
		expect(etat.jours).toBe(1);
		expect(etat.meilleurPct).toBe(0);
	});

	it('franchir efface un report en cours', () => {
		let etat = apresEssaiLecon(undefined, 30, J(10)); // 1er jour : pas de report
		etat = apresEssaiLecon(etat, 30, J(11)); // 2e jour : mise de cÃ´tÃ©
		expect(enReport(etat, J(11, 12))).toBe(true);
		etat = apresEssaiLecon(etat, SEUIL, J(12)); // franchie depuis le catalogue
		expect(estFranchie(etat, false)).toBe(true);
		expect(etat.reporteLe).toBe(0);
		expect(etat.reprendreLe).toBe(0);
		expect(enReport(etat, J(12))).toBe(false);
	});
});

describe('escalade du report : des JOURS de blocage, pas des tentatives', () => {
	it('le 1er jour de blocage ne reporte rien, mÃªme Ã  0 %', () => {
		expect(delaiReport(1, 50)).toBe(0);
		expect(delaiReport(1, 0)).toBe(0);
		expect(delaiReport(0, 50)).toBe(0);
	});

	it('escalier des dÃ©lais : 1 j â†’ 3 j â†’ 7 j, plafonnÃ© Ã  7 j', () => {
		expect(delaiReport(2, 50)).toBe(1 * JOUR);
		expect(delaiReport(3, 50)).toBe(3 * JOUR);
		expect(delaiReport(4, 50)).toBe(7 * JOUR);
		expect(delaiReport(5, 50)).toBe(7 * JOUR); // plafond
		expect(delaiReport(12, 50)).toBe(7 * JOUR);
	});

	it('un dernier essai franchement bas passe au cran suivant (borne 39 / 40 %)', () => {
		expect(delaiReport(2, SEUIL_BAS)).toBe(1 * JOUR); // 40 % n'est pas Â« franchement bas Â»
		expect(delaiReport(2, SEUIL_BAS - 1)).toBe(3 * JOUR);
		expect(delaiReport(3, SEUIL_BAS - 1)).toBe(7 * JOUR);
		expect(delaiReport(4, SEUIL_BAS - 1)).toBe(7 * JOUR); // plafond, mÃªme trÃ¨s bas
		expect(delaiReport(2, 0)).toBe(3 * JOUR);
	});

	it('retenter plusieurs fois le MÃŠME jour nâ€™escalade pas', () => {
		let etat = apresEssaiLecon(undefined, 30, J(10, 9));
		etat = apresEssaiLecon(etat, 40, J(10, 10));
		etat = apresEssaiLecon(etat, 50, J(10, 18));
		expect(etat.jours).toBe(1); // 3 tentatives, 1 seul jour de blocage
		expect(etat.reprendreLe).toBe(0); // donc aucun report

		// Lendemain : le 2e jour dÃ©clenche le reportâ€¦ et retenter dans la sÃ©ance ne
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
		// 2 minutes d'Ã©cart, mais deux jours civils â†’ escalade (et donc report).
		let etat = apresEssaiLecon(undefined, 50, J(10, 23, 59));
		expect(etat.jours).toBe(1);
		etat = apresEssaiLecon(etat, 50, J(11, 0, 1));
		expect(etat.jours).toBe(2);
		expect(etat.reprendreLe).toBe(J(11, 0, 1) + 1 * JOUR);
	});

	it('jours civils : 00 h 01 puis 23 h 59 du MÃŠME jour = un seul jour de blocage', () => {
		let etat = apresEssaiLecon(undefined, 50, J(10, 0, 1));
		etat = apresEssaiLecon(etat, 50, J(10, 23, 59));
		expect(etat.jours).toBe(1);
		expect(etat.reprendreLe).toBe(0);
		expect(jourDe(J(10, 0, 1))).toBe(jourDe(J(10, 23, 59)));
		expect(jourDe(J(10, 23, 59))).not.toBe(jourDe(J(11, 0, 1)));
	});

	it('escalade jour aprÃ¨s jour, lâ€™enfant relanÃ§ant la leÃ§on malgrÃ© le report', () => {
		// Le report ne verrouille rien : l'enfant peut relancer depuis le catalogue, et
		// chaque nouveau jour de blocage compte.
		const attendus = [0, 1, 3, 7, 7, 7]; // en jours, pour 1, 2, 3â€¦ jours de blocage
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

	it('les jours de blocage ne sâ€™oublient pas avec le temps', () => {
		// La rÃ¨gle compte les jours OÃ™ L'ENFANT A BUTÃ‰, sans pÃ©remption : revenir un mois
		// plus tard sur le mÃªme mur, c'est un 2e jour de blocage (donc un report), pas un
		// nouveau dÃ©part.
		let etat = apresEssaiLecon(undefined, 50, J(1));
		etat = apresEssaiLecon(etat, 50, J(31));
		expect(etat.jours).toBe(2);
		expect(etat.reprendreLe).toBe(J(31) + 1 * JOUR);
	});

	it('Ã©chÃ©ance : mise de cÃ´tÃ© jusquâ€™au bout du dÃ©lai, reproposÃ©e dÃ¨s quâ€™il est Ã©coulÃ©', () => {
		let etat = apresEssaiLecon(undefined, 50, J(10));
		etat = apresEssaiLecon(etat, 50, J(11));
		expect(enReport(etat, J(11))).toBe(true);
		expect(enReport(etat, etat.reprendreLe - 1)).toBe(true);
		expect(enReport(etat, etat.reprendreLe)).toBe(false); // dÃ©lai Ã©coulÃ© â†’ de retour
		expect(enReport(etat, etat.reprendreLe + 1)).toBe(false);
	});
});

describe('persistance (recordEssaiLecon) et namespacing par niveau', () => {
	it('mÃ©morise le meilleur score et le report du niveau actif', () => {
		recordEssaiLecon(LECON, 50, J(10));
		expect(loadLessonReports()[LECON].meilleurPct).toBe(50);
		expect(loadLessonReports()[LECON].jours).toBe(1);
		const etat = recordEssaiLecon(LECON, 30, J(11));
		expect(etat).toEqual(loadLessonReports()[LECON]); // ce qui est renvoyÃ© est ce qui est Ã©crit
		expect(loadLessonReports()[LECON].meilleurPct).toBe(50); // monotone
		expect(enReport(loadLessonReports()[LECON], J(11))).toBe(true);
	});

	it('une leÃ§on jouÃ©e en CE2 ne franchit pas la mÃªme leÃ§on en CM1', () => {
		expect(M_CE2[0]).toBe('num-comparer'); // leÃ§on prÃ©sente aux DEUX niveaux
		expect(ordreLecons('math', 'cm1')[0]).toBe('num-comparer');
		recordEssaiLecon('num-comparer', 90, J(10)); // rangÃ© @ce2 (niveau de jeu des maths)
		expect(loadLessonReports()['num-comparer'].meilleurPct).toBe(90);
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe(F_CE2[0]); // maths 1 â†” franÃ§ais 0

		setNiveauMatiere('math', 'cm1');
		// Au CM1 la leÃ§on est de nouveau Ã  franchir : rien d'Ã©crit Ã  ce niveau.
		expect(loadLessonReports()['num-comparer']).toBeUndefined();
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe('num-comparer');
	});

	it('leÃ§on CE2-only travaillÃ©e par un profil CM1 : rangÃ©e @ce2, sans effet sur le fil CM1', () => {
		setNiveauReference('cm1');
		recordEssaiLecon('math-tables-addition', 100, J(10)); // jouÃ©e hors filtre (favori/rÃ©vision)
		expect(loadLessonReports()['math-tables-addition']).toBeUndefined();
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe(ordreLecons('math', 'cm1')[0]);
	});

	it('leÃ§on inconnue du catalogue : enregistrÃ©e sans casser le fil', () => {
		expect(() => recordEssaiLecon('zzz-inconnue', 20, J(10))).not.toThrow();
		recordEssaiLecon('zzz-inconnue', 20, J(11)); // report d'une leÃ§on fantÃ´me
		expect(leconDuJour(undefined, undefined, J(11))?.id).toBe(M_CE2[0]);
	});

	it('Ã©tat stockÃ© incohÃ©rent (importÃ© / Ã©ditÃ© Ã  la main) : aucun franchissement fantÃ´me, aucun report invalide', () => {
		// `lsSet` accepte du JSON quelconque : on simule un Ã©tat venu d'un import.
		lsSet(LESSON_REPORT_KEY, {
			[`${LECON}@ce2`]: { jours: 'trois', dernierJour: 42, reporteLe: null, reprendreLe: 'demain' },
			[`${M_CE2[0]}@ce2`]: {},
		});
		// Rien ne casse, et une entrÃ©e sans score n'est PAS considÃ©rÃ©e comme franchie.
		expect(() => leconDuJour(undefined, undefined, J(10))).not.toThrow();
		const fil = leconDuJour(undefined, undefined, J(10));
		expect(fil).not.toBeNull();
		const etat = recordEssaiLecon(LECON, 30, J(10));
		expect(estFranchie(etat, false)).toBe(false);
		// Un report Ã©crit par-dessus une entrÃ©e douteuse reste soit inexistant, soit datÃ©.
		expect(etat.reprendreLe === 0 || etat.reprendreLe > etat.reporteLe).toBe(true);
		expect(Number.isNaN(etat.reprendreLe)).toBe(false);
	});
});

describe('INVARIANT : seul un essai en mode leÃ§on peut franchir (#485)', () => {
	const perLesson = { [LECON]: { ok: 1, total: 1 } };

	it('un bilan (express / complet) nâ€™Ã©crit rien, mÃªme Ã  100 %', () => {
		for (const mode of ['express', 'complet']) {
			recordLessonRun({ mode, lessonId: null, ok: 1, questionCount: 1, ms: 500, perLesson });
		}
		// Le bilan a bien travaillÃ© la leÃ§on (stats), mais pas de quoi franchir : une seule
		// question posÃ©e ne vaut pas une sÃ©rie complÃ¨te.
		expect(loadLessonStats()[LECON].attempts).toBe(2);
		expect(loadLessonReports()).toEqual({});
		expect(leconDuJour(undefined, undefined, J(10))?.id).toBe(M_CE2[0]); // fil intact
	});

	it('le sprint nâ€™Ã©crit rien (il ne passe pas par recordLessonRun)', () => {
		recordLessonStats({ [LECON]: { ok: 2, total: 2 } }, 'sprint');
		expect(loadLessonStats()[LECON].bestPct).toBe(100);
		expect(loadLessonReports()).toEqual({});
	});

	it('mÃªme rÃ©pÃ©tÃ©, un 100 % de bilan ne fait pas avancer le fil', () => {
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

	it('mode leÃ§on : le score de lâ€™essai est enregistrÃ©, lui', () => {
		recordLessonRun({
			mode: 'lecon',
			lessonId: LECON,
			ok: 7,
			questionCount: 10,
			ms: 0,
			perLesson: { [LECON]: { ok: 7, total: 10 } },
		});
		expect(loadLessonReports()[LECON].meilleurPct).toBe(70); // 7/10 â†’ franchie
		expect(estFranchie(loadLessonReports()[LECON], false)).toBe(true);
	});

	it('mode leÃ§on : 6/10 ne franchit pas et ouvre le compte des jours de blocage', () => {
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
	it('weakLessons : une leÃ§on mise de cÃ´tÃ© sort du vivier du dÃ©fi, et y revient Ã  Ã©chÃ©ance', () => {
		recordLessonStats({ [LECON]: { ok: 3, total: 10 } }); // 30 % â†’ Â« Ã  revoir Â»
		expect(weakLessons()).toContain(LECON);

		// Report EN COURS (2 jours de blocage, le second aujourd'hui) : plus proposÃ©e.
		const now = Date.now();
		recordEssaiLecon(LECON, 30, now - JOUR);
		recordEssaiLecon(LECON, 30, now);
		expect(enReport(loadLessonReports()[LECON], now)).toBe(true);
		expect(weakLessons()).not.toContain(LECON);

		// Report Ã‰CHU (les deux jours de blocage sont anciens) : de nouveau proposable.
		lsSet(LESSON_REPORT_KEY, {});
		recordEssaiLecon(LECON, 30, now - 5 * JOUR);
		recordEssaiLecon(LECON, 30, now - 4 * JOUR); // 30 % â†’ report de 3 jours, Ã©chu hier
		expect(enReport(loadLessonReports()[LECON], now)).toBe(false);
		expect(weakLessons()).toContain(LECON);
	});

	it('weakLessons : une leÃ§on franchie Ã  70 % reste proposable en remÃ©diation si elle est faible', () => {
		// Le franchissement fait avancer le FIL, il ne dÃ©clare pas la notion maÃ®trisÃ©e :
		// la remÃ©diation et la rÃ©vision espacÃ©e continuent de s'en occuper.
		recordLessonStats({ [LECON]: { ok: 3, total: 10 } });
		recordEssaiLecon(LECON, 70, Date.now());
		expect(weakLessons()).toContain(LECON);
	});

	it('espace encadrant : 3 jours de blocage â†’ suggÃ©rÃ© Â« Ã  revoir Â» malgrÃ© un % rÃ©cent flatteur, et en tÃªte', () => {
		const profil = activeProfile();
		const now = J(20);
		// Le % rÃ©cent agrÃ¨ge sprint et bilans : ici la leÃ§on paraÃ®t solide (100 %).
		recordLessonStats({ [LECON]: { ok: 1, total: 1 } }, 'sprint');
		recordLessonStats({ [LECON]: { ok: 1, total: 1 } }, 'bilan');
		// Une autre leÃ§on franchement faible, sans mur : elle passerait devant au seul %.
		recordLessonStats({ 'math-moities': { ok: 4, total: 10 } });

		// 2 jours de blocage : pas encore un signal pour l'adulte.
		recordEssaiLecon(LECON, 30, J(10));
		recordEssaiLecon(LECON, 30, J(11));
		let aRevoir = progressionProfil(profil, now).aRevoir.map((n) => n.lessonId);
		expect(aRevoir).not.toContain(LECON);
		expect(aRevoir).toContain('math-moities');

		// 3e jour de blocage : le mur revient trop souvent â†’ suggestion, et PRIORITAIRE.
		recordEssaiLecon(LECON, 30, J(12));
		const recap = progressionProfil(profil, now);
		aRevoir = recap.aRevoir.map((n) => n.lessonId);
		expect(aRevoir).toContain(LECON);
		expect(aRevoir[0]).toBe(LECON); // devant math-moities (40 %), qui reste listÃ©e
		expect(aRevoir).toContain('math-moities');
		const notion = recap.aRevoir.find((n) => n.lessonId === LECON)!;
		expect(notion.blocages).toBe(3);
		expect(notion.pctRecent).toBe(100); // le % seul l'aurait dite solide
		expect(notion.epingle).toBe(false); // suggestion, jamais un Ã©pinglage d'office
	});

	it('espace encadrant : une leÃ§on jamais travaillÃ©e dans lâ€™appli nâ€™est pas suggÃ©rÃ©e', () => {
		// `reports` sans aucune stat (import partiel) : rien Ã  suggÃ©rer Ã  l'adulte.
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
