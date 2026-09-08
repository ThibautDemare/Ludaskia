/* ============================================================
   Mots casés (#664) — le MOTEUR DE GRILLE DE MOTS, générique.

   Écrit AVANT l'implémentation, d'après les critères numérotés de l'issue #664.
   Le module `src/core/jeux/grille-mots.ts` n'existe pas encore : ce fichier est
   ROUGE À L'IMPORT, et c'est le résultat attendu à ce stade.

   ── LE CONTRAT QUE CES TESTS FIGENT ─────────────────────────────────────────

   `src/core/jeux/grille-mots.ts` doit exporter :

     export type Sens = 'h' | 'v';
     export interface Case { ligne: number; colonne: number }
     export interface Emplacement {
       ligne: number; colonne: number; longueur: number; sens: Sens;
     }
     export interface Motif {
       id: string; largeur: number; hauteur: number; emplacements: Emplacement[];
     }
     // `a` < `b` : deux index d'emplacements, et la position de la lettre
     // partagée DANS CHACUN des deux mots.
     export interface Croisement {
       a: number; b: number; indexA: number; indexB: number;
       ligne: number; colonne: number;
     }
     export interface Grille { motif: Motif; poses: readonly (string | null)[] }

     export function casesDe(e: Emplacement): Case[];
     export function croisements(m: Motif): Croisement[];
     export function grilleNeuve(m: Motif): Grille;
     export function poser(g: Grille, emplacement: number, mot: string): Grille;
     export function retirer(g: Grille, emplacement: number): Grille;
     export function emplacementsCompatibles(g: Grille, mot: string): number[];
     export function conflits(g: Grille): Croisement[];
     export function lettresEn(g: Grille, ligne: number, colonne: number): string[];
     export function complete(g: Grille): boolean;
     export function terminee(g: Grille): boolean;

   Ce module NE CONNAÎT NI LE FRANÇAIS NI LE JEU : ni vivier, ni taille de
   grille, ni stockage. C'est la condition posée par l'issue pour que #665 (mots
   croisés) le réutilise en ne changeant que la source des mots. Tous les tests
   d'ici emploient donc des suites de lettres inventées, jamais des mots du
   dépôt : un moteur qui aurait besoin d'un vrai mot pour marcher ne serait pas
   celui-là.

   Critères portés ici : 16 (un mot ne se pose que dans un emplacement de sa
   longueur), 20 (la pose en conflit est ACCEPTÉE et le croisement fautif est
   signalé SUR LES DEUX mots), 22 (la lettre d'un croisement se compare accents
   compris), 23 (terminée = pleine ET sans conflit). Le moteur sert aussi les
   critères 5 à 10, mesurés ailleurs (`mots-cases2.test.ts`, `mots-cases.test.ts`).

   ── TROIS CHOIX DE CONTRAT, ET LEUR RAISON ──────────────────────────────────

   1. **Rien ne mute la grille reçue.** Même invariant que le moteur du sudoku
      (#666) : le runner garde son état et le remplissage essaie puis revient en
      arrière. Une fonction qui écrirait dans le tableau reçu corromprait l'un ou
      l'autre sans rien lever.
   2. **Ce qui n'a pas de sens est refusé EN SILENCE**, jamais par une exception :
      index hors motif, mot de la mauvaise longueur, emplacement déjà occupé. Un
      runner qui reçoit un appui inattendu n'a rien à rattraper, et une exception
      y serait une panne pour l'enfant. C'est la convention de `poser` du sudoku.
   3. **Un emplacement occupé ne se remplace pas : il faut retirer d'abord.** Le
      moteur ne détient pas la liste des mots à placer (c'est le jeu qui la
      tient) ; une pose qui écraserait un mot posé le ferait disparaître de la
      grille SANS le rendre à la liste, et l'enfant le perdrait pour de bon.
      L'autre conception — remplacer et laisser l'appelant remettre le mot dans
      la liste — a été écartée pour cette seule raison.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	casesDe,
	complete,
	conflits,
	croisements,
	emplacementsCompatibles,
	grilleNeuve,
	lettresEn,
	poser,
	retirer,
	terminee,
	type Emplacement,
	type Grille,
	type Motif,
} from '../src/core/jeux/grille-mots';

const H = (ligne: number, colonne: number, longueur: number): Emplacement => ({
	ligne,
	colonne,
	longueur,
	sens: 'h',
});
const V = (ligne: number, colonne: number, longueur: number): Emplacement => ({
	ligne,
	colonne,
	longueur,
	sens: 'v',
});

/** Un « T » : l'horizontal croise le vertical À DES INDEX DIFFÉRENTS (2 et 0).

    Volontairement dissymétrique. Un moteur qui confondrait `indexA` et `indexB`
    passerait tous les tests d'une croix centrée, où les deux valent la même
    chose — c'est exactement le genre d'inversion qui ne se voit qu'à l'écran,
    des semaines plus tard, sur une lettre fausse. */
