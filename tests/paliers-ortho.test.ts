/* ============================================================
   Journal daté des franchissements des LISTES de dictée (#541) —
   `journaliserPaliersOrtho` (core/orthographe/paliers.ts).
   ------------------------------------------------------------
   Pendant, pour l'orthographe, du journal des paliers des leçons (`recordMonteesPalier`,
   éprouvé dans paliers.test.ts). Le contrat éprouvé ici, dérivé de ce précédent et de
   ce que la frise en attend :
   - modèle MONOTONE : on ne date que le PREMIER passage en « en cours » puis en
     « acquis », deux horodatages au plus, JAMAIS réécrits (une date qui bouge décale
     toute la frise et le « acquis depuis le … » lu par le parent) ;
   - « à découvrir » n'est pas un cap franchi : rien n'est écrit ;
   - une borne de MISE EN SERVICE, posée par toute session même sans franchissement,
     jamais réécrite, et DISTINCTE de celle des leçons ;
   - TOUTES les listes du profil sont réévaluées, pas seulement celle jouée (un mot
     appartient à plusieurs listes, et la révision espacée rejoue des mots) ;
   - les entrées des listes supprimées par le parent sont PURGÉES (ce journal n'est
     borné par aucun catalogue).

   Parti pris de l'auteur des tests : l'état par-mot est posé À LA MAIN (atelier fait +
   modes validés, la dictée n'étant requise que si le TTS est là), comme dans
   suivi-dictees-encadrant.test.ts — donc les attendus se dérivent de la règle
   d'acquisition d'un mot, jamais de progression.ts ni de paliers.ts.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { setOnDataWrite, lsGet } from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import {
	loadOrtho,
	saveOrtho,
	createListe,
	updateListe,
	deleteListe,
} from '../src/core/orthographe/store';
import { motsDeLecon } from '../src/core/orthographe/lessons';
import { niveauListeOrtho } from '../src/core/orthographe/progression';
import {
	journaliserPaliersOrtho,
	ORTHO_PALIERS_KEY,
	ORTHO_PALIERS_DEBUT_KEY,
} from '../src/core/orthographe/paliers';
import {
	recordLessonStats,
	recordMonteesPalier,
	PALIERS_DEBUT_KEY,
	LESSON_PALIERS_KEY,
	type PaliersNotion,
} from '../src/core/progress';
import type { MotOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const T = 1_700_000_000_000; // instant de référence
const JOUR = 86_400_000;

/* ---------- Lecture des journaux du profil ACTIF ---------- */
function journal(): Record<string, PaliersNotion> {
	return lsGet(ORTHO_PALIERS_KEY, {});
}
/** `null` = clé jamais écrite (distinct d'un journal vide : rien n'a été touché). */
function journalBrut(): Record<string, PaliersNotion> | null {
	return lsGet(ORTHO_PALIERS_KEY, null);
}
function borne(): number | null {
	return lsGet(ORTHO_PALIERS_DEBUT_KEY, null);
}

/* ---------- État par-mot posé à la main (règle de maîtrise du runner) ---------- */
interface EtatMot {
	atelier?: boolean;
	tuiles?: boolean;
	motCache?: boolean;
	dictee?: boolean;
}
function poser(m: MotOrtho, e: EtatMot): void {
	m.atelierFait = e.atelier ?? false;
	m.validation = {
		tuiles: e.tuiles ?? false,
		motCache: e.motCache ?? false,
		dictee: e.dictee ?? false,
	};
}
/** Mot entamé (atelier fait) mais aucun mode validé → la liste est « en cours ». */
const entame: EtatMot = { atelier: true };
/** Mot travaillé en tuiles + mot caché, SANS la dictée : maîtrisé seulement sans TTS. */
const sansDictee: EtatMot = { atelier: true, tuiles: true, motCache: true, dictee: false };
/** Mot travaillé sur tous les modes : maîtrisé quel que soit le TTS. */
const complet: EtatMot = { atelier: true, tuiles: true, motCache: true, dictee: true };

