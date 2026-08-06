/* ============================================================
   Saisie non numérique refusée sans être comptée fausse — logique PURE, sans DOM.

   Deux prédicats, une seule règle : un runner ne doit REFUSER une saisie (au lieu de
   la compter fausse) que là où la correction attend un nombre.
   - `saisieEstNombre` (core/nombres.ts) : cette saisie est-elle lisible comme un nombre ?
   - `itemEstNumerique` (core/items.ts) : cet item se corrige-t-il numériquement ?

   L'enjeu de non-régression : TOUT ce que `checkItemAnswer` compte juste aujourd'hui doit
   rester accepté demain. Un garde-fou trop strict transformerait des réponses valides en
   « écris seulement un nombre » — un faux refus est plus grave que le faux négatif qu'on
   corrige. Les tests prennent donc `checkItemAnswer` comme ORACLE (la correction réelle)
   plutôt que de recopier le critère d'implémentation.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { saisieEstNombre } from '../src/core/nombres';
import { checkItemAnswer, itemEstNumerique, add } from '../src/core/items';
import type { Item } from '../src/core/items';
import { getAllLessons, genLessonItem } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';

/* Item de calcul (correction numérique) dont la réponse STOCKÉE est `answer`. */
const itemNum = (answer: string | number): Item => ({ text: 'q @', answer, kind: 'num' });

/* ------------------------------------------------------------------
   Observation « boîte noire » de la branche de correction.

   On ne demande pas au code ce qu'il fait : on soumet à `checkItemAnswer` une écriture
   NUMÉRIQUEMENT égale à la réponse attendue mais TEXTUELLEMENT différente (un zéro de
   tête). Une comparaison de nombres l'accepte ; une comparaison de texte la refuse.
   Reste donc valable pour un `kind` qui n'existe pas encore.
   ------------------------------------------------------------------ */
function correctionCompareUnNombre(it: Item): boolean {
	const a = String(it.answer).trim();
	const avecZeroDeTete = a.startsWith('-') ? `-0${a.slice(1)}` : `0${a}`;
	return checkItemAnswer(it, avecZeroDeTete);
}

/* ============================================================
   1. saisieEstNombre
   ============================================================ */

