/* ============================================================
   Sudoku (#666) — GATE STATIQUE des critères négatifs et du câblage.

   Écrit AVANT l'implémentation. Il est donc ROUGE, et il faut savoir POURQUOI il
   l'est : ce n'est pas parce que les interdits sont enfreints, c'est parce que
   les fichiers attendus n'existent pas encore.

   C'est une précaution délibérée, et elle est le cœur de ce fichier. Un test qui
   se contente d'affirmer l'ABSENCE d'un appel dans un fichier vide (ou absent)
   est vert quoi qu'il arrive : il ne garde rien, il décore. Chaque interdit
   ci-dessous est donc précédé d'une exigence POSITIVE — le fichier existe, il
   passe par le moteur, il passe par `lsGet`/`lsSet` — sans quoi le test échoue
   en le disant. Une fois le lot livré, tout doit être vert ; à ce moment-là, et
   à ce moment-là seulement, les interdits gardent quelque chose.

   Critères portés : 25 (la règle n'est pas écrite en dur dans le module du
   sudoku), 27 (le stockage passe par les helpers), 29 (aucun score), 30 (aucun
   déblocage interne), 31 (rien de daté, aucune série), 32 (aucun indice),
   33 (aucun `capterErreur`) et 34 (aucune alimentation de l'économie), plus la
   moitié mécanisable du 28 (aucune horloge dans le jeu).

   CE QU'IL NE PROUVE PAS. Le critère 28 a une seconde moitié — un compteur de
   coups n'a pas besoin d'horloge — qui se voit à l'écran et pas dans le texte du
   code : elle relève de la spec Playwright. Le critère 36 (célébration calme)
   n'est tenu par aucun test, c'est une relecture `designer-ux-enfant` à demander
   dans la PR ; le critère 35 (rien d'existant ne change) est tenu par la suite
   entière, pas par un fichier.

   Lu comme du TEXTE (pas de DOM, quelques millisecondes), au motif de
   `annonce-recompenses-gate.test.ts` : les assertions portent sur des BOOLÉENS et
   pas sur le contenu du fichier, pour qu'un échec dise la règle enfreinte au
   lieu de recracher mille lignes.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const MOTEUR = 'src/core/jeux/grille-contraintes.ts';
const JEU = 'src/core/jeux/sudoku.ts';
const ETAT = 'src/core/jeux/sudoku-etat.ts';
const RUNNER = 'src/ui/jeu-sudoku.ts';
const FEUILLE = 'src/styles/jeu-sudoku.scss';

/** Le texte du fichier, ou `null` s'il n'existe pas — l'absence est un échec
    NOMMÉ, pas une exception opaque au milieu d'une assertion d'absence. */
const lire = (chemin: string): string | null =>
	existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;

const existe = (chemin: string): void => {
	expect({ fichier: chemin, existe: lire(chemin) !== null }).toEqual({
		fichier: chemin,
		existe: true,
	});
};

/** Retire les commentaires avant de chercher. Sans cela, un en-tête qui
    DOCUMENTE l'interdit (« aucun indice offert, critère 32 » — exactement ce que
    le runner du 2048 écrit de ses propres règles) ferait rougir le gate pour une
    phrase, et la seule façon de le calmer serait de supprimer la phrase. Le
    découpage est naïf : il peut manger un `//` dans une chaîne, ce qui ne
    produit que des faux NÉGATIFS, jamais un faux échec. */
const sansCommentaires = (src: string): string =>
	src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const code = (chemin: string): string | null => {
	const src = lire(chemin);
	return src === null ? null : sansCommentaires(src);
};

/** Vrai si le motif apparaît dans le CODE du fichier. Un fichier ABSENT rend
    `null` : l'appelant doit d'abord avoir exigé son existence, sinon « pas
    d'appel interdit » et « pas de fichier » se confondent. */
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

/** Les fichiers du lot. Tout interdit vaut pour TOUS : un jeu qui n'alimente pas
    l'économie ne l'alimente ni depuis son runner, ni depuis son état. */
const TOUS = [MOTEUR, JEU, ETAT, RUNNER];

