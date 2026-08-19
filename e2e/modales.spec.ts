/* ============================================================
   Modales custom accessibles (#230) — smoke tests : ouverture,
   validation, erreur inline, ESC, restauration du focus,
   confirm destructif et focus-trap.
   Les modales remplacent window.prompt/confirm/alert ; on les
   déclenche depuis l'ESPACE ENCADRANTS (#234), où vivent désormais
   la création de profil (« Nouveau profil ») et les actions
   destructives (réinitialiser / supprimer) — dans l'onglet Profils
   depuis la restructuration en onglets (#459).

   Note sélecteurs : les overlays statiques de gamification
   (celebrate, levelup, recompenses, trophees) et d'onboarding
   ont tous un `id`. L'overlay créé dynamiquement par ui-modal.ts
   n'en a pas. On le cible donc par `.modal-overlay:not([id])`.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, estAtteignable } from './helpers';

/* Alias : l'overlay ui-modal est le seul sans id dans le DOM. */
const uiModalOverlay = '.modal-overlay:not([id])';

/* ---------- 1. Ouverture sans erreur JS ---------- */
test('ouverture du prompt « Nouveau profil » : overlay visible, sans erreur', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	await page.locator('[data-act="enc-add"]').click();

	// L'overlay ui-modal est présent et visible.
	await expect(page.locator(uiModalOverlay)).toBeVisible();
	// La boîte est bien un dialog (pas alertdialog pour un prompt).
	await expect(page.locator(`${uiModalOverlay} .modal[role="dialog"]`)).toBeVisible();
	// Le titre et le champ de saisie sont visibles.
	await expect(page.locator(`${uiModalOverlay} .modal-title`)).toBeVisible();
	await expect(page.locator('#uimodal-input')).toBeVisible();

	// Annuler proprement.
	await page.keyboard.press('Escape');
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- 2. Enter soumet le prompt et crée le profil ---------- */
test('Enter soumet le prompt et crée le profil', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	const before = await page.locator('.enc-prof-card').count();

	await page.locator('[data-act="enc-add"]').click();
	await expect(page.locator('#uimodal-input')).toBeVisible();

	await page.locator('#uimodal-input').fill('TestE2E');
	await page.keyboard.press('Enter');

	// La modale se ferme.
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	// Une carte profil de plus est apparue.
	const after = await page.locator('.enc-prof-card').count();
	expect(after).toBe(before + 1);

	expect(errors).toEqual([]);
});

/* ---------- 3. Validation d'un champ vide : erreur inline, modale reste ouverte ---------- */
test('prompt vide : erreur inline visible, la modale reste ouverte', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	await page.locator('[data-act="enc-add"]').click();
	await expect(page.locator('#uimodal-input')).toBeVisible();

	// Vider le champ et cliquer le bouton de validation dans la modale ui-modal.
	await page.locator('#uimodal-input').fill('');
	await page.locator(`${uiModalOverlay} .modal-ok`).click();

	// L'erreur inline devient visible (l'attribut hidden doit être absent).
	const errEl = page.locator('#uimodal-error');
	await expect(errEl).toBeVisible();

	// La modale est TOUJOURS présente.
	await expect(page.locator(uiModalOverlay)).toBeVisible();

	// Nettoyer.
	await page.keyboard.press('Escape');
	expect(errors).toEqual([]);
});

/* ---------- 4. ESC ferme la modale et n'ajoute pas de profil ---------- */
test('ESC ferme le prompt sans créer de profil', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	const before = await page.locator('.enc-prof-card').count();

	await page.locator('[data-act="enc-add"]').click();
	await expect(page.locator(uiModalOverlay)).toBeVisible();

	await page.keyboard.press('Escape');

	// La modale est disparue.
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	// Aucune carte profil supplémentaire.
	const after = await page.locator('.enc-prof-card').count();
	expect(after).toBe(before);

	expect(errors).toEqual([]);
});

/* ---------- 5. Restauration du focus après ESC ---------- */
test('ESC sur le prompt restaure le focus sur le bouton déclencheur', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	await page.locator('#encAdd').click();
	await expect(page.locator(uiModalOverlay)).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	// Le focus doit être revenu sur le bouton « Nouveau profil ».
	const activeId = await page.evaluate(() => document.activeElement?.id);
	expect(activeId).toBe('encAdd');

	expect(errors).toEqual([]);
});

