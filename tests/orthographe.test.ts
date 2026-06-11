/* ============================================================
   Tests du store du mode Orthographe (Vitest).
   On repart d'un localStorage vierge + profil par défaut (préfixe actif)
   comme le fait le reste de la suite.
   ============================================================ */
import { beforeEach, describe, test, expect } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import {
	emptyOrthoState,
	loadOrtho,
	saveOrtho,
	addOrGetMot,
	createListe,
	updateListe,
	deleteListe,
	getListe,
	motsDeListe,
	ajouterMots,
	formeNormalisee,
} from '../src/core/orthographe/store';
import { checkAnswer } from '../src/core/exercise';
import { genExerciseOrtho, orthoType } from '../src/core/orthographe/exercise';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import { MODES_ORTHO } from '../src/core/orthographe/types';
import {
	statutMot,
	prochaineActivite,
	prochainModeAValider,
	modesRequis,
	validerMode,
	marquerAtelierFait,
	listeEtoilee,
} from '../src/core/orthographe/runner';
import { listOrthoLecons, motsDeLecon } from '../src/core/orthographe/lessons';
import { diffCorrect } from '../src/core/orthographe/diff';
import { gSnapshot, evaluateTrophies, loadTrophies } from '../src/core/rewards';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('orthographe — store', () => {
	test('état vide par défaut', () => {
		const s = loadOrtho();
		expect(s.banque).toEqual({});
		expect(s.listes).toEqual([]);
		expect(s.motIdParForme).toEqual({});
	});

	test('addOrGetMot crée puis déduplique par forme normalisée (trim + casse)', () => {
		const s = emptyOrthoState();
		const a = addOrGetMot(s, { mot: 'vélo' });
		const b = addOrGetMot(s, { mot: '  Vélo  ' });
		expect(b.id).toBe(a.id);
		expect(Object.keys(s.banque)).toHaveLength(1);
		expect(s.banque[a.id].mot).toBe('vélo'); // la 1re forme est conservée
	});

	test('addOrGetMot complète commeDans/homophone si absents', () => {
		const s = emptyOrthoState();
		const a = addOrGetMot(s, { mot: 'vers' });
		expect(a.commeDans).toBeUndefined();
		addOrGetMot(s, { mot: 'vers', commeDans: 'je vais vers la maison', homophone: true });
		expect(s.banque[a.id].commeDans).toBe('je vais vers la maison');
		expect(s.banque[a.id].homophone).toBe(true);
	});

	test('un nouveau mot initialise validation/atelier à zéro et entre en révision', () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'fleur' });
		expect(m.validation).toEqual({ motCache: false, tuiles: false, dictee: false });
		expect(m.atelierFait).toBe(false);
		expect(m.revision.palier).toBe(0);
		// Entrée en rotation de révision espacée dès l'ajout (#45) : 1er re-test à venir.
		expect(typeof m.revision.prochaineRevision).toBe('number');
		expect(m.revision.prochaineRevision!).toBeGreaterThan(Date.now());
	});

	test('createListe référence des ids dédupliqués et alimente la banque', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [
			{ mot: 'chat' },
			{ mot: 'chien' },
			{ mot: 'chat' }, // doublon dans la même liste
			{ mot: '   ' }, // entrée vide ignorée
		]);
		expect(liste.motIds).toHaveLength(2);
		expect(Object.keys(s.banque)).toHaveLength(2);
		expect(motsDeListe(s, liste).map((m) => m.mot)).toEqual(['chat', 'chien']);
	});

	test('un mot partagé entre deux listes garde un seul id (historique commun)', () => {
		const s = emptyOrthoState();
		const l1 = createListe(s, 'L1', [{ mot: 'temps' }]);
		const l2 = createListe(s, 'L2', [{ mot: 'Temps' }]);
		expect(Object.keys(s.banque)).toHaveLength(1);
		expect(l1.motIds[0]).toBe(l2.motIds[0]);
	});

	test('deleteListe retire la liste mais garde les mots en banque', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'maison' }]);
		expect(deleteListe(s, liste.id)).toBe(true);
		expect(s.listes).toHaveLength(0);
		expect(Object.keys(s.banque)).toHaveLength(1); // corpus de l'année conservé
		expect(deleteListe(s, 'inconnu')).toBe(false);
	});

	test('persistance via load/save (clé préfixée par profil)', () => {
		const s = emptyOrthoState();
		createListe(s, 'Semaine 1', [{ mot: 'jardin' }]);
		saveOrtho(s);
		const reloaded = loadOrtho();
		expect(reloaded.listes).toHaveLength(1);
		expect(reloaded.listes[0].label).toBe('Semaine 1');
		expect(Object.keys(reloaded.banque)).toHaveLength(1);
	});

	test('updateListe : modifie label/date et reconstruit les mots', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Avant', [{ mot: 'chat' }, { mot: 'chien' }]);
		const r = updateListe(s, liste.id, 'Après', [{ mot: 'chat' }, { mot: 'cheval' }], '2026-06-12');
		expect(r).not.toBeNull();
		const maj = getListe(s, liste.id)!;
		expect(maj.label).toBe('Après');
		expect(maj.dateControle).toBe('2026-06-12');
		expect(motsDeListe(s, maj).map((m) => m.mot)).toEqual(['chat', 'cheval']);
	});

	test('updateListe : id inconnu -> null', () => {
		const s = emptyOrthoState();
		expect(updateListe(s, 'inconnu', 'L', [{ mot: 'a' }])).toBeNull();
	});

	test('addOrGetMot : met à jour commeDans sur un mot existant', () => {
		const s = emptyOrthoState();
		const a = addOrGetMot(s, { mot: 'vers', commeDans: 'phrase 1' });
		addOrGetMot(s, { mot: 'vers', commeDans: 'phrase 2' });
		expect(s.banque[a.id].commeDans).toBe('phrase 2');
	});
});

