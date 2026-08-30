// @vitest-environment node
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import path from 'node:path';
import { analyserPositions, SafeHtml, html } from '../src/core/html';

/* ============================================================
   Gate des fuites de gabarit : « [object Object] » et « html » À L'ÉCRAN
   (régression de 5a356a7, le commit qui a fait passer chaque rendu par `html`, #614).

   Vu EN PRODUCTION, sur l'écran des enfants : « [object Object] » au bout de l'écran de
   résultat du sprint, de l'écran de résultat de toute leçon et des pastilles du
   « programme du jour » ; et le mot « html » en toutes lettres sous un QCM et sur deux
   écrans de révision. Huit sites, deux formes, et rien qui rougisse nulle part.

   FORME 1 — un `SafeHtml` part en contexte CHAÎNE. `src/core/html.ts` refuse
   délibérément de donner un `toString()` à `SafeHtml` : un `toString()` complaisant
   ferait « marcher » un chemin qui a justement perdu son échappement. Toute coercition
   rend donc « [object Object] ». Le motif fautif était l'accumulateur —
   `let extra = ''; extra += html\`…\`;` — que TypeScript ACCEPTE sans broncher
   (`string + objet` est légal, résultat `string`) : typecheck vert, lint vert.

   FORME 2 — du texte technique resté collé dans la partie STATIQUE d'un gabarit : le
   jeton `html` juste avant le backtick fermant (`…</div>html\`.balisage;`, reste d'un
   copier-coller de la balise de gabarit). Le navigateur l'affiche en nœud texte.

   ── Pourquoi encore un gate : les deux filets existants ont laissé passer ─────
   1. `e2e/echappement-rendu.spec.ts` cherche « [object Object] » dans le texte visible,
      et son en-tête nomme explicitement les deux symptômes. Il ÉCHANTILLONNE six
      écrans ; aucun des huit sites n'était sur son chemin. C'est la leçon de
      l'incident : sur cette classe de défaut, un garde-fou par échantillon ne prouve
      QUE les écrans qu'il visite. Il faudrait jouer toutes les leçons, tous les modes
      et toutes les fins de série pour espérer croiser le neuvième site.
   2. `tests/html-positions-gate.test.ts` (classe 3) est déjà statique et déjà typé —
      mais il ne teste QUE `PlusToken`. Les cinq sites de production étaient des
      `PlusEqualsToken` : un jeton d'écart, et le gate reste vert. Il n'avait aucun
      moyen de s'en apercevoir, parce que RIEN ne vérifiait qu'il détecte encore quoi
      que ce soit — sur un arbre sain, un détecteur troué et un détecteur correct
      rendent le même vert.

   D'où les deux exigences de celui-ci : EXHAUSTIF SUR `src/` par construction (il lit
   tout l'arbre, pas une poignée de chemins), et VÉRIFIÉ SUR UN ÉCHANTILLON FAUTIF (plus
   bas), pour
   qu'un trou dans le détecteur se voie au lieu de se taire.

   ── Pourquoi une analyse TYPÉE, et pas une regex ──────────────────────────────
   Une recherche textuelle attrape `extra += html\`…\`` et rate
   `extra += fabriqueLeFragment()`, qui produit exactement le même « [object Object] » à
   l'écran. Le gate construit donc un programme TypeScript à partir du tsconfig du dépôt
   et demande au checker le TYPE de chaque expression.

   COÛT MESURÉ : ~3,3 s pour le fichier entier (dont ~3 s de construction du programme,
   payée UNE fois), en environnement `node` — aucun usage du DOM, et `happy-dom` coûte à
   lui seul 28 s de mise en place. Deux mesures qui ont fixé ce choix :
   - `setParentNodes` à `true` sur le host fait passer la construction de 3 à 11 s : il
     renseigne `.parent` jusque dans les `lib.*.d.ts`, dont on n'a que faire.
   - L'alternative « sur étagère » — `@typescript-eslint/restrict-plus-operands` +
     `restrict-template-expressions` avec analyse de types — donne bien 0 violation sur
     l'arbre corrigé, mais coûte 2 min 16 s sur `src/` seul (mesure du 30/08/2026), soit
     quarante fois plus, et elle alourdirait `npm run lint`. Écartée pour le prix, pas
     pour le principe. Elle ne voit d'ailleurs ni la forme 2, ni `.join()`, ni
     `.toString()`.

   ── L'échantillon fautif ──────────────────────────────────────────────────────
   Les huit sites étant corrigés, ce gate est vert sur `src/` : seul, il ne prouve rien.
   Il est donc appliqué en plus à `ECHANTILLON`, un fichier VIRTUEL (jamais écrit sur le
   disque, jamais compilé ni linté par le projet) qui rejoue les deux formes, la variante
   indirecte comprise. Introduire la faute dans `src/` pour la même démonstration
   l'exposerait aux enfants entre deux commits. L'échantillon porte aussi des TÉMOINS
   légitimes — dont le `<a href="…guide.html#installer">` de `encadrant-profils.ts`, sur
   lequel un prototype de ce gate s'était trompé.

   ── Ce qu'il ne prouve pas ────────────────────────────────────────────────────
   - La forme 2 se reconnaît à une LISTE DE JETONS techniques (`html`, `balisage`,
     `undefined`…) : du parasite qui ressemblerait à de la prose passerait. La forme 1,
     elle, est décidée par le type, donc exhaustive sur les coercitions listées.
   - Rien sur ce que l'enfant voit VRAIMENT : un fragment peut être bien typé et jamais
     inséré dans le DOM. L'e2e reste le seul à le dire — sur les écrans qu'il traverse,
     onze depuis que la même PR y a ajouté les cinq qui avaient fui.

   ── Recouvrement avec l'autre gate : TRANCHÉ ─────────────────────────────────
   La forme 1 ci-dessous couvre STRICTEMENT ce qu'était la classe 3 de
   `tests/html-positions-gate.test.ts` (elle y ajoute `+=`, `String()`, `.toString()`,
   les tableaux de fragments, et la preuve qu'elle mord). Cette classe 3 a donc été
   RETIRÉE de l'autre fichier, où son numéro reste vacant — les classes y sont citées
   par leur numéro dans docs/architecture/rendu-et-echappement.md. Ne PAS la réarmer
   là-bas : deux détecteurs d'une même faute, c'est exactement le dispositif où l'un se
   périme sans bruit, et c'est ce qui vient d'arriver avec le `+` sans `+=`.

   Si un jour on veut alléger : la forme 2 n'a besoin d'AUCUN type (`ts.createSourceFile`
   suffit : 218 fichiers et 711 gabarits parcourus en 0,6 s, sans programme ni checker) ;
   c'est la forme 1 seule qui paie la construction du programme.

   ── Un faux positif assumé ───────────────────────────────────────────────────
   La forme 2 juge un nœud texte sur une liste de jetons : un libellé qui dirait
   VRAIMENT « html » à l'enfant (« ouvre le fichier html ») ferait échouer ce gate à
   tort. C'est assumé — l'application ne parle pas de HTML à un CE2 — mais si le cas se
   présente, la réponse est d'affiner `JETONS_PARASITES`, pas de désarmer le test. Le
   `href="…guide.html#installer"` de src/ui/encadrant-profils.ts, lui, ne déclenche rien :
   il est en position d'attribut, et le scanner ne juge que le TEXTE.
   ============================================================ */

