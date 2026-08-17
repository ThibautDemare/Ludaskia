/* ============================================================
   Carte d'accueil « programme terminé » (#517) — smoke tests e2e.
   ------------------------------------------------------------
   `renderProgrammeCard` (ui/seance.ts) a deux états : « à faire » (pastille
   d'action `.go`, clic -> #seance) et « fini » (pas de pastille, `card-inactive` :
   un CONSTAT, pas un bouton — même règle que la carte Révision quand rien n'est
   dû). Avant #517, le clic posait quand même `#seance` sans revérifier l'état ;
   si la carte était PÉRIMÉE (programme qui a bougé depuis son rendu : jour de
   récurrence passé, nouvelle journée), `showSeanceView` renvoyait aussitôt à
   l'accueil faute de programme applicable — un clic visiblement sans effet.

   Ce fichier couvre :
   1. l'état « fini » lui-même : classes, absence de pastille, emoji, et le
      clic qui ne quitte plus l'accueil ;
   2. la péremption pendant que l'onglet reste ouvert (horloge truquée) : le
      clic sur une carte périmée dont le programme n'est plus applicable SE
      CORRIGE (la carte disparaît) au lieu de naviguer vers un #seance mort ;
   3. le retour au premier plan (onglet resté ouvert toute la nuit,
      `visibilitychange` dans main.ts -> `rafraichirAccueilSiJourChange`,
      render.ts) qui rafraîchit l'accueil tout SEUL, sans le moindre clic —
      mais SEULEMENT si le jour civil a changé depuis le dernier rendu (avis
      a11y : re-rendre à chaque réveil de tablette détruirait pour rien le
      focus/déclencheur d'une modale ouverte au-dessus d'un accueil non
      masqué) ; un réveil LE MÊME JOUR ne doit rien régénérer.
   Complète programme-attribution.spec.ts (l'attribution elle-même) et
   programme-du-jour.spec.ts (le chemin nominal #seance).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Leçon réelle du catalogue CE2, mono-mode, fiche de 12 items (cf.
   programme-attribution.spec.ts) : cible FIXE d'une étape « Une leçon précise »,
   donc toujours applicable (contrairement à une étape « À revoir », dont le pool
   se vide dès que la leçon devient solide — pas ce qu'on veut tester ici). */
const LESSON_ID = 'math-complements';

const JOUR_MS = 24 * 60 * 60 * 1000;

/* Avance l'horloge de LA PAGE d'un jour civil complet, simulant un onglet
   resté ouvert au-delà de minuit sans jamais être rechargé (tablette en
   veille) — sans déclencher le moindre timer de l'appli (confettis retirés à
   +4,2 s dans ui/effects.ts, sauvegarde débouncée à la saisie dans main.ts) :
   `page.clock.setSystemTime` est documenté pour ça (« sets system time, but
   does not trigger any timers »), c'est la convention déjà en place côté projet
   (cf. e2e/README.md, `page.clock.fastForward` dans je-ne-sais-pas.spec.ts).
   Appelé TARD (après avoir terminé le programme, pas avant l'ouverture de la
   page) : tout ce qui précède — confettis, modales de récompense — tourne sur
   l'horloge RÉELLE du navigateur ; seul l'instant du clic ou du retour au
   premier plan qui suit est décalé. Pas de `clock.install`, qui FIGERAIT en plus
   les timers de la page : on ne veut décaler que la date lue. */
async function avancerDUnJour(page: Page): Promise<void> {
	const maintenant = await page.evaluate(() => Date.now());
	await page.clock.setSystemTime(maintenant + JOUR_MS);
}

/* Ferme les éventuelles modales de récompense (étoile / niveau / fête de fin de
   programme) qui intercepteraient le clic suivant (même pattern que
   programme-attribution.spec.ts). */
async function fermerModalesRecompense(page: Page): Promise<void> {
	for (let i = 0; i < 5; i++) {
		const levelup = page.locator('#levelupOk');
		if (await levelup.isVisible().catch(() => false)) {
			await levelup.click();
			continue;
		}
		const celebrate = page.locator('#celebrateOk');
		if (await celebrate.isVisible().catch(() => false)) {
			await celebrate.click();
			continue;
		}
		break;
	}
}

