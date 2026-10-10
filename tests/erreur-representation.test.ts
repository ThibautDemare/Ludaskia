/* ============================================================
   Représentations composites du journal d'erreurs (#391) — logique pure :
   opération posée (agrégation des cellules), rangement, tableau de conversion,
   appariement, tri par thème, résolution du libellé d'une liste d'orthographe, et
   mise en forme de la réponse attendue révélée au parent (#501).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	analyserResultatPosee,
	ordreErreur,
	nombreTableauSaisi,
	pairesErreur,
	motsMalClasses,
	attendueItem,
	attendueIntervalle,
	enonceClicMotJournal,
	enonceDroiteJournal,
	enonceProblemeLisible,
	etapesLisibles,
	type CellulePosee,
	type CelluleTableau,
	type LienPropose,
} from '../src/core/erreur-representation';
import { labelLeconOrtho } from '../src/core/orthographe/lessons';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import type { Exercise } from '../src/core/exercise';
import { getLessonById, type SchoolLevel } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';

const cell = (pos: number, saisie: string, correct: boolean): CellulePosee => ({
	pos,
	saisie,
	correct,
});

/* Cases d'un tableau façon runner : liste PLATE « unité:chiffre », une entrée par
   chiffre saisi (la colonne de tête peut donc en fournir deux). */
const cases = (...specs: string[]): CelluleTableau[] =>
	specs.map((s) => {
		const [unite, valeur] = s.split(':');
		return { unite, valeur };
	});

describe('analyserResultatPosee (opération posée → une entrée)', () => {
	it('résultat entièrement juste → non journalisé', () => {
		const r = analyserResultatPosee([cell(0, '4', true), cell(1, '2', true), cell(2, '3', true)]);
		expect(r.journaliser).toBe(false);
	});

	it('grille vierge (aucun chiffre saisi) → non journalisé', () => {
		const r = analyserResultatPosee([cell(0, '', false), cell(1, '', false)]);
		expect(r.journaliser).toBe(false);
	});

	it('résultat faux et complet → journalisé, chiffres assemblés dans l’ordre des positions', () => {
		// positions données en désordre : la reconstruction doit trier par `pos`.
		const r = analyserResultatPosee([cell(2, '3', false), cell(0, '4', true), cell(1, '1', false)]);
		expect(r.journaliser).toBe(true);
		expect(r.donnee).toBe('413');
	});

	it('résultat partiellement saisi (des cellules vides) → « (incomplet) »', () => {
		const r = analyserResultatPosee([cell(0, '4', true), cell(1, '', false), cell(2, '3', false)]);
		expect(r.journaliser).toBe(true);
		expect(r.donnee).toBe('(incomplet)');
	});
});

describe('ordreErreur (rangement d’une suite)', () => {
	it('joint la suite proposée et la suite attendue par « , »', () => {
		expect(ordreErreur(['banane', 'abricot', 'cerise'], ['abricot', 'banane', 'cerise'])).toEqual({
			donnee: 'banane, abricot, cerise',
			attendue: 'abricot, banane, cerise',
		});
	});

	/* Nature « nombres » (#448) : le parent lit ces deux chaînes dans l'espace encadrant,
	   HORS de l'application. Jointes par la virgule, « donné : 95, 104, 98 » se lit comme
	   des nombres à virgule — c'est le séparateur DÉCIMAL en français. D'où le
	   point-virgule. Appelé ici DIRECTEMENT avec la nature : sans ce test, un retour au
	   séparateur unique ne serait vu par aucune suite (les autres chemins de #448
	   n'appellent pas `ordreErreur`). */
	it('nature « nombres » : joint par « ; », jamais par la virgule décimale', () => {
		const r = ordreErreur(['95', '104', '98'], ['95', '98', '104'], 'nombres');
		expect(r).toEqual({ donnee: '95 ; 104 ; 98', attendue: '95 ; 98 ; 104' });
		expect(r.donnee).not.toContain(',');
		expect(r.attendue).not.toContain(',');
	});

	it('nature « mots » explicite = comportement par défaut (virgule)', () => {
		const propose = ['chien', 'chat'];
		const ordre = ['chat', 'chien'];
		expect(ordreErreur(propose, ordre, 'mots')).toEqual(ordreErreur(propose, ordre));
	});

	it('rangée laissée vide (aucune tuile posée) : réponse donnée vide, attendue lisible', () => {
		// Le runner passe `[]` quand le widget n'expose pas de réponse : pas de plantage,
		// et le parent voit quand même ce qui était attendu.
		expect(ordreErreur([], ['95', '98'], 'nombres')).toEqual({
			donnee: '',
			attendue: '95 ; 98',
		});
	});
});