describe('#666 — les fichiers du lot existent', () => {
	it('le moteur, le jeu, l’état, le runner et sa feuille de style', () => {
		for (const f of [MOTEUR, JEU, ETAT, RUNNER, FEUILLE]) existe(f);
	});

	it('le runner s’enregistre sous l’id « sudoku »', () => {
		// Même motif que le 2048 et le Motus, et c'est ce que lit
		// `couverture-e2e-gate.test.ts` pour rattacher un runner à sa spec.
		existe(RUNNER);
		doitContenir(RUNNER, "enregistrerJeu('sudoku', …)", /enregistrerJeu\(\s*'sudoku'/);
	});
});

describe('#666 critère 25 — la règle n’est pas écrite en dur dans le module du sudoku', () => {
	it('le jeu assemble le moteur générique au lieu de recalculer ses zones', () => {
		/* Cas d'échec littéral du critère 25 : « la règle "un symbole par ligne,
		   colonne et région" est écrite en dur dans le module du sudoku ». Le test
		   de comportement (`sudoku.test.ts`) prouve que les trois contraintes SE
		   COMPORTENT comme les unicités du moteur ; il ne peut pas prouver qu'elles
		   en VIENNENT. C'est ce que fait ce contrôle de câblage — et c'est lui qui
		   protège #667 : un sudoku qui recalcule ses zones obligerait le calcudoku à
		   rouvrir son fichier au lieu d'ajouter ses cages. */
		existe(JEU);
		doitContenir(JEU, "import depuis './grille-contraintes'", /from\s*'\.\/grille-contraintes'/);
		for (const [nom, motif] of [
			['creerMoteur', /\bcreerMoteur\b/],
			['contrainteUnicite', /\bcontrainteUnicite\b/],
			['lignes', /\blignes\b/],
			['colonnes', /\bcolonnes\b/],
			['regions', /\bregions\b/],
		] as const) {
			doitContenir(JEU, nom, motif);
		}
	});

	it('le moteur, lui, ne connaît pas le sudoku', () => {
		// L'autre sens de la séparation : si le moteur importait le jeu, la brique ne
		// serait pas réutilisable et #667 hériterait du sudoku entier.
		existe(MOTEUR);
		doitEviter(MOTEUR, "import de './sudoku'", /from\s*'\.\/sudoku/);
		// Les commentaires étant retirés, l'en-tête du fichier (qui dit légitimement
		// « Sudoku #666 ») ne compte pas : seul le CODE est regardé.
		doitEviter(MOTEUR, 'le mot « sudoku » dans le code', /sudoku/i);
	});
});

describe('#666 critère 27 — le stockage passe par les helpers', () => {
	it('l’état lit et écrit par lsGet / lsSet', () => {
		/* Le préfixe `ludaskia_` est déjà tenu par `cles-stockage-gate.test.ts`, et
		   l'accès direct à `localStorage` est refusé par ESLint (#579). Ce qui reste
		   à vérifier ici est plus simple et non couvert : que ce module passe bien
		   par les helpers, donc par le préfixe de profil — sans quoi la grille en
		   cours serait partagée entre tous les enfants de la maison. */
		existe(ETAT);
		doitContenir(ETAT, "import depuis '../storage'", /from\s*'\.\.\/storage'/);
		doitContenir(ETAT, 'lsGet', /\blsGet\b/);
		doitContenir(ETAT, 'lsSet', /\blsSet\b/);
		doitEviter(ETAT, 'localStorage en direct', /\blocalStorage\b/);
	});
});

describe('#666 critères 29 et 30 — aucun score, aucun déblocage interne', () => {
	it('n’expose que les trois clés du contrat', () => {
		/* Le critère 30 interdit qu'une taille s'ouvre après N parties, et le
		   critère 29 tout score. Les deux auraient besoin d'un compteur PERSISTÉ :
		   une quatrième clé (« parties terminées », « meilleure grille »). Ce
		   contrôle n'interdit pas de compter, il interdit de se souvenir — et sans
		   mémoire, il n'y a ni palier ni record. Une clé de plus se déclare ICI,
		   avec sa raison. */
		existe(ETAT);
		const src = code(ETAT) ?? '';
		const cles = [...src.matchAll(/export const (CLE_[A-Z_]+)/g)].map((m) => m[1]).sort();
		expect(cles).toEqual(['CLE_SUDOKU_INITIE', 'CLE_SUDOKU_PARTIES', 'CLE_SUDOKU_TAILLE']);
	});

	it('n’enregistre et ne lit aucun score, où que ce soit', () => {
		/* `meilleurScore` est une brique disponible, pas obligatoire. Le lire
		   quelque part signifierait qu'un nombre présenté comme un record existe :
		   or tout ce qui pourrait en faire office ici est une mesure de vitesse ou un
		   compte de coups, tous deux écartés au critère 28. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			doitEviter(f, 'enregistrerScore', /\benregistrerScore\b/);
			doitEviter(f, 'meilleurScore', /\bmeilleurScore\b/);
		}
	});
});

describe('#666 critère 31 — rien de daté, aucune série', () => {
	it('la logique du sudoku ignore complètement le calendrier', () => {
		/* « Rien ne se périme et rien ne se perd en ne jouant pas. » Une grille du
		   jour ou une série de jours consécutifs a besoin d'une date : sans horloge
		   dans ces trois modules, ni l'une ni l'autre ne peut exister. Le corollaire
		   sert aussi le critère 5 : un tirage qui lirait l'heure ne serait pas une
		   fonction pure de (taille, générateur), et aucun invariant de grille ne
		   serait reproductible. */
		for (const f of [MOTEUR, JEU, ETAT]) {
			existe(f);
			doitEviter(f, 'new Date', /new\s+Date\b/);
			doitEviter(f, 'Date.now', /Date\.now\b/);
			doitEviter(f, 'jourLocal', /\bjourLocal\b/);
			doitEviter(f, 'todayStr', /\btodayStr\b/);
			doitEviter(f, 'getStreak', /\bgetStreak\b/);
		}
	});

	it('et le tirage n’a pas d’autre source d’aléa que son générateur', () => {
		// Le critère 5 se mesure aussi à l'exécution (`sudoku.test.ts` espionne
		// `Math.random`) ; ici on attrape le cas où l'aléa serait tiré à
		// l'initialisation du module, hors de tout appel.
		existe(JEU);
		doitEviter(JEU, 'Math.random', /Math\.random\b/);
		existe(MOTEUR);
		doitEviter(MOTEUR, 'Math.random', /Math\.random\b/);
	});
});

describe('#666 critère 28 — aucune horloge dans le jeu', () => {
	it('ni chronomètre, ni compte à rebours, ni minuteur dans le runner', () => {
		/* Le temps de jeu du plafond est mesuré par `jeux-ecran.ts`, pas par le
		   runner : celui-ci n'a donc aucune raison de lire une horloge, et un
		   chronomètre — visible ou non — en aurait besoin. Un enfant dyspraxique
		   dont la lenteur est motrice verrait sinon un obstacle moteur transformé en
		   signal de pression.

		   MOITIÉ SEULEMENT : un compteur de COUPS n'a pas besoin d'horloge. Cette
		   moitié-là se voit à l'écran, donc en Playwright. */
		existe(RUNNER);
		doitEviter(RUNNER, 'setInterval', /\bsetInterval\b/);
		doitEviter(RUNNER, 'Date.now', /Date\.now\b/);
		doitEviter(RUNNER, 'performance.now', /performance\.now\b/);
	});
});

describe('#666 critère 32 — aucun indice, aucun badge de performance', () => {
	it('rien dans le runner ne révèle une case', () => {
		/* Un bouton qui révèle une case remplacerait la déduction par la demande, et
		   le jeu n'a de toute façon aucune monnaie pour la « payer » (critère
		   négatif 34). La marque la plus sûre côté code : le runner n'a aucune raison
		   de résoudre la grille — la fin de partie se lit sur `grilleTerminee`, et
		   c'est le générateur, pas l'interface, qui vérifie qu'une grille est
		   finissable.

		   Si l'implémentation a un besoin légitime du solveur dans le runner, la
		   règle n'est pas à assouplir en silence : l'écrire ICI avec sa raison, comme
		   le fait `cles-stockage-gate.test.ts` de ses indirections. */
		existe(RUNNER);
		doitEviter(RUNNER, 'resoudreParDeductionElementaire', /\bresoudreParDeductionElementaire\b/);
		doitEviter(RUNNER, 'un indice', /\bindice/i);
		doitEviter(RUNNER, 'révéler', /\brevele/i);
	});
});

describe('#666 critères 33 et 34 — ni journal d’erreurs, ni économie', () => {
	it('n’appelle jamais capterErreur', () => {
		/* Critère 24 de #661, redit au 33 : un coup dans un jeu n'est pas une erreur
		   d'apprentissage à faire remonter au parent. Le jeu ne CORRIGE rien — il n'y
		   a pas de bonne réponse à côté de laquelle l'enfant serait passé, seulement
		   un conflit transitoire qu'il défera lui-même.

		   À noter : `erreurs-journal-gate.test.ts` ne couvre pas ce cas, il ne
		   regarde que les runners `lecon-*.ts`, et il exige l'inverse (qu'ils
		   journalisent). Un `jeu-*.ts` n'y passe pas du tout. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			doitEviter(f, 'capterErreur', /\bcapterErreur\b/);
			doitEviter(f, "import de './erreur-capture'", /erreur-capture/);
			doitEviter(f, 'erreurs-journal', /erreurs-journal/);
		}
	});

	it('n’alimente ni XP, ni étoile, ni médaille, ni trophée, ni statistique de leçon', () => {
		// « Jouer ne fait bouger aucun compteur. » On le prend par les MODULES : le
		// jeu ne peut pas nourrir l'économie sans en importer un.
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
				['recordLessonRun', /\brecordLessonRun\b/],
				['recordLessonStats', /\brecordLessonStats\b/],
				['recordLessonResult', /\brecordLessonResult\b/],
				['recordRun', /\brecordRun\b/],
				['recordSessionActivity', /\brecordSessionActivity\b/],
				['announceRewards', /\bannounceRewards\b/],
			] as const) {
				doitEviter(f, nom, motif);
			}
		}
	});

	it('ne lit pas la classe du profil (critères 2 et 20)', () => {
		/* Jeu de type R : « aucune compétence déclarée ni dépendance à la classe ».
		   Le 2048 tient la même règle et l'a écrite dans son en-tête ; ici elle est
		   MESURÉE. Deux profils de classes différentes doivent voir exactement le
		   même jeu, et le seul moyen sûr de le garantir est que rien du jeu ne sache
		   ce qu'est une classe. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			doitEviter(f, 'niveauActif', /\bniveauActif\b/);
			doitEviter(f, 'getNiveauReference', /\bgetNiveauReference\b/);
			doitEviter(f, 'SchoolLevel', /\bSchoolLevel\b/);
		}
	});
});