const T: Motif = { id: 't', largeur: 3, hauteur: 3, emplacements: [H(0, 0, 3), V(0, 2, 3)] };

/** Deux horizontaux de même longueur reliés par un vertical : le plus petit
    motif qui ait un couple de même longueur et deux croisements. */
const ECHELLE: Motif = {
	id: 'echelle',
	largeur: 3,
	hauteur: 3,
	emplacements: [H(0, 0, 3), H(2, 0, 3), V(0, 1, 3)],
};

const pose = (m: Motif, mots: (string | null)[]): Grille =>
	mots.reduce<Grille>((g, mot, i) => (mot === null ? g : poser(g, i, mot)), grilleNeuve(m));

describe('#664 — la géométrie d’un emplacement', () => {
	it('énumère les cases d’un mot horizontal de gauche à droite', () => {
		expect(casesDe(H(1, 2, 3))).toEqual([
			{ ligne: 1, colonne: 2 },
			{ ligne: 1, colonne: 3 },
			{ ligne: 1, colonne: 4 },
		]);
	});

	it('énumère les cases d’un mot vertical de haut en bas', () => {
		expect(casesDe(V(1, 2, 3))).toEqual([
			{ ligne: 1, colonne: 2 },
			{ ligne: 2, colonne: 2 },
			{ ligne: 3, colonne: 2 },
		]);
	});

	it('rend autant de cases que le mot a de lettres', () => {
		for (const n of [2, 3, 5, 8]) {
			expect(casesDe(H(0, 0, n)), `longueur ${n}`).toHaveLength(n);
			expect(casesDe(V(0, 0, n)), `longueur ${n}`).toHaveLength(n);
		}
	});
});

describe('#664 — les croisements, calculés depuis les emplacements', () => {
	it('trouve la case partagée et la position de la lettre DANS CHAQUE mot', () => {
		/* L'horizontal occupe (0,0) (0,1) (0,2), le vertical (0,2) (1,2) (2,2).
		   Ils partagent (0,2) : 3e lettre de l'horizontal, 1re du vertical. */
		expect(croisements(T)).toEqual([{ a: 0, b: 1, indexA: 2, indexB: 0, ligne: 0, colonne: 2 }]);
	});

	it('ne voit aucun croisement entre deux emplacements qui ne se touchent pas', () => {
		const disjoints: Motif = {
			id: 'disjoints',
			largeur: 5,
			hauteur: 3,
			emplacements: [H(0, 0, 2), V(0, 4, 3)],
		};
		expect(croisements(disjoints)).toEqual([]);
	});

	it('ne croise pas un emplacement avec lui-même', () => {
		for (const c of croisements(ECHELLE)) expect(c.a).not.toBe(c.b);
	});

	it('ne compte chaque croisement qu’une fois, et toujours dans l’ordre a < b', () => {
		const cs = croisements(ECHELLE);
		expect(cs).toHaveLength(2);
		for (const c of cs) expect(c.a).toBeLessThan(c.b);
		expect(new Set(cs.map((c) => `${c.ligne},${c.colonne}`)).size).toBe(cs.length);
	});

	it('sur un motif bien formé, apparie toujours un horizontal et un vertical', () => {
		// Deux mots de même sens qui partageraient une case ne se CROISENT pas, ils se
		// recouvrent : c'est un défaut de données, interdit côté motifs.
		for (const c of croisements(ECHELLE)) {
			const sens = [ECHELLE.emplacements[c.a].sens, ECHELLE.emplacements[c.b].sens];
			expect(new Set(sens).size, JSON.stringify(c)).toBe(2);
		}
	});

	it('ne dépend pas de l’ordre de lecture : la case partagée est la même des deux côtés', () => {
		for (const c of croisements(ECHELLE)) {
			expect(casesDe(ECHELLE.emplacements[c.a])[c.indexA]).toEqual({
				ligne: c.ligne,
				colonne: c.colonne,
			});
			expect(casesDe(ECHELLE.emplacements[c.b])[c.indexB]).toEqual({
				ligne: c.ligne,
				colonne: c.colonne,
			});
		}
	});
});

