/* ============================================================
   Ce que le PAPIER et la forme écrite disent d'une leçon (#777) :
   - le libellé imprimé (`labelImpressionLecon`, critère 19) ;
   - la consigne de fiche des leçons « clique sur le mot » (critères 5 et 19) ;
   - le repli d'une manche « relier » hors de son widget (critères 2 et 20) ;
   - le corrigé imprimé de « Décomposer pour calculer une multiplication » (critère 22) ;
   - la plage CM1 de « Je décompose » (critère 26) ;
   - le repli de « Repère le groupe nominal » quand la phrase a deux groupes (critère 27).
   ------------------------------------------------------------
   Sections 1 à 4 et 6 : écrites APRÈS l'implémentation de la tranche 1, par un auteur
   distinct de celui du code ; vertes à l'arrivée. Section 5 (formes décidées le 22/10/2026)
   et sections 7-8 (critères 26 et 27, ajoutés le même jour) : écrites AVANT leur
   implémentation, donc rouges à l'arrivée sauf non-régressions.
   Les attendus viennent des critères de l'issue ou de premiers principes (l'arithmétique
   d'une décomposition, la résolution de niveau déjà spécifiée par #225/#436), jamais des
   chaînes ou des formules du code. Chaque contrôle a son TÉMOIN : le même contrôle, joué
   sur une donnée fabriquée ou sur un « mutant » écrit ici (une variante fautive plausible
   du code), doit rougir. Aucune mutation de `src/`.

   Ce que ce fichier ne refait pas :
   - impression-gate.test.ts : le texte imprimé de tout le catalogue aux niveaux SERVIS
     (gestes, marqueurs, zone de réponse, corrigé fidèle) ;
   - appariement-repli.test.ts : répondabilité du repli, et cohérence entre le mot
     interrogé et la réponse corrigée ;
   - bilan-enonces.test.ts : critères 2 et 3 (forme du repli à étiquettes, libellés
     « jusqu'à 10 000 » au CM1).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	genLessonItem,
	getAllLessons,
	getLessonById,
	isPairingLesson,
	itemDepuisExercice,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { effectiveLevel, labelImpressionLecon, labelLecon, LEVEL_ORDER } from '../src/core/levels';
import { buildLessonFiche } from '../src/core/build';
import { buildPrintableDOM } from '../src/core/lessons';
import { checkItemAnswer, createRenderContext, type Item } from '../src/core/items';
import { choice, normalizeText, withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';
import { etayagePour } from '../src/core/etayage';
import { deroulePosition } from '../src/core/etayage-position';
import { FAMILLES, type ItemFamille } from '../src/data/francais/familles';
import { PHRASES_GN } from '../src/data/francais/grammaire-groupe-nominal';
import { premierGeste } from './gardes-gestes';

type Manche = Extract<Exercise, { type: 'appariement' }>;

/* ---------- Détecteurs ----------
   Les gestes d'écran (critère 19, plus « relier ») : détecteur partagé avec
   impression-gate, `tests/gardes-gestes.ts`, éprouvé dans `gardes-gestes.test.ts`. */

/** Tâche d'écriture : recopier, écrire. */
const TACHE_ECRITE = /(?<!\p{L})(?:(?:re)?copi(?:e|es|ez|er)|écri(?:s|re|vez|t))(?!\p{L})/iu;

