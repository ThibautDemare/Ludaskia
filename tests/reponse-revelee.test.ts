/* ============================================================
   Révélation de la réponse dans le marqueur de correction (#501) — logique PURE.

   Le marqueur ✗ de la fiche révèle la réponse attendue en lisant `data-answer`
   (ou la bande `data-attendue`) BRUTE : un grand nombre sort donc « → 2300000 »
   là où tout le reste de l'appli écrit « 2 300 000 », et un montant sort
   « → 3.45 » avec le POINT anglo-saxon là où le programme n'enseigne que la
   virgule. La mise en forme est confiée à une fonction pure de `core/nombres.ts` :

       formatReponseRevelee(valeur: string): string

   Contrat traduit ici (issue #501, périmètre élargi aux décimaux par arbitrage
   du mainteneur sur avis du pédagogue) :
     1. est un NOMBRE, et rien d'autre, une chaîne qui — espaces de bord rognés —
        s'écrit `-?<chiffres>` ou `-?<chiffres>[.,]<chiffres>` ; tout le reste sort
        inchangé À L'OCTET ;
     2. ENTIER → `formatNombre` (groupé à partir de 5 chiffres, U+202F), avec repli
        sur l'entrée inchangée si le nombre ne se relit pas à l'identique (zéros de
        tête, magnitude au-delà de `Number.isSafeInteger`, « -0 ») ;
     3. DÉCIMAL → partie décimale recopiée caractère par caractère (jamais de
        `Number` : ni arrondi ni zéro significatif perdu), séparateur TOUJOURS la
        virgule, partie entière groupée au niveau des chiffres (même seuil de
        5 chiffres) ;
     4. la fonction ne connaît AUCUNE unité : « 3,5 » ne devient jamais « 3,50 »
        ici (montants en euros = #542, par un autre chemin).

   Les attendus sont dérivés de ce contrat, de la convention typographique
   française et des formes de réponse RÉELLES du catalogue (dernière section) —
   jamais de l'implémentation. Hors périmètre : le vocabulaire de la révélation
   (#503) et le rendu DOM (spec Playwright).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	formatNombre,
	formatReponseRevelee,
	nettoyerSaisieNombre,
	parseNombreFr,
	sansSeparateurMilliers,
} from '../src/core/nombres';
import { getAllLessons, getLessonById, genLessonItem } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import { attendueItem } from '../src/core/erreur-representation';

/* Espaces désignés par leur point de code : on n'écrit jamais de caractère
   invisible en clair dans un source (convention de core/nombres.ts). */
const U202F = String.fromCharCode(0x202f); // espace fine insécable, séparateur de milliers
const U00A0 = String.fromCharCode(0x00a0); // espace insécable

/* Ce qui est un NOMBRE au sens du contrat (point 1), espaces de bord rognés. */
const ENTIER = /^-?\d+$/;
const DECIMAL = /^-?\d+[.,]\d+$/;
const estNombreUnique = (v: string): boolean => ENTIER.test(v.trim()) || DECIMAL.test(v.trim());

/* Suite des chiffres d'une chaîne : ce qui doit être STRICTEMENT conservé par une
   mise en forme (aucun chiffre perdu, aucun ajouté). */
const chiffresDe = (v: string): string => v.replace(/\D/g, '');

/* Oracle INDÉPENDANT du groupement français : classes de 3 depuis la droite,
   séparées par U+202F, et seulement à partir de 5 chiffres (la plage CE2 ≤ 9 999
   s'écrit sans séparateur). Réécrit ici depuis la convention — un test qui
   recopierait `formatNombre` figerait son implémentation au lieu de la vérifier.
   Sa concordance avec la référence de l'appli est contrôlée juste en dessous. */
function grouperAttendu(entier: string): string {
	const signe = entier.startsWith('-') ? '-' : '';
	const chiffres = signe ? entier.slice(1) : entier;
	if (chiffres.length <= 4) return signe + chiffres;
	const paquets: string[] = [];
	for (let fin = chiffres.length; fin > 0; fin -= 3) {
		paquets.unshift(chiffres.slice(Math.max(0, fin - 3), fin));
	}
	return signe + paquets.join(U202F);
}

