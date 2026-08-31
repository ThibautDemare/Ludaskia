/* ============================================================
   #641 — Validation CUMULATIVE de l'escalier d'un mot (critères 1 à 6 et 20).

   Écrits AVANT l'implémentation, à partir de l'issue seule : réussir un mot dans un
   mode ciblé doit valider ce mode ET tous ceux en dessous, sans jamais laisser une
   marche franchie sans date. Les attendus sont dérivés de l'énoncé des critères
   (ordre « tuiles → mot caché → dictée » nommé par le critère 1, datage exigé par le
   critère 3, monotonie héritée de #545), jamais relus dans le code.

   Les symboles NEUFS du contrat d'API (§A) sont atteints par l'ESPACE DE NOMS du
   module : tant qu'ils n'existent pas, chaque test échoue en les NOMMANT au lieu de
   faire exploser tout le fichier à l'import.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import * as runner from '../src/core/orthographe/runner';
import {
	ORDRE_MODES,
	marquerAtelierFait,
	validerMode,
	statutMot,
	listeEtoilee,
	modesRequis,
} from '../src/core/orthographe/runner';
import { rangMot, dateFranchissement } from '../src/core/orthographe/etapes';
import {
	emptyOrthoState,
	addOrGetMot,
	createListe,
	motsDeListe,
	saveOrtho,
} from '../src/core/orthographe/store';
import { evaluateTrophies, loadTrophies } from '../src/core/rewards';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import type { MotOrtho, ModeOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const JOUR = 86_400_000;
const T0 = new Date(2026, 5, 1, 9, 0).getTime(); // lundi 1er juin 2026, 9 h
const le = (jours: number): number => T0 + jours * JOUR;

let compteur = 0;
/** Mot DÉCOUVERT (atelier fait) et vierge de toute validation, fabriqué par la vraie
    entrée en banque (forme du modèle garantie). */
function motDecouvert(forme = `mot${++compteur}`): MotOrtho {
	const m = addOrGetMot(emptyOrthoState(), { mot: forme });
	marquerAtelierFait(m, le(0));
	return m;
}
/** Modes validés d'un mot, dans l'ordre de l'escalier. */
const modesValides = (m: MotOrtho): ModeOrtho[] => ORDRE_MODES.filter((x) => m.validation[x]);

/* ============================================================
   0) Contrat d'API — ce que les tests exigent d'exister
   ============================================================ */
describe('#641 — surface attendue du runner', () => {
	it("l'escalier est bien « tuiles → mot caché → dictée » (ordre nommé par le critère 1)", () => {
		expect(ORDRE_MODES).toEqual(['tuiles', 'motCache', 'dictee']);
	});
	it('le runner expose `modesJusqua` (contrat #641 §A)', () => {
		expect(typeof runner.modesJusqua).toBe('function');
	});
});

/* ============================================================
   1) Critère 1 — réussir un mode valide ce mode ET tous ceux en dessous
   ============================================================ */
describe('critère 1 : la réussite d’un mode ciblé cumule les modes du dessous', () => {
	it('un mot au rang « atelier » réussi en DICTÉE ciblée passe au rang « dictée »', () => {
		// C'est le « violé si » du critère 1, mot pour mot.
		const m = motDecouvert();
		expect(rangMot(m, true)).toBe('atelier');
		validerMode(m, 'dictee', le(1));
		expect(modesValides(m)).toEqual(['tuiles', 'motCache', 'dictee']);
		expect(rangMot(m, true)).toBe('dictee');
		expect(statutMot(m, true)).toBe('maitrise');
	});

	it('le MOT CACHÉ entraîne les tuiles avec lui, et rien au-dessus de lui', () => {
		const m = motDecouvert();
		validerMode(m, 'motCache', le(1));
		expect(modesValides(m)).toEqual(['tuiles', 'motCache']);
		expect(rangMot(m, true)).toBe('motCache');
		expect(statutMot(m, true)).toBe('enCours'); // la dictée reste à faire
	});

	it('les TUILES, première marche, ne valident qu’elles-mêmes', () => {
		const m = motDecouvert();
		validerMode(m, 'tuiles', le(1));
		expect(modesValides(m)).toEqual(['tuiles']);
		expect(rangMot(m, true)).toBe('tuiles');
	});

	it('`modesJusqua` : le mode visé et tous ceux qui le précèdent', () => {
		expect(runner.modesJusqua('tuiles', true)).toEqual(['tuiles']);
		expect(runner.modesJusqua('motCache', true)).toEqual(['tuiles', 'motCache']);
		expect(runner.modesJusqua('dictee', true)).toEqual(['tuiles', 'motCache', 'dictee']);
	});

	it('un mot déjà au sommet ne perd rien à être rejoué dans un mode du bas', () => {
		// Le cumul ne doit jamais REDESCENDRE un mot : `validation` ne pose que `true`.
		const m = motDecouvert();
		validerMode(m, 'dictee', le(1));
		validerMode(m, 'tuiles', le(2));
		expect(modesValides(m)).toEqual(['tuiles', 'motCache', 'dictee']);
	});
});

