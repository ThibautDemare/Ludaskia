/* ============================================================
   Sudoku (#666) — l'ÉTAT PERSISTÉ : dernière taille, grille en cours, initiation.

   Écrit AVANT l'implémentation, d'après les critères numérotés de l'issue #666.
   Le module testé est un squelette dont chaque fonction lève « non implémenté » :
   ces tests sont ROUGES par construction.

   Critères portés ici : 1 (le dernier choix de taille est reproposé), 6 (la toute
   première grille du profil, une seule fois et pas une par taille), 17 (une
   grille en cours PAR TAILLE, retrouvée telle quelle), 19 (terminer libère
   l'emplacement), 21 (`aidesJeuxActives`, absent = aides actives), 27 (les clés)
   et 29 (aucun score).

   Deux angles que le pattern de `jeux-etat.test.ts` impose et qu'on reprend :

   • le CLOISONNEMENT PAR PROFIL. Une grille en cours qui fuit d'un enfant à
     l'autre est un défaut invisible en développement (un seul profil) et
     immédiat à la maison.
   • la DONNÉE BRICOLÉE. Ces clés traversent l'export et l'import de sauvegarde
     du parent : une valeur absurde peut REVENIR, des mois plus tard, sur une
     version plus récente de l'appli. Le dépôt règle ce risque à la LECTURE
     (`getRevisionPlafond`, `getJeuxPlafondMinutes`, l'invariant « proposés ⊆
     attente » de #661) et non à l'écriture, et c'est ce qu'on éprouve ici. Sans
     ce bornage, une grille de longueur 3 rendue pour un 4×4 casserait le rendu à
     l'ouverture, et l'enfant n'aurait aucun moyen de s'en sortir : la donnée
     fautive serait relue à chaque tentative.

   NOTE DE MÉTHODE. Le contrat ne fixe PAS la forme sous laquelle les parties
   sont rangées (une carte par taille ? un tableau ? deux clés ?). Aucun test
   d'ici ne la suppose donc : les cas de donnée corrompue passent soit par le
   sommet de la clé (une chaîne, un nombre), soit par une PARTIE INVALIDE
   confiée à `sauverPartie`, soit par un parcours en profondeur de la valeur
   réellement écrite. Un test qui devinerait la forme serait vert ou rouge selon
   la chance, ce qui ne garderait rien.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	CLE_SUDOKU_INITIE,
	CLE_SUDOKU_PARTIES,
	CLE_SUDOKU_TAILLE,
	dejaInitie,
	effacerPartie,
	marquerInitie,
	memoriserTaille,
	partieEnCours,
	sauverPartie,
	tailleChoisie,
} from '../src/core/jeux/sudoku-etat';
import {
	TAILLES,
	grilleTerminee,
	moteurSudoku,
	poser,
	tirerGrille,
	type Partie,
	type TailleSudoku,
} from '../src/core/jeux/sudoku';
import { resoudreParDeductionElementaire, type Valeurs } from '../src/core/jeux/grille-contraintes';
import { meilleurScore } from '../src/core/jeux/etat';
import {
	activeProfile,
	addProfile,
	aidesJeuxActives,
	initProfiles,
	setActiveProfile,
	setPref,
	touchActiveProfile,
} from '../src/core/profiles';
import { PROFILES_KEY, appKeys, lsGet, lsSet, setOnDataWrite } from '../src/core/storage';
import { getXP, addXP } from '../src/core/progress';
import { tirage } from './aleatoire';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/** Une partie entamée : trois symboles posés par-dessus un énoncé RÉEL.

    L'énoncé vient de `tirerGrille` et non d'une constante écrite ici, parce que
    la géométrie du 6×6 n'est pas fixée par l'issue (régions 2×3 ou 3×2) : une
    grille 6×6 écrite à la main ne serait valide que dans une des deux
    orientations, donc invalide une fois sur deux. */
function entamee(taille: TailleSudoku, graine = 5): Partie {
	let p = tirerGrille(taille, tirage(graine));
	let poses = 0;
	for (let i = 0; i < taille * taille && poses < 3; i++) {
		if (p.valeurs[i] === 0) {
			p = poser(p, i, 1 + (poses % taille));
			poses++;
		}
	}
	return p;
}

