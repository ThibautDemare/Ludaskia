/* ============================================================
   #306 — « Quelqu'un se sert-il VRAIMENT de l'application ? » (`core/engagement.ts`)
   ------------------------------------------------------------
   Deux mécanismes en dépendent, et se trompent de façon coûteuse : le
   réchauffement du cache (850 Ko imposés à un visiteur de passage, sur forfait
   mobile) et le rappel de sauvegarde (un encart qui apparaît alors qu'il n'y a
   rien à perdre, donc qu'on apprend à ignorer).

   Attendus dérivés du cadrage de l'issue (§2), pas de la liste de clés du module :
   - ce qui vient du PREMIER LANCEMENT ne compte pas — l'existence d'un profil
     (prénom, avatar, CLASSE choisie à l'accueil), le tour vu, le mot aux parents,
     les easter eggs. C'est exactement le visiteur qu'on veut exclure ;
   - ce qui compte est une TRACE DE TRAVAIL : une réponse enregistrée côté enfant,
     une décision posée côté encadrant (épingle, séance, « vu en classe », liste de
     dictée, code d'accès, aménagement) ;
   - une clé écrite mais VIDE n'est pas une trace : plusieurs s'initialisent à vide
     à la simple visite d'un écran ;
   - la question porte sur la MAISON : un seul enfant engagé suffit, même si ce
     n'est pas le profil actif (l'export, lui, couvre tout le monde).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { engagementReel } from '../src/core/engagement';
import { lsSetRaw, setOnDataWrite } from '../src/core/storage';
import {
	activeProfile,
	addProfile,
	initProfiles,
	renameProfile,
	setNiveauReference,
	setPrefFor,
	touchActiveProfile,
} from '../src/core/profiles';
import { ACTIVITY_KEY, LESSON_STATS_KEY } from '../src/core/progress';
import { REVOIR_KEY } from '../src/core/encadrant-stats';
import { SEANCE_KEY } from '../src/core/seance';
import { VU_AILLEURS_KEY } from '../src/core/vu-ailleurs';
import { ENCADRANT_LOCK_KEY } from '../src/core/encadrant-lock';
import { TOUR_VU_KEY, MOT_PARENTS_VU_KEY } from '../src/core/tour';
import {
	ORTHO_KEY,
	ajouterMots,
	createListe,
	emptyOrthoState,
	saveOrtho,
} from '../src/core/orthographe/store';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles(); // état d'après l'accueil de premier lancement : un profil existe
});

/** Écriture BRUTE sur un profil donné (l'app le fait par UUID hors profil actif). */
function ecrire(uuid: string, cle: string, valeur: unknown): void {
	lsSetRaw(`${uuid}/${cle}`, JSON.stringify(valeur));
}
/** Une stat de leçon plausible : l'enfant a répondu à une série. */
const STATS = { 'math-doubles@ce2': { attempts: 1, correct: 7, questions: 10, lastAt: 1 } };
/** Une séance au journal d'activité. */
const JOURNAL = [{ t: 1_700_000_000_000, k: 'lecon', ref: 'math-doubles' }];

describe('engagementReel — le premier lancement ne compte pas', () => {
	it('un profil fraîchement créé ne suffit PAS', () => {
		expect(localStorage.getItem('ludaskia_profiles')).not.toBeNull(); // prémisse : le profil existe
		expect(engagementReel()).toBe(false);
	});

	it('prénom, avatar et CLASSE choisis à l’accueil ne comptent pas', () => {
		const p = activeProfile();
		renameProfile(p.uuid, 'Zoé');
		setNiveauReference('cm1'); // choix de la classe = onboarding, pas engagement
		expect(engagementReel()).toBe(false);
	});

	it('les traces de découverte (tour, mot aux parents, eggs) ne comptent pas', () => {
		const p = activeProfile();
		ecrire(p.uuid, TOUR_VU_KEY, true);
		ecrire(p.uuid, MOT_PARENTS_VU_KEY, true);
		ecrire(p.uuid, 'ludaskia_eggs', { luciole: true }); // clé dédiée des easter eggs
		expect(engagementReel()).toBe(false);
	});

	it('un visiteur qui ouvre trente secondes reste non engagé, même après plusieurs écrans', () => {
		// Ouvrir le mode Orthographe écrit son état AVANT qu'aucune liste n'existe.
		saveOrtho(emptyOrthoState());
		expect(localStorage.getItem(`${activeProfile().uuid}/${ORTHO_KEY}`)).not.toBeNull();
		expect(engagementReel()).toBe(false);
	});
});

