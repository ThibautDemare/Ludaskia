import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { compile, compileString } from 'sass';

/* ============================================================
   Gate des commentaires SCSS : un commentaire ne doit pas avaler de code.

   Note liminaire, qui dit déjà quelque chose du sujet : ce fichier ne peut pas écrire
   le terminateur de commentaire (étoile puis slash, collés) à l'intérieur d'un
   commentaire, sous peine de se fermer lui-même au milieu d'une phrase. Il est donc
   appelé « le terminateur » en prose, tandis que la faute de frappe, « * / » avec une
   espace, s'écrit sans risque — puisque justement elle ne termine rien.

   ── Le défaut, tel qu'il s'est produit (corrigé par 36bf465) ───────────────────
   Dans `encadrant.scss`, un commentaire s'est retrouvé fermé par « * / » au lieu du
   terminateur. Sass a donc continué de chercher, a trouvé le terminateur du
   commentaire SUIVANT dix lignes plus bas, et a avalé au passage toute la règle
   `.enc-compo-frise { flex-basis: 100%; margin: 0; }` comme du texte de commentaire.
   La règle a simplement cessé d'exister dans le CSS produit : le repli des 12
   semaines n'avait plus ni sa pleine largeur ni ses marges.

   Ce qui justifie un gate plutôt qu'« relire plus attentivement » : le défaut a
   traversé TOUTE la chaîne sans un mot.
     • `prettier --check` déclarait le fichier conforme — pire, Prettier avait
       REFORMATÉ la prose avalée (apostrophes déplacées, indentation), ce qui rendait
       le pâté illisible sans jamais rien signaler ;
     • `npm run build` réussissait ;
     • `npm test`, `npm run lint`, `npm run typecheck` restaient verts.
   Rien dans l'outillage ne remarque une règle CSS qui cesse d'exister. C'est un œil
   extérieur qui l'a vu en compilant la feuille à la main.

   ── Comment ce gate s'y prend : trois filets ──────────────────────────────────
   1. MÉCANISME (le plus général). Pour qu'un commentaire avale du code, il faut qu'il
      vole le terminateur d'un commentaire situé plus loin — donc que le commentaire
      fautif CONTIENNE le « /* » de celui qu'il a mangé. Cette trace est inévitable et
      n'a aucune raison d'exister dans de la prose : 0 occurrence sur les 911
      commentaires bloc du dépôt (mesure du 26/08/2026).
   2. CONTENU. Une ligne de code reconnaissable à l'intérieur d'un commentaire : ligne
      finissant par « { », « } » seule, déclaration `prop: valeur;`, directive
      `@include …;`. Attrape le cas où le terminateur volé venait d'ailleurs (d'une
      chaîne, d'une ligne `// …` qui en contient un). Ces quatre motifs sont mesurés à
      0 faux positif sur les 911 commentaires — contrairement à deux signaux plus
      naïfs, écartés pour cette raison :
        • « le commentaire contient { » → 2 faux positifs, de la prose qui cite un
          extrait de CSS en ligne (`@media print { .sheets }` dans sheets.scss,
          `.v-continue { display:inline-flex }` dans vitrine.scss). Citer du code dans
          une phrase reste donc permis ; c'est du code SUR SA LIGNE qui est interdit ;
        • « une ligne finit par ; » → 15 faux positifs : le français met des
          points-virgules en milieu de phrase, et Prettier coupe les lignes à 100
          colonnes. Signal inutilisable.
   3. ORACLE SASS. Chaque feuille est réellement compilée, et les filets 1 et 2 sont
      rejoués sur les commentaires du CSS PRODUIT. Trois choses en plus du textuel : la
      feuille compile (rien dans `npm test` ne le vérifiait), le découpage des
      commentaires est celui de Sass et non le mien (mon tokenizer ne peut donc pas
      diverger en silence), et c'est le symptôme réel qu'on mesure — Sass conserve les
      commentaires « loud » dans sa sortie, la règle avalée s'y retrouve donc noir sur
      blanc À L'INTÉRIEUR d'un commentaire.
   Le dernier bloc du fichier rejoue la feuille abîmée telle qu'elle s'est produite
   (extrait réel de 36bf465^) et exige que les trois filets la refusent : sans ça, un
   scan cassé rendrait ce gate vert pour toujours.

   ── CE QUE CE GATE NE VOIT PAS ────────────────────────────────────────────────
   Un gate dont on surestime la portée est plus dangereux que pas de gate.
     • Il ne garde QUE la disparition par commentaire. Une règle qui s'évapore
       autrement — mixin plus jamais inclus, branche `@if` jamais prise, sélecteur mal
       orthographié qui ne correspond à aucun HTML, règle écrasée par une autre plus
       loin — passe tranquillement. C'est le vrai trou : « la règle existe dans le
       CSS » n'est pas « la règle s'applique à l'élément visé ».
     • Il ne vérifie AUCUNE valeur. `flex-basis: 100%` devenu `flex-basis: 10%` est
       invisible ici (c'est le domaine du e2e et de la relecture).
     • Un commentaire avalant du code dans un `@mixin` JAMAIS INCLUS échappe au filet 3
       (Sass n'émet pas les commentaires d'un mixin non appelé) — les filets 1 et 2,
       purement textuels, le voient ; c'est précisément pourquoi ils sont gardés en plus
       de l'oracle.
     • Un commentaire qui avalerait du code SANS ligne reconnaissable et SANS voler de
       terminateur de commentaire n'existe pas dans un fichier passé par Prettier ; mais
       le jour où l'on cesserait de formater les feuilles, les motifs du filet 2
       perdraient leur garantie (ils s'appuient sur « une déclaration est seule sur sa
       ligne »).
     • Il ne couvre que les `.scss` de `src/` : ni le CSS inline d'`index.html`, ni
       celui d'un futur composant.
   ============================================================ */

