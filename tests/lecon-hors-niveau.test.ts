/* ============================================================
   Désigner une leçon d'une AUTRE classe que celle suivie (#556) — cœur logique.
   ------------------------------------------------------------
   Cibles : origineLecon / epingleesProfil / revoirActives (core/encadrant-stats),
   scopeStockage / etoilesParNiveau (core/progress).

   Auteur des tests DISTINCT de l'auteur du code. Les attendus sont dérivés du contrat
   fonctionnel :
   - une épingle hors classe n'est plus INERTE : elle revient sur l'accueil de l'enfant,
     dans les DEUX sens (une notion de la classe précédente à consolider, une notion de la
     classe suivante prise en avance) ;
   - son avancement se lit LÀ OÙ elle est jouée et stockée. Une leçon CE2 épinglée pour un
     CM1 est jouée en CE2 : la lire au niveau de la classe suivie la ferait paraître
     éternellement « jamais travaillée », donc jamais solide, donc jamais sortie de la
     boucle — un piège silencieux ;
   - ce qu'on MONTRE de cet avancement dépend du sens de l'écart : état d'acquisition en
     dessous et à la classe suivie ; compte-rendu FACTUEL au-dessus, où « à renforcer »
     jugerait une notion pas encore enseignée et « acquis » se prononcerait sur un essai.

   Cibles choisies DYNAMIQUEMENT dans le catalogue : un id en dur mentirait dès qu'une
   leçon change de classe.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	origineLecon,
	epingleesProfil,
	revoirActives,
	niveauProfilMatiere,
	progressionProfil,
	toggleRevoirFor,
	orthoRevoirId,
	type EpingleEntry,
} from '../src/core/encadrant-stats';
import {
	recordLessonResult,
	recordLessonStats,
	etoilesParNiveau,
	scopeActif,
	scopeStockage,
	loadStarsStockage,
	loadLessonStatsStockage,
	starsEarnedAll,
	STARS_KEY,
} from '../src/core/progress';
import { getAllLessons, type LessonDef, type SchoolLevel } from '../src/core/catalog';
import { LEVEL_ORDER } from '../src/core/levels';
import {
	initProfiles,
	activeProfile,
	loadProfilesMeta,
	setNiveauReferenceFor,
	setNiveauMatiereFor,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import { createListe, loadOrtho, saveOrtho } from '../src/core/orthographe/store';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const NOW = 1_700_000_000_000; // instant fixe pour le récap

/* ---------- Repères de catalogue ---------- */
function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi + ' : test à réviser');
	return l;
}
const ce2Seule = (subject = 'math') =>
	leconTelleQue(
		(l) => l.subject === subject && l.levels.includes('ce2') && !l.levels.includes('cm1'),
		'de ' + subject + ' CE2 seule',
	);
const cm1Seule = (subject = 'math') =>
	leconTelleQue(
		(l) => l.subject === subject && l.levels.includes('cm1') && !l.levels.includes('ce2'),
		'de ' + subject + ' CM1 seule',
	);
const deuxNiveaux = () =>
	leconTelleQue((l) => l.levels.includes('ce2') && l.levels.includes('cm1'), 'portant CE2 et CM1');
function predefDeNiveau(niveau: SchoolLevel) {
	const d = ORTHO_PREDEF.find((x) => x.niveau === niveau);
	if (!d) throw new Error('aucune dictée prédéfinie ' + niveau);
	return d;
}

/* ---------- Profils ----------
   RELUS depuis la méta : un changement de classe ne rétro-agit pas sur l'objet déjà en
   main, et toutes les vues encadrant lisent le profil qu'on leur passe. */
