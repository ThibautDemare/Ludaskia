/* ============================================================
   Sudoku (#666) — le JEU : tailles, symboles, tirage, conflits, cases liées.

   Écrit AVANT l'implémentation, d'après les critères numérotés de l'issue #666.
   Le module testé est un squelette dont chaque fonction lève « non implémenté » :
   ces tests sont ROUGES par construction.

   Critères portés ici : 2 (indépendance de la classe), 3 et 4 (solution unique
   et déduction élémentaire, par ÉCHANTILLON LARGE), 5 (tirage pur et
   déterministe), 6 (première grille presque complète), 7 et 8 (les symboles),
   13 (conflits symétriques au moment de la pose), 16 (`casesLiees`),
   19 (`grilleTerminee`), 20 (place au catalogue) et 25 (le jeu est un assemblage
   du moteur générique, pas une règle écrite en dur).

   Deux mesures faites en préparant ce fichier, et qui changent la lecture :

   1. En 4×4, une grille à solution unique est TOUJOURS résoluble par déduction
      élémentaire — vérifié exhaustivement sur les 2^16 sous-ensembles de trois
      grilles solutions, zéro contre-exemple. Le critère 4 n'a donc de mordant
      QUE sur le 6×6 : l'échantillon 6×6 ci-dessous n'est pas du zèle, c'est le
      seul endroit où le piège existe.

   2. L'issue dit « régions 2×3 » sans trancher l'orientation, et le contrat
      expose `regionLargeur` ET `regionHauteur` séparément. Aucun test d'ici ne
      fixe donc l'orientation du 6×6 : les attendus sont écrits pour rester
      vrais dans les deux (heureusement, `casesLiees` compte 12 cases dans les
      deux cas). Le 4×4, lui, est sans ambiguïté : régions 2×2.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
	SYMBOLES,
	TAILLES,
	casesLiees,
	conflitsSudoku,
	estFixe,
	geometrieSudoku,
	grilleTerminee,
	moteurSudoku,
	poser,
	symbolesDe,
	tirerGrille,
	type Partie,
	type TailleSudoku,
} from '../src/core/jeux/sudoku';
import {
	colonnes,
	compterSolutions,
	contrainteUnicite,
	lignes,
	regions,
	resoudreParDeductionElementaire,
	type Contrainte,
	type Geometrie,
	type Valeurs,
} from '../src/core/jeux/grille-contraintes';
import { jeuParId, jeuxDisponibles } from '../src/core/jeux/catalogue';
import { initProfiles, setNiveauReference, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { tirage } from './aleatoire';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const tri = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);
const vides = (v: Valeurs): number => v.filter((x) => x === 0).length;

/** Une partie fabriquée à la main : indispensable pour éprouver les conflits sur
    des configurations choisies, que le générateur ne produira jamais. */
const partie = (taille: TailleSudoku, enonce: Valeurs, valeurs?: Valeurs): Partie => ({
	taille,
	enonce: [...enonce],
	valeurs: [...(valeurs ?? enonce)],
});

/** Grille 4×4 complète et valide (régions 2×2), vérifiée à la main. */
const SOL4: Valeurs = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
/** Quatre données, solution unique `SOL4`. */
const ENONCE4: Valeurs = [1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0, 0, 3, 0, 0];
const VIDE4: Valeurs = new Array(16).fill(0);

/** Photographie du stockage complet, pour prouver qu'un appel n'écrit rien. */
function instantaneStockage(): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k != null) out[k] = localStorage.getItem(k) ?? '';
	}
	return out;
}

describe('#666 critère 1 — deux tailles, et seulement deux', () => {
	it('déclare le 4×4 et le 6×6', () => {
		expect([...TAILLES]).toEqual([4, 6]);
	});

	it('donne au 4×4 des régions 2×2', () => {
		expect(geometrieSudoku(4)).toEqual({ cotes: 4, regionLargeur: 2, regionHauteur: 2 });
	});

	it('donne au 6×6 des régions 2×3, dans un sens ou dans l’autre', () => {
		/* L'issue écrit « régions 2×3 » sans dire laquelle des deux dimensions vaut
		   2 : le test n'a pas à trancher un choix que le cadrage n'a pas fait. Ce
		   qui est exigible, c'est que la région pave la grille. */
		const geo = geometrieSudoku(6);
		expect(geo.cotes).toBe(6);
		expect([geo.regionLargeur, geo.regionHauteur].sort((a, b) => a - b)).toEqual([2, 3]);
		expect(geo.regionLargeur * geo.regionHauteur).toBe(6);
	});

	it('n’ouvre pas le 9×9, explicitement hors périmètre', () => {
		expect(TAILLES).not.toContain(9);
	});
});

