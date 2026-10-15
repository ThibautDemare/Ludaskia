import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CLES_FIGEAGE, COUVERTURE_FIGEAGE, type EntreeFigeage } from '../e2e/figeage-couverture';
import { getLessonById } from '../src/core/catalog';

/* ============================================================
   Gates du FIGEAGE post-réponse (#543, critères 5 et 1).

   Après une réponse, le widget reste visible mais ne doit plus être manipulable. Deux
   chemins y mènent (« Vérifier » / « Valider », et « Je ne sais pas, montre-moi »), et
   le risque gardé ici est un runner figé à moitié sur l'un des deux. La preuve par
   l'usage est jouée par `e2e/figeage.spec.ts`, entrée par entrée de la table
   `e2e/figeage-couverture.ts`. Ce fichier garde, en lisant les sources :
   - la TABLE elle-même (critère 5) : un runner qui emprunte le chemin de révélation sans y
     être déclaré ne serait joué par aucune spec, et rien ne le dirait ;
   - le GESTE UNIQUE (critère 1) : les deux chemins de chaque runner mènent à la même
     fonction, et aucun runner ni binder ne fige plus par ses propres moyens.

   ── Le signal ──────────────────────────────────────────────────────────────────
   Un module de `src/ui/` qui APPELLE `revelerSolution(` (runners de leçon) ou
   `figerScene(` (la révision, dans `figerCarte`) emprunte le chemin de révélation. On lit
   le source en TEXTE, sans ses commentaires (une mention dans un commentaire n'est pas un
   appel), et on suit un import renommé (`revelerSolution as reveler`), qui ferait sinon
   sortir un runner du périmètre sans bruit. Une DÉFINITION (`function revelerSolution(`)
   n'est pas un appel.

   Les modules qui DÉFINISSENT ces fonctions sont exclus, avec leur raison, et
   l'exclusion est vérifiée (elle tombe si le module ne définit plus la fonction).

   ── Runner du périmètre SANS révélation (décision du mainteneur, 14/10/2026) ────
   Le QCM de leçon (`lecon-qcm`) valide au clic et n'a pas de « Je ne sais pas » : il
   n'appelle aucun point d'entrée de la révélation, mais il est DANS le périmètre de #543
   (son chemin « Valider » doit figer comme les autres). Le détecteur ne peut donc pas le
   réclamer ; il est exigé nommément (`HORS_DETECTEUR`). Dans la table, une clé dont le
   module ne révèle pas n'est acceptée que si TOUTES ses entrées portent `sansRevelation`
   (la raison écrite, jouée par le seul chemin `verifier`) ; sinon c'est une clé périmée.
   Inversement, `sansRevelation` sur un module qui révèle est une incohérence : sa spec
   sauterait un chemin qui existe.

   ── Successeur ─────────────────────────────────────────────────────────────────
   Si une refonte renomme ces points d'entrée, ce gate rougit par le SENS INVERSE (les
   clés de la table ne désignent plus aucun appelant) : c'est voulu. Mettre alors à jour
   `NOMS_REVELATION`, `DEFINISSENT`, `HABILLAGE` et `CHAINAGE`, pas affaiblir le détecteur.

   ── Ce que ces gates ne prouvent pas ────────────────────────────────────────────
   Que le figeage soit bon (critères 2, 4, 7 : e2e/figeage.spec.ts, tests/figeage*.test.ts),
   ni que l'appel à l'habillage soit sur le BON chemin, après le dernier rendu : on lit la
   présence d'un appel, pas l'ordre d'exécution. Un runner qui appellerait `figerQuestion`
   ailleurs que dans sa validation passerait ici, et c'est la spec e2e qui le dirait. De
   même en révision : un format qui oublierait `figerCarte` alors que les autres l'appellent
   n'est vu que par la spec. Enfin, le figeage propre « dérivé du drapeau de tranchée » se
   lit sur des NOMS (`DRAPEAUX_TRANCHEE`) : un drapeau renommé y échappe.
   ============================================================ */

const DIR = 'src/ui';

/** Points d'entrée du chemin de révélation : `revelerSolution` (#467, runners de leçon) et
 *  `figerScene` (#543, successeur de `neutraliserScene`, appelé par la révision). */
const NOMS_REVELATION = ['revelerSolution', 'figerScene'] as const;

/** Modules qui DÉFINISSENT un point d'entrée : ils sont le chemin lui-même, pas un runner
 *  qui l'emprunte. Clé = nom de fichier sans `.ts` ; valeur = fonctions définies + raison. */
