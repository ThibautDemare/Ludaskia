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
	epingleesProfil,
	listesOrthoProfil,
	niveauEpingle,
	orthoRevoirId,
	type NiveauNotion,
	type RecapProfil,
	type RecapCategorie,
	type RecapNotion,
	type RecapListeOrtho,
	type EpingleEntry,
} from '../src/core/encadrant-stats';
import { getAllLessons, type LessonDef, type SchoolLevel } from '../src/core/catalog';
import { createListe, loadOrtho, saveOrtho } from '../src/core/orthographe/store';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
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

/* ============================================================
   Entrée ÉPINGLÉE (#518) — état d'acquisition affiché, et motif quand il manque.
   ------------------------------------------------------------
   Attendus dérivés du BESOIN (« l'adulte doit pouvoir juger s'il retire
   l'épingle »), pas de l'implémentation. Deux responsabilités DISTINCTES :
   - `niveauEpingle` rend l'état que le suivi porte DÉJÀ pour la cible (récap pour
     une leçon, suivi des dictées pour une liste) ; son `null` dit seulement
     « aucun état disponible » — jamais « pas encore travaillée », qui est un état
     à part entière ('a-decouvrir') ;
   - `EpingleEntry.horsNiveau` porte le MOTIF de cette absence, calculé là où le
     niveau de la cible est connu. C'est lui qui autorise l'UI à écrire « hors
     niveau » ; un `null` sans `horsNiveau` reste muet côté UI.

   Trois familles de cas :
   - résolution pure de `niveauEpingle`, sur des récaps MINIMAUX construits à la
     main (la fonction est pure : inutile de passer par le stockage) ;
   - `horsNiveau` posé par `epingleesProfil`, cibles choisies DYNAMIQUEMENT dans le
     catalogue (les deux espaces n'ont pas la même règle de niveau : membership
     EXACTE pour une leçon, filtrage CUMULATIF pour une dictée prédéfinie) ;
   - branchement RÉEL des trois vues, où l'on vérifie que les deux mécanismes ne
     divergent pas : état manquant ⇔ hors niveau.
   ============================================================ */

const NOW_EP = 1_700_000_000_000; // instant fixe (aucune dépendance à l'horloge)

/* Les 4 crans de l'échelle de maîtrise (maitrise.ts) : aucun ne doit être avalé. */
const CRANS: NiveauNotion[] = ['a-decouvrir', 'non-acquis', 'en-cours', 'acquis'];

function notionEp(lessonId: string, niveau: NiveauNotion): RecapNotion {
	return {
		lessonId,
		label: 'Leçon ' + lessonId,
		niveau,
		pctRecent: null,
		epingle: true,
		vues: 0,
		derniereFois: null,
		tendance: null,
		blocages: 0,
	};
}
function categorieEp(categoryId: string, lecons: RecapNotion[]): RecapCategorie {
	return {
		categoryId,
		label: 'Catégorie ' + categoryId,
		subject: 'math',
		acquis: 0,
		enCours: 0,
		nonAcquis: 0,
		aDecouvrir: 0,
		total: lecons.length,
		travaillees: 0,
		lecons,
	};
}
function recapEp(parCategorie: RecapCategorie[]): RecapProfil {
	return {
		uuid: 'uuid-test',
		parMatiere: [],
		parCategorie,
		totalMaitrisees: 0,
		totalLecons: 0,
		nouvellesRecentes: 0,
		aRevoir: [],
		activite7j: [],
		frises: [],
	};
}
function listeEp(id: string, niveau: NiveauNotion): RecapListeOrtho {
	return {
		id,
		label: 'Liste ' + id,
		source: 'liste',
		niveau,
		epingle: true,
		nbMots: 0,
		maitrises: 0,
		mots: [],
	};
}
/* `horsNiveau` est le MOTIF d'un état manquant (#518), pas une clé de recherche :
   niveauEpingle ne le lit pas. On le laisse donc à false par défaut ici, et on éprouve
   sa valeur là où elle se calcule (epingleesProfil, plus bas). */
const epLecon = (id: string, horsNiveau = false): EpingleEntry => ({
	kind: 'lecon',
	id,
	label: 'Leçon ' + id,
	horsNiveau,
});
const epOrtho = (id: string, horsNiveau = false): EpingleEntry => ({
	kind: 'ortho',
	id,
	label: 'Liste ' + id,
	horsNiveau,
});