describe('nombreTableauSaisi (tableau de conversion relu dans l’unité cible)', () => {
	it('cible = dernière colonne (grande→petite) : aucune virgule', () => {
		// « 3 km = ? m » : les 4 colonnes km·hm·dam·m, cible en bout de tableau.
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:0', 'm:0'), 'm')).toBe('3000');
	});

	it('cible = colonne de tête (petite→grande) : la virgule suit la tête', () => {
		// « 1500 m = ? km » → 1,5 km. La virgule est bien APRÈS la tête : posée une colonne
		// plus loin, la même table se lirait « 15 », et deux colonnes plus loin « 150 ».
		expect(nombreTableauSaisi(cases('km:1', 'hm:5', 'dam:0', 'm:0'), 'km')).toBe('1,5');
	});

	it('cible au milieu du tableau : virgule après SA colonne, pas après la première', () => {
		// « 253 cm = ? dm » sur l'empan m·dm·cm → 25,3 dm (et non 2,53 : virgule après la tête).
		expect(nombreTableauSaisi(cases('m:2', 'dm:5', 'cm:3'), 'dm')).toBe('25,3');
		// Même colonne cible, dernier rang à zéro : la valeur est entière, donc rien ne traîne
		// derrière une virgule (« 25,0 » n'est pas ce qu'un enfant écrit). Une virgule posée une
		// colonne trop tôt donnerait « 2,5 » : le décalage reste visible.
		expect(nombreTableauSaisi(cases('m:2', 'dm:5', 'cm:0'), 'dm')).toBe('25');
	});

	it('tête à 2 chiffres et cible en tête : virgule après le DERNIER chiffre de la tête', () => {
		// « 1250 cm = ? m » : la tête « m » porte 12 → 12,5 m (et non 1,25).
		expect(nombreTableauSaisi(cases('m:1', 'm:2', 'dm:5', 'cm:0'), 'm')).toBe('12,5');
	});

	it('tête à 2 chiffres et cible en bout : les chiffres se suivent sans virgule', () => {
		// « 12 km = ? m » → 12000 m.
		expect(nombreTableauSaisi(cases('km:1', 'km:2', 'hm:0', 'dam:0', 'm:0'), 'm')).toBe('12000');
	});

	it('chiffre parasite dans une colonne de transit : il ressort dans la réponse donnée', () => {
		// C'est l'erreur à montrer au parent. « 3 km = ? m » avec un 7 glissé dans les dam :
		// la réponse donnée doit dire 3070 (et non 3000, la valeur juste).
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:7', 'm:0'), 'm')).toBe('3070');
		// Même table relue dans l'autre sens (« 3000 m = ? km ») : le 7 parasite pèse un
		// centième de km, donc la réponse donnée porte une virgule alors que l'écran n'en
		// affiche pas (réponse attendue entière). C'est VOULU : « 3070 km » induirait le
		// parent en erreur, « 3,07 km » face à « 3 km » montre exactement l'écart. Le ménage
		// des zéros sans valeur (#711) n'emporte QUE les zéros de queue : le 7 reste.
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:7', 'm:0'), 'km')).toBe('3,07');
	});

	/* Tranche de colonnes FIXE (#711) : le tableau affiche toute l'échelle du niveau, donc la
	   colonne cible traîne presque toujours des colonnes à zéro des deux côtés. Elles n'ont pas
	   à ressortir dans le journal — le parent y lirait un nombre que son enfant n'a pas écrit. */
	it('colonnes à zéro autour de la cible : ni zéros de tête, ni virgule en trop (#711)', () => {
		// « 3 m = ? cm » sur l'échelle complète km→mm : trois colonnes à zéro avant la cible,
		// une après → « 300 », et surtout pas « 000300,0 ».
		const table = cases('km:0', 'hm:0', 'dam:0', 'm:3', 'dm:0', 'cm:0', 'mm:0');
		expect(nombreTableauSaisi(table, 'cm')).toBe('300');
		// La même table relue plus haut dans l'échelle vaut moins de 1 km : le zéro des unités
		// PORTE la valeur, lui, et reste écrit (« 0,003 », pas « ,003 »).
		expect(nombreTableauSaisi(table, 'km')).toBe('0,003');
	});

	it('tableau entièrement à zéro : se lit « 0 », pas « 000 » ni une chaîne vide', () => {
		expect(nombreTableauSaisi(cases('m:0', 'dm:0', 'cm:0'), 'dm')).toBe('0');
	});

	it('unité cible absente des cases : chiffres bruts, sans virgule inventée', () => {
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:0', 'm:0'), 'mm')).toBe('3000');
	});

	it('aucune case : chaîne vide (pas d’exception)', () => {
		expect(nombreTableauSaisi([], 'm')).toBe('');
	});

	it('une seule colonne, qui est la cible : le chiffre seul', () => {
		expect(nombreTableauSaisi(cases('m:7'), 'm')).toBe('7');
	});
});

/* ---------- Virgule PLACÉE par l'enfant (#711 lot 4) ----------
   Dans le mode « virgule », l'application ne pose plus la virgule : sa position fait partie
   de la réponse de l'enfant. Le journal encadrant doit donc rendre le nombre RÉELLEMENT
   écrit — virgule comprise — et non la valeur juste relue depuis l'unité demandée. D'où un
   3ᵉ paramètre : l'index PLAT de la case après laquelle l'enfant a posé sa virgule (plat,
   et non un index de colonne : la colonne de tête peut porter deux chiffres).

   Les attendus ci-dessous sont dérivés de la numération de position, pas de la fonction :
   les chiffres du tableau forment un entier D sur n cases ; poser la virgule après la case
   d'indice i revient à lire D / 10^(n-1-i). Un cran de plus = dix fois plus. */