const DEFINISSENT: Record<string, { definit: string[]; raison: string }> = {
	'lecon-passer': {
		definit: ['revelerSolution', 'figerQuestion'],
		raison:
			'définit revelerSolution et figerQuestion, et appelle figerScene EN INTERNE pour tous les runners de leçon : c’est le chemin, pas un runner.',
	},
	figeage: {
		definit: ['figerScene'],
		raison: 'définit figerScene, le geste de figeage commun aux deux écrans (#543).',
	},
};

/** Le source sans ses commentaires (`://` épargné : une URL n'est pas un commentaire).
 *  Même règle que `tests/erreurs-journal-gate.test.ts`. */
const sansCommentaires = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Le source appelle-t-il l'une des fonctions `noms` (sous son nom ou sous un alias
 *  d'import) ? Une définition `function X(` n'en est pas un appel. */
function appelle(source: string, noms: readonly string[]): boolean {
	const src = sansCommentaires(source);
	const tous = [...noms];
	for (const nom of noms)
		for (const m of src.matchAll(new RegExp(`\\b${nom}\\s+as\\s+(\\w+)`, 'g'))) tous.push(m[1]);
	return tous.some((nom) => new RegExp(`(?<!\\bfunction\\s+)\\b${nom}\\s*\\(`).test(src));
}

/** Le module appelle-t-il un point d'entrée de la révélation ? */
const appelleRevelation = (source: string): boolean => appelle(source, NOMS_REVELATION);

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
	const noms = NOMS_REVELATION.join(' / ');
	const raisons = entrees.map(raisonSansRevelation);
	if (revele) {
		const n = raisons.filter((r) => r !== undefined).length;
		return n === 0
			? null
			: `« ${cle} » révèle bel et bien (${noms}), mais ${n} de ses ` +
					`entrées portent « sansRevelation » : sa spec sauterait le chemin « Je ne sais pas », ` +
					`qui existe. Retirer « sansRevelation » de ces entrées.`;
	}
	const sansRaison = raisons.filter((r) => !r?.trim()).length;
	return sansRaison === 0 && entrees.length > 0
		? null
		: `La clé « ${cle} » de e2e/figeage-couverture.ts désigne un module qui n'appelle aucun ` +
				`point d'entrée de la révélation (${noms}), et ${sansRaison} de ses entrées n'écrivent ` +
				`pas « sansRevelation » (la raison pour laquelle seul « Vérifier » est joué). Clé ` +
				`périmée : la retirer ; runner du périmètre sans « Je ne sais pas » : écrire la raison ` +
				`sur chaque entrée ; points d'entrée renommés : mettre à jour NOMS_REVELATION.`;
}

/* ---------- Critère 1 : un seul geste, sur les deux chemins ---------- */

/** Habillage de `figerScene` propre à chaque écran : celui que le chemin « Vérifier » /
 *  « Valider » d'un runner appelle. Le chemin « Je ne sais pas » y mène aussi, par
 *  `revelerSolution` en leçon (cf. `CHAINAGE`), directement en révision. */
const HABILLAGE: Record<EntreeFigeage['ecran'], string> = {
	lecon: 'figerQuestion',
	revision: 'figerCarte',
};

/** Ce qui manque au module `cle` pour figer par l'habillage de chacun de ses écrans, ou
 *  `null`. */
function habillageManquant(
	cle: string,
	ecrans: readonly EntreeFigeage['ecran'][],
	source: string,
): string | null {
	const manquants = [...new Set(ecrans)]
		.map((e) => HABILLAGE[e])
		.filter((h) => !appelle(source, [h]));
	return manquants.length === 0
		? null
		: `Le runner « ${cle} » (${DIR}/${cle}.ts) n'appelle pas ${manquants.join(', ')} : sa ` +
				`validation fige par un autre moyen (boucle propre, \`disabled\` posé au rendu, drapeau ` +
				`JS seul) ou ne fige pas, et diverge de « Je ne sais pas » (critère 1 de #543).\n` +
				`Appeler ${manquants.join(', ')}(…) dans la validation, APRÈS le dernier rendu du widget ` +
				`(\`ctrl.verify()\`), avant l'enchaînement.`;
}

/** Corps de la fonction `nom` définie dans `source` (accolades comprises), ou `null`. Le
 *  source est lu sans ses commentaires ; les accolades sont comptées (un `${…}` de gabarit
 *  est équilibré, ce qui suffit aux corps visés ici). */
