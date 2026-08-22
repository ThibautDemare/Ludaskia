import { describe, it, expect } from 'vitest';
import { html, brut, joindre, SafeHtml, VIDE } from '../src/core/html';

/* ============================================================
   Le gabarit `html` (#614) — échappement par construction.

   Ce que ces tests éprouvent, c'est la PROMESSE du module : une valeur non fiable
   ne peut pas sortir de sa position d'insertion. On teste donc par position
   (texte, attribut quoté, attribut nu, URL) plutôt que par caractère, parce que
   c'est la position qui décide de ce qui est dangereux — l'espace n'est inoffensif
   qu'entre guillemets, et aucun échappement ne neutralise un `javascript:`.

   Les attendus sont écrits à la main à partir du contrat, jamais recopiés de la
   sortie du code : un test qui note ce que la fonction fait déjà ne prouve que sa
   propre complaisance.
   ============================================================ */

const rendu = (f: SafeHtml) => f.balisage;

describe('position TEXTE', () => {
	it('échappe les chevrons et l’esperluette', () => {
		expect(rendu(html`<p>${'<b>&</b>'}</p>`)).toBe('<p>&lt;b&gt;&amp;&lt;/b&gt;</p>');
	});

	it('échappe un nom de profil qui contient du balisage', () => {
		// Le cas concret : un enfant tape « <script> » comme prénom.
		const frag = html`<span class="pname">${'<script>alert(1)</script>'}</span>`;
		expect(rendu(frag)).not.toContain('<script>');
		expect(rendu(frag)).toContain('&lt;script&gt;');
	});

	it('laisse le texte ordinaire intact, accents compris', () => {
		expect(rendu(html`<p>${'Léa a 3 œufs'}</p>`)).toBe('<p>Léa a 3 œufs</p>');
	});

	it('rend les nombres sans les altérer', () => {
		expect(rendu(html`<b>${42}</b>${0}`)).toBe('<b>42</b>0');
	});

	it('refuse un nombre non fini plutôt que d’écrire « NaN » à l’écran', () => {
		expect(() => html`<b>${0 / 0}</b>`).toThrow(/non fini/);
	});
});

