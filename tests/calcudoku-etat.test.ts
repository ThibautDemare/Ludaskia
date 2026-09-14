/* ============================================================
   Calcudoku (#667) — l'ÉTAT PERSISTÉ : grille en cours, initiation, clés.

   Écrit AVANT l'implémentation, d'après les critères numérotés de l'issue #667.
   Le module n'existe pas encore : ce fichier est ROUGE par construction.

   Critères portés ici : 32 (la toute première grille jamais jouée sur le profil,
   moitié persistée), 36 (une grille en cours survit à la sortie et au
   rechargement, et se retrouve telle quelle), 37 (elle est retrouvée SANS
   relance), 38 (terminer libère l'emplacement), 45 (les clés), plus les moitiés
   mécanisables des critères 47 et 54 (aucun score, aucune économie).

   ── DEUX ANGLES REPRIS DU PATTERN MAISON, ET POURQUOI ───────────────────────

   Le CLOISONNEMENT PAR PROFIL. Une grille en cours qui fuit d'un enfant à
   l'autre est un défaut invisible en développement (un seul profil) et immédiat
   à la maison.

   La DONNÉE BRICOLÉE. Ces clés traversent l'export et l'import de sauvegarde du
   parent : une valeur absurde peut REVENIR, des mois plus tard, sur une version
   plus récente de l'appli. La convention du dépôt règle ce risque à la LECTURE
   et non à l'écriture (`getRevisionPlafond`, `getJeuxPlafondMinutes`, l'invariant
   « proposés ⊆ attente » de #661), et c'est ce qu'on éprouve ici. Sans ce
   bornage, une grille de longueur 3 rendue pour un 4×4 casserait le rendu à
   l'ouverture, et l'enfant n'aurait aucun moyen de s'en sortir : la donnée
   fautive serait relue à chaque tentative.

   ── LE BORNAGE VA JUSQU'À LA RÉSOLUBILITÉ, ET C'EST RÉCENT ──────────────────

   Ce paragraphe disait l'inverse jusqu'au 2026-09-14, et il avait raison de le
   dire : le bornage s'arrêtait alors à la validité STRUCTURELLE (forme,
   longueurs, bornes des valeurs, cohérence énoncé/état courant, conformité des
   cages aux critères 9, 11 et 12), et ce fichier le signalait plutôt que de
   laisser extrapoler.

   Arbitrage du mainteneur : le module rejoue désormais
   `resoudreParDeductionElementaire` à la relecture, comme le fait
   `sudoku-etat.ts`, et rend `null` sur un énoncé insoluble. Sans ce contrôle,
   une grille structurellement valide mais arithmétiquement impossible était
   servie SANS ISSUE — « Recommencer cette grille » réinjecte le même énoncé et
   « Nouvelle grille » n'apparaît qu'une fois la grille terminée, donc le profil
   restait bloqué sur ce jeu.

   Il juge l'ÉNONCÉ, jamais l'état courant, que l'enfant a le droit d'avoir
   rendu contradictoire en jouant : le refuser lui effacerait sa partie parce
   qu'il s'est trompé.

   NOTE DE MÉTHODE. Le contrat ne fixe PAS la forme sous laquelle la partie est
   rangée sous sa clé. Aucun test d'ici ne la suppose : les cas de donnée
   corrompue passent soit par le sommet de la clé (une chaîne, un nombre), soit
   par une PARTIE INVALIDE confiée à `sauverPartie`. Un test qui devinerait la
   forme serait vert ou rouge selon la chance, ce qui ne garderait rien.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	CLE_CALCUDOKU_INITIE,
	CLE_CALCUDOKU_PARTIE,
	dejaInitie,
	effacerPartie,
	marquerInitie,
	partieEnCours,
	sauverPartie,
} from '../src/core/jeux/calcudoku-etat';
import * as etat from '../src/core/jeux/calcudoku-etat';
import {
	COTE,
	grilleTerminee,
	moteurCalcudoku,
	poser,
	tirerGrille,
	type Cage,
	type Partie,
} from '../src/core/jeux/calcudoku';
import { resoudreParDeductionElementaire, type Valeurs } from '../src/core/jeux/grille-contraintes';
import { meilleurScore } from '../src/core/jeux/etat';
import {
	activeProfile,
	addProfile,
	initProfiles,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { appKeys, lsGet, lsSet, setOnDataWrite } from '../src/core/storage';
import { getXP, addXP } from '../src/core/progress';
import { tirage } from './aleatoire';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const N = COTE * COTE;

/** Une grille RÉELLE, tirée par le jeu. Les cages n'étant pas devinables à la
    main sans reconstruire un générateur, l'énoncé vient du tirage — comme le
    fait `sudoku-etat.test.ts` pour la géométrie du 6×6. */
