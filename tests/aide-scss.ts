/* ============================================================
   Lecture statique des feuilles SCSS, partagée par les gates qui les inspectent
   (`contraste-tokens.test.ts`, `contraste-decor-saison.test.ts`, `decor-fige.test.ts`).
   Pas une suite : le nom sans `.test.` la tient hors de l'include de Vitest.

   Ce que ces fonctions savent faire : retirer les commentaires sans toucher aux chaînes,
   couper une liste de sélecteurs aux virgules de premier niveau, résoudre l'imbrication
   SCSS avec ou sans `&`, lister les déclarations `propriété: valeur` avec la règle qui les
   porte. Ce qu'elles ignorent : les préludes `@` (`@media`, `@mixin`, `@at-root`…) sont
   sautés, pas interprétés (`declarations` les rapporte tels quels dans `conditions`) ; à
   l'appelant de décider s'il doit les signaler.
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

/** Une déclaration `propriété: valeur` d'une feuille, et la règle qui la porte. */
export type Declaration = {
	fichier: string;
	ligne: number;
	/** Sélecteurs complets de la règle (imbrication et `&` résolus, at-rules ignorées). */
	selecteurs: string[];
	/** Préludes `@` qui enveloppent la règle (`@media screen`…), du plus extérieur au plus
	 *  intérieur : `selecteurs` les ignore, ce champ dit OÙ la règle s'applique (#785). */
	conditions: string[];
	propriete: string;
	valeur: string;
};

/** Déclarations `propriété: valeur` d'une feuille, avec la règle qui les porte. */
export function declarations(fichier: string, scss: string): Declaration[] {
	const src = sansCommentairesScss(scss);
	const pile: string[] = [];
	const trouvees: Declaration[] = [];
	let tampon = '';
	let ligne = 1;
	let ligneTampon = 1;
	let guillemet = '';
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
			// Interpolation SCSS `#{…}` : ses accolades ne sont pas celles d'une règle.
			const fin = src.indexOf('}', i);
			tampon += src.slice(i, fin + 1);
			i = fin;
		} else if (c === '{') {
			pile.push(tampon.trim());
			tampon = '';
		} else if (c === ';' || c === '}') {
			const m = tampon.trim().match(/^([\w-]+)\s*:([\s\S]*)$/);
			if (m)
				trouvees.push({
					fichier,
					ligne: ligneTampon,
					selecteurs: resoudreImbrication(pile),
					conditions: pile.filter((p) => p.startsWith('@')),
					propriete: m[1].toLowerCase(),
					valeur: m[2].trim(),
				});
			tampon = '';
			if (c === '}') pile.pop();
		} else tampon += c;
	}
	return trouvees;
}

/** Dernier composé d'un sélecteur : l'élément que la règle colore. */
export const sujet = (selecteur: string) => selecteur.split(/\s*[>+~]\s*|\s+/).pop() ?? '';

/** Une déclaration sur une ligne, pour les messages d'échec. */
export const decrire = (d: Declaration) =>
	`${d.fichier}:${d.ligne}  ${d.selecteurs.join(', ')} { ${d.propriete}: ${d.valeur} }`;
