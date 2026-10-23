/* ============================================================
   `juste()` des contrôleurs de widget (#734, PR 4) — critères 11 et 27.

   La séance partagée note une réponse SANS verdict visible : elle demande au widget
   `juste()`, qui doit dire la même chose que `verify()` (critère 11 : même correction
   qu'en jeu libre) sans rien figer, marquer ni annoncer. Le jeu libre, lui, continue de
   passer par `verify()`, qui ne doit pas avoir bougé (critère 27).

   Ce que ce fichier éprouve, widget par widget (tuile simple, rangement, tri, appariement,
   clic sur le mot, segment à deux bornes) :
     1. la valeur rendue, sur des réponses justes, fausses et fausses « piège » (rangée
        presque juste, un seul mot mal rangé, paire inversée, mot de trop, mot de moins…) ;
     2. `juste()` = `verify()` sur chacune ;
     3. `juste()` est sans effet : DOM identique au caractère près, aucune notification
        `onState`, aucune marque de verdict ; deux appels rendent la même chose ;
     4. le widget reste manipulable : chaque geste qui SUIT un appel de `juste()` modifie
        encore le DOM, et les cas « corrigé en cours de route » ne sont justes que si les
        gestes postérieurs à `juste()` ont bien été pris en compte.

   Les attendus viennent de la CONSIGNE de chaque format, lue comme un enfant la lit
   (« Amène la bonne tuile dans la case », « Tape les mots dans l'ordre »…), jamais de la
   règle codée. Témoin anti-aveuglement : après chaque `juste()` sans effet, `verify()`
   doit, lui, modifier le DOM en posant ses marques — sinon l'égalité de DOM ne prouverait
   rien. Seule exception, la rangée VIDE : rien à marquer, le témoin y devient le verrou
   (cf. ce cas). Le FIGEAGE du DOM n'est pas l'affaire de `verify()` : depuis #543, c'est
   l'appelant qui fige, après lui (ui/figeage.ts).

   `ResizeObserver` de l'appariement : happy-dom n'en fournit qu'un bouchon inerte
   (observe/disconnect vides), donc l'EFFET (plus aucun recalcul au redimensionnement)
   n'est pas observable ici. On tient l'appel, par espion sur le prototype.
   ============================================================ */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindTuileInteraction, type TuileSpec } from '../src/ui/tuile-interaction';
import { bindAppariement, type AppariementSpec } from '../src/ui/appariement';
import { bindClicMot } from '../src/ui/clic-mot-interaction';
import { bindSegmentMot } from '../src/ui/segment-mot-interaction';
import { liensLisibles, pairesErreur, type LienPropose } from '../src/core/erreur-representation';
import { corrigerQuestion, type ReponseQuestion } from '../src/core/bilan-parcours';
import { questionDeRevision, type QuestionRevision } from '../src/core/revision-question';
import { getAllLessons } from '../src/core/catalog';
import { createRenderContext, renderItem } from '../src/core/items';
import { withSeed } from '../src/core/utils';

/* ------------------------------------------------------------------ */
/* Banc d'essai commun                                                 */
/* ------------------------------------------------------------------ */

interface Correcteur {
	juste(): boolean;
	verify(): boolean;
}

interface Banc {
	root: HTMLElement;
	ctrl: Correcteur;
	/** Nombre d'appels reçus par `onState` depuis le montage. */
	notifications: () => number;
}

type Geste = (b: Banc) => void;

function racine(): HTMLElement {
	const root = document.createElement('div');
	root.innerHTML = '<div data-tuile-mount></div>';
	document.body.appendChild(root);
	return root;
}

/** Clique l'élément de `selecteur` dont `data-<cle>` vaut `valeur` (sans échappement CSS :
    certaines valeurs sont des signes `<`, `>`). */
function cliquerPar(root: HTMLElement, selecteur: string, cle: string, valeur: string): void {
	const el = [...root.querySelectorAll<HTMLElement>(selecteur)].find(
		(e) => e.dataset[cle] === valeur,
	);
	if (!el) throw new Error(`${selecteur}[data-${cle}="${valeur}"] introuvable`);
	el.click();
}

function cliquer(root: HTMLElement, selecteur: string): void {
	const el = root.querySelector<HTMLElement>(selecteur);
	if (!el) throw new Error(`${selecteur} introuvable`);
	el.click();
}

/** Marques de verdict visibles : classes posées par une correction et pastilles ✓/✗. */
const CLASSES_VERDICT = ['correct', 'wrong', 'is-cible', 'is-decoy', 'bloc-attendu', 'lecon-fige'];
function verdictsVisibles(root: HTMLElement): string[] {
	const out: string[] = [];
	for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
		for (const c of CLASSES_VERDICT) if (el.classList.contains(c)) out.push(`.${c}`);
	}
	if (/[✓✗]/.test(root.textContent ?? '')) out.push('pastille ✓/✗');
	return out;
}

/** Appelle `juste()` deux fois et exige qu'il soit sans effet. Rend sa valeur. */
function sonderJuste(b: Banc): boolean {
	const dom = b.root.innerHTML;
	const n = b.notifications();
	const premier = b.ctrl.juste();
	const second = b.ctrl.juste();
	expect(second, 'deux appels de juste() rendent la même chose').toBe(premier);
	expect(b.root.innerHTML, 'juste() ne touche pas au DOM').toBe(dom);
	expect(b.notifications(), 'juste() ne notifie pas l’appelant').toBe(n);
	return premier;
}

/** Joue les gestes un à un en sondant `juste()` avant et après chacun, puis confronte
    `juste()` à l'attendu et à `verify()`. */
