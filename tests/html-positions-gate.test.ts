// @vitest-environment node
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { analyserPositions } from '../src/core/html';

/* ============================================================
   Gate des fautes de RENDU que ni le type ni le linter ne voient (#614).

   Quatre classes de fautes, toutes rencontrées pendant la conversion, qui ont en
   commun de compiler proprement, de passer ESLint et de passer les tests
   unitaires — et de ne se manifester qu'à l'écran, chez l'enfant. Ce fichier en
   tient TROIS : la 3e a migré (voir plus bas), et son numéro reste vacant.

   1. INTERPOLATION À UNE POSITION REFUSÉE. Le gabarit refuse deux positions
      qu'il ne sait pas échapper honnêtement : entre deux attributs (`<p ${x}>`,
      où une chaîne poserait des attributs arbitraires et où l'échapper la
      rendrait inerte) et les contextes interdits (`<script>`, `<style>`, nom
      d'attribut, commentaire). Le refus est une EXCEPTION à l'exécution : vingt
      expressions fautives ont fait planter `renderEspace`, donc TOUT l'espace
      encadrant.

   2. BALISAGE ÉCRIT EN CHAÎNE. `const puce = '<span class="…"></span>'` puis
      `${puce}` : le gabarit fait son travail, échappe, et l'enfant lit
      « <span class="…"> » en clair. Sept sites, dont un `<p role="status"
      aria-live="polite">` : la zone d'annonce n'existait plus du tout, et
      l'annonce non-visuelle disparaissait en silence.

   3. FRAGMENT SORTI DE SON GABARIT — DÉPLACÉE dans
      `tests/fuites-gabarit-html-gate.test.ts`, qui la couvre strictement mieux.
      Elle vivait ici et n'a PAS tenu : elle ne testait que `PlusToken`, alors
      que le motif fautif réel est l'accumulateur `extra += html\`…\``, soit un
      `PlusEqualsToken`. Un jeton d'écart, cinq sites partis en production, et
      aucun moyen de s'en apercevoir — rien ne vérifiait que ce détecteur
      détectait encore quelque chose, et sur un arbre sain un détecteur troué
      rend exactement le même vert qu'un détecteur correct.
      Le numéro 3 reste vacant à dessein : les classes sont citées par leur
      numéro dans docs/architecture/rendu-et-echappement.md, et renuméroter
      ferait mentir ces renvois. Ne PAS réarmer une détection de fragments
      égarés ici : ce serait remettre en place le doublon qui se périme en
      silence.

   4. FRONTIÈRE DU MOTEUR DE FIGURES. `src/core/figures/` reste volontairement en
      `string` (cf. le rejet écrit dans rendu-et-echappement.md). Ses points
      d'entrée doivent donc être marqués `brut()` À CHAQUE appel : un seul oubli
      et la figure entière s'affiche en clair. C'est arrivé sur
      `renderDroiteGradueeInteractif`, et la leçon de droite graduée ne se
      rendait plus du tout.

   Pourquoi un gate plutôt que la vigilance : aucun de ces défauts n'est visible
   en relecture, et le seul filet existant (la suite Playwright) coûte une heure
   et ne couvre que les écrans qu'elle traverse.

   ── Comment il s'y prend ─────────────────────────────────────────────────────
   Un programme TypeScript sur `src/`, et le TYPECHECKER pour trancher. Pour la
   classe 1, on rejoue le MÊME automate que le moteur (`analyserPositions`, la
   fonction réellement utilisée à l'exécution — pas une copie qui pourrait
   diverger) sur les parties statiques de chaque gabarit.

   Le typechecker, et pas une heuristique syntaxique : une première version
   reconnaissait les fabriques par leur NOM (`html`, `attribut`, `brut`…) et
   criait sur 45 sites sains, faute de savoir que `ttsAttr(…)`, `lessonAttr(ctx)`
   ou `marqueCase(…)` rendent déjà un `SafeHtml`. Un gate qui se trompe trois
   fois sur quatre finit contourné.

   Portée de la classe 2 : TOUT `src/` (hors moteur de figures), pas seulement
   l'intérieur des gabarits. Une première version ne regardait que les littéraux
   écrits DANS un gabarit ; elle a laissé passer cinq sites où la chaîne est
   d'abord rangée dans une constante. C'est la forme la plus fréquente.

   COÛT : ~3 s (construction du programme comprise), en environnement `node` et
   non `happy-dom`, dont il n'a aucun usage.
   ============================================================ */

/** Positions que `rendre` refuse dès que la valeur n'est ni un fragment,
 *  ni `false` / `null` / `undefined`, ni la chaîne vide. */
const POSITIONS_REFUSEES = new Set(['balise', 'interdit']);