/** Crée une liste dans le profil ACTIF ; `etats[i]` pose l'état du i-ème mot. */
function creerListe(label: string, mots: string[], etats: EtatMot[] = []): string {
	const s = loadOrtho();
	const l = createListe(
		s,
		label,
		mots.map((mot) => ({ mot })),
	);
	l.motIds.forEach((id, i) => {
		if (etats[i]) poser(s.banque[id], etats[i]);
	});
	saveOrtho(s);
	return l.id;
}
/** Fait progresser les mots d'une liste existante (état posé par index). */
function majListe(listeId: string, etats: EtatMot[]): void {
	const s = loadOrtho();
	const l = s.listes.find((x) => x.id === listeId);
	if (!l) throw new Error('liste introuvable : ' + listeId);
	l.motIds.forEach((id, i) => {
		if (etats[i]) poser(s.banque[id], etats[i]);
	});
	saveOrtho(s);
}
/** Supprime une liste, comme le parent depuis l'espace encadrant. */
function supprimerListe(listeId: string): void {
	const s = loadOrtho();
	expect(deleteListe(s, listeId)).toBe(true);
	saveOrtho(s);
}
/** Le parent réédite une liste depuis l'espace encadrant (même API que l'éditeur). */
function reediterListe(listeId: string, label: string, mots: string[]): void {
	const s = loadOrtho();
	expect(
		updateListe(
			s,
			listeId,
			label,
			mots.map((mot) => ({ mot })),
		),
	).not.toBeNull();
	saveOrtho(s);
}
/* Geste daté à un instant FIGÉ : une vraie fin de session lit l'horloge, or les attendus d'ici
   sont écrits à la milliseconde. Pattern de paliers.test.ts. */
function auMoment<T>(t: number, geste: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return geste();
	} finally {
		spy.mockRestore();
	}
}

/* ============================================================
   1. Borne de mise en service (ORTHO_PALIERS_DEBUT_KEY)
   ============================================================ */
describe('journaliserPaliersOrtho — borne de mise en service', () => {
	it('posée par toute séance, même sans une seule liste à évaluer', () => {
		// C'est le journal EN SERVICE qu'elle date, pas un franchissement : sans elle, un
		// horodatage absent serait ambigu et la frise ne pourrait rien affirmer d'une semaine.
		journaliserPaliersOrtho(false, T);
		expect(borne()).toBe(T);
		expect(journalBrut()).toBeNull(); // et rien n'est écrit dans le journal lui-même
	});

	it('posée même quand la séance ne franchit AUCUN cap (liste à peine ouverte)', () => {
		creerListe('Semaine 1', ['chat', 'chien']); // aucun mot entamé
		journaliserPaliersOrtho(false, T);
		expect(borne()).toBe(T);
		expect(journal()).toEqual({});
	});

	it('JAMAIS réécrite : une borne qui avance rendrait « inconnues » des semaines déjà lues', () => {
		journaliserPaliersOrtho(false, T);
		journaliserPaliersOrtho(true, T + 30 * JOUR);
		expect(borne()).toBe(T);
	});

	it('l’epoch (0) est une borne posée, pas une borne absente', () => {
		// Piège du falsy : un `if (!borne)` la reposerait à la séance suivante et la frise
		// perdrait tout ce qu'elle avait déduit.
		journaliserPaliersOrtho(false, 0);
		journaliserPaliersOrtho(false, T);
		expect(borne()).toBe(0);
	});

	it('DISTINCTE de celle des leçons, dans les deux sens', () => {
		// Celle des leçons est posée par TOUTE session finalisée, dictée comprise (#540) : la
		// réutiliser ferait dire à la frise d'une liste que ses semaines sont connues depuis une
		// séance de maths, alors que ce journal-ci, plus récent, ne tournait pas encore.
		auMoment(T, () => recordLessonStats({ 'math-doubles': { ok: 8, total: 10 } }));
		recordMonteesPalier(['math-doubles'], T); // séance de leçon : pose la borne des leçons
		expect(lsGet(PALIERS_DEBUT_KEY, null)).toBe(T);
		expect(borne()).toBeNull(); // …et n'atteste RIEN du journal des listes
		// Symétrique : une dictée ne pose pas la borne des leçons plus tôt qu'elle ne l'est.
		localStorage.clear();
		initProfiles();
		journaliserPaliersOrtho(false, T);
		expect(borne()).toBe(T);
		expect(lsGet(PALIERS_DEBUT_KEY, null)).toBeNull();
		expect(lsGet(LESSON_PALIERS_KEY, null)).toBeNull();
	});

	it('une borne par PROFIL : la séance de l’un ne date pas le journal de l’autre', () => {
		const a = activeProfile().uuid;
		journaliserPaliersOrtho(false, T);
		const b = addProfile('Cadette').uuid;
		setActiveProfile(b);
		expect(borne()).toBeNull(); // le nouveau profil n'hérite de rien
		journaliserPaliersOrtho(false, T + 30 * JOUR);
		expect(borne()).toBe(T + 30 * JOUR);
		setActiveProfile(a);
		expect(borne()).toBe(T); // inchangée
	});
});