/* ============================================================
   2) Critère 2 — l'escalier reste ordonné, quoi qu'on joue
   ------------------------------------------------------------
   Éprouvé par ÉCHANTILLONNAGE EXHAUSTIF : toutes les suites de 1 à 3 réussites sur
   les 3 modes (39 cas), y compris celles qu'un enfant ne peut pas produire aujourd'hui.
   Un invariant de cette forme ne se voit pas sur deux ou trois cas choisis à la main.
   ============================================================ */
/** Toutes les suites de longueur 1..3 sur les trois modes (répétitions comprises). */
function suites(): ModeOrtho[][] {
	const out: ModeOrtho[][] = [];
	for (const a of ORDRE_MODES) {
		out.push([a]);
		for (const b of ORDRE_MODES) {
			out.push([a, b]);
			for (const c of ORDRE_MODES) out.push([a, b, c]);
		}
	}
	return out;
}
/** Hauteur attendue de l'escalier après une suite : la marche la plus haute atteinte. */
function hauteurAttendue(suite: ModeOrtho[]): number {
	return Math.max(...suite.map((m) => ORDRE_MODES.indexOf(m))) + 1;
}

describe('critère 2 : aucun mode validé sans les précédents', () => {
	it('sur les 39 suites de réussites possibles, les modes validés forment un préfixe de l’escalier', () => {
		let vus = 0;
		for (const suite of suites()) {
			const m = motDecouvert();
			suite.forEach((mode, i) => validerMode(m, mode, le(i + 1)));
			const valides = modesValides(m);
			const attendus = ORDRE_MODES.slice(0, hauteurAttendue(suite));
			expect(valides, suite.join('>')).toEqual(attendus);
			// Le « violé si » du critère 2, énoncé tel quel.
			expect(m.validation.dictee && !m.validation.tuiles, suite.join('>')).toBe(false);
			vus++;
		}
		expect(vus).toBe(39); // anti-test-vide
	});
});

/* ============================================================
   3) Critère 3 — toute étape validée par cumul est DATÉE
   ============================================================ */
describe('critère 3 : le cumul date les marches qu’il franchit', () => {
	it('une dictée réussie d’emblée date les trois marches du même instant', () => {
		const m = motDecouvert();
		validerMode(m, 'dictee', le(3));
		for (const mode of ORDRE_MODES) {
			expect(m.validation[mode], mode).toBe(true);
			expect(dateFranchissement(m, mode), mode).toBe(le(3)); // aucune marche sans date
		}
	});

	it('MONOTONIE (#545) : un mot rejoué ne réécrit pas la date déjà posée', () => {
		const m = motDecouvert();
		validerMode(m, 'tuiles', le(1));
		validerMode(m, 'dictee', le(30)); // cumule motCache + dictee, laisse tuiles au 1er jour
		expect(dateFranchissement(m, 'tuiles')).toBe(le(1));
		expect(dateFranchissement(m, 'motCache')).toBe(le(30));
		expect(dateFranchissement(m, 'dictee')).toBe(le(30));
	});

	it('horloge remise en arrière : la première date fait foi, même pour une marche cumulée', () => {
		const m = motDecouvert();
		validerMode(m, 'motCache', le(10)); // tuiles + motCache datés du 10e jour
		validerMode(m, 'dictee', le(2)); // onglet resté ouvert / horloge fausse
		expect(dateFranchissement(m, 'tuiles')).toBe(le(10));
		expect(dateFranchissement(m, 'motCache')).toBe(le(10));
		expect(dateFranchissement(m, 'dictee')).toBe(le(2));
	});

	it('sur les 39 suites : jamais de booléen vrai sans date, et la date est celle du 1er passage', () => {
		for (const suite of suites()) {
			const m = motDecouvert();
			suite.forEach((mode, i) => validerMode(m, mode, le(i + 1)));
			for (const mode of ORDRE_MODES) {
				if (!m.validation[mode]) {
					expect(dateFranchissement(m, mode), `${suite.join('>')} / ${mode}`).toBeNull();
					continue;
				}
				// Première réussite qui a atteint (ou dépassé) cette marche.
				const rang = ORDRE_MODES.indexOf(mode);
				const i = suite.findIndex((joue) => ORDRE_MODES.indexOf(joue) >= rang);
				expect(dateFranchissement(m, mode), `${suite.join('>')} / ${mode}`).toBe(le(i + 1));
			}
		}
	});

	it('le mot rejoué en entier des mois plus tard garde toutes ses dates d’origine', () => {
		const m = motDecouvert();
		validerMode(m, 'dictee', le(3));
		const avant = JSON.stringify(m.franchissements);
		for (const mode of ORDRE_MODES) validerMode(m, mode, le(120));
		marquerAtelierFait(m, le(120));
		expect(JSON.stringify(m.franchissements)).toBe(avant);
		expect(dateFranchissement(m, 'atelier')).toBe(le(0));
	});
});