describe('#666 critère 27 — les clés de stockage', () => {
	it('commencent toutes par `ludaskia_`', () => {
		for (const cle of [CLE_SUDOKU_PARTIES, CLE_SUDOKU_TAILLE, CLE_SUDOKU_INITIE]) {
			expect(cle.startsWith('ludaskia_'), cle).toBe(true);
		}
	});

	it('sont distinctes les unes des autres', () => {
		const cles = [CLE_SUDOKU_PARTIES, CLE_SUDOKU_TAILLE, CLE_SUDOKU_INITIE];
		expect(new Set(cles).size).toBe(cles.length);
	});

	it('entrent dans le périmètre de l’export et de la suppression de profil', () => {
		/* `appKeys()` filtre sur `ludaskia_`, et c'est ce filtre qui alimente l'export
		   du parent ET la suppression d'un profil. Le préfixe est déjà tenu
		   statiquement par `cles-stockage-gate.test.ts` ; ce qu'on éprouve ici, c'est
		   la conséquence observable : la donnée est rangée sous le profil actif et le
		   suit. */
		memoriserTaille(6);
		marquerInitie();
		sauverPartie(entamee(4));
		const cles = appKeys();
		for (const cle of [CLE_SUDOKU_TAILLE, CLE_SUDOKU_INITIE, CLE_SUDOKU_PARTIES]) {
			expect(
				cles.some((k) => k.includes(cle)),
				cle,
			).toBe(true);
		}
	});
});

describe('#666 critère 1 — la dernière taille jouée est reproposée', () => {
	it('propose une taille jouable sur un profil neuf', () => {
		// L'issue ne dit pas LAQUELLE des deux sort en premier ; ce qui est exigible,
		// c'est qu'aucune partie ne s'ouvre sur une taille inconnue.
		expect([...TAILLES]).toContain(tailleChoisie());
	});

	it('retient le 6×6 après qu’on l’a joué', () => {
		memoriserTaille(6);
		expect(tailleChoisie()).toBe(6);
	});

	it('retient le 4×4 après qu’on est revenu dessus', () => {
		// Le cas d'échec : « l'enfant doit rechoisir alors qu'il vient d'en jouer une ».
		memoriserTaille(6);
		memoriserTaille(4);
		expect(tailleChoisie()).toBe(4);
	});

	it('reste propre au profil actif', () => {
		memoriserTaille(6);
		const aine = activeProfile()?.uuid ?? '';
		addProfile('Cadette');
		memoriserTaille(4);
		expect(tailleChoisie()).toBe(4);
		setActiveProfile(aine);
		expect(tailleChoisie()).toBe(6);
	});

	it('ignore une taille impossible revenue d’une sauvegarde', () => {
		/* Ces valeurs ne viennent pas du jeu : elles viennent d'un import, d'une
		   version future, ou d'une main curieuse dans la console. Une taille 9
		   acceptée telle quelle demanderait une géométrie qui n'existe pas, et le
		   jeu ne s'ouvrirait plus du tout. */
		for (const brico of [9, 0, -4, 4.5, '4', 'quatre', null, true, [], { taille: 4 }]) {
			lsSet(CLE_SUDOKU_TAILLE, brico);
			expect([...TAILLES], `valeur stockée ${JSON.stringify(brico)}`).toContain(tailleChoisie());
		}
	});
});

