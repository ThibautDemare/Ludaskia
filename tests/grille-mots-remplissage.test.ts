/* ============================================================
   Le REMPLISSAGE de `src/core/jeux/grille-mots.ts` — et surtout ce qu'il fait
   quand il N'Y ARRIVE PAS.

   `grille-mots.test.ts` tient la géométrie (poser, retirer, conflits, terminée) ;
   `mots-cases.test.ts` tient le cas nominal côté jeu (chaque motif livré se
   remplit, 200 tirages par taille). Restaient trois chemins que personne ne
   jouait, tous sur le versant de l'ÉCHEC :

     1. `remplirMotif` abandonne parce que son budget de nœuds est épuisé ;
     2. `choisirRemplissage` repasse à budget DESSERRÉ (2ᵉ puis 3ᵉ passe) ;
     3. plus rien ne marche : `choisirRemplissage` rend `null`, et `tirerGrille`
        lève.

   Ils n'étaient pas seulement non couverts, ils étaient INATTEIGNABLES : le
   solveur ne prenait ni liste de mots ni budget, donc l'échec aurait demandé
   d'appauvrir le vivier réel. `remplirMotif(motif, mots, r, budget)`,
   `choisirRemplissage(motifs, mots, r, budgets)` et le troisième paramètre de
   `remplir`/`tirerGrille` les ouvrent — ce fichier les emprunte.

   ── LA QUESTION QUI STRUCTURE CE FICHIER ────────────────────────────────────

   Un échec de remplissage n'est pas un bug : c'est un dessin trop dense ou un
   vivier trop pauvre, et c'est prévu. Ce qui compte est qu'il se manifeste
   PROPREMENT. Concrètement, quatre choses qu'on vérifie à chaque échec :

   • le retour est `null` — pas un tableau où il manque des mots, pas une grille
     à moitié faite. Un remplissage partiel servi à l'enfant, c'est une grille
     insoluble qu'il croira avoir ratée ;
   • ce qu'on a PASSÉ en entrée ressort intact. Le solveur pose et retire des
     mots pendant sa recherche : s'il le faisait dans les tableaux de l'appelant,
     un échec laisserait derrière lui un motif ou un vivier abîmés, et le tirage
     suivant partirait d'un état corrompu sans que rien ne le signale ;
   • l'abandon par budget se distingue de l'insolubilité — mêmes entrées, même
     graine, budget desserré : ça passe. Sans cette paire, un test « rend null »
     serait vert aussi bien pour un solveur qui renonce toujours ;
   • quand il ne reste plus rien à essayer, `tirerGrille` LÈVE au lieu de servir
     une partie vide, et son message dit quelle taille a échoué.

   ── DES MOTS INVENTÉS, EXPRÈS ───────────────────────────────────────────────

   Tout ce fichier travaille sur des suites de lettres qui ne sont pas du
   français. Ce n'est pas de la coquetterie : c'est la promesse faite à #665
   (« reprendre ce moteur en ne changeant que la SOURCE des mots »), et la seule
   façon de la vérifier pour de bon. Un moteur qui aurait besoin d'un vrai mot
   pour fonctionner ne serait pas celui-là — et `mots-cases-gate.test.ts` ne peut
   en dire que la moitié statique (le jeu importe le solveur, il ne recalcule
   aucune coordonnée).
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
	BUDGETS,
	BUDGET_NOEUDS,
	casesDe,
	choisirRemplissage,
	remplirMotif,
	type Emplacement,
	type Motif,
} from '../src/core/jeux/grille-mots';
import { motifsDe, remplir, tirerGrille, vivierMotsCases } from '../src/core/jeux/mots-cases';
import {
	MOTIFS_MOTS_CASES,
	TAILLES_MOTS_CASES,
	type TailleMotsCases,
} from '../src/data/jeux/motifs-mots-cases';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { tirage } from './aleatoire';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const h = (ligne: number, colonne: number, longueur: number): Emplacement => ({
	ligne,
	colonne,
	longueur,
	sens: 'h',
});
const v = (ligne: number, colonne: number, longueur: number): Emplacement => ({
	ligne,
	colonne,
	longueur,
	sens: 'v',
});

/* Une croix : un mot de 5 en travers, un mot de 3 en hauteur, une seule case
   commune. Deux emplacements suffisent — c'est la plus petite figure où le
   solveur doit descendre de deux crans, donc où un budget d'un nœud le coupe. */
