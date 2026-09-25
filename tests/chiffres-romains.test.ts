/* ============================================================
   Chiffres romains (CM1, #717) — logique pure, sans DOM.

   ÉCRIT AVANT LE CODE, depuis les critères numérotés de l'issue #717 et non depuis
   l'implémentation (règle « les tests traduisent les critères AVANT le code »,
   CLAUDE.md § Cadrage). Tant que la leçon `num-chiffres-romains` n'existe pas, ces
   tests échouent sur « leçon absente du catalogue » : c'est le résultat attendu.

   Aucune fonction interne de la leçon n'est importée (aucun nom n'est arrêté) : tout
   passe par l'API stable du catalogue — `getLessonById`, `exerciseType.generate`,
   `exerciseType.check`, `genLessonItem`, `checkItemAnswer`.

   Le RÉFÉRENTIEL (`enRomain`, `lectureNaive`) est DÉRIVÉ des règles énoncées dans
   l'issue, pas recopié d'une table : sept symboles, six formes soustractives et six
   seulement, `V`/`L`/`D` ni soustraits ni répétés, `I`/`X`/`C`/`M` répétés au plus
   trois fois. Il est lui-même éprouvé plus bas (bloc « Référentiel du test ») avant
   de servir d'attendu.

   SECONDE PASSE — critères 4 et 5, écrits APRÈS le code. Ils n'avaient aucune prise à
   la première (le tirage n'exposait aucun palier, la règle enfreinte aucune fonction
   pure). Un test écrit après coup passe du premier coup, ce qui ne prouve que sa propre
   complaisance : chacun de ceux-là a donc été éprouvé par une MUTATION du module, nommée
   en tête de son bloc. Les attendus restent dérivés de l'énoncé du critère — la partition
   des paliers, notamment, est recalculée ici depuis la FORME de l'écriture (commence par
   M / contient une des six paires soustractives), pas depuis les chiffres 4 et 9 sur
   lesquels le module la déduit.

   Critères NON traduits ici, faute d'API arrêtée — voir le compte rendu :
   6 (« c'est un autre système » : relève du rendu / d'une formulation, pas d'un
   mécanisme observable — l'asserter reviendrait à figer une phrase),
   7 (journalisation : déjà tenue par les gates `tests/erreurs-journal-gate.test.ts`,
   `tests/couverture-e2e-gate.test.ts` et `e2e/journal-couverture.ts`).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, getLessonsByCategory, genLessonItem } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import type { Item } from '../src/core/items';
import { defaultMode, hasMode } from '../src/core/exercise';
import type { Exercise, ExerciseMode, ExerciseType } from '../src/core/exercise';
import { withSeed } from '../src/core/utils';
/* Seconde passe (critères 4 et 5) : les prises exposées par le module. `enRomain` n'est
   VOLONTAIREMENT pas importé — le référentiel du test reste le sien, sans quoi les deux
   se confirmeraient l'un l'autre. */
import {
	PALIERS_ROMAINS,
	libelleRegleRomaine,
	nombresDuPalier,
	palierDe,
	progressionPaliers,
	regleEnfreinte,
	tirerNombreRomain,
	type PalierRomain,
	type RegleRomaine,
} from '../src/core/chiffres-romains';
/* La fiche réellement servie à l'enfant (`buildLessonFiche` lui demande ses questions) :
   c'est là que la progression du critère 4 doit se voir, pas seulement dans une fonction
   de paliers qui pourrait n'être appelée nulle part. */
import { genItems } from '../src/core/build';

const ID = 'num-chiffres-romains';
const NIVEAU: SchoolLevel = 'cm1';
const CATEGORIE = 'math-numeration';
const MODE_ECRIRE = 'ecrire';
const MODE_LIRE = 'lire';

/* ---------------------------------------------------------------
   Référentiel : l'écriture romaine DÉRIVÉE de ses règles
   --------------------------------------------------------------- */

const VALEURS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/* Les six formes soustractives, et six seulement (règle énoncée par l'issue). Elles
   servent deux fois : à éprouver le référentiel, et à reconnaître le palier d'un nombre
   à la seule vue de son écriture (critère 4). */
const SOUSTRACTIONS = ['IV', 'IX', 'XL', 'XC', 'CD', 'CM'];

/* Écriture d'UN chiffre à un rang donné, à partir de ses trois symboles (unité, cinq,
   dix). Les deux seules formes soustractives d'un rang sont 4 (`un` devant `cinq`) et
   9 (`un` devant `dix`) ; tout le reste est additif, avec au plus trois répétitions de
   `un` — ce qui interdit mécaniquement `IIII`, `XXXX`, `CCCC`, et interdit de répéter
   `cinq` (il n'apparaît qu'une fois, pour 5 ≤ d ≤ 8). */
function rang(d: number, un: string, cinq: string, dix: string): string {
	if (d === 4) return un + cinq;
	if (d === 9) return un + dix;
	return (d >= 5 ? cinq : '') + un.repeat(d % 5);
}

/* Écriture canonique d'un entier de 1 à 3999 (les milliers ne s'écrivent qu'en `M`
   répétés, au plus trois fois — d'où la borne haute). */
function enRomain(n: number): string {
	return (
		'M'.repeat(Math.floor(n / 1000)) +
		rang(Math.floor(n / 100) % 10, 'C', 'D', 'M') +
		rang(Math.floor(n / 10) % 10, 'X', 'L', 'C') +
		rang(n % 10, 'I', 'V', 'X')
	);
}

/* Lecture NAÏVE : somme des symboles, en soustrayant celui qui précède un symbole plus
   grand. C'est la lecture que fait n'importe quel décodeur permissif — et c'est
   précisément pour ça qu'elle sert ici : elle prouve que les écritures fautives
   fabriquées plus bas valent bien LE MÊME nombre que la forme canonique. Sans cette
   preuve, « la correction refuse `IIII` » ne dirait rien (elle refuse aussi « ABC »). */
function lectureNaive(s: string): number {
	let total = 0;
	for (let i = 0; i < s.length; i++) {
		const v = VALEURS[s[i]];
		const suivant = i + 1 < s.length ? VALEURS[s[i + 1]] : 0;
		total += v < suivant ? -v : v;
	}
	return total;
}

const PLAGE: number[] = Array.from({ length: 3999 }, (_, i) => i + 1);
const CANONIQUES = new Map<string, number>(PLAGE.map((n) => [enRomain(n), n]));
const estCanonique = (s: string): boolean => CANONIQUES.has(s);
const estLettresRomaines = (s: string): boolean => /^[IVXLCDM]+$/.test(s);

