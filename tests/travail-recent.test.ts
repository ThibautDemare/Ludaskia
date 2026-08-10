/* ============================================================
   « Travaillé récemment » (#520) — travailRecent / travailRecentProfil.
   ------------------------------------------------------------
   Attendus dérivés du BESOIN décrit par l'issue et le contrat d'en-tête
   (encadrant-stats.ts), pas de la mécanique interne :
   - la fenêtre est en jours CALENDAIRES locaux, aujourd'hui inclus, borne basse
     INCLUSIVE (donc « hier 23 h 59 » et « ce matin » cohabitent sur 2 jours, et
     « avant-hier midi » sort de la fenêtre même s'il a moins de 48 h) ;
   - l'APPARTENANCE à la fenêtre vient de `lastAt` (elle couvre tous les chemins :
     leçon seule, bilan, sprint), le COMPTE vient du journal d'activité (`ref`), et
     `null` (compte inconnu) n'est jamais 0 (« pas travaillée ») ;
   - AUCUN filtre de niveau : ce qui a été travaillé doit être nommé, y compris une
     leçon CE2 rejouée par un profil CM1 (rangée `@ce2`, cf. `niveauStockage`) ou une
     dictée d'un autre niveau. Une leçon présente sous deux clés `@niveau` ne fait
     donc qu'UNE ligne, datée de la plus récente ;
   - les dictées n'existent que dans le journal et sont rattachées au français ;
   - la sortie est un groupe par matière dans l'ordre de SUBJECTS, chaque groupe
     trié du plus récent au plus ancien, de façon DÉTERMINISTE (l'ordre des clés de
     stockage ne doit jamais se voir à l'écran).

   Les horodatages sont construits avec `new Date(a, m, j, h, min)` (heure LOCALE) :
   un décalage fixe en millisecondes présupposerait des jours de 24 h et rendrait les
   tests dépendants du fuseau.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	travailRecent,
	travailRecentProfil,
	niveauProfilMatiere,
	type GroupeTravail,
} from '../src/core/encadrant-stats';
import { getAllLessons, type LessonDef, type SubjectId } from '../src/core/catalog';
import { LESSON_STATS_KEY, ACTIVITY_KEY } from '../src/core/progress';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	addProfile,
	loadProfilesMeta,
	setNiveauReferenceFor,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { createListe, loadOrtho } from '../src/core/orthographe/store';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import type { LessonStat } from '../src/core/maitrise';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Calendrier de référence : dimanche 15 mars 2026, 10 h 30 (local) ---------- */
const AUJ = (h: number, min = 0) => new Date(2026, 2, 15, h, min, 0, 0).getTime();
const HIER = (h: number, min = 0) => new Date(2026, 2, 14, h, min, 0, 0).getTime();
const AVANT_HIER = (h: number, min = 0) => new Date(2026, 2, 13, h, min, 0, 0).getTime();
const IL_Y_A_6_J = (h: number, min = 0) => new Date(2026, 2, 9, h, min, 0, 0).getTime();
const IL_Y_A_7_J = (h: number, min = 0) => new Date(2026, 2, 8, h, min, 0, 0).getTime();
const NOW = AUJ(10, 30);

/* Stat de leçon minimale : seule `lastAt` compte pour ce bloc (le reste du modèle de
   maîtrise n'y est pas lu — c'est une photo d'activité, pas un jugement). */
function stat(lastAt: number): LessonStat {
	return { attempts: 1, correct: 7, questions: 10, bestPct: 70, lastPct: 70, lastAt };
}
/* Stat SANS date : donnée antérieure au suivi « dernière fois travaillée ». */
function statSansDate(): LessonStat {
	return { attempts: 1, correct: 7, questions: 10, bestPct: 70, lastPct: 70 };
}
/* Séance de leçon jouée seule : c'est la seule qui porte une `ref` (#498). */
const seanceLecon = (t: number, ref: string) => ({ t, k: 'lecon', ref });
/* Bilan / sprint : plusieurs leçons en une séance, donc AUCUNE ref. */
const seanceBilan = (t: number) => ({ t, k: 'bilan' });
const seanceSprint = (t: number) => ({ t, k: 'sprint' });
const seanceDictee = (t: number, ref: string) => ({ t, k: 'dictee', ref });

const groupe = (res: GroupeTravail[], subject: SubjectId) => res.find((g) => g.subject === subject);
const labels = (res: GroupeTravail[], subject: SubjectId) =>
	(groupe(res, subject)?.cibles ?? []).map((c) => c.label);