describe("mon oracle de groupement dit bien la même chose que la référence de l'appli", () => {
	it('grouperAttendu reproduit formatNombre sur la plage des leçons (0 → 9 999 999)', () => {
		for (const n of [0, 7, 999, 1234, 9999, 10000, 12345, 100000, 2300000, 9999999]) {
			expect(grouperAttendu(String(n))).toBe(formatNombre(n));
		}
		expect(grouperAttendu('2300000')).toBe(`2${U202F}300${U202F}000`);
	});
});

describe('Critère 1 — un entier révélé est groupé comme partout ailleurs', () => {
	it("le cas de l'issue : « 2300000 » se révèle « 2 300 000 » (espace fine insécable)", () => {
		expect(formatReponseRevelee('2300000')).toBe(`2${U202F}300${U202F}000`);
	});

	it('frontière de groupement : 9 999 reste nu, 10 000 est groupé', () => {
		expect(formatReponseRevelee('9999')).toBe('9999');
		expect(formatReponseRevelee('10000')).toBe(`10${U202F}000`);
		expect(formatReponseRevelee('99999')).toBe(`99${U202F}999`);
		expect(formatReponseRevelee('100000')).toBe(`100${U202F}000`);
		expect(formatReponseRevelee('9999999')).toBe(`9${U202F}999${U202F}999`);
	});

	it('zéro et petits entiers (plage CE2) sortent inchangés', () => {
		for (const v of ['0', '1', '7', '42', '100', '999', '1234', '5000']) {
			expect(formatReponseRevelee(v)).toBe(v);
		}
	});

	it('jamais le séparateur anglo-saxon, ni une espace sécable', () => {
		const rendu = formatReponseRevelee('1000000');
		expect(rendu).not.toContain(','); // la virgule est le séparateur DÉCIMAL en français
		expect(rendu).not.toContain('.');
		expect(rendu).not.toContain(' '); // espace ordinaire : couperait le nombre en fin de ligne
		expect(rendu).not.toContain(U00A0);
		expect(rendu).toBe(`1${U202F}000${U202F}000`);
	});

	// Lecture retenue du critère 1 : « un entier est rendu comme partout ailleurs »
	// (formatNombre), et un entier négatif en est un. Aucune leçon ne produit
	// aujourd'hui de réponse négative — si l'implémentation préfère la laisser nue,
	// c'est une DÉCISION à écrire, pas un détail : ce test la met sur la table.
	it('un entier négatif suit la même règle (signe conservé, chiffres groupés)', () => {
		expect(formatReponseRevelee('-5')).toBe('-5');
		expect(formatReponseRevelee('-9999')).toBe('-9999');
		expect(formatReponseRevelee('-12345')).toBe(`-12${U202F}345`);
	});
});

