/* ============================================================
   Orthographe — tirage du mode ciblé (bug A, vu en séance réelle tablette +
   Firefox), tests ÉCRITS AVANT le correctif à partir du défaut constaté :

   En séance ciblée (`.mode-btn[data-mode="tuiles"|"motCache"|"dictee"]` sur
   l'écran `ortho-mode-<id>`), `prochainNonMaitrise` (`ui/ortho-runner.ts`,
   lignes ~349-355) tourne sur TOUS les mots depuis l'indice 0 sans regarder si
   LE MODE JOUÉ est déjà validé pour chacun, et `idx` repart à 0 à chaque
   lancement (`startOrthoRun`). Avec le plafond `SEANCE_MAX = 8`, une liste de
   10 mots ressert donc les 8 mêmes premiers mots à chaque nouvelle séance : les
   mots 9 et 10 ne sont atteints qu'en cliquant « Continuer encore un peu »,
   jamais en relançant une nouvelle séance.

   Correctif attendu (pas encore posé) : servir d'abord les mots que CE MODE
   peut encore faire monter (`activiteProgressive`, `core/orthographe/runner.ts`,
   déjà utilisée ailleurs mais pas ici), en tournant parmi eux ; une fois qu'ils
   ont tous validé ce mode, retomber sur le cycle actuel (entretien).

   - A1 : sur une liste où 8 des 10 mots ont DÉJÀ validé ce mode, le tirage sert
     d'abord les 2 mots qui ne l'ont pas encore, puis revient à l'entretien.
   - A2 (le bug tel que vu en séance) : une pause de séance suivie d'un
     RELANCEMENT (pas un « Continuer ») ne doit pas resservir les mots déjà
     validés dans ce mode au détriment de ceux qui ne le sont pas encore.

   STUB_VOIX_FR (pas STUB_SANS_VOIX) : la dictée doit rester un mode REQUIS
   pour l'étoile, jamais jouée ici — sinon les 2 derniers mots, une fois
   validés en mot caché (cumul #641 : motCache valide aussi tuiles),
   achèveraient la liste entière et le bilan « Liste prête ! » remplacerait la
   pause / l'entretien qu'on veut observer.

   ROUGE aujourd'hui sur A1 et A2 (le 1ᵉʳ mot servi est toujours celui
   d'indice 0, jamais le 9ᵉ).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { STUB_VOIX_FR } from './journal-couverture';
import { MOTS_MAITRISES as MOTS } from './ortho-liste-maitrisee';

const PREMIERS = MOTS.slice(0, 8); // les 8 mots que le mode a déjà validés
const NEUVIEME = MOTS[8]; // 'cheval'
const DIXIEME = MOTS[9]; // 'pinceau'

test.beforeEach(async ({ page }) => {
	await page.addInitScript(STUB_VOIX_FR);
});

/* Liste de 10 mots (lettres internes distinctes, réutilisés tels quels depuis
   `ortho-liste-maitrisee.ts` — pas de raison d'inventer un 2e jeu de mots) où
   seul un PRÉFIXE a déjà validé tuiles ET mot caché. La fabrique existante
   (`seedListeMaitrisee`) valide toujours les TROIS modes sur TOUS les mots ;
   elle ne convient pas à un tirage partiel, d'où cette variante locale. */
function seedPrefixeValide(id: string, nValides: number) {
	const motIds = MOTS.map((_, i) => `${id}-m${i + 1}`);
	return {
		banque: Object.fromEntries(
			MOTS.map((mot, i) => {
				const valide = i < nValides;
				return [
					motIds[i],
					{
						id: motIds[i],
						mot,
						entourage: [],
						atelierFait: true,
						validation: { tuiles: valide, motCache: valide, dictee: false },
						revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
						origine: 'liste',
					},
				];
			}),
		),
		listes: [{ id, label: 'Liste tirage cible', motIds, createdAt: 1, updatedAt: 1 }],
		motIdParForme: Object.fromEntries(MOTS.map((mot, i) => [mot, motIds[i]])),
	};
}