const RACINE = process.cwd();
const normal = (p: string) => p.replace(/\\/g, '/');
const PREFIXE_SRC = `${normal(path.join(RACINE, 'src'))}/`;
const relatif = (f: string) => normal(path.relative(RACINE, f));

/** Nom de l'enveloppe de `src/core/html.ts`. Un test vérifie qu'elle existe toujours
 *  sous ce nom : sinon le détecteur de forme 1 ne reconnaîtrait plus rien et serait vert
 *  pour de mauvaises raisons. */
const NOM_ENVELOPPE = 'SafeHtml';

/* ---------- L'échantillon fautif (fichier VIRTUEL) ----------

   Les lignes fautives sont marquées `// FORME 1` / `// FORME 2` ; le test compare
   l'ensemble des sites signalés à l'ensemble des lignes marquées, donc une faute ratée
   ET une détection en trop font toutes les deux échouer. */
const CHEMIN_ECHANTILLON = path.join(RACINE, 'tests', '__echantillon-fuites.virtuel.ts');

const ECHANTILLON = `
import { html, joindre, SafeHtml } from '../src/core/html';

function fabrique(): SafeHtml {
	return html\`<b>ok</b>\`;
}

/** Le motif exact des cinq sites de production : l'accumulateur. */
export function accumulateurLitteral(): string {
	let extra = '';
	extra += html\`<div class="rb-record">Nouveau record !</div>\`; // FORME 1
	return extra;
}

/** La variante qu'une regex sur les sources ne peut pas voir : même effet à l'écran. */
export function accumulateurIndirect(): string {
	let extra = '';
	extra += fabrique(); // FORME 1
	return extra;
}

/** Concaténation simple, sans accumulateur. */
export function concatenationSimple(): string {
	return 'Score : ' + fabrique(); // FORME 1
}

/** Fragment interpolé dans un gabarit NON balisé : « [object Object] » aussi. */
export function gabaritNu(): string {
	return \`<div>\${fabrique()}</div>\`; // FORME 1
}

/** \`.join()\` sur des fragments, au lieu de \`joindre\`. */
export function jointureCrue(): string {
	return [fabrique(), fabrique()].join(''); // FORME 1
}

/** Coercition explicite. */
export function coercitionExplicite(): string {
	return String(fabrique()); // FORME 1
}

/** Coercition héritée d'Object : parfaitement typée, donc invisible au compilateur. */
export function coercitionHeritee(): string {
	return fabrique().toString(); // FORME 1
}

/** Le jeton de la balise de gabarit resté collé avant le backtick fermant. */
export function jetonColle(): SafeHtml {
	return html\`<div class="sprint-done"><p>Bravo !</p></div>html\`; // FORME 2
}

/** Le \`.balisage\` recopié DANS le gabarit au lieu d'en sortir. */
export function accesseurColle(): SafeHtml {
	return html\`<p>Score</p>.balisage\`; // FORME 2
}

/** Une valeur coercée en amont, dont le gabarit ne peut plus rien savoir. */
export function artefactFige(): SafeHtml {
	return html\`<p>Bravo undefined !</p>\`; // FORME 2
}

/** Le même jeton, mais SANS interpolation et précédé d'un mot : c'est la forme la plus
 *  simple du bug de production, et elle a échappé à la première version du scanner. Le
 *  morceau unique donne « ok » puis « html » : si on agrège tout le morceau d'un bloc,
 *  le mot devient « okhtml » et le motif refuse le jeton, à juste titre. */
export function jetonApresMot(): SafeHtml {
	return html\`<div class="a">ok</div>html\`; // FORME 2
}

/** Le même mécanisme AVEC interpolations : du texte rédigé PUIS le jeton dans le dernier
 *  morceau. C'est un des trois sites de production, à un mot de texte près. */
export function jetonApresProse(nom: string): SafeHtml {
	return html\`<p>Bravo \${nom} !</p><p>fini</p>html\`; // FORME 2
}

/* ---------- Témoins : légitimes, ne doivent JAMAIS être signalés ---------- */

/** Le lien du guide, coupé par une interpolation : « guide.html » est une valeur
 *  d'ATTRIBUT, pas un nœud texte. C'est le faux positif du prototype.
 *
 *  Le \`data-format\` est un TÉMOIN volontairement artificiel : « html » y est un jeton
 *  parasite parfait (pas de point devant), et il n'est pourtant pas du texte. Il pique
 *  tout scanner qui ne traverserait pas l'interpolation — le morceau statique qui le
 *  porte commence à l'intérieur d'une valeur d'attribut. */
export function lienGuide(base: string): SafeHtml {
	return html\`<a href="\${base}guide.html#installer" data-format="html" rel="noopener">guide pour les parents</a>\`;
}

/** Les deux chemins corrects : liste de fragments jointe par \`joindre\`, et fragment
 *  interpolé dans un gabarit BALISÉ. */
export function cheminsCorrects(): SafeHtml {
	const morceaux: SafeHtml[] = [fabrique(), fabrique()];
	return html\`<div class="ok">\${joindre(morceaux)}\${fabrique()}</div>\`;
}

/** Prose qui PARLE de balisage sans en être : ni « HTML » en capitales ni un nom de
 *  fichier ne sont des fuites. */
export function proseLegitime(): SafeHtml {
	return html\`<p>Le fichier app.html s'ouvre hors ligne.</p>\`;
}
`;