describe('Contrat point 3 — un décimal se révèle à la virgule, sans rien perdre', () => {
	// Le motif du chantier élargi : le point n'est jamais la notation enseignée à ce
	// niveau, l'écriture à virgule EST l'objectif d'apprentissage. Une réponse
	// révélée avec un point enseigne donc le contraire de la leçon.
	it('le point décimal devient une virgule', () => {
		expect(formatReponseRevelee('3.5')).toBe('3,5');
		expect(formatReponseRevelee('0.5')).toBe('0,5');
		expect(formatReponseRevelee('3.45')).toBe('3,45'); // forme réelle de la monnaie CM1
		expect(formatReponseRevelee('12.75')).toBe('12,75');
	});

	it('une virgule déjà présente est conservée telle quelle', () => {
		for (const v of ['0,07', '3,5', '4,56', '12,0', '58,22']) {
			expect(formatReponseRevelee(v)).toBe(v);
		}
	});

	// Recopie caractère par caractère : un zéro final est SIGNIFIANT (« 3,60 » = trois
	// unités six dixièmes zéro centième, écriture attendue par la leçon des décimaux).
	// Tout passage par un Number le supprimerait.
	it('les zéros décimaux significatifs survivent (jamais de Number)', () => {
		expect(formatReponseRevelee('3.60')).toBe('3,60');
		expect(formatReponseRevelee('0.50')).toBe('0,50');
		expect(formatReponseRevelee('3,60')).toBe('3,60');
		expect(formatReponseRevelee('1.000')).toBe('1,000');
		expect(formatReponseRevelee('12.0')).toBe('12,0');
	});

	it('la partie entière d’un décimal est groupée au même seuil que les entiers', () => {
		expect(formatReponseRevelee('1234,5')).toBe('1234,5'); // 4 chiffres : pas de séparateur
		expect(formatReponseRevelee('12345,5')).toBe(`12${U202F}345,5`);
		expect(formatReponseRevelee('12345.5')).toBe(`12${U202F}345,5`);
		expect(formatReponseRevelee('1234567.89')).toBe(`1${U202F}234${U202F}567,89`);
	});

	it('un décimal négatif garde son signe', () => {
		expect(formatReponseRevelee('-3.5')).toBe('-3,5');
		expect(formatReponseRevelee('-12345.75')).toBe(`-12${U202F}345,75`);
	});

	// Point 4 du contrat : la fonction ignore les unités. Compléter « 3,5 » en
	// « 3,50 » parce que ce serait un montant est le sujet de #542, par un autre
	// chemin (une unité déclarée sur l'étape) — ici ce serait inventer une décimale.
	it('aucune décimale n’est AJOUTÉE (les euros ne sont pas le sujet de cette fonction)', () => {
		expect(formatReponseRevelee('3.5')).not.toBe('3,50');
		expect(formatReponseRevelee('3')).toBe('3');
		expect(formatReponseRevelee('3')).not.toBe('3,00');
	});

	it('décimal hors précision d’un number : aucun arrondi, virgule quand même', () => {
		// Passer par un Number rabattrait la partie entière sur ...568 et raboterait les
		// décimales : la mise en forme travaille sur les CHIFFRES, pas sur une valeur.
		const rendu = formatReponseRevelee('12345678901234567890.12345678901234567890');
		expect(chiffresDe(rendu)).toBe('1234567890123456789012345678901234567890');
		expect(rendu).toContain(',');
		expect(rendu).not.toContain('.');
	});

	it('zéros de tête sur la partie entière d’un décimal : virgule posée, chiffres intacts', () => {
		// Cas défensif (aucune leçon n'en produit) : on n'exige pas un groupement
		// particulier, seulement les deux garanties du contrat — la virgule remplace le
		// point, et aucun chiffre ne disparaît.
		const rendu = formatReponseRevelee('007.5');
		expect(rendu).toContain(',');
		expect(rendu).not.toContain('.');
		expect(chiffresDe(rendu)).toBe('0075');
	});

	it('idempotence : un décimal déjà mis en forme ne bouge plus', () => {
		const une = formatReponseRevelee('12345.5');
		expect(formatReponseRevelee(une)).toBe(une);
		expect(formatReponseRevelee(formatReponseRevelee('3.60'))).toBe('3,60');
	});
});