/* ============================================================
   4-6) Étoile, célébration et trophées
   ------------------------------------------------------------
   Ce qui est mécanisable ICI, c'est la PRÉCONDITION que #641 déplace : une séance
   ciblée peut désormais rendre une liste étoilée, donc déclencher bilan, célébration
   et trophées. Le choix d'écran (bilan vs pause) et l'annonce elle-même relèvent du
   smoke Playwright.
   ============================================================ */
describe('critère 4 : une liste peut devenir étoilée PENDANT une séance ciblée', () => {
	it('le dernier mot franchi en dictée ciblée étoile la liste', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		const mots = motsDeListe(s, liste);
		mots.forEach((m) => marquerAtelierFait(m, le(0)));
		validerMode(mots[0], 'dictee', le(1)); // 1er mot déjà au sommet
		validerMode(mots[1], 'tuiles', le(1)); // le dernier mot en est aux tuiles
		expect(listeEtoilee(mots, true)).toBe(false);

		validerMode(mots[1], 'dictee', le(2)); // réussite en mode ciblé « dictée »
		expect(listeEtoilee(mots, true)).toBe(true);
	});
});

describe('critère 5 : une liste DÉJÀ étoilée n’a plus rien de neuf à célébrer', () => {
	it('rejouer une liste acquise en mode ciblé ne franchit aucune marche', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		const mots = motsDeListe(s, liste);
		// Étoilée par un PARCOURS COMPLET (marche après marche) : l'état de départ ne dépend
		// donc pas du cumul, et ce verrou vaut avant comme après #641.
		mots.forEach((m) => {
			marquerAtelierFait(m, le(0));
			for (const mode of ORDRE_MODES) validerMode(m, mode, le(1));
		});
		expect(listeEtoilee(mots, true)).toBe(true);
		const avant = mots.map((m) => JSON.stringify(m.franchissements));

		// Huit activités de tuiles sur la liste acquise : rien ne franchit rien.
		for (let i = 0; i < 8; i++) validerMode(mots[i % 2], 'tuiles', le(9));
		expect(mots.map((m) => JSON.stringify(m.franchissements))).toEqual(avant);
		expect(listeEtoilee(mots, true)).toBe(true); // et l'étoile ne se regagne pas
	});
});

describe('critère 6 : les trophées se débloquent aussi en séance ciblée', () => {
	it('le dernier mot d’une liste franchi en dictée ciblée décroche « Première liste »', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		const [m] = motsDeListe(s, liste);
		marquerAtelierFait(m, le(0));
		validerMode(m, 'tuiles', le(1));
		saveOrtho(s);
		expect(evaluateTrophies().some((t) => t.id === 'orthoListes1')).toBe(false); // témoin

		validerMode(m, 'dictee', le(2)); // séance ciblée « dictée » : le cumul complète le mot
		saveOrtho(s);
		expect(evaluateTrophies().some((t) => t.id === 'orthoListes1')).toBe(true);
		expect(loadTrophies()).toContain('orthoListes1');
	});
});

/* ============================================================
   20) Critère négatif — sans voix de synthèse, tout tient encore
   ============================================================ */
describe('critère 20 : sans voix, le cumul et l’étoile restent atteignables', () => {
	it('la dictée n’est pas requise (prémisse)', () => {
		expect(modesRequis(false)).toEqual(['tuiles', 'motCache']);
	});

	it('le mot caché suffit à maîtriser un mot, tuiles comprises par cumul', () => {
		const m = motDecouvert();
		validerMode(m, 'motCache', le(1));
		expect(modesValides(m)).toEqual(['tuiles', 'motCache']);
		expect(statutMot(m, false)).toBe('maitrise');
		expect(dateFranchissement(m, 'tuiles')).toBe(le(1)); // le cumul date aussi sans voix
	});

	it('une liste s’étoile sans voix, par le seul mot caché', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		const mots = motsDeListe(s, liste);
		mots.forEach((m) => marquerAtelierFait(m, le(0)));
		expect(listeEtoilee(mots, false)).toBe(false);
		mots.forEach((m) => validerMode(m, 'motCache', le(1)));
		expect(listeEtoilee(mots, false)).toBe(true);
	});

	it('`modesJusqua` se limite aux modes requis quand il n’y a pas de voix', () => {
		expect(runner.modesJusqua('motCache', false)).toEqual(['tuiles', 'motCache']);
		expect(runner.modesJusqua('dictee', false)).not.toContain('dictee');
	});
});
