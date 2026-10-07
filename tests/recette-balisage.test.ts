/* ============================================================
   Recette des fragments de balisage (#734) — la PROMESSE de la réécriture :
   « balisage identique au caractère près ».

   Pour qu'une figure ou la vue riche d'un choix de QCM puisse voyager dans un lien
   partagé, trois producteurs de balisage ont été réécrits pour garder la recette de
   leur fragment : `surligner` (terminaison `.term` des QCM d'accord), `aideFigure`
   (bulles sous la figure d'angle) et `suite` (figure + bulle). Rien ne doit changer
   à l'écran : ce fichier fige le balisage produit contre celui de `main` AVANT #734.

   Les attendus ne sont PAS dérivés du code actuel : soit des chaînes littérales
   recopiées de `main`, soit la formule de `main` réécrite ici telle quelle (le
   gabarit `html` de `core/html.ts`, inchangé par #734). Sans DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { html, joindre } from '../src/core/html';
import { surligner } from '../src/core/surlignage';
import { aideFigure } from '../src/core/aides-figure';
import { recetteDe, type IdAide } from '../src/core/recette-fragment';
import { renderFigure } from '../src/core/figures';
import { withSeed } from '../src/core/utils';
import {
	PARTICIPE_LESSONS,
	VERBES,
	forme,
	type Forme,
	type VerbeEtre,
} from '../src/data/francais/participe-passe-etre';
import {
	ACCORD_GN_LESSONS,
	GROUPES_NOMINAUX,
	type GroupeNominal,
} from '../src/data/francais/accord-groupe-nominal';
import { genAngle, type Famille } from '../src/data/maths/angles';

/* Nombre de tirages échantillonnés, chacun sous SA graine (1..N) : reproductible. */
const TIRAGES = 200;

/* Texte EXACT des bulles sur `main` (src/data/maths/angles.ts, l. 103 et 106). La
   classe `screen-only` en fait partie : elle retire la bulle à l'impression (#290),
   sinon elle fuiterait la réponse sur un bilan. */
const BULLE_NOMMER_MAIN =
	'<p class="angle-aide screen-only">plus petit que l\'angle droit → aigu · plus grand → obtus</p>';
const BULLE_AIGU_MAIN =
	'<p class="angle-aide screen-only">aigu = plus petit que l\'angle droit</p>';

describe('surligner — balisage `.term` identique au gabarit écrit à la main', () => {
	it('racine nue + terminaison surlignée', () => {
		expect(
			surligner([
				['mang', false],
				['e', true],
			]).balisage,
		).toBe('mang<span class="term">e</span>');
	});

	it('racine vide : seul le span, sans texte parasite devant', () => {
		expect(
			surligner([
				['', false],
				['les', true],
			]).balisage,
		).toBe('<span class="term">les</span>');
	});

	it('suffixe vide : le `<span class="term">` vide est CONSERVÉ (surlignage uniforme, ne trahit pas la réponse)', () => {
		expect(
			surligner([
				['petit', false],
				['', true],
			]).balisage,
		).toBe('petit<span class="term"></span>');
	});

	it('plusieurs morceaux, espace nue entre deux surlignages', () => {
		expect(
			surligner([
				['les', true],
				[' ', false],
				['chat', false],
				['s', true],
			]).balisage,
		).toBe('<span class="term">les</span> chat<span class="term">s</span>');
	});

	it('échappe `<`, `>`, `&`, `"` et l\'apostrophe comme le gabarit `html`, surligné ou non', () => {
		expect(
			surligner([
				["l'<b>", false],
				['&"x"', true],
			]).balisage,
		).toBe('l&#39;&lt;b&gt;<span class="term">&amp;&quot;x&quot;</span>');
	});

	it('la recette est `{ k: "surlignage", morceaux }` et redessine le même balisage', () => {
		const morceaux: [string, boolean][] = [
			['mang', false],
			['e', true],
		];
		const fragment = surligner(morceaux);
		const recette = recetteDe(fragment);
		expect(recette).toEqual({
			k: 'surlignage',
			morceaux: [
				['mang', false],
				['e', true],
			],
		});
		if (recette?.k !== 'surlignage') return;
		expect(surligner(recette.morceaux).balisage).toBe(fragment.balisage);
	});
});

