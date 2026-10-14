import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CLES_FIGEAGE, COUVERTURE_FIGEAGE } from '../e2e/figeage-couverture';
import { getLessonById } from '../src/core/catalog';

/* ============================================================
   Gate de couverture du FIGEAGE post-réponse (#543, critère 5).

   Après une réponse, le widget reste visible mais ne doit plus être manipulable. Deux
   chemins y mènent (« Vérifier » / « Valider », et « Je ne sais pas, montre-moi »), et
   le risque gardé ici est un runner figé à moitié sur l'un des deux. La preuve par
   l'usage est jouée par `e2e/figeage.spec.ts`, entrée par entrée de la table
   `e2e/figeage-couverture.ts`. Ce fichier-ci garde la TABLE elle-même : un runner qui
   emprunte le chemin de révélation sans y être déclaré ne serait joué par aucune spec,
   et rien ne le dirait (« échec » du critère 5 : ajouter un runner à révélation sans le
   déclarer laisse la suite verte).

   ── Le signal ──────────────────────────────────────────────────────────────────
   Un module de `src/ui/` qui APPELLE `revelerSolution(` ou `neutraliserScene(` emprunte
   le chemin de révélation. On lit le source en TEXTE, sans ses commentaires (une
   mention dans un commentaire n'est pas un appel), et on suit un import renommé
   (`revelerSolution as reveler`), qui ferait sinon sortir un runner du périmètre sans
   bruit. Une DÉFINITION (`function revelerSolution(`) n'est pas un appel.

   Les deux modules qui DÉFINISSENT ces fonctions sont exclus, avec leur raison, et
   l'exclusion est vérifiée (elle tombe si le module ne définit plus la fonction).

   ── Runner du périmètre SANS révélation (décision du mainteneur, 14/10/2026) ────
   Le QCM de leçon (`lecon-qcm`) valide au clic et n'a pas de « Je ne sais pas » : il
   n'appelle aucun point d'entrée, mais il est DANS le périmètre de #543 (son chemin
   « Valider » doit figer comme les autres). Le détecteur ne peut donc pas le réclamer ;
   il est exigé nommément (`HORS_DETECTEUR`). Dans la table, une clé dont le module ne
   révèle pas n'est acceptée que si TOUTES ses entrées portent `sansRevelation` (la raison
   écrite, jouée par le seul chemin `verifier`) ; sinon c'est une clé périmée.
   Inversement, `sansRevelation` sur un module qui révèle est une incohérence : sa spec
   sauterait un chemin qui existe.

   ── Successeur ─────────────────────────────────────────────────────────────────
   Si l'unification renomme ces points d'entrée, ce gate rougit par le SENS INVERSE (les
   clés de la table ne désignent plus aucun appelant) : c'est voulu. Mettre alors à jour
   `NOMS_REVELATION` et `DEFINISSENT`, pas affaiblir le détecteur.

   ── Ce que ce gate ne prouve pas ───────────────────────────────────────────────
   Que le figeage soit bon, ni que les deux chemins passent par la même fonction
   (critère 1) : c'est le rôle de la spec e2e et de la relecture. On garde ici
   l'EXISTENCE d'une entrée jouée par runner, et le fait que la table ne ment pas sur
   le catalogue.
   ============================================================ */

const DIR = 'src/ui';

/** Points d'entrée du chemin de révélation (#467). */
const NOMS_REVELATION = ['revelerSolution', 'neutraliserScene'] as const;

/** Modules qui DÉFINISSENT un point d'entrée : ils sont le chemin lui-même, pas un runner
 *  qui l'emprunte. Clé = nom de fichier sans `.ts` ; valeur = fonction définie + raison. */
const DEFINISSENT: Record<string, { definit: string; raison: string }> = {
	'lecon-passer': {
		definit: 'revelerSolution',
		raison:
			'définit revelerSolution, et appelle neutraliserScene EN INTERNE pour tous les runners de leçon : c’est le chemin, pas un runner.',
	},
	'revelation-neutre': {
		definit: 'neutraliserScene',
		raison: 'définit neutraliserScene, fond commun aux deux écrans (#467).',
	},
};

/** Le source sans ses commentaires (`://` épargné : une URL n'est pas un commentaire).
 *  Même règle que `tests/erreurs-journal-gate.test.ts`. */
const sansCommentaires = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Le module appelle-t-il un point d'entrée de la révélation (sous son nom ou sous un
 *  alias d'import) ? Une définition `function X(` n'en est pas un. */
