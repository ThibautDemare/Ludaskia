/*
 * Calcul de contraste WCAG 2.1 — module partagé (#582).
 *
 * Extrait de `tools/contrast/contrast.mjs`, qui n'en est plus qu'un habillage CLI.
 * L'autre appelant est le gate `tests/contraste-tokens.test.ts` : c'est TOUT
 * l'intérêt de ce fichier. Tant que la formule vivait dans le script, un test qui
 * voulait la même mesure devait la recopier — et deux copies d'une formule finissent
 * par diverger sans que rien ne le signale, puisqu'aucune des deux n'est « la
 * référence ». Ici, l'outil qu'on lance à la main pour choisir une couleur et le test
 * qui fait échouer `npm test` calculent littéralement la même chose.
 *
 * Formule officielle (luminance relative) :
 *   L = 0.2126·R + 0.7152·G + 0.0722·B
 *   avec chaque canal sRGB linéarisé :
 *     c_lin = c/12.92                  si c ≤ 0.03928
 *     c_lin = ((c+0.055)/1.055)^2.4    sinon
 *   (c = valeur 8 bits / 255)
 *
 * Aucune dépendance externe. 100 % déterministe.
 *
 * Ancres de vérification (reprises en test) :
 *   noir #000000 / blanc #ffffff → 21:1
 *   couleur identique            → 1:1
 *   #767676 / #ffffff            → 4.54:1  (le gris le plus SOMBRE qui passe AA)
 *   #777777 / #ffffff            → 4.48:1  (le cran suivant, qui échoue)
 *   #595959 / #ffffff            → 7.00:1  (AAA texte normal)
 * L'en-tête d'origine annonçait 4.48:1 pour #767676 : c'était #777777. Écart sans
 * conséquence (rien ne lisait ce commentaire), corrigé au passage — ces deux valeurs
 * encadrent le seuil à un cran près, donc autant qu'elles soient justes.
 *
 * En JavaScript et non en TypeScript parce que `contrast.mjs` s'exécute
 * directement (`node tools/contrast/contrast.mjs …`), sans étape de build. Les
 * types viennent des annotations JSDoc ci-dessous (`allowJs` dans tsconfig.json).
 */

/** Seuils WCAG 2.1, pour que les appelants ne les réécrivent pas en dur. */
export const SEUIL_TEXTE_AA = 4.5; // SC 1.4.3, texte courant
export const SEUIL_GRAND_TEXTE_AA = 3; // SC 1.4.3, ≥ 18pt ou ≥ 14pt gras
export const SEUIL_NON_TEXTE_AA = 3; // SC 1.4.11, composants d'interface et objets graphiques
export const SEUIL_TEXTE_AAA = 7;

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
	return 0.2126 * linearise(r / 255) + 0.7152 * linearise(g / 255) + 0.0722 * linearise(b / 255);
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
	return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

/**
 * Parse une couleur en triplet [r, g, b] (0–255 chacun).
 * Retourne null si le format n'est pas reconnu.
 * @param {string} raw  `#rrggbb`, `#rgb`, `rgb(r, g, b)` (# optionnel, casse libre)
 * @returns {[number, number, number] | null}
 */
export function parseColor(raw) {
	const s = raw.trim();

	// rgb(r, g, b) — espaces optionnels, virgules ou espaces comme séparateurs
	const rgbMatch = s.match(/^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/i);
	if (rgbMatch) {
		const r = Number(rgbMatch[1]),
			g = Number(rgbMatch[2]),
			b = Number(rgbMatch[3]);
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

/**
 * Ratio de contraste entre deux couleurs données sous forme de chaîne.
 * Version « confort » pour l'appelant qui manipule des tokens CSS.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 * @throws {Error} si l'une des deux couleurs n'est pas reconnue — mieux vaut un échec
 *   bruyant qu'un ratio silencieusement faux (un `NaN` passerait pour « conforme »
 *   dans une comparaison `>=`, ce qui viderait un gate de sa substance).
 */
export function contraste(a, b) {
	const c1 = parseColor(a),
		c2 = parseColor(b);
	if (!c1) throw new Error(`Couleur non reconnue : « ${a} »`);
	if (!c2) throw new Error(`Couleur non reconnue : « ${b} »`);
	return contrastRatio(c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
}

/**
 * Couleur RÉELLEMENT perçue quand `avant` est posé sur `arriere` avec une opacité :
 * c'est la composition alpha que fait le navigateur, et ce que mesure axe.
 *
 * Indispensable dès qu'une règle porte un `opacity` : l'opacité dilue TOUT ce que
 * contient l'élément vers le fond, si bien que le contraste réel n'est celui d'aucune
 * couleur écrite dans les feuilles (cf. `.trophy.off`, #576).
 * @param {string} avant
 * @param {string} arriere
 * @param {number} alpha  Opacité appliquée (0–1)
 * @returns {string} `#rrggbb`
 */
export function melange(avant, arriere, alpha) {
	const a = parseColor(avant),
		b = parseColor(arriere);
	if (!a) throw new Error(`Couleur non reconnue : « ${avant} »`);
	if (!b) throw new Error(`Couleur non reconnue : « ${arriere} »`);
	const canal = (i) => Math.round(alpha * a[i] + (1 - alpha) * b[i]);
	return '#' + [0, 1, 2].map((i) => canal(i).toString(16).padStart(2, '0')).join('');
}