const ids = (res: GroupeTravail[], subject: SubjectId) =>
	(groupe(res, subject)?.cibles ?? []).map((c) => c.id);
const cible = (res: GroupeTravail[], subject: SubjectId, id: string) =>
	(groupe(res, subject)?.cibles ?? []).find((c) => c.id === id);

/* Cible choisie DYNAMIQUEMENT dans le catalogue : un id de français en dur mentirait
   dès qu'une leçon change de niveau (ils sont générés depuis les données). */
function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi);
	return l;
}
function profilRelu(uuid: string): Profile {
	const p = loadProfilesMeta()!.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
function predefDeNiveau(niveau: 'ce2' | 'cm1') {
	const d = ORTHO_PREDEF.find((x) => x.niveau === niveau);
	if (!d) throw new Error('aucune dictée prédéfinie ' + niveau);
	return d;
}

describe('travailRecent — fenêtre en jours calendaires', () => {
	it('2 jours : hier 23 h 59 ET ce matin sont dedans, avant-hier midi non (bien qu’à moins de 48 h)', () => {
		const res = travailRecent(
			{
				'math-doubles@ce2': stat(AUJ(8, 15)),
				'math-complements@ce2': stat(HIER(23, 59)),
				'math-moities@ce2': stat(AVANT_HIER(12, 0)), // 46 h 30 avant NOW : dans 48 h, hors 2 jours
			},
			[],
			null,
			2,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles', 'math-complements']);
	});

	it('1 jour (« Aujourd’hui ») : hier 23 h 59 est exclu, ce matin 00 h 00 inclus', () => {
		const res = travailRecent(
			{
				'math-doubles@ce2': stat(AUJ(0, 0)), // minuit pile aujourd'hui
				'math-complements@ce2': stat(HIER(23, 59)), // 31 min plus tôt seulement
			},
			[],
			null,
			1,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles']);
	});

	it('la borne basse est INCLUSIVE : minuit pile du 1er jour de la fenêtre compte', () => {
		// Fenêtre de 2 jours depuis le 15 mars → premier jour = 14 mars, borne = 14 mars 00 h 00.
		const borne = new Date(2026, 2, 14, 0, 0, 0, 0).getTime();
		const res = travailRecent(
			{
				'math-doubles@ce2': stat(borne), // sur la borne
				'math-complements@ce2': stat(borne - 1), // 1 ms avant
			},
			[],
			null,
			2,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles']);
	});

	it('7 jours : le 7e jour révolu est dedans, le 8e dehors', () => {
		const res = travailRecent(
			{
				'math-doubles@ce2': stat(IL_Y_A_6_J(8, 0)), // 9 mars = 7e jour de la fenêtre
				'math-complements@ce2': stat(IL_Y_A_7_J(23, 30)), // 8 mars = hors fenêtre
			},
			[],
			null,
			7,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles']);
	});

	it('la coupure suit le jour LOCAL, pas 24 h glissantes (fenêtre en travers d’un changement d’heure)', () => {
		// Lundi 30 mars 2026, lendemain du passage à l'heure d'été en Europe : la veille
		// n'a duré que 23 h. Fenêtre de 2 jours → borne = 29 mars 00 h 00 LOCAL.
		const lundi = new Date(2026, 2, 30, 9, 0, 0, 0).getTime();
		const res = travailRecent(
			{
				'math-doubles@ce2': stat(new Date(2026, 2, 29, 0, 30, 0, 0).getTime()), // dans la fenêtre
				'math-complements@ce2': stat(new Date(2026, 2, 28, 23, 30, 0, 0).getTime()), // veille de la veille
			},
			[],
			null,
			2,
			lundi,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles']);
	});

	it('rien dans la fenêtre → aucun groupe (pas un groupe vide)', () => {
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(IL_Y_A_7_J(10, 0)) },
			[seanceBilan(IL_Y_A_7_J(10, 0))],
			null,
			7,
			NOW,
		);
		expect(res).toEqual([]);
	});

	it('stats vides et journal vide → aucun groupe', () => {
		expect(travailRecent({}, [], null, 7, NOW)).toEqual([]);
	});
});

describe('travailRecent — appartenance (lastAt) vs compte de séances (journal)', () => {
	it('compte les séances portant la ref, DANS la fenêtre seulement', () => {
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(AUJ(9, 0)) },
			[
				seanceLecon(AUJ(9, 0), 'math-doubles'),
				seanceLecon(HIER(18, 0), 'math-doubles'),
				seanceLecon(IL_Y_A_7_J(18, 0), 'math-doubles'), // hors fenêtre : ne compte pas
				seanceLecon(AUJ(9, 30), 'math-moities'), // autre cible : ne compte pas ici
			],
			null,
			2,
			NOW,
		);
		expect(cible(res, 'math', 'math-doubles')!.seances).toBe(2);
	});

	it('leçon travaillée seulement en bilan ou en sprint : seances = null, JAMAIS 0', () => {
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(AUJ(9, 0)), 'math-moities@ce2': stat(AUJ(9, 0)) },
			[seanceBilan(AUJ(9, 0)), seanceSprint(AUJ(9, 0))], // aucune ref : cibles multiples
			null,
			2,
			NOW,
		);
		const doubles = cible(res, 'math', 'math-doubles')!;
		expect(doubles.seances).toBeNull();
		expect(doubles.seances).not.toBe(0); // « travaillée 0 fois » serait un contresens à l'écran
		expect(cible(res, 'math', 'math-moities')!.seances).toBeNull();
	});

	it('journal vide ou à l’ANCIEN format (horodatages nus) : la leçon est listée, compte inconnu', () => {
		const stats = { 'math-doubles@ce2': stat(AUJ(9, 0)) };
		expect(
			cible(travailRecent(stats, [], null, 2, NOW), 'math', 'math-doubles')!.seances,
		).toBeNull();
		// Ancien format (#319/#498) : ni type ni ref → inattribuable, mais rien ne casse.
		const ancien = travailRecent(stats, [AUJ(9, 0), AUJ(9, 5)], null, 2, NOW);
		expect(ids(ancien, 'math')).toEqual(['math-doubles']);
		expect(cible(ancien, 'math', 'math-doubles')!.seances).toBeNull();
	});

	it('journal illisible (non tableau) : ignoré, la leçon reste listée', () => {
		const res = travailRecent({ 'math-doubles@ce2': stat(AUJ(9, 0)) }, 'corrompu', null, 2, NOW);
		expect(ids(res, 'math')).toEqual(['math-doubles']);
		expect(cible(res, 'math', 'math-doubles')!.seances).toBeNull();
	});

	it('une ref du journal ne suffit PAS à faire apparaître une leçon sans lastAt dans la fenêtre', () => {
		const res = travailRecent(
			{
				'math-doubles@ce2': statSansDate(), // donnée antérieure au suivi de la dernière fois
				'math-moities@ce2': stat(IL_Y_A_7_J(10, 0)), // date connue, hors fenêtre
			},
			[seanceLecon(AUJ(9, 0), 'math-doubles'), seanceLecon(AUJ(9, 30), 'math-moities')],
			null,
			2,
			NOW,
		);
		expect(res).toEqual([]);
	});

	it('derniereFois est la date des stats (dernière session, tous chemins confondus)', () => {
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(AUJ(9, 42)) },
			[seanceLecon(HIER(18, 0), 'math-doubles')],
			null,
			2,
			NOW,
		);
		expect(cible(res, 'math', 'math-doubles')!.derniereFois).toBe(AUJ(9, 42));
	});

	it('leçon retirée du catalogue → écartée, les autres restent', () => {
		const res = travailRecent(
			{ 'math-lecon-disparue@ce2': stat(AUJ(9, 0)), 'math-doubles@ce2': stat(AUJ(8, 0)) },
			[seanceLecon(AUJ(9, 0), 'math-lecon-disparue')],
			null,
			2,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles']);
	});
});