const CROIX: Motif = {
	id: 'croix',
	largeur: 5,
	hauteur: 3,
	emplacements: [h(1, 0, 5), v(0, 2, 3)],
};

/* Les deux seuls mots qui remplissent la croix : ils partagent le « c ». */
const MOTS_CROIX = ['abcde', 'xcy'];

/** Le placement respecte-t-il la géométrie du motif ? Recalculé ici — un juge
    qui s'appuierait sur `croisements()` du module testé serait faux EN MÊME
    TEMPS que lui. */
function placementValide(m: Motif, solution: readonly string[]): boolean {
	if (solution.length !== m.emplacements.length) return false;
	const grille = new Map<string, string>();
	for (let i = 0; i < m.emplacements.length; i++) {
		const lettres = [...solution[i].normalize('NFC')];
		if (lettres.length !== m.emplacements[i].longueur) return false;
		const cases = casesDe(m.emplacements[i]);
		for (let k = 0; k < cases.length; k++) {
			const cle = `${cases[k].ligne},${cases[k].colonne}`;
			const dejaLa = grille.get(cle);
			if (dejaLa !== undefined && dejaLa !== lettres[k]) return false;
			grille.set(cle, lettres[k]);
		}
	}
	return true;
}

/** Toutes les suites de `a` et de `b` de longueur `n`. Un vivier COMPLET pour
    cette longueur : n'importe quelle contrainte de croisement y trouve son
    compte, ce qui isole le budget comme seule cause d'échec possible. */
function binaires(n: number): string[] {
	if (n === 0) return [''];
	return binaires(n - 1).flatMap((s) => [s + 'a', s + 'b']);
}

/** Un vivier sans un mot de français, couvrant toutes les longueurs que les
    motifs livrés emploient. */
const LONGUEURS_LIVREES = [
	...new Set(MOTIFS_MOTS_CASES.flatMap((m) => m.emplacements.map((e) => e.longueur))),
].sort((a, b) => a - b);
const MOTS_INVENTES = LONGUEURS_LIVREES.flatMap(binaires);

/** Photographie du stockage, pour prouver qu'un échec n'écrit rien. */
function instantaneStockage(): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k != null) out[k] = localStorage.getItem(k) ?? '';
	}
	return out;
}

describe('remplirMotif — le moteur ne connaît pas le français', () => {
	it('remplit une croix avec les deux seules suites de lettres qui conviennent', () => {
		const solution = remplirMotif(CROIX, MOTS_CROIX, tirage(1));
		expect(solution).toEqual(['abcde', 'xcy']);
	});

	it('remplit tous les motifs LIVRÉS avec un vivier de « a » et de « b »', () => {
		/* La promesse faite à #665, mesurée : le solveur ne lit pas les mots, il
		   compare des lettres et compte des cases. S'il échouait ici, c'est qu'il
		   dépendrait de quelque chose du vivier français — sa taille, sa
		   distribution de lettres — et les mots croisés hériteraient de ce lien. */
		for (const motif of MOTIFS_MOTS_CASES) {
			const solution = remplirMotif(motif, MOTS_INVENTES, tirage(7));
			expect(solution, motif.id).not.toBeNull();
			if (!solution) continue;
			expect(placementValide(motif, solution), `${motif.id} : croisement en désaccord`).toBe(true);
			expect(new Set(solution).size, `${motif.id} : un mot en double`).toBe(solution.length);
			for (const mot of solution) {
				expect(MOTS_INVENTES, `${motif.id} : « ${mot} » sort d'ailleurs`).toContain(mot);
			}
		}
	});
});

