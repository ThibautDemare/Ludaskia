/* ============================================================
   Mots casés (#664) — GATE STATIQUE des critères négatifs et du câblage.

   Écrit AVANT l'implémentation. Il est donc ROUGE, et il faut savoir POURQUOI :
   ce n'est pas parce que les interdits sont enfreints, c'est parce que les
   fichiers attendus n'existent pas encore.

   C'est une précaution délibérée, et c'est le cœur de ce fichier. Un test qui
   affirme l'ABSENCE d'un appel dans un fichier absent est vert quoi qu'il
   arrive : il ne garde rien, il décore. Chaque interdit ci-dessous est donc
   précédé d'une exigence POSITIVE — le fichier existe, il passe par le moteur,
   il passe par `lsGet`/`lsSet`. Une fois le lot livré, tout doit être vert ; à ce
   moment-là seulement, les interdits gardent quelque chose.

   Critères portés : 4 (le runner ne lit jamais l'horloge), 5 (les motifs sont des
   DONNÉES, pas une fabrication au lancement), 34 (moitié négative : la sauvegarde
   n'est pas accrochée à la sortie de page), 36 (deux clés, et deux seulement),
   37 (aucun `capterErreur`), 38 (rien de l'économie) et 40 (la classe du profil
   n'est jamais consultée). Plus le câblage qui rend #665 possible : le moteur de
   grille de mots ne connaît ni le jeu, ni le français, ni le stockage.

   CE QU'IL NE PROUVE PAS. La moitié POSITIVE du critère 34 — « la sauvegarde a
   lieu à chaque pose et à chaque retrait » — se voit en rechargeant la page,
   donc en Playwright. Le critère 42 (rien d'existant ne change) est tenu par la
   suite entière, pas par un fichier. Et le rattachement du runner à une spec est
   déjà exigé par `couverture-e2e-gate.test.ts` : inutile de le redire ici.

   Lu comme du TEXTE (pas de DOM, quelques millisecondes), au motif de
   `sudoku-gate.test.ts` : les assertions portent sur des BOOLÉENS et pas sur le
   contenu du fichier, pour qu'un échec dise la règle enfreinte au lieu de
   recracher mille lignes.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const MOTEUR = 'src/core/jeux/grille-mots.ts';
const MOTIFS = 'src/data/jeux/motifs-mots-cases.ts';
const JEU = 'src/core/jeux/mots-cases.ts';
const ETAT = 'src/core/jeux/mots-cases-etat.ts';
const RUNNER = 'src/ui/jeu-mots-cases.ts';
const FEUILLE = 'src/styles/jeu-mots-cases.scss';

const lire = (chemin: string): string | null =>
	existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;

const existe = (chemin: string): void => {
	expect({ fichier: chemin, existe: lire(chemin) !== null }).toEqual({
		fichier: chemin,
		existe: true,
	});
};

/** Retire les commentaires avant de chercher. Sans cela, un en-tête qui
    DOCUMENTE l'interdit (« aucun appel à capterErreur, critère 37 ») ferait
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

/** Les symboles que `chemin` importe NOMMÉMENT du module `source` (le `type `
    d'un import de type est retiré). Sert à distinguer « prend les types du
    moteur » de « prend le TRAVAIL du moteur » : chercher le nom du module
    suffirait pour le premier, pas pour le second. */
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

const doitEviter = (chemin: string, nom: string, motif: RegExp): void => {
	expect({ fichier: chemin, interdit: nom, present: contient(chemin, motif) }).toEqual({
		fichier: chemin,
		interdit: nom,
		present: false,
	});
};

/** Les fichiers du lot. Tout interdit vaut pour TOUS : un jeu qui n'alimente pas
    l'économie ne l'alimente ni depuis son runner, ni depuis son état. */
const TOUS = [MOTEUR, MOTIFS, JEU, ETAT, RUNNER];

