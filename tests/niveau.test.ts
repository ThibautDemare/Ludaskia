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
import { nettoyerSaisieNombre } from '../src/core/nombres';
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
import {
	gSnapshot,
	evaluateTrophies,
	loadTrophies,
	TROPHIES,
	TROPHIES_KEY,
} from '../src/core/rewards';

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

/* Leçons dont le stockage est garanti hors du scope CM1 : elles ne sont pas
   disponibles au CM1, donc leur étoile reste rangée @ce2 même une fois la classe
   changée (niveauStockage = niveau de JEU de la leçon). */
const leconsCe2Seulement = () =>
	getAllLessons().filter((l) => l.levels.includes('ce2') && !l.levels.includes('cm1'));

describe('trophées « étoiles » sur le cumul tous niveaux (#559)', () => {
	it('gSnapshot expose le cumul tous niveaux À CÔTÉ du compte scopé au niveau actif', () => {
		const ce2Seulement = leconsCe2Seulement();
		expect(ce2Seulement.length).toBeGreaterThanOrEqual(5);
		setNiveauReference('ce2');
		for (const l of ce2Seulement.slice(0, 5)) recordLessonResult(l.id, true);
		expect(gSnapshot().stars).toBe(5);
		expect(gSnapshot().starsTousNiveaux).toBe(5);
		// Passage au CM1 : le compte scopé retombe à 0 (catalogue CM1 vierge)…
		setNiveauReference('cm1');
		expect(gSnapshot().stars).toBe(0);
		// …mais le cumul « trésor », lui, est celui que l'accueil met en avant.
		expect(gSnapshot().starsTousNiveaux).toBe(5);
	});

	it('critère 5 : un palier ⭐ se débloque sur le cumul alors que le niveau actif est à zéro', () => {
		setNiveauReference('ce2');
		for (const l of leconsCe2Seulement().slice(0, 5)) recordLessonResult(l.id, true);
		setNiveauReference('cm1');
		// L'enfant lit « ⭐ 5 étoiles gagnées » sur son accueil : « Étoile montante »
		// (5 étoiles) doit être acquise, sans quoi deux chiffres racontent deux histoires.
		expect(gSnapshot().stars).toBe(0);
		expect(evaluateTrophies().map((t) => t.id)).toContain('stars5');
	});

	it('le palier compte les étoiles de TOUTES les classes, pas celles de la meilleure', () => {
		const cm1Seulement = getAllLessons().filter(
			(l) => l.levels.includes('cm1') && !l.levels.includes('ce2'),
		);
		expect(cm1Seulement.length).toBeGreaterThanOrEqual(2);
		// 3 étoiles au CE2 + 2 au CM1 : aucune classe n'atteint 5 à elle seule, le cumul si.
		setNiveauReference('ce2');
		for (const l of leconsCe2Seulement().slice(0, 3)) recordLessonResult(l.id, true);
		setNiveauReference('cm1');
		for (const l of cm1Seulement.slice(0, 2)) recordLessonResult(l.id, true);
		expect(gSnapshot().stars).toBe(2);
		expect(gSnapshot().starsTousNiveaux).toBe(5);
		expect(evaluateTrophies().map((t) => t.id)).toContain('stars5');
	});

	it('rattrapage d’un profil existant : plusieurs paliers ⭐ franchis en UN seul appel', () => {
		// Brancher les paliers sur le cumul les rend plus faciles : un profil déjà ancien,
		// jamais réévalué depuis, peut franchir 5 ET 15 d'un coup. Aucun appel à
		// evaluateTrophies avant, pour reproduire ce rattrapage.
		const cm1Seulement = getAllLessons().filter(
			(l) => l.levels.includes('cm1') && !l.levels.includes('ce2'),
		);
		expect(leconsCe2Seulement().length).toBeGreaterThanOrEqual(10);
		expect(cm1Seulement.length).toBeGreaterThanOrEqual(6);
		setNiveauReference('ce2');
		for (const l of leconsCe2Seulement().slice(0, 10)) recordLessonResult(l.id, true);
		setNiveauReference('cm1');
		for (const l of cm1Seulement.slice(0, 6)) recordLessonResult(l.id, true);
		// 16 au cumul, dont 6 seulement au niveau actif : aucun niveau n'atteint 15 seul.
		expect(gSnapshot().stars).toBe(6);
		expect(gSnapshot().starsTousNiveaux).toBe(16);
		const nouveaux = evaluateTrophies().map((t) => t.id);
		// Les DEUX paliers franchis sont annoncés, pas seulement le plus haut ni le plus bas.
		expect(nouveaux).toContain('stars5');
		expect(nouveaux).toContain('stars15');
		expect(nouveaux).not.toContain('stars30'); // 30 non atteint
		// Et les deux sont persistés : c'est ce qui empêche de les re-annoncer ensuite.
		expect(loadTrophies()).toContain('stars5');
		expect(loadTrophies()).toContain('stars15');
		const encore = evaluateTrophies().map((t) => t.id);
		expect(encore).not.toContain('stars5');
		expect(encore).not.toContain('stars15');
	});

	it('critère 1 : les trois paliers ⭐ sont branchés sur le cumul, ids inchangés (critère 6)', () => {
		const surLeCumul = TROPHIES.filter((t) => t.metric === 'starsTousNiveaux');
		expect(surLeCumul.map((t) => t.id)).toEqual(['stars5', 'stars15', 'stars30']);
		expect(surLeCumul.map((t) => t.n)).toEqual([5, 15, 30]);
		// Plus aucun palier ne reste sur la métrique scopée au niveau actif.
		expect(TROPHIES.filter((t) => t.metric === 'stars').map((t) => t.id)).toEqual([]);
	});

	it('les descriptions des trois paliers ⭐ parlent d’étoiles, et non de leçons', () => {
		// La métrique compte des paires (leçon, niveau) : « 5 leçons réussies sans faute »
		// serait faux, la même leçon étoilée au CE2 puis au CM1 comptant deux fois.
		const surLeCumul = TROPHIES.filter((t) => t.metric === 'starsTousNiveaux');
		expect(surLeCumul.length).toBe(3);
		for (const t of surLeCumul) {
			expect(t.desc).toMatch(/étoiles/);
			expect(t.desc).not.toMatch(/leçons?/);
		}
		// Le seuil annoncé reste celui du palier (courbe 5/15/30 inchangée).
		expect(surLeCumul.map((t) => t.desc.match(/\d+/)?.[0])).toEqual(['5', '15', '30']);
	});

	it('critère 6 : un palier ⭐ acquis ne se re-verrouille pas au changement de classe', () => {
		setNiveauReference('ce2');
		for (const l of leconsCe2Seulement().slice(0, 5)) recordLessonResult(l.id, true);
		expect(evaluateTrophies().map((t) => t.id)).toContain('stars5');
		setNiveauReference('cm1');
		const nouveaux = evaluateTrophies();
		expect(nouveaux.map((t) => t.id)).not.toContain('stars5');
		expect(nouveaux.map((t) => t.title)).not.toContain('Étoile montante');
		expect(loadTrophies()).toContain('stars5');
	});

	it('critère 6 : un trophée déjà stocké sous « stars5 » n’est jamais re-annoncé (id stable)', () => {
		// Profil existant, acquis AVANT le changement de métrique : si l'id du palier
		// changeait, ce trophée redeviendrait « nouveau » et serait re-célébré.
		lsSet(TROPHIES_KEY, ['stars5']);
		setNiveauReference('ce2');
		for (const l of leconsCe2Seulement().slice(0, 5)) recordLessonResult(l.id, true);
		const nouveaux = evaluateTrophies();
		expect(nouveaux.map((t) => t.title)).not.toContain('Étoile montante');
		expect(nouveaux.map((t) => t.id)).not.toContain('stars5');
	});

	it('critère 3 : « Sans faute partout » se débloque quand TOUT le catalogue de la classe est étoilé', () => {
		setNiveauReference('ce2');
		for (const l of getAllLessons().filter((l) => l.levels.includes('ce2')))
			recordLessonResult(l.id, true);
		const g = gSnapshot();
		expect(g.stars).toBe(g.totalLessons);
		expect(evaluateTrophies().map((t) => t.id)).toContain('starsAll');
	});

	it('critère 3 : un cumul supérieur au catalogue ne débloque PAS « Sans faute partout »', () => {
		// Tout le CE2 étoilé, puis passage au CM1 : le trésor dépasse le catalogue CM1…
		setNiveauReference('ce2');
		for (const l of getAllLessons().filter((l) => l.levels.includes('ce2')))
			recordLessonResult(l.id, true);
		setNiveauReference('cm1');
		const g = gSnapshot();
		expect(g.starsTousNiveaux).toBeGreaterThan(g.totalLessons);
		// …mais aucune leçon de la classe suivie n'est étoilée : « partout » reste faux.
		expect(g.stars).toBe(0);
		expect(evaluateTrophies().map((t) => t.id)).not.toContain('starsAll');
		expect(loadTrophies()).not.toContain('starsAll');
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

	it('numération calibrée : nombres plus grands en CM1 (millions) qu’en CE2', () => {
		const lesson = getLessonById('num-comparer')!;
		const maxValeur = (niveau: SchoolLevel) => {
			let max = 0;
			for (let i = 0; i < 300; i++) {
				const it = genLessonItem(lesson, niveau);
				// Les grands nombres sont groupés (#240, séparateur U+202F dès 10 000) : on
				// déspatialise pour extraire les nombres entiers (sinon « 12 345 » → 12, 345).
				for (const n of nettoyerSaisieNombre(it.text).match(/\d+/g) ?? [])
					max = Math.max(max, Number(n));
			}
			return max;
		};
		// CE2 : plage ≤ 999 (le cas charnière 999/1000 atteint au plus 1001 — GELÉE) ;
		// CM1 (#240) : grands nombres jusqu'au million → dépasse très largement le CE2.
		expect(maxValeur('ce2')).toBeLessThanOrEqual(1001);
		expect(maxValeur('cm1')).toBeGreaterThan(100000);
	});

	it('conjugaison : TOUT le corpus est ouvert aux 4 temps en CM1 (multi-niveau « identique », #239)', () => {
		// Les 13 verbes du corpus sont ouverts CM1 aux 4 temps (tag additif : le CE2 est
		// conservé). Vérifié sur quelques (verbe × temps) représentatifs, naître inclus.
		expect(getLessonById('fr-conj-etre-present')?.levels).toEqual(['ce2', 'cm1']);
		expect(getLessonById('fr-conj-aimer-imparfait')?.levels).toEqual(['ce2', 'cm1']);
		expect(getLessonById('fr-conj-aller-futur')?.levels).toEqual(['ce2', 'cm1']);
		expect(getLessonById('fr-conj-etre-passe_compose')?.levels).toEqual(['ce2', 'cm1']);
		// naître est dans le périmètre CM1 comme les autres (tout le corpus est CM1).
		expect(getLessonById('fr-conj-naitre-present')?.levels).toEqual(['ce2', 'cm1']);
		expect(getLessonById('fr-conj-naitre-passe_compose')?.levels).toEqual(['ce2', 'cm1']);
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