function servie(graine = 5): Partie {
	const p = tirerGrille(tirage(graine));
	expect(p, `aucune grille pour la graine ${graine} : test à vide`).not.toBeNull();
	if (!p) throw new Error('grille absente');
	return p;
}

/** Une partie ENTAMÉE : trois chiffres posés par-dessus un énoncé réel. */
function entamee(graine = 5): Partie {
	let p = servie(graine);
	let poses = 0;
	for (let i = 0; i < N && poses < 3; i++) {
		if (p.valeurs[i] === 0 && p.enonce[i] === 0) {
			p = poser(p, i, 1 + (poses % COTE));
			poses++;
		}
	}
	return p;
}

/** Une partie RÉSOLUE. Le solveur du moteur sert ici de FABRIQUE, pas d'attendu :
    l'attendu (« une grille terminée ne se rouvre pas terminée ») vient du
    critère 38, et la justesse du solveur est éprouvée ailleurs, par l'oracle
    indépendant de `calcudoku.test.ts`. */
function resolue(graine = 5): Partie {
	const p = servie(graine);
	const solution = resoudreParDeductionElementaire(moteurCalcudoku(p.cages), p.enonce);
	expect(solution, `grille ${graine} non résoluble : fabrique en panne`).not.toBeNull();
	if (!solution) throw new Error('solution absente');
	return { ...p, valeurs: solution };
}

describe('#667 critère 45 — les clés de stockage', () => {
	it('critère 45 : les deux clés commencent par `ludaskia_`', () => {
		for (const cle of [CLE_CALCUDOKU_PARTIE, CLE_CALCUDOKU_INITIE]) {
			expect(cle.startsWith('ludaskia_'), cle).toBe(true);
		}
	});

	it('critère 45 : elles sont distinctes l’une de l’autre', () => {
		expect(CLE_CALCUDOKU_PARTIE).not.toBe(CLE_CALCUDOKU_INITIE);
	});

	it('critère 45 : elles entrent dans l’export et la suppression de profil', () => {
		/* `appKeys()` filtre sur `ludaskia_`, et ce filtre alimente l'export du parent
		   ET la suppression d'un profil. Le préfixe est déjà tenu statiquement par
		   `cles-stockage-gate.test.ts` ; ce qu'on éprouve ici est la conséquence
		   observable : la donnée est rangée sous le profil actif et le suit. */
		marquerInitie();
		sauverPartie(entamee());
		const cles = appKeys();
		for (const cle of [CLE_CALCUDOKU_PARTIE, CLE_CALCUDOKU_INITIE]) {
			expect(
				cles.some((k) => k.includes(cle)),
				cle,
			).toBe(true);
		}
	});
});