/* ============================================================
   2. Franchissements datés (modèle monotone)
   ============================================================ */
describe('journaliserPaliersOrtho — franchissements datés', () => {
	it('liste commencée → une marche « en cours » datée', () => {
		const id = creerListe('Semaine 1', ['chat', 'chien'], [entame]);
		journaliserPaliersOrtho(false, T);
		expect(journal()[id]).toEqual({ enCours: T });
	});

	it('liste vide ou jamais ouverte → aucune entrée (« à découvrir » n’est pas un cap)', () => {
		const vide = creerListe('À remplir', []);
		const neuve = creerListe('Semaine 2', ['chat']);
		journaliserPaliersOrtho(false, T);
		expect(journal()[vide]).toBeUndefined();
		expect(journal()[neuve]).toBeUndefined();
	});

	it('liste maîtrisée d’un coup → UNE seule marche « acquis », pas de « en cours » rétroactif', () => {
		// Même arbitrage que pour une leçon étoilée au premier essai : le journal date ce qui a
		// été observé, il n'invente pas une étape qu'il n'a pas vue.
		const id = creerListe('Un seul mot', ['chat'], [complet]);
		journaliserPaliersOrtho(true, T);
		expect(journal()[id]).toEqual({ acquis: T });
	});

	it('« en cours » puis « acquis » → deux marches, la 1re date est préservée', () => {
		const id = creerListe('Semaine 1', ['chat', 'chien'], [complet]); // 1 mot sur 2
		journaliserPaliersOrtho(true, T);
		expect(journal()[id]).toEqual({ enCours: T });
		majListe(id, [complet, complet]); // le 2d mot est maîtrisé une semaine plus tard
		journaliserPaliersOrtho(true, T + 7 * JOUR);
		expect(journal()[id]).toEqual({ enCours: T, acquis: T + 7 * JOUR });
	});

	it('dates FIGÉES : rejouer une liste déjà acquise ne rajeunit aucune marche', () => {
		const id = creerListe('Semaine 1', ['chat'], [complet]);
		journaliserPaliersOrtho(true, T);
		const avant = journal()[id];
		journaliserPaliersOrtho(true, T + 22 * JOUR); // la liste est rejouée trois semaines après
		expect(journal()[id]).toEqual(avant);
	});

	/* MONOTONIE, le point où la copie du modèle des leçons avait dérivé : une liste DÉJÀ
	   acquise peut redescendre en « en cours », là où l'« acquis » d'une leçon repose sur
	   l'étoile et ne se retire jamais. Le journal se faisait alors tamponner un `enCours`
	   POSTÉRIEUR à son `acquis` — forme que la frise des leçons documente comme
	   « incohérente », et que l'en-tête de ce module promet de ne jamais produire. Deux
	   chemins réels, éprouvés ici et dans le describe sur la dispo du TTS. */
	it('régression : le parent ajoute un mot à une liste ACQUISE → rien de neuf, rien de perdu', () => {
		// Le modèle est monotone : on ne re-loggue pas une marche déjà franchie, et surtout on ne
		// remplit pas après coup un « enCours » jamais observé — la frise afficherait une
		// trajectoire qui n'a pas eu lieu, et daterait « commencée » APRÈS « acquise ».
		const id = creerListe('Semaine 1', ['chat'], [complet]);
		journaliserPaliersOrtho(true, T);
		expect(journal()[id]).toEqual({ acquis: T });
		reediterListe(id, 'Semaine 1', ['chat', 'chien']); // le parent complète sa liste
		expect(niveauListeOrtho(loadOrtho(), id, true)).toBe('en-cours'); // prémisse du cas
		journaliserPaliersOrtho(true, T + JOUR);
		expect(journal()[id]).toEqual({ acquis: T });
	});

	it('les dictées prédéfinies non commencées ne polluent jamais le journal', () => {
		// Le catalogue en compte des dizaines : si chacune laissait une entrée, la purge et la
		// frise perdraient tout sens (et le stockage grossirait à chaque séance).
		creerListe('Semaine 1', ['chat'], [entame]);
		journaliserPaliersOrtho(false, T);
		expect(Object.keys(journal())).toHaveLength(1);
	});

	it('une dictée prédéfinie commencée est datée sous SON identifiant', () => {
		const predefId = 'fr-ortho-invariables-1'; // prédéfinie CE2
		const s = loadOrtho();
		poser(motsDeLecon(s, predefId)[0], entame); // matérialise la leçon et entame un mot
		saveOrtho(s);
		journaliserPaliersOrtho(false, T);
		expect(journal()[predefId]).toEqual({ enCours: T });
	});
});

