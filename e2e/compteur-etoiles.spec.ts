/* ============================================================
   Compteur d'étoiles de l'accueil (#559) — smoke e2e.
   ------------------------------------------------------------
   `#recLecon` (carte « Une leçon à la fois ») affiche désormais un texte
   décidé par un module pur, `core/compteur-etoiles.ts`, couvert par
   `tests/compteur-etoiles.test.ts`. Ces tests Vitest valident le MODULE,
   pas son BRANCHEMENT dans `ui/render.ts` : si `render.ts` avait gardé une
   copie inline de l'ancien texte, la suite logique resterait verte pendant
   que l'enfant lirait toujours « ⭐ 0/33 leçon réussie sans faute ». Zéro
   spec ne touchait `#recLecon` avant celle-ci.

   Deux défauts corrigés par #559, vus depuis l'écran :
   - critère 7 : plus aucun compteur ne sert un « 0 sur N » brut à un enfant
     qui démarre (« un 0 se lit comme une note ») ;
   - critère 4 : le compteur MONO-NIVEAU emploie désormais le mot « étoiles »
     (fini « leçons réussies sans faute »), avec la même protection du zéro.

   Sélecteurs stables : #recLecon, .rec-sub, .ans, #btnVerify, .mark.correct,
   #celebrateOk, #levelupOk.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Ferme les éventuelles modales de récompense (passage de niveau / célébration
   générique — dont l'étoile fait partie) qui intercepteraient le prochain clic.
   Un sans-faute déclenche systématiquement au moins la modale de célébration
   (même pattern que recap-seance.spec.ts, `fermerModalesRecompense`). */
async function fermerModalesRecompense(page: Page): Promise<void> {
	for (let i = 0; i < 5; i++) {
		const levelup = page.locator('#levelupOk');
		if (await levelup.isVisible().catch(() => false)) {
			await levelup.click();
			continue;
		}
		const celebrate = page.locator('#celebrateOk');
		if (await celebrate.isVisible().catch(() => false)) {
			await celebrate.click();
			continue;
		}
		break;
	}
}

/* Joue la fiche « num-comparer » (mode saisie par défaut, cf. numeration.spec.ts)
   jusqu'au sans-faute : remplit TOUS les champs `.ans` avec leur `data-answer`
   (une fiche mono-mode = 8 items, cf. `core/build.ts:genItems`), valide, referme
   les modales de récompense. Décroche une étoile pour cette leçon (niveau actif
   CE2, cf. `ENSURE_NIVEAU` dans helpers.ts). */
async function jouerNumComparerSansFaute(page: Page): Promise<void> {
	await gotoHash(page, 'lecon-num-comparer');
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const n = await fields.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const ans = await fields.nth(i).getAttribute('data-answer');
		expect(ans).not.toBeNull();
		await fields.nth(i).fill(ans ?? '');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await fermerModalesRecompense(page);
}

/* ---------- Critère 7 : jamais de « 0 sur N » ---------- */

test('critère 7 : un profil neuf ne lit jamais un « 0 sur N » sur le compteur d’étoiles', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	const rec = page.locator('#recLecon');
	await expect(rec).toBeVisible();
	const texte = await rec.innerText();
	expect(texte.trim()).not.toBe('');
	expect(texte).toContain('étoile');
	expect(texte).not.toContain('0/');

	expect(errors).toEqual([]);
});

/* ---------- Critère 4 : le mono-niveau parle d'étoiles ---------- */

test('critère 4 : après un sans-faute, le compteur mono-niveau parle d’étoiles (plus de « leçon(s) réussie(s) sans faute »)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await jouerNumComparerSansFaute(page);

	await gotoHash(page, 'accueil');
	const rec = page.locator('#recLecon');
	await expect(rec).toBeVisible();
	const texte = await rec.innerText();
	expect(texte).toContain('étoile');
	expect(texte).not.toContain('sans faute');
	expect(texte).not.toContain('leçon'); // ancien libellé disparu, pas seulement reformulé

	const m = texte.match(/(\d+)\/(\d+)/);
	expect(m).not.toBeNull();
	expect(Number(m![1])).toBeGreaterThanOrEqual(1); // l'étoile décrochée est bien comptée

	expect(errors).toEqual([]);
});

/* ---------- Critère 8 (bonus) : le cumul multi-niveaux reste mis en avant ---------- */

/* Sème directement une étoile à un AUTRE niveau (CM1) que le niveau actif (CE2,
   posé par `ENSURE_NIVEAU`/gotoHash) : `ludaskia_stars` namespace ses clés par
   `lessonId@niveau` (`nsKey`, `core/progress.ts`), et la clé elle-même est
   préfixée par le profil actif (`storage.ts:realKey`) — d'où `e2e/…`, l'uuid
   posé par défaut par `ENSURE_NIVEAU`. `num-comparer` existe aux deux niveaux
   (cf. `data/maths/numeration.ts`), donc la clé est valide sans dépendre d'un id
   CM1-only qui pourrait disparaître. Sans étoile au niveau actif, le cumul (1)
   dépasse le scopé (0) : bascule en branche multi-niveaux. */
test('critère 8 : une étoile à un autre niveau met en avant le cumul, avec l’objectif de la classe en sous-ligne', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(() => {
		localStorage.setItem('e2e/ludaskia_stars', JSON.stringify({ 'num-comparer@cm1': 1 }));
	});
	await gotoHash(page, 'accueil');

	const rec = page.locator('#recLecon');
	await expect(rec).toBeVisible();
	const texte = await rec.innerText();
	expect(texte).toContain('étoile');
	expect(texte).not.toContain('0/'); // critère 7, tenu aussi dans cette branche

	const sub = rec.locator('.rec-sub');
	await expect(sub).toBeVisible();
	await expect(sub).toContainText('CE2'); // objectif de la classe ACTIVE, pas celle où l'étoile a été gagnée

	expect(errors).toEqual([]);
});
