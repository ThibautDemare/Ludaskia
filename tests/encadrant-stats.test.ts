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
	activiteParJourParType,
	echelleActivite,
	libelleDerniereFois,
	tendanceNotion,
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

describe('activiteParJourParType (répartition par type, #319)', () => {
	const NOW = 1_700_000_000_000; // instant fixe
	const JOUR = 86_400_000;
	it('ventile les 5 types dans le seau du jour, total = somme des types', () => {
		const j = activiteParJourParType(
			[
				{ t: NOW, k: 'lecon' },
				{ t: NOW, k: 'lecon' },
				{ t: NOW, k: 'sprint' },
				{ t: NOW, k: 'revision' },
				{ t: NOW, k: 'dictee' },
				{ t: NOW - JOUR, k: 'bilan' },
			],
			NOW,
		);
		expect(j.length).toBe(7);
		expect(j[6]).toEqual({
			total: 5,
			lecon: 2,
			bilan: 0,
			sprint: 1,
			revision: 1,
			dictee: 1,
			inconnu: 0,
		});
		expect(j[5]).toEqual({
			total: 1,
			lecon: 0,
			bilan: 1,
			sprint: 0,
			revision: 0,
			dictee: 0,
			inconnu: 0,
		});
		// Invariant : total == somme des types, pour chaque jour.
		for (const d of j)
			expect(d.total).toBe(d.lecon + d.bilan + d.sprint + d.revision + d.dictee + d.inconnu);
	});
	it('tolère l’ANCIEN format (nombres) → type « inconnu »', () => {
		const j = activiteParJourParType([NOW, NOW], NOW);
		expect(j[6]).toEqual({
			total: 2,
			lecon: 0,
			bilan: 0,
			sprint: 0,
			revision: 0,
			dictee: 0,
			inconnu: 2,
		});
	});
	it('mélange ancien (nombre) et nouveau (objet typé)', () => {
		const j = activiteParJourParType([NOW, { t: NOW, k: 'sprint' }], NOW);
		expect(j[6].total).toBe(2);
		expect(j[6].inconnu).toBe(1);
		expect(j[6].sprint).toBe(1);
	});
	it('au-delà de 7 jours : exclu', () => {
		const j = activiteParJourParType([{ t: NOW - 7 * JOUR, k: 'lecon' }], NOW);
		expect(j.reduce((s, d) => s + d.total, 0)).toBe(0);
	});
	it('le totaux dérivés (activiteParJour) restent cohérents', () => {
		const entries = [
			{ t: NOW, k: 'lecon' as const },
			{ t: NOW, k: 'bilan' as const },
		];
		expect(activiteParJour(entries, NOW)).toEqual(
			activiteParJourParType(entries, NOW).map((d) => d.total),
		);
	});
	it('accepte un journal mixte (ancien nombre + nouvel objet) sans casser le typage', () => {
		const j = activiteParJourParType([NOW, { t: NOW, k: 'sprint' }], NOW);
		expect(j[6]).toEqual({
			total: 2,
			lecon: 0,
			bilan: 0,
			sprint: 1,
			revision: 0,
			dictee: 0,
			inconnu: 1,
		});
	});
});

describe('echelleActivite (graduations « rondes », #319)', () => {
	it('max ≤ 5 → pas de 1, sommet = max', () => {
		expect(echelleActivite(3)).toEqual({ top: 3, step: 1, ticks: [3, 2, 1, 0] });
		expect(echelleActivite(5)).toEqual({ top: 5, step: 1, ticks: [5, 4, 3, 2, 1, 0] });
	});
	it('max grand → pas ≈ max/4, sommet = multiple du pas ≥ max (≤ 5 graduations)', () => {
		const e = echelleActivite(10); // step = ceil(10/4) = 3 → top = 12
		expect(e.step).toBe(3);
		expect(e.top).toBe(12);
		expect(e.ticks).toEqual([12, 9, 6, 3, 0]);
		expect(e.top).toBeGreaterThanOrEqual(10);
	});
	it('borne basse : max 0 ou 1 → échelle 0..1', () => {
		expect(echelleActivite(0)).toEqual({ top: 1, step: 1, ticks: [1, 0] });
		expect(echelleActivite(1)).toEqual({ top: 1, step: 1, ticks: [1, 0] });
	});
});

