/* ============================================================
   Verrou d'arrière-plan des modales : RÉENTRANT (retour terrain, novembre 2026).

   LE BUG. Une modale ouverte rend ses frères `inert` et bloque le défilement de la page
   (`activateModal`, ui/modal-a11y.ts). Ouvrir une seconde fois la même modale de
   récompense sans l'avoir fermée, puis la fermer UNE fois, laissait toute la page inerte :
   plus aucun bouton ne répondait jusqu'au rechargement. Même défaut pour deux modales
   imbriquées fermées dans le désordre.

   CE QUI EST EXIGÉ (et rien de plus) :
   - quand plus aucune modale n'est ouverte, aucun enfant de <body> n'est inerte, le
     défilement retrouve sa valeur d'origine, et aucun piège à focus ne subsiste ;
   - tant qu'une modale est ouverte, ELLE n'est pas inerte et le reste de la page l'est ;
   - un élément inerte posé par un tiers le reste ; une annonce persistante ne l'est jamais ;
   - côté `effects.ts`, une seconde ouverture AJOUTE à la modale déjà ouverte (récompenses
     listées, `then` du passage de niveau joués), elle ne remplace rien.

   La couche de confettis (décorative, ajoutée par `confetti()`) est écartée des comptes.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateModal } from '../src/ui/modal-a11y';
import type { ModalA11yOptions } from '../src/ui/modal-a11y';
import { hideCelebration, hideLevelUp, showCelebration, showLevelUp } from '../src/ui/effects';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import type { Recompense } from '../src/core/unlocks';

const ORIGINE_DEFILEMENT = 'auto';

/* Enfants directs de <body> porteurs de `inert`, désignés par leur id (la couche de
   confettis est écartée : ce n'est pas un frère de l'interface). */
function inertes(): string[] {
	return Array.from(document.body.children)
		.filter((el) => !el.classList.contains('confetti-layer') && el.hasAttribute('inert'))
		.map((el) => el.id || el.tagName);
}
const estInerte = (id: string): boolean => document.getElementById(id)!.hasAttribute('inert');

function monterPage(): void {
	document.body.innerHTML = `
		<div id="toolbar"><button id="btnOutil">Outil</button></div>
		<div id="sheets"><button id="btnFiche">Fiche</button></div>
		<div id="celebrate" style="display:none">
			<ul id="celebrateList"></ul><button id="celebrateOk">Super !</button>
		</div>
		<div id="levelup" style="display:none">
			<span id="levelupNum"></span><p id="levelupNext"></p><ul id="levelupUnlocks"></ul>
			<button id="levelupOk">Continuer</button>
		</div>
		<div id="modaleA" style="display:none">
			<button id="a1">A1</button><button id="a2">A2</button><button id="a3">A3</button>
		</div>
		<div id="modaleB" style="display:none">
			<button id="b1">B1</button><button id="b2">B2</button><button id="b3">B3</button>
		</div>`;
}

/* Ouvertures de la primitive faites par le test : toutes refermées en fin de test
   (`release` est idempotent), pour qu'un test rouge ne laisse pas de modale « ouverte »
   à un éventuel état de module du verrou. */
const liberations: Array<() => void> = [];
function ouvrir(id: string, opts: ModalA11yOptions = {}): () => void {
	const el = document.getElementById(id)!;
	el.style.display = '';
	const release = activateModal(el, opts);
	liberations.push(release);
	return () => {
		release();
		el.style.display = 'none';
	};
}

/* Les écouteurs `keydown` posés sur `document` survivent au nettoyage du DOM : une
   fermeture qui en oublie un (le défaut même qu'on traque) contaminerait les tests
   suivants. On les retire tous en fin de test. */
const espionner = () => vi.spyOn(document, 'addEventListener');
let espionEcouteurs: ReturnType<typeof espionner>;

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	monterPage();
	espionEcouteurs = espionner();
});

afterEach(() => {
	hideCelebration();
	hideLevelUp();
	liberations.splice(0).forEach((release) => release());
	for (const [type, ecouteur, options] of espionEcouteurs.mock.calls) {
		document.removeEventListener(type, ecouteur, options);
	}
	vi.restoreAllMocks();
	document.body.innerHTML = '';
	document.body.style.overflow = '';
});

