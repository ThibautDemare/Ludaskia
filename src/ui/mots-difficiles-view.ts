/* ============================================================
   Mots qui ont résisté pendant une séance (#618) — couche UI.
   ------------------------------------------------------------
   Deux responsabilités seulement :
   - rendre le bloc de fin de séance (la phrase + le bouton « Relire ces mots ») ;
   - le faire disparaître quand l'adulte a coupé l'aménagement (critère 7).

   La DÉCISION (qui est nommé, plafond, bascule vers la formulation groupée) vit
   dans `core/orthographe/mots-difficiles.ts`, pure et testée. Ici, seulement le
   HTML et le câblage.

   ÉPHÉMÈRE par construction, comme le récap de #537 : aucune clé de stockage, rien
   qui survive au rechargement (critère 11). Ce module ne garde même pas d'état — la
   liste des mots vit dans le runner qui l'a constituée, et meurt avec la séance.
   ============================================================ */
import { html, VIDE, type SafeHtml } from '../core/html';
import {
	contenuMotsDifficiles,
	phraseMotsDifficiles,
	type ContexteMotsDifficiles,
} from '../core/orthographe/mots-difficiles';
import { motsDifficilesRappeles } from '../core/profiles';
import { icon } from './icon';

/** Un mot qui a résisté : sa forme correcte (ce qui s'affiche, critère 5) et son id
    de banque (ce qui filtre la page de relecture). */
export interface MotDifficile {
	id: string;
	mot: string;
}

/** Bloc de fin de séance : la phrase, puis le bouton « Relire ces mots ». VIDE quand
    il n'y a rien à nommer ou que l'aménagement le coupe — jamais de bloc vide.

    Le bouton reste offert même sous la formulation GROUPÉE (4 mots et plus) : c'est
    précisément le cas où l'enfant a le plus à relire, et « ces mots » renvoie alors à
    la phrase collective sans rien dénombrer.

    `classe` est fournie par l'écran porteur : chacun a déjà sa famille de styles
    (`ortho-bilan`, `rev-done`), et une classe transversale aurait dû lutter contre
    deux contextes de mise en page. Même parti pris que `recapHTML` (#537). */
export function motsDifficilesHTML(
	mots: readonly MotDifficile[],
	contexte: ContexteMotsDifficiles,
	classe: string,
): SafeHtml {
	if (!motsDifficilesRappeles()) return VIDE;
	const contenu = contenuMotsDifficiles(mots.map((m) => m.mot));
	if (!contenu) return VIDE;
	// `role="status"` : l'écran est rendu d'un coup par `innerHTML`, et sur la pause le
	// focus part directement sur « Continuer encore un peu », qui suit ce bloc dans le DOM.
	// Sans annonce, un enfant au lecteur d'écran n'apprendrait jamais que ses mots sont
	// nommés ni que « Relire ces mots » existe. Même recette que le lien d'étayage (#490),
	// et non la région `#revStatus` de la révision, qui reste dédiée au verdict d'un item.
	// `aria-atomic` fait relire le bloc entier plutôt que le seul nœud modifié.
	return html`<div class="mots-difficiles ${classe}" role="status" aria-atomic="true">
      <p class="mots-difficiles-phrase">${phraseMotsDifficiles(contenu, contexte)}</p>
      <button type="button" class="mots-difficiles-relire" id="btnRelireMotsDifficiles">
        ${icon('book-open')} Relire ces mots
      </button>
    </div>`;
}

/** Câble le bouton « Relire ces mots ». No-op si le bloc n'a pas été rendu (rien à
    nommer, ou aménagement coupé) : l'appelant n'a donc pas à refaire le test. */
export function bindMotsDifficiles(host: ParentNode, aller: () => void): void {
	host.querySelector('#btnRelireMotsDifficiles')?.addEventListener('click', () => aller());
}
