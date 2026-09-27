/* ============================================================
   Anti-suggestion clavier — remasquage au retour de focus, restreint à
   Firefox à écran tactile (`remasquageUtile`, `ui/anti-suggestion.ts`).
   Tests écrits AVANT le correctif à partir du défaut constaté en séance
   réelle tablette + Firefox (bug B) ; le correctif est posé, ces tests le
   gardent.

   Les champs de réponse texte naissent en `type="password"` (`data-unmask`,
   `core/items.ts` lignes ~326-329) et sont démasqués en `type="text"` à la
   microtâche suivante par `ui/anti-suggestion.ts`. Firefox Android ne
   recalcule la configuration du clavier (suggestions coupées ou non) qu'à
   chaque ENTRÉE de focus : un focus posé sur un champ déjà « text » (retour
   de focus après « Écouter », « Cacher et écrire → », « Presque ! Réécoute »,
   « Vérifier » à vide, touche d'accent, tap direct) rallumait donc la barre
   de suggestions. Le correctif remasque désormais le champ à CHAQUE entrée de
   focus sur ce navigateur précis, et seulement sur lui (`remasquageUtile` =
   UA `Firefox/` ET `navigator.maxTouchPoints > 0`) : ailleurs (Chrome, y
   compris son émulation mobile), `hasBeenPasswordField` couvre déjà le cas,
   et le cycle n'y aurait que des coûts (curseur remis à 0 par Chrome, lecteur
   d'écran qui annoncerait « mot de passe » à chaque focus scripté).

   PROXY, pas un vrai Firefox : la suite pilote un Chromium AUQUEL ON IMPOSE
   l'UA d'un Firefox Android tablette (`test.use({ userAgent: … })`), sur le
   profil mobile `Pixel 5` (`hasTouch: true`, donc `maxTouchPoints > 0` —
   vérifié en tête de chaque test concerné, faute de quoi `remasquageUtile()`
   resterait faux et les assertions positives rougiraient pour une raison
   étrangère au code testé). Cela exerce la MÉCANIQUE de remasquage
   (`remasquageUtile` + `aRemasquer` + bascule de type), pas le clavier réel
   de GeckoView : rien ici ne prouve le comportement du clavier Firefox
   lui-même, seulement que l'app fait ce qu'il faut quand le navigateur
   s'annonce comme tel.

   Méthode de mesure : un écouteur `focusin` posé en phase de capture sur
   `document`, AVANT toute navigation (`page.addInitScript`), empile
   `{ id, type }` de chaque `<input>` focalisé dans `window.__focusTypes`. Lire
   le type au moment précis de l'entrée de focus est le seul moyen fiable de
   voir la fenêtre « password » : elle ne dure qu'un instant (jusqu'à la
   microtâche de démasquage), et la relire APRÈS coup via `getAttribute`
   manquerait systématiquement la valeur qui compte.

   Couverture :
   - B1 : focus d'ARRIVÉE sur une dictée, trouvé « password » (fenêtre
     d'insertion, indépendante de `remasquageUtile` — UA par défaut).
   - B2 à B6 : retours de focus (Écouter, Cacher et écrire, Vérifier à vide,
     touche d'accent, tap direct) sous UA Firefox Android tactile — chacun
     doit retrouver le champ en « password », sans perdre saisie ni curseur.
   - B6 vérifie en particulier la STABILITÉ du curseur après remasquage
     (`selectionStart` lu après 2 `requestAnimationFrame`, cf. `basculerType`).
   - B7, B8 (négatifs, UA par défaut) : un champ `readonly` ou sans
     `data-unmask` n'est jamais remasqué.
   - B9 (négatif, UA Chrome par défaut) : même geste que B2 (retour de focus
     après « Écouter »), hors Firefox tactile — le champ reste « text ».
   - B10 (UA Firefox Android tactile, comme B2-B6) : un tap au milieu d'un mot
     engage bien le remasquage (`surMousedown`/`surMouseup`), et le curseur lu
     sur le rendu en clair AVANT le tap est reposé à l'offset visé APRÈS — PAS
     une mesure du placement natif de Firefox (non observable ici).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { STUB_VOIX_FR, STUB_SANS_VOIX } from './journal-couverture';

interface FocusEntree {
	id: string;
	type: string;
}

/* Empile `{ id, type }` de tout <input> focalisé, dans l'ORDRE, dès l'entrée de focus —
   AVANT que la moindre logique applicative (dont le futur correctif) n'ait pu agir.
   Posé via `addInitScript` : DOIT être appelé avant `gotoHash`/toute navigation. */
