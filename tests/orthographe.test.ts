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
  deleteListe,
  motsDeListe,
} from '../src/core/orthographe/store';
import { checkAnswer } from '../src/core/exercise';
import { genExerciseOrtho, orthoType } from '../src/core/orthographe/exercise';

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

  test('un nouveau mot initialise validation/atelier/révision à zéro', () => {
    const s = emptyOrthoState();
    const m = addOrGetMot(s, { mot: 'fleur' });
    expect(m.validation).toEqual({ motCache: false, tuiles: false, dictee: false });
    expect(m.atelierFait).toBe(false);
    expect(m.revision.palier).toBe(0);
    expect(m.revision.prochaineRevision).toBeNull();
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
    expect(t.modes).toEqual(['motCache', 'tuiles', 'dictee']);
    expect(t.generate('tuiles').type).toBe('tuiles');
    expect(t.generate().type).toBe('motCache');
  });
});
