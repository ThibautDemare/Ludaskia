/* ============================================================
   Mots croisés (#665) — LE JEU : catalogue, vivier, tirage, saisie, fin.

   Écrit AVANT l'implémentation, d'après les critères numérotés de l'issue #665.
   `src/core/jeux/mots-croises.ts` n'existe pas encore : ce fichier est ROUGE À
   L'IMPORT, et c'est le résultat attendu à ce stade.

   Critères portés : 1 et 2 (le catalogue), 16 et 17 (par échantillon de
   200 tirages), 24 (la case partagée), 28 (la fin de partie), plus la moitié
   DONNÉES du 18 (chaque emplacement a bien une définition à montrer).

   ── LE CONTRAT QUE CES TESTS FIGENT ─────────────────────────────────────────

     // src/core/jeux/mots-croises.ts
     export function vivierMotsCroises(): string[];
     export function definitionDe(mot: string): string | undefined;

     export interface PartieMotsCroises {
       motif: Motif;                  // le dessin servi (data/jeux/motifs-mots-croises)
       solution: readonly string[];   // un mot par emplacement, dans l'ordre du motif
       // + l'état de saisie, de FORME LIBRE (voir plus bas)
     }
     export function tirerGrille(r: () => number, mots?: readonly string[]): PartieMotsCroises;

     export function lettreEn(p: PartieMotsCroises, ligne: number, colonne: number): string | null;
     export function ecrire(p: PartieMotsCroises, ligne: number, colonne: number, lettre: string): PartieMotsCroises;
     export type EtatMot = 'vide' | 'en-cours' | 'juste' | 'faux';
     export function etatMot(p: PartieMotsCroises, emplacement: number): EtatMot;
     export function partieGagnee(p: PartieMotsCroises): boolean;

   Cinq points du contrat qui ne se devinent pas :

   1. **La solution est DANS la partie**, contrairement aux mots casés où
      l'exposer aurait été un indice tout prêt. Ici le critère 25 l'impose : « un
      mot complété est comparé à la solution, automatiquement ». Le modèle ne peut
      pas comparer à ce qu'il n'a pas. Que le DOM n'en laisse rien filtrer
      (critère 44) est une autre affaire, et c'est celle de la spec Playwright.

   2. **Les lettres saisies sont OPAQUES pour ces tests.** Tableau à deux
      dimensions, dictionnaire indexé par « ligne,colonne », `Map` : le choix
      appartient à l'implémentation, et aucun test d'ici ne le suppose — tout
      passe par `lettreEn` et `ecrire`. Un test qui devinerait la forme serait
      vert ou rouge selon la chance, et interdirait de la changer.

   3. **La case porte UNE lettre, pas une par mot.** C'est l'arbitrage 2 du
      cadrage (« la case à deux lettres des mots casés est un contresens ici »),
      et c'est de là que vient le critère 24. Le moteur `grille-mots.ts` sait
      justement rendre DEUX lettres pour une case (`lettresEn`), parce que les
      mots casés posent des mots entiers qui peuvent se contredire : ce modèle-là
      ne convient pas ici, et c'est pourquoi la saisie lettre à lettre vit dans ce
      module et non dans le moteur.

   4. **`ecrire` ne mute rien et rend une nouvelle partie**, comme `poser` du
      moteur. Une fonction qui écrirait dans la partie reçue corromprait l'état
      que le runner garde, sans rien lever.

   5. **`tirerGrille` sert toujours une grille résoluble, ou ne sert rien.**
      Le paramètre `mots` n'existe que pour rendre ce chemin d'échec atteignable
      (même motif qu'en #664) : avec un vivier qui ne peut pas remplir, elle
      LÈVE, elle ne rend pas une grille sans solution. C'est la lecture directe du
      critère 16.

   Le runner aura besoin d'une sixième fonction, `effacerMot(p, emplacement)`
   (critère 23). Elle n'est PAS contrainte ici, et pas par oubli : le critère 23
   ne dit pas ce que devient la case partagée avec un autre mot — l'effacer
   détruit le travail du voisin, la garder n'efface pas vraiment le mot. C'est un
   arbitrage produit, pas une évidence technique, et il est remonté plutôt que
   tranché en douce par un test.

   ── MESURES FAITES AVANT D'ÉCRIRE, ET QUI CHANGENT LA LECTURE ───────────────

   Sur la banque livrée (`src/data/francais/definitions.ts`), 231 définitions,
   16 exclusions, et 219 des 235 mots de 4 à 8 lettres du vivier des mots casés
   sont définis — le compte annoncé par le mainteneur est confirmé. Par longueur :
   22 mots de 4, 44 de 5, 56 de 6, 55 de 7, 42 de 8, plus 12 mots de 9 à 14
   lettres qui ne tiennent dans aucun motif de sept lignes.

   1. **Le critère 16 est tenable, et la limite n'est pas le vivier.** Avec les
      231 mots définis, 200 tirages par motif : un motif de 5 ou 6 emplacements
      pour 4 à 6 croisements se remplit 200/200 (les dessins « échelle », « tour »,
      « barres » de #664, et deux dessins 6×7 prototypés). À 8 croisements pour
      7 emplacements, ou 12 pour 7 : 0/200 — et multiplier le budget du solveur
      par 64 ne change AUCUN de ces résultats. Ce n'est pas une recherche qui
      s'épuise, c'est une grille qui n'existe pas. Un motif livré qui ne se
      remplit pas est donc un défaut de DESSIN (ou de banque), jamais un défaut du
      moteur — d'où le seuil de 18 sur 20 par motif, repris de #664.

   2. **Le moteur de #664 n'a pas eu besoin de bouger** pour ces mesures :
      `remplirMotif` prend sa liste de mots en paramètre, et ces 231 mots-là lui
      vont comme les 276 des mots casés. La promesse tenue.

   3. **Un quart du vivier porte un accent** (57 mots sur 231 : â ç è é ê ô), et
      123 grilles sur 200 en contiennent au moins un. Ce que ces tests en
      vérifient — que le modèle sait recevoir et juger ces lettres-là — n'est que
      la moitié du problème ; l'autre moitié est le clavier alphabétique du
      critère 21, dont l'issue ne dit pas s'il porte les touches accentuées. C'est
      remonté, pas contourné.
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';
import {
	definitionDe,
	ecrire,
	etatMot,
	lettreEn,
	partieGagnee,
	tirerGrille,
	vivierMotsCroises,
	type PartieMotsCroises,
} from '../src/core/jeux/mots-croises';
import { MOTIFS_MOTS_CROISES } from '../src/data/jeux/motifs-mots-croises';
import { remplirMotif, type Emplacement, type Motif } from '../src/core/jeux/grille-mots';
import { DEFINITIONS, MOTS_SANS_DEFINITION } from '../src/data/francais/definitions';
import { JEUX, jeuParId, jeuxDisponibles } from '../src/core/jeux/catalogue';
import { LEVEL_ORDER } from '../src/core/levels';
import { tirage } from './aleatoire';

const NFC = (s: string): string => s.normalize('NFC');
const lettres = (mot: string): string[] => [...NFC(mot)];
const bas = (s: string): string => NFC(s).toLowerCase();

/* ---------- Géométrie recalculée ICI, exprès ----------

   Ces deux fonctions refont ce que `grille-mots.ts` sait faire. C'est délibéré :
   elles servent de JUGE aux critères 16 et 24, et si le juge s'appuyait sur le
   `croisements()` du moteur, une erreur de géométrie rendrait le juge et le jugé
   faux ENSEMBLE, donc le test vert. La géométrie du moteur est éprouvée à part,
   dans `grille-mots.test.ts`, sur des attendus calculés à la main. */
