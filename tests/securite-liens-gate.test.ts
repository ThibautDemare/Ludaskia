// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/* Filets de sécurité de la séance partagée par lien (#734).

   Un lien partagé porte des données que n'importe qui peut forger, et ces données
   finissent affichées. Deux filets, indépendants l'un de l'autre :

   - Critère 38 — la règle ESLint d'échappement (`eslint.config.js`) ne se limite
     plus à `.innerHTML` : `outerHTML` et `insertAdjacentHTML` injectent du balisage
     de la même façon, et une règle qui ne les voit pas laisse une porte ouverte à
     qui les écrirait. On lint des extraits en mémoire avec la configuration RÉELLE
     du dépôt, sous `src/ui/` et sous `src/core/` (deux blocs de configuration
     distincts l'appliquent).

   - Critère 42 — une CSP en `<meta>` dans `app.html` impose `script-src 'self'`
     sans `'unsafe-inline'` : même si un échappement saute, un `onerror` injecté ne
     s'exécute pas. Partie STATIQUE seulement (la balise, sa place, son contenu, et
     l'absence de tout ce que la CSP bloquerait en silence) ; la violation à
     l'exécution relève de la suite e2e.

   Chaque détecteur a ses témoins : un cas qu'il DOIT refuser et un cas qu'il doit
   laisser passer. Sans eux, un test vert ne prouverait pas que le détecteur sait
   rougir. */

const RACINE = process.cwd();

// ---------------------------------------------------------------------------
// Critère 38 — règle d'échappement ESLint
// ---------------------------------------------------------------------------

/* Déclarations communes aux extraits : sans elles, `no-undef` et consorts
   bruiteraient. On ne compte de toute façon que `no-restricted-syntax`. */
const PRELUDE = [
	'declare const x: string;',
	'declare const s: string;',
	'declare const el: HTMLElement;',
	'declare const frag: { balisage: string };',
	'declare function html(...morceaux: unknown[]): { balisage: string };',
].join('\n');

interface CasLint {
	nom: string;
	code: string;
}

const REFUSES: CasLint[] = [
	{ nom: 'outerHTML ← littéral gabarit', code: 'el.outerHTML = `<p>${x}</p>`;' },
	{ nom: 'outerHTML ← variable chaîne', code: 'el.outerHTML = s;' },
	{
		nom: 'insertAdjacentHTML ← littéral gabarit',
		code: "el.insertAdjacentHTML('beforeend', `<p>${x}</p>`);",
	},
	{ nom: 'insertAdjacentHTML ← variable chaîne', code: "el.insertAdjacentHTML('beforeend', s);" },
	// Non-régression : le cas d'origine de #614 reste refusé.
	{ nom: 'innerHTML ← littéral gabarit (non-régression)', code: 'el.innerHTML = `<p>${x}</p>`;' },
	// Accès CALCULÉ : même propriété, autre nœud d'AST (`property.value` au lieu de
	// `property.name`). Une règle qui ne lit que le nom le laisse passer.
	{ nom: "el['outerHTML'] ← variable chaîne (accès calculé)", code: "el['outerHTML'] = s;" },
	{ nom: "el['innerHTML'] ← variable chaîne (accès calculé)", code: "el['innerHTML'] = s;" },
	{
		nom: "el['insertAdjacentHTML'] ← variable chaîne (accès calculé)",
		code: "el['insertAdjacentHTML']('beforeend', s);",
	},
	// Accumulation : `+=` injecte autant que `=`. Une règle restreinte à
	// `operator='='` le laisse passer.
	{ nom: 'innerHTML += variable chaîne (accumulation)', code: 'el.innerHTML += s;' },
	{ nom: 'outerHTML += variable chaîne (accumulation)', code: 'el.outerHTML += s;' },
];

const ACCEPTES: CasLint[] = [
	{ nom: 'outerHTML ← html`…`.balisage', code: 'el.outerHTML = html`<p>${x}</p>`.balisage;' },
	// L'accès calculé est refusé pour une chaîne, pas pour un SafeHtml : garde contre
	// une branche « calculée » qui oublierait l'exemption `.balisage`.
	{
		nom: "el['outerHTML'] ← frag.balisage (accès calculé)",
		code: "el['outerHTML'] = frag.balisage;",
	},
	{
		nom: 'insertAdjacentHTML ← frag.balisage',
		code: "el.insertAdjacentHTML('beforeend', frag.balisage);",
	},
	// Garde contre une règle trop large (`/^insertAdjacent/`) : insérer du TEXTE est
	// sûr par construction, rien à échapper.
	{
		nom: 'insertAdjacentText ← chaîne (texte, pas balisage)',
		code: "el.insertAdjacentText('beforeend', s);",
	},
	// Non-régression : les deux formes admises par #614.
	{ nom: 'innerHTML ← frag.balisage (non-régression)', code: 'el.innerHTML = frag.balisage;' },
	{ nom: "innerHTML ← '' (vidage, non-régression)", code: "el.innerHTML = '';" },
];

const DOSSIERS = ['src/ui', 'src/core'] as const;

let eslint: ESLint;

beforeAll(() => {
	eslint = new ESLint({ cwd: RACINE });
});

interface Verdict {
	refus: string[];
	parasites: string[];
}

async function linter(dossier: string, code: string): Promise<Verdict> {
	const resultats = await eslint.lintText(`${PRELUDE}\n${code}\n`, {
		filePath: join(RACINE, dossier, '__gate-echappement__.ts'),
	});
	const messages = resultats.flatMap((r) => r.messages);
	return {
		refus: messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message),
		// Un message sans règle = fichier ignoré ou erreur d'analyse : dans ce cas
		// « zéro refus » ne prouverait rien, il faut le voir.
		parasites: messages.filter((m) => m.fatal === true || m.ruleId === null).map((m) => m.message),
	};
}