describe('niveauEpingle — résolution d’une leçon dans le récap', () => {
	it('rend l’état porté par le récap, pour CHACUN des 4 crans', () => {
		for (const cran of CRANS) {
			const recap = recapEp([categorieEp('math-calcul', [notionEp('math-x', cran)])]);
			expect(niveauEpingle(epLecon('math-x'), recap, [])).toBe(cran);
		}
	});

	it('cherche à travers TOUTES les catégories, pas seulement la première', () => {
		const recap = recapEp([
			categorieEp('cat-1', [notionEp('math-a', 'acquis')]),
			categorieEp('cat-2', [notionEp('math-b', 'en-cours')]),
			categorieEp('cat-3', [notionEp('math-c', 'non-acquis')]),
		]);
		expect(niveauEpingle(epLecon('math-c'), recap, [])).toBe('non-acquis');
		// Et la 1re catégorie ne « gagne » pas par position : chaque cible garde son état.
		expect(niveauEpingle(epLecon('math-a'), recap, [])).toBe('acquis');
		expect(niveauEpingle(epLecon('math-b'), recap, [])).toBe('en-cours');
	});

	it('leçon absente du récap → null', () => {
		const recap = recapEp([categorieEp('cat-1', [notionEp('math-a', 'acquis')])]);
		expect(niveauEpingle(epLecon('math-inconnue'), recap, [])).toBeNull();
	});

	it('cas dégénérés : récap sans catégorie, catégorie sans leçon → null', () => {
		expect(niveauEpingle(epLecon('math-a'), recapEp([]), [])).toBeNull();
		expect(niveauEpingle(epLecon('math-a'), recapEp([categorieEp('vide', [])]), [])).toBeNull();
		// Une catégorie vide en tête n'interrompt pas la recherche dans les suivantes.
		const recap = recapEp([
			categorieEp('vide', []),
			categorieEp('cat', [notionEp('math-a', 'acquis')]),
		]);
		expect(niveauEpingle(epLecon('math-a'), recap, [])).toBe('acquis');
	});
});

describe('niveauEpingle — résolution d’une liste de dictée', () => {
	it('rend le niveau de la liste (échelle des dictées : 3 crans sur 4)', () => {
		// L'échelle des dictées n'émet jamais 'non-acquis' (cf. avancementLecon).
		for (const cran of ['a-decouvrir', 'en-cours', 'acquis'] as NiveauNotion[]) {
			expect(niveauEpingle(epOrtho('l-1'), recapEp([]), [listeEp('l-1', cran)])).toBe(cran);
		}
	});

	it('liste absente des listes suivies → null ; listes vides → null', () => {
		expect(niveauEpingle(epOrtho('l-1'), recapEp([]), [listeEp('l-2', 'acquis')])).toBeNull();
		expect(niveauEpingle(epOrtho('l-1'), recapEp([]), [])).toBeNull();
	});

	it('trouve la liste où qu’elle soit dans la collection (dernière position)', () => {
		const listes = [
			listeEp('l-1', 'acquis'),
			listeEp('l-2', 'a-decouvrir'),
			listeEp('l-3', 'en-cours'),
		];
		expect(niveauEpingle(epOrtho('l-3'), recapEp([]), listes)).toBe('en-cours');
	});
});

describe('niveauEpingle — les deux espaces d’identifiants ne se marchent pas dessus', () => {
	it('un id présent des DEUX côtés : c’est le kind qui décide', () => {
		const recap = recapEp([categorieEp('cat', [notionEp('doublon', 'acquis')])]);
		const listes = [listeEp('doublon', 'a-decouvrir')];
		expect(niveauEpingle(epLecon('doublon'), recap, listes)).toBe('acquis');
		expect(niveauEpingle(epOrtho('doublon'), recap, listes)).toBe('a-decouvrir');
	});

	it('une entrée ortho ne pioche JAMAIS dans le récap des leçons (et l’inverse)', () => {
		const recap = recapEp([categorieEp('cat', [notionEp('math-a', 'acquis')])]);
		// 'math-a' existe comme leçon, mais l'entrée se dit dictée → aucune liste ne matche.
		expect(niveauEpingle(epOrtho('math-a'), recap, [])).toBeNull();
		// Symétrique : une liste de dictée n'est pas résolue comme leçon du catalogue.
		expect(niveauEpingle(epLecon('l-1'), recapEp([]), [listeEp('l-1', 'acquis')])).toBeNull();
	});
});

