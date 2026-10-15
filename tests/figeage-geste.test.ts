/* ============================================================
   Le geste de figeage lui-même (`figerScene`, ui/figeage.ts, #543) : les BORDS de son
   contrat.

   tests/figeage.test.ts éprouve les critères 4 et 7 par le point d'entrée des écrans
   (`neutraliserScene`) : chaque sorte d'élément cesse d'être manipulable, et rien n'est
   retiré aux technologies d'assistance. Ce fichier appelle le geste directement et joue ce
   que l'autre ne joue pas :
     - les bords de « sortir du Tab » (lien, `tabindex` négatif, `input` caché) ;
     - le champ texte, figé en lecture seule et jamais grisé (critère 10) ;
     - les épargnes du critère 9 au-delà du chrome déjà couvert (étayage, brouillon) ;
     - la frontière de la scène (ancêtre extérieur, nœud `scene` lui-même) ;
     - l'idempotence ;
     - la liste FERMÉE des rôles retirés (critère 7 : une région ou une figure garde son nom).

   Les attendus viennent de l'issue et de l'en-tête du module (le contrat), jamais du corps
   des fonctions. Chaque test qui passe d'emblée nomme, en commentaire « Rougit si », la
   mutation du module qui le fait échouer ; elles ont été jouées sur une copie.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import { figerScene } from '../src/ui/figeage';

beforeEach(() => {
	document.body.innerHTML = '';
});

/* ---------- Banc : la carte d'un runner de leçon, paramètres réels (ui/lecon-passer.ts) ---------- */

const APRES = '.sprint-correction, .sprint-actions';

/** Monte `widget` dans une scène de leçon, avec sa zone d'après-verdict. `autour` enveloppe
    la scène (ancêtre extérieur). Rend la scène. */
function monter(widget: string, autour: (scene: string) => string = (s) => s): HTMLElement {
	document.body.innerHTML = autour(
		`<div class="sprint-stage">${widget}` +
			'<div class="sprint-correction"><button type="button" id="next">Continuer ▶</button></div></div>',
	);
	return document.querySelector<HTMLElement>('.sprint-stage')!;
}
function figer(scene: HTMLElement | null): void {
	figerScene({ scene, classeFige: 'lecon-fige', apres: APRES });
}
function cas(): HTMLElement {
	return document.querySelector<HTMLElement>('[data-cas]')!;
}

/** Atteignable au Tab (même définition que tests/figeage.test.ts, premiers principes) :
    non sous `inert` ni contrôle natif `:disabled` ; sinon un `tabindex` entier décide
    (≥ 0 oui, < 0 non) ; sans lui, oui pour ce qui est focalisable par nature. */
function atteignableAuTab(el: Element): boolean {
	if (el.closest('[inert]')) return false;
	if (el.matches('button, input, select, textarea') && el.matches(':disabled')) return false;
	const t = el.getAttribute('tabindex');
	if (t !== null && /^\s*-?\d+\s*$/.test(t)) return Number(t) >= 0;
	if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
	return el.matches('button, input, select, textarea, a[href]');
}

/* ============================================================ */

