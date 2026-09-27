/* ============================================================
   Consolidation de la classe précédente (#723).
   Pour une matière suivie à une classe qui a une classe EN DESSOUS au catalogue :
   les leçons propres à cette classe précédente que l'enfant y a travaillées et
   qui ne sont pas franchies. Attendus dérivés des critères de l'issue (numérotés
   dans les noms), jamais de l'implémentation.

   Fixtures : vrai catalogue, ids réels (prémisses vérifiées en tête de fichier,
   pour qu'un changement de catalogue fasse échouer la PRÉMISSE et pas un critère).
   Cartes brutes fabriquées à la main, clés `lessonId@niveau`.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	consolidationBasNiveau,
	type CartesBrutes,
	type ConsolidationBasNiveau,
} from '../src/core/consolidation-bas-niveau';
import { getLessonById, getLessonsBySubject } from '../src/core/catalog';
import { LEVEL_ORDER, labelLecon } from '../src/core/levels';
import type { LessonStat } from '../src/core/maitrise';
import type { EtatReport } from '../src/core/report-lecon';
import { progressionProfil, toggleRevoirFor } from '../src/core/encadrant-stats';
import {
	initProfiles,
	activeProfile,
	loadProfilesMeta,
	setNiveauReferenceFor,
	setNiveauMatiereFor,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { lsSet, setOnDataWrite } from '../src/core/storage';
import { LESSON_REPORT_KEY, LESSON_STATS_KEY, STARS_KEY } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Fabriques ---------- */
const T = 1_699_000_000_000;
const NOW = 1_700_000_000_000;

/** Stat d'une leçon : `essais` = fenêtre récente, un couple [bonnes, questions] par essai.
    `bestPct` (meilleur % TOUS modes) est réglable à part : il ne doit pas franchir. */
function stat(essais: Array<[number, number]>, bestPct?: number): LessonStat {
	const pcts = essais.map(([ok, total]) => Math.round((100 * ok) / total));
	return {
		attempts: essais.length,
		correct: essais.reduce((s, [ok]) => s + ok, 0),
		questions: essais.reduce((s, [, total]) => s + total, 0),
		bestPct: bestPct ?? Math.max(...pcts),
		lastPct: pcts[pcts.length - 1],
		recents: essais.map(([ok, total]) => ({ ok, total })),
		lastAt: T,
	};
}
/** Stat « jamais travaillée » : une entrée existe, mais aucune question posée. */
const STAT_VIDE: LessonStat = { attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 };

/** État de report : `meilleurPct` = meilleur score sur un essai COMPLET en mode leçon. */
function report(meilleurPct: number): EtatReport {
	return { jours: 1, dernierJour: '2023-11-14', reporteLe: 0, reprendreLe: 0, meilleurPct };
}
function cartes(c: Partial<CartesBrutes>): CartesBrutes {
	return { stars: {}, stats: {}, reports: {}, ...c };
}
const idsFragiles = (r: ConsolidationBasNiveau | undefined) => r?.fragiles.map((f) => f.lesson.id);

const ADD = 'calc-addition-posee'; // CE2 seul, rang pédagogique CE2 le plus tôt des trois
const HEURE = 'mes-lecture-heure'; // CE2 seul, juste après ADD
const TABLES = 'math-tables-multiplication'; // CE2 seul, après HEURE
const COMPARER = 'num-comparer'; // CE2 + CM1
const HOMOPHONES = 'fr-homophones-a'; // CE2 seul, français
const MULTIPLES_50 = 'math-multiples-50'; // CM1 seul