function appelleRevelation(source: string): boolean {
	const src = sansCommentaires(source);
	const noms: string[] = [...NOMS_REVELATION];
	for (const nom of NOMS_REVELATION)
		for (const m of src.matchAll(new RegExp(`\\b${nom}\\s+as\\s+(\\w+)`, 'g'))) noms.push(m[1]);
	return noms.some((nom) => new RegExp(`(?<!\\bfunction\\s+)\\b${nom}\\s*\\(`).test(src));
}

/** Runners (hors modules qui définissent) qui empruntent la révélation, parmi `sources`
 *  (nom de module sans `.ts` → texte). */
function appelants(sources: Record<string, string>): string[] {
	return Object.entries(sources)
		.filter(([module, src]) => !(module in DEFINISSENT) && appelleRevelation(src))
		.map(([module]) => module)
		.sort();
}

/** Appelants absents de la table : ce que le gate doit faire rougir. */
function nonDeclares(sources: Record<string, string>, cles: readonly string[]): string[] {
	return appelants(sources).filter((m) => !cles.includes(m));
}

/** Runners du périmètre que le détecteur ne voit pas (aucun point d'entrée appelé), exigés
 *  nommément dans la table, avec la raison. */
const HORS_DETECTEUR: Record<string, string> = {
	'lecon-qcm':
		'QCM de leçon : valide au clic, sans « Je ne sais pas », mais son chemin « Valider » doit figer comme les autres (décision du mainteneur, 14/10/2026).',
};

/** Raison écrite d'une entrée jouée par le seul chemin `verifier` (champ optionnel de
 *  `EntreeFigeage`), ou `undefined`. Lue sans présumer que le type la déclare déjà. */
function raisonSansRevelation(entree: object): string | undefined {
	return 'sansRevelation' in entree && typeof entree.sansRevelation === 'string'
		? entree.sansRevelation
		: undefined;
}

/** Ce qui ne va pas dans la clé `cle` de la table, ou `null`. `revele` : le module appelle
 *  un point d'entrée de la révélation. */
function incoherenceCle(cle: string, revele: boolean, entrees: readonly object[]): string | null {
	const raisons = entrees.map(raisonSansRevelation);
	if (revele) {
		const n = raisons.filter((r) => r !== undefined).length;
		return n === 0
			? null
			: `« ${cle} » révèle bel et bien (revelerSolution / neutraliserScene), mais ${n} de ses ` +
					`entrées portent « sansRevelation » : sa spec sauterait le chemin « Je ne sais pas », ` +
					`qui existe. Retirer « sansRevelation » de ces entrées.`;
	}
	const sansRaison = raisons.filter((r) => !r?.trim()).length;
	return sansRaison === 0 && entrees.length > 0
		? null
		: `La clé « ${cle} » de e2e/figeage-couverture.ts désigne un module qui n'appelle ni ` +
				`revelerSolution ni neutraliserScene, et ${sansRaison} de ses entrées n'écrivent pas ` +
				`« sansRevelation » (la raison pour laquelle seul « Vérifier » est joué). Clé périmée : ` +
				`la retirer ; runner du périmètre sans « Je ne sais pas » : écrire la raison sur ` +
				`chaque entrée ; points d'entrée renommés : mettre à jour NOMS_REVELATION.`;
}

/* ---------- Lecture des sources réelles ---------- */

const SOURCES: Record<string, string> = Object.fromEntries(
	readdirSync(DIR)
		.filter((f) => f.endsWith('.ts'))
		.map((f) => [f.replace(/\.ts$/, ''), readFileSync(`${DIR}/${f}`, 'utf8')]),
);
const APPELANTS = appelants(SOURCES);

const message = (module: string) =>
	`Le runner « ${module} » (src/ui/${module}.ts) emprunte le chemin de révélation ` +
	`(${NOMS_REVELATION.join(' / ')}) mais n'est pas déclaré dans e2e/figeage-couverture.ts.\n` +
	`Déclarer le runner ${module} dans e2e/figeage-couverture.ts (COUVERTURE_FIGEAGE) : une clé ` +
	`« ${module} » et au moins une entrée (leçon, geste, bouton de validation) que ` +
	`e2e/figeage.spec.ts jouera par les DEUX chemins, « Vérifier » et « Je ne sais pas ».\n` +
	`Sans elle, ce runner peut rester figé à moitié sur l'un des chemins sans que rien ne rougisse (#543).`;

