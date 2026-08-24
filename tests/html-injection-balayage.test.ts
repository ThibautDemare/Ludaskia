import { describe, it, expect } from 'vitest';
import { html, brut } from '../src/core/html';

/* ============================================================
   Balayage d'injection sur les trois positions d'insertion (#614, critère 5).

   Les autres tests du gabarit vérifient une LISTE de caractères choisie à la main
   — donc exactement ceux auxquels l'auteur a pensé. Ici on prend le problème par
   l'autre bout : on balaie TOUS les codes de 1 à 255, plus les espaces Unicode
   qu'on oublie toujours, et c'est l'ANALYSEUR HTML qui juge. Le critère n'est pas
   « la chaîne rendue ressemble à ce que j'attendais » mais « après analyse, la
   balise porte-t-elle toujours exactement un attribut, avec la valeur d'origine ».

   Cette forme attrape ce qu'une liste ne peut pas attraper. Elle a d'ailleurs
   trouvé son premier défaut à l'écriture : l'échappement de l'attribut NON QUOTÉ
   passait par une table (espace, tabulation, `\n`, `\r`, `\f`, `=`, backquote)
   avec un repli `?? c` sur tout le reste, alors que la regex `[\s=`]` qui la pilote
   capture bien plus large (tabulation verticale, insécable, U+2028/2029, espace
   idéographique, BOM). Le repli ne rattrapait rien, silencieusement.

   ── Les contrôles négatifs ne sont pas décoratifs ────────────────────────────
   Un test d'échappement qui ne teste que des valeurs échappées passe aussi bien
   quand l'échappement fonctionne que quand l'analyseur ne voit RIEN de ce qu'on
   lui donne. Les trois premiers cas vérifient donc que l'injection réussit quand
   on la laisse délibérément passer (`brut`) : sans eux, le balayage ne prouverait
   pas qu'il sait détecter une injection.

   ── Limite de l'oracle ───────────────────────────────────────────────────────
   L'analyseur est celui de happy-dom, pas celui d'un navigateur. Il est plus
   strict que la spec sur l'espace blanc (il coupe une valeur non quotée sur
   l'insécable, ce qu'aucun navigateur ne fait). C'est très bien ainsi pour un
   test : on se cale sur le plus sévère.
   ============================================================ */

/** Analyse un balisage et rend l'élément produit — c'est le parseur qui tranche,
 *  pas une comparaison de chaînes. */
function analyser(balisage: string): Element | null {
	const hote = document.createElement('div');
	hote.innerHTML = balisage;
	return hote.firstElementChild;
}

/** Codes balayés : tout l'octet, plus les espaces Unicode hors ASCII que les
 *  tables d'échappement oublient (U+2028/2029, espace idéographique, BOM). */
const CODES = [...Array.from({ length: 255 }, (_, i) => i + 1), 0x2028, 0x2029, 0x3000, 0xfeff];

describe("balayage d'injection du gabarit html (#614)", () => {
	/* ---------- Contrôles négatifs : l'oracle sait-il voir une injection ? ---------- */

	it('CONTRÔLE : une valeur non échappée ouvre bien un second attribut (attribut nu)', () => {
		const el = analyser(html`<i class=${brut('a onmouseover=vole()')}></i>`.balisage);
		expect(el?.getAttributeNames()).toContain('onmouseover');
	});

	it('CONTRÔLE : une valeur non échappée sort bien des guillemets (attribut quoté)', () => {
		const el = analyser(html`<i title="${brut('a" onmouseover="vole()')}"></i>`.balisage);
		expect(el?.getAttributeNames()).toContain('onmouseover');
	});

	it('CONTRÔLE : du balisage non échappé crée bien un élément (texte)', () => {
		const hote = document.createElement('div');
		hote.innerHTML = html`<p>${brut('<img src=x>')}</p>`.balisage;
		expect(hote.querySelectorAll('img')).toHaveLength(1);
	});

	/* ---------- Le balayage proprement dit ---------- */

	it('attribut NON QUOTÉ : aucun caractère n’ajoute d’attribut ni ne tronque la valeur', () => {
		const anomalies: string[] = [];
		for (const code of CODES) {
			const valeur = `a${String.fromCodePoint(code)}b`;
			const el = analyser(html`<i class=${valeur}></i>`.balisage);
			const noms = el?.getAttributeNames() ?? ['<élément absent>'];
			if (noms.length !== 1 || noms[0] !== 'class' || el?.getAttribute('class') !== valeur)
				anomalies.push(
					`U+${code.toString(16).padStart(4, '0')} → attributs [${noms.join(', ')}], ` +
						`class=${JSON.stringify(el?.getAttribute('class'))}`,
				);
		}
		expect(anomalies, `Valeurs qui s'échappent de l'attribut :\n${anomalies.join('\n')}`).toEqual(
			[],
		);
	});

	it("attribut QUOTÉ : aucun caractère n'ajoute d'attribut ni ne tronque la valeur", () => {
		const anomalies: string[] = [];
		for (const code of CODES) {
			const valeur = `a${String.fromCodePoint(code)}b`;
			const el = analyser(html`<i class="${valeur}"></i>`.balisage);
			const noms = el?.getAttributeNames() ?? ['<élément absent>'];
			if (noms.length !== 1 || el?.getAttribute('class') !== valeur)
				anomalies.push(
					`U+${code.toString(16).padStart(4, '0')} → attributs [${noms.join(', ')}], ` +
						`class=${JSON.stringify(el?.getAttribute('class'))}`,
				);
		}
		expect(anomalies, `Valeurs qui s'échappent de l'attribut :\n${anomalies.join('\n')}`).toEqual(
			[],
		);
	});

	it('TEXTE : aucun caractère ne crée d’élément ni n’altère le texte rendu', () => {
		const anomalies: string[] = [];
		for (const code of CODES) {
			const valeur = `a${String.fromCodePoint(code)}b`;
			const hote = document.createElement('div');
			hote.innerHTML = html`<p>${valeur}</p>`.balisage;
			// Un seul <p>, aucun élément de plus, et le texte lu vaut la valeur donnée.
			if (hote.children.length !== 1 || hote.textContent !== valeur)
				anomalies.push(
					`U+${code.toString(16).padStart(4, '0')} → ${hote.children.length} élément(s), ` +
						`texte=${JSON.stringify(hote.textContent)}`,
				);
		}
		expect(anomalies, `Valeurs qui débordent du texte :\n${anomalies.join('\n')}`).toEqual([]);
	});
});