/* ============================================================
   3. TOUTES les listes réévaluées, pas seulement celle jouée
   ============================================================ */
describe('journaliserPaliersOrtho — réévaluation de toutes les listes', () => {
	it('un mot partagé par deux listes fait franchir un cap aux DEUX', () => {
		// La banque déduplique par forme : « chat » est le même mot dans les deux listes. Ne
		// réévaluer que la liste jouée laisserait l'autre franchir son cap sans jamais le dater —
		// et sa frise mentirait d'autant.
		const jouee = creerListe('Jouée', ['chat']);
		const autre = creerListe('Autre', ['chat', 'chien']);
		majListe(jouee, [sansDictee]);
		journaliserPaliersOrtho(false, T);
		expect(journal()[jouee]).toEqual({ acquis: T }); // son unique mot est maîtrisé
		expect(journal()[autre]).toEqual({ enCours: T }); // 1 mot sur 2, sans l'avoir ouverte
	});

	it('un mot travaillé en révision espacée date la prédéfinie qui le contient', () => {
		// La révision espacée rejoue des MOTS, jamais une liste : c'est le cas d'usage qui oblige
		// à balayer tout le profil (et pas la seule liste de la séance de dictée).
		const predefId = 'fr-ortho-theme-course-chevaux'; // prédéfinie CE2 contenant « cheval »
		const s = loadOrtho();
		motsDeLecon(s, predefId); // la leçon a déjà été matérialisée par une dictée passée
		saveOrtho(s);
		journaliserPaliersOrtho(false, T - JOUR); // séance précédente : rien n'est encore entamé
		expect(journal()[predefId]).toBeUndefined();

		const s2 = loadOrtho();
		poser(s2.banque[s2.motIdParForme['cheval']], entame); // un tour de révision sur « cheval »
		saveOrtho(s2);
		journaliserPaliersOrtho(false, T);
		expect(journal()[predefId]).toEqual({ enCours: T });
	});
});

/* ============================================================
   4. dicteeDispo — on date l'état tel que l'enfant l'a vécu
   ============================================================ */