describe('Référentiel du test — les règles de l’écriture romaine', () => {
	it('3999 s’écrit MMMCMXCIX (ancre donnée par l’issue)', () => {
		expect(enRomain(3999)).toBe('MMMCMXCIX');
		// Quelques ancres dérivées à la main des mêmes règles.
		expect(enRomain(4)).toBe('IV');
		expect(enRomain(9)).toBe('IX');
		expect(enRomain(40)).toBe('XL');
		expect(enRomain(99)).toBe('XCIX');
		expect(enRomain(1000)).toBe('M');
		expect(enRomain(1987)).toBe('MCMLXXXVII');
	});

	it('chaque entier de 1 à 3999 a une écriture, et elles sont toutes DIFFÉRENTES', () => {
		// L'unicité de la forme canonique : 3999 nombres, 3999 écritures distinctes.
		expect(CANONIQUES.size).toBe(3999);
	});

	it('aller-retour : lire l’écriture canonique redonne le nombre', () => {
		for (const n of PLAGE) expect(lectureNaive(enRomain(n))).toBe(n);
	});

	it('aucune écriture ne viole les règles (répétitions, soustractions)', () => {
		for (const n of PLAGE) {
			const r = enRomain(n);
			// Jamais quatre fois le même signe.
			expect(/(.)\1{3}/.test(r), `${n} → ${r} répète quatre fois le même signe`).toBe(false);
			// V, L, D : jamais répétés.
			for (const s of ['V', 'L', 'D']) {
				expect(r.split(s).length - 1, `${n} → ${r} répète ${s}`).toBeLessThanOrEqual(1);
			}
			// Les seules paires « petit devant grand » sont les six formes soustractives.
			for (let i = 0; i + 1 < r.length; i++) {
				const paire = r.slice(i, i + 2);
				if (VALEURS[r[i]] < VALEURS[r[i + 1]]) {
					expect(SOUSTRACTIONS, `${n} → ${r} : soustraction ${paire} interdite`).toContain(paire);
				}
			}
		}
	});
});

/* ---------------------------------------------------------------
   Accès à la leçon + échantillonnage
   --------------------------------------------------------------- */

/* Échec EXPLICITE tant que la leçon n'existe pas : c'est l'état attendu à l'écriture
   de ce fichier (tests rouges avant le code). */
function lecon(): LessonDef {
	const l = getLessonById(ID);
	if (!l)
		throw new Error(
			`Leçon « ${ID} » absente du catalogue (getLessonById) — leçon pas encore implémentée.`,
		);
	return l;
}

const moteur = (): ExerciseType => lecon().exerciseType;

/* Graines fixes : un échec est rejouable à l'identique (withSeed déroute l'aléa de
   génération, #41), et l'échantillon reste large pour les bornes dures. */
const GRAINES = [1, 17, 2024, 987654321, 42424242];
const TAILLE = 3000; // par mode, réparti entre les graines

type ExerciceSaisi = Extract<Exercise, { type: 'text' } | { type: 'qcm' }>;
const estSaisi = (ex: Exercise): ex is ExerciceSaisi => ex.type === 'text' || ex.type === 'qcm';

/* Tire un échantillon pour un mode. Passe par `generateSession` quand le type en
   propose une — un tirage GRADUÉ (critère 4) peut très bien se piloter à la session,
   auquel cas des `generate()` isolés resteraient bloqués sur le premier palier et ne
   verraient jamais les milliers. */
function tirer(mode: ExerciseMode, combien = TAILLE): Exercise[] {
	const type = moteur();
	const opts = { mode, level: NIVEAU };
	const out: Exercise[] = [];
	const parGraine = Math.ceil(combien / GRAINES.length);
	for (const graine of GRAINES) {
		withSeed(graine, () => {
			let reste = parGraine;
			while (reste > 0) {
				if (type.generateSession) {
					const lot = type.generateSession(Math.min(reste, 10), opts);
					if (lot.length === 0) throw new Error('generateSession a rendu une session vide');
					out.push(...lot);
					reste -= lot.length;
				} else {
					out.push(type.generate(opts));
					reste -= 1;
				}
			}
		});
	}
	return out;
}

interface Converti {
	ex: ExerciceSaisi;
	enonce: string;
	romain: string; // l'écriture romaine EN JEU dans l'item (attendue ou présentée)
	valeur: number; // le nombre correspondant, lu avec le référentiel du test
}

/* Extrait le couple (nombre, écriture romaine) d'un item, SANS rien supposer de la
   formulation : on part de la réponse attendue, dont la nature est imposée par le mode
   (critère 2), et l'on dérive le reste avec le référentiel du test. */
function convertir(ex: Exercise, mode: ExerciseMode): Converti {
	if (!estSaisi(ex))
		throw new Error(`Format « ${ex.type} » inattendu : la leçon doit se jouer en saisie.`);
	const enonce = ex.question;
	const reponse = ex.answer.trim();
	if (mode === MODE_ECRIRE) {
		if (!estLettresRomaines(reponse))
			throw new Error(
				`Mode « ${MODE_ECRIRE} » : la réponse attendue « ${reponse} » n'est pas une écriture romaine (énoncé : « ${enonce} »).`,
			);
		return { ex, enonce, romain: reponse, valeur: lectureNaive(reponse) };
	}
	const valeur = Number(reponse.replace(/\s/g, '').replace(',', '.'));
	if (!Number.isInteger(valeur))
		throw new Error(
			`Mode « ${MODE_LIRE} » : la réponse attendue « ${reponse} » n'est pas un nombre entier (énoncé : « ${enonce} »).`,
		);
	return { ex, enonce, romain: enRomain(valeur), valeur };
}

const cache = new Map<ExerciseMode, Converti[]>();
function echantillon(mode: ExerciseMode): Converti[] {
	const deja = cache.get(mode);
	if (deja) return deja;
	const items = tirer(mode).map((ex) => convertir(ex, mode));
	cache.set(mode, items);
	return items;
}

const tousLesItems = (): Converti[] => [...echantillon(MODE_ECRIRE), ...echantillon(MODE_LIRE)];

/* Jetons d'apparence romaine d'un texte : suite de lettres du jeu I V X L C D M isolée
   (ni collée à une autre lettre, ni suivie d'une apostrophe — « L'écriture » n'est pas
   un nombre romain). */
