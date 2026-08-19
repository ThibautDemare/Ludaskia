import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';

/* ============================================================
   Gate du préfixe `ludaskia_` sur les clés de stockage (#597).

   `appKeys()` (src/core/storage.ts) ne retient que les clés dont le nom CONTIENT
   `ludaskia_`, et c'est ce filtre qui alimente l'export de sauvegarde du parent et la
   suppression d'un profil. Une clé nommée hors convention fonctionne pourtant
   parfaitement : `lsGet`/`lsSet` la préfixent par le profil actif comme les autres,
   l'appli lit et écrit sans la moindre erreur.

   Le défaut est donc INVISIBLE au développement, et sa conséquence arrive des mois
   plus tard, chez quelqu'un d'autre : la donnée est absente de la sauvegarde, et elle
   SURVIT à la suppression du profil. Le parent restaure et constate qu'une partie de
   la progression a disparu — ou, pire, qu'un profil supprimé a laissé des traces.

   Aucune clé n'est en faute aujourd'hui (mesure du 19/08/2026 : 38 déclarations,
   toutes conformes). Ce gate ne corrige donc rien, il empêche la régression — même
   profil que les contraintes d'architecture d'ESLint (#579).

   ── Comment il s'y prend ──────────────────────────────────────────────────────
   Lecture TEXTE de `src/` (pas de DOM, quelques millisecondes), en deux filets qui
   se rattrapent l'un l'autre :

   1. DÉCLARATIONS — toute constante nommée comme une clé (`*_KEY`, mais aussi `CLE_*`
      et les listes `CLES_*`, que le dépôt emploie aussi) doit valoir un littéral
      commençant par `ludaskia_`. Attrape la clé écrite hors convention même si elle
      n'est pas encore branchée.
   2. SITES D'APPEL — pour chaque appel aux helpers de stockage, le premier argument
      doit se ramener à une clé conforme : soit un littéral préfixé, soit une
      constante conforme mentionnée dans l'expression (`uuid + '/' + STARS_KEY`).
      Attrape la clé écrite en dur au vol (`lsSet('truc', …)`), que le filet 1 ne voit
      pas, et la clé importée d'un module qui ne la déclare pas comme telle.

   Ce que ça ne prouve pas : que la valeur STOCKÉE soit correcte, ni qu'une clé
   nouvelle soit versionnée/migrée. Et le filet 2 s'arrête là où le code devient
   indirect (variable locale, fonction constructrice de clé) : ces cas sont listés
   dans INDIRECTIONS, chacun avec une PREUVE qui doit continuer à se vérifier dans le
   fichier. Une exception y est une dette relue, pas un trou — si quelqu'un réécrit
   `runsKey` sans le préfixe, c'est la preuve qui tombe, pas le silence qui gagne.
   ============================================================ */

const PREFIXE = 'ludaskia_';

/** Helpers de `core/storage.ts` dont le PREMIER argument est une clé. Les variantes
 *  « Raw » reçoivent une clé RÉELLE (déjà préfixée par le profil) : l'expression y
 *  mentionne quand même la constante de clé, c'est ce qu'on vérifie. */
const HELPERS = [
	'lsGet',
	'lsSet',
	'lsSetQuiet',
	'lsRemoveQuiet',
	'lsGetRaw',
	'lsGetItemRaw',
	'lsSetRaw',
	'lsRemoveRaw',
];

/** Fonctions maison qui reçoivent une clé en premier argument et la repassent aux
 *  helpers : leurs sites d'appel sont vérifiés comme ceux des helpers, ce qui rend
 *  inutile de suivre la valeur à l'intérieur. Le test vérifie qu'elles existent
 *  toujours (sans quoi l'entrée ne garderait plus rien). */
const PASSE_PLATS: Record<string, string> = {
	migrateMapNamespacing:
		'src/core/progress.ts — migration de namespacing appliquée à quatre cartes de progression, la clé lui est passée en paramètre.',
};

/** Le fichier qui DÉFINIT les helpers : ses `lsGet(key: string, …)` sont les
 *  signatures, pas des sites d'appel. */
const MODULE_DES_HELPERS = 'src/core/storage.ts';

type Indirection = {
	fichier: string;
	/** Expression telle qu'elle apparaît en premier argument. */
	expression: string;
	raison: string;
	/** Ce qui garantit encore le préfixe, à retrouver dans le fichier. Une exception
	 *  sans preuve vérifiable serait une simple mise en sourdine. */
	preuve: RegExp;
};