function profilRelu(uuid: string): Profile {
	const p = loadProfilesMeta()!.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
/** Passe le profil ACTIF en CM1 et le renvoie relu. */
function passerEnCm1(): Profile {
	const uuid = activeProfile().uuid;
	setNiveauReferenceFor(uuid, 'cm1');
	return profilRelu(uuid);
}
/** Écriture BRUTE d'une carte namespacée, comme le stockage la range vraiment. */
function seed(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}

/* ============================================================
   1. origineLecon — sous quelle classe l'enfant va travailler, et de quel côté
   ============================================================ */
describe('origineLecon', () => {
	it('leçon de la classe suivie → cette classe, sans écart', () => {
		const p = activeProfile(); // CE2 par défaut
		expect(niveauProfilMatiere(p, 'math')).toBe('ce2'); // prémisse
		expect(origineLecon(ce2Seule(), p)).toEqual({ niveau: 'ce2', direction: 'classe-suivie' });
		// Une leçon qui existe AUX DEUX classes est, elle aussi, « à sa place ».
		expect(origineLecon(deuxNiveaux(), p)).toEqual({ niveau: 'ce2', direction: 'classe-suivie' });
	});

	it('classe précédente → la classe d’ORIGINE de la leçon, direction « en-dessous »', () => {
		const p = passerEnCm1();
		expect(origineLecon(ce2Seule(), p)).toEqual({ niveau: 'ce2', direction: 'en-dessous' });
		expect(origineLecon(deuxNiveaux(), p)).toEqual({ niveau: 'cm1', direction: 'classe-suivie' });
	});

	it('classe suivante → sa classe à elle, direction « au-dessus »', () => {
		expect(origineLecon(cm1Seule(), activeProfile())).toEqual({
			niveau: 'cm1',
			direction: 'au-dessus',
		});
	});

	it('la classe lue est celle de la MATIÈRE de la leçon (profil à classes mêlées)', () => {
		// CM1 partout, sauf le français resté en CE2 (#225).
		const uuid = activeProfile().uuid;
		setNiveauReferenceFor(uuid, 'cm1');
		setNiveauMatiereFor(uuid, 'francais', 'ce2');
		const p = profilRelu(uuid);

		expect(origineLecon(ce2Seule('math'), p).direction).toBe('en-dessous'); // maths suivies en CM1
		expect(origineLecon(cm1Seule('math'), p).direction).toBe('classe-suivie');
		expect(origineLecon(cm1Seule('francais'), p).direction).toBe('au-dessus'); // français en CE2
		expect(origineLecon(ce2Seule('francais'), p).direction).toBe('classe-suivie');
	});

	/* Sur TOUT le catalogue : ce qui doit rester vrai quoi qu'il arrive au contenu. */
	it('INVARIANTS sur tout le catalogue, pour un profil CE2 puis CM1', () => {
		for (const niveau of ['ce2', 'cm1'] as SchoolLevel[]) {
			const uuid = activeProfile().uuid;
			setNiveauReferenceFor(uuid, niveau);
			const p = profilRelu(uuid);
			for (const l of getAllLessons()) {
				const o = origineLecon(l, p);
				const suivi = niveauProfilMatiere(p, l.subject);
				// 1) La classe annoncée est une classe où la leçon EXISTE : jamais une étiquette.
				expect(l.levels, l.id).toContain(o.niveau);
				// 2) « classe-suivie » ⟺ la leçon existe à la classe suivie.
				expect(o.direction === 'classe-suivie', l.id).toBe(l.levels.includes(suivi));
				// 3) Le sens colle à la position sur l'échelle scolaire.
				const ecart = LEVEL_ORDER.indexOf(o.niveau) - LEVEL_ORDER.indexOf(suivi);
				if (o.direction === 'en-dessous') expect(ecart, l.id).toBeLessThan(0);
				if (o.direction === 'au-dessus') expect(ecart, l.id).toBeGreaterThan(0);
			}
		}
	});
});

/* ============================================================
   2. epingleesProfil — les trois régimes d'état
   ============================================================ */
function epingle(p: Profile, id: string): EpingleEntry {
	const e = epingleesProfil(p).find((x) => x.id === id);
	if (!e) throw new Error('épingle absente de la liste de gestion : ' + id);
	return e;
}

describe('epingleesProfil — leçon de la CLASSE SUIVIE', () => {
	it('état d’acquisition, du « à découvrir » à l’« acquis »', () => {
		const p = activeProfile();
		const l = ce2Seule();
		toggleRevoirFor(p.uuid, l.id);
		expect(epingle(profilRelu(p.uuid), l.id).etat).toEqual({
			kind: 'acquisition',
			niveau: 'a-decouvrir',
		});

		recordLessonStats({ [l.id]: { ok: 2, total: 10 } }); // 20 % → sous le seuil
		expect(epingle(profilRelu(p.uuid), l.id).etat).toEqual({
			kind: 'acquisition',
			niveau: 'non-acquis',
		});

		recordLessonResult(l.id, true); // sans-faute → étoilée
		expect(epingle(profilRelu(p.uuid), l.id).etat).toEqual({
			kind: 'acquisition',
			niveau: 'acquis',
		});
	});

	it('l’origine est celle de la classe suivie (l’UI n’a alors aucun badge à poser)', () => {
		const p = activeProfile();
		const l = ce2Seule();
		toggleRevoirFor(p.uuid, l.id);
		expect(epingle(profilRelu(p.uuid), l.id).origine).toEqual({
			niveau: 'ce2',
			direction: 'classe-suivie',
		});
	});
});

describe('epingleesProfil — leçon d’une classe EN DESSOUS (consolidation)', () => {
	it('état d’acquisition lu au niveau de STOCKAGE, pas à la classe suivie', () => {
		const p = passerEnCm1();
		const l = ce2Seule(); // CE2 seule : un CM1 la joue et la range en CE2
		toggleRevoirFor(p.uuid, l.id);
		expect(epingle(p, l.id).origine).toEqual({ niveau: 'ce2', direction: 'en-dessous' });
		expect(epingle(p, l.id).etat).toEqual({ kind: 'acquisition', niveau: 'a-decouvrir' });

		// L'enfant la travaille : la stat part @ce2 (là où la leçon se joue).
		recordLessonStats({ [l.id]: { ok: 2, total: 10 } });
		expect(epingle(p, l.id).etat).toEqual({ kind: 'acquisition', niveau: 'non-acquis' });
		// Le piège de #556 : lue à la classe SUIVIE, elle serait restée « à découvrir ».
	});

	it('un état rangé sous la classe SUIVIE (où la leçon n’existe pas) est ignoré', () => {
		const p = passerEnCm1();
		const l = ce2Seule();
		toggleRevoirFor(p.uuid, l.id);
		// Étoile sous @cm1 : une classe où cette leçon n'est pas au programme → sans effet.
		seed(p.uuid, STARS_KEY, { [l.id + '@cm1']: 1 });
		expect(epingle(p, l.id).etat).toEqual({ kind: 'acquisition', niveau: 'a-decouvrir' });
		// La même étoile rangée là où la leçon se joue, elle, compte.
		seed(p.uuid, STARS_KEY, { [l.id + '@ce2']: 1 });
		expect(epingle(p, l.id).etat).toEqual({ kind: 'acquisition', niveau: 'acquis' });
	});

	it('le libellé est celui de la classe d’origine (#436)', () => {
		const p = passerEnCm1();
		const l = ce2Seule();
		toggleRevoirFor(p.uuid, l.id);
		expect(epingle(p, l.id).label).toBe(l.labelNiveau?.ce2 ?? l.label);
	});
});

describe('epingleesProfil — leçon d’une classe AU-DESSUS (prise en avance)', () => {
	it('compte-rendu FACTUEL, jamais un état d’acquisition', () => {
		const p = activeProfile(); // CE2
		const l = cm1Seule();
		toggleRevoirFor(p.uuid, l.id);
		const e = epingle(profilRelu(p.uuid), l.id);
		expect(e.origine).toEqual({ niveau: 'cm1', direction: 'au-dessus' });
		// Jamais épinglée = jamais essayée : la ligne ne doit RIEN affirmer de plus.
		expect(e.etat).toEqual({ kind: 'essai', essaye: false, at: null, reussi: false });
	});

	it('un essai RATÉ se dit « essayé », pas « à renforcer »', () => {
		const p = activeProfile();
		const l = cm1Seule();
		toggleRevoirFor(p.uuid, l.id);
		const avant = Date.now();
		recordLessonStats({ [l.id]: { ok: 0, total: 10 } }); // 0 % : le pire des cas
		const etat = epingle(profilRelu(p.uuid), l.id).etat;
		expect(etat?.kind).toBe('essai');
		if (etat?.kind !== 'essai') throw new Error('régime attendu : essai');
		expect(etat.essaye).toBe(true);
		expect(etat.reussi).toBe(false);
		expect(etat.at).toBeGreaterThanOrEqual(avant); // daté de l'essai
	});

	it('un essai RÉUSSI se dit « réussi », sans en tirer un « acquis »', () => {
		const p = activeProfile();
		const l = cm1Seule();
		toggleRevoirFor(p.uuid, l.id);
		recordLessonResult(l.id, true); // sans-faute → étoilée @cm1
		const etat = epingle(profilRelu(p.uuid), l.id).etat;
		expect(etat).toMatchObject({ kind: 'essai', reussi: true });
	});

	/* Le régime dépend de la DIRECTION, pas de la performance : à performance identique,
	   la leçon de la classe suivie reçoit un jugement, celle d'au-dessus un simple fait. */
	it('même performance, deux régimes : c’est bien la classe qui décide', () => {
		const p = activeProfile();
		const suivie = ce2Seule();
		const avance = cm1Seule();
		toggleRevoirFor(p.uuid, suivie.id);
		toggleRevoirFor(p.uuid, avance.id);
		recordLessonStats({ [suivie.id]: { ok: 0, total: 10 }, [avance.id]: { ok: 0, total: 10 } });

		expect(epingle(profilRelu(p.uuid), suivie.id).etat).toEqual({
			kind: 'acquisition',
			niveau: 'non-acquis',
		});
		expect(epingle(profilRelu(p.uuid), avance.id).etat?.kind).toBe('essai');
	});

	it('INVARIANT : aucune épingle prise au-dessus ne porte d’état d’acquisition', () => {
		const p = activeProfile();
		const ids = [ce2Seule(), deuxNiveaux(), cm1Seule(), cm1Seule('francais')].map((l) => l.id);
		for (const id of ids) toggleRevoirFor(p.uuid, id);
		recordLessonStats(Object.fromEntries(ids.map((id) => [id, { ok: 5, total: 10 }])));

		const liste = epingleesProfil(profilRelu(p.uuid));
		expect(liste).toHaveLength(4); // aucune cible n'est écartée
		for (const e of liste) {
			if (e.origine?.direction === 'au-dessus') expect(e.etat?.kind).toBe('essai');
			else expect(e.etat?.kind).toBe('acquisition');
		}
		// L'invariant n'est pas creux : les deux régimes sont bien représentés.
		expect(liste.filter((e) => e.etat?.kind === 'essai')).toHaveLength(2);
	});
});

describe('epingleesProfil — listes de dictée (aucune classe à nommer)', () => {
	it('liste du parent → pas d’origine, état d’acquisition', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		saveOrtho(s);
		toggleRevoirFor(p.uuid, orthoRevoirId(l.id));
		const e = epingle(profilRelu(p.uuid), l.id);
		expect(e.origine).toBeNull(); // une liste du parent n'appartient à aucune classe
		expect(e.etat).toEqual({ kind: 'acquisition', niveau: 'a-decouvrir' });
	});

	it('prédéfinie de la classe suivie ou d’en dessous → acquisition (cumul spiralaire)', () => {
		const p = passerEnCm1();
		const ce2 = predefDeNiveau('ce2');
		const cm1 = predefDeNiveau('cm1');
		toggleRevoirFor(p.uuid, orthoRevoirId(ce2.id));
		toggleRevoirFor(p.uuid, orthoRevoirId(cm1.id));
		expect(epingle(p, ce2.id).etat?.kind).toBe('acquisition');
		expect(epingle(p, cm1.id).etat?.kind).toBe('acquisition');
	});

	it('prédéfinie d’une classe SUIVANTE → compte-rendu factuel, jamais acquisition', () => {
		const p = activeProfile(); // français en CE2
		const cm1 = predefDeNiveau('cm1');
		toggleRevoirFor(p.uuid, orthoRevoirId(cm1.id));
		const e = epingle(profilRelu(p.uuid), cm1.id);
		expect(e.origine).toBeNull(); // le store d'orthographe ne sait pas nommer la classe
		expect(e.etat).toEqual({ kind: 'essai', essaye: false, at: null, reussi: false });
	});
});