describe('#666 critère 2 — rien ne dépend de la classe du profil', () => {
	it('sert les mêmes tailles, la même géométrie et les mêmes symboles à un CE2 et à un CM1', () => {
		setNiveauReference('ce2');
		const ce2 = {
			tailles: [...TAILLES],
			geo: TAILLES.map((t) => geometrieSudoku(t)),
			symboles: TAILLES.map((t) => [...symbolesDe(t)]),
		};
		setNiveauReference('cm1');
		expect({
			tailles: [...TAILLES],
			geo: TAILLES.map((t) => geometrieSudoku(t)),
			symboles: TAILLES.map((t) => [...symbolesDe(t)]),
		}).toEqual(ce2);
	});

	it('tire exactement la même grille à un CE2 et à un CM1, à graine égale', () => {
		// Le cas d'échec littéral : « un CE2 se voit refuser le 6×6 ».
		for (const t of TAILLES) {
			setNiveauReference('ce2');
			const a = tirerGrille(t, tirage(2026));
			setNiveauReference('cm1');
			const b = tirerGrille(t, tirage(2026));
			expect(b).toEqual(a);
		}
	});

	it('reste jouable à toutes les classes au catalogue', () => {
		for (const niveau of ['ce2', 'cm1'] as const) {
			expect(jeuxDisponibles(niveau).map((j) => j.id)).toContain('sudoku');
		}
	});
});

describe('#666 critère 20 — la place au catalogue', () => {
	it('s’inscrit en type R, sans compétence et sans classe', () => {
		const def = jeuParId('sudoku');
		expect(def).toBeDefined();
		if (!def) return;
		expect({
			type: def.type,
			competence: def.competence,
			levels: def.levels,
			libelleVide: def.label.trim() === '',
			iconeVide: def.icone.trim() === '',
		}).toEqual({
			type: 'R',
			competence: undefined,
			levels: undefined,
			libelleVide: false,
			iconeVide: false,
		});
	});
});

/* ============================================================
   Les symboles (critères 7 et 8)
   ============================================================ */

/** Sans accents, en minuscules : le test ne doit pas dépendre de la graphie
    exacte d'un identifiant. */
const aplati = (s: string): string =>
	[...s.normalize('NFD')]
		.filter((c) => {
			const n = c.codePointAt(0) ?? 0;
			return n < 0x0300 || n > 0x036f; // retire les diacritiques combinants
		})
		.join('')
		.toLowerCase();

/** Les FAMILLES VISUELLES du critère 8. Chaque famille regroupe les formes que
    l'issue déclare confondables à 35-40 px : carré/losange (même forme
    tournée), triangle pointe en haut / pointe en bas, étoile/croix. La table
    reconnaît les deux encodages plausibles d'une silhouette — un identifiant
    nommé, ou un caractère géométrique Unicode. Un symbole qu'elle NE RECONNAÎT
    PAS fait échouer le test : c'est volontaire. Le critère 8 n'est mécanisable
    que si la forme servie est identifiable ; si l'implémentation encode les
    silhouettes autrement (chemin SVG, par exemple), il faut exposer leur nom,
    pas assouplir ce test. */
const FAMILLES: { nom: string; motif: RegExp }[] = [
	{
		nom: 'quadrilatère tourné (carré / losange)',
		motif: /carre|square|losange|diamant|rhombe|■|▪|◼|◻|□|◆|◇|◈|🔷|🔶/,
	},
	{ nom: 'triangle (pointe en haut / en bas)', motif: /triangle|▲|▼|△|▽|◣|◤/ },
	{ nom: 'étoile / croix', motif: /etoile|star|croix|cross|★|☆|✦|✚|✖|✕|➕/ },
	{ nom: 'disque', motif: /rond|cercle|disque|circle|●|○|⬤|◍/ },
	{ nom: 'hexagone', motif: /hexagone|hexa|⬢|⬡/ },
	{ nom: 'pentagone', motif: /pentagone|penta|⬟|⬠/ },
	{ nom: 'goutte / cœur / lune', motif: /goutte|coeur|lune|croissant|♥|❤|☾|🌙/ },
	{ nom: 'éclair / flèche', motif: /eclair|fleche|arrow|⚡|➤|▶/ },
	{ nom: 'anneau', motif: /anneau|ring|donut|◎|◉/ },
	{ nom: 'trapèze / parallélogramme', motif: /trapeze|parallelogramme|▰|▱/ },
];

const familleDe = (symbole: string): string | null => {
	const s = aplati(symbole);
	for (const f of FAMILLES) if (f.motif.test(s)) return f.nom;
	return null;
};

