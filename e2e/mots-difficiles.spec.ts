/* ============================================================
   « Mots qui ont résisté » en fin de séance d'orthographe (#618).
   ------------------------------------------------------------
   Trois écrans NOMMENT les mots passés par la CORRECTION GUIDÉE (2ᵉ erreur
   → l'atelier se rouvre avec le diff) plutôt que d'annoncer un dénombrement :
   la pause (`Bonne séance !`), le bilan (`Liste prête !`) et la fin d'une
   RÉVISION ESPACÉE (`.rev-done`, libellé `révision terminée` en minuscule
   dans `.rev-done-lab` — cf. `src/ui/revision.ts`). Un bouton « Relire ces
   mots » ouvre la page de relecture restreinte à ces mots.

   Un QUATRIÈME écran, lui, n'en nomme JAMAIS (critère négatif 9) : l'écran
   `Révision terminée !` (majuscule, point d'exclamation) de `renderRevisionFin`
   dans `src/ui/ortho-runner.ts` — le TOUR DE RÉVISION d'une liste d'orthographe
   DÉJÀ ÉTOILÉE (`revisionRun`), à ne pas confondre avec la révision espacée
   ci-dessus malgré le titre presque identique. Le risque n'est pas dans le
   rendu (qui n'appelle ni `motsDifficilesHTML` ni `bindMotsDifficiles`) mais
   dans l'accumulateur : `noterMotDifficile` n'est PAS gardé par `revisionRun`,
   donc il se remplit pendant ce tour sans que rien ne le signale si cet écran
   est un jour factorisé avec le bilan (quasi jumeaux) ou recopié par réflexe.

   La décision pure (qui est nommé, plafond, bascule vers la formulation
   groupée) vit dans `core/orthographe/mots-difficiles.ts` et est déjà
   couverte en Vitest : on ne la re-teste pas ici. Ce fichier vise
   l'INTÉGRATION — le geste réel qui produit une correction guidée, le
   filtre appliqué par chaque écran porteur, et surtout la non-fuite de la
   sélection de relecture, qui ne vit qu'en mémoire (critères 12/21).

   Coût assumé : atteindre la PAUSE exige `SEANCE_MAX` (8) activités — c'est
   un compteur d'activités, pas de mots — d'où la boucle bornée plutôt qu'un
   nombre codé en dur, pour rester robuste si cette constante bouge. Le
   scénario choisit délibérément un mode CIBLÉ (mot caché seul) : cela
   couvre le critère 3 gratuitement, et une seule escalade suffit (les
   rounds suivants se répondent juste, sans jamais raccrocher au filtre).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

async function seedOrtho(page: Page, seed: unknown): Promise<void> {
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

/* Réglage encadrant « Ne pas rappeler les mots difficiles » (critère 7),
   posé sur le profil par défaut de `gotoHash` (uuid 'e2e'). Même forme que
   `ENSURE_NIVEAU` (helpers.ts) : un profil déjà pourvu d'une liste valide
   n'est pas écrasé par lui, l'ordre entre les deux scripts importe donc peu. */
async function seedPrefSansMotsDifficiles(page: Page): Promise<void> {
	await page.addInitScript(() => {
		localStorage.setItem(
			'ludaskia_profiles',
			JSON.stringify({
				list: [
					{
						uuid: 'e2e',
						name: 'E2E',
						emoji: '🦊',
						updatedAt: 1,
						niveauReference: 'ce2',
						prefs: { sansMotsDifficiles: true },
					},
				],
				active: 'e2e',
			}),
		);
	});
}

/* Fait échouer DEUX FOIS le mode « mot caché » en cours : bascule sur la
   correction guidée (#618), qui nomme le mot après coup. Renvoie le mot lu
   AVANT de le cacher (seul moment où il est visible dans le DOM). */
async function echouerMotCache(page: Page, saisieFausse: string): Promise<string> {
	await expect(page.locator('#motAffiche')).toBeVisible();
	const mot = (await page.locator('#motAffiche').innerText()).trim();
	await page.locator('#btnCacher').click();
	const input = page.locator('#orthoInput');
	await expect(input).toBeVisible();
	await input.fill(saisieFausse);
	await page.locator('#btnVerifMot').click();
	await expect(page.locator('.fb-ko')).toBeVisible();
	await input.fill(saisieFausse);
	await page.locator('#btnVerifMot').click();
	// 2ᵉ échec : l'atelier de correction prend la main (diff sur le mot).
	await expect(page.locator('#btnAtelierDone')).toBeVisible();
	await page.locator('#btnAtelierDone').click();
	// Rien n'a été entouré → modale de confirmation (#230), comme atelier.spec.ts.
	const continuer = page.getByRole('button', { name: 'Continuer quand même' });
	if (await continuer.isVisible().catch(() => false)) await continuer.click();
	return mot;
}

