/* ============================================================
   Récap éphémère de fin de séance (#537) — logique pure : ce que le récap NOMME.

   Critère 9 de l'issue : « tests Vitest, écrits par un AUTEUR DISTINCT de l'auteur du
   code, sur la fonction pure qui décide ce que le récap nomme : sélection, agrégation
   par catégorie au-delà de 5, et règle de suppression ». Les attendus sont donc dérivés
   des CRITÈRES de l'issue (3, 5, 6, 11, 12) et du contrat d'API arrêté au cadrage,
   jamais relus dans l'implémentation.

   Ce qui est éprouvé ici :
   - sélection et dédoublonnage (critère 1 : le récap NOMME les notions travaillées) ;
   - la frontière exacte 5 nommées / 6 agrégées (critère 5), le fait que le
     dédoublonnage PRÉCÈDE le seuil (6 entrées pour 5 notions restent nommées), et le
     PLAFOND de 5 libellés qui vaut AUSSI pour la forme agrégée par catégorie ;
   - le dédoublonnage des LIBELLÉS dans la forme nommée (deux variantes de niveau d'une
     même notion ne se lisent pas deux fois), le seuil restant compté sur les ids ;
   - la robustesse de `tour` : l'appelant le COMPOSE (décalage journalier + compteur
     d'activité), donc n'importe quel entier doit rester dans le jeu de gabarits ;
   - la variation de formulation et sa ROTATION (critère 6) ;
   - l'absence de chiffre, de mesure et de comparaison dans ce que l'enfant lit
     (critère 12) — y compris sur les gabarits rendus, pour que la règle tienne aussi
     sur un gabarit ajouté plus tard, sans dépendre de la seule relecture humaine ;
   - la règle de suppression du récap autonome (critère 3), dont le cas « à revoir » ;
   - l'absence de toute écriture de stockage (critère 11).

   Volontairement PAS éprouvé : le TEXTE exact des gabarits (en relecture côté
   rédaction) — seules leurs propriétés sont tenues (distincts, rotation, énumération
   présente, aucun chiffre ni comparaison).

   Ce module est PUR (aucun DOM, aucun stockage, aucune dépendance au catalogue : les
   libellés lui sont fournis par l'appelant). Le `beforeEach` maison de fraîcheur
   (`initProfiles()`) n'a donc rien à réinitialiser : on se contente de vider
   `localStorage` pour pouvoir AFFIRMER qu'aucune clé n'apparaît (critère 11).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	MAX_NOTIONS_NOMMEES,
	contenuRecap,
	GABARITS_RECAP,
	phraseRecap,
	recapAutonomeMasque,
	type NotionRecap,
	type ContenuRecap,
} from '../src/core/recap-notions';
import { enumererFr } from '../src/core/utils';
import type { SeanceModeKind } from '../src/core/seance';

beforeEach(() => {
	localStorage.clear();
});

/* ---------- Fixtures ---------- */

const n = (id: string, label: string, categorie: string): NotionRecap => ({
	id,
	label,
	categorie,
});

/* Notions plausibles pour composer des séances de taille variable, sans dépendre du
   catalogue réel (le module ne le lit pas : les libellés lui sont fournis). */
const CATALOGUE_FACTICE: readonly NotionRecap[] = [
	n('l1', 'Additionner sans retenue', 'Calcul'),
	n('l2', 'Comparer des nombres', 'Nombres'),
	n('l3', 'Le pluriel des noms', 'Orthographe'),
	n('l4', "Lire l'heure", 'Grandeurs et mesures'),
	n('l5', 'Reconnaître un angle droit', 'Géométrie'),
	n('l6', 'Le sujet du verbe', 'Grammaire'),
	n('l7', 'Les tables de multiplication', 'Calcul'),
	n('l8', 'Les synonymes', 'Vocabulaire'),
	n('l9', 'Encadrer un nombre', 'Nombres'),
	n('l10', 'Le périmètre', 'Grandeurs et mesures'),
	n('l11', 'Les homophones', 'Orthographe'),
	n('l12', 'Convertir des longueurs', 'Grandeurs et mesures'),
];

const seance = (taille: number): NotionRecap[] => CATALOGUE_FACTICE.slice(0, taille);

const distinctes = (labels: readonly string[]) => new Set(labels).size === labels.length;

/* ---------- Sélection et agrégation ---------- */

