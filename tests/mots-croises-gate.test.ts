/* ============================================================
   Mots croisés (#665) — GATE STATIQUE des critères négatifs et du câblage.

   Écrit AVANT l'implémentation. Il est donc ROUGE, et il faut savoir POURQUOI :
   ce n'est pas parce que les interdits sont enfreints, c'est parce que les
   fichiers attendus n'existent pas encore.

   C'est une précaution délibérée, et c'est le cœur de ce fichier. Un test qui
   affirme l'ABSENCE d'un appel dans un fichier ABSENT est vert quoi qu'il
   arrive : il ne garde rien, il décore. Chaque interdit ci-dessous est donc
   précédé d'une exigence POSITIVE — le fichier existe, il s'enregistre, il passe
   par le moteur, il passe par `lsGet`/`lsSet`. Une fois le lot livré, tout doit
   être vert ; à ce moment-là seulement, les interdits gardent quelque chose.

   Critères portés : 14 (les motifs sont des données PROPRES À CE JEU), 38
   (moitié négative : la sauvegarde n'est pas accrochée à la sortie de page),
   41 (aucun `capterErreur`), 42 (rien de l'économie), 43 (aucune mémoire de
   série), plus le câblage promis par #664 — le moteur de grille de mots sert ce
   second client SANS CHANGER.

   Ce qu'il ne prouve pas : que la sauvegarde ait VRAIMENT lieu à chaque lettre
   (critère 38, moitié positive) — ça se voit en rechargeant la page, donc en
   Playwright. Le rattachement du runner à une spec est déjà exigé par
   `couverture-e2e-gate.test.ts` : inutile de le redire ici.

   Lu comme du TEXTE (pas de DOM, quelques millisecondes), au motif de
   `mots-cases-gate.test.ts` : les assertions portent sur des BOOLÉENS et pas sur
   le contenu du fichier, pour qu'un échec dise la règle enfreinte au lieu de
   recracher mille lignes.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const MOTEUR = 'src/core/jeux/grille-mots.ts';
const BANQUE = 'src/data/francais/definitions.ts';
const MOTIFS = 'src/data/jeux/motifs-mots-croises.ts';
const JEU = 'src/core/jeux/mots-croises.ts';
const ETAT = 'src/core/jeux/mots-croises-etat.ts';
const RUNNER = 'src/ui/jeu-mots-croises.ts';
const FEUILLE = 'src/styles/jeu-mots-croises.scss';

const lire = (chemin: string): string | null =>
	existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;

const existe = (chemin: string): void => {
	expect({ fichier: chemin, existe: lire(chemin) !== null }).toEqual({
		fichier: chemin,
		existe: true,
	});
};

/** Retire les commentaires avant de chercher. Sans cela, un en-tête qui
    DOCUMENTE l'interdit (« aucun appel à capterErreur, critère 41 ») ferait
    rougir le gate pour une phrase, et la seule façon de le calmer serait de
    supprimer la phrase. Le découpage est naïf : il peut manger un `//` dans une
    chaîne, ce qui ne produit que des faux NÉGATIFS, jamais un faux échec. */
const sansCommentaires = (src: string): string =>
	src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const code = (chemin: string): string | null => {
	const src = lire(chemin);
	return src === null ? null : sansCommentaires(src);
};

const contient = (chemin: string, motif: RegExp): boolean | null => {
	const src = code(chemin);
	return src === null ? null : motif.test(src);
};

const doitContenir = (chemin: string, nom: string, motif: RegExp): void => {
	expect({ fichier: chemin, attendu: nom, present: contient(chemin, motif) }).toEqual({
		fichier: chemin,
		attendu: nom,
		present: true,
	});
};

const doitEviter = (chemin: string, nom: string, motif: RegExp): void => {
	expect({ fichier: chemin, interdit: nom, present: contient(chemin, motif) }).toEqual({
		fichier: chemin,
		interdit: nom,
		present: false,
	});
};

/** Les symboles que `chemin` importe NOMMÉMENT du module `source`. Sert à
    distinguer « prend les types du moteur » de « prend le TRAVAIL du moteur » :
    chercher le nom du module suffirait pour le premier, pas pour le second. */
