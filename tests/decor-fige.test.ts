/* ============================================================
   #785 — Réglage « Figer le décor » : où il est mémorisé, et ce qu'il ne touche pas.

   Attendus dérivés des critères de l'issue, pas de l'implémentation :
   - critère 4 : dans l'appli, mémorisé PAR PROFIL ;
   - critères 5 et 28 : sur la vitrine et le guide, mémorisé par APPAREIL, et les deux
     mémoires ne se voient jamais, y compris sous un profil hérité à préfixe vide ;
   - critère 7 : « Réduire les animations » fige le décor quoi qu'il en soit ;
   - critère 25 : le réglage ne fige QUE le décor (gate statique des feuilles, en fin de
     fichier) ;
   - critère 26 : « Réduire les animations » et « Figer le décor » ne se modifient pas
     l'un l'autre ;
   - critère 33 : horloge figée dans tous les tests.

   La vitrine et le guide ne chargent pas les profils : leur préfixe actif est le préfixe
   vide. « Par appareil » se vérifie donc ainsi : une valeur posée sous un profil se relit
   sous un autre profil ET sous le préfixe vide.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
	decorFigeEffectif,
	decorFigeProfil,
	decorFigeSite,
	setDecorFigeProfil,
	setDecorFigeSite,
} from '../src/core/decor';
import {
	activeProfile,
	addProfile,
	initProfiles,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { setActivePrefix, setOnDataWrite } from '../src/core/storage';
import { animationsReduites, setAnimationsReduites } from '../src/ui/preferences';
import { resoudreImbrication, sansCommentairesScss } from './aide-scss';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 11, 15, 10, 0));
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('Figer le décor — valeurs par défaut', () => {
	it("par défaut, le décor n'est figé ni pour le profil ni pour la vitrine", () => {
		expect(decorFigeProfil()).toBe(false);
		expect(decorFigeSite()).toBe(false);
	});
});

describe('Figer le décor — critère 4 : par profil dans l’appli', () => {
	it('critère 4 : figer le décor sur un profil ne fige pas celui d’un autre profil', () => {
		const a = activeProfile().uuid;
		setDecorFigeProfil(true);
		expect(decorFigeProfil()).toBe(true);

		addProfile('B'); // devient actif
		expect(decorFigeProfil()).toBe(false);

		setActiveProfile(a);
		expect(decorFigeProfil()).toBe(true);
	});

	it('critère 4 : défiger sur un profil ne défige pas un autre profil', () => {
		const a = activeProfile().uuid;
		setDecorFigeProfil(true);
		const b = addProfile('B').uuid;
		setDecorFigeProfil(true);
		setDecorFigeProfil(false);
		expect(decorFigeProfil()).toBe(false);

		setActiveProfile(a);
		expect(decorFigeProfil()).toBe(true);
		setActiveProfile(b);
		expect(decorFigeProfil()).toBe(false);
	});
});

describe('Figer le décor — critères 5 et 28 : réglage de la vitrine par appareil', () => {
	it('critère 5 : posé sous un profil, se relit sous un autre profil et sans profil (vitrine)', () => {
		setDecorFigeSite(true);
		addProfile('B');
		expect(decorFigeSite()).toBe(true);
		setActivePrefix(''); // la vitrine ne charge pas les profils
		expect(decorFigeSite()).toBe(true);
	});

	it('critère 5 : posé depuis la vitrine (sans profil), se relit sous un profil', () => {
		setActivePrefix('');
		setDecorFigeSite(true);
		initProfiles(); // retour dans l'appli : un profil redevient actif
		expect(decorFigeSite()).toBe(true);
	});

	it("critère 28 : figer le décor d'un profil ne fige pas la vitrine", () => {
		setDecorFigeProfil(true);
		expect(decorFigeSite()).toBe(false);
		setActivePrefix('');
		expect(decorFigeSite()).toBe(false);
	});

	it("critère 28 : figer la vitrine ne fige aucun profil de l'appli", () => {
		const a = activeProfile().uuid;
		addProfile('B');
		setDecorFigeSite(true);
		expect(decorFigeProfil()).toBe(false);
		setActiveProfile(a);
		expect(decorFigeProfil()).toBe(false);
	});

	it('critère 28 : sous un profil hérité à préfixe vide, les deux réglages restent indépendants', () => {
		setActivePrefix('');
		setDecorFigeProfil(true);
		expect(decorFigeSite()).toBe(false);

		setDecorFigeSite(true);
		setDecorFigeProfil(false);
		expect(decorFigeSite()).toBe(true);
		expect(decorFigeProfil()).toBe(false);

		setDecorFigeSite(false);
		setDecorFigeProfil(true);
		setDecorFigeSite(true);
		setDecorFigeSite(false);
		expect(decorFigeProfil()).toBe(true);
	});
});

describe('Figer le décor — critère 7 : « Réduire les animations » le fige d’office', () => {
	it.each([
		{ fige: false, reduites: false, attendu: false },
		{ fige: true, reduites: false, attendu: true },
		{ fige: false, reduites: true, attendu: true },
		{ fige: true, reduites: true, attendu: true },
	])(
		'réglage $fige, animations réduites $reduites → figé $attendu',
		({ fige, reduites, attendu }) => {
			expect(decorFigeEffectif(fige, reduites)).toBe(attendu);
		},
	);
});

describe('Figer le décor — critère 26 : les deux réglages ne se touchent pas', () => {
	it('critère 26 : cocher puis décocher « Figer le décor » laisse « Réduire les animations » où elle était', () => {
		for (const reduites of [false, true]) {
			setAnimationsReduites(reduites);
			setDecorFigeProfil(true);
			expect(animationsReduites()).toBe(reduites);
			setDecorFigeProfil(false);
			expect(animationsReduites()).toBe(reduites);
		}
	});

	it('critère 26 : cocher puis décocher « Réduire les animations » laisse la valeur mémorisée de « Figer le décor »', () => {
		for (const fige of [false, true]) {
			setDecorFigeProfil(fige);
			setAnimationsReduites(true);
			// Valeur MÉMORISÉE : l'effet « figé d'office » passe par decorFigeEffectif, il ne
			// doit pas réécrire le choix de l'enfant.
			expect(decorFigeProfil()).toBe(fige);
			setAnimationsReduites(false);
			expect(decorFigeProfil()).toBe(fige);
		}
	});

	it('critère 26 : le réglage de la vitrine ne touche pas « Réduire les animations » du profil', () => {
		setAnimationsReduites(true);
		setDecorFigeSite(true);
		setDecorFigeSite(false);
		expect(animationsReduites()).toBe(true);
	});
});

/* ============================================================
   Critère 25 : « Figer le décor » ne fige QUE le décor. Les démonstrations de l'aide, les
   effets de réussite, la luciole et la pluie de cookies restent animés.

   Le réglage n'agit que par la classe `decor-fige` posée sur <html> (`rafraichirDecor`,
   src/ui/footer.ts), et seules les feuilles la lisent. Une règle
   `html.decor-fige .aide-demo { animation: none }` ajoutée demain couperait donc l'aide
   en silence : seul le cas des cookies est joué en e2e. Ce gate lit TOUTES les feuilles
   de src/styles et exige que chaque sélecteur qui mentionne la classe vise une cible de
   CIBLES_FIGEABLES.

   Ce que le lecteur couvre (témoins en fin de fichier) : les commentaires, les listes de
   sélecteurs à virgule, l'imbrication SCSS avec ou sans `&`, les règles sous @media, une
   instruction autre qu'une déclaration (`@include`). Ce qu'il refuse au lieu de le lire :
   une mention de la classe dans une règle @ (`@at-root`…) ou hors sélecteur (`@extend`,
   valeur), et un sélecteur bâti par interpolation (`#{$s}`) : sa cible ne figure pas dans
   la liste. Ce qu'il NE VOIT PAS : un nom de classe reconstitué par interpolation
   (`.decor-#{$x}`), un `@extend` qui fait hériter une cible autorisée par un autre
   élément, et toute lecture du réglage côté TypeScript.
   ============================================================ */

