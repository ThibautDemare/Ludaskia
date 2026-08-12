/* ============================================================
   Révélation NEUTRE d'une question passée (#467) — fond COMMUN au mode leçon
   (ui/lecon-passer.ts) et au mode Révision (ui/revision.ts).
   ------------------------------------------------------------
   « Je ne sais pas, montre-moi » existe sur deux écrans très différents (les neuf
   runners de leçon en `.sprint-*`, la carte de révision en `.rev-*`), mais ce que
   l'enfant obtient doit être le MÊME : le même libellé de lien, le même ton qui
   dédramatise avant de donner la réponse, le même widget laissé visible mais désarmé,
   la même annonce pour un lecteur d'écran, et la même entrée de journal marquée
   « n'a pas essayé ». Seuls diffèrent des SÉLECTEURS DOM et le mode du journal : ils
   sont donc des PARAMÈTRES ici, et non un prétexte à deux implémentations.

   Ce module existe parce que les deux copies avaient déjà divergé : les runners de
   leçon avaient reçu leur région live fixe (`#ltuiStatus`, `#lordStatus`) pour porter
   l'annonce de la révélation, la révision non — cinq de ses formats sont restés MUETS
   pour un lecteur d'écran, faute de report du correctif d'une copie à l'autre. La règle
   de repli d'annonce (`annoncerStatut`, dont `annoncerRevelation` n'est qu'un habillage)
   vit ici pour que ce trou ne puisse plus se rouvrir d'un seul côté — et elle sert
   désormais aussi aux verdicts ORDINAIRES de la révision, qui n'étaient annoncés nulle part
   (le focus partant sur « Continuer ▶ », un enfant qui n'y voit pas ne savait pas s'il avait
   eu juste ou faux).

   Reste hors de ce module ce qui est vraiment propre à un écran : les styles et les ids
   (repères des specs e2e), la composition du bloc de décision (« Vérifier »/« Valider »),
   et l'enregistrement du passage (dénominateur d'un essai de leçon vs recul d'un cran
   en répétition espacée).
   ============================================================ */
import { icon } from './icon';
import { capterErreur } from './erreur-capture';

/* Libellé retenu (#467) : jamais « Passer » seul, qui sonne comme un raccourci gratuit
   et ne dit pas ce qu'on obtient en échange. Un seul libellé pour les deux écrans :
   l'enfant retrouve le même geste et le même ton d'un mode à l'autre. */
export const PASSER_LABEL = 'Je ne sais pas, montre-moi';

/* Première ligne du verdict de révélation : elle dédramatise AVANT de donner la réponse
   (sinon l'enfant lit d'abord ce qu'il ne savait pas) et annonce le retour de la notion,
   ce que les deux écrans font effectivement (leçon : la notion entre en rotation ;
   révision : `recordGrade(false)` recule d'un cran). Sert aussi d'en-tête à l'annonce
   non visuelle, via `annoncerRevelation`. */
export const REVEAL_LAB = 'Pas grave, on la reverra bientôt.';

/* Forme de révélation des moteurs qui révèlent EUX-MÊMES leurs solutions EN PLACE (un
   problème les écrit à côté de chaque case) : le verdict n'a alors aucune réponse à
   répéter, il oriente le regard. */
export const REVELATION_EN_PLACE = 'Regarde les réponses, puis continue.';

/** Lien de déblocage. Un vrai `<button type="button">`, JAMAIS un `<a>` (rien à
    naviguer, et le raccourci Entrée des deux écrans détournerait la touche). Discret par
    le STYLE, jamais par la taille de cible : `classe` et `id` restent propres à l'écran
    (styles, et repères des specs e2e), l'icône et le libellé sont communs. */
export function lienPasserHTML(classe: string, id: string): string {
	return `<button type="button" class="${classe}" id="${id}">${icon('eye')}<span>${PASSER_LABEL}</span></button>`;
}

/** Ligne de révélation du verdict neutre. Deux formes, selon que la solution tient sur la
    ligne (`solutionHTML` : la tuile juste, la suite rangée, le mot cherché) ou qu'elle
    s'affiche en BLOC juste dessous (classement d'un tri, paires d'un appariement) — la
    ligne l'annonce alors et s'arrête sur « : ». `libelle` porte la formulation propre au
    format (« la réponse c'est », « le bon rangement »…), reprise de la branche d'échec du
    format pour que l'enfant lise la même chose qu'après une erreur.
    `solutionHTML` est injecté tel quel : à l'appelant de l'échapper. */
export function ligneRevelation(libelle: string, solutionHTML?: string): string {
	return solutionHTML
		? `Regarde, ${libelle} : <strong>${solutionHTML}</strong>.`
		: `Regarde, ${libelle} :`;
}

/** Journalise une question PASSÉE : même entrée qu'une erreur (donc visible dans l'espace
    encadrant, avec la réponse attendue), mais SANS réponse donnée et marquée
    `sansTentative` — l'encadrant remplace alors la ligne « Réponse donnée » par « N'a pas
    essayé : a demandé à voir la réponse ». `mode` distingue les deux écrans dans le
    journal ('lecon' / 'revision'), rien d'autre. */
export function capterPasse(o: {
	text: string;
	figure?: string;
	attendue: string;
	lessonId: string | null;
	mode: string;
}): void {
	capterErreur({ ...o, donnee: '', sansTentative: true });
}

/* Boutons du « chrome » de l'écran qui restent opérables après une révélation : l'aide du
   geste et les boutons « Écouter » (relire ou réentendre la question à côté de la solution
   reste utile, surtout pour un lecteur fragile). */