const INDIRECTIONS: Indirection[] = [
	{
		fichier: 'src/core/progress.ts',
		expression: 'runsKey(mode, niveauActif())',
		raison: 'clé construite : le classement des essais est rangé par mode ET par niveau scolaire.',
		preuve: /const RUNS_KEY = \(m: string\) => `ludaskia_runs_\$\{m\}`/,
	},
	{
		fichier: 'src/core/progress.ts',
		expression: 'runsKey(mode, niveau)',
		raison: 'même clé construite, parcourue sur tous les niveaux (compteurs d’effort globaux).',
		preuve: /function runsKey\([^)]*\): string \{\s*return `\$\{RUNS_KEY\(mode\)\}@\$\{niveau\}`/,
	},
	{
		fichier: 'src/core/progress.ts',
		expression: 'storageKey',
		raison: `paramètre de migrateMapNamespacing : ce sont ses SITES D'APPEL qui portent la clé, et ils sont vérifiés comme les autres (cf. PASSE_PLATS).`,
		preuve: /function migrateMapNamespacing\(storageKey: string\)/,
	},
	{
		fichier: 'src/core/progress.ts',
		expression: 'legacyKey',
		raison: 'variable locale de migration : ancienne clé sans namespace de niveau.',
		preuve: /const legacyKey = RUNS_KEY\(mode\)/,
	},
	{
		fichier: 'src/core/engagement.ts',
		expression: 'reelle',
		raison:
			'clé RÉELLE recomposée (préfixe de profil + clé), pour détecter un premier lancement sans changer de profil actif. Les clés viennent de CLES_PROFIL, vérifiée comme déclaration.',
		preuve: /for \(const cle of CLES_PROFIL\) \{\s*const reelle = prefixe \+ cle;/,
	},
	{
		fichier: 'src/core/profiles.ts',
		expression: 'k',
		raison:
			"clé issue d'appKeys() : elle contient le préfixe par construction, c'est le filtre lui-même qui l'a retenue.",
		preuve: /appKeys\(\)\.forEach\(\(k\) =>/,
	},
	{
		fichier: 'src/core/profiles.ts',
		expression: 'prefix + rel',
		raison:
			"réécriture d'un profil : rel est une clé RELATIVE produite par profileDataRelative (préfixe de profil retiré d'une clé d'appKeys()). À l'IMPORT, ces clés viennent d'un fichier extérieur — hors de portée d'un gate statique, c'est une validation d'entrée.",
		preuve: /function writeProfileData\(prefix: string, data: Record<string, string>\)/,
	},
	{
		fichier: 'src/core/progress.ts',
		expression: 'cible',
		raison: 'variable locale de migration : clé de destination, namespacée par niveau.',
		preuve: /const cible = runsKey\(mode, NIVEAU_LEGACY\)/,
	},
];

/* ---------- Lecture des sources ---------- */

function fichiersTs(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir)) {
		const p = `${dir}/${e}`;
		if (statSync(p).isDirectory()) out.push(...fichiersTs(p));
		else if (p.endsWith('.ts')) out.push(p);
	}
	return out;
}

/** Retire les commentaires en PRÉSERVANT les sauts de ligne, pour que les numéros de
 *  ligne rapportés restent ceux du fichier. Un `lsSet(` cité dans un commentaire
 *  d'en-tête ne doit pas compter pour un site d'appel — le dépôt en contient
 *  plusieurs. Fait à la main plutôt qu'à coups de regex, parce qu'une regex sur `//`
 *  casse sur les `https://` des liens. */
