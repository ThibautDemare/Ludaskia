/* ============================================================
   Calcudoku (#667) — GATE : ce qui se vérifie sur les FICHIERS et le CATALOGUE.

   Écrit AVANT l'implémentation. Il est donc ROUGE, et il faut savoir POURQUOI :
   ce n'est pas parce que les interdits sont enfreints, c'est parce que les
   fichiers attendus n'existent pas encore.

   C'est une précaution délibérée, et elle est le cœur de ce fichier. Un test qui
   se contente d'affirmer l'ABSENCE d'un appel dans un fichier absent est vert
   quoi qu'il arrive : il ne garde rien, il décore. Chaque interdit ci-dessous
   est donc précédé d'une exigence POSITIVE — le fichier existe, il passe par le
   moteur, il passe par `lsGet`/`lsSet` — sans quoi le test échoue en le disant.
   Une fois le lot livré, tout doit être vert ; à ce moment-là seulement, les
   interdits gardent quelque chose. (Motif repris de `sudoku-gate.test.ts`.)

   Critères portés : 2 (aucune région enregistrée), 39 (la place au catalogue),
   40 (le GATE généralisé « type C ⇔ compétence »), 41 (le moteur de #666 n'est
   pas modifié), 45 (le stockage passe par les helpers), 53 (aucun
   `capterErreur`), 57 (ni « déduction » ni « logique » dans la compétence), plus
   les moitiés mécanisables des critères 8 (aucun autre aléa que le générateur
   injecté), 46 (aucune horloge), 47 et 54 (aucun score, aucune économie),
   50 à 52 (aucun déblocage, rien de daté, aucun indice).

   CE QU'IL NE PROUVE PAS. Le critère 46 a une seconde moitié — un compteur de
   coups n'a pas besoin d'horloge — qui se voit à l'écran et pas dans le texte du
   code ; elle relève de la spec Playwright, comme les critères 48 et 49. Le
   critère 56 (célébration calme) n'est tenu par aucun test, l'issue le dit
   elle-même : c'est une relecture `designer-ux-enfant` à demander dans la PR. Et
   le critère 55 (rien d'existant ne change) est tenu par la suite ENTIÈRE, pas
   par un fichier.
   ============================================================ */
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { JEUX, type JeuDef } from '../src/core/jeux/catalogue';
import { COTE, type Cage, type Operation, type Partie } from '../src/core/jeux/calcudoku';
import { partieEnCours, sauverPartie } from '../src/core/jeux/calcudoku-etat';
import { ajouterJeu } from '../src/core/jeux/etat';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { demonterJeuActif, monterJeu } from '../src/ui/jeux-ecran';
/* Importé pour son EFFET : c'est lui qui enregistre le runner auprès de
   `jeux-ecran`, donc ce qui rend `monterJeu('calcudoku', …)` possible plus bas. */
import '../src/ui/jeu-calcudoku';

const MOTEUR = 'src/core/jeux/grille-contraintes.ts';
const JEU = 'src/core/jeux/calcudoku.ts';
const ETAT = 'src/core/jeux/calcudoku-etat.ts';
const RUNNER = 'src/ui/jeu-calcudoku.ts';
const FEUILLE = 'src/styles/jeu-calcudoku.scss';

/** Les fichiers du lot. Tout interdit vaut pour TOUS : un jeu qui n'alimente pas
    l'économie ne l'alimente ni depuis son runner, ni depuis son état. */
const TOUS = [JEU, ETAT, RUNNER];

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
    DOCUMENTE l'interdit (« aucun indice offert, critère 52 ») ferait rougir le
    gate pour une phrase, et la seule façon de le calmer serait de supprimer la
    phrase. Le découpage est naïf : il peut manger un `//` dans une chaîne, ce
    qui ne produit que des faux NÉGATIFS, jamais un faux échec. */
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

/* ── LES FICHIERS DU LOT ─────────────────────────────────────────────────── */