describe('#664 — une grille neuve', () => {
	it('n’a rien de posé, n’est ni pleine ni terminée, et n’a aucun conflit', () => {
		const g = grilleNeuve(T);
		expect([...g.poses]).toEqual([null, null]);
		expect(complete(g)).toBe(false);
		expect(terminee(g)).toBe(false);
		expect(conflits(g)).toEqual([]);
	});

	it('a une case posée par emplacement du motif', () => {
		expect(grilleNeuve(ECHELLE).poses).toHaveLength(ECHELLE.emplacements.length);
	});
});

describe('#664 critère 16 — un mot ne se pose que dans un emplacement de SA longueur', () => {
	it('accepte un mot de la bonne longueur', () => {
		const g = poser(grilleNeuve(T), 0, 'abc');
		expect(g.poses[0]).toBe('abc');
	});

	it('refuse un mot trop long et un mot trop court, sans rien changer', () => {
		/* « Ce n'est pas une erreur, c'est une impossibilité physique, et elle se
		   refuse sans commentaire » : pas d'exception, pas de marque, rien. */
		const g = grilleNeuve(T);
		for (const mot of ['ab', 'abcd', '', 'abcdefgh']) {
			expect(poser(g, 0, mot).poses, `mot « ${mot} »`).toEqual(g.poses);
		}
	});

	it('mesure la longueur APRÈS normalisation NFC, pas en unités de code', () => {
		/* `ébc` s'écrit avec 3 unités (NFC) ou 4 (NFD : `e` + accent combinant). Un
		   moteur qui lit `mot.length` brut refuse donc le même mot de 3 lettres une
		   fois sur deux, selon la façon dont il a été écrit dans les données.

		   La règle de contrat, unique et suffisante : tout passe par NFC avant d'être
		   mesuré ET avant d'être comparé (c'est aussi ce que fait déjà le Motus). */
		const nfd = 'ébc'.normalize('NFD');
		expect(nfd.length).toBe(4); // le piège existe bien
		expect(poser(grilleNeuve(T), 0, nfd).poses[0]).toBeTruthy();
	});

	it('refuse un index d’emplacement qui n’existe pas', () => {
		const g = grilleNeuve(T);
		for (const i of [-1, 2, 99, 1.5, Number.NaN]) {
			expect(poser(g, i, 'abc').poses, `index ${i}`).toEqual(g.poses);
		}
	});

	it('refuse d’écraser un emplacement déjà occupé', () => {
		// Contrat : il faut retirer d'abord. Sinon le mot écrasé disparaîtrait de la
		// grille sans revenir dans la liste, et l'enfant le perdrait.
		const g = poser(grilleNeuve(T), 0, 'abc');
		expect(poser(g, 0, 'xyz').poses[0]).toBe('abc');
	});

	it('ne mute jamais la grille reçue', () => {
		const g = grilleNeuve(T);
		const avant = [...g.poses];
		poser(g, 0, 'abc');
		poser(g, 1, 'cde');
		expect([...g.poses]).toEqual(avant);
	});
});

