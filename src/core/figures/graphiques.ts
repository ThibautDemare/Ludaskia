/* ---------- Organisation et gestion de données (#257 — LIRE un graphique / tableau) ----------
   Deux renderers GÉNÉRIQUES et agnostiques de la matière, pour LIRE une donnée :
   - `renderDiagrammeBarres` : diagramme en barres SVG, bâti sur `svgCanvas` (socle
     accessible `role="img"` + `<title>`/`<desc>`). L'axe vertical est GRADUÉ et étiqueté
     (pas régulier ∈ {1, 2, 5, 10}) ; les sommets de barres tombent TOUJOURS pile sur une
     graduation (aucune interpolation). On N'ÉCRIT PAS la valeur sur/au-dessus des barres :
     la compétence testée est de LIRE la hauteur sur l'axe (sinon l'exercice ne teste rien).
   - `renderTableauDonnees` : tableau à double entrée en `<table>` HTML SÉMANTIQUE (caption,
     `<th scope="col">`/`<th scope="row">`, `<td>`). Pas de SVG : le lecteur d'écran navigue
     cellule par cellule gratuitement (précédent : `renderDroiteGradueeInteractif` ne passe
     pas non plus par `svgCanvas`). C'est le slot `figure` (string de markup) qui l'accueille.

   Modèle de rendu ARRÊTÉ (avis designer + pédagogue, #257) :
   - repère visuel léger (fines lignes horizontales `var(--line)` aux graduations) pour tracer
     le sommet jusqu'à l'axe → lecture ÉQUITABLE ;
   - 4 à 6 barres, épaisseur ≈ 62 % du pas horizontal, coins hauts arrondis, remplissage
     `SHAPE_FILL` (`--accent-soft` + contour `--accent`) uniforme (pas de teinte catégorielle :
     on distingue les barres par leur ÉTIQUETTE, pas par une couleur) ;
   - étiquettes de catégories SOUS les barres, horizontales, courtes, en `var(--ink)` sur fond
     papier (jamais de texte blanc dans une forme remplie ; jamais de rouge/vert catégoriel qui
     entrerait en collision avec le feedback correct/incorrect) ;
   - titre + unité toujours visibles (ex. « Nombre de billes ») ; police plancher 16 px.
   Tokens `var(--…)` uniquement, aucune couleur en dur. */
import { type Attrs, attrs, line, r2, svgCanvas, text } from './primitives';
import { escapeHTML } from '../utils';

/* ---------- Géométrie du diagramme en barres (unités viewBox), FIXE et partagée ----------
   viewBox 320×200 (lecture HORIZONTALE, comme la droite graduée) : élargi vs les figures
   carrées, `max-width` géré en CSS (`.figure-graphique-barres`). */
const GB_W = 320; // largeur viewBox
const GB_H = 200; // hauteur viewBox
const GB_TITLE_Y = 20; // ligne de base du titre (haut)
const GB_PLOT_TOP = 38; // ordonnée de la graduation MAX (haut de la zone traçable)
const GB_BASELINE = 160; // ordonnée du 0 (axe horizontal)
// Hauteur utile 122 → à 6 graduations (échelle la plus dense), l'espacement vertical vaut
// ~20,3 unités de viewBox : étiquettes de graduation (police 16) lisibles sans chevauchement.
const GB_AXIS_X = 40; // abscisse de l'axe vertical (après les étiquettes de graduation)
const GB_RIGHT = 308; // abscisse de fin de la zone traçable
const GB_LABEL_Y = GB_BASELINE + 20; // ligne de base des étiquettes de catégories (sous l'axe)
const GB_TICK_LABEL_X = 33; // ancre (fin) des étiquettes chiffrées de l'axe vertical
const GB_BAR_RATIO = 0.62; // épaisseur de barre / largeur d'un emplacement (≈ 60-70 %)
const GB_BAR_RADIUS = 5; // rayon des coins HAUTS de la barre (rx 4-6)

const GB_PLOT_H = GB_BASELINE - GB_PLOT_TOP; // hauteur utile (unités de valeur → viewBox)
const GB_PLOT_W = GB_RIGHT - GB_AXIS_X; // largeur utile (répartie entre les barres)

/** Une barre : sa catégorie (étiquette courte affichée SOUS la barre) + sa valeur (entière,
    multiple du pas, donc pile sur une graduation). */
