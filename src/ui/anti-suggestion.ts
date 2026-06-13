/* ============================================================
   Anti-suggestion clavier — « mot de passe visible » (issues #67/#123/#139).

   Les champs de réponse texte sont rendus en `type="password"` (cf.
   `TEXT_ANSWER_INPUT_ATTRS` dans core/items.ts) car c'est le seul moyen fiable de
   couper la barre de suggestions prédictives des claviers mobiles, qui « souffle »
   sinon la bonne réponse. Mais un vrai password masque le texte (les points), et
   `-webkit-text-security: none` ne le démasque PAS (vérifié sur Chrome et Firefox).

   Astuce (comportement du bouton « œil » des champs de mot de passe) : un champ NÉ
   en `type="password"` puis basculé en `type="text"` AVANT son premier focus est
   traité par Android (Chrome/Gboard) comme un « mot de passe visible »
   (textVisiblePassword) : le texte est lisible ET le clavier continue de NE PAS
   proposer de suggestions. On démasque donc tous les champs `[data-unmask]` dès leur
   insertion dans le DOM, via un observateur global (les vues sont rendues par
   innerHTML un peu partout : un observateur couvre tous les sites en un seul point).

   Les champs sont insérés VIDES, donc le bref instant où ils sont encore password
   n'affiche aucun point : pas de scintillement.
   ============================================================ */

/** Démasque un champ password marqué `data-unmask` (le rend lisible). */
function unmask(el: Element): void {
	if (el instanceof HTMLInputElement && el.type === 'password') el.type = 'text';
}

/** Démasque tous les champs `[data-unmask]` présents sous `root`. */
function unmaskWithin(root: ParentNode): void {
	root.querySelectorAll('input[data-unmask]').forEach(unmask);
}

/** Installe le démasquage automatique des champs de réponse texte (à appeler une
    fois, après que `document.body` existe). */
export function installVisiblePasswordReveal(): void {
	unmaskWithin(document); // champs déjà rendus avant l'installation
	const observer = new MutationObserver((records) => {
		for (const rec of records) {
			rec.addedNodes.forEach((node) => {
				if (!(node instanceof Element)) return;
				// Le nœud ajouté peut être le champ lui-même ou un conteneur l'englobant.
				if (node.matches('input[data-unmask]')) unmask(node);
				else unmaskWithin(node);
			});
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
}
