/* ============================================================
   Espace encadrant (#234) — lecture de la progression PAR PROFIL.
   On vérifie l'INVARIANT clé : consulter un profil ne change jamais le profil
   actif ; le scoping par niveau du profil consulté ; l'échelle 4 niveaux ; le
   graphe d'activité ; la file « à revoir » (épinglage par UUID + auto-nettoyage).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	niveauNotion,
	activiteParJour,
	progressionProfil,
	niveauProfilMatiere,
	loadRevoir,
	loadRevoirFor,
	toggleRevoirFor,
	revoirActives,
} from '../src/core/encadrant-stats';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	loadProfilesMeta,
	setNiveauReferenceFor,
	setNiveauMatiereFor,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { recordLessonResult, recordLessonStats } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('niveauNotion (échelle 4 niveaux)', () => {
	it('étoilée → acquis (quelles que soient les stats)', () => {
		expect(niveauNotion(undefined, true)).toBe('acquis');
		expect(
			niveauNotion({ attempts: 1, correct: 0, questions: 5, bestPct: 0, lastPct: 0 }, true),
		).toBe('acquis');
	});
	it('jamais travaillée → à découvrir', () => {
		expect(niveauNotion(undefined, false)).toBe('a-decouvrir');
		expect(
			niveauNotion({ attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 }, false),
		).toBe('a-decouvrir');
	});
	it('perf récente < 40 % → non acquis ; ≥ 40 % → en cours', () => {
		const bas = {
			attempts: 2,
			correct: 5,
			questions: 20,
			bestPct: 30,
			lastPct: 20,
			recentPct: [20, 30],
		};
		const haut = {
			attempts: 2,
			correct: 16,
			questions: 20,
			bestPct: 90,
			lastPct: 80,
			recentPct: [80, 90],
		};
		expect(niveauNotion(bas, false)).toBe('non-acquis');
		expect(niveauNotion(haut, false)).toBe('en-cours');
	});
	it('repli sur le cumul si pas d’historique récent', () => {
		// 3/10 cumulé, aucune recentPct → 30 % → non acquis.
		expect(
			niveauNotion({ attempts: 1, correct: 3, questions: 10, bestPct: 30, lastPct: 30 }, false),
		).toBe('non-acquis');
	});
});

describe('activiteParJour', () => {
	const NOW = 1_700_000_000_000; // instant fixe
	const JOUR = 86_400_000;
	it('aujourd’hui compte dans le dernier seau', () => {
		const b = activiteParJour([NOW], NOW);
		expect(b.length).toBe(7);
		expect(b[6]).toBe(1);
		expect(b.reduce((s, x) => s + x, 0)).toBe(1);
	});
	it('au-delà de 7 jours : exclu', () => {
		expect(activiteParJour([NOW - 7 * JOUR], NOW).reduce((s, x) => s + x, 0)).toBe(0);
	});
	it('compte plusieurs sessions le même jour', () => {
		expect(activiteParJour([NOW, NOW, NOW], NOW)[6]).toBe(3);
	});
});

describe('niveauProfilMatiere (résolution par profil, sans actif)', () => {
	it('ajustement matière > référence > défaut', () => {
		const p = activeProfile();
		expect(niveauProfilMatiere(p, 'math')).toBe('ce2'); // défaut catalogue
		setNiveauReferenceFor(p.uuid, 'cm1');
		const p2 = loadProfilesMeta()!.list.find((x) => x.uuid === p.uuid)!;
		expect(niveauProfilMatiere(p2, 'math')).toBe('cm1');
		setNiveauMatiereFor(p.uuid, 'math', 'ce2');
		const p3 = loadProfilesMeta()!.list.find((x) => x.uuid === p.uuid)!;
		expect(niveauProfilMatiere(p3, 'math')).toBe('ce2');
		expect(niveauProfilMatiere(p3, 'francais')).toBe('cm1');
	});
});

/* Prépare deux profils avec des données distinctes ; renvoie {a, b}. À la sortie,
   le profil ACTIF est B (le dernier créé). */
