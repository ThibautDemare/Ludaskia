/* ============================================================
   Mots casés (#664) — L'ÉTAT PERSISTÉ : taille choisie, grille en cours.

   Écrit AVANT l'implémentation. `src/core/jeux/mots-cases-etat.ts` n'existe pas
   encore : ce fichier est ROUGE À L'IMPORT, et c'est le résultat attendu.

   ── LE CONTRAT QUE CES TESTS FIGENT ─────────────────────────────────────────

     export const CLE_MOTS_CASES_PARTIE = 'ludaskia_jeux_mots-cases_partie';
     export const CLE_MOTS_CASES_TAILLE = 'ludaskia_jeux_mots-cases_taille';

     export function tailleChoisie(): TailleMotsCases;
     export function memoriserTaille(taille: TailleMotsCases): void;
     // La grille laissée en cours, ou `null`. Validée à la LECTURE.
     export function partieEnCours(): PartieMotsCases | null;
     export function sauverPartie(p: PartieMotsCases): void;
     export function effacerPartie(): void;

   **UNE seule grille en cours, pas une par taille.** Le sudoku (#666) en garde
   une par taille ; ici les critères n'en demandent qu'une (« la grille en
   cours », au singulier), et la partie sauvée porte déjà sa taille dans
   `motif.taille`. Conséquence assumée, à connaître avant d'implémenter : changer
   de taille pendant une partie ABANDONNE la grille en cours, et repasse donc par
   `avantNouvellePartie` (critère 3) — ce qui interdit au passage de contourner le
   plafond quotidien en faisant l'aller-retour entre les deux tailles.

   Critères portés : 13 (le choix de taille persiste), 33 (la grille survit),
   35 (l'état restauré est validé à la lecture), 36 (les clés), et la moitié
   observable du 38 (aucun score, aucune XP écrite en jouant).

   Ce que ce fichier NE couvre pas : le critère 34 (« la sauvegarde a lieu à
   chaque pose ET à chaque retrait, pas à la sortie »). Qui appelle `sauverPartie`
   et quand, c'est le runner : la moitié négative est tenue statiquement par
   `mots-cases-gate.test.ts`, la moitié positive se voit en rechargeant la page,
   donc en Playwright.

   ── NOTE DE MÉTHODE, reprise de `sudoku-etat.test.ts` ───────────────────────

   Le contrat ne fixe PAS la FORME sous laquelle la partie est rangée (objet à
   plat ? id de motif + tableau de poses ? liste de mots ?). Aucun test d'ici ne
   la suppose : les cas de donnée bricolée passent soit par le sommet de la clé
   (une chaîne, un nombre), soit par un PARCOURS EN PROFONDEUR de la valeur
   réellement écrite, où l'on remplace une chaîne connue par une autre. Un test
   qui devinerait la forme serait vert ou rouge selon la chance.

   Et chaque parcours vérifie qu'il a bien MODIFIÉ quelque chose : sans ça, un
   stockage qui n'écrirait pas les mots rendrait ces tests verts sans rien tenir.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	CLE_MOTS_CASES_PARTIE,
	CLE_MOTS_CASES_TAILLE,
	effacerPartie,
	memoriserTaille,
	partieEnCours,
	sauverPartie,
	tailleChoisie,
} from '../src/core/jeux/mots-cases-etat';
import {
	remplir,
	tirerGrille,
	vivierMotsCases,
	type PartieMotsCases,
} from '../src/core/jeux/mots-cases';
import { TAILLES_MOTS_CASES } from '../src/data/jeux/motifs-mots-cases';
import { conflits, grilleNeuve, poser, terminee } from '../src/core/jeux/grille-mots';
import { meilleurScore } from '../src/core/jeux/etat';
import {
	activeProfile,
	addProfile,
	initProfiles,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { appKeys, lsGet, lsSet, setOnDataWrite } from '../src/core/storage';
import { getXP } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

function tirage(graine: number): () => number {
	let s = graine >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

const lettres = (mot: string): string[] => [...mot.normalize('NFC')];

/** Une partie entamée : deux mots posés dans des emplacements de leur longueur. */
function entamee(graine = 4): PartieMotsCases {
	const p = tirerGrille('petite', tirage(graine));
	let grille = p.grille;
	let poses = 0;
	for (const mot of p.mots) {
		if (poses >= 2) break;
		const cible = p.motif.emplacements.findIndex(
			(e, i) => grille.poses[i] === null && e.longueur === lettres(mot).length,
		);
		if (cible < 0) continue;
		grille = poser(grille, cible, mot);
		poses++;
	}
	return { ...p, grille };
}

