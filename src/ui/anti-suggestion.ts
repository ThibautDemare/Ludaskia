/* ============================================================
   Anti-suggestion clavier — « mot de passe visible » (issues #67/#123/#139), et
   remasquage à CHAQUE entrée de focus sur Firefox à écran tactile.

   Les champs de réponse texte sont rendus en `type="password"` (cf.
   `TEXT_ANSWER_INPUT_ATTRS` dans core/items.ts) car c'est le seul moyen fiable de
   couper la barre de suggestions prédictives des claviers mobiles, qui « souffle »
   sinon la bonne réponse. Mais un vrai password masque le texte (les points), et
   `-webkit-text-security: none` ne le démasque PAS (vérifié sur Chrome et Firefox).

   Astuce (comportement du bouton « œil » des champs de mot de passe) : un champ NÉ
   en `type="password"` puis basculé en `type="text"` est traité par Chrome Android
   comme un « mot de passe visible » (`hasBeenPasswordField`, drapeau qui ne s'efface
   jamais → textVisiblePassword) : le texte est lisible ET le clavier continue de NE
   PAS proposer de suggestions. On démasque donc tous les champs `[data-unmask]` dès
   leur insertion dans le DOM, via un observateur global (les vues sont rendues par
   innerHTML un peu partout : un observateur couvre tous les sites en un seul point).

   FIREFOX ANDROID n'a pas cette notion. GeckoView ne connaît que le type COURANT du
   champ et n'a aucun drapeau « sans suggestions » (`autocomplete` et `spellcheck` y
   sont ignorés côté clavier ; seul `autocorrect` compte, et seulement pour la
   correction). Il recalcule la configuration du clavier à chaque ENTRÉE de focus, et
   là seulement : ni au changement de type d'un champ déjà focalisé, ni au tap sur un
   champ déjà focalisé. Constat sur tablette (septembre 2026) : la dictée restait propre
   parce que son focus d'arrivée tombait sur le champ ENCORE masqué (le démasquage
   n'arrive qu'à la microtâche suivante) ; tout focus posé plus tard sur le champ devenu
   texte — retour de main après « Écouter », « Cacher et écrire », « Presque !
   Réécoute », « Vérifier » à vide, touche d'accent, tap direct — rallumait les
   suggestions.

   D'où la règle : sur Firefox tactile, UN CHAMP `[data-unmask]` EST `password` À
   CHAQUE ENTRÉE DE FOCUS, et redevient `text` à la microtâche suivante — avant tout
   rendu, donc sans qu'un point ne s'affiche ; valeur et sélection sont conservées.
   Deux portes :
   - le tap direct : un écouteur `mousedown` délégué remasque le champ AVANT que le
     focus, action par défaut de cet événement, ne s'y pose ;
   - le focus programmé : `focaliserChamp`, à utiliser à la place de `el.focus()` pour
     tout élément qui PEUT être un champ de réponse texte (règle de code, cf. ui.md).
   Un champ `readonly`, `disabled`, ou déjà focalisé n'est jamais remasqué : le clavier
   n'y est pas recalculé, et un champ en lecture seule masqué montrerait ses points.
   À savoir : « déjà focalisé » se lit sur `document.activeElement`. Les touches d'accent
   (`insertAtCursor`, ui/ortho-taches.ts) ne remasquent donc que parce que leur `<button>`
   prend le focus au clic. Un `mousedown.preventDefault()` posé un jour sur ces touches pour
   garder le clavier ouvert supprimerait cette entrée de focus : sans elle, Firefox ne
   recalcule rien et garde la configuration de la dernière entrée, masquée. Ce serait donc
   sans danger, mais la spec (B6) attend une entrée de focus : c'est elle qu'il faudrait
   adapter, pas ce module.

   PAS AILLEURS QUE SUR FIREFOX TACTILE (`remasquageUtile`). Chrome est déjà couvert par
   `hasBeenPasswordField`, un clavier physique n'affiche pas de barre, et le cycle n'y
   aurait que des coûts : un lecteur d'écran (NVDA, JAWS, TalkBack) peut annoncer « mot
   de passe » à chaque retour de focus scripté (relecture accessibilité, non mesuré), et
   Chrome remet le curseur à 0 au rendu qui suit le changement de type d'un champ
   focalisé (mesuré, cf. `basculerType`).

   *Rejet écrit :* la touche Tab n'est PAS une troisième porte. Elle est la navigation
   principale de NVDA/JAWS en mode formulaire ; la remasquer généraliserait le cycle à
   leur usage le plus fréquent pour un cas marginal (clavier physique branché sur une
   tablette Firefox, où le clavier logiciel et sa barre ne s'affichent pas).
   ============================================================ */