describe('nombreTableauSaisi — virgule placée par l’enfant (#711 lot 4)', () => {
	it('virgule au bon rang : même lecture qu’avec la seule unité demandée', () => {
		// « 253 cm = ? dm » sur l'empan m·dm·cm : la case du dm est la 2ᵉ (indice plat 1).
		const table = cases('m:2', 'dm:5', 'cm:3');
		expect(nombreTableauSaisi(table, 'dm', 1)).toBe('25,3');
		expect(nombreTableauSaisi(table, 'dm', 1)).toBe(nombreTableauSaisi(table, 'dm'));
	});

	it('virgule un cran trop tôt ou trop tard : le journal montre le nombre FAUX', () => {
		// Même table (253 en centièmes de l'unité de tête), virgule attendue après les dm.
		const table = cases('m:2', 'dm:5', 'cm:3');
		expect(nombreTableauSaisi(table, 'dm', 0)).toBe('2,53'); // un cran trop tôt
		expect(nombreTableauSaisi(table, 'dm', 2)).toBe('253'); // un cran trop tard
	});

	it('colonne de tête à 2 chiffres : le paramètre est un index de CASE, pas de colonne', () => {
		// « 1250 cm = ? m » : 4 cases pour 3 colonnes (la tête « m » porte 12). C'est le seul cas
		// où confondre index de case et index de colonne décale la virgule d'un rang — d'où les
		// quatre placements éprouvés ici, un par case. Les quatre se lisent
		// 1,25 / 12,5 / 125 / 1250 — un facteur 10 par cran, y compris à l'intérieur de la tête.
		const table = cases('m:1', 'm:2', 'dm:5', 'cm:0');
		expect(nombreTableauSaisi(table, 'm', 0)).toBe('1,25');
		expect(nombreTableauSaisi(table, 'm', 1)).toBe('12,5');
		expect(nombreTableauSaisi(table, 'm', 2)).toBe('125');
		// Virgule après la DERNIÈRE case : nombre entier, et surtout pas une virgule qui traîne.
		expect(nombreTableauSaisi(table, 'm', 3)).toBe('1250');
	});

	it('la virgule posée PRIME sur l’unité demandée', () => {
		// Même table, unité demandée « cm » (qui couperait après la dernière case) : c'est le
		// geste de l'enfant qui décide, sinon le parent lirait autre chose que l'écran.
		expect(nombreTableauSaisi(cases('m:1', 'm:2', 'dm:5', 'cm:0'), 'cm', 1)).toBe('12,5');
		// Y compris quand l'unité demandée n'a AUCUNE case : le repli « chiffres bruts » ne doit
		// pas avaler la virgule posée.
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:0', 'm:0'), 'mm', 1)).toBe('30');
		// Et le chiffre parasite reste visible derrière la virgule posée (« 3,07 », pas « 3 »).
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:7', 'm:0'), 'm', 0)).toBe('3,07');
	});

	it('zéros sans valeur : nettoyés comme sans le paramètre', () => {
		// Échelle complète km→mm portant « 3 m ». Le nettoyage des zéros de tête et de queue ne
		// dépend pas de qui pose la virgule : « 300 », jamais « 000300,0 ».
		const table = cases('km:0', 'hm:0', 'dam:0', 'm:3', 'dm:0', 'cm:0', 'mm:0');
		expect(nombreTableauSaisi(table, 'cm', 5)).toBe('300');
		expect(nombreTableauSaisi(table, 'cm', 3)).toBe('3');
		// Sous l'unité, le zéro PORTE la valeur et reste écrit (« 0,003 », pas « ,003 »).
		expect(nombreTableauSaisi(table, 'cm', 0)).toBe('0,003');
		// Table entièrement à zéro : « 0 » où que tombe la virgule (zéro reste zéro).
		const zeros = cases('m:0', 'dm:0', 'cm:0');
		expect(nombreTableauSaisi(zeros, 'dm', 0)).toBe('0');
		expect(nombreTableauSaisi(zeros, 'dm', 2)).toBe('0');
	});

	it('un cran de virgule = un facteur 10, bord gauche compris : D / 10^(cases restantes)', () => {
		// Contre-témoin du bloc : un paramètre silencieusement ignoré rendrait la MÊME chaîne
		// pour tous les placements. L'unité demandée est ici volontairement absente du tableau,
		// pour que seul le placement décide.
		for (const specs of [
			['km:3', 'hm:0', 'dam:7', 'm:0'],
			['m:1', 'm:2', 'dm:5', 'cm:0'],
			['m:4', 'dm:5', 'cm:6'],
		]) {
			const table = cases(...specs);
			const entier = Number(specs.map((s) => s.split(':')[1]).join(''));
			const n = specs.length;
			const lues = new Set<string>();
			// `i = -1` : virgule au bord GAUCHE, devant tous les chiffres. Ce n'est pas un cas à
			// part, c'est le même rang de plus — la formule ne change pas, donc le résultat non
			// plus (« 0,3 » et jamais « 300 »).
			for (let i = -1; i < n; i++) {
				const lu = nombreTableauSaisi(table, 'unite-absente', i);
				expect(
					Number(lu.replace(',', '.')),
					`${specs.join(' ')} — virgule après la case ${i} → « ${lu} »`,
				).toBeCloseTo(entier / 10 ** (n - 1 - i), 9);
				lues.add(lu);
			}
			// Deux placements distincts ne peuvent pas rendre le même nombre (aucune table nulle).
			// n cases → n+1 frontières, bord gauche compris.
			expect(lues.size, `${specs.join(' ')} : placements confondus`).toBe(n + 1);
		}
	});

	it('virgule posée au bord GAUCHE : la partie entière vaut 0, jamais rien', () => {
		// « 3 m » relu comme si l'enfant avait posé sa virgule devant tous les chiffres : 0,3 —
		// et surtout pas 300, qui vaut mille fois ce qu'il a écrit. C'est le rang où le repli
		// « chiffres bruts » se confondrait avec une virgule posée, et où le parent lirait donc
		// l'inverse de ce que montrait l'écran. Un nombre s'écrit « 0,3 », jamais « ,3 ».
		expect(nombreTableauSaisi(cases('m:3', 'dm:0', 'cm:0'), 'cm', -1)).toBe('0,3');
		// L'unité demandée a beau avoir sa colonne : c'est le geste de l'enfant qui décide.
		expect(nombreTableauSaisi(cases('m:2', 'dm:5', 'cm:3'), 'dm', -1)).toBe('0,253');
		// Table entièrement à zéro : « 0 », ni « 0, » ni « 0,000 ».
		expect(nombreTableauSaisi(cases('m:0', 'dm:0', 'cm:0'), 'dm', -1)).toBe('0');
	});

	it('paramètre absent ou `undefined` : comportement STRICTEMENT inchangé', () => {
		// Tout le CE2 et le mode « tableau » continuent d'appeler la fonction à deux arguments :
		// ils doivent lire exactement comme avant.
		const tables: Array<[string[], string]> = [
			[['km:3', 'hm:0', 'dam:0', 'm:0'], 'm'],
			[['km:1', 'hm:5', 'dam:0', 'm:0'], 'km'],
			[['m:2', 'dm:5', 'cm:3'], 'dm'],
			[['m:1', 'm:2', 'dm:5', 'cm:0'], 'm'],
			[['km:3', 'hm:0', 'dam:7', 'm:0'], 'km'],
		];
		for (const [specs, unite] of tables) {
			const table = cases(...specs);
			expect(nombreTableauSaisi(table, unite, undefined), specs.join(' ')).toBe(
				nombreTableauSaisi(table, unite),
			);
		}
		// Et les valeurs elles-mêmes ne bougent pas : garde contre un 3ᵉ paramètre doté d'une
		// valeur par DÉFAUT (0, par exemple) au lieu d'être réellement optionnel.
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:0', 'm:0'), 'm', undefined)).toBe('3000');
		expect(nombreTableauSaisi(cases('m:2', 'dm:5', 'cm:3'), 'dm', undefined)).toBe('25,3');
		// Repli INCHANGÉ, et c'est désormais son SEUL domaine : aucune virgule posée ET aucune
		// colonne pour l'unité demandée → pas de rang où couper, les chiffres sortent bruts.
		// Une virgule posée au même endroit (-1), elle, ne retombe plus ici.
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:0', 'm:0'), 'mm', undefined)).toBe('3000');
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:0', 'm:0'), 'mm', -1)).toBe('0,3');
	});
});

