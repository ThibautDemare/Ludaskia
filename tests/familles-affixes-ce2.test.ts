/* ============================================================
   Vocabulaire CE2 — banques « familles / préfixes / suffixes » agrandies et pool du
   QCM combiné rééquilibré (#453).
   ------------------------------------------------------------
   Contexte : les 54 familles CE2 ne profitaient qu'à la leçon « à relier » ; le pool du
   QCM combiné `fr-vocab-familles` restait délibérément sur un sous-ensemble de 30
   familles pour ne pas peser ~46 % du mélange. #453 agrandit préfixes et suffixes au
   même ordre de grandeur, puis verse TOUTES les familles au pool → ~⅓ / ⅓ / ⅓.

   Les attendus sont DÉRIVÉS de l'énoncé de #453 et du contrat de la leçon (QCM de
   reconnaissance : un mot interrogé, un sens/dérivé correct, deux leurres), pas de
   l'implémentation. Ce qui est déjà couvert ailleurs n'est PAS redupliqué :
   - QCM bien formé (3 choix distincts contenant la réponse) et générateur non figé →
     `catalogue-invariants.test.ts` (property-based sur tout le catalogue) ;
   - les 3 options de chaque item de banque sont distinctes et non vides →
     `logic.test.ts`, describe « vocabulaire — familles, préfixes, suffixes (#113) » ;
   - proportions du pool combiné (~⅓ par type) → bande d'équilibre du même describe de
     `logic.test.ts`, RESSERRÉE à ⅓ ± 5 points par #453 plutôt que dupliquée ici ;
   - structure du pool (pool = intégralité des trois banques, type par type) →
     `vocabulaire-cm1.test.ts`, describe « NON-régression CE2 » ;
   - unicité et disjonction des bases / dérivés de FAMILLES →
     `familles-appariement.test.ts`.

   Restent ici les angles morts : plancher de banque, unicité du mot interrogé dans les
   banques d'affixes (celles que #453 agrandit de 23 entrées chacune), les deux repères
   qui donnent la réponse sans connaissance (fuite du mot interrogé dans une option, et
   bonne réponse qui se détache par sa longueur), cohérence explication ↔ affixe, couverture
   EFFECTIVE du pool par la leçon (par tirage, à travers le catalogue) et déterminisme
   du tirage. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { withSeed } from '../src/core/utils';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import { FAMILLES, PREFIXES, SUFFIXES, ITEMS_FAMILLES } from '../src/data/francais/familles';
/* Les gardes de contenu des banques d'affixes vivent dans un harnais PARTAGÉ depuis
   #500 : les banques CM1 (`tests/vocabulaire-cm1.test.ts`) sont tenues par exactement
   les mêmes règles, et le seuil de longueur n'existe qu'à un seul endroit. Les
   détecteurs eux-mêmes sont éprouvés par `tests/gardes-affixes.test.ts`. */
import {
	MARGE_LONGUEUR,
	anomaliesDuMotInterroge,
	fuitesDuMotInterroge,
	reperesDeLongueur,
	affixesAnnoncesIncoherents,
	explicationsSansLeMotInterroge,
	type BanqueAffixes,
} from './gardes-affixes';

/* Plancher de banque de contenu retenu pour le projet (éviter la répétition ressentie) ;
   #453 vise ~54 entrées par banque. On ne fige PAS la taille exacte : un ajout
   pédagogique futur ne doit pas faire rougir ce test. */
const PLANCHER_BANQUE = 50;

/* Tirages d'échantillonnage. 4 000 tirages pour ~163 items : sous graine FIXE le
   résultat est déterministe, et même sous graine libre la probabilité qu'un item
   manque vaut ~163 × e^(−24,5) ≈ 4e−9 → aucun risque de flake. */
const NB_TIRAGES = 4000;
const GRAINE = 453;

const BANQUES_AFFIXES: BanqueAffixes[] = [
	{ nom: 'PREFIXES', items: PREFIXES, role: 'préfixe' },
	{ nom: 'SUFFIXES', items: SUFFIXES, role: 'suffixe' },
];

describe('Familles / affixes CE2 — taille et unicité des banques (#453)', () => {
	it('les trois banques du pool combiné atteignent le plancher de 50 items', () => {
		for (const [nom, banque] of [
			['FAMILLES', FAMILLES],
			['PREFIXES', PREFIXES],
			['SUFFIXES', SUFFIXES],
		] as const) {
			expect(banque.length, nom).toBeGreaterThanOrEqual(PLANCHER_BANQUE);
		}
	});

	it('le mot interrogé est unique dans chaque banque d’affixes, et entre préfixes et suffixes', () => {
		expect(anomaliesDuMotInterroge(BANQUES_AFFIXES)).toEqual([]);
	});

	it('aucune question dupliquée dans le pool combiné (aucune banque versée deux fois)', () => {
		const questions = ITEMS_FAMILLES.map((it) => it.question);
		const doublons = questions.filter((q, i) => questions.indexOf(q) !== i);
		expect(doublons, 'questions présentes plus d’une fois dans le pool').toEqual([]);
	});
});

