/* ============================================================
   Désépinglage automatique de la file « à revoir » (#465).
   ------------------------------------------------------------
   Cible : purgeRevoirSolides / retraitsAutoProfil (core/encadrant-stats).

   Parti pris de l'auteur des tests : les attendus sont DÉRIVÉS du contrat
   (« est solide une leçon étoilée ou dont la perf récente atteint 70 %, une
   liste de dictée entièrement maîtrisée AVEC le TTS disponible ; jamais retiré :
   jamais travaillé, cible non résolvable, épinglée alors que déjà solide »),
   jamais recopiés de l'implémentation. Les pourcentages sont posés en ok/total
   via l'API normale d'enregistrement (7/10 = 70 % = pile le seuil, 69/100 =
   juste en dessous).

   PARITÉ avec l'affichage enfant (revoirActives) : elle est éprouvée dans les
   deux sens pour les leçons du catalogue (ce que l'enfant ne voit plus ne reste
   pas en file, et rien de ce qu'il voit encore n'est retiré). Pour les dictées,
   le retrait est volontairement PLUS PRUDENT que l'affichage : un retrait est
   définitif, donc il exige la dispo du TTS et le jeu de modes COMPLET, là où le
   filtre d'affichage (réversible) se contente des modes requis du moment.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	setOnDataWrite,
	lsSetRaw,
	lsGetItemRaw,
	lsRemoveRaw,
	PROFILES_KEY,
} from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	addProfile,
	loadProfilesMeta,
	setNiveauReferenceFor,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import {
	recordLessonResult,
	recordLessonStats,
	STARS_KEY,
	LESSON_STATS_KEY,
} from '../src/core/progress';
import { getAllLessons } from '../src/core/catalog';
import {
	purgeRevoirSolides,
	retraitsAutoProfil,
	toggleRevoirFor,
	loadRevoirFor,
	revoirActives,
	epingleesProfil,
	orthoRevoirId,
	REVOIR_KEY,
	REVOIR_AUTO_KEY,
	REVOIR_FRAGILE_KEY,
} from '../src/core/encadrant-stats';
import {
	loadOrtho,
	saveOrtho,
	createListe,
	deleteListe,
	getListe,
} from '../src/core/orthographe/store';
import { motsDeLecon } from '../src/core/orthographe/lessons';
import type { MotOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Repères temporels (tout est injecté, rien ne dépend de l'horloge) ---------- */
const NOW = new Date(2026, 5, 15, 10).getTime(); // 15 juin 2026, 10:00 local
const JOUR = 86_400_000;
const MIN = 60_000;

/* ---------- Helpers de stockage ----------
   Écriture BRUTE dans le profil ciblé (`uuid/KEY`), comme le fait l'espace encadrant. */
