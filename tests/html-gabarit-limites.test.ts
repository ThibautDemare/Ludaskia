import { describe, it, expect } from 'vitest';
import {
	html,
	brut,
	attribut,
	drapeau,
	joindre,
	analyserPositions,
	VIDE,
	type ValeurHtml,
} from '../src/core/html';

/* ============================================================
   Le gabarit `html` (#614) — BORDS du contrat.

   `tests/html-gabarit.test.ts` couvre le chemin nominal de chaque position et
   `tests/html-injection-balayage.test.ts` balaie les caractères. Ce fichier prend
   ce que ni l'un ni l'autre ne regarde : l'ORDRE de traitement des valeurs dans
   `rendre`, les positions que le gabarit REFUSE (et la qualité de ce refus), les
   entrées de `analyserPositions` qu'aucun site d'appel n'écrit encore, et les
   trois helpers (`attribut`, `drapeau`, `joindre`).

   Deux principes tenus ici :

   - **l'attendu est dérivé du contrat, pas du code.** Pour la position d'URL, le
     juge n'est pas la regex du module mais l'ANALYSEUR : on lit `a.protocol` après
     rendu. Un test qui recopierait `^\s*(javascript|data|vbscript)\s*:` validerait
     aussi bien la règle que ses trous ;
   - **on ne fige pas ce qui est douteux.** Là où le module accepte quelque chose
     qui mériterait discussion (un nombre entre deux attributs, un `on…` dans
     `attribut()`), on éprouve l'invariant de SÛRETÉ (« ça ne peut rien injecter »)
     plutôt que la forme exacte de la sortie, pour ne pas verrouiller un choix qui
     n'est pas encore arbitré.
   ============================================================ */

/** Rend un balisage et rend l'élément analysé : c'est le parseur qui tranche. */
function analyser(balisage: string): Element | null {
	const hote = document.createElement('div');
	hote.innerHTML = balisage;
	return hote.firstElementChild;
}