/* Profil RELU depuis la méta : un changement de niveau ne rétro-agit pas sur l'objet
   déjà en main, et toutes les vues encadrant lisent le profil qu'on leur passe. */
function profilRelu(uuid: string): Profile {
	const p = loadProfilesMeta()!.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
/* Cibles choisies DYNAMIQUEMENT dans le catalogue : un id en dur mentirait dès qu'une
   leçon change de niveau. `throw` explicite si le catalogue ne fournit plus le cas. */
function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi);
	return l;
}
function predefDeNiveau(niveau: SchoolLevel) {
	const d = ORTHO_PREDEF.find((x) => x.niveau === niveau);
	if (!d) throw new Error('aucune dictée prédéfinie ' + niveau);
	return d;
}

describe('epingleesProfil — horsNiveau, le MOTIF d’un état manquant', () => {
	it('leçon du niveau suivi → false, qu’elle soit travaillée ou jamais ouverte', () => {
		const p = activeProfile();
		expect(niveauProfilMatiere(p, 'math')).toBe('ce2'); // prémisse : profil par défaut
		const vierge = leconTelleQue((l) => l.levels.includes('ce2'), 'de niveau CE2');
		const travaillee = leconTelleQue(
			(l) => l.levels.includes('ce2') && l.id !== vierge.id,
			'de niveau CE2 (2de)',
		);
		recordLessonStats({ [travaillee.id]: { ok: 3, total: 10 } });
		toggleRevoirFor(p.uuid, vierge.id);
		toggleRevoirFor(p.uuid, travaillee.id);

		const ep = epingleesProfil(profilRelu(p.uuid));
		// « Jamais travaillée » n'est PAS « hors niveau » : c'est tout le piège de #518.
		expect(ep.find((x) => x.id === vierge.id)!.horsNiveau).toBe(false);
		expect(ep.find((x) => x.id === travaillee.id)!.horsNiveau).toBe(false);
	});

	it('leçon dont levels EXCLUT le niveau du profil → true', () => {
		const p = activeProfile(); // CE2
		const cm1Seule = leconTelleQue(
			(l) => !l.levels.includes('ce2') && l.levels.includes('cm1'),
			'CM1 absente du CE2',
		);
		toggleRevoirFor(p.uuid, cm1Seule.id);
		expect(epingleesProfil(profilRelu(p.uuid)).find((x) => x.id === cm1Seule.id)!.horsNiveau).toBe(
			true,
		);
	});

	it('profil CM1 : une leçon CE2 SEULE devient hors niveau (membership EXACTE, pas cumulative)', () => {
		// Asymétrie ASSUMÉE avec les dictées (cumulatives) : une leçon qui reste utile en CM1
		// porte les deux niveaux dans le catalogue, donc l'appartenance exacte suffit.
		const p = activeProfile();
		setNiveauReferenceFor(p.uuid, 'cm1');
		const ce2Seule = leconTelleQue(
			(l) => l.levels.includes('ce2') && !l.levels.includes('cm1'),
			'CE2 absente du CM1',
		);
		const deuxNiveaux = leconTelleQue(
			(l) => l.levels.includes('ce2') && l.levels.includes('cm1'),
			'portant CE2 et CM1',
		);
		toggleRevoirFor(p.uuid, ce2Seule.id);
		toggleRevoirFor(p.uuid, deuxNiveaux.id);

		const ep = epingleesProfil(profilRelu(p.uuid));
		expect(ep.find((x) => x.id === ce2Seule.id)!.horsNiveau).toBe(true);
		expect(ep.find((x) => x.id === deuxNiveaux.id)!.horsNiveau).toBe(false);
	});

	it('le niveau lu est celui de la MATIÈRE de la cible, pas la classe de référence', () => {
		// Ajustement par matière (#225) : français en CM1, maths laissées en CE2.
		const p = activeProfile();
		setNiveauMatiereFor(p.uuid, 'francais', 'cm1');
		const frCm1 = leconTelleQue(
			(l) => l.subject === 'francais' && l.levels.includes('cm1') && !l.levels.includes('ce2'),
			'de français CM1 absente du CE2',
		);
		const mathCe2 = leconTelleQue(
			(l) => l.subject === 'math' && l.levels.includes('ce2'),
			'de maths CE2',
		);
		toggleRevoirFor(p.uuid, frCm1.id);
		toggleRevoirFor(p.uuid, mathCe2.id);

		const ep = epingleesProfil(profilRelu(p.uuid));
		expect(ep.find((x) => x.id === frCm1.id)!.horsNiveau).toBe(false); // français suivi en CM1
		expect(ep.find((x) => x.id === mathCe2.id)!.horsNiveau).toBe(false); // maths toujours en CE2
	});

	it('dictée prédéfinie de niveau INFÉRIEUR ou égal → false (filtrage cumulatif)', () => {
		const p = activeProfile();
		setNiveauReferenceFor(p.uuid, 'cm1');
		const ce2 = predefDeNiveau('ce2');
		const cm1 = predefDeNiveau('cm1');
		toggleRevoirFor(p.uuid, orthoRevoirId(ce2.id));
		toggleRevoirFor(p.uuid, orthoRevoirId(cm1.id));

		const ep = epingleesProfil(profilRelu(p.uuid));
		// Révision spiralaire (#243) : un CM1 garde les dictées CE2 dans son périmètre.
		expect(ep.find((x) => x.id === ce2.id)!.horsNiveau).toBe(false);
		expect(ep.find((x) => x.id === cm1.id)!.horsNiveau).toBe(false);
	});

	it('dictée prédéfinie de niveau SUPÉRIEUR → true', () => {
		const p = activeProfile(); // français en CE2
		const cm1 = predefDeNiveau('cm1');
		toggleRevoirFor(p.uuid, orthoRevoirId(cm1.id));
		expect(epingleesProfil(profilRelu(p.uuid)).find((x) => x.id === cm1.id)!.horsNiveau).toBe(true);
	});

	it('liste CRÉÉE par le parent → jamais hors niveau, même après un changement de classe', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		saveOrtho(s);
		toggleRevoirFor(p.uuid, orthoRevoirId(l.id));
		expect(epingleesProfil(profilRelu(p.uuid)).find((x) => x.id === l.id)!.horsNiveau).toBe(false);
		// Aucun niveau ne tague une liste du parent : elle ne « sort » pas du périmètre.
		setNiveauReferenceFor(p.uuid, 'cm1');
		expect(epingleesProfil(profilRelu(p.uuid)).find((x) => x.id === l.id)!.horsNiveau).toBe(false);
	});
});