function seed(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}
function seedBrut(uuid: string, key: string, raw: string): void {
	lsSetRaw(uuid + '/' + key, raw);
}
function brut(uuid: string, key: string): string | null {
	return lsGetItemRaw(uuid + '/' + key);
}
/* Profil RELU depuis la méta (après un changement de niveau, l'objet capturé est périmé). */
function profil(uuid: string): Profile {
	const p = loadProfilesMeta()?.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
/* Fige `updatedAt` à une valeur sentinelle : permet de prouver qu'une écriture
   BRUTE ne bumpe pas le profil (sans dépendre de la granularité de Date.now()). */
function figerUpdatedAt(uuid: string, at: number): void {
	const m = loadProfilesMeta();
	if (!m) throw new Error('méta absente');
	const p = m.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	p.updatedAt = at;
	lsSetRaw(PROFILES_KEY, JSON.stringify(m));
}

/* Une passe « à blanc » : elle pose la clé de marques de fragilité et clôt donc
   l'ADOPTION de la file existante. Après ça, seules les entrées VUES fragiles
   alors qu'épinglées sont candidates au retrait automatique. */
function passeInitiale(p: Profile, dicteeDispo = false): void {
	purgeRevoirSolides(p, dicteeDispo, NOW - 10 * JOUR);
}

/* ---------- Helpers orthographe ----------
   État par-mot posé À LA MAIN (indépendant de progression.ts) : un mot est maîtrisé
   dès que l'atelier est fait et que tous les modes REQUIS sont validés — la dictée
   n'étant requise que si le TTS est disponible. */
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
/** Mot travaillé en tuiles + mot caché, SANS la dictée : ne compte comme maîtrisé que si
    le TTS est absent (la dictée n'est alors pas un mode requis). */
const sansDictee: EtatMot = { atelier: true, tuiles: true, motCache: true, dictee: false };
/** Mot travaillé sur TOUS les modes, dictée comprise : maîtrisé quel que soit le TTS. */
const complet: EtatMot = { atelier: true, tuiles: true, motCache: true, dictee: true };
/** Crée une liste de dictée dans le profil ACTIF ; `etats[i]` pose l'état du i-ème mot. */
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
/** Repose l'état des mots d'une liste existante (progression entre deux passes). */
function majListe(listeId: string, etats: EtatMot[]): void {
	const s = loadOrtho();
	const l = getListe(s, listeId);
	if (!l) throw new Error('liste introuvable : ' + listeId);
	l.motIds.forEach((id, i) => {
		if (etats[i]) poser(s.banque[id], etats[i]);
	});
	saveOrtho(s);
}

/* ---------- Repères de catalogue (choisis dynamiquement, pas d'id CM1 en dur) ---------- */
function leconMultiNiveau(): string {
	const l = getAllLessons().find(
		(x) => x.subject === 'math' && x.levels.includes('ce2') && x.levels.includes('cm1'),
	);
	if (!l) throw new Error('catalogue sans leçon math CE2+CM1 : test à réviser');
	return l.id;
}
function leconCm1Seulement(): string {
	const l = getAllLessons().find((x) => x.levels.includes('cm1') && !x.levels.includes('ce2'));
	if (!l) throw new Error('catalogue sans leçon CM1-only : test à réviser');
	return l.id;
}

/* ============================================================
   1. Critère de retrait (et parité avec l'affichage enfant)
   ============================================================ */
describe('purgeRevoirSolides — critère de retrait', () => {
	it('retire une leçon redevenue solide par l’étoile et renvoie son entryId', () => {
		const p = activeProfile();
		recordLessonStats({ 'math-complements': { ok: 2, total: 10 } }); // 20 % → fragile
		toggleRevoirFor(p.uuid, 'math-complements');
		passeInitiale(p);
		recordLessonResult('math-complements', true); // sans-faute → étoilée → solide

		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-complements']);
		expect(loadRevoirFor(p.uuid)).toEqual([]);
	});

	it('seuil de perf récente : 70 % suffit à retirer, 69 % non (borne inclusive)', () => {
		const p = activeProfile();
		toggleRevoirFor(p.uuid, 'math-complements');
		toggleRevoirFor(p.uuid, 'math-moities');
		recordLessonStats({ 'math-complements': { ok: 7, total: 10 } }); // 70 % pile → solide
		recordLessonStats({ 'math-moities': { ok: 69, total: 100 } }); // 69 % → encore fragile

		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-complements']);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-moities']);
	});

	it('la perf RÉCENTE prime sur le cumul : bon départ puis rechute → conservée', () => {
		const p = activeProfile();
		toggleRevoirFor(p.uuid, 'math-complements');
		// 5 essais parfaits puis 5 essais ratés : cumul 50 %, mais la fenêtre récente
		// (les 40 dernières questions, #541) est à 0 % → la leçon est bien encore à revoir.
		for (let i = 0; i < 5; i++) recordLessonStats({ 'math-complements': { ok: 10, total: 10 } });
		for (let i = 0; i < 5; i++) recordLessonStats({ 'math-complements': { ok: 0, total: 10 } });

		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-complements']);
	});

	it('donnée ancienne sans fenêtre récente : repli sur le cumul (80 % → retirée)', () => {
		const p = activeProfile();
		toggleRevoirFor(p.uuid, 'math-complements');
		// Stat antérieure à la fenêtre glissante (#234) : pas de recentPct du tout.
		seed(p.uuid, LESSON_STATS_KEY, {
			'math-complements@ce2': { attempts: 1, correct: 8, questions: 10, bestPct: 80, lastPct: 80 },
		});
		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-complements']);
	});

	it('leçon JAMAIS travaillée : jamais retirée (épinglage « à l’avance »)', () => {
		const p = activeProfile();
		toggleRevoirFor(p.uuid, 'math-moities'); // aucune stat, aucune étoile
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-moities']);
		// Et ça reste vrai passe après passe (ce n'est pas une tolérance de 1er tour).
		expect(purgeRevoirSolides(p, false, NOW + JOUR)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-moities']);
	});

	it('file vide → aucun retrait', () => {
		const p = activeProfile();
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual([]);
		expect(retraitsAutoProfil(p, NOW)).toEqual([]);
	});

	it('retire une liste de dictée entièrement maîtrisée, garde celle en cours', () => {
		const p = activeProfile();
		const acquise = creerListe('Acquise', ['chat'], [complet]);
		const enCours = creerListe('En cours', ['chien', 'cheval'], [complet]);
		toggleRevoirFor(p.uuid, orthoRevoirId(acquise));
		toggleRevoirFor(p.uuid, orthoRevoirId(enCours));

		// L'entryId renvoyé porte le préfixe (il sert au ré-épinglage direct).
		expect(purgeRevoirSolides(p, true, NOW)).toEqual([orthoRevoirId(acquise)]);
		expect(loadRevoirFor(p.uuid)).toEqual([orthoRevoirId(enCours)]);
	});

	it('SANS TTS, aucune dictée n’est retirée — même tous ses mots maîtrisés (dictée comprise)', () => {
		const p = activeProfile();
		// Cas 1 : validée en tuiles + mot caché seulement. L'affichage, lui, la juge acquise
		// (la dictée n'est pas un mode requis sans voix de synthèse) — mais un retrait est
		// DÉFINITIF, donc on ne se fie pas à un « acquis » obtenu à modes réduits.
		const partielle = creerListe('Sans la dictée', ['chat'], [sansDictee]);
		// Cas 2 : réellement maîtrisée sur tous les modes. Même là, pas de retrait sans TTS :
		// la règle est franche (« pas de voix → pas de retrait »), pas au cas par cas.
		const totale = creerListe('Tous les modes', ['chien'], [complet]);
		toggleRevoirFor(p.uuid, orthoRevoirId(partielle));
		toggleRevoirFor(p.uuid, orthoRevoirId(totale));

		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(purgeRevoirSolides(p, false, NOW + JOUR)).toEqual([]); // stable, pas un délai
		expect(loadRevoirFor(p.uuid)).toEqual([orthoRevoirId(partielle), orthoRevoirId(totale)]);
		// Le même appareil, TTS activé : seule celle qui a VRAIMENT tous les modes s'en va.
		expect(purgeRevoirSolides(p, true, NOW + 2 * JOUR)).toEqual([orthoRevoirId(totale)]);
	});

	it('AVEC TTS, la maîtrise est jugée sur le jeu de modes COMPLET (dictée requise)', () => {
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat'], [sansDictee]); // tuiles + mot caché, pas de dictée
		toggleRevoirFor(p.uuid, orthoRevoirId(id));
		expect(purgeRevoirSolides(p, true, NOW)).toEqual([]); // il manque la dictée → gardée

		majListe(id, [complet]); // l'enfant valide enfin la dictée du mot
		expect(purgeRevoirSolides(p, true, NOW + JOUR)).toEqual([orthoRevoirId(id)]);
	});

	it('liste de dictée SANS mot : jamais « acquise », donc jamais retirée', () => {
		const p = activeProfile();
		const id = creerListe('Liste vide', []);
		toggleRevoirFor(p.uuid, orthoRevoirId(id));
		expect(purgeRevoirSolides(p, true, NOW)).toEqual([]);
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual([orthoRevoirId(id)]);
	});

	it('dictée prédéfinie épinglée « à l’avance » : gardée, puis retirée une fois maîtrisée', () => {
		const p = activeProfile();
		const predefId = 'fr-ortho-invariables-1'; // prédéfinie CE2, jamais commencée
		toggleRevoirFor(p.uuid, orthoRevoirId(predefId));
		expect(purgeRevoirSolides(p, true, NOW)).toEqual([]); // à découvrir ≠ solide

		const s = loadOrtho();
		motsDeLecon(s, predefId).forEach((m) => poser(m, complet)); // tous les mots maîtrisés
		saveOrtho(s);
		expect(purgeRevoirSolides(p, true, NOW + JOUR)).toEqual([orthoRevoirId(predefId)]);
	});

	it('file mixte leçon + dictée : les deux natures sont purgées d’une seule passe', () => {
		const p = activeProfile();
		const acquise = creerListe('Acquise', ['chat'], [complet]);
		recordLessonResult('math-doubles', true);
		toggleRevoirFor(p.uuid, 'math-doubles');
		toggleRevoirFor(p.uuid, orthoRevoirId(acquise));
		toggleRevoirFor(p.uuid, 'math-moities'); // jamais travaillée → reste

		expect(purgeRevoirSolides(p, true, NOW)).toEqual(['math-doubles', orthoRevoirId(acquise)]);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-moities']);
	});

	it('l’absence de TTS ne change RIEN aux leçons du catalogue (règle propre aux dictées)', () => {
		const p = activeProfile();
		recordLessonResult('math-doubles', true);
		seed(p.uuid, REVOIR_KEY, ['math-doubles']);
		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-doubles']);
	});
});