describe('saisieEstNombre — ce que la correction sait lire', () => {
	it('accepte les écritures françaises tolérées ailleurs dans le projet', () => {
		expect(saisieEstNombre('42')).toBe(true);
		expect(saisieEstNombre('0')).toBe(true); // zéro : le piège classique du `if (!n)`
		expect(saisieEstNombre('3,5')).toBe(true); // virgule décimale française
		expect(saisieEstNombre('3.5')).toBe(true); // point toléré aussi
		expect(saisieEstNombre(',5')).toBe(true); // « ,5 » = 0,5 (écriture d'enfant)
		expect(saisieEstNombre('03')).toBe(true); // zéros de tête
		expect(saisieEstNombre('1 002 050')).toBe(true); // espaces ordinaires
		expect(saisieEstNombre('1\u202F002\u202F050')).toBe(true); // fine insécable (formatNombre)
		expect(saisieEstNombre('1\u00A0002\u00A0050')).toBe(true); // insécable
		expect(saisieEstNombre('  7  ')).toBe(true); // espaces de bord
		expect(saisieEstNombre('-3')).toBe(true); // négatif : pas au programme, mais lisible
		expect(saisieEstNombre('+3')).toBe(true);
		expect(saisieEstNombre('4,50')).toBe(true); // décimale « inutile »
	});

	it('refuse le caractère parasite du pavé Android (« 3- ») et les saisies illisibles', () => {
		// Le cas d'origine : l'enfant avait le bon résultat, le « - » vient du pavé.
		expect(saisieEstNombre('3-')).toBe(false);
		expect(saisieEstNombre('-')).toBe(false);
		expect(saisieEstNombre('3+')).toBe(false);
		expect(saisieEstNombre('3 -')).toBe(false);
		expect(saisieEstNombre('--3')).toBe(false);
		expect(saisieEstNombre('3,5,7')).toBe(false); // deux virgules
		expect(saisieEstNombre('3.4.5')).toBe(false);
		expect(saisieEstNombre(',')).toBe(false);
		expect(saisieEstNombre('.')).toBe(false);
		expect(saisieEstNombre('1/2')).toBe(false); // une fraction n'est pas un nombre saisi
		expect(saisieEstNombre('12a')).toBe(false);
		expect(saisieEstNombre('quarante-deux')).toBe(false);
		expect(saisieEstNombre('10 h 15')).toBe(false); // une heure n'est pas un nombre
		expect(saisieEstNombre('<')).toBe(false); // signe de comparaison
	});

	it('refuse une saisie vide ou faite uniquement d’espaces (Number("") vaut 0)', () => {
		expect(saisieEstNombre('')).toBe(false);
		expect(saisieEstNombre('   ')).toBe(false);
		expect(saisieEstNombre('\u202F')).toBe(false); // fine insécable seule
		expect(saisieEstNombre('\u00A0')).toBe(false); // insécable seule
		expect(saisieEstNombre('\t\n')).toBe(false);
	});

	it('les espaces internes sont des séparateurs de milliers, pas des séparateurs de nombres', () => {
		// « 3 4 5 » se lit 345 (on ne peut pas distinguer un groupement d'une frappe parasite) :
		// comportement existant de la correction, que le garde-fou doit suivre — sinon il
		// refuserait une saisie que la correction, elle, valide.
		expect(saisieEstNombre('3 4 5')).toBe(true);
		expect(checkItemAnswer(itemNum(345), '3 4 5')).toBe(true);
	});

	it('écart assumé : une saisie qui déborde en ±Infinity est refusée', () => {
		// La correction, elle, « sait la comparer » (Infinity === Infinity) : l'équivalence
		// « nombre ⟺ comparable » a donc cette exception. Sans conséquence : aucune réponse
		// attendue n'est infinie, donc aucune réponse juste n'est perdue.
		expect(saisieEstNombre('1e400')).toBe(false);
		expect(saisieEstNombre('Infinity')).toBe(false);
		expect(checkItemAnswer(itemNum('Infinity'), 'Infinity')).toBe(true);
	});
});

/* Briques d'écriture : le mélange produit aussi bien des nombres bien écrits que des
   saisies parasites (« 3- », « 0,5,56 », « 42h »). Concaténées 1 à 4 fois. */
const MORCEAUX = [
	'',
	' ',
	'  ',
	'\u202F',
	'\u00A0',
	'-',
	'+',
	'0',
	'00',
	'7',
	'42',
	'345',
	'1002050',
	',',
	'.',
	',5',
	'.5',
	',56',
	'0,5',
	'e3',
	'h',
	'abc',
	'/',
	'<',
	'3-',
];
const saisieArbitraire = fc
	.array(fc.constantFrom(...MORCEAUX), { minLength: 1, maxLength: 4 })
	.map((bouts) => bouts.join(''));