describe('libelleDerniereFois (suivi « dernière fois travaillée »)', () => {
	const NOW = 1_700_000_000_000; // instant fixe
	const JOUR = 86_400_000;
	it('date inconnue (null) → chaîne vide', () => {
		expect(libelleDerniereFois(null, NOW)).toBe('');
	});
	it('même jour → aujourd’hui', () => {
		expect(libelleDerniereFois(NOW, NOW)).toBe("aujourd'hui");
	});
	it('la veille → hier', () => {
		expect(libelleDerniereFois(NOW - JOUR, NOW)).toBe('hier');
	});
	it('2 à 7 jours → il y a N jours', () => {
		expect(libelleDerniereFois(NOW - 3 * JOUR, NOW)).toBe('il y a 3 jours');
		expect(libelleDerniereFois(NOW - 7 * JOUR, NOW)).toBe('il y a 7 jours');
	});
	it('bascule à J-8 : au-delà de 7 jours → date absolue « le … »', () => {
		expect(libelleDerniereFois(NOW - 8 * JOUR, NOW).startsWith('le ')).toBe(true);
		expect(libelleDerniereFois(NOW - 40 * JOUR, NOW).startsWith('le ')).toBe(true);
	});
});

describe('progressionProfil : vues + dernière fois par leçon', () => {
	it('expose le nombre de sessions travaillées et l’horodatage de la dernière', () => {
		const a = activeProfile();
		recordLessonStats({ 'math-complements': { ok: 5, total: 10 } });
		recordLessonStats({ 'math-complements': { ok: 6, total: 10 } });
		const recap = progressionProfil(a, Date.now());
		const notion = recap.parCategorie
			.flatMap((c) => c.lecons)
			.find((l) => l.lessonId === 'math-complements')!;
		expect(notion.vues).toBe(2);
		expect(typeof notion.derniereFois).toBe('number');
	});
	it('leçon jamais travaillée → vues 0 et derniereFois null', () => {
		const a = activeProfile();
		const notion = recap0LeconVierge(progressionProfil(a, Date.now()));
		expect(notion.vues).toBe(0);
		expect(notion.derniereFois).toBeNull();
	});
});

/* Première leçon du récap n'ayant jamais été travaillée (0 vue). */
function recap0LeconVierge(recap: ReturnType<typeof progressionProfil>) {
	const notion = recap.parCategorie.flatMap((c) => c.lecons).find((l) => l.vues === 0);
	if (!notion) throw new Error('aucune leçon vierge dans le récap');
	return notion;
}

describe('tendanceNotion (direction récente)', () => {
	const statAvec = (recentPct?: number[]) => ({
		attempts: recentPct?.length ?? 0,
		correct: 0,
		questions: 10,
		bestPct: 0,
		lastPct: 0,
		recentPct,
	});
	it('null tant qu’il y a moins de 4 essais (le silence n’est pas un signal négatif)', () => {
		expect(tendanceNotion(undefined)).toBeNull();
		expect(tendanceNotion(statAvec([50, 60, 70]))).toBeNull();
	});
	it('progresse quand la 2de moitié de la fenêtre dépasse la 1re d’au moins le seuil', () => {
		expect(tendanceNotion(statAvec([40, 50, 80, 90]))).toBe('progresse');
	});
	it('gère la fenêtre max de 5 essais (découpage asymétrique 2 / 3)', () => {
		expect(tendanceNotion(statAvec([40, 50, 60, 70, 80]))).toBe('progresse'); // 45 → 70
		expect(tendanceNotion(statAvec([80, 80, 78, 76, 80]))).toBe('stable'); // 80 → 78
	});
	it('à relancer quand la 2de moitié chute d’au moins le seuil', () => {
		expect(tendanceNotion(statAvec([90, 80, 50, 40]))).toBe('a-relancer');
	});
	it('stable quand l’écart reste sous le seuil', () => {
		expect(tendanceNotion(statAvec([70, 75, 72, 78]))).toBe('stable');
	});
});

describe('progressionProfil : couverture (travaillées) par catégorie et matière', () => {
	it('travaillees = total − à découvrir, avec roll-up par matière', () => {
		const { a } = deuxProfils(); // A : math-doubles étoilée + math-complements 20 %
		const recap = progressionProfil(a, 1_700_000_000_000);
		const cm = recap.parCategorie.find((c) => c.categoryId === 'math-calcul-mental')!;
		expect(cm.travaillees).toBe(cm.acquis + cm.enCours + cm.nonAcquis);
		expect(cm.travaillees).toBe(cm.total - cm.aDecouvrir);
		expect(cm.travaillees).toBeGreaterThanOrEqual(2); // doubles + complements
		const math = recap.parMatiere.find((m) => m.subject === 'math')!;
		expect(math.label).toBe('Mathématiques');
		expect(math.total).toBeGreaterThanOrEqual(cm.total);
		expect(math.travaillees).toBeGreaterThanOrEqual(2);
		expect(math.acquis).toBeGreaterThanOrEqual(1); // math-doubles étoilée
	});
	it('parMatiere n’expose que des matières non vides au niveau du profil', () => {
		const { a } = deuxProfils();
		const recap = progressionProfil(a, 1_700_000_000_000);
		expect(recap.parMatiere.length).toBeGreaterThan(0);
		expect(recap.parMatiere.every((m) => m.total > 0)).toBe(true);
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