describe('#667 critère 36 — la grille en cours survit et se retrouve telle quelle', () => {
	it('critère 36 : rien en cours sur un profil neuf', () => {
		expect(partieEnCours()).toBeNull();
	});

	it('critère 36 : la grille est rendue exactement telle qu’on l’a laissée', () => {
		/* Cas d'échec littéral : « quitter, recharger ou atteindre le plafond fait
		   perdre les chiffres posés ». Avec un plafond quotidien, une grille peut très
		   bien ne pas se terminer dans la session : repartir de zéro serait le cas
		   NORMAL, pas le cas rare. */
		const p = entamee();
		sauverPartie(p);
		expect(partieEnCours()).toEqual(p);
	});

	it('critère 36 : les cages sont rendues aussi, pas seulement les chiffres', () => {
		// Une grille dont les cages se perdent n'est plus la même grille : ses
		// objectifs changent, donc sa solution aussi.
		const p = entamee(9);
		sauverPartie(p);
		const relue = partieEnCours();
		expect(relue?.cages).toEqual(p.cages);
		expect(relue?.enonce).toEqual(p.enonce);
		expect(relue?.valeurs).toEqual(p.valeurs);
	});

	it('critère 36 : une seconde sauvegarde REMPLACE la première', () => {
		const premiere = entamee(1);
		const seconde = entamee(2);
		sauverPartie(premiere);
		sauverPartie(seconde);
		expect(partieEnCours()).toEqual(seconde);
	});

	it('critère 36 : survit à un enregistrement coup par coup', () => {
		// C'est le régime réel : on sauve à chaque pose. Ce qui doit rester vrai,
		// c'est que l'énoncé et les cages ne dérivent pas au fil des écritures.
		let p = servie(3);
		for (let n = 0; n < 3; n++) {
			const libre = p.valeurs.findIndex((x, i) => x === 0 && p.enonce[i] === 0);
			if (libre < 0) break;
			p = poser(p, libre, 1);
			sauverPartie(p);
		}
		const relue = partieEnCours();
		expect(relue?.enonce).toEqual(p.enonce);
		expect(relue?.valeurs).toEqual(p.valeurs);
		expect(relue?.cages).toEqual(p.cages);
	});

	it('critère 36 : reste propre au profil actif', () => {
		sauverPartie(entamee());
		addProfile('Cadette');
		expect(partieEnCours()).toBeNull();
	});

	it('critère 36 : rend un état INDÉPENDANT à chaque relecture', () => {
		// Deux relectures qui partageraient leurs tableaux laisseraient une pose faite
		// dans un écran modifier l'état d'un autre, sans passer par `poser`.
		sauverPartie(entamee());
		const a = partieEnCours();
		const b = partieEnCours();
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(a?.valeurs).not.toBe(b?.valeurs);
		expect(a?.enonce).not.toBe(b?.enonce);
		expect(a?.cages).not.toBe(b?.cages);
	});
});

