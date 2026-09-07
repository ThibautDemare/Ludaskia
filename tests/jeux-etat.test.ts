/* ============================================================
   Étagère de jeux (#661) — l'état stocké : jeux possédés, paliers en attente,
   meilleurs scores.
   Couvre les critères 20 (toute clé commence par `ludaskia_`, et passe par
   lsGet/lsSet — donc suit le profil actif et entre dans la sauvegarde), 7 (les
   paliers franchis s'empilent et se présentent UN PAR UN, aucun perdu),
   17 (meilleur score local) et 23 (jouer n'alimente aucun compteur de
   l'économie).

   Le préfixe est déjà tenu statiquement par `cles-stockage-gate.test.ts` ; ce
   qu'on éprouve ICI, c'est la conséquence OBSERVABLE : la donnée est bien rangée
   sous le profil actif, elle apparaît dans `appKeys()` (donc dans l'export du
   parent et dans la suppression d'un profil), et elle ne fuit pas d'un enfant à
   l'autre.

   MISE À JOUR du 2026-09-07 (arbitrage tracé sur l'issue #661). L'écran de choix
   PROPOSE et n'impose plus : l'enfant peut le fermer. Fermer ne consomme pas le
   palier mais ne le repropose plus automatiquement — il l'attend dans sa liste de
   jeux. D'où deux notions à ne pas confondre, et c'est tout l'objet des tests de
   paliers ci-dessous :
   • « en attente » = le choix reste à faire, et reste ATTEIGNABLE ;
   • « déjà proposé » = on ne rouvrira plus l'écran tout seul.
   Ces tests-ci ne précèdent pas le code, contrairement à la première passe : la
   règle a changé après l'implémentation, et c'est le commentaire daté de l'issue
   qui fait foi ici, pas `src/core/jeux/etat.ts`.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	CLE_POSSEDES,
	CLE_PALIERS_ATTENTE,
	CLE_PALIERS_PROPOSES,
	CLE_PLAFOND,
	CLE_SCORES,
	jeuxPossedes,
	ajouterJeu,
	paliersEnAttente,
	empilerPaliers,
	prochainPalierAProposer,
	marquerPalierPropose,
	consommerPalier,
	meilleurScore,
	enregistrerScore,
} from '../src/core/jeux/etat';
import {
	initProfiles,
	addProfile,
	setActiveProfile,
	activeProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, appKeys, lsGet, lsSet } from '../src/core/storage';
import { getXP, addXP } from '../src/core/progress';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('clés de stockage (critère 20)', () => {
	it('commencent toutes par `ludaskia_`', () => {
		for (const cle of [
			CLE_POSSEDES,
			CLE_PALIERS_ATTENTE,
			CLE_PALIERS_PROPOSES,
			CLE_PLAFOND,
			CLE_SCORES,
		]) {
			expect(cle.startsWith('ludaskia_')).toBe(true);
		}
	});

	it('sont distinctes les unes des autres', () => {
		const cles = [CLE_POSSEDES, CLE_PALIERS_ATTENTE, CLE_PALIERS_PROPOSES, CLE_PLAFOND, CLE_SCORES];
		expect(new Set(cles).size).toBe(cles.length);
	});

	it('entrent dans le périmètre de l’export et de la suppression de profil', () => {
		// `appKeys()` filtre sur `ludaskia_` : une clé hors convention resterait après la
		// suppression du profil et manquerait à la sauvegarde du parent.
		ajouterJeu('motus');
		enregistrerScore('2048', 120);
		empilerPaliers([1]);
		marquerPalierPropose(1);
		const cles = appKeys();
		for (const cle of [CLE_POSSEDES, CLE_SCORES, CLE_PALIERS_ATTENTE, CLE_PALIERS_PROPOSES]) {
			expect(cles.some((k) => k.includes(cle))).toBe(true);
		}
	});
});

describe('jeux possédés', () => {
	it('part de rien sur un profil neuf (critère 27)', () => {
		expect(jeuxPossedes()).toEqual([]);
	});

	it('retient le jeu choisi', () => {
		ajouterJeu('motus');
		expect(jeuxPossedes()).toContain('motus');
	});

	it('ne compte jamais deux fois le même jeu', () => {
		// L'étagère est UNE liste (critère 3) : un doublon s'y verrait.
		ajouterJeu('motus');
		ajouterJeu('motus');
		expect(jeuxPossedes().filter((id) => id === 'motus').length).toBe(1);
	});

	it('reste propre au profil actif', () => {
		ajouterJeu('motus');
		const premier = activeProfile()?.uuid ?? '';
		addProfile('Cadette');
		expect(jeuxPossedes()).toEqual([]); // le petit frère n'hérite de rien
		ajouterJeu('2048');
		expect(jeuxPossedes()).toEqual(['2048']);
		setActiveProfile(premier);
		expect(jeuxPossedes()).toEqual(['motus']);
	});
});

describe('paliers en attente — la pile des choix à faire (critère 7)', () => {
	it('n’a rien en attente au départ', () => {
		expect(paliersEnAttente()).toEqual([]);
		expect(prochainPalierAProposer()).toBeUndefined();
	});

	it('empile plusieurs paliers franchis hors de l’app', () => {
		empilerPaliers([1, 2, 3]);
		expect(paliersEnAttente()).toEqual([1, 2, 3]);
	});

	it('n’écrase pas ce qui attendait déjà', () => {
		// Un palier franchi ne doit jamais être perdu, même si un autre survient avant
		// que l'enfant n'ait fait son choix.
		empilerPaliers([1]);
		empilerPaliers([2, 3]);
		expect(paliersEnAttente()).toEqual([1, 2, 3]);
	});

	it('reste stable si on empile une liste vide', () => {
		empilerPaliers([1]);
		empilerPaliers([]);
		expect(paliersEnAttente()).toEqual([1]);
	});

	it('n’empile pas deux fois le même palier', () => {
		// Un rang déjà en attente ne doit pas ouvrir deux écrans de choix.
		empilerPaliers([1, 2]);
		empilerPaliers([2]);
		expect(paliersEnAttente()).toEqual([1, 2]);
	});

	it('reste propre au profil actif', () => {
		empilerPaliers([1, 2]);
		addProfile('Cadette');
		expect(paliersEnAttente()).toEqual([]);
	});
});

describe('présentation automatique — un par un, et jamais deux fois (2026-09-07)', () => {
	it('propose le premier palier en attente, un seul à la fois', () => {
		// Deux écrans de choix simultanés = le cas d'échec du critère 7.
		empilerPaliers([1, 2, 3]);
		expect(prochainPalierAProposer()).toBe(1);
		expect(prochainPalierAProposer()).toBe(1); // lire ne consomme rien
	});

	it('avance dans l’ordre de franchissement au fil des présentations', () => {
		empilerPaliers([1, 2, 3]);
		marquerPalierPropose(1);
		expect(prochainPalierAProposer()).toBe(2);
		marquerPalierPropose(2);
		expect(prochainPalierAProposer()).toBe(3);
		marquerPalierPropose(3);
		expect(prochainPalierAProposer()).toBeUndefined();
	});

	it('marquer un palier comme présenté ne le consomme PAS', () => {
		// Le choix reste à faire : c'est la différence entre « montré » et « choisi ».
		empilerPaliers([1, 2]);
		marquerPalierPropose(1);
		expect(paliersEnAttente()).toEqual([1, 2]);
	});

	it('ne rouvre plus l’écran d’un palier fermé sans choix', () => {
		/* Le cœur de l'arbitrage : on ouvre (donc on marque), l'enfant ferme, et l'app ne
		   le relance pas. Cas d'échec écrit dans l'issue : « l'écran se réouvre tout
		   seul après avoir été fermé ». */
		empilerPaliers([1]);
		marquerPalierPropose(1); // ouverture
		expect(prochainPalierAProposer()).toBeUndefined(); // fermé : plus de relance
		expect(paliersEnAttente()).toEqual([1]); // mais le choix reste dû
	});

	it('marquer deux fois le même palier ne change rien', () => {
		empilerPaliers([1, 2]);
		marquerPalierPropose(1);
		marquerPalierPropose(1);
		expect(lsGet(CLE_PALIERS_PROPOSES, [])).toEqual([1]);
		expect(prochainPalierAProposer()).toBe(2);
	});

	it('reste propre au profil actif', () => {
		empilerPaliers([1]);
		marquerPalierPropose(1);
		addProfile('Cadette');
		expect(lsGet(CLE_PALIERS_PROPOSES, [])).toEqual([]);
		empilerPaliers([1]);
		expect(prochainPalierAProposer()).toBe(1); // la cadette, elle, doit le voir
	});
});

