import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rendreLaMainApresEcoute, bindConsigneTts } from '../src/ui/consigne-tts';
import { initTts } from '../src/ui/tts';

/* ============================================================
   « Rendre la main au champ après une écoute » (#702) — gate unitaire.

   POURQUOI CE GATE EXISTE.
   `rendreLaMainApresEcoute` est posée sur TOUS les boutons « Écouter » du dépôt
   (`fabriquerBouton` de la greffe consigne, `bindItemTts` pour les boutons compacts),
   donc sur une douzaine de runners qui ne la connaissent pas et ne s'en protègent pas.
   C'est exactement le profil d'une primitive qu'on élargit un jour « pour faire aussi
   marcher X », sans voir ce qu'on casse ailleurs : aucun écran ne la testait, et ses deux
   gardes (activation clavier, cible qui n'est pas un champ) sont invisibles à la lecture
   d'un runner. Ce fichier les tient.

   CE QU'ON ASSÈRE. Le comportement observable après le clic : QUI a le focus. Pas le
   mécanisme interne (`pointerdown` mémorise, `click` restaure), qui pourrait être
   réécrit ; la primitive n'exporte d'ailleurs pas son prédicat, on l'éprouve donc par ce
   qu'il fait. Les cas viennent des critères de l'issue et des deux relectures : nominal,
   exemption clavier, aucune cible inventée, champ inerte, cible détachée, types acceptés.

   PIÈGE DU DOM DE TEST, et comment il est neutralisé. Deux fois :
   1. `.focus()` ne fait rien sur un élément hors document (c'est ce que prouve le témoin
      ci-dessous) ; tout élément de ce fichier est donc attaché à `document.body`.
   2. happy-dom ne donne PAS le focus au bouton quand on lui envoie un `pointerdown`, là
      où un navigateur le fait. Sans le `btn.focus()` explicite de `clicPointeur`, le
      champ garderait le focus tout du long et le cas nominal serait vert sans que rien
      n'ait été restauré : c'est la ligne qui rend TOUS les cas discriminants, y compris
      les négatifs (où l'on exige que le focus RESTE sur le bouton).
   ============================================================ */

/** Le geste réel d'un clic souris/tactile, dans l'ordre du navigateur.
    `PointerEvent` existe dans happy-dom (vérifié : le `pointerdown` ainsi émis déclenche
    bien l'écouteur de la primitive), pas besoin de dégrader vers un `MouseEvent`.
    `detail: 1` sur le clic = ce que produit un vrai clic (nombre de clics). */
function clicPointeur(btn: HTMLElement): void {
	btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	btn.focus(); // cf. piège 2 de l'en-tête
	btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

/** Activation au CLAVIER : `detail` nul, et le focus est déjà sur le bouton. */
function clicClavier(btn: HTMLElement): void {
	btn.focus();
	btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
}

function bouton(): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	document.body.append(btn);
	rendreLaMainApresEcoute(btn);
	return btn;
}