describe('#666 critères 7 et 8 — les symboles', () => {
	it('en sert autant que la taille : 4 pour le 4×4, 6 pour le 6×6', () => {
		expect(symbolesDe(4).length).toBe(4);
		expect(symbolesDe(6).length).toBe(6);
	});

	it('déclare une silhouette pour chaque valeur, et RIEN pour la case vide', () => {
		/* 0 est la case vide, jamais un symbole (contrat du moteur). Un rendu qui
		   indexerait `SYMBOLES[valeur]` sans traiter le 0 dessinerait une forme dans
		   les cases vides — d'où l'entrée creuse à l'index 0. */
		expect(SYMBOLES[0]).toBeFalsy();
		for (let k = 1; k <= 6; k++) {
			// `typeof` explicitement : sans lui, un `SYMBOLES` trop court rendrait
			// `undefined`, dont la mise en chaîne (« undefined ») n'est pas vide — le
			// test passerait sur une table absente.
			expect(typeof SYMBOLES[k], `SYMBOLES[${k}]`).toBe('string');
			expect(String(SYMBOLES[k]).trim(), `SYMBOLES[${k}]`).not.toBe('');
		}
	});

	it('ne montre jamais de chiffre (critère 7)', () => {
		// Un chiffre induit une fausse attente arithmétique et rapproche le jeu des
		// exercices de calcul voisins.
		for (const s of symbolesDe(6)) expect(s).not.toMatch(/\p{N}/u);
	});

	it('sert des symboles tous distincts', () => {
		for (const t of TAILLES) {
			const l = [...symbolesDe(t)];
			expect(new Set(l).size).toBe(l.length);
		}
	});

	it('prend les symboles du 4×4 dans ceux du 6×6', () => {
		// `SYMBOLES` est UNE table indexée par la valeur : la palette du 4×4 est un
		// début de celle du 6×6, pas une autre famille de formes.
		for (const s of symbolesDe(4)) expect([...symbolesDe(6)]).toContain(s);
	});

	it('n’emploie qu’UNE forme par famille visuelle (critère 8)', () => {
		/* Le cas d'échec de l'issue : « deux formes du jeu servi appartiennent à
		   l'une de ces paires ». On le mécanise en classant chaque silhouette dans
		   sa famille et en refusant deux occupants pour une même famille — ce qui
		   couvre aussi les variantes que l'issue ne nomme pas (deux triangles
		   quelconques, disque et anneau ne sont pas dans la même famille, etc.). */
		for (const t of TAILLES) {
			const familles = [...symbolesDe(t)].map((s) => ({ s, famille: familleDe(s) }));
			const inconnues = familles.filter((f) => f.famille === null).map((f) => f.s);
			expect(
				inconnues,
				'silhouette non identifiable : le critère 8 ne se vérifie que sur des formes nommables — ' +
					'exposer un identifiant, ou compléter la table FAMILLES de ce test',
			).toEqual([]);
			const vues = familles.map((f) => f.famille);
			expect(new Set(vues).size, `taille ${t} : deux formes de la même famille visuelle`).toBe(
				vues.length,
			);
		}
	});
});

/* ============================================================
   Le tirage (critères 3, 4, 5, 6)
   ============================================================ */

describe('#666 critère 5 — le tirage est une fonction pure de (taille, générateur)', () => {
	it('rend deux fois exactement la même grille à graine égale', () => {
		for (const t of TAILLES) {
			for (const graine of [1, 17, 99, 12345]) {
				expect(tirerGrille(t, tirage(graine))).toEqual(tirerGrille(t, tirage(graine)));
			}
		}
	});

	it('consomme le générateur qu’on lui donne', () => {
		let appels = 0;
		const r = tirage(7);
		tirerGrille(4, () => {
			appels++;
			return r();
		});
		expect(appels).toBeGreaterThan(0);
	});

	it('n’appelle jamais Math.random', () => {
		// Sinon « déterministe à générateur fixé » est faux, et aucun invariant de
		// grille ne serait reproductible.
		const espion = vi.spyOn(Math, 'random');
		try {
			for (const t of TAILLES) tirerGrille(t, tirage(3));
			expect(espion).not.toHaveBeenCalled();
		} finally {
			espion.mockRestore();
		}
	});

	it('ne lit pas le stockage : la classe et l’état du jeu ne changent rien', () => {
		const attendu = tirerGrille(6, tirage(555));
		setNiveauReference('cm1');
		localStorage.setItem('ludaskia_jeux_sudoku_taille', '4');
		localStorage.setItem('ludaskia_jeux_sudoku_initie', 'true');
		expect(tirerGrille(6, tirage(555))).toEqual(attendu);
	});

	it('n’écrit rien dans le stockage', () => {
		const avant = instantaneStockage();
		for (const t of TAILLES) tirerGrille(t, tirage(8));
		expect(instantaneStockage()).toEqual(avant);
	});

	it('ne rend pas toujours la même grille : le déterminisme n’est pas une constante', () => {
		/* Un générateur qui ignorerait `r` passerait tous les tests de déterminisme
		   ci-dessus. Sur 200 graines, il faut de la variété — le seuil est bas
		   exprès, il ne mesure pas la qualité du tirage, il attrape la constante. */
		for (const t of TAILLES) {
			const vus = new Set<string>();
			for (let graine = 1; graine <= 200; graine++) {
				vus.add(tirerGrille(t, tirage(graine)).enonce.join(','));
			}
			expect(vus.size, `taille ${t}`).toBeGreaterThan(50);
		}
	});

	it('rend des tableaux indépendants : jouer ne réécrit pas l’énoncé', () => {
		// « Les cases données au départ […] ne change jamais » (contrat). Si
		// `valeurs` et `enonce` partageaient le même tableau, la première pose
		// effacerait la notion de case donnée — et `estFixe` mentirait ensuite.
		const p = tirerGrille(4, tirage(4));
		const copieEnonce = [...p.enonce];
		const libre = p.valeurs.findIndex((x) => x === 0);
		p.valeurs[libre] = 1;
		expect(p.enonce).toEqual(copieEnonce);
	});
});