describe('Critère 4 — tout ce qui n’est pas un nombre sort inchangé, à l’octet', () => {
	it('texte pur : conjugaison, vocabulaire, géométrie, signes, phrases', () => {
		for (const v of [
			'suis',
			'a',
			'mangeait',
			'losange',
			'pavé droit',
			'Oui',
			'Non',
			'Vrai',
			'Faux',
			'>',
			'<',
			'=',
			'.', // réponse RÉELLE de fr-gram-ponctuation : un point tout seul
			'!',
			'?',
			"Elle n'aime pas les carottes.", // phrase terminée par un point
			'escargot histoire mouton robot vache',
			"s'écouler (le temps)",
		]) {
			expect(formatReponseRevelee(v)).toBe(v);
		}
	});

	// Piège classique : ces réponses COMMENCENT par un chiffre. Tout parse
	// « permissif » (parseInt / parseFloat) rendrait « 1 » au lieu de « 1er groupe ».
	it('une réponse qui commence par un chiffre mais reste du texte est intacte', () => {
		expect(formatReponseRevelee('1er groupe')).toBe('1er groupe');
		expect(formatReponseRevelee('2e groupe')).toBe('2e groupe');
		expect(formatReponseRevelee('3e groupe')).toBe('3e groupe');
		expect(formatReponseRevelee('dans les milliers (4 chiffres)')).toBe(
			'dans les milliers (4 chiffres)',
		);
	});

	it('mesure avec unité et heure : la valeur garde son unité', () => {
		for (const v of ['12 h', '4 h 30', '7 h 00', '45 min', '2 h 30 min', '3 kg', '25 cm']) {
			expect(formatReponseRevelee(v)).toBe(v);
		}
	});

	it('écriture fractionnaire : rien à grouper, rien à changer', () => {
		for (const v of ['1/2', '8/10', '2/100', '27/5']) {
			expect(formatReponseRevelee(v)).toBe(v);
		}
	});

	// LE piège du chantier : une LISTE de nombres séparés par des espaces est, une fois
	// les espaces neutralisés, un « nombre » parfaitement fini. La révélation d'un
	// rangement doit rester une suite, jamais un unique nombre géant.
	it('liste de nombres (rangement) : la suite reste une suite', () => {
		for (const v of [
			'104 100 98 94',
			'5421 5142 2514 2154',
			'17 59 440 894 2439',
			'3,94 ; 3,8 ; 3,60',
			'rectangle ; carré',
		]) {
			expect(formatReponseRevelee(v)).toBe(v);
		}
	});

	// Aux marges du motif : ce qui RESSEMBLE à un nombre sans en être un (séparateur
	// sans chiffres derrière, sans chiffres devant, deux séparateurs, espace interne).
	// Tout laisser passer ici, c'est risquer de fabriquer une réponse qui n'existe pas.
	it('formes numériques INCOMPLÈTES ou douteuses : intactes', () => {
		for (const v of ['3.', '3,', '.5', ',5', '1.2.3', '1,2,3', '1 000.5', '-', '+3', '3-']) {
			expect(formatReponseRevelee(v)).toBe(v);
		}
	});

	it('bande d’intercalation déjà rédigée et groupée : sortie identique', () => {
		const bande = `un nombre entre 6${U202F}100${U202F}000 et 6${U202F}200${U202F}000`;
		expect(formatReponseRevelee(bande)).toBe(bande);
		expect(formatReponseRevelee('un nombre entre 450 et 465')).toBe('un nombre entre 450 et 465');
	});

	it('chaîne vide : rien à révéler, donc rien à inventer (jamais « 0 »)', () => {
		// Number('') vaut 0 : sans garde-fou, un champ sans réponse afficherait « → 0 ».
		expect(formatReponseRevelee('')).toBe('');
	});
});

describe('Critère 5 — ni la valeur ni la précision ne changent', () => {
	it('idempotence : un entier DÉJÀ groupé se révèle à l’identique', () => {
		const groupe = `654${U202F}000`;
		expect(formatReponseRevelee(groupe)).toBe(groupe);
		const deja = formatNombre(1400000);
		expect(formatReponseRevelee(deja)).toBe(deja);
		// Deux passages valent un seul (le marqueur peut être réécrit sur re-vérification).
		expect(formatReponseRevelee(formatReponseRevelee('2300000'))).toBe(
			formatReponseRevelee('2300000'),
		);
	});

	it('zéros de tête d’un entier : repli sur l’entrée, aucun chiffre perdu', () => {
		// Passer par un Number rendrait « 7 » : la réponse révélée ne serait plus celle
		// que la correction attendait (point 2 du contrat : repli).
		expect(formatReponseRevelee('007')).toBe('007');
		expect(formatReponseRevelee('0012345')).toBe('0012345');
	});

	it('entier au-delà de la précision d’un number : repli, aucun arrondi', () => {
		// 9007199254740993 n'est pas représentable en double : le passage par Number
		// le change en …992. Un chiffre modifié dans une réponse révélée est un mensonge.
		expect(formatReponseRevelee('9007199254740993')).toBe('9007199254740993');
		expect(formatReponseRevelee('12345678901234567890')).toBe('12345678901234567890');
		// La borne du sûr, elle, se met bien en forme (repli ≠ « je renonce dès que c'est long »).
		expect(formatReponseRevelee('9007199254740991')).toBe(grouperAttendu('9007199254740991'));
	});

	it('« -0 » : repli (le zéro négatif ne se relit pas à l’identique)', () => {
		expect(formatReponseRevelee('-0')).toBe('-0');
	});

	it('espaces de bord : rognés, valeur intacte', () => {
		// Aucune `answer` du catalogue n'a d'espace de bord (le linter de typographie les
		// interdit) : cas DÉFENSIF, mais le contrat le tranche (point 1 : « espaces de
		// bord rognés »).
		expect(formatReponseRevelee(' 42 ')).toBe('42');
		expect(formatReponseRevelee(' 2300000 ')).toBe(`2${U202F}300${U202F}000`);
		expect(formatReponseRevelee(' 3.5 ')).toBe('3,5');
	});

	it('invariant sur TOUT le catalogue : aucun chiffre perdu, aucune valeur changée', () => {
		// Deux régimes, un seul invariant de fond : la révélation dit EXACTEMENT la
		// réponse attendue. Sur un nombre unique, la mise en forme peut changer les
		// séparateurs (groupement, virgule) mais NI les chiffres NI la valeur ; sur tout
		// le reste, elle ne change rien du tout.
		for (const lesson of getAllLessons()) {
			for (const level of lesson.levels) {
				for (let i = 0; i < 25; i++) {
					const item = genLessonItem(lesson, level);
					const brut = String(item.answer);
					const revelee = formatReponseRevelee(brut);
					const ou = `${lesson.id} / ${level} : « ${brut} »`;
					if (estNombreUnique(brut)) {
						expect(chiffresDe(revelee), ou).toBe(chiffresDe(brut));
						expect(parseNombreFr(revelee), ou).toBe(parseNombreFr(brut));
						// Le point anglo-saxon ne survit jamais à la révélation d'un nombre.
						expect(revelee, ou).not.toContain('.');
					} else {
						expect(revelee, ou).toBe(brut);
					}
				}
			}
		}
	});
});