describe("critère 38 : la règle d'échappement couvre outerHTML et insertAdjacentHTML", () => {
	for (const dossier of DOSSIERS) {
		describe(`sous ${dossier}/`, () => {
			it.each(REFUSES)('refuse : $nom', async ({ code }) => {
				const { refus, parasites } = await linter(dossier, code);
				expect(parasites, `le lint de l'extrait n'a pas tourné normalement`).toEqual([]);
				expect(
					refus.length,
					`\`${code}\` sous ${dossier}/ passe le lint : la règle d'échappement doit le refuser`,
				).toBeGreaterThan(0);
			});

			it.each(ACCEPTES)('accepte : $nom', async ({ code }) => {
				const { refus, parasites } = await linter(dossier, code);
				expect(parasites, `le lint de l'extrait n'a pas tourné normalement`).toEqual([]);
				expect(
					refus,
					`\`${code}\` sous ${dossier}/ est refusé alors que la valeur est un SafeHtml (ou du texte)`,
				).toEqual([]);
			});
		});
	}
});

// ---------------------------------------------------------------------------
// Critère 42 — CSP de app.html
// ---------------------------------------------------------------------------

function sansCommentaires(page: string): string {
	return page.replace(/<!--[\s\S]*?-->/g, '');
}

const PAGE = sansCommentaires(readFileSync(join(RACINE, 'app.html'), 'utf8'));

const META_CSP = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i;
const ATTR_CONTENT = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/** Directives d'une politique, noms et sources en minuscules (les mots-clés CSP
 *  sont insensibles à la casse). Directive en double : la PREMIÈRE l'emporte,
 *  comme dans le navigateur. */
function directives(politique: string): Map<string, string[]> {
	const carte = new Map<string, string[]>();
	for (const brute of politique.split(';')) {
		const [nom, ...sources] = brute.trim().toLowerCase().split(/\s+/).filter(Boolean);
		if (nom !== undefined && !carte.has(nom)) carte.set(nom, sources);
	}
	return carte;
}

/** Ce qui empêche la politique de bloquer un script ou un gestionnaire injecté
 *  (liste vide = contrat tenu). */