describe('purgeRevoirSolides — parité avec l’affichage enfant (revoirActives)', () => {
	/* Scénario couvrant les 5 états possibles d'une entrée résolvable, TTS disponible —
	   le seul cas où purge et affichage sont censés coïncider exactement (cf. la divergence
	   assumée sans TTS, testée juste après). Les attendus sont posés à la main d'après le
	   contrat, PUIS confrontés à revoirActives. */
	function scenarioComplet(p: Profile): { garde: string[]; retire: string[] } {
		const acquise = creerListe('Dictée acquise', ['chat'], [complet]);
		const neuve = creerListe('Dictée neuve', ['chien']);
		recordLessonResult('math-doubles', true); // étoilée → solide
		recordLessonStats({ 'math-complements': { ok: 7, total: 10 } }); // 70 % → solide
		recordLessonStats({ 'math-moities': { ok: 2, total: 10 } }); // 20 % → fragile
		// math-tables-addition : jamais travaillée → fragile
		for (const id of [
			'math-doubles',
			'math-complements',
			'math-moities',
			'math-tables-addition',
			orthoRevoirId(acquise),
			orthoRevoirId(neuve),
		])
			toggleRevoirFor(p.uuid, id);
		return {
			garde: ['math-moities', 'math-tables-addition', orthoRevoirId(neuve)],
			retire: ['math-doubles', 'math-complements', orthoRevoirId(acquise)],
		};
	}

	it('la file restante est EXACTEMENT ce que l’enfant voit encore (ordre conservé)', () => {
		const p = activeProfile();
		const { garde, retire } = scenarioComplet(p);
		// Ce que l'enfant voit AVANT la purge (mêmes ids, reconvertis en entryId).
		const vues = revoirActives(true).map((e) => (e.kind === 'ortho' ? orthoRevoirId(e.id) : e.id));
		expect(vues).toEqual(garde); // l'affichage filtrait déjà les mêmes entrées

		expect(purgeRevoirSolides(p, true, NOW)).toEqual(retire);
		expect(loadRevoirFor(p.uuid)).toEqual(garde); // la file persistée rejoint l'affichage
	});

	it('la purge n’enlève RIEN de ce que l’enfant voit encore (pas de faux positif)', () => {
		const p = activeProfile();
		scenarioComplet(p);
		for (const tts of [false, true]) {
			const avant = revoirActives(tts);
			purgeRevoirSolides(p, tts, NOW);
			expect(revoirActives(tts)).toEqual(avant);
		}
	});

	it('l’espace encadrant ne liste plus les entrées « fantômes » après la purge', () => {
		const p = activeProfile();
		const { garde } = scenarioComplet(p);
		purgeRevoirSolides(p, true, NOW);
		const listees = epingleesProfil(p).map((e) =>
			e.kind === 'ortho' ? orthoRevoirId(e.id) : e.id,
		);
		expect(listees).toEqual(garde);
	});

	it('divergence ASSUMÉE sans TTS : l’enfant ne voit plus la dictée, la file la garde', () => {
		const p = activeProfile();
		const id = creerListe('Acquise sans la dictée', ['chat'], [sansDictee]);
		toggleRevoirFor(p.uuid, orthoRevoirId(id));
		// L'affichage la juge acquise (modes requis réduits) et ne la propose plus…
		expect(revoirActives(false)).toEqual([]);
		// …mais le retrait, définitif, refuse de s'appuyer là-dessus : l'épingle survit,
		// et redeviendra visible/jugeable dès que l'appareil aura une voix de synthèse.
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual([orthoRevoirId(id)]);
		expect(revoirActives(true).map((e) => e.id)).toEqual([id]);
	});
});

