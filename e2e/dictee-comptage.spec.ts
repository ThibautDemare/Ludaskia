/* ============================================================
   Orthographe — comptage du graphique d'activité par BLOC de séance (#706).
   Un point d'activité `dictee` doit être écrit à chaque écran terminal RÉELLEMENT
   atteint (pause, bilan, ou révision terminée), et pas une seule fois par session
   entière : « Continuer encore un peu », sur l'écran de pause, ouvre un nouveau
   bloc de travail qui mérite son propre point quand il aboutit à son tour.
   Défaut avant correctif : le drapeau qui empêche `journalOrthoSession` de se
   répéter (`orthoJournalisee`, ortho-runner.ts ~l.90) n'est remis à zéro que par un
   nouveau LANCEMENT (`startOrthoRun` ~l.158) — jamais par « Continuer encore un
   peu » (~l.614), qui pourtant relance une nouvelle tranche de travail. Une liste
   qui déclenche plusieurs pauses ne compte donc jamais qu'UNE seule dictée.

   Les critères 3 (drapeau `progressive` réévalué par bloc) et 6 (journal des
   paliers non dupliqué) de l'issue ne sont pas éprouvés ici : ils ne laissent pas
   de trace observable à l'écran ni dans le journal d'activité lu par ce fichier
   (`progressive` n'entre dans `ActivityEntry` que comme `false` explicite, jamais
   comme preuve positive d'une réévaluation ; le journal des paliers vit sous une
   autre clé que ce test ne lit pas). Une assertion dessus depuis l'e2e serait un
   simulacre — à couvrir autrement (Vitest sur `core/orthographe/paliers.ts` et
   `core/orthographe/runner.ts`).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

/* 10 mots déjà MAÎTRISÉS (atelier fait + les trois modes validés), lettres internes
   toutes distinctes (tuiles non ambiguës — même contrainte que `ortho-revision.spec.ts`).
   Avec `SEANCE_MAX = 8`, une liste de 10 mots forme deux blocs bien distincts dans le
   tour de révision : les 8 premiers avant la pause, puis les 2 derniers après « Continuer
   encore un peu » (le mot mis en attente au moment de la pause, servi en premier, puis le
   dernier de la liste). De quoi vérifier que ce SECOND bloc, mené à son tour jusqu'à son
   écran terminal, écrit son propre point (critère 1+2 de #706) — pas un bloc réduit à un
   seul mot, qui masquerait moins bien un flag jamais réarmé. */
const MOTS = [
	'chat',
	'lune',
	'radis',
	'jupe',
	'bocal',
	'guide',
	'minou',
	'sirop',
	'cheval',
	'pinceau',
];

function seedListeMaitrisee(id: string, mots: string[]) {
	return {
		banque: Object.fromEntries(
			mots.map((mot, i) => [
				`${id}-m${i + 1}`,
				{
					id: `${id}-m${i + 1}`,
					mot,
					entourage: [],
					atelierFait: true,
					validation: { motCache: true, tuiles: true, dictee: true },
					revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
					origine: 'liste',
				},
			]),
		),
		listes: [
			{
				id,
				label: 'Liste maîtrisée',
				motIds: mots.map((_, i) => `${id}-m${i + 1}`),
				createdAt: 1,
				updatedAt: 1,
			},
		],
		motIdParForme: Object.fromEntries(mots.map((mot, i) => [mot, `${id}-m${i + 1}`])),
	};
}

/* Complète l'activité d'entretien affichée, quel que soit le mode tiré au hasard
   (tuiles, affiche/masque, ou dictée — selon la disponibilité du TTS dans l'environnement
   Chromium headless). Copié de `ortho-revision.spec.ts` : usage propre à l'orthographe,
   trop petit pour justifier un partage dans `helpers.ts` alors qu'il y est déjà dupliqué. */
async function completerEntretien(page: Page, mot: string): Promise<void> {
	if (
		await page
			.locator('#btnVerifTuiles')
			.isVisible()
			.catch(() => false)
	) {
		for (const ch of mot) {
			await page
				.locator('.tuiles-bac button.tuile:not(.tuile-used)', { hasText: ch })
				.first()
				.click();
		}
		await page.locator('#btnVerifTuiles').click();
	} else if (
		await page
			.locator('#btnCacher')
			.isVisible()
			.catch(() => false)
	) {
		await page.locator('#btnCacher').click();
		await page.locator('#orthoInput').fill(mot);
		await page.locator('#btnVerifMot').click();
	} else {
		await page.locator('#orthoInput').fill(mot);
		await page.locator('#btnVerifMot').click();
	}
}

interface JournalEntry {
	t: number;
	k: string;
	ref?: string;
}

/* Lit le journal d'activité du profil e2e par défaut et n'en garde que les points de
   type `dictee` — ceux qu'écrit `journalOrthoSession` (ortho-runner.ts ~l.509). Forme
   exacte de la clé et du tableau : `e2e/helpers.ts` ~l.147. */
async function lireActiviteDictee(page: Page): Promise<JournalEntry[]> {
	const raw = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_activity'));
	const all: JournalEntry[] = raw ? JSON.parse(raw) : [];
	return all.filter((e) => e.k === 'dictee');
}