describe('#667 — les fichiers du lot existent', () => {
	it('le jeu, l’état, le runner et sa feuille de style', () => {
		for (const f of [JEU, ETAT, RUNNER, FEUILLE]) existe(f);
	});

	it('critère 44 : le runner s’enregistre sous l’id « calcudoku »', () => {
		/* C'est ce que lit `couverture-e2e-gate.test.ts` pour rattacher un runner à
		   sa spec : la convention `src/ui/jeu-<id>.ts` + l'appel à `enregistrerJeu(`.
		   La spec Playwright elle-même est du ressort de `auteur-tests-e2e`. */
		existe(RUNNER);
		doitContenir(RUNNER, 'enregistrerJeu(', /enregistrerJeu\(/);
		doitContenir(RUNNER, "l'id « calcudoku »", /calcudoku/);
	});
});

/* ── LE CATALOGUE ────────────────────────────────────────────────────────── */

describe('#667 critères 39 et 57 — la place au catalogue', () => {
	const jeu = (): JeuDef | undefined => JEUX.find((j) => j.id === 'calcudoku');

	it('critère 39 : le calcudoku est inscrit, en type C, sans `levels`', () => {
		/* Cas d'échec littéral : « l'intitulé diffère, ou `levels` est renseigné ».
		   Sans `levels`, le jeu est proposé à TOUTES les classes — c'est la façon
		   d'écrire « ce jeu ignore le niveau scolaire » sans y revenir à chaque
		   classe, et c'est ce que l'arbitrage du critère 3 a tranché. */
		const j = jeu();
		expect(j, 'aucun jeu d’id « calcudoku » au catalogue').toBeDefined();
		expect(j?.type).toBe('C');
		expect(j?.levels).toBeUndefined();
	});

	it('critère 39 : la compétence est exactement celle que le pédagogue a formulée', () => {
		// Chaque mot est daté : « sommes » et « différences » sont le vocabulaire du
		// programme, « tables de multiplication » se tient volontairement en deçà de
		// « facteurs et multiples » — et n'est honnête que si le critère 12 tient.
		expect(jeu()?.competence).toBe('sommes, différences et tables de multiplication');
	});

	it('critère 57 : ni « déduction » ni « logique » dans la compétence', () => {
		/* Cas d'échec littéral. Ce serait faire passer pour une compétence scolaire
		   une capacité méthodologique transversale, que le socle range dans
		   « méthodes et outils pour apprendre ». C'est l'erreur que le verdict du
		   sudoku avait évitée.

		   Écrit sur TOUT le catalogue et pas sur le seul calcudoku : la règle ne vaut
		   pas pour un jeu, elle vaut pour ce que l'espace encadrant affirme. */
		for (const j of JEUX) {
			if (!j.competence) continue;
			expect(j.competence.toLowerCase(), `jeu « ${j.id} »`).not.toMatch(/d[ée]duction|logique/);
		}
	});

	it('critère 39 : la compétence reste invisible côté enfant', () => {
		// Le libellé de l'étagère ne nomme jamais la compétence (critère 3 de #661) :
		// ce jeu étant le premier type C en mathématiques, la tentation d'écrire
		// « Calculs » sur le bouton est neuve.
		const j = jeu();
		expect(j, 'aucun jeu d’id « calcudoku » : ce test ne garderait rien').toBeDefined();
		expect(j?.label).toBeTruthy();
		expect(j?.label ?? '').not.toMatch(/calcul|somme|diff[ée]rence|multiplication|table/i);
	});
});

describe('#667 critère 40 — le gate « type C ⇔ compétence », généralisé', () => {
	/* `tests/jeux-catalogue.test.ts` teste aujourd'hui des jeux NOMMÉS un par un
	   (« le Motus déclare une compétence », « le 2048 n'en déclare aucune »). Ce
	   jeu étant le premier type C en mathématiques, c'est le moment de
	   généraliser plutôt que d'ajouter un troisième exemple : la règle doit
	   valoir pour le jeu qu'on ajoutera demain sans y penser.

	   La règle est extraite en FONCTION, et éprouvée sur des entrées fabriquées :
	   sans cela, un gate écrit sur le seul catalogue actuel serait vert parce que
	   le catalogue est propre, et on ne saurait jamais s'il MORD. */

	const faute = (j: Pick<JeuDef, 'id' | 'type' | 'competence'>): string | null => {
		if (j.type === 'C' && !j.competence?.trim()) {
			return `le jeu « ${j.id} » est de type C sans compétence déclarée`;
		}
		if (j.type === 'R' && j.competence !== undefined) {
			return `le jeu « ${j.id} » est de type R et déclare pourtant une compétence`;
		}
		return null;
	};

	it('critère 40 : la règle MORD sur un type C sans compétence', () => {
		// Le cas d'échec littéral : « un jeu peut être ajouté au catalogue en violant
		// cette règle sans faire échouer `npm test` ».
		expect(faute({ id: 'faux-c', type: 'C' })).not.toBeNull();
		expect(faute({ id: 'faux-c-vide', type: 'C', competence: '   ' })).not.toBeNull();
	});

	it('critère 40 : la règle MORD sur un type R qui déclare une compétence', () => {
		/* L'autre sens, et il compte autant : un jeu refuge ne travaille rien, et le
		   dit en ne disant rien. Lui attribuer une compétence ferait mentir le bilan
		   destiné aux parents — c'est exactement ce que le cadrage des mots casés a
		   écarté. */
		expect(faute({ id: 'faux-r', type: 'R', competence: 'orthographe' })).not.toBeNull();
		expect(faute({ id: 'faux-r-vide', type: 'R', competence: '' })).not.toBeNull();
	});

	it('critère 40 : la règle accepte les deux formes légitimes', () => {
		expect(faute({ id: 'bon-c', type: 'C', competence: 'orthographe lexicale' })).toBeNull();
		expect(faute({ id: 'bon-r', type: 'R' })).toBeNull();
	});

	it('critère 40 : TOUT le catalogue la respecte', () => {
		expect(JEUX.map(faute).filter((f) => f !== null)).toEqual([]);
	});

	it('critère 40 : le catalogue contient bien les deux types, sinon le gate ne garde rien', () => {
		// Un gate « type C ⇔ compétence » sur un catalogue qui n'aurait qu'un seul
		// type ne vérifierait qu'une moitié de la règle.
		expect(new Set(JEUX.map((j) => j.type))).toEqual(new Set(['C', 'R']));
	});
});

/* ── LE MOTEUR DE #666 N'EST PAS TOUCHÉ ──────────────────────────────────── */

/** FNV-1a 32 bits, en hexadécimal. Ni cryptographie ni dépendance : un numéro de
    série lisible dans un message d'échec. Repris de
    `mots-croises-banques-intactes.test.ts`. */
function empreinte(texte: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < texte.length; i++) {
		h ^= texte.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

describe('#667 critère 41 — `grille-contraintes.ts` n’est pas modifié', () => {
	/* POURQUOI UNE EMPREINTE, ET PAS UNE COMPARAISON GIT.

	   La formulation naturelle du critère est « le diff de la PR ne touche pas ce
	   fichier », ce qui appelle un `git diff origin/feat/etagere-jeux`. Trois
	   raisons de ne pas l'écrire ainsi, et c'est un choix, pas un raccourci :

	   1. La branche d'intégration n'existe pas éternellement. Une fois #667 fondu
	      dans `main` et `feat/etagere-jeux` supprimée, la référence disparaît et
	      le test devient ROUGE POUR RIEN — ou pire, il se met à passer en silence
	      parce que la comparaison n'a plus de base.
	   2. La CI ne garantit pas la présence de cette référence. Un `checkout` peu
	      profond ne ramène pas les branches distantes hors sujet : le test serait
	      vert chez le développeur et incapable de se prononcer en CI, ce qui est
	      la pire des deux situations.
	   3. Un test qui lance `git` sort du bac à sable de Vitest pour rien.

	   L'empreinte a un défaut connu, et c'est un défaut ASSUMÉ : elle fige le
	   fichier au-delà de ce lot. Une évolution DÉLIBÉRÉE du moteur, plus tard,
	   fera échouer ce test. Ce n'est pas un faux positif, c'est la question posée
	   au bon moment — « est-ce bien voulu, et est-ce bien le lot en cours qui
	   doit le faire ? ». On met alors à jour la constante, avec sa raison. C'est
	   exactement le contrat de `mots-croises-banques-intactes.test.ts`.

	   Empreinte prise le 2026-09-13, sur `origin/feat/etagere-jeux`, avant la
	   première ligne de code du lot. */
	const EMPREINTE_ATTENDUE = '6c2c0e5d';

	/** Fins de ligne normalisées : `.gitattributes` déclare `* text=auto`, donc le
	    fichier est en CRLF sous Windows et en LF en CI. Sans cette normalisation
	    l'empreinte serait verte sur une plateforme et rouge sur l'autre. */
	const texteNormalise = (chemin: string): string =>
		(lire(chemin) ?? '').replace(/\r\n/g, '\n').normalize('NFC');

	it('critère 41 : le contenu du moteur est intact, au caractère près', () => {
		existe(MOTEUR);
		expect({ fichier: MOTEUR, empreinte: empreinte(texteNormalise(MOTEUR)) }).toEqual({
			fichier: MOTEUR,
			empreinte: EMPREINTE_ATTENDUE,
		});
	});

	it('critère 41 : sa surface publique n’a ni gagné ni perdu un symbole', () => {
		/* Redondant avec l'empreinte, et utile quand même : c'est ce test-ci qui
		   DIRA ce qui a changé, là où l'empreinte ne dit qu'un numéro. Une extension
		   de l'interface `Contrainte` — précisément ce que le hors-périmètre de
		   l'issue écarte — se lirait ici en clair. */
		const src = texteNormalise(MOTEUR);
		const exportes = [...src.matchAll(/export (?:function|const|type|interface) ([A-Za-z0-9_]+)/g)]
			.map((m) => m[1])
			.sort();
		expect(exportes).toEqual([
			'Contrainte',
			'Geometrie',
			'MoteurGrille',
			'Valeur',
			'Valeurs',
			'Zone',
			'colonnes',
			'compterSolutions',
			'contrainteUnicite',
			'creerMoteur',
			'lignes',
			'regions',
			'resoudreParDeductionElementaire',
		]);
	});

	it('critère 41 : le moteur ignore toujours le calcudoku', () => {
		// L'autre sens de la séparation : si le moteur importait le jeu, la brique ne
		// serait plus réutilisable et le prochain client hériterait du calcudoku.
		existe(MOTEUR);
		doitEviter(MOTEUR, "import de './calcudoku'", /from\s*'\.\/calcudoku/);
		doitEviter(MOTEUR, 'le mot « calcudoku » dans le code', /calcudoku/i);
		doitEviter(MOTEUR, 'le mot « cage » dans le code', /\bcage/i);
	});

	it('critère 41 : le jeu ASSEMBLE le moteur au lieu de recalculer ses zones', () => {
		/* « La cage s'ajoute comme une `Contrainte` de plus. » Un calcudoku qui
		   réécrirait l'unicité de ligne et de colonne pour son compte passerait les
		   tests de comportement sans rien prouver de la promesse du critère 25 de
		   #666 — et la prochaine grille à contraintes repartirait de zéro. */
		existe(JEU);
		doitContenir(JEU, "import depuis './grille-contraintes'", /from\s*'\.\/grille-contraintes'/);
		for (const [nom, motif] of [
			['creerMoteur', /\bcreerMoteur\b/],
			['contrainteUnicite', /\bcontrainteUnicite\b/],
			['lignes', /\blignes\b/],
			['colonnes', /\bcolonnes\b/],
		] as const) {
			doitContenir(JEU, nom, motif);
		}
	});

	it('critère 2 : aucune contrainte de région n’est enregistrée', () => {
		/* Cas d'échec littéral : « la contrainte de région est enregistrée au
		   moteur ». C'est la définition du genre, et le pendant statique du test de
		   comportement de `calcudoku.test.ts`. */
		existe(JEU);
		doitEviter(JEU, 'regions', /\bregions\b/);
		doitEviter(JEU, 'regionLargeur au pluriel des zones', /regions\s*\(/);
	});
});

/* ── LES INTERDITS ───────────────────────────────────────────────────────── */

describe('#667 critère 53 — aucun appel à `capterErreur`', () => {
	it('critère 53 : ni le jeu, ni son état, ni son runner ne journalisent', () => {
		/* Cas d'échec littéral : « le journal d'erreurs de l'espace encadrant
		   contient une entrée produite par ce jeu ». Un coup dans un jeu n'est pas
		   une erreur d'apprentissage à faire remonter au parent : le jeu ne CORRIGE
		   rien — il n'y a pas de bonne réponse à côté de laquelle l'enfant serait
		   passé, seulement un conflit transitoire qu'il défera lui-même.

		   À noter, parce que c'est contre-intuitif : `erreurs-journal-gate.test.ts`
		   ne couvre PAS ce cas. Il ne regarde que les runners `lecon-*.ts`, et il
		   exige l'inverse (qu'ils journalisent). Un `jeu-*.ts` n'y passe pas du
		   tout — d'où ce test-ci. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			doitEviter(f, 'capterErreur', /\bcapterErreur\b/);
			doitEviter(f, "import de 'erreur-capture'", /erreur-capture/);
			doitEviter(f, 'erreurs-journal', /erreurs-journal/);
		}
	});
});

describe('#667 critère 45 — le stockage passe par les helpers', () => {
	it('critère 45 : l’état lit et écrit par `lsGet` / `lsSet`', () => {
		/* Le préfixe `ludaskia_` est déjà tenu par `cles-stockage-gate.test.ts`, et
		   l'accès direct à `localStorage` est refusé par ESLint (#579). Ce qui reste
		   à vérifier ici, et qui n'est couvert nulle part ailleurs : que CE module
		   passe bien par les helpers, donc par le préfixe de profil — sans quoi la
		   grille en cours serait partagée entre tous les enfants de la maison. */
		existe(ETAT);
		doitContenir(ETAT, "import depuis '../storage'", /from\s*'\.\.\/storage'/);
		doitContenir(ETAT, 'lsGet', /\blsGet\b/);
		doitContenir(ETAT, 'lsSet', /\blsSet\b/);
		doitEviter(ETAT, 'localStorage en direct', /\blocalStorage\b/);
	});

	it('critères 47 et 50 : l’état n’expose que les deux clés du contrat', () => {
		/* Le critère 50 interdit qu'une opération ou une grille s'ouvre après N
		   parties, le 47 tout score, le 51 toute série. Les trois auraient besoin
		   d'un compteur PERSISTÉ : une troisième clé (« parties terminées »,
		   « meilleure grille », « dernier jour joué »). Ce contrôle n'interdit pas de
		   compter, il interdit de SE SOUVENIR — et sans mémoire, il n'y a ni palier,
		   ni record, ni série. Une clé de plus se déclare ICI, avec sa raison. */
		existe(ETAT);
		const src = code(ETAT) ?? '';
		const cles = [...src.matchAll(/export const (CLE_[A-Z_]+)/g)].map((m) => m[1]).sort();
		expect(cles).toEqual(['CLE_CALCUDOKU_INITIE', 'CLE_CALCUDOKU_PARTIE']);
	});
});

describe('#667 critères 47 et 54 — aucun score, aucune alimentation de l’économie', () => {
	it('critère 47 : ni `enregistrerScore`, ni `meilleurScore`, nulle part', () => {
		/* `meilleurScore` est une brique disponible, pas obligatoire. La lire
		   quelque part signifierait qu'un nombre présenté comme un record existe :
		   or tout ce qui pourrait en faire office ici est une mesure de vitesse ou un
		   compte de coups, tous deux écartés au critère 46. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			doitEviter(f, 'enregistrerScore', /\benregistrerScore\b/);
			doitEviter(f, 'meilleurScore', /\bmeilleurScore\b/);
		}
	});

	it('critère 54 : ni XP, ni étoile, ni médaille, ni trophée, ni statistique de leçon', () => {
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
				['recordRun', /\brecordRun\b/],
				['recordSessionActivity', /\brecordSessionActivity\b/],
				['announceRewards', /\bannounceRewards\b/],
			] as const) {
				doitEviter(f, nom, motif);
			}
		}
	});

	it('critère 3 : le jeu ne lit jamais la classe du profil', () => {
		/* « Le jeu est identique pour toutes les classes. » L'arbitrage du 2026-09-11
		   a écarté la variante où le jeu d'opérations dépendrait de la classe ; ce
		   qui la rend tenable, c'est le critère 12. Le seul moyen sûr de garantir que
		   deux enfants de classes différentes voient le MÊME jeu, c'est que rien du
		   jeu ne sache ce qu'est une classe. */
		for (const f of TOUS) existe(f);
		for (const f of TOUS) {
			doitEviter(f, 'niveauActif', /\bniveauActif\b/);
			doitEviter(f, 'getNiveauReference', /\bgetNiveauReference\b/);
			doitEviter(f, 'SchoolLevel', /\bSchoolLevel\b/);
		}
	});
});

describe('#667 critères 8, 46 et 51 — aucune horloge, aucun aléa caché', () => {
	it('critère 51 : la logique du calcudoku ignore complètement le calendrier', () => {
		/* « Rien ne se périme et rien ne se perd en ne jouant pas. » Une grille du
		   jour ou une série de jours consécutifs a besoin d'une date : sans horloge
		   dans ces deux modules, ni l'une ni l'autre ne peut exister. Le corollaire
		   sert aussi le critère 8 : un tirage qui lirait l'heure ne serait pas une
		   fonction pure de son générateur, et aucun invariant de
		   `calcudoku.test.ts` ne serait reproductible. */
		for (const f of [JEU, ETAT]) {
			existe(f);
			doitEviter(f, 'new Date', /new\s+Date\b/);
			doitEviter(f, 'Date.now', /Date\.now\b/);
			doitEviter(f, 'jourLocal', /\bjourLocal\b/);
			doitEviter(f, 'todayStr', /\btodayStr\b/);
			doitEviter(f, 'getStreak', /\bgetStreak\b/);
		}
	});

	it('critère 8 : le tirage n’a pas d’autre source d’aléa que son générateur', () => {
		// `calcudoku.test.ts` espionne `Math.random` à l'exécution ; ici on attrape le
		// cas où l'aléa serait tiré à l'INITIALISATION du module, hors de tout appel.
		existe(JEU);
		doitEviter(JEU, 'Math.random', /Math\.random\b/);
	});

	it('critère 46 : ni chronomètre, ni compte à rebours, ni minuteur dans le runner', () => {
		/* Le temps de jeu du plafond est mesuré par `jeux-ecran.ts`, pas par le
		   runner : celui-ci n'a aucune raison de lire une horloge, et un chronomètre
		   — visible ou non — en aurait besoin. Un enfant dyspraxique dont la lenteur
		   est motrice verrait sinon un obstacle moteur transformé en signal de
		   pression.

		   MOITIÉ SEULEMENT : un compteur de COUPS n'a pas besoin d'horloge, et une
		   jauge « 3 cages sur 6 » (critère 48) non plus. Ces moitiés-là se voient à
		   l'écran, donc en Playwright. */
		existe(RUNNER);
		doitEviter(RUNNER, 'setInterval', /\bsetInterval\b/);
		doitEviter(RUNNER, 'Date.now', /Date\.now\b/);
		doitEviter(RUNNER, 'performance.now', /performance\.now\b/);
	});
});

describe('#667 critère 52 — aucun indice, aucun badge de performance', () => {
	it('critère 52 : rien dans le runner ne révèle une case', () => {
		/* Un bouton qui révèle une case remplacerait le calcul par la demande, et le
		   jeu n'a de toute façon aucune monnaie pour le « payer » (critère 54). La
		   marque la plus sûre côté code : le runner n'a aucune raison de RÉSOUDRE la
		   grille — la fin de partie se lit sur `grilleTerminee`, et c'est le
		   générateur, pas l'interface, qui vérifie qu'une grille est finissable.

		   Si l'implémentation a un besoin légitime du solveur dans le runner, la
		   règle n'est pas à assouplir en silence : l'écrire ICI avec sa raison. */
		existe(RUNNER);
		doitEviter(RUNNER, 'resoudreParDeductionElementaire', /\bresoudreParDeductionElementaire\b/);
		doitEviter(RUNNER, 'compterSolutions', /\bcompterSolutions\b/);
		doitEviter(RUNNER, 'un indice', /\bindice/i);
		doitEviter(RUNNER, 'révéler', /\brevele/i);
	});
});

describe('#667 critère 26 — le signalement n’emprunte pas le registre des corrections', () => {
	it('critère 26 : ni `--ko`, ni `.mark.correct`, ni `.mark.wrong` dans la feuille', () => {
		/* Cas d'échec littéral : « une classe ou un token de la famille des marques
		   de correction apparaît dans le rendu du jeu ». Le jeu ne corrige pas, il
		   signale : emprunter le rouge et le vert des exercices ferait porter deux
		   sens à une même couleur selon l'écran.

		   MOITIÉ SEULEMENT, et c'est important : que le registre `--warn` soit
		   effectivement employé, que le signalement porte DEUX canaux (critère 27) et
		   que le contour de cage se distingue du trait de région du sudoku
		   (critère 29) se jugent à l'œil et au contraste, pas au grep. Les
		   critères 30 et 31 (tokens neufs, mesurés sur les six thèmes) relèvent de
		   `tests/contraste-tokens.test.ts`, qu'il faudra nourrir. */
		existe(FEUILLE);
		const src = lire(FEUILLE) ?? '';
		for (const [nom, motif] of [
			['--ko', /--ko\b/],
			['.mark.correct', /\.mark\.correct/],
			['.mark.wrong', /\.mark\.wrong/],
		] as const) {
			expect({ fichier: FEUILLE, interdit: nom, present: motif.test(src) }).toEqual({
				fichier: FEUILLE,
				interdit: nom,
				present: false,
			});
		}
	});
});

/* ── LE LIBELLÉ ACCESSIBLE D'UNE CASE ────────────────────────────────────── */

/* POURQUOI CE BLOC N'EST PAS STATIQUE, alors que tout ce qui précède l'est.

   Le défaut corrigé ici n'était pas l'absence d'une chaîne dans un fichier :
   c'était une INFORMATION QUI N'ATTEIGNAIT PERSONNE. L'étiquette de cage (`7+`,
   `3↔`) vit dans un `span aria-hidden` ; le libellé de la case, lui, ne disait
   que « ligne 2, colonne 3, vide ». Ce qui EST le jeu n'existait donc pas au
   lecteur d'écran, et ne s'obtenait qu'en activant les seize cases une à une.

   Un `doitContenir(RUNNER, /additionner pour/)` serait vert dès que la chaîne
   traîne quelque part dans le fichier — dans un commentaire, dans une fonction
   morte, dans une phrase qui n'est jamais posée sur une case. Il rougirait par
   ailleurs à la première reformulation, alors même que l'exigence tiendrait. Il
   garderait donc le contraire de ce qu'on lui demande.

   On MONTE donc le vrai runner et on lit les `aria-label` que les vraies cases
   portent. Les deux points de pose (le balisage initial et le repeint) sont
   ainsi éprouvés par l'usage : le second l'est explicitement, après une pose.

   L'INJECTION passe par la grille en cours (`sauverPartie` avant le montage) :
   le runner REPREND cette grille-là, ce qui donne des cages connues sans mocker
   quoi que ce soit — ce dépôt n'emploie nulle part de module mocké.

   CE QUE CE BLOC N'ASSÈRE PAS, et c'est délibéré : aucune FORMULATION exacte.
   « additionner pour 7 » est la phrase d'aujourd'hui, pas l'exigence ; figer la
   phrase ferait rougir le gate le jour où une autre dirait la même chose aussi
   bien. On vérifie donc que l'opération est NOMMÉE (un mot parmi un vocabulaire
   admis), que l'objectif est dit À CÔTÉ d'elle, que l'étendue est dite, et
   qu'aucun glyphe ne s'y substitue. */

/** Les glyphes qui ne se prononcent pas — au mieux ils se taisent, au pire ils
    s'énoncent « flèche gauche droite ».

    La liste est écrite EN CLAIR et pas relue depuis `SYMBOLES` : un gate qui
    prendrait ses interdits dans le module qu'il surveille se tairait le jour où
    un quatrième glyphe y serait ajouté. Elle est donc plus large que l'existant
    (le « − » et le « ± » que le critère 14 a écartés, la division que le
    critère 11 interdit). Le trait d'union ASCII n'y est PAS : il porte aussi les
    mots composés du français, et l'interdire exposerait le gate à rougir sur un
    « c'est-à-dire » parfaitement innocent. */
const GLYPHES = ['+', '−', '±', '×', '÷', '↔', '*'] as const;

/** Le vocabulaire admis pour NOMMER chaque opération. Volontairement large : ce
    qui se garde ici, c'est qu'un mot le dise — pas lequel. Une reformulation
    reste donc libre, un glyphe non. */
const MOTS: Readonly<Record<Operation, string>> = {
	somme: 'addition\\w*|additionn\\w*|somme\\w*|ajout\\w*|plus',
	produit: 'multipli\\w*|produit\\w*|fois|table\\w*',
	difference: 'diff[ée]renc\\w*|soustra\\w*|[ée]cart\\w*|enl[èe]v\\w*|retir\\w*|moins',
};

const operationNommee = (op: Operation): RegExp => new RegExp(MOTS[op], 'i');

/** L'objectif est-il dit AVEC l'opération ? On exige l'adjacence (aucun autre
    chiffre entre les deux) plutôt que la simple présence du nombre : un libellé
    dit déjà « ligne 2, colonne 3 », donc un objectif de 2 ou 3 serait « présent »
    dans une case où il n'aurait jamais été écrit. L'ordre reste libre — « 7 à
    additionner » vaut « additionner pour 7 ». */
const objectifDit = (op: Operation, objectif: number): RegExp =>
	new RegExp(
		`(?:${MOTS[op]})[^0-9]{0,24}\\b${objectif}\\b|\\b${objectif}\\b[^0-9]{0,24}(?:${MOTS[op]})`,
		'i',
	);

/** L'étendue de la cage, en nombre de cases. TOLÉRANCE CONNUE : le nombre est
    attendu en chiffres, juste avant le mot. Une étendue écrite en toutes lettres
    (« cage de deux cases ») ferait rougir ce contrôle sans faute réelle — c'est
    assumé, les libellés de ce jeu écrivent déjà « ligne 2, colonne 3 » en
    chiffres, et il n'y a pas de façon robuste de reconnaître « l'étendue est
    dite » sans s'accrocher à quelque chose. */
const etendueDite = (taille: number): RegExp => new RegExp(`\\b${taille}\\s*cases?\\b`, 'i');

const glyphesDe = (texte: string): string[] => GLYPHES.filter((g) => texte.includes(g));

/** Le texte porté par l'élément LUI-MÊME, sans celui de ses descendants : sinon
    tout ancêtre d'un glyphe paraîtrait en porter un. */
const texteDirect = (el: Element): string =>
	[...el.childNodes]
		.filter((n) => n.nodeType === 3 /* Node.TEXT_NODE */)
		.map((n) => n.textContent ?? '')
		.join('');

/** L'élément est-il soustrait aux technologies d'assistance, lui ou l'un de ses
    ancêtres jusqu'à `racine` ? */
const masqueAuxAT = (el: Element, racine: Element): boolean => {
	let courant: Element | null = el;
	while (courant) {
		if (courant.getAttribute('aria-hidden') === 'true') return true;
		if (courant === racine) return false;
		courant = courant.parentElement;
	}
	return false;
};

/** LA SOLUTION que le témoin a pour unique issue. Un carré latin d'ordre 4,
    vérifiable à l'œil : chaque ligne et chaque colonne portent 1, 2, 3 et 4. Les
    cages ci-dessous en sont TIRÉES, ce qui garantit qu'au moins une solution
    existe ; que ce soit la seule, et qu'on y arrive par déduction élémentaire,
    est mesuré par l'oracle au lieu d'être espéré. */
const SOLUTION_TEMOIN = [1, 2, 3, 4, 2, 4, 1, 3, 3, 1, 4, 2, 4, 3, 2, 1];

/** Une grille témoin, dont les cages sont CHOISIES et non tirées.

    ── CE QUE CETTE GRILLE A DÛ CORRIGER, ET POURQUOI C'EST ÉCRIT ICI ─────────

    Sa première version tenait bien ses invariants de fabrication mais pas ceux
    du JEU : deux solutions, donc aucune obtenue par déduction élémentaire. Elle
    est passée tant que `partieEnCours` ne relisait que la FORME ; le contrôle de
    résolubilité (arbitrage du 2026-09-14) l'a refusée, le runner a tiré sa
    propre grille, et les tests de libellé se sont mis à lire des cages qu'ils ne
    connaissaient pas.

    La cause n'était pas l'ambiguïté, c'en était la CONSÉQUENCE : la cage
    `{ [0,1,2,3], somme 10 }` couvrait une ligne entière, et dans un carré latin
    d'ordre 4 la somme d'une ligne vaut TOUJOURS 10. Elle ne retirait aucune des
    576 grilles possibles — une cage décorative, qui donnait à la grille l'air
    d'être contrainte six fois alors qu'elle ne l'était que cinq. Ajouter une
    troisième case donnée aurait levé l'ambiguïté (mesuré : les cases 4, 7, 8 ou
    11 y suffisent) sans rien dire de ce défaut-là, et aurait de surcroît éloigné
    le témoin des grilles réellement servies, qui en donnent exactement deux.
    C'est donc le découpage qui a changé, et aucune cage ne couvre plus une ligne
    ni une colonne complète.

    ── LES INVARIANTS, TOUS VÉRIFIÉS PAR LES DEUX PRÉALABLES DU BLOC ──────────

    1. Les six cages partitionnent les seize cases, et aucune ne vaut plus de
       quatre cases (le témoin doit rester une grille SERVABLE).
    2. L'objectif d'une cage ne vaut jamais son nombre de cases, sans quoi les
       contrôles « objectif » et « étendue » se confondraient et l'un passerait
       pour l'autre.
    3. Deux cages partagent volontairement l'objectif 7 : deux cages de même
       objectif ne doivent pas se confondre.
    4. Les trois opérations et les trois étendues (2, 3 et 4 cases) sont
       représentées — le vocabulaire et l'étendue se vérifient sur des cas
       distincts, pas sur un seul.
    5. Aucune cage n'est décorative : chacune retire au moins un carré latin.
    6. Une seule solution, et la déduction élémentaire seule y mène. */
const CAGES_TEMOIN: readonly Cage[] = [
	{ cases: [0, 4, 5], operation: 'somme', objectif: 7 },
	{ cases: [1, 2, 3, 6], operation: 'somme', objectif: 10 },
	{ cases: [7, 11], operation: 'produit', objectif: 6 },
	{ cases: [8, 9], operation: 'produit', objectif: 3 },
	{ cases: [10, 14, 15], operation: 'somme', objectif: 7 },
	{ cases: [12, 13], operation: 'difference', objectif: 1 },
];

/** Deux cases données, pour que le contrôle porte AUSSI sur elles : une case
    pré-remplie appartient à une cage comme une autre, et l'oublier priverait
    l'enfant de l'objectif au moment précis où il s'en sert pour déduire. Deux,
    et pas trois : c'est ce que sert `tirerGrille`, et un témoin plus doté que
    les grilles réelles ne les représenterait plus. */
const DONNEES_TEMOIN = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

const partieTemoin = (): Partie => ({
	cages: CAGES_TEMOIN.map((c) => ({ ...c, cases: [...c.cases] })),
	enonce: [...DONNEES_TEMOIN],
	valeurs: [...DONNEES_TEMOIN],
});

const cageTemoinDe = (index: number): Cage => {
	const c = CAGES_TEMOIN.find((cage) => cage.cases.includes(index));
	if (!c) throw new Error(`la grille témoin ne couvre pas la case ${index}`);
	return c;
};

/* ── L'ORACLE QUI JUGE LE TÉMOIN ─────────────────────────────────────────── */

/* POURQUOI UN SOLVEUR ÉCRIT ICI, alors que `partieEnCours` en appelle déjà un.

   Demander au jeu si sa propre grille témoin tient, c'est le juger avec
   lui-même : le jour où son solveur deviendrait plus indulgent, le témoin
   passerait sans que rien ne le dise, et les six tests de libellé qui en
   dépendent redeviendraient complaisants en silence — exactement ce qui vient
   d'arriver, mais à l'envers et sans échec pour le signaler. L'oracle ci-dessous
   ne connaît que les règles du jeu telles que l'issue les énonce : un carré
   latin, et des cages qui tombent juste. Il est court parce qu'il énumère, et
   l'énumération est exhaustive — « une seule solution » y est une certitude.

   Il prend la lecture CAGE-LOCALE (l'issue écarte l'extension croisée de son
   lot) : une cage ne connaît que ses propres cases, et les répétitions y sont
   admises tant que la ligne et la colonne les autorisent par ailleurs. C'est la
   lecture EXIGEANTE — un solveur local réussit MOINS souvent qu'un solveur
   croisé —, donc ce bloc ne peut pas refuser un témoin que le jeu accepterait
   pour cause d'oracle trop fin. */

/** L'ordre du carré, écrit en dur : l'oracle JUGE `COTE`, il ne le suit pas. */
const ORDRE = 4;

/** Les carrés latins d'ordre 4, tous. Leur nombre est vérifié avant tout usage :
    si l'énumération dérive, plus rien de ce qui suit ne veut dire quelque chose. */
const CARRES_LATINS: number[][] = (() => {
	const out: number[][] = [];
	const g = new Array<number>(ORDRE * ORDRE).fill(0);
	const poser = (i: number): void => {
		if (i === g.length) {
			out.push([...g]);
			return;
		}
		const y = Math.floor(i / ORDRE);
		const x = i % ORDRE;
		for (let s = 1; s <= ORDRE; s++) {
			let libre = true;
			for (let k = 0; k < ORDRE && libre; k++) {
				if (k < x && g[y * ORDRE + k] === s) libre = false;
				if (k < y && g[k * ORDRE + x] === s) libre = false;
			}
			if (!libre) continue;
			g[i] = s;
			poser(i + 1);
			g[i] = 0;
		}
	};
	poser(0);
	return out;
})();

/** Ce que vaut une cage, ou `null` si elle ne s'évalue pas encore. */
const resultatCage = (operation: Operation, vals: readonly number[]): number | null => {
	if (vals.some((x) => !x)) return null;
	if (operation === 'somme') return vals.reduce((a, b) => a + b, 0);
	if (operation === 'produit') return vals.reduce((a, b) => a * b, 1);
	return vals.length === 2 ? Math.abs(vals[0] - vals[1]) : null;
};

const cageTombeJuste = (c: Cage, v: readonly number[]): boolean =>
	resultatCage(
		c.operation,
		c.cases.map((i) => v[i] ?? 0),
	) === c.objectif;

/** Les grilles qui satisfont À LA FOIS l'énoncé et toutes les cages. Exhaustif. */
const solutionsDe = (cages: readonly Cage[], enonce: readonly number[]): number[][] =>
	CARRES_LATINS.filter(
		(s) => enonce.every((x, i) => !x || x === s[i]) && cages.every((c) => cageTombeJuste(c, s)),
	);

/** La cage peut-elle ENCORE tomber juste ? Lecture cage-locale : chaque case vide
    y prend n'importe quelle valeur de 1 à 4, indépendamment des autres. */
const cageEncorePossible = (c: Cage, vals: readonly number[]): boolean => {
	const trous = [...vals.keys()].filter((k) => !vals[k]);
	const essai = [...vals];
	const rec = (k: number): boolean => {
		if (k === trous.length) return resultatCage(c.operation, essai) === c.objectif;
		for (let s = 1; s <= ORDRE; s++) {
			essai[trous[k]] = s;
			if (rec(k + 1)) return true;
		}
		essai[trous[k]] = 0;
		return false;
	};
	return rec(0);
};

/** Ne pose que les cases dont UNE seule valeur reste possible, en boucle, et rend
    le point fixe — rempli, ou non. C'est « la déduction élémentaire seule »,
    réécrite d'après son énoncé. */
const deductionElementaire = (cages: readonly Cage[], enonce: readonly number[]): number[] => {
	const g = [...enonce];
	const candidats = (i: number): number[] => {
		const y = Math.floor(i / ORDRE);
		const x = i % ORDRE;
		const c = cages.find((cage) => cage.cases.includes(i));
		const out: number[] = [];
		for (let s = 1; s <= ORDRE; s++) {
			let ok = true;
			for (let k = 0; k < ORDRE; k++) {
				if (k !== x && g[y * ORDRE + k] === s) ok = false;
				if (k !== y && g[k * ORDRE + x] === s) ok = false;
			}
			if (ok && c) {
				ok = cageEncorePossible(
					c,
					c.cases.map((j) => (j === i ? s : (g[j] ?? 0))),
				);
			}
			if (ok) out.push(s);
		}
		return out;
	};
	for (;;) {
		let pose = false;
		for (let i = 0; i < g.length; i++) {
			if (g[i]) continue;
			const seuls = candidats(i);
			if (seuls.length === 1) {
				g[i] = seuls[0];
				pose = true;
			}
		}
		if (!pose) return g;
	}
};

let hote: HTMLElement;

const prendreLeJeu = (): void => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	ajouterJeu('calcudoku');
	hote = document.createElement('div');
	document.body.appendChild(hote);
};

/** Monte le jeu et rend sa grille. Le plafond du jour et la possession sont
    l'affaire du cadre, pas du test : `monterJeu` rend `false` si quoi que ce
    soit manque, et l'échec est alors NOMMÉ plutôt que déguisé en « aucune case
    trouvée ». */
const monterEtRendreLaGrille = (): HTMLElement => {
	expect(monterJeu('calcudoku', hote), 'le jeu n’a pas pu être monté').toBe(true);
	const grille = hote.querySelector<HTMLElement>('#calcudokuGrille');
	expect(grille, 'aucune grille rendue').not.toBeNull();
	const cases = grille?.querySelectorAll('.calcudoku-case').length ?? 0;
	expect(cases, 'la grille ne porte pas ses seize cases').toBe(COTE * COTE);
	return grille as HTMLElement;
};

const libelleDe = (grille: HTMLElement, index: number): string =>
	grille
		.querySelector<HTMLElement>(`.calcudoku-case[data-index="${index}"]`)
		?.getAttribute('aria-label') ?? '';

const cliquer = (racine: HTMLElement, selecteur: string): void => {
	const el = racine.querySelector<HTMLElement>(selecteur);
	expect(el, `rien à cliquer pour « ${selecteur} »`).not.toBeNull();
	el?.click();
};

describe('#667 — l’oracle de la grille témoin MORD', () => {
	/* Les préalables du bloc suivant sont passés au VERT dès leur écriture, la
	   grille témoin étant déjà réparée quand ils ont été posés. Un contrôle qui n'a
	   jamais rien refusé ne prouve rien de lui-même : on l'éprouve donc sur la
	   grille DÉFECTUEUSE, celle qui a réellement existé dans ce fichier.

	   Ces cages ne sont pas un attendu : c'est un contre-exemple, et il n'a pas à
	   suivre les retouches du témoin. */
	const TEMOIN_DEFECTUEUX: readonly Cage[] = [
		{ cases: [0, 1, 2, 3], operation: 'somme', objectif: 10 },
		{ cases: [4, 8], operation: 'produit', objectif: 6 },
		{ cases: [5, 6], operation: 'difference', objectif: 3 },
		{ cases: [7, 11], operation: 'produit', objectif: 6 },
		{ cases: [9, 12, 13], operation: 'somme', objectif: 8 },
		{ cases: [10, 14, 15], operation: 'somme', objectif: 7 },
	];

	it('une cage posée sur une ligne entière ne contraint RIEN, et le contrôle le voit', () => {
		/* Le fait de combinatoire qui explique tout le reste : dans un carré latin
		   d'ordre 4, une ligne porte 1, 2, 3 et 4, donc sa somme vaut 10, toujours.
		   Une cage « 10+ » sur une ligne est satisfaite par les 576 grilles. */
		const ligneEntiere: Cage = { cases: [0, 1, 2, 3], operation: 'somme', objectif: 10 };
		expect(CARRES_LATINS.filter((s) => !cageTombeJuste(ligneEntiere, s)).length).toBe(0);
		expect(new Set(CARRES_LATINS.map((s) => s[0] + s[1] + s[2] + s[3]))).toEqual(new Set([10]));
	});

	it('la grille d’origine avait DEUX solutions, et le contrôle d’unicité les compte', () => {
		expect(solutionsDe(TEMOIN_DEFECTUEUX, DONNEES_TEMOIN).map((s) => s.join(''))).toEqual([
			'1234241331424321',
			'1234341221434321',
		]);
	});

	it('et la déduction élémentaire y calait, ce que l’unicité seule n’aurait pas dit', () => {
		/* La distinction qui compte : le contrôle de résolubilité ne demande pas
		   « une seule solution » mais « on y arrive en ne posant que des cases
		   forcées ». Sur la grille d'origine, elle n'en posait aucune au-delà des
		   deux cases données. */
		const cale = deductionElementaire(TEMOIN_DEFECTUEUX, DONNEES_TEMOIN);
		expect(cale.filter((x) => x !== 0).length).toBeLessThan(COTE * COTE);
	});

	it('l’oracle accepte en revanche la grille réparée : il refuse, il ne bloque pas', () => {
		// L'autre sens, sans quoi un oracle qui dirait « non » à tout paraîtrait
		// mordre alors qu'il ne garderait rien.
		expect(solutionsDe(CAGES_TEMOIN, DONNEES_TEMOIN).length).toBe(1);
		expect(deductionElementaire(CAGES_TEMOIN, DONNEES_TEMOIN).filter((x) => x !== 0).length).toBe(
			COTE * COTE,
		);
	});
});

describe('#667 — les contrôles du libellé MORDENT', () => {
	/* Les tests qui suivent sont passés au VERT du premier coup, le correctif étant
	   déjà livré. Un test qui n'a jamais échoué ne prouve rien de lui-même : on
	   éprouve donc les trois contrôles sur les formes DÉFECTUEUSES, à commencer par
	   celle que la relecture d'accessibilité a réellement trouvée.

	   Les chaînes ci-dessous ne sont pas des libellés attendus — ce sont des
	   contre-exemples. Aucune n'a à être mise à jour si la formulation change. */

	const AVANT_CORRECTIF = 'ligne 2, colonne 3, vide';

	it('le défaut d’origine — la case ne dit que sa position — est refusé trois fois', () => {
		expect(operationNommee('somme').test(AVANT_CORRECTIF)).toBe(false);
		expect(objectifDit('somme', 7).test(AVANT_CORRECTIF)).toBe(false);
		expect(etendueDite(2).test(AVANT_CORRECTIF)).toBe(false);
	});

	it('la correction la plus tentante — recopier l’étiquette — est refusée', () => {
		// `libelleCage` rend « 7+ » ou « 3↔ » : un glyphe, et pas un mot.
		for (const faux of [`${AVANT_CORRECTIF}, 7+`, `${AVANT_CORRECTIF}, 3↔`]) {
			expect(glyphesDe(faux), faux).not.toEqual([]);
			expect(operationNommee('somme').test(faux), faux).toBe(false);
		}
	});

	it('un objectif sans étendue, ou une étendue sans objectif, ne passe pas', () => {
		const sansEtendue = `${AVANT_CORRECTIF}, additionner pour 7`;
		expect(operationNommee('somme').test(sansEtendue)).toBe(true);
		expect(etendueDite(2).test(sansEtendue), 'l’étendue manque et passe quand même').toBe(false);

		const sansObjectif = `${AVANT_CORRECTIF}, cage de 2 cases : additionner`;
		expect(etendueDite(2).test(sansObjectif)).toBe(true);
		expect(
			objectifDit('somme', 3).test(sansObjectif),
			'le « 3 » de « colonne 3 » passe pour l’objectif',
		).toBe(false);
	});

	it('en revanche, une reformulation qui dit bien les trois choses est acceptée', () => {
		/* L'autre sens, sans quoi le gate serait un carcan : ces deux phrases ne sont
		   pas celles du code, et doivent passer. C'est ce qui autorise une réécriture
		   de la formulation sans toucher au gate. */
		for (const bon of [
			'ligne 2, colonne 3, vide, cage de 2 cases : additionner pour 7',
			'ligne 2, colonne 3, vide, 7 à obtenir en additionnant, sur une cage de 2 cases',
		]) {
			expect(operationNommee('somme').test(bon), bon).toBe(true);
			expect(objectifDit('somme', 7).test(bon), bon).toBe(true);
			expect(etendueDite(2).test(bon), bon).toBe(true);
			expect(glyphesDe(bon), bon).toEqual([]);
		}
	});

	it('un texte masqué par un ancêtre `aria-hidden` compte pour masqué, pas le reste', () => {
		// Le contrôle de l'étiquette remonte la chaîne des ancêtres : sans cela, un
		// glyphe déplacé d'un cran passerait pour exposé (ou pour masqué à tort).
		const racine = document.createElement('div');
		racine.innerHTML =
			'<span class="a" aria-hidden="true"><b class="dedans">7+</b></span><span class="b">3↔</span>';
		const dedans = racine.querySelector('.dedans') as Element;
		const expose = racine.querySelector('.b') as Element;
		expect(masqueAuxAT(dedans, racine)).toBe(true);
		expect(masqueAuxAT(expose, racine)).toBe(false);
		expect(texteDirect(racine.querySelector('.a') as Element), 'le texte des enfants a fuité').toBe(
			'',
		);
	});
});

describe('#667 — le libellé accessible d’une case dit l’objectif de sa cage', () => {
	beforeEach(() => {
		prendreLeJeu();
		sauverPartie(partieTemoin());
	});

	afterEach(() => {
		demonterJeuActif();
		hote.remove();
	});

	it('préalable : la grille témoin est BIEN FORMÉE, et ses contrôles ne se recouvrent pas', () => {
		// Sans ce test, une retouche de la grille témoin rendrait les suivants
		// complaisants sans que rien ne le dise.
		const couvertes = CAGES_TEMOIN.flatMap((c) => c.cases).sort((a, b) => a - b);
		expect(couvertes, 'les cages ne partitionnent pas les seize cases').toEqual([
			...Array(COTE * COTE).keys(),
		]);
		for (const c of CAGES_TEMOIN) {
			expect(
				c.objectif,
				`cage ${c.cases.join('-')} : objectif et étendue confondus, les deux contrôles n’en feraient plus qu’un`,
			).not.toBe(c.cases.length);
		}

		/* Deux cages de même objectif ne doivent pas se confondre : encore faut-il
		   que le témoin en porte deux. C'était une INTENTION écrite en commentaire,
		   donc rien du tout — une retouche l'aurait effacée sans bruit. */
		const objectifs = CAGES_TEMOIN.map((c) => c.objectif);
		expect(
			objectifs.length - new Set(objectifs).size,
			'aucune paire de cages ne partage un objectif : le cas ambigu n’est plus représenté',
		).toBeGreaterThanOrEqual(1);

		/* Les trois opérations et les trois étendues : sans elles, le vocabulaire
		   admis et le contrôle d'étendue ne seraient éprouvés que sur un seul cas. */
		expect(new Set(CAGES_TEMOIN.map((c) => c.operation))).toEqual(
			new Set(['somme', 'difference', 'produit']),
		);
		expect(new Set(CAGES_TEMOIN.map((c) => c.cases.length))).toEqual(new Set([2, 3, 4]));
	});

	it('préalable : l’ORACLE de ce fichier énumère bien les 576 carrés latins d’ordre 4', () => {
		// Il juge les deux exigences du test suivant : s'il dérive, elles ne valent
		// plus rien. Le nombre est un fait de combinatoire, pas une mesure du code.
		expect(CARRES_LATINS.length).toBe(576);
		expect(
			CARRES_LATINS.some((s) => s.every((x, i) => x === SOLUTION_TEMOIN[i])),
			'la solution annoncée du témoin n’est même pas un carré latin',
		).toBe(true);
	});

	it('préalable : la grille témoin a UNE solution, et la déduction élémentaire seule y mène', () => {
		/* Les deux exigences que le contrôle de résolubilité de `partieEnCours`
		   oppose à toute grille servie — et une grille témoin injectée par le chemin
		   de reprise EST une grille servie. Elles sont mesurées ici par l'oracle, pas
		   constatées sur le silence du runner : une grille refusée ne fait pas échouer
		   la reprise, elle fait tirer une AUTRE grille, et les tests de libellé
		   partiraient alors lire des cages inconnues.

		   Les deux sont vérifiées séparément bien que la seconde implique la
		   première : quand un jour l'une tombera, l'échec dira laquelle. */
		const enonce = [...DONNEES_TEMOIN];
		expect(
			enonce.every((x, i) => !x || x === SOLUTION_TEMOIN[i]),
			'une case donnée contredit la solution annoncée',
		).toBe(true);

		const sols = solutionsDe(CAGES_TEMOIN, enonce);
		expect(
			sols.map((s) => s.join('')),
			'la grille témoin n’a pas exactement une solution',
		).toEqual([SOLUTION_TEMOIN.join('')]);

		const deduite = deductionElementaire(CAGES_TEMOIN, enonce);
		expect(
			deduite.filter((x) => x !== 0).length,
			`la déduction élémentaire cale : « ${deduite.join(',')} »`,
		).toBe(COTE * COTE);
		expect(deduite, 'la déduction élémentaire aboutit à une AUTRE grille').toEqual(SOLUTION_TEMOIN);

		/* Aucune cage décorative. Le défaut d'origine : une cage posée sur une ligne
		   entière, dont la somme vaut 10 dans TOUS les carrés latins — elle donnait au
		   témoin l'air d'être contraint six fois quand il ne l'était que cinq. */
		for (const c of CAGES_TEMOIN) {
			const elimines = CARRES_LATINS.filter((s) => !cageTombeJuste(c, s)).length;
			expect(
				elimines,
				`cage ${c.cases.join('-')} : elle est satisfaite par les 576 carrés latins, donc elle ne contraint rien`,
			).toBeGreaterThan(0);
		}
	});

	it('préalable : le jeu REPREND la grille témoin au lieu d’en tirer une autre', () => {
		/* L'autre moitié, et elle est indispensable : une grille impeccable que la
		   relecture refuserait tout de même (forme inattendue, contrôle nouveau)
		   ferait tirer une grille quelconque au runner, et les tests suivants
		   liraient des cages qu'ils ne connaissent pas — verts ou rouges pour des
		   raisons sans rapport avec ce qu'ils gardent. */
		expect(
			partieEnCours(),
			'la grille témoin est refusée à la relecture : le runner en tirerait une autre',
		).not.toBeNull();
		expect(partieEnCours()?.cages.map((c) => c.cases.join('-'))).toEqual(
			CAGES_TEMOIN.map((c) => c.cases.join('-')),
		);
	});

	it('l’opération est NOMMÉE sur chaque case d’une cage, jamais laissée au glyphe', () => {
		const grille = monterEtRendreLaGrille();
		for (const cage of CAGES_TEMOIN) {
			for (const i of cage.cases) {
				const libelle = libelleDe(grille, i);
				expect(libelle, `case ${i}, cage « ${cage.operation} »`).toMatch(
					operationNommee(cage.operation),
				);
			}
		}
	});

	it('l’objectif de la cage est dit, et dit à côté de son opération', () => {
		const grille = monterEtRendreLaGrille();
		for (const cage of CAGES_TEMOIN) {
			for (const i of cage.cases) {
				const libelle = libelleDe(grille, i);
				expect(libelle, `case ${i}, objectif ${cage.objectif}`).toMatch(
					objectifDit(cage.operation, cage.objectif),
				);
			}
		}
	});

	it('l’ÉTENDUE de la cage est dite : « 7 » ne se répartit pas pareil sur deux cases ou sur quatre', () => {
		const grille = monterEtRendreLaGrille();
		for (const cage of CAGES_TEMOIN) {
			for (const i of cage.cases) {
				const libelle = libelleDe(grille, i);
				expect(libelle, `case ${i}, cage de ${cage.cases.length} cases`).toMatch(
					etendueDite(cage.cases.length),
				);
			}
		}
	});

	it('aucun glyphe d’opération dans un libellé de case', () => {
		// Cas d'échec littéral : « le libellé emprunte l'étiquette visuelle », ce qui
		// est la correction la plus tentante et la moins audible.
		const grille = monterEtRendreLaGrille();
		for (let i = 0; i < COTE * COTE; i++) {
			const libelle = libelleDe(grille, i);
			expect(glyphesDe(libelle), `case ${i} : « ${libelle} »`).toEqual([]);
		}
	});

	it('une case DONNÉE porte l’objectif de sa cage comme les autres', () => {
		/* Elle n'est pas inscriptible, mais c'est justement sur elle que l'enfant
		   s'appuie pour déduire : la priver de l'objectif rendrait le libellé le plus
		   utile le plus pauvre. */
		const grille = monterEtRendreLaGrille();
		for (const i of [0, 15]) {
			const cage = cageTemoinDe(i);
			const libelle = libelleDe(grille, i);
			expect(libelle, `case donnée ${i}`).toMatch(operationNommee(cage.operation));
			expect(libelle, `case donnée ${i}`).toMatch(objectifDit(cage.operation, cage.objectif));
			expect(libelle, `case donnée ${i}`).toMatch(etendueDite(cage.cases.length));
		}
	});

	it('après une pose, le libellé dit la nouvelle valeur SANS perdre l’objectif de la cage', () => {
		/* Le second point de pose du libellé, celui du repeint. Une reprise d'écriture
		   qui ne toucherait que celui-là (ou que l'autre) laisserait le défaut revenir
		   à moitié — et à moitié pendant que l'enfant joue, c'est-à-dire là où ça
		   compte. */
		const grille = monterEtRendreLaGrille();
		const cage = cageTemoinDe(5);
		const avant = libelleDe(grille, 5);
		expect(avant, 'la case 5 devrait être vide au départ').not.toMatch(/\b4\b/);

		cliquer(grille, '.calcudoku-case[data-index="5"]');
		cliquer(hote, '.calcudoku-nombre[data-valeur="4"]');

		const apres = libelleDe(grille, 5);
		expect(apres, 'la valeur posée n’est pas annoncée').toMatch(/\b4\b/);
		expect(apres, 'l’opération a disparu au repeint').toMatch(operationNommee(cage.operation));
		expect(apres, 'l’objectif a disparu au repeint').toMatch(
			objectifDit(cage.operation, cage.objectif),
		);
		expect(apres, 'l’étendue a disparu au repeint').toMatch(etendueDite(cage.cases.length));
		expect(glyphesDe(apres), `« ${apres} »`).toEqual([]);
	});

	it('l’étiquette visuelle porte le glyphe, et reste masquée aux technologies d’assistance', () => {
		/* Les deux moitiés comptent. La seconde seule serait vide de sens : si
		   l'étiquette disparaissait du rendu, « toutes les étiquettes sont masquées »
		   resterait vrai sans rien garder. La première dit donc que le glyphe est bien
		   là, à l'écran, une fois par cage. */
		const grille = monterEtRendreLaGrille();
		const etiquettes = [...grille.querySelectorAll<HTMLElement>('.calcudoku-etiquette')];
		expect(etiquettes.length, 'une étiquette visible par cage').toBe(CAGES_TEMOIN.length);
		for (const e of etiquettes) {
			expect(glyphesDe(e.textContent ?? ''), `étiquette « ${e.textContent} »`).not.toEqual([]);
		}
		/* Pris par le GLYPHE et non par la classe : le jour où il changerait de
		   porteur, c'est lui qu'il faut continuer de taire, pas ce `span`-là. */
		for (const el of grille.querySelectorAll('*')) {
			if (glyphesDe(texteDirect(el)).length === 0) continue;
			expect(masqueAuxAT(el, grille), `« ${texteDirect(el)} » est lu par le lecteur d’écran`).toBe(
				true,
			);
		}
	});
});

describe('#667 — l’objectif de cage est dit sur des grilles RÉELLEMENT tirées', () => {
	/* La grille témoin prouve que le libellé est juste sur des cages choisies ; elle
	   ne dit rien de celles que le tirage produit vraiment. Ce bloc-ci monte le jeu
	   sur de vraies grilles et relit LEURS cages depuis la partie rangée — la grille
	   sert d'ENTRÉE, l'attendu reste dérivé de l'exigence. */

	beforeEach(prendreLeJeu);

	afterEach(() => {
		demonterJeuActif();
		hote.remove();
	});

	it('chaque case de chaque cage annonce opération, objectif et étendue, sans glyphe', () => {
		for (let essai = 0; essai < 10; essai++) {
			const grille = monterEtRendreLaGrille();
			const p = partieEnCours();
			expect(p, `essai ${essai} : la grille tirée n’a pas été rangée`).not.toBeNull();
			const cages = p?.cages ?? [];
			expect(cages.length, `essai ${essai} : une grille sans cage`).toBeGreaterThan(0);
			for (const cage of cages) {
				for (const i of cage.cases) {
					const libelle = libelleDe(grille, i);
					const ou = `essai ${essai}, case ${i} : « ${libelle} »`;
					expect(libelle, ou).toMatch(operationNommee(cage.operation));
					expect(libelle, ou).toMatch(objectifDit(cage.operation, cage.objectif));
					expect(libelle, ou).toMatch(etendueDite(cage.cases.length));
					expect(glyphesDe(libelle), ou).toEqual([]);
				}
			}
			demonterJeuActif();
			hote.innerHTML = '';
		}
	});
});