describe("orthographe — génération d'exercice", () => {
	test('motCache : affiche/masque, vérification texte stricte (accent exigé)', () => {
		const s = emptyOrthoState();
		const mot = addOrGetMot(s, { mot: 'château' });
		const ex = genExerciseOrtho(mot, 'motCache');
		expect(ex.type).toBe('motCache');
		expect(checkAnswer(ex, 'château')).toBe(true);
		expect(checkAnswer(ex, 'chateau')).toBe(false);
	});

	test('dictee : embarque commeDans', () => {
		const s = emptyOrthoState();
		const mot = addOrGetMot(s, { mot: 'vers', commeDans: 'je vais vers la maison' });
		const ex = genExerciseOrtho(mot, 'dictee');
		expect(ex.type).toBe('dictee');
		if (ex.type === 'dictee') expect(ex.commeDans).toBe('je vais vers la maison');
		expect(checkAnswer(ex, 'vers')).toBe(true);
	});

	test('tuiles : permutation des lettres exactes du mot', () => {
		const s = emptyOrthoState();
		const mot = addOrGetMot(s, { mot: 'chien' });
		const ex = genExerciseOrtho(mot, 'tuiles');
		expect(ex.type).toBe('tuiles');
		if (ex.type === 'tuiles') {
			expect([...ex.lettres].sort()).toEqual([...'chien'].sort());
			expect(ex.lettres).toHaveLength(5);
		}
		expect(checkAnswer(ex, 'chien')).toBe(true);
	});

	test('orthoType est mode-aware (defaut motCache)', () => {
		const s = emptyOrthoState();
		const mot = addOrGetMot(s, { mot: 'fleur' });
		const t = orthoType(mot);
		// Descripteurs de modes ciblés, dans l'ordre d'étayage (tuiles → mot caché → dictée).
		expect(t.modes?.map((m) => m.id)).toEqual(['tuiles', 'motCache', 'dictee']);
		expect(t.generate('tuiles').type).toBe('tuiles');
		expect(t.generate().type).toBe('motCache');
	});
});

describe('orthographe — leçons prédéfinies', () => {
	test('ORTHO_PREDEF : ids préfixés, libellés et mots présents', () => {
		expect(ORTHO_PREDEF.length).toBeGreaterThan(0);
		for (const l of ORTHO_PREDEF) {
			expect(l.id).toMatch(/^fr-ortho-/);
			expect(l.label.length).toBeGreaterThan(0);
			expect(l.mots.length).toBeGreaterThan(0);
		}
	});

	test('matérialisation : les mots prédéfinis entrent dans la banque', () => {
		const s = emptyOrthoState();
		const lecon = ORTHO_PREDEF[0];
		const ids = ajouterMots(s, lecon.mots, 'predefini');
		expect(ids).toHaveLength(lecon.mots.length);
		expect(Object.keys(s.banque)).toHaveLength(lecon.mots.length);
		expect(s.banque[ids[0]].origine).toBe('predefini');
	});

	test('ORTHO_PREDEF : aucun doublon de mot (forme normalisée) sur tout le jeu', () => {
		const formes = ORTHO_PREDEF.flatMap((l) => l.mots.map((mi) => formeNormalisee(mi.mot)));
		expect(new Set(formes).size).toBe(formes.length);
	});
});