function defautsCsp(politique: string): string[] {
	const carte = directives(politique);
	const defauts: string[] = [];
	const nomEffectif = carte.has('script-src') ? 'script-src' : 'default-src';
	const effective = carte.get(nomEffectif);
	if (effective === undefined) {
		defauts.push('ni `script-src` ni `default-src` : les scripts ne sont pas restreints');
	} else {
		if (!effective.includes("'self'")) defauts.push(`\`${nomEffectif}\` ne contient pas 'self'`);
		for (const interdit of ["'unsafe-inline'", "'unsafe-eval'"]) {
			if (effective.includes(interdit)) defauts.push(`\`${nomEffectif}\` contient ${interdit}`);
		}
	}
	// Les sous-directives rouvriraient ce que `script-src` ferme :
	// `script-src-attr 'unsafe-inline'` réautorise précisément les `onerror=`.
	for (const sous of ['script-src-elem', 'script-src-attr']) {
		if (carte.get(sous)?.includes("'unsafe-inline'") === true) {
			defauts.push(`\`${sous}\` contient 'unsafe-inline'`);
		}
	}
	return defauts;
}

describe('critère 42 : détecteur de CSP (témoins)', () => {
	it.each([
		"default-src 'self'",
		"script-src 'self'; style-src 'self' 'unsafe-inline'",
		"SCRIPT-SRC 'SELF'",
	])('admet : %s', (politique) => {
		expect(defautsCsp(politique)).toEqual([]);
	});

	it.each([
		"script-src 'self' 'unsafe-inline'",
		"default-src 'self' 'unsafe-eval'",
		"script-src 'self'; script-src-attr 'unsafe-inline'",
		"img-src 'self'",
		'script-src https:',
		// La première directive l'emporte : le second `script-src` ne rattrape rien.
		"script-src 'self' 'unsafe-inline'; script-src 'self'",
		// `script-src` présent prime sur `default-src`, même si ce dernier est strict.
		"default-src 'self'; script-src 'self' 'unsafe-inline'",
	])('refuse : %s', (politique) => {
		expect(defautsCsp(politique)).not.toEqual([]);
	});
});

