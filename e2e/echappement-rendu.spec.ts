/* ============================================================
   Échappement par construction (#614) — rien ne s'affiche EN CLAIR.

   Le risque propre au lot : un fragment DOUBLEMENT échappé ne casse ni la
   compilation, ni les tests unitaires, ni un sélecteur — il s'affiche simplement en
   clair à l'enfant (« <strong> » lu comme du texte). Le symétrique est un fragment
   interpolé dans un gabarit NON balisé, qui rend « [object Object] ». Les deux ne se
   voient qu'à l'écran : d'où cette spec, qui lit le TEXTE VISIBLE de chaque écran.

   Quatre familles de rendu, parce que la conversion a touché quatre pipelines
   distincts et qu'aucun ne prouve les autres :
     1. la FICHE (core/items → renderItem, le chemin le plus partagé) ;
     2. un RUNNER À WIDGET (tuiles : markup composé, attributs construits) ;
     3. l'ESPACE ENCADRANT (le plus gros volume de balisage de l'application) ;
     4. le SPRINT (rendu propre, QCM + HUD).

   Le CHEVRON SEUL n'est pas testé, et c'est délibéré : les leçons de comparaison
   affichent « 3 < 5 ». On cherche des OUVERTURES DE BALISE (« <span », « <div »…),
   qui elles ne peuvent pas apparaître légitimement dans du texte lu par un enfant.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

/* Ouvertures de balise : la marque d'un fragment ré-échappé. On y ajoute
   « [object Object] », marque de l'oubli symétrique — un fragment interpolé dans un
   gabarit non balisé (`SafeHtml` n'a volontairement pas de `toString`). */
const EN_CLAIR = ['<span', '<div', '<strong', '<em', '<br', '<button', '<input', '[object Object]'];

async function verifierTexteVisible(page: Page, ou: string): Promise<void> {
	const texte = await page.locator('body').innerText();
	for (const marque of EN_CLAIR)
		expect(
			texte,
			`${ou} : « ${marque} » apparaît dans le TEXTE VISIBLE.\n` +
				`Soit un fragment a été échappé deux fois (il s'affiche au lieu de se rendre), ` +
				`soit un SafeHtml a été interpolé dans un gabarit non balisé.`,
		).not.toContain(marque);
}

test('fiche : l’énoncé et ses champs se rendent, rien n’est écrit en clair', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer');
	await page.locator('.ans').first().waitFor({ state: 'visible' });
	// Le rendu enrichi doit être du BALISAGE, pas du texte : au moins un champ existe.
	await expect(page.locator('input.ans').first()).toBeVisible();
	await verifierTexteVisible(page, 'fiche');
	expect(errors).toEqual([]);
});

test('fiche : après correction, le verdict et la réponse révélée restent du balisage', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer');
	const champ = page.locator('.ans').first();
	await champ.waitFor({ state: 'visible' });
	await champ.fill('999'); // réponse volontairement fausse → révélation
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark').first()).toBeVisible();
	await verifierTexteVisible(page, 'fiche corrigée');
	expect(errors).toEqual([]);
});

test('runner à widget (tuiles) : consigne, énoncé et tuiles se rendent', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedAideVueScript());
	// `mode-…` et non `lecon-…` : c'est l'écran de CHOIX de mode qui offre les tuiles,
	// `lecon-…` lançant directement le mode par défaut (saisie).
	await gotoHash(page, 'mode-num-comparer');
	await page.getByText('Je déplace les tuiles').click();
	await page.locator('#ltuiSlot').waitFor({ state: 'visible' });
	await expect(page.locator('.ltui-tuile').first()).toBeVisible();
	await verifierTexteVisible(page, 'runner tuiles');
	expect(errors).toEqual([]);
});

test('espace encadrant : les panneaux se rendent sans balisage en clair', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);
	await gotoHash(page, 'encadrant');
	await expect(page.locator('.enc-tab').first()).toBeVisible();
	await verifierTexteVisible(page, 'encadrant (progression)');
	// Les autres onglets sont rendus par des fonctions distinctes : on les traverse.
	const onglets = page.locator('.enc-tab');
	for (let i = 1; i < (await onglets.count()); i++) {
		await onglets.nth(i).click();
		await expect(page.locator('.enc-tab.active')).toHaveCount(1);
		await verifierTexteVisible(page, `encadrant (onglet ${i})`);
	}
	expect(errors).toEqual([]);
});

test('sprint : la question, les choix et le bandeau se rendent', async ({ page }) => {
	const errors = watchErrors(page);
	// Sprint restreint à une seule leçon via le composeur de bilan (même procédé que
	// pave-signes.spec.ts) : le tirage devient déterministe.
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-comparer"]').check();
	await page.locator('.bc-mode-radio[value="sprint"]').check();
	await page.locator('#bcRun').click();
	await expect(page.locator('#sprintTime')).toBeVisible();
	await expect(page.locator('.sprint-choice').first()).toBeVisible();
	await verifierTexteVisible(page, 'sprint');
	expect(errors).toEqual([]);
});

test('accueil : cartes, progression et récompenses se rendent', async ({ page }) => {
	// L'accueil concentre les fragments composés hors gabarit (icônes injectées dans
	// des libellés statiques, barre de niveau, boutons de récompense) — c'est là que la
	// conversion a laissé le plus de concaténations à reprendre.
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	await expect(page.locator('#progression')).toBeVisible();
	await verifierTexteVisible(page, 'accueil');
	expect(errors).toEqual([]);
});
