/* ============================================================
   #702, critère 10 — le crayon d'une carte de relecture DOIT désigner SA carte.

   Écrit AVANT le correctif : le défaut est en place, ce fichier doit être ROUGE.

   Le défaut. Depuis cette branche, « Je relis mes mots » affiche aussi les cibles VERBE
   d'une liste : une carte par couple pronom × temps. Un parent qui coche « je » et « il »
   sur « manger » au présent obtient deux cibles distinctes en banque (`v:manger#present#0`
   et `#2`) portant la MÊME forme « mange », que seule leur phrase de contexte sépare
   (« je … une pomme » / « il … une pomme »). Le libellé du crayon est construit sur la
   forme seule (`ortho-revoir.ts`, `carteHTML`) : les deux boutons se retrouvent donc avec
   le même nom accessible.

   Pourquoi c'est le crayon, et pas autre chose. Sur cette page, le crayon est le SEUL
   élément focalisable d'une carte (ni le mot ni la phrase ne le sont) : `Tab` ne s'arrête
   que sur lui, et la liste de boutons d'un lecteur d'écran (touche B sous NVDA) les
   énumère hors de tout contexte visuel. Deux entrées identiques à la suite, et rien ne dit
   laquelle ouvre laquelle — l'enfant qui veut corriger « il mange » rouvre « je mange ».

   CE QU'ON ASSÈRE, et pourquoi pas la phrase exacte. L'exigence est double, et tient en
   deux mots : DISTINCTION (deux cartes, deux noms) et DÉSIGNATION (le nom dit LAQUELLE).
   « Corriger les pièges de « mange » dans la phrase « il mange une pomme » » est la
   formulation d'aujourd'hui ; la verrouiller mot pour mot ferait rougir la prochaine
   reformulation sans que rien ne soit cassé. On exige donc, de chaque nom :
   - qu'il diffère de celui des autres crayons de la page ;
   - qu'il porte la FORME de son mot (ce que l'enfant va rouvrir) ;
   - qu'il porte le PRONOM de sa propre phrase, et pas celui de l'autre carte — c'est la
     seule donnée qui sépare deux cibles homophones, et c'est ce qui distingue une vraie
     désignation d'un numéro d'ordre (« … (1) » / « … (2) » différencierait sans désigner).
   On n'exige rien de la phrase d'accueil qui les porte.

   Le piège de ce gate, et comment il est évité. Deux cartes dans des ÉTATS différents
   (l'une avec pièges, l'autre sans) ont déjà des noms distincts avec le défaut en place —
   « Entourer … » contre « Corriger … ». Les deux cibles homophones sont donc toujours
   montées dans le MÊME état, et les deux états sont joués (`ETATS` ci-dessous), ce qui
   couvre au passage les deux patrons de libellé.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { createListe, loadOrtho, saveOrtho } from '../src/core/orthographe/store';
import { expanseVerbe } from '../src/core/orthographe/verbes';
import { renderOrthoRevoir } from '../src/ui/ortho-revoir';
import type { Entourage, VerbeConfig } from '../src/core/orthographe/types';
import type { FormesConjuguees, VerbTense } from '../src/data/francais/verbs-lookup';

/* ---------- Appareil : la seule dépendance de plate-forme de la page ----------
   La relecture retrace ses entourages une fois les polices chargées
   (`document.fonts.ready`, API FontFaceSet). happy-dom n'implémente pas `document.fonts`
   : sans ce bouchon, `renderOrthoRevoir` lève avant d'avoir fini, et le gate échouerait
   pour une raison qui n'a rien à voir avec ce qu'il garde. On se contente donc de
   fournir une promesse déjà tenue — le tracé SVG lui-même (`dessinerEntourages`, qui lit
   des offsets de mise en page) n'a rien à dire sur un nom accessible. */
function installerFonts(): void {
	const doc = document as unknown as { fonts?: { ready: Promise<unknown> } };
	if (!doc.fonts) doc.fonts = { ready: Promise.resolve(null) };
}

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	document.body.innerHTML = '';
	installerFonts();
});

/* ---------- Un profil avec une liste « je mange » / « il mange » ----------
   Les cibles verbe sont matérialisées par `expanseVerbe` (pure, formes fournies en
   entrée) plutôt que par `materialiserVerbes` : on ne fait pas dépendre un gate
   d'accessibilité de la résolution LEFFF (asynchrone, chargée par shards), alors que la
   banque obtenue est la même — mêmes ids, même contexte. Patron repris de
   `tests/ortho-taches-libelles.test.ts`. */