/* ---------- Les feuilles ---------- */

function feuilles(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir)) {
		const p = `${dir}/${e}`;
		if (statSync(p).isDirectory()) out.push(...feuilles(p));
		else if (p.endsWith('.scss')) out.push(p);
	}
	return out;
}

const FEUILLES = feuilles('src');

/* ---------- Découpage strict : commentaires, chaînes, code ---------- */

type Bloc = {
	/** Ligne où le commentaire s'ouvre, pour un message qui pointe l'endroit. */
	ligne: number;
	/** Contenu, délimiteurs exclus. */
	texte: string;
	/** Faux si aucun terminateur n'a été trouvé avant la fin du fichier. */
	termine: boolean;
};

type Decoupe = {
	blocs: Bloc[];
	/** Lignes portant un terminateur en position de CODE (donc orphelin). */
	terminateursOrphelins: number[];
};

/** Parcours caractère par caractère, dans l'ordre où Sass lit : `//` jusqu'au bout de la
 *  ligne, un commentaire bloc jusqu'à son PREMIER terminateur, chaînes traversées sans
 *  être interprétées (une apostrophe de prose vit dans un commentaire, pas dans du code —
 *  et la seule `url()` du dépôt est entre quotes). Fait à la main plutôt qu'à coups de
 *  regex, comme dans `cles-stockage-gate.test.ts` : une regex sur `//` casse sur les
 *  `https://`, et une regex sur les commentaires ne sait pas dire « pas terminé ». */
function decoupe(src: string): Decoupe {
	const blocs: Bloc[] = [];
	const terminateursOrphelins: number[] = [];
	let ligne = 1;
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		const n = src[i + 1];
		if (c === '\n') {
			ligne++;
			i++;
			continue;
		}
		if (c === '/' && n === '/') {
			while (i < src.length && src[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && n === '*') {
			const ligneOuverture = ligne;
			i += 2;
			const debut = i;
			while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
				if (src[i] === '\n') ligne++;
				i++;
			}
			const termine = i < src.length;
			const texte = src.slice(debut, termine ? i : src.length);
			blocs.push({ ligne: ligneOuverture, texte, termine });
			i += 2;
			continue;
		}
		if (c === '*' && n === '/') {
			terminateursOrphelins.push(ligne);
			i += 2;
			continue;
		}
		if (c === "'" || c === '"') {
			const guillemet = c;
			i++;
			while (i < src.length && src[i] !== guillemet) {
				if (src[i] === '\\') i += 2;
				else if (src[i] === '\n') {
					ligne++;
					i++;
				} else i++;
			}
			i++;
			continue;
		}
		i++;
	}
	return { blocs, terminateursOrphelins };
}

/* ---------- Les signaux ---------- */

type Signal = { nom: string; motif: RegExp; quoi: string };

/** Filet 1 — le mécanisme même du vol de terminateur. */
const MECANISME: Signal = {
	nom: 'ouverture de commentaire avalée',
	motif: /\/\*/,
	quoi:
		'ce commentaire en contient un autre (une ouverture « /* » à l’intérieur), ce qui veut ' +
		'dire qu’il s’est terminé sur le terminateur d’un commentaire SUIVANT : tout ce qu’il y ' +
		'avait entre les deux a été avalé.',
};

