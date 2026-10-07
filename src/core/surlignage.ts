/* ============================================================
   Texte à morceaux SURLIGNÉS (`.term`) — la terminaison mise en valeur dans les
   choix d'un QCM d'accord (#200, #205).

   Le surlignage était écrit à la main dans chaque leçon (`base<span class="term">e</span>`).
   Il passe par ici depuis #734 pour garder sa recette : une vue de choix doit
   pouvoir voyager dans un lien partagé sous forme de morceaux de texte, et être
   redessinée à l'arrivée plutôt que recopiée. Le balisage produit est le même,
   caractère pour caractère.
   ============================================================ */
import { html, joindre, type SafeHtml } from './html';
import { marquer } from './recette-fragment';

/** Chaque morceau est échappé ; ceux marqués `true` sont enveloppés d'un `.term`. */
export function surligner(morceaux: [string, boolean][]): SafeHtml {
	const fragment = joindre(
		morceaux.map(([texte, surligne]) =>
			surligne ? html`<span class="term">${texte}</span>` : html`${texte}`,
		),
	);
	return marquer(fragment, { k: 'surlignage', morceaux });
}
