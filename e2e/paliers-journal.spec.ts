/* ============================================================
   Journal des paliers (#397/#521) — écriture RÉELLE par une session
   JOUÉE dans l'interface, pas semée à la main. Toute la couverture
   existante de la frise d'états de l'espace encadrant (encadrant.spec.ts)
   part de données seedées directement dans `localStorage`, ou de tests
   Vitest qui appellent `recordMonteesPalier` en direct. Rien ne vérifiait
   que jouer une leçon écrit bien les deux clés dont la frise dépend :
   `ludaskia_paliers` (franchissements datés, namespacés `id@niveau`) et
   `ludaskia_paliersDepuis` (borne de mise en service du journal, par
   profil). C'est l'invariant STRUCTUREL documenté dans `core/progress.ts`
   (recordLessonStats) : la frise déduit l'état d'une semaine de l'ABSENCE
   d'horodatage, ce qui n'est vrai que si TOUT chemin qui écrit des stats
   de leçon journalise aussi les paliers. Un round-trip réel referme ce
   trou côté rendu, comme erreurs-encadrant.spec.ts le fait déjà pour le
   journal des erreurs.

   Écriture DIFFÉRÉE en microtâche (recordLessonStats appelle
   `queueMicrotask(() => recordMonteesPalier(...))`, une fois l'étoile déjà
   écrite, dont dépend l'état « acquis »). Donc AVANT toute I/O mais PAS
   dans le même tour synchrone que le dernier clic : on lit le localStorage
   après que l'écran de résultat (#resultBanner) s'est affiché, jamais dans
   l'instant qui suit le clic — le rendu de ce bandeau passe forcément par
   un flush des microtâches avant de peindre, ce qui suffit à garantir
   l'ordre sans `waitForTimeout` magique. */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Leçon « Comparer les nombres » en saisie (fiche à champs `.ans` + signes) :
   déjà le pivot du round-trip de erreurs-encadrant.spec.ts (stable, CE2+CM1,
   un seul écran, un seul #btnVerify referme tout l'essai — pas de navigation
   multi-questions à piloter comme un runner QCM). */
test('round-trip : une session sans faute écrit le journal des paliers (acquis + borne de mise en service)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await gotoHash(page, 'lecon-num-comparer');

	const fields = page.locator('#sheets input.ans');
	const n = await fields.count();
	expect(n).toBeGreaterThan(0);
	// Remplit CHAQUE champ avec sa VRAIE réponse (`data-answer`, jamais recalculée) :
	// sans-faute garanti sans dépendre du tirage aléatoire de la fiche.
	for (let i = 0; i < n; i++) {
		const f = fields.nth(i);
		const ans = await f.getAttribute('data-answer');
		await f.fill(ans ?? '');
	}
	await page.locator('#btnVerify').click();

	// Écran de résultat rendu : l'essai est sans faute (aucune marque `.mark.wrong`).
	await expect(page.locator('#resultBanner')).toBeVisible();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await expect(page.locator('.mark.wrong')).toHaveCount(0);

	const { paliers, depuis } = await page.evaluate(() => ({
		paliers: JSON.parse(localStorage.getItem('e2e/ludaskia_paliers') || 'null'),
		depuis: JSON.parse(localStorage.getItem('e2e/ludaskia_paliersDepuis') || 'null'),
	}));

	// Borne de mise en service : posée par CETTE session (1re fois du profil e2e).
	expect(typeof depuis).toBe('number');
	expect(depuis).toBeGreaterThan(0);

	// Franchissement daté sur la leçon RÉELLEMENT jouée, namespacé par niveau (CE2,
	// niveau de référence par défaut du profil e2e) — pas une autre leçon du catalogue.
	expect(paliers).not.toBeNull();
	const notion = paliers['num-comparer@ce2'];
	expect(notion).toBeTruthy();
	// Sans-faute → étoile posée avant que la microtâche ne journalise le palier →
	// l'état déduit (niveauNotion) est directement « acquis » (jamais « en cours »
	// d'abord : un saut direct ne fabrique pas rétroactivement la marche intermédiaire).
	expect(typeof notion.acquis).toBe('number');
	// La borne et ce franchissement partagent le même instant `now` capturé une seule
	// fois par recordLessonStats (cf. core/progress.ts) : ils doivent coïncider.
	expect(notion.acquis).toBe(depuis);

	expect(errors).toEqual([]);
});