describe('travailRecent — aucun filtre de niveau, une ligne par leçon', () => {
	it('des leçons rangées sous des niveaux différents apparaissent toutes', () => {
		const mathCm1 = leconTelleQue(
			(l) => l.subject === 'math' && l.levels.includes('cm1') && l.id !== 'math-doubles',
			'de maths CM1',
		);
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(AUJ(9, 0)), [mathCm1.id + '@cm1']: stat(AUJ(8, 0)) },
			[],
			null,
			2,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles', mathCm1.id]);
	});

	it('même leçon sous DEUX clés @niveau → une seule ligne, datée de la plus récente', () => {
		const deuxNiveaux = leconTelleQue(
			(l) => l.levels.includes('ce2') && l.levels.includes('cm1'),
			'portant CE2 et CM1',
		);
		const res = travailRecent(
			{
				[deuxNiveaux.id + '@ce2']: stat(HIER(17, 0)), // clé la plus ANCIENNE en tête
				[deuxNiveaux.id + '@cm1']: stat(AUJ(9, 30)),
			},
			[],
			null,
			2,
			NOW,
		);
		const cibles = groupe(res, deuxNiveaux.subject)!.cibles.filter((c) => c.id === deuxNiveaux.id);
		expect(cibles).toHaveLength(1); // pas deux lignes pour la même leçon
		expect(cibles[0].derniereFois).toBe(AUJ(9, 30)); // ni la 1re clé lue, ni la plus ancienne
	});

	it('l’ordre des deux clés ne change rien à la date retenue', () => {
		const deuxNiveaux = leconTelleQue(
			(l) => l.levels.includes('ce2') && l.levels.includes('cm1'),
			'portant CE2 et CM1',
		);
		const res = travailRecent(
			{
				[deuxNiveaux.id + '@cm1']: stat(AUJ(9, 30)), // clé la plus RÉCENTE en tête
				[deuxNiveaux.id + '@ce2']: stat(HIER(17, 0)),
			},
			[],
			null,
			2,
			NOW,
		);
		const cibles = groupe(res, deuxNiveaux.subject)!.cibles.filter((c) => c.id === deuxNiveaux.id);
		expect(cibles).toHaveLength(1);
		expect(cibles[0].derniereFois).toBe(AUJ(9, 30));
	});

	it('une clé hors fenêtre ne rajeunit ni ne vieillit la ligne de l’autre', () => {
		const deuxNiveaux = leconTelleQue(
			(l) => l.levels.includes('ce2') && l.levels.includes('cm1'),
			'portant CE2 et CM1',
		);
		const res = travailRecent(
			{
				[deuxNiveaux.id + '@ce2']: stat(IL_Y_A_7_J(10, 0)), // hors fenêtre
				[deuxNiveaux.id + '@cm1']: stat(HIER(18, 0)), // dedans
			},
			[],
			null,
			2,
			NOW,
		);
		const cibles = groupe(res, deuxNiveaux.subject)!.cibles.filter((c) => c.id === deuxNiveaux.id);
		expect(cibles).toHaveLength(1);
		expect(cibles[0].derniereFois).toBe(HIER(18, 0));
	});

	it('clé héritée SANS niveau (données d’avant le namespacing) : listée, et fusionnée avec la clé namespacée', () => {
		expect(
			ids(travailRecent({ 'math-doubles': stat(AUJ(9, 0)) }, [], null, 2, NOW), 'math'),
		).toEqual(['math-doubles']);
		// Migration en cours : l'ancienne clé et la nouvelle désignent la MÊME leçon.
		const res = travailRecent(
			{ 'math-doubles': stat(HIER(17, 0)), 'math-doubles@ce2': stat(AUJ(9, 0)) },
			[],
			null,
			2,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles']);
		expect(cible(res, 'math', 'math-doubles')!.derniereFois).toBe(AUJ(9, 0));
	});

	it('les séances comptées couvrent la leçon, quel que soit le niveau où elle a été jouée', () => {
		// La `ref` du journal n'est pas namespacée : les deux séances portent le même id, et
		// la ligne unique doit les compter toutes les deux.
		const deuxNiveaux = leconTelleQue(
			(l) => l.levels.includes('ce2') && l.levels.includes('cm1'),
			'portant CE2 et CM1',
		);
		const res = travailRecent(
			{
				[deuxNiveaux.id + '@ce2']: stat(HIER(17, 0)),
				[deuxNiveaux.id + '@cm1']: stat(AUJ(9, 30)),
			},
			[seanceLecon(HIER(17, 0), deuxNiveaux.id), seanceLecon(AUJ(9, 30), deuxNiveaux.id)],
			null,
			2,
			NOW,
		);
		expect(cible(res, deuxNiveaux.subject, deuxNiveaux.id)!.seances).toBe(2);
	});
});