async function seedOrtho(page: Page, seed: unknown): Promise<void> {
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

/* Lit le mot actuellement affiché en clair par la tâche « mot caché » (AVANT le clic
   sur « Cacher et écrire → »). Chaque lettre est un span `.atelier-lettre`
   (`ortho-atelier.ts`, `lettresMotHTML`) ; leur concaténation, c'est `#motAffiche`. */
async function lireMotAffiche(page: Page): Promise<string> {
	const texte = await page.locator('#motAffiche').textContent();
	return (texte ?? '').trim();
}

/* Complète l'activité « mot caché » affichée en relevant D'ABORD le mot montré (pour
   savoir lequel a été servi), puis en le cachant et en le retapant. Même geste que
   `completerMotCache` (ortho-choix-mode.spec.ts) et `completerEnRelevant`
   (dictee-revision-plafond.spec.ts) — 3e exemplaire de ce patron, réutilisé tel quel
   (copie assumée, pas de partage pour un seul appel de plus par fichier). */
async function completerEnRelevant(page: Page): Promise<string> {
	const mot = await lireMotAffiche(page);
	await page.locator('#btnCacher').click();
	await page.locator('#orthoInput').fill(mot);
	await page.locator('#btnVerifMot').click();
	await page.locator('.fb-ok').waitFor();
	await page.locator('#fb button.btn-primary').click();
	return mot;
}

test('A1 : le mode ciblé sert d’abord les mots qu’il n’a pas encore validés, jamais ceux déjà faits', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const LESSON_ID = 'l-e2e-cible-a1';
	await seedOrtho(page, seedPrefixeValide(LESSON_ID, 8));
	await seedAideVue(page);
	await gotoHash(page, 'ortho-mode-' + LESSON_ID);
	await page.locator('.mode-btn[data-mode="motCache"]').click();

	await expect(page.locator('#motAffiche')).toBeVisible();
	const premier = await completerEnRelevant(page);
	expect(
		premier,
		'le 1er mot servi doit être le 9e de la liste (seul avec le 10e à ne pas avoir validé ce mode)',
	).toBe(NEUVIEME);

	await expect(page.locator('#motAffiche')).toBeVisible();
	const second = await completerEnRelevant(page);
	expect(second, 'le 2e mot servi doit être le 10e de la liste').toBe(DIXIEME);

	// Négatif : aucun des 8 mots déjà validés dans ce mode n'est apparu avant les 2 restants.
	expect(
		PREMIERS,
		'aucun mot déjà validé dans ce mode ne doit être servi avant les mots qui ne le sont pas',
	).not.toContain(premier);
	expect(PREMIERS).not.toContain(second);

	// Les 2 seuls mots restants sont désormais validés dans ce mode : le tirage retombe
	// sur le cycle normal (entretien d'un mot déjà acquis pour ce mode).
	await expect(page.locator('#motAffiche')).toBeVisible();
	const troisieme = await lireMotAffiche(page);
	expect(
		PREMIERS,
		'une fois les mots restants faits, le mode reprend son cycle normal (entretien)',
	).toContain(troisieme);

	expect(errors).toEqual([]);
});

test('A2 (le bug tel que vu en séance) : une pause suivie d’un nouveau lancement ne resserre pas les mots déjà validés dans ce mode', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const LESSON_ID = 'l-e2e-cible-a2';
	await seedOrtho(page, seedPrefixeValide(LESSON_ID, 0)); // rien de validé
	await seedAideVue(page);
	await gotoHash(page, 'ortho-mode-' + LESSON_ID);
	await page.locator('.mode-btn[data-mode="motCache"]').click();

	// 1re séance : exactement 8 activités (SEANCE_MAX), puis pause — jamais le bilan
	// (la dictée reste requise via STUB_VOIX_FR, et n'est jamais jouée dans ce test).
	const premierePasse: string[] = [];
	for (let i = 0; i < 8; i++) {
		await expect(page.locator('#motAffiche')).toBeVisible();
		premierePasse.push(await completerEnRelevant(page));
	}
	expect(premierePasse, 'témoin : le plafond de 8 activités doit avoir été atteint').toHaveLength(
		8,
	);
	await expect(page.getByRole('heading', { name: 'Bonne séance !' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Liste prête' })).toHaveCount(0);
	await page.locator('#btnStopSeance').click(); // « Revenir une autre fois » : abandonne le bloc

	// Nouveau lancement (pas « Continuer encore un peu ») de la MÊME liste, même mode ciblé.
	await gotoHash(page, 'ortho-mode-' + LESSON_ID);
	await page.locator('.mode-btn[data-mode="motCache"]').click();

	await expect(page.locator('#motAffiche')).toBeVisible();
	const premier = await completerEnRelevant(page);
	expect(
		premier,
		'le 1er mot du nouveau lancement doit être un mot que ce mode n’a pas encore validé, pas un des 8 déjà faits',
	).toBe(NEUVIEME);

	await expect(page.locator('#motAffiche')).toBeVisible();
	const second = await completerEnRelevant(page);
	expect(second, 'le 2e mot du nouveau lancement doit être l’autre mot jamais joué').toBe(DIXIEME);

	// Négatif : le bug tel que vécu — les mêmes mots resservis, jamais les 2 qui manquaient.
	expect(
		premierePasse,
		'les mots déjà validés dans ce mode lors de la 1re séance ne doivent pas réapparaître au relancement',
	).not.toContain(premier);
	expect(premierePasse).not.toContain(second);

	expect(errors).toEqual([]);
});