const importsDe = (chemin: string, source: string): string[] => {
	const src = code(chemin) ?? '';
	const motif = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${source.replace(/\./g, '\\.')}'`);
	const trouve = motif.exec(src);
	return trouve
		? trouve[1]
				.split(',')
				.map((s) => s.trim().replace(/^type\s+/, ''))
				.filter((s) => s.length > 0)
		: [];
};

/** Les fichiers du lot. Tout interdit vaut pour TOUS : un jeu qui n'alimente pas
    l'économie ne l'alimente ni depuis son runner, ni depuis son état. */
const TOUS = [MOTIFS, JEU, ETAT, RUNNER];

describe('#665 — les fichiers du lot existent', () => {
	it('la banque, les motifs, le jeu, l’état, le runner et sa feuille de style', () => {
		for (const f of [BANQUE, MOTIFS, JEU, ETAT, RUNNER, FEUILLE]) existe(f);
	});

	it('le runner s’enregistre sous l’id « mots-croises »', () => {
		// Même motif que le 2048, le Motus, le sudoku et les mots casés — et c'est
		// ce que lit `couverture-e2e-gate.test.ts` pour rattacher un runner à sa spec.
		existe(RUNNER);
		doitContenir(RUNNER, "enregistrerJeu('mots-croises', …)", /enregistrerJeu\(\s*'mots-croises'/);
	});
});

describe('#665 — le moteur de #664 sert ce second client SANS CHANGER', () => {
	it('le jeu prend le TRAVAIL du moteur, il ne réécrit pas de solveur', () => {
		/* C'est la promesse faite en #664 : « un moteur qui aurait besoin d'un vrai
		   mot pour fonctionner ne serait pas celui-là ». Un jeu qui recopierait le
		   retour arrière chez lui donnerait deux solveurs à régler au lieu d'un, et
		   la promesse n'aurait servi à rien.

		   Vérifié aussi à l'exécution (`mots-croises.test.ts` mesure le remplissage
		   des motifs réels) ; ici on vérifie d'où il vient. */
		existe(JEU);
		doitContenir(JEU, "import depuis './grille-mots'", /from\s*'\.\/grille-mots'/);
		const pris = importsDe(JEU, './grille-mots');
		expect({
			fichier: JEU,
			prend: 'choisirRemplissage ou remplirMotif',
			present: pris.includes('choisirRemplissage') || pris.includes('remplirMotif'),
		}).toEqual({ fichier: JEU, prend: 'choisirRemplissage ou remplirMotif', present: true });
	});

	it('le moteur, lui, ne connaît toujours ni ce jeu, ni le français, ni le stockage', () => {
		/* L'autre sens de la séparation, et la raison d'être de ce bloc : si servir
		   les mots croisés demandait de toucher au moteur, la brique ne serait pas
		   générique — elle serait le moteur des mots casés avec une rustine. */
		existe(MOTEUR);
		doitEviter(MOTEUR, 'le mot « mots-croises »', /mots-croises/i);
		doitEviter(MOTEUR, 'le mot « definition »', /d[ée]finition/i);
		doitEviter(MOTEUR, 'import de données', /from\s*'[^']*data\//);
		doitEviter(MOTEUR, "import de '../storage'", /from\s*'[^']*storage'/);
		doitEviter(MOTEUR, 'Math.random', /Math\.random\b/);
	});

	it('le jeu ne tire son aléa que de son générateur', () => {
		// Le tirage est aussi mesuré à l'exécution (`mots-croises.test.ts` espionne
		// `Math.random`) ; ici on attrape le cas où l'aléa serait tiré à
		// l'initialisation du module, hors de tout appel.
		for (const f of [MOTIFS, JEU, ETAT]) {
			existe(f);
			doitEviter(f, 'Math.random', /Math\.random\b/);
		}
	});
});

describe('#665 critère 14 — les motifs sont des DONNÉES, propres à ce jeu', () => {
	it('le fichier de motifs ne fabrique rien au lancement', () => {
		/* Ce qui est interdit, ce n'est pas une abréviation locale (`h(0, 0, 5)` reste
		   de la donnée écrite à la main), c'est de GÉNÉRER les emplacements — une
		   boucle, un `Array.from`, un tirage. La raison ne se voit pas à la
		   relecture : un motif généré n'est plus relu par personne, donc plus jamais
		   vérifié à l'œil, alors que la borne des sept lignes du critère 14 se tient
		   d'abord à l'œil. */
		existe(MOTIFS);
		for (const [nom, motif] of [
			['une boucle for', /\bfor\s*\(/],
			['une boucle while', /\bwhile\s*\(/],
			['Array.from', /Array\.from\b/],
			['new Array', /new\s+Array\b/],
			['Math.random', /Math\.random\b/],
			['un appel à croisements()', /\bcroisements\s*\(/],
		] as const) {
			doitEviter(MOTIFS, nom, motif);
		}
	});

	it('ne reprend pas les motifs des mots casés', () => {
		/* « Propres à ce jeu », et ce n'est pas une coquetterie : quatre des sept
		   dessins de #664 dépassent sept lignes ou six colonnes, et deux d'entre eux
		   ne se remplissent PAS avec la banque de définitions (mesuré : 0 fois sur
		   200, même à 64 fois le budget). Les importer ferait entrer par la porte ce
		   que les critères 14 et 16 refusent par la fenêtre. */
		for (const f of [MOTIFS, JEU]) {
			existe(f);
			doitEviter(f, "import de 'motifs-mots-cases'", /motifs-mots-cases/);
			doitEviter(f, 'MOTIFS_MOTS_CASES', /\bMOTIFS_MOTS_CASES\b/);
			doitEviter(f, "import de 'mots-cases'", /from\s*'[^']*\/mots-cases'/);
		}
	});

	it('le fichier de motifs ne dépend ni du jeu, ni de la banque, ni du stockage', () => {
		existe(MOTIFS);
		doitEviter(MOTIFS, "import de 'mots-croises'", /from\s*'[^']*mots-croises/);
		doitEviter(MOTIFS, 'import du stockage', /from\s*'[^']*storage'/);
		doitEviter(MOTIFS, 'DEFINITIONS', /\bDEFINITIONS\b/);
	});
});

describe('#665 critères 38 et 43 — le stockage', () => {
	it('l’état lit et écrit par lsGet / lsSet', () => {
		/* Le préfixe `ludaskia_` est déjà tenu par `cles-stockage-gate.test.ts`, et
		   l'accès direct à `localStorage` est refusé par ESLint (#579). Ce qui reste
		   à vérifier : que ce module passe bien par les helpers, donc par le préfixe
		   de PROFIL — sans quoi la grille en cours serait partagée entre tous les
		   enfants de la maison. */
		existe(ETAT);
		doitContenir(ETAT, "import depuis '../storage'", /from\s*'\.\.\/storage'/);
		doitContenir(ETAT, 'lsGet', /\blsGet\b/);
		doitContenir(ETAT, 'lsSet', /\blsSet\b/);
		doitEviter(ETAT, 'localStorage en direct', /\blocalStorage\b/);
	});

	it('n’expose qu’UNE clé (critères 42 et 43)', () => {
		/* Une deuxième clé, c'est une mémoire de plus : un compteur de grilles
		   finies, une série de grilles enchaînées (critère 43), un record
		   (critère 42). Ce contrôle n'interdit pas de compter, il interdit de se
		   SOUVENIR — et sans mémoire, il n'y a ni série ni record possible.
		   Contrairement aux mots casés, aucune préférence n'est à retenir : l'issue
		   ne propose aucun choix de format. Une clé de plus se déclare ICI, avec sa
		   raison. */
		existe(ETAT);
		const src = code(ETAT) ?? '';
		const cles = [...src.matchAll(/export const (CLE_[A-Z_]+)/g)].map((m) => m[1]).sort();
		expect(cles).toEqual(['CLE_MOTS_CROISES_PARTIE']);
	});

	it('l’état ne consulte ni le plafond ni la table des scores', () => {
		/* Critère 37 : « la grille survit au plafond atteint ». Une lecture qui
		   consulterait le temps restant pourrait décider de ne PAS rendre la grille —
		   c'est le cas d'échec littéral (« revenir après le plafond sert une grille
		   vide »). Et `jeux/etat.ts` porte à la fois le plafond et les scores : ne pas
		   l'importer sert aussi le critère 42. */
		existe(ETAT);
		doitEviter(ETAT, "import de './plafond'", /from\s*'\.\/plafond'/);
		doitEviter(ETAT, "import de './etat'", /from\s*'\.\/etat'/);
		doitEviter(ETAT, 'secondesRestantes', /\bsecondesRestantes\b/);
	});

	it('le runner sauve la partie, et PAS en s’accrochant à la sortie de page', () => {
		/* Moitié négative du critère 38, dont le cas d'échec est « fermer l'onglet
		   brutalement perd la dernière lettre ». Une sauvegarde branchée sur
		   `beforeunload` ou `pagehide` a exactement ce défaut : sur mobile, l'onglet
		   est souvent tué sans que ces événements partent. La sauvegarde doit suivre
		   le GESTE (chaque lettre posée, chaque effacement), pas la sortie. */
		existe(RUNNER);
		doitContenir(RUNNER, 'sauverPartie', /\bsauverPartie\b/);
		for (const [nom, motif] of [
			['beforeunload', /beforeunload/],
			['pagehide', /pagehide/],
			["'unload'", /'unload'/],
			['visibilitychange', /visibilitychange/],
		] as const) {
			doitEviter(RUNNER, nom, motif);
		}
	});
});

describe('#665 critères 41 et 42 — ni journal d’erreurs, ni économie', () => {
	it('n’appelle jamais capterErreur', () => {
		/* Critère 41, et c'est un arbitrage explicite du mainteneur (« ce sont des
		   jeux »), le même que pour le Motus qui est pourtant lui aussi de type C.
		   Le piège est ici plus vif qu'ailleurs : ce jeu CORRIGE quelque chose (un
		   mot complété est comparé à la solution), et la règle du dépôt veut que tout
		   chemin qui corrige une réponse d'enfant journalise. Elle ne s'applique
		   qu'aux LEÇONS — `erreurs-journal-gate.test.ts` ne regarde que les
		   `lecon-*.ts`, un `jeu-*.ts` n'y passe pas du tout. D'où ce contrôle-ci, qui
		   dit l'inverse et le dit exprès. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			doitEviter(f, 'capterErreur', /\bcapterErreur\b/);
			doitEviter(f, "import de 'erreur-capture'", /erreur-capture/);
			doitEviter(f, 'erreurs-journal', /erreurs-journal/);
		}
	});

	it('n’alimente ni XP, ni étoile, ni médaille, ni trophée, ni statistique', () => {
		// « Finir une grille fait bouger un compteur de l'accueil » est le cas d'échec
		// du critère 42. On le prend par les MODULES : le jeu ne peut pas nourrir
		// l'économie sans en importer un.
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			for (const [nom, motif] of [
				['core/progress', /from\s*'[^']*core\/progress'/],
				['core/rewards', /from\s*'[^']*core\/rewards'/],
				['core/lesson-run', /from\s*'[^']*core\/lesson-run'/],
				['core/recompenses-fin', /from\s*'[^']*core\/recompenses-fin'/],
				['core/scoring', /from\s*'[^']*core\/scoring'/],
				['core/unlocks', /from\s*'[^']*core\/unlocks'/],
				['addXP', /\baddXP\b/],
				['enregistrerScore', /\benregistrerScore\b/],
				['meilleurScore', /\bmeilleurScore\b/],
				['recordLessonRun', /\brecordLessonRun\b/],
				['recordLessonStats', /\brecordLessonStats\b/],
				['recordRun', /\brecordRun\b/],
				['recordSessionActivity', /\brecordSessionActivity\b/],
				['announceRewards', /\bannounceRewards\b/],
			] as const) {
				doitEviter(f, nom, motif);
			}
		}
	});

	it('ne compte ni les jours, ni les grilles enchaînées (critère 43)', () => {
		/* « Le jeu affiche 3 grilles d'affilée » est le cas d'échec. Une série se
		   compte forcément à partir d'une date ou d'un compteur gardé : les deux sont
		   interdits ici, et l'absence de seconde clé (plus haut) ferme la porte du
		   stockage. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			for (const [nom, motif] of [
				['getStreak', /\bgetStreak\b/],
				['jourLocal', /\bjourLocal\b/],
				['Date.now', /\bDate\.now\b/],
				['new Date', /\bnew\s+Date\b/],
			] as const) {
				doitEviter(f, nom, motif);
			}
		}
	});
});