/* ---------- 6. Confirm destructif (reset) : alertdialog, focus sur l'action sûre ---------- */
test('confirm destructif reset : alertdialog + focus sur .modal-ok + ESC annule', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	// Déplier « Gérer ce profil » de la première carte, puis « Réinitialiser ».
	await page.locator('.enc-gerer > summary').first().click();
	await page.locator('[data-act="enc-reset"]').first().click();

	// La boîte est bien un alertdialog (action destructive).
	const modal = page.locator(`${uiModalOverlay} .modal[role="alertdialog"]`);
	await expect(modal).toBeVisible();

	// Le bouton danger est présent dans la modale.
	await expect(modal.locator('.modal-danger')).toBeVisible();

	// Le focus initial doit être sur l'action SÛRE (.modal-ok), pas sur .modal-danger.
	const activeClass = await page.evaluate(() => document.activeElement?.className ?? '');
	expect(activeClass).toMatch(/modal-ok/);
	expect(activeClass).not.toMatch(/modal-danger/);

	// ESC annule et ferme la modale sans réinitialiser.
	await page.keyboard.press('Escape');
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- 7. Focus-trap : Tab reste dans .modal ---------- */
test("focus-trap : Tab reste à l'intérieur de la modale", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	await page.locator('[data-act="enc-add"]').click();
	await expect(page.locator(uiModalOverlay)).toBeVisible();

	// Appuyer Tab plusieurs fois et vérifier que le focus reste dans .modal.
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Tab');
		const insideModal = await page.evaluate(() => {
			// La modale ui-modal est le seul .modal-overlay sans id.
			const overlay = document.querySelector('.modal-overlay:not([id])');
			const modal = overlay?.querySelector('.modal');
			const active = document.activeElement;
			return modal ? modal.contains(active) : false;
		});
		expect(insideModal).toBe(true);
	}

	// Nettoyer.
	await page.keyboard.press('Escape');
	expect(errors).toEqual([]);
});

/* ---------- 8. Focus initial SANS défilement (correctif partagé de modal-a11y.ts) ----------
   `activateModal` donnait le focus initial sans `preventScroll` : sur une modale plus haute que
   l'écran dont le focus initial vise un élément tout en bas de carte, le navigateur faisait
   défiler — la modale s'ouvrait donc DÉJÀ défilée à son pied (texte passé, croix de fermeture,
   en haut de la MÊME carte, hors écran). Le scroll en cause est celui de LA CARTE elle-même
   (`.modal { max-height: 85vh; overflow-y: auto }`, modal.scss), pas celui de la page — la page
   est verrouillée tant qu'une modale est ouverte (`lockBackground`). Correctif : le focus
   initial (lui seul) passe `{ preventScroll: true }` ; les focus de la boucle Tab continuent
   d'amener l'élément à l'écran.

   Ce test vit ICI (mécanique de modale PARTAGÉE) et non sous `etayage*.spec.ts` : le défaut est
   dans `modal-a11y.ts`, réutilisé par TOUTES les modales de l'app — le panneau d'étayage n'est
   que le porteur qui l'a révélé (échec intermittent d'`etayage-redige.spec.ts` avant correctif).

   Porteur choisi : le panneau d'étayage de la multiplication posée (`calc-multiplication-posee`,
   exemple fixe 47 × 26) — le panneau du catalogue dont le contenu dépasse FIABLEMENT la hauteur
   du viewport mobile par défaut (~934 px, cf. `etayage.spec.ts`), et dont le focus initial
   (`initialFocus: suivant`, `ui/etayage-panneau.ts`) vise justement le bouton tout en bas.
   Le contenu RÉDIGÉ (ex. `donnees-tableau-lire`, CM1) déborde LUI AUSSI du viewport une fois son
   renvoi au prérequis affiché, mais n'est PAS retenu ici : sa bulle mascotte (phrase plus longue,
   « Voilà comment on fait, tranquillement. ») empiète par moments sur le coin haut-droit de la
   croix et intercepte son clic — un défaut RÉEL et DISTINCT (`.mascotte-scene` peint après la
   croix dans le DOM, cf. `src/styles/aide-exercice.scss:76-83`), déjà responsable à lui seul
   d'une partie du flake historique d'`etayage-redige.spec.ts:117`. Un carrier sujet à un AUTRE
   bug ne donnerait pas un verrou déterministe pour CELUI-CI.

   Preuve d'atteignabilité SANS passer par un clic réel (qui hériterait des mêmes aléas
   d'actionabilité/scroll-retry de Playwright que ceux vus sur l'autre carrier) :
   `elementFromPoint` au centre géométrique de la croix doit résolver DANS la croix elle-même. */