describe('critère 42 : app.html porte une CSP qui bloque les scripts en ligne', () => {
	it('une balise <meta http-equiv="Content-Security-Policy"> existe, dans le <head>, avant tout <script>', () => {
		const meta = META_CSP.exec(PAGE);
		expect(
			meta,
			'app.html ne contient aucune <meta http-equiv="Content-Security-Policy">',
		).not.toBeNull();
		if (meta === null) return;

		const finHead = PAGE.search(/<\/head\s*>/i);
		// Une CSP en <meta> hors du <head> est ignorée par le navigateur.
		expect(meta.index, 'la CSP doit être dans le <head> (ignorée ailleurs)').toBeLessThan(finHead);

		const premierScript = PAGE.search(/<script\b/i);
		if (premierScript !== -1) {
			expect(
				meta.index,
				'la CSP doit précéder tout <script> : elle ne couvre que ce qui la suit',
			).toBeLessThan(premierScript);
		}
	});

	it("sa politique impose 'self' aux scripts, sans 'unsafe-inline' ni 'unsafe-eval'", () => {
		const meta = META_CSP.exec(PAGE);
		expect(
			meta,
			'app.html ne contient aucune <meta http-equiv="Content-Security-Policy">',
		).not.toBeNull();
		if (meta === null) return;

		const contenu = ATTR_CONTENT.exec(meta[0]);
		expect(contenu, 'la balise CSP n’a pas d’attribut content').not.toBeNull();
		const politique = contenu?.[1] ?? contenu?.[2] ?? '';
		expect(defautsCsp(politique), `politique lue : « ${politique} »`).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Critère 42 — rien de ce que la CSP bloquerait en silence
// ---------------------------------------------------------------------------

/* Une balise ouvrante qui porte un attribut `on…=` (gestionnaire en ligne). */
const GESTIONNAIRE_EN_LIGNE = /<[a-z][^>]*\son[a-z]+\s*=/i;
/* La même chose posée par script : `setAttribute('onclick', …)`. */
const GESTIONNAIRE_PAR_ATTRIBUT = /\.setAttribute\(\s*['"`]on[a-z]+['"`]/i;
/* Évaluation de chaîne : bloquée sans 'unsafe-eval'. */
const EVALUATION = /\beval\s*\(|\bnew\s+Function\s*\(/;

describe('critère 42 : détecteurs de contenu bloqué (témoins)', () => {
	it.each([
		['<img src="${x}" onerror="alert(1)">', GESTIONNAIRE_EN_LIGNE],
		["<button\n\tclass='b'\n\tonclick=go()>", GESTIONNAIRE_EN_LIGNE],
		["el.setAttribute('onload', code)", GESTIONNAIRE_PAR_ATTRIBUT],
		["const f = new Function('return 1')", EVALUATION],
	])('repère : %s', (extrait, motif) => {
		expect(motif.test(extrait)).toBe(true);
	});

	it.each([
		['<button class="mode-btn" data-on="1">', GESTIONNAIRE_EN_LIGNE],
		['el.addEventListener("click", go)', GESTIONNAIRE_EN_LIGNE],
		["el.setAttribute('aria-label', s)", GESTIONNAIRE_PAR_ATTRIBUT],
		['const evaluation = noter(r)', EVALUATION],
	])('laisse passer : %s', (extrait, motif) => {
		expect(motif.test(extrait)).toBe(false);
	});
});

describe('critère 42 : app.html n’a rien que la CSP bloquerait', () => {
	it('aucun <script> en ligne (sans src)', () => {
		const enLigne = [...PAGE.matchAll(/<script\b([^>]*)>/gi)]
			.filter(([, attrs = '']) => !/\bsrc\s*=/i.test(attrs))
			// Blocs de données (JSON-LD…) : non exécutés, hors du champ de script-src.
			.filter(([, attrs = '']) => !/\btype\s*=\s*["']?application\/(ld\+)?json/i.test(attrs))
			.map(([balise]) => balise);
		expect(enLigne, 'script en ligne dans app.html : la CSP le bloquerait').toEqual([]);
	});

	it('aucun attribut de gestionnaire en ligne (onclick=, onload=…)', () => {
		const trouve = GESTIONNAIRE_EN_LIGNE.exec(PAGE);
		expect(
			trouve?.[0] ?? null,
			'gestionnaire en ligne dans app.html : la CSP le bloquerait',
		).toBeNull();
	});
});

function sourcesTs(dossier: string): string[] {
	return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
		const chemin = join(dossier, entree.name);
		if (entree.isDirectory()) return sourcesTs(chemin);
		return entree.isFile() && entree.name.endsWith('.ts') ? [chemin] : [];
	});
}

const SOURCES = sourcesTs(join(RACINE, 'src')).map((chemin) => ({
	fichier: relative(RACINE, chemin).replace(/\\/g, '/'),
	texte: readFileSync(chemin, 'utf8'),
}));

function fautifs(motif: RegExp): string[] {
	return SOURCES.flatMap(({ fichier, texte }) => {
		const trouve = motif.exec(texte);
		return trouve === null ? [] : [`${fichier} : ${trouve[0].replace(/\s+/g, ' ').slice(0, 120)}`];
	});
}

describe('critère 42 : src/ n’écrit rien que la CSP bloquerait', () => {
	it('le parcours de src/ trouve bien les sources (sinon les tests suivants ne prouvent rien)', () => {
		expect(SOURCES.length).toBeGreaterThan(50);
		expect(SOURCES.some(({ fichier }) => fichier === 'src/core/html.ts')).toBe(true);
	});

	it('aucun gabarit n’écrit de gestionnaire en ligne (on…=)', () => {
		const liste = fautifs(GESTIONNAIRE_EN_LIGNE);
		expect(liste, `gestionnaires en ligne, bloqués par la CSP :\n${liste.join('\n')}`).toEqual([]);
	});

	it('aucun setAttribute("on…") ne pose de gestionnaire par attribut', () => {
		const liste = fautifs(GESTIONNAIRE_PAR_ATTRIBUT);
		expect(
			liste,
			`gestionnaires posés par attribut, bloqués par la CSP :\n${liste.join('\n')}`,
		).toEqual([]);
	});

	it('aucun eval / new Function (bloqués sans unsafe-eval)', () => {
		const liste = fautifs(EVALUATION);
		expect(liste, `évaluations de chaîne, bloquées par la CSP :\n${liste.join('\n')}`).toEqual([]);
	});
});
