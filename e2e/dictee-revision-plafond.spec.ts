/* ============================================================
   Orthographe — le mot sacrifié au plafond de séance, en tour de révision (#706,
   critères 8/9/10/11 ajoutés après coup — commentaire daté sur l'issue).

   Défaut CORRIGÉ, qui vivait dans `renderNext` (ortho-runner.ts) : le mot suivant était
   tiré par `prochainNonMaitrise` — qui fait avancer le curseur `idx` — AVANT le test du
   plafond `SEANCE_MAX`. Quand le plafond était atteint, `renderNext` basculait sur la
   pause et le mot déjà tiré était perdu. En tour de révision le curseur avance
   STRICTEMENT (`idx++`, sans cycle) : ce mot n'était jamais rejoué, et le tour se
   terminait un mot trop tôt — sauté, jamais compté nulle part.

   Correctif appliqué : le mot tiré au plafond est gardé en attente (`motEnAttente`) dans
   le runner et servi en PREMIER au prochain rendu, au lieu d'être jeté ; cette attente est
   remise à zéro au lancement d'une séance (`startOrthoRun`) — d'où le critère 11.

   Isolation nécessaire pour observer QUEL mot est servi (critères 8 et 9) : en tour de
   révision, l'activité proposée pour un mot déjà entièrement maîtrisé est « la marche la
   plus haute jouable » (`marcheLaPlusHaute`), qui vaut la dictée SI le TTS est là, sinon
   le mot caché. Or seul le mot caché affiche le mot en clair à l'écran (la dictée ne fait
   qu'écouter) — et la disponibilité du TTS varie d'un environnement à l'autre (constaté :
   une voix française est parfois rapportée par Chromium en local, jamais en CI headless).
   On force donc l'ABSENCE de voix (`STUB_SANS_VOIX`, déjà partagé par d'autres specs
   orthographe), ce qui fixe la marche à « mot caché » PARTOUT, plutôt que de dépendre
   d'un hasard d'environnement pour un test qui a besoin de lire le mot affiché.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { seedListeMaitrisee, MOTS_MAITRISES as MOTS } from './ortho-liste-maitrisee';
import { STUB_SANS_VOIX } from './journal-couverture';

test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
	// Force la marche « mot caché » (cf. bandeau d'en-tête) : seule à afficher le mot en
	// clair, condition pour savoir lequel a été servi à chaque activité.
	await page.addInitScript(STUB_SANS_VOIX);
});

async function semerEtLancer(page: Page, id: string, mots: string[]): Promise<void> {
	const seed = seedListeMaitrisee(id, mots);
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
	await gotoHash(page, `ortho-mode-${id}`);
	await page.locator('.mode-btn.recommended').click();
}

/* Relance la MÊME liste depuis son écran de choix (nouveau `startOrthoRun`), sans
   modifier la banque : sert le critère 11 (un curseur/une attente propres à chaque
   lancement). */
async function relancer(page: Page, id: string): Promise<void> {
	await gotoHash(page, `ortho-mode-${id}`);
	await page.locator('.mode-btn.recommended').click();
}

/* Lit le mot actuellement affiché en clair par la tâche « mot caché » (avant le clic sur
   « Cacher et écrire → »). Chaque lettre est un span `.atelier-lettre`
   (`ortho-atelier.ts`, `lettresMotHTML`) ; leur concaténation, c'est `#motAffiche`. */
async function lireMotAffiche(page: Page): Promise<string> {
	const texte = await page.locator('#motAffiche').textContent();
	return (texte ?? '').trim();
}

/* Complète l'activité « mot caché » affichée en relevant D'ABORD le mot montré (pour
   savoir lequel a été servi), puis en le cachant et en le retapant. */
async function completerEnRelevant(page: Page): Promise<string> {
	const mot = await lireMotAffiche(page);
	await page.locator('#btnCacher').click();
	await page.locator('#orthoInput').fill(mot);
	await page.locator('#btnVerifMot').click();
	return mot;
}

interface ResultatTour {
	/** Mots servis, dans l'ordre où ils l'ont été. */
	servis: string[];
	/** Nombre de mots déjà servis au moment où la PREMIÈRE pause est apparue (`null` si
	    aucune pause n'a été rencontrée dans le nombre de tours accordé). */
	pauseApresServis: number | null;
}

/* Joue le tour de révision jusqu'à son écran terminal (ou jusqu'à `maxMots` activités
   servies, garde-fou), en franchissant TOUTE pause rencontrée via « Continuer encore un
   peu » — pour observer le tour dans son ENSEMBLE (critères 8 et 9). Suppose une liste
   déjà lancée en parcours complet sur des mots tous maîtrisés.

   `page.waitForSelector` (pas `.isVisible()` en lecture directe) AVANT de décider quel
   écran est affiché : un clic sur un bouton qui change `location.hash` (choix de mode,
   « Continuer encore un peu ») ne rend pas la vue suivante SYNCHRONEMENT — le routeur
   réagit au `hashchange`, sur un tour de boucle d'évènements séparé. Une lecture one-shot
   juste après le clic peut donc encore voir l'écran PRÉCÉDENT et conclure à tort que la
   liste est terminée (cf. `e2e/README.md`, « lire la page avec une lecture qui RETENTE »). */
async function jouerTourRevision(page: Page, maxMots: number): Promise<ResultatTour> {
	const servis: string[] = [];
	let pauseApresServis: number | null = null;
	for (let garde = 0; garde < maxMots + 5; garde++) {
		await page.waitForSelector('.ortho-run-consigne, .ortho-bilan-emoji');
		if (
			await page
				.getByRole('heading', { name: 'Bonne séance !' })
				.isVisible()
				.catch(() => false)
		) {
			pauseApresServis ??= servis.length;
			await page.locator('#btnContinuerSeance').click();
			continue;
		}
		if ((await page.locator('.ortho-run-consigne').count()) === 0) break; // bilan / révision terminée
		if (servis.length >= maxMots) break;
		servis.push(await completerEnRelevant(page));
		await page.locator('#fb button.btn-primary').click();
	}
	return { servis, pauseApresServis };
}