describe('showCelebration appelée deux fois, fermée une fois', () => {
	it('après hideCelebration, aucun enfant de <body> ne reste inerte', () => {
		showCelebration([{ icon: '🥉', text: 'Médaille de bronze' }]);
		showCelebration([{ icon: '🏆', text: 'Trophée du lecteur' }]);
		hideCelebration();
		expect(inertes()).toEqual([]);
	});

	it('la seconde liste s’ajoute à la première : les récompenses des deux appels sont listées', () => {
		showCelebration([
			{ icon: '🥉', text: 'Médaille de bronze' },
			{ icon: '⭐', text: 'Objectif du jour' },
		]);
		showCelebration([{ icon: '🏆', text: 'Trophée du lecteur' }]);
		const liste = document.getElementById('celebrateList')!;
		expect(liste.querySelectorAll('li')).toHaveLength(3);
		for (const texte of ['Médaille de bronze', 'Objectif du jour', 'Trophée du lecteur']) {
			expect(liste.textContent).toContain(texte);
		}
	});

	it('après hideCelebration, le défilement retrouve sa valeur d’origine', () => {
		document.body.style.overflow = ORIGINE_DEFILEMENT;
		showCelebration([{ icon: '🥉', text: 'Médaille de bronze' }]);
		showCelebration([{ icon: '🏆', text: 'Trophée du lecteur' }]);
		hideCelebration();
		expect(document.body.style.overflow).toBe(ORIGINE_DEFILEMENT);
	});

	it('après hideCelebration, plus aucun piège à focus : Tab n’est pas intercepté', () => {
		showCelebration([{ icon: '🥉', text: 'Médaille de bronze' }]);
		showCelebration([{ icon: '🏆', text: 'Trophée du lecteur' }]);
		hideCelebration();
		const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		document.getElementById('btnFiche')!.dispatchEvent(tab);
		expect(tab.defaultPrevented).toBe(false);
	});

	it('après hideCelebration, le focus revient au déclencheur d’origine, pas dans la modale fermée', () => {
		document.getElementById('btnFiche')!.focus();
		showCelebration([{ icon: '🥉', text: 'Médaille de bronze' }]);
		showCelebration([{ icon: '🏆', text: 'Trophée du lecteur' }]);
		hideCelebration();
		expect(document.activeElement?.id).toBe('btnFiche');
	});

	/* Garde du contrat « on ajoute à une modale DÉJÀ OUVERTE » : une ouverture neuve, après
	   fermeture, ne doit pas ressortir les récompenses d'une annonce passée. */
	it('une nouvelle ouverture après fermeture ne reprend pas les récompenses de la précédente', () => {
		showCelebration([{ icon: '🥉', text: 'Médaille de bronze' }]);
		hideCelebration();
		showCelebration([{ icon: '🏆', text: 'Trophée du lecteur' }]);
		const liste = document.getElementById('celebrateList')!;
		expect(liste.textContent).toContain('Trophée du lecteur');
		expect(liste.textContent).not.toContain('Médaille de bronze');
	});
});

describe('showLevelUp appelée deux fois, fermée une fois', () => {
	it('après hideLevelUp, aucun enfant de <body> ne reste inerte', () => {
		showLevelUp(5);
		showLevelUp(6);
		hideLevelUp();
		expect(inertes()).toEqual([]);
	});

	it('le `then` de chaque appel est joué, une fois chacun', () => {
		const apres5 = vi.fn();
		const apres6 = vi.fn();
		showLevelUp(5, [], apres5);
		showLevelUp(6, [], apres6);
		hideLevelUp();
		expect(apres5).toHaveBeenCalledTimes(1);
		expect(apres6).toHaveBeenCalledTimes(1);
	});

	it('après hideLevelUp, le défilement retrouve sa valeur d’origine', () => {
		document.body.style.overflow = ORIGINE_DEFILEMENT;
		showLevelUp(5);
		showLevelUp(6);
		hideLevelUp();
		expect(document.body.style.overflow).toBe(ORIGINE_DEFILEMENT);
	});
});

