/* ============================================================
   Mots casés (#664) — LE JEU : catalogue, vivier, remplissage, tirage.

   Écrit AVANT l'implémentation, d'après les critères numérotés de l'issue #664.
   `src/core/jeux/mots-cases.ts` n'existe pas encore : ce fichier est ROUGE À
   L'IMPORT, et c'est le résultat attendu à ce stade.

   ── LE CONTRAT QUE CES TESTS FIGENT ─────────────────────────────────────────

   `src/core/jeux/mots-cases.ts` doit exporter :

     export function motifsDe(taille: TailleMotsCases): MotifMotsCases[];
     // TOUS les mots des banques du critère 12, forme jouable, sans doublon.
     export function vivierMotsCases(): string[];
     // Un mot par emplacement, dans l'ordre des emplacements, ou `null` si le
     // motif ne se remplit pas avec ce tirage. Pur : aléa injecté.
     export function remplir(motif: Motif, r: () => number): string[] | null;
     export interface PartieMotsCases {
       motif: MotifMotsCases;
       // La liste COMPLÈTE des mots de la grille, mélangée. Un par emplacement.
       mots: string[];
       grille: Grille;
     }
     export function tirerGrille(taille: TailleMotsCases, r: () => number): PartieMotsCases;
     // Les mots de `mots` qui ne sont pas encore posés dans `grille`.
     export function motsDisponibles(p: PartieMotsCases): string[];

   **La partie servie ne porte PAS la solution.** L'exposer donnerait à l'écran
   un indice tout prêt, que le hors-périmètre de l'issue refuse (« un indice qui
   révélerait un mot ou son emplacement »). Ces tests vérifient donc la
   résolubilité en REFAISANT le placement eux-mêmes, avec leur propre solveur —
   c'est aussi ce qui rend le critère 9 vérifiable sans lire l'implémentation.

   **`tirerGrille` rend toujours une partie.** Si un motif ne se remplit pas avec
   ce tirage, elle en essaie un autre : servir `null` obligerait le runner à
   gérer un cas « pas de grille aujourd'hui » qui n'a aucun sens pour l'enfant.
   Le cas où AUCUN motif d'une taille ne se remplit est un défaut de données,
   attrapé ici par le test de remplissabilité motif par motif.

   Critères portés : 1 et 2 (le catalogue), 9, 10, 11 et 12 (par échantillon de
   200 tirages), 13 (les deux tailles existent et ont leurs motifs), 40 (le jeu
   ignore la classe du profil), et la moitié logique du 17 (`motsDisponibles`).

   ── MESURES FAITES AVANT D'ÉCRIRE, ET QUI CHANGENT LA LECTURE ───────────────

   Vivier réel des deux banques : 276 mots de forme jouable, dont 238 de 3 à 8
   lettres — 3 mots de 3 lettres, 28 de 4, 46 de 5, 60 de 6, 58 de 7, 43 de 8.
   (L'issue annonce « environ 215 » ; l'écart vient des mots que le Motus écarte
   et que le critère 12 réintègre.)

   1. **Le critère 9 est atteignable, largement.** Sur dix motifs prototypés et
      200 tirages chacun, le remplissage réussit 200/200 partout SAUF sur un
      carré de mots 5×5 (3 horizontaux et 3 verticaux entièrement croisés,
      9 croisements pour 6 mots) : 0/200. Ce qui coince n'est pas la taille du
      vivier, c'est la DENSITÉ des croisements. Un motif à 8 emplacements et
      8 croisements sur 10×9 se remplit sans une seule perte.

   2. **Le critère 22 ne coûte rien et sert beaucoup.** Les lettres accentuées ne
      pèsent que 58 occurrences sur 1461 (4 %), et comparer strictement n'a fait
      échouer AUCUN remplissage qu'une comparaison sans accent aurait réussi
      (200/200 des deux côtés, sur les dix motifs). En revanche, avec une
      comparaison sans accent, 50 à 87 % des grilles remplies portent au moins un
      croisement où les deux mots ne sont pas d'accord sur l'accent — c'est-à-dire
      une case qui afficherait É pour l'un et E pour l'autre. La crainte du
      cadrage (« réduit fortement les remplissages possibles ») est mesurément
      infondée ; le bénéfice, lui, est massif.

   3. **Le critère 10 ne mord que sur les motifs MAIGRES.** Sur tous les motifs à
      au moins deux croisements par couple de même longueur, 0 grille sur 200 est
      entièrement échangeable — le critère est alors vrai par construction. Il
      mord en revanche pour de bon quand un couple de même longueur ne tient qu'à
      un croisement : sur un motif où deux mots de 5 croisent le même mot de 4,
      67 tirages sur 1000 (6,7 %) donnent une grille où l'échange est libre
      (« femme » et « aimer » sur « miam »). Sur 200 tirages, un tel motif est
      donc attrapé quasi sûrement. La conséquence pour l'implémentation : ce
      critère se tient d'abord en dessinant les motifs, pas en retirant des
      grilles au hasard jusqu'à ce que ça passe.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
	motifsDe,
	motsDisponibles,
	remplir,
	tirerGrille,
	vivierMotsCases,
	type PartieMotsCases,
} from '../src/core/jeux/mots-cases';
import {
	MOTIFS_MOTS_CASES,
	TAILLES_MOTS_CASES,
	type MotifMotsCases,
	type TailleMotsCases,
} from '../src/data/jeux/motifs-mots-cases';
import { poser, retirer, type Emplacement, type Motif } from '../src/core/jeux/grille-mots';
import { JEUX, jeuParId, jeuxDisponibles } from '../src/core/jeux/catalogue';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import { CHAMPS } from '../src/data/francais/champs-lexicaux';
import { LEVEL_ORDER } from '../src/core/levels';
import { initProfiles, setNiveauReference, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Tirage déterministe (LCG), pattern de `jeux-tirage.test.ts` et de
   `sudoku.test.ts`. Jamais de hasard réel : un invariant qui casse une fois sur
   mille doit pouvoir être rejoué à l'identique. */
