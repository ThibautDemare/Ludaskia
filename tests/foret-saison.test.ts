/* ============================================================
   #785 — La forêt du pied de page en décembre : des sapins enneigés (critères 35 à 41,
   commentaires du 12/11/2026 sur l'issue), la forêt de l'année inchangée le reste du temps
   (critère 34). Logique pure : QUEL fichier pour quelle date (`fichierForet`), et ce que le
   générateur produit (`composeForest`). Le rendu (sapins à l'écran, balancement figé, guide
   du critère 37) est joué par `e2e/decor-noel-foret.spec.ts`.

   Attendus dérivés des critères, pas du générateur :
   - critère 35 : du 1er au 31 décembre, à l'heure LOCALE, forêt de sapins enneigés ; sinon
     la forêt habituelle. Jugé sur le CONTENU du fichier que désigne `fichierForet`, pas sur
     son nom ;
   - critère 36 : chaque sapin se balance comme un arbre habituel, donc dans un groupe
     `sway` (la classe que vise l'animation « vent » de `foret.scss`), et il y en a autant
     que d'arbres habituels ;
   - critère 38 : le fichier de décembre ne pèse pas plus lourd que celui de l'année ;
   - critère 39 (réécrit) : sur les sapins, rien d'autre que de la neige et des guirlandes
     de boules, donc ni fruit ni étoile. Témoin : les couleurs cherchées sont bien celles des
     fruits et de l'étincelle de la forêt de l'année, qui les porte ;
   - critère 40 : au moins un sapin sur cinq (⌈n/5⌉), au plus un sur deux (⌊n/2⌋) portent
     une guirlande : un `<g class="guirlande">` (un fil `fill="none"`, au moins une boule)
     DANS le groupe `sway` de son sapin, donc balancé et figé avec lui (le figer se joue en
     e2e). Témoin : la forêt de l'année n'en porte aucune ;
   - critère 41 : le bord du bas de chaque étage (tracé `M sommet Q … coin gauche … coin
     droit Q … sommet Z`, ombre portée comprise) ne sort pas de l'intervalle horizontal
     entre ses deux coins, qu'il soit fait de ronds de la même couleur que le tracé ou
     d'arcs du tracé lui-même. Étendue des arcs calculée, pas déduite de leurs drapeaux ;
   - critère 34 : les fichiers servis sont exactement la sortie du générateur, avec les
     paramètres de `npm run forest:gen` (lus dans package.json, pas recopiés). Un fichier
     régénéré sans être commité, ou un générateur modifié sans régénérer, fait échouer.
   - critère 33 : aucun test ne lit la date du jour (horloge figée en juillet).
   ============================================================ */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fichierForet } from '../src/core/decor-saison';
import { composeForest } from '../tools/forest/generate-forest.mjs';

/* ============================================================
   Contrôles : partagés par le vrai décor et par les cas fabriqués du bas du fichier, qui
   prouvent qu'ils savent échouer.
   ============================================================ */

/** Fins de ligne normalisées, sans le saut de ligne final qu'écrit le générateur. */
const normalise = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\n+$/, '');

/** '' si identiques ; sinon le premier écart, avec un peu de contexte (un diff complet de
 *  400 Ko serait illisible). */
function premierEcart(attendu: string, obtenu: string): string {
	if (attendu === obtenu) return '';
	let i = 0;
	while (i < attendu.length && i < obtenu.length && attendu[i] === obtenu[i]) i++;
	const autour = (s: string): string => JSON.stringify(s.slice(Math.max(0, i - 30), i + 30));
	return (
		`premier écart au caractère ${i} (longueurs ${attendu.length} / ${obtenu.length}) : ` +
		`attendu ${autour(attendu)}, obtenu ${autour(obtenu)}`
	);
}

/** Classes de la balise RACINE. Un document qui ne commence pas par `<svg` lève. */
function classesRacine(svg: string): string[] {
	const racine = /^\s*<svg\b[^>]*>/.exec(svg);
	if (!racine) throw new Error(`pas de balise <svg> en tête : ${svg.slice(0, 40)}`);
	const attribut = /\sclass="([^"]*)"/.exec(racine[0]);
	return attribut ? attribut[1].split(/\s+/).filter((c) => c !== '') : [];
}

/** Contenu de chaque `<g>` dont la classe compte `nom`, jusqu'à SA balise fermante : un
 *  sapin contient lui-même des `<g>`, s'arrêter au premier `</g>` couperait l'arbre. */
function groupesDeClasse(svg: string, nom: string): string[] {
	const groupes: string[] = [];
	const ouverture = /<g\b[^>]*>/g;
	for (let o = ouverture.exec(svg); o; o = ouverture.exec(svg)) {
		const classe = /\sclass="([^"]*)"/.exec(o[0]);
		if (!classe || !classe[1].split(/\s+/).includes(nom)) continue;
		if (o[0].endsWith('/>')) {
			groupes.push('');
			continue;
		}
		const debut = o.index + o[0].length;
		const balise = /<g\b[^>]*>|<\/g\s*>/g;
		balise.lastIndex = debut;
		let profondeur = 1;
		let fin = -1;
		for (let b = balise.exec(svg); b; b = balise.exec(svg)) {
			if (b[0].startsWith('</')) profondeur--;
			else if (!b[0].endsWith('/>')) profondeur++;
			if (profondeur === 0) {
				fin = b.index;
				break;
			}
		}
		if (fin < 0) throw new Error(`groupe ${nom} non refermé (caractère ${o.index})`);
		groupes.push(svg.slice(debut, fin));
	}
	return groupes;
}
const groupesSway = (svg: string): string[] => groupesDeClasse(svg, 'sway');

type Rvb = readonly [number, number, number];

/** Couleur d'un `fill` : `#rgb`, `#rrggbb` ou `hsl(t s% l%)`. Autre chose (`url(…)`,
 *  `none`) : `null`. */
function couleur(valeur: string): Rvb | null {
	const v = valeur.trim().toLowerCase();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
	if (hex) {
		const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
		const canal = (k: number): number => parseInt(h.slice(k, k + 2), 16);
		return [canal(0), canal(2), canal(4)];
	}
	const hsl = /^hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/.exec(v);
	if (hsl) {
		const [t, s, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100];
		const a = s * Math.min(l, 1 - l);
		const canal = (n: number): number => {
			const k = (n + t / 30) % 12;
			return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
		};
		return [canal(0), canal(8), canal(4)];
	}
	return null;
}