describe('saisieEstNombre — invariant de non-régression (échantillon)', () => {
	// Réponses STOCKÉES représentatives du catalogue : entier, zéro, décimale à virgule
	// (#248), grand nombre (#240).
	const REPONSES_STOCKEES = ['0', '7', '42', '345', '4,56', '0,5', '1002050'];

	it('aucune saisie comptée JUSTE par la correction n’est refusée par le garde-fou', () => {
		// Témoin d'anti-vacuité : une propriété dont la prémisse n'est jamais vraie passe
		// toujours. On compte les saisies effectivement comptées justes.
		let comptesJustes = 0;
		fc.assert(
			fc.property(saisieArbitraire, (saisie) => {
				// Un champ vide/blanc est exclu : la spec en fait explicitement un non-nombre,
				// et les runners l'écartent en amont (message dédié, ou champ « non rempli »).
				if (saisie.trim() === '') return;
				for (const attendue of REPONSES_STOCKEES) {
					if (!checkItemAnswer(itemNum(attendue), saisie)) continue;
					comptesJustes++;
					expect(
						saisieEstNombre(saisie),
						`« ${saisie} » est comptée JUSTE pour la réponse ${attendue}, elle ne peut pas être refusée`,
					).toBe(true);
				}
			}),
			{ numRuns: 3000 },
		);
		expect(
			comptesJustes,
			'échantillon sans aucune bonne réponse : la propriété ne teste rien',
		).toBeGreaterThan(100);
	});

	it('symétrique : le garde-fou ne laisse passer que ce que la correction sait comparer', () => {
		let nombresLus = 0;
		fc.assert(
			fc.property(saisieArbitraire, (saisie) => {
				if (!saisieEstNombre(saisie)) return;
				nombresLus++;
				// La correction compare cette écriture à elle-même : si elle sait la lire,
				// elle la valide (sinon NaN ≠ NaN → aucune saisie de cette forme ne pourrait
				// jamais être juste, et la refuser serait justifié… mais alors le prédicat ment).
				expect(
					checkItemAnswer(itemNum(saisie), saisie),
					`« ${saisie} » est déclarée numérique mais la correction ne sait pas la comparer`,
				).toBe(true);
			}),
			{ numRuns: 3000 },
		);
		expect(
			nombresLus,
			'échantillon sans aucun nombre : la propriété ne teste rien',
		).toBeGreaterThan(100);
	});
});

/* ============================================================
   2. itemEstNumerique — accord avec checkItemAnswer
   ============================================================ */

/* Un exemple par `kind` déclaré. Le type `Record<NonNullable<Item['kind']>, Item>` est
   VOLONTAIRE : ajouter un `kind` au type `Item` casse la compilation de ce test tant qu'on
   ne l'a pas décrit ici — la question « ce nouveau kind se corrige-t-il en nombre ? » ne
   peut pas être oubliée. */
const EXEMPLES_PAR_KIND: Record<NonNullable<Item['kind']>, Item> = {
	num: { text: '12 + 30 = @', answer: 42, kind: 'num' },
	text: { text: 'Contraire de « grand » : @', answer: 'petit', kind: 'text' },
	posed: { text: '', answer: 42, kind: 'posed', posed: { op: '+', a: 12, b: 30 } },
	heure: {
		text: 'Quelle heure est-il ? @',
		answer: '10 h 15',
		answers: ['10h15', '10:15'],
		kind: 'heure',
	},
};

describe('itemEstNumerique — la règle, dérivée de ce que la correction fait', () => {
	it('un calcul se corrige en nombre', () => {
		expect(itemEstNumerique(EXEMPLES_PAR_KIND.num)).toBe(true);
		// Item hérité des fiches (core/lessons.ts) : pas de `kind`, réponse numérique.
		expect(itemEstNumerique(add(12, 30))).toBe(true);
		expect(checkItemAnswer(add(12, 30), '042')).toBe(true); // bien comparé comme un nombre
	});

	it('une grille d’opération posée se corrige en nombre (chiffre par chiffre)', () => {
		expect(itemEstNumerique(EXEMPLES_PAR_KIND.posed)).toBe(true);
	});

	it('un item TEXTE n’est pas numérique — sinon « petit » serait refusé à la saisie', () => {
		expect(itemEstNumerique(EXEMPLES_PAR_KIND.text)).toBe(false);
		expect(saisieEstNombre('petit')).toBe(false); // ce que le garde-fou refuserait à tort
	});

	it('un item HEURE (#88) n’est pas numérique — « 10 h 15 » doit rester saisissable', () => {
		expect(itemEstNumerique(EXEMPLES_PAR_KIND.heure)).toBe(false);
		expect(saisieEstNombre('10 h 15')).toBe(false);
		expect(checkItemAnswer(EXEMPLES_PAR_KIND.heure, '10 h 15')).toBe(true);
	});

	it('un signe de comparaison (<, =, >) reste saisissable', () => {
		const signe: Item = { text: '12 @ 30', answer: '<', kind: 'text' };
		expect(itemEstNumerique(signe)).toBe(false);
		expect(saisieEstNombre('<')).toBe(false);
	});

	it('l’intervalle (#446) l’emporte sur le kind : la bande se corrige par appartenance', () => {
		// Item d'intercalation rendu en `kind: 'text'` (ce que produit genLessonItem hors maths).
		const bande: Item = { text: 'Un nombre entre 450 et 465 : @', answer: '455', kind: 'text' };
		const avecBande: Item = { ...bande, intervalle: [450, 465] };
		// La correction accepte une AUTRE valeur de la bande : elle compare bien un nombre.
		expect(checkItemAnswer(avecBande, '460')).toBe(true);
		expect(checkItemAnswer(bande, '460')).toBe(false); // sans bande : égalité de texte
		expect(itemEstNumerique(avecBande)).toBe(true);
		expect(itemEstNumerique(bande)).toBe(false);
	});
});