async function installerFocusWatcher(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const w = window as unknown as { __focusTypes: FocusEntree[] };
		w.__focusTypes = [];
		document.addEventListener(
			'focusin',
			(e) => {
				const t = e.target;
				if (t instanceof HTMLInputElement) w.__focusTypes.push({ id: t.id, type: t.type });
			},
			true,
		);
	});
}

async function focusTypes(page: Page): Promise<FocusEntree[]> {
	return page.evaluate(() => (window as unknown as { __focusTypes: FocusEntree[] }).__focusTypes);
}

/** Longueur actuelle du journal de focus — à relever AVANT le geste qu'on observe,
    pour ne lire ensuite que les entrées qu'IL a produites. */
async function compteFocus(page: Page): Promise<number> {
	return (await focusTypes(page)).length;
}

/** Type enregistré à la DERNIÈRE entrée de focus sur `#orthoInput` parmi celles
    ajoutées depuis `depuis` (cf. `compteFocus`). `undefined` si aucune. */
async function typeAuDernierFocusOrthoInput(
	page: Page,
	depuis: number,
): Promise<string | undefined> {
	const nouveaux = (await focusTypes(page)).slice(depuis);
	return nouveaux.filter((e) => e.id === 'orthoInput').at(-1)?.type;
}

async function seedOrtho(page: Page, seed: unknown): Promise<void> {
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

/* Liste à un seul mot, découverte, rien de validé : les modes ciblés tuiles / mot
   caché / dictée sont donc tous proposés par l'écran de choix. Même forme que
   `ORTHO_SEED` (`ortho-clavier-focus.spec.ts`) — copie assumée, pas de partage pour
   ce seul appel supplémentaire. */
function seedUnMot(id: string, mot: string) {
	return {
		banque: {
			w1: {
				id: 'w1',
				mot,
				entourage: [],
				atelierFait: true,
				validation: { motCache: false, tuiles: false, dictee: false },
				revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
				origine: 'liste',
			},
		},
		listes: [{ id, label: 'Test anti-suggestion', motIds: ['w1'], createdAt: 1, updatedAt: 1 }],
		motIdParForme: { [mot]: 'w1' },
	};
}

const MOT = 'bonjour';

/* Le champ attendu, focalisé, déjà démasqué (les gestes qui suivent ne devraient
   jamais laisser le champ visible en pointillés de mot de passe). */
async function attendreDemasque(page: Page): Promise<void> {
	const input = page.locator('#orthoInput');
	await expect(input).toHaveAttribute('type', 'text');
	await expect(input).toBeFocused();
}

/* UA d'un Firefox Android sur tablette, réaliste (Gecko, pas FxiOS). Seul cet UA fait
   passer `remasquageUtile()` côté Chromium piloté — voir l'en-tête sur ce que ça
   prouve et ce que ça ne prouve pas. */
const UA_FIREFOX_ANDROID_TABLETTE =
	'Mozilla/5.0 (Android 14; Tablet; rv:131.0) Gecko/131.0 Firefox/131.0';

/* Témoin à poser en tête de chaque test qui dépend de `remasquageUtile()` : si le
   profil mobile perdait un jour `hasTouch`, `maxTouchPoints` tomberait à 0 et TOUTES
   les assertions positives (« retrouve le password ») rougiraient pour une raison
   étrangère au code testé (le remasquage ne se déclencherait jamais, quel que soit
   l'UA). Ce témoin fait échouer LÀ, avec un message qui dit pourquoi, plutôt que de
   laisser deviner depuis un « password » attendu jamais vu. */
async function verifierProfilTactile(page: Page): Promise<void> {
	const maxTouchPoints = await page.evaluate(() => navigator.maxTouchPoints);
	expect(
		maxTouchPoints,
		'témoin : le profil mobile doit exposer un écran tactile (maxTouchPoints > 0), sinon remasquageUtile() ne peut jamais valoir vrai',
	).toBeGreaterThan(0);
}

/* Lit `selectionStart` après au moins deux rendus (`requestAnimationFrame`) : Chrome
   remet le curseur à 0 au rendu qui SUIT le changement de type d'un champ focalisé
   (cf. `basculerType`, ui/anti-suggestion.ts) — une lecture immédiate pourrait passer
   avant ce rendu fautif et masquer une régression. */
async function selectionStartApresRendu(input: Locator): Promise<number | null> {
	return input.evaluate(
		(el: HTMLInputElement) =>
			new Promise<number | null>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve(el.selectionStart)));
			}),
	);
}

