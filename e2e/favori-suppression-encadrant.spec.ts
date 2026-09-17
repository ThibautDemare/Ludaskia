/* ============================================================
   Suppression d'un bilan favori DÉPLACÉE vers l'espace encadrant (#636) —
   smoke tests e2e.
   ------------------------------------------------------------
   Avant #636, la corbeille d'un favori vivait sur l'écran ENFANT
   (`favoriItemHTML`, src/ui/bilan.ts) : un clic effaçait d'un geste une
   consigne posée par l'adulte. Couvre les critères 12-15 de l'issue :
   - 12 : la carte enfant (accueil et catégorie) n'a plus de bouton de
     suppression, seulement « Lancer » ;
   - 13 : l'espace encadrant liste et supprime les favoris du profil
     CONSULTÉ (pas l'actif), avec la confirmation nommée déjà en usage ;
   - 14 : la création reste possible côté enfant (déjà vrai aujourd'hui) ;
   - 15 : supprimer un favori visé par un programme prévient l'adulte avant
     d'agir, et le retire ensuite du pool des étapes concernées.

   Le critère 12 est ROUGE dès l'écriture : le bouton `.favori-btn-del`
   existe encore aujourd'hui (comportement à retirer). Les critères 13 et 15
   sont ROUGES : rien de ce qu'ils exigent (section de gestion, confirmation
   qui nomme l'usage par un programme) n'existe. Le critère 14 est VERT
   d'emblée (chemin de création déjà en place) — sa mutation de falsifiabilité
   est documentée sur son propre test.

   Contrat d'écran (décidé avec le mainteneur) : `.enc-seance-favoris-gestion`
   dans l'onglet Programme, une entrée par favori `.enc-favori-gere[data-id]`,
   bouton `button[data-act="seance-favori-del"][data-id]`, confirmation via la
   modale maison `uiConfirm` (titre « Supprimer « X » ? », comme aujourd'hui
   côté enfant). Même seed à deux profils qu'`encadrant-banque.spec.ts`
   (`#encConsulteSel` pour basculer le profil consulté).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Overlay de confirmation « nu » (sans id) : exclut les modales de gamification qui,
   elles, portent un id (cf. encadrant-banque.spec.ts). */
const uiModalOverlay = '.modal-overlay:not([id])';

const LESSON_ID = 'math-complements';

interface BilanFavoriSeed {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	mode: 'bilan' | 'sprint';
	categoryId?: string;
}

function favori(
	id: string,
	label: string,
	mode: 'bilan' | 'sprint',
	categoryId?: string,
): BilanFavoriSeed {
	return {
		id,
		label,
		lessonIds: [LESSON_ID],
		questionsPerLesson: 3,
		mode,
		...(categoryId ? { categoryId } : {}),
	};
}

function seedBilansScript(uuid: string, bilans: BilanFavoriSeed[]): string {
	return `localStorage.setItem('${uuid}/ludaskia_bilans', ${JSON.stringify(JSON.stringify(bilans))});`;
}

/* ---------- Critère 12 : plus de corbeille sur la carte ENFANT ---------- */