/** Ce que le réglage a le droit de figer : la partie du sélecteur QUI SUIT le composé
 *  portant `decor-fige` (`html.decor-fige .home-foret .sway` → `.home-foret .sway`).
 *
 *  Y AJOUTER UNE CIBLE, C'EST DÉCIDER QUE « FIGER LE DÉCOR » LA FIGE. Ce n'est compatible
 *  avec le critère 25 que si elle relève du DÉCOR : jamais l'aide animée, les effets de
 *  réussite, la luciole ni la pluie de cookies. Le nom du réglage est une promesse faite
 *  à l'enfant : il ne coupe que ce qu'il annonce. */
const CIBLES_FIGEABLES: readonly { cible: string; quoi: string }[] = [
	{ cible: '.home-foret .sway', quoi: "les arbres de la forêt de l'accueil (foret.scss)" },
	{ cible: '.decor-flocon', quoi: 'les flocons du décor de saison (decor-saison.scss)' },
];

const CLASSE_FIGE = 'decor-fige';

interface RegleFige {
	fichier: string;
	ligne: number;
	selecteur: string;
}

/** Règles d'une feuille dont un sélecteur mentionne `decor-fige` (seulement celles qui
 *  portent au moins une instruction : un bloc parent qui ne fait qu'imbriquer ne vise
 *  rien lui-même), et mentions de la classe que ce lecteur ne sait pas interpréter. */