/** Neige : un remplissage blanc à peine teinté, chaque canal à 224 (0xE0) au moins. */
const SEUIL_NEIGE = 224;
const porteDeLaNeige = (fragment: string): boolean =>
	[...fragment.matchAll(/\sfill="([^"]*)"/g)].some((m) => {
		const c = couleur(m[1]);
		return c !== null && Math.min(...c) >= SEUIL_NEIGE;
	});

/** Couleurs des fruits et de l'étincelle (étoile) de la forêt de l'année. */
const COULEURS_FRUITS = ['#d8392b', '#e2632a', '#e8a21d', '#e0b020', '#8a5bc0'] as const;
const ETINCELLE = '#ffe9a0';
const decorations = (svg: string): string[] => {
	const bas = svg.toLowerCase();
	return [...COULEURS_FRUITS, ETINCELLE].filter((c) => bas.includes(c));
};

/** Écarts à « forêt de sapins enneigés » (critères 35, 36, 39) ; vide si c'en est une. */
function ecartsSapins(svg: string): string[] {
	const ecarts: string[] = [];
	if (!classesRacine(svg).includes('foret-noel')) ecarts.push('racine sans la classe foret-noel');
	const arbres = groupesSway(svg);
	if (arbres.length === 0) ecarts.push('aucun arbre qui se balance');
	arbres.forEach((a, i) => {
		if (!porteDeLaNeige(a)) ecarts.push(`arbre ${i + 1} sans neige`);
	});
	for (const c of decorations(svg)) ecarts.push(`décoration ${c}`);
	return ecarts;
}

/** Poids en octets (UTF-8), fins de ligne normalisées. */
const octets = (s: string): number => new TextEncoder().encode(normalise(s)).length;
const pasPlusLourd = (noel: string, annee: string): boolean => octets(noel) <= octets(annee);

/** Pour un échec lisible sur des centaines d'écarts : leur nombre et les premiers. */
const resume = (ecarts: string[]): { nombre: number; premiers: string[] } => ({
	nombre: ecarts.length,
	premiers: ecarts.slice(0, 6),
});

/* ---------- Critère 40 : guirlandes de boules ---------- */

/** Bornes du critère 40 sur `n` sapins : au moins un sur cinq, au plus un sur deux. */
const bornesGuirlandes = (n: number): [number, number] => [Math.ceil(n / 5), Math.floor(n / 2)];

/** Écarts au critère 40 ; vide si le nombre de sapins porteurs est dans les bornes et si
 *  chaque guirlande est dans le groupe `sway` d'un sapin, avec un fil et des boules. */
function ecartsGuirlandes(svg: string): string[] {
	const ecarts: string[] = [];
	const sapins = groupesSway(svg);
	const parSapin = sapins.map((s) => groupesDeClasse(s, 'guirlande'));
	const horsSway = groupesDeClasse(svg, 'guirlande').length - parSapin.flat().length;
	if (horsSway !== 0) ecarts.push(`${horsSway} guirlande(s) hors d'un groupe sway`);
	const porteurs = parSapin.filter((g) => g.length > 0).length;
	const [min, max] = bornesGuirlandes(sapins.length);
	if (porteurs < min || porteurs > max)
		ecarts.push(
			`${porteurs} sapin(s) sur ${sapins.length} portent une guirlande, attendu de ${min} à ${max}`,
		);
	parSapin.forEach((guirlandes, i) => {
		for (const g of guirlandes) {
			if (!/<path\b[^>]*\sfill="none"/.test(g))
				ecarts.push(`sapin ${i + 1} : guirlande sans fil (<path fill="none">)`);
			if (!/<circle\b/.test(g)) ecarts.push(`sapin ${i + 1} : guirlande sans boule`);
		}
	});
	return ecarts;
}

/* ---------- Critère 41 : le bord du bas reste entre les deux coins de son étage ----------
   Contrat de balisage : un étage est un `<path>` rempli dont le tracé commence par
   `M sommet Q contrôle coinGauche` et finit par `Q contrôle sommet Z` ; le coin droit est
   le point courant juste avant cette dernière `Q`. Son bord du bas : les segments entre
   les deux coins (des arcs `A`, par exemple), et les ronds de la même couleur que le
   tracé. L'ombre portée est un étage comme un autre, avec sa couleur et ses coins. */

interface Point {
	x: number;
	y: number;
}
/** Un segment de tracé, en coordonnées absolues, et des points qui le suivent (assez
 *  serrés pour en lire l'étendue au centième près). */
interface Segment {
	type: string;
	vers: Point;
	trace: Point[];
}

/** Arrondi d'écriture : chaque nombre est écrit au dixième. Un rond tangent au coin
 *  (centre = coin + rayon) arrondi en trois valeurs (centre, rayon, coin) peut sortir de
 *  trois demi-dixièmes au pire, mais l'écart, fait de valeurs au dixième, est lui-même un
 *  multiple du dixième : un dixième au plus. Le millionième absorbe le calcul flottant. */
const TOLERANCE = 0.1 + 1e-6;
const PAS = 48;
const dixieme = (v: number): string => v.toFixed(1);

/** Commandes d'un attribut `d`, nombres groupés derrière leur lettre. */
function commandes(d: string): { lettre: string; nombres: number[] }[] {
	const liste: { lettre: string; nombres: number[] }[] = [];
	for (const jeton of d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []) {
		if (/^[A-Za-z]$/.test(jeton)) liste.push({ lettre: jeton, nombres: [] });
		else if (liste.length === 0) throw new Error(`tracé sans commande en tête : ${d.slice(0, 30)}`);
		else liste[liste.length - 1].nombres.push(Number(jeton));
	}
	return liste;
}

const interpole = (p: Point, q: Point, t: number): Point => ({
	x: p.x + (q.x - p.x) * t,
	y: p.y + (q.y - p.y) * t,
});

/** Point d'une courbe de Bézier (de Casteljau), quel que soit son degré. */
function pointBezier(controles: readonly Point[], t: number): Point {
	let points = controles;
	while (points.length > 1) {
		const suivants: Point[] = [];
		for (let j = 1; j < points.length; j++) suivants.push(interpole(points[j - 1], points[j], t));
		points = suivants;
	}
	return points[0];
}

interface Arc {
	rx: number;
	ry: number;
	rotation: number;
	grand: boolean;
	sens: boolean;
}

/** Points d'un arc elliptique `A`, par sa paramétrisation au centre (spécification SVG,
 *  notes d'implémentation F.6.5 et F.6.6), rayons agrandis s'ils ne suffisent pas à
 *  joindre les deux extrémités. */