describe('#666 critère 17 — une grille en cours par taille, retrouvée telle quelle', () => {
	it('n’a rien en cours sur un profil neuf', () => {
		for (const t of TAILLES) expect(partieEnCours(t)).toBeNull();
	});

	it('rend la grille exactement telle qu’on l’a laissée', () => {
		/* Le cas d'échec : « quitter le jeu, recharger la page […] fait perdre les
		   symboles déjà posés ». Avec un plafond par défaut de 10 minutes, une 6×6 ne
		   se termine pas en une session : repartir de zéro serait le cas NORMAL. */
		for (const t of TAILLES) {
			const p = entamee(t);
			sauverPartie(p);
			expect(partieEnCours(t), `taille ${t}`).toEqual(p);
		}
	});

	it('garde un emplacement séparé par taille', () => {
		const p4 = entamee(4);
		const p6 = entamee(6);
		sauverPartie(p4);
		sauverPartie(p6);
		expect(partieEnCours(4)).toEqual(p4);
		expect(partieEnCours(6)).toEqual(p6);
	});

	it('ne rend pas la grille d’une autre taille', () => {
		sauverPartie(entamee(6));
		expect(partieEnCours(4)).toBeNull();
	});

	it('remplace la grille de la même taille au lieu d’en empiler deux', () => {
		const premiere = entamee(4, 1);
		const seconde = entamee(4, 2);
		sauverPartie(premiere);
		sauverPartie(seconde);
		expect(partieEnCours(4)).toEqual(seconde);
	});

	it('survit à un enregistrement coup par coup', () => {
		// C'est le régime réel : on sauve à chaque pose. Ce qui doit rester vrai,
		// c'est que l'énoncé ne dérive pas au fil des écritures.
		let p = entamee(4);
		for (let n = 0; n < 3; n++) {
			const libre = p.valeurs.findIndex((x) => x === 0);
			if (libre < 0) break;
			p = poser(p, libre, 1);
			sauverPartie(p);
		}
		const relue = partieEnCours(4);
		expect(relue).not.toBeNull();
		if (!relue) return;
		expect(relue.enonce).toEqual(p.enonce);
		expect(relue.valeurs).toEqual(p.valeurs);
	});

	it('reste propre au profil actif', () => {
		sauverPartie(entamee(4));
		addProfile('Cadette');
		expect(partieEnCours(4)).toBeNull();
	});

	it('rend un état INDÉPENDANT à chaque relecture', () => {
		// Deux relectures qui partageraient leurs tableaux laisseraient une pose
		// faite dans un écran modifier l'état d'un autre, sans passer par `poser`.
		const p = entamee(4);
		sauverPartie(p);
		const a = partieEnCours(4);
		const b = partieEnCours(4);
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		if (!a || !b) return;
		expect(a.valeurs).not.toBe(b.valeurs);
		expect(a.enonce).not.toBe(b.enonce);
	});
});

/** Parcourt la valeur RÉELLEMENT écrite sous la clé des parties et remplace tout
    tableau de `n` nombres par `remplacement`. Ne suppose rien de la forme
    choisie pour ranger les parties — et vérifie qu'il a bien trouvé quelque
    chose, sans quoi le test qui l'appelle ne prouverait rien. */
function corrompreGrilles(n: number, remplacement: unknown[]): number {
	let touches = 0;
	const muter = (x: unknown): unknown => {
		if (Array.isArray(x)) {
			if (x.length === n && x.every((y) => typeof y === 'number')) {
				touches++;
				return remplacement;
			}
			return x.map(muter);
		}
		if (x !== null && typeof x === 'object') {
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(x)) out[k] = muter(v);
			return out;
		}
		return x;
	};
	const mute = muter(lsGet(CLE_SUDOKU_PARTIES, null));
	lsSet(CLE_SUDOKU_PARTIES, mute);
	expect(touches, 'aucune grille trouvée dans la valeur stockée : test à vide').toBeGreaterThan(0);
	return touches;
}