const CHROME_SELECTEUR = '.aide-btn, .consigne-tts, .item-tts';

/** Neutralise la scène (widget interactif) après une révélation. On ne passe SURTOUT pas
    par `ctrl.verify()` (idempotent et irréversible : il figerait la réponse incomplète et
    la marquerait ✗ en rouge — l'appariement irait jusqu'à poser `.is-decoy` et annoncer
    « non relié, incorrect » sur des liens jamais tentés) ; on désarme le DOM à la place.
    Le widget reste VISIBLE — l'enfant compare ce qu'il avait commencé avec la solution —
    mais n'est plus manipulable : sinon il continue à déplacer des tuiles sur une question
    terminée, et le `onState` du binder (qui n'est muet qu'une fois `verify()` appelé)
    réactive un bouton de validation qui n'a plus lieu d'être. Le CSS de chaque écran
    complète en coupant les cibles de DÉPÔT du glisser-déposer, sans toucher au chrome.

    - `scene` : l'élément à désarmer (`null` accepté : rien à faire) ;
    - `classeFige` : classe de figeage attendue par le CSS de l'écran ;
    - `apres` : zones d'APRÈS-verdict à ne jamais désarmer (feedback, « Continuer ▶ »). */
export function neutraliserScene(o: {
	scene: HTMLElement | null;
	classeFige: string;
	apres: string;
}): void {
	if (!o.scene) return;
	o.scene.classList.add(o.classeFige);
	for (const el of o.scene.querySelectorAll<HTMLElement>('button, input, [role="button"]')) {
		if (el.closest(o.apres) || el.matches(CHROME_SELECTEUR)) continue;
		if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
			el.disabled = true;
			el.removeAttribute('aria-pressed'); // l'état de bascule n'a plus de sens
			continue;
		}
		// Cible de dépôt NON native (titre de colonne du tri) : plus opérable, donc plus
		// annoncée comme un bouton ni atteignable au clavier (son texte reste lisible).
		el.removeAttribute('role');
		el.removeAttribute('tabindex');
		el.removeAttribute('aria-label');
	}
}

/** Annonce non visuelle d'un verdict, dans la bonne région live de l'écran. Le focus part
    sur « Continuer ▶ » — qui ne dit que « Continuer » — donc sans cette annonce l'enfant qui
    n'y voit pas ne sait pas ce que la question est devenue.

    Deux régions possibles, dans cet ordre :
      1. celle du WIDGET monté (`#ltriStatus`, `#lappStatus`, `#lclicStatus`,
         `#probStatus`…), quand il en rend une : son contenu est plus riche et c'est elle
         qui porte d'ordinaire le verdict de la mécanique — y écrire évite AUSSI de dire
         deux fois la même chose dans deux régions ;
      2. sinon la région FIXE de l'écran (`repli`), rendue par l'écran lui-même pour les
         formats dont le widget n'annonce rien (saisie, QCM, mot, opération posée,
         tuile, rangement).
    `repli` est cherché dans `scope` ET exclu de la recherche de l'étape 1 : la priorité
    ne dépend donc pas de l'ordre du markup, qu'un remaniement changerait sans le vouloir.

    Partagé par la RÉVÉLATION (`annoncerRevelation`) et par les verdicts ORDINAIRES de la
    révision : la règle de repli n'a aucune raison de différer selon l'issue de la question,
    et c'est précisément en la réécrivant écran par écran qu'on avait laissé des formats
    muets. */
export function annoncerStatut(o: {
	scope: ParentNode | null;
	message: string;
	repli?: string;
	/* `seulementRepli` : n'écrire QUE dans la région fixe, et se taire si le widget en a une
	   à lui. À utiliser quand la mécanique vient déjà de parler dans SA région — c'est le cas
	   d'un verdict ORDINAIRE, où `verify()` a marqué chaque paire ou chaque mot et l'a annoncé
	   plus précisément qu'un résumé global ne le ferait. Sur une RÉVÉLATION, au contraire,
	   `verify()` n'est jamais appelé : la région du widget est vide et c'est bien là qu'il faut
	   écrire, d'où le comportement par défaut. */
	seulementRepli?: boolean;
}): void {
	if (!o.scope) return;
	const repli = o.repli ? o.scope.querySelector<HTMLElement>(o.repli) : null;
	const regions = [...o.scope.querySelectorAll<HTMLElement>('[role="status"]')];
	const regionWidget = regions.find((r) => r !== repli);
	if (o.seulementRepli) {
		if (regionWidget) return; // sa mécanique a déjà annoncé, et en plus précis
		if (repli) repli.textContent = o.message;
		return;
	}
	const region = regionWidget ?? repli;
	if (region) region.textContent = o.message;
}

/** Annonce non visuelle de la révélation. C'est le SEUL canal qu'a un lecteur d'écran :
    le verdict habituel est court-circuité. Sans elle, l'enfant qui n'y voit pas n'apprend
    jamais la réponse qu'il vient de demander — la fonctionnalité serait muette pour lui.
    `message` est le texte propre au format ; le libellé qui dédramatise est ajouté ici,
    pour que l'annonce dise la même chose que le verdict à l'écran. */
export function annoncerRevelation(o: {
	scope: ParentNode | null;
	message: string;
	repli?: string;
}): void {
	annoncerStatut({ ...o, message: `${REVEAL_LAB} ${o.message}` });
}