/* ============================================================
   B1 — arrivée sur une dictée (déjà vert aujourd'hui).
   ============================================================ */
test.describe('voix disponible (STUB_VOIX_FR)', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_VOIX_FR);
	});

	test('B1 : arrivée sur une dictée, le focus d’arrivée est enregistré « password », puis le champ redevient « text »', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await installerFocusWatcher(page);
		const LESSON_ID = 'l-e2e-antisugg-b1';
		await seedOrtho(page, seedUnMot(LESSON_ID, MOT));
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);

		const avant = await compteFocus(page);
		await page.locator('.mode-btn[data-mode="dictee"]').click();
		await expect(page.locator('#orthoInput')).toBeVisible();

		// Vert d'emblée : `renderDictee` (ui/ortho-taches.ts) appelle `input.focus()` de
		// façon SYNCHRONE, dans la même tâche que l'insertion du champ — donc AVANT que le
		// `MutationObserver` d'`anti-suggestion.ts` (une microtâche) n'ait démasqué le champ.
		// Mutation qui ferait rougir ce test demain : un correctif qui démasquerait le champ
		// de façon SYNCHRONE dès son insertion (au lieu d'attendre la microtâche suivante)
		// casserait cette fenêtre et ferait lire « text » ici.
		const type = await typeAuDernierFocusOrthoInput(page, avant);
		expect(type, 'le focus d’arrivée doit trouver le champ encore en password').toBe('password');

		await attendreDemasque(page);

		expect(errors).toEqual([]);
	});
});

/* ============================================================
   B2 à B6 — retours de focus dans un champ déjà démasqué. Remasquage
   restreint à Firefox tactile (`remasquageUtile`) : UA Firefox Android
   imposée (cf. en-tête, « PROXY »).
   ============================================================ */
test.describe('voix disponible (STUB_VOIX_FR) — retours de focus', () => {
	test.use({ userAgent: UA_FIREFOX_ANDROID_TABLETTE });

	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_VOIX_FR);
	});

	test('B2 : après une frappe, cliquer « Écouter » en dictée redemande le password au focus, sans perdre la saisie', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await verifierProfilTactile(page);
		await installerFocusWatcher(page);
		const LESSON_ID = 'l-e2e-antisugg-b2';
		await seedOrtho(page, seedUnMot(LESSON_ID, MOT));
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="dictee"]').click();
		const input = page.locator('#orthoInput');
		await expect(input).toBeFocused(); // critère 5 (#702), déjà acquis

		await page.keyboard.type('si');
		await expect(input).toHaveValue('si');

		const avant = await compteFocus(page);
		await page.locator('#btnEcouter').click();
		await expect(input).toBeFocused(); // critère 4 (#702), déjà acquis : le focus revient

		const type = await typeAuDernierFocusOrthoInput(page, avant);
		expect(
			type,
			'ce retour de focus doit retrouver le champ en password (recalcul du clavier)',
		).toBe('password');

		await attendreDemasque(page);
		await expect(input, 'la saisie en cours ne doit pas être perdue par le démasquage').toHaveValue(
			'si',
		);

		expect(errors).toEqual([]);
	});
});

/* ============================================================
   B3, B4, B5, B6 — mot caché, voix indisponible (le geste ne touche pas la
   dictée) : STUB_SANS_VOIX pour ne pas dépendre d'une voix SAPI locale.
   UA Firefox Android imposée (cf. en-tête, « PROXY »).
   ============================================================ */