/** Types acceptables à une position refusée. `SafeHtml[]` en fait partie :
 *  `rendre` descend dans les tableaux et traite chaque élément à la même
 *  position. `""` aussi : la chaîne vide ne peut rien injecter nulle part. */
const TYPES_ACCEPTES = new Set(['SafeHtml', 'SafeHtml[]', 'undefined', 'null', 'false', '""']);

/** Balise HTML COMPLÈTE dans un littéral. Exige le chevron fermant, ce qui
 *  laisse passer « 3 < 5 » et « a<b » — les leçons de comparaison en affichent. */
const BALISE_ECRITE = /<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*)?>/;

/** Le moteur de figures compose son SVG en `string` : c'est la limite assumée de
 *  #614 (rejet écrit dans docs/architecture/rendu-et-echappement.md). On ne lui
 *  applique donc pas la classe 2 — mais on surveille sa FRONTIÈRE (classe 4). */
const MOTEUR_FIGURES = 'src/core/figures/';

/** Littéraux de balisage légitimes hors moteur. Chaque entrée dit POURQUOI ;
 *  une exception sans raison est un trou, pas une exception. */
const BALISAGE_EN_CHAINE_ADMIS: { fichier: string; extrait: string; raison: string }[] = [
	{
		fichier: 'src/core/items.ts',
		extrait: '<strong>$1</strong>',
		raison:
			"Chaîne de REMPLACEMENT d'un `replace`, pas un fragment : elle encadre du contenu " +
			"déjà échappé, et le résultat est déclaré par `brut()` juste au-dessus. C'est le " +
			'motif « échappe puis réinjecte » que le critère 9 de #614 demande de rendre explicite.',
	},
];

type Faute = { fichier: string; ligne: number; detail: string; extrait: string };

/** Parties STATIQUES du gabarit, telles que `parts.raw` les verrait. On découpe
 *  le texte source plutôt que de lire `rawText`, qui n'est pas garanti
 *  renseigné selon la façon dont le fichier a été parsé. */
function partiesStatiques(modele: ts.TemplateExpression, sf: ts.SourceFile): string[] {
	const parties = [modele.head.getText(sf).slice(1, -2)]; // `…${
	modele.templateSpans.forEach((span, i) => {
		const texte = span.literal.getText(sf);
		const dernier = i === modele.templateSpans.length - 1;
		parties.push(dernier ? texte.slice(1, -1) : texte.slice(1, -2)); // }…` ou }…${
	});
	return parties;
}

function auditer() {
	const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, '.');
	const dansSrc = (f: string) => f.replace(/\\/g, '/').includes('src/');
	const programme = ts.createProgram(parsed.fileNames.filter(dansSrc), {
		...parsed.options,
		noEmit: true,
	});
	const checker = programme.getTypeChecker();

	const positionsRefusees: Faute[] = [];
	const balisagesEcrits: Faute[] = [];
	const figuresNonMarquees: Faute[] = [];
	let gabarits = 0;
	let expressionsExaminees = 0;
	let litterauxExamines = 0;

	/** Noms des types composant une expression (`A | B` → ['A', 'B']). */
	const typesDe = (expr: ts.Expression): string[] => {
		const type = checker.getTypeAtLocation(expr);
		return (type.isUnion() ? type.types : [type]).map((m) => checker.typeToString(m));
	};
	const estFragment = (expr: ts.Expression) =>
		typesDe(expr).some((n) => n === 'SafeHtml' || n === 'SafeHtml[]');

	/** Fichier qui DÉCLARE la fonction appelée (pour situer la frontière du moteur). */
	const fichierAppele = (appel: ts.CallExpression): string =>
		checker
			.getResolvedSignature(appel)
			?.declaration?.getSourceFile()
			.fileName.replace(/\\/g, '/') ?? '';

	const estGabaritHtml = (n: ts.Node): n is ts.TaggedTemplateExpression =>
		ts.isTaggedTemplateExpression(n) && ts.isIdentifier(n.tag) && n.tag.text === 'html';

	for (const sf of programme.getSourceFiles()) {
		if (sf.isDeclarationFile || !dansSrc(sf.fileName)) continue;
		const chemin = sf.fileName.replace(/\\/g, '/');
		const fichier = chemin.replace(/^.*?(src\/)/, '$1');
		const dansMoteur = chemin.includes(MOTEUR_FIGURES);
		const situer = (n: ts.Node) => ({
			fichier,
			ligne: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
			extrait: n.getText(sf).replace(/\s+/g, ' ').slice(0, 70),
		});

		/** Balisage écrit en chaîne, sauf exception justifiée. */
		const signalerBalisage = (n: ts.Node, texte: string): void => {
			if (dansMoteur || !BALISE_ECRITE.test(texte)) return;
			if (BALISAGE_EN_CHAINE_ADMIS.some((a) => a.fichier === fichier && texte.includes(a.extrait)))
				return;
			balisagesEcrits.push({
				...situer(n),
				detail: 'balisage écrit en chaîne : il sera échappé et lu en clair',
			});
		};

		const visiter = (node: ts.Node): void => {
			/* ---- Classes 1 & 4 : dans un gabarit `html` ---- */
			if (estGabaritHtml(node) && ts.isTemplateExpression(node.template)) {
				gabarits++;
				const positions = analyserPositions(partiesStatiques(node.template, sf));
				node.template.templateSpans.forEach((span, i) => {
					expressionsExaminees++;

					if (POSITIONS_REFUSEES.has(positions[i])) {
						const noms = typesDe(span.expression);
						if (!noms.every((n) => TYPES_ACCEPTES.has(n)))
							positionsRefusees.push({
								...situer(span.expression),
								detail: `position « ${positions[i]} », type « ${noms.join(' | ')} »`,
							});
					}

					if (
						ts.isCallExpression(span.expression) &&
						fichierAppele(span.expression).includes(MOTEUR_FIGURES) &&
						!estFragment(span.expression)
					)
						figuresNonMarquees.push({
							...situer(span.expression),
							detail: 'point d’entrée du moteur de figures, rendu en `string`',
						});
				});
			}

			/* ---- Classe 2 : du balisage écrit en CHAÎNE, où qu'il soit ---- */
			if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
				litterauxExamines++;
				// Le contenu d'un gabarit `html` sans interpolation est du balisage LÉGITIME.
				if (!estGabaritHtml(node.parent)) signalerBalisage(node, node.text);
			}
			if (ts.isTemplateExpression(node) && !estGabaritHtml(node.parent))
				for (const morceau of [node.head, ...node.templateSpans.map((s) => s.literal)])
					signalerBalisage(morceau, morceau.text);

			/* Classe 3 : voir l'en-tête — elle est tenue par
			   tests/fuites-gabarit-html-gate.test.ts, pas ici. */

			ts.forEachChild(node, visiter);
		};
		ts.forEachChild(sf, visiter);
	}

	return {
		positionsRefusees,
		balisagesEcrits,
		figuresNonMarquees,
		gabarits,
		expressionsExaminees,
		litterauxExamines,
	};
}