/* ============================================================
   2. Cibles non résolvables : intouchables
   ============================================================ */
describe('purgeRevoirSolides — cible non résolvable, jamais retirée', () => {
	it('id de leçon inconnu du catalogue : conservé', () => {
		const p = activeProfile();
		seed(p.uuid, REVOIR_KEY, ['lecon-inexistante']);
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual(['lecon-inexistante']);
		// Deux passes de plus : toujours conservée (et pas de trace).
		purgeRevoirSolides(p, false, NOW + JOUR);
		expect(loadRevoirFor(p.uuid)).toEqual(['lecon-inexistante']);
		expect(retraitsAutoProfil(p, NOW + JOUR)).toEqual([]);
	});

	it('liste de dictée supprimée entre-temps : conservée (on ne sait pas la juger)', () => {
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat'], [complet]); // acquise…
		toggleRevoirFor(p.uuid, orthoRevoirId(id));
		const s = loadOrtho();
		expect(deleteListe(s, id)).toBe(true); // …mais la liste disparaît
		saveOrtho(s);

		expect(purgeRevoirSolides(p, true, NOW)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual([orthoRevoirId(id)]);
	});

	it('leçon HORS du niveau du profil : conservée même étoilée à son niveau', () => {
		const p = activeProfile(); // profil CE2 par défaut
		const cm1 = leconCm1Seulement();
		seed(p.uuid, STARS_KEY, { [cm1 + '@cm1']: 1 }); // acquise en CM1
		seed(p.uuid, REVOIR_KEY, [cm1]);
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual([cm1]);
	});

	it('leçon multi-niveaux : l’étoile d’un AUTRE niveau ne la rend pas solide', () => {
		const uuid = activeProfile().uuid;
		setNiveauReferenceFor(uuid, 'cm1'); // l'enfant passe en CM1
		const lecon = leconMultiNiveau();
		seed(uuid, STARS_KEY, { [lecon + '@ce2']: 1 }); // acquise l'an dernier, en CE2
		seed(uuid, REVOIR_KEY, [lecon]);

		// Rien au niveau CM1 → la notion est à retravailler à ce niveau → conservée.
		expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([]);
		expect(loadRevoirFor(uuid)).toEqual([lecon]);

		// Étoilée cette fois AU niveau du profil → retirée.
		seed(uuid, STARS_KEY, { [lecon + '@ce2']: 1, [lecon + '@cm1']: 1 });
		expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([lecon]);
	});
});

/* ============================================================
   3. Garde-fou « épinglée alors qu'elle était DÉJÀ solide »
   ============================================================ */
describe('purgeRevoirSolides — garde-fou du choix du parent', () => {
	it('adoption au 1er passage : une file héritée (aucune marque) est purgée de ses fantômes', () => {
		const p = activeProfile();
		recordLessonResult('math-doubles', true);
		seed(p.uuid, REVOIR_KEY, ['math-doubles', 'math-moities']); // file d'avant #465
		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-doubles']);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-moities']);
	});

	it('épingler une leçon DÉJÀ acquise : l’épingle tient, passe après passe', () => {
		const p = activeProfile();
		recordLessonResult('math-doubles', true); // déjà acquise
		passeInitiale(p); // file vide : l'adoption est close
		toggleRevoirFor(p.uuid, 'math-doubles'); // le parent l'épingle quand même

		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(purgeRevoirSolides(p, false, NOW + JOUR)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-doubles']);
		expect(retraitsAutoProfil(p, NOW + JOUR)).toEqual([]);
	});

	it('vue fragile puis redevenue solide : retirée (le garde-fou ne bloque pas le cas normal)', () => {
		const p = activeProfile();
		recordLessonStats({ 'math-complements': { ok: 2, total: 10 } }); // 20 %
		passeInitiale(p); // adoption close, file encore vide
		toggleRevoirFor(p.uuid, 'math-complements'); // épinglée ALORS QU'ELLE EST FRAGILE
		expect(purgeRevoirSolides(p, false, NOW - JOUR)).toEqual([]); // marque la fragilité
		// Remontée : 5 essais parfaits de 10 questions chassent le 20 % de la fenêtre → 100 %.
		for (let i = 0; i < 5; i++) recordLessonStats({ 'math-complements': { ok: 10, total: 10 } });
		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-complements']);
	});

	it('ré-épinglage manuel après un retrait automatique : il TIENT (pas de re-retrait)', () => {
		const p = activeProfile();
		recordLessonStats({ 'math-complements': { ok: 2, total: 10 } });
		toggleRevoirFor(p.uuid, 'math-complements');
		purgeRevoirSolides(p, false, NOW - JOUR); // vue fragile → candidate
		recordLessonResult('math-complements', true); // devient solide
		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-complements']);
		expect(retraitsAutoProfil(p, NOW).map((r) => r.id)).toEqual(['math-complements']);

		toggleRevoirFor(p.uuid, 'math-complements'); // le parent la remet malgré tout
		expect(purgeRevoirSolides(p, false, NOW + MIN)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-complements']);
		// De retour en file → la trace serait trompeuse : elle disparaît du bloc.
		expect(retraitsAutoProfil(p, NOW + MIN)).toEqual([]);
	});
});

/* ============================================================
   4. Idempotence, écritures, isolation par profil
   ============================================================ */
describe('purgeRevoirSolides — idempotence et écritures', () => {
	it('deux appels consécutifs : le 2d ne retire rien et ne duplique pas la trace', () => {
		const p = activeProfile();
		recordLessonResult('math-doubles', true);
		seed(p.uuid, REVOIR_KEY, ['math-doubles', 'math-moities']);

		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-doubles']);
		const traceApres1 = retraitsAutoProfil(p, NOW);
		const journalApres1 = brut(p.uuid, REVOIR_AUTO_KEY);
		const marquesApres1 = brut(p.uuid, REVOIR_FRAGILE_KEY);

		expect(purgeRevoirSolides(p, false, NOW + MIN)).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual(['math-moities']);
		expect(retraitsAutoProfil(p, NOW + MIN)).toEqual(traceApres1); // une seule entrée, inchangée
		expect(brut(p.uuid, REVOIR_AUTO_KEY)).toBe(journalApres1); // journal pas réécrit
		expect(brut(p.uuid, REVOIR_FRAGILE_KEY)).toBe(marquesApres1); // marques stables
	});

	it('n’écrit pas la file quand rien n’est retiré', () => {
		const p = activeProfile();
		// Valeur volontairement non canonique (élément parasite) : si la file était
		// réécrite, la chaîne brute changerait.
		seedBrut(p.uuid, REVOIR_KEY, '["math-moities", 42]');
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		expect(brut(p.uuid, REVOIR_KEY)).toBe('["math-moities", 42]');
		expect(brut(p.uuid, REVOIR_AUTO_KEY)).toBeNull(); // aucun journal créé
	});

	it('n’altère pas `updatedAt` du profil (écritures brutes, comme saveRevoirFor)', () => {
		const p = activeProfile();
		recordLessonResult('math-doubles', true);
		seed(p.uuid, REVOIR_KEY, ['math-doubles']);
		figerUpdatedAt(p.uuid, 1);

		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-doubles']); // il y a bien eu écriture
		expect(profil(p.uuid).updatedAt).toBe(1);
		// Contrôle de sensibilité : une écriture NORMALE, elle, bumpe bien le profil.
		recordLessonStats({ 'math-moities': { ok: 1, total: 2 } });
		expect(profil(p.uuid).updatedAt).toBeGreaterThan(1);
	});

	it('agit sur le profil CIBLÉ, sans toucher l’actif ni le faire basculer', () => {
		const a = activeProfile();
		seed(a.uuid, STARS_KEY, { 'math-doubles@ce2': 1 });
		seed(a.uuid, REVOIR_KEY, ['math-doubles', 'math-moities']);
		const b = addProfile('Profil B'); // devient actif
		seed(b.uuid, STARS_KEY, { 'math-doubles@ce2': 1 });
		seed(b.uuid, REVOIR_KEY, ['math-doubles']);

		expect(purgeRevoirSolides(a, false, NOW)).toEqual(['math-doubles']);
		expect(loadRevoirFor(a.uuid)).toEqual(['math-moities']);
		expect(loadRevoirFor(b.uuid)).toEqual(['math-doubles']); // file de B intacte
		expect(loadProfilesMeta()?.active).toBe(b.uuid); // aucune bascule
		expect(retraitsAutoProfil(b, NOW)).toEqual([]); // trace de B vierge
	});

	it('tolère une file corrompue (valeur non tableau) sans lever', () => {
		const p = activeProfile();
		seedBrut(p.uuid, REVOIR_KEY, '{"math-doubles":true}');
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
		seedBrut(p.uuid, REVOIR_KEY, 'pas du json');
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);
	});

	/* Clé de marques PRÉSENTE mais illisible : elle ne doit PAS rouvrir l'adoption (sinon une
	   donnée corrompue retirerait d'office une épingle posée sur une notion déjà solide). Le
	   garde-fou est « fail-safe » : marques vides = aucun candidat = aucun retrait. */
	it('marques illisibles : aucun retrait (fail-safe), là où une clé ABSENTE adopte la file', () => {
		const p = activeProfile();
		recordLessonResult('math-doubles', true); // solide
		seed(p.uuid, REVOIR_KEY, ['math-doubles']);

		for (const corrompu of ['{"oops":1}', 'pas du json', '"une chaîne"', 'null']) {
			seedBrut(p.uuid, REVOIR_FRAGILE_KEY, corrompu);
			expect(purgeRevoirSolides(p, true, NOW)).toEqual([]);
			expect(loadRevoirFor(p.uuid)).toEqual(['math-doubles']);
		}
		// Contraste : clé JAMAIS écrite → adoption de la file existante → retrait.
		lsRemoveRaw(p.uuid + '/' + REVOIR_FRAGILE_KEY);
		expect(purgeRevoirSolides(p, true, NOW)).toEqual(['math-doubles']);
	});

	it('marques illisibles : la file se reconstruit d’elle-même (entrée fragile re-marquée)', () => {
		const p = activeProfile();
		recordLessonStats({ 'math-complements': { ok: 2, total: 10 } }); // 20 % → fragile
		seed(p.uuid, REVOIR_KEY, ['math-complements']);
		seedBrut(p.uuid, REVOIR_FRAGILE_KEY, '{"oops":1}');

		expect(purgeRevoirSolides(p, true, NOW)).toEqual([]); // marques repartent de zéro
		recordLessonResult('math-complements', true); // devient solide
		// La passe précédente a re-marqué l'entrée comme fragile → elle est de nouveau candidate.
		expect(purgeRevoirSolides(p, true, NOW + JOUR)).toEqual(['math-complements']);
	});
});

