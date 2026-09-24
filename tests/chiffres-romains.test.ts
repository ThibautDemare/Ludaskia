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

   Critères NON traduits ici, faute d'API arrêtée — voir le compte rendu :
   4 (tirage gradué : aucun palier n'est observable depuis l'extérieur),
   5 (règle enfreinte nommée dans le feedback : demanderait une fonction pure exportée),
   6 (« c'est un autre système » : relève du rendu / d'une formulation, pas d'un
   mécanisme observable — l'asserter reviendrait à figer une phrase),
   7 (journalisation : déjà tenue par les gates `tests/erreurs-journal-gate.test.ts`,
   `tests/couverture-e2e-gate.test.ts` et `e2e/journal-couverture.ts`).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, getLessonsByCategory, genLessonItem } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { defaultMode, hasMode } from '../src/core/exercise';
import type { Exercise, ExerciseMode, ExerciseType } from '../src/core/exercise';
import { withSeed } from '../src/core/utils';

const ID = 'num-chiffres-romains';
const NIVEAU: SchoolLevel = 'cm1';
const CATEGORIE = 'math-numeration';
const MODE_ECRIRE = 'ecrire';
const MODE_LIRE = 'lire';

/* ---------------------------------------------------------------
   Référentiel : l'écriture romaine DÉRIVÉE de ses règles
   --------------------------------------------------------------- */

const VALEURS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

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
		const SOUSTRACTIONS = ['IV', 'IX', 'XL', 'XC', 'CD', 'CM'];
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
