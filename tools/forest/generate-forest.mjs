#!/usr/bin/env node
/*
 * Générateur de la « forêt » de pied de page (SVG procédural, déterministe).
 *
 * Usage : node tools/forest/generate-forest.mjs [graine] [nbArbres] [fichierSortie]
 *   - sans fichier de sortie : écrit le SVG sur la sortie standard ;
 *   - avec : écrit le SVG dans le fichier.
 *
 * La composition est ENTIÈREMENT déterminée par (graine, nbArbres) : même entrée
 * → même SVG. Ce module produit le markup statique intégré à l'application
 * (le SVG est collé dans index.html ; l'animation « vent » et les garde-fous
 * d'accessibilité sont dans src/styles/foret.scss). Pour régénérer la bande après
 * un changement de paramètres : `npm run forest:gen`.
 *
 * Le rendu correspond exactement au POC de conception (mêmes formules).
 */
/* global process */ // script Node en ligne de commande : `process` vient de l'environnement Node
import { writeFileSync } from 'node:fs';

/* ---------- PRNG déterministe (mulberry32) ---------- */
function mulberry32(a) {
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function makeRng(seed) {
	const r = mulberry32(seed);
	return {
		f: (a = 0, b = 1) => a + (b - a) * r(),
		i: (a, b) => Math.floor(a + r() * (b - a + 1)),
	};
}

function star(x, y, s) {
	const p = (a, b) => `${a.toFixed(1)},${b.toFixed(1)}`;
	return `<path d="M${p(x, y - s)} L${p(x + s * 0.28, y - s * 0.28)} L${p(x + s, y)} L${p(
		x + s * 0.28,
		y + s * 0.28,
	)} L${p(x, y + s)} L${p(x - s * 0.28, y + s * 0.28)} L${p(x - s, y)} L${p(
		x - s * 0.28,
		y - s * 0.28,
	)} Z" fill="#ffe9a0"/>`;
}

/* ---------- Contenu interne d'un arbre (sans <svg> englobant) ----------
   Base (centre du pied) en (75, 156) dans un cadre 150 × 175. */
function buildTree(seed) {
	const R = makeRng(seed >>> 0);
	const baseY = 156,
		cx = 75;
	const rad = 42 * R.f(0.82, 1.12);
	const squash = R.f(0.74, 1.02); // aplatissement vertical du feuillage → variété de forme
	const cy = baseY - rad * 1.7; // feuillage remonté → tronc plus visible

	// Palette verte calée sur le logo : jaune-vert / chartreuse (H ~84-106).
	const hue = R.f(84, 106);
	const sat = R.f(38, 54);
	const L = R.f(46, 52);
	const bh = R.f(26, 34),
		bs = R.f(42, 54),
		bl = R.f(33, 40);
	const trunkL = `hsl(${bh} ${bs}% ${bl + 9}%)`;
	const trunkD = `hsl(${bh} ${bs}% ${bl - 11}%)`;

	const c = (x, y, rr, fill) =>
		`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="${fill}"/>`;

	// 5 couches indépendantes (du sombre/plein au clair/groupé en haut-gauche) ;
	// chaque amas projette une ombre (bas-droite) et/ou une éclaircie (haut-gauche).
	const LAYERS = 5;
	let foliage = '';
	for (let li = 0; li < LAYERS; li++) {
		const t = li / (LAYERS - 1);
		const lite = L - 12 + t * 30;
		const col = `hsl(${hue} ${(sat - t * 3).toFixed(0)}% ${lite.toFixed(0)}%)`;
		const shadow = `hsl(${hue} ${sat}% ${Math.max(lite - R.f(6, 13), 6).toFixed(0)}%)`;
		const highlight = `hsl(${hue} ${sat}% ${Math.min(lite + R.f(6, 13), 93).toFixed(0)}%)`;
		const offS = rad * R.f(0.03, 0.055);
		const offH = rad * R.f(0.03, 0.055);
		const useShadow = R.f() < 0.6;
		const useHi = R.f() < 0.6;
		const ccx = cx - t * rad * 0.32;
		const ccy = cy - t * rad * 0.36;
		const regionR = rad * (0.98 - t * 0.55);
		const count = Math.round(R.f(30, 42) * (1 - t * 0.4));
		const rMin = rad * (0.22 - t * 0.045);
		const rMax = rad * (0.42 - t * 0.09);
		const cs = [{ x: ccx, y: ccy, r: regionR * 0.6 }];
		for (let k = 0; k < count; k++) {
			const ang = R.f(0, Math.PI * 2);
			// Borne l'écartement : un lobe ne peut pas se détacher du reste du feuillage.
			const dd = Math.min(regionR * Math.pow(R.f(0, 1), 0.65), regionR * 0.82);
			cs.push({
				x: ccx + Math.cos(ang) * dd,
				y: ccy + Math.sin(ang) * dd * squash,
				r: rMin + (rMax - rMin) * R.f(0, 1),
			});
		}
		if (useShadow) foliage += cs.map((o) => c(o.x + offS, o.y + offS, o.r, shadow)).join('');
		if (useHi) foliage += cs.map((o) => c(o.x - offH, o.y - offH, o.r, highlight)).join('');
		foliage += cs.map((o) => c(o.x, o.y, o.r, col)).join('');
	}

	// Tronc quasi droit, pieds arrondis, léger penchant ; dégradé clair→foncé.
	const topY = cy + rad * 0.18;
	const lean = R.f(-rad * 0.06, rad * 0.06);
	const tx = cx + lean;
	const wTop = rad * R.f(0.14, 0.18),
		wBot = rad * R.f(0.2, 0.26),
		flare = rad * R.f(0.14, 0.2);
	const f = (v) => v.toFixed(1);
	const kneeY = baseY - (baseY - topY) * 0.16;
	const trunkPath =
		`M ${f(tx - wTop)},${f(topY)} ` +
		`L ${f(cx - wBot)},${f(kneeY)} ` +
		`Q ${f(cx - wBot)},${f(baseY)} ${f(cx - wBot - flare)},${f(baseY)} ` +
		`L ${f(cx + wBot + flare)},${f(baseY)} ` +
		`Q ${f(cx + wBot)},${f(baseY)} ${f(cx + wBot)},${f(kneeY)} ` +
		`L ${f(tx + wTop)},${f(topY)} Z`;

	let sp = '';
	const ns = R.i(0, 3);
	for (let s = 0; s < ns; s++)
		sp += star(cx + R.f(-rad * 0.6, rad * 0.55), cy + R.f(-rad * 0.5, rad * 0.4), R.f(1.6, 2.8));

	// Fruits : sur certains arbres (~40 %), taches colorées espacées + mini reflet.
	let fruits = '';
	if (R.f() < 0.4) {
		const fruitCol = ['#d8392b', '#e2632a', '#e8a21d', '#e0b020', '#8a5bc0'][R.i(0, 4)];
		const nf = R.i(4, 9);
		const placed = [];
		const minD = rad * 0.26;
		let tries = 0;
		while (placed.length < nf && tries < nf * 14) {
			tries++;
			const ang = R.f(0, Math.PI * 2);
			const dd = rad * 0.72 * Math.sqrt(R.f(0, 1));
			const fx = cx + Math.cos(ang) * dd;
			const fy = cy + Math.sin(ang) * dd * squash;
			if (placed.some((p) => Math.hypot(p.x - fx, p.y - fy) < minD)) continue;
			placed.push({ x: fx, y: fy });
			const fr = rad * R.f(0.05, 0.08);
			fruits +=
				`<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="${fr.toFixed(1)}" fill="${fruitCol}"/>` +
				`<circle cx="${(fx - fr * 0.3).toFixed(1)}" cy="${(fy - fr * 0.3).toFixed(1)}" r="${(fr * 0.32).toFixed(1)}" fill="#fff" opacity="0.5"/>`;
		}
	}

	const id = 'a' + (seed >>> 0);
	return (
		`<defs><linearGradient id="tg${id}" x1="0" y1="0" x2="1" y2="0">` +
		`<stop offset="0" stop-color="${trunkL}"/><stop offset="1" stop-color="${trunkD}"/>` +
		`</linearGradient></defs>` +
		`<g>` +
		`<ellipse cx="${cx}" cy="${baseY}" rx="${(rad * 0.66).toFixed(1)}" ry="${(rad * 0.12).toFixed(1)}" fill="#1f3b27" opacity="0.13"/>` +
		`<path d="${trunkPath}" fill="url(#tg${id})"/>` +
		`${foliage}${fruits}` +
		`</g>${sp}`
	);
}

/* ---------- Composition de la bande complète ---------- */
export function composeForest(seed, n) {
	const base = seed >>> 0;
	const VW = 1200,
		VH = 290;
	const hillY = (x) => {
		const u = x / VW;
		return (1 - u) * (1 - u) * 245 + 2 * (1 - u) * u * 165 + u * u * 245;
	};
	// On recadre un peu de ciel vide en haut (les cimes les plus hautes restent
	// au-dessus de TOP_CROP) : la bande « remonte » sans bouger son bas (collé).
	const TOP_CROP = 50;
	let band =
		`<svg class="foret-svg" viewBox="0 ${TOP_CROP} ${VW} ${VH - TOP_CROP}" preserveAspectRatio="xMidYMax meet" ` +
		`role="presentation" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">`;
	band += `<defs><linearGradient id="collineGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6d6ad"/><stop offset="1" stop-color="#7cbd8b"/></linearGradient></defs>`;
	band += `<path d="M0,${VH} L0,245 Q600,165 1200,245 L1200,${VH} Z" fill="url(#collineGrad)"/>`;

	// Touffes d'herbe dispersées sur la pente.
	const gr = makeRng((base * 7919) >>> 0);
	for (let k = 0; k < 22; k++) {
		const gx = gr.f(20, VW - 20);
		const gyl = hillY(gx) + gr.f(2, 16);
		const gs = gr.f(0.7, 1.4);
		const gc = gr.f() < 0.5 ? '#6fae7e' : '#8fc79a';
		const nb = gr.i(3, 5);
		for (let bld = 0; bld < nb; bld++) {
			const off = bld - (nb - 1) / 2;
			const bx = gx + off * 1.8 * gs;
			const bh = (7 + gr.f(-2, 3)) * gs;
			const lean = off * 1.2 * gs + gr.f(-1, 1);
			const bw = gs;
			band += `<path d="M${(bx - bw).toFixed(1)},${gyl.toFixed(1)} L${(bx + lean).toFixed(1)},${(
				gyl - bh
			).toFixed(1)} L${(bx + bw).toFixed(1)},${gyl.toFixed(1)} Z" fill="${gc}"/>`;
		}
	}

	// Arbres : posés sur la courbe, plus hauts (pas plus larges) sur les bords.
	const margin = 90;
	const trees = [];
	for (let i = 0; i < n; i++) {
		const px = margin + (VW - 2 * margin) * (n === 1 ? 0.5 : i / (n - 1));
		const py = hillY(px) + 4;
		const tt = Math.abs((i - (n - 1) / 2) / ((n - 1) / 2 || 1));
		const sx = 0.6 + tt * 0.66 + (((i * 37) % 17) - 8) / 130;
		const sy = 0.6 + tt * 0.78 + (((i * 29) % 15) - 7) / 110;
		const dur = (3.6 + ((i * 53) % 22) / 10).toFixed(1);
		const del = (-((i * 37) % 40) / 10).toFixed(1);
		trees.push(
			`<g transform="translate(${(px - 75 * sx).toFixed(1)},${(py - 156 * sy).toFixed(1)}) ` +
				`scale(${sx.toFixed(3)},${sy.toFixed(3)})">` +
				`<g class="sway" style="animation-duration:${dur}s;animation-delay:${del}s">` +
				`${buildTree(base * 613 + i * 1597)}</g></g>`,
		);
	}
	// Ordre de peinture aléatoire (déterministe) → chevauchements non systématiques.
	const ord = makeRng((base * 104729) >>> 0);
	for (let i = trees.length - 1; i > 0; i--) {
		const j = Math.floor(ord.f(0, i + 1));
		[trees[i], trees[j]] = [trees[j], trees[i]];
	}
	band += trees.join('');
	band += `</svg>`;
	return band;
}

/* ---------- CLI ---------- */
const seed = Number(process.argv[2] ?? 15);
const n = Number(process.argv[3] ?? 14);
const outFile = process.argv[4];
const svg = composeForest(seed, n);
if (outFile) {
	writeFileSync(outFile, svg + '\n');
	process.stderr.write(
		`Forêt écrite dans ${outFile} (graine ${seed}, ${n} arbres, ${svg.length} octets)\n`,
	);
} else {
	process.stdout.write(svg + '\n');
}