/* ---------- Prémisses du catalogue ---------- */
describe('prémisses du catalogue (fixtures)', () => {
	it('les leçons choisies ont bien les classes supposées', () => {
		expect(getLessonById(ADD)?.levels).toEqual(['ce2']);
		expect(getLessonById(HEURE)?.levels).toEqual(['ce2']);
		expect(getLessonById(TABLES)?.levels).toEqual(['ce2']);
		expect(getLessonById(HOMOPHONES)?.levels).toEqual(['ce2']);
		expect(getLessonById(HOMOPHONES)?.subject).toBe('francais');
		expect(getLessonById(COMPARER)?.levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
		expect(getLessonById(MULTIPLES_50)?.levels).toEqual(['cm1']);
	});
	it('ordre pédagogique CE2 : addition posée < lecture de l’heure < tables', () => {
		const ordre = getLessonsBySubject('math', 'ce2').map((l) => l.id);
		expect(ordre.indexOf(ADD)).toBeGreaterThanOrEqual(0);
		expect(ordre.indexOf(ADD)).toBeLessThan(ordre.indexOf(HEURE));
		expect(ordre.indexOf(HEURE)).toBeLessThan(ordre.indexOf(TABLES));
		// L'ordre pédagogique HEURE < TABLES est l'INVERSE de l'ordre alphabétique : un
		// départage par id ne peut donc pas passer pour le bon.
		expect(TABLES < HEURE).toBe(true);
	});
	it('la classe la plus basse du catalogue en maths et en français est le CE2', () => {
		const plusBas = (s: string) => LEVEL_ORDER.find((lv) => getLessonsBySubject(s, lv).length);
		expect(plusBas('math')).toBe('ce2');
		expect(plusBas('francais')).toBe('ce2');
	});
});

/* ---------- consolidationBasNiveau (pur) ---------- */
describe('consolidationBasNiveau : ce qui est listé', () => {
	it('critère 1 : leçon CE2 seule, travaillée, non franchie → listée chez un CM1, avec état et perf', () => {
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({ stats: { [`${ADD}@ce2`]: stat([[2, 10]]) } }),
		);
		expect(r?.niveau).toBe('ce2');
		expect(r?.nbTravaillees).toBe(1);
		expect(r?.fragiles).toHaveLength(1);
		const f = r!.fragiles[0];
		expect(f.lesson.id).toBe(ADD);
		expect(f.niveau).toBe('ce2');
		expect(f.etat).toBe('non-acquis'); // 20 % sur 10 questions
		expect(f.pctRecent).toBe(20);
	});

	it('critère 1 : chaque matière ne lit que ses propres leçons', () => {
		const c = cartes({
			stats: { [`${ADD}@ce2`]: stat([[2, 10]]), [`${HOMOPHONES}@ce2`]: stat([[3, 10]]) },
		});
		const maths = consolidationBasNiveau('math', 'cm1', c);
		const francais = consolidationBasNiveau('francais', 'cm1', c);
		expect(idsFragiles(maths)).toEqual([ADD]);
		expect(maths?.nbTravaillees).toBe(1);
		expect(idsFragiles(francais)).toEqual([HOMOPHONES]);
		expect(francais?.nbTravaillees).toBe(1);
		expect(francais?.niveau).toBe('ce2');
	});
});