function corpsDe(source: string, nom: string): string | null {
	const src = sansCommentaires(source);
	const def = new RegExp(`\\bfunction\\s+${nom}\\s*\\(`).exec(src);
	if (!def) return null;
	let i = def.index + def[0].length;
	for (let parens = 1; parens > 0 && i < src.length; i++)
		parens += src[i] === '(' ? 1 : src[i] === ')' ? -1 : 0;
	const debut = src.indexOf('{', i);
	if (debut < 0) return null;
	let fin = debut + 1;
	for (let accolades = 1; accolades > 0 && fin < src.length; fin++)
		accolades += src[fin] === '{' ? 1 : src[fin] === '}' ? -1 : 0;
	return src.slice(debut, fin);
}

/** Les maillons qui font aboutir les deux chemins au même geste : la fonction `fonction`,
 *  définie dans `module`, doit appeler `appelle`. */
const CHAINAGE = [
	{
		module: 'lecon-passer',
		fonction: 'revelerSolution',
		appelle: 'figerQuestion',
		role: '« Je ne sais pas » de leçon → l’habillage de « Vérifier »',
	},
	{
		module: 'lecon-passer',
		fonction: 'figerQuestion',
		appelle: 'figerScene',
		role: 'habillage de leçon → le geste',
	},
	{
		module: 'revision',
		fonction: 'figerCarte',
		appelle: 'figerScene',
		role: 'habillage de révision → le geste',
	},
] as const;

/** Le maillon est-il rompu dans `source` ? Message, ou `null`. */
function maillonRompu(
	source: string,
	m: { module: string; fonction: string; appelle: string; role: string },
): string | null {
	const corps = corpsDe(source, m.fonction);
	if (corps === null)
		return `${DIR}/${m.module}.ts ne définit plus ${m.fonction} : mettre à jour CHAINAGE.`;
	return appelle(corps, [m.appelle])
		? null
		: `${m.fonction} (${DIR}/${m.module}.ts) n'appelle plus ${m.appelle} (${m.role}) : les deux ` +
				`chemins ne figent plus par la même fonction (critère 1 de #543).`;
}

/** Drapeaux « question tranchée » des runners et binders du périmètre (au 15/10/2026). Un
 *  `disabled` ou un `draggable` qui en dérive est un figeage propre, posé au rendu. */
const DRAPEAUX_TRANCHEE = ['frozen', 'tranchee', 'answered', 'validated', 'fige'] as const;
const DRAPEAUX = DRAPEAUX_TRANCHEE.join('|');

/** Les formes d'un figeage PROPRE à un runner ou à un binder : celles que #543 a retirées
 *  (boucles `btn.disabled = true` du QCM et du clic-mot, `inp.disabled = true` du problème,
 *  `btn.disabled = frozen` de l'appariement, `frozen ? drapeau('disabled')` des tuiles).
 *  Les `disabled` qui restent sont de l'ÉTAT DE JEU et ne sont pas visés : bouton de
 *  validation tant que le geste est incomplet (`verif.disabled = !complete`), tuile déjà
 *  posée, case vide (`!rempli ? drapeau('disabled')`). */