describe('#667 critère 36 — une grille bricolée ne revient pas telle quelle', () => {
	/* Le stockage n'est pas un canal de confiance : il traverse l'export/import de
	   sauvegarde du parent. Une grille dont la forme est IMPOSSIBLE ne peut pas
	   être rendue « telle quelle » — elle n'est aucune grille. `partieEnCours`
	   doit rendre `null` plutôt qu'une partie que le rendu ne saura pas dessiner. */

	const bricoler = (valeur: unknown): void => {
		lsSet(CLE_CALCUDOKU_PARTIE, valeur);
	};

	it('refuse une valeur qui n’est pas du tout un état de jeu', () => {
		for (const brico of ['bonjour', 42, true, [1, 2, 3], {}, []]) {
			bricoler(brico);
			expect(partieEnCours(), `valeur stockée ${JSON.stringify(brico)}`).toBeNull();
		}
	});

	it('refuse une grille de la mauvaise longueur', () => {
		const p = entamee();
		sauverPartie({ ...p, valeurs: p.valeurs.slice(0, 3), enonce: p.enonce.slice(0, 3) });
		expect(partieEnCours()).toBeNull();
	});

	it('refuse une grille dont une case n’est pas un entier de 0 à 4', () => {
		/* 7 dans un 4×4 est inaffichable — il n'y a que quatre chiffres — donc la
		   case paraîtrait vide tout en bloquant la grille : l'enfant verrait un trou
		   qu'aucun chiffre ne remplit. */
		for (const mauvaise of [7, -1, 1.5, Number.NaN]) {
			localStorage.clear();
			initProfiles();
			const p = entamee();
			const valeurs: Valeurs = [...p.valeurs];
			const libre = p.enonce.findIndex((x) => x === 0);
			valeurs[libre] = mauvaise;
			sauverPartie({ ...p, valeurs });
			expect(partieEnCours(), `case = ${String(mauvaise)}`).toBeNull();
		}
	});

	it('refuse une partie dont l’état courant contredit son énoncé', () => {
		// L'énoncé ne change jamais : une case donnée qui porte autre chose dans
		// l'état courant n'est plus une grille, c'est deux grilles mélangées — et
		// `estFixe` mentirait ensuite à l'enfant sur ce qu'il peut toucher.
		const p = entamee();
		const i = p.enonce.findIndex((x) => x !== 0);
		const valeurs: Valeurs = [...p.valeurs];
		valeurs[i] = (p.enonce[i] % COTE) + 1;
		sauverPartie({ ...p, valeurs });
		expect(partieEnCours()).toBeNull();
	});

	it('refuse une cage qui désigne une case hors de la grille', () => {
		const p = entamee();
		const cages: Cage[] = [{ cases: [0, 99], operation: 'somme', objectif: 5 }, ...p.cages];
		sauverPartie({ ...p, cages });
		expect(partieEnCours()).toBeNull();
	});

	it('refuse une cage dont l’opération n’existe pas', () => {
		/* Une division importée d'une version future : le critère 11 l'interdit, et
		   le rendu n'aurait aucun symbole à afficher. */
		const p = entamee();
		/* La double assertion est DÉLIBÉRÉE et n'est pas un contournement de typage :
		   c'est le seul moyen de simuler ce qui arrive par un import de sauvegarde,
		   que le type de `sauverPartie` interdit — heureusement — de produire par
		   l'API. Même motif que `prefBricolee` dans `sudoku-etat.test.ts`. */
		const cages = [
			{ cases: [0, 1], operation: 'division', objectif: 2 },
			...p.cages,
		] as unknown as Cage[];
		sauverPartie({ ...p, cages });
		expect(partieEnCours()).toBeNull();
	});

	it('refuse une cage de différence ou de produit à plus de deux cases', () => {
		// Critère 12, appliqué à la porte du stockage : une différence à trois termes
		// n'a pas de sens univoque, donc la grille n'est pas finissable.
		for (const operation of ['difference', 'produit'] as const) {
			localStorage.clear();
			initProfiles();
			const p = entamee();
			sauverPartie({ ...p, cages: [{ cases: [0, 1, 2], operation, objectif: 2 }] });
			expect(partieEnCours(), operation).toBeNull();
		}
	});

	it('refuse deux cages qui se partagent une case', () => {
		// `cageDe` rendrait l'une ou l'autre selon l'ordre, donc la phrase du
		// critère 15 dirait un objectif sur deux.
		const p = entamee();
		sauverPartie({
			...p,
			cages: [
				{ cases: [0, 1], operation: 'somme', objectif: 5 },
				{ cases: [1, 2], operation: 'somme', objectif: 5 },
			],
		});
		expect(partieEnCours()).toBeNull();
	});

	it('ne lève jamais, quelle que soit la valeur stockée', () => {
		/* La lecture se fait à l'ouverture du jeu : une exception ici, et l'enfant
		   n'a plus aucun moyen de rentrer — la donnée fautive serait relue à chaque
		   tentative. */
		for (const brico of ['x', 0, null, [], {}, { cages: 1, enonce: 'a', valeurs: null }]) {
			bricoler(brico);
			expect(() => partieEnCours(), JSON.stringify(brico)).not.toThrow();
		}
	});
});

describe('#667 critère 38 — terminer libère l’emplacement', () => {
	it('critère 38 : `effacerPartie` vide l’emplacement', () => {
		sauverPartie(entamee());
		effacerPartie();
		expect(partieEnCours()).toBeNull();
	});

	it('critère 38 : effacer deux fois ne se plaint pas', () => {
		effacerPartie();
		effacerPartie();
		expect(partieEnCours()).toBeNull();
	});

	it('critère 38 : une grille terminée ne se rouvre JAMAIS terminée', () => {
		/* Cas d'échec littéral : « une grille terminée se rouvre terminée ». Le chemin
		   normal efface à la victoire, mais la fenêtre entre la dernière pose et
		   l'effacement existe pour de vrai (onglet fermé, plafond atteint, export
		   pris à cet instant précis). Ce qui est exigible n'est pas un mécanisme,
		   c'est le résultat : la réouverture ne présente pas une grille finie. */
		const finie = resolue();
		expect(grilleTerminee(finie)).toBe(true);
		sauverPartie(finie);
		const relue = partieEnCours();
		expect(relue === null || !grilleTerminee(relue)).toBe(true);
	});

	it('critère 38 : reste propre au profil actif', () => {
		const aine = activeProfile()?.uuid ?? '';
		sauverPartie(entamee(1));
		addProfile('Cadette');
		sauverPartie(entamee(2));
		effacerPartie();
		setActiveProfile(aine);
		expect(partieEnCours()).not.toBeNull();
	});
});

