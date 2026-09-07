/* ============================================================
   Étagère de jeux (#661) — la règle qui décide si l'on invite l'enfant vers
   l'étagère en fin de travail.
   Source : le commentaire daté du 2026-09-06 sur l'issue #661, sections 4 et 5
   (le corps de l'issue, qui disait seulement « l'écran de fin de séance », ne
   fait plus foi sur ce point). Plus le critère 27 : rien côté enfant avant le
   premier palier.

   Trois règles, indépendantes, qu'on éprouve séparément puis ensemble :
   1. un programme du jour actif DÉPLACE l'invitation en fin de programme — il ne
      l'ajoute pas : sur les deux emplacements possibles, exactement un invite ;
   2. l'invitation est SUBORDONNÉE à l'accès : couper l'accès la coupe, quel que
      soit le réglage d'invitation ;
   3. sans jeu possédé, il n'y a rien à proposer.

   La table des entrées est petite (3 booléens × 2 situations × 2 emplacements =
   32 lignes) : on l'épuise entièrement, c'est assez rare pour en profiter.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { doitInviter } from '../src/core/jeux/invitation';
import type { ContexteInvitation } from '../src/core/jeux/invitation';

/** Contexte « tout au vert » : accès ouvert, invitation autorisée, étagère non vide
 *  (au moins un jeu possédé OU un choix de palier encore dû). */
const vert = (
	programmeActif: boolean,
	ou: 'programme' | 'ecran',
	reglages: Partial<ContexteInvitation> = {},
): ContexteInvitation => ({
	etagereActive: true,
	invitationActive: true,
	etagereNonVide: true,
	programmeActif,
	ou,
	...reglages,
});

/* Les quatre situations possibles : (programme du jour actif ?) × (où l'on est). */
const SITUATIONS: { programmeActif: boolean; ou: 'programme' | 'ecran'; libelle: string }[] = [
	{ programmeActif: true, ou: 'programme', libelle: 'fin du programme du jour' },
	{ programmeActif: true, ou: 'ecran', libelle: 'écran de fin ordinaire, un programme est actif' },
	{ programmeActif: false, ou: 'programme', libelle: 'fin de programme sans programme actif' },
	{ programmeActif: false, ou: 'ecran', libelle: 'écran de fin ordinaire, aucun programme' },
];

describe('doitInviter — un programme actif DÉPLACE l’invitation (section 4)', () => {
	it('invite en fin de programme quand un programme du jour est actif', () => {
		expect(doitInviter(vert(true, 'programme'))).toBe(true);
	});

	it('n’invite nulle part ailleurs tant qu’un programme est actif', () => {
		// Cas d'échec écrit dans la section 4 : « un programme est actif et l'invitation
		// apparaît aussi en fin de sprint ».
		expect(doitInviter(vert(true, 'ecran'))).toBe(false);
	});

	it('invite sur les écrans de fin ordinaires quand aucun programme n’est actif', () => {
		expect(doitInviter(vert(false, 'ecran'))).toBe(true);
	});

	it('EXACTEMENT un emplacement invite, dans les deux cas de figure', () => {
		/* C'est la différence entre « déplacer » et « ajouter ». Corollaire assumé : sans
		   programme actif, l'emplacement « fin de programme » n'invite pas — cet état ne
		   devrait jamais se présenter, mais la règle doit rester vraie s'il se présente,
		   sinon l'enfant pourrait être invité deux fois le même jour. */
		for (const programmeActif of [true, false]) {
			const emplacements = (['programme', 'ecran'] as const).map((ou) =>
				doitInviter(vert(programmeActif, ou)),
			);
			expect(emplacements.filter(Boolean).length).toBe(1);
		}
	});
});

describe('doitInviter — les réglages de l’encadrant (section 5)', () => {
	it('n’invite jamais quand l’accès aux jeux est coupé, même si l’invitation est autorisée', () => {
		// « L'invitation est SUBORDONNÉE à l'accès, pas indépendante de lui. »
		for (const s of SITUATIONS) {
			for (const invitationActive of [true, false]) {
				expect(
					doitInviter(vert(s.programmeActif, s.ou, { etagereActive: false, invitationActive })),
				).toBe(false);
			}
		}
	});

	it('n’invite pas quand l’encadrant a coupé l’invitation, accès ouvert ou non', () => {
		for (const s of SITUATIONS) {
			expect(doitInviter(vert(s.programmeActif, s.ou, { invitationActive: false }))).toBe(false);
		}
	});

	it('les deux réglages sont bien distincts : accès ouvert + invitation coupée ≠ tout coupé', () => {
		/* Ce que la fonction doit refléter, c'est que l'accès reste ouvert (l'entrée
		   d'étagère vit sa vie, critère 1) alors que l'invitation se tait. Côté invitation,
		   les deux cas répondent false — mais pour des raisons différentes, et un futur
		   raccourci qui ferait dépendre l'accès de l'invitation casserait le critère 1. */
		expect(doitInviter(vert(false, 'ecran', { invitationActive: false }))).toBe(false);
		expect(doitInviter(vert(false, 'ecran', { etagereActive: false }))).toBe(false);
		expect(doitInviter(vert(false, 'ecran'))).toBe(true);
	});
});