/** Le remasquage à l'entrée de focus sert-il sur ce navigateur ? Gecko (Firefox et ses
    dérivés s'annoncent `Firefox/` ; Firefox iOS, moteur WebKit, s'annonce `FxiOS/` et n'en
    est pas) sur un écran tactile. Pas de test sur « Android » : le mode « version
    ordinateur » de Firefox Android le retire de l'UA, sans changer de clavier. */
function remasquageUtile(): boolean {
	return /\bFirefox\/\d/.test(navigator.userAgent) && navigator.maxTouchPoints > 0;
}

/** Un champ de réponse texte qu'un focus entrant doit trouver masqué. */
function estChampMasquable(el: unknown): el is HTMLInputElement {
	return (
		el instanceof HTMLInputElement && el.hasAttribute('data-unmask') && !el.readOnly && !el.disabled
	);
}

/* Bascule de type en conservant la sélection. Lue et reposée AUTOUR de la bascule, jamais
   mémorisée plus longtemps : entre le masquage et le démasquage, l'appelant a pu déplacer
   le curseur lui-même (`sprintRefuse`), et il doit garder le dernier mot.
   La mise en page FORCÉE entre les deux n'est pas décorative : sur un champ focalisé,
   Chrome recrée l'éditeur interne au rendu suivant le changement de type et y remet le
   curseur à 0, écrasant une sélection reposée avant ce rendu. Constaté sur la touche
   d'accent (`e2e/anti-suggestion-focus.spec.ts`) : « sié » avec le curseur avant le « s ». */
function basculerType(el: HTMLInputElement, type: 'password' | 'text'): void {
	if (el.type === type) return;
	const debut = el.selectionStart;
	const fin = el.selectionEnd;
	el.type = type;
	void el.offsetWidth;
	if (debut !== null && fin !== null) el.setSelectionRange(debut, fin);
}

/** Démasque un champ password marqué `data-unmask` (le rend lisible). */
function unmask(el: Element): void {
	if (el instanceof HTMLInputElement && el.type === 'password') basculerType(el, 'text');
}

/** Démasque tous les champs `[data-unmask]` présents sous `root`. */
function unmaskWithin(root: ParentNode): void {
	root.querySelectorAll('input[data-unmask]').forEach(unmask);
}

/** Un focus va-t-il ENTRER dans `el`, et faut-il qu'il le trouve masqué ? */
function aRemasquer(el: unknown): el is HTMLInputElement {
	return remasquageUtile() && estChampMasquable(el) && document.activeElement !== el;
}

/** Donne le focus à `el` en passant, s'il s'agit d'un champ de réponse texte, par la
    fenêtre `password` que Firefox Android lit à l'entrée de focus. À utiliser à la place
    de `el.focus()` partout où la cible PEUT être un champ `[data-unmask]` ; sur tout autre
    élément, ou hors de Firefox tactile, c'est un simple `focus()`. Démasque quoi qu'il
    arrive à la microtâche suivante, y compris si le focus n'a pas pu se poser. */