function lireReglesFige(
	fichier: string,
	scss: string,
): { regles: RegleFige[]; illisibles: string[] } {
	const src = sansCommentairesScss(scss);
	const pile: { texte: string; ligne: number }[] = [];
	const regles: RegleFige[] = [];
	const illisibles: string[] = [];
	const vues = new Set<string>();
	let tampon = '';
	let ligne = 1;
	let ligneTampon = 1;
	let guillemet = '';

	const finInstruction = () => {
		const texte = tampon.trim();
		tampon = '';
		if (!texte) return;
		// La classe dans une déclaration, un `@extend`, un `@include`… : pas un sélecteur.
		if (texte.includes(CLASSE_FIGE)) illisibles.push(`${fichier}:${ligneTampon}  ${texte}`);
		const regle = [...pile].reverse().find((p) => !p.texte.startsWith('@'));
		for (const selecteur of resoudreImbrication(pile.map((p) => p.texte))) {
			if (!selecteur.includes(CLASSE_FIGE)) continue;
			const ligneRegle = regle?.ligne ?? ligneTampon;
			const cle = `${ligneRegle}|${selecteur}`;
			if (vues.has(cle)) continue;
			vues.add(cle);
			regles.push({ fichier, ligne: ligneRegle, selecteur });
		}
	};

	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (c === '\n') ligne++;
		if (!tampon.trim() && /\S/.test(c)) ligneTampon = ligne;
		if (guillemet) {
			tampon += c;
			if (c === guillemet) guillemet = '';
		} else if (c === '"' || c === "'") {
			guillemet = c;
			tampon += c;
		} else if (c === '#' && src[i + 1] === '{') {
			// Interpolation `#{…}` : ses accolades ne sont pas celles d'une règle.
			const fin = src.indexOf('}', i);
			const bout = fin === -1 ? src.length : fin + 1;
			const morceau = src.slice(i, bout);
			ligne += (morceau.match(/\n/g) ?? []).length;
			tampon += morceau;
			i = bout - 1;
		} else if (c === '{') {
			const texte = tampon.trim().replace(/\s+/g, ' ');
			// `@at-root html.decor-fige …`, `@media` qui citerait la classe : le résolveur
			// ignore les préludes @, il ne verrait pas la classe. Signalé plutôt que lu.
			if (texte.startsWith('@') && texte.includes(CLASSE_FIGE))
				illisibles.push(`${fichier}:${ligneTampon}  ${texte}`);
			pile.push({ texte, ligne: ligneTampon });
			tampon = '';
		} else if (c === ';' || c === '}') {
			finInstruction();
			if (c === '}') pile.pop();
		} else tampon += c;
	}
	finInstruction();
	return { regles, illisibles };
}