/* ---------- Construction du programme (une fois pour tout le fichier) ---------- */

const configBrute = ts.readConfigFile(path.join(RACINE, 'tsconfig.json'), ts.sys.readFile);
const CONFIG = ts.parseJsonConfigFileContent(configBrute.config, ts.sys, RACINE);

/* Les fichiers de `tests/` sont dans le tsconfig mais hors sujet : les écarter des
   racines divise le coût sans rien perdre (ce qu'importe `src/` reste dans le
   programme). `src/sw.ts` reste exclu, comme le fait le tsconfig lui-même. */
const RACINES_SRC = CONFIG.fileNames.filter((f) => normal(f).startsWith(PREFIXE_SRC));

const memeFichier = (a: string, b: string) => normal(path.resolve(a)) === normal(path.resolve(b));

function creerProgramme(): ts.Program {
	// `setParentNodes` à false : le binder renseigne déjà `.parent` sur les fichiers du
	// programme, et le demander au host le fait aussi sur les `lib.*.d.ts` — mesuré à
	// +8 s pour rien.
	const host = ts.createCompilerHost(CONFIG.options, false);
	const lire = host.readFile.bind(host);
	const existe = host.fileExists.bind(host);
	const source = host.getSourceFile.bind(host);
	host.readFile = (f) => (memeFichier(f, CHEMIN_ECHANTILLON) ? ECHANTILLON : lire(f));
	host.fileExists = (f) => memeFichier(f, CHEMIN_ECHANTILLON) || existe(f);
	host.getSourceFile = (f, version, onError, nouveau) =>
		memeFichier(f, CHEMIN_ECHANTILLON)
			? ts.createSourceFile(f, ECHANTILLON, version, true, ts.ScriptKind.TS)
			: source(f, version, onError, nouveau);
	return ts.createProgram([...RACINES_SRC, CHEMIN_ECHANTILLON], CONFIG.options, host);
}