/** Une partie GAGNÉE : la solution du remplissage, posée en entier. */
function gagnee(graine = 4): PartieMotsCases {
	const p = tirerGrille('petite', tirage(graine));
	const solution = remplir(p.motif, tirage(graine + 1000));
	if (!solution) throw new Error('le motif ne se remplit pas : cas de test impossible à monter');
	let grille = grilleNeuve(p.motif);
	solution.forEach((mot, i) => {
		grille = poser(grille, i, mot);
	});
	return { motif: p.motif, mots: [...solution], grille };
}

/** Remplace récursivement une chaîne par une autre dans la valeur stockée. */
function remplacerPartout(valeur: unknown, avant: string, apres: string): unknown {
	if (typeof valeur === 'string') return valeur === avant ? apres : valeur;
	if (Array.isArray(valeur)) return valeur.map((v) => remplacerPartout(v, avant, apres));
	if (valeur && typeof valeur === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(valeur)) out[k] = remplacerPartout(v, avant, apres);
		return out;
	}
	return valeur;
}

/** Bricole la partie stockée et rend `true` si la valeur a bien changé. */
function bricoler(avant: string, apres: string): boolean {
	const brut = lsGet(CLE_MOTS_CASES_PARTIE, null) as unknown;
	const modifie = remplacerPartout(brut, avant, apres);
	const change = JSON.stringify(modifie) !== JSON.stringify(brut);
	lsSet(CLE_MOTS_CASES_PARTIE, modifie);
	return change;
}

describe('#664 critère 36 — les clés de stockage', () => {
	it('commencent toutes par « ludaskia_jeux_mots-cases_ »', () => {
		for (const cle of [CLE_MOTS_CASES_PARTIE, CLE_MOTS_CASES_TAILLE]) {
			expect(cle.startsWith('ludaskia_jeux_mots-cases_'), cle).toBe(true);
		}
	});

	it('sont distinctes l’une de l’autre', () => {
		expect(CLE_MOTS_CASES_PARTIE).not.toBe(CLE_MOTS_CASES_TAILLE);
	});

	it('entrent dans l’export de sauvegarde et disparaissent avec le profil', () => {
		/* `appKeys()` filtre sur `ludaskia_`, et c'est ce filtre qui alimente l'export
		   du parent ET la suppression d'un profil. Le préfixe seul est déjà tenu
		   statiquement par `cles-stockage-gate.test.ts` ; ce qu'on éprouve ici, c'est
		   la conséquence observable — la donnée est bien rangée sous le profil actif. */
		memoriserTaille('grande');
		sauverPartie(entamee());
		const cles = appKeys();
		for (const cle of [CLE_MOTS_CASES_TAILLE, CLE_MOTS_CASES_PARTIE]) {
			expect(
				cles.some((k) => k.includes(cle)),
				cle,
			).toBe(true);
		}
	});
});

describe('#664 critère 13 — le choix de taille persiste d’une partie à l’autre', () => {
	it('propose une taille jouable sur un profil neuf', () => {
		// L'issue ne dit pas LAQUELLE des deux sort en premier ; ce qui est exigible,
		// c'est qu'aucune partie ne s'ouvre sur une taille inconnue.
		expect([...TAILLES_MOTS_CASES]).toContain(tailleChoisie());
	});

	it('retient la dernière taille jouée', () => {
		// Cas d'échec littéral : « rouvrir le jeu repart sur l'autre taille ».
		for (const taille of TAILLES_MOTS_CASES) {
			memoriserTaille(taille);
			expect(tailleChoisie(), taille).toBe(taille);
		}
	});

	it('reste propre au profil actif', () => {
		memoriserTaille('grande');
		const aine = activeProfile()?.uuid ?? '';
		addProfile('Cadette');
		memoriserTaille('petite');
		expect(tailleChoisie()).toBe('petite');
		setActiveProfile(aine);
		expect(tailleChoisie()).toBe('grande');
	});

	it('ignore une taille impossible revenue d’une sauvegarde', () => {
		/* Ces valeurs ne viennent pas du jeu : elles viennent d'un import, d'une
		   version future, ou d'une main curieuse dans la console. Une taille inconnue
		   acceptée telle quelle demanderait des motifs qui n'existent pas, et le jeu
		   ne s'ouvrirait plus du tout. */
		for (const brico of ['moyenne', '', 0, 3, null, true, [], { taille: 'petite' }, 'PETITE']) {
			lsSet(CLE_MOTS_CASES_TAILLE, brico);
			expect([...TAILLES_MOTS_CASES], `valeur stockée ${JSON.stringify(brico)}`).toContain(
				tailleChoisie(),
			);
		}
	});
});