describe('aideFigure — texte exact des bulles de `main`', () => {
	it('« angle-aigu » : aide réduite à un seul terme, classe `screen-only` comprise', () => {
		expect(aideFigure('angle-aigu').balisage).toBe(BULLE_AIGU_MAIN);
	});

	it('« angle-nommer » : les deux termes, classe `screen-only` comprise', () => {
		expect(aideFigure('angle-nommer').balisage).toBe(BULLE_NOMMER_MAIN);
	});

	it("la recette ne porte que l'identifiant de la bulle", () => {
		expect(recetteDe(aideFigure('angle-aigu'))).toEqual({ k: 'aide', id: 'angle-aigu' });
		expect(recetteDe(aideFigure('angle-nommer'))).toEqual({ k: 'aide', id: 'angle-nommer' });
	});
});

/* ---------- Participe passé avec « être » ---------- */

const FORMES: Forme[] = ['ms', 'fs', 'mp', 'fp'];

/* La vue d'option de `main` (participe-passe-etre.ts, fonction `vue`), recopiée. */
const vueParticipeMain = (v: VerbeEtre, f: Forme): string =>
	html`${v.base}<span class="term">${v.terminaisons[f]}</span>`.balisage;

describe('participe passé avec « être » — vue des options identique à `main`', () => {
	it(`${TIRAGES} tirages (graines fixes) : toute option vaut \`base<span class="term">terminaison</span>\``, () => {
		const lecon = PARTICIPE_LESSONS[0];
		const verbesVus = new Set<string>();
		let options = 0;
		for (let graine = 1; graine <= TIRAGES; graine++) {
			const ex = withSeed(graine, () => lecon.exerciseType.generate({ mode: 'qcm' }));
			if (ex.type !== 'qcm' || !ex.choicesView)
				throw new Error(`graine ${graine} : pas de vue riche`);
			const vues = ex.choicesView;
			const verbe = VERBES.find((v) => FORMES.some((f) => forme(v, f) === ex.answer));
			if (!verbe) throw new Error(`graine ${graine} : verbe introuvable pour « ${ex.answer} »`);
			verbesVus.add(verbe.infinitif);
			expect(vues).toHaveLength(ex.choices.length);
			ex.choices.forEach((choix, i) => {
				const f = FORMES.find((g) => forme(verbe, g) === choix);
				if (!f)
					throw new Error(
						`graine ${graine} : « ${choix} » n'est pas une forme de ${verbe.infinitif}`,
					);
				expect(vues[i].html.balisage, `graine ${graine}, option « ${choix} »`).toBe(
					vueParticipeMain(verbe, f),
				);
				// Le libellé parlé (lecteur d'écran) reste la forme nue.
				expect(vues[i].label).toBe(choix);
				// Redessinée depuis sa recette, l'option est la même au caractère près.
				const recette = recetteDe(vues[i].html);
				if (recette?.k !== 'surlignage') throw new Error(`graine ${graine} : recette absente`);
				expect(surligner(recette.morceaux).balisage).toBe(vues[i].html.balisage);
				options++;
			});
		}
		// L'échantillon couvre toute la banque (sinon il ne prouverait rien sur un verbe).
		expect(verbesVus.size).toBe(VERBES.length);
		expect(options).toBe(TIRAGES * 3);
	});
});

/* ---------- Accord dans le groupe nominal ---------- */

type Constituant = GroupeNominal['constituants'][number];

const prefixeCommun = (a: string, b: string): string => {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return a.slice(0, i);
};

/* La vue de `main` (accord-groupe-nominal.ts, `vueConstituant` + `proposition`),
   recopiée : déterminant (`marque: 'mot'`) surligné en entier ; sinon racine nue
   (préfixe commun départ/cible) + suffixe surligné ; constituants joints par UNE espace. */
function vueGroupeMain(g: GroupeNominal, valeurs: string[]): string {
	const vueConstituant = (c: Constituant, valeur: string) => {
		if (c.marque === 'mot') return html`<span class="term">${valeur}</span>`;
		const racine = prefixeCommun(c.depart, c.cible);
		return html`${racine}<span class="term">${valeur.slice(racine.length)}</span>`;
	};
	return joindre(
		g.constituants.map((c, i) => vueConstituant(c, valeurs[i])),
		html` `,
	).balisage;
}

