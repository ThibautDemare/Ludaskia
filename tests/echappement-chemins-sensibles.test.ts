import { describe, it, expect, beforeEach } from 'vitest';
import { renderItem, createRenderContext, enonceTexte, choiceButtonHTML } from '../src/core/items';
import { paveSignesHTML } from '../src/core/signes';
import { ficheHTMLGeneric } from '../src/core/items';
import { html } from '../src/core/html';

/* ============================================================
   Les chemins SENSIBLES restent échappés (#614).

   L'issue nommait quatre endroits où une valeur non fiable atteint le DOM : le nom
   de profil, la valeur d'une tuile saisie par l'enfant, les libellés de leçon et les
   `aria-label`. Ils étaient déjà échappés avant #614 — c'est justement le point : la
   conversion ne devait RIEN dé-échapper au passage. Ce fichier les fige.

   Ce qu'on éprouve, ce n'est pas « escapeHTML fonctionne » (c'est le rôle de
   tests/html-gabarit.test.ts) mais que la CHAÎNE COMPLÈTE — de la donnée jusqu'au
   fragment rendu — ne laisse pas passer de balisage. On travaille donc sur les
   fonctions de rendu réelles, avec une charge hostile, et on lit le DOM produit :
   un test sur la chaîne de caractères se satisferait d'un `&lt;` obtenu par hasard,
   là où « l'élément n'existe pas » dit vraiment ce qui compte.

   La valeur hostile est toujours la même (`CHARGE`), pour qu'un échec désigne le
   chemin et pas la charge.
   ============================================================ */

const CHARGE = '<img src=x onerror="pan()">';

/** Rend un fragment dans un hôte détaché et rend le DOM obtenu. */
function poser(fragment: { balisage: string }): HTMLElement {
	const hote = document.createElement('div');
	hote.innerHTML = fragment.balisage;
	return hote;
}

describe('chemins sensibles : la charge ressort en TEXTE, jamais en balisage', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('énoncé d’item (libellé de leçon, texte de donnée)', () => {
		const hote = poser(enonceTexte(CHARGE));
		expect(hote.querySelector('img')).toBeNull();
		expect(hote.textContent).toContain('<img');
	});

	it('valeur d’un choix de QCM', () => {
		const hote = poser(choiceButtonHTML(CHARGE, 0));
		expect(hote.querySelector('img')).toBeNull();
		expect(hote.querySelector('button')!.textContent).toContain('<img');
	});

	it('aria-label d’un champ de réponse : le guillemet ne referme pas l’attribut', () => {
		// Le cas concret n'a rien de malveillant : une leçon nommée « Mots "difficiles" »
		// suffisait à casser le libellé accessible. Le danger est le GUILLEMET, pas le
		// chevron — d'où une charge dédiée ici.
		const ctx = createRenderContext();
		// Le nom accessible vient de `texteParle` (cf. ariaChamp) : on passe la charge par
		// `parle`, seul chemin qui la fasse arriver telle quelle dans l'attribut.
		const hote = poser(
			renderItem({ text: 'Complète @', answer: 1, parle: 'Mots "difficiles" à écrire' }, ctx),
		);
		const champ = hote.querySelector<HTMLInputElement>('input.ans')!;
		// Aucun attribut de trop : le guillemet du libellé n'en a pas ouvert un second.
		expect(champ.getAttributeNames().sort()).toEqual([
			'aria-label',
			'autocomplete',
			'class',
			'data-answer',
			'id',
			'inputmode',
		]);
		expect(champ.getAttribute('aria-label')).toBe('Mots "difficiles" à écrire');
	});

	it('valeur attendue exposée en data-answer', () => {
		const ctx = createRenderContext();
		const hote = poser(renderItem({ text: '@', answer: CHARGE, kind: 'text' }, ctx));
		expect(hote.querySelector('img')).toBeNull();
		expect(hote.querySelector<HTMLInputElement>('input.ans')!.dataset.answer).toBe(CHARGE);
	});

	it('titre et consigne d’une fiche', () => {
		const hote = poser(ficheHTMLGeneric(CHARGE, CHARGE, CHARGE, html``));
		expect(hote.querySelector('img')).toBeNull();
		expect(hote.querySelector('.fiche-title')!.textContent).toContain('<img');
		expect(hote.querySelector('.consigne-line')!.textContent).toContain('<img');
	});

	it('le pavé de signes garde ses trois boutons et leurs libellés', () => {
		// Pas de charge ici : le pavé ne prend qu'un id de champ. Ce qu'on vérifie, c'est
		// que la conversion n'a pas vidé un fragment composé (le piège du `.join('')` sur
		// un tableau de fragments, qui rend « [object Object] » sans rien casser d'autre).
		const hote = poser(paveSignesHTML('a0'));
		const boutons = [...hote.querySelectorAll('.pave-signe')];
		expect(boutons.map((b) => b.getAttribute('data-signe'))).toEqual(['<', '=', '>']);
		expect(boutons[0].getAttribute('aria-label')).toBe('plus petit que');
		expect(hote.textContent).not.toContain('[object Object]');
	});
});

describe('rien ne s’affiche en clair : le double échappement ne passe pas', () => {
	it('les fractions empilées d’un énoncé restent du BALISAGE, pas du texte', () => {
		// Le risque propre à la conversion : un fragment ré-échappé s'affiche tel quel à
		// l'enfant (« <span class="frac"> » lu comme du texte) sans rien casser d'autre.
		const hote = poser(enonceTexte('Combien font 3/4 de 8 ?'));
		expect(hote.querySelector('.frac')).not.toBeNull();
		expect(hote.textContent).not.toContain('<span');
		expect(hote.textContent).not.toContain('&lt;');
	});

	it('le gras « **…** » d’un énoncé reste du balisage', () => {
		const hote = poser(enonceTexte('Réponds à la **dernière** question.'));
		expect(hote.querySelector('strong')!.textContent).toBe('dernière');
		expect(hote.textContent).not.toContain('<strong');
	});

	it('les grands nombres restent enveloppés en .bignum', () => {
		const hote = poser(enonceTexte('Compare 1 234 567 et 999.'));
		expect(hote.querySelector('.bignum')).not.toBeNull();
		expect(hote.textContent).not.toContain('<span');
	});
});