describe('activateModal imbriqué : B ouverte pendant que A l’est', () => {
	it('B, ouverte par-dessus A, n’est pas inerte, même si l’ouverture de A l’avait inertée', () => {
		// B est un frère de A, présent dès l'ouverture de A : le cas où A l'inerte.
		ouvrir('modaleA');
		ouvrir('modaleB');
		expect(estInerte('modaleB')).toBe(false);
		expect(estInerte('modaleA')).toBe(true);
		expect(estInerte('toolbar')).toBe(true);
		expect(estInerte('sheets')).toBe(true);
	});

	it('fermer B rend A utilisable et laisse le reste de la page inerte', () => {
		ouvrir('modaleA');
		const fermerB = ouvrir('modaleB');
		fermerB();
		expect(estInerte('modaleA')).toBe(false);
		expect(estInerte('toolbar')).toBe(true);
		expect(estInerte('sheets')).toBe(true);
	});

	it('fermer B puis A : plus aucun élément inerte', () => {
		const fermerA = ouvrir('modaleA');
		const fermerB = ouvrir('modaleB');
		fermerB();
		fermerA();
		expect(inertes()).toEqual([]);
	});

	it('fermer A d’abord : B, toujours ouverte, reste utilisable et l’arrière-plan reste inerte', () => {
		const fermerA = ouvrir('modaleA');
		ouvrir('modaleB');
		fermerA();
		expect(estInerte('modaleB')).toBe(false);
		expect(estInerte('toolbar')).toBe(true);
		expect(estInerte('sheets')).toBe(true);
	});

	it('fermer A puis B : plus aucun élément inerte', () => {
		const fermerA = ouvrir('modaleA');
		const fermerB = ouvrir('modaleB');
		fermerA();
		fermerB();
		expect(inertes()).toEqual([]);
	});
});

describe('élément déjà inerte avant toute modale (posé par un tiers)', () => {
	beforeEach(() => {
		const tiers = document.createElement('div');
		tiers.id = 'tiers';
		tiers.setAttribute('inert', '');
		document.body.appendChild(tiers);
	});

	it('une modale ouverte puis fermée : il reste inerte', () => {
		ouvrir('modaleA')();
		expect(estInerte('tiers')).toBe(true);
		expect(inertes()).toEqual(['tiers']);
	});

	it.each([
		['B puis A', ['B', 'A']],
		['A puis B', ['A', 'B']],
	] as const)('deux modales imbriquées fermées %s : il reste inerte', (_ordre, fermeture) => {
		const fermer = { A: ouvrir('modaleA'), B: ouvrir('modaleB') };
		fermeture.forEach((m) => fermer[m]());
		expect(inertes()).toEqual(['tiers']);
	});
});

describe('verrou de défilement', () => {
	beforeEach(() => {
		document.body.style.overflow = ORIGINE_DEFILEMENT;
	});

	it('une modale : bloqué pendant, valeur d’origine après', () => {
		const fermer = ouvrir('modaleA');
		expect(document.body.style.overflow).toBe('hidden');
		fermer();
		expect(document.body.style.overflow).toBe(ORIGINE_DEFILEMENT);
	});

	it.each([
		['B puis A', ['B', 'A']],
		['A puis B', ['A', 'B']],
	] as const)(
		'deux modales fermées %s : bloqué tant qu’une est ouverte, valeur d’origine à la fin',
		(_ordre, [premiere, seconde]) => {
			const fermer = { A: ouvrir('modaleA'), B: ouvrir('modaleB') };
			expect(document.body.style.overflow).toBe('hidden');
			fermer[premiere]();
			// `soft` : l'état final est rapporté même si l'état intermédiaire est faux.
			expect.soft(document.body.style.overflow, 'une modale reste ouverte').toBe('hidden');
			fermer[seconde]();
			expect(document.body.style.overflow, 'toutes fermées').toBe(ORIGINE_DEFILEMENT);
		},
	);
});

describe('annonce persistante (`data-annonce-persistante`)', () => {
	it('n’est jamais inertée, ni par une modale ni par deux imbriquées', () => {
		const annonce = document.createElement('div');
		annonce.id = 'annonce';
		annonce.className = 'sr-only';
		annonce.setAttribute('aria-live', 'polite');
		annonce.setAttribute('data-annonce-persistante', '');
		document.body.appendChild(annonce);

		ouvrir('modaleA');
		expect(estInerte('annonce'), 'une modale ouverte').toBe(false);
		expect(estInerte('toolbar'), 'prémisse : l’arrière-plan est bien inerté').toBe(true);
		ouvrir('modaleB');
		expect(estInerte('annonce'), 'deux modales ouvertes').toBe(false);
	});
});

