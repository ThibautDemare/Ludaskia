import { beforeEach, describe, test, expect, vi } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import {
	setOrigineActivite,
	activiteDemarree,
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

   Deuxième volet : le bouton PRÉCÉDENT du navigateur rejoue `#lecon-<id>` sans repasser
   par un déclencheur. L'origine est donc accordée à une CLÉ d'activité (posée par le
   lancement, confirmée par `activiteDemarree` au démarrage réel) : toute activité qui
   démarre sans être celle du dernier lancement retombe sur la valeur sûre « catalogue ».
   Propriété visée, éprouvée dans les deux sens ci-dessous : l'écran de fin ne doit
   JAMAIS promettre « Retour au programme » à une activité venue du catalogue (l'inverse
   — retomber sur la catégorie — est seulement moins pratique, pas mensonger).
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
	// contaminerait les suivants. L'appel sans clé remet aussi la clé d'activité à vide.
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

describe("activiteDemarree — l'origine n'est accordée qu'à l'activité lancée", () => {
	test("l'activité effectivement lancée depuis le programme garde son origine", () => {
		setOrigineActivite('programme', 'lecon-A');
		activiteDemarree('lecon-A');
		expect(origineActivite()).toBe('programme');
		expect(retourFinActivite(cibleTracee().cible).versProgramme).toBe(true);
	});

	test('« Recommencer » relance la même activité : origine conservée (idempotent)', () => {
		setOrigineActivite('programme', 'lecon-A');
		activiteDemarree('lecon-A');
		activiteDemarree('lecon-A');
		activiteDemarree('lecon-A');
		expect(origineActivite()).toBe('programme');
	});

	test("Précédent sur une activité du programme lancée plus tôt → cible catalogue de l'appelant", () => {
		// A vient du programme et a démarré…
		setOrigineActivite('programme', 'lecon-A');
		activiteDemarree('lecon-A');
		// … puis B est lancée depuis le catalogue (l'origine du module suit B)…
		setOrigineActivite('catalogue', 'lecon-B');
		activiteDemarree('lecon-B');
		// … et le bouton Précédent rejoue l'entrée d'historique de A, sans déclencheur.
		activiteDemarree('lecon-A');
		expect(origineActivite()).toBe('catalogue');
		const { cible, appels } = cibleTracee('Retour à la catégorie');
		const retour = retourFinActivite(cible);
		expect(retour.label).toBe('Retour à la catégorie');
		expect(retour.versProgramme).toBe(false);
		retour.aller();
		expect(appels).toEqual(['appelant']);
		expect(location.hash).toBe('#lecon-en-cours');
	});

	test("la fausse promesse est impossible : une activité du catalogue rejouée n'annonce pas le programme", () => {
		// B est lancée depuis le catalogue et démarre…
		setOrigineActivite('catalogue', 'lecon-B');
		activiteDemarree('lecon-B');
		// … puis A est lancée depuis le programme (origine « programme », clé A)…
		setOrigineActivite('programme', 'lecon-A');
		activiteDemarree('lecon-A');
		// … et Précédent rejoue B : sans le garde-fou, B annoncerait « Retour au programme ».
		activiteDemarree('lecon-B');
		expect(origineActivite()).toBe('catalogue');
		expect(retourFinActivite(cibleTracee().cible).versProgramme).toBe(false);
	});

	test('une activité jamais lancée (accès direct au hash) démarre en « catalogue »', async () => {
		vi.resetModules();
		const frais = await import('../src/ui/retour-activite');
		frais.activiteDemarree('lecon-A'); // aucun déclencheur n'est passé par là
		expect(frais.origineActivite()).toBe('catalogue');
	});

	test('une reprise (origine posée sans clé) ne peut pas accorder le programme', () => {
		// `restoreResume` repose l'origine « catalogue » sans clé : une activité qui démarre
		// derrière ne doit hériter de rien.
		setOrigineActivite('programme', 'lecon-A');
		setOrigineActivite('catalogue');
		activiteDemarree('lecon-A');
		expect(origineActivite()).toBe('catalogue');
	});

	test("une origine « programme » posée sans clé n'est accordée à aucune activité", () => {
		// Filet de sécurité : un déclencheur qui oublierait la clé ne doit pas pouvoir
		// promettre le programme à la première activité qui démarre.
		setOrigineActivite('programme');
		activiteDemarree('lecon-A');
		expect(origineActivite()).toBe('catalogue');
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

	test("startLecon accorde l'origine à la leçon visée, et à elle seule", () => {
		const id = getAllLessons()[0]!.id;
		startLecon(id, 'programme');
		activiteDemarree(id); // c'est bien cette leçon qui démarre
		expect(origineActivite()).toBe('programme');
		// Une autre leçon qui démarrerait derrière (Précédent) ne récupère pas la provenance.
		activiteDemarree('une-autre-lecon');
		expect(origineActivite()).toBe('catalogue');
	});

	test("startOrthoLecon accorde l'origine à la liste visée, et à elle seule", () => {
		startOrthoLecon('liste-test', 'programme');
		activiteDemarree('liste-test');
		expect(origineActivite()).toBe('programme');
		activiteDemarree('autre-liste');
		expect(origineActivite()).toBe('catalogue');
	});
});