function eprouver(b: Banc, gestes: Geste[], attendu: boolean): void {
	sonderJuste(b);
	for (const geste of gestes) {
		const avant = b.root.innerHTML;
		geste(b);
		expect(b.root.innerHTML, 'le geste qui suit un juste() est encore pris en compte').not.toBe(
			avant,
		);
		sonderJuste(b);
	}
	expect(verdictsVisibles(b.root), 'aucune marque de verdict avant verify()').toEqual([]);
	expect(sonderJuste(b), 'juste() sur la réponse posée').toBe(attendu);

	const avantVerify = b.root.innerHTML;
	expect(b.ctrl.verify(), 'verify() rend la même chose que juste()').toBe(attendu);
	// Témoin : verify() marque, LUI (✓/✗, verdicts). Si ce DOM ne changeait pas, l'égalité
	// de DOM exigée de juste() ne prouverait rien.
	expect(b.root.innerHTML, 'témoin : verify() modifie le DOM').not.toBe(avantVerify);
	expect(b.ctrl.verify(), 'verify() idempotent').toBe(attendu);
	expect(b.ctrl.juste(), 'juste() après verify()').toBe(attendu);
}

interface Cas {
	nom: string;
	gestes: Geste[];
	attendu: boolean;
}

afterEach(() => {
	document.body.innerHTML = '';
});

/* ------------------------------------------------------------------ */
/* Tuile simple : « Amène la bonne tuile dans la case »                */
/* ------------------------------------------------------------------ */
describe('juste() — tuile simple (« Amène la bonne tuile dans la case »)', () => {
	// 4 027 < 4 072 : seul « < » est juste.
	const SPEC: Extract<TuileSpec, { kind: 'tuile' }> = {
		kind: 'tuile',
		question: '4 027 @ 4 072',
		answer: '<',
		tuiles: ['<', '=', '>'],
	};
	function monter(): Banc {
		const root = racine();
		let n = 0;
		const ctrl = bindTuileInteraction(root, SPEC, { variant: 'lecon', onState: () => n++ });
		return { root, ctrl, notifications: () => n };
	}
	const poser =
		(val: string): Geste =>
		(b) =>
			cliquerPar(b.root, '.ltui-tuile', 'val', val);
	const viderCase: Geste = (b) => cliquer(b.root, '#ltuiSlot');

	const CAS: Cas[] = [
		{ nom: 'la bonne tuile « < » ⇒ juste', gestes: [poser('<')], attendu: true },
		{ nom: 'la tuile « > » ⇒ faux', gestes: [poser('>')], attendu: false },
		{
			nom: 'piège : « < » posée puis REMPLACÉE par « = » ⇒ faux (la dernière posée fait foi)',
			gestes: [poser('<'), poser('=')],
			attendu: false,
		},
		{
			nom: 'piège : « < » posée puis RETIRÉE (case vide) ⇒ faux',
			gestes: [poser('<'), viderCase],
			attendu: false,
		},
		{
			nom: 'corrigé en cours de route : « > » puis « < » ⇒ juste',
			gestes: [poser('>'), poser('<')],
			attendu: true,
		},
		{ nom: 'rien posé ⇒ faux', gestes: [], attendu: false },
	];
	it.each(CAS)('$nom', ({ gestes, attendu }) => eprouver(monter(), gestes, attendu));
});

