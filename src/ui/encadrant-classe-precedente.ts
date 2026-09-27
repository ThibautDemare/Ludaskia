/* ============================================================
   Espace encadrant — sous-bloc « Encore en cours en <classe précédente> » (#723).
   ------------------------------------------------------------
   Quand une matière passe à la classe suivante, ce que l'enfant avait commencé sans le
   finir sort de tout ce qui est scopé à la classe suivie (récap, suggestions) : c'est le
   seul endroit où l'adulte le retrouve, avec de quoi l'épingler. Un sous-bloc par matière,
   dans « À revoir ensemble » (composé par `encadrant-progression`), entre « Suggestions »
   et « Retirées automatiquement ».

   Les lignes reprennent le rendu d'une épingle hors classe (badge de classe d'origine +
   état d'acquisition lu à ce niveau-là), fourni par l'appelant (`LigneClassePrecedente`) :
   une fois épinglée, la leçon passe dans « Épinglées » sans changer d'aspect, et ce module
   n'importe pas celui qui le compose. L'action `epingler` reste aiguillée par
   `encadrant-progression`, pour la raison donnée dans son en-tête (un seul handler par
   action, sinon le focus retombe sur le premier bouton trouvé).

   Sélection, tri et règle de sortie : `core/consolidation-bas-niveau.ts` via
   `RecapProfil.classePrecedente`. Module de rendu seul, sans état.
   ============================================================ */
import { LEVEL_LABEL } from '../core/levels';
import type { Profile } from '../core/profiles';
import {
	niveauProfilMatiere,
	type OrigineLecon,
	type RecapClassePrecedente,
	type RecapNotion,
} from '../core/encadrant-stats';
import { html, type SafeHtml, joindre } from '../core/html';

/** Rendu d'une ligne, fourni par le module qui compose « À revoir ensemble ». */
export type LigneClassePrecedente = (
	notion: RecapNotion,
	opts: { origine: OrigineLecon; infobulle: string },
) => SafeHtml;

/* Infobulle du badge de classe sur ces lignes. Celle d'une épingle (« épinglée
   volontairement… ») y serait FAUSSE : ces lignes ne sont pas encore épinglées. Une fois
   épinglée, la ligne passe dans « Épinglées » et reprend l'infobulle ordinaire, alors vraie. */
const INFOBULLE_CLASSE_PRECEDENTE =
	"Leçon d'une classe précédente : son avancement se lit pour cette classe-là. Épinglez-la pour qu'elle revienne sur l'accueil de l'enfant.";

/** Sous-bloc d'UNE matière. Trois corps : la liste ; « tout est déjà épinglé » ; la phrase de
    clôture seule quand tout ce qui avait été commencé est réussi (le sous-bloc n'existe pas
    si rien n'a jamais été commencé à ce niveau, cf. `RecapProfil.classePrecedente`). */
export function classePrecedenteHTML(
	c: RecapClassePrecedente,
	consulte: Profile,
	epinglees: ReadonlySet<string>,
	ligne: LigneClassePrecedente,
): SafeHtml {
	const classe = LEVEL_LABEL[c.niveau];
	const titre = html`<h4 class="enc-sub-lab">Encore en cours en ${classe} (${c.label})</h4>`;
	if (c.fragiles.length === 0)
		return html`<div class="enc-classe-precedente" data-subject="${c.subject}" data-niveau="${c.niveau}">
      ${titre}
      <p class="enc-hint enc-classe-precedente-fin">Tout ce que ${consulte.name} avait commencé en ${classe} est maintenant réussi.</p>
    </div>`;

	const suivie = LEVEL_LABEL[niveauProfilMatiere(consulte, c.subject)];
	const origine: OrigineLecon = { niveau: c.niveau, direction: 'en-dessous' };
	const lignes = c.fragiles.filter((n) => !epinglees.has(n.lessonId));
	const corps =
		lignes.length === 0
			? html`<p class="enc-hint">Elles sont toutes épinglées ci-dessus.</p>`
			: html`<ul class="enc-revoir">${joindre(
					lignes.map((n) => ligne(n, { origine, infobulle: INFOBULLE_CLASSE_PRECEDENTE })),
				)}</ul>`;
	// « La classe de X » et non « le X » : l'article devant LEVEL_LABEL n'est pas fixe (« la 6e »).
	return html`<div class="enc-classe-precedente" data-subject="${c.subject}" data-niveau="${c.niveau}">
      ${titre}
      <p class="enc-hint">Leçons de ${classe} que ${consulte.name} a commencées sans les réussir jusqu'au bout. La classe de ${suivie} ne les reprend pas : elles restent ici. Une leçon quitte cette liste quand ${consulte.name} la réussit en faisant la leçon complète, pas seulement en sprint ou en révision.</p>
      ${corps}
    </div>`;
}
