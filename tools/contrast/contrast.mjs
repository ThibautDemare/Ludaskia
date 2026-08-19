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
 * Ce fichier n'est plus qu'une INTERFACE : la formule vit dans `./wcag.js`, partagé
 * avec le gate `tests/contraste-tokens.test.ts` (#582). L'outil garde son rôle
 * interactif — mesurer une couleur candidate AVANT de la poser dans un token — pendant
 * que le test empêche la régression une fois la couleur choisie. Les deux mesurent
 * exactement la même chose, par construction.
 */
/* global process, console */ // script Node en ligne de commande

import {
	contrastRatio,
	parseColor,
	SEUIL_GRAND_TEXTE_AA,
	SEUIL_NON_TEXTE_AA,
	SEUIL_TEXTE_AA,
	SEUIL_TEXTE_AAA,
} from './wcag.js';

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
	console.log(
		`  Texte normal             ${badge(ratio, SEUIL_TEXTE_AA).padEnd(9)} ${badge(ratio, SEUIL_TEXTE_AAA)}`,
	);
	console.log(
		`  Grand texte (≥ 18pt)     ${badge(ratio, SEUIL_GRAND_TEXTE_AA).padEnd(9)} ${badge(ratio, SEUIL_TEXTE_AA)}`,
	);
	console.log(`  Non-texte / UI (1.4.11)  ${badge(ratio, SEUIL_NON_TEXTE_AA)}`);
	console.log('');
}

main();
