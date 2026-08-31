/* ============================================================
   #641 — Révision espacée : un mot n'entre en rotation qu'à son ATELIER (critère 16),
   et la révision ne valide toujours aucun mode de l'escalier (critère 23).

   Écrits AVANT l'implémentation, à partir de l'issue seule.

   Le critère 16 a DEUX moitiés, et l'issue dit pourquoi la première ne suffit pas :
   1. l'entrée en rotation se fait à l'atelier (les mots ajoutés aujourd'hui et jamais
      découverts ne se mettent plus à « mûrir » tout seuls) ;
   2. la SÉLECTION filtre aussi, pour les banques DÉJÀ constituées — sans quoi les mots
      d'une liste découverte tardivement, en retard de plusieurs jours, satureraient la
      première séance de révision.
   La deuxième moitié se teste sur des mots fabriqués « à l'ancienne » (booléen d'atelier
   faux + échéance dépassée) : c'est exactement ce qui dort dans le stockage de l'enfant
   au moment de la mise à jour.

   Le critère 23 est un VERROU : il est déjà vrai aujourd'hui, il doit le rester quand le
   cumul de #641 arrive. Provisoire par nature — l'issue #640 le lèvera.
   ============================================================ */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it, expect } from 'vitest';
import { estDu, estAcquis, REVISION_INTERVALLES, JOUR, PALIER_ACQUIS } from '../src/core/revision';
import { selectDueGroups, countDue, effortRevisionAffiche } from '../src/core/revision-select';
import { ORTHO_CATEGORY_ID } from '../src/core/catalog';
import {
	emptyOrthoState,
	addOrGetMot,
	createListe,
	motsDeListe,
	avancerMotRevision,
} from '../src/core/orthographe/store';
import { marquerAtelierFait } from '../src/core/orthographe/runner';
import { expanseVerbe } from '../src/core/orthographe/verbes';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import type { MotOrtho, OrthoState, VerbeConfig } from '../src/core/orthographe/types';
import type { FormesConjuguees, VerbTense } from '../src/data/francais/verbs-lookup';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const T0 = new Date(2026, 5, 1, 9, 0).getTime(); // lundi 1er juin 2026, 9 h
const le = (jours: number): number => T0 + jours * JOUR;

/** Mot NEUF, entré en banque par la vraie fonction d'ajout. */
function motNeuf(forme = 'chat'): MotOrtho {
	return addOrGetMot(emptyOrthoState(), { mot: forme });
}

/** Banque « telle qu'elle existe déjà » : `n` mots en RETARD de révision, découverts ou
    non. Les mots non découverts sont fabriqués comme le stockage les porte aujourd'hui
    (échéance posée dès l'ajout, atelier jamais fait) — c'est la situation que la
    sélection doit rattraper. */
function banque(specs: { atelierFait: boolean; du: number }[]): OrthoState {
	const state = emptyOrthoState();
	specs.forEach((spec, i) => {
		const m = addOrGetMot(state, { mot: 'mot' + i });
		m.atelierFait = spec.atelierFait;
		m.revision = { palier: 0, prochaineRevision: spec.du, reussites: 0, dernierTest: null };
	});
	return state;
}
const total = (groupes: { items: unknown[] }[]): number =>
	groupes.reduce((n, g) => n + g.items.length, 0);

/* ============================================================
   1) Critère 16 (1re moitié) — le compteur d'espacement démarre à l'atelier
   ============================================================ */
describe('critère 16 : un mot ajouté n’entre pas en rotation avant d’être découvert', () => {
	it('un mot fraîchement ajouté n’a pas de rendez-vous de révision', () => {
		const m = motNeuf();
		expect(m.atelierFait).toBe(false);
		expect(m.revision.prochaineRevision).toBeNull();
		expect(m.revision.palier).toBe(0);
		expect(estAcquis(m.revision)).toBe(false); // hors rotation n'est pas « acquis »
	});

	it('un mot jamais découvert n’est jamais dû, même six mois plus tard', () => {
		const m = motNeuf();
		for (const jours of [0, 1, 3, 30, 180]) {
			expect(estDu(m.revision, le(jours)), `J+${jours}`).toBe(false);
		}
	});

	it('une cible de verbe conjuguée n’entre pas non plus en rotation à sa création', () => {
		const cfg: VerbeConfig = {
			kind: 'verbe',
			infinitif: 'manger',
			pronoms: [0],
			temps: ['present'],
		};
		const formes: FormesConjuguees = ['mange', 'manges', 'mange', 'mangeons', 'mangez', 'mangent'];
		const [cible] = expanseVerbe(
			cfg,
			new Map<VerbTense, FormesConjuguees>([['present', formes]]),
			T0,
		);
		expect(cible.atelierFait).toBe(false);
		expect(cible.revision.prochaineRevision).toBeNull();
	});

	it('l’atelier fait entrer le mot en rotation : premier re-test dès le lendemain', () => {
		const m = motNeuf();
		marquerAtelierFait(m, le(2));
		expect(m.revision.prochaineRevision).toBe(le(2) + REVISION_INTERVALLES[0]);
		expect(estDu(m.revision, le(2))).toBe(false); // pas dû le jour même
		expect(estDu(m.revision, le(3))).toBe(true); // dû le lendemain
	});

	it('un mot découvert TARD n’arrive pas en retard : son compteur part du jour de l’atelier', () => {
		// C'est le cœur du critère : la veille de l'atelier, la liste peut dormir des semaines
		// sans que la dette ne s'accumule.
		const m = motNeuf();
		marquerAtelierFait(m, le(30));
		expect(estDu(m.revision, le(30))).toBe(false);
		expect(m.revision.prochaineRevision).toBe(le(31));
	});

	it('l’atelier REJOUÉ ne remet pas le compteur d’espacement à zéro', () => {
		// Même monotonie que le datage des étapes (#545) : un mot rejoué ne redescend pas.
		const state = emptyOrthoState();
		const m = addOrGetMot(state, { mot: 'chat' });
		marquerAtelierFait(m, le(0));
		avancerMotRevision(state, m.id, true, le(1)); // première révision réussie : palier 1
		const acquis = JSON.stringify(m.revision);
		expect(m.revision.palier).toBe(1);

		marquerAtelierFait(m, le(10)); // l'enfant revient sur l'atelier du mot
		expect(JSON.stringify(m.revision)).toBe(acquis);
	});
});