describe('#664 — retirer un mot', () => {
	it('libère l’emplacement et laisse les autres en place', () => {
		const g = pose(T, ['abc', 'cde']);
		const apres = retirer(g, 0);
		expect(apres.poses[0]).toBeNull();
		expect(apres.poses[1]).toBe('cde');
	});

	it('ne change rien sur un emplacement vide ou un index inconnu', () => {
		const g = poser(grilleNeuve(T), 0, 'abc');
		expect(retirer(g, 1).poses).toEqual(g.poses);
		for (const i of [-1, 7, 2.5]) expect(retirer(g, i).poses, `index ${i}`).toEqual(g.poses);
	});

	it('ne mute pas la grille reçue', () => {
		const g = pose(T, ['abc', 'cde']);
		const avant = [...g.poses];
		retirer(g, 0);
		expect([...g.poses]).toEqual(avant);
	});

	it('rend une grille identique à celle d’avant la pose', () => {
		const g = grilleNeuve(T);
		expect([...retirer(poser(g, 0, 'abc'), 0).poses]).toEqual([...g.poses]);
	});
});

describe('#664 — les emplacements où un mot peut aller', () => {
	it('ne retient que les emplacements LIBRES de la bonne longueur', () => {
		const g = grilleNeuve(ECHELLE); // trois emplacements de 3
		expect(emplacementsCompatibles(g, 'abc')).toEqual([0, 1, 2]);
		expect(emplacementsCompatibles(poser(g, 1, 'xyz'), 'abc')).toEqual([0, 2]);
	});

	it('n’en retient aucun pour un mot d’une longueur absente du motif', () => {
		expect(emplacementsCompatibles(grilleNeuve(ECHELLE), 'abcd')).toEqual([]);
	});

	it('retient un emplacement même si le mot y ENTRERAIT EN CONFLIT (critère 20)', () => {
		/* Le conflit ne bloque pas la pose : filtrer ici les emplacements « qui
		   marchent » transformerait le surlignage d'aide du critère 30 en solveur,
		   et priverait l'enfant de l'essai-erreur qui EST la résolution. */
		const g = poser(grilleNeuve(T), 1, 'xyz'); // le vertical impose 'x' en (0,2)
		expect(emplacementsCompatibles(g, 'abc')).toEqual([0]);
	});
});

describe('#664 critère 20 — le conflit se pose quand même, et se voit des DEUX côtés', () => {
	it('accepte la pose contradictoire', () => {
		// « Un mot dont une lettre contredit un mot déjà posé SE POSE QUAND MÊME. »
		const g = pose(T, ['abc', 'xyz']);
		expect([...g.poses]).toEqual(['abc', 'xyz']);
	});

	it('signale le croisement fautif en nommant les deux emplacements', () => {
		/* Cas d'échec du critère : « le conflit ne se voit que sur le dernier mot
		   posé ». Le moteur ne sait pas lequel des deux est « le mauvais » — il n'y
		   en a pas — donc il rend le CROISEMENT, qui porte les deux. */
		const cs = conflits(pose(T, ['abc', 'xyz']));
		expect(cs).toHaveLength(1);
		expect([cs[0].a, cs[0].b]).toEqual([0, 1]);
		expect({ ligne: cs[0].ligne, colonne: cs[0].colonne }).toEqual({ ligne: 0, colonne: 2 });
	});

	it('ne signale rien tant qu’un seul des deux mots est posé', () => {
		expect(conflits(poser(grilleNeuve(T), 0, 'abc'))).toEqual([]);
		expect(conflits(poser(grilleNeuve(T), 1, 'xyz'))).toEqual([]);
	});

	it('ne signale rien quand les deux mots s’accordent sur la lettre partagée', () => {
		expect(conflits(pose(T, ['abc', 'cde']))).toEqual([]);
	});

	it('cesse de signaler dès que le mot fautif est retiré', () => {
		const g = pose(T, ['abc', 'xyz']);
		expect(conflits(retirer(g, 1))).toEqual([]);
	});

	it('signale chaque croisement fautif séparément', () => {
		// Deux croisements en désaccord = deux signalements : l'enfant doit pouvoir
		// voir LESQUELS, pas seulement « il y a un problème quelque part ».
		const cs = conflits(pose(ECHELLE, ['abc', 'def', 'xyz']));
		expect(cs).toHaveLength(2);
		expect(cs.map((c) => `${c.ligne},${c.colonne}`).sort()).toEqual(['0,1', '2,1']);
	});
});