/* Répond JUSTE au mode « mot caché » en cours. Renvoie le mot lu. */
async function reussirMotCache(page: Page): Promise<string> {
	await expect(page.locator('#motAffiche')).toBeVisible();
	const mot = (await page.locator('#motAffiche').innerText()).trim();
	await page.locator('#btnCacher').click();
	const input = page.locator('#orthoInput');
	await expect(input).toBeVisible();
	await input.fill(mot);
	await page.locator('#btnVerifMot').click();
	await page.locator('#fb button.btn-primary').click();
	return mot;
}

test.beforeEach(async ({ page }) => {
	// Le mode ciblé « mot caché » ne monte pas l'atelier au 1er lancement, mais la
	// correction guidée si : neutralise l'aide contextuelle pour ne pas la bloquer.
	await seedAideVue(page);
});

/* ------------------------------------------------------------
   Pause (critères 1, 3, 5, 6, 10, 12) — mode ciblé « mot caché », seul.
   ------------------------------------------------------------ */
const SEED_PAUSE = {
	banque: {
		m1: {
			id: 'm1',
			mot: 'chat',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		m2: {
			id: 'm2',
			mot: 'gris',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-md-pause',
			label: 'Test pause mots difficiles',
			motIds: ['m1', 'm2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1', gris: 'm2' },
};

test('pause : le mot passé par la correction guidée est nommé sous sa forme correcte, sans jamais le compter, et « Relire ces mots » ouvre une sélection qui ne fuite pas (critères 1, 3, 5, 6, 10, 12)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrtho(page, SEED_PAUSE);
	await gotoHash(page, 'ortho-mode-l-e2e-md-pause');

	// Mode ciblé : « mot caché » lancé seul (critère 3), jamais le parcours complet.
	await page.locator('.mode-btn[data-mode="motCache"]').click();

	const SAISIE_FAUSSE = 'zzzzzz';
	const cible = await echouerMotCache(page, SAISIE_FAUSSE); // correction guidée → mot noté
	const autre = cible === 'chat' ? 'gris' : 'chat'; // jamais touché, ne doit jamais être nommé

	// Le mode ciblé ne « finit » jamais tout seul : on avance jusqu'à la pause
	// (compteur d'activités, borné pour rester robuste si SEANCE_MAX change).
	const pauseVisible = page.getByRole('heading', { name: 'Bonne séance !' });
	for (let i = 0; i < 20; i++) {
		if (await pauseVisible.isVisible().catch(() => false)) break;
		await reussirMotCache(page);
	}
	await expect(pauseVisible).toBeVisible();

	// Critère 1 : le mot corrigé, encore non maîtrisé, est nommé.
	const bloc = page.locator('.mots-difficiles');
	await expect(bloc).toBeVisible();
	// A11y (relecture) : région live, sinon le focus (qui suit sur « Continuer… »/« Accueil »)
	// saute le bloc et un enfant au lecteur d'écran n'apprend jamais que des mots sont nommés
	// ni que « Relire ces mots » existe (#490 même recette que le lien d'étayage).
	await expect(bloc).toHaveAttribute('role', 'status');
	await expect(bloc).toHaveAttribute('aria-atomic', 'true');
	const phrase = await bloc.locator('.mots-difficiles-phrase').innerText();
	expect(phrase).toContain(cible);
	// Critère 1/3 : l'autre mot du lot, jamais raté, n'est pas nommé.
	expect(phrase).not.toContain(autre);
	// Critère 5 : jamais la saisie fautive de l'enfant.
	expect(phrase).not.toContain(SAISIE_FAUSSE);
	// Critère 10 : aucune quantité, ni en chiffres ni en lettres.
	const blocTexte = await bloc.innerText();
	expect(blocTexte).not.toMatch(/\d/);

	// Critère 6 : « Relire ces mots » ouvre une sélection RESTREINTE — 1 carte, pas
	// les 2 mots du lot (le lot entier aurait 2 `.relecture-carte`).
	await page.locator('#btnRelireMotsDifficiles').click();
	await expect(page).toHaveURL(/#ortho-revoir-l-e2e-md-pause$/);
	await expect(page.locator('.relecture-carte')).toHaveCount(1);
	await expect(page.locator('.relecture-amorce')).toBeVisible();

	// Critère 12 (le plus important du lot) : la restriction ne survit PAS au
	// bouton Précédent du navigateur — on quitte, puis on revient en arrière.
	await page.locator('#relRetour').click();
	await expect(page).not.toHaveURL(/ortho-revoir/);
	await page.goBack();
	await expect(page.locator('.relecture-carte')).toHaveCount(2);
	await expect(page.locator('.relecture-amorce')).toHaveCount(0);

	// … ni à un rechargement / accès direct au hash.
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.locator('.relecture-carte')).toHaveCount(2);
	await expect(page.locator('.relecture-amorce')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ------------------------------------------------------------
   Réglage encadrant (critère 7) — parcours complet, bilan (chemin le plus
   court pour y arriver : 1 mot, 1 seul mode manquant → bilan en 2 activités).
   ------------------------------------------------------------ */
const SEED_BILAN_PREF = {
	banque: {
		m1: {
			id: 'm1',
			mot: 'chat',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: true, dictee: true },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-md-pref',
			label: 'Test réglage mots difficiles',
			motIds: ['m1'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1' },
};

test('réglage « Ne pas rappeler les mots difficiles » : le bloc et le bouton disparaissent du bilan (critère 7)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedPrefSansMotsDifficiles(page);
	await seedOrtho(page, SEED_BILAN_PREF);
	await gotoHash(page, 'ortho-mode-l-e2e-md-pref');

	await page.locator('.mode-btn.recommended').click(); // parcours complet
	await echouerMotCache(page, 'zzzzzz'); // correction guidée : ce serait normalement nommé…
	await reussirMotCache(page); // …seul mode manquant validé → liste étoilée → bilan

	await expect(page.getByRole('heading', { name: 'Liste prête !' })).toBeVisible();
	await expect(page.locator('.mots-difficiles')).toHaveCount(0);
	await expect(page.locator('#btnRelireMotsDifficiles')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ------------------------------------------------------------
   Fin de révision espacée (critères 14, 17, 18) — un mot raté (correction
   guidée) et un mot passé (« Je ne sais pas, montre-moi »).
   ------------------------------------------------------------ */
const SEED_REVISION = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: false, dictee: false },
			revision: { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: 1 },
			origine: 'liste',
		},
		w2: {
			id: 'w2',
			mot: 'chat',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: false, dictee: false },
			revision: { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: 1 },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-md-rev',
			label: 'Test révision mots difficiles',
			motIds: ['w1', 'w2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { bonjour: 'w1', chat: 'w2' },
};

test("fin de révision espacée : un mot raté et un mot passé sont nommés, le score ne change pas, « Relire ces mots » ramène à l'accueil (critères 14, 17, 18)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrtho(page, SEED_REVISION);
	await gotoHash(page, 'revision-espacee');

	// 1er mot : une réponse fausse bascule DIRECTEMENT sur la correction guidée (un
	// seul essai en révision — pas de 2ᵉ chance comme dans le parcours d'entraînement).
	await expect(page.locator('.rev-word')).toBeVisible();
	const mot1 = (await page.locator('.rev-word').innerText()).trim();
	await page.locator('#revHide').click();
	await page.locator('#revInput').fill(mot1 + 'xx');
	await page.locator('#revValidate').click();
	await expect(page.locator('#atelierMot')).toBeVisible();
	await page.locator('#btnAtelierDone').click();
	const continuer = page.getByRole('button', { name: 'Continuer quand même' });
	if (await continuer.isVisible().catch(() => false)) await continuer.click();

	// 2e mot : abandon assumé (#467) — compte aussi comme une résistance (critère 14).
	await expect(page.locator('.rev-word')).toBeVisible();
	const mot2 = (await page.locator('.rev-word').innerText()).trim();
	await page.locator('#revHide').click();
	await expect(page.locator('#revGiveUp')).toBeVisible();
	await page.locator('#revGiveUp').click();
	await page.locator('#revNext').click();

	await expect(page.locator('.rev-done')).toContainText('terminée');
	// Critère 18 : le score `_/10`-like reste affiché tel quel (aucun mot réussi ici).
	await expect(page.locator('.rev-done-big')).toHaveText('0/2');

	// Critère 14 : les deux mots (échec + abandon) sont nommés.
	const bloc = page.locator('.mots-difficiles');
	await expect(bloc).toBeVisible();
	// A11y (relecture) : région live, sinon le focus (qui suit sur « Continuer… »/« Accueil »)
	// saute le bloc et un enfant au lecteur d'écran n'apprend jamais que des mots sont nommés
	// ni que « Relire ces mots » existe (#490 même recette que le lien d'étayage).
	await expect(bloc).toHaveAttribute('role', 'status');
	await expect(bloc).toHaveAttribute('aria-atomic', 'true');
	const phrase = await bloc.locator('.mots-difficiles-phrase').innerText();
	expect(phrase).toContain(mot1);
	expect(phrase).toContain(mot2);

	// Critère 17 : « Relire ces mots » ramène à l'ACCUEIL, pas à la catégorie Orthographe.
	await page.locator('#btnRelireMotsDifficiles').click();
	await expect(page.locator('.relecture-carte')).toHaveCount(2);
	await expect(page.locator('.relecture-amorce')).toBeVisible();
	const retourBtn = page.locator('#relRetour');
	await expect(retourBtn).toContainText('Accueil');
	await retourBtn.click();
	await expect(page.locator('#progression')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ------------------------------------------------------------
   Critère 21 (moitié la moins coûteuse) : le hash NU, sans sélection en
   attente, ne doit jamais afficher une page de relecture vide — il renvoie
   à l'accueil.
   ------------------------------------------------------------ */
test("#ortho-revoir sans id, atteint directement (sans sélection en attente), renvoie à l'accueil (critère 21)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'ortho-revoir');

	await expect(page.locator('#progression')).toBeVisible();
	await expect(page.locator('.relecture-carte')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ------------------------------------------------------------
   Critère négatif 9 — le SEUL écran qui ne doit RIEN nommer alors même que
   l'accumulateur, lui, s'est rempli : le TOUR DE RÉVISION d'une liste
   d'orthographe DÉJÀ ÉTOILÉE (`revisionRun`, écran « Révision terminée ! »
   de `renderRevisionFin` dans `src/ui/ortho-runner.ts` — à ne pas confondre
   avec la révision espacée testée plus haut, même titre presque identique).
   `noterMotDifficile` n'est PAS gardé par `revisionRun` : une correction
   guidée déclenchée pendant CE tour alimente bien l'accumulateur, seul
   l'écran choisit de ne rien en afficher — un point qui ne tiendrait plus si
   `renderRevisionFin` était un jour factorisé avec `renderBilan` (quasi
   jumeaux) ou si le bloc y était recopié par réflexe.

   La liste est mastered AVANT le lancement (tous les modes requis déjà
   validés) : `prochaineActivite` retombe alors sur un tirage AU HASARD parmi
   les modes d'entretien (`choice`, non seedable ici) — « mot caché » et
   « dictée » portent tous deux une escalade vers la correction guidée, mais
   PAS les tuiles (cf. l'en-tête de fichier), donc un tirage sur les tuiles ne
   prouverait rien. On force donc `Math.random` à une valeur fixe pour tomber
   systématiquement sur « mot caché », quelle que soit la disponibilité du
   TTS dans l'environnement Chromium headless qui fait tourner ce test (elle
   varie d'une machine à l'autre, cf. `ortho-revision.spec.ts`) : `modesRequis`
   vaut `['tuiles','motCache']` (dictée indispo) ou `['tuiles','motCache',
   'dictee']` (dictée dispo) selon les cas, et « mot caché » est l'INDEX 1
   dans les deux — 0.55 tombe dans [0.5, 0.666), qui sélectionne cet index
   pour un tableau de longueur 2 COMME de longueur 3.
   ------------------------------------------------------------ */
const SEED_REVISION_RUN = {
	banque: {
		m1: {
			id: 'm1',
			mot: 'chat',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: true, dictee: true }, // déjà étoilée
			revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-md-revrun',
			label: 'Test tour de révision',
			motIds: ['m1'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1' },
};

test('tour de révision (liste déjà étoilée) : « Révision terminée ! » ne nomme jamais un mot corrigé pendant ce tour (critère négatif 9)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Force le tirage d'entretien sur « mot caché » (cf. commentaire ci-dessus) : fiable
	// que la dictée soit disponible ou non dans cet environnement Chromium headless.
	await page.addInitScript(() => {
		window.Math.random = () => 0.55;
	});
	await seedOrtho(page, SEED_REVISION_RUN);
	await gotoHash(page, 'ortho-mode-l-e2e-md-revrun');

	await page.locator('.mode-btn.recommended').click(); // parcours complet → tour de révision
	await echouerMotCache(page, 'zzzzzz'); // 2 échecs → correction guidée (accumulateur nourri)

	// Seul mot de la liste, déjà mastered → le tour se termine directement après cette
	// unique activité d'entretien (pas de « Liste prête ! », pas de pause).
	await expect(page.getByRole('heading', { name: 'Révision terminée !' })).toBeVisible();
	await expect(page.locator('.mots-difficiles')).toHaveCount(0);
	await expect(page.locator('#btnRelireMotsDifficiles')).toHaveCount(0);

	expect(errors).toEqual([]);
});