test.describe('voix indisponible (STUB_SANS_VOIX)', () => {
	test.use({ userAgent: UA_FIREFOX_ANDROID_TABLETTE });

	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_SANS_VOIX);
	});

	/* Amène l'écran « mot caché » jusqu'à la zone de saisie VISIBLE et focalisée
	   (clic sur « Cacher et écrire → »). Partagé par B3, B4, B5, B6 : le point de
	   départ commun de tous ces critères. */
	async function ouvrirZoneSaisie(page: Page, lessonId: string): Promise<void> {
		await seedOrtho(page, seedUnMot(lessonId, MOT));
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + lessonId);
		await page.locator('.mode-btn[data-mode="motCache"]').click();
		await expect(page.locator('#motAffiche')).toBeVisible();
		await expect(page.locator('#zoneSaisie')).toBeHidden();
	}

	test('B3 : cliquer « Cacher et écrire → » redemande le password au focus qui apparaît', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await verifierProfilTactile(page);
		await installerFocusWatcher(page);
		await ouvrirZoneSaisie(page, 'l-e2e-antisugg-b3');

		const avant = await compteFocus(page);
		await page.locator('#btnCacher').click();
		await expect(page.locator('#zoneSaisie')).toBeVisible();
		await expect(page.locator('#orthoInput')).toBeFocused(); // critère 3 (#702), déjà acquis

		const type = await typeAuDernierFocusOrthoInput(page, avant);
		expect(type, 'le champ qui apparaît doit être trouvé en password par ce premier focus').toBe(
			'password',
		);

		await attendreDemasque(page);

		expect(errors).toEqual([]);
	});

	test('B4 (tap direct) : perdre le focus puis recliquer directement le champ redemande le password', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await verifierProfilTactile(page);
		await installerFocusWatcher(page);
		await ouvrirZoneSaisie(page, 'l-e2e-antisugg-b4');
		await page.locator('#btnCacher').click();
		await expect(page.locator('#orthoInput')).toBeFocused();

		// Perd le focus sur une zone neutre (aucun champ de saisie dessous).
		await page.locator('.ortho-run-consigne').click();
		await expect(page.locator('#orthoInput')).not.toBeFocused();

		const avant = await compteFocus(page);
		// Tap DIRECT (pas un retour programmatique après un bouton) : le cas le plus
		// courant sur tablette, et celui que l'astuce « mot de passe visible »
		// (`core/items.ts`) cible en premier lieu.
		await page.locator('#orthoInput').click();
		await expect(page.locator('#orthoInput')).toBeFocused();

		const type = await typeAuDernierFocusOrthoInput(page, avant);
		expect(type, 'un tap direct sur le champ doit aussi retrouver le password').toBe('password');

		await attendreDemasque(page);

		expect(errors).toEqual([]);
	});

	test('B5 : « Vérifier » cliqué à vide redonne le focus en password, sans consommer la saisie (vide)', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await verifierProfilTactile(page);
		await installerFocusWatcher(page);
		await ouvrirZoneSaisie(page, 'l-e2e-antisugg-b5');
		await page.locator('#btnCacher').click();
		await expect(page.locator('#orthoInput')).toBeFocused();

		const avant = await compteFocus(page);
		// Rien de saisi : `rienDePose` (ortho-taches.ts) affiche un message dans `#fb`
		// puis fait `blur()` PUIS `focus()` sur le champ, pour que le message lui soit
		// annoncé (aria-describedby) — c'est CE retour de focus qu'on observe ici.
		await page.locator('#btnVerifMot').click();
		await expect(page.locator('#fb')).not.toBeEmpty();
		await expect(page.locator('#orthoInput')).toBeFocused();

		const type = await typeAuDernierFocusOrthoInput(page, avant);
		expect(type, 'le refocus après « Vérifier » à vide doit lui aussi retrouver le password').toBe(
			'password',
		);

		await attendreDemasque(page);

		expect(errors).toEqual([]);
	});

	test('B6 : une touche d’accent redonne le focus en password, sans perdre la saisie ni la position du curseur', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await verifierProfilTactile(page);
		await installerFocusWatcher(page);
		await ouvrirZoneSaisie(page, 'l-e2e-antisugg-b6');
		await page.locator('#btnCacher').click();
		const input = page.locator('#orthoInput');
		await expect(input).toBeFocused();

		await page.keyboard.type('si');
		await expect(input).toHaveValue('si');

		const avant = await compteFocus(page);
		// `insertAtCursor` (ortho-taches.ts) rappelle `input.focus()` après avoir inséré le
		// caractère : c'est ce focus-là qui doit retrouver le password.
		await page.locator('.accent-key[data-c="é"]').click();
		await expect(input).toBeFocused();

		const type = await typeAuDernierFocusOrthoInput(page, avant);
		expect(type, 'le focus redonné après une touche d’accent doit retrouver le password').toBe(
			'password',
		);

		await attendreDemasque(page);
		await expect(input, 'la lettre accentuée doit être insérée').toHaveValue('sié');
		// Lu après 2 rendus, pas tout de suite : c'est CE délai qui a trouvé le vrai défaut
		// (Chrome remettait le curseur à 0 au rendu suivant le démasquage d'un champ
		// focalisé), corrigé par la mise en page forcée dans `basculerType`.
		const curseur = await selectionStartApresRendu(input);
		expect(curseur, 'le curseur doit être juste après la lettre insérée, et le rester').toBe(3);

		expect(errors).toEqual([]);
	});
});