describe('itemEstNumerique — accord avec checkItemAnswer sur chaque kind', () => {
	const CAS: [string, Item][] = [
		['sans kind (item de fiche hérité)', { text: '@', answer: 42 }],
		...Object.entries(EXEMPLES_PAR_KIND),
	];

	it.each(CAS)('%s : le prédicat annonce la branche réellement utilisée', (_nom, item) => {
		// La réponse canonique passe : la correction n'est pas simplement en train de tout
		// refuser (ce qui rendrait l'observation ci-dessous ambiguë).
		expect(checkItemAnswer(item, String(item.answer))).toBe(true);
		expect(itemEstNumerique(item)).toBe(correctionCompareUnNombre(item));
	});

	it.each(CAS)('%s + intervalle : la bande impose la correction numérique', (_nom, item) => {
		// Réponse-exemple 455 dans ]450 ; 465[ pour tous les kinds, y compris ceux qui se
		// corrigeraient en texte sans bande.
		const avecBande: Item = { ...item, answer: '455', intervalle: [450, 465] };
		expect(itemEstNumerique(avecBande)).toBe(true);
		expect(correctionCompareUnNombre(avecBande)).toBe(true);
	});
});

/* ============================================================
   3. Accord sur TOUT le catalogue (attrape un kind ou une leçon ajoutés demain)
   ============================================================ */

describe('Accord prédicat/correction sur tout le catalogue', () => {
	const LESSONS = getAllLessons();
	const GRAINES = [1, 7, 42, 1789, 20260804, 987654321];

	it('le catalogue est non vide (garde contre un it.each vide)', () => {
		expect(LESSONS.length).toBeGreaterThan(50);
	});

	it('l’échantillon balaie bien les DEUX branches de correction (anti-vacuité)', () => {
		// Un balayage où tout serait du texte (ou tout du nombre) laisserait l'accord non
		// éprouvé d'un côté. On vérifie que les deux branches, et les kinds à risque
		// (heure #88, intervalle #446), sont réellement représentés.
		const kinds = new Set<string>();
		let numeriques = 0;
		let textuels = 0;
		let bandes = 0;
		for (const lesson of LESSONS) {
			for (const level of lesson.levels) {
				for (const graine of GRAINES) {
					const item = withSeed(graine, () => genLessonItem(lesson, level));
					kinds.add(String(item.kind));
					if (item.intervalle) bandes++;
					if (itemEstNumerique(item)) numeriques++;
					else textuels++;
				}
			}
		}
		expect(numeriques).toBeGreaterThan(50);
		expect(textuels).toBeGreaterThan(50);
		expect(bandes).toBeGreaterThan(0);
		// « undefined » : le calcul mental hérité (bilanQ → add/sub/dbl…) ne pose pas de
		// `kind`. Ces items sont numériques par défaut, ce qui est correct TANT QUE leur
		// réponse est un nombre — l'accord vérifié leçon par leçon ci-dessous le garantit.
		expect([...kinds].sort()).toEqual(['heure', 'num', 'posed', 'text', 'undefined']);
	});

	it.each(LESSONS)(
		'$id : la correction fait ce que le prédicat annonce, et la bonne réponse reste saisissable',
		(lesson) => {
			for (const level of lesson.levels) {
				for (const graine of GRAINES) {
					const item = withSeed(graine, () => genLessonItem(lesson, level));
					const ou = `${lesson.id}@${level} (graine ${graine})`;
					const attendue = String(item.answer);

					// Socle : la réponse canonique est acceptée (sinon l'observation qui suit
					// ne distingue plus « comparé en texte » de « tout est refusé »).
					expect(checkItemAnswer(item, attendue), `${ou} : « ${attendue} » rejetée`).toBe(true);

					expect(
						itemEstNumerique(item),
						`${ou} : itemEstNumerique dit ${itemEstNumerique(item)} pour « ${attendue} » (kind ${item.kind}), la correction dit le contraire`,
					).toBe(correctionCompareUnNombre(item));

					if (!itemEstNumerique(item)) continue;
					// Item déclaré numérique ⇒ un runner refusera toute saisie non numérique.
					// Il faut donc que la bonne réponse elle-même passe le garde-fou…
					expect(
						saisieEstNombre(attendue),
						`${ou} : item numérique dont la bonne réponse « ${attendue} » serait refusée à la saisie`,
					).toBe(true);
					// … et toute forme équivalente que la correction accepte.
					for (const alt of item.answers ?? []) {
						if (!checkItemAnswer(item, alt)) continue;
						expect(
							saisieEstNombre(alt),
							`${ou} : la forme « ${alt} » est comptée juste mais serait refusée à la saisie`,
						).toBe(true);
					}
				}
			}
		},
	);
});

