/* ============================================================
   Récap éphémère de fin de séance (#537) — couche UI, part TESTABLE SANS NAVIGATEUR :
   résolution des notions (catalogue + niveau joué) et mémoire éphémère par profil.

   Auteur des tests DISTINCT de l'auteur du code : les attendus viennent des critères de
   l'issue et des DONNÉES du catalogue (le libellé que l'enfant avait sous les yeux),
   jamais de l'implémentation.

   Ce qui est éprouvé ici :
   - `notionsDepuisPerLesson` : le piège du seau VIDE (`scoreItems` crée l'entrée d'une
     leçon dès qu'un champ la référence, même laissé sans réponse — « tu as travaillé X »
     serait alors faux pour la seule leçon que l'enfant a justement sautée), l'ordre de
     rencontre, et l'id inconnu du catalogue ;
   - `notionLecon` / `notionGroupe` : libellé et catégorie LISIBLES (jamais un id brut),
     libellé résolu au niveau joué (#436), id de dédoublonnage sans collision possible ;
   - la mémoire éphémère : cumul dans la page, cloisonnement par mode et surtout PAR
     PROFIL — changer de profil ne recharge pas la page, donc une mémoire globale
     accolerait le sprint d'un enfant à l'étape « Sprint » du programme de son frère ;
   - critère 11 : aucune clé de stockage créée.

   Le rendu (`recapHTML`, `recapAutonomeHTML`) n'est PAS testé ici : c'est de l'e2e.
   Ce module lit le catalogue et le profil actif, d'où le `beforeEach` de fraîcheur du
   pattern maison, complété par `oublierNotions()` (la mémoire est un état de module, elle
   ne meurt pas avec le `localStorage`).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	notionsDepuisPerLesson,
	notionLecon,
	notionGroupe,
	noterNotions,
	notionsNotees,
	oublierNotions,
} from '../src/ui/recap-seance';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { getLessonById } from '../src/core/catalog';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	oublierNotions();
});

/* Leçons réelles du catalogue, choisies pour leurs propriétés :
   - `math-doubles` / `math-moities` : deux leçons de la même catégorie, libellé simple ;
   - `fr-gram-clic-noyau` : libellé PAR NIVEAU (#436), « nom » en CE2, « nom noyau » en
     CM1 — le seul moyen de vérifier que le récap nomme la leçon comme l'écran joué. */
const DOUBLES = 'math-doubles';
const MOITIES = 'math-moities';
const NOYAU = 'fr-gram-clic-noyau';
const INCONNUE = 'lecon-qui-n-existe-pas-537';

const seau = (ok: number, total: number) => ({ ok, total });
const ids = (notions: readonly { id: string }[]) => notions.map((n) => n.id);
const clesStockage = () =>
	Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).sort();

describe('notionsDepuisPerLesson (agrégat de séance → notions nommables)', () => {
	it('un agrégat vide ne nomme rien', () => {
		expect(notionsDepuisPerLesson({})).toEqual([]);
	});

	it('une leçon sans AUCUNE réponse donnée est écartée (seau créé mais jamais rempli)', () => {
		const notions = notionsDepuisPerLesson({
			[DOUBLES]: seau(0, 0), // champ affiché, laissé vide : rien n'a été travaillé
			[MOITIES]: seau(1, 3),
		});
		expect(ids(notions)).toEqual([MOITIES]);
	});

	it("une leçon entièrement FAUSSE est gardée : travailler n'est pas réussir", () => {
		// Critère 12 : le récap est factuel. Écarter les échecs le transformerait en
		// palmarès, et la leçon la plus utile à nommer serait justement celle qui manque.
		expect(ids(notionsDepuisPerLesson({ [DOUBLES]: seau(0, 4) }))).toEqual([DOUBLES]);
	});

	it("l'ordre de rencontre est conservé", () => {
		expect(ids(notionsDepuisPerLesson({ [MOITIES]: seau(2, 2), [DOUBLES]: seau(1, 2) }))).toEqual([
			MOITIES,
			DOUBLES,
		]);
		expect(ids(notionsDepuisPerLesson({ [DOUBLES]: seau(1, 2), [MOITIES]: seau(2, 2) }))).toEqual([
			DOUBLES,
			MOITIES,
		]);
	});

	it('une leçon inconnue du catalogue est ignorée, jamais nommée par son id brut', () => {
		const notions = notionsDepuisPerLesson({ [INCONNUE]: seau(1, 1), [DOUBLES]: seau(1, 1) });
		expect(ids(notions)).toEqual([DOUBLES]);
		for (const n of notions) expect(n.label).not.toBe(INCONNUE);
	});

	it("la notion porte l'id de la leçon (clé de dédoublonnage du récap)", () => {
		const notions = notionsDepuisPerLesson({ [DOUBLES]: seau(1, 2) });
		expect(notions).toEqual([{ id: DOUBLES, label: 'Doubles', categorie: 'Calcul mental' }]);
	});
});