export function focaliserChamp(el: HTMLElement | null | undefined): void {
	if (!el) return;
	if (aRemasquer(el)) basculerType(el, 'password');
	el.focus();
	if (el instanceof HTMLInputElement) queueMicrotask(() => unmask(el));
}

/* ---------- Curseur d'un tap ----------
   Masquer au `mousedown`, c'est laisser le navigateur placer le curseur sur un champ qui
   vient de passer en points, dont les glyphes n'ont pas la chasse des lettres que l'enfant
   voit : un tap entre deux lettres pour corriger l'une d'elles pourrait tomber une lettre
   plus loin. Chrome le place juste (mesuré), Firefox n'a pas pu l'être. On lit donc la
   position SOUS LE DOIGT sur le rendu en clair, avant de masquer, et on la repose à la fin
   du geste. Sans effet si `caretPositionFromPoint` manque ou ne désigne pas le champ, et
   jamais sur une sélection étendue (glisser pour sélectionner). */
let tapEnCours: { el: HTMLInputElement; pos: number | null } | null = null;

function positionSousLeDoigt(el: HTMLInputElement, x: number, y: number): number | null {
	const doc = document as Document & {
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
	};
	const p = doc.caretPositionFromPoint?.(x, y);
	if (!p || p.offsetNode !== el) return null;
	return Math.min(Math.max(p.offset, 0), el.value.length);
}

function surMousedown(e: MouseEvent): void {
	tapEnCours = null;
	const el = e.target;
	if (!aRemasquer(el)) return;
	tapEnCours = { el, pos: positionSousLeDoigt(el, e.clientX, e.clientY) };
	basculerType(el, 'password');
}

/* Fin du geste. Démasque aussi en filet le champ masqué au `mousedown`, où que le doigt
   se relève : le démasquage de `focusin` couvre le cas courant, mais un focus EMPÊCHÉ
   (aucun code de l'appli ne le fait aujourd'hui) laisserait sinon le champ en points.
   Filet non testé : il faudrait empêcher le focus artificiellement pour l'exercer. */
function surMouseup(e: MouseEvent): void {
	const tap = tapEnCours;
	tapEnCours = null;
	if (!tap) return;
	const { el, pos } = tap;
	queueMicrotask(() => {
		unmask(el);
		const surLeChamp = e.target === el && document.activeElement === el;
		if (pos !== null && surLeChamp && el.selectionStart === el.selectionEnd) {
			el.setSelectionRange(pos, pos);
		}
	});
}

/** Installe le démasquage automatique des champs de réponse texte (à appeler une
    fois, après que `document.body` existe) : à l'insertion dans le DOM, puis à chaque
    entrée de focus (voir l'en-tête). */
export function installVisiblePasswordReveal(): void {
	unmaskWithin(document); // champs déjà rendus avant l'installation
	const observer = new MutationObserver((records) => {
		for (const rec of records) {
			rec.addedNodes.forEach((node) => {
				if (!(node instanceof Element)) return;
				// Le nœud ajouté peut être le champ lui-même ou un conteneur l'englobant.
				if (node.matches('input[data-unmask]')) unmask(node);
				else unmaskWithin(node);
			});
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });

	// Tap direct. `mousedown` et non `pointerdown` : le focus est l'action PAR DÉFAUT du
	// mousedown, il suit donc dans la même tâche, sans qu'un rendu puisse s'intercaler et
	// montrer des points ; un pointerdown, lui, peut tomber dans une tâche antérieure.
	document.addEventListener('mousedown', surMousedown, true);
	document.addEventListener('mouseup', surMouseup, true);
	// Démasquage à l'entrée de focus, quelle qu'en soit la porte (tap, focus programmé,
	// Tab) : microtâche, donc avant le prochain rendu.
	document.addEventListener(
		'focusin',
		(e) => {
			const el = e.target;
			if (el instanceof HTMLInputElement && el.hasAttribute('data-unmask')) {
				queueMicrotask(() => unmask(el));
			}
		},
		true,
	);
}