describe('nombreTableauSaisi — confronté aux tableaux réellement générés (#394)', () => {
	type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;
	const FAMILLES = ['mes-longueurs', 'mes-masses', 'mes-contenances'] as const;
	const NIVEAUX: SchoolLevel[] = ['ce2', 'cm1'];
	const type = (id: string) => MESURE_LESSONS.find((l) => l.id === id)!.exerciseType;

	function genTab(id: string, level: SchoolLevel, n: number): Tableau[] {
		const t = type(id);
		const out: Tableau[] = [];
		for (let i = 0; i < n; i++) {
			const ex = t.generate({ mode: 'tableau', level });
			if (ex.type === 'tableauConversion') out.push(ex);
		}
		return out;
	}

	/* Tableau REMPLI JUSTE : les chiffres attendus, déployés en liste plate comme le
	   runner (une case par chiffre, la tête pouvant en porter deux). */
	const casesJustes = (ex: Tableau): CelluleTableau[] =>
		ex.colonnes.flatMap((col) =>
			col.chiffres.split('').map((valeur) => ({ unite: col.unite, valeur })),
		);

	/* Chiffres affichés par l'écran, toutes colonnes confondues (une seule chaîne). */
	const chiffresEcran = (ex: Tableau): string => ex.colonnes.map((c) => c.chiffres).join('');

	it('un tableau rempli JUSTE se relit exactement comme la réponse attendue', () => {
		// Le cas que la tranche fixe (#711) rend systématique — colonnes à zéro avant la cible,
		// colonnes après elle — est-il seulement atteint par le tirage ? Sans ces compteurs, le
		// test resterait vert sur un jeu de tableaux taillés au plus juste, c'est-à-dire
		// exactement là où il n'a plus rien à garder.
		let avecZerosDeTete = 0;
		let avecColonnesApres = 0;
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 200)) {
					const lu = nombreTableauSaisi(casesJustes(ex), ex.answerUnit);
					// Le parent lit EXACTEMENT le nombre attendu, pas une variante décorée de
					// zéros de rang : « 300 », jamais « 000300,0 ».
					expect(lu).toBe(ex.answer);
					// Et ce nombre s'écrit comme un enfant l'écrit : au plus une virgule, jamais
					// suivie d'un zéro final, jamais de zéro de tête devant un autre chiffre.
					expect(lu).toMatch(/^\d+(,\d*[1-9])?$/);
					expect(lu).not.toMatch(/^0\d/);
					const indexCible = ex.colonnes.findIndex((c) => c.unite === ex.answerUnit);
					const tete = ex.colonnes
						.slice(0, indexCible)
						.map((c) => c.chiffres)
						.join('');
					if (/^0/.test(tete)) avecZerosDeTete++;
					if (indexCible < ex.colonnes.length - 1) avecColonnesApres++;
				}
			}
		}
		expect(avecZerosDeTete).toBeGreaterThan(0);
		expect(avecColonnesApres).toBeGreaterThan(0);
	});

	it('quand l’écran pose une virgule, le journal la place au même rang', () => {
		let vus = 0;
		for (const id of FAMILLES) {
			for (const ex of genTab(id, 'cm1', 300)) {
				if (ex.virguleApres === undefined) continue;
				vus++;
				const lu = nombreTableauSaisi(casesJustes(ex), ex.answerUnit);
				// Ce que l'ÉCRAN montre : les chiffres des colonnes, coupés par la virgule
				// dessinée après la colonne `virguleApres` (index de COLONNE, la tête pouvant
				// valoir 2 chiffres).
				const chiffres = chiffresEcran(ex);
				const avant = ex.colonnes
					.slice(0, ex.virguleApres + 1)
					.reduce((n, c) => n + c.chiffres.length, 0);
				const entierEcran = chiffres.slice(0, avant);
				const decimalesEcran = chiffres.slice(avant);
				// Même VALEUR que le nombre lu à l'écran : une virgule décalée d'un seul rang
				// multiplie ou divise par 10, donc ne peut pas passer inaperçue.
				expect(Number(lu.replace(',', '.'))).toBe(Number(entierEcran + '.' + decimalesEcran));
				// Le journal met une virgule exactement quand les colonnes qui suivent la cible
				// portent une valeur : ni virgule perdue sur un nombre décimal, ni virgule
				// fantôme derrière des colonnes vides.
				expect(lu.includes(',')).toBe(/[1-9]/.test(decimalesEcran));
				// Les décimales du journal sont celles de l'écran, amputées des SEULS zéros de
				// queue (ceux qui ne changent pas la valeur).
				const decimalesJournal = lu.split(',')[1] ?? '';
				expect(decimalesEcran.startsWith(decimalesJournal)).toBe(true);
				expect(decimalesEcran.slice(decimalesJournal.length)).toMatch(/^0*$/);
				expect(decimalesJournal).not.toMatch(/0$/);
			}
		}
		expect(vus).toBeGreaterThan(0); // le cas décimal est bien atteint (pas un test à vide)
	});

	it('aucun chiffre du tableau n’est ignoré : changer une case change la valeur relue', () => {
		// L'erreur qui ne doit jamais passer : un zéro de rang oublié, ou un chiffre glissé dans
		// une colonne de transit, donne une valeur DIFFÉRENTE de la réponse attendue — sinon le
		// journal afficherait « donné : 300 / attendu : 300 » sous les yeux du parent. Le ménage
		// des zéros (#711) enlève des zéros SANS VALEUR ; rogner les colonnes avant de lire, lui,
		// effacerait l'erreur. Toutes les cases sont éprouvées, des deux côtés de la cible.
		let vus = 0;
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 40)) {
					const attendue = Number(ex.answer.replace(',', '.'));
					const cellules = casesJustes(ex);
					for (let i = 0; i < cellules.length; i++) {
						const faute = cellules.map((c, j) =>
							j === i ? { ...c, valeur: String((Number(c.valeur) + 1) % 10) } : c,
						);
						const lu = Number(nombreTableauSaisi(faute, ex.answerUnit).replace(',', '.'));
						expect(lu).not.toBe(attendue);
						vus++;
					}
				}
			}
		}
		expect(vus).toBeGreaterThan(0);
	});
});