describe('consolidationBasNiveau : tri (critère 5)', () => {
	it('non acquis avant en cours, puis perf récente croissante — ni ordre pédagogique, ni % seul', () => {
		// Ordre pédagogique : ADD < HEURE < TABLES. Fixtures choisies pour que CHAQUE tri
		// partiel donne un résultat différent de l'attendu :
		// - pédagogique seul → [ADD, HEURE, TABLES] ;
		// - % seul → [HEURE 20, TABLES 30, ADD 60] ;
		// - état puis pédagogique → [TABLES, ADD, HEURE].
		// HEURE est « en cours » à 20 % parce que la fenêtre n'a que 5 questions (sous le
		// plancher d'échantillon pour annoncer « non acquis »).
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: {
					[`${ADD}@ce2`]: stat([[6, 10]]), // en cours, 60 %
					[`${HEURE}@ce2`]: stat([[1, 5]]), // en cours, 20 % (5 questions)
					[`${TABLES}@ce2`]: stat([[3, 10]]), // non acquis, 30 %
				},
			}),
		);
		expect(idsFragiles(r)).toEqual([TABLES, HEURE, ADD]);
		expect(r?.fragiles.map((f) => f.etat)).toEqual(['non-acquis', 'en-cours', 'en-cours']);
		expect(r?.fragiles.map((f) => f.pctRecent)).toEqual([30, 20, 60]);
		expect(r?.nbTravaillees).toBe(3);
	});

	it('à état et perf égaux, départage par l’ordre pédagogique de la classe précédente', () => {
		// Insérées dans l'ordre INVERSE de l'ordre pédagogique (et TABLES < HEURE en
		// alphabétique) : ni l'ordre des clés ni un tri par id ne donnent l'attendu.
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: { [`${TABLES}@ce2`]: stat([[5, 10]]), [`${HEURE}@ce2`]: stat([[5, 10]]) },
			}),
		);
		expect(idsFragiles(r)).toEqual([HEURE, TABLES]);
		expect(r?.fragiles.map((f) => f.etat)).toEqual(['en-cours', 'en-cours']);
	});
});

describe('consolidationBasNiveau : franchise (critères 6 et 7)', () => {
	it('critère 6 : franchie par un essai complet à 80 %, puis perf récente effondrée → pas listée', () => {
		// Fenêtre 8/10 puis trois 2/10 = 14/40 = 35 % : « non acquis » si elle n'était pas
		// franchie. TABLES, même fenêtre sans report, sert de témoin.
		const effondree = stat([
			[8, 10],
			[2, 10],
			[2, 10],
			[2, 10],
		]);
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: { [`${ADD}@ce2`]: effondree, [`${TABLES}@ce2`]: effondree },
				reports: { [`${ADD}@ce2`]: report(80) },
			}),
		);
		expect(idsFragiles(r)).toEqual([TABLES]);
		expect(r?.nbTravaillees).toBe(2); // la franchie compte comme travaillée
	});

	it('critère 6 : franchie par une étoile, puis perf récente à 20 % → pas listée', () => {
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: { [`${HEURE}@ce2`]: stat([[2, 10]]), [`${TABLES}@ce2`]: stat([[2, 10]]) },
				stars: { [`${HEURE}@ce2`]: 1 },
			}),
		);
		expect(idsFragiles(r)).toEqual([TABLES]);
		expect(r?.nbTravaillees).toBe(2);
	});

	it('seuil de franchise : 70 % sur un essai complet franchit, 69 % non', () => {
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: { [`${ADD}@ce2`]: stat([[2, 10]]), [`${HEURE}@ce2`]: stat([[2, 10]]) },
				reports: { [`${ADD}@ce2`]: report(70), [`${HEURE}@ce2`]: report(69) },
			}),
		);
		expect(idsFragiles(r)).toEqual([HEURE]);
	});

	it('ni un meilleur % hors essai complet, ni une étoile à 0 ne franchissent', () => {
		// TABLES : 90 % de record tous modes (sprint, révision…) mais aucun essai complet.
		// HEURE : entrée d'étoiles présente mais à 0. Toutes deux restent fragiles.
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: { [`${TABLES}@ce2`]: stat([[2, 10]], 90), [`${HEURE}@ce2`]: stat([[2, 10]]) },
				stars: { [`${HEURE}@ce2`]: 0 },
			}),
		);
		expect(idsFragiles(r)).toEqual([HEURE, TABLES]); // même état et %, ordre pédagogique
	});

	it('critère 7 : leçons travaillées toutes franchies → nbTravaillees > 0 et liste vide', () => {
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: { [`${ADD}@ce2`]: stat([[10, 10]]), [`${HEURE}@ce2`]: stat([[4, 10]]) },
				stars: { [`${ADD}@ce2`]: 1 },
				reports: { [`${HEURE}@ce2`]: report(75) },
			}),
		);
		expect(r).toEqual({ niveau: 'ce2', fragiles: [], nbTravaillees: 2 });
	});
});