describe('notionLecon (résolution catalogue)', () => {
	it("id inconnu du catalogue ⇒ null (rien à nommer plutôt qu'un id affiché)", () => {
		expect(notionLecon(INCONNUE)).toBeNull();
		expect(notionLecon('')).toBeNull();
	});

	it('leçon réelle : libellé et catégorie LISIBLES, jamais un id technique', () => {
		const n = notionLecon(DOUBLES)!;
		expect(n).toEqual({ id: DOUBLES, label: 'Doubles', categorie: 'Calcul mental' });
		// La catégorie est le LIBELLÉ humain, pas l'id du catalogue : c'est ce que l'enfant
		// lit quand la séance bascule en agrégation par catégorie.
		expect(n.categorie).not.toBe(getLessonById(DOUBLES)!.category);
	});

	it('libellé résolu au niveau JOUÉ (#436), pas au libellé neutre du catalogue', () => {
		setNiveauReference('ce2');
		expect(notionLecon(NOYAU)!.label).toBe('Clique sur le nom');
		setNiveauReference('cm1');
		expect(notionLecon(NOYAU)!.label).toBe('Clique sur le nom noyau');
	});
});

describe("notionGroupe (mots d'orthographe, hors catalogue)", () => {
	it('un groupe de mots se nomme par son libellé, et sert aussi de catégorie', () => {
		const n = notionGroupe('Les mots invariables');
		expect(n.label).toBe('Les mots invariables');
		expect(n.categorie).toBe('Les mots invariables');
	});

	it('son id de dédoublonnage ne peut pas se confondre avec un id de leçon', () => {
		// Cas adverse : un groupe qui porterait le nom exact d'une leçon. Si les deux ids se
		// confondaient, l'un des deux disparaîtrait du récap sans qu'on sache lequel.
		const n = notionGroupe(DOUBLES);
		expect(n.id).not.toBe(DOUBLES);
		expect(getLessonById(n.id)).toBeFalsy();
		expect(notionGroupe('Les mots invariables').id).not.toBe('Les mots invariables');
	});

	it('deux groupes distincts ne se confondent pas, un même groupe est stable', () => {
		expect(notionGroupe('Les sons').id).not.toBe(notionGroupe('Les accents').id);
		expect(notionGroupe('Les sons').id).toBe(notionGroupe('Les sons').id);
	});
});

describe('mémoire éphémère des notions travaillées', () => {
	const noter = (kind: 'sprint' | 'revision', ...lecons: string[]) =>
		noterNotions(
			kind,
			lecons.map((id) => notionLecon(id)!),
		);

	it('vide au démarrage, pour les deux modes', () => {
		expect(notionsNotees('sprint')).toEqual([]);
		expect(notionsNotees('revision')).toEqual([]);
	});

	it("cumul dans la page : deux sprints d'affilée donnent l'union, dans l'ordre", () => {
		noter('sprint', DOUBLES);
		noter('sprint', MOITIES);
		expect(ids(notionsNotees('sprint'))).toEqual([DOUBLES, MOITIES]);
	});

	it('les deux modes ne se mélangent pas', () => {
		noter('sprint', DOUBLES);
		noter('revision', MOITIES);
		expect(ids(notionsNotees('sprint'))).toEqual([DOUBLES]);
		expect(ids(notionsNotees('revision'))).toEqual([MOITIES]);
	});

	it('la liste rendue est une COPIE : la muter ne touche pas la mémoire', () => {
		noter('sprint', DOUBLES);
		const lue = notionsNotees('sprint');
		lue.push(notionGroupe('Injecté'));
		lue.length = 0;
		expect(ids(notionsNotees('sprint'))).toEqual([DOUBLES]);
	});

	it('cloisonnement PAR PROFIL : ce que A a noté ne ressort jamais sous B', () => {
		noter('sprint', DOUBLES);
		addProfile('Profil B'); // devient actif — SANS rechargement de page
		expect(notionsNotees('sprint')).toEqual([]);
		expect(notionsNotees('revision')).toEqual([]);
	});

	it('chaque profil retrouve les siennes en revenant', () => {
		const a = activeProfile().uuid;
		noter('sprint', DOUBLES);
		const b = addProfile('Profil B').uuid;
		noter('sprint', MOITIES);
		expect(ids(notionsNotees('sprint'))).toEqual([MOITIES]);
		setActiveProfile(a);
		expect(ids(notionsNotees('sprint'))).toEqual([DOUBLES]);
		setActiveProfile(b);
		expect(ids(notionsNotees('sprint'))).toEqual([MOITIES]);
	});

	it('oublierNotions remet à zéro, tous profils confondus', () => {
		const a = activeProfile().uuid;
		noter('sprint', DOUBLES);
		const b = addProfile('Profil B').uuid;
		noter('revision', MOITIES);
		oublierNotions();
		expect(notionsNotees('revision')).toEqual([]);
		setActiveProfile(a);
		expect(notionsNotees('sprint')).toEqual([]);
		setActiveProfile(b);
		expect(notionsNotees('revision')).toEqual([]);
	});

	it('critère 11 : noter et relire des notions ne crée aucune clé de stockage', () => {
		const avant = clesStockage();
		noter('sprint', DOUBLES, MOITIES);
		noter('revision', DOUBLES);
		notionsNotees('sprint');
		notionsNotees('revision');
		expect(clesStockage()).toEqual(avant);
	});
});