describe('remplirMotif — l’abandon par budget', () => {
	it('rend null quand le budget est épuisé, là où le budget par défaut réussit', () => {
		/* La paire est le test. « Rend null » tout seul serait vert pour un solveur
		   qui renonce toujours ; c'est la comparaison à entrées ET graine
		   IDENTIQUES qui prouve qu'on tient l'abandon par budget, et pas une
		   insolubilité. */
		expect(remplirMotif(CROIX, MOTS_CROIX, tirage(1), 1)).toBeNull();
		expect(remplirMotif(CROIX, MOTS_CROIX, tirage(1), BUDGET_NOEUDS)).toEqual(['abcde', 'xcy']);
	});

	it('rend null dès le budget nul, sans rien tenter', () => {
		// Le zéro est la borne du garde-fou : un budget de zéro nœud ne doit pas se
		// lire comme « pas de limite », qui est l'écriture voisine et le contraire
		// exact — c'est celle qui fige l'onglet sur un dessin trop dense.
		expect(remplirMotif(CROIX, MOTS_CROIX, tirage(1), 0)).toBeNull();
	});

	it('rend null, jamais un placement à trous', () => {
		/* Le vrai danger d'un abandon mal fait : rendre le tableau à moitié rempli.
		   Servi tel quel, il donne une grille avec des emplacements sans mot, que
		   l'enfant ne pourra jamais finir — et il croira que c'est lui. Le piège
		   n'est pas théorique : une case sans mot se lit très bien comme une chaîne
		   VIDE, et un tableau de la bonne longueur avec un `''` dedans passe tous
		   les contrôles de forme. On prend donc les deux bouts — un budget qui
		   coupe la recherche à chaque profondeur possible, et le cas nominal. */
		for (let budget = 0; budget <= CROIX.emplacements.length; budget++) {
			expect(remplirMotif(CROIX, MOTS_CROIX, tirage(1), budget), `budget ${budget}`).toBeNull();
		}
		for (const motif of MOTIFS_MOTS_CASES) {
			const solution = remplirMotif(motif, MOTS_INVENTES, tirage(12));
			expect(solution, motif.id).not.toBeNull();
			for (const mot of solution ?? [])
				expect(mot, `${motif.id} : emplacement sans mot`).not.toBe('');
		}
	});

	it('rend aussi null quand le remplissage est IMPOSSIBLE, budget ou pas', () => {
		// Aucun mot de 3 lettres : l'emplacement vertical n'a aucun candidat. Vu de
		// l'appelant, l'impossible et l'abandon se disent de la même façon — c'est
		// le contrat, et c'est ce qui permet à `choisirRemplissage` de réessayer.
		expect(remplirMotif(CROIX, ['abcde', 'zyxwv'], tirage(1), BUDGET_NOEUDS)).toBeNull();
	});

	it('laisse le motif et la liste de mots exactement dans l’état reçu', () => {
		/* La recherche pose et retire des mots pendant qu'elle tâtonne. Si elle le
		   faisait dans les tableaux de l'appelant, un échec laisserait derrière lui
		   un vivier amputé ou un motif remanié, et le tirage SUIVANT partirait d'un
		   état corrompu — le genre de panne qui ne se voit qu'à la troisième
		   grille. On vérifie après un échec, là où le retour en arrière est le
		   moins susceptible d'avoir été fait jusqu'au bout. */
		const mots = [...MOTS_CROIX];
		const motif: Motif = { ...CROIX, emplacements: [...CROIX.emplacements] };
		const emplacementsAvant = JSON.stringify(motif.emplacements);

		expect(remplirMotif(motif, mots, tirage(1), 1)).toBeNull();

		expect(mots).toEqual(MOTS_CROIX);
		expect(JSON.stringify(motif.emplacements)).toBe(emplacementsAvant);
	});

	it('reste déterministe une fois le budget desserré', () => {
		/* Un échec qu'on ne sait pas reproduire ne se diagnostique pas — et sur ce
		   chemin-là, l'échec de la 1ʳᵉ passe a CONSOMMÉ des tirages avant la
		   seconde. C'est le cas où le déterminisme se perd le plus facilement, et le
		   seul où sa vérification apprend quelque chose. */
		const motifs = motifsDe('grande');
		const a = choisirRemplissage(motifs, MOTS_INVENTES, tirage(77), [1, BUDGET_NOEUDS]);
		const b = choisirRemplissage(motifs, MOTS_INVENTES, tirage(77), [1, BUDGET_NOEUDS]);
		expect(a).not.toBeNull();
		expect(a?.motif.id).toBe(b?.motif.id);
		expect(a?.solution).toEqual(b?.solution);
	});
});