/* Choisit LESSON_ID comme cible de l'étape (def/étape donnés) via le sélecteur tous
   niveaux (#556, remplace l'ancien `<select data-act="seance-ref">`) : ouvre le
   panneau, déplie TOUT l'arbre (plus robuste qu'une recherche par libellé, qui
   recouplerait ce helper de mise en place aux intitulés du catalogue) puis clique
   la ligne de la cible. */
async function choisirLeconViaSelecteur(
	page: Page,
	defId: string,
	etapeId: string,
	lessonId: string,
): Promise<void> {
	await page
		.locator(`[data-act="seance-cible-ouvrir"][data-def="${defId}"][data-etape="${etapeId}"]`)
		.click();
	await page.evaluate(() => {
		document
			.querySelectorAll<HTMLDetailsElement>('.enc-seance-selecteur .enc-sel-d')
			.forEach((d) => (d.open = true));
	});
	await page.locator(`[data-act="seance-cible-choisir"][data-lesson="${lessonId}"]`).click();
}

/* Crée, via l'UI réelle du compositeur, un programme (d1) réduit à UNE étape
   « Une leçon précise » ciblant LESSON_ID, récurrente sur les `jours` demandés
   (1 = lundi … 7 = dimanche). Laisse la page sur l'accueil enfant. */
async function creerProgrammeLecon(page: Page, jours: number[]): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('lecon');
	await choisirLeconViaSelecteur(page, 'd1', 'e1', LESSON_ID);
	for (const jour of jours) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();
}

/* Depuis l'accueil, lance et termine la seule étape du programme (tuile #seance
   -> fiche LESSON_ID, sans-faute) puis revient à l'accueil par la barre
   d'outils (clic DOM : la barre fixe sort du viewport mobile). Laisse la carte
   #cardProgramme en état « fini ». */
async function terminerLeProgrammeEtRevenir(page: Page): Promise<void> {
	await page.locator('#cardProgramme').click();
	await expect(page).toHaveURL(/#seance$/);
	await page.locator('.programme-tuile[data-act="lancer"]').first().click();
	await expect(page).toHaveURL(new RegExp(`#lecon-${LESSON_ID}$`));

	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const count = await fields.count();
	for (let i = 0; i < count; i++) {
		const ans = (await fields.nth(i).getAttribute('data-answer')) ?? '';
		await fields.nth(i).fill(ans);
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await fermerModalesRecompense(page); // sans-faute = étoile (+ niveau éventuel)

	await page.evaluate(() => document.getElementById('btnHome')?.click());
	await fermerModalesRecompense(page); // fête de fin de programme éventuelle
	await expect(page.locator('#home')).toBeVisible();
}

test('carte programme terminée : pas de pastille d’action, emoji festif, le clic ne navigue plus', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Récurrence tous les jours : stable, indépendant du jour d'exécution du test.
	await creerProgrammeLecon(page, [1, 2, 3, 4, 5, 6, 7]);
	await terminerLeProgrammeEtRevenir(page);

	const carte = page.locator('#cardProgramme');
	await expect(carte).toHaveClass(/programme-card--fini/);
	await expect(carte).toHaveClass(/card-inactive/);
	await expect(carte.locator('.go')).toHaveCount(0); // plus de pastille d'action
	await expect(carte.locator('.lj-title')).toContainText('Terminé, bravo !');
	// L'emoji festif est DANS le titre (système monochrome commun aux cartes,
	// pas dans une pastille d'icône) et masqué aux lecteurs d'écran.
	const emoji = carte.locator('.lj-title [aria-hidden="true"]');
	await expect(emoji).toHaveText('🎉');

	const urlAvant = page.url();
	await carte.click();
	// Pas de pastille => pas d'action : le clic ne quitte pas l'accueil.
	await expect(page).toHaveURL(urlAvant);
	await expect(page.locator('#home')).toBeVisible();

	expect(errors).toEqual([]);
});

test('carte programme périmée (jour de récurrence passé) : le clic la corrige au lieu de naviguer vers un #seance mort', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Récurrence sur le SEUL jour d'aujourd'hui : demain, le programme ne
	// s'applique plus (jour différent) — la carte périme sans jamais être re-rendue.
	const jsDay = new Date().getDay(); // 0 = dimanche
	await creerProgrammeLecon(page, [jsDay === 0 ? 7 : jsDay]);
	await terminerLeProgrammeEtRevenir(page);

	const carte = page.locator('#cardProgramme');
	await expect(carte).toHaveClass(/programme-card--fini/);

	// L'onglet reste ouvert : on passe minuit SANS re-rendre l'accueil (la carte
	// affiche encore l'état d'hier, « fini »).
	await avancerDUnJour(page);

	await carte.click();
	// Le programme d'hier ne s'applique plus aujourd'hui : le clic recalcule
	// AVANT de naviguer, donc pas même un passage bref par #seance qui
	// renverrait aussitôt à l'accueil (cf. showSeanceView). La carte se corrige
	// d'elle-même : plus de programme du jour, elle disparaît.
	await expect(page).toHaveURL(/#accueil$/);
	await expect(carte).toBeHidden();

	expect(errors).toEqual([]);
});

/* Force `document.visibilityState` à 'visible' et redéclenche l'événement à la
   main : Playwright n'a pas d'API fiable pour rebasculer un vrai onglet
   Chromium headless en visible (`bringToFront()` ne change pas
   `visibilityState` sous ce mode), donc on pose le getter et on redispatche
   l'événement que `main.ts` écoute réellement. Aucune modale de récompense ne
   doit traîner ouverte à cet instant (l'abstention `inert` de
   `rafraichirAccueilSiJourChange` s'appliquerait sinon, faisant conclure à
   tort à une régression) — `terminerLeProgrammeEtRevenir` s'en assure déjà
   (elle ferme tout avant de rendre la main). */
async function simulerRetourPremierPlan(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'visible',
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});
}