describe('#666 — la forme d’une grille servie', () => {
	it('annonce sa taille, sa longueur, et des valeurs dans le jeu de symboles', () => {
		for (const t of TAILLES) {
			for (let graine = 1; graine <= 60; graine++) {
				const p = tirerGrille(t, tirage(graine));
				expect(p.taille).toBe(t);
				expect(p.enonce.length).toBe(t * t);
				expect(p.valeurs.length).toBe(t * t);
				for (const x of p.enonce) {
					expect(Number.isInteger(x)).toBe(true);
					expect(x).toBeGreaterThanOrEqual(0);
					expect(x).toBeLessThanOrEqual(t);
				}
			}
		}
	});

	it('part de l’énoncé : rien n’est déjà posé par-dessus', () => {
		for (const t of TAILLES) {
			for (let graine = 1; graine <= 60; graine++) {
				const p = tirerGrille(t, tirage(graine));
				expect(p.valeurs).toEqual(p.enonce);
			}
		}
	});

	it('laisse au moins une case à jouer', () => {
		for (const t of TAILLES) {
			for (let graine = 1; graine <= 60; graine++) {
				expect(vides(tirerGrille(t, tirage(graine)).enonce)).toBeGreaterThanOrEqual(1);
			}
		}
	});

	it('ne s’ouvre JAMAIS sur un conflit', () => {
		// Une grille servie déjà en conflit allumerait le marquage du critère 13 dès
		// l'ouverture, et accuserait l'enfant d'une faute qu'il n'a pas commise.
		for (const t of TAILLES) {
			for (let graine = 1; graine <= 60; graine++) {
				expect(tri(conflitsSudoku(tirerGrille(t, tirage(graine))))).toEqual([]);
			}
		}
	});

	it('marque comme fixes exactement les cases données', () => {
		for (const t of TAILLES) {
			const p = tirerGrille(t, tirage(21));
			for (let i = 0; i < t * t; i++) expect(estFixe(p, i)).toBe(p.enonce[i] !== 0);
		}
	});
});

describe('#666 critère 3 — toute grille servie a une solution, et une seule', () => {
	it('sur 200 tirages de 4×4', () => {
		const m = moteurSudoku(4);
		for (let graine = 1; graine <= 200; graine++) {
			expect(
				compterSolutions(m, tirerGrille(4, tirage(graine)).enonce, 2),
				`graine ${graine}`,
			).toBe(1);
		}
	});

	it('sur 150 tirages de 6×6', () => {
		const m = moteurSudoku(6);
		for (let graine = 1; graine <= 150; graine++) {
			expect(
				compterSolutions(m, tirerGrille(6, tirage(graine)).enonce, 2),
				`graine ${graine}`,
			).toBe(1);
		}
	});

	it('y compris pour la première grille, presque complète (critère 6)', () => {
		for (const t of TAILLES) {
			const m = moteurSudoku(t);
			for (let graine = 1; graine <= 60; graine++) {
				expect(compterSolutions(m, tirerGrille(t, tirage(graine), true).enonce, 2)).toBe(1);
			}
		}
	});
});