/* ============================================================
   2) Critère 16 (2e moitié) — la sélection écarte les mots non découverts
   ============================================================ */
describe('critère 16 : la sélection filtre les mots dont l’atelier n’est pas fait', () => {
	it('un mot en retard mais jamais découvert n’est ni compté ni proposé', () => {
		const state = banque([{ atelierFait: false, du: le(-10) }]);
		expect(countDue(state, {}, T0)).toBe(0);
		expect(selectDueGroups(state, {}, T0)).toEqual([]);
	});

	it('témoin : le même mot, découvert, est bien proposé (le filtre ne vide pas tout)', () => {
		const state = banque([{ atelierFait: true, du: le(-10) }]);
		expect(countDue(state, {}, T0)).toBe(1);
		expect(total(selectDueGroups(state, {}, T0))).toBe(1);
	});

	it('une liste découverte tardivement ne sature pas la séance : seul le mot vu compte', () => {
		// 12 mots ajoutés il y a longtemps et jamais découverts (échéance dépassée), plus un
		// seul mot réellement travaillé. La séance ne doit contenir que ce dernier.
		const specs = Array.from({ length: 12 }, (_, i) => ({
			atelierFait: false,
			du: le(-20 + i),
		}));
		const state = banque([...specs, { atelierFait: true, du: le(-1) }]);
		expect(countDue(state, {}, T0, 12)).toBe(1);
		const groupes = selectDueGroups(state, {}, T0, 12);
		expect(total(groupes)).toBe(1);
		expect(groupes[0].categoryId).toBe(ORTHO_CATEGORY_ID);
	});

	it('INVARIANT « annoncé = proposé » : la carte d’accueil et la séance filtrent pareil', () => {
		// L'accueil annonce `effortRevisionAffiche(countDue)` ; la séance propose
		// `selectDueGroups`. Si une seule des deux filtrait les mots non découverts, l'enfant
		// verrait « 12 à réviser » puis 4 questions (#478).
		const melange = (n: number): OrthoState =>
			banque(
				Array.from({ length: n }, (_, i) => ({
					atelierFait: i % 3 !== 0, // un mot sur trois jamais découvert
					du: le(-1 - i),
				})),
			);
		for (const n of [0, 1, 3, 7, 20]) {
			for (const plafond of [6, 12, 24]) {
				const state = melange(n);
				const annonce = effortRevisionAffiche(countDue(state, {}, T0, plafond), plafond);
				expect(annonce.n, `n=${n} plafond=${plafond}`).toBe(
					total(selectDueGroups(state, {}, T0, plafond)),
				);
			}
		}
	});
});

/* ============================================================
   3) Critère 23 — la révision espacée ne valide aucun mode (verrou provisoire, #640)
   ============================================================ */
describe('critère 23 : une réussite en révision espacée ne fait monter aucun mode', () => {
	it('avancerMotRevision ne touche ni les booléens d’étape ni leurs dates', () => {
		const state = emptyOrthoState();
		const liste = createListe(state, 'Semaine 1', [{ mot: 'chat' }]);
		const [m] = motsDeListe(state, liste);
		marquerAtelierFait(m, le(0));
		const etapes = JSON.stringify({ v: m.validation, f: m.franchissements });

		avancerMotRevision(state, m.id, true, le(1));
		avancerMotRevision(state, m.id, true, le(5));
		expect(m.revision.palier).toBe(2); // la révision, elle, a bien avancé
		expect(JSON.stringify({ v: m.validation, f: m.franchissements })).toBe(etapes);
		expect(m.validation).toEqual({ motCache: false, tuiles: false, dictee: false });
	});

	it('même acquis en révision espacée, un mot n’a validé aucun mode de l’escalier', () => {
		const state = emptyOrthoState();
		const m = addOrGetMot(state, { mot: 'chat' });
		marquerAtelierFait(m, le(0));
		for (let i = 0; i < PALIER_ACQUIS; i++) avancerMotRevision(state, m.id, true, le(i + 1));
		expect(estAcquis(m.revision)).toBe(true);
		expect(Object.values(m.validation)).toEqual([false, false, false]);
	});

	it('GATE : le runner de révision espacée n’appelle ni validerMode ni marquerAtelierFait', () => {
		// Verrou PROVISOIRE : l'issue #640 rendra la révision validante, et lèvera ce test.
		// Tant qu'elle n'est pas faite, le cumul de #641 ne doit pas s'y inviter par ricochet.
		const source = readFileSync('src/ui/revision.ts', 'utf8');
		expect(/\bvaliderMode\s*\(/.test(source)).toBe(false);
		expect(/\bmarquerAtelierFait\s*\(/.test(source)).toBe(false);
	});
});