test('retour au premier plan après minuit (jour civil changé) : l’accueil se rafraîchit tout seul, sans clic', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Récurrence tous les jours : encore applicable demain, mais avec une
	// journée fraîche (rien fait) — le cas qui doit se corriger tout seul.
	await creerProgrammeLecon(page, [1, 2, 3, 4, 5, 6, 7]);
	await terminerLeProgrammeEtRevenir(page);

	const carte = page.locator('#cardProgramme');
	await expect(carte).toHaveClass(/programme-card--fini/);

	await avancerDUnJour(page);
	await simulerRetourPremierPlan(page);

	// Nouvelle journée, rien fait : la carte redevient « à faire » SANS le
	// moindre clic (c'est tout le point du fix #517 côté visibilitychange).
	await expect(carte).not.toHaveClass(/programme-card--fini/);
	await expect(carte.locator('.go')).toBeVisible();
	await expect(carte.locator('.lj-sub')).toHaveText('0 sur 1 déjà fait');

	expect(errors).toEqual([]);
});

test('retour au premier plan LE MÊME JOUR : l’accueil ne se régénère pas à chaque réveil de tablette', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Aucune horloge truquée ici : le jour civil ne change pas, c'est justement
	// le point du test (pas besoin de simuler quoi que ce soit pour ça).
	await creerProgrammeLecon(page, [1, 2, 3, 4, 5, 6, 7]);
	await terminerLeProgrammeEtRevenir(page);

	const carte = page.locator('#cardProgramme');
	await expect(carte).toHaveClass(/programme-card--fini/);

	// Marqueur posé sur un nœud DE L'INTÉRIEUR de la carte : un re-rendu
	// remplace `innerHTML` (nouveaux nœuds), même si le contenu final est
	// identique au caractère près — donc si le marqueur survit, c'est la
	// preuve qu'aucun re-rendu n'a eu lieu (pas seulement que le résultat se
	// ressemble).
	await page.evaluate(() => {
		document.querySelector('#cardProgramme .lj-title')?.setAttribute('data-e2e-marker', '1');
	});

	await simulerRetourPremierPlan(page); // même jour : ne doit RIEN régénérer

	await expect(page.locator('#cardProgramme .lj-title[data-e2e-marker="1"]')).toHaveCount(1);
	await expect(carte).toHaveClass(/programme-card--fini/); // état inchangé

	expect(errors).toEqual([]);
});