function tirage(graine: number): () => number {
	let s = graine >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

const NFC = (s: string): string => s.normalize('NFC');
const lettres = (mot: string): string[] => [...NFC(mot)];

/* ---------- Géométrie recalculée ICI, exprès ----------

   Ces trois fonctions refont ce que le moteur sait faire. C'est délibéré : le
   solveur de vérification ci-dessous juge les critères 9 et 10, et s'il
   s'appuyait sur `croisements()` du module testé, une erreur de géométrie
   rendrait le juge et le jugé faux ENSEMBLE, donc le test vert. La géométrie du
   moteur est éprouvée à part, dans `grille-mots.test.ts`, sur des attendus
   calculés à la main. */
type CaseXY = { ligne: number; colonne: number };
const casesLocales = (e: Emplacement): CaseXY[] =>
	Array.from({ length: e.longueur }, (_, k) =>
		e.sens === 'h'
			? { ligne: e.ligne, colonne: e.colonne + k }
			: { ligne: e.ligne + k, colonne: e.colonne },
	);

type CroisementLocal = { a: number; b: number; ia: number; ib: number };
function croisementsLocaux(m: Motif): CroisementLocal[] {
	const out: CroisementLocal[] = [];
	for (let a = 0; a < m.emplacements.length; a++) {
		const ca = casesLocales(m.emplacements[a]);
		for (let b = a + 1; b < m.emplacements.length; b++) {
			const cb = casesLocales(m.emplacements[b]);
			for (let ia = 0; ia < ca.length; ia++) {
				for (let ib = 0; ib < cb.length; ib++) {
					if (ca[ia].ligne === cb[ib].ligne && ca[ia].colonne === cb[ib].colonne) {
						out.push({ a, b, ia, ib });
					}
				}
			}
		}
	}
	return out;
}

/** Tous les croisements sont-ils d'accord dans ce placement ? */
function placementValide(m: Motif, sol: readonly string[]): boolean {
	return croisementsLocaux(m).every((c) => lettres(sol[c.a])[c.ia] === lettres(sol[c.b])[c.ib]);
}

/** Cherche un placement complet des mots DONNÉS sur le motif — le juge du
    critère 9. Retour arrière avec choix de l'emplacement le plus contraint et
    BUDGET DUR : un solveur qui tourne sans fin ne prouve rien, et un échec par
    épuisement doit se distinguer d'une insolubilité (sinon on accuserait le jeu
    d'avoir servi l'impossible alors que c'est le juge qui a renoncé). */
function placementComplet(
	m: Motif,
	mots: readonly string[],
): { solution: string[] | null; budgetEpuise: boolean } {
	const cr = croisementsLocaux(m);
	const parEmp = new Map<number, CroisementLocal[]>();
	for (const c of cr) {
		parEmp.set(c.a, [...(parEmp.get(c.a) ?? []), c]);
		parEmp.set(c.b, [...(parEmp.get(c.b) ?? []), c]);
	}
	const n = m.emplacements.length;
	const pose: (string | null)[] = new Array<string | null>(n).fill(null);
	const pris = new Array<boolean>(mots.length).fill(false);
	let budget = 200_000;
	let epuise = false;

	const accepte = (i: number, mot: string): boolean => {
		if (lettres(mot).length !== m.emplacements[i].longueur) return false;
		for (const c of parEmp.get(i) ?? []) {
			const autre = c.a === i ? c.b : c.a;
			const dejaLa = pose[autre];
			if (!dejaLa) continue;
			const chezMoi = c.a === i ? c.ia : c.ib;
			const chezLautre = c.a === i ? c.ib : c.ia;
			if (lettres(mot)[chezMoi] !== lettres(dejaLa)[chezLautre]) return false;
		}
		return true;
	};

	const rec = (): boolean => {
		if (budget-- <= 0) {
			epuise = true;
			return false;
		}
		let cible = -1;
		let choix: number[] | null = null;
		for (let i = 0; i < n; i++) {
			if (pose[i]) continue;
			const cands: number[] = [];
			for (let k = 0; k < mots.length; k++) if (!pris[k] && accepte(i, mots[k])) cands.push(k);
			if (!choix || cands.length < choix.length) {
				cible = i;
				choix = cands;
				if (cands.length === 0) break;
			}
		}
		if (cible < 0 || !choix) return true;
		for (const k of choix) {
			pose[cible] = mots[k];
			pris[k] = true;
			if (rec()) return true;
			pose[cible] = null;
			pris[k] = false;
			if (epuise) return false;
		}
		return false;
	};
	const ok = rec();
	return { solution: ok ? (pose as string[]) : null, budgetEpuise: epuise };
}

/** Le critère 10, appliqué à un placement : reste-t-il un couple de même
    longueur qu'on ne peut PAS échanger sans casser un croisement ? */
function couplesMemeLongueur(m: Motif): [number, number][] {
	const out: [number, number][] = [];
	for (let i = 0; i < m.emplacements.length; i++) {
		for (let j = i + 1; j < m.emplacements.length; j++) {
			if (m.emplacements[i].longueur === m.emplacements[j].longueur) out.push([i, j]);
		}
	}
	return out;
}

function echangeCasseUnCroisement(m: Motif, sol: readonly string[]): boolean {
	return couplesMemeLongueur(m).some(([i, j]) => {
		const echange = [...sol];
		[echange[i], echange[j]] = [echange[j], echange[i]];
		return !placementValide(m, echange);
	});
}

/* ---------- Le vivier attendu, recalculé depuis les banques ----------

   Recalculé et pas relu : c'est la seule façon de vérifier « avec pour SEULE
   exclusion la forme ». Un test qui comparerait `vivierMotsCases()` à
   lui-même, ou à la fonction du Motus, validerait précisément l'erreur qu'on
   craint — reprendre le vivier du Motus, qui écarte les homophones, les séries
   irrégulières et tout ce qui ne fait pas 5 ou 6 lettres. */
const FORME_JOUABLE = /^[a-zà-öø-ÿœæ]+$/;

function vivierAttendu(): string[] {
	const vus = new Set<string>();
	const ajoute = (brut: string): void => {
		const mot = NFC(brut.toLowerCase());
		if (FORME_JOUABLE.test(mot)) vus.add(mot);
	};
	for (const serie of ORTHO_PREDEF) {
		if (!serie.id.startsWith('fr-ortho-theme-')) continue;
		for (const m of serie.mots) ajoute(m.mot);
	}
	for (const champ of CHAMPS) for (const m of champ.mots) ajoute(m.mot);
	return [...vus].sort();
}

const normalise = (mots: readonly string[]): string[] =>
	mots.map((m) => NFC(m.toLowerCase())).sort();

/** Photographie du stockage, pour prouver qu'un appel n'écrit rien. */
function instantaneStockage(): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k != null) out[k] = localStorage.getItem(k) ?? '';
	}
	return out;
}

