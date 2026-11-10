/* ============================================================
   #785 — Trophées de Noël (`noel1`, `noel5`, `noel10` : 1, 5 et 10 jours de travail en
   décembre). Écrit AVANT l'implémentation, depuis les critères de l'issue.

   - Critère 19 : hors décembre (juillet), la galerie contient déjà les trois trophées,
     verrouillés, avec titre et condition.
   - Critère 23 : le 15 décembre, la première leçon terminée annonce un trophée de Noël dans
     `#celebrate` ; une dictée en PREMIÈRE COMPLÉTION (parcours complet, pas un mode ciblé)
     arrêtée à l'écran de pause « Bonne séance ! » l'annonce aussi. Décision du mainteneur
     du 09/11/2026 : la pause doit annoncer les récompenses. Aujourd'hui seuls le mode ciblé
     et le tour de révision l'annoncent à la pause (`ortho-runner.ts`, `renderPause` :
     `if (seanceMode || revisionRun)`), le parcours complet les garde pour le bilan, qu'une
     pause n'atteint pas.

   On n'écrit AUCUN titre de trophée en dur : le titre se lit dans la galerie, puis se
   retrouve dans l'annonce (même procédé que `revision-trophees-ancres.spec.ts`).
   Horloge : voir `decor-aide.ts`.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue, estAtteignable } from './helpers';
import { DATES, FUSEAU, ouvrirAccueil } from './decor-aide';

test.use({ timezoneId: FUSEAU });

const NOEL = ['noel1', 'noel5', 'noel10'] as const;
const LECON = 'math-tables-addition';

interface EtatTrophee {
	on: boolean;
	titre: string;
	/** Lignes de texte de la cellule autres que le titre (la condition). */
	reste: string[];
}

async function lireTrophee(page: Page, id: string): Promise<EtatTrophee> {
	const cell = page.locator(`[data-trophy-id="${id}"]`);
	await expect(cell, `le trophée ${id} existe dans la galerie`).toHaveCount(1);
	const classes = (await cell.getAttribute('class')) ?? '';
	const titre = ((await cell.locator('.trophy-title').textContent()) ?? '').trim();
	const lignes = (await cell.innerText()).split('\n').map((l) => l.trim());
	return {
		on: classes.split(/\s+/).includes('on'),
		titre,
		reste: lignes.filter((l) => l && l !== titre),
	};
}

/* Ouvre la galerie depuis l'accueil, lit les trois trophées de Noël, referme. */
async function lireTropheesNoel(page: Page): Promise<Record<string, EtatTrophee>> {
	await page.locator('[data-act="open-trophees"]').click();
	await expect(page.locator('#trophees')).toBeVisible();
	await page.locator('#tropheesContent .trophy').first().waitFor();
	const etats: Record<string, EtatTrophee> = {};
	for (const id of NOEL) etats[id] = await lireTrophee(page, id);
	await page.keyboard.press('Escape');
	await expect(page.locator('#trophees')).toBeHidden();
	return etats;
}

/* ---------- Critère 19 ---------- */

test('critère 19 : en juillet, la galerie contient les trois trophées de Noël, verrouillés, avec titre et condition', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.ete);
	const etats = await lireTropheesNoel(page);
	for (const id of NOEL) {
		expect(etats[id].on, `${id} doit être verrouillé hors décembre`).toBe(false);
		expect(etats[id].titre, `${id} a un titre`).not.toBe('');
		expect(
			etats[id].reste.join(' ').length,
			`${id} dit à quelle condition il se gagne`,
		).toBeGreaterThan(5);
	}
	// Trois trophées distincts, pas trois fois le même.
	expect(new Set(NOEL.map((id) => etats[id].titre)).size).toBe(3);
	expect(errors).toEqual([]);
});

/* ---------- Critère 23 : une leçon ---------- */

/* Réussit la leçon d'un seul geste : tous les champs remplis avec leur `data-answer`. */
async function reussirLecon(page: Page, part = 1): Promise<void> {
	await gotoHash(page, `lecon-${LECON}`);
	const champs = page.locator('#sheets .ans');
	await champs.first().waitFor();
	const n = Math.floor((await champs.count()) * part);
	for (let i = 0; i < n; i++)
		await champs.nth(i).fill((await champs.nth(i).getAttribute('data-answer')) ?? '');
	await page.locator('#btnVerify').click();
}