test('critère 12 (accueil) : la carte d’un favori n’a plus de bouton de suppression', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedBilansScript('e2e', [favori('fav-1', 'Favori Accueil', 'bilan')]));
	await gotoHash(page, 'accueil');

	const item = page.locator('.favori-item', { hasText: 'Favori Accueil' });
	await expect(item).toBeVisible();
	await expect(item.locator('button.favori-btn-run')).toHaveCount(1);
	// Échec attendu tant que la corbeille n'a pas été retirée (même grisée/désactivée,
	// cf. consigne : « la corbeille est encore là » compte comme un échec).
	await expect(item.locator('button.favori-btn-del')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('critère 12 (catégorie) : la carte d’un favori rattaché n’a plus de bouton de suppression', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(
		seedBilansScript('e2e', [favori('fav-2', 'Favori Catégorie', 'bilan', 'fr-grammaire')]),
	);
	await gotoHash(page, 'categorie-fr-grammaire');

	const item = page.locator('.favori-item', { hasText: 'Favori Catégorie' });
	await expect(item).toBeVisible();
	await expect(item.locator('button.favori-btn-run')).toHaveCount(1);
	await expect(item.locator('button.favori-btn-del')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- Critère 13 : lister/supprimer les favoris du profil CONSULTÉ ---------- */

const PROFIL_A = 'e2e-a';
const PROFIL_B = 'e2e-b';

test('critère 13 : l’espace encadrant liste et supprime les favoris du profil CONSULTÉ, avec confirmation', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		(seed) => {
			localStorage.setItem('ludaskia_profiles', JSON.stringify(seed.profils));
			localStorage.setItem(`${seed.a}/ludaskia_bilans`, JSON.stringify(seed.bilansA));
			localStorage.setItem(`${seed.b}/ludaskia_bilans`, JSON.stringify(seed.bilansB));
		},
		{
			profils: {
				list: [
					{ uuid: PROFIL_A, name: 'Profil A', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
					{ uuid: PROFIL_B, name: 'Profil B', emoji: '🐨', updatedAt: 1, niveauReference: 'ce2' },
				],
				active: PROFIL_A,
			},
			a: PROFIL_A,
			b: PROFIL_B,
			bilansA: [favori('fav-a1', 'Favori A1', 'bilan')],
			bilansB: [favori('fav-b1', 'Favori B1', 'bilan'), favori('fav-b2', 'Favori B2', 'sprint')],
		},
	);
	await gotoHash(page, 'encadrant/programme');

	// Actif = A, mais on consulte B : la gestion doit montrer les favoris de B, pas de A
	// (sans quoi ce test passerait même avec un `loadBilans()` non corrigé, lu sur l'actif).
	const sel = page.locator('#encConsulteSel');
	await sel.selectOption(PROFIL_B);
	await expect(sel).toHaveValue(PROFIL_B);

	const gestion = page.locator('.enc-seance-favoris-gestion');
	await expect(gestion).toBeVisible();
	await expect(gestion.locator('.enc-favori-gere')).toHaveCount(2);
	await expect(gestion).toContainText('Favori B1');
	await expect(gestion).not.toContainText('Favori A1');

	// Suppression avec la confirmation NOMMÉE déjà en usage côté enfant (uiConfirm).
	await page.locator('button[data-act="seance-favori-del"][data-id="fav-b1"]').click();
	await expect(page.locator(`${uiModalOverlay} .modal-title`)).toHaveText(
		'Supprimer « Favori B1 » ?',
	);
	await page.locator(`${uiModalOverlay} .modal-danger`).click();

	await expect(gestion.locator('.enc-favori-gere')).toHaveCount(1);
	await expect(gestion).not.toContainText('Favori B1');

	expect(errors).toEqual([]);
});

/* ---------- Critère 14 : la création reste côté enfant (déjà vrai) ---------- */

test('critère 14 : la création d’un bilan favori reste possible depuis l’écran enfant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'bilan-custom');

	await page.locator('#bcSelectNone').click();
	// Les matières sont repliées par défaut (cf. bilan-configurateur.spec.ts) : ouvrir
	// « Mathématiques » avant de pouvoir cocher une leçon qui s'y trouve.
	await page
		.locator('.bc-subject', { hasText: 'Mathématiques' })
		.locator('.bc-subject-title')
		.click();
	await page.locator(`.bc-lesson-check[value="${LESSON_ID}"]`).check();
	// « Garder pour plus tard » est un <details> replié par défaut : l'ouvrir avant de
	// pouvoir remplir le nom et enregistrer.
	await page.locator('.bc-save summary').click();
	await page.locator('#bcLabel').fill('Mon bilan enfant');
	await page.locator('#bcSave').click();
	await expect(page.locator('#bcSaved')).toContainText('Mon bilan enfant');

	// Le favori créé apparaît bien dans « Mes bilans favoris » sur l'accueil.
	await gotoHash(page, 'accueil');
	await expect(page.locator('.favori-item', { hasText: 'Mon bilan enfant' })).toBeVisible();

	// VERT dès l'écriture (le chemin de création n'est pas touché par #636). Mutation qui
	// ferait rougir ce test : dans `src/ui/bilan.ts`, retirer l'appel `saveBilan(config);`
	// du handler `#bcSave` (ligne ~489, dans le `addEventListener('click', ...)` juste avant
	// `savedEl.textContent = ...`) — le clic ne persisterait plus rien, `#bcSaved` resterait
	// vide et « Mon bilan enfant » n'apparaîtrait jamais sur l'accueil. Non jouée ici
	// (interdiction de toucher `src/` pour cet agent) ; à jouer et consigner dans la PR.
	expect(errors).toEqual([]);
});

/* ---------- Critère 15 : prévenir avant de supprimer un favori visé, puis nettoyer le pool ---------- */

function seedFavorisEtProgrammeCiblesScript(bilans: BilanFavoriSeed[], refs: string[]): string {
	const defs = [
		{
			id: 'd1',
			etapes: [{ id: 'e1', kind: 'favori', refs, count: 1 }],
			recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
		},
	];
	return `(function(){
		localStorage.setItem('e2e/ludaskia_bilans', ${JSON.stringify(JSON.stringify(bilans))});
		localStorage.setItem('e2e/ludaskia_seance', ${JSON.stringify(JSON.stringify(defs))});
	})();`;
}

test('critère 15 : supprimer un favori visé par un programme prévient l’adulte, puis le retire du pool de l’étape', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		seedFavorisEtProgrammeCiblesScript(
			[favori('fav-1', 'Favori Cible', 'bilan'), favori('fav-2', 'Favori Autre', 'bilan')],
			// SEUL `fav-1` est visé par le programme : c'est ce qui rend le cas négatif
			// ci-dessous falsifiable. Avec les deux dans le pool, « Favori Autre » était lui
			// aussi visé, et l'assertion « pas de mention de programme » ne pouvait pas tenir.
			['fav-1'],
		),
	);
	await gotoHash(page, 'encadrant/programme');

	const gestion = page.locator('.enc-seance-favoris-gestion');
	await expect(gestion.locator('.enc-favori-gere')).toHaveCount(2);

	// Négatif (facile à tenir, très utile) : le favori NON visé par un programme n'a
	// PAS ce message spécifique — sinon la mention « visé par un programme » serait un
	// texte générique toujours affiché, qui ne dirait plus rien de vrai à l'adulte.
	await page.locator('button[data-act="seance-favori-del"][data-id="fav-2"]').click();
	await expect(page.locator(`${uiModalOverlay} .modal-title`)).toHaveText(
		'Supprimer « Favori Autre » ?',
	);
	await expect(page.locator(`${uiModalOverlay} .modal-msg`)).not.toContainText(/programme/i);
	// `uiConfirm` met l'action SÛRE en bouton primaire (`.modal-ok`), en premier : c'est
	// l'annulation. `.modal-secondary`/`.modal-danger` portent l'action confirmée.
	await page.locator(`${uiModalOverlay} .modal-ok`).click(); // on annule, rien à effacer

	// Positif : le favori VISÉ par le programme d1/e1 prévient AVANT d'agir.
	await page.locator('button[data-act="seance-favori-del"][data-id="fav-1"]').click();
	await expect(page.locator(`${uiModalOverlay} .modal-title`)).toHaveText(
		'Supprimer « Favori Cible » ?',
	);
	await expect(page.locator(`${uiModalOverlay} .modal-msg`)).toContainText(/programme/i);
	await page.locator(`${uiModalOverlay} .modal-danger`).click();

	await expect(gestion.locator('.enc-favori-gere')).toHaveCount(1);
	await expect(gestion).not.toContainText('Favori Cible');

	// Pas de cible fantôme : l'étape e1 ne propose (et ne coche) plus que le favori restant.
	const fieldset = page.locator('fieldset.enc-seance-favoris[data-def="d1"][data-etape="e1"]');
	await expect(fieldset.locator('input[data-act="seance-favori-toggle"]')).toHaveCount(1);
	await expect(fieldset).not.toContainText('Favori Cible');
	await expect(fieldset).toContainText('Favori Autre');

	expect(errors).toEqual([]);
});