describe('#664 critères 1 et 2 — la place du jeu dans le catalogue', () => {
	it('déclare « mots-cases », libellé « Mots casés », type R', () => {
		expect(jeuParId('mots-cases')).toMatchObject({
			id: 'mots-cases',
			label: 'Mots casés',
			type: 'R',
		});
	});

	it('ne déclare NI compétence NI classes', () => {
		/* Cas d'échec du critère 1 : « l'entrée déclare une compétence, ou l'espace
		   encadrant en affiche une pour ce jeu ». Le cadrage a tranché que ce jeu
		   n'entraîne ni lecture, ni orthographe produite, ni vocabulaire : lui
		   attribuer une compétence ferait mentir le bilan destiné aux parents.

		   `levels` absent, et non pas `['ce2','cm1']` : c'est la façon d'écrire « ce
		   jeu ignore le niveau scolaire » sans avoir à y revenir à chaque classe
		   ajoutée (critère 40). */
		const jeu = jeuParId('mots-cases');
		expect(jeu?.competence).toBeUndefined();
		expect(jeu?.levels).toBeUndefined();
	});

	it('est proposé à toutes les classes', () => {
		for (const niveau of LEVEL_ORDER) {
			expect(
				jeuxDisponibles(niveau).map((j) => j.id),
				niveau,
			).toContain('mots-cases');
		}
	});

	it('porte un libellé qui ne nomme ni compétence ni matière (critère 2)', () => {
		/* La regex est celle de `jeux-catalogue.test.ts`, qui l'applique déjà à TOUS
		   les jeux : ce contrôle-ci est donc redondant par construction — et c'est
		   voulu. Il nomme le critère 2 pour que son échec dise « le libellé de mots
		   casés trahit la matière », et pas « un jeu quelque part ». */
		const label = jeuParId('mots-cases')?.label ?? '';
		expect(label).not.toMatch(
			/orthograph|calcul|conjugais|grammair|vocabulair|lexical|compétence|entra[îi]n/i,
		);
	});

	it('n’a pas délogé les jeux déjà en place (critère 42)', () => {
		for (const id of ['motus', '2048', 'sudoku']) expect(jeuParId(id), id).toBeDefined();
		expect(new Set(JEUX.map((j) => j.id)).size).toBe(JEUX.length);
	});
});