describe('engagementReel — une trace de travail suffit, une seule', () => {
	it('côté enfant : une réponse enregistrée (stats de leçon)', () => {
		ecrire(activeProfile().uuid, LESSON_STATS_KEY, STATS);
		expect(engagementReel()).toBe(true);
	});

	it('côté enfant : une séance au journal d’activité (même sans le moindre XP)', () => {
		// Un enfant qui se trompe partout a travaillé : l'XP ne peut pas être le signal.
		ecrire(activeProfile().uuid, ACTIVITY_KEY, JOURNAL);
		expect(engagementReel()).toBe(true);
	});

	for (const [quoi, cle, valeur] of [
		['une épingle « à revoir »', REVOIR_KEY, ['math-doubles']],
		['un programme de séance', SEANCE_KEY, [{ id: 's1', label: 'Lundi', items: [] }]],
		['des leçons déclarées vues en classe', VU_AILLEURS_KEY, { 'math-doubles': 1 }],
	] as const) {
		it(`côté encadrant : ${quoi}`, () => {
			ecrire(activeProfile().uuid, cle, valeur);
			expect(engagementReel()).toBe(true);
		});
	}

	it('côté encadrant : un code d’accès posé (clé GLOBALE, hors profil)', () => {
		lsSetRaw(ENCADRANT_LOCK_KEY, JSON.stringify({ hash: 'x', sel: 'y' }));
		expect(engagementReel()).toBe(true);
	});

	it('côté encadrant : une liste de dictée créée', () => {
		const etat = emptyOrthoState();
		createListe(etat, 'Mots du lundi', [{ mot: 'chat' }, { mot: 'chien' }]);
		saveOrtho(etat);
		expect(engagementReel()).toBe(true);
	});

	it('côté encadrant : des mots en banque, même sans liste encore composée', () => {
		const etat = emptyOrthoState();
		ajouterMots(etat, [{ mot: 'chat' }]);
		saveOrtho(etat);
		expect(engagementReel()).toBe(true);
	});

	it('côté encadrant : un aménagement posé sur le profil', () => {
		const p = activeProfile();
		expect(engagementReel()).toBe(false);
		setPrefFor(p.uuid, 'confortLecture', true);
		expect(engagementReel()).toBe(true);
	});

	it('un aménagement chiffré compte aussi (taille de session de révision)', () => {
		setPrefFor(activeProfile().uuid, 'revisionPlafond', 8);
		expect(engagementReel()).toBe(true);
	});

	it('un aménagement remis à OFF ne laisse aucun aménagement posé', () => {
		// Réglage activé puis retiré : l'état du profil est celui du départ. L'engagement
		// viendra du premier vrai usage, pas d'un interrupteur revenu à sa place.
		setPrefFor(activeProfile().uuid, 'confortLecture', false);
		expect(engagementReel()).toBe(false);
	});
});

describe('engagementReel — une clé écrite mais vide n’est pas une trace', () => {
	it('collections vides sur toutes les clés de profil → toujours non engagé', () => {
		const p = activeProfile();
		ecrire(p.uuid, LESSON_STATS_KEY, {});
		ecrire(p.uuid, ACTIVITY_KEY, []);
		ecrire(p.uuid, REVOIR_KEY, []);
		ecrire(p.uuid, SEANCE_KEY, []);
		ecrire(p.uuid, VU_AILLEURS_KEY, {});
		expect(engagementReel()).toBe(false);
	});

	it('état d’orthographe présent, mais sans liste NI banque → non engagé', () => {
		ecrire(activeProfile().uuid, ORTHO_KEY, { banque: {}, listes: [], motIdParForme: {} });
		expect(engagementReel()).toBe(false);
	});

	it('une valeur illisible ne fait pas passer pour engagé (ni ne lève)', () => {
		lsSetRaw(`${activeProfile().uuid}/${ACTIVITY_KEY}`, '{journal tronqué');
		expect(engagementReel()).toBe(false);
	});
});

describe('engagementReel — la maison, pas le profil actif', () => {
	it('un profil NON actif engagé suffit', () => {
		const a = activeProfile();
		const b = addProfile('Profil B'); // devient actif
		ecrire(a.uuid, ACTIVITY_KEY, JOURNAL); // c'est l'AUTRE enfant qui a travaillé
		expect(b.uuid).not.toBe(a.uuid); // prémisse : on ne lit pas l'actif
		expect(engagementReel()).toBe(true);
	});

	it('un aménagement posé sur un profil non actif suffit', () => {
		const a = activeProfile();
		addProfile('Profil B');
		setPrefFor(a.uuid, 'lectureConsigneAuto', true);
		expect(engagementReel()).toBe(true);
	});

	it('des profils tous vides → non engagé', () => {
		addProfile('Profil B');
		addProfile('Profil C');
		expect(engagementReel()).toBe(false);
	});

	it('clé HÉRITÉE sans préfixe (données d’avant les profils multiples) → engagé', () => {
		lsSetRaw(LESSON_STATS_KEY, JSON.stringify(STATS));
		expect(engagementReel()).toBe(true);
	});
});