/* ============================================================
   Piège clavier avec deux modales ouvertes (relecture a11y) : seule la modale du DESSUS
   pilote Tab et Échap. Chaque modale pose un écouteur `keydown` en capture sur `document` ;
   `stopPropagation` n'arrête pas les autres écouteurs du même nœud.

   ENVIRONNEMENT. happy-dom n'implémente pas `offsetParent` (mesuré : propriété absente,
   donc `undefined`, et `undefined !== null`) : `visibleFocusables` y compterait comme
   visible tout focusable, masqué ou non. On lui rend, le temps de ce bloc, sa sémantique
   de navigateur sur ce point : `null` si l'élément ou un ancêtre est en `display:none`.
   En revanche happy-dom REFUSE déjà le focus à un élément sous `inert`, comme un
   navigateur (mesuré) : rien à émuler de ce côté.
   ============================================================ */
const masque = (el: Element): boolean => {
	for (let n: Element | null = el; n; n = n.parentElement) {
		if (n instanceof HTMLElement && (n.style.display === 'none' || n.hidden)) return true;
	}
	return false;
};

function appuyer(touche: 'Tab' | 'Escape', shiftKey = false): KeyboardEvent {
	const ev = new KeyboardEvent('keydown', {
		key: touche,
		shiftKey,
		bubbles: true,
		cancelable: true,
	});
	(document.activeElement ?? document.body).dispatchEvent(ev);
	return ev;
}
const focaliser = (id: string): void => document.getElementById(id)!.focus();
const actif = (): string | undefined => document.activeElement?.id;

describe('piège clavier, A puis B ouverte par-dessus : seule B pilote', () => {
	beforeEach(() => {
		expect('offsetParent' in HTMLElement.prototype, 'happy-dom l’implémente désormais').toBe(false);
		Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
			configurable: true,
			get(this: HTMLElement) {
				return this.isConnected && !masque(this) ? document.body : null;
			},
		});
	});
	afterEach(() => {
		Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
	});

	it('prémisse d’environnement : un bouton de modale ouverte est vu visible, masquée non', () => {
		ouvrir('modaleA');
		expect(document.getElementById('a1')!.offsetParent).not.toBeNull();
		expect(document.getElementById('b1')!.offsetParent).toBeNull();
	});

	it('Tab sur un focusable du MILIEU de B : rien n’annule le Tab, le focus ne saute pas', () => {
		ouvrir('modaleA');
		ouvrir('modaleB');
		focaliser('b2');
		const tab = appuyer('Tab');
		expect(tab.defaultPrevented).toBe(false);
		expect(actif()).toBe('b2');
	});

	it('Tab sur le dernier de B boucle sur le premier de B ; Maj+Tab sur le premier, sur le dernier', () => {
		ouvrir('modaleA');
		ouvrir('modaleB');
		focaliser('b3');
		expect(appuyer('Tab').defaultPrevented).toBe(true);
		expect(actif()).toBe('b1');
		expect(appuyer('Tab', true).defaultPrevented).toBe(true);
		expect(actif()).toBe('b3');
	});

	it('Échap, A et B ouvertes : seul le onEscape de B est appelé', () => {
		const echapA = vi.fn();
		const echapB = vi.fn();
		ouvrir('modaleA', { onEscape: echapA });
		ouvrir('modaleB', { onEscape: echapB });
		appuyer('Escape');
		expect(echapB).toHaveBeenCalledTimes(1);
		expect(echapA).not.toHaveBeenCalled();
	});

	it('après fermeture de B, A reprend la main : Tab boucle dans A, Échap appelle le onEscape de A', () => {
		const echapA = vi.fn();
		const echapB = vi.fn();
		ouvrir('modaleA', { onEscape: echapA });
		const fermerB = ouvrir('modaleB', { onEscape: echapB });
		fermerB();
		focaliser('a3');
		expect(actif(), 'prémisse : A est de nouveau focalisable').toBe('a3');
		expect(appuyer('Tab').defaultPrevented).toBe(true);
		expect(actif()).toBe('a1');
		appuyer('Escape');
		expect(echapA).toHaveBeenCalledTimes(1);
		expect(echapB).not.toHaveBeenCalled();
	});

	it('fermeture de B : le focus revient sur le bouton de A depuis lequel B a été ouverte', () => {
		ouvrir('modaleA');
		focaliser('a2');
		const fermerB = ouvrir('modaleB'); // déclencheur par défaut : l'élément actif, a2
		expect(actif(), 'prémisse : B a pris le focus').toMatch(/^b/);
		fermerB();
		expect(actif()).toBe('a2');
	});

	it('fermeture de A d’abord, B encore ouverte : le focus reste dans B', () => {
		focaliser('btnFiche');
		const fermerA = ouvrir('modaleA'); // déclencheur de A : btnFiche
		ouvrir('modaleB');
		fermerA();
		expect(document.getElementById('modaleB')!.contains(document.activeElement)).toBe(true);
	});
});