/** Filet 2 — du code reconnaissable, seul sur sa ligne. Les motifs sont ancrés sur la
 *  LIGNE (drapeau `m`) : citer `.v-continue { display:inline-flex }` au fil d'une phrase
 *  reste permis, c'est une LIGNE de code qui ne l'est pas. */
const CONTENU: Signal[] = [
	{
		nom: 'ouverture de règle',
		motif: /^[^\n]*\{[ \t]*\r?$/m,
		quoi: 'une ligne finit par « { » — c’est un sélecteur qui ouvre un bloc.',
	},
	{
		nom: 'fermeture de bloc',
		motif: /^[ \t]*\}[ \t]*\r?$/m,
		quoi: 'une ligne ne contient qu’un « } » — c’est la fin d’un bloc.',
	},
	{
		nom: 'déclaration CSS',
		motif: /^[ \t]*[a-z-]{2,}[ \t]*:[ \t]*[^;{}\n]{1,120};[ \t]*\r?$/m,
		quoi: 'une ligne a la forme d’une déclaration `propriété: valeur;`.',
	},
	{
		nom: 'directive Sass',
		motif: /^[ \t]*@[a-z-]+[^;{}\n]*;[ \t]*\r?$/m,
		quoi: 'une ligne a la forme d’une directive `@include …;`.',
	},
];

type Constat = { ligne: number; signal: Signal; extrait: string };

/** La ligne du commentaire qui a déclenché le signal, pour montrer du doigt. */
function extrait(texte: string, motif: RegExp): string {
	const m = texte.match(motif);
	if (!m) return '';
	const avant = texte.slice(0, m.index ?? 0);
	const ligne = texte.slice(avant.lastIndexOf('\n') + 1).split('\n')[0];
	return ligne.trim().slice(0, 120);
}

type Verdict = { constats: Constat[]; nonTermines: number[]; orphelins: number[] };

/** Tous les commentaires suspects d'un texte SCSS ou CSS. */
function suspects(src: string): Verdict {
	const { blocs, terminateursOrphelins } = decoupe(src);
	const constats: Constat[] = [];
	for (const bloc of blocs)
		for (const signal of [MECANISME, ...CONTENU])
			if (signal.motif.test(bloc.texte))
				constats.push({ ligne: bloc.ligne, signal, extrait: extrait(bloc.texte, signal.motif) });
	return {
		constats,
		nonTermines: blocs.filter((b) => !b.termine).map((b) => b.ligne),
		orphelins: terminateursOrphelins,
	};
}

const CONSEQUENCE =
	'Conséquence : la règle avalée CESSE D’EXISTER dans le CSS produit. Rien ne le signale — ' +
	'prettier --check passe, le build réussit, lint/typecheck/test restent verts (c’est ' +
	'exactement ce qui est arrivé à `.enc-compo-frise`, corrigé par 36bf465).\n' +
	'Chercher juste au-dessus un « * / » (avec une espace) ou un terminateur manquant.';

const detail = (constats: Constat[]): string =>
	constats.map((c) => `  • ligne ${c.ligne} — ${c.signal.quoi}\n    « ${c.extrait} »`).join('\n');

/** Le CSS débarrassé de ses commentaires, c'est-à-dire ce qui S'APPLIQUE vraiment. Sert
 *  à l'auto-test : le texte d'une règle avalée est TOUJOURS là dans la sortie (Sass le
 *  recopie comme prose), c'est son existence en tant que RÈGLE qui a disparu. Comparer
 *  la chaîne brute ne montrerait donc rien. Découpage à la regex, suffisant ici : dans du
 *  CSS produit, « /* » n'apparaît qu'en ouverture de commentaire. */
const codeSeul = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/* ---------- Filets 1 et 2 : sur les sources ---------- */

const SOURCES = new Map<string, string>(FEUILLES.map((f) => [f, readFileSync(f, 'utf8')]));
const BLOCS = [...SOURCES.values()].flatMap((src) => decoupe(src).blocs);