describe('Détecteur du chemin de révélation (témoin, #543)', () => {
	// Sans ces témoins, un détecteur devenu aveugle (regex cassée, nom changé) rendrait
	// tous les tests suivants verts en ne voyant plus aucun runner.
	it.each([
		{ cas: 'appel direct de revelerSolution', src: 'revelerSolution({ root, onNext });' },
		{ cas: 'appel direct de neutraliserScene', src: 'neutraliserScene({ scene: stage });' },
		{ cas: 'appel sur plusieurs lignes', src: 'revelerSolution (\n\t{\n\t\troot,\n\t});' },
		{
			cas: 'appel sous un alias d’import',
			src: "import { revelerSolution as reveler } from './lecon-passer';\nreveler({ root });",
		},
	])('détecte : $cas', ({ src }) => {
		expect(appelleRevelation(src)).toBe(true);
	});

	it.each([
		{ cas: 'mention dans un commentaire ligne', src: '// revelerSolution({ root }) plus tard' },
		{ cas: 'mention dans un commentaire bloc', src: '/* cf. neutraliserScene( */\nconst a = 1;' },
		{ cas: 'définition seule', src: 'export function revelerSolution(o: Opts): void {}' },
		{ cas: 'un nom qui le prolonge', src: 'revelerSolutionDifferee({ root });' },
		{ cas: 'un nom qui le précède', src: 'prerevelerSolution({ root });' },
	])('ne détecte pas : $cas', ({ src }) => {
		expect(appelleRevelation(src)).toBe(false);
	});

	it('un runner qui révèle sans être déclaré fait rougir le gate (échec du critère 5)', () => {
		const sources = {
			'lecon-nouveau': "import { revelerSolution } from './lecon-passer';\nrevelerSolution({});",
			'lecon-tuiles': 'revelerSolution({});',
			'lecon-passer': 'export function revelerSolution(o) { neutraliserScene(o); }',
		};
		// `lecon-passer` (qui définit) n'est jamais réclamé ; `lecon-tuiles` est déclaré.
		expect(nonDeclares(sources, ['lecon-tuiles'])).toEqual(['lecon-nouveau']);
	});
});

describe('Règle « sansRevelation » d’une clé de la table (témoin, #543)', () => {
	const raison = { sansRevelation: 'valide au clic, pas de « Je ne sais pas »' };
	it.each([
		{ cas: 'module qui révèle, aucune entrée sansRevelation', revele: true, entrees: [{}, {}] },
		{
			cas: 'module qui ne révèle pas, toutes les entrées motivées',
			revele: false,
			entrees: [raison],
		},
	])('acceptée : $cas', ({ revele, entrees }) => {
		expect(incoherenceCle('lecon-x', revele, entrees)).toBeNull();
	});

	it.each([
		{ cas: 'module qui ne révèle pas, aucune raison (clé périmée)', revele: false, entrees: [{}] },
		{
			cas: 'module qui ne révèle pas, une entrée sur deux motivée',
			revele: false,
			entrees: [raison, {}],
		},
		{
			cas: 'module qui ne révèle pas, raison vide',
			revele: false,
			entrees: [{ sansRevelation: '  ' }],
		},
		{
			cas: 'module qui ne révèle pas, raison mal typée',
			revele: false,
			entrees: [{ sansRevelation: true }],
		},
		{ cas: 'module qui ne révèle pas, aucune entrée', revele: false, entrees: [] },
		{ cas: 'module qui révèle, une entrée sansRevelation', revele: true, entrees: [{}, raison] },
	])('refusée : $cas', ({ revele, entrees }) => {
		expect(incoherenceCle('lecon-x', revele, entrees)).not.toBeNull();
	});
});