describe('rendre : ordre de traitement des valeurs', () => {
	it('la chaîne vide est admise partout, y compris dans les positions refusées', () => {
		// C'est la branche « rien à ajouter » de `${cond ? drapeau('checked') : ''}` :
		// une chaîne vide ne peut rien injecter, donc la refuser ne ferait que du bruit.
		expect(html`<button ${''}>x</button>`.balisage).toBe('<button >x</button>');
		expect(html`<script>${''}</script>`.balisage).toBe('<script></script>');
		expect(html`<!-- ${''} -->`.balisage).toBe('<!--  -->');
		// Et l'élément produit reste ce qu'on croit : un bouton sans attribut.
		expect(analyser(html`<button ${''}>x</button>`.balisage)?.getAttributeNames()).toEqual([]);
	});

	it('une branche non prise ne rend rien, quelle que soit sa forme', () => {
		// `false`/`null`/`undefined`, mais aussi le tableau vide et le tableau de
		// branches non prises : tous doivent se comporter comme la chaîne vide, sinon
		// `${liste.map(…)}` sur une liste vide casserait dans une position refusée.
		const vides: ValeurHtml[] = [false, null, undefined, '', [], [false, null], [[], ['']]];
		for (const v of vides) {
			expect(html`<p>${v}</p>`.balisage, `texte : ${JSON.stringify(v)}`).toBe('<p></p>');
			expect(html`<button ${v}>x</button>`.balisage, `balise : ${JSON.stringify(v)}`).toBe(
				'<button >x</button>',
			);
		}
	});

	it('aplatit les tableaux imbriqués en échappant chaque feuille', () => {
		expect(html`<p>${['a', ['<b>', ['&']]]}</p>`.balisage).toBe('<p>a&lt;b&gt;&amp;</p>');
		// Feuilles mélangées : une chaîne s'échappe, un fragment passe tel quel.
		expect(html`<ul>${[html`<li>a</li>`, ['<i>']]}</ul>`.balisage).toBe(
			'<ul><li>a</li>&lt;i&gt;</ul>',
		);
	});

	it('refuse `true` là où `false` est ignoré', () => {
		// `${cond && frag}` donne `false` quand la condition tombe : c'est le motif
		// visé. `true` n'est jamais ce qu'on a voulu écrire — le rendre « true » à
		// l'écran serait le seul comportement qu'aucun appelant ne demande.
		expect(html`<p>${false}</p>`.balisage).toBe('<p></p>');
		expect(() => html`<p>${true as unknown as ValeurHtml}</p>`).toThrow(/boolean/);
	});

	it('refuse un type non prévu plutôt que de rendre « [object Object] »', () => {
		expect(() => html`<p>${{ a: 1 } as unknown as ValeurHtml}</p>`).toThrow(/object/);
		expect(() => html`<p>${10n as unknown as ValeurHtml}</p>`).toThrow(/bigint/);
		expect(() => html`<p>${(() => 1) as unknown as ValeurHtml}</p>`).toThrow(/function/);
	});

	it('refuse tout nombre non fini, dans les deux sens', () => {
		// Un « NaN » affiché à un enfant est un bug muet : il ne casse rien et se lit
		// comme une réponse. Les trois valeurs non finies doivent échouer, pas seulement
		// celle à laquelle on pense.
		for (const n of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
			expect(() => html`<b>${n}</b>`, String(n)).toThrow(/non fini/);
	});

	it('un nombre ne peut jamais s’échapper de sa position', () => {
		// Les nombres court-circuitent l'échappement (`String(n)` direct). C'est sûr
		// SI et seulement si aucun nombre fini ne produit d'espace, de guillemet ni de
		// chevron — on l'éprouve au lieu de le supposer, bornes du format comprises.
		const nombres = [0, -0, -1, 3.5, 1e21, 1e-7, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE];
		for (const n of nombres) {
			expect(String(n), `forme de ${n}`).toMatch(/^[-\d.e+]+$/);
			const el = analyser(html`<i class=${n}></i>`.balisage);
			expect(el?.getAttributeNames(), `attribut nu pour ${n}`).toEqual(['class']);
			expect(el?.getAttribute('class'), `valeur pour ${n}`).toBe(String(n));
		}
	});
});

describe('position URL : c’est le schéma qui décide, et l’analyseur qui juge', () => {
	/** Protocole vu par le DOM après rendu — l'oracle indépendant de la regex du module. */
	function protocole(valeur: string): string {
		const hote = document.createElement('div');
		hote.innerHTML = html`<a href="${valeur}">x</a>`.balisage;
		return hote.querySelector('a')?.protocol ?? '';
	}

	it('CONTRÔLE : l’oracle sait reconnaître une URL exécutable', () => {
		// Sans ce contrôle, un test qui n'observe jamais « javascript: » passerait aussi
		// bien si `protocol` ne rapportait jamais rien. On court-circuite donc le gabarit
		// (qui, lui, refuse la forme littérale, brut() compris) pour vérifier l'oracle.
		const hote = document.createElement('div');
		hote.innerHTML = '<a href="javascript:alert(1)">x</a>';
		expect(hote.querySelector('a')?.protocol).toBe('javascript:');
		// … et qu'il sait aussi dire « ce n'est pas exécutable ».
		expect(protocole('#ok')).not.toBe('javascript:');
	});

	it('une entité ne reconstitue pas un schéma depuis une chaîne', () => {
		// `&#106;avascript:` est décodé par l'analyseur dans un attribut. Ce qui protège
		// ici n'est pas le contrôle de schéma (la regex ne voit rien) mais l'échappement
		// de l'esperluette : les deux doivent tenir ensemble.
		expect(protocole('&#106;avascript:alert(1)')).not.toBe('javascript:');
		expect(protocole('&#x6a;avascript:alert(1)')).not.toBe('javascript:');
	});

	it('laisse passer les URL que l’application écrit vraiment', () => {
		expect(() => html`<a href="${'#lecon-num-comparer'}">x</a>`).not.toThrow();
		expect(() => html`<img src="${'/Ludaskia/pwa-192.png'}" />`).not.toThrow();
		expect(() => html`<a href="${'mailto:a@b.fr'}">x</a>`).not.toThrow();
	});

	it('critère 4 : aucune variante d’un schéma exécutable ne passe', () => {
		// Le refus ne peut pas porter sur la seule forme littérale « javascript: » :
		// l'analyseur d'URL RETIRE les tabulations et retours ligne où qu'ils soient,
		// et ignore les caractères de contrôle de tête. « java<TAB>script: » est donc
		// une URL javascript pour le navigateur, pas une chaîne inerte.
		const variantes = [
			'java\tscript:alert(1)',
			'java\nscript:alert(1)',
			'java\rscript:alert(1)',
			'jav\ta\nscript:alert(1)',
			'\x01javascript:alert(1)',
			'\x00javascript:alert(1)',
			'\x08javascript:alert(1)',
			'\x1fjavascript:alert(1)',
		];
		const passees: string[] = [];
		for (const v of variantes) {
			try {
				if (protocole(v) === 'javascript:') passees.push(`${JSON.stringify(v)} → javascript:`);
			} catch {
				// refusé par le gabarit : c'est l'attendu.
			}
		}
		expect(passees, `Variantes rendues exécutables :\n${passees.join('\n')}`).toEqual([]);
	});
});

describe('positions refusées : le refus doit être exploitable', () => {
	/** Message d'erreur levé par `f`, ou chaîne vide si `f` n'a rien levé. */
	function messageDErreur(f: () => unknown): string {
		try {
			f();
		} catch (e) {
			return (e as Error).message;
		}
		return '';
	}

	it('le message dit où l’on est ET propose l’issue', () => {
		// Un refus n'a de valeur que s'il se corrige sans lire le module : il doit
		// nommer la position et l'échappatoire (fragment `html` / `brut`).
		const message = messageDErreur(() => html`<button ${'disabled'}>x</button>`);
		expect(message).toMatch(/entre deux attributs/);
		expect(message).toMatch(/brut\(/);
		expect(message).toContain('disabled'); // l'aperçu de la valeur fautive
	});

	it('n’écrit pas la valeur entière dans le message', () => {
		// Une valeur non fiable peut être longue (import de sauvegarde) : le message
		// doit rester lisible en console, pas déverser la donnée.
		const long = 'x'.repeat(5000);
		const message = messageDErreur(() => html`<button ${long}>x</button>`);
		expect(message).toMatch(/…/); // l'aperçu est tronqué
		expect(message.length).toBeLessThan(400);
	});

	it('refuse aussi dans un script en majuscules ou resté ouvert', () => {
		expect(() => html`<SCRIPT>${'x'}</SCRIPT>`).toThrow();
		expect(() => html`<script>var a = "${'x'}";</script>`).toThrow();
		expect(() => html`<style>.a { content: "${'x'}"; }</style>`).toThrow();
	});

	it('un « < » littéral du balisage statique fait échouer, il ne devine pas', () => {
		// L'automate n'est pas un parseur HTML5 : un `<` suivi d'autre chose qu'un nom
		// de balise le laisse « dans une balise ». Le refus est la bonne issue (bruyant
		// à la première exécution) — le balisage, lui, doit écrire `&lt;`.
		expect(() => html`<p>3 < 5 ${'x'}</p>`).toThrow();
		expect(html`<p>3 &lt; 5 ${'x'}</p>`.balisage).toBe('<p>3 &lt; 5 x</p>');
	});

	it('un fragment reste accepté là où une chaîne est refusée', () => {
		// C'est la sortie que le message propose : elle doit exister pour de vrai.
		expect(html`<button${drapeau('disabled')}>x</button>`.balisage).toBe(
			'<button disabled>x</button>',
		);
		expect(html`<a${attribut('href', '#ok')}>x</a>`.balisage).toBe('<a href="#ok">x</a>');
		expect(html`<button ${VIDE}>x</button>`.balisage).toBe('<button >x</button>');
	});
});

describe('analyserPositions : le balisage que le dépôt écrit, et ses bords', () => {
	const cas: [string, string[], string[]][] = [
		['attribut à quotes simples', ["<i title='", "'></i>"], ['attribut-quote']],
		['valeur nue', ['<i class=', '></i>'], ['attribut-nu']],
		['juste après le = (valeur nue à venir)', ['<i class=', ' hidden>'], ['attribut-nu']],
		['URL à quotes simples', ["<a href='", "'>"], ['url']],
		['URL non quotée', ['<a href=', '>'], ['url']],
		['nom d’attribut à deux points', ['<use xlink:href="', '" />'], ['url']],
		['nom d’attribut en majuscules', ['<a HREF="', '">'], ['url']],
		['attribut URL après un autre attribut', ['<a class="c" href="', '">'], ['url']],
		['attribut ordinaire après une URL', ['<a href="#" class="', '">'], ['attribut-quote']],
		[
			'deux trous dans le même attribut',
			['<i class="a', ' b', '"></i>'],
			['attribut-quote', 'attribut-quote'],
		],
		['attribut sans valeur puis texte', ['<input disabled>', '</p>'], ['texte']],
		['balise auto-fermante puis texte', ['<img src="a" /><p>', '</p>'], ['texte']],
		['commentaire refermé puis texte', ['<!-- c --><p>', '</p>'], ['texte']],
		['script refermé puis texte', ['<script>let a = 1;</script><p>', '</p>'], ['texte']],
		['style refermé puis texte', ['<style>a{}</style><p>', '</p>'], ['texte']],
		['dans un nom d’attribut', ['<i data-', '="x"></i>'], ['interdit']],
		['dans un commentaire', ['<!-- ', ' -->'], ['interdit']],
		['dans un script', ['<script>', '</script>'], ['interdit']],
		['nom de balise', ['<', ' class="x">'], ['balise']],
		['entre deux attributs', ['<i class="a" ', '>'], ['balise']],
		['texte puis attribut', ['<p class="', '">', '</p>'], ['attribut-quote', 'texte']],
	];

	for (const [nom, parts, attendu] of cas)
		it(nom, () => {
			expect(analyserPositions(parts)).toEqual(attendu);
		});

	it('ne rend jamais plus de positions qu’il n’y a de trous', () => {
		// Un décalage d'un cran ferait échapper chaque valeur selon la position de la
		// SUIVANTE — le pire des défauts possibles ici, et parfaitement silencieux.
		expect(analyserPositions(['<p>'])).toEqual([]);
		expect(analyserPositions(['<p>', '</p>'])).toHaveLength(1);
		expect(analyserPositions(['<p>', '', '</p>'])).toHaveLength(2);
	});
});

describe('mémorisation par site d’appel', () => {
	/** Deux SITES distincts au balisage identique : chacun a son tableau de morceaux. */
	const siteA = (v: string) => html`<i class="${v}"></i>`;
	const siteB = (v: string) => html`<i class="${v}"></i>`;

	it('un site réutilisé garde ses positions, pas son résultat', () => {
		// Si le cache mémorisait la SORTIE au lieu des positions, la deuxième valeur
		// sortirait avec l'échappement de la première (ou pas du tout).
		const site = (v: string) => html`<i class="${v}"></i>`;
		expect(site('ok').balisage).toBe('<i class="ok"></i>');
		expect(site('" onmouseover="x()').balisage).toBe(
			'<i class="&quot; onmouseover=&quot;x()"></i>',
		);
		expect(analyser(site('" onmouseover="x()').balisage)?.getAttributeNames()).toEqual(['class']);
	});

	it('deux sites au balisage identique ne se confondent pas', () => {
		expect(siteA('<a>').balisage).toBe(siteB('<a>').balisage);
		expect(analyser(siteA('<a>').balisage)?.getAttribute('class')).toBe('<a>');
	});
});

describe('la position analysée doit être celle qui est réellement émise', () => {
	it('une séquence d’échappement du balisage statique ne décale pas la position', () => {
		// Un gabarit balisé reçoit DEUX versions de ses morceaux : les morceaux « cuits »
		// (ceux qui partent dans le DOM) et `.raw` (le texte source, échappements non
		// interprétés). Les deux diffèrent dès qu'on écrit `"`, `\x3e`, `\t`… dans
		// le balisage. L'échappement doit se décider sur ce qui est ÉMIS : sinon
		// l'automate croit être encore dans un attribut quoté quand le guillemet a déjà
		// refermé la valeur, et la position tombe à côté sans que rien ne le dise.
		//
		// On construit ici ce que le moteur JS passerait pour
		//   html`<i title=""${valeur}"></i>`
		// c'est-à-dire cuit = `<i title=""`, brut = `<i title=""`.
		const cuit = ['<i title=""', '"></i>'];
		const source = [`<i title="${String.fromCharCode(92)}u0022`, '"></i>'];
		const parts = Object.assign([...cuit], { raw: source }) as unknown as TemplateStringsArray;
		// Sur les morceaux CUITS, la valeur `title` est déjà refermée : l'interpolation
		// tombe donc ENTRE DEUX ATTRIBUTS, et le gabarit refuse — c'est la bonne issue,
		// une chaîne y poserait des attributs arbitraires.
		//
		// Ce test garde bien la régression : en analysant `.raw`, l'automate croirait
		// être encore dans la valeur quotée, échapperait pour ce contexte, et le
		// `onmouseover` atterrirait comme SECOND attribut sans que rien ne lève.
		expect(() => html(parts, 'a onmouseover=vole()')).toThrow(/entre deux attributs/);
	});
});

describe('attribut(), drapeau(), joindre()', () => {
	it('attribut() borne la valeur : elle ne peut pas en ouvrir un second', () => {
		const el = analyser(html`<i${attribut('data-x', '" onmouseover="vole()')}></i>`.balisage);
		expect(el?.getAttributeNames()).toEqual(['data-x']);
		expect(el?.getAttribute('data-x')).toBe('" onmouseover="vole()');
	});

	it('attribut() contrôle le schéma quelle que soit la casse du nom', () => {
		expect(() => attribut('href', 'javascript:1')).toThrow(/schéma/);
		expect(() => attribut('HREF', 'javascript:1')).toThrow(/schéma/);
		expect(() => attribut('xlink:href', 'data:text/html,x')).toThrow(/schéma/);
		expect(attribut('href', '#ok').balisage).toBe(' href="#ok"');
	});

	it('attribut() et drapeau() refusent un nom qui poserait autre chose qu’un attribut', () => {
		// Le nom vient du code, mais il n'est validé qu'ici : une espace ou un guillemet
		// suffirait à écrire deux attributs — dont un `on…` — depuis un seul appel.
		for (const nom of ['a b', 'a"b', 'a>b', '', 'a=b', '1x', "a'b"]) {
			expect(() => attribut(nom, 'x'), `attribut(${JSON.stringify(nom)})`).toThrow(/nom/);
			expect(() => drapeau(nom), `drapeau(${JSON.stringify(nom)})`).toThrow(/nom/);
		}
		expect(drapeau('disabled').balisage).toBe(' disabled');
		expect(drapeau('data-x').balisage).toBe(' data-x');
	});

	it('attribut() accepte un nombre sans le déformer', () => {
		expect(attribut('data-n', 3.5).balisage).toBe(' data-n="3.5"');
		expect(attribut('data-n', 0).balisage).toBe(' data-n="0"');
	});

	it('joindre() n’échappe rien et supporte la liste vide', () => {
		expect(joindre([]).balisage).toBe('');
		expect(joindre([html`<li>${'&'}</li>`, VIDE]).balisage).toBe('<li>&amp;</li>');
		expect(joindre([brut('a'), brut('b')], html` — `).balisage).toBe('a — b');
	});
});