describe('Sortir du Tab : les bords', () => {
	it.each([
		{
			// Rougit si : `a[href]` est retiré de la liste des éléments à désarmer.
			cas: 'un lien a[href] sans tabindex',
			markup: '<a href="#etape" data-cas>voir l’étape</a>',
		},
		{
			// Le piège : un lien est focalisable PAR NATURE, retirer son tabindex le laisse au
			// Tab. Rougit si : `a[href]` est retiré des « focalisables par nature » (le geste
			// retire alors l'attribut au lieu de poser -1).
			cas: 'un lien a[href] tabindex="0" (retirer le tabindex ne suffit pas)',
			markup: '<a href="#etape" tabindex="0" data-cas>voir l’étape</a>',
		},
	])('$cas n’est plus atteignable au Tab', ({ markup }) => {
		figer(monter(markup));
		expect(atteignableAuTab(cas())).toBe(false);
	});

	it('témoin : avant figeage, ces liens sont bien atteignables au Tab', () => {
		monter('<a href="#a" data-l>a</a><a href="#b" tabindex="0" data-l>b</a>');
		const liens = [...document.querySelectorAll('[data-l]')];
		expect(liens.map(atteignableAuTab)).toEqual([true, true]);
	});

	it.each([
		{ cas: 'le bac du rangement', markup: '<div class="ltui-bac" tabindex="-1" data-cas></div>' },
		{
			cas: 'la consigne du clic sur le mot',
			markup: '<p class="lclic-consigne" tabindex="-1" data-cas>Touche le verbe.</p>',
		},
	])(
		'un tabindex NÉGATIF déjà présent est laissé tel quel ($cas, cible de focus programmatique)',
		({ markup }) => {
			// Rougit si : le cas « déjà négatif » n'est plus épargné dans la sortie du Tab ;
			// un élément non natif perd alors son tabindex et cesse d'être focalisable par
			// programme (le repli de focus du bac tombe sur <body>).
			figer(monter(markup));
			expect(cas().getAttribute('tabindex')).toBe('-1');
		},
	);

	it('un input type="hidden" n’est pas touché (ni visible ni atteignable : rien à figer)', () => {
		// Rougit si : la garde `hidden` disparaît ; l'input reçoit alors `disabled`, ce qui le
		// retire en plus des données d'un formulaire.
		const scene = monter('<input type="hidden" name="reponse" value="42" data-cas>');
		const avant = cas().outerHTML;
		figer(scene);
		expect(cas().outerHTML).toBe(avant);
	});
});

describe('Champ texte (critère 10) : lecture seule, hors du Tab, JAMAIS grisé', () => {
	/* `disabled` grise la réponse tapée ; l'issue l'exclut : elle reste à plein contraste. */
	it.each([
		// Rougit si : le champ texte n'est plus reconnu comme tel (il part en `disabled`).
		{ cas: '<input type="text">', markup: '<input type="text" value="42" data-cas>' },
		// Rougit si : `number` est retiré des types textuels.
		{ cas: '<input type="number">', markup: '<input type="number" value="7" data-cas>' },
		// Le type absent vaut « text ».
		{ cas: '<input> sans type', markup: '<input value="mille" data-cas>' },
		{ cas: '<textarea>', markup: '<textarea data-cas>ma réponse</textarea>' },
		// Rougit si : `input` est retiré des « focalisables par nature » (tabindex retiré au
		// lieu de -1, le champ reste au Tab).
		{
			cas: '<input type="text" tabindex="0">',
			markup: '<input type="text" value="42" tabindex="0" data-cas>',
		},
	])('$cas', ({ markup }) => {
		const scene = monter(markup);
		const el = cas() as HTMLInputElement | HTMLTextAreaElement;
		const valeur = el.value;
		expect(atteignableAuTab(el), 'témoin : atteignable avant figeage').toBe(true);
		expect(el.readOnly, 'témoin : éditable avant figeage').toBe(false);

		figer(scene);
		expect(el.readOnly, 'plus éditable').toBe(true);
		expect(el.disabled, 'jamais disabled : la réponse resterait grisée').toBe(false);
		expect(el.matches(':disabled')).toBe(false);
		// Rougit si : la sortie du Tab est retirée de la branche « champ texte ».
		expect(atteignableAuTab(el), 'hors de l’ordre de tabulation').toBe(false);
		expect(el.value, 'la réponse tapée reste').toBe(valeur);
	});
});