export interface BarreDonnee {
	label: string;
	valeur: number;
}

/** Description d'un diagramme en barres à LIRE. `max` = valeur de la graduation la plus
    haute (multiple de `pas`, ≥ toutes les barres) ; `pas` ∈ {1, 2, 5, 10}. `desc` : a11y —
    JAMAIS la valeur d'une barre (hauteur à lire), généré par défaut si absent. */
export interface DiagrammeBarresSpec {
	titre: string; // titre + unité, ex. « Nombre de billes »
	barres: BarreDonnee[]; // 4 à 6
	pas: number;
	max: number;
	desc?: string;
}

/* ---------- Helpers géométriques PURS (réutilisés par les tests) ---------- */

/** Liste ordonnée des valeurs de graduation de l'axe vertical (0, pas, 2·pas, …, max). */
export function graduationsAxe(max: number, pas: number): number[] {
	const n = Math.round(max / pas);
	return Array.from({ length: n + 1 }, (_, i) => i * pas);
}

/** Ordonnée viewBox d'une valeur sur l'axe vertical (0 → baseline, max → haut du tracé). */
export function yDeValeur(valeur: number, max: number): number {
	return GB_BASELINE - (valeur / max) * GB_PLOT_H;
}

/** Emplacement horizontal de la barre d'index `i` parmi `n` : centre + largeur de barre. */
export function emplacementBarre(i: number, n: number): { centre: number; largeur: number } {
	const slot = GB_PLOT_W / n;
	return { centre: GB_AXIS_X + slot * (i + 0.5), largeur: slot * GB_BAR_RATIO };
}

/** Géométrie exposée (tests). */
export const GRAPHIQUE_GEOM = {
	W: GB_W,
	H: GB_H,
	axisX: GB_AXIS_X,
	baseline: GB_BASELINE,
	plotTop: GB_PLOT_TOP,
	right: GB_RIGHT,
} as const;

/* ---------- Fragments de tracé ---------- */

const GB_AXE_ATTRS: Attrs = {
	stroke: 'var(--ink)',
	'stroke-width': 2.5,
	'stroke-linecap': 'round',
};
const GB_GRID_ATTRS: Attrs = {
	stroke: 'var(--line)',
	'stroke-width': 1,
};
const GB_TITLE_ATTRS: Attrs = {
	'text-anchor': 'middle',
	'font-family': 'var(--ui)',
	'font-weight': 700,
	'font-size': 16,
	fill: 'var(--ink)',
};
const GB_TICK_ATTRS: Attrs = {
	'text-anchor': 'end',
	'font-family': 'var(--ui)',
	'font-weight': 700,
	'font-size': 16, // plancher (ne pas descendre, avis designer)
	fill: 'var(--ink)',
};
const GB_CAT_ATTRS: Attrs = {
	'text-anchor': 'middle',
	'font-family': 'var(--ui)',
	'font-weight': 700,
	'font-size': 16,
	fill: 'var(--ink)',
};
const GB_BAR_ATTRS: Attrs = {
	fill: 'var(--accent-soft)',
	stroke: 'var(--accent)',
	'stroke-width': 2.5,
	'stroke-linejoin': 'round',
};

/** Chemin d'une barre à coins HAUTS arrondis (base carrée posée sur l'axe) : la barre monte
    de la baseline (y+h) jusqu'à son sommet (y), rayon `r` sur les deux coins supérieurs. */
function barrePath(x: number, y: number, w: number, h: number, r: number): string {
	const rr = Math.min(r, w / 2, h);
	return (
		`<path d="M ${r2(x)} ${r2(y + h)} L ${r2(x)} ${r2(y + rr)} ` +
		`Q ${r2(x)} ${r2(y)} ${r2(x + rr)} ${r2(y)} ` +
		`L ${r2(x + w - rr)} ${r2(y)} Q ${r2(x + w)} ${r2(y)} ${r2(x + w)} ${r2(y + rr)} ` +
		`L ${r2(x + w)} ${r2(y + h)} Z" ${attrs(GB_BAR_ATTRS)} />`
	);
}

/** Description a11y par défaut : STRUCTURE seulement (catégories, échelle, pas), JAMAIS la
    valeur d'une barre — la hauteur reste à lire (convention `droite.ts`, accessibilite.md §7). */
