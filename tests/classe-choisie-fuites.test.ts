/* ============================================================
   Classe choisie sur l'écran d'une catégorie (#772) : ce qui ne doit pas FUIR hors du
   profil et de la page qui l'ont posée. Écrits AVANT la correction, sur les remontées de
   la relecture qualité :
   - défaut 1 : la classe choisie (état de module) survit à un changement de profil ;
   - défaut 2 : elle s'applique encore quand l'adulte a retiré « Autoriser les autres
     classes » (critère 14 : désactivé, l'appli se comporte comme avant #772) ;
   - logique non testée : la règle de survie au changement d'écran (`gardeClasseChoisie`,
     rendue pure) et les dictées des autres classes pour la recherche
     (`dicteesDesAutresClasses`, critères 10 et 13).

   Les TÉMOINS, verts aujourd'hui, prouvent que les observables réagissent au choix : sans
   eux, une correction qui ferait tomber la classe choisie partout passerait tous les tests
   rouges de ce fichier.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import { CATEGORIES, ORTHO_CATEGORY_ID, getAllLessons, getLessonById } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { LEVEL_ORDER } from '../src/core/levels';
import {
	choisirClasse,
	classeChoisie,
	classeDeCategorie,
	gardeClasseChoisie,
	leverClasseChoisie,
	leverNiveauImpose,
	niveauLecon,
} from '../src/core/niveau-actif';
import type { ClasseChoisie } from '../src/core/niveau-actif';
import {
	activeProfile,
	addProfile,
	initProfiles,
	setActiveProfile,
	setNiveauReference,
	setNiveauReferenceFor,
	setPref,
	setPrefFor,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { loadRuns, recordRun } from '../src/core/progress';
import { dicteesDesAutresClasses } from '../src/core/recherche-lecon';
import type { DicteeRecherche } from '../src/core/recherche-lecon';
import { listOrthoLecons } from '../src/core/orthographe/lessons';
import { createListe, emptyOrthoState } from '../src/core/orthographe/store';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	leverNiveauImpose();
	leverClasseChoisie();
});

/* ---------- Données réelles utilisées (préconditions vérifiées plus bas) ---------- */
const NUMERATION = 'math-numeration';
const COMMUNE = 'num-comparer'; // CE2 et CM1
const CALCUL = 'math-calcul'; // CE2 seul ; « Calcul mental » a un id qui le prolonge
const CALCUL_MENTAL = 'math-calcul-mental';
const LECON_CALCUL = getAllLessons().find((l) => l.category === CALCUL)?.id ?? '(absente)';
const DICTEE = 'fr-ortho-invariables-1';
const CHOIX_CE2: ClasseChoisie = { categoryId: NUMERATION, niveau: 'ce2' };

function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
}

/* A (actif) en `classeA`, B (créé sans devenir actif) en `classeB`. */
function deuxProfils(classeA: SchoolLevel, classeB: SchoolLevel): string {
	setNiveauReference(classeA);
	const b = addProfile('B', undefined, { activer: false }).uuid;
	setNiveauReferenceFor(b, classeB);
	return b;
}

/* A (CM1) passe la numération en CE2, puis l'appareil bascule sur B. */
function choixDeAPuisBasculeSurB(classeB: SchoolLevel) {
	const b = deuxProfils('cm1', classeB);
	choisirClasse(NUMERATION, 'ce2');
	expect(classeChoisie(), 'précondition : le choix de A est posé').toEqual(CHOIX_CE2);
	setActiveProfile(b);
	expect(activeProfile().uuid, 'précondition : B est actif').toBe(b);
}

const rang = (n: SchoolLevel) => LEVEL_ORDER.indexOf(n);
const forme = (d: DicteeRecherche) => ({ id: d.id, label: d.label, niveau: d.niveau });
const parId = <T extends { id: string }>(xs: T[]) =>
	[...xs].sort((x, y) => x.id.localeCompare(y.id));