describe('travailRecent — dictées (journal seul, rattachées au français)', () => {
	it('dictée prédéfinie : nommée, contexte « Dictée », comptée, sans stats de leçon', () => {
		const predef = predefDeNiveau('ce2');
		const res = travailRecent(
			{},
			[seanceDictee(AUJ(9, 0), predef.id), seanceDictee(HIER(19, 0), predef.id)],
			null,
			2,
			NOW,
		);
		expect(res).toHaveLength(1);
		expect(res[0].subject).toBe('francais');
		expect(res[0].cibles).toHaveLength(1);
		expect(res[0].cibles[0]).toEqual({
			id: predef.id,
			label: predef.label,
			contexte: 'Dictée',
			seances: 2,
			derniereFois: AUJ(9, 0), // la plus récente des deux séances
		});
	});

	it('liste créée par le parent : nommée depuis l’état orthographe du profil', () => {
		const etat = loadOrtho();
		const liste = createListe(etat, 'Mots du lundi', [{ mot: 'chat' }, { mot: 'chien' }]);
		const res = travailRecent({}, [seanceDictee(AUJ(9, 0), liste.id)], etat, 2, NOW);
		expect(labels(res, 'francais')).toEqual(['Mots du lundi']);
		expect(cible(res, 'francais', liste.id)!.contexte).toBe('Dictée');
	});

	it('état orthographe absent : la prédéfinie reste nommée, la liste du parent est écartée', () => {
		const etat = loadOrtho();
		const liste = createListe(etat, 'Mots du lundi', [{ mot: 'chat' }]);
		const predef = predefDeNiveau('ce2');
		const res = travailRecent(
			{},
			[seanceDictee(AUJ(9, 0), liste.id), seanceDictee(AUJ(9, 30), predef.id)],
			null, // pas d'état ortho lisible
			2,
			NOW,
		);
		expect(ids(res, 'francais')).toEqual([predef.id]);
	});

	it('liste supprimée depuis (id non résolu en libellé) → écartée', () => {
		const res = travailRecent(
			{},
			[seanceDictee(AUJ(9, 0), 'liste-supprimee')],
			loadOrtho(),
			2,
			NOW,
		);
		expect(res).toEqual([]);
	});

	it('une dictée reste une dictée même si une entrée d’un AUTRE type porte la même ref', () => {
		// Robustesse : une entrée de type inconnu (écrite par une version ultérieure) ne doit
		// pas faire disparaître la ligne selon sa position dans le journal.
		const predef = predefDeNiveau('ce2');
		const autreType = { t: HIER(18, 0), k: 'mode-futur', ref: predef.id };
		const dictee = seanceDictee(AUJ(9, 0), predef.id);
		for (const journal of [
			[autreType, dictee], // l'entrée « dictee » n'est PAS la première de la ref
			[dictee, autreType],
		]) {
			const res = travailRecent({}, journal, null, 2, NOW);
			expect(ids(res, 'francais')).toEqual([predef.id]);
			expect(cible(res, 'francais', predef.id)!.seances).toBe(2);
			expect(cible(res, 'francais', predef.id)!.derniereFois).toBe(AUJ(9, 0));
		}
	});

	it('dictée hors fenêtre → écartée', () => {
		const predef = predefDeNiveau('ce2');
		const res = travailRecent({}, [seanceDictee(HIER(19, 0), predef.id)], null, 1, NOW);
		expect(res).toEqual([]);
	});

	it('dictée d’un autre niveau : affichée aussi (aucun filtre de niveau)', () => {
		const cm1 = predefDeNiveau('cm1');
		const res = travailRecent({}, [seanceDictee(AUJ(9, 0), cm1.id)], null, 2, NOW);
		expect(ids(res, 'francais')).toEqual([cm1.id]);
	});

	it('dictées et leçons de français sont triées ENSEMBLE, pas empilées par source', () => {
		const predef = predefDeNiveau('ce2');
		const frCe2 = leconTelleQue(
			(l) => l.subject === 'francais' && l.levels.includes('ce2'),
			'de français CE2',
		);
		const res = travailRecent(
			{ [frCe2.id + '@ce2']: stat(AUJ(8, 0)) },
			[seanceDictee(AUJ(9, 30), predef.id)], // dictée plus récente que la leçon
			null,
			2,
			NOW,
		);
		expect(ids(res, 'francais')).toEqual([predef.id, frCe2.id]);
	});
});