/** Ce que vise un sélecteur qui lit `decor-fige` : les composés qui suivent le DERNIER
 *  composé portant la classe, combinateur de tête retiré. Chaîne vide si la classe est
 *  dans le dernier composé : la règle vise alors <html> lui-même (une variable posée sur
 *  la racine se propage à toute la page), ou sert la classe d'une façon qu'on ne lit pas. */
function cibleFigee(selecteur: string): string {
	const morceaux: string[] = []; // composés aux rangs pairs, combinateurs aux rangs impairs
	let courant = '';
	let combinateur = '';
	let profondeur = 0;
	const pousser = () => {
		if (!courant) return;
		if (morceaux.length) morceaux.push(combinateur || ' ');
		morceaux.push(courant);
		courant = '';
		combinateur = '';
	};
	for (const c of selecteur) {
		if (c === '(' || c === '[') profondeur++;
		else if (c === ')' || c === ']') profondeur--;
		if (profondeur === 0 && /\s/.test(c)) pousser();
		else if (profondeur === 0 && /[>+~]/.test(c)) {
			pousser();
			combinateur = c;
		} else courant += c;
	}
	pousser();
	let dernier = -1;
	morceaux.forEach((m, i) => {
		if (i % 2 === 0 && m.includes(CLASSE_FIGE)) dernier = i;
	});
	if (dernier < 0) return selecteur;
	return morceaux
		.slice(dernier + 2)
		.map((m, i) => (i % 2 === 1 && m !== ' ' ? ` ${m} ` : m))
		.join('');
}

/** Règles dont la cible n'est pas dans CIBLES_FIGEABLES, prêtes pour le message d'échec. */
function horsListe(regles: readonly RegleFige[]): string[] {
	return regles
		.filter((r) => !CIBLES_FIGEABLES.some((c) => c.cible === cibleFigee(r.selecteur)))
		.map((r) => `${r.fichier}:${r.ligne}  ${r.selecteur}  → cible « ${cibleFigee(r.selecteur)} »`);
}

const DOSSIER_STYLES = 'src/styles';
const FEUILLES = readdirSync(DOSSIER_STYLES, { recursive: true, encoding: 'utf8' })
	.map((f) => f.replace(/\\/g, '/'))
	.filter((f) => f.endsWith('.scss'))
	.sort();
const LECTURES = FEUILLES.map((fichier) =>
	lireReglesFige(fichier, readFileSync(`${DOSSIER_STYLES}/${fichier}`, 'utf8')),
);
const REGLES = LECTURES.flatMap((l) => l.regles);

describe('Figer le décor — critère 25 : seul le décor se fige (gate des feuilles)', () => {
	it('les feuilles sont lues et les deux règles du décor actuel sont trouvées', () => {
		// Sans cette garde, un lecteur qui ne trouve rien rendrait le gate vert à vide.
		expect(FEUILLES).toContain('foret.scss');
		expect(FEUILLES).toContain('decor-saison.scss');
		expect(REGLES.map((r) => `${r.fichier}  ${r.selecteur}`)).toEqual(
			expect.arrayContaining([
				'foret.scss  html.decor-fige .home-foret .sway',
				'decor-saison.scss  html.decor-fige .decor-flocon',
			]),
		);
	});

	it('critère 25 : chaque sélecteur qui lit decor-fige vise une cible de la liste blanche', () => {
		expect(
			horsListe(REGLES),
			`Règle qui fige autre chose que le décor quand « Figer le décor » est actif. Le ` +
				`critère 25 veut que l'aide animée, les effets de réussite, la luciole et la ` +
				`pluie de cookies restent animés. Si la cible relève VRAIMENT du décor, ajoutez-la ` +
				`à CIBLES_FIGEABLES (tests/decor-fige.test.ts) : c'est décider que le réglage la fige.`,
		).toEqual([]);
	});

	it('aucune mention de decor-fige que ce gate ne sait pas lire', () => {
		expect(
			LECTURES.flatMap((l) => l.illisibles),
			`La classe decor-fige apparaît hors d'un sélecteur de règle (déclaration, @extend, ` +
				`règle @…) : ce gate ne peut pas dire ce qu'elle fige. Écrivez une règle ordinaire ` +
				`html.decor-fige <cible> { … }.`,
		).toEqual([]);
	});

	it('chaque cible de la liste blanche sert encore', () => {
		// Une entrée qui ne sert plus est une porte ouverte pour une cible homonyme.
		const servies = new Set(REGLES.map((r) => cibleFigee(r.selecteur)));
		expect(CIBLES_FIGEABLES.filter((c) => !servies.has(c.cible)).map((c) => c.cible)).toEqual([]);
	});
});

