/* ============================================================
   Geste de FIGEAGE post-réponse (#543, critères 4 et 7), au niveau du DOM.

   Après une réponse, le widget reste visible (l'enfant compare sa tentative avec la
   solution) mais ne doit plus être manipulable. Ce fichier éprouve le GESTE de figeage
   sur une scène synthétique, par son point d'entrée stable côté « Je ne sais pas »
   (`neutraliserScene`, src/ui/revelation-neutre.ts). Auteur des tests distinct de
   l'auteur du code : les attendus viennent de l'issue, pas du sélecteur en place.
   Les parcours réels (les deux chemins, les dix runners, le focus final) sont joués par
   `e2e/figeage.spec.ts`.

   ── Définitions (dérivées du critère 2 : « aucun élément n'est atteignable au Tab, et
      aucun clic, tap, glisser-déposer ni touche ne modifie le widget ») ──────────────
   - ATTEIGNABLE AU TAB : l'élément entre dans l'ordre de tabulation d'un navigateur.
     Non, s'il est dans un sous-arbre `inert`, ou s'il est un contrôle natif `:disabled`.
     Sinon, un attribut `tabindex` entier décide (≥ 0 : oui, < 0 : non). Sans `tabindex`,
     oui pour les éléments focalisables par nature : `button`, `input` (hors `hidden`),
     `select`, `textarea`, `a[href]`, et un hôte d'édition (`isContentEditable`).
   - ACTIVABLE : un clic ou une touche peut l'actionner. Contrôle natif non textuel
     (`button`, `select`, case à cocher…) : tant qu'il n'est pas `disabled` (seul ce
     drapeau coupe à la fois le pointeur et le clavier d'un contrôle natif). Élément non
     natif : tant qu'il s'annonce comme opérable, c'est-à-dire porte un rôle de contrôle
     (`button`, `radio`, `checkbox`…) sans `aria-disabled="true"`.
   - ÉDITABLE : champ texte (`input` textuel, `textarea`) ni `disabled` ni `readOnly`
     (`readOnly` accepté : il garde la réponse tapée à plein contraste, critère 10) ;
     ou hôte `contenteditable`.
   - DÉPLAÇABLE : `draggable` vrai. La PROPRIÉTÉ fait foi quand elle existe ; happy-dom
     ne l'implémente pas, on lit alors l'attribut (`draggable="true"`). Les deux voies
     d'une implémentation (`el.draggable = false` ou l'attribut) sont ainsi reconnues.

   CE QU'IL NE PROUVE PAS : qu'un écouteur JS posé sur un élément non natif se taise
   (un clic sur une `<div>` déclenche ses écouteurs quels que soient ses attributs) ;
   c'est le critère 2, joué dans le navigateur par la spec e2e.

   ── Pourquoi la zone d'après-verdict est DANS la scène ─────────────────────────
   Une zone `apres` hors de la scène ne serait jamais touchée, quel que soit le code :
   le test négatif passerait avec ou sans la garde qu'il prétend tenir (cas #702). On
   la place donc dans la scène, avec des éléments que le nouveau sélecteur ramasserait
   (`span[tabindex="0"]`, `input`).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { neutraliserScene } from '../src/ui/revelation-neutre';

beforeEach(() => {
	document.body.innerHTML = '';
});

/* ---------- Définitions (cf. en-tête) ---------- */

const CONTROLES = 'button, input, select, textarea';
const TYPES_TEXTE = new Set(['text', 'search', 'tel', 'url', 'email', 'password', 'number']);
const ROLES_OPERABLES = new Set([
	'button',
	'checkbox',
	'radio',
	'switch',
	'link',
	'option',
	'tab',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'slider',
	'spinbutton',
	'textbox',
	'combobox',
]);

function tabindexEntier(el: Element): number | null {
	const v = el.getAttribute('tabindex');
	return v !== null && /^\s*-?\d+\s*$/.test(v) ? Number(v) : null;
}
function champTexte(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
	return (
		el instanceof HTMLTextAreaElement ||
		(el instanceof HTMLInputElement && TYPES_TEXTE.has(el.type))
	);
}
function hoteEditable(el: Element): boolean {
	return el instanceof HTMLElement && el.isContentEditable === true;
}