/* Ce que la recherche doit ajouter à `niveau` : les dictées prédéfinies d'une classe
   SUPÉRIEURE (le filtre est cumulatif, celles d'en dessous sont déjà visibles), chacune
   marquée de la classe que lui donnent les données. */
function dicteesAttendues(niveau: SchoolLevel) {
	return parId(
		ORTHO_PREDEF.filter((d) => rang(d.niveau) > rang(niveau)).map((d) => ({
			id: d.id,
			label: d.label,
			niveau: d.niveau,
		})),
	);
}

/* ============================================================ */

describe('préconditions sur les données réelles', () => {
	it('leçon, catégories et dictées citées existent avec la forme attendue', () => {
		expect(lecon(COMMUNE).category).toBe(NUMERATION);
		expect(lecon(COMMUNE).levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
		const ids = CATEGORIES.map((c) => c.id);
		expect(ids).toEqual(expect.arrayContaining([NUMERATION, CALCUL, CALCUL_MENTAL]));
		expect(ids).toContain(ORTHO_CATEGORY_ID);
		expect(CALCUL_MENTAL.startsWith(CALCUL), 'piège de préfixe réel').toBe(true);
		expect(getLessonById(LECON_CALCUL)?.category).toBe(CALCUL);
		expect(ORTHO_PREDEF.some((d) => d.id === DICTEE)).toBe(true);
		// Sans dictée CE2 ET CM1, les tests de dicteesDesAutresClasses passeraient à vide.
		expect(ORTHO_PREDEF.some((d) => d.niveau === 'ce2')).toBe(true);
		expect(ORTHO_PREDEF.some((d) => d.niveau === 'cm1')).toBe(true);
		expect(new Set(ORTHO_PREDEF.map((d) => d.id)).size).toBe(ORTHO_PREDEF.length);
	});
});

describe('défaut 1 : la classe choisie par un profil ne passe pas à un autre', () => {
	it('témoin : sans bascule, le choix de A tient, même après un autre réglage et une écriture de données', () => {
		deuxProfils('cm1', 'cm1');
		choisirClasse(NUMERATION, 'ce2');
		setPref('confortLecture', true); // écrit la méta du profil actif
		recordRun('express', 3, 5, 4_321); // écrit une donnée (touche le profil actif)
		expect(classeChoisie()).toEqual(CHOIX_CE2);
		expect(niveauLecon(lecon(COMMUNE))).toBe('ce2');
		expect(classeDeCategorie(NUMERATION)).toBe('ce2');
		expect(loadRuns('express').map((r) => r.ms)).toEqual([4_321]);
		leverClasseChoisie();
		expect(loadRuns('express'), 'rien dans le classement CM1 de A').toEqual([]);
	});

	describe('A (CM1) choisit CE2 en numération, puis B (CM1) devient actif', () => {
		beforeEach(() => choixDeAPuisBasculeSurB('cm1'));

		it('B n’a aucune classe choisie', () => {
			expect(classeChoisie()).toBeNull();
		});

		it('num-comparer se joue dans la classe de B (CM1)', () => {
			expect(niveauLecon(lecon(COMMUNE))).toBe('cm1');
		});

		it('la numération s’affiche dans la classe de B (CM1)', () => {
			expect(classeDeCategorie(NUMERATION)).toBe('cm1');
		});

		it('un record de bilan de B va dans le classement CM1 de B, pas en CE2', () => {
			recordRun('express', 3, 5, 4_321);
			leverClasseChoisie(); // lecture neutre : le classement de la classe de B
			expect(loadRuns('express').map((r) => r.ms)).toEqual([4_321]);
			setNiveauReference('ce2');
			expect(loadRuns('express'), 'classement CE2 de B').toEqual([]);
		});
	});

	it('variante : B est en CE2, la classe que A avait choisie ; le choix de A ne lui est pas attribué', () => {
		// Ici niveauLecon et classeDeCategorie rendent CE2 avec ou sans fuite : seul l'état du
		// choix distingue « B n'a rien choisi » de « B porte le choix de A ».
		choixDeAPuisBasculeSurB('ce2');
		expect(classeChoisie()).toBeNull();
	});
});

describe('défaut 2 : sans « Autoriser les autres classes », aucun choix ne vaut', () => {
	beforeEach(() => setNiveauReference('cm1'));

	it('témoin : réglage explicitement à false, le choix tient', () => {
		setPref('sansAutresClasses', false);
		choisirClasse(NUMERATION, 'ce2');
		expect(classeChoisie()).toEqual(CHOIX_CE2);
		expect(niveauLecon(lecon(COMMUNE))).toBe('ce2');
	});

	it('témoin : l’accès retiré à un AUTRE profil ne retire rien au profil actif', () => {
		const b = addProfile('B', undefined, { activer: false }).uuid;
		setPrefFor(b, 'sansAutresClasses', true);
		choisirClasse(NUMERATION, 'ce2');
		expect(classeChoisie()).toEqual(CHOIX_CE2);
		expect(niveauLecon(lecon(COMMUNE))).toBe('ce2');
	});

	describe('accès retiré AVANT le choix', () => {
		beforeEach(() => {
			setPref('sansAutresClasses', true);
			choisirClasse(NUMERATION, 'ce2');
		});

		it('aucune classe choisie', () => {
			expect(classeChoisie()).toBeNull();
		});

		it('la leçon se joue et la page s’affiche dans la classe du profil', () => {
			expect(niveauLecon(lecon(COMMUNE))).toBe('cm1');
			expect(classeDeCategorie(NUMERATION)).toBe('cm1');
		});

		it('un record va dans le classement de la classe du profil', () => {
			recordRun('express', 3, 5, 4_321);
			leverClasseChoisie();
			expect(loadRuns('express').map((r) => r.ms)).toEqual([4_321]);
		});
	});

	it('accès retiré APRÈS le choix (espace encadrant, sur le profil actif) : le choix ne vaut plus', () => {
		choisirClasse(NUMERATION, 'ce2');
		expect(niveauLecon(lecon(COMMUNE)), 'précondition : le choix vaut').toBe('ce2');
		setPrefFor(activeProfile().uuid, 'sansAutresClasses', true);
		expect(classeChoisie()).toBeNull();
		expect(niveauLecon(lecon(COMMUNE))).toBe('cm1');
		expect(classeDeCategorie(NUMERATION)).toBe('cm1');
	});
});

/* ============================================================ */

describe('gardeClasseChoisie : la classe choisie survit-elle à cet écran ?', () => {
	it.each([
		'',
		'matieres',
		'categorie-math-calcul',
		'encadrant',
		'revision-espacee',
		'ortho-revoir',
	])('sans choix, rien à lever : vrai pour « %s »', (h) => {
		expect(gardeClasseChoisie(h, null)).toBe(true);
	});

	describe('choix posé sur « Calcul » (maths)', () => {
		const choix: ClasseChoisie = { categoryId: CALCUL, niveau: 'ce2' };
		const garde: [string, boolean][] = [
			// Ce qui se lance depuis la page, et le retour sur elle.
			[`categorie-${CALCUL}`, true],
			[`bilan-cat-${CALCUL}`, true],
			[`lecon-${LECON_CALCUL}`, true],
			[`lecon-${LECON_CALCUL}@ce2`, true],
			[`mode-${LECON_CALCUL}`, true],
			['sprint', true],
			['revision', true],
			// Partout ailleurs, le choix tombe.
			['', false],
			['matieres', false],
			['matiere-math', false],
			[`categorie-${CALCUL_MENTAL}`, false], // id qui prolonge celui de la catégorie
			[`bilan-cat-${CALCUL_MENTAL}`, false],
			[`categorie-${NUMERATION}`, false],
			[`bilan-cat-${NUMERATION}`, false],
			[`categorie-${ORTHO_CATEGORY_ID}`, false],
			['sprint-config', false],
			['bilan-custom', false],
			['revision-espacee', false],
			['encadrant', false],
			['encadrant/suivi', false],
			['profils', false],
			['seance', false],
			['envoi/ABC123', false],
			[`ortho-${DICTEE}`, false],
			[`ortho-mode-${DICTEE}`, false],
			['ortho-revoir', false],
		];
		it.each(garde)('« %s » → %s', (h, attendu) => {
			expect(gardeClasseChoisie(h, choix)).toBe(attendu);
		});
	});

	describe('choix posé sur l’Orthographe', () => {
		const choix: ClasseChoisie = { categoryId: ORTHO_CATEGORY_ID, niveau: 'cm1' };
		const garde: [string, boolean][] = [
			[`categorie-${ORTHO_CATEGORY_ID}`, true],
			[`ortho-${DICTEE}`, true],
			[`ortho-mode-${DICTEE}`, true],
			['ortho-revoir', true],
			['sprint', true],
			['revision', true],
			['', false],
			['matieres', false],
			['matiere-francais', false],
			[`categorie-${CALCUL}`, false],
			[`bilan-cat-${CALCUL}`, false],
			['sprint-config', false],
			['bilan-custom', false],
			['revision-espacee', false],
			['encadrant', false],
		];
		it.each(garde)('« %s » → %s', (h, attendu) => {
			expect(gardeClasseChoisie(h, choix)).toBe(attendu);
		});
	});
});

/* ============================================================ */

describe('dicteesDesAutresClasses : les dictées que la recherche ajoute (critères 10 et 13)', () => {
	it('profil CE2 : toutes les dictées prédéfinies CM1, marquées cm1, aucune CE2', () => {
		const r = dicteesDesAutresClasses(emptyOrthoState(), 'ce2');
		expect(r.map((d) => d.niveau)).not.toContain('ce2');
		const cm1 = ORTHO_PREDEF.filter((d) => d.niveau === 'cm1').map((d) => d.id);
		expect(r.map((d) => d.id)).toEqual(expect.arrayContaining(cm1));
		expect(parId(r.map(forme))).toEqual(dicteesAttendues('ce2'));
	});

	it('profil CM1 : aucune, tout est déjà visible', () => {
		expect(dicteesDesAutresClasses(emptyOrthoState(), 'cm1')).toEqual([]);
	});

	it('chaque dictée porte la classe de SES données, pas la classe demandée (profil CP : CE2 et CM1)', () => {
		const r = dicteesDesAutresClasses(emptyOrthoState(), 'cp');
		expect(parId(r.map(forme))).toEqual(dicteesAttendues('cp'));
		expect(new Set(r.map((d) => d.niveau))).toEqual(new Set(['ce2', 'cm1']));
	});

	it.each<SchoolLevel>(['cp', 'ce2', 'cm1'])(
		'%s : avec les dictées déjà visibles, chaque prédéfinie sort une fois et une seule',
		(niveau) => {
			const etat = emptyOrthoState();
			const visibles = listOrthoLecons(etat, niveau)
				.filter((l) => l.source === 'predefini')
				.map((l) => l.id);
			const autres = dicteesDesAutresClasses(etat, niveau).map((d) => d.id);
			expect(
				autres.filter((id) => visibles.includes(id)),
				'doublons',
			).toEqual([]);
			expect([...visibles, ...autres].sort()).toEqual(ORTHO_PREDEF.map((d) => d.id).sort());
		},
	);

	it('une liste du parent n’y figure jamais, quelle que soit la classe', () => {
		const etat = emptyOrthoState();
		const liste = createListe(etat, 'Mots de la semaine', [{ mot: 'maison' }, { mot: 'jardin' }]);
		expect(
			listOrthoLecons(etat, 'ce2').some((l) => l.id === liste.id),
			'précondition : la liste est bien dans l’état',
		).toBe(true);
		for (const niveau of ['cp', 'ce2', 'cm1'] as const) {
			const r = dicteesDesAutresClasses(etat, niveau);
			expect(
				r.map((d) => d.id),
				niveau,
			).not.toContain(liste.id);
			expect(parId(r.map(forme)), niveau).toEqual(dicteesAttendues(niveau));
		}
	});
});