/* Joue EXACTEMENT `nMots` activités sans jamais cliquer « Continuer encore un peu » —
   pour s'ARRÊTER PILE sur l'écran de pause (critères 10 et 11, qui ont besoin de
   l'observer ou d'y réagir eux-mêmes, plutôt que de la franchir automatiquement). */
async function jouerJusquaLaPause(page: Page, nMots: number): Promise<string[]> {
	const servis: string[] = [];
	for (let i = 0; i < nMots; i++) {
		await expect(page.locator('.ortho-run-consigne')).toBeVisible();
		servis.push(await completerEnRelevant(page));
		await page.locator('#fb button.btn-primary').click();
	}
	return servis;
}

test('critère 8 (#706) : dans un tour de révision, chaque mot de la liste est servi exactement une fois — 10 mots donnent 10 activités', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerEtLancer(page, 'l-rev-8', MOTS);

	const { servis, pauseApresServis } = await jouerTourRevision(page, MOTS.length);
	await expect(page.getByRole('heading', { name: 'Révision terminée !' })).toBeVisible();

	// Témoin : une pause a bien eu lieu à mi-parcours — sinon un échec plus bas ne
	// distinguerait pas le défaut d'un scénario mal amorcé.
	expect(pauseApresServis, 'témoin : le plafond de 8 activités doit déclencher une pause').toBe(8);

	// Le cœur du critère : les 10 mots, tous, dans l'ordre — ni doublon, ni oubli. Avant
	// correctif, le mot en cours de tirage au moment de la pause (le 9ᵉ, « cheval ») était
	// perdu, et le tour n'en servait que 9.
	expect(servis, 'chaque mot de la liste doit être servi, aucun sauté').toEqual(MOTS);

	expect(errors).toEqual([]);
});

test('critère 9 (#706) : le mot en cours de tirage au moment de la pause est resservi EN PREMIER après « Continuer encore un peu », pas remplacé par le suivant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerEtLancer(page, 'l-rev-9', MOTS);

	const { servis, pauseApresServis } = await jouerTourRevision(page, MOTS.length);

	// Témoin, identique au critère 8 : la pause a bien eu lieu après le 8ᵉ mot.
	expect(pauseApresServis).toBe(8);

	// Le 9ᵉ mot de la liste (« cheval », index 8) est celui que `prochainNonMaitrise`
	// tirait au moment même où le plafond a fait basculer sur la pause. Il doit revenir
	// EN PREMIER une fois la séance reprise — pas être doublé par le 10ᵉ (« pinceau »)
	// pris à sa place. Avant correctif, c'était « pinceau » qui était servi en 9ᵉ position,
	// « cheval » ayant été perdu (cf. critère 8).
	expect(
		servis[8],
		'le mot en attente au moment de la pause doit être resservi, pas sauté au profit du suivant',
	).toBe(MOTS[8]);

	expect(errors).toEqual([]);
});

test("critère 10 (#706, négatif) : atteindre le plafond alors qu'il reste des mots à travailler affiche la pause, jamais un écran de fin", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerEtLancer(page, 'l-rev-10', MOTS);

	// Les 8 premières activités seulement, SANS franchir la pause : il reste encore 2
	// mots à cette liste de 10 — le tour n'a AUCUNE raison légitime de se dire terminé
	// ici, quelle que soit la façon dont le mot en attente est géré au plafond.
	const servis = await jouerJusquaLaPause(page, 8);
	expect(servis, 'témoin : 8 activités doivent avoir été servies').toHaveLength(8);

	// Ce qu'une correction naïve du critère 8 pourrait casser : tester le plafond avant
	// même de savoir s'il reste un mot à tirer, et conclure à tort que la liste est finie.
	await expect(page.getByRole('heading', { name: 'Bonne séance !' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Révision terminée !' })).toHaveCount(0);
	await expect(page.getByText('Liste prête')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test("critère 11 (#706, négatif) : un mot mis en attente par une pause ne survit pas à la séance — relancer la liste repart d'un curseur propre", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerEtLancer(page, 'l-rev-11', MOTS);

	// Atteindre la pause (le 9ᵉ mot, « cheval », est celui en cours de tirage à cet
	// instant — cf. critère 9), puis quitter la séance SANS cliquer « Continuer encore un
	// peu » : « Revenir une autre fois » abandonne le bloc en cours pour de bon.
	const servis = await jouerJusquaLaPause(page, 8);
	expect(servis, 'témoin : 8 activités doivent avoir été servies').toHaveLength(8);
	await expect(page.getByRole('heading', { name: 'Bonne séance !' })).toBeVisible();
	await page.locator('#btnStopSeance').click();

	// Nouveau lancement de la MÊME liste (rien n'a changé : toujours entièrement
	// maîtrisée) → nouveau tour de révision, qui doit repartir du premier mot de la
	// liste. Si « cheval » revenait en premier ici, ce serait la preuve que l'attente
	// (`motEnAttente`) posée par la pause précédente a survécu à la séance qui l'a vue
	// naître — régression que `startOrthoRun` (qui la remet à zéro) doit empêcher.
	await relancer(page, 'l-rev-11');
	await expect(page.locator('.ortho-run-consigne')).toBeVisible();
	const premierMotResservi = await lireMotAffiche(page);
	expect(premierMotResservi).toBe(MOTS[0]);

	expect(errors).toEqual([]);
});