describe('doitInviter — rien à proposer, rien à dire (critère 27)', () => {
	it('n’invite pas quand l’étagère est vide', () => {
		// Avant le premier palier (niveau 2), il n'y a ni jeu ni choix dû : inviter
		// enverrait l'enfant sur une liste vide, et formulerait le jeu comme une promesse.
		for (const s of SITUATIONS) {
			expect(doitInviter(vert(s.programmeActif, s.ou, { etagereNonVide: false }))).toBe(false);
		}
	});

	it('invite dès qu’il y a quelque chose à ouvrir', () => {
		expect(doitInviter(vert(false, 'ecran', { etagereNonVide: true }))).toBe(true);
	});

	it('« non vide » veut dire un jeu OU un choix dû — pas « possède un jeu »', () => {
		/* Le cas qui manquait, et qui a coûté un bug (2026-09-07) : un enfant qui ferme
		   son tout premier écran de choix possède ZÉRO jeu et a un choix en attente. Le
		   champ s'appelait alors `aUnJeu`, il valait `false`, et l'invitation se taisait —
		   alors que le critère 42 interdit tout badge sur l'accueil, donc plus rien ne
		   ramenait l'enfant vers ce qu'il avait gagné.

		   Vu d'ici, ce cas ne se distingue plus du cas nominal : `doitInviter` reçoit un
		   booléen déjà calculé, et c'est bien le sens du renommage — la règle ne doit pas
		   avoir à connaître les deux sources. Ce que ce test garde, c'est donc le NOM et
		   son intention ; la fusion des deux sources, elle, est asservie plus bas au
		   niveau de l'appelant, seul endroit où l'erreur pouvait se produire. */
		const zeroJeuMaisUnChoixDu = vert(false, 'ecran', { etagereNonVide: true });
		expect(doitInviter(zeroJeuMaisUnChoixDu)).toBe(true);
	});
});

describe('doitInviter — la table complète des 32 entrées', () => {
	it('n’invite QUE quand les trois conditions sont réunies ET que l’emplacement est le bon', () => {
		/* Les 4 lignes vraies, écrites à la main : tout au vert, et l'emplacement qui
		   correspond à la présence (ou non) d'un programme du jour. */
		expect(doitInviter(vert(true, 'programme'))).toBe(true);
		expect(doitInviter(vert(false, 'ecran'))).toBe(true);
		expect(doitInviter(vert(true, 'ecran'))).toBe(false);
		expect(doitInviter(vert(false, 'programme'))).toBe(false);

		/* Les 28 autres : dès qu'un des trois interrupteurs est éteint, aucune situation
		   n'invite. Balayage exhaustif. */
		let vues = 0;
		for (const etagereActive of [true, false]) {
			for (const invitationActive of [true, false]) {
				for (const etagereNonVide of [true, false]) {
					// les 4 lignes ci-dessus
					if (etagereActive && invitationActive && etagereNonVide) continue;
					for (const s of SITUATIONS) {
						const c: ContexteInvitation = {
							etagereActive,
							invitationActive,
							etagereNonVide,
							programmeActif: s.programmeActif,
							ou: s.ou,
						};
						expect(doitInviter(c)).toBe(false);
						vues++;
					}
				}
			}
		}
		expect(vues).toBe(28); // 7 combinaisons d'interrupteurs × 4 situations
	});
});

describe('doitInviter — fonction pure', () => {
	it('rend le même verdict pour le même contexte, sans toucher au stockage', () => {
		const avant = localStorage.length;
		const c = vert(true, 'programme');
		expect(doitInviter(c)).toBe(doitInviter(c));
		expect(localStorage.length).toBe(avant);
	});

	it('ne modifie pas le contexte reçu', () => {
		const c = vert(true, 'programme');
		const copie = { ...c };
		doitInviter(c);
		expect(c).toEqual(copie);
	});
});