describe('consommer un palier par son rang — le chemin depuis la liste de jeux', () => {
	it('rend true et retire le palier de l’attente', () => {
		empilerPaliers([1]);
		expect(consommerPalier(1)).toBe(true);
		expect(paliersEnAttente()).toEqual([]);
	});

	it('reste possible pour un palier fermé sans choix', () => {
		/* Cas d'échec écrit dans l'issue : « un palier fermé n'est plus atteignable depuis
		   la liste de jeux ». Il n'est plus PROPOSÉ, il reste CHOISISSABLE. */
		empilerPaliers([1]);
		marquerPalierPropose(1);
		expect(prochainPalierAProposer()).toBeUndefined();
		expect(consommerPalier(1)).toBe(true);
		expect(paliersEnAttente()).toEqual([]);
	});

	it('ne perturbe pas les autres quand on consomme au milieu de la pile', () => {
		// L'enfant choisit dans l'ordre qu'il veut depuis sa liste de jeux.
		empilerPaliers([1, 2, 3]);
		expect(consommerPalier(2)).toBe(true);
		expect(paliersEnAttente()).toEqual([1, 3]); // ordre conservé, rien d'autre perdu
		expect(prochainPalierAProposer()).toBe(1);
	});

	it('rend false sur un rang absent, sans rien casser', () => {
		empilerPaliers([1, 2]);
		expect(consommerPalier(9)).toBe(false);
		expect(consommerPalier(0)).toBe(false);
		expect(paliersEnAttente()).toEqual([1, 2]);
	});

	it('rend false la seconde fois : un choix ne se fait pas deux fois (critère 6)', () => {
		empilerPaliers([1]);
		expect(consommerPalier(1)).toBe(true);
		expect(consommerPalier(1)).toBe(false);
		expect(paliersEnAttente()).toEqual([]);
	});

	it('ne laisse AUCUNE trace dans les « déjà proposés »', () => {
		/* Sinon la clé grossit indéfiniment : elle accumulerait les 18 rangs du parcours,
		   et elle part dans l'export de sauvegarde du parent. Elle ne doit contenir que
		   les paliers effectivement EN ATTENTE et déjà montrés.

		   LECTURE BRUTE VOULUE : `lsGet` va chercher la valeur stockée telle quelle, sans
		   passer par `rangsProposes()`. C'est la seule façon de voir la fuite — le filtre
		   `proposés ⊆ attente` masque le résidu à travers l'API, donc un test qui
		   interrogerait `prochainPalierAProposer` passerait dans les deux cas. Ce test a
		   rougi pour de vrai le 2026-09-07, quand la lecture des proposés se faisait
		   après le retrait de l'attente : la condition de nettoyage ne se déclenchait
		   plus jamais. Ne pas le réécrire « proprement » via l'API : il perdrait
		   exactement ce qu'il garde. */
		empilerPaliers([1, 2]);
		marquerPalierPropose(1);
		expect(consommerPalier(1)).toBe(true);
		expect(lsGet(CLE_PALIERS_PROPOSES, [])).toEqual([]);

		marquerPalierPropose(2);
		expect(consommerPalier(2)).toBe(true);
		expect(lsGet(CLE_PALIERS_PROPOSES, [])).toEqual([]);
		expect(paliersEnAttente()).toEqual([]);
	});

	it('conséquence : un rang re-franchi plus tard se propose à nouveau', () => {
		/* Le vrai enjeu du nettoyage précédent, vu du côté de l'enfant. Un résidu dans les
		   « déjà proposés » rend ce palier définitivement muet — il ne s'ouvrirait plus
		   jamais tout seul, alors qu'il n'a jamais été refusé.

		   ATTENTION : le filtre à la lecture (`proposés ⊆ attente`) ne suffit PAS à tenir
		   ce cas. Il masque le résidu tant que le rang est hors attente, et le RESSUSCITE
		   dès qu'`empilerPaliers` le remet dedans. Il faut donc aussi que la clé soit
		   nettoyée à la consommation. */
		empilerPaliers([1]);
		marquerPalierPropose(1);
		expect(consommerPalier(1)).toBe(true);
		empilerPaliers([1]);
		expect(prochainPalierAProposer()).toBe(1);
	});
});