function romainsDe(texte: string): string[] {
	return texte.match(/(?<![A-Za-zÀ-ÖØ-öø-ÿ])[IVXLCDM]+(?![A-Za-zÀ-ÖØ-öø-ÿ'’])/g) ?? [];
}

/* Nombres d'un texte, séparateurs de milliers neutralisés (« 3 999 » → 3999). */
function nombresDe(texte: string): number[] {
	const compact = texte.replace(/(\d)\s(?=\d)/g, '$1');
	return (compact.match(/\d+/g) ?? []).map(Number);
}

/* Notation à barre de multiplication (V̄ = 5 000), hors périmètre de la leçon :
   macron combinant, surlignement combinant, et leurs versions autonomes. Écrits par
   point de code plutôt qu'en clair — un macron combinant collé à un crochet de classe
   de caractères est illisible dans le source. */
const BARRES = [0x0304, 0x0305, 0x00af, 0x203e].map((c) => String.fromCodePoint(c));
const aUneBarre = (s: string): boolean => BARRES.some((b) => s.includes(b));

/* ---------------------------------------------------------------
   Branchement au catalogue
   --------------------------------------------------------------- */

describe('Chiffres romains — branchement au catalogue', () => {
	it('la leçon existe, en numération, et au CM1 SEULEMENT (le CE2 est hors périmètre)', () => {
		const l = lecon();
		expect(l.subject).toBe('math');
		expect(l.category).toBe(CATEGORIE);
		expect(l.levels).toEqual([NIVEAU]);
		const auCe2 = getLessonsByCategory(CATEGORIE, 'ce2').map((x) => x.id);
		expect(auCe2).not.toContain(ID);
		expect(getLessonsByCategory(CATEGORIE, NIVEAU).map((x) => x.id)).toContain(ID);
	});
});

/* ---------------------------------------------------------------
   Invariant de la notion (le cœur) : forme canonique unique
   --------------------------------------------------------------- */

describe('Chiffres romains — l’écriture en jeu est TOUJOURS la forme canonique', () => {
	it('pour chaque item des deux modes, écriture ⇄ nombre boucle sur la forme canonique', () => {
		for (const { romain, valeur, enonce } of tousLesItems()) {
			expect(estLettresRomaines(romain), `« ${romain} » (énoncé : ${enonce})`).toBe(true);
			expect(
				estCanonique(romain),
				`« ${romain} » (valeur ${valeur}, énoncé : ${enonce}) n'est pas la forme canonique`,
			).toBe(true);
			expect(romain, `pour ${valeur} (énoncé : ${enonce})`).toBe(enRomain(valeur));
			expect(lectureNaive(romain), `aller-retour de ${romain}`).toBe(valeur);
		}
	});

	it('mode « écrire » : l’énoncé porte bien le nombre à convertir', () => {
		for (const { enonce, valeur } of echantillon(MODE_ECRIRE)) {
			expect(nombresDe(enonce), `énoncé « ${enonce} » (attendu : ${valeur})`).toContain(valeur);
		}
	});

	it('mode « lire » : l’énoncé présente l’écriture canonique, et rien d’autre de romain', () => {
		for (const { enonce, romain, valeur } of echantillon(MODE_LIRE)) {
			const jetons = romainsDe(enonce);
			expect(jetons, `énoncé « ${enonce} » (attendu : ${valeur})`).toContain(romain);
			// Aucune écriture NON canonique montrée à l'enfant (critères 3 et 9).
			for (const j of jetons) {
				expect(estCanonique(j), `l'énoncé « ${enonce} » montre « ${j} », non canonique`).toBe(true);
			}
		}
	});
});

/* ---------------------------------------------------------------
   Critère 1 — toute l'étendue 1 à 3999
   --------------------------------------------------------------- */

describe('Critère 1 — la leçon couvre toute l’étendue 1 à 3999', () => {
	it('les items dépassent 100 et vont jusqu’aux milliers', () => {
		const valeurs = tousLesItems().map((i) => i.valeur);
		expect(Math.max(...valeurs), 'aucun item ne dépasse 100').toBeGreaterThan(100);
		expect(
			valeurs.some((v) => v >= 1000),
			'aucun item n’atteint le millier',
		).toBe(true);
		// Les petits nombres ne disparaissent pas non plus (l'étendue commence à 1).
		expect(
			valeurs.some((v) => v <= 20),
			'aucun petit nombre tiré',
		).toBe(true);
	});

	it('les symboles C, D et M sont réellement mobilisés', () => {
		const lettres = new Set(tousLesItems().flatMap((i) => i.romain.split('')));
		for (const s of ['I', 'V', 'X', 'L', 'C', 'D', 'M']) {
			expect(lettres.has(s), `le symbole ${s} n'est jamais mobilisé`).toBe(true);
		}
	});
});

/* ---------------------------------------------------------------
   Critère 2 — les deux sens
   --------------------------------------------------------------- */

describe('Critère 2 — les deux sens sont travaillés', () => {
	it('les deux modes existent', () => {
		const type = moteur();
		expect(hasMode(type, MODE_ECRIRE), `mode « ${MODE_ECRIRE} » absent`).toBe(true);
		expect(hasMode(type, MODE_LIRE), `mode « ${MODE_LIRE} » absent`).toBe(true);
	});

	it('« écrire » fait PRODUIRE l’écriture romaine ; « lire » fait produire le nombre', () => {
		// Sens opposés, constatés sur la nature de la réponse attendue : en « écrire »
		// l'enfant tape des symboles romains (il ne peut pas réussir sans en produire
		// une lui-même) ; en « lire » il tape un nombre en chiffres arabes.
		for (const { ex } of echantillon(MODE_ECRIRE)) {
			expect(estLettresRomaines(ex.answer.trim())).toBe(true);
		}
		for (const { ex } of echantillon(MODE_LIRE)) {
			expect(/^\d+$/.test(ex.answer.trim().replace(/\s/g, ''))).toBe(true);
		}
	});
});

/* ---------------------------------------------------------------
   Critère 3 — seule la forme canonique est acceptée
   --------------------------------------------------------------- */

/* Écritures FAUTIVES de même valeur, fabriquées par substitution sur la forme canonique
   TIRÉE — et non sur cinq nombres choisis d'avance : le tirage est aléatoire, on ne peut
   pas exiger qu'il sorte 4, 9, 40, 99 et 5. Chaque substitution conserve la valeur au
   sens de la lecture naïve (vérifié dans le test), donc elle piège exactement une
   correction qui DÉCODERAIT la saisie au lieu d'exiger la forme canonique.
   Les cas nommés par l'issue en sont les instances pures : `IV` → `IIII` sur la valeur 4,
   `IX` → `VIIII` sur 9, `XL` → `XXXX` sur 40, `XCIX` → `IC` sur 99, `V` → `VX` sur 5. */
const FAUTES: { nom: string; fabrique: (r: string) => string | undefined }[] = [
	{
		nom: 'IIII pour 4 (quatre fois le même signe)',
		fabrique: (r) => (r.includes('IV') ? r.replace('IV', 'IIII') : undefined),
	},
	{
		nom: 'VIIII pour 9 (quatre fois le même signe)',
		fabrique: (r) => (r.includes('IX') ? r.replace('IX', 'VIIII') : undefined),
	},
	{
		nom: 'XXXX pour 40 (quatre fois le même signe)',
		fabrique: (r) => (r.includes('XL') ? r.replace('XL', 'XXXX') : undefined),
	},
	{
		nom: 'CCCC pour 400 (quatre fois le même signe)',
		fabrique: (r) => (r.includes('CD') ? r.replace('CD', 'CCCC') : undefined),
	},
	{
		nom: 'DCCCC pour 900 (quatre fois le même signe)',
		fabrique: (r) => (r.includes('CM') ? r.replace('CM', 'DCCCC') : undefined),
	},
	{
		nom: 'IC pour 99 (soustraction hors des six formes autorisées)',
		fabrique: (r) => (r.includes('XCIX') ? r.replace('XCIX', 'IC') : undefined),
	},
	{
		nom: 'VX pour 5 (le V ne se soustrait jamais)',
		fabrique: (r) => (r.endsWith('V') ? `${r}X` : undefined),
	},
];

describe('Critère 3 — la correction n’accepte que la forme canonique', () => {
	it('la forme canonique est acceptée (espaces autour tolérés comme partout)', () => {
		const type = moteur();
		for (const { ex, romain, enonce } of echantillon(MODE_ECRIRE)) {
			expect(type.check(ex, romain), `« ${romain} » refusé (énoncé : ${enonce})`).toBe(true);
			// `normalizeText` (chemin de correction du dépôt) coupe les espaces de bord :
			// une saisie tapée avec un espace parasite ne doit pas coûter un point.
			expect(type.check(ex, ` ${romain} `), `« ${romain} » refusé à cause d'un espace`).toBe(true);
		}
		for (const { ex, valeur } of echantillon(MODE_LIRE)) {
			expect(type.check(ex, String(valeur)), `« ${valeur} » refusé`).toBe(true);
		}
	});

	it('toute écriture non canonique DE MÊME VALEUR est refusée', () => {
		const type = moteur();
		for (const { ex, romain, valeur, enonce } of echantillon(MODE_ECRIRE)) {
			for (const faute of FAUTES) {
				const saisie = faute.fabrique(romain);
				if (!saisie || saisie === romain) continue;
				// La faute vaut bien le même nombre pour un décodeur permissif : sans ça,
				// la refuser ne prouverait rien.
				expect(lectureNaive(saisie), `${saisie} ne vaut pas ${valeur}`).toBe(valeur);
				expect(estCanonique(saisie), `${saisie} serait canonique ?`).toBe(false);
				expect(
					type.check(ex, saisie),
					`« ${saisie} » accepté pour ${valeur} — ${faute.nom} (énoncé : ${enonce})`,
				).toBe(false);
			}
		}
	});

	it('les sept écritures fautives sont bien éprouvées par l’échantillon', () => {
		// Sans ce décompte, le test précédent passerait « vert » en n'ayant jamais rien
		// soumis (si aucune forme tirée ne contient IV, IX, XL…).
		const vus = new Map<string, number>();
		for (const { romain } of echantillon(MODE_ECRIRE)) {
			for (const faute of FAUTES) {
				if (faute.fabrique(romain)) vus.set(faute.nom, (vus.get(faute.nom) ?? 0) + 1);
			}
		}
		for (const faute of FAUTES) {
			expect(
				vus.get(faute.nom) ?? 0,
				`aucun item de l'échantillon ne permet d'éprouver « ${faute.nom} » — l'étendue 1-3999 (critère 1) n'est pas couverte`,
			).toBeGreaterThan(0);
		}
	});

	it('le chemin catalogue (fiche/bilan) corrige comme le moteur', () => {
		// Deux chemins de correction existent (`ExerciseType.check` en leçon,
		// `checkItemAnswer` en fiche/bilan/révision). Ils ne doivent pas dire deux choses
		// différentes de la même saisie.
		const l = lecon();
		let fautesSoumises = 0;
		for (let i = 0; i < 400; i++) {
			const item = withSeed(i + 1, () => genLessonItem(l, NIVEAU));
			const attendu = String(item.answer).trim();
			expect(checkItemAnswer(item, attendu), `« ${attendu} » refusé (item : ${item.text})`).toBe(
				true,
			);
			if (!estLettresRomaines(attendu)) continue;
			for (const faute of FAUTES) {
				const saisie = faute.fabrique(attendu);
				if (!saisie || saisie === attendu) continue;
				fautesSoumises++;
				expect(
					checkItemAnswer(item, saisie),
					`« ${saisie} » accepté en fiche/bilan pour ${attendu} — ${faute.nom}`,
				).toBe(false);
			}
		}
		// Le mode par défaut décide si le chemin catalogue peut soumettre une écriture
		// romaine : s'il s'agit d'« écrire », l'échantillon DOIT en avoir soumis.
		if (defaultMode(moteur()) === MODE_ECRIRE) expect(fautesSoumises).toBeGreaterThan(0);
	});
});

/* ---------------------------------------------------------------
   Critère 8 — aucun calcul
   --------------------------------------------------------------- */

describe('Critère 8 — aucun item ne demande un calcul', () => {
	it('aucun énoncé ne porte d’opérateur ni de vocabulaire de calcul', () => {
		// Le signe « = » n'est PAS dans la liste : les leçons de conversion du dépôt
		// écrivent leur énoncé « 3 m = @ cm », et une conversion romaine peut légitimement
		// se présenter pareil. C'est l'OPÉRATION qui est proscrite, pas l'égalité.
		const OPERATEURS = /[+×÷*]|(?<=\d|[IVXLCDM])\s[-−/]\s/;
		const LEXIQUE =
			/\b(calcul\w*|additionn\w*|addition|somme|soustrai\w*|soustraction|différence|multipli\w*|produit|divise\w*|division|total)\b/i;
		for (const { enonce } of tousLesItems()) {
			expect(OPERATEURS.test(enonce), `énoncé « ${enonce} » : opérateur de calcul`).toBe(false);
			expect(LEXIQUE.test(enonce), `énoncé « ${enonce} » : vocabulaire de calcul`).toBe(false);
		}
	});

	it('aucun énoncé ne met DEUX écritures romaines en présence', () => {
		// « XIV + VI » : deux opérandes romains dans le même énoncé, c'est un calcul.
		// Si ce test rougit sur un énoncé qui CITE une écriture en exemple (rappel de
		// règle, critère 6), c'est la place de la citation qu'il faut revoir — un rappel
		// de règle vit dans la consigne ou l'étayage, pas dans la question tirée.
		for (const { enonce } of tousLesItems()) {
			expect(romainsDe(enonce).length, `énoncé « ${enonce} »`).toBeLessThanOrEqual(1);
		}
	});
});

/* ---------------------------------------------------------------
   Critère 9 — rien hors de 1 à 3999
   --------------------------------------------------------------- */

describe('Critère 9 — rien hors de 1 à 3999', () => {
	it('toutes les valeurs sont des entiers de 1 à 3999 (ni zéro, ni négatif)', () => {
		for (const { valeur, enonce } of tousLesItems()) {
			expect(Number.isInteger(valeur), `valeur ${valeur} (énoncé : ${enonce})`).toBe(true);
			expect(valeur, `valeur ${valeur} (énoncé : ${enonce})`).toBeGreaterThanOrEqual(1);
			expect(valeur, `valeur ${valeur} (énoncé : ${enonce})`).toBeLessThanOrEqual(3999);
		}
	});

	it('aucune écriture ne dépasse MMM, ni ne répète quatre fois un signe, ni n’utilise de barre', () => {
		for (const { romain, enonce } of tousLesItems()) {
			expect(romain.includes('MMMM'), `« ${romain} » (énoncé : ${enonce})`).toBe(false);
			expect(/(.)\1{3}/.test(romain), `« ${romain} » répète quatre fois un signe`).toBe(false);
			// Notation à barre (V̄ = 5 000), hors périmètre : ni macron combinant, ni
			// surligné, ni parenthèse multiplicative.
			expect(aUneBarre(romain + enonce), `« ${enonce} » : notation à barre`).toBe(false);
		}
	});
});

/* ---------------------------------------------------------------
   Critère 10 — le mode principal est une saisie
   --------------------------------------------------------------- */

describe('Critère 10 — le mode principal n’est ni QCM ni appariement', () => {
	it('le mode par défaut produit une SAISIE (pas de choix à reconnaître)', () => {
		const type = moteur();
		const mode = defaultMode(type);
		expect(mode, 'la leçon ne déclare aucun mode').toBeDefined();
		expect(type.exerciseKind).not.toBe('appariement');
		for (let i = 0; i < 200; i++) {
			const ex = withSeed(i + 1, () => type.generate({ mode, level: NIVEAU }));
			expect(ex.type, `le mode principal rend des items « ${ex.type} »`).toBe('text');
		}
	});
});

/* ---------------------------------------------------------------
   Critère 11 — les leçons de numération existantes ne bougent pas
   --------------------------------------------------------------- */

/* Écritures romaines PLAUSIBLES d'un texte : jetons canoniques (donc « XIV », pas
   « Vrai »). Dans un énoncé on exige deux symboles au moins — un « L » ou un « C »
   isolé dans une phrase française n'est pas un nombre romain ; dans une RÉPONSE, un
   seul symbole suffit à trahir un nombre romain. */
function romainsSuspects(texte: string, longueurMin: number): string[] {
	return romainsDe(texte).filter((j) => j.length >= longueurMin && estCanonique(j));
}

describe('Critère 11 — aucune leçon de numération existante ne tire de nombres romains', () => {
	it('le détecteur signale bien une écriture romaine (et rien d’autre)', () => {
		// Témoin : sans lui, un détecteur devenu inerte laisserait le test suivant vert.
		expect(romainsSuspects('Écris XIV en chiffres arabes.', 2)).toEqual(['XIV']);
		expect(romainsSuspects('MMMCMXCIX', 1)).toEqual(['MMMCMXCIX']);
		// Témoins négatifs : du français ordinaire ne doit pas être signalé.
		expect(romainsSuspects('Quel est le chiffre des dizaines dans 4 512 ?', 2)).toEqual([]);
		expect(romainsSuspects('L’écriture du nombre. Voici Mille.', 2)).toEqual([]);
	});

	it('les leçons de numération autres que celle-ci gardent leurs nombres arabes', () => {
		const autres = getLessonsByCategory(CATEGORIE).filter((l) => l.id !== ID);
		expect(autres.length, 'aucune leçon de numération à surveiller').toBeGreaterThan(0);
		for (const l of autres) {
			for (const niveau of l.levels) {
				for (let i = 0; i < 40; i++) {
					const item = withSeed(i + 1, () => genLessonItem(l, niveau));
					const reponses = [String(item.answer), ...(item.answers ?? []), ...(item.choices ?? [])];
					expect(
						romainsSuspects(item.text, 2),
						`${l.id} (${niveau}) : énoncé « ${item.text} »`,
					).toEqual([]);
					for (const r of reponses) {
						expect(romainsSuspects(r, 1), `${l.id} (${niveau}) : réponse « ${r} »`).toEqual([]);
					}
				}
			}
		}
	});
});

/* ---------------------------------------------------------------
   Critère 4 — le tirage est GRADUÉ, pas uniforme sur 1 à 3999
   ---------------------------------------------------------------

   Écrit APRÈS le code : aucun palier n'était observable à la première passe. Mutations
   jouées contre `src/` pour vérifier que ces tests gardent quelque chose —
   - `progressionPaliers` rendant une série d'un seul palier tiré au hasard
     (`Array(count).fill(tirerPalierRomain())`) → « la fiche sert la progression » rougit ;
   - `generate()` tirant uniformément sur 1-3999, ce que le critère proscrit → « un item
     isolé reste gradué » rougit ;
   - `aUneSoustraction` rendant toujours `false` (le palier 2 se vide) → « les trois
     paliers partitionnent » et « palier 1 = purement additif » rougissent. */

/* Palier d'un nombre, DÉRIVÉ de son écriture comme le critère l'énonce : les MILLIERS
   (l'écriture commence par M), sinon les formes SOUSTRACTIVES (elle contient une des six
   paires), sinon l'écriture est purement ADDITIVE. Le module, lui, le déduit des chiffres
   4 et 9 du nombre : deux dérivations indépendantes, dont le test exige plus bas qu'elles
   coïncident sur toute l'étendue. */
function palierAttendu(n: number): PalierRomain {
	const r = enRomain(n);
	if (r.startsWith('M')) return 3;
	return SOUSTRACTIONS.some((f) => r.includes(f)) ? 2 : 1;
}

/* Valeur portée par un item de fiche, quel que soit le sens : la réponse attendue est
   l'écriture romaine (mode « écrire ») ou le nombre (mode « lire »). */
function valeurDeItem(item: Item): number {
	const rep = String(item.answer).trim();
	return estLettresRomaines(rep) ? lectureNaive(rep) : Number(rep.replace(/\s/g, ''));
}

/* Tirages DANS un palier, graines fixes : un échec se rejoue à l'identique. */
function tiragesDuPalier(palier: PalierRomain, parGraine = 300): number[] {
	const out: number[] = [];
	for (const graine of GRAINES) {
		withSeed(graine, () => {
			for (let i = 0; i < parGraine; i++) out.push(tirerNombreRomain(palier));
		});
	}
	return out;
}

describe('Critère 4 — le tirage est gradué, pas uniforme sur 1 à 3999', () => {
	it('les trois paliers partitionnent 1-3999 : non vides, disjoints, sans trou', () => {
		expect(PALIERS_ROMAINS.length, 'la progression ne compte pas trois paliers').toBe(3);
		const vus = new Map<number, PalierRomain>();
		for (const palier of PALIERS_ROMAINS) {
			const nombres = nombresDuPalier(palier);
			expect(nombres.length, `le palier ${palier} est vide`).toBeGreaterThan(0);
			for (const n of nombres) {
				expect(vus.has(n), `${n} appartient aux paliers ${vus.get(n)} ET ${palier}`).toBe(false);
				vus.set(n, palier);
			}
		}
		for (const n of PLAGE) {
			expect(vus.has(n), `${n} (${enRomain(n)}) n'est dans aucun palier`).toBe(true);
		}
		expect(vus.size, 'les paliers débordent de 1-3999').toBe(PLAGE.length);
	});

	it('palier 1 = purement additif ; palier 2 = les formes soustractives ; palier 3 = les milliers', () => {
		// Le classement du module confronté à celui que le critère décrit, sur les 3 999
		// nombres. Les deux se calculent autrement : l'un lit les chiffres du nombre, l'autre
		// regarde l'écriture. S'ils divergent, « purement additif » n'a pas le même sens des
		// deux côtés.
		for (const n of PLAGE) {
			expect(palierDe(n), `${n} → ${enRomain(n)}`).toBe(palierAttendu(n));
		}
		for (const palier of PALIERS_ROMAINS) {
			for (const n of nombresDuPalier(palier)) {
				expect(palierDe(n), `${n} → ${enRomain(n)} rangé au palier ${palier}`).toBe(palier);
			}
		}
	});

	it('un échantillon du PREMIER palier ne contient ni MMMCMXCIX ni XLIV', () => {
		// Le cas d'échec écrit dans l'issue, mot pour mot. Tiré et non énuméré : c'est le
		// TIRAGE qui doit rester dans son palier, pas seulement la table qui le décrit.
		const tirages = tiragesDuPalier(1);
		for (const n of tirages) {
			const r = enRomain(n);
			expect(n, `${r} = ${n} : un millier au premier palier`).toBeLessThan(1000);
			expect(r.includes('M'), `${r} = ${n} : le signe M au premier palier`).toBe(false);
			for (const f of SOUSTRACTIONS) {
				expect(r.includes(f), `${r} = ${n} : la forme soustractive ${f} au premier palier`).toBe(
					false,
				);
			}
		}
		// Sans les deux lignes ci-dessous, un tirage figé sur « I » passerait le test sans
		// rien apprendre à personne : le palier doit être DENSE sur toute son étendue.
		expect(
			new Set(tirages).size,
			'le premier palier ne tire qu’une poignée de nombres',
		).toBeGreaterThan(100);
		expect(Math.max(...tirages), 'le premier palier plafonne sous 100').toBeGreaterThan(100);
	});

	it('le deuxième palier mobilise vraiment une forme soustractive, et reste sous le millier', () => {
		const tirages = tiragesDuPalier(2);
		for (const n of tirages) {
			const r = enRomain(n);
			expect(n, `${r} = ${n} : un millier au deuxième palier`).toBeLessThan(1000);
			expect(
				SOUSTRACTIONS.some((f) => r.includes(f)),
				`${r} = ${n} : aucune forme soustractive au palier qui les travaille`,
			).toBe(true);
		}
		expect(
			new Set(tirages).size,
			'le deuxième palier ne tire qu’une poignée de nombres',
		).toBeGreaterThan(100);
	});

	it('le troisième palier est celui des milliers, et monte jusqu’aux MMM', () => {
		const tirages = tiragesDuPalier(3);
		for (const n of tirages) {
			expect(n, `${enRomain(n)} = ${n} : pas un millier`).toBeGreaterThanOrEqual(1000);
			expect(n, `${enRomain(n)} = ${n} : au-delà de l'étendue`).toBeLessThanOrEqual(3999);
		}
		expect(Math.max(...tirages), 'le palier des milliers ne dépasse jamais 3000').toBeGreaterThan(
			3000,
		);
	});

	it('la FICHE sert la progression : les paliers arrivent dans l’ordre, et les trois y sont', () => {
		// Le point qui compte. Des paliers exposés mais jamais SERVIS passeraient tous les
		// tests précédents, et la fiche de l'enfant resterait un tirage uniforme : on passe
		// donc par `genItems`, exactement ce que `buildLessonFiche` appelle pour la remplir.
		const l = lecon();
		for (const mode of [MODE_ECRIRE, MODE_LIRE]) {
			for (const graine of GRAINES) {
				for (const combien of [8, 10, 12]) {
					const items = withSeed(graine, () => genItems(l, combien, NIVEAU, mode));
					const trace = `${mode}/graine ${graine}/${combien} questions : ${items
						.map((x) => String(x.answer))
						.join(' ')}`;
					expect(
						items.length,
						`série trop courte pour montrer une progression — ${trace}`,
					).toBeGreaterThanOrEqual(3);
					const paliers = items.map((x) => palierAttendu(valeurDeItem(x)));
					for (let i = 1; i < paliers.length; i++) {
						expect(
							paliers[i] >= paliers[i - 1],
							`retour en arrière à la question ${i + 1} (palier ${paliers[i]} après ${paliers[i - 1]}) — ${trace}`,
						).toBe(true);
					}
					expect(
						[...new Set(paliers)].sort((a, b) => a - b),
						`un palier manque à la série — ${trace}`,
					).toEqual([1, 2, 3]);
				}
			}
		}
	});

	it('la suite des paliers est ordonnée quelle que soit la longueur de la série', () => {
		// Bords : une série vide ne demande rien, une question isolée commence par le plus
		// facile, et aucune longueur ne perd de question en route (une fiche de 8 questions
		// en pose 8).
		expect(progressionPaliers(0), 'une série vide ne demande aucun palier').toEqual([]);
		expect(progressionPaliers(1), 'une question isolée doit être la plus simple').toEqual([1]);
		for (let combien = 1; combien <= 30; combien++) {
			const suite = progressionPaliers(combien);
			expect(suite.length, `série de ${combien} questions`).toBe(combien);
			for (let i = 1; i < suite.length; i++) {
				expect(suite[i] >= suite[i - 1], `série de ${combien} : ${suite.join('')}`).toBe(true);
			}
			if (combien >= 3) {
				expect(
					[...new Set(suite)].sort((a, b) => a - b),
					`série de ${combien} : ${suite.join('')}`,
				).toEqual([1, 2, 3]);
			}
		}
	});

	it('un item tiré ISOLÉMENT (bilan, révision) reste gradué au lieu d’être uniforme', () => {
		// Hors série, il n'y a plus d'ordre à tenir : la graduation ne peut être qu'une
		// fréquence. Repère du tirage uniforme sur 1-3999, celui que le critère proscrit :
		// 3 000/3 999 = 75 % de milliers, 511/3 999 = 13 % d'écritures purement additives.
		// Les seuils ci-dessous s'en écartent franchement sans figer les poids du module.
		const type = moteur();
		const paliers: PalierRomain[] = [];
		for (const graine of GRAINES) {
			withSeed(graine, () => {
				for (let i = 0; i < 400; i++) {
					const ex = type.generate({ mode: MODE_ECRIRE, level: NIVEAU });
					paliers.push(palierAttendu(convertir(ex, MODE_ECRIRE).valeur));
				}
			});
		}
		const part = (p: PalierRomain): number =>
			paliers.filter((x) => x === p).length / paliers.length;
		expect(
			part(1),
			`écritures additives : ${(part(1) * 100).toFixed(1)} % — pas plus qu'un tirage uniforme (13 %)`,
		).toBeGreaterThan(0.25);
		expect(
			part(3),
			`milliers : ${(part(3) * 100).toFixed(1)} % — ils écrasent la série comme dans un tirage uniforme (75 %)`,
		).toBeLessThan(0.5);
		expect(part(2), 'les formes soustractives ne sortent jamais d’un tirage isolé').toBeGreaterThan(
			0.05,
		);
	});
});

/* ---------------------------------------------------------------
   Critère 5 — après une erreur, la RÈGLE enfreinte est nommée
   ---------------------------------------------------------------

   Écrit APRÈS le code, comme le critère 4. Mutations jouées contre `src/` —
   - `regleEnfreinte` rendant `undefined` dès que la saisie n'est pas canonique (le
     silence : la réponse est révélée, la règle non) → tous les tests de ce bloc rougissent ;
   - la branche `repetition-quadruple` retirée (une faute de répétition tombe alors sur
     `ordre-des-signes`) → « la règle diagnostiquée est celle qui est enfreinte » rougit ;
   - `libelleRegleRomaine` rendant la même phrase pour toutes les classes → « chaque
     classe a SA phrase » rougit ;
   - `champRomain: true` retiré de la leçon (le feedback n'est plus déclenché nulle part)
     → « le drapeau est posé là où l'enfant écrit du romain » rougit.

   Ce qui n'est PAS ici : que la phrase s'affiche à l'écran, à côté de l'écriture
   attendue. Sans DOM, on ne peut en tenir que la moitié logique — l'autre relève de la
   spec Playwright. */

/* Les classes de faute, ÉNUMÉRÉES exhaustivement. Le `Record` typé par l'union fait
   échouer `tsc` le jour où une classe s'ajoute sans phrase ni cas de test : la table ne
   peut pas se désynchroniser en silence. La valeur est la faute telle que le TEST la
   décrit (elle sert aux messages d'échec), pas la phrase montrée à l'enfant. */
const CLASSES_DE_REGLE: Record<RegleRomaine, string> = {
	'signe-inconnu': 'une lettre hors des sept signes',
	'repetition-quadruple': 'quatre fois le même signe',
	'repetition-interdite': 'V, L ou D écrit deux fois',
	'soustraction-interdite': 'une soustraction hors des six formes autorisées',
	'ordre-des-signes': 'des signes mal rangés',
	'autre-nombre': 'une écriture correcte, mais celle d’un autre nombre',
};

/* Les fautes de la première passe (celles que la correction refuse, critère 3) plus les
   deux exemples de l'issue, avec la règle qu'elles enfreignent. La règle est DÉRIVÉE de
   la faute elle-même — « XXXXIIII » écrit quatre fois le même signe, « IC » soustrait
   hors des six formes — et non de l'ordre dans lequel le module fait ses contrôles.
   Une saisie qui cumule deux fautes reçoit la plus VISIBLE : `DCCCC` répète C quatre
   fois, ce qui se compte, là où « D et CCCC ne se combinent pas » demande de connaître
   la forme canonique — d'où `repetition-quadruple` et non `ordre-des-signes`. */
const CAS_REGLE: { saisie: string; cible: number; regle: RegleRomaine }[] = [
	{ saisie: 'IIII', cible: 4, regle: 'repetition-quadruple' },
	{ saisie: 'VIIII', cible: 9, regle: 'repetition-quadruple' },
	{ saisie: 'XXXX', cible: 40, regle: 'repetition-quadruple' },
	{ saisie: 'CCCC', cible: 400, regle: 'repetition-quadruple' },
	{ saisie: 'DCCCC', cible: 900, regle: 'repetition-quadruple' },
	// L'exemple littéral de l'issue : « XXXXIIII » pour 44, dont l'enfant doit apprendre
	// pourquoi il ne va pas, et pas seulement que la réponse était XLIV.
	{ saisie: 'XXXXIIII', cible: 44, regle: 'repetition-quadruple' },
	{ saisie: 'IC', cible: 99, regle: 'soustraction-interdite' },
	{ saisie: 'VX', cible: 5, regle: 'soustraction-interdite' },
	// V, L et D ne se répètent pas : 10, ce n'est pas « cinq et cinq ».
	{ saisie: 'VV', cible: 10, regle: 'repetition-interdite' },
	// Chaque morceau est licite, l'assemblage ne l'est pas : le I traîne des deux côtés.
	{ saisie: 'IXI', cible: 11, regle: 'ordre-des-signes' },
	// Le chiffre arabe tapé dans le champ romain, et une lettre qui n'est pas un signe.
	{ saisie: '4', cible: 4, regle: 'signe-inconnu' },
	{ saisie: 'ABC', cible: 3, regle: 'signe-inconnu' },
	// Écriture irréprochable… d'un autre nombre (la confusion XIV / XL, classique).
	{ saisie: 'XIV', cible: 40, regle: 'autre-nombre' },
];

/* Corruptions DÉTERMINISTES d'une écriture : ce qu'un enfant tape en se trompant — un
   signe oublié, un signe doublé, deux signes intervertis, une lettre étrangère. Sert à
   éprouver le critère sur ce que l'enfant écrit VRAIMENT, et pas seulement sur les
   quelques fautes de manuel listées au-dessus. */
function corruptions(r: string): string[] {
	const out: string[] = [];
	for (let i = 0; i < r.length; i++) {
		out.push(r.slice(0, i) + r.slice(i + 1)); // signe oublié
		out.push(r.slice(0, i) + r[i] + r.slice(i)); // signe doublé
		out.push(`${r.slice(0, i)}Z${r.slice(i)}`); // lettre étrangère
		if (i + 1 < r.length) out.push(r.slice(0, i) + r[i + 1] + r[i] + r.slice(i + 2)); // interversion
	}
	return out.filter((s) => s !== '' && s !== r);
}

describe('Critère 5 — après une erreur, la règle enfreinte est nommée', () => {
	it('chaque classe de faute est éprouvée par au moins un cas', () => {
		// Sans ce décompte, ajouter une classe sans la soumettre à `regleEnfreinte` laisserait
		// le test suivant vert en ne l'ayant jamais jouée.
		const couvertes = new Set(CAS_REGLE.map((c) => c.regle));
		for (const regle of Object.keys(CLASSES_DE_REGLE) as RegleRomaine[]) {
			expect(
				couvertes.has(regle),
				`aucun cas n'éprouve « ${regle} » (${CLASSES_DE_REGLE[regle]})`,
			).toBe(true);
		}
	});

	it('la règle diagnostiquée est celle que la saisie enfreint vraiment', () => {
		for (const { saisie, cible, regle } of CAS_REGLE) {
			expect(
				regleEnfreinte(saisie, cible),
				`« ${saisie} » pour ${cible} (${enRomain(cible)}) : ${CLASSES_DE_REGLE[regle]}`,
			).toBe(regle);
		}
	});

	it('chaque classe a SA phrase : non vide, rédigée, et distincte des autres', () => {
		// Une même phrase pour deux fautes différentes ne dit plus ce qui a été enfreint :
		// l'enfant relit « ça ne va pas » sans savoir quoi regarder dans son écriture.
		const vues = new Map<string, RegleRomaine>();
		for (const regle of Object.keys(CLASSES_DE_REGLE) as RegleRomaine[]) {
			const phrase = libelleRegleRomaine(regle).trim();
			expect(phrase, `« ${regle} » n'a aucune phrase`).not.toBe('');
			expect(phrase, `« ${regle} » : l'identifiant technique n'est pas une phrase`).not.toBe(regle);
			// Une règle énoncée, pas un mot-clé : l'enfant doit pouvoir la LIRE.
			expect(
				phrase.split(/\s+/).length,
				`« ${regle} » : « ${phrase} » n'énonce pas une règle`,
			).toBeGreaterThan(4);
			const deja = vues.get(phrase);
			expect(
				deja,
				`« ${regle} » dit exactement la même chose que « ${deja} » : « ${phrase} »`,
			).toBeUndefined();
			vues.set(phrase, regle);
		}
	});

	it('une saisie JUSTE, ou VIDE, ne reçoit aucune leçon de règle', () => {
		// Les deux bords. On ne fait pas la leçon à qui a eu juste, ni à qui n'a pas répondu :
		// un champ laissé vide n'est pas une faute d'écriture, et lui servir la règle
		// transformerait un blanc en reproche.
		for (const n of [1, 4, 9, 40, 44, 99, 400, 900, 1987, 3999]) {
			const r = enRomain(n);
			expect(regleEnfreinte(r, n), `« ${r} » est la bonne réponse pour ${n}`).toBeUndefined();
		}
		for (const vide of ['', ' ', '\t', '   ']) {
			expect(
				regleEnfreinte(vide, 44),
				`champ vide (${JSON.stringify(vide)}) : rien à reprocher`,
			).toBeUndefined();
		}
	});

	it('toute saisie REFUSÉE reçoit une règle nommée, toute saisie ACCEPTÉE n’en reçoit aucune', () => {
		// Les deux chemins doivent dire la même chose de la même saisie : compter faux sans
		// nommer la règle laisse l'enfant recommencer la même faute ; nommer une règle sur
		// une réponse acceptée serait un reproche gratuit.
		const type = moteur();
		let refusees = 0;
		let acceptees = 0;
		for (const { ex, romain, valeur, enonce } of echantillon(MODE_ECRIRE)) {
			for (const variante of [romain, ` ${romain} `, romain.toLowerCase()]) {
				if (!type.check(ex, variante)) continue;
				acceptees++;
				expect(
					regleEnfreinte(variante, valeur),
					`« ${variante} » est acceptée et reçoit pourtant une leçon de règle (${enonce})`,
				).toBeUndefined();
			}
			for (const faute of FAUTES) {
				const saisie = faute.fabrique(romain);
				if (!saisie || saisie === romain) continue;
				refusees++;
				const regle = regleEnfreinte(saisie, valeur);
				expect(
					regle,
					`« ${saisie} » est comptée fausse pour ${valeur} sans qu'aucune règle soit nommée — ${faute.nom}`,
				).toBeDefined();
				if (!regle) continue;
				expect(
					libelleRegleRomaine(regle).trim(),
					`règle « ${regle} » diagnostiquée sans phrase à montrer`,
				).not.toBe('');
			}
		}
		expect(acceptees, 'aucune saisie acceptée éprouvée').toBeGreaterThan(0);
		expect(refusees, 'aucune saisie refusée éprouvée').toBeGreaterThan(0);
	});

	it('n’importe quelle écriture fausse reçoit une règle, jamais le silence', () => {
		// Le vrai contenu du critère : ce ne sont pas « les sept fautes du manuel » qu'il faut
		// diagnostiquer, c'est CE QUE L'ENFANT TAPE. On corrompt donc des écritures canoniques
		// comme il se trompe, sur toute l'étendue, et l'on exige une règle à chaque fois.
		let casEprouves = 0;
		for (let i = 0; i < PLAGE.length; i += 37) {
			const n = PLAGE[i];
			const r = enRomain(n);
			for (const faux of corruptions(r)) {
				casEprouves++;
				const regle = regleEnfreinte(faux, n);
				expect(regle, `« ${faux} » pour ${n} (${r}) : aucune règle nommée`).toBeDefined();
				if (!regle) continue;
				expect(
					CLASSES_DE_REGLE[regle],
					`« ${faux} » pour ${n} : règle « ${regle} » inconnue du test`,
				).toBeDefined();
				expect(
					libelleRegleRomaine(regle).trim(),
					`« ${faux} » pour ${n} : règle « ${regle} » sans phrase`,
				).not.toBe('');
			}
		}
		expect(casEprouves, 'aucune corruption éprouvée').toBeGreaterThan(2000);
	});

	it('le drapeau qui déclenche le feedback est posé là où l’enfant écrit du romain', () => {
		// `regleEnfreinte` pourrait être irréprochable et n'être appelée nulle part : le
		// feedback est piloté par la DONNÉE de l'item (`saisieRomaine`), pas par l'identifiant
		// de la leçon. C'est la seule moitié du critère observable sans DOM.
		const l = lecon();
		const enEcrire = withSeed(7, () => genItems(l, 8, NIVEAU, MODE_ECRIRE));
		const enLire = withSeed(7, () => genItems(l, 8, NIVEAU, MODE_LIRE));
		expect(enEcrire.length, 'aucun item en mode « écrire »').toBeGreaterThan(0);
		expect(enLire.length, 'aucun item en mode « lire »').toBeGreaterThan(0);
		for (const item of enEcrire) {
			expect(
				item.saisieRomaine,
				`« ${item.text} » : réponse romaine sans le drapeau, aucune règle ne sera nommée`,
			).toBe(true);
			expect(
				estLettresRomaines(String(item.answer)),
				`« ${item.text} » : le drapeau annonce une écriture romaine, la réponse n'en est pas une`,
			).toBe(true);
		}
		for (const item of enLire) {
			expect(
				item.saisieRomaine,
				`« ${item.text} » : la réponse attendue est un nombre, le drapeau n'a rien à y faire`,
			).toBeFalsy();
		}
	});
});
