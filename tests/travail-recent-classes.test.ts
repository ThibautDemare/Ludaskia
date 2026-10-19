/* ============================================================
   « Travaillé récemment » distingue les classes (#772, critères 15 et 16).
   `travailRecent`, `travailRecentProfil` (core/encadrant-stats.ts), `normalizeActivity`
   (core/progress.ts) ; `progressionProfil` en non-régression.
   ------------------------------------------------------------
   Écrit AVANT l'implémentation, depuis l'issue et le contrat d'interface du cadrage :
   - critère 15 : une leçon travaillée dans deux classes sur la période fait DEUX lignes,
     chacune avec son compte et sa date ; une leçon d'une autre classe que la classe suivie
     doit pouvoir porter le badge « classe d'origine », donc sa ligne dit sa classe
     (`niveau`) ;
   - critère 16 : sur une classe SUPÉRIEURE à la classe suivie, compte-rendu factuel,
     jamais un état d'acquisition (`capFranchi` en est un : « en cours », « acquis ») ; et
     la leçon n'entre ni dans les compteurs de maîtrise, ni dans « à revoir », ni dans le
     signal « reste un point dur ».

   Règles du contrat éprouvées ici :
   1. une ligne par clé de stats `id@classe` travaillée dans la fenêtre ;
   2. `niveau` = classe de la clé, `label` = libellé de la leçon DANS cette classe,
      `derniereFois` = `lastAt` de cette clé ;
   3. séances : une entrée compte pour `id@classe` si `ref === id` et `n === classe` ; une
      entrée SANS `n` (ancienne) ne compte que si la leçon n'a qu'UNE ligne dans la fenêtre,
      sinon pour aucune ; rien d'attribuable → `null` ;
   4. une ligne au-dessus de `classeSuivie(matière)` a `capFranchi: null` ; la classe suivie
      et celles d'en dessous gardent la règle de #536 ;
   5. les dictées n'ont pas de `niveau` ;
   6. tri inchangé (la plus récente en tête), plus un dernier départage : à date, séances
      et libellé égaux, l'ordre scolaire de `niveau`, la classe la plus basse d'abord
      (décision du 20/10/2026).

   Calendrier : dimanche 15 mars 2026, 10 h 30 (local), le même que travail-recent.test.ts.
   Fenêtre de 7 jours : borne au lundi 9 mars, 0 h.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	travailRecent,
	travailRecentProfil,
	progressionProfil,
	type CibleTravaillee,
	type GroupeTravail,
	type SourcesCapFranchi,
} from '../src/core/encadrant-stats';
import {
	getAllLessons,
	getLessonById,
	type LessonDef,
	type SchoolLevel,
	type SubjectId,
} from '../src/core/catalog';
import { LEVEL_ORDER, labelLecon } from '../src/core/levels';
import {
	ACTIVITY_KEY,
	LESSON_PALIERS_KEY,
	LESSON_REPORT_KEY,
	LESSON_STATS_KEY,
	STARS_KEY,
	normalizeActivity,
	type PaliersNotion,
} from '../src/core/progress';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	addProfile,
	loadProfilesMeta,
	setNiveauReferenceFor,
	setNiveauMatiereFor,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { niveauProfilMatiere } from '../src/core/niveau-profil';
import { BLOCAGES_SIGNAL_ADULTE } from '../src/core/report-lecon';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import type { LessonStat } from '../src/core/maitrise';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Calendrier ---------- */
const AUJ = (h: number, min = 0) => new Date(2026, 2, 15, h, min, 0, 0).getTime();
const HIER = (h: number, min = 0) => new Date(2026, 2, 14, h, min, 0, 0).getTime();
/* Mercredi 4 mars : hors d'une fenêtre de 7 jours, qui commence le lundi 9. */
const HORS_FENETRE = (h: number) => new Date(2026, 2, 4, h, 0, 0, 0).getTime();
const NOW = AUJ(10, 30);
const JOURS = 7;

