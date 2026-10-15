/* ============================================================
   Figeage post-réponse (#543) : LE geste qui rend un widget répondu non manipulable.
   ------------------------------------------------------------
   Après une réponse, le widget reste VISIBLE (l'enfant compare sa tentative avec la
   solution) mais ne doit plus être manipulable. Deux chemins y mènent : « Vérifier » /
   « Valider », et « Je ne sais pas, montre-moi ». Chacun figeait jusqu'ici à sa façon :
   `disabled` posé au rendu par les binders, boucles propres aux runners, simple drapeau JS
   pour le tableau, et un sélecteur trop étroit côté révélation (`button, input,
   [role="button"]`). Résultat mesuré : une même question, deux états d'interaction (cases du
   tableau atteignables au Tab après « Vérifier », désactivées après « Je ne sais pas »).

   Ce module est désormais le SEUL endroit qui désarme le DOM. Les deux écrans l'appellent
   par un habillage qui ne fixe que leurs sélecteurs (`figerQuestion` en leçon,
   ui/lecon-passer.ts ; `figerCarte` en révision, ui/revision.ts), sur leurs deux chemins.
   Les binders (`verify()`) ne font plus que MARQUER (✓/✗, verdicts en `aria-label`) ; leurs
   drapeaux `frozen` restent, mais comme gardes logiques, pas comme figeage.

   ── Contrat d'appel : APRÈS le dernier rendu du widget ─────────────────────────────
   `verify()` redessine le widget pour poser ses marques : on fige donc APRÈS lui, jamais
   avant, sinon le rendu recréerait des éléments armés. Une fois `verify()` passé, aucun
   binder ne recrée plus d'élément interactif (toutes leurs mutations sont gardées par
   `frozen`) ; et sur le chemin de révélation, où `verify()` n'est jamais appelé, plus rien
   n'est atteignable pour déclencher un rendu (contrôles désactivés, pointeur coupé par le
   CSS). Un futur widget qui redessinerait après coup DOIT rappeler le figeage : la spec
   `e2e/figeage.spec.ts` le joue, runner par runner (table `e2e/figeage-couverture.ts`).

   ── Ce que fait le geste, par sorte d'élément ──────────────────────────────────────
   - Contrôle natif (`button`, `select`, `input` non textuel) : `disabled`, le seul drapeau
     qui coupe à la fois le pointeur et le clavier d'un contrôle natif. `aria-pressed` est
     retiré : une bascule figée n'a plus d'état à annoncer, et le verdict, lui, vit dans
     l'`aria-label`, qui reste.
   - Champ texte (`input` textuel, `textarea`) : `readOnly` + `tabindex="-1"`, et PAS
     `disabled`, qui grise la réponse tapée (critère 10 : elle reste à plein contraste).
   - Élément NON natif à rôle de contrôle (titre de colonne du tri, repère `role="radio"` de
     la droite graduée) : son rôle, son libellé et son état ARIA sont retirés. Il n'est plus
     un contrôle, son texte reste lisible. Même traitement que celui que le tri appliquait
     déjà à ses titres une fois figé (#360). CONSÉQUENCE à connaître : un verdict ne doit
     jamais vivre dans l'`aria-label` d'un contrôle non natif, il partirait avec. Vérifié au
     14/10/2026 : tous les verdicts par élément sont portés par des `<button>` natifs, qui
     gardent le leur ; les deux libellés non natifs disent une action (« Déposer dans… ») ou
     une position (« 3 graduations après 500 »), et le repère de la droite graduée est de
     toute façon remplacé par une figure statique avant le figeage, sur les deux chemins.
   - Tout élément : sorti de l'ordre de tabulation (`tabindex` retiré, ou `-1` pour ce qui
     est focalisable par nature), plus déplaçable (`draggable="false"`), plus éditable
     (`contenteditable="false"`).
   Le CSS de chaque écran complète, via `classeFige`, en coupant le POINTEUR : un `<div>`
   cible de dépôt n'a pas de `disabled`, et un dépôt relancerait le widget.

   ── Ce que le geste ne fait JAMAIS ─────────────────────────────────────────────────
   Ni `inert` ni `aria-hidden` (critère 7) : le widget figé reste lu par un lecteur d'écran,
   verdicts par élément compris, et ses régions live (`#ltriStatus`, `#lappStatus`,
   `#lclicStatus`…) logent DANS le widget : les masquer les rendrait muettes. C'est aussi
   pourquoi le sélecteur vise une liste FERMÉE de rôles de contrôle, et non `[role]` : un
   `role="status"` retiré, et la région se tait.
   Ni le nœud `scene` lui-même : seuls ses descendants sont désarmés (la carte de révision,
   `#revStage`, est une cible de focus programmatique qui doit survivre à la question).

   ── Ce qu'il épargne ───────────────────────────────────────────────────────────────
   - les zones d'APRÈS-verdict de l'écran (`apres` : correction, « Continuer ▶ ») ;
   - le chrome, qui reste utile à côté de la solution : « Écouter » (`.consigne-tts`,
     `.item-tts`), l'aide du geste (`.aide-btn`), l'étayage de la notion (`.etayage-btn`,
     `.etay-lien`) ;
   - le brouillon du problème (`.brouillon`) : l'ardoise peut être ouverte, et l'enfant doit
     pouvoir la relire, la refermer, y finir un calcul.
   Le CSS de figeage de chaque écran (`.lecon-fige`, `.rev-stage--fige`) rend le pointeur à
   ces mêmes zones : les deux listes vont ensemble.
   ============================================================ */