/* ---------------------------------------------------------------
   Critère 2 (versant logique) : les FORMES de réponse réellement produites par
   chaque grande famille. L'e2e vérifie le rendu à l'écran ; ici on vérifie que la
   fonction traite correctement ce que les générateurs lui enverront vraiment.
   --------------------------------------------------------------- */

function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	expect(l, `leçon absente du catalogue : ${id}`).toBeDefined();
	return l!;
}

/* Réponses distinctes réellement générées par une leçon, tous niveaux confondus. */
function reponsesReelles(id: string, tirages = 120): string[] {
	const l = lecon(id);
	const vues = new Set<string>();
	for (const level of l.levels) {
		for (let i = 0; i < tirages; i++) vues.add(String(genLessonItem(l, level).answer));
	}
	return [...vues];
}

describe('Formes réelles du catalogue, famille par famille (critère 2)', () => {
	it('numération / calcul : les entiers ≥ 10 000 ressortent groupés, les petits nus', () => {
		let grandsVus = 0;
		let petitsVus = 0;
		for (const lesson of getAllLessons()) {
			for (const level of lesson.levels) {
				for (let i = 0; i < 20; i++) {
					const brut = String(genLessonItem(lesson, level).answer);
					// Entiers « canoniques » seulement : ni zéro de tête ni magnitude non sûre,
					// donc hors des cas de repli du point 2.
					if (!/^(?:0|-?[1-9]\d*)$/.test(brut) || !Number.isSafeInteger(Number(brut))) continue;
					const attendu = grouperAttendu(brut);
					expect(formatReponseRevelee(brut), `${lesson.id} / ${level} : « ${brut} »`).toBe(attendu);
					if (attendu.includes(U202F)) grandsVus++;
					else petitsVus++;
				}
			}
		}
		// L'échantillon a bien rencontré les deux régimes (sinon le test ne prouve rien).
		expect(grandsVus).toBeGreaterThan(0);
		expect(petitsVus).toBeGreaterThan(0);
	});

	it('décimaux : les réponses à virgule du catalogue sortent à la virgule', () => {
		let vus = 0;
		for (const lesson of getAllLessons()) {
			for (const level of lesson.levels) {
				for (let i = 0; i < 20; i++) {
					const brut = String(genLessonItem(lesson, level).answer);
					if (!DECIMAL.test(brut)) continue;
					vus++;
					const revelee = formatReponseRevelee(brut);
					const ou = `${lesson.id} / ${level} : « ${brut} »`;
					expect(revelee, ou).toContain(',');
					expect(revelee, ou).not.toContain('.');
					// Partie décimale recopiée telle quelle : « 3,60 » garde son zéro.
					expect(revelee.split(',')[1], ou).toBe(brut.split(/[.,]/)[1]);
				}
			}
		}
		expect(vus).toBeGreaterThan(0); // des décimaux existent bien dans le catalogue
	});

	// La monnaie CM1 est le cas qui a motivé l'élargissement : son `answer` sort d'un
	// `String(renduC / 100)`, donc avec un POINT (« 3.45 »). Elle n'est pas atteignable
	// par `lesson.levels` (le CM1 de cette leçon n'est pas encore surfacé, cf.
	// core/catalog.ts) : on interroge donc son `exerciseType` directement, comme le
	// font déjà les tests de numération.
	it('monnaie CM1 : « 3.45 » se révèle « 3,45 » (le point ne doit jamais s’afficher)', () => {
		const exType = lecon('mes-monnaie-rendu').exerciseType;
		let vusAvecPoint = 0;
		for (let i = 0; i < 400 && vusAvecPoint < 30; i++) {
			const ex = exType.generate({ level: 'cm1' });
			if (ex.type !== 'text' || !ex.answer.includes('.')) continue;
			vusAvecPoint++;
			const revelee = formatReponseRevelee(ex.answer);
			expect(revelee, `« ${ex.answer} »`).not.toContain('.');
			expect(revelee).toBe(ex.answer.replace('.', ','));
			// La saisie de l'enfant à la virgule est déjà acceptée par la correction
			// (parseNombreFr) : révéler la virgule ne crée aucune incohérence.
			expect(exType.check(ex, revelee), `« ${revelee} »`).toBe(true);
		}
		expect(vusAvecPoint).toBeGreaterThan(0); // le point décimal est bien une forme réelle
	});

	it('mesures — lecture de l’heure : « 7 h 00 » n’est pas un nombre', () => {
		const reponses = reponsesReelles('mes-lecture-heure');
		expect(reponses.length).toBeGreaterThan(0);
		for (const r of reponses) {
			expect(r).toMatch(/^\d{1,2} h \d{2}$/); // la forme du catalogue n'a pas bougé
			expect(formatReponseRevelee(r)).toBe(r);
		}
	});

	it('conjugaison : forme verbale et libellé de groupe, intacts', () => {
		for (const id of ['fr-conj-etre-present', 'fr-conj-avoir-present', 'fr-conj-groupe']) {
			const reponses = reponsesReelles(id, 60);
			expect(reponses.length, id).toBeGreaterThan(0);
			for (const r of reponses) expect(formatReponseRevelee(r), `${id} : « ${r} »`).toBe(r);
		}
	});

	it('intercalation : la bande de data-attendue sort telle qu’elle a été rédigée', () => {
		const l = lecon('num-encadrer-intercaler');
		let bandesVues = 0;
		for (const level of l.levels) {
			for (let i = 0; i < 300 && bandesVues < 40; i++) {
				const item = genLessonItem(l, level);
				if (!item.intervalle) continue;
				bandesVues++;
				const bande = attendueItem(item); // source unique de la bande (#446)
				expect(bande).toContain('un nombre entre');
				expect(formatReponseRevelee(bande)).toBe(bande);
			}
		}
		expect(bandesVues).toBeGreaterThan(0); // l'intercalation par intervalle existe bien
	});

	it('droite graduée : une réponse déjà groupée à la génération n’est pas re-groupée', () => {
		const reponses = reponsesReelles('num-droite-entiers', 80);
		expect(reponses.length).toBeGreaterThan(0);
		let groupeesVues = 0;
		for (const r of reponses) {
			expect(formatReponseRevelee(r), `« ${r} »`).toBe(r);
			if (r.includes(U202F)) groupeesVues++;
		}
		// Cette leçon libelle sa cible via formatNombre : au CM1 elle produit bien des
		// réponses déjà groupées (le cas d'idempotence qui compte réellement).
		expect(groupeesVues).toBeGreaterThan(0);
	});
});

