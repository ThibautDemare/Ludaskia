/* ============================================================
   État d'acquisition des lignes « Épinglées » (#518) — smoke tests e2e.
   ------------------------------------------------------------
   Avant #518, seules les « Suggestions » de la section « À revoir ensemble »
   (onglet Programme) affichaient un badge de niveau (`.enc-revoir-etat`) : une
   ligne épinglée n'en portait aucun, l'adulte ne pouvait donc pas juger s'il
   fallait la retirer. Rendu par `ligneRevoir` (ui/encadrant-progression.ts).
   Deux comportements couverts ici :
   - le cas normal : épingler une leçon jamais travaillée, puis vérifier que sa
     ligne épinglée affiche « à découvrir » — PAS un badge vide (le piège
     explicite de l'issue) ;
   - le repli hors niveau : une leçon épinglée qui a quitté le niveau suivi par
     le profil affiche `.enc-revoir-hors` (« hors du niveau suivi ») et AUCUN
     `.enc-revoir-etat` — l'épingle est inerte, l'adulte doit savoir pourquoi
     plutôt que voir un état faux ou absent sans explication.
   Le cas DICTÉE (une liste épinglée porte aussi son badge) est couvert dans
   suivi-dictees-encadrant.spec.ts, qui seede déjà l'état orthographe et sait
   épingler une liste — pas dupliqué ici.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

test('épinglées : une leçon jamais travaillée porte le badge « à découvrir », pas un badge vide', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant'); // onglet Suivi par défaut, profil e2e CE2, aucun stat seedé

	// Déplier toutes les catégories pour atteindre le détail d'une leçon jamais
	// travaillée (math-complements, reprise des specs encadrant existantes).
	const resumes = page.locator('.enc-cat-sum');
	const n = await resumes.count();
	for (let i = 0; i < n; i++) await resumes.nth(i).click();

	const ligne = page.locator('.enc-detail-item').filter({ hasText: 'Complément à 10/100/1000' });
	await expect(ligne).toBeVisible();
	await ligne.locator('[data-act="epingler"]').click();

	// Onglet Programme : la ligne épinglée porte un badge cohérent avec l'état réel
	// (jamais travaillée -> « à découvrir »), pas d'absence de badge.
	await page.locator('.enc-tab[data-tab="programme"]').click();
	const epinglee = page.locator('.enc-revoir-item').filter({ hasText: 'Complément à 10/100/1000' });
	await expect(epinglee).toBeVisible();
	// `toContainText`, pas `toHaveText` : le badge porte un préfixe `sr-only` (« Niveau : »)
	// dans son texte, invisible mais présent dans le contenu textuel de l'élément.
	await expect(epinglee.locator('.enc-revoir-etat.enc-key-a-decouvrir')).toContainText(
		'à découvrir',
	);
	await expect(epinglee.locator('.enc-revoir-hors')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Leçon CM1-UNIQUEMENT (rubrique « Nombres décimaux », DECIMAUX_LESSONS_DEFS,
   src/core/catalog.ts : `levels: ['cm1']`), épinglée pour un profil réglé sur CE2
   (défaut du profil e2e, cf. helpers.ts) : la cible a quitté le niveau suivi.
   Id/label codés en dur — une spec e2e n'importe pas `src/` (boîte noire du rendu,
   cf. e2e/README.md), donc impossible de dériver la cible depuis le catalogue ici.
   Ce test casserait (label introuvable) si `num-dec-comparer` changeait d'id ou de
   libellé, et deviendrait un FAUX négatif silencieux si la leçon devenait CE2+CM1
   (elle ne serait alors plus « hors niveau » pour ce profil) : à surveiller si la
   rubrique décimaux est un jour ouverte au CE2. */
const LESSON_CM1_ONLY_ID = 'num-dec-comparer';
const LESSON_CM1_ONLY_LABEL = 'Je compare les nombres décimaux';
const SEED_REVOIR_HORS_NIVEAU = `localStorage.setItem('e2e/ludaskia_revoir', JSON.stringify(['${LESSON_CM1_ONLY_ID}']));`;

test('épinglées : une leçon hors du niveau suivi affiche le repli, sans badge d’état', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_REVOIR_HORS_NIVEAU);
	await gotoHash(page, 'encadrant/programme'); // profil e2e CE2 (helpers.ts, ENSURE_NIVEAU)

	const epinglee = page.locator('.enc-revoir-item').filter({ hasText: LESSON_CM1_ONLY_LABEL });
	await expect(epinglee).toBeVisible();
	await expect(epinglee.locator('.enc-revoir-hors')).toHaveText('hors du niveau suivi');
	await expect(epinglee.locator('.enc-revoir-etat')).toHaveCount(0);

	expect(errors).toEqual([]);
});