const FIGEAGES_PROPRES: { forme: string; motif: RegExp }[] = [
	{
		forme: '`disabled` / `readOnly` posé à vrai',
		motif: /\.(?:disabled|readOnly)\s*=\s*true\b/,
	},
	{
		forme: "`setAttribute('disabled' | 'readonly', …)`",
		motif: /\bsetAttribute\(\s*['"`](?:disabled|readonly)['"`]/,
	},
	{
		forme: '`disabled` / `draggable` dérivé du drapeau de tranchée',
		motif: new RegExp(`\\.(?:disabled|draggable)\\s*=(?!=)[^;\\n]*\\b(?:${DRAPEAUX})\\b`),
	},
	{
		forme: "`drapeau('disabled')` sous condition de tranchée",
		motif: new RegExp(`\\b(?:${DRAPEAUX})\\b[^;?\\n]*\\?\\s*drapeau\\(\\s*['"\`]disabled['"\`]`),
	},
];

/** Les figeages propres trouvés dans le CODE de `source` (commentaires exclus), avec
 *  l'extrait en cause. */
function figeagesPropres(source: string): string[] {
	const src = sansCommentaires(source);
	return FIGEAGES_PROPRES.flatMap(({ forme, motif }) => {
		const m = motif.exec(src);
		return m ? [`${forme} : « ${m[0].trim()} »`] : [];
	});
}

/** Binders de WIDGET montés par les `runners` : modules importés (import de VALEUR) pour une
 *  fonction `bind…`, et dont le contrôleur expose `verify()` (celui qui pose les marques).
 *  Le chrome monté de la même façon (brouillon, « Écouter ») n'a pas de `verify()` : il
 *  reste opérable après figeage (critère 9) et n'est pas visé. Énumérés depuis la source
 *  plutôt que recopiés. `sources` : nom de module sans `.ts` → texte. */
function bindersDe(runners: readonly string[], sources: Record<string, string>): string[] {
	const trouves = new Set<string>();
	for (const runner of runners)
		for (const m of sansCommentaires(sources[runner] ?? '').matchAll(
			/\bimport\s*\{([^}]*)\}\s*from\s*['"]\.\/([\w-]+)['"]/g,
		))
			if (
				/\bbind[A-Z]\w*/.test(m[1]) &&
				/\bverify\s*\(/.test(sansCommentaires(sources[m[2]] ?? ''))
			)
				trouves.add(m[2]);
	return [...trouves].sort();
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
		{
			cas: 'appel direct de figerScene (révision)',
			src: "figerScene({ scene: stage, classeFige: 'rev-stage--fige', apres: '#revAfter' });",
		},
		{ cas: 'appel sur plusieurs lignes', src: 'revelerSolution (\n\t{\n\t\troot,\n\t});' },
		{
			cas: 'appel sous un alias d’import',
			src: "import { revelerSolution as reveler } from './lecon-passer';\nreveler({ root });",
		},
		{
			cas: 'appel de figerScene sous un alias d’import',
			src: "import { figerScene as figer } from './figeage';\nfiger({ scene });",
		},
	])('détecte : $cas', ({ src }) => {
		expect(appelleRevelation(src)).toBe(true);
	});

	it.each([
		{ cas: 'mention dans un commentaire ligne', src: '// revelerSolution({ root }) plus tard' },
		{ cas: 'mention dans un commentaire bloc', src: '/* cf. figerScene( */\nconst a = 1;' },
		{ cas: 'définition seule', src: 'export function figerScene(o: FigeageOpts): void {}' },
		{ cas: 'un nom qui le prolonge', src: 'revelerSolutionDifferee({ root });' },
		{ cas: 'un nom qui le précède', src: 'prerevelerSolution({ root });' },
	])('ne détecte pas : $cas', ({ src }) => {
		expect(appelleRevelation(src)).toBe(false);
	});

	it('un runner qui révèle sans être déclaré fait rougir le gate (échec du critère 5)', () => {
		const sources = {
			'lecon-nouveau': "import { revelerSolution } from './lecon-passer';\nrevelerSolution({});",
			'lecon-tuiles': 'revelerSolution({});',
			revision: 'function figerCarte(stage) { figerScene({ scene: stage }); }',
			'lecon-passer':
				'export function figerQuestion(root) { figerScene({ scene: root }); }\n' +
				'export function revelerSolution(o) { figerQuestion(o.root); }',
			figeage: 'export function figerScene(o) {}',
		};
		// Les modules qui définissent (`lecon-passer`, `figeage`) ne sont jamais réclamés ;
		// `lecon-tuiles` est déclaré ; la révision, qui appelle `figerScene`, est vue.
		expect(appelants(sources)).toEqual(['lecon-nouveau', 'lecon-tuiles', 'revision']);
		expect(nonDeclares(sources, ['lecon-tuiles', 'revision'])).toEqual(['lecon-nouveau']);
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
		// 9 runners de leçon + la révision au 15/10/2026. Un plancher plutôt qu'une égalité :
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
			for (const nom of definit)
				expect(
					new RegExp(`\\bfunction\\s+${nom}\\s*\\(`).test(sansCommentaires(src)),
					`${DIR}/${module}.ts ne définit plus ${nom} : son exclusion ne tient plus ` +
						`(motif : ${raison}).`,
				).toBe(true);
		}
	});
});

