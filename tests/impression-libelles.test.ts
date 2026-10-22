/* ============================================================
   Ce que le PAPIER et la forme écrite disent d'une leçon (#777, tranche 1) :
   - le libellé imprimé (`labelImpressionLecon`, critère 19) ;
   - la consigne de fiche des leçons « clique sur le mot » (critères 5 et 19) ;
   - le repli d'une manche « relier » hors de son widget (critères 2 et 20) ;
   - le corrigé imprimé de « Décomposer pour calculer une multiplication » (critère 22).
   ------------------------------------------------------------
   Écrit APRÈS l'implémentation, par un auteur distinct de celui du code : les attendus
   viennent des critères de l'issue ou de premiers principes (l'arithmétique d'une
   décomposition, la résolution de niveau déjà spécifiée par #225/#436), jamais des
   chaînes ou des formules du code. Ces tests sont donc verts à l'arrivée, et chacun a son
   TÉMOIN : le même contrôle, joué sur une donnée fabriquée ou sur un « mutant » écrit ici
   (une variante fautive plausible du code), doit rougir. Aucune mutation de `src/`.

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
import { createRenderContext, type Item } from '../src/core/items';
import { choice, normalizeText, withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';

type Manche = Extract<Exercise, { type: 'appariement' }>;

/* ---------- Détecteurs partagés ---------- */

/** Verbes de geste d'écran (#777, critère 19 : clique, touche, tape, glisse, déplace,
    appuie, écoute ; plus « relie », faux sans colonnes, critère 2), en mot entier et
    fléchis. Frontières en LETTRES : « étapes », « tapis », « relief », « écouteur » ne
    sont pas des gestes. */
const GESTE_ECRAN =
	/(?<!\p{L})(?:cliqu|touch|tap|gliss|déplac|déplaç|appui|appuy|écout|reli)(?:e|es|ent|er|ez|ons|ant|é|ée|és|ées)(?!\p{L})/iu;

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
			const m = GESTE_ECRAN.exec(titre);
			if (m) out.push({ id: l.id, texte: `${l.id}@${nomNiveau(n)} : « ${titre} » (${m[0]})` });
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

	it('témoins : le détecteur de geste signale ce qu’il doit, et seulement ça', () => {
		for (const t of [
			'Clique sur le verbe',
			'Familles de mots à relier',
			'Touche le mot',
			'Glisse les tuiles',
			'Je déplace les tuiles',
			'Écoute et écris',
			'Appuie sur le bouton',
			'Tape le nombre',
		]) {
			expect(GESTE_ECRAN.test(t), t).toBe(true);
		}
		for (const t of [
			'Trouve le verbe',
			'Mots de la même famille',
			'Repère le groupe nominal',
			'Problèmes en deux étapes',
			'Le relief',
			'Le tapis',
			'Les écouteurs',
		]) {
			expect(GESTE_ECRAN.test(t), t).toBe(false);
		}
		// Le titre imprimé d'avant #777 était le libellé d'ÉCRAN : ce contrôle l'aurait vu.
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
					if (GESTE_ECRAN.test(titre))
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
	const geste = GESTE_ECRAN.exec(consigne);
	if (geste) return `demande un geste d'écran (« ${geste[0]} ») : « ${consigne} »`;
	if (!TACHE_ECRITE.test(consigne)) return `ne nomme pas la tâche écrite : « ${consigne} »`;
	if (!notion.test(consigne))
		return `ne nomme pas ce qu'il faut trouver (${notion}) : « ${consigne} »`;
	return null;
}

function fauteConsigneGeste(consigne: string): string | null {
	const ecrire = TACHE_ECRITE.exec(consigne);
	if (ecrire) return `demande d'écrire (« ${ecrire[0]} ») au toucher : « ${consigne} »`;
	if (!GESTE_ECRAN.test(consigne)) return `ne dit pas le geste : « ${consigne} »`;
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
     question ne porte pas toujours sur le premier mot, chaque étiquette finit par être
     demandée, et la bonne réponse ne tient pas toujours la même place parmi les choix.
   - CHOIX : ceux de la colonne de droite du widget, intrus compris, sans doublon.
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
	designe: string;
	reponse: string;
	choix: string[];
}

function observer(l: LessonDef): Observation[] {
	return manchesDe(l).map((ex) => {
		const item = itemDepuisExercice(l, ex);
		const designe = motDesigne(item.text, ex);
		if (designe === null) throw new Error(`${l.id} : « ${item.text} » ne désigne pas un mot`);
		return { ex, designe, reponse: String(item.answer), choix: item.choices ?? [] };
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
	if (new Set(obs.map((o) => o.choix.indexOf(o.reponse))).size < 2) {
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

function fauteChoix(choix: string[], reponse: string, ex: Manche): string | null {
	const colonne = new Set([...ex.paires.map((p) => p.droite), ...(ex.intrus ?? [])]);
	const cles = choix.map((c) => normalizeText(c).toLocaleLowerCase('fr'));
	if (choix.length < 2) return `moins de deux choix : ${JSON.stringify(choix)}`;
	if (new Set(cles).size !== cles.length) return `choix en double : ${JSON.stringify(choix)}`;
	if (!choix.includes(reponse)) return `« ${reponse} » absente de ${JSON.stringify(choix)}`;
	const manquants = [...colonne].filter((c) => !choix.includes(c));
	if (manquants.length > 0) return `colonne du widget incomplète, manque ${manquants.join(', ')}`;
	const inventes = choix.filter((c) => !colonne.has(c));
	if (inventes.length > 0) return `choix hors de la colonne du widget : ${inventes.join(', ')}`;
	return null;
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

	it('VARIÉTÉ : pas toujours le premier mot, toutes les étiquettes demandées, réponse à place variable', () => {
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
			const enTete = obs.map((o) => ({
				...o,
				choix: [o.reponse, ...o.choix.filter((c) => c !== o.reponse)],
			}));
			expect(fautesVariete(enTete, estEtiquettes(l)).join(' | '), l.id).toMatch(/même place/);
		}
	});

	it('CHOIX : la colonne de droite du widget, intrus compris, sans doublon, avec la réponse', () => {
		const fautes: string[] = [];
		for (const l of LECONS_RELIER) {
			for (const o of observer(l)) {
				const f = fauteChoix(o.choix, o.reponse, o.ex);
				if (f) {
					fautes.push(`${l.id} : ${f}`);
					break;
				}
			}
		}
		expect(fautes).toEqual([]);
	});

	it('témoins : réponse absente, doublon à la casse près, intrus perdu ou choix inventé sont signalés', () => {
		for (const l of LECONS_RELIER) {
			const o = observer(l).find((x) => x.choix.length >= 2)!;
			const autres = o.choix.filter((c) => c !== o.reponse);
			expect(fauteChoix(o.choix, o.reponse, o.ex), l.id).toBeNull();
			expect(fauteChoix(autres, o.reponse, o.ex), `${l.id} sans réponse`).not.toBeNull();
			const casse = o.reponse.charAt(0).toUpperCase() + o.reponse.slice(1);
			expect(fauteChoix([...o.choix, casse], o.reponse, o.ex), `${l.id} doublon`).not.toBeNull();
			expect(
				fauteChoix([o.reponse, ...autres.slice(1)], o.reponse, o.ex),
				`${l.id} colonne amputée`,
			).not.toBeNull();
			expect(
				fauteChoix([...o.choix, 'parapluie'], o.reponse, o.ex),
				`${l.id} inventé`,
			).not.toBeNull();
		}
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