test('critère 23 : le 15 décembre, la première leçon terminée annonce un trophée de Noël (et lui seul est débloqué)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	// Assez d'XP pour que la leçon ne franchisse pas de niveau (pas de `#levelup` devant).
	await page.addInitScript(`localStorage.setItem('e2e/ludaskia_xp', '2000');`);
	await ouvrirAccueil(page, DATES.noel);
	const avant = await lireTropheesNoel(page);
	for (const id of NOEL) expect(avant[id].on, `${id} verrouillé avant la leçon`).toBe(false);

	await reussirLecon(page);
	const annonce = page.locator('#celebrate');
	await expect(annonce).toBeVisible();
	// Exigence : l'enfant APPREND qu'il a gagné le trophée de Noël (son titre est annoncé),
	// quelle que soit la phrase qui l'entoure.
	await expect(annonce).toContainText(avant.noel1.titre);
	await page.locator('#celebrateOk').click();
	await expect(annonce).toBeHidden();

	// Un seul jour de travail : noel1 seul est acquis.
	await gotoHash(page, 'accueil');
	const apres = await lireTropheesNoel(page);
	expect(apres.noel1.on, 'noel1 débloqué par la première journée').toBe(true);
	expect(apres.noel5.on, 'noel5 : 5 jours requis').toBe(false);
	expect(apres.noel10.on, 'noel10 : 10 jours requis').toBe(false);
	expect(errors).toEqual([]);
});

test('critère 23 (négatif) : le même jour de travail en juillet ne débloque rien de Noël', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await page.addInitScript(`localStorage.setItem('e2e/ludaskia_xp', '2000');`);
	await ouvrirAccueil(page, DATES.ete);

	await reussirLecon(page);
	await expect(page.locator('.mark.correct').first()).toBeVisible(); // la leçon est bien jouée
	const ok = page.locator('#celebrateOk');
	if (await estAtteignable(page, '#celebrateOk')) await ok.click();

	await gotoHash(page, 'accueil');
	const etats = await lireTropheesNoel(page);
	for (const id of NOEL) expect(etats[id].on, `${id} reste verrouillé en juillet`).toBe(false);
	expect(errors).toEqual([]);
});

/* ---------- Critère 20 (volet négatif) : sous 60 % de réponses, rien n'est gagné ---------- */

test('critère 20 (négatif) : le 15 décembre, une leçon répondue à moins de 60 % n’annonce aucun trophée de Noël et la galerie les garde verrouillés', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await page.addInitScript(`localStorage.setItem('e2e/ludaskia_xp', '2000');`);
	await ouvrirAccueil(page, DATES.noel);
	const avant = await lireTropheesNoel(page);

	// Moitié des champs seulement : « répondu » = champ non vide (session.ts, `total`).
	await gotoHash(page, `lecon-${LECON}`);
	expect(
		await page.locator('#sheets .ans').count(),
		'assez de champs pour un 50 %',
	).toBeGreaterThan(3);
	await reussirLecon(page, 0.5);
	// Garde de scénario : l'essai est bien refusé pour insuffisance (avertissement du bilan),
	// sinon on testerait un autre chemin que la règle des 60 %.
	await expect(page.locator('#resultBanner .rb-warn')).toBeVisible();
	await expect(page.locator('#celebrate')).toBeHidden();

	await gotoHash(page, 'accueil');
	const apres = await lireTropheesNoel(page);
	for (const id of NOEL) expect(apres[id].on, `${id} reste verrouillé sous 60 %`).toBe(false);
	expect(apres.noel1.titre).toBe(avant.noel1.titre);
	expect(errors).toEqual([]);
});

/* ---------- Critère 23 : une dictée en première complétion, à l'écran de pause ---------- */