describe('travailRecent — groupes par matière', () => {
	it('un groupe par matière, dans l’ordre du catalogue (maths puis français)', () => {
		const frCe2 = leconTelleQue(
			(l) => l.subject === 'francais' && l.levels.includes('ce2'),
			'de français CE2',
		);
		// Le français est inséré EN PREMIER dans les stats : l'ordre de sortie ne doit pas
		// refléter l'ordre de découverte des clés.
		const res = travailRecent(
			{ [frCe2.id + '@ce2']: stat(AUJ(9, 0)), 'math-doubles@ce2': stat(AUJ(8, 0)) },
			[],
			null,
			2,
			NOW,
		);
		expect(res.map((g) => g.subject)).toEqual(['math', 'francais']);
		expect(res.map((g) => g.label)).toEqual(['Mathématiques', 'Français']);
		expect(res.every((g) => g.cibles.length > 0)).toBe(true); // jamais de groupe vide
	});

	it('matière non travaillée → absente (pas de groupe vide)', () => {
		const res = travailRecent({ 'math-doubles@ce2': stat(AUJ(9, 0)) }, [], null, 2, NOW);
		expect(res.map((g) => g.subject)).toEqual(['math']);
	});

	it('le contexte d’une leçon est le libellé de sa catégorie', () => {
		const res = travailRecent({ 'math-doubles@ce2': stat(AUJ(9, 0)) }, [], null, 2, NOW);
		expect(cible(res, 'math', 'math-doubles')!.contexte).toBe('Calcul mental');
	});
});