const FORMES_MANGER: FormesConjuguees = [
	'mange',
	'manges',
	'mange',
	'mangeons',
	'mangez',
	'mangent',
];

/** Un piège quelconque, pour jouer l'état « déjà entouré ». */
const PIEGE: Entourage[] = [{ debut: 0, fin: 1, couleur: 0 }];

/** Liste du profil : deux mots classiques + un verbe à deux pronoms homophones.
    `entoures` décide de l'état des DEUX cibles verbe à la fois (cf. le piège du gate). */
function listeAvecVerbeHomophone(entoures: boolean): string {
	const st = loadOrtho();
	const cfg: VerbeConfig = {
		kind: 'verbe',
		infinitif: 'manger',
		pronoms: [0, 2], // « je » et « il » : même forme « mange »
		temps: ['present'],
		complement: 'une pomme',
	};
	const liste = createListe(st, 'Semaine 3', [{ mot: "aujourd'hui" }, { mot: 'chat' }], undefined, [
		cfg,
	]);
	// Un mot classique déjà travaillé, un autre non : les deux patrons de libellé court
	// sont ainsi présents sur la page, quel que soit l'état des cibles verbe.
	st.banque[liste.motIds[0]].entourage = [...PIEGE];
	for (const cible of expanseVerbe(
		cfg,
		new Map<VerbTense, FormesConjuguees>([['present', FORMES_MANGER]]),
		Date.now(),
	)) {
		st.banque[cible.id] = { ...cible, entourage: entoures ? [...PIEGE] : [] };
	}
	saveOrtho(st);
	return liste.id;
}

/** Monte la page de relecture d'une liste et rend son hôte. */
function monterRelecture(listeId: string): HTMLElement {
	const hote = document.createElement('div');
	document.body.appendChild(hote);
	renderOrthoRevoir(hote, listeId);
	return hote;
}

/* ---------- Lecture du nom accessible ----------
   Ordre de résolution des lecteurs d'écran : `aria-labelledby`, puis `aria-label`, puis
   le contenu textuel du bouton, puis `title`. On ne fige donc pas l'ATTRIBUT employé
   aujourd'hui — un crayon qui passerait à un `<span class="sr-only">` garderait ce gate
   au vert. Le texte du bouton est ici l'emoji « ✏️ », qui ne nomme rien : on ne le
   retient que s'il reste quelque chose une fois les pictogrammes retirés. */