function pointsArc(de: Point, vers: Point, arc: Arc): Point[] {
	if (de.x === vers.x && de.y === vers.y) return [de];
	let rx = Math.abs(arc.rx);
	let ry = Math.abs(arc.ry);
	if (rx === 0 || ry === 0) return [de, vers];
	const phi = (arc.rotation * Math.PI) / 180;
	const cos = Math.cos(phi);
	const sin = Math.sin(phi);
	const dx = (de.x - vers.x) / 2;
	const dy = (de.y - vers.y) / 2;
	const x1 = cos * dx + sin * dy;
	const y1 = -sin * dx + cos * dy;
	const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}
	const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
	const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
	const k = (arc.grand !== arc.sens ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
	const cxp = (k * rx * y1) / ry;
	const cyp = (-k * ry * x1) / rx;
	const cx = cos * cxp - sin * cyp + (de.x + vers.x) / 2;
	const cy = sin * cxp + cos * cyp + (de.y + vers.y) / 2;
	const angle = (ux: number, uy: number, vx: number, vy: number): number =>
		Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
	const [ux, uy] = [(x1 - cxp) / rx, (y1 - cyp) / ry];
	const [vx, vy] = [(-x1 - cxp) / rx, (-y1 - cyp) / ry];
	const debut = angle(1, 0, ux, uy);
	let balayage = angle(ux, uy, vx, vy);
	if (!arc.sens && balayage > 0) balayage -= 2 * Math.PI;
	if (arc.sens && balayage < 0) balayage += 2 * Math.PI;
	return Array.from({ length: PAS + 1 }, (_, i) => {
		const t = debut + (balayage * i) / PAS;
		return {
			x: cx + rx * cos * Math.cos(t) - ry * sin * Math.sin(t),
			y: cy + rx * sin * Math.cos(t) + ry * cos * Math.sin(t),
		};
	});
}

/** Nombres lus par commande. Une commande absente (S, T) fait lever : un étage que le test
 *  ne saurait pas lire ne doit pas passer pour un étage sans débord. */
const NOMBRES_PAR_COMMANDE: Partial<Record<string, number>> = {
	M: 2,
	L: 2,
	H: 1,
	V: 1,
	Q: 4,
	C: 6,
	A: 7,
	Z: 0,
};

/** Un segment, depuis le point courant `de` ; `rel` est l'origine des coordonnées (le
 *  point courant pour une commande en minuscule). */
function segment(type: string, de: Point, n: readonly number[], rel: Point): Segment {
	const pt = (i: number): Point => ({ x: n[i] + rel.x, y: n[i + 1] + rel.y });
	switch (type) {
		case 'M':
			return { type, vers: pt(0), trace: [pt(0)] };
		case 'L':
			return { type, vers: pt(0), trace: [de, pt(0)] };
		case 'H':
		case 'V': {
			const vers = type === 'H' ? { x: n[0] + rel.x, y: de.y } : { x: de.x, y: n[0] + rel.y };
			return { type: 'L', vers, trace: [de, vers] };
		}
		case 'Q':
		case 'C': {
			const controles = [de];
			for (let i = 0; i < n.length; i += 2) controles.push(pt(i));
			const trace = Array.from({ length: PAS + 1 }, (_, i) => pointBezier(controles, i / PAS));
			return { type, vers: controles[controles.length - 1], trace };
		}
		default: {
			const vers = pt(5);
			const arc = { rx: n[0], ry: n[1], rotation: n[2], grand: n[3] !== 0, sens: n[4] !== 0 };
			return { type: 'A', vers, trace: pointsArc(de, vers, arc) };
		}
	}
}

/** Segments d'un attribut `d`, en coordonnées absolues. */
function segments(d: string): Segment[] {
	const liste: Segment[] = [];
	let courant: Point = { x: 0, y: 0 };
	let depart = courant;
	for (const { lettre, nombres } of commandes(d)) {
		const type = lettre.toUpperCase();
		const arite = NOMBRES_PAR_COMMANDE[type];
		if (arite === undefined) throw new Error(`commande « ${lettre} » non lue par ce test`);
		if (arite === 0) {
			liste.push({ type: 'Z', vers: depart, trace: [courant, depart] });
			courant = depart;
			continue;
		}
		if (nombres.length === 0 || nombres.length % arite !== 0)
			throw new Error(`commande « ${lettre} » suivie de ${nombres.length} nombres`);
		for (let k = 0; k < nombres.length; k += arite) {
			const rel = lettre === type ? { x: 0, y: 0 } : courant;
			// Des paires après un M sont des L (spécification SVG).
			const s = segment(
				type === 'M' && k > 0 ? 'L' : type,
				courant,
				nombres.slice(k, k + arite),
				rel,
			);
			if (s.type === 'M') depart = s.vers;
			liste.push(s);
			courant = s.vers;
		}
	}
	return liste;
}

interface Etage {
	fill: string;
	gauche: Point;
	droit: Point;
	bord: Segment[];
}

const confondus = (p: Point, q: Point): boolean =>
	Math.abs(p.x - q.x) < 0.05 && Math.abs(p.y - q.y) < 0.05;

/** L'étage que dessine ce tracé, ou `null` si ce n'en est pas un. La forme se reconnaît
 *  sur les lettres AVANT de lire les nombres : un tracé d'une autre forme (tronc, fil de
 *  guirlande) n'a pas à être lisible par ce test. */
function etage(d: string, fill: string | undefined): Etage | null {
	if (fill === undefined || fill.trim() === 'none') return null;
	const lettres = commandes(d).map((c) => c.lettre.toUpperCase());
	const n = lettres.length;
	if (n < 4 || lettres[0] !== 'M' || lettres[1] !== 'Q') return null;
	if (lettres[n - 2] !== 'Q' || lettres[n - 1] !== 'Z') return null;
	const s = segments(d);
	const m = s.length;
	if (s[1].type !== 'Q' || s[m - 2].type !== 'Q' || s.slice(1).some((x) => x.type === 'M'))
		return null;
	if (!confondus(s[m - 2].vers, s[0].vers)) return null;
	return { fill, gauche: s[1].vers, droit: s[m - 3].vers, bord: s.slice(2, m - 2) };
}

/** Attributs d'une balise, par nom. */
const attributs = (balise: string): Map<string, string> =>
	new Map(
		[...balise.matchAll(/\s([\w:-]+)="([^"]*)"/g)].map((a): [string, string] => [a[1], a[2]]),
	);