describe('pairesErreur (appariement : seuls les liens faux)', () => {
	const paires = [
		{ gauche: 'chant', droite: 'chanteur' },
		{ gauche: 'dent', droite: 'dentiste' },
		{ gauche: 'fleur', droite: 'fleuriste' },
		{ gauche: 'lait', droite: 'laitier' },
	];
	const lien = (gauche: string, droite: string | null): LienPropose => ({ gauche, droite });

	it('un seul lien faux (mot relié à un intrus) : les paires justes ne sont pas re-citées', () => {
		const liens = [
			lien('chant', 'chanteur'),
			lien('dent', 'dentelle'), // intrus
			lien('fleur', 'fleuriste'),
			lien('lait', 'laitier'),
		];
		expect(pairesErreur(liens, paires)).toEqual({
			donnee: 'dent → dentelle',
			attendue: 'dent → dentiste',
		});
	});

	it('tout est faux : chaque lien est cité, séparé par « ; », dans l’ordre affiché', () => {
		const liens = [lien('chant', 'dentiste'), lien('dent', 'fleuriste'), lien('fleur', 'chanteur')];
		expect(pairesErreur(liens, paires)).toEqual({
			donnee: 'chant → dentiste ; dent → fleuriste ; fleur → chanteur',
			attendue: 'chant → chanteur ; dent → dentiste ; fleur → fleuriste',
		});
	});

	it('mot laissé sans lien : « (non relié) » côté donné, la bonne paire côté attendu', () => {
		const liens = [lien('chant', 'chanteur'), lien('dent', null)];
		expect(pairesErreur(liens, paires)).toEqual({
			donnee: 'dent → (non relié)',
			attendue: 'dent → dentiste',
		});
	});

	it('donné et attendu restent alignés mot à mot, même si l’ordre diffère des paires', () => {
		// Ordre d'affichage ≠ ordre du jeu de paires : une réponse donnée et une réponse
		// attendue désalignées montreraient au parent la correction d'un AUTRE mot.
		const liens = [lien('lait', 'dentiste'), lien('chant', 'laitier'), lien('dent', 'chanteur')];
		const { donnee, attendue } = pairesErreur(liens, paires);
		const gauchesDe = (s: string) => s.split(' ; ').map((seg) => seg.split(' → ')[0]);
		expect(gauchesDe(donnee)).toEqual(['lait', 'chant', 'dent']);
		expect(gauchesDe(attendue)).toEqual(['lait', 'chant', 'dent']);
	});

	it('repli défensif : aucun lien faux → tous les liens, donné identique à l’attendu', () => {
		const liens = [lien('chant', 'chanteur'), lien('dent', 'dentiste')];
		const res = pairesErreur(liens, paires);
		expect(res.donnee).toBe('chant → chanteur ; dent → dentiste');
		expect(res.attendue).toBe(res.donnee);
	});
});