/* ============================================================
   3. revoirActives — l'épingle hors classe REVIENT devant l'enfant
   ============================================================ */
describe('revoirActives — une épingle hors classe est vivante (les deux sens)', () => {
	it('classe EN DESSOUS : la leçon revient, avec le libellé de sa classe d’origine', () => {
		const p = passerEnCm1();
		const l = ce2Seule();
		toggleRevoirFor(p.uuid, l.id);
		const vues = revoirActives();
		expect(vues.map((e) => e.id)).toEqual([l.id]);
		expect(vues[0]).toMatchObject({ kind: 'lecon', label: l.labelNiveau?.ce2 ?? l.label });
	});

	it('classe AU-DESSUS : la leçon revient aussi (elle n’est plus inerte)', () => {
		const p = activeProfile(); // CE2
		const l = cm1Seule();
		toggleRevoirFor(p.uuid, l.id);
		expect(revoirActives().map((e) => e.id)).toEqual([l.id]);
	});

	it('elle quitte la boucle quand elle devient solide AU NIVEAU OÙ ELLE EST JOUÉE', () => {
		const p = passerEnCm1();
		const l = ce2Seule();
		toggleRevoirFor(p.uuid, l.id);
		expect(revoirActives()).toHaveLength(1);

		// Étoile rangée sous la classe suivie (où la leçon n'existe pas) : sans effet.
		seed(p.uuid, STARS_KEY, { [l.id + '@cm1']: 1 });
		expect(revoirActives()).toHaveLength(1);

		// Réussie là où elle se joue → solide → hors de la boucle.
		recordLessonResult(l.id, true);
		expect(revoirActives()).toEqual([]);
	});

	it('même chose au-dessus : une notion prise en avance et réussie sort de la boucle', () => {
		const p = activeProfile();
		const l = cm1Seule();
		toggleRevoirFor(p.uuid, l.id);
		recordLessonStats({ [l.id]: { ok: 2, total: 10 } }); // 20 % → encore fragile
		expect(revoirActives().map((e) => e.id)).toEqual([l.id]);
		recordLessonResult(l.id, true);
		expect(revoirActives()).toEqual([]);
	});

	it('la leçon rendue est bien la LessonDef du catalogue (l’enfant peut la jouer)', () => {
		const p = activeProfile();
		const l = cm1Seule();
		toggleRevoirFor(p.uuid, l.id);
		const e = revoirActives()[0];
		expect(e.kind).toBe('lecon');
		if (e.kind !== 'lecon') throw new Error('entrée de leçon attendue');
		expect(e.lesson.id).toBe(l.id);
	});

	it('une cible sortie du catalogue reste ignorée (mise à jour de l’appli)', () => {
		const p = activeProfile();
		toggleRevoirFor(p.uuid, 'lecon-qui-nexiste-plus');
		expect(revoirActives()).toEqual([]);
	});
});