const balises = (fragment: string, nom: string): Map<string, string>[] =>
	[...fragment.matchAll(new RegExp(`<${nom}\\b[^>]*>`, 'g'))].map((b) => attributs(b[0]));

/** Même couleur, quelle que soit son écriture (`hsl(1 2% 3%)` ou `hsl(1, 2%, 3%)`). */
function memeCouleur(a: string, b: string): boolean {
	const [ca, cb] = [couleur(a), couleur(b)];
	if (ca === null || cb === null) return a.trim().toLowerCase() === b.trim().toLowerCase();
	return ca.every((canal, i) => Math.abs(canal - cb[i]) < 0.5);
}

interface Forme {
	nom: string;
	xMin: number;
	xMax: number;
	feston: boolean;
}

/** Chaque étage du sapin, avec les formes de son bord du bas et leur étendue horizontale. */
function bordsDuBas(sapin: string): { etage: Etage; formes: Forme[] }[] {
	const bords = balises(sapin, 'path').flatMap((p) => {
		const e = etage(p.get('d') ?? '', p.get('fill'));
		if (!e) return [];
		const formes = e.bord.map((s) => {
			const xs = s.trace.map((pt) => pt.x);
			return {
				nom: `segment ${s.type}`,
				xMin: Math.min(...xs),
				xMax: Math.max(...xs),
				feston: s.type !== 'L',
			};
		});
		return [{ etage: e, formes }];
	});
	for (const c of balises(sapin, 'circle')) {
		const fill = c.get('fill');
		if (fill === undefined) continue;
		const candidats = bords.flatMap((b, k) => (memeCouleur(b.etage.fill, fill) ? [k] : []));
		if (candidats.length === 0) continue;
		const [cx, cy, r] = [c.get('cx'), c.get('cy'), c.get('r')].map(Number);
		// Deux étages de la même couleur : le rond borde le bas de celui dont le bas est le
		// plus proche (un NaN, rond illisible, retombe sur le premier et y est jugé).
		const ecartAuBas = (k: number): number =>
			Math.abs(Math.max(bords[k].etage.gauche.y, bords[k].etage.droit.y) - cy);
		const k = candidats.reduce((a, b) => (ecartAuBas(b) < ecartAuBas(a) ? b : a));
		bords[k].formes.push({ nom: `rond cx ${cx} r ${r}`, xMin: cx - r, xMax: cx + r, feston: true });
	}
	return bords;
}

/** Écarts au critère 41 pour un sapin : `lecture` dit que le test serait à vide (aucun
 *  étage reconnu, un étage sans feston), `debords` liste les formes qui sortent. */
function ecartsBord(sapin: string): { lecture: string[]; debords: string[] } {
	const bords = bordsDuBas(sapin);
	const lecture = bords.length === 0 ? ['aucun étage reconnu (M sommet Q … Q … sommet Z)'] : [];
	const debords: string[] = [];
	bords.forEach(({ etage: e, formes }, k) => {
		const nom = `étage ${k + 1} (${e.fill}, coins x ${dixieme(e.gauche.x)} et ${dixieme(e.droit.x)})`;
		if (!formes.some((f) => f.feston)) lecture.push(`${nom} : bord du bas sans feston`);
		for (const f of formes)
			// Écrit en « tient », pas en « sort » : une étendue NaN (rond illisible) ne tient pas.
			if (!(f.xMin >= e.gauche.x - TOLERANCE && f.xMax <= e.droit.x + TOLERANCE))
				debords.push(`${nom} : ${f.nom}, de x ${dixieme(f.xMin)} à ${dixieme(f.xMax)}`);
	});
	return { lecture, debords };
}

const ecartsFestons = (svg: string): string[] =>
	groupesSway(svg).flatMap((sapin, i) => {
		const { lecture, debords } = ecartsBord(sapin);
		return [...lecture, ...debords].map((e) => `sapin ${i + 1} : ${e}`);
	});

/* ============================================================
   Paramètres réels : ceux de `npm run forest:gen`, lus dans package.json.
   ============================================================ */

interface Generation {
	graine: number;
	arbres: number;
	fichier: string;
	saison: string | undefined;
}

const paquet: { scripts: Record<string, string | undefined> } = JSON.parse(
	readFileSync('package.json', 'utf8'),
);
const GENERATIONS: Generation[] = [
	...(paquet.scripts['forest:gen'] ?? '').matchAll(
		/node tools\/forest\/generate-forest\.mjs (\d+) (\d+) (\S+)(?: (\w+))?/g,
	),
].map((m) => ({ graine: Number(m[1]), arbres: Number(m[2]), fichier: m[3], saison: m[4] }));

function generation(saison: 'noel' | undefined): Generation {
	const g = GENERATIONS.find((x) => x.saison === saison);
	if (!g) throw new Error(`forest:gen ne produit pas la forêt ${saison ?? "de l'année"}`);
	return g;
}
const genere = (g: Generation): string => normalise(composeForest(g.graine, g.arbres, g.saison));
const lirePublic = (nom: string): string => normalise(readFileSync(`public/${nom}`, 'utf8'));
const lireFichier = (chemin: string): string => normalise(readFileSync(chemin, 'utf8'));

/** Nombre d'arbres de la forêt habituelle (critère 36 : « comme les arbres habituels »). */
const ARBRES = 14;

describe('forest:gen — les paramètres réels du générateur', () => {
	it('garde contre un test à vide : deux générations lues, la forêt de l’année et celle de Noël', () => {
		expect(GENERATIONS.length, paquet.scripts['forest:gen']).toBe(2);
		expect(GENERATIONS.filter((g) => g.saison === undefined)).toHaveLength(1);
		expect(GENERATIONS.filter((g) => g.saison === 'noel')).toHaveLength(1);
		for (const g of GENERATIONS) {
			expect(Number.isInteger(g.graine), JSON.stringify(g)).toBe(true);
			expect(g.fichier, JSON.stringify(g)).toMatch(/^public\/[\w-]+\.svg$/);
		}
	});
});

/* ============================================================
   fichierForet — critère 35 : QUELLE forêt pour quelle date.
   Rejoué sous deux fuseaux de signes opposés (même raison que `decor-saison.test.ts`) :
   une confusion heure locale / UTC ne se voit que hors UTC, et la CI est en UTC.
   ============================================================ */