/* ---------- Fabriques ---------- */
/* 70 % sur 10 questions : « en cours » sans étoile, « acquis » avec. */
function stat(lastAt: number): LessonStat {
	return { attempts: 1, correct: 7, questions: 10, bestPct: 70, lastPct: 70, lastAt };
}
/* 20 % sur 10 questions : sous le seuil « à revoir » (70 %) et sous « à renforcer » (40 %). */
function statFaible(lastAt: number): LessonStat {
	return { attempts: 2, correct: 2, questions: 10, bestPct: 20, lastPct: 20, lastAt };
}
/* Entrée d'activité d'une leçon jouée seule. `n` = classe jouée (#772) ; omis = entrée
   ANCIENNE, écrite avant #772. `unknown` pour pouvoir y glisser une valeur abîmée. */
function seance(t: number, ref: string, n?: unknown) {
	return n === undefined ? { t, k: 'lecon', ref } : { t, k: 'lecon', ref, n };
}
const seanceDictee = (t: number, ref: string) => ({ t, k: 'dictee', ref });

const sources = (
	paliersLecons: Record<string, PaliersNotion> = {},
	etoiles: Record<string, number> = {},
): SourcesCapFranchi => ({ paliersLecons, paliersOrtho: {}, etoiles, dicteeDispo: false });
const SANS_PALIERS = sources();

/* Paliers franchis tous deux dans la fenêtre : sur une leçon ÉTOILÉE (état courant
   « acquis », qui ne plafonne rien), la règle de #536 annonce « acquis ». */
const PALIERS_FRANCHIS: PaliersNotion = { enCours: HIER(9), acquis: HIER(10) };

type Suivie = (subject: SubjectId) => SchoolLevel;
const suivie =
	(niveau: SchoolLevel): Suivie =>
	() =>
		niveau;

/* Appel de `travailRecent` sur la fenêtre de 7 jours. `classeSuivie` absente = l'appel
   tel que les appelants d'avant #772 le font. */
function travail(
	stats: Record<string, LessonStat>,
	activite: unknown[],
	src: SourcesCapFranchi,
	classeSuivie?: Suivie,
): GroupeTravail[] {
	return classeSuivie === undefined
		? travailRecent(stats, activite, null, src, JOURS, NOW)
		: travailRecent(stats, activite, null, src, JOURS, NOW, classeSuivie);
}

const toutes = (res: GroupeTravail[]): CibleTravaillee[] => res.flatMap((g) => g.cibles);
const lignesLecon = (res: GroupeTravail[], id: string) =>
	toutes(res).filter((c) => c.kind === 'lecon' && c.id === id);
/* LA ligne d'une leçon dans une classe donnée ; échoue si elle manque ou est en double. */
function ligne(res: GroupeTravail[], id: string, niveau: SchoolLevel): CibleTravaillee {
	const l = lignesLecon(res, id).filter((c) => c.niveau === niveau);
	expect(l, `ligne ${id}@${niveau}`).toHaveLength(1);
	return l[0];
}
/* La SEULE ligne d'une leçon, sans présumer de sa classe. */
function seuleLigne(res: GroupeTravail[], id: string): CibleTravaillee {
	const l = lignesLecon(res, id);
	expect(l, `lignes de ${id}`).toHaveLength(1);
	return l[0];
}

/* ---------- Leçons ---------- */
function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error('leçon absente du catalogue : ' + id);
	return l;
}
function leconsTellesQue(pred: (l: LessonDef) => boolean, n: number, quoi: string): LessonDef[] {
	const ls = getAllLessons().filter(pred);
	if (ls.length < n) throw new Error(`moins de ${n} leçon(s) ${quoi}`);
	return ls.slice(0, n);
}
const seule = (subject: SubjectId, niveau: SchoolLevel, autre: SchoolLevel, n = 1) =>
	leconsTellesQue(
		(l) => l.subject === subject && l.levels.includes(niveau) && !l.levels.includes(autre),
		n,
		`${subject} ${niveau} absente de ${autre}`,
	);
/* `num-comparer` : la leçon que l'issue cite, commune au CE2 et au CM1. */
function numComparer(): LessonDef {
	const l = lecon('num-comparer');
	expect(l.levels).toEqual(expect.arrayContaining(['ce2', 'cm1'])); // prémisse
	return l;
}

