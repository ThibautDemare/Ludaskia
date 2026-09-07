/* ============================================================
   Étagère de jeux (#661) — l'APPELANT de la règle d'invitation.

   Pourquoi un fichier de plus, alors que `doitInviter` est déjà épuisée sur ses 32
   entrées : parce que le bug du 2026-09-07 n'était pas dans la règle. La règle
   recevait un booléen juste ; c'est le CALCUL de ce booléen qui était faux, et il
   vit chez l'appelant (`src/ui/jeux-invitation.ts`). Deux fichiers répondaient
   différemment à la même question — « y a-t-il quelque chose à ouvrir ? » —
   `jeux-etagere.ts` comptant les jeux ET les choix dus, l'appelant de l'invitation
   ne comptant que les jeux.

   Conséquence vécue : l'enfant qui ferme son tout premier écran de choix possède
   zéro jeu et a un choix en attente. L'entrée « Mes jeux » apparaissait, l'invitation
   se taisait, et le critère 42 interdit tout badge sur l'accueil — donc plus rien ne
   le ramenait vers ce qu'il venait de gagner, jusqu'au palier suivant (niveau 6).

   Ce test-ci est le seul endroit où cette erreur pouvait être attrapée sans ouvrir un
   navigateur : `invitationHTML` rend une chaîne, donc elle se lit sans rendu. Ce qui
   reste à l'e2e : que le bloc arrive à l'écran, et sa formulation.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { invitationHTML } from '../src/ui/jeux-invitation';
import {
	ajouterJeu,
	empilerPaliers,
	marquerPalierPropose,
	consommerPalier,
} from '../src/core/jeux/etat';
import { initProfiles, touchActiveProfile, setPref } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/** L'invitation est-elle présente dans le balisage rendu ? */
const invite = (ou: 'programme' | 'ecran' = 'ecran'): boolean =>
	invitationHTML(ou).balisage.includes('jeu-invitation');

describe('invitationHTML — « quelque chose à ouvrir » compte les DEUX sources', () => {
	it('n’invite pas un profil neuf : ni jeu, ni choix dû (critère 27)', () => {
		expect(invite()).toBe(false);
	});

	it('invite quand l’enfant possède un jeu', () => {
		ajouterJeu('motus');
		expect(invite()).toBe(true);
	});

	it('invite avec ZÉRO jeu possédé mais un choix de palier en attente', () => {
		// Le cas du bug : palier franchi, écran de choix ouvert puis fermé sans choisir.
		empilerPaliers([1]);
		marquerPalierPropose(1); // ouvert, donc plus de relance automatique
		expect(invite()).toBe(true); // ... mais l'invitation, elle, doit parler
	});

	it('invite aussi quand le choix n’a pas encore été présenté', () => {
		// Même état sans le marquage : le choix est dû, c'est tout ce qui compte ici.
		empilerPaliers([2]);
		expect(invite()).toBe(true);
	});

	it('se tait de nouveau si l’attente se vide sans qu’aucun jeu soit entré', () => {
		/* Cas dégénéré mais net : un palier consommé au vivier vide (critère 9) laisse
		   l'étagère sans jeu ET sans choix dû. Il n'y a alors plus rien à ouvrir, et
		   l'invitation doit se taire — sinon elle enverrait l'enfant sur une liste vide. */
		empilerPaliers([1]);
		expect(invite()).toBe(true);
		expect(consommerPalier(1)).toBe(true); // choix soldé, aucun jeu ajouté
		expect(invite()).toBe(false);
		ajouterJeu('2048');
		expect(invite()).toBe(true);
	});
});

describe('invitationHTML — les réglages de l’encadrant restent maîtres', () => {
	it('se tait quand l’encadrant coupe l’accès aux jeux, choix dû ou non', () => {
		empilerPaliers([1]);
		setPref('sansJeux', true);
		expect(invite()).toBe(false);
	});

	it('se tait quand l’encadrant coupe l’invitation, l’étagère restant accessible', () => {
		ajouterJeu('motus');
		setPref('sansInvitationJeux', true);
		expect(invite()).toBe(false);
	});
});