/* ============================================================
   5. Trace des retraits automatiques
   ============================================================ */
describe('retraitsAutoProfil — trace lisible par l’encadrant', () => {
	it('profil vierge → trace vide', () => {
		expect(retraitsAutoProfil(activeProfile(), NOW)).toEqual([]);
	});

	it('décrit chaque retrait (id ré-épinglable, kind, libellé, horodatage)', () => {
		const p = activeProfile();
		const liste = creerListe('Ma dictée', ['chat'], [complet]);
		recordLessonResult('math-doubles', true);
		seed(p.uuid, REVOIR_KEY, ['math-doubles', orthoRevoirId(liste)]);
		purgeRevoirSolides(p, true, NOW);

		expect(retraitsAutoProfil(p, NOW)).toEqual([
			{ id: 'math-doubles', kind: 'lecon', label: 'Doubles', at: NOW },
			{ id: orthoRevoirId(liste), kind: 'ortho', label: 'Ma dictée', at: NOW },
		]);
	});

	it('plus récent d’abord (deux passes à des instants différents)', () => {
		const p = activeProfile();
		recordLessonStats({ 'math-complements': { ok: 2, total: 10 } });
		recordLessonStats({ 'math-moities': { ok: 2, total: 10 } });
		seed(p.uuid, REVOIR_KEY, ['math-complements', 'math-moities']);
		purgeRevoirSolides(p, false, NOW - 5 * JOUR); // rien à retirer : les deux sont fragiles

		recordLessonResult('math-complements', true);
		expect(purgeRevoirSolides(p, false, NOW - 2 * JOUR)).toEqual(['math-complements']);
		recordLessonResult('math-moities', true);
		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-moities']);

		expect(retraitsAutoProfil(p, NOW).map((r) => [r.id, r.at])).toEqual([
			['math-moities', NOW],
			['math-complements', NOW - 2 * JOUR],
		]);
	});

	it('libellé FIGÉ au retrait : la trace reste lisible si la cible disparaît ensuite', () => {
		const p = activeProfile();
		const id = creerListe('Dictée de la semaine', ['chat'], [complet]);
		seed(p.uuid, REVOIR_KEY, [orthoRevoirId(id)]);
		expect(purgeRevoirSolides(p, true, NOW)).toEqual([orthoRevoirId(id)]);

		const s = loadOrtho();
		deleteListe(s, id); // le parent supprime la liste après coup
		saveOrtho(s);
		expect(retraitsAutoProfil(p, NOW)).toEqual([
			{ id: orthoRevoirId(id), kind: 'ortho', label: 'Dictée de la semaine', at: NOW },
		]);
	});

	/* Borne dimensionnée pour la passe d'ADOPTION (celle qui purge d'un coup les fantômes
	   d'avant #465) : 10 retraits tracés. `n` leçons CE2 étoilées, file adoptée d'un bloc. */
	function adoptionMassive(p: Profile, n: number): string[] {
		const ids = getAllLessons()
			.filter((l) => l.levels.includes('ce2'))
			.slice(0, n)
			.map((l) => l.id);
		expect(ids).toHaveLength(n);
		seed(p.uuid, STARS_KEY, Object.fromEntries(ids.map((id) => [id + '@ce2', 1]))); // toutes solides
		seed(p.uuid, REVOIR_KEY, ids);
		return ids;
	}

	it('trace intégralement une adoption de 10 fantômes (rien de perdu au cas nominal)', () => {
		const p = activeProfile();
		const ids = adoptionMassive(p, 10);
		expect(purgeRevoirSolides(p, true, NOW)).toEqual(ids);
		expect(retraitsAutoProfil(p, NOW).map((r) => r.id)).toEqual(ids);
	});

	it('bornée à 10 entrées, même si la passe en retire davantage', () => {
		const p = activeProfile();
		const ids = adoptionMassive(p, 11);
		expect(purgeRevoirSolides(p, true, NOW)).toEqual(ids); // les 11 quittent la file
		const trace = retraitsAutoProfil(p, NOW);
		expect(trace).toHaveLength(10); // la trace reste une trace récente, pas un historique
		expect(trace.every((r) => ids.includes(r.id))).toBe(true);
	});

	it('fenêtre de 30 jours : 30 j pile est encore montré, au-delà non', () => {
		const p = activeProfile();
		seed(p.uuid, REVOIR_AUTO_KEY, [
			{ id: 'a', kind: 'lecon', label: 'Hier', at: NOW - JOUR },
			{ id: 'b', kind: 'lecon', label: 'Pile 30 jours', at: NOW - 30 * JOUR },
			{ id: 'c', kind: 'lecon', label: 'Trop vieux', at: NOW - 30 * JOUR - 1 },
		]);
		expect(retraitsAutoProfil(p, NOW).map((r) => r.id)).toEqual(['a', 'b']);
	});

	it('exclut une entrée revenue dans la file (ré-épinglée)', () => {
		const p = activeProfile();
		seed(p.uuid, REVOIR_AUTO_KEY, [
			{ id: 'math-doubles', kind: 'lecon', label: 'Doubles', at: NOW },
			{ id: 'math-moities', kind: 'lecon', label: 'Moitiés', at: NOW },
		]);
		toggleRevoirFor(p.uuid, 'math-moities');
		expect(retraitsAutoProfil(p, NOW).map((r) => r.id)).toEqual(['math-doubles']);
	});

	it('tolère un journal corrompu (non tableau, entrées malformées)', () => {
		const p = activeProfile();
		seedBrut(p.uuid, REVOIR_AUTO_KEY, '{"nope":1}');
		expect(retraitsAutoProfil(p, NOW)).toEqual([]);
		seed(p.uuid, REVOIR_AUTO_KEY, [
			null,
			42,
			{ id: 'sans-le-reste' },
			{ id: 'x', kind: 'autre', label: 'Genre inconnu', at: NOW },
			{ id: 'y', kind: 'lecon', label: 'Valide', at: 'hier' },
			{ id: 'z', kind: 'lecon', label: 'Valide', at: NOW },
		]);
		expect(retraitsAutoProfil(p, NOW)).toEqual([
			{ id: 'z', kind: 'lecon', label: 'Valide', at: NOW },
		]);
	});
});