function champTexte(type = 'text'): HTMLInputElement {
	const el = document.createElement('input');
	el.type = type;
	document.body.append(el);
	return el;
}

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('Retour de main au champ après une écoute (#702)', () => {
	/* ---------- Témoin : sans lui, tout le fichier pourrait être vert à vide ---------- */
	it('témoin : dans ce DOM, le focus ne prend QUE sur un élément attaché au document', () => {
		const attache = champTexte();
		attache.focus();
		expect(document.activeElement).toBe(attache);

		const detache = document.createElement('input');
		detache.type = 'text';
		detache.focus();
		// Le focus n'a pas bougé : un élément hors document ne le prend pas. C'est ce qui
		// rendrait vains des cas écrits sur des éléments non attachés (tous à `body`).
		expect(document.activeElement).toBe(attache);
	});

	/* ---------- 1. Restauration nominale ---------- */
	it("un clic souris rend la main au champ qui avait le focus juste avant l'appui", () => {
		const champ = champTexte();
		const btn = bouton();
		champ.focus();

		clicPointeur(btn);

		expect(document.activeElement).toBe(champ);
	});

	it("la main revient au BON champ quand l'écran en compte plusieurs", () => {
		const premier = champTexte();
		const second = champTexte();
		const btn = bouton();
		second.focus();

		clicPointeur(btn);

		expect(document.activeElement).toBe(second);
		expect(document.activeElement).not.toBe(premier);
	});

	it('deux écoutes de suite rendent la main à chaque fois', () => {
		const champ = champTexte();
		const btn = bouton();
		champ.focus();

		clicPointeur(btn);
		expect(document.activeElement).toBe(champ);
		// 2e écoute : le champ a bien été refocalisé, il est donc de nouveau la cible.
		clicPointeur(btn);
		expect(document.activeElement).toBe(champ);
	});

	/* ---------- 2. Exemption clavier (WCAG 3.2) ---------- */
	it('une activation au clavier ne déplace pas le focus, même si une cible était mémorisée', () => {
		const champ = champTexte();
		const btn = bouton();
		champ.focus();
		// Une écoute à la souris a bien eu lieu avant : la cible EST mémorisée.
		clicPointeur(btn);
		expect(document.activeElement).toBe(champ);

		// Plus tard, l'enfant revient au bouton au clavier et appuie sur Entrée.
		clicClavier(btn);

		expect(document.activeElement).toBe(btn);
	});

	/* ---------- 3. Aucune cible inventée ---------- */
	it("rien n'avait le focus avant l'appui : le focus reste sur le bouton", () => {
		champTexte(); // un champ existe sur l'écran, mais personne ne l'a touché
		const btn = bouton();
		expect(document.activeElement).toBe(document.body);

		clicPointeur(btn);

		expect(document.activeElement).toBe(btn);
	});

	it("un BOUTON avait le focus avant l'appui : rien ne lui est rendu", () => {
		// Critère négatif de l'issue, tenu sans condition écrite nulle part : sur les tuiles
		// comme sur le mot caché tant qu'il est affiché, c'est un `<button>` qui a le focus.
		// Élargir le prédicat aux éléments focalisables ferait rougir ce cas.
		const autre = document.createElement('button');
		autre.type = 'button';
		document.body.append(autre);
		const btn = bouton();
		autre.focus();
		expect(document.activeElement).toBe(autre);

		clicPointeur(btn);

		expect(document.activeElement).toBe(btn);
	});

	it("un élément non éditable rendu focalisable n'est pas davantage une cible", () => {
		const div = document.createElement('div');
		div.tabIndex = 0; // focalisable à la main : ce n'est toujours pas un champ de saisie
		document.body.append(div);
		const btn = bouton();
		div.focus();
		expect(document.activeElement).toBe(div);

		clicPointeur(btn);

		expect(document.activeElement).toBe(btn);
	});

	/* ---------- 4. Champ inerte ----------
	   Deux précautions, toutes deux découvertes en éprouvant le gate lui-même :
	   - le champ est focalisé AVANT d'être neutralisé. happy-dom (comme un navigateur)
	     refuse `focus()` sur un champ déjà `disabled` : préparé dans l'autre ordre, le
	     champ n'était jamais l'`activeElement`, le prédicat ne le voyait pas, et le cas
	     passait au vert sans rien éprouver du tout. D'où aussi le témoin local, qui
	     vérifie que le prédicat reçoit bien le champ inerte.
	   - c'est l'ESPION qui juge, pas `activeElement` : un `focus()` sur un champ inerte
	     est refusé par le DOM, donc le focus resterait sur le bouton même sans la garde.
	     Ce que la garde doit empêcher, c'est la TENTATIVE. */
	it.each([
		[
			'input désactivé',
			(): HTMLElement => {
				const el = champTexte();
				el.focus();
				el.disabled = true; // neutralisé alors que l'enfant y était (correction affichée)
				return el;
			},
		],
		[
			'input en lecture seule',
			(): HTMLElement => {
				const el = champTexte();
				el.readOnly = true;
				el.focus();
				return el;
			},
		],
		[
			'textarea désactivé',
			(): HTMLElement => {
				const ta = document.createElement('textarea');
				document.body.append(ta);
				ta.focus();
				ta.disabled = true;
				return ta;
			},
		],
		[
			'textarea en lecture seule',
			(): HTMLElement => {
				const ta = document.createElement('textarea');
				ta.readOnly = true;
				document.body.append(ta);
				ta.focus();
				return ta;
			},
		],
	])('%s : on ne cherche même pas à lui rendre la main', (_nom, preparer) => {
		const inerte = preparer();
		expect(document.activeElement, 'témoin : le prédicat doit voir ce champ').toBe(inerte);
		const btn = bouton();
		const espion = vi.spyOn(inerte, 'focus');

		clicPointeur(btn);

		expect(espion).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(btn);
		espion.mockRestore();
	});

	/* ---------- 5. Cible détachée (re-rendu entre l'appui et le clic) ---------- */
	it("le champ mémorisé a quitté le DOM entre l'appui et le clic : aucun focus, aucune erreur", () => {
		const champ = champTexte();
		const btn = bouton();
		champ.focus();

		btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		champ.remove(); // re-rendu de l'écran pendant l'appui
		btn.focus();

		// L'espion est la seule assertion DISCRIMINANTE ici : dans happy-dom comme dans un
		// navigateur, `focus()` sur un nœud détaché est un non-événement (il ne déplace ni
		// ne vole le focus). Sans lui, retirer la garde « encore dans le document »
		// laisserait ce cas au vert.
		const espion = vi.spyOn(champ, 'focus');
		expect(() =>
			btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })),
		).not.toThrow();

		expect(espion).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(btn);
		espion.mockRestore();
	});

	/* ---------- 6. Types de champs ---------- */
	/* `password` compris, et ce n'est pas une coquille : les champs de réponse du dépôt
	   NAISSENT en `type="password"` pour couper la barre de suggestions des claviers
	   mobiles (cf. src/ui/anti-suggestion.ts) et ne sont démasqués qu'ensuite. Un
	   `password` écarté du prédicat, et l'enfant perdrait la main sur la 1re écoute. */
	it.each(['text', 'password', 'number', 'search', 'tel'])(
		'input[type=%s] : la main lui revient',
		(type) => {
			const champ = champTexte(type);
			expect(champ.type).toBe(type); // le DOM de test n'a pas replié le type sur `text`
			const btn = bouton();
			champ.focus();

			clicPointeur(btn);

			expect(document.activeElement).toBe(champ);
		},
	);

	it('textarea : la main lui revient aussi', () => {
		const ta = document.createElement('textarea');
		document.body.append(ta);
		const btn = bouton();
		ta.focus();

		clicPointeur(btn);

		expect(document.activeElement).toBe(ta);
	});

	/* Les commandes qui ne sont pas des endroits où l'on écrit une réponse. On ne fige
	   volontairement PAS le sort de `email`, `url` ou `date` : aucun écran n'en pose, et
	   les exclure ici rougirait le jour où l'un d'eux servirait légitimement de champ de
	   saisie, sans que rien ne soit cassé pour autant. */
	it.each(['checkbox', 'radio', 'button', 'submit', 'file', 'range'])(
		"input[type=%s] n'est pas un champ de saisie : rien ne lui est rendu",
		(type) => {
			const commande = champTexte(type);
			expect(commande.type).toBe(type);
			const btn = bouton();
			commande.focus();
			// Témoin : la commande a bien le focus, donc le prédicat la VOIT et le refus
			// vient de lui, pas d'un `focus()` resté sans effet.
			expect(document.activeElement).toBe(commande);

			clicPointeur(btn);

			expect(document.activeElement).toBe(btn);
		},
	);
});