describe('travailRecent — tri et déterminisme', () => {
	it('la plus récemment travaillée en tête', () => {
		const res = travailRecent(
			{
				'math-moities@ce2': stat(HIER(17, 0)),
				'math-doubles@ce2': stat(AUJ(9, 0)),
				'math-complements@ce2': stat(HIER(20, 0)),
			},
			[],
			null,
			2,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-doubles', 'math-complements', 'math-moities']);
	});

	it('même horodatage (cas d’un bilan) : la plus travaillée d’abord', () => {
		// Un bilan écrit la MÊME date sur toutes ses leçons ; l'une d'elles a en plus été
		// jouée seule deux fois dans la fenêtre.
		const bilan = AUJ(9, 0);
		const res = travailRecent(
			{ 'math-complements@ce2': stat(bilan), 'math-moities@ce2': stat(bilan) },
			[
				seanceBilan(bilan),
				seanceLecon(HIER(18, 0), 'math-moities'),
				seanceLecon(HIER(19, 0), 'math-moities'),
				seanceLecon(HIER(20, 0), 'math-complements'),
			],
			null,
			2,
			NOW,
		);
		// « Moitiés » passe devant « Complément… » malgré l'ordre alphabétique : 2 séances vs 1.
		expect(ids(res, 'math')).toEqual(['math-moities', 'math-complements']);
		expect(cible(res, 'math', 'math-moities')!.seances).toBe(2);
		expect(cible(res, 'math', 'math-complements')!.seances).toBe(1);
	});

	it('même horodatage : un compte inconnu passe derrière un compte connu', () => {
		// Cas réel : un bilan date deux leçons à la ms près, l'une d'elles ayant aussi été
		// jouée seule (donc comptée). L'autre reste « travaillée, compte inconnu ».
		const bilan = AUJ(9, 0);
		const res = travailRecent(
			{ 'math-complements@ce2': stat(bilan), 'math-moities@ce2': stat(bilan) },
			[seanceBilan(bilan), seanceLecon(HIER(18, 0), 'math-moities')],
			null,
			2,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-moities', 'math-complements']);
		expect(cible(res, 'math', 'math-complements')!.seances).toBeNull();
	});

	it('à égalité complète : ordre alphabétique français, indépendant de l’ordre des clés', () => {
		const t = AUJ(9, 0);
		const attendu = ['Complément à 10/100/1000', 'Doubles', 'Moitiés'];
		const res1 = travailRecent(
			{ 'math-moities@ce2': stat(t), 'math-doubles@ce2': stat(t), 'math-complements@ce2': stat(t) },
			[],
			null,
			2,
			NOW,
		);
		const res2 = travailRecent(
			{ 'math-complements@ce2': stat(t), 'math-moities@ce2': stat(t), 'math-doubles@ce2': stat(t) },
			[],
			null,
			2,
			NOW,
		);
		expect(labels(res1, 'math')).toEqual(attendu);
		expect(labels(res2, 'math')).toEqual(attendu); // deux rendus successifs = même liste
	});

	it('chaque matière est triée pour elle-même', () => {
		const predef = predefDeNiveau('ce2');
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(HIER(17, 0)), 'math-moities@ce2': stat(AUJ(9, 0)) },
			[seanceDictee(HIER(18, 0), predef.id)],
			null,
			2,
			NOW,
		);
		expect(ids(res, 'math')).toEqual(['math-moities', 'math-doubles']);
		expect(ids(res, 'francais')).toEqual([predef.id]);
	});
});