/** Texte lisible du premier élément de classe `classe` d'un balisage, espaces réduites. */
function lire(balisage: string, classe: string): string {
	const racine = document.createElement('div');
	racine.innerHTML = balisage;
	return (racine.querySelector(`.${classe}`)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Tous les textes lisibles des éléments de classe `classe`, dans l'ordre du document. */
function lireTous(balisage: string, classe: string): string[] {
	const racine = document.createElement('div');
	racine.innerHTML = balisage;
	return [...racine.querySelectorAll(`.${classe}`)].map((e) =>
		(e.textContent ?? '').replace(/\s+/g, ' ').trim(),
	);
}

const NIVEAUX_ET_SANS: (SchoolLevel | undefined)[] = [...LEVEL_ORDER, undefined];
const nomNiveau = (n: SchoolLevel | undefined): string => n ?? 'sans niveau';

/* ============================================================
   1. `labelImpressionLecon` : la résolution.
   ------------------------------------------------------------
   Exigence (critère 19, et l'ordre donné par la tranche) : libellé imprimé DU NIVEAU, sinon
   libellé imprimé générique, sinon libellé d'ÉCRAN du niveau. Le niveau est d'abord résolu
   comme pour la génération (#225 : repli vers le bas, clamp vers le haut), sinon le titre
   et les questions parleraient de deux classes. Chaque emplacement porte une valeur
   DISTINCTE, pour qu'un résultat dise lequel a été lu.
   ============================================================ */
type ChampsLibelle = Partial<
	Pick<LessonDef, 'labelNiveau' | 'labelImpression' | 'labelImpressionNiveau'>
>;

function leconTest(levels: SchoolLevel[], champs: ChampsLibelle = {}): LessonDef {
	return {
		id: 'test-impression',
		label: 'É-neutre',
		subject: 'francais',
		category: 'test',
		levels,
		exerciseType: {
			generate: (): Exercise => ({ type: 'text', question: '@', answer: 'x' }),
			check: () => false,
		},
		...champs,
	};
}

const COMPLETE = leconTest(['ce2', 'cm1'], {
	labelNiveau: { ce2: 'É-ce2', cm1: 'É-cm1' },
	labelImpression: 'P-générique',
	labelImpressionNiveau: { cm1: 'P-cm1' },
});
const ECRAN_PAR_NIVEAU = leconTest(['ce2', 'cm1'], { labelNiveau: { ce2: 'É-ce2', cm1: 'É-cm1' } });
const IMPRIME_CM1_SEUL = leconTest(['ce2', 'cm1'], { labelImpressionNiveau: { cm1: 'P-cm1' } });
const LECON_CM1 = leconTest(['cm1'], {
	labelImpression: 'P-générique',
	labelImpressionNiveau: { cm1: 'P-cm1' },
});
const SANS_RIEN = leconTest(['ce2']);

interface Cas {
	lecon: LessonDef;
	nom: string;
	niveau?: SchoolLevel;
	attendu: string;
}
const CAS: Cas[] = [
	// Le libellé imprimé du niveau l'emporte.
	{ lecon: COMPLETE, nom: 'complète', niveau: 'cm1', attendu: 'P-cm1' },
	// Niveau sans libellé imprimé propre : le générique, PAS le libellé d'écran du niveau
	// (qui peut décrire un geste).
	{ lecon: COMPLETE, nom: 'complète', niveau: 'ce2', attendu: 'P-générique' },
	// Niveau non servi : même résolution que la génération (CM2 → CM1 ; CP → CE2).
	{ lecon: COMPLETE, nom: 'complète', niveau: 'cm2', attendu: 'P-cm1' },
	{ lecon: COMPLETE, nom: 'complète', niveau: 'cp', attendu: 'P-générique' },
	{ lecon: COMPLETE, nom: 'complète', attendu: 'P-générique' },
	// Aucun libellé imprimé : le libellé d'écran DU NIVEAU, pas le neutre.
	{ lecon: ECRAN_PAR_NIVEAU, nom: 'écran par niveau', niveau: 'cm1', attendu: 'É-cm1' },
	{ lecon: ECRAN_PAR_NIVEAU, nom: 'écran par niveau', niveau: 'cm2', attendu: 'É-cm1' },
	{ lecon: ECRAN_PAR_NIVEAU, nom: 'écran par niveau', attendu: 'É-neutre' },
	// Libellé imprimé déclaré pour un seul niveau, sans générique.
	{ lecon: IMPRIME_CM1_SEUL, nom: 'imprimé CM1 seul', niveau: 'cm1', attendu: 'P-cm1' },
	{ lecon: IMPRIME_CM1_SEUL, nom: 'imprimé CM1 seul', niveau: 'ce2', attendu: 'É-neutre' },
	// Leçon CM1 imprimée pour un profil CE2 (#234) : on imprime au niveau réellement tiré.
	{ lecon: LECON_CM1, nom: 'leçon CM1', niveau: 'ce2', attendu: 'P-cm1' },
	{ lecon: SANS_RIEN, nom: 'sans rien', niveau: 'cm1', attendu: 'É-neutre' },
];

type Resolveur = (l: LessonDef, n?: SchoolLevel) => string;

const ecartsResolution = (r: Resolveur): string[] =>
	CAS.filter((c) => r(c.lecon, c.niveau) !== c.attendu).map(
		(c) =>
			`${c.nom} @${nomNiveau(c.niveau)} : « ${r(c.lecon, c.niveau)} » au lieu de « ${c.attendu} »`,
	);

const parNiveau = (l: LessonDef, n?: SchoolLevel): string | undefined =>
	n === undefined ? undefined : l.labelImpressionNiveau?.[effectiveLevel(l, n)];

/* Variantes fautives plausibles : chacune doit être prise en défaut par la table. */
const MUTANTS_RESOLUTION: Record<string, Resolveur> = {
	'ignore le libellé imprimé par niveau': (l, n) => l.labelImpression ?? labelLecon(l, n),
	'lit le niveau demandé sans le résoudre': (l, n) =>
		(n === undefined ? undefined : l.labelImpressionNiveau?.[n]) ??
		l.labelImpression ??
		labelLecon(l, n),
	"préfère l'écran du niveau au générique imprimé": (l, n) =>
		parNiveau(l, n) ??
		(n !== undefined && l.labelNiveau ? l.labelNiveau[effectiveLevel(l, n)] : undefined) ??
		l.labelImpression ??
		l.label,
	"retombe sur le neutre au lieu de l'écran du niveau": (l, n) =>
		parNiveau(l, n) ?? l.labelImpression ?? l.label,
};

describe('labelImpressionLecon — résolution (#777, critère 19)', () => {
	it('imprimé du niveau, sinon imprimé générique, sinon écran du niveau ; niveau résolu comme la génération', () => {
		expect(ecartsResolution(labelImpressionLecon)).toEqual([]);
	});

	it('témoins : chaque variante fautive de la résolution est prise en défaut par la table', () => {
		for (const [nom, mutant] of Object.entries(MUTANTS_RESOLUTION)) {
			expect(ecartsResolution(mutant).length, nom).toBeGreaterThan(0);
		}
	});

	it('NON-RÉGRESSION : une leçon sans libellé imprimé imprime son libellé d’écran, à tout niveau', () => {
		const ecarts = (r: Resolveur): string[] => {
			const out: string[] = [];
			for (const l of getAllLessons()) {
				if (l.labelImpression !== undefined || l.labelImpressionNiveau !== undefined) continue;
				for (const n of NIVEAUX_ET_SANS) {
					if (r(l, n) !== labelLecon(l, n)) out.push(`${l.id}@${nomNiveau(n)}`);
				}
			}
			return out;
		};
		const sansImprime = getAllLessons().filter(
			(l) => l.labelImpression === undefined && l.labelImpressionNiveau === undefined,
		);
		expect(sansImprime.length, 'inventaire effondré : le contrôle ne regarde rien').toBeGreaterThan(
			100,
		);
		expect(ecarts(labelImpressionLecon)).toEqual([]);
		// Témoin : le catalogue contient des leçons nommées par niveau SANS libellé imprimé
		// (« jusqu'à 10 000 » au CE2 seulement) ; retomber sur le neutre y serait vu.
		expect(
			ecarts(MUTANTS_RESOLUTION["retombe sur le neutre au lieu de l'écran du niveau"]),
		).not.toEqual([]);
	});
});

/* ============================================================
   2. Les libellés imprimés du catalogue.
   ============================================================ */

/** Libellés imprimés qui demandent un geste d'écran, pour TOUTES les classes de l'échelle
    et sans niveau : un encadrant imprime au niveau du profil consulté (#234), qui peut ne
    pas être servi par la leçon. */
function gestesImprimes(r: Resolveur): { id: string; texte: string }[] {
	const out: { id: string; texte: string }[] = [];
	for (const l of getAllLessons()) {
		for (const n of NIVEAUX_ET_SANS) {
			const titre = r(l, n);
			const geste = premierGeste(titre);
			if (geste) out.push({ id: l.id, texte: `${l.id}@${nomNiveau(n)} : « ${titre} » (${geste})` });
		}
	}
	return out;
}

/** Une leçon que l'écran nomme différemment selon la classe doit l'être aussi sur papier :
    sinon le titre imprimé d'un niveau parle le vocabulaire de l'autre (#436). */
function niveauxConfondusAuPapier(l: LessonDef): string[] {
	const out: string[] = [];
	for (let i = 0; i < l.levels.length; i++) {
		for (let j = i + 1; j < l.levels.length; j++) {
			const [a, b] = [l.levels[i], l.levels[j]];
			if (labelLecon(l, a) === labelLecon(l, b)) continue;
			if (labelImpressionLecon(l, a) === labelImpressionLecon(l, b)) {
				out.push(
					`${l.id} : « ${labelLecon(l, a)} » / « ${labelLecon(l, b)} » à l'écran, « ${labelImpressionLecon(l, a)} » imprimé aux deux`,
				);
			}
		}
	}
	return out;
}

const PORTEURS_IMPRIME = getAllLessons().filter(
	(l) => l.labelImpression !== undefined || l.labelImpressionNiveau !== undefined,
);

describe('Libellés imprimés du catalogue (#777, critère 19)', () => {
	it('aucun libellé imprimé ne demande un geste d’écran, à aucune classe ni sans niveau', () => {
		expect(gestesImprimes(labelImpressionLecon).map((g) => g.texte)).toEqual([]);
	});

	it('témoin : le titre imprimé d’avant #777 (le libellé d’écran) aurait été signalé', () => {
		// Le détecteur lui-même est éprouvé dans gardes-gestes.test.ts.
		const avant = new Set(gestesImprimes(labelLecon).map((g) => g.id));
		expect([...avant]).toEqual(
			expect.arrayContaining(['fr-gram-clic-verbe', 'fr-vocab-familles-relier']),
		);
	});

	it('un libellé imprimé n’est jamais vide, et `labelImpressionNiveau` ne vise que des niveaux servis', () => {
		expect(PORTEURS_IMPRIME.length, 'aucun porteur : le contrôle ne regarde rien').toBeGreaterThan(
			0,
		);
		for (const l of PORTEURS_IMPRIME) {
			if (l.labelImpression !== undefined) expect(l.labelImpression.trim(), l.id).not.toBe('');
			for (const [lvl, texte] of Object.entries(l.labelImpressionNiveau ?? {})) {
				expect(l.levels, `${l.id} : ${lvl} non servi`).toContain(lvl);
				expect((texte ?? '').trim(), `${l.id}@${lvl}`).not.toBe('');
			}
		}
	});

	it('une leçon nommée par niveau à l’écran l’est aussi sur papier (#436)', () => {
		const multi = getAllLessons().filter((l) =>
			l.levels.some((a) => l.levels.some((b) => labelLecon(l, a) !== labelLecon(l, b))),
		);
		expect(multi.length, 'aucune leçon nommée par niveau : contrôle vide').toBeGreaterThanOrEqual(
			2,
		);
		expect(getAllLessons().flatMap(niveauxConfondusAuPapier)).toEqual([]);
	});

	it('témoins : un libellé imprimé générique sur une leçon nommée par niveau est signalé', () => {
		const ecran = { ce2: 'Clique sur le nom', cm1: 'Clique sur le nom noyau' };
		const generique = leconTest(['ce2', 'cm1'], {
			labelNiveau: ecran,
			labelImpression: 'Trouve le nom',
		});
		expect(niveauxConfondusAuPapier(generique)).not.toEqual([]);
		const decline = leconTest(['ce2', 'cm1'], {
			labelNiveau: ecran,
			labelImpression: 'Trouve le nom',
			labelImpressionNiveau: { ce2: 'Trouve le nom', cm1: 'Trouve le nom noyau' },
		});
		expect(niveauxConfondusAuPapier(decline)).toEqual([]);
	});
});

/* ============================================================
   3. Les chemins d'impression lisent le libellé imprimé, au niveau imprimé.
   ============================================================ */
function titresImprimes(id: string, niveau: SchoolLevel): { fiche: string; bloc: string } {
	const fiche = buildPrintableDOM({ title: 'T', lessonIds: [id], kind: 'fiches', level: niveau });
	const bilan = buildPrintableDOM({
		title: 'T',
		lessonIds: [id],
		kind: 'bilan',
		nbQ: 1,
		level: niveau,
	});
	return { fiche: lire(fiche.balisage, 'fiche-title'), bloc: lire(bilan.balisage, 'btheme') };
}

/* Vocabulaire propre à une classe (programme) : le titre imprimé du CM1 le porte, celui
   du CE2 jamais. */
const VOCABULAIRE_CM1: Record<string, RegExp> = {
	'fr-gram-clic-noyau': /noyau/iu,
	'fr-gram-clic-adj': /épithète|attribut/iu,
};

describe('Fiche et bilan imprimés : titre sans geste, dans la langue du niveau', () => {
	it('le titre de fiche et le titre de bloc de bilan sont le libellé imprimé du niveau, sans geste', () => {
		const ecarts: string[] = [];
		for (const l of PORTEURS_IMPRIME) {
			for (const n of l.levels) {
				const attendu = labelImpressionLecon(l, n);
				for (const [quoi, titre] of Object.entries(titresImprimes(l.id, n))) {
					if (titre !== attendu)
						ecarts.push(`${l.id}@${n} ${quoi} : « ${titre} » ≠ « ${attendu} »`);
					if (premierGeste(titre) !== null)
						ecarts.push(`${l.id}@${n} ${quoi} : geste dans « ${titre} »`);
				}
			}
		}
		expect(ecarts).toEqual([]);
	});

	it('au CM1 le titre imprimé garde le vocabulaire du CM1 ; au CE2, il ne l’a pas', () => {
		for (const [id, motif] of Object.entries(VOCABULAIRE_CM1)) {
			const cm1 = titresImprimes(id, 'cm1');
			const ce2 = titresImprimes(id, 'ce2');
			for (const [quoi, titre] of Object.entries(cm1))
				expect(titre, `${id}@cm1 ${quoi}`).toMatch(motif);
			for (const [quoi, titre] of Object.entries(ce2)) {
				expect(titre, `${id}@ce2 ${quoi}`).not.toMatch(motif);
			}
		}
	});

	it('témoins : le titre d’écran ou le générique imprimé, à la place, feraient rougir ces contrôles', () => {
		for (const l of PORTEURS_IMPRIME) {
			for (const n of l.levels) {
				// Le titre d'écran d'un porteur diffère de son titre imprimé (sinon il n'aurait
				// pas eu besoin d'en déclarer un) : l'égalité ci-dessus le verrait.
				expect(labelLecon(l, n), `${l.id}@${n}`).not.toBe(labelImpressionLecon(l, n));
			}
		}
		// Le générique imprimé, servi au CM1, perdrait le vocabulaire du CM1.
		for (const [id, motif] of Object.entries(VOCABULAIRE_CM1)) {
			expect(getLessonById(id)!.labelImpression, id).not.toMatch(motif);
		}
	});
});

/* ============================================================
   4. Consignes des leçons « clique sur le mot » : une par support.
   ------------------------------------------------------------
   Critère 5 : la consigne est vraie sur le support où elle s'affiche. Hors du runner (fiche
   à l'écran ou imprimée, bilan), la phrase est repliée en une question où l'on RECOPIE : la
   consigne de fiche n'y demande aucun geste, et nomme la tâche écrite et ce qu'il faut
   trouver. Dans le runner, on touche des mots : la consigne de l'exercice dit le geste, et
   jamais d'écrire.
   ============================================================ */

/* Ce que chaque leçon fait trouver, dérivé de la NOTION de la leçon (son titre), pas des
   consignes. Une leçon « clique sur le mot » ajoutée sans entrée fait échouer l'inventaire :
   il faut dire ce que sa consigne doit nommer. */
const NOTION: Record<string, RegExp> = {
	'fr-gram-clic-verbe': /verbe/iu,
	'fr-gram-clic-det': /déterminant/iu,
	'fr-gram-clic-adj': /adjectif/iu,
	'fr-gram-clic-conj': /conjonction/iu,
	'fr-gram-clic-pron': /pronom/iu,
	'fr-gram-clic-noyau': /(?<!\p{L})noms?(?!\p{L})/iu,
	'fr-gram-groupe-nominal': /groupe nominal/iu,
	'fr-gram-clic-sujet': /sujet/iu,
};

/** Les leçons dont l'exercice généré est un « clique sur le mot », à au moins un niveau. */
const LECONS_CLIC_MOT = getAllLessons().filter((l) =>
	l.levels.some((n) => withSeed(1, () => l.exerciseType.generate({ level: n })).type === 'clicMot'),
);

function fauteConsigneEcrite(consigne: string, notion: RegExp): string | null {
	const geste = premierGeste(consigne);
	if (geste) return `demande un geste d'écran (« ${geste} ») : « ${consigne} »`;
	if (!TACHE_ECRITE.test(consigne)) return `ne nomme pas la tâche écrite : « ${consigne} »`;
	if (!notion.test(consigne))
		return `ne nomme pas ce qu'il faut trouver (${notion}) : « ${consigne} »`;
	return null;
}

function fauteConsigneGeste(consigne: string): string | null {
	const ecrire = TACHE_ECRITE.exec(consigne);
	if (ecrire) return `demande d'écrire (« ${ecrire[0]} ») au toucher : « ${consigne} »`;
	if (premierGeste(consigne) === null) return `ne dit pas le geste : « ${consigne} »`;
	return null;
}

/** Consigne de fiche telle que la fiche l'affiche, à l'écran et sur papier. */
const consignesFiche = (id: string, n: SchoolLevel): string[] =>
	[false, true].map((printMode) =>
		lire(buildLessonFiche(id, n, createRenderContext({ printMode })).balisage, 'consigne-line'),
	);

/** Consignes du runner : celle que porte chaque exercice généré (elle varie d'une phrase
    à l'autre au CM1 : « l'article », « le déterminant possessif »…). */
function consignesRunner(l: LessonDef, n: SchoolLevel): string[] {
	const vues = new Set<string>();
	for (let seed = 1; seed <= 60; seed++) {
		const ex = withSeed(seed, () => l.exerciseType.generate({ level: n }));
		if (ex.type === 'clicMot') vues.add(ex.consigne);
	}
	return [...vues];
}

describe('« Clique sur le mot » : consigne de fiche écrite, consigne de runner gestuelle (#777, critères 5 et 19)', () => {
	it('inventaire : toutes les leçons « clique sur le mot » du catalogue ont leur notion déclarée', () => {
		expect(LECONS_CLIC_MOT.length, 'inventaire effondré').toBeGreaterThanOrEqual(8);
		expect(LECONS_CLIC_MOT.map((l) => l.id).sort()).toEqual(Object.keys(NOTION).sort());
	});

	it('à chaque niveau, la consigne de fiche ne demande aucun geste et nomme la recopie et la notion', () => {
		const fautes: string[] = [];
		for (const l of LECONS_CLIC_MOT) {
			for (const n of l.levels) {
				for (const c of consignesFiche(l.id, n)) {
					const f = fauteConsigneEcrite(c, NOTION[l.id]);
					if (f) fautes.push(`${l.id}@${n} : ${f}`);
				}
			}
		}
		expect(fautes).toEqual([]);
	});

	it('NON-RÉGRESSION : le runner garde une consigne de geste, jamais « recopie » ni « écris »', () => {
		const fautes: string[] = [];
		for (const l of LECONS_CLIC_MOT) {
			for (const n of l.levels) {
				const consignes = consignesRunner(l, n);
				if (consignes.length === 0) fautes.push(`${l.id}@${n} : aucun exercice « clique » généré`);
				for (const c of consignes) {
					const f = fauteConsigneGeste(c);
					if (f) fautes.push(`${l.id}@${n} : ${f}`);
				}
			}
		}
		expect(fautes).toEqual([]);
	});

	it('témoins : chaque consigne, servie sur l’autre support, serait signalée', () => {
		for (const l of LECONS_CLIC_MOT) {
			for (const n of l.levels) {
				// La consigne du runner sur la fiche : l'état d'avant #777.
				for (const c of consignesRunner(l, n)) {
					expect(fauteConsigneEcrite(c, NOTION[l.id]), `${l.id}@${n} « ${c} »`).not.toBeNull();
				}
				// La consigne de fiche dans le runner.
				for (const c of consignesFiche(l.id, n)) {
					expect(fauteConsigneGeste(c), `${l.id}@${n} « ${c} »`).not.toBeNull();
				}
			}
			// Une consigne de recopie qui ne nomme pas la notion est signalée.
			expect(fauteConsigneEcrite('Recopie le mot demandé.', NOTION[l.id]), l.id).not.toBeNull();
		}
	});
});

/* ============================================================
   5. Repli d'une manche « relier » hors de son widget (#777, critères 2 et 20).
   ------------------------------------------------------------
   - DÉTERMINISTE : la séance partagée fige les manches dans le lien et rejoue le repli chez
     l'enfant ; la feuille et son corrigé doivent poser la même question. Le repli ne dépend
     donc que de la manche : ni de l'aléa courant, ni de l'identité de l'objet, et il ne
     modifie pas la manche.
   - VARIÉ : « Nomme les mots du groupe » interrogeait toujours le premier mot du groupe,
     c'est-à-dire le déterminant (#777, constat du 22/10). Sur un échantillon de manches, la
     question ne porte pas toujours sur le premier mot, et chaque étiquette finit par être
     demandée.
   - Décisions du 22/10/2026 (avis pedagogue-primaire, feu vert du mainteneur, commentaire
     daté sur #777) qui remplacent « choix = la colonne de droite du widget » :
     · À ÉTIQUETTES (critère 2) : toujours les trois étiquettes « déterminant », « nom »,
       « adjectif », dans CET ordre, même quand la manche n'en a que deux ; la question
       demande la NATURE du mot désigné, en citant le groupe entier et le mot.
     · À MOTS (critère 20) : 4 choix distincts, la réponse et 3 distracteurs, dont au moins
       un faux-ami (un intrus de la manche), aucun de la même famille que le mot demandé,
       tirés de façon déterministe : la feuille et son corrigé impriment les mêmes choix.
       En plus, deux invariants QCM maison : chaque distracteur est un vrai mot de la
       banque (jamais une forme inventée), et la bonne réponse ne tient pas toujours la
       même place.
   ============================================================ */
const LECONS_RELIER = getAllLessons().filter(isPairingLesson);
const GRAINES_RELIER = Array.from({ length: 200 }, (_, k) => k + 1);

function manchesDe(l: LessonDef): Manche[] {
	return GRAINES_RELIER.map((seed) => {
		const ex = withSeed(seed, () => l.exerciseType.generate({ level: l.levels[0] }));
		if (ex.type !== 'appariement') throw new Error(`${l.id} : format « ${ex.type} »`);
		return ex;
	});
}

/** La manche telle qu'un lien partagé la restitue (sérialisée, sans `undefined`). */
const commeDansLeLien = (ex: Manche): Manche => JSON.parse(JSON.stringify(ex));

/** Le mot de la manche que la question désigne : celui cité SEUL entre « ». `null` si la
    question n'en désigne aucun, ou plusieurs. */
function motDesigne(texte: string, ex: Manche): string | null {
	const cites = [...texte.matchAll(/«\s*([^«»]+?)\s*»/gu)].map((m) => m[1].toLocaleLowerCase('fr'));
	const mots = new Set(
		ex.paires.map((p) => p.gauche.toLocaleLowerCase('fr')).filter((g) => cites.includes(g)),
	);
	return mots.size === 1 ? [...mots][0] : null;
}

interface Observation {
	ex: Manche;
	texte: string;
	designe: string;
	reponse: string;
	choix: string[];
}

function observer(l: LessonDef): Observation[] {
	return manchesDe(l).map((ex) => {
		const item = itemDepuisExercice(l, ex);
		const designe = motDesigne(item.text, ex);
		if (designe === null) throw new Error(`${l.id} : « ${item.text} » ne désigne pas un mot`);
		const reponse = String(item.answer);
		return { ex, texte: item.text, designe, reponse, choix: item.choices ?? [] };
	});
}

function ecartsDeterminisme(repli: (ex: Manche) => Item, manches: Manche[]): string[] {
	const out: string[] = [];
	for (const ex of manches) {
		const avant = JSON.stringify(ex);
		const a = JSON.stringify(withSeed(11, () => repli(ex)));
		const b = JSON.stringify(withSeed(977, () => repli(commeDansLeLien(ex))));
		if (a !== b) out.push(`même manche, deux replis : ${a} / ${b}`);
		if (JSON.stringify(ex) !== avant) out.push(`la manche a été modifiée par le repli : ${avant}`);
	}
	return out;
}

const premierMot = (o: Observation): string => o.ex.paires[0].gauche.toLocaleLowerCase('fr');

function fautesVariete(obs: Observation[], etiquettes: boolean): string[] {
	const f: string[] = [];
	if (obs.every((o) => o.designe === premierMot(o))) {
		f.push('la question porte toujours sur le premier mot de la manche');
	}
	// Ordre fixe à étiquettes (décision) : la place de la réponse n'y dit rien.
	if (!etiquettes && new Set(obs.map((o) => o.choix.indexOf(o.reponse))).size < 2) {
		f.push('la bonne réponse occupe toujours la même place parmi les choix');
	}
	if (etiquettes) {
		const demandees = new Set(obs.map((o) => o.reponse));
		const jamais = [...new Set(obs.flatMap((o) => o.ex.paires.map((p) => p.droite)))].filter(
			(e) => !demandees.has(e),
		);
		if (jamais.length > 0) f.push(`étiquette(s) jamais demandée(s) : ${jamais.join(', ')}`);
	}
	return f;
}

/* ---------- À étiquettes (critère 2, décision du 22/10/2026) ---------- */

/** Les étiquettes proposées, toutes et dans cet ordre, quelle que soit la manche. */
const ETIQUETTES_GN = ['déterminant', 'nom', 'adjectif'];

const citationsDe = (texte: string): string[] =>
	[...texte.matchAll(/«\s*([^«»]+?)\s*»/gu)].map((m) => m[1].replace(/\s+/g, ' '));

/** Le texte sans ses citations « … » (imbriquées comprises) : ce qui reste est la consigne. */
function sansCitations(texte: string): string {
	let avant = '';
	let apres = texte;
	while (avant !== apres) {
		avant = apres;
		apres = apres.replace(/«[^«»]*»/gu, ' ');
	}
	return apres;
}

function fauteChoixEtiquettes(choix: string[]): string | null {
	return JSON.stringify(choix) === JSON.stringify(ETIQUETTES_GN)
		? null
		: `choix ${JSON.stringify(choix)} au lieu de ${JSON.stringify(ETIQUETTES_GN)}`;
}

/** La question demande la NATURE d'un mot, cite le groupe entier et le mot désigné. Ce
    qu'elle dit mot pour mot n'est pas figé. */
function fauteQuestionEtiquettes(texte: string, ex: Manche): string | null {
	const cles = citationsDe(texte).map((c) => c.toLocaleLowerCase('fr'));
	const groupe = ex.paires
		.map((p) => p.gauche)
		.join(' ')
		.toLocaleLowerCase('fr');
	if (!/(?<!\p{L})nature(?!\p{L})/iu.test(sansCitations(texte))) {
		return `ne demande pas la nature : « ${texte} »`;
	}
	if (!cles.includes(groupe)) return `ne cite pas le groupe « ${groupe} » : « ${texte} »`;
	if (motDesigne(texte, ex) === null) return `ne cite pas UN mot du groupe : « ${texte} »`;
	return null;
}

/* ---------- À mots (critère 20, décision du 22/10/2026) ---------- */

/** Pour chaque mot de la banque, les mots de SA famille : composantes du graphe des liens
    « mot → dérivé » de la banque (deux entrées qui partagent un mot sont une même famille).
    Le faux-ami et le mot sans rapport n'y entrent pas : ils sont, par définition, d'une
    autre famille.
    Limite mesurée le 22/10/2026 : dans `FAMILLES`, aucune famille ne compte plus de deux
    mots (aucun mot partagé entre deux entrées). Sur la banque réelle, ce contrôle ne peut
    donc signaler qu'une famille connue de la banque ; il ne sait rien d'une parenté que la
    banque ne note pas (« mer » / « marée »). Son témoin est joué sur une banque fabriquée. */
function famillesDeLaBanque(banque: readonly ItemFamille[]): Map<string, Set<string>> {
	const voisins = new Map<string, Set<string>>();
	const lier = (a: string, b: string): void => {
		for (const [x, y] of [
			[a, b],
			[b, a],
		]) {
			const v = voisins.get(x) ?? new Set<string>();
			v.add(y);
			voisins.set(x, v);
		}
	};
	for (const f of banque) lier(f.mot.toLocaleLowerCase('fr'), f.famille.toLocaleLowerCase('fr'));
	const membres = new Map<string, Set<string>>();
	for (const depart of voisins.keys()) {
		if (membres.has(depart)) continue;
		const groupe = new Set<string>([depart]);
		const file = [depart];
		while (file.length > 0) {
			for (const v of voisins.get(file.pop()!) ?? []) {
				if (!groupe.has(v)) {
					groupe.add(v);
					file.push(v);
				}
			}
		}
		for (const m of groupe) membres.set(m, groupe);
	}
	return membres;
}

const motsDeLaBanque = (banque: readonly ItemFamille[]): Set<string> =>
	new Set(
		banque.flatMap((f) =>
			[f.mot, f.famille, f.fauxAmi, f.autre].map((m) => m.toLocaleLowerCase('fr')),
		),
	);

interface BanqueFamilles {
	familles: Map<string, Set<string>>;
	mots: Set<string>;
}

const BANQUE_FAMILLES: BanqueFamilles = {
	familles: famillesDeLaBanque(FAMILLES),
	mots: motsDeLaBanque(FAMILLES),
};

/** Défauts des choix d'un repli « relier » à mots, pour le mot demandé `mot`. */
function fautesChoixFamille(o: Observation, banque: BanqueFamilles): string[] {
	const { choix, reponse, ex } = o;
	const mot = o.designe;
	const f: string[] = [];
	const cles = choix.map((c) => normalizeText(c).toLocaleLowerCase('fr'));
	if (choix.length !== 4) f.push(`${choix.length} choix au lieu de 4 : ${JSON.stringify(choix)}`);
	if (new Set(cles).size !== cles.length) f.push(`choix en double : ${JSON.stringify(choix)}`);
	if (!choix.includes(reponse)) f.push(`« ${reponse} » absente de ${JSON.stringify(choix)}`);
	const distracteurs = choix.filter((c) => c !== reponse);
	const intrus = new Set(ex.intrus ?? []);
	if (!distracteurs.some((d) => intrus.has(d))) {
		f.push(
			`aucun faux-ami de la manche (${[...intrus].join(', ')}) parmi ${JSON.stringify(choix)}`,
		);
	}
	const famille = banque.familles.get(mot) ?? new Set([mot]);
	const parents = distracteurs.filter((d) => famille.has(d.toLocaleLowerCase('fr')));
	if (parents.length > 0) f.push(`« ${parents.join(', ')} » est de la famille de « ${mot} »`);
	const inventes = distracteurs.filter((d) => !banque.mots.has(d.toLocaleLowerCase('fr')));
	if (inventes.length > 0) f.push(`« ${inventes.join(', ')} » n'est pas un mot de la banque`);
	return f;
}

/** Les listes de choix imprimées (une par question à choix), feuille puis corrigé, d'un
    bilan imprimé AVEC corrigé : `buildPrintableDOM` rend les deux sous une même graine. */
function choixImprimes(l: LessonDef, seed: number): { feuille: string[][]; corrige: string[][] } {
	const doc = withSeed(seed, () =>
		buildPrintableDOM({
			title: 'T',
			lessonIds: [l.id],
			kind: 'bilan',
			nbQ: 3,
			corrige: true,
			level: l.levels[0],
		}),
	);
	const racine = document.createElement('div');
	racine.innerHTML = doc.balisage;
	const listes = [...racine.querySelectorAll('.qcm-print-choices')].map((ul) =>
		[...ul.querySelectorAll('.qcm-print-label')].map((e) =>
			(e.textContent ?? '').replace(/\s+/g, ' ').trim(),
		),
	);
	const moitie = listes.length / 2;
	return { feuille: listes.slice(0, moitie), corrige: listes.slice(moitie) };
}

function ecartsFeuilleCorrige(feuille: string[][], corrige: string[][]): string[] {
	if (feuille.length !== corrige.length) {
		return [`${feuille.length} question(s) à choix sur la feuille, ${corrige.length} au corrigé`];
	}
	return feuille
		.map((c, i) =>
			JSON.stringify(c) === JSON.stringify(corrige[i])
				? null
				: `question ${i + 1} : ${JSON.stringify(c)} / ${JSON.stringify(corrige[i])}`,
		)
		.filter((e): e is string => e !== null);
}

/** Un mot répété dans le groupe serait désigné deux fois par « « le » est… ». */
function fauteMotRepete(texte: string, ex: Manche): string | null {
	const designe = motDesigne(texte, ex);
	if (designe === null) return `« ${texte} » ne désigne aucun mot`;
	const n = ex.paires.filter((p) => p.gauche.toLocaleLowerCase('fr') === designe).length;
	return n > 1 ? `« ${texte} » désigne « ${designe} », présent ${n} fois dans le groupe` : null;
}

const estEtiquettes = (l: LessonDef): boolean =>
	manchesDe(l).some((ex) => ex.colonneDroite === 'etiquettes');

describe('Repli d’une manche « relier » (#777, critères 2 et 20)', () => {
	it('inventaire : des leçons « relier » à étiquettes ET à mots sont éprouvées', () => {
		expect(LECONS_RELIER.length).toBeGreaterThanOrEqual(2);
		expect(LECONS_RELIER.some(estEtiquettes), 'aucune leçon à étiquettes').toBe(true);
		expect(
			LECONS_RELIER.some((l) => !estEtiquettes(l)),
			'aucune leçon à mots',
		).toBe(true);
	});

	it('DÉTERMINISTE : la même manche donne le même item, quel que soit l’aléa, et reste intacte', () => {
		for (const l of LECONS_RELIER) {
			expect(
				ecartsDeterminisme((ex) => itemDepuisExercice(l, ex), manchesDe(l)),
				l.id,
			).toEqual([]);
		}
	});

	it('témoins : un repli tiré au sort, ou qui trie la manche en place, est signalé', () => {
		const manches = manchesDe(LECONS_RELIER[0]).slice(0, 20);
		const tire = (ex: Manche): Item => {
			const p = choice(ex.paires);
			return { text: `« ${p.gauche} » @`, answer: p.droite, kind: 'text' };
		};
		expect(ecartsDeterminisme(tire, manches)).not.toEqual([]);
		const trieEnPlace = (ex: Manche): Item => {
			ex.paires.sort((a, b) => a.gauche.localeCompare(b.gauche, 'fr'));
			return { text: `« ${ex.paires[0].gauche} » @`, answer: ex.paires[0].droite, kind: 'text' };
		};
		expect(ecartsDeterminisme(trieEnPlace, manches.map(commeDansLeLien))).not.toEqual([]);
	});

	it('VARIÉTÉ : pas toujours le premier mot, toutes les étiquettes demandées ; à mots, réponse à place variable', () => {
		for (const l of LECONS_RELIER) {
			expect(fautesVariete(observer(l), estEtiquettes(l)), l.id).toEqual([]);
		}
	});

	it('témoins : le repli d’avant #777 (toujours la première paire), ou la réponse toujours en tête, est signalé', () => {
		for (const l of LECONS_RELIER) {
			const obs = observer(l);
			const premiere = obs.map((o) => ({
				...o,
				designe: premierMot(o),
				reponse: o.ex.paires[0].droite,
			}));
			expect(fautesVariete(premiere, estEtiquettes(l)).join(' | '), l.id).toMatch(/premier mot/);
			if (estEtiquettes(l)) {
				// Le groupe s'ouvre toujours sur le déterminant : rien d'autre n'était demandé.
				expect(fautesVariete(premiere, true).join(' | '), l.id).toMatch(/jamais demandée/);
			}
			if (!estEtiquettes(l)) {
				const enTete = obs.map((o) => ({
					...o,
					choix: [o.reponse, ...o.choix.filter((c) => c !== o.reponse)],
				}));
				expect(fautesVariete(enTete, false).join(' | '), l.id).toMatch(/même place/);
			}
		}
	});

	it('critère 2 : à étiquettes, toujours « déterminant », « nom », « adjectif », dans cet ordre', () => {
		const fautes: string[] = [];
		for (const l of LECONS_RELIER.filter(estEtiquettes)) {
			const o = observer(l).find((x) => fauteChoixEtiquettes(x.choix) !== null);
			if (o) fautes.push(`${l.id} « ${o.texte} » : ${fauteChoixEtiquettes(o.choix)}`);
		}
		expect(fautes).toEqual([]);
	});

	it('critère 2 : à étiquettes, la question demande la nature du mot, groupe entier et mot cités', () => {
		const fautes: string[] = [];
		for (const l of LECONS_RELIER.filter(estEtiquettes)) {
			const o = observer(l).find((x) => fauteQuestionEtiquettes(x.texte, x.ex) !== null);
			if (o) fautes.push(`${l.id} : ${fauteQuestionEtiquettes(o.texte, o.ex)}`);
		}
		expect(fautes).toEqual([]);
	});

	it('témoins (étiquettes) : ordre alphabétique, étiquette manquante, question sans nature ou sans groupe', () => {
		const ex: Manche = {
			type: 'appariement',
			question: '',
			colonneDroite: 'etiquettes',
			paires: [
				{ gauche: 'son', droite: 'déterminant' },
				{ gauche: 'vélo', droite: 'nom' },
			],
		};
		expect(fauteChoixEtiquettes(['déterminant', 'nom', 'adjectif'])).toBeNull();
		expect(fauteChoixEtiquettes(['adjectif', 'déterminant', 'nom'])).not.toBeNull();
		// Une manche sans adjectif : les deux étiquettes de la manche ne suffisent plus.
		expect(fauteChoixEtiquettes(['déterminant', 'nom'])).not.toBeNull();
		expect(
			fauteQuestionEtiquettes('Dans « son vélo », quelle est la nature du mot « son » ? @', ex),
		).toBeNull();
		// La forme livrée par la tranche 1 : ne demande pas la nature.
		expect(fauteQuestionEtiquettes('Dans « son vélo », « son » est… @', ex)).not.toBeNull();
		expect(fauteQuestionEtiquettes('Quelle est la nature du mot « son » ? @', ex)).not.toBeNull();
		expect(
			fauteQuestionEtiquettes('Dans « son vélo », quelle est la nature de ce mot ? @', ex),
		).not.toBeNull();
		// « nature » cité n'est pas la consigne.
		expect(
			fauteQuestionEtiquettes('Dans « son vélo », « son » est… « nature » @', ex),
		).not.toBeNull();
	});

	it('critère 20 : à mots, 4 choix distincts (réponse + 3), un faux-ami au moins, aucun de la même famille, des mots de la banque', () => {
		const fautes: string[] = [];
		for (const l of LECONS_RELIER.filter((x) => !estEtiquettes(x))) {
			const o = observer(l).find((x) => fautesChoixFamille(x, BANQUE_FAMILLES).length > 0);
			if (o) {
				fautes.push(
					`${l.id} « ${o.texte} » : ${fautesChoixFamille(o, BANQUE_FAMILLES).join(' ; ')}`,
				);
			}
		}
		expect(fautes).toEqual([]);
	});

	it('témoins (mots) : 6 choix, faux-ami absent, même famille, mot inventé, doublon à la casse près', () => {
		// Banque fabriquée : « dent » a DEUX dérivés, « dentelle » est son faux-ami.
		const banque: ItemFamille[] = [
			{ mot: 'dent', famille: 'dentiste', fauxAmi: 'dentelle', autre: 'chou', explication: '' },
			{ mot: 'dent', famille: 'dentier', fauxAmi: 'dentelle', autre: 'pré', explication: '' },
			{ mot: 'fleur', famille: 'fleuriste', fauxAmi: 'flûte', autre: 'mer', explication: '' },
		];
		const b: BanqueFamilles = {
			familles: famillesDeLaBanque(banque),
			mots: motsDeLaBanque(banque),
		};
		const ex: Manche = {
			type: 'appariement',
			question: '',
			paires: [
				{ gauche: 'dent', droite: 'dentiste' },
				{ gauche: 'fleur', droite: 'fleuriste' },
			],
			intrus: ['dentelle', 'flûte'],
		};
		const obs = (choix: string[]): Observation => ({
			ex,
			texte: '',
			designe: 'dent',
			reponse: 'dentiste',
			choix,
		});
		expect(fautesChoixFamille(obs(['chou', 'dentelle', 'dentiste', 'fleuriste']), b)).toEqual([]);
		for (const [cas, choix] of [
			['six choix', ['chou', 'dentelle', 'dentiste', 'fleuriste', 'flûte', 'pré']],
			['sans faux-ami', ['chou', 'dentiste', 'fleuriste', 'pré']],
			['même famille', ['dentelle', 'dentier', 'dentiste', 'fleuriste']],
			['mot inventé', ['chou', 'dentelle', 'dentiste', 'xylophonerie']],
			['doublon', ['Dentiste', 'dentelle', 'dentiste', 'fleuriste']],
			['sans la réponse', ['chou', 'dentelle', 'fleuriste', 'pré']],
		] as const) {
			expect(fautesChoixFamille(obs([...choix]), b), cas).not.toEqual([]);
		}
		// Une manche réelle telle que livrée par la tranche 1 (toute la colonne : 6 choix).
		const l = LECONS_RELIER.find((x) => !estEtiquettes(x))!;
		const reel = observer(l)[0];
		const colonne = [...reel.ex.paires.map((p) => p.droite), ...(reel.ex.intrus ?? [])];
		expect(fautesChoixFamille({ ...reel, choix: colonne }, BANQUE_FAMILLES)).not.toEqual([]);
	});

	it('critère 20 : à mots, la feuille et son corrigé imprimés proposent les mêmes 4 choix, dans le même ordre', () => {
		const l = LECONS_RELIER.find((x) => !estEtiquettes(x))!;
		const fautes: string[] = [];
		let questions = 0;
		for (let seed = 1; seed <= 10; seed++) {
			const { feuille, corrige } = choixImprimes(l, seed);
			questions += feuille.length;
			fautes.push(...ecartsFeuilleCorrige(feuille, corrige).map((e) => `graine ${seed} : ${e}`));
			const tailles = [...new Set(feuille.map((c) => c.length))].filter((n) => n !== 4);
			if (tailles.length > 0) fautes.push(`graine ${seed} : ${tailles.join(', ')} choix imprimés`);
		}
		expect(questions, 'aucune question à choix imprimée').toBeGreaterThan(0);
		expect(fautes).toEqual([]);
	});

	it('témoins : un corrigé qui retire, réordonne ou perd une question est signalé', () => {
		const f = [
			['a', 'b', 'c', 'd'],
			['e', 'f', 'g', 'h'],
		];
		expect(
			ecartsFeuilleCorrige(
				f,
				f.map((c) => [...c]),
			),
		).toEqual([]);
		expect(ecartsFeuilleCorrige(f, [['b', 'a', 'c', 'd'], f[1]])).not.toEqual([]);
		expect(ecartsFeuilleCorrige(f, [['a', 'b', 'c', 'x'], f[1]])).not.toEqual([]);
		expect(ecartsFeuilleCorrige(f, [f[0]])).not.toEqual([]);
	});

	/* Les banques réelles n'ont pas de groupe à mot répété : la manche est FABRIQUÉE, et
	   passe par l'entrée publique avec la vraie leçon à étiquettes. Groupes artificiels
	   assumés : seul compte qu'un mot y paraisse deux fois, à la casse près ou non. */
	it('à étiquettes, le mot désigné ne paraît qu’une fois dans le groupe (casse ignorée)', () => {
		const lecon = LECONS_RELIER.find(estEtiquettes)!;
		const noms = ['chat', 'jardin', 'livre', 'bateau', 'nuage', 'crayon', 'pomme', 'route'];
		const fautes: string[] = [];
		for (const nom of [...noms, ...noms.map((n) => `${n}s`)]) {
			const manches: Manche[] = [
				{
					type: 'appariement',
					question: '',
					colonneDroite: 'etiquettes',
					paires: [
						{ gauche: 'le', droite: 'déterminant' },
						{ gauche: 'petit', droite: 'adjectif' },
						{ gauche: nom, droite: 'nom' },
						{ gauche: 'petit', droite: 'adjectif' },
					],
				},
				{
					type: 'appariement',
					question: '',
					colonneDroite: 'etiquettes',
					paires: [
						{ gauche: 'Le', droite: 'déterminant' },
						{ gauche: nom, droite: 'nom' },
						{ gauche: 'vert', droite: 'adjectif' },
						{ gauche: 'le', droite: 'déterminant' },
					],
				},
			];
			for (const ex of manches) {
				const item = itemDepuisExercice(lecon, ex);
				const f = fauteMotRepete(item.text, ex);
				if (f) fautes.push(f);
			}
		}
		expect(fautes).toEqual([]);
	});

	it('témoin : une question qui désigne un mot répété est signalée', () => {
		const ex: Manche = {
			type: 'appariement',
			question: '',
			colonneDroite: 'etiquettes',
			paires: [
				{ gauche: 'Le', droite: 'déterminant' },
				{ gauche: 'chat', droite: 'nom' },
				{ gauche: 'le', droite: 'déterminant' },
			],
		};
		expect(fauteMotRepete('Dans « Le chat le », « le » est… @', ex)).not.toBeNull();
		expect(fauteMotRepete('Dans « Le chat le », « chat » est… @', ex)).toBeNull();
	});
});

/* ============================================================
   6. Corrigé imprimé de « Décomposer pour calculer une multiplication » (#777, critère 22).
   ------------------------------------------------------------
   Une ligne se lit « a × b = (□ × □) + (□ × □) = □ + □ = □ ». Ce qu'un parent doit lire au
   corrigé, de premiers principes : chaque case remplie ; chaque produit partiel juste ; leur
   somme égale au total ; le total égal à a × b ; et la décomposition que la fiche enseigne
   (son exemple : « 6 × 14 = (6×10) + (6×4) »), b coupé en dizaines + unités, a gardé dans
   chaque produit (ordre des facteurs libre). La feuille, elle, ne révèle rien.
   ============================================================ */
const DECOMPO = 'math-decomposer-multiplication';

const LIGNE =
	/^(\d+)\s*×\s*(\d+)\s*=\s*\(\s*(\d*)\s*×\s*(\d*)\s*\)\s*\+\s*\(\s*(\d*)\s*×\s*(\d*)\s*\)\s*=\s*(\d*)\s*\+\s*(\d*)\s*=\s*(\d*)$/u;

interface LigneLue {
	a: number;
	b: number;
	cases: string[]; // les 7 cases, dans l'ordre de lecture ('' = vide)
}

function lireLigne(texte: string): LigneLue | null {
	const m = LIGNE.exec(texte);
	return m ? { a: Number(m[1]), b: Number(m[2]), cases: m.slice(3, 10) } : null;
}

/** L'autre facteur d'un produit qui doit contenir `a`, ou `null` s'il ne le contient pas. */
const autreFacteur = (x: number, y: number, a: number): number | null =>
	x === a ? y : y === a ? x : null;

function fautesCorrige({ a, b, cases }: LigneLue): string[] {
	if (cases.some((c) => c === '')) return [`${a} × ${b} : case(s) non révélée(s)`];
	const [x1, x2, y1, y2, p1, p2, total] = cases.map(Number);
	const f: string[] = [];
	if (total !== a * b) f.push(`${a} × ${b} : total ${total}`);
	if (x1 * x2 !== p1) f.push(`${a} × ${b} : ${x1} × ${x2} ≠ ${p1}`);
	if (y1 * y2 !== p2) f.push(`${a} × ${b} : ${y1} × ${y2} ≠ ${p2}`);
	if (p1 + p2 !== total) f.push(`${a} × ${b} : ${p1} + ${p2} ≠ ${total}`);
	const d = autreFacteur(x1, x2, a);
	const u = autreFacteur(y1, y2, a);
	if (d === null || u === null || d + u !== b || d % 10 !== 0 || d === 0 || u < 0 || u > 9) {
		f.push(`${a} × ${b} : (${x1} × ${x2}) + (${y1} × ${y2}) n'est pas ${a} × (dizaines + unités)`);
	}
	return f;
}

const fautesFeuille = ({ a, b, cases }: LigneLue): string[] =>
	cases.some((c) => c !== '') ? [`${a} × ${b} : la feuille révèle ${cases.join(' ')}`] : [];

const GRAINES_DECOMPO = Array.from({ length: 30 }, (_, k) => k + 1);

/** Feuille et corrigé d'une même impression (une seule graine, comme `buildPrintableDOM`). */
function feuilleEtCorrige(seed: number): { feuille: string[]; corrige: string[] } {
	const doc = withSeed(seed, () =>
		buildPrintableDOM({
			title: 'T',
			lessonIds: [DECOMPO],
			kind: 'fiches',
			corrige: true,
			level: 'ce2',
		}),
	);
	const lignes = lireTous(doc.balisage, 'op');
	const moitie = lignes.length / 2;
	return { feuille: lignes.slice(0, moitie), corrige: lignes.slice(moitie) };
}

describe('Corrigé imprimé : « Décomposer pour calculer une multiplication » (CE2)', () => {
	it('chaque ligne du corrigé révèle ses sept cases, et l’égalité révélée est juste', () => {
		const fautes: string[] = [];
		const dizainesVues = new Set<number>();
		let lignes = 0;
		for (const seed of GRAINES_DECOMPO) {
			const { feuille, corrige } = feuilleEtCorrige(seed);
			if (feuille.length === 0 || feuille.length !== corrige.length) {
				fautes.push(`graine ${seed} : ${feuille.length} ligne(s) / ${corrige.length} au corrigé`);
				continue;
			}
			feuille.forEach((texteFeuille, i) => {
				const f = lireLigne(texteFeuille);
				const c = lireLigne(corrige[i]);
				if (!f || !c) {
					fautes.push(`graine ${seed} : ligne illisible « ${texteFeuille} » / « ${corrige[i]} »`);
					return;
				}
				lignes++;
				dizainesVues.add(c.b - (c.b % 10));
				if (f.a !== c.a || f.b !== c.b) {
					fautes.push(`graine ${seed} : ${f.a} × ${f.b} devient ${c.a} × ${c.b} au corrigé`);
				}
				fautes.push(...fautesFeuille(f), ...fautesCorrige(c));
			});
		}
		expect(fautes).toEqual([]);
		expect(lignes).toBeGreaterThanOrEqual(GRAINES_DECOMPO.length);
		// Les deux plages de b (12-19 et 21-29) sont vues : une dizaine de 10 et une de 20.
		expect([...dizainesVues].sort()).toEqual([10, 20]);
	});

	it('témoins : case vide, produit faux, somme fausse ou autre découpage sont signalés ; la feuille ne révèle rien', () => {
		const lue = (t: string): LigneLue => lireLigne(t)!;
		const juste = lue('6 × 14 = (6 × 10) + (6 × 4) = 60 + 24 = 84');
		expect(fautesCorrige(juste)).toEqual([]);
		expect(fautesCorrige(lue('6 × 14 = (10 × 6) + (4 × 6) = 60 + 24 = 84'))).toEqual([]);
		for (const t of [
			'6 × 14 = ( × ) + ( × ) = + =', // le corrigé d'avant #777 : les cases restaient vides
			'6 × 14 = (6 × 10) + (6 × 4) = 24 + 60 = 84',
			'6 × 14 = (6 × 10) + (6 × 4) = 60 + 24 = 85',
			'6 × 14 = (6 × 7) + (6 × 7) = 42 + 42 = 84',
		]) {
			expect(fautesCorrige(lue(t)), t).not.toEqual([]);
		}
		expect(fautesFeuille(juste)).not.toEqual([]);
		expect(fautesFeuille(lue('6 × 14 = ( × ) + ( × ) = + ='))).toEqual([]);
		// Sur des lignes réelles : la feuille vierge, prise pour un corrigé, serait signalée.
		const { feuille } = feuilleEtCorrige(1);
		for (const t of feuille) expect(fautesCorrige(lue(t)), t).not.toEqual([]);
	});
});

/* ============================================================
   7. Critère 26 — « Je décompose » au CM1 reste dans le programme de CM1.
   ------------------------------------------------------------
   Le programme de CM1 s'arrête aux nombres à six chiffres (999 999,
   docs/reference/programmes/cm1-maths.md). Au CM1, aucun nombre de la leçon — énoncé ou
   réponse, en chiffres ou nommé par son rang (« 7 millions ») — ne dépasse 999 999, et son
   étayage ne parle plus des millions. Au CE2, la leçon reste « jusqu'à 10 000 ».
   ============================================================ */
const DECOMPOSE = 'num-decompose-10000';
const PLAFOND_CM1 = 999_999;
const PLAFOND_CE2 = 10_000;
const GRAINES_PLAGE = Array.from({ length: 600 }, (_, k) => k + 1);

/** Le rang des millions, nommé (« 7 millions », « un million ») : au-delà du programme. */
const MILLION = /(?<!\p{L})millions?(?!\p{L})/iu;

/** Les nombres écrits en chiffres d'un texte, groupes de milliers recollés (l'espace, la
    fine insécable et l'insécable sont toutes dans `\s`) : « 6 643 665 » vaut 6 643 665. */
const nombresEcrits = (texte: string): number[] =>
	[...texte.matchAll(/\d{1,3}(?:\s\d{3})+(?!\d)|\d+/gu)].map((m) =>
		Number(m[0].replace(/\s/g, '')),
	);

/** Défauts de plage d'un item : un nombre au-dessus du plafond, ou le rang des millions
    nommé quand le plafond est sous le million. */
function fautesPlage(item: Item, plafond: number): string[] {
	const f: string[] = [];
	const nombres = [...nombresEcrits(item.text), ...nombresEcrits(String(item.answer))];
	const trop = nombres.filter((n) => n > plafond);
	if (trop.length > 0) f.push(`${trop.join(', ')} > ${plafond} dans « ${item.text} »`);
	if (plafond < 1_000_000 && MILLION.test(item.text)) f.push(`millions nommés : « ${item.text} »`);
	return f;
}

function itemsDecompose(niveau: SchoolLevel): Item[] {
	const lecon = getLessonById(DECOMPOSE)!;
	return GRAINES_PLAGE.map((seed) => withSeed(seed, () => genLessonItem(lecon, niveau)));
}

/** Tout le texte d'un étayage, déroulé de l'exemple compris. */
function texteEtayage(niveau: SchoolLevel): string {
	const contenu = etayagePour(getLessonById(DECOMPOSE)!, niveau);
	if (!contenu) return '';
	const deroule =
		contenu.exemple?.moteur === 'position'
			? JSON.stringify(deroulePosition(contenu.exemple.spec))
			: '';
	return `${JSON.stringify(contenu)} ${deroule}`;
}

describe('Critère 26 : « Je décompose » au CM1 ne dépasse pas 999 999', () => {
	it('critère 26 : au CM1, aucun nombre de l’énoncé ni de la réponse ne dépasse 999 999', () => {
		const fautes = itemsDecompose('cm1').flatMap((it) => fautesPlage(it, PLAFOND_CM1));
		expect([...new Set(fautes)].slice(0, 10)).toEqual([]);
	});

	it('NON-RÉGRESSION : au CM1, la leçon reste au-delà de la plage du CE2 (« les grands nombres »)', () => {
		const max = Math.max(...itemsDecompose('cm1').flatMap((it) => nombresEcrits(it.text)));
		expect(max).toBeGreaterThan(PLAFOND_CE2);
	});

	it('critère 26 : au CE2, inchangé — jusqu’à 10 000, et des nombres à quatre chiffres', () => {
		const items = itemsDecompose('ce2');
		expect(items.flatMap((it) => fautesPlage(it, PLAFOND_CE2))).toEqual([]);
		expect(Math.max(...items.flatMap((it) => nombresEcrits(it.text)))).toBeGreaterThanOrEqual(1000);
	});

	it('critère 26 : l’étayage CM1 de la leçon existe et ne parle plus de millions', () => {
		const texte = texteEtayage('cm1');
		expect(texte, 'étayage CM1 absent').not.toBe('');
		expect(texte).not.toMatch(MILLION);
	});

	it('témoins : sept chiffres, millions nommés et étayage CE2 sont lus comme il faut', () => {
		const item = (text: string, answer: string): Item => ({ text, answer, kind: 'num' });
		expect(nombresEcrits('6 643 665 = 6 millions + @ unités')).toEqual([6643665, 6]);
		expect(nombresEcrits('9312 = 9 milliers + @ unités')).toEqual([9312, 9]);
		// L'état livré par la tranche 1 : sept chiffres au CM1.
		expect(
			fautesPlage(
				item('6 643 665 = 6 millions + 6 centaines de mille + @ milliers', '3'),
				PLAFOND_CM1,
			),
		).toHaveLength(2);
		expect(
			fautesPlage(item('@ = 9 centaines de mille + 9 unités', '900 009'), PLAFOND_CM1),
		).toEqual([]);
		expect(fautesPlage(item('999 999 = @', '1 000 000'), PLAFOND_CM1)).not.toEqual([]);
		expect(
			fautesPlage(item('12 004 = @ dizaines de mille + 4 unités', '1'), PLAFOND_CE2),
		).not.toEqual([]);
		for (const t of ['7 millions', 'un million', 'Millions']) expect(t).toMatch(MILLION);
		for (const t of ['milliers', 'un millier', 'des milliards']) expect(t).not.toMatch(MILLION);
		// L'étayage CE2 de la même leçon, lui, n'en a jamais parlé : le contrôle sait lire vide.
		expect(texteEtayage('ce2')).not.toMatch(MILLION);
	});
});

/* ============================================================
   8. Critère 27 — « Repère le groupe nominal » hors de son exercice désigne UN groupe.
   ------------------------------------------------------------
   Quand la phrase porte deux groupes nominaux, l'exercice d'écran le précise par une ANCRE
   (« Montre le groupe nominal qui contient le mot « oiseaux » »). Le repli écrit (fiche,
   bilan, papier) doit désigner le groupe attendu sans ambiguïté, « par un repère tiré de la
   cible » (commentaire daté de #777) : un mot ou des mots CITÉS entre « », pris dans le
   groupe attendu, et qui ne figurent qu'UNE fois dans la phrase. C'est ce qui garantit
   qu'aucun autre groupe de la phrase ne satisfait l'énoncé : un groupe disjoint de la cible
   ne peut ni contenir ce repère ni commencer par lui. Le texte LU (synthèse vocale) porte
   le même repère. Inventaire : la banque elle-même (`PHRASES_GN`, phrases à ancre).
   ============================================================ */
const GROUPE_NOMINAL = 'fr-gram-groupe-nominal';

const motsDe = (s: string): string[] => s.toLocaleLowerCase('fr').match(/[\p{L}\p{N}]+/gu) ?? [];

/** Nombre d'occurrences de la suite de mots `aiguille` dans `botte`. */
function occurrences(botte: readonly string[], aiguille: readonly string[]): number {
	if (aiguille.length === 0) return 0;
	let n = 0;
	for (let i = 0; i + aiguille.length <= botte.length; i++) {
		if (aiguille.every((m, k) => botte[i + k] === m)) n++;
	}
	return n;
}

type ClicMot = Extract<Exercise, { type: 'clicMot' }>;

/** Défaut de désignation du repli d'une phrase à deux groupes, ou `null`. */
function fauteDesignationGroupe(
	texte: string,
	parle: string | undefined,
	ex: Pick<ClicMot, 'tokens' | 'cibleIndices'>,
): string | null {
	const phrase = motsDe(ex.tokens.join(' '));
	const cible = motsDe(ex.cibleIndices.map((i) => ex.tokens[i]).join(' '));
	const reperes = citationsDe(texte)
		.map(motsDe)
		.filter((r) => r.length > 0 && JSON.stringify(r) !== JSON.stringify(phrase));
	if (reperes.length === 0) return `aucun repère cité : « ${texte} »`;
	const bons = reperes.filter((r) => occurrences(cible, r) > 0 && occurrences(phrase, r) === 1);
	if (bons.length === 0) {
		return `repère hors du groupe attendu « ${cible.join(' ')} », ou répété dans la phrase : « ${texte} »`;
	}
	if (parle !== undefined && !bons.some((r) => occurrences(motsDe(parle), r) >= 2)) {
		return `le texte lu ne dit pas le repère : « ${parle} »`;
	}
	return null;
}

/** Les exercices à ANCRE réellement tirés par la leçon, un par phrase. */
function exercicesAncres(): ClicMot[] {
	const lecon = getLessonById(GROUPE_NOMINAL)!;
	const parPhrase = new Map<string, ClicMot>();
	for (let seed = 1; seed <= 1500; seed++) {
		const ex = withSeed(seed, () => lecon.exerciseType.generate({ level: 'cm1' }));
		if (ex.type === 'clicMot' && citationsDe(ex.consigne).length > 0) {
			parPhrase.set(ex.tokens.join(' '), ex);
		}
	}
	return [...parPhrase.values()];
}

describe('Critère 27 : « Repère le groupe nominal » replié désigne sans ambiguïté le groupe attendu', () => {
	const ancrees = PHRASES_GN.filter(
		(p) => p.consigne !== undefined && citationsDe(p.consigne).length > 0,
	);

	it('inventaire : toutes les phrases à ancre de la banque sont tirées et éprouvées', () => {
		expect(
			ancrees.length,
			'banque sans phrase à deux groupes : contrôle vide',
		).toBeGreaterThanOrEqual(10);
		expect(exercicesAncres().length).toBe(ancrees.length);
	});

	it('critère 27 : le repli cite un repère pris dans le groupe attendu, unique dans la phrase, dit aussi à l’oral', () => {
		const lecon = getLessonById(GROUPE_NOMINAL)!;
		const fautes: string[] = [];
		for (const ex of exercicesAncres()) {
			const item = itemDepuisExercice(lecon, ex);
			const f = fauteDesignationGroupe(item.text, item.parle, ex);
			if (f) fautes.push(f);
		}
		expect(fautes).toEqual([]);
	});

	/* Donnée : l'ancre de l'écran est un repère valable (dans le groupe attendu, une seule
	   fois dans la phrase). Sinon le critère serait intenable avec la banque telle quelle, et
	   l'écran lui-même serait ambigu. */
	it('critère 27 (donnée) : chaque ancre de la banque est dans le groupe attendu, et une seule fois dans la phrase', () => {
		const fautes: string[] = [];
		for (const ex of exercicesAncres()) {
			const [ancre] = citationsDe(ex.consigne);
			const phrase = `« ${ex.tokens.join(' ')} »`;
			const f = fauteDesignationGroupe(`… qui contient « ${ancre} » : ${phrase} @`, undefined, ex);
			if (f) fautes.push(f);
		}
		expect(fautes).toEqual([]);
	});

	it('NON-RÉGRESSION : le groupe attendu, recopié tel quel, reste juste', () => {
		const lecon = getLessonById(GROUPE_NOMINAL)!;
		for (const ex of exercicesAncres()) {
			const item = itemDepuisExercice(lecon, ex);
			const groupe = ex.cibleIndices.map((i) => ex.tokens[i]).join(' ');
			expect(checkItemAnswer(item, groupe), `${groupe} dans « ${item.text} »`).toBe(true);
		}
	});

	it('témoins : sans repère, repère hors du groupe, repère répété ou absent de l’oral, c’est signalé', () => {
		const ex = {
			tokens: ['Le', 'chien', 'regarde', 'les', 'oiseaux', '.'],
			cibleIndices: [3, 4],
		};
		const phrase = '« Le chien regarde les oiseaux. »';
		// La forme livrée par la tranche 1 : rien ne dit lequel des deux groupes.
		expect(
			fauteDesignationGroupe(`Recopie le groupe nominal : ${phrase} @`, undefined, ex),
		).not.toBeNull();
		expect(
			fauteDesignationGroupe(
				`Recopie le groupe nominal qui contient « oiseaux » : ${phrase} @`,
				'Recopie le groupe nominal qui contient oiseaux. Le chien regarde les oiseaux.',
				ex,
			),
		).toBeNull();
		expect(
			fauteDesignationGroupe(
				`Recopie le groupe nominal qui commence par « les » : ${phrase} @`,
				undefined,
				ex,
			),
		).toBeNull();
		expect(
			fauteDesignationGroupe(
				`Recopie le groupe nominal qui contient « chien » : ${phrase} @`,
				undefined,
				ex,
			),
		).not.toBeNull();
		expect(
			fauteDesignationGroupe(
				`Recopie le groupe nominal qui contient « oiseaux » : ${phrase} @`,
				'Recopie le groupe nominal. Le chien regarde les oiseaux.',
				ex,
			),
		).not.toBeNull();
		// « le » ouvre les deux groupes (casse ignorée) : il ne désigne rien.
		const deuxLe = { tokens: ['Le', 'chat', 'regarde', 'le', 'chien', '.'], cibleIndices: [3, 4] };
		expect(
			fauteDesignationGroupe(
				'Recopie le groupe nominal qui commence par « le » : « Le chat regarde le chien. » @',
				undefined,
				deuxLe,
			),
		).not.toBeNull();
	});
});
