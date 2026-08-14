/* ============================================================
   Activation clavier des cartes de l'accueil (#517, volet a11y) — smoke e2e.
   ------------------------------------------------------------
   Avant ce correctif, la pastille d'action de chaque carte (« On y va → »,
   « C'est parti → »…) était un `<span>` : jamais dans l'ordre de tabulation,
   donc hors de portée au clavier — seule la carte ENTIÈRE, cliquable à la
   souris/au doigt, portait l'action. Elle est désormais un vrai
   `<button type="button" class="go">`, avec un `aria-label` qui reprend son
   libellé visible ET nomme sa carte (« Sprint 5 min : c'est parti »…). La
   carte reste cliquable en entier ; le clic du bouton remonte au même
   listener (posé sur la carte), aucune logique dupliquée. Pas de
   `role="button"` sur la carte elle-même : il aplatirait son `<h2>` et
   avalerait les boutons imbriqués (« Voir une autre leçon »).

   Corollaire : une carte SANS action (`card-inactive` — Révision quand rien
   n'est dû, programme terminé, cf. programme-carte-terminee.spec.ts) masque sa
   pastille en CSS (`.card.card-inactive .go { display:none }`), qui sort donc
   NATIVEMENT de l'ordre de tabulation, sans réglage supplémentaire.

   Ce fichier couvre, sur l'accueil d'un profil e2e neuf (rien épinglé, rien
   programmé — la carte Révision y est donc `card-inactive` par défaut, cf.
   `countDue` = 0 côté render.ts) :
   1. une carte DYNAMIQUE (« Ta prochaine leçon ») activable à l'Entrée ;
   2. une carte STATIQUE (Sprint) activable à l'Espace, sans défilement
      intempestif de la page en plus de l'activation ;
   3. l'ORDRE RÉEL de tabulation entre cartes voisines (2 sauts `Tab` distincts
      bootstrapés depuis une pastille déjà focusée) : la carte Révision,
      inactive, est sautée d'un bloc — la preuve qu'il n'y a plus RIEN de
      focusable dedans (pas seulement sa pastille), pas juste qu'un sélecteur
      isolé échoue à se focus.

   Pattern `.focus()` + `keyboard.press()` : celui déjà en usage dans la suite
   (appariement.spec.ts, revision.spec.ts, champs-lexicaux.spec.ts…). `.focus()`
   est un NO-OP natif sur un élément non focusable (display:none, ou un <span>
   sans tabindex) : `toBeFocused()` ensuite est donc un test RÉEL de
   focusabilité, pas une simulation qui masquerait une régression. Le test 3
   ajoute deux sauts `Tab` réels (bootstrapés depuis un ancrage `.focus()`) pour
   la seule chose qu'un `.focus()` isolé ne peut pas prouver : l'ORDRE de
   tabulation entre cartes voisines (un `tabindex="-1"` égaré rendrait un
   élément `.focus()`-able mais absent du parcours Tab naturel).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('carte dynamique « Ta prochaine leçon » : pastille focusable, activable à l’Entrée, aria-label présent', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	// Catalogue CE2 largement fourni : un profil neuf n'a jamais « fait le tour »
	// (mode 'lesson', pas la carte de félicitations) — hypothèse déjà faite par
	// accueil-propositions.spec.ts.
	const carte = page.locator('#leconDuJour');
	await expect(carte).toHaveAttribute('data-mode', 'lesson');
	const lessonId = await carte.getAttribute('data-lesson');
	if (!lessonId) throw new Error('#leconDuJour sans data-lesson : profil neuf CE2 attendu');

	const pastille = carte.locator('.go');
	const label = (await pastille.getAttribute('aria-label')) ?? '';
	expect(label).toBe("Ta prochaine leçon : c'est parti");
	// Reprend bien le libellé VISIBLE du bouton (insensible à la casse : l'aria-label
	// le cite en milieu de phrase, le bouton l'affiche en début de phrase).
	const visible = ((await pastille.textContent()) ?? '').trim();
	expect(label.toLowerCase()).toContain(visible.replace('→', '').trim().toLowerCase());

	await pastille.focus();
	await expect(pastille).toBeFocused(); // vraiment focusable (pas un <span>)
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(new RegExp(`#(mode|lecon)-${lessonId}$`));

	expect(errors).toEqual([]);
});

test('carte statique (Sprint) : pastille activable à l’Espace, sans défilement intempestif', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	const pastille = page.locator('#cardSprint .go');
	await expect(pastille).toHaveAttribute('aria-label', "Sprint 5 min : c'est parti");

	await pastille.focus();
	await expect(pastille).toBeFocused();

	// Mesuré IMMÉDIATEMENT après l'appui (avant tout `hashchange` async déclenché par
	// l'activation) : le défilement natif « page suivante » d'Espace sur un élément
	// NON interactif est intercepté en synchrone par le navigateur pour un vrai
	// <button> — jamais retardé à une micro/macro-tâche ultérieure. Si la pastille
	// perdait sa sémantique de bouton (retour à un <span tabindex>), ce défilement
	// natif réapparaîtrait ici, avant même que l'appli ait eu la main.
	const scrollAvant = await page.evaluate(() => window.scrollY);
	await page.keyboard.press('Space');
	const scrollApres = await page.evaluate(() => window.scrollY);
	expect(scrollApres).toBe(scrollAvant);

	await expect(page).toHaveURL(/#sprint-config$/);

	expect(errors).toEqual([]);
});

test('ordre de tabulation réel entre cartes voisines : la carte Révision (inactive) est sautée d’un bloc', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	// Condition du test : profil neuf → rien à réviser → carte inactive par défaut.
	const cardRevision = page.locator('#cardRevision');
	await expect(cardRevision).toHaveClass(/card-inactive/);
	const pastilleRevision = cardRevision.locator('.go');
	await expect(pastilleRevision).toBeHidden();
	// `.focus()` est un no-op natif sur un élément `display:none` : preuve directe,
	// indépendante du saut Tab qui suit, qu'il n'est plus dans l'ordre de tabulation.
	await pastilleRevision.focus();
	await expect(pastilleRevision).not.toBeFocused();

	// Ancrage réel : la pastille de la carte dynamique, première carte active du
	// flux sur un profil neuf (programme/à revoir masqués, cf. programme-*.spec.ts).
	const leconGo = page.locator('#leconDuJour .go');
	await leconGo.focus();
	await expect(leconGo).toBeFocused();

	await page.keyboard.press('Tab'); // -> « Voir une autre leçon » (même carte)
	await expect(page.locator('#leconDuJour [data-lj="autre"]')).toBeFocused();

	await page.keyboard.press('Tab'); // -> carte Sprint (voisine directe dans .cards)
	await expect(page.locator('#cardSprint .go')).toBeFocused();

	await page.keyboard.press('Tab'); // -> devrait sauter Révision (inactive) d'un bloc
	await expect(page.locator('#cardLecon .go')).toBeFocused();

	expect(errors).toEqual([]);
});