function sansCommentaires(src: string): string {
	let out = '';
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		const suivant = src[i + 1];
		if (c === '/' && suivant === '/') {
			while (i < src.length && src[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && suivant === '*') {
			i += 2;
			while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
				if (src[i] === '\n') out += '\n';
				i++;
			}
			i += 2;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			const guillemet = c;
			out += c;
			i++;
			while (i < src.length && src[i] !== guillemet) {
				if (src[i] === '\\') {
					out += src[i] + (src[i + 1] ?? '');
					i += 2;
					continue;
				}
				out += src[i];
				i++;
			}
			out += guillemet;
			i++;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

/** Premier argument d'un appel dont la parenthèse ouvrante est à `debut` : on suit
 *  l'imbrication pour ne pas couper `runsKey(mode, niveauActif())` en son milieu. */
function premierArgument(src: string, debut: number): string {
	let profondeur = 0;
	let i = debut;
	let arg = '';
	for (; i < src.length; i++) {
		const c = src[i];
		if (c === '(' || c === '[' || c === '{') profondeur++;
		else if (c === ')' || c === ']' || c === '}') {
			profondeur--;
			if (profondeur === 0) break;
		} else if (c === ',' && profondeur === 1) break;
		if (profondeur >= 1 && !(profondeur === 1 && c === '(' && i === debut)) arg += c;
	}
	return arg.trim();
}

const FICHIERS = fichiersTs('src');
const SOURCES = new Map<string, string>(
	FICHIERS.map((f) => [f, sansCommentaires(readFileSync(f, 'utf8'))]),
);

/* ---------- Filet 1 : les déclarations ---------- */

/** Constantes MAJUSCULES valant un littéral, un gabarit, une flèche qui en rend un
 *  (`RUNS_KEY = (m) => \`ludaskia_runs_${m}\``), ou un TABLEAU de littéraux. */
const CONSTANTES = new Map<string, { valeurs: string[]; fichier: string }>();
for (const [fichier, src] of SOURCES) {
	const decl =
		/\b(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)\s*(?::[^=]+)?=>\s*)?(\[[^\]]*\]|(['"`])[^'"`]*\3)/g;
	for (const m of src.matchAll(decl)) {
		const valeurs = [...m[2].matchAll(/(['"`])([^'"`]*)\1/g)].map((x) => x[2]);
		if (valeurs.length) CONSTANTES.set(m[1], { valeurs, fichier });
	}
}

/* Ce qui « ressemble à une clé » — et pourquoi ce n'est pas seulement `*_KEY` : le
   dépôt déclare aussi `CLE_GLOBALE` et une liste `CLES_PROFIL`. S'en tenir au suffixe
   laisserait passer ces deux-là, alors que ce sont exactement des clés de stockage. */
const NOM_DE_CLE = /_KEY$|^CLES?_/;
const CLES_DECLAREES = [...CONSTANTES]
	.filter(([nom]) => NOM_DE_CLE.test(nom))
	.flatMap(([nom, { valeurs, fichier }]) => valeurs.map((valeur) => ({ nom, valeur, fichier })));

describe('Préfixe ludaskia_ des clés de stockage (#597)', () => {
	it('la raison d’être du gate tient toujours (appKeys filtre sur le préfixe)', () => {
		// Si ce filtre change, ce n'est plus la même convention qu'on garde : mieux vaut
		// que le gate échoue et qu'on le relise, plutôt qu'il continue à vérifier une
		// règle que le code n'applique plus.
		expect(
			SOURCES.get(MODULE_DES_HELPERS),
			`appKeys() ne filtre plus sur « ${PREFIXE} » : la convention gardée ici a changé de sens.`,
		).toMatch(/function appKeys\(\)[\s\S]*?includes\('ludaskia_'\)/);
	});

	it('le scan trouve bien les clés (garde contre un gate à vide)', () => {
		// Une convention de nommage qui change (ou un scan cassé) rendrait ce test vert
		// en n'examinant plus rien du tout.
		expect(FICHIERS.length).toBeGreaterThan(100);
		expect(
			CLES_DECLAREES.length,
			'moins de 30 clés trouvées : la façon de les déclarer a changé, ce gate ne garde plus rien.',
		).toBeGreaterThanOrEqual(30);
	});

	it.each(CLES_DECLAREES)('$nom = $valeur est préfixée', ({ nom, valeur, fichier }) => {
		expect(
			valeur.startsWith(PREFIXE),
			`${fichier} : la clé ${nom} vaut « ${valeur} », sans le préfixe « ${PREFIXE} ».\n` +
				`Conséquence : cette donnée sera ABSENTE de l'export de sauvegarde du parent, et elle ` +
				`SURVIVRA à la suppression du profil (appKeys() ne la voit pas).\n` +
				`Rien ne cassera à l'usage — c'est ce qui rend ce défaut invisible en relecture.`,
		).toBe(true);
	});
});

/* ---------- Filet 2 : les sites d'appel ---------- */

type Site = { fichier: string; ligne: number; helper: string; arg: string };

function sites(): Site[] {
	const out: Site[] = [];
	const noms = [...HELPERS, ...Object.keys(PASSE_PLATS)];
	for (const [fichier, src] of SOURCES) {
		if (fichier === MODULE_DES_HELPERS) continue; // les signatures, pas des appels
		const motif = new RegExp(`\\b(function\\s+)?(${noms.join('|')})\\s*\\(`, 'g');
		for (const m of src.matchAll(motif)) {
			if (m[1]) continue; // la DÉCLARATION d'un passe-plat, pas un appel
			const debut = m.index! + m[0].length - 1;
			out.push({
				fichier,
				ligne: src.slice(0, m.index!).split('\n').length,
				helper: m[2],
				arg: premierArgument(src, debut),
			});
		}
	}
	return out;
}

const SITES = sites();

/** Une expression est prouvée conforme si elle mentionne une constante de clé
 *  conforme, ou si elle contient un littéral préfixé. */
function conforme(arg: string): boolean {
	for (const m of arg.matchAll(/\b([A-Z][A-Z0-9_]*)\b/g)) {
		const c = CONSTANTES.get(m[1]);
		if (c && c.valeurs.every((v) => v.startsWith(PREFIXE))) return true;
	}
	// `includes` et non `startsWith`, ICI seulement : une clé RÉELLE est composée
	// (`${prefixeDuProfil}ludaskia_activity`), et c'est exactement le critère
	// qu'applique `appKeys()`. La DÉCLARATION, elle, reste tenue au vrai préfixe.
	return arg.includes(PREFIXE);
}

const indirection = (s: Site) =>
	INDIRECTIONS.find((i) => i.fichier === s.fichier && i.expression === s.arg);

describe('Clés passées aux helpers de stockage (#597)', () => {
	it('le scan trouve bien les sites d’appel (garde contre un gate à vide)', () => {
		expect(
			SITES.length,
			'moins de 60 sites d’appel : le nom des helpers a changé, ou le scan est cassé.',
		).toBeGreaterThanOrEqual(60);
	});

	it.each(SITES.filter((s) => !conforme(s.arg)).map((s) => [`${s.fichier}:${s.ligne}`, s]))(
		'%s : l’indirection est déclarée et prouvée',
		(_libelle, s) => {
			const i = indirection(s);
			expect(
				i,
				`${s.fichier}:${s.ligne} — ${s.helper}(${s.arg}) : impossible de prouver que cette clé ` +
					`porte le préfixe « ${PREFIXE} ».\n` +
					`Si c'est une clé littérale, la préfixer. Si elle est construite ou passée par une ` +
					`variable, ajouter une entrée dans INDIRECTIONS avec sa raison ET une preuve à ` +
					`retrouver dans le fichier.\n` +
					`Une clé non préfixée manque à l'export de sauvegarde et survit à la suppression du profil.`,
			).toBeTruthy();
			expect(
				SOURCES.get(i!.fichier),
				`L'indirection « ${i!.expression} » (${i!.fichier}) n'est plus prouvée : ${i!.preuve}\n` +
					`Motif d'origine : ${i!.raison}\n` +
					`Le code a changé — revérifier que la clé est toujours préfixée, puis mettre la preuve à jour.`,
			).toMatch(i!.preuve);
		},
	);

	it('aucune indirection ne décrit un cas disparu', () => {
		// Une exception dont le site d'appel n'existe plus resterait à décrire une dette
		// imaginaire, et masquerait le jour où la même expression réapparaît ailleurs.
		for (const i of INDIRECTIONS)
			expect(
				SITES.some((s) => s.fichier === i.fichier && s.arg === i.expression),
				`L'indirection « ${i.expression} » (${i.fichier}) ne correspond à aucun site d'appel : ` +
					`la retirer.`,
			).toBe(true);
	});

	it('les passe-plats déclarés existent encore', () => {
		for (const [nom, raison] of Object.entries(PASSE_PLATS))
			expect(
				[...SOURCES.values()].some((src) => new RegExp(`function ${nom}\\(`).test(src)),
				`Le passe-plat ${nom} n'existe plus (${raison}) : retirer l'entrée, sinon le gate ` +
					`vérifie les sites d'appel d'une fonction disparue.`,
			).toBe(true);
	});
});