const PROGRAMME = creerProgramme();
const CHECKER = PROGRAMME.getTypeChecker();

/* ---------- Le détecteur ---------- */

type Forme = 1 | 2;
type Site = { fichier: string; ligne: number; forme: Forme; motif: string; extrait: string };

const apercu = (s: string, max = 80) => {
	const plat = s.replace(/\s+/g, ' ').trim();
	return plat.length > max ? `${plat.slice(0, max)}…` : plat;
};

const decrire = (s: Site) =>
	`  ${s.fichier}:${s.ligne} — [forme ${s.forme}] ${s.motif}\n      « ${s.extrait} »`;

/** Le type porte-t-il l'enveloppe `SafeHtml` ? On descend dans les unions
 *  (`SafeHtml | undefined`, `ValeurHtml`…) et dans les tableaux (`SafeHtml[]` coercé
 *  rend « [object Object] » lui aussi) : la coercition trahit dès qu'une branche est un
 *  fragment. */
function estFragment(t: ts.Type | undefined, profondeur = 0): boolean {
	if (!t) return false;
	return (t.isUnion() ? t.types : [t]).some(
		(b) =>
			b.getSymbol()?.getName() === NOM_ENVELOPPE ||
			(profondeur < 3 && estFragment(b.getNumberIndexType(), profondeur + 1)),
	);
}