/* ============================================================
   B7 (négatif) — un champ déjà validé (readonly) ne se fait pas remasquer.
   B8 (négatif) — un champ numérique (sans data-unmask) n'est jamais masqué.

   UA Firefox Android IMPOSÉE, contrairement à B7/B8 d'avant le correctif :
   SANS elle, `remasquageUtile()` est déjà faux sous l'UA par défaut, et ces
   deux gardes (`estChampMasquable` : `readOnly`/`disabled`, `data-unmask`) ne
   seraient jamais SOLLICITÉES — les mutations documentées ci-dessous ne
   feraient plus rougir ces tests (même piège que #702 : un négatif posé là où
   la mécanique qu'il garde ne s'engage jamais). C'est pourquoi ces deux tests
   sont désormais dans la section « retours de focus » du point de vue UA,
   quoique leur PROPOS reste un négatif distinct de B2-B6.

   B7 — mutation qui le ferait rougir : retirer `&& !el.readOnly && !el.disabled`
   d'`estChampMasquable` (ui/anti-suggestion.ts).
   B8 — mutation qui le ferait rougir : retirer le sélecteur `[data-unmask]`
   (remplacer `estChampMasquable` par un simple `el instanceof HTMLInputElement`).
   ============================================================ */
test.describe('voix disponible (STUB_VOIX_FR) — négatifs (garde readOnly/disabled, garde data-unmask)', () => {
	test.use({ userAgent: UA_FIREFOX_ANDROID_TABLETTE });

	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_VOIX_FR);
	});

	test('B7 (négatif) : un champ déjà validé (readonly) ne se fait pas remasquer au clic', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await verifierProfilTactile(page);
		await installerFocusWatcher(page);
		const LESSON_ID = 'l-e2e-antisugg-b7';
		await seedOrtho(page, seedUnMot(LESSON_ID, MOT));
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="dictee"]').click();
		const input = page.locator('#orthoInput');
		await input.waitFor();

		await input.fill(MOT);
		await page.locator('#btnVerifMot').click();
		await page.locator('.fb-ok').waitFor(); // réussite : le champ devient readonly
		expect(await input.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(true);

		const avant = await compteFocus(page);
		await input.click(); // un readonly reste cliquable/focalisable, juste pas éditable
		const nouveaux = (await focusTypes(page)).slice(avant);
		expect(
			nouveaux.some((e) => e.id === 'orthoInput'),
			'témoin : le clic doit bien produire une nouvelle entrée de focus',
		).toBe(true);
		expect(
			nouveaux.some((e) => e.type === 'password'),
			'un champ déjà validé (readonly) ne doit jamais être remasqué',
		).toBe(false);

		expect(errors).toEqual([]);
	});

	test('B8 (négatif) : un champ numérique sans data-unmask n’est jamais masqué au focus', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await verifierProfilTactile(page);
		await installerFocusWatcher(page);
		await gotoHash(page, 'lecon-num-encadrer-intercaler'); // mode saisie par défaut, réponses numériques
		const champ = page.locator('.ans').first();
		await champ.waitFor();
		expect(await champ.evaluate((el) => el.hasAttribute('data-unmask'))).toBe(false);

		// La fiche focalise déjà ce champ à son rendu (aucun clic n'a encore eu lieu) : cliquer
		// dessus tel quel ne produirait donc AUCUNE nouvelle entrée de focus (un navigateur ne
		// redéclenche pas `focusin` sur un élément déjà focalisé). On le fait perdre le focus
		// d'abord, pour observer un VRAI retour de focus par clic — le même geste que B4.
		await champ.evaluate((el) => (el as HTMLInputElement).blur());
		await expect(champ).not.toBeFocused();

		const avant = await compteFocus(page);
		await champ.click();
		const nouveaux = (await focusTypes(page)).slice(avant);
		expect(
			nouveaux.length,
			'témoin : le clic doit bien produire une nouvelle entrée de focus',
		).toBeGreaterThan(0);
		expect(
			nouveaux.some((e) => e.type === 'password'),
			'un champ numérique sans data-unmask ne doit jamais être mis en password',
		).toBe(false);

		expect(errors).toEqual([]);
	});
});