/* ============================================================
   6. Le retrait MANUEL reste souverain
   ============================================================ */
describe('retrait manuel (toggleRevoirFor) inchangé par #465', () => {
	it('dé-épingler à la main marche encore, sans laisser de trace « automatique »', () => {
		const p = activeProfile();
		recordLessonResult('math-doubles', true);
		passeInitiale(p);
		toggleRevoirFor(p.uuid, 'math-doubles'); // épinglée alors qu'acquise → protégée
		expect(purgeRevoirSolides(p, false, NOW)).toEqual([]);

		expect(toggleRevoirFor(p.uuid, 'math-doubles')).toEqual([]); // le parent la retire
		expect(loadRevoirFor(p.uuid)).toEqual([]);
		expect(retraitsAutoProfil(p, NOW)).toEqual([]); // un retrait manuel n'est pas « automatique »
	});

	it('après un retrait automatique, l’entrée peut être ré-épinglée puis re-retirée à la main', () => {
		const p = activeProfile();
		recordLessonResult('math-doubles', true);
		seed(p.uuid, REVOIR_KEY, ['math-doubles']);
		expect(purgeRevoirSolides(p, false, NOW)).toEqual(['math-doubles']);

		expect(toggleRevoirFor(p.uuid, 'math-doubles')).toEqual(['math-doubles']);
		expect(toggleRevoirFor(p.uuid, 'math-doubles')).toEqual([]);
		expect(loadRevoirFor(p.uuid)).toEqual([]);
		// La trace redevient visible : l'entrée n'est plus dans la file.
		expect(retraitsAutoProfil(p, NOW).map((r) => r.id)).toEqual(['math-doubles']);
	});
});
