/* ============================================================
   État d'acquisition des lignes « Épinglées » (#518), puis assignation hors
   classe (#556) — smoke tests e2e.
   ------------------------------------------------------------
   Avant #518, seules les « Suggestions » de la section « À revoir ensemble »
   (onglet Programme) affichaient un badge de niveau (`.enc-revoir-etat`) : une
   ligne épinglée n'en portait aucun, l'adulte ne pouvait donc pas juger s'il
   fallait la retirer. Rendu par `ligneRevoir` (ui/encadrant-progression.ts).

   #556 a changé le régime d'une épingle D'UNE AUTRE CLASSE : elle n'est plus
   inerte (l'ancien `.enc-revoir-hors` / « hors du niveau suivi » a disparu),
   c'est désormais le cas NOMINAL de l'assignation hors classe — sa ligne porte
   un badge de classe d'origine (`.enc-classe-origine`) ET un état, mais pas le
   MÊME régime selon le sens de l'écart (cf. `EtatEpingle`, core/encadrant-stats.ts) :
   - classe SUIVIE ou classe EN DESSOUS (classe précédente, consolidation) : état
     d'acquisition habituel (`.enc-revoir-etat`), lu au niveau de STOCKAGE de la
     cible — un badge de classe d'origine en plus si la classe n'est pas celle
     suivie ;
   - classe AU-DESSUS (classe suivante, découverte anticipée) : compte-rendu
     FACTUEL (`.enc-revoir-essai` : « Pas encore travaillée », « Essayée … »,
     « Réussie … »), JAMAIS d'état d'acquisition — un échec dirait « à renforcer »
     sur une notion pas encore enseignée, un succès unique « acquis ».
   Trois comportements couverts ici :
   - le cas normal (classe suivie) : épingler une leçon jamais travaillée, sa
     ligne affiche « à découvrir » — PAS un badge vide (le piège explicite de
     #518) — et AUCUN badge de classe d'origine (rien à nommer, c'est sa classe) ;
   - classe EN DESSOUS : badge de classe d'origine ET état d'acquisition normal ;
   - classe AU-DESSUS : badge de classe d'origine ET compte-rendu factuel, jamais
     d'état d'acquisition.
   Le bout-en-bout côté enfant (une épingle hors classe revient sur l'accueil,
   sans étiquette de niveau) est couvert par `selecteur-lecon.spec.ts`, pas
   dupliqué ici. Le cas DICTÉE (une liste épinglée porte aussi son badge) est
   couvert dans suivi-dictees-encadrant.spec.ts, qui seede déjà l'état
   orthographe et sait épingler une liste — pas dupliqué ici non plus.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

test('épinglées : une leçon jamais travaillée dans sa classe porte « à découvrir », sans badge de classe d’origine', async ({
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
	// Classe suivie : rien à nommer, pas de badge de classe d'origine.
	await expect(epinglee.locator('.enc-classe-origine')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Leçon CE2 SEULE (`math-complements`, `levels: ['ce2']`, cf. `core/catalog.ts`),
   épinglée pour un profil réglé sur CM1 (toutes matières) : classe EN DESSOUS —
   consolidation d'une notion d'une classe précédente, le scénario même de #556. */
const UUID_CM1 = 'e2e-revoir-etat-cm1';
const LESSON_EN_DESSOUS_ID = 'math-complements';
const LABEL_EN_DESSOUS = 'Complément à 10/100/1000';
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${UUID_CM1}', name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: '${UUID_CM1}' }));`;
const SEED_REVOIR_EN_DESSOUS = `localStorage.setItem('${UUID_CM1}/ludaskia_revoir', JSON.stringify(['${LESSON_EN_DESSOUS_ID}']));`;

test('épinglées : une leçon d’une classe en dessous porte le badge de classe d’origine ET un état d’acquisition normal (#556)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CM1);
	await page.addInitScript(SEED_REVOIR_EN_DESSOUS);
	await gotoHash(page, 'encadrant/programme');

	const epinglee = page.locator('.enc-revoir-item').filter({ hasText: LABEL_EN_DESSOUS });
	await expect(epinglee).toBeVisible();
	await expect(epinglee.locator('.enc-classe-origine')).toContainText('CE2');
	// Jamais travaillée (au niveau de stockage CE2) : le même « à découvrir » qu'une leçon
	// de la classe suivie — la consolidation part d'un état bas, ce n'est pas une alerte.
	await expect(epinglee.locator('.enc-revoir-etat.enc-key-a-decouvrir')).toContainText(
		'à découvrir',
	);
	await expect(epinglee.locator('.enc-revoir-essai')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Leçon CM1 SEULE (rubrique « Nombres décimaux », DECIMAUX_LESSONS_DEFS,
   src/core/catalog.ts : `levels: ['cm1']`), épinglée pour un profil réglé sur CE2
   (défaut du profil e2e, cf. helpers.ts) : classe AU-DESSUS — découverte anticipée
   d'une notion pas encore enseignée en classe.
   Id/label codés en dur — une spec e2e n'importe pas `src/` (boîte noire du rendu,
   cf. e2e/README.md), donc impossible de dériver la cible depuis le catalogue ici.
   Ce test casserait (label introuvable) si `num-dec-comparer` changeait d'id ou de
   libellé, et deviendrait un FAUX négatif silencieux si la leçon devenait CE2+CM1
   (elle ne serait alors plus « au-dessus » pour ce profil) : à surveiller si la
   rubrique décimaux est un jour ouverte au CE2. */
const LESSON_CM1_ONLY_ID = 'num-dec-comparer';
const LESSON_CM1_ONLY_LABEL = 'Je compare les nombres décimaux';
const SEED_REVOIR_AU_DESSUS = `localStorage.setItem('e2e/ludaskia_revoir', JSON.stringify(['${LESSON_CM1_ONLY_ID}']));`;

test('épinglées : une leçon d’une classe au-dessus porte le badge de classe d’origine ET un compte-rendu factuel, jamais un état d’acquisition (#556)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_REVOIR_AU_DESSUS);
	await gotoHash(page, 'encadrant/programme'); // profil e2e CE2 (helpers.ts, ENSURE_NIVEAU)

	const epinglee = page.locator('.enc-revoir-item').filter({ hasText: LESSON_CM1_ONLY_LABEL });
	await expect(epinglee).toBeVisible();
	await expect(epinglee.locator('.enc-classe-origine')).toContainText('CM1');
	// Jamais essayée : le compte-rendu le dit avec les mots exacts de l'écran (pas
	// « pas encore réussie », qui se lirait comme une tentative ratée).
	await expect(epinglee.locator('.enc-revoir-essai')).toHaveText('Pas encore travaillée');
	await expect(epinglee.locator('.enc-revoir-etat')).toHaveCount(0);

	expect(errors).toEqual([]);
});