describe('invariant « déjà proposés » ⊆ « en attente » (2026-09-07)', () => {
	it('ignore un rang cité par la donnée mais absent de l’attente', () => {
		/* Simule ce que le chemin normal ne produit pas mais qu'un import de sauvegarde
		   peut ramener : une clé « proposés » qui parle d'un palier dont plus personne
		   n'attend le choix. Sans bornage à la lecture, ce bruit resterait DÉFINITIF. */
		empilerPaliers([1, 2]);
		lsSet(CLE_PALIERS_PROPOSES, [9]);
		expect(prochainPalierAProposer()).toBe(1);
	});

	it('ignore aussi une donnée de forme aberrante', () => {
		// Même convention de bornage que `getRevisionPlafond` : on ne fait pas confiance
		// à ce qui revient de l'extérieur.
		empilerPaliers([1]);
		lsSet(CLE_PALIERS_PROPOSES, 'pas un tableau');
		expect(prochainPalierAProposer()).toBe(1);
		lsSet(CLE_PALIERS_PROPOSES, [null, 'x', 1]);
		expect(prochainPalierAProposer()).toBeUndefined(); // le 1, lui, est légitime
	});

	it('ne fait pas taire un palier réellement en attente', () => {
		// Le filtre borne le bruit, il ne doit pas manger le signal.
		empilerPaliers([1, 2]);
		marquerPalierPropose(1);
		expect(prochainPalierAProposer()).toBe(2);
	});
});

describe('meilleur score local (critère 17)', () => {
	it('vaut 0 avant la première partie', () => {
		expect(meilleurScore('2048')).toBe(0);
	});

	it('retient le meilleur, jamais le dernier', () => {
		enregistrerScore('2048', 120);
		expect(meilleurScore('2048')).toBe(120);
		enregistrerScore('2048', 40); // partie ratée : le record tient
		expect(meilleurScore('2048')).toBe(120);
		enregistrerScore('2048', 300);
		expect(meilleurScore('2048')).toBe(300);
	});

	it('garde un score par jeu', () => {
		enregistrerScore('2048', 120);
		expect(meilleurScore('motus')).toBe(0);
	});

	it('reste propre au profil actif', () => {
		enregistrerScore('2048', 120);
		addProfile('Cadette');
		expect(meilleurScore('2048')).toBe(0);
	});
});

describe('les jeux n’alimentent pas l’économie (critère 23)', () => {
	it('ne touche ni l’XP ni le niveau', () => {
		addXP(50);
		const avant = getXP();
		ajouterJeu('2048');
		enregistrerScore('2048', 999);
		empilerPaliers([1]);
		marquerPalierPropose(1);
		consommerPalier(1);
		expect(getXP()).toBe(avant);
	});
});