describe('#664 critère 13 — deux tailles, chacune avec ses motifs', () => {
	it('rend, pour chaque taille, les motifs de cette taille et rien d’autre', () => {
		for (const taille of TAILLES_MOTS_CASES) {
			const motifs = motifsDe(taille);
			expect(motifs.length, taille).toBeGreaterThanOrEqual(1);
			for (const m of motifs) expect(m.taille, `${m.id}`).toBe(taille);
		}
	});

	it('couvre tous les motifs livrés, sans en perdre en route', () => {
		const parTaille = TAILLES_MOTS_CASES.flatMap((t) => motifsDe(t).map((m) => m.id)).sort();
		expect(parTaille).toEqual([...MOTIFS_MOTS_CASES].map((m) => m.id).sort());
	});
});

describe('#664 critère 12 — d’où viennent les mots, et eux seuls', () => {
	it('prend TOUT ce que les deux banques offrent, à la forme près', () => {
		/* « Les mots viennent des banques déjà relues du dépôt — séries
		   fr-ortho-theme-* d'ORTHO_PREDEF et CHAMPS — avec pour SEULE exclusion la
		   forme. »

		   L'égalité, et pas l'inclusion : l'inclusion laisserait passer le vivier du
		   Motus, qui est un sous-ensemble strict (il écarte les homophones, les
		   mots-outils et tout ce qui ne fait pas 5 ou 6 lettres). Or l'arbitrage 4 du
		   cadrage dit l'inverse — un mot difficile à orthographier est ICI un bon
		   candidat, puisque le mot est donné en entier et que l'exposition à sa forme
		   correcte est gratuite. */
		expect(normalise(vivierMotsCases())).toEqual(vivierAttendu());
	});

	it('n’exclut aucun mot que le Motus écarte pour une raison qui ne vaut pas ici', () => {
		/* Le contrôle d'égalité ci-dessus le dit déjà, mais en une seule ligne
		   d'échec illisible. Ces cinq témoins nomment la régression la plus probable :
		   avoir réutilisé `vivierMots()` du Motus. `écureuil` (8 lettres) tombe sous
		   sa borne de longueur, les quatre autres sous son filtre de mots-outils. */
		const vivier = new Set(normalise(vivierMotsCases()));
		for (const mot of ['écureuil', 'autre', 'chaque', 'contre', 'malgré']) {
			expect(vivier.has(mot), `« ${mot} » manque au vivier`).toBe(true);
		}
	});

	it('ne garde aucun mot à espace, apostrophe ou trait d’union', () => {
		// La seule exclusion, et elle est de FORME : une case porte une lettre, pas
		// un signe. Témoins réels des banques : « s'enfuir », « au-dessus »,
		// « sous-bois », « s'entrainer ».
		for (const mot of vivierMotsCases()) {
			expect(mot, `« ${mot} »`).not.toMatch(/[\s'’-]/);
			expect(FORME_JOUABLE.test(NFC(mot.toLowerCase())), `« ${mot} »`).toBe(true);
		}
	});

	it('ne contient aucun doublon', () => {
		// Les deux banques se recoupent (mesuré : 4 mots en commun). Un doublon dans
		// le vivier ouvrirait la porte au doublon dans la grille (critère 11).
		const v = normalise(vivierMotsCases());
		expect(new Set(v).size).toBe(v.length);
	});

	it('ne se laisse pas corrompre depuis l’extérieur', () => {
		/* Le vivier est calculé une fois puis gardé (c'est ce que fait déjà le
		   Motus). Un appelant qui pousse dans le tableau rendu contaminerait alors
		   toutes les grilles suivantes. Copie défensive ou tableau gelé, peu importe
		   lequel : ce qui compte est qu'on n'y arrive pas. */
		const attendu = vivierMotsCases().length;
		try {
			vivierMotsCases().push('intrus');
		} catch {
			/* gelé : très bien aussi */
		}
		expect(vivierMotsCases().length).toBe(attendu);
	});
});

describe('#664 critère 9 — chaque motif livré se remplit VRAIMENT', () => {
	/* Le critère 9 porte sur la grille servie, et `tirerGrille` peut masquer un
	   motif infernal en en essayant un autre. Un motif qui ne se remplit jamais
	   serait alors livré EN APPARENCE : compté dans les six, jamais joué.

	   Le seuil (18 sur 20) n'est pas arbitraire : sur dix motifs prototypés avec
	   le vivier réel, tous ceux qui ne sont pas un carré de mots entièrement
	   croisé réussissent 200 fois sur 200. Un motif qui échoue plus d'une fois sur
	   dix est un motif trop dense, pas de la malchance. */
	it.each([...MOTIFS_MOTS_CASES].map((m) => [m.id, m] as [string, MotifMotsCases]))(
		'%s se remplit presque à tous les coups',
		(_id, motif) => {
			let reussis = 0;
			for (let graine = 1; graine <= 20; graine++) {
				if (remplir(motif, tirage(graine))) reussis++;
			}
			expect(
				reussis,
				`le motif ${motif.id} n'a été rempli que ${reussis} fois sur 20 : trop de croisements pour le vivier`,
			).toBeGreaterThanOrEqual(18);
		},
	);

	it('rend un remplissage qui tient debout tout seul', () => {
		for (const motif of MOTIFS_MOTS_CASES) {
			const sol = remplir(motif, tirage(42));
			expect(sol, motif.id).not.toBeNull();
			if (!sol) continue;
			expect(sol, motif.id).toHaveLength(motif.emplacements.length);
			const vivier = new Set(normalise(vivierMotsCases()));
			sol.forEach((mot, i) => {
				expect(vivier.has(NFC(mot.toLowerCase())), `${motif.id} : « ${mot} » hors vivier`).toBe(
					true,
				);
				expect(lettres(mot).length, `${motif.id} : « ${mot} » à l'emplacement ${i}`).toBe(
					motif.emplacements[i].longueur,
				);
			});
			expect(new Set(normalise(sol)).size, `${motif.id} : un mot en double`).toBe(sol.length);
			expect(placementValide(motif, sol), `${motif.id} : un croisement en désaccord`).toBe(true);
		}
	});

	it('est déterministe à générateur fixé, et n’appelle jamais Math.random', () => {
		const espion = vi.spyOn(Math, 'random');
		const motif = MOTIFS_MOTS_CASES[0];
		const a = remplir(motif, tirage(7));
		const b = remplir(motif, tirage(7));
		expect(a).toEqual(b);
		expect(espion).not.toHaveBeenCalled();
		espion.mockRestore();
	});
});

describe('#664 — ce que sert `tirerGrille`', () => {
	it('sert une grille VIDE, de la taille demandée, avec un mot par emplacement', () => {
		for (const taille of TAILLES_MOTS_CASES) {
			const p = tirerGrille(taille, tirage(3));
			expect(p.motif.taille, taille).toBe(taille);
			expect(p.grille.motif.id).toBe(p.motif.id);
			expect(
				[...p.grille.poses].every((x) => x === null),
				'la grille servie est déjà remplie',
			).toBe(true);
			expect(p.mots).toHaveLength(p.motif.emplacements.length);
		}
	});

	it('est déterministe à générateur fixé', () => {
		// Sans ça, aucun invariant de grille ne serait rejouable : un échec sur le
		// tirage 137 resterait un échec qu'on ne sait pas reproduire.
		for (const taille of TAILLES_MOTS_CASES) {
			expect(tirerGrille(taille, tirage(11))).toEqual(tirerGrille(taille, tirage(11)));
		}
	});

	it('ne sert pas éternellement la même grille', () => {
		const vues = new Set<string>();
		for (let g = 1; g <= 30; g++) vues.add(JSON.stringify(tirerGrille('petite', tirage(g)).mots));
		expect(vues.size, 'trente tirages donnent la même liste de mots').toBeGreaterThan(1);
	});

	it('n’appelle pas Math.random et n’écrit rien dans le stockage', () => {
		/* Le tirage est une fonction PURE de (taille, générateur). Une écriture ici
		   voudrait dire que le tirage se souvient — donc qu'il pourrait, un jour,
		   compter les parties (critères 38 et 39). */
		const espion = vi.spyOn(Math, 'random');
		const avant = instantaneStockage();
		for (const taille of TAILLES_MOTS_CASES) tirerGrille(taille, tirage(5));
		expect(espion).not.toHaveBeenCalled();
		expect(instantaneStockage()).toEqual(avant);
		espion.mockRestore();
	});
});

describe('#664 critères 9, 10, 11 et 12 — 200 tirages par taille', () => {
	/* L'échantillon est la seule façon d'attraper ces quatre-là : ils ne sont
	   faux qu'une fois de temps en temps, et jamais sur le premier tirage. Le
	   générateur est injecté et la graine vaut le numéro du tirage, donc un échec
	   se rejoue à l'identique — c'est tout l'intérêt du critère 5 de #666, repris
	   ici. */
	const TIRAGES = 200;

	it.each([...TAILLES_MOTS_CASES])(
		'taille « %s » : chaque grille servie est résoluble, sans doublon, avec les mots du vivier',
		(taille: TailleMotsCases) => {
			const vivier = new Set(normalise(vivierMotsCases()));
			const motifsVus = new Set<string>();
			for (let graine = 1; graine <= TIRAGES; graine++) {
				const p: PartieMotsCases = tirerGrille(taille, tirage(graine));
				motifsVus.add(p.motif.id);
				const ou = `tirage ${graine} (${p.motif.id})`;

				// Critère 11 — « Un mot n'apparaît jamais deux fois dans la même grille. »
				expect(new Set(normalise(p.mots)).size, `${ou} : un mot en double`).toBe(p.mots.length);

				// Critère 12 — la provenance, sur la grille SERVIE et pas seulement sur le
				// vivier : c'est la grille que l'enfant voit.
				for (const mot of p.mots) {
					expect(vivier.has(NFC(mot.toLowerCase())), `${ou} : « ${mot} » hors banques`).toBe(true);
					expect(mot, `${ou} : « ${mot} »`).not.toMatch(/[\s'’-]/);
				}

				// Les longueurs offertes couvrent exactement les emplacements : une liste
				// où il manque un mot de 6 est insoluble avant même d'essayer.
				const croissant = (a: number, b: number): number => a - b;
				expect(
					p.mots.map((m) => lettres(m).length).sort(croissant),
					`${ou} : les longueurs offertes ne collent pas aux emplacements`,
				).toEqual(p.motif.emplacements.map((e) => e.longueur).sort(croissant));

				// Critère 9 — « les mots proposés admettent au moins un placement complet ».
				const { solution, budgetEpuise } = placementComplet(p.motif, p.mots);
				expect(budgetEpuise, `${ou} : le solveur de contrôle a épuisé son budget`).toBe(false);
				expect(solution, `${ou} : la grille servie n'admet AUCUN placement complet`).not.toBeNull();
				if (!solution) continue;

				// Critère 10 — « au moins un couple de même longueur ne peut pas être
				// échangé sans casser un croisement ». Sans couple du tout, la propriété
				// serait vraie par vacuité : le critère 8 l'interdit, on le redit ici.
				expect(
					couplesMemeLongueur(p.motif).length,
					`${ou} : aucun couple de même longueur`,
				).toBeGreaterThanOrEqual(1);
				expect(
					echangeCasseUnCroisement(p.motif, solution),
					`${ou} : tous les échanges entre mots de même longueur restent valides — la grille se finit sans regarder une seule lettre`,
				).toBe(true);
			}

			// Un motif jamais servi en 200 tirages n'est pas livré, il est décoratif.
			expect(
				[...motifsVus].sort(),
				'un motif de cette taille n’est jamais sorti en 200 tirages',
			).toEqual(
				motifsDe(taille)
					.map((m) => m.id)
					.sort(),
			);
		},
	);
});

describe('#664 critère 40 — le jeu ne consulte jamais la classe du profil', () => {
	it('sert exactement la même grille à un CE2 et à un CM1', () => {
		/* Cas d'échec littéral : « passer un profil de CE2 à CM1 change ce que le jeu
		   sert ». Le vivier vient de séries dont chacune porte un `niveau` : filtrer
		   dessus est à un caractère près, et ne se verrait jamais sur un seul profil. */
		const parNiveau = LEVEL_ORDER.map((niveau) => {
			setNiveauReference(niveau);
			return {
				niveau,
				vivier: normalise(vivierMotsCases()),
				parties: TAILLES_MOTS_CASES.map((t) => tirerGrille(t, tirage(23))),
			};
		});
		for (const autre of parNiveau.slice(1)) {
			expect(autre.vivier, `vivier différent en ${autre.niveau}`).toEqual(parNiveau[0].vivier);
			expect(autre.parties, `grille différente en ${autre.niveau}`).toEqual(parNiveau[0].parties);
		}
	});
});

describe('#664 — les mots encore à placer', () => {
	const partie = (): PartieMotsCases => tirerGrille('petite', tirage(9));

	it('offre au départ tous les mots de la grille', () => {
		const p = partie();
		expect(normalise(motsDisponibles(p))).toEqual(normalise(p.mots));
	});

	it('retire de la liste le mot qu’on vient de poser', () => {
		const p = partie();
		const mot = p.mots[0];
		const cible = p.motif.emplacements.findIndex((e) => e.longueur === lettres(mot).length);
		const apres: PartieMotsCases = { ...p, grille: poser(p.grille, cible, mot) };
		expect(motsDisponibles(apres)).not.toContain(mot);
		expect(motsDisponibles(apres)).toHaveLength(p.mots.length - 1);
	});

	it('le rend à la liste dès qu’on le retire (moitié logique du critère 17)', () => {
		/* « Un premier choix malheureux n'a d'autre issue que de recommencer la
		   grille » est le cas d'échec du critère 17 ; sa moitié visible est un geste,
		   donc du ressort de Playwright, mais la liste, elle, se vérifie ici. */
		const p = partie();
		const mot = p.mots[0];
		const cible = p.motif.emplacements.findIndex((e) => e.longueur === lettres(mot).length);
		const pose: PartieMotsCases = { ...p, grille: poser(p.grille, cible, mot) };
		const repris: PartieMotsCases = { ...pose, grille: retirer(pose.grille, cible) };
		expect(normalise(motsDisponibles(repris))).toEqual(normalise(p.mots));
	});
});
