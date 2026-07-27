import { beforeEach, describe, test, expect, vi } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import {
	setOrigineActivite,
	origineActivite,
	retourFinActivite,
	type RetourCible,
} from '../src/ui/retour-activite';
import { getAllLessons } from '../src/core/catalog';
import { startLecon, startOrthoLecon } from '../src/ui/navigation';

/* ============================================================
   Origine de lancement d'une activité et retour de fin (#461).

   Contrat éprouvé ici (dérivé de la spec, pas de l'implémentation) :
   - au chargement, l'origine vaut « catalogue » (accès direct à #lecon-N ou
     rechargement = comportement historique) ;
   - `retourFinActivite` rend la cible de l'appelant quand on vient du catalogue,
     et une cible « programme du jour » (route #seance) quand on vient du programme.

   Le risque fonctionnel de ce mécanisme est la RÉMANENCE : l'origine est un état de
   module, donc un lancement qui oublierait de la reposer hériterait de la provenance
   du précédent. Les tests l'éprouvent explicitement (bascule d'origine entre deux
   activités) et s'en protègent entre eux via le `beforeEach`.
   ============================================================ */

/* Cible « catalogue » traçable : `appels` prouve si l'`aller` rendu est bien CELUI
   DE L'APPELANT (son effet s'exécute) ou non. */
function cibleTracee(label = 'Retour à la catégorie'): {
	cible: RetourCible;
	appels: string[];
} {
	const appels: string[] = [];
	return { cible: { label, aller: () => appels.push('appelant') }, appels };
}

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	// Fraîcheur de l'état de MODULE : sans cette remise à zéro, un test « programme »
	// contaminerait les suivants.
	setOrigineActivite('catalogue');
	// On part « dans une activité » : ainsi une route vers #seance est observable.
	location.hash = 'lecon-en-cours';
});

describe("Origine du lancement d'une activité", () => {
	test('au chargement du module, on est réputé venir du catalogue', async () => {
		vi.resetModules();
		const frais = await import('../src/ui/retour-activite');
		expect(frais.origineActivite()).toBe('catalogue');
	});

	test('un rechargement de page repart du catalogue (origine non persistée)', async () => {
		setOrigineActivite('programme');
		// On NE vide PAS le stockage : si l'origine était persistée, une instance neuve
		// du module la relirait, et un accès direct à #lecon-N renverrait au programme.
		vi.resetModules();
		const apresRechargement = await import('../src/ui/retour-activite');
		expect(apresRechargement.origineActivite()).toBe('catalogue');
	});

	test("poser puis relire l'origine, dans les deux sens", () => {
		setOrigineActivite('programme');
		expect(origineActivite()).toBe('programme');
		setOrigineActivite('catalogue');
		expect(origineActivite()).toBe('catalogue');
	});
});

describe('retourFinActivite — activité lancée depuis le catalogue', () => {
	test("rend la cible de l'appelant telle quelle (libellé + effet), sans marquer le programme", () => {
		const { cible, appels } = cibleTracee("Retour à l'orthographe");
		const retour = retourFinActivite(cible);
		expect(retour.label).toBe("Retour à l'orthographe");
		expect(retour.versProgramme).toBe(false);
		retour.aller();
		expect(appels).toEqual(['appelant']); // c'est bien l'aller de l'appelant
		expect(location.hash).toBe('#lecon-en-cours'); // aucune route imposée
	});

	test('un libellé de programme fourni est ignoré quand on vient du catalogue', () => {
		const { cible, appels } = cibleTracee('Retour');
		const retour = retourFinActivite(cible, 'Arrêter et revenir au programme');
		expect(retour.label).toBe('Retour');
		expect(retour.versProgramme).toBe(false);
		retour.aller();
		expect(appels).toEqual(['appelant']);
	});
});

describe('retourFinActivite — activité lancée depuis le programme du jour', () => {
	test('rend une cible « Retour au programme » qui route vers #seance', () => {
		setOrigineActivite('programme');
		const { cible, appels } = cibleTracee('Retour à la catégorie');
		const retour = retourFinActivite(cible);
		expect(retour.label).toBe('Retour au programme');
		expect(retour.versProgramme).toBe(true);
		retour.aller();
		expect(location.hash).toBe('#seance');
		expect(appels).toEqual([]); // la cible catalogue de l'appelant n'est PAS exécutée
	});

	test('le libellé de programme fourni remplace « Retour au programme »', () => {
		setOrigineActivite('programme');
		const { cible, appels } = cibleTracee('Reprendre plus tard');
		const retour = retourFinActivite(cible, 'Arrêter la dictée');
		expect(retour.label).toBe('Arrêter la dictée');
		expect(retour.versProgramme).toBe(true);
		retour.aller();
		expect(location.hash).toBe('#seance'); // le libellé change, la destination non
		expect(appels).toEqual([]);
	});
});

describe("Rémanence de l'origine entre deux activités", () => {
	test('une activité lancée depuis le catalogue après une activité du programme ne renvoie pas au programme', () => {
		const { cible, appels } = cibleTracee('Retour à la catégorie');
		// 1re activité : venue du programme.
		setOrigineActivite('programme');
		expect(retourFinActivite(cible).versProgramme).toBe(true);
		// 2e activité : lancée depuis le catalogue → la provenance précédente ne doit
		// pas fuiter sur l'écran de fin.
		setOrigineActivite('catalogue');
		const retour = retourFinActivite(cible);
		expect(retour.versProgramme).toBe(false);
		expect(retour.label).toBe('Retour à la catégorie');
		retour.aller();
		expect(appels).toEqual(['appelant']);
		expect(location.hash).toBe('#lecon-en-cours');
	});

	test("appels répétés : la lecture de l'origine n'est pas consommée", () => {
		setOrigineActivite('programme');
		const { cible } = cibleTracee();
		expect(retourFinActivite(cible).versProgramme).toBe(true);
		expect(retourFinActivite(cible).versProgramme).toBe(true);
		expect(origineActivite()).toBe('programme');
	});
});

describe('Déclencheurs : chaque lancement pose son origine', () => {
	test("startLecon sans argument d'origine = lancement catalogue", () => {
		setOrigineActivite('programme'); // provenance résiduelle à écraser
		startLecon(getAllLessons()[0]!.id);
		expect(origineActivite()).toBe('catalogue');
	});

	test("startLecon depuis le programme pose l'origine « programme »", () => {
		startLecon(getAllLessons()[0]!.id, 'programme');
		expect(origineActivite()).toBe('programme');
	});

	test('startOrthoLecon suit la même règle', () => {
		setOrigineActivite('programme');
		startOrthoLecon('liste-test');
		expect(origineActivite()).toBe('catalogue');
		startOrthoLecon('liste-test', 'programme');
		expect(origineActivite()).toBe('programme');
	});
});