describe('#666 critère 4 — toute grille servie se résout par déduction élémentaire', () => {
	/* Le piège le plus coûteux du format. Une grille à solution unique peut
	   n'être résoluble qu'en repérant une paire cachée : l'enfant tourne alors
	   sur les cases restantes sans qu'aucun coup ne progresse, et rien à l'écran
	   ne lui dit que ce n'est pas sa faute. */
	it('sur 200 tirages de 4×4', () => {
		const m = moteurSudoku(4);
		for (let graine = 1; graine <= 200; graine++) {
			const p = tirerGrille(4, tirage(graine));
			expect(resoudreParDeductionElementaire(m, p.enonce), `graine ${graine}`).not.toBeNull();
		}
	});

	it('sur 150 tirages de 6×6 — le seul endroit où le piège existe vraiment', () => {
		const m = moteurSudoku(6);
		for (let graine = 1; graine <= 150; graine++) {
			const p = tirerGrille(6, tirage(graine));
			expect(resoudreParDeductionElementaire(m, p.enonce), `graine ${graine}`).not.toBeNull();
		}
	});

	it('y compris pour la première grille, presque complète (critère 6)', () => {
		for (const t of TAILLES) {
			const m = moteurSudoku(t);
			for (let graine = 1; graine <= 60; graine++) {
				expect(
					resoudreParDeductionElementaire(m, tirerGrille(t, tirage(graine), true).enonce),
				).not.toBeNull();
			}
		}
	});
});

describe('#666 critère 6 — la toute première grille est presque complète', () => {
	it('ne laisse qu’une ou deux cases vides, aux deux tailles, sur tous les tirages', () => {
		for (const t of TAILLES) {
			for (let graine = 1; graine <= 120; graine++) {
				const n = vides(tirerGrille(t, tirage(graine), true).enonce);
				expect(n, `taille ${t}, graine ${graine}`).toBeGreaterThanOrEqual(1);
				expect(n, `taille ${t}, graine ${graine}`).toBeLessThanOrEqual(2);
			}
		}
	});

	it('et les suivantes sont franchement plus clairsemées', () => {
		// Cas d'échec littéral : « la première partie d'un profil neuf présente une
		// grille aussi clairsemée que les suivantes ».
		for (const t of TAILLES) {
			for (let graine = 1; graine <= 120; graine++) {
				expect(
					vides(tirerGrille(t, tirage(graine)).enonce),
					`taille ${t}, graine ${graine}`,
				).toBeGreaterThan(2);
			}
		}
	});

	it('ne se déclenche pas tout seul : le défaut est la grille normale', () => {
		for (const t of TAILLES) {
			expect(tirerGrille(t, tirage(31))).toEqual(tirerGrille(t, tirage(31), false));
		}
	});
});

/* ============================================================
   Les conflits (critère 13)
   ============================================================ */