describe('Critère 1, témoins : habillage appelé, maillons, figeage propre (#543)', () => {
	// Sans ces témoins, une règle devenue aveugle laisserait la suite verte : le code réel
	// la respecte déjà.
	it.each([
		{
			cas: 'validation qui fige par l’habillage',
			ecrans: ['lecon'] as const,
			src: 'ctrl.verify();\nfigerQuestion(sheets());\nwireNext(actions);',
		},
		{
			cas: 'habillage importé sous un alias',
			ecrans: ['lecon'] as const,
			src: "import { figerQuestion as figer } from './lecon-passer';\nfiger(sheets());",
		},
		{
			cas: 'révision qui fige par son habillage',
			ecrans: ['revision'] as const,
			src: 'function figerCarte(s) { figerScene({ scene: s }); }\nfigerCarte(stage);',
		},
	])('habillage présent : $cas', ({ ecrans, src }) => {
		expect(habillageManquant('lecon-x', ecrans, src)).toBeNull();
	});

	it.each([
		{
			cas: 'runner qui ne fige que par « Je ne sais pas » (drapeau JS seul sur « Vérifier »)',
			ecrans: ['lecon'] as const,
			src: 'ctrl.verify();\nfrozen = true;\nrevelerSolution({ root });',
		},
		{
			cas: 'runner qui fige par sa propre boucle',
			ecrans: ['lecon'] as const,
			src: "for (const b of root.querySelectorAll('button')) b.disabled = true;",
		},
		{
			cas: 'habillage cité en commentaire seulement',
			ecrans: ['lecon'] as const,
			src: '// figerQuestion(sheets()) est appelé plus bas\nctrl.verify();',
		},
		{
			cas: 'révision dont les chemins ne passent plus par figerCarte',
			ecrans: ['revision'] as const,
			src: "function figerCarte(s) { figerScene({ scene: s }); }\nstage.classList.add('rev-stage--fige');",
		},
		{
			cas: 'habillage de l’autre écran',
			ecrans: ['revision'] as const,
			src: 'figerQuestion(sheets());',
		},
	])('habillage manquant : $cas', ({ ecrans, src }) => {
		expect(habillageManquant('lecon-x', ecrans, src)).not.toBeNull();
	});

	const passer = (corpsReveler: string) =>
		'export function figerQuestion(root: ParentNode): void {\n\tmasquerDecision(root);\n' +
		"\tfigerScene({ scene: root.querySelector('.sprint-stage'), classeFige: 'lecon-fige', apres: '' });\n}\n" +
		`export function revelerSolution(o: RevelationOpts): void {\n${corpsReveler}\n\twireNext(o.actions, { html: html\`\${o.repHTML}\` });\n}\n` +
		'export function apres(): void { figerQuestion(x); }';
	const REVELER = CHAINAGE[0];

	it('maillon tenu : revelerSolution passe par figerQuestion', () => {
		expect(maillonRompu(passer('\tfigerQuestion(o.root);'), REVELER)).toBeNull();
	});

	it.each([
		{
			cas: 'revelerSolution fige par sa propre boucle',
			corps: "\tfor (const el of o.root.querySelectorAll('button, input')) el.disabled = true;",
		},
		{
			cas: 'figerQuestion n’est plus cité que dans un commentaire',
			corps: '\t// figerQuestion(o.root) : retiré\n\to.root.classList.add("lecon-fige");',
		},
	])('maillon rompu : $cas (l’appel d’une AUTRE fonction du module ne compte pas)', ({ corps }) => {
		// `apres()`, définie plus bas, appelle bien figerQuestion : le corps lu doit s'arrêter
		// à la fin de revelerSolution, sinon ce témoin passerait à tort.
		expect(maillonRompu(passer(corps), REVELER)).not.toBeNull();
	});

	it('maillon rompu : la fonction n’existe plus', () => {
		expect(maillonRompu('export function autre() {}', REVELER)).not.toBeNull();
	});

	it.each([
		{ cas: 'boucle propre (QCM, clic-mot)', src: 'btns.forEach((b) => { b.disabled = true; });' },
		{ cas: 'champ du problème désactivé', src: 'inp.disabled=true;' },
		{ cas: 'champ mis en lecture seule par le runner', src: 'inp.readOnly = true;' },
		{ cas: 'attribut posé', src: "el.setAttribute('disabled', '');" },
		{ cas: 'disabled dérivé du drapeau (appariement)', src: 'btn.disabled = frozen;' },
		{
			cas: 'draggable dérivé du drapeau (appariement)',
			src: "btn.draggable = !frozen && side === 'g';",
		},
		{
			cas: 'disabled posé au rendu sous condition de tranchée (tuiles)',
			src: "const dis = !rempli || frozen ? drapeau('disabled') : '';",
		},
		{
			cas: 'disabled posé au rendu, drapeau d’une option (tuiles)',
			src: "const attrs = opts.used || opts.frozen ? drapeau('disabled') : attribut('draggable', 'true');",
		},
		{
			cas: 'disabled dans le gabarit, drapeau d’un runner',
			src: "html`<button aria-label=\"${label}\"${tranchee ? drapeau('disabled') : ''}>`",
		},
	])('figeage propre détecté : $cas', ({ src }) => {
		expect(figeagesPropres(src)).not.toEqual([]);
	});

	it.each([
		{ cas: 'bouton de validation selon le geste', src: 'verif.disabled = !complete;' },
		{
			cas: 'bouton de validation gardé par le drapeau',
			src: '} else if (!tranchee) verif.disabled = !complete;',
		},
		{
			cas: 'bouton de validation en révision',
			src: "{ variant: 'revision', onState: (complete) => (verif.disabled = !complete) },",
		},
		{ cas: 'case vide (état du jeu)', src: "const dis = !rempli ? drapeau('disabled') : '';" },
		{
			cas: 'tuile déjà posée (état du jeu)',
			src: "const attrs = opts.used ? drapeau('disabled') : attribut('draggable', 'true');",
		},
		{
			cas: 'réarmement',
			src: "(sheets().querySelector('#dgVerify') as HTMLButtonElement).disabled = false;",
		},
		{ cas: 'lecture de l’état', src: 'if (btn.disabled === true || frozen) return;' },
		{ cas: 'glisser selon le côté', src: "btn.draggable = side === 'g';" },
		{ cas: 'mention en commentaire', src: '// avant #543 : btn.disabled = true;\nconst a = 1;' },
	])('pas un figeage propre : $cas', ({ src }) => {
		expect(figeagesPropres(src)).toEqual([]);
	});

	it('binders énumérés : widget à verify() importé par valeur ; ni chrome, ni import de type', () => {
		const sources = {
			'lecon-x':
				"import { bindWidget } from './widget';\nimport { bindBrouillon } from './brouillon';\n" +
				"import type { bindAutre } from './autre';",
			widget: 'export function bindWidget() { return { verify() { return true; } }; }',
			brouillon: 'export function bindBrouillon() {}',
			autre: 'export function bindAutre() { return { verify() { return true; } }; }',
		};
		expect(bindersDe(['lecon-x'], sources)).toEqual(['widget']);
	});
});