describe('#664 critère 33 — la grille en cours survit', () => {
	it('n’a rien en cours sur un profil neuf', () => {
		expect(partieEnCours()).toBeNull();
	});

	it('rend la grille exactement telle qu’on l’a laissée', () => {
		/* Cas d'échec littéral : « revenir après le plafond sert une grille vide ».
		   Avec un plafond quotidien de quelques minutes, une grande grille ne se
		   termine pas en une session : repartir de zéro serait le cas NORMAL, et une
		   perte non consentie dans une application dont rien d'autre ne régresse. */
		const p = entamee();
		sauverPartie(p);
		expect(partieEnCours()).toEqual(p);
	});

	it('la rend encore à la relecture suivante (rien ne se consomme)', () => {
		sauverPartie(entamee());
		expect(partieEnCours()).not.toBeNull();
		expect(partieEnCours()).not.toBeNull();
	});

	it('remplace la précédente au lieu d’empiler', () => {
		sauverPartie(entamee(4));
		const suivante = entamee(9);
		sauverPartie(suivante);
		expect(partieEnCours()).toEqual(suivante);
	});

	it('rend un état INDÉPENDANT à chaque lecture', () => {
		// Le runner mute son état de jeu ; deux lectures qui partageraient leurs
		// tableaux se contamineraient l'une l'autre, et le bug ne se verrait qu'au
		// deuxième mot posé.
		sauverPartie(entamee());
		const a = partieEnCours();
		const b = partieEnCours();
		expect(a).toEqual(b);
		expect(a?.mots).not.toBe(b?.mots);
		expect(a?.grille.poses).not.toBe(b?.grille.poses);
	});

	it('libère la place quand on l’efface', () => {
		sauverPartie(entamee());
		effacerPartie();
		expect(partieEnCours()).toBeNull();
	});

	it('garde une grille PLEINE MAIS FAUSSE : c’est un état de jeu, pas une corruption', () => {
		/* L'arbitrage 3 du cadrage rend cet état atteignable (« il faut donc gérer
		   l'état grille pleine mais fausse »). Le jeter à la lecture ferait perdre à
		   l'enfant, en quittant, exactement le moment où il a le plus besoin de
		   revenir : la grille finie qui coince quelque part. */
		const p = gagnee();
		// Le couple doit être de MÊME LONGUEUR : échanger deux mots de longueurs
		// différentes ne fabriquerait pas une grille fautive, il ferait refuser les
		// deux poses (critère 16), donc une grille incomplète — pas le cas visé.
		let couple: [number, number] | null = null;
		const emps = p.motif.emplacements;
		for (let i = 0; i < emps.length && !couple; i++) {
			for (let j = i + 1; j < emps.length && !couple; j++) {
				if (emps[i].longueur === emps[j].longueur) couple = [i, j];
			}
		}
		expect(couple, 'critère 8 : ce motif n’a aucun couple de même longueur').not.toBeNull();
		if (!couple) return;
		const [x, y] = couple;
		const poses = [...p.grille.poses];
		[poses[x], poses[y]] = [poses[y], poses[x]];
		let fautive = grilleNeuve(p.motif);
		poses.forEach((mot, i) => {
			if (mot) fautive = poser(fautive, i, mot);
		});
		// Le montage n'a de sens que si l'échange casse VRAIMENT un croisement ;
		// sinon ce test ne prouve rien (et le critère 10 est en cause, pas celui-ci).
		expect(conflits(fautive).length, 'l’échange n’a créé aucun conflit').toBeGreaterThan(0);
		const cassee: PartieMotsCases = { ...p, grille: fautive };
		sauverPartie(cassee);
		expect(partieEnCours()).toEqual(cassee);
	});
});