/* ============================================================
   `showLevelUp` rouvert sans fermeture (relecture qualité) : la seconde ouverture AJOUTE
   ses déblocages à ceux déjà affichés, et le niveau annoncé est le plus haut des deux.
   ============================================================ */
describe('showLevelUp rouvert sans fermeture : rien de ce qui est annoncé ne disparaît', () => {
	const r1: Recompense = { type: 'rang', icone: '🛡️', texte: 'Nouveau rang : Explorateur' };
	const r2: Recompense = { type: 'mascotte', icone: '🐣', texte: 'Ton compagnon grandit !' };
	const deblocages = (): HTMLElement => document.getElementById('levelupUnlocks')!;

	it('niveau 2 avec un déblocage, puis niveau 3 sans : le déblocage reste listé et visible, niveau 3 affiché', () => {
		showLevelUp(2, [r1]);
		showLevelUp(3, []);
		// `soft` : chaque exigence est rapportée, même si une précédente échoue.
		expect.soft(deblocages().textContent, 'déblocage du niveau 2').toContain(r1.texte);
		expect.soft(deblocages().style.display, 'liste visible').not.toBe('none');
		expect.soft(document.getElementById('levelupNum')!.textContent, 'niveau affiché').toBe('3');
	});

	it('niveau 3 puis niveau 2, chacun son déblocage : les deux sont listés, niveau 3 affiché', () => {
		showLevelUp(3, [r1]);
		showLevelUp(2, [r2]);
		expect.soft(deblocages().textContent, 'déblocage du niveau 3').toContain(r1.texte);
		expect.soft(deblocages().textContent, 'déblocage du niveau 2').toContain(r2.texte);
		expect.soft(deblocages().style.display, 'liste visible').not.toBe('none');
		expect.soft(document.getElementById('levelupNum')!.textContent, 'niveau affiché').toBe('3');
	});
});

/* ============================================================
   Restauration du focus à la fermeture, quand un repli `restoreFocusTo` est fourni.

   CE QUI N'EST PAS TESTÉ ICI, ET POURQUOI. Le défaut relevé en relecture (déclencheur
   MASQUÉ, `display:none` sur lui ou un ancêtre : `focus()` y échoue sans bruit, le repli
   n'est jamais tenté, le focus tombe sur <body>) ne se reproduit pas sous happy-dom :
   mesuré (happy-dom 21), `focus()` y RÉUSSIT sur un élément masqué, avec ou sans émulation
   d'`offsetParent` ; seul `inert` est refusé. Un test « le focus finit sur le repli »
   serait donc rouge aujourd'hui pour une raison qui n'est pas celle du navigateur, et son
   verdict après correction dépendrait du MÉCANISME choisi : vert avec `checkVisibility()`
   (implémenté par happy-dom), rouge à tort avec « focaliser puis vérifier
   `document.activeElement` », pourtant la parade la plus sûre en navigateur. Ce cas
   relève d'une spec Playwright, en vrai navigateur.
   ============================================================ */
describe('restauration du focus avec repli fourni', () => {
	it('témoin : déclencheur visible et focalisable, le focus y revient, pas sur le repli', () => {
		focaliser('btnFiche');
		const fermer = ouvrir('modaleA', { restoreFocusTo: () => document.getElementById('btnOutil') });
		expect(actif(), 'prémisse : la modale a pris le focus').toMatch(/^a/);
		fermer();
		expect(actif()).toBe('btnFiche');
	});
});
