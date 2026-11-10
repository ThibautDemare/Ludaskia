/* ============================================================
   Lecture statique des feuilles SCSS, partagée par les gates qui les inspectent
   (`contraste-tokens.test.ts`, `decor-fige.test.ts`). Pas une suite : le nom sans
   `.test.` la tient hors de l'include de Vitest.

   Ce que ces fonctions savent faire : retirer les commentaires sans toucher aux chaînes,
   couper une liste de sélecteurs aux virgules de premier niveau, résoudre l'imbrication
   SCSS avec ou sans `&`. Ce qu'elles ignorent : les préludes `@` (`@media`, `@mixin`,
   `@at-root`…) sont sautés, pas interprétés ; à l'appelant de décider s'il doit les
   signaler.
   ============================================================ */

/** Retire les commentaires `/* … *\/` et `// …` sans toucher aux chaînes, et en gardant
 *  les sauts de ligne : les numéros de ligne des messages d'échec restent justes. */
export function sansCommentairesScss(scss: string): string {
	let sortie = '';
	let guillemet = '';
	for (let i = 0; i < scss.length; i++) {
		const c = scss[i];
		if (guillemet) {
			sortie += c;
			if (c === '\\') {
				sortie += scss.charAt(i + 1);
				i++;
			} else if (c === guillemet) guillemet = '';
		} else if (c === '"' || c === "'") {
			guillemet = c;
			sortie += c;
		} else if (c === '/' && scss[i + 1] === '*') {
			const fin = scss.indexOf('*/', i + 2);
			const bout = fin === -1 ? scss.length : fin + 2;
			sortie += scss.slice(i, bout).replace(/[^\n]/g, ' ');
			i = bout - 1;
		} else if (c === '/' && scss[i + 1] === '/' && scss[i - 1] !== ':') {
			// `scss[i - 1] !== ':'` : épargne le `//` d'une URL (`https://…`).
			const fin = scss.indexOf('\n', i);
			const bout = fin === -1 ? scss.length : fin;
			sortie += ' '.repeat(bout - i);
			i = bout - 1;
		} else sortie += c;
	}
	return sortie;
}

/** Liste de sélecteurs coupée aux virgules de premier niveau (pas celles d'un `:is(…)`). */
export function listeSelecteursScss(brut: string): string[] {
	const parts: string[] = [];
	let profondeur = 0;
	let courant = '';
	for (const c of brut) {
		if (c === '(' || c === '[') profondeur++;
		else if (c === ')' || c === ']') profondeur--;
		if (c === ',' && profondeur === 0) {
			parts.push(courant);
			courant = '';
		} else courant += c;
	}
	parts.push(courant);
	return parts.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/** Sélecteurs complets d'une pile de préludes imbriqués : `&` remplacé par le parent,
 *  descendant sinon. Les préludes `@` sont sautés. Sous un `&` sans parent (au sommet,
 *  ou dans un `@mixin`), le résultat est rogné : `html.x &` donne `html.x`, pas
 *  `html.x ` avec une espace qui fausserait le dernier composé. */
export function resoudreImbrication(pile: readonly string[]): string[] {
	let courants = [''];
	for (const brut of pile) {
		if (brut.startsWith('@')) continue; // @media, @supports, @mixin… : pas un sélecteur
		const enfants = listeSelecteursScss(brut);
		courants = courants.flatMap((parent) =>
			enfants.map((e) =>
				e.includes('&') ? e.split('&').join(parent).trim() : parent ? `${parent} ${e}` : e,
			),
		);
	}
	return courants;
}