describe('#666 critère 13 — le conflit se dit sur TOUTES les cases en cause', () => {
	it('ne signale rien sur une grille vide', () => {
		// Le piège du 0 : quatre cases vides par ligne ne sont pas quatre fois la
		// même valeur. Une grille qui s'ouvre tout allumée est le pire des départs.
		expect(tri(conflitsSudoku(partie(4, VIDE4)))).toEqual([]);
	});

	it('ne signale rien sur une grille complète et juste', () => {
		expect(tri(conflitsSudoku(partie(4, ENONCE4, SOL4)))).toEqual([]);
	});

	it('signale LES DEUX cases d’un doublon de ligne, pas seulement la dernière posée', () => {
		/* Le cas d'échec de l'issue : « ne marque qu'une seule des cases en cause ».
		   Marquer la dernière posée désignerait laquelle est « la mauvaise », ce que
		   le jeu ne sait pas. */
		const v = [...VIDE4];
		v[1] = 3;
		v[2] = 3;
		expect(tri(conflitsSudoku(partie(4, VIDE4, v)))).toEqual([1, 2]);
	});

	it('signale les TROIS cases quand la valeur apparaît trois fois', () => {
		const v = [...VIDE4];
		v[0] = 2;
		v[4] = 2;
		v[8] = 2;
		expect(tri(conflitsSudoku(partie(4, VIDE4, v)))).toEqual([0, 4, 8]);
	});

	it('signale un doublon de colonne', () => {
		const v = [...VIDE4];
		v[2] = 1;
		v[14] = 1;
		expect(tri(conflitsSudoku(partie(4, VIDE4, v)))).toEqual([2, 14]);
	});

	it('signale un doublon de région, même sans doublon de ligne ni de colonne', () => {
		// La contrainte la moins intuitive des trois et la plus oubliée (critère 9) :
		// si elle n'était pas marquée, l'enfant chercherait en vain ce qui cloche.
		const v = [...VIDE4];
		v[0] = 4;
		v[5] = 4;
		expect(tri(conflitsSudoku(partie(4, VIDE4, v)))).toEqual([0, 5]);
	});

	it('signale un doublon de région au 6×6, quelle que soit l’orientation retenue', () => {
		const geo = geometrieSudoku(6);
		const zone = regions(geo)[0];
		// deux cases de la même région qui ne partagent NI ligne NI colonne
		const paire = trouverPaireHorsLigneEtColonne(geo, zone);
		const v: Valeurs = new Array(36).fill(0);
		v[paire[0]] = 5;
		v[paire[1]] = 5;
		expect(tri(conflitsSudoku(partie(6, new Array(36).fill(0), v)))).toEqual(
			[...paire].sort((a, b) => a - b),
		);
	});

	it('réunit les cases de plusieurs conflits simultanés', () => {
		const v = [...VIDE4];
		v[0] = 1;
		v[3] = 1; // ligne
		v[8] = 2;
		v[12] = 2; // colonne
		expect(tri(conflitsSudoku(partie(4, VIDE4, v)))).toEqual([0, 3, 8, 12]);
	});

	it('signale AUSSI la case donnée avec laquelle l’enfant entre en conflit', () => {
		/* Le jeu ne sait pas laquelle des deux cases est « la mauvaise » — et
		   justement, ici, il pourrait le savoir : l'une est donnée. Le critère 13
		   dit pourtant « toutes les cases en cause », et c'est la lecture utile :
		   l'enfant doit voir CONTRE QUOI son symbole se heurte. Ne marquer que sa
		   pose lui laisse chercher la case fautive dans toute la ligne. */
		const enonce = [...VIDE4];
		enonce[0] = 3;
		const v = [...enonce];
		v[2] = 3;
		expect(tri(conflitsSudoku(partie(4, enonce, v)))).toEqual([0, 2]);
	});

	it('ne bloque pas la pose : le symbole en conflit est bel et bien posé', () => {
		/* Troisième volet du critère 13, et le plus facile à manquer. Bloquer la
		   pose reconstituerait le juste/faux scolaire dans un espace pensé pour y
		   échapper. */
		const enonce = [...VIDE4];
		enonce[0] = 3;
		const apres = poser(partie(4, enonce), 2, 3);
		expect(apres.valeurs[2]).toBe(3);
		expect(tri(conflitsSudoku(apres))).toEqual([0, 2]);
	});

	it('une grille remplie mais fausse est en conflit, et n’est pas terminée (critère 19)', () => {
		const faux = [...SOL4];
		faux[2] = SOL4[3];
		faux[3] = SOL4[2]; // deux valeurs échangées sur la première ligne
		const p = partie(4, ENONCE4, faux);
		expect(tri(conflitsSudoku(p)).length).toBeGreaterThan(0);
		expect(grilleTerminee(p)).toBe(false);
	});
});

/** Deux cases d'une même zone qui ne partagent ni ligne ni colonne : le seul
    doublon qui isole la contrainte de région. */
function trouverPaireHorsLigneEtColonne(geo: Geometrie, zone: number[]): [number, number] {
	for (const a of zone) {
		for (const b of zone) {
			if (b <= a) continue;
			const memeLigne = Math.floor(a / geo.cotes) === Math.floor(b / geo.cotes);
			const memeColonne = a % geo.cotes === b % geo.cotes;
			if (!memeLigne && !memeColonne) return [a, b];
		}
	}
	throw new Error('région dégénérée : aucune paire hors ligne et hors colonne');
}

/* ============================================================
   Poser, effacer, terminer (critères 13 et 19)
   ============================================================ */