describe('Commentaires SCSS : aucun ne doit avaler de code (36bf465)', () => {
	it('le scan trouve bien les feuilles et leurs commentaires (garde contre un gate à vide)', () => {
		// Mesure du 26/08/2026 : 38 feuilles, 911 commentaires bloc. Un scan cassé, ou des
		// feuilles déplacées hors de `src/`, rendraient ce gate vert en n'examinant rien.
		expect(
			FEUILLES.length,
			'moins de 30 feuilles .scss trouvées sous src/ : le scan ne garde plus rien.',
		).toBeGreaterThanOrEqual(30);
		expect(
			BLOCS.length,
			'moins de 500 commentaires bloc trouvés : le découpage est cassé.',
		).toBeGreaterThanOrEqual(500);
	});

	it.each([...SOURCES.keys()])('%s : ses commentaires ne contiennent pas de code', (fichier) => {
		const { constats, nonTermines, orphelins } = suspects(SOURCES.get(fichier)!);
		expect(
			nonTermines.map((l) => `ligne ${l}`),
			`${fichier} : un commentaire ouvert n’est JAMAIS fermé — il manque son terminateur ` +
				`(Sass refusera de compiler la feuille).`,
		).toEqual([]);
		expect(
			orphelins.map((l) => `ligne ${l}`),
			`${fichier} : un terminateur de commentaire traîne en position de code, sans « /* » ` +
				`pour l’ouvrir.`,
		).toEqual([]);
		expect(
			constats.map((c) => `${fichier}:${c.ligne} [${c.signal.nom}] ${c.extrait}`),
			`${fichier} : au moins un commentaire contient du code.\n${detail(constats)}\n${CONSEQUENCE}`,
		).toEqual([]);
	});

	it('la séquence « * / » n’apparaît dans aucune feuille', () => {
		// Le symptôme exact du défaut, nommé pour lui-même : c'est le message le plus utile
		// quand la faute de frappe vient d'être commise. Une étoile suivie d'une espace puis
		// d'un slash n'a aucun sens en SCSS, ni en code ni en prose (0 occurrence au 26/08/2026).
		const fautes: string[] = [];
		for (const [fichier, src] of SOURCES)
			for (const m of src.matchAll(/\*[ \t]+\//g))
				fautes.push(`${fichier}:${src.slice(0, m.index).split('\n').length}`);
		expect(
			fautes,
			`Un commentaire est fermé par « * / » (avec une espace) au lieu du terminateur.\n` +
				`Sass va alors chercher plus loin, trouver le terminateur du commentaire suivant, et ` +
				`avaler tout le code entre les deux.\n${CONSEQUENCE}`,
		).toEqual([]);
	});
});

/* ---------- Filet 3 : l'oracle Sass ---------- */

describe('CSS produit : aucun commentaire ne doit renfermer de règle (36bf465)', () => {
	/* Sass conserve les commentaires « loud » dans sa sortie : si une règle a été avalée,
	   elle se retrouve VERBATIM à l'intérieur d'un commentaire du CSS produit. On mesure
	   donc le symptôme réel, avec le découpage de Sass et non le mien. Les feuilles sont
	   toutes autonomes (aucun @use / @import entre elles) et Vite les compile une par une,
	   exactement comme ici. */
	it.each([...SOURCES.keys()])('%s compile, et son CSS ne cache pas de règle', (fichier) => {
		let css = '';
		expect(() => {
			css = compile(fichier, { style: 'expanded' }).css;
		}, `${fichier} ne compile pas — la feuille n’arrivera pas dans le bundle.`).not.toThrow();
		expect(
			css.length,
			`${fichier} compile mais ne produit rien : le test ne garde plus rien.`,
		).toBeGreaterThan(0);
		const { constats } = suspects(css);
		expect(
			constats.map((c) => `[${c.signal.nom}] ${c.extrait}`),
			`${fichier} : le CSS produit contient un commentaire qui renferme du code — donc une ou ` +
				`plusieurs règles ont été AVALÉES par ce commentaire au lieu d’être compilées.\n` +
				`${detail(constats)}\n${CONSEQUENCE}`,
		).toEqual([]);
	});
});

/* ---------- Auto-test : le gate voit-il encore le défaut ? ---------- */

/** La feuille abîmée telle qu'elle s'est produite (extrait réel de 36bf465^,
 *  `src/styles/encadrant.scss` autour de la ligne 1230 — Prettier avait déjà reformaté la
 *  prose avalée, d'où les apostrophes et l'indentation absurdes, et il déclarait le fichier
 *  CONFORME dans cet état). Gardée telle quelle : un gate qui ne détecte plus le défaut
 *  d'origine doit échouer bruyamment, pas rester vert. */
const DEFAUT_ORIGINE = `.enc-compo-texte {
	display: block;
	color: var(--grey);
}
/* Repli des 12 semaines : dernier enfant de la ligne avec le repli des mots, donc pleine
   largeur, et l'
		ordre du DOM reste l
		'ordre visuel (a11y : ordre de focus = ordre de lecture).
   Il vient AVANT « Voir les mots » : c'
		est le prolongement direct de la barre du jour qui le précède,
	alors que la liste des mots est un autre sujet. * / .enc-compo-frise {
	flex-basis: 100%;
	margin: 0;
}
/* Les 12 semaines, dans le repli. 40px et non les 26px de la frise d'états. */
.enc-compo-cells {
	display: flex;
	gap: 2px;
}
`;

/** La même feuille SAINE : commentaire correctement fermé, tout le reste identique. */
const VERSION_SAINE = DEFAUT_ORIGINE.replace(
	'sujet. * / .enc-compo-frise {',
	'sujet. */\n.enc-compo-frise {',
);

const SYMPTOME = /\*[ \t]+\//;

describe('Le gate voit-il encore le défaut d’origine ?', () => {
	it('la version saine passe les trois filets (pas de faux positif)', () => {
		const textuel = suspects(VERSION_SAINE);
		expect(textuel.constats).toEqual([]);
		expect(textuel.nonTermines).toEqual([]);
		expect(textuel.orphelins).toEqual([]);
		expect(SYMPTOME.test(VERSION_SAINE)).toBe(false);
		const css = compileString(VERSION_SAINE, { syntax: 'scss', style: 'expanded' }).css;
		expect(suspects(css).constats).toEqual([]);
		// Et la règle est bien là : c'est ce que le défaut faisait disparaître.
		expect(codeSeul(css)).toMatch(/\.enc-compo-frise \{\s*flex-basis: 100%;/);
	});

	it('filet 1 : le commentaire fautif est reconnu comme ayant avalé une ouverture', () => {
		const noms = suspects(DEFAUT_ORIGINE).constats.map((c) => c.signal.nom);
		expect(noms).toContain(MECANISME.nom);
	});

	it('filet 2 : les lignes de code avalées sont reconnues', () => {
		const noms = suspects(DEFAUT_ORIGINE).constats.map((c) => c.signal.nom);
		// La règle avalée apporte les trois formes à la fois : `… .enc-compo-frise {`,
		// `flex-basis: 100%;` et le `}` final.
		expect(noms).toContain('ouverture de règle');
		expect(noms).toContain('déclaration CSS');
		expect(noms).toContain('fermeture de bloc');
	});

	it('le symptôme « * / » est reconnu', () => {
		expect(SYMPTOME.test(DEFAUT_ORIGINE)).toBe(true);
	});

	/* Les deux autres façons de casser un délimiteur. Elles font déjà échouer la
	   compilation, donc le build les attrape — mais les assertions correspondantes du
	   filet 1 ne sont exercées par AUCUNE feuille du dépôt (toutes saines) : sans ces
	   deux cas, ce seraient des lignes mortes qu'on croirait actives. */
	it('un commentaire jamais fermé est reconnu comme non terminé', () => {
		const abime = '.a {\n\tmargin: 0;\n}\n/* prose sans fin\n.b {\n\tmargin: 0;\n}\n';
		expect(suspects(abime).nonTermines).toEqual([4]);
		expect(() => compileString(abime, { syntax: 'scss' })).toThrow();
	});

	it('un terminateur orphelin, en position de code, est reconnu', () => {
		const abime = '.a {\n\tmargin: 0;\n}\n*/\n.b {\n\tmargin: 0;\n}\n';
		expect(suspects(abime).orphelins).toEqual([4]);
		expect(() => compileString(abime, { syntax: 'scss' })).toThrow();
	});

	it('filet 3 : la règle a disparu du CSS produit, et le commentaire la renferme', () => {
		const css = compileString(DEFAUT_ORIGINE, { syntax: 'scss', style: 'expanded' }).css;
		// Le symptôme, mesuré : plus aucune RÈGLE `.enc-compo-frise` dans la sortie…
		expect(codeSeul(css)).not.toContain('.enc-compo-frise');
		// … alors que son texte, lui, est toujours là — à l'intérieur d'un commentaire. C'est
		// tout le piège du défaut : la feuille « contient » encore la règle à la lecture.
		expect(css).toContain('flex-basis: 100%');
		expect(suspects(css).constats.map((c) => c.signal.nom)).toContain('déclaration CSS');
	});
});
