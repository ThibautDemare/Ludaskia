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
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ecranCalme } from '../src/ui/app-calme';
import {
	ouvrirEditionFavori,
	afficherEditionFavori,
	oublierEditionFavori,
} from '../src/ui/bilan-edition';
import { saveBilan } from '../src/core/bilans';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

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

/* Les tests ci-dessus montent un formulaire FACTICE, marqué à la main. Si le composeur
   cessait de poser ce marqueur (renommé, déplacé hors du formulaire), la garde de
   `ecranCalme` ne verrait plus l'éditeur et ces tests resteraient verts. Celui-ci passe
   donc par le VRAI chemin : le crayon (`ouvrirEditionFavori`) puis le rendu de l'éditeur
   (`afficherEditionFavori`), tels que le routeur les enchaîne.

   Mutations jouées sur le DOM rendu (le composeur lui-même n'a pas été modifié) : marqueur
   renommé (`data-edite`), ou porté par le parent du formulaire → rouge sur
   `ecranCalme() === false`. Un `vi.mock` du composeur ne prend pas : `bilan-edition.ts` le
   reçoit par un cycle d'imports qui contourne le mock (constaté). */
describe('ecranCalme : éditeur de bilan favori rendu par le vrai chemin (#778)', () => {
	beforeEach(() => {
		localStorage.clear();
		setOnDataWrite(touchActiveProfile);
		initProfiles();
	});
	afterEach(() => {
		oublierEditionFavori();
		document.body.innerHTML = '';
		location.hash = '';
	});

	test('favori ouvert au crayon et rendu dans #bilan-custom affiché : pas calme', () => {
		const uuid = activeProfile().uuid;
		saveBilan({
			id: 'fav-1',
			label: 'Doubles et moitiés',
			lessonIds: ['math-doubles', 'math-moities'],
			questionsPerLesson: 3,
		});
		document.body.innerHTML =
			'<section id="home" style="display:none"></section>' +
			'<section id="bilan-custom"><div id="bilanCustomBody"></div></section>';
		const el = document.getElementById('bilanCustomBody')!;

		ouvrirEditionFavori(uuid, 'fav-1');
		expect(afficherEditionFavori(el)).toBe('rendu');

		expect(ecranCalme()).toBe(false);
		// Témoin : l'édition quittée (le routeur retire le formulaire), le même écran
		// redevient un écran menu. Le `false` ci-dessus venait donc bien de l'éditeur rendu,
		// pas d'un montage où aucun écran menu ne serait visible.
		oublierEditionFavori();
		expect(ecranCalme()).toBe(true);
	});
});
