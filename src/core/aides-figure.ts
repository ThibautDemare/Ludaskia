/* ============================================================
   Bulles d'aide posées sous une figure (leçon sur les angles).

   Extraites de `data/maths/angles.ts` (#734) pour qu'une figure accompagnée de son
   aide puisse voyager dans un lien partagé : la recette n'emporte que l'identifiant
   de la bulle, et c'est ce module qui en redonne le texte à l'arrivée.

   Apostrophe droite (convention projet) ; `screen-only` : retirées à l'impression
   (#290), sinon elles fuiteraient la réponse sur un bilan.
   ============================================================ */
import { html, type SafeHtml } from './html';
import { marquer, type IdAide } from './recette-fragment';

const AIDES: Record<IdAide, SafeHtml> = {
	// Nommage (temps 3) : les deux termes, ancrés sur la comparaison à l'angle droit.
	'angle-nommer': html`<p class="angle-aide screen-only">plus petit que l'angle droit → aigu · plus grand → obtus</p>`,
	// Oui/Non « aigu » : aide RÉDUITE à UN seul terme (avis specialiste-troubles : ne
	// pas nommer « obtus » ici, la marche binaire ne porte qu'un mot neuf à la fois).
	'angle-aigu': html`<p class="angle-aide screen-only">aigu = plus petit que l'angle droit</p>`,
};

for (const [id, fragment] of Object.entries(AIDES))
	marquer(fragment, { k: 'aide', id: id as IdAide });

export function aideFigure(id: IdAide): SafeHtml {
	return AIDES[id];
}