function atteignableAuTab(el: Element): boolean {
	if (el.closest('[inert]')) return false;
	if (el.matches(CONTROLES) && el.matches(':disabled')) return false;
	const t = tabindexEntier(el);
	if (t !== null) return t >= 0;
	if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
	return el.matches(`${CONTROLES}, a[href]`) || hoteEditable(el);
}
function activable(el: Element): boolean {
	if (champTexte(el)) return false; // un champ texte se juge sur « éditable »
	if (el.matches(CONTROLES)) return !el.matches(':disabled');
	const role = el.getAttribute('role')?.trim();
	return !!role && ROLES_OPERABLES.has(role) && el.getAttribute('aria-disabled') !== 'true';
}
function editable(el: Element): boolean {
	if (champTexte(el)) return !el.disabled && !el.readOnly;
	return hoteEditable(el);
}
function deplacable(el: Element): boolean {
	const prop: unknown = el instanceof HTMLElement ? el.draggable : undefined;
	if (typeof prop === 'boolean') return prop;
	return el.getAttribute('draggable') === 'true';
}

type Defaut = 'atteignable au Tab' | 'activable' | 'éditable' | 'déplaçable';

/** Ce qui rend encore l'élément manipulable (vide = bien figé). */
function defauts(el: Element): Defaut[] {
	const d: Defaut[] = [];
	if (atteignableAuTab(el)) d.push('atteignable au Tab');
	if (activable(el)) d.push('activable');
	if (editable(el)) d.push('éditable');
	if (deplacable(el)) d.push('déplaçable');
	return d;
}

/** Premier élément (lui-même ou un ancêtre) qui le retire aux technologies d'assistance,
 *  par attribut ou par propriété (happy-dom ne reflète pas `ariaHidden`). */
function masqueAuxAT(el: Element): Element | null {
	for (let n: Element | null = el; n; n = n.parentElement) {
		if (n.hasAttribute('inert') || n.getAttribute('aria-hidden') === 'true') return n;
		if (n instanceof HTMLElement && (n.inert === true || n.ariaHidden === 'true')) return n;
	}
	return null;
}

/* ---------- Scène synthétique ---------- */

/** Les éléments focalisables ou activables du critère 4, HORS zone d'après-verdict et
 *  hors chrome, avec ce qui les rend manipulables AVANT figeage (premiers principes,
 *  cf. définitions). Le repère SVG reproduit la droite graduée (`.dg-hit`, radio à
 *  `tabindex` itinérant), runner du périmètre. */
const CAS: { cas: string; markup: string; avant: Defaut[] }[] = [
	{
		cas: 'un <select>',
		markup: '<select data-cas><option>chat</option><option>chien</option></select>',
		avant: ['atteignable au Tab', 'activable'],
	},
	{
		cas: 'un <textarea>',
		markup: '<textarea data-cas>ma réponse</textarea>',
		avant: ['atteignable au Tab', 'éditable'],
	},
	{
		cas: 'un <span tabindex="0">',
		markup: '<span tabindex="0" data-cas>mot</span>',
		avant: ['atteignable au Tab'],
	},
	{
		cas: 'un <div role="button" tabindex="0">',
		markup:
			'<div role="button" tabindex="0" aria-label="Déposer dans Animaux" data-cas>Animaux</div>',
		avant: ['atteignable au Tab', 'activable'],
	},
	{
		cas: 'un élément draggable="true"',
		markup: '<div class="tuile-glissee" draggable="true" data-cas>lapin</div>',
		avant: ['déplaçable'],
	},
	{
		cas: 'un élément contenteditable="true"',
		markup: '<div contenteditable="true" data-cas>texte libre</div>',
		avant: ['atteignable au Tab', 'éditable'],
	},
	{
		cas: 'un <input> texte',
		markup: '<input type="text" value="42" data-cas>',
		avant: ['atteignable au Tab', 'éditable'],
	},
	{
		cas: 'un <button>',
		markup: '<button type="button" aria-pressed="true" data-cas>chat</button>',
		avant: ['atteignable au Tab', 'activable'],
	},
	{
		cas: 'un repère SVG role="radio" tabindex="0" (droite graduée)',
		markup:
			'<svg viewBox="0 0 10 10"><circle class="dg-hit" r="2" role="radio" aria-checked="true" tabindex="0" data-cas></circle></svg>',
		avant: ['atteignable au Tab', 'activable'],
	},
];