/* `nettoyerSaisieNombre` est importé par les tests d'espaces ci-dessus via
   `parseNombreFr` ; on garde une assertion directe pour documenter le lien entre la
   forme révélée et la forme ACCEPTÉE à la saisie (le groupement affiché est
   retapable tel quel). */
describe('la forme révélée reste une forme acceptée à la saisie', () => {
	it('un grand nombre révélé, recopié tel quel par l’enfant, se renettoie en sa valeur', () => {
		const revelee = formatReponseRevelee('2300000');
		expect(nettoyerSaisieNombre(revelee)).toBe('2300000');
		const decimal = formatReponseRevelee('12345.5');
		expect(parseNombreFr(decimal)).toBe(12345.5);
	});
});

/* ---------------------------------------------------------------
   Ce qui part à l'OREILLE (#501, avis relecteur-accessibilite). Le groupement est fait
   pour l'œil. Deux canaux LISENT ces textes et n'ont rien à faire du séparateur : la
   synthèse vocale du bouton « Écouter » (déjà couverte par tests/tts-text.test.ts) et
   les régions `role="status"`, lues par le lecteur d'écran de l'enfant — une pipeline
   que le projet ne maîtrise pas, et dont on sait déjà qu'au moins un moteur épelle les
   groupes au lieu de lire un entier. `sansSeparateurMilliers` est la règle commune ;
   on l'éprouve ici comme fonction pure, et à son point d'entrée réel dans
   tests/revelation-neutre.test.ts (`annoncerStatut`).
   --------------------------------------------------------------- */