interface CaseXY {
	ligne: number;
	colonne: number;
}

const casesLocales = (e: Emplacement): CaseXY[] =>
	Array.from({ length: e.longueur }, (_, k) =>
		e.sens === 'h'
			? { ligne: e.ligne, colonne: e.colonne + k }
			: { ligne: e.ligne + k, colonne: e.colonne },
	);

interface CroisementLocal {
	a: number;
	b: number;
	ia: number;
	ib: number;
	ligne: number;
	colonne: number;
}

function croisementsLocaux(m: Motif): CroisementLocal[] {
	const out: CroisementLocal[] = [];
	for (let a = 0; a < m.emplacements.length; a++) {
		const ca = casesLocales(m.emplacements[a]);
		for (let b = a + 1; b < m.emplacements.length; b++) {
			const cb = casesLocales(m.emplacements[b]);
			for (let ia = 0; ia < ca.length; ia++) {
				for (let ib = 0; ib < cb.length; ib++) {
					if (ca[ia].ligne === cb[ib].ligne && ca[ia].colonne === cb[ib].colonne) {
						out.push({ a, b, ia, ib, ligne: ca[ia].ligne, colonne: ca[ia].colonne });
					}
				}
			}
		}
	}
	return out;
}

/* ---------- Écrire dans la grille, comme l'enfant le ferait ---------- */

/** Écrit `mot` dans l'emplacement `i`, lettre par lettre, case par case. */
function ecrireMot(p: PartieMotsCroises, i: number, mot: string): PartieMotsCroises {
	const cases = casesLocales(p.motif.emplacements[i]);
	const l = lettres(mot);
	let courante = p;
	cases.forEach((c, k) => {
		courante = ecrire(courante, c.ligne, c.colonne, l[k]);
	});
	return courante;
}

/** La grille entière remplie avec sa solution. */
function toutEcrire(p: PartieMotsCroises): PartieMotsCroises {
	let courante = p;
	p.solution.forEach((mot, i) => {
		courante = ecrireMot(courante, i, mot);
	});
	return courante;
}

/** Une lettre qui n'est PAS celle attendue à cet endroit. */
const autreLettre = (attendue: string): string => (bas(attendue) === 'z' ? 'k' : 'z');

/** Une case de l'emplacement `i` que personne d'autre ne traverse, s'il en
    existe une — sinon la première. Sert à fabriquer un mot faux sans toucher
    au voisin, pour que le test dise bien ce qu'il croit dire. */
function caseExclusive(m: Motif, i: number): { index: number; xy: CaseXY } {
	const cases = casesLocales(m.emplacements[i]);
	const partagees = new Set(
		croisementsLocaux(m)
			.filter((c) => c.a === i || c.b === i)
			.map((c) => (c.a === i ? c.ia : c.ib)),
	);
	const libre = cases.findIndex((_, k) => !partagees.has(k));
	const index = libre >= 0 ? libre : 0;
	return { index, xy: cases[index] };
}