function nomAccessible(el: Element): string {
	const refs = el.getAttribute('aria-labelledby');
	if (refs) {
		const textes = refs
			.split(/\s+/)
			.map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
			.filter(Boolean);
		if (textes.length) return textes.join(' ');
	}
	const direct = el.getAttribute('aria-label')?.trim();
	if (direct) return direct;
	const texte = (el.textContent ?? '')
		.replace(/[\p{Extended_Pictographic}️]/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (texte) return texte;
	return (el.getAttribute('title') ?? '').trim();
}

const crayons = (hote: HTMLElement): HTMLButtonElement[] => [
	...hote.querySelectorAll<HTMLButtonElement>('.relecture-crayon'),
];

interface CarteVue {
	/** Forme affichée sur la carte (lettres de l'atelier). */
	mot: string;
	/** Phrase de contexte affichée, vide pour un mot classique. */
	contexte: string;
	/** Nom accessible du crayon de CETTE carte. */
	nom: string;
}

/** Cartes de la page, chacune avec le nom accessible de SON crayon : c'est l'appariement
    que le gate éprouve (le crayon d'une carte doit parler de cette carte-là). */
function cartes(hote: HTMLElement): CarteVue[] {
	return [...hote.querySelectorAll<HTMLElement>('.relecture-carte')].map((carte) => ({
		mot: (carte.querySelector('.relecture-mot')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
		contexte: (carte.querySelector('.ortho-contexte')?.textContent ?? '')
			.replace(/\s+/g, ' ')
			.trim(),
		nom: nomAccessible(carte.querySelector('.relecture-crayon')!),
	}));
}

/* Les deux états d'une carte, joués à l'identique : ils produisent deux patrons de
   libellé différents (« Entourer … » / « Corriger … »), et l'exigence vaut pour les deux. */
const ETATS: { nom: string; entoures: boolean }[] = [
	{ nom: 'sans piège encore posé', entoures: false },
	{ nom: 'avec des pièges déjà posés', entoures: true },
];

describe('Relecture — le crayon d’une carte désigne SA carte (#702, critère 10)', () => {
	it.each(ETATS)(
		'garde contre un test à vide ($nom) : la page montre bien deux cartes homophones',
		({ entoures }) => {
			// Sans ce témoin, tout ce fichier passerait au vert le jour où les cibles verbe
			// disparaîtraient de la relecture : plus de doublon de forme, plus de conflit.
			const vues = cartes(monterRelecture(listeAvecVerbeHomophone(entoures)));
			expect(vues.map((c) => c.mot)).toEqual(["aujourd'hui", 'chat', 'mange', 'mange']);
			expect(vues[2].contexte).toMatch(/\bje\b/);
			expect(vues[3].contexte).toMatch(/\bil\b/);
			expect(vues.every((c) => c.nom !== '')).toBe(true);
		},
	);

	it.each(ETATS)(
		'critère 10 ($nom) : deux crayons de la page n’ont jamais le même nom accessible',
		({ entoures }) => {
			// Le symptôme exact du défaut, indépendamment de toute formulation.
			const noms = crayons(monterRelecture(listeAvecVerbeHomophone(entoures))).map(nomAccessible);
			expect(new Set(noms).size).toBe(noms.length);
		},
	);

	it.each(ETATS)(
		'critère 10 ($nom) : chaque nom porte la forme du mot ET le pronom de SA phrase',
		({ entoures }) => {
			// « Distinct » ne suffit pas : un suffixe d'ordre (« … (1) » / « … (2) ») séparerait
			// les deux boutons sans dire lequel ouvre quoi. Ce qui les DÉSIGNE, c'est la donnée
			// qui les sépare — le pronom de leur phrase de contexte.
			const vues = cartes(monterRelecture(listeAvecVerbeHomophone(entoures)));
			const [carteJe, carteIl] = [vues[2], vues[3]];

			expect(carteJe.nom).toContain('mange');
			expect(carteIl.nom).toContain('mange');
			expect(carteJe.nom, 'carte « je mange »').toMatch(/\bje\b/i);
			expect(carteJe.nom, 'carte « je mange »').not.toMatch(/\bil\b/i);
			expect(carteIl.nom, 'carte « il mange »').toMatch(/\bil\b/i);
			expect(carteIl.nom, 'carte « il mange »').not.toMatch(/\bje\b/i);
		},
	);

	it.each(ETATS)(
		'non-régression ($nom) : un mot SANS phrase garde son libellé court',
		({ entoures }) => {
			// L'autre moitié de l'exigence : le correctif ne doit pas parler d'une phrase là où
			// il n'y en a aucune. On refuse donc les artefacts d'un patron appliqué sans
			// condition — citation vide, mot « phrase » orphelin, double espace.
			const vues = cartes(monterRelecture(listeAvecVerbeHomophone(entoures)));
			for (const carte of vues.slice(0, 2)) {
				expect(carte.contexte).toBe(''); // témoin : ces cartes n'ont bien pas de phrase
				expect(carte.nom).toContain(carte.mot);
				expect(carte.nom, 'aucune phrase à citer pour un mot classique').not.toMatch(/phrase/i);
				expect(carte.nom).not.toMatch(/«\s*»/);
				expect(carte.nom).not.toMatch(/\s{2}/);
			}
		},
	);

	it.each(ETATS)('l’infobulle ($nom) dit la même chose que le nom accessible', ({ entoures }) => {
		// Le crayon n'a aucun texte visible : le `title` est ce que voit la souris, le nom
		// accessible ce qu'entend le lecteur d'écran. Deux canaux qui divergeraient, c'est
		// l'un des deux qui a été oublié en route.
		for (const btn of crayons(monterRelecture(listeAvecVerbeHomophone(entoures)))) {
			const nom = nomAccessible(btn);
			expect(nom).not.toBe('');
			const titre = (btn.getAttribute('title') ?? '').trim();
			if (titre) expect(titre).toBe(nom);
		}
	});
});