const typeDe = (n: ts.Node): ts.Type | undefined => {
	try {
		return CHECKER.getTypeAtLocation(n);
	} catch {
		return undefined;
	}
};

/** Jetons techniques qui n'ont rien à faire dans un nœud TEXTE. `html` est le cas de
 *  production ; il est exigé en minuscules et hors nom de fichier (`guide.html`,
 *  `app.html`), ce qui laisse passer une prose qui parlerait de « HTML ». */
const JETONS_PARASITES: { motif: RegExp; nom: string }[] = [
	{ motif: /(?<![.\w-])html\b/, nom: 'html' },
	{ motif: /\bbalisage\b/, nom: 'balisage' },
	{ motif: /\bSafeHtml\b/, nom: 'SafeHtml' },
	{ motif: /\[object Object\]/, nom: '[object Object]' },
	{ motif: /\bundefined\b/, nom: 'undefined' },
	{ motif: /\bNaN\b/, nom: 'NaN' },
];

type Etat = 'texte' | 'balise' | 'valeur-double' | 'valeur-simple' | 'commentaire';

/** Ce que le navigateur rendra en TEXTE : un enregistrement par NŒUD TEXTE, plus l'état
 *  atteint à la fin de chaque morceau statique (pour le recoupement avec le moteur).
 *
 *  Deux règles, et chacune ferme un trou mesuré :
 *
 *  1. L'état TRAVERSE les interpolations. Dans `<a href="${base}guide.html#installer">`,
 *     le morceau qui porte « guide.html » commence À L'INTÉRIEUR d'une valeur d'attribut.
 *     Un découpage morceau par morceau (retirer les `<…>` à coups de regex) croit y voir
 *     du texte et signale le lien du guide à tort — c'était le faux positif du prototype.
 *  2. Un nœud texte est CLOS dès qu'une balise (ou un commentaire) commence. Une première
 *     version accumulait tout un morceau d'un bloc : `<div>ok</div>html` donnait le mot
 *     « okhtml », où le jeton n'est plus en tête de mot, et le motif le refusait à juste
 *     titre. Résultat, la faute de production la plus simple — celle SANS interpolation —
 *     passait, et le message rapporté n'aurait de toute façon pas été ce que l'enfant
 *     lit. C'est le même genre d'angle mort que le `+` sans `+=` du gate voisin : un cas
 *     non envisagé, silencieusement vert. L'échantillon fautif en porte deux cas. */
function scanner(morceaux: readonly string[]): {
	textes: { morceau: number; texte: string }[];
	etats: Etat[];
} {
	const textes: { morceau: number; texte: string }[] = [];
	const etats: Etat[] = [];
	let etat: Etat = 'texte';
	let courant = '';
	for (let p = 0; p < morceaux.length; p++) {
		const s = morceaux[p];
		// Un nœud texte coupé par une interpolation est rendu d'un seul tenant par le
		// navigateur ; on le clôt quand même au changement de morceau, parce que le jeton
		// recherché ne se coupe pas en deux (`ht${x}ml` n'existe pas) et que la ligne
		// rapportée doit rester celle du morceau où le texte se trouve.
		const clore = () => {
			if (courant.trim()) textes.push({ morceau: p, texte: courant });
			courant = '';
		};
		for (let i = 0; i < s.length; i++) {
			const c = s[i];
			switch (etat) {
				case 'texte':
					if (c === '<') {
						clore();
						if (s.startsWith('!--', i + 1)) {
							etat = 'commentaire';
							i += 3;
						} else etat = 'balise';
					} else courant += c;
					break;
				case 'commentaire':
					if (c === '-' && s.startsWith('->', i + 1)) {
						etat = 'texte';
						i += 2;
					}
					break;
				case 'balise':
					if (c === '>') etat = 'texte';
					else if (c === '"') etat = 'valeur-double';
					else if (c === "'") etat = 'valeur-simple';
					break;
				case 'valeur-double':
					if (c === '"') etat = 'balise';
					break;
				case 'valeur-simple':
					if (c === "'") etat = 'balise';
					break;
			}
		}
		clore();
		etats.push(etat);
	}
	return { textes, etats };
}