/* Les formes affichées (départ ou cible, par constituant) dont la valeur nue vaut `choix`. */
function valeursDe(g: GroupeNominal, choix: string): string[] | undefined {
	const n = g.constituants.length;
	for (let masque = 0; masque < 2 ** n; masque++) {
		const valeurs = g.constituants.map((c, i) => (masque & (1 << i) ? c.depart : c.cible));
		if (valeurs.join(' ') === choix) return valeurs;
	}
	return undefined;
}

describe('accord dans le groupe nominal — vue des options identique à `main`', () => {
	it(`${TIRAGES} tirages (graines fixes) : déterminant entier surligné, racine nue + suffixe, une espace`, () => {
		const lecon = ACCORD_GN_LESSONS[0];
		const groupesVus = new Set<string>();
		let suffixesVides = 0;
		let options = 0;
		for (let graine = 1; graine <= TIRAGES; graine++) {
			const ex = withSeed(graine, () => lecon.exerciseType.generate({ mode: 'qcm' }));
			if (ex.type !== 'qcm' || !ex.choicesView)
				throw new Error(`graine ${graine} : pas de vue riche`);
			const vues = ex.choicesView;
			const g = GROUPES_NOMINAUX.find(
				(x) => x.constituants.map((c) => c.cible).join(' ') === ex.answer,
			);
			if (!g) throw new Error(`graine ${graine} : groupe introuvable pour « ${ex.answer} »`);
			groupesVus.add(g.id);
			expect(vues).toHaveLength(ex.choices.length);
			ex.choices.forEach((choix, i) => {
				const valeurs = valeursDe(g, choix);
				if (!valeurs) throw new Error(`graine ${graine} : « ${choix} » hors des formes de ${g.id}`);
				const balisage = vues[i].html.balisage;
				expect(balisage, `graine ${graine}, option « ${choix} »`).toBe(vueGroupeMain(g, valeurs));
				expect(vues[i].label).toBe(choix);
				const recette = recetteDe(vues[i].html);
				if (recette?.k !== 'surlignage') throw new Error(`graine ${graine} : recette absente`);
				expect(surligner(recette.morceaux).balisage).toBe(balisage);
				if (balisage.includes('<span class="term"></span>')) suffixesVides++;
				options++;
			});
		}
		expect(groupesVus.size).toBe(GROUPES_NOMINAUX.length);
		// Le cas tricky (forme de départ laissée non accordée → span vide) est bien tiré.
		expect(suffixesVides).toBeGreaterThan(0);
		expect(options).toBe(TIRAGES * 3);
	});
});

/* ---------- Angles (CE2) : figure + bulle ---------- */

const AVEC_BULLE: [Famille, IdAide, string][] = [
	['aiguOuiNon', 'angle-aigu', BULLE_AIGU_MAIN],
	['nommer', 'angle-nommer', BULLE_NOMMER_MAIN],
];

describe('geo-angles (CE2) — figure accompagnée de sa bulle', () => {
	it.each(AVEC_BULLE)(
		'famille %s : figure de `main` immédiatement suivie de la bulle « %s », recette `suite(figure, aide)`',
		(famille, id, bulle) => {
			let vus = 0;
			for (let graine = 1; graine <= TIRAGES * 2; graine++) {
				const tirage = withSeed(graine, genAngle);
				if (tirage.famille !== famille) continue;
				const ex = tirage.ex;
				if (ex.type !== 'qcm' || !ex.figure) throw new Error(`graine ${graine} : pas de figure`);
				const balisage = ex.figure.balisage;
				expect(balisage.endsWith(bulle), `graine ${graine}`).toBe(true);

				const recette = recetteDe(ex.figure);
				if (recette?.k !== 'suite') throw new Error(`graine ${graine} : pas de recette « suite »`);
				expect(recette.parts).toHaveLength(2);
				const [figure, aide] = recette.parts;
				expect(aide).toEqual({ k: 'aide', id });
				if (figure.k !== 'figure') throw new Error(`graine ${graine} : 1re partie ≠ figure`);
				// Tout le balisage : la figure (`renderFigure`, SVG inchangé par #734) PUIS la
				// bulle, sans séparateur — exactement `html\`${figureAngle(cat)}${AIDE}\`` de `main`.
				expect(balisage).toBe(renderFigure(figure.spec).balisage + bulle);
				vus++;
			}
			expect(vus).toBeGreaterThanOrEqual(10);
		},
	);
});