describe('consolidationBasNiveau : ce qui n’est jamais listé', () => {
	it('critère 9 : une leçon disponible aux deux classes n’apparaît pas, quel que soit son état en CE2', () => {
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: {
					[`${COMPARER}@ce2`]: stat([[1, 10]]),
					[`${COMPARER}@cm1`]: stat([[1, 10]]),
					[`${ADD}@ce2`]: stat([[2, 10]]), // témoin : celle-ci doit sortir
				},
			}),
		);
		expect(idsFragiles(r)).toEqual([ADD]);
		expect(r?.nbTravaillees).toBe(1); // COMPARER n'est pas éligible, donc pas comptée
	});

	it('critère 10 : rien de deux classes d’écart (CM2 avec une leçon CE2 faible)', () => {
		const r = consolidationBasNiveau(
			'math',
			'cm2',
			cartes({
				stats: {
					[`${ADD}@ce2`]: stat([[2, 10]]),
					[`${MULTIPLES_50}@cm1`]: stat([[2, 10]]), // témoin : la classe juste en dessous
				},
			}),
		);
		expect(r?.niveau).toBe('cm1');
		expect(idsFragiles(r)).toEqual([MULTIPLES_50]);
		expect(r?.nbTravaillees).toBe(1);
	});

	it('critère 11 : une leçon jamais travaillée à la classe précédente n’apparaît pas', () => {
		// ADD : entrée de stat à 0 question et entrée de report, mais aucune question posée.
		const r = consolidationBasNiveau(
			'math',
			'cm1',
			cartes({
				stats: { [`${ADD}@ce2`]: STAT_VIDE, [`${HEURE}@ce2`]: stat([[2, 10]]) },
				reports: { [`${ADD}@ce2`]: report(0) },
			}),
		);
		expect(idsFragiles(r)).toEqual([HEURE]);
		expect(r?.nbTravaillees).toBe(1);
	});

	it('critère 11 : profil neuf en CM1 → aucune leçon, aucune travaillée', () => {
		expect(consolidationBasNiveau('math', 'cm1', cartes({}))).toEqual({
			niveau: 'ce2',
			fragiles: [],
			nbTravaillees: 0,
		});
	});

	it('critère 12 : matière à la classe la plus basse (CE2) → undefined, même avec du CE2 faible', () => {
		const c = cartes({
			stats: { [`${ADD}@ce2`]: stat([[2, 10]]), [`${HOMOPHONES}@ce2`]: stat([[2, 10]]) },
		});
		expect(consolidationBasNiveau('math', 'ce2', c)).toBeUndefined();
		expect(consolidationBasNiveau('francais', 'ce2', c)).toBeUndefined();
	});

	it('undefined sans classe en dessous (CP) ou sans leçon éligible (matière inconnue)', () => {
		expect(consolidationBasNiveau('math', 'cp', cartes({}))).toBeUndefined();
		expect(consolidationBasNiveau('matiere-inexistante', 'cm1', cartes({}))).toBeUndefined();
	});
});

/* ---------- Récap encadrant (progressionProfil) ---------- */

/** Profil actif relu après réglage de sa classe (le récap lit l'objet Profile). */
function profilActif(reference: 'ce2' | 'cm1', math?: 'ce2' | 'cm1'): Profile {
	const p = activeProfile();
	setNiveauReferenceFor(p.uuid, reference);
	if (math) setNiveauMatiereFor(p.uuid, 'math', math);
	return loadProfilesMeta()!.list.find((x) => x.uuid === p.uuid)!;
}

