/* ============================================================
   Organisation et gestion de données — LIRE un graphique / tableau (#257, CM1).
   ------------------------------------------------------------
   Auteur des tests DISTINCT de l'auteur du code : les attendus sont dérivés
   INDÉPENDAMMENT (consigne, programme 2025 §4.1 « lire les données d'un tableau /
   d'un diagramme en barres », géométrie de l'axe depuis ses extrémités), jamais
   recopiés de l'implémentation.

   Trois volets :
   1. Helpers géométriques PURS de l'axe (graduationsAxe / yDeValeur / emplacementBarre).
   2. Renderers (SVG barres role="img" ; tableau HTML sémantique) + dispatch renderFigure.
   3. Générateurs des 2 leçons, éprouvés PAR ÉCHANTILLON (la cible tombe pile sur une
      graduation ; la réponse == la valeur de la barre/cellule interrogée ; pas de
      fuite de la valeur à lire dans le <desc> ; déterminisme du tirage).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	graduationsAxe,
	yDeValeur,
	emplacementBarre,
	GRAPHIQUE_GEOM,
	renderDiagrammeBarres,
	renderTableauDonnees,
	type DiagrammeBarresSpec,
	type TableauDonneesSpec,
} from '../src/core/figures/graphiques';
import { renderFigure } from '../src/core/figures';
import { getLessonById, getLessonsByCategory, genLessonItem } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { withSeed } from '../src/core/utils';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';
import type { Exercise, ExerciseType } from '../src/core/exercise';

const BARRES = 'donnees-barres-lire';
const TABLEAU = 'donnees-tableau-lire';

type TextEx = Extract<Exercise, { type: 'text' }>;

/* Narrowing sans `as` : ces leçons produisent un exercice `text` + figure. */
function asText(ex: Exercise): TextEx {
	if (ex.type !== 'text') throw new Error(`attendu text, reçu ${ex.type}`);
	return ex;
}
function typeDe(id: string): ExerciseType {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente : ${id}`);
	return l.exerciseType;
}
function genText(id: string): TextEx {
	return asText(typeDe(id).generate({ level: 'cm1' }));
}

/* ---------- Extraction black-box des figures ---------- */

/** Contenus de tous les <text> d'un SVG (étiquettes + titre). */
function textesSvg(svg: string): string[] {
	return [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1]);
}

/** Valeurs des graduations LUES sur l'axe (étiquettes purement chiffrées), triées croissant.
    Le renderer n'écrit AUCUNE valeur de barre en texte → les seuls <text> chiffrés sont les
    crans de l'axe (0, pas, …, max). */
function graduationsLues(svg: string): number[] {
	return [...svg.matchAll(/<text[^>]*>(\d+)<\/text>/g)]
		.map((m) => Number(m[1]))
		.sort((a, b) => a - b);
}

/** Hauteur (valeur) de chaque barre DÉCODÉE de la géométrie du path, pour un `max` donné.
    Inverse du mapping linéaire de l'axe (0 → baseline, max → haut du tracé), établi
    indépendamment dans les tests de `yDeValeur`. Le sommet d'une barre = la plus petite
    ordonnée (y croît vers le bas) parmi les couples (x, y) du tracé. */
function valeursBarresLues(svg: string, max: number): number[] {
	const { baseline, plotTop } = GRAPHIQUE_GEOM;
	const plotH = baseline - plotTop;
	return [...svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((m) => {
		const nums = [...m[1].matchAll(/-?\d+(?:\.\d+)?/g)].map((n) => Number(n[0]));
		const ys = nums.filter((_, i) => i % 2 === 1); // couples x,y → y aux indices impairs
		const topY = Math.min(...ys);
		return Math.round(((baseline - topY) / plotH) * max);
	});
}

/** Parse un markup de tableau en <table> via le DOM (happy-dom). */
function parseTable(html: string): HTMLTableElement {
	const div = document.createElement('div');
	div.innerHTML = html;
	const table = div.querySelector('table');
	if (!table) throw new Error('markup sans <table>');
	return table;
}

/** Article attendu devant un objet, dérivé de la RÈGLE linguistique (élision de « de » →
    « d' » devant une initiale vocalique — voyelle simple ou accentuée), INDÉPENDAMMENT du
    code. Pour les banques concernées : « d'images », « de billes ». « yaourts » (semi-voyelle
    /j/) et un éventuel « h » ne s'élident pas → « de … ». */
function articleAttendu(objet: string): "d'" | 'de ' {
	return /^[aeiouàâäéèêëîïôöùûü]/i.test(objet) ? "d'" : 'de ';
}

/* =========================================================================
   1. HELPERS GÉOMÉTRIQUES PURS
   ========================================================================= */

describe('graduationsAxe : 0, pas, 2·pas, …, max', () => {
	it('cas dérivés à la main', () => {
		expect(graduationsAxe(8, 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
		expect(graduationsAxe(10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
		expect(graduationsAxe(25, 5)).toEqual([0, 5, 10, 15, 20, 25]);
		expect(graduationsAxe(50, 10)).toEqual([0, 10, 20, 30, 40, 50]);
	});

	it('sur toutes les échelles du programme : 0 en tête, max en fin, pas constant, multiples du pas', () => {
		const cas: Array<[number, number]> = [
			[5, 1],
			[6, 1],
			[7, 1],
			[8, 1],
			[8, 2],
			[10, 2],
			[12, 2],
			[14, 2],
			[20, 5],
			[25, 5],
			[30, 5],
			[35, 5],
			[40, 10],
			[50, 10],
		];
		for (const [max, pas] of cas) {
			const g = graduationsAxe(max, pas);
			expect(g[0]).toBe(0);
			expect(g[g.length - 1]).toBe(max);
			expect(g.length).toBe(max / pas + 1);
			for (let i = 1; i < g.length; i++) expect(g[i] - g[i - 1]).toBe(pas);
			for (const v of g) expect(v % pas).toBe(0);
		}
	});

	it('cas dégénéré max = 0 → une seule graduation {0}', () => {
		expect(graduationsAxe(0, 1)).toEqual([0]);
	});
});

describe('yDeValeur : mapping linéaire, 0 → baseline (bas), max → haut du tracé', () => {
	const { baseline, plotTop } = GRAPHIQUE_GEOM;

	it('extrémités exactes sur des max variés', () => {
		for (const max of [8, 10, 25, 50]) {
			expect(yDeValeur(0, max)).toBe(baseline);
			expect(yDeValeur(max, max)).toBe(plotTop);
		}
	});

	it('interpolation linéaire (dérivée des extrémités), strictement décroissante, bornée', () => {
		for (const max of [8, 25, 50]) {
			let prev = Infinity;
			for (let v = 0; v <= max; v++) {
				const y = yDeValeur(v, max);
				// Unique droite passant par (0, baseline) et (max, plotTop).
				expect(y).toBeCloseTo(baseline + (v / max) * (plotTop - baseline), 9);
				// y croît vers le bas → une valeur plus grande donne un y plus PETIT.
				expect(y).toBeLessThan(prev);
				prev = y;
				expect(y).toBeGreaterThanOrEqual(plotTop - 1e-9);
				expect(y).toBeLessThanOrEqual(baseline + 1e-9);
			}
		}
	});

	it('le milieu de l’échelle tombe au centre vertical du tracé', () => {
		expect(yDeValeur(25, 50)).toBeCloseTo((baseline + plotTop) / 2, 9);
		expect(yDeValeur(4, 8)).toBeCloseTo((baseline + plotTop) / 2, 9);
	});
});

describe('emplacementBarre : n emplacements réguliers, barres disjointes et dans le tracé', () => {
	const { axisX, right } = GRAPHIQUE_GEOM;

	it('centres régulièrement espacés (demi-emplacement aux deux bords)', () => {
		for (const n of [4, 5, 6]) {
			const slot = (right - axisX) / n;
			const centres = Array.from({ length: n }, (_, i) => emplacementBarre(i, n).centre);
			expect(centres[0] - axisX).toBeCloseTo(slot / 2, 9);
			expect(right - centres[n - 1]).toBeCloseTo(slot / 2, 9);
			for (let i = 1; i < n; i++) expect(centres[i] - centres[i - 1]).toBeCloseTo(slot, 9);
			for (const c of centres) {
				expect(c).toBeGreaterThan(axisX);
				expect(c).toBeLessThan(right);
			}
		}
	});

	it('largeur ≈ 60-70 % de l’emplacement, aucune barre ne déborde ni ne chevauche', () => {
		for (const n of [4, 5, 6]) {
			const slot = (right - axisX) / n;
			const { largeur } = emplacementBarre(0, n);
			expect(largeur).toBeGreaterThan(0.5 * slot);
			expect(largeur).toBeLessThan(0.75 * slot);
			expect(largeur).toBeLessThan(slot); // pas de chevauchement entre voisines
			for (let i = 0; i < n; i++) {
				const { centre } = emplacementBarre(i, n);
				expect(centre - largeur / 2).toBeGreaterThanOrEqual(axisX - 1e-9);
				expect(centre + largeur / 2).toBeLessThanOrEqual(right + 1e-9);
			}
		}
	});
});

/* =========================================================================
   2. RENDERERS + DISPATCH
   ========================================================================= */

describe('renderDiagrammeBarres : SVG accessible role="img"', () => {
	// Spec dérivée à la main, sans coïncidence entre valeurs de barres et {n, 0, max, pas}.
	const spec: DiagrammeBarresSpec = {
		titre: 'Nombre de billes',
		barres: [
			{ label: 'Emma', valeur: 10 },
			{ label: 'Léa', valeur: 15 },
			{ label: 'Tom', valeur: 25 },
			{ label: 'Zoé', valeur: 20 },
		],
		pas: 5,
		max: 30,
	};

	it('role="img", <title>, une barre <path> par donnée, une étiquette par graduation', () => {
		const svg = renderDiagrammeBarres(spec);
		expect(svg).toContain('role="img"');
		expect(svg).toContain(`<title>Diagramme en barres : ${spec.titre}</title>`);
		expect((svg.match(/<path/g) ?? []).length).toBe(spec.barres.length);
		// Un cran chiffré par graduation, y compris le 0.
		const ticks = graduationsLues(svg);
		expect(ticks).toEqual(graduationsAxe(spec.max, spec.pas));
		// Étiquettes de catégories toutes présentes.
		for (const b of spec.barres) expect(textesSvg(svg)).toContain(b.label);
	});

	it('tokens var(--…) uniquement : aucune couleur en dur (hex / rgb)', () => {
		const svg = renderDiagrammeBarres(spec);
		expect(svg).toContain('var(--');
		expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}/);
		expect(svg).not.toMatch(/rgb\(/i);
	});

	it('les sommets tombent PILE sur une graduation (décodage géométrique, aucune interpolation)', () => {
		const svg = renderDiagrammeBarres(spec);
		expect(valeursBarresLues(svg, spec.max)).toEqual(spec.barres.map((b) => b.valeur));
	});

	it('le <desc> ne divulgue PAS les hauteurs à lire : uniquement la structure {n, 0, max, pas}', () => {
		const svg = renderDiagrammeBarres(spec);
		const desc = svg.match(/<desc>(.*?)<\/desc>/)?.[1] ?? '';
		const nums = new Set([...desc.matchAll(/\d+/g)].map((m) => Number(m[0])));
		expect(nums).toEqual(new Set([spec.barres.length, 0, spec.max, spec.pas]));
		// Aucune hauteur de barre ne figure dans le desc (aucune coïncidence ici avec la structure).
		for (const b of spec.barres) expect(nums.has(b.valeur)).toBe(false);
	});
});

describe('renderTableauDonnees : <table> HTML sémantique', () => {
	const spec: TableauDonneesSpec = {
		caption: 'Fruits mangés cette semaine',
		colonnes: ['Pommes', 'Bananes', 'Kiwis'],
		lignes: [
			{ entete: 'Emma', valeurs: [3, 5, 2] },
			{ entete: 'Léa', valeurs: [1, 0, 6] }, // 0 : cellule nulle (cas limite)
			{ entete: 'Tom', valeurs: [7, 4, 3] },
		],
		coinLabel: 'Élève',
	};

	it('caption, th scope col/row, td aux bons croisements (dont la cellule 0)', () => {
		const table = parseTable(renderTableauDonnees(spec));
		expect(table.querySelector('caption')?.textContent).toBe(spec.caption);

		const cols = [...table.querySelectorAll('th[scope="col"]')].map((t) => t.textContent);
		expect(cols).toEqual(spec.colonnes);
		const rows = [...table.querySelectorAll('th[scope="row"]')].map((t) => t.textContent);
		expect(rows).toEqual(spec.lignes.map((l) => l.entete));
		expect(table.querySelector('.tableau-donnees-coin')?.textContent).toBe('Élève');

		const bodyRows = [...table.querySelectorAll('tbody tr')];
		expect(bodyRows.length).toBe(spec.lignes.length);
		expect([...table.querySelectorAll('tbody td')].length).toBe(
			spec.lignes.length * spec.colonnes.length,
		);
		spec.lignes.forEach((l, r) => {
			const tds = [...bodyRows[r].querySelectorAll('td')];
			expect(tds.length).toBe(spec.colonnes.length);
			l.valeurs.forEach((v, c) => expect(tds[c].textContent).toBe(String(v)));
		});
	});

	it('aucun style inline ni couleur en dur (mise en forme déléguée au SCSS)', () => {
		const html = renderTableauDonnees(spec);
		expect(html).not.toMatch(/style=/);
		expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/);
		expect(html).not.toMatch(/rgb\(/i);
	});

	it('coinLabel absent → cellule coin vide', () => {
		const table = parseTable(
			renderTableauDonnees({
				caption: 'x',
				colonnes: ['A'],
				lignes: [{ entete: 'E', valeurs: [1] }],
			}),
		);
		expect(table.querySelector('.tableau-donnees-coin')?.textContent).toBe('');
	});
});

describe('Dispatch renderFigure : identique à l’appel direct du renderer', () => {
	it('diagrammeBarres', () => {
		const spec: DiagrammeBarresSpec = {
			titre: 'Nombre de cartes',
			barres: [
				{ label: 'Hugo', valeur: 2 },
				{ label: 'Jade', valeur: 5 },
				{ label: 'Noah', valeur: 8 },
				{ label: 'Lou', valeur: 3 },
			],
			pas: 1,
			max: 8,
		};
		expect(renderFigure({ kind: 'diagrammeBarres', ...spec })).toBe(renderDiagrammeBarres(spec));
	});

	it('tableauDonnees', () => {
		const spec: TableauDonneesSpec = {
			caption: 'Cartes de la collection',
			colonnes: ['Cartes rouges', 'Cartes bleues', 'Cartes vertes'],
			lignes: [
				{ entete: 'Théo', valeurs: [4, 1, 9] },
				{ entete: 'Enzo', valeurs: [2, 7, 5] },
				{ entete: 'Lina', valeurs: [6, 3, 8] },
			],
			coinLabel: 'Élève',
		};
		expect(renderFigure({ kind: 'tableauDonnees', ...spec })).toBe(renderTableauDonnees(spec));
	});
});

/* =========================================================================
   3. CÂBLAGE CATALOGUE
   ========================================================================= */

describe('Câblage catalogue (#257)', () => {
	it('les 2 leçons : math / math-donnees / CM1-only / saisie text (exerciseKind undefined)', () => {
		for (const id of [BARRES, TABLEAU]) {
			const l = getLessonById(id);
			expect(l, `leçon ${id}`).toBeDefined();
			expect(l!.subject).toBe('math');
			expect(l!.category).toBe('math-donnees');
			expect(l!.levels).toEqual(['cm1']);
			// Ce sont de simples `text` + figure : PAS de runner dédié.
			expect(l!.exerciseType.exerciseKind).toBeUndefined();
			expect(l!.exerciseType.levels).toEqual(['cm1']);
		}
	});

	it('présentes dans ORDRE_LECONS.math.cm1 (sinon jamais en leçon du jour)', () => {
		const ordre = ORDRE_LECONS.math.cm1 ?? [];
		expect(ordre).toContain(BARRES);
		expect(ordre).toContain(TABLEAU);
	});

	it('getLessonsByCategory(math-donnees) : 2 leçons en CM1, 0 en CE2', () => {
		const cm1 = getLessonsByCategory('math-donnees', 'cm1').map((l) => l.id);
		expect(new Set(cm1)).toEqual(new Set([BARRES, TABLEAU]));
		expect(cm1.length).toBe(2);
		expect(getLessonsByCategory('math-donnees', 'ce2')).toEqual([]);
	});

	it('les 2 leçons sont exclues du sprint (lecture figure + énoncé, incompatible chrono)', () => {
		expect(getLessonById(BARRES)!.excludeFromSprint).toBe(true);
		expect(getLessonById(TABLEAU)!.excludeFromSprint).toBe(true);
	});

	it('consigne de LEÇON définie, propre à chaque leçon, distincte de la question par item', () => {
		const cB = getLessonById(BARRES)!.exerciseType.consigne;
		const cT = getLessonById(TABLEAU)!.exerciseType.consigne;
		// Texte exact (dérivé de l'intention : nommer la tâche « lire la figure »).
		expect(cB).toBe('Lis le diagramme en barres et réponds à la question.');
		expect(cT).toBe('Lis le tableau et réponds à la question.');
		expect(cB).toBeTruthy();
		expect(cT).toBeTruthy();
		expect(cB).not.toBe(cT); // distincte entre les deux leçons
		// Niveau LEÇON ≠ niveau ITEM : la consigne de leçon n'est PAS la question « Combien … ? ».
		expect(cB).not.toMatch(/Combien/);
		expect(cT).not.toMatch(/Combien/);
	});
});

/* =========================================================================
   4. GÉNÉRATEUR — DIAGRAMME EN BARRES (échantillon)
   ========================================================================= */

describe('Générateur donnees-barres-lire (échantillon)', () => {
	it('axe régulier, 4-6 barres, sommets pile sur une graduation, réponse = barre interrogée', () => {
		for (let i = 0; i < 400; i++) {
			const ex = genText(BARRES);
			expect(ex.figure).toBeTruthy();
			const svg = ex.figure!;

			// --- Axe : régulier, pas ∈ {1,2,5,10}, petites valeurs (< ~50). ---
			const grads = graduationsLues(svg);
			expect(grads[0]).toBe(0);
			const pas = grads[1] - grads[0];
			expect([1, 2, 5, 10]).toContain(pas);
			for (let k = 1; k < grads.length; k++) expect(grads[k] - grads[k - 1]).toBe(pas);
			const max = grads[grads.length - 1];
			expect(max).toBeGreaterThanOrEqual(5);
			expect(max).toBeLessThanOrEqual(50);
			// Repère ni trop dense ni trop épars : 4 à 6 crans au-dessus de 0 (= max/pas), sur
			// toutes les échelles arrêtées (pas 1→[5,6], 2→[8,10,12], 5→[20,25,30], 10→[40,50]).
			const nGradPos = grads.length - 1;
			expect(nGradPos).toBeGreaterThanOrEqual(4);
			expect(nGradPos).toBeLessThanOrEqual(6);

			// --- Barres : 4 à 6, chacune multiple du pas dans (0, max]. ---
			const nBarres = (svg.match(/<path/g) ?? []).length;
			expect(nBarres).toBeGreaterThanOrEqual(4);
			expect(nBarres).toBeLessThanOrEqual(6);
			const vals = valeursBarresLues(svg, max);
			expect(vals.length).toBe(nBarres);
			for (const v of vals) {
				expect(v).toBeGreaterThan(0);
				expect(v).toBeLessThanOrEqual(max);
				expect(v % pas).toBe(0); // sommet PILE sur une graduation
				expect(grads).toContain(v);
			}
			// Diagramme JAMAIS plat : au moins deux hauteurs distinctes.
			expect(new Set(vals).size).toBeGreaterThanOrEqual(2);

			// --- Réponse = hauteur de la barre interrogée, et c'est une graduation. ---
			const rep = Number(ex.answer);
			expect(grads).toContain(rep);
			expect(vals).toContain(rep);

			// Le prénom interrogé (fin de consigne) est affiché comme catégorie.
			const prenom = ex.question.match(/ a (\S+) \?/)?.[1];
			expect(prenom).toBeTruthy();
			expect(textesSvg(svg)).toContain(prenom);

			// Texte lu = consigne (sans le marqueur de saisie « @ »).
			expect(ex.question).toBe(`${ex.parle} @`);
		}
	});

	it('le <desc> ne fuit jamais la valeur à lire : numéros ⊆ {n, 0, max, pas}', () => {
		for (let i = 0; i < 400; i++) {
			const ex = genText(BARRES);
			const svg = ex.figure!;
			const grads = graduationsLues(svg);
			const pas = grads[1] - grads[0];
			const max = grads[grads.length - 1];
			const nBarres = (svg.match(/<path/g) ?? []).length;
			const desc = svg.match(/<desc>(.*?)<\/desc>/)?.[1] ?? '';
			const nums = new Set([...desc.matchAll(/\d+/g)].map((m) => Number(m[0])));
			// Seuls la structure (nombre de barres, 0, max, pas) apparaît.
			expect(nums).toEqual(new Set([nBarres, 0, max, pas]));
			// La réponse ne fuit pas, sauf coïncidence avec une valeur structurelle (ex. barre = max).
			const rep = Number(ex.answer);
			if (![nBarres, 0, max, pas].includes(rep)) expect(nums.has(rep)).toBe(false);
		}
	});
});

/* =========================================================================
   5. GÉNÉRATEUR — TABLEAU À DOUBLE ENTRÉE (échantillon)
   ========================================================================= */

describe('Générateur donnees-tableau-lire (échantillon)', () => {
	it('3-4 colonnes × 3-4 lignes, petites valeurs, réponse = cellule au croisement interrogé', () => {
		for (let i = 0; i < 400; i++) {
			const ex = genText(TABLEAU);
			expect(ex.figure).toBeTruthy();
			const table = parseTable(ex.figure!);

			expect((table.querySelector('caption')?.textContent ?? '').length).toBeGreaterThan(0);
			// Tableau HTML, pas une figure SVG.
			expect(ex.figure!).toContain('<table');
			expect(ex.figure!).not.toContain('role="img"');

			const cols = [...table.querySelectorAll('th[scope="col"]')].map((t) => t.textContent ?? '');
			const rows = [...table.querySelectorAll('th[scope="row"]')].map((t) => t.textContent ?? '');
			expect(cols.length).toBeGreaterThanOrEqual(3);
			expect(cols.length).toBeLessThanOrEqual(4);
			expect(rows.length).toBeGreaterThanOrEqual(3);
			expect(rows.length).toBeLessThanOrEqual(4);
			// Prénoms de lignes distincts (aucun doublon).
			expect(new Set(rows).size).toBe(rows.length);

			const bodyRows = [...table.querySelectorAll('tbody tr')];
			expect(bodyRows.length).toBe(rows.length);
			const allTd = [...table.querySelectorAll('tbody td')];
			expect(allTd.length).toBe(rows.length * cols.length);
			for (const td of allTd) {
				const v = Number(td.textContent);
				expect(Number.isInteger(v)).toBe(true);
				expect(v).toBeGreaterThanOrEqual(1);
				expect(v).toBeLessThanOrEqual(15);
			}

			// Croisement interrogé (objet × prénom lus dans la consigne) = réponse affichée.
			// La consigne est la question SANS le marqueur de saisie « @ » final. « de » s'élide
			// en « d' » devant un objet à initiale vocalique (« d'albums ») — le groupe capturé
			// est l'objet SANS son article.
			const consigne = ex.question.replace(/ @$/, '');
			const m = consigne.match(/^Combien d(?:e |')(.+?) pour (\S+) \?$/);
			expect(m, consigne).toBeTruthy();
			const [, objet, prenom] = m!;
			const colIdx = cols.findIndex((c) => c.toLowerCase() === objet.toLowerCase());
			const rowIdx = rows.findIndex((r) => r === prenom);
			expect(colIdx).toBeGreaterThanOrEqual(0);
			expect(rowIdx).toBeGreaterThanOrEqual(0);
			const tds = [...bodyRows[rowIdx].querySelectorAll('td')];
			expect(Number(tds[colIdx].textContent)).toBe(Number(ex.answer));

			expect(ex.question).toBe(`${ex.parle} @`);
		}
	});
});

/* =========================================================================
   6. ÉLISION « de » → « d' » DEVANT VOYELLE (échantillon déterministe)
   ========================================================================= */

describe('Élision de l’article devant l’objet', () => {
	// Ensembles OBSERVÉS collectés sur une plage de graines FIXE (withSeed → reproductible),
	// pour une couverture déterministe des cas vocaliques ET consonantiques.
	it('barres : titre « Nombre … » et consigne « Combien … » suivent la règle d’élision', () => {
		const titres = new Set<string>();
		const articlesObjets = new Set<string>(); // ex. « d'images », « de billes »
		for (let seed = 1; seed <= 600; seed++) {
			const ex = withSeed(seed, () => genText(BARRES));
			const svg = ex.figure!;

			// Titre de l'axe : « Nombre {article}{objet} ».
			const titre = textesSvg(svg).find((t) => t.startsWith('Nombre'));
			expect(titre, 'titre d’axe').toBeTruthy();
			const mT = titre!.match(/^Nombre (d'|de )(.+)$/);
			expect(mT, titre).toBeTruthy();
			const [, artT, objT] = mT!;
			expect(artT, `titre « ${titre} »`).toBe(articleAttendu(objT));
			titres.add(titre!);

			// Consigne : « Combien {article}{objet} a {prénom} ? ».
			const consigne = ex.question.replace(/ @$/, '');
			const mC = consigne.match(/^Combien (d'|de )(.+?) a (\S+) \?$/);
			expect(mC, consigne).toBeTruthy();
			const [, artC, objC] = mC!;
			expect(objC, 'même objet dans titre et consigne').toBe(objT);
			expect(artC, `consigne « ${consigne} »`).toBe(articleAttendu(objC));
			articlesObjets.add(`${artC}${objC}`);
		}
		// Les cas vocaliques élident RÉELLEMENT (« d'… »), les consonantiques gardent « de … ».
		expect(titres).toContain("Nombre d'images");
		expect(titres).toContain("Nombre d'autocollants");
		expect(titres).toContain('Nombre de billes');
		expect(articlesObjets).toContain("d'images");
		expect(articlesObjets).toContain("d'autocollants");
		expect(articlesObjets).toContain('de billes');
	});

	it('tableau : consigne « Combien … pour … » élide « d’albums », garde « de … » sinon', () => {
		const articlesObjets = new Set<string>();
		for (let seed = 1; seed <= 600; seed++) {
			const ex = withSeed(seed, () => genText(TABLEAU));
			const consigne = ex.question.replace(/ @$/, '');
			const m = consigne.match(/^Combien (d'|de )(.+?) pour (\S+) \?$/);
			expect(m, consigne).toBeTruthy();
			const [, art, objet] = m!;
			expect(art, `consigne « ${consigne} »`).toBe(articleAttendu(objet));
			articlesObjets.add(`${art}${objet}`);
		}
		// « albums » est le seul objet vocalique des thèmes ; « yaourts » (y) NE s'élide pas.
		expect(articlesObjets).toContain("d'albums");
		expect([...articlesObjets].some((s) => s.startsWith('de '))).toBe(true);
		expect([...articlesObjets].some((s) => s.startsWith("d'") && s !== "d'albums")).toBe(false);
	});
});

/* =========================================================================
   7. DÉTERMINISME + REPLI CATALOGUE
   ========================================================================= */

describe('Déterminisme et variété du tirage', () => {
	for (const id of [BARRES, TABLEAU]) {
		it(`${id} : même graine ⇒ exercice identique`, () => {
			for (const seed of [1, 7, 42, 256, 2024]) {
				const a = withSeed(seed, () => typeDe(id).generate({ level: 'cm1' }));
				const b = withSeed(seed, () => typeDe(id).generate({ level: 'cm1' }));
				expect(b).toEqual(a);
			}
		});

		it(`${id} : générateur non figé ⇒ des graines variées donnent des tirages variés`, () => {
			const vus = new Set<string>();
			for (let seed = 1; seed <= 30; seed++) {
				const ex = withSeed(seed, () => genText(id));
				vus.add(`${ex.question}|${ex.answer}`);
			}
			expect(vus.size).toBeGreaterThan(1);
		});
	}
});

describe('Repli catalogue (genLessonItem)', () => {
	for (const id of [BARRES, TABLEAU]) {
		it(`${id} : item num + figure, bonne réponse acceptée, nombre voisin refusé`, () => {
			const lesson = getLessonById(id)!;
			for (const seed of [1, 5, 17, 99, 314, 777]) {
				// Même graine : l'item du repli et l'exercice sous-jacent s'alignent.
				const ex = withSeed(seed, () => genText(id));
				const item = withSeed(seed, () => genLessonItem(lesson, 'cm1'));

				expect(item.kind).toBe('num');
				expect(item.answer).toBe(ex.answer);
				expect(item.figure).toBeTruthy();
				// « de » ou « d' » selon l'objet (élision devant voyelle).
				expect(item.text).toMatch(/Combien d[e']/);

				expect(checkItemAnswer(item, String(item.answer))).toBe(true);
				// Un nombre voisin (réponse + 1) est refusé.
				expect(checkItemAnswer(item, String(Number(item.answer) + 1))).toBe(false);
			}
		});
	}
});