describe('#666 critère 17 — une grille bricolée ne revient pas telle quelle', () => {
	/* Le stockage n'est pas un canal de confiance : il traverse l'export/import de
	   sauvegarde du parent. Une grille dont la forme est IMPOSSIBLE ne peut pas
	   être rendue « telle quelle » — elle n'est aucune grille. La convention du
	   dépôt étant le bornage à la LECTURE, `partieEnCours` doit rendre `null`
	   plutôt qu'une partie que le rendu ne saura pas dessiner. */
	it('refuse une valeur qui n’est pas du tout un état de jeu', () => {
		for (const brico of ['bonjour', 42, true, [1, 2, 3]]) {
			lsSet(CLE_SUDOKU_PARTIES, brico);
			for (const t of TAILLES) {
				expect(partieEnCours(t), `valeur stockée ${JSON.stringify(brico)}`).toBeNull();
			}
		}
	});

	it('refuse une grille de la mauvaise longueur', () => {
		sauverPartie(entamee(4));
		corrompreGrilles(16, [1, 2, 3]);
		expect(partieEnCours(4)).toBeNull();
	});

	it('refuse une grille dont une case n’est pas un entier de 0 à la taille', () => {
		/* 7 dans un 4×4 est inaffichable — il n'y a que quatre silhouettes — donc la
		   case paraîtrait vide tout en bloquant la grille : l'enfant verrait un trou
		   qu'aucun symbole ne remplit. */
		for (const mauvaise of [7, -1, 1.5, 'x', null]) {
			localStorage.clear();
			initProfiles();
			sauverPartie(entamee(4));
			const grille: unknown[] = new Array(16).fill(0);
			grille[5] = mauvaise;
			corrompreGrilles(16, grille);
			expect(partieEnCours(4), `case = ${String(mauvaise)}`).toBeNull();
		}
	});

	it('refuse une partie dont l’état courant contredit son énoncé', () => {
		// L'énoncé « ne change jamais » : une case donnée qui porte autre chose dans
		// l'état courant n'est plus une grille, c'est deux grilles mélangées — et
		// `estFixe` mentirait ensuite à l'enfant sur ce qu'il peut toucher.
		const p = entamee(4);
		const i = p.enonce.findIndex((x) => x !== 0);
		const valeurs: Valeurs = [...p.valeurs];
		valeurs[i] = (p.enonce[i] % 4) + 1;
		sauverPartie({ taille: 4, enonce: p.enonce, valeurs });
		expect(partieEnCours(4)).toBeNull();
	});

	it('refuse une partie dont la taille ne correspond pas à la grille', () => {
		const p6 = entamee(6);
		sauverPartie({ taille: 4, enonce: p6.enonce, valeurs: p6.valeurs });
		for (const t of TAILLES) expect(partieEnCours(t), `taille ${t}`).toBeNull();
	});

	it('refuse un énoncé sans solution', () => {
		/* Une grille importée peut avoir été fabriquée à la main. Servir un énoncé
		   insoluble condamne l'enfant à ne jamais finir sans que rien ne le lui dise,
		   c'est-à-dire exactement le défaut que les critères 3 et 4 interdisent à la
		   génération. Une grille restaurée est une grille SERVIE : elle n'a pas à
		   rentrer par la porte du stockage. */
		const enonce: Valeurs = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		sauverPartie({ taille: 4, enonce, valeurs: [...enonce] });
		expect(partieEnCours(4)).toBeNull();
	});

	it('ne fait pas taire la grille de l’autre taille', () => {
		// Le bornage borne le bruit, il ne doit pas manger le signal : perdre la 6×6
		// à cause d'une 4×4 corrompue serait la perte que le critère 17 refuse.
		const p6 = entamee(6);
		sauverPartie(p6);
		sauverPartie({ taille: 4, enonce: [1], valeurs: [1] });
		expect(partieEnCours(4)).toBeNull();
		expect(partieEnCours(6)).toEqual(p6);
	});
});

describe('#666 critère 19 — terminer libère l’emplacement', () => {
	it('efface la grille de la taille demandée', () => {
		sauverPartie(entamee(4));
		effacerPartie(4);
		expect(partieEnCours(4)).toBeNull();
	});

	it('ne touche pas à l’autre taille', () => {
		// Cas d'échec discret : finir sa 4×4 ne doit pas jeter la 6×6 en cours, qui
		// est justement celle qui demande plusieurs sessions.
		const p6 = entamee(6);
		sauverPartie(entamee(4));
		sauverPartie(p6);
		effacerPartie(4);
		expect(partieEnCours(6)).toEqual(p6);
	});

	it('ne se plaint pas quand il n’y a rien à effacer', () => {
		effacerPartie(4);
		effacerPartie(4);
		expect(partieEnCours(4)).toBeNull();
	});

	it('ne rouvre JAMAIS une grille déjà terminée', () => {
		/* Cas d'échec littéral : « une grille terminée se rouvre terminée ». Le
		   chemin normal efface à la victoire, mais la fenêtre entre la dernière pose
		   et l'effacement existe pour de vrai (onglet fermé, plafond atteint, export
		   pris à cet instant précis). Ce qui est exigible n'est pas un mécanisme,
		   c'est le résultat : la réouverture ne présente pas une grille finie. */
		for (const t of TAILLES) {
			const p = tirerGrille(t, tirage(9));
			const solution = resoudreParDeductionElementaire(moteurSudoku(t), p.enonce);
			expect(solution, `taille ${t}`).not.toBeNull();
			if (!solution) continue;
			const finie: Partie = { ...p, valeurs: solution };
			expect(grilleTerminee(finie), `taille ${t}`).toBe(true);
			sauverPartie(finie);
			const relue = partieEnCours(t);
			expect(relue === null || !grilleTerminee(relue), `taille ${t}`).toBe(true);
		}
	});

	it('reste propre au profil actif', () => {
		const aine = activeProfile()?.uuid ?? '';
		sauverPartie(entamee(4));
		addProfile('Cadette');
		sauverPartie(entamee(4, 2));
		effacerPartie(4);
		setActiveProfile(aine);
		expect(partieEnCours(4)).not.toBeNull();
	});
});