describe('contenuRecap — ce que le récap nomme', () => {
	it('aucune notion travaillée ⇒ rien à nommer, donc aucun récap', () => {
		expect(contenuRecap([])).toBeNull();
	});

	it('une seule notion ⇒ elle est nommée', () => {
		const c = contenuRecap([n('l1', 'Additionner sans retenue', 'Calcul')]);
		expect(c).toEqual({ forme: 'notions', labels: ['Additionner sans retenue'] });
	});

	it('critère 5 : le plafond de notions nommées est de 5', () => {
		expect(MAX_NOTIONS_NOMMEES).toBe(5);
	});

	it("bord bas du seuil : 5 notions distinctes sont toutes nommées, dans l'ordre de rencontre", () => {
		const c = contenuRecap(seance(MAX_NOTIONS_NOMMEES));
		expect(c?.forme).toBe('notions');
		expect(c?.labels).toEqual([
			'Additionner sans retenue',
			'Comparer des nombres',
			'Le pluriel des noms',
			"Lire l'heure",
			'Reconnaître un angle droit',
		]);
	});

	it('bord haut du seuil : à 6 notions distinctes, le récap agrège par catégorie', () => {
		const c = contenuRecap(seance(MAX_NOTIONS_NOMMEES + 1));
		expect(c?.forme).toBe('categories');
		/* Ces 6 notions couvrent 6 catégories distinctes, mais l'agrégat est plafonné
		   comme la forme nommée : seules les 5 premières rencontrées sont dites. */
		expect(c?.labels).toEqual([
			'Calcul',
			'Nombres',
			'Orthographe',
			'Grandeurs et mesures',
			'Géométrie',
		]);
	});

	it('le plafond vaut aussi pour les catégories : au-delà de 5, les suivantes tombent', () => {
		/* 8 notions couvrant 7 catégories distinctes : « Grammaire » et « Vocabulaire »,
		   rencontrées en 6e et 7e position, ne sont pas nommées. */
		const c = contenuRecap(seance(8));
		expect(c?.forme).toBe('categories');
		expect(c?.labels).toHaveLength(MAX_NOTIONS_NOMMEES);
		expect(c?.labels).toEqual([
			'Calcul',
			'Nombres',
			'Orthographe',
			'Grandeurs et mesures',
			'Géométrie',
		]);
		expect(c?.labels).not.toContain('Grammaire');
		expect(c?.labels).not.toContain('Vocabulaire');
	});

	it("les catégories agrégées sont dédoublonnées, dans l'ordre de rencontre", () => {
		/* 7 notions dont 3 en « Calcul » et 2 en « Nombres » : 4 catégories attendues. */
		const c = contenuRecap([
			n('l1', 'Additionner', 'Calcul'),
			n('l2', 'Comparer', 'Nombres'),
			n('l3', 'Soustraire', 'Calcul'),
			n('l4', 'Le sujet', 'Grammaire'),
			n('l5', 'Encadrer', 'Nombres'),
			n('l6', 'Multiplier', 'Calcul'),
			n('l7', 'Le pluriel', 'Orthographe'),
		]);
		expect(c).toEqual({
			forme: 'categories',
			labels: ['Calcul', 'Nombres', 'Grammaire', 'Orthographe'],
		});
	});

	it("6 notions d'une seule catégorie ⇒ une seule catégorie nommée", () => {
		const notions = ['Additionner', 'Soustraire', 'Multiplier', 'Diviser', 'Doubler', 'Moitié'].map(
			(label, i) => n(`l${i}`, label, 'Calcul'),
		);
		expect(contenuRecap(notions)).toEqual({ forme: 'categories', labels: ['Calcul'] });
	});

	it('le dédoublonnage précède le seuil : 6 entrées pour 5 notions distinctes restent nommées', () => {
		const notions = [...seance(5), n('l3', 'Le pluriel des noms', 'Orthographe')];
		const c = contenuRecap(notions);
		expect(c?.forme).toBe('notions');
		expect(c?.labels).toHaveLength(5);
	});

	it("un même id revu plusieurs fois n'est nommé qu'une fois, à sa place d'origine", () => {
		const c = contenuRecap([
			n('l1', 'Additionner', 'Calcul'),
			n('l2', 'Comparer', 'Nombres'),
			n('l1', 'Additionner', 'Calcul'),
			n('l1', 'Additionner', 'Calcul'),
		]);
		expect(c).toEqual({ forme: 'notions', labels: ['Additionner', 'Comparer'] });
	});

	it('dédoublonnage par id : la PREMIÈRE occurrence fait foi (libellé et catégorie)', () => {
		const c = contenuRecap([
			n('l1', 'Additionner', 'Calcul'),
			n('l1', 'AUTRE LIBELLÉ', 'AUTRE CATÉGORIE'),
			n('l2', 'Comparer', 'Nombres'),
		]);
		expect(c?.labels).toEqual(['Additionner', 'Comparer']);
	});

	it("un id revu avec une autre catégorie n'ajoute pas de catégorie à l'agrégat", () => {
		/* 6 ids distincts (donc forme agrégée) pour 3 catégories seulement : le plafond
		   ne peut pas masquer la catégorie fantôme, c'est bien le dédoublonnage par id
		   qui doit s'en charger. */
		const c = contenuRecap([
			n('l1', 'Additionner', 'Calcul'),
			n('l2', 'Comparer', 'Nombres'),
			n('l3', 'Le pluriel', 'Orthographe'),
			n('l4', 'Soustraire', 'Calcul'),
			n('l5', 'Encadrer', 'Nombres'),
			n('l6', 'Les homophones', 'Orthographe'),
			n('l1', 'Additionner', 'CATÉGORIE FANTÔME'),
		]);
		expect(c).toEqual({ forme: 'categories', labels: ['Calcul', 'Nombres', 'Orthographe'] });
	});

	it("deux ids distincts au même libellé (variantes de niveau) ne le nomment qu'une fois", () => {
		const c = contenuRecap([
			n('add@ce2', 'Additionner', 'Calcul'),
			n('add@cm1', 'Additionner', 'Calcul'),
			n('cmp@ce2', 'Comparer', 'Nombres'),
		]);
		expect(c).toEqual({ forme: 'notions', labels: ['Additionner', 'Comparer'] });
	});

	it('le seuil se compte sur les ids distincts, pas sur les libellés dédoublonnés', () => {
		/* 6 ids distincts pour 5 libellés : on agrège quand même. Sinon deux variantes de
		   niveau d'une même notion suffiraient à faire repasser une séance large sous le
		   seuil, et le récap nommerait 5 libellés pour 6 notions travaillées. */
		const c = contenuRecap([
			n('l1', 'Additionner', 'Calcul'),
			n('l2', 'Comparer', 'Nombres'),
			n('l3', 'Le pluriel', 'Orthographe'),
			n('l4', "Lire l'heure", 'Grandeurs et mesures'),
			n('suj@ce2', 'Le sujet du verbe', 'Grammaire'),
			n('suj@cm1', 'Le sujet du verbe', 'Grammaire'),
		]);
		expect(c?.forme).toBe('categories');
		expect(c?.labels).toEqual([
			'Calcul',
			'Nombres',
			'Orthographe',
			'Grandeurs et mesures',
			'Grammaire',
		]);
	});

	it('critère 12 : le résultat ne porte que la forme et les libellés (aucun compte, aucun score)', () => {
		const c = contenuRecap(seance(3));
		expect(c).not.toBeNull();
		expect(Object.keys(c ?? {}).sort()).toEqual(['forme', 'labels']);
	});

	it("critère 12 : une notion beaucoup travaillée n'est pas annotée d'un « ×N »", () => {
		const notions = Array.from({ length: 4 }, () => n('l1', 'Additionner', 'Calcul'));
		const c = contenuRecap(notions);
		expect(c?.labels).toEqual(['Additionner']);
	});

	it('ne modifie pas la liste reçue (fonction pure)', () => {
		const notions = seance(7).map((x) => Object.freeze({ ...x }));
		const copie = notions.map((x) => ({ ...x }));
		expect(() => contenuRecap(Object.freeze(notions))).not.toThrow();
		expect(notions).toEqual(copie);
	});

	it('invariants sur toutes les tailles de séance de 1 à 12', () => {
		for (let taille = 1; taille <= CATALOGUE_FACTICE.length; taille++) {
			const notions = seance(taille);
			const c = contenuRecap(notions);
			expect(c, `taille ${taille}`).not.toBeNull();
			const attendue = taille <= MAX_NOTIONS_NOMMEES ? 'notions' : 'categories';
			expect(c?.forme, `taille ${taille}`).toBe(attendue);
			/* Ce que l'enfant lit reste court et lisible : jamais plus de libellés que de
			   notions travaillées, jamais de doublon, jamais de libellé vide. */
			expect(c?.labels.length, `taille ${taille}`).toBeGreaterThan(0);
			expect(c?.labels.length, `taille ${taille}`).toBeLessThanOrEqual(taille);
			/* Le plafond vaut pour LES DEUX formes : ce que l'enfant lit ne dépasse jamais
			   5 libellés, qu'ils nomment des notions ou des catégories. */
			expect(c?.labels.length, `taille ${taille}`).toBeLessThanOrEqual(MAX_NOTIONS_NOMMEES);
			expect(distinctes(c?.labels ?? []), `taille ${taille}`).toBe(true);
			for (const label of c?.labels ?? []) expect(label.trim().length).toBeGreaterThan(0);
		}
	});
});