/* ============================================================
   4. Non-régression de checkItemAnswer (refactoré sur itemEstNumerique)
   ============================================================ */

describe('checkItemAnswer — correction numérique (inchangée)', () => {
	it('compare des NOMBRES, pas des chaînes', () => {
		expect(checkItemAnswer(itemNum(42), '42')).toBe(true);
		expect(checkItemAnswer(itemNum(42), '042')).toBe(true);
		expect(checkItemAnswer(itemNum(42), ' 42 ')).toBe(true);
		expect(checkItemAnswer(itemNum(42), '42,0')).toBe(true);
		expect(checkItemAnswer(itemNum(42), '43')).toBe(false);
		expect(checkItemAnswer(itemNum(42), 'quarante-deux')).toBe(false);
		expect(checkItemAnswer(itemNum(42), '4 2 abc')).toBe(false);
	});

	it('tolère les séparateurs de milliers d’un grand nombre recopié (#240)', () => {
		expect(checkItemAnswer(itemNum(1002050), '1\u202F002\u202F050')).toBe(true); // fine insécable
		expect(checkItemAnswer(itemNum(1002050), '1 002 050')).toBe(true);
		expect(checkItemAnswer(itemNum(1002050), '1\u00A0002\u00A0050')).toBe(true); // insécable
		expect(checkItemAnswer(itemNum(1002050), '1002051')).toBe(false);
	});

	it('normalise la virgule des DEUX côtés (#248 : réponse stockée « 4,56 »)', () => {
		expect(checkItemAnswer(itemNum('4,56'), '4,56')).toBe(true);
		expect(checkItemAnswer(itemNum('4,56'), '4.56')).toBe(true);
		expect(checkItemAnswer(itemNum('4,5'), '4,50')).toBe(true);
		expect(checkItemAnswer(itemNum('4,50'), '4,5')).toBe(true);
		expect(checkItemAnswer(itemNum('4,56'), '4,57')).toBe(false);
	});

	it('cas limite connu : sur une réponse attendue 0, un champ vide passe pour juste', () => {
		// `Number('')` vaut 0. Non corrigé par le refactor (les runners écartent le champ vide
		// en amont : message dédié en sprint, « non rempli » en fiche) — noté ici pour qu'un
		// changement de ce comportement soit visible.
		expect(checkItemAnswer(itemNum(0), '')).toBe(true);
		expect(checkItemAnswer(itemNum(0), '   ')).toBe(true);
		expect(saisieEstNombre('')).toBe(false); // le garde-fou, lui, ne la lit pas comme 0
	});
});