describe('#666 critère 6 — la première grille du profil, une seule fois', () => {
	it('n’est pas initié sur un profil neuf', () => {
		expect(dejaInitie()).toBe(false);
	});

	it('l’est après la marque', () => {
		marquerInitie();
		expect(dejaInitie()).toBe(true);
	});

	it('le reste si on remarque', () => {
		marquerInitie();
		marquerInitie();
		expect(dejaInitie()).toBe(true);
	});

	it('vaut pour le profil ENTIER, pas par taille', () => {
		/* La grille presque complète est un effet d'exemple : elle apprend la règle
		   en une pose. La resservir à chaque changement de taille la transformerait
		   en grille offerte, et l'enfant apprendrait surtout qu'il existe des grilles
		   gratuites. Le contrat n'a pas de paramètre de taille ; ce test vérifie que
		   rien ne le contourne par le stockage. */
		marquerInitie();
		memoriserTaille(6);
		expect(dejaInitie()).toBe(true);
	});

	it('reste propre au profil actif', () => {
		marquerInitie();
		const aine = activeProfile()?.uuid ?? '';
		addProfile('Cadette');
		expect(dejaInitie()).toBe(false); // la cadette a droit à sa découverte
		setActiveProfile(aine);
		expect(dejaInitie()).toBe(true);
	});

	it('rend toujours un booléen, même sur une donnée bricolée', () => {
		for (const brico of ['oui', 1, 0, {}, [], null]) {
			lsSet(CLE_SUDOKU_INITIE, brico);
			expect(typeof dejaInitie(), `valeur stockée ${JSON.stringify(brico)}`).toBe('boolean');
		}
	});
});

/** Écrit une préférence de forme aberrante DIRECTEMENT dans la méta des profils :
    c'est par là qu'un import de sauvegarde arrive, et le type de `setPref`
    interdit — heureusement — de simuler ce cas par l'API. */
function prefBricolee(valeur: unknown): void {
	const meta: { active?: string; list?: { uuid: string; prefs?: Record<string, unknown> }[] } =
		lsGet(PROFILES_KEY, null);
	const cible = meta.list?.find((p) => p.uuid === meta.active) ?? meta.list?.[0];
	expect(cible, 'aucun profil actif : test à vide').toBeDefined();
	if (!cible) return;
	cible.prefs = { ...cible.prefs, sansAidesJeux: valeur };
	lsSet(PROFILES_KEY, meta);
}

describe('#666 critère 21 — les aides visuelles sont actives par défaut', () => {
	it('le sont sur un profil neuf, sans préférence enregistrée', () => {
		// Cas d'échec littéral : « un profil sans préférence enregistrée se retrouve
		// sans aides ». Le réglage ne fait que RETIRER une aide, jamais l'imposer.
		expect(aidesJeuxActives()).toBe(true);
	});

	it('se coupent quand l’adulte le demande', () => {
		setPref('sansAidesJeux', true);
		expect(aidesJeuxActives()).toBe(false);
	});

	it('se rallument quand il décoche', () => {
		setPref('sansAidesJeux', true);
		setPref('sansAidesJeux', false);
		expect(aidesJeuxActives()).toBe(true);
	});

	it('restent actives sur une préférence de forme aberrante', () => {
		// Une valeur importée qui n'est pas exactement `true` ne doit pas retirer une
		// aide : le doute profite à l'enfant, comme pour `sansMotsDifficiles`.
		for (const brico of ['oui', 1, {}, null, 'false']) {
			prefBricolee(brico);
			expect(aidesJeuxActives(), `valeur ${JSON.stringify(brico)}`).toBe(true);
		}
	});

	it('restent propres au profil actif', () => {
		setPref('sansAidesJeux', true);
		addProfile('Cadette');
		expect(aidesJeuxActives()).toBe(true);
	});
});

describe('#666 critères 29 et 34 — le jeu ne note rien et n’alimente rien', () => {
	it('n’enregistre aucun score', () => {
		/* Tout ce qui pourrait faire office de score ici est soit une mesure de
		   vitesse, soit un compte de coups, tous deux écartés au critère 28. Le
		   dernier format joué est une PRÉFÉRENCE, pas un record. */
		memoriserTaille(6);
		sauverPartie(entamee(4));
		effacerPartie(4);
		marquerInitie();
		expect(meilleurScore('sudoku')).toBe(0);
	});

	it('ne touche ni l’XP ni le niveau', () => {
		addXP(50);
		const avant = getXP();
		memoriserTaille(4);
		marquerInitie();
		sauverPartie(entamee(6));
		effacerPartie(6);
		expect(getXP()).toBe(avant);
	});
});