/* ============================================================
   B9 (négatif) — hors Firefox tactile, AUCUN retour de focus ne remasque
   quoi que ce soit. UA Chrome PAR DÉFAUT (profil mobile `Pixel 5` tel quel,
   sans surcharge) : c'est le régime de la quasi-totalité des tablettes et
   smartphones réels de la cible. Même geste que B2 (retour de focus après
   « Écouter » en dictée, après une frappe), pour montrer que c'est bien
   `remasquageUtile()` — pas le geste — qui fait la différence.

   Mutation qui le ferait rougir : retirer `remasquageUtile()` de `aRemasquer`
   (ui/anti-suggestion.ts) — le remasquage s'appliquerait alors partout, y
   compris ici, et `type` vaudrait « password » au lieu de « text ».
   ============================================================ */
test.describe('voix disponible (STUB_VOIX_FR) — négatif hors Firefox (UA Chrome par défaut)', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_VOIX_FR);
	});

	test('B9 (négatif) : sous Chrome, « Écouter » en dictée après frappe ne remasque jamais le focus', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await installerFocusWatcher(page);
		const LESSON_ID = 'l-e2e-antisugg-b9';
		await seedOrtho(page, seedUnMot(LESSON_ID, MOT));
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="dictee"]').click();
		const input = page.locator('#orthoInput');
		await expect(input).toBeFocused();

		await page.keyboard.type('si');
		await expect(input).toHaveValue('si');

		const avant = await compteFocus(page);
		await page.locator('#btnEcouter').click();
		await expect(input).toBeFocused(); // le focus revient (critère 4, #702), comme sous B2

		const type = await typeAuDernierFocusOrthoInput(page, avant);
		expect(
			type,
			'hors Firefox tactile, ce retour de focus ne doit jamais remasquer (remasquageUtile() reste faux)',
		).toBe('text');

		expect(errors).toEqual([]);
	});
});

/* ============================================================
   B10 — tap au milieu d'un mot, sous UA Firefox Android tactile (comme B2-B6,
   cf. en-tête « PROXY ») : SEULE cette UA engage `surMousedown`/`surMouseup`
   (`ui/anti-suggestion.ts`), donc `positionSousLeDoigt` avec elles. Sous
   Chrome, ni l'un ni l'autre ne s'exécute (`aRemasquer` faux d'entrée) : le
   test ne garderait alors rien de l'appli, seulement le hit-testing natif du
   navigateur — d'où l'UA imposée ici, contrairement à la 1re version.

   Ce que ce test PROUVE : le tap masque le champ (`surMousedown`, focus
   enregistré « password »), et le curseur — lu SOUS LE DOIGT sur le rendu en
   clair, AVANT ce masquage — est reposé au même offset une fois le champ
   redémasqué (`surMouseup`).
   Ce qu'il NE PROUVE PAS : le placement NATIF de Firefox Android/GeckoView
   sur un champ déjà masqué au moment du tap, qui n'est pas mesurable dans cet
   environnement (Chromium ne fait qu'IMITER l'UA, pas le moteur de rendu).
   ============================================================ */