describe('Épargnes (critère 9) : l’étayage et le brouillon restent opérables', () => {
	/* Markup des vrais composants (ui/etayage-panneau.ts, ui/brouillon.ts). Un bouton du
	   widget sert de TÉMOIN : sans lui, un geste qui ne ferait rien laisserait ce test vert. */
	const ETAYAGE_BTN =
		'<button type="button" class="etayage-btn" aria-label="Revoir la notion" data-epargne>?</button>';
	const ETAY_LIEN =
		'<button type="button" class="etay-lien" id="runEtayage" data-epargne><span>Revoir la notion</span></button>';
	const BROUILLON = `<div class="brouillon">
		<button type="button" class="brouillon-toggle" aria-expanded="true" data-epargne>J'ai besoin d'un brouillon</button>
		<div class="brouillon-panel">
			<canvas class="brouillon-canvas" aria-label="Zone de brouillon pour poser ton calcul"></canvas>
			<button type="button" class="brouillon-clear" data-epargne>Tout effacer</button>
		</div></div>`;
	const TEMOIN = '<button type="button" class="tuile" data-temoin>chat</button>';

	it.each([
		// Rougit si : `.etayage-btn` est retiré des épargnes.
		{ cas: 'le bouton d’étayage (.etayage-btn)', markup: ETAYAGE_BTN },
		// Rougit si : `.etay-lien` est retiré des épargnes.
		{ cas: 'le lien d’étayage (.etay-lien)', markup: ETAY_LIEN },
		// Rougit si : `.brouillon` est retiré des épargnes ; ou si l'épargne ne vaut plus que
		// pour l'élément qui porte la classe, et pas pour ses DESCENDANTS (le `.brouillon` est
		// un <div> : ce sont ses boutons qu'il faut épargner).
		{ cas: 'le brouillon et les contrôles qu’il contient', markup: BROUILLON },
	])('$cas', ({ markup }) => {
		const scene = monter(`${markup}<div class="widget">${TEMOIN}</div>`);
		const epargnes = [...scene.querySelectorAll('[data-epargne]')];
		expect(epargnes.length).toBeGreaterThan(0);
		const avant = epargnes.map((e) => e.outerHTML);
		expect(epargnes.every(atteignableAuTab), 'témoin : opérables avant figeage').toBe(true);

		figer(scene);
		expect(
			atteignableAuTab(document.querySelector('[data-temoin]')!),
			'témoin : le widget, lui, est figé',
		).toBe(false);
		expect(
			epargnes.map((e) => e.outerHTML),
			'aucun attribut touché',
		).toEqual(avant);
		expect(epargnes.every(atteignableAuTab), 'toujours opérables').toBe(true);
	});
});

describe('Frontière de la scène', () => {
	/* Une épargne ne vaut que DANS la scène : un ancêtre extérieur qui porterait la même
	   classe laisserait tout le widget manipulable (critère 2).
	   Rougit si : l'épargne est cherchée par `closest` sans vérifier que la zone trouvée est
	   dans la scène. */
	it.each([
		{
			cas: 'une classe d’épargne (.brouillon)',
			autour: (s: string) => `<div class="brouillon">${s}</div>`,
		},
		{
			cas: 'la classe de la zone d’après-verdict (.sprint-correction)',
			autour: (s: string) => `<div class="sprint-correction">${s}</div>`,
		},
	])('$cas portée par un ANCÊTRE extérieur ne fait pas épargner le widget', ({ autour }) => {
		const scene = monter('<button type="button" class="tuile" data-cas>chat</button>', autour);
		figer(scene);
		expect((cas() as HTMLButtonElement).disabled).toBe(true);
		expect(atteignableAuTab(cas())).toBe(false);
	});

	it('la scène reçoit la classe de figeage (le CSS de l’écran y coupe le pointeur)', () => {
		// Rougit si : la classe n'est plus posée.
		const scene = monter('');
		figer(scene);
		expect(scene.classList.contains('lecon-fige')).toBe(true);
	});

	it('le nœud scene lui-même n’est pas désarmé : il reste une cible de focus', () => {
		/* Seuls ses DESCENDANTS sont désarmés. La carte de révision (#revStage, tabindex="-1")
		   doit survivre à la question ; son -1 est déjà tenu par la règle « tabindex négatif
		   laissé tel quel ». Pour que ce test garde la frontière elle-même, la scène porte ici
		   un tabindex que le geste retirerait s'il la traitait comme un descendant.
		   Rougit si : la scène est incluse dans les éléments désarmés. */
		document.body.innerHTML =
			'<div class="rev-card"><div id="revStage" tabindex="0" role="region" aria-label="Question">' +
			'<button type="button" class="tuile" data-cas>chat</button>' +
			'<div id="revAfter"></div></div></div>';
		const scene = document.querySelector<HTMLElement>('#revStage')!;
		figerScene({ scene, classeFige: 'rev-stage--fige', apres: '#revAfter' });
		expect(scene.getAttribute('tabindex')).toBe('0');
		expect(scene.getAttribute('role')).toBe('region');
		expect(scene.getAttribute('aria-label')).toBe('Question');
		expect((cas() as HTMLButtonElement).disabled, 'témoin : le descendant est figé').toBe(true);
	});

	it('scene null : rien à faire, sans erreur', () => {
		// Rougit si : la garde `null` disparaît.
		expect(() => figer(null)).not.toThrow();
	});
});