type Divergence = { fichier: string; ligne: number; detail: string };
type Bilan = {
	sites: Site[];
	divergences: Divergence[];
	gabarits: number;
	fragments: number;
	interpolations: number;
};

function analyser(fichiers: readonly ts.SourceFile[]): Bilan {
	const bilan: Bilan = {
		sites: [],
		divergences: [],
		gabarits: 0,
		fragments: 0,
		interpolations: 0,
	};

	for (const sf of fichiers) {
		const ligneDe = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
		const noter = (n: ts.Node, forme: Forme, motif: string, porteur: ts.Node = n) =>
			bilan.sites.push({
				fichier: relatif(sf.fileName),
				ligne: ligneDe(porteur),
				forme,
				motif,
				extrait: apercu(n.getText(sf)),
			});

		const visite = (n: ts.Node): void => {
			/* ---- FORME 1 : le fragment part en contexte chaîne ---- */

			// `a + frag` et `a += frag` — les cinq sites de production étaient des `+=`,
			// que le gate voisin (html-positions-gate, classe 3) ne regarde pas.
			if (ts.isBinaryExpression(n)) {
				const op = n.operatorToken.kind;
				const signe =
					op === ts.SyntaxKind.PlusToken ? '+' : op === ts.SyntaxKind.PlusEqualsToken ? '+=' : '';
				if (signe && (estFragment(typeDe(n.left)) || estFragment(typeDe(n.right))))
					noter(n, 1, `fragment concaténé au « ${signe} »`);
			}

			// `${frag}` dans un gabarit qui n'est PAS balisé par `html`.
			if (ts.isTemplateExpression(n)) {
				const parent: ts.Node | undefined = n.parent;
				const balise =
					parent && ts.isTaggedTemplateExpression(parent) && parent.template === n
						? ts.isIdentifier(parent.tag)
							? parent.tag.text
							: parent.tag.getText(sf)
						: null;
				if (balise !== 'html')
					for (const span of n.templateSpans)
						if (estFragment(typeDe(span.expression)))
							noter(
								span.expression,
								1,
								balise === null
									? 'fragment interpolé dans un gabarit NON balisé'
									: `fragment interpolé dans un gabarit balisé par « ${balise} »`,
							);
			}

			if (ts.isCallExpression(n)) {
				// `String(frag)`
				if (
					ts.isIdentifier(n.expression) &&
					n.expression.text === 'String' &&
					n.arguments.length > 0 &&
					estFragment(typeDe(n.arguments[0]))
				)
					noter(n, 1, 'String(fragment)');

				if (ts.isPropertyAccessExpression(n.expression)) {
					const membre = n.expression.name.text;
					const receveur = typeDe(n.expression.expression);
					// `[frag, frag].join('')` — le remplaçant typé est `joindre`.
					if (membre === 'join' && estFragment(receveur))
						noter(n, 1, '.join() sur des fragments — utiliser joindre()');
					// `frag.toString()` : hérité d'Object, donc parfaitement typé.
					if (membre === 'toString' && estFragment(receveur))
						noter(n, 1, '.toString() sur un fragment');
				}
			}

			/* ---- FORME 2 : du technique collé dans le balisage STATIQUE ---- */

			if (ts.isTaggedTemplateExpression(n) && ts.isIdentifier(n.tag) && n.tag.text === 'html') {
				bilan.gabarits++;
				if (estFragment(typeDe(n))) bilan.fragments++;
				const tpl = n.template;
				// Les parties CUITES (`.text`) : celles-là mêmes que `html()` analyse et émet.
				const litteraux: ts.TemplateLiteralLikeNode[] = ts.isNoSubstitutionTemplateLiteral(tpl)
					? [tpl]
					: [tpl.head, ...tpl.templateSpans.map((s) => s.literal)];
				const morceaux = litteraux.map((l) => l.text);
				const { textes, etats } = scanner(morceaux);

				for (const { morceau, texte } of textes) {
					const jeton = JETONS_PARASITES.find((j) => j.motif.test(texte));
					if (jeton)
						noter(
							n,
							2,
							`jeton technique « ${jeton.nom} » rendu comme TEXTE : « ${apercu(texte, 60)} »`,
							litteraux[morceau],
						);
				}

				/* Recoupement avec le MOTEUR (`analyserPositions`, la fonction réellement
				   utilisée à l'exécution) : là où le moteur dit « texte », le scanner ci-dessus
				   doit être en texte, et réciproquement. Sans ce croisement, une divergence
				   entre les deux lectures du même balisage rendrait ce gate silencieux sans que
				   personne ne le remarque. */
				const positions = analyserPositions(morceaux);
				bilan.interpolations += positions.length;
				positions.forEach((position, i) => {
					if ((position === 'texte') !== (etats[i] === 'texte'))
						bilan.divergences.push({
							fichier: relatif(sf.fileName),
							ligne: ligneDe(litteraux[i]),
							detail: `interpolation ${i} : le moteur dit « ${position} », le scanner « ${etats[i]} »`,
						});
				});
			}

			ts.forEachChild(n, visite);
		};

		ts.forEachChild(sf, visite);
	}
	return bilan;
}