const FUSEAU_ORIGINE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const FUSEAUX: readonly { tz: string; decalageDecembre: number }[] = [
	{ tz: 'Europe/Paris', decalageDecembre: -60 },
	{ tz: 'America/New_York', decalageDecembre: 300 },
];

/** Dates construites à l'heure LOCALE, au moment où le fuseau est en place. */
const EN_DECEMBRE: readonly [string, () => Date][] = [
	['1er décembre à 0 h 00', () => new Date(2026, 11, 1, 0, 0)],
	['15 décembre à midi', () => new Date(2026, 11, 15, 12, 0)],
	['31 décembre à 23 h 59', () => new Date(2026, 11, 31, 23, 59)],
];
const HORS_DECEMBRE: readonly [string, () => Date][] = [
	['30 novembre à 23 h 59', () => new Date(2026, 10, 30, 23, 59)],
	['1er janvier à 0 h 00', () => new Date(2027, 0, 1, 0, 0)],
	['14 juillet à 10 h 00', () => new Date(2026, 6, 14, 10, 0)],
];

describe.each(FUSEAUX)('fichierForet — critère 35, fuseau $tz', ({ tz, decalageDecembre }) => {
	beforeAll(() => {
		process.env.TZ = tz;
		const obtenu = new Date(2026, 11, 1, 0, 0).getTimezoneOffset();
		if (obtenu !== decalageDecembre)
			throw new Error(
				`fuseau ${tz} non appliqué (décalage ${obtenu} au lieu de ${decalageDecembre}) : ` +
					'lancer Vitest avec le pool forks, sinon ces cas ne discriminent pas heure locale / UTC',
			);
	});
	afterAll(() => {
		process.env.TZ = FUSEAU_ORIGINE;
	});
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		// Juillet, loin de décembre : un code qui lirait l'horloge au lieu de la date reçue
		// ne trouverait pas Noël par hasard.
		vi.setSystemTime(new Date(2026, 6, 14, 10, 0));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it.each(EN_DECEMBRE)('critère 35 : le %s, la forêt servie est celle des sapins', (_q, date) => {
		const nom = fichierForet(date());
		const svg = lirePublic(nom);
		expect(premierEcart(genere(generation('noel')), svg), nom).toBe('');
		expect(ecartsSapins(svg), nom).toEqual([]);
	});

	it.each(HORS_DECEMBRE)(
		'critère 35 : le %s, la forêt servie est la forêt habituelle',
		(_q, date) => {
			const nom = fichierForet(date());
			expect(premierEcart(genere(generation(undefined)), lirePublic(nom)), nom).toBe('');
		},
	);
});

/* ============================================================
   composeForest — la forêt de Noël, avec les paramètres réels.
   ============================================================ */

describe('composeForest — forêt de Noël (paramètres de forest:gen)', () => {
	const NOEL = generation('noel');
	const ANNEE = generation(undefined);
	const svgNoel = genere(NOEL);
	const svgAnnee = genere(ANNEE);

	it('déterministe : même chaîne d’un appel à l’autre, à la suite ou la forêt de l’année générée entre les deux', () => {
		const noel = (): string => composeForest(NOEL.graine, NOEL.arbres, NOEL.saison);
		const premier = noel();
		expect(premierEcart(premier, noel()), 'deux appels à la suite').toBe('');
		composeForest(ANNEE.graine, ANNEE.arbres);
		expect(premierEcart(premier, noel()), 'après la forêt de l’année').toBe('');
	});

	it('critère 35 : la racine porte la classe foret-noel ; la forêt de l’année ne la porte pas', () => {
		expect(classesRacine(svgNoel)).toContain('foret-noel');
		expect(classesRacine(svgAnnee)).not.toContain('foret-noel');
	});

	it('critère 36 : 14 sapins, chacun dans un groupe sway, autant que d’arbres habituels', () => {
		expect(groupesSway(svgAnnee)).toHaveLength(ARBRES);
		expect(groupesSway(svgNoel)).toHaveLength(ARBRES);
	});

	it('critère 35 : chaque sapin porte de la neige (témoin : des arbres de l’année n’en portent pas)', () => {
		const sansNeige = groupesSway(svgNoel)
			.map((a, i) => (porteDeLaNeige(a) ? '' : `sapin ${i + 1}`))
			.filter((e) => e !== '');
		expect(sansNeige).toEqual([]);
		expect(groupesSway(svgAnnee).some((a) => !porteDeLaNeige(a))).toBe(true);
	});

	it('critère 39 : ni fruit ni étoile (témoin : la forêt de l’année les porte)', () => {
		expect(decorations(svgNoel)).toEqual([]);
		expect(decorations(svgAnnee).length).toBeGreaterThan(0);
		expect(decorations(svgAnnee)).toContain(ETINCELLE);
	});

	it('critère 40 : de ⌈14/5⌉ = 3 à ⌊14/2⌋ = 7 sapins portent une guirlande, chacune dans le groupe sway de son sapin, avec un fil et des boules', () => {
		expect(ecartsGuirlandes(svgNoel)).toEqual([]);
	});

	it('témoin du critère 40 : la forêt de l’année ne porte aucune guirlande', () => {
		expect(groupesDeClasse(svgAnnee, 'guirlande')).toEqual([]);
	});

	it('garde contre un test à vide (critère 41) : chaque sapin a des étages reconnus, chacun avec un bord festonné', () => {
		const vides = groupesSway(svgNoel).flatMap((sapin, i) =>
			ecartsBord(sapin).lecture.map((e) => `sapin ${i + 1} : ${e}`),
		);
		expect(vides).toEqual([]);
	});

	it('critère 41 : aucun feston du bord du bas ne sort des deux coins de son étage, ombres comprises', () => {
		expect(resume(ecartsFestons(svgNoel))).toEqual({ nombre: 0, premiers: [] });
	});

	it('critère 38 : le fichier de décembre ne pèse pas plus lourd que celui de l’année', () => {
		const noel = lireFichier(NOEL.fichier);
		const annee = lireFichier(ANNEE.fichier);
		expect(
			pasPlusLourd(noel, annee),
			`${NOEL.fichier} : ${octets(noel)} octets ; ${ANNEE.fichier} : ${octets(annee)} octets`,
		).toBe(true);
	});

	it.each(GENERATIONS.map((g) => [g.fichier, g] as const))(
		'critère 34 : %s est exactement la sortie du générateur (sinon : npm run forest:gen)',
		(_f, g) => {
			expect(premierEcart(genere(g), lireFichier(g.fichier))).toBe('');
		},
	);
});

