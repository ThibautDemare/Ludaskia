/* ============================================================
   #658 — Sur une liste acquise, la marche la plus HAUTE, jamais un tirage
   (critères 3 et 6, plus la part logique des critères 8 et 9).

   Écrits AVANT l'implémentation, à partir de l'issue seule. Les attendus viennent des
   critères, pas du code : « la dictée si l'appareil a une voix de synthèse, le mot caché
   sinon » (critères 1, 3 et 6), et « chaque mot reçoit la marche la plus haute jouable,
   jamais une marche tirée au hasard » (critère 3, dont l'échec nommé est « un mot ressort
   en tuiles »).

   COMMENT L'ALÉATOIRE EST ÉPROUVÉ — c'est le cœur du lot. Une marche tirée au hasard
   parmi trois tombe juste une fois sur trois : un test qui n'observerait qu'un appel
   passerait par chance. Deux filets, parce qu'ils n'attrapent pas la même chose :
   - un balayage de 240 GRAINES FIXES via `withSeed` (`core/utils`), la source d'aléa
     indirecte du projet. Le résultat est reproductible : une implémentation qui tire
     encore échoue TOUJOURS sur la même graine, jamais « une fois sur deux » ;
   - un balayage de 300 appels SANS graine, qui garde le cas d'une implémentation qui
     appellerait `Math.random` en direct (que `withSeed` ne déroute pas).
   Aucun des deux ne se contente de « la valeur est plausible » : on exige que l'ENSEMBLE
   des valeurs observées soit un singleton.

   Le symbole NEUF du contrat (`marcheLaPlusHaute`) est atteint par l'ESPACE DE NOMS du
   module : tant qu'il n'existe pas, les tests échouent en le NOMMANT au lieu de faire
   exploser tout le fichier à l'import (pattern de `ortho-cumul-validation.test.ts`).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import * as runner from '../src/core/orthographe/runner';
import {
	ORDRE_MODES,
	activiteProgressive,
	listeEtoilee,
	marquerAtelierFait,
	modesRequis,
	prochainModeAValider,
	prochaineActivite,
	statutMot,
	validerMode,
} from '../src/core/orthographe/runner';
import { dateFranchissement } from '../src/core/orthographe/etapes';
import { addOrGetMot, emptyOrthoState } from '../src/core/orthographe/store';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import type { MotOrtho, ModeOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const JOUR = 86_400_000;
const T0 = new Date(2026, 8, 2, 9, 0).getTime(); // mercredi 2 septembre 2026, 9 h
const le = (jours: number): number => T0 + jours * JOUR;

/* 240 graines FIXES et bien réparties : le verdict ne dépend d'aucun hasard de run. */
const GRAINES: readonly number[] = Array.from({ length: 240 }, (_, i) => 20260902 + i * 7919);
/* Appels sans graine, pour le cas d'un `Math.random` direct (hors de portée de `withSeed`).
   300 tirages : rater un aléa à trois branches vaut (1/3)^299, autrement dit jamais. */
const TIRAGES_LIBRES = 300;

let compteur = 0;
/** Mot DÉCOUVERT (atelier fait), aux marches validées exactement comme demandé.
    Les drapeaux sont posés EN CLAIR plutôt que par `validerMode` : chaque test dit ainsi
    l'état qu'il décrit, sans dépendre de la sémantique de cumul d'un autre lot (#641). */
function motAvec(validation: Partial<Record<ModeOrtho, boolean>>): MotOrtho {
	const m = addOrGetMot(emptyOrthoState(), { mot: `mot${++compteur}` });
	marquerAtelierFait(m, le(0));
	m.validation = { tuiles: false, motCache: false, dictee: false, ...validation };
	return m;
}
/** Mot dont TOUTES les marches requises sur cet appareil sont validées. */
function motAcquis(dicteeDispo: boolean): MotOrtho {
	const m = motAvec({ tuiles: true, motCache: true, dictee: dicteeDispo });
	expect(statutMot(m, dicteeDispo)).toBe('maitrise'); // garde-fou du montage du test
	return m;
}

/** Ce que rendent 240 graines fixes, dédupliqué : un singleton = c'est déterministe. */
function activitesSurGraines(mot: MotOrtho, dicteeDispo: boolean): string[] {
	const vues = new Set(GRAINES.map((s) => withSeed(s, () => prochaineActivite(mot, dicteeDispo))));
	return [...vues].sort();
}
/** Idem sans graine : la source d'aléa réelle du navigateur. */
function activitesSansGraine(mot: MotOrtho, dicteeDispo: boolean): string[] {
	const vues = new Set<string>();
	for (let i = 0; i < TIRAGES_LIBRES; i++) vues.add(prochaineActivite(mot, dicteeDispo));
	return [...vues].sort();
}