describe('#667 critère 32 — la première grille du profil, une seule fois', () => {
	it('critère 32 : un profil neuf n’est pas initié', () => {
		expect(dejaInitie()).toBe(false);
	});

	it('critère 32 : il l’est après la marque, et le reste', () => {
		marquerInitie();
		expect(dejaInitie()).toBe(true);
		marquerInitie();
		expect(dejaInitie()).toBe(true);
	});

	it('critère 32 : la marque survit à une grille sauvée puis effacée', () => {
		// Le cas-pivot est un effet d'EXEMPLE : le resservir à chaque nouvelle grille
		// le transformerait en grille offerte.
		marquerInitie();
		sauverPartie(entamee());
		effacerPartie();
		expect(dejaInitie()).toBe(true);
	});

	it('critère 32 : chaque profil a droit à sa découverte', () => {
		marquerInitie();
		const aine = activeProfile()?.uuid ?? '';
		addProfile('Cadette');
		expect(dejaInitie()).toBe(false);
		setActiveProfile(aine);
		expect(dejaInitie()).toBe(true);
	});

	it('critère 32 : rend toujours un booléen, même sur une donnée bricolée', () => {
		for (const brico of ['oui', 1, 0, {}, [], null, 'false']) {
			lsSet(CLE_CALCUDOKU_INITIE, brico);
			expect(typeof dejaInitie(), `valeur stockée ${JSON.stringify(brico)}`).toBe('boolean');
		}
	});
});

describe('#667 critère 37 — la grille retrouvée l’est SANS relance', () => {
	it('critère 37 : le module n’expose aucun compteur de grille en attente', () => {
		/* Cas d'échec littéral : « un compteur ou une pastille signale la grille en
		   attente sur l'accueil ou sur l'étagère ». Une pastille a besoin d'une
		   source : un prédicat « il y a quelque chose à finir », ou un compte. La
		   moitié VISIBLE est du ressort de la spec Playwright ; la moitié logique est
		   ici, et elle se lit sur la surface exportée — `partieEnCours()` est le SEUL
		   chemin, et il ne sert qu'à rouvrir le jeu.

		   Une fonction de plus se déclare ICI, avec sa raison. */
		expect(Object.keys(etat).sort()).toEqual(
			[
				'CLE_CALCUDOKU_INITIE',
				'CLE_CALCUDOKU_PARTIE',
				'dejaInitie',
				'effacerPartie',
				'marquerInitie',
				'partieEnCours',
				'sauverPartie',
			].sort(),
		);
	});

	it('critère 37 : sauver une grille n’écrit aucune clé de plus', () => {
		/* Un badge ou un compteur de relance aurait besoin de se SOUVENIR de quelque
		   chose : une troisième clé (« grilles commencées », « vue le »). Ce contrôle
		   n'interdit pas de compter, il interdit de se souvenir — et sans mémoire, il
		   n'y a ni pastille ni relance. */
		marquerInitie();
		sauverPartie(entamee());
		const p = partieEnCours();
		expect(p).not.toBeNull();
		effacerPartie();
		const clesDuJeu = appKeys().filter((k) => k.includes('calcudoku'));
		expect(clesDuJeu.length).toBeLessThanOrEqual(2);
	});
});

describe('#667 critères 47 et 54 — le jeu ne note rien et n’alimente rien', () => {
	it('critère 47 : aucun score n’est enregistré', () => {
		/* Tout ce qui pourrait faire office de score ici serait une mesure de vitesse
		   ou un compte de coups, tous deux écartés au critère 46. */
		marquerInitie();
		sauverPartie(entamee());
		effacerPartie();
		expect(meilleurScore('calcudoku')).toBe(0);
	});

	it('critère 54 : ni l’XP ni le niveau ne bougent', () => {
		addXP(50);
		const avant = getXP();
		marquerInitie();
		sauverPartie(entamee());
		sauverPartie(resolue());
		effacerPartie();
		expect(getXP()).toBe(avant);
	});

	it('critère 54 : la lecture seule n’écrit rien non plus', () => {
		// Un `partieEnCours` qui aurait un effet de bord (marquer « vu », dater)
		// recréerait par la bande le compteur que le critère 37 interdit.
		sauverPartie(entamee());
		const avant = JSON.stringify(lsGet(CLE_CALCUDOKU_PARTIE, null));
		partieEnCours();
		partieEnCours();
		expect(JSON.stringify(lsGet(CLE_CALCUDOKU_PARTIE, null))).toBe(avant);
	});
});