test('modale plus haute que l’écran : s’ouvre à son début, croix atteignable dès l’ouverture', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-multiplication-posee');
	await page.locator('.etayage-btn').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	const modal = page.locator('#etayageOverlay .modal');
	// Même garde qu'`etayage.spec.ts` : si ce porteur ne déborde pas (régression de contenu/CSS
	// ailleurs), le test ci-dessous ne prouverait plus rien.
	const deborde = await modal.evaluate((el) => el.scrollHeight > el.clientHeight);
	expect(deborde, 'ce porteur doit déborder du viewport, sinon ce test ne prouve rien').toBe(true);

	// Le cœur du correctif : aucun défilement automatique au focus initial.
	const scrollTop = await modal.evaluate((el) => el.scrollTop);
	expect(scrollTop, 'la modale ne doit pas s’ouvrir déjà défilée à son pied').toBe(0);

	// Conséquence concrète : la croix de fermeture est GÉOMÉTRIQUEMENT atteignable dès
	// l'ouverture, sans le moindre geste. `estAtteignable` (helpers.ts) lit l'état BRUT du
	// rendu (aucun `scrollIntoView`/retry Playwright ne peut fausser la mesure, contrairement
	// à un `.click()`).
	const atteignable = await estAtteignable(page, '#etayageOverlay .aide-close');
	expect(
		atteignable,
		'croix de fermeture hors écran ou couverte par un autre élément dès l’ouverture',
	).toBe(true);

	// Fermeture par Échap (déjà éprouvée ailleurs, cf. etayage-redige.spec.ts) : garder CE test
	// concentré sur le seul correctif du scroll initial, sans dépendre du clic sur la croix ni
	// dérouler les pas jusqu'à la sortie (couvert par etayage.spec.ts).
	await page.keyboard.press('Escape');
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- 9. Mouvement réduit : le gabarit `.modal` perd son animation d'ouverture ----------
   `modal-pop` (250 ms, `scale(0.85) → scale(1)`) est le point de départ du flake corrigé
   ci-dessus dans etayage-redige.spec.ts (une commande de la modale cliquée PENDANT le zoom).
   Elle a aussi un coût d'accessibilité propre, indépendant de ce flake : un enfant sensible
   au mouvement (vestibulaire, attention, fatigue visuelle) devait la subir à CHAQUE ouverture
   de modale, sans échappatoire. Corrigée dans `src/styles/modal.scss` par DEUX règles, sur
   les deux voies par lesquelles ce réglage se décide ailleurs dans l'appli (cf. footer.ts,
   tour.ts) : la préférence SYSTÈME (`prefers-reduced-motion: reduce`) et le réglage IN-APP
   du profil (`html.anim-reduced`, posé par `applyPreferences()`). Un verrou par voie, plus
   une RÉFÉRENCE sans aucune des deux (l'animation doit bien exister par défaut, sinon les
   deux voies ne prouveraient rien). */
test('mouvement réduit (préférence système) : le gabarit de modale n’a plus d’animation d’ouverture', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	// Référence, SANS préférence : l'animation d'ouverture existe bel et bien.
	await page.locator('[data-act="enc-add"]').click();
	const modal = page.locator(`${uiModalOverlay} .modal[role="dialog"]`);
	await expect(modal).toBeVisible();
	const nParDefaut = await modal.evaluate((el) => el.getAnimations().length);
	expect(
		nParDefaut,
		'le gabarit doit avoir une animation par défaut, sinon ce test ne prouve rien',
	).toBeGreaterThan(0);
	await page.keyboard.press('Escape');
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	// Préférence SYSTÈME émulée : plus aucune animation sur le même gabarit.
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.locator('[data-act="enc-add"]').click();
	await expect(modal).toBeVisible();
	expect(await modal.evaluate((el) => el.getAnimations().length)).toBe(0);
	await page.keyboard.press('Escape');

	expect(errors).toEqual([]);
});

test('mouvement réduit (réglage in-app) : html.anim-reduced supprime aussi l’animation d’ouverture', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Réglage du profil (`ludaskia_anim`, préférences.ts), SANS forcer la préférence système :
	// isole que c'est bien la classe posée par applyPreferences() qui coupe l'animation, pas
	// un effet de bord du média émulé du test précédent (page/contexte distincts par test).
	await page.addInitScript(`localStorage.setItem('e2e/ludaskia_anim', 'true');`);
	await gotoHash(page, 'encadrant/profils');

	// Le réglage a bien posé la classe dès le chargement (voie RÉELLE, pas une classe forcée
	// à la main dans le test).
	await expect(page.locator('html')).toHaveClass(/anim-reduced/);

	await page.locator('[data-act="enc-add"]').click();
	const modal = page.locator(`${uiModalOverlay} .modal[role="dialog"]`);
	await expect(modal).toBeVisible();
	expect(await modal.evaluate((el) => el.getAnimations().length)).toBe(0);

	expect(errors).toEqual([]);
});