describe('#666 — poser un symbole', () => {
	it('rend une NOUVELLE partie et ne touche pas à celle qu’on lui passe', () => {
		const p = partie(4, ENONCE4);
		const avant = [...p.valeurs];
		const apres = poser(p, 1, 2);
		expect(p.valeurs).toEqual(avant);
		expect(apres).not.toBe(p);
		expect(apres.valeurs[1]).toBe(2);
	});

	it('conserve la taille et l’énoncé', () => {
		const apres = poser(partie(4, ENONCE4), 1, 2);
		expect(apres.taille).toBe(4);
		expect(apres.enonce).toEqual(ENONCE4);
	});

	it('efface la case avec la valeur 0', () => {
		// L'effacement du critère 11 passe par un bouton explicite ; côté logique,
		// c'est cette pose-là.
		const p = poser(partie(4, ENONCE4), 1, 2);
		expect(poser(p, 1, 0).valeurs[1]).toBe(0);
	});

	it('remplace un symbole déjà posé', () => {
		// Effacer et reposer est une stratégie de raisonnement légitime (critère 28).
		const p = poser(partie(4, ENONCE4), 1, 2);
		expect(poser(p, 1, 3).valeurs[1]).toBe(3);
	});

	it('ne touche pas à une case donnée', () => {
		// L'énoncé « ne change jamais » : sans quoi la grille peut devenir insoluble
		// sans que rien ne le signale, et `estFixe` mentirait.
		const p = partie(4, ENONCE4);
		const i = ENONCE4.findIndex((x) => x !== 0);
		const apres = poser(p, i, 2);
		expect(apres.enonce).toEqual(ENONCE4);
		expect(apres.valeurs[i]).toBe(ENONCE4[i]);
	});

	it('n’écrit jamais une valeur hors du jeu de symboles', () => {
		/* Il n'y a que `taille` silhouettes : une valeur 5 dans un 4×4 est
		   inaffichable, donc la case paraîtrait vide tout en bloquant la grille. Le
		   pavé de symboles ne peut pas la produire, mais l'état persisté, lui, passe
		   par l'export et l'import de sauvegarde. */
		const p = partie(4, ENONCE4);
		for (const mauvaise of [5, 9, -1, 1.5, Number.NaN]) {
			const apres = poser(p, 1, mauvaise);
			for (const x of apres.valeurs) {
				expect(Number.isInteger(x)).toBe(true);
				expect(x).toBeGreaterThanOrEqual(0);
				expect(x).toBeLessThanOrEqual(4);
			}
		}
	});

	it('ne casse rien sur un index hors grille', () => {
		const p = partie(4, ENONCE4);
		for (const i of [-1, 16, 100]) {
			const apres = poser(p, i, 2);
			expect(apres.valeurs.length).toBe(16);
			expect(apres.valeurs).toEqual(p.valeurs);
		}
	});
});

describe('#666 critère 19 — une grille terminée l’est vraiment', () => {
	it('n’est pas terminée à l’ouverture', () => {
		for (const t of TAILLES) expect(grilleTerminee(tirerGrille(t, tirage(12)))).toBe(false);
	});

	it('n’est pas terminée s’il reste une seule case vide', () => {
		const presque = [...SOL4];
		presque[7] = 0;
		expect(grilleTerminee(partie(4, ENONCE4, presque))).toBe(false);
	});

	it('est terminée quand la grille est remplie et juste', () => {
		expect(grilleTerminee(partie(4, ENONCE4, SOL4))).toBe(true);
	});

	it('n’est PAS terminée quand la grille est remplie mais fausse', () => {
		/* Conséquence directe du critère 13 : puisque le conflit ne bloque pas la
		   pose, l'état « remplie et fausse » est ATTEIGNABLE. Le déclarer terminé
		   libérerait l'emplacement du critère 19 et féliciterait l'enfant pour une
		   grille en conflit. */
		const faux = [...SOL4];
		faux[0] = SOL4[1];
		faux[1] = SOL4[0];
		expect(grilleTerminee(partie(4, ENONCE4, faux))).toBe(false);
	});

	it('se termine aussi sur une grille 6×6 réellement résolue', () => {
		const p = tirerGrille(6, tirage(77));
		const solution = resoudreParDeductionElementaire(moteurSudoku(6), p.enonce);
		expect(solution).not.toBeNull();
		if (!solution) return;
		expect(grilleTerminee({ ...p, valeurs: solution })).toBe(true);
	});
});

/* ============================================================
   Les cases liées (critère 16)
   ============================================================ */