describe('motsMalClasses (tri par thème)', () => {
	const mots = [
		{ mot: 'chat', cat: 0 as const },
		{ mot: 'rose', cat: 1 as const },
		{ mot: 'chien', cat: 0 as const },
	];
	const categories = ['Animaux', 'Fleurs'] as const;

	it('ne renvoie que les mots MAL classés (colonne choisie ≠ bonne colonne)', () => {
		// chat mal classé (mis en Fleurs), rose bien classée, chien non classé.
		const res = motsMalClasses(mots, categories, { chat: 1, rose: 1 });
		expect(res).toEqual([{ mot: 'chat', donnee: 'Fleurs', attendue: 'Animaux' }]);
	});

	it('tri parfait → aucune entrée', () => {
		expect(motsMalClasses(mots, categories, { chat: 0, rose: 1, chien: 0 })).toEqual([]);
	});
});

describe('labelLeconOrtho (libellé d’une liste d’orthographe)', () => {
	it('liste du profil (custom) : renvoie son label', () => {
		expect(labelLeconOrtho('liste-42', [{ id: 'liste-42', label: 'Mots de la semaine' }])).toBe(
			'Mots de la semaine',
		);
	});

	it('leçon prédéfinie : renvoie son label sans état de profil', () => {
		const predef = ORTHO_PREDEF[0];
		expect(labelLeconOrtho(predef.id)).toBe(predef.label);
	});

	it('id inconnu → null (repli sur l’id brut côté UI)', () => {
		expect(labelLeconOrtho('inexistant')).toBeNull();
	});
});

/* ---------------------------------------------------------------
   Réponse attendue révélée au parent (#501). `attendueItem` est la source unique
   de la « réponse attendue » du journal encadrant ET du corrigé imprimé, et la
   SEULE des cinq surfaces de révélation qui soit de la logique pure : les quatre
   autres (marqueur de fiche, sprint, révision, verdict) passent par le DOM et
   relèvent de l'e2e. Sans ce gate, un refactor peut ré-afficher « 2300000 » à un
   parent sans rien faire rougir.
   --------------------------------------------------------------- */