function descParDefaut(spec: DiagrammeBarresSpec): string {
	const cats = spec.barres.map((b) => b.label).join(', ');
	return (
		`Diagramme en barres : ${spec.titre}. Il y a ${spec.barres.length} barres (${cats}). ` +
		`L'axe vertical est gradué de 0 à ${spec.max}, de ${spec.pas} en ${spec.pas}.`
	);
}

/** Diagramme en barres STATIQUE `role="img"` : titre, axe vertical gradué + lignes de repère,
    barres (sommet PILE sur une graduation), étiquettes de catégories sous l'axe. */
export function renderDiagrammeBarres(spec: DiagrammeBarresSpec): string {
	const { titre, barres, pas, max } = spec;
	const parts: string[] = [text(GB_W / 2, GB_TITLE_Y, titre, GB_TITLE_ATTRS)];
	// Lignes de repère + étiquettes chiffrées à chaque graduation (repère de lecture léger).
	for (const g of graduationsAxe(max, pas)) {
		const y = yDeValeur(g, max);
		parts.push(line(GB_AXIS_X, r2(y), GB_RIGHT, r2(y), GB_GRID_ATTRS));
		parts.push(text(GB_TICK_LABEL_X, r2(y + 5), String(g), GB_TICK_ATTRS));
	}
	// Barres (dessinées AVANT les axes pour que le contour de l'axe reste net par-dessus).
	barres.forEach((b, i) => {
		const { centre, largeur } = emplacementBarre(i, barres.length);
		const y = yDeValeur(b.valeur, max);
		parts.push(barrePath(centre - largeur / 2, y, largeur, GB_BASELINE - y, GB_BAR_RADIUS));
		parts.push(text(r2(centre), GB_LABEL_Y, b.label, GB_CAT_ATTRS));
	});
	// Axes (vertical + baseline) par-dessus les barres.
	parts.push(line(GB_AXIS_X, GB_PLOT_TOP, GB_AXIS_X, GB_BASELINE, GB_AXE_ATTRS));
	parts.push(line(GB_AXIS_X, GB_BASELINE, GB_RIGHT, GB_BASELINE, GB_AXE_ATTRS));
	return svgCanvas(
		GB_W,
		GB_H,
		`Diagramme en barres : ${titre}`,
		spec.desc ?? descParDefaut(spec),
		parts.join(''),
		'figure-graphique-barres',
	);
}

/* ---------- Tableau à double entrée (HTML sémantique) ---------- */

/** Une ligne du tableau : son en-tête (`<th scope="row">`) + une valeur par colonne. */
export interface LigneTableau {
	entete: string;
	valeurs: number[]; // aligné sur `colonnes`
}

/** Description d'un tableau à double entrée à LIRE. `coinLabel` nomme la dimension des lignes
    (cellule coin en haut à gauche, ex. « Élève ») ; `caption` titre le tableau. */
export interface TableauDonneesSpec {
	caption: string;
	colonnes: string[]; // en-têtes de colonnes (3-4)
	lignes: LigneTableau[]; // 3-4 lignes
	coinLabel?: string;
}

/** Tableau à double entrée en `<table>` HTML SÉMANTIQUE : `<caption>`, en-têtes de colonnes
    `<th scope="col">`, en-têtes de lignes `<th scope="row">`, données `<td>`. Le lecteur
    d'écran restitue chaque cellule avec ses en-têtes → lecture croisée gratuite. */
export function renderTableauDonnees(spec: TableauDonneesSpec): string {
	const coin = `<td class="tableau-donnees-coin">${escapeHTML(spec.coinLabel ?? '')}</td>`;
	const entetesCol = spec.colonnes.map((c) => `<th scope="col">${escapeHTML(c)}</th>`).join('');
	const corps = spec.lignes
		.map((l) => {
			const cellules = l.valeurs.map((v) => `<td>${escapeHTML(String(v))}</td>`).join('');
			return `<tr><th scope="row">${escapeHTML(l.entete)}</th>${cellules}</tr>`;
		})
		.join('');
	return (
		`<table class="figure-tableau-donnees">` +
		`<caption>${escapeHTML(spec.caption)}</caption>` +
		`<thead><tr>${coin}${entetesCol}</tr></thead>` +
		`<tbody>${corps}</tbody>` +
		`</table>`
	);
}