describe('choisirRemplissage — les passes à budget croissant', () => {
	const MOTIFS = [CROIX];

	it('desserre vraiment : les budgets par défaut vont en augmentant', () => {
		/* Le contrat est « à budget CROISSANT ». Trois valeurs égales — la faute de
		   copie la plus banale — laisseraient le code en place, les trois passes
		   tourneraient, et le desserrage n'existerait plus. Rien d'autre ne le
		   dirait : la 2ᵉ et la 3ᵉ passe échoueraient exactement comme la 1ʳᵉ. */
		expect(BUDGETS.length).toBeGreaterThanOrEqual(2);
		for (let i = 1; i < BUDGETS.length; i++) {
			expect(BUDGETS[i], `passe ${i + 1}`).toBeGreaterThan(BUDGETS[i - 1]);
		}
	});

	it('réussit à la 2ᵉ passe ce que la 1ʳᵉ n’avait pas pu faire', () => {
		// Même motif, mêmes mots, même graine : seule la liste des budgets change.
		expect(choisirRemplissage(MOTIFS, MOTS_CROIX, tirage(2), [1])).toBeNull();
		const trouve = choisirRemplissage(MOTIFS, MOTS_CROIX, tirage(2), [1, BUDGET_NOEUDS]);
		expect(trouve).not.toBeNull();
		expect(trouve?.motif.id).toBe('croix');
		expect(placementValide(CROIX, trouve?.solution ?? [])).toBe(true);
	});

	it('va jusqu’à la 3ᵉ passe quand les deux premières échouent', () => {
		expect(choisirRemplissage(MOTIFS, MOTS_CROIX, tirage(2), [1, 1])).toBeNull();
		const trouve = choisirRemplissage(MOTIFS, MOTS_CROIX, tirage(2), [1, 1, BUDGET_NOEUDS]);
		expect(trouve?.solution).toEqual(['abcde', 'xcy']);
	});

	it('rend le motif REÇU, pas une copie remaniée', () => {
		/* L'appelant range ses propres champs sur le motif (`taille`, et demain les
		   définitions de #665) et s'attend à les retrouver. Le retrouver À
		   L'IDENTITÉ est plus fort que « un objet qui lui ressemble » : c'est ce qui
		   garantit qu'aucun champ inconnu du moteur n'a été perdu en route. */
		const motifs = motifsDe('petite');
		const trouve = choisirRemplissage(motifs, MOTS_INVENTES, tirage(4));
		expect(trouve).not.toBeNull();
		expect(motifs.some((m) => m === trouve?.motif)).toBe(true);
		expect(trouve?.motif.taille).toBe('petite');
	});

	it('renonce — en rendant null — quand aucun motif ne se remplit', () => {
		/* Le bout de la chaîne, côté moteur. Rendre `null` plutôt que jeter est ce
		   qui laisse l'appelant décider quoi en dire ; l'exception, elle, est son
		   affaire (test suivant). Ici, un seul mot pour deux emplacements : aucune
		   passe, aussi large soit-elle, n'y changera rien. */
		expect(choisirRemplissage(MOTIFS, ['abcde'], tirage(3))).toBeNull();
		expect(choisirRemplissage([], MOTS_CROIX, tirage(3))).toBeNull();
	});

	it('n’écrit rien et n’appelle pas Math.random, même en échouant', () => {
		const espion = vi.spyOn(Math, 'random');
		const avant = instantaneStockage();
		expect(choisirRemplissage(MOTIFS, ['abcde'], tirage(3))).toBeNull();
		expect(espion).not.toHaveBeenCalled();
		expect(instantaneStockage()).toEqual(avant);
		espion.mockRestore();
	});
});