/* ============================================================
   A. LA PLACE DU JEU DANS L'ÉTAGÈRE (critères 1 et 2)
   ============================================================ */

/** Casse, accents, espaces et ponctuation neutralisés : ce qui reste est ce que
    l'œil retient d'un libellé lu vite. */
const plie = (s: string): string =>
	NFC(s)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');

/** Distance d'édition (Levenshtein). */
function distanceEdition(a: string, b: string): number {
	let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const cour = [i, ...new Array<number>(b.length).fill(0)];
		for (let j = 1; j <= b.length; j++) {
			cour[j] = Math.min(
				prec[j] + 1,
				cour[j - 1] + 1,
				prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		prec = cour;
	}
	return prec[b.length];
}

/** Le seuil du critère 2, et il est MESURÉ, pas choisi au jugé. Distances entre
    libellés pliés, calculées sur les candidats réels :

      « Mots à caser » / « Mots casés »     → 2   ← le piège nommé par le cadrage
      « Mots à caser » / « Mots à croiser » → 3   ← le piège que ce lot risque
      « Mots à caser » / « Mots croisés »   → 5   ← passe, avec une marge
      plus petite distance entre deux libellés DÉJÀ sur l'étagère → 6

    Quatre sépare donc les deux pièges du libellé attendu. Ce que cette règle ne
    sait PAS voir : l'homophonie pure (deux libellés éloignés à l'écrit et
    identiques à l'oreille). Elle tient la moitié mécanisable du critère 2 ;
    l'autre moitié reste un jugement, celui du `redacteur-contenu-francais`. */
const DISTANCE_MIN_LIBELLES = 4;

describe('#665 critère 1 — la place du jeu dans le catalogue', () => {
	it('déclare une entrée « mots-croises » de type C', () => {
		expect(jeuParId('mots-croises')).toMatchObject({ id: 'mots-croises', type: 'C' });
	});

	it('renseigne une compétence, invisible côté enfant', () => {
		/* Cas d'échec littéral : « l'entrée est de type C sans compétence ». Un
		   jeu-compétence dit à l'espace encadrant ce qu'il travaille — ici,
		   retrouver un mot à partir de son sens, ce qu'aucun autre jeu de l'étagère
		   ne demande. Le 2048 et les mots casés, eux, n'en déclarent aucune : c'est
		   la différence entre les deux types, et elle doit rester lisible. */
		const jeu = jeuParId('mots-croises');
		expect(jeu?.competence?.trim() ?? '').not.toBe('');
		expect(bas(jeu?.label ?? '')).not.toContain(bas(jeu?.competence ?? 'x'));
	});

	it('porte un libellé qui ne nomme aucune matière', () => {
		/* Cas d'échec littéral : « le libellé déclenche la regex de
		   jeux-catalogue.test.ts ». Cette regex y est déjà appliquée à TOUS les
		   jeux : ce contrôle est donc redondant par construction, et c'est voulu —
		   il nomme le critère 1 pour qu'un échec dise « le libellé des mots croisés
		   trahit la matière » et pas « un jeu quelque part ». Le piège est réel
		   ici : c'est le premier jeu de type C depuis le Motus, et « vocabulaire »
		   est le mot qui vient tout seul. */
		const label = jeuParId('mots-croises')?.label ?? '';
		expect(label.trim()).not.toBe('');
		expect(label).not.toMatch(
			/orthograph|calcul|conjugais|grammair|vocabulair|lexical|compétence|entra[îi]n/i,
		);
	});

	it('est proposé à toutes les classes', () => {
		/* Le cadrage l'a tranché sans remonter : « le jeu ne déclare aucune classe »,
		   les séries du vivier sont toutes CE2 et `CHAMPS` n'a pas de variante CM1.
		   `levels` ABSENT, et non `['ce2','cm1']` : c'est la façon d'écrire « ce jeu
		   ignore le niveau scolaire » sans avoir à y revenir à chaque classe. */
		expect(jeuParId('mots-croises')?.levels).toBeUndefined();
		for (const niveau of LEVEL_ORDER) {
			expect(
				jeuxDisponibles(niveau).map((j) => j.id),
				niveau,
			).toContain('mots-croises');
		}
	});

	it('n’a délogé aucun jeu déjà en place', () => {
		for (const id of ['motus', '2048', 'sudoku', 'mots-cases']) {
			expect(jeuParId(id), id).toBeDefined();
		}
		expect(new Set(JEUX.map((j) => j.id)).size).toBe(JEUX.length);
	});
});

describe('#665 critère 2 — le libellé se distingue de « Mots à caser »', () => {
	it('ne diffère pas du voisin par un seul mot quasi homophone', () => {
		/* Cas d'échec littéral : « les deux libellés ne diffèrent que par un mot
		   quasi homophone ». C'est la règle posée en #664 dans
		   `conventions-redaction.md`, et l'issue dit que c'est CE lot qu'elle visait :
		   un CE2 qui lit « mots cas… » attend des définitions, et c'est le jeu d'à
		   côté qui n'en a aucune. */
		const ici = plie(jeuParId('mots-croises')?.label ?? '');
		const voisin = plie(jeuParId('mots-cases')?.label ?? '');
		expect(
			distanceEdition(ici, voisin),
			`« ${jeuParId('mots-croises')?.label ?? ''} » est à ${String(distanceEdition(ici, voisin))} caractère(s) de « ${jeuParId('mots-cases')?.label ?? ''} »`,
		).toBeGreaterThanOrEqual(DISTANCE_MIN_LIBELLES);
	});

	it('se distingue aussi de tous les autres jeux de l’étagère', () => {
		// La convention ne parle pas que du voisin immédiat : « le libellé se
		// distingue-t-il de ceux déjà sur l'étagère ET de ceux qui y sont prévus ».
		// Quinze jeux sont prévus après celui-ci ; la règle vaut pour chaque arrivée.
		const proches: string[] = [];
		for (let i = 0; i < JEUX.length; i++) {
			for (let j = i + 1; j < JEUX.length; j++) {
				const d = distanceEdition(plie(JEUX[i].label), plie(JEUX[j].label));
				if (d < DISTANCE_MIN_LIBELLES) {
					proches.push(`« ${JEUX[i].label} » / « ${JEUX[j].label} » → ${String(d)}`);
				}
			}
		}
		expect(proches).toEqual([]);
	});

	it('le détecteur lui-même sépare bien les pièges du libellé attendu', () => {
		// Un seuil qui accepterait le piège ne garderait rien ; un seuil qui
		// refuserait le libellé attendu ferait réécrire un libellé correct. Les
		// quatre distances sont mesurées, pas supposées.
		const d = (a: string, b: string): number => distanceEdition(plie(a), plie(b));
		expect(d('Mots à caser', 'Mots casés')).toBe(2);
		expect(d('Mots à caser', 'Mots à croiser')).toBe(3);
		expect(d('Mots à caser', 'Mots croisés')).toBe(5);
		expect(d('Mots à caser', 'Les définitions cachées')).toBe(16);
	});
});

/* ============================================================
   B. LE VIVIER ET L'APPARIEMENT MOT / DÉFINITION
   (moitié données des critères 16 et 18)
   ============================================================ */

describe('#665 — le vivier : des mots que l’on peut DEMANDER', () => {
	it('ne contient que des mots qui ont une définition', () => {
		/* C'est la règle qui distingue ce vivier de celui des mots casés, et le
		   défaut qu'elle attrape est brutal : un mot sans définition posé dans une
		   grille donne un emplacement sans énoncé — l'enfant devrait le deviner sans
		   rien lire (critère 18 rendu impossible). */
		const definis = new Set(DEFINITIONS.map((d) => bas(d.mot)));
		const orphelins = vivierMotsCroises()
			.filter((m) => !definis.has(bas(m)))
			.sort();
		expect(orphelins).toEqual([]);
	});

	it('n’oublie aucun mot défini d’une longueur que les motifs réclament', () => {
		/* L'inverse du contrôle précédent, et il compte autant : un vivier qui se
		   restreindrait à une poignée de mots ressservirait éternellement les mêmes
		   grilles, et la banque de 231 définitions aurait été écrite pour rien. On ne
		   l'exige que sur les longueurs qu'un motif livré peut accueillir — les mots
		   de 9 lettres et plus n'entrent dans aucune grille de sept lignes. */
		const longueurs = new Set(
			MOTIFS_MOTS_CROISES.flatMap((m) => m.emplacements.map((e) => e.longueur)),
		);
		const vivier = new Set(vivierMotsCroises().map(bas));
		const manquants = DEFINITIONS.map((d) => bas(d.mot))
			.filter((m) => longueurs.has(lettres(m).length))
			.filter((m) => !vivier.has(m))
			.sort();
		expect(manquants).toEqual([]);
	});

	it('n’y met aucun mot exclu, aucun doublon, et rien qui ne tienne dans une case', () => {
		// Les 16 exclusions sont des mots-outils et une interjection : ils n'ont pas
		// de définition, donc pas de place ici. Le filtre de forme est celui des
		// mots casés — une case porte une lettre, pas un espace ni une apostrophe.
		const exclus = new Set(MOTS_SANS_DEFINITION.map((x) => bas(x.mot)));
		const vivier = vivierMotsCroises();
		for (const mot of vivier) {
			expect(exclus.has(bas(mot)), `« ${mot} » est déclaré indéfinissable`).toBe(false);
			expect(bas(mot), `« ${mot} »`).toMatch(/^[a-zà-öø-ÿœæ]+$/);
		}
		expect(new Set(vivier.map(bas)).size, 'un mot en double dans le vivier').toBe(vivier.length);
	});

	it('reste assez fourni pour que les motifs se remplissent', () => {
		/* Le plancher de 200 est celui du critère 13, et sa raison est mesurée dans
		   l'issue : à 150 mots, un motif sur sept se remplit. Il est repris ici parce
		   que c'est le vivier DU JEU qui décide du remplissage, pas la taille de la
		   banque — un filtre trop zélé (par longueur, par thème) ferait passer le
		   gate de la banque et échouer les grilles. */
		expect(vivierMotsCroises().length).toBeGreaterThanOrEqual(200);
	});

	it('ne se laisse pas corrompre depuis l’extérieur', () => {
		// Le vivier est calculé une fois puis gardé (c'est ce que font déjà le Motus
		// et les mots casés). Un appelant qui pousse dans le tableau rendu
		// contaminerait toutes les grilles suivantes.
		const attendu = vivierMotsCroises().length;
		try {
			vivierMotsCroises().push('intrus');
		} catch {
			/* gelé : très bien aussi */
		}
		expect(vivierMotsCroises().length).toBe(attendu);
	});
});

describe('#665 — l’appariement mot / définition', () => {
	it('rend, pour chaque mot du vivier, la définition de la banque', () => {
		// Une définition inventée ici, ou reformulée, sortirait du périmètre du gate
		// `definitions-gate.test.ts` : c'est lui qui tient les douze mots, la
		// méta-langue, les têtes catégorielles. Une seule vérité, dans les données.
		const banque = new Map(DEFINITIONS.map((d) => [bas(d.mot), d.def]));
		const ecarts = vivierMotsCroises()
			.filter((m) => definitionDe(m) !== banque.get(bas(m)))
			.map((m) => `${m} :: « ${definitionDe(m) ?? '(rien)'} »`)
			.sort();
		expect(ecarts).toEqual([]);
	});

	it('ne rend rien pour un mot qu’on n’a pas défini', () => {
		// Le silence, pas une chaîne vide ni une phrase de secours : un emplacement
		// sans définition doit être IMPOSSIBLE à servir, pas discrètement muet.
		expect(definitionDe('zzzzz')).toBeUndefined();
		expect(definitionDe('')).toBeUndefined();
		for (const x of MOTS_SANS_DEFINITION.slice(0, 3)) {
			expect(definitionDe(x.mot), x.mot).toBeUndefined();
		}
	});
});

/* ============================================================
   C. LA GRILLE SERVIE (critères 16 et 17)
   ============================================================ */

describe('#665 critère 16 — chaque motif livré se remplit VRAIMENT', () => {
	/* Le critère porte sur la grille servie, et `tirerGrille` peut masquer un motif
	   infernal en en essayant un autre : le motif serait livré EN APPARENCE, compté
	   dans la liste et jamais joué. Le seuil de 18 sur 20 est celui de #664, et il
	   est mesuré ici sur la banque de définitions — les dessins qui passent passent
	   200/200, ceux qui échouent échouent 0/200, même à 64 fois le budget. Entre
	   les deux, il n'y a rien : un motif à 15/20 serait une surprise à regarder de
	   près, pas de la malchance. */
	it.each([...MOTIFS_MOTS_CROISES].map((m) => [m.id, m] as [string, Motif]))(
		'%s se remplit presque à tous les coups',
		(_id, motif) => {
			const mots = vivierMotsCroises();
			let reussis = 0;
			for (let graine = 1; graine <= 20; graine++) {
				if (remplirMotif(motif, mots, tirage(graine))) reussis++;
			}
			expect(
				reussis,
				`le motif ${motif.id} n'a été rempli que ${String(reussis)} fois sur 20 : trop de croisements pour les ${String(mots.length)} mots définis`,
			).toBeGreaterThanOrEqual(18);
		},
	);
});

describe('#665 critères 16 et 17 — 200 tirages', () => {
	const TIRAGES = 200;

	it('sert 200 grilles résolubles, sans doublon, définies de bout en bout', () => {
		const vivier = new Set(vivierMotsCroises().map(bas));
		const motifsVus = new Set<string>();

		for (let graine = 1; graine <= TIRAGES; graine++) {
			const p = tirerGrille(tirage(graine));
			motifsVus.add(p.motif.id);
			const ou = `tirage ${String(graine)} (${p.motif.id})`;

			// Critère 16 — « la grille servie a une solution, celle qui a servi à la
			// remplir ». On ne croit pas le module sur parole : on RELIT sa solution.
			expect(p.solution, `${ou} : un mot par emplacement`).toHaveLength(
				p.motif.emplacements.length,
			);
			p.solution.forEach((mot, i) => {
				expect(lettres(mot).length, `${ou} : « ${mot} » à l'emplacement ${String(i)}`).toBe(
					p.motif.emplacements[i].longueur,
				);
				expect(vivier.has(bas(mot)), `${ou} : « ${mot} » hors vivier`).toBe(true);
				expect(definitionDe(mot) ?? '', `${ou} : « ${mot} » sans définition`).not.toBe('');
			});
			const desaccords = croisementsLocaux(p.motif).filter(
				(c) => lettres(p.solution[c.a])[c.ia] !== lettres(p.solution[c.b])[c.ib],
			);
			expect(
				desaccords.map(
					(c) => `${p.solution[c.a]}/${p.solution[c.b]} en ${String(c.ligne)},${String(c.colonne)}`,
				),
				`${ou} : la solution servie se contredit elle-même`,
			).toEqual([]);

			// Critère 17 — « un mot n'apparaît jamais deux fois dans la même grille ».
			expect(new Set(p.solution.map(bas)).size, `${ou} : un mot en double`).toBe(p.solution.length);
			// Sa conséquence visible : deux emplacements ne portent jamais le même
			// énoncé. C'est CELA que l'enfant verrait — deux définitions identiques,
			// dont une seule accepte sa réponse.
			const defs = p.solution.map((mot) => definitionDe(mot) ?? '');
			expect(new Set(defs).size, `${ou} : deux emplacements ont la même définition`).toBe(
				defs.length,
			);

			// La grille servie est VIDE : rien n'est déjà écrit dedans.
			for (const e of p.motif.emplacements) {
				for (const c of casesLocales(e)) {
					expect(
						lettreEn(p, c.ligne, c.colonne),
						`${ou} : la case ${String(c.ligne)},${String(c.colonne)} est déjà remplie`,
					).toBeNull();
				}
			}
		}

		// Un motif jamais servi en 200 tirages n'est pas livré, il est décoratif.
		expect([...motifsVus].sort(), 'un motif livré n’est jamais sorti en 200 tirages').toEqual(
			[...MOTIFS_MOTS_CROISES].map((m) => m.id).sort(),
		);
	});

	it('est déterministe à générateur fixé, et n’appelle jamais Math.random', () => {
		// Sans ça, aucun invariant de grille ne serait rejouable : un échec sur le
		// tirage 137 resterait un échec qu'on ne sait pas reproduire.
		const espion = vi.spyOn(Math, 'random');
		expect(tirerGrille(tirage(11))).toEqual(tirerGrille(tirage(11)));
		expect(espion).not.toHaveBeenCalled();
		espion.mockRestore();
	});

	it('ne sert pas éternellement la même grille', () => {
		const vues = new Set<string>();
		for (let g = 1; g <= 30; g++) vues.add(JSON.stringify([...tirerGrille(tirage(g)).solution]));
		expect(vues.size, 'trente tirages donnent la même solution').toBeGreaterThan(1);
	});

	it('refuse de servir une grille quand aucun motif ne se remplit', () => {
		/* L'autre moitié du critère 16, et la seule qui compte vraiment : servir une
		   grille SANS solution est le cas d'échec. Avec un vivier impossible, le jeu
		   doit renoncer bruyamment — le runner attrape et montre un panneau, comme
		   celui des mots casés. Rendre une grille à moitié remplie, ou une grille
		   vide, laisserait l'enfant devant un jeu mort sans explication. */
		expect(() => tirerGrille(tirage(1), ['aa', 'bb', 'cc'])).toThrow();
		expect(() => tirerGrille(tirage(1), [])).toThrow();
	});
});

/* ============================================================
   D. LA SAISIE, LA CASE PARTAGÉE ET LA FIN (critères 24 et 28)
   ============================================================ */

describe('#665 — écrire une lettre dans une case', () => {
	const partie = (): PartieMotsCroises => tirerGrille(tirage(7));

	it('rend une NOUVELLE partie et ne touche pas à celle qu’on lui donne', () => {
		// Même règle que `poser` du moteur : le runner garde son état, et une
		// fonction qui écrirait dans la partie reçue le corromprait sans rien lever.
		const p = partie();
		const { xy } = caseExclusive(p.motif, 0);
		const apres = ecrire(p, xy.ligne, xy.colonne, 'a');
		expect(lettreEn(apres, xy.ligne, xy.colonne)).not.toBeNull();
		expect(lettreEn(p, xy.ligne, xy.colonne), 'la partie d’origine a été mutée').toBeNull();
	});

	it('remplace la lettre déjà posée', () => {
		// C'est le geste de l'enfant qui se corrige. Refuser d'écrire par-dessus
		// obligerait à effacer tout le mot pour changer une lettre — et le critère 24
		// n'existerait pas, puisqu'on ne pourrait jamais contredire un mot posé.
		const p = partie();
		const { xy } = caseExclusive(p.motif, 0);
		const apres = ecrire(ecrire(p, xy.ligne, xy.colonne, 'a'), xy.ligne, xy.colonne, 'b');
		expect(bas(lettreEn(apres, xy.ligne, xy.colonne) ?? '')).toBe('b');
	});

	it('ne fait rien, en silence, sur une case qui n’appartient à aucun mot', () => {
		/* La règle du moteur (« ce qui n'a pas de sens est refusé en silence, jamais
		   par une exception ») : une coordonnée hors grille est un défaut de rendu,
		   pas une faute de l'enfant, et une exception y serait une panne pour lui. */
		const p = partie();
		const hors = { ligne: p.motif.hauteur + 3, colonne: p.motif.largeur + 3 };
		expect(() => ecrire(p, hors.ligne, hors.colonne, 'a')).not.toThrow();
		expect(lettreEn(ecrire(p, hors.ligne, hors.colonne, 'a'), hors.ligne, hors.colonne)).toBeNull();
		expect(() => ecrire(p, -1, -1, 'a')).not.toThrow();
		expect(lettreEn(p, -1, -1)).toBeNull();
	});

	it('accepte les capitales que l’enfant voit et tape', () => {
		/* Le critère 33 dit « les lettres s'affichent en capitales », et le clavier du
		   critère 21 n'en montre pas d'autres : l'enfant ne tape JAMAIS une minuscule.
		   Un modèle qui comparerait la casse marquerait donc faux chacun de ses mots
		   justes. Le vivier, lui, est en minuscules — la conversion doit se faire
		   quelque part, et ce quelque part ne peut pas être le clavier seul. */
		const p = partie();
		const juste = ecrireMot(p, 0, p.solution[0].toUpperCase());
		expect(etatMot(juste, 0), `« ${p.solution[0].toUpperCase()} » refusé`).toBe('juste');
	});
});

describe('#665 — l’état d’un mot se lit sur la grille', () => {
	const partie = (): PartieMotsCroises => tirerGrille(tirage(13));

	it('est « vide » tant que rien n’est écrit', () => {
		const p = partie();
		for (let i = 0; i < p.motif.emplacements.length; i++) {
			expect(etatMot(p, i), `emplacement ${String(i)}`).toBe('vide');
		}
	});

	it('passe « en cours » dès la première lettre, et le reste jusqu’à la dernière', () => {
		const p = partie();
		const cases = casesLocales(p.motif.emplacements[0]);
		const sol = lettres(p.solution[0]);
		let courante = p;
		for (let k = 0; k < cases.length - 1; k++) {
			courante = ecrire(courante, cases[k].ligne, cases[k].colonne, sol[k]);
			// Aucun retour lettre par lettre (critère 26) : tant qu'il manque une
			// case, l'état ne dit ni juste ni faux, même quand tout est bon.
			expect(etatMot(courante, 0), `après ${String(k + 1)} lettre(s)`).toBe('en-cours');
		}
	});

	it('est « juste » quand le mot complété est celui de la solution', () => {
		const p = partie();
		expect(etatMot(ecrireMot(p, 0, p.solution[0]), 0)).toBe('juste');
	});

	it('est « faux » quand le mot complété n’est pas celui de la solution', () => {
		/* Critère 25 : la comparaison est AUTOMATIQUE, sans bouton « vérifier ».
		   La case choisie n'appartient qu'à ce mot-là, pour que l'échec dise bien
		   « ce mot est faux » et pas « le voisin a bougé ». */
		const p = partie();
		const { index, xy } = caseExclusive(p.motif, 0);
		const faux = ecrire(
			ecrireMot(p, 0, p.solution[0]),
			xy.ligne,
			xy.colonne,
			autreLettre(lettres(p.solution[0])[index]),
		);
		expect(etatMot(faux, 0)).toBe('faux');
		expect(partieGagnee(faux)).toBe(false);
	});
});

describe('#665 critère 24 — écrire dans une case partagée réévalue les DEUX mots', () => {
	/* Le défaut visé est invisible à l'œil, et le designer l'a signalé au cadrage :
	   un mot juste devient faux SANS AVOIR ÉTÉ TOUCHÉ, parce que l'enfant a réécrit
	   une de ses cases en travaillant sur l'autre mot. Une implémentation qui
	   calcule l'état au moment où le mot est complété, puis le garde, passe tous
	   les autres tests de ce fichier et échoue ici — c'est le seul endroit où la
	   différence se voit. */
	const partieCroisee = (): { p: PartieMotsCroises; c: CroisementLocal } => {
		const p = tirerGrille(tirage(21));
		const c = croisementsLocaux(p.motif)[0];
		expect(c, 'ce motif n’a aucun croisement (critère 15)').toBeDefined();
		return { p, c };
	};

	it('rend faux le mot déjà juste que la nouvelle lettre contredit', () => {
		const { p, c } = partieCroisee();
		const pose = ecrireMot(p, c.a, p.solution[c.a]);
		expect(etatMot(pose, c.a), 'montage : le premier mot doit être juste').toBe('juste');
		expect(etatMot(pose, c.b), 'montage : le second mot n’a qu’une lettre').toBe('en-cours');

		// L'enfant travaille sur le SECOND mot et écrit une lettre qui ne convient
		// pas au premier. Une case, une lettre : il n'y a pas de place pour les deux.
		const attendue = lettres(p.solution[c.a])[c.ia];
		const contredit = ecrire(pose, c.ligne, c.colonne, autreLettre(attendue));

		expect(
			bas(lettreEn(contredit, c.ligne, c.colonne) ?? ''),
			'la case partagée garde deux lettres à la fois',
		).toBe(bas(autreLettre(attendue)));
		expect(
			etatMot(contredit, c.a),
			'le mot juste est resté juste alors qu’une de ses lettres a changé',
		).toBe('faux');
		expect(etatMot(contredit, c.b)).toBe('en-cours');
		expect(partieGagnee(contredit)).toBe(false);
	});

	it('ne touche à aucune AUTRE lettre du mot contredit', () => {
		// Le corollaire : la réévaluation ne doit pas se payer d'un effacement du
		// mot voisin. L'enfant retrouve son mot entier, avec une lettre changée.
		const { p, c } = partieCroisee();
		const pose = ecrireMot(p, c.a, p.solution[c.a]);
		const attendue = lettres(p.solution[c.a])[c.ia];
		const contredit = ecrire(pose, c.ligne, c.colonne, autreLettre(attendue));
		casesLocales(p.motif.emplacements[c.a]).forEach((xy, k) => {
			if (k === c.ia) return;
			expect(
				bas(lettreEn(contredit, xy.ligne, xy.colonne) ?? ''),
				`la case ${String(k)} du mot contredit a bougé`,
			).toBe(bas(lettres(p.solution[c.a])[k]));
		});
	});

	it('le rend juste de nouveau quand la bonne lettre revient', () => {
		// L'état se RECALCULE, il ne se retient pas : sans ça, un mot passé par
		// « faux » y resterait, et l'enfant ne pourrait plus jamais finir sa grille.
		const { p, c } = partieCroisee();
		const attendue = lettres(p.solution[c.a])[c.ia];
		const pose = ecrireMot(p, c.a, p.solution[c.a]);
		const contredit = ecrire(pose, c.ligne, c.colonne, autreLettre(attendue));
		const repare = ecrire(contredit, c.ligne, c.colonne, attendue);
		expect(etatMot(repare, c.a)).toBe('juste');
	});

	it('rend faux LES DEUX mots quand la grille était entièrement juste', () => {
		/* La forme la plus nue du critère : une grille finie et bonne, une seule
		   lettre changée dans une case de croisement, et les DEUX mots qui la
		   traversent doivent basculer. Un modèle qui n'en réévaluerait qu'un
		   (« celui qu'on est en train d'écrire ») laisserait l'autre affiché comme
		   juste, et déclarerait peut-être la partie gagnée. */
		const p = tirerGrille(tirage(33));
		const c = croisementsLocaux(p.motif)[0];
		const pleine = toutEcrire(p);
		expect(partieGagnee(pleine), 'montage : la grille écrite avec sa solution').toBe(true);

		const cassee = ecrire(pleine, c.ligne, c.colonne, autreLettre(lettres(p.solution[c.a])[c.ia]));
		expect(etatMot(cassee, c.a), 'le mot horizontal').toBe('faux');
		expect(etatMot(cassee, c.b), 'le mot vertical').toBe('faux');
		expect(partieGagnee(cassee)).toBe(false);
	});
});

describe('#665 critère 28 — la partie se termine pleine ET juste', () => {
	it('n’est pas gagnée tant qu’un mot manque, même si tous les autres sont justes', () => {
		/* « Tous les mots sont posés ET justes » : ce test tient le premier ET. On
		   omet un mot qui possède une case que personne d'autre ne traverse, sinon
		   les voisins la rempliraient et le montage ne prouverait rien. */
		const p = tirerGrille(tirage(5));
		const omis = p.motif.emplacements.findIndex((_, i) => {
			const partagees = new Set(
				croisementsLocaux(p.motif)
					.filter((c) => c.a === i || c.b === i)
					.map((c) => (c.a === i ? c.ia : c.ib)),
			);
			return casesLocales(p.motif.emplacements[i]).some((_xy, k) => !partagees.has(k));
		});
		expect(omis, 'aucun mot de ce motif n’a de case libre').toBeGreaterThanOrEqual(0);

		let presque = p;
		p.solution.forEach((mot, i) => {
			if (i !== omis) presque = ecrireMot(presque, i, mot);
		});
		const { xy } = caseExclusive(p.motif, omis);
		expect(
			lettreEn(presque, xy.ligne, xy.colonne),
			'montage : cette case doit rester vide',
		).toBeNull();
		expect(etatMot(presque, omis)).not.toBe('juste');
		expect(partieGagnee(presque)).toBe(false);
	});

	it('n’est pas gagnée sur une grille PLEINE et fausse', () => {
		/* Cas d'échec littéral : « une grille pleine et fausse déclare la partie
		   finie ». L'état est atteignable — toutes les cases portent une lettre, et
		   un mot au moins n'est pas celui de la solution. Une fin de partie qui
		   compterait les cases remplies au lieu de comparer les mots féliciterait
		   l'enfant pour une grille fausse. */
		const p = tirerGrille(tirage(17));
		const pleine = toutEcrire(p);
		const { index, xy } = caseExclusive(p.motif, 0);
		const fausse = ecrire(pleine, xy.ligne, xy.colonne, autreLettre(lettres(p.solution[0])[index]));

		for (const e of p.motif.emplacements) {
			for (const c of casesLocales(e)) {
				expect(
					lettreEn(fausse, c.ligne, c.colonne),
					`montage : la case ${String(c.ligne)},${String(c.colonne)} devrait être pleine`,
				).not.toBeNull();
			}
		}
		expect(etatMot(fausse, 0)).toBe('faux');
		expect(partieGagnee(fausse)).toBe(false);
	});

	it('est gagnée quand tous les mots sont posés et justes, sur 20 tirages', () => {
		/* En échantillon, parce que c'est là que passent les mots accentués : 123
		   grilles sur 200 en portent au moins un (â ç è é ê ô). Un modèle qui
		   normaliserait les accents pour comparer, ou qui les perdrait à la saisie,
		   déclarerait ces grilles-là jamais finies. */
		for (let graine = 1; graine <= 20; graine++) {
			const p = tirerGrille(tirage(graine));
			const pleine = toutEcrire(p);
			p.solution.forEach((mot, i) => {
				expect(etatMot(pleine, i), `tirage ${String(graine)} : « ${mot} »`).toBe('juste');
			});
			expect(partieGagnee(pleine), `tirage ${String(graine)} (${p.motif.id})`).toBe(true);
		}
	});
});