function deuxProfils(): { a: Profile; b: Profile } {
	const a = activeProfile(); // « Profil 1 » (actif après initProfiles)
	recordLessonResult('math-doubles', true); // étoile @ce2 → acquis
	recordLessonStats({ 'math-complements': { ok: 2, total: 10 } }); // 20 % → non acquis, à revoir
	const b = addProfile('Profil B'); // devient actif
	recordLessonStats({ 'math-doubles': { ok: 8, total: 10 } }); // données différentes pour B
	return { a, b };
}

describe('progressionProfil (lecture par UUID)', () => {
	it('lit les données du profil CONSULTÉ, pas de l’actif', () => {
		const { a } = deuxProfils();
		expect(activeProfile().name).toBe('Profil B'); // l'actif est bien B
		const recap = progressionProfil(a, 1_700_000_000_000);
		expect(recap.uuid).toBe(a.uuid);
		expect(recap.totalMaitrisees).toBeGreaterThanOrEqual(1); // math-doubles étoilée chez A
		expect(recap.aRevoir.some((n) => n.lessonId === 'math-complements')).toBe(true);
		const cm = recap.parCategorie.find((c) => c.categoryId === 'math-calcul-mental');
		expect(cm).toBeTruthy();
		expect(cm!.acquis).toBeGreaterThanOrEqual(1);
		expect(cm!.nonAcquis).toBeGreaterThanOrEqual(1);
		// Détail par leçon exposé (dépliage + épinglage de n'importe quelle leçon).
		expect(cm!.lecons.length).toBe(cm!.total);
		expect(cm!.lecons.find((l) => l.lessonId === 'math-doubles')?.niveau).toBe('acquis');
		expect(cm!.lecons.find((l) => l.lessonId === 'math-complements')?.niveau).toBe('non-acquis');
	});

	it('INVARIANT : consulter ne change pas le profil actif', () => {
		const { a } = deuxProfils();
		const avant = loadProfilesMeta()!.active;
		progressionProfil(a, 1_700_000_000_000);
		expect(loadProfilesMeta()!.active).toBe(avant); // toujours B
		expect(activeProfile().name).toBe('Profil B');
	});

	it('« à revoir » trié, le plus fragile d’abord', () => {
		const { a } = deuxProfils();
		// A a une 2e leçon faible, plus haute que math-complements (20 %).
		setActiveProfile(a.uuid);
		recordLessonStats({ 'math-moities': { ok: 6, total: 10 } }); // 60 %
		const recap = progressionProfil(a, 1_700_000_000_000);
		const ids = recap.aRevoir.map((n) => n.lessonId);
		expect(ids.indexOf('math-complements')).toBeLessThan(ids.indexOf('math-moities'));
	});
});

describe('file « à revoir » (épinglage par UUID)', () => {
	it('toggleRevoirFor écrit dans le profil ciblé, pas dans l’actif', () => {
		const { a } = deuxProfils(); // actif = B
		toggleRevoirFor(a.uuid, 'math-complements');
		expect(loadRevoirFor(a.uuid)).toContain('math-complements');
		expect(loadRevoir()).not.toContain('math-complements'); // file de l'actif (B) intacte
		expect(activeProfile().name).toBe('Profil B'); // pas de bascule
		toggleRevoirFor(a.uuid, 'math-complements'); // dé-épingle
		expect(loadRevoirFor(a.uuid)).not.toContain('math-complements');
	});

	it('revoirActives : épinglée et faible → présente ; ré-étoilée → retirée', () => {
		const { a } = deuxProfils();
		setActiveProfile(a.uuid); // on regarde la file de A en contexte actif
		toggleRevoirFor(a.uuid, 'math-complements');
		expect(revoirActives().some((l) => l.id === 'math-complements')).toBe(true);
		// L'enfant réussit la leçon sans faute → acquise → quitte la boucle.
		recordLessonResult('math-complements', true);
		expect(revoirActives().some((l) => l.id === 'math-complements')).toBe(false);
	});
});