/* Espace fine insécable (U+202F), séparateur de milliers français : désignée par
   son point de code, jamais écrite en clair (convention de core/nombres.ts). */
const U202F = String.fromCharCode(0x202f);

describe('attendueItem — la réponse révélée au parent (#501)', () => {
	it('un grand entier est groupé, comme dans les énoncés', () => {
		expect(attendueItem({ answer: 2300000 })).toBe(`2${U202F}300${U202F}000`);
		expect(attendueItem({ answer: '2300000' })).toBe(`2${U202F}300${U202F}000`);
		expect(attendueItem({ answer: 10000 })).toBe(`10${U202F}000`);
		// Sous le seuil de groupement (plage CE2) : inchangé, comme partout ailleurs.
		expect(attendueItem({ answer: 9999 })).toBe('9999');
		expect(attendueItem({ answer: 457 })).toBe('457');
	});

	it('un décimal sort à la virgule française, sans décimale perdue', () => {
		// Le point n'est pas la notation enseignée au cycle 3 : un parent qui lit « 3.45 »
		// dans le journal lit une écriture que l'école corrige.
		expect(attendueItem({ answer: '3.45' })).toBe('3,45');
		expect(attendueItem({ answer: 3.5 })).toBe('3,5');
		// Zéro final SIGNIFIANT : « 3,60 » n'est pas « 3,6 » dans la leçon des décimaux.
		expect(attendueItem({ answer: '3.60' })).toBe('3,60');
		expect(attendueItem({ answer: '4,56' })).toBe('4,56');
	});

	it('une réponse non numérique reste intacte', () => {
		for (const answer of [
			'<',
			'losange',
			'Oui',
			'4 h 30',
			'2 h 30 min',
			'8/10',
			'1er groupe',
			'104 100 98 94', // rangement : une SUITE de nombres, jamais un nombre géant
		]) {
			expect(attendueItem({ answer })).toBe(answer);
		}
		// Bord : une réponse falsy (0) reste « 0 » et ne devient pas une chaîne vide.
		expect(attendueItem({ answer: 0 })).toBe('0');
	});

	it('avec intervalle : toujours la BANDE, jamais le nombre-exemple mis en forme', () => {
		// Branche que la mise en forme ne doit PAS toucher : `answer` n'y est qu'un exemple
		// valide. La régression serait la plus discrète de toutes — le parent lirait « la
		// bonne réponse : 6 150 000 » là où douze valeurs étaient acceptées.
		const iv: [number, number] = [6100000, 6200000];
		const bande = attendueItem({ answer: 6150000, intervalle: iv });
		expect(bande).toBe(attendueIntervalle(iv));
		expect(bande).toBe(`un nombre entre 6${U202F}100${U202F}000 et 6${U202F}200${U202F}000`);
		expect(bande).not.toContain(`6${U202F}150${U202F}000`);
		// Petites bornes (CE2) : la bande reste la bande, sans séparateur.
		expect(attendueItem({ answer: 457, intervalle: [450, 465] })).toBe(
			'un nombre entre 450 et 465',
		);
	});
});

/* ---------------------------------------------------------------
   Énoncés lisibles HORS de l'appli (#734) : le journal encadrant et la séance partagée
   relisent un « clique sur le mot », une droite graduée ou un problème sans l'écran qui
   les montrait. Chaque énoncé doit donc porter ce que l'écran disait en plus de la
   consigne : la phrase, la fenêtre de la droite, la ou les questions du problème.
   --------------------------------------------------------------- */
describe('enonceClicMotJournal — la consigne ET la phrase sur laquelle elle porte', () => {
	it('la phrase recomposée suit la consigne, entre guillemets français', () => {
		const t = enonceClicMotJournal({
			consigne: 'Clique sur le verbe conjugué.',
			tokens: ['Les', 'enfants', 'ont', 'mangé', 'une', 'pomme', '.'],
		});
		expect(t).toMatch(/^Clique sur le verbe conjugué\.\s«\sLes enfants ont mangé une pomme\.\s»$/);
	});

	it('ponctuation recollée comme dans un texte : ni « matin , » ni « dort . »', () => {
		const t = enonceClicMotJournal({
			consigne: 'Clique sur le sujet.',
			tokens: ['Ce', 'matin', ',', 'le', 'petit', 'chat', 'noir', 'dort', '.'],
		});
		expect(t).toContain('Ce matin, le petit chat noir dort.');
		expect(t).not.toMatch(/\s[,.]/);
	});

	it('point d’interrogation : précédé d’une espace, à la française', () => {
		const t = enonceClicMotJournal({
			consigne: 'Clique sur le nom.',
			tokens: ['Où', 'est', 'le', 'chat', '?'],
		});
		expect(t).toMatch(/Où est le chat\s\?/);
	});
});