describe('orthographe — runner (logique pure)', () => {
	test('mot neuf : statut nouveau, activité = atelier', () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'chat' });
		expect(statutMot(m, true)).toBe('nouveau');
		expect(prochaineActivite(m, true)).toBe('atelier');
	});

	test("après l'atelier, la séquence est tuiles -> motCache -> dictee", () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'chat' });
		marquerAtelierFait(m);
		expect(statutMot(m, true)).toBe('enCours');
		expect(prochaineActivite(m, true)).toBe('tuiles');
		validerMode(m, 'tuiles');
		expect(prochaineActivite(m, true)).toBe('motCache');
		validerMode(m, 'motCache');
		expect(prochaineActivite(m, true)).toBe('dictee');
		validerMode(m, 'dictee');
		expect(statutMot(m, true)).toBe('maitrise');
	});

	test('sans TTS : la dictée n est pas requise', () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'chat' });
		marquerAtelierFait(m);
		validerMode(m, 'tuiles');
		validerMode(m, 'motCache');
		expect(modesRequis(false)).toEqual(['tuiles', 'motCache']);
		expect(prochainModeAValider(m, false)).toBeNull();
		expect(statutMot(m, false)).toBe('maitrise');
	});

	test("mot maîtrisé : activité = un mode (jamais l'atelier)", () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'chat' });
		marquerAtelierFait(m);
		MODES_ORTHO.forEach((md) => validerMode(m, md));
		const act = prochaineActivite(m, true);
		expect(act).not.toBe('atelier');
		expect(MODES_ORTHO).toContain(act);
	});

	test('étoile de liste quand tous les mots sont maîtrisés', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'chat' }, { mot: 'chien' }]);
		const mots = motsDeListe(s, liste);
		expect(listeEtoilee(mots, false)).toBe(false);
		mots.forEach((m) => {
			marquerAtelierFait(m);
			validerMode(m, 'tuiles');
			validerMode(m, 'motCache');
		});
		expect(listeEtoilee(mots, false)).toBe(true);
		expect(listeEtoilee(mots, true)).toBe(false); // dictée requise mais non validée
	});
});

describe('orthographe — leçons (prédéfinies + listes)', () => {
	test('listOrthoLecons : prédéfinies seules sur profil vierge', () => {
		const s = emptyOrthoState();
		const lecons = listOrthoLecons(s);
		expect(lecons).toHaveLength(ORTHO_PREDEF.length);
		expect(lecons.every((l) => l.source === 'predefini')).toBe(true);
	});

	test('listOrthoLecons : ajoute les listes du profil', () => {
		const s = emptyOrthoState();
		createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		const lecons = listOrthoLecons(s);
		expect(lecons).toHaveLength(ORTHO_PREDEF.length + 1);
		const liste = lecons.find((l) => l.source === 'liste')!;
		expect(liste.label).toBe('Semaine 1');
		expect(liste.nbMots).toBe(2);
	});

	test('motsDeLecon : leçon prédéfinie matérialisée dans la banque', () => {
		const s = emptyOrthoState();
		const lecon = ORTHO_PREDEF[0];
		const mots = motsDeLecon(s, lecon.id);
		expect(mots).toHaveLength(lecon.mots.length);
		expect(Object.keys(s.banque)).toHaveLength(lecon.mots.length);
	});

	test('motsDeLecon : liste du profil', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'maison' }]);
		expect(motsDeLecon(s, liste.id).map((m) => m.mot)).toEqual(['maison']);
	});

	test('motsDeLecon : id inconnu -> liste vide', () => {
		const s = emptyOrthoState();
		expect(motsDeLecon(s, 'inconnu')).toEqual([]);
	});
});

describe('orthographe — diff de correction', () => {
	test('saisie correcte -> aucune lettre marquée', () => {
		expect(diffCorrect('château', 'château')).toEqual([
			false,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});

	test('accent oublié -> seule la lettre accentuée est marquée', () => {
		// « chateau » vs « château » : le â (index 2) est marqué.
		expect(diffCorrect('chateau', 'château')).toEqual([
			false,
			false,
			true,
			false,
			false,
			false,
			false,
		]);
	});

	test('saisie vide -> toutes les lettres marquées', () => {
		expect(diffCorrect('', 'chat')).toEqual([true, true, true, true]);
	});

	test('lettre finale muette oubliée -> dernière lettre marquée', () => {
		// « gran » vs « grand » : le d final est marqué.
		const d = diffCorrect('gran', 'grand');
		expect(d[d.length - 1]).toBe(true);
		expect(d.slice(0, -1)).toEqual([false, false, false, false]);
	});
});

describe('orthographe — récompenses', () => {
	test('gSnapshot expose les métriques orthographe', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'chat' }, { mot: 'chien' }]);
		const m = motsDeListe(s, liste);
		marquerAtelierFait(m[0]);
		validerMode(m[0], 'motCache');
		validerMode(m[0], 'tuiles');
		saveOrtho(s);
		const g = gSnapshot();
		expect(g.orthoMotsAtelier).toBe(1);
		expect(g.orthoMotsMaitrises).toBe(1);
		expect(g.orthoListesMaitrisees).toBe(0); // le 2e mot n'est pas maîtrisé
	});

	test('le trophée « première liste » se débloque quand une liste est maîtrisée', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'chat' }]);
		const m = motsDeListe(s, liste);
		validerMode(m[0], 'motCache');
		validerMode(m[0], 'tuiles');
		saveOrtho(s);
		const newly = evaluateTrophies();
		expect(newly.some((t) => t.id === 'orthoListes1')).toBe(true);
		expect(loadTrophies()).toContain('orthoListes1');
	});
});