describe('progressionProfil : classePrecedente', () => {
	it('critères 1, 4, 5, 13 : CM1 avec du CE2 travaillé → entrée maths triée, épinglage, périmètre inchangé', () => {
		const p = profilActif('cm1');
		const avant = progressionProfil(p, NOW);

		lsSet(LESSON_STATS_KEY, {
			[`${ADD}@ce2`]: stat([[6, 10]]), // en cours, 60 %
			[`${TABLES}@ce2`]: stat([[3, 10]]), // non acquis, 30 %
			[`${HEURE}@ce2`]: stat([[5, 10]]), // étoilée → franchie, et « acquise » si elle fuyait
		});
		lsSet(STARS_KEY, { [`${HEURE}@ce2`]: 1 });
		toggleRevoirFor(p.uuid, TABLES);
		const apres = progressionProfil(p, NOW);

		// Critère 13 : les leçons CE2 seules n'entrent pas dans le périmètre suivi (CM1).
		// HEURE étoilée ferait monter totalMaitrisees si elle y entrait.
		expect(apres.parCategorie).toEqual(avant.parCategorie);
		expect(apres.totalMaitrisees).toBe(avant.totalMaitrisees);
		expect(apres.totalLecons).toBe(avant.totalLecons);

		// … mais elles sont bien lues : une entrée maths, rien en français.
		expect(apres.classePrecedente).toHaveLength(1);
		const e = apres.classePrecedente[0];
		expect(e.subject).toBe('math');
		expect(e.label).toBe(apres.parMatiere.find((m) => m.subject === 'math')?.label);
		expect(e.niveau).toBe('ce2');
		expect(e.nbTravaillees).toBe(3);
		expect(e.fragiles.map((n) => n.lessonId)).toEqual([TABLES, ADD]); // critère 5
		expect(e.fragiles.map((n) => n.niveau)).toEqual(['non-acquis', 'en-cours']);
		expect(e.fragiles.map((n) => n.pctRecent)).toEqual([30, 60]);
		expect(e.fragiles.map((n) => n.epingle)).toEqual([true, false]); // critère 4
		expect(e.fragiles.map((n) => n.label)).toEqual([
			labelLecon(getLessonById(TABLES)!, 'ce2'),
			labelLecon(getLessonById(ADD)!, 'ce2'),
		]);
	});

	it('critère 7 : tout ce qui a été travaillé est franchi → entrée présente, liste vide', () => {
		const p = profilActif('cm1');
		lsSet(LESSON_STATS_KEY, { [`${ADD}@ce2`]: stat([[4, 10]]) });
		lsSet(LESSON_REPORT_KEY, { [`${ADD}@ce2`]: report(80) });
		const r = progressionProfil(p, NOW).classePrecedente;
		expect(r).toHaveLength(1);
		expect(r[0].subject).toBe('math');
		expect(r[0].nbTravaillees).toBe(1);
		expect(r[0].fragiles).toEqual([]);
	});

	it('critère 11 : profil neuf en CM1 → aucune entrée', () => {
		expect(progressionProfil(profilActif('cm1'), NOW).classePrecedente).toEqual([]);
	});

	it('critère 12 : profil au CE2 avec du CE2 faible → aucune entrée', () => {
		const p = profilActif('ce2');
		lsSet(LESSON_STATS_KEY, {
			[`${ADD}@ce2`]: stat([[2, 10]]),
			[`${HOMOPHONES}@ce2`]: stat([[2, 10]]),
		});
		expect(progressionProfil(p, NOW).classePrecedente).toEqual([]);
	});

	it('la classe se lit PAR MATIÈRE : maths au CE2, français au CM1 → seule l’entrée français', () => {
		const p = profilActif('cm1', 'ce2');
		lsSet(LESSON_STATS_KEY, {
			[`${ADD}@ce2`]: stat([[2, 10]]),
			[`${HOMOPHONES}@ce2`]: stat([[2, 10]]),
		});
		const r = progressionProfil(p, NOW).classePrecedente;
		expect(r.map((e) => e.subject)).toEqual(['francais']);
		expect(r[0].fragiles.map((n) => n.lessonId)).toEqual([HOMOPHONES]);
	});
});