describe('enonceDroiteJournal — la FENÊTRE de la droite fait partie de l’énoncé', () => {
	const CONSIGNE = 'Place le nombre 3470 sur la droite graduée.';

	it('la consigne, puis les deux bornes EXTRÊMES — jamais la borne du milieu', () => {
		// Le générateur numérote trois graduations : les deux bornes et le milieu.
		const t = enonceDroiteJournal({
			consigne: CONSIGNE,
			min: 3400,
			max: 3500,
			bornes: [{ label: '3400' }, { label: '3450' }, { label: '3500' }],
		});
		expect(t.startsWith(CONSIGNE)).toBe(true);
		expect(t).toMatch(/de 3400 à 3500/);
		expect(t).not.toContain('3450');
	});

	it('décimaux : les libellés VUS par l’enfant (3 et 4), jamais les centièmes internes (300, 400)', () => {
		const t = enonceDroiteJournal({
			consigne: 'Place le nombre 3,7 sur la droite graduée.',
			min: 300,
			max: 400,
			bornes: [{ label: '3' }, { label: '3,5' }, { label: '4' }],
		});
		expect(t).toMatch(/de 3 à 4/);
		expect(t).not.toMatch(/300|400/);
	});

	it('sans bornes numérotées : repli sur min et max', () => {
		const t = enonceDroiteJournal({ consigne: CONSIGNE, min: 340, max: 350, bornes: [] });
		expect(t.startsWith(CONSIGNE)).toBe(true);
		expect(t).toMatch(/de 340 à 350/);
	});

	it('droites réellement tirées : la consigne, et les libellés des deux bornes extrêmes', () => {
		const tirages: [string, SchoolLevel][] = [
			['num-droite-entiers', 'ce2'],
			['num-droite-entiers', 'cm1'],
			['num-droite-decimaux', 'cm1'],
		];
		for (const [id, level] of tirages) {
			const type = getLessonById(id)!.exerciseType;
			for (let seed = 1; seed <= 100; seed++) {
				const ex = withSeed(seed, () => type.generate({ level }));
				if (ex.type !== 'droiteGraduee') throw new Error(`${id} : pas une droite graduée`);
				const t = enonceDroiteJournal(ex);
				const de = ex.bornes[0].label;
				const a = ex.bornes[ex.bornes.length - 1].label;
				expect(t.startsWith(ex.consigne), `${id} ${level}`).toBe(true);
				expect(t, `${id} ${level} : fenêtre absente`).toContain(`${de} à ${a}`);
			}
		}
	});
});

describe('enonceProblemeLisible — la situation, puis ce qu’on demandait', () => {
	const ENONCE = 'Léo a 12 billes. Il en gagne 5, puis en perd 3.';
	const Q1 = 'Combien Léo a-t-il de billes après avoir gagné ?';
	const Q2 = 'Combien Léo a-t-il de billes à la fin ?';

	it('une seule question : la situation puis la question, SANS numéro', () => {
		const t = enonceProblemeLisible({ enonce: ENONCE, etapes: [{ question: Q2 }] });
		expect(t.startsWith(ENONCE)).toBe(true);
		expect(t).toContain(Q2);
		expect(t.indexOf(Q2)).toBeGreaterThan(ENONCE.length - 1);
		expect(t).not.toMatch(/\b1\)/);
	});

	it('deux questions : numérotées 1) et 2), dans l’ordre, après la situation', () => {
		const t = enonceProblemeLisible({
			enonce: ENONCE,
			etapes: [{ question: Q1 }, { question: Q2 }],
		});
		expect(t.startsWith(ENONCE)).toBe(true);
		const i1 = t.indexOf(`1) ${Q1}`);
		const i2 = t.indexOf(`2) ${Q2}`);
		expect(i1, 'question 1 numérotée').toBeGreaterThanOrEqual(ENONCE.length);
		expect(i2, 'question 2 numérotée, après la 1').toBeGreaterThan(i1);
	});

	it('trois questions : la numérotation continue (3)', () => {
		const Q3 = 'Combien en a-t-il perdu en tout ?';
		const t = enonceProblemeLisible({
			enonce: ENONCE,
			etapes: [{ question: Q1 }, { question: Q2 }, { question: Q3 }],
		});
		expect(t).toContain(`3) ${Q3}`);
	});
});

describe('etapesLisibles — les réponses d’un problème, rattachées à leur question', () => {
	it('une seule étape : la valeur seule, sans numéro', () => {
		expect(etapesLisibles(['14'])).toBe('14');
		expect(etapesLisibles(['4,50 €'])).toBe('4,50 €');
	});

	it('deux étapes : chaque réponse précédée du numéro de SA question, dans l’ordre', () => {
		const t = etapesLisibles(['17', '14']);
		const i1 = t.indexOf('1) 17');
		const i2 = t.indexOf('2) 14');
		expect(i1).toBeGreaterThanOrEqual(0);
		expect(i2).toBeGreaterThan(i1);
	});

	it('réponses décimales : aucune lecture « 4, 5, 3 » possible — chaque valeur reste intacte', () => {
		const t = etapesLisibles(['4,5', '3']);
		expect(t).toContain('1) 4,5');
		expect(t).toContain('2) 3');
		expect(t).not.toMatch(/4,5,\s?3/);
	});
});