/* Amène la séance jusqu'à l'écran de pause en complétant les 8 premières activités
   (le plafond `SEANCE_MAX`). Suppose la liste `MOTS` (ou un préfixe d'au moins 8 mots
   maîtrisés) déjà lancée en tour de révision. */
async function jusquaPause(page: Page, mots: string[]): Promise<void> {
	for (let i = 0; i < 8; i++) {
		await expect(page.locator('.ortho-run-consigne')).toBeVisible();
		await completerEntretien(page, mots[i]);
		await page.locator('#fb button.btn-primary').click();
	}
	await expect(page.getByRole('heading', { name: 'Bonne séance !' })).toBeVisible();
}

test('critère 1+2 (#706) : « Continuer encore un peu » ouvre un bloc qui écrit SON point dictee, avec la liste en ref, quand il atteint son écran terminal', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const seed = seedListeMaitrisee('l-rev', MOTS);
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);

	await gotoHash(page, 'ortho-mode-l-rev');
	await page.locator('.mode-btn.recommended').click();

	await jusquaPause(page, MOTS);

	// Témoin : le premier bloc (8 activités) a bien écrit SON point, sur la bonne liste.
	// Sans cette étape, un échec plus bas ne distinguerait pas le défaut (#706) d'un
	// scénario mal amorcé (seed invalide, pause jamais atteinte…).
	let entries = await lireActiviteDictee(page);
	expect(entries, 'le 1er bloc doit déjà avoir écrit son point à la pause').toHaveLength(1);
	expect(entries[0].ref).toBe('l-rev');

	// « Continuer encore un peu » : un second bloc démarre réellement — ce n'est pas un
	// raccourci direct vers l'écran de fin — et propose les deux mots restants : d'abord
	// celui qui était en cours de tirage au moment de la pause (`MOTS[8]`, resservi en
	// premier), puis le dernier de la liste (`MOTS[9]`).
	await page.locator('#btnContinuerSeance').click();
	await expect(page.locator('.ortho-run-consigne')).toBeVisible();
	await completerEntretien(page, MOTS[8]);
	await page.locator('#fb button.btn-primary').click();
	await expect(page.locator('.ortho-run-consigne')).toBeVisible();
	await completerEntretien(page, MOTS[9]);
	await page.locator('#fb button.btn-primary').click();
	await expect(page.getByRole('heading', { name: 'Révision terminée !' })).toBeVisible();

	// Le cœur du critère : ce SECOND bloc, mené jusqu'à son écran terminal, doit avoir
	// écrit son propre point — pas seulement celui du premier. Rouge avant #706 : un seul
	// point au lieu de deux (`orthoJournalisee` jamais réarmé par « Continuer encore un
	// peu »).
	entries = await lireActiviteDictee(page);
	expect(entries, 'chaque bloc mené à son écran terminal doit valoir un point').toHaveLength(2);
	expect(entries.every((e) => e.ref === 'l-rev')).toBe(true);

	expect(errors).toEqual([]);
});

test("critère 4 (#706, négatif) : « Continuer encore un peu » sans activité menée à son terme n'écrit aucun point supplémentaire", async ({
	page,
}) => {
	const errors = watchErrors(page);
	const seed = seedListeMaitrisee('l-rev-quitte', MOTS);
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);

	await gotoHash(page, 'ortho-mode-l-rev-quitte');
	await page.locator('.mode-btn.recommended').click();
	await jusquaPause(page, MOTS);

	let entries = await lireActiviteDictee(page);
	expect(entries).toHaveLength(1); // point du 1er bloc, condition du test

	// Un second bloc démarre pour de vrai (l'activité s'affiche)…
	await page.locator('#btnContinuerSeance').click();
	await expect(page.locator('.ortho-run-consigne')).toBeVisible();

	// … mais l'enfant quitte aussitôt, sans répondre ni atteindre le moindre écran
	// terminal de ce second bloc.
	await gotoHash(page, 'accueil');

	entries = await lireActiviteDictee(page);
	expect(entries, "un bloc entamé mais jamais mené à un écran terminal n'écrit rien").toHaveLength(
		1,
	);

	expect(errors).toEqual([]);
});

test('critère 7 (#706) : une session courte, sans pause, reste comptée une seule fois', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const courte = MOTS.slice(0, 3); // < SEANCE_MAX : la pause n'est jamais atteinte
	const seed = seedListeMaitrisee('l-rev-courte', courte);
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);

	await gotoHash(page, 'ortho-mode-l-rev-courte');
	await page.locator('.mode-btn.recommended').click();

	for (const mot of courte) {
		await expect(page.locator('.ortho-run-consigne')).toBeVisible();
		await completerEntretien(page, mot);
		await page.locator('#fb button.btn-primary').click();
	}
	await expect(page.getByRole('heading', { name: 'Révision terminée !' })).toBeVisible();

	const entries = await lireActiviteDictee(page);
	expect(entries).toHaveLength(1);
	expect(entries[0].ref).toBe('l-rev-courte');

	expect(errors).toEqual([]);
});
