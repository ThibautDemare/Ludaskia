/* ============================================================
   Niveau scolaire — Lot 1 (#225) : helpers de catalogue par niveau,
   persistance de `niveauReference` (méta de profil) et résolution du
   niveau actif. Profil/localStorage reconstruits avant chaque test.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { availableLevels, lessonsForLevel } from '../src/core/levels';
import {
	niveauActif,
	besoinChoixNiveau,
	niveauActifMatiere,
	niveauLecon,
} from '../src/core/niveau-actif';
import { getAllLessons, getLessonById, genLessonItem } from '../src/core/catalog';
import type { SchoolLevel } from '../src/core/catalog';
import {
	initProfiles,
	activeProfile,
	listProfiles,
	resetProfile,
	exportProfiles,
	importProfiles,
	getNiveauReference,
	setNiveauReference,
	getNiveauParMatiere,
	setNiveauMatiere,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsSet } from '../src/core/storage';
import {
	recordLessonResult,
	recordLessonStats,
	recordRun,
	loadRuns,
	loadRunsAll,
	countSince,
	starsEarned,
	starsEarnedAll,
	etoileAuxNiveaux,
	loadLessonStats,
	loadLessonStatsAll,
	loadLessonRevisions,
	avancerLessonRevision,
	migrateNiveauNamespacing,
	STARS_KEY,
	RUNS_KEY,
} from '../src/core/progress';
import { gSnapshot } from '../src/core/rewards';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('availableLevels / lessonsForLevel', () => {
	it('rend les niveaux présents, dédupliqués et triés par ordre scolaire', () => {
		const lessons: { levels: SchoolLevel[] }[] = [
			{ levels: ['cm1'] },
			{ levels: ['ce2', 'cm1'] },
			{ levels: ['ce2'] },
		];
		expect(availableLevels(lessons)).toEqual(['ce2', 'cm1']);
	});

	it('filtre les leçons par appartenance stricte au niveau', () => {
		const lessons: { id: string; levels: SchoolLevel[] }[] = [
			{ id: 'a', levels: ['ce2'] },
			{ id: 'b', levels: ['ce2', 'cm1'] },
			{ id: 'c', levels: ['cm1'] },
		];
		expect(lessonsForLevel(lessons, 'ce2').map((l) => l.id)).toEqual(['a', 'b']);
		expect(lessonsForLevel(lessons, 'cm1').map((l) => l.id)).toEqual(['b', 'c']);
	});

	it('le catalogue réel expose au moins le niveau CE2', () => {
		expect(availableLevels(getAllLessons())).toContain('ce2');
	});
});

describe('niveauReference (méta de profil)', () => {
	it('se lit après écriture', () => {
		expect(getNiveauReference()).toBeUndefined();
		setNiveauReference('ce2');
		expect(getNiveauReference()).toBe('ce2');
	});

	it('survit à « Réinitialiser » (vit dans la méta, pas dans les données)', () => {
		setNiveauReference('cm1');
		resetProfile(activeProfile().uuid);
		expect(getNiveauReference()).toBe('cm1');
	});

	it('est emporté par un export puis réimport (round-trip)', () => {
		const uuid = activeProfile().uuid;
		setNiveauReference('cm1');
		const payload = exportProfiles([uuid]);
		localStorage.clear();
		initProfiles(); // nouveau profil par défaut, uuid différent
		importProfiles(payload); // l'ancien profil revient comme inconnu
		const restored = listProfiles().find((p) => p.uuid === uuid);
		expect(restored?.niveauReference).toBe('cm1');
	});
});

describe('niveauActif / besoinChoixNiveau', () => {
	it('sans classe choisie, le niveau actif est un niveau disponible au catalogue', () => {
		expect(getNiveauReference()).toBeUndefined();
		expect(availableLevels(getAllLessons())).toContain(niveauActif());
	});

	it('retourne la classe choisie une fois fixée', () => {
		setNiveauReference('cm1');
		expect(niveauActif()).toBe('cm1');
	});

	it('ne redemande plus la classe une fois choisie', () => {
		setNiveauReference('ce2');
		expect(besoinChoixNiveau()).toBe(false);
	});
});

describe('namespacing de la progression par niveau (Lot 2)', () => {
	it('étoiles scopées au niveau actif, acquis CE2 conservé au passage en CM1', () => {
		setNiveauReference('ce2');
		recordLessonResult('math-doubles', true);
		expect(starsEarned()).toBe(1);
		// Passage au CM1 : l'étoile CE2 n'est pas comptée (scope CM1) mais reste stockée.
		setNiveauReference('cm1');
		expect(starsEarned()).toBe(0);
		// Retour au CE2 : l'acquis est conservé (pas de reset).
		setNiveauReference('ce2');
		expect(starsEarned()).toBe(1);
	});

	it('stats : effort GLOBAL (tous niveaux), complétude SCOPÉE au niveau actif', () => {
		// Leçon MULTI-NIVEAU (ce2+cm1) : le stockage est clampé au niveau de jeu, donc
		// le CE2 et le CM1 ont des entrées distinctes (une leçon CE2-only, elle, se
		// rangerait toujours @ce2 même jouée en CM1).
		setNiveauReference('ce2');
		recordLessonStats({ 'num-comparer': { ok: 5, total: 5 } });
		setNiveauReference('cm1');
		recordLessonStats({ 'num-comparer': { ok: 3, total: 4 } });
		// Agrégat global = somme des deux niveaux.
		expect(loadLessonStatsAll()['num-comparer'].questions).toBe(9);
		// Vue scopée = niveau actif seulement.
		expect(loadLessonStats()['num-comparer'].questions).toBe(4);
		setNiveauReference('ce2');
		expect(loadLessonStats()['num-comparer'].questions).toBe(5);
	});

	it('starsEarnedAll : cumul tous niveaux, ne baisse jamais au changement de classe', () => {
		setNiveauReference('ce2');
		recordLessonResult('num-comparer', true); // étoile @ce2
		setNiveauReference('cm1');
		recordLessonResult('num-comparer', true); // étoile @cm1 (leçon multi-niveau)
		// Deux entrées distinctes (num-comparer@ce2 + @cm1) → trésor = 2.
		expect(starsEarnedAll()).toBe(2);
		// Le cumul est indépendant du niveau actif : aucun succès ne « disparaît ».
		setNiveauReference('ce2');
		expect(starsEarnedAll()).toBe(2);
		// alors que la vue scopée, elle, ne montre que le niveau courant.
		expect(starsEarned()).toBe(1);
	});

	it('etoileAuxNiveaux : niveaux où la leçon est étoilée (badge « déjà maîtrisée »)', () => {
		expect(etoileAuxNiveaux('num-comparer')).toEqual([]);
		setNiveauReference('ce2');
		recordLessonResult('num-comparer', true);
		setNiveauReference('cm1');
		recordLessonResult('num-comparer', true);
		expect([...etoileAuxNiveaux('num-comparer')].sort()).toEqual(['ce2', 'cm1']);
	});

	it('état de révision SR scopé au niveau actif', () => {
		const now = 1_000_000;
		setNiveauReference('ce2');
		avancerLessonRevision('math-doubles', true, now);
		expect(loadLessonRevisions()['math-doubles']).toBeDefined();
		setNiveauReference('cm1');
		expect(loadLessonRevisions()['math-doubles']).toBeUndefined();
	});

	it('migration : renomme les clés legacy (sans @) en @ce2, idempotente', () => {
		// Mélange d'une clé legacy (pleine) et d'une clé déjà namespacée.
		lsSet(STARS_KEY, { 'math-doubles': 2, 'math-complements@ce2': 1 });
		migrateNiveauNamespacing();
		expect(lsGet(STARS_KEY, {})).toEqual({ 'math-doubles@ce2': 2, 'math-complements@ce2': 1 });
		// Idempotent : un second passage ne change rien.
		migrateNiveauNamespacing();
		expect(lsGet(STARS_KEY, {})).toEqual({ 'math-doubles@ce2': 2, 'math-complements@ce2': 1 });
	});
});

describe('records de sprint scopés par niveau (#233)', () => {
	it('classement scopé au niveau actif, record CE2 conservé au passage en CM1', () => {
		setNiveauReference('ce2');
		recordRun('sprint', 8, 10, 300000);
		expect(loadRuns('sprint').length).toBe(1);
		// Passage au CM1 : le classement repart de zéro (records non comparables) mais
		// le record CE2 reste stocké.
		setNiveauReference('cm1');
		expect(loadRuns('sprint').length).toBe(0);
		recordRun('sprint', 12, 15, 280000);
		expect(loadRuns('sprint').length).toBe(1);
		// Retour au CE2 : le record d'origine est intact (pas d'écrasement).
		setNiveauReference('ce2');
		expect(loadRuns('sprint').length).toBe(1);
		expect(loadRuns('sprint')[0].ok).toBe(8);
	});

	it('recordRun : rang/médaille calculés sur le classement du niveau actif', () => {
		setNiveauReference('cm1');
		recordRun('sprint', 5, 10, 400000);
		recordRun('sprint', 7, 10, 380000);
		const r = recordRun('sprint', 9, 10, 360000); // meilleur score CM1 → 1er, record
		expect(r.rank).toBe(1);
		expect(r.total).toBe(3);
		expect(r.medal).toBe(1);
		expect(r.isRecord).toBe(true);
	});

	it('loadRunsAll : agrège tous les niveaux (compteur d’effort global)', () => {
		setNiveauReference('ce2');
		recordRun('sprint', 8, 10, 300000);
		setNiveauReference('cm1');
		recordRun('sprint', 12, 15, 280000);
		// loadRuns ne voit que le niveau actif…
		expect(loadRuns('sprint').length).toBe(1);
		// …loadRunsAll voit les deux, quel que soit le niveau actif.
		expect(loadRunsAll('sprint').length).toBe(2);
		setNiveauReference('ce2');
		expect(loadRunsAll('sprint').length).toBe(2);
	});

	it('trophées d’effort (gSnapshot.sprints) globaux, ne se reverrouillent pas', () => {
		setNiveauReference('ce2');
		recordRun('sprint', 8, 10, 300000);
		setNiveauReference('cm1');
		recordRun('sprint', 12, 15, 280000);
		// Le compteur de sprints est global (2) même si le classement CM1 n'en montre qu'un.
		expect(gSnapshot().sprints).toBe(2);
		setNiveauReference('ce2');
		expect(gSnapshot().sprints).toBe(2);
	});

	it('régularité (countSince) globale : un sprint dans un autre niveau compte', () => {
		setNiveauReference('cm1');
		recordRun('sprint', 12, 15, 280000);
		setNiveauReference('ce2');
		// Aucun sprint CE2, mais le sprint CM1 compte pour la régularité (effort global).
		expect(loadRuns('sprint').length).toBe(0);
		expect(countSince('sprint', 0)).toBe(1);
	});

	it('migration : clé legacy globale ludaskia_runs_sprint → @ce2, idempotente', () => {
		setNiveauReference('ce2');
		// Données pré-#233 : clé GLOBALE sans niveau (tout l'existant était CE2).
		lsSet(RUNS_KEY('sprint'), [{ ts: 1, ok: 4, count: 5, ms: 300000 }]);
		migrateNiveauNamespacing();
		// La clé legacy est renommée et lisible comme record CE2.
		expect(loadRuns('sprint').length).toBe(1);
		expect(lsGet(RUNS_KEY('sprint'), null)).toBeNull(); // legacy supprimée
		expect(lsGet(`${RUNS_KEY('sprint')}@ce2`, []).length).toBe(1);
		// Idempotent : un second passage ne change rien.
		migrateNiveauNamespacing();
		expect(loadRuns('sprint').length).toBe(1);
	});
});

describe('contenu multi-niveau (Lot 3)', () => {
	it('le catalogue expose désormais CE2 et CM1', () => {
		expect(availableLevels(getAllLessons())).toContain('ce2');
		expect(availableLevels(getAllLessons())).toContain('cm1');
	});

	it('« Je compare les nombres » est calibrée CE2+CM1', () => {
		expect(getLessonById('num-comparer')?.levels).toEqual(['ce2', 'cm1']);
	});

	it('numération calibrée : nombres plus grands en CM1 qu’en CE2', () => {
		const lesson = getLessonById('num-comparer')!;
		const maxValeur = (niveau: SchoolLevel) => {
			let max = 0;
			for (let i = 0; i < 300; i++) {
				const it = genLessonItem(lesson, niveau);
				for (const n of it.text.match(/\d+/g) ?? []) max = Math.max(max, Number(n));
			}
			return max;
		};
		// CE2 : plage ≤ 999 (le cas charnière 999/1000 atteint au plus 1001) ;
		// CM1 : plage jusqu'à 9999 → dépasse nettement le CE2.
		expect(maxValeur('ce2')).toBeLessThanOrEqual(1001);
		expect(maxValeur('cm1')).toBeGreaterThan(1500);
	});

	it('le passé composé est ouvert au CM1 (multi-niveau « identique »)', () => {
		expect(getLessonById('fr-conj-etre-passe_compose')?.levels).toEqual(['ce2', 'cm1']);
		expect(getLessonById('fr-conj-etre-present')?.levels).toEqual(['ce2']);
	});
});

describe('niveau par matière (Lot 4)', () => {
	it('niveauActifMatiere : ajustement matière > référence > défaut catalogue', () => {
		expect(niveauActifMatiere('math')).toBe('ce2'); // rien choisi → plus bas dispo
		setNiveauReference('cm1');
		expect(niveauActifMatiere('math')).toBe('cm1'); // hérite de la classe
		expect(niveauActifMatiere('francais')).toBe('cm1');
		setNiveauMatiere('francais', 'ce2');
		expect(niveauActifMatiere('francais')).toBe('ce2'); // ajustement matière
		expect(niveauActifMatiere('math')).toBe('cm1'); // math suit toujours la classe
	});

	it('setNiveauMatiere(undefined) retire l’ajustement (héritage de la classe)', () => {
		setNiveauReference('cm1');
		setNiveauMatiere('francais', 'ce2');
		expect(getNiveauParMatiere().francais).toBe('ce2');
		setNiveauMatiere('francais', undefined);
		expect(getNiveauParMatiere().francais).toBeUndefined();
		expect(niveauActifMatiere('francais')).toBe('cm1');
	});

	it('export/import emporte niveauParMatiere', () => {
		const uuid = activeProfile().uuid;
		setNiveauReference('cm1');
		setNiveauMatiere('francais', 'ce2');
		const payload = exportProfiles([uuid]);
		localStorage.clear();
		initProfiles();
		importProfiles(payload);
		const restored = listProfiles().find((p) => p.uuid === uuid);
		expect(restored?.niveauParMatiere?.francais).toBe('ce2');
	});

	it('niveauLecon résout par la matière de la leçon', () => {
		setNiveauReference('cm1');
		setNiveauMatiere('math', 'ce2');
		// Math ajusté en CE2 → la leçon calibrée comparer reste en CE2.
		expect(niveauLecon(getLessonById('num-comparer')!)).toBe('ce2');
		// Français suit la classe (CM1) → passé composé en CM1.
		expect(niveauLecon(getLessonById('fr-conj-etre-passe_compose')!)).toBe('cm1');
	});
});