/* ---------- Formulation ---------- */

const LISTE_FACTICE = 'AAA et BBB';

/* Vocabulaire proscrit par le critère 12 : le récap est factuel, sans mesure ni
   comparaison (« pas de pourcentage recalculé, pas de "mieux qu'hier" même sous forme
   encourageante »). On teste le TEXTE RENDU, pas le code source, pour que la règle
   tienne aussi sur un gabarit ajouté plus tard. */
const MOTS_DE_MESURE =
	/\b(mieux|meilleur\w*|pire|record\w*|points?|notes?|scores?|moyennes?|pourcentages?|progr[eè]s|progress\w*|hier|r[eé]ussi\w*|erreurs?|fautes?)\b/i;

const phrasesDesGabarits = () => GABARITS_RECAP.map((g) => g(LISTE_FACTICE));

describe('phraseRecap — la formulation varie (critère 6)', () => {
	const contenu: ContenuRecap = {
		forme: 'notions',
		labels: ['Additionner sans retenue', 'Comparer des nombres', 'Le pluriel des noms'],
	};
	const liste = enumererFr([...contenu.labels]);

	it('au moins trois gabarits de phrase', () => {
		expect(GABARITS_RECAP.length).toBeGreaterThanOrEqual(3);
	});

	it('les gabarits sont réellement distincts les uns des autres', () => {
		expect(new Set(phrasesDesGabarits()).size).toBe(GABARITS_RECAP.length);
	});

	it("chaque gabarit reprend la liste qu'on lui passe et l'encadre d'une phrase", () => {
		for (const rendu of phrasesDesGabarits()) {
			expect(rendu).toContain(LISTE_FACTICE);
			expect(rendu.length).toBeGreaterThan(LISTE_FACTICE.length);
		}
	});

	it("la phrase contient l'énumération à la française des libellés", () => {
		expect(liste).toBe('Additionner sans retenue, Comparer des nombres et Le pluriel des noms');
		for (let tour = 0; tour < GABARITS_RECAP.length * 2; tour++) {
			expect(phraseRecap(contenu, tour), `tour ${tour}`).toContain(liste);
		}
	});

	it('une notion seule : la phrase nomme ce seul libellé', () => {
		const seul: ContenuRecap = { forme: 'notions', labels: ['Additionner sans retenue'] };
		expect(phraseRecap(seul, 0)).toContain('Additionner sans retenue');
	});

	it("deux libellés : énumérés avec « et », sans virgule (bord de l'énumération)", () => {
		const deux: ContenuRecap = { forme: 'notions', labels: ['Additionner', 'Comparer'] };
		expect(phraseRecap(deux, 0)).toContain('Additionner et Comparer');
	});

	it('un tour complet de gabarits produit autant de phrases différentes', () => {
		const vues = new Set<string>();
		for (let tour = 0; tour < GABARITS_RECAP.length; tour++) vues.add(phraseRecap(contenu, tour));
		expect(vues.size).toBe(GABARITS_RECAP.length);
	});

	it('la rotation boucle : le tour N et le tour N + nombre de gabarits donnent la même phrase', () => {
		for (let tour = 0; tour < 8; tour++) {
			expect(phraseRecap(contenu, tour), `tour ${tour}`).toBe(
				phraseRecap(contenu, tour + GABARITS_RECAP.length),
			);
		}
	});

	it('critère 6 : deux tours consécutifs ne donnent jamais la même phrase', () => {
		for (let tour = 0; tour < 20; tour++) {
			expect(phraseRecap(contenu, tour), `tour ${tour}`).not.toBe(phraseRecap(contenu, tour + 1));
		}
	});

	it('un tour très avancé reste une phrase du jeu de gabarits', () => {
		const attendues = GABARITS_RECAP.map((g) => g(liste));
		expect(attendues).toContain(phraseRecap(contenu, 1000));
	});

	it('un tour quelconque, grand ou négatif, ne sort jamais du jeu de gabarits', () => {
		/* L'appelant COMPOSE le tour (un décalage journalier plus un compteur d'activité) :
		   `phraseRecap` doit encaisser n'importe quel entier sans rendre une phrase vide,
		   tronquée, ou hors du jeu. Un modulo non normalisé casserait sur les négatifs. */
		const attendues = new Set(GABARITS_RECAP.map((g) => g(liste)));
		for (let tour = -12; tour <= 40; tour++) {
			const phrase = phraseRecap(contenu, tour);
			expect(attendues.has(phrase), `tour ${tour} -> ${phrase}`).toBe(true);
			expect(phrase, `tour ${tour}`).toContain(liste);
		}
	});

	it('la rotation boucle aussi sur les tours négatifs', () => {
		for (let tour = -8; tour < 4; tour++) {
			expect(phraseRecap(contenu, tour), `tour ${tour}`).toBe(
				phraseRecap(contenu, tour + GABARITS_RECAP.length),
			);
		}
	});

	it('un décalage journalier suffit à changer la première phrase de la séance', () => {
		/* Le compteur d'activité repart de zéro à chaque chargement de page : sans ce
		   décalage, la première phrase de chaque journée serait éternellement la même.
		   La garantie tient si la période de rotation ne divise pas 1 — vrai pour tout
		   jeu de 2 gabarits ou plus. */
		for (let jour = 1; jour < 31; jour++) {
			expect(phraseRecap(contenu, jour), `jour ${jour}`).not.toBe(phraseRecap(contenu, jour + 1));
		}
	});

	it('fonctionne aussi sur la forme agrégée par catégorie', () => {
		const agrege: ContenuRecap = {
			forme: 'categories',
			labels: ['Calcul', 'Nombres', 'Orthographe', 'Grammaire', 'Géométrie', 'Vocabulaire'],
		};
		const listeAgregee = enumererFr([...agrege.labels]);
		for (let tour = 0; tour < GABARITS_RECAP.length; tour++) {
			expect(phraseRecap(agrege, tour), `tour ${tour}`).toContain(listeAgregee);
		}
	});

	it('la phrase est propre : bords trimés, pas de double espace', () => {
		for (let tour = 0; tour < GABARITS_RECAP.length; tour++) {
			const phrase = phraseRecap(contenu, tour);
			expect(phrase).toBe(phrase.trim());
			expect(phrase, phrase).not.toMatch(/ {2}/);
			expect(phrase.length).toBeGreaterThan(liste.length);
		}
	});

	it('critère 12 : aucun gabarit ne chiffre le travail fait', () => {
		for (const rendu of phrasesDesGabarits()) {
			expect(rendu, rendu).not.toMatch(/\d/);
			expect(rendu, rendu).not.toContain('%');
		}
	});

	it('critère 12 : aucun gabarit ne compare ni ne mesure', () => {
		for (const rendu of phrasesDesGabarits()) {
			expect(rendu, rendu).not.toMatch(MOTS_DE_MESURE);
			expect(rendu.toLowerCase(), rendu).not.toContain('moins bien');
		}
	});

	it('critère 12 : la phrase rendue ne chiffre ni ne compare non plus', () => {
		for (let tour = 0; tour < GABARITS_RECAP.length; tour++) {
			const phrase = phraseRecap(contenu, tour);
			expect(phrase, phrase).not.toMatch(/\d/);
			expect(phrase, phrase).not.toMatch(MOTS_DE_MESURE);
		}
	});
});