/* ============================================================
   composeForest — une saison mal écrite ne donne pas, sans bruit, la forêt de l'année.
   ============================================================ */

describe('composeForest — saison inconnue', () => {
	it.each(['noël', 'Noel', 'NOEL'])('« %s » lève une erreur', (saison) => {
		expect(() => composeForest(15, ARBRES, saison)).toThrow();
	});

	it('sans saison, ou `undefined` explicite : la forêt de l’année, sans erreur', () => {
		const annee = composeForest(15, ARBRES);
		expect(premierEcart(annee, composeForest(15, ARBRES, undefined))).toBe('');
		expect(classesRacine(annee)).not.toContain('foret-noel');
	});
});

/* ============================================================
   La ligne de commande (`npm run forest:gen`) s'exécute vraiment. Sa garde « lancé, pas
   importé » compare l'URL du module au chemin du script : si elle se trompait, le script
   sortirait sans rien écrire et sans erreur. On le lance donc pour de vrai, comme
   `forest:gen` (chemin relatif depuis la racine du dépôt), vers un dossier temporaire du
   système, nettoyé après chaque test.
   ============================================================ */

describe('generate-forest.mjs — la ligne de commande', () => {
	const SCRIPT = 'tools/forest/generate-forest.mjs';
	let dossier = '';
	beforeEach(() => {
		dossier = mkdtempSync(join(tmpdir(), 'ludaskia-foret-'));
	});
	afterEach(() => {
		if (dossier !== '') rmSync(dossier, { recursive: true, force: true });
		dossier = '';
	});

	it('écrit la forêt de Noël demandée, identique à composeForest', () => {
		const NOEL = generation('noel');
		const sortie = join(dossier, 'foret-noel.svg');
		execFileSync(
			process.execPath,
			[SCRIPT, String(NOEL.graine), String(NOEL.arbres), sortie, 'noel'],
			{ stdio: 'pipe' },
		);
		expect(existsSync(sortie), `${sortie} non écrit`).toBe(true);
		const svg = readFileSync(sortie, 'utf8');
		expect(svg.startsWith('<svg class="foret-svg foret-noel"'), svg.slice(0, 60)).toBe(true);
		expect(
			premierEcart(normalise(composeForest(NOEL.graine, NOEL.arbres, 'noel')), normalise(svg)),
		).toBe('');
	});

	it.each(['noël', 'Noel'])('saison « %s » : sortie en erreur, aucun fichier écrit', (saison) => {
		const sortie = join(dossier, 'foret.svg');
		const r = spawnSync(process.execPath, [SCRIPT, '15', String(ARBRES), sortie, saison], {
			encoding: 'utf8',
		});
		expect(r.status, r.stderr).not.toBe(0);
		expect(r.status, 'processus tué sans code de sortie').not.toBeNull();
		expect(existsSync(sortie)).toBe(false);
	});
});

/* ============================================================
   composeForest — au-delà de la graine réelle : graines 1 à 30.
   ============================================================ */

describe('composeForest — graines 1 à 30', () => {
	const GRAINES = Array.from({ length: 30 }, (_, i) => i + 1);

	// Relu en ordre inverse, l'année AVANT Noël : un état caché qui avancerait à chaque appel
	// (même à pas pair) ne retomberait pas sur la même chaîne.
	it('déterministe : même graine, même forêt, Noël et année entrelacés puis relus en ordre inverse', () => {
		const premiers = GRAINES.map((g) => [
			composeForest(g, ARBRES, 'noel'),
			composeForest(g, ARBRES),
		]);
		const ecarts: string[] = [];
		for (let i = GRAINES.length - 1; i >= 0; i--) {
			const g = GRAINES[i];
			if (composeForest(g, ARBRES) !== premiers[i][1]) ecarts.push(`graine ${g} (année)`);
			if (composeForest(g, ARBRES, 'noel') !== premiers[i][0]) ecarts.push(`graine ${g} (Noël)`);
		}
		expect(ecarts).toEqual([]);
	});

	it('critères 35, 36 et 39 : chaque forêt de Noël est faite de 14 sapins enneigés, sans fruit ni étoile', () => {
		const ecarts = GRAINES.flatMap((g) => {
			const svg = composeForest(g, ARBRES, 'noel');
			const n = groupesSway(svg).length;
			return [...(n === ARBRES ? [] : [`${n} arbres qui se balancent`]), ...ecartsSapins(svg)].map(
				(e) => `graine ${g} : ${e}`,
			);
		});
		expect(ecarts).toEqual([]);
	});

	it('témoin du critère 39 : chaque couleur cherchée apparaît dans la forêt de l’année d’au moins une graine', () => {
		const vues = new Set(GRAINES.flatMap((g) => decorations(composeForest(g, ARBRES))));
		expect([...vues].sort()).toEqual([...COULEURS_FRUITS, ETINCELLE].sort());
	});

	it('critère 40 : sur chaque graine, de 3 à 7 sapins sur 14 portent une guirlande, dans leur groupe sway, avec fil et boules', () => {
		const ecarts = GRAINES.flatMap((g) =>
			ecartsGuirlandes(composeForest(g, ARBRES, 'noel')).map((e) => `graine ${g} : ${e}`),
		);
		expect(resume(ecarts)).toEqual({ nombre: 0, premiers: [] });
	});

	it('critère 41 : sur chaque graine, aucun feston ne sort des deux coins de son étage (étages reconnus, bords festonnés)', () => {
		const ecarts = GRAINES.flatMap((g) =>
			ecartsFestons(composeForest(g, ARBRES, 'noel')).map((e) => `graine ${g} : ${e}`),
		);
		expect(resume(ecarts)).toEqual({ nombre: 0, premiers: [] });
	});
});

/* ============================================================
   Les contrôles savent échouer : des SVG fabriqués, au bord quand il y en a un. Sans eux,
   un lecteur trop permissif rendrait les tests ci-dessus verts quoi que produise le
   générateur.
   ============================================================ */