describe('Familles / affixes CE2 — intégrité des items d’affixes (#453)', () => {
	it('aucune option ne reprend le mot interrogé (pas de fuite de la réponse)', () => {
		// Un item comme « gonflable » → « qu'on peut gonfler (comme une piscine gonflable) »
		// donne la réponse : le mot interrogé ne doit apparaître dans AUCUNE des 3 options
		// (dans la bonne réponse c'est un cadeau, dans un leurre c'est un aimant à erreur).
		// On liste TOUTES les violations d'un coup (diagnostic complet en un run).
		expect(fuitesDuMotInterroge(BANQUES_AFFIXES)).toEqual([]);
	});

	it(`la bonne réponse ne se détache pas par sa longueur (au plus ${MARGE_LONGUEUR} caractères de plus que le plus long distracteur)`, () => {
		// Deuxième famille de repère gratuit, plus grossière que la fuite du mot interrogé :
		// « l'action de réciter un texte appris par cœur » contre « l'action de lire » et
		// « l'action d'écouter » se désigne toute seule. Choisir la plus longue ne demande
		// AUCUNE connaissance — même pas de savoir ce que l'affixe signifie.
		expect(reperesDeLongueur(BANQUES_AFFIXES)).toEqual([]);
	});

	it('l’explication annonce un affixe, du bon type et réellement porté par le mot', () => {
		expect(affixesAnnoncesIncoherents(BANQUES_AFFIXES)).toEqual([]);
	});

	it('l’explication cite le mot interrogé (elle explique bien CET item)', () => {
		// Garde anti-copier-coller : 46 entrées ajoutées d'un coup, une explication recopiée
		// d'un item voisin parlerait d'un autre mot que celui affiché.
		expect(explicationsSansLeMotInterroge(BANQUES_AFFIXES)).toEqual([]);
	});
});

describe('Familles / affixes CE2 — la leçon QCM couvre tout le pool (#453)', () => {
	const lecon = getLessonById('fr-vocab-familles')!;

	it('la leçon existe, est en CE2 et n’est branchée qu’aux trois banques CE2', () => {
		expect(lecon).toBeDefined();
		expect(lecon.levels).toEqual(['ce2']);
		expect(lecon.category).toBe('fr-vocabulaire');
	});

	it('chaque entrée des trois banques finit par être interrogée (aucune réservée à une autre leçon)', () => {
		// Cœur de #453 : plus aucun sous-ensemble n'est mis de côté. Vérifié par le TIRAGE,
		// à travers le point d'entrée du catalogue — c'est ce que l'enfant voit — et via les
		// bonnes réponses attendues, dérivées directement des banques.
		const attendues = new Set<string>([
			...FAMILLES.map((f) => f.famille),
			...PREFIXES.map((a) => a.sens),
			...SUFFIXES.map((a) => a.sens),
		]);
		const vues = new Set<string>();
		withSeed(GRAINE, () => {
			for (let i = 0; i < NB_TIRAGES; i++) vues.add(String(genLessonItem(lecon, 'ce2').answer));
		});
		const jamaisTirees = [...attendues].filter((a) => !vues.has(a));
		expect(jamaisTirees, `réponses jamais tirées en ${NB_TIRAGES} exercices`).toEqual([]);
		// … et réciproquement, rien d'autre que ces trois banques n'alimente la leçon CE2.
		const intruses = [...vues].filter((v) => !attendues.has(v));
		expect(intruses, 'réponses hors des trois banques CE2').toEqual([]);
	});

	it('déterminisme : à graine égale, le même exercice (énoncé, réponse, ordre des choix)', () => {
		const tirage = (seed: number): string =>
			withSeed(seed, () => {
				const it = genLessonItem(lecon, 'ce2');
				return JSON.stringify({ t: it.text, a: it.answer, c: it.choices });
			});
		const tirages = new Set<string>();
		for (let seed = 1; seed <= 40; seed++) {
			expect(tirage(seed), `graine ${seed} : tirage non reproductible`).toBe(tirage(seed));
			tirages.add(tirage(seed));
		}
		// Garde anti-tautologie : la graine fait bien varier le tirage (sinon l'égalité
		// ci-dessus serait vraie même avec un générateur figé).
		expect(tirages.size).toBeGreaterThan(1);
	});
});