const fichiersDe = (predicat: (f: string) => boolean) =>
	PROGRAMME.getSourceFiles().filter((sf) => !sf.isDeclarationFile && predicat(sf.fileName));

const SRC = analyser(fichiersDe((f) => normal(f).startsWith(PREFIXE_SRC)));
const FAUTIF = analyser(fichiersDe((f) => memeFichier(f, CHEMIN_ECHANTILLON)));

const lister = (sites: Site[]) => sites.map(decrire).join('\n');

/* ---------- Les tests ---------- */

describe('Fuites de gabarit dans src/ (#614)', () => {
	it('la raison d’être du gate tient toujours : un fragment coercé rend « [object Object] »', () => {
		// Dérivé du langage, pas du code : un objet sans `toString()` propre se coerce via
		// `Object.prototype.toString`. Si quelqu'un dote `SafeHtml` d'un `toString()`, la
		// forme 1 cesse d'être VISIBLE et devient une perte d'échappement silencieuse —
		// pire, pas mieux. Dans les deux cas, ce gate doit être relu.
		expect(`${new SafeHtml('<b>x</b>')}`).toBe('[object Object]');
		expect(`${html`<b>x</b>`}`).toBe('[object Object]');
	});

	it('le scan voit vraiment le code ET ses types (garde contre un gate à vide)', () => {
		expect(
			RACINES_SRC.length,
			'moins de 150 fichiers analysés : la lecture du tsconfig ne ramène plus src/.',
		).toBeGreaterThan(150);
		expect(
			SRC.gabarits,
			'moins de 300 gabarits `html` : le scan ne reconnaît plus la balise de gabarit.',
		).toBeGreaterThan(300);
		expect(
			SRC.fragments,
			`moins de 300 gabarits typés « ${NOM_ENVELOPPE} » : le checker ne résout plus les ` +
				`types, et le détecteur de forme 1 ne peut plus rien voir.`,
		).toBeGreaterThan(300);
		expect(SRC.interpolations, 'aucune interpolation analysée').toBeGreaterThan(1000);
	});

	it('aucun SafeHtml ne part en contexte chaîne (forme 1)', () => {
		expect(
			lister(SRC.sites.filter((s) => s.forme === 1)),
			`Un fragment coercé en chaîne affiche « [object Object] » À L'ENFANT, et rien ne le ` +
				`signale : \`string + SafeHtml\` est du TypeScript légal, et le lint est vert.\n` +
				`Corriger en accumulant un SafeHtml[] puis en le joignant (joindre()), ou en ` +
				`interpolant le fragment dans un gabarit html\`\` — jamais dans un gabarit nu.`,
		).toBe('');
	});

	it('aucun jeton technique ne traîne dans le balisage statique (forme 2)', () => {
		expect(
			lister(SRC.sites.filter((s) => s.forme === 2)),
			`Ce texte est rendu TEL QUEL à l'enfant. Cas de production : le jeton « html » resté ` +
				`collé avant le backtick fermant (\`…</div>html\`.balisage), reste d'un copier-coller.`,
		).toBe('');
	});

	it('le scanner de texte lit le balisage comme le moteur (pas de divergence)', () => {
		expect(
			SRC.divergences.map((d) => `  ${d.fichier}:${d.ligne} — ${d.detail}`).join('\n'),
			`Le scanner de ce gate et analyserPositions() ne situent plus les interpolations au ` +
				`même endroit. Tant que l'écart n'est pas compris, la forme 2 cherche du texte là ` +
				`où il n'y en a pas — ou n'en cherche plus du tout.`,
		).toBe('');
	});
});