/* ---------- Règle de suppression du récap autonome ---------- */

/* Étiqueter TOUS les kinds d'étape : si l'union `SeanceModeKind` s'enrichit, ce Record
   ne compile plus, et le cas exhaustif ci-dessous doit être revu. */
const TOUS_LES_KINDS: Record<SeanceModeKind, true> = {
	sprint: true,
	revision: true,
	aRevoir: true,
	leconDuJour: true,
	lecon: true,
	dictee: true,
};
const KINDS_ETAPE = [
	'sprint',
	'revision',
	'aRevoir',
	'leconDuJour',
	'lecon',
	'dictee',
] as const satisfies readonly SeanceModeKind[];

/* Les deux seuls récaps AUTONOMES concernés par la règle de non-doublon. */
const KINDS_AUTONOMES = ['sprint', 'revision'] as const;

describe('recapAutonomeMasque — non-doublon avec le programme du jour (critère 3)', () => {
	it("aucun programme aujourd'hui ⇒ le récap autonome reste", () => {
		for (const kind of KINDS_AUTONOMES) {
			expect(recapAutonomeMasque(kind, null), kind).toBe(false);
		}
	});

	it("programme déjà complété ⇒ le récap reste, même s'il portait une étape du même mode", () => {
		const programme = { complete: true, kinds: ['sprint', 'revision'] as const };
		for (const kind of KINDS_AUTONOMES) {
			expect(recapAutonomeMasque(kind, programme), kind).toBe(false);
		}
	});

	it('programme en cours sans aucune étape en jeu ⇒ le récap reste', () => {
		for (const kind of KINDS_AUTONOMES) {
			expect(recapAutonomeMasque(kind, { complete: false, kinds: [] }), kind).toBe(false);
		}
	});

	it('programme en cours avec une étape sprint ⇒ le récap du sprint est supprimé', () => {
		expect(recapAutonomeMasque('sprint', { complete: false, kinds: ['sprint'] })).toBe(true);
	});

	it('programme en cours avec une étape révision ⇒ le récap de la révision est supprimé', () => {
		expect(recapAutonomeMasque('revision', { complete: false, kinds: ['revision'] })).toBe(true);
	});

	it("un sprint n'est pas masqué par une étape de révision, ni l'inverse", () => {
		expect(recapAutonomeMasque('sprint', { complete: false, kinds: ['revision'] })).toBe(false);
		expect(recapAutonomeMasque('revision', { complete: false, kinds: ['sprint'] })).toBe(false);
	});

	it('critère 3 : « à revoir » ne compte pas comme une étape de révision', () => {
		expect(recapAutonomeMasque('revision', { complete: false, kinds: ['aRevoir'] })).toBe(false);
		expect(recapAutonomeMasque('sprint', { complete: false, kinds: ['aRevoir'] })).toBe(false);
	});

	it('une étape de leçon, de leçon du jour ou de dictée ne masque rien', () => {
		const programme = { complete: false, kinds: ['lecon', 'leconDuJour', 'dictee'] as const };
		for (const kind of KINDS_AUTONOMES) {
			expect(recapAutonomeMasque(kind, programme), kind).toBe(false);
		}
	});

	it("l'étape du même mode masque même noyée dans les autres étapes", () => {
		const programme = { complete: false, kinds: ['lecon', 'aRevoir', 'sprint', 'dictee'] as const };
		expect(recapAutonomeMasque('sprint', programme)).toBe(true);
		expect(recapAutonomeMasque('revision', programme)).toBe(false);
	});

	it('plusieurs étapes du même mode ⇒ toujours masqué (aucun comptage)', () => {
		const programme = { complete: false, kinds: ['sprint', 'sprint', 'sprint'] as const };
		expect(recapAutonomeMasque('sprint', programme)).toBe(true);
	});

	it("cas exhaustif : dans un programme en cours, seule l'étape du même mode masque", () => {
		expect(KINDS_ETAPE.length).toBe(Object.keys(TOUS_LES_KINDS).length);
		for (const etape of KINDS_ETAPE) {
			for (const kind of KINDS_AUTONOMES) {
				expect(
					recapAutonomeMasque(kind, { complete: false, kinds: [etape] }),
					`étape ${etape} / récap ${kind}`,
				).toBe(etape === kind);
			}
		}
	});
});

/* ---------- Critère 11 ---------- */

describe('critère 11 — aucun état persistant pour ce récap', () => {
	it("exercer toute l'API ne crée aucune clé de stockage", () => {
		expect(localStorage.length).toBe(0);
		const contenu = contenuRecap(seance(8));
		if (contenu) {
			for (let tour = 0; tour < 5; tour++) phraseRecap(contenu, tour);
		}
		contenuRecap([]);
		contenuRecap(seance(2));
		recapAutonomeMasque('sprint', null);
		recapAutonomeMasque('revision', { complete: false, kinds: ['revision'] });
		expect(localStorage.length).toBe(0);
	});
});