/** Chrome et outils qui restent opérables sur une question tranchée (cf. en-tête). */
const EPARGNES = '.aide-btn, .consigne-tts, .item-tts, .etayage-btn, .etay-lien, .brouillon';

/** Rôles ARIA d'un contrôle OPÉRABLE. Liste fermée, exprès : `[role]` tout court
    ramasserait `role="status"` (régions live) ou `role="group"`, qui ne s'actionnent pas. */
const ROLES_DE_CONTROLE = new Set([
	'button',
	'checkbox',
	'combobox',
	'link',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'radio',
	'searchbox',
	'slider',
	'spinbutton',
	'switch',
	'tab',
	'textbox',
	'treeitem',
]);

/** Tout ce qu'un enfant peut atteindre au Tab, actionner, éditer ou glisser. */
const A_DESARMER = [
	'button',
	'input',
	'select',
	'textarea',
	'a[href]',
	'area[href]',
	'[tabindex]',
	'[draggable]',
	'[contenteditable]',
	...[...ROLES_DE_CONTROLE].map((r) => `[role="${r}"]`),
].join(', ');

/** Types d'`input` qui portent une saisie à lire : figés en lecture seule, jamais grisés. */
const TYPES_TEXTE = new Set([
	'text',
	'search',
	'tel',
	'url',
	'email',
	'password',
	'number',
	'date',
	'month',
	'week',
	'time',
	'datetime-local',
]);

/** Éléments que le navigateur rend focalisables sans `tabindex` (les contrôles natifs non
    textuels sont traités à part, par `disabled`). */
const FOCALISABLES_PAR_NATURE = 'a[href], area[href], input, textarea';

/** Attributs ARIA qui n'ont de sens que sur un contrôle : retirés avec son rôle. */
const ARIA_DE_CONTROLE = ['aria-label', 'aria-pressed', 'aria-checked', 'aria-selected'];

export interface FigeageOpts {
	/** Élément dont les DESCENDANTS sont désarmés (`null` accepté : rien à faire). */
	scene: HTMLElement | null;
	/** Classe d'état posée sur la scène : le CSS de l'écran y coupe le pointeur. */
	classeFige: string;
	/** Zones d'APRÈS-verdict, jamais désarmées (feedback, « Continuer ▶ »). */
	apres: string;
}

/** Fige la scène d'une question tranchée (cf. en-tête). Idempotent : un élément déjà
    désarmé n'est pas réécrit. */
export function figerScene(o: FigeageOpts): void {
	const scene = o.scene;
	if (!scene) return;
	scene.classList.add(o.classeFige);
	// Une zone épargnée ne compte que DANS la scène : un ancêtre extérieur qui porterait la
	// même classe ne doit pas faire épargner tout le widget.
	const dans = (el: Element, selecteur: string): boolean => {
		const zone = el.closest(selecteur);
		return zone !== null && scene.contains(zone);
	};
	for (const el of scene.querySelectorAll(A_DESARMER)) {
		if (dans(el, o.apres) || dans(el, EPARGNES)) continue;
		desarmer(el);
	}
}

function desarmer(el: Element): void {
	if (el instanceof HTMLInputElement && el.type === 'hidden') return; // ni visible ni atteignable
	if (estChampTexte(el)) {
		if (!el.readOnly) el.readOnly = true;
		sortirDuTab(el);
	} else if (
		el instanceof HTMLButtonElement ||
		el instanceof HTMLInputElement ||
		el instanceof HTMLSelectElement
	) {
		if (!el.disabled) el.disabled = true;
		el.removeAttribute('aria-pressed');
	} else {
		retirerRoleDeControle(el);
		sortirDuTab(el);
		const editable = el.getAttribute('contenteditable');
		if (editable !== null && editable.trim().toLowerCase() !== 'false')
			el.setAttribute('contenteditable', 'false');
	}
	// L'attribut, pas la propriété : elle n'existe pas sur un élément SVG.
	const glissable = el.getAttribute('draggable');
	if (glissable !== null && glissable !== 'false') el.setAttribute('draggable', 'false');
}

function estChampTexte(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
	return (
		el instanceof HTMLTextAreaElement ||
		(el instanceof HTMLInputElement && TYPES_TEXTE.has(el.type))
	);
}

/** Retire l'élément de l'ordre de tabulation. Un `tabindex` déjà négatif est laissé tel
    quel (cible de focus programmatique : bac du rangement, consigne du clic-mot). Sinon,
    `tabindex="-1"` pour ce qui est focalisable par nature (champ, lien), qui le resterait
    sans attribut ; retrait pur et simple pour le reste, qui redevient un élément ordinaire
    (le titre de colonne du tri figé n'avait plus de `tabindex` depuis #360). */
function sortirDuTab(el: Element): void {
	const t = el.getAttribute('tabindex');
	if (t !== null && /^\s*-\d+\s*$/.test(t)) return;
	if (el.matches(FOCALISABLES_PAR_NATURE)) el.setAttribute('tabindex', '-1');
	else el.removeAttribute('tabindex');
}

function retirerRoleDeControle(el: Element): void {
	const role = el.getAttribute('role')?.trim().split(/\s+/)[0];
	if (!role || !ROLES_DE_CONTROLE.has(role)) return;
	el.removeAttribute('role');
	for (const a of ARIA_DE_CONTROLE) el.removeAttribute(a);
}