/** Chrome de l'écran : reste opérable après figeage (critère 9). */
const CHROME = `
	<button type="button" class="consigne-tts" aria-label="Écouter la consigne">Écouter</button>
	<button type="button" class="aide-btn" aria-label="Aide">?</button>`;
/** Le bouton « Écouter » d'un item vit DANS le widget, à côté de l'item. */
const ITEM_TTS =
	'<button type="button" class="item-tts" aria-label="Écouter le mot">Écouter</button>';

/** Verdict par élément et région live du widget (critère 7). La marque ✗ est déjà
 *  `aria-hidden` (décorative) : le figeage ne doit rien AJOUTER de tel. */
const VERDICT = `
	<button type="button" class="tuile" data-verdict aria-label="chat, incorrect">chat<span class="mark" aria-hidden="true">✗</span></button>
	<p class="sr-only" id="ltriStatus" role="status" aria-live="polite">chat, incorrect</p>`;

/** Zone d'après-verdict, avec des éléments que le sélecteur élargi ramasserait. */
const APRES = `
	<button type="button" class="sprint-reveal-detail" data-apres>Voir le détail</button>
	<span tabindex="0" data-apres>la réponse c'est 42</span>
	<input type="text" value="note" data-apres>
	<button type="button" id="next" data-apres>Continuer ▶</button>`;

/** Les deux écrans qui figent (leçon et révision), avec leurs paramètres réels. */
const ECRANS = [
	{
		ecran: 'leçon',
		classeFige: 'lecon-fige',
		apres: '.sprint-correction, .sprint-actions',
		monter: (widget: string) =>
			`<div id="sheets"><div class="sprint-stage">${CHROME}<div class="widget">${ITEM_TTS}${widget}${VERDICT}</div>` +
			`<div class="sprint-correction">${APRES}</div><div class="sprint-actions"></div></div></div>`,
		scene: '.sprint-stage',
	},
	{
		ecran: 'révision',
		classeFige: 'rev-stage--fige',
		apres: '#revAfter',
		monter: (widget: string) =>
			`<div class="rev-card"><div id="revStage">${CHROME}<div class="widget">${ITEM_TTS}${widget}${VERDICT}</div>` +
			`<div id="revAfter">${APRES}</div></div></div>`,
		scene: '#revStage',
	},
];
type Ecran = (typeof ECRANS)[number];

function monter(e: Ecran, widget = CAS.map((c) => c.markup).join('')): HTMLElement {
	document.body.innerHTML = e.monter(widget);
	return document.querySelector<HTMLElement>(e.scene)!;
}
function figer(e: Ecran, scene: HTMLElement): void {
	neutraliserScene({ scene, classeFige: e.classeFige, apres: e.apres });
}

/** Ce qui décide de l'interaction d'un élément : comparé avant/après figeage. */
function etatInteraction(el: Element): Record<string, string | boolean | null> {
	const etat: Record<string, string | boolean | null> = {};
	for (const a of [
		'tabindex',
		'role',
		'aria-label',
		'aria-disabled',
		'draggable',
		'contenteditable',
	])
		etat[a] = el.getAttribute(a);
	etat.disabled = el.matches(CONTROLES) ? el.matches(':disabled') : null;
	etat.readOnly = champTexte(el) ? el.readOnly : null;
	return etat;
}

/* ============================================================ */

describe('Témoin : avant figeage, chaque élément de la scène est bien manipulable', () => {
	// Sans ce témoin, un « plus rien n'est manipulable » vert après figeage ne prouverait
	// rien : il passerait aussi avec des définitions qui ne voient jamais rien.
	it.each(CAS)('$cas', ({ markup, avant }) => {
		monter(ECRANS[0], markup);
		const el = document.querySelector('[data-cas]')!;
		expect(defauts(el)).toEqual(avant);
	});
});