describe('Couverture du figeage par runner (#543, critère 5)', () => {
	it('le gate voit des runners et la table n’est pas vide (garde contre un gate à vide)', () => {
		// 9 runners de leçon + la révision au 14/10/2026. Un plancher plutôt qu'une égalité :
		// un runner supplémentaire ne doit pas casser ce test-ci, mais le suivant.
		expect(
			APPELANTS.length,
			`seulement ${APPELANTS.length} runner(s) détecté(s) dans ${DIR} : la détection a changé ` +
				`(points d'entrée renommés ?). Mettre à jour NOMS_REVELATION.`,
		).toBeGreaterThanOrEqual(8);
		expect(CLES_FIGEAGE.length).toBeGreaterThanOrEqual(8);
	});

	it.each(APPELANTS.map((module) => ({ module })))(
		'le runner « $module » est déclaré dans e2e/figeage-couverture.ts',
		({ module }) => {
			expect(CLES_FIGEAGE.includes(module), message(module)).toBe(true);
		},
	);

	it.each(Object.entries(HORS_DETECTEUR).map(([module, raison]) => ({ module, raison })))(
		'le runner « $module » (sans « Je ne sais pas ») est déclaré dans e2e/figeage-couverture.ts',
		({ module, raison }) => {
			expect(existsSync(`${DIR}/${module}.ts`), `${DIR}/${module}.ts n'existe plus.`).toBe(true);
			expect(
				CLES_FIGEAGE.includes(module),
				`Déclarer le runner ${module} dans e2e/figeage-couverture.ts (COUVERTURE_FIGEAGE) : une ` +
					`clé « ${module} » dont chaque entrée porte « sansRevelation » (la raison), jouée par ` +
					`le seul chemin « Vérifier ».\nMotif : ${raison}`,
			).toBe(true);
		},
	);

	it.each(CLES_FIGEAGE.map((cle) => ({ cle })))(
		'la clé « $cle » est cohérente avec son module (pas de clé périmée)',
		({ cle }) => {
			expect(
				existsSync(`${DIR}/${cle}.ts`),
				`La clé « ${cle} » de e2e/figeage-couverture.ts ne correspond à aucun module ` +
					`${DIR}/${cle}.ts (renommé ou supprimé ?). La clé est le nom de fichier sans .ts.`,
			).toBe(true);
			expect(incoherenceCle(cle, APPELANTS.includes(cle), COUVERTURE_FIGEAGE[cle])).toBeNull();
		},
	);

	it('chaque runner déclaré porte au moins une entrée à jouer', () => {
		// Une clé à tableau vide satisferait le test de déclaration sans qu'aucune spec ne
		// joue quoi que ce soit.
		for (const cle of CLES_FIGEAGE)
			expect(
				COUVERTURE_FIGEAGE[cle].length,
				`« ${cle} » est déclaré sans aucune entrée : e2e/figeage.spec.ts ne jouera rien pour lui.`,
			).toBeGreaterThan(0);
	});

	it('les modules exclus (qui définissent les points d’entrée) le font toujours', () => {
		for (const [module, { definit, raison }] of Object.entries(DEFINISSENT)) {
			const src = SOURCES[module];
			expect(src, `${DIR}/${module}.ts n'existe plus : retirer son exclusion.`).toBeDefined();
			expect(
				new RegExp(`\\bfunction\\s+${definit}\\s*\\(`).test(sansCommentaires(src)),
				`${DIR}/${module}.ts ne définit plus ${definit} : son exclusion ne tient plus ` +
					`(motif : ${raison}).`,
			).toBe(true);
		}
	});
});

describe('La table de figeage ne ment pas sur le catalogue (#543)', () => {
	// L'en-tête de e2e/figeage-couverture.ts promet que chaque `source` est confrontée au
	// catalogue : sans ça, une leçon renommée laisserait une entrée qui rassure sans rien
	// couvrir (la spec échouerait sur la navigation, loin de la cause).
	const ENTREES = CLES_FIGEAGE.flatMap((cle) =>
		COUVERTURE_FIGEAGE[cle].map((e) => ({ cle, titre: e.titre, entree: e })),
	);

	it.each(ENTREES)(
		'« $titre » ($cle) s’appuie sur une leçon, un mode et un niveau réels',
		({ entree }) => {
			const { lecon, mode, niveau } = entree.source;
			const lesson = getLessonById(lecon);
			expect(lesson, `leçon « ${lecon} » absente du catalogue`).toBeDefined();
			if (mode)
				expect(
					lesson!.exerciseType.modes?.some((m) => m.id === mode),
					`la leçon « ${lecon} » ne déclare pas le mode « ${mode} »`,
				).toBe(true);
			if (niveau) expect(lesson!.levels, `niveau de « ${lecon} »`).toContain(niveau);
		},
	);

	it.each(ENTREES)('« $titre » se joue sur l’écran de son runner', ({ cle, entree }) => {
		// Une entrée rangée sous un runner de leçon mais jouée en révision (ou l'inverse)
		// n'exercerait pas le module qu'elle prétend couvrir.
		expect(entree.ecran).toBe(cle === 'revision' ? 'revision' : 'lecon');
	});
});
