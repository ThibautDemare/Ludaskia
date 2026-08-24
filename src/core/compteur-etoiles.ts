import { html, VIDE, type SafeHtml } from './html';
/* ============================================================
   Compteur d'étoiles de l'accueil (#559) — texte, pur.
   ------------------------------------------------------------
   Le libellé de `#recLecon` (carte « Une leçon à la fois ») vivait inline dans
   `ui/render.ts`, donc hors de portée des tests : deux défauts y étaient passés
   inaperçus (le mot « étoile » qui disparaissait en mono-niveau, et un « 0 sur N »
   servi à tout enfant qui démarre). Il est ici, pur et testé.

   Deux branches, et c'est la première qui explique la seconde :
   - MULTI-NIVEAUX (l'enfant a des étoiles à une autre classe) : on met en avant le
     CUMUL « trésor », qui ne baisse jamais, et l'objectif de la classe passe en
     sous-ligne. Sans ça, changer de classe fait retomber le compteur scopé — le
     catalogue de la nouvelle classe étant plus petit — et l'enfant lit une perte
     là où il a progressé (#225) ;
   - MONO-NIVEAU : le cas de TOUS les débutants. Il disait « 12/33 leçons réussies
     sans faute », donc ni le mot ni le picto de l'étoile que la carte juste
     au-dessus lui promet, et « 0/33 » pour qui démarre.

   Règle commune, qui vaut dans les deux branches : jamais de « 0 sur N » servi à un
   enfant. Un zéro se lit comme une note.
   ============================================================ */

export interface EtatCompteurEtoiles {
	starsNiveau: number; // étoiles du niveau ACTIF
	totalNiveau: number; // leçons du catalogue du niveau ACTIF
	starsCumul: number; // étoiles TOUS niveaux confondus (le « trésor »)
	labelClasse: string; // « CE2 », « CM1 »…
}

const pluriel = (n: number) => (n > 1 ? 's' : '');

/** HTML interne de `#recLecon`. Aucun accès DOM, aucune lecture de stockage.
    Chaîne vide = rien à afficher (ni étoile gagnée, ni étoile à gagner). */
export function compteurEtoilesHTML(e: EtatCompteurEtoiles): SafeHtml {
	const { starsNiveau: n, totalNiveau: total, starsCumul: cumul, labelClasse } = e;
	if (cumul > n) {
		// Le cumul est le chiffre mis en avant, et sa formulation ne bouge pas (#225).
		const tresor = html`⭐ <strong>${cumul}</strong> étoile${pluriel(cumul)} gagnée${pluriel(cumul)}`;
		// Catalogue vide pour cette classe (niveau sans leçon) : il n'y a pas d'objectif à
		// énoncer, et « 0 étoile à gagner » serait le zéro qu'on refuse partout ailleurs.
		// On garde le trésor, on tait l'objectif — plutôt que de masquer un compteur que
		// l'enfant a rempli.
		if (total === 0) return tresor;
		// La sous-ligne NOMME les étoiles dans ses deux cas. Elle disait « 12/33 en CM1 »,
		// sans aucun nom — exactement le défaut que ce lot corrige trois lignes plus bas, et
		// il aurait été absurde de le laisser ici. Corrigé au-delà du cadrage, qui gelait la
		// formulation de cette branche (arbitrage du mainteneur).
		const objectif =
			n === 0
				? `${labelClasse} : ${total} étoile${pluriel(total)} à gagner`
				: `${n}/${total} étoile${pluriel(n)} en ${labelClasse}`;
		return html`${tresor}<span class="rec-sub">🎯 ${objectif}</span>`;
	}
	// Mono-niveau. Rien au catalogue ⇒ rien à dire (défensif : un niveau sans leçon).
	if (total === 0) return VIDE;
	// Qui démarre est INVITÉ, pas noté : même parti pris que la sous-ligne ci-dessus.
	// La classe n'est pas nommée ici, contrairement à la branche multi : il n'y en a
	// qu'une, le préciser n'apprendrait rien à l'enfant.
	if (n === 0) return html`⭐ <strong>${total}</strong> étoile${pluriel(total)} à gagner`;
	// Le mot ET le picto de l'étoile, comme la carte qui la promet juste au-dessus.
	return html`⭐ <strong>${n}/${total}</strong> étoile${pluriel(n)} gagnée${pluriel(n)}`;
}
