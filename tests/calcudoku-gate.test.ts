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
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { JEUX, type JeuDef } from '../src/core/jeux/catalogue';

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
		expect(jeu()?.competence).toBe('Sommes, différences et tables de multiplication');
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