describe('sansSeparateurMilliers — le texte destiné à l’oreille (#501)', () => {
	it('recolle les classes d’un grand nombre, une seule ou plusieurs d’un coup', () => {
		expect(sansSeparateurMilliers(`12${U202F}345`)).toBe('12345');
		expect(sansSeparateurMilliers(`1${U202F}002${U202F}050`)).toBe('1002050'); // deux classes
		expect(sansSeparateurMilliers(`9${U202F}999${U202F}999`)).toBe('9999999');
	});

	it('l’espace insécable U+00A0 compte aussi (contenus plus anciens), même mélangé', () => {
		expect(sansSeparateurMilliers(`1${U00A0}234`)).toBe('1234');
		expect(sansSeparateurMilliers(`1${U00A0}002${U202F}050`)).toBe('1002050');
	});

	it('exige un CHIFFRE de chaque côté : les espaces d’une phrase restent des espaces', () => {
		// Sans cette condition, la fonction souderait les mots d'un message et le rendrait
		// illisible — c'est tout l'intérêt de ne pas réutiliser `nettoyerSaisieNombre` ici.
		expect(sansSeparateurMilliers(`mot${U202F}mot`)).toBe(`mot${U202F}mot`);
		expect(sansSeparateurMilliers(`3${U202F}kg`)).toBe(`3${U202F}kg`);
		expect(sansSeparateurMilliers(`kg${U202F}3`)).toBe(`kg${U202F}3`);
		// Espace ORDINAIRE entre chiffres : ce n'est pas un séparateur de milliers (c'est la
		// suite d'un rangement, « 104 100 98 94 ») — on n'y touche pas.
		expect(sansSeparateurMilliers('104 100 98 94')).toBe('104 100 98 94');
	});

	it('dans une phrase : seul le nombre est recollé, les mots et la ponctuation restent', () => {
		expect(sansSeparateurMilliers(`La bonne réponse était 2${U202F}300${U202F}000.`)).toBe(
			'La bonne réponse était 2300000.',
		);
		// Bande d'intercalation annoncée à l'oral : deux nombres recollés, « et » intact.
		expect(
			sansSeparateurMilliers(`un nombre entre 6${U202F}100${U202F}000 et 6${U202F}200${U202F}000`),
		).toBe('un nombre entre 6100000 et 6200000');
	});

	it('la partie décimale est conservée (seuls les milliers sont recollés)', () => {
		expect(sansSeparateurMilliers(`12${U202F}345,5`)).toBe('12345,5');
		expect(sansSeparateurMilliers('3,60')).toBe('3,60');
	});

	it('idempotence, et texte sans séparateur rendu inchangé', () => {
		const une = sansSeparateurMilliers(`1${U202F}002${U202F}050`);
		expect(sansSeparateurMilliers(une)).toBe(une);
		expect(sansSeparateurMilliers('')).toBe('');
		expect(sansSeparateurMilliers('chat')).toBe('chat');
		expect(sansSeparateurMilliers('9999')).toBe('9999');
	});

	// Le lien avec #501 : ce que la révélation AFFICHE ne doit jamais partir tel quel à
	// l'oreille. Les deux fonctions sont complémentaires, pas concurrentes.
	it('composée avec formatReponseRevelee : l’œil voit groupé, l’oreille entend collé', () => {
		const affiche = formatReponseRevelee('2300000');
		expect(affiche).toContain(U202F);
		expect(sansSeparateurMilliers(affiche)).toBe('2300000');
	});
});