describe('entrée épinglée — branchement réel des trois vues', () => {
	/* Les trois vues telles que l'espace encadrant les assemble. */
	function vues(uuid: string) {
		const p = profilRelu(uuid);
		return {
			epinglees: epingleesProfil(p),
			recap: progressionProfil(p, NOW_EP),
			listes: listesOrthoProfil(p, false),
		};
	}

	it('leçon JAMAIS travaillée → « à découvrir », et surtout PAS null', () => {
		const p = activeProfile(); // aucune session enregistrée
		toggleRevoirFor(p.uuid, 'math-complements');
		const v = vues(p.uuid);
		const e = v.epinglees.find((x) => x.id === 'math-complements')!;
		expect(e.kind).toBe('lecon');
		const n = niveauEpingle(e, v.recap, v.listes);
		expect(n).not.toBeNull(); // le trou serait un bug : la leçon EST dans le périmètre suivi
		expect(n).toBe('a-decouvrir');
		// Prémisse du test : la leçon figure bien au récap, à 0 vue.
		const notion = v.recap.parCategorie
			.flatMap((c) => c.lecons)
			.find((l) => l.lessonId === 'math-complements')!;
		expect(notion.vues).toBe(0);
	});

	it('leçon travaillée : l’état affiché suit ce que l’enfant a réellement fait', () => {
		const p = activeProfile();
		recordLessonStats({ 'math-complements': { ok: 2, total: 10 } }); // 20 % → sous le seuil « non acquis »
		recordLessonResult('math-doubles', true); // réussie sans faute → étoilée
		toggleRevoirFor(p.uuid, 'math-complements');
		toggleRevoirFor(p.uuid, 'math-doubles'); // on peut épingler une leçon déjà acquise
		const v = vues(p.uuid);
		const etat = (id: string) =>
			niveauEpingle(
				v.epinglees.find((x) => x.id === id)!,
				v.recap,
				v.listes,
			);
		expect(etat('math-complements')).toBe('non-acquis');
		expect(etat('math-doubles')).toBe('acquis');
	});

	it('leçon HORS du niveau suivi → aucun état, et le motif est porté par horsNiveau', () => {
		const p = activeProfile();
		const hors = leconTelleQue(
			(l) => !l.levels.includes(niveauProfilMatiere(p, l.subject)),
			'hors du niveau du profil par défaut',
		);
		toggleRevoirFor(p.uuid, hors.id);
		const v = vues(p.uuid);
		// Prémisses : l'épingle est bien conservée (getLessonById ne filtre pas par niveau)…
		const e = v.epinglees.find((x) => x.id === hors.id);
		expect(e).toBeTruthy();
		// …mais la leçon n'est pas au récap (scopé au niveau du profil).
		expect(v.recap.parCategorie.flatMap((c) => c.lecons).some((l) => l.lessonId === hors.id)).toBe(
			false,
		);
		expect(niveauEpingle(e!, v.recap, v.listes)).toBeNull(); // « aucun état disponible »
		expect(e!.horsNiveau).toBe(true); // …et la RAISON, seule à autoriser l'UI à l'écrire
		// L'épingle ne revient jamais devant l'enfant : elle est bien inerte.
		expect(revoirActives().some((x) => x.id === hors.id)).toBe(false);
	});

	it('liste de dictée du parent, jamais commencée → « à découvrir » (pas null)', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		saveOrtho(s);
		toggleRevoirFor(p.uuid, orthoRevoirId(l.id));
		const v = vues(p.uuid);
		const e = v.epinglees.find((x) => x.kind === 'ortho' && x.id === l.id)!;
		expect(niveauEpingle(e, v.recap, v.listes)).toBe('a-decouvrir');
	});

	it('dictée prédéfinie HORS niveau (CM1 sur un profil CE2) → aucun état + horsNiveau', () => {
		const p = activeProfile(); // niveau français par défaut = CE2
		const cm1 = predefDeNiveau('cm1');
		toggleRevoirFor(p.uuid, orthoRevoirId(cm1.id));
		const v = vues(p.uuid);
		// L'entrée est résolue (le libellé d'une prédéfinie ne dépend pas du niveau)…
		const e = v.epinglees.find((x) => x.kind === 'ortho' && x.id === cm1.id);
		expect(e).toBeTruthy();
		// …mais le suivi des dictées ne couvre que le niveau du profil.
		expect(v.listes.some((x) => x.id === cm1.id)).toBe(false);
		expect(niveauEpingle(e!, v.recap, v.listes)).toBeNull();
		expect(e!.horsNiveau).toBe(true);
	});

	/* Le verrou qui remplace la déduction supprimée : les DEUX mécanismes (état lu dans les
	   vues d'un côté, motif calculé depuis le niveau de la cible de l'autre) doivent dire la
	   même chose de la même épingle. S'ils divergent, l'UI affiche soit un badge vide sans
	   explication, soit « hors niveau » sur une notion du bon niveau — les deux silencieux. */
	it('INVARIANT : état manquant ⇔ horsNiveau, sur une file mêlant tous les cas', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const maListe = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		saveOrtho(s);
		const duNiveau = leconTelleQue((l) => l.levels.includes('ce2'), 'de niveau CE2');
		const horsNiv = leconTelleQue((l) => !l.levels.includes('ce2'), 'hors CE2');
		const predefCe2 = predefDeNiveau('ce2');
		const predefCm1 = predefDeNiveau('cm1');
		recordLessonStats({ [duNiveau.id]: { ok: 3, total: 10 } });
		for (const id of [
			duNiveau.id,
			horsNiv.id,
			orthoRevoirId(maListe.id),
			orthoRevoirId(predefCe2.id),
			orthoRevoirId(predefCm1.id),
		])
			toggleRevoirFor(p.uuid, id);

		const v = vues(p.uuid);
		expect(v.epinglees).toHaveLength(5); // les 5 cibles se résolvent, aucune n'est écartée
		for (const e of v.epinglees)
			expect(niveauEpingle(e, v.recap, v.listes) === null).toBe(e.horsNiveau);
		// L'invariant n'est pas creux : la file contient bien les deux situations.
		expect(v.epinglees.filter((e) => e.horsNiveau)).toHaveLength(2); // leçon CM1 + dictée CM1
		expect(v.epinglees.filter((e) => !e.horsNiveau)).toHaveLength(3);
	});
});