/* ============================================================
   0) Contrat de surface — ce que les tests exigent d'exister
   ============================================================ */
describe('#658 — surface attendue du runner', () => {
	it('le runner expose `marcheLaPlusHaute`', () => {
		expect(typeof runner.marcheLaPlusHaute).toBe('function');
	});

	it('l’escalier reste le gradient acté « tuiles → mot caché → dictée »', () => {
		// Ce que l'issue invoque pour condamner le tirage : les trois tâches ne sont pas
		// équivalentes. Si cet ordre changeait, « la marche la plus haute » changerait de sens.
		expect(ORDRE_MODES).toEqual(['tuiles', 'motCache', 'dictee']);
	});
});

/* ============================================================
   1) Critères 1/3/6 — ce qu'est « la marche la plus haute jouable »
   ============================================================ */
describe('la marche la plus haute jouable', () => {
	it('avec une voix de synthèse, c’est la DICTÉE', () => {
		expect(runner.marcheLaPlusHaute(true)).toBe('dictee');
	});

	it('sans voix de synthèse, c’est le MOT CACHÉ (critère 6)', () => {
		expect(runner.marcheLaPlusHaute(false)).toBe('motCache');
	});

	it('ce ne sont jamais les tuiles, quel que soit l’appareil', () => {
		// L'échec nommé par le critère 3 : « un mot ressort en tuiles ».
		expect([runner.marcheLaPlusHaute(true), runner.marcheLaPlusHaute(false)]).not.toContain(
			'tuiles',
		);
	});

	it('c’est bien le SOMMET des marches requises sur cet appareil', () => {
		// Cohérence avec le gradient : « la plus haute » = la dernière de l'escalier jouable.
		for (const dispo of [true, false]) {
			const requis = modesRequis(dispo);
			expect(runner.marcheLaPlusHaute(dispo)).toBe(requis[requis.length - 1]);
		}
	});

	it('ne dépend que de la disponibilité de la voix : 240 graines, une seule réponse', () => {
		for (const dispo of [true, false]) {
			const vues = new Set(GRAINES.map((s) => withSeed(s, () => runner.marcheLaPlusHaute(dispo))));
			expect([...vues]).toHaveLength(1);
		}
	});
});

/* ============================================================
   2) Critère 3 — un mot entièrement validé reçoit cette marche, jamais un tirage
   ============================================================ */
describe('critère 3 : sur un mot dont toutes les marches sont validées', () => {
	it('avec voix, les 240 graines rendent TOUTES la dictée (aucun tirage)', () => {
		const m = motAcquis(true);
		expect(activitesSurGraines(m, true)).toEqual(['dictee']);
	});

	it('avec voix, 300 appels SANS graine rendent tous la dictée (garde un `Math.random` direct)', () => {
		const m = motAcquis(true);
		expect(activitesSansGraine(m, true)).toEqual(['dictee']);
	});

	it('un mot acquis ne ressort JAMAIS en tuiles — l’échec nommé par l’issue', () => {
		const m = motAcquis(true);
		const vues = [...activitesSurGraines(m, true), ...activitesSansGraine(m, true)];
		expect(vues).not.toContain('tuiles');
	});

	it('il ne repasse pas non plus par l’atelier de découverte', () => {
		const m = motAcquis(true);
		expect(activitesSurGraines(m, true)).not.toContain('atelier');
	});

	it('deux mots acquis du même tour reçoivent la MÊME marche (pas un tirage par mot)', () => {
		// Le tour de révision repasse chaque mot une fois : si la marche variait d'un mot à
		// l'autre, l'enfant redescendrait d'un cran au milieu de la liste sans qu'on le lui dise.
		const liste = [motAcquis(true), motAcquis(true), motAcquis(true), motAcquis(true)];
		const servies = new Set(
			GRAINES.map((s) => withSeed(s, () => liste.map((m) => prochaineActivite(m, true)).join('|'))),
		);
		expect([...servies]).toEqual(['dictee|dictee|dictee|dictee']);
	});
});

/* ============================================================
   3) Critère 6 — appareil sans voix de synthèse
   ============================================================ */
describe('critère 6 : sans voix de synthèse', () => {
	it('un mot acquis reçoit le mot caché à chaque graine, jamais la dictée', () => {
		const m = motAcquis(false);
		expect(activitesSurGraines(m, false)).toEqual(['motCache']);
	});

	it('… et pas davantage sans graine', () => {
		const m = motAcquis(false);
		expect(activitesSansGraine(m, false)).toEqual(['motCache']);
	});

	it('un mot dont la dictée avait été validée ailleurs ne repasse pas en dictée sur appareil muet', () => {
		// Cas réel : la liste a été travaillée sur une tablette qui parle, on l'ouvre sur un
		// appareil muet. Une dictée servie ici serait un bouton mort (échec du critère 6).
		const m = motAvec({ tuiles: true, motCache: true, dictee: true });
		expect(activitesSurGraines(m, false)).toEqual(['motCache']);
	});
});