describe('Gate decor-fige — témoins : le lecteur voit ce qu’il prétend voir', () => {
	const lire = (scss: string) => lireReglesFige('temoin.scss', scss);

	it.each([
		['la pluie de cookies', 'html.decor-fige .cookie-rain-item { animation: none; }'],
		['l’aide animée', 'html.decor-fige .aide-demo { animation-play-state: paused; }'],
		['<html> lui-même', 'html.decor-fige { --etat-anim: paused; }'],
		['toute la page', 'html.decor-fige * { animation: none; }'],
		['un descendant du flocon', 'html.decor-fige .decor-flocon-glyphe { animation: none; }'],
		[
			'le second sélecteur d’une liste',
			'html.decor-fige .decor-flocon,\nhtml.decor-fige .aide-demo { animation: none; }',
		],
		['imbrication avec &', '.aide-demo { html.decor-fige & { animation: none; } }'],
		['imbrication sans &', 'html.decor-fige { .aide-demo { animation: none; } }'],
		['sous @media', '@media (min-width: 1px) { html.decor-fige .aide-demo { opacity: 1; } }'],
		['une instruction @include', 'html.decor-fige .aide-demo { @include sans-anim; }'],
		['la classe en négation', 'html:not(.decor-fige) .aide-demo { animation: x 1s; }'],
		['un sélecteur interpolé', '@mixin f($s) { html.decor-fige #{$s} { animation: none; } }'],
	])('refusé : %s', (_cas, scss) => {
		const { regles } = lire(scss);
		expect(regles.length).toBeGreaterThan(0);
		expect(horsListe(regles).length).toBeGreaterThan(0);
	});

	it.each([
		[
			'les arbres de la forêt',
			'html.decor-fige .home-foret .sway { animation-play-state: paused; }',
		],
		['les flocons', 'html.decor-fige .decor-flocon { animation-play-state: paused; }'],
		['les flocons, imbriqués', 'html.decor-fige { .decor-flocon { animation: none; } }'],
		['les flocons, par &', '.decor-flocon { html.decor-fige & { animation: none; } }'],
		['à la racine sans html', '.decor-fige .decor-flocon { animation: none; }'],
	])('accepté : %s', (_cas, scss) => {
		const { regles, illisibles } = lire(scss);
		expect(regles).toHaveLength(1);
		expect(horsListe(regles)).toEqual([]);
		expect(illisibles).toEqual([]);
	});

	it('la classe citée dans un commentaire ne compte pas', () => {
		const scss = '/* html.decor-fige .aide-demo */\n// html.decor-fige .luciole\n.x { a: b; }';
		expect(lire(scss)).toEqual({ regles: [], illisibles: [] });
	});

	it.each([
		['@at-root', '.x { @at-root html.decor-fige .aide-demo { animation: none; } }'],
		['@extend', '.aide-demo { @extend .decor-fige; }'],
		['une valeur', '.aide-demo { content: "decor-fige"; }'],
	])('signalé illisible : %s', (_cas, scss) => {
		expect(lire(scss).illisibles.length).toBeGreaterThan(0);
	});

	it('la ligne rapportée est celle de la règle', () => {
		const { regles } = lire('.a { b: c; }\n\nhtml.decor-fige .aide-demo {\n\tanimation: none;\n}');
		expect(regles).toEqual([
			{ fichier: 'temoin.scss', ligne: 3, selecteur: 'html.decor-fige .aide-demo' },
		]);
	});
});