describe('Critère 1 : les deux chemins figent par la même fonction (#543)', () => {
	it.each(CLES_FIGEAGE.map((cle) => ({ cle })))(
		'le runner « $cle » fige par l’habillage de son écran',
		({ cle }) => {
			const ecrans = COUVERTURE_FIGEAGE[cle].map((e) => e.ecran);
			expect(SOURCES[cle], `${DIR}/${cle}.ts introuvable`).toBeDefined();
			expect(habillageManquant(cle, ecrans, SOURCES[cle])).toBeNull();
		},
	);

	it.each(CHAINAGE.map((m) => ({ ...m })))('$fonction appelle $appelle ($role)', (maillon) => {
		expect(SOURCES[maillon.module], `${DIR}/${maillon.module}.ts introuvable`).toBeDefined();
		expect(maillonRompu(SOURCES[maillon.module], maillon)).toBeNull();
	});

	const BINDERS = bindersDe(CLES_FIGEAGE, SOURCES);

	it('les binders des runners sont bien énumérés (garde contre une liste vide)', () => {
		// Les quatre que l'issue nomme ; un binder de plus ne casse pas ce test.
		expect(BINDERS).toEqual(
			expect.arrayContaining([
				'appariement',
				'clic-mot-interaction',
				'segment-mot-interaction',
				'tuile-interaction',
			]),
		);
	});

	it.each([...CLES_FIGEAGE, ...BINDERS].map((module) => ({ module })))(
		'« $module » ne fige pas par ses propres moyens',
		({ module }) => {
			expect(SOURCES[module], `${DIR}/${module}.ts introuvable`).toBeDefined();
			expect(
				figeagesPropres(SOURCES[module] ?? ''),
				`${DIR}/${module}.ts désarme lui-même son widget : c'est un figeage propre qui revient ` +
					`(critère 1 de #543). Le binder MARQUE (✓/✗, verdicts) ; le runner fige par ` +
					`${HABILLAGE.lecon} / ${HABILLAGE.revision}, sur ses deux chemins. Un \`disabled\` ` +
					`d'ÉTAT DE JEU (bouton de validation, tuile posée, case vide) ne dérive pas du drapeau ` +
					`de tranchée (${DRAPEAUX_TRANCHEE.join(', ')}).`,
			).toEqual([]);
		},
	);
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