/* ---------- Profils ---------- */
function profilRelu(uuid: string): Profile {
	const p = loadProfilesMeta()!.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
/* Écriture BRUTE par UUID, comme le fait l'app pour un profil non actif. */
function ecrire(uuid: string, cle: string, valeur: unknown) {
	lsSetRaw(uuid + '/' + cle, JSON.stringify(valeur));
}

/* ============================================================
   Critère 15 : une ligne par classe travaillée
   ============================================================ */
describe('travailRecent — critère 15 : une leçon travaillée dans deux classes fait deux lignes', () => {
	it('num-comparer en CE2 et en CM1 → deux lignes, chacune avec sa classe, sa date et ses séances', () => {
		const { id } = numComparer();
		const res = travail(
			{ [id + '@ce2']: stat(HIER(17)), [id + '@cm1']: stat(AUJ(9)) },
			[seance(HIER(16), id, 'ce2'), seance(HIER(17), id, 'ce2'), seance(AUJ(9), id, 'cm1')],
			SANS_PALIERS,
			suivie('cm1'),
		);
		// Comptes DIFFÉRENTS (2 et 1) : un échange entre les deux lignes se voit, et la somme (3)
		// ne doit apparaître nulle part.
		expect(
			lignesLecon(res, id).map((c) => ({
				niveau: c.niveau,
				derniereFois: c.derniereFois,
				seances: c.seances,
			})),
		).toEqual([
			{ niveau: 'cm1', derniereFois: AUJ(9), seances: 1 }, // la plus récente en tête (règle 6)
			{ niveau: 'ce2', derniereFois: HIER(17), seances: 2 },
		]);
	});

	it('le résultat ne dépend pas de l’ordre des clés de stats', () => {
		const { id } = numComparer();
		const activite = [seance(HIER(17), id, 'ce2'), seance(AUJ(9), id, 'cm1')];
		const a = travail(
			{ [id + '@ce2']: stat(HIER(17)), [id + '@cm1']: stat(AUJ(9)) },
			activite,
			SANS_PALIERS,
			suivie('cm1'),
		);
		const b = travail(
			{ [id + '@cm1']: stat(AUJ(9)), [id + '@ce2']: stat(HIER(17)) },
			activite,
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(lignesLecon(a, id)).toHaveLength(2);
		expect(b).toEqual(a);
	});

	it('à date, séances et libellé égaux, l’ordre scolaire départage : la classe la plus basse d’abord', () => {
		// Décision du 20/10/2026 (coordination #772) : sans ce départage, l'ordre de deux lignes
		// identiques en tout sauf la classe dépendrait de l'ordre des clés de stockage.
		const [l] = leconsTellesQue(
			(x) =>
				x.levels.includes('ce2') &&
				x.levels.includes('cm1') &&
				labelLecon(x, 'ce2') === labelLecon(x, 'cm1'),
			1,
			'CE2 et CM1 au même libellé',
		);
		const activite = [seance(AUJ(9), l.id, 'ce2'), seance(AUJ(9), l.id, 'cm1')];
		// Les deux ordres d'insertion : la classe CM1 lue en premier, puis la CE2.
		for (const stats of [
			{ [l.id + '@cm1']: stat(AUJ(9)), [l.id + '@ce2']: stat(AUJ(9)) },
			{ [l.id + '@ce2']: stat(AUJ(9)), [l.id + '@cm1']: stat(AUJ(9)) },
		]) {
			const res = travail(stats, activite, SANS_PALIERS, suivie('cm1'));
			expect(
				lignesLecon(res, l.id).map((c) => [c.niveau, c.seances]),
				Object.keys(stats).join(', '),
			).toEqual([
				['ce2', 1],
				['cm1', 1],
			]);
		}
	});

	it('une leçon CE2 seule chez un profil CM1 → une ligne qui dit « ce2 »', () => {
		const [ce2Seule] = seule('math', 'ce2', 'cm1');
		const [cm1Seule] = seule('math', 'cm1', 'ce2');
		const res = travail(
			{ [ce2Seule.id + '@ce2']: stat(AUJ(9)), [cm1Seule.id + '@cm1']: stat(HIER(17)) },
			[seance(AUJ(9), ce2Seule.id, 'ce2'), seance(HIER(17), cm1Seule.id, 'cm1')],
			SANS_PALIERS,
			suivie('cm1'),
		);
		// C'est de cette donnée que l'UI tire le badge « classe d'origine ».
		expect(seuleLigne(res, ce2Seule.id).niveau).toBe('ce2');
		expect(seuleLigne(res, ce2Seule.id).seances).toBe(1);
		// La classe suivie porte aussi la sienne : `niveau` est la classe de la clé, toujours ;
		// décider d'afficher un badge ou non revient à l'UI.
		expect(seuleLigne(res, cm1Seule.id).niveau).toBe('cm1');
	});

	it('le libellé suit la classe de la ligne (fr-gram-clic-noyau en CE2 et en CM1)', () => {
		const l = lecon('fr-gram-clic-noyau');
		const libCe2 = labelLecon(l, 'ce2');
		const libCm1 = labelLecon(l, 'cm1');
		// Prémisses : l'issue nomme « Clique sur le nom » comme la version CE2, et les deux
		// libellés diffèrent — sinon ce test ne départagerait rien.
		expect(libCe2).toBe('Clique sur le nom');
		expect(libCm1).not.toBe(libCe2);
		const res = travail(
			{ [l.id + '@ce2']: stat(HIER(17)), [l.id + '@cm1']: stat(AUJ(9)) },
			[],
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(ligne(res, l.id, 'ce2').label).toBe(libCe2);
		expect(ligne(res, l.id, 'cm1').label).toBe(libCm1);
	});

	it('clé de stats héritée (sans « @ ») : une seule ligne, rangée en CE2, fusionnée avec « @ce2 »', () => {
		// Convention du stockage (progress.ts) : une clé sans niveau est traitée comme CE2. Elle
		// désigne donc la MÊME classe que « @ce2 » et ne fait pas de deuxième ligne.
		const res = travail(
			{ 'math-doubles': stat(HIER(17)), 'math-doubles@ce2': stat(AUJ(9)) },
			[],
			SANS_PALIERS,
			suivie('ce2'),
		);
		const l = seuleLigne(res, 'math-doubles');
		expect(l.niveau).toBe('ce2');
		expect(l.derniereFois).toBe(AUJ(9));
	});

	it('les dictées ne portent pas de classe (règle 5)', () => {
		const dictee = ORTHO_PREDEF.find((d) => d.niveau === 'cm1');
		if (!dictee) throw new Error('aucune dictée prédéfinie CM1');
		const res = travail({}, [seanceDictee(AUJ(9), dictee.id)], SANS_PALIERS, suivie('ce2'));
		const l = toutes(res).find((c) => c.kind === 'dictee' && c.id === dictee.id);
		expect(l).toBeDefined();
		expect(l!.niveau).toBeUndefined();
	});
});

describe('travailRecent — critère 15 : attribution des séances à la bonne ligne', () => {
	it('entrées anciennes (sans n), leçon sur UNE seule ligne → elles lui sont attribuées', () => {
		const [ce2Seule] = seule('math', 'ce2', 'cm1');
		const res = travail(
			{ [ce2Seule.id + '@ce2']: stat(AUJ(9)) },
			[seance(HIER(17), ce2Seule.id), seance(AUJ(9), ce2Seule.id)],
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(seuleLigne(res, ce2Seule.id).seances).toBe(2);
	});

	it('entrées anciennes (sans n), leçon sur DEUX lignes → attribuées à aucune (null des deux côtés)', () => {
		// Les répartir au hasard, ou les donner toutes à l'une, afficherait un compte faux.
		const { id } = numComparer();
		const res = travail(
			{ [id + '@ce2']: stat(HIER(17)), [id + '@cm1']: stat(AUJ(9)) },
			[seance(HIER(17), id), seance(AUJ(9), id)],
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(ligne(res, id, 'ce2').seances).toBeNull();
		expect(ligne(res, id, 'cm1').seances).toBeNull();
	});

	it('entrées mêlées sur deux lignes : chaque ligne ne compte que les siennes, les anciennes nulle part', () => {
		const { id } = numComparer();
		const res = travail(
			{ [id + '@ce2']: stat(HIER(17)), [id + '@cm1']: stat(AUJ(9)) },
			[
				seance(HIER(17), id, 'ce2'),
				seance(AUJ(9), id, 'cm1'),
				seance(HIER(12), id), // anciennes
				seance(AUJ(8), id),
			],
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(ligne(res, id, 'ce2').seances).toBe(1);
		expect(ligne(res, id, 'cm1').seances).toBe(1);
	});

	it('fenêtre : une clé hors fenêtre ne fait pas de ligne, et l’autre redevient la seule', () => {
		// « Une seule ligne DANS LA FENÊTRE » : la clé CE2, travaillée la semaine d'avant, ne
		// compte pas. L'entrée ancienne de la période revient donc à la ligne CM1.
		const { id } = numComparer();
		const res = travail(
			{ [id + '@ce2']: stat(HORS_FENETRE(17)), [id + '@cm1']: stat(HIER(17)) },
			[
				seance(HORS_FENETRE(17), id, 'ce2'), // hors fenêtre : ignorée
				seance(HIER(16), id, 'cm1'),
				seance(HIER(17), id), // ancienne, dans la fenêtre
			],
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(lignesLecon(res, id).map((c) => c.niveau)).toEqual(['cm1']);
		expect(ligne(res, id, 'cm1').derniereFois).toBe(HIER(17));
		expect(ligne(res, id, 'cm1').seances).toBe(2);
	});

	it('une entrée qui nomme une AUTRE classe ne compte pas pour la ligne unique', () => {
		// Règle 3 à la lettre : avec un `n`, seule l'égalité compte. La tolérance « ligne unique »
		// est réservée aux entrées SANS `n`. (Donnée que l'app ne devrait pas produire, mais qui
		// départage les deux branches de la règle.)
		const { id } = numComparer();
		const res = travail(
			{ [id + '@cm1']: stat(AUJ(9)) },
			[seance(AUJ(8), id, 'ce2'), seance(AUJ(9), id, 'cm1')],
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(seuleLigne(res, id).seances).toBe(1);
	});
});

describe('travailRecent — critère 15 : une classe invalide dans l’activité vaut une entrée sans classe', () => {
	const INVALIDES: unknown[] = ['cm9', '', 42, null, { niveau: 'ce2' }, ['ce2']];

	it('normalizeActivity conserve `n` quand c’est une classe', () => {
		for (const n of LEVEL_ORDER) {
			const [e] = normalizeActivity([seance(AUJ(9), 'num-comparer', n)]);
			expect(e.n, n).toBe(n);
		}
	});

	it('normalizeActivity écarte un `n` qui n’est pas une classe, et garde le reste de l’entrée', () => {
		for (const n of INVALIDES) {
			const [e] = normalizeActivity([seance(AUJ(9), 'num-comparer', n)]);
			expect('n' in e, JSON.stringify(n)).toBe(false);
			expect(e.ref).toBe('num-comparer');
			expect(e.k).toBe('lecon');
		}
	});

	it('classe invalide sur une leçon à une ligne → comptée, comme une entrée ancienne', () => {
		const { id } = numComparer();
		const res = travail(
			{ [id + '@cm1']: stat(AUJ(9)) },
			INVALIDES.map((n, i) => seance(AUJ(1 + i), id, n)),
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(seuleLigne(res, id).seances).toBe(INVALIDES.length);
	});

	it('classe invalide sur une leçon à deux lignes → attribuée à aucune', () => {
		const { id } = numComparer();
		const res = travail(
			{ [id + '@ce2']: stat(HIER(17)), [id + '@cm1']: stat(AUJ(9)) },
			[...INVALIDES.map((n, i) => seance(AUJ(1 + i), id, n)), seance(HIER(17), id, 'ce2')],
			SANS_PALIERS,
			suivie('cm1'),
		);
		expect(ligne(res, id, 'ce2').seances).toBe(1);
		expect(ligne(res, id, 'cm1').seances).toBeNull();
	});
});

/* ============================================================
   Critère 16 : pas d'état d'acquisition au-dessus de la classe suivie
   ============================================================ */
describe('travailRecent — critère 16 : une classe supérieure ne porte jamais de cap', () => {
	it('profil CE2, leçon CM1 seule, paliers franchis dans la fenêtre → capFranchi null', () => {
		const [cm1Seule] = seule('math', 'cm1', 'ce2');
		const cle = cm1Seule.id + '@cm1';
		for (const p of [{ enCours: HIER(9) }, { acquis: HIER(10) }, PALIERS_FRANCHIS]) {
			const res = travail(
				{ [cle]: stat(AUJ(9)) },
				[seance(AUJ(9), cm1Seule.id, 'cm1')],
				sources({ [cle]: p }, { [cle]: 1 }),
				suivie('ce2'),
			);
			expect(seuleLigne(res, cm1Seule.id).capFranchi, JSON.stringify(p)).toBeNull();
		}
	});

	it('contrôle : la même configuration sur une leçon de la classe suivie garde son cap', () => {
		const [ce2Seule] = seule('math', 'ce2', 'cm1');
		const cle = ce2Seule.id + '@ce2';
		const res = travail(
			{ [cle]: stat(AUJ(9)) },
			[seance(AUJ(9), ce2Seule.id, 'ce2')],
			sources({ [cle]: PALIERS_FRANCHIS }, { [cle]: 1 }),
			suivie('ce2'),
		);
		expect(seuleLigne(res, ce2Seule.id).capFranchi).toBe('acquis');
	});

	it('une classe EN DESSOUS de la classe suivie garde son cap (seul le dessus est muet)', () => {
		const [ce2Seule] = seule('math', 'ce2', 'cm1');
		const cle = ce2Seule.id + '@ce2';
		const res = travail(
			{ [cle]: stat(AUJ(9)) },
			[seance(AUJ(9), ce2Seule.id, 'ce2')],
			sources({ [cle]: PALIERS_FRANCHIS }, { [cle]: 1 }),
			suivie('cm1'),
		);
		expect(seuleLigne(res, ce2Seule.id).capFranchi).toBe('acquis');
	});

	it('num-comparer en CE2 et en CM1 chez un profil CE2 : la ligne CM1 est muette, la ligne CE2 parle', () => {
		const { id } = numComparer();
		const res = travail(
			{ [id + '@ce2']: stat(HIER(17)), [id + '@cm1']: stat(AUJ(9)) },
			[seance(HIER(17), id, 'ce2'), seance(AUJ(9), id, 'cm1')],
			sources(
				{ [id + '@ce2']: PALIERS_FRANCHIS, [id + '@cm1']: PALIERS_FRANCHIS },
				{ [id + '@ce2']: 1, [id + '@cm1']: 1 },
			),
			suivie('ce2'),
		);
		expect(ligne(res, id, 'cm1').capFranchi).toBeNull();
		expect(ligne(res, id, 'ce2').capFranchi).toBe('acquis');
	});

	it('la classe suivie se lit PAR MATIÈRE (maths en CM1, français en CE2)', () => {
		const [mathCm1] = seule('math', 'cm1', 'ce2');
		const [frCm1] = seule('francais', 'cm1', 'ce2');
		const cm = mathCm1.id + '@cm1';
		const cf = frCm1.id + '@cm1';
		const parMatiere: Suivie = (s) => (s === 'math' ? 'cm1' : 'ce2');
		const res = travail(
			{ [cm]: stat(AUJ(9)), [cf]: stat(AUJ(8)) },
			[seance(AUJ(9), mathCm1.id, 'cm1'), seance(AUJ(8), frCm1.id, 'cm1')],
			sources({ [cm]: PALIERS_FRANCHIS, [cf]: PALIERS_FRANCHIS }, { [cm]: 1, [cf]: 1 }),
			parMatiere,
		);
		expect(seuleLigne(res, mathCm1.id).capFranchi).toBe('acquis'); // classe suivie
		expect(seuleLigne(res, frCm1.id).capFranchi).toBeNull(); // classe supérieure
	});

	it('sans classeSuivie, le cap suit la règle d’avant #772 (paramètre optionnel)', () => {
		const [cm1Seule] = seule('math', 'cm1', 'ce2');
		const cle = cm1Seule.id + '@cm1';
		const res = travail(
			{ [cle]: stat(AUJ(9)) },
			[],
			sources({ [cle]: PALIERS_FRANCHIS }, { [cle]: 1 }),
		);
		expect(seuleLigne(res, cm1Seule.id).capFranchi).toBe('acquis');
	});
});

describe('travailRecentProfil — critère 16 : la classe suivie est celle du profil CONSULTÉ', () => {
	/* Une leçon jouée dans `niveau`, étoilée, avec ses paliers franchis dans la fenêtre. */
	function ecrireLecons(uuid: string, lecons: { id: string; niveau: SchoolLevel; t: number }[]) {
		const stats: Record<string, LessonStat> = {};
		const etoiles: Record<string, number> = {};
		const paliers: Record<string, PaliersNotion> = {};
		const activite: unknown[] = [];
		for (const { id, niveau, t } of lecons) {
			const cle = id + '@' + niveau;
			stats[cle] = stat(t);
			etoiles[cle] = 1;
			paliers[cle] = PALIERS_FRANCHIS;
			activite.push(seance(t, id, niveau));
		}
		ecrire(uuid, LESSON_STATS_KEY, stats);
		ecrire(uuid, STARS_KEY, etoiles);
		ecrire(uuid, LESSON_PALIERS_KEY, paliers);
		ecrire(uuid, ACTIVITY_KEY, activite);
	}

	it('profil consulté en CE2, profil actif en CM1 : la leçon CM1 du consulté est muette', () => {
		const a = activeProfile();
		setNiveauReferenceFor(a.uuid, 'ce2');
		const b = addProfile('Profil B'); // devient actif
		setNiveauReferenceFor(b.uuid, 'cm1');
		const consulte = profilRelu(a.uuid);
		expect(niveauProfilMatiere(consulte, 'math')).toBe('ce2'); // prémisses
		expect(niveauProfilMatiere(activeProfile(), 'math')).toBe('cm1');

		const [cm1Seule] = seule('math', 'cm1', 'ce2');
		const [ce2Seule] = seule('math', 'ce2', 'cm1');
		ecrireLecons(a.uuid, [
			{ id: cm1Seule.id, niveau: 'cm1', t: AUJ(9) },
			{ id: ce2Seule.id, niveau: 'ce2', t: AUJ(8) },
		]);

		const res = travailRecentProfil(consulte, JOURS, NOW, false);
		expect(seuleLigne(res, cm1Seule.id).capFranchi).toBeNull();
		expect(seuleLigne(res, cm1Seule.id).niveau).toBe('cm1');
		// Contrôle : les paliers du profil sont bien lus, la classe suivie parle.
		expect(seuleLigne(res, ce2Seule.id).capFranchi).toBe('acquis');
	});

	it('niveauParMatiere : maths réglées en CM1, français resté en CE2', () => {
		const a = activeProfile();
		setNiveauReferenceFor(a.uuid, 'ce2');
		setNiveauMatiereFor(a.uuid, 'math', 'cm1');
		const p = profilRelu(a.uuid);
		expect(niveauProfilMatiere(p, 'math')).toBe('cm1'); // prémisses
		expect(niveauProfilMatiere(p, 'francais')).toBe('ce2');

		const [mathCm1] = seule('math', 'cm1', 'ce2');
		const [frCm1] = seule('francais', 'cm1', 'ce2');
		ecrireLecons(a.uuid, [
			{ id: mathCm1.id, niveau: 'cm1', t: AUJ(9) },
			{ id: frCm1.id, niveau: 'cm1', t: AUJ(8) },
		]);

		const res = travailRecentProfil(p, JOURS, NOW, false);
		expect(seuleLigne(res, mathCm1.id).capFranchi).toBe('acquis');
		expect(seuleLigne(res, frCm1.id).capFranchi).toBeNull();
	});
});

/* ============================================================
   Critère 16, suite : compteurs de maîtrise, « à revoir », « reste un point dur ».
   NON-RÉGRESSION : `progressionProfil` est déjà scopé à la classe suivie (il lit chaque
   leçon à la clé `id@classe suivie`), donc ce test est vert avant #772. Il garde ce
   scopage contre une implémentation qui lirait les leçons « là où elles ont été jouées ».
   ============================================================ */
describe('progressionProfil — critère 16 : une classe supérieure n’entre dans aucun compteur', () => {
	/* Même forme de données pour la cible et pour le contrôle : une leçon étoilée (maîtrise),
	   une leçon faible (« à revoir »), une leçon butée trois jours (« reste un point dur »). */
	function ecrireRecap(uuid: string, niveau: SchoolLevel, ids: [string, string, string]) {
		const [etoilee, faible, butee] = ids.map((id) => id + '@' + niveau);
		ecrire(uuid, STARS_KEY, { [etoilee]: 1 });
		ecrire(uuid, LESSON_STATS_KEY, {
			[etoilee]: stat(AUJ(9)),
			[faible]: statFaible(AUJ(9)),
			[butee]: stat(AUJ(9)),
		});
		ecrire(uuid, LESSON_REPORT_KEY, {
			[butee]: { jours: BLOCAGES_SIGNAL_ADULTE, dernierJour: '2026-03-15' },
		});
	}
	const ids3 = (ls: LessonDef[]): [string, string, string] => [ls[0].id, ls[1].id, ls[2].id];

	it('contrôle : en CE2, les mêmes données comptent', () => {
		const a = activeProfile();
		setNiveauReferenceFor(a.uuid, 'ce2');
		const ce2 = seule('math', 'ce2', 'cm1', 3);
		ecrireRecap(a.uuid, 'ce2', ids3(ce2));

		const r = progressionProfil(profilRelu(a.uuid), NOW);
		expect(r.totalMaitrisees).toBe(1);
		const revoir = r.aRevoir.map((n) => n.lessonId);
		expect(revoir).toContain(ce2[1].id);
		expect(revoir).toContain(ce2[2].id);
		expect(r.aRevoir.find((n) => n.lessonId === ce2[2].id)!.blocages).toBeGreaterThanOrEqual(
			BLOCAGES_SIGNAL_ADULTE,
		);
	});

	it('profil CE2, données en CM1 (leçons CM1 seules et num-comparer) : rien ne compte', () => {
		const a = activeProfile();
		setNiveauReferenceFor(a.uuid, 'ce2');
		const vierge = progressionProfil(profilRelu(a.uuid), NOW);

		const cm1 = seule('math', 'cm1', 'ce2', 2);
		// num-comparer existe AUSSI en CE2 : sa ligne CE2 du récap ne doit pas lire la clé CM1.
		const { id: commune } = numComparer();
		ecrireRecap(a.uuid, 'cm1', [cm1[0].id, commune, cm1[1].id]);
		const r = progressionProfil(profilRelu(a.uuid), NOW);

		expect(r.totalMaitrisees).toBe(0);
		expect(r.aRevoir).toEqual([]);
		expect(r.totalLecons).toBe(vierge.totalLecons); // périmètre inchangé
		expect(r.parMatiere.find((m) => m.subject === 'math')).toMatchObject({
			travaillees: 0,
			acquis: 0,
		});
		const notions = r.parCategorie.flatMap((c) => c.lecons);
		for (const id of [cm1[0].id, cm1[1].id])
			expect(notions.some((n) => n.lessonId === id)).toBe(false);
		const ligneCommune = notions.find((n) => n.lessonId === commune);
		expect(ligneCommune).toBeDefined(); // prémisse : la leçon commune a bien sa ligne CE2
		expect(ligneCommune).toMatchObject({ vues: 0, derniereFois: null, blocages: 0 });
	});
});