describe('#664 critère 22 — la lettre d’un croisement se compare ACCENTS COMPRIS', () => {
	it('É et E dans la même case, c’est un conflit', () => {
		/* Arbitrage 2 du cadrage : comparer sur la lettre non accentuée ferait
		   afficher, dans une case, une lettre fausse pour l'un des deux mots —
		   inacceptable dans un jeu dont le seul bénéfice de langue est l'exposition
		   à la forme correcte. */
		expect(conflits(pose(T, ['abé', 'ede']))).toHaveLength(1);
		expect(conflits(pose(T, ['abe', 'éde']))).toHaveLength(1);
	});

	it('mais la MÊME lettre écrite en NFC ou en NFD n’en est pas un', () => {
		/* Le piège inverse, et il est réel : `é` s'écrit d'une seule unité (NFC) ou
		   d'un `e` suivi d'un accent combinant (NFD). Ce sont deux façons d'écrire la
		   MÊME lettre ; un moteur qui compare les chaînes brutes verrait un conflit
		   là où l'enfant voit deux fois « É », sans aucun moyen de s'en sortir. */
		const ACCENT_COMBINANT = '́';
		const nfc = 'abé'.normalize('NFC');
		const nfd = 'éde'.normalize('NFD');
		expect(nfc).not.toContain(ACCENT_COMBINANT);
		expect(nfd).toContain(ACCENT_COMBINANT); // les deux formes sont bien distinctes
		const g = pose(T, [nfc, nfd]);
		// Les DEUX mots sont bien posés : sans ce contrôle, un moteur qui refuserait
		// le mot NFD pour cause de longueur rendrait ce test vert sans rien tenir.
		expect(g.poses.filter((m) => m !== null)).toHaveLength(2);
		expect(conflits(g)).toEqual([]);
	});

	it('la case de croisement porte UNE lettre quand les deux mots s’accordent', () => {
		expect(lettresEn(pose(T, ['abc', 'cde']), 0, 2)).toEqual(['c']);
	});

	it('et les deux lettres réclamées quand ils se contredisent', () => {
		// C'est ce qui permet au rendu de montrer l'état de la grille au lieu de
		// choisir arbitrairement l'une des deux (critère 31 : le conflit n'est pas
		// une aide, c'est l'état).
		expect(lettresEn(pose(T, ['abc', 'xyz']), 0, 2).sort()).toEqual(['c', 'x']);
	});

	it('rend la lettre d’un mot seul, et rien sur une case vide ou hors motif', () => {
		const g = poser(grilleNeuve(T), 0, 'abc');
		expect(lettresEn(g, 0, 0)).toEqual(['a']);
		expect(lettresEn(g, 2, 2)).toEqual([]); // case du vertical, non posé
		expect(lettresEn(g, 1, 0)).toEqual([]); // case hors de tout emplacement
		expect(lettresEn(g, 9, 9)).toEqual([]); // hors grille
	});
});

describe('#664 critère 23 — terminée = PLEINE et SANS CONFLIT', () => {
	it('une grille pleine et cohérente est terminée', () => {
		const g = pose(T, ['abc', 'cde']);
		expect(complete(g)).toBe(true);
		expect(terminee(g)).toBe(true);
	});

	it('une grille PLEINE qui porte un conflit ne l’est pas', () => {
		/* Cas d'échec littéral : « une grille pleine portant un conflit déclare la
		   partie finie ». C'est l'état que l'arbitrage 3 rend atteignable en
		   acceptant la pose fautive — il fallait donc que la fin de partie le
		   distingue. */
		const g = pose(T, ['abc', 'xyz']);
		expect(complete(g)).toBe(true);
		expect(terminee(g)).toBe(false);
	});

	it('une grille cohérente mais incomplète ne l’est pas non plus', () => {
		const g = poser(grilleNeuve(T), 0, 'abc');
		expect(complete(g)).toBe(false);
		expect(terminee(g)).toBe(false);
	});

	it('cesse d’être terminée si l’on retire un mot', () => {
		expect(terminee(retirer(pose(T, ['abc', 'cde']), 0))).toBe(false);
	});
});