describe('position ATTRIBUT QUOTÉ', () => {
	it('échappe le guillemet double, qui refermerait l’attribut', () => {
		// Sans ça, `" onmouseover="…` devient un SECOND attribut, sans le moindre chevron.
		const frag = html`<button aria-label="${'Mots "difficiles"'}">x</button>`;
		expect(rendu(frag)).toBe('<button aria-label="Mots &quot;difficiles&quot;">x</button>');
	});

	it('échappe l’apostrophe dans un attribut à quotes simples', () => {
		expect(rendu(html`<i title='${"l'ourse"}'></i>`)).toBe(`<i title='l&#39;ourse'></i>`);
	});

	it('une valeur ne peut pas ouvrir un attribut voisin', () => {
		// `onmouseover=` reste PRÉSENT dans la sortie, mais comme texte À L'INTÉRIEUR de
		// la valeur : les guillemets échappés empêchent de refermer `data-x`. C'est ce
		// qu'il faut vérifier — pas l'absence du mot, qui serait une assertion à côté.
		const frag = html`<div data-x="${'" onmouseover="vole()'}"></div>`;
		expect(rendu(frag)).toBe('<div data-x="&quot; onmouseover=&quot;vole()"></div>');
		// Un seul couple de guillemets non échappés : celui de `data-x` lui-même.
		expect(rendu(frag).match(/"/g)).toHaveLength(2);
	});
});

describe('position ATTRIBUT NON QUOTÉ', () => {
	it('neutralise l’espace, qui suffirait à ajouter un attribut', () => {
		// Ici aucun guillemet à refermer : c'est l'espace qui termine la valeur.
		// `escapeHTML` seul laisserait passer « a onmouseover=vole() » tel quel.
		const frag = html`<i class=${'a onmouseover=vole()'}></i>`;
		expect(rendu(frag)).not.toMatch(/\sonmouseover/);
		expect(rendu(frag)).toContain('&#32;');
		expect(rendu(frag)).toContain('&#61;'); // le `=` aussi
	});

	it('laisse une valeur simple lisible', () => {
		expect(rendu(html`<i class=${'ok'}></i>`)).toBe('<i class=ok></i>');
	});

	it('neutralise le retour à la ligne au même titre que l’espace', () => {
		expect(rendu(html`<i class=${'a\nb'}></i>`)).toBe('<i class=a&#10;b></i>');
	});
});

describe('position URL', () => {
	it('refuse un schéma javascript: au lieu de l’échapper', () => {
		// L'échappement ne protège de rien ici : le danger est le SCHÉMA, pas les caractères.
		expect(() => html`<a href="${'javascript:alert(1)'}">x</a>`).toThrow(/schéma d'URL refusé/);
	});

	it('refuse aussi data: et vbscript:, quelle que soit la casse ou l’espace', () => {
		expect(() => html`<a href="${'DATA:text/html,<script>'}">x</a>`).toThrow(/refusé/);
		expect(() => html`<a href="${'  VbScript:x'}">x</a>`).toThrow(/refusé/);
	});

	it('refuse le schéma jusque dans src, formaction et xlink:href', () => {
		expect(() => html`<img src="${'javascript:1'}" />`).toThrow(/refusé/);
		expect(() => html`<button formaction="${'javascript:1'}"></button>`).toThrow(/refusé/);
		expect(() => html`<use xlink:href="${'javascript:1'}" />`).toThrow(/refusé/);
	});

	it('refuse même un fragment déclaré de confiance : brut() n’est pas un laissez-passer', () => {
		expect(() => html`<a href="${brut('javascript:alert(1)')}">x</a>`).toThrow(/refusé/);
	});

	it('laisse passer une URL ordinaire, relative ou absolue', () => {
		expect(rendu(html`<a href="${'#lecon-num-comparer'}">x</a>`)).toBe(
			'<a href="#lecon-num-comparer">x</a>',
		);
		expect(rendu(html`<a href="${'https://eduscol.education.fr/'}">x</a>`)).toContain(
			'https://eduscol.education.fr/',
		);
	});
});

describe('positions que le gabarit refuse de deviner', () => {
	it('refuse une interpolation entre deux attributs', () => {
		// `<button ${x}>` : échapper rendrait la valeur inerte, ne pas échapper
		// laisserait poser n'importe quel attribut. Le refus est la seule issue honnête.
		expect(() => html`<button ${'disabled'}>x</button>`).toThrow(/entre deux attributs/);
	});

	it('accepte un fragment SafeHtml entre deux attributs', () => {
		const attrs = brut('disabled aria-disabled="true"'); // construit ici, pas une saisie
		expect(rendu(html`<button ${attrs}>x</button>`)).toBe(
			'<button disabled aria-disabled="true">x</button>',
		);
	});

	it('refuse une interpolation dans un script ou un style', () => {
		expect(() => html`<script>${'x'}</script>`).toThrow(/script, style/);
		expect(() => html`<style>${'x'}</style>`).toThrow(/script, style/);
	});

	it('refuse une interpolation dans un commentaire', () => {
		expect(() => html`<!-- ${'x'} -->`).toThrow(/commentaire/);
	});

	it('retrouve le contexte texte après un script fermé', () => {
		// L'automate ne doit pas rester coincé en « texte brut » : sinon toute
		// interpolation ultérieure de la page serait refusée à tort.
		expect(rendu(html`<script>let a = 1;</script><p>${'<b>'}</p>`)).toBe(
			'<script>let a = 1;</script><p>&lt;b&gt;</p>',
		);
	});
});

describe('composition', () => {
	it('laisse passer un SafeHtml sans le ré-échapper', () => {
		// Le double échappement est le risque propre à ce lot : il ne casse rien à la
		// compilation et s'affiche en clair à l'enfant (`<strong>` lu comme du texte).
		const interne = html`<strong>${'3 < 5'}</strong>`;
		expect(rendu(html`<p>${interne}</p>`)).toBe('<p><strong>3 &lt; 5</strong></p>');
	});

	it('n’échappe pas deux fois sur trois niveaux d’imbrication', () => {
		const a = html`<em>${'&'}</em>`;
		const b = html`<span>${a}</span>`;
		expect(rendu(html`<p>${b}</p>`)).toBe('<p><span><em>&amp;</em></span></p>');
	});

	it('laisse passer un brut() sans le toucher', () => {
		expect(rendu(html`<p>${brut('<br />')}</p>`)).toBe('<p><br /></p>');
	});

	it('joint un tableau de fragments', () => {
		const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
		expect(rendu(html`<ul>${items}</ul>`)).toBe('<ul><li>a</li><li>b</li></ul>');
	});

	it('échappe chaque élément d’un tableau de chaînes', () => {
		expect(rendu(html`<p>${['<a>', '<b>']}</p>`)).toBe('<p>&lt;a&gt;&lt;b&gt;</p>');
	});

	it('ignore false, null et undefined', () => {
		// Autorise `${condition && html`…`}` sans garde ni chaîne vide explicite.
		expect(rendu(html`<p>${false}${null}${undefined}</p>`)).toBe('<p></p>');
	});

	it('rend une branche conditionnelle non prise comme du vide, pas comme « false »', () => {
		const actif = false;
		expect(rendu(html`<b>${actif && html`<i>x</i>`}</b>`)).toBe('<b></b>');
	});

	it('joindre() assemble des fragments, avec ou sans séparateur', () => {
		const frags = [html`<i>a</i>`, html`<i>b</i>`];
		expect(rendu(joindre(frags))).toBe('<i>a</i><i>b</i>');
		expect(rendu(joindre(frags, ', '))).toBe('<i>a</i>, <i>b</i>');
	});

	it('VIDE est un fragment vide réutilisable', () => {
		expect(rendu(VIDE)).toBe('');
		expect(rendu(html`<p>${VIDE}</p>`)).toBe('<p></p>');
	});
});

describe('le type ne se contourne pas par inadvertance', () => {
	it('un fragment n’est pas une chaîne : l’oubli de .balisage se voit', () => {
		// Choix délibéré : pas de `toString()`. Un fragment interpolé dans un gabarit
		// NON balisé rend « [object Object] » — laid, donc repérable — plutôt que de
		// « marcher » sur un chemin qui a justement perdu son échappement.
		expect(typeof html`<p>x</p>`).toBe('object');
		expect(`${html`<p>x</p>`}`).toBe('[object Object]');
	});

	it('brut() est la seule porte de sortie, et elle est cherchable', () => {
		expect(brut('<b>x</b>')).toBeInstanceOf(SafeHtml);
		expect(rendu(brut('<b>x</b>'))).toBe('<b>x</b>');
	});
});

describe('le gabarit reste utilisable sur du balisage réel', () => {
	it('conserve les attributs statiques autour des trous', () => {
		const frag = html`<input class="ans" id="${'a1'}" data-answer="${'12,5'}" inputmode="decimal" />`;
		expect(rendu(frag)).toContain('id="a1"');
		expect(rendu(frag)).toContain('data-answer="12,5"');
		expect(rendu(frag)).toContain('inputmode="decimal"');
	});

	it('ne confond pas un « > » de texte avec la fin d’une balise', () => {
		// Les leçons de comparaison affichent « 3 < 5 » et « 7 > 2 » : le chevron seul
		// est légitime dans le texte et ne doit pas dérégler l'automate.
		expect(rendu(html`<p>3 &lt; 5</p><p>${'7 > 2'}</p>`)).toBe('<p>3 &lt; 5</p><p>7 &gt; 2</p>');
	});

	it('mémorise l’analyse par site d’appel sans mélanger les gabarits', () => {
		// Le cache est indexé par TemplateStringsArray ; deux gabarits différents
		// appelés en boucle ne doivent pas hériter des positions l'un de l'autre.
		for (let i = 0; i < 3; i++) {
			expect(rendu(html`<p>${'<'}</p>`)).toBe('<p>&lt;</p>');
			expect(rendu(html`<i class="${'<'}"></i>`)).toBe('<i class="&lt;"></i>');
		}
	});
});