/* Liste « découverte » (atelier fait) mais où rien n'est encore validé : le bouton de tête de
   l'écran de choix lance le PARCOURS COMPLET (première complétion), pas un mode ciblé. Dix mots
   pour ne jamais finir la liste avant les 8 activités de la séance (donc la pause, jamais le
   bilan « Liste prête ! »). */
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
const LISTE = 'l-e2e-noel-pause';
const SEED_ORTHO = {
	banque: Object.fromEntries(
		MOTS.map((mot, i) => [
			`m${i + 1}`,
			{
				id: `m${i + 1}`,
				mot,
				entourage: [],
				atelierFait: true,
				validation: { motCache: false, tuiles: false, dictee: false },
				revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
				origine: 'liste',
			},
		]),
	),
	listes: [
		{
			id: LISTE,
			label: 'Liste de Noël',
			motIds: MOTS.map((_, i) => `m${i + 1}`),
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: Object.fromEntries(MOTS.map((mot, i) => [mot, `m${i + 1}`])),
};

/* Joue UNE activité du parcours (tuiles ou mot caché ; la dictée est indisponible sans voix en
   Chromium headless). Le mot n'est pas annoncé à l'avance : en mot caché on le lit à l'écran, en
   tuiles on le retrouve dans la liste d'après les lettres du bac. */
async function jouerActivite(page: Page): Promise<void> {
	if (
		await page
			.locator('#btnVerifTuiles')
			.isVisible()
			.catch(() => false)
	) {
		const lettres = (await page.locator('.tuiles-bac button.tuile').allInnerTexts()).map((l) =>
			l.trim(),
		);
		const trie = (s: string[]) => [...s].sort().join('');
		const mot = MOTS.find((m) => trie([...m]) === trie(lettres));
		if (!mot) throw new Error(`mot introuvable pour les tuiles « ${lettres.join('')} »`);
		for (const ch of mot) {
			await page
				.locator('.tuiles-bac button.tuile:not(.tuile-used)', { hasText: ch })
				.first()
				.click();
		}
		await page.locator('#btnVerifTuiles').click();
	} else {
		await expect(page.locator('#motAffiche')).toBeVisible();
		const mot = (await page.locator('#motAffiche').innerText()).trim();
		await page.locator('#btnCacher').click();
		await page.locator('#orthoInput').fill(mot);
		await page.locator('#btnVerifMot').click();
	}
	await page.locator('#fb button.btn-primary').click();
}

test('critère 23 (dictée, première complétion) : arrêtée à l’écran de pause « Bonne séance ! », la dictée annonce le trophée de Noël', async ({
	page,
}) => {
	test.setTimeout(90_000);
	const errors = watchErrors(page);
	await seedAideVue(page);
	await page.addInitScript(`localStorage.setItem('e2e/ludaskia_xp', '2000');`);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_ORTHO);

	await ouvrirAccueil(page, DATES.noel);
	const avant = await lireTropheesNoel(page);
	expect(avant.noel1.on).toBe(false);

	await gotoHash(page, `ortho-mode-${LISTE}`);
	const tete = page.locator('.mode-btn.recommended');
	// Garde de scénario : c'est bien le PARCOURS COMPLET (aucun mode ciblé), sinon on
	// testerait le chemin qui annonce déjà ses récompenses à la pause.
	await expect(tete).toBeVisible();
	expect(await tete.evaluate((el) => (el as HTMLElement).dataset.mode ?? '')).toBe('');
	await tete.click();

	const pause = page.getByRole('heading', { name: 'Bonne séance !' });
	const activiteOuPause = page.locator('#btnVerifTuiles, #btnCacher, #levelupOk').or(pause);
	for (let i = 0; i < 14; i++) {
		await activiteOuPause.first().waitFor();
		if (await pause.isVisible().catch(() => false)) break;
		if (await estAtteignable(page, '#levelupOk')) {
			await page.locator('#levelupOk').click();
			continue;
		}
		await jouerActivite(page);
	}
	await expect(pause).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Liste prête' })).toHaveCount(0);

	// La pause EST l'écran de fin de cette séance : elle annonce le trophée.
	const annonce = page.locator('#celebrate');
	await expect(annonce).toBeVisible();
	await expect(annonce).toContainText(avant.noel1.titre);
	expect(errors).toEqual([]);
});