describe('#666 critère 16 — les cases liées à la sélection', () => {
	it('donne la ligne, la colonne et la région du 4×4, la case exclue', () => {
		// Géométrie sans ambiguïté : régions 2×2. Attendu calculé à la main.
		expect(tri(casesLiees(4, 0))).toEqual([1, 2, 3, 4, 5, 8, 12]);
		expect(tri(casesLiees(4, 10))).toEqual([2, 6, 8, 9, 11, 14, 15]);
	});

	it('en compte 7 pour toute case du 4×4 et 12 pour toute case du 6×6', () => {
		/* 2 × (cotes − 1) pour la ligne et la colonne, plus les cases de la région
		   qui ne sont ni sur l'une ni sur l'autre. Au 6×6 le compte vaut 12 dans les
		   DEUX orientations de région (5 + 5 + 2), donc l'attendu ne tranche pas un
		   choix que l'issue laisse ouvert. */
		for (const [t, attendu] of [
			[4, 7],
			[6, 12],
		] as const) {
			for (let i = 0; i < t * t; i++) {
				expect(casesLiees(t, i).size, `taille ${t}, case ${i}`).toBe(attendu);
			}
		}
	});

	it('n’inclut jamais la case sélectionnée, et rien hors de la grille', () => {
		for (const t of TAILLES) {
			for (let i = 0; i < t * t; i++) {
				const l = casesLiees(t, i);
				expect(l.has(i)).toBe(false);
				for (const j of l) {
					expect(j).toBeGreaterThanOrEqual(0);
					expect(j).toBeLessThan(t * t);
				}
			}
		}
	});

	it('contient toute la ligne et toute la colonne', () => {
		for (const t of TAILLES) {
			for (let i = 0; i < t * t; i++) {
				const l = casesLiees(t, i);
				const lig = Math.floor(i / t);
				const col = i % t;
				for (let k = 0; k < t; k++) {
					if (lig * t + k !== i) expect(l.has(lig * t + k)).toBe(true);
					if (k * t + col !== i) expect(l.has(k * t + col)).toBe(true);
				}
			}
		}
	});

	it('est symétrique : si B est liée à A, A est liée à B', () => {
		// Sinon la mise en évidence dépendrait du sens dans lequel on la lit, et un
		// enfant verrait sa région tantôt entière, tantôt tronquée.
		for (const t of TAILLES) {
			for (let i = 0; i < t * t; i++) {
				for (const j of casesLiees(t, i)) expect(casesLiees(t, j).has(i)).toBe(true);
			}
		}
	});

	it('coïncide avec les zones du moteur générique (critère 25)', () => {
		/* `casesLiees` ne doit pas être un second calcul de géométrie à côté de
		   celui du moteur : les deux divergeraient un jour, et l'aide du critère 16
		   surlignerait des cases que la règle ne contraint pas. */
		for (const t of TAILLES) {
			const geo = geometrieSudoku(t);
			const zones = [...lignes(geo), ...colonnes(geo), ...regions(geo)];
			for (let i = 0; i < t * t; i++) {
				const attendu = new Set<number>();
				for (const z of zones) if (z.includes(i)) for (const j of z) if (j !== i) attendu.add(j);
				expect(tri(casesLiees(t, i)), `taille ${t}, case ${i}`).toEqual(tri(attendu));
			}
		}
	});

	it('ne rend rien d’absurde sur un index hors grille', () => {
		// Ces index n'arrivent pas depuis la grille rendue, mais un `data-index`
		// bricolé ou un état importé, si. Le pire serait un index négatif surligné.
		for (const t of TAILLES) {
			for (const i of [-1, t * t, t * t + 5]) {
				for (const j of casesLiees(t, i)) {
					expect(j).toBeGreaterThanOrEqual(0);
					expect(j).toBeLessThan(t * t);
				}
			}
		}
	});
});

/* ============================================================
   L'assemblage sur le moteur (critère 25)
   ============================================================ */

describe('#666 critère 25 — le sudoku est un ASSEMBLAGE du moteur générique', () => {
	it('expose la géométrie de sa taille et trois contraintes', () => {
		for (const t of TAILLES) {
			const m = moteurSudoku(t);
			expect(m.geometrie).toEqual(geometrieSudoku(t));
			expect(m.contraintes.length).toBe(3);
			expect(m.contraintes.map((c) => c.id).filter((id) => id.trim() !== '').length).toBe(3);
			expect(new Set(m.contraintes.map((c) => c.id)).size).toBe(3);
		}
	});

	it('ses trois contraintes SONT l’unicité par ligne, par colonne et par région', () => {
		/* Cas d'échec du critère 25 : « la règle "un symbole par ligne, colonne et
		   région" est écrite en dur dans le module du sudoku ». On le mesure par
		   comportement : sur des grilles bruitées, chaque contrainte du jeu doit
		   coïncider, case pour case, avec l'une des trois unicités du moteur, et les
		   trois doivent être couvertes. */
		for (const t of TAILLES) {
			const geo = geometrieSudoku(t);
			const grilles = grillesBruitees(t, 40);
			const empreinte = (c: Contrainte): string =>
				grilles.map((v) => tri(c.conflits(geo, v)).join('|')).join(';');
			const attendues = [
				contrainteUnicite('ligne', lignes),
				contrainteUnicite('colonne', colonnes),
				contrainteUnicite('region', regions),
			].map(empreinte);
			expect(moteurSudoku(t).contraintes.map(empreinte).sort()).toEqual([...attendues].sort());
		}
	});
});

/** Des grilles pleines de doublons : elles ne sont jouables par personne, mais
    elles discriminent des contraintes que des grilles valides confondraient
    (toutes rendent l'ensemble vide). */
function grillesBruitees(taille: TailleSudoku, combien: number): Valeurs[] {
	const r = tirage(4242);
	const out: Valeurs[] = [];
	for (let n = 0; n < combien; n++) {
		out.push([...Array(taille * taille)].map(() => Math.floor(r() * (taille + 1))));
	}
	return out;
}