/* ------------------------------------------------------------------ */
/* Rangement : « Tape les mots dans l'ordre »                          */
/* ------------------------------------------------------------------ */
describe('juste() — rangement (« Tape les mots dans l’ordre »)', () => {
	const ORDRE = ['abricot', 'banane', 'cerise', 'datte'];
	const SPEC: Extract<TuileSpec, { kind: 'ordre' }> = {
		kind: 'ordre',
		question: 'Range les mots dans l’ordre alphabétique.',
		ordre: ORDRE,
		tuiles: ['cerise', 'abricot', 'datte', 'banane'],
	};
	function monter(): Banc {
		const root = racine();
		let n = 0;
		const ctrl = bindTuileInteraction(root, SPEC, { variant: 'lecon', onState: () => n++ });
		return { root, ctrl, notifications: () => n };
	}
	const poser = (...vals: string[]): Geste[] =>
		vals.map((v) => (b: Banc) => cliquerPar(b.root, '.lord-tuile', 'val', v));
	const retirerCase =
		(pos: number): Geste =>
		(b) =>
			cliquer(b.root, `.lord-cell[data-pos="${pos}"]`);

	const CAS: Cas[] = [
		{
			nom: 'abricot, banane, cerise, datte ⇒ juste',
			gestes: poser('abricot', 'banane', 'cerise', 'datte'),
			attendu: true,
		},
		{
			nom: 'ordre inverse ⇒ faux',
			gestes: poser('datte', 'cerise', 'banane', 'abricot'),
			attendu: false,
		},
		{
			nom: 'piège : rangée presque juste (les deux derniers échangés) ⇒ faux',
			gestes: poser('abricot', 'banane', 'datte', 'cerise'),
			attendu: false,
		},
		{
			nom: 'piège : une case du milieu retirée puis reposée part AU BOUT (abricot, cerise, datte, banane) ⇒ faux',
			gestes: [
				...poser('abricot', 'banane', 'cerise', 'datte'),
				retirerCase(1),
				...poser('banane'),
			],
			attendu: false,
		},
		{
			nom: 'corrigé en cours de route : cerise retirée de la 2e case, puis la suite juste ⇒ juste',
			gestes: [
				...poser('abricot', 'cerise'),
				retirerCase(1),
				...poser('banane', 'cerise', 'datte'),
			],
			attendu: true,
		},
	];
	it.each(CAS)('$nom', ({ gestes, attendu }) => eprouver(monter(), gestes, attendu));

	/* Le jeu libre ne vérifie qu'une rangée complète (« Vérifier » inactif avant), et la
	   séance partagée note « je ne sais pas » une rangée non finie (lecon-ordre.ts,
	   `validerPartage`). Mais `juste()` est un contrat public : « la réponse posée est-elle
	   juste ? ». Une rangée vide ou à moitié remplie n'est pas un rangement juste — et c'est
	   ce que répondent déjà le tri et l'appariement sur une réponse incomplète. */
	it('contrat de juste() : rangée commencée juste mais INCOMPLÈTE (abricot, banane, cerise) ⇒ pas juste', () =>
		eprouver(monter(), poser('abricot', 'banane', 'cerise'), false));

	/* Rangée VIDE : aucune tuile posée, donc rien à marquer (ni ✓ ni ✗), et `verify()` n'a
	   aucune raison d'y modifier le DOM. Le témoin habituel (« verify() modifie le DOM ») n'y
	   tenait que par le `disabled` que le binder posait lui-même sur ses tuiles, soit le
	   figeage que #543 (critère 1) retire aux binders pour le confier à l'appelant, APRÈS
	   `verify()`. Ce que `verify()` fait ici et que `juste()` ne doit pas faire, c'est
	   VERROUILLER la réponse (le widget cesse de réagir, contrat de `TuileController`) : on
	   l'observe par un même geste, joué après l'un puis après l'autre, sur deux montages. */
	it('contrat de juste() : rangée VIDE ⇒ pas juste ; juste() laisse le widget réagir, verify() le verrouille', () => {
		const [sonde] = poser('abricot');

		const libre = monter();
		expect(sonderJuste(libre), 'juste() sur une rangée vide').toBe(false);
		const avantSonde = libre.root.innerHTML;
		sonde(libre);
		expect(libre.root.innerHTML, 'après juste(), une tuile se pose encore').not.toBe(avantSonde);

		const tranchee = monter();
		expect(sonderJuste(tranchee), 'juste() sur une rangée vide').toBe(false);
		expect(verdictsVisibles(tranchee.root), 'aucune marque de verdict avant verify()').toEqual([]);
		expect(tranchee.ctrl.verify(), 'verify() rend la même chose que juste()').toBe(false);
		const verrouille = tranchee.root.innerHTML;
		sonde(tranchee);
		expect(
			tranchee.root.innerHTML,
			'témoin : après verify(), le même geste ne pose plus rien',
		).toBe(verrouille);
		expect(tranchee.ctrl.verify(), 'verify() idempotent').toBe(false);
		expect(tranchee.ctrl.juste(), 'juste() après verify() : la rangée reste vide').toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/* Tri : « Tape un mot, puis tape son thème »                          */
/* ------------------------------------------------------------------ */
describe('juste() — tri en deux thèmes (« Tape un mot, puis tape son thème »)', () => {
	const SPEC: Extract<TuileSpec, { kind: 'tri' }> = {
		kind: 'tri',
		question: 'Range chaque mot dans son thème.',
		categories: ['Animaux', 'Fruits'],
		mots: [
			{ mot: 'chat', cat: 0 },
			{ mot: 'pomme', cat: 1 },
			{ mot: 'chien', cat: 0 },
			{ mot: 'poire', cat: 1 },
		],
	};
	function monter(): Banc {
		const root = racine();
		let n = 0;
		const ctrl = bindTuileInteraction(root, SPEC, { variant: 'lecon', onState: () => n++ });
		return { root, ctrl, notifications: () => n };
	}
	/** Taper le mot (sélection), puis le titre de la colonne : deux gestes. */
	const ranger = (mot: string, col: 0 | 1): Geste[] => [
		(b) => cliquerPar(b.root, '.ltri-tuile', 'mot', mot),
		(b) => cliquer(b.root, `.ltri-col[data-col="${col}"] .ltri-col-titre`),
	];
	const retirer =
		(mot: string): Geste =>
		(b) =>
			cliquerPar(b.root, '.ltri-posee', 'mot', mot);

	const CAS: Cas[] = [
		{
			nom: 'chaque mot dans son thème ⇒ juste',
			gestes: [
				...ranger('chat', 0),
				...ranger('pomme', 1),
				...ranger('chien', 0),
				...ranger('poire', 1),
			],
			attendu: true,
		},
		{
			nom: 'tous les mots dans l’autre thème ⇒ faux',
			gestes: [
				...ranger('chat', 1),
				...ranger('pomme', 0),
				...ranger('chien', 1),
				...ranger('poire', 0),
			],
			attendu: false,
		},
		{
			nom: 'piège : un seul mot mal rangé (chat chez les fruits) ⇒ faux',
			gestes: [
				...ranger('chat', 1),
				...ranger('pomme', 1),
				...ranger('chien', 0),
				...ranger('poire', 1),
			],
			attendu: false,
		},
		{
			nom: 'piège : trois mots bien rangés, le quatrième resté au bac ⇒ faux',
			gestes: [...ranger('chat', 0), ...ranger('pomme', 1), ...ranger('chien', 0)],
			attendu: false,
		},
		{
			nom: 'corrigé en cours de route : chat chez les fruits, retiré, puis rangé chez les animaux ⇒ juste',
			gestes: [
				...ranger('chat', 1),
				retirer('chat'),
				...ranger('chat', 0),
				...ranger('pomme', 1),
				...ranger('chien', 0),
				...ranger('poire', 1),
			],
			attendu: true,
		},
	];
	it.each(CAS)('$nom', ({ gestes, attendu }) => eprouver(monter(), gestes, attendu));
});

/* ------------------------------------------------------------------ */
/* Appariement : « Touche un mot, puis le mot qui va avec »            */
/* ------------------------------------------------------------------ */
const SPEC_APP: AppariementSpec = {
	question: 'Relie chaque mot à un mot de sa famille.',
	paires: [
		{ gauche: 'dent', droite: 'dentiste' },
		{ gauche: 'fleur', droite: 'fleuriste' },
		{ gauche: 'lait', droite: 'laitier' },
	],
	// Intrus volontairement proche de « dent » : c'est le mot de trop qui piège.
	intrus: ['dentelle'],
};
function monterAppariement(): Banc & { liberer(): void } {
	const root = racine();
	let n = 0;
	const ctrl = bindAppariement(root, SPEC_APP, { variant: 'lecon', onState: () => n++ });
	return { root, ctrl, notifications: () => n, liberer: () => ctrl.liberer() };
}

describe('juste() — appariement (« Touche un mot, puis le mot qui va avec »)', () => {
	const motG =
		(g: string): Geste =>
		(b) =>
			cliquer(b.root, `.lapp-mot[data-side="g"][data-id="${g}"]`);
	const motD =
		(d: string): Geste =>
		(b) =>
			cliquer(b.root, `.lapp-mot[data-side="d"][data-id="${d}"]`);
	/** Armer le mot de gauche, puis toucher celui de droite : deux gestes. */
	const relier = (g: string, d: string): Geste[] => [motG(g), motD(d)];

	const CAS: Cas[] = [
		{
			nom: 'chaque mot relié à sa famille ⇒ juste',
			gestes: [
				...relier('dent', 'dentiste'),
				...relier('fleur', 'fleuriste'),
				...relier('lait', 'laitier'),
			],
			attendu: true,
		},
		{
			nom: 'aucune paire juste ⇒ faux',
			gestes: [
				...relier('dent', 'fleuriste'),
				...relier('fleur', 'laitier'),
				...relier('lait', 'dentiste'),
			],
			attendu: false,
		},
		{
			nom: 'piège : une paire inversée (dent ↔ fleur), la troisième juste ⇒ faux',
			gestes: [
				...relier('dent', 'fleuriste'),
				...relier('fleur', 'dentiste'),
				...relier('lait', 'laitier'),
			],
			attendu: false,
		},
		{
			nom: 'piège : le mot de trop (dent → dentelle), les deux autres justes ⇒ faux',
			gestes: [
				...relier('dent', 'dentelle'),
				...relier('fleur', 'fleuriste'),
				...relier('lait', 'laitier'),
			],
			attendu: false,
		},
		{
			nom: 'piège : deux paires justes, « lait » laissé sans lien ⇒ faux',
			gestes: [...relier('dent', 'dentiste'), ...relier('fleur', 'fleuriste')],
			attendu: false,
		},
		{
			nom: 'corrigé en cours de route : dent → dentelle, lien retiré, puis dent → dentiste ⇒ juste',
			gestes: [
				...relier('dent', 'dentelle'),
				motG('dent'), // retaper un mot relié efface son lien
				...relier('dent', 'dentiste'),
				...relier('fleur', 'fleuriste'),
				...relier('lait', 'laitier'),
			],
			attendu: true,
		},
	];
	it.each(CAS)('$nom', ({ gestes, attendu }) => eprouver(monterAppariement(), gestes, attendu));
});

describe('AppariementController.liberer() — l’observateur ne survit pas à la séance', () => {
	/* happy-dom : ResizeObserver est un bouchon inerte, l'EFFET d'une déconnexion n'est pas
	   observable. On tient l'appel : l'observateur qui surveille le plateau est déconnecté
	   par liberer(), et seulement par lui — verify() ne le fait pas, le résultat figé du
	   jeu libre devant rester aligné sur les mots au zoom (critère 27). */
	it('liberer() déconnecte l’observateur du plateau ; ni juste() ni verify() ne le font', () => {
		const observe = vi.spyOn(ResizeObserver.prototype, 'observe');
		const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect');
		try {
			const b = monterAppariement();
			const plateau = b.root.querySelector('#lappBoard');
			const i = observe.mock.calls.findIndex(([cible]) => cible === plateau);
			expect(i, 'un observateur surveille le plateau').toBeGreaterThanOrEqual(0);
			const observateur = observe.mock.contexts[i];
			const deconnecte = () => disconnect.mock.contexts.includes(observateur);

			b.ctrl.juste();
			expect(deconnecte(), 'juste() ne déconnecte pas').toBe(false);
			b.ctrl.verify();
			expect(deconnecte(), 'verify() ne déconnecte pas (jeu libre inchangé)').toBe(false);
			b.liberer();
			expect(deconnecte(), 'liberer() déconnecte').toBe(true);
		} finally {
			observe.mockRestore();
			disconnect.mockRestore();
		}
	});
});

/* ------------------------------------------------------------------ */
/* Clic sur le mot : sélection libre, égalité d'ensembles exacte       */
/* ------------------------------------------------------------------ */
describe('juste() — clic sur le mot (verbe au passé composé : deux mots)', () => {
	// « ont mangé » : le verbe conjugué fait DEUX mots, ni plus ni moins.
	const TOKENS = ['Les', 'enfants', 'ont', 'mangé', 'une', 'pomme', '.'];
	const CIBLE = [2, 3];
	function monter(): Banc {
		const root = racine();
		let n = 0;
		const ctrl = bindClicMot(
			root,
			{ tokens: TOKENS, cibleIndices: CIBLE, cibleLabel: 'le verbe conjugué' },
			{ onState: () => n++ },
		);
		return { root, ctrl, notifications: () => n };
	}
	const clic = (...indices: number[]): Geste[] =>
		indices.map((i) => (b: Banc) => cliquer(b.root, `.lclic-mot[data-i="${i}"]`));

	const CAS: Cas[] = [
		{ nom: '« ont » et « mangé » ⇒ juste', gestes: clic(2, 3), attendu: true },
		{
			nom: '« mangé » puis « ont » (ordre de clic indifférent) ⇒ juste',
			gestes: clic(3, 2),
			attendu: true,
		},
		{ nom: '« pomme » ⇒ faux', gestes: clic(5), attendu: false },
		{ nom: 'piège : un mot de moins (« mangé » seul) ⇒ faux', gestes: clic(3), attendu: false },
		{
			nom: 'piège : un mot de trop (« ont mangé une ») ⇒ faux',
			gestes: clic(2, 3, 4),
			attendu: false,
		},
		{
			nom: 'corrigé en cours de route : « pomme » cochée puis décochée ⇒ juste',
			gestes: clic(2, 3, 5, 5),
			attendu: true,
		},
		{ nom: 'piège : « mangé » décoché après coup ⇒ faux', gestes: clic(2, 3, 3), attendu: false },
		{ nom: 'rien de coché ⇒ faux', gestes: [], attendu: false },
	];
	it.each(CAS)('$nom', ({ gestes, attendu }) => eprouver(monter(), gestes, attendu));
});

/* ------------------------------------------------------------------ */
/* Segment : délimiter le groupe nominal par ses deux bornes           */
/* ------------------------------------------------------------------ */
describe('juste() — segment à deux bornes (« le petit chat noir »)', () => {
	// « Ce matin, le petit chat noir dort. » — le GN sujet est « le petit chat noir ».
	const TOKENS = ['Ce', 'matin', ',', 'le', 'petit', 'chat', 'noir', 'dort', '.'];
	const CIBLE = [3, 4, 5, 6];
	function monter(): Banc {
		const root = racine();
		let n = 0;
		const ctrl = bindSegmentMot(
			root,
			{ tokens: TOKENS, cibleIndices: CIBLE, cibleLabel: 'le groupe nominal' },
			{ onState: () => n++ },
		);
		return { root, ctrl, notifications: () => n };
	}
	const borne = (...indices: number[]): Geste[] =>
		indices.map((i) => (b: Banc) => cliquer(b.root, `.lseg-mot[data-i="${i}"]`));
	const recommencer: Geste = (b) => cliquer(b.root, '#lsegReset');

	const CAS: Cas[] = [
		{ nom: '« le » … « noir » ⇒ juste', gestes: borne(3, 6), attendu: true },
		{
			nom: 'bornes posées à l’envers (« noir » puis « le ») ⇒ juste',
			gestes: borne(6, 3),
			attendu: true,
		},
		{ nom: '« Ce matin » ⇒ faux', gestes: borne(0, 1), attendu: false },
		{
			nom: 'piège : un mot de trop (« le » … « dort ») ⇒ faux',
			gestes: borne(3, 7),
			attendu: false,
		},
		{
			nom: 'piège : déterminant oublié (« petit » … « noir ») ⇒ faux',
			gestes: borne(4, 6),
			attendu: false,
		},
		{
			nom: 'piège : bloc juste fermé, puis une nouvelle frappe (une borne seule) ⇒ faux',
			gestes: borne(3, 6, 5),
			attendu: false,
		},
		{
			nom: 'piège : bloc juste effacé par « Recommencer » ⇒ faux',
			gestes: [...borne(3, 6), recommencer],
			attendu: false,
		},
		{
			nom: 'piège : borne posée puis annulée (retapée) ⇒ faux',
			gestes: borne(3, 3),
			attendu: false,
		},
		{
			nom: 'corrigé en cours de route : « petit » … « noir », puis « le » … « noir » ⇒ juste',
			gestes: borne(4, 6, 3, 6),
			attendu: true,
		},
		{ nom: 'rien de désigné ⇒ faux', gestes: [], attendu: false },
	];
	it.each(CAS)('$nom', ({ gestes, attendu }) => eprouver(monter(), gestes, attendu));
});

/* ------------------------------------------------------------------ */
/* liensLisibles / pairesErreur                                        */
/* ------------------------------------------------------------------ */
const lien = (gauche: string, droite: string | null): LienPropose => ({ gauche, droite });
const PAIRES = SPEC_APP.paires;

describe('liensLisibles — la réponse ENTIÈRE d’un appariement (séance partagée, #734)', () => {
	it('tous les liens, justes compris, dans l’ordre reçu ; « (non relié) » pour un mot sans lien', () => {
		expect(
			liensLisibles([lien('dent', 'dentiste'), lien('fleur', null), lien('lait', 'dentelle')]),
		).toBe('dent → dentiste ; fleur → (non relié) ; lait → dentelle');
	});

	it('un seul lien : pas de séparateur ; aucun lien : chaîne vide', () => {
		expect(liensLisibles([lien('lait', 'laitier')])).toBe('lait → laitier');
		expect(liensLisibles([])).toBe('');
	});

	it('à la différence de pairesErreur, garde les liens JUSTES : la réponse entière, pas l’erreur', () => {
		const liens = [lien('dent', 'dentiste'), lien('fleur', 'laitier'), lien('lait', 'fleuriste')];
		expect(liensLisibles(liens)).toBe('dent → dentiste ; fleur → laitier ; lait → fleuriste');
		expect(pairesErreur(liens, PAIRES).donnee).toBe('fleur → laitier ; lait → fleuriste');
	});
});

describe('pairesErreur — réponse donnée inchangée depuis l’extraction de liensLisibles', () => {
	it('lien faux et mot sans lien dans la même réponse : mêmes chaînes qu’avant', () => {
		const liens = [lien('dent', 'dentelle'), lien('fleur', null), lien('lait', 'laitier')];
		expect(pairesErreur(liens, PAIRES)).toEqual({
			donnee: 'dent → dentelle ; fleur → (non relié)',
			attendue: 'dent → dentiste ; fleur → fleuriste',
		});
	});
});

/* ==================================================================
   PARITÉ widget ↔ correction différée (#777). Un parcours de bilan collecte la réponse
   que le widget expose (`reponse()`, `selected()`) et la corrige plus tard par
   `corrigerQuestion` ; le jeu libre et la séance partagée, eux, demandent `juste()` au
   widget. Deux règles pour une même réponse : elles doivent dire la même chose, sinon un
   enfant serait jugé autrement selon l'écran. Ce bloc tient l'égalité AVANT et APRÈS
   l'extraction des prédicats dans `core/` (une seule règle partagée).

   Les widgets sont montés exactement comme le parcours les monte (`ui/bilan-parcours.ts`,
   `monterTuiles`, `monterQuestion`) : même spec, même variante, même lecture de la réponse.
   Trois volets, sur les questions du CATALOGUE (révision, plusieurs graines) :
     1. la bonne réponse, jouée au widget geste par geste, est juste pour les deux règles ;
     2. des gestes au HASARD (générateur maison, reproductible) : égalité après chaque geste ;
     3. les cas tordus, un par un.
   Plus la grille d'opération posée : pas de contrôleur, mais chaque case porte sa réponse
   (`data-answer`), et la révision juge « toutes les cases justes » ; la correction différée
   doit lire les cases dans le MÊME ordre que l'écran les rend.
   ================================================================== */

type QWidget = Extract<
	QuestionRevision,
	{ kind: 'tuile' | 'ordre' | 'tri' | 'appariement' | 'clicMot' }
>;
const FORMATS_WIDGET: QWidget['kind'][] = ['tuile', 'ordre', 'tri', 'appariement', 'clicMot'];
const estWidget = (q: QuestionRevision): q is QWidget =>
	(FORMATS_WIDGET as string[]).includes(q.kind);

interface Monte {
	root: HTMLElement;
	juste(): boolean;
	/** La réponse telle que le parcours la lit (`reponseWidget`, `selected()`). */
	reponse(): ReponseQuestion;
	/** Tout ce qu'un enfant peut toucher dans le widget. */
	cliquables(): HTMLElement[];
}

const tous = (root: HTMLElement, sel: string): HTMLElement[] => [
	...root.querySelectorAll<HTMLElement>(sel),
];

function monterWidget(q: QWidget): Monte {
	const root = racine();
	const opts = { variant: 'revision' as const, onState: () => undefined };
	const tuiles = (c: { juste(): boolean; reponse?(): ReponseQuestion }, sel: string): Monte => ({
		root,
		juste: () => c.juste(),
		// Repli du parcours quand le widget n'expose rien : tuile vide, ou question passée.
		reponse: () =>
			c.reponse?.() ?? (q.kind === 'tuile' ? { kind: 'tuile', posee: null } : { kind: 'passe' }),
		cliquables: () => tous(root, sel),
	});
	switch (q.kind) {
		case 'tuile':
			return tuiles(
				bindTuileInteraction(
					root,
					{
						kind: 'tuile',
						question: q.question,
						answer: q.answer,
						tuiles: q.tuiles,
						parle: q.parle,
					},
					opts,
				),
				'.ltui-tuile, #ltuiSlot',
			);
		case 'ordre':
			return tuiles(
				bindTuileInteraction(
					root,
					{
						kind: 'ordre',
						question: q.question,
						ordre: q.ordre,
						tuiles: q.tuiles,
						nature: q.nature,
					},
					opts,
				),
				'.lord-tuile, .lord-cell',
			);
		case 'tri':
			return tuiles(
				bindTuileInteraction(
					root,
					{ kind: 'tri', question: q.question, categories: q.categories, mots: q.mots },
					opts,
				),
				'.ltri-tuile, .ltri-col-titre, .ltri-posee',
			);
		case 'appariement':
			return tuiles(
				bindAppariement(root, { question: q.question, paires: q.paires, intrus: q.intrus }, opts),
				'.lapp-mot',
			);
		case 'clicMot': {
			const monter = q.segment ? bindSegmentMot : bindClicMot;
			const c = monter(
				root,
				{
					tokens: q.tokens,
					cibleIndices: q.cibleIndices,
					parle: q.parle,
					cibleLabel: q.cibleLabel,
				},
				{ onState: () => undefined },
			);
			return {
				root,
				juste: () => c.juste(),
				reponse: () => ({ kind: 'clicMot', indices: c.selected() }),
				cliquables: () => tous(root, '.lclic-mot, .lseg-mot, #lsegReset'),
			};
		}
	}
}

/** Premier élément de `sel` dont `data-<cle>` vaut `valeur`, cliqué ; faux s'il n'existe pas. */
function toucher(root: HTMLElement, sel: string, cle: string, valeur: string): boolean {
	const el = tous(root, sel).find((e) => e.dataset[cle] === valeur);
	el?.click();
	return el !== undefined;
}

/** Joue la BONNE réponse au widget, comme un enfant : rend le geste introuvable, ou null. */
function jouerBonneReponse(q: QWidget, m: Monte): string | null {
	const r = m.root;
	switch (q.kind) {
		case 'tuile':
			return toucher(r, '.ltui-tuile', 'val', q.answer) ? null : `tuile « ${q.answer} »`;
		case 'ordre':
			for (const v of q.ordre) if (!toucher(r, '.lord-tuile', 'val', v)) return `tuile « ${v} »`;
			return null;
		case 'tri':
			for (const m2 of q.mots) {
				if (!toucher(r, '.ltri-tuile', 'mot', m2.mot)) return `mot « ${m2.mot} »`;
				const titre = r.querySelector<HTMLElement>(
					`.ltri-col[data-col="${m2.cat}"] .ltri-col-titre`,
				);
				if (!titre) return `thème ${m2.cat}`;
				titre.click();
			}
			return null;
		case 'appariement':
			for (const p of q.paires) {
				if (!toucher(r, '.lapp-mot[data-side="g"]', 'id', p.gauche)) return `mot « ${p.gauche} »`;
				if (!toucher(r, '.lapp-mot[data-side="d"]', 'id', p.droite)) return `mot « ${p.droite} »`;
			}
			return null;
		case 'clicMot': {
			const cible = [...q.cibleIndices].sort((a, b) => a - b);
			const aToucher = q.segment ? [cible[0], cible[cible.length - 1]] : cible;
			for (const i of aToucher)
				if (!toucher(r, '.lclic-mot, .lseg-mot', 'i', String(i))) return `mot n° ${i}`;
			return null;
		}
	}
}

/** Générateur reproductible (congruentiel), indépendant du hasard de l'appli. */
function hasard(graine: number): (n: number) => number {
	let s = graine >>> 0 || 1;
	return (n) => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s % n;
	};
}

/* Inventaire : une question de révision par leçon, niveau et graine, pour chaque format. */
const GRAINES_PARITE = [1, 2, 3, 4, 5, 6];
interface Tiree {
	ou: string;
	graine: number;
	q: QWidget;
}
const WIDGETS: Tiree[] = [];
const POSEES: { ou: string; q: QuestionRevision & { kind: 'num' } }[] = [];
for (const l of getAllLessons())
	for (const niveau of l.levels)
		for (const graine of GRAINES_PARITE) {
			const q = withSeed(graine, () => questionDeRevision(l, niveau));
			const ou = `${l.id} @${niveau} / graine ${graine}`;
			if (q && estWidget(q)) WIDGETS.push({ ou, graine, q });
			else if (q?.kind === 'num' && q.item.posed) POSEES.push({ ou, q });
		}

/** Écart entre les deux règles sur l'état courant du widget, ou null. */
function ecart(q: QWidget, m: Monte): string | null {
	const r = m.reponse();
	const widget = m.juste();
	const differe = corrigerQuestion(q, r).reussi;
	return widget === differe
		? null
		: `juste()=${widget}, corrigerQuestion=${differe} sur ${JSON.stringify(r)}`;
}

describe('Parité widget ↔ correction différée (corrigerQuestion), sur le catalogue', () => {
	it('l’inventaire couvre les cinq formats, segment compris', () => {
		const vus = new Set(WIDGETS.map(({ q }) => q.kind));
		expect([...vus].sort()).toEqual([...FORMATS_WIDGET].sort());
		expect(WIDGETS.some(({ q }) => q.kind === 'clicMot' && q.segment)).toBe(true);
		expect(WIDGETS.some(({ q }) => q.kind === 'appariement' && (q.intrus?.length ?? 0) > 0)).toBe(
			true,
		);
		expect(WIDGETS.length).toBeGreaterThanOrEqual(60);
		// Chaque format éprouvé sur plusieurs questions, pas sur une seule.
		for (const kind of FORMATS_WIDGET)
			expect(WIDGETS.filter(({ q }) => q.kind === kind).length, kind).toBeGreaterThanOrEqual(5);
	});

	it('la bonne réponse, jouée au widget, est juste pour les DEUX règles', () => {
		const fautes: string[] = [];
		for (const { ou, graine, q } of WIDGETS) {
			const m = withSeed(graine, () => monterWidget(q));
			const introuvable = jouerBonneReponse(q, m);
			if (introuvable) fautes.push(`${ou} (${q.kind}) : geste impossible, ${introuvable}`);
			else if (!m.juste())
				fautes.push(`${ou} (${q.kind}) : bonne réponse jugée fausse par juste()`);
			else if (!corrigerQuestion(q, m.reponse()).reussi)
				fautes.push(`${ou} (${q.kind}) : bonne réponse jugée fausse par corrigerQuestion`);
			m.root.remove();
		}
		expect(fautes).toEqual([]);
	});

	it('gestes au hasard : après CHAQUE geste, juste() === corrigerQuestion(…).reussi', () => {
		const fautes: string[] = [];
		let etats = 0;
		for (const { ou, graine, q } of WIDGETS)
			for (let essai = 0; essai < 4; essai++) {
				const m = withSeed(graine, () => monterWidget(q));
				const tirer = hasard(graine * 1000 + essai * 7 + 1);
				const avant = ecart(q, m);
				if (avant) fautes.push(`${ou} (${q.kind}) au montage : ${avant}`);
				for (let pas = 0; pas < 12; pas++) {
					const possibles = m.cliquables();
					if (!possibles.length) break;
					possibles[tirer(possibles.length)].click();
					etats++;
					const e = ecart(q, m);
					if (e) {
						fautes.push(`${ou} (${q.kind}) essai ${essai}, geste ${pas + 1} : ${e}`);
						break;
					}
				}
				m.root.remove();
			}
		expect(etats).toBeGreaterThanOrEqual(2000);
		expect(fautes.slice(0, 15)).toEqual([]);
	});
});

describe('Parité widget ↔ correction différée : cas tordus', () => {
	const premiere = <K extends QWidget['kind']>(
		kind: K,
		filtre: (q: Extract<QWidget, { kind: K }>) => boolean = () => true,
	): { q: Extract<QWidget, { kind: K }>; graine: number } => {
		const t = WIDGETS.find(
			(w): w is Tiree & { q: Extract<QWidget, { kind: K }> } =>
				w.q.kind === kind && filtre(w.q as Extract<QWidget, { kind: K }>),
		);
		if (!t) throw new Error(`aucune question ${kind} dans l'inventaire`);
		return { q: t.q, graine: t.graine };
	};
	const monter = (q: QWidget, graine: number) => withSeed(graine, () => monterWidget(q));

	it('tuile vide : faux pour les deux ; une tuile « vide » (chaîne vide) ne vaut pas mieux', () => {
		const { q, graine } = premiere('tuile');
		const m = monter(q, graine);
		expect(m.juste()).toBe(false);
		expect(ecart(q, m)).toBe(null);
		expect(corrigerQuestion(q, { kind: 'tuile', posee: '' }).reussi).toBe(false);
	});

	it('ordre partiel : le début juste, une tuile de moins — faux pour les deux', () => {
		const { q, graine } = premiere('ordre', (x) => x.ordre.length >= 3);
		const m = monter(q, graine);
		for (const v of q.ordre.slice(0, -1))
			expect(toucher(m.root, '.lord-tuile', 'val', v)).toBe(true);
		expect(m.juste()).toBe(false);
		expect(ecart(q, m)).toBe(null);
	});

	it('tri : un mot laissé au bac, tous les autres bien rangés — faux pour les deux', () => {
		const { q, graine } = premiere('tri', (x) => x.mots.length >= 2);
		const m = monter(q, graine);
		for (const mot of q.mots.slice(1)) {
			expect(toucher(m.root, '.ltri-tuile', 'mot', mot.mot)).toBe(true);
			m.root
				.querySelector<HTMLElement>(`.ltri-col[data-col="${mot.cat}"] .ltri-col-titre`)!
				.click();
		}
		expect(m.juste()).toBe(false);
		expect(ecart(q, m)).toBe(null);
	});

	it('relier : un mot relié à l’INTRUS, les autres justes — faux pour les deux', () => {
		const { q, graine } = premiere('appariement', (x) => (x.intrus?.length ?? 0) > 0);
		const m = monter(q, graine);
		const [p0, ...reste] = q.paires;
		expect(toucher(m.root, '.lapp-mot[data-side="g"]', 'id', p0.gauche)).toBe(true);
		expect(toucher(m.root, '.lapp-mot[data-side="d"]', 'id', q.intrus![0])).toBe(true);
		for (const p of reste) {
			toucher(m.root, '.lapp-mot[data-side="g"]', 'id', p.gauche);
			toucher(m.root, '.lapp-mot[data-side="d"]', 'id', p.droite);
		}
		expect(m.juste()).toBe(false);
		expect(ecart(q, m)).toBe(null);
	});

	it('clic sur le mot : un indice en double ne change rien (un ENSEMBLE de mots)', () => {
		const { q, graine } = premiere('clicMot', (x) => !x.segment);
		const m = monter(q, graine);
		for (const i of q.cibleIndices) toucher(m.root, '.lclic-mot', 'i', String(i));
		expect(m.juste(), 'précondition : sélection juste').toBe(true);
		const sel = (m.reponse() as Extract<ReponseQuestion, { kind: 'clicMot' }>).indices;
		expect(corrigerQuestion(q, { kind: 'clicMot', indices: [...sel, ...sel] }).reussi).toBe(true);
		// Et une sélection fausse le reste, doublée ou non.
		const faux = [...sel.slice(1)];
		expect(corrigerQuestion(q, { kind: 'clicMot', indices: [...faux, ...faux] }).reussi).toBe(
			false,
		);
	});

	it('clic sur le mot : un indice HORS de la phrase (que le widget ne peut pas produire) ne change pas le verdict — règle actuelle, figée pour le refactor', () => {
		const { q, graine } = premiere('clicMot', (x) => !x.segment);
		const m = monter(q, graine);
		for (const i of q.cibleIndices) toucher(m.root, '.lclic-mot', 'i', String(i));
		const sel = (m.reponse() as Extract<ReponseQuestion, { kind: 'clicMot' }>).indices;
		for (const hors of [q.tokens.length, q.tokens.length + 5, -1])
			expect(
				corrigerQuestion(q, { kind: 'clicMot', indices: [...sel, hors] }).reussi,
				String(hors),
			).toBe(m.juste());
	});
});

describe('Parité grille d’opération posée ↔ correction différée', () => {
	it('l’inventaire porte des opérations posées', () => {
		expect(POSEES.length).toBeGreaterThanOrEqual(5);
	});

	it('cases remplies au hasard : « toutes les cases égales à leur data-answer » ⇔ corrigerQuestion juste', () => {
		const fautes: string[] = [];
		let grilles = 0;
		for (const { ou, q } of POSEES)
			for (let essai = 0; essai < 25; essai++) {
				const tirer = hasard(essai * 31 + ou.length);
				const hote = document.createElement('div');
				hote.innerHTML = renderItem(q.item, createRenderContext()).balisage;
				document.body.appendChild(hote);
				const cases = [...hote.querySelectorAll<HTMLInputElement>('.posee-input')];
				if (!cases.length || cases.some((c) => c.dataset.answer === undefined)) {
					fautes.push(`${ou} : cases sans data-answer`);
					hote.remove();
					break;
				}
				// Un essai sur trois tout juste ; sinon chaque case juste à 80 %, fausse ou vide.
				for (const c of cases) {
					const juste = essai % 3 === 0 || tirer(10) < 8;
					c.value = juste
						? String(c.dataset.answer)
						: tirer(5) === 0
							? ''
							: String((Number(c.dataset.answer) + 1 + tirer(8)) % 10);
				}
				grilles++;
				const grille = cases.every(
					(c) => c.value.trim() !== '' && Number(c.value) === Number(c.dataset.answer),
				);
				const differe = corrigerQuestion(q, {
					kind: 'posee',
					chiffres: cases.map((c) => c.value.trim()),
				}).reussi;
				if (grille !== differe)
					fautes.push(
						`${ou} essai ${essai} : grille ${grille}, corrigerQuestion ${differe} sur ${JSON.stringify(cases.map((c) => c.value))}`,
					);
				hote.remove();
			}
		expect(grilles).toBeGreaterThanOrEqual(100);
		expect(fautes.slice(0, 10)).toEqual([]);
	});
});
