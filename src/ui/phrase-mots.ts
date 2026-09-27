/* ============================================================
   Phrase rendue MOT PAR MOT — briques partagées par les widgets de sélection (#716).

   Deux widgets font lire la même chose à l'enfant — une phrase dont chaque mot est
   une cible — et lui demandent deux gestes différents :
   - `ui/clic-mot-interaction.ts` (#259) : cocher des mots, éventuellement séparés ;
   - `ui/segment-mot-interaction.ts` (#716) : délimiter un BLOC par ses deux bornes.

   Ce qu'ils partagent n'est ni la sélection ni la correction (qui sont justement ce
   qui les distingue), mais le SUBSTRAT : découper la phrase en boutons-mots + spans
   de ponctuation, et poser sur un mot un verdict visible (classe d'état + pastille
   ✓/✗ + libellé pour lecteur d'écran). Ces deux-là vivent ici plutôt qu'en double,
   parce qu'un double aurait dérivé sur le détail qui compte : la pastille double le
   signal couleur (daltonisme), et un widget qui l'oublierait ne le montrerait à
   personne.

   Ce qui reste CHEZ CHAQUE WIDGET, et c'est voulu : la formulation des libellés. Un
   mot faux se dit « ce n'est pas le verbe conjugué » chez l'un et « ce mot ne fait
   pas partie du groupe » chez l'autre — même code, deux phrases, parce que ce n'est
   pas la même chose qu'on apprend.
   ============================================================ */
import { estPonctuation } from '../data/francais/grammaire-clic-mot';
import { html, joindre, type SafeHtml } from '../core/html';

/** Préfixe de classes CSS d'un widget (`lclic`, `lseg`) : il nomme à la fois le
    bouton-mot (`.lclic-mot`), la ponctuation (`.lclic-ponct`) et la pastille de
    verdict (`.lclic-mark`). Un seul paramètre plutôt que trois — les trois classes
    d'un même widget ne divergent jamais. */
export type PrefixeMots = 'lclic' | 'lseg';

/** La phrase, token par token : un `<button>` par mot, un `<span>` inerte par signe
    de ponctuation. `data-i` porte l'indice du token dans `tokens` — c'est la clé
    commune au rendu, à la sélection et à la correction, et elle est posée AUSSI sur
    la ponctuation : un segment peut l'enjamber (« Ce matin, le chien aboie »), donc
    le widget doit pouvoir la peindre sans la rendre cliquable pour autant. */
export function phraseMotsHTML(tokens: readonly string[], prefixe: PrefixeMots): SafeHtml {
	return joindre(
		tokens.map((t, i) =>
			estPonctuation(t)
				? html`<span class="${prefixe}-ponct" data-i="${i}">${t}</span>`
				: html`<button type="button" class="${prefixe}-mot" data-i="${i}" aria-pressed="false">${t}</button>`,
		),
	);
}

/** Applique un verdict à un mot : classe d'état, pastille ✓/✗ (double codage couleur
    + signe) et `aria-label` parlant. Le libellé est fourni par l'appelant : c'est lui
    qui sait ce que l'enfant cherchait. */
export function marquerMot(
	btn: HTMLButtonElement,
	prefixe: PrefixeMots,
	etat: 'correct' | 'wrong',
	aria: string,
): void {
	btn.classList.add(etat);
	btn.setAttribute('aria-label', aria);
	const mark = document.createElement('span');
	mark.className = `${prefixe}-mark`;
	mark.setAttribute('aria-hidden', 'true');
	mark.textContent = etat === 'correct' ? '✓' : '✗';
	btn.appendChild(mark);
}
