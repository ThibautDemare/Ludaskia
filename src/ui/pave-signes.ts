/* ============================================================
   Pavé de signes « < = > » (#380) — comportement.

   Le rendu (bouton + champ `.ans-signe`) vit dans core/signes.ts / core/items.ts ;
   ici, deux écouteurs DÉLÉGUÉS posés une fois (couvrent les champs présents et
   futurs, comme grand-nombre-echo #327) :
   - clic sur un bouton du pavé → le signe remplit le champ associé, puis on émet
     un évènement `input` (bulle) : le marquage ✓/✗ s'efface par le chemin normal
     de session.ts, exactement comme une frappe au clavier ;
   - évènement `input` sur un champ `.ans-signe` (tap OU frappe clavier physique)
     → synchronise l'état « choisi » (aria-pressed) des trois boutons du pavé.
   Le focus RESTE sur le bouton tapé : on ne focalise pas le champ (pas de saut
   de vue, et surtout pas d'ouverture de clavier — avis dys/designer). L'enfant
   voit sa réponse à deux endroits : le bouton enfoncé ET le champ rempli.
   ============================================================ */

/** Installe le pavé de signes (à appeler une fois, cf. wireDOM de main.ts). */
export function installPaveSignes(): void {
	document.addEventListener('click', (e: Event) => {
		const cible = e.target instanceof Element ? e.target.closest('.pave-signe') : null;
		if (!(cible instanceof HTMLButtonElement)) return;
		const champ = document.getElementById(cible.dataset.for ?? '');
		if (!(champ instanceof HTMLInputElement)) return;
		champ.value = cible.dataset.signe ?? '';
		// Même chemin que la frappe : session.ts efface le marquage, et l'écouteur
		// `input` ci-dessous met à jour l'état des boutons.
		champ.dispatchEvent(new Event('input', { bubbles: true }));
	});
	document.addEventListener('input', (e: Event) => {
		const champ = e.target;
		if (!(champ instanceof HTMLInputElement) || !champ.classList.contains('ans-signe')) return;
		const val = champ.value.trim();
		document
			.querySelectorAll<HTMLButtonElement>(`.pave-signe[data-for="${champ.id}"]`)
			.forEach((b) =>
				b.setAttribute('aria-pressed', String(val !== '' && b.dataset.signe === val)),
			);
	});
}