/* ============================================================
   4) Critère 3, versant non-régression — SEULE la branche « tout validé » change
   ============================================================ */
describe('critère 3 (non-régression) : un mot pas encore acquis garde son parcours', () => {
	it('sans atelier fait, l’activité est toujours l’atelier — même validation posée', () => {
		for (const dispo of [true, false]) {
			const m = addOrGetMot(emptyOrthoState(), { mot: `neuf${++compteur}` });
			m.validation = { tuiles: true, motCache: true, dictee: true };
			expect(m.atelierFait).toBe(false);
			expect(activitesSurGraines(m, dispo)).toEqual(['atelier']);
		}
	});

	it('un mot fraîchement découvert commence par le bas de l’escalier : les tuiles', () => {
		const m = motAvec({});
		expect(activitesSurGraines(m, true)).toEqual(['tuiles']);
		expect(activitesSurGraines(m, false)).toEqual(['tuiles']);
	});

	it('tuiles faites → mot caché ; tuiles + mot caché faits (avec voix) → dictée', () => {
		expect(activitesSurGraines(motAvec({ tuiles: true }), true)).toEqual(['motCache']);
		expect(activitesSurGraines(motAvec({ tuiles: true, motCache: true }), true)).toEqual([
			'dictee',
		]);
	});

	it('toute marche encore due est servie EXACTEMENT, sur les 8 états de validation', () => {
		// Tant qu'il reste une marche à valider, `prochaineActivite` doit rendre celle-là et
		// rien d'autre : la correction ne touche que la branche « tout validé ».
		for (const dispo of [true, false]) {
			for (const tuiles of [false, true]) {
				for (const motCache of [false, true]) {
					for (const dictee of [false, true]) {
						const m = motAvec({ tuiles, motCache, dictee });
						const du = prochainModeAValider(m, dispo);
						if (du === null) continue; // cas « tout validé » : traité plus haut
						expect(activitesSurGraines(m, dispo)).toEqual([du]);
					}
				}
			}
		}
	});
});

/* ============================================================
   5) Critère 8, part logique pure — « sans impact » = ne fait plus PROGRESSER
   ============================================================ */
describe('critère 8 : la marche la plus haute sur un mot acquis ne le fait pas progresser', () => {
	it('`activiteProgressive` reste faux, avec comme sans voix', () => {
		// L'arbitrage de l'issue : « sans impact » veut dire « ne fait plus progresser », PAS
		// « ne rapporte plus d'XP ». Ce garde-fou empêche de requalifier ce tour en progression
		// pour justifier ses points. (Le versant XP lui-même est hors de la logique pure : il
		// tient à un `addXP(1)` inconditionnel côté UI — cf. le compte rendu.)
		for (const dispo of [true, false]) {
			const m = motAcquis(dispo);
			expect(activiteProgressive(m, runner.marcheLaPlusHaute(dispo), dispo)).toBe(false);
		}
	});
});

/* ============================================================
   6) Critère 9, part logique pure — un tour sur une liste acquise ne franchit rien
   ============================================================ */
describe('critère 9 : un tour de révision ne franchit aucun cap neuf', () => {
	it('la liste était étoilée, le reste, et aucune date de franchissement n’est réécrite', () => {
		// La célébration « Liste prête ! » se déclenche sur une TRANSITION non étoilée →
		// étoilée. On rejoue ici le tour complet (chaque mot une fois, avec l'activité due) et
		// on vérifie qu'aucune transition ni aucun franchissement neuf n'a lieu : il n'y a donc
		// rien qui puisse rallumer la fête. (Le garde d'affichage lui-même est côté écran.)
		const mots = [motAcquis(true), motAcquis(true), motAcquis(true)];
		// Dates du premier apprentissage (le cumul de #641 les pose sur les trois marches).
		for (const m of mots) validerMode(m, 'dictee', le(0));
		const datesAvant = mots.map((m) => ORDRE_MODES.map((e) => dateFranchissement(m, e)));
		expect(listeEtoilee(mots, true)).toBe(true);

		for (const m of mots) {
			const act = prochaineActivite(m, true);
			expect(act).toBe('dictee'); // critère 3, sur le tour réel
			// L'atelier est exclu par l'assertion ci-dessus ; le test le redit pour le typage.
			if (act !== 'atelier') validerMode(m, act, le(7)); // une semaine plus tard
		}

		expect(listeEtoilee(mots, true)).toBe(true);
		expect(mots.map((m) => ORDRE_MODES.map((e) => dateFranchissement(m, e)))).toEqual(datesAvant);
	});
});