describe('les contrôles du test savent échouer', () => {
	const sapin =
		'<g class="sway"><g><circle fill="hsl(150 35% 40%)"/></g><circle fill="#f4f8fb"/></g>';
	const foret = (classes: string, arbres: string): string =>
		`<svg class="${classes}" viewBox="0 0 10 10">${arbres}</svg>`;

	it.each<[string, string, boolean]>([
		['forêt de sapins minimale', foret('foret-svg foret-noel', sapin), true],
		['racine sans foret-noel', foret('foret-svg', sapin), false],
		[
			'foret-noel sur un enfant, pas sur la racine',
			foret('foret-svg', `<g class="foret-noel">${sapin}</g>`),
			false,
		],
		['classe voisine foret-noel-x', foret('foret-svg foret-noel-x', sapin), false],
		['un fruit #d8392b', foret('foret-noel', `${sapin}<circle fill="#d8392b"/>`), false],
		[
			'un fruit en majuscules #8A5BC0',
			foret('foret-noel', `${sapin}<circle fill="#8A5BC0"/>`),
			false,
		],
		['une étincelle #ffe9a0', foret('foret-noel', `${sapin}<path fill="#ffe9a0"/>`), false],
		[
			'un sapin sans neige, de la neige hors des sapins',
			foret('foret-noel', `${sapin}<g class="sway"><circle fill="#2a5"/></g><circle fill="#fff"/>`),
			false,
		],
		['aucun arbre', foret('foret-noel', '<circle fill="#fff"/>'), false],
	])('ecartsSapins sur « %s » : forêt de sapins = %s', (_cas, svg, tient) => {
		expect(ecartsSapins(svg).length === 0).toBe(tient);
	});

	it('classesRacine lève si le document ne commence pas par <svg', () => {
		expect(() =>
			classesRacine('<g class="foret-noel"><svg class="foret-noel"></svg></g>'),
		).toThrow();
	});

	it('groupesSway va jusqu’à la balise fermante du groupe, pas au premier </g>', () => {
		// Neige APRÈS un <g> imbriqué : un lecteur qui s'arrête au premier </g> la perdrait.
		expect(groupesSway(sapin)).toHaveLength(1);
		expect(porteDeLaNeige(groupesSway(sapin)[0])).toBe(true);
		expect(groupesSway(`${sapin}<g class="sway x"></g><g class="swaying"></g>`)).toHaveLength(2);
		expect(() => groupesSway('<g class="sway"><g></g>')).toThrow();
	});

	it.each<[string, boolean]>([
		['#f4f8fb', true],
		['#fff', true],
		['#e0e0e0', true], // 224 sur chaque canal : le bord tient
		['#dfe0e0', false], // 223 sur un canal
		['#cdd9e6', false],
		['hsl(0 0% 95%)', true],
		['hsl(150 35% 40%)', false],
		['url(#tgs1)', false],
	])('porteDeLaNeige sur fill="%s" : %s', (fill, neige) => {
		expect(porteDeLaNeige(`<circle fill="${fill}"/>`)).toBe(neige);
	});

	it.each<[string, string, boolean]>([
		['même poids', 'abcd', true],
		['un octet de moins', 'abc', true],
		['un octet de plus', 'abcde', false],
		['même nombre de caractères, un accent en plus (2 octets)', 'abcé', false],
	])('pasPlusLourd, Noël « %s » face à « abcd » : %s', (_cas, noel, tient) => {
		expect(pasPlusLourd(noel, 'abcd')).toBe(tient);
	});

	it.each<[string, string, boolean]>([
		['identique', '<svg></svg>', true],
		['fins de ligne CRLF et saut final', '<svg></svg>\r\n', true],
		['un caractère changé', '<svg></svG>', false],
		['un caractère en plus', '<svg> </svg>', false],
	])('premierEcart face au fichier « %s » : identique = %s', (_cas, fichier, identique) => {
		expect(premierEcart(normalise('<svg></svg>\n'), normalise(fichier)) === '').toBe(identique);
	});

	/* Critère 40 : guirlandes. */
	const GUIRLANDE =
		'<g class="guirlande"><path d="M 0,0 Q 5,5 10,0" fill="none"/>' +
		'<circle cx="5" cy="3" r="1" fill="#c0392b"/></g>';
	const enneige = (contenu = ''): string =>
		`<g class="sway"><circle fill="#f4f8fb"/>${contenu}</g>`;
	/** `avec` sapins à guirlande sur `total`, puis `enPlus` hors des sapins. */
	const foretGuirlandes = (
		avec: number,
		total: number,
		enPlus = '',
		guirlande = GUIRLANDE,
	): string =>
		foret('foret-noel', enneige(guirlande).repeat(avec) + enneige().repeat(total - avec) + enPlus);

	it.each<[string, string, boolean]>([
		['2 sapins sur 10 (un sur cinq, la borne basse)', foretGuirlandes(2, 10), true],
		['1 sapin sur 10', foretGuirlandes(1, 10), false],
		['5 sapins sur 10 (un sur deux, la borne haute)', foretGuirlandes(5, 10), true],
		['6 sapins sur 10', foretGuirlandes(6, 10), false],
		['3 sapins sur 14 (14/5 = 2,8 : arrondi au-dessus)', foretGuirlandes(3, 14), true],
		['2 sapins sur 14', foretGuirlandes(2, 14), false],
		['7 sapins sur 15 (15/2 = 7,5 : arrondi au-dessous)', foretGuirlandes(7, 15), true],
		['8 sapins sur 15', foretGuirlandes(8, 15), false],
		['aucun sapin', foretGuirlandes(0, 10), false],
		['tous les sapins', foretGuirlandes(10, 10), false],
		[
			'deux guirlandes sur un seul sapin : un seul porteur',
			foret('foret-noel', enneige(GUIRLANDE + GUIRLANDE) + enneige().repeat(9)),
			false,
		],
		[
			'guirlande dans un sous-groupe de son sapin',
			foretGuirlandes(2, 10, '', `<g transform="translate(1,0)">${GUIRLANDE}</g>`),
			true,
		],
		['une guirlande de plus, hors de tout groupe sway', foretGuirlandes(2, 10, GUIRLANDE), false],
		[
			'guirlande sans boule',
			foretGuirlandes(2, 10, '', GUIRLANDE.replace(/<circle[^>]*>/, '')),
			false,
		],
		[
			'guirlande au fil rempli',
			foretGuirlandes(2, 10, '', GUIRLANDE.replace('fill="none"', 'fill="#c0392b"')),
			false,
		],
		[
			'classe voisine « guirlandes » : pas une guirlande',
			foretGuirlandes(2, 10, '', GUIRLANDE.replace('"guirlande"', '"guirlandes"')),
			false,
		],
	])('ecartsGuirlandes sur « %s » : critère 40 tenu = %s', (_cas, svg, tient) => {
		expect(ecartsGuirlandes(svg).length === 0, ecartsGuirlandes(svg).join(' ; ')).toBe(tient);
	});

	/* Critère 41 : bord du bas. Étage fabriqué : sommet (50, 0), coins (10, 40) et (90, 40) ;
	   le bord passé en paramètre doit finir au coin droit. */
	const VERT = 'hsl(150 35% 30%)';
	const OMBRE = 'hsl(150 35% 22%)';
	const etageFab = (bord: string, fill = VERT): string =>
		`<path d="M 50,0 Q 30,20 10,40 ${bord} Q 70,20 50,0 Z" fill="${fill}"/>`;
	const BORD_DROIT = 'L 90,40';
	const rond = (cx: number, r: number, fill = VERT, cy = 40): string =>
		`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
	const sapinFab = (contenu: string): string =>
		foret('foret-noel', `<g class="sway">${contenu}</g>`);
	const FESTONS_OK = rond(15, 5) + rond(50, 5) + rond(85, 5);
	/** Ombre décalée de 3 : coins (13, 43) et (93, 43). */
	const ombreFab = (ronds: string): string =>
		`<path d="M 53,3 Q 33,23 13,43 L 93,43 Q 73,23 53,3 Z" fill="${OMBRE}"/>${ronds}`;
	/** Étage étroit du même vert, au-dessus : coins (30, 20) et (70, 20). */
	const etroitFab = (ronds: string): string =>
		`<path d="M 50,0 Q 40,10 30,20 L 70,20 Q 60,10 50,0 Z" fill="${VERT}"/>${ronds}`;

	it.each<[string, string, boolean]>([
		['ronds tangents aux deux coins', sapinFab(etageFab(BORD_DROIT) + FESTONS_OK), true],
		[
			'rond centré à coin + 0,6 r : il dépasse de 0,4 r (le défaut vu)',
			sapinFab(etageFab(BORD_DROIT) + rond(13, 5) + rond(85, 5)),
			false,
		],
		[
			'rond qui dépasse à droite seulement',
			sapinFab(etageFab(BORD_DROIT) + rond(15, 5) + rond(86, 5)),
			false,
		],
		[
			'ronds qui dépassent d’un dixième (arrondi d’écriture)',
			sapinFab(etageFab(BORD_DROIT) + rond(14.9, 5) + rond(85.1, 5)),
			true,
		],
		[
			'rond qui dépasse de deux dixièmes',
			sapinFab(etageFab(BORD_DROIT) + rond(14.8, 5) + rond(85, 5)),
			false,
		],
		[
			'neige qui dépasse : pas un feston',
			sapinFab(etageFab(BORD_DROIT) + FESTONS_OK + rond(8, 5, '#f4f8fb')),
			true,
		],
		[
			'rond du même vert écrit avec des virgules, qui dépasse',
			sapinFab(etageFab(BORD_DROIT) + FESTONS_OK + rond(13, 5, 'hsl(150, 35%, 30%)')),
			false,
		],
		[
			'ombre portée dont les ronds tiennent entre SES coins',
			sapinFab(
				etageFab(BORD_DROIT) +
					FESTONS_OK +
					ombreFab(rond(18, 5, OMBRE, 43) + rond(88, 5, OMBRE, 43)),
			),
			true,
		],
		[
			'rond d’ombre qui sort de SES coins, mais tiendrait dans ceux de l’étage',
			sapinFab(
				etageFab(BORD_DROIT) +
					FESTONS_OK +
					ombreFab(rond(16, 5, OMBRE, 43) + rond(88, 5, OMBRE, 43)),
			),
			false,
		],
		[
			'deux étages du même vert : chaque rond jugé sur l’étage dont il borde le bas',
			sapinFab(
				etageFab(BORD_DROIT) +
					FESTONS_OK +
					etroitFab(rond(35, 5, VERT, 20) + rond(65, 5, VERT, 20)),
			),
			true,
		],
		[
			'deux étages du même vert : le rond de l’étroit en sort, même s’il tiendrait dans le large',
			sapinFab(
				etageFab(BORD_DROIT) +
					FESTONS_OK +
					etroitFab(rond(33, 5, VERT, 20) + rond(65, 5, VERT, 20)),
			),
			false,
		],
		[
			'arcs d’un coin à l’autre',
			sapinFab(
				etageFab('A 10,10 0 0,0 30,40 A 10,10 0 0,0 50,40 A 10,10 0 0,0 70,40 A 10,10 0 0,0 90,40'),
			),
			true,
		],
		[
			'arcs en coordonnées relatives (a), d’un coin à l’autre',
			sapinFab(
				etageFab('a 10,10 0 0,0 20,0 a 10,10 0 0,0 20,0 a 10,10 0 0,0 20,0 a 10,10 0 0,0 20,0'),
			),
			true,
		],
		[
			'arc dont l’extrémité sort du coin gauche puis revient',
			sapinFab(etageFab('A 3,3 0 0,0 4,40 L 90,40')),
			false,
		],
		[
			'grand arc (drapeau 1) qui bombe hors du coin',
			sapinFab(etageFab('A 5,5 0 1,0 12,40 L 90,40')),
			false,
		],
		[
			'petit arc, extrémités au coin, qui bombe dehors (corde verticale)',
			sapinFab(etageFab('A 5,5 0 0,0 10,50 L 90,40')),
			false,
		],
		['le même arc, bombé vers l’intérieur', sapinFab(etageFab('A 5,5 0 0,1 10,50 L 90,40')), true],
		[
			'le même arc qui bombe dehors, en relatif',
			sapinFab(etageFab('a 5,5 0 0,0 0,10 L 90,40')),
			false,
		],
		['étage au bord droit, sans feston', sapinFab(etageFab(BORD_DROIT)), false],
		['aucun étage reconnaissable', sapinFab(FESTONS_OK), false],
		[
			'fil de guirlande en S (fill="none") à côté : ignoré',
			sapinFab(etageFab(BORD_DROIT) + FESTONS_OK + '<path d="M 0,40 S 50,60 100,40" fill="none"/>'),
			true,
		],
	])('ecartsFestons sur « %s » : critère 41 tenu = %s', (_cas, svg, tient) => {
		expect(ecartsFestons(svg).length === 0, ecartsFestons(svg).join(' ; ')).toBe(tient);
	});

	it('ecartsFestons lève sur un étage dont le bord porte une commande qu’il ne lit pas (S)', () => {
		expect(() => ecartsFestons(sapinFab(etageFab('S 50,60 90,40') + FESTONS_OK))).toThrow();
	});
});