/* ============================================================
   Un seul cas d'intégration : la primitive est-elle bien POSÉE sur les boutons que
   fabrique la greffe ? Tout ce qui précède est unitaire (la primitive est exportée), mais
   si `fabriquerBouton` cessait de l'appeler, aucun de ces cas ne bougerait et le défaut
   reviendrait d'un coup sur la douzaine de runners.
   ============================================================ */
class UtteranceStub extends EventTarget {
	text: string;
	voice: unknown = null;
	lang = '';
	rate = 1;
	constructor(t: string) {
		super();
		this.text = t;
	}
}

/** `bindConsigneTts` ne pose AUCUN bouton si l'appareil n'a pas de voix française : sans
    ce stub, le cas ci-dessous dépendrait des voix SAPI de la machine hôte. */
function installerVoix(): void {
	(globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
		getVoices: () => [{ lang: 'fr-FR', localService: true, name: 'Amélie (locale)' }],
		addEventListener: () => {},
		cancel: () => {},
		speak: () => {},
	};
	(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
		UtteranceStub;
	initTts();
}

describe('Le bouton « Écouter » réellement fabriqué par la greffe', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		installerVoix();
	});

	it("rend la main au champ, sans que l'appelant ait rien à câbler", () => {
		const consigne = document.createElement('p');
		consigne.dataset.tts = 'Complète la phrase.';
		document.body.append(consigne);
		const champ = champTexte();
		// `auto: false` : on éprouve le retour de main, pas la lecture automatique (qui
		// dépend en plus d'une préférence de profil).
		bindConsigneTts(document.body, { auto: false });

		const btn = document.querySelector<HTMLButtonElement>('button.consigne-tts');
		expect(btn, 'la greffe doit avoir posé son bouton « Écouter »').not.toBeNull();
		champ.focus();

		clicPointeur(btn as HTMLButtonElement);

		expect(document.activeElement).toBe(champ);
	});
});