describe('le jeu — sa source de mots est un PARAMÈTRE', () => {
	it('remplir n’utilise que la liste qu’on lui donne', () => {
		// Sans quoi le vivier français resterait câblé en dur et le troisième
		// paramètre serait décoratif — donc les chemins d'échec, injouables.
		const solution = remplir(MOTIFS_MOTS_CASES[0], tirage(8), MOTS_INVENTES);
		expect(solution).not.toBeNull();
		for (const mot of solution ?? []) expect(MOTS_INVENTES).toContain(mot);
	});

	it('tirerGrille sert une partie faite de ces mots-là, et d’aucun autre', () => {
		const vivier = new Set(vivierMotsCases());
		for (const taille of TAILLES_MOTS_CASES) {
			const p = tirerGrille(taille, tirage(6), MOTS_INVENTES);
			expect(p.mots.length, taille).toBe(p.motif.emplacements.length);
			for (const mot of p.mots) {
				expect(MOTS_INVENTES, `${taille} : « ${mot} »`).toContain(mot);
				expect(vivier.has(mot), `${taille} : « ${mot} » vient du vivier français`).toBe(false);
			}
		}
	});
});

describe('tirerGrille — la panne, quand plus aucun motif ne se remplit', () => {
	/* Un seul mot de deux lettres : aucun emplacement livré ne fait deux lettres,
	   donc aucun motif ne peut se remplir, à aucun budget. */
	const IMPOSSIBLE = ['ab'];

	it.each([...TAILLES_MOTS_CASES])('taille « %s » : elle LÈVE, elle ne sert rien', (taille) => {
		/* L'alternative — rendre une partie vide, ou une grille à trous — est le
		   scénario à éviter : l'enfant reçoit une grille qu'il ne peut pas finir et
		   n'a aucun moyen de savoir que le fautif n'est pas lui. Lever laisse au
		   runner le soin de montrer un panneau (c'est ce qu'il fait, et c'est
		   Playwright qui le vérifie). */
		expect(() => tirerGrille(taille, tirage(1), IMPOSSIBLE)).toThrow(Error);
	});

	it('dit dans son message QUELLE taille a échoué', () => {
		/* Une exception sans contenu oblige à rejouer le tirage pour comprendre. Le
		   message est le seul indice qui traverse jusqu'au journal du navigateur, et
		   il doit distinguer les deux tailles — sans quoi on cherche le motif fautif
		   parmi sept au lieu de trois ou quatre. */
		for (const taille of TAILLES_MOTS_CASES) {
			expect(() => tirerGrille(taille, tirage(1), IMPOSSIBLE)).toThrow(new RegExp(taille));
		}
	});

	it('n’écrit rien et n’appelle pas Math.random en échouant', () => {
		const espion = vi.spyOn(Math, 'random');
		const avant = instantaneStockage();
		expect(() => tirerGrille('petite', tirage(1), IMPOSSIBLE)).toThrow();
		expect(espion).not.toHaveBeenCalled();
		expect(instantaneStockage()).toEqual(avant);
		espion.mockRestore();
	});

	it('ne laisse rien de cassé derrière elle : le tirage suivant est normal', () => {
		/* La vraie question après une panne : est-ce que l'appli s'en remet ? Le
		   vivier est mis en cache au premier appel et les motifs sont partagés ; un
		   échec qui aurait grignoté l'un ou l'autre ne se verrait qu'au tirage
		   d'après, et personne ne ferait le lien. */
		const vivierAvant = vivierMotsCases();
		expect(() => tirerGrille('petite', tirage(1), IMPOSSIBLE)).toThrow();
		expect(vivierMotsCases()).toEqual(vivierAvant);

		const p = tirerGrille('petite', tirage(1));
		expect(p.mots).toHaveLength(p.motif.emplacements.length);
		expect(p.grille.poses.every((x) => x === null)).toBe(true);
	});

	it('la panne vient du VIVIER, pas des motifs : les mêmes motifs marchent ensuite', () => {
		// Le corollaire qui nomme la cause. Si cette assertion tombait avec la
		// précédente, c'est que l'échec aurait abîmé les motifs eux-mêmes.
		const taille: TailleMotsCases = 'grande';
		expect(() => tirerGrille(taille, tirage(2), IMPOSSIBLE)).toThrow();
		const p = tirerGrille(taille, tirage(2), MOTS_INVENTES);
		expect(motifsDe(taille).map((m) => m.id)).toContain(p.motif.id);
	});
});