const AUDIT = auditer();

const lister = (fautes: Faute[]) =>
	fautes.map((f) => `  ${f.fichier}:${f.ligne} — ${f.detail}\n      ${f.extrait}`).join('\n');

describe('fautes de rendu invisibles au compilateur (#614)', () => {
	/* Garde contre un gate À VIDE : si le repérage casse (tag renommé, parsing
	   changé, filtre de chemins qui ne matche plus), les assertions passeraient
	   sur zéro gabarit analysé et le gate ne testerait plus rien. */
	it('analyse effectivement les gabarits et les littéraux de src/', () => {
		expect(AUDIT.gabarits).toBeGreaterThan(300);
		expect(AUDIT.expressionsExaminees).toBeGreaterThan(1000);
		expect(AUDIT.litterauxExamines).toBeGreaterThan(1000);
	});

	it("aucune interpolation ne tombe sur une position que le gabarit refuse à l'exécution", () => {
		expect(
			AUDIT.positionsRefusees,
			`Ces interpolations lèveront une exception dès que l'écran sera ouvert :\n` +
				`${lister(AUDIT.positionsRefusees)}\n\n` +
				`Position « balise » = entre deux attributs : utiliser drapeau('checked') ou ` +
				`attribut('aria-current', 'page'), qui déclarent la position et rendent un SafeHtml.\n` +
				`Position « interdit » = <script>/<style>/nom d'attribut/commentaire : le gabarit ` +
				`ne sait pas y échapper, il faut sortir la valeur du balisage.`,
		).toEqual([]);
	});

	it("aucun balisage n'est écrit en chaîne dans src/", () => {
		expect(
			AUDIT.balisagesEcrits,
			`Ce balisage est une CHAÎNE : partout où il entrera dans un gabarit, il sera ` +
				`échappé, et l'enfant le lira en clair.\n${lister(AUDIT.balisagesEcrits)}\n\n` +
				'Écrire html`<span …>…</span>` plutôt que la chaîne. Si la chaîne est ' +
				'légitime, l’ajouter à BALISAGE_EN_CHAINE_ADMIS **avec sa raison**.',
		).toEqual([]);
	});

	it('chaque appel au moteur de figures est marqué à sa frontière', () => {
		expect(
			AUDIT.figuresNonMarquees,
			`Le moteur de figures reste en \`string\` par décision (#614) : chaque point ` +
				`d'entrée doit être marqué À L'APPEL, sinon la figure s'affiche en clair.\n` +
				`${lister(AUDIT.figuresNonMarquees)}\n\n` +
				'Envelopper dans brut(…), en disant en commentaire pourquoi la valeur est de confiance.',
		).toEqual([]);
	});
});