describe('journaliserPaliersOrtho — effet de la dispo du TTS', () => {
	it('sans voix de synthèse, une liste validée sans la dictée est acquise plus tôt', () => {
		const id = creerListe('Semaine 1', ['chat'], [sansDictee]);
		journaliserPaliersOrtho(true, T); // appareil avec voix : la dictée reste due
		expect(journal()[id]).toEqual({ enCours: T });
		journaliserPaliersOrtho(false, T + JOUR); // même liste, appareil sans voix
		expect(journal()[id]).toEqual({ enCours: T, acquis: T + JOUR });
	});

	/* Le chemin le plus probant vers la rétrogradation, et il ne suppose AUCUN changement de
	   donnée : `ui/tts.ts` charge les voix en asynchrone et se rafraîchit sur `voiceschanged`,
	   donc `dicteeDisponible()` peut valoir `false` puis `true` dans la MÊME session. La
	   redescente n'est alors pas un événement pédagogique, c'est un artefact de lecture — d'où
	   le refus d'effacer le tampon `acquis` à la redescente, qui aurait fait sauter la date
	   d'acquisition au gré de la disponibilité de la voix. */
	it('acquise sans voix puis rejouée AVEC voix : la marche « acquis » tient, sans enCours ajouté', () => {
		// L'ordre inverse du cas précédent, et c'est le piège : la liste redescend en « en cours »
		// sur l'appareil équipé, mais dater ce « en cours » après coup fabriquerait une régression
		// dans la frise — laquelle ne redescend jamais.
		const id = creerListe('Semaine 1', ['chat'], [sansDictee]);
		journaliserPaliersOrtho(false, T);
		expect(journal()[id]).toEqual({ acquis: T });
		journaliserPaliersOrtho(true, T + JOUR);
		expect(journal()[id]).toEqual({ acquis: T });
	});
});

/* ============================================================
   5. Purge des listes supprimées par le parent
   ============================================================ */
describe('journaliserPaliersOrtho — purge', () => {
	it('une liste supprimée perd son entrée, les autres sont intactes', () => {
		const gardee = creerListe('Gardée', ['chat'], [entame]);
		const jetee = creerListe('Jetée', ['chien'], [entame]);
		journaliserPaliersOrtho(false, T);
		expect(Object.keys(journal()).sort()).toEqual([gardee, jetee].sort());

		supprimerListe(jetee);
		journaliserPaliersOrtho(false, T + JOUR);
		expect(journal()[jetee]).toBeUndefined();
		expect(journal()[gardee]).toEqual({ enCours: T }); // date d'origine préservée
	});

	it('purge même quand la séance ne franchit aucun cap (pas de nettoyage différé)', () => {
		const id = creerListe('Jetée', ['chat'], [entame]);
		journaliserPaliersOrtho(false, T);
		supprimerListe(id);
		journaliserPaliersOrtho(false, T + JOUR); // aucune liste, donc aucun franchissement
		expect(journal()).toEqual({});
	});

	it('l’entrée d’une dictée PRÉDÉFINIE n’est jamais purgée (elle reste au catalogue)', () => {
		const predefId = 'fr-ortho-invariables-1';
		const s = loadOrtho();
		poser(motsDeLecon(s, predefId)[0], entame);
		saveOrtho(s);
		journaliserPaliersOrtho(false, T);
		expect(journal()[predefId]).toEqual({ enCours: T });
		journaliserPaliersOrtho(false, T + 30 * JOUR);
		expect(journal()[predefId]).toEqual({ enCours: T });
	});

	it('la purge ne touche que le journal du profil ACTIF', () => {
		const a = activeProfile().uuid;
		const listeA = creerListe('Liste de A', ['chat'], [entame]);
		journaliserPaliersOrtho(false, T);
		const b = addProfile('Cadette').uuid;
		setActiveProfile(b);
		// B n'a aucune liste : sa séance ne doit pas emporter le journal de A.
		journaliserPaliersOrtho(false, T + JOUR);
		expect(journal()).toEqual({});
		setActiveProfile(a);
		expect(journal()[listeA]).toEqual({ enCours: T });
	});
});