describe('checkItemAnswer — correction texte (inchangée)', () => {
	const mot = (answer: string, answers?: string[]): Item => ({
		text: 'q @',
		answer,
		answers,
		kind: 'text',
	});

	it('exige les accents et la casse, ignore les espaces de bord et les doubles espaces', () => {
		expect(checkItemAnswer(mot('carré'), 'carré')).toBe(true);
		expect(checkItemAnswer(mot('carré'), '  carré ')).toBe(true);
		expect(checkItemAnswer(mot('a mangé'), 'a  mangé')).toBe(true);
		expect(checkItemAnswer(mot('carré'), 'carre')).toBe(false);
		expect(checkItemAnswer(mot('carré'), 'Carré')).toBe(false);
	});

	it('exige l’apostrophe droite (choix acté du projet)', () => {
		expect(checkItemAnswer(mot("l'arbre"), "l'arbre")).toBe(true);
		expect(checkItemAnswer(mot("l'arbre"), 'l’arbre')).toBe(false);
	});

	it('accepte les formes équivalentes déclarées dans `answers`', () => {
		expect(checkItemAnswer(mot('cube', ['un cube']), 'un cube')).toBe(true);
		expect(checkItemAnswer(mot('cube', ['un cube']), 'le cube')).toBe(false);
	});

	it('ne compare PAS numériquement : « 02 » n’est pas « 2 »', () => {
		expect(checkItemAnswer(mot('2'), '2')).toBe(true);
		expect(checkItemAnswer(mot('2'), '02')).toBe(false);
		expect(checkItemAnswer(mot('2'), '2,0')).toBe(false);
	});
});

describe('checkItemAnswer — heure (#88, inchangée)', () => {
	const heure: Item = {
		text: 'Quelle heure est-il ? @',
		answer: '10 h 15',
		answers: ['10h15', '10:15', '22 h 15'],
		kind: 'heure',
	};

	it('accepte la forme canonique et les écritures déclarées', () => {
		expect(checkItemAnswer(heure, '10 h 15')).toBe(true);
		expect(checkItemAnswer(heure, '10h15')).toBe(true);
		expect(checkItemAnswer(heure, '10:15')).toBe(true);
		expect(checkItemAnswer(heure, '22 h 15')).toBe(true); // lecture 24 h (#152)
	});

	it('refuse une autre heure et ne se rabat jamais sur une comparaison de nombres', () => {
		expect(checkItemAnswer(heure, '10 h 5')).toBe(false);
		expect(checkItemAnswer(heure, '11 h 15')).toBe(false);
		expect(checkItemAnswer(heure, '1015')).toBe(false);
		expect(checkItemAnswer(heure, '10,15')).toBe(false);
	});
});

describe('checkItemAnswer — intervalle ouvert (#240, #446, inchangée)', () => {
	const bande: Item = {
		text: 'Écris un nombre entre 450 et 465 : @',
		answer: 455,
		kind: 'num',
		intervalle: [450, 465],
	};

	it('accepte toute valeur STRICTEMENT dans la bande, bornes exclues', () => {
		expect(checkItemAnswer(bande, '451')).toBe(true);
		expect(checkItemAnswer(bande, '455')).toBe(true);
		expect(checkItemAnswer(bande, '464')).toBe(true);
		expect(checkItemAnswer(bande, '450')).toBe(false); // borne basse exclue
		expect(checkItemAnswer(bande, '465')).toBe(false); // borne haute exclue
		expect(checkItemAnswer(bande, '449')).toBe(false);
		expect(checkItemAnswer(bande, '466')).toBe(false);
	});

	it('garde la tolérance de saisie numérique dans la bande', () => {
		expect(checkItemAnswer(bande, ' 0455 ')).toBe(true);
		expect(checkItemAnswer(bande, '455,5')).toBe(true); // un décimal est dans la bande
		expect(checkItemAnswer(bande, '4 5 5')).toBe(true); // espaces de groupement
		expect(checkItemAnswer(bande, '3-')).toBe(false); // saisie illisible
		expect(checkItemAnswer(bande, 'quatre cent cinquante-cinq')).toBe(false);
	});
});