test.describe('voix disponible (STUB_VOIX_FR) — curseur du tap (UA Firefox Android tactile)', () => {
	test.use({ userAgent: UA_FIREFOX_ANDROID_TABLETTE });

	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_VOIX_FR);
	});

	/* Cherche, par balayage pixel par pixel sur la ligne médiane du champ, le premier x
	   (coordonnées VIEWPORT, celles qu'attend `page.mouse.click`) où
	   `document.caretPositionFromPoint` désigne l'offset demandé DANS `#orthoInput`. Fait
	   AVANT le tap, alors que le champ est encore démasqué (perdu son focus, pas encore
	   retapé) : c'est le même rendu en clair que `positionSousLeDoigt` (ui/anti-
	   suggestion.ts) lira à son tour, aux mêmes coordonnées, DANS `surMousedown`. */
	async function pointPourOffset(
		page: Page,
		offsetCible: number,
	): Promise<{ x: number; y: number }> {
		const point = await page.evaluate((offsetCible) => {
			const el = document.querySelector('#orthoInput') as HTMLInputElement | null;
			if (!el) return null;
			const rect = el.getBoundingClientRect();
			const y = rect.top + rect.height / 2;
			const doc = document as Document & {
				caretPositionFromPoint?: (
					x: number,
					y: number,
				) => { offsetNode: Node; offset: number } | null;
			};
			if (!doc.caretPositionFromPoint) return null;
			for (let x = Math.ceil(rect.left); x <= Math.floor(rect.right); x++) {
				const p = doc.caretPositionFromPoint(x, y);
				if (p && p.offsetNode === el && p.offset === offsetCible) return { x, y };
			}
			return null;
		}, offsetCible);
		if (!point) throw new Error(`aucune position trouvée pour l'offset ${offsetCible}`);
		return point;
	}

	test('B10 (tap au milieu d’un mot) : le tap masque le champ puis repose le curseur à l’offset visé', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await verifierProfilTactile(page);
		await installerFocusWatcher(page);
		const LESSON_ID = 'l-e2e-antisugg-b10';
		await seedOrtho(page, seedUnMot(LESSON_ID, MOT));
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="dictee"]').click();
		const input = page.locator('#orthoInput');
		await expect(input).toBeFocused();

		// « wwwiiiwww » : 9 lettres, frontière visée entre la 6e (i) et la 7e (w), à
		// l'offset 6. Lettres sans accent ni ambiguïté de largeur pour un balayage simple.
		const MOT_TAPE = 'wwwiiiwww';
		await page.keyboard.type(MOT_TAPE);
		await expect(input).toHaveValue(MOT_TAPE);

		// Perd le focus sur une zone neutre, pour observer un VRAI retour de focus par tap.
		await page.locator('.ortho-run-consigne').click();
		await expect(input).not.toBeFocused();

		const { x, y } = await pointPourOffset(page, 6);
		const avant = await compteFocus(page);
		await page.mouse.click(x, y);
		await expect(input).toBeFocused();

		// Preuve que la mécanique s'est bien ENGAGÉE pendant le tap : `surMousedown` a
		// masqué le champ avant que le focus par défaut ne s'y pose, donc CE focus-là a
		// été enregistré « password » — pas seulement « le curseur tombe juste », qui
		// pourrait sinon n'être que le hit-testing natif du navigateur.
		const type = await typeAuDernierFocusOrthoInput(page, avant);
		expect(
			type,
			'le tap doit masquer le champ (surMousedown) : ce focus doit être enregistré « password »',
		).toBe('password');

		await attendreDemasque(page);

		// Le curseur, lu SOUS LE DOIGT sur le rendu en clair avant le masquage
		// (`positionSousLeDoigt`), doit être reposé au même offset par `surMouseup`.
		const curseur = await selectionStartApresRendu(input);
		expect(
			curseur,
			'le curseur reposé par surMouseup doit retomber exactement à l’offset visé (6)',
		).toBe(6);

		expect(errors).toEqual([]);
	});
});