/* ============================================================
   4. Niveau de lecture : scopeStockage vs scopeActif
   ============================================================ */
describe('scopeStockage — lire une référence DÉSIGNÉE hors de la classe suivie', () => {
	it('garde la leçon à SON niveau de jeu là où scopeActif l’écarte', () => {
		passerEnCm1();
		const basse = ce2Seule(); // jouée @ce2 même par un CM1
		const haute = cm1Seule();
		const raw = { [basse.id + '@ce2']: 1, [haute.id + '@cm1']: 2 };

		// Le périmètre de la classe suivie (récap, complétude) s'arrête au CM1…
		expect(scopeActif(raw)).toEqual({ [haute.id]: 2 });
		// …la lecture d'une référence désignée, elle, voit les deux.
		expect(scopeStockage(raw)).toEqual({ [basse.id]: 1, [haute.id]: 2 });
	});

	/* Le niveau de STOCKAGE est celui où la leçon se JOUE : une valeur rangée ailleurs ne
	   décrit pas cette leçon, et la lire ferait dire n'importe quoi à l'état affiché. */
	it('une valeur rangée sous une classe où la leçon ne se joue pas est ignorée', () => {
		passerEnCm1();
		const l = ce2Seule(); // un CM1 la joue et la range en CE2
		expect(scopeStockage({ [l.id + '@cm1']: 7 })).toEqual({});
		expect(scopeStockage({ [l.id + '@ce2']: 7 })).toEqual({ [l.id]: 7 });
	});

	it('carte vide → vue vide', () => {
		expect(scopeStockage({})).toEqual({});
	});

	it('loadStarsStockage / loadLessonStatsStockage exposent la même vue du profil actif', () => {
		passerEnCm1();
		const l = ce2Seule();
		recordLessonStats({ [l.id]: { ok: 3, total: 10 } });
		recordLessonResult(l.id, true);
		expect(loadStarsStockage()[l.id]).toBe(1);
		expect(loadLessonStatsStockage()[l.id]?.attempts).toBe(1);
	});
});