describe('#664 — les fichiers du lot existent', () => {
	it('le moteur, les motifs, le jeu, l’état, le runner et sa feuille de style', () => {
		for (const f of [MOTEUR, MOTIFS, JEU, ETAT, RUNNER, FEUILLE]) existe(f);
	});

	it('le runner s’enregistre sous l’id « mots-cases »', () => {
		// Même motif que le 2048, le Motus et le sudoku, et c'est ce que lit
		// `couverture-e2e-gate.test.ts` pour rattacher un runner à sa spec.
		existe(RUNNER);
		doitContenir(RUNNER, "enregistrerJeu('mots-cases', …)", /enregistrerJeu\(\s*'mots-cases'/);
	});
});

describe('#664 — le moteur de grille de mots reste réutilisable par #665', () => {
	it('le jeu est ASSEMBLÉ sur le moteur, il ne réinvente pas la géométrie', () => {
		/* « Il livre les motifs et le moteur, que #665 réutilisera en changeant la
		   source des mots. » Un jeu qui recalcule ses croisements chez lui
		   obligerait les mots croisés à rouvrir ce fichier au lieu d'ajouter leurs
		   définitions. Le test de comportement prouve que ça MARCHE ; celui-ci prouve
		   que ça vient bien du moteur. */
		existe(JEU);
		doitContenir(JEU, "import depuis './grille-mots'", /from\s*'\.\/grille-mots'/);

		/* ─ Ce que cette ligne remplace, et pourquoi ─────────────────────────────
		   Il y avait ici `doitContenir(JEU, 'croisements', /\bcroisements\b/)`. Le
		   solveur ayant été déplacé dans le moteur, le jeu ne manipule plus aucun
		   croisement : l'assertion ne restait verte que parce que le mot survit dans
		   un MESSAGE D'ERREUR (« ou croisements trop denses »). Elle affirmait
		   « il ne réinvente pas la géométrie » en mesurant la présence d'un mot dans
		   une chaîne de caractères — donc elle ne gardait plus rien.

		   Ce qu'il faut prouver n'a pas changé : le travail de géométrie vient du
		   moteur. Cela se dit en deux temps — ce que le jeu lui PREND, et ce qu'il
		   ne refait pas chez lui. */

		// 1. Il lui prend le TRAVAIL, pas seulement les types. Un fichier qui
		//    n'importerait que `Grille` et `Motif` passerait le contrôle du module
		//    ci-dessus tout en réécrivant le solveur en dessous.
		const pris = importsDe(JEU, './grille-mots');
		for (const symbole of ['remplirMotif', 'choisirRemplissage', 'grilleNeuve']) {
			expect({ fichier: JEU, pris: symbole, present: pris.includes(symbole) }).toEqual({
				fichier: JEU,
				pris: symbole,
				present: true,
			});
		}

		// 2. Il ne dérive AUCUNE case d'un emplacement. Réinventer la géométrie, en
		//    pratique, c'est exactement cela : repartir de (ligne, colonne, sens)
		//    pour recalculer où tombe la n-ième lettre. Le jour où ces trois mots
		//    reviennent dans ce fichier, #665 devra le rouvrir au lieu de se
		//    contenter d'apporter ses propres mots.
		for (const [nom, motif] of [
			['une coordonnée `.ligne`', /\.ligne\b/],
			['une coordonnée `.colonne`', /\.colonne\b/],
			["le sens 'h'/'v' d'un emplacement", /\bsens\b/],
		] as const) {
			doitEviter(JEU, nom, motif);
		}
	});

	it('le moteur, lui, ne connaît ni le jeu, ni le français, ni le stockage', () => {
		/* L'autre sens de la séparation. S'il importait le vivier, les motifs ou le
		   stockage, la brique ne serait pas réutilisable et #665 hériterait des mots
		   casés en entier. Les commentaires sont retirés : l'en-tête a le droit de
		   dire « mots casés (#664) ». */
		existe(MOTEUR);
		doitEviter(MOTEUR, "import de './mots-cases'", /from\s*'\.\/mots-cases/);
		doitEviter(MOTEUR, 'import de données', /from\s*'[^']*data\//);
		doitEviter(MOTEUR, "import de '../storage'", /from\s*'[^']*storage'/);
		doitEviter(MOTEUR, 'le mot « mots-cases » dans le code', /mots-cases/i);
		doitEviter(MOTEUR, 'ORTHO_PREDEF', /\bORTHO_PREDEF\b/);
		doitEviter(MOTEUR, 'CHAMPS', /\bCHAMPS\b/);
		doitEviter(MOTEUR, 'Math.random', /Math\.random\b/);
	});

	it('le jeu ne tire son aléa que de son générateur', () => {
		// Le tirage est aussi mesuré à l'exécution (`mots-cases.test.ts` espionne
		// `Math.random`) ; ici on attrape le cas où l'aléa serait tiré à
		// l'initialisation du module, hors de tout appel.
		existe(JEU);
		doitEviter(JEU, 'Math.random', /Math\.random\b/);
	});
});

describe('#664 critère 5 — les motifs sont des DONNÉES', () => {
	it('le fichier de motifs ne fabrique rien au lancement', () => {
		/* Cas d'échec littéral : « un motif est fabriqué par du code au lancement ».
		   Une abréviation locale (`H(0, 0, 7)`) reste de la donnée écrite à la main :
		   ce qui est interdit, c'est de GÉNÉRER les emplacements — une boucle, un
		   `Array.from`, un tirage. C'est exactement ce que le cadrage a écarté, et
		   pour une raison qui ne se voit pas à la relecture : un motif généré n'est
		   plus relu par personne, donc plus jamais vérifié à l'œil. */
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

	it('le fichier de motifs ne dépend ni du jeu, ni du vivier, ni du stockage', () => {
		// De la donnée pure : c'est ce qui permet à #665 de reprendre les motifs
		// sans reprendre les mots casés.
		existe(MOTIFS);
		doitEviter(MOTIFS, "import de 'mots-cases'", /from\s*'[^']*\/mots-cases'/);
		doitEviter(MOTIFS, 'import du stockage', /from\s*'[^']*storage'/);
		doitEviter(MOTIFS, 'ORTHO_PREDEF', /\bORTHO_PREDEF\b/);
	});
});

describe('#664 critère 4 — le runner ne lit jamais l’horloge', () => {
	it('ni chronomètre, ni compte à rebours, ni minuteur', () => {
		/* Cas d'échec littéral : « setInterval, Date.now ou performance.now apparaît
		   dans src/ui/jeu-mots-cases.ts ». Le temps joué est mesuré par
		   `jeux-ecran.ts`, pas par le jeu. Le critère 32 le redit côté écran (« la
		   progression se lit en montant, sans compte à rebours ni chronomètre ») :
		   un enfant lent à cause du geste, et non de la réflexion, verrait sinon son
		   obstacle moteur transformé en signal de pression. */
		existe(RUNNER);
		for (const [nom, motif] of [
			['setInterval', /\bsetInterval\b/],
			['Date.now', /\bDate\.now\b/],
			['performance.now', /\bperformance\.now\b/],
			['new Date', /\bnew\s+Date\b/],
		] as const) {
			doitEviter(RUNNER, nom, motif);
		}
	});

	it('et la logique du jeu non plus', () => {
		// Le corollaire sert la pureté du tirage : une fonction qui lit l'heure n'est
		// pas une fonction pure de (taille, générateur), et plus aucun invariant de
		// grille ne serait rejouable.
		for (const f of [MOTEUR, MOTIFS, JEU, ETAT]) {
			existe(f);
			doitEviter(f, 'new Date', /\bnew\s+Date\b/);
			doitEviter(f, 'Date.now', /\bDate\.now\b/);
			doitEviter(f, 'jourLocal', /\bjourLocal\b/);
			doitEviter(f, 'getStreak', /\bgetStreak\b/);
		}
	});
});

describe('#664 critères 34 et 36 — le stockage', () => {
	it('l’état lit et écrit par lsGet / lsSet', () => {
		/* Le préfixe `ludaskia_` est déjà tenu par `cles-stockage-gate.test.ts`, et
		   l'accès direct à `localStorage` est refusé par ESLint (#579). Ce qui reste
		   à vérifier ici : que ce module passe bien par les helpers, donc par le
		   préfixe de PROFIL — sans quoi la grille en cours serait partagée entre tous
		   les enfants de la maison. */
		existe(ETAT);
		doitContenir(ETAT, "import depuis '../storage'", /from\s*'\.\.\/storage'/);
		doitContenir(ETAT, 'lsGet', /\blsGet\b/);
		doitContenir(ETAT, 'lsSet', /\blsSet\b/);
		doitEviter(ETAT, 'localStorage en direct', /\blocalStorage\b/);
	});

	it('n’expose que les deux clés du contrat (critères 36, 38 et 39)', () => {
		/* Une troisième clé, c'est une mémoire de plus : un compteur de parties, une
		   série de grilles enchaînées (critère 39), un record (critère 38). Ce
		   contrôle n'interdit pas de compter, il interdit de se SOUVENIR. Une clé de
		   plus se déclare ICI, avec sa raison. */
		existe(ETAT);
		const src = code(ETAT) ?? '';
		const cles = [...src.matchAll(/export const (CLE_[A-Z_]+)/g)].map((m) => m[1]).sort();
		expect(cles).toEqual(['CLE_MOTS_CASES_PARTIE', 'CLE_MOTS_CASES_TAILLE']);
	});

	it('le runner sauve la partie, et PAS en s’accrochant à la sortie de page', () => {
		/* Moitié négative du critère 34, dont le cas d'échec est « fermer l'onglet
		   brutalement perd le dernier mot posé ». Une sauvegarde branchée sur
		   `beforeunload` ou `pagehide` a exactement ce défaut : sur mobile, l'onglet
		   est souvent tué sans que ces événements partent. La sauvegarde doit suivre
		   le GESTE (poser, retirer), pas la sortie.

		   La moitié positive — elle a bien lieu à chaque pose — se voit en rechargeant
		   la page : c'est du Playwright. */
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

describe('#664 critères 37 et 38 — ni journal d’erreurs, ni économie', () => {
	it('n’appelle jamais capterErreur', () => {
		/* Critère 37, repris du 24 de #661 : un coup dans un jeu n'est pas une erreur
		   d'apprentissage à faire remonter au parent. Le jeu ne CORRIGE rien — il n'y
		   a pas de bonne réponse à côté de laquelle l'enfant serait passé, seulement
		   un conflit transitoire qu'il défera lui-même, et le cadrage a établi qu'il
		   n'entraîne ni lecture ni orthographe produite.

		   À noter : `erreurs-journal-gate.test.ts` ne couvre pas ce cas — il ne
		   regarde que les runners `lecon-*.ts`, et il exige l'INVERSE (qu'ils
		   journalisent). Un `jeu-*.ts` n'y passe pas du tout. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			doitEviter(f, 'capterErreur', /\bcapterErreur\b/);
			doitEviter(f, "import de 'erreur-capture'", /erreur-capture/);
			doitEviter(f, 'erreurs-journal', /erreurs-journal/);
		}
	});

	it('n’alimente ni XP, ni étoile, ni médaille, ni trophée, ni statistique de leçon', () => {
		// « Boucler une grille entière fait bouger un compteur de l'accueil » est le
		// cas d'échec du critère 38. On le prend par les MODULES : le jeu ne peut pas
		// nourrir l'économie sans en importer un.
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

	it('ne lit jamais la classe du profil (critère 40)', () => {
		/* Jeu de type R : « la difficulté se choisit par l'enfant, pas par le niveau
		   scolaire ». Le piège est à un caractère près : les séries d'où viennent les
		   mots portent chacune un `niveau`, et filtrer dessus est la chose la plus
		   naturelle du monde quand on recopie le vivier du Motus. Deux profils de
		   classes différentes doivent voir exactement le même jeu. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			for (const [nom, motif] of [
				['niveauActif', /\bniveauActif\b/],
				['getNiveauReference', /\bgetNiveauReference\b/],
				['SchoolLevel', /\bSchoolLevel\b/],
				['LEVEL_ORDER', /\bLEVEL_ORDER\b/],
				['un accès à .niveau', /\.niveau\b/],
			] as const) {
				doitEviter(f, nom, motif);
			}
		}
	});
});

describe('#664 — deux reprises de code que le cadrage a explicitement écartées', () => {
	it('le runner ne réutilise pas le widget de tuiles des leçons', () => {
		/* Arbitrage 5 du cadrage : « src/ui/tuile-interaction.ts n'est pas
		   réutilisé ». C'est un widget de LEÇON — il valide, fige et pose des marques
		   ✓/✗. Un jeu ne fait rien de tout ça, et hériter de ces trois
		   comportements ramènerait la note dans un écran conçu sans note. On en
		   reprend la convention de geste (taper pour prendre, taper pour poser), pas
		   le code. */
		existe(RUNNER);
		doitEviter(RUNNER, 'tuile-interaction', /tuile-interaction/);
		doitEviter(RUNNER, 'TuileController', /\bTuileController\b/);
	});

	it('le jeu ne reprend pas le vivier du Motus', () => {
		/* `vivierMots()` (Motus) écarte les homophones, les séries irrégulières, les
		   mots-outils, et borne à 5-6 lettres. Le critère 12 dit l'inverse : « avec
		   pour SEULE exclusion la forme ». Le réutiliser serait le raccourci évident,
		   et il donnerait un vivier deux fois trop petit sans que rien ne casse. */
		existe(JEU);
		doitEviter(JEU, "import de './motus'", /from\s*'\.\/motus'/);
		doitEviter(JEU, 'vivierMots', /\bvivierMots\s*\(/);
	});
});