describe('travailRecentProfil — lecture des stores du profil consulté', () => {
	/* Écriture BRUTE par UUID, comme le fait l'app pour un profil non actif. */
	function ecrireStores(uuid: string, stats: unknown, activity: unknown) {
		lsSetRaw(uuid + '/' + LESSON_STATS_KEY, JSON.stringify(stats));
		lsSetRaw(uuid + '/' + ACTIVITY_KEY, JSON.stringify(activity));
	}

	it('lit le profil CONSULTÉ sans basculer l’actif', () => {
		const a = activeProfile();
		const b = addProfile('Profil B'); // devient actif
		ecrireStores(a.uuid, { 'math-doubles@ce2': stat(AUJ(9, 0)) }, [
			seanceLecon(AUJ(9, 0), 'math-doubles'),
		]);
		ecrireStores(b.uuid, { 'math-moities@ce2': stat(AUJ(9, 0)) }, []);
		const avant = loadProfilesMeta()!.active;

		const res = travailRecentProfil(profilRelu(a.uuid), 7, NOW);
		expect(ids(res, 'math')).toEqual(['math-doubles']);
		expect(cible(res, 'math', 'math-doubles')!.seances).toBe(1);
		expect(loadProfilesMeta()!.active).toBe(avant); // toujours B
	});

	it('leçon CE2 rejouée par un profil CM1 (stats @ce2) : NOMMÉE malgré le niveau suivi', () => {
		// Le trou que #520 ferme : la séance compte déjà dans le graphe d'activité, elle doit
		// donc être nommée ici. Chemins réels : favori, révision, épingle « à revoir ».
		const a = activeProfile();
		setNiveauReferenceFor(a.uuid, 'cm1');
		const p = profilRelu(a.uuid);
		expect(niveauProfilMatiere(p, 'math')).toBe('cm1'); // prémisse : le profil suit le CM1
		const ce2Seule = leconTelleQue(
			(l) => l.subject === 'math' && l.levels.includes('ce2') && !l.levels.includes('cm1'),
			'de maths CE2 absente du CM1',
		);
		ecrireStores(a.uuid, { [ce2Seule.id + '@ce2']: stat(AUJ(9, 0)) }, [
			seanceLecon(AUJ(9, 0), ce2Seule.id),
		]);

		const res = travailRecentProfil(p, 7, NOW);
		expect(ids(res, 'math')).toEqual([ce2Seule.id]);
		expect(cible(res, 'math', ce2Seule.id)!.seances).toBe(1);
	});

	it('dictée CM1 travaillée par un profil CE2 : nommée aussi', () => {
		const a = activeProfile(); // français en CE2
		expect(niveauProfilMatiere(a, 'francais')).toBe('ce2');
		const cm1 = predefDeNiveau('cm1');
		ecrireStores(a.uuid, {}, [seanceDictee(AUJ(9, 0), cm1.id)]);
		expect(ids(travailRecentProfil(profilRelu(a.uuid), 7, NOW), 'francais')).toEqual([cm1.id]);
	});

	it('stats stockées avec une date absente ou non numérique → cible écartée', () => {
		const a = activeProfile();
		ecrireStores(
			a.uuid,
			{
				'math-doubles@ce2': { attempts: 1, correct: 1, questions: 1, bestPct: 100, lastPct: 100 },
				'math-moities@ce2': {
					attempts: 1,
					correct: 1,
					questions: 1,
					bestPct: 100,
					lastPct: 100,
					lastAt: 'hier',
				},
				'math-complements@ce2': {
					attempts: 1,
					correct: 1,
					questions: 1,
					bestPct: 100,
					lastPct: 100,
					lastAt: AUJ(9, 0),
				},
			},
			[],
		);
		const res = travailRecentProfil(profilRelu(a.uuid), 7, NOW);
		expect(ids(res, 'math')).toEqual(['math-complements']);
	});

	it('profil sans aucune donnée → aucun groupe', () => {
		expect(travailRecentProfil(activeProfile(), 7, NOW)).toEqual([]);
	});
});