describe('Idempotence', () => {
	it('deux appels successifs donnent le même DOM', () => {
		/* Un widget qui mêle toutes les sortes d'éléments, épargnes comprises.
		   Rougit si : un état est BASCULÉ au lieu d'être posé (p. ex. la classe de figeage
		   ajoutée par `toggle` : le second appel la retire). */
		const scene = monter(
			[
				'<select><option>chat</option><option>chien</option></select>',
				'<textarea>ma réponse</textarea>',
				'<input type="text" value="42">',
				'<input type="hidden" value="x">',
				'<span tabindex="0">mot</span>',
				'<div class="ltui-bac" tabindex="-1"></div>',
				'<div role="button" tabindex="0" aria-label="Déposer dans Animaux">Animaux</div>',
				'<div draggable="true">lapin</div>',
				'<div contenteditable="true">texte</div>',
				'<button type="button" aria-pressed="true">chat</button>',
				'<a href="#x">lien</a>',
				'<svg viewBox="0 0 10 10"><circle role="radio" aria-checked="true" tabindex="0" r="2"></circle></svg>',
				'<button type="button" class="item-tts">Écouter</button>',
			].join(''),
		);
		figer(scene);
		const une = document.body.innerHTML;
		figer(scene);
		expect(document.body.innerHTML).toBe(une);
	});
});

describe('Rôles hors de la liste fermée (critère 7) : jamais retirés', () => {
	/* Seul un rôle de CONTRÔLE perd son rôle et son libellé. Un groupe, une région live ou
	   une figure garde les siens, même atteignable au Tab avant figeage : sans eux, la région
	   se tait et la figure perd sa description.
	   Rougit si : le rôle est retiré quel qu'il soit (liste fermée ignorée). */
	it.each([
		{
			cas: 'role="group" (avec son nom)',
			markup: '<div role="group" aria-label="Bac des mots" tabindex="0" data-cas></div>',
			role: 'group',
			label: 'Bac des mots',
		},
		{
			cas: 'role="status" (région live)',
			markup:
				'<p role="status" aria-live="polite" aria-label="Verdict" tabindex="0" data-cas>chat, incorrect</p>',
			role: 'status',
			label: 'Verdict',
		},
		{
			cas: 'role="img" (figure décrite)',
			markup:
				'<svg role="img" aria-label="Droite graduée de 0 à 10" tabindex="0" viewBox="0 0 10 10" data-cas></svg>',
			role: 'img',
			label: 'Droite graduée de 0 à 10',
		},
	])('$cas garde son rôle et son libellé, mais sort du Tab', ({ markup, role, label }) => {
		const scene = monter(markup);
		expect(atteignableAuTab(cas()), 'témoin : atteignable avant figeage').toBe(true);
		figer(scene);
		expect(cas().getAttribute('role')).toBe(role);
		expect(cas().getAttribute('aria-label')).toBe(label);
		expect(atteignableAuTab(cas())).toBe(false);
	});
});

describe('Hôte d’édition : toutes les valeurs « éditables » de contenteditable', () => {
	/* La chaîne VIDE et « plaintext-only » rendent l'élément éditable au même titre que
	   « true ». happy-dom ne le reflète pas dans `isContentEditable` ; on lit donc l'attribut :
	   « false », ou absent (aucun ancêtre éditable dans ce banc), sont les deux seuls états
	   non éditables.
	   Rougit si : seul `contenteditable="true"` est neutralisé. */
	it.each([
		{ cas: 'contenteditable=""', valeur: '' },
		{ cas: 'contenteditable="plaintext-only"', valeur: 'plaintext-only' },
	])('$cas n’est plus éditable', ({ valeur }) => {
		const scene = monter(`<div contenteditable="${valeur}" data-cas>texte</div>`);
		figer(scene);
		expect(['false', null]).toContain(cas().getAttribute('contenteditable'));
	});
});
