#!/usr/bin/env node
/*
 * Calcul de contraste WCAG 2.1 — outil local de vérification.
 *
 * Usage : node tools/contrast/contrast.mjs <couleur1> <couleur2>
 *
 * Formats acceptés (insensibles à la casse, # optionnel) :
 *   #rrggbb   →  #1a2b3c
 *   #rgb      →  #abc  (développé en #aabbcc)
 *   rgb(r,g,b) → rgb(255, 128, 0)
 *
 * Affiche :
 *   - le ratio de contraste (ex. 4.53:1)
 *   - un tableau de réussite/échec WCAG :
 *       • Texte normal   AA ≥ 4.5  /  AAA ≥ 7
 *       • Grand texte    AA ≥ 3    /  AAA ≥ 4.5
 *       • Non-texte/UI   AA ≥ 3    (SC 1.4.11)
 *
 * Formule officielle WCAG (luminance relative) :
 *   L = 0.2126·R + 0.7152·G + 0.0722·B
 *   avec chaque canal sRGB linéarisé :
 *     c_lin = c/12.92            si c ≤ 0.03928
 *     c_lin = ((c+0.055)/1.055)^2.4   sinon
 *   (c = valeur 8 bits / 255)
 *
 * Aucune dépendance externe. 100 % déterministe.
 *
 * Exemples connus (ancres de vérification) :
 *   noir (#000000) / blanc (#ffffff) → 21:1
 *   couleur identique                → 1:1
 *   #767676 / #ffffff                → ~4.48:1  (juste sous AA texte normal)
 *   #595959 / #ffffff                → ~7.0:1   (AAA texte normal)
 */
/* global process, console */ // script Node en ligne de commande

// ─── Calcul de luminance ─────────────────────────────────────────────────────

/**
 * Linéarise un canal sRGB (valeur entre 0 et 1).
 * @param {number} c  Canal normalisé (0–1)
 * @returns {number}  Valeur linéarisée
 */
function linearise(c) {
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calcule la luminance relative d'une couleur RGB (valeurs 0–255).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number}  Luminance relative (0–1)
 */
export function luminance(r, g, b) {
	const R = linearise(r / 255);
	const G = linearise(g / 255);
	const B = linearise(b / 255);
	return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calcule le ratio de contraste WCAG entre deux couleurs.
 * @param {number} r1  Rouge couleur 1 (0–255)
 * @param {number} g1
 * @param {number} b1
 * @param {number} r2  Rouge couleur 2 (0–255)
 * @param {number} g2
 * @param {number} b2
 * @returns {number}  Ratio (toujours ≥ 1, ex. 4.53)
 */
export function contrastRatio(r1, g1, b1, r2, g2, b2) {
	const L1 = luminance(r1, g1, b1);
	const L2 = luminance(r2, g2, b2);
	const lighter = Math.max(L1, L2);
	const darker = Math.min(L1, L2);
	return (lighter + 0.05) / (darker + 0.05);
}

// ─── Parsing des couleurs ─────────────────────────────────────────────────────

/**
 * Parse une couleur en triplet [r, g, b] (0–255 chacun).
 * Retourne null si le format n'est pas reconnu.
 * @param {string} raw
 * @returns {[number, number, number] | null}
 */
export function parseColor(raw) {
	const s = raw.trim();

	// rgb(r, g, b) — espaces optionnels, virgules ou espaces comme séparateurs
	const rgbMatch = s.match(/^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/i);
	if (rgbMatch) {
		const [, r, g, b] = rgbMatch.map(Number);
		if (r > 255 || g > 255 || b > 255) return null;
		return [r, g, b];
	}

	// hex #rrggbb ou rrggbb (6 chiffres)
	const hex6 = s.match(/^#?([0-9a-f]{6})$/i);
	if (hex6) {
		const h = hex6[1];
		return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
	}

	// hex court #rgb ou rgb (3 chiffres) → développé en #rrggbb
	const hex3 = s.match(/^#?([0-9a-f]{3})$/i);
	if (hex3) {
		const h = hex3[1];
		return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
	}

	return null;
}

// ─── Affichage CLI ────────────────────────────────────────────────────────────

const PASS = '✓ PASS';
const FAIL = '✗ FAIL';

/**
 * Retourne PASS ou FAIL selon si le ratio atteint le seuil.
 * @param {number} ratio
 * @param {number} threshold
 */
function badge(ratio, threshold) {
	return ratio >= threshold ? PASS : FAIL;
}

/**
 * Point d'entrée CLI.
 */
function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(
			[
				'Usage : node tools/contrast/contrast.mjs <couleur1> <couleur2>',
				'',
				'Formats acceptés (insensibles à la casse, # optionnel) :',
				'  #rrggbb   →  #1a2b3c',
				'  #rgb      →  #abc',
				'  rgb(r,g,b) →  rgb(255, 128, 0)',
				'',
				'Exemples :',
				'  node tools/contrast/contrast.mjs "#000000" "#ffffff"',
				'  node tools/contrast/contrast.mjs 595959 ffffff',
				'  node tools/contrast/contrast.mjs "rgb(89,89,89)" "#fff"',
			].join('\n'),
		);
		process.exit(0);
	}

	if (args.length < 2) {
		console.error('Erreur : deux couleurs sont requises.');
		console.error('Usage : node tools/contrast/contrast.mjs <couleur1> <couleur2>');
		process.exit(1);
	}

	const c1 = parseColor(args[0]);
	const c2 = parseColor(args[1]);

	if (!c1) {
		console.error(`Erreur : couleur invalide « ${args[0]} ».`);
		console.error('Formats acceptés : #rrggbb, #rgb, rgb(r,g,b)');
		process.exit(1);
	}
	if (!c2) {
		console.error(`Erreur : couleur invalide « ${args[1]} ».`);
		console.error('Formats acceptés : #rrggbb, #rgb, rgb(r,g,b)');
		process.exit(1);
	}

	const ratio = contrastRatio(...c1, ...c2);
	const ratioStr = ratio.toFixed(2) + ':1';

	console.log('');
	console.log(`  Contraste : ${ratioStr}`);
	console.log('');
	console.log('  Critère                  AA        AAA');
	console.log('  ─────────────────────────────────────────');
	console.log(`  Texte normal             ${badge(ratio, 4.5).padEnd(9)} ${badge(ratio, 7)}`);
	console.log(`  Grand texte (≥ 18pt)     ${badge(ratio, 3).padEnd(9)} ${badge(ratio, 4.5)}`);
	console.log(`  Non-texte / UI (1.4.11)  ${badge(ratio, 3)}`);
	console.log('');
}

main();
