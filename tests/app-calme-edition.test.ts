/* ============================================================
   Écran calme et éditeur de bilan favori (#778).
   ------------------------------------------------------------
   `ecranCalme()` autorise la mise à jour automatique (rechargement) sur un écran
   « menu ». L'éditeur d'un favori réutilise l'écran du composeur `#bilan-custom`,
   mais son état ne vit qu'en mémoire : un rechargement perdrait la saisie de
   l'adulte. Le composeur de création, lui, garde sa valeur d'avant #778
   (`bilan-custom` figure dans les écrans menu).

   Mutations jouées contre `src/ui/app-calme.ts` (chacune rougit exactement le
   test visé, et lui seul) :
   - retirer la garde d'édition                    → « édition affichée » ;
   - ignorer `display` dans la garde               → « édition masquée » ;
   - garde sans `[data-edition]` (tout formulaire) → « création affichée » ;
   - retirer `bilan-custom` de `MENU_IDS`          → « création affichée ».
   ============================================================ */
import { describe, test, expect, beforeEach } from 'vitest';
import { ecranCalme } from '../src/ui/app-calme';

/* Deux écrans frères, comme dans l'appli : un seul affiché à la fois. `#home` est
   un écran menu, qui sert de témoin quand le composeur est masqué. */
function monter({
	composeurAffiche,
	edition,
}: {
	composeurAffiche: boolean;
	edition: boolean;
}): void {
	document.body.innerHTML =
		'<section id="home"></section>' +
		`<section id="bilan-custom"><form id="bilanConfigForm"${edition ? ' data-edition="fav-1"' : ''}></form></section>`;
	document.getElementById('home')!.style.display = composeurAffiche ? 'none' : '';
	document.getElementById('bilan-custom')!.style.display = composeurAffiche ? '' : 'none';
}

describe('ecranCalme : éditeur de bilan favori (#778)', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	test('composeur en mode édition affiché : pas calme (un rechargement perdrait la saisie)', () => {
		monter({ composeurAffiche: true, edition: true });
		expect(ecranCalme()).toBe(false);
	});

	test('composeur de création affiché : reste un écran menu, donc calme', () => {
		monter({ composeurAffiche: true, edition: false });
		expect(ecranCalme()).toBe(true);
	});

	test("formulaire d'édition resté dans le DOM mais composeur masqué, accueil affiché : calme", () => {
		monter({ composeurAffiche: false, edition: true });
		expect(ecranCalme()).toBe(true);
	});
});