/* ============================================================
   5. Étoiles par classe — quelle part du travail se fait hors de la classe suivie
   ============================================================ */
describe('etoilesParNiveau (pur)', () => {
	it('carte vide → aucun niveau', () => {
		expect(etoilesParNiveau({})).toEqual([]);
	});

	it('compte une fois chaque leçon@niveau étoilée, dans l’ordre scolaire', () => {
		// Clés volontairement dans le désordre : la sortie doit être ordonnée.
		expect(etoilesParNiveau({ 'c@cm1': 1, 'a@ce2': 1, 'b@ce2': 3, 'd@cm1': 1 })).toEqual([
			{ niveau: 'ce2', etoiles: 2 },
			{ niveau: 'cm1', etoiles: 2 },
		]);
	});

	it('plusieurs étoiles sur la même leçon comptent pour UNE', () => {
		expect(etoilesParNiveau({ 'a@ce2': 5 })).toEqual([{ niveau: 'ce2', etoiles: 1 }]);
	});

	it('une leçon non étoilée (0 ou valeur aberrante) ne compte pas, et son niveau disparaît', () => {
		expect(etoilesParNiveau({ 'a@ce2': 0, 'b@cm1': -1 })).toEqual([]);
		expect(etoilesParNiveau({ 'a@ce2': 0, 'b@ce2': 1 })).toEqual([{ niveau: 'ce2', etoiles: 1 }]);
	});

	it('clé LEGACY sans niveau → comptée en CE2 (tout l’existant l’était)', () => {
		expect(etoilesParNiveau({ 'math-doubles': 1 })).toEqual([{ niveau: 'ce2', etoiles: 1 }]);
	});

	it('niveau inconnu (stockage édité à la main) → ignoré, l’ordre scolaire fait liste blanche', () => {
		expect(etoilesParNiveau({ 'a@zzz': 1 })).toEqual([]);
		expect(etoilesParNiveau({ 'a@zzz': 1, 'b@cm1': 1 })).toEqual([{ niveau: 'cm1', etoiles: 1 }]);
	});
});

describe('RecapProfil.etoilesParNiveau — branchement', () => {
	it('un CM1 qui consolide du CE2 voit ses deux classes, et le total colle au trésor', () => {
		const p = passerEnCm1();
		recordLessonResult(ce2Seule().id, true); // étoilée @ce2 (leçon d'en dessous)
		recordLessonResult(cm1Seule().id, true); // étoilée @cm1 (sa classe)

		const recap = progressionProfil(profilRelu(p.uuid), NOW);
		expect(recap.etoilesParNiveau).toEqual([
			{ niveau: 'ce2', etoiles: 1 },
			{ niveau: 'cm1', etoiles: 1 },
		]);
		// Même compte que le « trésor » cumulé de l'enfant, juste détaillé.
		expect(recap.etoilesParNiveau.reduce((n, x) => n + x.etoiles, 0)).toBe(starsEarnedAll());
	});

	it('rien d’étoilé → liste vide (l’UI n’a rien à comparer)', () => {
		const p = activeProfile();
		expect(progressionProfil(profilRelu(p.uuid), NOW).etoilesParNiveau).toEqual([]);
	});
});