describe('#664 critère 35 — l’état restauré est validé à la LECTURE', () => {
	it('refuse une partie déjà terminée', () => {
		/* Le chemin normal efface à la victoire, mais la fenêtre existe : onglet
		   fermé au moment du dernier mot, plafond atteint, export pris à cet
		   instant. Rouvrir une grille finie ne laisserait rien à faire à l'enfant,
		   sans lui dire pourquoi. */
		const p = gagnee();
		expect(terminee(p.grille), 'le montage doit bien être une partie gagnée').toBe(true);
		sauverPartie(p);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse un motif inconnu', () => {
		const p = entamee();
		sauverPartie(p);
		expect(
			bricoler(p.motif.id, 'motif-qui-n-existe-pas'),
			'le motif n’est pas dans la valeur stockée',
		).toBe(true);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse un mot hors vivier', () => {
		// Un mot inventé ne peut pas venir du jeu : il vient d'un import bricolé. Le
		// laisser passer afficherait à l'enfant, en toutes lettres, un mot faux.
		const p = entamee();
		sauverPartie(p);
		const mot = p.mots[0];
		expect(
			bricoler(mot, 'z'.repeat(lettres(mot).length)),
			'le mot n’est pas dans la valeur stockée',
		).toBe(true);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse une longueur incohérente', () => {
		const p = entamee();
		sauverPartie(p);
		const mot = p.mots[0];
		const autre = vivierMotsCases().find((m) => lettres(m).length !== lettres(mot).length);
		expect(autre, 'le vivier n’a qu’une seule longueur ?').toBeDefined();
		expect(bricoler(mot, autre ?? ''), 'le mot n’est pas dans la valeur stockée').toBe(true);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse n’importe quoi au sommet de la clé', () => {
		for (const brico of ['', 'partie', 42, true, [], [1, 2, 3], { rien: 'du tout' }]) {
			lsSet(CLE_MOTS_CASES_PARTIE, brico);
			expect(partieEnCours(), `valeur stockée ${JSON.stringify(brico)}`).toBeNull();
		}
	});

	it('refuse une partie incohérente qu’on lui demanderait de sauver', () => {
		/* Le bornage est à la LECTURE (convention du dépôt), donc `sauverPartie` a le
		   droit d'écrire ce qu'on lui donne — mais la relecture, elle, doit tenir. Une
		   grille dont le nombre de mots ne colle pas au motif ne se rouvre pas. */
		const p = entamee();
		sauverPartie({ ...p, mots: p.mots.slice(1) });
		expect(partieEnCours()).toBeNull();
		sauverPartie({ ...p, mots: [...p.mots, p.mots[0]] });
		expect(partieEnCours()).toBeNull();
	});

	it('refuse un mot posé qui ne figure pas dans la liste', () => {
		// Sinon la liste et la grille racontent deux parties différentes, et le
		// compteur « X mots sur Y » du critère 32 devient faux sans prévenir.
		const p = entamee();
		const dejaPose = [...p.grille.poses].find((m): m is string => m !== null);
		expect(dejaPose, 'le montage doit avoir au moins un mot posé').toBeDefined();
		sauverPartie({ ...p, mots: p.mots.filter((m) => m !== dejaPose) });
		expect(partieEnCours()).toBeNull();
	});

	it('refuse un doublon dans la liste des mots (critère 11)', () => {
		/* Une grille restaurée est une grille SERVIE : les critères qui interdisent
		   à la génération de produire un doublon n'ont pas à rentrer par la porte du
		   stockage. */
		const p = entamee();
		const double = [...p.mots];
		double[1] = double[0];
		sauverPartie({ ...p, mots: double });
		expect(partieEnCours()).toBeNull();
	});

	it('ne borne QUE le bruit : une partie saine survit à tous ces refus', () => {
		// Le garde-fou du garde-fou. Une validation trop zélée qui rejetterait tout
		// rendrait les huit tests ci-dessus verts sans rien garder.
		lsSet(CLE_MOTS_CASES_PARTIE, 'nawak');
		expect(partieEnCours()).toBeNull();
		const p = entamee();
		sauverPartie(p);
		expect(partieEnCours()).toEqual(p);
	});
});

describe('#664 critère 38 — jouer ne fait bouger aucun compteur', () => {
	it('n’enregistre ni score ni XP en sauvant, en relisant ou en gagnant', () => {
		/* « Boucler une grille entière fait bouger un compteur de l'accueil » est le
		   cas d'échec. Ici on prend la moitié observable : l'état du jeu ne touche ni
		   l'XP ni la table des scores. L'autre moitié — le runner n'importe même pas
		   ces modules — est tenue statiquement par le gate. */
		const xpAvant = getXP();
		memoriserTaille('grande');
		sauverPartie(entamee());
		partieEnCours();
		sauverPartie(gagnee());
		partieEnCours();
		effacerPartie();
		expect(getXP()).toBe(xpAvant);
		expect(meilleurScore('mots-cases')).toBe(0);
	});

	it('n’écrit rien en dehors de ses deux clés', () => {
		/* Un compteur de parties, une série de grilles enchaînées (critère 39) ou un
		   record auraient besoin d'une TROISIÈME clé. Ce contrôle n'interdit pas de
		   compter, il interdit de se souvenir — et sans mémoire, il n'y a ni palier
		   ni record. */
		const avant = new Set(appKeys());
		memoriserTaille('petite');
		sauverPartie(entamee());
		partieEnCours();
		const nouvelles = appKeys().filter((k) => !avant.has(k));
		for (const k of nouvelles) {
			expect(
				k.includes(CLE_MOTS_CASES_PARTIE) || k.includes(CLE_MOTS_CASES_TAILLE),
				`clé inattendue écrite en jouant : ${k}`,
			).toBe(true);
		}
	});
});