describe('Le détecteur mord (échantillon fautif, fichier virtuel)', () => {
	const LIGNES = ECHANTILLON.split('\n');
	/** Lignes marquées dans l'échantillon, indexées à 1 comme celles du détecteur. */
	const attendues = new Map<number, Forme>();
	LIGNES.forEach((ligne, i) => {
		const m = /\/\/ FORME ([12])$/.exec(ligne.trim());
		if (m) attendues.set(i + 1, m[1] === '1' ? 1 : 2);
	});

	it('l’échantillon porte bien les deux formes (garde contre un échantillon vidé)', () => {
		const parForme = (f: Forme) => [...attendues.values()].filter((v) => v === f).length;
		expect(parForme(1), 'moins de 7 cas de forme 1 dans l’échantillon').toBeGreaterThanOrEqual(7);
		expect(parForme(2), 'moins de 5 cas de forme 2 dans l’échantillon').toBeGreaterThanOrEqual(5);
	});

	it('TypeScript, lui, ne voit rien à redire — c’est tout le problème', () => {
		// Si ces formes devenaient des erreurs de compilation, ce gate perdrait sa raison
		// d'être. Encore faut-il le CONSTATER plutôt que le supposer.
		const sf = PROGRAMME.getSourceFile(CHEMIN_ECHANTILLON);
		expect(sf, `le fichier virtuel n'est pas entré dans le programme`).toBeTruthy();
		const erreurs = [
			...PROGRAMME.getSyntacticDiagnostics(sf),
			...PROGRAMME.getSemanticDiagnostics(sf),
		].map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
		expect(erreurs.join('\n')).toBe('');
	});

	it('il signale exactement les lignes fautives, et rien d’autre', () => {
		const vus = new Map<number, Forme[]>();
		for (const s of FAUTIF.sites) vus.set(s.ligne, [...(vus.get(s.ligne) ?? []), s.forme]);

		const manquantes = [...attendues]
			.filter(([ligne, forme]) => !vus.get(ligne)?.includes(forme))
			.map(([ligne, forme]) => `  ligne ${ligne} (forme ${forme}) : ${LIGNES[ligne - 1].trim()}`);
		expect(
			manquantes.join('\n'),
			`Le détecteur laisse passer une faute de l'échantillon : il est troué, et son silence ` +
				`sur src/ ne veut plus rien dire (c'est exactement ce qui est arrivé au « += » de ` +
				`html-positions-gate).`,
		).toBe('');

		const enTrop = FAUTIF.sites.filter((s) => attendues.get(s.ligne) !== s.forme);
		expect(
			lister(enTrop),
			`Faux positif sur l'échantillon : les témoins (lien « guide.html » coupé par une ` +
				`interpolation, joindre(), fragment dans un gabarit html\`\`, prose citant « app.html ») ` +
				`doivent rester muets, sinon le gate devient du bruit qu'on finira par contourner.`,
		).toBe('');
	});
});