describe('Critère 4 : le figeage désarme TOUT élément focalisable ou activable', () => {
	it.each(CAS)(
		'$cas n’est plus atteignable au Tab, ni activable, éditable ou déplaçable',
		({ markup }) => {
			const e = ECRANS[0];
			const scene = monter(e, markup);
			figer(e, scene);
			const el = document.querySelector('[data-cas]')!;
			expect(
				defauts(el),
				`après figeage, ${el.outerHTML} est encore manipulable (critère 4 de #543)`,
			).toEqual([]);
		},
	);

	it('tous ensemble dans la même scène : aucun ne reste manipulable', () => {
		// Le cas réel : un widget mêle plusieurs sortes d'éléments, et le figeage d'un
		// élément ne doit pas dépendre de la présence des autres.
		const e = ECRANS[0];
		const scene = monter(e);
		figer(e, scene);
		const restants = [...document.querySelectorAll('[data-cas]')]
			.map((el) => ({ el: el.outerHTML, defauts: defauts(el) }))
			.filter((r) => r.defauts.length > 0);
		expect(restants).toEqual([]);
	});
});

describe.each(ECRANS)('Écran $ecran : ce que le figeage ne touche pas', (e) => {
	it('la zone d’après-verdict reste intacte et atteignable au Tab', () => {
		const scene = monter(e);
		const apres = [...document.querySelectorAll('[data-apres]')];
		expect(apres.length).toBe(4);
		expect(apres.every(atteignableAuTab), 'témoin : la zone est atteignable avant').toBe(true);
		const avant = apres.map(etatInteraction);
		figer(e, scene);
		expect(apres.map(etatInteraction)).toEqual(avant);
		expect(apres.every(atteignableAuTab)).toBe(true);
	});

	it('le chrome (« Écouter », aide du geste) reste intact et opérable (critère 9)', () => {
		const scene = monter(e);
		const chrome = [...scene.querySelectorAll('.aide-btn, .consigne-tts, .item-tts')];
		expect(chrome.length).toBe(3);
		const avant = chrome.map(etatInteraction);
		figer(e, scene);
		expect(chrome.map(etatInteraction)).toEqual(avant);
		for (const b of chrome) expect(defauts(b)).toEqual(['atteignable au Tab', 'activable']);
	});
});

describe.each(ECRANS)('Écran $ecran : critère 7, le widget figé reste exposé', (e) => {
	it('ni inert ni aria-hidden sur la scène, ses éléments ou sa région live', () => {
		const scene = monter(e);
		const masquesAvant = new Set(document.querySelectorAll('[inert], [aria-hidden="true"]'));
		figer(e, scene);
		const cibles = [
			scene,
			...document.querySelectorAll('[data-cas], [data-verdict], [role="status"]'),
		];
		for (const el of cibles)
			expect(masqueAuxAT(el), `${el.outerHTML} retiré aux technologies d'assistance`).toBeNull();
		// Rien d'AJOUTÉ nulle part (la marque ✗ décorative l'était déjà).
		const ajoutes = [...document.querySelectorAll('*')].filter(
			(el) => masqueAuxAT(el) === el && !masquesAvant.has(el),
		);
		expect(ajoutes.map((el) => el.outerHTML)).toEqual([]);
	});

	it('la région live garde son rôle, sa politesse et son annonce', () => {
		// Un sélecteur élargi à `[role]` retirerait `role="status"` : la région deviendrait
		// muette pour un lecteur d'écran (critère 10 : mêmes annonces).
		const scene = monter(e);
		figer(e, scene);
		const region = document.querySelector('#ltriStatus')!;
		expect(region.getAttribute('role')).toBe('status');
		expect(region.getAttribute('aria-live')).toBe('polite');
		expect(region.textContent).toBe('chat, incorrect');
	});

	it('un bouton qui porte un verdict par élément le garde (« chat, incorrect »)', () => {
		const scene = monter(e);
		figer(e, scene);
		const tuile = document.querySelector('[data-verdict]')!;
		expect(tuile.getAttribute('aria-label')).toBe('chat, incorrect');
	});
});
